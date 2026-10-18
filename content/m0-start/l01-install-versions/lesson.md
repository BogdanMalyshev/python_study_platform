---
id: m0-l01
module: m0-start
title: "Установка Python і кілька версій поруч"
summary: "Учень знає, чому системний Python на Mac не для розробки, ставить і перемикає версії через uv, закріплює 3.12 за проєктом через .python-version і requires-python, і пише скрипти, які не залежать від того, що лежить у PATH під іменем python3."
duration_min: 45
prerequisites: []
---

## Системний Python на macOS: є, але не для вас

На Mac `python3` є ще до того, як ви щось поставили. Його приносять Xcode Command Line Tools (CLT), той самий пакет, що дає `git` і `clang`. `/usr/bin/python3` це лише заглушка, яка передає виклик інтерпретатору всередині `/Library/Developer/CommandLineTools`. Команди `python` без трійки на macOS немає взагалі.

```bash
which -a python3
python3 --version
python3 -c "import sys; print(sys.executable)"
```

```text
/usr/bin/python3
/opt/homebrew/bin/python3
Python 3.9.6
/Library/Developer/CommandLineTools/usr/bin/python3
```

`which -a` показує всі `python3` у `PATH` у порядку пошуку. Перший виграє, і на цій машині це Apple-івський 3.9.6, хоча нижче в списку є Homebrew з новішою версією. Звідси перша причина не працювати з системним Python: він старий. 3.9 вийшов у 2020 році й у жовтні 2025 перестав отримувати навіть виправлення безпеки. Синтаксис, на якому написаний цей курс, на ньому просто не запускається: `X | None` в анотаціях з'явився в 3.10, `match` теж у 3.10, `TaskGroup` у 3.11. Файл `ann.py`:

```python
def find_field(field_id: str) -> dict | None:
    return None

print(find_field("email"))
```

```bash
python3 ann.py
uv run --python 3.12 ann.py
```

```text
    def find_field(field_id: str) -> dict | None:
TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'
None
```

Traceback від 3.9 скорочено до останніх двох рядків, а `None` надрукував 3.12. Анотації в 3.9 обчислюються в момент `def`, і `dict | None` там ще не підтримується.

Друга причина: цей Python належить Apple. Його версію міняє оновлення CLT, а не ви, і лежить він там, куди його поклала Apple, разом із власною копією pip 21.2. Третя причина практична: пакети в нього нікуди ставити. Каталог `site-packages` (офіційна назва місця, куди потрапляють встановлені пакети, аналог глобальної `node_modules`) належить `root`, тому `pip` мовчки перемикається на user-встановлення в `~/Library/Python/3.9`.

```bash
ls -ld /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/site-packages
python3 -m site
```

```text
drwxr-xr-x  24 root  wheel  768 Jun 13 22:35 /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/site-packages
sys.path = [
    ...
    '/Users/mac/Library/Python/3.9/lib/python/site-packages',
    '/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/site-packages',
]
USER_BASE: '/Users/mac/Library/Python/3.9' (exists)
USER_SITE: '/Users/mac/Library/Python/3.9/lib/python/site-packages' (exists)
ENABLE_USER_SITE: True
```

Вивід `sys.path` скорочено до двох останніх рядків. User site це один каталог на всі проєкти, які колись запускались системним `python3`. Ось скільки там уже лежить на цій машині: сто пакетів і 48 консольних команд, і жоден з них не прив'язаний до конкретного проєкту.

```bash
ls -d ~/Library/Python/3.9/lib/python/site-packages/*.dist-info | wc -l
ls ~/Library/Python/3.9/bin | wc -l
```

```text
     100
      48
```

> **Пастка.** Apple-івський 3.9 не відмовляє в `pip install`, він тихо ставить у user site і пише лише `Defaulting to user installation because normal site-packages is not writeable`. Через це здається, що все працює, поки два скрипти не захочуть різні версії одного пакета. Це той самий `npm i -g`, тільки без жодного способу дізнатись, кому ця версія потрібна.

