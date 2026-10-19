---
id: m0-l03
module: m0-start
title: "REPL, запуск скриптів, python -m, __main__"
summary: "Учень впевнено запускає Python-код усіма способами (REPL, файл, -c, -i, -u, -m), розуміє, звідки беруться __name__, sys.argv, sys.path і код завершення, і знає, чому один і той самий файл імпортується по-різному залежно від способу запуску."
duration_min: 60
prerequisites: [m0-l02]
---

## REPL: вираз друкується сам

Усі команди уроку виконуються в активованому `.venv` з m0-l02, тож `python` це Python 3.12 проєкту; без активації пишіть `.venv/bin/python` або `uv run python`. Шляхи до демо-папок у виводі скорочені до `/Users/mac/l03/...`.

`python` без аргументів відкриває REPL (Read-Eval-Print Loop). У документації Python це "interactive mode", а "REPL" вживають і доки, і спільнота, тож обидва слова доречні. `>>>` це primary prompt: інтерпретатор чекає нову інструкцію. `...` це secondary prompt: інструкція не закінчена, бо ви відкрили блок після `:` або незакриту дужку. Блок завершується порожнім рядком, саме тому після тіла `for` треба натиснути Enter ще раз.

```bash
python
```

```text
Python 3.12.12 (main, Jan 27 2026, 23:41:44) [Clang 21.1.4 ] on darwin
Type "help", "copyright", "credits" or "license" for more information.
>>> 2 + 3
5
>>> _ * 10
50
>>> x = 5
>>> x
5
>>> print(x)
5
>>> None
>>> for i in range(2):
...     print(i)
... 
0
1
>>> dir()
['__annotations__', '__builtins__', '__doc__', '__loader__', '__name__', '__package__', '__spec__', 'i', 'x']
>>> exit
Use exit() or Ctrl-D (i.e. EOF) to exit
>>> ^D
```

Механізм автодруку простий: якщо введена інструкція це вираз і його значення не `None`, REPL друкує `repr()` значення й кладе його в змінну `_`. Присвоєння `x = 5` це не вираз, тому нічого не друкується, а голе `None` пропускається навмисно, щоб виклики функцій без результату не засмічували екран. `print(x)` друкує сам, а його результат `None` REPL вже не показує. `dir()` без аргументу показує імена поточного простору імен, і серед них `__name__`, до якого повернемося нижче. Виходять через Ctrl-D (кінець вводу, EOF; у Windows Ctrl-Z і Enter) або `exit()`: голе `exit` у 3.12 лише друкує підказку.

Автодрук існує лише в REPL. У файлі той самий вираз обчислюється і викидається, і це перша річ, на якій ловиться людина, що перенесла експеримент з REPL у скрипт.

```python live
fields = ["email", "phone"]
len(fields)
fields[0].upper()
print("only print writes to stdout:", len(fields))
```

```text
only print writes to stdout: 2
```

> **JS-аналог.** `node` без аргументів поводиться так само: автодрук, `_` для останнього результату, вихід через Ctrl-D або `.exit`. Розходження в дрібницях: node друкує `undefined` після кожної інструкції без значення, а Python мовчить; node дозволяє `await` на верхньому рівні, а звичайний Python REPL ні.

```text
Welcome to Node.js v24.9.0.
Type ".help" for more information.
> 2 + 3
5
> _ * 10
50
> let x = 5
undefined
> console.log(x)
5
undefined
> await Promise.resolve(1)
1
```

Для top-level `await` у Python є окремий REPL `python -m asyncio`: він запускає event loop і дозволяє `await` прямо в `>>>`. Знадобиться в модулі 5.

```bash
python -m asyncio
```

```text
asyncio REPL 3.12.12 (main, Jan 27 2026, 23:41:44) [Clang 21.1.4 ] on darwin
Use "await" directly instead of "asyncio.run()".
Type "help", "copyright", "credits" or "license" for more information.
>>> import asyncio
>>> await asyncio.sleep(0, result=42)
42
>>> ^D
exiting asyncio REPL...
```

REPL це ще й довідник. `help(obj)` друкує сигнатуру й docstring (у терміналі відкривається пейджер, вихід через `q`), `dir(obj)` повертає список атрибутів об'єкта, тобто те, що в DevTools ви бачите, розгортаючи об'єкт у консолі. Разом із list comprehension це найшвидший спосіб згадати назву методу.

```text
>>> help(len)
Help on built-in function len in module builtins:

len(obj, /)
    Return the number of items in a container.

>>> [m for m in dir(str) if m.startswith("is")]
['isalnum', 'isalpha', 'isascii', 'isdecimal', 'isdigit', 'isidentifier', 'islower', 'isnumeric', 'isprintable', 'isspace', 'istitle', 'isupper']
```

