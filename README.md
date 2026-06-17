# aiko animal PARK

Cloudflare Pages / PARK source for the aiko animal public surfaces.

This repository is currently prepared as a minimal recovery baseline for the
free gift ticket flow:

- public reception and ticket page: `public/uchinoko-reception.html`
- reception/ticket browser logic: `public/uchinoko-reception.js`
- Cloudflare Pages Functions: `functions/`
- free gift art assets: `public/images/uchinoko-gift-*`
- Instagram carousel fixed assets: `public/assets/gift-instagram/photo-to-illustration-cover.png` and `profile-link-cta.png`

Large historical media archives and local generated files are intentionally
ignored. They are not required for the free gift ticket path and can contain
old campaign/customer-facing filenames.

## Free Gift Architecture

```text
Cloudflare Pages / PARK
  /uchinoko-gift, /gift/*
  functions/createGiftReception.js
  functions/getGiftTicket.js
  functions/gift*.js
  functions/lib/gift-cloudflare.js

Local HQ
  C:\Users\genge\aikoanimal-hosting-new
  http://127.0.0.1:17776/gift-tickets.html
```

Firebase is not the source of truth for this free gift ticket flow.
Cloudflare `GIFT_KV` is the active storage in the current setup. The code can
also use D1/R2 if `GIFT_DB` and `GIFT_IMAGES` bindings are configured.

After a free gift is posted to `@uchinoko.aiko`, image assets should be deleted
from Cloudflare. The ticket record remains so the customer page can explain
that the image publication period has ended.

## Required Secrets

Do not commit these values.

- Cloudflare Pages secret: `GIFT_ADMIN_KEY`
- Optional Turnstile secrets: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- Local HQ admin key, one of:
  - `AIKO_GIFT_ADMIN_KEY`
  - `GIFT_ADMIN_KEY`
  - `CLOUDFLARE_GIFT_ADMIN_KEY`
  - `local-ops/data/secrets/gift-admin-key.txt` in the Local HQ repo

The value of Local HQ's gift admin key must match Cloudflare's
`GIFT_ADMIN_KEY`.

## New PC Setup

1. Install Git and Node.js 22 or newer.
2. Clone this PARK repo and run `npm install`.
3. Clone `aikoanimal-hosting-new` and run `npm install` there if needed.
4. Log in to Cloudflare Wrangler on the new PC.
5. Restore the Local HQ gift admin key locally. Do not put it in Git.
6. Start Local HQ:

```powershell
cd C:\Users\YOUR_USER\aikoanimal-hosting-new
.\scripts\start-local-ops.ps1 -EnableGiftCloudflareWrite
```

7. Open:

```text
http://127.0.0.1:17776/gift-tickets.html
```

For automatic Instagram posting from Local HQ, also enable the gift Instagram
scheduler and prepare either the dedicated browser login or Instagram API
credentials in Local HQ local secrets.

```powershell
.\scripts\start-local-ops.ps1 -EnableGiftCloudflareWrite -EnableGiftInstagramPostScheduler
```

Manual Cloudflare image cleanup requires the confirmation text:

```text
DELETE_GIFT_IMAGES
```

## Checks

```powershell
npm run build
node --check functions/lib/gift-cloudflare.js
node --check functions/giftAdminCleanupAssets.js
node --check public/uchinoko-reception.js
```

Deployment is separate from local Git commits. Deploy only after an explicit
release decision.
