import './style.css';
import { startIntake, saveBeforeSignOut } from './main.js';
import { startDoctorApp } from './doctor.js';
import { startPreferences } from './preferences.js';

const TOKEN_KEY = 'meditrace.token';
const LOCALE_KEY = 'meditrace.locale';
const localeNames = { en: 'English', hi: 'हिन्दी', mr: 'मराठी', ta: 'தமிழ்' };

const loginStrings = {
  en: {
    vEyebrow: 'Patient pre-visit intake', vTitle: 'Your voice,<br/>your health story.',
    vLede: 'Sign in to begin a voice-guided pre-visit intake. Answer naturally by speaking or typing, and review every response before you finish.',
    vPoint1: 'Voice-guided questions in English, Hindi, Marathi and Tamil', vPoint2: 'Review and edit every answer before you finish', vPoint3: 'Your microphone is only used while you are speaking', vFoot: 'Responses are saved to your local intake session',
    fEyebrow: 'Sign in', fTitle: 'Welcome back', fSub: 'Enter your details to continue to your intake.',
    continueGoogle: 'Continue with Google', googleUnavailable: "Google sign-in isn't configured on this deployment.", orDivider: 'OR',
    emailLabel: 'Email address', emailPlaceholder: 'you@example.com', passwordLabel: 'Password', passwordPlaceholder: 'Enter your password',
    remember: 'Remember me', forgot: 'Forgot password?', submit: 'Sign in', signingIn: 'Signing in…',
    demoTitle: 'Demo access', demoHint: 'Use these details to explore the prototype.', fillDemo: 'Fill demo credentials', filled: 'Filled', copyEmail: 'Copy email', copyPassword: 'Copy password',
    missingFields: 'Please enter your email and password.', invalidEmail: 'Enter a valid email address.', invalidLogin: 'The email or password you entered is incorrect.', googleError: 'Google sign-in was cancelled or could not be completed. Please try again.', genericError: 'We could not sign you in. Please try again.',
  },
  hi: {
    vEyebrow: 'रोगी प्री-विज़िट इंटेक', vTitle: 'आपकी आवाज़,<br/>आपकी स्वास्थ्य कहानी।',
    vLede: 'वॉइस-निर्देशित प्री-विज़िट इंटेक शुरू करने के लिए साइन इन करें। बोलकर या लिखकर सहज उत्तर दें, और पूरा करने से पहले हर उत्तर की समीक्षा करें।',
    vPoint1: 'अंग्रेज़ी, हिन्दी, मराठी और तमिल में वॉइस-निर्देशित प्रश्न', vPoint2: 'पूरा करने से पहले हर उत्तर की समीक्षा और संपादन करें', vPoint3: 'आपका माइक्रोफ़ोन केवल बोलते समय उपयोग होता है', vFoot: 'आपके उत्तर आपके स्थानीय इंटेक सत्र में सहेजे जाते हैं',
    fEyebrow: 'साइन इन', fTitle: 'फिर से स्वागत है', fSub: 'अपना इंटेक जारी रखने के लिए अपनी जानकारी दर्ज करें।',
    continueGoogle: 'Google से जारी रखें', googleUnavailable: 'इस डिप्लॉयमेंट पर Google साइन-इन कॉन्फ़िगर नहीं है।', orDivider: 'या',
    emailLabel: 'ईमेल पता', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: 'अपना पासवर्ड दर्ज करें',
    remember: 'मुझे याद रखें', forgot: 'पासवर्ड भूल गए?', submit: 'साइन इन', signingIn: 'साइन इन हो रहा है…',
    demoTitle: 'डेमो एक्सेस', demoHint: 'प्रोटोटाइप को देखने के लिए इन विवरणों का उपयोग करें।', fillDemo: 'डेमो विवरण भरें', filled: 'भर दिया', copyEmail: 'ईमेल कॉपी करें', copyPassword: 'पासवर्ड कॉपी करें',
    missingFields: 'कृपया अपना ईमेल और पासवर्ड दर्ज करें।', invalidEmail: 'मान्य ईमेल पता दर्ज करें।', invalidLogin: 'आपका ईमेल या पासवर्ड गलत है।', googleError: 'Google साइन-इन रद्द हुआ या पूरा नहीं हो सका। कृपया फिर से प्रयास करें।', genericError: 'हम आपको साइन इन नहीं कर सके। कृपया फिर से प्रयास करें।',
  },
  mr: {
    vEyebrow: 'रुग्ण प्री-व्हिजिट इंटेक', vTitle: 'तुमचा आवाज,<br/>तुमची आरोग्य कहाणी.',
    vLede: 'व्हॉइस-मार्गदर्शित प्री-व्हिजिट इंटेक सुरू करण्यासाठी साइन इन करा. बोलून किंवा लिहून सहज उत्तर द्या आणि पूर्ण करण्यापूर्वी प्रत्येक उत्तराचे पुनरावलोकन करा.',
    vPoint1: 'इंग्रजी, हिंदी, मराठी आणि तमिळमध्ये व्हॉइस-मार्गदर्शित प्रश्न', vPoint2: 'पूर्ण करण्यापूर्वी प्रत्येक उत्तराचे पुनरावलोकन आणि संपादन करा', vPoint3: 'तुमचा माइक्रोफोन फक्त बोलत असतानाच वापरला जातो', vFoot: 'तुमची उत्तरे तुमच्या स्थानिक इंटेक सत्रात जतन केली जातात',
    fEyebrow: 'साइन इन', fTitle: 'पुन्हा स्वागत', fSub: 'तुमचे इंटेक सुरू ठेवण्यासाठी तुमची माहिती भरा.',
    continueGoogle: 'Google सह सुरू ठेवा', googleUnavailable: 'या डिप्लॉयमेंटवर Google साइन-इन कॉन्फिगर केलेले नाही.', orDivider: 'किंवा',
    emailLabel: 'ईमेल पत्ता', emailPlaceholder: 'you@example.com', passwordLabel: 'पासवर्ड', passwordPlaceholder: 'तुमचा पासवर्ड टाका',
    remember: 'मला लक्षात ठेवा', forgot: 'पासवर्ड विसरला?', submit: 'साइन इन', signingIn: 'साइन इन होत आहे…',
    demoTitle: 'डेमो प्रवेश', demoHint: 'प्रोटोटाइप पाहण्यासाठी ही माहिती वापरा.', fillDemo: 'डेमो माहिती भरा', filled: 'भरले', copyEmail: 'ईमेल कॉपी करा', copyPassword: 'पासवर्ड कॉपी करा',
    missingFields: 'कृपया तुमचा ईमेल आणि पासवर्ड टाका.', invalidEmail: 'वैध ईमेल पत्ता टाका.', invalidLogin: 'तुमचा ईमेल किंवा पासवर्ड चुकीचा आहे.', googleError: 'Google साइन-इन रद्द झाले किंवा पूर्ण होऊ शकले नाही. कृपया पुन्हा प्रयत्न करा.', genericError: 'आम्ही तुम्हाला साइन इन करू शकलो नाही. कृपया पुन्हा प्रयत्न करा.',
  },
  ta: {
    vEyebrow: 'நோயாளி முன்-வருகை பதிவு', vTitle: 'உங்கள் குரல்,<br/>உங்கள் உடல்நலக் கதை.',
    vLede: 'குரல்-வழிகாட்டும் முன்-வருகை பதிவைத் தொடங்க உள்நுழையவும். பேசி அல்லது தட்டச்சு செய்து இயல்பாகப் பதிலளியுங்கள்; முடிப்பதற்கு முன் ஒவ்வொரு பதிலையும் பரிசீலியுங்கள்.',
    vPoint1: 'ஆங்கிலம், இந்தி, மராத்தி மற்றும் தமிழில் குரல்-வழிகாட்டும் கேள்விகள்', vPoint2: 'முடிப்பதற்கு முன் ஒவ்வொரு பதிலையும் பரிசீலித்துத் திருத்துங்கள்', vPoint3: 'நீங்கள் பேசும் போது மட்டுமே மைக்ரோஃபோன் பயன்படுத்தப்படும்', vFoot: 'உங்கள் பதில்கள் உங்கள் உள்ளூர் பதிவில் சேமிக்கப்படும்',
    fEyebrow: 'உள்நுழை', fTitle: 'மீண்டும் வரவேற்கிறோம்', fSub: 'உங்கள் பதிவைத் தொடர உங்கள் விவரங்களை உள்ளிடவும்.',
    continueGoogle: 'Google மூலம் தொடரவும்', googleUnavailable: 'இந்த அமைப்பில் Google உள்நுழைவு அமைக்கப்படவில்லை.', orDivider: 'அல்லது',
    emailLabel: 'மின்னஞ்சல் முகவரி', emailPlaceholder: 'you@example.com', passwordLabel: 'கடவுச்சொல்', passwordPlaceholder: 'உங்கள் கடவுச்சொல்லை உள்ளிடவும்',
    remember: 'என்னை நினைவில் வையுங்கள்', forgot: 'கடவுச்சொல் மறந்ததா?', submit: 'உள்நுழை', signingIn: 'உள்நுழைகிறது…',
    demoTitle: 'டெமோ அணுகல்', demoHint: 'மாதிரியைப் பார்க்க இந்த விவரங்களைப் பயன்படுத்தவும்.', fillDemo: 'டெமோ விவரங்களை நிரப்பு', filled: 'நிரப்பப்பட்டது', copyEmail: 'மின்னஞ்சலை நகலெடு', copyPassword: 'கடவுச்சொல்லை நகலெடு',
    missingFields: 'உங்கள் மின்னஞ்சல் மற்றும் கடவுச்சொல்லை உள்ளிடவும்.', invalidEmail: 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.', invalidLogin: 'நீங்கள் உள்ளிட்ட மின்னஞ்சல் அல்லது கடவுச்சொல் தவறானது.', googleError: 'Google உள்நுழைவு ரத்தானது அல்லது நிறைவடையவில்லை. மீண்டும் முயற்சிக்கவும்.', genericError: 'உங்களை உள்நுழைய வைக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  },
};

