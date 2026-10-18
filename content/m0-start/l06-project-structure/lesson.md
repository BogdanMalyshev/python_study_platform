---
id: m0-l06
module: m0-start
title: "Структура проєкту: src-layout, tests/, точка входу"
summary: "Учень збирає скелет Python-проєкту в src layout з editable install, console script, python -m, тестами в tests/ і всіма конфігами в pyproject.toml, розуміє механізм кожної частини і отримує готовий скелет капстоуну formbuilder."
duration_min: 60
prerequisites: [m0-l05]
---

## Flat layout проти src layout

Python-проєкт розкладають двома способами. У flat layout (офіційна назва з Python Packaging User Guide) папка пакета лежить у корені поруч із `pyproject.toml`. У src layout (теж офіційна назва звідти ж) її опускають на рівень нижче, у `src/`. Різниця в одну папку, але поведінка імпортів різна принципово.

```text
flat layout                    src layout
formbuilder-repo/              formbuilder-repo/
├── pyproject.toml             ├── pyproject.toml
├── formbuilder/               ├── src/
│   ├── __init__.py            │   └── formbuilder/
│   └── cli.py                 │       ├── __init__.py
└── tests/                     │       └── cli.py
    └── test_smoke.py          └── tests/
                                   └── test_smoke.py
```

Механізм той, що ви бачили в m0-l03: при `python -c`, `python -m` і в REPL першим елементом `sys.path` стає поточна директорія. У flat layout це означає, що `import formbuilder` з кореня проєкту знаходить папку `formbuilder/` напряму, навіть якщо пакет ніхто не встановлював. У src layout у корені немає нічого з таким ім'ям, і без встановлення імпорт падає. Нижче один і той самий виклик у двох проєктах, без venv проєкту (`--no-project --isolated` дає голий інтерпретатор):

```bash
# у flat-проєкті
uv run --no-project --isolated python -c "import formbuilder, os; print(os.path.relpath(formbuilder.__file__))"
# у src-проєкті
uv run --no-project --isolated python -c "import formbuilder"
```

```text
formbuilder/__init__.py
ModuleNotFoundError: No module named 'formbuilder'
```

Перший результат виглядає зручніше, і в цьому вся проблема. "Працює без встановлення" означає "працює лише з кореня проєкту і лише з тим, що лежить на диску", а не з тим, що отримає користувач після `pip install`. Гірше, коли пакет таки встановлено: локальна папка стоїть у `sys.path` раніше за `site-packages` і затіняє встановлену копію. Це видно на моделі: дві папки з однойменним пакетом, і перемагає та, що раніше в `sys.path`.

```python live
import sys
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
for place, version in [("site-packages", "0.1.0 from wheel"), ("project", "0.1.0 local folder")]:
    pkg = root / place / "formbuilder"
    pkg.mkdir(parents=True)
    (pkg / "__init__.py").write_text(f"WHERE = {version!r}\n")

sys.path.insert(0, str(root / "site-packages"))
sys.path.insert(0, str(root / "project"))  # як cwd на початку sys.path

import formbuilder

print(formbuilder.WHERE)
print(Path(formbuilder.__file__).relative_to(root))
```

```text
0.1.0 local folder
project/formbuilder/__init__.py
```

Реальний наслідок це помилки пакування, які тести не бачать. Класичний випадок на setuptools: у `pyproject.toml` перелічено `packages = ["formbuilder"]`, а підпакет `formbuilder/render/` туди не потрапив, бо setuptools не додає підпакети автоматично при явному списку. Два однакові проєкти, різниця лише в layout; пакет встановлено звичайним (не editable) встановленням `uv sync --no-editable`, і тест імпортує `from formbuilder.render import render`.

```text
# flat                              # src
[tool.setuptools]                   [tool.setuptools]
packages = ["formbuilder"]          package-dir = {"" = "src"}
                                    packages = ["formbuilder"]
```

```bash
.venv/bin/python -m pytest -q
```

```text
# flat
.                                                                        [100%]
1 passed in 0.01s

# src
E   ModuleNotFoundError: No module named 'formbuilder.render'
=========================== short test summary info ============================
ERROR tests/test_render.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
1 error in 0.06s
```

У встановленому пакеті в обох випадках лежить лише `__init__.py`, без `render/`. Flat-проєкт цього не помічає, бо тест імпортує локальну папку. Src-проєкт падає, бо імпортувати більше нічого, крім встановленого. Для бібліотеки, яку ви опублікуєте, перший варіант означає зламаний реліз із зеленим CI.

