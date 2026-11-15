"""Document parsing, OCR, and grounded English medical NER.

Models load lazily in the worker thread. OCR uses the configured hosted provider
or the local TrOCR model when explicitly selected.
"""
import io
import os
import zipfile
from functools import lru_cache
from contextlib import closing
from contextvars import ContextVar

progress_callback = ContextVar("document_progress", default=lambda message: None)
def report_progress(message):
    progress_callback.get()(message)

OCR_MODEL = os.getenv("MEDICAL_TROCR_MODEL", "aci-mis-team/trocr-large-handwritten-prescription")
OCR_PROCESSOR = os.getenv("MEDICAL_TROCR_PROCESSOR", OCR_MODEL)
GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_CLOUD_VISION_API_KEY", "").strip()
GOOGLE_VISION_FALLBACK_TO_TROCR = os.getenv("GOOGLE_VISION_FALLBACK_TO_TROCR", "false").strip().lower() == "true"
OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY", "").strip()
OCR_PROVIDER = os.getenv("DOCUMENT_OCR_PROVIDER", "ocr_space").strip().lower()
OCR_SPACE_ENGINE = os.getenv("OCR_SPACE_ENGINE", "2").strip()
NER_MODEL = os.getenv("MEDICAL_NLP_MODEL", "d4data/biomedical-ner-all")
MAX_PAGES = min(20, max(1, int(os.getenv("DOCUMENT_MAX_PAGES", "12"))))
MAX_TEXT = 30000


class OcrProviderUnavailable(RuntimeError):
    """The selected remote OCR provider could not process the document."""


class GoogleVisionUnavailable(OcrProviderUnavailable):
    """A configured Google OCR provider could not process the document."""


class OcrSpaceUnavailable(OcrProviderUnavailable):
    """A configured OCR.space provider could not process the document."""


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def clip_text(text, limit):
    return text.encode("utf-16-le")[:limit * 2].decode("utf-16-le", errors="ignore")


def category(label):
    value = label.lower().replace("_", "").replace("-", "")
    if value in {"medication", "drug"}:
        return "medication"
    if value in {"disease", "diseasedisorder", "diagnosis"}:
        return "condition"
    if value in {"signsymptom", "symptom"}:
        return "symptom"
    if value in {"diagnosticprocedure", "labvalue", "labtest"}:
        return "test"
    if value in {"therapeuticprocedure", "procedure"}:
        return "procedure"
    if value in {"dosage", "dose", "strength"}:
        return "dose"
    if value == "frequency":
        return "frequency"
    return "other"


def line_crops(image):
    """Split single-column pages into horizontal text bands, then crop margins.

    TrOCR expects line images; feeding a complete prescription loses lines.
    Layout reconstruction of columns, tables, or overlapping writing is not done.
    """
    import numpy as np
    from PIL import ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((2200, 3200))
    gray = np.asarray(ImageOps.autocontrast(image.convert("L")))
    ink = gray < 180
    active = ink.sum(axis=1) >= max(3, image.width * 0.002)
    # Fill short gaps within characters, preserving spaces between text lines.
    for index in range(1, len(active) - 2):
        if active[index - 1] and active[index + 1]:
            active[index] = True
    padded = np.pad(active.astype(int), (1, 1))
    starts = np.where(np.diff(padded) == 1)[0]
    ends = np.where(np.diff(padded) == -1)[0]
    crops = []
    for top, bottom in zip(starts, ends):
        columns = np.where(ink[top:bottom].any(axis=0))[0]
        if bottom - top < 3 or len(columns) < 3:
            continue
        left, right = int(columns[0]), int(columns[-1]) + 1
        crops.append(image.crop((max(0, left - 6), max(0, top - 4), min(image.width, right + 6), min(image.height, bottom + 4))))
    return crops


@lru_cache(maxsize=1)
def ocr_models():
    report_progress("Preparing handwriting model (first use may download model weights)")
    import torch
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = TrOCRProcessor.from_pretrained(OCR_PROCESSOR, trust_remote_code=False)
    model = VisionEncoderDecoderModel.from_pretrained(OCR_MODEL, trust_remote_code=False, weights_only=True).to(device).eval()
    return processor, model, device


