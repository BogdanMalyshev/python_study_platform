---
id: m0-l02
module: m0-start
title: "Віртуальне оточення, pip, uv, pyproject.toml"
summary: "Учень розуміє, що venv це посилання на інтерпретатор плюс власний site-packages, а активація лише змінює PATH; веде проєкт через uv (init, add, remove, lock, sync, run) з pyproject.toml і uv.lock замість package.json і package-lock.json, читає специфікатори версій PEP 440 і знає, чому requirements.txt не lockfile."
duration_min: 60
prerequisites: [m0-l01]
---

## Пакети без `node_modules`: `sys.path` і `site-packages`

У Node залежності за замовчуванням лежать поруч із кодом: `npm install` створює `node_modules`, а `import` шукає пакет, піднімаючись від файлу вгору по директоріях. Python влаштований навпаки: пакети належать інтерпретатору, а не проєкту. `import pydantic` не шукає ні папку проєкту, ні батьківські директорії; він перебирає список `sys.path`, який інтерпретатор складає при старті від власного місця встановлення. Останній пункт цього списку, `site-packages`, і є місцем, куди інсталятор кладе пакети.

```bash
python3.12 -c "import sys; print(sys.prefix); print(*sys.path, sep='\n')"
```

```text
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none

/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python312.zip
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12/lib-dynload
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12/site-packages
```

`sys.prefix` це корінь інсталяції, `sys.path` це список, де шукаються модулі: порожній рядок на першому місці означає поточну директорію (як він туди потрапляє, розібрано в m0-l03), далі стандартна бібліотека, і наприкінці `site-packages`. Термін `site-packages` офіційний: так називається директорія сторонніх пакетів у документації модуля `site`.

Звідси наслідок: без додаткових кроків `site-packages` один на інтерпретатор, тобто один набір пакетів на всі проєкти на машині. Це як якби `npm install` завжди працював як `npm install -g`. Два проєкти, яким потрібні pydantic 1 і pydantic 2, на одному інтерпретаторі не уживуться: версія пакета в `site-packages` може бути тільки одна.

Тому сучасні інсталяції Python цей глобальний `site-packages` закривають від ручної установки. Python 3.12 від uv з m0-l01 позначений як externally managed environment (офіційний термін PEP 668), і `pip install` поза віртуальним оточенням відмовляє ще до завантаження. Brew-Python і системний `/usr/bin/python3` поводяться так само, детально в m0-l01.

```bash
python3.12 -m pip install pydantic
```

```text
error: externally-managed-environment

× This environment is externally managed
╰─> This Python installation is managed by uv and should not be modified.

note: If you believe this is a mistake, please contact your Python installation or OS distribution provider. You can override this, at the risk of breaking your Python installation or OS, by passing --break-system-packages.
hint: See PEP 668 for the detailed specification.
```

Віртуальне оточення (virtual environment, офіційна назва в документації, скорочено venv) розв'язує це на рівні інтерпретатора. Це папка, яка для Python виглядає як окрема інсталяція зі своїм `site-packages`, але без копії самого інтерпретатора. Пакети проєкту лягають у неї, базовий Python лишається чистим, і кожен проєкт має свій набір версій. Найближчий JS-аналог саме `node_modules`, з різницею, що venv прив'язаний до конкретного інтерпретатора: це `node_modules` і `.nvmrc` в одній папці, причому `.nvmrc` уже застосований.

> **JS-аналог.** Правило "один venv на проєкт" це те саме, що "один `node_modules` на проєкт". Спільний venv для кількох проєктів повертає ту саму проблему, від якої venv рятує: один `site-packages`, одна версія кожного пакета, і оновлення в одному проєкті ламає інший. Venv дешевий (12 МБ разом з pip, близько двох секунд на створення), тому його не шарять, а перестворюють.

## Що лежить у `.venv`

Venv створює модуль стандартної бібліотеки `venv` (`python -m`, тобто запуск модуля як програми, детально в m0-l03). Аргумент це шлях до нової папки. Назва `.venv` у корені проєкту не обов'язкова, але це конвенція, яку за замовчуванням шукають uv, VS Code, PyCharm і шаблони `.gitignore`. Тут і далі довгий шлях до тимчасової папки, де запускались приклади, скорочено до `…`.

```bash
python3.12 -m venv .venv
ls .venv
ls -l .venv/bin
cat .venv/pyvenv.cfg
ls .venv/lib/python3.12/site-packages
```

```text
bin
include
lib
pyvenv.cfg

-rw-r--r--@ 1 mac  wheel  9033 Oct 18 03:48 Activate.ps1
-rw-r--r--@ 1 mac  wheel  2402 Oct 18 03:48 activate
-rw-r--r--@ 1 mac  wheel  1038 Oct 18 03:48 activate.csh
-rw-r--r--@ 1 mac  wheel  2313 Oct 18 03:48 activate.fish
-rwxr-xr-x@ 1 mac  wheel   360 Oct 18 03:48 pip
-rwxr-xr-x@ 1 mac  wheel   360 Oct 18 03:48 pip3
-rwxr-xr-x@ 1 mac  wheel   360 Oct 18 03:48 pip3.12
lrwxr-xr-x@ 1 mac  wheel    10 Oct 18 03:48 python -> python3.12
lrwxr-xr-x@ 1 mac  wheel    10 Oct 18 03:48 python3 -> python3.12
lrwxr-xr-x@ 1 mac  wheel    32 Oct 18 03:48 python3.12 -> /Users/mac/.local/bin/python3.12

home = /Users/mac/.local/bin
include-system-site-packages = false
version = 3.12.12
executable = /Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12
command = /Users/mac/.local/bin/python3.12 -m venv …/demo/.venv

pip
pip-25.0.1.dist-info
```

Чотири речі всередині. `bin/` містить `python`, і це симлінк на інтерпретатор, з якого venv створено: нічого не скопійовано, стандартна бібліотека теж береться з базової інсталяції. Там само скрипти `activate` для різних shell і `pip`, який ставить пакети саме в цей venv. `lib/python3.12/site-packages/` це той самий `site-packages`, тільки свій і майже порожній: у ньому лише pip. `pyvenv.cfg` це маркер venv і його конфіг. `include/` потрібна для збирання C-розширень і зазвичай порожня.

