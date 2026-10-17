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
- Gemini (`gemini-3.5-transcribe`) speech-to-text through the local backend, avoiding the unreliable browser-only speech recognizer. The browser recording (WebM/Opus) is sent straight to Gemini; if `GEMINI_API_KEY` is missing, voice input falls back to the browser SpeechRecognition API.
- ElevenLabs narration using a free-plan-friendly voice (default `EXAVITQu4vr4xnSDxMaL`/Bella, override with `ELEVENLABS_VOICE_ID`); if ElevenLabs is missing or a voice is unavailable, spoken prompts fall back to the device voice.
- A microphone control with an active listening state and animated waveform.
- A text-field fallback when voice input is unavailable or not preferred.
- An adaptive, server-driven intake for English (see “Adaptive intake” below): a safety-first flow that classifies the chief complaint, screens warning signs first, then follows the relevant clinical branch. Hindi, Marathi, and Tamil keep the original four-question linear flow:
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
- A role-aware entry point: signing in as a patient opens the intake; signing in as a clinician opens the doctor workspace.
- A clinician workspace (dashboard + per-patient review) built on top of the existing backend, described below.

## Project structure

```text
MLCV-CP/
├── index.html          # Page structure, login screen, patient portal, doctor root
├── package.json        # Vite scripts and dependency definition
├── server/
│   ├── index.mjs       # API, local auth, ElevenLabs proxy, triage endpoints, doctor API, local stores
│   ├── triage.mjs      # Adaptive intake engine: question flows, complaint routing, red-flag rules
│   ├── llm.mjs         # Gemini adapter: speech-to-text + next-question selection + warning-sign detection
│   └── mock-data.mjs   # Clearly-labelled fictional demo patients (mock adapter)
├── .env.example        # ElevenLabs, Gemini and Google OAuth config template
├── data/
│   ├── intakes.json    # Persistent intake sessions (ignored from git)
│   ├── users.json      # Local prototype accounts (ignored from git, seeded on first run)
│   └── reviews.json    # Clinician review/approval state (ignored from git)
├── src/
│   ├── auth.js         # Login screen, token storage, session restore, sign out
│   ├── main.js         # Voice, conversation, and summary behaviour
│   ├── doctor.js       # Clinician workspace (dashboard + patient review)
│   ├── doctor.css      # Clinician workspace styling
│   └── style.css       # Patient portal visual design and responsive layout
└── HANDOVER.md         # This handover note
```

## Run locally

### Saving and resuming an intake

- Submitted answers are saved on the server. The browser keeps an account-specific session reference and unfinished typed answer.
- “End & save later” verifies the saved session and signs the patient out. Recording, transcription, or answer submission must finish first.
- Signing back in using the same browser restores the recorded responses, next question, summary, and unfinished typed answer. Clearing browser storage removes the resume reference.
- Sessions created before account ownership was added remain available to clinicians, but cannot be resumed through patient endpoints. New sessions can only be read or changed by their creator through those endpoints.
- Regression checks: `node --test tests/intake-resume*.test.mjs`.
- Restored conversations include full question text and replay buttons. New answers preserve the displayed question; older answers use the question bank as a fallback.
- Automatic narration stays off until the patient presses the microphone during that page visit. Replay buttons remain available independently.
- The English adaptive intake advances the sidebar and header to Health history when history questions begin, and Review when complete. The active step is restored from server state after refresh. Non-English flows retain their existing four-question intake.

### Prerequisites

- Node.js 18 or newer (Node 22 was used during development)
- npm

### Commands

