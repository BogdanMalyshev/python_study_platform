"""Collect content/ into platform/dist/course.json.

Run from anywhere:  .venv/bin/python platform/build.py

Reads content/course.yaml (module order, titles, lesson order), every
content/<module>/<lesson>/lesson.md (YAML frontmatter + Markdown) and tasks.yaml.
Markdown is NOT rendered here: the browser renders it. The build only validates
and packs. It fails with a list of all problems if a tasks.yaml does not parse,
a `<!-- task: id -->` marker points to an unknown id, or a task id is never placed.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import yaml

PLATFORM = Path(__file__).resolve().parent
ROOT = PLATFORM.parent
CONTENT = ROOT / "content"
DIST = PLATFORM / "dist"
OUT = DIST / "course.json"

MARKER_RE = re.compile(r"^\s*<!--\s*task:\s*([A-Za-z0-9_-]+)\s*-->\s*$")
FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})")
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)

TASK_TYPES = {"code", "quiz", "project"}
REQUIRED = {
    "code": ("title", "prompt", "starter", "solution"),
    "quiz": ("question", "options", "answer"),
    "project": ("title", "prompt", "checklist"),
}
BROWSER_PACKAGES = {"pydantic", "httpx"}


class BuildError(Exception):
    pass


def rel(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


def scan_markers(body: str) -> list[tuple[str, int]]:
    """Return (task_id, line_no) for task markers outside fenced code blocks."""
    found: list[tuple[str, int]] = []
    fence: str | None = None
    for no, line in enumerate(body.splitlines(), start=1):
        m = FENCE_RE.match(line)
        if m:
            tok = m.group(1)
            if fence is None:
                fence = tok
            elif (
                tok[0] == fence[0]
                and len(tok) >= len(fence)
                and not line.strip()[len(tok) :].strip()
            ):
                fence = None
            continue
        if fence is None:
            mm = MARKER_RE.match(line)
            if mm:
                found.append((mm.group(1), no))
    return found


def load_lesson(module_id: str, slug: str, folder: Path, errors: list[str]) -> dict:
    md_path = folder / "lesson.md"
    tasks_path = folder / "tasks.yaml"
    where = rel(folder)
    text = md_path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        errors.append(f"{rel(md_path)}: немає YAML-frontmatter між рядками ---")
        meta, body, fm_lines = {}, text, 0
    else:
        try:
            meta = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError as e:
            errors.append(f"{rel(md_path)}: frontmatter не парситься: {e}")
            meta = {}
        body = text[m.end() :]
        fm_lines = text[: m.end()].count("\n")

    num = re.match(r"m(\d+)", module_id)
    lnum = re.match(r"l(\d+)", slug)
    expected_id = f"m{num.group(1)}-l{lnum.group(1)}" if num and lnum else None
    lesson_id = meta.get("id") or expected_id
    if expected_id and lesson_id != expected_id:
        errors.append(
            f"{rel(md_path)}: id у frontmatter '{lesson_id}', а з папки виходить '{expected_id}'"
        )
    if not meta.get("title"):
        errors.append(f"{rel(md_path)}: у frontmatter немає title")

    tasks: list[dict] = []
    tasks_ok = True
    if tasks_path.exists():
        try:
            raw = yaml.safe_load(tasks_path.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            errors.append(
                f"{rel(tasks_path)}: YAML не парситься:\n    {str(e).replace(chr(10), chr(10) + '    ')}"
            )
            raw, tasks_ok = [], False
        if raw is None:
            raw = []
        if not isinstance(raw, list):
            errors.append(
                f"{rel(tasks_path)}: очікується список завдань на верхньому рівні"
            )
            raw, tasks_ok = [], False
        seen: set[str] = set()
        for i, t in enumerate(raw):
            if not isinstance(t, dict) or "id" not in t:
                errors.append(f"{rel(tasks_path)}: елемент #{i + 1} не має id")
                continue
            tid = str(t["id"])
            if tid in seen:
                errors.append(f"{rel(tasks_path)}: id '{tid}' повторюється")
            seen.add(tid)
            ttype = t.get("type")
            if ttype not in TASK_TYPES:
                errors.append(f"{rel(tasks_path)}: {tid}: невідомий type '{ttype}'")
                continue
            for key in REQUIRED[ttype]:
                if key not in t:
                    errors.append(f"{rel(tasks_path)}: {tid}: немає поля '{key}'")
            if ttype == "code":
                runtime = t.get("runtime", "browser")
                if runtime not in ("browser", "local"):
                    errors.append(
                        f"{rel(tasks_path)}: {tid}: runtime має бути browser або local"
                    )
                if runtime == "browser" and "expected" not in t and "asserts" not in t:
                    errors.append(
                        f"{rel(tasks_path)}: {tid}: потрібне expected або asserts"
                    )
                req = t.get("requires") or []
                if runtime == "browser" and set(req) - BROWSER_PACKAGES:
                    errors.append(
                        f"{rel(tasks_path)}: {tid}: у браузері немає {sorted(set(req) - BROWSER_PACKAGES)}, потрібен runtime: local"
                    )
                for key in ("starter", "harness", "expected", "asserts", "solution"):
                    if key in t and t[key] is not None and not isinstance(t[key], str):
                        errors.append(
                            f"{rel(tasks_path)}: {tid}: '{key}' має бути рядком"
                        )
                t.setdefault("hints", [])
                t.setdefault("requires", [])
                t["runtime"] = runtime
            if ttype == "quiz":
                opts = t.get("options") or []
                ans = t.get("answer")
                if not isinstance(opts, list) or not (2 <= len(opts) <= 6):
                    errors.append(
                        f"{rel(tasks_path)}: {tid}: options має бути списком із 2–6 варіантів"
                    )
                elif not isinstance(ans, int) or not (0 <= ans < len(opts)):
                    errors.append(
                        f"{rel(tasks_path)}: {tid}: answer має бути індексом 0..{len(opts) - 1}"
                    )
                t["options"] = [str(o) for o in opts]
            if ttype == "project" and not isinstance(t.get("checklist", []), list):
                errors.append(f"{rel(tasks_path)}: {tid}: checklist має бути списком")
            t["id"] = tid
            tasks.append(t)
    else:
        errors.append(f"{where}: немає tasks.yaml")
        tasks_ok = False

    ids = {t["id"] for t in tasks}
    markers = scan_markers(body)
    placed: dict[str, int] = {}
    for tid, line in markers:
        if tasks_ok and tid not in ids:
            errors.append(
                f"{rel(md_path)}:{line + fm_lines}: маркер <!-- task: {tid} --> посилається на id, якого немає в tasks.yaml"
            )
        placed[tid] = placed.get(tid, 0) + 1
    for t in tasks:
        n = placed.get(t["id"], 0)
        if n == 0:
            errors.append(
                f"{rel(md_path)}: завдання '{t['id']}' з tasks.yaml не вставлене в урок (<!-- task: {t['id']} -->)"
            )
        elif n > 1:
            errors.append(
                f"{rel(md_path)}: завдання '{t['id']}' вставлене {n} рази, має бути один"
            )

    order = {tid: i for i, (tid, _) in enumerate(markers)}
    tasks.sort(key=lambda t: order.get(t["id"], 10_000))

    return {
        "id": lesson_id,
        "slug": slug,
        "module": module_id,
        "written": True,
        "title": str(meta.get("title", slug)),
        "summary": str(meta.get("summary", "") or ""),
        "duration_min": meta.get("duration_min"),
        "prerequisites": meta.get("prerequisites") or [],
        "body": body,
        "tasks": tasks,
    }


def build() -> dict:
    errors: list[str] = []
    manifest_path = CONTENT / "course.yaml"
    if not manifest_path.exists():
        raise BuildError(f"Немає {rel(manifest_path)}")
    try:
        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise BuildError(f"{rel(manifest_path)} не парситься: {e}") from e

    modules_out = []
    listed: set[Path] = set()
    for mi, mod in enumerate(manifest.get("modules") or []):
        mid = mod.get("id")
        if not mid:
            errors.append(f"course.yaml: модуль #{mi + 1} без id")
            continue
        mnum = re.match(r"m(\d+)", mid)
        lessons_out = []
        for entry in mod.get("lessons") or []:
            if isinstance(entry, str):
                slug, title = entry, None
            elif isinstance(entry, dict) and entry.get("slug"):
                slug, title = str(entry["slug"]), entry.get("title")
            else:
                errors.append(
                    f"course.yaml: {mid}: урок має бути рядком або {{slug, title}}: {entry!r}"
                )
                continue
            folder = CONTENT / mid / slug
            listed.add(folder)
            if (folder / "lesson.md").exists():
                lessons_out.append(load_lesson(mid, slug, folder, errors))
            else:
                lnum = re.match(r"l(\d+)", slug)
                lessons_out.append(
                    {
                        "id": f"m{mnum.group(1)}-l{lnum.group(1)}"
                        if mnum and lnum
                        else f"{mid}-{slug}",
                        "slug": slug,
                        "module": mid,
                        "written": False,
                        "title": str(title or slug),
                        "tasks": [],
                    }
                )
        modules_out.append(
            {"id": mid, "title": str(mod.get("title", mid)), "lessons": lessons_out}
        )

    for md in sorted(CONTENT.glob("*/*/lesson.md")):
        if md.parent not in listed:
            print(
                f"warning: {rel(md.parent)} є в content/, але не вказаний у course.yaml",
                file=sys.stderr,
            )

    seen_ids: dict[str, str] = {}
    for mod in modules_out:
        for les in mod["lessons"]:
            if les["id"] in seen_ids:
                errors.append(
                    f"course.yaml: id уроку {les['id']} повторюється ({seen_ids[les['id']]} і {mod['id']}/{les['slug']})"
                )
            seen_ids[les["id"]] = f"{mod['id']}/{les['slug']}"

    if errors:
        raise BuildError("\n".join(f"  - {e}" for e in errors))

    return {
        "title": str(manifest.get("title", "Курс Python")),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "modules": modules_out,
    }


def content_mtime() -> float:
    """Newest mtime under content/ (used by serve.py to rebuild on change)."""
    newest = 0.0
    for p in CONTENT.rglob("*"):
        if p.suffix in (".md", ".yaml", ".yml"):
            newest = max(newest, p.stat().st_mtime)
    return newest


def main() -> int:
    try:
        course = build()
    except BuildError as e:
        print(f"build.py: збірка не вдалася:\n{e}", file=sys.stderr)
        return 1
    DIST.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(course, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    tmp.replace(OUT)
    lessons = [les for m in course["modules"] for les in m["lessons"]]
    written = [les for les in lessons if les["written"]]
    ntasks = sum(len(les["tasks"]) for les in written)
    print(
        f"build.py: {rel(OUT)}: {len(course['modules'])} модулів, {len(written)}/{len(lessons)} уроків написано, {ntasks} завдань"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