> **Під капотом.** Інтерпретатор при старті шукає `pyvenv.cfg` поруч зі своїм виконуваним файлом або на рівень вище. Якщо знайшов, `sys.prefix` стає папкою venv, `site-packages` береться з неї, а `home` підказує, де лежить справжній інтерпретатор зі стандартною бібліотекою. `include-system-site-packages = false` означає, що пакети базового Python у цьому venv не видно. Ніякої змінної оточення для цього не потрібно, тому `sys.prefix != sys.base_prefix` і є канонічна перевірка "я у venv".

```bash
.venv/bin/python -c "import sys; print(sys.prefix); print(sys.base_prefix); print(sys.path[-1])"
```

```text
…/demo/.venv
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none
…/demo/.venv/lib/python3.12/site-packages
```

Саме тому venv працює без жодної активації: досить запустити `python` з `.venv/bin`, і інтерпретатор сам знайде свій `pyvenv.cfg`.

> **Пастка.** Venv не переноситься. `pyvenv.cfg` і shebang-рядки скриптів у `bin/` містять абсолютні шляхи. Перейменували папку проєкту, скопіювали проєкт разом з `.venv` на іншу машину або в Docker-образ, і скрипти перестають запускатися. Venv не копіюють, а перестворюють з lockfile (розділ про `uv sync` нижче).

```bash
head -1 .venv/bin/pip
cd .. && mv demo demo-moved && cd demo-moved
.venv/bin/pip --version
```

```text
#!…/demo/.venv/bin/python3.12
zsh:1: .venv/bin/pip: bad interpreter: /private/tmp/claude-501/…: no such file or directory
```

## Активація змінює лише `PATH`

`source .venv/bin/activate` не перемикає Python у якийсь режим. Це shell-скрипт, який дописує `.venv/bin` на початок `PATH`, експортує `VIRTUAL_ENV`, додає `(.venv)` у prompt і оголошує shell-функцію `deactivate`, що повертає старі значення. Після цього слово `python` у терміналі просто знаходиться першим у `.venv/bin`.

```bash
which python
source .venv/bin/activate
which python
echo $VIRTUAL_ENV
echo $PATH | tr ':' '\n' | head -2
python --version
deactivate
which python
```

```text
python not found
…/demo/.venv/bin/python
…/demo/.venv
…/demo/.venv/bin
/Users/mac/.local/bin
Python 3.12.12
python not found
```

Перший `python not found` не помилка: uv з m0-l01 кладе в `PATH` лише `python3.12`, а голий `python` з'являється тільки всередині активованого venv. Ось рядки скрипта, які роблять усю роботу:

```bash
grep -n -E "^ *(PATH=|export PATH|export VIRTUAL_ENV=)|deactivate \(\)" .venv/bin/activate
```

```text
4:deactivate () {
7:        PATH="${_OLD_VIRTUAL_PATH:-}"
8:        export PATH
49:        export VIRTUAL_ENV=…/demo/.venv
54:PATH="$VIRTUAL_ENV/"bin":$PATH"
55:export PATH
```

З цього два наслідки. Активація діє лише в поточній сесії shell: нова вкладка терміналу знову бачить базовий Python, і `import pydantic` у ній падає з `ModuleNotFoundError`. І активація не потрібна взагалі, якщо викликати інтерпретатор venv за шляхом: `.venv/bin/python script.py`, `.venv/bin/python -m pytest`. Скрипти, Makefile, CI і Dockerfile пишуть саме так або через `uv run` (нижче), і ніколи через `source`.

> **JS-аналог.** `npm run test` на час виконання додає `node_modules/.bin` у `PATH`, тому в `scripts` пишуть `jest`, а не `./node_modules/.bin/jest`. `activate` робить те саме, але назавжди для сесії, а `uv run` рівно як `npm run`: лише для однієї команди.

IDE знаходить інтерпретатор за тією самою логікою: їй потрібен шлях до `.venv/bin/python`, а не активація. Розширення Python для VS Code і PyCharm шукають `.venv` у корені відкритої папки й пропонують його як інтерпретатор проєкту; інтегрований термінал VS Code після цього активує його сам. Якщо venv лежить деінде або IDE вибрала не той, шлях задають явно, у VS Code через `Python: Select Interpreter` або в налаштуваннях workspace:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python"
}
```

<!-- task: q1 -->

## pip і `requirements.txt`

pip це стандартний інсталятор (офіційна назва, PyPA), він іде разом з Python і ставить пакети в `site-packages` того інтерпретатора, яким запущений. Тому надійний виклик це `python -m pip`, а не голий `pip`: з першого видно, в який Python піде пакет (детально в m0-l03). Специфікатор версії беруть у лапки, про причину в callout нижче.

```bash
.venv/bin/python -m pip install "pydantic>=2,<3"
```

```text
Installing collected packages: typing-extensions, annotated-types, typing-inspection, pydantic-core, pydantic
Successfully installed annotated-types-0.8.0 pydantic-2.14.1 pydantic-core-2.50.1 typing-extensions-4.16.0 typing-inspection-0.4.4
```

Вивід скорочено до двох останніх рядків. Пакет і його транзитивні залежності лягли в `.venv/lib/python3.12/site-packages`, і базовий інтерпретатор їх не бачить:

```bash
ls .venv/lib/python3.12/site-packages
python3.12 -c "import pydantic"
```

```text
__pycache__
annotated_types
annotated_types-0.8.0.dist-info
pip
pip-25.0.1.dist-info
pydantic
pydantic-2.14.1.dist-info
pydantic_core
pydantic_core-2.50.1.dist-info
typing_extensions-4.16.0.dist-info
typing_extensions.py
typing_inspection
typing_inspection-0.4.4.dist-info

Traceback (most recent call last):
  File "<string>", line 1, in <module>
ModuleNotFoundError: No module named 'pydantic'
```

Кожен пакет це код (`pydantic/`) плюс `*.dist-info` з метаданими: версія, залежності, список файлів. З цих метаданих працюють `pip list` (таблиця встановленого) і `pip freeze` (те саме у форматі `name==version`, придатному для `requirements.txt`).

```bash
.venv/bin/python -m pip list
.venv/bin/python -m pip freeze > requirements.txt
cat requirements.txt
```

```text
Package           Version
----------------- -------
annotated-types   0.8.0
pip               25.0.1
pydantic          2.14.1
pydantic_core     2.50.1
typing_extensions 4.16.0
typing-inspection 0.4.4