З 3.13 REPL новий: кольоровий prompt і traceback, багаторядкове редагування (стрілка вгору повертає весь блок `for`, а не останній рядок), `exit` без дужок працює; у 3.12 класичний REPL на readline з історією по рядках. IPython (покращений REPL з автодоповненням і `%`-командами) і Jupyter (той самий IPython у вигляді notebook у браузері) популярні в аналітиці й дослідженнях, але в цьому курсі не потрібні: тут досить стандартного REPL і pytest (Jupyter з'являється лише в опційному етапі C1).

## Запуск коду: файл, `-c`, `-i`, `-u`

Основний спосіб це `python path/to/file.py`: інтерпретатор читає файл, компілює його в байткод і виконує зверху вниз. Окремого кроку збірки, як `tsc`, немає.

```python
# greet.py
name = "FormBuilder"
fields = ["email", "phone"]
print(f"hello from {name}, {len(fields)} fields")
```

```bash
python greet.py
python -c "import sys; print(sys.version_info[:2])"
```

```text
hello from FormBuilder, 2 fields
(3, 12)
```

`-c "code"` виконує рядок, як `node -e`. Зручно для однорядкових перевірок у CI чи README: яка версія, чи імпортується пакет, де він лежить. Багаторядковий код теж можна, якщо взяти його в лапки з переносами, але після двох рядків чесніше створити файл.

`-i` виконує скрипт, а потім не виходить, а відкриває REPL з усіма змінними скрипта. Це найдешевший спосіб подивитися на стан після виконання, включно з випадком, коли скрипт упав з винятком (post-mortem із pdb розібрано в m0-l05).

```bash
python -i greet.py
```

```text
hello from FormBuilder, 2 fields
>>> fields
['email', 'phone']
>>> fields.append("age")
>>> len(fields)
3
>>> ^D
```

`-u` вимикає буферизацію stdout і stderr. Щоб зрозуміти навіщо, треба знати, як Python буферизує вивід. Коли stdout це термінал, буфер скидається на кожному переносі рядка, і ви бачите рядки одразу. Коли stdout це pipe або файл, буфер блоковий (кілька кілобайт) і скидається, лише коли заповниться або процес коректно завершиться. stderr завжди скидається порядково. Тому один і той самий скрипт у терміналі й у pipe дає різний порядок рядків.

```python
# progress.py
import sys

print("step 1: load config")
print("warning: field 'age' has no label", file=sys.stderr)
print("step 2: render")
```

```bash
python progress.py
python progress.py 2>&1 | cat
python -u progress.py 2>&1 | cat
```

```text
step 1: load config
warning: field 'age' has no label
step 2: render
warning: field 'age' has no label
step 1: load config
step 2: render
step 1: load config
warning: field 'age' has no label
step 2: render
```

Перший запуск у терміналі, порядок правильний. Другий через pipe: попередження з stderr вилізло першим, бо обидва `print` у stdout чекали в буфері до кінця процесу. Третій з `-u` знову правильний. Pipe це саме те, що бачить ваш процес у Docker без `-t`, у CI і під supervisor: логи збирає не термінал.

> **Пастка.** Буфер не просто переставляє рядки, він їх губить, якщо процес вбили сигналом. Нижче `http.server` завершено через `kill`, як це робить `docker stop` після таймауту. Рядок "Serving HTTP" пішов у stdout, лишився в буфері й зник; рядок запиту пішов у stderr і вижив. З `-u` (або `PYTHONUNBUFFERED=1`) видно обидва.

```bash
python -m http.server 8765 > http.log 2>&1 &
sleep 1; curl -s -o /dev/null localhost:8765/greet.py; kill $!
cat http.log
```

```text
::1 - - [18/Oct/2026 03:50:33] "GET /greet.py HTTP/1.1" 200 -
```

```bash
python -u -m http.server 8765 > http.log 2>&1 &
sleep 1; curl -s -o /dev/null localhost:8765/greet.py; kill $!
cat http.log
```

```text
Serving HTTP on :: port 8765 (http://[::]:8765/) ...
::1 - - [18/Oct/2026 03:50:34] "GET /greet.py HTTP/1.1" 200 -
```

## `python -m`: модуль за іменем, а не шляхом

`python -m name` шукає модуль `name` тим самим механізмом, що й `import name`, тобто по `sys.path`, і виконує його як головний. Шлях до файлу вам знати не потрібно: достатньо, щоб модуль був імпортований цим інтерпретатором. Так запускається половина стандартних інструментів.

```bash
echo '{"id":"email","type":"text","required":true}' | python -m json.tool
python -m pytest --version
```

```text
{
    "id": "email",
    "type": "text",
    "required": true
}
pytest 9.1.1
```

`python -m json.tool` форматує й валідує JSON зі stdin (на невалідному дає повідомлення й код 1), `python -m http.server` віддає поточну папку по HTTP, як `npx serve`, `python -m venv .venv` створює оточення (m0-l02), `python -m pytest` запускає тести. Модуль пакета `json.tool` записується через крапку, як в `import json.tool`. Якщо замість модуля назвати пакет, Python виконає його `__main__.py`: так у m0-l06 запрацює `python -m formbuilder`.

Головна причина писати `python -m pip`, а не `pip`: команда `pip` це окремий файл на `PATH`, і він прив'язаний до того інтерпретатора, з яким був встановлений, а не до того, який ви зараз вважаєте своїм. `python -m pip` гарантовано бере pip саме того `python`, який ви запустили. На цій машині глобальний `pip3` виявився pip від системного Python 3.9:

```bash
pip3 --version
python -m venv venv-demo
venv-demo/bin/python -m pip --version
python -m pip --version
```

```text
pip 21.2.4 from /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/site-packages/pip (python 3.9)
pip 25.0.1 from /Users/mac/l03/demo/venv-demo/lib/python3.12/site-packages/pip (python 3.12)
/Users/mac/projects/full_stack_study/python-course/.venv/bin/python: No module named pip
```

Останній рядок теж показовий: venv, створений через uv, pip не містить зовсім, бо пакетами в ньому керує `uv add` або `uv pip`. Повідомлення "No module named pip" чесно каже, що в цьому інтерпретаторі такого модуля немає, а не що pip зламався.

> **JS-аналог.** `python -m` схожий на `npx` лише частково: обидва запускають інструмент без знання шляху до його бінарника. Але `npx` уміє завантажити пакет, якого немає, а `python -m` запускає тільки те, що вже імпортується цим інтерпретатором. Повний аналог `npx` з тимчасовим встановленням це `uvx` (m0-l02).

> **Пастка.** Після `-m` іде ім'я модуля, а не файл. `python -m greet.py` спершу імпортує `greet` (і виконує його код), а потім шукає в ньому підмодуль `py` і падає.

```bash
python -m greet.py
```

```text
hello from FormBuilder, 2 fields
/Users/mac/projects/full_stack_study/python-course/.venv/bin/python: Error while finding module specification for 'greet.py' (ModuleNotFoundError: __path__ attribute not found on 'greet' while trying to find 'greet.py'). Try using 'greet' instead of 'greet.py' as the module name.
```

## `__name__` і `if __name__ == "__main__"`

Кожен модуль має глобальну змінну `__name__`. Імена з двома підкресленнями з обох боків спільнота називає dunder (double underscore); це жаргон, у документації вони звуться special attributes або special methods, але "dunder" на співбесіді розуміють усі. При імпорті `__name__` дорівнює імені модуля, під яким його імпортували. Модуль, з якого почався запуск, отримує ім'я `"__main__"`; документація називає його top-level code environment.

```python
# fields.py
print(f"fields.py: __name__ = {__name__!r}")


def slugify(label: str) -> str:
    return "_".join(label.lower().split())


if __name__ == "__main__":
    print(slugify("Email Address"))
```

```python
# app.py
import fields

print(f"app.py: __name__ = {__name__!r}")
print(fields.slugify("Phone Number"))
```

```bash
python fields.py
python app.py
python -m fields
```

```text
fields.py: __name__ = '__main__'
email_address
fields.py: __name__ = 'fields'
app.py: __name__ = '__main__'
phone_number
fields.py: __name__ = '__main__'
email_address
```

При прямому запуску `fields.py` виконує і верхній `print`, і блок під guard. При імпорті з `app.py` верхній `print` теж виконується, бо імпорт це виконання всього модуля зверху вниз, а блок під guard ні, бо `__name__` тепер `'fields'`. `python -m fields` поводиться як прямий запуск.

```ts
// fields.ts
export function slugify(label: string): string {
  return label.toLowerCase().split(/\s+/).join("_");
}

if (import.meta.main) {          // ESM, Node 24+ / Deno / Bun
  console.log(slugify("Email Address"));
}
// у CommonJS те саме: if (require.main === module) { ... }
```

```python
# fields.py
def slugify(label: str) -> str:
    return "_".join(label.lower().split())


if __name__ == "__main__":
    print(slugify("Email Address"))
```

Ідея та сама, що `require.main === module`, і в ESM-світі вона прийшла пізно, тому в JS цю перевірку пишуть рідко. У Python вона в кожному другому файлі, бо модуль у Python не має окремої фази "лише оголошення": імпорт виконує верхній рівень, і будь-який побічний ефект там спрацює в кожного, хто імпортує. Якщо прибрати guard з `fields.py`, `app.py` раптом надрукує чужий `email_address`:

```python
# fields.py, без guard
def slugify(label: str) -> str:
    return "_".join(label.lower().split())


print(slugify("Email Address"))
```

```bash
python app.py
```

```text
email_address
app.py: __name__ = '__main__'
phone_number
```

<!-- task: q1 -->

Ідіома повністю пишеться як `if __name__ == "__main__": main()`, а не з кодом прямо під `if`. Причина в scope: блок `if` на рівні модуля не створює власної області видимості, тож кожна змінна, присвоєна під guard, стає глобальною змінною модуля. Функції модуля можуть випадково на неї спиратися, і це працює при запуску скриптом і падає при імпорті.

```python
# slug_cli.py
import sys


def slugify(label: str) -> str:
    return sep.join(label.lower().split())


if __name__ == "__main__":
    sep = "_"
    print(slugify(sys.argv[1]))
```

```bash
python slug_cli.py "Email Address"
python -c "import slug_cli; print(slug_cli.slugify('Email Address'))"
```

```text
email_address
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "/Users/mac/l03/demo/slug_cli.py", line 6, in slugify
    return sep.join(label.lower().split())
           ^^^
NameError: name 'sep' is not defined. Did you mean: 'set'?
```

Функція `main()` закриває цю діру: її змінні локальні. Крім того, її можна викликати з тесту з будь-яким списком аргументів, вона може повернути код завершення, а в m0-l06 саме на функцію посилається entry point `[project.scripts]`. Стандартна форма нижче, і нею користуються всі приклади далі.

```python
import sys


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv if argv is None else argv
    ...
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

<!-- task: q2 -->

## `sys.argv` і код завершення

`sys.argv` це список рядків з аргументами командного рядка. На відміну від `process.argv`, шляху до інтерпретатора в ньому немає: `argv[0]` це скрипт, перший аргумент користувача в `argv[1]`.

```ts
// show_argv.js
console.log(process.argv);
// node show_argv.js config.json --out dist
```

```python
# show_argv.py
import sys

print(sys.argv)
```

```bash
node show_argv.js config.json --out dist
python show_argv.py config.json --out dist
python -m show_argv config.json
python -c "import sys; print(sys.argv)" config.json
```

```text
[
  '/Users/mac/.nvm/versions/node/v24.9.0/bin/node',
  '/Users/mac/l03/demo/show_argv.js',
  'config.json',
  '--out',
  'dist'
]
['show_argv.py', 'config.json', '--out', 'dist']
['/Users/mac/l03/demo/show_argv.py', 'config.json']
['-c', 'config.json']
```

`argv[0]` залежить від способу запуску: шлях скрипта так, як ви його написали, повний шлях до файлу модуля при `-m`, і рядок `'-c'` при `-c`. Аргументи не розбираються ніяк: `--out` і `dist` це просто два окремі рядки. Розбір прапорців, `--help`, типи й помилки дає argparse, детально в m6-l06; тут достатньо зрізу `sys.argv[1:]`.

Код завершення задається через `sys.exit(code)`: `0` це успіх, будь-яке інше число це помилка, і саме його бачать shell (`$?`), `&&` у ланцюжку команд, CI і `docker run`. Конвенція: `1` для загальної помилки, `2` для неправильного використання команди (так робить argparse).

```python
# check.py
import json
import sys


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} CONFIG", file=sys.stderr)
        return 2
    try:
        with open(argv[1]) as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"ok: {len(config['fields'])} fields")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

