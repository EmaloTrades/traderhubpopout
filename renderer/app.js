// ══════════════════════════════════════════════════════
// Trader Hub — Pop-Out Checklist Overlay
// Renderer script — communicates with main process via contextBridge
// ══════════════════════════════════════════════════════

// ── Always-on-top state ──
window.electronAPI.onAlwaysOnTopChanged((isOnTop) => {
  const btn = document.getElementById('poPin');
  btn.classList.toggle('on', isOnTop);
  btn.title = isOnTop ? 'Always on top (active)' : 'Click to pin on top';
});

// ── WebSocket connection to Trader Hub browser tab ──
let ws = null;
let reconnectTimer = null;
const WS_URL = 'ws://127.0.0.1:19384';

function connectWS() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    updateConnectionStatus(true);
    // Request full state from browser
    sendMessage({ type: 'popout-ready' });
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleMessage(msg);
  };

  ws.onclose = () => {
    updateConnectionStatus(false);
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWS();
  }, 3000);
}

function sendMessage(msg) {
  // Send via WebSocket (to browser)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
  // Also send via IPC (main process can relay)
  window.electronAPI.sendToHub(msg);
}

function updateConnectionStatus(connected) {
  const dot = document.getElementById('poStatusDot');
  const text = document.getElementById('poStatusText');
  dot.classList.toggle('connected', connected);
  text.textContent = connected ? 'Connected to Trader Hub' : 'Waiting for Trader Hub…';
}

// ── Also listen for messages relayed through main process IPC ──
window.electronAPI.onHubMessage(handleMessage);

// ══════════════════════════════════════════════════════
// Message Handlers
// ══════════════════════════════════════════════════════
function handleMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'full-state':
      renderSections(msg.data.sections);
      updateVerdict(msg.data.verdict);
      document.getElementById('poLocked').classList.toggle('on', !!msg.data.locked);
      break;

    case 'toggle-from-main':
      toggleItemFromMain(msg.data);
      break;

    case 'verdict-update':
      updateVerdict(msg.data);
      break;
  }
}

// ══════════════════════════════════════════════════════
// Render Checklist Sections
// ══════════════════════════════════════════════════════
function renderSections(sections) {
  const el = document.getElementById('poSections');
  el.innerHTML = '';

  sections.forEach(sec => {
    if (sec.items.length === 0) return;

    const div = document.createElement('div');
    div.className = 'po-sec open';
    div.dataset.key = sec.key;

    const checkedCount = sec.items.filter(i => i.checked).length;

    // Section header
    const hdr = document.createElement('div');
    hdr.className = 'po-sec-hdr';
    hdr.innerHTML =
      '<span class="po-sec-num">' + escHtml(sec.num) + '</span>' +
      '<span class="po-sec-title">' + escHtml(sec.title) + '</span>' +
      '<span class="po-sec-count">' + checkedCount + '/' + sec.items.length + '</span>' +
      '<span class="po-sec-arrow">›</span>';
    hdr.addEventListener('click', () => div.classList.toggle('open'));
    div.appendChild(hdr);

    // Section body
    const body = document.createElement('div');
    body.className = 'po-sec-body';

    sec.items.forEach((item, idx) => {
      const ci = document.createElement('div');
      ci.className = 'po-ci' + (item.checked ? ' on' : '');
      ci.dataset.idx = idx;
      ci.innerHTML =
        '<div class="po-cbox">✓</div>' +
        '<div class="po-clabel">' + escHtml(item.label) + '</div>';
      ci.addEventListener('click', () => {
        ci.classList.toggle('on');
        const isChecked = ci.classList.contains('on');
        sendMessage({
          type: 'toggle',
          data: { cardKey: sec.key, itemIdx: idx, checked: isChecked }
        });
        updateSectionCount(div);
      });
      body.appendChild(ci);
    });

    div.appendChild(body);
    el.appendChild(div);
  });
}

// ── Toggle item from main window update ──
function toggleItemFromMain(data) {
  const sec = document.querySelector('[data-key="' + data.cardKey + '"]');
  if (!sec) return;
  const items = sec.querySelectorAll('.po-ci');
  const ci = items[data.itemIdx];
  if (ci) ci.classList.toggle('on', data.checked);
  updateSectionCount(sec);
}

// ── Update section counter ──
function updateSectionCount(secEl) {
  const total = secEl.querySelectorAll('.po-ci').length;
  const done = secEl.querySelectorAll('.po-ci.on').length;
  const countEl = secEl.querySelector('.po-sec-count');
  if (countEl) countEl.textContent = done + '/' + total;
}

// ══════════════════════════════════════════════════════
// Verdict Display
// ══════════════════════════════════════════════════════
function updateVerdict(v) {
  const pctEl = document.getElementById('poPct');
  const vEl = document.getElementById('poVerdict');
  const barEl = document.getElementById('poBarFill');
  const verdictWrap = document.getElementById('poVerdictBar');
  const pct = parseInt(v.pct) || 0;

  // Color tier based on percentage
  let color, tierClass;
  if (pct >= 87) { color = '#15e89a'; tierClass = 'green'; }
  else if (pct >= 65) { color = '#ffad14'; tierClass = 'amber'; }
  else if (pct >= 40) { color = '#ff3554'; tierClass = 'red'; }
  else { color = '#304050'; tierClass = 'dim'; }

  pctEl.textContent = pct + '%';
  pctEl.style.color = color;
  vEl.textContent = v.text;
  vEl.style.color = color;
  barEl.style.width = pct + '%';
  barEl.style.background = color;
  verdictWrap.className = 'po-verdict ' + tierClass;
}

// ── HTML escaping for XSS prevention ──
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Start connection ──
connectWS();
