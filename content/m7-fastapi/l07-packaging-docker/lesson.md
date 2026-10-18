---
id: m7-l07
module: m7-fastapi
title: "Пакування й запуск: uvicorn, Dockerfile з uv"
summary: "Учень запускає FastAPI через uvicorn і власну команду `formbuilder serve`, розуміє, що означають `--workers` і `--reload` для стану процесу, і пише multi-stage Dockerfile з `uv sync --locked`, non-root користувачем, exec-формою CMD, HEALTHCHECK і compose з томом та graceful stop."
duration_min: 75
prerequisites: [m7-l06]
---

## uvicorn: хто насправді слухає порт

Об'єкт `FastAPI()` не є сервером. Це ASGI-застосунок (ASGI, Asynchronous Server Gateway Interface, офіційна назва специфікації з asgi.readthedocs.io, асинхронного наступника WSGI з PEP 3333): асинхронний callable, яка приймає опис запиту й канали для читання та запису. TCP-сокет, розбір HTTP, keep-alive і сигнали робить окремий процес-сервер, і в світі FastAPI це uvicorn. У Node ви звикли, що застосунок сам себе запускає через `listen`; у Python сервер запускається першим і імпортує застосунок за рядком `модуль:атрибут`.

```ts
// server.ts: застосунок сам відкриває порт
import express from "express";

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.listen(8000, "0.0.0.0");
```

```python
# src/formbuilder/api/app.py: жодного listen, порт вирішує сервер
from fastapi import FastAPI

app = FastAPI(title="FormBuilder API")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

Розходження в тому, хто володіє процесом. Застосунок не знає ні порту, ні хоста, ні кількості процесів, тому той самий `app` без змін запускається uvicorn, gunicorn, тестовим `httpx.ASGITransport` з m7-l05 або іншим ASGI-сервером. А рядок `formbuilder.api.app:app` означає буквально `from formbuilder.api.app import app` у процесі сервера, тож пакет має бути встановлений у venv, з якого запущено uvicorn (src-layout і editable-установка з m0-l06).

```bash
uv run uvicorn formbuilder.api.app:app --host 0.0.0.0 --port 8000
# в іншому терміналі
curl -i http://127.0.0.1:8000/health
```

```text
INFO:     Started server process [81337]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     127.0.0.1:49558 - "GET /health HTTP/1.1" 200 OK
INFO:     Shutting down
INFO:     Waiting for application shutdown.
INFO:     Application shutdown complete.
INFO:     Finished server process [81337]
```

```text
HTTP/1.1 200 OK
date: Sun, 18 Oct 2026 15:47:06 GMT
server: uvicorn
content-length: 15
content-type: application/json

{"status":"ok"}
```

Останні чотири рядки логу з'явились після `kill -TERM` на процес: uvicorn перехоплює SIGTERM, перестає приймати з'єднання, дочікується відкритих запитів і запускає shutdown-частину lifespan, де в капстоуні зупиняється воркер черги (m7-l03). Startup і shutdown у логах це і є lifespan. `--host 0.0.0.0` означає "слухати на всіх інтерфейсах"; значення за замовчуванням `127.0.0.1` приймає лише з'єднання з тієї самої машини.

> **Пастка.** У контейнері `127.0.0.1` це loopback самого контейнера. Docker пробрасує порт з хоста на мережевий інтерфейс контейнера, а не на його loopback, тому сервер на `127.0.0.1` у контейнері запущений, `docker ps` показує його живим, а `curl` з хоста отримує скинуте з'єднання. У контейнері хост завжди `0.0.0.0`.

`--log-level` приймає `critical`, `error`, `warning`, `info`, `debug`, `trace` і керує логерами самого uvicorn. На `warning` зникають і стартові рядки, і access-лог: сервер нижче відповів на запит, а лог лишився порожнім. Окремо access-лог вимикає `--no-access-log`.

```bash
uvicorn api:app --port 8000 --log-level warning > u4.log 2>&1 &
curl -s http://127.0.0.1:8000/health; echo
kill -TERM $!; cat u4.log; echo "[end of log]"
```

```text
{"status":"ok"}
[end of log]
```

`--reload` запускає не сервер, а процес-спостерігач (reloader), який стежить за файлами й перезапускає дочірній серверний процес на кожну зміну. Без пакета `watchfiles` (він приходить з `uvicorn[standard]`) спостерігач опитує файли за таймером, це `StatReload` у логу нижче. Зверніть увагу на новий PID після зміни `api.py`: перезапуск це новий процес, тобто весь in-memory стан, черга й підключені WebSocket зникають.

```text
INFO:     Will watch for changes in these directories: ['…/demo']
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [75749] using StatReload
INFO:     Started server process [75756]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
WARNING:  StatReload detected changes in 'app.py'. Reloading...
INFO:     Shutting down
INFO:     Waiting for application shutdown.
INFO:     Application shutdown complete.
INFO:     Finished server process [75756]
INFO:     Started server process [75784]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

