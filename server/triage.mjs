// ---------------------------------------------------------------------------
// MediTrace adaptive intake engine
//
// A HYBRID design:
//   * Predefined clinical question flows (deterministic rules) own safety and
//     structure. Red-flag screening always runs first.
//   * An LLM (see llm.mjs) may select the most relevant next follow-up and
//     normalise free-text answers, but it can only choose from the allowed
//     question bank. It never invents advice and never diagnoses.
//
// This module is intentionally non-diagnostic: it gathers a history and
// surfaces reported warning signs so a clinician can act. It does not decide
// what is wrong with the patient.
// ---------------------------------------------------------------------------

const AFFIRMATIVE = ['yes', 'yeah', 'yep', 'yup', 'correct', 'true', 'i do', 'i have', 'i am', 'definitely', 'absolutely'];
const AMBIGUOUS = ['sometimes', 'maybe', 'at times', 'occasionally', 'a bit', 'a little', 'sort of', 'kind of', 'on and off', 'now and then', 'mild'];
const NEGATIVE = ['no', 'nope', 'nah', 'none', 'never', 'not really', 'i don', 'negative', 'false', 'not at all', "haven't", 'no i'];

const LEGACY_QUESTIONS = [
  { id: 'main-concern', summaryLabel: { en: 'Main concern', hi: 'मुख्य समस्या', mr: 'मुख्य समस्या', ta: 'முக்கிய பிரச்சினை' }, text: { en: 'Hello. I’ll help your care team understand how you’re feeling. What is bothering you today?', hi: 'नमस्ते। मैं आपकी देखभाल टीम को यह समझने में मदद करूँगी कि आप कैसा महसूस कर रहे हैं। आज आपको क्या परेशानी है?', mr: 'नमस्कार. तुम्हाला कसे वाटत आहे हे तुमच्या काळजी संघाला समजण्यास मी मदत करीन. आज तुम्हाला काय त्रास होत आहे?', ta: 'வணக்கம். நீங்கள் எப்படி உணர்கிறீர்கள் என்பதை உங்கள் சிகிச்சைக் குழு புரிந்துகொள்ள நான் உதவுவேன். இன்று உங்களைத் தொந்தரவு செய்வது என்ன?' } },
  { id: 'when-started', summaryLabel: { en: 'When it started', hi: 'कब शुरू हुआ', mr: 'कधी सुरू झाले', ta: 'எப்போது தொடங்கியது' }, text: { en: 'Thank you. When did you first notice these symptoms?', hi: 'धन्यवाद। आपने ये लक्षण पहली बार कब महसूस किए?', mr: 'धन्यवाद. तुम्हाला ही लक्षणे पहिल्यांदा कधी जाणवली?', ta: 'நன்றி. இந்த அறிகுறிகளை நீங்கள் முதலில் எப்போது கவனித்தீர்கள்?' } },
  { id: 'severity', summaryLabel: { en: 'Severity', hi: 'तीव्रता', mr: 'तीव्रता', ta: 'தீவிரம்' }, text: { en: 'On a scale of one to ten, how uncomfortable does it feel right now?', hi: 'एक से दस के पैमाने पर, आप अभी कितनी असुविधा महसूस कर रहे हैं?', mr: 'एक ते दहा या प्रमाणावर, आत्ता तुम्हाला किती अस्वस्थ वाटते?', ta: 'ஒன்று முதல் பத்து வரையிலான அளவில், இப்போது நீங்கள் எவ்வளவு அசௌகரியமாக உணர்கிறீர்கள்?' } },
  { id: 'anything-else', summaryLabel: { en: 'Anything else', hi: 'कुछ और', mr: 'आणखी काही', ta: 'வேறு ஏதாவது' }, text: { en: 'Is there anything else you would like your care team to know?', hi: 'क्या कोई और बात है जो आप अपनी देखभाल टीम को बताना चाहेंगे?', mr: 'तुमच्या काळजी संघाला जाणून घ्यायचे असे आणखी काही आहे का?', ta: 'உங்கள் சிகிச்சைக் குழு தெரிந்துகொள்ள வேண்டிய வேறு ஏதேனும் உள்ளதா?' } },
];

