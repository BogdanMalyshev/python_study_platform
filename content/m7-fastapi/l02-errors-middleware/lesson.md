---
id: m7-l02
module: m7-fastapi
title: "Обробка помилок, middleware, CORS, OpenAPI"
summary: "Учень зводить усі помилки FastAPI-застосунку до одного JSON-формату для фронтенду, пише middleware з request id, налаштовує CORS і OpenAPI як контракт, і знає, у якому порядку все це загортає обробник запиту."
duration_min: 90
prerequisites: [m7-l01]
---

Усі приклади уроку запускались локально з FastAPI 0.143.5, Starlette 1.8.0 і Pydantic 2.14.1 через `TestClient` з m7-l01. У браузері FastAPI не працює, тому блоки тут не `live`: код і реальний вивід. Практика з FastAPI йде в капстоун, а в браузері лишаються чисті функції, з яких складається обробка помилок.

## HTTPException і власні винятки домену

У NestJS ви кидали `throw new NotFoundException(...)`, і фреймворк сам перетворював виняток на відповідь. У FastAPI так само: `raise HTTPException(status_code, detail)` з обробника перериває його, а відповідь збирає вбудований exception handler. `res.status(404).json(...)` немає, бо немає `res`: обробник або повертає значення, або кидає.

```ts
@Get(":id")
getForm(@Param("id") id: string) {
  const form = this.forms.get(id);
  if (!form) throw new NotFoundException(`form '${id}' not found`);
  return form;
}
```

```python
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

app = FastAPI()
FORMS = {"contact": {"id": "contact", "title": "Contact us"}}


@app.get("/forms/{form_id}")
def get_form(form_id: str) -> dict:
    if form_id not in FORMS:
        raise HTTPException(status_code=404, detail=f"form {form_id!r} not found")
    return FORMS[form_id]


@app.post("/forms/{form_id}/publish")
def publish(form_id: str) -> dict:
    raise HTTPException(
        status_code=409,
        detail={"code": "build_in_progress", "jobId": "j-42"},
        headers={"Retry-After": "5"},
    )


client = TestClient(app)
r = client.get("/forms/nope")
print(r.status_code, r.json())
r = client.post("/forms/contact/publish")
print(r.status_code, r.json(), r.headers["retry-after"])
r = client.get("/nothing/here")
print(r.status_code, r.json())
r = client.delete("/forms/contact")
print(r.status_code, r.json(), r.headers["allow"])
```

```text
404 {'detail': "form 'nope' not found"}
409 {'detail': {'code': 'build_in_progress', 'jobId': 'j-42'}} 5
404 {'detail': 'Not Found'}
405 {'detail': 'Method Not Allowed'} GET
```

Форма відповіді завжди `{"detail": ...}`, а в `detail` іде будь-що, що серіалізується в JSON: рядок, словник, список. `headers` потрапляють у відповідь як є. Неіснуючий маршрут і чужий метод дають той самий формат, бо всередині фреймворку це теж `HTTPException`. Різниця з NestJS у тому, що ієрархії `NotFoundException`, `ConflictException` немає: один клас, статус передається числом.

`HTTPException` це виняток шару API, і кидати його варто лише там: в обробниках маршрутів і в залежностях `Depends`. Код розбору конфігу, воркер і сховище нічого не знають про HTTP і кидають винятки домену, як `ConfigError` з m1-l11 і m3-l03. Перетворення в HTTP-відповідь робить один глобальний обробник, зареєстрований через `@app.exception_handler(ConfigError)`. Це прямий відповідник `@Catch(ConfigError)` exception filter у NestJS, тільки без класу.

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


class ConfigError(Exception):
    code = "invalid_config"


class UnknownElementType(ConfigError):
    code = "unknown_element_type"

    def __init__(self, element_id: str, element_type: str) -> None:
        super().__init__(f"element {element_id!r}: unknown type {element_type!r}")
        self.element_id = element_id


app = FastAPI()


@app.exception_handler(ConfigError)
async def config_error_handler(request: Request, exc: ConfigError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": exc.code, "message": str(exc)}},
    )


def check_elements(elements: list[dict]) -> None:
    for el in elements:
        if el["type"] not in {"input", "text", "button", "block"}:
            raise UnknownElementType(el["id"], el["type"])


@app.post("/forms")
def create_form(config: dict) -> dict:
    check_elements(config["elements"])
    if not config.get("title"):
        raise ConfigError("title is empty")
    return {"id": "f-1"}


client = TestClient(app)
print(client.post("/forms", json={"title": "Hi", "elements": []}).json())
r = client.post("/forms", json={"title": "Hi", "elements": [{"id": "e1", "type": "slider"}]})
print(r.status_code, r.json())
r = client.post("/forms", json={"title": "", "elements": []})
print(r.status_code, r.json())
```

```text
{'id': 'f-1'}
422 {'error': {'code': 'unknown_element_type', 'message': "element 'e1': unknown type 'slider'"}}
422 {'error': {'code': 'invalid_config', 'message': 'title is empty'}}
```

`check_elements` не має жодного `try`, обробник маршруту теж. Виняток летить стеком до межі застосунку, і там його ловить обробник, зареєстрований для базового класу. Обробник отримує `request` і сам виняток, тож усе, що потрібно для відповіді (`code`, `element_id`), кладеться в атрибути винятку, а не збирається з рядка повідомлення.

> **Під капотом.** Обробник шукається за MRO (method resolution order, офіційна назва з документації Python, детально в m4-l04) класу винятку: Starlette проходить `type(exc).__mro__` і бере перший клас, для якого є обробник. Тому обробник `ConfigError` ловить `UnknownElementType`, а якщо зареєструвати окремий обробник для `UnknownElementType`, переможе він, незалежно від порядку реєстрації. Це той самий `isinstance`, що в `except` (m1-l11), тільки поза вашим кодом.

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


class ConfigError(Exception): ...
class UnknownElementType(ConfigError): ...


app = FastAPI()


@app.exception_handler(ConfigError)
async def base(request: Request, exc: ConfigError) -> JSONResponse:
    return JSONResponse({"handler": "ConfigError"}, status_code=422)


@app.exception_handler(UnknownElementType)
async def specific(request: Request, exc: UnknownElementType) -> JSONResponse:
    return JSONResponse({"handler": "UnknownElementType"}, status_code=422)


@app.get("/a")
def a() -> dict:
    raise UnknownElementType("slider")


@app.get("/b")
def b() -> dict:
    raise ConfigError("bad")


client = TestClient(app)
print(client.get("/a").json(), client.get("/b").json())
print([cls.__name__ for cls in UnknownElementType.__mro__])
```

