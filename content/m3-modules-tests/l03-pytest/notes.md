# Нотатки до m3-l03

## Що запускалось

Python 3.12.12, pytest 9.1.1, pluggy 1.7.0 з `.venv` курсу (там же anyio 4.15.1 як плагін). Кожен pytest-приклад уроку
лежав окремою папкою в `<scratchpad>/m3-l03/` і запускався через `.venv/bin/pytest` з тими прапорцями, що показані
в уроці (`-q`, `-v`, `-vv`, `-x`, `-k`, `--lf`, `-s`, `-l`, `--tb=short`, `--tb=line`, `--assert=plain`,
`--collect-only -q`, `--fixtures`, `-m "not slow"`). У `lesson.md` команди записано як `uv run pytest ...`, бо так їх
запускає учень у капстоуні; pytest той самий. Із заголовка сесії прибрано `rootdir:` і `plugins: anyio-4.15.1`,
абсолютні шляхи скорочено до імен файлів, довгі виводи обрізано `...`; урок каже про це один раз на початку і там,
де обрізано список фікстур.

- Теорія: `test_slug.py` (вивід з переписуванням і з `--assert=plain`; кешований `.pyc` з тегом
  `cpython-312-pytest-9.1.1` побачено після запуску з `PYTHONDONTWRITEBYTECODE` знятим), `test_tuple.py`
  (`PytestAssertRewriteWarning`), `test_labels.py` (`-v`, `-x`, `-k`, node id, `--lf`, `-s`), `test_diff.py`
  (diff словника і списку, `-vv`, `--tb=short -l`), `test_raises.py`, `test_regex.py`, `test_raises_traps.py`,
  `test_warns_approx.py`, `test_colors.py`, `test_required.py`, `test_matrix.py`, `test_ids.py` (автоматичні id,
  суфікси повторів; окремо перевірено, що `strict = true` робить повтори помилкою збирання), `test_fixtures.py`
  (ERROR для невідомої фікстури), `test_lifecycle.py` (порядок setup/teardown для scope/autouse/залежностей),
  `test_teardown.py`, `test_leak.py`, дерево `tests/` з двома `conftest.py` і `--fixtures`, `test_classes.py`
  (новий екземпляр на тест, `PytestCollectionWarning` для `__init__`), helper-модуль проти `conftest.py`
  (переписування assert), `test_builtin.py` (tmp_path, monkeypatch setenv/delenv/chdir/setattr, capsys, caplog),
  `test_markers.py` з `pyproject.toml` (`--strict-markers`, `-ra`, skip/skipif/xfail strict, параметризована
  фікстура через `request.param`), опечатка маркера без строгості, з `--strict-markers`, з `strict = true` у
  `[tool.pytest.ini_options]` і в `[tool.pytest]`, `async def` тест без плагіна і з `@pytest.mark.anyio`.
- Механізм assertion rewriting додатково підтверджено traceback-ом помилки збирання: кадри
  `_pytest/assertion/rewrite.py: exec_module -> _rewrite_test -> ast.parse`. Правила id і суфіксів звірено з
  `_pytest/python.py` (`_idval_from_value`, `make_unique_parameterset_ids`), утримання трьох останніх `tmp_path`
  з `tmp_path_retention_count` у `_pytest/tmpdir.py`.
- 6 блоків `python live` виконано скриптом, що витягує їх з `lesson.md` і порівнює stdout з наступним `text`-блоком
  (рядок `SyntaxWarning` у блоці з кортежем іде в stderr).
- Капстоун: копія `capstone/` у scratch (без `.venv`), `uv add pydantic`, моделі з рішення m2-l09 t5 плюс
  `alias_generator=to_camel, validate_by_name=True` з чекліста m2-l09 p1, `config.py`, `conftest.py`,
  `test_models.py`, `test_config.py` дослівно як в уроці, фікстура `form_signup.json` з camelCase-ключами;
  `uv run pytest -v` дав вивід з уроку (16 passed). Для p1/p2 додатково: `strict = true`, `-ra`, маркер `slow`,
  `tests/test_cli.py` з capsys і `monkeypatch.setattr("sys.argv", ...)`: 20 passed, `-m "not slow"` дає
  `1 deselected`, `@pytest.mark.slwo` дає помилку збирання; `uv run ruff check` і `uv run mypy src` чисті;
  `visible_if` на неіснуюче поле всередині `block` дає рівно `['value_error']`. Справжній `capstone/` не змінювався.
- `tasks.yaml`: розпарсено `yaml.safe_load`, кожне `solution + "\n\n" + harness` виконано `.venv/bin/python` і
  звірено з `expected` після нормалізації; усі 5 збігаються. `starter + harness` для кожного завдання дає інший
  вивід (t1, t2: "НЕ спіймано"; t3, t5: TypeError на `None`), тобто заготовка не проходить перевірку. Для t3
  наївна версія з модульною константою і `{**DEFAULT, **overrides}` дає `2 {'required': True}`, тож харнес
  справді ловить неглибоку копію. t4 звірено з реальними id pytest на тих самих таблицях через `--collect-only`.
  Відповіді q1–q4 звірені з реальними запусками (test_leak.py, test_regex.py, test_tuple.py, test_matrix.py).
