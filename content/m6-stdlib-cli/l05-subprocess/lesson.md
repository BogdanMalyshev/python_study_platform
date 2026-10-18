---
id: m6-l05
module: m6-stdlib-cli
title: "subprocess: виклик зовнішнього процесу"
summary: "Учень викликає зовнішні програми з Python без shell і без ін'єкцій, читає їхній вивід потоком без deadlock, коректно обробляє коди виходу, сигнали й таймаути, запускає Node-рендерер паралельно через asyncio і тестує такий код без справжнього Node."
duration_min: 90
prerequisites: [m6-l04]
---

## `subprocess.run`: список аргументів замість командного рядка

У Node чотири способи запустити процес, і вони різняться двома осями: чи є між вами й програмою shell, і чи буферизується вивід. `exec` іде через shell і віддає весь вивід наприкінці, `execFile` без shell і теж буферизує, `spawn` без shell і дає стріми, `execSync`/`execFileSync` блокують потік. У Python ці осі розкладено так: `subprocess.run` це синхронний `execFile` (без shell, усе буферизовано, потік чекає завершення), `subprocess.Popen` це `spawn`, `asyncio.create_subprocess_exec` це `spawn` з `await`. Shell вмикається одним прапорцем `shell=True` у будь-якій з них.

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const { stdout } = await run("node", ["render.js", "config.json"], { timeout: 10_000 });
// ненульовий код виходу -> reject, в err є code і stderr
```

```python
import subprocess

result = subprocess.run(["node", "render.js", "config.json"], capture_output=True, text=True, timeout=10)
# ненульовий код виходу -> нічого не кидає, лише result.returncode != 0
```

Розходяться вони в трьох місцях. `run` блокує потік, поки дочірній процес не завершиться: event loop тут немає, і це звичайна поведінка синхронного Python. Ненульовий код виходу за замовчуванням не є помилкою. І без `capture_output` вивід не захоплюється взагалі: дочірній процес успадковує stdout і stderr батька й пише прямо в термінал, як `spawn` з `stdio: "inherit"`.

```python
import subprocess

result = subprocess.run(["node", "-e", "console.log('hello from node')"])
print(result)
print(result.returncode, result.stdout)
```

```text
hello from node
CompletedProcess(args=['node', '-e', "console.log('hello from node')"], returncode=0)
0 None
```

Результат `run` це об'єкт `CompletedProcess` (офіційна назва класу з документації): `args`, `returncode`, `stdout`, `stderr`, нічого більше. `capture_output=True` підключає до дочірнього процесу два пайпи й збирає з них усе. Без `text=True` ви отримуєте `bytes`, бо процес віддає байти, і Python не вгадує кодування за вас; з `text=True` байти декодуються в `str`.

```python
import subprocess

cmd = ["node", "-e", "console.log('out'); console.error('err')"]
raw = subprocess.run(cmd, capture_output=True)
print(raw.stdout, raw.stderr)

done = subprocess.run(cmd, capture_output=True, text=True)
print(repr(done.stdout), repr(done.stderr))
```

```text
b'out\n' b'err\n'
'out\n' 'err\n'
```

Чому список. Кожен елемент списку стає рівно одним елементом `argv` дочірнього процесу: Python передає список системному виклику запуску програми (`posix_spawn` або `fork` + `exec` на POSIX), і жоден shell не розбирає його на слова, не розкриває `$HOME`, не бачить `;`. Пробіли, лапки й крапки з комою в даних лишаються даними.

```python
import subprocess

title = 'Contact form; rm -rf ~ "$HOME"'
result = subprocess.run(
    ["node", "-e", "console.log(JSON.stringify(process.argv.slice(1)))", title, "--minify"],
    capture_output=True, text=True,
)
print(result.stdout, end="")
```

```text
["Contact form; rm -rf ~ \"$HOME\"","--minify"]
```

`check=True` перетворює ненульовий код на виняток `CalledProcessError`, у якому лежать `returncode`, `cmd`, `stdout` і `stderr`. Без нього падіння рендерера виглядає як успіх з порожнім виводом.

```python
import subprocess

cmd = ["node", "-e", "console.error('render failed: no fields'); process.exit(3)"]

result = subprocess.run(cmd, capture_output=True, text=True)
print("no check:", result.returncode)

try:
    subprocess.run(cmd, capture_output=True, text=True, check=True)
except subprocess.CalledProcessError as e:
    print(e)
    print(e.returncode, repr(e.stderr))
```

```text
no check: 3
Command '['node', '-e', "console.error('render failed: no fields'); process.exit(3)"]' returned non-zero exit status 3.
3 'render failed: no fields\n'
```

> **Пастка.** `execFile` і `execSync` у Node кидають на ненульовому коді, `subprocess.run` ні. Перенесена звичка "якщо не впало, то спрацювало" тут дає мовчазні збої. Або `check=True`, або явна перевірка `returncode` одразу після виклику; третього варіанту немає.

`timeout=` обмежує час у секундах. Коли він минає, `run` сам вбиває дочірній процес через `SIGKILL`, дочитує пайпи, чекає завершення і лише тоді кидає `TimeoutExpired`. Зависла дитина після цього не лишається. `TimeoutExpired` і `CalledProcessError` це сестри, а не батько й син: обидві успадковуються від `SubprocessError`, тож `except CalledProcessError` таймаут не зловить. Дробова частина в повідомленні це залишок таймауту на момент перевірки, вона міняється від запуску до запуску.

```python
import subprocess
import time

t0 = time.monotonic()
try:
    subprocess.run(["node", "-e", "setTimeout(() => console.log('done'), 5000)"], timeout=0.5)
except subprocess.TimeoutExpired as e:
    print(e)
    print(f"{time.monotonic() - t0:.1f}s")
print(subprocess.TimeoutExpired.__mro__[1].__name__, subprocess.CalledProcessError.__mro__[1].__name__)
```

```text
Command '['node', '-e', "setTimeout(() => console.log('done'), 5000)"]' timed out after 0.4999599999282509 seconds
0.5s
SubprocessError SubprocessError
```

`cwd=` задає робочу директорію дитини, `env=` її оточення. `env` замінює оточення повністю, а не доповнює його, і разом з рештою зникає `PATH`. Python шукає виконуваний файл саме за `PATH` з переданого `env`, тож `node` раптом "не знайдено".

```python
import os
import subprocess

script = "console.log(process.cwd(), process.env.RENDER_MODE, 'HOME' in process.env)"
result = subprocess.run(
    ["node", "-e", script],
    cwd="/usr",
    env={**os.environ, "RENDER_MODE": "static"},
    capture_output=True, text=True,
)
print(result.stdout, end="")

try:
    subprocess.run(["node", "-e", script], env={"RENDER_MODE": "static"})
except FileNotFoundError as e:
    print("FileNotFoundError:", e)
