---
id: m7-l04
module: m7-fastapi
title: "WebSocket у FastAPI для статусу генерації"
summary: "Учень пише WebSocket-ендпоінт FastAPI, який стрімить типізовані події статусу з асинхронного генератора, паралельно слухає клієнта в TaskGroup, розсилає події кільком вкладкам без кімнат socket.io, коректно прибирає з'єднання при розриві й тестує все через TestClient.websocket_connect."
duration_min: 90
prerequisites: [m7-l03]
---

## Ендпоінт: accept, receive, send і WebSocketDisconnect

WebSocket-ендпоінт у FastAPI це корутина під декоратором `@app.websocket(path)`, яка отримує об'єкт `WebSocket` і живе стільки, скільки живе з'єднання. Немає ні `io.on("connection")`, ні колбеків на події: один виклик функції дорівнює одному з'єднанню, а все, що в socket.io роблять обробники, тут робиться послідовним кодом з `await`. Сам `WebSocket` прийшов зі Starlette, FastAPI лише реекспортує його і додає параметри шляху, `Depends` і валідацію.

```ts
io.on("connection", (socket) => {
  const jobId = socket.handshake.query.jobId as string;
  socket.on("echo", (text) => socket.emit("echo", { jobId, echo: text }));
  socket.on("disconnect", (reason) => console.log("disconnect", reason));
});
```

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient

app = FastAPI()


