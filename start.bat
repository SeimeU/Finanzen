@echo off
rem Starts Finanzen: installs dependencies on first run, builds the UI, starts the
rem local server (127.0.0.1 only) and opens the default browser.
cd /d "%~dp0"
if not exist node_modules (
  call npm install || goto :error
)
call npm run build || goto :error
call npm start -- --open
goto :eof
:error
echo Start fehlgeschlagen.
pause
