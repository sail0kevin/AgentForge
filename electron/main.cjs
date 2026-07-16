const { app, BrowserWindow, utilityProcess } = require('electron');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const fs = require('fs');
const http = require('http');
const path = require('path');

const DEV_SERVER_URL = 'http://localhost:3000';
const PING_INTERVAL_MS = 500;
const PING_TIMEOUT_MS = 30000;

const customUserDataDir = process.env.AGENTFORGE_USER_DATA_DIR?.trim();
if (customUserDataDir) {
  const resolvedUserDataDir = path.resolve(customUserDataDir);
  fs.mkdirSync(resolvedUserDataDir, { recursive: true });
  app.setPath('userData', resolvedUserDataDir);
}

let nextServer = null;
let mainWindow = null;
let desktopSecrets = null;

function getDesktopSecrets() {
  if (desktopSecrets) return desktopSecrets;
  const secretsFile = path.join(app.getPath('userData'), 'desktop-secrets.json');

  if (fs.existsSync(secretsFile)) {
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
    } catch {
      throw new Error('Desktop secrets file is invalid. Restore or remove it before restarting AgentForge.');
    }
    if (typeof saved.sessionSecret !== 'string' || saved.sessionSecret.length < 32 ||
        typeof saved.encryptionMasterKey !== 'string' || saved.encryptionMasterKey.length < 32) {
      throw new Error('Desktop secrets file is incomplete. Restore or remove it before restarting AgentForge.');
    }
    desktopSecrets = saved;
    return desktopSecrets;
  }

  desktopSecrets = {
    sessionSecret: crypto.randomBytes(48).toString('base64url'),
    encryptionMasterKey: crypto.randomBytes(48).toString('base64url'),
  };
  fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
  fs.writeFileSync(secretsFile, JSON.stringify(desktopSecrets, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return desktopSecrets;
}

function getRuntimeEnvironment() {
  const databaseFile = path.join(app.getPath('userData'), 'agentforge.db');
  const secrets = getDesktopSecrets();
  return {
    ...process.env,
    APP_AUTH_MODE: 'session',
    ELECTRON_DESKTOP: '1',
    SESSION_SECRET: secrets.sessionSecret,
    ENCRYPTION_MASTER_KEY: secrets.encryptionMasterKey,
    HOSTNAME: '127.0.0.1',
    PORT: '3000',
    DATABASE_URL: `file:${databaseFile}`,
  };
}

function appendRuntimeLog(message) {
  const logFile = path.join(app.getPath('userData'), 'runtime.log');
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${String(message)}\n`, 'utf8');
}

async function prepareDatabase() {
  const appPath = app.getAppPath();
  const migrationsPath = path.join(appPath, 'prisma', 'migrations');
  const databaseFile = path.join(app.getPath('userData'), 'agentforge.db');
  if (!fs.existsSync(migrationsPath)) throw new Error('Packaged Prisma migrations are missing.');

  const db = new Database(databaseFile);
  try {
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );`);

    const applied = db.prepare('SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').all();
    const appliedByName = new Map(applied.map((row) => [row.migration_name, row.checksum]));
    const migrations = fs.readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migrationName of migrations) {
      const sqlPath = path.join(migrationsPath, migrationName, 'migration.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const previousChecksum = appliedByName.get(migrationName);
      if (previousChecksum) {
        if (previousChecksum !== checksum) throw new Error(`Migration checksum mismatch: ${migrationName}`);
        continue;
      }

      const applyMigration = db.transaction(() => {
        db.exec(sql);
        db.prepare(`INSERT INTO "_prisma_migrations"
          ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
          VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)`).run(crypto.randomUUID(), checksum, migrationName);
      });
      applyMigration();
    }
  } finally {
    db.close();
  }
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
  const appPath = app.getAppPath();
  const nextCli = path.join(appPath, 'node_modules', 'next', 'dist', 'bin', 'next');
  nextServer = utilityProcess.fork(nextCli, ['start', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: appPath,
    env: getRuntimeEnvironment(),
    stdio: 'pipe',
    serviceName: 'AgentForge Next.js server',
  });

  nextServer.stdout?.on('data', (chunk) => appendRuntimeLog(chunk.toString().trimEnd()));
  nextServer.stderr?.on('data', (chunk) => appendRuntimeLog(chunk.toString().trimEnd()));
  nextServer.on('error', (error) => {
    console.error('Next.js utility process error:', error);
    appendRuntimeLog(`Next.js utility process error: ${error}`);
  });
  nextServer.on('exit', (code) => {
    appendRuntimeLog(`Next.js server exited with code ${code}`);
    if (code && code !== 0) {
      console.error('Next.js server exited with code ' + code);
    }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
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

  try {
    await prepareDatabase();
    startNextServer();
    await waitForServer(DEV_SERVER_URL);
    await mainWindow.loadURL(DEV_SERVER_URL);
  } catch (err) {
    console.error('Failed to start the bundled server:', err);
    appendRuntimeLog(`Failed to start the bundled server: ${err?.stack || err}`);
    mainWindow.loadURL(
      'data:text/html,<h2>Failed to start server</h2><pre>' + escapeHtml(err.message) + '</pre>'
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
