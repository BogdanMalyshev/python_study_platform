---
id: m6-l07
module: m6-stdlib-cli
title: "os, sys, signal: коректне завершення по SIGTERM"
summary: "Учень знає, що в sys і os стосується процесу, ставить обробник SIGTERM, який лише піднімає прапорець, доробляє поточну задачу з таймаутом і виходить з кодом 0, у asyncio робить те саме через loop.add_signal_handler, і розуміє, чому atexit, finally і навіть сам сигнал можуть не спрацювати (SIGKILL, os._exit, PID 1 у Docker)."
duration_min: 50
prerequisites: [m6-l06]
---

## `sys`: що вже бачили і що нове

Половину `sys` ви вже знаєте з m0-l03: `sys.argv` (список рядків без шляху до інтерпретатора, на відміну від `process.argv`), `sys.exit(code)` (кидає `SystemExit`, тож `finally` виконуються), `sys.stdin`/`sys.stdout`/`sys.stderr` як файлові об'єкти і `sys.path` як список директорій для `import`. Тут нове лише те, що описує сам інтерпретатор: версію, платформу, шлях до бінарника, розмір об'єктів і глибину рекурсії.

```python
import sys

print(sys.version_info)
print(sys.version_info >= (3, 12), sys.version_info[:2])
print(sys.platform)
print(sys.executable)
print(sys.getsizeof(0), sys.getsizeof(2**100), sys.getsizeof([]), sys.getsizeof([1, 2, 3]))
print(sys.getsizeof([[0] * 1000]))
print(sys.getrecursionlimit())
```

```text
sys.version_info(major=3, minor=12, micro=12, releaselevel='final', serial=0)
True (3, 12)
darwin
/Users/mac/projects/full_stack_study/python-course/.venv/bin/python
28 40 56 88
64
1000
```

`version_info` це кортеж, тому порівнюється з `(3, 12)` поелементно; так пишуть перевірку версії замість парсингу рядка `sys.version`. `sys.executable` показує, який саме Python запущено, і це перше, що варто надрукувати, коли "пакет встановлено, а import падає": майже завжди це інший venv. `sys.executable` також правильний спосіб запустити дочірній Python через `subprocess` (m6-l05), а не голе `"python"` з PATH.

> **Пастка.** `sys.getsizeof` міряє лише сам об'єкт, без того, на що він посилається. Список з одним вкладеним списком на тисячу елементів важить 64 байти, бо зовнішній список зберігає одне посилання. Для оцінки пам'яті структури даних він не годиться; це інструмент для порівняння контейнерів, як `range` проти `list` у m1-l06.

Глибина рекурсії в Python обмежена лічильником, а не розміром стека, як у V8, і за замовчуванням це 1000 кадрів. `sys.setrecursionlimit` піднімає межу, але не стек ОС під нею: якщо підняти її занадто високо, процес впаде із segfault замість `RecursionError`. Для обходу глибоких дерев (конфіг форми з вкладеними секціями) надійніше переписати рекурсію на явний стек.

```python
import sys

def depth(n: int) -> int:
    return 0 if n == 0 else 1 + depth(n - 1)

try:
    depth(5000)
except RecursionError as e:
    print("RecursionError:", e)

sys.setrecursionlimit(10_000)
print(depth(5000))
```

```text
RecursionError: maximum recursion depth exceeded
5000
```

<!-- task: q1 -->

## `os`: процес і його оточення

`os` це тонка обгортка над системними викликами: змінні оточення, поточна директорія, ідентифікатори процесу. Усе, що стосується шляхів (`os.path.join`, `os.path.exists`, `os.listdir`), у новому коді замінює `pathlib` (m6-l01); з `os.path` лишається хіба що `os.path.expandvars`. `os.name` дає грубе `posix`/`nt`, а `platform.system()` точну назву ОС, і саме його читають, коли поведінка відрізняється між macOS і Linux.

```python
import os
import platform

print(os.name, platform.system(), platform.machine())
print(os.getpid(), os.getppid())
print(os.cpu_count())
print(len(os.urandom(16)), type(os.urandom(16)).__name__)
print(os.getcwd())
os.chdir("/tmp")
print(os.getcwd())
```

