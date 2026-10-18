// =============================================================
// Formly — profile.js
// The "My Formly" page.
//   - My Profile tab: your details in neat boxes
//   - Documents tab:  your resume and other writing
//   - Settings tab:   your API key and AI model
//
// When you press Save, Formly also writes your details as plain
// text into "profile", which is what background.js sends to the AI.
// =============================================================

const $ = (id) => document.getElementById(id);

// ---------- the boxes on your profile ----------
// [key, label, box type]   (keep the same keys as PROFILE_KEYS in background.js)
const SECTIONS = [
  {
    title: 'Personal',
    fields: [
      ['fullName', 'Full name'],
      ['preferredName', 'Preferred name'],
      ['dob', 'Date of birth', 'date'],
      ['gender', 'Gender'],
      ['nationality', 'Nationality'],
    ],
  },
  {
    title: 'Contact',
    fields: [
      ['email', 'Email', 'email'],
      ['schoolEmail', 'School email', 'email'],
      ['phone', 'Phone number', 'tel'],
      ['address', 'Address'],
      ['emergencyName', 'Emergency contact name'],
      ['emergencyPhone', 'Emergency contact phone', 'tel'],
    ],
  },
  {
    title: 'Education',
    fields: [
      ['school', 'School / university'],
      ['faculty', 'Faculty'],
      ['degree', 'Degree / course'],
      ['year', 'Year of study'],
      ['gradYear', 'Expected graduation year'],
    ],
  },
  {
    title: 'Links',
    fields: [
      ['linkedin', 'LinkedIn URL', 'url'],
      ['website', 'Personal website', 'url'],
      ['github', 'GitHub URL', 'url'],
    ],
  },
  {
    title: 'Preferences',
    fields: [
      ['dietary', 'Dietary restrictions'],
      ['shirtSize', 'T-shirt size'],
      ['languages', 'Languages spoken'],
    ],
  },
  {
    title: 'About me',
    fields: [
      ['bio', 'Short bio (2-3 sentences)', 'textarea'],
      ['skills', 'Skills', 'textarea'],
      ['experience', 'Experience & projects', 'textarea'],
      ['ccas', 'CCAs & activities', 'textarea'],
      ['goals', 'Career goals', 'textarea'],
      ['notes', 'Anything else Formly should know', 'textarea'],
    ],
  },
];
const SECTION_TITLES = SECTIONS.map((s) => s.title);

// Stop weird characters from breaking the page
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let docs = []; // your documents: [{ id, title, text, added }]

// ---------- tabs ----------
const TABS = ['profile', 'documents', 'settings'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'profile';
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  TABS.forEach((t) => ($('tab-' + t).hidden = t !== name));
}
document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => (location.hash = b.dataset.tab))
);
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

// =============================================================
// MY PROFILE TAB
// =============================================================
// Your own extra boxes, e.g. { key: 'c_17290', label: 'Telegram username', section: 'Contact' }
// (boxes Formly learned also have site + date)
let customFields = [];
// Built-in boxes you deleted, e.g. ['gender', 'gradYear']
let hidden = [];

// All the boxes in one section: the built-in ones you kept + the ones you added
function boxesIn(sec) {
  const builtIn = sec.fields.filter(([key]) => !hidden.includes(key));
  const mine = customFields
    .filter((c) => c.section === sec.title)
    .map((c) => [c.key, c.label, sec.title === 'About me' ? 'textarea' : 'text', c]);
  return [...builtIn, ...mine];
}

function drawProfile(data) {
  $('profileForm').innerHTML = SECTIONS.map(
    (sec) => `
    <fieldset>
      <legend>${sec.title}</legend>
      <div class="grid">
        ${boxesIn(sec)
          .map(([key, label, type, custom]) => {
            // 🧠 = Formly learned this from a form
            const learned = custom?.site
              ? ` <span class="learned-tag" title="Learned from ${esc(custom.site)} on ${new Date(custom.date).toLocaleDateString()}">🧠 learned</span>`
              : '';
            // every box gets a little × to delete it
            const name = `<span>${esc(label)}${learned} <button type="button" class="x" data-remove="${key}" title="Delete this box">×</button></span>`;
            return type === 'textarea'
              ? `<label class="wide">${name}<textarea name="${key}" rows="4">${esc(data[key])}</textarea></label>`
              : `<label>${name}<input name="${key}" type="${type || 'text'}" value="${esc(data[key])}" /></label>`;
          })
          .join('')}
      </div>
      <button type="button" class="add-box" data-section="${sec.title}">+ Add a box</button>
      ${
        sec.title === 'Links'
          ? '<p class="meta">💡 Formly can\'t open LinkedIn itself. To use your full LinkedIn profile, go to 📄 Documents → "Add your LinkedIn".</p>'
          : ''
      }
    </fieldset>`
  ).join('');
}

