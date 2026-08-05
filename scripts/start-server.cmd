@echo off
rem Start the DeckSift API server, logging to server.log (appends).
rem Kill a previous instance first (e.g. taskkill /PID <pid> /F) or run
rem scripts/restart-server.cmd if you create one.
rem
rem Every start is also a safety-net moment: if the newest DB backup is older
rem than 24h (or none exists), take one first. Tolerant if Postgres is down.
cd /d "C:\Mault Revised\mault"
node scripts/backup-db.mjs backup-if-stale 24
cd /d "C:\Mault Revised\mault\packages\server"
node "C:\Mault Revised\mault\node_modules\.pnpm\tsx@4.21.0\node_modules\tsx\dist\cli.mjs" --env-file "C:\Mault Revised\mault\.env" src/index.ts >> "C:\Mault Revised\mault\server.log" 2>&1