> **JS-аналог.** `--reload` це `nodemon` або `tsx watch`, вбудований у сервер. Як і nodemon, у продакшні він не потрібен: код в образі не змінюється, опитування файлів витрачає CPU, а перезапуск посеред роботи губить стан процесу. `--reload` лише для dev.

## `--workers`: процеси, а не потоки, і in-memory стан

`--workers N` запускає батьківський процес і N дочірніх, кожен з яких окремо імпортує застосунок і має власну пам'ять. Це процеси, а не потоки: через GIL потоки не дали б паралельного виконання Python-коду (m5-l08). Найближчий аналог у Node це `cluster` або `pm2 -i N`: спільний сокет, ядро ОС роздає з'єднання процесам. Демонстрація: ендпоінт додає задачу в глобальний список і повертає PID процесу й довжину списку.

```python
jobs: list[str] = []  # живе всередині одного процесу


@app.post("/jobs/{name}")
async def add_job(name: str) -> dict[str, object]:
    jobs.append(name)
    return {"pid": os.getpid(), "jobs": len(jobs)}
```

```bash
uvicorn api:app --host 127.0.0.1 --port 8000 --workers 2
for n in a b c d e f; do curl -s -X POST http://127.0.0.1:8000/jobs/$n; echo; done
```

```text
{"pid":75636,"jobs":1}
{"pid":75636,"jobs":2}
{"pid":75636,"jobs":3}
{"pid":75636,"jobs":4}
{"pid":75638,"jobs":1}
{"pid":75638,"jobs":2}
```

```text
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started parent process [75631]
INFO:     Started server process [75638]
INFO:     Started server process [75636]
... (лог скорочено)
INFO:     Received SIGTERM, exiting.
INFO:     Terminated child process [75636]
INFO:     Terminated child process [75638]
...
INFO:     Stopping parent process [75631]
```

Шість задач, два списки, і жоден процес не бачить усіх шести. Для капстоуну це вирок багатьом воркерам: `asyncio.Queue` і споживач з m7-l03 живуть у процесі, тому при `--workers 4` буде чотири незалежні черги, а клієнт WebSocket з m7-l04, підключений до процесу A, ніколи не побачить статус задачі, яку прийняв процес B. Масштабування такого стану потребує зовнішнього сховища або брокера, і це тема окремого курсу. Капстоун свідомо працює з одним процесом uvicorn, а asyncio всередині нього дає конкурентність для I/O.

> **Пастка.** Якщо `--workers` не передано, uvicorn бере значення зі змінної оточення `WEB_CONCURRENCY`, а за її відсутності 1. Деякі хостинги виставляють `WEB_CONCURRENCY` самі, і застосунок з in-memory чергою раптом стає чотирма застосунками. Капстоун нижче фіксує один процес у налаштуваннях, щоб це ловилось на старті.

<!-- task: q1 -->

Той самий сервер запускається з коду через `uvicorn.run`. Це зручно, коли вам потрібна власна точка входу, наприклад CLI-команда. Обмеження одне, і воно випливає з моделі процесів: для `reload` і `workers` треба передати рядок імпорту, а не сам об'єкт, бо дочірній процес мусить імпортувати застосунок заново, а Python-об'єкт між процесами не передається.

```python
import uvicorn

from api import app

if __name__ == "__main__":
    uvicorn.run(app, port=8000, workers=2)
```

```text
WARNING:  You must pass the application as an import string to enable 'reload' or 'workers'.
exit 3
```

```python
import uvicorn

if __name__ == "__main__":
    uvicorn.run("api:app", host="127.0.0.1", port=8000, log_level="info")
```

```text
INFO:     Started server process [76170]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     127.0.0.1:64518 - "GET /health HTTP/1.1" 200 OK
```

Дві альтернативи, про які спитають на співбесіді. gunicorn це зрілий менеджер процесів для Python, якого запускають з uvicorn-воркерами (клас воркера тепер живе в окремому пакеті `uvicorn-worker`, модуль `uvicorn.workers` позначено deprecated), коли потрібні його налаштування перезапуску воркерів. `fastapi run` з пакета `fastapi[standard]` це тонка обгортка над тим самим uvicorn з продакшн-умовчаннями, а `fastapi dev` вмикає reload.

## `formbuilder serve`: локальний запуск як еталон

Перш ніж писати Dockerfile, має існувати еталонний локальний запуск: те, що працює в `uv run formbuilder serve`, повинно працювати в контейнері, бо контейнер змінює лише файлову систему, користувача і змінні оточення. Тому в CMD образу піде не сирий `uvicorn ...` з десятком прапорців, а та сама CLI-команда, що й локально. Заглушка `serve` з m6-l06 стає обгорткою над `uvicorn.run`, а налаштування сервера додаються в `Settings` з тим самим префіксом `FORMBUILDER_` (pydantic-settings детально в m6-l06).

```python
# src/formbuilder/settings.py, нові поля
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FORMBUILDER_", env_file=".env")

    out_dir: Path = Path("dist")
    db_path: Path = Path("data/formbuilder.db")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = False
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    workers: int = Field(default=2, ge=0)  # generation workers inside the process (m7-l03)
    uvicorn_workers: Literal[1] = 1
```