```bash
python check.py form.json; echo "exit code: $?"
python check.py; echo "exit code: $?"
python check.py broken.json; echo "exit code: $?"
python check.py missing.json; echo "exit code: $?"
```

```text
ok: 2 fields
exit code: 0
usage: check.py CONFIG
exit code: 2
error: Expecting value: line 2 column 1 (char 13)
exit code: 1
error: [Errno 2] No such file or directory: 'missing.json'
exit code: 1
```

<!-- task: t1 -->

Необроблений виняток теж завершує процес з кодом 1 і друкує traceback у stderr, тож скрипт, що впав, CI побачить як провал і без явного `sys.exit`.

```python
# crash.py
config = {"fields": []}
print(config["pages"])
```

```bash
python crash.py; echo "exit code: $?"
```

```text
Traceback (most recent call last):
  File "/Users/mac/l03/demo/crash.py", line 3, in <module>
    print(config["pages"])
          ~~~~~~^^^^^^^^^
KeyError: 'pages'
exit code: 1
```

`sys.exit` не зупиняє процес негайно, як `process.exit` у Node. Він кидає виняток `SystemExit`, який летить угору стеком, як будь-який інший: `finally` виконуються, `with` закривають файли, а сам процес завершується, лише коли виняток дійде до верхнього рівня неперехопленим. Рядок як аргумент друкується в stderr і дає код 1.

