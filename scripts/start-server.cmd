@echo off
rem Start the DeckSift API server, logging to server.log (appends).
rem Stop a previous instance first (e.g. taskkill /PID <pid> /F); restarting
rem is just running this script again.
rem
rem Every start is also a safety-net moment: if the newest DB backup is older
rem than 24h (or none exists), take one first. Tolerant if Postgres is down.
rem
rem Repo-relative: %~dp0 is this script's folder, so it works from any clone
rem location (run it however you like - path doesn't matter).
cd /d "%~dp0.."
set "ROOT=%CD%"
node "%ROOT%\scripts\backup-db.mjs" backup-if-stale 24
cd /d "%ROOT%\packages\server"
rem pnpm .bin shim for tsx — version-agnostic (survives tsx upgrades).
call "%ROOT%\packages\server\node_modules\.bin\tsx.CMD" --env-file "%ROOT%\.env" src/index.ts >> "%ROOT%\server.log" 2>&1
