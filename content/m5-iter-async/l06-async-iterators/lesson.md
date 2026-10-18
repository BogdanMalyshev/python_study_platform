---
id: m5-l06
module: m5-iter-async
title: "Асинхронні ітератори й генератори, async with"
summary: "Учень пише власні асинхронні ітератори, генератори й контекстні менеджери, детерміновано закриває перервані потоки через aclosing і отримує паралельність там, де генератор сам по собі послідовний."
duration_min: 45
prerequisites: [m5-l05]
---

## `async for`: ітерація, де крок може чекати

Звичайний `for` з m5-l01 на кожному кроці викликає `next(it)`, тобто синхронний `__next__`, і чекає від нього або значення, або `StopIteration`. Якщо наступний елемент ще в мережі (наступна сторінка API, наступне повідомлення з сокета), у `__next__` лише два шляхи: заблокувати потік, а з ним увесь event loop (m5-l05), або повернути awaitable, якого `for` чекати не вміє. Тому протокол продубльовано. `__aiter__` повертає асинхронний ітератор, його `__anext__` повертає awaitable, результат якого і є наступним елементом, а кінець позначає `StopAsyncIteration`. Об'єкт з `__anext__` офіційно називається асинхронним ітератором (asynchronous iterator), об'єкт з `__aiter__` асинхронним iterable (asynchronous iterable). `async for` робить `await` на кожному кроці, і поки елемент не готовий, цикл подій обслуговує інші задачі.

```ts
class Pages {
  constructor(private total: number) {}
  [Symbol.asyncIterator]() {
    let page = 0;
    const total = this.total;
    return {
      async next(): Promise<IteratorResult<string>> {
        if (page >= total) return { done: true, value: undefined };
        await new Promise((r) => setTimeout(r, 10));
        return { done: false, value: `page ${++page}` };
      },
    };
  }
}
for await (const p of new Pages(3)) console.log(p);
```

```python
class Pages:
    def __init__(self, total: int) -> None:
        self.total = total
        self.page = 0

    def __aiter__(self) -> "Pages":
        return self

    async def __anext__(self) -> str:
        if self.page >= self.total:
            raise StopAsyncIteration
        await asyncio.sleep(0.01)
        self.page += 1
        return f"page {self.page}"

async def main() -> None:
    async for p in Pages(3):
        print(p)
```

Розходження ті самі, що в синхронному протоколі: замість обгортки `{ done, value }` елемент повертається напряму, а кінець це виняток. `__aiter__` звичайний `def`: він лише віддає ітератор, чекати там нічого. `__anext__` майже завжди `async def`, бо виклик корутинної функції якраз і повертає потрібний awaitable. Як і `await`, `async for` дозволений лише всередині `async def`; поза нею це `SyntaxError: 'async for' outside async function`.

`async for` розгортається в цикл із вбудованими `aiter()` і `anext()` (обидві з 3.10), асинхронними парами `iter()` і `next()`. `anext(it, default)` повертає `default` замість винятку, як `next(it, default)`.

```python live
import asyncio

class Pages:
    def __init__(self, total: int) -> None:
        self.total = total
        self.page = 0

    def __aiter__(self) -> "Pages":
        return self

    async def __anext__(self) -> str:
        if self.page >= self.total:
            raise StopAsyncIteration
        await asyncio.sleep(0.01)
        self.page += 1
        return f"page {self.page}"

async def main() -> None:
    async for p in Pages(2):
        print("async for:", p)

    it = aiter(Pages(2))              # те, що робить async for
    while True:
        try:
            p = await anext(it)
        except StopAsyncIteration:
            break
        print("manual:", p)

    print(await anext(aiter(Pages(0)), "no pages"))

asyncio.run(main())
```

```text
async for: page 1
async for: page 2
manual: page 1
manual: page 2
no pages
```

