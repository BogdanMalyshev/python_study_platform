---
id: m7-l03
module: m7-fastapi
title: "Фонові задачі: BackgroundTasks і воркер на asyncio.Queue"
summary: "Учень розрізняє BackgroundTasks і власний воркер, запускає пул воркерів на asyncio.Queue у lifespan, тримає стан задач у JobStore з відновленням після рестарту, робить ретраї з backoff без реального сну в тестах, виносить CPU-рендер у потік чи процес і знає межу одного процесу."
duration_min: 90
prerequisites: [m7-l02]
---

## `BackgroundTasks`: робота після відповіді

`BackgroundTasks` це список функцій, які FastAPI виконає після того, як відправить відповідь. Обробник оголошує параметр типу `BackgroundTasks` (FastAPI підставить його сам, як `Request`), додає задачі через `add_task(fn, *args, **kwargs)` і повертає результат. Клієнт отримує свої 202 одразу, а лист чи запис в аудит відбуваються вже без нього. Найближчий аналог у вашому стеку це `after()` у Next.js 15 чи `waitUntil` у Vercel Functions: "доробити після відповіді в тому самому виклику".

```ts
// Next.js route handler
import { after } from "next/server";

export async function POST(req: Request) {
  after(() => sendEmail("owner@example.com"));
  return Response.json({ status: "accepted" }, { status: 202 });
}
```

```python
@app.post("/forms/{form_id}/submit", status_code=202)
async def submit(form_id: int, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(send_email, "owner@example.com")
    return {"status": "accepted"}
```

Розходиться дрібниця, яка стане великою пасткою: в `add_task` передають саму функцію й окремо її аргументи, а не виклик. `after(() => sendEmail(...))` у JS приймає замикання; у Python `add_task(send_email("..."))` передає результат виклику, і для `async def` це корутина, яка нічого не зробить (q1 нижче).

Повний приклад з двома задачами, синхронною й асинхронною. Запускається локально через `TestClient` (FastAPI у браузері не працює), вивід справжній:

```python
import asyncio
import threading

from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient

app = FastAPI()
log: list[str] = []
loop_thread: list[int] = []


def send_email(address: str) -> None:                  # def: піде в threadpool
    same = threading.get_ident() == loop_thread[0]
    log.append(f"email to {address}, in loop thread: {same}")


async def write_audit(form_id: int) -> None:           # async def: у циклі подій
    await asyncio.sleep(0.01)
    same = threading.get_ident() == loop_thread[0]
    log.append(f"audit form {form_id}, in loop thread: {same}")


@app.post("/forms/{form_id}/submit", status_code=202)
async def submit(form_id: int, background_tasks: BackgroundTasks) -> dict[str, str]:
    loop_thread.append(threading.get_ident())
    background_tasks.add_task(send_email, "owner@example.com")
    background_tasks.add_task(write_audit, form_id)
    log.append("handler returns")
    return {"status": "accepted"}


client = TestClient(app)
r = client.post("/forms/7/submit")
log.append(f"client got {r.status_code} {r.json()}")
print(*log, sep="\n")
```

```text
handler returns
email to owner@example.com, in loop thread: False
audit form 7, in loop thread: True
client got 202 {'status': 'accepted'}
```

Видно три речі. Задачі виконуються по черзі, у порядку `add_task`. Функція `def` іде в threadpool (як і синхронний обробник з m7-l01), `async def` виконується в циклі подій, тож блокувати його не можна так само, як в обробнику. І третє: `TestClient` повертає відповідь лише тоді, коли відпрацювали й фонові задачі, тому в тестах їхній ефект видно одразу після `client.post(...)`. Справжній клієнт за uvicorn відповідь отримує раніше.

> **Під капотом.** Відповідь Starlette це ASGI-застосунок, який робить два `await send(...)` (статус і тіло), а потім `await self.background()`. Тобто фонова задача виконується в тому самому виклику застосунку, просто після того, як байти відповіді вже віддано серверу. Це видно, якщо викликати застосунок як ASGI-функцію вручну:

```python
import asyncio
from fastapi import BackgroundTasks, FastAPI

app = FastAPI()

async def send_email(address: str) -> None:
    await asyncio.sleep(0.05)
    print(f"email sent to {address}")

@app.post("/forms/{form_id}/submit", status_code=202)
async def submit(form_id: int, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(send_email, "owner@example.com")
    print("handler returns")
    return {"status": "accepted"}

async def main() -> None:
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "path": "/forms/7/submit", "raw_path": b"/forms/7/submit",
        "root_path": "", "scheme": "http", "query_string": b"", "headers": [],
        "client": ("127.0.0.1", 5000), "server": ("127.0.0.1", 8000),
    }

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        if message["type"] == "http.response.start":
            print("server sends status", message["status"])
        elif message["type"] == "http.response.body":
            print("server sends body", message["body"])

    await app(scope, receive, send)
    print("ASGI call finished")

asyncio.run(main())
```

```text
handler returns
server sends status 202
server sends body b'{"status":"accepted"}'
email sent to owner@example.com
ASGI call finished
```

З цього механізму випливають обмеження. Задача живе в тому самому процесі, тож рестарт чи деплой посеред неї просто її втрачає: стану ніде немає, і ніхто не дізнається, що лист не пішов. Ретраїв немає. Задачі виконуються послідовно, і виняток у першій скасовує решту; клієнт при цьому вже отримав 202:

```python
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient

app = FastAPI()

def send_email(address: str) -> None:
    raise ConnectionError("SMTP is down")

def write_audit(form_id: int) -> None:
    print(f"audit form {form_id}")

@app.post("/forms/{form_id}/submit", status_code=202)
def submit(form_id: int, background_tasks: BackgroundTasks) -> dict[str, str]:
    background_tasks.add_task(send_email, "owner@example.com")
    background_tasks.add_task(write_audit, form_id)
    return {"status": "accepted"}

client = TestClient(app, raise_server_exceptions=False)
r = client.post("/forms/7/submit")
print(r.status_code, r.json())

client = TestClient(app)
try:
    client.post("/forms/7/submit")
except ConnectionError as e:
    print("test sees:", repr(e))
```

```text
202 {'status': 'accepted'}
test sees: ConnectionError('SMTP is down')
```

`audit form 7` не надруковано ні разу: друга задача не запускалась. На справжньому сервері трасування `ConnectionError` потрапить у лог uvicorn, і на цьому все. Звідси правило вибору. `BackgroundTasks` достатньо для дрібниць, втрату яких можна пережити: лист-сповіщення, запис аналітики, інвалідація кешу. Генерація сторінки FormBuilder не така: у неї є статус, який фронтенд опитує, вона може падати й потребувати повтору, вона довга й CPU-важка. Для неї потрібна черга з власними воркерами, яка переживає окремі запити й тримає стан задачі в сховищі.

<!-- task: q1 -->

## Воркер у процесі: `asyncio.Queue` у `lifespan`

