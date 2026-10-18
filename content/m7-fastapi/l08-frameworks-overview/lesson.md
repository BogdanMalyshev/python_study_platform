---
id: m7-l08
module: m7-fastapi
title: "Оглядово: Django, Flask, Litestar"
summary: "Учень розрізняє WSGI і ASGI, читає Django-, Flask- і Litestar-код, аргументовано обирає фреймворк під проєкт за критеріями, а не за популярністю, і знає, що з курсу переноситься на будь-який із них."
duration_min: 60
prerequisites: [m7-l07]
---

## Карта: чотири фреймворки і Starlette під FastAPI

У Python-вебі є чотири імені, які трапляються у вакансіях і чужих репозиторіях, і вони відповідають на різні питання. Django (2005) це фреймворк "batteries included" (так його описує сам проєкт, у спільноті це стале жаргонне формулювання): ORM, міграції, автентифікація, адмінка, шаблони й форми в одному пакеті. Flask (2010) це мікрофреймворк (micro-framework, офіційний термін з документації Flask): маршрутизація, request і response, шаблони Jinja2, а решта через розширення. FastAPI (2018) будує API з анотацій типів: Pydantic валідує, `Depends` інжектить, OpenAPI генерується сам. Litestar (з 2021, до 2023 називався Starlite) ставить ті самі цілі, що FastAPI, але інакше вирішує DI, організацію коду й серіалізацію.

| Python | Найближче в JS | Що в коробці |
|---|---|---|
| Django (+ DRF для API) | Rails; або NestJS + Prisma + AdminJS разом | ORM, міграції, auth, адмінка, шаблони, форми |
| Flask | Express | маршрутизація, request/response, Jinja2 |
| FastAPI | Fastify + zod + swagger-плагін | валідація з типів, DI, OpenAPI, async |
| Litestar | Fastify + контролери в стилі NestJS | те саме, що FastAPI, плюс шари конфігурації, DTO, msgspec |
| Starlette | Koa: ядро без схем і валідації | ASGI-тулкіт: роутинг, middleware, WebSocket, TestClient |

```python
# FastAPI.__mro__ (method resolution order, офіційний термін, m4-l04): ланцюжок базових класів
from fastapi import FastAPI
from litestar import Litestar
from starlette.applications import Starlette

print([cls.__module__ + "." + cls.__name__ for cls in FastAPI.__mro__])
print(issubclass(FastAPI, Starlette))
print(issubclass(Litestar, Starlette))
```

```text
['fastapi.applications.FastAPI', 'starlette.applications.Starlette', 'builtins.object']
True
False
```

Starlette стоїть у таблиці окремим рядком саме тому, що FastAPI це його підклас, а не фреймворк з нуля. Усе, що в m7-l02–m7-l05 стосувалося middleware, WebSocket, `TestClient` і `lifespan`, насправді Starlette; FastAPI додав зверху Pydantic-валідацію параметрів, `Depends` і генерацію OpenAPI. Litestar на старті теж спирався на Starlette, але згодом переписав ядро, тому `issubclass` дає `False`. Аналогії з JS у таблиці корисні для першого орієнтування й шкідливі далі: Django не Next.js, бо фронтенд у ньому це серверні шаблони, а не React, і жоден із чотирьох не дає "одного фреймворку на фронт і бек".

> **Пастка.** Пошук "Python-версії NestJS" закінчується розчаруванням. Модулі, провайдери, класи-контролери з декораторами в Python не стали стандартом: DI у FastAPI це функції (m7-l01), у Litestar іменовані залежності на шарах, у Django залежностей як концепції немає взагалі. Найближче за формою Litestar з його `Controller`, але й там контейнера на кшталт Nest немає.

<!-- task: q1 -->

## WSGI і ASGI: контракт між сервером і застосунком

У Node HTTP-сервер це частина рантайму: `http.createServer(handler)`, і Express лише будує цей `handler`. У Python сервер і фреймворк розділені стандартним інтерфейсом. Сервер (gunicorn, uvicorn) це окремий пакет, який імпортує ваш об'єкт застосунку й викликає його на кожен запит, тому команда запуску виглядає як `uvicorn module:app`. Старий інтерфейс зветься WSGI (Web Server Gateway Interface, офіційний термін з PEP 3333): застосунок це синхронна функція, що отримує словник `environ` і callback `start_response`, а повертає iterable з байтами.

```python
from wsgiref.util import setup_testing_defaults


def app(environ, start_response):
    body = f"hello from {environ['PATH_INFO']}".encode()
    start_response("200 OK", [("Content-Type", "text/plain")])
    return [body]


environ = {"PATH_INFO": "/health"}
setup_testing_defaults(environ)


def start_response(status, headers):
    print(status, headers)


print(app(environ, start_response))
```

```text
200 OK [('Content-Type', 'text/plain')]
[b'hello from /health']
```

Новий інтерфейс зветься ASGI (Asynchronous Server Gateway Interface, офіційна специфікація, яку веде проєкт Django в репозиторії asgiref). Застосунок тут корутина з трьома аргументами: `scope` описує з'єднання, `receive` і `send` це awaitable-канали повідомлень у дві сторони.

```python
import asyncio


async def app(scope, receive, send):
    body = f"hello from {scope['path']}".encode()
    await send({"type": "http.response.start", "status": 200,
                "headers": [(b"content-type", b"text/plain")]})
    await send({"type": "http.response.body", "body": body})


async def main():
    scope = {"type": "http", "method": "GET", "path": "/health"}

    async def receive():
        return {"type": "http.request", "body": b""}

    async def send(message):
        print(message)

    await app(scope, receive, send)

asyncio.run(main())
```

