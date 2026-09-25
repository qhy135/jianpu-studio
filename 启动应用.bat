@echo off
chcp 65001 >nul
title 简谱工坊

REM 切到本脚本所在目录
cd /d "%~dp0"

REM 关键：清除宿主注入的 ELECTRON_RUN_AS_NODE，否则 Electron 会退化成纯 Node 而无法启动
set ELECTRON_RUN_AS_NODE=
set ELECTRON_DISABLE_SANDBOX=1

echo 正在启动 简谱工坊...
start "" "%~dp0node_modules\electron\dist\electron.exe" "."
