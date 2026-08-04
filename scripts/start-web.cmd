@echo off
rem Detached launcher for the Vite dev server (the web UI). Run via:
rem   powershell Start-Process -FilePath "C:\Mault Revised\mault\scripts\start-web.cmd" -WindowStyle Hidden
rem Serves http://localhost:5173 and proxies /api -> http://localhost:3001.
cd /d "C:\Mault Revised\mault\packages\web"
node "C:\Mault Revised\mault\packages\web\node_modules\vite\bin\vite.js"