```ts
// exits.js
try {
  console.log("cleanup demo");
  process.exit(1);
} finally {
  console.log("finally still runs");
}
```

```python
# exits.py
import sys

try:
    sys.exit(3)
except SystemExit as e:
    print("caught SystemExit, code =", e.code)

try:
    print("cleanup demo")
    sys.exit("fatal: config not found")
finally:
    print("finally still runs")
```

```bash
node exits.js; echo "exit code: $?"
python exits.py; echo "exit code: $?"
```

```text
cleanup demo
exit code: 1
caught SystemExit, code = 3
cleanup demo
finally still runs
fatal: config not found
exit code: 1
```

У Node `finally` не виконався: `process.exit` обриває процес на місці. У Python `SystemExit` можна перехопити, як у першому `try`, і `finally` відпрацював перед виходом. `SystemExit` успадковується від `BaseException`, а не від `Exception`, тому звичайний `except Exception:` його не ловить і випадково не "скасує" вихід; ловить лише голий `except:` або `except BaseException:`.

```bash
python -c "
import sys
try:
    sys.exit(2)
except Exception:
    print('caught by except Exception')
"; echo "exit code: $?"
```

```text
exit code: 2
```

```python live
import sys

for value in [0, 2, None, "error: config not found", True]:
    try:
        sys.exit(value)
    except SystemExit as e:
        print(repr(value), "->", repr(e.code))
```