Новіші дистрибутиви Python захищаються від цього явно. PEP 668 (PEP, Python Enhancement Proposal, це офіційний формат пропозицій до мови й екосистеми, на номери посилаються в документації та на співбесідах) вводить поняття externally managed environment: інтерпретатор, яким керує зовнішній менеджер пакетів (Homebrew, apt, uv), кладе поруч зі стандартною бібліотекою файл-маркер `EXTERNALLY-MANAGED`, і `pip` відмовляється ставити туди будь-що.

```bash
for p in /usr/bin/python3 /opt/homebrew/bin/python3 ~/.local/bin/python3.12; do
  $p -c "import sys, sysconfig, pathlib; print(sys.version.split()[0], (pathlib.Path(sysconfig.get_path('stdlib')) / 'EXTERNALLY-MANAGED').exists())"
done
```

```text
3.9.6 False
3.14.5 True
3.12.12 True
```

```bash
/opt/homebrew/bin/python3 -m pip install --dry-run requests
```

```text
error: externally-managed-environment

× This environment is externally managed
╰─> To install Python packages system-wide, try brew install
    xyz, where xyz is the package you are trying to
    install.
    
    If you wish to install a Python library that isn't in Homebrew,
    use a virtual environment:
...
note: If you believe this is a mistake, please contact your Python installation or OS distribution provider. You can override this, at the risk of breaking your Python installation or OS, by passing --break-system-packages.
hint: See PEP 668 for the detailed specification.
```

Вивід скорочено, середина це поради Homebrew. Відмова спрацьовує до будь-якого звернення до мережі, навіть з `--dry-run`. Для Python, поставленого через uv, текст інший, механізм той самий:

```bash
cat ~/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12/EXTERNALLY-MANAGED
```

```text
[externally-managed]
Error=This Python installation is managed by uv and should not be modified.
```

Висновок з цього розділу один: глобального місця для пакетів у Python-розробці немає. Інтерпретатор ставиться один раз на версію, а пакети живуть у віртуальному оточенні кожного проєкту; як воно влаштоване, детально в m0-l02. `--break-system-packages` існує, але це саме те, що написано в назві.

<!-- task: q1 -->

## CPython, PyPy і яку версію ставити

"Python" це мова, а програма, яка її виконує, називається реалізацією. Основна реалізація, написана на C, називається CPython: це офіційна назва, її вживає документація, і саме її ви отримуєте з python.org, Homebrew, uv чи Apple. Коли хтось каже "Python 3.12", він має на увазі CPython 3.12, бо нові можливості мови спершу з'являються там.

```bash
uv run python -c "import platform, sys; print(platform.python_implementation(), sys.implementation.name)"
uv python list | grep -E '^(pypy|graalpy)'
```

```text
CPython cpython
pypy-3.11.13-macos-aarch64-none                     <download available>
pypy-3.10.16-macos-aarch64-none                     <download available>
pypy-3.9.19-macos-aarch64-none                      <download available>
pypy-3.8.16-macos-aarch64-none                      <download available>
graalpy-3.12.0-macos-aarch64-none                   <download available>
graalpy-3.11.0-macos-aarch64-none                   <download available>
graalpy-3.10.0-macos-aarch64-none                   <download available>
graalpy-3.8.5-macos-aarch64-none                    <download available>
```

Альтернативи існують, і uv уміє їх ставити. PyPy має JIT-компілятор і помітно швидший на довгих циклах чистого Python, GraalPy працює поверх JVM. Обидва відстають від CPython за версіями мови, як видно зі списку: найновіший PyPy реалізує 3.11. І обидва гірше сумісні з розширеннями на C і Rust, на яких тримається значна частина екосистеми: такі пакети на них або повільніші, або не мають готових збірок. Для бекенду на FastAPI вибір без варіантів: CPython.

> **JS-аналог.** Як V8, SpiderMonkey і JavaScriptCore для JavaScript, з однією важливою різницею: окремого стандарту на кшталт ECMA-262 немає. Є Python Language Reference і поведінка CPython, і коли вони розходяться, інші реалізації підлаштовуються під CPython. Тому "Python" у розмові без уточнень завжди означає CPython.

