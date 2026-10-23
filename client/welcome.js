// Formly — welcome.js
// The page that opens when someone installs Formly: create a free account.

const $ = (id) => document.getElementById(id);

function showDone(account) {
  $('signupCard').hidden = true;
  $('doneCard').hidden = false;
  $('doneTitle').textContent = `🎉 You're in, ${account.telegram || 'friend'}!`;
  $('donePlan').textContent = account.unlimited
    ? 'You have unlimited forms.'
    : `You have ${account.formsLeft} free form${account.formsLeft === 1 ? '' : 's'}.`;
}

$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const telegram = $('telegram').value.trim();
  if (!$('consent').checked) return ($('msg').textContent = 'Please tick the box to agree.');

  $('signupBtn').disabled = true;
  $('signupBtn').textContent = 'Creating your account…';
  $('msg').textContent = '';
  const res = await chrome.runtime.sendMessage({ type: 'FORMLY_SIGNUP', email, telegram, consent: true });
  $('signupBtn').disabled = false;
  $('signupBtn').textContent = 'Create my account';

  if (!res?.ok) return ($('msg').textContent = '⚠️ ' + (res?.error || 'Something went wrong. Please try again.'));
  showDone(res.account);
});

$('setupBtn').addEventListener('click', () => {
  location.href = chrome.runtime.getURL('profile.html');
});

// Already signed in? Skip straight to "You're in".
chrome.storage.local.get(['token', 'account']).then(({ token, account }) => {
  if (token && account) showDone(account);
});
