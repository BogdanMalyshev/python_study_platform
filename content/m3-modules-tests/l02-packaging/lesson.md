---
id: m3-l02
module: m3-modules-tests
title: "Пакет із pyproject.toml, залежності, lockfile через uv"
summary: "Учень збирає капстоун у sdist і wheel через uv build, розуміє, що лежить у wheel і як туди потрапляють шаблони, розрізняє extras і dependency groups, читає PEP 508-рядки з маркерами й версії PEP 440, оновлює uv.lock точково, реєструє плагіни через entry points, веде кілька пакетів у workspace і знає, як виглядає публікація."
duration_min: 90
prerequisites: [m3-l01]
---

## `uv build`: sdist, wheel і теги платформ

У npm пакет збирає та сама утиліта, що його публікує: `npm pack` або `npm publish` беруть файли за полем `files` і пакують tarball. У Python збирання розділене на дві ролі. Build frontend (офіційний термін PEP 517) це команда, яку запускаєте ви: `uv build`, `pip wheel`, `python -m build`. Build backend (теж PEP 517) це бібліотека з `[build-system]`, яка знає, як з вашого дерева зробити архів. Frontend створює ізольоване оточення, ставить туди пакети з `requires`, імпортує модуль з `build-backend` і викликає в нього стандартні функції `build_sdist` і `build_wheel`. Будь-який frontend працює з будь-яким backend, тому `[build-system]` описує не "яким інструментом ви користуєтесь", а "чим цей проєкт збирається в будь-кого".

```bash
uv build
ls dist
```

```text
Building source distribution (uv build backend)...
Building wheel from source distribution (uv build backend)...
Successfully built dist/formbuilder-0.1.0.tar.gz
Successfully built dist/formbuilder-0.1.0-py3-none-any.whl
formbuilder-0.1.0-py3-none-any.whl
formbuilder-0.1.0.tar.gz
```

Результатів два. Sdist (source distribution, офіційна назва) це `.tar.gz` з вихідниками і `pyproject.toml`: з нього пакет можна зібрати заново на будь-якій машині. Wheel (офіційна назва, PEP 427) це вже зібраний пакет у форматі zip, який інсталятор просто розпаковує в `site-packages`. Другий рядок виводу важливий: wheel зібраний не з робочої директорії, а з щойно створеного sdist. Якщо файл не потрапив у sdist, його не буде і у wheel, і помилку видно одразу, а не в користувача. Окремо збирати можна `uv build --sdist` або `uv build --wheel`, а `--clear` спершу очищає `dist/` від старих версій. У `dist/` uv кладе `.gitignore` з рядком `*`, тому артефакти не потраплять у git.

Backend обирається одним рядком, і для нового чистого Python-проєкту вибір невеликий. `uv_build` згенерував `uv init`, він найшвидший і з жорсткими конвенціями: модуль у `src/<name>/`, у пакет іде вся ця папка. Hatchling (backend проєкту Hatch) так само без конфігурації знаходить src-layout і пакує все, що не в `.gitignore`. Setuptools найстаріший і найгнучкіший, вміє компілювати C-розширення, але має найбільше історичних умовностей, одну з яких видно в наступному розділі.

```toml
[build-system]                                  # uv init за замовчуванням
requires = ["uv_build>=0.9.28,<0.10.0"]
build-backend = "uv_build"

[build-system]                                  # Hatch
requires = ["hatchling>=1.27"]
build-backend = "hatchling.build"

[build-system]                                  # setuptools
requires = ["setuptools>=77"]
build-backend = "setuptools.build_meta"
```

> **JS-аналог.** `npm publish` сам викликає пакування, тому в npm немає кроку "зібрати дистрибутив" окремо від публікації. У Python `uv publish` нічого не збирає, а завантажує готові файли з `dist/`. Без `uv build` перед ним команда падає з `error: No files found to publish`. Найближча аналогія з JS: `tsc && npm publish`, де `tsc` обов'язковий, а `prepublishOnly` не існує.

Wheel можна розпакувати будь-яким zip-інструментом. Поруч з кодом пакета лежить каталог `dist-info` (офіційна назва, PEP 376 і специфікація Recording installed projects): `METADATA` з усім, що ви написали в `[project]`, `WHEEL` з тегом сумісності, `entry_points.txt` з `[project.scripts]` і `RECORD` зі списком файлів. Саме цей каталог після встановлення лежить у `site-packages`, і з нього `importlib.metadata` з m0-l06 читає версію.

```bash
unzip -l dist/formbuilder-0.1.0-py3-none-any.whl
unzip -p dist/formbuilder-0.1.0-py3-none-any.whl formbuilder-0.1.0.dist-info/WHEEL
```

```text
Archive:  dist/formbuilder-0.1.0-py3-none-any.whl
  Length      Date    Time    Name
---------  ---------- -----   ----
        0  01-01-1980 00:00   formbuilder/
      158  01-01-1980 00:00   formbuilder/__init__.py
      129  01-01-1980 00:00   formbuilder/__main__.py
      588  01-01-1980 00:00   formbuilder/cli.py
        0  01-01-1980 00:00   formbuilder-0.1.0.dist-info/
       80  01-01-1980 00:00   formbuilder-0.1.0.dist-info/WHEEL
       54  01-01-1980 00:00   formbuilder-0.1.0.dist-info/entry_points.txt
     1372  01-01-1980 00:00   formbuilder-0.1.0.dist-info/METADATA
      549  01-01-1980 00:00   formbuilder-0.1.0.dist-info/RECORD
---------                     -------
     2930                     9 files
Wheel-Version: 1.0
Generator: uv 0.9.28
Root-Is-Purelib: true
Tag: py3-none-any
```

> **Під капотом.** `RECORD` містить для кожного файлу sha256 у base64 без `=` на кінці і розмір. Інсталятор звіряє файли з ним, а `uv pip uninstall` бере з нього список того, що видаляти. Дата `01-01-1980` не помилка: uv_build ставить усім файлам фіксований час, щоб однакові вихідники давали побайтово однаковий wheel (reproducible build).

```bash
unzip -p dist/formbuilder-0.1.0-py3-none-any.whl formbuilder/cli.py | python3.12 -c "
import base64, hashlib, sys
digest = hashlib.sha256(sys.stdin.buffer.read()).digest()
print(base64.urlsafe_b64encode(digest).rstrip(b'=').decode())
"
unzip -p dist/formbuilder-0.1.0-py3-none-any.whl formbuilder-0.1.0.dist-info/RECORD | grep cli.py
```

```text
hKAKskjTb0S3B6fgf4k1DeanlTb2TGkg3kt3yL4rQ1s
formbuilder/cli.py,sha256=hKAKskjTb0S3B6fgf4k1DeanlTb2TGkg3kt3yL4rQ1s,588
```

Ім'я wheel це структуровані дані: `{name}-{version}-{python tag}-{abi tag}-{platform tag}.whl` (wheel tags, офіційний термін зі специфікації Platform compatibility tags). `py3-none-any` у капстоуні означає "будь-який Python 3, без залежності від ABI, будь-яка платформа": у пакеті лише `.py`-файли. `pydantic-core` написаний на Rust і містить скомпільовану бібліотеку `.so`, яку не можна запустити на іншій ОС, архітектурі чи версії CPython. Тому на PyPI на одну версію `pydantic-core` лежить майже сотня wheel, а `uv.lock` записує всі, щоб той самий lock ставився на будь-якій машині.

```bash
awk '/^name = "pydantic-core"/,/^\[\[package\]\]$/' uv.lock | grep -c '\.whl", hash'
awk '/^name = "pydantic-core"/,/^\[\[package\]\]$/' uv.lock | grep -o 'pydantic_core-2.50.1-[^"]*whl' | grep cp312 | head -4
cat .venv/lib/python3.12/site-packages/pydantic_core-*.dist-info/WHEEL
ls .venv/lib/python3.12/site-packages/pydantic_core/ | grep '\.so$'
```