Нова мінорна версія CPython виходить щороку в жовтні (PEP 602): 3.12 у 2023, 3.13 у 2024, 3.14 у 2025. Кожна підтримується п'ять років: перші два роки отримує звичайні виправлення, далі лише виправлення безпеки. Мінорне оновлення тут не semver-minor: з'являється синтаксис, а застарілі модулі видаляють зі стандартної бібліотеки. `distutils`, на якому роками стояли скрипти збірки, у 3.9 ще є, а з 3.12 його вже немає.

```bash
python3 -c "import distutils; print(distutils.__name__)"
uv run --python 3.12 python -c "import distutils"
```

```text
distutils
ModuleNotFoundError: No module named 'distutils'
```

У другому випадку traceback скорочено до останнього рядка.

Для курсу ставимо 3.12. Платформа запускає завдання в Pyodide, а це CPython 3.12 у браузері; `.venv` курсу теж 3.12. Версія достатньо нова для всього синтаксису курсу і достатньо стара, щоб усі бібліотеки капстоуну мали під неї готові збірки. Найновіша версія в перші місяці після релізу часто не має готових wheel-ів для частини пакетів, і `uv add` раптом починає компілювати щось із C. Практичне правило для робочих проєктів: остання мінорна мінус одна. Збірки з позначкою `+freethreaded` у списку uv це експериментальний CPython без GIL, до нього повернемось у m5-l08.

Версію інтерпретатора, в якому виконується код, дає `sys.version_info`. Це кортеж з іменованими полями, і порівнюють його з кортежем, а не з рядком: так пишуться перевірки "потрібен 3.12 або новіший".

```python live
import sys

print(sys.version_info[:2])
print(sys.version_info >= (3, 12))
print(sys.version_info.major, sys.version_info.minor)
```

```text
(3, 12)
True
3 12
```

<!-- task: t1 -->

## Три способи поставити Python: Homebrew, pyenv, uv

Homebrew ставить Python у `/opt/homebrew/Cellar/python@3.X/` і кладе посилання в `/opt/homebrew/bin`. Головна проблема в тому, що це Python для самого Homebrew: від нього залежать інші формули, `brew upgrade` оновлює його без вашого відома, а неверсійна команда `python3` з Homebrew завжди вказує на найновішу встановлену гілку. На цій машині це вже 3.14.

```bash
ls -l /opt/homebrew/bin/python3
```

```text
lrwxr-xr-x  1 mac  admin  40 Jun  7 02:23 /opt/homebrew/bin/python3 -> ../Cellar/python@3.14/3.14.5/bin/python3
```

pyenv (на цій машині не встановлений, тому без виводу) збирає CPython з вихідного коду в `~/.pyenv/versions/3.12.x` і підміняє `python` у `PATH` своїми shim-скриптами (shim це жаргон, не офіційний термін Python: маленька обгортка, яка вирішує, який справжній бінарник запустити). Версія вибирається файлом `.python-version`, тим самим, що читає uv. pyenv надійний і досі живе в багатьох командах, але збірка займає хвилини й потребує системних бібліотек для компіляції.

uv ставить готові збірки проєкту python-build-standalone у власний каталог за кілька секунд, без компіляції й без shim-ів. У `PATH` він кладе лише версійне посилання на кшталт `python3.12`, а `python3` і `python` не чіпає. На цій машині 3.12 уже встановлено, тому повторна команда нічого не робить; на чистій машині тут з'явиться рядок про завантаження.

```bash
uv python install 3.12
uv python dir
ls ~/.local/share/uv/python
ls -l ~/.local/bin/python3.12
```

```text
Python 3.12 is already installed
/Users/mac/.local/share/uv/python
cpython-3.10.19-macos-aarch64-none
cpython-3.12.12-macos-aarch64-none
lrwxr-xr-x@ 1 mac  staff  83 Oct 18 02:45 /Users/mac/.local/bin/python3.12 -> /Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12
```

