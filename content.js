(() => {
  let busy = false;
  let observer = null;
  let lastRunAt = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  async function getState() {
    return chrome.storage.local.get(['running', 'threshold', 'minRateLimitMs', 'selectorProfiles']);
  }

  function normalize(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeOptionText(text) {
    return normalize(text)
      .toLowerCase()
      .replace(/^[a-d]\s*[\).:-]\s*/i, '')
      .replace(/[^a-z0-9\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    const aa = normalizeOptionText(a);
    const bb = normalizeOptionText(b);
    if (aa === bb) return 1;
    if (aa.includes(bb) || bb.includes(aa)) return 0.92;
    const sa = new Set(aa.split(' '));
    const sb = new Set(bb.split(' '));
    const inter = [...sa].filter((x) => sb.has(x)).length;
    const union = new Set([...sa, ...sb]).size || 1;
    return inter / union;
  }

  function getProfile(profiles) {
    const host = location.hostname.toLowerCase();
    return (profiles || []).find((p) => {
      if (!p.hostPattern || p.hostPattern === '*') return true;
      return host.includes(String(p.hostPattern).toLowerCase());
    }) || null;
  }

  function findQuestionElement(profile) {
    const selectors = profile?.questionSelectors?.join(',') || '[id*="lblQuestion"], [class*="lblQuestion"], h1,h2,h3,strong,p,span,div';
    const candidates = [...document.querySelectorAll(selectors)];
    return candidates.find((el) => {
      const text = normalize(el.textContent);
      return text.length > 8 && /question|q\.?\s*\d+/i.test(text);
    }) || null;
  }

  function getRadioOptions(profile) {
    const optionSelector = profile?.optionSelectors?.join(',') || 'input[type="radio"]';
    const radios = [...document.querySelectorAll(optionSelector)].filter((r) => r.matches('input[type="radio"]') && !r.disabled);
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
    await chrome.runtime.sendMessage({ type: 'APPEND_LOG', entry: { ...entry, timestamp: new Date().toISOString(), page: location.href } });
  }

  function safeNext(profile) {
    if (typeof window.__doPostBack === 'function') {
      window.__doPostBack('ctl00$ContentPlaceHolder1$btnNext', '');
      return true;
    }

    const selectors = profile?.nextSelectors?.join(',') || 'button,input[type="button"],input[type="submit"],a';
    const keywords = profile?.nextKeywords || ['next'];

    const next = [...document.querySelectorAll(selectors)].find((el) => {
      const txt = normalize(el.textContent || el.value).toLowerCase();
      return keywords.some((k) => txt.includes(String(k).toLowerCase()));
    });

    if (next) {
      next.click();
      return true;
    }
    return false;
  }

  function bestOptionMatch(options, predicted) {
    const ranked = options
      .map((o) => ({ ...o, score: similarity(o.text, predicted) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 0.45 ? ranked[0] : null;
  }

  async function attemptSolve() {
    const { running, threshold = 70, minRateLimitMs = 7000, selectorProfiles = [] } = await getState();
    if (!running || busy) return;

    const now = Date.now();
    if (now - lastRunAt < minRateLimitMs) return;

    const profile = getProfile(selectorProfiles);
    const questionEl = findQuestionElement(profile);
    const options = getRadioOptions(profile);
    if (!questionEl || options.length < 2) return;

    busy = true;
    lastRunAt = now;

    try {
      await simulateHumanBehavior();
      const question = normalize(questionEl.textContent);
      const optionTexts = options.map((o) => o.text);
      const solve = await chrome.runtime.sendMessage({ type: 'SOLVE_QUESTION', question, options: optionTexts });

      if (!solve?.ok) {
        await log({ question, predictedAnswer: '', confidence: 0, status: 'error', detail: solve?.error || 'Solve failed' });
        return;
      }

      const { answer, confidence } = solve.data || {};
      if (Number(confidence) < Number(threshold)) {
        await log({ question, predictedAnswer: answer || '', confidence: Number(confidence) || 0, status: 'skipped_low_confidence' });
        return;
      }

      const match = bestOptionMatch(options, answer || '');
      if (!match) {
        await log({ question, predictedAnswer: answer || '', confidence: Number(confidence) || 0, status: 'answer_not_found' });
        return;
      }

      match.input.click();
      await sleep(randomBetween(150, 500));
      const moved = safeNext(profile);
      await log({
        question,
        predictedAnswer: answer,
        matchedOption: match.text,
        matchScore: Number(match.score.toFixed(3)),
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
    observer = new MutationObserver(() => attemptSolve());
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