let loginLocale = localStorage.getItem(LOCALE_KEY);
if (!loginStrings[loginLocale]) loginLocale = 'en';

const $ = (selector) => document.querySelector(selector);
const form = $('#loginForm');
const emailInput = $('#loginEmail');
const passwordInput = $('#loginPassword');
const emailField = $('#emailField');
const passwordField = $('#passwordField');
const rememberInput = $('#rememberMe');
const submitButton = $('#loginSubmit');
const errorBox = $('#loginError');
const signOutButton = $('#signOutButton');
const languageButton = $('#loginLanguageButton');
const languageMenu = $('#loginLanguageMenu');
const languageName = $('#loginLanguageName');
const passwordToggle = $('#togglePassword');
const googleButton = $('#googleButton');
const googleNote = $('#googleNote');
const fillDemoButton = $('#fillDemo');
const copyButtons = document.querySelectorAll('.demo-copy');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let googleEnabled = false;

function storedToken() { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; }
function saveToken(token, remember) { clearToken(); (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }

function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }
function markInvalid(field) { field.classList.add('invalid'); }
function clearInvalid(field) { field.classList.remove('invalid'); }

function renderSubmit(busy) {
  const strings = loginStrings[loginLocale];
  submitButton.disabled = busy;
  submitButton.classList.toggle('busy', busy);
  submitButton.innerHTML = busy ? `<i data-lucide="loader-2"></i><span>${strings.signingIn}</span>` : `<span>${strings.submit}</span><i data-lucide="arrow-right"></i>`;
  if (window.lucide) window.lucide.createIcons();
}

