---
id: m3-l01
module: m3-modules-tests
title: "Система імпортів, __init__.py, циклічні імпорти"
summary: "Учень розуміє, що робить import (sys.modules, sys.path, одне виконання модуля), свідомо вибирає форму імпорту й вміст __init__.py, діагностує ModuleNotFoundError, затінення stdlib і циклічні імпорти, розриває цикли через TYPE_CHECKING і розкладає капстоун на шари config, domain, renderers/, cli з динамічним реєстром рендерерів."
duration_min: 75
prerequisites: [m2-l09]
---

## Що робить `import`: `sys.modules`, пошук, одне виконання

`import settings` це інструкція, яка виконується під час роботи програми в тому місці, де стоїть, а не декларація, яку хтось збирає до запуску. Механізм описаний у розділі "The import system" довідника мови (офіційна назва) і складається з трьох кроків. Спершу інтерпретатор шукає ім'я в `sys.modules`, звичайному словнику "ім'я модуля → об'єкт модуля". Якщо там порожньо, finder-и (офіційний термін з документації `importlib`) по черзі обходять каталоги з `sys.path` і шукають `settings.py` або папку `settings/`. Знайдений файл loader (теж офіційний термін) виконує зверху донизу в просторі імен нового об'єкта модуля (module object), причому об'єкт потрапляє в `sys.modules` ще до початку виконання. Наприкінці ім'я `settings` прив'язується в поточному просторі імен.

Звідси головна властивість: файл модуля виконується один раз на процес. Другий `import settings` знаходить об'єкт у `sys.modules` і лише прив'язує ім'я ще раз, код верхнього рівня не запускається. Модель нижче створює модуль у тимчасовій папці, тож її можна запустити прямо в браузері.

```python live
import importlib
import sys
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
(root / "settings.py").write_text('print("executing settings.py")\nDEBUG = False\n')
sys.path.insert(0, str(root))

print("settings" in sys.modules)
import settings

print("settings" in sys.modules)
import settings
import settings as again

print(settings is again is sys.modules["settings"])
print(type(settings), settings.__name__, settings.DEBUG)
importlib.reload(settings)
```

```text
False
executing settings.py
True
True
<class 'module'> settings False
executing settings.py
```

Останній рядок це `importlib.reload`: він виконує файл повторно в той самий об'єкт модуля, і використовують його лише в REPL, бо імена, взяті раніше через `from settings import ...`, після нього лишаються старими.

```ts
// ESM: статичний граф; спершу linking усіх модулів, потім кожен виконується один раз
import { DEBUG } from "./settings.js";

// CommonJS: виклик під час роботи, кеш у require.cache за повним шляхом файлу
const settings = require("./settings");
delete require.cache[require.resolve("./settings")];
```

```python
import importlib
import sys

import settings  # інструкція під час роботи, кеш у sys.modules за іменем модуля

importlib.reload(settings)  # повторне виконання файлу в той самий об'єкт
del sys.modules["settings"]  # наступний import виконає файл у новий об'єкт
```

"Один раз" збігається з обома системами JS, але механіка ближча до CommonJS. `import` у Python це інструкція, як `require`: її можна поставити в `if`, у `try`, у тіло функції, і вона спрацює в момент, коли до неї дійде виконання. Hoisting немає, фази linking немає: код вище за `import` виконується раніше за код модуля. Ключ кешу інший, ніж у CommonJS: не шлях до файлу, а ім'я модуля, і це породжує пастку з подвійним виконанням (розділ про побічні ефекти). А ESM-ові властивості, що випливають зі статичного графа, tree-shaking і live bindings, у Python відсутні; обидві відсутності розібрані в наступному розділі.

```python
# main.py
print("main: before import")
import settings

print("main: after import, DEBUG =", settings.DEBUG)


def handler() -> None:
    import json  # імпорт усередині функції виконується при виклику

    print("handler:", json.dumps({"debug": settings.DEBUG}))


handler()
```

```python
# settings.py
print("settings: executing top-level code")
DEBUG = True
```

```bash
python main.py
```

```text
main: before import
settings: executing top-level code
main: after import, DEBUG = True
handler: {"debug": true}
```

Імпорт усередині функції виконується при першому виклику, а кожен наступний виклик коштує один пошук у словнику `sys.modules`. Це легальний інструмент, а не хак: він знадобиться для циклічних імпортів і для важких необов'язкових залежностей. За замовчуванням імпорти все одно ставлять на початок файлу, щоб залежності модуля було видно одразу.

## Форми `import` і що саме вони прив'язують

Усі форми виконують одну й ту саму роботу з `sys.modules`. Різниця лише в тому, яке ім'я з'являється у вашому просторі імен і на що воно вказує.

```ts
import * as path from "node:path";
import { join, basename as base } from "node:path";
import fs from "node:fs";
```

```python
import os.path  # прив'язує ім'я os; підмодуль доступний як os.path
import os.path as path  # прив'язує path до самого підмодуля
from os.path import basename as base, join
```

Розходження в двох місцях. Default export у Python немає: `import x` завжди дає об'єкт модуля, а не "головну" функцію чи клас із нього, тому аналога `import fs from "node:fs"` просто не існує. І `import os.path` прив'язує ім'я `os`, а не `path`: інтерпретатор імпортує `os`, потім `os.path`, ставить підмодуль атрибутом на батьківський пакет і дає вам верхнє ім'я. Аліас через `as` прив'язує вже сам підмодуль.

```python
import os.path

print(os.__name__, os.path.__name__)
print("os" in globals(), "path" in globals())

import os.path as p

print(p.__name__, p is os.path)

from os.path import basename as base, join

print(join("forms", "signup.json"), base("forms/signup.json"))
```

```text
os posixpath
True False
posixpath True
forms/signup.json signup.json
```

`from a import x` спершу імпортує модуль `a` повністю, а потім бере з нього атрибут `x`; якщо атрибута немає, пробує імпортувати підмодуль `a.x`. Модуль при цьому опиняється в `sys.modules`, просто ім'я `a` не прив'язується у вас. Tree-shaking (жаргон JS-бандлерів) тут немає й бути не може: щоб дістати одну функцію, Python виконує весь файл, і все, що той імпортує.

```python live
import sys
from json import dumps

print(sorted(name for name in sys.modules if name.startswith("json")))
print("json" in globals(), "dumps" in globals())
print(dumps.__module__, sys.modules["json"].dumps is dumps)
```

```text
['json', 'json.decoder', 'json.encoder', 'json.scanner']
False True
json True
```

