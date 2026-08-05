@echo off
rem Adds the decksift.local -> 127.0.0.1 hosts entry (run as admin).
rem Used by ssl-setup.mjs and manually: right-click -> Run as administrator,
rem or "powershell Start-Process <this> -Verb RunAs".
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
findstr /i /c:"decksift.local" "%HOSTS%" >nul 2>&1
if %errorlevel%==0 (
  echo decksift.local already present in hosts file.
) else (
  echo 127.0.0.1  decksift.local>> "%HOSTS%"
  echo Added "127.0.0.1 decksift.local" to hosts file.
)