Скелет воркера вже є з m5-l05 і m5-l06: `asyncio.Queue`, N довгоживучих задач з `while True`, `task_done()` у `finally`, зупинка через `cancel()`, пул як `@asynccontextmanager`. Нове тут лише одне: хто цей пул запускає. У FastAPI це `lifespan` (m7-l01): код до `yield` виконується на старті застосунку, після `yield` на зупинці. Ендпоінт `POST /forms/{id}/build` створює задачу, кладе її в чергу через `put_nowait` і відповідає 202, не чекаючи рендера; `GET /jobs/{id}` читає поточний статус.

```python
import asyncio
import itertools
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Request


@dataclass
class Job:
    id: int
    form_id: int
    status: str = "queued"
    error: str | None = None


async def render(form_id: int) -> None:
    await asyncio.sleep(0.05)               # тут буде Renderer
    if form_id == 13:
        raise ValueError("unknown element 'slider'")


async def worker(queue: asyncio.Queue[Job]) -> None:
    while True:
        job = await queue.get()
        try:
            job.status = "running"
            await render(job.form_id)
            job.status = "done"
        except Exception as e:
            job.status, job.error = "failed", str(e)
        finally:
            queue.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.queue = asyncio.Queue()
    app.state.jobs = {}
    app.state.ids = itertools.count(1)
    workers = [asyncio.create_task(worker(app.state.queue)) for _ in range(2)]
    yield
    for w in workers:
        w.cancel()
    await asyncio.gather(*workers, return_exceptions=True)


app = FastAPI(lifespan=lifespan)


@app.post("/forms/{form_id}/build", status_code=202)
async def build(form_id: int, request: Request) -> Job:
    job = Job(id=next(request.app.state.ids), form_id=form_id)
    request.app.state.jobs[job.id] = job
    request.app.state.queue.put_nowait(job)
    return job


@app.get("/jobs/{job_id}")
async def get_job(job_id: int, request: Request) -> Job:
    job = request.app.state.jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return job
```

```python
import time
from fastapi.testclient import TestClient
from app1 import app

with TestClient(app) as client:
    for form_id in (7, 13):
        print(client.post(f"/forms/{form_id}/build").json())
    time.sleep(0.2)                          # воркери працюють між запитами
    for job_id in (1, 2):
        print(client.get(f"/jobs/{job_id}").json())
    print(client.get("/jobs/99").status_code)
```

```text
{'id': 1, 'form_id': 7, 'status': 'queued', 'error': None}
{'id': 2, 'form_id': 13, 'status': 'queued', 'error': None}
{'id': 1, 'form_id': 7, 'status': 'done', 'error': None}
{'id': 2, 'form_id': 13, 'status': 'failed', 'error': "unknown element 'slider'"}
404
```

`TestClient` запускає lifespan лише як контекстний менеджер (`with TestClient(app) as client`); без `with` воркерів не буде, і задачі вічно стоятимуть у `queued`. Між запитами цикл подій `TestClient` живе у своєму потоці, тож воркери встигають обробити задачі, поки тест спить. Черга й словник лежать в `app.state`, бо це стан застосунку, а не модуля: два застосунки в одному тесті не ділять чергу. У капстоуні їх дістають через `Depends`, а не напряму з `request.app.state`, щоб тести могли підмінити.

> **JS-аналог.** Те саме у Node ви б написали як модульний масив задач і `setInterval`, що його розбирає, або підняли BullMQ з Redis. Тут проміжний варіант, якого в Node зазвичай не роблять: справжня асинхронна черга з блокуючим `await queue.get()` і пулом споживачів у тому самому процесі, без жодної інфраструктури.

Кількість воркерів і є межею паралелізму: два воркери означають не більше двох рендерів одночасно. `asyncio.Semaphore` (m5-l05) потрібен, коли межа різна для різних етапів однієї задачі. Наприклад, рендерити можна вчетверо, а CDN приймає завантаження лише по одному:

```python live
import asyncio

active = {"render": 0, "publish": 0}
peak = {"render": 0, "publish": 0}


async def stage(name: str, seconds: float) -> None:
    active[name] += 1
    peak[name] = max(peak[name], active[name])
    await asyncio.sleep(seconds)
    active[name] -= 1


async def worker(queue: asyncio.Queue[str], publish_slots: asyncio.Semaphore) -> None:
    while True:
        job = await queue.get()
        try:
            await stage("render", 0.02)
            async with publish_slots:           # CDN приймає по одному
                await stage("publish", 0.01)
        finally:
            queue.task_done()


async def main() -> None:
    queue: asyncio.Queue[str] = asyncio.Queue()
    publish_slots = asyncio.Semaphore(1)
    for i in range(8):
        queue.put_nowait(f"job{i}")
    workers = [asyncio.create_task(worker(queue, publish_slots)) for _ in range(4)]
    await queue.join()
    for w in workers:
        w.cancel()
    await asyncio.gather(*workers, return_exceptions=True)
    print("peak:", peak)

asyncio.run(main())
```

```text
peak: {'render': 4, 'publish': 1}
```

Зупинка це скасування: lifespan після `yield` робить `cancel()` на кожному воркері й чекає їх через `gather(..., return_exceptions=True)`. Воркер, що стоїть на порожній черзі, отримує `CancelledError` на `await queue.get()` і просто виходить. Воркер посеред рендера отримує його на `await render(...)`, і тут треба вирішити, що стається з задачею. Сигнал SIGTERM, таймаут на дочекання поточних задач і `loop.add_signal_handler` детально в m6-l07; тут лише те, що робить сам воркер.

<!-- task: q2 -->

`CancelledError` наслідує `BaseException`, тому `except Exception` навколо рендера його не бачить, і задача назавжди лишається `running`. Правильно ловити його окремою гілкою, повертати задачу в `queued` і кидати далі. Ковтати скасування не можна: `gather` і `TaskGroup` чекатимуть воркера, який вирішив не зупинятись.

```python live
import asyncio

jobs = {1: "queued"}


async def render() -> None:
    await asyncio.sleep(10)


async def worker(queue: asyncio.Queue[int]) -> None:
    while True:
        job_id = await queue.get()
        try:
            jobs[job_id] = "running"
            await render()
            jobs[job_id] = "done"
        except asyncio.CancelledError:
            jobs[job_id] = "queued"          # доробить наступний запуск
            raise                            # скасування не ковтаємо
        except Exception as e:
            jobs[job_id] = f"failed: {e}"
        finally:
            queue.task_done()


async def main() -> None:
    queue: asyncio.Queue[int] = asyncio.Queue()
    queue.put_nowait(1)
    task = asyncio.create_task(worker(queue))
    await asyncio.sleep(0.01)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    print(jobs, task.cancelled())

asyncio.run(main())
```

```text
{1: 'queued'} True
```

<!-- task: t1 -->

## Стан задачі: dict у пам'яті чи `JobStore` у SQLite