> **Пастка.** `from counter import count` це не live binding (термін специфікації ECMAScript для імпортів ESM, які завжди бачать поточне значення експорту). Python у момент імпорту копіює посилання: створює у вашому модулі нове ім'я `count`, прив'язане до того самого об'єкта, що й `counter.count` у цю мить. Коли `counter` перепризначає своє ім'я, ваша копія про це не дізнається.

```python
# counter.py
count = 0


def bump() -> None:
    global count
    count += 1
```

```python
# main.py
import counter
from counter import bump, count

bump()
bump()
print(count, counter.count)
```

```text
0 2
```

У JS `import { count } from "./counter.js"` після двох `bump()` показав би `2`. Правило для Python: те, що змінюється (лічильники, поточні налаштування, стан), читають через модуль, `counter.count`, а `from ... import` залишають для функцій, класів і констант. Мутація спільного об'єкта, наприклад `counter.items.append(...)`, видна обом, бо об'єкт один; не видно лише перепризначення імені.

<!-- task: q1 -->

`from a import *` імпортує імена зі списку `__all__`, якщо модуль його оголосив, а інакше всі імена без підкреслення на початку, включно з тим, що модуль сам імпортував. `__all__` (dunder-атрибут: "dunder" це жаргон спільноти для імен виду `__x__`) задає публічний API модуля; явний імпорт за іменем він не обмежує.

```python
# validators.py
import re

__all__ = ["validate_email"]

EMAIL = re.compile(r"[^@\s]+@[^@\s]+")


def validate_email(value: str) -> bool:
    return _match(value)


def _match(value: str) -> bool:
    return EMAIL.fullmatch(value) is not None
```

```python
# main.py
from validators import *

print(validate_email("a@b.c"))
print(sorted(name for name in dir() if not name.startswith("__")))

from validators import EMAIL, _match

print(EMAIL.pattern, _match("x"))
```

```text
True
['validate_email']
[^@\s]+@[^@\s]+ False
```

Без рядка `__all__` той самий `main.py` отримав би `['EMAIL', 're', 'validate_email']`: разом із публічною функцією приїхав модуль `re`, який `validators` імпортував для себе. Поза REPL зірочку вважають поганим стилем із двох причин: ні читач, ні лінтер не знають, звідки взялося ім'я (ruff позначає це правилами F403 і F405), і зірочка мовчки перезаписує те, що вже було в просторі імен. Класичний приклад: `from os import *` підміняє вбудований `open` на низькорівневий `os.open` з іншою сигнатурою.

```python
import builtins

from os import *

print(open is builtins.open, open.__module__)
try:
    with open("forms.json") as f:
        pass
except TypeError as e:
    print("TypeError:", e)
```

```text
False posix
TypeError: open() missing required argument 'flags' (pos 2)
```

## Модуль, пакет і `__init__.py`

Модуль це один файл `.py`. Пакет це модуль, який може містити підмодулі; технічно це об'єкт модуля з атрибутом `__path__`, списком каталогів, де шукати його підмодулі. Звичайний пакет (regular package, офіційний термін) це папка з `__init__.py`, і код цього файлу і є кодом пакета. При імпорті `formbuilder.renderers.html` спершу виконуються `__init__.py` усіх батьківських пакетів, зверху вниз, кожен один раз на процес.

```python
# formbuilder/__init__.py
print("run formbuilder/__init__.py")
```

```python
# formbuilder/renderers/__init__.py
print("run formbuilder/renderers/__init__.py")
```

```python
# formbuilder/renderers/html.py
print("run formbuilder/renderers/html.py")


def render(label: str) -> str:
    return f"<label>{label}</label>"
```

```python
# main.py
import sys

import formbuilder.renderers.html

print(formbuilder.renderers.html.render("Email"))
print(sorted(name for name in sys.modules if name.startswith("formbuilder")))
print(formbuilder.__file__ is not None, hasattr(formbuilder, "__path__"))
print(hasattr(formbuilder.renderers.html, "__path__"))
```

```text
run formbuilder/__init__.py
run formbuilder/renderers/__init__.py
run formbuilder/renderers/html.py
<label>Email</label>
['formbuilder', 'formbuilder.renderers', 'formbuilder.renderers.html']
True True
False
```

Зворотне не працює: імпорт пакета не імпортує його підмодулі. Папка не є barrel-файлом (жаргон JS-спільноти для `index.ts`, що реекспортує сусідів), і поки ніхто не виконав `import xml.dom`, атрибута `dom` на пакеті `xml` немає. Атрибут з'являється як побічний ефект імпорту підмодуля будь-де в процесі, і на цьому будуються баги "працює, якщо раніше хтось інший імпортував підмодуль".

```python live
import xml

print(hasattr(xml, "dom"))
import xml.dom

print(hasattr(xml, "dom"))
```

```text
False
True
```

<!-- task: q2 -->

Папка без `__init__.py` теж імпортується: це namespace package (офіційний термін, PEP 420). У нього немає `__file__`, а `__path__` збирається з усіх однойменних папок на `sys.path`, тож два різні проєкти зливаються в один пакет. Створені для того, щоб кілька окремо встановлюваних дистрибутивів ділили один простір імен, і саме тому для власного коду `__init__.py` все одно ставлять: без нього будь-яка стороння папка з тим самим іменем на `sys.path` мовчки стає частиною вашого пакета.

```python live
import sys
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
for project, module in [("project_a", "html"), ("project_b", "text")]:
    folder = root / project / "plugins"  # без __init__.py
    folder.mkdir(parents=True)
    (folder / f"{module}.py").write_text(f"NAME = {module!r}\n")
    sys.path.append(str(root / project))

import plugins
import plugins.html
import plugins.text

print(plugins.__file__, type(plugins.__path__).__name__)
print([Path(p).relative_to(root).as_posix() for p in plugins.__path__])
print(plugins.html.NAME, plugins.text.NAME)
```

```text
None _NamespacePath
['project_a/plugins', 'project_b/plugins']
html text
```

У `__init__.py` кладуть одне з двох. Або нічого (докстрінг і, як у капстоуні, `__version__`), і тоді користувачі імпортують підмодулі напряму: `from formbuilder.config import load_config`. Або явний реекспорт публічного API з `__all__`, коли внутрішня розкладка пакета не повинна просочуватися назовні: `from formbuilder.renderers.base import Renderer` у `renderers/__init__.py` дає коротке `from formbuilder.renderers import Renderer`.

> **Пастка.** Barrel у стилі `index.ts`, що реекспортує все підряд, у Python дорожчий, ніж у JS. Бандлер не викине невикористане, а `__init__.py` виконується при імпорті будь-якого підмодуля, тож `import formbuilder.domain` тягне за собою все, що імпортує barrel, разом із Pydantic. Друга ціна, цикли, у розділі про циклічні імпорти.