```text
posix Darwin arm64
75363 75361
10
16 bytes
/Users/mac/projects/full_stack_study/python-course
/private/tmp
```

`getpid()` знадобиться далі, щоб знати, кому слати `kill`. `cpu_count()` повертає логічні ядра машини, а не квоту контейнера; у Docker з `--cpus=2` він усе одно покаже всі ядра хоста, тому кількість воркерів краще брати з налаштувань (m6-l06). `os.urandom` це криптографічно стійкі байти з ОС, ними користується модуль `secrets`, а не `random`. `os.chdir` змінює директорію всього процесу, включно з усіма потоками, тому в бібліотечному коді його не викликають: передають шлях або `cwd=` у `subprocess`. `os.fork` існує, але напряму його не використовують: процеси створює `multiprocessing` (m5-l08) або `subprocess`.

`os.environ` поводиться як `process.env` з однією суттєвою різницею: значення лише рядки, і присвоєння не-рядка дає `TypeError`, а не тихе `"true"`. Запис у `os.environ` змінює оточення поточного процесу і всіх дочірніх, запущених після цього.

```python live
import os

print(type(os.environ).__name__)
print(os.environ.get("FB_WORKERS"))
print(os.getenv("FB_WORKERS", "2"))
os.environ["FB_WORKERS"] = "4"
print(os.environ["FB_WORKERS"], int(os.environ["FB_WORKERS"]) + 1)
try:
    os.environ["FB_DEBUG"] = True
except TypeError as e:
    print("TypeError:", e)
```

```text
_Environ
None
2
4 5
TypeError: str expected, not bool
```

Типізоване читання оточення (`FB_WORKERS` як `int`, `FB_DEBUG` як `bool`) робить pydantic-settings з m6-l06; голий `os.environ` лишається для разових перевірок і для передачі змінних дочірньому процесу.

## Сигнали: хто їх шле і що Python робить за замовчуванням

Сигнал це коротке асинхронне повідомлення від ядра процесу: номер, і більше нічого. Чотири, які треба знати: `SIGINT` (2) шле термінал на Ctrl-C; `SIGTERM` (15) це ввічливе "завершись", його шлють `kill PID`, `docker stop`, systemd і Kubernetes; `SIGKILL` (9) ядро виконує саме, процес його не бачить і перехопити не може; `SIGHUP` (1) історично "термінал закрито", а в демонах за домовленістю означає "перечитай конфіг". Python ставить власний обробник лише на `SIGINT`, решта лишається з дією ОС за замовчуванням (`SIG_DFL`).

```python
import signal

for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGKILL):
    print(f"{sig.name:8} {int(sig):2}  {signal.getsignal(sig)!r}")
```

```text
SIGINT    2  <built-in function default_int_handler>
SIGTERM  15  <Handlers.SIG_DFL: 0>
SIGHUP    1  <Handlers.SIG_DFL: 0>
SIGKILL   9  None
```

Наслідок видно на скрипті з `finally` і `atexit`. `default_int_handler` перетворює `SIGINT` на виняток `KeyboardInterrupt` (нащадок `BaseException`, m1-l11), тож стек розмотується штатно. А `SIGTERM` з `SIG_DFL` ядро виконує без участі Python: процес зникає посеред `time.sleep`, не виконавши жодного рядка очищення. Це головна причина уроку: `docker stop` без обробника вбиває воркер так само брутально, як `kill -9`, тільки з затримкою.

```python
# no_handler.py
import atexit
import time

atexit.register(lambda: print("atexit: cleanup"))

try:
    print("working", flush=True)
    time.sleep(30)
finally:
    print("finally: cleanup")
```

```bash
python no_handler.py & sleep 0.5; kill -TERM $!; wait $!; echo "exit code: $?"
```

```text
working
exit code: 143
```

Той самий скрипт, якому замість `SIGTERM` надіслали `SIGINT` (так само, як Ctrl-C у терміналі), прибирає за собою: `finally`, traceback, `atexit`. Код завершення `-2` тут з `subprocess.Popen.returncode`, який для вбитого сигналом процесу повертає мінус номер сигналу; shell для того самого показує `128 + номер`, тобто `130`, а для `SIGTERM` вище `143`.