```text
{'handler': 'UnknownElementType'} {'handler': 'ConfigError'}
['UnknownElementType', 'ConfigError', 'Exception', 'BaseException', 'object']
```

> **Пастка.** `fastapi.HTTPException` це підклас `starlette.exceptions.HTTPException`. Ваш код кидає FastAPI-шний, а маршрутизатор для неіснуючого шляху й чужого методу кидає Starlette-івський. Обробник, зареєстрований на `fastapi.HTTPException`, другі не бачить: батьківський клас не знаходиться в MRO дочірнього. Реєструйте обробник на `starlette.exceptions.HTTPException`, тоді він ловить обидва.

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

for exc_class in (HTTPException, StarletteHTTPException):
    app = FastAPI()

    @app.exception_handler(exc_class)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": f"http_{exc.status_code}", "message": exc.detail}},
            headers=exc.headers,
        )

    @app.get("/forms/{form_id}")
    def get_form(form_id: str) -> dict:
        raise HTTPException(404, f"form {form_id!r} not found")

    client = TestClient(app)
    print(exc_class.__module__, exc_class.__name__)
    print("  ", client.get("/forms/x").json())
    print("  ", client.get("/no/such/route").json())
    print("  ", client.put("/forms/x").json())
```

```text
fastapi.exceptions HTTPException
   {'error': {'code': 'http_404', 'message': "form 'x' not found"}}
   {'detail': 'Not Found'}
   {'detail': 'Method Not Allowed'}
starlette.exceptions HTTPException
   {'error': {'code': 'http_404', 'message': "form 'x' not found"}}
   {'error': {'code': 'http_404', 'message': 'Not Found'}}
   {'error': {'code': 'http_405', 'message': 'Method Not Allowed'}}
```

<!-- task: q1 -->

<!-- task: t3 -->

## Помилки валідації 422 і формат для фронтенду

Коли тіло, query чи path-параметр не проходять Pydantic-валідацію (m7-l01), FastAPI кидає `RequestValidationError`, а вбудований обробник віддає 422 з `detail` у вигляді списку. Кожен елемент це запис з `e.errors()` з m2-l09: `type`, `loc`, `msg`, `input`, іноді `ctx`. Перший елемент `loc` каже, звідки значення: `body`, `query`, `path`, `header`, `cookie`.

```python
import json
from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Element(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)
    id: str
    max_length: int | None = Field(default=None, ge=1)


class FormIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)
    title: str = Field(min_length=1)
    elements: list[Element]


app = FastAPI()


@app.post("/forms")
def create_form(config: FormIn) -> dict:
    return {"id": "f-1"}


@app.get("/forms")
def list_forms(page_size: Annotated[int, Query(alias="pageSize", ge=1)] = 20) -> list:
    return []


client = TestClient(app)
r = client.post("/forms", json={"title": "", "elements": [{"id": "e1", "maxLength": 0}, {}]})
print(r.status_code)
print(json.dumps(r.json()["detail"][1:], indent=2))
print(client.get("/forms", params={"pageSize": 0}).json())
r = client.post("/forms", content='{"title": ', headers={"content-type": "application/json"})
print(r.json())
```

```text
422
[
  {
    "type": "greater_than_equal",
    "loc": [
      "body",
      "elements",
      0,
      "maxLength"
    ],
    "msg": "Input should be greater than or equal to 1",
    "input": 0,
    "ctx": {
      "ge": 1
    }
  },
  {
    "type": "missing",
    "loc": [
      "body",
      "elements",
      1,
      "id"
    ],
    "msg": "Field required",
    "input": {}
  }
]
{'detail': [{'type': 'greater_than_equal', 'loc': ['query', 'pageSize'], 'msg': 'Input should be greater than or equal to 1', 'input': '0', 'ctx': {'ge': 1}}]}
{'detail': [{'type': 'json_invalid', 'loc': ['body', 10], 'msg': 'JSON decode error', 'input': {}, 'ctx': {'error': 'Expecting value'}}]}
```

Дві речі тут вже зроблено за вас. `loc` містить `maxLength`, а не `max_length`: Pydantic пише в шлях аліас поля, тобто ім'я, яке надіслав клієнт, тож camelCase з `alias_generator=to_camel` (m2-l09) доходить до помилок сам. З query-параметром так само: `Query(alias="pageSize")` дає `pageSize` у `loc`. Без аліаса там було б Python-ім'я `page_size`, і фронтенд не знайшов би поле.

Чого фронтенду не вистачає: плоского шляху на кшталт `elements.0.maxLength`, який react-hook-form приймає в `setError`, і єдиного формату з рештою помилок. Ще одна причина перевизначити формат: `input` повертає клієнту те, що він надіслав, а в чужому тілі можуть бути паролі чи токени, які потім осідають у логах фронтенду. Перевизначення це обробник `RequestValidationError`, а `exc.errors()` дає той самий список з `loc` у вигляді кортежу.

```python
import json

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

SOURCES = {"body", "query", "path", "header", "cookie"}


class FormIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)
    title: str = Field(min_length=1)
    max_answers: int | None = Field(default=None, ge=1)


def loc_to_path(loc: tuple) -> str:
    parts = list(loc)
    if parts and parts[0] in SOURCES:
        parts = parts[1:]
    return ".".join(str(p) for p in parts)


app = FastAPI()


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    print("errors()[0]:", exc.errors()[0])
    fields = [
        {"path": loc_to_path(err["loc"]), "code": err["type"], "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": f"{len(fields)} invalid field(s)", "fields": fields}},
    )


@app.post("/forms")
def create_form(config: FormIn) -> dict:
    return {"id": "f-1"}


r = TestClient(app).post("/forms", json={"title": "", "maxAnswers": 0})
print(r.status_code)
print(json.dumps(r.json(), indent=2))
```

```text
errors()[0]: {'type': 'string_too_short', 'loc': ('body', 'title'), 'msg': 'String should have at least 1 character', 'input': '', 'ctx': {'min_length': 1}}
422
{
  "error": {
    "code": "validation_error",
    "message": "2 invalid field(s)",
    "fields": [
      {
        "path": "title",
        "code": "string_too_short",
        "message": "String should have at least 1 character"
      },
      {
        "path": "maxAnswers",
        "code": "greater_than_equal",
        "message": "Input should be greater than or equal to 1"
      }
    ]
  }
}
```

<!-- task: t1 -->

> **Пастка.** Помилка з `model_validator` (m2-l09) має `loc` рівно `("body",)`, після зрізу джерела шлях порожній, і це сигнал фронтенду показати помилку над формою. А в `ctx` такої помилки лежить сам об'єкт `ValueError`, не рядок. Вбудований обробник проганяє відповідь через `jsonable_encoder`, а ваш `JSONResponse(content=exc.errors())` падає на серіалізації вже всередині обробника помилок.

```python
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, model_validator