```python
# src/formbuilder/cli.py
@app.command()
def serve(
    host: Annotated[
        str | None, typer.Option(help="Bind address (env FORMBUILDER_HOST).")
    ] = None,
    port: Annotated[
        int | None, typer.Option(help="Port (env FORMBUILDER_PORT).")
    ] = None,
    reload: Annotated[bool, typer.Option(help="Dev only: restart on edit.")] = False,
    check: Annotated[
        bool, typer.Option(help="Load settings and import the app, then exit.")
    ] = False,
) -> None:
    """Run the HTTP API with uvicorn."""
    overrides: dict[str, Any] = {"host": host, "port": port}
    try:
        settings = Settings(**{k: v for k, v in overrides.items() if v is not None})
    except ValidationError as exc:
        print(f"formbuilder: invalid settings\n{exc}", file=sys.stderr)
        raise typer.Exit(2) from None

    import uvicorn

    from formbuilder.logs import log_config

    if check:
        from formbuilder.api.app import app as api

        print(f"ok: {api.title} -> http://{settings.host}:{settings.port}")
        return
    uvicorn.run(
        "formbuilder.api.app:app",
        host=settings.host,
        port=settings.port,
        reload=reload,
        log_config=log_config(settings.log_level, settings.log_json),
    )
```

Три рішення тут не косметичні. `uvicorn_workers: Literal[1]` переносить висновок попереднього розділу в типи: `FORMBUILDER_UVICORN_WORKERS=4` падає на старті з кодом 2, а не тихо множить черги. Ім'я з префіксом, бо `workers` у `Settings` уже означає воркерів генерації всередині процесу (m6-l06, m7-l03): їх може бути кілька, а процес uvicorn лише один. Імпорт `uvicorn` усередині функції означає, що `formbuilder build` з m6-l06 не платить за імпорт сервера. А `--check` проходить увесь шлях запуску, крім відкриття порту: валідує env, імпортує застосунок і його залежності. Це команда для `verify`, CI і першої перевірки нового образу.

```bash
uv run formbuilder serve --check; echo "exit $?"
FORMBUILDER_UVICORN_WORKERS=4 uv run formbuilder serve --check; echo "exit $?"
FORMBUILDER_PORT=70000 uv run formbuilder serve --check; echo "exit $?"
```

```text
ok: FormBuilder API -> http://127.0.0.1:8000
exit 0
formbuilder: invalid settings
1 validation error for Settings
uvicorn_workers
  Input should be 1 [type=literal_error, input_value='4', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/literal_error
exit 2
formbuilder: invalid settings
1 validation error for Settings
port
  Input should be less than or equal to 65535 [type=less_than_equal, input_value='70000', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/less_than_equal
exit 2
```

<!-- task: t1 -->

У контейнері логи це stdout і stderr процесу, їх збирає `docker logs` або будь-який колектор рядок за рядком. Тому формат один JSON-об'єкт на рядок (m5-l09), а не кольоровий текст для людини. uvicorn приймає `log_config` у форматі `logging.config.dictConfig`, і цього достатньо, щоб його власні логери писали через ваш форматер.

```python
# src/formbuilder/logs.py
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
            }
        )


def log_config(level: str, json_logs: bool) -> dict[str, Any]:
    fmt: dict[str, Any] = (
        {"()": "formbuilder.logs.JsonFormatter"}
        if json_logs
        else {"format": "%(levelname)s %(name)s: %(message)s"}
    )
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"default": fmt},
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            }
        },
        "loggers": {
            name: {"handlers": ["stdout"], "level": level, "propagate": False}
            for name in ("uvicorn", "uvicorn.access", "formbuilder")
        },
    }
```

```bash
FORMBUILDER_LOG_JSON=1 uv run formbuilder serve
```

```text
{"ts": "2026-10-18T15:42:56.073824+00:00", "level": "INFO", "logger": "uvicorn.error", "msg": "Started server process [77219]"}
{"ts": "2026-10-18T15:42:56.075979+00:00", "level": "INFO", "logger": "uvicorn.error", "msg": "Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)"}
{"ts": "2026-10-18T15:42:58.367929+00:00", "level": "INFO", "logger": "uvicorn.access", "msg": "127.0.0.1:64904 - \"GET /health HTTP/1.1\" 200"}
{"ts": "2026-10-18T15:42:58.397587+00:00", "level": "INFO", "logger": "uvicorn.error", "msg": "Shutting down"}
{"ts": "2026-10-18T15:42:58.498996+00:00", "level": "INFO", "logger": "uvicorn.error", "msg": "Finished server process [77219]"}
```

Вивід скорочено до п'яти рядків з дев'яти. Логер `uvicorn.error` пише всі службові повідомлення сервера, а не лише помилки: назва історична, фільтрувати за нею помилки не можна, для цього є поле `level`. SIGTERM тут отримав процес `uv run`, і uv переслав його дочірньому Python; чому в образі все одно не варто запускати через `uv run`, нижче.