```

```text
/usr static true
FileNotFoundError: [Errno 2] No such file or directory: 'node'
```

> **JS-аналог.** У `spawn` опція `env` поводиться так само, і там теж пишуть `{ ...process.env, RENDER_MODE: "static" }`. Тут `{**os.environ, "RENDER_MODE": "static"}` з тієї ж причини.

У браузері процесів немає, і `subprocess.run` у Pyodide кидає `OSError: [Errno 138] emscripten does not support processes.`. Але `CompletedProcess` і винятки це звичайні класи, і з ними можна працювати без жодного процесу. На цьому тримаються браузерні завдання уроку та тести з моками наприкінці.

```python live
import subprocess

done = subprocess.CompletedProcess(
    args=["node", "render.js"], returncode=2, stdout="", stderr="config.fields must be an array\n",
)
print(done)
try:
    done.check_returncode()
except subprocess.CalledProcessError as e:
    print(type(e).__name__, "|", e)
    print(repr(e.stderr))
print(issubclass(subprocess.CalledProcessError, subprocess.SubprocessError))
print(issubclass(subprocess.TimeoutExpired, subprocess.CalledProcessError))
```

```text
CompletedProcess(args=['node', 'render.js'], returncode=2, stdout='', stderr='config.fields must be an array\n')
CalledProcessError | Command '['node', 'render.js']' returned non-zero exit status 2.
'config.fields must be an array\n'
True
False
```

<!-- task: t1 -->

## `shell=True`, ін'єкція і `shlex`

Рядок замість списку без `shell=True` не розбивається на слова. На POSIX весь рядок вважається іменем програми, і Python шукає в `PATH` файл, що називається буквально `node --version`.

```python
import subprocess

try:
    subprocess.run("node --version")
except FileNotFoundError as e:
    print("FileNotFoundError:", e)
```

```text
FileNotFoundError: [Errno 2] No such file or directory: 'node --version'
```

<!-- task: q1 -->

`shell=True` передає рядок у `/bin/sh -c` (на Windows у `cmd.exe /c`), і далі все робить shell: пайпи `|`, glob `*.json`, перенаправлення `>`, `&&`, розкриття змінних. Тому він потрібен рівно тоді, коли вам потрібна мова shell, а не запуск однієї програми. Список без shell glob не розкриває: `ls` отримує буквальний аргумент `*.json`.

```python
import subprocess

result = subprocess.run("ls *.json | wc -l", shell=True, cwd="work", capture_output=True, text=True)
print(repr(result.stdout.strip()))

result = subprocess.run(["ls", "*.json"], cwd="work", capture_output=True, text=True)
print(result.returncode, result.stderr, end="")
```

```text
'2'
1 ls: *.json: No such file or directory
```

Ціна shell у тому, що будь-які дані, вставлені в рядок, стають кодом. Це ін'єкція команд (OS command injection, усталений термін безпеки, так його називає OWASP): ім'я файлу з форми закінчує одну команду крапкою з комою й починає другу. `shlex.quote` загортає значення в одинарні лапки так, що shell бачить його одним словом.

```python
import os
import shlex
import subprocess

name = "a.json; echo INJECTED > pwned.txt"   # прийшло з форми

subprocess.run(f"cat {name}", shell=True, cwd="work")
print("pwned.txt exists:", os.path.exists("work/pwned.txt"))
os.remove("work/pwned.txt")

subprocess.run(f"cat {shlex.quote(name)}", shell=True, cwd="work")
print("pwned.txt exists:", os.path.exists("work/pwned.txt"))
print(f"cat {shlex.quote(name)}")
```

```text
{}
pwned.txt exists: True
cat: a.json; echo INJECTED > pwned.txt: No such file or directory
pwned.txt exists: False
cat 'a.json; echo INJECTED > pwned.txt'
```

> **Пастка.** `shlex.quote` екранує лише для POSIX `sh`. Для `cmd.exe` на Windows правила інші, і `quote` там не захищає. Надійний захист один для всіх платформ: список аргументів без shell. `shell=True` лишайте для рядків, які повністю написали ви, а не користувач.

`shlex` корисний і без shell. `shlex.split` розбирає командний рядок за правилами `sh` (лапки, екранування пробілу), і це правильний спосіб перетворити рядок з конфігу (`RENDER_CMD="node render.js --title 'Contact form'"`) на список для `run`. Оператори shell він не розуміє: `|` і `&&` стають звичайними словами, і без shell програма отримає їх як аргументи. `shlex.join` робить зворотне і потрібен для логів: команду з лога можна скопіювати в термінал, і вона виконається з тими самими аргументами.

```python live
import shlex

print(shlex.split('node render.js --title "Contact form" --out=dist/my\\ page'))
print(shlex.split("echo a | grep b && rm -rf ~"))

argv = ["node", "render.js", "--title", "Contact form; rm -rf ~"]
print(shlex.join(argv))
print(shlex.quote("it's"))
print(shlex.split(shlex.join(argv)) == argv)
```

```text
['node', 'render.js', '--title', 'Contact form', '--out=dist/my page']
['echo', 'a', '|', 'grep', 'b', '&&', 'rm', '-rf', '~']
node render.js --title 'Contact form; rm -rf ~'
'it'"'"'s'
True
```

Пайп між двома програмами shell не потребує. Якщо вивід першої невеликий, простіше прочитати його й передати другій через `input=`. Якщо потрібен справжній потік, де обидва процеси працюють одночасно, це два `Popen`: stdout першого стає stdin другого. Рядок `p1.stdout.close()` у батька обов'язковий: поки батько тримає свою копію кінця пайпа, перший процес не дізнається, що читач зник, і не отримає `SIGPIPE`.

```python
import subprocess

producer = ["node", "-e", "for (const f of ['phone', 'email', 'age', 'email']) console.log(f)"]

# варіант 1: буферизовано, через input=
first = subprocess.run(producer, capture_output=True, text=True, check=True)
second = subprocess.run(["sort", "-u"], input=first.stdout, capture_output=True, text=True, check=True)
print(second.stdout.split())

# варіант 2: справжній пайп, процеси працюють одночасно
p1 = subprocess.Popen(producer, stdout=subprocess.PIPE)
p2 = subprocess.Popen(["sort", "-u"], stdin=p1.stdout, stdout=subprocess.PIPE, text=True)
p1.stdout.close()          # тепер кінець пайпа тримає лише p2
out, _ = p2.communicate()
print(out.split(), p1.wait(), p2.returncode)
```

```text
['age', 'email', 'phone']
['age', 'email', 'phone'] 0 0
```

<!-- task: t2 -->

## `Popen`: стрімінг виводу і deadlock

`Popen` запускає процес і повертається одразу, як `spawn`. Різниця в тому, що `proc.stdout` тут не EventEmitter, а файловий об'єкт: його читають, а не підписуються на нього.

```ts
const child = spawn("node", ["build.js"]);
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => console.log("chunk:", chunk)); // шматки довільного розміру
child.on("close", (code) => console.log("exit", code));
```

```python
proc = subprocess.Popen(["node", "build.js"], stdout=subprocess.PIPE, text=True)
for line in proc.stdout:          # рядки; потік чекає на кожен наступний
    print("line:", line.rstrip())