function renderFill(state) {
  const strings = loginStrings[loginLocale];
  fillDemoButton.classList.toggle('done', state === 'done');
  fillDemoButton.innerHTML = state === 'done' ? `<i data-lucide="check"></i><span>${strings.filled}</span>` : `<i data-lucide="wand-2"></i><span>${strings.fillDemo}</span>`;
  if (window.lucide) window.lucide.createIcons();
}

function applyLoginTranslations() {
  const strings = loginStrings[loginLocale];
  document.querySelectorAll('[data-login-i18n]').forEach((element) => { element.innerHTML = strings[element.dataset.loginI18n]; });
  emailInput.placeholder = strings.emailPlaceholder;
  passwordInput.placeholder = strings.passwordPlaceholder;
  languageName.textContent = localeNames[loginLocale];
  copyButtons.forEach((button) => button.setAttribute('aria-label', /Email/.test(button.dataset.copy) ? strings.copyEmail : strings.copyPassword));
  renderFill(fillDemoButton.classList.contains('done') ? 'done' : 'idle');
  if (!submitButton.disabled) renderSubmit(false);
}

function enterApp(user) {
  document.body.classList.add('authenticated');
  startPreferences(user);
  if (window.lucide) window.lucide.createIcons();
  if (user && user.role === 'Doctor') {
    startDoctorApp(user, { token: storedToken(), onSignOut: signOut });
    return;
  }
  startIntake(user);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}

async function login(event) {
  event.preventDefault();
  clearError();
  clearInvalid(emailField);
  clearInvalid(passwordField);
  const strings = loginStrings[loginLocale];
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email) { showError(strings.missingFields); markInvalid(emailField); emailInput.focus(); return; }
  if (!emailPattern.test(email)) { showError(strings.invalidEmail); markInvalid(emailField); emailInput.focus(); return; }
  if (!password) { showError(strings.missingFields); markInvalid(passwordField); passwordInput.focus(); return; }
  renderSubmit(true);
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { markInvalid(emailField); markInvalid(passwordField); throw new Error(strings.invalidLogin); }
    if (!response.ok) throw new Error(payload.error || strings.genericError);
    saveToken(payload.token, rememberInput.checked);
    enterApp(payload.user);
  } catch (error) {
    showError(error.message);
    renderSubmit(false);
    passwordInput.select();
  }
}