<!-- task: t2 -->

## Dockerfile з uv: шари, lock і кеш

Каркас знайомий з Node: базовий образ, маніфести залежностей, встановлення за lock-файлом, код, команда запуску. Різниця в трьох місцях: uv не входить в образ Python і копіюється окремо, проєкт сам є пакетом, який треба встановити у venv, і встановлень два.

```dockerfile
# Node: як ви писали
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node", "dist/server.js"]
```

```dockerfile
# Python з uv: одностадійна версія
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.28 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY README.md ./
COPY src ./src
RUN uv sync --locked --no-dev
RUN useradd --system --uid 10001 app
USER app
ENV PATH="/app/.venv/bin:$PATH"
CMD ["formbuilder", "serve", "--host", "0.0.0.0"]
```

Відповідність пряма: `package-lock.json` це `uv.lock`, `npm ci --omit=dev` це `uv sync --locked --no-dev`, `node_modules` це `.venv` (m0-l02). Розходиться друге встановлення. У Node `COPY . .` і є "встановлення" вашого коду, бо `node` читає файли з диска. У Python `formbuilder` це пакет з entry point `formbuilder` у `[project.scripts]` (m0-l06, m3-l02), і скрипт `.venv/bin/formbuilder` з'являється лише після того, як uv встановить сам проєкт. `--no-install-project` у першому `RUN` каже: залежності так, проєкт поки ні. `COPY --from=ghcr.io/astral-sh/uv:0.9.28` бере статичний бінарник uv з офіційного образу Astral з точною версією, без `pip install uv` і без curl-скриптів.

Навіщо дробити на два `uv sync`: кеш шарів (layer cache, офіційний термін Docker). Кожна інструкція дає шар, і Docker перевикористовує шар, якщо інструкція та всі файли, що в неї увійшли, не змінились. Перший `RUN` залежить лише від `pyproject.toml` і `uv.lock`, тому правка в `src/` інвалідує тільки шари від `COPY src` і нижче, а 22 пакети не перевстановлюються. Нижче ті самі дві команди, виконані локально в чистій папці, щоб показати, що робить кожен шар (Docker на момент написання не був запущений, тож це не вивід `docker build`).

```bash
# шар 1: у папці лише pyproject.toml і uv.lock
UV_COMPILE_BYTECODE=1 uv sync --locked --no-dev --no-install-project
# шар 2: додано README.md і src/
UV_COMPILE_BYTECODE=1 uv sync --locked --no-dev --no-editable
```

```text
Using CPython 3.12.12
Creating virtual environment at: .venv
Resolved 37 packages in 8ms
Installed 22 packages in 28ms
Bytecode compiled 947 files in 335ms
 + annotated-doc==0.0.5
 + fastapi==0.146.0
 + pydantic==2.14.1
 + pydantic-settings==2.16.0
 + typer==0.27.3
 + uvicorn==0.54.0
 ...
Resolved 37 packages in 4ms
   Building formbuilder @ file:///…/app
      Built formbuilder @ file:///…/app
Prepared 1 package in 10ms
Installed 1 package in 2ms
Bytecode compiled 953 files in 64ms
 + formbuilder==0.1.0 (from file:///…/app)
```

Список пакетів скорочено. Другий шар встановив рівно один пакет, і саме цей шар перебудовується на кожну зміну коду. Змінні оточення в Dockerfile мають конкретні причини. `UV_COMPILE_BYTECODE=1` компілює `.py` у `.pyc` (bytecode, офіційна назва) під час збірки: у фінальному образі `/app` належить root, процес працює не від root і не може записати `__pycache__`, тож без цього Python компілював би модулі заново при кожному старті контейнера. `UV_LINK_MODE=copy` потрібен разом з cache mount нижче: кеш і `.venv` на різних файлових системах, жорсткі посилання між ними неможливі, і uv інакше друкує попередження. `UV_PYTHON_DOWNLOADS=0` забороняє uv завантажувати власний Python: використовується `/usr/local/bin/python3.12` з базового образу.

> **Під капотом.** `--locked` проти `--frozen` розібрано в m0-l02: `--frozen` ставить lock як є, `--locked` спершу перевіряє, що lock відповідає `pyproject.toml`, і падає, якщо ні. У Dockerfile капстоуну стоїть `--locked`: забутий `uv lock` ламає збірку образу, а не дає образ з іншими версіями, ніж у тестах. FastAPI і uvicorn у капстоуні в основних `dependencies` (m3-l02), тож жодних `--extra` у `uv sync` не потрібно.

<!-- task: q3 -->

## PID 1, exec-форма CMD і SIGTERM

`docker stop` надсилає SIGTERM процесу з PID 1 у контейнері, чекає stop timeout (10 секунд за замовчуванням) і надсилає SIGKILL, який не перехоплюється (сигнали детально в m6-l07). Хто стане PID 1, вирішує форма `CMD`. Exec-форма (exec form, офіційна назва в документації Docker) це JSON-масив `CMD ["formbuilder", "serve"]`: Docker запускає `formbuilder` напряму, і він PID 1. Shell-форма `CMD formbuilder serve` перетворюється на `/bin/sh -c "formbuilder serve"`, і PID 1 стає shell. Локально це відтворюється без Docker: обгортаємо uvicorn у `sh -c` з другою командою, щоб shell не міг замінити себе процесом.

