---
id: m5-l05
module: m5-iter-async
title: "asyncio: event loop, який треба запустити самому"
summary: "Учень передбачає порядок виконання корутин і Task, обирає між gather і TaskGroup, не блокує цикл, ставить таймаути й коректно скасовує задачі."
duration_min: 90
prerequisites: [m5-l02, m5-l04]
---

## Корутина і event loop: нічого не стартує саме

У Node виклик `async function` одразу виконує тіло до першого `await` і повертає Promise, який уже "в польоті": цикл подій і черга мікрозадач вбудовані в рантайм, ви їх не запускали й не зупиняли. У Python `async def` при виклику створює об'єкт корутини, і це заморожений фрейм, той самий механізм, що й генератор з m5-l02. Жоден рядок тіла не виконався.

```ts
async function fetchItem(id: number) {
  console.log(`fetch(${id}) started`);   // друкується одразу при виклику
  await new Promise((r) => setTimeout(r, 10));
  return `item-${id}`;
}
const p = fetchItem(1);                  // тіло вже побігло
console.log("after call");
```

```python
import asyncio

async def fetch(id: int) -> str:
    print(f"fetch({id}) started")        # не друкується при виклику
    await asyncio.sleep(0.01)
    return f"item-{id}"

coro = fetch(1)                          # лише створили об'єкт
print("after call")
```

Розходження принципове: у TS після `fetchItem(1)` лог уже містить `fetch(1) started`, у Python після `fetch(1)` не сталося нічого, і не станеться, поки корутину хтось не виконає.

```python live
import asyncio

async def fetch(id: int) -> str:
    print(f"fetch({id}) started")
    await asyncio.sleep(0.01)
    return f"item-{id}"

coro = fetch(1)
print(type(coro))
print("nothing has run yet")
print(asyncio.run(coro))
```

```text
<class 'coroutine'>
nothing has run yet
fetch(1) started
item-1
```

Звідси перша пастка. Забутий `await` у JS дає "floating promise": тіло все одно виконалось, ви лише не дочекались результату. У Python забутий `await` означає, що код не виконався взагалі. Інтерпретатор це помічає лише коли об'єкт корутини збирає garbage collector, і повідомляє не винятком, а `RuntimeWarning` у stderr.

```python
import asyncio

async def save() -> None:
    print("saved")

async def main() -> None:
    save()            # забули await
    print("main done")

asyncio.run(main())
```

```text
ex02.py:7: RuntimeWarning: coroutine 'save' was never awaited
  save()            # забули await
RuntimeWarning: Enable tracemalloc to get the object allocation traceback
main done
```

> **Пастка.** `saved` не надруковано. Жодного винятку, програма "успішно" завершилась. У проді warning легко загубити в логах, тож шукайте `never awaited` у виводі тестів і вмикайте `-W error::RuntimeWarning` у pytest, щоб це падало.

Хто ж виконує корутини? Event loop, і в Python його треба створити й запустити самому. Інтерпретатор синхронний, а цикл це звичайний об'єкт з модуля `asyncio`. `asyncio.run(coro)` робить усе за раз: створює новий цикл у поточному потоці, загортає корутину в Task, крутить цикл до її завершення, скасовує задачі, що лишились, закриває асинхронні генератори й default executor, закриває цикл. Це точка входу, її викликають один раз на програму.

```python
import asyncio

async def inner() -> int:
    return 42

async def main() -> None:
    try:
        asyncio.run(inner())          # ми вже всередині циклу
    except RuntimeError as e:
        print("RuntimeError:", e)
    print(await inner())              # правильно: просто await

try:
    asyncio.get_running_loop()        # а тут циклу ще немає
except RuntimeError as e:
    print("RuntimeError:", e)

asyncio.run(main())
```

```text
RuntimeError: no running event loop
RuntimeError: asyncio.run() cannot be called from a running event loop
42
```

У stderr до цього додається `RuntimeWarning: coroutine 'inner' was never awaited`: `asyncio.run` відмовився від корутини, а ми її вже створили. Один цикл на потік, `asyncio.run` не реентерабельний, і з коду, що вже виконується в циклі, потрібен лише `await`. Якщо вам потрібен сам об'єкт циклу (для `run_in_executor`, `loop.time()`), беріть `asyncio.get_running_loop()` зсередини корутини, а не застаріле `get_event_loop()`.

> **JS-аналог.** У Node немає аналога `asyncio.run`, бо весь скрипт і так виконується всередині циклу: top-level `await` в ESM просто працює. У Python top-level `await` поза циклом це `SyntaxError`, а `asyncio.run(main())` під `if __name__ == "__main__":` це стандартний каркас будь-якого асинхронного скрипта. Виняток: середовища, що вже тримають цикл, наприклад Jupyter, де `asyncio.run` впаде саме з цією помилкою.

<!-- task: q1 -->

## await, Task і порядок виконання

`await coro` виконує корутину тут і зараз, у поточній задачі, до її завершення. Два `await` поспіль це строго послідовне виконання, як і в JS. Але в JS є звичний трюк "спершу викликати обидві функції, потім чекати", і він у Python не працює, бо виклик нічого не стартує.