```powershell
npm install
Copy-Item .env.example .env
# Add ELEVENLABS_API_KEY (narration) and GEMINI_API_KEY (voice input + adaptive intake) to .env.
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
- Accounts live in `data/users.json`, which is seeded on first run with a demo patient and two demo clinicians. The seeder also adds any missing seed account to an existing `users.json`:
  - Patient — Email: `ramesh.patel@example.com`, Password: `meditrace123`
  - Clinician — Email: `doctor@meditrace.health`, Password: `meditrace123` (Dr. Ananya Rao, Internal Medicine)
  - Clinician — Email: `vikram.nair@meditrace.health`, Password: `meditrace123` (Dr. Vikram Nair, Cardiology)
- After signing in, the app routes by role: `Patient` opens the intake, `Doctor` opens the clinician workspace.
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
3. Audio is sent to the local backend, then transcribed by Gemini (`gemini-3.5-transcribe`, `GEMINI_API_KEY`). If no key is set, the browser SpeechRecognition API is used instead.
4. A completed answer is stored in the local session store, then added to the conversation and intake summary.
5. MediTrace shows and speaks the next question.
6. When the flow finishes, the workflow displays a completion message and disables additional microphone capture. For English sessions, the next question is chosen by the adaptive engine (below); for other languages the original four-question sequence is used.

Quick-reply chips are offered for yes/no, single-choice, multi-choice, and 0–10 severity questions, so the patient can tap instead of typing or speaking.

## Adaptive intake

The English intake is a **hybrid** system that keeps safety deterministic and uses the LLM only for relevance:

- `server/triage.mjs` owns the structure: it classifies the chief complaint by keyword (chest pain, breathing, headache, fever, abdominal pain, or a general fallback), runs warning-sign ("red flag") screening first in every branch, and then follows the matching clinical flow. Rules interpret answers and decide, on their own, whether a warning sign has been reported.
- `server/llm.mjs` is an optional Gemini adapter (`GEMINI_API_KEY`). When configured, it selects the most relevant **next** question from the allowed list and can flag warning signs already covered by the rules when the patient mentions them in free text. It never diagnoses, never invents questions, and never gives advice. Without a key, the engine runs fully rule-based.
- **Emergency escalation:** if any red-flag question is answered positively (or the model flags an allowed warning sign), the session is marked urgent and routine questions stop. The patient sees a prominent banner advising them to call emergency services or go to the nearest emergency department, with the exact reported warning signs. The banner is explicitly non-diagnostic.
- New API routes: `GET /api/sessions/:id/triage` (current state + next question) and `POST /api/sessions/:id/turn` (submit one answer, receive the next state). `GET /api/health` reports `geminiConfigured`.
- The clinician workspace reads the adaptive state: escalated intakes appear as **flagged / high priority**, and the record's summary, evidence, and flags are built from the triage answers.

## Clinician workspace

Signing in with a clinician account opens a separate, doctor-facing interface. The patient portal is untouched.

### What it shows

- **Overview dashboard** — total patients, awaiting review, reviewed, and flagged counts; the next patient to open; today's queue; and a "needs attention" list.
- **Patient queue** — a searchable, filterable list (status, priority, date) of both recorded intakes and clearly-labelled demo patients.
- **Patient workspace** — patient overview (demographics, chief complaint, allergies, medications, conditions), an AI-drafted clinical summary with editable sections, a medical timeline, uploaded documents, attention flags, and AI-suggested clarification questions. Missing information is always shown as "Not provided" rather than invented.
- **Source evidence** — the AI draft, flags, and questions link back to the exact patient response or uploaded document they came from.
- **Review & decision** — the clinician edits sections, marks them reviewed, saves a draft, requests clarification, or approves the summary (with a confirmation step). Approval records the clinician as the final decision-maker. An "Export to HIS" control is present but intentionally disabled, because no hospital integration exists.

### Data honesty

- Two data sources are kept separate and labelled everywhere:
  - **Recorded intakes** (`source: "intake"`, `demo: false`) — real sessions from `data/intakes.json`.
  - **Demo patients** (`source: "mock"`, `demo: true`) — fictional records in `server/mock-data.mjs`. They never describe a real person and are marked with a "Demo" badge and a banner.
- No diagnosis, prescription, dose change, or auto-approval is generated. Flags describe what a patient reported or what a document contains, and are explicitly labelled "Patient-reported", "AI inference", or "From document".

### Doctor API

- `GET /api/doctor/overview` — queue summary and counts.
- `GET /api/doctor/patients/:id` — full patient record with any saved review.
- `PUT /api/doctor/patients/:id/summary` — save section edits and reviewed state.
- `POST /api/doctor/patients/:id/decision` — record `draft`, `approve`, or `clarification`.
- All doctor routes require a valid token whose user has `role: "Doctor"` (enforced by `requireDoctor`); patient tokens receive `403`.

## Important browser notes

- The browser must be allowed to access the microphone before voice capture can work.
- Voice **input** (speech-to-text) uses `GEMINI_API_KEY` (model `gemini-3.5-transcribe`, override with `GEMINI_STT_MODEL`); voice **output** (narration) uses `ELEVENLABS_API_KEY`. Neither key is ever exposed to the browser.
- Transcription runs in Gemini's **SMART** mode (removes filler words, tidies formatting) and is biased with a **custom vocabulary** of common Indian medicine brand names (Crocin, Disprin, Dolo, Combiflam, Telma, etc.), because generic speech models routinely mangle drug names. Extend the list with the comma-separated `GEMINI_STT_VOCABULARY` env var. The recording's language is sent so the model transcribes in the right language.
- If the Gemini key is missing, voice input falls back to the browser SpeechRecognition API. If ElevenLabs is missing, or a voice returns `paid_plan_required`, narration falls back to the device voice.
- If microphone access is unavailable, the user can still complete the flow with text input or the quick-reply chips.
- ElevenLabs usage can incur costs; configure suitable account limits before demos.

## Verification completed

- The current Vite production build completed successfully.
- The interface was opened and visually checked in a browser.
- The typed-answer flow was checked: a response appeared in both the transcript and intake summary, then the next question rendered correctly.
- Auth was checked against the running API: bad credentials return `401`, protected routes return `401` without a token, and login returns a token that restores the session.
- The four login-screen languages and their translated copy were checked against the built output.
- Google OAuth was checked unconfigured: `/api/auth/providers` reports `google: false`, `/api/health` reports `googleConfigured: false`, and `/api/auth/google` returns `503` instead of faking a login. The full consent/callback flow still requires real Google credentials to test.
- Gemini transcription was verified against the live API with `gemini-3.5-transcribe`: a sample audio clip was transcribed correctly, and `POST /api/transcribe` returned the transcript through the running server. Narration still needs a live ElevenLabs key to exercise end-to-end.
- The doctor API was smoke-tested against a temporary server instance: clinician login succeeds with specialty, `GET /api/doctor/overview` returns correct counts, `GET /api/doctor/patients/:id` returns a full record, `PUT .../summary` saves edits, `POST .../decision` records approval and updates the counts, and a patient token receives `403` on the doctor routes.
- The doctor workspace was verified through a successful `npm run build`. End-to-end clicking through the workspace has not yet been exercised in a browser from this environment.
- The adaptive intake was smoke-tested against a temporary server instance (rules-only, no Gemini key): chest pain escalated after the first severe-pain red flag; the fever branch followed `duration → measured → red-flag → other symptoms → breathing (because a cough was reported) → hydration`; a thunderclap headache escalated; an `hi-IN` session used the legacy linear flow; and a completed intake appeared in the doctor queue as `awaiting_review` with 5 summary sections and 10 evidence items. It was then re-tested with Gemini enabled (`gemini-3.8-flash`): all scenarios behaved correctly and next-question selection ran through the model without errors. Browser click-through of the banner and quick-reply chips has not yet been done from this environment.

## Suggested next work

1. Move the local JSON store to PostgreSQL or another secured database.
2. Add a final review-and-submit screen, subject to consent and privacy requirements.
3. Add consent, accessibility, error recovery, and session handling before any real clinical use.
4. Harden the prototype login for production: server-side persisted sessions, password reset, account provisioning, and audit logging. The Google OAuth flow is a starting point but needs real client credentials, HTTPS, and organisation-level consent review.
5. Clinician workspace follow-ups: server-persisted review state with an audit trail, real assignment of patients to clinicians, and a genuine HIS/FHIR export once a target system and its security requirements exist. Remove the demo dataset before any clinical pilot.

## Safety and scope note

This is a UI prototype only. It should not be treated as a medical device, diagnostic tool, or production health-record system. Any real deployment needs appropriate clinical review, privacy/security design, consent management, and compliance work.

## Completed intake review

Completed intakes show a review screen with saved answers. Patients can view their conversation or start another intake from this screen. Starting another intake retains the previous server record.