print("exit", proc.wait())
```

У Node `data` приносить шматки, нарізані як випало, і рядки ви збираєте самі або через `readline`. У Python ітерація по файлу одразу дає рядки, але цикл блокує потік: поки дочірній процес мовчить, ваш код стоїть на `for`. Для кількох процесів одночасно потрібен asyncio, він далі в уроці.

```python
import subprocess
import time

script = """
let step = 0;
const timer = setInterval(() => {
  step += 1;
  console.log(`progress ${step * 25}%`);
  if (step === 4) clearInterval(timer);
}, 300);
"""
t0 = time.monotonic()
proc = subprocess.Popen(["node", "-e", script], stdout=subprocess.PIPE, text=True)
print(f"[{time.monotonic() - t0:.1f}s] spawned, returncode={proc.returncode}")
for line in proc.stdout:
    print(f"[{time.monotonic() - t0:.1f}s] {line.rstrip()}")
print("exit:", proc.wait())
```

```text
[0.0s] spawned, returncode=None
[0.3s] progress 25%
[0.6s] progress 50%
[0.9s] progress 75%
[1.2s] progress 100%
exit: 0
```

> **Пастка.** Якщо дочірній процес теж на Python, рядки прийдуть усі разом наприкінці. Коли stdout це пайп, а не термінал, Python буферизує вивід блоками по кілька кілобайт, і `print` нічого не відправляє до заповнення буфера або виходу. Node так не робить, тому звідти цієї проблеми ви не знаєте. Лікується прапорцем `-u`, `print(..., flush=True)` у дитині або `PYTHONUNBUFFERED=1` в її `env`.

```python
import subprocess
import sys
import time

child = "import time\nfor i in range(3):\n    print(f'step {i}')\n    time.sleep(0.3)"

for flags in ([], ["-u"]):
    t0 = time.monotonic()
    proc = subprocess.Popen([sys.executable, *flags, "-c", child], stdout=subprocess.PIPE, text=True)
    for line in proc.stdout:
        print(f"{flags} [{time.monotonic() - t0:.1f}s] {line.rstrip()}")
    proc.wait()
```

```text
[] [0.9s] step 0
[] [0.9s] step 1
[] [0.9s] step 2
['-u'] [0.0s] step 0
['-u'] [0.3s] step 1
['-u'] [0.6s] step 2
```

`stderr=subprocess.STDOUT` зливає stderr у той самий пайп, що й stdout: для логу збірки, де попередження мають стояти між рядками прогресу, це те, що треба. Окремого `proc.stderr` після цього немає.

```python
import subprocess

script = "console.log('rendering'); console.error('warn: field without label'); console.log('done')"
proc = subprocess.Popen(
    ["node", "-e", script],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
)
for line in proc.stdout:
    print("log:", line.rstrip())
print(proc.wait(), proc.stderr)
```

```text
log: rendering
log: warn: field without label
log: done
0 None
```

Тепер про deadlock (взаємне блокування, загальний термін, не специфічний для Python). Пайп це буфер у ядрі обмеженого розміру, на Linux 64 KiB. Коли він заповнений, дочірній процес блокується на `write` і чекає, поки хтось прочитає. Якщо батько в цей момент чекає завершення дитини через `wait()` і нічого не читає, обидва чекають одне одного вічно. Те саме стається, коли батько читає до кінця stdout, а дитина застрягла на переповненому stderr. У прикладі `wait` має таймаут, інакше він би просто не повернувся.

```python
import subprocess

big = "process.stdout.write('x'.repeat(1_000_000)); console.error('finished')"

