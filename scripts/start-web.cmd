@echo off
rem Detached launcher for the Vite dev server (the web UI). Run from the repo
rem root via:
rem   powershell Start-Process -FilePath ".\scripts\start-web.cmd" -WindowStyle Hidden
rem Serves http://localhost:5173 (https if .local/certs exist) and proxies
rem /api -> http://localhost:3001.
cd /d "%~dp0.."
set "ROOT=%CD%"
cd /d "%ROOT%\packages\web"
node "%ROOT%\packages\web\node_modules\vite\bin\vite.js"
