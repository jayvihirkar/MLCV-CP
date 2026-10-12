# MediTrace Voice Intake - Handover

## What this project is

This is a focused frontend prototype for **MediTrace**, a patient pre-intake experience inspired by the supplied SIH case-taking brief. The implemented scope is deliberately limited to the **voice input and voice output workflow** with a patient-friendly interface.

It does not include medical diagnosis, clinical NLP, user accounts, document OCR, databases, or backend APIs.

## What has been completed

- A polished, responsive three-panel patient intake interface.
- Browser-native voice input using the Web Speech Recognition API.
- Spoken assistant questions using the browser Speech Synthesis API.
- A microphone control with an active listening state and animated waveform.
- A text-field fallback when voice input is unavailable or not preferred.
- A four-question, guided intake flow:
  1. Main concern
  2. When the symptoms started
  3. Severity
  4. Anything else to share
- A visible conversation transcript with patient and MediTrace messages.
- A live intake summary that updates as the patient responds.
- A basic language selector for English, Hindi, and Tamil; this updates the speech-recognition/speech-synthesis locale.
- “Listen again” buttons to replay assistant prompts.
- Responsive styling for smaller screens.

## Project structure

```text
MLCV-CP/
├── index.html          # Page structure and UI content
├── package.json        # Vite scripts and dependency definition
├── src/
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
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173`.

For a production build:

```powershell
npm run build
```

The production files are created in `dist/`.

## How the voice workflow works

1. The page greets the patient and speaks the first question.
2. The patient can press the microphone and speak, or type an answer.
3. Speech recognition places the transcript into the input field.
4. A completed answer is added to the conversation and the intake summary.
5. MediTrace shows and speaks the next question.
6. After four responses, the workflow displays a completion message and disables additional microphone capture.

## Important browser notes

- Voice recognition depends on `window.SpeechRecognition` or `window.webkitSpeechRecognition`.
- Chrome and Edge generally provide the best support for this prototype.
- The browser must be allowed to access the microphone before voice capture can work.
- If speech recognition is unavailable or blocked, the user can still complete the flow with the text input.
- The current language selector changes recognition and speech locale settings; it does **not** translate prompt text yet.

## Verification completed

- `npm run build` completed successfully.
- The interface was opened and visually checked in a browser.
- The typed-answer flow was checked: a response appeared in both the transcript and intake summary, then the next question rendered correctly.

## Suggested next work

1. Connect the transcript and summary to a backend API/database.
2. Add real translations for each prompt and interface label.
3. Persist or edit answers rather than only adding a new response after the edit button is pressed.
4. Add an explicit review-and-submit screen, subject to consent and privacy requirements.
5. Add consent, accessibility, error recovery, and session handling before any real clinical use.
6. Integrate secure speech-to-text and text-to-speech services if consistent behaviour is needed across browsers/devices.

## Safety and scope note

This is a UI prototype only. It should not be treated as a medical device, diagnostic tool, or production health-record system. Any real deployment needs appropriate clinical review, privacy/security design, consent management, and compliance work.