```text
{'type': 'http.response.start', 'status': 200, 'headers': [(b'content-type', b'text/plain')]}
{'type': 'http.response.body', 'body': b'hello from /health'}
```

Різниця не в синтаксисі, а в моделі. WSGI це один синхронний виклик на запит: воркер зайнятий, доки функція не повернула відповідь, тож паралельність дають лише процеси й потоки, а WebSocket чи довге з'єднання в цю форму не влазять. ASGI це обмін повідомленнями в event loop: поки один обробник чекає на `await`, цикл обслуговує інші з'єднання, а той самий канал `receive`/`send` несе WebSocket-кадри (m7-l04) і події `lifespan`. Обидва контракти видно прямо в сигнатурах `__call__` фреймворків:

```python
import inspect

from django.core.handlers.asgi import ASGIHandler
from django.core.handlers.wsgi import WSGIHandler
from fastapi import FastAPI
from flask import Flask
from litestar import Litestar

for cls in (Flask, WSGIHandler, ASGIHandler, FastAPI, Litestar):
    call = cls.__call__
    kind = "async" if inspect.iscoroutinefunction(call) else "sync"
    params = list(inspect.signature(call).parameters)[1:]
    print(f"{cls.__name__:<12} {kind:<5} {params}")
```

```text
Flask        sync  ['environ', 'start_response']
WSGIHandler  sync  ['environ', 'start_response']
ASGIHandler  async ['scope', 'receive', 'send']
FastAPI      async ['scope', 'receive', 'send']
Litestar     async ['scope', 'receive', 'send']
```

Django має обидва обробники, бо прожив п'ятнадцять років на WSGI і з версії 3.0 додав ASGI поруч, не ламаючи старі деплої; `startproject` генерує і `wsgi.py`, і `asgi.py`. Flask живе на WSGI. FastAPI і Litestar існують лише як ASGI. Сервери діляться так само: gunicorn це WSGI-сервер і менеджер процесів (з uvicorn-воркерами з m7-l07 він же запускає ASGI), uvicorn і hypercorn це ASGI-сервери, hypercorn додатково вміє HTTP/2. Оскільки контракт це просто сигнатура, WSGI-застосунок можна загорнути в ASGI-адаптер з asgiref і віддати uvicorn:

```python
# flask_asgi.py
from asgiref.wsgi import WsgiToAsgi

from hello_flask import app as wsgi_app

app = WsgiToAsgi(wsgi_app)
```

```bash
uvicorn flask_asgi:app --port 18003 &
curl -s http://127.0.0.1:18003/health
kill %1
```

```text
{"framework":"flask","status":"ok"}
```

```text
INFO:     Started server process [84964]
INFO:     Waiting for application startup.
INFO:     ASGI 'lifespan' protocol appears unsupported.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:18003 (Press CTRL+C to quit)
INFO:     127.0.0.1:50942 - "GET /health HTTP/1.1" 200 OK
INFO:     Shutting down
INFO:     Finished server process [84964]
```

> **Під капотом.** Рядок `ASGI 'lifespan' protocol appears unsupported` означає, що uvicorn на старті викликав застосунок зі `scope` типу `lifespan`, а той кинув виняток замість обміну подіями `lifespan.startup` і `lifespan.startup.complete`. Адаптер WSGI і ASGI-обробник Django `lifespan` не реалізують, тому хука на кшталт `lifespan` з m7-l01, де FastAPI відкриває сховище й запускає воркер, у них немає. Сервер це переживає й продовжує працювати лише з HTTP.

<!-- task: q2 -->

## Django за 10 хвилин

Hello world у Django зазвичай не пишуть в одному файлі, але це можливо, і так видно мінімум: налаштування, функція-view, яка приймає `request` і повертає `HttpResponse`, і список `urlpatterns`. `django.test.Client` тут робить те саме, що `TestClient` у FastAPI: викликає застосунок без мережі.

```python
from django.conf import settings
from django.http import JsonResponse
from django.urls import path

settings.configure(
    SECRET_KEY="dev-only",
    ROOT_URLCONF=__name__,
    ALLOWED_HOSTS=["testserver"],
)


def health(request):
    return JsonResponse({"status": "ok", "framework": "django"})


def form_detail(request, form_id):
    return JsonResponse({"id": form_id, "method": request.method})


urlpatterns = [
    path("health", health),
    path("forms/<int:form_id>", form_detail),
]

if __name__ == "__main__":
    import django
    from django.test import Client

    django.setup()
    client = Client()
    for url in ("/health", "/forms/42", "/forms/abc"):
        response = client.get(url)
        print(url, response.status_code, response.headers["Content-Type"])
        if response.status_code == 200:
            print(" ", response.json())
```

```text
/health 200 application/json
  {'status': 'ok', 'framework': 'django'}
/forms/42 200 application/json
  {'id': 42, 'method': 'GET'}
/forms/abc 404 text/html; charset=utf-8
```

`<int:form_id>` це конвертер маршруту, а не валідація: `abc` просто не збігається з жодним шаблоном, тому 404. У FastAPI той самий `/forms/abc` при `form_id: int` дає 422, бо маршрут збігся, а параметр не пройшов Pydantic. Справжній Django-проєкт ділиться на project (налаштування, кореневі URL, точки входу `wsgi.py` і `asgi.py`) і apps: пакети з моделями, views, адмінкою й міграціями, які підключаються в `INSTALLED_APPS`. Застосунок тут ближче до модуля NestJS, ніж до npm-пакета.

```bash
django-admin startproject config .
python manage.py startapp builder
find . -type f -not -path '*/__pycache__/*' | sort
```

