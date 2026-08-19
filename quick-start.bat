@echo off
chcp 65001 > nul
echo ========================================
echo   AgentForge 一键启动脚本
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] 检查依赖...
if not exist "node_modules" (
    echo [正在安装依赖，这可能需要几分钟...]
    call npm ci
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [2/5] 检查配置文件...
if not exist ".env" (
    echo [正在创建配置文件...]
    copy .env.example .env >nul
)

echo [3/5] 检查数据库...
if not exist "prisma\dev.db" (
    echo [正在初始化数据库...]
    call npm run db:generate
    call npm run db:migrate
)

echo [4/5] 启动服务...
echo.
echo ========================================
echo   AgentForge 已启动！
echo   访问地址: http://localhost:3000
echo ========================================
echo.
echo 提示：
echo   - 当前使用确定性模式（预设响应）
echo   - 如需真实 AI，请配置 Ollama 或 API Key
echo   - 按 Ctrl+C 停止服务
echo.

start http://localhost:3000
call npm run dev