| | Homebrew | pyenv | uv |
|---|---|---|---|
| Де лежить | `/opt/homebrew/Cellar/python@3.X` | `~/.pyenv/versions/3.X.Y` | `~/.local/share/uv/python/cpython-3.X.Y-...` |
| Як потрапляє | готова збірка Homebrew | компіляція з вихідного коду | готова збірка python-build-standalone |
| Хто керує | `brew`, оновлюється разом з іншими формулами | ви, `pyenv install` / `pyenv global` | ви, `uv python install` / `uv python pin` |
| Що в `PATH` | `python3` на найновішу гілку + `python3.X` | shim `python`, `python3` | лише `python3.X` |
| Вибір версії | вручну, повним іменем | `.python-version`, `pyenv global` | `.python-version`, `requires-python`, `--python` |

Рекомендація на 2026 рік: uv. Його пише Astral, та сама команда, що робить ruff (m0-l04), і він закриває одним інструментом і версії інтерпретатора, і залежності, і запуск утиліт. pyenv лишається нормальним вибором у командах, де він уже стоїть. Homebrew-Python лишіть самому Homebrew.

> **Під капотом.** Віртуальне оточення не копіює інтерпретатор, а зберігає шлях до його каталогу в полі `home` файлу `pyvenv.cfg`. Для Homebrew це `opt/python@3.14`: патч-оновлення оточення переживе, а от коли залежні формули переїдуть на наступну гілку і `brew autoremove` прибере `python@3.14` як непотрібний, усі оточення на ньому зламаються разом. До того ж неверсійний `python3` "пливе": таке саме `python3 -m venv` через рік дасть іншу мінорну версію.

```bash
/opt/homebrew/bin/python3 -m venv brew-venv && head -3 brew-venv/pyvenv.cfg
```

```text
home = /opt/homebrew/opt/python@3.14/bin
include-system-site-packages = false
version = 3.14.5
```

Оточення курсу, створене через uv, вказує на конкретну збірку 3.12.12, і вона зникне лише після вашої явної команди `uv python uninstall`. Команда з кореня репозиторію курсу:

```bash
head -1 .venv/pyvenv.cfg
```

```text
home = /Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin
```

Аналогія з nvm напрошується, і вона правильна наполовину. Обидва тримають кілька версій рантайму в домашньому каталозі й показують, що встановлено.

```bash
nvm ls
uv python list --only-installed
```

```text
      v12.22.12 *
       v16.20.2 *
->      v24.9.0 *
default -> node (-> v24.9.0 *)
cpython-3.14.5-macos-aarch64-none     /opt/homebrew/bin/python3.14 -> ../Cellar/python@3.14/3.14.5/bin/python3.14
cpython-3.14.5-macos-aarch64-none     /opt/homebrew/bin/python3 -> ../Cellar/python@3.14/3.14.5/bin/python3
cpython-3.12.12-macos-aarch64-none    /Users/mac/.local/bin/python3.12 -> /Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12
cpython-3.12.12-macos-aarch64-none    /Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12
cpython-3.11.15-macos-aarch64-none    /opt/homebrew/bin/python3.11 -> ../Cellar/python@3.11/3.11.15_1/bin/python3.11
cpython-3.10.19-macos-aarch64-none    /Users/mac/.local/share/uv/python/cpython-3.10.19-macos-aarch64-none/bin/python3.10
cpython-3.9.6-macos-aarch64-none      /usr/bin/python3
```

Вивід `nvm ls` обрізано до перших чотирьох рядків. Різниця в двох місцях. Перше: uv бачить не лише свої версії, а й Homebrew-івські та системну, бо шукає інтерпретатори всюди. Друге важливіше: `nvm use` перемикає `node` у поточному shell, змінюючи `PATH`, а в uv немає "поточної версії" на рівні shell взагалі; версія вибирається для кожної команди окремо, за конфігом проєкту. Тому точніше казати, що uv це nvm, npm і npx в одному: `uv python` закриває роль nvm, `uv add` і `uv sync` роль npm, `uvx` роль npx (останні два в m0-l02).

<!-- task: q2 -->

## Яка версія активна: питання без однієї відповіді

У Node "активна версія" це те, що повертає `node --version`. У Python на це питання три різні відповіді залежно від того, хто питає.

```bash
python --version
which python
python3 --version
uv python find
uv run python --version
uv run which python
```

