# Notes: m7-l07 "Пакування й запуск: uvicorn, Dockerfile з uv"

## Що запускалось

Окреме оточення в тимчасовій підпапці `m7-l07/`:

```bash
uv venv venv --python 3.12
uv pip install fastapi uvicorn httpx
```

Версії: uv 0.9.28, CPython 3.12.12, fastapi 0.146.0, uvicorn 0.54.0, httpx 0.28.1, starlette 1.8.0, pydantic 2.14.1.
Копія капстоуну (без `.venv` і кешів) у тимчасовій папці з доданими `uv add fastapi uvicorn pydantic-settings typer`
і `uv add --dev httpx`: pydantic-settings 2.16.0, typer 0.27.3. Справжній `capstone/` не змінювався.

Усі серверні приклади з `lesson.md` запускались реально: uvicorn у фоні на 127.0.0.1:8000 (порт перевірено `lsof` як вільний),
запити через `curl`, зупинка через `kill -TERM`, після кожного запуску `pgrep` підтверджував, що процесів не лишилось.

- `uv run uvicorn formbuilder.api:app --host 0.0.0.0 --port 8000` + `curl -i /health` і `/openapi.json`.
- `--log-level warning` (порожній лог), `--reload` зі зміною файла (StatReload, новий PID), `--reload --workers 2` (попередження uvicorn, використано в t3).
- `--workers 2` з глобальним списком: два PID, два незалежні лічильники.
- `uvicorn.run(app, workers=2)` (попередження і exit 3) і `uvicorn.run("api:app", ...)`.
- `formbuilder serve --check` з валідними налаштуваннями, `FORMBUILDER_WORKERS=4` і `FORMBUILDER_PORT=70000` (exit 2).
- `FORMBUILDER_LOG_JSON=1 uv run formbuilder serve`: JSON-рядки в stdout; SIGTERM пересланий через `uv run`.
- `sh -c 'uvicorn ...; echo'` + `kill -TERM` на shell: shell помер, uvicorn осиротів і відповідав на `/health`; `sh -c 'exec uvicorn ...'`: graceful shutdown з тим самим PID.
- `uv sync --locked --no-dev --no-editable`, потім `uv run formbuilder --version`: uv run доставив 14 пакетів (dev-група + editable).
- `buf.py` з `PYTHONUNBUFFERED` і без, вивід у файл.
- Два кроки `uv sync` (з `--no-install-project`, потім `--no-editable`) у чистій папці, що імітує шари Dockerfile; `formbuilder serve --check` після видалення `src/` (пакет у site-packages).
- Розміри: `du -sh .venv` з dev (111M), `--no-dev` (19M), `--no-dev` з `UV_COMPILE_BYTECODE=1` (32M), бінарник uv 42M. Виміряно на macOS arm64, у лекції це сказано.
- HEALTHCHECK-команда через `python -c urllib...` при вимкненому (exit 1) і запущеному (exit 0) сервері.
- `--timeout-graceful-shutdown`: ендпоінт зі `sleep(3)`, SIGTERM через 1 с; без таймауту 200, з таймаутом 1 с 500 і `CancelledError`, shutdown lifespan в обох випадках.
- `docker compose config` (працює без демона): нормалізований compose і підстановка `${FORMBUILDER_LOG_LEVEL:-INFO}` з env shell і з `.env`.

Перевірка уроку і завдань (скрипт у тимчасовій папці, `.venv/bin/python` кореня проєкту):

- кожне `solution` разом з `harness` дає точно `expected` (t1–t4); кожен `starter` з `harness` синтаксично коректний (t4 starter падає `TypeError`, бо повертає `None`, це очікувано);
- кожен `id` з `tasks.yaml` вставлено в `lesson.md` рівно один раз, зайвих маркерів немає;
- код Dockerfile, `.dockerignore`, `compose.yaml`, фрагменти `settings.py`, `cli.py`, `logs.py`, `api.py` у лекції побайтно збігаються з файлами перевіреної копії капстоуну;
- t4-лінтер на трьох Dockerfile з уроку (Node, одностадійний, multi-stage) повертає `[]`;
- копія капстоуну: `uv run ruff check`, `ruff format --check`, `mypy src tests` (strict), `pytest -q` (8 passed);
- verify обох проєктних завдань на копії: `uv run formbuilder serve --check && uv run pytest tests/test_serve.py -q` (2 passed), `uv run pytest tests/test_container_files.py -q` (5 passed); негативна перевірка: shell-форма `CMD` валить тест з повідомленням `CMD must be exec form`.

