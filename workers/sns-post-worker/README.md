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
npm run check:sns-worker
```

## Guarded Dry-Run Deploy

After explicit approval only:

```powershell
cd C:\Users\genge\Desktop\aiko-animal-park
npm run deploy:sns-worker:dry-run -- --ack DEPLOY_CLOUDFLARE_DRY_RUN_OK --ack COST_RISK_ACCEPTED
```

The deploy script refuses to run unless `SNS_API_POSTING_ENABLED=false` and
`crons=[]` are still present in `workers/sns-post-worker/wrangler.toml`. It
also requires `COST_RISK_ACCEPTED` because even dry-run deployment changes
Cloudflare state and can count as Workers usage.

## Guarded Live Cron Deploy

After all cutover evidence has been reviewed and Aiko explicitly approves live
posting only:

```powershell
cd C:\Users\genge\Desktop\aiko-animal-park
npm run deploy:sns-worker:live -- --evidence C:\path\to\reviewed-evidence.json --ack DEPLOY_CLOUDFLARE_LIVE_OK --ack FIREBASE_SNS_WORKERS_PAUSED --ack LIVE_QUEUE_REVIEWED --ack SNS_SECRETS_VERIFIED --ack FIRST_POST_MONITORING_READY --ack COST_RISK_ACCEPTED
```

The live deploy script refuses to run unless the reviewed evidence proves:

- Cloudflare dry-run deploy, admin health, secrets, KV dry-run, and live queue copy are complete.
- Firebase SNS workers `snsApiPostWorkerDryRun` and `uchinokoGiftInstagramPostWorker` are paused.
- Orders, LINE, BASE, and Firestore remain on Firebase.

The script deploys a temporary live config with `SNS_API_POSTING_ENABLED=true`
and Cron `*/5 * * * *`. It does not change the checked-in `wrangler.toml`,
which must remain posting disabled and `crons=[]`.

## Guarded Safe Rollback Deploy

After explicit approval, this deploys the checked-in safe config again:

```powershell
cd C:\Users\genge\Desktop\aiko-animal-park
npm run deploy:sns-worker:safe -- --ack DEPLOY_CLOUDFLARE_SAFE_ROLLBACK_OK --ack COST_RISK_ACCEPTED
```

The safe deploy refuses to run unless checked-in `wrangler.toml` is still
`SNS_API_POSTING_ENABLED=false` and `crons=[]`. It is intended for rollback or
post-test shutdown and still changes Cloudflare external state.

## Cutover Audit

From Local HQ:

```powershell
cd C:\Users\genge\aikoanimal-hosting-new
node local-ops\scripts\sns-cloudflare-cutover-audit.js
```

## Queue Migration Helper

The Local HQ repository has a guarded helper:

```powershell
cd C:\Users\genge\aikoanimal-hosting-new
node local-ops\scripts\sns-cloudflare-migration.js --help
node local-ops\scripts\sns-cloudflare-migration.js --from-file local-ops\scripts\fixtures\sns-cloudflare-migration-sample.json
```

Firestore reads require `--ack READ_FIRESTORE_OK --ack COST_RISK_ACCEPTED`.
Production Cloudflare KV
writes require all of:

- `--ack WRITE_CLOUDFLARE_KV_OK`
- `--ack COST_RISK_ACCEPTED`
- `--ack FIREBASE_SNS_WORKERS_PAUSED`
- `--ack LIVE_QUEUE_REVIEWED`

Test-only KV writes use a separate gate and mark the copied item as
`testOnly`/`dryRun`:

```powershell
node local-ops\scripts\sns-cloudflare-migration.js --from-file local-ops\scripts\fixtures\sns-cloudflare-migration-sample.json --test-write-cloudflare --ack WRITE_CLOUDFLARE_TEST_KV_OK --ack COST_RISK_ACCEPTED
```

## Cutover Plan

From Local HQ:

```powershell
cd C:\Users\genge\aikoanimal-hosting-new
node local-ops\scripts\sns-cloudflare-cutover-plan.js
```

The plan is local-only and lists the explicit approval text required before
Cloudflare deploys, secret writes, KV writes, Firebase worker pauses, or Cron
enablement.

## Evidence Bookkeeping

After a reviewed external step completes, update the local evidence file from
Local HQ instead of hand-editing JSON:

```powershell
cd C:\Users\genge\aikoanimal-hosting-new
node local-ops\scripts\sns-cloudflare-evidence-update.js --evidence local-ops\data\sns-cloudflare\evidence.json --mark dry-run-deploy --worker-url https://...
node local-ops\scripts\sns-cloudflare-evidence-update.js --evidence local-ops\data\sns-cloudflare\evidence.json --mark admin-health --worker-url https://...
```

The evidence helper performs no Cloudflare/Firebase calls and stores only
status fields, secret names, Worker URL, and Scheduler job names. The dry-run
deploy mark requires the deployed Worker URL. Do not put secret values,
customer data, or raw queue payloads in evidence files.

## Deployment Phases

1. Deploy with current config: no Cron and posting disabled.
2. Set `SNS_ADMIN_KEY` and verify `/admin/health`.
3. Copy a small test queue item to KV and run `/admin/run-due?dryRun=true`.
4. At a quiet time, pause Firebase SNS workers, copy live ready queue items,
   set real API secrets, then enable Cron and `SNS_API_POSTING_ENABLED=true`.
5. Verify the first due post, then keep Firebase SNS workers paused.
