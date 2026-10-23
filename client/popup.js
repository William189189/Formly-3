// Formly — popup.js
// The little window when you click the Formly icon.
// Shows your plan ("2 of 3 free forms left"), Formly Pro, and the main buttons.

const $ = (id) => document.getElementById(id);
const status = (msg) => ($('status').textContent = msg);
const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function openPage(page) {
  chrome.tabs.create({ url: chrome.runtime.getURL(page) });
}

// ===== YOUR ACCOUNT =====
function showAccount(token, account, hasProfile) {
  ['signup', 'proBox', 'pausedBox', 'setup', 'plan'].forEach((id) => ($(id).hidden = true));

  if (!token) {
    $('signup').hidden = false;
    return;
  }
  if (account?.status === 'blocked') {
    $('pausedBox').hidden = false;
    return;
  }
  if (account) {
    $('plan').hidden = false;
    if (account.unlimited) {
      $('plan').textContent = account.status === 'pro' ? '✨ Formly Pro: unlimited forms' : '✨ Unlimited forms';
    } else {
      $('plan').textContent = `✨ ${account.formsLeft} of ${account.freeForms} free forms left`;
      if (account.formsLeft === 0) {
        $('proBox').hidden = false;
        $('proPrice').textContent = account.proPrice || 'S$1.99/month';
        $('notifyPro').hidden = !!account.wantsPro;
        $('proThanks').hidden = !account.wantsPro;
      }
    }
  }
  if (!hasProfile) {
    $('setup').hidden = false;
    $('setupText').textContent = 'Next, add your details (or upload your resume) in My Profile & Settings.';
  }
}

chrome.storage.local
  .get(['token', 'account', 'profile', 'docs', 'enabled', 'lastLearned'])
  .then(async ({ token, account, profile, docs, enabled, lastLearned }) => {
    $('enabled').checked = enabled !== false;
    const hasProfile = !!(profile && profile.trim()) || (docs || []).length > 0;

    // Things Formly just learned (shown once, then cleared)
    if (lastLearned?.saved?.length) {
      $('learnedBox').hidden = false;
      $('learnedList').innerHTML = lastLearned.saved
        .map((s) => `<div>• <b>${escapeHtml(s.label)}</b>: ${escapeHtml(s.value)} <span class="small">(${escapeHtml(s.section)})</span></div>`)
        .join('');
      chrome.storage.local.remove('lastLearned');
    }
    chrome.action.setBadgeText({ text: '' }); // clear the "+1" on the icon

    // Show what we know straight away, then ask the server for the latest
    showAccount(token, account, hasProfile);
    if (token) {
      const res = await chrome.runtime.sendMessage({ type: 'FORMLY_ME' });
      const fresh = await chrome.storage.local.get(['token', 'account']);
      showAccount(fresh.token, res?.ok ? res.account : fresh.account, hasProfile);
    }
  });

// ===== BUTTONS =====
$('signupBtn').addEventListener('click', () => openPage('welcome.html'));
$('openProfile').addEventListener('click', () => openPage('profile.html'));
$('review').addEventListener('click', () => openPage('profile.html'));

$('notifyPro').addEventListener('click', async () => {
  $('notifyPro').disabled = true;
  const res = await chrome.runtime.sendMessage({ type: 'FORMLY_NOTIFY_PRO' });
  if (res?.ok) {
    $('notifyPro').hidden = true;
    $('proThanks').hidden = false;
  } else {
    $('notifyPro').disabled = false;
    status('⚠️ ' + (res?.error || 'Please try again.'));
  }
});

// Send a message to the page you're looking at
async function tellPage(type) {
  const { token } = await chrome.storage.local.get('token');
  if (!token) return openPage('welcome.html');
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