Словник `jobs` в `app.state` має дві вади. Він зникає разом з процесом: після рестарту `GET /jobs/1` дає 404 на задачу, яку клієнт щойно створив. І його не бачить жоден інший процес (розділ про межу процесу нижче). Тому стан задачі живе у сховищі, а черга `asyncio.Queue` носить лише `job_id`: вона потрібна, щоб розбудити воркера, а не щоб пам'ятати. Сховище це `JobStore` з m6-l08, описаний через Protocol: у продакшні SQLite, у тестах `MemoryJobStore` з тими самими методами. Нижче скорочена версія з п'ятьма методами, які потрібні воркеру; імена ті самі, що в капстоуні. Яку задачу брати, вирішує `next_pending` (найстаріша `queued`, з переходом у `running` і `attempts + 1` в одній транзакції), тож черга в пам'яті лише будить воркера, а порядок і стан тримає сховище.

```python live
import sqlite3
from dataclasses import dataclass
from typing import Protocol


@dataclass
class Job:
    id: int
    config_id: str
    config_version: int
    status: str
    attempts: int
    error: str | None


class JobStore(Protocol):  # ті методи JobStore з m6-l08, які потрібні воркеру
    def enqueue(self, config_id: str, version: int) -> int: ...
    def get_job(self, job_id: int) -> Job | None: ...
    def next_pending(self) -> Job | None: ...
    def mark_done(self, job_id: int) -> None: ...
    def requeue_running(self) -> int: ...


class SqliteJobStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        conn.row_factory = sqlite3.Row
        conn.execute(
            "CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, config_id TEXT,"
            " config_version INTEGER, status TEXT, attempts INTEGER, error TEXT)"
        )

    def enqueue(self, config_id: str, version: int) -> int:
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO jobs (config_id, config_version, status, attempts)"
                " VALUES (?, ?, 'queued', 0)",
                (config_id, version),
            )
        assert cur.lastrowid is not None
        return cur.lastrowid

    def get_job(self, job_id: int) -> Job | None:
        row = self.conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return Job(**row) if row else None

    def next_pending(self) -> Job | None:
        with self.conn:
            row = self.conn.execute(
                "SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            self.conn.execute(
                "UPDATE jobs SET status = 'running', attempts = attempts + 1 WHERE id = ?",
                (row["id"],),
            )
        return self.get_job(row["id"])

    def mark_done(self, job_id: int) -> None:
        with self.conn:
            self.conn.execute("UPDATE jobs SET status = 'done' WHERE id = ?", (job_id,))

    def requeue_running(self) -> int:
        with self.conn:
            cur = self.conn.execute("UPDATE jobs SET status = 'queued' WHERE status = 'running'")
        return cur.rowcount


conn = sqlite3.connect(":memory:")              # у капстоуні файл, напр. data/formbuilder.db
store: JobStore = SqliteJobStore(conn)
for config_id in ("contact", "signup", "survey"):
    store.enqueue(config_id, 1)

job = store.next_pending()                       # contact: running
assert job is not None
store.mark_done(job.id)
store.next_pending()                             # signup: running, і тут процес упав

store = SqliteJobStore(conn)                     # новий процес над тим самим файлом
print("requeued:", store.requeue_running())
print(store.get_job(2))
print(store.next_pending())
```

```text
requeued: 1
Job(id=2, config_id='signup', config_version=1, status='queued', attempts=1, error=None)
Job(id=2, config_id='signup', config_version=1, status='running', attempts=2, error=None)
```

`requeue_running()` це перше, що lifespan робить на старті, ще до запуску воркерів. Задача в `running` після рестарту означає одне: процес, який її виконував, помер. Ніхто інший її не доробить, і якщо залишити статус як є, фронтенд крутитиме спінер вічно, а `GET /jobs/2` чесно відповідатиме "running" через тиждень. Повернення в `queued` і повторна постановка в чергу виправляють це, але мають ціну: задача виконається ще раз з початку. Звідси вимога ідемпотентності в наступному розділі.

> **Пастка.** Задача, яка щоразу кладе процес (нескінченна рекурсія в шаблоні, OOM на величезному конфігу), після кожного рестарту знову стане `queued` і знову покладе процес. Тому лічильник `attempts` зберігається в сховищі й збільшується на початку спроби (`next_pending`), а `requeue_running()` переводить у `failed` ту `running`-задачу, яка вже вичерпала ліміт. Це t2; у капстоуні цим правилом доповнюється `requeue_running` з m6-l08.

> **Для капстоуну.** SQLite-з'єднання за замовчуванням прив'язане до потоку, в якому створене (`check_same_thread=True`). Якщо lifespan відкрив його в циклі подій, а обробник оголошено як `def`, FastAPI виконає обробник у threadpool, і перший же запит упаде з `ProgrammingError`. Або обробники й воркер `async def` і звертаються до сховища лише з циклу подій, або сховище викликається через `to_thread` з `check_same_thread=False` (детально в m6-l08).

<!-- task: t2 -->

## Ретраї, backoff і ідемпотентність

Помилки рендера бувають двох родів. Тимчасові: зовнішній рендерер не відповів, таймаут, мережа. Повтор через паузу має шанс. Постійні: у конфігу невідомий елемент `slider`. Повтор дасть ту саму помилку, тільки втричі пізніше. Тому повторюються лише явно перелічені типи винятків, пауза росте експоненційно (`base * 2 ** (attempt - 1)`), а після останньої спроби задача стає `failed` з текстом помилки, який фронтенд покаже користувачу. Функція `sleep` приходить параметром: у застосунку це `asyncio.sleep`, у тесті fake, що лише записує паузи.

```python live
import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass


@dataclass
class Job:
    id: int
    form_id: int
    status: str = "queued"
    attempts: int = 0
    error: str | None = None
    url: str | None = None


Sleep = Callable[[float], Awaitable[None]]
RETRYABLE = (ConnectionError, TimeoutError)


async def run_job(
    job: Job,
    render: Callable[[Job], Awaitable[str]],
    *,
    on_status: Callable[[Job], None] = lambda job: None,
    sleep: Sleep = asyncio.sleep,
    max_attempts: int = 3,
    base_delay: float = 0.5,
) -> None:
    while True:
        job.attempts += 1
        job.status, job.error = "running", None
        on_status(job)
        try:
            job.url = await render(job)
        except RETRYABLE as e:
            if job.attempts >= max_attempts:
                job.status, job.error = "failed", f"{type(e).__name__}: {e}"
            else:
                job.status, job.error = "retrying", str(e)
                on_status(job)
                await sleep(base_delay * 2 ** (job.attempts - 1))
                continue
        except Exception as e:
            job.status, job.error = "failed", f"{type(e).__name__}: {e}"
        else:
            job.status = "done"
        on_status(job)
        return


def renderer(*errors: Exception) -> Callable[[Job], Awaitable[str]]:
    pending = list(errors)
    async def render(job: Job) -> str:
        if pending:
            raise pending.pop(0)
        return f"/sites/form-{job.form_id}/"
    return render


async def main() -> None:
    pauses: list[float] = []
    async def fake_sleep(seconds: float) -> None:     # жодної реальної паузи
        pauses.append(seconds)

    cases = {
        7: renderer(ConnectionError("renderer down"), TimeoutError("slow")),
        8: renderer(*[ConnectionError("renderer down")] * 3),
        13: renderer(ValueError("unknown element 'slider'")),
    }
    for form_id, render in cases.items():
        trail: list[str] = []
        pauses.clear()
        job = Job(id=form_id, form_id=form_id)
        await run_job(job, render, sleep=fake_sleep,
                      on_status=lambda j: trail.append(f"{j.status}#{j.attempts}"))
        print(f"form {form_id}:", " -> ".join(trail))
        print(f"  pauses={pauses} error={job.error!r} url={job.url!r}")

asyncio.run(main())
```

