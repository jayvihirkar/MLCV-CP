import { accountTimeline } from './profile.mjs';

export function addAccountProfile(record, session, profiles, sessions) {
  if (!session.userId) return record;
  const profile = profiles[session.userId] || { details: {}, history: [] };
  const details = profile.details || {};
  record.accountProfile = { ...details, updatedAt: profile.updatedAt || null };
  record.accountLinked = true;
  record.clarifications = profile.clarifications || [];
  record.clarificationTargets = [{ type: 'profile', id: 'profile', label: 'Patient profile' }, ...(profile.history || []).map(item => ({ type: 'history', id: item.id, label: item.title })), ...sessions.filter(item => item.userId === session.userId).map(item => ({ type: 'intake', id: item.id, label: item.triage?.chiefComplaint || 'Intake conversation' }))];
  record.sex = details.sex || record.sex;
  record.phone = details.phone || record.phone;
  if (details.birthDate) {
    const birth = new Date(`${details.birthDate}T00:00:00Z`);
    const today = new Date();
    const birthdayPending = today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
    const age = today.getUTCFullYear() - birth.getUTCFullYear() - Number(birthdayPending);
    if (Number.isFinite(age) && age >= 0) record.age = age;
  }
  const merge = (items, text, extra) => text && !(items || []).some(item => item.name.toLowerCase() === text.toLowerCase()) ? [...(items || []), { name: text, ...extra }] : (items || []);
  record.overview.allergies = merge(record.overview.allergies, details.allergies, { reaction: 'Patient-reported account profile' });
  record.overview.medications = merge(record.overview.medications, details.medications, { dose: '', frequency: 'Patient-reported account profile' });
  record.overview.conditions = merge(record.overview.conditions, details.conditions, { since: '', source: 'Patient-reported account profile' });
  record.overview.notes = [record.overview.notes, details.notes ? `Account profile: ${details.notes}` : ''].filter(Boolean).join('\n');
  record.timeline = accountTimeline(profile, sessions, session.userId).map(item => ({
    id: item.source === 'patient' ? `history-${item.id}` : `intake-${item.id}`,
    date: item.date, type: item.kind, title: item.title, detail: item.notes,
    sourceLabel: item.source === 'patient' ? 'Patient-reported account history' : 'Saved intake conversation',
    evidenceId: item.source === 'patient' ? `ev-history-${item.id}` : null,
    attachments: item.attachments || [],
    clarifications: item.clarifications || [],
    clarificationTarget: { type: item.source === 'patient' ? 'history' : item.source === 'intake' ? 'intake' : 'profile', id: item.source === 'clarification' ? 'profile' : item.id },
  }));
  const attachments = (profile.history || []).flatMap(event => (event.attachments || []).map(item => ({ ...item, type: item.mimeType, demo: false, source: `Patient-uploaded account history: ${event.title}`, historyId: event.id })));
  record.documents = [...record.documents, ...attachments];
  record.intake.documents = record.documents;
  for (const event of profile.history || []) record.evidence.push({ id: `ev-history-${event.id}`, label: event.title, kind: 'response', sourceLabel: 'Patient-reported account history', date: event.date || null, excerpt: event.notes || event.title });
  return record;
}