// The first adaptive question, used to classify the complaint.
const CHIEF_COMPLAINT_QUESTION = {
  id: 'chief-complaint',
  phase: 'core',
  kind: 'text',
  field: 'chiefComplaint',
  summaryLabel: 'Main concern',
  text: 'What is the main problem that brings you in today? Please describe it in your own words.',
};

// ---------------------------------------------------------------------------
// Complaint keyword routing
// ---------------------------------------------------------------------------

const KEYWORDS = {
  'chest-pain': { strong: ['chest pain', 'chest', 'angina', 'heart', 'chest pressure'], weak: ['palpitations', 'left arm', 'jaw', 'sweating'] },
  breathing: { strong: ['shortness of breath', 'breathless', 'breathing', 'breath', 'asthma', 'wheeze'], weak: ['cough', 'coughing', 'oxygen', 'wheezing'] },
  headache: { strong: ['headache', 'head ache', 'migraine', 'head pain'], weak: ['dizzy', 'dizziness', 'vision', 'light sensitivity', 'nausea'] },
  fever: { strong: ['fever', 'temperature', 'feverish', 'pyrexia'], weak: ['chills', 'shivering', 'sweating', 'hot', 'cold'] },
  'abdominal-pain': { strong: ['stomach', 'abdominal', 'abdomen', 'belly', 'tummy', 'stomach pain'], weak: ['nausea', 'vomit', 'vomiting', 'diarrhea', 'diarrhoea', 'constipation'] },
};

const ACUITY_ORDER = ['chest-pain', 'breathing', 'headache', 'fever', 'abdominal-pain', 'default'];