```text
form 7: running#1 -> retrying#1 -> running#2 -> retrying#2 -> running#3 -> done#3
  pauses=[0.5, 1.0] error=None url='/sites/form-7/'
form 8: running#1 -> retrying#1 -> running#2 -> retrying#2 -> running#3 -> failed#3
  pauses=[0.5, 1.0] error='ConnectionError: renderer down' url=None
form 13: running#1 -> failed#1
  pauses=[] error="ValueError: unknown element 'slider'" url=None
```

Чому не `@retry` з m5-l04 над `render`? Декоратор ховає спроби всередині одного виклику: зовні видно лише фінальний результат. Тут кожна спроба має бути видимою: `attempts` і статус `retrying` пишуться в сховище, `GET /jobs/{id}` їх повертає, WebSocket їх стрімить, і лічильник має пережити рестарт. Тому цикл повторів живе на рівні задачі, а `job.attempts` береться із самої задачі, а не з локальної змінної циклу: задача, відновлена після падіння з `attempts=2`, отримає лише одну спробу. `@retry` лишається доречним на дрібному кроці всередині рендера, наприклад на одному HTTP-запиті до CDN.

`await sleep(delay)` усередині воркера тримає його слот зайнятим на весь час паузи: два воркери, дві задачі в backoff, і черга стоїть. Для пауз у секунди це прийнятно. Для довших пауз є інша схема: зробити одну спробу, а повтор запланувати через `loop.call_later(delay, queue.put_nowait, job_id)` і звільнити воркера одразу. Це t3.

<!-- task: t3 -->

Ідемпотентність (idempotency, загальноінженерний термін, не специфічний для Python) означає: повторний прогін тієї самої задачі дає той самий стан, що й один. Повтор у задачі буде обов'язково: ретрай після таймауту, `requeue_running()` після рестарту, `to_thread`, що доробив рендер у потоці, поки корутину вже скасували (розділ "Для капстоуну"). Практичне правило: результат пишеться за ключем, що залежить від входу (`slug` і версія конфігу), а не дописується в кінець.

```python live
class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[str, str] = {}
        self.feed: list[str] = []

    def publish(self, slug: str, version: int, html: str) -> str:
        self.pages[f"{slug}/v{version}/index.html"] = html   # перезапис за ключем
        return f"/sites/{slug}/v{version}/"

    def announce(self, slug: str) -> None:
        self.feed.append(f"{slug} published")                # дописування в кінець


publisher = MemoryPublisher()
for run in (1, 2):                    # перший прогін упав після publish, другий це ретрай
    url = publisher.publish("contact", 3, "<form>")
    publisher.announce("contact")
    print(f"run {run}: {url}")
print(publisher.pages)
print(publisher.feed)
```

```text
run 1: /sites/contact/v3/
run 2: /sites/contact/v3/
{'contact/v3/index.html': '<form>'}
['contact published', 'contact published']
```

Сторінка перезаписалась за тим самим ключем і URL не змінився, а оголошення пішло двічі. Неідемпотентні кроки (лист, вебхук партнеру, запис у стрічку) або роблять останніми й позначають у сховищі прапорцем "вже відправлено", або виносять в окрему задачу. На диску той самий принцип: шлях з версією, запис у тимчасовий файл і атомарна заміна, щоб падіння посеред запису не лишило пів-сторінки (pathlib у m6-l01):

```python
import tempfile
from pathlib import Path


def publish(out_dir: Path, slug: str, version: int, html: str) -> str:
    target = out_dir / slug / f"v{version}" / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    tmp.write_text(html, encoding="utf-8")
    tmp.replace(target)               # атомарна заміна в межах однієї ФС (os.replace)
    return f"/sites/{slug}/v{version}/"


out = Path(tempfile.mkdtemp())
print(publish(out, "contact", 3, "<form>"))
print(publish(out, "contact", 3, "<form>"))
print(sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file()))
```

```text
/sites/contact/v3/
/sites/contact/v3/
['contact/v3/index.html']
```

## CPU-важкий рендер: `to_thread` і `ProcessPoolExecutor`

Воркер це корутина в тому самому циклі подій, що й обробники HTTP. Якщо рендер синхронний (Jinja2, `subprocess.run` до Node-рендерера, `sqlite3`, бібліотека без async), його виклик просто з воркера заморожує весь сервер на час рендера: жоден запит не обробиться, жоден WebSocket не отримає подію. `asyncio.to_thread(fn, *args)` віддає виклик у пул потоків і повертає awaitable; воркер чекає результат, а цикл подій вільний. Для справжньої CPU-роботи потоки не допомагають через GIL, і тоді `loop.run_in_executor(pool, fn, *args)` з `ProcessPoolExecutor`. Механізм GIL і порівняння на 50 конфігах у m5-l08; тут лише як це стикується з чергою.

Потоки й процеси в браузері недоступні, тому приклад локальний. Таймер `tick` кожні 40 мс показує, чи живий цикл подій, поки йде рендер на 100 мс:

```python
import asyncio
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field


def render_html(config: dict) -> str:          # чиста функція верхнього рівня
    rows = "".join(f"<input name={name!r}>" for name in config["fields"])
    total = sum(i * i for i in range(2_000_000))  # імітація важкого рендера
    return f"<form id={config['id']}>{rows}</form> checksum={total % 97}"


async def ticker(stop: asyncio.Event) -> None:
    while not stop.is_set():
        print("  tick")
        await asyncio.sleep(0.04)


async def render_with(label: str, call) -> None:
    print(label)
    stop = asyncio.Event()
    t = asyncio.create_task(ticker(stop))
    await asyncio.sleep(0)                      # дати ticker стартувати
    await call()
    stop.set()
    await t
    print("  render done")


def blocking_render() -> None:
    time.sleep(0.1)                             # subprocess.run, sqlite3, requests...


async def main() -> None:
    async def inline() -> None:
        blocking_render()
    await render_with("inline:", inline)

    async def threaded() -> None:
        await asyncio.to_thread(blocking_render)
    await render_with("to_thread:", threaded)

    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor(max_workers=2) as pool:
        configs = [{"id": 1, "fields": ["email"]}, {"id": 2, "fields": ["name", "phone"]}]
        results = await asyncio.gather(
            *(loop.run_in_executor(pool, render_html, c) for c in configs)
        )
        print(*results, sep="\n")


if __name__ == "__main__":
    asyncio.run(main())
```

```text
inline:
  tick
  render done
to_thread:
  tick
  tick
  tick
  render done
<form id=1><input name='email'></form> checksum=17
<form id=2><input name='name'><input name='phone'></form> checksum=17
```

