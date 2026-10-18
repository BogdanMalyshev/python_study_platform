# Ключові питання уроку m3-l05 "doctest як документація, що виконується"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Короткий урок: 20–25 абзаців достатньо.

- [x] Що таке docstring (посилання на m1-l07) і що таке doctest: приклади `>>>` у docstring, які `python -m doctest` або `pytest --doctest-modules` виконують і порівнюють з очікуваним виводом. Чому це цінно саме для документації функцій (приклад не застаріває).
- [x] Синтаксис: `>>>` і `...` для продовження, очікуваний вивід одразу після, порожній рядок як кінець; як записати очікуваний виняток (`Traceback (most recent call last):` і останній рядок); `<BLANKLINE>`.
- [x] Пастки порівняння: `repr` проти `str`, порядок у set і dict (dict стабільний, set ні), float, адреси об'єктів, і директиви `# doctest: +ELLIPSIS`, `+NORMALIZE_WHITESPACE`, `+SKIP`.
- [x] Запуск: `uv run python -m doctest -v module.py`, інтеграція в pytest через `--doctest-modules` і `[tool.pytest.ini_options] addopts`, doctest у Markdown/README через `--doctest-glob`.
- [x] Межа: doctest для прикладів використання публічного API, pytest для крайових випадків і регресій; чому не варто писати 30 рядків doctest.
- [x] Стилі docstring: однорядковий, Google style (`Args:`, `Returns:`, `Raises:`), NumPy style; одне речення про Sphinx і mkdocs, які їх читають. Аналог JSDoc.
- [x] Docstring у класах і модулях, `help()` і `__doc__`, і як IDE показує їх при наведенні (чому варто писати).
- [x] Для капстоуну: doctest-приклади для чистих функцій `formbuilder.domain` (обхід дерева, пошук елемента за іменем), `uv run pytest --doctest-modules src`.
- [x] Які JS-звички тут шкодять: JSDoc-теги `@param {string}` (типи вже в анотаціях), коментарі `//` над функцією замість docstring, очікування, що приклад у коментарі ніхто не перевіряє.