export function classifyComplaint(rawText) {
  const text = String(rawText || '').toLowerCase();
  let best = 'default';
  let bestScore = 0;
  for (const key of ACUITY_ORDER) {
    const entry = KEYWORDS[key];
    if (!entry) continue;
    let score = 0;
    for (const keyword of entry.strong) if (text.includes(keyword)) score += 3;
    for (const keyword of entry.weak) if (text.includes(keyword)) score += 1;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Question bank
//
// Question shape:
//   id            unique id
//   phase         'red-flag' | 'core' | 'history' | 'general'
//   kind          'text' | 'boolean' | 'number' | 'single' | 'multi'
//   text          the question shown to the patient
//   summaryLabel  short label used in the summary panel
//   field         triage state field this answer primarily fills
//   options       for 'single' | 'multi' | 'boolean' label overrides
//   redFlag       { id, label } -> a positive answer is a warning sign
//   requires      (state) => boolean, for conditional/branching questions
// ---------------------------------------------------------------------------

const bool = (id, field, text, summaryLabel, redFlag, redFlagWhen = 'yes') => ({ id, field, text, summaryLabel, kind: 'boolean', phase: redFlag ? 'red-flag' : 'core', redFlag: redFlag || null, redFlagWhen,
  options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] });

const FLOWS = {
  'chest-pain': [
    bool('cp-severe-now', 'severeNow', 'Right now, is the chest pain severe, crushing or getting worse?', 'Severe chest pain now', { id: 'severe-chest-pain', label: 'Severe / worsening chest pain' }),
    bool('cp-breathless', 'breathless', 'Are you struggling to breathe, or very short of breath right now?', 'Breathlessness', { id: 'breathlessness', label: 'Breathlessness with chest pain' }),
    bool('cp-faint-sweat', 'faintSweat', 'Have you fainted, felt faint, or become cold and sweaty?', 'Fainting / clamminess', { id: 'fainting', label: 'Fainting or clamminess' }),
    bool('cp-radiation', 'radiation', 'Does the pain spread to your arm, shoulder, jaw, neck or back?', 'Radiating pain', { id: 'radiating-chest-pain', label: 'Chest pain spreading to arm, jaw or back' }),
    { id: 'cp-duration', field: 'duration', summaryLabel: 'Duration', kind: 'text', phase: 'core', text: 'When did the chest discomfort start, and how long does each episode last?' },
    { id: 'cp-character', field: 'character', summaryLabel: 'Character of pain', kind: 'single', phase: 'core', text: 'How would you describe the discomfort?', options: [{ value: 'pressure', label: 'Pressure or tightness' }, { value: 'sharp', label: 'Sharp or stabbing' }, { value: 'burning', label: 'Burning' }, { value: 'aching', label: 'Aching' }] },
    { id: 'cp-trigger', field: 'trigger', summaryLabel: 'Trigger', kind: 'single', phase: 'core', text: 'What brings it on?', options: [{ value: 'exertion', label: 'Physical activity' }, { value: 'rest', label: 'At rest' }, { value: 'stress', label: 'Stress or emotion' }, { value: 'food', label: 'After eating' }, { value: 'random', label: 'No clear trigger' }] },
    { id: 'cp-relief', field: 'relief', summaryLabel: 'Relief', kind: 'single', phase: 'core', text: 'Does anything ease it?', options: [{ value: 'rest', label: 'Rest' }, { value: 'medicine', label: 'Medicine' }, { value: 'position', label: 'Change of position' }, { value: 'nothing', label: 'Nothing' }] },
    { id: 'cp-associated', field: 'associatedSymptoms', summaryLabel: 'Associated symptoms', kind: 'multi', phase: 'core', text: 'Along with the chest discomfort, are you also experiencing any of these?', options: [{ value: 'nausea', label: 'Nausea' }, { value: 'sweating', label: 'Sweating' }, { value: 'palpitations', label: 'Racing heartbeat' }, { value: 'dizziness', label: 'Dizziness' }, { value: 'none', label: 'None of these' }] },
    { id: 'cp-history', field: 'history', summaryLabel: 'Heart / risk history', kind: 'multi', phase: 'history', text: 'Do any of these apply to you?', options: [{ value: 'heart-disease', label: 'Known heart condition' }, { value: 'diabetes', label: 'Diabetes' }, { value: 'high-bp', label: 'High blood pressure' }, { value: 'smoking', label: 'Currently smoke' }, { value: 'none', label: 'None of these' }] },
    { id: 'cp-medications', field: 'medications', summaryLabel: 'Medications', kind: 'text', phase: 'history', text: 'Which medications are you currently taking, including anything for the heart or blood pressure?' },
    { id: 'cp-allergies', field: 'allergies', summaryLabel: 'Allergies', kind: 'text', phase: 'history', text: 'Do you have any allergies? If none, you can say “none”.' },
    { id: 'cp-anything-else', field: 'anythingElse', summaryLabel: 'Anything else', kind: 'text', phase: 'general', text: 'Is there anything else you would like your care team to know?' },
  ],

  breathing: [
    bool('br-worsening', 'worsening', 'Is your breathing getting worse quickly, or are you unable to speak a full sentence?', 'Rapidly worsening breathing', { id: 'severe-breathlessness', label: 'Severe or rapidly worsening breathlessness' }),
    bool('br-chest-confusion', 'chestConfusion', 'Do you have chest pain, blue lips, or new confusion?', 'Chest pain / blue lips / confusion', { id: 'breathing-red-flag', label: 'Breathlessness with chest pain, blue lips or confusion' }),
    { id: 'br-duration', field: 'duration', summaryLabel: 'Duration', kind: 'text', phase: 'core', text: 'When did the breathing difficulty start, and is it constant or in episodes?' },
    { id: 'br-severity', field: 'severity', summaryLabel: 'Activity level', kind: 'single', phase: 'core', text: 'How much activity triggers it?', options: [{ value: 'rest', label: 'Even at rest' }, { value: 'mild', label: 'Walking around the house' }, { value: 'moderate', label: 'Climbing stairs' }, { value: 'strenuous', label: 'Only with strenuous activity' }] },
    { id: 'br-associated', field: 'associatedSymptoms', summaryLabel: 'Associated symptoms', kind: 'multi', phase: 'core', text: 'Are you also experiencing any of these?', options: [{ value: 'cough', label: 'Cough' }, { value: 'wheeze', label: 'Wheezing' }, { value: 'fever', label: 'Fever' }, { value: 'sputum', label: 'Phlegm or sputum' }, { value: 'blood', label: 'Blood in sputum' }, { value: 'none', label: 'None of these' }] },
    { id: 'br-trigger', field: 'trigger', summaryLabel: 'Triggers', kind: 'text', phase: 'core', text: 'Does anything seem to trigger or worsen it — for example exercise, night-time, or allergens?' },
    { id: 'br-history', field: 'history', summaryLabel: 'Lung / heart history', kind: 'multi', phase: 'history', text: 'Do any of these apply to you?', options: [{ value: 'asthma', label: 'Asthma' }, { value: 'copd', label: 'COPD or chronic lung disease' }, { value: 'heart-failure', label: 'Heart failure' }, { value: 'smoking', label: 'Currently smoke' }, { value: 'none', label: 'None of these' }] },
    { id: 'br-medications', field: 'medications', summaryLabel: 'Medications', kind: 'text', phase: 'history', text: 'Which medications or inhalers are you currently using?' },
    { id: 'br-allergies', field: 'allergies', summaryLabel: 'Allergies', kind: 'text', phase: 'history', text: 'Do you have any allergies? If none, you can say “none”.' },
    { id: 'br-anything-else', field: 'anythingElse', summaryLabel: 'Anything else', kind: 'text', phase: 'general', text: 'Is there anything else you would like your care team to know?' },
  ],

  headache: [
    { id: 'ha-onset', field: 'duration', summaryLabel: 'Onset & duration', kind: 'text', phase: 'core', text: 'When did the headache start, and did it come on suddenly or gradually?' },
    bool('ha-thunderclap', 'thunderclap', 'Did the headache reach its worst intensity within seconds (like a clap of thunder)?', 'Sudden worst-ever headache', { id: 'thunderclap-headache', label: 'Sudden “worst ever” headache' }),
    bool('ha-fever-neck', 'feverNeck', 'Do you also have a fever and a stiff neck, or any confusion?', 'Fever + stiff neck / confusion', { id: 'meningitis-symptoms', label: 'Headache with fever, stiff neck or confusion' }),
    bool('ha-neuro', 'neuro', 'Any new weakness, numbness, trouble speaking, or loss of vision?', 'Focal neurological symptoms', { id: 'focal-neurology', label: 'Headache with weakness, numbness or vision loss' }),
    { id: 'ha-severity', field: 'severity', summaryLabel: 'Severity', kind: 'number', phase: 'core', text: 'On a scale of one to ten, how severe is the headache right now?' },
    { id: 'ha-location', field: 'location', summaryLabel: 'Location', kind: 'single', phase: 'core', text: 'Where is the headache mainly located?', options: [{ value: 'one-side', label: 'One side' }, { value: 'both', label: 'Both sides' }, { value: 'behind-eyes', label: 'Behind the eyes' }, { value: 'back-head', label: 'Back of the head' }] },
    { id: 'ha-character', field: 'character', summaryLabel: 'Character', kind: 'single', phase: 'core', text: 'How would you describe the pain?', options: [{ value: 'throbbing', label: 'Throbbing' }, { value: 'pressure', label: 'Pressure or tight band' }, { value: 'stabbing', label: 'Stabbing' }] },
    { id: 'ha-associated', field: 'associatedSymptoms', summaryLabel: 'Associated symptoms', kind: 'multi', phase: 'core', text: 'Do you have any of these along with the headache?', options: [{ value: 'nausea', label: 'Nausea or vomiting' }, { value: 'light', label: 'Sensitivity to light' }, { value: 'sound', label: 'Sensitivity to sound' }, { value: 'aura', label: 'Visual changes or aura' }, { value: 'none', label: 'None of these' }] },
    { id: 'ha-frequency', field: 'frequency', summaryLabel: 'Frequency', kind: 'text', phase: 'core', text: 'How often do you get these headaches, and is this one different from your usual ones?' },
    { id: 'ha-history', field: 'history', summaryLabel: 'Relevant history', kind: 'multi', phase: 'history', text: 'Do any of these apply to you?', options: [{ value: 'migraine', label: 'Known migraines' }, { value: 'high-bp', label: 'High blood pressure' }, { value: 'head-injury', label: 'Recent head injury' }, { value: 'none', label: 'None of these' }] },
    { id: 'ha-medications', field: 'medications', summaryLabel: 'Medications', kind: 'text', phase: 'history', text: 'Which medications are you currently taking, including painkillers?' },
    { id: 'ha-allergies', field: 'allergies', summaryLabel: 'Allergies', kind: 'text', phase: 'history', text: 'Do you have any allergies? If none, you can say “none”.' },
    { id: 'ha-anything-else', field: 'anythingElse', summaryLabel: 'Anything else', kind: 'text', phase: 'general', text: 'Is there anything else you would like your care team to know?' },
  ],

  fever: [
    { id: 'fv-duration', field: 'duration', summaryLabel: 'Duration', kind: 'text', phase: 'core', text: 'How many days have you had the fever?' },
    { id: 'fv-measured', field: 'measured', summaryLabel: 'Measured temperature', kind: 'text', phase: 'core', text: 'Have you measured your temperature? If so, what was the reading?' },
    bool('fv-redflag', 'feverRed', 'Do you have any difficulty breathing, chest pain, confusion, or a rash that does not fade when pressed?', 'Warning signs with fever', { id: 'fever-red-flag', label: 'Fever with breathing difficulty, chest pain, confusion or non-fading rash' }),
    { id: 'fv-other', field: 'associatedSymptoms', summaryLabel: 'Other symptoms', kind: 'multi', phase: 'core', text: 'Have you had any of these along with the fever?', options: [{ value: 'cough', label: 'Cough' }, { value: 'sore-throat', label: 'Sore throat' }, { value: 'runny-nose', label: 'Runny or blocked nose' }, { value: 'body-ache', label: 'Body aches' }, { value: 'headache', label: 'Headache' }, { value: 'vomiting', label: 'Vomiting' }, { value: 'diarrhea', label: 'Diarrhoea' }, { value: 'rash', label: 'Rash' }, { value: 'none', label: 'None of these' }] },
    { id: 'fv-breathing', field: 'breathing', summaryLabel: 'Breathing with cough', kind: 'boolean', phase: 'core', text: 'You mentioned a cough — are you having any difficulty breathing with it?', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], redFlag: { id: 'breathlessness', label: 'Breathlessness with fever and cough' }, requires: (state) => (state.associatedSymptoms || []).some((s) => ['cough', 'runny-nose', 'sore-throat'].includes(s)) },
    { id: 'fv-hydration', field: 'hydration', summaryLabel: 'Hydration', kind: 'boolean', phase: 'core', text: 'Are you able to drink fluids and pass urine normally?', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], redFlag: { id: 'dehydration', label: 'Unable to keep fluids down / not passing urine' }, redFlagWhen: 'no' },
    { id: 'fv-risk', field: 'riskFactors', summaryLabel: 'Risk factors', kind: 'multi', phase: 'history', text: 'Do any of these apply to you?', options: [{ value: 'diabetes', label: 'Diabetes' }, { value: 'immunocompromised', label: 'Weak immune system' }, { value: 'pregnancy', label: 'Pregnant' }, { value: 'travel', label: 'Recent travel' }, { value: 'none', label: 'None of these' }] },
    { id: 'fv-medications', field: 'medications', summaryLabel: 'Medications', kind: 'text', phase: 'history', text: 'Which medications have you taken for the fever so far?' },
    { id: 'fv-allergies', field: 'allergies', summaryLabel: 'Allergies', kind: 'text', phase: 'history', text: 'Do you have any allergies? If none, you can say “none”.' },
    { id: 'fv-anything-else', field: 'anythingElse', summaryLabel: 'Anything else', kind: 'text', phase: 'general', text: 'Is there anything else you would like your care team to know?' },
  ],

  'abdominal-pain': [
    { id: 'ap-duration', field: 'duration', summaryLabel: 'Onset & duration', kind: 'text', phase: 'core', text: 'When did the tummy pain start, and is it constant or coming and going?' },
    bool('ap-severe-rigid', 'severeRigid', 'Is the pain severe and constant, with a very tender or hard belly?', 'Severe constant abdominal pain', { id: 'severe-abdominal-pain', label: 'Severe, constant abdominal pain with a rigid belly' }),
    bool('ap-bleeding', 'bleeding', 'Any vomiting of blood, black stools, or blood in your stool?', 'GI bleeding', { id: 'gi-bleeding', label: 'Vomiting blood or blood in stool' }),
    { id: 'ap-location', field: 'location', summaryLabel: 'Location', kind: 'single', phase: 'core', text: 'Where is the pain mainly located?', options: [{ value: 'upper', label: 'Upper belly' }, { value: 'lower', label: 'Lower belly' }, { value: 'right', label: 'Right side' }, { value: 'left', label: 'Left side' }, { value: 'all-over', label: 'All over' }] },
    { id: 'ap-severity', field: 'severity', summaryLabel: 'Severity', kind: 'number', phase: 'core', text: 'On a scale of one to ten, how severe is the pain right now?' },
    { id: 'ap-associated', field: 'associatedSymptoms', summaryLabel: 'Associated symptoms', kind: 'multi', phase: 'core', text: 'Are you also experiencing any of these?', options: [{ value: 'nausea', label: 'Nausea' }, { value: 'vomiting', label: 'Vomiting' }, { value: 'diarrhea', label: 'Diarrhoea' }, { value: 'constipation', label: 'Constipation' }, { value: 'fever', label: 'Fever' }, { value: 'urinary', label: 'Burning when passing urine' }, { value: 'none', label: 'None of these' }] },
    { id: 'ap-food', field: 'food', summaryLabel: 'Relation to food', kind: 'single', phase: 'core', text: 'Is the pain related to eating?', options: [{ value: 'worse', label: 'Worse after eating' }, { value: 'better', label: 'Better after eating' }, { value: 'unrelated', label: 'Unrelated' }] },
    { id: 'ap-history', field: 'history', summaryLabel: 'Relevant history', kind: 'multi', phase: 'history', text: 'Do any of these apply to you?', options: [{ value: 'pregnancy', label: 'Possibly pregnant' }, { value: 'surgery', label: 'Previous abdominal surgery' }, { value: 'ulcer', label: 'Stomach ulcer or reflux' }, { value: 'none', label: 'None of these' }] },
    { id: 'ap-medications', field: 'medications', summaryLabel: 'Medications', kind: 'text', phase: 'history', text: 'Which medications are you currently taking, including painkillers?' },
    { id: 'ap-allergies', field: 'allergies', summaryLabel: 'Allergies', kind: 'text', phase: 'history', text: 'Do you have any allergies? If none, you can say “none”.' },
    { id: 'ap-anything-else', field: 'anythingElse', summaryLabel: 'Anything else', kind: 'text', phase: 'general', text: 'Is there anything else you would like your care team to know?' },
  ],

  default: [
    { id: 'df-duration', field: 'duration', summaryLabel: 'Duration', kind: 'text', phase: 'core', text: 'When did this problem start?' },
    bool('df-redflag', 'generalRed', 'Right now, do you have any severe symptoms such as difficulty breathing, chest pain, fainting, or heavy bleeding?', 'Severe symptoms now', { id: 'general-red-flag', label: 'Severe symptoms reported (breathing, chest pain, fainting, bleeding)' }),
    { id: 'df-severity', field: 'severity', summaryLabel: 'Severity', kind: 'number', phase: 'core', text: 'On a scale of one to ten, how severe does it feel right now?' },
    { id: 'df-associated', field: 'associatedSymptoms', summaryLabel: 'Associated symptoms', kind: 'text', phase: 'core', text: 'Have you noticed any other symptoms along with it?' },
    { id: 'df-history', field: 'history', summaryLabel: 'Relevant history', kind: 'text', phase: 'history', text: 'Do you have any ongoing medical conditions I should know about?' },
    { id: 'df-medications', field: 'medications', summaryLabel: 'Medications', kind: 'text', phase: 'history', text: 'Which medications are you currently taking?' },
    { id: 'df-allergies', field: 'allergies', summaryLabel: 'Allergies', kind: 'text', phase: 'history', text: 'Do you have any allergies? If none, you can say “none”.' },
    { id: 'df-anything-else', field: 'anythingElse', summaryLabel: 'Anything else', kind: 'text', phase: 'general', text: 'Is there anything else you would like your care team to know?' },
  ],
};

