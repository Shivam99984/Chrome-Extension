(() => {
  let busy = false;
  let observer = null;
  let lastRunAt = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  async function getState() {
    return chrome.storage.local.get(['running', 'threshold', 'minRateLimitMs']);
  }

  function normalize(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  function findQuestionElement() {
    const candidates = [
      ...document.querySelectorAll('[id*="lblQuestion"], [class*="lblQuestion"]'),
      ...document.querySelectorAll('h1,h2,h3,h4,h5,strong,p,span,div')
    ];

    return candidates.find((el) => {
      const text = normalize(el.textContent);
      return text.length > 8 && /question|q\.?\s*\d+/i.test(text);
    }) || null;
  }

  function getRadioOptions() {
    const radios = [...document.querySelectorAll('input[type="radio"]')].filter((r) => !r.disabled);
    return radios.map((input, i) => {
      const label =
        document.querySelector(`label[for="${CSS.escape(input.id || '')}"]`) ||
        input.closest('label') ||
        input.parentElement;
      const text = normalize(label?.textContent || input.value || `Option ${i + 1}`);
      return { input, text };
    }).filter((o) => !!o.text);
  }

  async function simulateHumanBehavior() {
    window.scrollBy({ top: randomBetween(10, 80), left: 0, behavior: 'smooth' });
    for (let i = 0; i < 4; i += 1) {
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: randomBetween(20, Math.max(21, window.innerWidth - 20)),
        clientY: randomBetween(20, Math.max(21, window.innerHeight - 20)),
        bubbles: true
      }));
      await sleep(randomBetween(80, 220));
    }
    await sleep(randomBetween(2000, 5000));
  }

  async function log(entry) {
    await chrome.runtime.sendMessage({ type: 'APPEND_LOG', entry: { ...entry, timestamp: new Date().toISOString() } });
  }

  function safeNext() {
    if (typeof window.__doPostBack === 'function') {
      window.__doPostBack('ctl00$ContentPlaceHolder1$btnNext', '');
      return true;
    }
    const next = [...document.querySelectorAll('button,input[type="button"],input[type="submit"],a')]
      .find((el) => /next/i.test(normalize(el.textContent || el.value)));
    if (next) {
      next.click();
      return true;
    }
    return false;
  }

  async function attemptSolve() {
    const { running, threshold = 70, minRateLimitMs = 7000 } = await getState();
    if (!running || busy) return;

    const now = Date.now();
    if (now - lastRunAt < minRateLimitMs) return;

    const questionEl = findQuestionElement();
    const options = getRadioOptions();
    if (!questionEl || options.length < 2) return;

    busy = true;
    lastRunAt = now;

    try {
      await simulateHumanBehavior();
      const question = normalize(questionEl.textContent);
      const optionTexts = options.map((o) => o.text);
      const solve = await chrome.runtime.sendMessage({
        type: 'SOLVE_QUESTION',
        question,
        options: optionTexts
      });

      if (!solve?.ok) {
        await log({ question, predictedAnswer: '', confidence: 0, status: 'error', detail: solve?.error || 'Solve failed' });
        return;
      }

      const { answer, confidence } = solve.data || {};
      if (Number(confidence) < Number(threshold)) {
        await log({ question, predictedAnswer: answer || '', confidence: Number(confidence) || 0, status: 'skipped_low_confidence' });
        return;
      }

      const match = options.find((o) => normalize(o.text).toLowerCase() === normalize(answer).toLowerCase())
        || options.find((o) => normalize(o.text).toLowerCase().includes(normalize(answer).toLowerCase()));

      if (!match) {
        await log({ question, predictedAnswer: answer || '', confidence: Number(confidence) || 0, status: 'answer_not_found' });
        return;
      }

      match.input.click();
      await sleep(randomBetween(150, 500));
      const moved = safeNext();
      await log({
        question,
        predictedAnswer: answer,
        confidence: Number(confidence) || 0,
        status: moved ? 'answered' : 'answered_no_next'
      });
    } catch (error) {
      await log({ status: 'exception', detail: String(error) });
    } finally {
      busy = false;
    }
  }

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      attemptSolve();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.running) {
      if (changes.running.newValue) {
        setupObserver();
        attemptSolve();
      } else if (observer) {
        observer.disconnect();
      }
    }
  });

  setupObserver();
  attemptSolve();
})();
