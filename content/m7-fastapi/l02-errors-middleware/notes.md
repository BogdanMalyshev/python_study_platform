# Нотатки до m7-l02

## Що запускалось

FastAPI немає ні в `.venv` проєкту, ні в Pyodide, тому для прикладів створено окреме оточення в scratch-підпапці `m7-l02`:
`uv venv --python 3.12` + `uv pip install fastapi httpx pytest` (пізніше `mypy` для перевірки типів еталонного рішення).
Версії, з якими зроблено всі виводи:

- Python 3.12.12
- fastapi 0.143.5, starlette 1.8.0, pydantic 2.14.1 (pydantic-core 2.50.1), httpx 0.28.1, anyio 4.15.1, pytest 9.1.1, mypy 2.4.0
- для браузерних завдань: `.venv/bin/python` проєкту (Python 3.12.12, pydantic 2.14.1)

Перевірки:

- Усі 21 python-блок теорії з парним `text`-блоком витягнуто з `lesson.md` скриптом і запущено через `TestClient`;
  вивід звірено з текстом уроку після нормалізації. 19 збігаються дослівно; у двох (500 з `log.exception`)
  traceback навмисно скорочено до `...` і кадру з кодом прикладу, решта рядків збігається.
- Фрагменти в "Типові помилки" і два фрагменти `(фрагмент)` у "Для капстоуну" окремо не запускались, але кожна поведінка
  з них перевірена окремим скриптом: `TypeError: 'NoneType' object is not callable` для middleware без `return`,
  `TrustedHostMiddleware` з чужим `Host` дає `400 Invalid host header`, security-заголовки через middleware.
- `tasks.yaml`: `yaml.safe_load`, кожне `solution + harness` виконано й звірено з `expected`; `starter + harness`
  дає інший вивід. Для t3 перевірено, що наївний перебір `HANDLERS` з `isinstance` дає неправильний `invalid_config`
  для `UnknownElementType`; для t4 наївний `lambda request: mw(request, app)` падає з `RecursionError` (це в підказці).
- Проєктне завдання p1: у scratch зібрано еталонний мініпакет (`formbuilder/config.py`, `jobs.py`, `api/errors.py`,
  `api/middleware.py`, `api/__init__.py`) і `tests/test_api_errors.py` з 9 тестами за чеклистом: `9 passed`;
  `mypy --strict src/formbuilder` без помилок. Окремо перевірено, що обробник з `exc: JobNotFound` у
  `add_exception_handler` mypy відхиляє як `arg-type` (твердження в уроці). Реальний `capstone/` не змінювався.

## Рішення

- Нові для цих версій речі, які впливають на вивід і які варто знати автору курсу:
  - Starlette 1.8 при імпорті `TestClient` пише `StarletteDeprecationWarning: Using httpx with starlette.testclient is
    deprecated; install httpx2 instead`. Пакет `httpx2` існує (2.13.1). В урок це не потрапило (stderr), але в
    `uv run pytest` капстоуну буде `1 warning`. Що ставити в капстоун, `httpx` чи `httpx2`, варто вирішити в m7-l01/m7-l05.
  - FastAPI 0.143 має вбудовану OpenTelemetry-інтеграцію: у стеку з'являється `ExceptionTelemetryMiddleware`,
    в урок це потрапило одним реченням, бо видно у виводі стеку.
  - `app.routes` після `include_router` містить `_IncludedRouter` без `.path`; шляхи в прикладі беруться з `/openapi.json`.
  - У FastAPI з'явився `app.frontend(...)` для статики з низьким пріоритетом; в урок не включено, бо питання про
    `StaticFiles`, а `mount` поводиться передбачувано.
- Формат помилки капстоуну: `{"error": {"code", "message", "fields": [{"path", "code", "message"}]}}`. camelCase у
  `path` береться з аліасів Pydantic (FastAPI пише аліас у `loc`), окремої конвертації `to_camel` не потрібно; ключі
  формату однослівні, багатослівний лише `requestId` у тілі 500 прикладу уроку.
- 500 у капстоуні збирає middleware з request id (ловить `Exception` навколо `call_next`), а `CORSMiddleware`
  додається останнім. Причина показана реальним виводом: обробник `Exception` працює в `ServerErrorMiddleware`
  над усіма middleware, і його 500 приходить без CORS і без `X-Request-ID`.
- Request id у логах зроблено через `ContextVar` + `logging.Filter` зі stdlib, бо m5-l09 ще не написаний; для варіанту
  зі structlog дано одне речення про `bind_contextvars`. Якщо m5-l09 зафіксує structlog у капстоуні, пункт 3 p1
  це вже допускає.
- `JobNotFound` розміщено в `formbuilder/jobs.py` поруч з `GenerationJob` з m4-l01; `ConfigError` з m3-l03
  (`formbuilder/config.py`) не змінюється, поля помилок беруться з `exc.__cause__`.
- Узгодження з m7-l01 (пишеться паралельно) лише через його `questions.md`: пакет `formbuilder/api/`, роутери
  `forms`/`jobs`, `GET /jobs/{id}`. Префікс `/api/v1` тут вводиться як роутер-обгортка; якщо m7-l01 уже поставить
  його інакше, p1 від цього не залежить. Тести p1 будують застосунок через фікстуру й додають службові маршрути,
  щоб не залежати від того, як m7-l01 створює `app`.
- Генератори TS-клієнтів (`openapi-typescript`, `orval`, `@hey-api/openapi-ts`) згадано одним callout-ом без запуску.
- Обсяг: 38 абзаців теорії плюс 10 callout-ів, сім теоретичних розділів, `Для капстоуну` і три обов'язкові.
  Ділити не пропоную, але урок щільний: якщо потрібно, "OpenAPI" і "URL-простір" можна винести в окремий урок.
- Завдання: 4 code (`runtime: browser`; t2 з `requires: [pydantic]`), 4 quiz, 1 project. Code-завдання лише на чисті
  функції, з яких складається шар помилок: шлях з `loc`, формат 422, пошук обробника за MRO, стек middleware.

## Незакриті питання

Усі 10 питань з `questions.md` закриті кодом і реальним виводом.

## Залежності

- Спирається на m7-l01 (застосунок, роутери, `TestClient`, моделі з camelCase), m2-l09 (`errors()`, `loc`, аліаси,
  `model_validator`), m1-l11 і m3-l03 (`ConfigError`, `raise ... from`), m4-l01 (`jobs.py`), m4-l04 (MRO), m1-l06
  (пізнє зв'язування в підказці t4), m5-l02/m5-l06 (генератори для `StreamingResponse`), m5-l09 (логування,
  contextvars), m6-l06 (налаштування для `debug`, `openapi_url`, origin-ів).
- Готує m7-l03 (помилки у фонових задачах, `JobNotFound`), m7-l04 (чому чисте ASGI-middleware для WebSocket),
  m7-l05 (тести API, `raise_server_exceptions`), m7-l07 (`--root-path`, `--proxy-headers` за проксі).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- p1 більше не вмикає `/api/v1` у капстоуні: шляхи `/forms`, `/jobs` спільні для m7-l01–m7-l05. Фікстура тестів через `create_app(settings)`.