```text
95
pydantic_core-2.50.1-cp312-cp312-macosx_10_12_x86_64.whl
pydantic_core-2.50.1-cp312-cp312-macosx_11_0_arm64.whl
pydantic_core-2.50.1-cp312-cp312-manylinux_2_17_aarch64.manylinux2014_aarch64.whl
pydantic_core-2.50.1-cp312-cp312-manylinux_2_17_armv7l.manylinux2014_armv7l.whl
Wheel-Version: 1.0
Generator: maturin (1.15.0)
Root-Is-Purelib: false
Tag: cp312-cp312-macosx_11_0_arm64
_pydantic_core.cpython-312-darwin.so
```

Інсталятор вибирає wheel так: інтерпретатор знає впорядкований список тегів, які він підтримує, від найспецифічнішого до найзагальнішого, і бере перший wheel, тег якого є в списку. `py3-none-any` стоїть майже в самому кінці: universal wheel підходить завжди, але програє будь-якому платформному. Якщо жодного підходящого wheel немає, інсталятор бере sdist і збирає пакет на місці, а для Rust чи C це означає компілятор на машині. У Docker-образі на Alpine (musl замість glibc) саме тут виникають півгодинні збірки, детально в m7-l07.

```bash
uv run python -c "
from packaging.tags import sys_tags
tags = [str(t) for t in sys_tags()]
print(*tags[:3], sep='\n')
print(len(tags), tags.index('py3-none-any'))
"
```

```text
cp312-cp312-macosx_26_0_arm64
cp312-cp312-macosx_26_0_universal2
cp312-cp312-macosx_25_0_arm64
1230 1217
```

> **JS-аналог.** Так само розв'язана проблема в esbuild, swc чи `@next/swc`: основний пакет тягне `optionalDependencies` на кшталт `@esbuild/darwin-arm64`, і npm ставить той, що підходить за полями `os` і `cpu`. Старий шлях через `node-gyp` у `postinstall` відповідає встановленню з sdist. Різниця в тому, що в Python вибір платформи вбудований у формат і в ім'я файлу, а не в домовленість між пакетами.

Встановлення wheel не виконує жодного коду пакета: інсталятор розпаковує zip, пише `RECORD`, генерує скрипти з `entry_points.txt` і все. Аналога `postinstall` немає принципово. Тому перевірка "пакет самодостатній" виглядає так: свіже порожнє venv, туди лише wheel, і запуск. Якщо пакет працює тільки з робочої копії, тут це стане видно.

```bash
uv venv ../wheel-check
uv pip install --python ../wheel-check/bin/python dist/formbuilder-0.1.0-py3-none-any.whl
cd .. && wheel-check/bin/formbuilder --help
wheel-check/bin/python -c "import formbuilder; print(formbuilder.__file__)"
```

```text
Using CPython 3.12.12
Creating virtual environment at: ../wheel-check
Activate with: source ../wheel-check/bin/activate
Using Python 3.12.12 environment at: …/wheel-check
Resolved 1 package in 2ms
Prepared 1 package in 3ms
Installed 1 package in 2ms
 + formbuilder==0.1.0 (from file://…/capstone/dist/formbuilder-0.1.0-py3-none-any.whl)
usage: formbuilder [--help] [--version]  (stub: commands arrive in m6-l06)
…/wheel-check/lib/python3.12/site-packages/formbuilder/__init__.py
```

Абсолютні шляхи тут і далі скорочено до `…/`. `__file__` тепер вказує в `site-packages`, а не в `src/`: це копія з wheel, а не editable-посилання з m0-l06. Тут же src-layout і окупається: з кореня проєкту `import formbuilder` не підхопить робочу папку, тож забутий файл дасть помилку і в тестах, і в цій перевірці.

> **Пастка.** Коротший шлях `uv run --isolated --no-project --with dist/formbuilder-0.2.0-py3-none-any.whl` кешує оточення під цей набір вимог. На фінальному стані капстоуну цього уроку (версія 0.2.0) після перезбирання з тією самою версією він показав старий вміст пакета: файл `added_later.py` є у wheel, але не в оточенні. Для екосистеми це логічно, бо ім'я файлу з версією вважається незмінним (PyPI не дозволяє перезалити той самий файл), але для перевірки локальної збірки беріть свіже venv.

```bash
echo 'X = 1' > src/formbuilder/added_later.py
rm -rf dist && uv build -q && unzip -l dist/*.whl | grep added
uv run -q --isolated --no-project --with dist/formbuilder-0.2.0-py3-none-any.whl python -c "import formbuilder, os; print(sorted(os.listdir(os.path.dirname(formbuilder.__file__))))"
```

```text
        6  01-01-1980 00:00   formbuilder/added_later.py
['__init__.py', '__main__.py', 'cli.py', 'plugins.py', 'renderers', 'templates', 'templating.py']
```

## Що потрапляє в пакет: код, шаблони і чого там немає

`uv_build` пакує у wheel усю папку `src/formbuilder/`, не лише `.py`: шаблони, JSON-схеми, SQL-файли поруч із кодом підуть автоматично. У sdist додаються ще `pyproject.toml`, `README.md` і файли ліцензії. `tests/`, `docs/`, `.github/` не йдуть ні в wheel, ні в sdist: користувач пакета їх не імпортує, і саме тому тести живуть окремо від `src/` (m0-l06).

```bash
tar tzf dist/formbuilder-0.2.0.tar.gz
```

```text
formbuilder-0.2.0/PKG-INFO
formbuilder-0.2.0/
formbuilder-0.2.0/LICENSE
formbuilder-0.2.0/README.md
formbuilder-0.2.0/pyproject.toml
formbuilder-0.2.0/src
formbuilder-0.2.0/src/formbuilder
formbuilder-0.2.0/src/formbuilder/__init__.py
formbuilder-0.2.0/src/formbuilder/__main__.py
formbuilder-0.2.0/src/formbuilder/cli.py
formbuilder-0.2.0/src/formbuilder/plugins.py
formbuilder-0.2.0/src/formbuilder/renderers
formbuilder-0.2.0/src/formbuilder/renderers/__init__.py
formbuilder-0.2.0/src/formbuilder/renderers/html.py
formbuilder-0.2.0/src/formbuilder/templates
formbuilder-0.2.0/src/formbuilder/templates/page.html.j2
formbuilder-0.2.0/src/formbuilder/templating.py
```

Капстоуну в m7 потрібні шаблони Jinja2, і перша інтуїція з Node: покласти `templates/` у корінь проєкту поруч з `src/` і знаходити їх від `__file__`, як від `__dirname`. З editable install це працює, бо `__file__` вказує в робочу копію. З wheel ні: `templates/` у корені не частина пакета, а шлях від `__file__` тепер веде в `site-packages`.

```python
# src/formbuilder/templates_bad.py, шаблон лежить у capstone/templates/page.html.j2
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parents[2] / "templates"


def page_template() -> str:
    return (TEMPLATES / "page.html.j2").read_text()
```

```bash
uv run python -c "from formbuilder.templates_bad import page_template; print(page_template())"
rm -rf dist && uv build -q && unzip -l dist/*.whl | grep -i templ
uv run --isolated --no-project --with dist/formbuilder-0.1.0-py3-none-any.whl python -c "from formbuilder.templates_bad import page_template; print(page_template())"
```

```text
<!doctype html>
<title>{{ title }}</title>

      170  01-01-1980 00:00   formbuilder/templates_bad.py
Installed 6 packages in 4ms
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "/Users/mac/.cache/uv/archive-v0/zXoIa9XscFeKBmvB_lbB3/lib/python3.12/site-packages/formbuilder/templates_bad.py", line 7, in page_template
    return (TEMPLATES / "page.html.j2").read_text()
…
FileNotFoundError: [Errno 2] No such file or directory: '/Users/mac/.cache/uv/archive-v0/zXoIa9XscFeKBmvB_lbB3/lib/python3.12/templates/page.html.j2'
```