```text
working
finally: cleanup
Traceback (most recent call last):
  File ".../no_handler.py", line 9, in <module>
    time.sleep(30)
KeyboardInterrupt
atexit: cleanup
[returncode=-2]
```

<!-- task: t1 -->

<!-- task: q2 -->

## `signal.signal`: обробник лише ставить прапорець

`signal.signal(SIGTERM, handler)` замінює дію за замовчуванням на вашу функцію `handler(signum, frame)`. Механізм не схожий на колбек у Node. C-рівень CPython лише запам'ятовує "прийшов сигнал 15", а сам Python-обробник виконується пізніше, у головному потоці, між двома інструкціями байткоду. Звідси три обмеження: ставити обробник можна лише з головного потоку, `SIGKILL` не перехоплюється взагалі, а обробник перериває головний код у довільному місці.

```python
import signal
import threading

try:
    signal.signal(signal.SIGKILL, lambda signum, frame: None)
except OSError as e:
    print("OSError:", e)

def install() -> None:
    try:
        signal.signal(signal.SIGTERM, lambda signum, frame: None)
    except ValueError as e:
        print("ValueError:", e)

t = threading.Thread(target=install)
t.start()
t.join()
```

```text
OSError: [Errno 22] Invalid argument
ValueError: signal only works in main thread of the main interpreter
```

"Довільне місце" означає, що обробник може спрацювати посеред запису у файл, між двома кроками транзакції або всередині `print`. Тому правило: обробник нічого не робить сам, лише піднімає прапорець (`stop_requested = True` або `threading.Event.set()`), а головний цикл перевіряє прапорець у безпечній точці, між задачами. Те саме з JS-звичкою `process.exit()` в обробнику: `sys.exit` там кидає `SystemExit` у випадкову точку головного коду.

```ts
process.on("SIGTERM", async () => {
  await queue.close();      // Node чекає цей проміс? Ні: подія вже оброблена
  process.exit(0);          // обриває все, що було в роботі
});
```

```python
import signal

stop_requested = False

def on_sigterm(signum: int, frame: object) -> None:
    global stop_requested
    stop_requested = True           # і все: роботу робить головний цикл

signal.signal(signal.SIGTERM, on_sigterm)
```

У Node обробник виконується як звичайна подія event loop, між задачами, тож він не перериває чужий код посеред операції; асинхронний колбек там "працює", але `process.exit()` обриває все, що ще не завершилось. У Python обробник синхронний, `async def` як обробник не має сенсу (корутину ніхто не запустить), а `sys.exit(0)` у ньому реально перериває код посередині. Ось "транзакція" з двох кроків, яку обробник з `sys.exit` розрізав навпіл:

```python
# exit_in_handler.py
import signal
import sys
import time

signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(0))   # як process.exit()

saved = []
try:
    for i in range(1, 100):
        saved.append(i)        # "транзакція": два кроки, які мають іти разом
        time.sleep(0.3)
        saved.append(-i)
finally:
    print("finally, last pair:", saved[-2:], flush=True)
```

```text
finally, last pair: [-1, 2]
```

> **Пастка.** Блокуючий виклик не завжди переривається сигналом. Починаючи з Python 3.5 (PEP 475) `time.sleep`, `read`, `select` після обробника, який не кинув виняток, продовжують чекати до кінця. Прапорець піднявся на 0.5 с, а цикл побачить його лише через 2 с, коли `sleep` закінчиться. Для очікування, яке має перериватись, беріть `threading.Event().wait(timeout)` і `set()` в обробнику: тоді `wait` повертається одразу.

```python
# flag_sleep.py: SIGTERM приходить через 0.5 с після старту
import signal
import time

stop_requested = False

def on_sigterm(signum: int, frame: object) -> None:
    global stop_requested
    print(f"handler: got {signal.Signals(signum).name}", flush=True)
    stop_requested = True

signal.signal(signal.SIGTERM, on_sigterm)

t0 = time.monotonic()
time.sleep(2)
print(f"sleep returned after {time.monotonic() - t0:.1f}s, stop_requested={stop_requested}")
```

