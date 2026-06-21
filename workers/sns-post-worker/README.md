# Aiko SNS Post Worker

Cloudflare Worker for Threads/Instagram reserved posting.

This worker is separate from the PARK Pages project because Cloudflare Cron
Triggers run on Workers. It reuses the existing PARK `GIFT_KV` namespace through
the `SNS_KV` binding and stores SNS queue items under `snsapi:queue:*`.

## Safety

- Default config has `SNS_API_POSTING_ENABLED = "false"` and `crons = []`.
- Deploying the current config does not enable scheduled posting.
- Real posting requires both `SNS_API_POSTING_ENABLED = "true"` and a Cron
  trigger such as `*/5 * * * *`.
- Queue entries must contain only public `https://` image URLs. Firebase
  Storage paths are intentionally rejected because this Worker cannot mint
  Firebase signed URLs.
- Do not put API tokens in this repository. Use Cloudflare Worker secrets.

## Required Cloudflare Secrets

- `SNS_ADMIN_KEY`
- `SNS_THREADS_ACCESS_TOKEN`
- `SNS_IG_ACCESS_TOKEN`
- `SNS_IG_USER_ID`
- Optional for `@uchinoko.aiko`:
  - `UCHINOKO_THREADS_ACCESS_TOKEN`
  - `UCHINOKO_IG_ACCESS_TOKEN`
  - `UCHINOKO_IG_USER_ID`

## Cost Guard

Expected normal cadence after approval: 5-minute Cron = 288 Worker invocations
per day. KV list requests are also about 288 per day, plus reads/writes for
queue items. That is designed to stay inside the Cloudflare free limits, but
any deploy, Cron enablement, secret write, or production KV write must be
approved before running.

## Local Checks

```powershell
cd C:\Users\genge\Desktop\aiko-animal-park
node --check workers\sns-post-worker\src\index.mjs
node workers\sns-post-worker\test\sns-post-worker.test.mjs
```

## Deployment Phases

1. Deploy with current config: no Cron and posting disabled.
2. Set `SNS_ADMIN_KEY` and verify `/admin/health`.
3. Copy a small test queue item to KV and run `/admin/run-due?dryRun=true`.
4. At a quiet time, pause Firebase SNS workers, copy live ready queue items,
   set real API secrets, then enable Cron and `SNS_API_POSTING_ENABLED=true`.
5. Verify the first due post, then keep Firebase SNS workers paused.
