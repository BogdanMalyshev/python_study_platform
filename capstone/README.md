# formbuilder

Backend for FormBuilder written in Python: the capstone of the course.
It accepts a JSON form config, validates it, renders a static page and publishes it.

Right now this is a skeleton from lesson m0-l06: a src-layout package, one smoke test
and a CLI stub. Modules 2-7 add the code (Pydantic models, tests, CLI, FastAPI, worker).

## Requirements

- [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 from `.python-version` if needed)

## Setup

```bash
uv sync
```

Creates `.venv/`, installs dev tools (pytest, ruff, mypy) and the `formbuilder`
package itself in editable mode.

## Run

```bash
uv run formbuilder --help
uv run python -m formbuilder --version
```

## Checks

```bash
uv run pytest -q
uv run ruff check
uv run ruff format --check
uv run mypy src
```

## Layout

```text
pyproject.toml          metadata, dependencies, entry point, tool configs
src/formbuilder/        the importable package
  __init__.py           package marker, __version__ from installed metadata
  __main__.py           python -m formbuilder
  cli.py                main(), the console script target
tests/                  pytest tests, import the installed package
```
