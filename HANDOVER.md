# MediTrace Voice Intake - Handover

## Optional OpenRouter Nemotron provider (26 October 2026)

- Added explicit INTAKE_LLM_PROVIDER=gemini|openrouter selection for adaptive questions, with server-only OPENROUTER_API_KEY and OPENROUTER_MODEL settings. The verified free model is nvidia/nemotron-3-ultra-550b-a55b:free. Gemini remains the active local provider; no OpenRouter key was supplied. The existing speech and document processing paths are unchanged.
- The free endpoint explicitly prohibits confidential/personal input and discloses logging. Its use is blocked unless OPENROUTER_SYNTHETIC_TEST_MODE=true is explicitly set for a separate fictional-data test instance. There is no automatic transfer of real patient conversations on Gemini exhaustion. See OPENROUTER_SETUP.md for setup, limitations and primary sources.
- The model catalog does not advertise response_format/structured_outputs support. The adapter instead requests JSON via the prompt, disables reasoning, bounds output/time, and validates the same relevance/question/completion contract locally. Tests cover provider request shape, preserved context, unsupported-parameter avoidance, and the free-endpoint guard. Live OpenRouter inference requires the user's key and remains unverified.

## Contextual Gemini intake fix (26 October 2026)

- The old adapter only selected predefined questions and silently fell back to rules; cough incorrectly routed into breathing difficulty. Cough now has its own neutral safety screen and standard fallback. Duration explicitly stated as a number of hours/days/weeks/months/years is retained instead of requested again. Old non-escalated cough-only breathing records are rerouted on resume without deleting prior answers. Breathing fallback wording no longer asserts an unreported breathing difficulty.
- After required safety screening, Gemini now writes one new contextual question from the entire conversation, with a short summary label and history/concern/review section. Generated questions and exact answers persist in the session, survive refresh/undo, and reach the clinician's HPI/history with source evidence. The question is no longer constrained to the old bank. Relevance checking shares the same request instead of making a second model call; irrelevant answers roll back before persistence. Required safety screening/escalation stays deterministic and cannot be skipped by the model. Generated questions cannot provide diagnosis or treatment advice, and there is a 12-question generated-follow-up cap.
- Live diagnostic: configured gemini-3.8-flash returned HTTP 429 RESOURCE_EXHAUSTED with a free-tier request limit of 20. The app had hidden that failure. gemini-3.5-flash responded using the existing key, so it is now the local/default intake model. One transient 503 is retried once; quota failures are not repeatedly retried. Other service failures show a clear standard-question fallback notice in the patient interface.
- A live synthetic test with "Dry cough for 5 days" and a negative cough safety screen produced: "Have you noticed any other symptoms, such as a fever, sore throat, or runny nose?" It did not invent breathlessness or repeat duration. Real provider responses can still vary; this is one verified example, not a clinical accuracy benchmark.
- Regression tests cover new cough routing, full-conversation prompting, one request for relevance/generation, generated-question restoration, answer correction without adding a clinical fact, completion, clinician visibility, rule-owned escalation, and explicit provider failure. Existing patient data was retained.

## Simplified settings and patient profile deletion (26 October 2026)

- Removed font/font-size controls and the DOM-wide text-measurement observer. The first authenticated prompt is now a wide language-only dialog with four large radio choices in a row (two per row on small screens), over a blurred backdrop. Dark is the initial default, including the login form. Older font/size/system-theme preferences migrate to this default once; subsequently saved appearance choices persist. Appearance remains available in the patient's top-right Settings menu and the doctor's top-right header Settings button.
- Signup and profile date of birth now accept a directly typed year/date, with a YYYY-MM-DD example and automatic separators for eight digits, avoiding the slow calendar year scroller. Existing server validation remains authoritative.
- Patient Settings includes Delete my profile, an explicit warning and typed DELETE confirmation. The protected DELETE /api/auth/account endpoint removes only the authenticated patient's account, profile/history/clarifications, intakes, linked review records, chat settings, document originals, extraction records/worker jobs, pending upload tickets/staging objects, and login tokens. Storage or worker deletion failures return an error instead of claiming completion; cleanup can be retried. Other patients and clinician accounts are retained. Deleted demo patient IDs have a minimal disabled-seed marker so restart does not recreate those demo accounts. Deletion in this update is exercised only on synthetic test accounts; no existing user profile was deleted.
- The deletion integration test checks confirmation, removed profile/intake/upload, invalidation of another login token, failed subsequent login, and retention of another patient's account. The existing bulk purge requested earlier remains blocked; this feature provides individual patient self-deletion.