```python
# formbuilder/__init__.py: barrel у стилі index.ts
from formbuilder.config import load_config
from formbuilder.domain import Element, FormConfig

__all__ = ["Element", "FormConfig", "load_config"]
```

```python
# formbuilder/config.py
import pydantic

print("config.py: pydantic", pydantic.VERSION)


def load_config(text: str) -> dict[str, object]:
    return {}
```

```python
# formbuilder/domain.py
print("domain.py")


class Element: ...


class FormConfig: ...
```

```bash
python -c "import sys, formbuilder.domain; print(sorted(m for m in sys.modules if m.startswith('formbuilder')), 'pydantic' in sys.modules)"
```

```text
config.py: pydantic 2.14.1
domain.py
['formbuilder', 'formbuilder.config', 'formbuilder.domain'] True
```

<!-- task: t1 -->

## Абсолютні й відносні імпорти

Абсолютний імпорт називає модуль повним іменем від кореня `sys.path`: `from formbuilder.config import load_config`. Відносний рахує від пакета, у якому лежить поточний модуль: одна крапка це поточний пакет, дві це батьківський, `from .config import load` і `from ..core import helpers`. Точкою відліку служить атрибут модуля `__package__`, а не шлях до файлу.

```python
# app/config.py
def load() -> dict[str, bool]:
    return {"debug": True}
```

```python
# app/main.py
from .config import load

print(__name__, __package__, load())
```

`app/__init__.py` порожній. Запуск за шляхом і запуск через `-m` з кореня проєкту дають різний результат:

```bash
python app/main.py
python -m app.main
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    from .config import load
ImportError: attempted relative import with no known parent package
__main__ app {'debug': True}
```

Причина в `__package__`. Файл, запущений за шляхом, стає модулем `__main__` без пакета: для інтерпретатора це окремий скрипт, а не частина `app`, тому крапці немає від чого рахувати. `python -m app.main` спершу імпортує пакет `app`, а потім виконує `app/main.py` як `__main__` з `__package__ == "app"` (механізм `-m` розібраний у m0-l03). Підйом вище кореня пакета дає окрему помилку:

```python
# app/deep.py
from ..core import helpers
```

```bash
python -m app.deep
```

```text
Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "<frozen runpy>", line 88, in _run_code
  File "deep.py", line 2, in <module>
    from ..core import helpers
ImportError: attempted relative import beyond top-level package
```

> **Пастка.** Зворотний випадок підступніший. `import config` всередині `app/main.py` без крапки виглядає як "імпорт сусіднього файлу" і справді працює при запуску за шляхом, бо папка скрипта стає першим елементом `sys.path`. Через `-m` або з тестів той самий рядок падає: у Python 3 неявних відносних імпортів немає, і `config` шукається від коренів `sys.path`, де папки `app/` немає.

```python
# app/legacy.py
import config

print(__name__, config.load())
```

```bash
python app/legacy.py
python -m app.legacy
```

```text
__main__ {'debug': True}
Traceback (most recent call last):
  File "<frozen runpy>", line 198, in _run_module_as_main
  File "<frozen runpy>", line 88, in _run_code
  File "legacy.py", line 2, in <module>
    import config
ModuleNotFoundError: No module named 'config'
```

Курс використовує лише абсолютні імпорти, і причини практичні. Той самий рядок `from formbuilder.config import load_config` працює в пакеті, у тестах, у REPL і в `python -c`, незалежно від того, як запущено код. Пошук `formbuilder.config` по репозиторію знаходить усі місця використання модуля. Перенесення файлу в іншу папку ламає імпорти голосно, а не змінює їх зміст. PEP 8 теж рекомендує абсолютні. У капстоуні це закріплює правило ruff TID252:

```toml
[tool.ruff.lint]
extend-select = ["I", "UP", "B", "N", "SIM", "RUF", "TID"]

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "all"
```

Якщо в `cli.py` написати `from .config import load_config`:

```bash
uv run ruff check --select TID src/formbuilder/cli.py
```

```text
TID252 Prefer absolute imports over relative imports
 --> src/formbuilder/cli.py:7:1
  |
6 | from formbuilder import __version__
7 | from .config import load_config
  | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
8 | from formbuilder.renderers import get_renderer
  |
help: Replace relative imports with absolute imports
  |
6 | from formbuilder import __version__
  - from .config import load_config
7 + from formbuilder.config import load_config
8 | from formbuilder.renderers import get_renderer
  |
note: This is an unsafe fix and may change runtime behavior

Found 1 error.
1 unsafe fix available with `--fix --unsafe-fixes`.
```

> **JS-аналог.** Абсолютний імпорт у Python це вбудований аліас `@/` з `paths` у `tsconfig.json`: корінь не каталог файлу, а ім'я пакета. Ланцюжки `../../lib/utils` з'являються лише тоді, коли пишуть відносні імпорти; із `from formbuilder.lib.utils import ...` їх просто немає.

<!-- task: q3 -->

## `sys.path`, `ModuleNotFoundError` і затінення stdlib

`sys.path` це список каталогів, у яких finder шукає модулі, у порядку пріоритету. Першим іде каталог скрипта або порожній рядок, тобто поточна директорія, для `-c`, `-m` і REPL. Далі `PYTHONPATH`, якщо задано, потім стандартна бібліотека, потім `site-packages` активного venv, і останніми шляхи з файлів `.pth`. Саме останній пункт пояснює, чому після `uv sync` пакет капстоуну імпортується з будь-якої папки: `formbuilder.pth` дописує `capstone/src` у `sys.path` (детально в m0-l06).

```bash
cd capstone
.venv/bin/python -c "import sys; print(sys.executable); print(*sys.path, sep='\n')"
```

```text
/Users/mac/projects/full_stack_study/python-course/capstone/.venv/bin/python

/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python312.zip
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12
/Users/mac/.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/lib/python3.12/lib-dynload
/Users/mac/projects/full_stack_study/python-course/capstone/.venv/lib/python3.12/site-packages
/Users/mac/projects/full_stack_study/python-course/capstone/src
```

