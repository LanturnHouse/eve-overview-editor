@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 가 필요합니다. https://nodejs.org 에서 설치해 주세요. & pause & exit /b 1)
start "" "http://localhost:5173"
node server.mjs
pause
