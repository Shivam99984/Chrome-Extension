const DEFAULT_SETTINGS = {
  running: false,
  threshold: 70,
  adminAuthenticated: false,
  minRateLimitMs: 7000,
  backendUrl: 'http://localhost:3000/solve'
};

const ADMIN_PASSWORD = 'ChangeMe123!';

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) next[k] = v;
  }
  if (Object.keys(next).length) await chrome.storage.local.set(next);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'AUTH_ADMIN') {
      const ok = message.password === ADMIN_PASSWORD;
      await chrome.storage.local.set({ adminAuthenticated: ok });
      sendResponse({ ok });
      return;
    }

    if (message.type === 'SET_RUNNING') {
      const { adminAuthenticated } = await chrome.storage.local.get('adminAuthenticated');
      if (!adminAuthenticated && message.running) {
        sendResponse({ ok: false, error: 'Admin authentication required.' });
        return;
      }
      await chrome.storage.local.set({ running: !!message.running });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'UPDATE_THRESHOLD') {
      await chrome.storage.local.set({ threshold: Number(message.threshold) || 70 });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'SOLVE_QUESTION') {
      const { backendUrl } = await chrome.storage.local.get('backendUrl');
      const body = { question: message.question, options: message.options };
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const resp = await fetch(backendUrl || DEFAULT_SETTINGS.backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          sendResponse({ ok: true, data });
          return;
        } catch (error) {
          lastError = error;
        }
      }
      sendResponse({ ok: false, error: String(lastError?.message || lastError || 'Unknown error') });
      return;
    }

    if (message.type === 'APPEND_LOG') {
      const { logs = [] } = await chrome.storage.local.get('logs');
      logs.push(message.entry);
      await chrome.storage.local.set({ logs });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unsupported message type.' });
  })();

  return true;
});
