# Single Powerful Codex Prompt: AI MCQ Assistant Pro

Use the following prompt exactly in Codex:

```text
You are a senior full-stack engineer.

Build a production-ready Chrome Extension (Manifest V3) called **AI MCQ Assistant Pro** that works specifically on an ASP.NET WebForms exam page like Vishal Mega Mart training HTML.

## Target page characteristics
- `<form id="aspnetForm">`
- `__doPostBack(eventTarget, eventArgument)`
- Dynamic IDs like `ctl00_ContentPlaceHolder1_*`
- MCQ radio options
- Next button with postback
- Server timer (e.g., `Sys.UI._Timer`)
- Hidden fields `__EVENTTARGET` and `__EVENTARGUMENT`

## Primary workflow
1. Scan entire page.
2. Detect question text + all options.
3. Send `{question, options}` to backend.
4. Backend uses OpenAI `gpt-4o-mini` + RAG over provided study material.
5. Receive `{ answer, confidence }`.
6. If confidence ≥ threshold, select matching radio option.
7. Move next using ASP.NET-safe logic.
8. Repeat automatically with observer + safeguards.

## Required deliverables
Generate complete working code for:
- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.js`
- `styles.css`
- `server.js`
- `embedding_script.js`
- folder structure
- setup + run instructions

Use clean modular production-grade code.

## Chrome extension requirements
### Content script (`content.js`)
- Robust MCQ extraction strategy:
  - Question from elements containing “Question”, id/class containing `lblQuestion`, and heading tags.
  - Extract radio inputs and associated labels.
- Human behavior simulation:
  - Random delay 2–5s
  - Slight random scroll
  - Random mouse movement simulation
  - Slight click timing jitter
  - Global minimum 7s rate limit between solved questions
- ASP.NET-safe next navigation:
  - If `__doPostBack` exists, call:
    `__doPostBack('ctl00$ContentPlaceHolder1$btnNext','')`
  - Else fallback: click visible button/link containing “Next”.
- Use `MutationObserver` to detect question/page updates and continue.
- Prevent duplicate execution loops using lock/state flags.
- Logging to storage for each attempt:
  - question
  - predicted answer
  - confidence
  - timestamp
  - success/failure/skipped reason

### Popup UI (`popup.html`, `popup.js`, `styles.css`)
Include:
- Start button
- Stop button
- Admin password field (required to start)
- Confidence threshold input
- Clear logs button
- Export CSV button
- Accuracy panel showing:
  - Total questions
  - Correct answers
  - Accuracy % (`correct/total*100`)

### Background script (`background.js`)
- Coordinate start/stop state.
- Relay messages securely between popup/content/backend.
- Centralized error logging and retry orchestration.

## Backend requirements (`server.js`)
Node.js + Express server with:
- `POST /solve`
- Accepts JSON `{ question, options }`
- Uses OpenAI Chat Completions model: `gpt-4o-mini`
- Adds RAG context from study material retrieval
- Returns strict JSON:
  `{ "answer": "<exact option text>", "confidence": <0-100> }`

### Reliability/security
- Admin password gate integration
- API rate limiting middleware
- Retry logic (max 2 retries for OpenAI call)
- Full `try/catch` error handling
- Input validation + safe fallback responses

## RAG requirements (`embedding_script.js` + backend integration)
Implement end-to-end lightweight RAG:
1. Ingest study material file(s)
2. Chunk text
3. Generate embeddings
4. Store vectors in in-memory or local persisted array/json
5. Cosine similarity search
6. Retrieve top 3 chunks per question
7. Inject chunks into LLM prompt

Use this answer prompt template:
“Answer ONLY using the study material below. Return the exact option text. Also return confidence between 0 and 100.”

## Decision policy
- If confidence < user threshold:
  - Do not click any option
  - Log as `skipped_low_confidence`

## Logging and analytics
- Track per-question status, latency, confidence, selected option, final result.
- Accuracy dashboard updates dynamically in popup.
- CSV export includes all log columns and ISO timestamps.

## Output formatting requirements
Return:
1. Folder tree
2. Full source code for every required file
3. `.env.example`
4. Install/run instructions for extension and backend
5. Notes on adapting selectors for similar ASP.NET pages

Do not return pseudocode. Return complete runnable code.
```