```bash
sh -c 'uvicorn api:app --port 8000 --log-level warning; echo "uvicorn exited"' &
SHPID=$!
pgrep -P $SHPID -l
kill -TERM $SHPID
ps -p $SHPID > /dev/null && echo "sh alive" || echo "sh gone"
curl -s http://127.0.0.1:8000/health
```

```text
76348 python3.12
sh gone
{"status":"ok"}
```

SIGTERM отримав shell, shell завершився, а Python його так і не побачив: сервер осиротів і далі відповідає на `/health`. У контейнері ще гірше. Ядро не застосовує дії за замовчуванням до сигналів для PID 1 у його namespace, тому `sh` як PID 1 просто ігнорує SIGTERM, Docker чекає 10 секунд і вбиває все через SIGKILL. Shutdown-частина lifespan не виконується, воркер не повертає незавершені задачі в чергу (m6-l07), запит, що обробляється, обривається. З `exec` shell замінює себе процесом Python з тим самим PID, і сигнал доходить:

```bash
sh -c 'exec uvicorn api:app --port 8000' &
kill -TERM $!
```

```text
INFO:     Started server process [76430]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Shutting down
INFO:     Waiting for application shutdown.
INFO:     Application shutdown complete.
INFO:     Finished server process [76430]
```

> **Пастка.** Exec-форма це саме JSON: подвійні лапки, коми, квадратні дужки. `CMD ['formbuilder', 'serve']` з одинарними лапками не парситься як JSON, і Docker мовчки трактує рядок як shell-форму, з `sh` у ролі PID 1. Якщо потрібен shell-скрипт як entrypoint, його останній рядок `exec formbuilder serve "$@"`. Коли застосунок сам породжує дочірні процеси (зовнішній рендерер через subprocess з m6-l05), додають `docker run --init` або `tini`: крихітний init, який пересилає сигнали і прибирає zombie-процеси.

Чому в `CMD` не `uv run formbuilder serve`, хоча локально команда саме така. `uv run` це додатковий процес-обгортка, і, що важливіше, перед запуском він синхронізує оточення з `pyproject.toml` за замовчуванням, тобто разом з групою `dev`. Нижче venv зібраний як у Dockerfile, а потім `uv run` викликано так, як його пишуть у `CMD` за звичкою з `npm start`:

```bash
uv sync -q --locked --no-dev --no-editable
uv run formbuilder --version
```

```text
Uninstalled 1 package in 1ms
Installed 14 packages in 27ms
formbuilder 0.1.0
```

Старт контейнера встановив 13 dev-пакетів і перевстановив проєкт як editable. В образі без мережі це падіння, з мережею це повільний старт і dev-інструменти в проді. Тому в образі `PATH` починається з `/app/.venv/bin`, а `CMD` викликає скрипт напряму. Активація venv це лише `PATH` (m0-l02), і `ENV PATH=...` у Dockerfile робить рівно її.

Остання деталь запуску: буферизація stdout. Коли stdout не термінал, а pipe (саме так Docker збирає логи), Python буферизує його блоками, і `print` з'являється в `docker logs` із запізненням або лише при виході. `logging.StreamHandler` робить `flush` після кожного запису, тому JSON-логи вище не страждають, а голий `print` страждає. `PYTHONUNBUFFERED=1` вимикає буфер для всього процесу.

```python
# buf.py
import time
print("started")
time.sleep(3)
```

```bash
python buf.py > buf.out &
sleep 1; echo "after 1s: [$(cat buf.out)]"
sleep 3; echo "after exit: [$(cat buf.out)]"
PYTHONUNBUFFERED=1 python buf.py > buf2.out &
sleep 1; echo "unbuffered after 1s: [$(cat buf2.out)]"
```

```text
after 1s: []
after exit: [started]
unbuffered after 1s: [started]
```

<!-- task: q2 -->

<!-- task: t3 -->

## Multi-stage, non-root і що потрапляє в образ

Одностадійний образ несе все, що знадобилось для збірки: бінарник uv, кеш, `src/` поруч з уже встановленим пакетом. Multi-stage розділяє збірку і запуск: стадія `builder` готує `.venv`, а фінальна стадія з того самого базового образу копіює лише його. Це повний Dockerfile капстоуну.

```dockerfile
# syntax=docker/dockerfile:1

# --- builder: uv and its cache live only here ---
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.9.28 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0
WORKDIR /app

# layer 1: dependencies only, rebuilt when pyproject.toml or uv.lock change
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# layer 2: the project itself, rebuilt on every code change
COPY README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

# --- runtime: python + .venv, no uv, no sources, no dev tools ---
FROM python:3.12-slim
RUN useradd --system --uid 10001 --home-dir /app app \
    && mkdir -p /data \
    && chown app /data
COPY --from=builder --chown=app /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    FORMBUILDER_HOST=0.0.0.0 \
    FORMBUILDER_PORT=8000 \
    FORMBUILDER_OUT_DIR=/data/out \
    FORMBUILDER_DB_PATH=/data/formbuilder.db \
    FORMBUILDER_LOG_JSON=true
USER app
WORKDIR /app
EXPOSE 8000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
CMD ["formbuilder", "serve"]
```