Правильно класти дані всередину пакета і читати через `importlib.resources`. `files("formbuilder")` повертає об'єкт-шлях (`Traversable`, офіційний тип з `importlib.resources.abc`) до вмісту пакета, де б той не лежав: у `src/` при editable install, у `site-packages` з wheel, навіть усередині zip-архіву. Код не рахує батьківські директорії і не знає, як пакет встановлено.

```python
"""Access to Jinja2 templates shipped inside the package."""

from importlib.resources import files


def page_template() -> str:
    return files("formbuilder").joinpath("templates/page.html.j2").read_text()
```

```bash
uv build --clear -q && unzip -l dist/*.whl | grep templ
uv venv -q --clear ../wheel-check && uv pip install -q --python ../wheel-check/bin/python dist/formbuilder-0.1.0-py3-none-any.whl
../wheel-check/bin/python -c "from formbuilder.templating import page_template; print(page_template(), end='')"
```

```text
        0  01-01-1980 00:00   formbuilder/templates/
       43  01-01-1980 00:00   formbuilder/templates/page.html.j2
      209  01-01-1980 00:00   formbuilder/templating.py
<!doctype html>
<title>{{ title }}</title>
```

> **Пастка.** Те, що файл лежить у папці пакета, ще не гарантує, що він у wheel: це залежить від backend. Той самий `src/` зі `setuptools.build_meta` дав wheel без шаблону: setuptools за замовчуванням бере в пакет лише модулі Python, а дані (package data, термін setuptools) треба перелічити явно. uv_build і hatchling беруть усю папку сам.

```bash
# той самий src/, [build-system] на setuptools>=77, без додаткових налаштувань
uv build && unzip -l dist/*.whl | grep -E 'templ|formbuilder/'
# після додавання в pyproject.toml:
# [tool.setuptools.package-data]
# formbuilder = ["templates/*.j2"]
rm -rf dist build src/*.egg-info && uv build && unzip -l dist/*.whl | grep templ
```

```text
…
Successfully built dist/formbuilder-0.1.0-py3-none-any.whl
      158  10-18-2026 11:15   formbuilder/__init__.py
      129  10-18-2026 11:15   formbuilder/__main__.py
      588  10-18-2026 11:15   formbuilder/cli.py
      209  10-18-2026 11:15   formbuilder/templating.py
…
Successfully built dist/formbuilder-0.1.0-py3-none-any.whl
      209  10-18-2026 11:15   formbuilder/templating.py
       43  10-18-2026 11:15   formbuilder/templates/page.html.j2
```

<!-- task: q3 -->

## `[project]` повністю: метадані, extras і dependency groups

`[project]` (PEP 621) стандартизований: його читає будь-який backend, і майже кожне поле переходить у рядок `METADATA` у wheel. `name` і `version` обов'язкові (або оголошені в `dynamic`, про це нижче). `description` стає `Summary`, `readme` вбудовується цілком як опис на сторінці PyPI, `requires-python` стає `Requires-Python` і відсікає ваш пакет для старших інтерпретаторів ще на етапі резолву. `license` у сучасній формі це SPDX-вираз рядком (PEP 639), `license-files` кладе файл у `dist-info/licenses/`. `classifiers` це стандартні теги з фіксованого списку PyPI для пошуку й фільтрів, `keywords`, `authors`, `[project.urls]` потрапляють на сторінку пакета. Нижче перша половина `pyproject.toml` капстоуну у навчальному варіанті з extra `web` (pydantic у `dependencies` з'явився в m2-l09) і `METADATA`, яку з неї зібрав uv_build. На цьому варіанті видно, як extras потрапляють у метадані; у самому капстоуні FastAPI і uvicorn підуть в основні залежності, чому саме, у callout нижче.

```toml
[project]
name = "formbuilder"
version = "0.2.0"
description = "FormBuilder backend in Python: the capstone of the course."
readme = "README.md"
license = "MIT"
license-files = ["LICENSE"]
authors = [{ name = "Your Name" }]
keywords = ["forms", "form-builder", "pydantic", "fastapi"]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Framework :: FastAPI",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.12",
]
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.11,<3",
]

[project.urls]
Repository = "https://github.com/example/formbuilder"

[project.scripts]
formbuilder = "formbuilder.cli:main"

[project.entry-points."formbuilder.renderers"]
html = "formbuilder.renderers.html:render"

[project.optional-dependencies]
web = [
    "fastapi>=0.115,<1",
    "uvicorn[standard]>=0.30,<1",
]
```

```bash
unzip -p dist/formbuilder-0.2.0-py3-none-any.whl formbuilder-0.2.0.dist-info/METADATA | sed -n '1,21p'
```

```text
Metadata-Version: 2.4
Name: formbuilder
Version: 0.2.0
Summary: FormBuilder backend in Python: the capstone of the course.
Keywords: forms,form-builder,pydantic,fastapi
Author: Your Name
License-Expression: MIT
License-File: LICENSE
Classifier: Development Status :: 3 - Alpha
Classifier: Framework :: FastAPI
Classifier: Programming Language :: Python :: 3
Classifier: Programming Language :: Python :: 3.12
Requires-Dist: pydantic>=2.11,<3
Requires-Dist: fastapi>=0.115,<1 ; extra == 'web'
Requires-Dist: uvicorn[standard]>=0.30,<1 ; extra == 'web'
Requires-Python: >=3.12
Project-URL: Repository, https://github.com/example/formbuilder
Provides-Extra: web
Description-Content-Type: text/markdown

# formbuilder
```

Головне, чого в `METADATA` немає: `[dependency-groups]`. Це і є межа між двома способами оголосити необов'язкові залежності. Extras (`[project.optional-dependencies]`, офіційні назви optional dependencies і extras) публікуються разом з пакетом: користувач пише `pip install "formbuilder[web]"` і отримує FastAPI. Dependency groups (PEP 735) існують лише в репозиторії: `dev`, `docs`, `lint` потрібні тим, хто розробляє пакет, і ніколи не потрапляють до тих, хто його ставить. Правило вибору: якщо без групи частина функціональності пакета не працює в користувача, це extra; якщо група потрібна лише для тестів, лінту, документації, це dependency group.

> **Для капстоуну.** Те саме правило каже, що FastAPI і uvicorn у капстоуні не extra, а основні `dependencies`: капстоун і є вебзастосунок, без них не працює його головна частина, а Docker-образ з m7-l07 однаково ставить їх завжди. Extra `web` у прикладах цього уроку показує механізм; у p1 обидва пакети додаються звичайним `uv add`. Extra доречний у бібліотеці, де веб це необов'язкова надбудова над основним API.

```bash
uv add --optional web "fastapi>=0.115,<1"
uv tree --depth 1
uv sync
uv run python -c "import fastapi"
uv sync --extra web
```

```text
Resolved 24 packages in 357ms
   Building formbuilder @ file://…/capstone
      Built formbuilder @ file://…/capstone
Prepared 5 packages in 179ms
Uninstalled 1 package in 1ms
Installed 7 packages in 10ms
 + annotated-doc==0.0.5
 + anyio==4.15.1
 + fastapi==0.143.5
 ~ formbuilder==0.1.0 (from file://…/capstone)
 + idna==3.20
 + opentelemetry-api==1.45.1
 + starlette==1.8.0
Resolved 24 packages in 4ms
formbuilder v0.1.0
├── pydantic v2.14.1
├── fastapi v0.143.5 (extra: web)
├── mypy v2.4.0 (group: dev)
├── pytest v9.1.1 (group: dev)
└── ruff v0.17.1 (group: dev)
Resolved 24 packages in 12ms
Uninstalled 6 packages in 46ms
 - annotated-doc==0.0.5
 - anyio==4.15.1
 - fastapi==0.143.5
 - idna==3.20
 - opentelemetry-api==1.45.1
 - starlette==1.8.0
Traceback (most recent call last):
  File "<string>", line 1, in <module>
ModuleNotFoundError: No module named 'fastapi'
Resolved 24 packages in 6ms
Installed 6 packages in 6ms
 + annotated-doc==0.0.5
 + anyio==4.15.1
 + fastapi==0.143.5
 + idna==3.20
 + opentelemetry-api==1.45.1
 + starlette==1.8.0
```