```ts
const pa = fetchA();          // уже виконується
const pb = fetchB();          // уже виконується
const a = await pa;           // разом ~ max(ta, tb)
const b = await pb;
```

```python
ca = fetch_a()                # лише об'єкт корутини
cb = fetch_b()                # лише об'єкт корутини
a = await ca                  # тут fetch_a виконується повністю
b = await cb                  # і лише тепер стартує fetch_b: ta + tb
```

У TS обидва запити в польоті з моменту виклику, і порядок `await` лише визначає, коли ви прочитаєте результат. У Python `await ca` запускає `fetch_a` з нуля і не повертає керування, поки вона не закінчиться; `fetch_b` стартує після. Для паралельного запуску потрібен або `asyncio.gather`, або Task.

```python
import asyncio

async def fetch(name: str, delay: float) -> str:
    print(f"{name} start")
    await asyncio.sleep(delay)
    print(f"{name} end")
    return name

async def sequential() -> None:
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    a = await fetch("a", 0.1)
    b = await fetch("b", 0.2)
    print(a, b, f"{loop.time() - t0:.1f}s")

async def concurrent() -> None:
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    a, b = await asyncio.gather(fetch("a", 0.1), fetch("b", 0.2))
    print(a, b, f"{loop.time() - t0:.1f}s")

print("-- sequential")
asyncio.run(sequential())
print("-- gather")
asyncio.run(concurrent())
```

```text
-- sequential
a start
a end
b start
b end
a b 0.3s
-- gather
a start
b start
a end
b end
a b 0.2s
```

Одиниця конкурентності в asyncio це `Task`. `asyncio.create_task(coro)` загортає корутину в Task і ставить її перший крок у чергу циклу; сам `create_task` повертається негайно. Task це найближчий родич Promise "в польоті": має `done()`, `result()`, `exception()`, `add_done_callback()`, `cancel()`, і на нього можна зробити `await` будь-коли пізніше. Різниця з `await coro` саме в тому, що Task живе незалежно від того, хто й коли його чекає.

```ts
const t = fetchA();             // Promise у польоті
doOtherWork();
const a = await t;
```

```python
t = asyncio.create_task(fetch_a())   # Task у черзі циклу
do_other_work()
a = await t
```

Відмінність у моменті старту: Promise у TS уже виконав синхронну частину тіла до повернення з виклику, а Task у Python зробить перший крок лише коли поточна корутина віддасть керування циклу через `await`. `do_other_work()` у Python виконується до першого рядка `fetch_a`.

Тепер головна вправа уроку: передбачити вивід до запуску. Прочитайте код і запишіть порядок рядків, а потім запустіть.

```python live
import asyncio

async def child(name: str, delay: float) -> None:
    print(f"{name} start")
    await asyncio.sleep(delay)
    print(f"{name} end")

async def main() -> None:
    print("main 1")
    a = asyncio.create_task(child("A", 0.02))
    b = asyncio.create_task(child("B", 0.01))
    print("main 2")
    await asyncio.sleep(0)
    print("main 3")
    await a
    await b
    print("main 4")

asyncio.run(main())
```

```text
main 1
main 2
A start
B start
main 3
B end
A end
main 4
```

Крок за кроком. `main 1`, потім два `create_task` лише ставлять кроки A і B у чергу готових callback-ів, тому `main 2` друкується раніше за будь-який рядок із `child`. `await asyncio.sleep(0)` віддає керування циклу й ставить продовження `main` у ту ж чергу, після A і B. Цикл виконує чергу по порядку: A доходить до `sleep(0.02)` і зависає на таймері, B до `sleep(0.01)`, потім `main` продовжує і друкує `main 3`. Далі `await a` блокує `main` до завершення A. Таймери спрацьовують за часом: B через 10 мс, A через 20 мс, і саме різні тривалості гарантують цей порядок. Після `A end` задача A завершена, `main` прокидається, `await b` повертається одразу, бо B уже готовий, і друкується `main 4`.

> **Під капотом.** Одна ітерація циклу: порахувати, скільки можна спати до найближчого таймера; опитати селектор (epoll/kqueue) на готові сокети; перенести таймери, чий час настав, у чергу готових; виконати кожен готовий callback рівно один раз. Callback-и, додані під час ітерації, підуть у наступну. Крок Task це теж callback: він ганяє корутину до наступного `await`, який справді призупиняється, і ставить продовження через `add_done_callback` на тому, чого чекає.

З цього випливає відмінність, яка ламає інтуїцію з JS: `await` у Python віддає керування циклу лише якщо щось у ланцюжку справді призупинилось. У JS `await` завжди відкладає продовження хоча б на один тік мікрозадач, навіть для вже готового значення. У Python `await noop()` для корутини без точок призупинення це звичайний синхронний виклик.