```text
zsh: command not found: python
python not found
Python 3.9.6
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12
Python 3.12.12
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python
```

Shell шукає `python3` у `PATH` і знаходить системний 3.9, а `python` не знаходить зовсім. Усередині `uv run` команда `python` з'являється, бо uv на час запуску ставить першим у `PATH` каталог вибраного інтерпретатора, а в проєкті `.venv/bin`. uv має власний порядок пошуку і за замовчуванням віддає перевагу своїм керованим версіям (managed, офіційний термін uv) перед тим, що лежить у `PATH`: тому `uv python find` дає 3.12.12, хоча Homebrew-івський 3.14 теж доступний. `uv run` додає до цього конфіг проєкту, про нього в наступному розділі. Звичка питати "а який у мене Python" корисна лише з уточненням "для якої команди".

> **Під капотом.** uv вибирає інтерпретатор у такому порядку: прапорець `--python`, файл `.python-version` у поточному каталозі або вище, `requires-python` проєкту, далі керовані версії uv, далі `PATH`. Перше, що підходить, виграє. Shell про все це не знає і просто бере перший `python3` у `PATH`.

Кілька версій поруч працюють без перемикань: `--python` вибирає версію для однієї команди, нічого не змінюючи глобально.

```bash
for v in 3.9 3.10 3.11 3.12 3.14; do uv run --python $v python --version; done
```

```text
Python 3.9.6
Python 3.10.19
Python 3.11.15
Python 3.12.12
Python 3.14.5
```

Тут 3.9 це Apple-івський з `/usr/bin`, 3.11 і 3.14 з Homebrew, 3.10 і 3.12 з uv. uv не важливо, хто поставив інтерпретатор, якщо той підходить під запит. Саме так перевіряють, що бібліотека працює на кількох версіях: у JS для цього міняли б Node через nvm між прогонами.

<!-- task: q3 -->

## Закріпити версію за проєктом: `.python-version` і `requires-python`

`uv python pin` пише в поточному каталозі файл `.python-version` з однією версією всередині. Це прямий аналог `.nvmrc`, з тією різницею, що його не треба активувати: `uv run` читає файл сам при кожному запуску.

```bash
mkdir versions-demo && cd versions-demo
uv python pin 3.12
cat .python-version
uv run python --version
uv python pin 3.10
uv run python --version
```

```text
Pinned `.python-version` to `3.12`
3.12
Python 3.12.12
Updated `.python-version` from `3.12` -> `3.10`
Python 3.10.19
```

`.python-version` відповідає на питання "яким інтерпретатором запускати проєкт у мене зараз". Друге питання, "з якими версіями проєкт взагалі сумісний", живе в `pyproject.toml`, у полі `requires-python` секції `[project]`. Це аналог `engines.node` у `package.json`. `pyproject.toml` загалом розбирається в m0-l02; тут достатньо трьох рядків, щоб побачити, як два файли взаємодіють.

```bash
printf '[project]\nname = "versions-demo"\nversion = "0.1.0"\nrequires-python = ">=3.12"\n' > pyproject.toml
cat .python-version
uv run python --version
```

```text
3.10
Using CPython 3.10.19
error: The Python request from `.python-version` resolved to Python 3.10.19, which is incompatible with the project's Python requirement: `>=3.12` (from `project.requires-python`)
Use `uv python pin` to update the `.python-version` file to a compatible version
```

```bash
uv python pin 3.10
uv python pin 3.12
uv run python --version
```

```text
error: The requested Python version `3.10` is incompatible with the project `requires-python` value of `>=3.12`.
Updated `.python-version` from `3.10` -> `3.12`
Using CPython 3.12.12
Creating virtual environment at: .venv
Python 3.12.12
```

> **JS-аналог.** `engines` у `package.json` npm за замовчуванням лише попереджає, а `.nvmrc` ніхто не перевіряє, поки ви самі не скажете `nvm use`. В uv обидва файли обов'язкові до виконання: суперечність між `.python-version` і `requires-python` це помилка до запуску коду, а не warning у консолі. Поява `.venv` і `uv.lock` після першого успішного `uv run` теж автоматична, детально в m0-l02.