`uv add --optional` одразу ставить extra у venv, але наступний `uv sync` його знімає: за замовчуванням синхронізуються робочі залежності й група `dev`, а extras лише за запитом, `--extra web` або `--all-extras`. Групи керуються навпаки: `dev` іде за замовчуванням, решта через `--group docs`, а `--no-dev` прибирає dev для прод-установки (m0-l02). Модель того, як backend перетворює `[project]` на рядки `Requires-Dist`, вміщується в кілька рядків, і групи в ній не беруть участі зовсім.

```python live
import tomllib

pyproject = tomllib.loads('''
[project]
name = "formbuilder"
dependencies = ["pydantic>=2.11,<3"]

[project.optional-dependencies]
web = ["fastapi>=0.115,<1", "uvicorn[standard]>=0.30,<1"]

[dependency-groups]
dev = ["pytest>=9.1.1", "ruff>=0.17.1"]
''')


def requires_dist(project: dict) -> list[str]:
    lines = list(project.get("dependencies", []))
    for extra, deps in project.get("optional-dependencies", {}).items():
        lines += [f"{dep} ; extra == '{extra}'" for dep in deps]
    return lines


print(*requires_dist(pyproject["project"]), sep="\n")
print(sorted(pyproject))
```

```text
pydantic>=2.11,<3
fastapi>=0.115,<1 ; extra == 'web'
uvicorn[standard]>=0.30,<1 ; extra == 'web'
['dependency-groups', 'project']
```

> **JS-аналог.** `devDependencies` у npm одночасно і "для розробки", і "не ставиться в користувача". У Python це `[dependency-groups] dev`, але груп може бути скільки завгодно. Extras у npm прямого аналога не мають; найближче `peerDependenciesMeta` з `optional: true`, тільки там користувач ставить пакет сам, а тут вмикає набір одним словом у квадратних дужках.

Ім'я пакета теж має правила, яких немає в npm. PyPI порівнює імена після нормалізації (normalized name, офіційний термін зі специфікації Names and normalization): регістр не важливий, а будь-яка послідовність `-`, `_`, `.` еквівалентна одному дефісу. `Pydantic_Core`, `pydantic-core` і `pydantic.core` для інсталятора один пакет. У назві файлу дистрибутива навпаки стоїть підкреслення: workspace-пакет `fb-markdown` нижче збирається у `fb_markdown-0.1.0-py3-none-any.whl`.

<!-- task: q1 -->

<!-- task: t1 -->

## Рядок залежності за PEP 508 і версії за PEP 440

Специфікатори `>=2,<3`, `~=2.1`, `==2.1.*` і пастка з `~=` на `0.x` розібрані в m0-l02. Тут повний формат рядка залежності (dependency specifier, PEP 508): ім'я, extras у квадратних дужках, специфікатор версії, і після `;` маркер середовища (environment marker, офіційний термін). Маркер це булевий вираз над змінними інтерпретатора й платформи: `python_version`, `sys_platform`, `platform_machine`, `implementation_name` і кількома іншими. Інсталятор обчислює його на цільовій машині і, якщо вираз хибний, пропускає залежність. Розібрати й обчислити рядок можна бібліотекою `packaging`, на якій стоять і pip, і uv.

```python
from packaging.requirements import Requirement

req = Requirement("uvicorn[standard]>=0.30,<1; python_version < '3.14' and sys_platform != 'win32'")
print(req.name, req.extras, req.specifier, sep=" | ")
print(req.marker)
print(req.marker.evaluate())
print(req.marker.evaluate({"sys_platform": "win32"}))
print(req.marker.evaluate({"python_version": "3.14"}))
```

```text
uvicorn | {'standard'} | <1,>=0.30
python_version < "3.14" and sys_platform != "win32"
True
False
False
```

Маркери в реальних пакетах трапляються частіше, ніж здається. `uvicorn[standard]`, який капстоун у p1 додає в основні залежності, тягне `uvloop` лише там, де той існує: на Windows і PyPy його немає. Lock записує цю умову дослівно, тому один `uv.lock` правильний і на Mac, і в Linux-контейнері, і на Windows-машині колеги.

```bash
uv add "uvicorn[standard]>=0.30,<1"
awk '/^name = "uvicorn"$/,/^\[\[package\]\]$/' uv.lock | sed -n '/optional-dependencies/,/^\]/p'
```

```text
Resolved 33 packages in 366ms
…
 + click==8.5.0
 + h11==0.16.0
 + httptools==0.9.0
 + python-dotenv==1.2.4
 + pyyaml==6.0.3
 + uvicorn==0.54.0
 + uvloop==0.23.0
 + watchfiles==1.3.0
 + websockets==17.2
[package.optional-dependencies]
standard = [
    { name = "httptools" },
    { name = "python-dotenv" },
    { name = "pyyaml" },
    { name = "uvloop", marker = "platform_python_implementation != 'PyPy' and sys_platform != 'cygwin' and sys_platform != 'win32'" },
    { name = "watchfiles" },
    { name = "websockets" },
]
```

<!-- task: t2 -->

Версії в Python не semver, а PEP 440, і схожість тут поверхнева. Semver має `MAJOR.MINOR.PATCH` і довільний pre-release після дефіса. PEP 440 має реліз з будь-якої кількості чисел і фіксовані суфікси з фіксованим порядком: dev-реліз (developmental release) раніше за всі пре-релізи, далі alpha `a`, beta `b`, release candidate `rc`, потім фінальний реліз, потім post-реліз (post-release) для виправлень, які не змінюють коду, наприклад зламаного README. Є ще локальна версія після `+` для власних збірок, яку PyPI не приймає, і epoch `1!` для проєктів, що змінили схему нумерації. Усі ці назви офіційні, з PEP 440.

```python
from packaging.version import Version

raw = ["1.0.post1", "1.0", "1.0rc1", "1.0.dev0", "1.0a1", "1.0b2", "1.0.0", "1!0.5", "1.0+local.7"]
for v in sorted(raw, key=Version):
    print(f"{v:<12} {Version(v)}  pre={Version(v).is_prerelease}")
print(Version("1.0.0rc1") == Version("1.0rc1"))
print(Version("1.0.0-rc.1"), Version("1.0.0-RC1"), Version("v2.1"))
```

```text
1.0.dev0     1.0.dev0  pre=True
1.0a1        1.0a1  pre=True
1.0b2        1.0b2  pre=True
1.0rc1       1.0rc1  pre=True
1.0          1.0  pre=False
1.0.0        1.0.0  pre=False
1.0+local.7  1.0+local.7  pre=False
1.0.post1    1.0.post1  pre=False
1!0.5        1!0.5  pre=False
True
1.0.0rc1 1.0.0rc1 2.1
```

Три речі з цього виводу. `1.0` і `1.0.0` рівні: нулі в кінці релізу не значать нічого. `1!0.5` більша за все інше, бо epoch порівнюється першим. І PEP 440 нормалізує зовнішні написання: `1.0.0-rc.1`, `1.0.0-RC1` і `1.0.0rc1` одна версія, а `v` на початку відкидається. Semver-рядки на кшталт `1.0.0-beta.2` теж розпізнаються, але довільні мітки `2.0.0-next.1` ні, і така версія для інструментів Python просто невалідна.

```python
from packaging.version import InvalidVersion, Version

for v in ["1.0.0-beta.2", "1.0.0-alpha+exp.sha.5114f85", "2.0.0-next.1", "latest"]:
    try:
        print(f"{v!r:<32} -> {Version(v)}")
    except InvalidVersion as e:
        print(f"{v!r:<32} -> InvalidVersion: {e}")
```