```python live
import asyncio

async def child() -> None:
    print("child start")
    await asyncio.sleep(0)
    print("child end")

async def noop() -> int:
    return 1

async def main() -> None:
    task = asyncio.create_task(child())
    await noop()
    print("after await noop()")
    await asyncio.sleep(0)
    print("after sleep(0)")
    await task
    print("after await task")

asyncio.run(main())
```

```text
after await noop()
child start
after sleep(0)
child end
after await task
```

Аналога мікрозадач і `process.nextTick` в asyncio немає. Є одна FIFO-черга готових callback-ів, куди однаково потрапляють `loop.call_soon`, кроки Task і пробудження після `sleep(0)`, і є купа таймерів, яку цикл перевіряє на кожній ітерації. `await asyncio.sleep(0)` означає "пропусти інших на одну ітерацію" і за поведінкою ближчий до `setImmediate`, ніж до `queueMicrotask`.

```python
import asyncio

async def child() -> None:
    print("task step 1")

async def main() -> None:
    loop = asyncio.get_running_loop()
    loop.call_soon(print, "call_soon callback")
    task = asyncio.create_task(child())
    print("sync 1")
    await asyncio.sleep(0)
    print("sync 2")
    await task

asyncio.run(main())
```

```text
sync 1
call_soon callback
task step 1
sync 2
```

`call_soon` потрапив у чергу першим, перший крок Task другим, продовження `main` після `sleep(0)` третім. Жодних пріоритетів: порядок додавання і є порядком виконання.

<!-- task: q2 -->

Task, на який ніхто не тримає посилання, може зникнути посеред роботи. Цикл тримає лише слабкі посилання на задачі (саме так працює `asyncio.all_tasks()`), а сильне посилання на Task існує, поки хтось чекає його результату або поки він стоїть у черзі готових чи таймерів. Якщо задача чекає на Future, який не тримає ніхто, крім неї самої, це цикл посилань без зовнішнього входу, і garbage collector його прибере.

```python
import asyncio
import gc

async def wait_forever() -> None:
    print("worker start")
    await asyncio.Event().wait()   # ніхто ззовні не тримає цей Event
    print("worker end")            # ніколи

async def main() -> None:
    asyncio.create_task(wait_forever())   # посилання не збережено
    await asyncio.sleep(0)
    print("tasks before gc:", len(asyncio.all_tasks()))
    gc.collect()
    print("tasks after gc: ", len(asyncio.all_tasks()))

asyncio.run(main())
```

```text
worker start
tasks before gc: 2
tasks after gc:  1
```

І в stderr: `Task was destroyed but it is pending!`. Документація asyncio прямо вимагає тримати посилання: `tasks.add(t); t.add_done_callback(tasks.discard)`. Практичніша відповідь це `TaskGroup` із наступного розділу, який тримає посилання сам. З тієї ж серії: виняток у fire-and-forget задачі ніхто не підніме, і ви побачите лише `Task exception was never retrieved` у логах, коли задачу приберуть. Це слабший аналог `unhandledRejection`: не подія і не падіння процесу, а рядок у stderr із затримкою.

```python
import asyncio

async def boom() -> None:
    await asyncio.sleep(0.01)
    raise ValueError("render failed")

async def main() -> None:
    asyncio.create_task(boom())     # fire-and-forget
    await asyncio.sleep(0.05)
    print("main done, nobody looked at the task")

asyncio.run(main())
```

```text
Task exception was never retrieved
future: <Task finished name='Task-2' coro=<boom() done, defined at ex08.py:3> exception=ValueError('render failed')>
Traceback (most recent call last):
  File "ex08.py", line 5, in boom
    raise ValueError("render failed")
ValueError: render failed
main done, nobody looked at the task
```

> **Пастка.** Коли `main()` повертається, `asyncio.run` скасовує всі задачі, що лишились, і закриває цикл. Node чекає, поки живі таймери й хендли не закінчаться; Python не чекає нікого. Фонова задача, яку ви запустили через `create_task` і не дочекались, отримає `CancelledError` і зникне.

```python
import asyncio

async def background() -> None:
    try:
        await asyncio.sleep(10)
    except asyncio.CancelledError:
        print("background cancelled by asyncio.run")
        raise

async def main() -> None:
    asyncio.create_task(background())
    await asyncio.sleep(0.01)
    print("main returns")

asyncio.run(main())
print("process exits")
```

```text
main returns
background cancelled by asyncio.run
process exits
```

<!-- task: t1 -->

## gather проти TaskGroup

`asyncio.gather(*aws)` це `Promise.all`: кожну корутину загортає в Task, чекає всіх, повертає список результатів у порядку аргументів. Перший виняток летить у того, хто чекає `gather`, негайно. Решта задач при цьому не скасовуються, вони продовжують у фоні, і ніхто вже не побачить ні їхніх результатів, ні їхніх винятків.

```python live
import asyncio

async def ok(name: str, delay: float) -> str:
    print(f"{name} start")
    await asyncio.sleep(delay)
    print(f"{name} end")
    return name

async def fail(delay: float) -> str:
    await asyncio.sleep(delay)
    raise ValueError("boom")

async def main() -> None:
    try:
        await asyncio.gather(ok("a", 0.03), fail(0.01), ok("b", 0.05))
    except ValueError as e:
        print("caught:", e)
    await asyncio.sleep(0.1)   # дивимось, що сталося з a і b
    print("main done")

asyncio.run(main())
```

