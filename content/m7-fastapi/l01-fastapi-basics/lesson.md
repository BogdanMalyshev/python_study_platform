---
id: m7-l01
module: m7-fastapi
title: "FastAPI: роутери, моделі запитів і відповідей, Depends"
summary: "Учень збирає FastAPI-застосунок з пакета formbuilder/api: параметри й тіло з сигнатури функції, Pydantic-моделі на вході й виході, APIRouter, залежності через Depends з yield і dependency_overrides, lifespan і налаштування, і розуміє, де виконується def, а де async def."
duration_min: 90
prerequisites: [m6-l08]
---

## Застосунок і маршрут: декоратор замість `app.get(path, handler)`

FastAPI це тонкий шар над Starlette (ASGI-фреймворк) і Pydantic. ASGI (Asynchronous Server Gateway Interface) це офіційна назва специфікації: контракт між сервером на кшталт uvicorn і застосунком, приблизно як `(req, res)` між Node `http` і Express, лише асинхронний. Застосунок це об'єкт `FastAPI()`, маршрут це звичайна функція, зареєстрована декоратором.

```ts
// Express
app.get("/health", (req, res) => res.json({ status: "ok" }));

// NestJS
@Controller()
export class HealthController {
  @Get("health")
  health() {
    return { status: "ok" };
  }
}
```

```python
# src/formbuilder/api/app.py
from fastapi import FastAPI

app = FastAPI(title="FormBuilder API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

Розходиться в трьох місцях. Обробник не отримує `req` і `res`: він повертає значення, і FastAPI сам серіалізує його в JSON. Класу-контролера немає, функція живе на рівні модуля. І все, що в NestJS описують декораторами параметрів (`@Param`, `@Query`, `@Body`), тут береться з анотацій типів у сигнатурі; про це наступний розділ. У документації FastAPI така функція називається path operation function, у розмові просто endpoint або обробник.

Запуск через uvicorn: аргумент `модуль:змінна` каже, який модуль імпортувати й який об'єкт у ньому є застосунком. `--reload` перезапускає процес при зміні файлів, це `nodemon` вбудований у сервер, і лише для розробки.

```text
$ uvicorn formbuilder.api.app:app --reload
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [78100] using StatReload
INFO:     Started server process [78103]
INFO:     Waiting for application startup.
INFO:     Application startup complete.

$ curl -i http://127.0.0.1:8000/health
HTTP/1.1 200 OK
date: Sun, 18 Oct 2026 15:43:46 GMT
server: uvicorn
content-length: 15
content-type: application/json

