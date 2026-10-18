// Course platform: renders dist/course.json, task widgets, progress in localStorage.
'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const LS_KEY = 'pycourse.v1';
const state = { passed: {}, drafts: {}, checklists: {}, current: null, collapsed: {} };

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (s && typeof s === 'object') applyState(s);
  } catch (e) { /* storage unavailable: keep in-memory state */ }
}
function applyState(s) {
  for (const k of ['passed', 'drafts', 'checklists', 'collapsed']) {
    state[k] = s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) ? s[k] : {};
  }
  state.current = typeof s.current === 'string' ? s.current : null;
}
let saveTimer = null;
function save(now) {
  clearTimeout(saveTimer);
  const write = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  if (now) write(); else saveTimer = setTimeout(write, 250);
}
window.addEventListener('beforeunload', () => save(true));

// ---------------------------------------------------------------------------
// Course model
// ---------------------------------------------------------------------------
let COURSE = null;
let LESSONS = [];       // all lessons in order (written and planned)
let WRITTEN = [];       // written lessons only
const byId = new Map();

const taskKey = (lesson, task) => `${lesson.id}/${task.id}`;
const passedCount = (lesson) => lesson.tasks.filter((t) => state.passed[taskKey(lesson, t)]).length;
function lessonStatus(lesson) {
  if (!lesson.written) return 'planned';
  const total = lesson.tasks.length, p = passedCount(lesson);
  if (total && p === total) return 'done';
  return p > 0 ? 'part' : 'none';
}
function lessonNumber(lesson) {
  const m = /^l(\d+)/.exec(lesson.slug);
  return m ? String(+m[1]) : '';
}
function moduleNumber(mod) {
  const m = /^m(\d+)/.exec(mod.id);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
// Safe inline text: escapes HTML, renders `code` spans only (hints, options, checklist items).
function inlineText(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}
function toast(msg) {
  const el = h(`<div class="toast" role="status">${esc(msg)}</div>`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Скопійовано'); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Скопійовано'); } catch (_) { toast('Не вдалося скопіювати'); }
    ta.remove();
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
const LANG_ALIASES = {
  py: 'python', python3: 'python', ts: 'typescript', tsx: 'typescript', js: 'typescript', javascript: 'typescript',
  sh: 'bash', shell: 'bash', console: 'bash', zsh: 'bash', toml: 'ini', jsonc: 'json', yml: 'yaml',
  text: 'plaintext', txt: 'plaintext', '': 'plaintext', docker: 'dockerfile',
};
const LANG_LABELS = { typescript: 'ts', plaintext: '' };

function highlight(code, lang) {
  const l = LANG_ALIASES[lang] ?? lang;
  if (window.hljs && l && l !== 'plaintext' && hljs.getLanguage(l)) {
    try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch (e) { /* fall through */ }
  }
  return esc(code);
}
function codeBlockHTML(code, langRaw) {
  const lang = (langRaw || '').trim().split(/\s+/)[0].toLowerCase();
  const label = lang === 'text' ? '' : lang;
  const norm = LANG_ALIASES[lang] ?? lang;
  return `<div class="code-block">${label ? `<span class="code-lang">${esc(label)}</span>` : ''}<pre class="snippet"><code class="hljs language-${esc(norm)}">${highlight(code.replace(/\n$/, ''), lang)}</code></pre></div>`;
}

const CALLOUTS = [
  { marker: 'JS-аналог.', cls: 'c-js', tag: 'JS' },
  { marker: 'Пастка.', cls: 'c-trap', tag: 'Пастка' },
  { marker: 'Під капотом.', cls: 'c-hood', tag: 'Механізм' },
  { marker: 'Для капстоуну.', cls: 'c-cap', tag: 'Капстоун' },
];

let headingSlugs = new Set();
function slugify(text) {
  let base = String(text).toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'section';
  if (/^t\d|^q\d|^p\d/.test(base)) base = 's-' + base;
  let slug = base, i = 2;
  while (headingSlugs.has(slug)) slug = `${base}-${i++}`;
  headingSlugs.add(slug);
  return slug;
}

if (window.marked) {
  marked.use({
    gfm: true,
    renderer: {
      code(token) {
        return codeBlockHTML(token.text, token.lang);
      },
      heading(token) {
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth === 2) return `<h2 id="${slugify(inner)}">${inner}</h2>\n`;
        if (token.depth === 1) return `<h2 id="${slugify(inner)}">${inner}</h2>\n`;
        return `<h${token.depth}>${inner}</h${token.depth}>\n`;
      },
      blockquote(token) {
        const body = this.parser.parse(token.tokens);
        for (const c of CALLOUTS) {
          const re = new RegExp(`^<p><strong>${c.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</strong>\\s*`);
          if (re.test(body)) {
            const rest = body.replace(re, '<p>');
            return `<div class="callout ${c.cls}" role="note"><span class="tag">${esc(c.tag)}</span><div class="cbody">${rest}</div></div>\n`;
          }
        }
        return `<blockquote class="plain">${body}</blockquote>\n`;
      },
    },
  });
}

function mdToHTML(src) {
  if (!src) return '';
  return marked.parse(String(src));
}

