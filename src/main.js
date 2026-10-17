import './style.css';

const ui = {
  en: { newConsultation: 'New consultation', todaysIntake: 'Today’s intake', welcome: 'Welcome', completed: 'Completed', currentConcern: 'Current concern', inProgress: 'In progress', healthHistory: 'Health history', upNext: 'Up next', review: 'Review', privateByDesign: 'Private by design', privacyText: 'Your answers are saved to your local intake session and shown in your summary for review.', saveLater: 'End & save later', voiceIntake: 'Voice-assisted intake', stepOfFour: 'Step 2 of 4', letsBegin: 'Let’s begin', pageTitle: 'Tell me what brings<br/>you in today.', aboutThreeMinutes: 'About 3 minutes', orType: 'or type your response', micPrivacy: 'Your microphone is only used while you are speaking.', yourResponses: 'Your responses', intakeSummary: 'Intake summary', wereListening: 'We’re listening', emptySummary: 'Your answers will appear here as you go, so you can review them before sharing.', tapToSpeak: 'Tap the microphone and speak naturally', recording: 'Recording your response… tap again to stop', transcribing: 'Transcribing your response…', fallbackNarration: 'ElevenLabs is not configured yet. Add your API key to .env; the prompt text is still shown.', voiceError: 'We could not transcribe that audio. Please try again or type your response.', ready: 'Your responses are ready to review', completeReply: 'Thank you. I have recorded your responses. Please review them in the panel before sharing.', greeting: 'Hello Ramesh. I’ll help your care team understand how you’re feeling.', chooseOne: 'Please choose at least one option.', sendSelection: 'Send selection', typePlaceholder: 'Type your response here...' },
  hi: { newConsultation: 'नई परामर्श', todaysIntake: 'आज का इंटेक', welcome: 'स्वागत', completed: 'पूरा हुआ', currentConcern: 'वर्तमान समस्या', inProgress: 'जारी है', healthHistory: 'स्वास्थ्य इतिहास', upNext: 'आगे', review: 'समीक्षा', privateByDesign: 'निजी और सुरक्षित', privacyText: 'आपके उत्तर आपके स्थानीय इंटेक सत्र में सहेजे जाते हैं और समीक्षा के लिए आपके सारांश में दिखते हैं।', saveLater: 'अभी रोकें और बाद में सहेजें', voiceIntake: 'वॉइस-सहायता इंटेक', stepOfFour: 'चरण 2 / 4', letsBegin: 'शुरू करते हैं', pageTitle: 'आज आपको क्या<br/>परेशानी है?', aboutThreeMinutes: 'लगभग 3 मिनट', orType: 'या अपना उत्तर लिखें', micPrivacy: 'आपका माइक्रोफ़ोन केवल आपके बोलते समय उपयोग किया जाता है।', yourResponses: 'आपके उत्तर', intakeSummary: 'इंटेक सारांश', wereListening: 'हम सुन रहे हैं', emptySummary: 'आपके उत्तर यहाँ दिखाई देंगे, ताकि साझा करने से पहले आप उनकी समीक्षा कर सकें।', tapToSpeak: 'माइक्रोफ़ोन दबाएँ और स्वाभाविक रूप से बोलें', recording: 'आपका उत्तर रिकॉर्ड हो रहा है… रोकने के लिए दोबारा दबाएँ', transcribing: 'आपके उत्तर को लिखा जा रहा है…', fallbackNarration: 'ElevenLabs अभी सेट नहीं है। .env में API key जोड़ें; प्रश्न स्क्रीन पर मौजूद है।', voiceError: 'हम इस ऑडियो को समझ नहीं पाए। कृपया फिर से कोशिश करें या उत्तर लिखें।', ready: 'आपके उत्तर समीक्षा के लिए तैयार हैं', completeReply: 'धन्यवाद। मैंने आपके उत्तर दर्ज कर लिए हैं। कृपया दाईं ओर दिए गए पैनल में उनकी समीक्षा करें।', greeting: 'नमस्ते रमेश। मैं आपकी देखभाल टीम को यह समझने में मदद करूँगी कि आप कैसा महसूस कर रहे हैं।', chooseOne: 'कृपया कम से कम एक विकल्प चुनें।', sendSelection: 'चयन भेजें', typePlaceholder: 'अपना उत्तर यहाँ लिखें...' },
  ta: { newConsultation: 'புதிய ஆலோசனை', todaysIntake: 'இன்றைய பதிவு', welcome: 'வரவேற்பு', completed: 'முடிந்தது', currentConcern: 'தற்போதைய பிரச்சினை', inProgress: 'நடைபெறுகிறது', healthHistory: 'உடல்நல வரலாறு', upNext: 'அடுத்து', review: 'மதிப்பாய்வு', privateByDesign: 'தனியுரிமை பாதுகாக்கப்பட்டது', privacyText: 'உங்கள் பதில்கள் உங்கள் உள்ளூர் பதிவில் சேமிக்கப்பட்டு, பரிசீலனைக்காக உங்கள் சுருக்கத்தில் காட்டப்படும்.', saveLater: 'முடித்து பின்னர் சேமிக்கவும்', voiceIntake: 'குரல் உதவி பதிவு', stepOfFour: 'படி 2 / 4', letsBegin: 'தொடங்கலாம்', pageTitle: 'இன்று உங்களை<br/>தொந்தரவு செய்வது என்ன?', aboutThreeMinutes: 'சுமார் 3 நிமிடங்கள்', orType: 'அல்லது உங்கள் பதிலை எழுதுங்கள்', micPrivacy: 'நீங்கள் பேசும் போது மட்டுமே உங்கள் மைக்ரோஃபோன் பயன்படுத்தப்படும்.', yourResponses: 'உங்கள் பதில்கள்', intakeSummary: 'பதிவு சுருக்கம்', wereListening: 'நாங்கள் கேட்கிறோம்', emptySummary: 'நீங்கள் பதிலளிக்கும்போது அவை இங்கே தோன்றும்; பகிர்வதற்கு முன் மதிப்பாய்வு செய்யலாம்.', tapToSpeak: 'மைக்ரோஃபோனை அழுத்தி இயல்பாகப் பேசுங்கள்', recording: 'உங்கள் பதில் பதிவாகிறது… நிறுத்த மீண்டும் அழுத்தவும்', transcribing: 'உங்கள் பதில் உரையாக மாற்றப்படுகிறது…', fallbackNarration: 'ElevenLabs இன்னும் அமைக்கப்படவில்லை. .env இல் API key சேர்க்கவும்; கேள்வி திரையில் உள்ளது.', voiceError: 'இந்த ஒலியை எங்களால் புரிந்துகொள்ள முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது பதிலை எழுதவும்.', ready: 'உங்கள் பதில்கள் மதிப்பாய்வுக்கு தயாராக உள்ளன', completeReply: 'நன்றி. உங்கள் பதில்களை பதிவு செய்துள்ளேன். வலதுபுறத்தில் உள்ள பகுதியில் அவற்றை மதிப்பாய்வு செய்யவும்.', greeting: 'வணக்கம் ரமேஷ். நீங்கள் எப்படி உணர்கிறீர்கள் என்பதை உங்கள் சிகிச்சைக் குழு புரிந்துகொள்ள நான் உதவுவேன்.', chooseOne: 'குறைந்தது ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்.', sendSelection: 'தேர்வை அனுப்பு', typePlaceholder: 'உங்கள் பதிலை இங்கே எழுதுங்கள்...' },
  mr: { newConsultation: 'नवीन सल्लामसलत', todaysIntake: 'आजचे इंटेक', welcome: 'स्वागत', completed: 'पूर्ण झाले', currentConcern: 'सध्याची समस्या', inProgress: 'सुरू आहे', healthHistory: 'आरोग्य इतिहास', upNext: 'पुढे', review: 'पुनरावलोकन', privateByDesign: 'गोपनीयतेने डिझाइन केलेले', privacyText: 'तुमची उत्तरे तुमच्या स्थानीय इंटेक सत्रात जतन केली जातात आणि पुनरावलोकनासाठी तुमच्या सारांशात दिसतात.', saveLater: 'थांबा आणि नंतर जतन करा', voiceIntake: 'व्हॉइस-सहाय्यित इंटेक', stepOfFour: 'चरण 2 / 4', letsBegin: 'सुरू करूया', pageTitle: 'आज तुम्हाला काय<br/>त्रास देते आहे?', aboutThreeMinutes: 'सुमारे 3 मिनिटे', orType: 'किंवा तुमचे उत्तर लिहा', micPrivacy: 'तुमचा माइक्रोफोन फक्त तुम्ही बोलत असतानाच वापरला जातो.', yourResponses: 'तुमची उत्तरे', intakeSummary: 'इंटेक सारांश', wereListening: 'आम्ही ऐकत आहोत', emptySummary: 'तुमची उत्तरे येथे दिसतील, जेणेकरून शेअर करण्यापूर्वी तुम्ही त्यांचे पुनरावलोकन करू शकता.', tapToSpeak: 'माइक्रोफोन दाबा आणि नैसर्गिकपणे बोला', recording: 'तुमचे उत्तर रेकॉर्ड होत आहे… थांबवण्यासाठी पुन्हा दाबा', transcribing: 'तुमचे उत्तर लिखित केले जात आहे…', fallbackNarration: 'ElevenLabs अद्याप सेट केलेले नाही. .env मध्ये API key जोडा; प्रश्न स्क्रीनवर आहे.', voiceError: 'आम्हाला हा ऑडिओ समजला नाही. कृपया पुन्हा प्रयत्न करा किंवा उत्तर लिहा.', ready: 'तुमची उत्तरे पुनरावलोकनासाठी तयार आहेत', completeReply: 'धन्यवाद. मी तुमची उत्तरे नोंदवली आहेत. कृपया उजवीकडील पॅनेलमध्ये त्यांचे पुनरावलोकन करा.', greeting: 'नमस्कार रमेश. तुम्हाला कसे वाटत आहे हे तुमच्या काळजी संघाला समजण्यास मी मदत करीन.', chooseOne: 'कृपया किमान एक पर्याय निवडा.', sendSelection: 'निवड पाठवा', typePlaceholder: 'तुमचे उत्तर येथे लिहा...' },
};