`ModuleNotFoundError` (підклас `ImportError`) майже завжди означає одне з п'яти, і перевіряти варто в такому порядку. Перше: не той інтерпретатор. Голий `python` або python з іншого venv не бачить пакетів вашого проєкту, і найчастіша причина помилки в капстоуні це запуск без `uv run`. Друге: у `sys.path` немає потрібного каталогу, і це видно командою вище. Третє: пакет не встановлено або встановлено до зміни `pyproject.toml`, `uv pip show formbuilder` це покаже. Четверте: ім'я імпорту не збігається з іменем дистрибутива (`pip install pyyaml` дає `import yaml`) або в папці бракує `__init__.py`. П'яте: атрибут `name` у винятку називає модуль, якого бракує, і це може бути не ваш модуль, а залежність усередині нього.

```bash
cd capstone
../.venv/bin/python -c "import sys; print(sys.executable)"
../.venv/bin/python -c "
try:
    import formbuilder
except ModuleNotFoundError as e:
    print(repr(e.name), e.msg)
"
```

```text
/Users/mac/projects/full_stack_study/python-course/capstone/../.venv/bin/python
'formbuilder' No module named 'formbuilder'
```

Оскільки каталог скрипта стоїть у `sys.path` першим, ваш файл з іменем модуля стандартної бібліотеки перемагає цей модуль. `json.py` "для швидкої перевірки" поруч із `main.py` перетворює `import json` на імпорт вашого файлу, і помилка виглядає як баг у stdlib.

```python
# json.py: "швидко перевірити, як парситься конфіг"
config = {"fields": ["email"]}
```

```python
# main.py
import json

print(json.dumps({"ok": True}))
```

```text
Traceback (most recent call last):
  File "main.py", line 4, in <module>
    print(json.dumps({"ok": True}))
          ^^^^^^^^^^
AttributeError: module 'json' has no attribute 'dumps'
```

Діагностика одним рядком: `print(json.__file__)` покаже ваш `json.py` замість шляху в `lib/python3.12/`. Гірший варіант, коли затінений модуль ви самі не імпортуєте: `random.py` у корені ламає `tempfile`, бо стандартна бібліотека всередині імпортує `random`, і traceback закінчується в чужому коді.

```python
# build.py
import tempfile

with tempfile.TemporaryDirectory() as out:
    print("building into", out)
```

```text
Traceback (most recent call last):
  File "build.py", line 2, in <module>
    import tempfile
  File "tempfile.py", line 45, in <module>
    from random import Random as _Random
ImportError: cannot import name 'Random' from 'random' (random.py)
```

> **Пастка.** Небезпечні імена файлів у корені проєкту чи поруч зі скриптом: `json.py`, `random.py`, `test.py` (`test` це пакет регресійних тестів CPython), `email.py`, `types.py`, `logging.py`, а також імена встановлених залежностей: `pydantic.py`, `yaml.py`. Починаючи з 3.13 інтерпретатор сам підказує причину; той самий `main.py` під 3.14 закінчується рядком `AttributeError: module 'json' has no attribute 'dumps' (consider renaming 'json.py' since it has the same name as the standard library module named 'json' and prevents importing that standard library module)`. У 3.12 підказки немає, тож перевіряйте `__file__`.

## Циклічні імпорти

Циклічний імпорт (circular import, формулювання з тексту помилки) виникає, коли модуль A під час виконання імпортує B, а B імпортує A. У капстоуні це з'являється природно: `domain` хоче анотувати метод `FormConfig.render(renderer: Renderer)`, а `renderers` потребує `Element` з `domain`.

```python
# formbuilder/domain.py
from dataclasses import dataclass

from formbuilder.renderers import Renderer


@dataclass(frozen=True)
class Element:
    name: str
    label: str


@dataclass(frozen=True)
class FormConfig:
    elements: tuple[Element, ...]

    def render(self, renderer: Renderer) -> str:
        return "".join(renderer.render(el) for el in self.elements)
```

```python
# formbuilder/renderers.py
from typing import Protocol

from formbuilder.domain import Element


class Renderer(Protocol):
    def render(self, element: Element) -> str: ...


class HtmlRenderer:
    def render(self, element: Element) -> str:
        return f'<label for="{element.name}">{element.label}</label>'
```

`formbuilder/__init__.py` у цьому й наступних прикладах розділу порожній.

```bash
python -c "import formbuilder.domain"
```

```text
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "domain.py", line 4, in <module>
    from formbuilder.renderers import Renderer
  File "renderers.py", line 4, in <module>
    from formbuilder.domain import Element
ImportError: cannot import name 'Element' from partially initialized module 'formbuilder.domain' (most likely due to a circular import) (domain.py)
```

Покроково це той самий механізм з першого розділу. `import formbuilder.domain` створює порожній об'єкт модуля, кладе його в `sys.modules` і починає виконувати `domain.py`. На рядку 4 виконання `domain` зупиняється і починається `renderers.py`. Його рядок 4 просить `Element` з `formbuilder.domain`; модуль у `sys.modules` уже є, тому нескінченної рекурсії немає, але виконання `domain` застрягло на рядку 4 і до класу `Element` не дійшло. Звідси "partially initialized module" (дослівно з повідомлення): модуль зареєстрований, але виконаний не до кінця. ESM у такій ситуації працює, бо спершу зв'язує всі імпорти між модулями і лише потім виконує код, а помилка `ReferenceError` з'являється тільки при зверненні до ще не ініціалізованого значення. У Python фази зв'язування немає, і `from ... import` звертається до значення негайно.

Помилка залежить від того, хто імпортований першим. Той самий цикл, запущений з іншого кінця, падає на іншому імені, і в проєкті це виглядає як "тести зелені, а CLI падає", бо тести і CLI імпортують модулі в різному порядку.

```bash
python -c "import formbuilder.renderers"
```

```text
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "renderers.py", line 4, in <module>
    from formbuilder.domain import Element
  File "domain.py", line 4, in <module>
    from formbuilder.renderers import Renderer
ImportError: cannot import name 'Renderer' from partially initialized module 'formbuilder.renderers' (most likely due to a circular import) (renderers.py)
```

Друге формулювання тієї самої проблеми з'являється, коли цикл зроблено через `import модуль`, а атрибут читається на верхньому рівні. `import formbuilder.domain as domain` у циклі не падає, бо просто бере недовиконаний об'єкт з `sys.modules`. Але анотація параметра обчислюється в момент виконання `def`, тобто ще під час імпорту:

```python
# formbuilder/renderers.py
from typing import Protocol

import formbuilder.domain as domain


class Renderer(Protocol):
    def render(self, element: domain.Element) -> str: ...


class HtmlRenderer:
    def render(self, element: domain.Element) -> str:
        return f'<label for="{element.name}">{element.label}</label>'
```