// Replace `<!-- task: id -->` lines (outside fenced code) with HTML slots.
function injectTaskSlots(body) {
  const lines = body.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      const tok = f[1];
      if (fence === null) fence = tok;
      else if (tok[0] === fence[0] && tok.length >= fence.length && !line.trim().slice(tok.length).trim()) fence = null;
      continue;
    }
    if (fence === null) {
      const m = /^\s*<!--\s*task:\s*([A-Za-z0-9_-]+)\s*-->\s*$/.exec(line);
      if (m) lines[i] = `\n<div class="task-slot" data-task-slot="${m[1]}"></div>\n`;
    }
  }
  return lines.join('\n');
}

// Splits lesson markdown into rendered HTML with placeholders for live blocks and ts/python pairs.
function renderLessonBody(body) {
  headingSlugs = new Set();
  const tokens = marked.lexer(injectTaskSlots(body));
  const parts = [];      // html strings
  const lives = [];      // {code, expected}
  let group = [];
  const flush = () => {
    if (group.length) {
      group.links = tokens.links;
      parts.push(marked.parser(group));
      group = [];
    }
  };
  const langOf = (t) => (t && t.type === 'code' ? (t.lang || '').trim().toLowerCase().split(/\s+/) : null);
  const nextIdx = (i) => { let j = i + 1; while (j < tokens.length && tokens[j].type === 'space') j++; return j; };
  const liveSlot = (code, expected) => {
    lives.push({ code, expected });
    return `<div class="live-slot" data-live="${lives.length - 1}"></div>`;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lang = langOf(t);
    if (!lang) { group.push(t); continue; }
    const isLive = lang[0] === 'python' && lang.includes('live');
    if (lang[0] === 'ts' || lang[0] === 'typescript') {
      const j = nextIdx(i);
      const nl = langOf(tokens[j]);
      if (nl && nl[0] === 'python') {
        flush();
        let right;
        if (nl.includes('live')) {
          const k = nextIdx(j);
          const kl = langOf(tokens[k]);
          const hasExpected = !!(kl && kl[0] === 'text');
          right = liveSlot(tokens[j].text, hasExpected ? tokens[k].text : null);
          i = hasExpected ? k : j;
        } else {
          right = codeBlockHTML(tokens[j].text, 'python');
          i = j;
        }
        parts.push(`<div class="pair"><div class="pair-col"><div class="pair-label">TypeScript</div>${codeBlockHTML(t.text, 'ts')}</div><div class="pair-col"><div class="pair-label">Python</div>${right}</div></div>`);
        continue;
      }
    }
    if (isLive) {
      flush();
      const j = nextIdx(i);
      const jl = langOf(tokens[j]);
      if (jl && jl[0] === 'text') { parts.push(liveSlot(t.text, tokens[j].text)); i = j; }
      else parts.push(liveSlot(t.text, null));
      continue;
    }
    group.push(t);
  }
  flush();
  return { html: parts.join('\n'), lives };
}

// ---------------------------------------------------------------------------
// Editor (Ace, with textarea fallback)
// ---------------------------------------------------------------------------
if (window.ace) {
  ace.config.set('basePath', 'vendor/ace/');
  ace.config.set('loadWorkerFromBlob', false);
}

