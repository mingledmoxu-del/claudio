const { app, BrowserWindow, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let serverProcess;

const isDev = !app.isPackaged;

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const config = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
      config[key] = value;
    }
  });
  return config;
}

function startBackend() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'claudio.db');
  const cacheDir = path.join(userDataPath, 'cache');
  const logFile = path.join(userDataPath, 'server.log');

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // 1. 加载环境变量
  const envPath = isDev 
    ? path.join(__dirname, 'server', '.env') 
    : path.join(__dirname, 'server', '.env');
  
  const envConfig = parseEnv(envPath);

  const serverEntry = isDev 
    ? path.join(__dirname, 'server', 'src', 'index.ts') 
    : path.join(__dirname, 'server', 'dist', 'index.js');

  const env = { 
    ...process.env, 
    ...envConfig,
    NODE_ENV: isDev ? 'development' : 'production',
    DB_PATH: dbPath,
    AUDIO_CACHE_DIR: cacheDir,
    ELECTRON_RUN_AS_NODE: '1'
  };

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n\n--- Server Start: ${new Date().toISOString()} ---\n`);
  logStream.write(`Entry: ${serverEntry}\n`);

  const { spawn } = require('child_process');
  
  if (isDev) {
    serverProcess = spawn('npx', ['tsx', serverEntry], {
      cwd: path.join(__dirname, 'server'),
      env
    });
  } else {
    // 生产环境下，使用 Electron 自己的可执行文件作为 Node 运行
    serverProcess = spawn(process.execPath, [serverEntry], { 
      env,
      stdio: 'pipe' 
    });
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server]: ${data}`);
    logStream.write(data);
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error]: ${data}`);
    logStream.write(`ERROR: ${data}`);
  });

  serverProcess.on('exit', (code) => {
    logStream.write(`\n--- Server Exit: ${code} ---\n`);
  });
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
    : path.join(__dirname, 'client', 'dist', 'index.html');

  if (isDev) {
    mainWindow.loadURL(startUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(startUrl);
  }

  // 即使在生产环境，也允许通过快捷键打开调试工具协助排查
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.openDevTools();
    }
  });

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
