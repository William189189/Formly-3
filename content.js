// =============================================================
// Formly — content.js
// This file runs INSIDE every web page you open.
//
// Its 3 jobs (the same 3 steps your friend described):
//   STEP 1  Find the questions on the page        -> collectFields()
//   STEP 2  Send them to the AI (via background.js) -> runFill()
//   STEP 3  Put the answers back into the form     -> fillFields()
//
// It NEVER presses Submit. You always check and submit yourself.
// =============================================================

(() => {
  if (window.__formlyLoaded) return; // don't load twice
  window.__formlyLoaded = true;

  const MIN_FIELDS = 2; // show the button only if the page has at least this many boxes

  // id ("f1", "f2"...) -> { the real page element(s), question, type, options }
  let fieldMap = new Map();

  // ---------- little helpers ----------
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const short = (t, n = 300) => clean(t).slice(0, n);
  const norm = (t) => clean(t).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '');

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function textOfIds(idList) {
    return clean(
      (idList || '')
        .split(/\s+/)
        .map((id) => (id && document.getElementById(id)?.innerText) || '')
        .join(' ')
    );
  }

  function labelFor(el) {
    if (!el.id) return null;
    return document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  }

  // =============================================================
  // STEP 1 — FIND THE QUESTIONS
  // =============================================================

  // Work out the question text for one text box / dropdown.
  function questionLabel(el) {
    const byAria = textOfIds(el.getAttribute('aria-labelledby')); // Google Forms uses this
    if (byAria) return short(byAria);

    const lab = labelFor(el);
    if (lab && clean(lab.innerText)) return short(lab.innerText);

    const wrap = el.closest('label');
    if (wrap && clean(wrap.innerText)) return short(wrap.innerText);

    const heading = el.closest('[role="listitem"]')?.querySelector('[role="heading"]');
    if (heading && clean(heading.innerText)) return short(heading.innerText);

    const direct = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.title;
    if (clean(direct)) return short(direct);

    // last try: look at the text in the boxes around it
    let node = el.parentElement;
    for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
      if (clean(node.innerText)) return short(node.innerText);
    }
    return el.name || el.id || 'Unlabelled question';
  }

  // Work out the text of one choice (one radio button / one checkbox).
  function optionText(el) {
    if (el.tagName === 'INPUT') {
      const lab = labelFor(el);
      if (lab && clean(lab.innerText)) return short(lab.innerText, 150);
      const wrap = el.closest('label');
      if (wrap && clean(wrap.innerText)) return short(wrap.innerText, 150);
      const next = clean(el.nextSibling?.textContent);
      if (next) return short(next, 150);
      return el.value;
    }
    // Google Forms style "fake" radio buttons
    return short(
      el.getAttribute('aria-label') || el.dataset.value || el.dataset.answerValue || el.innerText,
      150
    );
  }

  // Work out the question text for a group of choices.
  function groupLabel(els) {
    const first = els[0];

    const legend = first.closest('fieldset')?.querySelector('legend');
    if (legend && clean(legend.innerText)) return short(legend.innerText);

    const group = first.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const t = textOfIds(group.getAttribute('aria-labelledby')) || clean(group.getAttribute('aria-label'));
      if (t) return short(t);
    }

    const heading = first.closest('[role="listitem"]')?.querySelector('[role="heading"]');
    if (heading && clean(heading.innerText)) return short(heading.innerText);

    // find the box that holds all the choices, then read the text just above it
    let box = first.parentElement;
    while (box && !els.every((e) => box.contains(e))) box = box.parentElement;
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
      const prev = box.previousElementSibling;
      if (prev && clean(prev.innerText)) return short(prev.innerText);
    }
    return 'Choose an option';
  }

  const TEXT_TYPES = ['', 'text', 'email', 'tel', 'url', 'number', 'date', 'search'];

  // Look at the whole page and make a list of every question.
  function collectFields() {
    const found = []; // { anchor (for page order), info (sent to AI), extra (kept here) }

    // a) text boxes, big text areas, dropdowns
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.closest('#formly-root')) return;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'input' && !TEXT_TYPES.includes(type)) return;
      if (el.disabled || el.readOnly || !isVisible(el)) return;

      const info = {
        question: questionLabel(el),
        required: el.required || el.getAttribute('aria-required') === 'true',
      };
      let kind = 'text';
      if (tag === 'select') {
        kind = 'select';
        info.type = 'dropdown';
        info.options = [...el.options]
          .map((o) => clean(o.text))
          .filter((t) => t && !/^(select|choose|please choose|--)/i.test(t));
      } else if (tag === 'textarea') {
        info.type = 'long_text';
      } else if (['email', 'tel', 'url', 'number', 'date'].includes(type)) {
        info.type = type;
      } else {
        info.type = 'short_text';
      }
      found.push({ anchor: el, info, extra: { kind, el } });
    });

    // b) choice questions (radio buttons + checkboxes), grouped into one question each
    const groups = new Map();
    const addToGroup = (key, el, multi) => {
      if (!groups.has(key)) groups.set(key, { multi, els: [] });
      groups.get(key).els.push(el);
    };

    // normal HTML radio buttons / checkboxes
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
      if (el.disabled || el.closest('#formly-root')) return;
      const lab = el.closest('label') || labelFor(el);
      if (!isVisible(el) && !isVisible(lab)) return;
      const key = el.name ? `${el.type}:${el.name}` : el;
      addToGroup(key, el, el.type === 'checkbox');
    });

    // "fake" radio buttons / checkboxes (Google Forms and many modern sites)
    document.querySelectorAll('[role="radio"], [role="checkbox"]').forEach((el) => {
      if (el.tagName === 'INPUT' || el.closest('#formly-root')) return;
      if (el.getAttribute('aria-disabled') === 'true' || !isVisible(el)) return;
      const multi = el.getAttribute('role') === 'checkbox';
      const box = el.closest('[role="radiogroup"]') || el.closest('[role="listitem"]') || el.parentElement;
      addToGroup(box, el, multi);
    });

    groups.forEach(({ multi, els }) => {
      const options = els.map(optionText);
      found.push({
        anchor: els[0],
        info: { question: groupLabel(els), type: multi ? 'checkboxes' : 'multiple_choice', options },
        extra: { kind: 'choice', multi, els, options },
      });
    });

    // put the questions in the same order as on the page
    found.sort((a, b) =>
      a.anchor.compareDocumentPosition(b.anchor) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );

    // give every question a simple id: f1, f2, f3...
    fieldMap = new Map();
    return found.map(({ info, extra }, i) => {
      const id = 'f' + (i + 1);
      fieldMap.set(id, { id, ...info, ...extra });
      return { id, ...info };
    });
  }

  // =============================================================
  // STEP 3 — PUT THE ANSWERS BACK INTO THE FORM
  // =============================================================

  // Type a value into a box in a way that React / Google Forms also notice.
  function setValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  // Find which option best matches the AI's answer.
  function bestMatch(options, answer) {
    const a = norm(answer);
    if (!a) return -1;
    let i = options.findIndex((o) => norm(o) === a);
    if (i === -1) i = options.findIndex((o) => norm(o) && (norm(o).includes(a) || a.includes(norm(o))));
    return i;
  }

  const isChecked = (el) =>
    el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true';

  function fillFields(answers) {
    document
      .querySelectorAll('.formly-filled, .formly-empty')
      .forEach((e) => e.classList.remove('formly-filled', 'formly-empty'));

    const byId = new Map(answers.map((a) => [a.id, a.value]));
    let filled = 0;

    fieldMap.forEach((f, id) => {
      const value = byId.get(id);
      const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
      const outline =
        f.kind === 'choice'
          ? f.els[0].closest('[role="listitem"], fieldset') || f.els[0].parentElement
          : f.el;

      if (isEmpty) {
        outline?.classList.add('formly-empty'); // orange = "please do this one yourself"
        return;
      }

      try {
        if (f.kind === 'text') {
          setValue(f.el, Array.isArray(value) ? value.join(', ') : String(value));
          filled++;
          f.el.classList.add('formly-filled');
        } else if (f.kind === 'select') {
          const opts = [...f.el.options];
          const i = bestMatch(opts.map((o) => o.text), String(value));
          if (i === -1) return outline?.classList.add('formly-empty');
          setValue(f.el, opts[i].value);
          filled++;
          f.el.classList.add('formly-filled');
        } else {
          let wanted = Array.isArray(value) ? value : [value];
          if (!f.multi) wanted = wanted.slice(0, 1); // radio = only one answer
          let any = false;
          wanted.forEach((w) => {
            const i = bestMatch(f.options, String(w));
            if (i === -1) return;
            if (!isChecked(f.els[i])) f.els[i].click();
            any = true;
          });
          outline?.classList.add(any ? 'formly-filled' : 'formly-empty');
          if (any) filled++;
        }
      } catch (e) {
        console.warn('[Formly] could not fill:', f.question, e);
        outline?.classList.add('formly-empty');
      }
    });
    return filled;
  }

  // =============================================================
  // THE BUTTON
  // =============================================================
  let root, btn, toastEl, toastTimer, observer, checkTimer;
  let busy = false;

  function ensureUI() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'formly-root';
    btn = document.createElement('button');
    btn.id = 'formly-fab';
    btn.type = 'button';
    btn.textContent = '✨ Fill with Formly';
    btn.addEventListener('click', runFill);
    root.appendChild(btn);
    document.documentElement.appendChild(root);
    observer?.disconnect();
  }

  function toast(msg, ms = 8000) {
    ensureUI();
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'formly-toast';
      root.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => (toastEl.style.display = 'none'), ms);
  }

  // STEP 2 — the whole flow when you press the button
  async function runFill() {
    if (busy) return;
    ensureUI();
    busy = true;
    btn.disabled = true;
    btn.textContent = '⏳ Reading the form…';

    try {
      const fields = collectFields(); // STEP 1
      if (!fields.length) {
        toast('I could not find any questions on this page.');
        return;
      }

      btn.textContent = `⏳ Answering ${fields.length} questions…`;
      const page = {
        title: document.title,
        url: location.href,
        intro: short(document.body?.innerText, 1200), // helps the AI tailor essays
      };

      // background.js builds the prompt, calls the AI, and splits the answers
      const res = await chrome.runtime.sendMessage({ type: 'FORMLY_ANSWER', page, fields });
      if (!res?.ok) {
        toast('⚠️ ' + (res?.error || 'Something went wrong.'), 12000);
        return;
      }

      const filled = fillFields(res.answers); // STEP 3
      const left = fields.length - filled;
      toast(
        `✅ Filled ${filled} of ${fields.length} questions.` +
          (left ? ` ${left} left for you (orange boxes).` : '') +
          ' Check everything, then press Submit yourself.',
        15000
      );
    } catch (e) {
      const msg = /context invalidated/i.test(e.message)
        ? 'Formly was updated. Please refresh this page and try again.'
        : e.message;
      toast('⚠️ ' + msg, 12000);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = '✨ Fill with Formly';
    }
  }

  // Only show the button on pages that look like forms.
  function countBoxes() {
    return document.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset])' +
        ':not([type=image]):not([type=file]):not([type=password]):not([type=search]),' +
        'textarea, select, [role=radio], [role=checkbox]'
    ).length;
  }
  function maybeShowButton() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      if (!root && countBoxes() >= MIN_FIELDS) ensureUI();
    }, 800);
  }
  observer = new MutationObserver(maybeShowButton); // for forms that load late
  observer.observe(document.documentElement, { childList: true, subtree: true });
  maybeShowButton();

  // The popup's "Fill this page" button also works
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'FORMLY_FILL') runFill();
  });
})();