annotated-types==0.8.0
pydantic==2.14.1
pydantic_core==2.50.1
typing-inspection==0.4.4
typing_extensions==4.16.0
```

`requirements.txt` це історичний спосіб фіксації: файл, який `pip install -r requirements.txt` читає як список аргументів. Його досі побачите в кожному другому репозиторії й Dockerfile, але lockfile (жаргон, запозичений з npm і Cargo; офіційний стандартний формат з'явився лише в PEP 751) він не є з трьох причин. У ньому немає хешів, тож нічого не гарантує, що `pydantic==2.14.1` завтра буде тим самим файлом. Він не розрізняє прямі й транзитивні залежності: у файлі вище не видно, що проєкт просив лише pydantic, а `annotated-types` прийшов як залежність. І він знімок одного середовища: якщо його писати руками з діапазонами (`pydantic>=2`), транзитивні версії резолвляться заново при кожній установці, а якщо робити `freeze`, то він пінить усе, що лежало у venv, включно з випадковим сміттям.

```bash
python3.12 -m venv .venv2
.venv2/bin/python -m pip install --require-hashes -r requirements.txt
```

```text
Collecting annotated-types==0.8.0 (from -r requirements.txt (line 1))
  Using cached annotated_types-0.8.0-py3-none-any.whl (13 kB)
ERROR: Hashes are required in --require-hashes mode, but they are missing from some requirements. Here is a list of those requirements along with the hashes their downloaded archives actually had. Add lines like these to your requirements files to prevent tampering. (If you did not enable --require-hashes manually, note that it turns on automatically when any package has a hash.)
    annotated-types==0.8.0 --hash=sha256:f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0
```

Без `--require-hashes` той самий `pip install -r requirements.txt` спокійно відпрацює: перевіряти просто нічого. І ще одна різниця з npm видна на видаленні: `npm uninstall` прибирає з дерева те, що більше нікому не потрібне, а pip видаляє рівно один пакет і лишає його залежності сиротами.

```bash
.venv/bin/python -m pip uninstall -y pydantic
.venv/bin/python -m pip list
```

```text
Found existing installation: pydantic 2.14.1
Uninstalling pydantic-2.14.1:
  Successfully uninstalled pydantic-2.14.1
Package           Version
----------------- -------
annotated-types   0.8.0
pip               25.0.1
pydantic_core     2.50.1
typing_extensions 4.16.0
typing-inspection 0.4.4
```

> **Пастка.** У zsh і bash символи `>` і `<` у незахищеному аргументі це перенаправлення. `pip install pydantic>2` ставить pydantic без жодного обмеження, а свій вивід пише у файл з ім'ям `2`, і код завершення при цьому 0. Специфікатори версій у командному рядку завжди в лапках.

```bash
.venv/bin/python -m pip install pydantic>2
ls -A
```

```text
.venv
2
```

Останнє, що вміє pip і що знадобиться для власного коду: `pip install -e .` ставить у venv сам проєкт з поточної директорії як editable install (офіційний термін, PEP 660). У `site-packages` лягає не копія коду, а посилання на вихідники, тому зміни у файлах видно без перевстановлення, як після `npm link`. Для цього проєкту потрібна секція `[build-system]` у `pyproject.toml`, її генерує `uv init --package`:

```bash
uv init --package fb-core --python 3.12 --vcs none
cd fb-core
python3.12 -m venv .venv
.venv/bin/python -m pip install -e .
.venv/bin/python -c "import fb_core; print(fb_core.__file__)"
.venv/bin/fb-core
```

```text
Initialized project `fb-core` at `…/fb-core`
Successfully built fb-core
Installing collected packages: fb-core
Successfully installed fb-core-0.1.0
…/fb-core/src/fb_core/__init__.py
Hello from fb-core!
```

Вивід pip скорочено. `__file__` вказує в `src/`, а не в `site-packages`: це і є editable. У uv-проєкті з `[build-system]` ту саму роботу робить `uv sync` автоматично; src-layout і точка входу `fb-core` розібрані в m0-l06.

<!-- task: q4 -->

## uv: менеджер проєкту замість набору утиліт

uv (від Astral, тих самих, що зробили ruff) це одна утиліта на Rust замість pip, venv, pip-tools, pyenv і pipx. У m0-l01 він ставив інтерпретатори; тут він робить те, що в JS робить npm: створює проєкт, веде маніфест і lockfile, тримає `node_modules`-аналог у синхроні. Для нових проєктів у 2026 це стандарт де-факто, і саме він далі в курсі.

```bash
uv init forms-api --python 3.12
cd forms-api
ls -A
cat pyproject.toml
```

```text
Initialized project `forms-api` at `…/forms-api`
.git
.gitignore
.python-version
README.md
main.py
pyproject.toml

[project]
name = "forms-api"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.12"
dependencies = []
```

`uv init` зробив `git init`, `.gitignore`, `.python-version` з `3.12` (закріплення версії з m0-l01) і мінімальний `pyproject.toml`. Venv ще немає: uv створює його ліниво, при першій команді, якій він потрібен.

```bash
uv run main.py
ls -A
```

```text
Using CPython 3.12.12
Creating virtual environment at: .venv
Hello from forms-api!
.git
.gitignore
.python-version
.venv
README.md
main.py
pyproject.toml
uv.lock
```

Залежності додаються через `uv add`, dev-залежності через `uv add --dev`. Одна команда редагує `pyproject.toml`, резолвить дерево, оновлює `uv.lock` і синхронізує `.venv`, тобто робить те, що `npm install <pkg>` робить з `package.json`, `package-lock.json` і `node_modules`.

```bash
uv add "pydantic>=2.11"
uv add --dev pytest ruff mypy
cat pyproject.toml
```

```text
Resolved 6 packages in 212ms
Downloading pydantic-core (1.9MiB)
 Downloaded pydantic-core
Prepared 4 packages in 228ms
Installed 5 packages in 3ms
 + annotated-types==0.8.0
 + pydantic==2.14.1
 + pydantic-core==2.50.1
 + typing-extensions==4.16.0
 + typing-inspection==0.4.4
Resolved 18 packages in 17ms
Installed 11 packages in 25ms
 + ast-serialize==0.13.1
 + iniconfig==2.3.1
 + librt==0.16.0
 + mypy==2.4.0
 + mypy-extensions==1.1.0
 + packaging==26.3
 + pathspec==1.1.1
 + pluggy==1.7.0
 + pygments==2.21.0
 + pytest==9.1.1
 + ruff==0.17.1
[project]
name = "forms-api"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.11",
]

