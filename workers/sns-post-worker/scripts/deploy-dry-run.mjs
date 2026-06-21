#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {runWranglerDeploy} from "./lib/run-wrangler-deploy.mjs";

const WORKER_DIR = path.resolve(import.meta.dirname, "..");
const PARK_ROOT = path.resolve(WORKER_DIR, "..", "..");
const CONFIG_FILE = path.join(WORKER_DIR, "wrangler.toml");
const DEFAULT_LOCAL_HQ_ROOT = path.join(process.env.USERPROFILE || "C:\\Users\\genge", "aikoanimal-hosting-new");
const DEFAULT_EVIDENCE_FILE = path.join(
  process.env.AIKO_LOCAL_HQ_ROOT || DEFAULT_LOCAL_HQ_ROOT,
  "local-ops",
  "data",
  "sns-cloudflare",
  "evidence.json",
);
const REQUIRED_ACKS = [
  "DEPLOY_CLOUDFLARE_DRY_RUN_OK",
  "COST_RISK_ACCEPTED",
];

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1] || "";
  const prefix = `${flag}=`;
  const item = argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

function hasAck(argv, value) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--ack" && argv[i + 1] === value) return true;
    if (argv[i] === `--ack=${value}`) return true;
  }
  return false;
}

function requireAcks(argv) {
  const missing = REQUIRED_ACKS.filter((ack) => !hasAck(argv, ack));
  if (missing.length) {
    throw new Error(`Missing required --ack value(s): ${missing.join(", ")}.`);
  }
}

function assertSafeDryRunConfig() {
  const config = fs.readFileSync(CONFIG_FILE, "utf8");
  if (!/SNS_API_POSTING_ENABLED\s*=\s*"false"/.test(config)) {
    throw new Error("Refusing deploy: SNS_API_POSTING_ENABLED must remain false for dry-run deploy.");
  }
  if (!/\[triggers\][\s\S]*crons\s*=\s*\[\s*\]/.test(config)) {
    throw new Error("Refusing deploy: crons must remain [] for dry-run deploy.");
  }
  if (!/binding\s*=\s*"SNS_KV"/.test(config)) {
    throw new Error("Refusing deploy: SNS_KV binding is missing.");
  }
}

function usage() {
  return [
    "Usage:",
    "  node workers/sns-post-worker/scripts/deploy-dry-run.mjs",
    ...REQUIRED_ACKS.map((ack) => `    --ack ${ack}`),
    "    [--evidence-file C:\\path\\to\\evidence.json]",
    "",
    "This runs wrangler deploy with SNS_API_POSTING_ENABLED=false and crons=[].",
    "It still changes Cloudflare external state and can count as Workers usage,",
    "so it must only be run after Aiko explicitly approves the dry-run deploy",
    "and accepts the cost/usage risk.",
    "",
    "After a successful deploy it prints local-only evidence update commands.",
  ].join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  requireAcks(argv);
  assertSafeDryRunConfig();
  runWranglerDeploy(CONFIG_FILE, {cwd: PARK_ROOT});
  printEvidenceCommands(argValue(argv, "--evidence-file") || DEFAULT_EVIDENCE_FILE);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function printEvidenceCommands(evidenceFile) {
  const localHqRoot = path.resolve(process.env.AIKO_LOCAL_HQ_ROOT || DEFAULT_LOCAL_HQ_ROOT);
  console.log("");
  console.log("[deploy-dry-run] Next local evidence steps after reviewing the deploy output:");
  console.log(`  cd ${psQuote(localHqRoot)}`);
  console.log("  # If the evidence file does not exist yet:");
  console.log(`  node local-ops\\scripts\\sns-cloudflare-evidence-update.js --init --out ${psQuote(evidenceFile)}`);
  console.log("  # Then replace the placeholder URL with the deployed Worker URL:");
  console.log(`  node local-ops\\scripts\\sns-cloudflare-evidence-update.js --evidence ${psQuote(evidenceFile)} --mark cost-risk-accepted --mark dry-run-deploy --worker-url https://YOUR-WORKER.workers.dev`);
  console.log(`  node local-ops\\scripts\\sns-cloudflare-evidence-update.js --evidence ${psQuote(evidenceFile)} --mark admin-health --worker-url https://YOUR-WORKER.workers.dev`);
}

try {
  main();
} catch (error) {
  console.error(`[deploy-dry-run] ${error.message || error}`);
  console.error("");
  console.error(usage());
  process.exit(1);
}