```text
handler: got SIGTERM
sleep returned after 2.0s, stop_requested=True
exit code: 0
```

<!-- task: q3 -->

## Graceful shutdown синхронного воркера

Graceful shutdown (усталий англійський термін, українською "коректне завершення") складається з чотирьох кроків: перестати брати нові задачі, доробити поточну, записати стан, вийти з кодом 0. П'ятий крок, про який забувають: таймаут. Docker після `SIGTERM` чекає 10 секунд і шле `SIGKILL`, тож якщо поточна задача довша, краще самому перервати її й записати назад як незавершену, ніж бути вбитим посеред запису стану. У синхронному коді таймаут дає `signal.alarm(n)`: через `n` секунд прийде `SIGALRM`, і його обробник, на відміну від обробника `SIGTERM`, якраз має кинути виняток, щоб перервати задачу.

```python
# worker.py
import json
import signal
import sys
import time
from pathlib import Path

SHUTDOWN_TIMEOUT = 3          # секунд на дообробку після SIGTERM
STATE = Path("pending.json")

class ShutdownTimeout(Exception):
    pass

stop_requested = False

def on_stop(signum: int, frame: object) -> None:
    global stop_requested
    stop_requested = True
    signal.alarm(SHUTDOWN_TIMEOUT)    # SIGALRM прийде через N секунд

def on_alarm(signum: int, frame: object) -> None:
    raise ShutdownTimeout

def main(job_seconds: float) -> int:
    signal.signal(signal.SIGTERM, on_stop)
    signal.signal(signal.SIGINT, on_stop)
    signal.signal(signal.SIGALRM, on_alarm)
    pending = [f"job-{i}" for i in range(1, 6)]
    code = 0
    try:
        while pending and not stop_requested:
            print(f"start {pending[0]}", flush=True)
            time.sleep(job_seconds)               # тут справжня робота
            print(f"done {pending.pop(0)}", flush=True)
    except ShutdownTimeout:
        print(f"timeout: {pending[0]} interrupted", flush=True)
        code = 1
    finally:
        signal.alarm(0)
        STATE.write_text(json.dumps(pending))
        print(f"saved {len(pending)} pending, exit {code}", flush=True)
    return code

if __name__ == "__main__":
    sys.exit(main(float(sys.argv[1])))
```

Перший запуск: задача триває 1 с, `SIGTERM` приходить посеред другої. Воркер доробляє `job-2`, не бере `job-3`, пише хвіст черги у файл і виходить з кодом 0. Другий запуск: задача триває 10 с, таймаут 3 с; будильник перериває `job-1`, вона лишається в `pending.json`, а код 1 каже оркестратору, що завершення не було чистим.

```bash
python worker.py 1 & sleep 1.5; kill -TERM $!; wait $!; echo "exit code: $?"; cat pending.json
python worker.py 10 & sleep 0.5; kill -TERM $!; wait $!; echo "exit code: $?"; cat pending.json
```

```text
start job-1
done job-1
start job-2
done job-2
saved 3 pending, exit 0
exit code: 0
["job-3", "job-4", "job-5"]
start job-1
timeout: job-1 interrupted
saved 5 pending, exit 1
exit code: 1
["job-1", "job-2", "job-3", "job-4", "job-5"]
```

> **Під капотом.** `flush=True` у кожному `print` не прикраса. Коли stdout це не термінал, а pipe чи файл (Docker logs, systemd journal), Python буферизує його блоками, і рядки, надруковані перед загибеллю процесу від `SIGKILL`, так і лишаються в буфері. Альтернатива на весь процес: `python -u` або `PYTHONUNBUFFERED=1`, яке ставлять у Dockerfile.

<!-- task: t2 -->

<!-- task: t3 -->

## asyncio: `loop.add_signal_handler` замість `signal.signal`

