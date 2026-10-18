# Ключові питання уроку m2-l08 "mypy і pyright у strict-режимі"

Урок готовий, коли на кожне питання є відповідь з реальними командами і виводом `mypy` (встановлений у `.venv`). pyright не встановлений: показати його конфіг і згадати відмінності без реального виводу, або поставити через `uvx pyright` лише якщо це працює офлайн-безпечно.

- [x] Чому потрібен окремий інструмент: інтерпретатор типи ігнорує (посилання на m2-l06). mypy проти pyright: хто їх робить, швидкість, що в редакторах (Pylance це pyright), чи треба обидва. Аналог `tsc --noEmit`.
- [x] Перший запуск: `uv run mypy src/`, читання виводу `file:line: error: ... [error-code]`, `--show-error-codes`, `--pretty`. Типові перші помилки на нетипізованому коді.
- [x] Поступовість: за замовчуванням mypy перевіряє лише анотовані функції; `--check-untyped-defs`, `--disallow-untyped-defs`, і шлях до `--strict`. Що саме вмикає `strict` (список) і чому для нового проєкту вмикати одразу.
- [x] Конфіг у `pyproject.toml`: `[tool.mypy]` з `python_version`, `strict = true`, `warn_return_any`, `files`, `[[tool.mypy.overrides]]` для сторонніх модулів без типів (`ignore_missing_imports`). Аналог `tsconfig.json` зі `strict: true`.
- [x] Narrowing: як mypy звужує `str | None` після `if x is None`, `isinstance`, `assert`, early return, `match`; де не звужує (атрибут об'єкта після виклику функції) і як допомогти (локальна змінна, walrus).
- [x] Типові повідомлення й що вони означають: `Incompatible types in assignment`, `Argument 1 has incompatible type`, `Item "None" of "str | None" has no attribute`, `Need type annotation for`, `Returning Any from function declared to return`, `Missing return statement`. Показати кожне з кодом і виправленням.
- [x] `# type: ignore[code]` і чому без коду це запах; `cast`; `typing.TYPE_CHECKING` для імпортів лише для чекера; `reveal_type(x)` для дебагу типів.
- [x] Сторонні бібліотеки: пакети з `py.typed`, stubs `types-requests`, `typeshed`, що робити з бібліотекою без типів.
- [x] Інтеграція: Pylance у VS Code (strict mode у settings), mypy у pre-commit (посилання на m3-l06), у CI. Чому перевірка типів не замінює тести (посилання на m3-l03).
- [x] Для капстоуну: увімкнути `strict` у `capstone/pyproject.toml`, прогнати на скелеті з m0-l06, виправити все до нуля помилок.
- [x] Які JS-звички тут заважають: очікування, що помилки типів зупинять запуск, `any` для "потім виправлю", `// @ts-ignore` без коду, очікування, що IDE і CLI покажуть те саме (Pylance і mypy розходяться в деталях).
