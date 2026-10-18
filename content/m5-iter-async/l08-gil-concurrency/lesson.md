---
id: m5-l08
module: m5-iter-async
title: "GIL, threading, multiprocessing, concurrent.futures: що куди"
summary: "Учень пояснює, що робить GIL і чому потоки прискорюють I/O, але не CPU, обирає між asyncio, потоками й процесами за характером навантаження, захищає спільний стан через Lock або обходиться без нього, і запускає роботу через пули concurrent.futures, зокрема з asyncio."
duration_min: 90
prerequisites: [m5-l07]
---

## GIL: потоки справжні, байткод виконується по одному

Потоків і процесів у браузерному Python платформи немає. Усі приклади з ними нижче звичайні блоки з виводом, знятим один раз на Mac автора (Apple M1 Pro, 10 ядер, CPython 3.12.12). Час у виводі це "на цій машині": у вас числа будуть інші, співвідношення ті самі. Живі блоки лише там, де потоки не потрібні.

Першу звичку з Node варто відкинути одразу: Python не однопотоковий. `threading.Thread` створює справжній потік операційної системи з власним стеком, його планує ядро, і всі потоки процесу ділять одну купу об'єктів: список, створений в одному потоці, інший бачить і змінює без жодних повідомлень. У Node JS-код живе в одному потоці, а `worker_threads` це окремі ізоляти V8 з власною купою, які спілкуються через `postMessage`. Python-потоки ближчі до потоків Java чи C, ніж до будь-чого в Node.

Обмеження накладає GIL (global interpreter lock, офіційний термін документації CPython): м'ютекс усередині інтерпретатора, який потік мусить тримати, щоб виконувати байткод. Тримає його рівно один потік за раз. Причина історична й прагматична: лічильники посилань на кожному об'єкті та внутрішні структури інтерпретатора не мають власних блокувань, і один глобальний lock робить їх безпечними майже безкоштовно для однопотокового коду. Ціна в тому, що два потоки ніколи не виконують Python-байткод одночасно, навіть на десяти ядрах.

GIL переходить між потоками двома шляхами. Примусово: якщо інший потік чекає на GIL довше за switch interval (офіційна назва параметра, 5 мс за замовчуванням), поточний отримує запит віддати lock у найближчій точці перевірки. Добровільно: перед блокуючим системним викликом (читання сокета чи файлу, `time.sleep`, очікування на `Lock`) C-код інтерпретатора відпускає GIL і забирає його назад після повернення. Поки один потік чекає на мережу, інший виконує байткод.

```python live
import sys

print(sys.getswitchinterval())   # секунди
sys.setswitchinterval(0.001)
print(sys.getswitchinterval())
```

```text
0.005
0.001
```

З цього випливає правило, яке має стати рефлексом: потоки прискорюють I/O-bound роботу і не прискорюють CPU-bound. Обидва терміни це жаргон спільноти, який трапляється і в документації: I/O-bound означає, що час іде на очікування диска чи мережі, CPU-bound означає, що час іде на обчислення. Нижче чотири однакові задачі кожного типу, спершу по черзі, потім у чотирьох потоках.

```python
import threading
import time

def cpu_task() -> None:            # чистий Python: лише байткод
    total = 0
    for i in range(5_000_000):
        total += i * i

def io_task() -> None:             # блокуючий виклик, як запит до БД
    time.sleep(0.5)

def timed(label: str, fn, threads: int) -> None:
    start = time.perf_counter()
    if threads == 1:
        for _ in range(4):
            fn()
    else:
        ts = [threading.Thread(target=fn) for _ in range(threads)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
    print(f"{label:<4} 4 tasks, {threads} thread(s): {time.perf_counter() - start:.2f}s")

timed("cpu", cpu_task, 1)
timed("cpu", cpu_task, 4)
timed("io", io_task, 1)
timed("io", io_task, 4)
```

```text
cpu  4 tasks, 1 thread(s): 0.77s
cpu  4 tasks, 4 thread(s): 0.77s
io   4 tasks, 1 thread(s): 2.03s
io   4 tasks, 4 thread(s): 0.51s
```

CPU-задача в чотирьох потоках зайняла рівно стільки ж, скільки послідовно: потоки по черзі брали GIL на 5 мс, а сумарна кількість байткоду не змінилась. I/O-задача прискорилась у чотири рази, бо `time.sleep` відпускає GIL і всі чотири потоки чекали одночасно. Це той самий механізм, через який `asyncio.to_thread` з m5-l05 рятує цикл від синхронного `requests.get`.

> **Під капотом.** GIL відпускає не лише I/O, а будь-який C-код, автор якого це передбачив: `hashlib` на великих буферах, `zlib`, NumPy, драйвери БД. Для такої роботи потоки дають справжній паралелізм на CPU. Правило "CPU не паралелиться" стосується саме байткоду Python.

```python
import hashlib
import threading
import time

data = b"x" * 200_000_000            # 200 МБ

def hash_task() -> None:             # C-код, який відпускає GIL
    hashlib.sha256(data).hexdigest()

start = time.perf_counter()
for _ in range(4):
    hash_task()
print(f"sha256 4 tasks, 1 thread:  {time.perf_counter() - start:.2f}s")

start = time.perf_counter()
ts = [threading.Thread(target=hash_task) for _ in range(4)]
for t in ts:
    t.start()
for t in ts:
    t.join()
print(f"sha256 4 tasks, 4 threads: {time.perf_counter() - start:.2f}s")
```

```text
sha256 4 tasks, 1 thread:  0.35s
sha256 4 tasks, 4 threads: 0.09s
```

Якщо шукати в Node аналог для CPU-паралелізму Python, це не потоки, а саме `worker_threads`: ізольована пам'ять, копіювання даних туди й назад, окремий файл чи гілка коду для воркера. У Python цю роль грають процеси.

```ts
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: 5_000_000 });  // structured clone
  worker.on("message", (total) => console.log(total));
} else {
  let total = 0;
  for (let i = 0; i < workerData; i++) total += i * i;
  parentPort!.postMessage(total);
}
```

```python
from concurrent.futures import ProcessPoolExecutor

def cpu_task(n: int) -> int:               # виконується в іншому процесі
    total = 0
    for i in range(n):
        total += i * i
    return total

if __name__ == "__main__":                 # як isMainThread: дочірній процес сюди не зайде
    with ProcessPoolExecutor() as pool:
        future = pool.submit(cpu_task, 5_000_000)   # аргумент іде через pickle
        print(future.result())
```