class Range(BaseModel):
    min: int
    max: int

    @model_validator(mode="after")
    def check(self):
        if self.min > self.max:
            raise ValueError("min must be <= max")
        return self


app = FastAPI()


@app.exception_handler(RequestValidationError)
async def handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    err = exc.errors()[0]
    print(err["loc"], repr(err["msg"]), err["ctx"])
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.post("/ranges")
def create_range(r: Range) -> dict:
    return {}


try:
    TestClient(app).post("/ranges", json={"min": 5, "max": 1})
except TypeError as e:
    print("TypeError:", e)
print(jsonable_encoder({"error": ValueError("min must be <= max")}))
```

```text
('body',) 'Value error, min must be <= max' {'error': ValueError('min must be <= max')}
TypeError: Object of type ValueError is not JSON serializable
{'error': {}}
```

`jsonable_encoder` рятує від падіння, але перетворює виняток на порожній `{}`, тобто текст правила губиться. Для фронтенду корисніше взяти `str(err["ctx"]["error"])`: це рівно те, що ви написали в `raise ValueError(...)`, без префікса `Value error, `, який Pydantic додає в `msg`. Саме так і зроблено в завданні нижче.

<!-- task: t2 -->

## Неочікувані винятки: 500 без traceback назовні

Усе, що не має свого обробника (`KeyError` у сховищі, впала база, баг), доходить до найзовнішнього шару Starlette, `ServerErrorMiddleware`. За замовчуванням він віддає `500 Internal Server Error` текстом і пише traceback у лог сервера. Обробник `@app.exception_handler(Exception)` дає змогу віддати той самий JSON-формат і залогувати подію своїм логером. `log.exception` у ньому додає traceback до запису автоматично (логування детально в m5-l09).

```python
import logging
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

logging.basicConfig(stream=sys.stdout, level=logging.WARNING, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("formbuilder.api")


def make_app(debug: bool) -> FastAPI:
    app = FastAPI(debug=debug)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Internal server error"}},
        )

    @app.get("/forms/{form_id}")
    def get_form(form_id: str) -> dict:
        storage = {"contact": {"title": "Contact"}}
        return {"title": storage[form_id]["title"]}

    return app


client = TestClient(make_app(debug=False), raise_server_exceptions=False)
r = client.get("/forms/nope")
print(r.status_code, r.json())

print("--- debug=True")
client = TestClient(make_app(debug=True), raise_server_exceptions=False)
r = client.get("/forms/nope")
print(r.status_code, r.headers["content-type"])
print(r.text.splitlines()[0], "...", r.text.splitlines()[-1])

print("--- raise_server_exceptions=True")
try:
    TestClient(make_app(debug=False)).get("/forms/nope")
except KeyError as e:
    print("KeyError in test:", e)
```

```text
ERROR formbuilder.api unhandled error on GET /forms/nope
Traceback (most recent call last):
  ...
  File ".../lesson_example.py", line 26, in get_form
    return {"title": storage[form_id]["title"]}
                     ~~~~~~~^^^^^^^^^
KeyError: 'nope'
500 {'error': {'code': 'internal_error', 'message': 'Internal server error'}}
--- debug=True
500 text/plain; charset=utf-8
Traceback (most recent call last): ... KeyError: 'nope'
--- raise_server_exceptions=True
ERROR formbuilder.api unhandled error on GET /forms/nope
Traceback (most recent call last):
  ...
KeyError: 'nope'
KeyError in test: 'nope'
```

Клієнт отримав лише код і загальне повідомлення, traceback лишився в лозі. Причина не в "приховуванні від хакерів" як ритуалі: у traceback видно шляхи файлів, імена таблиць, шматки конфігу, а іноді й значення змінних у повідомленні винятку. Фронтенду з цього користі немає, бо він не може виправити баг сервера, а для зв'язку з логом достатньо request id, про який розділ нижче.

`debug=True` змінює поведінку цілком: `ServerErrorMiddleware` віддає traceback текстом і ваш обробник `Exception` не викликається взагалі, у виводі вище під `debug=True` немає рядка `ERROR`. Це зручно локально, коли клієнт це ви самі з `curl`, і неприпустимо в prod. Тому `debug` береться з налаштувань (`pydantic-settings`, m6-l06), а не пишеться в код.

> **Пастка.** `TestClient` за замовчуванням має `raise_server_exceptions=True`: навіть коли обробник `Exception` відпрацював і зібрав 500, той самий виняток вилітає у ваш тест. Starlette так робить навмисно, `ServerErrorMiddleware` після відповіді кидає виняток далі, щоб сервер його залогував. Для тесту формату 500 створюйте `TestClient(app, raise_server_exceptions=False)`; або ловіть виняток у middleware, як у розділі про CORS, тоді він не доходить до `ServerErrorMiddleware` зовсім.

<!-- task: q3 -->

## Middleware: request id, час обробки, порядок

Middleware (офіційний термін ASGI і Starlette) це функція навколо кожного запиту: отримує `request` і `call_next`, викликає `await call_next(request)` і повертає відповідь, можливо змінену. Це `app.use((req, res, next) => ...)` з Express, але замість `next()` без результату тут `call_next`, що повертає готовий `Response`. Код до виклику це "на вході", після нього "на виході", як в Koa з `await next()`.

```ts
app.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  ctx.set("Server-Timing", `app;dur=${(performance.now() - start).toFixed(1)}`);
});
```

```python
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

app = FastAPI()


@app.middleware("http")
async def timing(request: Request, call_next):
    print("timing: before")
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - start) * 1000:.1f}"
    print("timing: after")
    return response


@app.middleware("http")
async def request_id(request: Request, call_next):
    print("request_id: before")
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    print("request_id: after")
    return response


@app.get("/health")
def health(request: Request) -> dict:
    print("endpoint, request_id =", request.state.request_id)
    return {"ok": True}