```text
'1.0.0-beta.2'                   -> 1.0.0b2
'1.0.0-alpha+exp.sha.5114f85'    -> 1.0.0a0+exp.sha.5114f85
'2.0.0-next.1'                   -> InvalidVersion: Invalid version: '2.0.0-next.1'
'latest'                         -> InvalidVersion: Invalid version: 'latest'
```

> **Пастка.** Пре-релізи не обираються, навіть якщо вони найновіші і формально задовольняють специфікатор. `>=1.0` при наявних `1.0`, `1.0.post1` і `1.1rc1` дає `1.0.post1`, а `>=1.1` при наявному лише `1.1rc1` дає помилку, а не rc. Пре-реліз обирається, коли специфікатор сам його називає (`>=1.1rc1`) або з прапорцем `--prerelease allow`. У npm `^1.0.0` теж не бере `1.1.0-rc.1`, але там правило прив'язане до однакового `MAJOR.MINOR.PATCH`, а тут діє для будь-якого специфікатора.

```bash
ls index/
uv pip install --no-index --find-links index/ "fb-demo-lib>=1.0"
uv pip install --no-index --find-links index/ "fb-demo-lib>=1.1"
uv pip install --no-index --find-links index/ "fb-demo-lib>=1.1rc1"
```

```text
fb_demo_lib-0.9-py3-none-any.whl
fb_demo_lib-1.0-py3-none-any.whl
fb_demo_lib-1.0.post1-py3-none-any.whl
fb_demo_lib-1.1rc1-py3-none-any.whl
Resolved 1 package in 0.84ms
Prepared 1 package in 2ms
Installed 1 package in 1ms
 + fb-demo-lib==1.0.post1
  × No solution found when resolving dependencies:
  ╰─▶ Because only fb-demo-lib<=1.1rc1 is available and you require
      fb-demo-lib>=1.1, we can conclude that your requirements are
      unsatisfiable.
Resolved 1 package in 1ms
Prepared 1 package in 2ms
Uninstalled 1 package in 0.61ms
Installed 1 package in 1ms
 - fb-demo-lib==1.0.post1
 + fb-demo-lib==1.1rc1
```

`index/` тут це папка з чотирма wheel одного тестового пакета, зібраними `uv build` з різними `version`; `--no-index --find-links` змушує uv шукати лише в ній.

<!-- task: q2 -->

<!-- task: t3 -->

## `uv.lock` зсередини і точкові оновлення

База з m0-l02: lock комітять, `uv sync --locked` у CI падає, якщо lock розійшовся з `pyproject.toml`, `--frozen` не перевіряє узгодженість. Тут про те, що саме лежить у файлі. Крім сторонніх пакетів, lock описує і сам проєкт: звідки він береться (`editable = "."`), що в extras, що в групах, і з якими специфікаторами все це оголошено. За цим блоком `uv lock --check` і `uv sync --locked` визначають, чи lock застарів: вони порівнюють `[package.metadata]` з поточним `pyproject.toml`.

```bash
awk '/^name = "formbuilder"/,/^\[\[package\]\]$/' uv.lock
```

```text
name = "formbuilder"
version = "0.1.0"
source = { editable = "." }
dependencies = [
    { name = "pydantic" },
]

[package.optional-dependencies]
web = [
    { name = "fastapi" },
]

[package.dev-dependencies]
dev = [
    { name = "mypy" },
    { name = "pytest" },
    { name = "ruff" },
]

[package.metadata]
requires-dist = [
    { name = "fastapi", marker = "extra == 'web'", specifier = ">=0.115,<1" },
    { name = "pydantic", specifier = ">=2.11,<3" },
]
provides-extras = ["web"]

[package.metadata.requires-dev]
dev = [
    { name = "mypy", specifier = ">=2.4.0" },
    { name = "pytest", specifier = ">=9.1.1" },
    { name = "ruff", specifier = ">=0.17.1" },
]

[[package]]
```

Lock універсальний (universal lockfile, термін uv): він резолвиться не для вашої машини, а для всіх платформ і версій Python, які дозволяє `requires-python`. Залежності з маркерами записуються з маркером (pytest тягне `colorama` лише на Windows), а коли для різних версій Python потрібні різні версії пакета, у шапці з'являються `resolution-markers`, і lock містить кілька гілок дерева. `package-lock.json` з npm так не вміє: він фіксує дерево, яке вийшло на машині автора, і платформні пакети в ньому окремими записами.

```bash
head -8 uv.lock
awk '/^name = "pytest"$/,/^\[\[package\]\]$/' uv.lock | sed -n 1,10p
```

```text
version = 1
revision = 3
requires-python = ">=3.12"
resolution-markers = [
    "python_full_version >= '3.15'",
    "python_full_version < '3.15'",
]

name = "pytest"
version = "9.1.1"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "colorama", marker = "sys_platform == 'win32'" },
    { name = "iniconfig" },
    { name = "packaging" },
    { name = "pluggy" },
    { name = "pygments" },
]
```

Оновлення в uv явні: `uv sync` і `uv add` нічого не оновлюють, якщо lock задовольняє `pyproject.toml`. `uv lock --upgrade-package pydantic` (коротко `-P`) піднімає один пакет і лише ті транзитивні, що мусять рухатися разом з ним; `uv lock --upgrade` піднімає все. З `==` після імені можна прицільно поставити конкретну версію, наприклад щоб відкотитися. `uv tree --outdated` показує, що відстає від PyPI. Аналог у npm: `npm update pydantic` і `npm outdated`, з різницею, що `npm install` оновлює lock мовчки, а uv ніколи.

```bash
uv lock --upgrade-package pydantic==2.12.0
uv tree --outdated --depth 1
uv lock --upgrade-package pydantic
```

```text
Resolved 24 packages in 240ms
Updated pydantic v2.14.1 -> v2.12.0
Updated pydantic-core v2.50.1 -> v2.41.1
Resolved 24 packages in 5ms
formbuilder v0.1.0
├── pydantic v2.12.0 (latest: v2.14.1)
├── fastapi v0.143.5 (extra: web)
├── mypy v2.4.0 (group: dev)
├── pytest v9.1.1 (group: dev)
└── ruff v0.17.1 (group: dev)
Resolved 24 packages in 105ms
Updated pydantic v2.12.0 -> v2.14.1
Updated pydantic-core v2.41.1 -> v2.50.1
```

`pydantic-core` пішов слідом сам: pydantic пінить його через `==`, тому окремо його оновлювати не треба. Для CI, крім `uv sync --locked`, є `uv lock --check`, яка лише перевіряє lock і нічого не ставить: зручний перший крок пайплайна або pre-commit хук (m3-l06).

```bash
# у dependencies руками дописано "rich>=13", uv lock не запускали
uv lock --check; echo "exit $?"
```

```text
Resolved 29 packages in 162ms
The lockfile at `uv.lock` needs to be updated, but `--check` was provided. To update the lockfile, run `uv lock`.
exit 1
```

> **Під капотом.** Lock не їде разом з wheel. У `METADATA` лишаються діапазони з `dependencies`, і той, хто ставить ваш wheel, резолвить їх сам на свої актуальні версії. Тому для застосунку (капстоун, сервіс у Docker) lock це гарантія відтворюваності прод-установки, а для бібліотеки лише відтворюваність CI і розробки. Звідси й правило: у бібліотеці діапазони в `dependencies` широкі, бо вузький пін ламає резолв у користувача, у застосунку можна вужче, бо точні версії все одно в lock.

## Версія і entry points: метадані як API

Версію змінює `uv version`: з аргументом ставить конкретну, з `--bump` рахує наступну за правилами PEP 440, оновлює `pyproject.toml`, lock і перевстановлює проєкт. `--dry-run` лише показує результат. `--bump` можна поєднувати, наприклад наступна мінорна одразу як release candidate.

```bash
uv version
uv version --bump minor --dry-run
uv version --bump minor --bump rc --dry-run
uv version --bump patch --bump dev --dry-run
uv version --bump post --dry-run
```