`--no-editable` у другому `sync` встановлює `formbuilder` у `site-packages` як звичайний пакет, а не посиланням на `src/` (editable з m0-l02). Через це фінальній стадії не потрібна папка `src`, вистачає `.venv`. `--mount=type=cache` (BuildKit) тримає завантажені колеса між збірками поза шарами: кеш прискорює збірку і не потрапляє в образ. Що саме відрізаємо, видно за розмірами venv і uv, виміряними локально на macOS arm64 (колеса Linux у контейнері дадуть інші числа, але те саме співвідношення):

```bash
uv sync -q && du -sh .venv
uv sync -q --no-dev && du -sh .venv
rm -rf .venv; UV_COMPILE_BYTECODE=1 uv sync -q --no-dev && du -sh .venv
ls -lh ~/.local/bin/uv | awk '{print $5}'
```

```text
111M	.venv
 19M	.venv
 32M	.venv
42M
```

Dev-група (pytest, mypy, ruff) займає 92 МБ із 111, `.pyc` додають 13 МБ, і їх варто нести, а бінарник uv на 42 МБ у рантаймі не потрібен зовсім. Розмір самого образу показує `docker images formbuilder`; на машині автора Docker-демон під час написання уроку не був запущений, тому числа "до і після" для образу тут не наведені, порівняйте їх у себе після `docker build` одностадійної і multi-stage версій.

> **Пастка.** Venv не переноситься (m0-l02): shebang у `.venv/bin/formbuilder` містить абсолютний шлях `/app/.venv/bin/python`, а `pyvenv.cfg` вказує на `/usr/local/bin` базового образу. Multi-stage працює лише тому, що обидві стадії з одного образу `python:3.12-slim`, а `WORKDIR` той самий `/app`. Інший шлях у фінальній стадії ламає скрипти, а інший базовий образ (наприклад, alpine у фіналі) ламає ще й скомпільовані розширення на кшталт `pydantic-core`.

Non-root: офіційні образи `node` мають готового користувача `node`, а образи `python` ні, тому його створюють `useradd` з фіксованим UID. Процес від імені `app` може писати лише в `/data`, яку йому віддали `chown`, а код у `/app/.venv` для нього лише для читання. Саме тому bytecode компілюється під час збірки, а не при першому імпорті.

`.dockerignore` вирішує, що потрапить у build context. Для Python у ньому важливі не лише розмір і швидкість: локальний `.venv` з macOS містить бінарники під Darwin і абсолютні шляхи вашої машини, і будь-який `COPY . .` у майбутньому затягне його в Linux-образ. `.env` з локальними значеннями й секретами не повинен потрапляти в образ узагалі, а `tests` і `dist` там просто не потрібні.

```text
.venv
**/__pycache__
*.py[cod]
.pytest_cache
.ruff_cache
.mypy_cache
dist
tests
.env
*.db
out
.git
```

## HEALTHCHECK, порти, томи і compose

`HEALTHCHECK` це команда, яку Docker виконує всередині контейнера за розкладом: код виходу 0 означає healthy, будь-який інший unhealthy. В образі `python:3.12-slim` немає `curl`, і ставити його заради однієї перевірки не варто, бо Python уже є. `urllib.request.urlopen` кидає виняток на відмову з'єднання або HTTP-помилку, необроблений виняток дає код виходу 1. Ось та сама команда локально, коли сервер вимкнений і коли запущений:

```bash
python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2)' 2>&1 | tail -1
echo "down: exit ${pipestatus[1]}"   # zsh; у bash ${PIPESTATUS[0]}
formbuilder serve > /dev/null 2>&1 &
sleep 2
python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2)'; echo "up: exit $?"
```

```text
urllib.error.URLError: <urlopen error [Errno 61] Connection refused>
down: exit 1
up: exit 0
```

`/health` має відповідати швидко й не чіпати важкого: якщо він ходить у SQLite або чекає чергу, перевірка таймаутиться під навантаженням, і здоровий контейнер вважається хворим. `EXPOSE 8000` лише документує порт, відкриває його `-p 8000:8000` або `ports:` у compose. Файлова система контейнера тимчасова: після `docker rm` зникає все записане. Тому згенеровані сторінки (`out/`) і файл SQLite (m6-l08) живуть у томі `/data`, а `FORMBUILDER_OUT_DIR` і `FORMBUILDER_DB_PATH` у Dockerfile вказують туди.

```yaml
# compose.yaml
services:
  api:
    build: .
    image: formbuilder:dev
    ports:
      - "8000:8000"
    environment:
      FORMBUILDER_LOG_LEVEL: ${FORMBUILDER_LOG_LEVEL:-INFO}
    volumes:
      - formbuilder-data:/data
    stop_grace_period: 20s

volumes:
  formbuilder-data:
```