```text
a start
b start
caught: boom
a end
b end
main done
```

`fail` падає через 10 мс, `caught: boom` друкується, а `a` і `b` доживають до своїх `end` через 30 і 50 мс, бо їх ніхто не зупиняв. Це та сама семантика, що в `Promise.all`, де відхилення одного промісу не скасовує інші, тільки в Python такі задачі ще й легко загубити.

`return_exceptions=True` перетворює `gather` на `Promise.allSettled`: замість першого винятку ви отримуєте список, де на місці впалих задач лежать об'єкти винятків. Перевіряти треба через `isinstance(r, BaseException)`, бо `CancelledError` теж може опинитись у цьому списку.

```python
import asyncio

async def ok(name: str, delay: float) -> str:
    await asyncio.sleep(delay)
    return name

async def fail(delay: float) -> str:
    await asyncio.sleep(delay)
    raise ValueError("boom")

async def main() -> None:
    results = await asyncio.gather(
        ok("a", 0.03), fail(0.01), ok("b", 0.02),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, BaseException):
            print("rejected:", type(r).__name__, r)
        else:
            print("fulfilled:", r)

asyncio.run(main())
```

```text
fulfilled: a
rejected: ValueError boom
fulfilled: b
```

`asyncio.TaskGroup` (3.11+) це структурована конкурентність: задачі створюються всередині `async with`, блок не завершиться, поки всі вони не закінчаться, посилання на задачі група тримає сама. Якщо одна задача падає, група скасовує решту, чекає, поки вони справді зупиняться, і піднімає `ExceptionGroup` з усіма винятками, що встигли статися. Ловлять його через `except*`.

```python live
import asyncio

async def ok(name: str, delay: float) -> str:
    print(f"{name} start")
    await asyncio.sleep(delay)
    print(f"{name} end")
    return name

async def fail(msg: str) -> str:
    await asyncio.sleep(0)
    raise ValueError(msg)

async def main() -> None:
    try:
        async with asyncio.TaskGroup() as tg:
            a = tg.create_task(ok("a", 0.03))
            tg.create_task(fail("boom-1"))
            tg.create_task(fail("boom-2"))
            b = tg.create_task(ok("b", 0.05))
    except* ValueError as eg:
        print("caught group:", [str(e) for e in eg.exceptions])
    print("a cancelled:", a.cancelled(), "b cancelled:", b.cancelled())
    await asyncio.sleep(0.1)
    print("main done")

asyncio.run(main())
```

```text
a start
b start
caught group: ['boom-1', 'boom-2']
a cancelled: True b cancelled: True
main done
```

Обидва `fail` падають на одній ітерації циклу (у них `sleep(0)`, а не таймер), тому в групі два винятки; `a` і `b` скасовані, їхніх `end` немає. `except* ValueError` вибирає з групи підходящі винятки; звичайний `except ValueError` `ExceptionGroup` не зловить. У JS прямого аналога немає: це `Promise.all` плюс автоматичний `AbortController` на всіх сусідів плюс `AggregateError`.

Результати з `TaskGroup` читають через `task.result()` після виходу з блоку, бо до цього моменту всі задачі гарантовано завершені.

```python
import asyncio

async def ok(name: str, delay: float) -> str:
    print(f"{name} start")
    await asyncio.sleep(delay)
    print(f"{name} end")
    return name

async def main() -> None:
    async with asyncio.TaskGroup() as tg:
        a = tg.create_task(ok("a", 0.02))
        b = tg.create_task(ok("b", 0.01))
    print("results:", a.result(), b.result())

asyncio.run(main())
```

```text
a start
b start
b end
a end
results: a b
```

Правило вибору: `TaskGroup` за замовчуванням, бо він не губить задачі й не лишає сиріт після помилки. `gather` там, де потрібен список результатів у порядку аргументів одним виразом або семантика `allSettled` через `return_exceptions=True`.

<!-- task: q3 -->

<!-- task: t2 -->

## Блокуючий виклик зупиняє все

Цикл крутиться в одному потоці. Корутина віддає керування лише на `await`, який справді призупиняється; між двома такими точками вона володіє потоком одноосібно. `time.sleep`, `requests.get`, запит через `sqlite3`, `json.loads` на сотні мегабайт, важкий цикл: усе це тримає потік, і поки воно триває, жодна інша задача не зрушить, жоден сокет не буде прочитаний. У Node те саме робить `fs.readFileSync` або гарячий цикл, але там синхронне I/O помітне в назві. У Python екосистема сповнена синхронних бібліотек, які всередині `async def` виглядають цілком невинно.

```python
import asyncio
import time

def sync_fetch(name: str) -> str:      # уявіть requests.get або sqlite3
    time.sleep(0.1)
    return name

async def fetch(name: str) -> str:
    print(f"{name} start")
    result = sync_fetch(name)           # блокує цикл
    print(f"{name} end")
    return result

async def main() -> None:
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    await asyncio.gather(fetch("a"), fetch("b"), fetch("c"))
    print(f"{loop.time() - t0:.1f}s")

asyncio.run(main())
```

