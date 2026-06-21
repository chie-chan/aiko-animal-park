#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {runWranglerDeploy} from "./lib/run-wrangler-deploy.mjs";

const WORKER_DIR = path.resolve(import.meta.dirname, "..");
const PARK_ROOT = path.resolve(WORKER_DIR, "..", "..");
const CONFIG_FILE = path.join(WORKER_DIR, "wrangler.toml");
const REQUIRED_ACKS = [
  "DEPLOY_CLOUDFLARE_SAFE_ROLLBACK_OK",
  "COST_RISK_ACCEPTED",
];

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
    throw new Error(`Missing required --ack value(s): ${missing.join(", ")}`);
  }
}

function assertSafeConfig() {
  const config = fs.readFileSync(CONFIG_FILE, "utf8");
  if (!/SNS_API_POSTING_ENABLED\s*=\s*"false"/.test(config)) {
    throw new Error("Refusing safe deploy: checked-in wrangler.toml must have SNS_API_POSTING_ENABLED=false.");
  }
  if (!/\[triggers\][\s\S]*crons\s*=\s*\[\s*\]/.test(config)) {
    throw new Error("Refusing safe deploy: checked-in wrangler.toml must have crons=[].");
  }
  if (!/binding\s*=\s*"SNS_KV"/.test(config)) {
    throw new Error("Refusing safe deploy: SNS_KV binding is missing.");
  }
}

function usage() {
  return [
    "Usage:",
    "  node workers/sns-post-worker/scripts/deploy-safe.mjs",
    "    --ack DEPLOY_CLOUDFLARE_SAFE_ROLLBACK_OK",
    "    --ack COST_RISK_ACCEPTED",
    "",
    "This deploys the checked-in safe config with SNS_API_POSTING_ENABLED=false",
    "and crons=[]. It changes Cloudflare external state and can count as",
    "Workers usage, so it must only run after explicit approval.",
  ].join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  requireAcks(argv);
  assertSafeConfig();
  runWranglerDeploy(CONFIG_FILE, {cwd: PARK_ROOT});
}

try {
  main();
} catch (error) {
  console.error(`[deploy-safe] ${error.message || error}`);
  console.error("");
  console.error(usage());
  process.exit(1);
}