```text
./builder/__init__.py
./builder/admin.py
./builder/apps.py
./builder/migrations/__init__.py
./builder/models.py
./builder/tests.py
./builder/views.py
./config/__init__.py
./config/asgi.py
./config/settings.py
./config/urls.py
./config/wsgi.py
./manage.py
```

Модель це клас, атрибути якого описують колонки таблиці. `makemigrations` порівнює моделі з уже наявними міграціями й генерує новий файл міграції, `migrate` застосовує його до бази. Це той самий цикл, що `prisma migrate dev`, тільки схема описана Python-класом, а не окремим DSL. `sqlmigrate` показує SQL, який буде виконано.

```python
# builder/models.py
from django.db import models


class FormConfig(models.Model):
    name = models.CharField(max_length=100, unique=True)
    config = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name
```

```bash
python manage.py makemigrations builder
python manage.py sqlmigrate builder 0001
```

```text
Migrations for 'builder':
  builder/migrations/0001_initial.py
    + Create model FormConfig
BEGIN;
--
-- Create model FormConfig
--
CREATE TABLE "builder_formconfig" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(100) NOT NULL UNIQUE, "config" text NOT NULL CHECK ((JSON_VALID("config") OR "config" IS NULL)), "created_at" datetime NOT NULL);
COMMIT;
```

Перший `migrate` найкраще пояснює "batteries included": крім вашої однієї таблиці він створює користувачів, групи, права, сесії й журнал адмінки, бо вони вже є в `INSTALLED_APPS` за замовчуванням. ORM-запит повертає `QuerySet`, лінивий об'єкт, який перетворюється на SQL лише під час ітерації; подвійне підкреслення в `name__startswith` це синтаксис lookup-ів Django.

```bash
python manage.py migrate
```

```text
Operations to perform:
  Apply all migrations: admin, auth, builder, contenttypes, sessions
Running migrations:
  Applying contenttypes.0001_initial... OK
  Applying auth.0001_initial... OK
  Applying admin.0001_initial... OK
  Applying admin.0002_logentry_remove_auto_add... OK
  Applying admin.0003_logentry_add_action_flag_choices... OK
  Applying contenttypes.0002_remove_content_type_name... OK
  Applying auth.0002_alter_permission_name_max_length... OK
  Applying auth.0003_alter_user_email_max_length... OK
  Applying auth.0004_alter_user_username_opts... OK
  Applying auth.0005_alter_user_last_login_null... OK
  Applying auth.0006_require_contenttypes_0002... OK
  Applying auth.0007_alter_validators_add_error_messages... OK
  Applying auth.0008_alter_user_username_max_length... OK
  Applying auth.0009_alter_user_last_name_max_length... OK
  Applying auth.0010_alter_group_name_max_length... OK
  Applying auth.0011_update_proxy_permissions... OK
  Applying auth.0012_alter_user_first_name_max_length... OK
  Applying builder.0001_initial... OK
  Applying sessions.0001_initial... OK
```

```python
# python manage.py shell -v 0 -c "$(cat orm_demo.py)"
from builder.models import FormConfig

FormConfig.objects.create(name="signup", config={"fields": ["email"]})
FormConfig.objects.create(name="contact", config={"fields": ["email", "phone"]})

qs = FormConfig.objects.filter(name__startswith="s").order_by("-created_at")
print(qs.query)
print([form.name for form in qs])
print(FormConfig.objects.count())
print(FormConfig.objects.get(name="contact").config["fields"])
```

```text
SELECT "builder_formconfig"."id", "builder_formconfig"."name", "builder_formconfig"."config", "builder_formconfig"."created_at" FROM "builder_formconfig" WHERE "builder_formconfig"."name" LIKE s% ESCAPE '\' ORDER BY "builder_formconfig"."created_at" DESC
['signup']
2
['email', 'phone']
```

Адмінка це один рядок `admin.site.register(FormConfig)`: Django будує за моделлю список записів, форми створення, редагування й видалення, історію змін і сторінку входу, прив'язану до тих самих користувачів і прав, що створив `migrate`. View і маршрут для API без DRF виглядають так само, як у одному файлі вище. Нижче `runserver` піднятий у фоні, перевірений `curl` і зупинений; у його лозі видно, що це WSGI-сервер. Той самий проєкт без змін запускається й під ASGI через згенерований `config/asgi.py`.

```python
# builder/admin.py
from django.contrib import admin

from .models import FormConfig

admin.site.register(FormConfig)
```

```python
# builder/views.py
from django.http import JsonResponse

from .models import FormConfig


def form_list(request):
    forms = FormConfig.objects.order_by("name").values("id", "name")
    return JsonResponse({"items": list(forms)})
```

```python
# config/urls.py (у settings.py: "builder" в INSTALLED_APPS)
from django.contrib import admin
from django.urls import path

from builder.views import form_list

urlpatterns = [
    path("admin/", admin.site.urls),
    path("forms/", form_list),
]
```

```bash
python manage.py runserver 127.0.0.1:18001 --noreload &
curl -s http://127.0.0.1:18001/forms/
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:18001/admin/
kill %1
```

```text
{"items": [{"id": 2, "name": "contact"}, {"id": 1, "name": "signup"}]}
302 http://127.0.0.1:18001/admin/login/?next=/admin/
```

```text
Performing system checks...

System check identified no issues (0 silenced).
October 18, 2026 - 15:52:11
Django version 6.1.2, using settings 'config.settings'
Starting WSGI development server at http://127.0.0.1:18001/
Quit the server with CONTROL-C.

WARNING: This is a development server. Do not use it in a production setting. Use a production WSGI or ASGI server instead.
For more information on production servers see: https://docs.djangoproject.com/en/6.1/howto/deployment/
[18/Oct/2026 15:52:11] "GET /forms/ HTTP/1.1" 200 70
[18/Oct/2026 15:52:11] "GET /admin/ HTTP/1.1" 302 0
```