```text
a start
a end
b start
b end
c start
c end
0.3s
```

Три "асинхронні" функції виконались строго послідовно за 0.3 с. Функція оголошена через `async def`, але всередині жодного `await`, який би призупинився, тож `gather` не мав де їх перемежувати. Саме так виглядає "асинхронний" сервіс, який викликає синхронний драйвер БД: він коректний, але паралелізму в ньому нуль, і один повільний запит зупиняє всі інші з'єднання.

Як це виявити. Перше: порядок рядків у логах, як вище, де `a end` іде раніше за `b start`. Друге: `asyncio.run(main(), debug=True)` або змінна `PYTHONASYNCIODEBUG=1`. У debug-режимі цикл міряє тривалість кожного callback-а й пише в логер `asyncio` попередження про все, що виконувалось довше за `loop.slow_callback_duration` (за замовчуванням 100 мс).

```python
import asyncio
import time

async def fetch(name: str) -> str:
    time.sleep(0.15)
    return name

async def main() -> None:
    await asyncio.gather(fetch("a"), fetch("b"))

asyncio.run(main(), debug=True)
```

```text
Executing <Task finished name='Task-2' coro=<fetch() done, defined at ex14.py:4> result='a' created at .../asyncio/tasks.py:695> took 0.155 seconds
Executing <Task finished name='Task-3' coro=<fetch() done, defined at ex14.py:4> result='b' created at .../asyncio/tasks.py:695> took 0.160 seconds
```

Три способи не блокувати цикл, за зростанням ціни. Перший: взяти асинхронну бібліотеку, яка чекає на сокеті через `await`: `httpx` замість `requests` (m5-l07), `aiosqlite` замість `sqlite3`. Другий: винести блокуючий виклик у потік через `asyncio.to_thread(fn, *args)`. Цикл продовжує крутитись, а результат приходить як Future, на який ви чекаєте через `await`.

```python
import asyncio
import time

def sync_fetch(name: str) -> str:
    time.sleep(0.1)
    return name

async def fetch(name: str) -> str:
    print(f"{name} start")
    result = await asyncio.to_thread(sync_fetch, name)
    print(f"{name} end")
    return result

async def main() -> None:
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    print(await asyncio.gather(fetch("a"), fetch("b"), fetch("c")))
    print(f"{loop.time() - t0:.1f}s")

asyncio.run(main())
```

```text
a start
b start
c start
a end
b end
c end
['a', 'b', 'c']
0.1s
```

> **Під капотом.** `to_thread` це обгортка над `loop.run_in_executor(None, fn)`, де `None` означає default `ThreadPoolExecutor` циклу. Потоки в Python ділять один GIL, але синхронне I/O (сокети, файли, `time.sleep`, драйвери на C) його відпускає, тому для I/O потоки дають справжню конкурентність. Для CPU-важкого коду вони не допоможуть: GIL пустить у роботу лише один потік за раз. Чому так і де межі, детально в m5-l08.

Третій спосіб, для CPU-bound: `loop.run_in_executor` з `ProcessPoolExecutor`. Окремі процеси, окремі GIL, аргументи й результат серіалізуються через pickle. Приклад не для браузера: процеси там недоступні, а на macOS і Windows код обов'язково під `if __name__ == "__main__":`, бо дочірній процес імпортує модуль заново.

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

def count_primes(limit: int) -> int:           # CPU-bound
    return sum(
        all(n % d for d in range(2, int(n ** 0.5) + 1))
        for n in range(2, limit)
    )

async def main() -> None:
    loop = asyncio.get_running_loop()
    with ProcessPoolExecutor() as pool:
        results = await asyncio.gather(
            loop.run_in_executor(pool, count_primes, 50_000),
            loop.run_in_executor(pool, count_primes, 60_000),
        )
    print(results)

if __name__ == "__main__":
    asyncio.run(main())
```

```text
[5133, 6057]
```

Коротка таблиця вибору: чекаємо на мережу чи диск і є async-бібліотека, беремо її; чекаємо на мережу чи диск через синхронну бібліотеку, `to_thread`; рахуємо щось важке на CPU, `ProcessPoolExecutor`; викликаємо зовнішній процес, наприклад Node-рендерер, `asyncio.create_subprocess_exec` (m6-l05). Що куди і чому саме так, у m5-l08 про GIL.

## Таймаути й скасування

У JS скасування зовнішнє: ви передаєте `AbortSignal`, а функція сама вирішує, чи перевіряти його. В asyncio скасування вбудоване в Task. `task.cancel()` просить цикл кинути `CancelledError` у корутину в тій точці, де вона зараз стоїть на `await`. Корутина бачить його як звичайний виняток: може прибрати за собою у `finally` або `except`, і має кинути його далі. Той, хто робить `await task`, отримає той самий `CancelledError`.

```python live
import asyncio