`asyncio.run` уже робить для `SIGINT` те, що варто робити для обох сигналів: ставить свій обробник, який скасовує головну задачу. `CancelledError` розмотує корутини з їхніми `finally`, і лише потім `asyncio.run` кидає назовні `KeyboardInterrupt`. Для `SIGTERM` нічого такого немає: процес помирає з `SIG_DFL`, як у синхронному прикладі. Скасування як механізм розібране в m5-l05.

```python
# async_int.py
import asyncio

async def main() -> None:
    try:
        print("serving", flush=True)
        await asyncio.sleep(30)
    except asyncio.CancelledError:
        print("main: CancelledError", flush=True)
        raise
    finally:
        print("main: finally", flush=True)

try:
    asyncio.run(main())
except KeyboardInterrupt:
    print("asyncio.run raised KeyboardInterrupt")
```

```text
# SIGINT:
serving
main: CancelledError
main: finally
asyncio.run raised KeyboardInterrupt
[returncode=0]
# SIGTERM:
serving
[returncode=-15]
```

Спокуса поставити `signal.signal(SIGTERM, ...)` і в обробнику викликати `stop.set()` на `asyncio.Event` впирається в те, як спить event loop. Коли задач немає, цикл стоїть у `select()` до найближчого таймера. Python-обробник сигналу виконається, `stop.set()` запланує пробудження очікувача, але сам цикл про це не дізнається, доки `select()` не повернеться з іншої причини. Нижче сигнал прийшов на 0.5 с, а `stop.wait()` повернувся лише на 3.0 с, коли спрацював таймер `asyncio.timeout`; без таймера процес висів би до наступної події.

```python
# async_bad.py: SIGTERM приходить через 0.5 с
import asyncio
import signal
import time

async def main() -> None:
    stop = asyncio.Event()
    signal.signal(signal.SIGTERM, lambda signum, frame: stop.set())
    t0 = time.monotonic()
    try:
        async with asyncio.timeout(3):
            await stop.wait()
        print(f"stop seen after {time.monotonic() - t0:.1f}s")
    except TimeoutError:
        print(f"wait() timed out after {time.monotonic() - t0:.1f}s")

asyncio.run(main())
```

```text
stop seen after 3.0s
```

`loop.add_signal_handler(sig, callback)` реєструє сигнал через wakeup fd: C-обробник пише байт у сокет, який слухає той самий `select()`, цикл одразу прокидається і викликає `callback` як звичайний колбек циклу, а не між довільними байткодами. Тому в ньому безпечно робити `stop.set()` чи `task.cancel()`. Той самий сценарій, той самий сигнал на 0.5 с:

```python
# async_good.py
import asyncio
import signal
import time

async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, stop.set)
    t0 = time.monotonic()
    async with asyncio.timeout(3):
        await stop.wait()
    print(f"stop seen after {time.monotonic() - t0:.1f}s")

asyncio.run(main())
```

```text
stop seen after 0.5s
```

> **Пастка.** `add_signal_handler` існує лише на Unix-циклі; на Windows він кидає `NotImplementedError`. Для капстоуну це не проблема, бо воркер живе в Linux-контейнері, але локальна розробка на Windows потребує запасного варіанту через `signal.signal` і `loop.call_soon_threadsafe`.

<!-- task: t4 -->

## `atexit`, `finally` і хто не дочекається очищення

`atexit.register(fn)` це найближче до `process.on("exit")`: функції викликаються при штатному завершенні інтерпретатора, тобто після кінця скрипта, `sys.exit` і необробленого винятку. Не викликаються вони, коли інтерпретатор не завершується штатно: `os._exit(code)` (виходить негайно, навіть без `finally`; його викликають у дочірньому процесі після `fork`), `SIGKILL`, і `SIGTERM` без обробника, який ви бачили вище. Аналога `beforeExit` (подія "черга порожня, можна запланувати ще") у Python немає зовсім.

```python
# atexit_demo.py
import atexit
import os
import sys

@atexit.register
def cleanup() -> None:
    print("atexit: cleanup", flush=True)

mode = sys.argv[1]
print("mode:", mode, flush=True)
try:
    if mode == "exit":
        sys.exit(3)
    elif mode == "raise":
        raise RuntimeError("boom")
    elif mode == "_exit":
        os._exit(3)
finally:
    print("finally", flush=True)
```

