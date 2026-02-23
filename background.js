const DEFAULT_SETTINGS = {
  running: false,
  threshold: 70,
  adminAuthenticated: false,
  minRateLimitMs: 7000,
  backendUrl: 'http://localhost:3000',
  selectorProfiles: [
    {
      id: 'default-aspnet',
      hostPattern: '*',
      questionSelectors: ['[id*="lblQuestion"]', '[class*="lblQuestion"]', 'h1', 'h2', 'h3', 'strong', 'p', 'span', 'div'],
      optionSelectors: ['input[type="radio"]'],
      nextSelectors: ['button', 'input[type="button"]', 'input[type="submit"]', 'a'],
      nextKeywords: ['next', 'submit', 'save and next']
    }
  ]
};

async function getBackendUrl() {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  return backendUrl || DEFAULT_SETTINGS.backendUrl;
}

async function getAuthHeaders(extra = {}) {
  const { adminToken } = await chrome.storage.local.get('adminToken');
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  return headers;
}

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
      try {
        const backendUrl = await getBackendUrl();
        const resp = await fetch(`${backendUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: message.password })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        await chrome.storage.local.set({ adminAuthenticated: true, adminToken: data.token });
        sendResponse({ ok: true });
      } catch (error) {
        await chrome.storage.local.set({ adminAuthenticated: false, adminToken: '' });
        sendResponse({ ok: false, error: String(error.message || error) });
      }
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
      const backendUrl = await getBackendUrl();
      const body = { question: message.question, options: message.options };
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const resp = await fetch(`${backendUrl}/solve`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify(body)
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
          }
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

    if (message.type === 'SAVE_API_KEY') {
      const backendUrl = await getBackendUrl();
      try {
        const resp = await fetch(`${backendUrl}/config/api-key`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ apiKey: message.apiKey })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: String(error.message || error) });
      }
      return;
    }

    if (message.type === 'UPLOAD_STUDY_MATERIAL') {
      const backendUrl = await getBackendUrl();
      try {
        const resp = await fetch(`${backendUrl}/study-material`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ text: message.text })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: String(error.message || error) });
      }
      return;
    }

    if (message.type === 'APPEND_LOG') {
      const { logs = [] } = await chrome.storage.local.get('logs');
      logs.push(message.entry);
      await chrome.storage.local.set({ logs });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'MARK_LAST_RESULT') {
      const { logs = [] } = await chrome.storage.local.get('logs');
      const idx = [...logs].reverse().findIndex((l) => l.status === 'answered' || l.status === 'answered_no_next');
      if (idx === -1) {
        sendResponse({ ok: false, error: 'No answered log found.' });
        return;
      }
      const realIdx = logs.length - 1 - idx;
      logs[realIdx].verified = message.result === 'correct' ? 'correct' : 'wrong';
      logs[realIdx].verifiedAt = new Date().toISOString();
      await chrome.storage.local.set({ logs });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unsupported message type.' });
  })();

  return true;
});