> **Під капотом.** Python Packaging User Guide у статті "src layout vs flat layout" формально не обирає переможця: він описує компроміс. Src layout вимагає встановлення, щоб запустити код, зате не дає випадково імпортувати робочу копію і гарантує, що editable install бачить лише те, що призначено для імпорту. Офіційний туторіал з пакування при цьому написаний на src layout, документація pytest "наполегливо радить" src layout, `uv init --package` генерує саме його, а build backend `uv_build` за замовчуванням шукає модуль у `src/`. Для нового проєкту це фактичний стандарт.

Ще одна пара термінів з того ж глосарію, яка знадобиться на співбесіді. Distribution package (офіційний термін) це те, що встановлюється: ім'я з `[project] name`, wheel, запис у `uv pip list`. Import package (теж офіційний) це те, що імпортується: папка `src/formbuilder/`. У нас вони збігаються, але не зобов'язані: дистрибутив `form-builder` дав би пакет `form_builder`, а `pip install pyyaml` дає `import yaml`.

<!-- task: q1 -->

## Мінімальний скелет проєкту

Скелет генерує `uv init --package`. Прапорець `--package` якраз і означає "це пакет із src layout і точкою входу", без нього uv створює плоский `main.py` для скрипта. `--vcs none` вимикає `git init`, бо капстоун живе всередині репозиторію курсу.

```bash
uv init --package --vcs none --python 3.12 --name formbuilder capstone
cd capstone
uv add --dev pytest ruff mypy
```

```text
Initialized project `formbuilder` at `/Users/mac/projects/full_stack_study/python-course/capstone`
```

Далі руками дописуються `cli.py`, `__main__.py`, тест і конфіги інструментів (повний `pyproject.toml` у розділі про конфіги). Готове дерево без `.venv/`; якщо встановлено `tree`, те саме покаже `tree -a -I .venv`.

```bash
find . -path ./.venv -prune -o -print | sort
```

```text
.
./.gitignore
./.python-version
./README.md
./pyproject.toml
./src
./src/formbuilder
./src/formbuilder/__init__.py
./src/formbuilder/__main__.py
./src/formbuilder/cli.py
./tests
./tests/test_smoke.py
./uv.lock
```

Що де лежить і чому. `pyproject.toml` описує проєкт, залежності, точку входу і конфіги інструментів. `uv.lock` фіксує точні версії всього дерева залежностей і комітиться, як `package-lock.json` (детально в m0-l02). `.python-version` з рядком `3.12` каже uv, яким інтерпретатором створювати `.venv`, це `.nvmrc`. `.gitignore` виключає `.venv/`, `__pycache__/` і кеші інструментів (склад розібраний у m0-l02). `README.md` потрібен не лише людям: `[project] readme` вказує на нього, і він стає описом пакета в метаданих. Код живе лише в `src/formbuilder/`, тести лише в `tests/`, і `tests/` не має `__init__.py` (чому, у розділі про тести).

> **JS-аналог.** Найближче до цього дерева монорепо-пакет з `package.json`, `src/` і `__tests__/`. Різниця в тому, що в JS `src/` це просто домовленість, а `main`/`exports` у `package.json` можуть вказувати куди завгодно. У Python `src/formbuilder/` визначає ім'я, під яким код імпортується: папка і є публічна адреса модуля, тож перейменування папки ламає всі імпорти.

У src layout шлях до файлу і ім'я модуля перетворюються одне в одне механічно: відкинути `src/` і `.py`, слеші стають крапками, `__init__.py` означає саму папку-пакет. Саме так інструменти (pytest, mypy, ruff з правилом `I`) вирішують, чи є імпорт "своїм".

<!-- task: t1 -->

## Editable install і метадані пакета

`uv sync` на свіжому клоні створює `.venv`, ставить dev-залежності і сам проєкт. Сам проєкт ставиться в editable-режимі: editable install (офіційний термін pip і PEP 660, у старих документах "development mode") це встановлення, при якому у venv потрапляють метадані пакета і посилання на вихідний код, а не копія коду.

```bash
uv sync
```

