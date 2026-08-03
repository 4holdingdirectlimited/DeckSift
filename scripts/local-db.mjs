#!/usr/bin/env node
/**
 * Local PostgreSQL helper — start / stop / status for the portable
 * PostgreSQL instance this project uses instead of hosted Neon.
 *
 * Usage (from repo root):
 *   node scripts/local-db.mjs start       # start the server (detached)
 *   node scripts/local-db.mjs stop        # stop it gracefully
 *   node scripts/local-db.mjs status      # is it accepting connections?
 *   node scripts/local-db.mjs install     # auto-start at logon (no admin needed)
 *   node scripts/local-db.mjs uninstall   # remove auto-start
 *
 * Why PowerShell Start-Process: on Windows, `pg_ctl start` spawns postgres as
 * a child of the current shell, which kills it when the shell exits. We need a
 * truly detached process, so we launch postgres.exe itself via Start-Process.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const POSTGRES_DIR = join("C:", "Mault Revised", ".local", "postgres");
const BIN_DIR = join(POSTGRES_DIR, "win32-x64", "bin");
const DATA_DIR = join(POSTGRES_DIR, "data");
const RUN_DIR = join(POSTGRES_DIR, "run");
const LOG_FILE = join(RUN_DIR, "postgres.log");
const PORT = "5433";

const postgresExe = join(BIN_DIR, "postgres.exe");
const pgIsReady = join(BIN_DIR, "pg_isready.exe");
const pgCtl = join(BIN_DIR, "pg_ctl.exe");

const IS_WINDOWS = process.platform === "win32";

function checkInstall() {
  if (!existsSync(postgresExe)) {
    console.error(
      `Portable PostgreSQL not found at ${POSTGRES_DIR}.\n` +
        "Download it (see README 'Local PostgreSQL' section) and extract to that path.",
    );
    process.exit(1);
  }
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
    console.error(`Data directory not initialized at ${DATA_DIR}. Run initdb first (see README).`);
    process.exit(1);
  }
  mkdirSync(RUN_DIR, { recursive: true });
}

function isRunning() {
  const out = spawnSync(pgIsReady, ["-h", "127.0.0.1", "-p", PORT], { encoding: "utf8" });
  return out.status === 0;
}

function status() {
  const ok = isRunning();
  console.log(
    ok
      ? `PostgreSQL is RUNNING on 127.0.0.1:${PORT}`
      : "PostgreSQL is STOPPED",
  );
  return ok;
}

function start() {
  checkInstall();
  if (isRunning()) {
    console.log("PostgreSQL is already running.");
    return;
  }
  console.log("Starting PostgreSQL...");
  if (IS_WINDOWS) {
    // Truly detached: Start-Process launches postgres.exe outside this shell's
    // process tree, so it survives the terminal closing. Redirect output to the
    // log file.
    const args = [
      "-NoProfile",
      "-Command",
      `Start-Process -FilePath '${postgresExe}' -ArgumentList '"-D" "${DATA_DIR}" "-p" "${PORT}" "-c" "listen_addresses=127.0.0.1" "-c" "shared_buffers=1GB"' -WindowStyle Hidden -RedirectStandardOutput '${LOG_FILE}' -RedirectStandardError '${LOG_FILE}.err'`,
    ];
    const out = spawnSync("powershell", args, { encoding: "utf8", timeout: 30000 });
    if (out.status !== 0) {
      console.error(out.stderr || `Start-Process failed (exit ${out.status}).`);
      process.exit(1);
    }
  } else {
    const out = spawnSync(pgCtl, ["-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "start"], {
      encoding: "utf8",
      timeout: 30000,
    });
    console.log(out.stdout || out.stderr || "");
  }
  // Give it a moment, then confirm.
  const started = waitForReady(15);
  if (started) console.log(`PostgreSQL is RUNNING on 127.0.0.1:${PORT}`);
  else {
    console.error("PostgreSQL failed to start — check the log:");
    console.error(tail(LOG_FILE, 15));
    process.exit(1);
  }
}

function waitForReady(seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (isRunning()) return true;
    spawnSync("cmd", ["/c", "timeout", "/t", "1", "/nobreak"], { stdio: "ignore" });
  }
  return false;
}

function stop() {
  if (!isRunning()) {
    console.log("PostgreSQL is already stopped.");
    return;
  }
  const out = spawnSync(pgCtl, ["-D", DATA_DIR, "-m", "fast", "stop"], { encoding: "utf8", timeout: 30000 });
  console.log(out.stdout || out.stderr || "Stopped.");
}

function installAutoStart() {
  // Two no-admin options; try the Startup folder first (simplest, runs at
  // logon for this user). schtasks with /sc onlogon may also work.
  const launcher = join(RUN_DIR, "start-postgres.cmd");
  const cmdContent = `@echo off\r\nstart "" /b "${postgresExe}" -D "${DATA_DIR}" -p ${PORT} -c listen_addresses=127.0.0.1 -c shared_buffers=1GB >> "${LOG_FILE}" 2>&1\r\n`;
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(launcher, cmdContent);

  const startupDir = join(
    homedir(),
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  const shortcut = join(startupDir, "MaultLocalDB.cmd");
  try {
    mkdirSync(startupDir, { recursive: true });
    writeFileSync(shortcut, `@echo off\r\ncall "${launcher}"\r\n`);
    console.log(`Auto-start installed: Postgres will start at logon (${shortcut}).`);
  } catch (err) {
    console.error("Could not write Startup folder shortcut:", err.message);
    console.error('Tip: run "node scripts/local-db.mjs start" after each login,');
    console.error('or as an admin run "schtasks /create /tn MaultLocalDB /tr \'"' + launcher + '"\' /sc onlogon /f".');
  }
}

function uninstallAutoStart() {
  const shortcut = join(
    homedir(),
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "MaultLocalDB.cmd",
  );
  try {
    rmSync(shortcut, { force: true });
    console.log("Auto-start removed.");
  } catch {
    console.log("No auto-start entry found.");
  }
}

function tail(file, lines) {
  try {
    const content = spawnSync("cmd", ["/c", "powershell -NoProfile -Command Get-Content '" + file + "' -Tail " + lines], {
      encoding: "utf8",
    }).stdout;
    return content || "(empty log)";
  } catch {
    return "(unable to read log)";
  }
}

const [cmd] = process.argv.slice(2) ?? ["status"];
switch (cmd) {
  case "start":
    start();
    break;
  case "stop":
    stop();
    break;
  case "status":
    status();
    break;
  case "install":
    installAutoStart();
    break;
  case "uninstall":
    uninstallAutoStart();
    break;
  default:
    console.log("Usage: node scripts/local-db.mjs [start|stop|status|install|uninstall]");
    process.exit(1);
}
