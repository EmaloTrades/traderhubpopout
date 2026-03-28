// ══════════════════════════════════════════════════════
// Preload — minimal contextBridge API
// Only exposes what the renderer absolutely needs
// ══════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (frameless window)
  minimize: () => ipcRenderer.send('window-drag', 'minimize'),
  close: () => ipcRenderer.send('window-drag', 'close'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window-drag', 'toggle-top'),

  // WebSocket bridge — send message to browser via main process
  sendToHub: (msg) => {
    if (msg && typeof msg.type === 'string') {
      ipcRenderer.send('ws-send', msg);
    }
  },

  // Receive messages from browser via main process
  onHubMessage: (callback) => {
    ipcRenderer.on('ws-message', (event, msg) => {
      if (msg && typeof msg.type === 'string') {
        callback(msg);
      }
    });
  },

  // Listen for always-on-top state changes
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (event, isOnTop) => {
      callback(isOnTop);
    });
  },
});