function makeEditor(host, value, { onChange, onRun, minLines = 3, maxLines = 40, label } = {}) {
  if (window.ace) {
    const ed = ace.edit(host, {
      mode: 'ace/mode/python',
      theme: 'ace/theme/tomorrow_night',
      value,
      minLines, maxLines,
      tabSize: 4, useSoftTabs: true, navigateWithinSoftTabs: true,
      showPrintMargin: false, highlightActiveLine: true, highlightGutterLine: false,
      fontSize: '13.5px', fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
      useWorker: false, wrap: false, scrollPastEnd: 0, fixedWidthGutter: true,
      behavioursEnabled: true, displayIndentGuides: true, highlightSelectedWord: false,
    });
    ed.session.setUseWorker(false);
    ed.renderer.setScrollMargin(10, 10, 0, 0);
    ed.renderer.setPadding(10);
    ed.clearSelection();
    ed.textInput.getElement().setAttribute('aria-label', label || 'Редактор коду Python');
    if (onRun) {
      ed.commands.addCommand({ name: 'run', bindKey: { win: 'Ctrl-Enter', mac: 'Cmd-Enter' }, exec: () => onRun() });
    }
    // Escape releases focus so keyboard users can Tab out of the editor.
    ed.commands.addCommand({ name: 'blur', bindKey: { win: 'Esc', mac: 'Esc' }, exec: (e) => e.blur() });
    if (onChange) ed.session.on('change', () => onChange(ed.getValue()));
    return {
      getValue: () => ed.getValue(),
      setValue: (v) => { ed.setValue(v, -1); },
      focus: () => ed.focus(),
    };
  }
  // Fallback: textarea with Tab = 4 spaces and indentation on Enter.
  const ta = document.createElement('textarea');
  ta.className = 'editor';
  ta.spellcheck = false;
  ta.value = value;
  ta.setAttribute('aria-label', label || 'Редактор коду Python');
  ta.rows = Math.min(Math.max(value.split('\n').length + 1, minLines), maxLines);
  host.appendChild(ta);
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onRun) { e.preventDefault(); onRun(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault(); ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter') {
      const st = ta.selectionStart; const before = ta.value.slice(0, st);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const ind = (line.match(/^ */) || [''])[0] + (line.trimEnd().endsWith(':') ? '    ' : '');
      e.preventDefault(); ta.setRangeText('\n' + ind, st, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  });
  if (onChange) ta.addEventListener('input', () => onChange(ta.value));
  return { getValue: () => ta.value, setValue: (v) => { ta.value = v; }, focus: () => ta.focus() };
}

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------
function streamsHTML(r, { title = 'Вивід', right = '' } = {}) {
  const out = r.stdout || '';
  const err = r.stderr || '';
  let body = '';
  if (out) body += `<pre class="out">${esc(out)}</pre>`;
  if (err) body += `<pre class="err" aria-label="stderr">${esc(err)}</pre>`;
  if (!body) body = '<pre class="placeholder">(нічого не виведено)</pre>';
  return `<div class="outbox"><div class="out-h"><span>${esc(title)}</span>${err && out ? '<span>stdout + stderr</span>' : err ? '<span>stderr</span>' : ''}<span class="r">${right}</span></div>${body}</div>`;
}
function runMeta(r) {
  const info = PyRunner.info();
  const parts = [];
  if (info.python) parts.push(`Python ${info.python}`);
  if (r && r.ms) parts.push(`${r.ms} мс`);
  return esc(parts.join(' · '));
}
function interruptedHTML(r) {
  if (r.timedOut) return `<div class="verdict warn"><b>Зупинено за таймаутом.</b> Код виконувався довше ${PyRunner.TIMEOUT_MS / 1000} секунд; схоже на нескінченний цикл. Python перезапущено.</div>`;
  if (r.stopped) return '<div class="verdict warn"><b>Виконання зупинено.</b> Python перезапущено.</div>';
  return '';
}
function diffHTML(actual, expected) {
  const a = actual.split('\n'), e = expected.split('\n');
  let first = -1;
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) { first = i; break; }
  }
  const col = (lines, other) => {
    if (lines.length === 1 && lines[0] === '') return '<span class="' + (first === 0 ? 'first' : '') + '"><i>(порожньо)</i></span>';
    let html = lines.map((l, i) => `<span class="${i === first ? 'first' : ''}">${esc(l) || ' '}</span>`).join('');
    if (first >= lines.length && first < other.length) html += '<span class="first"><i>(рядка немає)</i></span>';
    return html;
  };
  return `<div class="diff"><div><div class="dh">Ваш вивід</div><pre>${col(a, e)}</pre></div><div><div class="dh">Очікується</div><pre>${col(e, a)}</pre></div></div>`;
}

// Runs code with a button set: wires Stop, status line, and returns the result.
async function runWithUI(code, ui, packages) {
  ui.setBusy(true);
  const handle = PyRunner.run(code, {
    packages,
    onStatus: (text) => { ui.status.textContent = text || ''; },
  });
  ui.stopBtn.onclick = () => PyRunner.stop(handle.id);
  const r = await handle.promise;
  ui.status.textContent = '';
  ui.setBusy(false);
  return r;
}
function makeRunUI(root) {
  const stopBtn = $('[data-stop]', root);
  const status = $('.run-status', root);
  const btns = [...root.querySelectorAll('[data-run],[data-check]')];
  return {
    stopBtn, status,
    setBusy(b) {
      btns.forEach((x) => { x.disabled = b; });
      stopBtn.hidden = !b;
    },
  };
}

// ---------------------------------------------------------------------------
// Live blocks
// ---------------------------------------------------------------------------
function mountLive(slot, live) {
  const initial = live.code.replace(/\n$/, '');
  const expected = live.expected != null ? live.expected.replace(/\n$/, '') : null;
  const el = h(`<div class="live">
    <div class="editor-wrap"><span class="editor-label">живий приклад</span><div class="ace-host"></div></div>
    <div class="actions">
      <button class="btn primary" data-run title="Cmd/Ctrl+Enter">Запустити</button>
      <button class="btn" data-reset title="Повернути початковий код">Скинути</button>
      <button class="btn danger" data-stop hidden>Зупинити</button>
      <span class="run-status" aria-live="polite"></span>
    </div>
    <div class="outgrid" data-out></div>
  </div>`);
  slot.replaceWith(el);
  const out = $('[data-out]', el);
  const ui = makeRunUI(el);
  const showExpectedOnly = () => {
    out.className = 'outgrid';
    out.innerHTML = expected != null
      ? `<div class="outbox"><div class="out-h"><span>Очікуваний вивід</span></div><pre>${esc(expected)}</pre></div>`
      : '';
  };
  showExpectedOnly();
  const run = async () => {
    if (!$('[data-run]', el).disabled) {
      out.className = expected != null ? 'outgrid two' : 'outgrid';
      const r = await runWithUI(editor.getValue(), ui);
      let actual = streamsHTML(r, { title: 'Фактичний вивід', right: runMeta(r) });
      if (expected != null && !r.timedOut && !r.stopped) {
        const same = normalizeOutput(r.stdout + (r.stderr ? r.stderr : '')) === normalizeOutput(expected)
          || normalizeOutput(r.stdout) === normalizeOutput(expected);
        if (same) {
          actual = actual.replace('<div class="outbox">', '<div class="outbox match">')
            .replace('<span class="r">', '<span class="r"><span class="badge ok">збігається з очікуваним</span> ');
        }
      }
      out.innerHTML = interruptedHTML(r) + actual
        + (expected != null ? `<div class="outbox"><div class="out-h"><span>Очікуваний вивід</span></div><pre>${esc(expected)}</pre></div>` : '');
    }
  };
  const editor = makeEditor($('.ace-host', el), initial, { onRun: run, label: 'Живий приклад Python' });
  $('[data-run]', el).addEventListener('click', run);
  $('[data-reset]', el).addEventListener('click', () => { editor.setValue(initial); showExpectedOnly(); });
}