```text
mode: exit
finally
atexit: cleanup
exit code: 3
mode: raise
finally
atexit: cleanup
exit code: 1
mode: _exit
exit code: 3
```

`atexit` глобальний і відкладений: він не знає, які ресурси ще відкриті, і спрацьовує один раз у кінці процесу. Контекстний менеджер (m4-l07) прив'язує очищення до блоку, де ресурс живе, і працює на кожному виході з нього, включно з тим, що зробить ваш обробник `SIGTERM`. Тому в коді воркера все очищення пишеться через `with` і `finally`, а `atexit` лишається для глобального, на кшталт "скинути буфер логів". Від `SIGKILL` не захищає ніщо; захист від нього це дизайн, у якому незавершена задача після рестарту знову опиняється в черзі (розділ про капстоун нижче).

<!-- task: q4 -->

Остання ланка ланцюжка це Docker. `docker stop` шле `SIGTERM` процесу з PID 1 у контейнері, чекає 10 секунд (`--stop-timeout`, `stop_grace_period` у compose) і шле `SIGKILL`. Сигнал отримає Python, лише якщо Python і є PID 1: exec-форма `CMD ["python", "-m", "formbuilder.worker"]` або `exec python ...` в останньому рядку entrypoint-скрипта. Shell-форма `CMD python worker.py` чи `entrypoint.sh` без `exec` роблять PID 1 shell-ом, і той сигнал далі не передає. Додатково ядро Linux не застосовує дію за замовчуванням до PID 1: Python як PID 1 без власного обробника `SIGTERM` його просто ігнорує, і контейнер щоразу чекає повні 10 секунд до `SIGKILL`. `tini` (або `docker run --init`) це мінімальний init, який стає PID 1, пересилає сигнали дитині й прибирає зомбі-процеси. Docker детально в m7-l07; тут те саме видно локально на скрипті-обгортці.

```bash
# entrypoint.sh                         # entrypoint_exec.sh
#!/bin/sh                               #!/bin/sh
echo "entrypoint: preparing"            echo "entrypoint: preparing"
python worker.py 1                      exec python worker.py 1
```

```text
=== ./entrypoint.sh & sleep 1.5; kill -TERM $!
entrypoint: preparing
start job-1
done job-1
start job-2
exit code: 143
done job-2
start job-3
done job-3
start job-4
done job-4
start job-5
done job-5
saved 0 pending, exit 0
=== ./entrypoint_exec.sh & sleep 1.5; kill -TERM $!
entrypoint: preparing
start job-1
done job-1
saved 4 pending, exit 0
exit code: 0
```

Без `exec` сигнал убив shell (143), а Python лишився сиротою і доробив усі п'ять задач, нічого не знаючи про зупинку; у контейнері його за 10 секунд убив би `SIGKILL`. З `exec` shell замінився на Python, той самий PID отримав `SIGTERM`, і воркер завершився коректно.

## Для капстоуну

Воркер генерації з m5-l05 тепер отримує обробку `SIGTERM`. Вимоги: після сигналу не брати нові задачі з черги; дочекатися тих, що в роботі, але не довше 10 секунд; те, що не встигло, і те, що ніхто не брав, повернути в чергу; вийти з кодом 0. Сховище поки фейкове з тим самим інтерфейсом, який у m6-l08 реалізує SQLite (`requeue` там стане `UPDATE jobs SET status = 'pending'`).

