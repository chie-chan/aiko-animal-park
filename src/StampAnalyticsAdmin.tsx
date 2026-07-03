import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import "./stamp-analytics-admin.css";

type CountItem = { key: string; count: number };
type DailyRow = {
  date: string;
  events: number;
  visitors: number;
  sessions: number;
  downloads: number;
  promptCopies: number;
};
type UserRow = {
  visitorId: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  events: number;
  sessions: number;
  daysActive: number;
  lastEvent: string;
  isNew: boolean;
  isReturning: boolean;
  topEvents: CountItem[];
};
type ToolUsageRow = {
  path: string;
  events: number;
  visitors: number;
  sessions: number;
  downloads: number;
  promptCopies: number;
  imports: number;
};
type RecentEvent = {
  event: string;
  at: string;
  path?: string;
  visitorLabel: string;
  meta: Record<string, string | number | boolean | null>;
};
type AnalyticsResponse = {
  ok: boolean;
  summary: {
    days: number;
    events: number;
    visitors: number;
    sessions: number;
    newVisitors: number;
    returningVisitors: number;
    downloads: number;
    promptCopies: number;
    sheetImports: number;
    batchImports: number;
    mobileImports?: number;
  };
  topEvents: CountItem[];
  toolUsage?: ToolUsageRow[];
  daily: DailyRow[];
  users: UserRow[];
  recentEvents: RecentEvent[];
};

const ADMIN_KEY_STORAGE = "aiko-animal:stamp-v2-admin-key";

const EVENT_LABELS: Record<string, string> = {
  page_view: "ページ表示",
  step_view: "ステップ表示",
  prompt_room_open: "プロンプト画面",
  prompt_copy: "プロンプトコピー",
  import_complete: "画像取り込み",
  background_auto: "背景透過：自動",
  background_color: "背景透過：色クリック",
  background_eraser: "背景透過：消しゴム",
  background_batch_auto: "40枚：自動透過",
  background_batch_color: "40枚：色を全画像へ",
  placement_reorder: "画像配置：並び替え",
  placement_nudge: "画像配置：移動",
  placement_zoom: "画像配置：拡大",
  placement_reset: "画像配置：リセット",
  export_zip: "ZIPダウンロード",
};

const MOBILE_EVENT_LABELS: Record<string, string> = {
  mobile_prompt_copy: "Mobile prompt copy",
  mobile_cut_line_move: "Mobile cut line move",
  mobile_center: "Mobile center",
  mobile_eraser: "Mobile eraser",
  mobile_stock_add: "Mobile sheet append",
  mobile_stock_clear: "Mobile stock clear",
  mobile_share_all: "Mobile save all",
  mobile_share_one: "Mobile share one",
  mobile_download_one: "Mobile save one",
};

function labelEvent(key: string) {
  return EVENT_LABELS[key] || MOBILE_EVENT_LABELS[key] || key;
}

function fmtDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function labelPath(path: string) {
  if (path === "/stamp-room") return "PC /stamp-room";
  if (path === "/stamp-mobile") return "Mobile /stamp-mobile";
  if (path === "/stamp-v2") return "Old V2 /stamp-v2";
  if (path === "/stamp-room-trial") return "Trial /stamp-room-trial";
  return path || "-";
}