```bash
# той самий проєкт під ASGI
uvicorn config.asgi:application --port 18002 &
curl -s http://127.0.0.1:18002/forms/
kill %1
```

```text
{"items": [{"id": 2, "name": "contact"}, {"id": 1, "name": "signup"}]}
```

Для JSON API поверх Django беруть Django REST Framework (DRF, сторонній пакет, але фактичний стандарт): serializer описує форму даних і валідує вхід, `ViewSet` дає CRUD-обробники, router генерує маршрути. `ModelSerializer` виводить правила з моделі, включно з `unique=True`, і перевіряє унікальність запитом у базу, чого Pydantic-модель зробити не може, бо про базу нічого не знає. Помилка валідації в DRF це 400, а не 422.

```python
# builder/serializers.py
from rest_framework import serializers

from .models import FormConfig


class FormConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormConfig
        fields = ["id", "name", "config", "created_at"]
        read_only_fields = ["id", "created_at"]
```

```python
# builder/api.py
from rest_framework import routers, viewsets

from .models import FormConfig
from .serializers import FormConfigSerializer


class FormConfigViewSet(viewsets.ModelViewSet):
    queryset = FormConfig.objects.order_by("id")
    serializer_class = FormConfigSerializer


router = routers.DefaultRouter()
router.register("api/forms", FormConfigViewSet)
```

```python
# python manage.py shell -v 0 -c "$(cat drf_demo.py)"
# (у config/urls.py до urlpatterns додано *router.urls з builder.api, у INSTALLED_APPS "rest_framework")
from rest_framework.test import APIClient

client = APIClient()
created = client.post("/api/forms/", {"name": "survey", "config": {"fields": []}}, format="json")
print(created.status_code, created.json()["name"])

duplicate = client.post("/api/forms/", {"name": "survey", "config": {}}, format="json")
print(duplicate.status_code, duplicate.json())

missing = client.post("/api/forms/", {"config": {}}, format="json")
print(missing.status_code, missing.json())

print(client.get("/api/forms/").status_code, len(client.get("/api/forms/").json()))
```

```text
201 survey
400 {'name': ['form config with this name already exists.']}
400 {'name': ['This field is required.']}
200 3
```

Django виграє там, де продукт це CRUD над десятками таблиць, з адмінкою для не-розробників, користувачами, правами й формами: усе це вже написано, перевірено двадцятьма роками продакшну й однаково влаштовано в будь-якому Django-проєкті, тож нова людина в команді орієнтується за день. Програє він у async і гнучкості. Async-views є, але ORM під ними досі синхронний: async-методи на кшталт `aget` це обгортки, які виконують звичайний запит у потоці.

```python
import inspect

from django.db.models import QuerySet

print(inspect.getsource(QuerySet.aget))
```

```text
    async def aget(self, *args, **kwargs):
        return await sync_to_async(self.get)(*args, **kwargs)
```

> **JS-аналог.** Django ближче до Rails, ніж до будь-чого з Node. Конвенції замість конфігурації, генератори (`startproject`, `startapp`, `makemigrations`), одна "правильна" структура. Якщо в JS ви збирали Nest + Prisma + AdminJS + Passport і узгоджували їх між собою, Django продає саме відсутність цієї роботи, а платите ви тим, що відступ від його способу робити речі коштує дорожче, ніж у мікрофреймворку.

## Flask за 5 хвилин

Flask це Express у Python-формі: застосунок, декоратор маршруту, функція-обробник. Словник, повернений з view, стає JSON, кортеж `(body, status)` задає код. Тіла запиту немає в аргументах функції: його дістають з глобального `request`.

```python
from flask import Flask, abort, request

app = Flask(__name__)
FORMS = {1: {"id": 1, "name": "signup"}}


@app.get("/health")
def health():
    return {"status": "ok", "framework": "flask"}


@app.get("/forms/<int:form_id>")
def get_form(form_id):
    if form_id not in FORMS:
        abort(404)
    return FORMS[form_id]


@app.post("/forms")
def create_form():
    payload = request.get_json()
    form_id = max(FORMS) + 1
    FORMS[form_id] = {"id": form_id, "name": payload["name"]}
    return FORMS[form_id], 201


if __name__ == "__main__":
    client = app.test_client()
    print(client.get("/health").json)
    print(client.get("/forms/1").json)
    print(client.get("/forms/7").status_code)
    response = client.post("/forms", json={"name": "contact"})
    print(response.status_code, response.json)
    response = client.post("/forms", json={"title": "no name"})
    print(response.status_code, response.mimetype)
```

```text
{'framework': 'flask', 'status': 'ok'}
{'id': 1, 'name': 'signup'}
404
201 {'id': 2, 'name': 'contact'}
500 text/html
```

Останній рядок це вся різниця з FastAPI в одному запиті: валідації немає, `payload["name"]` кидає `KeyError: 'name'` (traceback іде в stderr), клієнт отримує HTML-сторінку 500. У Flask-проєктах це закривають розширеннями: Flask-SQLAlchemy для ORM, Flask-Migrate для міграцій через Alembic, Marshmallow або flask-smorest для схем і OpenAPI, Flask-Login для сесій. Тобто Django-набір ви збираєте самі, як у Express збирали body-parser, passport і joi. Blueprint (офіційна назва у Flask) це аналог `APIRouter` для розбиття на модулі.