```text
41666654166667500000
```

Розходження в тому, що в Python є ще й третій рівень, якого Node не має: потоки зі спільною пам'яттю. Node дає вибір між одним потоком і повною ізоляцією, Python дає один потік з event loop, потоки зі спільною купою під GIL і процеси з повною ізоляцією. Схожість `isMainThread` і `__name__ == "__main__"` не випадкова: в обох випадках воркер виконує той самий файл заново, і гілка для головного потоку має себе захистити.

## Три моделі й таблиця вибору

asyncio це один потік і один event loop; задачі перемикаються лише на явних `await`, тож між двома `await` ваш код володіє станом одноосібно. Масштабується на тисячі з'єднань, але вимагає асинхронних бібліотек. threading це потоки ОС з витісняючим перемиканням між будь-якими двома інструкціями байткоду; беруть, коли бібліотека блокуюча і переписати її не можна (синхронний драйвер БД, SDK хмари). Потоків десятки, не тисячі: кожен має власний стек і коштує пам'яті ядра. multiprocessing це окремі процеси, кожен зі своїм інтерпретатором і своїм GIL; єдиний спосіб розкласти Python-байткод на кілька ядер, ціною старту процесів і серіалізації всього, що йде між ними.

| Критерій | asyncio | threading | multiprocessing |
|---|---|---|---|
| Навантаження | багато I/O, є async-бібліотека | I/O через блокуючу бібліотеку; C-код, що відпускає GIL | CPU на чистому Python |
| Паралелізм на CPU | ні, один потік | ні для байткоду | так, процес на ядро |
| Скільки одиниць | тисячі задач | десятки потоків | кількість ядер |
| Перемикання | лише на `await` | будь-де, кожні 5 мс або на I/O | ОС, незалежно |
| Спільна пам'ять | так, без гонитви між `await` | так, потрібні `Lock` | ні, лише копії через pickle |
| Ціна старту | мікросекунди на Task | ~десятки мкс на потік | ~60 мс на процес (spawn) |
| JS-аналог | event loop Node | немає | `worker_threads`, `cluster` |

Порядок рішення короткий. Спершу питання "чекаємо чи рахуємо". Чекаємо і є async-клієнт: asyncio. Чекаємо через синхронну бібліотеку: потоки, а якщо решта коду в asyncio, то `asyncio.to_thread`. Рахуємо на чистому Python: процеси. Рахуємо в C-бібліотеці, що відпускає GIL: часто вистачить потоків. Поєднання моделей це норма, а не компроміс: сервіс на FastAPI живе в asyncio, синхронний драйвер викликає через `to_thread`, а важкий рендер відправляє в `ProcessPoolExecutor`. У 3.13 з'явилась експериментальна збірка `python3.13t` без GIL (free-threaded, PEP 703), у 3.14 її офіційно підтримують, але вона окрема, не за замовчуванням і не з усіма C-розширеннями, тож усе в цьому курсі на 3.12 розраховано на GIL.

<!-- task: q1 -->

<!-- task: t1 -->

## threading: Thread, Lock і стан гонитви

API потоку мінімальне: `Thread(target=fn, args=(...), name=..., daemon=...)`, потім `start()` і `join()`. Ніякого `postMessage`: потік просто викликає функцію, а результат кладе в об'єкт, який бачить і головний потік.

```python
import threading
import time

def download(name: str, delay: float, results: dict[str, str]) -> None:
    time.sleep(delay)                      # блокуючий I/O, GIL відпущено
    results[name] = f"{name}: {threading.current_thread().name}"

results: dict[str, str] = {}
threads = [
    threading.Thread(target=download, args=(name, delay, results), name=f"dl-{name}")
    for name, delay in [("a", 0.2), ("b", 0.1)]
]
start = time.perf_counter()
for t in threads:
    t.start()
print("started, active:", threading.active_count())
for t in threads:
    t.join()
print(results)
print(f"{time.perf_counter() - start:.1f}s")
```

```text
started, active: 3
{'b': 'b: dl-b', 'a': 'a: dl-a'}
0.2s
```

> **Пастка.** Виняток усередині потоку не доходить до `join()`. Потік завершується, `threading.excepthook` друкує traceback у stderr, а головний потік іде далі, ніби нічого не сталося. У Node необроблена помилка у воркері хоча б приходить подією `error`; тут не приходить нічого. Тому ручні `Thread` для роботи з результатом майже не пишуть: це робота `concurrent.futures`, розділ нижче.

```python
import threading

def work() -> None:
    raise ValueError("boom")

t = threading.Thread(target=work)
t.start()
t.join()
print("joined, main continues")
```

```text
Exception in thread Thread-1 (work):
Traceback (most recent call last):
  ...
ValueError: boom
joined, main continues
```

Спільна пам'ять означає стан гонитви (race condition, загальноприйнятий термін, у документації Python теж так): дві нитки читають одне значення, кожна додає одиницю і записує, і один запис затирає інший. Класичний приклад: лічильник подій у словнику, який оновлюють чотири потоки по 200 000 разів.

```python
import threading

counts: dict[str, int] = {}

def record(event: str, n: int) -> None:
    for _ in range(n):
        counts[event] = counts.get(event, 0) + 1    # прочитати, додати, записати

def run() -> int:
    counts.clear()
    threads = [threading.Thread(target=record, args=("submit", 200_000)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return counts["submit"]

print("expected", 4 * 200_000)
print([run() for _ in range(5)])
```

```text
expected 800000
[800000, 733753, 656233, 591652, 736019]
```

Це найгірший різновид бага: в одному запуску з п'яти результат правильний, і тест на CI може пройти. Щоб гонитва відтворювалась щоразу, у демонстраціях і тестах зменшують switch interval через `sys.setswitchinterval`: інтерпретатор просить потоки перемикатися якомога частіше, і вікно між читанням і записом відкривається постійно. У продакшн-коді цього не роблять, це інструмент, щоб зробити баг видимим. Нижче той самий код з одним доданим рядком.