@app.websocket("/ws/jobs/{job_id}")
async def job_socket(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    print("server: accepted", job_id)
    try:
        while True:
            text = await websocket.receive_text()
            print("server: got", repr(text))
            await websocket.send_json({"job_id": job_id, "echo": text})
    except WebSocketDisconnect as exc:
        print("server: disconnect, code", exc.code)


client = TestClient(app)
with client.websocket_connect("/ws/jobs/landing") as ws:
    ws.send_text("hello")
    print("client:", ws.receive_json())
    ws.send_text("again")
    print("client:", ws.receive_json())
print("client: closed")
```

```text
server: accepted landing
server: got 'hello'
client: {'job_id': 'landing', 'echo': 'hello'}
server: got 'again'
client: {'job_id': 'landing', 'echo': 'again'}
server: disconnect, code 1000
client: closed
```

Розходжень три, і всі принципові. У socket.io є іменовані події, кімнати, acknowledgement-колбеки, автоматичне перепідключення й буферизація на час розриву. У сирому WebSocket (RFC 6455) є лише повідомлення: текстові або бінарні кадри без імені, і закриття з числовим кодом (close code, термін RFC). Усе інше, від поля `type` до кімнат, ви будуєте самі, і далі в уроці саме це й робиться. Друге: відключення клієнта це не подія, а виняток `WebSocketDisconnect`, який вилітає з `receive_*` у тому місці, де корутина чекала. Третє: `TestClient` запускає застосунок без мережі й без uvicorn, тому всі приклади в уроці це звичайні скрипти, а клієнтська сторона синхронна.

Життєвий цикл з'єднання суворий, і Starlette його перевіряє. Спершу HTTP-запит з `Upgrade: websocket` приходить до ендпоінта; поки ви не викликали `accept()`, рукостискання (handshake, термін протоколу) не завершене, і дозволено лише прийняти з'єднання або закрити його з кодом. Після `accept()` можна читати й писати. Після закриття з будь-якого боку з'єднання мертве, а повторна спроба читати чи писати дає помилку.

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient

app = FastAPI()


@app.websocket("/early")
async def early(websocket: WebSocket) -> None:
    await websocket.send_json({"status": "queued"})


@app.websocket("/reject")
async def reject(websocket: WebSocket) -> None:
    await websocket.close(code=1008, reason="unknown job")


@app.websocket("/once")
async def once(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"status": "done"})
    await websocket.close()


client = TestClient(app)

try:
    with client.websocket_connect("/early") as ws:
        pass
except RuntimeError as exc:
    print("early:", exc)

try:
    with client.websocket_connect("/reject") as ws:
        pass
except WebSocketDisconnect as exc:
    print("reject:", exc.code, exc.reason)

with client.websocket_connect("/once") as ws:
    print("once:", ws.receive_json())
    try:
        ws.receive_json()
    except WebSocketDisconnect as exc:
        print("once: closed by server, code", exc.code)
```

```text
early: Expected ASGI message "websocket.accept", "websocket.close" or "websocket.http.response.start", but got 'websocket.send'
reject: 1008 unknown job
once: {'status': 'done'}
once: closed by server, code 1000
```

> **Під капотом.** Між uvicorn і FastAPI ходять не кадри WebSocket, а словники ASGI (ASGI, Asynchronous Server Gateway Interface, офіційна специфікація, наступник WSGI): `{"type": "websocket.connect"}`, `{"type": "websocket.accept"}`, `{"type": "websocket.send", "text": ...}`, `{"type": "websocket.disconnect", "code": 1000}`. `WebSocket` у Starlette це обгортка, що стежить за станом `CONNECTING → CONNECTED → DISCONNECTED` окремо для клієнта й застосунку і кидає `RuntimeError`, якщо повідомлення не відповідає стану. Звідси й текст помилки вище: до `accept` дозволені лише три типи повідомлень.

Закриття до `accept` (`/reject`) у реальному uvicorn перетворюється на HTTP 403 на рукостисканні, і код `1008` бачить лише `TestClient`; деталі в розділі про токен. Коди закриття після `accept` варто знати напам'ять, бо фронтенд бачить саме їх у `CloseEvent.code`: `1000` нормальне закриття, `1001` клієнт пішов (закрив вкладку), `1006` з'єднання обірвалося без кадру закриття, `1008` порушення політики (невідома задача, поганий токен), `1011` помилка сервера. Константи є в `fastapi.status`: `WS_1008_POLICY_VIOLATION`, `WS_1011_INTERNAL_ERROR`.

> **Пастка.** Обробник, який просто повернув керування без `await websocket.close()`, не закриває з'єднання чисто. Реальний uvicorn обриває TCP без кадру закриття, і браузер бачить `1006`, як при падінні мережі. `TestClient` ще гірше: клієнтський `receive_json()` чекає вічно, і тест зависає. Завершуйте ендпоінт явним `close()` з кодом.

```python
@app.websocket("/noclose")
async def noclose(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"status": "done"})
    # no close(): uvicorn drops the TCP connection
```

```text
client: {"status":"done"}
client: ConnectionClosedError ConnectionClosedError(None, None, None)
```

Це вивід клієнта на бібліотеці `websockets` проти справжнього uvicorn: `None` замість кадру закриття означає саме обрив. Друга половина тієї ж пастки: після `WebSocketDisconnect` цикл читання треба покинути. Повторний `receive_text()` на вже закритому з'єднанні у Starlette 1.x кидає `WebSocketDisconnected`, підклас `RuntimeError`, а не ще один `WebSocketDisconnect`, тому `while True` з `except WebSocketDisconnect: continue` усередині перетворюється на падіння.

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient

app = FastAPI()


@app.websocket("/twice")
async def twice(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        await websocket.receive_text()
    except WebSocketDisconnect:
        print("first: WebSocketDisconnect")
    try:
        await websocket.receive_text()
    except Exception as exc:
        print("second:", type(exc).__name__, exc)


with TestClient(app).websocket_connect("/twice"):
    pass
```

```text
first: WebSocketDisconnect
second: WebSocketDisconnected Cannot call "receive" once a disconnect message has been received.
```

<!-- task: q1 -->

## Протокол: один канал і поле `type`

У socket.io тип повідомлення це ім'я події: `socket.emit("status", data)` і `socket.on("status", cb)`. У WebSocket імені немає, є лише рядок. Тому протокол (message protocol, загальний термін) пишеться так само, як контракт REST API: кожне повідомлення це JSON-об'єкт з полем-тегом `type`, а набір допустимих повідомлень це discriminated union (термін документації Pydantic, у TS його називають так само). Це той самий `Annotated[A | B, Field(discriminator="type")]`, що й дерево елементів форми в m2-l09, тільки тепер для подій.

```ts
type ServerEvent =
  | { v: 1; job_id: string; type: "queued" }
  | { v: 1; job_id: string; type: "running"; page: number; total: number }
  | { v: 1; job_id: string; type: "done"; url: string; finished_at: string }
  | { v: 1; job_id: string; type: "failed"; error: string };

ws.onmessage = (e) => {
  const event: ServerEvent = JSON.parse(e.data); // trust, no runtime check
  if (event.type === "running") showProgress(event.page, event.total);
};
```

```python live
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError


class EventBase(BaseModel):
    v: Literal[1] = 1
    job_id: str


class Queued(EventBase):
    type: Literal["queued"] = "queued"


class Running(EventBase):
    type: Literal["running"] = "running"
    page: int
    total: int


class Done(EventBase):
    type: Literal["done"] = "done"
    url: str
    finished_at: datetime


class Failed(EventBase):
    type: Literal["failed"] = "failed"
    error: str


ServerEvent = Annotated[Queued | Running | Done | Failed, Field(discriminator="type")]
# --- the definitions above are events.py in the following examples

done = Done(job_id="landing", url="/sites/landing/",
            finished_at=datetime(2026, 10, 18, 12, 0, tzinfo=UTC))
print(done.model_dump_json())
print(done.model_dump())
print(done.model_dump(mode="json"))

events = TypeAdapter(ServerEvent)
print(repr(events.validate_json('{"type": "running", "job_id": "landing", "page": 2, "total": 5}')))
try:
    events.validate_python({"type": "paused", "job_id": "landing"})
except ValidationError as exc:
    print(exc.errors()[0]["type"], exc.errors()[0]["msg"])
```

```text
{"v":1,"job_id":"landing","type":"done","url":"/sites/landing/","finished_at":"2026-10-18T12:00:00Z"}
{'v': 1, 'job_id': 'landing', 'type': 'done', 'url': '/sites/landing/', 'finished_at': datetime.datetime(2026, 10, 18, 12, 0, tzinfo=datetime.timezone.utc)}
{'v': 1, 'job_id': 'landing', 'type': 'done', 'url': '/sites/landing/', 'finished_at': '2026-10-18T12:00:00Z'}
Running(v=1, job_id='landing', type='running', page=2, total=5)
union_tag_invalid Input tag 'paused' found using 'type' does not match any of the expected tags: 'queued', 'running', 'done', 'failed'
```

Різниця з TS у тому, що тип тут існує під час виконання. `TypeAdapter(ServerEvent)` це валідатор для анотації, яка не є моделлю (union сам по собі не має `model_validate`), і він дивиться на `type`, обирає одну модель і перевіряє лише її. Тим самим кодом ви валідуєте вхідні повідомлення від клієнта, а в тестах розбираєте вихідні. Поле `v` це версія протоколу: `Literal[1]` з дефолтом коштує шість байтів `"v":1,` у кожному повідомленні, зате коли зміниться форма подій, клієнт старої версії отримає зрозумілу помилку замість тихого `undefined`. Альтернатива для великих змін це новий шлях `/ws/v2/jobs/{id}`, поки старий ще живий.

> **Пастка.** `websocket.send_json(data)` усередині викликає `json.dumps`, а не серіалізатор Pydantic. Модель туди передавати не можна, і навіть `model_dump()` падає на першому `datetime`. Для моделей пишіть `send_text(event.model_dump_json())`; `send_json` лишається для готових словників з примітивами.

```python
from datetime import UTC, datetime

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

from events import Done

app = FastAPI()
done = Done(job_id="landing", url="/sites/landing/",
            finished_at=datetime(2026, 10, 18, 12, 0, tzinfo=UTC))


@app.websocket("/ws/{variant}")
async def ws_endpoint(websocket: WebSocket, variant: str) -> None:
    await websocket.accept()
    try:
        if variant == "model":
            await websocket.send_json(done)
        elif variant == "dump":
            await websocket.send_json(done.model_dump())
        else:
            await websocket.send_text(done.model_dump_json())
    except TypeError as exc:
        await websocket.send_json({"server_error": str(exc)})
    await websocket.close()


client = TestClient(app)
for variant in ["model", "dump", "json"]:
    with client.websocket_connect(f"/ws/{variant}") as ws:
        print(variant, "->", ws.receive_json())
```

```text
model -> {'server_error': 'Object of type Done is not JSON serializable'}
dump -> {'server_error': 'Object of type datetime is not JSON serializable'}
json -> {'v': 1, 'job_id': 'landing', 'type': 'done', 'url': '/sites/landing/', 'finished_at': '2026-10-18T12:00:00Z'}
```

У HTTP-ендпоінтах FastAPI серіалізує модель-відповідь сам, через `response_model` (m7-l01). У WebSocket цього шару немає: те, що ви передали в `send_*`, іде в мережу як є. Тому серіалізацію й валідацію в обидва боки тримають в одному модулі з моделями, а ендпоінт лише перекладає `model_dump_json()` у `send_text` і `validate_json` з `receive_text`.

<!-- task: t1 -->

Вхідні повідомлення валідуються тим самим способом, але з іншою реакцією на помилку. Невалідна подія від сервера означає баг, і тест має впасти. Невалідне повідомлення від клієнта означає, що клієнт старий, зламаний або зловмисний, і ендпоінт не повинен через це падати: він відповідає подією `{"type": "error", ...}` і живе далі. Необроблений `ValidationError` в ендпоінті вбиває з'єднання: uvicorn 0.54 пише в лог `Exception in ASGI application` і обриває TCP без кадру закриття, тож фронтенд бачить `1006` замість пояснення.

<!-- task: t2 -->

## Стрімінг статусів з асинхронного генератора

У m5-l06 ви написали `watch(job)`: асинхронний генератор, який віддає події задачі й сам завершується на `done` чи `failed`. Ендпоінт статусу це три рядки навколо нього: прийняти з'єднання, `async for` по подіях з `send_text` на кожну, закрити з `1000`. Завершення потоку задає джерело, а не ендпоінт: генератор повернувся, цикл скінчився, з'єднання закрите. Нижче `watch` імітує воркер через `asyncio.sleep`; у капстоуні на його місці буде підписка на події воркера з m7-l03.

```python
import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

from events import Done, Queued, Running

app = FastAPI()


async def watch(job_id: str) -> AsyncGenerator[Queued | Running | Done, None]:
    yield Queued(job_id=job_id)
    for page in (1, 2):
        await asyncio.sleep(0.01)
        yield Running(job_id=job_id, page=page, total=2)
    yield Done(job_id=job_id, url=f"/sites/{job_id}/",
               finished_at=datetime(2026, 10, 18, 12, 0, tzinfo=UTC))


@app.websocket("/ws/jobs/{job_id}")
async def job_status(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    async for event in watch(job_id):
        await websocket.send_text(event.model_dump_json())
    await websocket.close()


client = TestClient(app)
with client.websocket_connect("/ws/jobs/landing") as ws:
    while True:
        event = ws.receive_json()
        print({k: v for k, v in event.items() if k in ("type", "page", "url")})
        if event["type"] in {"done", "failed"}:
            break
```

```text
{'type': 'queued'}
{'type': 'running', 'page': 1}
{'type': 'running', 'page': 2}
{'type': 'done', 'url': '/sites/landing/'}
```

> **JS-аналог.** `async for event of watch(jobId)` у Node працює так само, але в socket.io-сервері ви б так не писали: там прийнято `emitter.on("status", (e) => socket.emit("status", e))`, тобто колбек, який хтось викликає. Тут потік подій витягується (pull) споживачем: ендпоінт сам просить наступну подію, коли готовий її відправити. Звідси й природний backpressure (жаргон спільноти: зворотний тиск повільного споживача на джерело): поки `send_text` чекає повільного клієнта, генератор стоїть на `yield`.

Цей ендпоінт має ваду, яку `TestClient` приховує. Сервер дізнається про відключення клієнта лише тоді, коли сам щось робить із з'єднанням. Ендпоінт, який лише пише, не читає, і поки задача рендерить наступну сторінку, з'єднання вже може бути мертвим. Помилка виникне на наступному `send`: uvicorn кидає `ClientDisconnected` (підклас `OSError`), а Starlette перетворює його на `WebSocketDisconnect(1006)`. Нижче реальний uvicorn і клієнт, який прочитав одну подію й вийшов.

```python
@app.websocket("/noreader")
async def noreader(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        for page in range(1, 6):
            await asyncio.sleep(0.2)
            await websocket.send_json({"page": page})
            print("server: sent", page, flush=True)
    except BaseException as exc:
        print("server:", type(exc).__name__, getattr(exc, "code", ""), flush=True)
        raise
```

```text
server: sent 1
server: WebSocketDisconnect 1006
ERROR:    Exception in ASGI application
...
  File ".../uvicorn/protocols/websockets/websockets_sansio_impl.py", line 436, in send
    raise ClientDisconnected()
uvicorn.protocols.utils.ClientDisconnected
...
starlette.websockets.WebSocketDisconnect
```

> **Пастка.** У `TestClient` той самий ендпоінт поводиться інакше: при виході з `with client.websocket_connect(...)` клієнт скасовує задачу застосунку, і `send` взагалі не встигає впасти. Тест зелений, а в продакшені лог повний `Exception in ASGI application`. Тому `WebSocketDisconnect` ловлять явно, і тому ендпоінт, що лише пише, все одно мусить читати (розділ про TaskGroup нижче).

Друга частина тієї ж історії стосується самого генератора. Якщо `send_text` кинув виняток посеред `async for`, генератор лишився призупиненим на `yield`, і його `finally` (відписка від воркера, лічильник глядачів) не виконається до збирання сміття. У m5-l06 це закривали через `aclosing`; у WebSocket-ендпоінті це обов'язкова обгортка, бо обрив з'єднання посеред потоку там штатна ситуація, а не виняток.

```python
from contextlib import aclosing

async with aclosing(watch(job_id)) as events:
    async for event in events:
        await websocket.send_text(event.model_dump_json())
```

## Менеджер з'єднань замість кімнат socket.io

Одну задачу генерації можуть дивитися дві вкладки редактора й дашборд. У socket.io це `socket.join(jobId)` і `io.to(jobId).emit(...)`: кімнати живуть у сервері, і бібліотека сама прибирає сокет з усіх кімнат при відключенні. У FastAPI кімнат немає, і їх пишуть самі: словник `job_id → set[WebSocket]` з трьома операціями. Це той самий Observer із m4-l08, тільки підписник тут не колбек, а сокет.

```ts
io.on("connection", (socket) => socket.join(socket.handshake.query.jobId as string));
// worker side
io.to("landing").emit("status", { type: "running", page: 1 });
```

```python
from collections import defaultdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: defaultdict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, job_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms[job_id].add(websocket)

    def disconnect(self, job_id: str, websocket: WebSocket) -> None:
        sockets = self.rooms.get(job_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            del self.rooms[job_id]

    async def broadcast(self, job_id: str, message: dict) -> int:
        sent = 0
        for websocket in list(self.rooms.get(job_id, ())):
            try:
                await websocket.send_json(message)
                sent += 1
            except WebSocketDisconnect:
                self.disconnect(job_id, websocket)
        return sent


manager = ConnectionManager()
app = FastAPI()


@app.websocket("/ws/jobs/{job_id}")
async def job_status(websocket: WebSocket, job_id: str) -> None:
    await manager.connect(job_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(job_id, websocket)


@app.post("/jobs/{job_id}/events")
async def publish(job_id: str, message: dict) -> dict:
    return {"sent": await manager.broadcast(job_id, message)}


client = TestClient(app)
with client.websocket_connect("/ws/jobs/landing") as tab1:
    with client.websocket_connect("/ws/jobs/landing") as tab2:
        print(client.post("/jobs/landing/events", json={"type": "running", "page": 1}).json())
        print("tab1:", tab1.receive_json())
        print("tab2:", tab2.receive_json())
    print(client.post("/jobs/landing/events", json={"type": "running", "page": 2}).json())
    print("tab1:", tab1.receive_json())
print(dict(manager.rooms))
```

```text
{'sent': 2}
tab1: {'type': 'running', 'page': 1}
tab2: {'type': 'running', 'page': 1}
{'sent': 1}
tab1: {'type': 'running', 'page': 2}
{}
```

Кожна деталь тут має причину. `rooms.get(job_id)`, а не `rooms[job_id]`: на `defaultdict` звертання через `[]` створює порожню кімнату для будь-якого id, і словник повільно росте на кожній опечатці. Порожня кімната видаляється при останньому відключенні з тієї ж причини: менеджер живе весь час роботи процесу, і все, що в ньому лишилося, це витік пам'яті. Цикл читання в ендпоінті потрібен, навіть якщо клієнт нічого не шле: без нього сервер не дізнається про відключення, доки broadcast (жаргон: розсилка всім підписникам) не спробує написати в мертвий сокет. І головне: `for websocket in list(...)` ітерує копію.

> **Пастка.** Множину не можна змінювати під час ітерації по ній, так само як словник у m1-l06. У broadcast це стається двома шляхами: ви самі видаляєте мертвий сокет у `except`, або поки `send` чекає на `await`, інший ендпоінт відключається й викликає `disconnect`. В обох випадках наступний крок ітератора падає з `RuntimeError`, а решта вкладок події не отримує.

```python live
import asyncio


class FakeSocket:
    def __init__(self, name: str, alive: bool = True) -> None:
        self.name = name
        self.alive = alive

    async def send_json(self, message: dict) -> None:
        await asyncio.sleep(0)
        if not self.alive:
            raise ConnectionError(f"{self.name} is gone")


async def broadcast(sockets: set[FakeSocket], message: dict) -> None:
    for ws in sockets:
        try:
            await ws.send_json(message)
        except ConnectionError:
            sockets.discard(ws)


async def main() -> None:
    sockets = {FakeSocket("a"), FakeSocket("b", alive=False), FakeSocket("c")}
    try:
        await broadcast(sockets, {"type": "done"})
    except RuntimeError as exc:
        print("RuntimeError:", exc)

asyncio.run(main())
```

```text
RuntimeError: Set changed size during iteration
```

<!-- task: t3 -->

Чому не взяти `asyncio.Queue` на задачу, як у `watch` з m5-l06? Бо черга це не розсилка: кожен елемент отримує рівно один споживач. Дві вкладки на одній черзі ділять події між собою, і жодна не бачить повної картини.

```python live
import asyncio


async def tab(name: str, events: asyncio.Queue[str]) -> None:
    while True:
        status = await events.get()
        print(name, status)


async def main() -> None:
    events: asyncio.Queue[str] = asyncio.Queue()
    tabs = [asyncio.create_task(tab(name, events)) for name in ("tab1", "tab2")]
    for status in ["queued", "running 1/2", "running 2/2", "done"]:
        events.put_nowait(status)
        await asyncio.sleep(0.01)
    for t in tabs:
        t.cancel()

asyncio.run(main())
```

```text
tab1 queued
tab1 running 1/2
tab2 running 2/2
tab1 done
```

Є й друга проблема послідовного broadcast: `await send_json` чекає кожного клієнта по черзі. Одна вкладка на мобільному інтернеті затримує всі інші, а якщо broadcast викликає воркер, то затримує й рендер. Два способи це розв'язати. Перший: розсилати конкурентно, кожну відправку під своїм таймаутом, і вважати повільний сокет мертвим (наступне завдання). Другий, який піде в капстоун: на кожне з'єднання своя черга, воркер робить `put_nowait` у всі черги без жодного `await`, а кожен ендпоінт сам вичитує свою чергу через `async for`. Тоді менеджер тримає `job_id → set[Queue]`, а не сокети, і fan-out (жаргон: розгалуження одного потоку на багатьох споживачів) стає миттєвим для видавця.

<!-- task: t4 -->

## Читати й писати одночасно: TaskGroup, скасування, heartbeat

Ендпоінт статусу має робити дві речі одночасно: віддавати події воркера і слухати клієнта (ping, скасування, а головне сам факт відключення). У браузері й у socket.io це безкоштовно, бо `onmessage` і `emit` це колбеки на одному event loop. У Python корутина в кожен момент чекає на одному `await`: поки вона стоїть на `receive_text()`, вона не пише, а поки стоїть на `anext(events)`, не читає. Дві паралельні дії це дві задачі, і групує їх `TaskGroup` з m5-l05.

```python
import asyncio
from collections.abc import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient

from events import Queued, Running

app = FastAPI()


async def watch(job_id: str) -> AsyncGenerator[Queued | Running, None]:
    yield Queued(job_id=job_id)
    for page in range(1, 100):
        await asyncio.sleep(0.05)
        yield Running(job_id=job_id, page=page, total=99)


async def read_client(websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive_json()
        if message.get("type") == "ping":
            await websocket.send_json({"type": "pong"})


async def stream(websocket: WebSocket, job_id: str) -> None:
    try:
        async for event in watch(job_id):
            await websocket.send_text(event.model_dump_json())
    except asyncio.CancelledError:
        print("server: stream cancelled")
        raise


@app.websocket("/ws/jobs/{job_id}")
async def job_status(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    try:
        async with asyncio.TaskGroup() as tg:
            reader = tg.create_task(read_client(websocket))
            await stream(websocket, job_id)
            reader.cancel()
        await websocket.close()
    except* WebSocketDisconnect as group:
        print("server: client left,", group.exceptions)


client = TestClient(app)
with client.websocket_connect("/ws/jobs/landing") as ws:
    print("client:", ws.receive_json()["type"])
    ws.send_json({"type": "ping"})
    print("client:", ws.receive_json()["type"])
    print("client:", ws.receive_json())
print("client: gone")
```

```text
client: queued
client: pong
client: {'v': 1, 'job_id': 'landing', 'type': 'running', 'page': 1, 'total': 99}
server: stream cancelled
server: client left, (WebSocketDisconnect(1000, None),)
client: gone
```

Механіка така. Читач і письменник ділять одне з'єднання, і це безпечно: `send` і `receive` у Starlette незалежні, а дві задачі на одному event loop не виконуються одночасно в буквальному сенсі (m5-l05). Письменник працює в тілі `async with`, читач окремою задачею. Шляхів завершення два. Задача скінчилась (`done` чи `failed`): тіло виходить з `async for`, скасовує читача, бо той інакше стоїть на `receive` вічно і група не закриється, і ендпоінт закриває з'єднання з `1000`. Клієнт пішов: читач падає з `WebSocketDisconnect`, `TaskGroup` скасовує все інше, включно з тілом, що стояло на `sleep` всередині генератора, і піднімає виняток назовні.

> **Під капотом.** Назовні з `TaskGroup` виходить не `WebSocketDisconnect`, а `ExceptionGroup` (exception group, офіційна назва з PEP 654 і документації Python), навіть коли помилка одна. Звичайний `except WebSocketDisconnect` його не ловить. `except*` розпаковує групу за типом, і тому в прикладі вище `group.exceptions` це кортеж з одним `WebSocketDisconnect`.

> **Пастка.** У блоці `except*` заборонені `return`, `break` і `continue`. Звичка написати `except* WebSocketDisconnect: return "client left"` дає `SyntaxError: 'break', 'continue' and 'return' cannot appear in an except* block` ще на етапі компіляції. Ставте прапорець у `except*` і повертайте після блоку `try`.

<!-- task: q2 -->

Heartbeat (жаргон: періодичний сигнал "я живий") у WebSocket буває двох рівнів, і їх часто плутають. Протокольний ping/pong робить сам uvicorn: кожні `--ws-ping-interval` секунд (за замовчуванням 20) він шле керуючий кадр ping, браузер відповідає pong автоматично, а якщо відповіді немає `--ws-ping-timeout` секунд, з'єднання закривається. JS-код у браузері цих кадрів не бачить. Прикладний heartbeat це звичайне повідомлення `{"type": "ping"}` у вашому протоколі: він потрібен, коли клієнту треба самому помітити мертвий сервер, або коли проксі закриває "тихі" з'єднання. Сервер шле його окремою задачею в тій самій групі.

```python
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient

app = FastAPI()
HEARTBEAT = 0.05


async def heartbeat(websocket: WebSocket) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT)
        await websocket.send_json({"type": "ping"})


async def read_client(websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive_json()
        print("server: got", message)


@app.websocket("/ws/jobs/{job_id}")
async def job_status(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(read_client(websocket))
            tg.create_task(heartbeat(websocket))
    except* WebSocketDisconnect:
        print("server: client left, heartbeat stopped")


client = TestClient(app)
with client.websocket_connect("/ws/jobs/landing") as ws:
    for _ in range(2):
        print("client:", ws.receive_json())
        ws.send_json({"type": "pong"})
```

```text
client: {'type': 'ping'}
server: got {'type': 'pong'}
client: {'type': 'ping'}
server: got {'type': 'pong'}
server: client left, heartbeat stopped
```

> **Пастка.** Спокуслива альтернатива окремій задачі: обгорнути очікування наступної події в таймаут і, якщо подій немає, слати ping. З асинхронним генератором це ламає джерело. Таймаут скасовує `anext(events)`, `CancelledError` летить усередину генератора в точці його `await`, і генератор завершується назавжди: `finally` відпрацьовує, наступний `anext` каже, що подій більше немає. Таймаут на очікуванні допустимий лише для `queue.get()`, який скасування переживає без втрат.

```python live
import asyncio


async def watch():
    try:
        yield "queued"
        await asyncio.sleep(0.05)
        yield "running"
    finally:
        print("watch: finally")


async def main() -> None:
    events = watch()
    print(await anext(events))
    try:
        async with asyncio.timeout(0.01):
            print(await anext(events))
    except TimeoutError:
        print("idle -> ping")
    print(await anext(events, "exhausted"))

asyncio.run(main())
```

```text
queued
watch: finally
idle -> ping
exhausted
```

<!-- task: t5 -->

## Токен у WebSocket: query, перше повідомлення, Depends

Тут лише механіка: як доставити токен до ендпоінта і як відмовити. Що це за токен і як його перевіряти, тема окремого курсу. Обмеження йде від браузера: конструктор `new WebSocket(url, protocols)` не дає задати заголовки, тому `Authorization: Bearer ...` з фронтенду не передати. Лишається два робочі місця: query-параметр `?token=...` у URL або перше повідомлення після `accept`. Cookie теж їде з рукостисканням, якщо домен той самий.

`Depends` у WebSocket-ендпоінтах працює так само, як у HTTP (m7-l01): залежність отримує `Query`, `Header`, `Cookie` чи сам `WebSocket`, а відмова робиться винятком `WebSocketException` з кодом закриття. FastAPI перехоплює його до `accept` і закриває рукостискання з цим кодом; `HTTPException` тут не підходить, бо HTTP-відповіді на WebSocket-запит немає.

```python
from typing import Annotated

from fastapi import (Depends, FastAPI, Query, WebSocket, WebSocketDisconnect,
                     WebSocketException, status)
from fastapi.testclient import TestClient

TOKENS = {"secret-1": "bogdan"}
app = FastAPI()


async def current_user(token: Annotated[str | None, Query()] = None) -> str:
    if token not in TOKENS:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="bad token")
    return TOKENS[token]


@app.websocket("/ws/jobs/{job_id}")
async def job_status(websocket: WebSocket, job_id: str,
                     user: Annotated[str, Depends(current_user)]) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "hello", "user": user, "job_id": job_id})
    await websocket.close()


@app.websocket("/ws/first-message/{job_id}")
async def first_message(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    hello = await websocket.receive_json()
    if hello.get("type") != "auth" or hello.get("token") not in TOKENS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="bad token")
        return
    await websocket.send_json({"type": "hello", "user": TOKENS[hello["token"]]})
    await websocket.close()


client = TestClient(app)
with client.websocket_connect("/ws/jobs/landing?token=secret-1") as ws:
    print(ws.receive_json())
try:
    with client.websocket_connect("/ws/jobs/landing?token=nope"):
        pass
except WebSocketDisconnect as exc:
    print("rejected:", exc.code, exc.reason)

with client.websocket_connect("/ws/first-message/landing") as ws:
    ws.send_json({"type": "auth", "token": "secret-1"})
    print(ws.receive_json())
with client.websocket_connect("/ws/first-message/landing") as ws:
    ws.send_json({"type": "auth", "token": "nope"})
    try:
        ws.receive_json()
    except WebSocketDisconnect as exc:
        print("closed:", exc.code, exc.reason)
```

```text
{'type': 'hello', 'user': 'bogdan', 'job_id': 'landing'}
rejected: 1008 bad token
{'type': 'hello', 'user': 'bogdan'}
closed: 1008 bad token
```

Різниця між варіантами видна у виводі, але `TestClient` тут лукавить. Query-токен перевіряється до `accept`, і з'єднання не відкривається взагалі. Реальний uvicorn на закриття до `accept` відповідає на рукостискання звичайним HTTP 403, тож код `1008` до браузера не доходить: там спрацьовують `onerror` і `onclose` з `1006`. До того ж токен потрапляє в URL, а отже в логи проксі й access-лог uvicorn:

```text
INFO:     127.0.0.1:50442 - "WebSocket /ws/jobs/landing?token=secret-1" [accepted]
INFO:     127.0.0.1:50443 - "WebSocket /ws/jobs/landing?token=nope" 403
```

 Перше повідомлення не світить токен в URL і доносить до клієнта справжній `1008` з причиною, зате з'єднання вже відкрите, і ендпоінт мусить сам не робити нічого корисного до перевірки, а також мати таймаут на це перше повідомлення, щоб неавторизовані клієнти не тримали з'єднання вічно.

## Тести через `websocket_connect`

Усі приклади вище вже були тестами без `assert`. `TestClient.websocket_connect(path)` повертає сесію, яку використовують лише як контекстний менеджер: вхід робить рукостискання, вихід надсилає клієнтське закриття з `1000` і чекає, поки обробник завершиться. Методи дзеркальні до серверних, але синхронні: `send_text`, `send_json`, `receive_text`, `receive_json`. Закриття сервером клієнт бачить як `WebSocketDisconnect` з `receive_*`, відмову на рукостисканні як `WebSocketDisconnect` з самого `websocket_connect`. Повна організація API-тестів, фікстури й `AsyncClient` у m7-l05.

Справжнє джерело подій (воркер, черга, рендер) у тест не тягнуть. Ендпоінт отримує `watch` через `Depends`, а тест підміняє його через `app.dependency_overrides` на генератор із фіксованим сценарієм. Це та сама ідея fake-об'єкта, що в m3-l04, і той самий механізм перевизначення залежностей, що для HTTP-ендпоінтів.

```python
# app.py
from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import Depends, FastAPI, WebSocket

from events import ServerEvent

Watch = Callable[[str], AsyncIterator[ServerEvent]]


def get_watch() -> Watch:
    raise NotImplementedError("wired to the worker in lifespan")


app = FastAPI()


@app.websocket("/ws/jobs/{job_id}")
async def job_status(
    websocket: WebSocket, job_id: str, watch: Annotated[Watch, Depends(get_watch)]
) -> None:
    await websocket.accept()
    async for event in watch(job_id):
        await websocket.send_text(event.model_dump_json())
    await websocket.close()
```

```python
# test_app.py
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect

from app import app, get_watch
from events import Failed, Queued, Running, ServerEvent


async def fake_watch(job_id: str) -> AsyncIterator[ServerEvent]:
    yield Queued(job_id=job_id)
    yield Running(job_id=job_id, page=1, total=1)
    yield Failed(job_id=job_id, error="template not found")


@pytest.fixture
def client():
    app.dependency_overrides[get_watch] = lambda: fake_watch
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_streams_until_failed(client: TestClient) -> None:
    with client.websocket_connect("/ws/jobs/landing") as ws:
        events = [ws.receive_json() for _ in range(3)]
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()

    assert [e["type"] for e in events] == ["queued", "running", "failed"]
    assert events[-1] == {"v": 1, "job_id": "landing", "type": "failed",
                          "error": "template not found"}
    assert closed.value.code == 1000
```

```text
$ pytest test_app.py -q
.                                                                        [100%]
1 passed, 1 warning in 0.48s
```

Зверніть увагу на `lambda: fake_watch`. Залежність `get_watch` повертає функцію, тому override теж мусить бути фабрикою, яка повертає функцію. Якщо написати `dependency_overrides[get_watch] = fake_watch`, FastAPI сприйме асинхронний генератор як залежність з `yield` (як сесію БД з `finally`), підставить у неї `job_id` зі шляху і передасть в ендпоінт перше значення, що вона віддала. Тест падає з `TypeError: 'Queued' object is not callable`. Останній `receive_json` під `pytest.raises` перевіряє, що сервер сам закрив з'єднання з `1000` після термінальної події, а не лишив його висіти.

> **Пастка.** Тест на ендпоінт без `close()` не падає, а зависає назавжди на останньому `receive_json`. Pytest без плагіна таймаутів чекатиме вічно. Якщо тест WebSocket "думає" довше секунди, першим ділом перевірте, чи кожен шлях обробника закінчується `close()` або винятком.

Попередження в підсумку pytest це `StarletteDeprecationWarning` від Starlette 1.x: `TestClient` переходить з `httpx` на пакет `httpx2`, і поки встановлено лише `httpx`, кожен запуск про це нагадує. Для тестів це нешкідливо; у капстоуні його прибирає `uv add --dev httpx2`, і разом з ним m7-l05 додає `asgi-lifespan` і плагін anyio для асинхронних тестів.

## SSE замість WebSocket і межа одного процесу

Статус генерації по суті односторонній: сервер говорить, клієнт слухає. Для цього є Server-Sent Events (SSE, офіційна назва зі специфікації HTML): звичайна HTTP-відповідь з `Content-Type: text/event-stream`, яка не закінчується, а дописується кадрами `event: ...\ndata: ...\n\n`. У FastAPI це `StreamingResponse` над тим самим асинхронним генератором, а з FastAPI 0.135 ще й готовий `fastapi.sse.EventSourceResponse`, якому досить `yield` моделей.

```python
import asyncio
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.sse import EventSourceResponse
from fastapi.testclient import TestClient

from events import Queued, Running

app = FastAPI()


async def watch(job_id: str) -> AsyncGenerator[Queued | Running, None]:
    yield Queued(job_id=job_id)
    await asyncio.sleep(0.01)
    yield Running(job_id=job_id, page=1, total=1)


@app.get("/jobs/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    async def frames() -> AsyncGenerator[str, None]:
        async for event in watch(job_id):
            yield f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"

    return StreamingResponse(frames(), media_type="text/event-stream")


@app.get("/jobs/{job_id}/events2", response_class=EventSourceResponse)
async def job_events2(job_id: str) -> AsyncGenerator[Queued | Running, None]:
    async for event in watch(job_id):
        yield event


client = TestClient(app)
for path in ["/jobs/landing/events", "/jobs/landing/events2"]:
    with client.stream("GET", path) as response:
        print(response.headers["content-type"])
        print(response.read().decode())
```

```text
text/event-stream; charset=utf-8
event: queued
data: {"v":1,"job_id":"landing","type":"queued"}

event: running
data: {"v":1,"job_id":"landing","type":"running","page":1,"total":1}


text/event-stream; charset=utf-8
data: {"v":1,"job_id":"landing","type":"queued"}

data: {"v":1,"job_id":"landing","type":"running","page":1,"total":1}


```

Порівняння в три рядки. SSE: лише сервер → клієнт, звичайний HTTP (проксі, заголовок `Authorization` через `fetch`-клієнт, HTTP/2), автоперепідключення в `EventSource` з коробки. WebSocket: двосторонній канал, окремий протокол після рукостискання, перепідключення пишете самі. Для статусу генерації без команд від клієнта SSE достатньо; WebSocket виправданий, коли клієнт теж говорить (скасувати задачу, підписатися на іншу, ping).

Друга межа стосується всього уроку. `ConnectionManager` і будь-який інший словник підписників живуть у пам'яті одного процесу Python. `uvicorn --workers 4` запускає чотири незалежні процеси (m5-l08, детально в m7-l07), кожен зі своїм `manager.rooms` і своїм воркером генерації з m7-l03. Вкладка, яку балансувальник під'єднав до процесу 2, ніколи не почує broadcast із процесу 1, де рендериться її задача, і жодної помилки при цьому не буде, лише тиша.

```python
# process 1 (rendering "landing")          # process 2 (tab2 connected here)
manager.rooms == {"landing": {tab1}}        manager.rooms == {"landing": {tab2}}
await manager.broadcast("landing", event)   # tab2 receives nothing
```

Для капстоуну це не проблема: один процес uvicorn тримає і API, і воркер. Коли процесів стає кілька, події виносять у зовнішню шину з pub/sub, найчастіше Redis (`PUBLISH`/`SUBSCRIBE`), і кожен процес розсилає своїм сокетам те, що отримав із шини; це вже інфраструктура, поза межами курсу. До речі, socket.io розв'язує ту саму задачу тим самим способом: `@socket.io/redis-adapter`.

<!-- task: q3 -->

## Для капстоуну

У капстоуні статус генерації складається з чотирьох частин. Події статусу (моделі `Queued`, `Running(page, total)`, `Done(url, finished_at)`, `Failed(error)` з розділу про протокол, union `ServerEvent` і множина `TERMINAL = {"done", "failed"}`) і хаб `JobEvents` живуть у `formbuilder/hub.py`: їх публікує воркер з m7-l03, тож вони не належать шару HTTP і не імпортують FastAPI. Хаб це менеджер підписок з чергою на з'єднання, бо воркер не повинен чекати повільних вкладок. Вхідні повідомлення клієнта (`Ping`) з відповідями `Pong` і `ProtocolError` і сам ендпоінт живуть у `formbuilder/api/ws.py`. І HTML-клієнт для перевірки руками.

```python
# src/formbuilder/hub.py (моделі подій з розділу про протокол вище в цьому ж модулі)
import asyncio
from collections import defaultdict
from collections.abc import AsyncGenerator

...  # EventBase, Queued, Running, Done, Failed, ServerEvent, TERMINAL


class JobEvents:
    def __init__(self) -> None:
        self._subscribers: defaultdict[str, set[asyncio.Queue[ServerEvent]]] = defaultdict(set)

    def publish(self, event: ServerEvent) -> int:
        queues = self._subscribers.get(event.job_id, set())
        for queue in queues:
            queue.put_nowait(event)
        return len(queues)

    def watchers(self, job_id: str) -> int:
        return len(self._subscribers.get(job_id, ()))

    def watch(self, job_id: str) -> AsyncGenerator[ServerEvent, None]:
        """Subscribe now, stream later: the queue is registered before this returns."""
        queue: asyncio.Queue[ServerEvent] = asyncio.Queue()
        self._subscribers[job_id].add(queue)
        return self._stream(job_id, queue)

    async def _stream(
        self, job_id: str, queue: asyncio.Queue[ServerEvent]
    ) -> AsyncGenerator[ServerEvent, None]:
        try:
            while True:
                event = await queue.get()
                yield event
                if event.type in TERMINAL:
                    return
        finally:
            queues = self._subscribers[job_id]
            queues.discard(queue)
            if not queues:
                del self._subscribers[job_id]


hub = JobEvents()


def get_hub() -> JobEvents:
    return hub
```

`publish` синхронний і ніколи не чекає: воркер з m7-l03 викликає його як звичайний listener (Observer з m4-l08), і повільна вкладка не гальмує рендер. Ітерація по `queues` тут безпечна, бо в циклі немає `await`: жоден інший код не виконається, поки цикл не скінчиться.

`watch` навмисно звичайний метод, а не асинхронний генератор. Тіло `async def` з `yield` не виконується, доки хтось не попросить перше значення: виклик лише створює об'єкт генератора. Якби підписка жила в такому тілі, вона відбулась би на першій ітерації `async for`, і подія, опублікована між викликом `watch` і початком циклу (наприклад, `queued` одразу після того, як ендпоінт прочитав статус зі сховища), пропала б. Тому `watch` реєструє чергу в момент виклику й лише потім повертає генератор `_stream`, який її читає.

```python live
import asyncio
from collections.abc import AsyncGenerator


class LateHub:
    def __init__(self) -> None:
        self.queues: list[asyncio.Queue[str]] = []

    def publish(self, status: str) -> None:
        for queue in self.queues:
            queue.put_nowait(status)

    async def watch(self) -> AsyncGenerator[str, None]:  # тіло стартує на першій ітерації
        queue: asyncio.Queue[str] = asyncio.Queue()
        self.queues.append(queue)
        while (status := await queue.get()) != "done":
            yield status
        yield status


class EagerHub(LateHub):
    def watch(self) -> AsyncGenerator[str, None]:  # підписка в момент виклику
        queue: asyncio.Queue[str] = asyncio.Queue()
        self.queues.append(queue)
        return self._stream(queue)

    async def _stream(self, queue: asyncio.Queue[str]) -> AsyncGenerator[str, None]:
        while (status := await queue.get()) != "done":
            yield status
        yield status


async def main() -> None:
    for hub in (LateHub(), EagerHub()):
        events = hub.watch()  # ендпоінт отримав генератор...
        hub.publish("queued")  # ...а воркер опублікував до першого async for
        hub.publish("done")
        try:
            async with asyncio.timeout(0.1):
                print(type(hub).__name__, [status async for status in events])
        except TimeoutError:
            print(type(hub).__name__, "timeout: both events were lost")


asyncio.run(main())
```

```text
LateHub timeout: both events were lost
EagerHub ['queued', 'done']
```

`finally` у `_stream` прибирає чергу й порожню кімнату за будь-якого виходу: термінальна подія, `aclose()` від `aclosing`, скасування задачі.

> **Пастка.** Ціна підписки в момент виклику: генератор, який так і не почали ітерувати, свого `finally` не виконає, бо `aclose()` на незапущеному генераторі лише позначає його закритим. Підписка тоді лишається в `_subscribers` назавжди. Тому `watch` викликають безпосередньо перед `async for`, без `await` між ними, як у `stream` нижче.

```python
# src/formbuilder/api/ws.py
import asyncio
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from formbuilder.hub import JobEvents, get_hub

...  # Ping, Pong, ProtocolError, client_messages з розділу про протокол

router = APIRouter()


async def read_client(websocket: WebSocket) -> None:
    while True:
        raw = await websocket.receive_text()
        reply: Pong | ProtocolError
        try:
            client_messages.validate_json(raw)
        except ValidationError as exc:
            reply = ProtocolError(detail=exc.errors()[0]["msg"])
        else:
            reply = Pong()
        await websocket.send_text(reply.model_dump_json())


async def stream(websocket: WebSocket, hub: JobEvents, job_id: str) -> None:
    async with aclosing(hub.watch(job_id)) as events:
        async for event in events:
            await websocket.send_text(event.model_dump_json())


@router.websocket("/ws/jobs/{job_id}")
async def job_status(
    websocket: WebSocket, job_id: str, hub: Annotated[JobEvents, Depends(get_hub)]
) -> None:
    await websocket.accept()
    try:
        async with asyncio.TaskGroup() as tg:
            reader = tg.create_task(read_client(websocket))
            await stream(websocket, hub, job_id)
            reader.cancel()
        await websocket.close()
    except* WebSocketDisconnect:
        pass
```

Тест ендпоінта підміняє хаб через `dependency_overrides` на клас зі сценарієм подій, тест хаба працює без FastAPI взагалі, через `asyncio.run` і дві задачі-вкладки. Обидва в `tests/test_ws.py`, весь файл проходить за пів секунди.

```python
class ScriptedHub:
    def __init__(self, *events: ServerEvent, gap: float = 0.0) -> None:
        self.events = events
        self.gap = gap
        self.closed = False

    async def watch(self, job_id: str) -> AsyncGenerator[ServerEvent, None]:
        try:
            for event in self.events:
                await asyncio.sleep(self.gap)
                yield event
        finally:
            self.closed = True


def test_hub_fan_out_and_cleanup() -> None:
    async def scenario() -> list[list[str]]:
        hub = JobEvents()

        async def collect() -> list[str]:
            return [e.type async for e in hub.watch("landing")]

        async with asyncio.TaskGroup() as tg:
            tabs = [tg.create_task(collect()) for _ in range(2)]
            await asyncio.sleep(0)
            assert hub.watchers("landing") == 2
            hub.publish(Queued(job_id="landing"))
            hub.publish(Done(job_id="landing", url="/s/", finished_at=FINISHED))
        assert hub.watchers("landing") == 0
        return [t.result() for t in tabs]

    assert asyncio.run(scenario()) == [["queued", "done"], ["queued", "done"]]
```

```text
$ uv run pytest tests/test_ws.py -q
...                                                                      [100%]
3 passed in 0.25s
```

HTML-клієнт на 14 рядків віддається з dev-роута `GET /dev/ws` через `HTMLResponse` і нічого не збирає: відкрили сторінку, натиснули `watch`, запустили генерацію, дивитесь на події. `textContent` замість `innerHTML`, бо `error` у події `failed` може містити довільний текст із шаблону.

```html
<!doctype html>
<meta charset="utf-8">
<title>job status</title>
<input id="job" value="landing"> <button id="watch">watch</button>
<ol id="log"></ol>
<script>
  const line = (text) => log.appendChild(document.createElement("li")).textContent = text;
  watch.onclick = () => {
    const ws = new WebSocket(`ws://${location.host}/ws/jobs/${job.value}`);
    ws.onopen = () => ws.send(JSON.stringify({ type: "ping" }));
    ws.onmessage = (e) => line(e.data);
    ws.onclose = (e) => line(`closed ${e.code}`);
  };
</script>
```

```text
{"type":"pong"}
{"v":1,"job_id":"landing","type":"queued"}
{"v":1,"job_id":"landing","type":"running","page":1,"total":2}
{"v":1,"job_id":"landing","type":"running","page":2,"total":2}
{"v":1,"job_id":"landing","type":"done","url":"/sites/landing/","finished_at":"2026-10-18T15:46:28.619855Z"}
closed 1000
```

Це вміст списку в браузері проти реального uvicorn, де генерацію імітував dev-роут, що публікує в хаб чотири події з паузою 0.3 с.

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **Іменовані події замість поля `type`.** За звичкою `socket.emit("status", data)` шукають API на кшталт `websocket.emit(...)` або шлють різні повідомлення без тегу. У WebSocket одне джерело рядків, і розрізнити їх можна лише за вмістом. Правильно: кожне повідомлення має `type`, набір повідомлень описаний discriminated union, розбір через `TypeAdapter`.

   ```python
   await websocket.send_text(Running(job_id=job_id, page=1, total=2).model_dump_json())
   message = client_messages.validate_json(await websocket.receive_text())
   ```

2. **Пошук `io.to(room)`.** Кімнат немає, а самописний словник кімнат легко зробити з витоком і з `RuntimeError` під час розсилки. Правильно: `rooms.get(job_id)` замість `rooms[job_id]` на `defaultdict`, видалення порожньої кімнати, ітерація по копії `list(sockets)` або черга на з'єднання.

   ```python
   for websocket in list(self.rooms.get(job_id, ())):
       ...
   ```

3. **Колбек `ws.on("message")` замість `async for` і задач.** Шукають, куди "підписатися" на повідомлення, і в результаті пишуть ендпоінт, який лише шле й ніколи не читає. Сервер дізнається про відключення тільки на наступному `send`, з `WebSocketDisconnect(1006)` у лозі. Правильно: читач окремою задачею в `TaskGroup`, письменник у тілі.

   ```python
   async with asyncio.TaskGroup() as tg:
       reader = tg.create_task(read_client(websocket))
       await stream(websocket, hub, job_id)
       reader.cancel()
   ```

4. **Очікування автоматичного reconnect і буфера.** socket.io перепідключається сам і доганяє пропущені події; сирий WebSocket ні, а подія, опублікована, поки клієнта не було, зникла. Правильно: клієнт перепідключається сам (з паузою), а сервер при підключенні спершу шле поточний стан задачі зі сховища (m7-l03), а вже потім живі події.

   ```ts
   ws.onclose = (e) => { if (e.code !== 1000) setTimeout(connect, 1000); };
   ```

5. **`except WebSocketDisconnect` навколо `TaskGroup`.** Виняток приходить загорнутим в `ExceptionGroup` і пролітає повз. А виправлення через `except* ...: return` не компілюється. Правильно: `except*` з прапорцем або з `pass`.

   ```python
   try:
       async with asyncio.TaskGroup() as tg:
           ...
   except* WebSocketDisconnect:
       left = True
   ```

6. **`send_json(model)` за аналогією з `res.json(obj)`.** Express серіалізує будь-що з `toJSON`, а `send_json` викликає `json.dumps` і падає на моделі та на `datetime`. Правильно: `send_text(model.model_dump_json())`.

   ```python
   await websocket.send_text(event.model_dump_json())
   ```

7. **Обробник без `close()`.** У socket.io обробник `connection` завершується одразу, а з'єднання живе далі. Тут навпаки: кінець корутини означає кінець з'єднання, але без кадру закриття, тож uvicorn обриває TCP і браузер бачить `1006`, а тест на `TestClient` зависає. Правильно: кожен шлях обробника закінчується `await websocket.close()` або винятком.

   ```python
   async for event in watch(job_id):
       await websocket.send_text(event.model_dump_json())
   await websocket.close()
   ```

8. **Віра в глобальний broadcast при кількох воркерах.** `io.emit` з Redis-адаптером працює між процесами, словник у модулі Python ні. Правильно: один процес на API й воркер у капстоуні, зовнішній pub/sub, коли процесів більше.

   ```bash
   uvicorn formbuilder.api.app:app --workers 1
   ```

## Підсумок

- `@app.websocket(path)` це одна корутина на одне з'єднання: `accept()`, потім `receive_*`/`send_*`, наприкінці явний `close()` з кодом.
- Відключення клієнта це виняток `WebSocketDisconnect` з `receive_*` або з наступного `send_*`, а не подія; після нього з'єднання не чіпати.
- Немає подій, кімнат, ack і reconnect: протокол це JSON з полем `type`, discriminated union у Pydantic і `TypeAdapter` для розбору, версія в полі `v`.
- `send_json` це `json.dumps`; моделі шлються через `send_text(model.model_dump_json())`.
- Статус стрімиться `async for` по асинхронному генератору під `aclosing`; генератор задає кінець потоку.
- Хаб підписує глядача в момент виклику `watch`, а не на першій ітерації: тіло асинхронного генератора стартує лише з першим `__anext__`, і подія між викликом і `async for` інакше губиться.
- Читати й писати одночасно можна лише двома задачами: `TaskGroup`, читач окремо, скасування при розриві, `except*` без `return`.
- Таймаут навколо `anext()` вбиває асинхронний генератор; heartbeat окремою задачею, протокольний ping робить uvicorn.
- Кімнати це `dict[job_id, set[...]]` з прибиранням порожніх; ітерувати копію; для повільних клієнтів черга на з'єднання.
- Токен у query або в першому повідомленні, `Depends` і `WebSocketException(1008)` працюють; закриття до `accept` в uvicorn стає HTTP 403.
- Усе in-memory живе в одному процесі; SSE простіший для односторонніх статусів.

## Що далі

Наступний урок, m7-l05, збирає тести API в систему: `TestClient` і `AsyncClient`, фікстури застосунку з lifespan, `dependency_overrides` для сховища й рендерера. Звідти знадобляться `websocket_connect`, підміна джерела подій через залежність і fake-хаб зі сценарієм із цього уроку: повний сценарій "створити форму → build → статус done через WebSocket" стане одним тестом.