// ---------------------------------------------------------------------------
// Task widgets
// ---------------------------------------------------------------------------
const widgetUpdaters = new Map(); // key -> fn() to refresh status label

function statusLabel(ok) { return ok ? 'Виконано' : 'Не виконано'; }
function taskHeader(kind, kindLabel, title, ok, extra = '') {
  return `<div class="task-h"><span class="kind ${kind}">${kindLabel}</span><h3>${title}</h3>${extra}<span class="status ${ok ? 'ok' : ''}" data-status>${statusLabel(ok)}</span></div>`;
}
function setPassed(key, value) {
  if (value) state.passed[key] = true; else delete state.passed[key];
  save(true);
  const up = widgetUpdaters.get(key);
  if (up) up();
  refreshProgress();
}
function updateStatusEl(sec, key) {
  const s = $('[data-status]', sec);
  const ok = !!state.passed[key];
  s.textContent = statusLabel(ok);
  s.className = 'status' + (ok ? ' ok' : '');
}

function mountTask(slot, lesson, task) {
  const key = taskKey(lesson, task);
  let el;
  if (task.type === 'quiz') el = quizWidget(lesson, task, key);
  else if (task.type === 'project') el = projectWidget(lesson, task, key);
  else if (task.runtime === 'local') el = localCodeWidget(lesson, task, key);
  else el = codeWidget(lesson, task, key);
  el.id = `task-${task.id}`;
  el.dataset.key = key;
  el.classList.add('task');
  slot.replaceWith(el);
  if (el._mount) el._mount();
  widgetUpdaters.set(key, () => updateStatusEl(el, key));
}

function hintsController(sec, task) {
  const box = $('[data-hints]', sec);
  const btn = $('[data-hint]', sec);
  const hints = task.hints || [];
  let shown = 0, solutionShown = false;
  const label = () => {
    if (solutionShown) { btn.hidden = true; return; }
    btn.textContent = shown < hints.length ? (shown ? `Ще підказка (${shown + 1}/${hints.length})` : 'Підказка') : 'Показати рішення';
  };
  const next = () => {
    if (shown < hints.length) {
      box.insertAdjacentHTML('beforeend', `<div class="hint"><b>Підказка ${shown + 1}.</b> ${inlineText(hints[shown])}</div>`);
      shown++;
    } else if (!solutionShown) {
      if (!confirm('Показати рішення? Спробуйте ще раз, якщо є ідеї: рішення краще дивитися після власної спроби.')) return;
      solutionShown = true;
      const sol = h(`<div class="hint"><b>Рішення.</b>${codeBlockHTML(task.solution || '', 'python')}${sec._editor ? '<div class="actions"><button class="btn small" data-use-solution>Вставити в редактор</button></div>' : ''}</div>`);
      box.appendChild(sol);
      const use = $('[data-use-solution]', sol);
      if (use) use.addEventListener('click', () => sec._editor.setValue(task.solution.replace(/\n$/, '') + '\n'));
    }
    label();
  };
  btn.addEventListener('click', next);
  label();
  return { next, get shown() { return shown; } };
}