// Read everything typed in the boxes right now
function readForm() {
  const data = {};
  for (const el of $('profileForm').elements) {
    if (el.name) data[el.name] = el.value.trim();
  }
  data.customFields = customFields;
  data.hidden = hidden;
  return data;
}

// Turn the boxes into plain text for the AI, e.g. "Full name: William Koh"
function toText(data) {
  const lines = [];
  for (const sec of SECTIONS) {
    for (const [key, label] of boxesIn(sec)) {
      const v = String(data[key] || '').trim();
      if (v) lines.push(`${label}: ${v}`);
    }
  }
  return lines.join('\n');
}

async function saveProfile() {
  const data = readForm();
  await chrome.storage.local.set({
    profileData: data, // the neat boxes (for this page)
    profile: toText(data), // plain text (for the AI)
  });
  return data;
}

$('profileForm').addEventListener('submit', (e) => e.preventDefault());

$('saveProfile').addEventListener('click', async () => {
  await saveProfile();
  document.querySelectorAll('.suggested').forEach((el) => el.classList.remove('suggested'));
  $('profileMsg').textContent = '✅ Saved! Formly will use this on your next form.';
});

// =============================================================
// FORMLY'S OWN POP-UP BOX (instead of the browser's grey one)
// =============================================================
// Ideas shown as quick-pick buttons when you add a box
const BOX_IDEAS = {
  Personal: ['Middle name', 'Place of birth'],
  Contact: ['Telegram handle', 'Instagram handle', 'Postal code', 'Home phone'],
  Education: ['Matric number', 'Second major', 'Minor', 'GPA'],
  Links: ['Portfolio', 'Instagram', 'Devpost'],
  Preferences: ['Allergies', 'Shoe size', 'Preferred contact method'],
  'About me': ['Awards', 'Volunteering', 'Hobbies'],
};

// Opens the pop-up and waits for you to press a button.
//   askName: true -> shows "Box name" + "What to put in it", returns { name, value }
//   askName: false -> a yes/no question, returns true
//   Cancel / Esc / clicking outside -> returns null
function openModal({ title, text = '', askName = false, ideas = [], okText = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const d = $('modal');
    $('modalTitle').textContent = title;
    $('modalText').textContent = text;
    $('modalText').hidden = !text;
    $('modalFields').hidden = !askName;
    $('modalName').value = '';
    $('modalValue').value = '';
    $('modalIdeas').innerHTML = ideas.map((i) => `<span class="chip" data-idea="${esc(i)}">${esc(i)}</span>`).join('');
    $('modalOk').textContent = okText;
    $('modalOk').className = 'btn ' + (danger ? 'danger-strong' : 'primary');

    const finish = (result) => {
      d.close();
      resolve(result);
    };

    // click an idea -> put it in the name box
    $('modalIdeas').onclick = (e) => {
      if (!e.target.dataset.idea) return;
      $('modalName').value = e.target.dataset.idea;
      $('modalValue').focus();
    };
    // OK button or Enter key
    $('modalForm').onsubmit = (e) => {
      e.preventDefault();
      if (!askName) return finish(true);
      const name = $('modalName').value.trim();
      if (!name) return $('modalName').focus();
      finish({ name: name.slice(0, 60), value: $('modalValue').value.trim() });
    };
    $('modalCancel').onclick = () => finish(null);
    d.oncancel = (e) => {
      e.preventDefault(); // Esc key
      finish(null);
    };
    d.onclick = (e) => {
      if (e.target === d) finish(null); // clicked the dark area outside
    };

    d.showModal();
    (askName ? $('modalName') : $('modalOk')).focus();
  });
}

