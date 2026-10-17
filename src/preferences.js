import './preferences.css';

const defaults = { font: 'default', size: 'medium', theme: 'system', language: 'en' };
const fonts = { default: '"DM Sans", sans-serif', simple: 'Arial, sans-serif', serif: 'Georgia, serif' };
let accountKey;
let preferences = { ...defaults };
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const dialog = document.createElement('dialog');
dialog.className = 'preferences-dialog';
dialog.setAttribute('aria-labelledby', 'preferencesTitle');
dialog.innerHTML = `<form method="dialog">
  <h2 id="preferencesTitle">Make yourself comfortable</h2>
  <p id="preferencesIntro">Choose your reading preferences. You can change these in Settings anytime.</p>
  <label>Font<select name="font"><option value="default">DM Sans (default)</option><option value="simple">Arial</option><option value="serif">Georgia</option></select></label>
  <label>Text size<select name="size"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="extra">Extra large</option></select></label>
  <label>Appearance<select name="theme"><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
  <label>Language<select name="language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option><option value="ta">தமிழ்</option></select></label>
  <p class="preferences-preview">Your health story, at your pace.</p>
  <p class="preferences-note">Saved for this account in this browser. Language applies to supported intake and sign-in text.</p>
  <button type="submit" class="preferences-save">Save preferences</button>
  <p class="preferences-status" role="status"></p>
</form>`;
document.body.append(dialog);
const doctorSettings = document.createElement('button');
doctorSettings.type = 'button';
doctorSettings.className = 'doctor-preferences';
doctorSettings.dataset.openSettings = '';
doctorSettings.textContent = 'Settings';
document.body.append(doctorSettings);
const form = dialog.querySelector('form');

function apply() {
  document.documentElement.dataset.appearance = preferences.theme === 'system' ? systemTheme.matches ? 'dark' : 'light' : preferences.theme;
  document.documentElement.dataset.readingFont = preferences.font;
  document.documentElement.style.setProperty('--reading-font', fonts[preferences.font]);
  document.documentElement.style.setProperty('--reading-scale', { small: '.9', medium: '1', large: '1.15', extra: '1.3' }[preferences.size]);
  document.documentElement.lang = preferences.language;
  scheduleTextSizing();
}
let sizingFrame = 0;
function scheduleTextSizing() {
  if (sizingFrame) return;
  sizingFrame = requestAnimationFrame(() => {
    sizingFrame = 0;
    const root = document.documentElement;
    root.dataset.textSizing = 'measuring';
    const elements = [...document.body.querySelectorAll('*')].filter(element => element instanceof HTMLElement);
    const sizes = elements.map(element => getComputedStyle(element).fontSize);
    elements.forEach((element, index) => element.style.setProperty('--base-text-size', sizes[index]));
    root.dataset.textSizing = 'ready';
  });
}
new MutationObserver(scheduleTextSizing).observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', scheduleTextSizing);
function openSettings(first = false) {
  document.querySelector('#patientMenu')?.setAttribute('hidden', '');
  document.querySelector('#patientOptions')?.setAttribute('aria-expanded', 'false');
  dialog.querySelector('h2').textContent = first ? 'Make yourself comfortable' : 'Settings';
  for (const key of Object.keys(defaults)) form.elements.namedItem(key).value = preferences[key];
  dialog.querySelector('.preferences-status').textContent = '';
  if (!dialog.open) dialog.showModal();
}
form.addEventListener('change', () => {
  for (const key of Object.keys(defaults)) preferences[key] = form.elements.namedItem(key).value;
  apply();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    localStorage.setItem(accountKey, JSON.stringify(preferences));
    localStorage.setItem('meditrace.locale', preferences.language);
  } catch {
    dialog.querySelector('.preferences-status').textContent = 'Could not save preferences. Please allow browser storage and try again.';
    return;
  }
  document.querySelector(`#languageMenu [data-lang="${preferences.language}-IN"]`)?.click();
  dialog.close();
});
dialog.addEventListener('cancel', event => { event.preventDefault(); form.requestSubmit(); });
systemTheme.addEventListener('change', () => { if (preferences.theme === 'system') apply(); });
document.addEventListener('click', event => { if (event.target.closest('[data-open-settings]')) openSettings(); });

export function startPreferences(user) {
  accountKey = `meditrace.preferences.${user.id}`;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(accountKey)); } catch { /* Use defaults for invalid storage. */ }
  preferences = { ...defaults, language: localStorage.getItem('meditrace.locale') || 'en' };
  for (const [key, options] of Object.entries({ font: Object.keys(fonts), size: ['small', 'medium', 'large', 'extra'], theme: ['system', 'light', 'dark'], language: ['en', 'hi', 'mr', 'ta'] })) {
    if (options.includes(saved?.[key])) preferences[key] = saved[key];
  }
  apply();
  localStorage.setItem('meditrace.locale', preferences.language);
  if (!saved) openSettings(true);
}