Інлайн-виклик дав один `tick` до рендера і жодного під час: цикл стояв. Через `to_thread` таймер тікав далі. Черга від цього не змінюється: воркер так само бере `job_id`, лише всередині `await asyncio.to_thread(renderer.render, config)` замість прямого виклику. Кількість воркерів обмежує кількість одночасних рендерів, тому пул процесів створюють з `max_workers`, рівним кількості воркерів, один раз у lifespan, а не на кожну задачу: старт процесу коштує десятки мілісекунд.

Для капстоуну вибір такий. Рендер форми через Jinja2 займає мілісекунди й відпускає GIL на I/O запису, тож `to_thread` достатньо. `ProcessPoolExecutor` виправданий, коли профілювання показує, що рендер справді їсть CPU (великі сторінки, оптимізація зображень), бо у нього своя ціна: аргументи й результат передаються через pickle.

> **Пастка.** У процес іде копія аргументів, а не посилання. Задача з чергою подій усередині пройде pickle без помилки (порожня `asyncio.Queue` серіалізується), але зміни, які функція зробить у дочірньому процесі, батько не побачить. Lambda та вкладені функції не серіалізуються зовсім. Передавайте в процес лише дані (dict конфігу, рядок), функцію оголошуйте на верхньому рівні модуля, а статус змінюйте в батьківському процесі за результатом.

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field


@dataclass
class Job:
    id: int
    status: str = "running"
    events: asyncio.Queue[str] = field(default_factory=asyncio.Queue)


def render_job(job: Job) -> str:
    job.status = "rendered"                 # змінює копію в дочірньому процесі
    job.events.put_nowait("progress 100%")
    return f"<form id={job.id}>"