```text
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "domain.py", line 4, in <module>
    from formbuilder.renderers import Renderer
  File "renderers.py", line 7, in <module>
    class Renderer(Protocol):
  File "renderers.py", line 8, in Renderer
    def render(self, element: domain.Element) -> str: ...
                              ^^^^^^^^^^^^^^
AttributeError: partially initialized module 'formbuilder.domain' has no attribute 'Element' (most likely due to a circular import)
```

Діагностика завжди однакова: traceback циклічного імпорту це петля з кадрів `in <module>`. Читайте його згори: `domain.py` рядок 4 → `renderers.py` рядок 4 → знову `formbuilder.domain`. Модуль, названий в останньому рядку, це той, що виконаний наполовину, а рядки імпорту в кадрах це саме ті ребра графа, одне з яких треба прибрати. Частий варіант, у якому в петлі бере участь сам пакет, це barrel у `__init__.py`:

```python
# formbuilder/__init__.py
from formbuilder.cli import main

__version__ = "0.1.0"
__all__ = ["__version__", "main"]
```

```python
# formbuilder/cli.py
from formbuilder import __version__


def main() -> int:
    print(f"formbuilder {__version__}")
    return 0
```

```bash
python -c "import formbuilder"
```

```text
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "__init__.py", line 2, in <module>
    from formbuilder.cli import main
  File "cli.py", line 2, in <module>
    from formbuilder import __version__
ImportError: cannot import name '__version__' from partially initialized module 'formbuilder' (most likely due to a circular import) (__init__.py)
```

Ліків три, і порядок їх вибору важливий. Перше: прибрати ребро графа, перенісши спільне туди, де йому місце. Якщо обом модулям потрібна одна річ, вона йде в третій модуль, від якого залежать обидва. А якщо `domain` потребує лише інтерфейсу рендерера, `Protocol` можна оголосити в самому `domain`: рендерери задовольняють його структурно й не наслідують (m2-l07), тож `renderers` імпортує `domain`, а не навпаки.

```python
# formbuilder/domain.py
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Element:
    name: str
    label: str


class Renderer(Protocol):
    def render(self, element: Element) -> str: ...


@dataclass(frozen=True)
class FormConfig:
    elements: tuple[Element, ...]

    def render(self, renderer: Renderer) -> str:
        return "".join(renderer.render(el) for el in self.elements)
```

```python
# formbuilder/renderers.py
from formbuilder.domain import Element


class HtmlRenderer:
    def render(self, element: Element) -> str:
        return f'<label for="{element.name}">{element.label}</label>'
```

```bash
python -c "from formbuilder.domain import Element, FormConfig; from formbuilder.renderers import HtmlRenderer; print(FormConfig(elements=(Element('email', 'Email'),)).render(HtmlRenderer()))"
mypy --strict formbuilder
```

```text
<label for="email">Email</label>
Success: no issues found in 3 source files
```

Друге: імпорт усередині функції, коли нижньому модулю справді потрібен код верхнього під час роботи, наприклад рендерер за замовчуванням. До виклику функції обидва модулі вже повністю виконані, тож циклу на етапі імпорту немає.

```python
# formbuilder/domain.py
from dataclasses import dataclass


@dataclass(frozen=True)
class Element:
    name: str
    label: str


@dataclass(frozen=True)
class FormConfig:
    elements: tuple[Element, ...]

    def to_html(self) -> str:
        from formbuilder.renderers import HtmlRenderer

        renderer = HtmlRenderer()
        return "".join(renderer.render(el) for el in self.elements)
```

```python
# main.py
import sys

from formbuilder.domain import Element, FormConfig

form = FormConfig(elements=(Element("email", "Email"),))
print("formbuilder.renderers" in sys.modules)
print(form.to_html())
print("formbuilder.renderers" in sys.modules)
```

```text
False
<label for="email">Email</label>
True
```

Третє, для імпортів, потрібних лише анотаціям: `typing.TYPE_CHECKING`. Це константа, яка під час виконання дорівнює `False`, а для mypy і pyright вважається `True`. Блок `if TYPE_CHECKING:` бачить лише type checker; інтерпретатор його пропускає, тож ребро графа існує тільки статично. У браузері пакета `formbuilder` немає взагалі, і саме тому приклад нижче працює:

```python live
from typing import TYPE_CHECKING

print(TYPE_CHECKING)

if TYPE_CHECKING:
    from formbuilder.renderers import Renderer  # у браузері такого пакета немає


def emphasize(renderer: "Renderer", label: str) -> str:
    return f"*{renderer.render(label)}*"


class Upper:
    def render(self, label: str) -> str:
        return label.upper()


print(emphasize(Upper(), "ok"))
print(emphasize.__annotations__)
```

```text
False
*OK*
{'renderer': 'Renderer', 'label': <class 'str'>, 'return': <class 'str'>}
```

> **Пастка.** У Python 3.12 анотації параметрів обчислюються в момент виконання `def`. Ім'я з блоку `TYPE_CHECKING` під час виконання не існує, тому анотація без лапок падає ще при імпорті модуля. Рятує анотація рядком, `renderer: "Renderer"`, або рядок `from __future__ import annotations` першим у файлі: він перетворює всі анотації модуля на рядки. У 3.14 анотації стали лінивими, і той самий код без лапок там працює, але курс пише під 3.12.

```python
# formbuilder/domain.py
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from formbuilder.renderers import Renderer


@dataclass(frozen=True)
class Element:
    name: str
    label: str


@dataclass(frozen=True)
class FormConfig:
    elements: tuple[Element, ...]

    def render(self, renderer: Renderer) -> str:
        return "".join(renderer.render(el) for el in self.elements)
```

```bash
python -c "import formbuilder.domain"
```

```text
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "domain.py", line 16, in <module>
    class FormConfig:
  File "domain.py", line 19, in FormConfig
    def render(self, renderer: Renderer) -> str:
                               ^^^^^^^^
NameError: name 'Renderer' is not defined
```

З `renderer: "Renderer"` або з `from __future__ import annotations` імпорт `formbuilder.domain` більше не підтягує рендерери взагалі, а mypy перевіряє типи так само, як з реальним імпортом. Останній запуск нижче показує 3.14 на версії без лапок і без `__future__`:

```python
# main.py
import sys

from formbuilder.domain import Element, FormConfig

print([m for m in sys.modules if m.startswith("formbuilder")])

from formbuilder.renderers import HtmlRenderer

form = FormConfig(elements=(Element("email", "Email"), Element("age", "Age")))
print(form.render(HtmlRenderer()))
```

```bash
python main.py
mypy --strict formbuilder main.py
python3.14 main.py
```

```text
['formbuilder', 'formbuilder.domain']
<label for="email">Email</label><label for="age">Age</label>
Success: no issues found in 4 source files
['formbuilder', 'formbuilder.domain']
<label for="email">Email</label><label for="age">Age</label>
```

