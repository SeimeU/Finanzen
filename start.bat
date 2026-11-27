@echo off
rem Starts Finanzen. Only the first start (or one after an update of package-lock.json)
rem needs the internet: it installs the dependencies once. The UI is built only when
rem dist\ui is missing or older than the sources. Then the local server (127.0.0.1 only)
rem starts from the installed and built files, without any network access, and opens
rem the default browser.
cd /d "%~dp0"
node scripts\check-node.mjs || goto :error
fc /b package-lock.json node_modules\.finanzen-installed.json >nul 2>&1
if errorlevel 1 (
  echo Erster Start: Abhaengigkeiten werden installiert, dafuer ist einmal Internet noetig ...
  call npm ci || goto :error
  copy /y package-lock.json node_modules\.finanzen-installed.json >nul || goto :error
)
node scripts\ui-is-current.mjs
if errorlevel 1 (
  call npm run build || goto :error
)
node --import tsx src\server\main.ts --open || goto :error
goto :eof
:error
echo Start fehlgeschlagen.
pause
