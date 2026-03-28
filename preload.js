// ══════════════════════════════════════════════════════
// Preload — minimal contextBridge API
// Only exposes what the renderer absolutely needs
// ══════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (frameless window)
  minimize: () => ipcRenderer.send('window-action', 'minimize'),
  close: () => ipcRenderer.send('window-action', 'close'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window-action', 'toggle-top'),

  // Window opacity (0.3 – 1.0)
  setOpacity: (value) => ipcRenderer.send('set-opacity', value),

  // WebSocket bridge — send message to browser via main process
  sendToHub: (msg) => {
    if (msg && typeof msg.type === 'string') {
      ipcRenderer.send('ws-send', msg);
    }
  },

  // Receive messages from browser via main process
  onHubMessage: (callback) => {
    ipcRenderer.on('ws-message', (_event, msg) => {
      if (msg && typeof msg.type === 'string') {
        callback(msg);
      }
    });
  },

  // Listen for always-on-top state changes
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (_event, isOnTop) => {
      callback(isOnTop);
    });
  },
});