## Docker

`docker version`: клієнт 29.1.3 встановлений, демон не запущений (немає `/Users/mac/.docker/run/docker.sock`).
Docker Desktop не запускався. Тому `docker build`, `docker run`, `docker compose up`, `docker stop` і розміри образів
у лекції подані без виводу, і це сказано в тексті двічі (розділ про шари і розділ про compose). `docker build --check` теж
потребує демона. Єдина docker-команда з реальним виводом `docker compose config`. У p2 збірка образу і `curl /health`
у контейнері винесені в необов'язкову частину чекліста "якщо Docker є", а `verify` робить статичні перевірки файлів.

## Рішення

- `formbuilder serve` фіксує `workers: Literal[1]` у `Settings`: висновок про in-memory чергу (m7-l03) і WebSocket (m7-l04) записаний у типи, `WEB_CONCURRENCY` і `FORMBUILDER_WORKERS=4` ловляться на старті.
- `--check` у `serve` як verify-команда: проходить валідацію env та імпорт застосунку без відкриття порту, не потребує фонового процесу.
- Multi-stage з `--no-editable` і копіюванням лише `.venv`; `--locked` замість `--frozen` (m0-l02 каже, що `--frozen` годиться для Docker; тут свідомо обрано `--locked`, обґрунтування в callout "Під капотом").
- У `CMD` скрипт з venv, а не `uv run`: показано реальним запуском, що `uv run` синхронізує dev-групу.
- HEALTHCHECK через `python -c urllib`, бо в slim-образі немає curl.
- JSON-логи через `log_config` uvicorn з мінімальним `JsonFormatter`, без structlog; якщо m5-l09 у капстоуні вже дає форматер, `log_config` має посилатися на нього.
- Розбіжність сусідніх уроків: m3-l02 описує FastAPI/uvicorn в extra `web` і пише про `uv sync --locked --no-dev --extra web`, а чернетки m7-l01 тримають їх в основних `dependencies`. Урок і p2 кажуть додати `--extra web`, якщо залежності в extra; Dockerfile у лекції без extra. Автору курсу варто вирівняти це в m3-l02 або m7-l01.
- Капстоун у копії має модуль `api.py`, а m7-l01 робить пакет `formbuilder/api/`; рядок імпорту `formbuilder.api:app` однаковий в обох випадках.
- gunicorn і `fastapi run` одним реченням кожен, як вимагає questions.md; оркестрація, CI/CD і reverse proxy не згадуються.

## Обсяг

35 абзаців прози (без callout-ів і списків), 8 callout-ів, 6 розділів теорії плюс "Для капстоуну" і три обов'язкові.
Максимум 3 абзаци поспіль без коду або завдання. Завдання: 3 quiz, 4 code (browser), 2 project.

## Питання з questions.md

Усі 9 закриті. Частково: "розмір образу до і після" для multi-stage. Розміри образів не виміряні, бо Docker-демон не
працював; замість них наведено реально виміряні розміри venv (з dev, без dev, з bytecode) і бінарника uv, а команда
`docker images formbuilder` для порівняння винесена в лекцію і в p2.

## Залежності

Спирається на: m0-l02 (venv, `uv sync --locked`/`--frozen`, venv не переноситься), m0-l06 (src-layout, entry point),
m3-l02 (wheel, extras), m5-l05 (скасування), m5-l08 (GIL), m5-l09 (логування), m6-l05 (subprocess), m6-l06
(pydantic-settings, Typer CLI з `serve`-заглушкою), m6-l07 (SIGTERM, PID 1), m6-l08 (SQLite), m7-l03 (in-memory черга і
lifespan), m7-l04 (WebSocket), m7-l05 (ASGITransport). Готує m7-l08 (модель "застосунок окремо, сервер окремо").

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- Прибрано `--extra web` (FastAPI в основних залежностях). Поле `workers: Literal[1]` перейменовано на `uvicorn_workers` (env `FORMBUILDER_UVICORN_WORKERS`), бо `workers` з m6-l06 означає воркерів генерації; вивід помилки pydantic перезапущено. Запуск `formbuilder.api.app:app`. Пункт вище про розбіжність m3-l02/m7-l01 закрито.