// "+ Add a box" and "×" (delete any box)
$('profileForm').addEventListener('click', async (e) => {
  const section = e.target.dataset.section;
  const removeKey = e.target.dataset.remove;
  if (!section && !removeKey) return;
  e.preventDefault();

  if (section) {
    // boxes you deleted from this section come first in the ideas, so you can bring them back
    const sec = SECTIONS.find((s) => s.title === section);
    const deleted = sec.fields.filter(([key]) => hidden.includes(key)).map(([, label]) => label);
    const answer = await openModal({
      title: `Add a box to ${section}`,
      askName: true,
      ideas: [...deleted, ...(BOX_IDEAS[section] || [])],
      okText: 'Add box',
    });
    if (!answer) return;

    const data = readForm(); // keep what you already typed
    const builtIn = sec.fields.find(([, label]) => label.toLowerCase() === answer.name.toLowerCase());
    let key;
    if (builtIn && hidden.includes(builtIn[0])) {
      key = builtIn[0]; // bring a deleted built-in box back
      hidden = hidden.filter((k) => k !== key);
    } else {
      key = 'c_' + Date.now();
      customFields.push({ key, label: answer.name, section });
    }
    data[key] = answer.value;
    drawProfile(data);
    await saveProfile();

    // scroll to the new box and make it glow for a moment
    const box = $('profileForm').elements[key];
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.classList.add('new-box');
    setTimeout(() => box.classList.remove('new-box'), 2000);
    $('profileMsg').textContent = `✅ Added "${answer.name}" and saved.`;
  } else {
    const label = boxLabel(removeKey);
    const ok = await openModal({
      title: `Delete "${label}"?`,
      text: 'This deletes the box and what you typed in it. You can add it back later with "+ Add a box".',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const data = readForm();
    if (removeKey.startsWith('c_')) customFields = customFields.filter((c) => c.key !== removeKey);
    else hidden.push(removeKey); // built-in box: just hide it
    delete data[removeKey];
    drawProfile(data);
    await saveProfile();
    $('profileMsg').textContent = `✅ Deleted "${label}".`;
  }
});

// The name of any box, built-in or added
function boxLabel(key) {
  for (const sec of SECTIONS) for (const [k, label] of sec.fields) if (k === key) return label;
  return customFields.find((c) => c.key === key)?.label || 'this box';
}

// =============================================================
// DOCUMENTS TAB
// =============================================================
const DOC_IDEAS = ['Resume', 'LinkedIn About', 'Personal statement', 'Project write-ups', 'CCA & volunteering'];
$('docChips').innerHTML = DOC_IDEAS.map((t) => `<span class="chip" data-title="${t}">${t}</span>`).join('');
$('docChips').addEventListener('click', (e) => {
  if (e.target.dataset.title) $('docTitle').value = e.target.dataset.title;
});

function drawDocs() {
  $('docList').innerHTML = docs.length
    ? docs
        .map(
          (d) => `
      <div class="card"><div class="doc">
        <div>
          <h3>📄 ${esc(d.title)}</h3>
          <div class="meta">${d.text.length.toLocaleString()} characters · added ${new Date(d.added).toLocaleDateString()}</div>
          <details><summary>Show text</summary><pre>${esc(d.text)}</pre></details>
        </div>
        <button class="btn danger" data-delete="${d.id}">Delete</button>
      </div></div>`
        )
        .join('')
    : '<p class="empty">No documents yet. Start with your resume.</p>';
}

// ---------- read the text out of a file ----------
// PDF  -> pdf.js reads each page
// Word -> mammoth reads the .docx
// Text -> read as it is
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

async function readFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      // keep line breaks so paragraphs stay together
      pages.push(content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
    }
    return pages.join('\n\n');
  }

  if (name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  if (name.endsWith('.doc')) {
    throw new Error('old Word files (.doc) are not supported. In Word: File → Save As → .docx');
  }

  return file.text(); // .txt, .md
}

async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    $('docMsg').textContent = `⏳ Reading ${file.name}…`;
    try {
      const text = (await readFile(file)).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length < 20) {
        throw new Error("couldn't find any text. If it's a scanned PDF (a picture), try a Word file instead.");
      }
      docs.push({
        id: String(Date.now() + added),
        title: file.name.replace(/\.[^.]+$/, ''),
        text: text.slice(0, 50000),
        added: Date.now(),
      });
      added++;
    } catch (e) {
      $('docMsg').textContent = `⚠️ ${file.name}: ${e.message}`;
      return;
    }
  }
  await chrome.storage.local.set({ docs });
  drawDocs();
  $('docMsg').textContent = `✅ Added ${added} file${added === 1 ? '' : 's'}. Next: go to 👤 My Profile and press "✨ Fill from my documents".`;
}

