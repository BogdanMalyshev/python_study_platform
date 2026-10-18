---
id: m7-l05
module: m7-fastapi
title: "Тести API: pytest і httpx AsyncClient"
summary: "Учень тестує FastAPI-застосунок без сервера й портів: AsyncClient з ASGITransport і TestClient для WebSocket, асинхронні тести на плагіні anyio, фікстури з lifespan і dependency_overrides, ізоляція через tmp_path і fake-залежності, воркер і ретраї без реального сну, coverage, який показує, що саме підмінив fake."
duration_min: 90
prerequisites: [m7-l04]
---

## Застосунок без сервера: `ASGITransport` і `TestClient`

У Node ви тестували API через supertest: `request(app)` бере Express-застосунок, сам піднімає його на тимчасовому порту і шле справжні HTTP-запити. У Python порт не потрібен взагалі. FastAPI-застосунок це ASGI-застосунок (ASGI, Asynchronous Server Gateway Interface, офіційна назва специфікації): звичайний awaitable-об'єкт `app(scope, receive, send)`, який uvicorn викликає на кожен запит. Тест може викликати його так само, тільки замість uvicorn між ними стоїть транспорт httpx (transport, термін з m5-l07), який перетворює `httpx.Request` на ASGI-виклик у тому самому процесі.

```ts
import request from "supertest";
import { app } from "../src/app";

it("creates a form", async () => {
  await request(app).post("/forms").send(form).expect(201).expect("Content-Type", /json/);
});
```

```python
import httpx

from formbuilder.api.app import app


async def test_creates_form(make_form):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/forms", json=make_form())
    assert response.status_code == 201
    assert response.headers["content-type"] == "application/json"
```

Розходжень два. Перше: між тестом і застосунком немає ні сокета, ні HTTP-парсера, тож тест швидший і не ловить проблем мережевого рівня; для цього є один смоук-тест на справжньому uvicorn поза цим уроком. Друге: перевірки не ланцюжок `.expect(...)`, а звичайний `Response` з m5-l07 і голий `assert` з m3-l03. Клієнт той самий `AsyncClient`, яким ви ходили в чужі API, лише з іншим транспортом, як `MockTransport` там. І одна відмінність від supertest, яка вистрілить у капстоуні: стартовий код застосунку (`lifespan`) транспорт не запускає, про це розділ про фікстури.

FastAPI має і другий клієнт, `TestClient` (з `fastapi.testclient`, насправді клас Starlette). Він синхронний: `client.get(...)` без `await`, тест звичайний `def`. Синхронним він стає завдяки тому, що запускає застосунок в окремому потоці зі своїм циклом подій через blocking portal (офіційний термін anyio: міст, через який синхронний код викликає корутини в циклі іншого потоку). Видно це з одного ендпоінта, що повертає ім'я свого потоку.

```python
# test_where.py
import threading

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


@app.get("/where")
async def where() -> dict[str, str]:
    return {"thread": threading.current_thread().name}


def test_sync_client():
    client = TestClient(app)
    response = client.get("/where")
    print("\ntest:", threading.current_thread().name, "app:", response.json()["thread"])


@pytest.mark.anyio
async def test_async_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/where")
    print("\ntest:", threading.current_thread().name, "app:", response.json()["thread"])
```

```bash
uv run pytest -q -s test_where.py
```

```text
test: MainThread app: asyncio-portal-102e90e90
.
test: MainThread app: MainThread
.
```

(Суфікс імені потоку щоразу інший.) Звідси правило вибору. `AsyncClient` з `ASGITransport` потрібен, коли тест сам щось `await`-ить поруч із запитами: крок воркера, асинхронну фікстуру, чергу застосунку. Застосунок і тест тоді живуть в одному циклі подій, і `await app.state.worker.run_once()` між двома запитами працює. `TestClient` лишається для WebSocket, бо httpx 0.28 WebSocket не вміє, а `TestClient.websocket_connect` вміє, і для простих синхронних тестів. Змішувати не варто: в асинхронному тесті `TestClient` запустить застосунок у чужому потоці й чужому циклі, і чекати на його внутрішні об'єкти з циклу тесту безглуздо. Маркер `@pytest.mark.anyio` пояснено в наступному розділі.

`base_url` у `AsyncClient` обов'язковий за змістом, хоча httpx його не вимагає. Без нього запит усе одно доходить до застосунку, але в ASGI-scope порожня схема й хост, і падає перший же код, який читає `request.url`. Значення може бути будь-яким: `http://test` це домовленість, а не реальна адреса. Шлях у `base_url` дописується спереду, як у m5-l07, тож `base_url="http://test/api/v1"` перетворює `"/forms/signup"` на `/api/v1/forms/signup`.

```python
# base.py
import asyncio

import httpx
from fastapi import FastAPI, Request

app = FastAPI()


@app.get("/forms/{form_id}")
async def url(form_id: str, request: Request) -> dict[str, str]:
    return {"url": str(request.url), "base": str(request.base_url)}


async def main() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport) as client:
        try:
            r = await client.get("/forms/signup")
            print("no base_url:", r.status_code, r.json())
        except Exception as exc:
            print("no base_url:", type(exc).__name__, exc)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/forms/signup")
        print(r.json())
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as client:
        r = await client.get("/forms/signup")
        print(r.status_code, r.request.url)


asyncio.run(main())
```

```text
no base_url: KeyError ''
{'url': 'http://test/forms/signup', 'base': 'http://test/'}
404 http://test/api/v1/forms/signup
```