```text
formbuilder 0.1.0
formbuilder 0.1.0 => 0.2.0
formbuilder 0.1.0 => 0.2.0rc1
formbuilder 0.1.0 => 0.1.1.dev1
formbuilder 0.1.0 => 0.1.0.post1
```

Альтернатива: не зберігати версію в `pyproject.toml` взагалі, а оголосити `dynamic = ["version"]` і брати її з git-тегу через плагін backend (`hatch-vcs` для hatchling, `setuptools-scm` для setuptools); тоді `git tag v0.2.0` і є реліз, а uv_build такого не вміє. Хоч звідки береться версія, у коді її читають з метаданих встановленого пакета, як `__version__` у m0-l06. Той самий `importlib.metadata` віддає і решту `METADATA`, тобто пакет може дізнатися про свої extras чи залежності без доступу до `pyproject.toml`, якого у wheel немає.

```toml
[project]
name = "formbuilder"
dynamic = ["version"]

[build-system]
requires = ["hatchling", "hatch-vcs"]
build-backend = "hatchling.build"

[tool.hatch.version]
source = "vcs"
```

```bash
uv run -q python -c "
from importlib.metadata import metadata, version
print(version('formbuilder'), metadata('formbuilder').get_all('Provides-Extra'))
"
```

```text
0.1.0 ['web']
```

`[project.scripts]` з m0-l06 це окремий випадок ширшого механізму. Entry point (офіційний термін, специфікація Entry points) це іменоване посилання `module:attr` у групі, і групу може оголосити будь-який пакет. `console_scripts` читає інсталятор, щоб створити команди в `bin/`; групу `formbuilder.renderers` читатиме сам капстоун, щоб знайти рендерери. Будь-який інший пакет, встановлений у те саме оточення, може зареєструвати свій рендерер у цій групі, і капстоун знайде його без жодного імпорту з свого боку. Так влаштовані плагіни pytest (група `pytest11`), так flake8 знаходить правила, так Jinja2-розширення реєструються в інструментах.

```toml
[project.entry-points."formbuilder.renderers"]
html = "formbuilder.renderers.html:render"
```

```python
"""Renderer discovery through the `formbuilder.renderers` entry point group."""

from collections.abc import Callable
from importlib.metadata import entry_points

Renderer = Callable[[dict[str, str]], str]


def load_renderers() -> dict[str, Renderer]:
    return {ep.name: ep.load() for ep in entry_points(group="formbuilder.renderers")}
```

```bash
unzip -p dist/formbuilder-0.2.0-py3-none-any.whl formbuilder-0.2.0.dist-info/entry_points.txt
uv run python -c "
from formbuilder.plugins import load_renderers
renderers = load_renderers()
print(sorted(renderers))
print(renderers['html']({'title': 'Signup'}))
"
```

```text
[console_scripts]
formbuilder = formbuilder.cli:main

[formbuilder.renderers]
html = formbuilder.renderers.html:render

['html']
<h1>Signup</h1>
```

`entry_points()` не імпортує жодного модуля: вона читає `entry_points.txt` з усіх `dist-info` на `sys.path`, і лише `ep.load()` робить `importlib.import_module` і `getattr` (динамічний імпорт з m3-l01). Модель нижче створює два "встановлені" дистрибутиви в тимчасовій папці, і видно, що кожен entry point знає, з якого дистрибутива прийшов.

```python live
import sys
import tempfile
from importlib.metadata import entry_points
from pathlib import Path

site = Path(tempfile.mkdtemp())


def fake_dist(name: str, version: str, module: str, code: str, eps: str) -> None:
    info = site / f"{name.replace('-', '_')}-{version}.dist-info"
    info.mkdir()
    (info / "METADATA").write_text(f"Metadata-Version: 2.4\nName: {name}\nVersion: {version}\n")
    (info / "entry_points.txt").write_text(eps)
    (site / f"{module}.py").write_text(code)


fake_dist("formbuilder", "0.2.0", "fb_html", "def render(c): return f'<h1>{c}</h1>'\n",
          "[formbuilder.renderers]\nhtml = fb_html:render\n")
fake_dist("fb-markdown", "0.1.0", "fb_markdown", "def render(c): return f'# {c}'\n",
          "[formbuilder.renderers]\nmarkdown = fb_markdown:render\n")
sys.path.insert(0, str(site))

for ep in sorted(entry_points(group="formbuilder.renderers"), key=lambda ep: ep.name):
    render = ep.load()
    print(f"{ep.name:<9} from {ep.dist.name:<12} -> {render('Signup')}")
```

```text
html      from formbuilder  -> <h1>Signup</h1>
markdown  from fb-markdown  -> # Signup
```

> **Пастка.** Entry points записані в `dist-info` в момент встановлення, як і console scripts. Новий запис у `[project.entry-points]` не видно, поки проєкт не перевстановлено: `uv run` зробить це сам, бо помітить зміну `pyproject.toml`, а прямий виклик `.venv/bin/python` ні (той самий механізм, що з версією в m0-l06).

<!-- task: t4 -->

## Кілька пакетів: workspace і editable-залежності

Коли поруч з капстоуном з'являється другий пакет, наприклад плагін `fb-markdown` з рендерером Markdown, є два шляхи. Демонстрація нижче йде в окремій копії капстоуну `capstone-ws`: у сам капстоун курсу workspace не додається. Workspace (термін uv, запозичений з Cargo) це кілька пакетів в одному репозиторії з одним `uv.lock` і одним `.venv`. `uv init` усередині проєкту сам реєструє новий пакет учасником, а залежність між учасниками позначається в `[tool.uv.sources]` як `workspace = true`.

```bash
uv init --package --lib plugins/fb-markdown
uv add --package fb-markdown formbuilder
grep -A3 'tool.uv.workspace' pyproject.toml
cat plugins/fb-markdown/pyproject.toml
```

```text
Adding `fb-markdown` as member of workspace `…/capstone-ws`
Initialized project `fb-markdown` at `…/capstone-ws/plugins/fb-markdown`
…
 + fb-markdown==0.1.0 (from file://…/capstone-ws/plugins/fb-markdown)
 ~ formbuilder==0.1.0 (from file://…/capstone-ws)
[tool.uv.workspace]
members = [
    "plugins/fb-markdown",
]
[project]
name = "fb-markdown"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "formbuilder",
]

[build-system]
requires = ["uv_build>=0.9.28,<0.10.0"]
build-backend = "uv_build"

[tool.uv.sources]
formbuilder = { workspace = true }

[project.entry-points."formbuilder.renderers"]
markdown = "fb_markdown:render"
```

Останні два рядки дописані руками, як і функція `render` у `src/fb_markdown/__init__.py`. Учасники встановлюються editable, тож зміни в будь-якому з них видно одразу. Нюанс: `uv sync` у корені синхронізує лише кореневий пакет і прибирає учасників, а `uv sync --all-packages` ставить усіх, і тоді плагін видно через entry points.

```bash
uv sync
uv run python -c "from formbuilder.plugins import load_renderers; print(sorted(load_renderers()))"
uv sync --all-packages
uv run python -c "from formbuilder.plugins import load_renderers; print(sorted(load_renderers()))"
uv build --package fb-markdown && ls dist
```

```text
Resolved 25 packages in 9ms
Uninstalled 1 package in 0.56ms
 - fb-markdown==0.1.0 (from file://…/capstone-ws/plugins/fb-markdown)
['html']
Prepared 1 package in 3ms
Installed 1 package in 1ms
 + fb-markdown==0.1.0 (from file://…/capstone-ws/plugins/fb-markdown)
['html', 'markdown']
…
Successfully built dist/fb_markdown-0.1.0-py3-none-any.whl
fb_markdown-0.1.0-py3-none-any.whl
fb_markdown-0.1.0.tar.gz
formbuilder-0.1.0-py3-none-any.whl
formbuilder-0.1.0.tar.gz
```