r = TestClient(app).get("/health", headers={"X-Request-ID": "req-1"})
print(r.json(), r.headers["x-request-id"], r.headers["server-timing"].startswith("app;dur="))
```

```text
request_id: before
timing: before
endpoint, request_id = req-1
timing: after
request_id: after
{'ok': True} req-1 True
```

Різниця з Koa і Express саме в порядку. Там middleware виконуються в порядку `use`. Тут `request_id`, оголошений другим, працює першим: кожен новий middleware загортає весь попередній стек, тож останній доданий стає зовнішнім. `@app.middleware("http")` і `app.add_middleware(...)` поводяться однаково, порядок лише в тому, хто доданий пізніше.

`request.state` це простір імен для даних одного запиту: middleware кладе туди `request_id`, обробник і залежності читають. Аналог `res.locals` в Express або `req.user` після passport. Об'єкт новий на кожен запит, тож сюди не потрапляють дані сусіднього запиту, на відміну від глобальної змінної модуля.

Повний стек можна побачити, пройшовши атрибути `.app` від зовнішнього шару. Обробники винятків живуть у двох місцях: `ServerErrorMiddleware` зовні (для `Exception` і 500) і `ExceptionMiddleware` всередині, одразу над маршрутизатором (для всього іншого). Ваші middleware стоять між ними.

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()


@app.middleware("http")
async def request_context(request: Request, call_next):
    return await call_next(request)


app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"])

layer = app.build_middleware_stack()
while type(layer).__name__ != "APIRouter":
    name = type(layer).__name__
    if name == "BaseHTTPMiddleware":
        name += f"({layer.dispatch_func.__name__})"
    print(name)
    layer = layer.app
print("APIRouter")
```

```text
ServerErrorMiddleware
ExceptionTelemetryMiddleware
CORSMiddleware
GZipMiddleware
BaseHTTPMiddleware(request_context)
ExceptionMiddleware
AsyncExitStackMiddleware
APIRouter
```

Звідси два наслідки. Відповіді, зібрані обробниками з `ExceptionMiddleware` (404, 422, `ConfigError`), проходять крізь ваші middleware назад і отримують `X-Request-ID`. А 500 від обробника `Exception` збирається вже зовні, тож ваші middleware його не бачать; до цього повернемось у розділі про CORS. `ExceptionTelemetryMiddleware` це вбудована в цю версію FastAPI інтеграція з OpenTelemetry, на поведінку уроку вона не впливає.

<!-- task: t4 -->

`@app.middleware("http")` під капотом створює `BaseHTTPMiddleware`, і в нього є обмеження. Відповідь з `call_next` це потік: `.body` немає, щоб змінити тіло, треба вичитати `body_iterator` і зібрати нову відповідь. Нижній код виконується в окремій задачі, тож значення `ContextVar`, встановлене в обробнику, назовні не повертається; `request.state` повертається, бо це звичайний об'єкт.

```python
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

current_user: ContextVar[str] = ContextVar("current_user", default="anonymous")
app = FastAPI()


@app.middleware("http")
async def inspect(request: Request, call_next):
    response = await call_next(request)
    print(type(response).__name__, hasattr(response, "body"))
    print("contextvar seen by middleware:", current_user.get())
    print("state seen by middleware:", request.state.user)
    return response


@app.get("/me")
async def me(request: Request) -> dict:
    current_user.set("bogdan")
    request.state.user = "bogdan"
    return {"user": current_user.get()}


print(TestClient(app).get("/me").json())
```

```text
_StreamingResponse False
contextvar seen by middleware: anonymous
state seen by middleware: bogdan
{'user': 'bogdan'}
```

Для заголовків, логів і таймінгів цих обмежень не відчути. Коли треба переписувати тіло, працювати з WebSocket (m7-l04) або прибрати накладні витрати на кожен запит, пишуть чисте ASGI-middleware: клас з `async def __call__(self, scope, receive, send)`, який загортає `send` і бачить сирі повідомлення протоколу; так написані `CORSMiddleware` і `GZipMiddleware`.

У зворотний бік `ContextVar` працює: значення, встановлене в middleware до `call_next`, бачать обробник, залежності й усі логери нижче, і в `async def`, і в `def`, що виконується в threadpool. На цьому будується request id у логах: middleware ставить `ContextVar` (contextvars детально в m5-l09), `logging.Filter` дописує його в кожен запис. Жодна функція не передає `request_id` параметром.

```python
import logging
import sys
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


handler = logging.StreamHandler(sys.stdout)
handler.addFilter(RequestIdFilter())
handler.setFormatter(logging.Formatter("%(levelname)s [%(request_id)s] %(name)s: %(message)s"))
logging.basicConfig(level=logging.INFO, handlers=[handler])
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("formbuilder.api")

app = FastAPI()


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    token = request_id_var.set(rid)
    try:
        log.info("%s %s", request.method, request.url.path)
        response = await call_next(request)
        log.info("-> %s", response.status_code)
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = rid
    return response


@app.post("/forms")
def create_form() -> dict:
    log.info("saving form")
    return {"id": "f-1"}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str) -> dict:
    log.info("looking up job %s", job_id)
    return {"id": job_id, "status": "queued"}


client = TestClient(app)
client.post("/forms", headers={"X-Request-ID": "req-a"})
client.get("/jobs/j-1", headers={"X-Request-ID": "req-b"})
log.info("outside of any request")
```

```text
INFO [req-a] formbuilder.api: POST /forms
INFO [req-a] formbuilder.api: saving form
INFO [req-a] formbuilder.api: -> 200
INFO [req-b] formbuilder.api: GET /jobs/j-1
INFO [req-b] formbuilder.api: looking up job j-1
INFO [req-b] formbuilder.api: -> 200
INFO [-] formbuilder.api: outside of any request
```

> **Для капстоуну.** Якщо в капстоуні вже налаштовано structlog з m5-l09, `ContextVar` і фільтр не потрібні: у middleware викликається `structlog.contextvars.bind_contextvars(request_id=rid)`, а в `finally` `clear_contextvars()`. Механізм той самий, contextvars, тільки обгорнутий бібліотекою.

## CORS для фронтенду FormBuilder

Фронтенд конструктора в dev живе на `http://localhost:5173` (Vite), API на іншому порту, тобто інший origin. CORS (Cross-Origin Resource Sharing) ви знаєте з боку браузера; з боку FastAPI це один готовий `CORSMiddleware`. Він відповідає на preflight-запити `OPTIONS` (preflight, термін зі специфікації Fetch) сам, не пускаючи їх до маршрутів, і додає `Access-Control-*` до звичайних відповідей.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

app = FastAPI()


@app.post("/forms")
def create_form() -> dict:
    return {"id": "f-1"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Request-ID"],
    allow_credentials=True,
    expose_headers=["X-Request-ID"],
    max_age=600,
)