let locale = localStorage.getItem('meditrace.locale') || 'en';
let session = null;
let currentQuestion = null;
let lastQuestionEl = null;
let submitting = false;
let transcribing = false;
// Voice is opt-in for each page visit, including restored intakes.
let voiceEnabled = false;
let intakeStep = 2;
function renderSteps(step = intakeStep) {
  intakeStep = step;
  document.querySelectorAll('.steps .step').forEach((element, index) => {
    const number = index + 1;
    element.className = `step${number < step ? ' complete' : number === step ? ' current' : ''}`;
    if (number === step) element.setAttribute('aria-current', 'step');
    else element.removeAttribute('aria-current');
    element.querySelector('span').innerHTML = number < step ? icon('check') : String(number);
    element.querySelector('small').textContent = number < step ? strings().completed : number === step ? strings().inProgress : strings().upNext;
  });
  $('[data-i18n="stepOfFour"]').textContent = strings().stepOfFour.replace('2', String(step));
  if (window.lucide) lucide.createIcons();
}
const savedIntakeKey = () => `meditrace.intake.${currentUser.id}`;
function rememberIntake() {
  if (session && currentUser) localStorage.setItem(savedIntakeKey(), JSON.stringify({ id: session.id, draft: textInput.value }));
}
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let activeAudio;
let currentUser = null;
let started = false;
let sttMode = 'server';
let activeRecognition = null;
let browserVoiceNoticeShown = false;

