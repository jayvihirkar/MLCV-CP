import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseTurn, intakeLlmConfigured } from '../server/llm.mjs';
import { applyAnswer, createTriageState, classifyComplaint, candidateQuestions, resolveQuestion, questionById, redFlagOptions, finalise } from '../server/triage.mjs';

test('Gemini writes grounded follow-ups from the entire conversation; questions survive restore and completion', async t => {
  const previousFetch = globalThis.fetch, previousKey = process.env.GEMINI_API_KEY;
  t.after(() => { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  process.env.GEMINI_API_KEY = 'fixture-only';
  const state = createTriageState();
  assert.equal(classifyComplaint('Dry cough for 5 days'), 'cough');
  assert.equal(classifyComplaint('Severe shortness of breath'), 'breathing');
  applyAnswer(state, 'chief-complaint', 'Dry cough for 5 days');
  assert.equal(resolveQuestion(state).question.id, 'cough-safety');
  applyAnswer(state, 'cough-safety', 'No');
  state.answers[0].questionText = questionById('chief-complaint').text;
  state.answers[1].questionText = questionById('cough-safety').text;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    const prompt = body.contents[0].parts[0].text;
    assert.ok(prompt.includes('Dry cough for 5 days'));
    assert.ok(prompt.includes('No'));
    assert.ok(!prompt.includes('choose exactly one id'));
    assert.ok(body.generationConfig.responseSchema.properties.nextQuestionText);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ nextQuestionText: 'Does your dry cough get worse at night?', summaryLabel: 'Cough pattern', section: 'concern', answerRelevant: true, complete: false, redFlagIds: [] }) }] } }] });
  };
  const result = await analyseTurn({ state, question: questionById('cough-safety'), answerText: 'No', candidates: candidateQuestions(state), redFlags: redFlagOptions(state) });
  assert.equal(calls, 1, 'One Gemini call handles answer relevance and follow-up generation');
  assert.equal(result.nextQuestion.text, 'Does your dry cough get worse at night?');
  state.generatedQuestions = [result.nextQuestion]; state.aiQuestion = result.nextQuestion;
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(resolveQuestion(restored).question.text, result.nextQuestion.text);
  applyAnswer(restored, result.nextQuestion.id, 'Yes, mainly at night');
  assert.equal(restored.answers.at(-1).answer, 'Yes, mainly at night');
  assert.equal(restored.answers.at(-1).label, 'Cough pattern');
  restored.aiComplete = true; finalise(restored);
  assert.equal(resolveQuestion(restored).complete, true);
});

test('Gemini failures return explicit fallback signal rather than a fabricated generated response', async t => {
  const previousFetch = globalThis.fetch, previousKey = process.env.GEMINI_API_KEY;
  t.after(() => { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  process.env.GEMINI_API_KEY = 'fixture-only';
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  const state = createTriageState();
  assert.equal(await analyseTurn({ state, question: questionById('chief-complaint'), answerText: 'Dry cough', candidates: [], redFlags: [] }), null);
});

test('knee complaints use the focused safety-first intake flow', () => {
  const state = createTriageState();
  applyAnswer(state, 'chief-complaint', 'I have left knee pain for two months with mild swelling.');
  assert.equal(classifyComplaint(state.chiefComplaint), 'knee-pain');
  assert.equal(resolveQuestion(state).question.id, 'knee-safety');
  applyAnswer(state, 'knee-safety', 'No');
  assert.equal(resolveQuestion(state).question.id, 'knee-severity');
  applyAnswer(state, 'knee-severity', '7');
  assert.equal(state.severity, 7);
});

test('OpenRouter uses the same conversation contract and blocks free-model use without explicit synthetic test mode', async t => {
  const names = ['INTAKE_LLM_PROVIDER', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_SYNTHETIC_TEST_MODE'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
  Object.assign(process.env, { INTAKE_LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'fixture-only', OPENROUTER_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b:free', OPENROUTER_SYNTHETIC_TEST_MODE: 'false' });
  assert.equal(intakeLlmConfigured(), false);
  const state = createTriageState();
  applyAnswer(state, 'chief-complaint', 'Dry cough for 5 days'); applyAnswer(state, 'cough-safety', 'No');
  const input = { state, question: questionById('cough-safety'), answerText: 'No', candidates: candidateQuestions(state), redFlags: redFlagOptions(state) };
  globalThis.fetch = () => { throw new Error('Free model must not be called'); };
  assert.equal(await analyseTurn(input), null);
  process.env.OPENROUTER_SYNTHETIC_TEST_MODE = 'true';
  assert.equal(intakeLlmConfigured(), true);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fixture-only');
    const body = JSON.parse(options.body);
    assert.equal(body.model, process.env.OPENROUTER_MODEL);
    assert.equal(body.response_format, undefined, 'Do not send unsupported structured output parameters');
    assert.ok(body.messages[1].content.includes('Dry cough for 5 days'));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ nextQuestionText: 'Does your cough get worse at night?', summaryLabel: 'Cough pattern', section: 'concern', answerRelevant: true, complete: false, redFlagIds: [] }) } }] });
  };
  assert.equal((await analyseTurn(input)).nextQuestion.text, 'Does your cough get worse at night?');
});
