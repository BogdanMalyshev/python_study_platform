# Карта капстоуну FormBuilder

Єдине джерело правди для того, що лежить у `capstone/` після кожного уроку. Правка будь-якого проєктного
завдання, розділу "Для капстоуну" чи `notes.md`, яка зачіпає файли, імена чи залежності капстоуну, спершу
звіряється з цим документом, а якщо змінює рішення, то оновлює і його.

Скелет `capstone/` у корені курсу це еталон уроку m0-l06, його не змінюють. Нижче описано стан репозиторію
учня після модуля 7.

## Репозиторій і перевірки

- src-layout, пакет `formbuilder`, керування через uv (m0-l06). Python 3.12.
- З m3-l06 капстоун окремий git-репозиторій (`git init` у `capstone/`): власний `.pre-commit-config.yaml` без
  `files:` і без `--directory`, CI у `capstone/.github/workflows/ci.yml` без `paths` і `working-directory`.
- `verify` кожного проєктного завдання капстоуну починається з `cd capstone && uv run ...` (lesson-spec, розділ 3).
- Проєктні завдання, не пов'язані з капстоуном, живуть у `practice/<id уроку>/`, `verify` з кореня курсу через `.venv/bin/...`.

## Розкладка пакета

Імена файлів остаточні з моменту створення: жоден урок їх не перейменовує, наступні уроки лише дописують.

```text
src/formbuilder/
├── __init__.py          # докстрінг і __version__, без реекспорту (m0-l06, m3-l01)
├── __main__.py          # python -m formbuilder (m0-l06)
├── py.typed             # m2-l08
├── config.py            # вхідна межа: Pydantic-моделі конфігу, to_domain, ConfigError, load_config
├── domain.py            # frozen dataclass дерева форми, чисті функції, ElementTree, ElementType
├── renderers/
│   ├── __init__.py      # available_formats(), get_renderer(fmt) (m3-l01; до того RENDERERS з m2-l07)
│   ├── base.py          # Protocol Renderer (m2-l07), BaseRenderer ABC (m4-l04, m4-l05)
│   ├── html.py          # HtmlRenderer, renderer = HtmlRenderer()
│   ├── text.py          # TextRenderer, renderer = TextRenderer()
│   └── jinja.py         # JinjaRenderer, renderer = JinjaRenderer() (m7-l06)
├── templates/           # page.html.j2 (m3-l02); base.html, form.html, elements.html, critical.css (m7-l06)
├── jobs.py              # GenerationJob (m4-l01, m4-l03), JobStatus (m4-l06), JobNotFound (m7-l02)
├── store.py             # JobStore Protocol, Job, ConfigRecord, migrate, connect, SqliteJobStore, MemoryJobStore
├── publisher.py         # Publisher Protocol і DirPublisher (m3-l04), HttpPublisher (m5-l07), StaticPublisher (m6-l01)
├── generate.py          # generate() (m3-l04), Pipeline (m4-l08)
├── worker.py            # воркер генерації (m5-l05, m5-l06, m5-l09), Worker над JobStore (m7-l03)
├── hub.py               # моделі подій статусу, TERMINAL, JobEvents, hub, get_hub (m7-l04)
├── settings.py          # Settings на pydantic-settings, get_settings (m6-l06, m6-l08, m7-l01, m7-l07)
├── cli.py               # Typer-CLI і build_pipeline (m0-l06 → m3-l01 → m4-l08 → m6-l06 → m7-l07)
├── logs.py              # configure_logging, timed на structlog (m5-l09); JsonFormatter, log_config (m7-l07)
└── api/
    ├── __init__.py      # порожній: імпорт роутера не тягне застосунок
    ├── app.py           # create_app(settings), app = create_app() (m7-l01)
    ├── deps.py          # SettingsDep, get_store/StoreDep (m7-l01), залежності черги й хаба (m7-l03)
    ├── schemas.py       # FormCreated, FormOut, JobOut у camelCase (m7-l01)
    ├── forms.py         # POST /forms, GET /forms/{form_id}, POST /forms/{form_id}/build
    ├── jobs.py          # GET /jobs/{job_id}
    ├── errors.py        # формат помилок і обробники (m7-l02)
    ├── middleware.py    # request id, CORS (m7-l02)
    └── ws.py            # Ping, Pong, ProtocolError, /ws/jobs/{job_id} (m7-l04)
```