const localeNames = { en: 'English', hi: 'हिन्दी', mr: 'मराठी', ta: 'தமிழ்' };
const $ = (selector) => document.querySelector(selector);
const thread = $('#thread');
const voiceDock = $('#voiceDock');
const micButton = $('#micButton');
const voiceStatus = $('#voiceStatus');
const textInput = $('#textInput');
const textForm = $('#textForm');
const quickReplies = $('#quickReplies');
const escalationBanner = $('#escalationBanner');
const toast = $('#toast');
const langToLocale = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN' };
const icon = (name) => `<i data-lucide="${name}"></i>`;
const strings = () => ui[locale] || ui.en;

function authToken() { return sessionStorage.getItem('meditrace.token') || localStorage.getItem('meditrace.token') || ''; }
async function api(url, options = {}) { const headers = new Headers(options.headers || {}); const token = authToken(); if (token) headers.set('Authorization', `Bearer ${token}`); const response = await fetch(url, { ...options, headers }); if (!response.ok) { const payload = await response.json().catch(() => ({})); const error = new Error(payload.error || 'Request failed.'); error.status = response.status; throw error; } return response; }
const nameTokens = ['Ramesh', 'रमेश', 'ரமேஷ்'];
function firstName() { return ((currentUser && currentUser.name) || 'Ramesh Patel').trim().split(/\s+/)[0]; }
function patientInitials() { const parts = ((currentUser && currentUser.name) || 'Ramesh Patel').trim().split(/\s+/); return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'MT'; }
function withName(text) { return nameTokens.reduce((value, token) => value.split(token).join(firstName()), text); }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4200); }
function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