def transcribe_image(image, warnings):
    import torch

    crops = line_crops(image)
    if len(crops) > 120:
        warnings.append("Only the first 120 detected lines on one image were processed.")
    if not crops:
        return ""
    processor, model, device = ocr_models()
    lines = []
    with torch.inference_mode():
        for index, crop in enumerate(crops[:120]):
            report_progress(f"Reading text line {index + 1} of {min(len(crops), 120)}")
            pixels = processor(images=crop, return_tensors="pt").pixel_values.to(device)
            generated = model.generate(pixels, max_new_tokens=128, num_beams=2, max_time=30)
            if generated.shape[-1] >= 128:
                warnings.append("One or more OCR lines reached the model token limit; verify the original.")
            lines.append(processor.batch_decode(generated, skip_special_tokens=True)[0].strip())
    return "\n".join(line for line in lines if line)


def google_vision_ocr(image, warnings):
    """Recognize a full page with Google Vision's document text detection.

    Enabled only when GOOGLE_CLOUD_VISION_API_KEY is configured. The caller
    decides whether to fall back to local TrOCR if the vendor request fails.
    """
    import base64
    import json
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen
    from PIL import Image, ImageOps

    report_progress("Preparing page for Google Cloud Vision OCR")
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((4000, 4000))
    encoded = io.BytesIO()
    image.save(encoded, format="JPEG", quality=92, optimize=True)
    body = json.dumps({"requests": [{"image": {"content": base64.b64encode(encoded.getvalue()).decode("ascii")}, "features": [{"type": "DOCUMENT_TEXT_DETECTION"}]}]}).encode()
    request = Request(
        f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        report_progress("Reading page with Google Cloud Vision OCR")
        with urlopen(request, timeout=35) as response:
            result = json.loads(response.read())
    except HTTPError as failure:
        try:
            detail = json.loads(failure.read()).get("error", {}).get("message", "")
        except (ValueError, OSError):
            detail = ""
        summary = f"HTTP {failure.code}" + (f": {detail[:180]}" if detail else "")
        raise RuntimeError(summary) from failure
    except URLError as failure:
        reason = failure.reason
        if isinstance(reason, TimeoutError):
            raise RuntimeError("connection timed out") from failure
        raise RuntimeError(f"connection failed ({type(reason).__name__})") from failure
    except (TimeoutError, OSError) as failure:
        raise RuntimeError(f"request failed ({type(failure).__name__})") from failure
    except ValueError as failure:
        raise RuntimeError("Google Vision returned invalid JSON") from failure
    response = (result.get("responses") or [{}])[0]
    if response.get("error"):
        detail = response["error"].get("message", "")
        status = response["error"].get("status", "request error")
        raise RuntimeError(f"{status}" + (f": {detail[:180]}" if detail else ""))
    return (response.get("fullTextAnnotation") or {}).get("text", "").strip()


def ocr_space_ocr(image, warnings):
    """Recognize a rendered page through OCR.space's multipart API.

    The free tier accepts 1 MB files, so pages are recompressed below that limit
    before upload. PDFs are already rendered into one image per page upstream.
    """
    import json
    from uuid import uuid4
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen
    from PIL import ImageOps

    report_progress("Preparing page for OCR.space")
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((2200, 2200))
    encoded = io.BytesIO()
    quality = 85
    while True:
        encoded.seek(0)
        encoded.truncate(0)
        image.save(encoded, format="JPEG", quality=quality, optimize=True)
        if encoded.tell() <= 950 * 1024 or quality <= 45:
            break
        quality -= 10
    if encoded.tell() > 1024 * 1024:
        raise OcrSpaceUnavailable("OCR.space could not reduce this page below the free-tier 1 MB upload limit. Use a smaller image or configure another OCR provider.")

    boundary = f"----MediTrace{uuid4().hex}"
    fields = [("language", "auto"), ("isOverlayRequired", "false"), ("detectOrientation", "true"), ("OCREngine", OCR_SPACE_ENGINE)]
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"page.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".encode())
    body.extend(encoded.getvalue())
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    request = Request(
        "https://api.ocr.space/parse/image",
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "apikey": OCR_SPACE_API_KEY},
        method="POST",
    )
    try:
        report_progress("Reading page with OCR.space")
        with urlopen(request, timeout=35) as response:
            result = json.loads(response.read())
    except HTTPError as failure:
        raise OcrSpaceUnavailable(f"OCR.space rejected the request (HTTP {failure.code}). Check the API key and free-tier limits, then retry extraction.") from failure
    except (URLError, TimeoutError, OSError, ValueError) as failure:
        raise OcrSpaceUnavailable("OCR.space could not be reached. Check the network and retry extraction.") from failure
    if result.get("IsErroredOnProcessing") or str(result.get("OCRExitCode")) not in {"1", "2"}:
        detail = result.get("ErrorMessage") or result.get("ErrorDetails") or "OCR.space could not read this document."
        if isinstance(detail, list):
            detail = "; ".join(map(str, detail))
        raise OcrSpaceUnavailable(f"OCR.space could not process this document: {str(detail)[:240]}")
    pages = result.get("ParsedResults") or []
    text = "\n".join(str(page.get("ParsedText") or "").strip() for page in pages if isinstance(page, dict)).strip()
    if not text:
        warnings.append("OCR.space returned no readable text; inspect the original manually.")
    return text