> **Пастка.** Starlette 1.x перевів `TestClient` на пакет `httpx2` (наступник httpx від того самого автора, супроводжує команда Pydantic). Якщо встановлено лише `httpx`, імпорт `fastapi.testclient` дає `StarletteDeprecationWarning` з порадою встановити `httpx2`, і воно з'являється в підсумку кожного прогону. Код міняти не треба: `uv add --dev httpx2`, і `TestClient` підхопить його сам. `httpx.AsyncClient` і `ASGITransport` з httpx 0.28 працюють як раніше, тож тести на `AsyncClient` лишаються на тому самому httpx, що й код застосунку.

## Асинхронні тести: плагін anyio чи pytest-asyncio

pytest сам корутини не виконує: `async def test_...` без плагіна падає з повідомленням, знайомим з m3-l03. У Jest такого питання немає, бо тест, що повертає Promise, Jest просто чекає; у Python хтось має створити цикл подій, запустити в ньому тест і закрити цикл, і цим займається плагін.

```text
______________________________ test_forgot_marker ______________________________
async def functions are not natively supported.
You need to install a suitable plugin for your async framework, for example:
  - anyio
  - pytest-asyncio
  ...
FAILED test_nomark.py::test_forgot_marker - Failed: async def functions are n...
```

Плагінів два. Перший вбудований у бібліотеку anyio, яка вже стоїть у проєкті як залежність Starlette і httpx: окремо нічого ставити не треба, pytest знаходить плагін через entry point. Тест позначають `@pytest.mark.anyio`, або вмикають `anyio_mode = "auto"` у конфігу (anyio 4.15), і тоді плагін бере всі `async def`-тести й фікстури сам. Бекенд задає фікстура `anyio_backend`. За замовчуванням вона параметризована всіма доступними бекендами, тому до id тесту дописується `[asyncio]`, а якщо в оточенні з'явиться trio, кожен тест запуститься двічі. Тому її перевизначають у `conftest.py` одним значенням.

```toml
[tool.pytest.ini_options]
anyio_mode = "auto"
```

```python
# conftest.py
import asyncio

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def resource():
    print(f"\n[resource] loop {id(asyncio.get_running_loop()) % 1000}")
    yield "r"
    print("[resource] closed")


# test_loops.py
async def test_one(resource):
    print(f"test_one loop {id(asyncio.get_running_loop()) % 1000}")


async def test_two():
    print(f"test_two loop {id(asyncio.get_running_loop()) % 1000}")


def test_sync():
    assert True
```

```bash
uv run pytest -v -s test_loops.py
```

```text
test_loops.py::test_one 
[resource] loop 296
test_one loop 296
PASSED[resource] closed

test_loops.py::test_two test_two loop 800
PASSED
test_loops.py::test_sync PASSED
```

Async-фікстура з `yield` і тест виконуються в одному циклі, а наступний тест отримує новий: плагін тримає цикл, поки його використовує хоч одна фікстура чи тест, і закриває, коли всі відпустили. Для тестів API це саме те, що треба: стан циклу (задачі, черги, таймери) не перетікає між тестами, як не перетікає стан фікстур з function scope. Синхронні тести в тому самому файлі виконуються як завжди.

Другий плагін, `pytest-asyncio`, окрема dev-залежність. У режимі `asyncio_mode = "auto"` він так само бере всі асинхронні тести й фікстури без маркерів; у строгому режимі за замовчуванням тест позначають `@pytest.mark.asyncio`, а асинхронну фікстуру треба оголошувати через `@pytest_asyncio.fixture`. Звичайний `@pytest.fixture` на `async def` у строгому режимі дає помилку на setup, і це найчастіша скарга на цей плагін.

```python
import pytest


@pytest.fixture
async def client():
    yield "client"


@pytest.mark.asyncio
async def test_uses_client(client):
    assert client == "client"
```

```text
______________________ ERROR at setup of test_uses_client ______________________
'test_uses_client' requested an async fixture 'client', with no plugin or hook that handled it. This is an error, as pytest does not natively support it.
```

Обидва плагіни можуть стояти поруч, і кожен бере свої тести: у прогоні нижче pytest-asyncio в auto-режимі виконав непозначений тест, а тест з `@pytest.mark.anyio` залишився anyio. Вмикати обидва auto-режими одночасно не можна: anyio при старті попереджає `PytestConfigWarning`, бо тоді обидва претендують на ті самі тести.

```text
asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 2 items

test_pa.py::test_one 
[resource] loop 816
test_one loop 816
PASSED
test_pa.py::test_marked_anyio[asyncio] test_marked_anyio loop 272
PASSED
```

Для капстоуну обрано anyio в auto-режимі. Причини: залежність уже є, і нового пакета в `dev` не з'являється; Starlette сам побудований на anyio, і його `TestClient` працює через той самий anyio-портал, тож у тестах один механізм керування циклом, а не два; auto-режим знімає маркери, а з ними й клас помилок "забув маркер" і "фікстура не тим декоратором". pytest-asyncio має сенс у проєкті, де вже є багато тестів на ньому або потрібні його налаштування спільного циклу на модуль чи сесію (`loop_scope`); у капстоуні такої потреби немає, бо кожен тест і так піднімає свій застосунок.

> **Пастка.** anyio виконує async-фікстуру через обгортку, яка просить `anyio_backend`. Якщо `anyio_backend` оголошена без `scope`, вона функціональна, і будь-яка async-фікстура ширшого scope падає з `ScopeMismatch` ще до тесту. Тому в капстоуні `anyio_backend` має `scope="session"`, навіть якщо модульних async-фікстур поки немає.

