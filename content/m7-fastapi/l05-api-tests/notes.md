# Нотатки до m7-l05 "Тести API: pytest і httpx AsyncClient"

## Що запускалось

Окремий scratch-venv у `<scratchpad>/m7-l05/` (`uv venv --python 3.12`, CPython 3.12.12), після перевірки видалений разом з усією підпапкою. Встановлено:

```
uv pip install fastapi==0.143.5 httpx==0.28.1 pytest==9.1.1 anyio==4.15.1 pytest-asyncio==1.4.0 \
    asgi-lifespan==2.1.0 pydantic-settings==2.16.0 pytest-cov==7.1.0 httpx2==2.13.1
```

Транзитивно: starlette 1.8.0, pydantic 2.14.1, pydantic-core 2.50.1, httpcore 1.0.9, coverage 7.16.2, pluggy 1.7.0. `httpx2` доставлено після першого прогону, щоб зафіксувати попередження Starlette без нього і зникнення з ним.

- **Скорочене дзеркало капстоуну** (`src/formbuilder/`): `models.py` (FormConfig з m2-l09, три типи елементів), `settings.py` (pydantic-settings, `get_settings` з `lru_cache`), `storage.py` (SQLite: форми з версіями, задачі), `publish.py` (Renderer/Publisher Protocol, `HtmlRenderer`, `DirPublisher`), `events.py` (`EventHub`), `worker.py` (`Worker` з `run_once`, ретраями й інʼєктованим `sleep`), `api/` (`create_app(settings)`, lifespan з воркерами, роутери `forms` і `jobs`, WebSocket `/ws/jobs/{id}`, обробники помилок у форматі `{"error": {"code", "message", "fields"}}`, middleware `X-Request-ID`). Тести `tests/conftest.py`, `test_api_forms.py`, `test_api_jobs.py`, `test_events.py`, `test_ws.py` з уроку: 20 тестів, `pytest -q` 20 разів поспіль зелені (0.19–0.39 с), `-m "not slow"` відбирає 18 з 19 до появи `test_events.py`. Звіти coverage в уроці зняті з `--cov=formbuilder --cov-branch --cov-report=term-missing:skip-covered` з `--ignore=tests/test_events.py` (до) і без нього (після).
- **Демо-файли розділів** запускались окремими прогонами pytest: `test_where.py` (потоки TestClient/AsyncClient), `test_traps.py` (lifespan і BackgroundTasks), `test_500.py` (`raise_app_exceptions`), `test_overrides.py` (три пастки `dependency_overrides`), каталоги з `anyio_mode = "auto"`, `asyncio_mode = "auto"`, строгим pytest-asyncio, без маркера, `ScopeMismatch`, обидва auto-режими разом (`PytestConfigWarning`). `base.py` і блок з `sqlite3 :memory:` запущені як скрипти.
- **Звірка уроку з кодом**: скрипт витягнув усі ```` ```python ```` блоки; повні файли (`test_where.py`, `base.py`, `test_traps.py`, `test_overrides.py`, `test_500.py`, `tests/conftest.py`, `tests/test_events.py`) збігаються з запущеними дослівно, фрагменти (`(фрагмент)` і уривки тестів) рядок у рядок містяться в запущених файлах. Не запускались лише ілюстрації: python-половина пари з supertest на початку і сніпети в "Типових помилках".
- **Вивід** вставлено реальний, з обрізаними заголовками сесії й шляхами до basename; у traceback залишено рядки з `E` і підсумок. Числа `loop NNN` (id циклу mod 1000) і суфікс імені потоку порталу змінюються між запусками, в уроці це сказано.
- **Завдання**: для t1–t3 запущено `solution + harness` через `.venv/bin/python` у корені курсу (pydantic 2.x): вивід збігається з `expected`; `starter + harness` не збігається для всіх трьох. Квізи: q1 (ScopeMismatch), q2 (AttributeError з lifespan, піднятий у тест), q3 (ключ `Settings` замість `get_settings`), q4 (BackgroundTasks уже виконані) перевірені тими самими демо-файлами.
- **Платформа**: `platform/build.py:load_lesson(...)` викликано напряму без запису `dist/`: помилок немає, кожне завдання вставлене рівно один раз.

## Рішення

- **Схема async-тестів: плагін anyio з `anyio_mode = "auto"` і `anyio_backend` зі `scope="session"`.** Причини в уроці: без нової залежності (anyio приходить з Starlette/httpx), один механізм з `TestClient`, auto-режим прибирає маркери. pytest-asyncio показано для порівняння (auto/strict, `@pytest_asyncio.fixture`).
- **Lifespan у тестах через `asgi-lifespan` (`LifespanManager`)**, а не `app.router.lifespan_context(app)`: менеджер шле справжні ASGI-події lifespan, як uvicorn. Це нова dev-залежність капстоуну разом з `httpx2`.
- **`create_app(settings)`**: урок вимагає, щоб застосунок збирався фабрикою з явних налаштувань. Якщо m7-l01 напише lifespan з прямим `get_settings()`, проєктне завдання p1 і callout "Для капстоуну" кажуть перевести на фабрику. Бажано, щоб m7-l01 одразу ввів `create_app(settings: Settings | None = None)` і `Settings.workers`.
- **Starlette 1.8 і httpx2**: `TestClient` у Starlette 1.x імпортує `httpx2`, а з `httpx` дає `StarletteDeprecationWarning`. Урок рекомендує `uv add --dev httpx2` і лишає `AsyncClient` на httpx 0.28 (як у m5-l07). Варто перевірити, що m7-l01 і m7-l04 (там `TestClient` теж з'являється) кажуть те саме.
- **Формат полів помилки 422** узято як `{"path": "elements.0.input.label", "code": <type Pydantic>, "message": <msg>}`, шлях з `loc` без провідного `body`. questions.md до m7-l02 задає лише `{"error": {"code", "message", "fields"}}`; якщо m7-l02 обере інший вигляд `fields`, t3 і параметризований тест треба синхронізувати.
- **Імена капстоуну, на які спирається урок** (з questions.md m7-l01–l04, уроки ще не написані): `app.state.storage/queue/hub/worker`, `Worker.run_once()`, `Worker(..., sleep=...)`, `EventHub.events(job_id)` і `get_hub`, ендпоінти `POST /forms` (201, `{"id", "version"}`), `GET /forms/{id}`, `POST /forms/{id}/build` (202, `{"job_id", "status"}`), `GET /jobs/{id}`, `/ws/jobs/{id}` з кодом закриття 4404 для невідомої задачі. Проєктні завдання кажуть адаптувати, якщо імена в m7-l01–l04 інші.
- **Знахідка в дзеркалі, корисна для m7-l04**: якщо `EventHub.events` це async-генератор, підписка відбувається лише на першому `__anext__`, і подія між читанням стану зі сховища та початком `async for` губиться (з реальним воркером WS-клієнт міг би зависнути). У дзеркалі `events()` підписується одразу і повертає генератор. Coverage в уроці показує цей ефект з іншого боку: тест з реальним воркером майже завжди бачить `done` зі сховища, і стрімінг не виконується.
- **`requires: [pydantic]`** для t1 і t3; t2 на чистій стандартній бібліотеці. Браузерні завдання лише для чистих хелперів (фабрика, `set_path`, перетворення помилок), бо FastAPI у Pyodide немає.
- **Обсяг**: близько 32 абзаців теорії плюс 6 callout-блоків, у межах орієнтиру; ділити не пропоную. Тривалість 90 хв через три проєктні завдання.

## Незакриті питання

Немає: усі 10 пунктів `questions.md` позначені. OpenAPI-snapshot дано одним реченням, як просить питання.

## Залежності

Спирається на: m3-l03 (фікстури, `parametrize`, `pytest.param`, factory fixture, `tmp_path`, маркери, `--strict-markers`), m3-l04 (fake проти мока, coverage з гілками), m5-l07 (`AsyncClient`, транспорт, `base_url`, `MockTransport`), m6-l08 (SQLite, `:memory:`), m7-l01 (`Depends`, lifespan, `app.state`), m7-l02 (формат помилок, обробник `Exception`), m7-l03 (воркер, ретраї, `BackgroundTasks`), m7-l04 (WebSocket-ендпоінт і менеджер подій).

Готує: m7-l06 (тест `JinjaRenderer` проти еталонного HTML і повний сценарій зі справжньою розміткою), m7-l07 (`create_app`/`Settings` як точка входу, `pytest -m "not slow"` у збірці).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- Формат помилок звірено з m7-l02: 404 форми це `http_404`, 500 це `internal_error`, t3 будує шлях як `loc_to_path` (джерела `body/query/path/header/cookie` зрізаються; `expected` для `query.limit` став `limit`).
- Файли тестів: `test_api.py`, `test_api_errors.py`, `test_worker.py`, `test_ws.py` (тест хаба напряму тепер у `test_ws.py`). Список `pytest -v` перебудовано під нові файли (ті самі 19 тестів, відсотки за позицією). Звіти coverage лишилися з дзеркала й так підписані.
- Імена дзеркала (`Storage`, `EventHub`, `app.state.storage/hub`) замінено на капстоунні (`SqliteJobStore`, `JobEvents`, `app.state.store/events`); тест хаба переписано на типізовані події m7-l04 і перевірено (1 passed).
