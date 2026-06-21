#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {runWranglerDeploy} from "./lib/run-wrangler-deploy.mjs";

const WORKER_DIR = path.resolve(import.meta.dirname, "..");
const PARK_ROOT = path.resolve(WORKER_DIR, "..", "..");
const CONFIG_FILE = path.join(WORKER_DIR, "wrangler.toml");
const LIVE_CRON = "*/5 * * * *";
const REQUIRED_ACKS = [
  "DEPLOY_CLOUDFLARE_LIVE_OK",
  "FIREBASE_SNS_WORKERS_PAUSED",
  "LIVE_QUEUE_REVIEWED",
  "SNS_SECRETS_VERIFIED",
  "FIRST_POST_MONITORING_READY",
  "COST_RISK_ACCEPTED",
];
const REQUIRED_SECRETS = [
  "SNS_ADMIN_KEY",
  "SNS_THREADS_ACCESS_TOKEN",
  "SNS_IG_ACCESS_TOKEN",
  "SNS_IG_USER_ID",
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
    throw new Error(`Missing required --ack value(s): ${missing.join(", ")}`);
  }
}

function readEvidence(file) {
  if (!file) throw new Error("--evidence reviewed evidence JSON is required for live deploy.");
  const fullPath = path.resolve(file);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function includesAll(actual, required) {
  const values = new Set(Array.isArray(actual) ? actual.map(String) : []);
  return required.every((item) => values.has(item));
}

function assertEvidence(evidence) {
  const cloudflare = evidence.cloudflare || {};
  const firebase = evidence.firebase || {};
  if (cloudflare.workerDeployed !== true) throw new Error("Evidence missing cloudflare.workerDeployed=true.");
  if (cloudflare.adminHealthOk !== true) throw new Error("Evidence missing cloudflare.adminHealthOk=true.");
  if (cloudflare.kvDryRunOk !== true) throw new Error("Evidence missing cloudflare.kvDryRunOk=true.");
  if (cloudflare.liveQueueCopied !== true) throw new Error("Evidence missing cloudflare.liveQueueCopied=true.");
  if (!includesAll(cloudflare.secretsSet, REQUIRED_SECRETS)) {
    throw new Error(`Evidence missing required Cloudflare secrets: ${REQUIRED_SECRETS.join(", ")}`);
  }
  if (firebase.liveSnsQueueReviewed !== true) throw new Error("Evidence missing firebase.liveSnsQueueReviewed=true.");
  if (!includesAll(firebase.pausedSchedulerJobs, ["snsApiPostWorkerDryRun", "uchinokoGiftInstagramPostWorker"])) {
    throw new Error("Evidence must prove Firebase SNS workers are paused before live Cron deploy.");
  }
  if (firebase.ordersLineBaseFirestoreKept !== true) {
    throw new Error("Evidence must prove orders/LINE/BASE/Firestore backbone remains Firebase.");
  }
}

function assertBaseConfigSafe(config) {
  if (!/SNS_API_POSTING_ENABLED\s*=\s*"false"/.test(config)) {
    throw new Error("Refusing live deploy: checked-in wrangler.toml must remain SNS_API_POSTING_ENABLED=false.");
  }
  if (!/\[triggers\][\s\S]*crons\s*=\s*\[\s*\]/.test(config)) {
    throw new Error("Refusing live deploy: checked-in wrangler.toml must keep crons=[].");
  }
  if (!/binding\s*=\s*"SNS_KV"/.test(config)) {
    throw new Error("Refusing live deploy: SNS_KV binding is missing.");
  }
}

function liveConfigFrom(baseConfig) {
  return baseConfig
    .replace(/SNS_API_POSTING_ENABLED\s*=\s*"false"/, 'SNS_API_POSTING_ENABLED = "true"')
    .replace(/(\[triggers\][\s\S]*?crons\s*=\s*)\[\s*\]/, `$1["${LIVE_CRON}"]`);
}

function writeTempLiveConfig(baseConfig) {
  const liveConfig = liveConfigFrom(baseConfig);
  if (!/SNS_API_POSTING_ENABLED\s*=\s*"true"/.test(liveConfig)) {
    throw new Error("Live temp config did not enable SNS_API_POSTING_ENABLED.");
  }
  if (!new RegExp(`crons\\s*=\\s*\\[\\s*"${LIVE_CRON.replace(/[/*]/g, "\\$&")}"\\s*\\]`).test(liveConfig)) {
    throw new Error("Live temp config did not enable the expected Cron.");
  }
  const file = path.join(WORKER_DIR, `wrangler.live.${process.pid}.${Date.now()}.tmp.toml`);
  fs.writeFileSync(file, liveConfig, "utf8");
  return file;
}

function usage() {
  return [
    "Usage:",
    "  node workers/sns-post-worker/scripts/deploy-live.mjs --evidence reviewed-evidence.json",
    ...REQUIRED_ACKS.map((ack) => `    --ack ${ack}`),
    "",
    "This deploys a temporary live config with SNS_API_POSTING_ENABLED=true",
    `and Cron ${LIVE_CRON}. It changes Cloudflare external state and can publish`,
    "real SNS posts, so it must only run after explicit approval and evidence review.",
    "",
    "The checked-in wrangler.toml must remain posting disabled and crons=[].",
  ].join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  requireAcks(argv);
  const evidence = readEvidence(argValue(argv, "--evidence"));
  assertEvidence(evidence);
  const baseConfig = fs.readFileSync(CONFIG_FILE, "utf8");
  assertBaseConfigSafe(baseConfig);
  const liveConfigFile = writeTempLiveConfig(baseConfig);
  try {
    runWranglerDeploy(liveConfigFile, {cwd: PARK_ROOT});
  } finally {
    fs.rmSync(liveConfigFile, {force: true});
  }
}

try {
  main();
} catch (error) {
  console.error(`[deploy-live] ${error.message || error}`);
  console.error("");
  console.error(usage());
  process.exit(1);
}
