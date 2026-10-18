// Python runner: one Pyodide instance inside a Web Worker.
// Protocol (main -> worker): {type:'init', base} | {type:'run', id, code, packages}
// (worker -> main): {type:'status', text} | {type:'ready', python, version}
//   | {type:'started', id} | {type:'out', id, stream:'stdout'|'stderr', text}
//   | {type:'done', id, ok, error:{type, message}|null} | {type:'fatal', message}
'use strict';

let pyodide = null;
let vendored = { imports: {}, packages: [] };
let runPy = null;
let currentId = null;
const loadedPkgs = new Set();

const OUT_LIMIT = 200000;
const buf = { stdout: '', stderr: '' };
const sent = { stdout: 0, stderr: 0 };
let lastFlush = 0;
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };

function flush() {
  for (const stream of ['stdout', 'stderr']) {
    if (buf[stream]) {
      postMessage({ type: 'out', id: currentId, stream, text: buf[stream] });
      buf[stream] = '';
    }
  }
  lastFlush = Date.now();
}

function writer(stream) {
  return {
    write(bytes) {
      if (currentId === null) return bytes.length;
      let text = decoders[stream].decode(bytes, { stream: true });
      if (sent[stream] >= OUT_LIMIT) return bytes.length;
      if (sent[stream] + text.length > OUT_LIMIT) {
        text = text.slice(0, OUT_LIMIT - sent[stream]) + `\n[вивід обрізано після ${OUT_LIMIT} символів]\n`;
      }
      sent[stream] += text.length;
      buf[stream] += text;
      if (Date.now() - lastFlush > 60) flush();
      return bytes.length;
    },
  };
}

// Python side: asyncio adaptation, fresh __main__, cleaned traceback.
const RUNNER = String.raw`
import ast, asyncio, builtins, linecache, os, sys, traceback, types
from pyodide.code import find_imports

_FILENAME = "main.py"

async def _pycourse_asyncio_run(main, *, debug=None, **kw):
    """Stand-in for asyncio.run inside Pyodide's already running loop.
    Awaits the coroutine, then cancels tasks it left behind, like asyncio.run does."""
    if not asyncio.iscoroutine(main):
        raise ValueError(f"a coroutine was expected, got {main!r}")
    before = asyncio.all_tasks()
    try:
        return await main
    finally:
        me = asyncio.current_task()
        left = [t for t in asyncio.all_tasks() if t is not me and t not in before and not t.done()]
        for t in left:
            t.cancel()
        if left:
            await asyncio.gather(*left, return_exceptions=True)

builtins.__pycourse_asyncio_run__ = _pycourse_asyncio_run


def _adapt_asyncio(src):
    """Top-level asyncio.run(<expr>) (not inside def/lambda) -> await <expr>.
    Keeps line numbers: the replacement spans the same number of lines."""
    if "asyncio" not in src:
        return src, False
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return src, False
    hits = []

    def visit(node, in_func):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            in_func = True
        if (not in_func and isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "run" and isinstance(node.func.value, ast.Name)
                and node.func.value.id == "asyncio" and node.args):
            hits.append(node)
            return
        for child in ast.iter_child_nodes(node):
            visit(child, in_func)

    visit(tree, False)
    if not hits:
        return src, False
    lines = src.splitlines(keepends=True)
    blines = [l.encode("utf-8") for l in lines]
    starts = [0]
    for b in blines:
        starts.append(starts[-1] + len(b))
    data = src.encode("utf-8")
    for node in sorted(hits, key=lambda n: (n.lineno, n.col_offset), reverse=True):
        a = starts[node.lineno - 1] + node.col_offset
        b = starts[node.end_lineno - 1] + node.end_col_offset
        arg = node.args[0]
        aa = starts[arg.lineno - 1] + arg.col_offset
        ab = starts[arg.end_lineno - 1] + arg.end_col_offset
        old = data[a:b]
        inner = data[aa:ab]
        new = b"(await __pycourse_asyncio_run__(" + inner + b"))"
        missing = old.count(b"\n") - new.count(b"\n")
        if missing > 0:
            new = new[:-1] + b"\n" * missing + b")"
        data = data[:a] + new + data[b:]
    return data.decode("utf-8"), True


def _is_internal(fs):
    f = fs.filename or ""
    return f == "<pycourse>" or "/_pyodide/" in f


def _clean(te, seen=None):
    seen = seen if seen is not None else set()
    if id(te) in seen:
        return
    seen.add(id(te))
    frames = [fs for fs in te.stack if not _is_internal(fs)]
    for fs in frames:
        fs.filename = os.path.basename(fs.filename or "")
    te.stack = traceback.StackSummary.from_list(frames)
    if getattr(te, "filename", None):
        te.filename = os.path.basename(te.filename)
    for sub in (te.__cause__, te.__context__):
        if sub is not None:
            _clean(sub, seen)
    for sub in getattr(te, "exceptions", None) or []:
        _clean(sub, seen)


def _format_exc(e):
    te = traceback.TracebackException.from_exception(e)
    _clean(te)
    return "".join(te.format())


def packages_for(src, imports_map):
    try:
        mods = find_imports(src)
    except Exception:
        return []
    out = []
    for m in mods:
        top = m.split(".")[0]
        if top in imports_map and imports_map[top] not in out:
            out.append(imports_map[top])
    return out


async def run_user_code(src):
    code, _ = _adapt_asyncio(src)
    mod = types.ModuleType("__main__")
    mod.__file__ = _FILENAME
    mod.__builtins__ = builtins
    saved = sys.modules.get("__main__")
    mods_before = set(sys.modules)
    path_before = list(sys.path)
    cwd_before = os.getcwd()
    sys.modules["__main__"] = mod
    try:
        compiled = compile(code, _FILENAME, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)
        # Tracebacks show the learner's original lines (asyncio.run, not the adapted await).
        linecache.cache[_FILENAME] = (len(src), None, src.splitlines(True), _FILENAME)
        coro = eval(compiled, mod.__dict__)
        if coro is not None:
            await coro
        return None
    except SystemExit as e:
        if e.code in (None, 0):
            return None
        msg = e.code if isinstance(e.code, str) else f"SystemExit: {e.code}"
        print(msg, file=sys.stderr)
        return ("SystemExit", str(e.code))
    except BaseException as e:
        sys.stdout.flush()
        sys.stderr.write(_format_exc(e))
        sys.stderr.flush()
        return (type(e).__name__, str(e))
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        sys.modules["__main__"] = saved
        _restore(mods_before, path_before, cwd_before)


def _restore(mods_before, path_before, cwd_before):
    """Forget modules the user's code created (files in /tmp etc.), keep stdlib and
    site-packages imports cached, and undo sys.path / cwd changes between runs."""
    for name in set(sys.modules) - mods_before:
        m = sys.modules.get(name)
        f = getattr(m, "__file__", None) or ""
        paths = list(getattr(m, "__path__", None) or [])
        if (f and not f.startswith("/lib/")) or (not f and any(not str(p).startswith("/lib/") for p in paths)):
            sys.modules.pop(name, None)
    sys.path[:] = path_before
    try:
        os.chdir(cwd_before)
    except OSError:
        pass
`;