def recognize_image(image, warnings):
    if OCR_PROVIDER == "ocr_space":
        if not OCR_SPACE_API_KEY:
            raise OcrSpaceUnavailable("OCR.space is selected but OCR_SPACE_API_KEY is not configured on the document worker. Register a free key at ocr.space/ocrapi, add it to .env, and restart the worker.")
        return "ocr_space", ocr_space_ocr(image, warnings)
    if OCR_PROVIDER == "google_vision":
        if not GOOGLE_VISION_API_KEY:
            raise GoogleVisionUnavailable("Google Cloud Vision is selected but GOOGLE_CLOUD_VISION_API_KEY is not configured on the document worker.")
        try:
            return "google_vision", google_vision_ocr(image, warnings)
        except Exception as failure:
            reason = str(failure) if isinstance(failure, RuntimeError) else type(failure).__name__
            if not GOOGLE_VISION_FALLBACK_TO_TROCR:
                if "billing" in reason.lower():
                    raise GoogleVisionUnavailable("Google Cloud Vision OCR requires billing to be enabled for the configured Google Cloud project. Enable billing, then retry extraction.") from failure
                raise GoogleVisionUnavailable("Google Cloud Vision OCR could not process this document. Check the worker API key, Cloud Vision API, and quota, then retry extraction.") from failure
            warnings.append(f"Google Vision OCR failed ({reason[:220]}); local handwriting OCR was used instead.")
        return "trocr", transcribe_image(image, warnings)
    if OCR_PROVIDER == "local":
        return "trocr", transcribe_image(image, warnings)
    raise OcrProviderUnavailable("No supported OCR provider is configured. Set DOCUMENT_OCR_PROVIDER to ocr_space, google_vision, or local.")


@lru_cache(maxsize=1)
def nlp_models():
    report_progress("Preparing medical language model (first use may download model weights)")
    import torch
    from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

    tokenizer = AutoTokenizer.from_pretrained(NER_MODEL, trust_remote_code=False)
    model = AutoModelForTokenClassification.from_pretrained(NER_MODEL, trust_remote_code=False, weights_only=True)
    ner = pipeline("token-classification", model=model, tokenizer=tokenizer, aggregation_strategy="simple", device=0 if torch.cuda.is_available() else -1)
    return tokenizer, ner


def extract_entities(text):
    if not text.strip():
        return []
    tokenizer, ner = nlp_models()
    report_progress("Identifying medical terms")
    offsets = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True, truncation=False)["offset_mapping"]
    entities = {}
    # Token windows with overlap preserve long reports and exact source offsets.
    for index in range(0, len(offsets), 270):
        window = offsets[index:index + 300]
        start, end = window[0][0], window[-1][1]
        for item in ner(text[start:end]):
            left, right = start + int(item["start"]), start + int(item["end"])
            score = float(item["score"])
            if score < 0.5 or left >= right or right > len(text):
                continue
            label = item["entity_group"]
            key = (left, right, label)
            previous = entities.get(key)
            if previous and previous["score"] >= score:
                continue
            entities[key] = {"text": text[left:right], "start": utf16_length(text[:left]), "end": utf16_length(text[:right]), "score": score, "label": label, "category": category(label), "assertion": "not_assessed"}
    return sorted(entities.values(), key=lambda item: (item["start"], item["end"]))