```python
@pytest.fixture(scope="module")
async def shared_app():
    yield "app"


async def test_uses_shared(shared_app):
    assert shared_app == "app"
```

```text
______________________ ERROR at setup of test_uses_shared ______________________
ScopeMismatch: You tried to access the function scoped fixture anyio_backend with a module scoped request object. Requesting fixture stack:
```

<!-- task: q1 -->

## Фікстури застосунку: lifespan, `client`, `dependency_overrides`

Капстоун відкриває сховище, створює чергу й запускає воркер у `lifespan` (m7-l01). У тестах це місце ламається першим: `ASGITransport` надсилає застосунку лише HTTP-запити і ніколи не надсилає подій lifespan (lifespan protocol, офіційна частина специфікації ASGI). `TestClient` їх надсилає, але тільки всередині `with TestClient(app) as client:`; створений просто як об'єкт, він теж стартового коду не виконує.

```python
# test_traps.py
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = {"signup": "Sign up"}
    yield


app = FastAPI(lifespan=lifespan)
sent: list[str] = []


@app.get("/forms/{form_id}")
async def read_form(form_id: str) -> dict[str, str]:
    return {"title": app.state.store[form_id]}


@app.post("/notify", status_code=202)
async def notify(background: BackgroundTasks) -> dict[str, bool]:
    background.add_task(sent.append, "email")
    return {"queued": True}


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.mark.anyio
async def test_async_client_skips_lifespan():
    async with make_client() as client:
        await client.get("/forms/signup")


def test_test_client_without_with():
    client = TestClient(app)
    client.get("/forms/signup")


def test_test_client_with_with():
    with TestClient(app) as client:
        assert client.get("/forms/signup").json() == {"title": "Sign up"}


@pytest.mark.anyio
async def test_background_task_already_ran():
    async with make_client() as client:
        response = await client.post("/notify")
    assert response.status_code == 202
    assert sent == ["email"]
```

```text
F.F.                                                                     [100%]
...
test_traps.py:21: in read_form
    return {"title": app.state.store[form_id]}
E   AttributeError: 'State' object has no attribute 'store'
...
FAILED test_traps.py::test_async_client_skips_lifespan[asyncio] - AttributeEr...
FAILED test_traps.py::test_test_client_without_with - AttributeError: 'State'...
2 failed, 2 passed in 0.80s
```

Зверніть увагу, що впав тест, а не прийшла відповідь 500: обидва клієнти за замовчуванням піднімають виняток з обробника прямо в тест (про це в розділі про перевірки). Для асинхронних тестів lifespan запускає `LifespanManager` з пакета `asgi-lifespan`: він надсилає застосунку ті самі `lifespan.startup` і `lifespan.shutdown`, що й uvicorn, тож тестується справжній стартовий код, а не його імітація. У капстоуні це ланцюжок з трьох фікстур: налаштування на `tmp_path`, застосунок із запущеним lifespan, клієнт.

```python
# tests/conftest.py (фрагмент)
@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Everything the app writes goes into this test's tmp_path; no worker tasks."""
    return Settings(db_path=tmp_path / "fb.db", out_dir=tmp_path / "out", workers=0)


@pytest.fixture
async def app(settings: Settings) -> AsyncIterator[FastAPI]:
    """The real app with its lifespan running, the way uvicorn would start it."""
    app = create_app(settings)
    async with LifespanManager(app):
        yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
```

Застосунок збирає фабрика `create_app(settings)`, а не модульний `app` з глобальними налаштуваннями, і це рішення продиктоване тестами. Lifespan не проходить через `Depends`, тому не бачить жодних перевизначень залежностей: якщо він сам викликає `get_settings()`, тест не має способу підсунути йому `tmp_path`, крім змінних оточення і `cache_clear()`. Фабрика приймає налаштування явно, кожен тест отримує свій екземпляр застосунку зі своїм `app.state`, а модульний `app = create_app()` лишається для uvicorn.

`dependency_overrides` закриває другу половину задачі: підміну того, що ендпоінт отримує через `Depends`. Це звичайний словник на об'єкті застосунку, де ключ це функція-залежність, а значення це функція, яку FastAPI викличе замість неї. У NestJS схожу роль грає `Test.createTestingModule(...).overrideProvider(X).useValue(...)`, але там провайдер шукається за токеном, а тут за самою функцією. Три наслідки цього видно в одному файлі.

```python
# test_overrides.py
from functools import lru_cache
from typing import Annotated

import httpx
import pytest
from fastapi import Depends, FastAPI
from pydantic import BaseModel


class Settings(BaseModel):
    out_dir: str = "out"


@lru_cache
def get_settings() -> Settings:
    return Settings()


app = FastAPI()


@app.get("/where")
async def where(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    return {"dep": settings.out_dir, "direct": get_settings().out_dir}


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_override(client):
    app.dependency_overrides[get_settings] = lambda: Settings(out_dir="/tmp/t1")
    response = await client.get("/where")
    assert response.json() == {"dep": "/tmp/t1", "direct": "out"}


async def test_next_test_sees_leak(client):
    response = await client.get("/where")
    assert response.json()["dep"] == "out"


async def test_wrong_key(client):
    app.dependency_overrides.clear()
    app.dependency_overrides[Settings] = lambda: Settings(out_dir="/tmp/t3")
    response = await client.get("/where")
    assert response.json()["dep"] == "/tmp/t3"
```

