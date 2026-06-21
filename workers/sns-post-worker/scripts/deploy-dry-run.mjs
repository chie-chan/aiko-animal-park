#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const WORKER_DIR = path.resolve(import.meta.dirname, "..");
const PARK_ROOT = path.resolve(WORKER_DIR, "..", "..");
const CONFIG_FILE = path.join(WORKER_DIR, "wrangler.toml");
const REQUIRED_ACK = "DEPLOY_CLOUDFLARE_DRY_RUN_OK";

function hasAck(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--ack" && argv[i + 1] === REQUIRED_ACK) return true;
    if (argv[i] === `--ack=${REQUIRED_ACK}`) return true;
  }
  return false;
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
    `  node workers/sns-post-worker/scripts/deploy-dry-run.mjs --ack ${REQUIRED_ACK}`,
    "",
    "This runs wrangler deploy with SNS_API_POSTING_ENABLED=false and crons=[].",
    "It still changes Cloudflare external state and can count as Workers usage,",
    "so it must only be run after Aiko explicitly approves the dry-run deploy.",
  ].join("\n");
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }
  if (!hasAck(process.argv.slice(2))) {
    throw new Error(`Missing --ack ${REQUIRED_ACK}. This Cloudflare deploy requires explicit approval.`);
  }
  assertSafeDryRunConfig();
  execFileSync("npx.cmd", ["wrangler", "deploy", "--config", CONFIG_FILE], {
    cwd: PARK_ROOT,
    stdio: "inherit",
    timeout: 120_000,
  });
}

try {
  main();
} catch (error) {
  console.error(`[deploy-dry-run] ${error.message || error}`);
  console.error("");
  console.error(usage());
  process.exit(1);
}