// Click to upload
$('docFile').addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});

// Drag and drop
const drop = $('drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  addFiles([...e.dataTransfer.files]);
});

$('addDoc').addEventListener('click', async () => {
  const title = $('docTitle').value.trim() || 'Untitled';
  const text = $('docText').value.trim();
  if (text.length < 20) return ($('docMsg').textContent = '⚠️ Paste a bit more text first.');
  docs.push({ id: String(Date.now()), title, text: text.slice(0, 50000), added: Date.now() });
  await chrome.storage.local.set({ docs });
  $('docTitle').value = '';
  $('docText').value = '';
  drawDocs();
});

$('docList').addEventListener('click', async (e) => {
  const id = e.target.dataset.delete;
  if (!id) return;
  const doc = docs.find((d) => d.id === id);
  const ok = await openModal({
    title: `Delete "${doc?.title}"?`,
    text: 'Formly will stop using this document.',
    okText: 'Delete',
    danger: true,
  });
  if (!ok) return;
  docs = docs.filter((d) => d.id !== id);
  await chrome.storage.local.set({ docs });
  drawDocs();
});

// =============================================================
// LIVE UPDATES: when Formly learns something while this page is open
// =============================================================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.profileData) return;
  const fresh = changes.profileData.newValue || {};
  const mine = readForm();
  // Same as what's on screen? (that was our own Save) -> nothing to do
  if (JSON.stringify(fresh.customFields || []) === JSON.stringify(customFields) &&
      JSON.stringify(fresh.hidden || []) === JSON.stringify(hidden)) return;

  // Add the new boxes, but keep anything you were typing
  customFields = fresh.customFields || [];
  hidden = fresh.hidden || [];
  for (const [k, v] of Object.entries(fresh)) if (!String(mine[k] || '').trim()) mine[k] = v;
  drawProfile(mine);
  $('profileMsg').textContent = '🧠 Formly just learned something new from a form. It\'s been added below.';
});

// =============================================================
// SETTINGS TAB
// =============================================================
$('autoLearn').addEventListener('change', (e) => {
  chrome.storage.local.set({ autoLearn: e.target.checked });
  $('settingsMsg').textContent = e.target.checked ? '✅ Learning ON' : '⏸️ Learning OFF';
});

$('saveSettings').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
  });
  $('settingsMsg').textContent = '✅ Saved!';
});

$('testKey').addEventListener('click', async () => {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) return ($('settingsMsg').textContent = 'Paste your API key first.');
  $('settingsMsg').textContent = 'Testing…';
  const res = await chrome.runtime.sendMessage({ type: 'FORMLY_TEST_KEY', apiKey, model: $('model').value.trim() });
  $('settingsMsg').textContent = res?.ok ? '✅ Your key works! Press Save settings.' : '⚠️ ' + (res?.error || 'Key test failed.');
});

// =============================================================
// START: load what you saved before
// =============================================================
chrome.storage.local.get(['profileData', 'profile', 'apiKey', 'model', 'docs', 'autoLearn']).then((saved) => {
  let data = saved.profileData;

  // First time here? Put your old profile text into "Anything else"
  // so nothing you typed before gets lost.
  if (!data) data = { notes: saved.profile || '' };

  customFields = data.customFields || [];
  hidden = data.hidden || [];
  // boxes from an older version of Formly with a section that no longer exists -> Personal
  customFields.forEach((c) => {
    if (!SECTION_TITLES.includes(c.section)) c.section = 'Personal';
  });
  drawProfile(data);
  docs = saved.docs || [];
  drawDocs();
  $('apiKey').value = saved.apiKey || '';
  $('model').value = saved.model || 'claude-haiku-4-5-20251001';
  $('autoLearn').checked = saved.autoLearn !== false;
  showTab(location.hash.slice(1));
});