```text
0 -> 0
2 -> 2
None -> None
'error: config not found' -> 'error: config not found'
True -> True
```

`e.code` це те, що ви передали, а в код процесу його перетворює інтерпретатор на виході: `None` дає 0, ціле число дає себе, будь-що інше друкується в stderr і дає 1. `True` як ціле число дорівнює 1.

```bash
python -c "import sys; sys.exit()"; echo "exit code: $?"
python -c "import sys; sys.exit(True)"; echo "exit code: $?"
python -c "import sys; sys.exit(256)"; echo "exit code: $?"
```

```text
exit code: 0
exit code: 1
exit code: 0
```

> **Пастка.** Код завершення в Unix це один байт, тож `sys.exit(256)` перетворюється на 0, тобто на успіх. Не передавайте в `sys.exit` лічильник помилок: при 256 помилках CI побачить зелений білд. Повертайте 1 або 2.

<!-- task: q4 -->

## Як `import` знаходить модулі: `sys.path`

`import name` шукає модуль по списку директорій `sys.path` зверху вниз і бере перший збіг. Офіційна назва цього списку module search path. Перший елемент залежить від способу запуску, далі йдуть директорії з `PYTHONPATH`, стандартна бібліотека і `site-packages` активного venv.

```python
# tools/show_path.py
import sys

for entry in sys.path:
    print(repr(entry))
```

```bash
python tools/show_path.py
```

```text
'/Users/mac/l03/demo/tools'
'/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python312.zip'
'/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12'
'/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12/lib-dynload'
'/Users/mac/projects/full_stack_study/python-course/.venv/lib/python3.12/site-packages'
```

```bash
python -m tools.show_path | head -1
python -c "import sys; print(repr(sys.path[0]))"
PYTHONPATH=/opt/shared python tools/show_path.py | head -2
```

```text
'/Users/mac/l03/demo'
''
'/Users/mac/l03/demo/tools'
'/opt/shared'
```

Правило для `sys.path[0]`: при `python file.py` це директорія скрипта, незалежно від того, з якої папки ви його запустили; при `python -m` це поточна директорія; при `-c` і в REPL порожній рядок, що теж означає поточну директорію. `PYTHONPATH` вставляється одразу після нього. Папка `tools` тут без `__init__.py` і все одно імпортується через `-m tools.show_path`; чому так, розібрано в m3-l01 разом з рештою системи імпортів.

> **JS-аналог.** Node шукає `import "./slug"` відносно файлу, а `import "pkg"` у `node_modules` вгору по дереву від файлу. У Python немає ні того, ні іншого: абсолютний `import app.slug` шукається лише в `sys.path`, а `sys.path` залежить від того, як запущено процес, а не від того, де лежить файл з імпортом. Відносні імпорти `from .slug import ...` існують, але працюють лише всередині пакета (m3-l01).

Звідси головна пастка src-layout. Візьмемо проєкт, де код лежить у `src/app/`, а `main.py` імпортує сусідній модуль абсолютним імпортом, як і рекомендується.

```python
# src/app/slug.py
def slugify(label: str) -> str:
    return "_".join(label.lower().split())
```

```python
# src/app/main.py
import sys

from app.slug import slugify

print("sys.path[0] =", sys.path[0])
print(slugify("Email Address"))
```

```bash
python src/app/main.py; echo "exit code: $?"
```

```text
Traceback (most recent call last):
  File "/Users/mac/l03/proj/src/app/main.py", line 4, in <module>
    from app.slug import slugify
ModuleNotFoundError: No module named 'app'
exit code: 1
```

Запуск шляхом поклав у `sys.path[0]` директорію `src/app`, а в ній немає папки `app`, тож `import app` нічого не знаходить. Запуск через `-m` з директорії `src` кладе в `sys.path[0]` саме `src`, і пакет `app` знаходиться. Той самий ефект дає `PYTHONPATH=src` з кореня проєкту.

```bash
cd src && python -m app.main; cd ..
PYTHONPATH=src python -m app.main
python -m app.main
```

```text
sys.path[0] = /Users/mac/l03/proj/src
email_address
sys.path[0] = /Users/mac/l03/proj
email_address
/Users/mac/projects/full_stack_study/python-course/.venv/bin/python: Error while finding module specification for 'app.main' (ModuleNotFoundError: No module named 'app')
```

Буває й навпаки. Якщо за звичкою з Node написати `from slug import slugify` ("сусідній файл"), запуск шляхом працює, бо директорія скрипта в `sys.path`, а `python -m app.main` падає, бо тепер у `sys.path[0]` лежить `src`, і модуля `slug` на верхньому рівні там немає. Один і той самий файл з одним і тим самим імпортом поводиться протилежно залежно від команди запуску.

```python
# src/app/main.py, імпорт "як у Node, відносно файлу"
from slug import slugify

print(slugify("Email Address"))
```