```python
import sys
import threading

sys.setswitchinterval(1e-6)        # просити перемикання якомога частіше: лише для демо й тестів

counts: dict[str, int] = {}

def record(event: str, n: int) -> None:
    for _ in range(n):
        counts[event] = counts.get(event, 0) + 1

def run() -> int:
    counts.clear()
    threads = [threading.Thread(target=record, args=("submit", 200_000)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return counts["submit"]

print([run() for _ in range(5)])
```

```text
[345800, 328280, 329438, 332429, 321568]
```

Виправлення: `threading.Lock`. `with lock:` захоплює його на вході й гарантовано відпускає на виході, навіть при винятку, так само як `with open(...)` закриває файл (m4-l07). Поки один потік у критичній секції, інші чекають на `acquire`, і чекання відпускає GIL. Критичну секцію тримають мінімальною: лише читання і запис спільного стану, без I/O всередині.

```python
import sys
import threading

sys.setswitchinterval(1e-6)

counts: dict[str, int] = {}
lock = threading.Lock()

def record(event: str, n: int) -> None:
    for _ in range(n):
        with lock:                         # acquire() ... release() навіть при винятку
            counts[event] = counts.get(event, 0) + 1

threads = [threading.Thread(target=record, args=("submit", 200_000)) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(counts["submit"], "expected", 4 * 200_000)
```

```text
800000 expected 800000
```

> **Під капотом.** Чому зламався `counts.get`, а не класичний `counter += 1`? У 3.12 запит на перемикання перевіряється не після кожної інструкції байткоду, а в кількох точках: на вході у функцію, на зворотному переході циклу і після виклику (у вихідному коді CPython цей механізм зветься eval breaker, внутрішній жаргон). `counter += 1` це `LOAD_GLOBAL`, `BINARY_OP`, `STORE_GLOBAL` без виклику між ними, тож у 3.12 він випадково не рветься навіть з `setswitchinterval(1e-6)`. У `counts.get(...)` між читанням і записом стоїть `CALL`, і після нього потік може втратити GIL. Це деталь реалізації конкретної версії, а не гарантія мови: інша версія чи free-threaded збірка поводяться інакше, тож спільний змінюваний стан захищають `Lock` завжди.

```python
import sys
import threading

sys.setswitchinterval(1e-6)
counter = 0

def work(n: int) -> None:
    global counter
    for _ in range(n):
        counter += 1

threads = [threading.Thread(target=work, args=(200_000,)) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(counter)
```

```text
800000
```

> **JS-аналог.** `SharedArrayBuffer` з `Atomics.add` дає в Node атомарні операції без блокувань. У стандартній бібліотеці Python атомарних примітивів немає: є `Lock`, `RLock` (реентерабельний, той самий потік може взяти його повторно), `Semaphore`, `Event`, `Condition`. Atomics-мислення "ця операція одна, значить атомарна" тут не працює, бо одна операція в коді це кілька інструкцій байткоду.

Два lock-и дають другу класичну проблему, deadlock (взаємне блокування; англійський термін уживають і в документації, і на співбесідах). Потік A тримає `configs_lock` і чекає `pages_lock`, потік B тримає `pages_lock` і чекає `configs_lock`, і жоден не відпустить свій. Нижче потоки зроблені daemon-потоками й `join` має таймаут, інакше демонстрація зависла б назавжди.

```python
import threading
import time

configs_lock = threading.Lock()
pages_lock = threading.Lock()

def publish() -> None:                     # configs -> pages
    with configs_lock:
        time.sleep(0.05)
        with pages_lock:
            print("publish done")

def rebuild() -> None:                     # pages -> configs
    with pages_lock:
        time.sleep(0.05)
        with configs_lock:
            print("rebuild done")

threads = [threading.Thread(target=fn, daemon=True) for fn in (publish, rebuild)]
for t in threads:
    t.start()
for t in threads:
    t.join(timeout=1)
print("still alive:", [t.is_alive() for t in threads])
```

```text
still alive: [True, True]
```

Лікування не в таймаутах, а в порядку: усі ділянки коду, яким потрібні обидва lock-и, беруть їх в одному й тому самому порядку. Тоді потік, що прийшов другим, чекає на першому lock-у, нічого не тримаючи. Ще краще мати один lock на один шматок стану й не вкладати їх узагалі.

```python
import threading
import time

configs_lock = threading.Lock()
pages_lock = threading.Lock()

def publish() -> None:
    with configs_lock:                     # завжди configs -> pages
        time.sleep(0.05)
        with pages_lock:
            print("publish done")

def rebuild() -> None:
    with configs_lock:                     # той самий порядок
        time.sleep(0.05)
        with pages_lock:
            print("rebuild done")

threads = [threading.Thread(target=fn) for fn in (publish, rebuild)]
for t in threads:
    t.start()
for t in threads:
    t.join()
```

```text
publish done
rebuild done
```

<!-- task: q2 -->

<!-- task: t2 -->

<!-- task: t3 -->

## queue.Queue і життя потоків

Найнадійніший спосіб не воювати з lock-ами: не ділити змінюваний стан узагалі, а передавати повідомлення. `queue.Queue` це потокобезпечна (thread-safe, офіційний термін документації) FIFO-черга з блокуваннями всередині. `get()` блокує потік, поки черга порожня, `put()` блокує, коли досягнуто `maxsize`, і це вбудований backpressure. `task_done()` і `join()` працюють так само, як в `asyncio.Queue` з m5-l05, бо асинхронну чергу проєктували за цим зразком. Зупинити воркерів простіше за все sentinel-ом (жаргон спільноти: спеціальне значення-маркер "роботи більше не буде"), по одному на воркера.

```python
import queue
import threading
import time

STOP = None                                         # sentinel: "роботи більше не буде"

def worker(jobs: queue.Queue[str | None], done: list[str]) -> None:
    while True:
        job = jobs.get()                            # блокує потік, поки черга порожня
        if job is STOP:
            jobs.task_done()
            break
        time.sleep(0.05)                            # уявіть запит через requests
        done.append(f"{job}@{threading.current_thread().name}")
        jobs.task_done()

jobs: queue.Queue[str | None] = queue.Queue(maxsize=10)   # maxsize дає backpressure
done: list[str] = []
workers = [threading.Thread(target=worker, args=(jobs, done), name=f"w{i}") for i in range(3)]
for w in workers:
    w.start()

start = time.perf_counter()
for i in range(9):
    jobs.put(f"form-{i}")                           # блокує, якщо черга повна
for _ in workers:
    jobs.put(STOP)
jobs.join()                                         # усі task_done отримані
for w in workers:
    w.join()
print(len(done), "jobs,", f"{time.perf_counter() - start:.2f}s")
print(sorted(job.split("@")[0] for job in done))
```