```text
Using CPython 3.12.12
Creating virtual environment at: .venv
Resolved 14 packages in 0.97ms
Installed 13 packages in 24ms
 + ast-serialize==0.13.1
 + formbuilder==0.1.0 (from file:///Users/mac/projects/full_stack_study/python-course/capstone)
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

Рядок `formbuilder==0.1.0 (from file://...)` це і є ваш пакет. Подивимося, що від нього лишилось у `site-packages`: каталог `dist-info` з метаданими і файл `formbuilder.pth` з одним рядком, шляхом до `src/`.

```bash
ls .venv/lib/python3.12/site-packages | grep -E "formbuilder|\.pth$"
cat .venv/lib/python3.12/site-packages/formbuilder.pth
cat .venv/lib/python3.12/site-packages/formbuilder-0.1.0.dist-info/direct_url.json
```

```text
_virtualenv.pth
formbuilder-0.1.0.dist-info
formbuilder.pth
/Users/mac/projects/full_stack_study/python-course/capstone/src
{"url":"file:///Users/mac/projects/full_stack_study/python-course/capstone","dir_info":{"editable":true}}
```

Файл `.pth` (path configuration file, офіційна назва з документації модуля `site`) обробляється при старті інтерпретатора: кожен рядок-шлях з нього дописується в `sys.path`. Тому `src/` завжди в `sys.path` цього venv, незалежно від поточної директорії, і `import formbuilder` працює звідусіль, хоча самого коду в `site-packages` немає. Механізм можна відтворити руками через `site.addsitedir`, ту саму функцію, якою інтерпретатор обробляє `site-packages`.

```python live
import site
import sys
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
src = root / "capstone" / "src"
(src / "formbuilder").mkdir(parents=True)
(src / "formbuilder" / "__init__.py").write_text('print("formbuilder imported")\n')

site_packages = root / "venv" / "site-packages"
site_packages.mkdir(parents=True)
(site_packages / "formbuilder.pth").write_text(str(src) + "\n")

print(str(src) in sys.path)
site.addsitedir(str(site_packages))
print(str(src) in sys.path)

import formbuilder

print(Path(formbuilder.__file__).relative_to(root))
```

```text
False
True
formbuilder imported
capstone/src/formbuilder/__init__.py
```

Перевірка на реальному капстоуні: запуск з `/tmp`, де жодного `formbuilder` поруч немає, і список шляхів у `sys.path`, що стосуються проєкту.

```bash
cd /tmp
~/projects/full_stack_study/python-course/capstone/.venv/bin/python -c "import formbuilder; print(formbuilder.__file__)"
~/projects/full_stack_study/python-course/capstone/.venv/bin/python -c "import sys; print([p for p in sys.path if 'capstone' in p])"
```

```text
/Users/mac/projects/full_stack_study/python-course/capstone/src/formbuilder/__init__.py
['/Users/mac/projects/full_stack_study/python-course/capstone/.venv/lib/python3.12/site-packages', '/Users/mac/projects/full_stack_study/python-course/capstone/src']
```

`uv sync` робить для проєкту те саме, що `uv pip install -e .` (або `pip install -e .`) у вже створеному venv: у scratch-копії капстоуну `uv venv && uv pip install -e .` дав ті самі `formbuilder.pth` і `direct_url.json` з `"editable":true`. Перевірити режим встановлення можна без `ls`:

```bash
uv pip show formbuilder
```

```text
Name: formbuilder
Version: 0.1.0
Location: /Users/mac/projects/full_stack_study/python-course/capstone/.venv/lib/python3.12/site-packages
Editable project location: /Users/mac/projects/full_stack_study/python-course/capstone
Requires:
Required-by:
```

Editable робить живим лише код. Зміни в `src/` видно одразу, без перевстановлення. Усе, що в `pyproject.toml` (версія, залежності, `[project.scripts]`), записане в `dist-info` в момент встановлення і змінюється лише наступним встановленням. Версію програма дізнається через `importlib.metadata.version`, і ця функція читає файл `METADATA` з `dist-info`, а не `pyproject.toml`. Модель нижче будує `dist-info` руками, і `importlib.metadata` знаходить у ньому і версію, і точку входу.

```python live
import sys
import tempfile
from importlib.metadata import entry_points, version
from pathlib import Path

site_packages = Path(tempfile.mkdtemp())
dist_info = site_packages / "formbuilder-0.1.0.dist-info"
dist_info.mkdir()
(dist_info / "METADATA").write_text(
    "Metadata-Version: 2.4\nName: formbuilder\nVersion: 0.1.0\n"
)
(dist_info / "entry_points.txt").write_text(
    "[console_scripts]\nformbuilder = formbuilder.cli:main\n"
)
sys.path.insert(0, str(site_packages))

print(version("formbuilder"))
(ep,) = entry_points(group="console_scripts", name="formbuilder")
print(ep.value, "|", ep.module, "|", ep.attr)
```

```text
0.1.0
formbuilder.cli:main | formbuilder.cli | main
```

> **Пастка.** Після зміни `version` у `pyproject.toml` прямий виклик інтерпретатора venv показує стару версію, а `uv run` нову: перед запуском він помічає, що `pyproject.toml` змінився, і перевстановлює пакет. Якщо IDE запускає `.venv/bin/python` напряму, після правки `pyproject.toml` потрібен `uv sync`.

```bash
# після правки version = "0.2.0" у pyproject.toml
.venv/bin/python -c "from importlib.metadata import version; print(version('formbuilder'))"
uv run formbuilder --version
```

```text
0.1.0
   Building formbuilder @ file:///Users/mac/projects/full_stack_study/python-course/capstone
      Built formbuilder @ file:///Users/mac/projects/full_stack_study/python-course/capstone
Uninstalled 1 package in 0.88ms
Installed 1 package in 2ms
formbuilder 0.2.0
```

Звідси й правило про версію. Джерело правди одне: `version` у `pyproject.toml`. Писати руками `__version__ = "0.1.0"` у `__init__.py` означає мати два місця, які розійдуться на першому ж релізі, бо bump-скрипт, `uv version --bump` чи людина оновить одне з них. Якщо атрибут `__version__` потрібен (його очікують деякі інструменти й користувачі), він читається з метаданих, як у капстоуні:

```python
"""FormBuilder backend: validates form configs, renders and publishes pages."""

from importlib.metadata import version

__version__ = version("formbuilder")
```

<!-- task: q2 -->

## Точка входу: `[project.scripts]` і `python -m`

Команда `formbuilder` у терміналі з'являється з секції `[project.scripts]`. Це console script, офіційно entry point групи `console_scripts` за специфікацією Entry points з PyPA. Аналог `bin` у `package.json`, з однією принциповою відмінністю в тому, на що він вказує.

```ts
// package.json: { "bin": { "formbuilder": "./dist/cli.js" } }
// src/cli.ts, на першому рядку зібраного файлу #!/usr/bin/env node
export function main(argv: string[] = process.argv.slice(2)): number {
  console.log("usage: formbuilder [--help] [--version]");
  return 0;
}
process.exitCode = main();
```

```python
# pyproject.toml: [project.scripts] formbuilder = "formbuilder.cli:main"
import sys


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    print("usage: formbuilder [--help] [--version]")
    return 0
```

`bin` у npm вказує на файл, і цей файл виконується від першого до останнього рядка, тому виклик `main()` стоїть у ньому на верхньому рівні. Entry point у Python вказує на функцію у форматі `module:attr`, а виконуваний файл генерує інсталятор. Модуль `cli.py` лишається звичайним модулем без побічних ефектів при імпорті, і тест може викликати `main(["--help"])` напряму, без subprocess. Параметр `argv` зі значенням `None` за замовчуванням саме для цього: процес передає нічого і функція бере `sys.argv`, тест передає список.

Згенерований скрипт тривіальний, і варто один раз на нього подивитися.

```bash
cat .venv/bin/formbuilder
```

```text
#!/Users/mac/projects/full_stack_study/python-course/capstone/.venv/bin/python3
# -*- coding: utf-8 -*-
import sys
from formbuilder.cli import main
if __name__ == "__main__":
    if sys.argv[0].endswith("-script.pyw"):
        sys.argv[0] = sys.argv[0][:-11]
    elif sys.argv[0].endswith(".exe"):
        sys.argv[0] = sys.argv[0][:-4]
    sys.exit(main())
```

Шебанг прибитий до інтерпретатора цього venv, тому `.venv/bin/formbuilder` працює без активації, і `uv run formbuilder` лише знаходить його. Останній рядок `sys.exit(main())` задає контракт: те, що повертає `main`, стає кодом виходу процесу. `None` і `0` дають 0, ціле число дає себе, будь-який інший об'єкт друкується в stderr і дає 1.

```bash
python -c "import sys; sys.exit(None)"; echo "exit $?"
python -c "import sys; sys.exit(2)"; echo "exit $?"
python -c "import sys; sys.exit(True)"; echo "exit $?"
python -c "import sys; sys.exit('config not found')"; echo "exit $?"
```

```text
exit 0
exit 2
exit 1
config not found
exit 1
```

<!-- task: q3 -->

Друга точка входу, `python -m formbuilder`, працює через файл `__main__.py` у пакеті: `-m` з іменем пакета (а не модуля) імпортує пакет і виконує його `__main__.py` як `__main__` (механізм `-m` розібраний у m0-l03). Це корисно там, де console script не згенерований або незручний: `uv run python -m formbuilder` у Docker, запуск під відлагоджувачем `python -m pdb -m formbuilder`.

```python
"""Allows `python -m formbuilder`."""

from formbuilder.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
```

```bash
uv run formbuilder --help; echo "exit $?"
uv run formbuilder build form.json; echo "exit $?"
uv run python -m formbuilder --version; echo "exit $?"
```

```text
usage: formbuilder [--help] [--version]  (stub: commands arrive in m6-l06)
exit 0
formbuilder: unknown arguments: build form.json
usage: formbuilder [--help] [--version]  (stub: commands arrive in m6-l06)
exit 2
formbuilder 0.1.0
exit 0
```

`raise SystemExit(main())` це те саме, що `sys.exit(main())`, без імпорту `sys`. Захист `if __name__ == "__main__"` у `__main__.py` виглядає зайвим, але не дає коду виконатися, якщо якийсь інструмент (наприклад, генератор документації) імпортує модуль `formbuilder.__main__` як звичайний.

> **Пастка.** Новий запис у `[project.scripts]` не з'являється в `.venv/bin/` сам: скрипт генерується під час встановлення. У копії капстоуну з доданим `fb = "formbuilder.cli:main"`: до синхронізації файлу немає, `uv run` перевстановлює пакет і створює його.

```bash
ls .venv/bin/fb
uv run -q fb --version
ls .venv/bin/fb
```

```text
ls: .venv/bin/fb: No such file or directory
formbuilder 0.1.0
.venv/bin/fb
```

> **JS-аналог.** `[project.scripts]` це лише `bin`, а не `scripts` з `package.json`. Задачі розробника (`test`, `lint`, `typecheck`) у Python не реєструють у pyproject: їх запускають напряму через `uv run pytest`, `uv run ruff check`, а коли команд стає багато, збирають у Makefile або justfile. Console script заводять лише для команди, яку побачить користувач пакета.

<!-- task: t2 -->

<!-- task: t3 -->

## Тести в `tests/` і перший smoke-тест

pytest не потребує реєстрації тестів. За замовчуванням він збирає файли `test_*.py` і `*_test.py`, у них функції з префіксом `test` і методи `test*` у класах `Test*`. Де шукати, задає `testpaths` у `[tool.pytest.ini_options]`: без нього pytest, запущений без аргументів, обходить усе дерево від кореня, разом із `src/` і будь-якими експериментальними файлами. Заголовок сесії показує, що конфіг знайдено.

```bash
uv run pytest
```

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.12, pytest-9.1.1, pluggy-1.7.0
rootdir: /Users/mac/projects/full_stack_study/python-course/capstone
configfile: pyproject.toml
testpaths: tests
collected 1 item

tests/test_smoke.py .                                                    [100%]

============================== 1 passed in 0.01s ===============================
```

Перший тест у проєкті це smoke-тест (жаргон, від "перевірити, чи не йде дим після ввімкнення"): він не перевіряє поведінку, лише що пакет встановлено, імпортується, і точка входу не падає. У src layout такий тест одночасно перевіряє пакування, бо імпортувати `formbuilder` можна лише встановленим.

```python
from importlib.metadata import version

import formbuilder
from formbuilder.cli import main


def test_package_is_installed_and_cli_runs() -> None:
    assert formbuilder.__version__ == version("formbuilder")
    assert main(["--help"]) == 0
```

```bash
uv run pytest -q
uv run pytest --collect-only -q
```

```text
.                                                                        [100%]
1 passed in 0.01s
tests/test_smoke.py::test_package_is_installed_and_cli_runs

1 test collected in 0.01s
```

Голий `assert` замість `expect(...).toBe(...)` працює тому, що pytest при імпорті тестових модулів переписує в них `assert` і при падінні показує обидва значення; механізм, фікстури, `parametrize` і `conftest.py` у m3-l03. `rootdir` визначається за файлом конфігу, тому `uv run pytest -q` з папки `tests/` дає той самий результат, що й з кореня.

У `tests/` немає `__init__.py`, і в конфігу стоїть `addopts = ["--import-mode=importlib"]`. Документація pytest радить для нових проєктів саме режим `importlib`: у режимі за замовчуванням (`prepend`) pytest дописує директорію тестового файлу в `sys.path`, тож два файли `test_config.py` у різних підпапках конфліктують, а звичний обхід через `tests/__init__.py` робить корінь репозиторію імпортованим, тобто повертає проблему flat layout. З `importlib` `sys.path` не чіпається, і тести бачать лише встановлений пакет. Ціна: тестові файли не можуть імпортувати один одного, спільний код іде в `conftest.py` (m3-l03).

> **JS-аналог.** У Jest тести зазвичай лежать поруч із кодом: `Button.tsx` і `Button.test.tsx`. У Python це технічно можливо (pytest знайде `src/formbuilder/cli_test.py`), але тоді тести потрапляють у wheel і їх імпортує кожен, хто ставить пакет. Конвенція екосистеми: окреме дерево `tests/`, яке повторює структуру `src/formbuilder/` за потреби.

<!-- task: t4 -->

## Один `pyproject.toml` замість десяти dotfiles

Секція `[tool.<name>]` у `pyproject.toml` зарезервована стандартом (PEP 518) за інструментом з цим ім'ям, і ruff, pytest, mypy, coverage, uv читають свої налаштування звідти. Окремі `ruff.toml`, `pytest.ini`, `mypy.ini`, `setup.cfg` теж підтримуються, але для нового проєкту причин їх заводити немає. Повний `pyproject.toml` скелета:

```toml
[project]
name = "formbuilder"
version = "0.1.0"
description = "FormBuilder backend in Python: the capstone of the course."
readme = "README.md"
requires-python = ">=3.12"
dependencies = []

[project.scripts]
formbuilder = "formbuilder.cli:main"

[build-system]
requires = ["uv_build>=0.9.28,<0.10.0"]
build-backend = "uv_build"

[dependency-groups]
dev = [
    "mypy>=2.4.0",
    "pytest>=9.1.1",
    "ruff>=0.17.1",
]

[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
extend-select = ["I", "UP", "B", "N", "SIM", "RUF"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = ["--import-mode=importlib"]

[tool.mypy]
python_version = "3.12"
strict = true
```

Нового тут лише `[build-system]`. Build backend (офіційний термін з PEP 517) це бібліотека, яка перетворює дерево з `src/` у wheel і робить editable install; `uv sync` викликає її щоразу, коли бачить рядок `Building formbuilder`. `uv_build` обрав `uv init`, і він за замовчуванням очікує модуль у `src/<name>/`; hatchling чи setuptools працюють так само, з іншим рядком у `requires`. Решту секцій ви бачили: `[project]` і `[dependency-groups]` у m0-l02, `[tool.ruff]` у m0-l04; набір правил ruff той самий, що там рекомендовано.

> **JS-аналог.** Порівняйте з фронтенд-репозиторієм: `package.json`, `tsconfig.json`, `.eslintrc`, `.prettierrc`, `jest.config.ts`, `.nvmrc`, `.npmrc`. Тут їх відповідники це `[project]`, `[tool.mypy]`, `[tool.ruff.lint]`, `[tool.ruff]`, `[tool.pytest.ini_options]`, `.python-version`, `[tool.uv]`. Один файл, один формат, один code review.

Перевірка, що конфіги підхопились і скелет чистий:

```bash
uv run ruff check
uv run ruff format --check
uv run mypy src
```

```text
All checks passed!
5 files already formatted
Success: no issues found in 3 source files
```

`strict = true` у mypy вмикає набір прапорців, найближчий до `"strict": true` у `tsconfig.json`: анотації на всіх функціях, заборона generic-типів без параметрів, попередження про повернення `Any` і подібне. Чим перевірка типів у Python відрізняється від TS і що саме вмикає strict, у m2-l08; тут достатньо, що конфіг на місці з першого коміту, а не доганяє кодову базу потім.

<!-- task: t5 -->

## `__init__.py` і імпорти всередині пакета

`__init__.py` робить папку звичайним пакетом (regular package, офіційний термін) і виконується один раз, при першому імпорті пакета або будь-якого його підмодуля. Без нього папка теж імпортується, як namespace package (теж офіційний термін, для пакетів, розкиданих по кількох дистрибутивах), але для свого коду це не потрібно і лише плутає інструменти. У `__init__.py` зазвичай лежить або нічого, або публічний API пакета через реекспорт: `from formbuilder.config import load` дозволяє користувачу писати `formbuilder.load`, не знаючи внутрішньої структури. `__all__` це список імен, які забирає `from formbuilder import *` і які лінтери вважають навмисним реекспортом, а не невикористаним імпортом.

```python live
import sys
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
pkg = root / "formbuilder"
pkg.mkdir()
(pkg / "config.py").write_text(
    "def load(path):\n    return {'source': path}\n\n"
    "def _read(path):\n    return ''\n"
)
(pkg / "__init__.py").write_text(
    'print("running formbuilder/__init__.py")\n'
    "from formbuilder.config import load\n\n"
    '__all__ = ["load"]\n'
)
sys.path.insert(0, str(root))

import formbuilder
import formbuilder.config

print(formbuilder.load("form.json"))
print(formbuilder.load is formbuilder.config.load)

namespace = {}
exec("from formbuilder import *", namespace)
print(sorted(k for k in namespace if not k.startswith("__")))
```

```text
running formbuilder/__init__.py
{'source': 'form.json'}
True
['load']
```

`__init__.py` виконався один раз, хоча пакет імпортували двічі: модулі кешуються в `sys.modules`. Через це ж реекспорт має ціну, якої немає в barrel-файлі з tree shaking. Усе, що імпортує `__init__.py`, завантажується при будь-якому `import formbuilder.щось`, тож важкий імпорт (FastAPI, Jinja2) у кореневому `__init__.py` сповільнює навіть CLI, якому він не потрібен. Правило для капстоуну: `__init__.py` майже порожні, реекспорт лише там, де пакет справді має публічний API.

> **JS-аналог.** `index.ts` з `export * from "./config"` у кожній папці це звичка, яку не варто переносити. `__init__.py` не опціональний barrel, а файл, що виконується; порожній `__init__.py` у підпапці нормальний і найчастіший варіант.

Імпорти всередині пакета пишуть абсолютно, від імені пакета, а не шляхом від поточного файлу.

```ts
// src/render/page.ts
import { loadConfig } from "../../config/loader";
import type { Field } from "../types";
```

```python
# src/formbuilder/render/page.py
from formbuilder.config.loader import load_config
from formbuilder.types import Field
```

У TS шлях рахується від файлу, тому перенесення файлу ламає його імпорти, а `../../` читається погано. У Python абсолютний імпорт рахується від `sys.path`, і завдяки editable install `formbuilder` там завжди є, тож рядок імпорту однаковий у будь-якому файлі пакета й у тестах. Відносний варіант `from .config import load` теж існує і теж коректний усередині пакета; PEP 8 радить абсолютні як читабельніші, відносні допускає для глибоко вкладених пакетів. Детально про обидва, циклічні імпорти і `__init__.py` у m3-l01. Тут важлива одна практична різниця: відносний імпорт падає, якщо файл пакета запустити як скрипт за шляхом.

```bash
uv run python src/formbuilder/check.py     # у check.py: from .config import load
uv run python -m formbuilder.check
```

```text
    from .config import load
ImportError: attempted relative import with no known parent package
{'source': 'form.json'}
```

Запущений за шляхом файл стає модулем `__main__` без батьківського пакета, тож `.config` нема від чого рахувати. Через `-m` той самий файл імпортується як `formbuilder.check`, і все працює. З абсолютним `from formbuilder.config import load` працюють обидва варіанти, бо пакет встановлено. Але правильна звичка не "запускати файли пакета за шляхом", а мати точку входу і запускати її.

<!-- task: q4 -->

## Для капстоуну

Капстоун починається тут. Еталонний скелет лежить у `capstone/` у корені курсу, і проєктне завдання нижче просить зібрати такий самий власноруч, а потім звіритися. Повна перевірка, яку варто проганяти перед кожним комітом:

```bash
uv sync && uv run pytest -q && uv run ruff check && uv run mypy src && uv run formbuilder --help
```

```text
Resolved 14 packages in 20ms
Audited 13 packages in 4ms
.                                                                        [100%]
1 passed in 0.01s
All checks passed!
Success: no issues found in 3 source files
usage: formbuilder [--help] [--version]  (stub: commands arrive in m6-l06)
```

Далі скелет наповнюється без зміни структури. Модуль 2 додає `src/formbuilder/models.py` з Pydantic-моделями конфігу форми і `tests/test_models.py`; модуль 3 розширює тести і додає pre-commit; модуль 5 кладе воркер генерації в `src/formbuilder/worker.py`; модуль 6 замінює заглушку в `cli.py` на справжню команду `formbuilder build`; модуль 7 додає FastAPI-застосунок. Залежності кожного етапу йдуть через `uv add`, а не правкою `pyproject.toml` руками.

> **Для капстоуну.** Не перейменовуйте пакет і не виносьте код з `src/formbuilder/`: усі проєктні завдання курсу посилаються на шляхи `src/formbuilder/...` і `tests/...` і перевіряються командами з кореня `capstone/`. Якщо хочеться назвати репозиторій інакше, міняйте ім'я папки-репозиторію, а не `[project] name`.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`main.py` у корені як `src/index.ts`.** Звичка мати один файл-точку входу, який запускають `python main.py`. Без пакета немає editable install, імпорти працюють лише з кореня, а тести починаються з `sys.path.append`. Правильно: код у `src/formbuilder/`, функція `main` у `cli.py`, запуск через console script.

   ```toml
   [project.scripts]
   formbuilder = "formbuilder.cli:main"
   ```

2. **`sys.path.append("../src")` у тестах і скриптах.** Аналог налаштування `paths` у `tsconfig`, щоб "просто імпортувалось". Ламається, щойно файл запускають з іншої директорії, і ховає помилки пакування. Правильно: `uv sync` встановлює пакет editable, і `import formbuilder` працює звідусіль без жодних маніпуляцій.

   ```python
   import sys
   sys.path.append("../src")       # за звичкою
   from formbuilder.cli import main  # правильно: без першого рядка, пакет встановлено
   ```

3. **Відносні імпорти по шляху замість абсолютних.** `from ..config.loader import load` як `../../config/loader`. Працює лише всередині пакета і падає при запуску файлу за шляхом. Правильно: абсолютний імпорт від імені пакета.

   ```python
   from ..config.loader import load          # за звичкою
   from formbuilder.config.loader import load  # правильно
   ```

4. **Barrel `__init__.py` у кожній папці.** Перенесена звичка `index.ts` з `export *`. Кожен реекспорт виконується при імпорті пакета, tree shaking немає. Правильно: порожні `__init__.py`, реекспорт лише публічного API кореневого пакета з `__all__`.

   ```python
   # src/formbuilder/render/__init__.py
   # порожній файл
   ```

5. **Тести поруч із кодом як `*.test.ts`.** pytest їх знайде, але тести потраплять у wheel і стануть частиною пакета. Правильно: окремий `tests/` з `testpaths = ["tests"]`.

   ```text
   src/formbuilder/cli_test.py   # за звичкою
   tests/test_cli.py             # правильно
   ```

6. **`scripts` з `package.json` у `[project.scripts]`.** Спроба зареєструвати `test`, `lint`, `dev` як console scripts. `[project.scripts]` створює команди для користувачів пакета, а не задачі розробника. Правильно: інструменти через `uv run`.

   ```bash
   uv run pytest -q
   uv run ruff check --fix
   ```

7. **Версія руками в `__version__`.** Звичка дублювати `version` з `package.json` у константу. Дві копії розходяться. Правильно: читати метадані встановленого пакета.

   ```python
   __version__ = "0.1.0"              # за звичкою
   __version__ = version("formbuilder")  # правильно: from importlib.metadata import version
   ```

8. **`main()` повертає `bool` або нічого не повертає при помилці.** `return True` як "успіх" дає код виходу 1, а `print("error")` без ненульового коду робить помилку невидимою для CI. Правильно: `main() -> int`, `0` при успіху, ненульовий код і stderr при помилці.

   ```python
   print("formbuilder: unknown arguments", file=sys.stderr)
   return 2
   ```

## Підсумок

- Src layout: пакет у `src/formbuilder/`, тому імпортується лише встановлена копія, і тести ловлять помилки пакування; flat layout дозволяє локальній папці затінити встановлений пакет.
- Скелет: `pyproject.toml`, `uv.lock`, `.python-version`, `.gitignore`, `README.md`, `src/formbuilder/{__init__,__main__,cli}.py`, `tests/test_smoke.py`; генерується `uv init --package`.
- `uv sync` ставить проєкт editable: `.pth`-файл додає `src/` у `sys.path`, а `dist-info` зберігає метадані.
- Editable живий лише для коду; версія, залежності й scripts оновлюються перевстановленням (`uv sync` або автоматично в `uv run`).
- `[project.scripts] name = "module:func"` це `bin` з `package.json`; згенерований скрипт робить `sys.exit(main())`, тому `main` повертає `int`.
- `python -m formbuilder` виконує `src/formbuilder/__main__.py`.
- pytest збирає `tests/test_*.py` і функції `test*`; `testpaths` обмежує пошук, `--import-mode=importlib` прибирає потребу в `tests/__init__.py`.
- Усі конфіги інструментів у `[tool.*]` секціях `pyproject.toml`.
- `__init__.py` виконується при імпорті; порожній або з реекспортом публічного API, `__all__` фіксує, що саме експортується.
- Імпорти всередині пакета абсолютні; версія одна, у `pyproject.toml`, і читається через `importlib.metadata.version`.

## Що далі

Модуль 0 закрито: є інтерпретатор, venv, лінтер, відлагоджувач і скелет капстоуну. Модуль 1 починається з m1-l01 про синтаксис через призму JS: відступи, snake_case, відсутність hoisting. Завдання там виконуються в браузері, але будь-який приклад можна перенести в `capstone/` і прогнати через `uv run`, а `ruff check` з конфігом звідси одразу підкаже, де JS-звички протікають у Python-код.
