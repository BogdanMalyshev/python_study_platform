# Нотатки до m3-l04 "Моки: unittest.mock, pytest-mock; coverage"

## Що запускалось

Середовища:

- `.venv/bin/python` з кореня проєкту (CPython 3.12.12, pytest 9.1.1): усі standalone-приклади уроку і всі `solution + harness`.
- Окремий scratch venv у підпапці `m3-l04` тимчасової директорії (`uv venv -p 3.12` + `uv pip install`): pytest 9.1.1, **pytest-mock 3.17.0**, **pytest-cov 7.1.0**, coverage 7.16.2. У проєктний `.venv` нічого не ставилося. У ньому запускались усі блоки з виводом `$ pytest ...`.
- Копія `capstone/` у тій самій scratch-підпапці, де виконано `uv add --dev pytest-mock pytest-cov` (uv 0.9.28; резолвились ті самі версії pytest-mock 3.17.0 і pytest-cov 7.1.0) і написано еталонний розв'язок p1–p3. Справжній `capstone/` не змінювався.

Перевірки:

- `lesson.md`, standalone-блоки: скрипт витягнув кожен ```` ```python ```` / ```` ```python live ```` без заголовка-шляху (`# tests/...`), запустив через `.venv/bin/python` і порівняв зі stdout плюс текстом останнього винятку. 18 блоків, 18 збігів. Вивід вставлено з цих запусків, не вручну. Блок про забутий `await` має окремий text-блок зі stderr того самого запуску; шлях до файлу в ньому скорочено до `.../release_buggy.py`, решта дослівна.
- `lesson.md`, блоки з `$ pytest ...`: другий скрипт зібрав демо-проєкти (`patchdemo`, `covdemo`) з file-блоків уроку (кожен `# formbuilder/...` / `# tests/...` став файлом), застосував toml-блок і "мутацію" `release`, виконав кожну команду з першого рядка text-блоку в scratch venv і порівняв stdout. 8 команд, 8 збігів (час `in 0.0Xs` при порівнянні нормалізовано, в уроці стоїть реальний час одного з прогонів). Команди в уроці записані як `pytest ...`, бо саме так їх і виконано з активованим venv; у капстоуні та сама команда йде через `uv run`.
- Розділ "Для капстоуну": `generate.py`, `tests/test_generate.py` і `tests/test_cli.py` витягнуто з уроку в копію капстоуну: `uv run pytest -q` дає 7 passed, `uv run mypy src tests` і `uv run ruff check` без помилок. Вивід `uv run pytest -q --cov` (11 passed, 95.71%, `33, 34->exit`) отримано на повному еталоні p1–p3 з мінімальним `renderers.py` з m2-l07 і двома тестами `HtmlRenderer`; урок про це прямо каже. Окремо перевірено, що `# pragma: no branch` на `case "text":` прибирає `34->exit` (BrPart 2 -> 1).
- `tasks.yaml`: `yaml.safe_load`; для 5 code-завдань `solution + harness` збігається з `expected` після нормалізації; кожен `starter` компілюється і зі своїм харнесом `expected` не дає. Негативні перевірки, що харнес відрізняє неправильні рішення: t2 без перевірки `call_count` на `ValueError` пропускає `greedy`; t3 з `Mock(spec=...)` падає на `assert_called_once_with` (позиційний проти іменованого), без `spec_set` друкує `assigned`; t4 з `patch("clock.now")` дає сьогоднішню дату, з `patch(...).start()` без `stop` дає `False`; t5 зі слабкими `assert_called_*` все одно ловить `no_await`, але через сценарій з помилкою публікатора (див. рішення нижче).
- Квізи: q1 і q3 запущено як є (`done`; `done`, `A`, `AssertionError ... Awaited 0 times.`), q2 відтворено файлами пакета й pytest `-s` (`sent Welcome to a@b.c 0`), q4 відтворено справжнім модулем і `--cov-branch` (`5 0 2 1 86% 3->5`). Перша версія q4 мала 83% з розрахунку "4 інструкції"; реальний запуск показав, що `def` рахується як інструкція, варіанти й пояснення виправлено.
- Твердження з "Типових помилок" перевірено окремо: `mocker.patch("formbuilder.render")` не змінює результат `cli.build` (18 байтів), повідомлення autospec на `pubish` дослівне.

## Рішення