proc = subprocess.Popen(["node", "-e", big], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    proc.wait(timeout=2)                  # нікого не читаємо
except subprocess.TimeoutExpired:
    print("wait(): child is still alive, returncode =", proc.returncode)
    proc.kill()
    proc.communicate()

proc = subprocess.Popen(["node", "-e", big], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
out, err = proc.communicate(timeout=10)
print("communicate():", len(out), err, proc.returncode)
```

```text
wait(): child is still alive, returncode = None
communicate(): 1000000 b'finished\n' 0
```

`communicate(input=None, timeout=None)` пише `input` у stdin і закриває його, одночасно читає stdout і stderr до кінця (на POSIX через `selectors`, на Windows через потоки), потім чекає завершення і повертає пару `(stdout, stderr)`. Саме тому він не блокується: жоден пайп не лишається без читача. `run` усередині це `Popen` плюс `communicate`. У Node такого deadlock не буває, бо libuv постійно вичитує пайпи у фоні циклу подій, і дані накопичуються в пам'яті вашого процесу, а не в буфері ядра.

> **Під капотом.** Правило з документації: якщо хоча б два з `stdin`, `stdout`, `stderr` це `PIPE`, працюйте через `communicate`, а не через `wait` плюс `read`. Виняток один: читання одного злитого потоку рядок за рядком, як вище зі `stderr=STDOUT`. Там читач завжди є, а `wait` викликається вже після кінця потоку.

<!-- task: q2 -->

## Коди завершення, сигнали і graceful stop

Код виходу від 0 до 255 процес задає сам через `exit`. Якщо процес убив сигнал, коду виходу немає, і на POSIX Python кодує це від'ємним числом: `-15` означає "вбитий `SIGTERM`", `-9` "вбитий `SIGKILL`". У Node та сама інформація приходить у подію `exit` двома полями, `(code, signal)` з `code === null`. Shell записує це інакше, як `128 + N`: `143` у `$?` теж означає `SIGTERM`.

```python
import signal
import subprocess
import time

forever = "setInterval(() => {}, 1000)"

p = subprocess.Popen(["node", "-e", forever])
time.sleep(0.3)
p.terminate()                       # SIGTERM
print("terminate:", p.wait())

p = subprocess.Popen(["node", "-e", forever])
time.sleep(0.3)
p.kill()                            # SIGKILL
rc = p.wait()
print("kill:", rc, signal.Signals(-rc).name)

r = subprocess.run(["sh", "-c", "node -e 'process.kill(process.pid, \"SIGTERM\")'; echo shell saw $?"],
                   capture_output=True, text=True)
print(r.stdout.strip(), "| sh itself:", r.returncode)
```

```text
terminate: -15
kill: -9 SIGKILL
shell saw 143 | sh itself: 0
```

`terminate()` надсилає `SIGTERM`, який процес може перехопити й завершитись чисто. `kill()` надсилає `SIGKILL`, який перехопити не можна. `poll()` повертає код, якщо процес уже завершився, і `None`, якщо ні; `wait(timeout=)` чекає з обмеженням. З цього складається graceful stop (жаргон спільноти для "чемної зупинки"): попросити, дати час, і лише потім вбити. На Windows `terminate` і `kill` це один і той самий `TerminateProcess`, чемного варіанта там немає.

```python
import subprocess
import time

def stop(proc: subprocess.Popen, grace: float = 2.0) -> int:
    """SIGTERM, почекати grace секунд, потім SIGKILL."""
    if proc.poll() is not None:          # уже завершився
        return proc.returncode
    proc.terminate()
    try:
        return proc.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        proc.kill()
        return proc.wait()

polite = """
process.on('SIGTERM', () => { console.log('node: flushing files'); process.exit(0); });
setInterval(() => {}, 1000);
"""
stubborn = "process.on('SIGTERM', () => console.log('node: ignoring SIGTERM')); setInterval(() => {}, 1000);"

for name, script in [("polite", polite), ("stubborn", stubborn)]:
    proc = subprocess.Popen(["node", "-e", script])
    time.sleep(0.3)
    t0 = time.monotonic()
    rc = stop(proc, grace=1.0)
    print(f"{name}: returncode={rc} after {time.monotonic() - t0:.1f}s")
```

```text
node: flushing files
polite: returncode=0 after 0.0s
node: ignoring SIGTERM
stubborn: returncode=-9 after 1.0s
```

`wait()` після `kill()` не формальність. Завершений процес, якого батько не "забрав" через `wait`, лишається в таблиці процесів як зомбі (zombie process, термін POSIX): він нічого не виконує, але займає PID, поки батько не прочитає його код виходу.

> **Пастка.** `with subprocess.Popen(...) as proc:` на виході закриває пайпи й викликає `wait()` без таймауту. Вбивати процес він не вміє. Якщо всередині блоку виник виняток, а дитина не збирається завершуватись, `with` зависне на виході. Контекстний менеджер рятує від зомбі, але не від завислого процесу: для цього `stop()` у `finally`.

Як ваш власний Python-процес реагує на `SIGTERM` від Docker чи systemd, тобто протилежний бік тієї самої історії, детально в m6-l07.

<!-- task: q4 -->

<!-- task: t3 -->

## Кодування, бінарний вивід і пошук виконуваного файлу

`text=True` декодує вивід кодуванням локалі (`locale.getpreferredencoding(False)`). На macOS і Linux це майже завжди UTF-8, на Windows часто `cp1252`, і той самий код там дає кракозябри або `UnicodeDecodeError`. Тому для програм, які пишуть UTF-8, кодування вказують явно: `encoding="utf-8"` (воно саме вмикає текстовий режим, `text=True` поруч не потрібен). `errors=` працює як у `bytes.decode`: `"strict"` кидає виняток на першому битому байті, `"replace"` ставить `�` і йде далі.

```python
import subprocess

latin1 = "process.stdout.write(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]))"   # 'café' у latin-1

try:
    subprocess.run(["node", "-e", latin1], capture_output=True, text=True)
except UnicodeDecodeError as e:
    print("UnicodeDecodeError:", e)

r = subprocess.run(["node", "-e", latin1], capture_output=True, encoding="utf-8", errors="replace")
print(repr(r.stdout))

r = subprocess.run(["node", "-e", latin1], capture_output=True)
print(r.stdout, r.stdout.decode("latin-1"), end="")
```

```text
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xe9 in position 3: invalid continuation byte
'caf�\n'
b'caf\xe9\n' café
```

> **Пастка.** `UnicodeDecodeError` вилітає з `run` уже після того, як процес успішно відпрацював, і результат втрачено разом з винятком. Для stderr чужих програм, де трапляється будь-що, ставте `errors="replace"`: повідомлення про помилку з одним битим байтом краще, ніж виняток замість повідомлення.

Без `text` і `encoding` обидва боки працюють з `bytes`: і вивід, і `input=`. Так читають усе, що не є текстом: PNG зі скриншотера, PDF, gzip. Передати `str` у бінарний stdin не вийде.

```python
import subprocess

html = "<form>" + "<input>" * 1000 + "</form>"
r = subprocess.run(["gzip", "-n", "-c"], input=html.encode(), capture_output=True, check=True)
print(type(r.stdout).__name__, r.stdout[:2], len(html), "->", len(r.stdout))

try:
    subprocess.run(["gzip", "-c"], input=html, capture_output=True)
except TypeError as e:
    print("TypeError:", e)
```

```text
bytes b'\x1f\x8b' 7013 -> 66
TypeError: memoryview: a bytes-like object is required, not 'str'
```

Коли вивід читається потоком, з'являється ще одна проблема: межа шматка може пройти посеред багатобайтової літери. Декодувати кожен шматок окремо означає зіпсувати кирилицю на стиках. Інкрементальний декодер з `codecs` тримає незавершений хвіст до наступного шматка. Саме так усередині працює текстовий режим `Popen`.

```python live
import codecs

print("café Київ".encode())

latin = b"caf\xe9\n"                      # 'café' у latin-1, не UTF-8
for errors in ("strict", "replace", "backslashreplace"):
    try:
        print(errors, repr(latin.decode("utf-8", errors=errors)))
    except UnicodeDecodeError as e:
        print(errors, "->", e)

kyiv = "Київ".encode()
first, second = kyiv[:3], kyiv[3:]       # чанк обірвався посеред літери
print(repr(first.decode("utf-8", errors="replace") + second.decode("utf-8", errors="replace")))
decoder = codecs.getincrementaldecoder("utf-8")()
print(repr(decoder.decode(first) + decoder.decode(second, final=True)))
```

```text
b'caf\xc3\xa9 \xd0\x9a\xd0\xb8\xd1\x97\xd0\xb2'
strict -> 'utf-8' codec can't decode byte 0xe9 in position 3: invalid continuation byte
replace 'caf�\n'
backslashreplace 'caf\\xe9\n'
'К��їв'
'Київ'
```

Виконуваний файл без шляху Python шукає за `PATH` сам, ще до запуску. Якщо не знайшов, `run` і `Popen` кидають `FileNotFoundError` синхронно; у Node `spawn` в цьому випадку повертає дитину і пізніше емітить подію `error` з `ENOENT`. `shutil.which` робить той самий пошук заздалегідь і повертає абсолютний шлях або `None`, що зручно для перевірки на старті сервісу. На Windows він ще й враховує `PATHEXT`, тож знаходить `npx.cmd` за іменем `npx`, а `run(["npx", ...])` без цього шляху його не знайде.

```python
import shutil
import subprocess
from pathlib import Path

node = shutil.which("node")
print(Path(node).name, Path(node).is_absolute())
print(shutil.which("definitely-not-a-renderer"))

try:
    subprocess.run(["definitely-not-a-renderer", "config.json"])
except FileNotFoundError as e:
    print(type(e).__name__, e.errno, e.filename)
```

```text
node True
None
FileNotFoundError 2 definitely-not-a-renderer
```

<!-- task: t4 -->

## Node з Python і Python з Python

Протокол між Python і Node-рендерером варто зафіксувати один раз. Конфіг іде JSON-ом у stdin, HTML повертається у stdout, діагностика пишеться в stderr, а код виходу означає статус: `0` успіх, `2` невалідний конфіг, `1` збій самого рендерера. Stdin кращий за `node render.js config.json` з трьох причин: не потрібен тимчасовий файл, немає обмеження на довжину командного рядка (`ARG_MAX`), і конфіг не потрапляє в список процесів `ps`, де його бачать усі користувачі машини.

```js
// render.js: JSON-конфіг зі stdin, HTML у stdout, помилки в stderr
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let config;
  try {
    config = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (err) {
    console.error(`invalid JSON: ${err.message}`);
    process.exitCode = 2;
    return;
  }
  if (!Array.isArray(config.fields)) {
    console.error("config.fields must be an array");
    process.exitCode = 2;
    return;
  }
  const delay = config.delayMs ?? 0;              // імітація важкого рендера
  setTimeout(() => {
    const fields = config.fields
      .map((f) => `  <label>${f.label}<input name="${f.id}"></label>`)
      .join("\n");
    process.stdout.write(`<form id="${config.id}">\n${fields}\n</form>\n`);
  }, delay);
});
```

Python-бік перетворює три різні способи впасти (немає Node, завис, повернув помилку) на один виняток предметної області. Тоді код, що викликає рендер, не знає нічого про `subprocess`.

```python
import json
import subprocess

class RenderError(Exception):
    pass

def render(config: dict, timeout: float = 10.0) -> str:
    try:
        result = subprocess.run(
            ["node", "render.js"],
            input=json.dumps(config),
            capture_output=True,
            encoding="utf-8",
            timeout=timeout,
        )
    except FileNotFoundError as e:
        raise RenderError(f"renderer not installed: {e.filename}") from e
    except subprocess.TimeoutExpired as e:
        raise RenderError(f"renderer timed out after {timeout}s") from e
    if result.returncode != 0:
        raise RenderError(f"exit {result.returncode}: {result.stderr.strip()}")
    return result.stdout

config = {"id": "contact", "fields": [{"id": "email", "label": "Пошта"}, {"id": "phone", "label": "Телефон"}]}
print(render(config), end="")

for bad in [{"id": "broken"}, {"id": "slow", "fields": [], "delayMs": 3000}]:
    try:
        render(bad, timeout=1.0)
    except RenderError as e:
        print("RenderError:", e)
```

```text
<form id="contact">
  <label>Пошта<input name="email"></label>
  <label>Телефон<input name="phone"></label>
</form>
RenderError: exit 2: config.fields must be an array
RenderError: renderer timed out after 1.0s
```

> **Пастка.** У рендерері стоїть `process.exitCode = 2`, а не `process.exit(2)`, і це не стиль. На macOS запис у пайп у Node асинхронний, і `process.exit()` одразу після великого `stdout.write` обрізає вивід. Перевірено на мегабайті тексту: з `process.exit(0)` Python отримав 65536 байт з 1000000 у всіх п'яти запусках, з `process.exitCode = 0` усі 1000000. Python побачить код 0 і обрізаний HTML без жодної помилки.

Python з Python запускають через `sys.executable`, а не через `"python"`. `sys.executable` це абсолютний шлях до інтерпретатора, який виконує поточний код, разом з його venv і встановленими пакетами. `"python"` шукається за `PATH`: на цій машині його немає взагалі, а `python3` з `PATH` це системний інтерпретатор без pydantic. `-m` запускає модуль за іменем, як `npx` запускає бінарник пакета, а `-u` вимикає буферизацію для стрімінгу.

```python
import shutil
import subprocess
import sys

print(shutil.which("python"), shutil.which("python3"))

has_pydantic = "import importlib.util; print(importlib.util.find_spec('pydantic') is not None)"
for exe in [sys.executable, "python3"]:
    r = subprocess.run([exe, "-c", has_pydantic], capture_output=True, text=True)
    print("sys.executable" if exe == sys.executable else exe, "->", r.stdout.strip())

r = subprocess.run(
    [sys.executable, "-m", "json.tool", "--compact"],
    input='{"id": "contact",   "fields": [ ]}',
    capture_output=True, text=True, check=True,
)
print(r.stdout, end="")
```

```text
None /usr/bin/python3
sys.executable -> True
python3 -> False
{"id":"contact","fields":[]}
```

Свій Python-код через `subprocess` запускають лише тоді, коли потрібна ізоляція: щоб падіння, витік пам'яті чи зависання дитини не зачепили батька, і щоб її можна було гарантовано вбити по таймауту. В інших випадках функцію просто імпортують і викликають, а для паралельних обчислень беруть `ProcessPoolExecutor` (m5-l08).

## Асинхронно: `asyncio.create_subprocess_exec`

`subprocess.run` усередині `async def` блокує event loop на весь час роботи дитини: це той самий синхронний виклик, що й `time.sleep` з m5-l05. Три рендери "паралельно" через `TaskGroup` виконуються по черзі (час у виводі з одного запуску, другий рядок коливається між 0.3 і 0.4 с через старт Node). `asyncio.create_subprocess_exec` реєструє пайпи дитини в циклі подій, і поки Node працює, цикл обслуговує інші задачі.

```python
import asyncio
import json
import subprocess
import time

configs = [{"id": f"form{i}", "fields": [], "delayMs": 300} for i in range(3)]

async def render_blocking(config: dict) -> str:
    r = subprocess.run(["node", "render.js"], input=json.dumps(config), capture_output=True, text=True)
    return r.stdout

async def render_async(config: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "node", "render.js",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
    )
    out, _ = await proc.communicate(json.dumps(config).encode())
    return out.decode()

async def main() -> None:
    for fn in (render_blocking, render_async):
        t0 = time.monotonic()
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(fn(c)) for c in configs]
        print(f"{fn.__name__}: {len(tasks)} pages in {time.monotonic() - t0:.1f}s")