`requires-python` має ще одну роль: резолвер залежностей підбирає версії пакетів, сумісні з усім діапазоном, а не лише з вашим інтерпретатором. Якщо в діапазоні є 3.12, пакет, що вимагає 3.13, не потрапить у lockfile, навіть якщо локально стоїть 3.14. Тому `requires-python` пишуть діапазоном (`>=3.12`), а `.python-version` конкретною версією.

> **Для капстоуну.** Репозиторій FormBuilder отримає `requires-python = ">=3.12"` і `.python-version` з `3.12` у m0-l02. Той самий пін потім читатиме Dockerfile з uv у m7-l07, тож версія на ноутбуці, у CI й у контейнері збігатиметься без окремого документа "яку версію ставити".

<!-- task: q4 -->

Порівняння версій це місце, де JS-звичка підводить уже в коді. Рядки порівнюються посимвольно, тому `"3.10"` менше за `"3.9"`. У JS вбудованого порівняння масивів немає, і для версій тягнуть пакет `semver`. У Python кортежі порівнюються поелементно з коробки, і саме на цьому стоїть `sys.version_info >= (3, 12)`.

```ts
console.log("3.10" >= "3.9"); // false
const v = "3.10.19".split(".").map(Number);
console.log(v); // [ 3, 10, 19 ]
```

```python live
print("3.10" >= "3.9")
print((3, 10) >= (3, 9))
print((3, 12) >= (3, 12, 1))
print(tuple(int(p) for p in "3.12.12".split(".")))
```

```text
False
True
False
(3, 12, 12)
```

Розходження в тому, що JS після `split` і `map(Number)` має масив, з яким `>=` не працює як треба, а Python має кортеж, з яким працює: перші елементи порівнюються, при рівності наступні, а коротший кортеж зі спільним префіксом менший. Звідси `(3, 12) < (3, 12, 1)`: вимога "3.12.1" суворіша за "3.12". Для повноцінних специфікаторів на кшталт `>=3.12,<4` є бібліотека `packaging`, але для перевірки версії інтерпретатора кортежу досить.

<!-- task: t2 -->

<!-- task: t3 -->

## `python`, `python3` і shebang

Команда `python` без цифри історично означала Python 2. Коли з'явився Python 3, дистрибутиви не могли перевизначити `python` без ризику зламати старі скрипти, тож рекомендація PEP 394 така: на Unix-системах Python 3 викликається як `python3`, а `python` може не існувати або вказувати на що завгодно. macOS пішла найчистішим шляхом: `python` у системі немає зовсім. Усередині віртуального оточення ж є всі три імені, і всі ведуть на той самий інтерпретатор.

```bash
ls /usr/bin/ | grep -i '^python'
ls -l .venv/bin/python*
```

```text
python3
lrwxr-xr-x@ 1 mac  wheel  83 Oct 18 03:49 .venv/bin/python -> /Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12
lrwxr-xr-x@ 1 mac  wheel   6 Oct 18 03:49 .venv/bin/python3 -> python
lrwxr-xr-x@ 1 mac  wheel   6 Oct 18 03:49 .venv/bin/python3.12 -> python
```

Звідси правило: у проєкті пишіть `python` (усередині `uv run` або активованого оточення він є завжди), у скриптах і документації поза проєктом `python3`. Глобально "лагодити" відсутність `python` не треба. `alias python=python3` у `.zshrc` дасть вам Apple-івський 3.9 під новим іменем. Посилання в `/usr/bin` створити не вийде: каталог захищений System Integrity Protection. На Linux такий самий трюк з `/usr/bin/python3` ламає системні утиліти, написані на Python, і саме від цього захищає PEP 668.

```bash
csrutil status
```

```text
System Integrity Protection status: enabled.
```

Shebang (термін з Unix, не з Python: перший рядок файлу, що починається з `#!` і каже ядру, чим виконувати файл) працює так само, як для Node-скриптів. `#!/usr/bin/env python3` означає "перший `python3` у `PATH`", і `env` нічого не знає ні про `.python-version`, ні про `.venv`. Скрипт нижче лежить у `versions-demo`, де закріплено 3.12 і вже є `.venv`, а прямий запуск однаково дає системний 3.9.