`docker compose config` не потребує запущеного демона: він лише читає й нормалізує файл, тож цей вивід реальний. Видно, як підставляється `${FORMBUILDER_LOG_LEVEL:-INFO}`: зі змінної оточення shell, з файлу `.env` поруч з `compose.yaml` або значення за замовчуванням.

```bash
docker compose config
FORMBUILDER_LOG_LEVEL=DEBUG docker compose config | grep LOG_LEVEL
echo "FORMBUILDER_LOG_LEVEL=WARNING" > .env && docker compose config | grep LOG_LEVEL
```

```text
name: capstone
services:
  api:
    build:
      context: …/capstone
      dockerfile: Dockerfile
    environment:
      FORMBUILDER_LOG_LEVEL: INFO
    image: formbuilder:dev
    ...
    stop_grace_period: 20s
    volumes:
      - type: volume
        source: formbuilder-data
        target: /data
        volume: {}
...
      FORMBUILDER_LOG_LEVEL: DEBUG
      FORMBUILDER_LOG_LEVEL: WARNING
```

> **Пастка.** `.env` поруч з `compose.yaml` читає compose, а не ваш застосунок: він підставляє значення в `${...}` всередині YAML. У контейнер потрапляє лише те, що явно перелічено в `environment:` або `env_file:`. Секрети в образ не кладуть ні через `COPY .env`, ні через `ENV TOKEN=...` у Dockerfile: обидва варіанти назавжди лишаються в шарах і видні в `docker history` та `docker inspect`. Їх передають під час запуску. `Settings` з m6-l06 з `env_file=".env"` у контейнері файлу не знайде і візьме змінні оточення, саме це й потрібно.

`stop_grace_period` у compose це той самий stop timeout: скільки чекати після SIGTERM до SIGKILL. Він має бути більшим за час, який uvicorn дає відкритим запитам на завершення. У uvicorn це `--timeout-graceful-shutdown` (параметр `timeout_graceful_shutdown` у `uvicorn.run`); без нього uvicorn чекає запити скільки завгодно. Демонстрація з ендпоінтом, що рендерить 3 секунди, і SIGTERM через секунду після запиту:

```bash
uvicorn slow:app --port 8000 --log-level warning
# запит POST /render, через 1 с kill -TERM
```

```text
curl: {"status":"done"} 200
lifespan: worker started
lifespan: worker stopped, queue saved
```

```bash
uvicorn slow:app --port 8000 --log-level warning --timeout-graceful-shutdown 1
```

```text
curl: Internal Server Error 500
lifespan: worker started
ERROR:    Cancel 1 running task(s), timeout graceful shutdown exceeded
ERROR:    Exception in ASGI application
Traceback (most recent call last):
  ...
asyncio.exceptions.CancelledError: Task cancelled, timeout graceful shutdown exceeded
lifespan: worker stopped, queue saved
```

Traceback скорочено. У першому запуску запит дожив до відповіді, і лише потім спрацював shutdown lifespan. У другому uvicorn скасував задачу через `CancelledError` (скасування з m5-l05), але shutdown lifespan все одно виконався, бо відбувся до SIGKILL. Звідси правило для капстоуну: таймаут дообробки в uvicorn і воркері (10 секунд з m6-l07) менший за `stop_grace_period`, інакше SIGKILL прийде раніше, ніж воркер збереже чергу.

Повний цикл з Docker виглядає так. Демон на машині автора під час написання не був запущений (`docker version` показав клієнт 29.1.3 і помилку підключення до сокета), тому ці команди подані без виводу.

```bash
docker compose up --build -d
docker compose ps                      # STATUS: Up ... (healthy) після start-period
curl -s http://127.0.0.1:8000/health
docker compose logs api                # JSON-рядки з uvicorn.error і uvicorn.access
docker compose stop                    # SIGTERM, до 20 s на shutdown
docker compose down                    # том formbuilder-data лишається; -v видаляє і його
```

<!-- task: t4 -->

## Для капстоуну

Після уроку в `capstone/` з'являються `Dockerfile`, `.dockerignore` і `compose.yaml` з цього уроку, а `formbuilder serve` перестає бути заглушкою. Поведінка, яку можна перевірити без Docker, перевіряється тестами: `serve --check` через `main([...])` і статичні перевірки файлів контейнера. Якщо Docker у вас запущений, фінальна перевірка це `docker build` і `curl /health` у контейнері.

> **Для капстоуну.** Роадмап каже "один контейнер піднімає API і воркер". З цим уроком це буквально так: воркер черги стартує в lifespan (m7-l03) того самого процесу uvicorn, тому один `CMD ["formbuilder", "serve"]` і `workers: Literal[1]` дають рівно один API і рівно один воркер, а SIGTERM від `docker stop` доходить до обох через lifespan.

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

