// =============================================================
// Formly — background.js  (beta: with accounts)
// The page sends it the questions, and it:
//   1. finds the most useful parts of your DOCUMENTS (smart search)
//   2. sends the questions + your profile to the FORMLY SERVER
//      (the server checks your account, asks the AI, and counts usage)
//   3. returns the answers to the page
// It can also read your documents to fill your profile boxes,
// and LEARN new facts from answers you type.
// Your profile and documents stay on this computer. The server
// never stores them.
// =============================================================

importScripts('config.js'); // FORMLY_SERVER: the web address of the Formly server

// ---------- talk to the Formly server ----------
class ServerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function callServer(action, payload = {}) {
  const { token } = await chrome.storage.local.get('token');
  if (!token && action !== 'signup') {
    throw new ServerError('SIGNED_OUT', 'Create your free Formly account first: click the Formly icon.');
  }
  let res;
  try {
    res = await fetch(FORMLY_SERVER, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-formly-token': token } : {}) },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new ServerError('OFFLINE', "Couldn't reach Formly. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (data.account) await chrome.storage.local.set({ account: data.account }); // for the popup's "forms left"
  if (!data.ok) {
    if (data.code === 'SIGNED_OUT') await chrome.storage.local.remove(['token', 'account']);
    if (data.code === 'PAUSED') await chrome.storage.local.set({ account: { status: 'blocked' } });
    if (data.code === 'LIMIT') {
      const { account = {} } = await chrome.storage.local.get('account');
      await chrome.storage.local.set({ account: { ...account, formsLeft: 0 } });
    }
    throw new ServerError(data.code || 'ERROR', data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

// A scrambled code for the form's web address, so the server can tell
// "same form again" from "new form" without ever seeing the address.
async function pageKeyFor(url) {
  try {
    const u = new URL(url);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.origin + u.pathname));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    return '';
  }
}

// ---------- SMART SEARCH: pick the best parts of your documents ----------
// Long documents cost more and confuse the AI, so we only send the
// paragraphs that share the most words with the form's questions.
const STOP_WORDS = new Set(
  'the and for with your you are what why how does did this that from have has our will would can could please describe tell about any who when where which into more most than them they their there been being also just'.split(' ')
);
const words = (t) => (String(t || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP_WORDS.has(w));

function pickDocParts(docs, query, budget = 6000) {
  // 1. cut every document into paragraphs of about 900 characters
  const parts = [];
  for (const d of docs || []) {
    let buf = '';
    for (const para of String(d.text || '').split(/\n\s*\n/)) {
      if (buf && (buf + para).length > 900) {
        parts.push({ title: d.title, text: buf.trim() });
        buf = '';
      }
      buf += para + '\n\n';
    }
    if (buf.trim()) parts.push({ title: d.title, text: buf.trim().slice(0, 1500) });
  }

  // 2. score each paragraph by how many question words it contains
  const q = new Set(words(query));
  parts.forEach((p, i) => {
    const w = words(p.text);
    const hits = w.filter((x) => q.has(x)).length;
    p.score = hits / Math.sqrt(w.length + 1);
    p.order = i;
  });

  // 3. take the best paragraphs until we hit the size limit
  const chosen = [];
  let used = 0;
  for (const p of [...parts].sort((a, b) => b.score - a.score)) {
    if (used + p.text.length > budget) continue;
    chosen.push(p);
    used += p.text.length;
  }
  return chosen
    .sort((a, b) => a.order - b.order)
    .map((p) => `[${p.title}]\n${p.text}`)
    .join('\n\n---\n\n');
}

// ---------- FILL A FORM ----------
async function answerFields({ page, fields }, pageUrl) {
  const { profile, docs = [] } = await chrome.storage.local.get(['profile', 'docs']);
  if ((!profile || !profile.trim()) && !docs.length) {
    throw new ServerError('NO_PROFILE', 'Add your details first: Formly icon → My Profile & Settings.');
  }

  const query = [page.title, page.intro, ...fields.map((f) => f.question)].join(' ');
  const docText = pickDocParts(docs, query);
  let site = '';
  try {
    site = new URL(pageUrl).hostname;
  } catch {}

  const data = await callServer('fill', {
    pageKey: await pageKeyFor(pageUrl),
    profile,
    docText,
    page: { title: page.title, site, intro: page.intro },
    fields,
  });
  if (!Array.isArray(data.answers)) throw new ServerError('AI', 'The AI reply had no answers. Try again.');
  return { answers: data.answers, account: data.account };
}

// ---------- READ YOUR DOCUMENTS TO FILL YOUR PROFILE ----------
// Keep this list the same as SECTIONS in profile.js
// [key, label, section]
const PROFILE_KEYS = [
  ['fullName', 'Full name', 'Personal'], ['preferredName', 'Preferred name', 'Personal'],
  ['dob', 'Date of birth', 'Personal'], ['gender', 'Gender', 'Personal'], ['nationality', 'Nationality', 'Personal'],
  ['email', 'Email', 'Contact'], ['schoolEmail', 'School email', 'Contact'], ['phone', 'Phone number', 'Contact'],
  ['address', 'Address', 'Contact'], ['emergencyName', 'Emergency contact name', 'Contact'],
  ['emergencyPhone', 'Emergency contact phone', 'Contact'],
  ['school', 'School / university', 'Education'], ['faculty', 'Faculty', 'Education'],
  ['degree', 'Degree / course', 'Education'], ['year', 'Year of study', 'Education'],
  ['gradYear', 'Expected graduation year', 'Education'],
  ['linkedin', 'LinkedIn URL', 'Links'], ['website', 'Personal website', 'Links'], ['github', 'GitHub URL', 'Links'],
  ['dietary', 'Dietary restrictions', 'Preferences'], ['shirtSize', 'T-shirt size', 'Preferences'],
  ['languages', 'Languages spoken', 'Preferences'],
  ['bio', 'Short bio (2-3 sentences)', 'About me'], ['skills', 'Skills', 'About me'],
  ['experience', 'Experience & projects', 'About me'], ['ccas', 'CCAs & activities', 'About me'],
  ['goals', 'Career goals', 'About me'], ['notes', 'Anything else Formly should know', 'About me'],
];
const SECTION_NAMES = ['Personal', 'Contact', 'Education', 'Links', 'Preferences', 'About me'];

// All your boxes right now: built-in ones you didn't delete + ones you added
function allBoxes(profileData) {
  const hidden = profileData.hidden || [];
  return [
    ...PROFILE_KEYS.filter(([key]) => !hidden.includes(key)).map(([key, label, section]) => ({ key, label, section })),
    ...(profileData.customFields || []),
  ];
}

// Turn your boxes into plain text for the AI, e.g. "Telegram username: @william"
function buildProfileText(profileData) {
  return allBoxes(profileData)
    .filter((b) => String(profileData[b.key] || '').trim())
    .map((b) => `${b.label}: ${String(profileData[b.key]).trim()}`)
    .join('\n');
}

const LONG_KEYS = new Set(['bio', 'skills', 'experience', 'ccas', 'goals']);

// Safety check: is this short answer really written in the documents?
function foundIn(value, text) {
  value = String(value).replace(/^https?:\/\//i, ''); // "https://" is often left out in resumes
  const clean = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}@.]/gu, '');
  if (clean(text).includes(clean(value))) return true;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 6 && String(text).replace(/\D/g, '').includes(digits.slice(-8));
}

async function extractProfile() {
  const { docs = [] } = await chrome.storage.local.get('docs');
  const text = docs.map((d) => `[${d.title}]\n${d.text}`).join('\n\n').slice(0, 15000);
  if (!text.trim()) throw new Error('Add a document first (for example your resume) in the Documents tab.');

  const data = await callServer('extract', {
    docText: text,
    keys: PROFILE_KEYS.filter(([k]) => k !== 'notes').map(([k, l]) => `${k} (${l})`).join('\n'),
  });

  const found = data.profile || {};
  const out = {};
  for (const [key] of PROFILE_KEYS) {
    const v = String(found[key] || '').trim();
    if (!v) continue;
    if (!LONG_KEYS.has(key) && !foundIn(v, text)) continue; // drop anything the AI guessed
    out[key] = v;
  }
  return out;
}

// ---------- LEARN FROM ANSWERS YOU TYPED ----------
// Saves new facts straight into the right section of your profile.
const SECRET_WORDS = /\b(nric|passport|password|passcode|cvv|card number|bank account|account number|otp)\b/i;
const squash = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

async function learnFrom({ site, items }) {
  items = (items || []).filter((i) => i?.answer && !SECRET_WORDS.test(i.question)).slice(0, 20);
  if (!items.length) return [];

  const { profileData = {} } = await chrome.storage.local.get('profileData');
  profileData.customFields = profileData.customFields || [];
  const boxes = allBoxes(profileData);
  const boxList = SECTION_NAMES.map(
    (s) => `${s}: ${boxes.filter((b) => b.section === s).map((b) => b.label).join(', ')}`
  ).join('\n');

  // Ask the AI (through the server) to tidy the answers into facts
  const data = await callServer('learn', { items, boxList });
  const facts = data.facts || [];

  const saved = [];
  for (const f of facts) {
    if (!f || f.keep === false || !f.label || !f.value) continue;
    const label = String(f.label).replace(/[*:?]+$/g, '').trim().slice(0, 60);
    const value = String(f.value).trim().slice(0, 300);
    if (!label || SECRET_WORDS.test(label)) continue;

    // Is there already a box with this name? (including built-in boxes you deleted)
    const existing =
      allBoxes(profileData).find((b) => squash(b.label) === squash(label)) ||
      PROFILE_KEYS.map(([key, l, section]) => ({ key, label: l, section })).find((b) => squash(b.label) === squash(label));

    if (existing) {
      const current = String(profileData[existing.key] || '').trim();
      if (current) continue; // already has an answer: never overwrite what you saved yourself
      profileData.hidden = (profileData.hidden || []).filter((k) => k !== existing.key); // bring a deleted box back
      profileData[existing.key] = value;
      saved.push({ label: existing.label, value, section: existing.section });
    } else {
      const section = SECTION_NAMES.includes(f.section) ? f.section : 'Personal';
      const key = 'c_' + Date.now() + saved.length;
      profileData.customFields.push({ key, label, section, site, date: Date.now() });
      profileData[key] = value;
      saved.push({ label, value, section });
    }
  }

  if (saved.length) {
    await chrome.storage.local.set({
      profileData,
      profile: buildProfileText(profileData),
      lastLearned: { site, date: Date.now(), saved }, // shown in the popup
    });
    // little "+1" on the Formly icon until you open the popup
    chrome.action.setBadgeText({ text: '+' + saved.length });
    chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  }
  return saved;
}

// ---------- first install: open the welcome page to create an account ----------
chrome.runtime.onInstalled.addListener(async (details) => {
  const { token } = await chrome.storage.local.get('token');
  if (details.reason === 'install' && !token) {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// ---------- messages from the page, the popup, Welcome and My Profile ----------
const handlers = {
  FORMLY_ANSWER: (msg, sender) => answerFields(msg, sender.url || sender.tab?.url || ''),
  FORMLY_LEARN: (msg) => learnFrom(msg).then((saved) => ({ saved })),
  FORMLY_EXTRACT_PROFILE: () => extractProfile().then((profile) => ({ profile })),
  FORMLY_SIGNUP: async (msg) => {
    const data = await callServer('signup', { email: msg.email, telegram: msg.telegram, consent: msg.consent });
    await chrome.storage.local.set({ token: data.token, account: data.account });
    return { account: data.account };
  },
  FORMLY_ME: () => callServer('me').then((d) => ({ account: d.account })),
  FORMLY_NOTIFY_PRO: () => callServer('notify_pro').then((d) => ({ account: d.account })),
  FORMLY_SIGNOUT: async () => {
    await chrome.storage.local.remove(['token', 'account']);
    return {};
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return;
  handler(msg, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, code: err.code || 'ERROR', error: err.message }));
  return true; // "I'll answer later": keeps the line open while the AI thinks
});