```text
9 jobs, 0.17s
['form-0', 'form-1', 'form-2', 'form-3', 'form-4', 'form-5', 'form-6', 'form-7', 'form-8']
```

Дев'ять задач по 50 мс на трьох воркерах зайняли три "раунди". `done.append` з кількох потоків тут не потребує lock-а: `list.append` це один виклик C-функції, який виконується цілком під GIL. Але це знову гарантія CPython, а не контракт; для чогось складнішого за `append` повертаємось до `Lock` або до черги результатів.

> **Пастка.** `queue.Queue` і `asyncio.Queue` не взаємозамінні. `queue.Queue.get()` усередині корутини заблокує весь event loop, бо чекає, тримаючи потік. `asyncio.Queue` не потокобезпечна: класти в неї з іншого потоку можна лише через `loop.call_soon_threadsafe`, як у розділі про міст з asyncio.

Друге, що відрізняє потоки від воркерів Node, це завершення програми. Інтерпретатор на виході чекає всі звичайні потоки: скрипт дійшов до кінця, а процес живе, поки живий хоч один не-daemon потік. Daemon-потік (офіційна назва атрибута `daemon`) навпаки вбивається на виході без попередження, і його `finally` не виконується. Нижче один і той самий скрипт у двох варіантах, з часом процесу від `/usr/bin/time -p`.

```python
import threading
import time

def flush_metrics() -> None:
    time.sleep(0.5)
    print("metrics flushed")

threading.Thread(target=flush_metrics).start()
print("main: end of script")
```

```text
main: end of script
metrics flushed
real 0.53
```

```python
import threading
import time

def flush_metrics() -> None:
    try:
        time.sleep(0.5)
        print("metrics flushed")
    finally:
        print("cleanup")                   # для daemon не виконається

threading.Thread(target=flush_metrics, daemon=True).start()
print("main: end of script")
```

```text
main: end of script
real 0.03
```

Перший варіант це потік, що пережив програму: забутий воркер з `while True` не дасть процесу завершитися взагалі, і контейнер висітиме до `SIGKILL`. Другий варіант губить роботу мовчки. Правило: daemon лише для того, що не шкода втратити (heartbeat, фонове опитування), а для всього іншого явна зупинка через sentinel або `threading.Event` і `join()` перед виходом.

<!-- task: q3 -->

## concurrent.futures: пул замість ручних потоків

