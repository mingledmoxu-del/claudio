# Claudio AI Music Radio Studio

Claudio AI Music 是一款基于 Electron 开发的 AI 音乐电台工作室。它集成了 AI 对话、实时天气和网易云音乐，为用户提供智能化的音乐播放体验。

## 🚀 核心功能

- **AI 音乐生成与播放**：集成 OpenAI 与网易云音乐 API。
- **实时电台体验**：具备语音合成 (TTS) 功能，模拟真实电台播报。
- **3D 视觉界面**：基于 React Three Fiber 构建的现代感视觉效果。
- **多端同步**：利用 Socket.io 实现前端与后端的实时通信。
- **跨平台支持**：支持打包为 Windows 桌面应用。

## 📂 项目结构

```text
.
├── client/           # 前端界面 (React + Vite + Three.js)
├── server/           # 后端服务 (Node.js + Express + SQLite)
├── main.js           # Electron 入口文件
├── package.json      # 根目录配置与启动脚本
└── .gitignore        # Git 忽略配置
```

## 🛠 快速开始

### 1. 克隆项目
```bash
git clone git@github.com:mingledmoxu-del/claudio.git
cd claudio
```

### 2. 安装依赖
分别在根目录、客户端和服务端安装依赖：

```bash
# 根目录安装 (Electron 及其工具)
npm install

# 客户端安装
cd client && npm install

# 服务端安装
cd ../server && npm install
```

### 3. 环境配置
在 `server/` 目录下，你会发现一个 `.env.example` 文件。请将其复制并命名为 `.env`，然后填写你的 API 密钥：

```bash
cp server/.env.example server/.env
# 使用编辑器打开 server/.env 并填写配置
```

### 4. 开发模式运行
返回根目录并启动开发环境（将同时启动前端、后端和 Electron）：

```bash
npm run dev
```

## 📦 打包发布

目前支持打包为 Windows 可执行文件：

```bash
npm run dist:win
```
打包后的文件将存放在 `dist_electron/` 目录中。

## 🧰 技术栈

- **前端**: React, TypeScript, Vite, Three.js, Framer Motion, Tailwind CSS
- **后端**: Node.js, Express, Socket.io, SQLite (better-sqlite3), OpenAI API
- **桌面端**: Electron, Electron Builder

## 📜 许可证

本项目采用 [ISC](LICENSE) 许可证。
