# Ключові питання уроку m0-l06 "Структура проєкту: src-layout, tests/, точка входу"

Урок готовий, коли на кожне питання є відповідь з деревом файлів, командами і реальним виводом. Це останній урок модуля 0: його результат це скелет капстоуну в `capstone/` у корені курсу.

- [x] Flat layout проти src layout: чому `src/formbuilder/` краще за `formbuilder/` у корені (тести імпортують встановлений пакет, а не локальну папку; ловить помилки пакування). Що радить Python Packaging User Guide.
- [x] Мінімальний скелет: `pyproject.toml`, `src/formbuilder/__init__.py`, `src/formbuilder/__main__.py` або `cli.py`, `tests/__init__.py` або без, `tests/test_smoke.py`, `README.md`, `.gitignore`, `.python-version`. Показати `tree`.
- [x] Editable install: `uv sync` ставить пакет у venv як посилання (`uv pip install -e .` під капотом); чому після цього `import formbuilder` працює з будь-якої папки, і як перевірити (`python -c "import formbuilder; print(formbuilder.__file__)"`).
- [x] Точка входу: `[project.scripts] formbuilder = "formbuilder.cli:main"` і команда `uv run formbuilder`; `python -m formbuilder` через `__main__.py`. Аналог `bin` у package.json.
- [x] Де лежать тести і як їх знаходить pytest: `tests/test_*.py`, функції `test_*`, конфіг `[tool.pytest.ini_options]` з `testpaths`. Перший smoke-тест і `uv run pytest -q` з реальним виводом. Детально pytest у m3-l03.
- [x] Де лежать конфіги інструментів: усе в `pyproject.toml` (`ruff`, `pytest`, `mypy`), а не в десяти dotfiles. Показати повний `pyproject.toml` скелета.
- [x] Імпорти всередині пакета: абсолютні `from formbuilder.config import load` проти відносних `from .config import load`, що радять і чому (одне речення, детально в m3-l01).
- [x] Що таке `__init__.py` і що в ньому зазвичай лежить (нічого або публічний API через реекспорт), `__all__` одним реченням.
- [x] Версія пакета: `version = "0.1.0"` у pyproject, `importlib.metadata.version("formbuilder")`, і чому не дублюють у `__version__` руками.
- [x] Для капстоуну: проєктне завдання створити `capstone/` саме з такою структурою, з `uv sync`, `uv run pytest`, `uv run ruff check`, і `uv run formbuilder --help`, що друкує заглушку. Це скелет, у який модулі 2–7 додаватимуть код.
- [x] Які JS-звички тут заважають: `src/index.ts` як точка входу без пакета, `import` по відносних шляхах з `../../`, `index.js` реекспорти в кожній папці, тести поруч із кодом `*.test.ts` (у Python допустимо, але зазвичай `tests/`), `package.json` scripts для всього.