async def worker() -> None:
    try:
        while True:
            print("tick")
            await asyncio.sleep(0.03)
    except asyncio.CancelledError:
        print("worker: cleanup, then re-raise")
        raise

async def main() -> None:
    task = asyncio.create_task(worker())
    await asyncio.sleep(0.05)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print("main: task cancelled =", task.cancelled())

asyncio.run(main())
```

```text
tick
tick
worker: cleanup, then re-raise
main: task cancelled = True
```

`cancel()` лише ставить запит, задача зупиниться на наступній ітерації циклу, тому після `cancel()` треба зробити `await task`, якщо вам важливо дочекатись cleanup. Таймаути побудовані на тому ж механізмі: `asyncio.timeout(seconds)` (3.11+) це асинхронний контекстний менеджер, який по закінченню часу скасовує поточну задачу, а на виході з блоку перетворює `CancelledError` на вбудований `TimeoutError`. Старіша форма `asyncio.wait_for(aw, timeout)` робить те саме для одного awaitable.

```ts
const res = await fetch(url, { signal: AbortSignal.timeout(50) });
// кидає DOMException "TimeoutError"
```

```python
async with asyncio.timeout(0.05):
    res = await fetch(url)
# кидає TimeoutError, внутрішній await отримав CancelledError
```

У TS fetch перевіряє сигнал сам, і бібліотека без підтримки `signal` таймаут проігнорує. У Python скасування працює для будь-якої корутини, що стоїть на `await`, без домовленостей з її боку: цикл кине виняток у її фрейм. Не працює воно лише там, де корутина не на `await`, тобто в блокуючому виклику з попереднього розділу.

```python live
import asyncio

async def render(delay: float) -> str:
    try:
        await asyncio.sleep(delay)
        return "html"
    finally:
        print(f"render({delay}) cleanup")

async def main() -> None:
    async with asyncio.timeout(0.05):
        print(await render(0.01))

    try:
        async with asyncio.timeout(0.05):
            print(await render(0.2))
    except TimeoutError:
        print("timed out")

    try:
        print(await asyncio.wait_for(render(0.2), timeout=0.05))
    except TimeoutError:
        print("wait_for timed out")

asyncio.run(main())
```

```text
render(0.01) cleanup
html
render(0.2) cleanup
timed out
render(0.2) cleanup
wait_for timed out
```

`finally` у `render(0.2)` виконався до того, як `TimeoutError` дійшов до `main`: скасування пройшло через фрейм корутини як виняток, і cleanup відбувся природно. Це головна причина, чому в asyncio ресурси закривають через `with`, `async with` і `finally`, а не через done-callback.

`CancelledError` успадковується від `BaseException`, а не від `Exception`, і це зроблено навмисно: звичний `except Exception` його не ловить, тож ваша обробка помилок не ламає скасування ненавмисно. Зламати його можна лише свідомо: `except BaseException`, голим `except:`, або зловивши `CancelledError` і не кинувши далі.

```python live
import asyncio

async def stubborn() -> None:
    for _ in range(6):
        try:
            await asyncio.sleep(0.01)
        except BaseException as e:          # ковтає і CancelledError
            print("swallowed:", type(e).__name__)

async def polite() -> None:
    while True:
        try:
            await asyncio.sleep(0.01)
        except Exception as e:              # CancelledError сюди не потрапляє
            print("never printed:", e)

async def main() -> None:
    s = asyncio.create_task(stubborn())
    p = asyncio.create_task(polite())
    await asyncio.sleep(0.02)
    s.cancel()
    p.cancel()
    await asyncio.sleep(0.02)
    print("stubborn done:", s.done())
    print("polite done:  ", p.done(), "cancelled:", p.cancelled())
    await s
    print("stubborn finished on its own")

asyncio.run(main())
```

```text
swallowed: CancelledError
stubborn done: False
polite done:   True cancelled: True
stubborn finished on its own
```

> **Пастка.** `stubborn` з `while True` замість `for _ in range(6)` ніколи б не зупинився: ні від `cancel()`, ні від `asyncio.timeout`, ні від `TaskGroup` при помилці сусіда. Гірше, `asyncio.run` при завершенні скасовує всі задачі й чекає їх, тому процес завис би назавжди. Під час перевірки цього уроку саме так і сталося з першою версією прикладу. Правило: `CancelledError` ловлять лише щоб прибрати за собою, і завжди роблять `raise`.

> **JS-аналог.** `AbortController` потрібен лише там, де ви хочете скасувати щось зовнішнє і мати один сигнал на кілька операцій; в asyncio таку роль грає сам Task плюс `asyncio.timeout`, а щоб захистити фрагмент від скасування ззовні (наприклад, запис, який мусить дійти до кінця), є `asyncio.shield(aw)`.

<!-- task: q4 -->

<!-- task: t3 -->

## Для капстоуну

Пайплайн генерації FormBuilder: воркер бере конфіги, рендерить кожен у статичну сторінку й публікує. Рендер важкий, тож запускати сто конфігів одночасно не можна, але й по одному занадто повільно. Обмеження паралелізму на відомому списку задач це `asyncio.Semaphore(n)`, аналог `p-limit`: корутина входить у `async with sem`, і якщо `n` місць зайнято, чекає на `await` всередині `__aenter__`, поки хтось вийде.

```python live
import asyncio

