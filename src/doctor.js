import './doctor.css';
import { attachmentList } from './attachments.js';
import { clarificationLauncher } from './clarifications.js';

/* ------------------------------------------------------------------------- */
/* MediTrace clinician workspace                                              */
/* ------------------------------------------------------------------------- */

const state = {
  user: {},
  token: '',
  onSignOut: null,
  view: 'dashboard',
  stats: null,
  queue: [],
  selected: null,
  lastPatientId: null,
  loading: true,
  loadingPatient: false,
  error: null,
  patientError: null,
  filters: { q: '', status: 'all', priority: 'all', date: 'all' },
  expandedAi: {},
  evidenceId: null,
  modal: null,
  clarificationThreadId: null,
  clarificationTarget: null,
  decisionBusy: false,
  reviewSaving: false,
};

let appRoot = null;
const bodies = {};

const VIEW_TITLES = {
  dashboard: ['Overview', 'Your clinical review queue'],
  queue: ['Patient queue', 'Pre-visit intakes awaiting your review'],
  reviews: ['Reviewed & completed', 'Intakes you have already reviewed'],
  documents: ['Documents & reports', 'Files uploaded across patients'],
  profile: ['Profile & settings', 'Your account and data sources'],
  patient: ['Patient workspace', 'Review the intake and prepare your summary'],
};

const STATUS_META = {
  awaiting_review: ['Awaiting review', 'warn'],
  in_review: ['In review', 'info'],
  reviewed: ['Reviewed', 'ok'],
  flagged: ['Flagged', 'danger'],
  incomplete: ['Incomplete', 'muted'],
};
const PRIORITY_META = { high: ['High', 'danger'], medium: ['Medium', 'warn'], low: ['Low', 'muted'] };
const KIND_LABELS = { patient_reported: 'Patient-reported', ai_inference: 'AI inference', document: 'From document' };
const EVIDENCE_KIND = { response: 'Patient response', document: 'Uploaded document', record: 'Prior record', transcript: 'Transcript' };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name) => `<i data-lucide="${name}"></i>`;
const icons = () => { if (window.lucide) window.lucide.createIcons(); };

