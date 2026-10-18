// Main-thread side of the Python runner: owns the Web Worker, queues runs,
// enforces the timeout and implements "Зупинити" by killing and recreating the worker.
'use strict';

const PyRunner = (() => {
  const TIMEOUT_MS = 15000;
  const params = new URLSearchParams(location.search);
  // ?pyodide=<base url> lets selftest.html try another Pyodide build (e.g. from jsdelivr).
  let base = params.get('pyodide') || 'vendor/pyodide/';
  if (!base.endsWith('/')) base += '/';

  let worker = null;
  let workerState = 'none'; // none | loading | ready | broken
  let info = { python: null, version: null, coreMB: null };
  let current = null;
  const queue = [];
  let seq = 0;
  const statusListeners = new Set();

  fetch(base + 'vendored.json').then((r) => (r.ok ? r.json() : null)).then((v) => {
    if (v && v.core_bytes) info.coreMB = Math.round(v.core_bytes / 1e6);
    if (v && v.python) info.expectedPython = v.python;
  }).catch(() => {});

  function emitStatus(text) {
    if (current && current.onStatus) current.onStatus(text);
    statusListeners.forEach((fn) => fn(text, current));
  }

  function createWorker() {
    worker = new Worker('worker.js');
    workerState = 'loading';
    worker.onmessage = onMessage;
    worker.onerror = (e) => {
      failAll(`Помилка воркера: ${e.message || e}`);
      workerState = 'broken';
    };
    const abs = new URL(base, location.href).href;
    worker.postMessage({ type: 'init', base: abs });
  }

  function loadingText() {
    return `Завантажую Python…${info.coreMB ? ` (≈${info.coreMB} МБ, лише першого разу)` : ''}`;
  }

  function onMessage(ev) {
    const m = ev.data;
    switch (m.type) {
      case 'status':
        emitStatus(m.text.startsWith('Завантажую Python') ? loadingText() : m.text);
        break;
      case 'ready':
        workerState = 'ready';
        info.python = m.python;
        info.version = m.version;
        emitStatus(null);
        break;
      case 'fatal':
        workerState = 'broken';
        failAll(`Не вдалося запустити Python: ${m.message}`);
        break;
      case 'started':
        if (current && current.id === m.id) {
          current.startedAt = performance.now();
          emitStatus('Виконую…');
          current.timer = setTimeout(() => kill('timeout'), TIMEOUT_MS);
        }
        break;
      case 'out':
        if (current && current.id === m.id) {
          current.result[m.stream] += m.text;
          if (current.onOut) current.onOut(m.stream, m.text);
        }
        break;
      case 'done':
        if (current && current.id === m.id) {
          const job = current;
          clearTimeout(job.timer);
          job.result.ok = m.ok;
          job.result.error = m.error;
          job.result.ms = job.startedAt ? Math.round(performance.now() - job.startedAt) : 0;
          finish(job);
        }
        break;
    }
  }

  function finish(job) {
    if (current === job) current = null;
    if (job.onStatus) job.onStatus(null);
    job.resolve(job.result);
    pump();
  }

  function failAll(message) {
    const jobs = [current, ...queue.splice(0)].filter(Boolean);
    current = null;
    for (const job of jobs) {
      clearTimeout(job.timer);
      job.result.ok = false;
      job.result.error = { type: 'RunnerError', message };
      job.result.stderr += message;
      if (job.onStatus) job.onStatus(null);
      job.resolve(job.result);
    }
    if (worker) worker.terminate();
    worker = null;
    workerState = 'none';
  }

  function kill(reason) {
    if (worker) worker.terminate();
    worker = null;
    workerState = 'none';
    const job = current;
    current = null;
    if (job) {
      clearTimeout(job.timer);
      job.result.ok = false;
      job.result[reason === 'timeout' ? 'timedOut' : 'stopped'] = true;
      job.result.error = { type: reason === 'timeout' ? 'Timeout' : 'Stopped', message: '' };
      if (job.onStatus) job.onStatus(null);
      job.resolve(job.result);
    }
    // Fresh interpreter right away, so the next run does not wait for the load.
    createWorker();
    pump();
  }

  function pump() {
    if (current || !queue.length) return;
    if (!worker || workerState === 'broken') createWorker();
    current = queue.shift();
    if (workerState !== 'ready') emitStatus(loadingText());
    worker.postMessage({ type: 'run', id: current.id, code: current.code, packages: current.packages });
  }

  function run(code, opts = {}) {
    const job = {
      id: ++seq,
      code,
      packages: opts.packages || [],
      onOut: opts.onOut,
      onStatus: opts.onStatus,
      result: { ok: false, stdout: '', stderr: '', error: null, timedOut: false, stopped: false, ms: 0 },
    };
    const promise = new Promise((resolve) => { job.resolve = resolve; });
    queue.push(job);
    if (current && opts.onStatus) opts.onStatus('Чекаю, поки завершиться інший запуск…');
    pump();
    return { id: job.id, promise };
  }

  function stop(id) {
    if (current && current.id === id) { kill('stopped'); return; }
    const i = queue.findIndex((j) => j.id === id);
    if (i >= 0) {
      const [job] = queue.splice(i, 1);
      job.result.stopped = true;
      job.result.error = { type: 'Stopped', message: '' };
      if (job.onStatus) job.onStatus(null);
      job.resolve(job.result);
    }
  }

  return {
    run,
    stop,
    info: () => ({ ...info, state: workerState }),
    onStatus: (fn) => statusListeners.add(fn),
    TIMEOUT_MS,
  };
})();

// Output normalisation shared by the platform and selftest:
// trailing spaces on every line and trailing empty lines are ignored, the rest must match exactly.
function normalizeOutput(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

// Builds the program for "Перевірити": student code + harness (+ asserts).
function buildCheckProgram(code, task) {
  let program = code;
  if (task.harness) program += '\n\n' + task.harness;
  if (task.asserts) program += '\n\n' + task.asserts;
  return program;
}
