#!/usr/bin/env node
/**
 * One-time local HTTPS setup so the web app can be served from
 * https://decksift.local:5173 (and https://localhost:5173).
 *
 * Why: Web Serial (the Arduino connection) only works in a secure context.
 * "decksift.local" is NOT treated as secure over plain HTTP — only "localhost"
 * is — so the friendly hostname needs a locally-trusted certificate.
 *
 * What this does:
 *   1. Downloads mkcert (FiloSottile/mkcert) to .local/bin if missing
 *   2. Creates a local Certificate Authority and trusts it (system store if
 *      possible; otherwise the per-user Root store via certutil -user, which
 *      needs no admin rights and Chrome/Edge honour)
 *   3. Issues certs for decksift.local + localhost + 127.0.0.1 into
 *      .local/certs/ — the Vite dev server picks these up automatically
 *
 * Usage (from repo root):
 *   node scripts/ssl-setup.mjs
 *
 * After this, add the hosts entry once (admin):
 *   127.0.0.1  decksift.local
 * and open https://decksift.local:5173.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// Local state lives in .local/ NEXT TO the repo (i.e. the folder containing
// the clone) — matches vite.config.ts's cert lookup and this machine's
// existing install. Override the whole location with DECKSIFT_LOCAL_DIR if
// you want it inside the repo instead.
const REPO_PARENT = fileURLToPath(new URL("../../", import.meta.url));
const LOCAL = process.env.DECKSIFT_LOCAL_DIR
  ? join(process.env.DECKSIFT_LOCAL_DIR)
  : join(REPO_PARENT, ".local");
const BIN_DIR = join(LOCAL, "bin");
const CERT_DIR = join(LOCAL, "certs");
const MKCERT_URL =
  "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe";
const mkcertExe = join(BIN_DIR, "mkcert.exe");

function step(msg) {
  console.log(`\n==> ${msg}`);
}

function run(cmd, args, opts = {}) {
  const out = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (out.status !== 0) {
    console.error(out.stderr || `command failed (exit ${out.status})`);
    return null;
  }
  return out.stdout?.trim() || "";
}

function ensureMkcert() {
  if (existsSync(mkcertExe)) return true;
  step(`Downloading mkcert to ${BIN_DIR} ...`);
  mkdirSync(BIN_DIR, { recursive: true });
  const out = run(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Invoke-WebRequest -Uri '${MKCERT_URL}' -OutFile '${mkcertExe}'`,
    ],
    { timeout: 120000 },
  );
  if (!existsSync(mkcertExe)) {
    console.error("mkcert download failed — check the network and retry.");
    return false;
  }
  chmodSync(mkcertExe, 0o755);
  return true;
}

function trustCa() {
  // No-admin path: put the CA in the per-user Root store. Chrome/Edge on
  // Windows trust user-store roots, so no admin rights are needed.
  const caPem = join(homedir(), "AppData", "Local", "mkcert", "rootCA.pem");
  if (!existsSync(caPem)) {
    // First run of mkcert creates the CA — run it once before importing.
    step("Creating the local CA...");
    run(mkcertExe, ["-install"], { timeout: 60000 });
  }
  if (!existsSync(caPem)) {
    console.error("Could not locate the mkcert CA — certificates will not be trusted.");
    return false;
  }
  step("Installing the CA into the per-user Root store (no admin needed)...");
  run("certutil", ["-user", "-addstore", "Root", caPem], { timeout: 30000 });
  // Verify it's actually present.
  const listed = run("certutil", ["-user", "-store", "Root"], { timeout: 30000 });
  const trusted = !!listed && listed.includes("mkcert");
  if (trusted) console.log("  CA trusted in the per-user Root store.");
  else console.warn("  Could not confirm CA trust — run 'node scripts/ssl-setup.mjs' in an admin shell.");
  return trusted;
}

function issueCerts() {
  step(`Issuing certificates for decksift.local, localhost, 127.0.0.1 -> ${CERT_DIR}`);
  mkdirSync(CERT_DIR, { recursive: true });
  const out = run(
    mkcertExe,
    [
      "-cert-file",
      join(CERT_DIR, "decksift.local.pem"),
      "-key-file",
      join(CERT_DIR, "decksift.local-key.pem"),
      "decksift.local",
      "localhost",
      "127.0.0.1",
    ],
    { timeout: 60000 },
  );
  if (!existsSync(join(CERT_DIR, "decksift.local.pem"))) {
    console.error("Certificate generation failed.");
    return false;
  }
  console.log(out || "  Certificates written.");
  return true;
}

if (!ensureMkcert()) process.exit(1);
const trusted = trustCa();
const issued = issueCerts();
if (!issued) process.exit(1);

console.log("\nDone. Restart the web server (scripts/start-web.cmd) and add the hosts entry once (admin):");
console.log("  127.0.0.1  decksift.local");
console.log("then open https://decksift.local:5173");
if (!trusted) {
  console.log("\nNOTE: CA trust wasn't confirmed. Run 'mkcert -install' in an admin");
  console.log("shell (or run this script from an admin shell) so the cert is trusted.");
}