Допоміжні модулі уроків, які не входять у ядро і нічим не замінюються: `templating.py` і `plugins.py` (m3-l02),
`decorators.py` (m5-l04), `render_pool.py` (m5-l08), `formats.py` (m6-l02), `timeutils.py` (m6-l03),
`text.py` у корені пакета (m6-l04). Окремих `models.py`, `config_types.py`, `renderers.py`, `tree.py`,
`pipeline.py`, `app.py` у корені пакета, `events.py`, `testing.py`, `jinja_renderer.py` у капстоуні немає.

## Хто що створює і дописує

| Урок | Файли капстоуну |
|---|---|
| m0-l06 | скелет: `__init__.py`, `__main__.py`, `cli.py`, `tests/test_smoke.py`, `pyproject.toml` |
| m2-l05 p1 | створює `domain.py` (`Theme`, `Condition`, `Element`, `FormConfig`, `walk`, `field_names`, `rename_field`), `tests/test_domain.py` |
| m2-l06 p1 | створює `config.py` з TypedDict сирого JSON; `Renderer`/`REGISTRY` у ньому тимчасові |
| m2-l07 p1 | `typing_drills/m2_l07.py` (статична вправа в репозиторії капстоуну) |
| m2-l07 p2 | створює пакет `renderers/` (`base.py`, `html.py`, `text.py`, `__init__.py` з `RENDERERS`, `register()`), `tests/test_renderers.py`; прибирає тимчасовий реєстр з `config.py` |
| m2-l08 p1–p2 | `[tool.mypy]` strict, `py.typed` |
| m2-l09 p1 | `config.py`: TypedDict → Pydantic-моделі з тими самими іменами, `to_domain` (t6); `tests/test_models.py`, `tests/fixtures/form_signup.json` |
| m3-l01 p1–p2 | `domain.FormConfig.render`, `config.parse_config`, `renderer = ...` у модулях форматів, `cli render`; `renderers/__init__.py` переходить на `available_formats`/`get_renderer`; `tests/test_layers.py`, `tests/test_registry.py` |
| m3-l02 p1 | повний `pyproject.toml`, fastapi і uvicorn в основних залежностях, `templates/page.html.j2`, `templating.py`, `plugins.py`, версія 0.2.0 |
| m3-l03 p1–p2 | `config.py`: `ConfigError`, `load_config`; `tests/conftest.py`, `tests/test_config.py`, `tests/test_cli.py`, строгий pytest |
| m3-l04 p1–p3 | `publisher.py` (`Publisher`, `DirPublisher`), `generate.py` (`generate`), `tests/test_generate.py`, coverage |
| m3-l05 p1 | doctest у `domain.py`, `find_by_name` |
| m3-l06 p1 | `git init`, `.pre-commit-config.yaml`, `.github/workflows/ci.yml` |
| m4-l01 p1 | створює `jobs.py` (`GenerationJob`), `tests/test_jobs.py` |
| m4-l02 p1 | `domain.py`: `ElementTree`; `tests/test_tree.py` |
| m4-l03 | `GenerationJob.status` як property (без проєктного завдання) |
| m4-l04 p1 | `renderers/base.py`: `BaseRenderer` з реєстром класів, `TimingMixin`; `tests/test_renderer_registry.py` |
| m4-l05 p1 | `BaseRenderer` стає ABC з template method, `TimingMixin` прибирається; `tests/test_base_renderer.py` |
| m4-l06 | `ElementType` у `domain.py`, `JobStatus` у `jobs.py` |
| m4-l08 p1 | `generate.py`: `Pipeline`; `cli.py`: `build_pipeline`; `tests/fakes.py`, `tests/test_pipeline.py` |
| m5-l04 p1 | `decorators.py` (`register`, `timed`) |
| m5-l05 p1 | створює `worker.py` (`run_workers`, `shutdown`), `tests/test_worker.py` |
| m5-l06 p1 | `worker.py`: `watch`, `worker_pool`; `tests/test_worker_events.py` |
| m5-l07 p1 | `publisher.py`: `make_client`, `HttpPublisher`; `tests/test_publisher.py`; залежність httpx |
| m5-l08 p1 | `render_pool.py` |
| m5-l09 p1 | `logs.py` на structlog, `job_id` у воркері; `tests/test_logs.py` |
| m6-l01 p1 | `publisher.py`: `StaticPublisher(root, keep)` |
| m6-l02 p1 | `formats.py` |
| m6-l03 p1 | `timeutils.py`, залежність tzdata |
| m6-l04 p1 | `text.py` |
| m6-l06 p1 | `settings.py` (`out_dir`, `log_level`, `renderer`, `workers`), Typer-CLI у `cli.py`; `tests/test_cli.py`, `tests/test_settings.py` |
| m6-l08 p1 | створює `store.py`, `Settings.db_path`; `tests/test_store.py` (контрактні тести на обидві реалізації) |
| m7-l01 p1 | `store.py`: `ConfigRecord`, `latest_config`, `get_job`; пакет `api/` з `create_app(settings)`; `tests/test_api.py` |
| m7-l02 p1 | `api/errors.py`, `api/middleware.py`, `JobNotFound` у `jobs.py`, `/sites` для статики; `tests/test_api_errors.py` |
| m7-l03 p1–p2 | `worker.py`: `Worker` над `JobStore`; `store.py`: `retry=` у `mark_failed`, правило вичерпаних спроб у `requeue_running`; воркери в lifespan, `JobOut.url`; `tests/test_worker.py`, `tests/test_api.py` |
| m7-l04 p1–p2 | створює `hub.py`, `api/ws.py`, dev-роут `/dev/ws`; `tests/test_ws.py` |
| m7-l05 p1–p3 | async-тести: `tests/conftest.py` з anyio, `LifespanManager`; розширює `test_api.py`, `test_api_errors.py`, `test_worker.py`, `test_ws.py`; coverage |
| m7-l06 p1–p2 | `renderers/jinja.py`, шаблони; `tests/test_jinja_renderer.py`, `tests/fixtures/signup_dark.html` |
| m7-l07 p1–p2 | `formbuilder serve`, `Settings.host/port/log_json/uvicorn_workers`, `logs.log_config`, `GET /health`; `Dockerfile`, `.dockerignore`, `compose.yaml`; `tests/test_serve.py`, `tests/test_container_files.py` |
| m7-l08 p1 | `docs/why-fastapi.md` |