asyncio.run(main())
```

```text
render_blocking: 3 pages in 1.0s
render_async: 3 pages in 0.4s
```

```ts
const child = spawn("node", ["render.js"]);
child.stdin.end(JSON.stringify(config));
let html = "";
for await (const chunk of child.stdout) html += chunk;
const [code] = await once(child, "close");
```

```python
proc = await asyncio.create_subprocess_exec("node", "render.js", stdin=PIPE, stdout=PIPE)
out, _ = await proc.communicate(json.dumps(config).encode())
html, code = out.decode(), proc.returncode
```

Розходжень три. Аргументи передаються як `*args`, а не списком, бо сигнатура скопійована з `os.exec*`: список у першому аргументі дає `TypeError`. Запуск це `await`, і відсутній виконуваний файл кидає `FileNotFoundError` прямо там, а не подією. Пайпи в `Process` це `StreamReader`/`StreamWriter` з m5-l06 і завжди байтові, `text=True` тут немає, тож декодування робите ви. `asyncio.create_subprocess_shell(cmd)` це той самий `shell=True` з тими самими ризиками.

```python
import asyncio
import json

async def render(config: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "node", "render.js",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(json.dumps(config).encode())
    if proc.returncode != 0:
        raise RuntimeError(f"exit {proc.returncode}: {stderr.decode().strip()}")
    return stdout.decode()

async def main() -> None:
    print(await render({"id": "c", "fields": [{"id": "email", "label": "Email"}]}), end="")
    try:
        await render({"id": "broken"})
    except RuntimeError as e:
        print("RuntimeError:", e)
    try:
        await asyncio.create_subprocess_exec(["node", "render.js"])
    except TypeError as e:
        print("TypeError:", e)

asyncio.run(main())
```

```text
<form id="c">
  <label>Email<input name="email"></label>
</form>
RuntimeError: exit 2: config.fields must be an array
TypeError: expected str, bytes or os.PathLike object, not list
```

Кожен Node-процес займає десятки мегабайтів пам'яті й ядро CPU, тому сто рендерів одночасно запускати не можна. Обмеження це `asyncio.Semaphore` з m5-l05, той самий `p-limit`. У прикладі не більше двох Node одночасно: `c` стартує лише після завершення `b`, `d` лише після `c`.

```python
import asyncio
import json
import time

async def render(config: dict, sem: asyncio.Semaphore, t0: float) -> str:
    async with sem:
        print(f"[{time.monotonic() - t0:.1f}s] start {config['id']}")
        proc = await asyncio.create_subprocess_exec(
            "node", "render.js",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        )
        out, _ = await proc.communicate(json.dumps(config).encode())
        print(f"[{time.monotonic() - t0:.1f}s] end   {config['id']}")
        return out.decode()

async def main() -> None:
    sem = asyncio.Semaphore(2)                       # не більше двох Node одночасно
    delays = {"a": 600, "b": 200, "c": 200, "d": 600}
    t0 = time.monotonic()
    async with asyncio.TaskGroup() as tg:
        tasks = [
            tg.create_task(render({"id": k, "fields": [], "delayMs": ms}, sem, t0))
            for k, ms in delays.items()
        ]
    print([t.result().split('"')[1] for t in tasks])

asyncio.run(main())
```

```text
[0.0s] start a
[0.0s] start b
[0.2s] end   b
[0.2s] start c
[0.5s] end   c
[0.5s] start d
[0.6s] end   a
[1.1s] end   d
['a', 'b', 'c', 'd']
```

Таймаут ставиться через `asyncio.timeout` навколо `communicate`, і тут головна пастка розділу. Скасування корутини скасовує очікування, а не процес: `TimeoutError` прилетів, а Node працює далі. Він переживе навіть `asyncio.run` і лишиться сиротою після завершення вашого скрипта.

```python
import asyncio
import os

async def main() -> int:
    proc = await asyncio.create_subprocess_exec("node", "-e", "setInterval(() => {}, 1000)")
    try:
        async with asyncio.timeout(0.5):
            await proc.wait()
    except TimeoutError:
        print("timeout, no kill")
    return proc.pid

pid = asyncio.run(main())
os.kill(pid, 0)                      # сигнал 0: лише перевірити, що процес існує
print("child still alive after asyncio.run:", pid > 0)
os.kill(pid, 9)                      # прибрати за собою вручну
```

```text
timeout, no kill
child still alive after asyncio.run: True
```

На відміну від `subprocess.run(timeout=)`, тут убивати треба самому: `proc.kill()` і обов'язково `await proc.wait()`, щоб не лишити зомбі.

```python
import asyncio

async def main() -> None:
    proc = await asyncio.create_subprocess_exec(
        "node", "-e", "setInterval(() => {}, 1000)", stdout=asyncio.subprocess.PIPE,
    )
    try:
        async with asyncio.timeout(0.5):
            await proc.communicate()
    except TimeoutError:
        print("timeout; child returncode =", proc.returncode)   # None: ще живий
        proc.kill()
        await proc.wait()
        print("after kill:", proc.returncode)

asyncio.run(main())
```

```text
timeout; child returncode = None
after kill: -9
```

Стрімінг в asyncio простіший, ніж у синхронному світі: `proc.stdout` це `StreamReader`, а він async-iterable по рядках (`bytes` з `\n` на кінці). Це аналог `readline.createInterface({ input: child.stdout })`, але потік не блокується, і поки один процес мовчить, цикл читає інші.

```python
import asyncio

script = """
let step = 0;
const timer = setInterval(() => {
  step += 1;
  console.log(JSON.stringify({ progress: step * 50 }));
  if (step === 2) clearInterval(timer);
}, 200);
"""

async def main() -> None:
    proc = await asyncio.create_subprocess_exec("node", "-e", script, stdout=asyncio.subprocess.PIPE)
    async for line in proc.stdout:          # StreamReader: async-iterable по рядках, bytes
        print("progress line:", line)
    print("exit:", await proc.wait())

asyncio.run(main())
```

```text
progress line: b'{"progress":50}\n'
progress line: b'{"progress":100}\n'
exit: 0
```

Для воркера генерації це правильний інструмент з кількох причин. Воркер з m5-l05 живе в одному event loop з FastAPI: там же черга задач і WebSocket зі статусами (m7-l04). Блокуючий `run` заморозив би їх усіх на час рендера. Окремі Node-процеси дають справжній паралелізм на кількох ядрах без потоків і без GIL, а скасування задачі (таймаут, помилка сусіда в `TaskGroup`, `SIGTERM` при зупинці) природно перетворюється на `kill` дочірнього процесу.

<!-- task: q3 -->

## Тестування коду з subprocess

Перший рівень тестів не запускає жодного процесу. `subprocess.run` підміняють там, де його шукає ваш модуль (детально в m3-l04), і повертають готовий `CompletedProcess` або задають `side_effect` з винятком. Такий тест перевіряє розгалуження вашого коду: що пішло в argv і stdin, як ненульовий код і таймаут перетворюються на `RenderError`.

```python
# renderer.py
import json
import subprocess

class RenderError(Exception):
    pass

def render(config: dict, cmd: list[str] | None = None, timeout: float = 10.0) -> str:
    argv = cmd or ["node", "render.js"]
    try:
        result = subprocess.run(
            argv, input=json.dumps(config), capture_output=True,
            encoding="utf-8", timeout=timeout,
        )
    except subprocess.TimeoutExpired as e:
        raise RenderError(f"timed out after {timeout}s") from e
    if result.returncode != 0:
        raise RenderError(f"exit {result.returncode}: {result.stderr.strip()}")
    return result.stdout
```

```python
# test_mocked.py
import subprocess

import pytest
from pytest_mock import MockerFixture

import renderer

def test_passes_config_via_stdin(mocker: MockerFixture) -> None:
    run = mocker.patch(
        "renderer.subprocess.run",
        return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="<form>", stderr=""),
    )
    assert renderer.render({"id": "c"}) == "<form>"
    argv = run.call_args.args[0]
    assert argv == ["node", "render.js"]
    assert run.call_args.kwargs["input"] == '{"id": "c"}'