```bash
python src/app/main.py
cd src && python -m app.main
```

```text
email_address
Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "<frozen runpy>", line 88, in _run_code
  File "/Users/mac/l03/proj2/src/app/main.py", line 2, in <module>
    from slug import slugify
ModuleNotFoundError: No module named 'slug'
```

Ні `cd src`, ні `PYTHONPATH` не є остаточним рішенням: у m0-l06 пакет встановлюється у venv як editable, і тоді `import app` працює з будь-якої папки та при будь-якому способі запуску. Хак `sys.path.insert(0, ...)` у коді, який часто радять на Stack Overflow, лише ховає проблему.

> **Пастка.** Через те, що директорія скрипта стоїть у `sys.path` першою, ваш файл з іменем модуля стандартної бібліотеки перекриває її. Файл `random.py` поруч зі скриптом робить `import random` імпортом вашого файла. 3.12 каже лише, що атрибута немає; 3.13+ прямо пропонує перейменувати файл.

```python
# random.py, випадково названий як модуль стандартної бібліотеки
print("local random.py imported")
```

```python
# pick.py
import random

print(random.choice(["email", "phone"]))
```

```bash
python pick.py
```

```text
local random.py imported
Traceback (most recent call last):
  File "/Users/mac/l03/shadow/pick.py", line 4, in <module>
    print(random.choice(["email", "phone"]))
          ^^^^^^^^^^^^^
AttributeError: module 'random' has no attribute 'choice'
```

<!-- task: q5 -->

<!-- task: p2 -->

## Байткод і `__pycache__`

Перед виконанням CPython компілює вихідний код у байткод (bytecode, офіційний термін): послідовність інструкцій для власної стекової віртуальної машини. Подивитися на нього можна модулем `dis`.

```bash
python -c "import dis; dis.dis('total = price * qty + 1')"
```

```text
  0           0 RESUME                   0

  1           2 LOAD_NAME                0 (price)
              4 LOAD_NAME                1 (qty)
              6 BINARY_OP                5 (*)
             10 LOAD_CONST               0 (1)
             12 BINARY_OP                0 (+)
             16 STORE_NAME               2 (total)
             18 RETURN_CONST             1 (None)
```

Це не компіляція у звичному сенсі, як `tsc` чи `gcc`. Ніхто не перевіряє типи, не знає, що лежить у `price`, і не оптимізує: `BINARY_OP (*)` з'ясує, що множити, лише під час виконання. Байткод так само інтерпретується циклом віртуальної машини, як і джерело; компіляція лише прибирає повторний парсинг тексту. Найближча аналогія з JS-світу це не `tsc`, а кеш скомпільованого коду V8, який Node 22+ уміє зберігати між запусками через `NODE_COMPILE_CACHE`.

Щоб не компілювати модулі щоразу, Python кешує байткод імпортованих модулів у файлах `.pyc` у папці `__pycache__` поруч із джерелом. У назві версія інтерпретатора, тому кілька версій Python не конфліктують. Головний скрипт не кешується: він компілюється при кожному запуску, і `__pycache__/app.cpython-312.pyc` не з'являється.

```bash
python app.py
ls __pycache__
```

```text
fields.py: __name__ = 'fields'
app.py: __name__ = '__main__'
phone_number
fields.cpython-312.pyc
```

Кеш перевіряється за часом зміни й розміром джерела. Змінили `fields.py`, і при наступному імпорті `.pyc` перезапишеться; не змінили, і Python бере готовий. Ключ `-v` показує це рішення.

```bash
touch fields.py
python -v app.py 2>&1 | grep "fields.*pyc"
python -v app.py 2>&1 | grep "fields.*pyc"
```

```text
# created '/Users/mac/l03/bc/__pycache__/fields.cpython-312.pyc'
# /Users/mac/l03/bc/__pycache__/fields.cpython-312.pyc matches /Users/mac/l03/bc/fields.py
# code object from '/Users/mac/l03/bc/__pycache__/fields.cpython-312.pyc'
```

Після `touch` джерело новіше за кеш, тож перший запуск компілює й записує `.pyc` (`created`), а другий перевіряє, що кеш збігається з джерелом (`matches`), і завантажує байткод прямо з нього.

`__pycache__` це артефакт, його не комітять (`.gitignore` з m0-l02) і не редагують. Видалити його можна будь-коли без наслідків.

`python -O` вмикає оптимізований режим. Швидше код від нього не стає, зате змінюється поведінка: вбудована константа `__debug__` стає `False`, і компілятор не генерує байткод ні для `assert`, ні для блоків `if __debug__:`. Кеш для такого режиму пишеться в окремі файли `*.opt-1.pyc`.

```python
# limits.py
def check_max_length(value: str, limit: int) -> str:
    assert limit > 0, "limit must be positive"
    return value[:limit]


print("debug mode:", __debug__)
print(repr(check_max_length("email@example.com", 0)))
```

```bash
python limits.py; echo "exit code: $?"
python -O limits.py; echo "exit code: $?"
```