function renderSummaryItems(items) {
  const list = Array.isArray(items) ? items : [];
  const empty = $('#emptySummary');
  if (empty) empty.style.display = list.length ? 'none' : 'flex';
  $('#summaryItems').innerHTML = list.map((item, index) => `<article class="summary-item"><span>${index + 1}</span><div><small>${escapeHtml(item.label)}</small><p>${escapeHtml(item.answer)}</p></div></article>`).join('');
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((element) => { element.innerHTML = strings()[element.dataset.i18n]; });
  textInput.placeholder = strings().typePlaceholder;
  if (!isRecording) voiceStatus.textContent = strings().tapToSpeak;
  renderSteps();
}

function addPatientMessage(answer) {
  const message = document.createElement('article');
  message.className = 'message patient-message';
  message.innerHTML = `<div class="message-body"><div class="message-meta">You <span>•</span> just now</div><p></p></div><div class="patient-avatar">${escapeHtml(patientInitials())}</div>`;
  message.querySelector('p').textContent = answer;
  thread.append(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return message;
}

function addAssistantMessage(rawText, { narrate = true } = {}) {
  const text = withName(rawText);
  const message = document.createElement('article');
  message.className = 'message assistant-message next-message';
  message.innerHTML = `<div class="assistant-avatar">${icon('sparkles')}</div><div class="message-body"><div class="message-meta">MediTrace <span>•</span> just now</div><p></p><button class="listen-button speak-trigger">${icon('volume-2')} Listen again</button></div>`;
  message.querySelector('p').textContent = text;
  message.querySelector('.speak-trigger').dataset.text = text;
  thread.append(message);
  lucide.createIcons();
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (narrate && voiceEnabled && rawText && /[?.]$/.test(String(rawText).trim())) playNarration(text);
  return message;
}

function speakWithBrowser(text) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langToLocale[locale] || 'en-IN';
    utterance.rate = 0.98;
    const voices = synth.getVoices();
    const exact = voices.find((voice) => voice.lang === utterance.lang);
    const partial = voices.find((voice) => voice.lang && voice.lang.split('-')[0] === locale);
    if (exact || partial) utterance.voice = exact || partial;
    synth.cancel();
    synth.speak(utterance);
    return true;
  } catch { return false; }
}