Другий шлях для пакета, що лежить поза репозиторієм і має власний lock: шляхова залежність. `uv add --editable ../fb-shared` додає ім'я в `dependencies`, а шлях кладе в `[tool.uv.sources]`. Це аналог `npm link` чи `"file:../fb-shared"`, тільки записаний так, що переживає `uv sync`.

```bash
uv add --editable ../fb-shared
grep -A3 '^dependencies' pyproject.toml
grep -A1 'tool.uv.sources' pyproject.toml
```

```text
…
 + fb-shared==0.1.0 (from file://…/fb-shared)
 ~ formbuilder==0.1.0 (from file://…/capstone-ws)
dependencies = [
    "fb-shared",
    "pydantic>=2.11,<3",
]
[tool.uv.sources]
fb-shared = { path = "../fb-shared", editable = true }
```

> **Пастка.** `[tool.uv.sources]` знає лише uv і лише під час розробки. У wheel іде `Requires-Dist: fb-shared` без жодного шляху, тож на сервері інсталятор шукатиме `fb-shared` в індексі. Якщо пакета там немає, установка падає; якщо хтось зареєстрував таке ім'я на PyPI, встановиться чужий код. Тому пакет, що залежить від локальних, публікують лише разом з ними, а перед релізом ставлять wheel у чисте venv без доступу до робочої копії, як нижче. `uv build --no-sources` цього не ловить: він перевіряє лише, що сама збірка не залежить від `[tool.uv.sources]`, і цей wheel зібрав без помилок.

```bash
unzip -p dist/formbuilder-0.1.0-py3-none-any.whl formbuilder-0.1.0.dist-info/METADATA | grep Requires-Dist
uv venv -q ../ws-check
uv pip install --python ../ws-check/bin/python --no-index dist/formbuilder-0.1.0-py3-none-any.whl
```

```text
Requires-Dist: fb-shared
Requires-Dist: pydantic>=2.11,<3
Requires-Dist: fastapi>=0.115,<1 ; extra == 'web'
Using Python 3.12.12 environment at: …/ws-check
  × No solution found when resolving dependencies:
  ╰─▶ Because fb-shared was not found in the provided package locations
      and formbuilder==0.1.0 depends on fb-shared, we can conclude that
      formbuilder==0.1.0 cannot be used.
      And because only formbuilder==0.1.0 is available and you require
      formbuilder, we can conclude that your requirements are unsatisfiable.

      hint: Packages were unavailable because index lookups were disabled
      and no additional package locations were provided (try: `--find-links
      <uri>`)
```

> **JS-аналог.** Workspace uv відповідає npm/pnpm workspaces: один lock у корені, учасники перелічені в корені, залежність між ними `workspace = true` замість `"workspace:*"`. Різниця в тому, що venv один на весь workspace, тож двох різних версій одного пакета для двох учасників бути не може: резолв спільний.

<!-- task: q4 -->

## Інструменти поза проєктом і публікація

Для утиліт, яких немає в `pyproject.toml`, у uv два режими. `uvx ruff` (m0-l02) запускає утиліту разово з кешу. `uv tool install ruff` ставить її постійно: кожен інструмент отримує власний venv у `uv tool dir`, а в `uv tool dir --bin` (за замовчуванням `~/.local/share/uv/tools` і `~/.local/bin`) лягає посилання на його скрипт. Тобто це `npm i -g`, але кожен глобальний пакет ізольований, і їхні залежності не конфліктують. Нижче директорії перенаправлено змінними в тимчасову папку, щоб не чіпати систему; без них шляхи будуть стандартні.

```bash
export UV_TOOL_DIR="$PWD/tools" UV_TOOL_BIN_DIR="$PWD/tools-bin"
uv tool install ruff==0.17.1
uv tool list
readlink "$(uv tool dir --bin)/ruff"
cat "$(uv tool dir)/ruff/uv-receipt.toml"
```

```text
Resolved 1 package in 28ms
Installed 1 package in 4ms
 + ruff==0.17.1
Installed 1 executable: ruff
warning: `…/tools-bin` is not on your PATH. To use installed tools, run `export PATH="…/tools-bin:$PATH"` or `uv tool update-shell`.
ruff v0.17.1
- ruff
…/tools/ruff/bin/ruff
[tool]
requirements = [{ name = "ruff", specifier = "==0.17.1" }]
entrypoints = [
    { name = "ruff", install-path = "…/tools-bin/ruff", from = "ruff" },
]
```

Глобальний `pip install` лишається забороненим з тієї ж причини, що в m0-l02: Python від uv позначений як externally managed (PEP 668), і пакет, поставлений у його `site-packages`, ділить залежності з усіма скриптами на цьому інтерпретаторі. `uv tool install` для команд, які ви запускаєте щодня (`ruff`, `pre-commit`), `uvx` для разових, `uv add --dev` для всього, від чого залежить проєкт і що має однакову версію в усіх розробників. Останнє важливе: ruff з `uv tool` і ruff з lock можуть мати різні версії, і в CI працює той, що в lock.

Публікація це `uv publish` над готовими файлами з `dist/`. Реєстри два: PyPI і TestPyPI (`test.pypi.org`), окремий сервер з окремими акаунтами для репетиції. Автентифікація токеном API, який передають змінною оточення `UV_PUBLISH_TOKEN`, а не аргументом, щоб він не потрапив в історію shell. У GitHub Actions токен не потрібен зовсім: trusted publishing (офіційний механізм PyPI) видає короткоживучий токен через OIDC, і uv пробує його першим, що видно у виводі нижче. TestPyPI зручно описати як іменований індекс, а `--dry-run` перевіряє файли й адресу без завантаження.

```toml
[[tool.uv.index]]
name = "testpypi"
url = "https://test.pypi.org/simple/"
publish-url = "https://test.pypi.org/legacy/"
explicit = true
```

```bash
uv publish --index testpypi --dry-run dist/formbuilder-*
# реальна публікація: UV_PUBLISH_TOKEN=pypi-... uv publish --index testpypi
```

```text
Checking 2 files against https://test.pypi.org/legacy/
Note: Neither credentials nor keyring are configured, and there was an error fetching the trusted publishing token. If you don't want to use trusted publishing, you can ignore this error, but you need to provide credentials.
error: Trusted publishing failed
  Caused by: No OIDC token discovered: are you in a supported trusted publishing environment?
Checking formbuilder-0.1.0-py3-none-any.whl (5.1KiB)
Checking formbuilder-0.1.0.tar.gz (2.6KiB)
```

`explicit = true` означає, що з цього індексу не резолвляться залежності, якщо пакет явно до нього не прив'язаний: інакше випадковий пакет з TestPyPI, де реєструється будь-хто, міг би підмінити справжній. Що потрібно в `[project]` для пристойної сторінки на PyPI: унікальне `name` (перевіряйте до першого релізу, після нормалізації), `version`, `description`, `readme` (інакше сторінка порожня), `license` і `license-files`, `requires-python`, `classifiers` і `[project.urls]`. Одна версія публікується один раз: файл з тим самим ім'ям PyPI не прийме навіть після видалення релізу, тому виправлення README це `0.2.0.post1`, а не перезаливання.

<!-- task: t5 -->

## Для капстоуну

Після цього уроку `capstone/pyproject.toml` стає повним: метадані для публікації, FastAPI і uvicorn для модуля 7 в основних `dependencies`, entry point групи `formbuilder.renderers` під рендерер з m3-l01, шаблони всередині пакета і версія `0.2.0`. Публікувати капстоун не потрібно; потрібно, щоб він збирався і працював з wheel у чистому оточенні, бо саме так його поставить Dockerfile у m7-l07.