async function init(base) {
  try {
    postMessage({ type: 'status', text: 'Завантажую Python…' });
    try {
      vendored = await (await fetch(base + 'vendored.json')).json();
    } catch (e) { /* CDN base without manifest */ }
    importScripts(base + 'pyodide.js');
    pyodide = await loadPyodide({ indexURL: base, fullStdLib: false });
    pyodide.setStdout(writer('stdout'));
    pyodide.setStderr(writer('stderr'));
    pyodide.setStdin({ stdin: () => null });
    const ns = pyodide.globals.get('dict')();
    pyodide.runPython(RUNNER, { globals: ns, filename: '<pycourse>' });
    runPy = { run: ns.get('run_user_code'), pkgs: ns.get('packages_for') };
    const python = pyodide.runPython('import sys; sys.version.split()[0]');
    postMessage({ type: 'ready', python, version: pyodide.version });
  } catch (e) {
    postMessage({ type: 'fatal', message: String(e && e.message || e) });
  }
}

async function run(msg) {
  const { id, code } = msg;
  const want = new Set(msg.packages || []);
  try {
    const importsMap = pyodide.toPy(vendored.imports || {});
    const found = runPy.pkgs(code, importsMap);
    for (const p of found.toJs()) want.add(p);
    found.destroy(); importsMap.destroy();
  } catch (e) { /* ignore */ }
  const toLoad = [...want].filter((p) => !loadedPkgs.has(p));
  if (toLoad.length) {
    postMessage({ type: 'status', text: `Завантажую ${toLoad.join(', ')}…` });
    try {
      await pyodide.loadPackage(toLoad, { messageCallback: () => {}, errorCallback: () => {} });
      toLoad.forEach((p) => loadedPkgs.add(p));
    } catch (e) {
      postMessage({ type: 'done', id, ok: false, error: { type: 'PackageError', message: `Не вдалося завантажити ${toLoad.join(', ')}: ${e.message || e}` } });
      return;
    }
  }
  buf.stdout = buf.stderr = '';
  sent.stdout = sent.stderr = 0;
  currentId = id;
  lastFlush = Date.now();
  postMessage({ type: 'started', id });
  let err = null;
  try {
    const r = await runPy.run(code);
    if (r) { const pair = r.toJs(); err = { type: pair[0], message: pair[1] }; r.destroy && r.destroy(); }
  } catch (e) {
    err = { type: 'InternalError', message: String(e && e.message || e) };
    buf.stderr += String(e && e.message || e);
  }
  for (const s of ['stdout', 'stderr']) {
    const tail = decoders[s].decode();
    if (tail) buf[s] += tail;
  }
  flush();
  currentId = null;
  postMessage({ type: 'done', id, ok: !err, error: err });
}

let queue = Promise.resolve();
self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'init') queue = queue.then(() => init(msg.base));
  else if (msg.type === 'run') queue = queue.then(() => run(msg));
};