> **Пастка.** `TYPE_CHECKING` годиться лише там, де анотації ніхто не читає під час виконання. Pydantic, FastAPI і `typing.get_type_hints` читають їх саме під час виконання, і тип, імпортований лише для type checker, для них не існує. Останній рядок traceback:

```python
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from decimal import Decimal


class Price(BaseModel):
    amount: "Decimal"


Price(amount="9.99")
```

```text
pydantic.errors.PydanticUserError: `Price` is not fully defined; you should define `Decimal`, then call `Price.model_rebuild()`.
```

<!-- task: q4 -->

<!-- task: t2 -->

## Код верхнього рівня: побічні ефекти й модуль як singleton

Усе, що стоїть на верхньому рівні модуля, виконується при першому імпорті, хоч би хто імпортував: CLI, тест під час збирання (collection) у pytest, сусідній модуль заради однієї константи. Тому побічний ефект (side effect) на рівні модуля, будь то `print`, підключення до бази чи читання файлу конфігурації, стає побічним ефектом рядка `import`. Типовий випадок: модуль читає файл за відносним шляхом, і результат залежить від того, з якої директорії запущено процес.

```python
# service/settings.py
import json
from pathlib import Path

print("settings.py: reading settings.json")
SETTINGS = json.loads(Path("settings.json").read_text())
```

```python
# service/main.py
from settings import SETTINGS

print(SETTINGS["out_dir"])
```

```text
$ cd service && python main.py
settings.py: reading settings.json
dist
$ python service/main.py
settings.py: reading settings.json
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    from settings import SETTINGS
  File "settings.py", line 6, in <module>
    SETTINGS = json.loads(Path("settings.json").read_text())
                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "pathlib.py", line 1027, in read_text
    with self.open(mode='r', encoding=encoding, errors=errors) as f:
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "pathlib.py", line 1013, in open
    return io.open(self, mode, buffering, encoding, errors, newline)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
FileNotFoundError: [Errno 2] No such file or directory: 'settings.json'
```

Помилка вилетіла з рядка `from settings import SETTINGS`, тобто модуль не можна навіть імпортувати, щоб протестувати чи підмінити шлях. Правило: на верхньому рівні лише визначення (функції, класи, дешеві константи), а будь-яке введення-виведення живе у функціях, які викликає той, кому воно потрібно. Те саме стосується запуску: код, що має виконатися лише при `python script.py`, стоїть під `if __name__ == "__main__":` (m0-l03). Ось чому це важливо саме в Python: кеш імпорту ключується іменем, і скрипт, запущений за шляхом, має ім'я `__main__`. Якщо інший модуль імпортує його за справжнім іменем, файл виконається вдруге, як новий модуль.

```python
# app.py
print(f"app.py executing as {__name__!r}")
import helpers

COUNTER = 0
```

```python
# helpers.py
import app

print("helpers sees app.COUNTER =", app.COUNTER)
```

```text
$ python app.py
app.py executing as '__main__'
app.py executing as 'app'
helpers sees app.COUNTER = 0
```

Два об'єкти модуля з одного файлу означають два набори глобальних змінних, і зміна `COUNTER` у скрипті не видна `helpers`. Звідси практика m0-l06: точка входу тонка (`__main__.py` або console script викликає `main()`), а вся логіка в модулях, які лише імпортують.

Обернений бік тієї самої властивості корисний. Об'єкт модуля створюється один раз на процес і спільний для всіх, хто його імпортував, тож модуль і є singleton (назва патерну з GoF): простір імен зі станом, який не потребує класу з `__new__` і `get_instance()`. Конфіг застосунку в капстоуні живе саме так: модуль з функцією, що читає файл ліниво при першому виклику і кешує результат через `functools.cache`, і з атрибутами, які можна змінити з будь-якого місця. Патерн "модуль замість класу-синглтона" разом з іншими патернами GoF розібраний у m4-l08.

```python
# service/settings.py
import json
from functools import cache
from pathlib import Path

ROOT = Path(__file__).parent
verbose = False


@cache
def load() -> dict[str, str]:
    print("settings.py: reading settings.json")
    return json.loads((ROOT / "settings.json").read_text())
```

```python
# service/render.py
import settings


def render(name: str) -> str:
    out_dir = settings.load()["out_dir"]
    if settings.verbose:
        print(f"render {name} -> {out_dir}")
    return f"{out_dir}/{name}.html"
```

```python
# service/main.py
import render
import settings

print("imported, nothing read yet")
settings.verbose = True
print(render.render("signup"))
print(render.render("contact"))
print(settings.load() is settings.load())
```

```text
$ python service/main.py
imported, nothing read yet
settings.py: reading settings.json
render signup -> dist
dist/signup.html
render contact -> dist
dist/contact.html
True
```

> **JS-аналог.** Модуль ESM теж singleton: `export const store = createStore()` створюється один раз на граф модулів. Різниця в тому, що атрибути об'єкта модуля в Python можна перепризначити ззовні (`settings.verbose = True` вище), тоді як ESM-експорти для імпортера доступні лише для читання. Саме на цьому стоїть підміна залежностей у тестах через `monkeypatch.setattr` (m3-l03, m3-l04). І саме тому `render.py` пише `settings.verbose`, а не `from settings import verbose`: копія імені не побачила б зміни.

## Динамічний імпорт: `importlib.import_module`

`importlib.import_module(name)` робить те саме, що інструкція `import`, але ім'я модуля передається рядком, а результат повертається, а не прив'язується до імені. Кеш той самий: повторний виклик повертає об'єкт із `sys.modules`. Об'єкт з модуля за іменем дістає вбудована `getattr`. Відносне ім'я можна передати разом з аргументом `package`.

```python live
import importlib
import sys

name = "html"
module = importlib.import_module(name)
print(module.__name__, module is sys.modules["html"])

escape = getattr(module, "escape")
print(escape('<label for="email">'))

parser = importlib.import_module(".parser", package="html")
print(parser.__name__, hasattr(module, "parser"))

for target in ["json.decoder", "no_such_renderer"]:
    try:
        print(importlib.import_module(target).__name__)
    except ModuleNotFoundError as e:
        print(type(e).__name__, e.name)

print(importlib.import_module("os.path").__name__, __import__("os.path").__name__)
```

```text
html True
&lt;label for=&quot;email&quot;&gt;
html.parser True
json.decoder
ModuleNotFoundError no_such_renderer
posixpath os
```

```ts
const mod = await import(`./renderers/${format}.js`);
const renderer = mod.default;
```