function codeWidget(lesson, task, key) {
  const ok = !!state.passed[key];
  const starter = (task.starter || '').replace(/\n$/, '') + '\n';
  const req = (task.requires || []).length ? `<span class="req" title="Потрібні пакети">${esc(task.requires.join(', '))}</span>` : '';
  const checkBlock = task.harness
    ? `<details class="harness"><summary>Перевірка додасть до вашого коду</summary>${codeBlockHTML(task.harness, 'python')}</details>`
    : task.asserts
      ? `<details class="harness"><summary>Перевірка виконає після вашого коду</summary>${codeBlockHTML(task.asserts, 'python')}</details>`
      : '';
  const sec = h(`<section>
    ${taskHeader('', 'Завдання', esc(task.title), ok, req)}
    <div class="task-body">
      <div class="prompt">${mdToHTML(task.prompt)}</div>
      ${checkBlock}
      <div class="editor-wrap"><span class="editor-label">main.py</span><div class="ace-host"></div></div>
      <div class="actions">
        <button class="btn" data-run title="Виконати лише ваш код">Запустити</button>
        <button class="btn primary" data-check title="Cmd/Ctrl+Enter">Перевірити</button>
        <button class="btn" data-reset title="Повернути стартовий код">Скинути</button>
        <button class="btn danger" data-stop hidden>Зупинити</button>
        <span class="run-status" aria-live="polite"></span>
        <button class="linkbtn push" data-hint>Підказка</button>
      </div>
      <div data-result aria-live="polite"></div>
      <div class="hints" data-hints></div>
    </div>
  </section>`);
  sec._mount = () => {
    const res = $('[data-result]', sec);
    const ui = makeRunUI(sec);
    let fails = 0;
    const editor = makeEditor($('.ace-host', sec), state.drafts[key] ?? starter, {
      minLines: Math.max(4, starter.split('\n').length + 1),
      onChange: (v) => { if (v === starter) delete state.drafts[key]; else state.drafts[key] = v; save(); },
      onRun: () => check(),
      label: `Редактор: ${task.title}`,
    });
    sec._editor = editor;
    const hints = hintsController(sec, task);

    $('[data-reset]', sec).addEventListener('click', () => {
      const cur = editor.getValue();
      if (cur !== starter && cur.trim() && !confirm('Скинути редактор до стартового коду? Ваш код буде втрачено.')) return;
      editor.setValue(starter);
      delete state.drafts[key]; save();
      res.innerHTML = '';
    });

    $('[data-run]', sec).addEventListener('click', async () => {
      res.innerHTML = '';
      const r = await runWithUI(editor.getValue(), ui, task.requires);
      res.innerHTML = interruptedHTML(r) + (r.timedOut || r.stopped ? '' : `<div class="outgrid">${streamsHTML(r, { right: runMeta(r) })}</div>`);
    });

    async function check() {
      if ($('[data-check]', sec).disabled) return;
      res.innerHTML = '';
      const program = buildCheckProgram(editor.getValue(), task);
      const r = await runWithUI(program, ui, task.requires);
      if (r.timedOut || r.stopped) { res.innerHTML = interruptedHTML(r); return; }
      let html = '';
      let passed = false;
      if (task.expected != null) {
        const actual = normalizeOutput(r.stdout);
        const expected = normalizeOutput(task.expected);
        if (r.ok && actual === expected) {
          passed = true;
          html += '<div class="verdict ok"><b>Правильно.</b> Вивід збігається з очікуваним.</div>';
          html += `<div class="outgrid">${streamsHTML(r, { right: runMeta(r) })}</div>`;
        } else {
          html += r.ok
            ? '<div class="verdict bad"><b>Поки не те.</b> Вивід відрізняється від очікуваного; перший рядок, що розійшовся, підсвічено.</div>'
            : `<div class="verdict bad"><b>Код завершився з помилкою ${esc(r.error?.type || '')}.</b> Traceback нижче: читайте знизу вгору.</div>`;
          html += diffHTML(actual, expected);
          if (r.stderr) html += `<div class="outgrid"><div class="outbox"><div class="out-h"><span>stderr</span><span class="r">${runMeta(r)}</span></div><pre class="err">${esc(r.stderr)}</pre></div></div>`;
        }
      } else {
        if (r.ok) {
          passed = true;
          html += '<div class="verdict ok"><b>Правильно.</b> Усі перевірки пройшли.</div>';
          if (r.stdout || r.stderr) html += `<div class="outgrid">${streamsHTML(r, { right: runMeta(r) })}</div>`;
        } else if (r.error?.type === 'AssertionError') {
          html += `<div class="verdict bad"><b>Перевірка не пройшла.</b><span class="msg">${esc(r.error.message || 'assert без повідомлення')}</span></div>`;
          if (r.stdout) html += `<div class="outgrid">${streamsHTML({ stdout: r.stdout }, { right: runMeta(r) })}</div>`;
        } else {
          html += `<div class="verdict bad"><b>Код завершився з помилкою ${esc(r.error?.type || '')}.</b> Traceback нижче: читайте знизу вгору.</div>`;
          html += `<div class="outgrid">${streamsHTML(r, { right: runMeta(r) })}</div>`;
        }
      }
      res.innerHTML = html;
      if (passed) {
        if (!state.passed[key]) setPassed(key, true);
      } else {
        fails++;
        if (fails >= 2 && hints.shown === 0 && (task.hints || []).length) hints.next();
      }
    }
    $('[data-check]', sec).addEventListener('click', check);
  };
  return sec;
}

function localCodeWidget(lesson, task, key) {
  const ok = !!state.passed[key];
  const cmd = task.verify || task.command || '';
  const sec = h(`<section>
    ${taskHeader('', 'Завдання', esc(task.title), ok)}
    <div class="task-body">
      <div class="prompt">${mdToHTML(task.prompt)}</div>
      ${task.starter ? `<div class="pair-label">Стартовий код</div>${codeBlockHTML(task.starter, 'python')}` : ''}
      <div class="local-box">
        <h4>Виконується локально</h4>
        <p style="margin:0 0 6px">Це завдання не запускається в браузері. Виконайте його у своєму терміналі${cmd ? ' і перевірте командою:' : '.'}</p>
        ${cmd ? `<div class="cmd"><code>${esc(cmd)}</code><button class="btn small" data-copy>Копіювати</button></div>` : ''}
        <label class="check"><input type="checkbox" data-done ${ok ? 'checked' : ''}> <span>Зроблено</span></label>
      </div>
      <div class="actions"><button class="linkbtn push" data-hint>Підказка</button></div>
      <div class="hints" data-hints></div>
    </div>
  </section>`);
  sec._mount = () => {
    hintsController(sec, task);
    const copy = $('[data-copy]', sec);
    if (copy) copy.addEventListener('click', () => copyText(cmd));
    const box = $('[data-done]', sec);
    box.addEventListener('change', () => setPassed(key, box.checked));
  };
  return sec;
}