- **`node:alpine` як перший вибір.** Звичка "alpine менший" для Python шкодить: Alpine використовує musl, а більшість колес на PyPI зібрані під glibc (тег `manylinux`, m3-l02). Пакет без `musllinux`-колеса збирається з вихідників, і в образ доводиться ставити компілятори. Беріть `python:3.12-slim`.

  ```dockerfile
  FROM python:3.12-alpine   # колеса manylinux не підходять
  FROM python:3.12-slim     # glibc, готові колеса
  ```

- **`npm start` у shell-формі.** `CMD uv run formbuilder serve` робить PID 1 shell-ом, SIGTERM до Python не доходить, а `uv run` ще й синхронізує dev-залежності на старті. Exec-форма і скрипт з venv.

  ```dockerfile
  CMD uv run formbuilder serve        # sh як PID 1, sync dev-групи при старті
  CMD ["formbuilder", "serve"]        # Python як PID 1, PATH вказує на /app/.venv/bin
  ```

- **`COPY . .` до встановлення залежностей.** Будь-яка правка коду інвалідує шар з `uv sync`, і кожна збірка перевстановлює все. Спершу `pyproject.toml` і `uv.lock`, `uv sync --no-install-project`, потім код.

  ```dockerfile
  COPY . .
  RUN uv sync --locked --no-dev       # перевстановлення на кожну зміну .py

  COPY pyproject.toml uv.lock ./
  RUN uv sync --locked --no-dev --no-install-project
  COPY src ./src
  RUN uv sync --locked --no-dev       # перебудовується лише цей шар
  ```

- **`pm2` у контейнері.** Перезапуск після падіння це `restart:` у compose, кількість процесів це `--workers`, а менеджер процесів усередині контейнера ховає справжній PID 1 і вихідний код. Для капстоуну ще й один процес свідомо.

  ```dockerfile
  CMD ["pm2-runtime", "start", "ecosystem.config.js"]   # Node-звичка
  CMD ["formbuilder", "serve"]                          # один процес, restart: on-failure у compose
  ```

- **`.env` в образі.** У Node `COPY . .` часто тягне `.env`, і dotenv читає його в рантаймі. Тут `.env` у `.dockerignore`, а значення приходять з `environment:` під час запуску.

  ```dockerfile
  COPY .env .env                    # секрети в шарі назавжди
  ENV FORMBUILDER_TOKEN=s3cr3t      # видно в docker inspect
  ```

- **`--reload` і `127.0.0.1` з локального запуску.** Dev-прапорці переїжджають в образ разом з командою з README.

  ```dockerfile
  CMD ["uvicorn", "formbuilder.api.app:app", "--reload"]                    # 127.0.0.1, reloader
  CMD ["uvicorn", "formbuilder.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
  ```

- **`--workers 4` "для продуктивності".** Кожен воркер окремий процес з власною `asyncio.Queue`, задача, прийнята одним, невидима іншим.

  ```bash
  uvicorn formbuilder.api.app:app --workers 4        # 4 черги, 4 воркери генерації
  FORMBUILDER_UVICORN_WORKERS=4 formbuilder serve --check  # капстоун: exit 2, literal_error
  ```

## Підсумок

- FastAPI-застосунок це ASGI-об'єкт без порту; uvicorn імпортує його за рядком `module:attr` і володіє процесом.
- `--host 0.0.0.0` обов'язковий у контейнері; `--reload` лише для dev; `--log-level` керує логерами uvicorn.
- `--workers N` це N процесів з окремою пам'яттю; in-memory черга й WebSocket-стан не діляться, тому капстоун працює одним процесом.
- `uvicorn.run` вимагає рядок імпорту для `reload` і `workers`; `formbuilder serve` це обгортка, однакова локально і в образі, а `--check` перевіряє запуск без порту.
- Dockerfile з uv: uv з `ghcr.io/astral-sh/uv`, `uv sync --locked --no-dev --no-install-project` до копіювання коду, другий `uv sync` для самого проєкту.
- `UV_COMPILE_BYTECODE=1`, бо non-root процес не запише `__pycache__`; `UV_PYTHON_DOWNLOADS=0`, щоб використовувати Python образу.
- `CMD` лише в exec-формі і без `uv run`; `PATH` на `/app/.venv/bin`; `PYTHONUNBUFFERED=1` для `print`.
- Multi-stage: фінальна стадія з того самого базового образу, той самий шлях `.venv`, без uv, `src` і dev-групи.
- `.dockerignore` з `.venv` і `.env`; секрети лише під час запуску; дані в томі `/data`; HEALTHCHECK через `python -c`.
- `stop_grace_period` більший за `--timeout-graceful-shutdown` і таймаут воркера, інакше SIGKILL обірве збереження черги.

## Що далі

Наступний урок m7-l08 оглядово порівнює Django, Flask і Litestar з FastAPI. Звідси там знадобиться модель "застосунок окремо, сервер окремо": Flask і класичний Django як WSGI-застосунки запускаються через gunicorn, а Litestar через той самий uvicorn, тож Dockerfile з цього уроку змінюється лише в рядку `CMD`.