async def render(name: str, delay: float, sem: asyncio.Semaphore) -> str:
    async with sem:
        print(f"{name} start")
        await asyncio.sleep(delay)
        print(f"{name} end")
        return name

async def main() -> None:
    sem = asyncio.Semaphore(2)
    jobs = [("a", 0.05), ("b", 0.01), ("c", 0.02), ("d", 0.01), ("e", 0.03)]
    results = await asyncio.gather(*(render(n, d, sem) for n, d in jobs))
    print(results)

asyncio.run(main())
```

```text
a start
b start
b end
c start
c end
d start
d end
e start
a end
e end
['a', 'b', 'c', 'd', 'e']
```

Одночасно в роботі не більше двох. Тривалості підібрані так, що всі моменти завершення різні (10, 30, 40, 50, 70 мс), тому порядок рядків однозначний. `async with` тут не декорація: `Semaphore.__aenter__` сам робить `await`, чекаючи вільного місця, і звичайний `with` із ним не працює. `async with` і `async for` це ті самі протоколи контекстного менеджера й ітерації з m4-l07 і m5-l01, у яких вхід, вихід і наступний крок можуть призупинятись; детально, з власними `__aenter__` і `__anext__`, у m5-l06.

<!-- task: t4 -->

Для потоку задач, які надходять з часом (ендпоінт FastAPI кладе конфіг у чергу, воркер у тому ж процесі забирає, m7-l03), Semaphore навколо `gather` не підходить: списку задач ще немає. Тут патерн "N воркерів читають з `asyncio.Queue`": кожен воркер це довгоживучий Task із `while True`, який чекає `queue.get()`, обробляє, звітує `queue.task_done()`. `queue.join()` дочекається, поки кількість `task_done` зрівняється з кількістю покладених задач. Зупинка воркерів це скасування: вони стоять на `await queue.get()`, і `cancel()` виводить їх звідти через `CancelledError`.

```python live
import asyncio

async def worker(name: str, queue: asyncio.Queue[tuple[str, float]], done: list[str]) -> None:
    try:
        while True:
            job, delay = await queue.get()
            print(f"{name} <- {job}")
            try:
                await asyncio.sleep(delay)          # тут буде рендер
                done.append(job)
            finally:
                queue.task_done()
    except asyncio.CancelledError:
        print(f"{name} stopped")
        raise

async def main() -> None:
    queue: asyncio.Queue[tuple[str, float]] = asyncio.Queue()
    done: list[str] = []
    for job in [("j1", 0.05), ("j2", 0.01), ("j3", 0.02), ("j4", 0.01)]:
        queue.put_nowait(job)

    async with asyncio.TaskGroup() as tg:
        workers = [tg.create_task(worker(f"w{i}", queue, done)) for i in range(2)]
        await queue.join()              # усі задачі оброблено
        for w in workers:
            w.cancel()                  # graceful shutdown
    print("done:", done)

asyncio.run(main())
```

```text
w0 <- j1
w1 <- j2
w1 <- j3
w1 <- j4
w0 stopped
w1 stopped
done: ['j2', 'j3', 'j4', 'j1']
```

`w0` узяв довгий `j1` (50 мс) і до кінця був ним зайнятий, `w1` обробив решту; `join` повернувся після четвертого `task_done`, група скасувала воркерів, дочекалась їхнього `stopped` і вийшла без винятку, бо скасовані задачі `TaskGroup` помилкою не вважає. У реальному воркері замість `sleep` буде рендер через Jinja2 або `asyncio.create_subprocess_exec` до Node-рендерера, а сигналом до зупинки стане SIGTERM з m6-l07: обробник сигналу викликає `cancel()` на воркерах, поточна задача доробляється або позначається як failed у `finally`, і процес виходить чисто.

> **Пастка.** `queue.task_done()` має стояти у `finally`. Якщо рендер кине виняток і `task_done` не викличеться, `queue.join()` чекатиме вічно, а зовні це виглядатиме як "воркер завис". Друга пастка того ж роду: `except Exception` навколо рендера всередині воркера це правильно (одна зламана форма не має класти воркер), але він не повинен перетворюватись на `except BaseException`.

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. Забутий `await` сприймається як fire-and-forget. У JS тіло виконалось би; у Python не виконалось нічого, лише `RuntimeWarning: coroutine ... was never awaited` у stderr. Якщо справді потрібен фон, це `create_task` із збереженим посиланням або `TaskGroup`.

```python
async def handler() -> None:
    save_config(cfg)                          # нічого не зберегло
    task = asyncio.create_task(save_config(cfg))   # так, і тримайте task
```

2. Спроба запустити паралельно через "спершу викликати, потім чекати". Обидва виклики лише створили корутини; `await` виконає їх по черзі.

```python
ca, cb = fetch_a(), fetch_b()
a, b = await ca, await cb                 # послідовно: ta + tb

