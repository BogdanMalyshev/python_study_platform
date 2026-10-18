# Нотатки до m7-l01

## Що запускалось

FastAPI немає ні в кореневому `.venv`, ні в Pyodide, тому для FastAPI-прикладів створено окреме оточення в scratch-підпапці
`m7-l01`: `uv venv -p 3.12` + `uv pip install --exclude-newer 2026-10-01 fastapi uvicorn httpx pytest pydantic-settings`
(версії не новіші за 1 жовтня 2026, тобто старші за два тижні на дату уроку):

| Пакет | Версія |
|---|---|
| Python | 3.12.12 |
| fastapi | 0.142.2 |
| starlette | 1.7.0 (у scratch-копії капстоуну через `uv run` підтягнулась 1.8.0) |
| pydantic | 2.13.5 (кореневий `.venv` для browser-завдань: 2.14.1) |
| pydantic-settings | 2.15.0 |
| uvicorn | 0.54.0 |
| httpx | 0.28.1 |
| anyio | 4.15.1 |
| pytest | 9.1.1 |

- Усі самодостатні python-блоки `lesson.md` (12 штук) витягнуті скриптом з файлу і виконані цим оточенням
  (`-W ignore::UserWarning`, див. нижче про httpx2); stdout збігся з наступним `text`-блоком. Live-блок з `TypeAdapter`
  виконано кореневим `.venv/bin/python`. Блок з потоками пулу (`open T1..`, `[500, 200, 500]`) недетермінований за
  порядком; у тексті уроку це сказано, а кількість 500-х стабільно ненульова при `check_same_thread=True` і нульова
  (`[200, 200, 200]`) при `False`; повний `ProgrammingError` узято з того самого прогону з `raise_app_exceptions=True`.
- Через справжній uvicorn у фоні (на вільних портах, потім `pkill`, перевірено `pgrep`, що жодного uvicorn не лишилось):
  мінімальний застосунок з `--reload` і `curl` на `/health`, `/openapi.json`, `/docs` (вивід у уроці з запуску на 8000);
  `where:app` (потік і наявність event loop для `def` і `async def`); бенчмарк `slow:app` з клієнтом на `httpx.AsyncClient`
  (3 паралельні запити на кожен ендпоінт + `/health` під час блокування); застосунок капстоуну зі справжнім SQLite
  (`FORMBUILDER_OUT_DIR=out uv run uvicorn formbuilder.api:app`), повний сценарій curl і перелік маршрутів з `openapi.json`.
- Капстоун: копія `capstone/` (pyproject, src, README) у scratch, додані залежності з таблиці, написані stand-in модулі
  попередніх уроків (`models.py` з рішенням m2-l09 t5 + camelCase, `settings.py` як у m6-l06, мінімальний `store.py` з
  `JobStore`, `migrate`, `ConfigRecord`, `JobRecord`), пакет `api/` дослівно як у розділі "Для капстоуну",
  `tests/fakes.py` і `tests/test_api.py` (6 тестів, включно з `visibleIf` на невідоме поле → 422 з `loc == ["body"]`).
  `uv run pytest tests/test_api.py -q` → `6 passed, 1 warning`; `uv run mypy src` (strict з pyproject капстоуну) і
  `uv run ruff check src tests` без помилок.
- `tasks.yaml`: `yaml.safe_load`; для t1–t3 `solution + harness` виконано кореневим `.venv/bin/python`, вивід збігся з
  `expected` після нормалізації; `starter + harness` падає або дає інший вивід. Наївний варіант t3
  (`model_validate(...).model_dump(...)`) перевірено: він віддає `workerToken` і падає на `list[JobOut]`. Формат t2
  звірено з реальним FastAPI 422 (той самий `type/loc/msg`, включно з `model_attributes_type` для тіла-списку).
- Квізи q1–q4 виконано як код з FastAPI, відповіді звірені з виводом (q3 спирається на бенчмарк з уроку).
- Окремо перевірено твердження з callout-ів: `tag: list[str] = []` без `Query()` стає тілом; `extra="forbid"` на моделі
  відповіді дає 500; dataclass і підклас моделі фільтруються моделлю відповіді; `Depends(get_settings())` дає
  `TypeError ... is not a callable object` (для порожнього dict голий `AssertionError`); проковтнутий виняток у
  залежності з `yield` дає `FastAPIError: Response not awaited...`; `TestClient` без `with` не запускає lifespan;
  `use_cache=False` дає два виклики; `lru_cache` на `get_settings` (`CacheInfo(hits=1, misses=1, ...)`); циклічний імпорт
  роутера; lax-bool `yes/on/1/true`; пул anyio за замовчуванням 40 токенів; FastAPI всередині справді використовує
  `TypeAdapter.validate_python(..., from_attributes=True)` і `dump_python` (`fastapi/_compat/v2.py`).

Скорочення реального виводу: у прикладі циклічного імпорту і в warnings summary pytest абсолютний шлях до scratch
замінено на `...`; у виводі uvicorn пропущено перший рядок `Will watch for changes in these directories: [...]` зі
шляхом; прогін капстоуну й бенчмарк ішли на вільних портах (18732, 18733), у командах уроку показано типовий 8000.
Більше нічого у виводі не редагувалось.

## Рішення