> **Під капотом.** `request` у Flask не аргумент, а глобальний проксі (context local, термін документації Flask), який на кожен виклик дивиться в поточний контекст запиту через `contextvars`. Поза запитом він не працює. Звідси ж звичка Flask-коду читати `request` глибоко у функціях, які нічого не приймають, і звідси ж складність тестування такого коду.

```python
from flask import Flask, request

app = Flask(__name__)
print(type(request))

try:
    request.method
except RuntimeError as e:
    print(str(e).splitlines()[0])

with app.test_request_context("/forms?page=2", method="POST"):
    print(request.method, request.path, request.args["page"])
```

```text
<class 'werkzeug.local.LocalProxy'>
Working outside of request context.
POST /forms 2
```

`async def` у Flask писати можна, але WSGI від цього не стає ASGI. Flask виконує корутину через `asgiref`: на кожен запит окремий потік з новим event loop, який живе рівно один запит. Конкурентності між запитами це не дає, `await` усередині корисний лише для паралельних викликів у межах одного обробника.

```python
import asyncio
import threading

from flask import Flask

app = Flask(__name__)
loops = []


@app.get("/slow")
async def slow():
    await asyncio.sleep(0.01)
    loops.append(asyncio.get_running_loop())
    return {"thread": threading.current_thread().name}


client = app.test_client()
print(client.get("/slow").json)
print(client.get("/slow").json)
print("same event loop:", loops[0] is loops[1])
```

```text
{'thread': 'ThreadPoolExecutor-1_0'}
{'thread': 'ThreadPoolExecutor-2_0'}
same event loop: False
```

Для нового API у 2026 Flask беруть рідко: типи не стають валідацією, OpenAPI не генерується, async лише номінальний, і все це FastAPI дає без розширень. Але читати Flask доведеться: на ньому написано величезний обсяг внутрішніх сервісів, адмін-інструментів і API десятирічної давності, і бекенд, з яким ви колись узгоджували контракти, цілком міг бути саме таким. Для читання достатньо трьох речей з цього розділу: декоратор маршруту, глобальний `request` і blueprints.

## Litestar: ті самі цілі, інші рішення

Litestar виглядає як FastAPI: async-обробники, анотації типів, автоматичний OpenAPI. Різниця в деталях, які видно з першого ж прикладу. Тіло запиту приходить у параметр з фіксованим ім'ям `data`, залежності реєструються за іменем у `dependencies` і інжектяться в параметр з тим самим ім'ям, а модель даних тут `msgspec.Struct`, а не Pydantic.

```python
import msgspec
from litestar import Litestar, get, post
from litestar.di import Provide
from litestar.testing import TestClient


class FormIn(msgspec.Struct):
    name: str
    fields: list[str] = []


class FormOut(msgspec.Struct):
    id: int
    name: str
    fields: list[str]


class Store:
    def __init__(self) -> None:
        self.forms: dict[int, FormOut] = {}


STORE = Store()


async def provide_store() -> Store:
    return STORE


@get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "framework": "litestar"}


@post("/forms")
async def create_form(data: FormIn, store: Store) -> FormOut:
    form = FormOut(id=len(store.forms) + 1, name=data.name, fields=data.fields)
    store.forms[form.id] = form
    return form


@get("/forms/{form_id:int}")
async def get_form(form_id: int, store: Store) -> FormOut:
    return store.forms[form_id]


app = Litestar(
    route_handlers=[health, create_form, get_form],
    dependencies={"store": Provide(provide_store)},
)

if __name__ == "__main__":
    with TestClient(app=app) as client:
        print(client.get("/health").json())
        response = client.post("/forms", json={"name": "signup", "fields": ["email"]})
        print(response.status_code, response.json())
        print(client.get("/forms/1").json())
        response = client.post("/forms", json={"fields": "email"})
        print(response.status_code, response.json())
```

```text
{'status': 'ok', 'framework': 'litestar'}
201 {'id': 1, 'name': 'signup', 'fields': ['email']}
{'id': 1, 'name': 'signup', 'fields': ['email']}
400 {'status_code': 400, 'detail': 'Validation failed for POST /forms', 'extra': [{'message': 'Expected `array`, got `str`', 'key': 'fields', 'source': 'body'}]}
```

Layered architecture (термін документації Litestar) означає, що залежності, guards, middleware, заголовки відповіді й інші параметри можна оголосити на чотирьох рівнях: застосунок, `Router`, `Controller`, обробник. Найближчий рівень перекриває дальший. У FastAPI `dependencies=[Depends(...)]` на роутері лише виконуються як побічний ефект, а значення в параметри обробника не потрапляють; у Litestar залежність з будь-якого рівня приходить у параметр за іменем.

```python
from litestar import Controller, Litestar, Router, get
from litestar.di import Provide
from litestar.testing import TestClient


async def app_storage() -> str:
    return "sqlite"


async def memory_storage() -> str:
    return "memory"


class JobController(Controller):
    path = "/jobs"
    dependencies = {"storage": Provide(memory_storage)}

    @get("/")
    async def list_jobs(self, storage: str) -> dict[str, str]:
        return {"layer": "controller", "storage": storage}


@get("/forms")
async def list_forms(storage: str) -> dict[str, str]:
    return {"layer": "app", "storage": storage}


api = Router(path="/api", route_handlers=[JobController, list_forms])
app = Litestar(route_handlers=[api], dependencies={"storage": Provide(app_storage)})

with TestClient(app=app) as client:
    print(client.get("/api/forms").json())
    print(client.get("/api/jobs").json())
```

```text
{'layer': 'app', 'storage': 'sqlite'}
{'layer': 'controller', 'storage': 'memory'}
```

