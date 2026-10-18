# Нотатки до m5-l07 "httpx для асинхронних запитів"

## Що запускалось

Усе через `.venv/bin/python` (CPython 3.12.12, httpx 0.28.1, httpcore 1.0.9, anyio 4.15.1, pyyaml 6.0.3). Тимчасові файли лежали в `<scratchpad>/m5-l07/`, після перевірки видалені; тестовий сервер зупинено.

- **Код уроку.** Скрипт витягнув з `lesson.md` кожен блок ```` ```python ````/```` ```python live ````, за яким іде ```` ```text ````, запустив окремим файлом і порівняв stdout з текстом уроку (rstrip рядків). 25 блоків, 24 збігаються дослівно. Єдиний розбіжний блок це демонстрація keep-alive з номерами клієнтських портів: порти ефемерні, у кожному запуску інші; в уроці лишився вивід першого реального запуску і речення "номери портів у вас будуть інші". Блоки без ```` ```text ```` (пари `ts`/`python`, сніпети в "Типових помилках") це ілюстрації, не запускались.
- **Детермінізм.** Усі блоки й розв'язки t3–t5 прогнано 5 разів поспіль з порівнянням md5 виводу: стабільно все, крім блоку з портами. У прикладі з ретраями jitter детермінований через `random.Random(7)`.
- **Завдання.** Для t1–t5 запущено `solution + harness (+ asserts)`: вивід збігається з `expected` (t1, t2, t3, t5), `asserts` t4 проходять. Окремо `starter + harness` для кожного: усі стартери падають. Додатково перевірено, що типові хибні розв'язки не проходять: t2 з `except TransportError` перед `except TimeoutException` дає `network error` для таймаутів; t4 без jitter падає з повідомленням про jitter.
- **Квізи.** q1 (`await r.json()` дає `TypeError: object dict can't be used in 'await' expression`), q2 (`503` без `raise_for_status` друкує `got 503`), q4 (синхронний хук в `AsyncClient`: заголовок дописано, запит не відправлено, `TypeError ... NoneType ...`) перевірені запуском. q3 концептуальний, факт про `retries=` у транспорті перевірено читанням `httpcore/_async/connection.py` (повтор лише на `ConnectError`/`ConnectTimeout`).
- **Валідація платформою.** `platform/build.py:load_lesson(...)` викликано напряму (без запису `dist/`): маркери завдань на місці, кожне рівно один раз, помилок формату немає, крім однієї групи, див. нижче.

