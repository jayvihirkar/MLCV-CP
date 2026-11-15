import hmac
import os
import re
import threading
import warnings
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, Request
from fastapi.responses import JSONResponse
from .pipeline import OcrProviderUnavailable, process_document, progress_callback
from .queue import JobQueue


def create_app(queue_path=None, processor=process_document, run_worker=True):
    token = os.getenv("DOCUMENT_PIPELINE_TOKEN", "")
    queue = JobQueue(queue_path or os.getenv("DOCUMENT_QUEUE_PATH", "./worker-data/jobs.sqlite3"))
    stopped = threading.Event()

    def worker():
        while not stopped.is_set():
            task = queue.claim()
            if not task:
                queue.cleanup()
                stopped.wait(1)
                continue
            key, data, mime_type = task
            progress_context = progress_callback.set(lambda message: queue.progress(key, message))
            queue.progress(key, "Opening document")
            try:
                # Large images raise rather than merely warn before decompression.
                from PIL import Image
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    result = processor(data, mime_type)
                queue.finish(key, result)
            except Exception as failure:
                print(f"Document extraction failed ({type(failure).__name__}).", flush=True)
                message = str(failure) if isinstance(failure, OcrProviderUnavailable) else "Extraction failed while processing the document. Retry extraction or review the original manually."
                queue.finish(key, error=message)
            finally:
                progress_callback.reset(progress_context)

    @asynccontextmanager
    async def lifespan(_app):
        if not token:
            raise RuntimeError("DOCUMENT_PIPELINE_TOKEN is required.")
        if run_worker:
            queue.recover()
            thread = threading.Thread(target=worker, daemon=True)
            thread.start()
        yield
        stopped.set()
        if run_worker:
            thread.join(timeout=2)

    app = FastAPI(title="MediTrace document pipeline", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.queue = queue

    @app.middleware("http")
    async def guard(request: Request, call_next):
        # Check the shared credential and body bound before multipart parsing.
        if not token or not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        if request.method == "POST":
            length = request.headers.get("content-length", "")
            if not length.isdigit():
                return JSONResponse({"detail": "Content-Length is required."}, status_code=411)
            if int(length) > 10 * 1024 * 1024 + 65536:
                return JSONResponse({"detail": "Document request is too large."}, status_code=413)
        return await call_next(request)

    def authorize(authorization: str = Header(default="")):
        if not token or not hmac.compare_digest(authorization, f"Bearer {token}"):
            raise HTTPException(401, "Unauthorized")

    @app.get("/health", dependencies=[Depends(authorize)])
    def health():
        return {"ok": True}

    @app.post("/jobs", dependencies=[Depends(authorize)])
    async def submit(file: UploadFile = File(...), idempotency_key: str = Header(alias="Idempotency-Key", default="")):
        if not re.fullmatch(r"[a-f0-9]{64}", idempotency_key):
            raise HTTPException(400, "A SHA-256 idempotency key is required.")
        try:
            data = await file.read(10 * 1024 * 1024 + 1)
            if not data or len(data) > 10 * 1024 * 1024:
                raise HTTPException(413, "File must be between 1 byte and 10 MB.")
            allowed = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"}
            if file.content_type not in allowed:
                raise HTTPException(415, "Unsupported document type.")
            return queue.submit(idempotency_key, data, file.content_type)
        except ValueError:
            raise HTTPException(409, "The idempotency key identifies different content.")
        except OverflowError:
            raise HTTPException(503, "The document queue is full. Try again later.")
        finally:
            await file.close()

    @app.get("/jobs/{key}", dependencies=[Depends(authorize)])
    def status(key: str):
        result = queue.get(key)
        if not result:
            raise HTTPException(404, "Job not found or expired.")
        return result

    @app.delete("/jobs/{key}", status_code=204, dependencies=[Depends(authorize)])
    def delete(key: str):
        queue.delete(key)

    return app


app = create_app()
