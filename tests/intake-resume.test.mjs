import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { docxFixture } from './docx-fixture.mjs';

test('saved intake survives login and server restart, and rejects other accounts', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'meditrace-resume-'));
  let server;
  let base;
  async function start() {
    server = spawn(process.execPath, [join(fixture, 'server/index.mjs')], {
      env: { ...process.env, PORT: '0', GEMINI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = await Promise.race([
      once(server.stdout, 'data').then(([chunk]) => String(chunk)),
      once(server, 'exit').then(([code]) => { throw new Error(`Server exited: ${code}`); }),
    ]);
    base = `http://localhost:${output.match(/:(\d+)/)[1]}`;
  }
  async function stop() {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
    server = null;
  }
  async function request(path, token, method = 'GET', body) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  }
  async function login(email) {
    const response = await request('/api/auth/login', '', 'POST', { email, password: 'meditrace123' });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  }
  async function uploadHistory(id, token, files) {
    const body = new FormData();
    body.set('title', 'Previous surgery'); body.set('kind', 'surgery'); body.set('date', '2020');
    for (const file of files) body.append('attachments', new Blob([file.bytes], { type: file.type }), file.name);
    return fetch(`${base}/api/profile/history/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body });
  }
  try {
    await cp(new URL('../server', import.meta.url), join(fixture, 'server'), { recursive: true });
    const attachmentsEntry = join(fixture, 'server/attachments.mjs');
    await writeFile(attachmentsEntry, (await readFile(attachmentsEntry, 'utf8')).replace("from 'multer'", `from '${import.meta.resolve('multer')}'`));
    const entry = join(fixture, 'server/index.mjs');
    let source = await readFile(entry, 'utf8');
    for (const dependency of ['express', 'multer']) source = source.replace(`from '${dependency}'`, `from '${import.meta.resolve(dependency)}'`);
    source = source.replace('http://localhost:${port}', 'http://localhost:${appServer.address().port}').replace('app.listen(port,', 'const appServer = app.listen(port,');
    await writeFile(entry, source);
    await start();
    let patient = await login('ramesh.patel@example.com');
    assert.equal((await request('/api/profile', '')).status, 401);
    assert.equal((await request('/api/profile', patient, 'PUT', { birthDate: '2000-01-01', sex: 'Female', bloodGroup: 'O+', conditions: 'Asthma', allergies: 'Penicillin', medications: 'Profile medication', notes: 'Profile notes', phone: '1234567890' })).status, 200);
    assert.equal((await request('/api/profile/history', patient, 'POST', { title: 'Previous surgery', kind: 'surgery', date: '2020', notes: 'Patient-reported history' })).status, 201);
    assert.equal((await request('/api/profile/history', patient, 'POST', { title: 'Invalid event', kind: 'surgery', date: '2020-02-30' })).status, 400);
    const initialProfile = await (await request('/api/profile', patient)).json();
    const historyId = initialProfile.history[0].id;
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const proofFiles = [
      { name: 'report.pdf', type: 'application/pdf', bytes: pdfBytes },
      { name: 'photo.png', type: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64') },
      { name: 'letter.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: docxFixture() },
    ];
    assert.equal((await uploadHistory(historyId, patient, proofFiles)).status, 200);
    const attachedProfile = await (await request('/api/profile', patient)).json();
    const attached = attachedProfile.history[0].attachments;
    assert.equal(attached.length, 3);
    const downloaded = await request(`/api/profile/attachments/${attached[0].id}`, patient);
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdfBytes);
    assert.ok(downloaded.headers.get('content-disposition').includes('report.pdf'));
    assert.equal((await uploadHistory(historyId, patient, [{ name: 'wrong.png', type: 'image/png', bytes: pdfBytes }])).status, 400);
    assert.equal((await uploadHistory(historyId, patient, [{ name: 'script.html', type: 'text/html', bytes: Buffer.from('<script></script>') }])).status, 400);
    assert.equal((await uploadHistory(historyId, patient, Array.from({ length: 11 }, () => proofFiles[0]))).status, 400);
    assert.equal((await uploadHistory(historyId, patient, [{ ...proofFiles[0], bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }])).status, 400);
    const fixtureUsers = JSON.parse(await readFile(join(fixture, 'data/users.json'), 'utf8'));
    fixtureUsers.push({ ...fixtureUsers.find(user => user.role === 'Patient'), id: 'another-patient', email: 'another@example.com' });
    await writeFile(join(fixture, 'data/users.json'), JSON.stringify(fixtureUsers));
    const anotherPatient = await login('another@example.com');
    assert.equal((await request(`/api/profile/attachments/${attached[0].id}`, anotherPatient)).status, 404);
    assert.equal((await request(`/api/profile/attachments/${attached[0].id}`, '')).status, 401);
    assert.equal((await request(`/api/profile/history/${historyId}/attachments/${attached[0].id}`, anotherPatient, 'DELETE')).status, 404);
    const separateProfile = await (await request('/api/profile', anotherPatient)).json();
    assert.equal(separateProfile.history.length, 0);
    assert.equal(separateProfile.details.conditions, undefined);
    assert.equal((await request(`/api/profile/history/${historyId}`, anotherPatient, 'PUT', { title: 'Overwrite', kind: 'other' })).status, 404);
    assert.equal((await request(`/api/profile/history/${historyId}`, anotherPatient, 'DELETE')).status, 404);
    const created = await request('/api/sessions', patient, 'POST', { locale: 'en-IN', patient: 'Resume test' });
    assert.equal(created.status, 201);
    const session = await created.json();
    const firstChatList = await (await request('/api/conversations', patient)).json();
    assert.equal(firstChatList.firstChat, true);
    const createdGroup = await (await request('/api/conversations/groups', patient, 'POST', { name: 'Visits' })).json();
    const groupId = createdGroup.group.id;
    assert.equal((await request(`/api/conversations/${session.id}`, patient, 'PUT', { title: 'Fever follow-up', groupId })).status, 200);
    assert.equal((await request(`/api/conversations/${session.id}`, anotherPatient, 'PUT', { title: 'Not mine' })).status, 404);
    assert.equal((await request(`/api/conversations/groups/${groupId}`, anotherPatient, 'PUT', { name: 'Not mine' })).status, 404);
    assert.equal((await request(`/api/conversations/groups/${groupId}`, anotherPatient, 'DELETE')).status, 404);
    assert.equal((await (await request('/api/conversations', anotherPatient)).json()).groups.length, 0);
    const path = `/api/sessions/${session.id}`;
    const initial = await (await request(`${path}/triage`, patient)).json();
    const turn = await request(`${path}/turn`, patient, 'POST', { questionId: initial.question.id, answer: 'I have a fever' });
    assert.equal(turn.status, 200);
    const next = await turn.json();
    assert.equal(next.answered[0].answer, 'I have a fever');
    const other = await login('doctor@meditrace.health');
    assert.equal((await request('/api/doctor/overview', patient)).status, 403);
    const doctorPath = `/api/doctor/patients/INTAKE-${session.id.slice(0, 8)}`;
    const doctorRecord = (await (await request(doctorPath, other)).json()).patient;
    assert.equal(doctorRecord.documents.length, 3);
    assert.ok(doctorRecord.timeline.some(item => item.attachments.length === 3));
    assert.equal((await request(`/api/profile/attachments/${attached[0].id}`, other)).status, 200);
    assert.equal(doctorRecord.sex, 'Female');
    assert.equal(doctorRecord.phone, '1234567890');
    assert.equal(doctorRecord.accountProfile.birthDate, '2000-01-01');
    assert.equal(doctorRecord.accountProfile.bloodGroup, 'O+');
    assert.ok(doctorRecord.overview.conditions.some(item => item.name === 'Asthma'));
    assert.ok(doctorRecord.overview.allergies.some(item => item.name === 'Penicillin'));
    assert.ok(doctorRecord.overview.medications.some(item => item.name === 'Profile medication'));
    assert.ok(doctorRecord.overview.notes.includes('Profile notes'));
    assert.ok(doctorRecord.timeline.some(item => item.title === 'Previous surgery' && item.date === '2020'));
    const reviewedSectionId = doctorRecord.summary.sections[0].id;
    assert.equal((await request(`${doctorPath}/summary`, other, 'PUT', { sections: [{ id: reviewedSectionId, doctorText: 'Reviewed section text', status: 'reviewed' }] })).status, 200);
    const afterReviewMark = (await (await request(doctorPath, other)).json()).patient;
    assert.equal(afterReviewMark.summary.sections[0].review.status, 'reviewed');
    assert.equal((await request(`${doctorPath}/decision`, other, 'POST', { action: 'clarification', note: ' ' })).status, 400);
    assert.equal((await request(`${doctorPath}/decision`, patient, 'POST', { action: 'clarification', note: 'Not a doctor' })).status, 403);
    assert.equal((await request(`${doctorPath}/decision`, other, 'POST', { action: 'clarification', note: 'Which knee was operated on?', target: { type: 'history', id: historyId } })).status, 200);
    const withQuestion = await (await request('/api/profile', patient)).json();
    const threadId = withQuestion.clarifications[0].id;
    assert.equal(withQuestion.clarifications[0].status, 'awaiting_patient');
    assert.ok(withQuestion.timeline.find(item => item.id === historyId).clarifications.some(thread => thread.id === threadId));
    assert.equal((await (await request('/api/profile/notifications', patient)).json()).pending, 1);
    assert.equal((await (await request('/api/profile/notifications', anotherPatient)).json()).pending, 0);
    assert.equal((await request(`/api/profile/clarifications/${threadId}/reply`, anotherPatient, 'POST', { answer: 'Not mine' })).status, 404);
    assert.equal((await request(`${doctorPath}/decision`, other, 'POST', { action: 'approve' })).status, 409);
    assert.equal((await request(`/api/profile/clarifications/${threadId}/reply`, patient, 'POST', { answer: 'The left knee.' })).status, 200);
    assert.equal((await request(`/api/profile/clarifications/${threadId}/reply`, patient, 'POST', { answer: 'Duplicate answer' })).status, 409);
    let doctorThreads = await (await request(`${doctorPath}/clarifications`, other)).json();
    assert.equal(doctorThreads.threads[0].messages.length, 2);
    assert.equal(doctorThreads.threads[0].status, 'awaiting_doctor');
    assert.equal((await request(`${doctorPath}/decision`, other, 'POST', { action: 'clarification', threadId, note: 'Was the surgery in March?' })).status, 200);
    assert.equal((await request(`/api/profile/clarifications/${threadId}/reply`, patient, 'POST', { answer: 'Yes, March 2020.' })).status, 200);
    doctorThreads = await (await request(`${doctorPath}/clarifications`, other)).json();
    assert.deepEqual(doctorThreads.threads[0].messages.map(item => item.role), ['doctor', 'patient', 'doctor', 'patient']);
    assert.equal((await request('/api/profile', other)).status, 403);
    const otherHistory = await (await request('/api/sessions', other)).json();
    assert.ok(!otherHistory.some(item => item.id === session.id));
    assert.equal((await request(`${path}/undo`, other, 'POST')).status, 404);
    for (const [suffix, method, body] of [['', 'GET'], ['/triage', 'GET'], ['/turn', 'POST', { answer: 'No' }], ['/responses/severity', 'PUT', { answer: '2' }]]) {
      assert.equal((await request(path + suffix, other, method, body)).status, 404);
    }
    await request('/api/auth/logout', patient, 'POST');
    await stop();
    await start();
    patient = await login('ramesh.patel@example.com');
    const organizedAfterRestart = await (await request('/api/conversations', patient)).json();
    assert.equal(organizedAfterRestart.chats[0].title, 'Fever follow-up');
    assert.equal(organizedAfterRestart.chats[0].groupId, groupId);
    const restoredProfile = await (await request('/api/profile', patient)).json();
    assert.equal(restoredProfile.clarifications[0].messages.length, 4);
    const doctorForApproval = await login('doctor@meditrace.health');
    const reviewAfterRestart = (await (await request(doctorPath, doctorForApproval)).json()).patient.summary.sections.find(item => item.id === reviewedSectionId).review;
    assert.equal(reviewAfterRestart.status, 'reviewed');
    assert.equal(reviewAfterRestart.doctorText, 'Reviewed section text');
    assert.equal((await request(`${doctorPath}/clarifications/${threadId}/approve`, doctorForApproval, 'POST')).status, 200);
    assert.equal((await request(`${doctorPath}/decision`, doctorForApproval, 'POST', { action: 'approve', note: 'Reviewed all answers.' })).status, 200);
    const approvedProfile = await (await request('/api/profile', patient)).json();
    assert.equal(approvedProfile.clarifications[0].status, 'approved');
    assert.equal(approvedProfile.clarifications[0].messages.length, 5);
    assert.equal(approvedProfile.clarifications[0].messages.at(-1).kind, 'approval');
    assert.equal((await (await request('/api/profile/notifications', patient)).json()).pending, 0);
    assert.equal(restoredProfile.details.conditions, 'Asthma');
    assert.equal(restoredProfile.history[0].date, '2020');
    assert.equal(restoredProfile.history[0].attachments.length, 3);
    assert.equal((await request(`/api/profile/attachments/${attached[2].id}`, patient)).status, 200);
    assert.ok(restoredProfile.timeline.some(item => item.source === 'intake' && item.id === session.id));
    assert.equal((await request(`/api/profile/history/${historyId}`, patient, 'PUT', { title: 'Updated surgery', kind: 'surgery', date: '2020-03', notes: 'Updated details' })).status, 200);
    const history = await (await request(path, patient)).json();
    assert.equal(history.transcript[0].questionText, initial.question.text);
    assert.equal(history.transcript[0].answer, 'I have a fever');
    const restored = await (await request(`${path}/triage`, patient)).json();
    assert.deepEqual(restored.answered, next.answered);
    assert.equal(restored.question.id, next.question.id);
    let progress = restored;
    let reachedHistory = false;
    for (let turnIndex = 0; turnIndex < 40 && !progress.complete && !progress.escalated; turnIndex++) {
      if (progress.step === 3) reachedHistory = true;
      const answer = progress.question.id === 'fv-hydration' ? 'Yes' : progress.question.kind === 'boolean' ? 'No' : progress.question.kind === 'number' ? '3' : 'None';
      const result = await request(`${path}/turn`, patient, 'POST', { questionId: progress.question.id, answer });
      assert.equal(result.status, 200);
      progress = await result.json();
      const reloaded = await (await request(`${path}/triage`, patient)).json();
      assert.equal(reloaded.step, progress.step, 'Refresh must preserve the current step');
    }
    assert.ok(reachedHistory, 'The intake must transition to health history');
    assert.equal(progress.step, 4);
    assert.equal(progress.complete, true);
    assert.equal((await (await request(`${path}?onlyIfEmpty=1`, patient, 'DELETE')).json()).deleted, false);
    assert.equal((await request(path, patient)).status, 200, 'Cleanup must preserve conversations with replies');
    const empty = await (await request('/api/sessions', patient, 'POST', { locale: 'en-IN' })).json();
    assert.equal((await request(`/api/sessions/${empty.id}?onlyIfEmpty=1`, await login('another@example.com'), 'DELETE')).status, 404);
    assert.equal((await (await request(`/api/sessions/${empty.id}?onlyIfEmpty=1`, patient, 'DELETE')).json()).deleted, true);
    assert.equal((await request(`/api/sessions/${empty.id}`, patient)).status, 404);
    const beforeUndo = await (await request(path, patient)).json();
    const undone = await (await request(`${path}/undo`, patient, 'POST')).json();
    assert.equal(undone.complete, false);
    assert.equal(undone.question.id, beforeUndo.transcript.at(-1).questionId);
    assert.equal(undone.removedAnswer, beforeUndo.transcript.at(-1).answer);
    assert.equal(undone.answered.length, beforeUndo.transcript.length - 1);
    const newConversation = await (await request('/api/sessions', patient, 'POST', { locale: 'en-IN', patient: 'Another intake' })).json();
    assert.notEqual(newConversation.id, session.id);
    assert.equal((await request(`/api/conversations/${newConversation.id}`, patient, 'PUT', { groupId })).status, 200);
    assert.equal((await request(`/api/conversations/${session.id}`, patient, 'PUT', { move: 'up' })).status, 200);
    let organized = await (await request('/api/conversations', patient)).json();
    assert.equal(organized.firstChat, false);
    assert.equal(organized.chats[0].id, session.id);
    assert.equal((await request(`/api/conversations/groups/${groupId}`, patient, 'PUT', { name: 'Renamed visits' })).status, 200);
    const groupTwo = (await (await request('/api/conversations/groups', patient, 'POST', { name: 'Reports' })).json()).group;
    assert.equal((await request(`/api/conversations/groups/${groupTwo.id}`, patient, 'PUT', { move: 'up' })).status, 200);
    assert.equal((await request(`/api/conversations/${session.id}`, patient, 'PUT', { groupId: groupTwo.id })).status, 200);
    organized = await (await request('/api/conversations', patient)).json();
    assert.equal(organized.groups[0].id, groupTwo.id);
    assert.equal(organized.groups[1].name, 'Renamed visits');
    assert.equal((await request(`/api/conversations/groups/${groupTwo.id}`, patient, 'DELETE')).status, 200);
    organized = await (await request('/api/conversations', patient)).json();
    assert.equal(organized.chats.find(item => item.id === session.id).groupId, null);
    assert.equal(organized.chats.length, 2);
    assert.equal(organized.chats.find(item => item.id === session.id).title, 'Fever follow-up');
    const doctorWithLatestProfile = await login('doctor@meditrace.health');
    const anotherDoctorRecord = (await (await request(`/api/doctor/patients/INTAKE-${newConversation.id.slice(0, 8)}`, doctorWithLatestProfile)).json()).patient;
    assert.equal(anotherDoctorRecord.phone, '1234567890');
    assert.ok(anotherDoctorRecord.timeline.some(item => item.title === 'Updated surgery' && item.date === '2020-03'));
    const historyList = await (await request('/api/sessions', patient)).json();
    assert.ok(historyList.some(item => item.id === session.id));
    assert.ok(historyList.some(item => item.id === newConversation.id));
    assert.equal((await request(path, patient)).status, 200);
    assert.equal((await request(`/api/sessions/${newConversation.id}/undo`, patient, 'POST')).status, 409);
    const otherAfterRestart = await login('doctor@meditrace.health');
    assert.equal((await request(path, otherAfterRestart, 'DELETE')).status, 404);
    assert.equal((await request(path, patient)).status, 200);
    assert.equal((await request(path, patient, 'DELETE')).status, 200);
    assert.equal((await request(path, patient)).status, 404);
    assert.equal((await request(path, patient, 'DELETE')).status, 404);
    const afterDelete = await (await request('/api/sessions', patient)).json();
    assert.ok(!afterDelete.some(item => item.id === session.id));
    assert.ok(afterDelete.some(item => item.id === newConversation.id));
    const retainedProfile = await (await request('/api/profile', patient)).json();
    assert.equal(retainedProfile.history[0].title, 'Updated surgery');
    assert.equal(retainedProfile.details.conditions, 'Asthma');
    assert.ok(!retainedProfile.timeline.some(item => item.source === 'intake' && item.id === session.id));
    assert.equal((await request(`/api/profile/history/${historyId}/attachments/${attached[0].id}`, patient, 'DELETE')).status, 200);
    assert.equal((await request(`/api/profile/attachments/${attached[0].id}`, patient)).status, 404);
    assert.equal((await request('/api/profile', patient)).status, 200);
    assert.equal((await request(`/api/profile/history/${historyId}`, patient, 'DELETE')).status, 200);
    const afterHistoryDelete = await (await request('/api/profile', patient)).json();
    assert.equal(afterHistoryDelete.history.length, 0);
    assert.equal(afterHistoryDelete.details.conditions, 'Asthma');
    assert.equal(afterHistoryDelete.clarifications[0].messages.length, 5);
    assert.ok(afterHistoryDelete.timeline.some(item => item.source === 'clarification' && item.clarifications[0].id === threadId));
    assert.equal((await request(`/api/profile/attachments/${attached[2].id}`, patient)).status, 404);
    await assert.rejects(readFile(join(fixture, 'data/attachments', attached[2].id)), { code: 'ENOENT' });
    assert.equal((await request('/api/sessions/missing', patient)).status, 404);
  } finally {
    if (server) await stop();
    assert.ok(resolve(fixture).startsWith(resolve(tmpdir())));
    await rm(fixture, { recursive: true, force: true });
  }
});