{"status":"ok"}
```

Документацію ви не пишете: `/openapi.json` віддає OpenAPI 3.1 схему, зібрану з маршрутів і анотацій, а `/docs` віддає Swagger UI поверх неї (`/redoc` той самий зміст в іншому інтерфейсі). Анотація `-> dict[str, str]` вже потрапила в схему відповіді.

```text
$ curl -s http://127.0.0.1:8000/openapi.json | python -m json.tool
{
    "openapi": "3.1.0",
    "info": {
        "title": "FormBuilder API",
        "version": "0.1.0"
    },
    "paths": {
        "/health": {
            "get": {
                "summary": "Health",
                "operationId": "health_health_get",
                "responses": {
                    "200": {
                        "description": "Successful Response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "additionalProperties": {
                                        "type": "string"
                                    },
                                    "type": "object",
                                    "title": "Response Health Health Get"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

> **Під капотом.** `@app.get("/health")` це фабрика-реєстратор з m5-l04: вона кладе функцію в таблицю маршрутів і повертає її без змін. Тому `health` лишається звичайною функцією, яку можна викликати напряму, а сигнатуру FastAPI читає через `inspect.signature` один раз, при реєстрації. Звідси ж обмеження з m5-l04: декоратор без `functools.wraps` між `@app.get` і вашою функцією сховає від FastAPI параметри.

Приклади далі запускаються без сервера, через `TestClient`: це HTTP-клієнт на httpx, який викликає ASGI-застосунок прямо в процесі. Детально про нього і про `httpx.AsyncClient` в m7-l05, тут він лише показує, що повертає сервер.

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI(title="FormBuilder API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


print(health())
print([(route.path, sorted(route.methods)) for route in app.routes])

client = TestClient(app)
response = client.get("/health")
print(response.status_code, response.json())
```

```text
{'status': 'ok'}
[('/openapi.json', ['GET', 'HEAD']), ('/docs', ['GET', 'HEAD']), ('/docs/oauth2-redirect', ['GET', 'HEAD']), ('/redoc', ['GET', 'HEAD']), ('/health', ['GET'])]
200 {'status': 'ok'}
```

> **Пастка.** Зі Starlette 1.x і звичайним `httpx` імпорт `TestClient` друкує в stderr `StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.` Це попередження, а не помилка: клієнт працює, тести проходять. Капстоун ставить `httpx2` dev-залежністю (`uv add --dev httpx2 asgi-lifespan`, обґрунтування разом з плагіном anyio в m7-l05), і з ним попередження зникає. У виводі прикладів нижче цей рядок не повторюється.

## Параметри читаються з сигнатури

В Express ви дістаєте значення з `req.params`, `req.query`, `req.body` і самі приводите типи. У NestJS декоратор параметра каже, звідки значення, а pipe перетворює і валідує. У FastAPI джерело і тип визначає сама сигнатура.

```ts
app.get("/forms/:formId", (req, res) => {
  const formId = Number(req.params.formId);        // NaN, якщо "abc"
  const limit = Number(req.query.limit ?? 20);
  res.json({ formId, limit });
});

// NestJS
@Get(":formId")
read(@Param("formId", ParseIntPipe) formId: number, @Query("limit") limit = 20) {}
```

```python
from typing import Annotated

from fastapi import Cookie, FastAPI, Header, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

app = FastAPI()


class FormIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    elements: list[dict] = []


@app.get("/forms/{form_id}")
def read_form(form_id: int, version: int | None = None, draft: bool = False) -> dict:
    return {"form_id": form_id, "version": version, "draft": draft}


@app.get("/forms")
def list_forms(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    tag: Annotated[list[str], Query()] = [],
) -> dict:
    return {"limit": limit, "tag": tag}


@app.post("/forms")
def create_form(form: FormIn) -> dict:
    return {"title": form.title, "elements": len(form.elements)}


@app.get("/whoami")
def whoami(
    x_user_id: Annotated[str | None, Header()] = None,
    session: Annotated[str | None, Cookie()] = None,
) -> dict:
    return {"x_user_id": x_user_id, "session": session}


client = TestClient(app)
print(client.get("/forms/42?version=3&draft=yes").json())
print(client.get("/forms?tag=a&tag=b").json())
print(client.post("/forms", json={"title": "Sign up"}).json())
print(client.get("/whoami", headers={"X-User-Id": "u1"}, cookies={"session": "s1"}).json())
```

```text
{'form_id': 42, 'version': 3, 'draft': True}
{'limit': 20, 'tag': ['a', 'b']}
{'title': 'Sign up', 'elements': 0}
{'x_user_id': 'u1', 'session': 's1'}
```

Правило класифікації одне, і його варто знати напам'ять. Ім'я, яке є в шаблоні шляху `{form_id}`, це path-параметр. Параметр з типом `BaseModel` це тіло запиту, JSON. Решта скалярів (`int`, `str`, `bool`, `X | None`) це query-параметри, і значення за замовчуванням робить їх необов'язковими. Усе інше задається явно через `Annotated[тип, Query()]`, `Header()`, `Cookie()`, `Body()`. `Annotated` з m2-l06 тут працює так само, як у Pydantic: перший аргумент це тип для mypy, решта це метадані для FastAPI, з обмеженнями `ge`, `le`, `min_length`, `pattern` тих самих імен, що в `Field`.

Значення приходять рядками, а в функцію потрапляють перетвореними: `"42"` став `42`, `draft=yes` став `True` (Pydantic у lax-режимі приймає `yes`, `on`, `1`, `true`). `Header()` перетворює ім'я параметра: `x_user_id` шукає заголовок `x-user-id`, регістр не важливий. Тіло читається і парситься лише тоді, коли в сигнатурі є параметр-модель, тому `express.json()` чи `body-parser` тут не існують як окремий крок.

> **Пастка.** `tag: list[str] = []` без `Query()` FastAPI вважає тілом, а не query: список не скаляр. Запит `?tag=a&tag=b` проходить без помилки, але `tag` порожній, а в OpenAPI з'являється `requestBody`. Для списків у query `Annotated[list[str], Query()]` обов'язкове.

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


@app.get("/forms")
def list_forms(tag: list[str] = []) -> dict:
    return {"tag": tag}


client = TestClient(app)
print(client.get("/forms?tag=a&tag=b").json())
print(app.openapi()["paths"]["/forms"]["get"].get("parameters"))
print(list(app.openapi()["paths"]["/forms"]["get"]["requestBody"]["content"]))
```

```text
{'tag': []}
None
['application/json']
```

<!-- task: q1 -->

Модель тіла пишеться за правилами m2-l09: `Field` з обмеженнями, `Literal`, `alias_generator=to_camel` для фронтенду, `extra="forbid"`, щоб помилка в імені ключа не проходила мовчки. FastAPI нічого до них не додає: він викликає валідацію вашої моделі і передає в функцію готовий екземпляр.

<!-- task: t1 -->

Якщо валідація не пройшла, функція не викликається взагалі. FastAPI відповідає 422 з полем `detail`: це `e.errors()` з Pydantic (m2-l09), де до `loc` спереду дописано джерело (`path`, `query`, `body`, `header`). Невалідний JSON дає ту саму форму відповіді з `json_invalid`, тобто фронтенд обробляє один формат. Запити нижче йдуть до `client` з першого прикладу розділу.

```python
print(client.get("/forms/abc").json())
print(client.get("/forms?limit=0").json())
print(client.post("/forms", json={"title": "", "elements": "nope"}).json())
print(client.post("/forms", content="not json", headers={"content-type": "application/json"}).json())
```

```text
{'detail': [{'type': 'int_parsing', 'loc': ['path', 'form_id'], 'msg': 'Input should be a valid integer, unable to parse string as an integer', 'input': 'abc'}]}
{'detail': [{'type': 'greater_than_equal', 'loc': ['query', 'limit'], 'msg': 'Input should be greater than or equal to 1', 'input': '0', 'ctx': {'ge': 1}}]}
{'detail': [{'type': 'string_too_short', 'loc': ['body', 'title'], 'msg': 'String should have at least 1 character', 'input': '', 'ctx': {'min_length': 1}}, {'type': 'list_type', 'loc': ['body', 'elements'], 'msg': 'Input should be a valid list', 'input': 'nope'}]}
{'detail': [{'type': 'json_invalid', 'loc': ['body', 0], 'msg': 'JSON decode error', 'input': {}, 'ctx': {'error': 'Expecting value'}}]}
```

Перевизначити цей формат під фронтенд (camelCase, плоский список, власний код помилки) можна обробником `RequestValidationError`, це m7-l02. Сам механізм простий настільки, що його можна повторити на чистому Pydantic, що й робить наступне завдання.

<!-- task: t2 -->

## Моделі відповіді: що потрапляє в JSON

Тип відповіді задається двома способами: анотацією повернення `-> FormSummary` або параметром декоратора `response_model=FormSummary`. Якщо задано обидва, перемагає `response_model`; він потрібен, коли функція повертає не те, що оголошено (dict, запис зі сховища), і анотація інакше збрехала б mypy. `status_code=201` теж параметр декоратора, бо об'єкта `res` немає.

```python
from datetime import UTC, datetime

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

app = FastAPI()

RECORD = {
    "id": "signup",
    "version": 3,
    "title": "Sign up",
    "json": '{"id": "signup", "elements": []}',
    "owner_token": "secret-123",
    "created_at": datetime(2026, 10, 18, 9, 30, tzinfo=UTC),
}


class FormSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True)

    id: str
    version: int
    title: str
    created_at: datetime


@app.get("/raw")
def raw() -> dict:
    return RECORD


@app.get("/annotated")
def annotated() -> FormSummary:
    return RECORD  # type: ignore[return-value]


@app.get("/decorator", response_model=FormSummary)
def decorator() -> dict:
    return RECORD


@app.get("/list", response_model=list[FormSummary])
def many() -> list[dict]:
    return [RECORD, {**RECORD, "id": "contact", "version": 1}]


@app.post("/forms", status_code=status.HTTP_201_CREATED)
def create() -> FormSummary:
    return FormSummary(id="new", version=1, title="New", created_at=RECORD["created_at"])


client = TestClient(app)
for path in ["/raw", "/annotated", "/decorator", "/list"]:
    r = client.get(path)
    print(path, r.status_code, r.json())
r = client.post("/forms")
print(r.status_code, r.json())
```

```text
/raw 200 {'id': 'signup', 'version': 3, 'title': 'Sign up', 'json': '{"id": "signup", "elements": []}', 'owner_token': 'secret-123', 'created_at': '2026-10-18T09:30:00Z'}
/annotated 200 {'id': 'signup', 'version': 3, 'title': 'Sign up', 'createdAt': '2026-10-18T09:30:00Z'}
/decorator 200 {'id': 'signup', 'version': 3, 'title': 'Sign up', 'createdAt': '2026-10-18T09:30:00Z'}
/list 200 [{'id': 'signup', 'version': 3, 'title': 'Sign up', 'createdAt': '2026-10-18T09:30:00Z'}, {'id': 'contact', 'version': 1, 'title': 'Sign up', 'createdAt': '2026-10-18T09:30:00Z'}]
201 {'id': 'new', 'version': 1, 'title': 'New', 'createdAt': '2026-10-18T09:30:00Z'}
```

Три речі видно з виводу. Без моделі відповіді `/raw` віддав усе, разом з `owner_token`: FastAPI серіалізує dict як є. З моделлю зайві поля відфільтровано, а `datetime` став ISO-рядком. І ключі пішли в camelCase: FastAPI серіалізує з `by_alias=True` за замовчуванням, тож та сама модель з `alias_generator=to_camel`, що приймає camelCase від фронтенду (m2-l09), віддає його назад без додаткових налаштувань. Повертати можна dict, модель, dataclass або список: усе проходить через модель відповіді.

> **Під капотом.** FastAPI будує для типу відповіді `TypeAdapter` і робить два кроки: `validate_python(value, from_attributes=True)`, потім `dump_python(..., mode="json", by_alias=True)`. `from_attributes=True` пояснює, чому dataclass із вашого сховища (m6-l08) проходить без конвертації. А серіалізація за оголошеним типом пояснює фільтрацію: навіть екземпляр підкласу з додатковими полями виводиться за схемою батьківської моделі. Наївний `Model.model_validate(x).model_dump()` так не робить, і це видно на чистому Pydantic.

```python live
from pydantic import BaseModel, TypeAdapter


class FormSummary(BaseModel):
    id: str
    version: int


class FormRecord(FormSummary):
    owner_token: str


record = FormRecord(id="signup", version=3, owner_token="secret-123")

naive = FormSummary.model_validate(record)
print(type(naive).__name__, naive.model_dump())

adapter = TypeAdapter(FormSummary)
validated = adapter.validate_python(record)
print(adapter.dump_python(validated, mode="json"))

many = TypeAdapter(list[FormSummary])
rows = [{"id": "a", "version": 1, "json": "{}"}, record]
print(many.dump_python(many.validate_python(rows), mode="json"))
```

```text
FormRecord {'id': 'signup', 'version': 3, 'owner_token': 'secret-123'}
{'id': 'signup', 'version': 3}
[{'id': 'a', 'version': 1}, {'id': 'signup', 'version': 3}]
```

`model_validate` повернув той самий об'єкт `FormRecord`, бо екземпляр підкласу вже валідний, і `model_dump` вивів секрет. Через адаптер з оголошеним типом секрет зник. Отже фільтрацію дає саме модель відповіді FastAPI, а не ваш ручний `model_dump()` у обробнику.

Модель відповіді валідує те, що ви повертаєте. Якщо повернене значення їй не відповідає, клієнт отримує 500 `Internal Server Error`, а в лог іде `ResponseValidationError`: це баг сервера, а не помилка клієнта, тому й не 422.

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel


class FormSummary(BaseModel):
    id: str
    version: int


app = FastAPI()


@app.get("/broken")
def broken() -> FormSummary:
    return {"id": "x", "title": "no version"}  # type: ignore[return-value]


print(TestClient(app, raise_server_exceptions=False).get("/broken").status_code)
try:
    TestClient(app).get("/broken")
except Exception as e:
    print(type(e).__name__, e.errors())
```

```text
500
ResponseValidationError [{'type': 'missing', 'loc': ('response', 'version'), 'msg': 'Field required', 'input': {'id': 'x', 'title': 'no version'}}]
```

> **Пастка.** `extra="forbid"` на моделі відповіді ламає ендпоінт: будь-який запис зі сховища з додатковим полем дає 500 замість фільтрації. Якщо вхідна і вихідна моделі мають спільну базу з `extra="forbid"`, вихідна мусить від цього відмовитися. Загальне правило: окрема модель на вхід (`FormIn`, з `forbid`) і окрема на вихід (`FormOut`, без нього), навіть якщо поля поки збігаються. Те, що в NestJS розкидано по DTO, `class-transformer` і `@Exclude()`, тут дві Pydantic-моделі.

<!-- task: t3 -->

## APIRouter: forms і jobs окремими модулями

Один файл з `app` і всіма маршрутами перестає працювати на третьому ресурсі. `APIRouter` це той самий набір декораторів (`@router.get`, `@router.post`), але без застосунку: роутер збирає маршрути, а `app.include_router(router)` копіює їх у застосунок. `prefix` дописується до кожного шляху, `tags` групують маршрути в `/docs`. Аналог в Express `express.Router()` плюс `app.use("/forms", router)`, у NestJS модуль з контролером `@Controller("forms")`.

Структура пакета в капстоуні (імпорти й пакети детально в m3-l01):

```text
src/formbuilder/
├── api/
│   ├── __init__.py    # порожній: імпорт роутера не тягне застосунок
│   ├── app.py         # create_app(settings), app = create_app()
│   ├── deps.py        # залежності: налаштування, сховище
│   ├── schemas.py     # моделі відповідей
│   ├── forms.py       # router = APIRouter(prefix="/forms", tags=["forms"])
│   └── jobs.py        # router = APIRouter(prefix="/jobs", tags=["jobs"])
├── config.py          # FormConfig з m2-l09
├── settings.py        # Settings з m6-l06
└── store.py           # JobStore з m6-l08
```

```python
# src/formbuilder/api/jobs.py
from fastapi import APIRouter, HTTPException, status

from formbuilder.api.deps import StoreDep
from formbuilder.api.schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
def read_job(job_id: int, store: StoreDep) -> JobOut:
    job = store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"job {job_id!r} not found")
    return JobOut.model_validate(job, from_attributes=True)
```

```python
# src/formbuilder/api/app.py (фрагмент)
from formbuilder.api import forms, jobs

app = FastAPI(title="FormBuilder API", lifespan=lifespan)
app.include_router(forms.router)
app.include_router(jobs.router)
```

Команда запуску не змінилась: `uvicorn formbuilder.api.app:app` імпортує модуль `app.py` пакета `formbuilder.api`, а роутери лежать поруч і застосунку не імпортують. Перелік маршрутів зі схеми працюючого застосунку з розділу "Для капстоуну":

```text
$ curl -s http://127.0.0.1:8000/openapi.json | python -c "..."
POST /forms ['forms']
GET /forms/{form_id} ['forms']
POST /forms/{form_id}/build ['forms']
GET /jobs/{job_id} ['jobs']
```

`HTTPException(404, ...)` тут лише щоб показати повний обробник; винятки, власні обробники помилок і формат `detail` це m7-l02.

> **Пастка.** Роутер не імпортує `app`. JS-звичка "взяти застосунок з `main` і повісити на нього маршрут" у Python дає циклічний імпорт: `main` імпортує `forms`, щоб підключити роутер, а `forms` імпортує `main`, який ще не виконався до рядка з `app`. Залежність іде в один бік: роутери нічого не знають про застосунок, застосунок імпортує роутери.

```python
# shop/main.py
from fastapi import FastAPI

from shop import forms

app = FastAPI()
app.include_router(forms.router)

# shop/forms.py
from shop.main import app


@app.get("/forms")
def list_forms() -> list[str]:
    return []
```

```text
$ python -c "import shop.main"
ImportError: cannot import name 'app' from partially initialized module 'shop.main' (most likely due to a circular import) (.../circ/shop/main.py)
```

## Depends: залежності це функції

Інʼєкція залежностей (dependency injection) у FastAPI будується на одній функції `Depends`. Залежність це будь-який callable; FastAPI читає його сигнатуру за тими самими правилами, що й сигнатуру обробника, викликає його на кожен запит і передає результат у параметр. У залежності можуть бути свої залежності, свої query-параметри й заголовки.

```ts
@Injectable()
export class FormStore {
  constructor(private readonly config: ConfigService) {}
}

@Module({ providers: [FormStore, ConfigService], controllers: [FormsController] })
export class FormsModule {}

@Controller("forms")
export class FormsController {
  constructor(private readonly store: FormStore) {}
}
```

```python
from typing import Annotated

from fastapi import Depends, FastAPI, Header
from fastapi.testclient import TestClient

calls = 0


def get_settings() -> dict[str, str]:
    global calls
    calls += 1
    return {"out_dir": "dist"}


SettingsDep = Annotated[dict[str, str], Depends(get_settings)]


def get_store(settings: SettingsDep) -> str:
    return f"Store(out_dir={settings['out_dir']})"


def current_user(x_user: Annotated[str | None, Header()] = None) -> str:
    return x_user or "anonymous"


StoreDep = Annotated[str, Depends(get_store)]
UserDep = Annotated[str, Depends(current_user)]

app = FastAPI()


@app.get("/forms")
def list_forms(store: StoreDep, settings: SettingsDep, user: UserDep) -> dict[str, str]:
    return {"store": store, "out_dir": settings["out_dir"], "user": user}


client = TestClient(app)
print(client.get("/forms", headers={"X-User": "bogdan"}).json(), "calls:", calls)
print(client.get("/forms").json(), "calls:", calls)

app.dependency_overrides[get_settings] = lambda: {"out_dir": "/tmp/test"}
print(client.get("/forms").json(), "calls:", calls)
app.dependency_overrides.clear()
print(client.get("/forms").json(), "calls:", calls)
```

```text
{'store': 'Store(out_dir=dist)', 'out_dir': 'dist', 'user': 'bogdan'} calls: 1
{'store': 'Store(out_dir=dist)', 'out_dir': 'dist', 'user': 'anonymous'} calls: 2
{'store': 'Store(out_dir=/tmp/test)', 'out_dir': '/tmp/test', 'user': 'anonymous'} calls: 2
{'store': 'Store(out_dir=dist)', 'out_dir': 'dist', 'user': 'anonymous'} calls: 3
```

Головна різниця з NestJS: немає контейнера, модулів, `providers` і реєстрації за токеном. Ключ залежності це сам об'єкт функції, граф залежностей це сигнатури, а життєвий цикл за замовчуванням "один запит". Це та сама композиція через параметри з m4-l08, тільки викликає функції не ваш composition root, а фреймворк на кожен запит. Через те, що залежність це просто функція, її можна викликати в тесті напряму, без фреймворку.

`get_settings` тут потрібна і `get_store`, і обробнику, але за перший запит викликана один раз: у межах одного запиту FastAPI кешує результат кожної залежності, і друге звернення отримує те саме значення. Між запитами кешу немає, тому лічильник росте на один за запит. Вимкнути кеш для конкретного місця можна через `Depends(get_settings, use_cache=False)`; тоді в цьому прикладі лічильник після першого запиту був би 2. Аліаси `SettingsDep = Annotated[..., Depends(...)]` це ідіома з документації FastAPI: оголошення один раз, а в сигнатурах короткий тип, з яким і mypy, і FastAPI задоволені.

`app.dependency_overrides` це звичайний словник `{оригінальна_функція: заміна}`. FastAPI перевіряє його при кожному розв'язанні залежності, тому підміна діє і для вкладених залежностей: `get_store` отримав підмінені налаштування, хоча його ніхто не чіпав. Це і є механізм тестів API в m7-l05: без `jest.mock` модулів, без патчів, сховище й налаштування підміняються на fake за ключем-функцією. Після тесту словник треба очистити, бо він живе на об'єкті застосунку.

> **Пастка.** `Depends(get_settings())` з дужками передає не функцію, а її результат. FastAPI падає ще при імпорті модуля, на реєстрації маршруту: для `{"out_dir": "dist"}` це `TypeError: {'out_dir': 'dist'} is not a callable object` з `inspect.signature`, а для порожнього `{}` взагалі голий `AssertionError` без тексту, бо порожній dict хибний. Передається сам об'єкт функції, як колбек у JS: `Depends(get_settings)`.

Залежність з `yield` описує ресурс: код до `yield` відкриває, значення `yield` іде в обробник, код після нього прибирає. Це `@contextmanager` з m4-l07 без декоратора; FastAPI сам веде генератор. Виняток з обробника кидається всередину генератора в точку `yield`, тому `try/finally` гарантує закриття, а `except` бачить, що пішло не так.

```python
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient


class Conn:
    def __init__(self) -> None:
        print("  connect")

    def close(self) -> None:
        print("  close")


def get_conn() -> Iterator[Conn]:
    conn = Conn()
    try:
        yield conn
    except HTTPException as e:
        print("  dependency saw", e.status_code)
        raise
    finally:
        conn.close()


ConnDep = Annotated[Conn, Depends(get_conn)]
app = FastAPI()


@app.get("/forms/{form_id}")
def read_form(form_id: str, conn: ConnDep) -> dict[str, str]:
    print("  handler", form_id)
    if form_id == "missing":
        raise HTTPException(404, "form not found")
    return {"id": form_id}


client = TestClient(app)
for form_id in ["signup", "missing"]:
    print(f"GET /forms/{form_id}")
    r = client.get(f"/forms/{form_id}")
    print(" ", r.status_code, r.json())
```

```text
GET /forms/signup
  connect
  handler signup
  close
  200 {'id': 'signup'}
GET /forms/missing
  connect
  handler missing
  dependency saw 404
  close
  404 {'detail': 'form not found'}
```

> **Пастка.** `except` у залежності з `yield` зобов'язаний закінчитись `raise`. Якщо проковтнути виняток, FastAPI не матиме відповіді для клієнта і впаде з `FastAPIError: Response not awaited. There's a high chance that ... a dependency with yield has a block with a bare except ... and is not raising the exception again`. Прибирання пишіть у `finally`, а `except` лише для логування чи відкату транзакції.

<!-- task: q2 -->

## `def` чи `async def`: де виконується обробник

FastAPI приймає обидва види функцій і поводиться з ними по-різному. `async def` виконується прямо в event loop (m5-l05), як будь-яка корутина. Звичайний `def` FastAPI відправляє в пул потоків (threadpool, жаргонна назва пулу з anyio, яким користується Starlette), щоб блокуючий код не зупиняв цикл. Те саме стосується залежностей: синхронна залежність теж іде в пул. Рішення приймається при реєстрації за `inspect.iscoroutinefunction`, про яке йшлося в m5-l04.

```python
import asyncio
import threading

from fastapi import FastAPI


def where() -> str:
    try:
        asyncio.get_running_loop()
        loop = "event loop"
    except RuntimeError:
        loop = "no loop"
    return f"{threading.current_thread().name}, {loop}"


app = FastAPI()


@app.get("/sync")
def sync_handler() -> dict[str, str]:
    return {"def": where()}


@app.get("/async")
async def async_handler() -> dict[str, str]:
    return {"async def": where()}
```

```text
$ uvicorn where:app
$ curl -s http://127.0.0.1:8000/sync; curl -s http://127.0.0.1:8000/async
{"def":"AnyIO worker thread, no loop"}
{"async def":"MainThread, event loop"}
```

Наслідок з m5-l05 тут стає наслідком для всього сервера: блокуючий виклик в `async def` зупиняє event loop, а разом з ним усі інші запити. Нижче три обробники, кожен "працює" секунду, і клієнт шле по три паралельні запити, а потім `/health` під час блокування.

```python
import asyncio
import time

from fastapi import FastAPI

app = FastAPI()


@app.get("/sync-sleep")
def sync_sleep() -> dict[str, str]:
    time.sleep(1)
    return {"kind": "def + time.sleep"}


@app.get("/async-await")
async def async_await() -> dict[str, str]:
    await asyncio.sleep(1)
    return {"kind": "async def + await asyncio.sleep"}


@app.get("/async-blocking")
async def async_blocking() -> dict[str, str]:
    time.sleep(1)
    return {"kind": "async def + time.sleep"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

```python
import asyncio
import time

import httpx


async def main() -> None:
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=10) as client:
        for path in ["/sync-sleep", "/async-await", "/async-blocking"]:
            start = time.perf_counter()
            await asyncio.gather(*(client.get(path) for _ in range(3)))
            print(f"{path:16} 3 requests: {time.perf_counter() - start:.1f}s")

        start = time.perf_counter()
        slow = asyncio.create_task(client.get("/async-blocking"))
        await asyncio.sleep(0.1)
        r = await client.get("/health")
        print(f"/health during async-blocking: {time.perf_counter() - start:.1f}s {r.json()}")
        await slow

asyncio.run(main())
```

```text
/sync-sleep      3 requests: 1.1s
/async-await     3 requests: 1.0s
/async-blocking  3 requests: 3.0s
/health during async-blocking: 1.0s {'status': 'ok'}
```

`def` з `time.sleep` пережив паралельність, бо три виклики пішли в три потоки. `async def` з `await` пережив, бо цикл перемикався між корутинами. `async def` з `time.sleep` виконав запити по черзі, а `/health`, який не робить нічого, чекав секунду, поки цикл звільниться. Сервер при цьому не впав і не видав помилки: це найгірший вид бага, бо він видно лише під навантаженням.

Правило вибору. `async def`, якщо всередині лише `await` асинхронних бібліотек (httpx `AsyncClient`, `asyncio.Queue`) або взагалі немає вводу-виводу. `def`, якщо всередині блокуючий код: `sqlite3`, `requests`, читання файлів, `subprocess.run`. Змішане (`await` і блокуючий виклик в одній функції) це `async def` з блокуючою частиною в `asyncio.to_thread` (m5-l08). Пул не безмежний: за замовчуванням anyio дає 40 потоків, тож сорок одночасних повільних `def`-запитів уже стоять у черзі.

> **Пастка.** Різні кроки одного запиту можуть потрапити в різні потоки пулу: синхронна залежність виконується окремим викликом у пулі, обробник окремим, прибирання після `yield` теж. Для `sqlite3` це означає `ProgrammingError`, бо з'єднання за замовчуванням прив'язане до потоку, де його створили (m6-l08). Під одним послідовним `TestClient` це рідко видно, під паралельними запитами видно одразу. Нижче три паралельні запити, мітки `T1..T3` це потоки пулу в порядку появи (у вас розподіл буде іншим).

```python
import asyncio
import sqlite3
import threading
import time
from collections.abc import Iterator
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI

threads: dict[int, str] = {}


def thread() -> str:
    ident = threading.get_ident()
    return threads.setdefault(ident, f"T{len(threads) + 1}")


def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(":memory:")
    print(f"open    {thread()}")
    try:
        yield conn
    finally:
        conn.close()


app = FastAPI()


@app.get("/one")
def one(conn: Annotated[sqlite3.Connection, Depends(get_conn)]) -> dict[str, int]:
    print(f"handler {thread()}")
    time.sleep(0.05)
    return {"one": conn.execute("SELECT 1").fetchone()[0]}


async def main() -> None:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        responses = await asyncio.gather(*(client.get("/one") for _ in range(3)))
    print([r.status_code for r in responses])


asyncio.run(main())
```

```text
open    T1
open    T2
open    T3
handler T3
handler T1
handler T2
[500, 200, 500]
```

У лозі сервера для кожного 500: `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that same thread.` З `sqlite3.connect(..., check_same_thread=False)` ті самі три запити дають `[200, 200, 200]`. Це безпечно саме тут: з'єднання належить одному запиту, і кроки запиту виконуються послідовно, хоч і в різних потоках. Ділити одне з'єднання між паралельними запитами так не можна.

<!-- task: q3 -->

## lifespan і налаштування: ресурси на весь застосунок

Залежність з `yield` живе один запит. Те, що живе весь час роботи процесу (міграція схеми на старті, воркер з чергою, пул HTTP-клієнта з m5-l07), описується lifespan: асинхронний контекстний менеджер з m5-l06, переданий у `FastAPI(lifespan=...)`. Код до `yield` виконується до першого запиту, код після `yield` при зупинці сервера. Аналог у NestJS `onModuleInit` і `onApplicationShutdown`, лише в одній функції, тож "відкрив" і "закрив" стоять поруч.

```python
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


async def worker(queue: asyncio.Queue[str]) -> None:
    while True:
        job_id = await queue.get()
        print("worker got", job_id)
        queue.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    print("startup: open store, start worker")
    app.state.queue = asyncio.Queue()
    task = asyncio.create_task(worker(app.state.queue))
    yield
    print("shutdown: stop worker")
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print("worker cancelled")


app = FastAPI(lifespan=lifespan)


@app.post("/jobs/{job_id}")
async def enqueue(job_id: str, request: Request) -> dict[str, str]:
    await request.app.state.queue.put(job_id)
    return {"queued": job_id}


client = TestClient(app, raise_server_exceptions=False)
r = client.post("/jobs/j0")
print("without with:", r.status_code)

with TestClient(app) as client:
    print(client.post("/jobs/j1").json())
    print(client.post("/jobs/j2").json())
print("after with")
```

```text
without with: 500
startup: open store, start worker
{'queued': 'j1'}
worker got j1
{'queued': 'j2'}
worker got j2
shutdown: stop worker
worker cancelled
after with
```

`app.state` це простір імен на об'єкті застосунку, куди lifespan кладе спільні ресурси, а обробник чи залежність дістає їх через параметр `request: Request` як `request.app.state`. Параметр з типом `Request` FastAPI розпізнає за типом і передає сирий об'єкт запиту; це єдиний випадок, коли "req" усе ж з'являється, і потрібен він рідко. Сам воркер з чергою, кількома обробниками і graceful shutdown це m7-l03, тут показано лише, куди він вбудовується.

> **Пастка.** `TestClient(app)` без `with` не запускає lifespan. Обробник отримує застосунок без `queue` у `state`, і перший запит падає з `AttributeError: 'State' object has no attribute 'queue'`, що в прикладі вище перетворилось на 500. У тестах застосунку з lifespan клієнт завжди створюється як `with TestClient(app) as client:`.

Налаштування з m6-l06 підключаються як залежність. `BaseSettings` читає змінні оточення при створенні об'єкта, тому створювати його на кожен запит означає щоразу перечитувати оточення й валідувати. `functools.lru_cache` з m5-l03 на функції без аргументів перетворює її на лінивий синглтон: перший виклик створює `Settings`, решта повертають той самий об'єкт.

```python
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FORMBUILDER_")

    out_dir: Path = Path("dist")
    db_path: Path = Path("formbuilder.db")
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    print("Settings() created")
    return Settings()


SettingsDep = Annotated[Settings, Depends(get_settings)]
app = FastAPI()


@app.get("/config")
def show_config(settings: SettingsDep) -> dict[str, str]:
    return {"out_dir": str(settings.out_dir), "db": str(settings.db_path)}


os.environ["FORMBUILDER_OUT_DIR"] = "/srv/pages"
client = TestClient(app)
print(client.get("/config").json())
print(client.get("/config").json())
print(get_settings.cache_info())

app.dependency_overrides[get_settings] = lambda: Settings(out_dir=Path("/tmp/test-out"), db_path=Path(":memory:"))
print(client.get("/config").json())
app.dependency_overrides.clear()
```

```text
Settings() created
{'out_dir': '/srv/pages', 'db': 'formbuilder.db'}
{'out_dir': '/srv/pages', 'db': 'formbuilder.db'}
CacheInfo(hits=1, misses=1, maxsize=128, currsize=1)
{'out_dir': '/tmp/test-out', 'db': ':memory:'}
```

Чому функція, а не модульна змінна `settings = Settings()`: модульна змінна створюється при імпорті, тобто до того, як тест встиг виставити оточення, і її не підмінити через `dependency_overrides`. Функція з `lru_cache` створює об'єкт при першому запиті, і за ключем-функцією її підміняє тест.

> **Пастка.** `dependency_overrides` діє лише на те, що розв'язується через `Depends`. Lifespan це не залежність: якщо він сам викликає `get_settings()`, підміна з тесту до нього не дійде, і тест мігруватиме справжню базу з `FORMBUILDER_DB_PATH`. Тому в капстоуні налаштування приходять параметром у фабрику `create_app(settings)`, lifespan бере їх із замикання, а залежності читають їх з `app.state`.

<!-- task: q4 -->

## Для капстоуну

API капстоуну в цьому уроці: `POST /forms` приймає `FormConfig` з m2-l09 і зберігає нову версію, `GET /forms/{form_id}` віддає останню версію, `POST /forms/{form_id}/build` ставить задачу і повертає її з `id`, `GET /jobs/{job_id}` віддає статус. Справжня черга з воркером з'явиться в m7-l03; поки `build` лише записує задачу зі статусом `queued` у сховище.

Сховище з m6-l08 API бачить через той самий Protocol `JobStore` (m2-l07), без окремого інтерфейсу для HTTP-шару. Йому бракує двох читань: останньої версії конфігу і задачі за id. Обидва додаються в Protocol і в обидві реалізації, `SqliteJobStore` і `MemoryJobStore`, тож контрактні тести з m6-l08 одразу перевіряють і їх.

```python
# src/formbuilder/store.py (додати до JobStore з m6-l08)
@dataclass(frozen=True)
class ConfigRecord:
    config_id: str
    version: int
    json: str
    created_at: datetime


class JobStore(Protocol):
    def save_config(self, config_id: str, config: Mapping[str, Any]) -> int: ...
    def latest_config(self, config_id: str) -> ConfigRecord | None: ...  # нове
    def enqueue(self, config_id: str, version: int) -> int: ...
    def get_job(self, job_id: int) -> Job | None: ...  # нове
    def next_pending(self) -> Job | None: ...
    def mark_done(self, job_id: int) -> None: ...
    def mark_failed(self, job_id: int, error: str) -> None: ...
    def history(self, config_id: str) -> list[Job]: ...
    def requeue_running(self) -> int: ...


class SqliteJobStore:
    ...  # методи з m6-l08 без змін

    def latest_config(self, config_id: str) -> ConfigRecord | None:
        with self._conn:
            row = self._conn.execute(
                "SELECT * FROM configs WHERE id = ? ORDER BY version DESC LIMIT 1",
                (config_id,),
            ).fetchone()
        if row is None:
            return None
        return ConfigRecord(
            row["id"], row["version"], row["json"], datetime.fromisoformat(row["created_at"])
        )

    def get_job(self, job_id: int) -> Job | None:
        with self._conn:
            row = self._conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return job_from_row(row) if row else None
```

Фабрика застосунку `create_app(settings)` в `api/app.py` це composition root з m4-l08 для вебзастосунку: вона одна знає, звідки беруться налаштування, і збирає застосунок з роутерів. Налаштування приходять параметром, бо lifespan не бачить `dependency_overrides` (пастка вище), а тести створюють власний застосунок з тимчасовою базою. Модульний `app = create_app()` потрібен для `uvicorn formbuilder.api.app:app`. Поле `Settings.workers` з m6-l06 lifespan поки не читає: у m7-l03 стільки воркерів генерації він запускатиме перед `yield`, а тести m7-l05 ставлять `workers=0`.

```python
# src/formbuilder/api/app.py
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, closing

from fastapi import FastAPI

from formbuilder.api import forms, jobs
from formbuilder.settings import Settings, get_settings
from formbuilder.store import migrate


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.out_dir.mkdir(parents=True, exist_ok=True)
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(settings.db_path)) as conn:
            migrate(conn)
        app.state.settings = settings
        yield  # m7-l03: settings.workers workers start before and stop after this line

    app = FastAPI(title="FormBuilder API", lifespan=lifespan)
    app.include_router(forms.router)
    app.include_router(jobs.router)
    return app


app = create_app()
```

```python
# src/formbuilder/api/deps.py
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request

from formbuilder.settings import Settings
from formbuilder.store import JobStore, SqliteJobStore, connect


def app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


SettingsDep = Annotated[Settings, Depends(app_settings)]


def get_store(settings: SettingsDep) -> Iterator[JobStore]:
    conn = connect(settings.db_path)
    try:
        yield SqliteJobStore(conn)
    finally:
        conn.close()


StoreDep = Annotated[JobStore, Depends(get_store)]
```

Моделі відповідей наслідують `CamelModel` з `config.py`, тобто віддають camelCase, як і приймають. `FormOut` вкладає повний `FormConfig`, розпарсений зі збереженого JSON. `JobOut` повторює поля `Job` зі сховища, тож `model_validate(job, from_attributes=True)` читає атрибути dataclass без ручного перекладу. Обробники `def`, бо `sqlite3` блокує.

```python
# src/formbuilder/api/schemas.py
from datetime import datetime

from formbuilder.config import CamelModel, FormConfig


class FormCreated(CamelModel):
    id: str
    version: int


class FormOut(CamelModel):
    id: str
    version: int
    created_at: datetime
    config: FormConfig


class JobOut(CamelModel):
    id: int
    config_id: str
    config_version: int
    status: str
    attempts: int
    created_at: datetime
    finished_at: datetime | None
    error: str | None
```

```python
# src/formbuilder/api/forms.py
from fastapi import APIRouter, HTTPException, status

from formbuilder.api.deps import StoreDep
from formbuilder.api.schemas import FormCreated, FormOut, JobOut
from formbuilder.config import FormConfig

router = APIRouter(prefix="/forms", tags=["forms"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_form(config: FormConfig, store: StoreDep) -> FormCreated:
    version = store.save_config(config.id, config.model_dump(mode="json", by_alias=True))
    return FormCreated(id=config.id, version=version)


@router.get("/{form_id}")
def read_form(form_id: str, store: StoreDep) -> FormOut:
    record = store.latest_config(form_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"form {form_id!r} not found")
    return FormOut(
        id=record.config_id,
        version=record.version,
        created_at=record.created_at,
        config=FormConfig.model_validate_json(record.json),
    )


@router.post("/{form_id}/build", status_code=status.HTTP_202_ACCEPTED)
def build_form(form_id: str, store: StoreDep) -> JobOut:
    record = store.latest_config(form_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"form {form_id!r} not found")
    job_id = store.enqueue(record.config_id, record.version)
    return JobOut.model_validate(store.get_job(job_id), from_attributes=True)
```

Прогін на справжньому SQLite через uvicorn (`FORMBUILDER_OUT_DIR=out uv run uvicorn formbuilder.api.app:app`):

```text
$ curl -s -X POST localhost:8000/forms -H 'content-type: application/json' \
    -d '{"id":"signup","title":"Sign up","theme":{"primaryColor":"#16a34a"},"elements":[{"id":"i1","type":"input","name":"email","label":"Email","inputType":"email","validation":{"required":true}}]}'
{"id":"signup","version":1}  201
$ curl -s localhost:8000/forms/signup
{"id":"signup","version":1,"createdAt":"2026-10-18T16:56:25.009604Z","config":{"id":"signup","title":"Sign up","theme":{"mode":"light","primaryColor":"#16a34a"},"elements":[{"id":"i1","visibleIf":null,"type":"input","name":"email","label":"Email","inputType":"email","validation":{"required":true,"minLength":null,"maxLength":null,"pattern":null}}]}}  200
$ curl -s -X POST localhost:8000/forms/signup/build
{"id":1,"configId":"signup","configVersion":1,"status":"queued","attempts":0,"createdAt":"2026-10-18T16:56:25.032778Z","finishedAt":null,"error":null}  202
$ curl -s localhost:8000/jobs/1
{"id":1,"configId":"signup","configVersion":1,"status":"queued","attempts":0,"createdAt":"2026-10-18T16:56:25.032778Z","finishedAt":null,"error":null}  200
$ curl -s localhost:8000/forms/nope
{"detail":"form 'nope' not found"}  404
```

(Код статусу в кінці рядка додано `curl -w`.) Перший тест: застосунок з базою в `tmp_path`, сховище підмінене `MemoryJobStore` з m6-l08 з фіксованим годинником (той самий підхід, що в m4-l08), клієнт як контекстний менеджер, щоб відпрацював lifespan. Тести капстоуну ставлять `httpx2` dev-залежністю (`uv add --dev httpx2`), тож `TestClient` не друкує попередження зі Starlette 1.x; той самий вибір, з плагіном anyio для асинхронних тестів, обґрунтовано в m7-l05.

```python
# tests/test_api.py (фікстура і перший з шести тестів; решта за чеклістом p1)
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from formbuilder.api.app import create_app
from formbuilder.api.deps import get_store
from formbuilder.settings import Settings
from formbuilder.store import MemoryJobStore, StepClock

START = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)
SIGNUP = {
    "id": "signup",
    "title": "Sign up",
    "elements": [
        {"id": "i1", "type": "input", "name": "email", "label": "Email", "inputType": "email"},
        {"id": "btn", "type": "button", "label": "Send"},
    ],
}


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(Settings(db_path=tmp_path / "test.db", out_dir=tmp_path / "out"))
    store = MemoryJobStore(clock=StepClock(START))
    app.dependency_overrides[get_store] = lambda: store
    with TestClient(app) as client:
        yield client


def test_create_then_read(client: TestClient) -> None:
    r = client.post("/forms", json=SIGNUP)
    assert r.status_code == 201
    assert r.json() == {"id": "signup", "version": 1}

    r = client.get("/forms/signup")
    body = r.json()
    assert body["version"] == 1
    assert body["createdAt"] == "2026-10-18T12:00:00Z"
    assert body["config"]["elements"][0]["inputType"] == "email"
```

```text
$ uv run pytest tests/test_api.py -q
......                                                                   [100%]
6 passed in 0.55s
```

> **Для капстоуну.** `build_form` лишається `def`, поки працює лише зі сховищем. У m7-l03 він має ще й покласти задачу в `asyncio.Queue`, а черга не потокобезпечна і живе в event loop; тоді обробник стане `async def`, а виклики `sqlite3` поїдуть у `asyncio.to_thread`. Формат помилок `{"detail": ...}` поки дефолтний, свій єдиний формат з'явиться в m7-l02.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Шукати `req` і `res`.** Пишуть обробник, що приймає запит і щось у нього "відповідає". Тут обробник приймає вже розібрані параметри й повертає значення. `Request` як параметр буває потрібен (доступ до `app.state`), але читати з нього `query_params` чи тіло вручну означає втратити валідацію і схему.

   ```python
   @app.get("/forms/{form_id}")
   async def read_form(request: Request):           # за звичкою
       return {"id": int(request.path_params["form_id"])}

   @app.get("/forms/{form_id}")
   def read_form(form_id: int) -> FormOut: ...       # правильно
   ```

2. **Middleware для парсингу тіла.** Шукають аналог `express.json()`. Його немає, бо тіло читається тоді, коли в сигнатурі є параметр-модель. Middleware у FastAPI існують (m7-l02), але для наскрізних речей на кшталт request id, не для парсингу.

   ```python
   @app.post("/forms")
   def create_form(config: FormConfig) -> FormCreated: ...  # тіло вже розпарсене й валідне
   ```

3. **`res.status(201).json(...)`.** Статус успішної відповіді це параметр декоратора, а не виклик на об'єкті відповіді. Помилки кидаються винятком `HTTPException` (m7-l02), а не поверненням `res.status(404)`.

   ```python
   @router.post("", status_code=status.HTTP_201_CREATED)
   def create_form(config: FormConfig, store: StoreDep) -> FormCreated: ...
   ```

4. **Класи-контролери і провайдери NestJS.** Переносять `@Controller` з конструктором і `@Injectable`-сервіси. У FastAPI немає контейнера: роутер це модуль з функціями, сервіс це залежність-функція, підміна в тесті це `dependency_overrides`. Клас з `__init__` як залежність можливий, але не потрібен для того, що робить функція.

   ```python
   router = APIRouter(prefix="/forms", tags=["forms"])

   @router.get("/{form_id}")
   def read_form(form_id: str, store: StoreDep) -> FormOut: ...
   ```

5. **DTO + ValidationPipe + class-transformer.** Пишуть клас DTO, окремо валідатор, окремо серіалізатор із `@Exclude()`. Тут одна Pydantic-модель на вхід, одна на вихід, а валідацію й фільтрацію робить FastAPI. Типова помилка навпаки: одна модель на обидва напрямки з `extra="forbid"`, яка дає 500 на відповідях.

   ```python
   class FormIn(CamelModel):  # вхід: forbid
       model_config = ConfigDict(extra="forbid")
       title: str

   class FormOut(CamelModel):  # вихід: без forbid
       id: str
       title: str
   ```

6. **`async def` скрізь, бо "в Node все асинхронне".** `async def` з `sqlite3` або `time.sleep` усередині серіалізує всі запити сервера. Якщо всередині блокуючий код, пишіть `def`, і FastAPI сам віднесе його в пул потоків.

   ```python
   @app.get("/jobs/{job_id}")
   def read_job(job_id: int, store: StoreDep) -> JobOut: ...  # sqlite3: def
   ```

7. **Імпорт `app` у модуль роутера.** Звичка "повісити маршрут на застосунок з `main`" дає циклічний імпорт. Роутер оголошує `router = APIRouter(...)`, застосунок імпортує роутери і викликає `include_router`.

   ```python
   # forms.py
   from formbuilder.api.app import app   # за звичкою: циклічний імпорт
   router = APIRouter(prefix="/forms")   # правильно: роутер без застосунку

   # api/app.py
   app.include_router(forms.router)
   ```

## Підсумок

- Обробник це функція, зареєстрована декоратором; вона повертає значення, а FastAPI серіалізує його.
- Джерело параметра визначає сигнатура: ім'я в `{...}` це path, `BaseModel` це тіло, скаляр це query; решта через `Annotated[..., Query()/Header()/Cookie()]`.
- Невалідний ввід дає 422 з `detail` у форматі `e.errors()` Pydantic, де `loc` починається з джерела; функція не викликається.
- Модель відповіді валідує й фільтрує повернене значення через `TypeAdapter` з `from_attributes=True` і `by_alias=True`; невідповідність це 500, а не 422.
- Окремі моделі на вхід і вихід; `extra="forbid"` лише на вході.
- `APIRouter(prefix, tags)` + `include_router`; роутери не імпортують застосунок.
- `Depends` приймає функцію, не її результат; результат кешується в межах запиту; `yield` дає прибирання після обробника; `dependency_overrides` підміняє за ключем-функцією.
- `def` виконується в пулі потоків, `async def` в event loop; блокуючий виклик в `async def` зупиняє весь сервер.
- Lifespan відкриває й закриває ресурси процесу; `TestClient` запускає його лише в `with`.
- Налаштування через `@lru_cache def get_settings()` і `Depends`; у фабриці застосунку налаштування передаються параметром, бо lifespan не бачить `dependency_overrides`.

## Що далі

У m7-l02 стандартний `{"detail": ...}` зміниться на єдиний формат помилок капстоуну: `HTTPException` з цього уроку, обробник `RequestValidationError` над тими самими `loc`/`msg`/`type`, middleware і CORS для фронтенду. Lifespan із `create_app` знадобиться в m7-l03, де в ньому стартуватиме воркер з `asyncio.Queue`, а `dependency_overrides` і `TestClient` у `with` стануть основою фікстур у m7-l05.