```python
import importlib

module = importlib.import_module(f"formbuilder.renderers.{fmt}")
renderer = getattr(module, "renderer")
```

Ідея та сама, поведінка ні. `import()` у JS асинхронний, повертає Promise і для бандлера є точкою розрізання коду на чанки. `import_module` синхронний: він виконує модуль просто зараз, у поточному потоці, і повертає готовий об'єкт; ніякого розрізання чи окремого завантаження немає, є лише відкладене виконання. Шлях теж задається інакше: не відносним шляхом до файлу, а повним іменем модуля.

Навіщо це в бекенді: реєстр плагінів за іменем. Конфіг форми каже `"format": "html"`, і код вибирає модуль `formbuilder.renderers.html`, не знаючи заздалегідь списку форматів. Новий формат це новий файл у папці, без правок реєстру, і жоден рендерер не імпортується, поки його не попросили. Список доступних модулів пакета дає `pkgutil.iter_modules(package.__path__)`, і він читає лише імена файлів, нічого не виконуючи. Вбудована `__import__` робить схоже, але для `"os.path"` повертає пакет верхнього рівня `os`, а не підмодуль (останній рядок прикладу вище), тож у власному коді її не викликають. Плагіни зі сторонніх пакетів, які шукаються через entry points у метаданих встановлених дистрибутивів, розібрані в m3-l02.

> **Пастка.** `except ModuleNotFoundError` навколо `import_module` ловить не лише "немає такого формату", а й "у плагіна немає залежності". Модуль `renderers/pdf.py`, що імпортує невстановлений `weasyprint`, з наївним реєстром дає безглузде повідомлення.

```python
import importlib


def get_renderer_naive(fmt: str) -> object:
    try:
        module = importlib.import_module(f"formbuilder.renderers.{fmt}")
    except ModuleNotFoundError:
        raise LookupError(f"unknown format {fmt!r}") from None
    return module.renderer


get_renderer_naive("pdf")
```

```text
LookupError: unknown format 'pdf'
```

Файл `pdf.py` існує, формат відомий, а справжня причина, відсутній `weasyprint`, зникла. Правильна перевірка порівнює `e.name` з іменем модуля, який ви імпортували, і пропускає все інше далі без змін; реалізація в розділі для капстоуну дає на тому самому файлі:

```text
  File "pdf.py", line 3, in <module>
    import weasyprint
ModuleNotFoundError: No module named 'weasyprint'
```

<!-- task: t3 -->

<!-- task: t4 -->

## Для капстоуну

Після модуля 2 у капстоуні вже є `cli.py` зі скелета m0-l06, `domain.py` (m2-l05), `config.py` (m2-l06, m2-l09) і пакет `renderers/` (m2-l07). Файли на своїх місцях і далі не перейменовуються; цей урок фіксує, хто кого імпортує, і наступні уроки лише додають модулі в цю розкладку:

```text
src/formbuilder/
├── __init__.py          # докстрінг і __version__, нічого не реекспортує
├── __main__.py          # python -m formbuilder
├── cli.py               # верхній шар: розбір аргументів, зв'язує config і renderers
├── config.py            # вхідна межа: JSON → Pydantic-моделі (m2-l09) → domain
├── domain.py            # нижній шар: frozen dataclass-и й чисті функції (m2-l05)
└── renderers/
    ├── __init__.py      # Renderer, available_formats(), get_renderer(fmt)
    ├── base.py          # Protocol Renderer (m2-l07)
    ├── html.py          # HtmlRenderer і об'єкт renderer
    └── text.py          # TextRenderer і об'єкт renderer
```

Шари залежать лише згори вниз: `cli` → `config`, `renderers` → `domain`. `domain` під час виконання не імпортує нічого з `formbuilder` і нічого стороннього. `config` і `renderers` стоять поруч і не імпортують один одного: Pydantic потрібен для перевірки вхідних даних, а рендерер отримує вже готові domain-об'єкти. Лише `cli` знає про всіх, бо він збирає ланцюжок "прочитати конфіг → вибрати рендерер → віддати результат". Єдине ребро вгору, `domain` → `renderers` для анотації `FormConfig.render(renderer: Renderer)`, існує тільки для type checker:

```python
"""Internal form model: frozen dataclasses and pure functions, no I/O."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from formbuilder.renderers import Renderer

...


@dataclass(frozen=True, slots=True, kw_only=True)
class FormConfig:
    title: str
    elements: tuple[Element, ...]
    theme: Theme = field(default_factory=Theme)

    def render(self, renderer: Renderer) -> str:
        return "\n".join(renderer.render(el, self.theme) for el in walk(self.elements))
```

Без `TYPE_CHECKING` цей рядок замикає петлю через `renderers/__init__.py` і `renderers/base.py`, якому потрібні `Element` і `Theme`:

```text
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "domain.py", line 6, in <module>
    from formbuilder.renderers import Renderer
  File "__init__.py", line 6, in <module>
    from formbuilder.renderers.base import Renderer
  File "base.py", line 5, in <module>
    from formbuilder.domain import Element, Theme
ImportError: cannot import name 'Element' from partially initialized module 'formbuilder.domain' (most likely due to a circular import) (domain.py)
```

Реєстр рендерерів у `renderers/__init__.py` поєднує все з розділу про динамічний імпорт: ім'я формату стає іменем модуля, `__path__` пакета дає список форматів без імпорту, `e.name` відрізняє невідомий формат від зламаного плагіна, а перевірка `isinstance` на `@runtime_checkable` протоколі ловить модуль без правильного об'єкта `renderer`.

```python
"""Renderers: one module per output format, imported by name on demand."""

import importlib
import pkgutil

from formbuilder.renderers.base import Renderer

__all__ = ["Renderer", "available_formats", "get_renderer"]


def available_formats() -> list[str]:
    return sorted(
        info.name
        for info in pkgutil.iter_modules(__path__)
        if not info.name.startswith("_") and info.name != "base"
    )


def get_renderer(fmt: str) -> Renderer:
    module_name = f"{__name__}.{fmt}"
    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError as e:
        if e.name != module_name:
            raise
        known = ", ".join(available_formats())
        raise LookupError(f"unknown format {fmt!r}; available: {known}") from None
    renderer = getattr(module, "renderer", None)
    if not isinstance(renderer, Renderer):
        raise TypeError(f"{module_name}.renderer does not implement Renderer")
    return renderer
```