> **Пастка.** Два протоколи не взаємозамінні, і в обидва боки помилка однакова за природою. `for` по асинхронному ітератору шукає `__iter__` і не знаходить. `async for` по списку шукає `__aiter__` і теж не знаходить: у JS `for await` приймає і звичайні iterable, у Python ні. Третій варіант помилки: `async def __aiter__`, написаний за аналогією з `__anext__`; тоді `__aiter__` повертає корутину, а не ітератор.

```python
import asyncio

class Pages:
    def __aiter__(self) -> "Pages":
        return self

    async def __anext__(self) -> str:
        raise StopAsyncIteration

class BadPages:
    async def __aiter__(self) -> "BadPages":     # async тут помилка
        return self

async def main() -> None:
    try:
        for p in Pages():
            pass
    except TypeError as e:
        print("for:", e)
    try:
        async for x in [1, 2]:
            pass
    except TypeError as e:
        print("async for:", e)
    try:
        async for x in BadPages():
            pass
    except TypeError as e:
        print("async __aiter__:", e)

asyncio.run(main())
```

```text
for: 'Pages' object is not iterable
async for: 'async for' requires an object with __aiter__ method, got list
async __aiter__: 'async for' received an object from __aiter__ that does not implement __anext__: coroutine
```

Останній випадок ще й лишає в stderr `RuntimeWarning: coroutine 'BadPages.__aiter__' was never awaited`.

<!-- task: t1 -->

## Асинхронні генератори: `async def` з `yield`

Клас із `__anext__` пишуть так само рідко, як клас із `__next__`: генератор з m5-l02 замінює його кількома рядками. Асинхронний генератор (asynchronous generator, офіційна назва з документації) це `async def`, у тілі якої є `yield`. Виклик повертає об'єкт `async_generator` і не виконує жодного рядка тіла; тіло біжить до наступного `yield` на кожному `anext`, а між `yield` можна робити `await`. Це `async function*` з JS один в один, включно з тим, що `__aiter__` такого об'єкта повертає його самого.

```ts
async function* fetchAll(fetchPage: (cursor: string | null) => Promise<Page>) {
  let cursor: string | null = null;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.next;
  } while (cursor);
}
```

```python
async def fetch_all(fetch_page: Callable[[str | None], Awaitable[dict]]) -> AsyncIterator[str]:
    cursor = None
    while True:
        page = await fetch_page(cursor)
        for item in page["items"]:
            yield item
        cursor = page["next"]
        if cursor is None:
            return
```

Розходження в делегуванні й поверненні. `yield*` у JS делегує будь-якому iterable, а `yield from` в асинхронному генераторі заборонений (`SyntaxError: 'yield from' inside async function`), тож делегують циклом: `for item in items: yield item` або `async for x in sub: yield x`. `return value` теж заборонений (`SyntaxError: 'return' with value in async generator`): `StopAsyncIteration` не несе значення, і голий `return` лише завершує потік.

Типове застосування це пагінація, і найкорисніше в ній те, що генератор лінивий. Нижче споживач зупиняється на третьому полі, і третя сторінка так і не запитана.

```python live
import asyncio
from collections.abc import AsyncIterator

PAGES = {None: (["email", "phone"], "p2"), "p2": (["age", "city"], "p3"), "p3": (["note"], None)}

async def fetch_page(cursor: str | None) -> dict:
    print(f"  GET /fields?cursor={cursor}")
    await asyncio.sleep(0.01)
    items, next_cursor = PAGES[cursor]
    return {"items": items, "next": next_cursor}

async def fetch_all() -> AsyncIterator[str]:
    cursor = None
    while True:
        page = await fetch_page(cursor)
        for item in page["items"]:
            yield item
        cursor = page["next"]
        if cursor is None:
            return

async def main() -> None:
    async for field in fetch_all():
        print(field)
        if field == "age":
            break

asyncio.run(main())
```

```text
  GET /fields?cursor=None
email
phone
  GET /fields?cursor=p2
age
```

Генератор робить рівно стільки роботи, скільки попросив споживач, і стоїть на `yield`, поки той обробляє елемент. Друга типова форма, потік подій, виглядає як `while True` з `await queue.get()` і `yield` усередині; її повну версію побачите в розділі для капстоуну.

