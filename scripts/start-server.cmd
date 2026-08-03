@echo off
cd /d "C:\Mault Revised\mault\packages\server"
node "C:\Mault Revised\mault\node_modules\.pnpm\tsx@4.21.0\node_modules\tsx\dist\cli.mjs" --env-file "C:\Mault Revised\mault\.env" src/index.ts