function consumeUrlAuth() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('auth_token');
  const error = url.searchParams.get('auth_error');
  if (!token && !error) return null;
  url.searchParams.delete('auth_token');
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  if (token) { localStorage.setItem(TOKEN_KEY, token); return { token }; }
  return { error };
}

async function restoreSession() {
  const consumed = consumeUrlAuth();
  if (consumed && consumed.error) showError(loginStrings[loginLocale].googleError);
  const token = storedToken();
  if (!token) return;
  try {
    const response = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { clearToken(); return; }
    const payload = await response.json();
    enterApp(payload.user);
  } catch { clearToken(); }
}

async function configureProviders() {
  try {
    const response = await fetch('/api/auth/providers');
    const payload = await response.json().catch(() => ({}));
    googleEnabled = Boolean(payload.google);
  } catch { googleEnabled = false; }
  googleButton.disabled = !googleEnabled;
  googleButton.setAttribute('aria-disabled', String(!googleEnabled));
  googleNote.hidden = googleEnabled;
}

async function signOut() {
  if (!await saveBeforeSignOut()) return;
  const token = storedToken();
  if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  clearToken();
  window.location.reload();
}

form.addEventListener('submit', login);
emailInput.addEventListener('input', () => { clearInvalid(emailField); clearError(); });
passwordInput.addEventListener('input', () => { clearInvalid(passwordField); clearError(); });
passwordToggle.addEventListener('click', () => {
  const reveal = passwordInput.type === 'password';
  passwordInput.type = reveal ? 'text' : 'password';
  passwordToggle.innerHTML = `<i data-lucide="${reveal ? 'eye-off' : 'eye'}"></i>`;
  passwordToggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  if (window.lucide) window.lucide.createIcons();
});
signOutButton.addEventListener('click', signOut);

googleButton.addEventListener('click', () => { if (googleEnabled) window.location.href = '/api/auth/google'; });

function fillFromButton(button, emailId, passwordId) {
  clearError();
  clearInvalid(emailField);
  clearInvalid(passwordField);
  emailInput.value = $(emailId).textContent.trim();
  passwordInput.value = $(passwordId).textContent.trim();
  const original = button.innerHTML;
  button.classList.add('done');
  button.innerHTML = `<i data-lucide="check"></i><span>${loginStrings[loginLocale].filled}</span>`;
  if (window.lucide) window.lucide.createIcons();
  clearTimeout(button._timer);
  button._timer = setTimeout(() => {
    button.classList.remove('done');
    button.innerHTML = original;
    if (window.lucide) window.lucide.createIcons();
  }, 2000);
  emailInput.focus();
}

fillDemoButton.addEventListener('click', () => fillFromButton(fillDemoButton, '#demoEmail', '#demoPassword'));
const fillDemoDoctorButton = $('#fillDemoDoctor');
if (fillDemoDoctorButton) fillDemoDoctorButton.addEventListener('click', () => fillFromButton(fillDemoDoctorButton, '#demoDoctorEmail', '#demoDoctorPassword'));

copyButtons.forEach((button) => button.addEventListener('click', async () => {
  const source = document.getElementById(button.dataset.copy);
  const ok = source && await copyText(source.textContent.trim());
  if (!ok) return;
  button.classList.add('copied');
  button.innerHTML = '<i data-lucide="check"></i>';
  if (window.lucide) window.lucide.createIcons();
  clearTimeout(button._timer);
  button._timer = setTimeout(() => {
    button.classList.remove('copied');
    button.innerHTML = '<i data-lucide="copy"></i>';
    if (window.lucide) window.lucide.createIcons();
  }, 1600);
}));

languageButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = languageMenu.classList.toggle('open');
  languageButton.setAttribute('aria-expanded', String(open));
});
languageMenu.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
  loginLocale = loginStrings[button.dataset.lang] ? button.dataset.lang : 'en';
  localStorage.setItem(LOCALE_KEY, loginLocale);
  languageMenu.classList.remove('open');
  languageButton.setAttribute('aria-expanded', 'false');
  applyLoginTranslations();
}));
document.addEventListener('click', (event) => {
  if (!event.target.closest('.login-lang')) { languageMenu.classList.remove('open'); languageButton.setAttribute('aria-expanded', 'false'); }
});

applyLoginTranslations();
if (window.lucide) window.lucide.createIcons();
configureProviders();
restoreSession();
