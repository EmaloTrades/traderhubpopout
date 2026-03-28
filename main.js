// ══════════════════════════════════════════════════════
// Trader Hub — Always-On-Top Checklist Overlay
// Electron Main Process + Local WebSocket Server
// ══════════════════════════════════════════════════════

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// ── Security: disable hardware acceleration to reduce attack surface ──
app.disableHardwareAcceleration();

// ── Prevent multiple instances ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow = null;
let wss = null;

// ── WebSocket server config ──
const WS_PORT = 19384;
const WS_HOST = '127.0.0.1'; // localhost only — no external access

// Allowed origins for WebSocket connections
const ALLOWED_ORIGINS = [
  'null',                                      // local file:// origin
  'file://',                                   // Electron renderer
  'https://emalotrades.github.io',             // GitHub Pages deployment
  'http://localhost',                           // local dev
  'http://127.0.0.1',                          // local dev
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Electron internal connections have no origin
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

// ══════════════════════════════════════════════════════
// WebSocket Server — bridges browser ↔ Electron
// ══════════════════════════════════════════════════════
function startWSServer() {
  wss = new WebSocketServer({
    host: WS_HOST,
    port: WS_PORT,
    maxPayload: 64 * 1024, // 64KB max message — checklist state is tiny
    verifyClient: (info) => {
      const origin = info.origin || info.req.headers.origin;
      if (!isOriginAllowed(origin)) {
        console.log(`[WS] Rejected connection from origin: ${origin}`);
        return false;
      }
      // Only accept connections from localhost
      const ip = info.req.socket.remoteAddress;
      if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
        console.log(`[WS] Rejected connection from IP: ${ip}`);
        return false;
      }
      return true;
    },
  });

  wss.on('connection', (ws, req) => {
    console.log('[WS] Client connected');

    ws.on('message', (raw) => {
      // Validate message size
      if (raw.length > 64 * 1024) { ws.close(1009, 'Message too large'); return; }

      let msg;
      try { msg = JSON.parse(raw); } catch { return; } // silently drop malformed

      // Validate message structure — must have { type: string }
      if (!msg || typeof msg.type !== 'string') return;

      // Broadcast to all OTHER connected clients (browser ↔ electron relay)
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(raw.toString());
        }
      });

      // Forward to renderer via IPC
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ws-message', msg);
      }
    });

    ws.on('error', () => {}); // swallow errors on individual sockets
  });

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WS] Port ${WS_PORT} already in use — another instance may be running.`);
    }
  });

  console.log(`[WS] Server listening on ${WS_HOST}:${WS_PORT}`);
}

// ── Send message to all WS clients (called from renderer via IPC) ──
function broadcastToWS(msg) {
  if (!wss) return;
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// ══════════════════════════════════════════════════════
// Electron Window
// ══════════════════════════════════════════════════════
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 700,
    minWidth: 260,
    minHeight: 400,
    x: undefined, // OS decides initial position
    y: undefined,
    alwaysOnTop: true,
    alwaysOnTopLevel: 'floating',
    frame: false,           // frameless for compact overlay look
    icon: path.join(__dirname, 'icon.ico'),
    transparent: false,
    resizable: true,
    skipTaskbar: false,     // keep in taskbar so user can find it
    title: 'Trader Hub Checklist',
    backgroundColor: '#0a0d14',
    webPreferences: {
      // ── SECURITY ──
      nodeIntegration: false,        // no require() in renderer
      contextIsolation: true,        // separate JS contexts
      sandbox: true,                 // OS-level sandbox
      preload: path.join(__dirname, 'preload.js'),
      // Block dangerous features
      webviewTag: false,             // no <webview>
      allowRunningInsecureContent: false,
      enableBlinkFeatures: '',       // no experimental features
      spellcheck: false,
    },
  });

  // ── Security: strict CSP ──
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          "font-src https://fonts.gstatic.com;" +
          "script-src 'self';" +
          "connect-src 'self' ws://127.0.0.1:19384;" +
          "img-src 'self' data:;"
        ],
      },
    });
  });

  // ── Security: block all navigation away from our app ──
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // ── Security: block new window creation ──
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // ── Window drag support (frameless window) ──
  ipcMain.on('window-drag', (event, action) => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'close') mainWindow.close();
    if (action === 'toggle-top') {
      const isTop = mainWindow.isAlwaysOnTop();
      if (isTop) {
        mainWindow.setAlwaysOnTop(false);
      } else {
        mainWindow.setAlwaysOnTop(true, 'floating');
      }
      event.reply('always-on-top-changed', !isTop);
    }
  });

  // ── Forward renderer messages to WS clients ──
  ipcMain.on('ws-send', (event, msg) => {
    broadcastToWS(msg);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ══════════════════════════════════════════════════════
// App Lifecycle
// ══════════════════════════════════════════════════════
app.whenReady().then(() => {
  startWSServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (wss) { wss.close(); }
  app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── Security: block permission requests ──
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false); // deny all permission requests
  });
});