def test_nonzero_exit_becomes_render_error(mocker: MockerFixture) -> None:
    mocker.patch(
        "renderer.subprocess.run",
        return_value=subprocess.CompletedProcess(args=[], returncode=2, stdout="", stderr="bad config\n"),
    )
    with pytest.raises(renderer.RenderError, match="exit 2: bad config"):
        renderer.render({})

def test_timeout(mocker: MockerFixture) -> None:
    mocker.patch(
        "renderer.subprocess.run",
        side_effect=subprocess.TimeoutExpired(cmd=["node"], timeout=10),
    )
    with pytest.raises(renderer.RenderError, match="timed out"):
        renderer.render({})
```

Другий рівень запускає справжній процес, але не справжній рендерер. Fake-скрипт на Python пишеться в `tmp_path` і запускається через `sys.executable`, тож у CI не потрібен Node. Тут працюють справжні пайпи, справжні коди виходу, справжній таймаут з убивством процесу. Щоб це було можливо, argv рендерера має бути параметром (`cmd=` вище), а не константою всередині функції: це та сама інʼєкція залежностей, що й з `Depends` у FastAPI, лише без фреймворку.

```python
# test_fake_script.py
import sys
from pathlib import Path

import pytest

import renderer

FAKE = """
import json, sys, time
config = json.load(sys.stdin)
if config.get("crash"):
    print("TypeError: cannot read 'label'", file=sys.stderr)
    sys.exit(1)
time.sleep(config.get("sleep", 0))
print(f"<form id={config['id']!r}></form>")
"""