msgspec це бібліотека серіалізації з валідацією, спроєктована насамперед під швидкість кодування й декодування JSON; валідаторів у ній менше, ніж у Pydantic, і на невалідному вході вона зупиняється на першій помилці. Litestar приймає і Pydantic-моделі, тож Pydantic-код з курсу переноситься без змін. Порівняння на однаковому невалідному тілі показує три розбіжності одразу: код успішного POST, код помилки валідації й кількість помилок.

```python
import msgspec
from fastapi import FastAPI
from fastapi.testclient import TestClient as FastAPIClient
from litestar import Litestar, post
from litestar.testing import TestClient as LitestarClient
from pydantic import BaseModel


class FormModel(BaseModel):
    name: str
    fields: list[str] = []


class FormStruct(msgspec.Struct):
    name: str
    fields: list[str] = []


fastapi_app = FastAPI()


@fastapi_app.post("/forms")
async def fastapi_create(form: FormModel) -> FormModel:
    return form


@post("/forms")
async def litestar_create(data: FormStruct) -> FormStruct:
    return data


@post("/pydantic-forms")
async def litestar_create_pydantic(data: FormModel) -> FormModel:
    return data


litestar_app = Litestar(route_handlers=[litestar_create, litestar_create_pydantic])
bad = {"fields": "email"}

with FastAPIClient(fastapi_app) as client:
    ok = client.post("/forms", json={"name": "signup"})
    r = client.post("/forms", json=bad)
    print("fastapi ", ok.status_code, r.status_code, [e["loc"] for e in r.json()["detail"]])

with LitestarClient(app=litestar_app) as client:
    ok = client.post("/forms", json={"name": "signup"})
    r = client.post("/forms", json=bad)
    print("litestar", ok.status_code, r.status_code, [e["key"] for e in r.json()["extra"]])
    r = client.post("/pydantic-forms", json=bad)
    print("litestar+pydantic", r.status_code, [e["key"] for e in r.json()["extra"]])
```

```text
fastapi  200 422 [['body', 'name'], ['body', 'fields']]
litestar 201 400 ['fields']
litestar+pydantic 400 ['name', 'fields']
```

> **Пастка.** Синхронний `def`-обробник у FastAPI виконується в threadpool (m7-l01), а в Litestar за замовчуванням прямо в потоці event loop, тобто блокуючий виклик у ньому зупиняє весь сервер. Litestar про це попереджає ще під час декорування: `LitestarWarning: Use of a synchronous callable <function report at 0x...> without setting sync_to_thread is discouraged since synchronous callables can block the main thread`. Потік треба просити явно: `@get(..., sync_to_thread=True)`.

```python
import threading
import warnings

from fastapi import FastAPI
from fastapi.testclient import TestClient as FastAPIClient
from litestar import Litestar, get
from litestar.testing import TestClient as LitestarClient

warnings.simplefilter("ignore")  # LitestarWarning про sync-обробник; текст вище


def current() -> str:
    return threading.current_thread().name


fastapi_app = FastAPI()


@fastapi_app.get("/where")
def fastapi_where() -> dict[str, str]:
    return {"thread": current()}


@get("/where")
def litestar_where() -> dict[str, str]:
    return {"thread": current()}


@get("/where-thread", sync_to_thread=True)
def litestar_where_thread() -> dict[str, str]:
    return {"thread": current()}


litestar_app = Litestar(route_handlers=[litestar_where, litestar_where_thread])

with FastAPIClient(fastapi_app) as client:
    loop = client.portal.call(current)
    print("fastapi  def, in loop thread:", client.get("/where").json()["thread"] == loop)

with LitestarClient(app=litestar_app) as client:
    loop = client.blocking_portal.call(current)
    print("litestar def, in loop thread:", client.get("/where").json()["thread"] == loop)
    print("litestar def + sync_to_thread, in loop thread:", client.get("/where-thread").json()["thread"] == loop)
```

```text
fastapi  def, in loop thread: False
litestar def, in loop thread: True
litestar def + sync_to_thread, in loop thread: False
```

Дивитися в бік Litestar варто, коли модель FastAPI влаштовує, але проєкт великий і хочеться класів-контролерів, конфігурації на рівні роутера з реальним інжектом значень, вбудованих DTO для різних представлень однієї моделі або швидшої серіалізації. Плата за це в масштабі спільноти: менше відповідей на типові питання, менше прикладів і менше людей на ринку, які його знають.

<!-- task: q3 -->

## Як вибирати: критерії замість популярності

У JS вибір часто зводиться до "що найпопулярніше на npm", і в Python ця евристика підводить особливо: кількість завантажень Django і Flask тримається на десятиліттях легасі, а не на тому, що їх обирають для нових API. Вибір роблять за п'ятьма питаннями: хто в команді і що вона вже знає; чи потрібна адмінка для не-розробників; наскільки проєкт async (WebSocket, багато паралельних I/O-викликів); чи мають типи бути контрактом, з якого генеруються валідація й документація; яку частину екосистеми ви готові збирати самі.

| Критерій | Django + DRF | Flask | FastAPI | Litestar |
|---|---|---|---|---|
| Команда і найм | найбільший ринок, одна структура скрізь | багато легасі, структура в кожного своя | великий і зростаючий, стандарт для нових API | мала спільнота |
| Адмінка | вбудована, з auth і правами | розширення (Flask-Admin) | немає, сторонні пакети | немає, сторонні пакети |
| Async | async views, але ORM синхронний під капотом | WSGI, async лише в межах запиту | ASGI, async скрізь, WebSocket | ASGI, async скрізь, WebSocket |
| Типи як контракт | serializers окремо від типів | немає, Marshmallow окремо | Pydantic з анотацій, OpenAPI сам | msgspec або Pydantic, OpenAPI сам |
| Екосистема в коробці | ORM, міграції, auth, адмінка, форми | майже нічого, розширення | валідація, DI, OpenAPI; ORM і auth немає | валідація, DI, DTO, OpenAPI; ORM-плагін окремо |

