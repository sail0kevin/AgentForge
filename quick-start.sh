#!/bin/bash

echo "========================================"
echo "  AgentForge 一键启动脚本"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

echo "[1/5] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "[正在安装依赖，这可能需要几分钟...]"
    npm ci
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

echo "[2/5] 检查配置文件..."
if [ ! -f ".env" ]; then
    echo "[正在创建配置文件...]"
    cp .env.example .env
fi

echo "[3/5] 检查数据库..."
if [ ! -f "prisma/dev.db" ]; then
    echo "[正在初始化数据库...]"
    npm run db:generate
    npm run db:migrate
fi

echo "[4/5] 启动服务..."
echo ""
echo "========================================"
echo "  AgentForge 已启动！"
echo "  访问地址: http://localhost:3000"
echo "========================================"
echo ""
echo "提示："
echo "  - 当前使用确定性模式（预设响应）"
echo "  - 如需真实 AI，请配置 Ollama 或 API Key"
echo "  - 按 Ctrl+C 停止服务"
echo ""

# Mac/Linux 自动打开浏览器
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
fi

npm run dev