@pytest.fixture
def fake_cmd(tmp_path: Path) -> list[str]:
    script = tmp_path / "fake_render.py"
    script.write_text(FAKE)
    return [sys.executable, str(script)]

def test_real_pipes(fake_cmd: list[str]) -> None:
    assert renderer.render({"id": "c"}, cmd=fake_cmd) == "<form id='c'></form>\n"

def test_real_exit_code(fake_cmd: list[str]) -> None:
    with pytest.raises(renderer.RenderError, match="exit 1: TypeError"):
        renderer.render({"id": "c", "crash": True}, cmd=fake_cmd)

def test_real_timeout(fake_cmd: list[str]) -> None:
    with pytest.raises(renderer.RenderError, match="timed out"):
        renderer.render({"id": "c", "sleep": 5}, cmd=fake_cmd, timeout=0.5)
```

```text
$ pytest -q test_mocked.py test_fake_script.py
......                                                                   [100%]
6 passed in 0.57s
```

Рівні ловлять різне. Мок не помітить, що ви забули `encoding` і отримуєте `bytes`, що процес висить у deadlock, або що argv зібрано рядком: мок поверне те, що ви в нього поклали. Fake-скрипт усе це помітить, але не перевірить, що справжній `render.js` дотримується протоколу. Тому в капстоуні буде і те, і те, плюс один інтеграційний тест зі справжнім Node, який пропускається через `pytest.mark.skipif(shutil.which("node") is None, ...)`.

<!-- task: t5 -->

## Для капстоуну

Рендерер у капстоуні це `Protocol` з одним асинхронним методом (m2-l07). Реалізацій дві: `NodeRenderer` викликає зовнішній процес, а запасний рендерер на шаблонах у m7-l06 стане Jinja2; тут на його місці заглушка. `FallbackRenderer` перемикається на запасний лише тоді, коли Node недоступний. Якщо Node є, але впав на конкретному конфігу, це помилка конфігу або рендерера, і ховати її за fallback не можна.

```python
import asyncio
import json
from typing import Protocol

class RenderError(Exception):
    pass

class RendererNotAvailable(RenderError):
    pass

class Renderer(Protocol):
    async def render(self, config: dict) -> str: ...

