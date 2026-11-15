import './preferences.css';
const defaults={theme:'dark',language:'en'}, languages={en:'English',hi:'हिन्दी',mr:'मराठी',ta:'தமிழ்'};
let accountKey,currentUser,preferences={...defaults};
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
const dialog=document.createElement('dialog');
dialog.className='preferences-dialog'; dialog.setAttribute('aria-labelledby','preferencesTitle');
dialog.innerHTML=`<form><h2 id="preferencesTitle">Choose your language</h2><p id="preferencesIntro">Which language would you like to use?</p><fieldset class="preference-languages"><legend>Language</legend>${Object.entries(languages).map(([value,label])=>`<label><input type="radio" name="language" value="${value}"><span>${label}</span></label>`).join('')}</fieldset><label class="appearance-setting">Appearance<select name="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">Use device setting</option></select></label><button type="submit" class="preferences-save">Continue</button><p class="preferences-status" role="status"></p><section class="delete-profile-setting" hidden><h3>Delete profile</h3><p>Permanently delete your account, intake conversations, medical history and uploaded documents. This cannot be undone.</p><button type="button" data-delete-profile>Delete my profile</button><div class="delete-profile-confirm" hidden><label>Type DELETE to confirm<input name="deleteConfirmation" autocomplete="off" spellcheck="false"></label><button type="button" data-confirm-delete-profile>Permanently delete profile</button><button type="button" data-cancel-delete-profile>Cancel</button></div></section></form>`;
document.body.append(dialog);
const form=dialog.querySelector('form');
function apply(){
 document.documentElement.dataset.appearance=preferences.theme==='system'?(systemTheme.matches?'dark':'light'):preferences.theme;
 delete document.documentElement.dataset.readingFont; delete document.documentElement.dataset.textSizing;
 document.documentElement.style.removeProperty('--reading-font'); document.documentElement.style.removeProperty('--reading-scale');
 document.documentElement.lang=preferences.language;
}
function openSettings(first=false){
 document.querySelector('#patientMenu')?.setAttribute('hidden',''); document.querySelector('#patientOptions')?.setAttribute('aria-expanded','false');
 dialog.classList.toggle('language-welcome',first); dialog.querySelector('h2').textContent=first?'Choose your language':'Settings';
 dialog.querySelector('#preferencesIntro').textContent=first?'Which language would you like to use?':'Choose your language and appearance.';
 form.elements.namedItem('language').value=preferences.language; form.elements.namedItem('theme').value=preferences.theme;
 dialog.querySelector('.appearance-setting').hidden=first; dialog.querySelector('.delete-profile-setting').hidden=first||currentUser?.role!=='Patient';
 dialog.querySelector('.delete-profile-confirm').hidden=true; form.elements.namedItem('deleteConfirmation').value='';
 dialog.querySelector('.preferences-save').textContent=first?'Continue':'Save settings'; dialog.querySelector('.preferences-status').textContent='';
 if(!dialog.open)dialog.showModal();
}
form.addEventListener('change',event=>{if(!['language','theme'].includes(event.target.name))return; preferences.language=form.elements.namedItem('language').value;preferences.theme=form.elements.namedItem('theme').value;apply();});
form.addEventListener('submit',event=>{
 event.preventDefault();
 try{localStorage.setItem(accountKey,JSON.stringify({...preferences,languageChosen:true}));localStorage.setItem('meditrace.locale',preferences.language);}catch{dialog.querySelector('.preferences-status').textContent='Could not save settings. Please allow browser storage and try again.';return;}
 document.querySelector(`#languageMenu [data-lang="${preferences.language}-IN"]`)?.click(); dialog.close();
});
dialog.addEventListener('cancel',event=>{event.preventDefault();form.requestSubmit();});
systemTheme.addEventListener('change',()=>{if(preferences.theme==='system')apply();});
document.addEventListener('click',event=>{if(event.target.closest('[data-open-settings]'))openSettings();});
dialog.querySelector('[data-delete-profile]').addEventListener('click',()=>{dialog.querySelector('.delete-profile-confirm').hidden=false;form.elements.namedItem('deleteConfirmation').focus();});
dialog.querySelector('[data-cancel-delete-profile]').addEventListener('click',()=>{dialog.querySelector('.delete-profile-confirm').hidden=true;form.elements.namedItem('deleteConfirmation').value='';});
dialog.querySelector('[data-confirm-delete-profile]').addEventListener('click',async event=>{
 const status=dialog.querySelector('.preferences-status');
 if(form.elements.namedItem('deleteConfirmation').value!=='DELETE'){status.textContent='Type DELETE exactly to confirm.';return;}
 const button=event.currentTarget;button.disabled=true;status.textContent='Deleting your profile…';
 try{
  const token=sessionStorage.getItem('meditrace.token')||localStorage.getItem('meditrace.token');
  const response=await fetch('/api/auth/account',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({confirmation:'DELETE'})});
  const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Could not delete your profile.');
  localStorage.removeItem(accountKey);localStorage.removeItem('meditrace.token');sessionStorage.removeItem('meditrace.token');
  for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(key.includes(currentUser.id)&&key.startsWith('meditrace.'))storage.removeItem(key);
  window.location.replace('/');
 }catch(error){status.textContent=error.message;button.disabled=false;}
});
export function startPreferences(user){
 currentUser=user;accountKey=`meditrace.preferences.${user.id}`;let saved;
 try{saved=JSON.parse(localStorage.getItem(accountKey));}catch{}
 preferences={...defaults,language:localStorage.getItem('meditrace.locale')||'en'};
 if(saved?.languageChosen&&['dark','light','system'].includes(saved.theme))preferences.theme=saved.theme;
 if(Object.hasOwn(languages,saved?.language))preferences.language=saved.language;
 if(!Object.hasOwn(languages,preferences.language))preferences.language='en';
 apply();localStorage.setItem('meditrace.locale',preferences.language);if(!saved?.languageChosen)openSettings(true);
}
apply();
