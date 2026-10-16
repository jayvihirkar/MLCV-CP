# MediTrace Voice Intake - Handover

## What this project is

This is a focused patient pre-intake prototype for **MediTrace**, inspired by the supplied SIH case-taking brief. The scope is deliberately limited to a **signed-in, voice input and voice output workflow** with a patient-friendly interface.

It does not include medical diagnosis, clinical NLP, document OCR, or a production clinical database. Authentication is a lightweight local prototype (see below), not a production identity system.

## What has been completed

- A branded, responsive login screen that gates the intake workflow behind a signed-in session.
- Local authentication: password hashing with `scrypt`, bearer-token sessions, session restore on refresh, "remember me", show/hide password, inline validation, and sign out.
- Optional "Continue with Google" sign-in using a real Google OAuth 2.0 authorization-code flow (disabled with an explanatory note unless configured).
- A demo credentials card with one-tap copy buttons for the email and password and a "Fill demo credentials" action.
- A polished, responsive three-panel patient intake interface.
- Microphone recording through the browser MediaRecorder API.
- ElevenLabs Scribe v2 transcription through the local backend, avoiding the unreliable browser-only speech recognizer.
- ElevenLabs narration using voice ID `7qBNUtXRGP0jPi0H4r8k` and the multilingual model.
- A microphone control with an active listening state and animated waveform.
- A text-field fallback when voice input is unavailable or not preferred.
- A four-question, guided intake flow:
  1. Main concern
  2. When the symptoms started
  3. Severity
  4. Anything else to share
- A visible conversation transcript with patient and MediTrace messages.
- A live intake summary that updates as the patient responds.
- Actual English, Hindi, Marathi, and Tamil translations for prompts and key interface labels.
- A language selector on the login screen that sets the intake language before signing in and is remembered across visits.
- A local Express API with persistent JSON session storage under `data/intakes.json` (ignored from git).
- “Listen again” buttons to replay assistant prompts.
- Responsive styling for smaller screens.

## Project structure

```text
MLCV-CP/
├── index.html          # Page structure and UI content
├── package.json        # Vite scripts and dependency definition
├── server/index.mjs    # API, local auth, ElevenLabs proxy, and persistent local stores
├── .env.example        # ElevenLabs API-key template
├── data/
│   ├── intakes.json    # Persistent intake sessions (ignored from git)
│   └── users.json      # Local prototype accounts (ignored from git, seeded on first run)
├── src/
│   ├── auth.js         # Login screen, token storage, session restore, sign out
│   ├── main.js         # Voice, conversation, and summary behaviour
│   └── style.css       # Full visual design and responsive layout
└── HANDOVER.md         # This handover note
```

## Run locally

### Prerequisites

- Node.js 18 or newer (Node 22 was used during development)
- npm

### Commands

```powershell
npm install
Copy-Item .env.example .env
# Add ELEVENLABS_API_KEY to .env
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173`. The companion API starts at `http://localhost:3001`.

For a production build:

```powershell
npm run build
```

The production files are created in `dist/`.

## How sign-in works

- The app opens on the login screen until a valid session is present.
- Accounts live in `data/users.json`, which is seeded on first run with a demo patient:
  - Email: `ramesh.patel@example.com`
  - Password: `meditrace123`
- Passwords are hashed with `scrypt`; the plain password is never stored.
- `POST /api/auth/login` returns a bearer token held in `localStorage` (or `sessionStorage` when "remember me" is off). The intake, narration, and transcription routes require that token.
- On refresh, `GET /api/auth/session` validates the stored token and restores the signed-in user; "Sign out" clears the token and returns to the login screen.
- The login screen can be switched between English, Hindi, Marathi, and Tamil; the choice is stored in `localStorage` and carries into the intake.

### Google sign-in (optional)

- Google OAuth 2.0 is implemented directly on the server (no extra dependencies): `GET /api/auth/google` starts the flow and `GET /api/auth/google/callback` exchanges the code and issues a local session token.
- It is **off by default**. The login button is disabled with a note until these `.env` values are set:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI` (optional; defaults to `<origin>/api/auth/google/callback`)
- Add the matching redirect URI (for local dev, `http://localhost:3001/api/auth/google/callback`) to the authorised redirect URIs of the Google OAuth client.
- `GET /api/auth/providers` tells the client whether Google is available; the button is never faked when unconfigured.
- A Google sign-in creates a local patient account on first use (matched by verified email).

### Privacy copy

- The interface deliberately avoids unsupported security claims. It does **not** claim end-to-end encryption; it states that responses are saved to the local intake session/summary and that the microphone is only used while speaking. Add stronger claims only if the implementation actually provides them (encryption at rest, transport security, access control).

## How the voice workflow works

1. The page greets the patient and speaks the first question.
2. The patient can press the microphone and speak, or type an answer.
3. Audio is sent to the local backend, then transcribed by ElevenLabs Scribe v2.
4. A completed answer is stored in the local session store, then added to the conversation and intake summary.
5. MediTrace shows and speaks the next question.
6. After four responses, the workflow displays a completion message and disables additional microphone capture.

## Important browser notes

- The browser must be allowed to access the microphone before voice capture can work.
- The app requires an `ELEVENLABS_API_KEY` in `.env` for voice input and narration. It is never exposed to the browser.
- If microphone access or ElevenLabs is unavailable, the user can still complete the flow with text input.
- ElevenLabs usage can incur costs; configure suitable account limits before demos.

## Verification completed

- The current Vite production build completed successfully.
- The interface was opened and visually checked in a browser.
- The typed-answer flow was checked: a response appeared in both the transcript and intake summary, then the next question rendered correctly.
- Auth was checked against the running API: bad credentials return `401`, protected routes return `401` without a token, and login returns a token that restores the session.
- The four login-screen languages and their translated copy were checked against the built output.
- Google OAuth was checked unconfigured: `/api/auth/providers` reports `google: false`, `/api/health` reports `googleConfigured: false`, and `/api/auth/google` returns `503` instead of faking a login. The full consent/callback flow still requires real Google credentials to test.
- The new API routes are ready for an ElevenLabs key; live transcription/narration should be tested after adding one.

## Suggested next work

1. Move the local JSON store to PostgreSQL or another secured database.
2. Add a final review-and-submit screen, subject to consent and privacy requirements.
3. Add consent, accessibility, error recovery, and session handling before any real clinical use.
4. Harden the prototype login for production: server-side persisted sessions, password reset, account provisioning, and audit logging. The Google OAuth flow is a starting point but needs real client credentials, HTTPS, and organisation-level consent review.

## Safety and scope note

This is a UI prototype only. It should not be treated as a medical device, diagnostic tool, or production health-record system. Any real deployment needs appropriate clinical review, privacy/security design, consent management, and compliance work.
