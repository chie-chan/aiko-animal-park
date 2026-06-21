import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function localWranglerBin(cwd) {
  const packageFile = path.join(cwd, "node_modules", "wrangler", "package.json");
  if (!fs.existsSync(packageFile)) return "";

  const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const bin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.wrangler;
  return bin ? path.join(path.dirname(packageFile), bin) : "";
}

export function runWranglerDeploy(configFile, {cwd, timeout = 120_000} = {}) {
  const localBin = localWranglerBin(cwd);
  if (localBin && fs.existsSync(localBin)) {
    execFileSync(process.execPath, [localBin, "deploy", "--config", configFile], {
      cwd,
      stdio: "inherit",
      timeout,
    });
    return;
  }

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(command, ["wrangler", "deploy", "--config", configFile], {
    cwd,
    stdio: "inherit",
    timeout,
    shell: process.platform === "win32",
  });
}
