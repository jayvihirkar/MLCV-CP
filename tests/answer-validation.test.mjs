import test from 'node:test';
import assert from 'node:assert/strict';
import { answerNeedsClarification, CHIEF_COMPLAINT_QUESTION, questionById, createTriageState, applyAnswer, resolveQuestion } from '../server/triage.mjs';

test('chief complaint rejects greetings without restricting valid reasons for a visit', () => {
  for (const text of ['Hello.', 'hi there', 'Good morning doctor', 'Thanks', 'Can you help me?', 'I don’t know', 'yes', '7', '???', 'asdfasdf']) assert.equal(answerNeedsClarification(CHIEF_COMPLAINT_QUESTION, text), true, text);
  for (const text of ['Hello, I have knee pain', 'Pain', 'Routine checkup', 'Prescription review', 'An unusual rash on my leg', 'My blood test results', 'नमस्ते, मेरे सिर में दर्द है']) assert.equal(answerNeedsClarification(CHIEF_COMPLAINT_QUESTION, text), false, text);
  assert.equal(answerNeedsClarification(questionById('df-duration'), 'Hello'), true);
  assert.equal(answerNeedsClarification(questionById('df-duration'), 'I do not remember'), false);
  assert.equal(answerNeedsClarification(questionById('df-severity'), '11'), true);
  assert.equal(answerNeedsClarification(questionById('df-severity'), '-1'), true);
  assert.equal(answerNeedsClarification(questionById('df-severity'), '7'), false);
});

test('a vague symptom gets a context question and can reroute into the relevant branch', () => {
  const state = createTriageState();
  applyAnswer(state, 'chief-complaint', 'Pain');
  assert.equal(resolveQuestion(state).question.id, 'df-context');
  applyAnswer(state, 'df-context', 'It is in my chest');
  assert.equal(state.complaint, 'chest-pain');
  assert.equal(resolveQuestion(state).question.id, 'cp-severe-now');
});