## Registration, Google sign-in, and extraction status (26 October 2026)

- Added patient registration with name, email/password (10–128 characters), date of birth, sex, and optional phone. The server validates input, rejects duplicate emails/future or invalid birth dates, hashes passwords, fixes the role to Patient, and saves initial profile details. Existing/Google patients without a birth date complete their basic profile before entering intake. Registration is serialized locally; deterministic account IDs also detect concurrent cloud creation conflicts. This remains the app's existing authentication system, without email verification or password reset delivery.
- Google OAuth now requires a verified email and subject identifier. App login tokens return in a fragment, which the frontend consumes and removes immediately. State remains browser-bound, expiring, and single-use. Credential setup and local/Vercel callbacks are documented in GOOGLE_SIGNIN_SETUP.md. The user supplied a Web client JSON; its registered callback matches http://localhost:5173/api/auth/google/callback. Client ID/secret were copied only into ignored .env. Real Google consent still requires the user's browser/account; the integration test covers the mocked provider round trip and rejects reused state.
- Extraction now shows stage text (model preparation/download, document opening, OCR line number, and medical term identification), queue position, elapsed time, a spinner, a manual Check status action, and an explicit completion label. Returning to the tab triggers refresh. There is no fabricated percentage or completion estimate. SQLite migrates existing queues with a progress column; the worker and app persist/synchronize progress. Model inference speed remains dependent on the selected large handwriting model and available CPU/GPU; this change improves visibility rather than claiming a measured speedup.
- The user authorized deleting all patient records/uploads. Automatic approval review rejected both deletion commands as blocked by policy and provided no more specific reason. No patient data was deleted. As a reversible alternative, SHOW_DEMO_PATIENTS=false disables the fictional doctor records and a local DOCTOR_RECORDS_SINCE cutoff hides earlier intakes. Existing patient accounts, records, uploads, and worker results remain stored. The live doctor overview was verified to contain zero visible records; newly created intakes will appear normally. A future explicit data purge remains unfulfilled.
- Build, 11 app tests, and seven Python tests passed during this update. Tests now cover registration validation/duplicate accounts/patient-only access, Google token return/state reuse, escaped progress, and durable worker progress. Both services were restarted; final health/configuration checks are recorded in the task response.

## Patient intake usability update (26 October 2026)

- The API now checks whether an answer addresses the current question before saving it as clinical information. Greetings and empty/generic replies keep the same question active; Gemini can check semantic relevance when configured, with conservative deterministic checks when unavailable. Reported warning signs remain governed by the existing safety rules. A vague concern such as "Pain" receives a context question and can route into the correct complaint branch after clarification.
- Unaccepted replies remain in the conversation transcript but do not count as answers or populate the clinical summary. The API rejects stale/question-skipping turn IDs. Older records containing only a greeting as the accepted chief complaint resume at the concern question while preserving that greeting in chat; records containing further clinical answers or escalation are preserved.
- The patient sidebar consistently shows the active intake's progress plus conversation history. Replaced the washed-out active step and inherited text colors with explicit light/dark surface and text pairs; compact spacing prevents the conversation heading/group action from overlapping. The completion screen starts at the top and keeps the next action above the answers.
- Added prominent Upload documents buttons in the header and completion screen. The new dialog supports file selection and drag/drop without a history event, along with saved-document listing, removal, download, and existing OCR/NLP panels. Files attach to the current intake, are protected by ownership checks, and appear in the doctor record. Local multipart and Supabase direct upload share one client helper. Document-only intakes are retained; deleting an intake cleans up its documents and extraction metadata. Migration imports these intake attachments too.
- Completion now follows Add documents (optional) → Check answers → Send for clinician review. Submission is persisted and idempotent, shows a reference and clear next steps, and marks the progress review step complete. Undoing an answer clears submission so revised answers can be sent again. This records availability for clinician review through the existing workspace; it does not add external hospital delivery or appointment booking.
- Verification: production build and all 11 app tests passed; all seven Python worker tests passed. Integration checks cover greeting re-prompts, recovery of the older greeting record, answer counts/transcript restoration, direct intake uploads, access control, document-only retention, doctor visibility, submission/reload/idempotency, and reopening after edits. The dark patient completion screen and direct-upload dialog were visually checked. Further computer-use verification stopped because the browser tool could not confidently determine the current browser URL; no browser actions were attempted after that stop.

