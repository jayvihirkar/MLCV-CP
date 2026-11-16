# MediTrace Vercel demo deployment

Use branch **`codex/presentation-ready-ocr`** in `jayvihirkar/MLCV-CP`.
Use the latest pushed commit, including the current doctor-screen changes.
The local `main` checkout is older. Vercel builds from Git, not uncommitted files.

## 1. Architecture

- Vercel: Vite frontend and Express API (`api/index.mjs`).
- Supabase: durable account/intake records and private uploaded files.
- Separate Python worker: document queue, hosted OCR calls, and local medical NER.
- Google OAuth, Gemini, and optional ElevenLabs: external integrations.

`localhost:8000` on Vercel is not your laptop. The worker needs a reachable HTTPS URL.
Choose either a hosted Docker worker with persistent `/data`, or the temporary laptop
tunnel below. Vercel does not start `npm run dev` or the Python worker.

## 2. Supabase

1. Create or select a Supabase project.
2. Run **`supabase/schema.sql`** in its SQL Editor. It creates the app table,
   transactional RPC functions, and private `meditrace-attachments` bucket.
3. Copy the project URL and server `service_role` key from the project settings.
   Keep the key server-only, without a `VITE_` prefix.
4. For a fresh demo, use `SEED_DEMO_USERS=true` to create the existing demo doctor
   logins. Keep `SHOW_DEMO_PATIENTS=false` for a clean queue of recorded intakes.

A fresh Supabase project starts with no local patient history. Migration is optional:
to retain it, configure the Supabase values in local `.env`, then run
`npm run db:migrate` against an empty project before seeding accounts. The migration
writes cloud records. Do not run it when you want a clean demo.

## 3. Make the document worker reachable

### Temporary demo using the existing laptop worker

1. Keep these in the laptop's `.env`:

   ```dotenv
   DOCUMENT_PIPELINE_URL=http://127.0.0.1:8000
   DOCUMENT_PIPELINE_TOKEN=YOUR_EXISTING_SHARED_TOKEN
   DOCUMENT_OCR_PROVIDER=ocr_space
   OCR_SPACE_API_KEY=YOUR_EXISTING_OCR_SPACE_KEY
   OCR_SPACE_ENGINE=2
   ```

2. Start `npm run dev`, which starts the worker too. If it is already running,
   reuse it rather than starting a second worker on port 8000.
3. Install `cloudflared` using Cloudflare's official instructions, then in a
   second terminal run:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:8000
   ```

4. Copy its printed `https://....trycloudflare.com` origin into Vercel's
   `DOCUMENT_PIPELINE_URL`. Put the laptop's **same** shared token into Vercel's
   `DOCUMENT_PIPELINE_TOKEN`. The worker already requires that token.
5. Keep both terminals open and the laptop awake and online for the presentation.
   A restarted Quick Tunnel generates a new URL: update Vercel and redeploy.

This tunnel is temporary demo infrastructure. A hosted worker removes the laptop dependency.

### Hosted worker

Build the repository using `services/document_pipeline/Dockerfile`, expose its
internal port **8000** through HTTPS, mount persistent storage at **`/data`**, and
run one instance/process per queue volume. Set these on the worker host:

```dotenv
DOCUMENT_PIPELINE_TOKEN=THE_SAME_TOKEN_AS_VERCEL
DOCUMENT_OCR_PROVIDER=ocr_space
OCR_SPACE_API_KEY=YOUR_OCR_SPACE_KEY
OCR_SPACE_ENGINE=2
DOCUMENT_QUEUE_PATH=/data/jobs.sqlite3
HF_HOME=/data/models
```

The worker needs memory/disk for PyTorch and the biomedical NER model even with
hosted OCR. Its `/health` requires the bearer token; do not weaken authentication
to accommodate an unauthenticated hosting-platform health check. Model assets
download on first inference. Rehearse an upload before presenting.

## 4. Import into Vercel

Import `jayvihirkar/MLCV-CP`, then use:

| Setting | Value |
| --- | --- |
| Production Branch | `codex/presentation-ready-ocr` |
| Framework | Vite |
| Root Directory | Repository root |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`vercel.json` supplies the API routing, function duration, and build settings.
Use a stable project domain for Google login. A different preview hostname needs
its own Google redirect URI and matching environment value.

## 5. Vercel environment variables

Add these to **Production** in Project Settings > Environment Variables.
Add them separately to Preview only if testing a preview deployment.
Use the existing local service keys where applicable, but change the two URLs below.
Local `.env` is excluded from Git and is not uploaded to Vercel.

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project's HTTPS origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Server service-role key |
| `SUPABASE_STORAGE_BUCKET` | `meditrace-attachments` |
| `SEED_DEMO_USERS` | `true` for this fictional demo |
| `SHOW_DEMO_PATIENTS` | `false` |
| `GOOGLE_CLIENT_ID` | Existing Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Existing Google OAuth secret |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-DOMAIN/api/auth/google/callback` |
| `GEMINI_API_KEY` | Existing Gemini key |
| `INTAKE_LLM_PROVIDER` | `gemini` |
| `ELEVENLABS_API_KEY` | Existing key, optional with browser narration fallback |
| `ELEVENLABS_VOICE_ID` | `EXAVITQu4vr4xnSDxMaL` or your configured voice |
| `DOCUMENT_PIPELINE_URL` | Hosted worker/tunnel HTTPS origin, not localhost |
| `DOCUMENT_PIPELINE_TOKEN` | Same token as the Python worker |

The OCR.space key belongs on the worker host, not the browser or Vercel frontend.
Keep `OPENROUTER_SYNTHETIC_TEST_MODE=false`; OpenRouter is not needed for this setup.
Copy any explicitly selected, working `GEMINI_MODEL`/`GEMINI_STT_MODEL` overrides too.
Redeploy after changing Vercel environment variables.

## 6. Google OAuth

In Google Cloud > Google Auth Platform > Clients > your web client, add this exact
authorized redirect URI:

```text
https://YOUR-DOMAIN/api/auth/google/callback
```

Keep the localhost callback for local testing. While the OAuth app is in Testing,
include your presentation account in its allowed test users. The callback is the
app's URL, not Supabase's auth callback. Match hostname, scheme, and path exactly.

## 7. Check before the presentation

Configuration checks using local `.env`:

```powershell
npm run deploy:check -- https://YOUR-DOMAIN
```

For the cloud values, create an ignored `.env.vercel` containing the values from
section 5 and run:

```powershell
node --env-file=.env.vercel scripts/check-deployment.mjs --origin https://YOUR-DOMAIN --live
```

The checker prints no keys. Live checks only read the database schema, private
bucket settings, authenticated worker health, and deployed app configuration.
It does not submit documents, mutate patient data, or confirm model accuracy.
Vercel deployment protection must allow these requests, otherwise the API check
will correctly fail instead of treating a Vercel login page as the application.

Then verify in the browser: Google login, save/reload an intake, voice input and
narration, report upload/extraction, private download, doctor review, and logout.
`/api/health` should report `persistence: "supabase"`, `googleConfigured: true`,
`geminiConfigured: true`, and `documentPipelineConfigured: true`.

The Jay Vihirkar scenario remains one-time per account. A fresh cloud account gets
its first special intake. Repeated login does not reset it. For another rehearsal,
delete the profile **on that cloud deployment** and sign in again; deleting a
local-only profile does not delete a separate cloud account. Reuse the original
CityCare PNG. OCR still needs to recognize its identifying text before the
predefined fictional sample JSON is shown. Keep the warmed worker running.

## References

- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel function limitations](https://vercel.com/docs/functions/limitations)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