<!-- task: q1 -->

<!-- task: t2 -->

## Async comprehension і де вони дозволені

`async for` працює й усередині comprehension: `[x async for x in agen()]` збирає асинхронний ітератор у список, це `await Array.fromAsync(gen)` з JS. Окремо від цього всередині будь-якого comprehension можна писати `await`. Обидві форми офіційно називаються asynchronous comprehension (PEP 530) і працюють для списків, словників, множин; фільтр `if` і вкладені `for` теж на місці.

```python live
import asyncio

async def numbers(n: int):
    for i in range(n):
        await asyncio.sleep(0.01)
        yield i

async def double(x: int) -> int:
    await asyncio.sleep(0.01)
    return x * 2

def lazy():                                   # звичайна функція
    return (x * 10 async for x in numbers(3))

async def main() -> None:
    print([x async for x in numbers(4)])
    print([x async for x in numbers(6) if x % 2 == 0])
    print({x: await double(x) for x in range(3)})
    print([await double(x) async for x in numbers(3)])
    print(type(lazy()).__name__, [x async for x in lazy()])

asyncio.run(main())
```

```text
[0, 1, 2, 3]
[0, 2, 4]
{0: 0, 1: 2, 2: 4}
[0, 2, 4]
async_generator [0, 10, 20]
```

Механізм обмеження простий: такий comprehension на кожному кроці робить `await`, отже сам є виразом з `await`, а `await` існує лише всередині `async def`. Тому list, dict і set comprehension з `async for` чи `await` у звичайній функції або на верхньому рівні модуля дають `SyntaxError`. Виняток лише один, генераторний вираз: `lazy()` вище звичайна функція, бо `(... async for ...)` при створенні нічого не виконує, а лише повертає `async_generator`. Споживати його все одно доведеться всередині `async def`.

```python
def collect() -> list[int]:
    return [x async for x in numbers(3)]
```

```text
SyntaxError: asynchronous comprehension outside of an asynchronous function
```

> **Пастка.** `[await render(x) for x in xs]` читається як `await Promise.all(xs.map(render))`, але це послідовне виконання: кожен `await` закінчується до того, як comprehension візьме наступний `x`. Паралельно це `gather` або `TaskGroup` з m5-l05.

```python
import asyncio

async def render(x: int) -> int:
    await asyncio.sleep(0.1)
    return x

async def main() -> None:
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    print([await render(x) for x in range(3)], f"{loop.time() - t0:.1f}s")
    t0 = loop.time()
    print(await asyncio.gather(*(render(x) for x in range(3))), f"{loop.time() - t0:.1f}s")

asyncio.run(main())
```

```text
[0, 1, 2] 0.3s
[0, 1, 2] 0.1s
```

## `async with`: вхід і вихід, що чекають

