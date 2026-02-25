const DEFAULT_SETTINGS = {
  running: false,
  threshold: 70,
  minRateLimitMs: 7000,
  backendUrl: 'http://localhost:3000'
};

function normalizeBackendUrl(raw) {
  const value = String(raw || '').trim() || DEFAULT_SETTINGS.backendUrl;
  return value.replace(/\/solve\/?$/i, '').replace(/\/$/, '');
}

async function getBaseUrl() {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  const baseUrl = normalizeBackendUrl(backendUrl);
  await chrome.storage.local.set({ backendUrl: baseUrl });
  return baseUrl;
}

async function ensureContentScriptInActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    return { ok: false, error: 'Open your exam page tab (http/https) and try Start again.' };
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PING_CONTENT' });
    return { ok: true };
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Could not inject content script: ${String(error.message || error)}` };
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) next[k] = v;
  }

  const migratedBackendUrl = normalizeBackendUrl(existing.backendUrl || next.backendUrl);
  next.backendUrl = migratedBackendUrl;

  await chrome.storage.local.set(next);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'SET_RUNNING') {
      if (message.running) {
        const injected = await ensureContentScriptInActiveTab();
        if (!injected.ok) {
          sendResponse({ ok: false, error: injected.error });
          return;
        }
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

    if (message.type === 'SET_BACKEND_URL') {
      const baseUrl = normalizeBackendUrl(message.backendUrl);
      await chrome.storage.local.set({ backendUrl: baseUrl });
      sendResponse({ ok: true, data: { backendUrl: baseUrl } });
      return;
    }

    if (message.type === 'CHECK_BACKEND') {
      try {
        const baseUrl = await getBaseUrl();
        const resp = await fetch(`${baseUrl}/health`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: `Backend check failed: ${String(error.message || error)}` });
      }
      return;
    }


    if (message.type === 'TEST_SOLVE') {
      const baseUrl = await getBaseUrl();
      const body = {
        question: 'Which color is typically associated with the sky on a clear day?',
        options: ['Green', 'Blue', 'Red', 'Yellow']
      };

      try {
        const resp = await fetch(`${baseUrl}/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: `Test Solve failed: ${String(error.message || error)}` });
      }
      return;
    }

    if (message.type === 'SOLVE_QUESTION') {
      const baseUrl = await getBaseUrl();
      const body = { question: message.question, options: message.options };
      let lastError = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const resp = await fetch(`${baseUrl}/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText || `HTTP ${resp.status}`);
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
      const baseUrl = await getBaseUrl();
      try {
        const resp = await fetch(`${baseUrl}/config/api-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      const baseUrl = await getBaseUrl();
      try {
        const resp = await fetch(`${baseUrl}/study-material`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

    sendResponse({ ok: false, error: 'Unsupported message type.' });
  })();

  return true;
});