```text
debug mode: True
Traceback (most recent call last):
  File "/Users/mac/l03/bc/limits.py", line 8, in <module>
    print(repr(check_max_length("email@example.com", 0)))
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/mac/l03/bc/limits.py", line 3, in check_max_length
    assert limit > 0, "limit must be positive"
           ^^^^^^^^^
AssertionError: limit must be positive
exit code: 1
debug mode: False
''
exit code: 0
```

> **Пастка.** `assert` це перевірка інваріантів для розробника, а не валідація даних. Під `-O` перевірка зникає, і функція мовчки повертає порожній рядок. Вхідні дані від користувача чи з конфігу перевіряйте через `if ...: raise ValueError(...)`, а згодом через Pydantic (m2-l09). У тестах pytest голий `assert` якраз доречний: тести під `-O` ніхто не запускає (m3-l03).

<!-- task: q3 -->

## Змінні оточення інтерпретатора

Більшість ключів командного рядка мають двійника у змінних оточення. Це важливо там, де команду запуску змінювати незручно: у Dockerfile, у конфігу CI, у чужому entry point. Чотири, які варто знати напам'ять:

- `PYTHONPATH`: додаткові директорії в `sys.path` одразу після `sys.path[0]`, через `:`. Показано вище. У нормальному проєкті не потрібен: пакет встановлюється у venv (m0-l06).
- `PYTHONUNBUFFERED=1`: те саме, що `-u`. Стандартний рядок кожного Python-Dockerfile.
- `PYTHONDONTWRITEBYTECODE=1`: те саме, що `-B`, не писати `__pycache__`. У контейнері `.pyc` все одно зникнуть разом з контейнером, а в read-only файловій системі запис і зовсім неможливий.
- `PYTHONWARNINGS`: фільтр попереджень, те саме, що `-W`. Значення `default` показує все, `error` перетворює попередження на винятки.

```bash
rm -rf __pycache__
PYTHONDONTWRITEBYTECODE=1 python app.py
ls -1
```

```text
fields.py: __name__ = 'fields'
app.py: __name__ = '__main__'
phone_number
app.py
fields.py
limits.py
```

`PYTHONWARNINGS` найкорисніша в CI. За замовчуванням `DeprecationWarning` показується лише тоді, коли застарілий виклик стоїть безпосередньо в `__main__`; з імпортованих модулів, тобто з усього вашого реального коду, вони приховані. Тому застарілий API доживає до релізу, у якому його видаляють.

```bash
python -c "from datetime import datetime; datetime.utcnow()"
```

```text
<string>:1: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
```

Той самий виклик, винесений в імпортований модуль, мовчить:

```python
# legacy.py
from datetime import datetime


def build_stamp() -> str:
    return datetime.utcnow().strftime("%Y")
```

```python
# build.py
import legacy

print("stamp ok:", len(legacy.build_stamp()) == 4)
```

```bash
python build.py
PYTHONWARNINGS=default python build.py
PYTHONWARNINGS=error python build.py > /dev/null 2>&1; echo "exit code: $?"
```

```text
stamp ok: True
/Users/mac/l03/warn/legacy.py:6: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  return datetime.utcnow().strftime("%Y")
stamp ok: True
exit code: 1
```

Без змінної попередження немає зовсім. З `default` воно видно, а з `error` скрипт падає з кодом 1, і CI не пропустить застарілий виклик. Детальніше про категорії попереджень і `-W` у m0-l05. У Dockerfile ці змінні зазвичай стоять разом:

```dockerfile
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
```

> **Під капотом.** Подивитися, з якими налаштуваннями насправді працює інтерпретатор, можна через `sys.flags`: там видно і ключі, і змінні оточення, бо обидва джерела зводяться в одну структуру. `python -c "import sys; print(sys.flags.dont_write_bytecode, sys.flags.optimize)"` швидко відповідає на питання "чому в мене не з'являється `__pycache__`".

```bash
python -c "import sys; print(sys.flags.dont_write_bytecode, sys.flags.optimize)"
PYTHONDONTWRITEBYTECODE=1 python -O -c "import sys; print(sys.flags.dont_write_bytecode, sys.flags.optimize)"
```

```text
0 0
1 1
```

## Для капстоуну

Бекенд FormBuilder запускатиметься трьома способами, і всі три спираються на цей урок. CLI `formbuilder build config.json` з модуля 6 це функція `main(argv) -> int` з кодами 0, 1 і 2, і CI розрізнятиме "конфіг невалідний" і "команду викликали неправильно" саме за кодом. `python -m formbuilder` працює через `__main__.py` пакета (m0-l06). А контейнер з API і воркером стартує з `PYTHONUNBUFFERED=1`, інакше логи воркера губитимуться при кожному `docker stop`.

