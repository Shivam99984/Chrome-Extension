# AI MCQ Assistant Pro (Practice Mode)

A working Chrome Extension (Manifest V3) + Node.js backend project that can parse MCQs on ASP.NET-style pages and suggest answers using OpenAI + lightweight RAG.

> Important: Use only on authorized training/practice environments.

## Project structure

- `manifest.json` - Chrome extension manifest
- `background.js` - extension control + backend relay + retries
- `content.js` - page scanning, answer selection, ASP.NET-safe next
- `popup.html` / `popup.js` / `styles.css` - control panel + metrics + CSV
- `server.js` - Express API with `/solve`, runtime API-key config, study upload
- `embedding_script.js` - offline study-material ingestion and embedding index
- `data/study_material.txt` - source study content
- `data/vectors.json` - generated vector index

## Setup

1. Install backend deps:
   ```bash
   npm install
   ```
2. Create env:
   ```bash
   cp .env.example .env
   ```
3. Start server:
   ```bash
   npm start
   ```
4. In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose this folder.

## Add API key and upload study material from extension

1. Open extension popup.
2. In **OpenAI API Key**, paste your key and click **Save API Key**.
3. Choose a `.txt` file in **Study Material (txt)**.
4. Click **Upload & Rebuild RAG**.
5. After successful upload, the backend stores:
   - uploaded text in `data/study_material.txt`
   - vectors in `data/vectors.json`

## Usage

1. Open your authorized MCQ page.
2. Open extension popup.
3. Set confidence threshold.
4. Click **Start**.
5. Use **Stop**, **Clear Logs**, **Export CSV** as needed.

## Optional offline ingestion

If you prefer CLI ingestion instead of popup upload:

```bash
npm run ingest
```

## Notes

- For a page-specific deployment, fine-tune selectors in `content.js`.
- Backend accepts API key at runtime via `/config/api-key`.
- If Start or Save API Key fails, verify backend is running at `http://localhost:3000`.