- **httpx2.** Starlette 1.x при імпорті `TestClient` з httpx друкує `StarletteDeprecationWarning` (це `UserWarning`) з
  порадою встановити `httpx2` (пакет з `pydantic/httpx2`). Бриф і курс тримаються httpx, тож httpx2 не додано: у
  уроці один callout про попередження, у p1 речення, що воно нешкідливе. Рішення, чи переводити тести капстоуну на
  `httpx2` або фільтрувати попередження в `pyproject`, варто прийняти в m7-l05.
- **Протокол сховища.** Урок m6-l08 ще не написаний; з його `questions.md` відомі `JobStore`, таблиці `configs`/`jobs`,
  `migrate(conn)` і Protocol. API залежить від `FormStore(Protocol)` з чотирма методами: `save_config(form_id, config_json)
  -> int`, `latest_config(form_id) -> ConfigRecord | None`, `enqueue(form_id, version) -> str`, `get_job(job_id) ->
  JobRecord | None`; `ConfigRecord` і `JobRecord` як dataclass. Автору m6-l08 варто або назвати методи так само, або
  p1 тут уже каже "допишіть чи перейменуйте". У `jobs` урок використовує `form_id` + `version` замість `config_id`.
- **Налаштування в капстоуні.** Теорія дає канонічне `@lru_cache def get_settings()` + `Depends`. У капстоуні фабрика
  `create_app(settings)` бере `get_settings()` лише як default, lifespan бере налаштування із замикання, а залежності
  читають `app.state.settings`: lifespan не бачить `dependency_overrides`, і інакше тест мігрував би справжню базу.
  Це пояснено callout-ом у розділі про lifespan.
- **SQLite і потоки.** Синхронні залежність, обробник і прибирання після `yield` реально виконуються в різних потоках
  пулу; звідси `check_same_thread=False` у `get_store` (з'єднання на запит). Тема `check_same_thread` належить m6-l08,
  тут лише наслідок для FastAPI.
- **`Depends(scope=...)`.** У FastAPI 0.142 є параметр `scope="function" | "request"`; перевірка порядку закриття проти
  серіалізації відповіді не дала видимої різниці на `TestClient`, тому в урок не включено.
- **Межі.** `HTTPException` використано лише для 404 у капстоуні, без пояснень (m7-l02). Воркер, `asyncio.Queue` у
  lifespan показано однією демонстрацією, повний воркер у m7-l03. `TestClient` пояснено одним реченням, async-тести й
  фікстури в m7-l05. HTTP-теорія (методи, статуси, REST) не викладається; 201/202/404/422/500 лише як значення.
- **Обсяг.** 39 абзаців теорії без callout-ів (12 callout-ів) і закривальних розділів, біля верхньої межі орієнтира.
  Поділ не пропоную: кожне з 10 питань потребує коду з виводом, а розділи "def чи async def" і "lifespan" найважчі й
  уже стислі.
- **Завдання.** Код-завдань 3 (нижня межа): бриф обмежує browser-завдання Pydantic-моделями запитів і відповідей, тож
  t1 модель тіла, t2 формат 422, t3 механізм `response_model` через `TypeAdapter` (поєднує from_attributes, аліаси,
  фільтрацію підкласів, списки). Квізів 4, проєктне 1. Відповіді квізів на різних позиціях.

## Незакриті питання

Немає, усі 10 пунктів `questions.md` закриті.

## Залежності

Спирається на: m2-l09 (`FormConfig`, camelCase-аліаси, `extra="forbid"`, `e.errors()`), m2-l07 (Protocol), m4-l07 і
m5-l06 (контекстні менеджери, `@asynccontextmanager`), m4-l08 (composition root, fakes у `tests/fakes.py`),
m5-l03 (`lru_cache`), m5-l04 (декоратор-реєстратор, `inspect.signature`), m5-l05 (блокуючий виклик в event loop),
m5-l07 (httpx), m6-l06 (`Settings`), m6-l08 (`JobStore`, `migrate`, `check_same_thread`), m3-l01 (пакети).

Готує: m7-l02 (формат помилок поверх `detail`, `HTTPException`), m7-l03 (воркер у lifespan `create_app`, перехід
`build_form` на `async def` + `to_thread`), m7-l05 (`dependency_overrides`, `with TestClient`, `MemoryStore`,
рішення про httpx2).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `FormStore` прибрано: API працює з `JobStore` з m6-l08 плюс `latest_config` і `get_job`; `ConfigRecord` у `store.py`. Фейк `MemoryStore` з `tests/fakes.py` замінено на `MemoryJobStore` зі `store.py`. Id задачі ціле, `JobOut` має `configId`/`configVersion`.
- Фабрика `create_app(settings)` у `api/app.py`, `api/__init__.py` порожній, запуск `uvicorn formbuilder.api.app:app`. Згадано `Settings.workers` з m6-l06.
- Тести капстоуну ставлять `httpx2` (одне речення в пастці про `TestClient` і в розділі капстоуну).
- Увесь код розділу капстоуну перезапущено на чернетці (FastAPI 0.143.5, Starlette 1.8.0, httpx2): curl-прогін через uvicorn дав новий вивід (вставлено), `tests/test_api.py` 6 passed без попередження, `mypy --strict` на пакеті без помилок.