class NodeRenderer:
    def __init__(self, script: str = "render.js", node: str = "node", timeout: float = 10.0) -> None:
        self.argv = [node, script]
        self.timeout = timeout

    async def render(self, config: dict) -> str:
        try:
            proc = await asyncio.create_subprocess_exec(
                *self.argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as e:
            raise RendererNotAvailable(f"{e.filename} not found") from e
        try:
            async with asyncio.timeout(self.timeout):
                out, err = await proc.communicate(json.dumps(config).encode())
        except TimeoutError:
            raise RenderError(f"timed out after {self.timeout}s") from None
        finally:
            if proc.returncode is None:      # таймаут або скасування ззовні
                proc.kill()
                await proc.wait()
        if proc.returncode != 0:
            tail = err.decode("utf-8", errors="replace").strip().splitlines()[-1:]
            raise RenderError(f"exit {proc.returncode}: {' '.join(tail)}")
        return out.decode("utf-8")

class SimpleRenderer:                         # у m7-l06 тут буде Jinja2
    async def render(self, config: dict) -> str:
        return f"<form id=\"{config['id']}\"><!-- {len(config['fields'])} fields --></form>\n"

class FallbackRenderer:
    def __init__(self, primary: Renderer, fallback: Renderer) -> None:
        self.primary, self.fallback = primary, fallback

    async def render(self, config: dict) -> str:
        try:
            return await self.primary.render(config)
        except RendererNotAvailable as e:
            print(f"warning: {e}, using fallback")
            return await self.fallback.render(config)

async def main() -> None:
    config = {"id": "contact", "fields": [{"id": "email", "label": "Email"}]}
    print(await FallbackRenderer(NodeRenderer(), SimpleRenderer()).render(config), end="")
    print(await FallbackRenderer(NodeRenderer(node="node-missing"), SimpleRenderer()).render(config), end="")
    for bad in [{"id": "x"}, {"id": "slow", "fields": [], "delayMs": 3000}]:
        try:
            await NodeRenderer(timeout=0.5).render(bad)
        except RenderError as e:
            print(f"{type(e).__name__}: {e}")

asyncio.run(main())
```

```text
<form id="contact">
  <label>Email<input name="email"></label>
</form>
warning: node-missing not found, using fallback
<form id="contact"><!-- 1 fields --></form>
RenderError: exit 2: config.fields must be an array
RenderError: timed out after 0.5s
```

`finally` з `kill` стоїть не лише заради таймауту. `CancelledError` теж проходить через нього: коли `TaskGroup` скасовує сусідів після помилки або воркер зупиняється по `SIGTERM` (m6-l07), Node-процес помирає разом із задачею, а не лишається сиротою. З stderr береться лише останній рядок: стек-трейс Node на двадцять рядків не потрібен ні в статусі генерації, ні в WebSocket-повідомленні, а повний stderr іде в лог.

> **Для капстоуну.** Воркер генерації з m5-l05 отримує `Renderer` через конструктор, а не створює `NodeRenderer` сам, тож у тестах воркера туди підставляється fake-рендерер без процесів. Ліміт паралельних рендерів це `asyncio.Semaphore` навколо виклику `render`, а значення ліміту, шлях до `render.js` і таймаут прийдуть з налаштувань у m6-l06.

<!-- task: t6 -->

## Типові помилки JS-розробника

1. **Командний рядок, складений конкатенацією, як у `exec("cmd " + arg)`.** Без `shell=True` це `FileNotFoundError`, з ним ін'єкція. Правильно: список аргументів, кожне значення окремим елементом.

   ```python
   subprocess.run(f"node render.js {path}", shell=True)   # ін'єкція через path
   subprocess.run(["node", "render.js", path])            # path лишається одним аргументом
   ```

2. **Очікування, що ненульовий код кине виняток, як у `execSync`.** `run` повертає `CompletedProcess` з `returncode=3`, і код іде далі з порожнім stdout. Правильно: `check=True` або явна перевірка.

   ```python
   result = subprocess.run(argv, capture_output=True, text=True)
   if result.returncode != 0:
       raise RenderError(result.stderr)
   ```

3. **Підписка на `on("data")` замість читання.** У `Popen` немає подій. `proc.stdout` читають циклом по рядках або забирають цілим через `communicate`. Варіант "`wait()`, потім `read()`" з двома пайпами дає deadlock, щойно вивід перевищить буфер ядра.

   ```python
   out, err = proc.communicate(timeout=30)    # обидва пайпи читаються одночасно
   for line in proc.stdout: ...               # або один злитий потік рядок за рядком
   ```

4. **`spawn` без очікування завершення.** У Node процес, якого ніхто не чекає, однаково буде прибраний рантаймом. У Python процес без `wait()` ніхто не забрав, і він висить зомбі (Python підбирає таких лише принагідно, при наступних запусках `Popen`), а `asyncio.timeout` без `kill()` лишає живу сироту, яка переживе ваш скрипт.

   ```python
   try:
       async with asyncio.timeout(10):
           out, err = await proc.communicate(data)
   finally:
       if proc.returncode is None:
           proc.kill()
           await proc.wait()
   ```

5. **`execSync("...")` з shell за замовчуванням переноситься як `shell=True` скрізь.** У Node `execSync` завжди йде через shell, і до цього звикають. У Python shell потрібен лише для пайпів, glob і перенаправлень, які ви пишете самі; для пайпа між двома програмами є `Popen` зі `stdin=`.

   ```python
   p1 = subprocess.Popen(["node", "list.js"], stdout=subprocess.PIPE)
   p2 = subprocess.Popen(["sort", "-u"], stdin=p1.stdout, stdout=subprocess.PIPE)
   p1.stdout.close()
   ```

6. **`env={"KEY": "value"}` замість доповнення оточення.** Зникає `PATH`, і `node` раптом "не знайдено". Правильно: `{**os.environ, "KEY": "value"}`.

   ```python
   subprocess.run(["node", "render.js"], env={**os.environ, "RENDER_MODE": "static"})
   ```

7. **Список у `create_subprocess_exec`, як у `spawn(cmd, args)`.** Сигнатура приймає аргументи через кому, список дає `TypeError`. Правильно: розпакувати.

   ```python
   await asyncio.create_subprocess_exec(*argv, stdout=asyncio.subprocess.PIPE)
   ```

8. **`"python"` замість `sys.executable` і очікування, що Python-дитина пише рядки одразу, як Node.** `"python"` може не існувати або бути іншим інтерпретатором без ваших пакетів; вивід дитини в пайп буферизується блоками.

   ```python
   subprocess.Popen([sys.executable, "-u", "-m", "formbuilder.worker"], stdout=subprocess.PIPE)
   ```

## Підсумок

- `subprocess.run` це синхронний `execFile`: список аргументів, без shell, повертає `CompletedProcess`; `Popen` це `spawn`; `asyncio.create_subprocess_exec` це `spawn` для event loop.
- Список аргументів передається програмі як є, тому ін'єкції немає. Рядок без `shell=True` вважається іменем програми.
- `shell=True` лише для пайпів, glob і перенаправлень у ваших власних рядках; дані користувача в shell тільки через `shlex.quote`, а краще не туди взагалі. `shlex.split` для рядків з конфігу, `shlex.join` для логів.
- `capture_output=True` захоплює вивід, `encoding="utf-8"` (плюс `errors="replace"` для чужого stderr) робить його текстом, без них це `bytes`.
- Ненульовий код не виняток без `check=True`. `TimeoutExpired` не підклас `CalledProcessError`. `run(timeout=)` сам убиває дитину.
- Два і більше пайпів читають через `communicate`, інакше deadlock на повному буфері ядра. Python-дитину запускають з `-u`, якщо читаєте її потоком.
- Від'ємний `returncode` означає смерть від сигналу: `-15` це `SIGTERM`, `-9` це `SIGKILL`. Graceful stop: `terminate`, `wait(timeout)`, `kill`, `wait`.
- В asyncio скасування `communicate` не вбиває процес: `kill()` і `await proc.wait()` у `finally`.
- Протокол з Node-рендерером: JSON у stdin, HTML зі stdout, діагностика в stderr, статус у коді виходу; у Node `process.exitCode`, а не `process.exit()`.
- Тести: мок `subprocess.run` з `CompletedProcess` для розгалужень, fake-скрипт у `tmp_path` через `sys.executable` для справжніх пайпів; argv рендерера це параметр.

## Що далі

Наступний урок m6-l06 про CLI: argparse і Typer, змінні оточення й pydantic-settings. Там `formbuilder build` отримає шлях до `render.js`, таймаут і ліміт паралельних рендерів з налаштувань і викличе рендерер з цього уроку. У m6-l07 подивимося на інший бік сигналів: як ваш власний процес ловить `SIGTERM` і чемно зупиняє воркер разом з його дочірніми Node-процесами.