async def main() -> None:
    loop = asyncio.get_running_loop()
    job = Job(1)
    with ProcessPoolExecutor(max_workers=1) as pool:
        html = await loop.run_in_executor(pool, render_job, job)
        print(html, job.status, job.events.qsize())
        try:
            await loop.run_in_executor(pool, lambda: "<form>")
        except Exception as e:
            print(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
```

```text
<form id=1> running 0
AttributeError: Can't get local object 'main.<locals>.<lambda>'
```

## Прогрес: callback-и чи черга подій на задачу

Статус у сховищі відповідає на питання "що зараз", але фронтенд хоче бачити зміни без опитування. У m4-l08 для цього був Observer: список callback-ів, які `Pipeline` викликає на кожен статус. У воркері він ламається на першому ж реальному слухачі. Відправка в WebSocket це `await ws.send_json(...)`, тобто async-функція, а синхронний `_notify` її лише викликає й отримує корутину, яку ніхто не чекає:

```python
from collections.abc import Callable

listeners: list[Callable[[int, str], object]] = []

def log_status(job_id: int, status: str) -> None:
    print(f"log: job {job_id} {status}")

async def send_to_ws(job_id: int, status: str) -> None:
    print(f"ws <- job {job_id} {status}")

listeners += [log_status, send_to_ws]
for listener in listeners:
    listener(1, "running")
```

```text
log: job 1 running
l_obs.py:13: RuntimeWarning: coroutine 'send_to_ws' was never awaited
  listener(1, "running")
RuntimeWarning: Enable tracemalloc to get the object allocation traceback
```

Лог спрацював, у WebSocket не пішло нічого, а в stderr попередження. Виправити через `await listener(...)` у воркері погано: повільний клієнт гальмує рендер, а клієнт, що відпав, кидає виняток у воркер. Через `asyncio.create_task(listener(...))` теж погано: це fire-and-forget, задачу ніхто не чекає й не прибирає. Робоча схема інша: у кожного глядача своя `asyncio.Queue`. Воркер робить синхронний `put_nowait` у всі черги задачі й іде далі, а WebSocket-ендпоінт у m7-l04 читає свою чергу в `async for` (асинхронний генератор `watch` з m5-l06). Наївна версія показує, що ще треба врахувати:

```python live
import asyncio
from collections import defaultdict


class NaiveEvents:
    def __init__(self) -> None:
        self.subscribers: defaultdict[int, list[asyncio.Queue[str]]] = defaultdict(list)

    def publish(self, job_id: int, status: str) -> None:     # синхронний: воркер не чекає
        for queue in self.subscribers[job_id]:
            queue.put_nowait(status)

    def subscribe(self, job_id: int) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        self.subscribers[job_id].append(queue)
        return queue


async def read_until_done(queue: asyncio.Queue[str]) -> list[str]:
    seen = []
    while (status := await queue.get()) not in {"done", "failed"}:
        seen.append(status)
    return [*seen, status]


async def main() -> None:
    events = NaiveEvents()
    ws = events.subscribe(1)                       # WebSocket-клієнт підписався одразу
    for status in ["running", "progress 1/2", "progress 2/2", "done"]:
        events.publish(1, status)
    print("on time:", await read_until_done(ws))

    late = events.subscribe(1)                     # вкладку відкрили після done
    try:
        async with asyncio.timeout(0.1):
            print(await read_until_done(late))
    except TimeoutError:
        print("late: still waiting")
    print("queues kept:", len(events.subscribers[1]))

asyncio.run(main())
```

```text
on time: ['running', 'progress 1/2', 'progress 2/2', 'done']
late: still waiting
queues kept: 2
```

Два дефекти. Хто підписався після `done`, ніколи його не отримає і чекатиме вічно: WebSocket відкрили через секунду після запуску, а рендер був швидшим. І черги відписаних клієнтів лишаються в словнику, а `put_nowait` у них продовжує накопичувати події. Перше лікується знімком: при підписці першою подією йде останній відомий статус. Друге лікується відпискою у `finally` генератора, яка відпрацьовує і на `return`, і на закритті через `aclosing` (m5-l06).

<!-- task: t4 -->

## Межа одного процесу

Усе вище живе в одному процесі Python. `uvicorn formbuilder.api.app:app --workers 2` запускає два процеси, кожен імпортує модуль і проходить lifespan сам: дві черги, два пули воркерів, два словники. Балансування запитів між ними робить ОС, тому `POST` і наступний `GET` легко потрапляють у різні процеси. Нижче той самий застосунок з розділу про lifespan у двох процесах, а запити до кожного явні:

```python
from multiprocessing import Pipe, Process
from multiprocessing.connection import Connection


def serve(conn: Connection) -> None:
    from fastapi.testclient import TestClient
    from app1 import app                     # кожен процес імпортує застосунок заново

    with TestClient(app) as client:
        while (request := conn.recv()) is not None:
            method, path = request
            response = client.request(method, path)
            conn.send((response.status_code, response.json()))


if __name__ == "__main__":
    pipes = {}
    for name in ("A", "B"):                  # uvicorn --workers 2
        parent, child = Pipe()
        Process(target=serve, args=(child,)).start()
        pipes[name] = parent

    def call(worker: str, method: str, path: str) -> None:
        pipes[worker].send((method, path))
        print(worker, method, path, "->", *pipes[worker].recv())

    call("A", "POST", "/forms/7/build")
    call("B", "GET", "/jobs/1")
    call("A", "GET", "/jobs/1")
    for conn in pipes.values():
        conn.send(None)
```

```text
A POST /forms/7/build -> 202 {'id': 1, 'form_id': 7, 'status': 'queued', 'error': None}
B GET /jobs/1 -> 404 {'detail': 'job not found'}
A GET /jobs/1 -> 200 {'id': 1, 'form_id': 7, 'status': 'running', 'error': None}
```

Процес B про задачу не знає. Перенесення стану в SQLite `JobStore` лікує `GET`, але не чергу: задача все одно лежить в `asyncio.Queue` процесу A. Гірше з відновленням: обидва процеси викликають `requeue_running()` на старті, і задачу, яку процес A ще рендерить, процес B поверне в `queued` і візьме вдруге, тож одна задача виконається двічі паралельно. Висновок для капстоуну: один процес uvicorn з воркерами в lifespan. Для API конструктора форм з десятками запитів на хвилину цього достатньо, і саме так контейнер запускатиметься в m7-l07.

<!-- task: q3 -->

Коли одного процесу стане мало (API треба масштабувати окремо від рендера, або рендер має переживати деплой API), наступний крок не Redis, а окремий процес-воркер з тим самим SQLite як чергою. API лише створює рядок `queued`; воркер `python -m formbuilder.worker` у циклі забирає задачу умовним `UPDATE`, який спрацює лише в одного з конкурентів, бо SQLite серіалізує записи (один writer, m6-l08). Цикл опитування з `sleep(1)` між порожніми спробами замінює `await queue.get()`.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT, worker TEXT)")
conn.executemany("INSERT INTO jobs (status) VALUES (?)", [("queued",), ("queued",)])


def peek(conn: sqlite3.Connection) -> int | None:
    row = conn.execute(
        "SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1"
    ).fetchone()
    return row[0] if row else None


def claim(conn: sqlite3.Connection, job_id: int, worker: str) -> bool:
    with conn:
        cur = conn.execute(
            "UPDATE jobs SET status = 'running', worker = ? WHERE id = ? AND status = 'queued'",
            (worker, job_id),
        )
    return cur.rowcount == 1             # 0: хтось устиг раніше


# два процеси-воркери, кроки перемежовуються якнайгірше
a, b = peek(conn), peek(conn)
print("both saw:", a, b)
print("A claims", a, claim(conn, a, "A"))
print("B claims", b, claim(conn, b, "B"))
b = peek(conn)
print("B retries", b, claim(conn, b, "B"))
print(conn.execute("SELECT * FROM jobs").fetchall())
```

```text
both saw: 1 1
A claims 1 True
B claims 1 False
B retries 2 True
[(1, 'running', 'A'), (2, 'running', 'B')]
```

Обидва бачили задачу 1, але `WHERE ... AND status = 'queued'` пропустив лише першого; другий отримав `rowcount == 0` і взяв наступну. Далі за цією межею лежать Redis-черги з окремими воркерами (arq для asyncio, Celery, RQ; у Node це BullMQ): кілька машин, розклад, пріоритети, дашборди. Це інфраструктура, і вона поза курсом.

## Тестування воркера без сну

Воркер, написаний як у цьому уроці, тестується без жодного реального очікування, бо все, що залежить від часу й зовнішнього світу, приходить параметрами: `render` (fake-рендерер, що кидає заданий список винятків), `sleep` (записує паузи), `on_status` (збирає переходи). Тіло циклу винесене в функцію (`run_job`, `process_one` з t1), тож тест викликає один крок і не мусить скасовувати нескінченний `while True`. Асинхронні тести в pytest пишуться через плагін anyio, який приходить разом з FastAPI: маркер `@pytest.mark.anyio` на тесті або `pytestmark` на модулі. Вибір між anyio і `pytest-asyncio` для капстоуну, фікстури застосунку й тести API в m7-l05.

```python
import asyncio

import pytest

from jobs import Job, run_job          # jobs.py: Job і run_job з розділу про ретраї

pytestmark = pytest.mark.anyio


class FakeRenderer:
    def __init__(self, failures: list[Exception]) -> None:
        self.failures = failures
        self.calls = 0

    async def __call__(self, job: Job) -> str:
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return f"/sites/form-{job.form_id}/"


class Recorder:
    def __init__(self) -> None:
        self.statuses: list[str] = []
        self.pauses: list[float] = []

    def on_status(self, job: Job) -> None:
        self.statuses.append(job.status)

    async def sleep(self, seconds: float) -> None:
        self.pauses.append(seconds)


async def test_retry_then_done() -> None:
    job, rec = Job(1, 7), Recorder()
    render = FakeRenderer([ConnectionError("down"), TimeoutError("slow")])
    await run_job(job, render, on_status=rec.on_status, sleep=rec.sleep)
    assert rec.statuses == ["running", "retrying", "running", "retrying", "running", "done"]
    assert rec.pauses == [0.5, 1.0]
    assert (job.attempts, job.url) == (3, "/sites/form-7/")


async def test_config_error_is_not_retried() -> None:
    job, rec = Job(1, 13), Recorder()
    render = FakeRenderer([ValueError("unknown element 'slider'")])
    await run_job(job, render, on_status=rec.on_status, sleep=rec.sleep)
    assert rec.statuses == ["running", "failed"]
    assert job.error == "ValueError: unknown element 'slider'"
    assert render.calls == 1 and rec.pauses == []


async def test_attempts_survive_restart() -> None:
    job, rec = Job(1, 7, attempts=2), Recorder()     # дві спроби вже були до рестарту
    render = FakeRenderer([ConnectionError("down")])
    await run_job(job, render, on_status=rec.on_status, sleep=rec.sleep)
    assert job.status == "failed" and job.attempts == 3


async def test_cancel_leaves_status_to_caller() -> None:
    job = Job(1, 7)
    async def hang(job: Job) -> str:
        await asyncio.Event().wait()
        return ""
    task = asyncio.create_task(run_job(job, hang))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert job.status == "running"
```

```text
$ pytest -q
....                                                                     [100%]
4 passed in 0.01s
```

Чотири тести, нуль секунд реального backoff. Останній фіксує контракт, на який спирається воркер: `run_job` на скасуванні статус не чіпає (лишає `running`), а повертає задачу в `queued` той, хто її взяв з черги. Якщо колись хтось додасть у `run_job` `except BaseException`, тест це покаже. За замовчуванням плагін anyio запускає тести лише на asyncio; щоб прогнати ще й на trio, потрібна фікстура `anyio_backend` і встановлений trio.

> **Пастка.** `monkeypatch.setattr(asyncio, "sleep", fake)` здається коротшим за параметр, але підміняє `sleep` для всього процесу, включно з бібліотеками, які теж його викликають (anyio, httpx, ваш власний heartbeat), і тест починає перевіряти не те. Явний параметр `sleep=` у сигнатурі дешевший: один рядок, і тест читається без знання про моки. Це той самий принцип ін'єкції годинника, що `clock` у m4-l08.

## Для капстоуну

Збираємо все разом. `POST /forms/{id}/build` ставить задачу в `JobStore` (`enqueue`), публікує `queued` у `JobEvents` і кладе `job_id` у чергу як сигнал. Воркер бере з черги сигнал, а задачу бере зі сховища через `next_pending`, рендерить через `Renderer` і публікує через `Publisher` (обидва синхронні, тому через `to_thread`), а кожен перехід статусу йде і в сховище, і в події. Ретраї тут роблять не в пам'яті, як `run_job` вище, а через сховище: `mark_failed` з m6-l08 сама повертає задачу в `queued`, поки `attempts < MAX_ATTEMPTS`, тож лічильник спроб переживає рестарт. Постійна помилка позначається `retry=False`: це єдине розширення `mark_failed`, яке додає капстоун, щоб не повторювати її марно. `GET /jobs/{id}` читає лише сховище. Lifespan на старті викликає `requeue_running()` і будить воркерів, а на виході скасовує їх і знову викликає `requeue_running()`, щоб недороблене дістав наступний процес. Сховище тут справжнє, з `formbuilder/store.py`; `JobEvents` з t4, у m7-l04 хаб переїде в `formbuilder/hub.py`.

```python
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Protocol

from fastapi import FastAPI, HTTPException, Request

from formbuilder.store import Job, JobStore, SqliteJobStore, connect
from jobs_core import JobEvents, Sleep  # t4; у m7-l04 хаб переїде в formbuilder/hub.py

RETRYABLE = (ConnectionError, TimeoutError)


class Renderer(Protocol):  # спрощено для сценарію: рендер за id конфігу
    def render(self, config_id: str) -> str: ...


class Publisher(Protocol):
    def publish(self, slug: str, version: int, html: str) -> str: ...


async def worker(
    queue: asyncio.Queue[int],
    store: JobStore,
    events: JobEvents,
    renderer: Renderer,
    publisher: Publisher,
    *,
    sleep: Sleep = asyncio.sleep,
    base_delay: float = 0.5,
) -> None:
    while True:
        await queue.get()  # сигнал: у сховищі є queued-задача
        try:
            while (job := store.next_pending()) is not None:  # queued -> running, attempts + 1
                events.publish(job.id, "running")
                try:
                    html = await asyncio.to_thread(renderer.render, job.config_id)
                    await asyncio.to_thread(
                        publisher.publish, job.config_id, job.config_version, html
                    )
                except RETRYABLE as e:
                    store.mark_failed(job.id, f"{type(e).__name__}: {e}")
                    after = store.get_job(job.id)
                    if after is not None and after.status == "queued":  # ще є спроби
                        events.publish(job.id, "retrying")
                        await sleep(base_delay * 2 ** (job.attempts - 1))
                    else:
                        events.publish(job.id, "failed")
                except Exception as e:
                    store.mark_failed(job.id, f"{type(e).__name__}: {e}", retry=False)
                    events.publish(job.id, "failed")
                else:
                    store.mark_done(job.id)
                    events.publish(job.id, "done")
        finally:
            queue.task_done()


def create_app(
    db_path: Path, renderer: Renderer, publisher: Publisher,
    *, workers: int = 2, sleep: Sleep = asyncio.sleep,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        conn = connect(db_path)
        store, events = SqliteJobStore(conn), JobEvents()
        store.requeue_running()  # недороблене з минулого запуску знову queued
        queue: asyncio.Queue[int] = asyncio.Queue()
        app.state.store, app.state.events, app.state.queue = store, events, queue
        tasks = [
            asyncio.create_task(
                worker(queue, store, events, renderer, publisher, sleep=sleep)
            )
            for _ in range(workers)
        ]
        for _ in tasks:
            queue.put_nowait(0)  # розбудити кожного: у сховищі могли лишитись задачі
        try:
            yield
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            store.requeue_running()  # те, що воркери не доробили, доробить наступний процес
            conn.close()

    app = FastAPI(lifespan=lifespan)

    @app.post("/forms/{form_id}/build", status_code=202)
    async def build(form_id: str, request: Request) -> Job:
        store = request.app.state.store
        job_id = store.enqueue(form_id, 1)  # у капстоуні версія з latest_config (m7-l01)
        request.app.state.events.publish(job_id, "queued")
        request.app.state.queue.put_nowait(job_id)
        job = store.get_job(job_id)
        assert job is not None
        return job

    @app.get("/jobs/{job_id}")
    async def get_job(job_id: int, request: Request) -> Job:
        job = request.app.state.store.get_job(job_id)
        if job is None:
            raise HTTPException(404, "job not found")
        return job

    return app
```

Сценарій нижче проганяє це двома екземплярами застосунку над одним файлом SQLite: перший обробляє три задачі й зупиняється посеред третьої, другий після "рестарту" її доробляє. Рендер конфігу `slow` тримається на `threading.Event`, щоб момент зупинки був детермінованим.

```python
import tempfile
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from capstone_app import create_app
from formbuilder.store import SqliteJobStore, connect


class FakeRenderer:
    def __init__(self) -> None:
        self.gate = threading.Event()           # тримає рендер "slow", поки тест не відпустить
        self.calls: list[str] = []

    def render(self, config_id: str) -> str:
        self.calls.append(config_id)
        if config_id == "broken":
            raise ValueError("unknown element 'slider'")
        if config_id == "slow":
            self.gate.wait(timeout=5)
        return f"<form id={config_id}>"


class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[str, str] = {}
        self.calls: list[str] = []

    def publish(self, slug: str, version: int, html: str) -> str:
        self.calls.append(slug)
        self.pages[f"{slug}/v{version}"] = html  # той самий ключ: повтор нічого не дублює
        return f"/sites/{slug}/v{version}/"


FIELDS = ("id", "config_id", "status", "attempts", "error")


def wait_for(client: TestClient, job_id: int, statuses: set[str]) -> dict:
    for _ in range(100):
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] in statuses:
            return {key: job[key] for key in FIELDS}
        time.sleep(0.01)
    raise TimeoutError(job)


db = Path(tempfile.mkdtemp()) / "jobs.db"
renderer, publisher = FakeRenderer(), MemoryPublisher()

with TestClient(create_app(db, renderer, publisher)) as client:
    job = client.post("/forms/contact/build").json()
    print({key: job[key] for key in FIELDS})
    client.post("/forms/broken/build")
    client.post("/forms/slow/build")
    print(wait_for(client, 1, {"done", "failed"}))
    print(wait_for(client, 2, {"done", "failed"}))
    print(wait_for(client, 3, {"running"}))
    threading.Timer(0.2, renderer.gate.set).start()
# вихід з with: lifespan скасовує воркерів посеред рендера job 3
job = SqliteJobStore(connect(db)).get_job(3)
print("after shutdown:", job.status, job.attempts)

with TestClient(create_app(db, renderer, publisher)) as client:   # "рестарт"
    print(wait_for(client, 3, {"done", "failed"}))
print("slow rendered:", renderer.calls.count("slow"), "times")
print("publish calls:", publisher.calls)
print("pages:", publisher.pages)
```

```text
{'id': 1, 'config_id': 'contact', 'status': 'queued', 'attempts': 0, 'error': None}
{'id': 1, 'config_id': 'contact', 'status': 'done', 'attempts': 1, 'error': None}
{'id': 2, 'config_id': 'broken', 'status': 'failed', 'attempts': 1, 'error': "ValueError: unknown element 'slider'"}
{'id': 3, 'config_id': 'slow', 'status': 'running', 'attempts': 1, 'error': None}
after shutdown: queued 1
{'id': 3, 'config_id': 'slow', 'status': 'done', 'attempts': 2, 'error': None}
slow rendered: 2 times
publish calls: ['contact', 'slow']
pages: {'contact/v1': '<form id=contact>', 'slow/v1': '<form id=slow>'}
```

Задача 3 пройшла `running → queued → running → done` через рестарт, і `attempts=2` це чесно показує. Рядок `slow rendered: 2 times` ілюструє те, що в коді не видно: скасування корутини, яка чекає `to_thread`, не зупиняє сам потік. Перший рендер доробився у фоні вже після того, як воркера скасували, і вихід з першого `with` чекав на нього (цикл подій при закритті дочікується пулу потоків). Результат того рендера просто ніхто не забрав, а публікація відбулась один раз. Якби публікація стояла всередині тієї самої функції в потоці, сторінку записали б двічі, і тут рятує лише ідемпотентний `publish` за ключем.

> **Пастка.** Через це не можна покладатися на `cancel()` як на "зупинити рендер". Потік не скасовується взагалі, процес у `ProcessPoolExecutor` теж доробить своє. Довгий рендер у потоці або перевіряє прапорець зупинки сам, або має бути ідемпотентним, а зупинка сервера має таймаут на очікування (m6-l07).

<!-- task: t5 -->

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **Fire-and-forget як у Node.** Звичка `void doWork()` або `setImmediate(() => doWork())` переноситься як `asyncio.create_task(render(job))` в обробнику без збереження посилання. Задачу ніхто не чекає, виняток з неї потрапить лише в лог як "Task exception was never retrieved", а без сильного посилання її може прибрати GC (m5-l05). Правильно: `BackgroundTasks` для дрібниць, черга з воркерами для всього, що має статус.

   ```python
   asyncio.create_task(render(job))        # за звичкою: ніхто не чекає й не тримає
   await request.app.state.queue.put(job.id)  # правильно: задача в черзі, воркер її чекає
   ```

2. **`add_task(fn(arg))` замість `add_task(fn, arg)`.** З `after(() => fn(arg))` переносять виклик. Для `async def` це корутина, яка не виконається; клієнт отримає 202, задача впаде після відповіді з `TypeError`. Правильно: функція й аргументи окремо.

   ```python
   background_tasks.add_task(send_email("a@b.c"))   # TypeError після відповіді
   background_tasks.add_task(send_email, "a@b.c")   # правильно
   ```

3. **BullMQ як перший рефлекс.** Перша думка "потрібна черга, отже Redis". Для одного процесу з десятками задач на хвилину `asyncio.Queue` плюс SQLite дають ту саму надійність без ще одного сервісу в compose. Правильно: почати з черги в процесі, наступний крок окремий процес-воркер над SQLite, Redis лише коли кількох машин справді треба.

   ```python
   queue: asyncio.Queue[int] = asyncio.Queue()   # у lifespan, без інфраструктури
   ```

4. **Очікування, що фонова задача переживе процес.** У Node з PM2 перезапуск теж губить проміси в польоті, але це рідко помічають, бо стан у Redis. Тут `asyncio.Queue` і `BackgroundTasks` живуть у пам'яті. Правильно: стан у `JobStore`, черга лише будить воркерів, `requeue_running()` на старті повертає `running` у `queued`.

   ```python
   store.requeue_running()          # running -> queued, вичерпані спроби -> failed
   for _ in range(workers):
       queue.put_nowait(0)          # розбудити воркерів: роботу вони візьмуть через next_pending()
   ```

5. **`worker_threads` для черги.** Рефлекс "фонова робота значить окремий потік" дає `threading.Thread` з `queue.Queue` поруч з asyncio. Потоки не потрібні для I/O-задач, а з asyncio-кодом з іншого потоку працювати не можна без `run_coroutine_threadsafe`. Правильно: воркери як asyncio-задачі, потік лише для конкретного блокуючого виклику через `to_thread`, процес для CPU (m5-l08).

   ```python
   html = await asyncio.to_thread(renderer.render, config)
   ```

6. **`except Exception` як "ловить усе".** У JS `catch` ловить усе, і скасування через `AbortController` теж приходить як помилка. Тут `CancelledError` пролітає крізь `except Exception`, задача лишається `running`. Правильно: окрема гілка `except asyncio.CancelledError` з поверненням у `queued` і `raise`.

   ```python
   except asyncio.CancelledError:
       job.status = "queued"
       raise
   ```

7. **Fake timers замість ін'єкції `sleep`.** З Jest переносять `jest.useFakeTimers()` і шукають аналог для asyncio. Його немає в стандартній бібліотеці, а патч `asyncio.sleep` ламає сам цикл. Правильно: `sleep` параметром з дефолтом `asyncio.sleep`, у тесті функція, що записує паузи.

   ```python
   await run_job(job, render, sleep=recorder.sleep)
   assert recorder.pauses == [0.5, 1.0]
   ```

## Підсумок

- `BackgroundTasks` виконує задачі послідовно після відправки відповіді, в тому самому процесі, без ретраїв і без стану; годиться для листа чи логу, не для генерації.
- В `add_task` передається функція й аргументи окремо; `def` іде в threadpool, `async def` у цикл подій.
- Власний воркер: `asyncio.Queue` з `job_id`, N задач-воркерів, запуск у `lifespan`, зупинка через `cancel()` і `gather(..., return_exceptions=True)`.
- Кількість воркерів обмежує паралелізм; `Semaphore` для окремого етапу з іншою межею.
- Стан задачі в `JobStore` (SQLite), не в пам'яті; `requeue_running()` на старті повертає `running` у `queued`, а задачу з вичерпаними спробами в `failed`; задачу воркер бере через `next_pending()`.
- `CancelledError` це `BaseException`: ловити окремо, повертати задачу в `queued`, кидати далі.
- Ретраї лише для тимчасових помилок, backoff `base * 2 ** (attempt - 1)`, `attempts` у сховищі; `sleep` ін'єктується.
- Задача обов'язково виконається повторно, тому результат пишеться за ключем з версією, атомарною заміною.
- Синхронний рендер через `to_thread`, CPU-важкий через `ProcessPoolExecutor`; скасування не зупиняє потік чи процес.
- Прогрес: у кожного глядача своя черга, знімок останнього статусу при підписці, відписка у `finally`.
- `--workers N` означає N незалежних черг; для капстоуну один процес, далі окремий воркер над SQLite, Redis поза курсом.

## Що далі

У m7-l04 `JobEvents.watch` стає джерелом для WebSocket-ендпоінта `/ws/jobs/{id}`: `async for status in events.watch(job_id): await ws.send_json(...)`, з відпискою при розриві з'єднання і broadcast на кількох глядачів. Тести для повного сценарію "створити форму, build, воркер, done, статика на диску" з `dependency_overrides` і fake-рендерером будуть у m7-l05.