```text
.FF                                                                      [100%]
...
    async def test_next_test_sees_leak(client):
        response = await client.get("/where")
>       assert response.json()["dep"] == "out"
E       AssertionError: assert '/tmp/t1' == 'out'
...
    async def test_wrong_key(client):
        app.dependency_overrides.clear()
        app.dependency_overrides[Settings] = lambda: Settings(out_dir="/tmp/t3")
        response = await client.get("/where")
>       assert response.json()["dep"] == "/tmp/t3"
E       AssertionError: assert 'out' == '/tmp/t3'
...
2 failed, 1 passed in 0.47s
```

Перший тест зелений і показує межу механізму: перевизначення діє лише на те, що прийшло через `Depends`, а прямий виклик `get_settings()` у тілі обробника отримує справжнє значення. Другий показує, що словник живе на об'єкті застосунку, і перевизначення з попереднього тесту дожило до наступного, як забутий `jest.spyOn` без `restoreAllMocks`. Третій показує, що ключ це функція з `Depends`, а не тип результату: запис за ключем `Settings` ніхто не читає, і FastAPI про це мовчить. Тому `clear()` стоїть у teardown фікстури `app`, а не в кінці тесту, де його пропустить перший же червоний `assert`. Розподіл ролей у капстоуні такий: налаштування, а через них SQLite-файл і директорію статики, отримує фабрика; через `dependency_overrides` підміняють те, що обробник бере з `Depends`, наприклад `get_storage` на fake-сховище для тесту одного ендпоінта або `get_hub` на заготовлене джерело подій у розділі про WebSocket.

<!-- task: q2 -->

<!-- task: q3 -->

## Ізоляція стану: `tmp_path`, fake-залежності, воркер вручну

Кожен тест отримує свій `tmp_path` (m3-l03), і фікстура `settings` кладе туди і SQLite-файл, і директорію статики. Тести не бачать даних один одного, їх можна запускати в будь-якому порядку й поодинці, а після падіння файл бази лишається в базовій тимчасовій теці pytest (`pytest-of-<user>`, три останні запуски) для розбору. `:memory:` швидший, але база в пам'яті належить одному з'єднанню (m6-l08): друге з'єднання бачить порожню базу. Це підходить, коли застосунок тримає одне з'єднання, як `Storage` у капстоуні, і ламається, коли з'єднання відкривається на кожен запит.

```python
import sqlite3
from pathlib import Path

a = sqlite3.connect(Path(":memory:"))
a.execute("create table t(x)")
a.execute("insert into t values (1)")
b = sqlite3.connect(":memory:")
print(a.execute("select count(*) from t").fetchone())
try:
    b.execute("select count(*) from t")
except sqlite3.OperationalError as e:
    print("second connection:", e)
```

```text
(1,)
second connection: no such table: t
```

Воркер у тестах не запускається сам: `workers=0` у налаштуваннях, і lifespan створює `Worker`, але не створює для нього задач. Тест кладе задачу через API і викликає `await app.state.worker.run_once()` рівно тоді, коли хоче, щоб воркер зробив крок. Це відповідь на звичку з `jest.useFakeTimers()` і `waitFor`: замість чекати, поки фоновий процес встигне, тест сам є планувальником, і сценарій детермінований.

Рендерер і публікатор для перевірки ретраїв підміняються fake-класами за протоколами з m2-l07, як у m3-l04: без наслідування, mypy перевіряє форму. Пауза між спробами приходить у `Worker` параметром `sleep` (m7-l03), тож тест передає записувач, який нічого не чекає, а лише запам'ятовує затримки.

```python
# tests/test_worker.py (фрагмент)
class FlakyRenderer:
    """Fails the first `failures` calls, then renders the title."""

    def __init__(self, failures: int) -> None:
        self.failures = failures

    def render(self, config: FormConfig) -> str:
        if self.failures:
            self.failures -= 1
            raise RuntimeError("renderer crashed")
        return config.title


class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[tuple[str, int], str] = {}

    def publish(self, form_id: str, version: int, html: str) -> Path:
        self.pages[form_id, version] = html
        return Path(form_id, str(version), "index.html")


class RecordingSleep:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, delay: float) -> None:
        self.delays.append(delay)


@pytest.fixture
async def job_id(client, make_form) -> int:
    await client.post("/forms", json=make_form(title="Sign up"))
    response = await client.post("/forms/signup/build")
    assert response.status_code == 202
    return response.json()["id"]


async def test_retries_without_real_sleep(app, client, job_id):
    sleep = RecordingSleep()
    publisher = MemoryPublisher()
    worker = Worker(
        app.state.store, app.state.queue, app.state.events,
        FlakyRenderer(failures=2), publisher, sleep=sleep,
    )

    await worker.run_once()

    job = (await client.get(f"/jobs/{job_id}")).json()
    assert (job["status"], job["attempts"]) == ("done", 3)
    assert sleep.delays == [0.5, 1.0]
    assert publisher.pages == {("signup", 1): "Sign up"}
```

Окремий `Worker` з m7-l03 тут бере справжні `store`, `queue` і `events` із запущеного застосунку і власні fake-рендерер, публікатор і сон. Задачу поклав ендпоінт, статус читає ендпоінт, а між ними один крок воркера з повним ланцюжком спроб. Тест перевіряє і результат (`done`, три спроби, сторінка в `MemoryPublisher`), і саму експоненційну затримку `[0.5, 1.0]`, і виконується за мілісекунди.

`BackgroundTasks` (m7-l03) у тестах взагалі не потребують окремих зусиль. Starlette виконує їх після відправки відповіді, але в межах того самого виклику застосунку, а `ASGITransport` повертає `Response`, лише коли виклик завершився цілком. Тому в `test_background_task_already_ran` вище список `sent` уже заповнений одразу після `await client.post(...)`. Зворотний бік: повільна фонова задача непомітно сповільнює тест, бо тест чекає її разом з відповіддю.

