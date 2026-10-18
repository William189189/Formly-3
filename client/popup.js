// Formly — popup.js
// The little window when you click the Formly icon.
// Your profile, API key and model now live on the "My Profile" page.

const $ = (id) => document.getElementById(id);
const status = (msg) => ($('status').textContent = msg);
const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Open the My Profile page in a new tab
function openProfile(tab) {
  chrome.tabs.create({ url: chrome.runtime.getURL('profile.html' + (tab ? '#' + tab : '')) });
}

// ===== SETUP CHECK =====
// If your key or profile is missing, show a friendly reminder
chrome.storage.local.get(['apiKey', 'profile', 'docs', 'enabled', 'lastLearned']).then(({ apiKey, profile, docs, enabled, lastLearned }) => {
  $('enabled').checked = enabled !== false;

  // Things Formly just learned (shown once, then cleared)
  if (lastLearned?.saved?.length) {
    $('learnedBox').hidden = false;
    $('learnedList').innerHTML = lastLearned.saved
      .map((s) => `<div>• <b>${escapeHtml(s.label)}</b>: ${escapeHtml(s.value)} <span class="small">(${escapeHtml(s.section)})</span></div>`)
      .join('');
    chrome.storage.local.remove('lastLearned');
  }
  chrome.action.setBadgeText({ text: '' }); // clear the "+1" on the icon

  if (!apiKey) {
    $('setup').hidden = false;
    $('setupText').textContent = 'First, add your AI key in My Profile & Settings → Settings.';
  } else if ((!profile || !profile.trim()) && !(docs || []).length) {
    $('setup').hidden = false;
    $('setupText').textContent = 'Next, fill in your details in My Profile & Settings.';
  }
});

// ===== BUTTONS =====
$('openProfile').addEventListener('click', () => openProfile());
$('review').addEventListener('click', () => openProfile());

// Send a message to the page you're looking at
async function tellPage(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
    window.close(); // the page shows the progress now
  } catch {
    status('⚠️ Refresh the form page first, then try again.');
  }
}
$('fill').addEventListener('click', () => tellPage('FORMLY_FILL'));

// ===== ON / OFF SWITCH =====
$('enabled').addEventListener('change', (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
  status(e.target.checked ? '✅ Button ON' : '⏸️ Button OFF');
});