Приклади з реальною мережею запускались проти локального сервера (HTTP/1.1 з keep-alive, бо `python -m http.server` віддає HTTP/1.0 і закриває з'єднання після кожного запиту, а тоді демонстрація пулу неможлива). Код сервера для відтворення:

```python
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def _send(self, status, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == "/forms/42":
            self._send(200, {"id": 42, "title": "Contact", "fields": ["email", "phone"]})
        elif u.path == "/port":
            self._send(200, {"client_port": self.client_address[1]})
        elif u.path == "/slow":
            time.sleep(float(q.get("delay", ["1"])[0])); self._send(200, {"slept": True})
        elif u.path == "/trickle":
            self.send_response(200); self.send_header("Content-Length", "10"); self.end_headers()
            for _ in range(10):
                time.sleep(0.1); self.wfile.write(b"."); self.wfile.flush()
        elif u.path == "/big":
            self._send(200, b"x" * 1_000_000, "application/octet-stream")
        else:
            self._send(404, {"error": "not found"})

ThreadingHTTPServer(("127.0.0.1", 8907), H).serve_forever()
```

Повідомлення `ConnectError` у виводі (`[Errno 61]`, `[Errno 8] nodename nor servname ...`) специфічні для macOS; на Linux текст інший (`[Errno 111]`, `Name or service not known`).

## Потрібна дія автора курсу: httpx у браузерному allowlist

За інструкцією до уроку браузерні завдання t1–t5 мають `requires: [httpx]` і `runtime: browser` (у Pyodide httpx є, мережа замінена `MockTransport`). Але `platform/build.py:38` має `BROWSER_PACKAGES = {"pydantic"}`, і збірка зараз відхиляє ці п'ять завдань з помилкою "у браузері немає ['httpx'], потрібен runtime: local". Потрібно додати `"httpx"` у `BROWSER_PACKAGES` (і в `platform/README.md`, рядок про `requires`), а також у `docs/lesson-spec.md`, де сказано, що в браузері лише stdlib і pydantic. Файли платформи поза папкою уроку, тому я їх не чіпав.

Не перевірено в самому Pyodide (браузерного прогону тут не було): `AsyncClient` з `MockTransport`, `async`-обробник, `client.stream` з асинхронним генератором як `content`, `logging.basicConfig(stream=sys.stdout, force=True)`. Усі живі блоки й завдання не створюють клієнт без `transport=`, тож мережевий транспорт і `ssl` не ініціалізуються. Варто прогнати `platform/selftest.html` після додавання httpx в allowlist.

## Рішення щодо обсягу й меж

- 8 теоретичних розділів + "Для капстоуну" + 3 обов'язкові. 38 абзаців теорії, 11 callout-ів: у межах орієнтиру, поділу не пропоную. Найдовша серія тексту без коду 4 абзаци (ретраї).
- Таймаут у fetch описано як "немає власного, лише `AbortSignal.timeout`"; конкретні внутрішні таймаути undici/браузерів не називаю, бо не перевіряв.
- `Retry-After` згадано в тексті ретраїв і вимогою в p1, у живому коді не реалізовано, щоб приклад лишався коротким.
- HTTP/2 (`http2=True`), проксі, `verify=`/сертифікати, cookies, `Client.send`/`build_request`, `httpx.Limits` глибше за `max_connections` не розглядаються: не в питаннях і не потрібні капстоуну на цьому етапі.
- `ASGITransport` для тестів FastAPI згадано одним реченням з посиланням на m7-l05.
- Логування у хуках через `print` в основних прикладах і через `logging` у капстоуні з одним рядком налаштування; рівні, формат, structlog залишено m5-l09. Під час перевірки виявилось, що httpx сам пише кожен запит у логер `httpx` на INFO, і з `basicConfig(level=INFO)` вивід дублювався; це стало абзацом у розділі "Для капстоуну".
- Знахідки під час перевірки, що стали пастками в уроці: `MockTransport` ігнорує `timeout=`; `.elapsed` недоступний для відповідей з `MockTransport` (не увійшло в урок, лише тут); у хуку відповіді з реальної мережі тіло не прочитане (`ResponseNotRead`), а з моком прочитане, тож тест цю помилку не ловить.
- `p1` має `verify` у форматі специфікації (`cd capstone && uv run ...`); залежність `httpx` у `capstone/pyproject.toml` учень додає сам через `uv add httpx`, це перший крок умови.

## Питання з questions.md

Усі 10 закриті в уроці з кодом і виводом, позначені `[x]`.

## Залежності від сусідніх уроків

Спирається на: m5-l05 (`TaskGroup`, `gather`, `Semaphore`, `asyncio.timeout`, блокуючий виклик у циклі), m5-l06 (`async with`, `async for`, асинхронні генератори для стрімінгу), m1-l11 (ієрархія винятків і порядок `except`), m2 (Pydantic/dataclass для `page` у p1).

Готує для: m5-l08 (чому `to_thread` рятує від `requests.get`), m5-l09 (хуки як місце для логування з контекстом), модуль 7 (один клієнт у lifespan застосунку FastAPI), m7-l05 (`AsyncClient` з `ASGITransport` для тестів API), капстоун (публікація на вебхук партнера після генерації).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- Клас вебхука перейменовано на `HttpPublisher` (лекція, t5, p1), бо `Publisher` у `publisher.py` уже протокол з m3-l04. p1 дописує в наявний `publisher.py`. t1–t5 і живий блок капстоуну перезапущено, вивід той самий.
