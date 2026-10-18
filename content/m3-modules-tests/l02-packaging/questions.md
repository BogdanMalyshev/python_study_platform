# Ключові питання уроку m3-l02 "Пакет із pyproject.toml, залежності, lockfile через uv"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Команди у ```bash з реальним виводом. m0-l02 уже дав базу uv і pyproject; тут глибше: збірка, версії, публікація, entry points.

- [x] Будова `pyproject.toml` повністю: `[build-system]` (backend: `uv_build`, `hatchling`, `setuptools`), `[project]` з `name`, `version`, `description`, `readme`, `requires-python`, `dependencies`, `optional-dependencies`, `[project.scripts]`, `[dependency-groups]`, `[tool.*]`. Чим `optional-dependencies` (extras, видно користувачу пакета) відрізняються від `dependency-groups` (dev, лише для розробки).
- [x] Специфікатори версій PEP 440 і PEP 508: `>=2,<3`, `~=2.1`, `==2.1.*`, маркери середовища `; python_version < "3.13"`, extras `httpx[http2]`. Semver проти PEP 440 (`1.0.0rc1`, `1.0.post1`, `.dev`).
- [x] `uv.lock`: що всередині (усі транзитивні залежності з хешами і маркерами для всіх платформ), чому його комітять, `uv lock --upgrade-package x`, `uv sync --locked` у CI. Аналог package-lock.
- [x] Збірка дистрибутива: `uv build` дає `sdist` і `wheel` у `dist/`; що таке wheel, чому бінарні пакети мають wheel на платформу, `pip install dist/*.whl` у чистому venv як перевірка, що пакет самодостатній (src-layout ловить забуті файли).
- [x] Що входить у пакет: `src/formbuilder/**`, дані через `package-data` або `importlib.resources` (шаблони Jinja2 для капстоуну), і що не входить (tests, docs).
- [x] Версія: `version` у pyproject, `dynamic = ["version"]` з git-тегів (одне речення), `importlib.metadata.version`.
- [x] Entry points: `[project.scripts]` для CLI (посилання на m0-l06), `[project.entry-points."formbuilder.renderers"]` як механізм плагінів, читання через `importlib.metadata.entry_points`.
- [x] Публікація: `uv publish` у TestPyPI, токен через змінну оточення, що потрібно в `[project]` для PyPI (`readme`, `license`, `classifiers`). Лише показати команду, не публікувати.
- [x] Робота з кількома пакетами: uv workspaces (`[tool.uv.workspace]`), editable-залежність на локальний пакет `uv add --editable ../lib`. Аналог npm workspaces, одне речення.
- [x] Інструменти поза проєктом: `uvx ruff`, `uv tool install`, і чому глобальний pip лишається забороненим.
- [x] Для капстоуну: довести `capstone/pyproject.toml` до повного вигляду з `optional-dependencies` `[web]` для FastAPI (майбутній модуль 7), `uv build`, встановити wheel у тимчасовий venv і запустити `formbuilder --help`.
- [x] Які JS-звички тут шкодять: `^` у версіях, `devDependencies` як єдина група, `npm publish` без збірки, очікування `main`/`exports` полів, `postinstall` скрипти.