async function playNarration(rawText) {
  const text = withName(rawText);
  try {
    if (activeAudio) { activeAudio.pause(); URL.revokeObjectURL(activeAudio.src); }
    const response = await api('/api/narration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: locale }) });
    activeAudio = new Audio(URL.createObjectURL(await response.blob()));
    await activeAudio.play();
    return;
  } catch (error) {
    if (speakWithBrowser(text)) {
      if (!browserVoiceNoticeShown) { browserVoiceNoticeShown = true; showToast('Spoken prompts are using your device voice. Add an ElevenLabs key for studio-quality audio.'); }
      return;
    }
    showToast(error.message.includes('not configured') ? strings().fallbackNarration : 'Narration is unavailable right now.');
  }
}

function chip(label, value, extraClass = '') {
  return `<button type="button" class="quick-chip ${extraClass}" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderChips(question) {
  if (!quickReplies) return;
  const kind = question && question.kind;
  const options = question && question.options;
  if ((kind === 'boolean' || kind === 'single') && Array.isArray(options)) {
    quickReplies.hidden = false;
    quickReplies.innerHTML = options.map((option) => chip(option.label, option.label)).join('');
  } else if (kind === 'multi' && Array.isArray(options)) {
    quickReplies.hidden = false;
    quickReplies.innerHTML = options.map((option) => chip(option.label, option.value, 'multi')).join('') + `<button type="button" class="quick-chip quick-chip-send" data-send="1">${escapeHtml(strings().sendSelection)}</button>`;
  } else if (kind === 'number') {
    quickReplies.hidden = false;
    quickReplies.innerHTML = Array.from({ length: 10 }, (_, index) => chip(String(index + 1), String(index + 1), 'chip-number')).join('');
  } else {
    quickReplies.hidden = true;
    quickReplies.innerHTML = '';
  }
  lucide.createIcons();
}

function renderQuestion(question, { append = true } = {}) {
  if (!question) return;
  currentQuestion = question;
  textInput.disabled = false;
  micButton.disabled = false;
  if (append) {
    lastQuestionEl = addAssistantMessage(question.text);
  } else if (lastQuestionEl) {
    lastQuestionEl.querySelector('p').textContent = withName(question.text);
    const trigger = lastQuestionEl.querySelector('.speak-trigger');
    if (trigger) trigger.dataset.text = withName(question.text);
    if (voiceEnabled) playNarration(question.text);
  }
  renderChips(question);
  textInput.focus();
}

function renderTriage(payload) {
  $('#intakeReview').hidden = true;
  thread.hidden = false;
  voiceDock.hidden = false;
  renderSteps(payload.escalated ? intakeStep : payload.step || (payload.complete ? 4 : payload.question?.phase === 'history' ? 3 : 2));
  renderSummaryItems(payload.answered);
  const answeredCount = (payload.answered || []).length;
  const remaining = typeof payload.remaining === 'number' ? payload.remaining : 0;
  const total = answeredCount + remaining;
  const counter = $('#responseCount');
  if (counter) counter.textContent = total > answeredCount ? `${answeredCount} of ~${total}` : `${answeredCount} answered`;
  const bar = $('#progressBar');
  if (bar) bar.style.width = `${total ? Math.min(96, (answeredCount / total) * 100) : 4}%`;

  if (payload.escalated) { showEscalation(payload); return; }
  if (escalationBanner) escalationBanner.hidden = true;
  if (payload.complete) { finishIntake(payload.answered || []); return; }
  voiceDock.classList.remove('complete');
  renderQuestion(payload.question);
}

function showEscalation(payload) {
  const info = payload.escalation || {};
  const headline = info.headline || 'This may need urgent attention';
  $('#escalationHeadline').textContent = headline;
  $('#escalationBody').textContent = info.body || '';
  $('#escalationAdvice').textContent = info.advice || '';
  $('#escalationDisclaimer').textContent = info.disclaimer || 'This is not a diagnosis. It is a safety check based on what you reported.';
  if (escalationBanner) escalationBanner.hidden = false;
  if (window.lucide) lucide.createIcons();
  voiceDock.classList.add('complete');
  micButton.disabled = true;
  textInput.disabled = true;
  if (quickReplies) { quickReplies.hidden = true; quickReplies.innerHTML = ''; }
  voiceStatus.textContent = 'Please seek urgent care as advised above.';
  const reasons = (info.reasons || []).join('; ');
  addAssistantMessage([headline + '.', reasons ? `Reported: ${reasons}.` : '', info.advice || ''].filter(Boolean).join(' '));
  const progressBar = $('#progressBar');
  if (progressBar) progressBar.style.width = '100%';
  escalationBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function finishIntake(answers = []) {
  currentQuestion = null;
  textInput.value = '';
  rememberIntake();
  voiceDock.classList.add('complete');
  voiceStatus.textContent = strings().ready;
  micButton.disabled = true;
  textInput.disabled = true;
  if (quickReplies) { quickReplies.hidden = true; quickReplies.innerHTML = ''; }
  if (escalationBanner) escalationBanner.hidden = true;
  $('#intakeReview').hidden = false;
  $('#reviewAnswers').innerHTML = answers.map((answer, index) => `<article class="summary-item"><span>${index + 1}</span><div><small>${escapeHtml(answer.label)}</small><p>${escapeHtml(answer.answer)}</p></div></article>`).join('');
  thread.hidden = true;
  voiceDock.hidden = true;
  $('.intro-row').hidden = true;
  $('#progressBar').style.width = '100%';
  $('#intakeReview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function sendAnswer(raw) {
  const answer = String(raw == null ? '' : raw).trim();
  if (!answer || !session || !currentQuestion || submitting) return;
  const question = currentQuestion;
  submitting = true;
  textInput.disabled = true;
  micButton.disabled = true;
  if (quickReplies) { quickReplies.hidden = true; quickReplies.innerHTML = ''; }
  addPatientMessage(answer);
  textInput.value = '';
  try {
    const response = await api(`/api/sessions/${session.id}/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: question.id, answer }) });
    const payload = await response.json();
    rememberIntake();
    renderTriage(payload);
  } catch (error) {
    showToast(error.message);
    textInput.value = answer;
    rememberIntake();
    textInput.disabled = false;
    micButton.disabled = false;
    renderChips(question);
  } finally {
    submitting = false;
  }
}

