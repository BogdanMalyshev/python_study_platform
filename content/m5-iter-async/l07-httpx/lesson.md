---
id: m5-l07
module: m5-iter-async
title: "httpx: fetch із сесією, таймаутом і транспортом, який можна підмінити"
summary: "Учень робить синхронні й асинхронні запити через httpx, тримає один AsyncClient на застосунок, ставить таймаути, розрізняє помилки транспорту й статусу, пише ретраї з backoff і jitter, стрімить великі відповіді й тестує клієнтський код через MockTransport без мережі."
duration_min: 90
prerequisites: [m5-l06]
---

## httpx: fetch, у якого є сесія і таймаут

httpx це HTTP-клієнт з двома API однакової форми: синхронним (`httpx.get`, `httpx.Client`) і асинхронним (`httpx.AsyncClient`). Методи, параметри й об'єкт відповіді ті самі, асинхронна версія лише додає `await` і `async with`. Його попередник `requests` досі найпопулярніший клієнт у Python, але він тільки синхронний, і всередині `async def` блокує event loop (m5-l05); httpx свідомо скопіював його API, тож код на `requests` ви читаєте без перекладу.

Нижче і далі в уроці приклади з реальною мережею запускались локально проти тестового сервера на `127.0.0.1:8907` (його код у `notes.md`), вивід знято один раз. Живі приклади в уроці працюють без мережі, як це влаштовано, в кінці розділу.

```ts
const res = await fetch("http://127.0.0.1:8907/forms/42");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const form = await res.json();
```

```python
import httpx

r = httpx.get("http://127.0.0.1:8907/forms/42")
r.raise_for_status()
form = r.json()
print(r.status_code, form)
```

```text
200 {'id': 42, 'title': 'Contact', 'fields': ['email', 'phone']}
```

Розходжень два, і одна спільна риса. `httpx.get` синхронний: він повертається, коли тіло відповіді вже прочитане в пам'ять, тому `r.json()` це звичайний виклик без `await`, а не ще один проміс. Перевірка статусу це метод `raise_for_status()`, який кидає `httpx.HTTPStatusError`, а не ручне `if (!res.ok)`. Спільне з `fetch` важливіше, ніж здається: статус 404 чи 500 сам по собі винятку не дає, відповідь повертається як успішна, доки ви не попросите перевірку.

`httpx.get` і компанія (`post`, `put`, `delete`) це разові запити: кожен створює клієнт, відкриває з'єднання і закриває його. Для всього, що робить більше одного запиту, є сесії: `httpx.Client` і `httpx.AsyncClient`. Сесія тримає пул з'єднань (connection pool) і спільні налаштування: `base_url`, заголовки, таймаут, автентифікацію. Асинхронної версії `httpx.get` немає, асинхронний код завжди йде через `AsyncClient`.

```python
import asyncio
import httpx

with httpx.Client(base_url="http://127.0.0.1:8907") as client:
    r = client.get("/forms/42")
    print("sync: ", r.status_code, r.json()["title"])

async def main() -> None:
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8907") as client:
        r = await client.get("/forms/42")
        print("async:", r.status_code, r.json()["title"])

asyncio.run(main())
```

```text
sync:  200 Contact
async: 200 Contact
```

Звички з `fetch` розходяться з налаштуваннями за замовчуванням. Таймаут є одразу, 5 секунд на кожну фазу запиту; у `fetch` його немає взагалі. Редиректи httpx за замовчуванням не виконує, `fetch` виконує. Заголовки за замовчуванням включають `keep-alive`, тобто з'єднання переживає запит і йде назад у пул.

```python
import httpx

client = httpx.Client()
print(client.timeout)
print(client.follow_redirects)
print(client.headers)
```

```text
Timeout(timeout=5.0)
False
Headers({'accept': '*/*', 'accept-encoding': 'gzip, deflate', 'connection': 'keep-alive', 'user-agent': 'python-httpx/0.28.1'})
```

Під клієнтом лежить транспорт (transport, офіційний термін httpx): об'єкт, який отримує готовий `httpx.Request` і повертає `httpx.Response`. Клієнт збирає запит (base URL, параметри, заголовки, тіло), віддає транспорту і обробляє відповідь (редиректи, cookies, хуки). За замовчуванням транспорт ходить у мережу через бібліотеку `httpcore`. `httpx.MockTransport(handler)` підміняє його функцією: вона отримує справжній `Request` і повертає `Response`, мережі немає. У браузері платформи мережі теж немає, тому всі живі приклади й завдання уроку зроблені саме так; детально про тестування в розділі про MockTransport.

```python live
import httpx

def handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/old":
        return httpx.Response(302, headers={"Location": "/new"})
    return httpx.Response(200, json={"path": request.url.path})

client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.example.com")

r = client.get("/old")
print(r.status_code, r.is_redirect, r.next_request)

r = client.get("/old", follow_redirects=True)
print(r.status_code, r.url, r.history)
print(r.json())
```

```text
302 True <Request('GET', 'https://api.example.com/new')>
200 https://api.example.com/new [<Response [302 Found]>]
{'path': '/new'}
```

> **Пастка.** Без `follow_redirects=True` ви отримаєте `302` з порожнім тілом, і `r.json()` впаде на розборі. Перенесений з `fetch` код, який ходить на API з редиректом (HTTP на HTTPS, старий шлях на новий), ламається саме так. Вмикайте прапорець на рівні клієнта, якщо редиректи очікувані, або на рівні запиту, якщо точково.

## Запит і відповідь

Параметри запиту мають прямі відповідники в `fetch` і axios, але кодування тіла обирається іменем аргументу, а не заголовком. `params` будує query string (список дає повторений ключ). `json=` серіалізує об'єкт і ставить `Content-Type: application/json`. `data=` зі словником це HTML-форма, `application/x-www-form-urlencoded`. `files=` це `multipart/form-data`. `headers` додаються до заголовків клієнта.

