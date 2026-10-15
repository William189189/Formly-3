// Formly — popup.js
// The little settings window when you click the Formly icon.

const $ = (id) => document.getElementById(id);
const status = (msg) => ($('status').textContent = msg);

// Load what you saved before
chrome.storage.local.get(['apiKey', 'profile', 'model']).then(({ apiKey, profile, model }) => {
  if (apiKey) $('apiKey').value = apiKey;
  if (profile) $('profile').value = profile;
  if (model) $('model').value = model;
});

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiKey: $('apiKey').value.trim(),
    profile: $('profile').value,
    model: $('model').value,
  });
  status('✅ Saved!');
});

$('test').addEventListener('click', async () => {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) return status('Paste your API key first.');
  status('Testing…');
  const res = await chrome.runtime.sendMessage({ type: 'FORMLY_TEST_KEY', apiKey, model: $('model').value });
  status(res?.ok ? '✅ Your key works!' : '⚠️ ' + (res?.error || 'Key test failed.'));
});

$('fill').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'FORMLY_FILL' });
    window.close(); // the page shows the progress now
  } catch {
    status('⚠️ Refresh the form page first, then try again.');
  }
});