Звичайний `with` з m4-l07 викликає `__enter__` і `__exit__` синхронно. Ресурс, у якого відкриття або закриття це I/O (з'єднання з базою, HTTP-клієнт із пулом сокетів, транзакція, захоплення семафора), у цей протокол не вкладається: `__enter__` довелося б блокувати цикл. `async with` робить `await obj.__aenter__()` на вході й `await obj.__aexit__(exc_type, exc, tb)` на виході. Решта семантики та сама: значення `__aenter__` іде в `as`, `__aexit__` викликається і при винятку, і `True` з нього ковтає виняток. У TS 5.2 це `await using` із `Symbol.asyncDispose`.

```ts
class Conn {
  static async open(name: string): Promise<Conn> { await handshake(); return new Conn(name); }
  async [Symbol.asyncDispose]() { await this.close(); }
}
{
  await using conn = await Conn.open("db");
  await conn.query("select 1");
}   // тут await conn[Symbol.asyncDispose]()
```

```python
class Conn:
    async def __aenter__(self) -> "Conn":
        await self.handshake()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        await self.close()
        return False

async with Conn("db") as conn:
    await conn.query("select 1")
```

Різниця в тому, кому належить асинхронне відкриття. У TS `await using` чекає лише на dispose, а відкриття це окремий `await` праворуч від `=`. У Python протоколу належать обидві половини, і об'єкт сам вирішує, що робити на вході. Друга різниця: `using` прив'язаний до блоку `{}`, а `async with` scope не створює, змінна `conn` живе після блоку, просто ресурс уже закритий.

```python live
import asyncio

class Conn:
    def __init__(self, name: str) -> None:
        self.name = name

    async def __aenter__(self) -> "Conn":
        await asyncio.sleep(0.01)                     # handshake
        print(f"{self.name}: connected")
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        await asyncio.sleep(0.01)                     # graceful close
        print(f"{self.name}: closed, exc={exc_type.__name__ if exc_type else None}")
        return False                                  # виняток летить далі

    async def query(self, sql: str) -> str:
        await asyncio.sleep(0.01)
        return f"result of {sql!r}"

async def main() -> None:
    async with Conn("db") as conn:
        print(await conn.query("select 1"))

    try:
        async with Conn("db2"):
            raise ValueError("bad config")
    except ValueError as e:
        print("caught:", e)

asyncio.run(main())
```

```text
db: connected
result of 'select 1'
db: closed, exc=None
db2: connected
db2: closed, exc=ValueError
caught: bad config
```

Клас пишуть рідко. `contextlib.asynccontextmanager` робить з асинхронного генератора з одним `yield` асинхронний менеджер так само, як `contextmanager` у m4-l07 робить синхронний: код до `yield` це `__aenter__`, після нього `__aexit__`, а виняток з тіла `async with` прилітає в генератор у точці `yield`. Транзакція нижче комітить при успіху й відкочує при помилці, причому `except BaseException` тут виправданий: відкат потрібен і при скасуванні задачі, а `raise` віддає виняток далі.

```python live
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

log: list[str] = []

async def execute(sql: str) -> None:
    await asyncio.sleep(0.01)
    log.append(sql)

@asynccontextmanager
async def transaction() -> AsyncIterator[None]:
    await execute("BEGIN")
    try:
        yield
    except BaseException:                 # і помилка, і CancelledError
        await execute("ROLLBACK")
        raise
    else:
        await execute("COMMIT")

async def main() -> None:
    async with transaction():
        await execute("INSERT form")
    try:
        async with transaction():
            await execute("INSERT field")
            raise ValueError("duplicate id")
    except ValueError as e:
        log.append(f"caught: {e}")
    print(log)

asyncio.run(main())
```

```text
['BEGIN', 'INSERT form', 'COMMIT', 'BEGIN', 'INSERT field', 'ROLLBACK', 'caught: duplicate id']
```

Асинхронних менеджерів ви вже бачили кілька: `asyncio.timeout`, `TaskGroup` і `Semaphore` з m5-l05. `httpx.AsyncClient` (m5-l07) на вході відкриває пул з'єднань, на виході закриває сокети. Lifespan у FastAPI (m7-l01) це саме `@asynccontextmanager`: код до `yield` виконується на старті застосунку, після `yield` на зупинці. Звичайний `with` з усіма ними не працює, і помилка прямо каже, якого протоколу бракує.

```python
async def main() -> None:
    with asyncio.Semaphore(2): ...        # за звичкою з threading.Lock
```

```text
TypeError: 'Semaphore' object does not support the context manager protocol
```

<!-- task: t3 -->

## Очищення: `aclose`, `aclosing` і перерваний `async for`

Синхронний генератор, перерваний `break`, закривається одразу: CPython рахує посилання, генератор зникає разом з останнім, і його `finally` виконується в ту саму мить (m5-l02). Асинхронний так не може, бо його `finally` має право на `await`, а збирач сміття синхронний і чекати не вміє. Тому asyncio ставить хук через `sys.set_asyncgen_hooks`: коли незакритий асинхронний генератор збирають, цикл планує його `aclose()` окремою задачею, а `asyncio.run` перед виходом закриває всі генератори, що лишились живими (`loop.shutdown_asyncgens()`). `aclose()` кидає `GeneratorExit` у точку `yield`, і `finally` відпрацьовує, але не тоді, коли ви вийшли з циклу.

```python live
import asyncio

def sync_events():
    try:
        yield from range(10)
    finally:
        print("sync cleanup")

async def events(name: str):
    try:
        for i in range(10):
            await asyncio.sleep(0)
            yield i
    finally:
        print(f"{name} cleanup")

async def main() -> None:
    for e in sync_events():
        break
    print("after sync break")

    async for e in events("inline"):
        break
    print("after inline break")
    await asyncio.sleep(0.01)
    print("after sleep")

    stream = events("kept")               # посилання лишилось
    async for e in stream:
        break
    print("after kept break")
    await asyncio.sleep(0.01)
    print("main returns")

asyncio.run(main())
print("after run")
```

```text
sync cleanup
after sync break
after inline break
inline cleanup
after sleep
after kept break
main returns
kept cleanup
after run
```

Генератор без посилань закрився через кілька ітерацій циклу, коли його зібрали. Генератор у змінній `stream` чекав аж до `shutdown_asyncgens` в `asyncio.run`. У сервері цикл живе тижнями, тож "до кінця `asyncio.run`" означає "ніколи": з'єднання, підписка на канал або лічильник клієнтів лишаються зайнятими.

> **Пастка.** У JS `break` у `for await` викликає `return()` ітератора одразу, і `finally` асинхронного генератора відпрацьовує до наступного рядка після циклу. У Python перерваний `async for` генератор не закриває. Детерміновано закривають двома способами: `await stream.aclose()` вручну або `contextlib.aclosing` (3.10+), асинхронний аналог `closing` з m4-l07.

```python live
import asyncio
from contextlib import aclosing

async def events(name: str):
    try:
        for i in range(10):
            await asyncio.sleep(0)
            yield i
    except GeneratorExit:
        print(f"{name}: GeneratorExit at yield")
        raise
    finally:
        print(f"{name} cleanup")

async def main() -> None:
    async with aclosing(events("a")) as stream:
        async for e in stream:
            if e == 1:
                break
    print("after async with")

    stream = events("b")
    async for e in stream:
        break
    await stream.aclose()
    print("after aclose")

asyncio.run(main())
```

```text
a: GeneratorExit at yield
a cleanup
after async with
b: GeneratorExit at yield
b cleanup
after aclose
```

<!-- task: q2 -->

## Генератор послідовний: паралельність через Task і чергу

Асинхронний генератор сам по собі паралельності не додає. `async for` чекає `__anext__`, генератор виконує тіло до наступного `yield` і завмирає, поки споживач обробляє елемент. Попереднього завантаження немає: наступну сторінку генератор почне готувати лише тоді, коли споживач попросить. Це видно з порядку рядків: кроки виробника й споживача строго чергуються.

```python live
import asyncio

async def produce():
    for i in range(3):
        print(f"produce {i}")
        await asyncio.sleep(0.01)
        yield i

async def main() -> None:
    async for i in produce():
        print(f"  consume {i}")
        await asyncio.sleep(0.01)

asyncio.run(main())
```

```text
produce 0
  consume 0
produce 1
  consume 1
produce 2
  consume 2
```

<!-- task: q3 -->

Звідси пастка JS-звички `for await (const x of promises)`. У JS це працює, бо кожен проміс уже виконується, і цикл лише читає результати в порядку масиву. У Python `async for` по списку дає `TypeError` (розділ про протокол), а прямий еквівалент це список Task і звичайний `for` з `await`. Якщо потрібен порядок завершення, а не порядок списку, для цього є `asyncio.as_completed`: у 3.12 він повертає звичайний ітератор awaitable-ів, які віддають результати в міру готовності, тому це `for` плюс `await`, а не `async for` (асинхронну ітерацію по ньому додали лише в 3.13).

```ts
const promises = jobs.map(render);
for await (const html of promises) console.log(html);   // порядок масиву
```

```python
tasks = [asyncio.create_task(render(j)) for j in jobs]
for t in tasks:
    print(await t)                                        # порядок списку, як for await
for fut in asyncio.as_completed([render(j) for j in jobs]):
    print(await fut)                                      # порядок завершення
```

У JS для порядку завершення вбудованого інструменту немає, його збирають із `Promise.race` у циклі. В обох варіантах Python усі задачі стартують одразу, і різниця лише в тому, коли ви бачите кожен результат.

```python live
import asyncio

async def render(name: str, delay: float) -> str:
    await asyncio.sleep(delay)
    return f"<{name}/>"

async def main() -> None:
    jobs = [("landing", 0.03), ("signup", 0.01), ("survey", 0.02)]

    tasks = [asyncio.create_task(render(n, d)) for n, d in jobs]
    print("list order:", [await t for t in tasks])

    for fut in asyncio.as_completed([render(n, d) for n, d in jobs]):
        print("completed:", await fut)

asyncio.run(main())
```

```text
list order: ['<landing/>', '<signup/>', '<survey/>']
completed: <signup/>
completed: <survey/>
completed: <landing/>
```

<!-- task: t4 -->

Коли споживачу потрібен саме потік, тобто інтерфейс `async for`, а виробляти треба паралельно або з кількох джерел, використовують патерн "продюсер плюс черга". Продюсери це Task, які кладуть результати в `asyncio.Queue`; генератор читає з черги й робить `yield`. Генератор лишається послідовним, але тепер він лише роздає готове, а робота йде в задачах. Ключова деталь у `finally`: якщо споживач перервав потік, генератор має скасувати продюсерів і дочекатись їх, інакше вони працюватимуть далі нікому не потрібні. Повна версія цього патерну це завдання нижче; його застосування до статусів генерації в розділі для капстоуну.

<!-- task: t5 -->

## Типізація: `AsyncIterable`, `AsyncIterator`, `AsyncGenerator`

Три абстрактні типи з `collections.abc` повторюють синхронні з m5-l02. `AsyncIterable[T]` має лише `__aiter__`: це тип параметра "те, що можна пройти `async for`". `AsyncIterator[T]` додає `__anext__`: це звичайна анотація результату асинхронного генератора. `AsyncGenerator[Y, S]` додає `asend`, `athrow` і `aclose`; параметрів два, а не три, як у `Generator[Y, S, R]`, бо повертати значення асинхронний генератор не може. Практичне правило: якщо викликач закриватиме генератор через `aclose()` чи `aclosing`, анотуйте `AsyncGenerator[T, None]`, бо в `AsyncIterator` методу `aclose` немає, і mypy це помітить.

```python
import asyncio
from collections.abc import AsyncGenerator, AsyncIterable, AsyncIterator
from contextlib import aclosing

async def ids() -> AsyncIterator[str]:
    yield "email"

async def ids_closable() -> AsyncGenerator[str, None]:
    yield "email"

async def count(source: AsyncIterable[str]) -> int:
    return len([x async for x in source])

async def main() -> None:
    print(await count(ids()))
    print(await count(["email", "phone"]))
    async with aclosing(ids()) as s: ...
    async with aclosing(ids_closable()) as s: ...
```

```text
$ .venv/bin/mypy typing_demo.py
typing_demo.py:16: error: Argument 1 to "count" has incompatible type "list[str]"; expected "AsyncIterable[str]"  [arg-type]
typing_demo.py:17: error: Value of type variable "_SupportsAcloseT" of "aclosing" cannot be "AsyncIterator[str]"  [type-var]
Found 2 errors in 1 file (checked 1 source file)
```

## Для капстоуну

WebSocket-ендпоінт у m7-l04 стрімитиме клієнту статус генерації: `async for event in watch(job): await ws.send_json(event)`. Для ендпоінта `watch` це асинхронний генератор, а всередині це черга подій конкретної задачі, яку наповнює воркер: `queued` при постановці, `running` на старті рендера, `done` чи `failed` наприкінці. Генератор завершується сам на термінальному статусі. Пул воркерів, у свою чергу, зручно віддати як `@asynccontextmanager`: на вході стартують воркери, в `as` іде черга для задач, на виході пул чекає `queue.join()` і зупиняє воркерів, навіть якщо тіло впало. У m7-l01 цей самий менеджер стане частиною lifespan застосунку.

```python live
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

TERMINAL = {"done", "failed"}

@dataclass
class Job:
    id: str
    delay: float
    events: asyncio.Queue[str] = field(default_factory=asyncio.Queue)

async def watch(job: Job) -> AsyncIterator[dict[str, str]]:
    while True:
        status = await job.events.get()
        yield {"job": job.id, "status": status}
        if status in TERMINAL:
            return

async def worker(queue: asyncio.Queue[Job]) -> None:
    while True:
        job = await queue.get()
        try:
            job.events.put_nowait("running")
            await asyncio.sleep(job.delay)            # тут буде рендер
            job.events.put_nowait("done")
        except Exception:
            job.events.put_nowait("failed")
        finally:
            queue.task_done()

@asynccontextmanager
async def worker_pool(n: int) -> AsyncIterator[asyncio.Queue[Job]]:
    queue: asyncio.Queue[Job] = asyncio.Queue()
    workers = [asyncio.create_task(worker(queue)) for _ in range(n)]
    try:
        yield queue
        await queue.join()
    finally:
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        print("pool closed")

def submit(queue: asyncio.Queue[Job], job: Job) -> None:
    job.events.put_nowait("queued")
    queue.put_nowait(job)

async def main() -> None:
    async with worker_pool(1) as queue:
        landing, signup = Job("landing", 0.02), Job("signup", 0.01)
        submit(queue, landing)
        submit(queue, signup)
        async for event in watch(signup):
            print(event)

asyncio.run(main())
```

```text
{'job': 'signup', 'status': 'queued'}
{'job': 'signup', 'status': 'running'}
{'job': 'signup', 'status': 'done'}
pool closed
```

Воркер один, тому `signup` після `queued` 20 мс чекає, поки відрендериться `landing`, і лише потім отримує `running`. Споживач цього не знає й не мусить знати: він просто стоїть на `async for`. Зупинку воркерів зроблено через `cancel()` і `gather(..., return_exceptions=True)` у `finally`, а не через `TaskGroup` навколо `yield`, і це свідомий вибір.

> **Пастка.** `TaskGroup` усередині `@asynccontextmanager` загортає виняток з тіла `async with` у `ExceptionGroup`: для групи це помилка, що сталась у її блоці. Викликач, який писав `except ValueError`, його пропустить.

```python
import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def pool():
    async with asyncio.TaskGroup() as tg:
        workers = [tg.create_task(asyncio.sleep(10)) for _ in range(2)]
        try:
            yield
        finally:
            for w in workers:
                w.cancel()

async def main() -> None:
    try:
        async with pool():
            raise ValueError("x")
    except ValueError:
        print("caught ValueError")
    except Exception as e:
        print("got", repr(e))

asyncio.run(main())
```

```text
got ExceptionGroup('unhandled errors in a TaskGroup', [ValueError('x')])
```

> **Для капстоуну.** Клієнт WebSocket може відключитись посеред потоку, і тоді ендпоінт вийде з `async for event in watch(job)` винятком, не дочитавши генератор. Якщо `watch` тримає щось у `finally` (відписку від каналу, лічильник глядачів), обгортайте споживання в `async with aclosing(watch(job)) as events:`, і анотуйте `watch` як `AsyncGenerator[StatusEvent, None]`.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Звичайний `for` або `await` по асинхронному генератору.** У JS `await gen()` повертає сам генератор, бо це не thenable. У Python обидва варіанти падають; споживають лише через `async for`, `anext` або async comprehension.

   ```python
   for p in fetch_all(): ...          # TypeError: 'async_generator' object is not iterable
   await fetch_all()                  # TypeError: object async_generator can't be used in 'await' expression
   async for p in fetch_all(): ...    # правильно
   ```

2. **`for await` по масиву промісів.** `async for` по списку корутин чи задач дає `TypeError`. Порядок списку дає `for t in tasks: await t`, порядок завершення дає `asyncio.as_completed`.

   ```python
   async for html in [render(j) for j in jobs]: ...          # TypeError
   for fut in asyncio.as_completed([render(j) for j in jobs]):
       html = await fut
   ```

3. **`[await f(x) for x in xs]` як `Promise.all`.** Comprehension чекає кожен виклик по черзі. Паралельно це `gather` або `TaskGroup`.

   ```python
   pages = [await render(c) for c in configs]                  # послідовно
   pages = await asyncio.gather(*(render(c) for c in configs))  # паралельно
   ```

4. **`with` замість `async with`.** Звичка з `threading.Lock` чи з `using` без `await`. Для `Semaphore`, `AsyncClient`, `TaskGroup`, `timeout` потрібен асинхронний протокол.

   ```python
   with sem: ...          # TypeError: 'Semaphore' object does not support the context manager protocol
   async with sem: ...
   ```

5. **Очікування, що `break` закриє асинхронний генератор.** У JS `return()` викликається одразу; у Python `finally` відпрацює колись потім або аж на виході з `asyncio.run`. Для ресурсів у генераторі це витік.

   ```python
   async with aclosing(watch(job)) as events:
       async for event in events:
           if event["status"] == "running":
               break                  # finally у watch виконається тут
   ```

6. **`yield*` і `return value` за звичкою з `async function*`.** Обидва в асинхронному генераторі заборонені на рівні синтаксису.

   ```python
   yield from sub()            # SyntaxError: 'yield from' inside async function
   async for x in sub():       # правильно
       yield x
   ```

7. **`async def __aiter__`.** За аналогією з `__anext__` роблять асинхронним і `__aiter__`, і `async for` отримує корутину замість ітератора. `__aiter__` завжди звичайний `def`.

   ```python
   def __aiter__(self) -> "Pages":
       return self
   ```

## Підсумок

- `async for` викликає `__aiter__` один раз і `await __anext__()` на кожному кроці; кінець позначає `StopAsyncIteration`. `__aiter__` звичайний `def`, `__anext__` повертає awaitable.
- Протоколи синхронної й асинхронної ітерації не перетинаються: `for` не бере асинхронний ітератор, `async for` не бере список.
- Асинхронний генератор це `async def` з `yield`, аналог `async function*`, лінивий: нічого не робить, поки не попросять. Без `yield from` і без `return value`.
- Async comprehension і `await` у comprehension дозволені лише в `async def`; генераторний вираз з `async for` дозволений будь-де. `[await f(x) for x in xs]` послідовний.
- `async with` чекає на `__aenter__` і `__aexit__`; `@asynccontextmanager` будує менеджер з генератора з одним `yield`. `Semaphore`, `TaskGroup`, `timeout`, `AsyncClient`, lifespan FastAPI працюють лише через нього.
- Перерваний `async for` генератор не закриває; закривають `aclosing` або `aclose()`. Інакше cleanup відбудеться при збиранні сміття або на виході з `asyncio.run`.
- Генератор послідовний і нічого не підвантажує наперед. Паралельність дають Task, `as_completed` або продюсери з чергою, а генератор лише роздає готове.
- `AsyncIterable` для параметрів, `AsyncIterator` для результату, `AsyncGenerator[T, None]` коли потрібен `aclose`.

## Що далі

Наступний урок m5-l07 замінює `asyncio.sleep` на справжні запити через `httpx`. `AsyncClient` відкривається через `async with`, стрімінг відповіді `response.aiter_bytes()` це асинхронний ітератор під `async for`, а пагінацію API ви напишете тим самим генератором, що й `fetch_all` тут, тільки з реальним клієнтом усередині.