[dependency-groups]
dev = [
    "mypy>=2.4.0",
    "pytest>=9.1.1",
    "ruff>=0.17.1",
]
```

Зверніть увагу на `"pytest>=9.1.1"`: uv записує лише нижню межу, без верхньої. Це не недбалість, а позиція спільноти: верхні межі в Python-екосистемі часто дають нерозв'язні конфлікти між бібліотеками, а від несподіваних мажорних оновлень захищає lockfile, а не діапазон. Якщо верхня межа потрібна, її пишуть самі або просять uv через `--bounds` (поки що preview-функція), і для `0.x` він ставить межу так само, як `^` у npm.

```bash
uv add httpx --bounds major
grep -A4 '^dependencies' pyproject.toml
uv remove httpx
```

```text
warning: The `bounds` option is in preview and may change in any future release. Pass `--preview-features add-bounds` to disable this warning.
Resolved 24 packages in 167ms
Prepared 6 packages in 175ms
Installed 6 packages in 5ms
 + anyio==4.15.1
 + certifi==2026.7.22
 + h11==0.16.0
 + httpcore==1.0.9
 + httpx==0.28.1
 + idna==3.20
dependencies = [
    "httpx>=0.28.1,<0.29.0",
    "pydantic>=2.11",
]
Resolved 18 packages in 13ms
Uninstalled 6 packages in 13ms
 - anyio==4.15.1
 - certifi==2026.7.22
 - h11==0.16.0
 - httpcore==1.0.9
 - httpx==0.28.1
 - idna==3.20
```

На відміну від `pip uninstall`, `uv remove` прибрав і всі транзитивні залежності httpx, бо uv знає граф з lockfile. Дерево залежностей показує `uv tree`, аналог `npm ls`:

```bash
uv tree --no-dev
```

```text
Resolved 18 packages in 3ms
forms-api v0.1.0
└── pydantic v2.14.1
    ├── annotated-types v0.8.0
    ├── pydantic-core v2.50.1
    │   └── typing-extensions v4.16.0
    ├── typing-extensions v4.16.0
    └── typing-inspection v0.4.4
        └── typing-extensions v4.16.0
```

`uv run <команда>` запускає команду в оточенні проєкту: перед запуском перевіряє, що `uv.lock` відповідає `pyproject.toml`, а `.venv` відповідає `uv.lock`, доставляє відсутнє, і виконує команду з `.venv/bin` на початку `PATH` і з `VIRTUAL_ENV`, рівно як `activate`, але лише для цього процесу. Утиліти з dev-групи живуть у `.venv/bin`, як CLI з `node_modules/.bin`.

```bash
uv run which python
uv run sh -c 'echo $VIRTUAL_ENV'
which python
uv run ruff --version
uv run pytest --version
```

```text
…/forms-api/.venv/bin/python
…/forms-api/.venv
python not found
ruff 0.17.1
pytest 9.1.1
```

`uvx` це `npx`: запускає утиліту з PyPI в тимчасовому ізольованому оточенні, не чіпаючи проєкт. Версію пінять через `@`, як у npx. Поруч видно різницю: `uv run ruff` бере ruff проєкту з lockfile, `uvx ruff@0.15.0` бере вказану версію з кешу.

```bash
uvx ruff@0.15.0 --version
```

```text
Downloading ruff (9.6MiB)
 Downloaded ruff
Installed 1 package in 4ms
ruff 0.15.0
```

| npm | uv |
|---|---|
| `package.json` | `pyproject.toml` |
| `package-lock.json` | `uv.lock` |
| `node_modules/` | `.venv/` |
| `.nvmrc`, `engines` | `.python-version`, `requires-python` |
| `npm init` | `uv init` |
| `npm install <pkg>` | `uv add <pkg>` |
| `npm install -D <pkg>` | `uv add --dev <pkg>` |
| `npm uninstall <pkg>` | `uv remove <pkg>` |
| `npm install` | `uv sync` |
| `npm ci` | `uv sync --locked` (або `--frozen`, різниця нижче) |
| `npm ls` | `uv tree` |
| `npx <tool>` | `uvx <tool>` |
| `npm run <script>` | немає; `uv run <команда>` |
| `bin` у `package.json` | `[project.scripts]` |

> **Пастка.** Venv, створений uv, не містить pip. `.venv/bin/pip` не існує, і голий `pip install` у такому проєкті або піде в інший Python, або впаде. Для pip-подібних операцій у uv-проєкті є `uv pip install`, `uv pip list`, `uv pip show`, але залежності проєкту додають лише через `uv add`, інакше `uv sync` їх видалить.

```bash
ls .venv/bin/pip
```

```text
ls: .venv/bin/pip: No such file or directory
```

> **Пастка.** Міграція з `requirements.txt` через `uv add -r requirements.txt` переносить файл буквально. Якщо він зроблений `pip freeze`, усі транзитивні залежності стають прямими з точними пінами, і проєкт уже ніколи не оновить pydantic, не оновивши руками його внутрішні пакети.

```bash
# нова папка practice/m0-l02/pip-to-uv, у ній requirements.txt з розділу про pip
uv init --bare --python 3.12
uv python pin 3.12
uv add -r requirements.txt
grep -A6 '^dependencies' pyproject.toml
```

```text
Initialized project `pip-to-uv`
Pinned `.python-version` to `3.12`
Using CPython 3.12.12
Creating virtual environment at: .venv
Resolved 6 packages in 12ms
Installed 5 packages in 6ms
 + annotated-types==0.8.0
 + pydantic==2.14.1
 + pydantic-core==2.50.1
 + typing-extensions==4.16.0
 + typing-inspection==0.4.4
dependencies = [
    "annotated-types==0.8.0",
    "pydantic==2.14.1",
    "pydantic-core==2.50.1",
    "typing-extensions==4.16.0",
    "typing-inspection==0.4.4",
]
```

Правильно перенести в `dependencies` лише те, що код імпортує напряму, з діапазоном, а точні версії транзитивних віддати `uv.lock`. Після `uv remove` усіх п'яти й `uv add "pydantic>=2,<3"` у `dependencies` один рядок, а `uv tree` показує те саме дерево, що й вище.

<!-- task: p1 -->

## `uv.lock`, `uv sync` і CI

`uv.lock` це lockfile у форматі TOML: точні версії кожного пакета в дереві, джерело, хеші й URL усіх файлів. Його комітять, як `package-lock.json`, і не редагують руками.

```bash
wc -l uv.lock
head -5 uv.lock
grep -n -A 12 '^name = "pydantic"$' uv.lock
```

```text
     506 uv.lock