Чесно про FastAPI: у ньому немає ORM, міграцій, системи користувачів і адмінки. `fastapi.security` дає лише інструменти для читання токенів із запиту, а не реєстрацію, сесії чи права. У реальному проєкті поруч з'являються SQLAlchemy, Alembic, бібліотека для auth, і все це рішення, які приймаєте ви, а не фреймворк. Саме ці теми винесені в окремий курс. Для FormBuilder це прийнятна ціна: продукт це API з типізованим JSON-контрактом, генерацією у фоні й статусом через WebSocket, а саме тут FastAPI сильний і саме тут Django змушував би обходити свій ORM-центричний підхід.

<!-- task: q4 -->

## Що переноситься з курсу, а що належить FastAPI

Більша частина курсу не про FastAPI. Pydantic і dataclasses, анотації типів і mypy, asyncio, pytest, пакування через uv, логування, pathlib, subprocess, settings через змінні оточення працюють однаково під будь-яким фреймворком, бо це мова і її екосистема. Специфічний для FastAPI лише шар між HTTP і доменом: `Depends` і `dependency_overrides`, `response_model`, `HTTPException` і формат 422, `BackgroundTasks`, а через Starlette ще `lifespan`, middleware і `TestClient`. При переході на інший фреймворк переписується саме цей шар, і що він тонший, то дешевший перехід; тому в капстоуні маршрути лише викликають функції з `formbuilder`, а валідація конфігу, рендер і сховище нічого не знають про FastAPI. Нижче одна й та сама Pydantic-модель і доменна функція під трьома фреймворками, кожен з адаптером на кілька рядків:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient as FastAPIClient
from flask import Flask, request
from litestar import Litestar, post
from litestar.testing import TestClient as LitestarClient
from pydantic import BaseModel, ValidationError


# domain: нічого не знає про HTTP
class Field(BaseModel):
    id: str
    required: bool = False


class FormConfig(BaseModel):
    name: str
    fields: list[Field]


def summarize(config: FormConfig) -> dict[str, object]:
    return {"name": config.name, "required": [f.id for f in config.fields if f.required]}


# FastAPI
fastapi_app = FastAPI()


@fastapi_app.post("/summary")
async def fastapi_summary(config: FormConfig) -> dict[str, object]:
    return summarize(config)


# Litestar
@post("/summary", status_code=200)
async def litestar_summary(data: FormConfig) -> dict[str, object]:
    return summarize(data)


litestar_app = Litestar(route_handlers=[litestar_summary])

# Flask
flask_app = Flask(__name__)


@flask_app.post("/summary")
def flask_summary():
    try:
        config = FormConfig.model_validate(request.get_json())
    except ValidationError as e:
        return {"errors": e.errors(include_url=False)}, 422
    return summarize(config)


payload = {"name": "signup", "fields": [{"id": "email", "required": True}, {"id": "note"}]}

with FastAPIClient(fastapi_app) as client:
    print("fastapi ", client.post("/summary", json=payload).json())
with LitestarClient(app=litestar_app) as client:
    print("litestar", client.post("/summary", json=payload).json())
