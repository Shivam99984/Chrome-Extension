# AI MCQ Assistant Pro (Practice Mode)

A working Chrome Extension (Manifest V3) + Node.js backend project that can parse MCQs on ASP.NET-style pages and suggest answers using OpenAI + lightweight RAG.

> Important: Use only on authorized training/practice environments.

## Key security upgrades

- Admin login now uses backend-issued token (`/auth/login`).
- Protected routes (`/solve`, `/study-material`, `/config/api-key`) require bearer token.
- OpenAI API key is stored encrypted at rest in `data/secure_config.json` (AES-256-GCM).
- Admin password supports hashed storage via `ADMIN_PASSWORD_HASH`.

## Project structure

- `manifest.json` - Chrome extension manifest
- `background.js` - extension control + backend relay + retries + auth token handling
- `content.js` - page scanning, profile-based selectors, fuzzy option matching, ASP.NET-safe next
- `popup.html` / `popup.js` / `styles.css` - control panel + metrics + CSV + manual verification
- `server.js` - Express API with secure admin flow + solve + RAG endpoints
- `embedding_script.js` - offline study-material ingestion and embedding index
- `data/study_material.txt` - source study content
- `data/vectors.json` - generated vector index
- `data/secure_config.json` - encrypted API key storage (created at runtime)

## Setup

1. Install backend deps:
   ```bash
   npm install
   ```
2. Create env:
   ```bash
   cp .env.example .env
   ```
3. Set one of:
   - `ADMIN_PASSWORD_HASH` (recommended)
   - or `ADMIN_PASSWORD` (fallback)
4. Start server:
   ```bash
   npm start
   ```
5. In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose this folder.

## Extension usage

1. Open extension popup.
2. Enter admin password and click **Unlock** (gets backend token).
3. (Optional) Save OpenAI API key from popup.
4. Upload study material `.txt` to rebuild vectors.
5. Set confidence threshold and click **Start**.
6. Use **Mark Last Correct/Wrong** for manual accuracy tracking.
7. Export logs via CSV anytime.

## Per-page selector profiles

Use **Selector Profiles JSON** in popup to customize extraction per host. Example:

```json
[
  {
    "id": "aspnet-prod",
    "hostPattern": "exam.example.com",
    "questionSelectors": ["#ctl00_ContentPlaceHolder1_lblQuestion", ".question-title"],
    "optionSelectors": ["#ctl00_ContentPlaceHolder1_rblOptions input[type='radio']"],
    "nextSelectors": ["#ctl00_ContentPlaceHolder1_btnNext", "button", "a"],
    "nextKeywords": ["next", "save and next"]
  }
]
```

## Notes

- For page-specific reliability, tune selector profiles instead of hardcoding one selector.
- Accuracy % is now based on manually verified results (correct/wrong), not auto-assumed correctness.