<!-- task: q4 -->

## Що перевіряти у відповіді

Статус, тіло й заголовки, і для помилок точний формат, а не лише код. `response.json()` повертає звичайні dict і list, тож порівняння з очікуваним значенням через `==` дає повний diff pytest з m3-l03. `response.headers` нечутливий до регістру, як `Headers` у fetch: `headers["x-request-id"]` знаходить `X-Request-ID`. Помилка 404 у капстоуні має єдиний формат з m7-l02 (`HTTPException` з роутера стає кодом `http_404`), і тест фіксує його цілком.

```python
async def test_unknown_form_is_404(client):
    response = await client.get("/forms/nope")
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "http_404", "message": "form 'nope' not found", "fields": []}
    }


async def test_request_id_header(client):
    response = await client.get("/health", headers={"X-Request-ID": "abc"})
    assert response.headers["x-request-id"] == "abc"
    assert response.headers["content-type"] == "application/json"
```

Валідацію конфігу через API тестує таблиця `parametrize` з m3-l03. Рядок таблиці описує, що змінено у валідному конфігу з фабрики `make_form` (factory fixture з m3-l03), і яке поле з яким кодом очікується у відповіді. Перевіряється весь список полів, а не "є хоча б одна помилка": конфіг, що зламався з іншої причини, дасть інший список і червоний тест. Шлях поля збігається з `loc` Pydantic без провідного `body`, і для дискримінованого union у ньому стоїть тег варіанта: `elements.0.input.label`.

```python
@pytest.mark.parametrize(
    ("overrides", "path", "code"),
    [
        pytest.param({"title": ""}, "title", "string_too_short", id="empty-title"),
        pytest.param({"id": "Sign Up"}, "id", "string_pattern_mismatch", id="bad-id"),
        pytest.param({"elements": None}, "elements", "list_type", id="elements-null"),
        pytest.param(
            {"elements": [{"type": "select", "id": "s"}]},
            "elements.0",
            "union_tag_invalid",
            id="unknown-type",
        ),
        pytest.param(
            {"elements": [{**EMAIL, "placeholder": "x"}]},
            "elements.0.input.placeholder",
            "extra_forbidden",
            id="extra-key",
        ),
        pytest.param(
            {"elements": [{**EMAIL, "label": ""}]},
            "elements.0.input.label",
            "string_too_short",
            id="empty-label",
        ),
    ],
)
async def test_invalid_config_is_422(
    client, make_form, overrides: dict[str, Any], path: str, code: str
):
    response = await client.post("/forms", json=make_form(**overrides))
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert [(f["path"], f["code"]) for f in error["fields"]] == [(path, code)]


async def test_body_is_not_json(client):
    response = await client.post(
        "/forms", content=b"{oops", headers={"content-type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["fields"][0]["code"] == "json_invalid"
```

<!-- task: t1 -->

<!-- task: t2 -->

<!-- task: t3 -->

Обробник `Exception`, що віддає 500 у власному форматі (m7-l02), тестується з одним налаштуванням транспорту. `ASGITransport(raise_app_exceptions=True)` за замовчуванням піднімає виняток з обробника в тест, навіть коли обробник помилок уже сформував відповідь: так падіння в коді видно в тесті з повним traceback, а не як безлике 500. Щоб перевірити саму відповідь 500, прапорець вимикають; у `TestClient` той самий прапорець зветься `raise_server_exceptions`.

```python
# test_500.py
import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()


@app.exception_handler(Exception)
async def on_crash(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse({"error": {"code": "internal_error", "message": "try later"}}, status_code=500)


@app.get("/boom")
async def boom() -> None:
    raise RuntimeError("renderer crashed")


@pytest.mark.anyio
@pytest.mark.parametrize("raise_app_exceptions", [True, False])
async def test_500_format(raise_app_exceptions):
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=raise_app_exceptions)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
```

```text
test_500.py:16: in boom
    raise RuntimeError("renderer crashed")
E   RuntimeError: renderer crashed
=========================== short test summary info ============================
FAILED test_500.py::test_500_format[asyncio-True] - RuntimeError: renderer cr...
1 failed, 1 passed in 0.49s
```

OpenAPI-схему іноді фіксують snapshot-тестом на весь `/openapi.json` (плагін `syrupy`), щоб помітити ненавмисну зміну контракту для фронтенду; у капстоуні достатньо тесту на список шляхів, бо повний знімок оновлюють не дивлячись, як `toMatchSnapshot` у Jest.

```python
async def test_openapi_lists_routes(client):
    paths = (await client.get("/openapi.json")).json()["paths"]
    assert sorted(paths) == [
        "/forms", "/forms/{form_id}", "/forms/{form_id}/build", "/health", "/jobs/{job_id}",
    ]
```

## WebSocket і повний сценарій генерації

WebSocket тестується лише через `TestClient`: `websocket_connect(url)` це контекстний менеджер, усередині якого `receive_json()` чекає наступне повідомлення, а закриття з'єднання сервером перетворюється на `WebSocketDisconnect` з кодом закриття. Тест синхронний, тож фікстура для нього окрема: `with TestClient(create_app(settings))` запускає lifespan в потоці порталу. Джерело подій у тесті підміняє `dependency_overrides[get_hub]`: ендпоінт з m7-l04 бере `JobEvents` через `Depends`, і fake, який просто віддає заготовлені події, перевіряє протокол ендпоінта без воркера і без гонок.