> **Для капстоуну.** Пишіть `main(argv: list[str] | None = None) -> int` з першого дня: тоді тест CLI це звичайний виклик `main(["formbuilder", "build", "bad.json"]) == 1` без subprocess. `sys.exit` живе лише в одному рядку під guard.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`__name__ == "main"` без підкреслень.** Знайома з `require.main` ідея, але рядок неправильний. Помилки немає, код під guard просто ніколи не виконується, скрипт завершується з кодом 0. Правильно: `"__main__"`, і нехай ruff або IDE підсвічує.

   ```python
   if __name__ == "main":      # ніколи не True
       main()
   if __name__ == "__main__":  # правильно
       sys.exit(main())
   ```

2. **`sys.argv[2]` як `process.argv[2]`.** У Python в `argv` немає шляху до інтерпретатора, перший аргумент користувача це `argv[1]`. З `argv[2]` скрипт з одним аргументом падає з `IndexError`, а з двома мовчки бере не той.

   ```python
   config_path = sys.argv[1]   # node: process.argv[2]
   rest = sys.argv[1:]         # node: process.argv.slice(2)
   ```

3. **Запуск файлу з будь-якої папки й очікування, що імпорти відносні до файлу.** `node src/app/main.js` знаходить `./slug.js` поруч, а `python src/app/main.py` з `from app.slug import ...` падає з `ModuleNotFoundError`. Правильно: `python -m app.main` з кореня пакетів, а в проєкті editable install (m0-l06). Не `sys.path.insert`.

   ```bash
   python src/app/main.py        # sys.path[0] = src/app, пакета app там немає
   cd src && python -m app.main  # sys.path[0] = src
   ```

4. **`python -m file.py` або `python -m src/app/main`.** Після `-m` іде ім'я модуля через крапки, а не шлях.

   ```bash
   python -m greet.py      # ModuleNotFoundError ... Try using 'greet'
   python -m greet         # правильно
   ```

5. **`pip install` замість `python -m pip install`.** Як `npm i` з чужого `PATH`: пакет встановлюється в інтерпретатор, якому належить знайдений `pip`, а не в ваш venv. Правильно: `python -m pip`, а в проєкті на uv `uv add`.

   ```bash
   pip3 --version          # pip 21.2.4 ... (python 3.9)
   python -m pip --version # pip саме цього python
   ```

6. **Файл з іменем модуля стандартної бібліотеки.** `random.py`, `json.py`, `email.py`, `test.py` поруч зі скриптом перекривають однойменні модулі. Правильно: не називати так файли; помилка `module 'random' has no attribute ...` майже завжди означає саме це.

   ```python
   import random
   print(random.__file__)  # якщо шлях у вашому проєкті, це ваш файл
   ```

7. **Код скрипта на верхньому рівні модуля без `main()`.** Як у Node-скрипті, усе пишуть прямо у файлі. Імпорт такого модуля з тесту виконує весь скрипт, а змінні під guard стають глобальними. Правильно: уся логіка в `main(argv) -> int`, під guard один рядок.

   ```python
   def main(argv: list[str] | None = None) -> int:
       ...
       return 0

   if __name__ == "__main__":
       sys.exit(main())
   ```

8. **`assert` для валідації вхідних даних.** Звичка з `console.assert` або `node:assert` у продакшн-коді. Під `-O` перевірка зникає. Правильно: `if` і `raise ValueError`.

   ```python
   if limit <= 0:
       raise ValueError("limit must be positive")
   ```

## Підсумок

- REPL друкує `repr` кожного виразу, крім `None`, і кладе результат у `_`; у файлі вираз без `print` нічого не виводить.
- `python file.py` для файлу, `-c` для рядка, `-i` для REPL після скрипта, `-u` (або `PYTHONUNBUFFERED=1`) для логів у pipe, Docker і CI.
- stdout у pipe буферизується блоками: рядки переставляються з stderr і губляться при `kill`.
- `python -m name` знаходить модуль по `sys.path` і виконує як головний; `python -m pip` гарантує pip саме цього інтерпретатора.
- `__name__` дорівнює `"__main__"` лише в модулі, з якого почався запуск; при імпорті це ім'я модуля, і верхній рівень модуля виконується.
- Ідіома: `def main(argv=None) -> int` плюс `if __name__ == "__main__": sys.exit(main())`.
- `sys.argv[0]` це скрипт, аргументи користувача з `sys.argv[1]`; розбір прапорців через argparse (m6-l06).
- `sys.exit` кидає `SystemExit`: `finally` виконуються; `None` дає код 0, ціле дає себе, рядок друкується і дає 1.
- `sys.path[0]` це директорія скрипта при запуску шляхом і поточна директорія при `-m`; тому `python src/app/main.py` і `python -m app.main` імпортують по-різному.
- Байткод кешується в `__pycache__` лише для імпортованих модулів; `-O` прибирає `assert`, тож валідацію на ньому не будують.

## Що далі

Наступний урок m0-l04 про ruff: лінтер і форматер, який, серед іншого, ловить невикористані імпорти й підозрілі конструкції в тих самих скриптах, що ви тут запускали. У m0-l05 повернуться `python -i` для огляду стану після падіння і `PYTHONWARNINGS`, а в m0-l06 `sys.path`, `python -m` і функція `main()` зійдуться в структурі проєкту: src-layout, editable install і entry point `formbuilder`.