```python
# gen_worker.py
import asyncio
import signal
import time

SHUTDOWN_TIMEOUT = 10.0
T0 = time.monotonic()

def log(msg: str) -> None:
    print(f"[{time.monotonic() - T0:4.1f}s] {msg}", flush=True)

class MemoryJobStore:
    """Фейк сховища. У m6-l08 той самий інтерфейс реалізує SQLite."""

    def __init__(self, jobs: list[tuple[str, float]]) -> None:
        self.pending = list(jobs)
        self.done: list[str] = []
        self.requeued: list[str] = []

    def mark_done(self, job_id: str) -> None:
        self.done.append(job_id)

    def requeue(self, job_id: str) -> None:
        self.requeued.append(job_id)

async def worker(
    name: str,
    queue: asyncio.Queue[tuple[str, float]],
    store: MemoryJobStore,
    stop: asyncio.Event,
    current: dict[str, str | None],
) -> None:
    while not stop.is_set():                  # після SIGTERM нову задачу не беремо
        job_id, seconds = await queue.get()
        current[name] = job_id
        try:
            log(f"{name} start {job_id}")
            await asyncio.sleep(seconds)      # рендер
            store.mark_done(job_id)
            log(f"{name} done {job_id}")
        except asyncio.CancelledError:
            store.requeue(job_id)             # не встигли: назад у чергу
            log(f"{name} requeue {job_id}")
            raise
        finally:
            current[name] = None
            queue.task_done()

async def shutdown(
    workers: dict[str, asyncio.Task[None]],
    current: dict[str, str | None],
    queue: asyncio.Queue[tuple[str, float]],
    store: MemoryJobStore,
) -> None:
    for name, task in workers.items():
        if current[name] is None:             # простоює на queue.get(): втрачати нічого
            task.cancel()
    _, late = await asyncio.wait(workers.values(), timeout=SHUTDOWN_TIMEOUT)
    for task in late:                         # не вклались у таймаут
        task.cancel()
    await asyncio.gather(*late, return_exceptions=True)
    while not queue.empty():                  # ніхто не брав
        job_id, _ = queue.get_nowait()
        store.requeue(job_id)

async def main() -> None:
    store = MemoryJobStore([("j1", 0.4), ("j2", 30.0), ("j3", 3.0), ("j4", 1.0), ("j5", 1.0)])
    queue: asyncio.Queue[tuple[str, float]] = asyncio.Queue()
    for job in store.pending:
        queue.put_nowait(job)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    names = ("w0", "w1")
    current: dict[str, str | None] = dict.fromkeys(names)
    async with asyncio.TaskGroup() as tg:
        workers = {n: tg.create_task(worker(n, queue, store, stop, current)) for n in names}
        await stop.wait()
        log(f"SIGTERM, in flight: {[j for j in current.values() if j]}")
        await shutdown(workers, current, queue, store)
    log(f"done={store.done} requeued={store.requeued}")

if __name__ == "__main__":
    asyncio.run(main())
```

```bash
python gen_worker.py & sleep 1; kill -TERM $!; wait $!; echo "exit code: $?"
```

```text
[ 0.0s] w0 start j1
[ 0.0s] w1 start j2
[ 0.4s] w0 done j1
[ 0.4s] w0 start j3
[ 1.0s] SIGTERM, in flight: ['j3', 'j2']
[ 3.4s] w0 done j3
[11.0s] w1 requeue j2
[11.0s] done=['j1', 'j3'] requeued=['j2', 'j4', 'j5']
exit code: 0
```

`j3` вклався в таймаут і завершився, `j2` (30 с) скасовано рівно через 10 с після сигналу і повернуто в чергу через `except CancelledError`, `j4` і `j5` ніхто не брав, вони повернулись при спорожненні черги. Задача, перервана `SIGKILL` (коли ніякий `except` не виконується), лишиться в SQLite зі статусом `running`; тому при старті воркер у m6-l08 повертає в `pending` усе, що "застрягло" в `running`. Порядок: обробник лише ставить `stop`, рішення ухвалює головна корутина, `TaskGroup` гарантує, що з блоку не вийти, доки всі воркери не зупинились.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Асинхронний обробник сигналу, як `process.on("SIGTERM", async () => ...)`.** Python-обробник синхронний; `async def` у `signal.signal` поверне корутину, яку ніхто не запустить, і код просто не виконається (Python ще й попередить `coroutine ... was never awaited`). Правильно: в asyncio `loop.add_signal_handler(SIGTERM, stop.set)`, а роботу робить головна корутина.

   ```python
   loop.add_signal_handler(signal.SIGTERM, stop.set)
   await stop.wait()
   await shutdown(workers, current, queue, store)
   ```