## Шари й імпорти

- `domain` нижній шар: нічого з `formbuilder` і нічого стороннього під час виконання (`Renderer` лише під `TYPE_CHECKING`).
- `config` (Pydantic) і `renderers` імпортують `domain` і не імпортують одне одного; `to_domain` єдиний міст Pydantic → dataclass.
- `jobs`, `store`, `publisher`, `hub` не імпортують FastAPI.
- `generate` і `worker` знають протоколи (`Renderer`, `Publisher`, `JobStore`), а не реалізації.
- Composition root два: `build_pipeline` у `cli.py` для командного рядка і `create_app(settings)` в `api/app.py` для вебзастосунку.
- Імпорти лише абсолютні (`ban-relative-imports = "all"`, m3-l01).

## Сховище: JobStore

Базовий інтерфейс з m6-l08; m7-l01 додає два читання, m7-l03 одне keyword-only розширення. Інших імен немає:
ні `create`, ні `get`, ні `save`, ні `recover`, ні окремого `FormStore`.

```python
@dataclass(frozen=True)
class Job:
    id: int
    config_id: str
    config_version: int
    status: JobStatus          # з formbuilder.jobs: queued, running, done, failed
    attempts: int
    created_at: datetime
    finished_at: datetime | None
    error: str | None


@dataclass(frozen=True)
class ConfigRecord:            # m7-l01
    config_id: str
    version: int
    json: str
    created_at: datetime


class JobStore(Protocol):
    def save_config(self, config_id: str, config: Mapping[str, Any]) -> int: ...      # m6-l08, нова версія
    def latest_config(self, config_id: str) -> ConfigRecord | None: ...                # m7-l01
    def enqueue(self, config_id: str, version: int) -> int: ...                        # m6-l08, id задачі
    def get_job(self, job_id: int) -> Job | None: ...                                  # m7-l01
    def next_pending(self) -> Job | None: ...                                          # queued -> running, attempts + 1
    def mark_done(self, job_id: int) -> None: ...                                      # лише з running
    def mark_failed(self, job_id: int, error: str, *, retry: bool = True) -> None: ... # retry з m7-l03
    def history(self, config_id: str) -> list[Job]: ...
    def requeue_running(self) -> int: ...                                              # кількість повернутих у queued
```

