#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}       Claudio AI Music 一键打包 Windows 脚本       ${NC}"
echo -e "${BLUE}==================================================${NC}"

# 设置国内镜像环境变量，加速下载
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

# 1. 环境检查
echo -e "\n${YELLOW}[1/5] 正在检查环境依赖...${NC}"
if ! command -v wine &> /dev/null; then
    echo -e "${RED}警告: 未检测到 wine。打包 Windows 版本可能失败。${NC}"
    echo -e "尝试运行以下命令修复: sudo apt-get update && sudo apt-get install wine64 -y"
    # 这里不直接 exit，有些简单的打包场景可能勉强能过，或者让 electron-builder 报错
fi

# 2. 根目录依赖安装
echo -e "\n${YELLOW}[2/5] 正在安装根目录打包工具...${NC}"
npm install
if [ $? -ne 0 ]; then echo -e "${RED}根目录依赖安装失败${NC}"; exit 1; fi

# 3. 前端构建
echo -e "\n${YELLOW}[3/5] 正在构建前端 UI (Vite)...${NC}"
cd client
npm install && npm run build
if [ $? -ne 0 ]; then echo -e "${RED}前端构建失败${NC}"; exit 1; fi
cd ..

# 4. 后端编译
echo -e "\n${YELLOW}[4/5] 正在编译后端服务 (TypeScript)...${NC}"
cd server
npm install && npm run build
if [ $? -ne 0 ]; then echo -e "${RED}后端编译失败${NC}"; exit 1; fi
cd ..

# 5. 执行打包
echo -e "\n${YELLOW}[5/5] 正在执行 Electron 跨平台打包 (Windows x64)...${NC}"
echo -e "${BLUE}提示: 正在使用国内镜像源，下载速度应显著提升。${NC}"
npm run dist:win

if [ $? -eq 0 ]; then
    echo -e "\n${BLUE}==================================================${NC}"
    echo -e "${GREEN}恭喜！打包成功！${NC}"
    echo -e "${GREEN}安装包路径: ${NC}${YELLOW}dist_electron/Claudio AI Music Setup 1.0.0.exe${NC}"
    echo -e "${BLUE}==================================================${NC}"
else
    echo -e "\n${RED}==================================================${NC}"
    echo -e "${RED}打包过程中出现错误。${NC}"
    echo -e "${YELLOW}可能的原因:${NC}"
    echo -e "1. Wine 环境未正确安装 (sudo apt-get install wine64)"
    echo -e "2. 网络连接波动"
    echo -e "3. 文件读写权限问题"
    echo -e "${RED}==================================================${NC}"
fi
