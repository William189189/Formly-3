// =============================================================
// Formly — background.js
// This is the "brain helper". The page sends it the questions,
// and it:
//   1. builds the PROMPT TEMPLATE (profile + page + questions)
//   2. calls the AI API and waits for the reply
//   3. SPLITS the reply into one answer per question
// =============================================================

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5'; // cheapest + fastest
const MAX_TOKENS = 2000; // cap on how long the reply can be = caps the cost

// ---------- 1. THE PROMPT TEMPLATE ----------
const SYSTEM_PROMPT = `You are Formly. You fill in application forms for one person, using their profile.

Rules:
- Use only facts found in the profile. Never invent names, grades, dates, numbers, jobs or experiences.
- If the profile does not contain the answer, return "" for that question so the person can fill it in.
- multiple_choice and dropdown: copy ONE option exactly as written.
- checkboxes: return a list of options copied exactly as written (the list can be empty).
- Leave consent, declaration, terms and "I agree" boxes empty ("" or []). The person must tick those.
- date: use the format YYYY-MM-DD.
- long_text and open "why" questions: write in first person, warm and specific, using real projects and experiences from the profile, tailored to the organisation on the page. About 80-150 words unless the question asks for a different length.
- short_text: keep it short, like a real person typing into a form.
- Reply with JSON only. No extra words and no code fences.`;

function buildPrompt(profile, page, fields) {
  const questions = fields.map((f) => JSON.stringify(f)).join('\n');
  return `<profile>
${profile}
</profile>

<page>
Title: ${page.title}
URL: ${page.url}
Top of the page: ${page.intro}
</page>

<questions>
${questions}
</questions>

Answer every question above. Reply with JSON in exactly this shape:
{"answers":[{"id":"f1","value":"a text answer"},{"id":"f2","value":["Option A","Option B"]}]}`;
}

// ---------- 2. CALL THE AI ----------
async function callClaude({ apiKey, model, system, prompt, maxTokens }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `The AI service returned error ${res.status}.`);
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('The answers were too long and got cut off. Raise MAX_TOKENS in background.js.');
  }
  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

// ---------- 3. SPLIT THE REPLY INTO ANSWERS ----------
function parseAnswers(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI reply was not in the right format. Try again.');
  const data = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(data.answers)) throw new Error('The AI reply had no answers list. Try again.');
  return data.answers; // [{ id: "f1", value: "..." }, ...]
}

async function answerFields({ page, fields }) {
  const { apiKey, profile, model } = await chrome.storage.local.get(['apiKey', 'profile', 'model']);
  if (!apiKey) throw new Error('Add your API key first: click the Formly icon in your toolbar.');
  if (!profile || !profile.trim()) throw new Error('Add your profile first: click the Formly icon in your toolbar.');

  const text = await callClaude({
    apiKey,
    model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(profile, page, fields),
    maxTokens: MAX_TOKENS,
  });
  return parseAnswers(text);
}

// ---------- messages from the page and the popup ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'FORMLY_ANSWER') {
    answerFields(msg)
      .then((answers) => sendResponse({ ok: true, answers }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // "I'll answer later" — keeps the line open while the AI thinks
  }

  if (msg?.type === 'FORMLY_TEST_KEY') {
    callClaude({
      apiKey: msg.apiKey,
      model: msg.model,
      system: 'Reply with the single word: ok',
      prompt: 'Say ok',
      maxTokens: 10,
    })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