export const COMPLAINT_LABELS = {
  'chest-pain': 'Chest pain',
  breathing: 'Breathing difficulty',
  headache: 'Headache',
  fever: 'Fever',
  'abdominal-pain': 'Abdominal pain',
  default: 'General concern',
};

function flowFor(complaint) { return FLOWS[complaint] || FLOWS.default; }

export function questionById(id) {
  if (id === CHIEF_COMPLAINT_QUESTION.id) return CHIEF_COMPLAINT_QUESTION;
  const legacy = LEGACY_QUESTIONS.find((question) => question.id === id);
  if (legacy) return { ...legacy, summaryLabel: legacy.summaryLabel.en };
  for (const flow of Object.values(FLOWS)) {
    const found = flow.find((question) => question.id === id);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createTriageState({ adaptive = true } = {}) {
  return {
    adaptive,
    chiefComplaint: null,
    complaint: null,
    complaintLabel: null,
    duration: null,
    severity: null,
    associatedSymptoms: [],
    redFlags: [],
    escalated: false,
    escalationReason: null,
    complete: false,
    nextQuestionId: null,
    askedQuestions: [],
    answered: {},
    answers: [],
    transcript: [],
  };
}

export function candidateQuestions(state) {
  if (!state.adaptive) {
    const answeredIds = new Set(state.askedQuestions);
    return LEGACY_QUESTIONS.filter((question) => !answeredIds.has(question.id))
      .map((question) => ({ id: question.id, text: question.text.en, summaryLabel: question.summaryLabel.en, kind: 'text', options: null }));
  }
  if (!state.chiefComplaint) return [CHIEF_COMPLAINT_QUESTION];
  const answeredIds = new Set(state.askedQuestions);
  return flowFor(state.complaint)
    .filter((question) => !answeredIds.has(question.id) && (!question.requires || question.requires(state)))
    .map((question) => ({ id: question.id, text: question.text, summaryLabel: question.summaryLabel, kind: question.kind, options: question.options || null }));
}

export function resolveQuestion(state, locale = 'en') {
  if (state.escalated) return { complete: false, escalated: true, question: null };
  const candidates = candidateQuestions(state);
  if (!candidates.length) return { complete: true, escalated: false, question: null };
  const chosen = candidates.find((question) => question.id === state.nextQuestionId) || candidates[0];
  const question = { ...chosen };
  if (!state.adaptive) {
    const legacy = LEGACY_QUESTIONS.find((item) => item.id === question.id);
    question.text = legacy.text[locale] || legacy.text.en;
    question.summaryLabel = legacy.summaryLabel[locale] || legacy.summaryLabel.en;
  }
  return { complete: false, escalated: false, question };
}

export function escalationMessage(state) {
  const labels = state.redFlags.map((flag) => flag.label).join('; ');
  return {
    headline: 'This may need urgent attention',
    body: 'Some of the things you described can be signs of a serious problem. Please do not wait for your appointment.',
    advice: 'Call your local emergency number or go to the nearest emergency department now. If someone is with you, ask them to help you get there safely.',
    reasons: state.redFlags.map((flag) => flag.label),
    reason: labels,
    disclaimer: 'This is not a diagnosis. It is a safety check based on what you reported.',
  };
}

// ---------------------------------------------------------------------------
// Answer interpretation (rules)
// ---------------------------------------------------------------------------

function normalise(text) { return String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim(); }

function hasAny(text, list) { return list.some((token) => text.includes(token)); }

export function interpretBoolean(text, { safety = false } = {}) {
  const value = normalise(text);
  if (hasAny(value, NEGATIVE) && !hasAny(value, AFFIRMATIVE)) {
    if (safety && hasAny(value, AMBIGUOUS)) return true;
    return false;
  }
  if (hasAny(value, AFFIRMATIVE)) return true;
  if (hasAny(value, AMBIGUOUS)) return safety ? true : true;
  if (/\bnot?\b/.test(value) && hasAny(value, ['no', 'not'])) return false;
  return null;
}

function interpretNumber(text) {
  const match = normalise(text).match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function interpretOptions(question, text) {
  const value = normalise(text);
  const options = question.options || [];
  const matched = options.filter((option) => option.value !== 'none' && value.includes(normalise(option.label).split(' ')[0])).map((option) => option.value);
  if (!matched.length && options.some((option) => option.value === 'none') && hasAny(value, ['none', 'no', 'nothing', 'nope', 'none of these'])) matched.push('none');
  return matched;
}

export function interpretAnswer(question, text) {
  const value = normalise(text);
  const result = {};
  if (question.kind === 'boolean') {
    result.value = interpretBoolean(text, { safety: Boolean(question.redFlag) });
  } else if (question.kind === 'number') {
    result.value = interpretNumber(text);
  } else if (question.kind === 'single') {
    const matches = interpretOptions(question, text);
    result.value = matches[0] || value.slice(0, 200);
  } else if (question.kind === 'multi') {
    result.value = interpretOptions(question, text);
  } else {
    result.value = value.slice(0, 2000);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Turn processing
// ---------------------------------------------------------------------------

function isPositive(value, question) {
  if (question.kind === 'boolean') return value === true;
  if (Array.isArray(value)) return value.length > 0 && !(value.length === 1 && value[0] === 'none');
  if (typeof value === 'string') return interpretBoolean(value, { safety: Boolean(question.redFlag) }) === true;
  return false;
}

// Some warning-sign questions are phrased so that a NEGATIVE answer is the
// concern (for example "are you able to drink fluids normally?"). redFlagWhen
// records which answer triggers the flag.
function redFlagTriggered(value, question) {
  const when = question.redFlagWhen || 'yes';
  if (question.kind === 'boolean') return when === 'no' ? value === false : value === true;
  const positive = isPositive(value, question);
  return when === 'no' ? !positive : positive;
}

function recordRedFlag(state, redFlag, evidence) {
  if (!redFlag) return;
  if (state.redFlags.some((flag) => flag.id === redFlag.id)) return;
  state.redFlags.push({ id: redFlag.id, label: redFlag.label, evidence: String(evidence || '').slice(0, 300) });
  state.escalated = true;
  state.escalationReason = state.escalationReason || redFlag.label;
}

/**
 * Apply an answer. `extracted` is optional structured output from the LLM and
 * is merged after the rule-based interpretation, with rules taking priority for
 * red-flag safety.
 */
export function applyAnswer(state, questionId, answerText, extracted = null, labelOverride = null) {
  const question = questionById(questionId);
  if (!question) return state;
  const rules = interpretAnswer(question, answerText);
  const merged = { ...(extracted || {}), ...rules };
  const label = labelOverride || (typeof question.summaryLabel === 'string' ? question.summaryLabel : (question.summaryLabel.en || ''));

  state.askedQuestions.push(questionId);
  state.nextQuestionId = null;
  state.answered[questionId] = { text: String(answerText).slice(0, 2000), value: merged.value ?? null, at: new Date().toISOString() };
  state.answers.push({ questionId, label, answer: String(answerText).slice(0, 2000), at: new Date().toISOString() });
  state.transcript.push({ role: 'patient', text: String(answerText).slice(0, 2000), questionId, at: new Date().toISOString() });

  if (questionId === CHIEF_COMPLAINT_QUESTION.id) {
    state.chiefComplaint = String(answerText).slice(0, 500);
    state.complaint = classifyComplaint(answerText);
    state.complaintLabel = COMPLAINT_LABELS[state.complaint] || COMPLAINT_LABELS.default;
    return state;
  }

  switch (question.field) {
    case 'duration': state.duration = merged.value ?? state.duration; break;
    case 'severity': state.severity = typeof merged.value === 'number' ? merged.value : state.severity; break;
    case 'associatedSymptoms':
      if (Array.isArray(merged.value)) state.associatedSymptoms = merged.value.filter((item) => item !== 'none');
      break;
    default: break;
  }

  if (question.redFlag && redFlagTriggered(merged.value, question)) recordRedFlag(state, question.redFlag, answerText);
  if (extracted && Array.isArray(extracted.redFlagIds)) {
    for (const id of extracted.redFlagIds) {
      const flowing = flowFor(state.complaint).find((item) => item.redFlag && item.redFlag.id === id);
      if (flowing) recordRedFlag(state, flowing.redFlag, answerText);
    }
  }
  return state;
}

export function redFlagOptions(state) {
  const seen = new Map();
  for (const question of flowFor(state.complaint)) {
    if (question.redFlag) seen.set(question.redFlag.id, { id: question.redFlag.id, label: question.redFlag.label });
  }
  return [...seen.values()];
}

export function flagRedFlags(state, ids, evidence) {
  const options = new Map(redFlagOptions(state).map((flag) => [flag.id, flag]));
  for (const id of ids || []) {
    const option = options.get(id);
    if (option) recordRedFlag(state, option, evidence);
  }
  return state;
}

export function finalise(state) {
  if (state.escalated) {
    state.complete = false;
    return state;
  }
  const candidates = candidateQuestions(state);
  if (!candidates.length) state.complete = true;
  return state;
}

export { LEGACY_QUESTIONS, CHIEF_COMPLAINT_QUESTION };