```python
# tests/test_ws.py (фрагмент)
class ScriptedHub:
    """Fake event source: replays prepared events instead of a real worker."""

    def __init__(self, *events: ServerEvent) -> None:
        self.events = events

    async def watch(
        self, job_id: str, first: ServerEvent | None = None
    ) -> AsyncIterator[ServerEvent]:
        if first is not None:
            yield first
        for event in self.events:
            yield event


@pytest.fixture
def sync_client(settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings)
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def queue_job(client: TestClient, form: dict) -> str:
    client.post("/forms", json=form)
    return str(client.post(f"/forms/{form['id']}/build").json()["id"])


def test_ws_relays_events_until_done(sync_client, make_form):
    job_id = queue_job(sync_client, make_form())
    script = ScriptedHub(
        Running(job_id=job_id, page=1, total=1),
        Done(job_id=job_id, url="/sites/signup/1/", finished_at=FINISHED),
    )
    sync_client.app.dependency_overrides[get_hub] = lambda: script

    with sync_client.websocket_connect(f"/ws/jobs/{job_id}") as ws:
        types = [ws.receive_json()["type"] for _ in range(3)]
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_json()

    assert types == ["queued", "running", "done"]
    assert exc_info.value.code == 1000


def test_ws_unknown_job_is_rejected(sync_client):
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with sync_client.websocket_connect("/ws/jobs/nope"):
            pass
    assert exc_info.value.code == 4404
```

Перший статус `queued` ендпоінт прочитав зі сховища й передав у `watch(job_id, first)` (m7-l04, p2), `running` і `done` прийшли з fake. Тест з реальним воркером теж потрібен, але він перевіряє інше: що всі частини з'єднані. Воркер з `workers=1` працює в потоці порталу паралельно з тестом, і задача може завершитись раніше, ніж клієнт під'єднається; тоді ендпоінт одразу віддасть `done` і закриє з'єднання. Тому такий тест читає повідомлення до термінального статусу і перевіряє лише його, і позначений маркером `slow`.

```python
@pytest.mark.slow
def test_ws_with_real_worker(tmp_path, make_form):
    settings = Settings(db_path=tmp_path / "fb.db", out_dir=tmp_path / "out", workers=1)
    with TestClient(create_app(settings)) as client:
        job_id = queue_job(client, make_form())
        with client.websocket_connect(f"/ws/jobs/{job_id}") as ws:
            last = ws.receive_json()
            while last["type"] not in {"done", "failed"}:
                last = ws.receive_json()
    assert last["type"] == "done"
    assert (tmp_path / "out" / "signup" / "1" / "index.html").exists()
```

Повний сценарій капстоуну це один асинхронний тест без жодного мока: форма створюється через API, build ставить задачу, один крок справжнього воркера рендерить і публікує через справжній `StaticPublisher` з m6-l01, статус читається через API, а сторінка лежить у `tmp_path` за ключем `<config_id>/<version>/index.html`.

```python
async def test_full_scenario(app, client, job_id, settings):
    assert (await client.get(f"/jobs/{job_id}")).json()["status"] == "queued"

    await app.state.worker.run_once()

    job = (await client.get(f"/jobs/{job_id}")).json()
    assert job["status"] == "done"
    assert job["url"] == "/sites/signup/1/"
    page = settings.out_dir / "signup" / "1" / "index.html"
    assert page.read_text(encoding="utf-8") == "<h1>Sign up</h1>"
```

> **JS-аналог.** supertest WebSocket не тестує, і в Node для цього піднімають справжній сервер з `ws`-клієнтом або беруть окремий superwstest. Тут `websocket_connect` працює in-process так само, як HTTP. Для асинхронних WS-тестів є сторонній `httpx-ws` з власним транспортом, але `TestClient` покриває потреби капстоуну без нової залежності.

## Структура тестів, маркери й coverage

Тести капстоуну розкладені за ресурсами API, спільне живе в `conftest.py`, а повільні позначені маркером.

```text
tests/
├── conftest.py          # anyio_backend, settings, app, client, make_form
├── test_api.py          # CRUD форм, заголовки, OpenAPI (m7-l01, m7-l03)
├── test_api_errors.py   # єдиний формат помилок: 404, 422, 500, middleware (m7-l02)
├── test_worker.py       # build, повний сценарій, ретраї, failed (m7-l03)
└── test_ws.py           # WebSocket і хаб JobEvents напряму, slow з реальним воркером (m7-l04)
```

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = ["--import-mode=importlib", "--strict-markers"]
anyio_mode = "auto"
markers = ["slow: real worker tasks and timing; deselect with -m 'not slow'"]
```

```bash
uv run pytest -v
uv run pytest -q -m "not slow"
```

```text
tests/test_api.py::test_create_and_read PASSED                           [  5%]
tests/test_api.py::test_versions_grow PASSED                             [ 10%]
tests/test_api.py::test_request_id_header PASSED                         [ 15%]
tests/test_api.py::test_openapi_lists_routes PASSED                      [ 21%]
tests/test_api_errors.py::test_unknown_form_is_404 PASSED                [ 26%]
tests/test_api_errors.py::test_invalid_config_is_422[empty-title] PASSED [ 31%]
tests/test_api_errors.py::test_invalid_config_is_422[bad-id] PASSED      [ 36%]
tests/test_api_errors.py::test_invalid_config_is_422[elements-null] PASSED [ 42%]
tests/test_api_errors.py::test_invalid_config_is_422[unknown-type] PASSED [ 47%]
tests/test_api_errors.py::test_invalid_config_is_422[extra-key] PASSED   [ 52%]
tests/test_api_errors.py::test_invalid_config_is_422[empty-label] PASSED [ 57%]
tests/test_api_errors.py::test_body_is_not_json PASSED                   [ 63%]
tests/test_worker.py::test_build_unknown_form_is_404 PASSED              [ 68%]
tests/test_worker.py::test_full_scenario PASSED                          [ 73%]
tests/test_worker.py::test_retries_without_real_sleep PASSED             [ 78%]
tests/test_worker.py::test_gives_up_after_max_attempts PASSED            [ 84%]
tests/test_ws.py::test_ws_relays_events_until_done PASSED                [ 89%]
tests/test_ws.py::test_ws_unknown_job_is_rejected PASSED                 [ 94%]
tests/test_ws.py::test_ws_with_real_worker PASSED                        [100%]