`concurrent.futures` дає executor (офіційний термін: об'єкт, що виконує callable асинхронно), тобто пул воркерів і чергу задач в одному. `submit(fn, *args)` одразу повертає `Future`, а сам виклик іде в пулі. `Future` це найближчий до `Promise` об'єкт у синхронному Python, з однією принциповою різницею: `result()` не підписка, а блокуюче очікування, яке зупиняє потік, що його викликав, до готовності або до `timeout`. `add_done_callback` дає callback-стиль, `exception()` віддає виняток без `raise`. Сам `Future` можна створити й заповнити вручну, і цей блок працює навіть у браузері, бо потоків не потребує.

```python live
from concurrent.futures import Future

f: Future[str] = Future()
f.add_done_callback(lambda fut: print("callback:", fut.result()))
print(f.done())
f.set_result("page.html")
print(f.done(), f.result())

g: Future[str] = Future()
g.set_exception(ValueError("bad config"))
print(repr(g.exception()))
try:
    g.result()
except ValueError as exc:
    print("raised:", exc)
```

```text
False
callback: page.html
True page.html
ValueError('bad config')
raised: bad config
```

Отримувати результати можна двома способами. `as_completed(futures)` віддає їх у порядку завершення, це аналог обробки `Promise` по мірі готовності. `pool.map(fn, *iterables)` повертає результати в порядку аргументів, як `Promise.all`. Виняток з потоку тепер не губиться: він зберігається у `Future` і піднімається з `result()` у тому потоці, який по нього прийшов.

```python
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch(name: str, delay: float) -> str:
    time.sleep(delay)                                  # блокуючий I/O
    if name == "bad":
        raise ConnectionError(f"{name}: refused")
    return f"{name} ok"

jobs = [("a", 0.3), ("b", 0.1), ("bad", 0.2)]

with ThreadPoolExecutor(max_workers=4) as pool:
    futures = {pool.submit(fetch, name, delay): name for name, delay in jobs}
    for future in as_completed(futures):               # у порядку завершення
        try:
            print("done:  ", future.result())          # виняток потоку летить тут
        except ConnectionError as exc:
            print("failed:", futures[future], "->", exc)

    start = time.perf_counter()
    print(list(pool.map(fetch, ["a", "b"], [0.3, 0.1])))   # у порядку аргументів
    print(f"map: {time.perf_counter() - start:.1f}s")

    try:
        print(list(pool.map(fetch, ["b", "bad"], [0.1, 0.1])))
    except ConnectionError as exc:
        print("map raised:", exc)
```

```text
done:   b ok
failed: bad -> bad: refused
done:   a ok
['a ok', 'b ok']
map: 0.3s
map raised: bad: refused
```

> **Пастка.** `pool.map` піднімає виняток у момент, коли ітерація доходить до зламаного результату, і всі успішні результати, які ви ще не встигли забрати, пропадають разом з ним: `list(...)` так і не повернувся. Якщо одна зламана форма не повинна топити решту, потрібен `submit` з `as_completed` і `try` навколо кожного `result()`, як у першій половині прикладу.

Чому пул, а не ручні `Thread`. Потоки створюються один раз і перевикористовуються, а не на кожну задачу. Результат і виняток повертаються через `Future`, а не через спільний словник і stderr. `with` на виході викликає `shutdown(wait=True)`, тож забутих потоків не лишається. І головне: `ThreadPoolExecutor` і `ProcessPoolExecutor` мають однаковий API, тож перехід від потоків до процесів це заміна одного імені класу.

```python
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

def cpu_task(n: int) -> int:
    total = 0
    for i in range(n):
        total += i * i
    return total

def timed(label: str, run) -> None:
    start = time.perf_counter()
    run()
    print(f"{label:<12} {time.perf_counter() - start:.2f}s")

if __name__ == "__main__":
    jobs = [5_000_000] * 4
    timed("sequential", lambda: [cpu_task(n) for n in jobs])
    with ThreadPoolExecutor(max_workers=4) as pool:
        timed("4 threads", lambda: list(pool.map(cpu_task, jobs)))
    with ProcessPoolExecutor(max_workers=4) as pool:
        timed("4 processes", lambda: list(pool.map(cpu_task, jobs)))
```

```text
sequential   0.82s
4 threads    0.75s
4 processes  0.26s
```

Той самий `pool.map`, той самий `cpu_task`, і процеси дали втричі швидше, включно з часом старту чотирьох інтерпретаторів. Чому не вчетверо і чому `if __name__ == "__main__"` тут з'явився, наступний розділ.

<!-- task: t4 -->

## multiprocessing: окремий інтерпретатор і pickle

Процес-воркер це окрема копія Python зі своєю пам'яттю і своїм GIL. Створити її можна трьома способами (start method, офіційний термін). `fork` копіює батьківський процес як є і був за замовчуванням на Linux. `spawn` запускає чистий інтерпретатор, який заново імпортує ваш головний модуль; це єдиний безпечний варіант на macOS і за замовчуванням там з Python 3.8, а також на Windows. `forkserver` проміжний. На Mac ви завжди працюєте зі `spawn`, а отже з повторним виконанням усього верхнього рівня скрипта в кожному дочірньому процесі.

```python
import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor

def square(x: int) -> int:
    return x * x

print(f"module body runs in pid {os.getpid()}")

if __name__ == "__main__":
    print(multiprocessing.get_start_method())
    with ProcessPoolExecutor(max_workers=2) as pool:
        print(list(pool.map(square, range(5))))
```

```text
module body runs in pid 99442
spawn
module body runs in pid 99444
module body runs in pid 99445
[0, 1, 4, 9, 16]
```

Рядок з pid надрукувався тричі: головний процес і два воркери, кожен з яких імпортував модуль заново. У воркері модуль отримує ім'я `__mp_main__`, тому гілка `if __name__ == "__main__"` там не виконується (сама ідіома розібрана в m0-l03). Без цього guard-а дочірній процес, імпортуючи модуль, сам дійде до створення пулу й спробує породити власних дітей. `multiprocessing` це помічає і зупиняє, а батько бачить зламаний пул.

```python
from concurrent.futures import ProcessPoolExecutor

def square(x: int) -> int:
    return x * x

print("module body runs")

with ProcessPoolExecutor(max_workers=2) as pool:      # без guard
    print(list(pool.map(square, range(5))))
```

```text
module body runs
module body runs
Traceback (most recent call last):
  ...
RuntimeError:
        An attempt has been made to start a new process before the
        current process has finished its bootstrapping phase.

        This probably means that you are not using fork to start your
        child processes and you have forgotten to use the proper idiom
        in the main module:

            if __name__ == '__main__':
  ...
concurrent.futures.process.BrokenProcessPool: A process in the process pool was terminated abruptly while the future was running or pending.
```

Вивід скорочено, stdout і stderr разом: кожен воркер друкує свій повний traceback, разом близько 150 рядків, а кількість рядків `module body runs` від запуску до запуску різна, бо залежить від того, скільки воркерів встигло стартувати. Код, який на Linux з `fork` працював без guard-а, на Mac падає саме так, тож guard пишуть завжди.

Усе, що перетинає межу процесу, серіалізується модулем `pickle` (офіційна назва; аналог structured clone з `postMessage`): функція, аргументи, результат і навіть виняток. Функцію pickle не копіює, а записує посиланням "модуль плюс ім'я", і воркер імпортує її за цим ім'ям. Звідси перелік того, що не проходить: `lambda` і локальні функції (у них немає імені, за яким їх можна знайти на верхньому рівні модуля), відкриті файли, сокети, lock-и, генератори (стан, що прив'язаний до процесу чи кадру виконання). `pickle` працює і в браузері, тож перевірити можна прямо тут.

```python live
import pickle
import tempfile

def render(config: dict) -> str:          # функція верхнього рівня модуля
    return f"<form id={config['id']}>"

def make_renderer():
    def inner(config: dict) -> str:       # локальна функція
        return "..."
    return inner

print(pickle.dumps(render))               # лише посилання: модуль і ім'я

candidates = {
    "dict": {"id": "signup", "fields": ["email"]},
    "module-level function": render,
    "lambda": lambda c: c["id"],
    "local function": make_renderer(),
    "open file": tempfile.TemporaryFile(),
    "generator": (x for x in range(3)),
}

for name, obj in candidates.items():
    try:
        data = pickle.dumps(obj)
        print(f"ok    {name}: {len(data)} bytes")
    except Exception as exc:
        print(f"fail  {name}: {type(exc).__name__}: {exc}")
```

```text
b'\x80\x04\x95\x17\x00\x00\x00\x00\x00\x00\x00\x8c\x08__main__\x94\x8c\x06render\x94\x93\x94.'
ok    dict: 50 bytes
ok    module-level function: 34 bytes
fail  lambda: PicklingError: Can't pickle <function <lambda> at 0x1005d2f20>: attribute lookup <lambda> on __main__ failed
fail  local function: AttributeError: Can't get local object 'make_renderer.<locals>.inner'
fail  open file: TypeError: cannot pickle 'BufferedRandom' instances
fail  generator: TypeError: cannot pickle 'generator' object
```

У пулі процесів та сама помилка приходить через `Future`: `submit` з `lambda` не падає одразу, падає `result()`.

```python
from concurrent.futures import ProcessPoolExecutor

if __name__ == "__main__":
    with ProcessPoolExecutor(max_workers=2) as pool:
        future = pool.submit(lambda x: x * 2, 21)
        try:
            print(future.result())
        except Exception as exc:
            print(f"{type(exc).__name__}: {exc}")
```

```text
PicklingError: Can't pickle <function <lambda> at 0x1019254e0>: attribute lookup <lambda> on __main__ failed
```

<!-- task: q4 -->

