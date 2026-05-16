const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

function startBackend() {
  // 在生产环境下自动拉起后端
  if (!isDev) {
    const serverPath = path.join(process.resourcesPath, 'server', 'dist', 'index.js');
    // 如果 dist 不存在，尝试相对路径
    const fallbackPath = path.join(__dirname, 'server', 'dist', 'index.js');
    const finalPath = fs.existsSync(serverPath) ? serverPath : fallbackPath;

    console.log('Starting backend at:', finalPath);

    serverProcess = spawn('node', [finalPath], {
      cwd: path.dirname(finalPath),
      env: { ...process.env, NODE_ENV: 'production' }
    });

    serverProcess.stdout.on('data', (data) => console.log(`Server: ${data}`));
    serverProcess.stderr.on('data', (data) => console.error(`Server Error: ${data}`));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 允许跨域加载本地资源
    },
  });

  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, 'client/dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // 开发环境下自动打开调试工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});