export default function StampAnalyticsAdmin() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const maxDailyEvents = useMemo(
    () => Math.max(1, ...(data?.daily || []).map((row) => row.events)),
    [data],
  );

  async function load(nextDays = days, key = adminKey) {
    const trimmed = key.trim();
    if (!trimmed) {
      setError("管理キーを入力してください。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/stampAnalyticsAdmin?days=${nextDays}`, {
        headers: { "x-aiko-gift-admin-key": trimmed },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(response.status === 401 ? "管理キーが違います。" : "集計APIを読み込めませんでした。");
      }
      sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
      setAdminKey(trimmed);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "集計を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(days, adminKey);
  }

  useEffect(() => {
    if (adminKey) void load(days, adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <main className="stamp-admin-page">
      <section className="stamp-admin-head">
        <div>
          <p className="stamp-admin-kicker">STAMP TOOL ANALYTICS</p>
          <h1>スタンプ仕上げ室 管理画面</h1>
        </div>
        <form className="stamp-admin-auth" onSubmit={submit}>
          <input
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="管理キー"
            aria-label="管理キー"
          />
          <button type="submit" disabled={loading}>{loading ? "読込中" : "更新"}</button>
        </form>
      </section>

      <div className="stamp-admin-period" role="group" aria-label="集計期間">
        {[7, 30, 90].map((item) => (
          <button
            key={item}
            type="button"
            className={days === item ? "is-active" : ""}
            onClick={() => setDays(item)}
          >
            {item}日
          </button>
        ))}
      </div>

      {error && <p className="stamp-admin-error">{error}</p>}

      {data && (
        <>
          <section className="stamp-admin-metrics" aria-label="概要">
            <Metric label="利用イベント" value={data.summary.events} />
            <Metric label="利用者" value={data.summary.visitors} sub={`新規 ${data.summary.newVisitors} / リピート ${data.summary.returningVisitors}`} />
            <Metric label="セッション" value={data.summary.sessions} />
            <Metric label="ZIP保存" value={data.summary.downloads} sub={`利用者比 ${pct(data.summary.downloads, data.summary.visitors)}`} />
            <Metric label="プロンプトコピー" value={data.summary.promptCopies} />
            <Metric label="取り込み" value={data.summary.sheetImports + data.summary.batchImports + (data.summary.mobileImports ?? 0)} sub={`PC ${data.summary.sheetImports + data.summary.batchImports} / Mobile ${data.summary.mobileImports ?? 0}`} />
          </section>

          <section className="stamp-admin-grid">
            <Panel title="Tool / URL">
              <div className="stamp-admin-rank">
                {(data.toolUsage ?? []).map((item) => (
                  <div key={item.path} className="stamp-admin-tool-row">
                    <div>
                      <strong>{labelPath(item.path)}</strong>
                      <small>
                        {item.visitors} users / {item.sessions} sessions / {item.imports} imports / {item.downloads} saves
                      </small>
                    </div>
                    <span>{item.events}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="よく使われた機能">
              <div className="stamp-admin-rank">
                {data.topEvents.map((item) => (
                  <div key={item.key} className="stamp-admin-rank-row">
                    <span>{labelEvent(item.key)}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="日別推移">
              <div className="stamp-admin-daily">
                {data.daily.map((row) => (
                  <div key={row.date} className="stamp-admin-day-row">
                    <span>{row.date.slice(5)}</span>
                    <div>
                      <i style={{ width: `${Math.max(4, (row.events / maxDailyEvents) * 100)}%` }} />
                    </div>
                    <strong>{row.events}</strong>
                    <small>{row.visitors}人</small>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <Panel title="匿名ユーザー">
            <div className="stamp-admin-table-wrap">
              <table className="stamp-admin-table">
                <thead>
                  <tr>
                    <th>匿名ID</th>
                    <th>区分</th>
                    <th>初回</th>
                    <th>最終</th>
                    <th>日数</th>
                    <th>回数</th>
                    <th>最後の操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.visitorId}>
                      <td>{user.label}</td>
                      <td>{user.isNew ? "新規" : user.isReturning ? "リピート" : "既存"}</td>
                      <td>{fmtDateTime(user.firstSeen)}</td>
                      <td>{fmtDateTime(user.lastSeen)}</td>
                      <td>{user.daysActive}</td>
                      <td>{user.events}</td>
                      <td>{labelEvent(user.lastEvent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="直近イベント">
            <div className="stamp-admin-events">
              {data.recentEvents.slice(0, 30).map((event, index) => (
                <div key={`${event.at}-${index}`} className="stamp-admin-event-row">
                  <span>{fmtDateTime(event.at)}</span>
                  <strong>{labelEvent(event.event)}</strong>
                  <small>{labelPath(event.path || "")} / {event.visitorLabel}</small>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <article className="stamp-admin-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString("ja-JP")}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stamp-admin-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
