@echo off
rem Start the DeckSift API server, logging to server.log (appends), then wait
rem for it to pass GET /api/health before declaring success. A server that
rem starts but can't reach the database (health returns 503) is treated as a
rem clean failure: the half-up process is stopped and this script exits
rem non-zero. See scripts/wait-for-health.ps1 for the poll.
rem
rem Every start is also a safety-net moment: if the newest DB backup is older
rem than 24h (or none exists), take one first. Tolerant if Postgres is down.
rem
rem Restarting: stop a previous instance first (e.g. taskkill /PID <pid> /F),
rem then run this script again. If an instance is already healthy, this script
rem reports that and does nothing.
rem
rem Repo-relative: %~dp0 is this script's folder, so it works from any clone
rem location (run it however you like - path doesn't matter).
cd /d "%~dp0.."
set "ROOT=%CD%"
node "%ROOT%\scripts\backup-db.mjs" backup-if-stale 24

rem Already healthy? Report it and bail - starting a second instance would
rem fail to bind the port anyway. (127.0.0.1, not localhost: the server binds
rem IPv4-only and localhost can resolve to ::1 on Windows.)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 2; if ($r.success) { Write-Host '[DeckSift] An API instance is already running (health check OK). Not starting another.'; exit 0 } } catch {}; exit 1"
if not errorlevel 1 exit /b 0

set "SERVER_DIR=%ROOT%\packages\server"
set "TSS=%SERVER_DIR%\node_modules\.bin\tsx.CMD"
cd /d "%SERVER_DIR%"

rem Launch the server in the background (same console) so this script can poll
rem /api/health while it boots. It keeps running after the script exits, and
rem its output goes to server.log via the redirect below. The extra cmd /c
rem wrapper is required: `start` runs .CMD files through cmd /K, which strips
rem the quotes around the shim path and breaks on the space in the repo path.
start "DeckSift API" /b cmd /c ""%TSS%" --env-file "%ROOT%\.env" src/index.ts >> "%ROOT%\server.log" 2>&1"

rem Wait for /api/health. Exit 0 = healthy, 1 = never became healthy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\wait-for-health.ps1"
if errorlevel 1 goto failed
echo [DeckSift] Server started. See %ROOT%\server.log for details.
exit /b 0

:failed
echo [DeckSift] Startup failed - stopping the half-up server process on port 3001.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('[DeckSift] Stopped PID ' + $c.OwningProcess) } else { Write-Host '[DeckSift] No listener found on port 3001 to stop.' }"
exit /b 1
