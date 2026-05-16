#!/bin/bash

# --- 颜色定义 ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # 无颜色

echo -e "${BLUE}========================================"
echo -e "      Claudio AI Radio 一键启动脚本"
echo -e "========================================${NC}"

# 1. 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}错误: 未检测到 Node.js，请先安装 Node.js。${NC}"
    exit 1
fi

# 获取项目根目录
ROOT_DIR=$(pwd)

# 2. 准备后端
echo -e "\n${BLUE}[1/2] 正在准备后端服务...${NC}"
cd "$ROOT_DIR/server"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}正在安装后端依赖 (首次启动可能较慢)...${NC}"
    npm install
fi

# 3. 准备前端
echo -e "\n${BLUE}[2/2] 正在准备前端界面...${NC}"
cd "$ROOT_DIR/client"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}正在安装前端依赖...${NC}"
    npm install
fi

# 4. 启动服务
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  所有准备工作已就绪！正在启动服务...${NC}"
echo -e "${YELLOW}  后端: http://localhost:3000${NC}"
echo -e "${YELLOW}  前端: http://localhost:5173${NC}"
echo -e "${GREEN}========================================${NC}\n"

# 使用 trap 捕获退出信号，确保关闭脚本时同时关闭前后端进程
trap "kill 0" EXIT

# 同时启动后端和前端
cd "$ROOT_DIR/server" && npm run dev & 
cd "$ROOT_DIR/client" && npm run dev &

# 等待所有后台进程
wait
