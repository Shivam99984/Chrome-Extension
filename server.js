require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const INDEX_PATH = path.join(__dirname, 'data', 'vectors.json');

let vectorIndex = [];
if (fs.existsSync(INDEX_PATH)) {
  vectorIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

function dot(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i] * b[i];
  return total;
}

function mag(a) {
  return Math.sqrt(dot(a, a));
}

function cosine(a, b) {
  const denominator = mag(a) * mag(b);
  return denominator ? dot(a, b) / denominator : 0;
}

async function embed(text) {
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
  return r.data[0].embedding;
}

async function getTopChunks(question, topK = 3) {
  if (!vectorIndex.length) return [];
  const qv = await embed(question);
  return vectorIndex
    .map((item) => ({ ...item, score: cosine(qv, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
}

app.post('/solve', async (req, res) => {
  try {
    const adminPassword = req.headers['x-admin-password'];
    if (ADMIN_PASSWORD && adminPassword && adminPassword !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }

    const { question, options } = req.body || {};
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const chunks = await getTopChunks(question, 3);

    const system = 'You are an MCQ solver that must only use provided study material context.';
    const userPrompt = [
      'Answer ONLY using the study material below.',
      'Return the exact option text.',
      'Also return confidence between 0 and 100.',
      '',
      `Question: ${question}`,
      `Options: ${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
      '',
      `Study material:\n${chunks.join('\n---\n') || 'No context available.'}`,
      '',
      'Respond in JSON: {"answer":"...","confidence":87}'
    ].join('\n');

    let parsed = null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        });

        const text = completion.choices?.[0]?.message?.content?.trim() || '{}';
        parsed = JSON.parse(text.replace(/^```json/i, '').replace(/```$/i, '').trim());
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!parsed || typeof parsed.answer !== 'string') {
      throw lastError || new Error('Model response parsing failed');
    }

    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
    return res.json({ answer: parsed.answer, confidence });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || error) });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, vectors: vectorIndex.length }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