## Medical document pipeline update (25 October 2026)

- Local development fix: Vite ignores Python virtual environments, worker data, application data, and Python bytecode caches. Restarting the stalled Vite process restored CSS/JavaScript delivery on localhost:5173; asset and API checks passed and the styled app was confirmed in the browser.

- Added a Medical TrOCR + medical NLP processing path for patient-uploaded images, PDFs, and DOCX. The persistent Python worker lives in `services/document_pipeline/`; setup, API contracts, limits, model references, retention, Docker instructions, and tests are documented in [its README](services/document_pipeline/README.md).
- Default models are `aci-mis-team/trocr-large-handwritten-prescription` (configurable Medical TrOCR checkpoint/processor) and `d4data/biomedical-ner-all` (English medical named entity recognition). These models run on the worker host. Model downloads use Hugging Face; document content is not sent to Hugging Face. Checkpoint quality on representative documents remains unverified.
- PDFs use embedded text where available and render scanned pages for line-level OCR. DOCX text and supported embedded images are read. Model output preserves source text, page/section references, exact UTF-16 entity spans, entity type, model score, model identifiers, and warnings. Multi-column/rotated writing, mixed PDF text/image regions, document headers/footers, and configured truncation limits require checking the original.
- Both intake and profile uploads now submit extraction jobs on the server immediately after saving the files, before returning success. Validated upload buffers are reused; submission is awaited, while model inference stays in the worker. Extraction panels open automatically and poll queued/running jobs. No second extraction click is required; only failed jobs show Retry extraction. Saved originals survive worker downtime, with failure status persisted for retry. The browser also starts older unstarted attachments when viewed. No long-running inference or unawaited background task runs in the Vercel function.
- SQLite-backed worker jobs survive worker restarts and use stable idempotency keys. The app persists synchronized results in local `data/document-extractions.json` or Supabase's existing `app_records` table under the `document-extractions` namespace. No new Supabase schema is required. The local-to-Supabase migration now also copies these extraction records.
- New protected endpoints: `GET/POST /api/profile/attachments/:id/extraction` and clinician-only `POST .../extraction/review`. Only the document owner or a clinician can view/start extraction. The app validates provider page limits and entity offsets against exact source text and rejects ungrounded output. Failed/expired jobs are retryable; original uploads remain downloadable. Deletion removes app results and requests worker job deletion when configured/reachable; completed/failed worker jobs otherwise expire after seven days.
- Patient history and doctor Documents & reports/timeline now show extraction panels with raw text, entity mentions, context, warnings, and review status. Every rendered string is escaped. Extracted terms remain unverified document mentions and do not populate active medication/diagnosis facts, clinical flags, or approved summaries. Negation, historical context, and medication status are explicitly unassessed. Marking extraction reviewed records the clinician without approving the intake summary.
- Add `DOCUMENT_PIPELINE_URL` and `DOCUMENT_PIPELINE_TOKEN` to the app's `.env` and Vercel environment; run the worker separately with the same token. Optional worker model/queue settings are listed in `.env.example`. Keep queue/model-cache storage persistent; the provided Docker image runs as an unprivileged user with one CPU worker. Local commands are in the worker README. The worker is excluded from the Vercel upload.
- Verification: production build passed; all nine app tests and seven Python parsing/service/queue tests passed. Neural model predictions use deterministic fixtures in tests; full checkpoint inference/accuracy, live worker-to-Vercel/Supabase deployment, and browser visual QA remain separate checks. PyTorch, TrOCR/Transformers, medical NER classes, and HEIF runtime imports passed. Full pretrained inference and model accuracy remain unverified.

## Supabase and Vercel update (19 October 2026)

The app can now run with Supabase Postgres and private Supabase Storage. Existing patient/doctor password login and Google OAuth remain application-managed; this change does not use Supabase Auth. Without cloud credentials, local development still uses JSON files and local attachments. On Vercel, missing or partial Supabase configuration fails explicitly instead of writing ephemeral files.

