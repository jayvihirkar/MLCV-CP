# Medical document pipeline

This is the persistent Python worker behind the Vite/Express application's
document extraction panels. Run it on a machine/container with persistent disk,
separately from Vercel. Use **one Uvicorn process** per queue volume. The default
Medical TrOCR checkpoint has about 2.23 GB of weights; reserve several GB of RAM
and model-cache disk. CPU inference works but can be slow. Model downloads happen
on first use, so the first job takes longer.

The default OCR checkpoint is
[`aci-mis-team/trocr-large-handwritten-prescription`](https://huggingface.co/aci-mis-team/trocr-large-handwritten-prescription).
It is a prescription-finetuned TrOCR checkpoint with an empty model card: its
clinical accuracy and intended populations have **not** been established here.
`MEDICAL_TROCR_MODEL` and `MEDICAL_TROCR_PROCESSOR` can point to a compatible
validated checkpoint or a local model directory. OCR.space is the default hosted
provider when `OCR_SPACE_API_KEY` is configured. It uses its fast Engine 2 by
default and returns a clear error rather than silently taking several minutes
to run local TrOCR. The local model remains available with
`DOCUMENT_OCR_PROVIDER=local`.
The standard
[`microsoft/trocr-base-handwritten`](https://huggingface.co/microsoft/trocr-base-handwritten)
checkpoint is an optional general-handwriting alternative, not a medical model.

For hosted OCR, register a free key at [OCR.space](https://ocr.space/ocrapi) and
set `OCR_SPACE_API_KEY` on the worker. The free service allows 500 requests/day
per IP address and accepts uploads up to 1 MB; the worker recompresses each
rendered image page below that limit before it is sent. OCR.space receives those
page images, which may contain health information; leave the key unset and use
`DOCUMENT_OCR_PROVIDER=local` to keep OCR local. Google Vision remains available
with `DOCUMENT_OCR_PROVIDER=google_vision` when its API/billing is configured.
Results identify the OCR method per page.

Medical entity extraction defaults to the English
[`d4data/biomedical-ner-all`](https://huggingface.co/d4data/biomedical-ner-all)
token-classification model. Set `MEDICAL_NLP_MODEL` to change it. It labels mentions
and scores; it does not determine active medications, negate diagnoses, establish
clinical facts, normalize drug names, or infer medication/dose relationships.
Source text, page/section, and exact character offsets accompany each entity.

## Run locally (PowerShell, repository root)

Use Python 3.12 or 3.13. The API uses Node 22+ as before. After the one-time
Python environment setup below, `npm run dev` starts Vite, the Node API, and
the authenticated OCR worker together. `.env` must contain
`DOCUMENT_PIPELINE_URL=http://127.0.0.1:8000` and the same
`DOCUMENT_PIPELINE_TOKEN` for both the Node app and worker. Add
`OCR_SPACE_API_KEY` to enable hosted OCR. Do not use the public `helloworld`
example key for patient documents.

```powershell
python -m venv .venv-document
.\.venv-document\Scripts\python.exe -m pip install -r services/document_pipeline/requirements.txt
# Add DOCUMENT_PIPELINE_URL=http://127.0.0.1:8000 and a random
# DOCUMENT_PIPELINE_TOKEN to .env. Generate a token with:
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

After this one-time setup, run `npm run dev`. Sign in and use **Upload documents** in
the patient intake, or attach an image/PDF/DOCX to a profile history event.
After saving each file, the API immediately submits its extraction job before
returning the upload response. No second extraction click is needed. The open
extraction panel shows progress and polls queued/running jobs. Closing the page
does not stop a submitted job; reopen the document to synchronize its results.
Worker failures show a retry button and never discard the original upload.

Doctors see the same extraction panels in Documents & reports and on the
timeline. “Mark extraction reviewed” records the clinician and timestamp for
this extraction only; it does not approve the intake summary.

## Deploy the worker

Build from the repository root:

```text
docker build -f services/document_pipeline/Dockerfile -t meditrace-documents .
docker run --env-file <worker-environment-file> -p 127.0.0.1:8000:8000 -v meditrace-documents:/data meditrace-documents
```

Set the same strong `DOCUMENT_PIPELINE_TOKEN` on the worker and Express/Vercel.
The worker's environment can contain only that token plus its model/cache/queue
settings; Supabase and speech API keys are not needed on the worker. Place the
worker behind an HTTPS reverse proxy for remote use, and set the Node/Vercel
`DOCUMENT_PIPELINE_URL` to that origin. Do not prefix either setting with `VITE_`.
The provided Docker image uses CPU PyTorch; a GPU deployment needs a suitable
CUDA/PyTorch image. Keep `/data` persistent and writable by container UID 10001.
Do not horizontally replicate this SQLite-backed worker or use multiple Uvicorn
workers with the same queue. Use an external broker/database before scaling.

Configure these worker values as needed:

| Variable | Default |
| --- | --- |
| `MEDICAL_TROCR_MODEL` | `aci-mis-team/trocr-large-handwritten-prescription` |
| `MEDICAL_TROCR_PROCESSOR` | Same as the selected OCR model |
| `DOCUMENT_OCR_PROVIDER` | `ocr_space` (`ocr_space`, `google_vision`, or `local`) |
| `OCR_SPACE_API_KEY` | unset (register a free OCR.space key) |
| `OCR_SPACE_ENGINE` | `2` (fast general OCR; use `3` for handwriting accuracy) |
| `GOOGLE_CLOUD_VISION_API_KEY` | unset (needed only for `google_vision`) |
| `GOOGLE_VISION_FALLBACK_TO_TROCR` | `false` (fail fast when configured Google OCR is unavailable) |
| `MEDICAL_NLP_MODEL` | `d4data/biomedical-ner-all` |
| `DOCUMENT_MAX_PAGES` | 12 (hard cap 20) |
| `DOCUMENT_QUEUE_PATH` | `./worker-data/jobs.sqlite3` (`/data/jobs.sqlite3` in Docker) |
| `HF_HOME` | Hugging Face cache default (`/data/models` in Docker) |

The worker does inference locally; it downloads model assets from Hugging Face
but does not send documents to Hugging Face. Its authenticated `/health` reports
service availability, not model readiness or extraction accuracy.

## Processing and retention

- Inputs: uploaded images (including HEIC/HEIF), PDFs, and DOCX, at most 10 MB.
- PDFs use embedded text when present; scanned pages are rendered for OCR.
  Mixed text/image PDF pages may have image-only text missing from the text
  layer. This is surfaced as an extraction warning.
- Image pages are divided into horizontal text bands before TrOCR. This is a
  single-column layout heuristic: rotated writing, tables, stamps, multiple
  columns, or overlapping handwriting require checking the original.
- DOCX paragraphs and supported embedded raster images are extracted. Word page
  layout, headers, and footers are not reconstructed. DOCX “pages” in the UI are
  extraction sections. Only the first frame of animated images is read.
- Limits: configured page count, 120 lines per image, 128 generated tokens per
  line, 30,000 UTF-16 text units per document, 500 entities per page. Truncation
  warnings remain with the result. NER uses overlapping token windows.
- SQLite queues survive restarts. Running jobs are requeued at worker startup.
  Idempotency keys prevent duplicate work; failed jobs accept another submission.
  The queue allows at most 100 active jobs. Uploaded content is held in the
  private queue until processing ends; the input field is then cleared.
- Completed/failed worker jobs expire after seven days during idle cleanup.
  The app stores synchronized results indefinitely with the original attachment
  in local `data/document-extractions.json` or Supabase's `document-extractions`
  namespace. Viewing an expired, unsynchronized job allows a retry from the saved
  original. An unavailable worker leaves the original downloadable.
- Removing an attachment/history event removes its app extraction record and
  requests deletion of the worker job when the worker is configured and reachable.
  If that request cannot run, worker-side retention still applies. Results are
  inaccessible through the app once the attachment is removed.
- All source and entity strings are escaped in the browser. Only the owning
  patient and clinicians can read/start processing. Only clinicians can record
  extraction review. Labels never populate active clinical facts automatically.

## Tests and remaining verification

```powershell
npm test
.\.venv-document\Scripts\python.exe -m pip install -r services/document_pipeline/requirements-dev.txt
.\.venv-document\Scripts\python.exe -m unittest services.document_pipeline.test_pipeline -v
```

Tests cover the app upload/job/result/review API, restart persistence, ownership,
retry and expiry, invalid spans, XSS escaping, PDF text extraction and rendering,
DOCX extraction, line cropping, UTF-16 NER offsets/windowing, queue recovery,
service authentication/body bounds, and clearing job inputs. Neural predictions
are replaced with deterministic fixtures in automated tests; these tests do not
measure real model accuracy. Validate both checkpoints with representative,
authorized documents before relying on extraction quality. Live worker/Vercel/
Supabase deployment and browser visual checks remain separate verification.