def show(r, *names):
    print(r.status_code, {n.removeprefix("access-control-"): r.headers.get(n) for n in names})


client = TestClient(app)
preflight = {
    "Origin": "http://localhost:5173",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
}
r = client.options("/forms", headers=preflight)
show(r, "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers",
     "access-control-allow-credentials", "access-control-max-age")
r = client.post("/forms", headers={"Origin": "http://localhost:5173"})
show(r, "access-control-allow-origin", "access-control-expose-headers", "vary")
r = client.options("/forms", headers={**preflight, "Origin": "https://evil.example"})
print(r.status_code, r.text)
r = client.post("/forms", headers={"Origin": "https://evil.example"})
print(r.status_code, r.headers.get("access-control-allow-origin"), r.json())
```

```text
200 {'allow-origin': 'http://localhost:5173', 'allow-methods': 'GET, POST, PATCH, DELETE', 'allow-headers': 'Accept, Accept-Language, Content-Language, Content-Type, X-Request-ID', 'allow-credentials': 'true', 'max-age': '600'}
200 {'allow-origin': 'http://localhost:5173', 'expose-headers': 'X-Request-ID', 'vary': 'Origin'}
400 Disallowed CORS origin
200 None {'id': 'f-1'}
```

Параметри один в один з пакетом `cors` для Express: `allow_origins` це `origin`, `allow_credentials` це `credentials`, `expose_headers` потрібен, щоб `fetch` у фронтенді міг прочитати `X-Request-ID` з відповіді. Для preview-деплоїв з динамічними піддоменами є `allow_origin_regex`. Список origin-ів береться з налаштувань, бо в dev і prod він різний.

> **Пастка.** Останній рядок виводу: POST з чужого origin виконався, обробник створив форму, просто без `Access-Control-Allow-Origin`. `CORSMiddleware` не блокує запити, він лише каже браузеру, чи можна показати відповідь скрипту. `curl`, бекенд-клієнт або форма з `<form method=post>` отримують повну обробку. Захист від таких запитів це автентифікація й CSRF-токени, і це вже інший курс.

> **Пастка.** У Express `cors({ origin: "*", credentials: true })` віддає буквальний `*`, і браузер відмовляється, тобто конфіг просто не працює. У Starlette ця сама комбінація працює, і саме тому небезпечна: middleware віддзеркалює будь-який `Origin` разом з `Access-Control-Allow-Credentials: true`. Будь-який сайт може робити запити з cookies користувача й читати відповіді.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

for creds in (False, True):
    app = FastAPI()

    @app.get("/forms")
    def list_forms() -> list:
        return []

    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=creds)
    r = TestClient(app).get("/forms", headers={"Origin": "https://evil.example", "Cookie": "session=abc"})
    print(f"allow_credentials={creds}:", r.headers.get("access-control-allow-origin"),
          r.headers.get("access-control-allow-credentials"))
```

```text
allow_credentials=False: * None
allow_credentials=True: https://evil.example true
```

<!-- task: q2 -->

Тепер про те, що middleware не бачать 500. Нижче `request_id` і CORS налаштовані, обробник `Exception` є, а обробник маршруту падає з `RuntimeError`. Відповідь 404 отримує обидва заголовки, відповідь 500 жодного. Для браузера це означає, що замість 500 з JSON фронтенд бачить CORS-помилку в консолі й `TypeError: Failed to fetch` у коді: тіло відповіді скрипту недоступне.

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"])


@app.middleware("http")
async def request_id(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Request-ID"] = "req-1"
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error"}})


@app.get("/missing")
def missing() -> dict:
    raise HTTPException(404, "nope")


@app.get("/boom")
def boom() -> dict:
    raise RuntimeError("db is down")


client = TestClient(app, raise_server_exceptions=False)
for path in ["/missing", "/boom"]:
    r = client.get(path, headers={"Origin": "http://localhost:5173"})
    print(path, r.status_code, r.json(),
          "x-request-id:", r.headers.get("x-request-id"),
          "allow-origin:", r.headers.get("access-control-allow-origin"))
```

```text
/missing 404 {'detail': 'nope'} x-request-id: req-1 allow-origin: http://localhost:5173
/boom 500 {'error': {'code': 'internal_error'}} x-request-id: None allow-origin: None
```

404 зібрав обробник в `ExceptionMiddleware`, усередині стеку, і відповідь пройшла назад крізь `request_id` і CORS. 500 зібрав обробник `Exception` у `ServerErrorMiddleware` над усім стеком: виняток пролетів крізь ваші middleware нагору, і відповідь до них уже не повернулась. Порядок тут теж має значення: `CORSMiddleware` додано першим, у коді вище, тож він внутрішній, а `request_id` зовнішній.

Виправлення в двох кроках. Перший: middleware з request id ловить `Exception` навколо `call_next`, логує і сам збирає 500, тож відповідь іде нормальним шляхом назад крізь стек. Другий: `CORSMiddleware` додається останнім, щоб бути зовнішнім і ставити заголовки на будь-яку відповідь, включно з цією 500.

```python
import logging
import sys
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("formbuilder.api")

app = FastAPI()


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error, request_id=%s", rid)
        response = JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Internal server error", "requestId": rid}},
        )
    response.headers["X-Request-ID"] = rid
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.get("/boom")
def boom() -> dict:
    raise RuntimeError("db is down")


r = TestClient(app).get("/boom", headers={"Origin": "http://localhost:5173", "X-Request-ID": "req-7"})
print(r.status_code, r.json())
print("x-request-id:", r.headers.get("x-request-id"))
print("allow-origin:", r.headers.get("access-control-allow-origin"))
```

```text
ERROR formbuilder.api unhandled error, request_id=req-7
Traceback (most recent call last):
  ...
RuntimeError: db is down
500 {'error': {'code': 'internal_error', 'message': 'Internal server error', 'requestId': 'req-7'}}
x-request-id: req-7
allow-origin: http://localhost:5173
```

Зверніть увагу: `TestClient` з `raise_server_exceptions=True` за замовчуванням тут не кинув, бо виняток зупинився в middleware і до `ServerErrorMiddleware` не дійшов. Обробник `@app.exception_handler(Exception)` після цього можна лишити як страховку на випадок падіння в самому middleware, але основний шлях 500 тепер проходить крізь стек.

<!-- task: q4 -->

## OpenAPI: контракт для фронтенду

`/openapi.json` з m7-l01 будується з тих самих анотацій, що й валідація, тож він не розходиться з кодом. Метадані для читача документації додаються параметрами декоратора: `tags` групують операції, `summary` це заголовок, докстрінг функції стає `description` з Markdown. `responses` описує відповіді, яких FastAPI не бачить у сигнатурі, наприклад 404 з вашим форматом помилки, а `examples` у моделі чи полі показує приклад у `/docs`.

```python
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field


