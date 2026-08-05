#!/usr/bin/env node
/**
 * One-command backup / restore for the local PostgreSQL database.
 *
 * Usage (from repo root):
 *   node scripts/backup-db.mjs backup [dir]   # dump to <dir> (default .local/backups)
 *   node scripts/backup-db.mjs list           # list existing backups
 *   node scripts/backup-db.mjs restore <file> # wipe + restore from a backup (asks for confirmation)
 *
 * Backups are plain-SQL dumps with --clean --if-exists, so restoring replaces
 * the current database contents with exactly what was backed up. Run
 * `node scripts/local-db.mjs start` first if the database isn't running.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const POSTGRES_DIR = join("C:", "Mault Revised", ".local", "postgres");
const BIN_DIR = join(POSTGRES_DIR, "win32-x64", "bin");
const DEFAULT_BACKUP_DIR = join("C:", "Mault Revised", ".local", "backups");

const HOST = "127.0.0.1";
const PORT = "5433";
const USER = "postgres";
const DB = "mault";

const pgDump = join(BIN_DIR, "pg_dump.exe");
const psql = join(BIN_DIR, "psql.exe");
const pgIsReady = join(BIN_DIR, "pg_isready.exe");

function checkInstall() {
  if (!existsSync(pgDump) || !existsSync(psql)) {
    console.error(
      `PostgreSQL tools not found at ${BIN_DIR}.\n` +
        "Install the portable PostgreSQL bundle first (see README 'Local PostgreSQL' section).",
    );
    process.exit(1);
  }
}

function isRunning() {
  const out = spawnSync(pgIsReady, ["-h", HOST, "-p", PORT], {
    encoding: "utf8",
  });
  return out.status === 0;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function backup(backupDir) {
  checkInstall();
  if (!isRunning()) {
    console.error(`PostgreSQL is not running on ${HOST}:${PORT}. Start it with:\n  node scripts/local-db.mjs start`);
    process.exit(1);
  }
  mkdirSync(backupDir, { recursive: true });
  const file = join(backupDir, `mault-${timestamp()}.sql`);
  console.log(`Backing up database "${DB}" to ${file} ...`);
  const out = spawnSync(
    pgDump,
    [
      "-h", HOST, "-p", PORT, "-U", USER,
      "--clean", "--if-exists",
      "-d", DB,
      "-f", file,
    ],
    { encoding: "utf8", timeout: 300000 },
  );
  if (out.status !== 0) {
    console.error(out.stderr || `pg_dump failed (exit ${out.status}).`);
    process.exit(1);
  }
  const size = existsSync(file) ? `${(statSync(file).size / 1024).toFixed(0)} KB` : "?";
  console.log(`Backup complete: ${file} (${size})`);
}

/** Newest backup age in hours, or null if no backups exist. */
function newestBackupAgeHours(backupDir) {
  if (!existsSync(backupDir)) return null;
  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(backupDir, f));
  if (files.length === 0) return null;
  const newest = files.reduce((a, b) =>
    statSync(a).mtimeMs > statSync(b).mtimeMs ? a : b,
  );
  return (Date.now() - statSync(newest).mtimeMs) / 3_600_000;
}

/**
 * Backup only if the newest backup is older than `maxHours` (or none exists).
 * Tolerant when the DB isn't running — used from start-server.cmd so every
 * server start is a safety-net opportunity without slowing boot.
 */
function backupIfStale(maxHours, backupDir) {
  if (!isRunning()) {
    console.log("PostgreSQL not running — skipping backup-if-stale.");
    return;
  }
  const age = newestBackupAgeHours(backupDir);
  if (age !== null && age < maxHours) {
    console.log(`Newest backup is ${age.toFixed(1)}h old (limit ${maxHours}h) — skipping.`);
    return;
  }
  backup(backupDir);
}

function list(backupDir) {
  if (!existsSync(backupDir)) {
    console.log("No backups directory yet.");
    return;
  }
  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.log(`No backups found in ${backupDir}`);
    return;
  }
  console.log(`Backups in ${backupDir}:`);
  for (const f of files) console.log(`  ${f}`);
}

function restore(file) {
  checkInstall();
  if (!existsSync(file)) {
    console.error(`Backup file not found: ${file}`);
    process.exit(1);
  }
  if (!isRunning()) {
    console.error(`PostgreSQL is not running on ${HOST}:${PORT}. Start it with:\n  node scripts/local-db.mjs start`);
    process.exit(1);
  }
  console.log(
    `Restoring ${file} into "${DB}". This DROPS all current tables and data first.`,
  );
  const out = spawnSync(psql, ["-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-f", file], {
    encoding: "utf8",
    timeout: 600000,
  });
  if (out.status !== 0) {
    console.error(out.stderr || `psql failed (exit ${out.status}).`);
    console.error("If objects are missing (roles/grants), re-run:");
    console.error("  psql -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-bootstrap.sql");
    process.exit(1);
  }
  console.log("Restore complete.");
  console.log("Tip: re-run local-bootstrap.sql afterwards to guarantee RLS roles/grants:");
  console.log("  psql -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-bootstrap.sql");
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case "backup":
    backup(arg ? join(process.cwd(), arg) : DEFAULT_BACKUP_DIR);
    break;
  case "backup-if-stale":
    backupIfStale(Number(arg ?? "24") || 24, DEFAULT_BACKUP_DIR);
    break;
  case "list":
    list(arg ? join(process.cwd(), arg) : DEFAULT_BACKUP_DIR);
    break;
  case "restore":
    if (!arg) {
      console.error("Usage: node scripts/backup-db.mjs restore <backup-file>");
      process.exit(1);
    }
    restore(join(process.cwd(), arg));
    break;
  default:
    console.log("Usage: node scripts/backup-db.mjs [backup [dir] | backup-if-stale [hours] | list [dir] | restore <file>]");
    process.exit(1);
}
