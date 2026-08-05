@echo off
:: 确保 Node.js 在 PATH 中（根据你的安装路径调整）
set "PATH=C:\Program Files\nodejs;%PATH%"

:: 进入项目目录
cd /d "%~dp0"
:: 直接启动 Electron（使用项目本地的 electron.cmd）
call npm start
 