```python live
import httpx

def handler(request: httpx.Request) -> httpx.Response:
    ctype = request.headers.get("content-type", "-").split(";")[0]
    body = request.content
    if ctype == "multipart/form-data":
        body = body.split(b"\r\n")[1]           # перший рядок після boundary
    print(request.method, request.url)
    print("   ", ctype, body)
    return httpx.Response(200)

client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.example.com")

client.get("/forms", params={"q": "contact form", "page": 2, "tag": ["a", "b"]})
client.post("/forms", json={"title": "Contact", "fields": []})
client.post("/login", data={"user": "bogdan", "remember": "1"})
client.post("/upload", files={"file": ("page.html", b"<h1>hi</h1>", "text/html")})
```

```text
GET https://api.example.com/forms?q=contact+form&page=2&tag=a&tag=b
    - b''
POST https://api.example.com/forms
    application/json b'{"title":"Contact","fields":[]}'
POST https://api.example.com/login
    application/x-www-form-urlencoded b'user=bogdan&remember=1'
POST https://api.example.com/upload
    multipart/form-data b'Content-Disposition: form-data; name="file"; filename="page.html"'
```

> **Пастка.** В axios `data: {...}` означає JSON. У httpx `data={...}` означає форму, і бекенд на FastAPI з Pydantic-моделлю відповість 422, бо JSON-тіла немає. Для JSON завжди `json=`. Межа multipart (boundary) у `files=` генерується випадково на кожен запит, тому приклад друкує не початок тіла, а рядок після неї.

Об'єкт `httpx.Response` віддає все одразу, бо тіло вже прочитане: `status_code` і `reason_phrase`, `headers` (без урахування регістру, як `Headers` у fetch), `content` як `bytes`, `text` як `str` у кодуванні з заголовка, `json()` як розібраний JSON. `raise_for_status()` нічого не робить для 2xx і повертає саму відповідь, тож його можна ставити в ланцюжок; для 1xx, 3xx, 4xx, 5xx кидає `HTTPStatusError`, у якому є і `request`, і `response`.

```python live
import httpx

def handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/forms/42":
        return httpx.Response(200, json={"id": 42, "title": "Contact"}, headers={"X-Request-Id": "abc"})
    return httpx.Response(404, json={"detail": "form not found"})

client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.example.com")

r = client.get("/forms/42")
print(r.status_code, r.reason_phrase, r.headers["x-request-id"], r.headers["Content-Type"])
print(type(r.content).__name__, type(r.text).__name__, r.json())
print(client.get("/forms/42").raise_for_status().json()["title"])

r = client.get("/forms/7")
print(r.status_code, r.is_success, r.is_error)
try:
    r.raise_for_status()
except httpx.HTTPStatusError as exc:
    print(exc)
    print(exc.response.json(), exc.request.url)
```

```text
200 OK abc application/json
bytes str {'id': 42, 'title': 'Contact'}
Contact
404 False True
Client error '404 Not Found' for url 'https://api.example.com/forms/7'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404
{'detail': 'form not found'} https://api.example.com/forms/7
```

`r.request` це той запит, який реально пішов у транспорт, після злиття `base_url`, кодування `params`, заголовків клієнта й автентифікації. Для дебагу це перше місце, куди дивитись, коли сервер каже "не те прийшло": у fetch для цього відкривали вкладку Network, тут достатньо надрукувати.

```python live
import httpx

client = httpx.Client(
    transport=httpx.MockTransport(lambda request: httpx.Response(422)),
    base_url="https://api.example.com/v1",
    headers={"X-Client": "formbuilder"},
)
r = client.post("/forms", params={"draft": True}, json={"title": "Contact"})
req = r.request
print(req.method, req.url)
print(req.headers["x-client"], req.headers["content-type"], req.headers["content-length"])
print(req.content)
```

```text
POST https://api.example.com/v1/forms?draft=true
formbuilder application/json 19
b'{"title":"Contact"}'
```

Зверніть увагу на `draft=true`: Python-ний `True` у `params` став рядком `true` у нижньому регістрі, бо httpx кодує булеві значення так, як їх чекають веб-API. І на шлях: відносний `"/forms"` дописався до `base_url` разом з його `/v1`, а не замінив його, як було б з `new URL("/forms", base)` у JS.

<!-- task: q1 -->

<!-- task: t1 -->

## Таймаути й ієрархія помилок