client = flask_app.test_client()
print("flask   ", client.post("/summary", json=payload).json)
response = client.post("/summary", json={"name": "signup"})
print("flask   ", response.status_code, response.json["errors"][0]["loc"], response.json["errors"][0]["type"])
```

```text
fastapi  {'name': 'signup', 'required': ['email']}
litestar {'name': 'signup', 'required': ['email']}
flask    {'name': 'signup', 'required': ['email']}
flask    422 ['fields'] missing
```

## Для капстоуну

Останнє завдання курсу не код, а текст. На співбесіді про капстоун спитають не "як працює `Depends`", а "чому FastAPI": відповідь "бо популярний" не працює, відповідь з критеріями, компромісами й тим, що ви свідомо не взяли, працює. Документ `capstone/docs/why-fastapi.md` це architecture decision record (ADR, загальноінженерний термін) у вільній формі: контекст, варіанти, рішення, наслідки.

> **Для капстоуну.** Опирайтеся на факти з цього уроку й на власний код: що в капстоуні тримається на Pydantic і типах (m2-l09, m7-l01), де потрібен був async (воркер на `asyncio.Queue` у m7-l03, WebSocket у m7-l04), що довелося б робити інакше на Django (ORM замість SQLite через `sqlite3`, синхронні views або обхід ORM) і на Flask (валідація руками, без OpenAPI). Окремо чесно назвіть, чого FastAPI не дав і що ви закрили самі.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Пошук "Python-версії NestJS".** Пишуть класи-сервіси, контейнер і реєстрацію провайдерів поверх FastAPI. У FastAPI залежність це функція, а підміна в тестах це `dependency_overrides`.

   ```python
   def get_store() -> Store:            # провайдер
       return STORE

   @app.get("/forms")
   async def list_forms(store: Annotated[Store, Depends(get_store)]): ...
   ```

2. **Очікування одного фреймворку на фронт і бек, як у Next.js.** Шукають, де в Django чи FastAPI "сторінки з React", і тягнуть фронтенд у шаблони. Правильно: Python-бекенд віддає API, Next.js лишається окремим застосунком, а між ними CORS (m7-l02).

   ```python
   app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["*"])
   # GET /forms з Origin: http://localhost:3000 -> 200, access-control-allow-origin: http://localhost:3000
   ```

3. **Вибір за популярністю на кшталт npm downloads.** Беруть Flask, "бо найбільше завантажень і простий, як Express", і отримують API без валідації: відсутнє поле це 500 з HTML замість 422 з описом.

   ```python
   payload = request.get_json()
   name = payload["name"]       # KeyError -> 500 text/html
   config = FormConfig.model_validate(payload)  # ValidationError -> контрольовані 422
   ```

4. **Очікування, що FastAPI має ORM і auth, як Django або Nest з плагінами.** Pydantic-модель плутають з моделлю таблиці. Pydantic описує дані на межі API; таблиці, міграції й користувачі це SQLAlchemy, Alembic і окрема бібліотека, наступний курс.

   ```python
   class FormConfig(BaseModel): ...       # контракт API, не таблиця
   # Django: class FormConfig(models.Model) це і схема, і таблиця, і міграція
   ```

5. **Хардкод `422` на фронтенді як "код помилки валідації".** Це конвенція FastAPI, а не HTTP. DRF і Litestar повертають 400, Litestar ще й 201 на успішний POST за замовчуванням.

   ```text
   fastapi  200 422 [['body', 'name'], ['body', 'fields']]
   litestar 201 400 ['fields']
   ```

6. **Синхронний обробник у Litestar з інтуїцією FastAPI.** У FastAPI `def` іде в threadpool, у Litestar без `sync_to_thread=True` блокує event loop.

   ```python
   @get("/report", sync_to_thread=True)
   def report() -> dict[str, str]:
       return build_report()   # блокуючий виклик
   ```

7. **`async def` у Django-view як гарантія неблокуючого коду.** ORM-методи `aget`, `acreate` під капотом виконують синхронний запит у потоці; виграш є, але це не нативний async-драйвер.

   ```python
   async def aget(self, *args, **kwargs):
       return await sync_to_async(self.get)(*args, **kwargs)
   ```

## Підсумок

- Django це повний стек з ORM, міграціями, auth і адмінкою; Flask мікрофреймворк з розширеннями; FastAPI типи як контракт поверх Starlette; Litestar той самий підхід з шарами конфігурації й msgspec.
- FastAPI це підклас Starlette: middleware, WebSocket, `TestClient`, `lifespan` належать Starlette.
- WSGI це синхронний виклик `app(environ, start_response)` на запит; ASGI це корутина `app(scope, receive, send)` з обміном повідомленнями.
- Django має обидва інтерфейси, Flask WSGI, FastAPI і Litestar лише ASGI; gunicorn для WSGI і як менеджер процесів, uvicorn і hypercorn для ASGI.
- `async def` у Flask не дає конкурентності між запитами; async-ORM Django це sync-запит у потоці.
- 422 на помилку валідації це конвенція FastAPI; DRF і Litestar повертають 400.
- Вибір за командою, адмінкою, async, типами й екосистемою, а не за кількістю завантажень.
- FastAPI не має ORM, міграцій, auth і адмінки; це окремі рішення, які приймає проєкт.
- Pydantic, типи, asyncio, pytest, uv і логування переносяться на будь-який фреймворк; переписується лише тонкий HTTP-шар.

## Що далі

Це був останній урок курсу. За модулями ви тепер умієте:

- **m0.** Ставити Python через uv, вести venv і `pyproject.toml`, лінтити ruff, читати traceback і користуватися pdb, будувати src-layout проєкт.
- **m1.** Писати ідіоматичний Python замість перекладеного JS: truthiness, `is` проти `==`, `match`, цикли без індексів, функції з `*args`/`**kwargs`, LEGB і замикання, comprehensions, винятки як control flow.
- **m2.** Обирати між list, tuple, dict і set, контролювати aliasing, описувати дані dataclasses і типами, перевіряти їх mypy і валідувати Pydantic v2.
- **m3.** Організовувати імпорти й пакети, тестувати pytest з fixtures і `parametrize`, мокати, міряти coverage, запускати pre-commit.
- **m4.** Будувати класи з dunder-методами й property, вибирати між ABC і Protocol, писати контекстні менеджери, Enum і композицію замість наслідування.
- **m5.** Писати генератори, декоратори, асинхронний код з `TaskGroup`, таймаутами й скасуванням, httpx-клієнти, розуміти GIL і логувати через logging і structlog.
- **m6.** Працювати з файлами, форматами, датами в UTC, regex, subprocess, CLI й налаштуваннями з env, коректно завершуватися по SIGTERM і зберігати дані в SQLite.
- **m7.** Будувати API на FastAPI з `Depends`, обробкою помилок, фоновим воркером, WebSocket, тестами через httpx, рендером через Jinja2, пакувати в Docker і пояснювати, чому FastAPI, а не Django, Flask чи Litestar.

Капстоун це артефакт для портфоліо: репозиторій з типізованим API, валідацією конфігу, чергою генерації, WebSocket-статусом, тестами, Dockerfile і `docs/why-fastapi.md`. На співбесіді він дає чесну фразу: "бекенд FormBuilder був на Python, контракти проєктував я, а потім реалізував власну версію". Наступний крок це окремий курс про бази даних: SQL, SQLAlchemy 2.0, міграції через Alembic і PostgreSQL замість SQLite у тому самому капстоуні, а за ним автентифікація й інфраструктура. Паралельно варто прочитати "Fluent Python" (Ramalho) для глибини мови, "Architecture Patterns with Python" (Percival, Gregory) для того, як тримати домен окремо від фреймворку й бази, і документацію FastAPI повністю, включно з розділами про SQL і безпеку, які тут свідомо пропущено.
