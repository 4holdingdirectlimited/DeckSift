@echo off
rem Start the DeckSift API server, logging to server.log (appends).
rem Stop a previous instance first (e.g. taskkill /PID <pid> /F); restarting
rem is just running this script again.
rem
rem Every start is also a safety-net moment: if the newest DB backup is older
rem than 24h (or none exists), take one first. Tolerant if Postgres is down.
cd /d "C:\Mault Revised\mault"
node scripts/backup-db.mjs backup-if-stale 24
cd /d "C:\Mault Revised\mault\packages\server"
rem pnpm .bin shim for tsx — version-agnostic (survives tsx upgrades).
call "C:\Mault Revised\mault\packages\server\node_modules\.bin\tsx.CMD" --env-file "C:\Mault Revised\mault\.env" src/index.ts >> "C:\Mault Revised\mault\server.log" 2>&1