============================== 19 passed in 0.28s ==============================

..................                                                       [100%]
18 passed, 1 deselected in 0.25s
```

Дев'ятнадцять тестів, включно з SQLite, файлами, воркером і WebSocket, проходять менш ніж за третину секунди: жодного порту, жодного `sleep`. Coverage з m3-l04 тут корисний не відсотком, а тим, що показує, що саме підмінили fake-об'єкти. Звіт з гілками до появи прямого тесту хаба. Його знято на скороченому дзеркалі (розділ "Для капстоуну"), де хаб ще жив в окремому `events.py` під іменем `EventHub` з методом `subscribers()`; у капстоуні це `hub.py`, `JobEvents` і `watchers()`, тож номери рядків у вас будуть інші:

```bash
uv run pytest -q --cov=formbuilder --cov-branch --cov-report=term-missing:skip-covered
```

```text
Name                            Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------------------------
src/formbuilder/api/errors.py      25      0      4      1    97%   23->25
src/formbuilder/api/jobs.py        28      1      8      1    94%   20
src/formbuilder/events.py          26      9      4      1    60%   17, 21, 30-37
src/formbuilder/settings.py        12      1      0      0    92%   18
---------------------------------------------------------------------------
TOTAL                             296     11     24      3    95%
```

Рядки 30–37 `events.py` це сам стрімінг подій у `EventHub`: цикл, що віддає події підписнику, і відписка в `finally`. Їх не виконав жоден тест. WS-тест з fake підмінив хаб повністю, а тест з реальним воркером встигав отримати `done` зі сховища раніше, ніж воркер щось опублікував, тож і рядок 21 (`put_nowait` підписникам) лишився червоним. Рядок 17 це `subscribers()`, лічильник підписників для тесту нижче. 95% загалом виглядає добре, а справжній код доставки статусів не перевірений нічим. Закривається це прямим асинхронним тестом хаба, без API.

```python
# tests/test_ws.py (тест хаба напряму)
from datetime import UTC, datetime

from formbuilder.hub import Done, JobEvents, Running

FINISHED = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)


async def test_hub_streams_until_terminal_status():
    hub = JobEvents()
    events = hub.watch("j1")  # m7-l04: підписка вже відбулась
    hub.publish(Running(job_id="j1", page=1, total=2))
    hub.publish(Done(job_id="j1", url="/sites/j1/1/", finished_at=FINISHED))
    hub.publish(Running(job_id="j1", page=2, total=2))

    assert [e.type async for e in events] == ["running", "done"]
    assert hub.watchers("j1") == 0
```

Тест працює лише тому, що `watch` з m7-l04 підписує в момент виклику: три події опубліковані до першої ітерації, і жодна не загубилась.

```text
Name                            Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------------------------
src/formbuilder/api/errors.py      25      0      4      1    97%   23->25
src/formbuilder/api/jobs.py        28      1      8      1    94%   20
src/formbuilder/settings.py        12      1      0      0    92%   18
---------------------------------------------------------------------------
TOTAL                             296      2     24      2    99%

9 files skipped due to complete coverage.
20 passed in 0.41s
```

> **Під капотом.** Coverage рахує і рядки, виконані в потоці порталу `TestClient`: за замовчуванням coverage.py працює з `concurrency = thread` і ставить свій трасувальник у кожен новий потік. Це видно у звіті: у `api/jobs.py` червоний лише рядок 20 (404 у `GET /jobs`), а WebSocket-обробник, який виконувався тільки в потоці порталу, покритий. Тому WS-тести зараховуються нарівні з асинхронними, а червоні рядки хаба означають, що код справді не виконувався, а не що його не побачив інструмент.

## Для капстоуну

Набір тестів вище і є тестами капстоуну: прогін іде на скороченому дзеркалі API з m7-l01–m7-l04 (той самий `create_app(settings)`, `SqliteJobStore` з m6-l08, `Worker` з інʼєктованим `sleep` з m7-l03, хаб `JobEvents` з m7-l04, обробники помилок з єдиним форматом m7-l02). Повний `conftest.py`, від якого відштовхуються всі три проєктні завдання:

```python
# tests/conftest.py
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI

from formbuilder.api.app import create_app
from formbuilder.settings import Settings

type Raw = dict[str, Any]


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Everything the app writes goes into this test's tmp_path; no worker tasks."""
    return Settings(db_path=tmp_path / "fb.db", out_dir=tmp_path / "out", workers=0)