async with asyncio.TaskGroup() as tg:     # паралельно: max(ta, tb)
    ta, tb = tg.create_task(fetch_a()), tg.create_task(fetch_b())
a, b = ta.result(), tb.result()
```

3. Синхронний виклик усередині `async def`: `time.sleep`, `requests.get`, `sqlite3`. Функція виглядає асинхронною, але тримає весь цикл; `gather` із таких функцій виконується послідовно. Перевіряється через `debug=True`; лікується async-бібліотекою або `to_thread`.

```python
async def fetch(url: str) -> bytes:
    return requests.get(url).content                        # блокує цикл
    return await asyncio.to_thread(lambda: requests.get(url).content)
```

4. `create_task` без посилання як "запустив і забув". Задача може зникнути посеред роботи через GC, а її виняток побачите лише як `Task exception was never retrieved`. Тримайте посилання або використовуйте `TaskGroup`.

```python
asyncio.create_task(publish(page))        # може зникнути
self._tasks.add(t := asyncio.create_task(publish(page)))
t.add_done_callback(self._tasks.discard)
```

5. Виклик `asyncio.run` зсередини вже запущеного циклу, зазвичай через "синхронну" обгортку `def get_data(): return asyncio.run(fetch())`, яку потім викликають з ендпоінта. `RuntimeError: asyncio.run() cannot be called from a running event loop`. Усередині циклу лише `await`.

```python
def get_data() -> dict:
    return asyncio.run(fetch())           # RuntimeError з ендпоінта

async def get_data() -> dict:
    return await fetch()
```

6. Ковтання `CancelledError` через `except BaseException` або `except asyncio.CancelledError: pass`. Задача стає нескасовуваною: не спрацюють ні таймаут, ні `TaskGroup`, ні зупинка процесу, а `asyncio.run` зависне на виході.

```python
except asyncio.CancelledError:
    log.info("cancelled")
    raise                                 # без raise задача безсмертна
```

7. `except ValueError` після `TaskGroup`. Група піднімає `ExceptionGroup`, і звичайний `except` його пропускає повз. Потрібен `except* ValueError`.

```python
try:
    async with asyncio.TaskGroup() as tg: ...
except ValueError: ...                    # не спрацює
except* ValueError as eg: ...             # eg.exceptions: список
```

8. Очікування, що `await` віддасть керування, як у JS. `await` готової корутини не віддає нічого; цикл `while not ready: await check()` без справжнього призупинення зупинить усіх. Щоб пропустити інших, потрібен `await asyncio.sleep(0)`.

```python
while not store.ready():
    await store.refresh()                 # якщо refresh синхронний усередині, це busy loop
    await asyncio.sleep(0)                # віддати ітерацію
```

## Підсумок

- Виклик `async def` створює об'єкт корутини і не виконує жодного рядка; виконує його `await` або Task, а крутить усе event loop, який запускає `asyncio.run(main())` рівно один раз.
- `await coro` послідовний; паралельність дають Task через `create_task`, `gather` або `TaskGroup`. "Викликати обидві, потім чекати" у Python не працює.
- Черга готових callback-ів одна й FIFO; мікрозадач і `nextTick` немає. `await` віддає керування лише коли щось справді призупинилось; `await asyncio.sleep(0)` віддає одну ітерацію.
- Task без посилання може зникнути через GC, а його виняток побачите лише в логах. `TaskGroup` тримає посилання сам.
- `gather` це `Promise.all`: перший виняток летить одразу, решта задач живе далі. `return_exceptions=True` це `allSettled`. `TaskGroup` при помилці скасовує сусідів і піднімає `ExceptionGroup` для `except*`.
- Будь-який синхронний виклик усередині корутини зупиняє весь цикл. Виявляти через `debug=True`, лікувати async-бібліотекою, `to_thread` для I/O, `ProcessPoolExecutor` для CPU.
- Скасування це `CancelledError`, кинутий у поточний `await`; `asyncio.timeout` і `wait_for` побудовані на ньому. Ловити лише для cleanup і завжди `raise`; `except Exception` його не ловить, і це правильно.
- `Semaphore` обмежує паралелізм на списку задач, `Queue` з N воркерами обслуговує потік задач; зупинка воркерів це `cancel()` після `queue.join()`.
- Коли `main()` повертається, `asyncio.run` скасовує все, що лишилось, і закриває цикл.

## Що далі

Наступний урок m5-l06 розбирає `async for`, `async with` і асинхронні генератори зсередини: як `__aenter__` і `__anext__` роблять `await` і чому `Semaphore` із цього уроку працює лише через `async with`. Далі m5-l07 замінює `asyncio.sleep` на справжні запити через `httpx`, і там знадобляться `TaskGroup`, `asyncio.timeout` і `Semaphore` саме в тому вигляді, в якому ви їх щойно написали. m5-l08 відповідає на відкладене тут питання, чому `to_thread` допомагає для I/O, а для CPU потрібні процеси.