- `platform/build.py`: для m3-l03 помилок немає (падіння збірки в момент перевірки стосувалися інших уроків,
  які ще пишуться: l01, l02, l05 модуля 3 і m6-l01).

## Рішення

- Розділів `##`: вісім теоретичних, `Для капстоуну` і три обов'язкові. Прозових абзаців теорії 45 (з них
  приблизно шість однорядкових ремарок на кшталт "Показано лише рядки з `E`") плюс 7 callout-блоків. Це вище
  орієнтира 40, але нижче 50: `questions.md` має 12 пунктів, кожен з кодом і виводом. Якщо ділити, природна межа:
  "assert, запуск, raises, parametrize" і "фікстури, conftest, вбудовані фікстури, маркери".
- Розділ "Запуск і читання падіння" не має `python live` чи завдання: прапорці CLI в браузері не запустити. Кожен
  абзац там іде з bash-командою і реальним виводом, тож правило "не більше 6 абзаців без коду" виконано.
- pytest у браузері недоступний, тому браузерні завдання перевіряють те, що можна відокремити від pytest: t1
  (тести-функції з голим assert, харнес збирає `test*` з globals і проганяє на мутантах), t2 (таблиця
  parametrize, перевірена на мутантах реалізації), t3 (фабрика даних для factory fixture), t4 (правила
  автоматичних id), t5 (міні-раннер: збирання функцій і класів `Test*`, новий екземпляр на тест, інʼєкція
  фікстур за іменами з `inspect.signature`, ERROR проти FAILED). `inspect.signature` в уроці показано живим
  прикладом у розділі про фікстури.
- `questions.md` називає модуль капстоуну `formbuilder.config`, а m2-l09 p1 кладе моделі в `formbuilder/models.py` і
  тести в `tests/test_models.py`. Узгоджено так: моделі лишаються в `models.py`, тести моделей у `test_models.py`
  (як у m2-l09), а новий `formbuilder/config.py` з `load_config` і `ConfigError` отримує `tests/test_config.py`
  з `tmp_path`. У verify m2-l09 p1 стоїть `.venv/bin/pytest tests/test_models.py -q`, що розходиться з правилом
  спеки `cd capstone && uv run ...`; тут verify за спекою, автору курсу варто вирівняти m2-l09.
- У прикладах капстоуну ключі в snake_case (працюють і з `validate_by_name=True`, і без alias generator), а
  camelCase з фронтенду перевіряє окремий рядок валідної таблиці і `form_signup.json`.
- pytest 9 має ini-опцію `strict = true` (strict_config, strict_markers, strict_xfail,
  strict_parametrization_ids) і нативну секцію `[tool.pytest]`. Урок рекомендує `strict = true`, але лишає
  `[tool.pytest.ini_options]`, як у m0-l06; `[tool.pytest]` не згадано, щоб не плодити два формати.
- Моки (`unittest.mock`, `pytest-mock`, "патчити там, де шукають") лише згадані з посиланням на m3-l04;
  `monkeypatch.setattr` показано на одному прикладі як вбудовану фікстуру. Coverage не згадується.
- Асинхронні тести: лише вивід падіння `async def` без плагіна і назви плагінів, посилання на m5-l05 і m7-l05.
  Приклад з `@pytest.mark.anyio` запускався, але в урок не потрапив: asyncio ще не пройдено.
- `syrupy` згадано одним реченням у типових помилках.
- `scope="session"` описано разом з `module` одним реченням без окремого прикладу: поведінка та сама, різниця лише
  в межі (весь запуск).

## Незакриті питання

Усі 12 питань з `questions.md` закриті кодом і виводом.

## Залежності

- Спирається на m0-l06 (src-layout, `tests/` без `__init__.py`, `testpaths`, `--import-mode=importlib`, smoke-тест,
  `formbuilder.cli.main`), m1-l11 (`raise ... from`, `__cause__`), m2-l04 (`Counter`, `defaultdict` у t4),
  m2-l09 (моделі `FormConfig`, типи помилок Pydantic, p1 з `tests/test_models.py` і `form_signup.json`), m3-l02.
- Готує для m3-l04 (`monkeypatch.setattr`, фікстури як спосіб видати мок, `capsys` для CLI), m3-l05 (doctest через
  pytest), m4-l07 (`pytest.raises` як контекстний менеджер, згадано), m6-l01 (`tmp_path` як `Path`), m6-l06
  (`ConfigError` і `load_config` для CLI), m7-l05 (плагін anyio, фікстури застосунку).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `config.py` більше не новий модуль: `ConfigError` і `load_config` дописуються поруч з моделями з m2-l09. Імпорт у фрагменті `tests/test_models.py` став `from formbuilder.config import FormConfig`; вивід pytest не змінюється.