function quizWidget(lesson, task, key) {
  const ok = !!state.passed[key];
  const sec = h(`<section>
    ${taskHeader('quiz', 'Тест', esc(task.title || 'Перевірте себе'), ok)}
    <div class="task-body">
      <div class="prompt">${mdToHTML(task.question)}</div>
      <div class="options" role="group" aria-label="Варіанти відповіді">
        ${task.options.map((o, i) => {
          const mono = !/[\u0400-\u04FF]/.test(o) && !/`/.test(o);
          return `<button class="opt" data-opt="${i}"><span class="k">${String.fromCharCode(65 + i)}</span><span class="ov${mono ? ' mono' : ''}">${inlineText(o)}</span></button>`;
        }).join('')}
      </div>
      <div data-result aria-live="polite"></div>
    </div>
  </section>`);
  sec._mount = () => {
    const res = $('[data-result]', sec);
    const opts = [...sec.querySelectorAll('.opt')];
    const show = (chosen) => {
      opts.forEach((b) => b.classList.remove('right', 'wrong'));
      opts[task.answer].classList.add('right');
      const correct = chosen === task.answer;
      if (!correct && chosen != null) opts[chosen].classList.add('wrong');
      res.innerHTML = (chosen == null ? ''
        : correct ? '<div class="verdict ok"><b>Правильно.</b></div>'
          : '<div class="verdict bad"><b>Ні.</b> Прочитайте пояснення і спробуйте ще раз.</div>')
        + `<div class="explain">${mdToHTML(task.explain)}</div>`;
      return correct;
    };
    if (state.passed[key]) show(null);
    opts.forEach((b) => b.addEventListener('click', () => {
      const correct = show(+b.dataset.opt);
      if (correct && !state.passed[key]) setPassed(key, true);
    }));
  };
  return sec;
}

function projectWidget(lesson, task, key) {
  const items = task.checklist || [];
  const saved = state.checklists[key] || [];
  const ok = !!state.passed[key];
  const sec = h(`<section>
    ${taskHeader('project', 'Проєкт', esc(task.title), ok)}
    <div class="task-body">
      <div class="prompt">${mdToHTML(task.prompt)}</div>
      <div class="checklist" role="group" aria-label="Критерії готовності">
        ${items.map((it, i) => `<label class="check"><input type="checkbox" data-i="${i}" ${saved[i] ? 'checked' : ''}><span>${inlineText(it)}</span></label>`).join('')}
      </div>
      ${task.verify ? `<div class="local-box"><h4>Перевірка</h4><div class="cmd"><code>${esc(task.verify)}</code><button class="btn small" data-copy>Копіювати</button></div></div>` : ''}
    </div>
  </section>`);
  sec._mount = () => {
    const copy = $('[data-copy]', sec);
    if (copy) copy.addEventListener('click', () => copyText(task.verify));
    const boxes = [...sec.querySelectorAll('input[data-i]')];
    boxes.forEach((b) => b.addEventListener('change', () => {
      const arr = boxes.map((x) => x.checked);
      state.checklists[key] = arr;
      const all = arr.length > 0 && arr.every(Boolean);
      if (all !== !!state.passed[key]) setPassed(key, all); else save(true);
    }));
  };
  return sec;
}

// ---------------------------------------------------------------------------
// Layout: left tree
// ---------------------------------------------------------------------------
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
function renderLeft() {
  const el = $('#left');
  el.innerHTML = COURSE.modules.map((m) => {
    const written = m.lessons.filter((l) => l.written);
    const total = written.reduce((a, l) => a + l.tasks.length, 0);
    const done = written.reduce((a, l) => a + passedCount(l), 0);
    const collapsed = !!state.collapsed[m.id];
    const planned = written.length === 0;
    return `<div class="module ${collapsed ? 'collapsed' : ''} ${planned ? 'planned' : ''}" data-module="${esc(m.id)}">
      <button class="module-h" data-toggle="${esc(m.id)}" aria-expanded="${!collapsed}">${CHEV}<span class="t">${esc(m.title)}</span><small>${planned ? 'ще не написано' : `${done}/${total}`}</small></button>
      <div class="lessons">${m.lessons.map((l) => {
        if (!l.written) {
          return `<div class="lesson-btn planned" title="Урок ще не написано"><span class="dot planned"></span><span class="n">${lessonNumber(l)}</span><span class="lt">${esc(l.title)}<small>ще не написано</small></span></div>`;
        }
        const st = lessonStatus(l);
        const label = { done: 'виконано', part: 'частково', none: 'не почато' }[st];
        return `<a class="lesson-btn ${l.id === state.current ? 'active' : ''}" href="#${esc(l.id)}" data-lesson="${esc(l.id)}" ${l.id === state.current ? 'aria-current="page"' : ''}><span class="dot ${st}" title="${label}" aria-label="${label}"></span><span class="n">${lessonNumber(l)}</span><span class="lt">${esc(l.title)}</span></a>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}
$('#left').addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const id = t.dataset.toggle;
    state.collapsed[id] = !state.collapsed[id];
    if (!state.collapsed[id]) delete state.collapsed[id];
    save(true);
    renderLeft();
    return;
  }
  if (e.target.closest('[data-lesson]')) closeDrawer();
});

// ---------------------------------------------------------------------------
// Layout: center
// ---------------------------------------------------------------------------
let renderedLessonId = null;
function neighbours(lesson) {
  const i = WRITTEN.indexOf(lesson);
  return { prev: WRITTEN[i - 1] || null, next: WRITTEN[i + 1] || null };
}

function renderLesson(lesson) {
  const mod = COURSE.modules.find((m) => m.id === lesson.module);
  const el = $('#lesson');
  widgetUpdaters.clear();
  const { html, lives } = renderLessonBody(lesson.body || '');
  const { prev, next } = neighbours(lesson);
  const meta = [];
  if (lesson.duration_min) meta.push(`≈ ${lesson.duration_min} хв`);
  if (lesson.tasks.length) meta.push(`${lesson.tasks.length} завдань`);
  el.innerHTML = `
    <div class="eyebrow"><span>Модуль ${moduleNumber(mod)}</span><span>·</span><span>Урок ${lessonNumber(lesson)}</span><span>·</span><span>${esc(lesson.id)}</span></div>
    <h1>${esc(lesson.title)}</h1>
    ${lesson.summary ? `<p class="lead">${inlineText(lesson.summary)}</p>` : ''}
    <p class="lesson-meta">${esc(meta.join(' · '))}</p>
    <div class="lesson-body">${html}</div>
    <nav class="lesson-footer" aria-label="Сусідні уроки">
      ${prev ? `<a class="btn" href="#${esc(prev.id)}">← ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="btn primary" href="#${esc(next.id)}">Наступний урок: ${esc(next.title)} →</a>` : ''}
    </nav>`;
  const tasks = new Map(lesson.tasks.map((t) => [t.id, t]));
  el.querySelectorAll('[data-task-slot]').forEach((slot) => {
    const t = tasks.get(slot.dataset.taskSlot);
    if (t) mountTask(slot, lesson, t);
    else slot.replaceWith(h(`<div class="verdict bad">Завдання ${esc(slot.dataset.taskSlot)} не знайдено в tasks.yaml</div>`));
  });
  el.querySelectorAll('[data-live]').forEach((slot) => mountLive(slot, lives[+slot.dataset.live]));
  renderedLessonId = lesson.id;
  $('#center').style.scrollBehavior = 'auto';
  $('#center').scrollTop = 0;
  $('#center').style.scrollBehavior = '';
  document.title = `${lesson.title} · ${COURSE.title}`;
}

// ---------------------------------------------------------------------------
// Layout: right column
// ---------------------------------------------------------------------------
function sectionsOf() {
  const body = $('#lesson .lesson-body');
  if (!body) return [];
  const out = [];
  let cur = null;
  for (const child of body.children) {
    if (child.tagName === 'H2') { cur = { h: child, keys: [] }; out.push(cur); continue; }
    if (cur && child.dataset && child.dataset.key) cur.keys.push(child.dataset.key);
  }
  return out;
}
function renderRight(lesson) {
  const el = $('#right');
  const secs = sectionsOf();
  const total = lesson.tasks.length, p = passedCount(lesson);
  const { prev, next } = neighbours(lesson);
  el.innerHTML = `<h4>На цій сторінці</h4>
    <ul class="toc">${secs.map((s) => {
      let mark = '';
      if (s.keys.length) {
        const done = s.keys.filter((k) => state.passed[k]).length;
        mark = done === s.keys.length ? `<span class="m ok" title="Завдання розділу виконано">✓</span>`
          : `<span class="m" title="Виконано завдань у розділі">${done}/${s.keys.length}</span>`;
      }
      return `<li><a href="#${esc(lesson.id)}" data-sec="${esc(s.h.id)}"><span class="tt">${esc(s.h.textContent)}</span>${mark}</a></li>`;
    }).join('')}</ul>
    <div class="lesson-stats">Завдань у цьому уроці<b>${p} / ${total}</b>${total && p === total ? '<span class="done">Урок пройдено</span>' : ''}</div>
    <div class="navbtns">
      ${prev ? `<a class="btn" href="#${esc(prev.id)}"><small>Попередній урок</small>${esc(prev.title)}</a>` : ''}
      ${next ? `<a class="btn primary" href="#${esc(next.id)}"><small>Наступний урок</small>${esc(next.title)}</a>` : ''}
    </div>`;
  updateSpy();
}
$('#right').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-sec]');
  if (!a) return;
  e.preventDefault();
  const target = document.getElementById(a.dataset.sec);
  if (target) target.scrollIntoView({ block: 'start' });
});

let spyRaf = 0;
function updateSpy() {
  const center = $('#center');
  const heads = [...document.querySelectorAll('#lesson .lesson-body > h2')];
  const top = center.getBoundingClientRect().top + 90;
  let current = heads[0];
  for (const hd of heads) { if (hd.getBoundingClientRect().top <= top) current = hd; else break; }
  if (center.scrollTop + center.clientHeight >= center.scrollHeight - 4 && heads.length) current = heads[heads.length - 1];
  document.querySelectorAll('#right .toc a').forEach((a) => {
    a.classList.toggle('current', !!current && a.dataset.sec === current.id);
  });
}
$('#center').addEventListener('scroll', () => {
  cancelAnimationFrame(spyRaf);
  spyRaf = requestAnimationFrame(updateSpy);
}, { passive: true });

// ---------------------------------------------------------------------------
// Header progress
// ---------------------------------------------------------------------------
function refreshHeader() {
  const total = WRITTEN.reduce((a, l) => a + l.tasks.length, 0);
  const done = WRITTEN.reduce((a, l) => a + passedCount(l), 0);
  $('#globalText').textContent = `${done} / ${total}`;
  $('#globalBar').style.width = (total ? (done / total) * 100 : 0) + '%';
  $('#globalBarWrap').setAttribute('aria-valuenow', String(done));
  $('#globalBarWrap').setAttribute('aria-valuemax', String(total));
}
function refreshProgress() {
  refreshHeader();
  renderLeft();
  const l = byId.get(renderedLessonId);
  if (l) renderRight(l);
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [lid, tid] = raw.split('/');
  return { lid, tid };
}
function scrollToTask(tid) {
  const el = document.getElementById(`task-${tid}`);
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'start' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  });
}
function route() {
  const { lid, tid } = parseHash();
  let lesson = byId.get(lid);
  if (!lesson || !lesson.written) {
    lesson = byId.get(state.current);
    if (!lesson || !lesson.written) lesson = WRITTEN[0];
    if (!lesson) { $('#lesson').innerHTML = '<p class="error-screen">У курсі ще немає написаних уроків.</p>'; return; }
    history.replaceState(null, '', `#${lesson.id}`);
  }
  if (lesson.id !== renderedLessonId) {
    state.current = lesson.id;
    if (state.collapsed[lesson.module]) delete state.collapsed[lesson.module];
    save(true);
    renderLesson(lesson);
    renderLeft();
    renderRight(lesson);
    const active = $('#left .lesson-btn.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  if (tid) scrollToTask(tid);
}
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------------
// Drawer (narrow screens)
// ---------------------------------------------------------------------------
function closeDrawer() {
  $('#left').classList.remove('open');
  $('#overlay').classList.remove('show');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}
$('#menuBtn').addEventListener('click', () => {
  const open = !$('#left').classList.contains('open');
  $('#left').classList.toggle('open', open);
  $('#overlay').classList.toggle('show', open);
  $('#menuBtn').setAttribute('aria-expanded', String(open));
});
$('#overlay').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------
// Theme: 'system' (follow prefers-color-scheme) | 'light' | 'dark'. Stored separately from progress.
const THEME_KEY = 'pycourse.theme';
const THEME_LABELS = { system: 'Тема: система', light: 'Тема: світла', dark: 'Тема: темна' };
function readTheme() {
  try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'system'; }
  catch (e) { return 'system'; }
}
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = THEME_LABELS[t];
  try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) {}
}
applyTheme(readTheme());
document.getElementById('themeBtn').addEventListener('click', () => {
  const order = ['system', 'light', 'dark'];
  applyTheme(order[(order.indexOf(readTheme()) + 1) % order.length]);
});

