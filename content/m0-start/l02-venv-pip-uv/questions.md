# Ключові питання уроку m0-l02 "Віртуальне оточення, pip, uv, pyproject.toml"

Урок готовий, коли на кожне питання є відповідь з командами і реальним виводом.

- [x] Чому в Python немає `node_modules` поруч із проєктом за замовчуванням, і що таке віртуальне оточення: папка з власним інтерпретатором-посиланням і `site-packages`. Що станеться, якщо ставити пакети без venv.
- [x] `python -m venv .venv`, `source .venv/bin/activate`, `deactivate`, і чому активація це лише зміна `PATH`. Як запускати без активації (`.venv/bin/python`, `uv run`). Що лежить у `.venv` (`bin/`, `lib/python3.12/site-packages`, `pyvenv.cfg`).
- [x] pip: `pip install`, `pip install -e .`, `pip list`, `pip freeze`, `requirements.txt` як старий спосіб фіксації. Чому `requirements.txt` це не lockfile (немає хешів і транзитивних обмежень за замовчуванням).
- [x] uv як сучасний стандарт: `uv init`, `uv add`, `uv add --dev`, `uv remove`, `uv sync`, `uv run`, `uv lock`. Відповідності npm: `package.json` → `pyproject.toml`, `package-lock.json` → `uv.lock`, `npm ci` → `uv sync --frozen`, `npx` → `uvx`.
- [x] Структура `pyproject.toml`: `[project]` з `name`, `version`, `requires-python`, `dependencies`; `[dependency-groups]` для dev; `[tool.ruff]`, `[tool.pytest.ini_options]`. Специфікатори версій `>=2,<3`, `~=2.1`, `==2.1.*`, і чим `~=` відрізняється від `^` у npm.
- [x] PyPI як реєстр, як читати сторінку пакета, `uv pip show`, як дізнатись, що пакет встановлений і де лежить (`python -c "import pydantic, sys; print(pydantic.__file__)"`).
- [x] `.gitignore` для Python-проєкту: `.venv/`, `__pycache__/`, `*.pyc`, `.ruff_cache/`, `.mypy_cache/`, `dist/`. Що таке `__pycache__` і чому його не комітять.
- [x] Чому один venv на проєкт, а не один глобальний, і як IDE (VS Code, PyCharm) знаходить інтерпретатор (`.venv` у корені).
- [x] Для капстоуну: створити `pyproject.toml` майбутнього проєкту `formbuilder` з `requires-python = ">=3.12"`, dev-групою `pytest`, `ruff`, `mypy`, і перевірити `uv sync` + `uv run pytest --version`.
- [x] Які JS-звички тут заважають: `npm i -g`, редагування `package.json` руками замість `uv add`, очікування `^` у версіях, пошук `scripts` секції (у Python це `[project.scripts]` для entry points, а не npm-скрипти; для задач використовують `uv run` або Makefile/justfile, одне речення).