function initials(name) {
  const parts = String(name || '?').replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
function fmtTime(iso) { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtDateTime(iso) { if (!iso) return '—'; return `${fmtDate(iso)} · ${fmtTime(iso)}`; }
function relTime(iso) {
  if (!iso) return 'not yet';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return 'not yet';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}
const isSameDay = (a, b) => a.toDateString() === b.toDateString();

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) { if (state.onSignOut) state.onSignOut(); throw new Error('Your session has expired.'); }
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

/* ---- shell --------------------------------------------------------------- */

function shellMarkup() {
  const nav = [
    ['dashboard', 'layout-dashboard', 'Overview'],
    ['queue', 'list-checks', 'Patient queue'],
    ['reviews', 'check-check', 'Reviewed & completed'],
    ['profile', 'settings', 'Profile & settings'],
  ];
  return `
    <div class="dc-app">
      <aside class="dc-sidebar">
        <div class="dc-brand">
          <span class="dc-brand-mark">${icon('activity')}</span>
          <span>Medi<span>Trace</span></span>
          <span class="dc-brand-tag">Clinician</span>
        </div>
        <nav class="dc-nav">
          <p class="dc-nav-label">Workspace</p>
          ${nav.map(([view, ico, label]) => `
            <button type="button" data-act="nav" data-view="${view}" data-nav="${view}" aria-label="${esc(label)}" title="${esc(label)}">
              ${icon(ico)}<span>${label}</span><span class="dc-nav-count" data-count="${view}" hidden></span>
            </button>`).join('')}
        </nav>
        <div class="dc-sidefoot">
          <div class="dc-side-note">${icon('shield-check')}<span>Records shown are a mix of recorded intakes and clearly-labelled demo patients.</span></div>
          <div class="dc-doctor">
            <span class="dc-avatar">${esc(initials(state.user.name))}</span>
            <div><b>${esc(state.user.name || 'Clinician')}</b><small>${esc(state.user.specialty || 'Clinician')}</small></div>
          </div>
          <button type="button" class="dc-signout" data-act="signout">${icon('power')}<span>Sign out</span></button>
        </div>
      </aside>
      <div class="dc-main">
        <header class="dc-topbar" id="dcTopbar"></header>
        <div class="dc-view" id="dcView" tabindex="0" aria-label="Scrollable clinician workspace"></div>
      </div>
    </div>
    <div class="dc-overlay" id="dcOverlay"></div>
    <div class="dc-toast" id="dcToast"></div>`;
}

function renderTopbar() {
  const host = appRoot.querySelector('#dcTopbar');
  const [title, sub] = VIEW_TITLES[state.view] || VIEW_TITLES.dashboard;
  const heading = state.view === 'patient' && state.selected ? state.selected.name : title;
  const subtitle = state.view === 'patient' ? 'Patient workspace — review and prepare' : sub;
  host.innerHTML = `
    <div class="dc-topbar-title">
      <h1>${esc(heading)}</h1>
      <p>${esc(subtitle)}</p>
    </div>
    <div class="dc-topbar-spacer"></div>
    <button type="button" class="dc-btn ghost sm" data-act="refresh-data">${icon('refresh-cw')}Refresh data</button>
    <span class="dc-chip-date">${icon('calendar-days')}<span>${esc(fmtDate(new Date().toISOString()))}</span></span>`;
}

function renderNavCounts() {
  const counts = {
    queue: state.queue.filter((item) => item.status === 'awaiting_review' || item.status === 'in_review').length,
    reviews: state.queue.filter((item) => item.status === 'reviewed').length,
    documents: state.queue.reduce((sum, item) => sum + (item.documents?.length || 0), 0),
  };
  appRoot.querySelectorAll('[data-count]').forEach((node) => {
    const value = counts[node.dataset.count];
    node.hidden = !value;
    node.textContent = value || '';
  });
  appRoot.querySelectorAll('[data-nav]').forEach((node) => node.classList.toggle('active', node.dataset.nav === state.view || (node.dataset.nav === 'queue' && state.view === 'patient')));
}

/* ---- toast / overlay ----------------------------------------------------- */

function notify(message, tone = 'ok') {
  const toast = appRoot.querySelector('#dcToast');
  toast.className = `dc-toast${tone === 'error' ? ' error' : ''}`;
  toast.innerHTML = `${icon(tone === 'error' ? 'alert-octagon' : 'check-circle-2')}<span>${esc(message)}</span>`;
  icons();
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function renderOverlay() {
  const host = appRoot.querySelector('#dcOverlay');
  let html = '';
  if (state.evidenceId && state.selected) {
    const ev = (state.selected.evidence || []).find((item) => item.id === state.evidenceId);
    if (ev) {
      html += `
        <div class="dc-drawer-scrim" data-act="close-evidence"></div>
        <aside class="dc-drawer" role="dialog" aria-label="Source evidence">
          <div class="dc-drawer-head">
            <span class="dc-badge outline">${esc(EVIDENCE_KIND[ev.kind] || 'Evidence')}</span>
            <div class="dc-spacer"></div>
            <button type="button" class="dc-icon-btn" data-act="close-evidence" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="dc-drawer-body">
            <h3>${esc(ev.label || 'Source')}</h3>
            <p class="dc-muted" style="font-size:.78rem;margin:6px 0 14px">${esc(ev.sourceLabel || '')}${ev.date ? ` · ${esc(fmtDate(ev.date))}` : ''}</p>
            <blockquote class="dc-quote">${esc(ev.excerpt || 'No excerpt available.')}</blockquote>
            <p class="dc-muted" style="font-size:.76rem;margin-top:14px">${icon('info')} ${esc(ev.kind === 'document' ? 'Demo helper text — no real document is stored.' : 'Excerpt shown exactly as captured; it is not interpreted here.')}</p>
          </div>
        </aside>`;
    }
  }
  if (state.modal === 'approve') {
    html += `
      <div class="dc-modal-scrim" data-act="cancel-modal">
        <div class="dc-modal" role="dialog" aria-modal="true" aria-label="Confirm approval" data-modal-card>
          <div class="dc-modal-head">
            <h3>Approve this summary?</h3>
            <p>Approving marks every section as reviewed and records you as the final decision-maker. You can still edit it later, which returns it to draft.</p>
          </div>
          <div class="dc-modal-body">
            <label class="dc-muted" style="font-size:.78rem">Approval note (optional)</label>
            <textarea class="dc-note-field" data-role="approve-note" placeholder="Anything to record with this approval...">${esc(state.selected?.review?.note || '')}</textarea>
          </div>
          <div class="dc-modal-foot">
            <button type="button" class="dc-btn ghost" data-act="cancel-modal">Cancel</button>
            <button type="button" class="dc-btn primary" data-act="confirm-approve">${icon('check')}Approve summary</button>
          </div>
        </div>
      </div>`;
  }
  if (state.modal === 'clarify') {
    const thread = (state.selected?.clarifications || []).find(item => item.id === state.clarificationThreadId);
    const target = thread?.target || state.clarificationTarget;
    const targets = [...(state.selected?.clarificationTargets || [])];
    if (target && !targets.some(item => item.type === target.type && item.id === target.id)) targets.unshift(target);
    html += `
      <div class="dc-modal-scrim" data-act="cancel-modal">
        <div class="dc-modal" role="dialog" aria-modal="true" aria-label="Request clarification" data-modal-card>
          <div class="dc-modal-head">
            <h3>Request clarification</h3>
            <p>Your question will appear beside the selected item in the patient's account timeline.</p>
          </div>
          <div class="dc-modal-body">
            <label class="dc-muted" style="font-size:.78rem">Related timeline item</label>
            <select class="dc-clarify-target" data-role="clarify-target" ${thread ? 'disabled' : ''}>${targets.map(item => `<option value="${esc(item.type)}:${esc(item.id)}" ${target?.type === item.type && target?.id === item.id ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select>
            <label class="dc-muted" style="font-size:.78rem">${thread ? 'Follow-up question' : 'Question for the patient'}</label>
            <textarea class="dc-note-field" data-role="clarify-note" maxlength="2000" placeholder="e.g. Confirm whether Glimepiride is still being taken."></textarea>
          </div>
          <div class="dc-modal-foot">
            <button type="button" class="dc-btn ghost" data-act="cancel-modal">Cancel</button>
            <button type="button" class="dc-btn warn" data-act="confirm-clarify">${icon('message-circle-question')}Request clarification</button>
          </div>
        </div>
      </div>`;
  }
  host.innerHTML = html;
  icons();
}

/* ---- empty / loading ----------------------------------------------------- */

function emptyState(icoName, title, text) {
  return `<div class="dc-empty"><span class="dc-empty-ico">${icon(icoName)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}
function loadingState() {
  return `<div class="dc-skeleton">${'<span></span>'.repeat(6)}</div>`;
}

/* ---- list filtering ------------------------------------------------------ */

function filteredQueue() {
  const query = state.filters.q.trim().toLowerCase();
  const today = new Date();
  return state.queue.filter((item) => {
    if (state.view === 'reviews') {
      const reviewed = item.status === 'reviewed' || item.decision === 'approved';
      if (!reviewed) return false;
    }
    if (query) {
      const haystack = `${item.name} ${item.id} ${item.reason || ''} ${item.doctor || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (state.filters.status !== 'all' && item.status !== state.filters.status) return false;
    if (state.filters.priority !== 'all' && item.priority !== state.filters.priority) return false;
    if (state.filters.date === 'today' && !isSameDay(new Date(item.appointment), today)) return false;
    if (state.filters.date === 'upcoming' && new Date(item.appointment) < new Date(today.toDateString())) return false;
    return true;
  });
}

/* ---- dashboard ----------------------------------------------------------- */

function dashboardHtml() {
  const s = state.stats || { total: 0, awaiting: 0, reviewed: 0, flagged: 0, incomplete: 0, demo: 0 };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const next = [...state.queue]
    .filter((item) => item.status === 'awaiting_review' || item.status === 'in_review')
    .sort((a, b) => new Date(a.appointment) - new Date(b.appointment))[0];
  const attention = state.queue.filter((item) => item.highFlag || item.status === 'incomplete')
    .sort((a, b) => Number(b.highFlag) - Number(a.highFlag))
    .slice(0, 5);
  const todays = state.queue.filter((item) => isSameDay(new Date(item.appointment), new Date())).slice(0, 6);
  const statCard = (tone, icoName, value, label) => `
    <div class="dc-card dc-stat tone-${tone}">
      <div class="dc-stat-top"><span class="dc-stat-ico">${icon(icoName)}</span></div>
      <span class="dc-stat-value">${esc(value)}</span>
      <span class="dc-stat-label">${esc(label)}</span>
    </div>`;
  return `
    <div class="dc-greeting">
      <h2>${esc(greeting)}, ${esc(state.user.name || 'Doctor')}</h2>
      <p>Here is what needs your attention in the intake queue today.</p>
    </div>
    ${state.queue.some((item) => item.demo) ? `<div class="dc-demo-banner">${icon('flask-conical')}<span><b>Demo data in view.</b> Some patients below are labelled demo records generated for this prototype — they are not real people.</span></div>` : ''}
    <div class="dc-stats">
      ${statCard('default', 'users', s.total, 'Total patients')}
      ${statCard('warn', 'clock', s.awaiting, 'Awaiting review')}
      ${statCard('ok', 'circle-check', s.reviewed, 'Reviewed')}
      ${statCard('danger', 'flag', s.flagged, 'Flagged for attention')}
    </div>
    <div class="dc-dash-grid">
      <div class="dc-col">
        ${next ? `
          <div class="dc-next-cta">
            <span class="dc-next-ico">${icon('stethoscope')}</span>
            <div>
              <h3>Open next patient — ${esc(next.name)}</h3>
              <p>${esc(next.reason || 'Pre-visit intake')} · ${esc(next.id)} · ${esc(fmtTime(next.appointment))}</p>
            </div>
            <div class="dc-next-actions"><button type="button" class="dc-btn-light" data-act="open" data-id="${esc(next.id)}">${icon('arrow-right')}Review</button></div>
          </div>` : ''}
        <div class="dc-card">
          <div class="dc-card-head"><h2>Today’s queue</h2><span class="dc-card-sub">${esc(todays.length)} scheduled</span><div class="dc-card-head-spacer"></div><button type="button" class="dc-btn teal-soft sm" data-act="nav" data-view="queue">View all</button></div>
          ${todays.length ? `<div class="dc-list">${todays.map(queueRow).join('')}</div>` : emptyState('calendar-x', 'Nothing scheduled today', 'New intakes will appear here as patients submit them.')}
        </div>
      </div>
      <div class="dc-col">
        <div class="dc-card">
          <div class="dc-card-head"><h2>Needs attention</h2></div>
          <div class="dc-card-body tight">
            ${attention.length ? attention.map((item) => `
              <button type="button" class="dc-doc" style="width:100%;text-align:left;cursor:pointer;background:transparent" data-act="open" data-id="${esc(item.id)}">
                <span class="dc-doc-ico">${icon(item.status === 'incomplete' ? 'file-warning' : 'flag')}</span>
                <span style="min-width:0"><b>${esc(item.name)}</b><small>${esc(item.highFlag ? 'High-priority flag' : 'Incomplete intake')} · ${esc(item.reason || '')}</small></span>
                <span class="dc-doc-tag">${badge(PRIORITY_META[item.priority] || PRIORITY_META.medium)}</span>
              </button>`).join('') : emptyState('check-circle-2', 'All clear', 'No high-priority flags right now.')}
          </div>
        </div>
        <div class="dc-card">
          <div class="dc-card-head"><h2>How review works</h2></div>
          <div class="dc-card-body">
            <p class="dc-review-note">The AI draft is a starting point built from the patient’s own words. You review, edit and approve it — the final decision always stays with you. Nothing is diagnosed or prescribed automatically.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function badge([label, tone]) { return `<span class="dc-badge tone-${tone}">${esc(label)}</span>`; }

function queueRow(item) {
  const status = STATUS_META[item.status] || STATUS_META.awaiting_review;
  return `
    <button type="button" class="dc-row${item.demo ? ' is-demo' : ''}" data-act="open" data-id="${esc(item.id)}">
      <span class="dc-row-person">
        <span class="dc-row-avatar">${esc(initials(item.name))}</span>
        <span style="min-width:0">
          <span class="dc-row-name">${esc(item.name)}${item.demo ? ' <span class="dc-badge tone-warn" style="margin-left:6px">Demo</span>' : ''}</span>
          <span class="dc-row-meta">${esc(item.id)}${item.age ? ` · ${esc(item.age)}${item.sex ? ` ${esc(item.sex[0])}` : ''}` : ''}</span>
        </span>
      </span>
      <span class="dc-row-reason">${esc(item.reason || 'Not provided')}</span>
      <span class="dc-row-time">${esc(fmtTime(item.appointment))}</span>
      <span class="dc-row-badges">${badge(status)}${item.clarificationAnswered ? badge([`${item.clarificationAnswered} clarification answered`, 'info']) : item.clarificationPending ? badge(['Waiting for patient', 'warn']) : ''}</span>
      <span class="dc-row-badges dc-row-priority">${badge(PRIORITY_META[item.priority] || PRIORITY_META.medium)}</span>
      <span class="dc-row-go">${icon('chevron-right')}</span>
    </button>`;
}

function queueListHtml() {
  const rows = filteredQueue();
  if (!rows.length) return emptyState('search-x', 'No matching patients', 'Try adjusting your search or filters.');
  return `
    <div class="dc-card">
      <div class="dc-row dc-row-head" aria-hidden="true">
        <span>Patient</span><span class="dc-row-reason">Reason</span><span>Time</span><span>Status</span><span class="dc-row-priority">Priority</span><span></span>
      </div>
      <div class="dc-list">${rows.map(queueRow).join('')}</div>
    </div>`;
}

function toolbarHtml() {
  return `
    <div class="dc-toolbar">
      <label class="dc-search">${icon('search')}<input type="search" data-role="search" value="${esc(state.filters.q)}" placeholder="Search by name, ID or reason" aria-label="Search patients" /></label>
      <select class="dc-select" data-role="f-status" aria-label="Filter by status">
        ${[['all', 'All statuses'], ['awaiting_review', 'Awaiting review'], ['in_review', 'In review'], ['reviewed', 'Reviewed'], ['flagged', 'Flagged'], ['incomplete', 'Incomplete']]
          .map(([value, label]) => `<option value="${value}"${state.filters.status === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <select class="dc-select" data-role="f-priority" aria-label="Filter by priority">
        ${[['all', 'All priorities'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]
          .map(([value, label]) => `<option value="${value}"${state.filters.priority === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <select class="dc-select" data-role="f-date" aria-label="Filter by date">
        ${[['all', 'Any date'], ['today', 'Today'], ['upcoming', 'Today & upcoming']]
          .map(([value, label]) => `<option value="${value}"${state.filters.date === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>`;
}

function queueViewHtml() {
  return `${toolbarHtml()}<div id="dcListRegion">${queueListHtml()}</div>`;
}

/* ---- documents ----------------------------------------------------------- */

function documentsListHtml() {
  const query = state.filters.q.trim().toLowerCase();
  const entries = [];
  for (const item of state.queue) {
    for (const doc of item.documents || []) {
      if (query && !`${doc.name} ${item.name} ${doc.type}`.toLowerCase().includes(query)) continue;
      entries.push({ item, doc });
    }
  }
  if (!entries.length) return emptyState('folder-open', 'No documents found', 'Uploaded reports and prescriptions will be listed here.');
  return `<div class="dc-card"><div class="dc-card-body">
    ${entries.map(({ item, doc }) => `
      <button type="button" class="dc-doc" style="width:100%;text-align:left;cursor:pointer;background:transparent" data-act="open" data-id="${esc(item.id)}">
        <span class="dc-doc-ico">${icon('file-text')}</span>
        <span style="min-width:0"><b>${esc(doc.name)}</b><small>${esc(item.name)} · ${esc(doc.type || 'Document')} · ${esc(fmtDate(doc.uploadedAt))}</small></span>
        <span class="dc-doc-tag">${doc.demo ? badge(['Demo', 'warn']) : badge(['Recorded', 'ok'])}</span>
      </button>`).join('')}
  </div></div>`;
}
function documentsViewHtml() {
  return `${toolbarHtml()}<div id="dcListRegion">${documentsListHtml()}</div>`;
}

/* ---- profile ------------------------------------------------------------- */

function profileViewHtml() {
  const mocked = state.queue.filter((item) => item.demo).length;
  const recorded = state.queue.length - mocked;
  return `
    <div class="dc-profile-grid">
      <div class="dc-card">
        <div class="dc-card-body">
          <div class="dc-profile-photo">${esc(initials(state.user.name))}</div>
          <h2 style="margin:0 0 2px;font-size:1.1rem">${esc(state.user.name || 'Clinician')}</h2>
          <p class="dc-muted" style="margin:0 0 16px;font-size:.85rem">${esc(state.user.specialty || 'Clinician')}</p>
          <dl class="dc-dl" style="grid-template-columns:minmax(0,1fr)">
            <div><dt>Email</dt><dd>${esc(state.user.email || 'Not provided')}</dd></div>
            <div><dt>Role</dt><dd>${esc(state.user.role || 'Doctor')}</dd></div>
          </dl>
        </div>
      </div>
      <div class="dc-col">
        <div class="dc-card">
          <div class="dc-card-head"><h2>Data sources</h2><span class="dc-card-sub">Everything on screen is one of these two</span></div>
          <div class="dc-card-body">
            <div class="dc-datasource">
              <span class="dc-ds-ico">${icon('clipboard-list')}</span>
              <div><b>Recorded intakes (${recorded})</b><small>Submitted by patients through the voice intake. Stored in your local data store.</small></div>
            </div>
            <div class="dc-datasource">
              <span class="dc-ds-ico">${icon('flask-conical')}</span>
              <div><b>Demo patients (${mocked})</b><small>Generated sample records for this prototype. Clearly labelled and never mixed with a real record.</small></div>
            </div>
          </div>
        </div>
        <div class="dc-card">
          <div class="dc-card-head"><h2>Integrations</h2></div>
          <div class="dc-card-body">
            <p class="dc-review-note">Export to a hospital system is <b>not connected</b> in this prototype. The export control in each patient workspace is intentionally disabled rather than simulated.</p>
          </div>
        </div>
      </div>
    </div>`;
}

/* ---- patient workspace --------------------------------------------------- */

function evidenceById(patient, id) { return (patient.evidence || []).find((item) => item.id === id); }
function sourceChip(patient, id) {
  const ev = evidenceById(patient, id);
  if (!ev) return '';
  return `<button type="button" class="dc-src-link" data-act="evidence" data-ev="${esc(id)}">${icon('link')}${esc(ev.label || 'Source')}</button>`;
}

function overviewCard(patient) {
  const o = patient.overview || {};
  const list = (arr, render) => (arr && arr.length ? arr.map(render).join('') : '<span class="dc-not-provided">Not provided</span>');
  return `
    <details class="dc-card dc-card-details" open>
      <summary class="dc-card-head"><h2>Patient overview</h2></summary>
      <div class="dc-card-body">
        <dl class="dc-dl">
          <div><dt>Age & sex</dt><dd>${patient.age != null ? `${esc(patient.age)} · ` : ''}${esc(patient.sex || 'Not provided')}</dd></div>
          ${patient.accountProfile ? `<div><dt>Date of birth</dt><dd>${esc(patient.accountProfile.birthDate || 'Not provided')}</dd></div><div><dt>Blood group</dt><dd>${esc(patient.accountProfile.bloodGroup || 'Not provided')}</dd></div>` : ''}
          <div><dt>Location</dt><dd>${patient.city ? esc(patient.city) : '<span class="dc-not-provided">Not provided</span>'}</dd></div>
          <div><dt>Preferred language</dt><dd>${esc(patient.language || 'Not provided')}</dd></div>
          <div><dt>Contact</dt><dd>${patient.phone ? esc(patient.phone) : '<span class="dc-not-provided">Not provided</span>'}</dd></div>
          <div><dt>Appointment</dt><dd>${esc(fmtDateTime(patient.appointment))}</dd></div>
          <div><dt>Intake submitted</dt><dd>${esc(fmtDateTime(patient.submittedAt))} <span class="dc-muted">(${esc(relTime(patient.submittedAt))})</span></dd></div>
        </dl>
        <div style="margin-top:18px">
          <dt style="font-size:.71rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dc-muted);margin-bottom:6px">Chief complaint</dt>
          <p style="margin:0;font-size:.92rem;line-height:1.55">${o.chiefComplaint ? esc(o.chiefComplaint) : '<span class="dc-not-provided">Not provided</span>'}</p>
        </div>
        <div style="margin-top:18px" class="dc-dl">
          <div><dt>Allergies</dt><dd>${list(o.allergies, (a) => `${esc(a.name)} <span class="dc-muted">(${esc(a.reaction)})</span>`)}</dd></div>
          <div><dt>Conditions</dt><dd>${list(o.conditions, (c) => `${esc(c.name)}${c.since ? ` <span class="dc-muted">since ${esc(c.since)}</span>` : ''}${c.source ? ` <span class="dc-muted">(${esc(c.source)})</span>` : ''}`)}</dd></div>
          <div><dt>Current medications</dt><dd>${list(o.medications, (m) => `${esc(m.name)} ${esc(m.dose)} <span class="dc-muted">· ${esc(m.frequency)}</span>`)}</dd></div>
          <div><dt>Notes</dt><dd>${o.notes ? esc(o.notes) : '<span class="dc-not-provided">Not provided</span>'}</dd></div>
        </div>
        ${patient.accountProfile ? `<p class="dc-review-note">Account profile is patient-reported and shared across this patient's conversations.${patient.accountProfile.updatedAt ? ` Last updated ${esc(fmtDateTime(patient.accountProfile.updatedAt))}.` : ' No profile details saved yet.'}</p>` : ''}
      </div>
    </details>`;
}

function summaryCard(patient) {
  const approved = patient.review?.decision === 'approved';
  const sections = patient.summary?.sections || [];
  const body = sections.map((section) => {
    const review = section.review || { status: 'pending', doctorText: null };
    const edited = review.doctorText != null && review.doctorText !== section.body;
    const value = review.doctorText != null ? review.doctorText : section.body;
    bodies[section.id] = section.body;
    const tag = approved ? badge(['Approved', 'ok']) : edited ? badge(['Edited', 'info']) : badge(['AI draft', 'muted']);
    const reviewed = review.status === 'reviewed';
    const showAiToggle = review.doctorText != null && review.doctorText !== section.body;
    return `
      <div class="dc-section-block" data-sec-block="${esc(section.id)}" data-reviewed="${reviewed}">
        <div class="dc-section-top">
          <h3>${esc(section.title)}</h3>
          ${tag}
          <span class="dc-spacer"></span>
          <button type="button" class="dc-btn ${reviewed ? 'teal-soft' : 'ghost'} sm" data-act="toggle-reviewed" aria-pressed="${reviewed}" data-sec="${esc(section.id)}">${icon(reviewed ? 'check' : 'circle')}${reviewed ? 'Reviewed' : 'Mark reviewed'}</button>
        </div>
        <textarea class="dc-sec-edit${edited ? ' edited' : ''}" data-sec="${esc(section.id)}" spellcheck="false">${esc(value)}</textarea>
        <div class="dc-sec-actions">
          ${(section.sources || []).map((id) => sourceChip(patient, id)).join('')}
          ${(section.sources || []).length ? '' : '<span class="dc-muted" style="font-size:.74rem">No linked source for this section.</span>'}
          ${showAiToggle ? `<button type="button" class="dc-src-link" style="margin-left:auto" data-act="toggle-ai" data-sec="${esc(section.id)}">${icon('history')}View AI draft</button>` : ''}
        </div>
        ${showAiToggle ? `<div class="dc-ai-draft" data-ai="${esc(section.id)}" hidden><b>Original AI draft</b>${esc(section.body)}</div>` : ''}
      </div>`;
  }).join('');
  return `
    <details class="dc-card dc-card-details">
      <summary class="dc-card-head">
        <h2>Clinical summary</h2>
        <span class="dc-card-sub">${esc(patient.summary?.model || 'AI draft')} · generated ${esc(relTime(patient.summary?.generatedAt))}</span>
      </summary>
      <div>${body || emptyState('file-question', 'No summary sections', 'This intake did not produce summary sections.')}</div>
    </details>`;
}

function timelineCard(patient) {
  const items = patient.timeline || [];
  return `
    <details class="dc-card dc-card-details">
      <summary class="dc-card-head"><h2>Medical timeline</h2><span class="dc-card-sub">${esc(items.length)} event${items.length === 1 ? '' : 's'}</span></summary>
      <div class="dc-card-body">
        ${items.length ? `<ul class="dc-timeline">${items.map((event) => `
          <li>
            <span class="dc-tl-date">${esc(event.date && /^\d{4}(-\d{2})?$/.test(event.date) ? event.date : fmtDate(event.date))}</span>
            <div class="timeline-item-heading"><p class="dc-tl-title">${esc(event.title)}</p><div class="dc-timeline-clarifications" data-target-type="${esc(event.clarificationTarget?.type || '')}" data-target-id="${esc(event.clarificationTarget?.id || '')}">${clarificationLauncher(event.clarifications)}</div></div>
            <p class="dc-tl-detail">${esc(event.detail)}</p>
            ${attachmentList(event.attachments)}
            ${patient.accountLinked && event.clarificationTarget ? `<button type="button" class="dc-src-link" data-act="clarify-item" data-target-type="${esc(event.clarificationTarget.type)}" data-target-id="${esc(event.clarificationTarget.id)}">Ask about this item</button>` : ''}
            <span class="dc-tl-src">${icon('link')} ${esc(event.sourceLabel || 'Source')}${event.evidenceId ? ` · <button type="button" class="dc-src-link" style="padding:0;border:0;background:none" data-act="evidence" data-ev="${esc(event.evidenceId)}">view</button>` : ''}</span>
          </li>`).join('')}</ul>` : '<p class="dc-not-provided">No timeline events recorded.</p>'}
      </div>
    </details>`;
}

function documentsCard(patient) {
  const docs = patient.documents || [];
  return `
    <div class="dc-card">
      <div class="dc-card-head"><h2>Documents & reports</h2><span class="dc-card-sub">${esc(docs.length)} file${docs.length === 1 ? '' : 's'}</span></div>
      <div class="dc-card-body">
        ${docs.length ? docs.map((doc) => `
          <div class="dc-doc">
            <span class="dc-doc-ico">${icon('file-text')}</span>
            <div><b>${esc(doc.name)}</b><small>${esc(doc.type || 'Document')} · uploaded ${esc(fmtDate(doc.uploadedAt))} · ${esc(doc.source || '')}</small></div>
            <span class="dc-doc-tag">${doc.demo ? badge(['Demo', 'warn']) : badge(['Recorded', 'ok'])}</span>
            ${doc.mimeType ? `<button type="button" class="attachment-button" data-download-attachment="${esc(doc.id)}" data-attachment-name="${esc(doc.name)}">Download</button>` : ''}
          </div>`).join('') : '<p class="dc-not-provided">No documents uploaded with this intake.</p>'}
      </div>
    </div>`;
}

function reviewPanel(patient) {
  const review = patient.review || { decision: null, note: '', updatedAt: null };
  const decision = review.decision;
  const status = decision === 'approved'
    ? ['Summary approved', 'ok', 'circle-check']
    : decision === 'clarification_requested'
      ? ['Clarification requested', 'warn', 'message-circle-question']
      : decision === 'clarification_answered'
        ? ['Patient answered · review clarification', 'info', 'message-circle-check']
      : decision === 'draft'
        ? ['Draft saved', 'warn', 'pencil-line']
        : ['Not reviewed yet', 'warn', 'clock'];
  const sections = patient.summary?.sections || [];
  const reviewed = sections.filter((section) => section.review?.status === 'reviewed').length;
  return `
    <div class="dc-card">
      <div class="dc-card-head"><h2>Review & decision</h2></div>
      <div class="dc-card-body">
        <div class="dc-review-status ${status[1]}">${icon(status[2])}<span>${esc(status[0])}</span></div>
        <p class="dc-review-note">You hold the final decision. Approve when the summary is accurate, or request clarification to flag what you still need.</p>
        <label class="dc-muted" style="display:block;font-size:.76rem;margin-top:14px">Review note</label>
        <textarea class="dc-note-field" data-role="review-note" placeholder="Add context for your team (optional)">${esc(review.note || '')}</textarea>
        <div class="dc-review-actions">
          <button type="button" class="dc-btn ghost" data-act="save-draft">${icon('save')}Save draft</button>
          <button type="button" class="dc-btn primary" data-act="approve-ask"${reviewed === 0 && sections.length ? '' : ''}>${icon('check')}Approve summary</button>
          <button type="button" class="dc-btn warn" data-act="clarify-ask" ${patient.accountLinked ? '' : 'disabled title="Requires an account-linked recorded intake"'}>${icon('message-circle-question')}Request clarification</button>
          <button type="button" class="dc-btn ghost" disabled title="Hospital export is not configured in this prototype">${icon('upload')}Export to HIS (not connected)</button>
        </div>
        <div class="dc-mini-meta"><span data-review-count>${esc(reviewed)} of ${esc(sections.length)} sections reviewed</span><span>${esc(review.updatedAt ? `updated ${relTime(review.updatedAt)}` : 'no changes yet')}</span></div>
      </div>
    </div>`;
}

function flagsCard(patient) {
  const flags = patient.flags || [];
  return `
    <div class="dc-card">
      <div class="dc-card-head"><h2>Attention flags</h2><span class="dc-card-sub">${esc(flags.length)}</span></div>
      <div class="dc-card-body">
        ${flags.length ? flags.map((flag) => `
          <div class="dc-flag sev-${esc(flag.severity || 'low')}">
            <div class="dc-flag-top">${icon(flag.severity === 'high' ? 'alert-triangle' : flag.severity === 'medium' ? 'alert-circle' : 'info')}<h4>${esc(flag.title)}</h4></div>
            <p>${esc(flag.detail)}</p>
            <p class="dc-flag-why">${esc(flag.why)}</p>
            <div class="dc-flag-foot">
              <span class="dc-badge ${flag.kind === 'ai_inference' ? 'tone-info' : flag.kind === 'document' ? 'tone-warn' : 'tone-danger'}">${esc(KIND_LABELS[flag.kind] || 'Flag')}</span>
              <span class="dc-muted" style="font-size:.74rem">${esc(flag.sourceLabel || '')}</span>
              ${flag.evidenceId ? `<button type="button" class="dc-src-link" style="margin-left:auto" data-act="evidence" data-ev="${esc(flag.evidenceId)}">${icon('link')}View source</button>` : ''}
            </div>
          </div>`).join('') : emptyState('shield-check', 'No flags', 'The intake did not raise any attention flags.')}
      </div>
    </div>`;
}

function clarificationCard(patient) {
  const items = patient.clarification || [];
  return `
    <div class="dc-card">
      <div class="dc-card-head"><h2>Questions to clarify</h2><span class="dc-card-sub">AI-suggested</span></div>
      <div class="dc-card-body">
        ${items.length ? items.map((item) => `
          <div class="dc-flag" style="border-left-color:var(--dc-blue)">
            <div class="dc-flag-top">${icon('help-circle')}<h4>${esc(item.about || 'Question')}</h4></div>
            <p>${esc(item.question)}</p>
            ${item.evidenceId ? `<div class="dc-flag-foot"><button type="button" class="dc-src-link" data-act="evidence" data-ev="${esc(item.evidenceId)}">${icon('link')}View source</button></div>` : ''}
          </div>`).join('') : '<p class="dc-not-provided">No clarification questions were raised by the intake.</p>'}
      </div>
    </div>`;
}

let clarificationPollBusy = false;
async function pollDoctorClarifications() {
  if (document.hidden || clarificationPollBusy || state.view !== 'patient' || !state.selected?.accountLinked) return;
  const id = state.selected.id;
  clarificationPollBusy = true;
  try {
    const data = await api(`/api/doctor/patients/${encodeURIComponent(id)}/clarifications`);
    if (state.selected?.id !== id) return;
    if (JSON.stringify(state.selected.clarifications || []) === JSON.stringify(data.threads)) return;
    state.selected.clarifications = data.threads;
    appRoot.querySelectorAll('.dc-timeline-clarifications').forEach(host => {
      host.innerHTML = clarificationLauncher(data.threads.filter(thread => thread.target.type === host.dataset.targetType && thread.target.id === host.dataset.targetId));
    });
  } catch { /* Retain existing messages when temporarily offline. */ }
  finally { clarificationPollBusy = false; }
}
setInterval(pollDoctorClarifications, 15000);

function patientViewHtml() {
  const patient = state.selected;
  if (state.loadingPatient || !patient) return loadingState();
  if (state.patientError) {
    return `<div class="dc-card"><div class="dc-card-body">${emptyState('alert-octagon', 'Could not load this patient', state.patientError)}<div style="text-align:center"><button type="button" class="dc-btn teal-soft sm" data-act="retry-patient">Try again</button></div></div></div>`;
  }
  const approved = patient.review?.decision === 'approved';
  return `
    <div class="dc-patient-head">
      <button type="button" class="dc-back" data-act="back" aria-label="Back">${icon('arrow-left')}</button>
      <div class="dc-ph-title">
        <h2>${esc(patient.name)}</h2>
        <div class="dc-ph-badges">
          ${badge([patient.id, 'outline'])}
          ${patient.demo ? badge(['Demo record', 'warn']) : badge(['Recorded intake', 'ok'])}
          ${badge(STATUS_META[patient.status] || STATUS_META.awaiting_review)}
          ${badge(PRIORITY_META[patient.priority] || PRIORITY_META.medium)}
        </div>
      </div>
      <div class="dc-patient-actions">
        <button type="button" class="dc-btn ghost sm" disabled title="Hospital export is not configured in this prototype">${icon('upload')}Export to HIS (not connected)</button>
      </div>
    </div>
    ${patient.demo ? `<div class="dc-demo-strip" style="margin-bottom:16px">${icon('flask-conical')}<span>This is a <b>fictional demo record</b> generated for the prototype. It does not describe a real person.</span></div>` : ''}
    <div class="dc-workspace">
      <div class="dc-col">
        ${overviewCard(patient)}
        ${summaryCard(patient)}
        ${timelineCard(patient)}
        ${documentsCard(patient)}
      </div>
      <div class="dc-col">
        ${reviewPanel(patient)}
        ${flagsCard(patient)}
        ${clarificationCard(patient)}
      </div>
    </div>`;
}

/* ---- rendering ----------------------------------------------------------- */

function currentViewHtml() {
  if (state.view === 'dashboard') return dashboardHtml();
  if (state.view === 'queue') return queueViewHtml();
  if (state.view === 'reviews') return queueViewHtml();
  if (state.view === 'documents') return documentsViewHtml();
  if (state.view === 'profile') return profileViewHtml();
  if (state.view === 'patient') return patientViewHtml();
  return '';
}

function renderView() {
  const host = appRoot.querySelector('#dcView');
  if (state.error) {
    host.innerHTML = `<div class="dc-card"><div class="dc-card-body">${emptyState('plug-zap', 'Could not reach the clinical service', state.error)}<div style="text-align:center"><button type="button" class="dc-btn teal-soft sm" data-act="reload">Reload</button></div></div></div>`;
    icons();
    return;
  }
  if (state.loading && state.view !== 'patient') { host.innerHTML = loadingState(); icons(); return; }
  host.innerHTML = currentViewHtml();
  icons();
  autosizeAll();
}

function renderAll() {
  renderTopbar();
  renderNavCounts();
  renderView();
  renderOverlay();
}

function autosize(el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
function autosizeAll() { appRoot.querySelectorAll('.dc-sec-edit').forEach(autosize); }

/* ---- data ---------------------------------------------------------------- */

async function refresh() {
  state.loading = true; state.error = null; renderAll();
  try {
    const data = await api('/api/doctor/overview');
    state.stats = data.stats;
    state.queue = data.queue || [];
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    renderAll();
  }
}

function collectSections() {
  const payload = [];
  appRoot.querySelectorAll('[data-sec-block]').forEach((block) => {
    const id = block.dataset.secBlock;
    const textarea = block.querySelector('.dc-sec-edit');
    const value = textarea ? textarea.value : '';
    const original = bodies[id] || '';
    payload.push({
      id,
      doctorText: value.trim() === original.trim() ? null : value,
      status: block.dataset.reviewed === 'true' ? 'reviewed' : 'pending',
    });
  });
  return payload;
}

function applyReview(review) {
  if (!state.selected) return;
  state.selected.review = { decision: review.decision || null, note: review.note || '', updatedAt: review.updatedAt || null, approvedAt: review.approvedAt || null };
  state.selected.summary.sections = state.selected.summary.sections.map((section) => ({ ...section, review: review.sections?.[section.id] || { status: 'pending', doctorText: null, updatedAt: null } }));
}

async function openPatient(id) {
  state.view = 'patient';
  state.selected = null;
  state.lastPatientId = id;
  state.loadingPatient = true;
  state.patientError = null;
  state.evidenceId = null;
  renderAll();
  try {
    const data = await api(`/api/doctor/patients/${encodeURIComponent(id)}`);
    state.selected = data.patient;
  } catch (error) {
    state.patientError = error.message;
  } finally {
    state.loadingPatient = false;
    renderAll();
  }
}

async function saveDraft() {
  if (state.reviewSaving) { notify('Please wait for the section review to finish saving.'); return; }
  if (!state.selected) return;
  const note = appRoot.querySelector('[data-role="review-note"]')?.value || '';
  try {
    const { review } = await api(`/api/doctor/patients/${encodeURIComponent(state.selected.id)}/summary`, { method: 'PUT', body: JSON.stringify({ sections: collectSections() }) });
    applyReview(review);
    renderAll();
    notify('Draft saved');
  } catch (error) { notify(error.message, 'error'); }
}

async function submitDecision(action, note) {
  if (!state.selected || state.decisionBusy || state.reviewSaving) return;
  state.decisionBusy = true;
  const patientId = state.selected.id;
  try {
    const selectedTarget = appRoot.querySelector('[data-role="clarify-target"]')?.value;
    const [type, id] = (selectedTarget || '').split(':');
    const { review } = await api(`/api/doctor/patients/${encodeURIComponent(patientId)}/decision`, { method: 'POST', body: JSON.stringify({ action, note, ...(action === 'clarification' ? { threadId: state.clarificationThreadId || undefined, target: type && id ? { type, id } : undefined } : {}) }) });
    applyReview(review);
    state.modal = null;
    await openPatient(patientId);
    notify(action === 'approve' ? 'Summary approved' : action === 'clarification' ? 'Clarification requested' : 'Draft saved');
    if (action !== 'draft') refresh();
  } catch (error) { notify(error.message, 'error'); }
  finally { state.decisionBusy = false; }
}

/* ---- events -------------------------------------------------------------- */

function switchView(view) { state.view = view; state.error = null; state.evidenceId = null; state.modal = null; renderAll(); }

async function saveReviewedSection(button) {
  if (!state.selected || state.reviewSaving || state.decisionBusy) return;
  const patientId = state.selected.id;
  const block = button.closest('[data-sec-block]');
  const wasApproved = state.selected.review?.decision === 'approved';
  const section = collectSections().find(item => item.id === button.dataset.sec);
  if (!section) return;
  const reviewed = block.dataset.reviewed !== 'true';
  section.status = reviewed ? 'reviewed' : 'pending';
  state.reviewSaving = true;
  button.disabled = true;
  const oldLabel = button.innerHTML;
  button.textContent = 'Saving…';
  try {
    const { review } = await api(`/api/doctor/patients/${encodeURIComponent(patientId)}/summary`, { method: 'PUT', body: JSON.stringify({ sections: [section] }) });
    if (state.selected?.id !== patientId) return;
    applyReview(review);
    if (wasApproved && review.decision !== 'approved') {
      const status = appRoot.querySelector('.dc-review-status');
      if (status) { status.className = 'dc-review-status'; status.innerHTML = `${icon('pencil-line')}<span>Draft · section review updated</span>`; }
      appRoot.querySelectorAll('[data-sec-block]').forEach(sectionBlock => {
        const tag = sectionBlock.querySelector('.dc-section-top .dc-badge');
        const edited = sectionBlock.querySelector('.dc-sec-edit').value.trim() !== (bodies[sectionBlock.dataset.secBlock] || '').trim();
        if (tag) { tag.className = `dc-badge tone-${edited ? 'info' : 'muted'}`; tag.textContent = edited ? 'Edited' : 'AI draft'; }
      });
    }
    block.dataset.reviewed = String(reviewed);
    button.className = `dc-btn ${reviewed ? 'teal-soft' : 'ghost'} sm`;
    button.innerHTML = `${icon(reviewed ? 'check' : 'circle')}${reviewed ? 'Reviewed' : 'Mark reviewed'}`;
    button.setAttribute('aria-pressed', String(reviewed));
    const count = appRoot.querySelector('[data-review-count]');
    if (count) count.textContent = `${state.selected.summary.sections.filter(item => item.review.status === 'reviewed').length} of ${state.selected.summary.sections.length} sections reviewed`;
    notify(reviewed ? 'Section marked reviewed and saved' : 'Section marked pending and saved');
    icons();
  } catch (error) { button.innerHTML = oldLabel; notify(error.message, 'error'); }
  finally { button.disabled = false; state.reviewSaving = false; }
}

function bind(root) {
  root.addEventListener('toggle', event => {
    if (event.target.matches('.dc-card-details') && event.target.open) autosizeAll();
  }, true);
  root.addEventListener('click', (event) => {
    const modalCard = event.target.closest('[data-modal-card]');
    const action = event.target.closest('[data-act]');
    if (!action) return;
    if (modalCard && !modalCard.contains(action)) return;
    const act = action.dataset.act;
    switch (act) {
      case 'refresh-data': {
        const changed = state.view === 'patient' && state.selected && collectSections().some(section => {
          const saved = state.selected.summary.sections.find(item => item.id === section.id)?.review;
          return section.doctorText !== (saved?.doctorText ?? null) || section.status !== (saved?.status || 'pending');
        });
        if (changed && !window.confirm('Discard unsaved review edits and load the latest patient data?')) break;
        if (state.view === 'patient' && state.lastPatientId) openPatient(state.lastPatientId); else refresh();
        break;
      }
      case 'nav': switchView(action.dataset.view); break;
      case 'open': openPatient(action.dataset.id); break;
      case 'back': switchView('queue'); break;
      case 'reload':
      case 'retry-patient': if (state.view === 'patient' && state.lastPatientId) openPatient(state.lastPatientId); else refresh(); break;
      case 'signout': if (state.onSignOut) state.onSignOut(); break;
      case 'toggle-reviewed': {
        saveReviewedSection(action);
        break;
      }
      case 'toggle-ai': {
        const pane = appRoot.querySelector(`[data-ai="${action.dataset.sec}"]`);
        if (pane) { pane.hidden = !pane.hidden; action.innerHTML = `${icon('history')}${pane.hidden ? 'View AI draft' : 'Hide AI draft'}`; icons(); }
        break;
      }
      case 'evidence': state.evidenceId = action.dataset.ev; renderOverlay(); break;
      case 'close-evidence': state.evidenceId = null; renderOverlay(); break;
      case 'save-draft': saveDraft(); break;
      case 'approve-ask': state.modal = 'approve'; renderOverlay(); break;
      case 'clarify-ask': state.clarificationThreadId = null; state.clarificationTarget = null; state.modal = 'clarify'; renderOverlay(); break;
      case 'clarify-item': state.clarificationThreadId = null; state.clarificationTarget = { type: action.dataset.targetType, id: action.dataset.targetId, label: 'Timeline item' }; state.modal = 'clarify'; renderOverlay(); break;
      case 'clarify-followup': state.clarificationThreadId = action.dataset.threadId; state.clarificationTarget = null; state.modal = 'clarify'; renderOverlay(); break;
      case 'approve-clarification': {
        if (state.decisionBusy) break;
        state.decisionBusy = true;
        api(`/api/doctor/patients/${encodeURIComponent(state.selected.id)}/clarifications/${encodeURIComponent(action.dataset.threadId)}/approve`, { method: 'POST' }).then(() => pollDoctorClarifications()).then(() => notify('Clarification approved')).catch(error => notify(error.message, 'error')).finally(() => { state.decisionBusy = false; });
        break;
      }
      case 'cancel-modal': state.modal = null; renderOverlay(); break;
      case 'confirm-approve': submitDecision('approve', appRoot.querySelector('[data-role="approve-note"]')?.value || ''); break;
      case 'confirm-clarify': submitDecision('clarification', appRoot.querySelector('[data-role="clarify-note"]')?.value || ''); break;
      case 'export': notify('Hospital export is not configured in this prototype.', 'error'); break;
      default: break;
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-role="search"]')) {
      state.filters.q = target.value;
      const region = appRoot.querySelector('#dcListRegion');
      if (region) { region.innerHTML = state.view === 'documents' ? documentsListHtml() : queueListHtml(); icons(); }
      return;
    }
    if (target.matches('.dc-sec-edit')) {
      const original = (bodies[target.dataset.sec] || '').trim();
      target.classList.toggle('edited', target.value.trim() !== original);
      autosize(target);
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-role="f-status"]')) state.filters.status = target.value;
    else if (target.matches('[data-role="f-priority"]')) state.filters.priority = target.value;
    else if (target.matches('[data-role="f-date"]')) state.filters.date = target.value;
    else return;
    const region = appRoot.querySelector('#dcListRegion');
    if (region) { region.innerHTML = state.view === 'documents' ? documentsListHtml() : queueListHtml(); icons(); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (state.evidenceId || state.modal)) { state.evidenceId = null; state.modal = null; renderOverlay(); }
  });
}

/* ---- entry --------------------------------------------------------------- */

export function startDoctorApp(user, options = {}) {
  appRoot = document.getElementById('doctorRoot');
  if (!appRoot) return;
  state.user = user || {};
  state.token = options.token || '';
  state.onSignOut = options.onSignOut || (() => window.location.reload());
  document.body.classList.add('is-doctor');
  appRoot.hidden = false;
  appRoot.innerHTML = shellMarkup();
  icons();
  bind(appRoot);
  state.view = 'dashboard';
  renderAll();
  refresh();
}