### Configure Supabase

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor. This creates `app_records`, the transactional update/one-time ticket functions, and the private `meditrace-attachments` bucket with a 10 MB per-file limit. RLS is enabled; database access and function execution are granted only to the server service role. No browser access policies are required.
2. Add the following server-only values to `.env` (see `.env.example`):

   `SUPABASE_URL=https://YOUR_PROJECT.supabase.co`

   `SUPABASE_SERVICE_ROLE_KEY=YOUR_LEGACY_SERVICE_ROLE_JWT`

   `SUPABASE_STORAGE_BUCKET=meditrace-attachments`

   Use the legacy **service_role** JWT from Supabase's API key settings, not the anon/publishable key. Do not use a `VITE_` prefix. The browser receives only scoped upload/download URLs, never this key. If changing the bucket name, create an equivalent private bucket with the same size limit.
3. For existing local accounts/data, run `npm run db:migrate` before enabling cloud demo seeding. The migration imports users (with their existing IDs/password hashes), intakes, reviews, profiles/history/clarifications, chat organization, and attachment files. It adds missing records and preserves existing cloud records and local files. It rejects duplicate account emails with different IDs; use an empty project for an initial migration. It can resume interrupted file imports without overwriting different bytes. Existing browser login tokens must sign in again.
4. For a fresh demonstration project without a migration, set `SEED_DEMO_USERS=true` to create the documented demo accounts on the first API request. Cloud mode leaves these accounts unseeded by default. Blank/default local mode still seeds the existing demo logins. Setting this flag false later does not delete accounts already created.
5. Run `npm run dev`. Check `/api/health` reports `persistence: "supabase"`, then sign in and save/reload an intake. The health flag reports the configured backend; a successful save confirms database access and schema setup.

### Deploy on Vercel

1. Import this repository, using the repository root as the project root. `vercel.json` selects Vite, runs `npm run build`, and publishes `dist`. Use Node.js 22 or newer (also declared in `package.json`).
2. Add the Supabase values above in Vercel **Project Settings > Environment Variables** for the deployment environments you use. Set `SEED_DEMO_USERS=true` only if the deployment should initialize the demo accounts. Local `.env` and `data/` files are excluded from deployment with `.vercelignore`.
3. Add `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, and their optional model/voice settings if using those services. They remain server-only. Missing keys retain the existing browser voice/rules-only fallbacks.
4. If using Google sign-in, add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI=https://YOUR_DOMAIN/api/auth/google/callback`. Register that exact callback in Google Cloud. Use a stable domain; preview URLs need their own registered callback/settings. OAuth continues to use the app's Google client, not a Supabase OAuth provider configuration.
5. Deploy. The Vite frontend and `/api/*` share one origin. `api/index.mjs` exports the Express app; cloud imports do not open a listening port. Local `npm run dev`/`npm start` still start the normal server. Verify login, session restore after refresh, an intake, doctor review, an attachment upload/download, and logout on the deployed URL.

### Persistence and upload details

- `server/environment.mjs` loads local environment values before service configuration without overriding variables already supplied by the host.
- `server/persistence.mjs` stores one database row per account, intake, review, or account profile/chat settings document, grouped by namespace. Changes are applied through a database transaction with stale-write checks: different records merge, while edits to the same changed record return 409 and ask the user to refresh. Collection reads are paginated. Related changes across multiple namespaces are still separate transactions.
- Server login tokens are stored by SHA-256 digest with an eight-hour expiry. OAuth state and upload tickets are durable, expiring, one-time records, so different function instances can handle subsequent requests. OAuth state is also bound to the initiating browser with an HttpOnly SameSite cookie. Schedule the optional expired-record cleanup in `supabase/schema.sql` and periodically remove abandoned `staging/` objects; no recurring cleanup job is provisioned automatically.
- Attachments upload directly from the browser to signed private Storage URLs to avoid Vercel's function payload limit. Finalization checks ticket ownership/expiry, file size, extension, and binary signature before saving a new permanent object and attaching its metadata to history. Downloads are authorized through the app API and redirect to a 60-second signed URL. Failed/abandoned staging uploads are never listed as patient attachments.
- Audio transcription uses multipart requests capped at 4 MB (with a matching client-side check); larger recordings ask the patient to record a shorter response or type it. Attachment limits remain 10 files per save, 10 MB each. The function has a 60-second configured maximum; external service performance can still cause a timeout.
- This retains the prototype's existing account roles and JSON-shaped domain records. It does not add account provisioning/password reset or turn the prototype into a production clinical system. Supabase calls use the server service role; authorization remains in the Express routes.

