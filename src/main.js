import './style.css';

const prompts = [
  { label: 'Main concern', text: 'Hello Ramesh. I’ll help your care team understand how you’re feeling. What is bothering you today?' },
  { label: 'When it started', text: 'Thank you. When did you first notice these symptoms?' },
  { label: 'Severity', text: 'On a scale of one to ten, how uncomfortable does it feel right now?' },
  { label: 'Anything else', text: 'Is there anything else you would like your care team to know?' },
];

let currentPrompt = 0;
let responses = [];
let selectedLanguage = 'en-IN';
let recognition;
let isListening = false;

const $ = (selector) => document.querySelector(selector);
const thread = $('#thread');
const micButton = $('#micButton');
const voiceDock = $('#voiceDock');
const voiceStatus = $('#voiceStatus');
const textForm = $('#textForm');
const textInput = $('#textInput');
const toast = $('#toast');

function makeIcon(name) { return `<i data-lucide="${name}"></i>`; }

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = selectedLanguage;
  utterance.rate = 0.96;
  window.speechSynthesis.speak(utterance);
}

function setListening(value) {
  isListening = value;
  micButton.classList.toggle('recording', value);
  voiceDock.classList.toggle('is-listening', value);
  micButton.innerHTML = makeIcon(value ? 'square' : 'mic');
  voiceStatus.textContent = value ? 'Listening… speak when you’re ready' : 'Tap the microphone and speak naturally';
  lucide.createIcons();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function updateSummary() {
  $('#responseCount').textContent = `${responses.length} of ${prompts.length}`;
  $('#progressBar').style.width = `${(responses.length / prompts.length) * 100}%`;
  $('#emptySummary').style.display = responses.length ? 'none' : 'flex';
  const list = $('#summaryItems');
  list.innerHTML = responses.map((response, index) => `<article class="summary-item"><span>${index + 1}</span><div><small>${response.label}</small><p>${response.answer}</p></div><button class="edit-answer" data-index="${index}" aria-label="Edit ${response.label}">${makeIcon('pencil')}</button></article>`).join('');
  lucide.createIcons();
}

function appendPatientMessage(answer) {
  const entry = document.createElement('article');
  entry.className = 'message patient-message';
  entry.innerHTML = `<div class="message-body"><div class="message-meta">You <span>•</span> just now</div><p></p></div><div class="patient-avatar">RP</div>`;
  entry.querySelector('p').textContent = answer;
  thread.append(entry);
  entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function appendPrompt(prompt) {
  const entry = document.createElement('article');
  entry.className = 'message assistant-message next-message';
  entry.innerHTML = `<div class="assistant-avatar">${makeIcon('sparkles')}</div><div class="message-body"><div class="message-meta">MediTrace <span>•</span> just now</div><p></p><button class="listen-button speak-trigger">${makeIcon('volume-2')} Listen again</button></div>`;
  entry.querySelector('p').textContent = prompt.text;
  entry.querySelector('.speak-trigger').dataset.text = prompt.text;
  thread.append(entry);
  lucide.createIcons();
  entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  window.setTimeout(() => speak(prompt.text), 450);
}

function submitAnswer(answer) {
  const clean = answer.trim();
  if (!clean) return;
  if (currentPrompt >= prompts.length) return;
  responses.push({ label: prompts[currentPrompt].label, answer: clean });
  appendPatientMessage(clean);
  updateSummary();
  textInput.value = '';
  currentPrompt += 1;
  if (currentPrompt < prompts.length) {
    window.setTimeout(() => appendPrompt(prompts[currentPrompt]), 450);
  } else {
    window.setTimeout(() => {
      appendPrompt({ text: 'Thank you. I’ve captured your responses. Please take a moment to review them in the panel on the right.' });
      voiceDock.classList.add('complete');
      voiceStatus.textContent = 'Your intake responses are ready to review';
      micButton.disabled = true;
    }, 450);
  }
}

function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice input is not supported in this browser. You can type your response instead.');
    textInput.focus();
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = selectedLanguage;
  recognition.continuous = false;
  recognition.interimResults = true;
  let finalText = '';
  recognition.onstart = () => setListening(true);
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interim += text;
    }
    textInput.value = finalText || interim;
  };
  recognition.onerror = (event) => {
    setListening(false);
    if (event.error !== 'aborted') showToast(event.error === 'not-allowed' ? 'Microphone access was not allowed. Type your response instead.' : 'I couldn’t hear that clearly. Please try again.');
  };
  recognition.onend = () => {
    setListening(false);
    if (finalText.trim()) submitAnswer(finalText);
  };
  recognition.start();
}

micButton.addEventListener('click', () => {
  if (isListening && recognition) recognition.stop();
  else startRecognition();
});

textForm.addEventListener('submit', (event) => { event.preventDefault(); submitAnswer(textInput.value); });
document.addEventListener('click', (event) => { const button = event.target.closest('.speak-trigger'); if (button) speak(button.dataset.text); });

$('#languageButton').addEventListener('click', () => $('#languageMenu').classList.toggle('open'));
document.querySelectorAll('#languageMenu button').forEach((button) => button.addEventListener('click', () => {
  selectedLanguage = button.dataset.lang;
  $('#languageName').textContent = button.dataset.name;
  $('#languageMenu').classList.remove('open');
  showToast(`Voice language set to ${button.dataset.name}`);
}));

$('#summaryItems').addEventListener('click', (event) => {
  const edit = event.target.closest('.edit-answer');
  if (!edit) return;
  const index = Number(edit.dataset.index);
  textInput.value = responses[index].answer;
  textInput.focus();
  showToast(`Editing “${responses[index].label}”. Submit to add your updated response.`);
});

lucide.createIcons();
window.setTimeout(() => speak(prompts[0].text), 700);
