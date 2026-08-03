@echo off
rem Detached launcher for the Vite dev server (the web UI). Run via:
rem   powershell Start-Process -FilePath "C:\Mault Revised\mault\scripts\start-web.cmd" -WindowStyle Hidden
rem Serves http://localhost:5173 and proxies /api -> http://localhost:3001.
cd /d "C:\Mault Revised\mault\packages\web"
node "C:\Mault Revised\mault\node_modules\.pnpm\vite@6.4.1_@types+node@20.19.33_jiti@2.6.1_lightningcss@1.31.1_tsx@4.21.0_yaml@2.8.2\node_modules\vite\bin\vite.js"
