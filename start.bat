@echo off
cd /d "%~dp0"
rem Portable release: use the bundled Node.js (runtime\node.exe). Otherwise use the Node.js installed on this PC.
set "NODE_EXE=node"
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if /i not "%NODE_EXE%"=="node" goto run
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
:run
echo EVE overview editor - http://localhost:5173  (close this window to stop)
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:5173"
"%NODE_EXE%" server.mjs
pause