function setRecording(value) {
  isRecording = value;
  voiceDock.classList.toggle('is-listening', value);
  micButton.classList.toggle('recording', value);
  micButton.innerHTML = icon(value ? 'square' : 'mic');
  voiceStatus.textContent = value ? strings().recording : strings().tapToSpeak;
  lucide.createIcons();
}

async function transcribeAudio() {
  transcribing = true;
  voiceStatus.textContent = strings().transcribing;
  const audio = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  if (audio.size < 1000) { transcribing = false; showToast(strings().voiceError); voiceStatus.textContent = strings().tapToSpeak; return; }
  const form = new FormData();
  form.append('audio', audio, 'response.webm');
  form.append('locale', langToLocale[locale] || 'en-IN');
  try {
    const response = await api('/api/transcribe', { method: 'POST', body: form });
    const transcript = await response.json();
    if (!transcript.text.trim()) throw new Error(strings().voiceError);
    await sendAnswer(transcript.text);
  } catch (error) {
    if (error.status === 503 || error.status === 501) { sttMode = 'browser'; showToast('Server transcription is unavailable. Switching to your device voice input — tap the microphone again to speak.'); }
    else { showToast(error.message === 'Request failed.' ? strings().voiceError : error.message); }
  } finally {
    transcribing = false;
    if (!isRecording && escalationBanner && escalationBanner.hidden) voiceStatus.textContent = strings().tapToSpeak;
  }
}

function startBrowserRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { showToast('Voice input is not supported in this browser. Please type your response.'); return; }
  try { activeRecognition = new Recognition(); } catch { showToast('Voice input is not supported in this browser.'); return; }
  activeRecognition.lang = langToLocale[locale] || 'en-IN';
  activeRecognition.interimResults = false;
  activeRecognition.maxAlternatives = 1;
  activeRecognition.onstart = () => setRecording(true);
  activeRecognition.onerror = (event) => {
    setRecording(false);
    activeRecognition = null;
    const messages = {
      'not-allowed': 'Microphone or speech recognition permission was denied. Allow microphone access in your browser settings, then try again.',
      'service-not-allowed': 'This browser does not allow its speech recognition service. Open this app in Chrome or Edge, or configure server transcription.',
      'network': 'The browser speech recognition service could not connect. Try Chrome or Edge with an internet connection, or configure server transcription.',
      'audio-capture': 'No working microphone was found. Check your microphone and Windows input settings.',
      'no-speech': 'No speech was detected. Tap the microphone and start speaking after it shows Recording.',
      'language-not-supported': 'This browser does not support speech recognition for the selected language. Try another language or use text input.',
    };
    if (event.error !== 'aborted') showToast(messages[event.error] || `Browser speech recognition stopped (${event.error || 'unknown error'}). Try Chrome or Edge, or type your response.`);
  };
  activeRecognition.onend = () => { setRecording(false); activeRecognition = null; };
  activeRecognition.onresult = (event) => { const text = ((event.results[0] && event.results[0][0] && event.results[0][0].transcript) || '').trim(); if (text) sendAnswer(text); else showToast(strings().voiceError); };
  try { activeRecognition.start(); } catch { showToast('Voice input is not supported in this browser.'); activeRecognition = null; }
}

async function toggleRecording() {
  if (submitting || transcribing) return;
  if (textInput.disabled && !isRecording) return;
  voiceEnabled = true;
  if (activeAudio) activeAudio.pause();
  window.speechSynthesis?.cancel();
  if (sttMode === 'browser') { if (activeRecognition && isRecording) { activeRecognition.stop(); return; } startBrowserRecognition(); return; }
  if (isRecording && mediaRecorder) { mediaRecorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { sttMode = 'browser'; startBrowserRecognition(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined);
    mediaRecorder.ondataavailable = (event) => { if (event.data.size) audioChunks.push(event.data); };
    mediaRecorder.onstop = async () => { stream.getTracks().forEach((track) => track.stop()); setRecording(false); await transcribeAudio(); };
    mediaRecorder.start();
    setRecording(true);
  } catch { showToast('Microphone access is needed for voice input. You can type your response instead.'); }
}

async function detectCapabilities() {
  if ('speechSynthesis' in window) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
  try {
    const response = await fetch('/api/health');
    const payload = await response.json().catch(() => ({}));
    if (payload.geminiConfigured === false) sttMode = 'browser';
  } catch { sttMode = 'browser'; }
}

async function loadTriage({ append = true } = {}) {
  if (!session) return;
  const response = await api(`/api/sessions/${session.id}/triage`);
  const payload = await response.json();
  if (!append && payload.question && !payload.complete && !payload.escalated && lastQuestionEl) {
    currentQuestion = payload.question;
    renderQuestion(payload.question, { append: false });
  } else {
    renderTriage(payload);
  }
}

async function initialise() {
  applyTranslations();
  detectCapabilities();
  try {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(savedIntakeKey()) || 'null'); } catch { localStorage.removeItem(savedIntakeKey()); }
    if (saved?.id) {
      try {
        const response = await api(`/api/sessions/${encodeURIComponent(saved.id)}`);
        session = await response.json();
        locale = session.locale.split('-')[0];
        $('#languageName').textContent = localeNames[locale] || localeNames.en;
        applyTranslations();
        for (const answer of session.transcript || session.triage?.answers || session.responses || []) {
          addAssistantMessage(answer.questionText || answer.label || answer.questionId, { narrate: false });
          addPatientMessage(answer.answer);
        }
        await loadTriage();
        if (!textInput.disabled) textInput.value = saved.draft || '';
        showToast('Your saved intake has been restored.');
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
        localStorage.removeItem(savedIntakeKey());
      }
    }
    const created = await api('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: (currentUser && currentUser.name) || 'Guest patient', locale: langToLocale[locale] }) });
    session = await created.json();
    rememberIntake();
    await loadTriage();
  } catch (error) {
    showToast(`Could not start intake: ${error.message}`);
  }
}