- Таблиці `configs(id, version, json, created_at)` і `jobs(id, config_id, config_version, status, attempts,
  created_at, finished_at, error)`; `config_version` фіксує версію, яку будує задача. Міграції списком
  `MIGRATIONS` і `PRAGMA user_version`.
- `mark_failed` при `retry=True` і `attempts < MAX_ATTEMPTS` (3) повертає задачу в `queued` із записаним
  `error`, інакше `failed` з `finished_at`. `retry=False` для постійних помилок (m7-l03).
- `requeue_running` повертає `running` у `queued`, а `running` з `attempts >= MAX_ATTEMPTS` переводить у
  `failed` з `"worker crashed on attempt N"` (правило t2 m7-l03). Викликається на старті й після зупинки воркерів.
- `connect(path)` створює батьківську директорію, вмикає WAL, `check_same_thread=False`, застосовує міграції.
- `SqliteJobStore(conn, clock)` і `MemoryJobStore(clock)` живуть у `store.py` і проходять ті самі контрактні тести.
- `Settings.db_path` за замовчуванням `data/formbuilder.db`, `data/` у `.gitignore`.

## Воркер, події, застосунок

- `Worker(store, queue, events, renderer, publisher, *, sleep=asyncio.sleep, base_delay=0.5)`: `run_once()` чекає
  сигнал з `asyncio.Queue[int]` і обробляє задачі, поки `next_pending()` їх віддає; `run()` викликає `run_once()`
  у циклі. Черга лише будить воркера, порядок і стан тримає сховище. Пауза ретраю `base_delay * 2 ** (attempts - 1)`.
- `JobEvents.watch(job_id, first=None)` звичайний метод: реєструє чергу в момент виклику й повертає асинхронний
  генератор (m7-l04). `publish(event)` синхронний. Події `Queued`, `Running(page, total)`, `Done(url, finished_at)`,
  `Failed(error)` з `v: Literal[1]` і `job_id: str`.
- `create_app(settings: Settings | None = None)` в `api/app.py`; lifespan: `connect(settings.db_path)`,
  `requeue_running()`, `app.state.store`, `app.state.queue`, `app.state.events`, `app.state.worker`,
  `settings.workers` задач `worker.run()`; на виході скасування, `requeue_running()`, закриття з'єднання.
  У тестах `workers=0`, крок воркера викликає сам тест.
- Запуск: `uvicorn formbuilder.api.app:app` або `formbuilder serve`; один процес uvicorn (`uvicorn_workers: Literal[1]`).

## HTTP-контракт

- Шляхи без префікса версії: `POST /forms`, `GET /forms/{form_id}`, `POST /forms/{form_id}/build`,
  `GET /jobs/{job_id}`, `WS /ws/jobs/{job_id}`, `GET /health` (m7-l07), статика `/sites/<config_id>/<version>/`
  (m7-l02, публікує `StaticPublisher` з m6-l01). `/api/v1` розібрано в теорії m7-l02, у капстоуні не вмикається.