def document_pages(data, mime_type, warnings, ocr=transcribe_image):
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = 20_000_000
    if mime_type == "application/pdf":
        import pypdfium2 as pdfium

        with closing(pdfium.PdfDocument(data)) as document:
            if len(document) > MAX_PAGES:
                warnings.append(f"Only the first {MAX_PAGES} PDF pages were processed.")
            for index in range(min(len(document), MAX_PAGES)):
                with closing(document[index]) as page:
                    with closing(page.get_textpage()) as text_page:
                        text = text_page.get_text_bounded().replace("\r\n", "\n").strip()
                    if text:
                        # OCR image-only regions in mixed text/image PDFs is not inferred.
                        warnings.append("PDF pages with embedded text use that text layer; image-only regions on those pages may be absent.")
                        yield "pdf_text", text
                    else:
                        width, height = page.get_size()
                        scale = min(2.0, 2200 / max(width, height))
                        with closing(page.render(scale=scale)) as bitmap:
                            page_image = bitmap.to_pil().copy()
                            yield recognize_image(page_image, warnings) if ocr is transcribe_image else ("trocr", ocr(page_image, warnings))
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        from defusedxml import ElementTree

        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(item.file_size for item in archive.infolist()) > 30 * 1024 * 1024:
                raise ValueError("DOCX expands beyond the supported size.")
            root = ElementTree.fromstring(archive.read("word/document.xml"))
            ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            paragraphs = []
            for paragraph in root.iter(ns + "p"):
                pieces = []
                for node in paragraph.iter():
                    if node.tag == ns + "t":
                        pieces.append(node.text or "")
                    elif node.tag == ns + "tab":
                        pieces.append("\t")
                    elif node.tag in {ns + "br", ns + "cr"}:
                        pieces.append("\n")
                paragraphs.append("".join(pieces))
            yield "docx_text", "\n".join(paragraphs).strip()
            warnings.append("DOCX page numbers are extraction sections. Headers, footers, and document layout are not reconstructed.")
            images = [name for name in archive.namelist() if name.startswith("word/media/") and name.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))]
            if len(images) + 1 > MAX_PAGES:
                warnings.append("Some embedded DOCX images exceeded the section limit.")
            for name in images[:MAX_PAGES - 1]:
                with Image.open(io.BytesIO(archive.read(name))) as image:
                    image.load()
                    page_image = ImageOps.exif_transpose(image)
                    if ocr is transcribe_image:
                        method, text = recognize_image(page_image, warnings)
                        yield ("docx_image" if method == "trocr" else "google_vision"), text
                    else:
                        yield "docx_image", ocr(page_image, warnings)
    elif mime_type.startswith("image/"):
        if mime_type in {"image/heic", "image/heif"}:
            from pillow_heif import register_heif_opener
            register_heif_opener()
        with Image.open(io.BytesIO(data)) as image:
            if getattr(image, "n_frames", 1) > 1:
                warnings.append("Only the first frame of this image was processed.")
            image.load()
            if ocr is transcribe_image:
                yield recognize_image(ImageOps.exif_transpose(image), warnings)
            else:
                yield "trocr", ocr(ImageOps.exif_transpose(image), warnings)
    else:
        raise ValueError("Unsupported document type.")


def process_document(data, mime_type, ocr=transcribe_image, ner=extract_entities):
    warnings = ["Machine extraction requires review against the original. Entity labels do not establish diagnosis, active medication use, or negation."]
    if OCR_PROVIDER == "local":
        warnings.append("Local OCR line segmentation assumes a single-column page; check tables, columns, rotated or overlapping handwriting manually.")
    elif OCR_PROVIDER == "google_vision" and GOOGLE_VISION_FALLBACK_TO_TROCR:
        warnings.append("Google Cloud Vision is preferred. If it is unavailable, local handwriting OCR may be used and can take several minutes on CPU.")
    if NER_MODEL == "d4data/biomedical-ner-all":
        warnings.append("The medical entity model is English; non-English content needs manual review.")
    pages, remaining = [], MAX_TEXT
    for method, text in document_pages(data, mime_type, warnings, ocr):
        if utf16_length(text) > remaining:
            warnings.append("Text was truncated at the 30,000-character extraction limit.")
        text = clip_text(text, remaining)
        remaining -= utf16_length(text)
        entities = ner(text)
        if len(entities) > 500:
            warnings.append("Only the first 500 entities on one page were retained.")
        pages.append({"number": len(pages) + 1, "method": method, "text": text, "entities": entities[:500]})
        if remaining <= 0:
            warnings.append("Later pages/sections were not processed because the text limit was reached.")
            break
    if not pages:
        raise ValueError("The document has no readable pages.")
    if not any(page["text"].strip() for page in pages):
        warnings.append("No readable text was detected; inspect the original manually.")
    ocr_label = {"ocr_space": f"OCR.space Engine {OCR_SPACE_ENGINE}", "google_vision": "Google Cloud Vision DOCUMENT_TEXT_DETECTION", "local": OCR_MODEL}.get(OCR_PROVIDER, OCR_PROVIDER)
    if OCR_PROVIDER == "google_vision" and GOOGLE_VISION_FALLBACK_TO_TROCR:
        ocr_label += " + opt-in local TrOCR fallback"
    return {"pages": pages, "warnings": list(dict.fromkeys(warnings)), "models": {"ocr": ocr_label, "nlp": NER_MODEL}, "needsReview": True}