```bash
uv version --bump minor
uv run ruff check && uv run mypy src && uv run pytest -q
uv build --clear
uv venv -q --clear ../wheel-check
uv pip install --python ../wheel-check/bin/python "dist/formbuilder-0.2.0-py3-none-any.whl"
../wheel-check/bin/formbuilder --version
../wheel-check/bin/python -c "
import fastapi
from formbuilder.plugins import load_renderers
from formbuilder.templating import page_template
print(sorted(load_renderers()), fastapi.__version__)
print(page_template(), end='')
"
```

```text
Resolved 33 packages in 13ms
   Building formbuilder @ file://…/capstone
      Built formbuilder @ file://…/capstone
Prepared 1 package in 4ms
Uninstalled 1 package in 0.79ms
Installed 1 package in 2ms
 - formbuilder==0.1.0 (from file://…/capstone)
 + formbuilder==0.2.0 (from file://…/capstone)
formbuilder 0.1.0 => 0.2.0
All checks passed!
Success: no issues found in 7 source files
.                                                                        [100%]
1 passed in 0.01s
Building source distribution (uv build backend)...
Building wheel from source distribution (uv build backend)...
Successfully built dist/formbuilder-0.2.0.tar.gz
Successfully built dist/formbuilder-0.2.0-py3-none-any.whl
Using Python 3.12.12 environment at: …/wheel-check
Resolved 21 packages in 8ms
Prepared 1 package in 3ms
Installed 21 packages in 18ms
 + annotated-doc==0.0.5
 + annotated-types==0.8.0
 + anyio==4.15.1
 + click==8.5.0
 + fastapi==0.143.5
 + formbuilder==0.2.0 (from file://…/capstone/dist/formbuilder-0.2.0-py3-none-any.whl)
 …
 + uvicorn==0.54.0
 + uvloop==0.23.0
 + watchfiles==1.3.0
 + websockets==17.2
formbuilder 0.2.0
['html'] 0.143.5
<!doctype html>
<title>{{ title }}</title>
```

Список пакетів скорочено. Зверніть увагу, що `uv pip install` резолвив залежності заново, без `uv.lock`: wheel несе лише діапазони. У Docker-образі з m7-l07 так робити не будуть: там спочатку `uv sync --locked --no-dev` ставить точні версії з lock, а сам проєкт ставиться в те саме оточення (детально в m7-l07).

> **Для капстоуну.** Шаблони Jinja2 у m7-l06 читаються з пакета, а не з диска: `jinja2.PackageLoader("formbuilder", "templates")` робить усередині те саме, що `importlib.resources.files` тут. Якщо колись захочеться покласти `templates/` у корінь репозиторію "щоб дизайнер знайшов", перевірка з чистим venv нижче впаде першою.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`^` і `~` з npm у специфікаторі.** `"pydantic^2.11"` не парситься, а `~2.1` теж не оператор PEP 440. Правильно: `>=2.11,<3` або `~=2.11`, детально в m0-l02.

   ```toml
   dependencies = ["pydantic^2.11"]      # error: Failed to parse
   dependencies = ["pydantic>=2.11,<3"]  # правильно
   ```

2. **`devDependencies` як єдина група для всього необов'язкового.** FastAPI для веб-частини кладуть у dev-групу, і користувач пакета його не отримує, бо групи не публікуються. Правильно: те, без чого частина пакета не працює, це extra; dev-група лише для інструментів розробки.

   ```bash
   uv add --dev fastapi                  # не потрапить у METADATA
   uv add --optional web fastapi         # Requires-Dist: fastapi ; extra == 'web'
   ```

3. **`npm publish` без збірки.** Очікують, що `uv publish` сам зібере пакет. Він вантажить лише те, що лежить у `dist/`, і без нього падає. Правильно: `uv build`, перевірка wheel у чистому venv, потім `uv publish`.

   ```bash
   uv publish --dry-run           # error: No files found to publish
   rm -rf dist && uv build && uv publish --index testpypi
   ```

4. **Пошук полів `main` і `exports`.** У `[project]` їх немає, і вони не потрібні: що імпортується, визначає папка `src/formbuilder/`, а публічний API визначає `__init__.py` (m3-l01). Точки входу для команд це `[project.scripts]`, для плагінів `[project.entry-points]`.

   ```toml
   [project.scripts]
   formbuilder = "formbuilder.cli:main"
   ```

5. **`postinstall` для підготовки даних.** Шукають хук, щоб після встановлення скопіювати шаблони чи згенерувати файл. Встановлення wheel не виконує коду. Правильно: дані всередині пакета і `importlib.resources`, генерація при першому запуску або явною командою.

   ```python
   from importlib.resources import files
   template = files("formbuilder").joinpath("templates/page.html.j2").read_text()
   ```

6. **Шлях від `__file__` як від `__dirname`.** `Path(__file__).parents[2] / "templates"` працює з editable install і дає `FileNotFoundError` з wheel. Правильно: файли в `src/formbuilder/` і `files("formbuilder")`.

   ```python
   TEMPLATES = Path(__file__).resolve().parents[2] / "templates"   # лише з робочої копії
   TEMPLATES = files("formbuilder") / "templates"                  # будь-де
   ```

7. **`file:../lib` у залежностях і публікація як є.** `[tool.uv.sources]` не потрапляє у wheel, і на сервері інсталятор шукає пакет за ім'ям в індексі. Правильно: workspace для пакетів одного репозиторію, публікація локальних залежностей разом з пакетом і установка wheel у чисте venv перед релізом.

   ```bash
   uv venv -q ../ws-check
   uv pip install --python ../ws-check/bin/python --no-index dist/formbuilder-0.1.0-py3-none-any.whl
   # Because fb-shared was not found in the provided package locations ...
   ```

8. **Перезаливання тієї самої версії.** Звичка `npm unpublish` і повторного `npm publish` з тим самим номером. PyPI не прийме файл з ім'ям, яке вже було, а локальні кеші вважають однакову версію однаковим вмістом. Правильно: нова версія, для дрібниць `.post1`.

   ```bash
   uv version --bump post    # 0.2.0 => 0.2.0.post1
   ```

## Підсумок

- `uv build` це frontend; `[build-system]` називає backend (`uv_build`, `hatchling`, `setuptools`), який реально будує sdist і wheel. Wheel будується з sdist.
- Wheel це zip з кодом і `dist-info` (`METADATA`, `WHEEL`, `RECORD`, `entry_points.txt`); встановлення лише розпаковує, коду не виконує.
- Тег `py3-none-any` для чистого Python; бінарні пакети мають wheel на кожну пару версія CPython і платформа, і lock записує всі.
- У пакет іде вміст `src/formbuilder/`; дані читаються через `importlib.resources.files`, а не від `__file__`. Setuptools вимагає явного `package-data`.
- Extras (`optional-dependencies`) публікуються і вмикаються `pkg[extra]`; `dependency-groups` живуть лише в репозиторії.
- Рядок залежності: `name[extras] specifier ; marker`; маркер обчислюється на цільовій машині.
- PEP 440: `dev < a < b < rc < final < post`; пре-релізи не обираються, якщо специфікатор їх не називає.
- `uv lock --upgrade-package x` оновлює точково, `uv tree --outdated` показує відставання, `uv lock --check` для CI; lock не їде у wheel.
- Entry points: іменовані `module:attr` у групах, `importlib.metadata.entry_points(group=...)` знаходить плагіни з усіх встановлених пакетів.
- Workspace: один lock і venv на кілька пакетів; `[tool.uv.sources]` діє лише в розробці.
- `uv tool install` для щоденних утиліт в ізольованих venv; `uv publish` вантажить готовий `dist/`, токен через `UV_PUBLISH_TOKEN`, версія публікується один раз.

## Що далі

Наступний урок m3-l03 про pytest: `parametrize`, fixtures, `conftest.py`, `tmp_path`. Звідси там знадобиться розуміння, що тести імпортують встановлений пакет, а не папку `src/`, і що pytest-плагіни знаходяться через ту саму групу entry points `pytest11`. Перевірку "wheel працює в чистому venv" з цього уроку m7-l07 перетворить на Dockerfile з `uv sync --locked`.