Процеси мають ціну, і її треба знати в мілісекундах. Старт: `spawn` запускає новий інтерпретатор і імпортує ваш модуль з усіма залежностями. Кожна задача: pickle аргументів, передача через pipe, unpickle у воркері, і те саме для результату. Якщо сама робота коротша за цю дорогу, пул програє звичайному циклу.

```python
import time
from concurrent.futures import ProcessPoolExecutor

def double(x: int) -> int:
    return x * 2

def noop() -> None:
    pass

def total(numbers: list[int]) -> int:
    return sum(numbers)

if __name__ == "__main__":
    start = time.perf_counter()
    with ProcessPoolExecutor(max_workers=4) as pool:
        pool.submit(noop).result()
    print(f"pool start + 1 noop:          {time.perf_counter() - start:.3f}s")

    items = list(range(20_000))
    start = time.perf_counter()
    [double(x) for x in items]
    print(f"20k tiny tasks, sequential:   {time.perf_counter() - start:.3f}s")

    with ProcessPoolExecutor(max_workers=4) as pool:
        pool.submit(noop).result()                     # пул уже запущений
        start = time.perf_counter()
        list(pool.map(double, items))
        print(f"20k tiny tasks, pool.map:     {time.perf_counter() - start:.3f}s")
        start = time.perf_counter()
        list(pool.map(double, items, chunksize=1_000))
        print(f"20k tiny tasks, chunksize=1k: {time.perf_counter() - start:.3f}s")

        big = list(range(10_000_000))
        start = time.perf_counter()
        sum(big)
        print(f"sum of 10M, in place:         {time.perf_counter() - start:.3f}s")
        start = time.perf_counter()
        pool.submit(total, big).result()
        print(f"sum of 10M, via pool:         {time.perf_counter() - start:.3f}s")
```

```text
pool start + 1 noop:          0.065s
20k tiny tasks, sequential:   0.001s
20k tiny tasks, pool.map:     1.488s
20k tiny tasks, chunksize=1k: 0.004s
sum of 10M, in place:         0.057s
sum of 10M, via pool:         0.319s
```

Три висновки з цих чисел. Пул створюють один раз на життя програми, а не на запит: 60 мс на старт це більше, ніж займає типовий рендер. Дрібні задачі пакують: `chunksize` у `ProcessPoolExecutor.map` відправляє елементи пачками, і ті самі 20 000 викликів з 1.5 с стали 4 мс (у `ThreadPoolExecutor` цей параметр ні на що не впливає). Великі аргументи вбивають виграш: сума 10 мільйонів чисел у воркері в п'ять разів повільніша, ніж на місці, бо майже весь час пішов на pickle списку. Передавайте у воркер ідентифікатор, шлях або невеликий словник, а не дані цілком; результат теж тримайте малим.

> **JS-аналог.** Еквівалент `SharedArrayBuffer` існує (`multiprocessing.shared_memory`, `multiprocessing.Value`), але це сирі байти або числа без структур Python, і в прикладному коді до них майже не вдаються. Звичайна модель та сама, що з `postMessage` без transferable: воркер отримує копію, повертає копію, а зміни глобальних змінних у воркері батько не бачить.

## Міст з asyncio

З asyncio обидва пули поєднуються через `loop.run_in_executor(executor, fn, *args)`: функція йде в пул, а цикл отримує asyncio-Future, на який можна чекати `await`, поки інші задачі працюють. `asyncio.to_thread(fn, *args)` з m5-l05 це скорочення для `run_in_executor(None, ...)`, тобто для вбудованого `ThreadPoolExecutor` циклу (за замовчуванням `min(32, cpu_count + 4)` потоків). Для CPU-роботи передають власний `ProcessPoolExecutor`. Різницю найкраще видно по тому, чи живий цикл: нижче heartbeat-задача хоче тікати кожні 50 мс, поки поруч рахуються чотири CPU-задачі трьома способами.

```python
import asyncio
import time
from concurrent.futures import ProcessPoolExecutor

def cpu_task(n: int) -> int:
    total = 0
    for i in range(n):
        total += i * i
    return total

async def heartbeat(ticks: list[float]) -> None:       # має тікати кожні 50 мс
    while True:
        ticks.append(time.perf_counter())
        await asyncio.sleep(0.05)

async def measure(label: str, run_jobs) -> None:
    ticks: list[float] = []
    beat = asyncio.create_task(heartbeat(ticks))
    await asyncio.sleep(0)                              # перший тік
    start = time.perf_counter()
    await run_jobs()
    end = time.perf_counter()
    beat.cancel()
    gaps = [b - a for a, b in zip(ticks, ticks[1:] + [end])]
    print(f"{label:<12} {end - start:.2f}s, longest loop freeze: {max(gaps):.2f}s")

async def main() -> None:
    loop = asyncio.get_running_loop()
    jobs = [5_000_000] * 4

    async def inline() -> None:
        for n in jobs:
            cpu_task(n)                                 # блокує цикл

    async def threads() -> None:
        await asyncio.gather(*(asyncio.to_thread(cpu_task, n) for n in jobs))

    with ProcessPoolExecutor(max_workers=4) as pool:
        async def processes() -> None:
            await asyncio.gather(*(loop.run_in_executor(pool, cpu_task, n) for n in jobs))

        for label, run_jobs in [("inline", inline), ("to_thread", threads), ("process pool", processes)]:
            await measure(label, run_jobs)

if __name__ == "__main__":
    asyncio.run(main())
```

```text
inline       0.74s, longest loop freeze: 0.74s
to_thread    0.74s, longest loop freeze: 0.11s
process pool 0.26s, longest loop freeze: 0.05s
```

`inline` заморозив цикл на всі 0.74 с: жоден запит, жоден WebSocket за цей час не обслуговано б. `to_thread` цикл формально врятував, але CPU-робота не прискорилась, а цикл ривками стояв до 0.11 с: потік циклу змагається за GIL з чотирма потоками, що рахують, і отримує його по черзі. `ProcessPoolExecutor` і прискорив роботу, і лишив цикл вільним: тік кожні 50 мс за розкладом. Звідси правило з m5-l05 у точнішій формі: `to_thread` для блокуючого I/O, процеси для CPU.