version = 1
revision = 3
requires-python = ">=3.12"
resolution-markers = [
    "python_full_version >= '3.15'",
317:name = "pydantic"
318-version = "2.14.1"
319-source = { registry = "https://pypi.org/simple" }
320-dependencies = [
321-    { name = "annotated-types" },
322-    { name = "pydantic-core" },
323-    { name = "typing-extensions" },
324-    { name = "typing-inspection" },
325-]
326-sdist = { url = "https://files.pythonhosted.org/packages/7c/0b/8e10b2e693af8ec54346a14caf36221334775975a747c9ceaa3f8371d96d/pydantic-2.14.1.tar.gz", hash = "sha256:94f478203dd03404682a1ada216965651dd74b1d2d5ffd62e00e0837caab5c26", size = 900362, upload-time = "2026-10-11T18:37:55.396Z" }
327-wheels = [
328-    { url = "https://files.pythonhosted.org/packages/35/ea/a56b9fe5066f3537b7882f77e9c5dfb26d8c2eefdaed9b5fc73d57b4dc22/pydantic-2.14.1-py3-none-any.whl", hash = "sha256:9195d967ec791692a04438115466764fb8b9a27b31f14a760437694f40d6b454", size = 488106, upload-time = "2026-10-11T18:37:53.437Z" },
329-]
```

Головна відмінність від `pip freeze`: lock універсальний. `resolution-markers` показують, що uv резолвив дерево одразу для всіх версій Python з `requires-python` і всіх платформ, тож той самий `uv.lock` дає відтворюване оточення на macOS розробника, у Linux-CI і в Docker. Для обміну з іншими інструментами є стандартний формат `pylock.toml` (PEP 751), uv вміє в нього експортувати командою `uv export --format pylock.toml`, а для старих Dockerfile та сама команда з `--format requirements-txt` дає `requirements.txt` уже з хешами.

`uv sync` приводить `.venv` точно до стану lockfile: доставляє відсутнє і видаляє зайве. Тому venv не бережуть, а перестворюють: видалити `.venv` і зробити `uv sync` це штатна операція, як `rm -rf node_modules && npm ci`. Прапорець `--no-dev` ставить лише робочі залежності, це прод-установка.

```bash
rm -rf .venv
uv sync
uv sync --no-dev
```

```text
Using CPython 3.12.12
Creating virtual environment at: .venv
Resolved 18 packages in 0.92ms
Installed 16 packages in 26ms
 + annotated-types==0.8.0
 + ast-serialize==0.13.1
 …
 + typing-inspection==0.4.4
Resolved 18 packages in 5ms
Uninstalled 11 packages in 113ms
 - ast-serialize==0.13.1
 …
 - ruff==0.17.1
```

Список пакетів скорочено. 16 пакетів за 26 мс це не мережа: uv тримає один глобальний кеш (`uv cache dir` показує `/Users/mac/.cache/uv`) і переносить файли з нього у venv через clone або hardlink, без копіювання, як store у pnpm. Тому сотня venv на машині коштує значно менше, ніж сотня `node_modules`.

Для CI важливо, що буде, коли `pyproject.toml` і `uv.lock` розійшлись, наприклад хтось дописав залежність руками й не запустив `uv lock`. Тут у uv два прапорці, і `npm ci` відповідає першому з них.

```bash
# у pyproject.toml руками дописано "rich>=13" у dependencies, uv lock не запускали
uv sync --locked
uv sync --frozen
uv run --frozen python -c "import rich"
```

```text
Resolved 21 packages in 142ms
The lockfile at `uv.lock` needs to be updated, but `--locked` was provided. To update the lockfile, run `uv lock`.
Audited 16 packages in 1ms
Traceback (most recent call last):
  File "<string>", line 1, in <module>
ModuleNotFoundError: No module named 'rich'
```

`--locked` перевіряє, що lock відповідає `pyproject.toml`, і падає, якщо ні: це поведінка `npm ci`, і саме її ставлять у CI, бо вона ловить забутий `uv lock`. `--frozen` взагалі не дивиться на `pyproject.toml` і ставить lock як є: тихо пропускає розбіжність, тому годиться лише там, де lock свідомо єдине джерело правди і резолв не повинен запускатися взагалі (Docker-збірка в m7). Звичне зіставлення "`npm ci` = `uv sync --frozen`" правильне наполовину: обидва не змінюють lock, але перевіряє узгодженість лише `--locked`. Виправлення розбіжності це `uv lock`:

```bash
uv lock
uv sync --locked
```

```text
Resolved 21 packages in 23ms
Added markdown-it-py v4.2.0
Added mdurl v0.1.2
Added rich v15.0.0
Resolved 21 packages in 9ms
Prepared 3 packages in 169ms
Installed 3 packages in 4ms
 + markdown-it-py==4.2.0
 + mdurl==0.1.2
 + rich==15.0.0
```

> **Під капотом.** `uv run` теж синхронізує, але неточно (inexact): доставляє відсутнє і не видаляє зайве, щоб не зносити те, що ви поставили для експерименту. Тому після прибирання `rich` з `pyproject.toml` він ще живе у venv, поки не запустити `uv sync`.

```bash
# "rich>=13" прибрано з pyproject.toml
uv run python -c "import rich; print('rich still here')"
uv sync
uv run python -c "import rich"
```

```text
rich still here
Resolved 18 packages in 6ms
Uninstalled 3 packages in 10ms
 - markdown-it-py==4.2.0
 - mdurl==0.1.2
 - rich==15.0.0
Traceback (most recent call last):
  File "<string>", line 1, in <module>
ModuleNotFoundError: No module named 'rich'
```

<!-- task: q3 -->

## `pyproject.toml` і специфікатори версій

`pyproject.toml` це стандартний файл проєкту (PEP 518 і PEP 621), а не формат uv: його читають pip, uv, hatch, poetry, pytest, ruff, mypy. Формат TOML, тобто коментарі дозволені, а замість вкладених об'єктів JSON таблиці в квадратних дужках. Таблиць чотири види. `[project]` це стандартні метадані: `name`, `version`, `requires-python`, `dependencies`, а також `optional-dependencies` і `scripts`. `[dependency-groups]` (PEP 735, офіційна назва dependency groups) це групи для розробки, які не публікуються разом з пакетом; група `dev` особлива тим, що `uv sync` ставить її за замовчуванням. `[tool.<назва>]` це конфіги інструментів, кожен читає лише свою таблицю. `[build-system]` з'являється, коли проєкт збирається як пакет, детально в m3-l02.

```toml
[project]
name = "forms-api"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.11",
]

