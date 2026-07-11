const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const DEV_SERVER_URL = 'http://localhost:3000';
const PING_INTERVAL_MS = 500;
const PING_TIMEOUT_MS = 30000;

let nextServer = null;
let mainWindow = null;

function resolveServerCommand() {
  const isWindows = process.platform === 'win32';
  return {
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['start'],
  };
}

function waitForServer(url) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + PING_TIMEOUT_MS;
    let settled = false;

    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 400) {
          if (!settled) {
            settled = true;
            resolve();
          }
        } else {
          retry();
        }
      });

      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (settled) return;
      if (Date.now() > deadline) {
        settled = true;
        reject(new Error('Timed out waiting for ' + url + ' to become ready'));
        return;
      }
      setTimeout(attempt, PING_INTERVAL_MS);
    };

    attempt();
  });
}

function startNextServer() {
  const { command, args } = resolveServerCommand();
  nextServer = spawn(command, args, {
    cwd: app.getAppPath(),
    env: process.env,
    stdio: 'inherit',
  });

  nextServer.on('exit', (code) => {
    if (code && code !== 0) {
      console.error('Next.js server exited with code ' + code);
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  startNextServer();

  try {
    await waitForServer(DEV_SERVER_URL);
    await mainWindow.loadURL(DEV_SERVER_URL);
  } catch (err) {
    console.error('Failed to start the bundled server:', err);
    mainWindow.loadURL(
      'data:text/html,<h2>Failed to start server</h2><pre>' + err.message + '</pre>'
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
