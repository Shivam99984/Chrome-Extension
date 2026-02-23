const el = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  const node = el('status');
  node.textContent = msg;
  node.style.color = isError ? '#b91c1c' : '#065f46';
}

function toCsv(rows) {
  if (!rows.length) return 'timestamp,page,question,predictedAnswer,matchedOption,matchScore,confidence,status,verified,detail\n';
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return `${headers.join(',')}\n${rows.map((r) => headers.map((h) => escape(r[h])).join(',')).join('\n')}`;
}

async function refreshStats() {
  const { logs = [], threshold = 70, selectorProfiles = [] } = await chrome.storage.local.get(['logs', 'threshold', 'selectorProfiles']);
  el('threshold').value = threshold;
  el('profilesJson').value = JSON.stringify(selectorProfiles, null, 2);

  const answered = logs.filter((l) => l.status === 'answered' || l.status === 'answered_no_next');
  const correct = logs.filter((l) => l.verified === 'correct').length;
  const wrong = logs.filter((l) => l.verified === 'wrong').length;
  const totalVerified = correct + wrong;
  const accuracy = totalVerified ? ((correct / totalVerified) * 100).toFixed(2) : '0.00';

  el('total').textContent = String(answered.length);
  el('correct').textContent = String(correct);
  el('wrong').textContent = String(wrong);
  el('accuracy').textContent = `${accuracy}%`;
}

el('authBtn').addEventListener('click', async () => {
  const password = el('adminPassword').value;
  const resp = await chrome.runtime.sendMessage({ type: 'AUTH_ADMIN', password });
  setStatus(resp.ok ? 'Admin unlocked (token issued).' : (resp.error || 'Invalid password.'), !resp.ok);
});

el('saveApiKeyBtn').addEventListener('click', async () => {
  const apiKey = el('apiKey').value.trim();
  if (!apiKey) {
    setStatus('Please enter an API key first.', true);
    return;
  }
  const resp = await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey });
  setStatus(resp.ok ? 'API key saved securely on backend.' : (resp.error || 'API key save failed.'), !resp.ok);
});

el('uploadStudyBtn').addEventListener('click', async () => {
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
});

el('saveProfilesBtn').addEventListener('click', async () => {
  try {
    const parsed = JSON.parse(el('profilesJson').value);
    if (!Array.isArray(parsed)) throw new Error('Profiles must be a JSON array.');
    await chrome.storage.local.set({ selectorProfiles: parsed });
    setStatus('Selector profiles saved.');
  } catch (error) {
    setStatus(`Invalid profiles JSON: ${error.message || error}`, true);
  }
});

el('startBtn').addEventListener('click', async () => {
  const threshold = Number(el('threshold').value);
  await chrome.runtime.sendMessage({ type: 'UPDATE_THRESHOLD', threshold });
  const resp = await chrome.runtime.sendMessage({ type: 'SET_RUNNING', running: true });
  setStatus(resp.ok ? 'Automation started.' : resp.error || 'Could not start.', !resp.ok);
});

el('stopBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_RUNNING', running: false });
  setStatus('Automation stopped.');
});

el('markCorrectBtn').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'MARK_LAST_RESULT', result: 'correct' });
  setStatus(resp.ok ? 'Last answered question marked correct.' : (resp.error || 'Mark failed.'), !resp.ok);
  await refreshStats();
});

el('markWrongBtn').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'MARK_LAST_RESULT', result: 'wrong' });
  setStatus(resp.ok ? 'Last answered question marked wrong.' : (resp.error || 'Mark failed.'), !resp.ok);
  await refreshStats();
});

el('clearLogsBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ logs: [] });
  await refreshStats();
  setStatus('Logs cleared.');
});

el('exportCsvBtn').addEventListener('click', async () => {
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
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.logs || changes.threshold || changes.selectorProfiles) refreshStats();
});

refreshStats();
