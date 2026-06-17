(function () {
  "use strict";

  const TICKET_REFRESH_MS = 3 * 60 * 1000;

  const state = {
    photoFile: null,
    photoBase64: "",
    ticketSlug: "",
    ticketDone: false,
    ticketRefreshTimer: 0,
    ticketVisibilityBound: false,
    config: {
      rushBaseUrl: "https://aikoanimal.base.shop/items/146802769",
      paidOrderUrl: "https://aikoanimal.base.shop/items/146802769",
      lineUrl: "https://lin.ee/hsoPQut",
      instagramAccount: "@uchinoko.aiko",
    },
    freeReception: null,
    turnstile: {
      enabled: false,
      siteKey: "",
      token: "",
      widgetId: null,
      ready: false,
    },
    botGate: {
      startedAt: Date.now(),
    },
  };

  const $ = (id) => document.getElementById(id);
  const UPLOAD_DEFAULT_HTML = "<span><strong>📷 タップして写真をえらぶ</strong><span>ペットだけが写っていて、元写真として公開OKな一枚をえらんでね🐾</span></span>";
  const UPLOAD_CLOSED_HTML = '<img class="upload-closed-art" src="/images/uchinoko-gift-closed.webp" alt="本日の無料枠は終了しました">';

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function showNotice(el, message, type) {
    if (!el) return;
    el.textContent = message || "";
    el.className = "notice show" + (type ? " " + type : "");
  }

  function hideNotice(el) {
    if (!el) return;
    el.textContent = "";
    el.className = "notice";
  }

  function ticketSlugFromUrl() {
    const pathMatch = location.pathname.match(/\/gift\/([^/?#]+)/);
    if (pathMatch) return decodeURIComponent(pathMatch[1]);
    return new URLSearchParams(location.search).get("ticket") || "";
  }

  function normalizeInstagramId(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/^@+/, "")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/\/.*$/, "");
  }

  function hasContactInfo(value) {
    const raw = String(value || "");
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)) return true;
    return raw.replace(/[^\d]/g, "").length >= 10;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "request_failed");
      error.payload = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadStats() {
    try {
      const data = await fetchJson("/giftReceptionStats");
      const stats = data.stats || {};
      state.config = {...state.config, ...(data.config || {})};
      state.freeReception = data.freeReception || null;
      setText("waitCount", String(stats.waitingCount ?? "--"));
      setText("etaText", stats.etaText || "--");
      updateConfigLinks();
      renderReceptionAvailability();
    } catch (error) {
      setText("waitCount", "--");
      setText("etaText", "確認中");
      console.warn("gift stats failed", error);
    }
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (window.turnstile) {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, {once: true});
        existing.addEventListener("error", reject, {once: true});
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", resolve, {once: true});
      script.addEventListener("error", reject, {once: true});
      document.head.appendChild(script);
    });
  }

  async function loadTurnstileConfig() {
    try {
      const data = await fetchJson("/turnstileConfig");
      state.turnstile.enabled = data.enabled === true && Boolean(data.siteKey);
      state.turnstile.siteKey = data.siteKey || "";
      if (state.turnstile.enabled) await renderTurnstile();
    } catch (error) {
      console.warn("[gift] turnstile config skipped", error);
    }
  }

  async function renderTurnstile() {
    const gate = $("turnstileGate");
    if (!gate || state.turnstile.ready || !state.turnstile.siteKey) return;
    gate.classList.add("is-active", "is-loading");
    try {
      await loadScriptOnce("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
      if (!window.turnstile) throw new Error("turnstile_missing");
      gate.classList.remove("is-loading");
      state.turnstile.widgetId = window.turnstile.render(gate, {
        sitekey: state.turnstile.siteKey,
        theme: "light",
        action: "gift_reception",
        callback(token) {
          state.turnstile.token = token || "";
        },
        "expired-callback"() {
          state.turnstile.token = "";
        },
        "error-callback"() {
          state.turnstile.token = "";
        },
      });
      state.turnstile.ready = true;
    } catch (error) {
      console.error("[gift] turnstile render failed", error);
      state.turnstile.enabled = false;
      state.turnstile.token = "";
      gate.classList.remove("is-active", "is-loading");
    }
  }

  function resetTurnstile() {
    if (!state.turnstile.enabled || !window.turnstile || state.turnstile.widgetId === null) return;
    state.turnstile.token = "";
    try {
      window.turnstile.reset(state.turnstile.widgetId);
    } catch (error) {
      console.warn("[gift] turnstile reset skipped", error);
    }
  }

  function updateConfigLinks() {
    const paid = $("paidOrderLink");
    const rush = $("rushBtn");
    const line = $("lineBtn");
    if (paid) paid.href = state.config.paidOrderUrl || state.config.rushBaseUrl || "https://aikoanimal.base.shop/items/146802769";
    if (rush) rush.href = state.config.rushBaseUrl || "https://aikoanimal.base.shop/items/146802769";
    if (line && state.config.lineUrl) {
      line.href = state.config.lineUrl;
      line.hidden = false;
    }
  }

  function freeClosedMessage() {
    return state.freeReception?.message || "本日の無料枠は終了しました。明日また受付します。優先制作は受付中です。";
  }

  function resetUploadBox(isClosed) {
    const box = $("uploadBox");
    if (!box) return;
    box.classList.remove("has-image");
    box.classList.toggle("is-disabled", Boolean(isClosed));
    box.setAttribute("aria-disabled", isClosed ? "true" : "false");
    box.innerHTML = isClosed ? UPLOAD_CLOSED_HTML : UPLOAD_DEFAULT_HTML;
  }

  function setFreeFormClosed(isClosed) {
    const disabledIds = ["photoInput", "petName", "petCount", "species", "breed", "freeNote", "instagramId", "okShare", "submitBtn"];
    disabledIds.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = isClosed;
    });
    document.querySelectorAll("input[name='taste'], input[name='plan']").forEach((input) => {
      input.disabled = isClosed;
      const choice = input.closest(".choice");
      if (choice) choice.classList.toggle("is-disabled", isClosed);
    });
    if (isClosed) {
      state.photoFile = null;
      state.photoBase64 = "";
      const photo = $("photoInput");
      if (photo) photo.value = "";
      resetUploadBox(true);
      const submit = $("submitBtn");
      if (submit) submit.textContent = "本日の無料枠は終了しました";
    } else if (!state.photoBase64) {
      resetUploadBox(false);
    }
  }

  function renderReceptionAvailability() {
    const notice = $("availabilityNotice");
    const normal = document.querySelector('input[name="plan"][value="normal"]');
    const rush = document.querySelector('input[name="plan"][value="rush"]');
    const isClosed = Boolean(state.freeReception && state.freeReception.isClosed);

    if (isClosed) {
      if (normal && normal.checked && rush) rush.checked = true;
      showNotice(notice, freeClosedMessage(), "error");
    } else {
      hideNotice(notice);
    }
    setFreeFormClosed(isClosed);
    updateSubmitButtonLabel();
  }

  function updateSubmitButtonLabel() {
    const submit = $("submitBtn");
    if (!submit || submit.disabled) return;
    submit.textContent = readSelected("plan") === "rush" ?
      "⚡ BASEで優先制作を申し込む" :
      "🎟️ 整理券をうけとる";
  }

  function readSelected(name) {
    const input = document.querySelector(`input[name="${name}"]:checked`);
    return input ? input.value : "";
  }

  function updateGalleryField() {
    const field = $("galleryField");
    if (!field) return;
    field.hidden = readSelected("taste") !== "gallery_reference";
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function compressPhoto(file) {
    const img = await fileToImage(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(img.src);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    return {
      previewUrl: dataUrl,
      base64: dataUrl.split(",")[1] || "",
    };
  }

  async function handlePhoto(file) {
    const notice = $("formNotice");
    hideNotice(notice);
    if (state.freeReception?.isClosed) {
      resetUploadBox(true);
      showNotice(notice, freeClosedMessage(), "error");
      return;
    }
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) {
      showNotice(notice, "画像ファイルを選択してください。", "error");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      showNotice(notice, "写真が大きすぎます。12MB以下の画像でお試しください。", "error");
      return;
    }
    const box = $("uploadBox");
    box.innerHTML = "<span><strong>写真をよみこみ中…</strong><span>ちょっとだけ待っててね🐾</span></span>";
    try {
      const compressed = await compressPhoto(file);
      state.photoFile = file;
      state.photoBase64 = compressed.base64;
      box.classList.add("has-image");
      box.innerHTML = `<img src="${compressed.previewUrl}" alt="選択した写真">`;
    } catch (error) {
      console.error(error);
      showNotice(notice, "写真を読み込めませんでした。別の画像でお試しください。", "error");
      resetUploadBox(false);
    }
  }

  function validateForm() {
    const petName = $("petName").value.trim();
    const petCount = $("petCount").value.trim();
    const species = ($("species") ? $("species").value.trim() : "") || "ペット";
    const breed = $("breed").value.trim();
    const freeNote = $("freeNote").value.trim();
    const instagramId = normalizeInstagramId($("instagramId").value);
    const taste = readSelected("taste");
    const galleryCode = ($("galleryCode") ? $("galleryCode").value : "").trim();
    const plan = readSelected("plan") || "normal";
    const okShare = $("okShare").checked;

    if (!state.photoBase64) return {error: "うちの子のお写真をえらんでね📷"};
    if (!petName) return {error: "うちの子のおなまえを教えてね🐾"};
    if (!petCount) return {error: "写真に写ってるペットの数をえらんでね🐾"};
    if (!/^[A-Za-z0-9._]{1,30}$/.test(instagramId)) return {error: "Instagram IDを正しく入力してください。"};
    if (taste === "gallery_reference" && !galleryCode) return {error: "ギャラリー番号を入力してください。"};
    if (!okShare) return {error: "無料プレゼントは、元写真・完成作品・Instagram IDの掲載同意が必要です。非公開の希望は有料オーダーへどうぞ。"};
    if (state.freeReception?.isClosed && plan !== "rush") return {error: freeClosedMessage()};
    if ([petName, species, breed, freeNote, instagramId].some(hasContactInfo)) {
      return {error: "個人情報が入っていないか確認して、もう一度送信してください。"};
    }
    if (state.turnstile.enabled && !state.turnstile.token) {
      return {error: "送信前の確認が終わってから、もう一度お試しください。"};
    }

    return {
      payload: {
        photoBase64: state.photoBase64,
        petName,
        petCount,
        species,
        breed,
        freeNote,
        instagramId,
        taste,
        galleryCode,
        plan,
        okShare,
        turnstileToken: state.turnstile.token,
        botGate: {
          startedAt: state.botGate.startedAt,
          submittedAt: Date.now(),
          field: $("website") ? $("website").value : "",
        },
      },
    };
  }

  async function submitForm(event) {
    event.preventDefault();
    const notice = $("formNotice");
    const submit = $("submitBtn");
    hideNotice(notice);

    if (readSelected("plan") === "rush") {
      const url = state.config.paidOrderUrl || state.config.rushBaseUrl || "https://aikoanimal.base.shop/items/146802769";
      location.href = url;
      return;
    }

    const result = validateForm();
    if (result.error) {
      showNotice(notice, result.error, "error");
      return;
    }

    submit.disabled = true;
    submit.textContent = "整理券を準備中…🎟️";
    try {
      const data = await fetchJson("/createGiftReception", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(result.payload),
      });
      const ticket = data.ticket || {};
      state.ticketSlug = ticket.slug || "";
      if (state.ticketSlug) {
        history.replaceState(null, "", `/gift/${encodeURIComponent(state.ticketSlug)}`);
      }
      renderTicket(ticket, true);
      $("formPanel").hidden = true;
      $("ticketPanel").hidden = false;
      $("ticketPanel").scrollIntoView({behavior: "smooth", block: "start"});
    } catch (error) {
      const payload = error.payload || {};
      if (payload.error === "duplicate_instagram" && payload.ticket) {
        const ticket = payload.ticket || {};
        state.ticketSlug = ticket.slug || "";
        if (state.ticketSlug) {
          history.replaceState(null, "", `/gift/${encodeURIComponent(state.ticketSlug)}`);
        }
        renderTicket(ticket, false, "duplicate");
        $("formPanel").hidden = true;
        $("ticketPanel").hidden = false;
        $("ticketPanel").scrollIntoView({behavior: "smooth", block: "start"});
        return;
      }
      if (payload.freeReception) {
        state.freeReception = payload.freeReception;
        renderReceptionAvailability();
      }
      const message = friendlyError(payload.error || error.message);
      showNotice(notice, message, "error");
      resetTurnstile();
    } finally {
      submit.disabled = false;
      updateSubmitButtonLabel();
    }
  }

  function friendlyError(code) {
    const map = {
      share_consent_required: "無料プレゼントは、送信した写真を元写真として公開する掲載同意が必要です。",
      missing_photo: "写真を選択してください。",
      invalid_photo: "写真を読み込めませんでした。別の画像でお試しください。",
      photo_too_large: "写真が大きすぎます。別の画像でお試しください。",
      contact_info_not_allowed: "個人情報が入っていないか確認して、もう一度送信してください。",
      instagram_required: "Instagram IDを入力してください。",
      gallery_code_required: "ギャラリー番号を入力してください。",
      daily_free_closed: "本日の無料枠は終了しました。明日また受付します。優先制作は受付中です。",
      duplicate_instagram: "このInstagram IDではすでに受付済みです。前回の整理券を表示します。",
      paid_order_required: "優先制作・非公開希望はBASEの有料オーダーからお願いします。",
      turnstile_required: "送信前の確認が終わってから、もう一度お試しください。",
      turnstile_failed: "送信前の確認に失敗しました。ページを読み直してもう一度お試しください。",
      turnstile_unavailable: "送信前の確認を準備中です。少し時間をおいてお試しください。",
      bot_gate_failed: "送信前の確認に失敗しました。ページを読み直してもう一度お試しください。",
    };
    return map[code] || "送信に失敗しました。少し時間をおいてもう一度お試しください。";
  }

  function statusLabel(status) {
    if (status === "done") return "かんせい🎉";
    if (status === "processing") return "せいさく中🎨";
    if (status === "error") return "確認中";
    return "じゅんばん待ち";
  }

  function renderTicket(ticket, justCreated, context) {
    const stats = ticket.stats || {};
    const downloadsClosed = Boolean(ticket.downloadsClosed || ticket.imageAssetsDeletedAt);
    state.config = {...state.config, ...(ticket.config || {})};
    state.ticketDone = ticket.isDone || ticket.status === "done";
    updateConfigLinks();
    if (state.ticketDone) stopTicketRefresh();

    const slug = ticket.slug || state.ticketSlug;
    const absoluteTicketUrl = slug ? `${location.origin}/gift/${encodeURIComponent(slug)}` : location.href;
    const isDuplicate = context === "duplicate";
    setText("ticketTitle", ticket.isDone ? "できあがりました🎉" : isDuplicate ? "受付済みです🎟️" : justCreated ? "整理券をうけとりました🎟️" : "整理券ページです🎟️");
    setText("ticketLead", ticket.isDone ? "下の画像からダウンロードできます🎁" : isDuplicate ? "このInstagram IDではすでに受付済みです。前回の整理券ページを表示しています。" : "完成したらこのページからダウンロードできます。完成まではこのURLを保存しておいてね。");
    setText("ticketNo", `No. ${ticket.ticketNo || "--"}`);
    setText("aheadCount", String(stats.aheadCount ?? "--"));
    setText("ticketEta", stats.etaText || "--");
    setText("ticketStatus", statusLabel(ticket.status));
    setText("ticketPet", ticket.petName ? `${ticket.petName}ちゃんの整理券` : "うちの子の整理券");
    setText("ticketMeta", `${ticket.styleLabel || "水彩イラスト"} / @${ticket.instagramId || ""}`);

    if (downloadsClosed) {
      setText("ticketTitle", "公開期間が終了しました");
      setText("ticketLead", "Instagram掲載後の整理のため、画像の公開は終了しました。");
    }

    const notice = $("ticketNotice");
    showNotice(
      notice,
      isDuplicate ?
        "2回目の送信は受け付けず、前回の整理券ページを表示しました。写真や内容は上書きしていません。" :
        justCreated ? "このURLを保存してね🎟️ 完成したらここに画像が表示されます。" : "このURLを保存しておいてね。完成したらここからダウンロードできます。",
      "ok",
    );
    notice.dataset.ticketUrl = absoluteTicketUrl;
    const urlInput = $("ticketUrlInput");
    const openLink = $("openTicketLink");
    if (urlInput) urlInput.value = absoluteTicketUrl;
    if (openLink) openLink.href = absoluteTicketUrl;

    const grid = $("downloadGrid");
    const designs = Array.isArray(ticket.designs) ? ticket.designs : [];
    if (downloadsClosed) {
      grid.hidden = false;
      grid.innerHTML = `
        <div class="download-card">
          <strong>画像公開は終了しました</strong>
          <p>Instagram掲載後の整理のため、ダウンロード画像は削除済みです。</p>
        </div>
      `;
    } else if (ticket.isDone && designs.length) {
      grid.hidden = false;
      grid.innerHTML = designs.map((item, index) => {
        const fileName = `uchinoko-gift-${index + 1}.jpg`;
        return `
          <div class="download-card">
            <img src="${escapeAttr(item.url)}" alt="完成画像 ${index + 1}">
            <a href="${escapeAttr(item.url)}" download="${escapeAttr(fileName)}" target="_blank" rel="noopener">JPG画像${index + 1}を開く/保存</a>
          </div>
        `;
      }).join("");
    } else {
      grid.hidden = true;
      grid.innerHTML = "";
    }
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function loadTicket(slug) {
    state.ticketSlug = slug;
    $("formPanel").hidden = true;
    $("ticketPanel").hidden = false;
    try {
      const data = await fetchJson(`/getGiftTicket?slug=${encodeURIComponent(slug)}`);
      renderTicket(data.ticket || {}, false);
    } catch (error) {
      showNotice($("ticketNotice"), "整理券が見つかりませんでした。URLをご確認ください。", "error");
      setText("ticketTitle", "整理券が見つかりません");
      setText("ticketLead", "URLが途中で切れていないか確認してください。");
    }
  }

  function stopTicketRefresh() {
    if (!state.ticketRefreshTimer) return;
    window.clearInterval(state.ticketRefreshTimer);
    state.ticketRefreshTimer = 0;
  }

  async function refreshTicketIfVisible(slug, force) {
    if (!slug || state.ticketDone) {
      stopTicketRefresh();
      return;
    }
    if (!force && document.hidden) return;
    await loadTicket(slug);
  }

  function handleTicketVisibilityChange() {
    if (!document.hidden && state.ticketSlug && !state.ticketDone) {
      refreshTicketIfVisible(state.ticketSlug, true);
    }
  }

  function startTicketRefresh(slug) {
    stopTicketRefresh();
    if (!slug || state.ticketDone) return;
    if (!state.ticketVisibilityBound) {
      document.addEventListener("visibilitychange", handleTicketVisibilityChange);
      state.ticketVisibilityBound = true;
    }
    state.ticketRefreshTimer = window.setInterval(() => refreshTicketIfVisible(slug, false), TICKET_REFRESH_MS);
  }

  async function copyTicketUrl() {
    const url = $("ticketNotice").dataset.ticketUrl || location.href;
    try {
      await navigator.clipboard.writeText(url);
      showNotice($("ticketNotice"), "整理券URLをコピーしました。", "ok");
    } catch (_) {
      const input = $("ticketUrlInput");
      if (input) {
        input.focus();
        input.select();
      }
      showNotice($("ticketNotice"), "コピーできない時は、下のURL欄を長押しして保存するか、この画面をスクショしてね。", "ok");
    }
  }

  function bind() {
    $("photoInput").addEventListener("change", (event) => {
      handlePhoto(event.target.files && event.target.files[0]);
    });
    document.querySelectorAll("input[name='taste']").forEach((input) => {
      input.addEventListener("change", updateGalleryField);
    });
    document.querySelectorAll("input[name='plan']").forEach((input) => {
      input.addEventListener("change", updateSubmitButtonLabel);
    });
    $("giftForm").addEventListener("submit", submitForm);
    $("copyTicketBtn").addEventListener("click", copyTicketUrl);
    $("ticketUrlInput").addEventListener("focus", (event) => event.target.select());
    $("ticketUrlInput").addEventListener("click", (event) => event.target.select());
    updateGalleryField();
  }

  async function init() {
    bind();
    await loadStats();
    const slug = ticketSlugFromUrl();
    if (slug) {
      const hero = document.getElementById("hero");
      if (hero) hero.hidden = true;
      document.body.classList.add("ticket-only");
      window.scrollTo(0, 0);
      await loadTicket(slug);
      startTicketRefresh(slug);
    } else {
      await loadTurnstileConfig();
    }
  }

  init();
})();
