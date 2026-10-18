# Ключові питання уроку m3-l03 "pytest: assert, parametrize, fixtures, conftest.py"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Учень знає Jest добре: кожна концепція через зіставлення.

- [x] Мінімальний тест: файл `test_*.py`, функція `test_*`, голий `assert` без матчерів; як pytest переписує `assert`, щоб показати значення обох сторін (assertion rewriting). Запуск `uv run pytest`, `-q`, `-v`, `-x`, `-k expr`, `--lf`, `-s`. Порівняти з `expect(x).toBe(y)`, `describe`/`it`.
- [x] Структура: `tests/` поруч із `src/`, `conftest.py`, `[tool.pytest.ini_options]` з `testpaths`, `--import-mode=importlib` (посилання на m0-l06), групування тестів у класи `TestX` без наслідування.
- [x] Перевірка винятків `pytest.raises(ValueError, match=r"...")` і доступ до `excinfo.value`; `pytest.warns`; `pytest.approx` для float. Аналоги `toThrow`, `toBeCloseTo`.
- [x] `@pytest.mark.parametrize`: один тест на багато випадків, `ids=`, кілька параметрів, стекування декораторів для декартового добутку, `pytest.param(..., marks=pytest.mark.xfail)`. Аналог `it.each`.
- [x] Fixtures: функція з `@pytest.fixture`, інʼєкція за іменем параметра, `yield` для teardown, `scope` (function, module, session), `autouse`, фікстури, що залежать від інших. Порівняти з `beforeEach`/`afterEach` і пояснити, чому інʼєкція за іменем зручніша за глобальний стан.
- [x] Вбудовані фікстури: `tmp_path`, `monkeypatch` (`setattr`, `setenv`, `chdir`), `capsys` для stdout, `caplog` для логів, `request`. Де вони замінюють `jest.spyOn` і `process.env` хаки.
- [x] Маркери: `@pytest.mark.skip`, `skipif`, `xfail`, власні маркери з реєстрацією в pyproject, запуск підмножини `-m "not slow"`.
- [x] Організація тестових даних: фабричні функції замість глобальних фікстур з даними, `conftest.py` на рівні папки, фікстура, що повертає функцію-фабрику.
- [x] Читання виводу pytest при падінні: diff для списків і словників, `-vv` для повного diff, `--tb=short`, `-l` для локальних змінних.
- [x] Асинхронні тести: `pytest-asyncio` або `anyio` плагін, `@pytest.mark.asyncio`, одне речення й посилання на m7-l05.
- [x] Для капстоуну: тести для `formbuilder.config` (валідні й невалідні конфіги через parametrize, фікстура з прикладом конфігу, `tmp_path` для файлів), запуск `cd capstone && uv run pytest -q`.
- [x] Які JS-звички тут шкодять: `describe`-вкладеність замість плоских функцій, матчери замість `assert`, `beforeEach` з `this`, мокання всього підряд (у Python моки в m3-l04 і їх менше), `test.only` (тут `-k`), snapshot-тести (є `syrupy`, одне речення).