$('#exportBtn').addEventListener('click', () => {
  save(true);
  const data = { format: 'pycourse.v1', exported_at: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pycourse-progress.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch (err) { alert('Файл не є коректним JSON.'); return; }
  if (!data || typeof data !== 'object' || typeof data.passed !== 'object') {
    alert('У файлі немає прогресу курсу (очікується поле passed).');
    return;
  }
  const n = Object.keys(data.passed || {}).length;
  if (!confirm(`Замінити поточний прогрес даними з файлу? У файлі ${n} виконаних завдань. Поточний прогрес буде втрачено.`)) return;
  applyState(data);
  save(true);
  renderedLessonId = null;
  refreshHeader();
  route();
  toast('Прогрес імпортовано');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function showFatal(title, detail) {
  $('#lesson').innerHTML = `<div class="error-screen"><h1>${esc(title)}</h1>${detail}</div>`;
}

async function boot() {
  loadState();
  if (!window.marked) {
    showFatal('Немає вендорних бібліотек', '<p>Запустіть у корені курсу:</p><pre>.venv/bin/python platform/fetch_vendor.py</pre>');
    return;
  }
  let resp;
  try { resp = await fetch('dist/course.json', { cache: 'no-store' }); } catch (e) { resp = null; }
  if (!resp || !resp.ok) {
    const text = resp ? await resp.text() : '';
    showFatal('Курс не зібрано', `<p>Не вдалося завантажити <code>dist/course.json</code>. Зберіть курс:</p><pre>.venv/bin/python platform/build.py</pre>${text && resp.status === 500 ? `<p>Помилка збірки:</p><pre>${esc(text)}</pre>` : ''}`);
    return;
  }
  COURSE = await resp.json();
  LESSONS = COURSE.modules.flatMap((m) => m.lessons);
  WRITTEN = LESSONS.filter((l) => l.written);
  LESSONS.forEach((l) => byId.set(l.id, l));
  $('#courseTitle').textContent = COURSE.title;
  refreshHeader();
  route();
}
boot();