```python
#!/usr/bin/env python3
import sys

print(sys.version.split()[0], sys.executable)
```

```bash
chmod +x which_python.py
./which_python.py
uv run which_python.py
```

```text
3.9.6 /Library/Developer/CommandLineTools/usr/bin/python3
3.12.12 …/versions-demo/.venv/bin/python3
```

Шлях у другому рядку скорочено. `uv run` спершу знаходить інтерпретатор за правилами проєкту, а потім запускає ним файл, тому shebang у цьому разі ігнорується. Для окремого скрипта поза проєктом є shebang, який сам кличе uv: `env -S` дозволяє передати аргументи, а блок `# /// script` (inline-метадані за PEP 723, офіційна назва "inline script metadata") каже uv, яка версія потрібна. Такий файл можна запустити з будь-якого каталогу.

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///
import platform

print(platform.python_implementation(), platform.python_version())
```

```bash
chmod +x pinned.py
./pinned.py
cd .. && versions-demo/pinned.py
```

```text
CPython 3.12.12
CPython 3.12.12
```

> **Пастка.** Перевірка `if sys.version_info < (3, 12): sys.exit(...)` на початку скрипта рятує лише тоді, коли файл узагалі розбирається старою версією. Якщо нижче є `match` або `dict | None` в анотації функції, 3.9 впаде з `SyntaxError` чи `TypeError` раніше, ніж дійде до перевірки. Надійний захист це правильний інтерпретатор на вході: `uv run` або shebang з uv.

<!-- task: p1 -->

## Перевірка, що все працює, і перший погляд на REPL

Мінімальна перевірка встановлення: запустити інтерпретатор через uv і надрукувати повну версію. `sys.version` містить ще й дату збірки та компілятор, це зручно для баг-репортів. Друга традиційна перевірка, `import this`, друкує "The Zen of Python", дев'ятнадцять афоризмів про стиль мови; на них іноді посилаються в code review.

```bash
uv run python -c "import sys; print(sys.version)"
uv run python -c "import this" | head -4
```

```text
3.12.12 (main, Jan 27 2026, 23:41:44) [Clang 21.1.4 ]
The Zen of Python, by Tim Peters

Beautiful is better than ugly.
Explicit is better than implicit.
```

Вивід `import this` обрізано до перших рядків. `python` без аргументів відкриває REPL (Read-Eval-Print Loop: у документації Python це interactive interpreter або interactive mode, але слово REPL там теж уживається, тож на співбесіді доречні обидва). Як у `node`: рядок привітання, запрошення `>>>`, вираз друкується без `print`.

```text
Python 3.12.12 (main, Jan 27 2026, 23:41:44) [Clang 21.1.4 ] on darwin
Type "help", "copyright", "credits" or "license" for more information.
>>> 1 + 1
2
>>> exit
Use exit() or Ctrl-D (i.e. EOF) to exit
>>> exit()
```

Це запис реальної сесії `uv run python`. Вийти можна через `exit()` або Ctrl-D; голе `exit` у 3.12 лише друкує підказку, бо це об'єкт, а не команда. З 3.13 новий REPL приймає `exit` без дужок. `.exit`, як у `node`, тут дає `SyntaxError: invalid syntax`. Усе інше про REPL, запуск файлів і `python -m` у m0-l03.

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **`pip install` як `npm i -g`.** Ставлять пакет або утиліту "глобально", бо так звикли з `npm i -g typescript`. На Homebrew- чи uv-Python отримують `externally-managed-environment`, на Apple-івському 3.9 пакет мовчки осідає в спільному user site. Правильно: пакети проєкту через віртуальне оточення, консольні утиліти через `uv tool install` або `uvx` (m0-l02).

   ```bash
   /opt/homebrew/bin/python3 -m pip install --dry-run requests   # error: externally-managed-environment
   ```

2. **Пошук одного "поточного" Python, як `node` після `nvm use`.** Очікують, що є команда, яка перемикає Python для всього shell, і дивуються, чому `python3 --version` після `uv python install 3.12` показує 3.9. Правильно: версію вибирає кожна команда окремо; у проєкті це `uv run`, разовий запуск іншої версії `uv run --python 3.11`.

   ```bash
   python3 --version              # Python 3.9.6, системний з PATH
   uv run python --version        # Python 3.12.12, за правилами uv
   ```

3. **`alias python=python3` або посилання в системний каталог.** Хочуть, щоб `python` працював, як у туторіалах. Отримують старий системний Python під новим ім'ям, а на Linux ризикують зламати системні утиліти. Правильно: `python` використовувати лише всередині `uv run` або оточення, де він є завжди.

   ```bash
   ls /usr/bin/ | grep -i '^python'   # python3, і більше нічого
   ```

4. **`#!/usr/bin/env python3` у надії на `.venv` проєкту.** Shebang не знає про проєкт і бере перший `python3` у `PATH`. Правильно: запускати через `uv run script.py` або ставити shebang з uv.

   ```python
   #!/usr/bin/env -S uv run --script
   # /// script
   # requires-python = ">=3.12"
   # ///
   ```