@pytest.fixture
async def app(settings: Settings) -> AsyncIterator[FastAPI]:
    """The real app with its lifespan running, the way uvicorn would start it."""
    app = create_app(settings)
    async with LifespanManager(app):
        yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def make_form() -> Callable[..., Raw]:
    """Factory: a fresh valid config; keyword arguments replace top-level keys."""

    def _make(**overrides: Any) -> Raw:
        form: Raw = {
            "id": "signup",
            "title": "Sign up",
            "elements": [
                {"type": "input", "id": "email", "name": "email", "label": "Email"},
                {"type": "button", "id": "send", "label": "Send"},
            ],
        }
        form.update(overrides)
        return form

    return _make
```

> **Для капстоуну.** Нових dev-залежностей дві: `uv add --dev asgi-lifespan httpx2`. `anyio` окремо не додається, він приходить з FastAPI. Якщо ваш `lifespan` у m7-l01 читає `get_settings()` напряму, перш ніж писати тести, переведіть його на фабрику `create_app(settings: Settings | None = None)`, яка бере `settings or get_settings()`: інакше перша ж фікстура на `tmp_path` пише базу в робочу директорію.

<!-- task: p1 -->

<!-- task: p2 -->

<!-- task: p3 -->

## Типові помилки JS-розробника

1. **Ланцюжки в стилі supertest.** Шукають `.expect(201).expect("Content-Type", /json/)` або пишуть обгортку з такими методами. Правильно: `Response` і голі `assert`, які дають повний diff.

   ```python
   assert response.status_code == 201
   assert response.json() == {"id": "signup", "version": 1}
   ```

2. **`beforeAll` з реальним сервером на порту.** Запускають uvicorn у фоновому потоці й ходять на `localhost:8000`. Тести повільні, порт зайнятий у паралельному CI, а помилка застосунку приходить як 500 без traceback. Правильно: `ASGITransport` або `TestClient` in-process.

   ```python
   transport = httpx.ASGITransport(app=app)
   async with httpx.AsyncClient(transport=transport, base_url="http://test") as client: ...
   ```

3. **Мок HTTP-бібліотеки замість залежності.** Звичка `jest.mock("axios")` чи nock перетворюється на `patch("httpx.AsyncClient.post")` або мок сховища всередині обробника. Правильно: `app.dependency_overrides[get_x]` для того, що приходить через `Depends`, і fake-об'єкти, передані у фабрику чи `Worker`.

   ```python
   app.dependency_overrides[get_hub] = lambda: ScriptedHub(*events)
   ```

4. **Jest fake timers для фонових задач.** Шукають `useFakeTimers` і `advanceTimersByTime`, щоб "прокрутити" ретраї. Правильно: `sleep` параметром і крок воркера вручну.

   ```python
   worker = Worker(..., sleep=RecordingSleep())
   await worker.run_once()
   ```

5. **Глобальний `app` і перевизначення без прибирання.** Імпортують модульний `app` в усі тести і пишуть у його `dependency_overrides`; наступний тест отримує чуже перевизначення. Правильно: фабрика `create_app(settings)` у фікстурі і `clear()` у teardown.

   ```python
   app = create_app(settings)
   async with LifespanManager(app):
       yield app
   app.dependency_overrides.clear()
   ```

6. **Очікування, що клієнт сам підніме lifespan.** supertest піднімає весь застосунок, тож здається, що `ASGITransport` теж. Правильно: `LifespanManager` для `AsyncClient`, `with TestClient(app)` для синхронного клієнта.

   ```python
   with TestClient(app) as client:   # без with lifespan не стартує
       client.get("/forms/signup")
   ```

7. **Асинхронний тест без плагіна чи маркера.** Пишуть `async def test_...` як `async () => {}` у Jest і отримують "async def functions are not natively supported". Правильно: `anyio_mode = "auto"` у конфігу і `anyio_backend` зі `scope="session"`.

   ```toml
   [tool.pytest.ini_options]
   anyio_mode = "auto"
   ```

## Підсумок

- `ASGITransport` викликає застосунок як функцію в тому самому процесі; порт і сервер не потрібні. `base_url="http://test"` обов'язковий за змістом.
- `AsyncClient` для тестів, що `await`-ять поруч із запитами (воркер, async-фікстури); `TestClient` для WebSocket і синхронних тестів, застосунок у нього в окремому потоці й циклі.
- Starlette 1.x хоче `httpx2` для `TestClient`; `AsyncClient` лишається на httpx.
- Капстоун на плагіні anyio: `anyio_mode = "auto"`, `anyio_backend` зі `scope="session"`; новий цикл подій на кожен тест.
- `ASGITransport` lifespan не запускає; `LifespanManager` або `with TestClient(app)`.
- Застосунок через фабрику `create_app(settings)` з `tmp_path`: lifespan не бачить `dependency_overrides`.
- `dependency_overrides` шукає за функцією з `Depends`, не діє на прямі виклики і живе на застосунку до `clear()`.
- Воркер у тестах не запускається сам: `workers=0` і `await worker.run_once()`; `sleep` інʼєктується. `BackgroundTasks` виконані до повернення відповіді.
- Перевіряти точний формат помилок і повний список полів 422; 500 з `raise_app_exceptions=False`.
- Coverage з гілками показує код, який замінили fake-об'єкти; його закривають прямими тестами.

## Що далі

m7-l06 додає `JinjaRenderer` як ще одну реалізацію `Renderer`: його тестуватимуть порівнянням з еталонним HTML у `tests/fixtures`, а повний сценарій з цього уроку почне перевіряти справжню розмітку замість `<h1>`. У m7-l07 `create_app` і `Settings` з цього уроку стануть точкою входу uvicorn у Docker, а `uv run pytest -m "not slow"` зручною командою для шару збірки образу.