```bash
uv run python -c "
import sys
from formbuilder.renderers import available_formats, get_renderer
print(available_formats())
print([m for m in sys.modules if m.startswith('formbuilder.renderers')])
r = get_renderer('html')
print(type(r).__name__, [m for m in sys.modules if m.startswith('formbuilder.renderers')])
"
uv run formbuilder render signup.json
uv run formbuilder render signup.json text
uv run formbuilder render signup.json pdf
```

```text
['html', 'text']
['formbuilder.renderers.base', 'formbuilder.renderers']
HtmlRenderer ['formbuilder.renderers.base', 'formbuilder.renderers', 'formbuilder.renderers.html']
<label for="email">Email &amp; login</label><input id="email">
<button style="background:#2563eb">Send</button>
[input] Email & login
[button] Send
LookupError: unknown format 'pdf'; available: html, text
```

> **Для капстоуну.** Правило шарів не тримається на дисципліні: його перевіряє тест, який імпортує модуль у свіжому інтерпретаторі й дивиться, що потрапило в `sys.modules`. Свіжий процес потрібен, бо в процесі pytest `sys.modules` вже заповнений усім, що імпортували інші тести. Повернення прямого імпорту в `domain.py` валить такий тест одразу, ще до того, як цикл десь проявиться. Для великих проєктів те саме роблять декларативно інструментом import-linter з контрактом `layers`; для чотирьох модулів досить тесту з `p1`.

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **`__init__.py` як `index.ts` у кожній папці.** Реекспорт усього підряд робить кожен імпорт підмодуля дорогим і замикає цикли через сам пакет. Правильно: порожній `__init__.py` за замовчуванням, реекспорт лише публічного API з `__all__` там, де розкладку справді треба сховати.

   ```python
   # formbuilder/__init__.py
   """FormBuilder backend."""

   from importlib.metadata import version

   __version__ = version("formbuilder")
   ```

2. **Відносні шляхи `../../`.** Переносять звичку з JS у `from ..core import helpers` або, гірше, в `import config` без крапки, який працює лише при запуску скрипта за шляхом. Правильно: абсолютний імпорт від імені пакета і `ban-relative-imports` у ruff.

   ```python
   from ..core import helpers  # залежить від того, як запущено код
   from formbuilder.core import helpers  # працює звідусіль
   ```

3. **Очікування tree-shaking.** `from big_module import small_function` виконує весь `big_module` і все, що той імпортує. Правильно: тримати модулі вузькими, важкі необов'язкові залежності імпортувати всередині функції, яка їх використовує.

   ```python
   def export_yaml(data: dict[str, object]) -> str:
       import yaml  # потрібен лише тут, не при кожному імпорті модуля

       return yaml.safe_dump(data)
   ```

4. **Очікування default export.** `import slugify` дає модуль, а не функцію з ним. Правильно: `from slugify import slugify` або `slugify.slugify(...)`.

   ```python
   import slugify

   slugify("Sign Up")  # TypeError: 'module' object is not callable. Did you mean: 'slugify.slugify(...)'?
   ```

5. **Очікування, що імпорт лінивий і нічого не робить.** Код верхнього рівня виконується в момент імпорту: читання файлів, підключення, `print`. Правильно: на верхньому рівні лише визначення, введення-виведення у функціях, лінивий кеш через `functools.cache`.

   ```python
   SETTINGS = json.loads(Path("settings.json").read_text())  # падає при import


   @cache
   def load() -> dict[str, str]:  # читає при першому виклику
       return json.loads((ROOT / "settings.json").read_text())
   ```

6. **Очікування live binding.** `from counter import count` копіює посилання один раз; перепризначення в `counter` ви не побачите. Правильно: змінний стан читати через модуль.

   ```python
   import counter

   counter.bump()
   print(counter.count)  # 1, а from counter import count дав би 0
   ```

7. **Файл з іменем модуля stdlib чи залежності.** `json.py`, `random.py`, `test.py`, `yaml.py` у корені затіняють справжні модулі. Правильно: унікальні імена, а при дивній `AttributeError` у stdlib перевірити `module.__file__`.

   ```python
   import json

   print(json.__file__)  # має бути .../lib/python3.12/json/__init__.py
   ```

8. **`from module import *` у коді.** Ні читач, ні лінтер не знають, звідки ім'я, а зірочка мовчки перезаписує вже наявні, як `open` з `os`. Правильно: явні імена або імпорт модуля.

   ```python
   from os import *  # open тепер os.open
   from os import environ, getcwd  # правильно
   ```

## Підсумок

- `import` це інструкція під час виконання: пошук у `sys.modules`, потім finder-и по `sys.path`, виконання файлу один раз, прив'язка імені.
- Кеш ключується іменем модуля, не шляхом: скрипт `__main__`, імпортований за справжнім іменем, виконується вдруге.
- `from a import x` виконує весь `a`, tree-shaking немає; ім'я `x` це копія посилання, а не live binding.
- Default export немає: `import x` завжди дає об'єкт модуля. `from x import *` лише в REPL; `__all__` задає публічний API.
- Пакет це модуль з `__path__`; його `__init__.py` виконується при імпорті будь-якого підмодуля, але сам підмодулі не імпортує. `__init__.py` ставлять завжди, кладуть у нього нічого або явний реекспорт.
- Відносні імпорти рахують від `__package__` і не працюють у скрипті, запущеному за шляхом; курс пише лише абсолютні, ruff TID252 це закріплює.
- `ModuleNotFoundError`: перевірити інтерпретатор (`uv run`), `sys.path`, встановлення пакета, `__init__.py`, `e.name`. Дивна `AttributeError` у stdlib: перевірити `module.__file__` на затінення.
- Циклічний імпорт падає з `partially initialized module`, і результат залежить від порядку імпорту. Ліки по черзі: перенести спільне, імпорт у функції, `TYPE_CHECKING` з анотаціями в лапках або `from __future__ import annotations`.
- `TYPE_CHECKING` не годиться для типів, які читають під час виконання: Pydantic, FastAPI, `get_type_hints`.
- Модуль це singleton: стан і лінивий кеш у модулі замість класу-синглтона. `importlib.import_module` + `getattr` дають реєстр плагінів за іменем; невідомий модуль відрізняють від зламаного через `e.name`.

## Що далі

Наступний урок m3-l02 про пакування: `pyproject.toml` повністю, залежності й dev-залежності, lockfile, збирання wheel. Розкладка `config` / `domain` / `renderers/` / `cli` з цього уроку там стає вмістом wheel, а реєстр `get_renderer` розшириться на сторонні пакети через entry points, той самий динамічний імпорт, але з іменами модулів з метаданих. У m3-l03 з'являться тести для `formbuilder.config` з `parametrize` і фікстурами.
