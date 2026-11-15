# OCR test images

1. `01-printed-medical-note.png`: generated clean print, easy baseline. Its `.expected.txt` reference was checked visually against the image.
2. `02-handwritten-medical-note.png`: generated blue-ink cursive with camera skew and paper texture. Its `.expected.txt` reference was checked visually against the image. This is simulated handwriting, not a human handwriting benchmark.
3. `03-real-handwritten-prescription-1935.jpg`: genuine historical handwritten prescription from the Norwegian Pharmacy Museum. It is an additional difficult, non-English example, not an accuracy benchmark for the English medical NLP model. No verified transcription is included; do not score it against an invented reference.

## Test

With the app and document worker running, sign in as a patient, choose **Upload documents**, and select one PNG/JPG at a time. Extraction should start automatically. Check progress, then compare **View extracted source text** with the matching `.expected.txt`. Check especially medical names, numbers, dosage, and negation. Line wrapping, whitespace and punctuation can vary; record substantive errors separately. Uploading all three together also exercises multi-file processing.

For image 1 check `Metformin`, `500 mg`, `twice daily`, `Type 2 diabetes mellitus`, `Knee X-ray`, and `No known drug allergies`. For image 2 check `Salbutamol`, `Penicillin`, `asthma`, `Complete blood count`, and preservation of `No chest pain`. Entity detection may vary; a negated mention must not become a confirmed positive clinical fact.

These files have not yet been run through the live OCR model. The first job may need to download model weights. A generated test set does not establish real-world clinical accuracy.

## Provenance and license

Images 1 and 2 were made using the built-in image generation tool on 26 October 2026. They contain fictional test information. Their full generation prompts are in `generation-prompts.txt`.

Image 3: **Håndskrevet resept (1935)**, photograph by **Anne-Lise Reinsfelt / Norsk Farmasihistorisk Museum**, collection accession **NFA.17693**. Retrieved unmodified from Wikimedia Commons on 26 October 2026.

- Source and attribution: https://commons.wikimedia.org/wiki/File:H%C3%A5ndskrevet_resept_(1935).jpg
- Original: https://upload.wikimedia.org/wikipedia/commons/d/d4/H%C3%A5ndskrevet_resept_%281935%29.jpg
- License: Creative Commons Attribution-ShareAlike 4.0 International, https://creativecommons.org/licenses/by-sa/4.0/

Keep this attribution with copies of image 3. Adaptations must comply with that license.