class ErrorBody(BaseModel):
    code: str = Field(examples=["job_not_found"])
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class JobOut(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"id": "j-42", "status": "done", "url": "/sites/contact/"}]}
    )
    id: str
    status: str
    url: str | None = None


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get(
    "/{job_id}",
    summary="Get build job status",
    response_model=JobOut,
    responses={404: {"model": ErrorResponse, "description": "Job does not exist"}},
)
def get_job(job_id: str) -> JobOut:
    """Returns the status of a build job.

    Poll this until `status` is `done` or `failed`.
    """
    return JobOut(id=job_id, status="queued")


def make_app(openapi_url: str | None = "/openapi.json") -> FastAPI:
    app = FastAPI(
        title="FormBuilder API",
        version="1.0.0",
        openapi_url=openapi_url,
        openapi_tags=[{"name": "jobs", "description": "Build jobs and their status"}],
    )
    app.include_router(router)
    return app


spec = TestClient(make_app()).get("/openapi.json").json()
op = spec["paths"]["/jobs/{job_id}"]["get"]
print(op["tags"], op["summary"], op["operationId"])
print(repr(op["description"]))
print(sorted(op["responses"]))
print(op["responses"]["404"])
print(op["responses"]["422"]["content"]["application/json"]["schema"])
print(spec["components"]["schemas"]["JobOut"]["examples"])
print(spec["components"]["schemas"]["ErrorBody"]["properties"]["code"])