5. **Порівняння версій рядками.** `"3.10" >= "3.9"` дає `False` і в JS, і в Python. Правильно: кортежі цілих чисел, а для версії інтерпретатора готовий `sys.version_info`.

   ```python
   import sys
   print(sys.version_info >= (3, 12))      # True
   print("3.10.19" >= "3.9")               # False
   ```

6. **Пошук `package.json` і `.nvmrc`.** У Python-проєкті їхні ролі виконують `pyproject.toml` з `requires-python` і `.python-version`. `requirements.txt` це старіший спосіб описати залежності, а не маніфест проєкту.

   ```bash
   ls -a                 # .python-version  .venv  pyproject.toml  uv.lock
   ```

7. **Найновіша версія, бо в Node беруть Current.** Ставлять 3.14 у робочий проєкт у перший тиждень після релізу, а частина залежностей ще не має для неї готових збірок. Правильно: остання мінорна мінус одна, закріплена пінами.

   ```bash
   uv python pin 3.12
   ```

## Підсумок

- `/usr/bin/python3` на Mac належить Apple і Xcode CLT, це 3.9 без підтримки; для розробки його не використовують і пакети в нього не ставлять.
- PEP 668: Homebrew- і uv-Python позначені як externally managed, `pip install` у них відмовляє. Пакети живуть лише у віртуальних оточеннях.
- "Python" у розмові означає CPython. PyPy і GraalPy існують, але відстають за версіями й сумісністю з C-розширеннями.
- Нова мінорна версія щороку в жовтні, підтримка п'ять років; мінорне оновлення може видаляти модулі. Для курсу 3.12.
- uv ставить готові збірки в `~/.local/share/uv/python`, кладе в `PATH` лише `python3.X` і не перемикає нічого глобально; uv це nvm, npm і npx в одному.
- "Активна версія" залежить від того, хто питає: shell бере перший `python3` у `PATH`, uv свої керовані версії, `uv run` ще й конфіг проєкту.
- `.python-version` це `.nvmrc` (яку версію запускати), `requires-python` це `engines` (з якими сумісний проєкт), і uv перевіряє їх узгодженість до запуску коду.
- Версії порівнюють кортежами: `sys.version_info >= (3, 12)`, а не рядками.
- `python` на macOS немає, `python3` системний, у `.venv` є обидва. Shebang `env python3` бере перший у `PATH`; для незалежних скриптів `#!/usr/bin/env -S uv run --script`.

## Що далі

Наступний урок m0-l02 про віртуальні оточення, pip і uv: там з'являться `.venv`, `uv.lock`, `uv add` і повний `pyproject.toml`, які в цьому уроці лише промайнули у виводі `uv run`. Звідси знадобиться розуміння, що оточення прив'язане до конкретного інтерпретатора через `pyvenv.cfg`, і що `requires-python` разом з `.python-version` вирішують, яким саме. Після нього m0-l03 розбирає REPL і запуск скриптів детально.
