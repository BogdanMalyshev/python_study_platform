# Нотатки до m7-l08

## Що запускалось

Django, Flask і Litestar у Pyodide не працюють, і їх немає в `.venv` проєкту, тому все запускалось в окремому
scratch venv (`<scratchpad>/m7-l08/.venv`, видалений після перевірки):

```bash
uv venv -p 3.12 .venv
uv pip install -p .venv/bin/python django flask litestar uvicorn httpx fastapi djangorestframework
```

Версії, з якими отримано весь вивід уроку (Python 3.12.12):

| Пакет | Версія |
|---|---|
| django | 6.1.2 |
| djangorestframework | 3.18.3 |
| flask | 3.1.3 |
| werkzeug | 3.1.9 |
| litestar | 2.24.0 |
| msgspec | 0.22.0 |
| fastapi | 0.146.0 |
| starlette | 1.8.0 |
| pydantic | 2.14.1 |
| uvicorn | 0.54.0 |
| asgiref | 3.12.1 |
| httpx | 0.28.1 |

Перевірка:

- 14 самостійних python-блоків теорії (MRO, сирі WSGI і ASGI, сигнатури `__call__`, Django в одному файлі з
  `django.test.Client`, `inspect.getsource(QuerySet.aget)`, Flask hello world, `request` як `LocalProxy`,
  `async def` у Flask, Litestar hello world, шари DI в Litestar, порівняння валідації FastAPI/Litestar,
  sync-обробники FastAPI проти Litestar, одна Pydantic-модель у трьох фреймворках) скриптом витягнуто прямо з
  `lesson.md`, виконано і порівняно зі stdout наступного `text`-блоку після rstrip рядків: 14 з 14 збіглися.
  stderr у порівнянні не враховувався; там httpx INFO-логи TestClient, `StarletteDeprecationWarning` про httpx
  у `starlette.testclient` (Starlette 1.8 радить `httpx2`) і traceback `KeyError: 'name'` для Flask, останній
  рядок якого згаданий у тексті.
- Django-проєкт зібрано з нуля з блоків уроку: `django-admin startproject config .`, `startapp builder`, файли
  `builder/models.py`, `admin.py`, `views.py`, `serializers.py`, `api.py`, `config/urls.py` витягнуті з
  `lesson.md` (у `urls.py` додано `*router.urls`, у settings `rest_framework`, `builder` і
  `ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]`, як описано в тексті). Вивід `find`,
  `makemigrations`, `sqlmigrate`, `migrate`, ORM-демо й DRF-демо (`manage.py shell -v 0 -c`) збігся з уроком
  дослівно. У DRF-демо Django пише в stderr два рядки `Bad Request: /api/forms/` (логер `django.request`);
  в уроці показано лише stdout.
- Сервери підіймались у фоні на портах 18001–18005, чекання порту через socket, запит `curl`, зупинка `pkill`
  за повним рядком команди: `runserver` (WSGI, лог показано повністю), `uvicorn config.asgi:application`,
  `uvicorn flask_asgi:app` через `WsgiToAsgi` (лог показано повністю), `uvicorn hello_flask:app` без адаптера
  (500 і `TypeError ... missing 1 required positional argument: 'start_response'`, для q2) і
  `uvicorn hello_flask:app --interface wsgi` (200, для пояснення в q2). PID, час і клієнтські порти в логах
  це реальні значення одного запуску. Після перевірки `lsof` на 18001–18005 порожній, процесів зі scratch-шляху
  немає. Порти 8765–8767 не використано, бо на 8767 у той самий час працював uvicorn іншого агента (m7-l04).
- Квізи: код q1 виконано (`Starlette True`); q2 перевірено живим uvicorn і за вихідним кодом
  `uvicorn/config.py` (режим `auto` обирає `asgi2` для не-корутинного `__call__`); q3 це вивід
  `compare_validation` з уроку; q4 судження без коду.
- Окремо перевірено твердження без власного блоку в уроці: `APIRouter(dependencies=[Depends(...)])` виконує
  залежність, але значення в обробник не потрапляє; `dependency_overrides` підміняє `Depends(get_store)`;
  `fastapi.security` містить лише класи для читання креденшелів із запиту (`OAuth2PasswordBearer`, `HTTPBearer`,
  `APIKeyHeader` тощо); `LitestarWarning` для sync-обробника виникає в момент декорування; CORS-фрагмент з помилки 2 дає
  `200 http://localhost:3000`; фрагмент з помилки 6 з `sync_to_thread=True` працює без попереджень при
  `warnings.simplefilter("error")`; Django `ASGIHandler` на `lifespan` кидає
  `ValueError: Django can only handle ASGI/HTTP connections, not lifespan.`
- `lesson.md` і `tasks.yaml` прогнано через `platform/build.py:load_lesson` (без запису `dist/`): помилок немає,
  усі 5 завдань вставлені рівно один раз.

## Рішення

- Теорії 25 абзаців (без callout-блоків, таблиць, списків і закривальних розділів), верхня межа орієнтира з
  `questions.md`. Найдовший пробіг прози без коду чи завдання 2 абзаци. Розділів `##` сім теоретичних, `Для
  капстоуну` і три обов'язкові.
- Завдань з кодом немає, як вимагає `questions.md`: 4 quiz і 1 project. `verify` у p1 це
  `test -s capstone/docs/why-fastapi.md` з кореня курсу, а не `cd capstone && uv run ...` зі спеки, бо
  перевіряється лише наявність тексту, Python для цього не потрібен.
- `## Що далі` значно довший за 2–3 речення зі спеки: це останній урок, і `questions.md` вимагає підсумку курсу
  по модулях, капстоуну як артефакту й переходу до курсу про бази даних. Підсумок по модулях оформлено списком
  у `Що далі`, а не окремим теоретичним розділом, щоб не дублювати `## Підсумок` уроку.
- Django показано глибше за інші (проєкт, модель, міграції, ORM, адмінка, DRF, ASGI-запуск), бо питання в
  `questions.md` перелічує саме ці частини. Модель і міграції показано лише як "що це і як виглядає"; SQL,
  ORM-патерни й міграції як тема належать курсу про бази даних.
- gunicorn і hypercorn не встановлювались: в уроці лише одне речення про їхню роль. Granian, Sanic, Quart,
  aiohttp, Django Ninja свідомо не згадано, щоб огляд лишився на чотирьох іменах з `questions.md`.
- Порти серверів у командах уроку (18001–18003) нестандартні, бо саме з ними отримано реальний вивід.
- Django 6.0+ запускає `shell` з автоімпортом моделей і друкує рядок `N objects imported automatically`;
  для чистого виводу демо запускались з `-v 0`, і це видно в коментарі першого рядка блоку.

## Незакриті питання

Немає. Усі 10 пунктів `questions.md` закриті.

## Залежності

Спирається на m7-l01 (`Depends`, sync проти async обробників, `lifespan`), m7-l02 (CORS, middleware), m7-l03 і
m7-l04 (воркер і WebSocket як аргумент за ASGI), m7-l05 (`TestClient`), m7-l07 (uvicorn, gunicorn з
uvicorn-воркерами), m2-l09 (Pydantic), m4-l04 (MRO). Наступних уроків у курсі немає; p1 готує
`capstone/docs/why-fastapi.md`, а розділи про ORM, міграції й auth прямо передають у майбутній курс про бази
даних.

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `verify` p1 переведено на `cd capstone && uv run python -c ...` з перевіркою непорожнього `docs/why-fastapi.md`.