- Розділів `##` дванадцять: вісім теоретичних (верхня межа 5–8), `Для капстоуну` і три обов'язкові. Теорія і капстоун разом мають 44 абзаци без callout-ів (9 callout-ів окремо): вище орієнтиру 40, нижче порогу поділу 50. Причина: 11 питань покривають три інструменти (unittest.mock, pytest-mock, coverage). Якщо урок здасться важким, природна лінія поділу: розділ coverage плюс "тести, що нічого не перевіряють" як окремий урок на 25–30 хвилин. Найдовший пробіг без коду чи завдання 3 абзаци. `duration_min: 80`.
- m3-l03 (prerequisite) писався паралельно: на старті був лише `questions.md`, тому урок спирається на нього так, як його описують питання (fixtures, `conftest.py`, `tmp_path`, `monkeypatch`, `capsys`). Готовий `lesson.md` m3-l03 з'явився наприкінці; він відсилає сюди за правилом "патчити там, де шукають", `unittest.mock` і coverage, і обіцяє рівно те, що тут є (`monkeypatch.setattr`, фікстури, що видають моки, fake перед моком). Тут `monkeypatch` згадано одним абзацом із тим самим правилом.
- asyncio учень ще не проходив (m5-l05 іде після). Тому `async def`/`await` введено одним реченням через JS-аналог, корутину названо з позначкою "офіційний термін", а `AsyncMock` пояснено без event loop у глибину. Async-тести в капстоуні через `asyncio.run` у звичайних тестах, без `pytest-asyncio` (питання m3-l03 відсилають його до m7-l05).
- Питання "тест воркера генерації": воркер з чергою з'являється лише в m5-l05 (p1 там), тому тут у капстоун додано один крок генерації `generate(slug, elements, theme, renderer, publisher)` з `Publisher` Protocol і `DirPublisher`. Воркер m5-l05 може викликати його як свій `render`. Тест кроку побудований саме як просить питання: fake-рендерер і `AsyncMock` (через `create_autospec` від протоколу) для публікації. Варто, щоб автор m5-l05 знав про `formbuilder.generate`.
- CLI у капстоуні поки лише `--help`/`--version` (m0-l06). Замість "мокання файлової системи" в CLI тест `mocker.patch` показує правило "де шукають" на справжньому коді: `cli.py` робить `from formbuilder import __version__`, тож патч `formbuilder.__version__` не працює, а `formbuilder.cli.__version__` працює. Файлова система тестується через `tmp_path` у `DirPublisher`, без моків, як і пропонує питання ("або `tmp_path` замість мока").
- Python 3.12 уже ловить частину помилкових асертів (`called_once_with`, `assert_called_once_wiht`): перевірено запуском, урок не повторює застарілу пораду "будь-яка опечатка в асерті проходить", а показує, що саме проходить (`toHaveBeenCalledWith`, асерт без дужок). Версію, у якій з'явився захист імен без `assert_`, не вказано, бо перевірено лише на 3.12.
- `freezegun` і `time-machine` згадано одним реченням без запуску (не встановлені); твердження про них загальні.
- Код-завдання t2 і t5 інвертовані: учень пише тест (`check_retry`, `check_generate`), а харнес проганяє його на правильній і зламаних реалізаціях. Так перевіряється саме вміння писати мок-асерти. "Тест упав" у харнесі означає будь-який виняток, як у pytest; це сказано в умові t2. У t5 `no_await` ловиться і перевіркою `awaited`, і сценарієм з помилкою публікатора (без `await` `side_effect` не спрацьовує); окремо його ловить лише `assert_awaited_*`, тож у підказках і умові наголос на `awaited`.
- t4 імітує два модулі через `types.ModuleType` + `sys.modules`, бо в браузері немає файлів. Блок setup лежить у `starter` з позначкою "не змінювати".
- Усі завдання `runtime: browser` використовують лише stdlib (`unittest.mock`, `asyncio`, `typing`). Що `unittest.mock` доступний у Pyodide, перевірено не на платформі, а за складом stdlib Pyodide: варто прогнати t1–t5 у браузері один раз.
- Квізи мають правильні відповіді на різних позиціях (0, 1, 2, 1).

## Незакриті питання

Немає. Усі 11 пунктів `questions.md` позначено `[x]`.

## Залежності

- Спирається на: m3-l03 (fixtures, `conftest.py`, `tmp_path`, `monkeypatch`, `capsys`), m2-l07 (Protocol, `Renderer`, `Element`, `Theme`, `renderers.py` з p2), m0-l06 (`cli.py`, `__version__`), m3-l02 (dev-група проти extras, одне посилання), m3-l01 (як працює `from x import y`, неявно).
- Готує: m3-l05 (`uv run pytest --cov` як спільна команда з doctest), m4-l08 (DI через параметри, fake проти mock), m5-l05 (`formbuilder.generate` для воркера, `AsyncMock`), m5-l07 (згадано `httpx.MockTransport` як альтернативу мокам клієнта), m7-l05 (`mocker`, правило "де шукають", `pytest-asyncio` замість `asyncio.run`).
- Капстоун після уроку: dev-залежності `pytest-mock`, `pytest-cov`; `src/formbuilder/generate.py`; `tests/test_cli.py`, `tests/test_generate.py`; `[tool.coverage.*]` у `pyproject.toml`; `htmlcov/` у `.gitignore`.

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `Publisher` і `DirPublisher` переїхали з `generate.py` у `publisher.py`, `generate.py` імпортує `Element`/`Theme` з `formbuilder.domain`. Fake-рендерер у тесті перейменовано на `FakeRenderer` (поля `type`/`mode` domain-моделей). Перевірено на чернетці капстоуну: `pytest tests/test_generate.py` 2 passed, `mypy --strict` без помилок.
- Звіт coverage з `renderers.py` лишився з еталонного прогону і підписаний як ранній еталон; номери рядків у пакеті `renderers/` будуть інші.
