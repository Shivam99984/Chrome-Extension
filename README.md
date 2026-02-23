# AI MCQ Assistant Pro (Practice Mode)

A working Chrome Extension (Manifest V3) + Node.js backend project that can parse MCQs on ASP.NET-style pages and suggest answers using OpenAI + lightweight RAG.

> Important: Use only on authorized training/practice environments.

## Project structure

- `manifest.json` - Chrome extension manifest
- `background.js` - extension control + backend relay + retries
- `content.js` - page scanning, answer selection, ASP.NET-safe next
- `popup.html` / `popup.js` / `styles.css` - control panel + metrics + CSV
- `server.js` - Express API with `/solve` and rate limiting
- `embedding_script.js` - study-material ingestion and embedding index
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
3. Put your study content in `data/study_material.txt`.
4. Build embeddings:
   ```bash
   npm run ingest
   ```
5. Start server:
   ```bash
   npm start
   ```
6. In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose this folder.

## Usage

1. Open your authorized MCQ page.
2. Open extension popup.
3. Enter admin password and click **Unlock**.
4. Set confidence threshold.
5. Click **Start**.
6. Use **Stop**, **Clear Logs**, **Export CSV** as needed.

## Notes

- For a page-specific deployment, fine-tune selectors in `content.js`.
- Backend expects OpenAI API access.
