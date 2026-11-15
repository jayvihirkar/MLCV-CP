FROM python:3.12-slim
WORKDIR /app
COPY services/document_pipeline/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu 'torch>=2.6,<3' && pip install --no-cache-dir -r requirements.txt
COPY services/document_pipeline /app/services/document_pipeline
ENV DOCUMENT_QUEUE_PATH=/data/jobs.sqlite3 HF_HOME=/data/models PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --create-home worker && mkdir -p /data && chown -R worker:worker /data /app
USER worker
EXPOSE 8000
CMD ["uvicorn", "services.document_pipeline.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
