const el = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  const node = el('status');
  node.textContent = msg;
  node.style.color = isError ? '#b91c1c' : '#065f46';
}

function toCsv(rows) {
  if (!rows.length) return 'timestamp,question,predictedAnswer,confidence,status,detail\n';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return `${headers.join(',')}\n${rows.map((r) => headers.map((h) => escape(r[h])).join(',')).join('\n')}`;
}

function normalizeBackendUrl(raw) {
  const value = String(raw || '').trim() || 'http://localhost:3000';
  return value.replace(/\/solve\/?$/i, '').replace(/\/$/, '');
}

function withUiErrorHandling(handler) {
  return async () => {
    try {
      await handler();
    } catch (error) {
      setStatus(String(error?.message || error || 'Unexpected popup error'), true);
    }
  };
}

async function refreshStats() {
  const { logs = [], threshold = 70, backendUrl = 'http://localhost:3000' } = await chrome.storage.local.get(['logs', 'threshold', 'backendUrl']);
  el('threshold').value = threshold;
  el('backendUrl').value = normalizeBackendUrl(backendUrl);

  const answered = logs.filter((l) => l.status === 'answered' || l.status === 'answered_no_next');
  const correct = logs.filter((l) => l.status === 'answered').length;
  const total = answered.length;
  const accuracy = total ? ((correct / total) * 100).toFixed(2) : '0.00';

  el('total').textContent = String(total);
  el('correct').textContent = String(correct);
  el('accuracy').textContent = `${accuracy}%`;
}

el('saveBackendBtn').addEventListener('click', withUiErrorHandling(async () => {
  const backendUrl = normalizeBackendUrl(el('backendUrl').value);
  const resp = await chrome.runtime.sendMessage({ type: 'SET_BACKEND_URL', backendUrl });
  setStatus(resp.ok ? `Backend URL saved: ${backendUrl}` : (resp.error || 'Failed to save backend URL.'), !resp.ok);
}));

el('checkBackendBtn').addEventListener('click', withUiErrorHandling(async () => {
  setStatus('Checking backend...');
  const resp = await chrome.runtime.sendMessage({ type: 'CHECK_BACKEND' });
  if (!resp.ok) {
    setStatus(resp.error || 'Backend check failed.', true);
    return;
  }
  setStatus(`Backend OK | vectors=${resp.data?.vectors ?? 0} | apiKey=${resp.data?.apiKeyConfigured ? 'set' : 'missing'}`);
}));

el('testSolveBtn').addEventListener('click', withUiErrorHandling(async () => {
  setStatus('Running Test Solve...');
  const resp = await chrome.runtime.sendMessage({ type: 'TEST_SOLVE' });
  if (!resp.ok) {
    setStatus(resp.error || 'Test Solve failed.', true);
    return;
  }
  const answer = resp.data?.answer || '<empty>';
  const confidence = resp.data?.confidence ?? 0;
  setStatus(`Test Solve OK | Answer: ${answer} | Confidence: ${confidence}`);
}));

el('saveApiKeyBtn').addEventListener('click', withUiErrorHandling(async () => {
  const apiKey = el('apiKey').value.trim();
  if (!apiKey) {
    setStatus('Please enter an API key first.', true);
    return;
  }

  const resp = await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey });
  setStatus(resp.ok ? 'API key saved on backend.' : (resp.error || 'API key save failed.'), !resp.ok);
}));

el('uploadStudyBtn').addEventListener('click', withUiErrorHandling(async () => {
  const file = el('studyFile').files?.[0];
  if (!file) {
    setStatus('Please choose a study material .txt file.', true);
    return;
  }

  const text = await file.text();
  if (!text.trim()) {
    setStatus('Study material file is empty.', true);
    return;
  }

  setStatus('Uploading study material and rebuilding vectors...');
  const resp = await chrome.runtime.sendMessage({ type: 'UPLOAD_STUDY_MATERIAL', text });
  setStatus(resp.ok ? `Study material uploaded. Indexed chunks: ${resp.data?.chunks ?? 0}` : (resp.error || 'Upload failed.'), !resp.ok);
}));

el('startBtn').addEventListener('click', withUiErrorHandling(async () => {
  const threshold = Number(el('threshold').value);
  await chrome.runtime.sendMessage({ type: 'UPDATE_THRESHOLD', threshold });
  const resp = await chrome.runtime.sendMessage({ type: 'SET_RUNNING', running: true });
  setStatus(resp.ok ? 'Automation started. (Refresh exam tab once if already open)' : resp.error || 'Could not start.', !resp.ok);
}));

el('stopBtn').addEventListener('click', withUiErrorHandling(async () => {
  await chrome.runtime.sendMessage({ type: 'SET_RUNNING', running: false });
  setStatus('Automation stopped.');
}));

el('clearLogsBtn').addEventListener('click', withUiErrorHandling(async () => {
  await chrome.storage.local.set({ logs: [] });
  await refreshStats();
  setStatus('Logs cleared.');
}));

el('exportCsvBtn').addEventListener('click', withUiErrorHandling(async () => {
  const { logs = [] } = await chrome.storage.local.get('logs');
  const csv = toCsv(logs);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mcq_logs_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('CSV exported.');
}));

chrome.storage.onChanged.addListener((changes) => {
  if (changes.logs || changes.threshold || changes.backendUrl) refreshStats();
});

refreshStats();