Зворотний напрям, коли код з чужого потоку має щось зробити в циклі, ламається частіше. Event loop не потокобезпечний: усі його методи, крім двох, можна викликати лише з потоку, де він крутиться. `asyncio.create_task` з іншого потоку падає з `no running event loop`, бо "поточний цикл" asyncio шукає для поточного потоку, а в цього потоку циклу немає. Два легальні входи: `asyncio.run_coroutine_threadsafe(coro, loop)` ставить корутину в цикл і повертає `concurrent.futures.Future`, на якому потік може чекати `result()`; `loop.call_soon_threadsafe(fn, *args)` ставить звичайний callback, наприклад `queue.put_nowait` для `asyncio.Queue`. Типова ситуація: синхронний SDK чи file watcher викликає ваш callback у своєму потоці.

```python
import asyncio
import threading

async def save_status(job: str) -> str:
    await asyncio.sleep(0.01)
    return f"{job}: saved"

def callback_wrong(job: str) -> None:               # виконується в чужому потоці
    try:
        asyncio.create_task(save_status(job))
    except RuntimeError as exc:
        print("wrong:", exc)

def callback_ok(job: str, loop: asyncio.AbstractEventLoop) -> None:
    future = asyncio.run_coroutine_threadsafe(save_status(job), loop)
    print("thread got:", future.result(timeout=1))  # concurrent.futures.Future

def watcher(loop: asyncio.AbstractEventLoop, events: asyncio.Queue[str]) -> None:
    for name in ["a.json", "b.json"]:
        loop.call_soon_threadsafe(events.put_nowait, name)

async def run_in_thread(target, *args) -> None:
    t = threading.Thread(target=target, args=args)
    t.start()
    await asyncio.to_thread(t.join)                 # не блокувати цикл на join

async def main() -> None:
    loop = asyncio.get_running_loop()
    await run_in_thread(callback_wrong, "form-1")
    await run_in_thread(callback_ok, "form-2", loop)

    events: asyncio.Queue[str] = asyncio.Queue()
    await run_in_thread(watcher, loop, events)
    print("changed:", await events.get(), await events.get())

asyncio.run(main())
```

```text
wrong: no running event loop
thread got: form-2: saved
changed: a.json b.json
```

У stderr до цього додається `RuntimeWarning: coroutine 'save_status' was never awaited` від невдалої спроби: корутину створили, але в цикл вона не потрапила.

> **Під капотом.** Чому не можна просто викликати `loop.call_soon` чи `events.put_nowait` з потоку: помилки не буде, але цикл у цей момент зазвичай спить у `select` чекаючи на сокети, і про новий callback не дізнається, поки не прокинеться з іншої причини. Версії `_threadsafe` після постановки callback-а пишуть байт у внутрішній self-pipe циклу, і `select` повертається негайно. До того ж внутрішні структури циклу не захищені lock-ом.

<!-- task: t5 -->

## Для капстоуну

Рендер сторінки FormBuilder це CPU-робота: шаблонізатор складає рядки, екранує значення, мініфікатор проходить результат посимвольно. Ні мережі, ні диска, лише байткод. Нижче модель: 50 конфігів по 800 полів, рендер у HTML з варіантами під брейкпоінти і посимвольна мініфікація. Порівнюються послідовний рендер, async-воркер з `to_thread` і з `ProcessPoolExecutor` на 4 і 8 процесах.

```python
import asyncio
import pickle
import time
from concurrent.futures import ProcessPoolExecutor
from html import escape

def minify(html: str) -> str:                       # посимвольний прохід: чистий CPU
    out: list[str] = []
    prev_space = False
    for ch in html:
        if ch.isspace():
            if not prev_space:
                out.append(" ")
            prev_space = True
        else:
            out.append(ch)
            prev_space = False
    return "".join(out)

def render(config: dict) -> str:
    rows = []
    for field in config["fields"]:
        attrs = " ".join(f'{k}="{escape(str(v))}"' for k, v in sorted(field.items()))
        for bp in ("sm", "md", "lg", "xl"):          # варіант розмітки під кожен брейкпоінт
            rows.append(f"""
                <div class="col-{bp}">
                    <label>{escape(field["label"])}</label>
                    <input {attrs}>
                </div>""")
    return minify(f'<form id="{config["id"]}">' + "".join(rows) + "</form>")

def make_configs(n: int) -> list[dict]:
    return [
        {
            "id": f"form-{i}",
            "fields": [
                {"id": f"f{j}", "label": f"Field <{j}>", "type": "text", "required": j % 2 == 0}
                for j in range(800)
            ],
        }
        for i in range(n)
    ]

async def with_threads(configs: list[dict]) -> list[str]:
    return await asyncio.gather(*(asyncio.to_thread(render, c) for c in configs))

async def with_processes(configs: list[dict], pool: ProcessPoolExecutor) -> list[str]:
    loop = asyncio.get_running_loop()
    return await asyncio.gather(*(loop.run_in_executor(pool, render, c) for c in configs))

async def main() -> None:
    configs = make_configs(50)
    print(f"config: {len(pickle.dumps(configs[0]))} bytes pickled")

    start = time.perf_counter()
    expected = [render(c) for c in configs]
    print(f"page: {len(expected[0])} chars")
    print(f"sequential:      {time.perf_counter() - start:.2f}s")

    start = time.perf_counter()
    assert await with_threads(configs) == expected
    print(f"to_thread:       {time.perf_counter() - start:.2f}s")

    for workers in (4, 8):
        start = time.perf_counter()
        with ProcessPoolExecutor(max_workers=workers) as pool:
            assert await with_processes(configs, pool) == expected
        print(f"process pool x{workers}: {time.perf_counter() - start:.2f}s")

if __name__ == "__main__":
    asyncio.run(main())
```

```text
config: 28648 bytes pickled
page: 425905 chars
sequential:      0.86s
to_thread:       0.89s
process pool x4: 0.35s
process pool x8: 0.22s
```

Вибір для капстоуну: `ProcessPoolExecutor`, через `run_in_executor` з асинхронного воркера з m5-l05. `to_thread` тут не дав нічого, крім трохи гіршого часу і ривків циклу, бо рендер не відпускає GIL. Процеси дали 2.5x на чотирьох і майже 4x на восьми, включно зі стартом пулу, і це чесний виграш саме тому, що аргумент малий (28 КБ конфігу), а робота важка. Пул створюється один раз при старті воркера, `max_workers` близько до кількості ядер мінус те, що потрібно самому API, а черга і `Semaphore` з m5-l05 лишаються як є: вони обмежують, скільки конфігів одночасно в польоті, а пул визначає, скільки рендериться паралельно.