micButton.addEventListener('click', toggleRecording);
$('#viewConversation').addEventListener('click', () => {
  thread.hidden = !thread.hidden;
  $('#viewConversation').textContent = thread.hidden ? 'View conversation' : 'Hide conversation';
});
$('#startNewIntake').addEventListener('click', async () => {
  const button = $('#startNewIntake');
  if (button.disabled || submitting || isRecording || transcribing) return;
  rememberIntake();
  button.disabled = true;
  submitting = true;
  try {
    const response = await api('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: currentUser.name, locale: langToLocale[locale] || 'en-IN' }) });
    session = await response.json();
    voiceEnabled = false;
    if (activeAudio) activeAudio.pause();
    window.speechSynthesis?.cancel();
    thread.innerHTML = '';
    lastQuestionEl = null;
    textInput.value = '';
    rememberIntake();
    $('#viewConversation').textContent = 'View conversation';
    $('.intro-row').hidden = false;
    renderSteps(2);
    await loadTriage();
  } catch (error) { showToast(`Could not start a new intake: ${error.message}`); }
  finally { button.disabled = false; submitting = false; }
});
textInput.addEventListener('input', rememberIntake);
document.querySelector('.end-button').addEventListener('click', async () => {
  if (submitting || isRecording || transcribing) { showToast('Please finish your current response before saving.'); return; }
  if (!session) { showToast('Your intake has not loaded. Please refresh and try again.'); return; }
  try {
    rememberIntake();
    await api(`/api/sessions/${encodeURIComponent(session.id)}`);
    if (activeAudio) activeAudio.pause();
    window.speechSynthesis?.cancel();
    $('#signOutButton').click();
  } catch (error) { showToast(`Could not save and exit: ${error.message}`); }
});
textForm.addEventListener('submit', (event) => { event.preventDefault(); sendAnswer(textInput.value); });
document.addEventListener('click', (event) => { const trigger = event.target.closest('.speak-trigger'); if (trigger) playNarration(trigger.dataset.text); });
quickReplies.addEventListener('click', (event) => {
  const send = event.target.closest('[data-send]');
  if (send) {
    const selected = [...quickReplies.querySelectorAll('.quick-chip.multi.selected')].map((button) => button.dataset.value);
    if (!selected.length) { showToast(strings().chooseOne); return; }
    sendAnswer(selected.join(', '));
    return;
  }
  const chipButton = event.target.closest('.quick-chip');
  if (!chipButton) return;
  if (chipButton.classList.contains('multi')) { chipButton.classList.toggle('selected'); return; }
  sendAnswer(chipButton.dataset.value);
});
$('#languageButton').addEventListener('click', () => $('#languageMenu').classList.toggle('open'));
document.querySelectorAll('#languageMenu button').forEach((button) => button.addEventListener('click', async () => {
  locale = button.dataset.lang.split('-')[0];
  localStorage.setItem('meditrace.locale', locale);
  $('#languageName').textContent = button.dataset.name;
  $('#languageMenu').classList.remove('open');
  applyTranslations();
  const firstPrompt = $('#firstPrompt');
  if (firstPrompt) { firstPrompt.textContent = withName(strings().greeting); const trigger = firstPrompt.closest('.message-body')?.querySelector('.speak-trigger'); if (trigger) trigger.dataset.text = withName(strings().greeting); }
  if (session && !submitting) { try { await loadTriage({ append: false }); } catch { /* ignore */ } }
}));

export function startIntake(user) {
  if (started) return; started = true;
  if (user) currentUser = user;
  const preferred = localStorage.getItem('meditrace.locale');
  if (preferred && ui[preferred]) locale = preferred;
  const languageName = $('#languageName');
  if (languageName && localeNames[locale]) languageName.textContent = localeNames[locale];
  const card = document.querySelector('.patient-card');
  if (card) { const badge = card.querySelector('.avatar'); if (badge) badge.textContent = patientInitials(); const label = card.querySelector('strong'); if (label) label.textContent = (currentUser && currentUser.name) || 'Guest patient'; }
  const firstPrompt = $('#firstPrompt');
  if (firstPrompt) { const text = withName(strings().greeting); firstPrompt.textContent = text; const trigger = firstPrompt.closest('.message-body')?.querySelector('.speak-trigger'); if (trigger) trigger.dataset.text = text; }
  lucide.createIcons();
  console.info('MediTrace intake: adaptive server-driven flow with voice narration and browser fallbacks.');
  initialise();
}
