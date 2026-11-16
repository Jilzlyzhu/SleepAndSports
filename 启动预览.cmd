@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 20 或更高版本；也可双击 public\offline.html 体验。
  pause
  exit /b 1
)
echo 启动后访问 http://localhost:4186
node server.js
pause
