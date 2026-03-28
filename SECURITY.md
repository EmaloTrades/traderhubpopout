# Security — Trader Hub Desktop Overlay

## What this app does
A lightweight always-on-top checklist overlay that syncs with your Trader Hub browser tab via a local WebSocket connection.

## What this app does NOT do
- Access the internet (all traffic is `127.0.0.1` only)
- Read or write files on your system
- Access your trading accounts, broker data, or credentials
- Send telemetry, analytics, or crash reports
- Auto-update (you control when to update)

## Technical security measures

| Protection | Implementation |
|-----------|---------------|
| Node.js isolation | `nodeIntegration: false` — renderer cannot access Node.js |
| Context isolation | `contextIsolation: true` — separate JS contexts |
| OS sandbox | `sandbox: true` — Chromium sandbox enabled |
| CSP headers | Strict Content-Security-Policy on all responses |
| WebSocket binding | `127.0.0.1` only — no external network access |
| Origin validation | Only accepts connections from known Trader Hub origins |
| IP validation | Rejects any non-localhost connections |
| No navigation | `will-navigate` blocked — can't redirect to external URLs |
| No new windows | `setWindowOpenHandler` returns `deny` |
| No permissions | All permission requests (camera, mic, etc.) denied |
| No webview | `webviewTag: false` |
| No eval | CSP blocks `eval()` and inline scripts |
| Max payload | WebSocket messages capped at 64KB |

## Verification

### SHA256 Checksum
Every release includes a SHA256 hash. Verify your download:

```powershell
certutil -hashfile "Trader Hub Checklist 1.0.0.exe" SHA256
```

### VirusTotal
Every release is scanned on [VirusTotal](https://www.virustotal.com). The scan report link is published alongside each release.

### Source Code
This app is open source. You can audit every line of code:
- `main.js` — Electron main process + WebSocket server
- `preload.js` — Minimal contextBridge API (4 functions exposed)
- `renderer/` — Pure HTML/CSS/JS UI (no frameworks, no dependencies)

## Data flow

```
Browser Tab (Trader Hub)
    ↕ WebSocket (ws://127.0.0.1:19384)
Electron Main Process
    ↕ IPC (contextBridge)
Electron Renderer (Checklist UI)
```

All communication stays on your machine. No data leaves localhost.