[dependency-groups]
dev = [
    "mypy>=2.4.0",
    "pytest>=9.1.1",
    "ruff>=0.17.1",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"
```

Pytest і ruff підхоплюють свої таблиці самі, без окремих `pytest.ini` і `ruff.toml`. Після додавання тесту `tests/test_deps.py` видно, що pytest знайшов конфіг: `testpaths` і `-q` з `addopts` діють.

```bash
uv run pytest
uv run pytest -v | head -5
uv run ruff check
```

```text
.                                                                        [100%]
1 passed in 0.07s
============================= test session starts ==============================
platform darwin -- Python 3.12.12, pytest-9.1.1, pluggy-1.7.0
rootdir: …/forms-api
configfile: pyproject.toml
testpaths: tests
All checks passed!
```

> **JS-аналог.** Поля зіставляються майже один до одного: `engines.node` стає `requires-python`, `dependencies` лишається `dependencies`, `devDependencies` стає `[dependency-groups] dev`, `bin` стає `[project.scripts]`, а ключі `jest` чи `eslintConfig` усередині `package.json` стають `[tool.pytest.ini_options]` і `[tool.ruff]`. Розділу `scripts` для задач немає зовсім (нижче, у типових помилках).

Рядок залежності складається з імені, необов'язкових extras у квадратних дужках і специфікатора версії (version specifier, офіційний термін PEP 440). Extras (офіційно optional dependencies) це іменовані набори додаткових залежностей пакета, у npm прямого аналога немає: `pydantic[email]` означає "pydantic плюс те, що йому потрібно для валідації email".

```bash
uv add "pydantic[email]>=2.11"
grep -A2 '^dependencies' pyproject.toml
```

```text
Resolved 21 packages in 277ms
Prepared 2 packages in 163ms
Installed 3 packages in 5ms
 + dnspython==2.9.0
 + email-validator==2.3.0
 + idna==3.20
dependencies = [
    "pydantic[email]>=2.11",
]
```

Оператори специфікаторів: `==`, `!=`, `<`, `<=`, `>`, `>=`, кома як "і", `==2.1.*` як префікс, і `~=`, compatible release (офіційна назва). Найпростіше побачити їх на списку версій через бібліотеку `packaging`, яку використовують і pip, і uv (у проєкті вона вже є як залежність pytest).

```python
from packaging.specifiers import SpecifierSet

versions = ["2.0.9", "2.1.0", "2.1.7", "2.2.0", "2.9.3", "3.0.0"]
for spec in [">=2,<3", "~=2.1", "~=2.1.0", "==2.1.*", ">=2.1"]:
    allowed = [v for v in versions if v in SpecifierSet(spec)]
    print(f"{spec:<10} {allowed}")
```

```text
>=2,<3     ['2.0.9', '2.1.0', '2.1.7', '2.2.0', '2.9.3']
~=2.1      ['2.1.0', '2.1.7', '2.2.0', '2.9.3']
~=2.1.0    ['2.1.0', '2.1.7']
==2.1.*    ['2.1.0', '2.1.7']
>=2.1      ['2.1.0', '2.1.7', '2.2.0', '2.9.3', '3.0.0']
```

`~=X.Y` означає `>=X.Y` і `==X.*`: відкидається останній компонент версії, і все, що лишилось, має збігатися. Тому `~=2.1` поводиться як `^2.1.0` у npm (до наступної мажорної), а `~=2.1.0` як `~2.1.0` у npm (до наступної мінорної). Різниця в механізмі: у npm два різні оператори з фіксованим змістом, а в Python один оператор, зміст якого залежить від кількості компонентів у версії. `^` у Python немає взагалі.

> **Пастка.** На версіях `0.x` аналогія з `^` ламається. У npm `^0.28.1` означає `<0.29.0`, бо нуль-мажорна версія вважається нестабільною. `~=` про це нічого не знає: `~=0.28` пропускає все до `1.0`. Для `0.x` пишуть явний діапазон.

```python
from packaging.specifiers import SpecifierSet

versions = ["0.28.1", "0.29.0", "0.99.0", "1.0.0"]
for spec in ["~=0.28", "~=0.28.1", ">=0.28.1,<0.29"]:
    allowed = [v for v in versions if v in SpecifierSet(spec)]
    print(f"{spec:<15} {allowed}")
```

```text
~=0.28          ['0.28.1', '0.29.0', '0.99.0']
~=0.28.1        ['0.28.1']
>=0.28.1,<0.29  ['0.28.1']
```

npm-синтаксис uv відкидає одразу з точною вказівкою на символ. `@` у Python-специфікаторі теж існує, але означає пряме посилання на файл чи URL, тому `pydantic@2.11` дає зовсім іншу помилку.

```bash
uv add "pydantic^2.11"
uv add "pydantic~=2"
```

```text
error: Failed to parse: `pydantic^2.11`
  Caused by: Expected one of `@`, `(`, `<`, `=`, `>`, `~`, `!`, `;`, found `^`
pydantic^2.11
        ^
error: Failed to parse: `pydantic~=2`
  Caused by: The ~= operator requires at least two segments in the release version
pydantic~=2
        ^^^
```

<!-- task: q2 -->

<!-- task: t1 -->

<!-- task: t2 -->

Оскільки `pyproject.toml` це TOML, Python читає його стандартною бібліотекою: модуль `tomllib` з'явився в 3.11 і вміє лише читати. Інструменти з таблицями `[tool.*]` роблять саме це.

```python live
import tomllib

text = '''
[project]
name = "forms-api"
requires-python = ">=3.12"
dependencies = ["pydantic>=2.11"]

[dependency-groups]
dev = ["mypy>=2.4.0", "pytest>=9.1.1", "ruff>=0.17.1"]
'''
data = tomllib.loads(text)
print(data["project"]["requires-python"])
print(data["dependency-groups"]["dev"])
```

```text
>=3.12
['mypy>=2.4.0', 'pytest>=9.1.1', 'ruff>=0.17.1']
```

<!-- task: t3 -->

## PyPI, `uv pip show` і що з усього цього комітити

PyPI (Python Package Index, офіційна назва) це реєстр, аналог npmjs.com, а `https://pypi.org/project/<name>/` аналог сторінки пакета на npmjs. На сторінці варто дивитися чотири речі. Версію і дату останнього релізу. `Requires: Python` у бічній панелі, це `requires-python` пакета, і якщо ваш Python старіший, uv цю версію просто не обере. `Release history`, щоб зрозуміти темп і чи пакет живий. `Download files`: wheel (офіційна назва зібраного дистрибутива, файл `.whl`) з тегом `py3-none-any` означає чистий Python для будь-якої платформи, а теги на кшталт `cp312-...-macosx_11_0_arm64` означають скомпільоване розширення, як у `pydantic-core` на Rust; sdist (source distribution) це архів вихідників на випадок, якщо wheel для вашої платформи немає. Ті самі метадані доступні через JSON API:

```bash
curl -s https://pypi.org/pypi/pydantic/json | python3.12 -c "
import json, sys
info = json.load(sys.stdin)['info']
print(info['version'])
print(info['requires_python'])
print(*info['requires_dist'][:5], sep='\n')
"
```

```text
2.14.1
>=3.10
annotated-types>=0.6.0
pydantic-core==2.50.1
typing-extensions>=4.16.0
typing-inspection>=0.4.4
email-validator>=2.0.0; extra == "email"
```

Останній рядок це extra з попереднього розділу: `email-validator` ставиться лише з `pydantic[email]`. Щоб дізнатися, чи пакет встановлений, якої версії, де лежить і хто від нього залежить, є `uv pip show` (у pip-venv те саме робить `python -m pip show`):

```bash
uv pip show pydantic-core
uv run python -c "import pydantic, sys; print(pydantic.__file__); print(sys.prefix)"
uv run python -c "from importlib.metadata import version; print(version('pydantic'))"
```

```text
Name: pydantic-core
Version: 2.50.1
Location: …/forms-api/.venv/lib/python3.12/site-packages
Requires: typing-extensions
Required-by: pydantic
…/forms-api/.venv/lib/python3.12/site-packages/pydantic/__init__.py
…/forms-api/.venv
2.14.1
```

`__file__` модуля це найкоротша відповідь на "який саме пакет імпортувався": якщо шлях веде не в `.venv` поточного проєкту, запущено не той інтерпретатор. `importlib.metadata.version` читає версію з `dist-info`, це спосіб дізнатися версію з коду.

> **Пастка.** Ім'я на PyPI не обов'язково збігається з ім'ям для `import`. `pydantic-core` імпортується як `pydantic_core`, а пакет `PyYAML` як `yaml`. У `pip list` видно і `pydantic_core`, і `typing-inspection`: інструменти нормалізують дефіси, підкреслення й регістр, тож для uv це одне ім'я, але для `import` ні.

```bash
uv run --with pyyaml python -c "import yaml; from importlib.metadata import packages_distributions; print(yaml.__name__, packages_distributions()['yaml'])"
```

```text
Installed 1 package in 2ms
yaml ['PyYAML']
```

`uv run --with` додає пакет лише на цей запуск, не чіпаючи `pyproject.toml`: зручно для таких перевірок.

Що комітити, те саме, що в JS: маніфест і lockfile так, залежності ні. У git ідуть `pyproject.toml`, `uv.lock`, `.python-version`. Не йдуть `.venv/` (машинно-специфічний і непереносний, див. вище), `__pycache__/` і `*.pyc`, кеші інструментів `.pytest_cache/`, `.ruff_cache/`, `.mypy_cache/`, і артефакти збирання `dist/`, `build/`, `*.egg-info`. `uv init` генерує `.gitignore` з частиною цього списку; кеші інструментів треба дописати.

```text
# Python-generated files
__pycache__/
*.py[oc]
build/
dist/
wheels/
*.egg-info

# Virtual environments
.venv
```

Це вміст `.gitignore` після `uv init`. Повний варіант для проєкту курсу:

```text
.venv/
__pycache__/
*.py[oc]
.pytest_cache/
.ruff_cache/
.mypy_cache/
build/
dist/
*.egg-info
```

`__pycache__` це папка, яку інтерпретатор створює поруч з імпортованим модулем і кладе туди скомпільований байткод, файли `.pyc`, щоб наступний імпорт не парсив вихідник заново. Ім'я файлу містить тег інтерпретатора (`cpython-312`), тобто кеш прив'язаний до версії Python, генерується автоматично й інвалідується за часом зміни вихідника. Комітити його так само безглуздо, як `.next/` чи `dist/` з фронтенду: це артефакт, а не код. Механізм байткоду детально в m0-l03.

```bash
printf 'FIELD_TYPES = ["text", "email", "number"]\n' > fields.py
printf 'from fields import FIELD_TYPES\n\nprint(FIELD_TYPES)\n' > app.py
uv run app.py
ls __pycache__
git status --short --ignored
```

```text
['text', 'email', 'number']
fields.cpython-312.pyc
?? .gitignore
?? .python-version
?? README.md
?? app.py
?? fields.py
?? main.py
?? pyproject.toml
?? uv.lock
!! .venv/
!! __pycache__/
```

`!!` позначає ігноровані шляхи. `.venv/` був би ігнорований і без рядка в кореневому `.gitignore`: uv кладе всередину venv власний `.gitignore` з одним рядком `*`. `python -m venv` у 3.12 такого не робить, там рядок `.venv/` у `.gitignore` обов'язковий.

```bash
cat .venv/.gitignore
```

```text
*
```

## Для капстоуну

Капстоун, бекенд FormBuilder, з'явиться в `capstone/` у корені курсу в уроці m0-l06, разом з src-layout, `[build-system]` і точкою входу. Тут готується його `pyproject.toml`: метадані, закріплена версія Python, dev-група з трьома інструментами, на яких тримається весь курс, і їхні конфіги. Робочі залежності (pydantic, потім FastAPI) додаватимуться в модулях 2 і 7 через `uv add`. Чернетку зручно зібрати в окремій папці `practice/m0-l02/formbuilder-draft/` у корені курсу й потім перенести три файли.

```bash
mkdir -p practice/m0-l02/formbuilder-draft && cd practice/m0-l02/formbuilder-draft
uv init --bare --name formbuilder --python 3.12
uv python pin 3.12
uv add --dev pytest ruff mypy
```

```text
Initialized project `formbuilder`
Pinned `.python-version` to `3.12`
Using CPython 3.12.12
Creating virtual environment at: .venv
Resolved 14 packages in 10ms
Installed 12 packages in 30ms
 + ast-serialize==0.13.1
 + iniconfig==2.3.1
 + librt==0.16.0
 + mypy==2.4.0
 + mypy-extensions==1.1.0
 + packaging==26.3
 + pathspec==1.1.1
 + pluggy==1.7.0
 + pygments==2.21.0
 + pytest==9.1.1
 + ruff==0.17.1
 + typing-extensions==4.16.0
```

`--bare` створює лише `pyproject.toml`, без `main.py`, README і git: структуру капстоуну задасть m0-l06. `uv python pin 3.12` потрібен, бо `requires-python = ">=3.12"` лише нижня межа, і без `.python-version` uv міг би взяти будь-який новіший Python з машини. Після дописування опису й таблиць інструментів файл виглядає так:

```toml
[project]
name = "formbuilder"
version = "0.1.0"
description = "FormBuilder backend: form configs, validation, rendering"
requires-python = ">=3.12"
dependencies = []

[dependency-groups]
dev = [
    "mypy>=2.4.0",
    "pytest>=9.1.1",
    "ruff>=0.17.1",
]

[tool.ruff]
line-length = 88
target-version = "py312"

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.mypy]
python_version = "3.12"
strict = true
```

```bash
uv sync --locked
uv run pytest --version
```

```text
Resolved 14 packages in 5ms
Audited 12 packages in 1ms
pytest 9.1.1
```

> **Для капстоуну.** `uv sync --locked` з цього блоку і є майбутній перший крок CI капстоуну: він падає, якщо хтось змінив `pyproject.toml` і не оновив `uv.lock`. `strict = true` для mypy закладено одразу, бо вмикати строгий режим на готовому коді дорожче, ніж писати під нього з першого файлу (m2-l08).

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **`npm i -g` як рефлекс.** Глобальний `pip install` відмовляє з `externally-managed-environment`, і перша спокуса це `--break-system-packages` або `sudo`. Правильно: залежність проєкту через `uv add`, разовий запуск утиліти через `uvx`.

   ```bash
   python3.12 -m pip install pydantic        # error: externally-managed-environment
   uv add pydantic                            # у проєкт
   uvx ruff@0.15.0 --version                  # разово, як npx
   ```

2. **Редагування `pyproject.toml` руками без `uv lock`.** Локально `uv run` мовчки все підтягне, а в CI `uv sync --locked` впаде. Правильно: `uv add` і `uv remove`; якщо файл редагували руками, одразу `uv lock` і комітити обидва файли.

   ```bash
   uv sync --locked
   # The lockfile at `uv.lock` needs to be updated, but `--locked` was provided.
   uv lock
   ```

3. **Очікування `^` у версіях.** `pydantic^2.11` не парситься, а `~=` для `0.x` пропускає до `1.0`. Правильно: `>=2.11,<3` або `~=2.11` для стабільних версій, явний діапазон для `0.x`.

   ```toml
   dependencies = [
       "pydantic>=2.11,<3",
       "httpx>=0.28.1,<0.29",
   ]
   ```

4. **Пошук розділу `scripts`.** `[project.scripts]` це entry points (офіційний термін), тобто аналог `bin` з `package.json`: команди, які пакет ставить у `.venv/bin`. Задачі на кшталт `npm run test` у Python пишуть як `uv run pytest`, а набір задач складають у Makefile або justfile.

   ```toml
   [project.scripts]
   fb-core = "fb_core:main"   # команда fb-core у .venv/bin, не npm script
   ```

5. **`source .venv/bin/activate` у скриптах і віра в активацію.** Нова вкладка терміналу не активована, а CI-крок з `source` залежить від shell. Правильно: `uv run` або повний шлях до інтерпретатора venv.

   ```bash
   uv run pytest
   .venv/bin/python -m pytest
   ```

6. **Копіювання `.venv` або коміт його в git.** Абсолютні шляхи всередині ламаються після переміщення. Правильно: `.venv/` в `.gitignore`, на новій машині `uv sync`.

   ```bash
   rm -rf .venv && uv sync
   ```

7. **`pip freeze > requirements.txt` як lockfile і `uv add -r` з нього.** Немає хешів, транзитивні стають прямими з точними пінами. Правильно: `uv.lock` як lockfile, у `dependencies` лише прямі залежності; `requirements.txt` з хешами за потреби генерувати з lock.

   ```bash
   uv export --no-dev --format requirements-txt
   ```

8. **Голий `pip install` в uv-проєкті.** У uv-venv немає pip, тож команда йде в інший Python, а пакет, поставлений через `uv pip install`, знесе наступний `uv sync`. Правильно: `uv add`.

   ```bash
   ls .venv/bin/pip    # No such file or directory
   uv add httpx
   ```

## Підсумок

- Пакети належать інтерпретатору: `import` шукає в `sys.path`, пакети лежать у `site-packages`, вгору по директоріях ніхто не ходить.
- Venv це `bin/python`-симлінк, власний `site-packages` і `pyvenv.cfg`; інтерпретатор розпізнає venv за `pyvenv.cfg`, тому `.venv/bin/python` працює без активації.
- Активація лише змінює `PATH` і `VIRTUAL_ENV` у поточному shell; у скриптах і CI замість неї `uv run` або повний шлях.
- Один venv на проєкт; venv не переносять і не комітять, а перестворюють через `uv sync`.
- `requirements.txt` не lockfile: без хешів, без розділення прямих і транзитивних, знімок одного середовища.
- uv: `init`, `add`, `add --dev`, `remove`, `lock`, `sync`, `run`, `tree`, `uvx`; `pyproject.toml` як `package.json`, `uv.lock` як `package-lock.json`.
- `npm ci` у CI це `uv sync --locked`; `--frozen` не перевіряє узгодженість з `pyproject.toml`.
- `pyproject.toml`: `[project]` стандартні метадані, `[dependency-groups]` для dev, `[tool.*]` конфіги інструментів.
- `~=2.1` це `>=2.1,<3`, `~=2.1.0` це `>=2.1.0,<2.2`; `^` немає, а на `0.x` `~=` ширший, ніж npm-ний `^`.
- У git: `pyproject.toml`, `uv.lock`, `.python-version`; поза git: `.venv/`, `__pycache__/`, кеші інструментів, `dist/`.

## Що далі

Наступний урок m0-l03 про REPL і запуск коду: `python script.py`, `python -m`, `if __name__ == "__main__"`, `sys.path` і байткод у `__pycache__`. Звідти знадобиться все, що тут сказано про `uv run` і `.venv/bin/python`: усі приклади курсу запускаються в оточенні проєкту, а не в базовому Python. Структуру пакета й editable install у капстоуні збирає m0-l06, а пакування з `[build-system]` і публікацію розбирає m3-l02.