prod = TestClient(make_app(openapi_url=None))
print([prod.get(p).status_code for p in ("/openapi.json", "/docs", "/redoc", "/jobs/j-1")])
```

```text
['jobs'] Get build job status get_job_jobs__job_id__get
'Returns the status of a build job.\n\nPoll this until `status` is `done` or `failed`.'
['200', '404', '422']
{'description': 'Job does not exist', 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/ErrorResponse'}}}}
{'$ref': '#/components/schemas/HTTPValidationError'}
[{'id': 'j-42', 'status': 'done', 'url': '/sites/contact/'}]
{'type': 'string', 'title': 'Code', 'examples': ['job_not_found']}
[404, 404, 404, 200]
```

`openapi_url=None` вимикає і схему, і `/docs`, і `/redoc` одним параметром, а API працює далі. У prod це прибирає з публічного доступу повну карту ендпоінтів; як і `debug`, значення береться з налаштувань.

> **Пастка.** У виводі 422 досі посилається на `HTTPValidationError`, тобто на стандартний формат `{"detail": [...]}`, хоча обробник ви перевизначили. FastAPI не аналізує ваші обробники винятків, схема описує поведінку за замовчуванням. Якщо фронтенд генерує типи зі схеми, він отримає неправильний тип помилки. Лікується `responses={422: {"model": ErrorResponse}}` на рівні застосунку або роутера.

Друга річ, яку видно у виводі, це `operationId` виду `get_job_jobs__job_id__get`. З нього генератори TS-клієнтів роблять імена методів, і `getJobJobsJobIdGet` у коді фронтенду нікому не потрібен. Параметр `generate_unique_id_function` задає власне правило.

```python
from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: dict


def operation_id(route: APIRoute) -> str:
    return f"{route.tags[0]}_{route.name}"


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(job_id: str) -> dict:
    return {}


app = FastAPI(
    generate_unique_id_function=operation_id,
    responses={422: {"model": ErrorResponse, "description": "Validation error"}},
)
app.include_router(router)
op = TestClient(app).get("/openapi.json").json()["paths"]["/jobs/{job_id}"]["get"]
print(op["operationId"], op["responses"]["422"]["description"],
      op["responses"]["422"]["content"]["application/json"]["schema"])
```

```text
jobs_get_job Validation error {'$ref': '#/components/schemas/ErrorResponse'}
```

> **JS-аналог.** Місток до фронтенду: `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts` генерує TS-типи з цієї схеми, а `orval` чи `@hey-api/openapi-ts` ще й клієнт з методами. Це той самий контракт, який ви у FormBuilder узгоджували вручну, тільки тепер його джерело це Pydantic-моделі.

## URL-простір: /api/v1, проксі, trailing slash, статика

Версія API це просто префікс роутера. `APIRouter(prefix="/api/v1")` включає в себе роутери `forms` і `jobs` з m7-l01, а застосунок включає його. Коли з'явиться `v2`, це другий роутер поруч, а не гілки `if version` в обробниках.

```python
from fastapi import APIRouter, FastAPI, Request
from fastapi.testclient import TestClient

forms = APIRouter(prefix="/forms", tags=["forms"])


@forms.get("")
def list_forms() -> list:
    return []


@forms.get("/{form_id}")
def get_form(form_id: str, request: Request) -> dict:
    return {
        "self": str(request.url_for("get_form", form_id=form_id)),
        "path": request.url.path,
        "root_path": request.scope.get("root_path"),
    }


api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(forms)

app = FastAPI()
app.include_router(api_v1)
client = TestClient(app)
print(list(client.get("/openapi.json").json()["paths"]))
print(client.get("/api/v1/forms").json())
r = client.get("/api/v1/forms/", follow_redirects=False)
print(r.status_code, r.headers.get("location"))
print(client.get("/api/v1/forms/contact").json())

behind_proxy = FastAPI(root_path="/builder")
behind_proxy.include_router(api_v1)
client = TestClient(behind_proxy)
print(client.get("/api/v1/forms/contact").json())
print(client.get("/openapi.json").json().get("servers"))
```

```text
['/api/v1/forms', '/api/v1/forms/{form_id}']
[]
307 http://testserver/api/v1/forms
{'self': 'http://testserver/api/v1/forms/contact', 'path': '/api/v1/forms/contact', 'root_path': ''}
{'self': 'http://testserver/builder/api/v1/forms/contact', 'path': '/api/v1/forms/contact', 'root_path': '/builder'}
[{'url': '/builder'}]
```

`root_path` потрібен, коли проксі (nginx, Traefik) публікує застосунок під префіксом і зрізає його перед передачею: ззовні `/builder/api/v1/forms`, усередині `/api/v1/forms`. Маршрути не змінюються, але `url_for` і `servers` у схемі отримують префікс, тож `/docs` за проксі шле запити на правильну адресу. Те саме задається прапорцем `uvicorn --root-path /builder` при запуску (m7-l07).

Trailing slash: маршрут `"/api/v1/forms"` на запит `"/api/v1/forms/"` відповідає редиректом 307 на версію без слеша, і навпаки. Це зайвий round trip, а за проксі без `--proxy-headers` `Location` може вказувати на `http://` замість `https://`. Простіше вибрати одну форму, без слеша, і вимкнути вгадування: з `FastAPI(redirect_slashes=False)` чужа форма дає чесний 404.

```python
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

router = APIRouter(prefix="/api/v1/forms")


@router.get("")
def list_forms() -> list:
    return []


app = FastAPI(redirect_slashes=False)
app.include_router(router)
client = TestClient(app)
print(client.get("/api/v1/forms").status_code, client.get("/api/v1/forms/").status_code)
```

```text
200 404
```

Згенеровані сторінки форм це статика, і віддає її `StaticFiles`, змонтований через `app.mount`. Змонтований застосунок (mount) живе поза роутингом FastAPI: його немає в OpenAPI, на нього не діють `Depends`. `html=True` віддає `index.html` для шляху-директорії, як статичний хостинг. Для одного файлу з обробника є `FileResponse`: він сам ставить `content-type`, `ETag` і з `filename=` заголовок для завантаження. `StreamingResponse` приймає генератор, звичайний або асинхронний (m5-l02, m5-l06), і віддає частини в міру появи, не збираючи все в пам'яті.

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

OUT = Path("out")
(OUT / "contact").mkdir(parents=True, exist_ok=True)
(OUT / "contact" / "index.html").write_text("<h1>Contact</h1>\n", encoding="utf-8")
(OUT / "contact" / "app.css").write_text("h1 { color: red }\n", encoding="utf-8")

app = FastAPI()


@app.get("/api/v1/forms/{form_id}/export")
def export(form_id: str) -> FileResponse:
    return FileResponse(OUT / form_id / "index.html", filename=f"{form_id}.html")


def build_log(form_id: str):
    for step in ("validate", "render", "publish"):
        yield f"{form_id}: {step}\n"


@app.get("/api/v1/forms/{form_id}/log")
def log(form_id: str) -> StreamingResponse:
    return StreamingResponse(build_log(form_id), media_type="text/plain")


app.mount("/sites", StaticFiles(directory=OUT, html=True), name="sites")

client = TestClient(app)
for path in ("/sites/contact/", "/sites/contact/app.css", "/sites/contact", "/sites/nope/"):
    r = client.get(path, follow_redirects=False)
    print(path, r.status_code, r.headers.get("content-type"), r.headers.get("location"), repr(r.text[:20]))
r = client.get("/api/v1/forms/contact/export")
print(r.status_code, r.headers["content-type"], r.headers["content-disposition"], "etag" in r.headers)
with client.stream("GET", "/api/v1/forms/contact/log") as r:
    print(r.headers["content-type"], r.headers.get("content-length"))
    for line in r.iter_lines():
        print("chunk:", line)
```

```text
/sites/contact/ 200 text/html; charset=utf-8 None '<h1>Contact</h1>\n'
/sites/contact/app.css 200 text/css; charset=utf-8 None 'h1 { color: red }\n'
/sites/contact 307 None http://testserver/sites/contact/ ''
/sites/nope/ 404 application/json None '{"detail":"Not Found'
200 text/html; charset=utf-8 attachment; filename="contact.html" True
text/plain; charset=utf-8 None
chunk: contact: validate
chunk: contact: render
chunk: contact: publish
```

У `StreamingResponse` немає `content-length`: довжина невідома наперед, відповідь іде частинами. 404 від `StaticFiles` має формат `{"detail": ...}`, бо це Starlette-івський `HTTPException`; обробник на `starlette.exceptions.HTTPException` з першого розділу зведе і його до вашого формату.

> **Пастка.** `StaticFiles(directory="out")` перевіряє існування директорії в момент створення і падає з `RuntimeError`, якщо її ще немає. У капстоуні `out/` з'являється після першої збірки, тож або створюйте її на старті в `lifespan` (m7-l01), або передавайте `check_dir=False`. І шлях краще брати з налаштувань як абсолютний: відносний `"out"` рахується від робочої директорії процесу, а не від файлу з кодом.

## Для капстоуну

Фронтенд FormBuilder отримує помилки однієї форми з будь-якого ендпоінта: `{"error": {"code", "message", "fields"}}`. `code` машинний (`validation_error`, `invalid_config`, `job_not_found`, `http_404`, `internal_error`), за ним фронтенд вибирає поведінку; `message` для людини; `fields` плоский список `{path, code, message}`, порожній, якщо помилка не про поля. Шлях `path` збігається з camelCase-іменами з моделей, тож його можна напряму передати в `setError` форми конструктора.

Обробка живе в пакеті `formbuilder/api/` з m7-l01: `errors.py` з моделями формату й обробниками, `middleware.py` з request id і CORS. Модуль конфігу й воркер нічого не знають про HTTP. `ConfigError` з m3-l03 кидається з `from exc` над `ValidationError`, і обробник витягає поля з `exc.__cause__`. `JobNotFound` додається в `formbuilder/jobs.py` поруч з `GenerationJob`.

```python
# src/formbuilder/api/errors.py (фрагмент)
class FieldError(BaseModel):
    path: str
    code: str
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: list[FieldError] = []


class ErrorResponse(BaseModel):
    error: ErrorBody


def error_response(status: int, body: ErrorBody, headers: Mapping[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content=ErrorResponse(error=body).model_dump(), headers=headers)


async def config_error(request: Request, exc: Exception) -> JSONResponse:
    cause = exc.__cause__
    fields = to_field_errors(cause.errors()) if isinstance(cause, ValidationError) else []
    return error_response(422, ErrorBody(code="invalid_config", message=str(exc), fields=fields))


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(ConfigError, config_error)
    app.add_exception_handler(JobNotFound, job_not_found)
    app.add_exception_handler(StarletteHTTPException, http_error)
```

`ErrorResponse` працює двічі: збирає тіло відповіді й стоїть у `responses={404: {"model": ErrorResponse}, 422: {...}}`, тож схема в `/openapi.json` описує той формат, який реально віддається. Сигнатура обробників `(request, exc: Exception)` замість конкретного типу потрібна для `mypy --strict`: `add_exception_handler` типізований під загальний `Exception`, і обробник з `exc: JobNotFound` mypy відхиляє як `arg-type`. `headers` типізовано як `Mapping`, бо саме такий тип має `exc.headers` у Starlette.

```python
# src/formbuilder/api/middleware.py (фрагмент)
def install_middleware(app: FastAPI, cors_origins: list[str]) -> None:
    app.middleware("http")(request_context)  # request id, час, 500 з логом
    app.add_middleware(                      # останнім, тобто зовнішнім
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
```

Тести шару помилок не залежать від того, які маршрути вже є: тестова фікстура створює застосунок і додає до нього службові маршрути, що кидають `ConfigError` і `RuntimeError`. Повний список вимог у проєктному завданні. Еталонне рішення з дев'ятьма тестами за чеклистом проходить так (і `mypy --strict` без помилок):

```text
.........                                                                [100%]
9 passed, 1 warning in 0.47s
```

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Error-handling middleware з чотирма аргументами.** Шукають аналог `app.use((err, req, res, next) => ...)` і пишуть middleware з `try/except` на всі випадки. Для доменних винятків тут є `@app.exception_handler(Cls)`, один на клас, з пошуком за MRO. `try/except` у middleware лише для неочікуваних 500.

   ```python
   @app.exception_handler(ConfigError)
   async def config_error(request: Request, exc: ConfigError) -> JSONResponse:
       return JSONResponse({"error": {"code": "invalid_config", "message": str(exc)}}, status_code=422)
   ```

2. **`try/catch` у кожному обробнику.** Переносять звичку обгортати тіло контролера і повертати `res.status(...)`. Обробник маршруту в FastAPI не ловить нічого: кидає домен, ловить зареєстрований обробник.

   ```python
   @app.get("/jobs/{job_id}")
   def get_job(job_id: str) -> dict:
       return jobs.get(job_id)  # get кидає JobNotFound, 404 збирає обробник
   ```

3. **`HTTPException` у доменному коді.** `raise HTTPException(422)` у `load_config` прив'язує модуль конфігу до HTTP, і CLI з m6-l06 отримує виняток про статус-код. Домен кидає `ConfigError`, у HTTP його перекладає межа.

   ```python
   raise ConfigError(f"{path.name}: invalid") from exc  # а не HTTPException(422, ...)
   ```

4. **`next()` без результату.** Пишуть `await call_next(request)` і забувають `return response`, як у Express, де `next()` нічого не повертає. Middleware повертає `None`, і запит падає з `TypeError: 'NoneType' object is not callable`.

   ```python
   @app.middleware("http")
   async def headers(request: Request, call_next):
       response = await call_next(request)
       response.headers["X-Content-Type-Options"] = "nosniff"
       return response  # без цього рядка: TypeError
   ```

5. **`cors()` з `*` і credentials.** У Express така комбінація не працює, у Starlette працює і віддзеркалює будь-який origin з `allow-credentials: true`. Явний список origin-ів з налаштувань.

   ```python
   app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True)
   ```

6. **CORS першим, як `app.use(cors())` на початку файлу.** Тут перший доданий middleware внутрішній, і 500 приходить без `Access-Control-Allow-Origin`, тож фронтенд бачить CORS-помилку замість відповіді. `CORSMiddleware` додається останнім.

   ```python
   app.middleware("http")(request_context)
   app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"])  # останнім
   ```

7. **`JSONResponse(content=exc.errors())`.** Переносять `res.json(error.issues)` із Zod. Помилка `model_validator` має в `ctx` об'єкт `ValueError`, і серіалізація падає вже в обробнику помилок. Будуйте свій формат з `loc`, `type`, `msg` або проганяйте через `jsonable_encoder`.

   ```python
   fields = [{"path": loc_to_path(e["loc"]), "code": e["type"], "message": e["msg"]} for e in exc.errors()]
   ```

8. **helmet-мислення.** Шукають один пакет, що "робить безпеку". Тут кожен заголовок це рядок у middleware, перевірка `Host` окремий `TrustedHostMiddleware`, а TLS, HSTS і rate limit зазвичай ставить проксі перед uvicorn.

   ```python
   from fastapi.middleware.trustedhost import TrustedHostMiddleware
   app.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.formbuilder.local"])  # чужий Host: 400
   ```

## Підсумок

- `HTTPException(status, detail, headers)` лише в шарі API; домен кидає свої винятки, у відповідь їх перекладає `@app.exception_handler(Cls)`.
- Обробник шукається за `type(exc).__mro__`: базовий клас ловить нащадків, специфічніший обробник перемагає.
- 404 і 405 від маршрутизатора та `StaticFiles` це `starlette.exceptions.HTTPException`; обробник реєструйте на нього.
- 422 приходить як `RequestValidationError`; `loc` уже містить аліаси, тобто camelCase; перший елемент `loc` це джерело. В `ctx` може лежати об'єкт винятку, тому формат будується вручну.
- 500: traceback у лог, клієнту код і request id. `debug=True` віддає traceback і обходить ваш обробник `Exception`; `TestClient` за замовчуванням перекидає серверні винятки в тест.
- Останній доданий middleware зовнішній. Між вашими middleware і маршрутом стоїть `ExceptionMiddleware`, над ними `ServerErrorMiddleware`, який 500 збирає повз вас.
- `request.state` для даних запиту, `ContextVar` + `logging.Filter` для request id у логах без передачі параметром.
- `CORSMiddleware` додається останнім, origin-и явним списком; `*` з credentials віддзеркалює будь-який origin; CORS не блокує запити на сервері.
- OpenAPI: `tags`, `summary`, докстрінг, `responses={404: {"model": ErrorResponse}}`, перевизначений 422, `generate_unique_id_function` для імен у TS-клієнті, `openapi_url=None` у prod.
- `/api/v1` це префікс роутера; `root_path` для проксі з префіксом; `redirect_slashes=False` і одна форма шляхів; `StaticFiles` змонтований поза OpenAPI, `FileResponse` для файлу, `StreamingResponse` для генератора.

## Що далі

Наступний урок m7-l03 про фонові задачі: `BackgroundTasks` і воркер на `asyncio.Queue`, який запускає `POST /forms/{id}/build`. Там знадобиться все про межу помилок: виняток у фоновій задачі вже не має HTTP-відповіді, тож його треба записати в задачу й залогувати з тим самим контекстом, а `JobNotFound` з цього уроку стане відповіддю `GET /jobs/{id}`. Тести всього шару API через `httpx.AsyncClient` і фікстури розібрані в m7-l05.