> **Для капстоуну.** Сторінка на 426 тисяч символів повертається з воркера теж через pickle. У справжньому воркері дешевше, щоб процес-рендерер сам писав файл і повертав лише шлях. `ProcessPoolExecutor(initializer=..., initargs=...)` виконує функцію один раз на старті кожного процесу: туди йде створення `jinja2.Environment` з m7-l06, щоб не компілювати шаблони на кожен конфіг. `max_tasks_per_child` (з 3.11) перезапускає процес після N задач, якщо рендерер повільно тече пам'яттю.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **"Python однопотоковий, як Node", отже спільний стан без Lock.** Потоки справжні, перемикаються між будь-якими інструкціями, і read-modify-write без блокування втрачає оновлення, причому не в кожному запуску. Правильно: `with lock:` навколо читання й запису, або взагалі без спільного стану (черга, кожен потік рахує своє, злиття в кінці).

   ```python
   counts[event] = counts.get(event, 0) + 1     # втрачає оновлення з 4 потоків
   with lock:
       counts[event] = counts.get(event, 0) + 1
   ```

2. **Потоки для CPU-роботи в очікуванні прискорення.** Інтуїція з Java чи Go, де потоки займають усі ядра. Під GIL чотири потоки на чистому Python рахують стільки ж, скільки один. Правильно: `ProcessPoolExecutor` з тим самим API.

   ```python
   ThreadPoolExecutor(4).map(cpu_task, jobs)    # 0.75s, як послідовно (0.82s)
   ProcessPoolExecutor(4).map(cpu_task, jobs)   # 0.26s
   ```

3. **Два lock-и в різному порядку.** Кожна функція бере "свій" lock першим, і під навантаженням обидва потоки стоять назавжди без жодної помилки. Правильно: один глобальний порядок захоплення, або один lock на стан.

   ```python
   with configs_lock:          # усюди: спершу configs, потім pages
       with pages_lock:
           ...
   ```

4. **Потік, що пережив програму, або daemon, що загубив роботу.** Не-daemon воркер з `while True` не дає процесу завершитися; daemon вбивається без `finally`. Правильно: явна зупинка через sentinel чи `Event` і `join()` перед виходом.

   ```python
   stop = threading.Event()
   t = threading.Thread(target=lambda: stop.wait())
   t.start()
   stop.set()
   t.join()
   ```

5. **CPU-робота всередині asyncio-циклу.** `async def render(...)` з важким циклом усередині виглядає асинхронною, але заморожує всі з'єднання на час рендеру. `to_thread` цикл звільняє лише частково і не прискорює. Правильно: `run_in_executor` з `ProcessPoolExecutor`.

   ```python
   html = render(config)                                      # цикл стоїть
   html = await loop.run_in_executor(pool, render, config)    # цикл живий
   ```

6. **ProcessPool з великими аргументами або крихітними задачами.** Передати весь масив чи по одному числу на задачу означає витратити час на pickle, а не на роботу. Правильно: малі аргументи (id, шлях), важка робота на задачу, `chunksize` для дрібних.

   ```python
   pool.submit(total, big_list)                    # 0.32s проти 0.06s на місці
   pool.map(double, items, chunksize=1_000)        # замість 20k окремих задач
   ```

7. **Очікування SharedArrayBuffer: зміна глобальної змінної у воркері-процесі.** У потоках це працює, у процесах воркер змінює власну копію, і батько її не бачить. Правильно: повертати результат із функції.

   ```python
   rendered: list[str] = []
   def render(form_id: str) -> None:
       rendered.append(form_id)
   # ThreadPoolExecutor:  rendered == ['a', 'b']
   # ProcessPoolExecutor: rendered == []
   ```

8. **Виклик asyncio з чужого потоку напряму.** `create_task` з потоку падає з `no running event loop`, а `put_nowait` в `asyncio.Queue` не падає, але цикл може не прокинутись. Правильно: `run_coroutine_threadsafe` і `call_soon_threadsafe`.

   ```python
   asyncio.run_coroutine_threadsafe(save_status(job), loop).result(timeout=1)
   loop.call_soon_threadsafe(events.put_nowait, name)
   ```

## Підсумок

- Потоки в Python справжні й ділять пам'ять, але GIL пускає виконувати байткод лише один потік за раз; перемикання за запитом кожні 5 мс або на блокуючому виклику.
- Потоки прискорюють I/O і C-код, що відпускає GIL; CPU-роботу на чистому Python не прискорюють.
- asyncio для багатьох I/O з async-бібліотеками, threading для блокуючих бібліотек, multiprocessing для CPU; поєднувати нормально.
- Спільний змінюваний стан між потоками захищається `Lock`; те, що `counter += 1` не рветься на 3.12, деталь реалізації. Для відтворення гонитви в тестах `sys.setswitchinterval(1e-6)`.
- Кілька lock-ів беруть в одному порядку; між потоками краще передавати повідомлення через `queue.Queue`, ніж ділити стан.
- Інтерпретатор чекає не-daemon потоки на виході, daemon-потоки вбиває без `finally`.
- `concurrent.futures`: `submit` дає `Future`, `as_completed` по готовності, `map` по порядку; виняток з воркера піднімається з `result()`. Однаковий API для потоків і процесів.
- Процеси на macOS стартують через `spawn`: модуль імпортується заново, guard `if __name__ == "__main__"` обов'язковий.
- Через межу процесу все йде pickle: lambda, локальні функції, файли й генератори не проходять; великі аргументи й дрібні задачі з'їдають виграш.
- З asyncio: `to_thread` для блокуючого I/O, `run_in_executor` з `ProcessPoolExecutor` для CPU, а з чужого потоку в цикл лише через `run_coroutine_threadsafe` і `call_soon_threadsafe`.

## Що далі

Наступний урок m5-l09 про логування. Модуль `logging` потокобезпечний, і в кожному записі є `threadName` і `processName`, тож у логах воркерів з цього уроку буде видно, хто що робив; а логи з процесів пулу потребують окремого налаштування через `QueueHandler`, бо кожен процес має власний логер. Пул процесів для рендеру повернеться в модулі 7, коли воркер капстоуну отримає справжній Jinja2-рендерер.