### Verification

- `npm run build` passed and `npm test` passed all six tests.
- The cloud integration test uses a local Supabase REST/Storage fixture and two Express instances. It covers shared login/logout, saved intake reads, patient/doctor authorization, direct uploads, private downloads, ownership/single-use tickets, file-content validation, stale edit rejection, merging distinct records, pagination, OAuth state consumption, and configuration failures.
- Live Supabase schema execution, real Storage/CORS, Google consent, Vercel routing, and deployment still need verification after credentials are added. No cloud project was modified or deployed during this change.
- Reference documentation: [Supabase Data REST API](https://supabase.com/docs/guides/api), [Supabase private Storage access](https://supabase.com/docs/guides/storage/security/access-control), [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), and [Vercel payload limits](https://vercel.com/docs/functions/limitations).

## Dark mode update (19 October 2026)

- The doctor workspace now has a complete dark palette in `src/doctor.css`, driven by the existing `html[data-appearance=dark]` preference. Explicit Dark and Use device setting continue to use the existing account-specific settings behavior.
- Replaced fixed light backgrounds in the top bar, demo queue rows, muted badges, summary editors (including focus and edited states), AI drafts, review notes, evidence quotes/highlights, action buttons, hover states, and loading skeletons with theme variables. Cards, dialogs, the patient workspace, and profile surfaces inherit the same palette.
- Scoped the shared overrides in `src/preferences.css` so doctor controls and text retain their semantic colors. Warning, urgent, informational, and reviewed badges keep distinct colors; primary actions use contrasting text.
- Added dark backgrounds and readable text for shared attachment lists/actions and timeline clarification threads, questions, patient replies, and clarification controls. Also covered the patient support/summary panels, composer, saved conversation cards, and selected quick replies.
- Validation: `npm run build` passed; `node --test tests/*.test.mjs` passed all five existing tests; `git diff --check` passed. These checks validate compilation and existing behavior, not visual contrast.
- Browser visual verification remains pending: this session had no available browser. Manual check: sign in as a clinician, open Settings and select Dark, inspect Overview and Patient queue (including demo rows and hover states), open a patient and expand the summary/timeline, inspect source evidence and the clarification/approval dialogs, then switch back to Light. Check Use device setting with both OS appearances and confirm the saved preference after refresh. Check patient attachments, clarification replies, and summary panels too.

## What this project is

This is a focused patient pre-intake prototype for **MediTrace**, inspired by the supplied SIH case-taking brief. The scope is deliberately limited to a **signed-in, voice input and voice output workflow** with a patient-friendly interface.

It does not include medical diagnosis or a production clinical database. Document OCR and medical entity extraction are available through the separately configured worker described above. Authentication is a lightweight application-managed prototype with local or Supabase persistence (see above), not a production identity system.

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
- An Express API with persistent JSON storage for local development or Supabase Postgres/private Storage for cloud deployment (setup above).
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

- Node.js 22 or newer
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
- In local mode, accounts live in `data/users.json`, which is seeded on the first API request with a demo patient and two demo clinicians. The seeder also adds any missing seed account to an existing `users.json`:
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

1. Normalize/index the Supabase domain records and add cross-namespace transactions as the application grows.
2. Add a final review-and-submit screen, subject to consent and privacy requirements.
3. Add consent, accessibility, error recovery, and session handling before any real clinical use.
4. Harden the prototype login for production: server-side persisted sessions, password reset, account provisioning, and audit logging. The Google OAuth flow is a starting point but needs real client credentials, HTTPS, and organisation-level consent review.
5. Clinician workspace follow-ups: server-persisted review state with an audit trail, real assignment of patients to clinicians, and a genuine HIS/FHIR export once a target system and its security requirements exist. Remove the demo dataset before any clinical pilot.

## Safety and scope note

This is a UI prototype only. It should not be treated as a medical device, diagnostic tool, or production health-record system. Any real deployment needs appropriate clinical review, privacy/security design, consent management, and compliance work.

## Completed intake review

Completed intakes show a review screen with saved answers. Patients can view their conversation or start another intake from this screen. Starting another intake retains the previous server record.