2. **`process.exit()` в обробнику.** `sys.exit` в обробнику кидає `SystemExit` у довільну точку головного коду, і "транзакція" з двох кроків розрізається навпіл (`[-1, 2]` у прикладі вище). Правильно: прапорець в обробнику, вихід з головного циклу.

   ```python
   def on_sigterm(signum: int, frame: object) -> None:
       global stop_requested
       stop_requested = True
   ```

3. **Очікування, що `SIGTERM` за замовчуванням поводиться як Ctrl-C.** Ctrl-C дає `KeyboardInterrupt` з `finally` і `atexit`; `SIGTERM` без обробника вбиває процес миттєво, код 143. Правильно: ставити обробник `SIGTERM` явно в кожному довгоживучому процесі.

   ```python
   signal.signal(signal.SIGTERM, on_stop)
   signal.signal(signal.SIGINT, on_stop)
   ```

4. **`atexit` як `beforeExit` / `on("exit")` для очищення після сигналу.** `atexit` не викликається ні при `SIGTERM` без обробника, ні при `SIGKILL`, ні при `os._exit`. Правильно: `with` і `finally` навколо ресурсу плюс обробник `SIGTERM`, який дає коду дійти до них.

   ```python
   with open_store(path) as store:
       run_worker(store)          # finally/__exit__ виконається після graceful stop
   ```

5. **Шукати `unhandledRejection`.** Глобального обробника "проміс упав без catch" у Python немає: задача з `create_task`, яку ніхто не `await`, лише залогує `Task exception was never retrieved` при збиранні сміття, і процес вийде з кодом 0. Правильно: створювати задачі в `TaskGroup`, тоді виняток дочірньої задачі долетить до батька.

   ```python
   async def main() -> None:
       asyncio.create_task(publish())     # падіння лише в лог, exit code 0
       async with asyncio.TaskGroup() as tg:
           tg.create_task(publish())      # ExceptionGroup з RuntimeError назовні
   ```

6. **Shell між Docker і Python.** `CMD python worker.py` або `entrypoint.sh` без `exec`: сигнал отримує shell, Python доробляє все й гине від `SIGKILL`. Правильно: exec-форма або `exec` у скрипті.

   ```dockerfile
   CMD ["python", "-m", "formbuilder.worker"]
   ```

## Підсумок

- Нове в `sys` для цього модуля: `version_info` як кортеж, `platform`, `executable` (який Python запущено), `getsizeof` поверхневий, `setrecursionlimit` не збільшує стек ОС.
- `os.environ` зберігає лише рядки і успадковується дочірніми процесами; шляхи через `pathlib`, `cpu_count()` не бачить квоту контейнера.
- `SIGINT` у Python стає `KeyboardInterrupt`; `SIGTERM` без обробника вбиває процес без `finally` і `atexit`; `SIGKILL` не перехоплюється взагалі.
- Обробник `signal.signal` виконується в головному потоці між байткодами в довільній точці коду: лише прапорець або `Event.set()`.
- `time.sleep` після обробника досипає до кінця (PEP 475); переривне очікування це `Event.wait(timeout)`.
- Graceful shutdown: не брати нове, доробити поточне, записати стан, код 0; таймаут через `signal.alarm` або `asyncio.wait(timeout=...)` раніше, ніж прийде `SIGKILL`.
- В asyncio лише `loop.add_signal_handler`: він будить цикл, а `signal.signal` ні.
- `atexit` не спрацює при `SIGKILL`, `os._exit` і `SIGTERM` без обробника; очищення пишеться через `with`/`finally`, захист від `SIGKILL` це повторна постановка в чергу.
- У Docker сигнал отримує PID 1: exec-форма `CMD` або `exec` в entrypoint, `tini` для пересилання сигналів.

## Що далі

Наступний урок m6-l08 про `sqlite3`: там `MemoryJobStore` з цього уроку стає `JobStore` на SQLite, а `requeue` і повернення "застряглих" задач при старті стають звичайними `UPDATE`. Обробник `SIGTERM` і таймаут на завершення повернуться в m7-l03, коли воркер житиме в одному процесі з FastAPI, і в m7-l07, де Dockerfile з exec-формою перевіряє, що `docker stop` дає коректне завершення.
