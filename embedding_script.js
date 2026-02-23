require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INPUT_PATH = process.env.STUDY_MATERIAL_PATH || path.join(__dirname, 'data', 'study_material.txt');
const OUTPUT_PATH = path.join(__dirname, 'data', 'vectors.json');

function splitChunks(text, size = 800, overlap = 120) {
  const clean = text.replace(/\r/g, ' ').replace(/\n+/g, '\n').trim();
  const out = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}

async function embed(text) {
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
  return r.data[0].embedding;
}

(async () => {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Missing study material file: ${INPUT_PATH}`);
  }

  const material = fs.readFileSync(INPUT_PATH, 'utf8');
  const chunks = splitChunks(material).filter(Boolean);
  const vectors = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const embedding = await embed(chunk);
    vectors.push({ id: i + 1, chunk, embedding });
    console.log(`Embedded chunk ${i + 1}/${chunks.length}`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(vectors));
  console.log(`Saved ${vectors.length} vectors to ${OUTPUT_PATH}`);
})();