Таймаут у httpx не одне число, а чотири фази: `connect` (встановити TCP і TLS), `read` (дочекатись наступної порції байтів), `write` (відправити порцію тіла), `pool` (дочекатись вільного з'єднання в пулі). `timeout=5.0` ставить усі чотири в 5 секунд, `httpx.Timeout(10.0, connect=2.0)` задає загальне значення й уточнює окремі фази. Таймаут ставлять на клієнт і перевизначають на запит; `timeout=None` вимикає його повністю.

```python
import httpx

print(httpx.Timeout(10.0, connect=2.0))

try:
    httpx.get("http://127.0.0.1:8907/slow?delay=1", timeout=0.2)
except httpx.TimeoutException as exc:
    print(type(exc).__name__, "|", exc)

try:
    httpx.get("http://127.0.0.1:9/")
except httpx.ConnectError as exc:
    print(type(exc).__name__, "|", exc)

try:
    httpx.get("http://no-such-host.invalid/")
except httpx.ConnectError as exc:
    print(type(exc).__name__, "|", exc)
```

```text
Timeout(connect=2.0, read=10.0, write=10.0, pool=10.0)
ReadTimeout | timed out
ConnectError | [Errno 61] Connection refused
ConnectError | [Errno 8] nodename nor servname provided, or not known
```

Усі винятки httpx мають спільний корінь `httpx.HTTPError`, а під ним дві гілки, які важливо розрізняти. `RequestError` означає, що відповіді немає: не вдалось з'єднатись, сервер не відповів вчасно, з'єднання обірвалось. `HTTPStatusError` означає, що відповідь є, але її статус не 2xx, і кидає його лише `raise_for_status()`. Ось ланцюжки предків, як їх друкує `__mro__`:

```python
import httpx

for cls in (httpx.HTTPStatusError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.PoolTimeout,
            httpx.ConnectError, httpx.RemoteProtocolError, httpx.TooManyRedirects, httpx.InvalidURL):
    print(cls.__name__, "->", " -> ".join(c.__name__ for c in cls.__mro__[1:-2]))
```

```text
HTTPStatusError -> HTTPError -> Exception
ReadTimeout -> TimeoutException -> TransportError -> RequestError -> HTTPError -> Exception
ConnectTimeout -> TimeoutException -> TransportError -> RequestError -> HTTPError -> Exception
PoolTimeout -> TimeoutException -> TransportError -> RequestError -> HTTPError -> Exception
ConnectError -> NetworkError -> TransportError -> RequestError -> HTTPError -> Exception
RemoteProtocolError -> ProtocolError -> TransportError -> RequestError -> HTTPError -> Exception
TooManyRedirects -> RequestError -> HTTPError -> Exception
InvalidURL -> Exception
```

На практиці ловлять три рівні. `httpx.TimeoutException` для "сервер повільний", `httpx.TransportError` для "мережа підвела" (сюди входять і таймаути), `httpx.HTTPStatusError` для "сервер відповів помилкою". Порядок `except` має значення: вужчий клас іде перед ширшим, інакше ширший перехопить усе. `InvalidURL` і помилки в коді (`TypeError` на кривих аргументах) у `HTTPError` не входять, і це правильно: це баг, а не мережа.

```python live
import httpx

def handler(request: httpx.Request) -> httpx.Response:
    match request.url.path:
        case "/slow":
            raise httpx.ReadTimeout("timed out", request=request)
        case "/down":
            raise httpx.ConnectError("connection refused", request=request)
        case "/broken":
            return httpx.Response(502)
        case _:
            return httpx.Response(200)

client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.example.com")

for path in ["/ok", "/slow", "/down", "/broken"]:
    try:
        client.get(path).raise_for_status()
        print(path, "ok")
    except httpx.TimeoutException as exc:
        print(path, "timeout:", type(exc).__name__)
    except httpx.TransportError as exc:
        print(path, "network:", type(exc).__name__)
    except httpx.HTTPStatusError as exc:
        print(path, "status:", exc.response.status_code)
```

```text
/ok ok
/slow timeout: ReadTimeout
/down network: ConnectError
/broken status: 502
```

Чому "без таймауту" це баг, а не налаштування. Сервер прийняв TCP-з'єднання і завис: не відповідає, але й не закриває сокет. Без `read`-таймауту `await client.get(...)` чекає вічно. У воркері генерації це означає задачу, яка ніколи не завершиться: місце в `Semaphore` не звільниться, `queue.join()` з m5-l05 не повернеться, а зовні це виглядає як "воркер завис", без жодного винятку в логах. Таймаут перетворює зависання на `ReadTimeout`, який можна зловити, залогувати і повторити.

> **Пастка.** `read`-таймаут рахується між порціями байтів, а не на весь запит. Сервер, який віддає по байту кожні 100 мс, ніколи не впреться в `read=0.3`, і запит на 10 байт триватиме секунду; на мегабайт він триватиме добу. Загальний дедлайн на операцію ставлять зверху через `asyncio.timeout` з m5-l05.

```python
import asyncio
import httpx

async def main() -> None:
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8907", timeout=0.3) as client:
        r = await client.get("/trickle")          # 10 байтів, по одному кожні 0.1 с
        print("read timeout 0.3s, body:", r.text)
        try:
            async with asyncio.timeout(0.5):
                await client.get("/trickle")
        except TimeoutError:
            print("asyncio.timeout(0.5): TimeoutError")

asyncio.run(main())
```

```text
read timeout 0.3s, body: ..........
asyncio.timeout(0.5): TimeoutError
```

> **JS-аналог.** Пара `httpx.Timeout` + `asyncio.timeout` це те, що у fetch робить один `AbortSignal.timeout(ms)`: він обмежує весь запит, а пофазних таймаутів у fetch немає. В axios `timeout` теж загальний. httpx дає обидва рівні, і в бекенд-коді потрібні обидва: пофазний ловить мертве з'єднання швидко, загальний гарантує, що задача вкладеться у свій бюджет часу.

<!-- task: q2 -->

<!-- task: t2 -->

## AsyncClient: один клієнт на застосунок

`AsyncClient` використовують через `async with`. На вході нічого важкого не відбувається, а на виході `aclose()` закриває всі з'єднання пулу. Пул і є причиною, чому клієнт має бути один і довгоживучий: TCP-з'єднання після відповіді не закривається, а повертається в пул (keep-alive), і наступний запит до того самого хоста йде по ньому без нового рукостискання TCP і TLS. На локальному сервері це видно по номеру клієнтського порту, який сервер повертає у відповіді.

```python
import httpx

for _ in range(3):
    r = httpx.get("http://127.0.0.1:8907/port")
    print("httpx.get:", r.json()["client_port"])

with httpx.Client(base_url="http://127.0.0.1:8907") as client:
    for _ in range(3):
        r = client.get("/port")
        print("Client:   ", r.json()["client_port"])
```

```text
httpx.get: 58540
httpx.get: 58541
httpx.get: 58542
Client:    58543
Client:    58543
Client:    58543
```

Номери портів у вас будуть інші, важливий лише збіг. Три виклики `httpx.get` дали три з'єднання, три запити через клієнт пішли по одному. До HTTPS-хоста кожне нове з'єднання це ще й TLS-рукостискання, тобто кілька зайвих round trip на кожен запит. Тому клієнт створюють один раз на старті застосунку і передають туди, де він потрібен: у FastAPI це lifespan застосунку (модуль 7), у воркері це аргумент функції. `async with httpx.AsyncClient()` усередині функції, яку викликають на кожен запит, це той самий `httpx.get` з додатковими кроками.

> **JS-аналог.** У Node те саме робить `http.Agent` з `keepAlive`, а глобальний `fetch` (undici) тримає пул сам, тому JS-розробник рідко думає про з'єднання. У Python пул живе в об'єкті клієнта і помирає разом з ним: немає клієнта, немає пулу.

Пул обмежений: за замовчуванням не більше 100 з'єднань і 20 простоюючих keep-alive. Коли всі зайняті, наступний запит чекає вільного, і саме це очікування обмежує фаза `pool` таймауту. Дванадцять паралельних запитів з `max_connections=3` підуть рівно по трьох з'єднаннях:

```python
import asyncio
import httpx

async def main() -> None:
    limits = httpx.Limits(max_connections=3)
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8907", limits=limits) as client:
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(client.get("/port")) for _ in range(12)]
        ports = {t.result().json()["client_port"] for t in tasks}
        print("requests:", len(tasks), "connections:", len(ports))

asyncio.run(main())
```

```text
requests: 12 connections: 3
```

Паралельні запити це `TaskGroup` або `gather` з m5-l05 без жодної специфіки httpx: `client.get(...)` повертає корутину, як і будь-яка інша `async def`. Обмеження "не більше N одночасно" робиться через `asyncio.Semaphore`, так само як для рендеру. Обробник `MockTransport` може бути `async def`, тож "сервер" нижче рахує, скільки запитів у нього одночасно, і відповідає з різною затримкою.

```python live
import asyncio
import httpx

in_flight = 0
peak = 0

async def handler(request: httpx.Request) -> httpx.Response:
    global in_flight, peak
    in_flight += 1
    peak = max(peak, in_flight)
    form_id = int(request.url.path.rsplit("/", 1)[1])
    await asyncio.sleep(0.01 * form_id)          # "сервер" відповідає з різною швидкістю
    in_flight -= 1
    return httpx.Response(200, json={"id": form_id, "title": f"Form {form_id}"})

async def fetch_title(client: httpx.AsyncClient, sem: asyncio.Semaphore, form_id: int) -> str:
    async with sem:
        r = await client.get(f"/forms/{form_id}")
        return r.raise_for_status().json()["title"]

async def main() -> None:
    sem = asyncio.Semaphore(2)
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport, base_url="https://api.example.com") as client:
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(fetch_title(client, sem, i)) for i in [3, 1, 2, 5, 4]]
    print([t.result() for t in tasks])
    print("peak in flight:", peak)

asyncio.run(main())
```

```text
['Form 3', 'Form 1', 'Form 2', 'Form 5', 'Form 4']
peak in flight: 2
```

Результати в порядку створення задач, хоча завершувались вони в іншому порядку: `TaskGroup` повертає задачі, а не потік результатів. Семафор і `Limits` виглядають як одне й те саме, але працюють по-різному. Семафор чекає скільки завгодно і стоїть у вашому коді, тож ви вирішуєте, що саме обмежувати (запити до партнера, а не до всіх хостів). Пул чекає не довше за `pool`-таймаут і після цього кидає `PoolTimeout`.

```python
import asyncio
import httpx

async def main() -> None:
    timeout = httpx.Timeout(2.0, pool=0.1)
    limits = httpx.Limits(max_connections=1)
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8907", timeout=timeout, limits=limits) as client:
        results = await asyncio.gather(
            client.get("/slow", params={"delay": 0.3}),
            client.get("/slow", params={"delay": 0.3}),
            return_exceptions=True,
        )
        for r in results:
            print(r if isinstance(r, httpx.Response) else type(r).__name__)

asyncio.run(main())
```

```text
<Response [200 OK]>
PoolTimeout
```

Правило: бізнесове обмеження паралелізму це `Semaphore`, а `Limits` пулу ставлять не меншим за нього, щоб запити, які пройшли семафор, не впирались ще й у пул.

<!-- task: t3 -->

## Ретраї: що, коли і скільки разів

Повтор має сенс лише тоді, коли наступна спроба може дати інший результат. Тимчасові збої: таймаути й обриви з'єднання (`TransportError`), `502`, `503`, `504` (проксі чи сервер перевантажений або перезапускається), `429` (ви перевищили ліміт, і сервер просить зачекати, часто з заголовком `Retry-After` у секундах). Постійні помилки не повторюють: `400`, `401`, `403`, `404`, `409`, `422` при повторі дадуть ту саму відповідь, бо проблема в запиті, а не в сервері. `500` сіра зона: зазвичай це баг на сервері, але повтор GET нікому не зашкодить.

Друга умова: запит має бути ідемпотентним (idempotent, офіційний термін зі специфікації HTTP, RFC 9110), тобто повтор не змінює результат порівняно з одним виконанням. `GET`, `HEAD`, `PUT`, `DELETE` ідемпотентні за визначенням методу; `POST` і `PATCH` ні. Повтор `POST /payments` після таймауту може списати гроші двічі. Стандартний спосіб зробити `POST` безпечним для повтору це заголовок `Idempotency-Key`: клієнт генерує ключ один раз на операцію і шле той самий у кожній спробі, а сервер, побачивши знайомий ключ, повертає збережений результат замість повторного виконання.

> **Під капотом.** Не всі `TransportError` однакові для неідемпотентних запитів. `ConnectError` і `ConnectTimeout` означають, що з'єднання не встановилось і запит гарантовано не пішов, тож повторювати безпечно будь-що. `ReadTimeout` означає, що запит пішов, а відповідь не прийшла: сервер міг усе виконати. Саме тому вбудований параметр `httpx.AsyncHTTPTransport(retries=3)` повторює лише помилки з'єднання і нічого більше.

Між спробами чекають з експоненційною затримкою (exponential backoff, загальноінженерний термін): `base * 2**attempt`, обмежено зверху `max_delay`. Якщо сотня воркерів одночасно отримала `503` і всі повторюють рівно через 100, 200, 400 мс, вони приходять на сервер синхронними хвилями й валять його знову. Jitter (жаргон, усталений після статті AWS Architecture Blog про backoff) розмазує ці хвилі випадковістю; варіант "full jitter" бере випадкову затримку від нуля до експоненційної межі.

```python live
import asyncio
import random
import httpx

RETRY_STATUSES = {429, 500, 502, 503, 504}

async def get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    attempts: int = 4,
    base_delay: float = 0.1,
    max_delay: float = 2.0,
    rng: random.Random | None = None,
) -> httpx.Response:
    rng = rng or random.Random()
    for attempt in range(attempts):
        last = attempt == attempts - 1
        try:
            response = await client.get(url)
        except httpx.TransportError as exc:          # таймаути, обрив з'єднання
            if last:
                raise
            reason = type(exc).__name__
        else:
            if response.status_code not in RETRY_STATUSES or last:
                return response.raise_for_status()   # 2xx повертає, 4xx кидає одразу
            reason = str(response.status_code)
        delay = rng.uniform(0, min(max_delay, base_delay * 2**attempt))  # full jitter
        print(f"attempt {attempt + 1}: {reason}, sleep {delay:.3f}s")
        await asyncio.sleep(delay)
    raise AssertionError("unreachable")

def scripted(script: list[int | type[Exception]]):
    steps = iter(script)
    def handler(request: httpx.Request) -> httpx.Response:
        step = next(steps)
        if isinstance(step, int):
            return httpx.Response(step, json={"status": step})
        raise step("simulated", request=request)
    return handler

async def main() -> None:
    rng = random.Random(7)                           # seed: однаковий вивід щоразу
    scenarios = {
        "503, timeout, 200": [503, httpx.ReadTimeout, 200],
        "404": [404],
        "503 x3": [503, 503, 503],
    }
    for name, script in scenarios.items():
        print(f"-- {name}")
        transport = httpx.MockTransport(scripted(script))
        async with httpx.AsyncClient(transport=transport) as client:
            try:
                r = await get_with_retry(client, "https://api.example.com/forms",
                                         attempts=3, base_delay=0.05, rng=rng)
                print("result:", r.status_code)
            except httpx.HTTPStatusError as exc:
                print("gave up:", exc.response.status_code)

asyncio.run(main())
```

```text
-- 503, timeout, 200
attempt 1: 503, sleep 0.016s
attempt 2: ReadTimeout, sleep 0.015s
result: 200
-- 404
gave up: 404
-- 503 x3
attempt 1: 503, sleep 0.033s
attempt 2: 503, sleep 0.007s
gave up: 503
```

Кілька рішень у цьому коді не випадкові. `try/except/else`: гілка `else` виконується лише без винятку, тож обробка статусу не потрапляє під `except TransportError`. На останній спробі `503` не ковтається, а перетворюється на `HTTPStatusError` через `raise_for_status()`, тож той, хто викликає, бачить справжню причину, а не `None`. `404` виходить з першої спроби без затримки. Генератор випадкових чисел передається параметром, щоб тест міг зафіксувати seed; у проді його не передають. Для `429` у реальному коді варто брати затримку з `Retry-After`, якщо заголовок є.

Готова бібліотека для цього `tenacity`: декоратор `@retry(stop=stop_after_attempt(4), wait=wait_random_exponential(multiplier=0.1, max=2), retry=retry_if_exception_type(httpx.TransportError))` дає те саме декларативно, і вона вартує свого місця, коли політик ретраю в проєкті кілька. Для одного клієнта до одного вебхука цикл на двадцять рядків прозоріший.

<!-- task: q3 -->

<!-- task: t4 -->

## Тести без мережі: MockTransport

`MockTransport` перехоплює запит на найнижчому рівні, де вже немає нічого, крім `Request` на вході й `Response` на виході. Весь код вище (клієнт, `base_url`, заголовки, хуки, редиректи, ваші ретраї) виконується справжній. Це ближче до msw, ніж до `jest.mock("node-fetch")`: ви не мокаєте функцію, ви підміняєте мережу. Обробник для `Client` синхронний; для `AsyncClient` він може бути і звичайною функцією, і `async def`.

Умова, без якої нічого не вийде: код, що робить запити, приймає клієнт ззовні, а не створює його всередині. Це та сама інверсія залежностей, яку в TS роблять, передаючи `fetch` чи інстанс axios у конструктор. Тоді тест створює клієнт з `MockTransport`, а прод з реальним транспортом, і код між ними однаковий.

```python live
import asyncio
import json
import httpx

async def create_form(client: httpx.AsyncClient, title: str) -> int:
    r = await client.post("/forms", json={"title": title})
    return r.raise_for_status().json()["id"]

async def test_create_form() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201, json={"id": 7})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport, base_url="https://api.example.com") as client:
        assert await create_form(client, "Contact") == 7

    [request] = seen
    assert request.method == "POST"
    assert request.url == "https://api.example.com/forms"
    assert json.loads(request.content) == {"title": "Contact"}
    print("test_create_form: ok, requests:", len(seen))

asyncio.run(test_create_form())
```

```text
test_create_form: ok, requests: 1
```

Сценарії з кількох відповідей поспіль (спершу `503`, потім `200`) будуються через ітератор, як `scripted` у прикладі з ретраями: обробник щоразу бере наступний крок. Помилку мережі обробник просто кидає: `raise httpx.ConnectError("...", request=request)`. Аргумент `request` обов'язковий за змістом: ваш код може читати `exc.request` для логування.

> **Пастка.** `timeout=` з `MockTransport` не працює. Таймаути реалізує мережевий транспорт `httpcore`, а мок-транспорт його замінив. Обробник, який спить секунду, поверне відповідь через секунду за будь-якого `timeout`. Таймаут у тесті імітують винятком з обробника або перевіряють загальний дедлайн через `asyncio.timeout`.

```python live
import asyncio
import httpx

async def slow(request: httpx.Request) -> httpx.Response:
    await asyncio.sleep(0.2)
    return httpx.Response(200)

async def main() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(slow), timeout=0.05) as client:
        r = await client.get("https://api.example.com/")
        print("timeout=0.05 ignored:", r.status_code)
        try:
            async with asyncio.timeout(0.05):
                await client.get("https://api.example.com/")
        except TimeoutError:
            print("asyncio.timeout works: TimeoutError")

asyncio.run(main())
```

```text
timeout=0.05 ignored: 200
asyncio.timeout works: TimeoutError
```

Дві бібліотеки збудовані на тому самому механізмі транспорту: `respx` дає маршрутизацію на кшталт nock (`respx.post("https://hooks.example.com/pages").mock(side_effect=[...])`), а `pytest-httpx` дає фікстуру `httpx_mock`, яка ще й падає, якщо зареєстрована відповідь не знадобилась. Для FastAPI є `httpx.ASGITransport(app=app)`: клієнт звертається до застосунку прямо в процесі, без сервера; це основа тестів API в m7-l05.

## Стрімінг великих відповідей

`client.get(...)` читає все тіло в пам'ять, перш ніж повернути відповідь: `r.content` це `bytes` повного розміру. Для архіву статики на сотні мегабайт це сотні мегабайт RAM у воркері. `client.stream(method, url)` повертає асинхронний контекстний менеджер: на вході прочитані лише статус і заголовки, тіло ви читаєте ітерацією, а на виході з'єднання повертається в пул.

```python live
import asyncio
import httpx

async def chunks():
    for i in range(5):
        yield f"chunk-{i};".encode()

def handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=chunks())    # тіло як потік

async def main() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        async with client.stream("GET", "https://cdn.example.com/page.zip") as r:
            async for part in r.aiter_bytes():
                print(part)
            print("downloaded:", r.num_bytes_downloaded)

        async with client.stream("GET", "https://cdn.example.com/page.zip") as r:
            async for part in r.aiter_bytes(chunk_size=16):
                print(len(part), part)

asyncio.run(main())
```

```text
b'chunk-0;'
b'chunk-1;'
b'chunk-2;'
b'chunk-3;'
b'chunk-4;'
downloaded: 40
16 b'chunk-0;chunk-1;'
16 b'chunk-2;chunk-3;'
8 b'chunk-4;'
```

`aiter_bytes()` віддає шматки такими, як прийшли з мережі, `aiter_bytes(chunk_size=...)` перепаковує їх у шматки заданого розміру. Поруч є `aiter_text()` (з декодуванням), `aiter_lines()` (для NDJSON чи server-sent events) і `aiter_raw()` (без розпакування gzip). Синхронний клієнт має ті самі методи без `a`: `iter_bytes()` і так далі. Завантаження у файл з хешем на льоту, де в пам'яті одночасно не більше одного шматка:

```python
import asyncio
import hashlib
import tempfile
from pathlib import Path

import httpx

async def download(client: httpx.AsyncClient, url: str, dest: Path) -> str:
    digest = hashlib.sha256()
    async with client.stream("GET", url) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            async for chunk in r.aiter_bytes(chunk_size=64 * 1024):
                f.write(chunk)
                digest.update(chunk)
    return digest.hexdigest()

async def main() -> None:
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8907") as client:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "big.bin"
            sha = await download(client, "/big", dest)
            print(dest.stat().st_size, sha[:12])

asyncio.run(main())
```

```text
1000000 1b977e9f84f1
```

Запис 64 КБ у локальний файл це мікросекунди, і блокування циклу тут можна знехтувати; якщо пишете на повільний мережевий диск, `f.write` варто винести в `asyncio.to_thread`. Завантаження в протилежний бік стрімиться так само: `content=` приймає асинхронний генератор байтів (m5-l06), і httpx відправить тіло шматками з `Transfer-Encoding: chunked`.

> **Пастка.** Усередині `stream` атрибути `r.content`, `r.text` і `r.json()` недоступні, доки тіло не прочитане: `httpx.ResponseNotRead`. Якщо треба прочитати тіло цілком (наприклад, маленьку відповідь з помилкою), спершу `await r.aread()`. Після виходу з `async with` тіло прочитати вже не можна, з'єднання повернулось у пул.

```python
import httpx

with httpx.Client(base_url="http://127.0.0.1:8907") as client:
    with client.stream("GET", "/big") as r:
        print(r.status_code, r.headers["content-length"])
        try:
            r.content
        except httpx.ResponseNotRead as exc:
            print(type(exc).__name__, "|", exc)
```

```text
200 1000000
ResponseNotRead | Attempted to access streaming response content, without having called `read()`.
```

> **JS-аналог.** Це `res.body` як `ReadableStream` і `for await (const chunk of res.body)` у Node. Різниця в тому, що у fetch тіло завжди потокове і `res.json()` читає його асинхронно, а в httpx тіло за замовчуванням читається повністю ще до повернення відповіді, і потоковість треба попросити явно.

## Заголовки, автентифікація й event_hooks

Заголовки клієнта зливаються із заголовками запиту, запит перемагає. `auth=(user, password)` дає HTTP Basic: httpx сам закодує пару в `Authorization: Basic ...`. Bearer-токен окремого параметра не має, це просто заголовок. Для нестандартних схем (підпис запиту, оновлення токена після `401`) є базовий клас `httpx.Auth` з генератором `auth_flow`, який отримує запит, змінює його і `yield`-ить; якщо після `yield` прийде відповідь, генератор може подивитись на неї і відправити ще один запит.

```python live
import httpx

def handler(request: httpx.Request) -> httpx.Response:
    print(request.url.path, "->", request.headers.get("authorization"))
    return httpx.Response(200)

transport = httpx.MockTransport(handler)

with httpx.Client(transport=transport, auth=("bogdan", "s3cret")) as client:
    client.get("https://api.example.com/basic")

with httpx.Client(transport=transport, headers={"Authorization": "Bearer tok-123"}) as client:
    client.get("https://api.example.com/bearer")
    client.get("https://api.example.com/override", headers={"Authorization": "Bearer other"})

class ApiKeyAuth(httpx.Auth):
    def __init__(self, key: str) -> None:
        self.key = key

    def auth_flow(self, request: httpx.Request):
        request.headers["Authorization"] = f"ApiKey {self.key}"
        yield request

with httpx.Client(transport=transport, auth=ApiKeyAuth("k-42")) as client:
    client.get("https://api.example.com/custom")
```

```text
/basic -> Basic Ym9nZGFuOnMzY3JldA==
/bearer -> Bearer tok-123
/override -> Bearer other
/custom -> ApiKey k-42
```

`event_hooks` (офіційна назва параметра) це місце для того, що в axios роблять інтерцептори: логування, метрики, кореляційний id, глобальний `raise_for_status`. Параметр приймає словник зі списками функцій для двох подій, `"request"` і `"response"`. Хук запиту викликається перед відправкою і може дописати заголовок; хук відповіді отримує відповідь до того, як її побачить ваш код. Виняток з хука перериває запит і летить у місце виклику.

```python live
import asyncio
import httpx

def handler(request: httpx.Request) -> httpx.Response:
    status = 404 if request.url.path == "/missing" else 200
    return httpx.Response(status, json={"path": request.url.path})

async def log_request(request: httpx.Request) -> None:
    print(f"-> {request.method} {request.url}")

async def log_response(response: httpx.Response) -> None:
    request = response.request
    print(f"<- {response.status_code} {request.method} {request.url.path}")

async def raise_on_error(response: httpx.Response) -> None:
    response.raise_for_status()

async def main() -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://api.example.com",
        event_hooks={"request": [log_request], "response": [log_response, raise_on_error]},
    ) as client:
        r = await client.get("/forms", params={"page": 1})
        print("body:", r.json())
        try:
            await client.get("/missing")
        except httpx.HTTPStatusError as exc:
            print("HTTPStatusError:", exc.response.status_code)

asyncio.run(main())
```

```text
-> GET https://api.example.com/forms?page=1
<- 200 GET /forms
body: {'path': '/forms'}
-> GET https://api.example.com/missing
<- 404 GET /missing
HTTPStatusError: 404
```

Відмінність від інтерцепторів axios: хук не повертає нове значення, яке піде далі по ланцюжку. Він може змінити об'єкт на місці (дописати заголовок у `request.headers`) або кинути виняток, але замінити відповідь на іншу, як `return transformed` в axios, не може. Трансформація даних у Python живе в функції, яка викликає клієнт, а не в клієнті.

> **Пастка.** В `AsyncClient` хуки мають бути `async def`: клієнт робить `await hook(...)`. Звичайна функція виконається, поверне `None`, і запит впаде з `TypeError: object NoneType can't be used in 'await' expression`. Друга пастка: у хуку відповіді тіло з реальної мережі ще не прочитане, `response.json()` дасть `ResponseNotRead`; спершу `await response.aread()`. З `MockTransport` тіло вже в пам'яті, тому тест цю помилку не покаже, а прод покаже.

```python
import httpx

def on_response(response: httpx.Response) -> None:
    try:
        print("hook sees:", response.json())
    except httpx.ResponseNotRead as exc:
        print(type(exc).__name__)
    response.read()
    print("after read():", response.json()["title"])

with httpx.Client(base_url="http://127.0.0.1:8907", event_hooks={"response": [on_response]}) as client:
    client.get("/forms/42")
```

```text
ResponseNotRead
after read(): Contact
```

У справжньому коді хуки пишуть не `print`, а в `logging` з рівнем і контекстом; налаштування логерів, рівні й структуровані логи в m5-l09.

<!-- task: q4 -->

## Для капстоуну

Останній крок пайплайна FormBuilder: сторінку згенеровано і викладено, тепер треба повідомити партнера, у якого форма вбудована, що вийшла нова версія. Партнер дав URL вебхука. Вимоги: таймаут на кожну спробу, повтор на `5xx`, `429` і помилках мережі, жодних повторів на `4xx`, однаковий `Idempotency-Key` в усіх спробах однієї публікації (це `POST`), лог кожного запиту й відповіді. Клієнт передається ззовні, тож тест підставить `MockTransport`, що імітує `503`, а потім `200`.

```python live
import asyncio
import logging
import sys

import httpx

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(name)s %(message)s", force=True)
logging.getLogger("httpx").setLevel(logging.WARNING)   # httpx сам логує кожен запит на INFO
log = logging.getLogger("formbuilder.publisher")

RETRY_STATUSES = {429, 500, 502, 503, 504}

async def _log_request(request: httpx.Request) -> None:
    log.info("-> %s %s", request.method, request.url.path)

async def _log_response(response: httpx.Response) -> None:
    log.info("<- %s %s", response.status_code, response.request.url.path)

def make_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url="https://hooks.partner.example",
        timeout=httpx.Timeout(10.0, connect=3.0),
        event_hooks={"request": [_log_request], "response": [_log_response]},
        transport=transport,
    )

class HttpPublisher:
    def __init__(self, client: httpx.AsyncClient, path: str, *, attempts: int = 4, base_delay: float = 0.5) -> None:
        self.client = client
        self.path = path
        self.attempts = attempts
        self.base_delay = base_delay

    async def publish(self, form_id: str, version: int, url: str) -> str:
        payload = {"form_id": form_id, "version": version, "url": url}
        headers = {"Idempotency-Key": f"{form_id}:{version}"}
        for attempt in range(self.attempts):
            last = attempt == self.attempts - 1
            try:
                r = await self.client.post(self.path, json=payload, headers=headers)
            except httpx.TransportError as exc:
                if last:
                    raise
                log.warning("attempt %d failed: %s", attempt + 1, type(exc).__name__)
            else:
                if r.status_code not in RETRY_STATUSES or last:
                    return r.raise_for_status().json()["delivery_id"]
                log.warning("attempt %d failed: %s", attempt + 1, r.status_code)
            await asyncio.sleep(self.base_delay * 2**attempt)
        raise AssertionError("unreachable")

async def main() -> None:
    sent: list[httpx.Request] = []
    replies = iter([httpx.Response(503), httpx.Response(200, json={"delivery_id": "d-17"})])

    def partner(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return next(replies)

    async with make_client(httpx.MockTransport(partner)) as client:
        publisher = HttpPublisher(client, "/formbuilder/pages", base_delay=0.01)
        delivery = await publisher.publish("contact", 3, "https://cdn.example.com/contact/v3/")

    print("delivery:", delivery)
    print("attempts:", len(sent), "keys:", {r.headers["idempotency-key"] for r in sent})

asyncio.run(main())
```

```text
formbuilder.publisher -> POST /formbuilder/pages
formbuilder.publisher <- 503 /formbuilder/pages
formbuilder.publisher attempt 1 failed: 503
formbuilder.publisher -> POST /formbuilder/pages
formbuilder.publisher <- 200 /formbuilder/pages
delivery: d-17
attempts: 2 keys: {'contact:3'}
```

Кожен шматок тут з окремого розділу уроку: `make_client` збирає таймаут, `base_url` і хуки в одному місці, і в застосунку його викликають один раз; `HttpPublisher` не знає, реальна мережа під ним чи мок; ключ ідемпотентності прив'язаний до пари "форма, версія", тому повторна публікація тієї самої версії навіть з іншого процесу не створить у партнера дубль. Jitter тут опущено заради читабельності виводу; у капстоуні він потрібен, бо воркерів кілька. Рядок з `getLogger("httpx")` теж не декорація: httpx сам пише в логер `httpx` рядок `HTTP Request: POST ... "HTTP/1.1 503 Service Unavailable"` на рівні INFO, і з `level=INFO` у вас буде по два записи на запит. Часто цього вбудованого логу достатньо і власні хуки не потрібні; хуки виграють, коли треба додати контекст (id форми, номер спроби).

> **Для капстоуну.** У pytest той самий тест пишеться як звичайна `def test_...()` з `asyncio.run(...)` всередині або як `async def test_...` з плагіном `anyio` чи `pytest-asyncio`; асинхронні тести детально в m7-l05. Перевіряйте не лише результат, а й самі запити зі списку `sent`: кількість спроб, однаковий ключ, тіло через `json.loads(request.content)`. Саме ці перевірки ловлять регресію "хтось прибрав ключ ідемпотентності".

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`await r.json()` за звичкою з fetch.** Тіло вже прочитане, `json()` синхронний і повертає `dict`; `await` над ним дає `TypeError: object dict can't be used in 'await' expression`. Чекати треба запит, а не розбір.

   ```python
   data = await (await client.get(url)).json()   # TypeError
   r = await client.get(url)
   data = r.json()
   ```

2. **Очікування, що 4xx/5xx кине виняток, як в axios.** httpx поводиться як fetch: будь-який статус це успішна відповідь. Без `raise_for_status()` код піде далі з `{"detail": "Not Found"}` замість даних. Перевірка `if r.status_code == 200` теж погана заміна: вона пропускає `201` і `204`.

   ```python
   r = await client.get(url)
   form = r.raise_for_status().json()
   ```

3. **`timeout=None`, бо "у fetch таймауту не було", або віра, що `read`-таймаут обмежує весь запит.** Перше дає воркери, що зависають назавжди, друге дає запити, що тривають годинами на повільному сервері. Пофазний таймаут на клієнті, загальний дедлайн через `asyncio.timeout`.

   ```python
   client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
   async with asyncio.timeout(30):
       r = await client.get(url)
   ```

4. **Новий клієнт на кожен запит.** `async with httpx.AsyncClient() as c:` усередині функції, яку викликають тисячу разів, це тисяча TCP і TLS рукостискань і нуль користі від пулу. Клієнт створюється один раз на старті й передається параметром.

   ```python
   async def get_form(form_id: int) -> dict:
       async with httpx.AsyncClient() as c:          # новий пул щоразу
           return (await c.get(f"{API}/forms/{form_id}")).json()

   async def get_form(client: httpx.AsyncClient, form_id: int) -> dict:
       return (await client.get(f"/forms/{form_id}")).raise_for_status().json()
   ```

5. **`data=` для JSON, як в axios.** У httpx `data=` це форма, сервер отримає `title=Contact` замість JSON і відповість 422.

   ```python
   await client.post("/forms", data={"title": "Contact"})   # form-urlencoded
   await client.post("/forms", json={"title": "Contact"})   # application/json
   ```

6. **Інтерцептори axios, перенесені в `event_hooks` один в один.** Хук не може повернути змінену відповідь, а в `AsyncClient` він мусить бути `async def`, інакше `TypeError` на кожному запиті.

   ```python
   def log_request(request): ...          # TypeError в AsyncClient
   async def log_request(request): ...    # так
   ```

7. **Ретрай усього підряд.** Цикл `for _ in range(3)` навколо будь-якого винятку повторює `404` і `422`, які не зміняться, і `POST` після `ReadTimeout`, який міг виконатись. Повторюйте `TransportError`, `5xx` і `429`, з backoff і jitter, а `POST` лише з `Idempotency-Key`.

   ```python
   if response.status_code in {429, 500, 502, 503, 504}:
       await asyncio.sleep(rng.uniform(0, min(max_delay, base * 2**attempt)))
   ```

8. **Синхронний `httpx.get` чи `requests.get` усередині `async def`.** Обидва блокують event loop: `gather` з десяти таких "асинхронних" функцій виконається послідовно. В асинхронному коді лише `await client.get(...)` через `AsyncClient`.

   ```python
   async def fetch(url: str) -> bytes:
       return httpx.get(url).content                  # блокує цикл
       return (await client.get(url)).content         # так
   ```

## Підсумок

- httpx має синхронний (`httpx.get`, `Client`) і асинхронний (`AsyncClient`) API однакової форми; `requests` це його синхронний попередник.
- Відповідь повертається з уже прочитаним тілом: `r.json()`, `r.text`, `r.content` синхронні. Стрімінг потрібно попросити явно через `client.stream`.
- Статус помилки не кидає виняток сам; `raise_for_status()` кидає `HTTPStatusError` і повертає відповідь для 2xx.
- `json=` для JSON, `data=` для форми, `files=` для multipart, `params=` для query string; `r.request` показує, що реально пішло.
- Таймаут за замовчуванням 5 с на кожну з чотирьох фаз (`connect`, `read`, `write`, `pool`); загальний дедлайн ставить `asyncio.timeout`.
- `RequestError`/`TransportError` означає, що відповіді немає; `HTTPStatusError`, що відповідь погана. Обидва під `HTTPError`.
- Один `AsyncClient` на застосунок: у ньому пул з'єднань з keep-alive. Паралельність через `TaskGroup`, ліміт через `Semaphore`, `Limits` пулу не менший за семафор.
- Ретраять `TransportError`, `5xx`, `429` з експоненційною затримкою і jitter; не ретраять `4xx`; `POST` лише з `Idempotency-Key`.
- `MockTransport(handler)` підміняє мережу, а не код; клієнт передається ззовні, щоб тест міг його підмінити. Таймаути з моком не працюють.
- `event_hooks` це інтерцептори, які спостерігають і можуть кинути виняток; в `AsyncClient` вони `async def`.

## Що далі

Наступний урок m5-l08 відповідає, чому `to_thread` рятує від синхронного `requests.get`, а від важкого обчислення ні: GIL, потоки й процеси. m5-l09 замінює `print` у хуках на `logging` з рівнями й контекстом запиту. А в m7-l05 той самий `AsyncClient` повернеться з `ASGITransport` замість мережі, і ви тестуватимете власний FastAPI-застосунок так само, як тут тестували `Publisher`.
