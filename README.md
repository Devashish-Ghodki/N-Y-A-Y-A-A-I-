# Nyaya AI — India legal help prototype

A small full-stack prototype for Kuku assignment Problem 2. It gives people a plain-language way to describe a legal problem, ask follow-up questions, use browser speech recognition, and request an editable document draft.

## Run locally

Requires Node.js 18 or newer.

```sh
npm start
```

Open http://localhost:3000. The interface loads without a key; AI replies can use a key entered in the page under **AI settings**. Choose OpenAI or Google Gemini, select a model, paste that provider’s API key, and select **Use this key**. Gemini API keys can be created in [Google AI Studio](https://aistudio.google.com/app/apikey). The key is held in tab memory and sent to this app server over the request header when sending a request to the selected provider; it is not saved to local storage or logged by this server. Closing or refreshing the tab clears it. You can alternatively configure a server key:

```sh
OPENAI_API_KEY=your_key_here npm start
# or
GEMINI_API_KEY=your_key_here npm start
```

Optional: set `OPENAI_MODEL` (defaults to `gpt-4o-mini`) and `PORT` (defaults to `3000`). Server keys are read as `OPENAI_API_KEY` or `GEMINI_API_KEY` and used only by `server.js`; never put them in `public/` or commit them. Restart the server after setting it.

## What works

- Responsive dashboard and topic prompts inspired by the supplied mockup.
- Multi-turn conversation, structured case summaries, legal drafts, and role-play, routed through a server-side OpenAI or Gemini request.
- Browser speech-to-text using the browser's built-in Web Speech API (availability and Indian language coverage depend on browser/device settings).
- Plain text / Markdown attachment content can be included in the first prompt. Attachments remain in the browser until submitted.
- Conversation count is stored in local browser storage; the server does not persist case history.

## Limits and assumptions

- This is legal information and preparation, not a lawyer or a substitute for one. Model answers can still be wrong; verify important law, dates, procedure, and citations with official sources or a qualified Indian lawyer. The assistant prompt explicitly discourages made-up legal citations and asks it to identify uncertainty.
- The prototype does not retrieve or verify current Indian law. For production, connect answers to reviewed primary sources such as India Code and relevant official state/government sources, show citations, and maintain a lawyer-reviewed scope.
- PDF, Word, and image files are not parsed. The UI says so when those files are selected; paste relevant text instead. Uploaded text is sent to the configured AI provider when the user submits.
- Speech recognition is performed by the browser/device and may be sent to its provider. A production app should disclose provider behavior and offer a server transcription option.
- No authentication, encryption-at-rest, server-side case storage, or production abuse controls are included. Avoid entering highly sensitive personal information in this prototype.

## Workspace behavior

- **New case** starts a fresh conversation. **My cases** lists, reopens, and deletes cases saved in this browser's local storage; there is no account or server-side sync.
- **Organize my case** creates a structured fact/timeline/evidence summary. **Export conversation** downloads the full user/assistant transcript as JSON for raw-output submission. **Document assistant** starts a guided draft for common letters and complaints. **Know your rights** and **Practice & prepare** start focused prompts.
- Voice input asks the browser for microphone permission. On browsers with Web Speech support, speech is transcribed into the message box. Otherwise, it records a short clip and sends it to the selected provider for transcription; provider usage limits or fees may apply. Choose a language where available.
- The legal prompt is India-focused and warns the model against invented citations. The reference view links to India Code, the Constitution, NALSA, and eCourts. The app does not retrieve or index the full body of Indian law, so the model must not claim it checked a statute or law book unless that text was actually supplied or retrieved.


See [TEST_CASES.md](./TEST_CASES.md) for three synthetic Problem 2 scenarios and a quality checklist. Run them in separate cases and export each JSON conversation as its raw output.

## Public demo deployment (Render)

This repository includes `render.yaml` for a Render Node web service. Push the repository to GitHub, then in Render choose **New → Blueprint** and connect the repository. Render provisions the service from the Blueprint and assigns an HTTPS `onrender.com` URL. The free service may sleep after 15 minutes idle and can take about a minute to wake; this is suitable for a short prototype review, not production use. No API key is needed in Render because each user supplies their provider key in AI settings. Never add real API keys to GitHub or the Blueprint.

The app stores each visitor's cases only in that visitor's browser. Voice recordings sent through fallback transcription and chat text are transmitted to the selected AI provider. The app has no account system or server-side case storage; keep this demo limited to fictional/test scenarios and do not submit real client data.