- JSON у camelCase (`CamelModel` з `config.py`). `JobOut`: `id` (int), `configId`, `configVersion`, `status`,
  `attempts`, `createdAt`, `finishedAt`, `error`, `url` (для `done`, з m7-l03).
- Формат помилок (m7-l02): `{"error": {"code", "message", "fields": [{"path", "code", "message"}]}}`.
  Коди: `validation_error` (422, `message` = `"<N> invalid field(s)"`), `invalid_config` (422), `job_not_found`
  (404), `http_<status>` для `HTTPException` (наприклад `http_404` для невідомої форми), `internal_error` (500).
  `path` будується `loc_to_path`: перший елемент зрізається, якщо це джерело (`body`, `query`, `path`, `header`,
  `cookie`), решта через крапку, для дискримінованого union з тегом варіанта (`elements.0.input.label`).

## Налаштування

`Settings(BaseSettings)`, `env_prefix="FORMBUILDER_"`, `.env`, `extra="ignore"`:
`out_dir` (`dist`), `log_level`, `renderer` (`html`), `workers` (2, `ge=0`, воркери генерації) з m6-l06;
`db_path` з m6-l08; `get_settings()` з `lru_cache` з m7-l01; `host`, `port`, `log_json`,
`uvicorn_workers: Literal[1]` з m7-l07.

## Залежності

Основні `[project] dependencies`:

| Пакет | Урок |
|---|---|
| pydantic | m2-l09 |
| fastapi, uvicorn[standard] | m3-l02 (основні, не extra: капстоун і є вебзастосунок) |
| httpx | m5-l07 |
| structlog | m5-l09 |
| tzdata | m6-l03 |
| typer, pydantic-settings | m6-l06 |
| jinja2 | m7-l06 |

Dev `[dependency-groups] dev`: pytest, ruff, mypy (m0-l06, m2-l08); pytest-mock, pytest-cov (m3-l04);
pre-commit (m3-l06); httpx2 (m7-l01, для `TestClient` Starlette 1.x без попередження); asgi-lifespan (m7-l05).
Async-тести на плагіні anyio, що приходить з FastAPI (`anyio_mode = "auto"`, m7-l05); pytest-asyncio не ставиться.
Extras у капстоуні немає, тож ні `uv sync --extra web`, ні `[web]` у командах.

## Тести

| Файл | Уроки |
|---|---|
| `tests/test_smoke.py` | m0-l06 |
| `tests/test_domain.py`, `tests/test_tree.py` | m2-l05, m4-l02 |
| `tests/test_models.py`, `tests/test_config.py`, `tests/conftest.py`, `tests/fixtures/` | m2-l09, m3-l03, m7-l05 |
| `tests/test_renderers.py`, `tests/test_registry.py`, `tests/test_layers.py` | m2-l07, m3-l01 |
| `tests/test_renderer_registry.py`, `tests/test_base_renderer.py` | m4-l04, m4-l05 |
| `tests/test_cli.py`, `tests/test_settings.py`, `tests/test_serve.py` | m3-l03, m3-l04, m6-l06, m7-l07 |
| `tests/test_generate.py`, `tests/test_pipeline.py`, `tests/fakes.py` | m3-l04, m4-l08 |
| `tests/test_jobs.py`, `tests/test_store.py` | m4-l01, m6-l08 |
| `tests/test_worker.py`, `tests/test_worker_events.py` | m5-l05, m5-l06, m7-l03, m7-l05 |
| `tests/test_publisher.py` | m5-l07, m6-l01 |
| `tests/test_api.py` | m7-l01, m7-l03, m7-l05 |
| `tests/test_api_errors.py` | m7-l02, m7-l05 |
| `tests/test_ws.py` (ендпоінт і хаб напряму) | m7-l04, m7-l05 |
| `tests/test_jinja_renderer.py` | m7-l06 |
| `tests/test_container_files.py` | m7-l07 |

## Відомі розбіжності

Що свідомо не вирівняно, див. розділ "Капстоун: лишилось" у `docs/backlog.md`.
