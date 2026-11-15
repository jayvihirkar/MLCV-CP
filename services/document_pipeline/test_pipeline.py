import io
import os
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from services.document_pipeline.pipeline import GoogleVisionUnavailable, OcrSpaceUnavailable, ocr_space_ocr, process_document, line_crops, extract_entities, utf16_length
from services.document_pipeline.queue import JobQueue
from services.document_pipeline.app import create_app


def docx(text):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("word/document.xml", f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>')
    return output.getvalue()


class PipelineTests(unittest.TestCase):
    def test_ocr_space_uses_fast_multipart_response(self):
        class Response:
            def read(self):
                return b'{"OCRExitCode":1,"IsErroredOnProcessing":false,"ParsedResults":[{"ParsedText":"Metformin 500 mg"}]}'
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
        image = Image.new("RGB", (100, 80), "white")
        with patch("services.document_pipeline.pipeline.OCR_SPACE_API_KEY", "fixture-key"), patch("urllib.request.urlopen", return_value=Response()):
            self.assertEqual(ocr_space_ocr(image, []), "Metformin 500 mg")

    def test_docx_uses_text_and_keeps_negation(self):
        text = "No aspirin allergy. Metformin 500 mg."
        result = process_document(docx(text), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ocr=lambda *_: self.fail("DOCX text should not use OCR"), ner=lambda text: [])
        self.assertEqual(result["pages"][0]["text"], text)
        self.assertEqual(result["pages"][0]["method"], "docx_text")
        self.assertTrue(result["needsReview"])

    def test_scanned_pdf_renders_each_page_for_ocr(self):
        image = Image.new("RGB", (300, 160), "white")
        ImageDraw.Draw(image).text((20, 20), "Metformin 500 mg", fill="black")
        output = io.BytesIO()
        image.save(output, format="PDF", save_all=True, append_images=[image])
        calls = []
        def ocr(page, _warnings):
            calls.append(page.size)
            return "Metformin 500 mg"
        result = process_document(output.getvalue(), "application/pdf", ocr=ocr, ner=lambda _: [])
        self.assertEqual(len(calls), 2)
        self.assertEqual([page["number"] for page in result["pages"]], [1, 2])
        self.assertTrue(all(page["method"] == "trocr" for page in result["pages"]))

    def test_pdf_text_layer_avoids_handwriting_model(self):
        parts = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
        stream = b"BT /F1 12 Tf 20 100 Td (Metformin 500 mg) Tj ET"
        parts.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
        data, offsets = b"%PDF-1.4\n", [0]
        for number, part in enumerate(parts, 1):
            offsets.append(len(data))
            data += f"{number} 0 obj\n".encode() + part + b"\nendobj\n"
        xref = len(data)
        data += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
        data += f"trailer << /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
        result = process_document(data, "application/pdf", ocr=lambda *_: self.fail("Text PDF should not call OCR"), ner=lambda _: [])
        self.assertIn("Metformin", result["pages"][0]["text"])
        self.assertEqual(result["pages"][0]["method"], "pdf_text")

    def test_multiline_image_and_blank_page(self):
        image = Image.new("RGB", (400, 150), "white")
        draw = ImageDraw.Draw(image)
        for y in [15, 55, 100]:
            draw.rectangle((20, y, 300, y + 10), fill="black")
        self.assertEqual(len(line_crops(image)), 3)
        self.assertEqual(line_crops(Image.new("RGB", (100, 100), "white")), [])

    def test_ner_windows_cover_end_and_utf16_offsets(self):
        text = "🧪 " + "word " * 400 + "Metformin"
        def tokenizer(text, **_kwargs):
            import re
            return {"offset_mapping": [(match.start(), match.end()) for match in re.finditer(r"\S+", text)]}
        def ner(chunk):
            start = chunk.find("Metformin")
            return [] if start < 0 else [{"start": start, "end": start + 9, "score": 0.9, "entity_group": "Medication"}]
        with patch("services.document_pipeline.pipeline.nlp_models", return_value=(tokenizer, ner)):
            entities = extract_entities(text)
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0]["start"], utf16_length(text[:text.index("Metformin")]))
        self.assertEqual(entities[0]["text"], "Metformin")
        self.assertEqual(entities[0]["assertion"], "not_assessed")

    def test_queue_restart_idempotency_retry_and_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "jobs.sqlite3"
            queue = JobQueue(path)
            queue.submit("a", b"source", "image/png")
            queue.claim()
            restarted = JobQueue(path)
            restarted.recover()
            self.assertEqual(restarted.get("a")["status"], "queued")
            self.assertEqual(restarted.submit("a", b"source", "image/png")["status"], "queued")
            with self.assertRaises(ValueError):
                restarted.submit("a", b"different", "image/png")
            restarted.claim()
            restarted.progress("a", "Reading text line 2 of 5")
            self.assertEqual(restarted.get("a")["progress"], "Reading text line 2 of 5")
            restarted.finish("a", error="Google Cloud Vision OCR requires billing to be enabled.")
            self.assertIn("billing", restarted.get("a")["error"])
            self.assertEqual(restarted.submit("a", b"source", "image/png")["status"], "queued")
            restarted.claim()
            restarted.delete("a")
            restarted.finish("a", {"pages": []})
            self.assertIsNone(restarted.get("a"))

    def test_authenticated_service_runs_and_clears_raw_input(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"DOCUMENT_PIPELINE_TOKEN": "test-secret"}):
            result = {"pages": [{"number": 1, "text": "Source", "entities": [], "method": "trocr"}], "models": {"ocr": "fixture", "nlp": "fixture"}, "warnings": []}
            app = create_app(Path(directory) / "jobs.sqlite3", processor=lambda *_: result)
            auth = {"Authorization": "Bearer test-secret", "Idempotency-Key": "a" * 64}
            with TestClient(app) as client:
                self.assertEqual(client.post("/jobs", content=b"x").status_code, 401)
                self.assertEqual(client.post("/jobs", content=b"x", headers={**auth, "Content-Length": str(12 * 1024 * 1024)}).status_code, 413)
                response = client.post("/jobs", files={"file": ("source.png", b"synthetic", "image/png")}, headers=auth)
                self.assertEqual(response.status_code, 200)
                key = response.json()["id"]
                for _ in range(50):
                    payload = client.get(f"/jobs/{key}", headers=auth).json()
                    if payload["status"] == "completed":
                        break
                    time.sleep(0.05)
                self.assertEqual(payload["result"], result)
                with app.state.queue.connection() as db:
                    self.assertIsNone(db.execute("select input from jobs where id=?", (key,)).fetchone()[0])
                self.assertEqual(client.delete(f"/jobs/{key}", headers=auth).status_code, 204)
                self.assertEqual(client.get(f"/jobs/{key}", headers=auth).status_code, 404)

    def test_google_ocr_failures_are_returned_without_slow_local_fallback(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"DOCUMENT_PIPELINE_TOKEN": "test-secret"}):
            def fail_google(*_args):
                raise GoogleVisionUnavailable("Google Cloud Vision OCR requires billing to be enabled for the configured Google Cloud project. Enable billing, then retry extraction.")
            app = create_app(Path(directory) / "jobs.sqlite3", processor=fail_google)
            auth = {"Authorization": "Bearer test-secret", "Idempotency-Key": "b" * 64}
            with TestClient(app) as client:
                key = client.post("/jobs", files={"file": ("source.png", b"synthetic", "image/png")}, headers=auth).json()["id"]
                for _ in range(50):
                    payload = client.get(f"/jobs/{key}", headers=auth).json()
                    if payload["status"] == "failed":
                        break
                    time.sleep(0.05)
                self.assertEqual(payload["status"], "failed")
                self.assertIn("billing", payload["error"])


if __name__ == "__main__":
    unittest.main()
