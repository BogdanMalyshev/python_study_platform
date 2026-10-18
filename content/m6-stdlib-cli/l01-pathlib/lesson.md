---
id: m6-l01
module: m6-stdlib-cli
title: "pathlib, shutil, tempfile: файли генерації"
summary: "Учень працює з файловою системою через Path замість рядків: читає й пише з явним encoding, обходить директорії детерміновано, копіює й прибирає дерева через shutil, пише файли атомарно через тимчасовий файл і replace, перевіряє шляхи від користувача через resolve і is_relative_to і бере файли пакета через importlib.resources."
duration_min: 75
prerequisites: [m5-l09]
---

## `Path` як значення: оператор `/` і частини шляху

У Node шлях це рядок, а `node:path` це набір функцій, які приймають і повертають рядки. У Python шлях це об'єкт `pathlib.Path`: частини шляху це його атрибути, склеювання це оператор `/`, а операції з файловою системою це його методи. `/` працює тому, що `Path` реалізує dunder-метод `__truediv__` (m4-l02), так само як `Decimal` реалізує `+`.

```ts
import path from "node:path";

const page = path.join("out", "contact", "3", "index.html");
path.basename(page);           // "index.html"
path.extname(page);            // ".html"
path.basename(page, ".html");  // "index"
path.dirname(page);            // "out/contact/3"
page.split(path.sep);          // ["out", "contact", "3", "index.html"]
```

```python live
from pathlib import Path

page = Path("out") / "contact" / "3" / "index.html"
print(page)
print(repr(page))
print(page.name, page.suffix, page.stem)
print(page.parent, type(page.parent).__name__)
print(page.parts)
```

```text
out/contact/3/index.html
PosixPath('out/contact/3/index.html')
index.html .html index
out/contact/3 PosixPath
('out', 'contact', '3', 'index.html')
```

Розходиться три речі. Результат кожної операції знову `Path`, а не рядок, тому `.parent.parent` і `/ "assets"` ланцюжаться без повторного `path.join`. `Path` незмінний і хешований, тож його кладуть у множини й ключі словника, а порівняння `==` іде за частинами, а не за текстом: зайві `/` і `.` відкидаються ще в конструкторі. Рядок з'являється лише там, де ви його попросили: `str(page)` або f-рядок. Більшість стандартної бібліотеки з 3.6 приймає `Path` замість рядка напряму (`open`, `shutil`, `subprocess`, `json.load` через `open`), бо вона розуміє протокол `os.PathLike`, метод `__fspath__`.

```python live
from pathlib import Path

archive = Path("dist/contact.tar.gz")
print(archive.suffixes, archive.stem)
print(archive.with_suffix(".zip"))
print(archive.with_name("lead.html"))
print(Path("out/contact/3/index.html").parent.parent)
print([str(p) for p in Path("out/contact/3").parents])
print(Path("out//contact/./3/") == Path("out/contact/3"))
print(Path("out/../dist"))
print("dist" / Path("assets"), f"{archive}")
```

```text
['.tar', '.gz'] contact.tar
dist/contact.tar.zip
dist/lead.html
out/contact
['out/contact', 'out', '.']
True
out/../dist
dist/assets dist/contact.tar.gz
```

> **Пастка.** `.suffix` і `.stem` дивляться лише на останню крапку. Для `contact.tar.gz` суфікс `.gz`, stem `contact.tar`, а `with_suffix(".zip")` дає `contact.tar.zip`. Подвійне розширення збирають через `.suffixes` самі. І `..` конструктор не схлопує: `out/../dist` лишається як є, бо якщо `out` це symlink, "батько `out`" на диску не обов'язково поточна директорія. Схлопує `..` лише `resolve()`, який іде на диск (наступний розділ).

> **Під капотом.** `Path("...")` повертає `PosixPath` на Linux і macOS та `WindowsPath` на Windows. Над ними стоять "чисті" класи `PurePosixPath` і `PureWindowsPath`, які лише розбирають і склеюють шляхи й ніколи не торкаються диска. Їх можна створювати на будь-якій ОС: `PureWindowsPath("C:/Out") / "x"` дає `C:\Out\x` і на Mac, а порівняння в ній регістронезалежне, як у файловій системі Windows. Це зручно, коли сервер на Linux генерує шляхи для чужої ОС або для URL (`PurePosixPath` для частини шляху після домену).

<!-- task: q1 -->

<!-- task: t1 -->

## Відносно чого шлях: `cwd`, `__file__`, `resolve` і ресурси пакета

Відносний `Path("templates/page.html")` відраховується від робочої директорії процесу (current working directory), а не від файлу, у якому написаний код. У Node те саме: `fs.readFileSync("templates/page.html")` читає відносно `process.cwd()`, тому для файлів поруч із кодом пишуть `path.join(__dirname, ...)`. У Python відповідник `__dirname` це `Path(__file__).parent`; `__file__` є в кожному модулі, завантаженому з файлу.

```ts
const here = import.meta.dirname;               // ESM, Node 20.11+; у CommonJS __dirname
const tpl = path.join(here, "templates", "page.html");
process.cwd();
os.homedir();
path.resolve("out/../dist");                    // абсолютний, без ".."
```

```python
# tools/build.py; запуск з кореня проєкту: python tools/build.py
from pathlib import Path

here = Path(__file__).parent
print(Path.cwd().name, "|", here.name)
print(Path(__file__).is_absolute())
print(Path("templates/page.html").exists())
print((here / "templates" / "page.html").exists())
print(Path.home() == Path("~").expanduser())
```

```text
project | tools
True
False
True
True
```

Скрипт запущено з `project/`, а шаблон лежить у `project/tools/templates/`. Відносний шлях шукав `project/templates/page.html` і не знайшов, шлях від `__file__` знайшов. `__file__` модуля, запущеного як скрипт, з 3.9 завжди абсолютний; до 3.9 він міг бути відносним, і старий код через це обгортає його в `os.path.abspath`. `Path.home()` це `os.homedir()`, а `~` у рядку шляху Python сам не розкриває: `Path("~/x")` це директорія з назвою `~`, поки не викликати `.expanduser()`.

Методи діляться на дві групи, і межа між ними важлива. Атрибути з першого розділу і `/` чисті: вони працюють з текстом шляху й не знають, чи існує файл. `exists()`, `is_file()`, `is_dir()`, `resolve()`, `stat()` ідуть у файлову систему. `resolve()` робить шлях абсолютним, схлопує `..` і розкриває symlink-и, тобто повертає справжнє розташування. `absolute()` лише дописує `cwd` спереду й нічого не схлопує. На macOS це видно одразу: тимчасова директорія лежить у `/var/...`, а `/var` там symlink на `/private/var`.

```python
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "dist").mkdir()
    (root / "out").mkdir()
    (root / "out" / "index.html").write_text("<form></form>", encoding="utf-8")

    page = root / "dist" / ".." / "out" / "index.html"
    print(page.relative_to(root))
    print(page.resolve().relative_to(root.resolve()))
    print(page.exists(), page.is_file(), page.parent.is_dir())
    print((root / "missing.html").exists(), (root / "missing.html").is_file())
    print(root.resolve() == root, root.resolve().is_relative_to(root))
```

```text
dist/../out/index.html
out/index.html
True True True
False False
False False
```

> **Пастка.** `resolve()` на macOS і `TemporaryDirectory` дають різні префікси (`/private/var` проти `/var`), тому `page.resolve().relative_to(root)` падає з `ValueError`, хоча файл лежить усередині `root`. Якщо порівнюєте розв'язаний шлях з коренем, розв'язуйте обидва: `root = Path(tmp).resolve()` одразу на вході.

`os.path` у новому коді не потрібен, але ви його читатимете ще довго: pathlib з'явився в 3.4, а стандартна бібліотека почала приймати `Path` лише з 3.6, тож код, написаний до того, і код, який його копіює, тримає шляхи рядками. Відповідність майже один до одного; рядок проти об'єкта це вся різниця.

```python live
import os.path
from pathlib import Path

s = "out/contact/3/index.html"
p = Path(s)
print(os.path.join("out", "contact") == str(Path("out") / "contact"))
print(os.path.basename(s) == p.name, os.path.dirname(s) == str(p.parent))
print(os.path.splitext(s), (str(p.with_suffix("")), p.suffix))
print(os.path.exists(s) == p.exists())
```

```text
True
True True
('out/contact/3/index', '.html') ('out/contact/3/index', '.html')
True
```

Файли, які лежать усередині вашого пакета (Jinja2-шаблони, JSON-схеми, дефолтні конфіги), правильно діставати не через `__file__`, а через `importlib.resources.files("formbuilder") / "templates"`. Причина в тому, що встановлений пакет не зобов'язаний бути директорією на диску: він може лежати в zip-архіві (zipapp, zipimport), бути заморожений у бінарник PyInstaller або підвантажуватися власним завантажувачем. `files()` питає завантажувач пакета, а не файлову систему, і повертає об'єкт `Traversable` з тим самим `/`, `read_text`, `iterdir`, що й у `Path`; для пакета в zip це `zipfile.Path`. Як шаблони потрапляють у wheel, розібрано в m3-l02; нижче пакет з шаблоном запаковано в zip, і видно, що `__file__` веде в нікуди, а `files()` читає.

```python
import importlib
import sys
import tempfile
import zipfile
from importlib.resources import as_file, files
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    bundle = Path(tmp) / "bundle.zip"
    with zipfile.ZipFile(bundle, "w") as zf:
        zf.writestr("demo_pkg/__init__.py", "")
        zf.writestr("demo_pkg/templates/page.html", "<main>{body}</main>")
    sys.path.insert(0, str(bundle))
    pkg = importlib.import_module("demo_pkg")

    via_file = Path(pkg.__file__).parent / "templates" / "page.html"
    print(via_file.relative_to(tmp), via_file.exists())

    template = files("demo_pkg") / "templates" / "page.html"
    print(type(template).__name__, template.read_text(encoding="utf-8"))
    with as_file(template) as real_path:
        print(type(real_path).__name__, real_path.read_text(encoding="utf-8"))
    print("after as_file:", real_path.exists())
```

```text
bundle.zip/demo_pkg/templates/page.html False
Path <main>{body}</main>
PosixPath <main>{body}</main>
after as_file: False
```

`as_file()` потрібен там, де стороннє API вимагає справжній шлях на диску: для ресурсу в zip він витягає файл у тимчасове місце на час блоку `with` і прибирає його на виході, а для звичайного пакета на диску просто віддає наявний шлях. У капстоуні Jinja2 бере шаблони через `PackageLoader("formbuilder", "templates")`, який усередині робить те саме (m7-l06). `Path(__file__)` лишається нормальним для скриптів і тестів, які завжди запускаються з репозиторію.

## Читання й запис: encoding завжди явно

Для цілого файлу є чотири методи: `read_text`/`write_text` для `str` і `read_bytes`/`write_bytes` для `bytes`. Це `fs.readFileSync(p, "utf8")` і `fs.writeFileSync(p, s)`, з однією різницею, яка важить більше за решту: Node без кодування повертає `Buffer`, тож забути кодування там означає отримати не той тип і одразу це побачити. Python без `encoding` повертає `str`, просто декодований кодуванням локалі ОС. На Linux і macOS це майже завжди UTF-8, на Windows ANSI-кодова сторінка, для української локалі `cp1251`. Код без `encoding` працює на машині розробника й ламає кирилицю на Windows-машині колеги або в CI.

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "form.json"
    print(path.write_text('{"title": "Контакт"}', encoding="utf-8"))
    print(path.read_text(encoding="utf-8"))
    print(path.read_bytes()[:14])
    print(len(path.read_bytes()), path.stat().st_size)
    print(path.read_bytes().decode("cp1251"))
```

```text
20
{"title": "Контакт"}
b'{"title": "\xd0\x9a\xd0'
27 27
{"title": "РљРѕРЅС‚Р°РєС‚"}
```

`write_text` повертає кількість записаних символів (20), а файл займає 27 байтів, бо кожна кирилична літера в UTF-8 це два байти. Останній рядок показує, що бачить Windows з українською локаллю, коли читає UTF-8-файл без `encoding`: класичний mojibake. `str` і `bytes` як типи розібрані в m1-l04; тут правило "декодувати на вході, кодувати на виході" стає буквальним: `read_text` це `read_bytes().decode(encoding)`.

Python сам підкаже, де кодування пропущено. Прапорець `-X warn_default_encoding` (3.10+) вмикає `EncodingWarning` на кожен `open`, `read_text` чи `write_text` без `encoding`. У 3.15 UTF-8 стане кодуванням за замовчуванням на всіх ОС (PEP 686), але код під 3.12 має вказувати його явно. ruff ловить це статично правилом `PLW1514` (`unspecified-encoding`).

```bash
$ python -X warn_default_encoding -c 'from pathlib import Path; Path("form.json").write_text("{}")'
<string>:1: EncodingWarning: 'encoding' argument not specified
```

Коли файл треба читати потоком, по рядках або дописувати, беруть `open()`: вбудовану функцію `open(path, mode)` або метод `path.open(mode)`, це одне й те саме. Режим складається з дії й типу: `r` читання (за замовчуванням), `w` запис з обрізанням файлу до нуля, `a` дописування в кінець, `x` створення, яке падає, якщо файл уже є; `b` перемикає на `bytes`, без нього текст. Файловий об'єкт це контекстний менеджер (m4-l07), тому `open` пишуть лише з `with`, і iterable по рядках, тому `for line in f` читає файл ліниво, не завантажуючи його цілком.

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    log = Path(tmp) / "build.log"
    with log.open("w", encoding="utf-8") as f:
        f.write("validate ok\n")
    with open(log, "a", encoding="utf-8") as f:
        print("render ok", file=f)
    with log.open(encoding="utf-8") as f:
        for n, line in enumerate(f, start=1):
            print(n, repr(line))
    with log.open("rb") as f:
        print(f.read(8))
    try:
        with log.open("x", encoding="utf-8") as f:
            f.write("overwrite?")
    except FileExistsError as e:
        print(type(e).__name__, Path(e.filename).name)
```

```text
1 'validate ok\n'
2 'render ok\n'
b'validate'
FileExistsError build.log
```

> **Пастка.** Рядки з `for line in f` закінчуються на `"\n"`, на відміну від `text.split("\n")` у JS. Для рядків без переводу є `path.read_text(...).splitlines()`, а в потоці `line.rstrip("\n")`. І режим `"w"` обрізає файл у момент `open`, ще до першого `write`: якщо далі виняток, на диску лишається порожній або недописаний файл. Як цього уникнути, у розділі про атомарний запис.

Текстовий режим перекладає кінці рядків. При читанні `\r\n` і `\r` стають `\n` (universal newlines), при записі `\n` стає `os.linesep`, тобто `\r\n` на Windows. Параметр `newline` цим керує: `newline=""` вимикає переклад при читанні (так відкривають CSV, m6-l02), `newline="\n"` фіксує LF при записі на будь-якій ОС, що потрібно для згенерованих файлів, які мають бути однаковими побайтно. Окремо від цього BOM: Excel і Блокнот іноді ставлять на початок UTF-8-файлу три байти `EF BB BF`, і `encoding="utf-8"` віддає їх як символ `\ufeff`, через який ламається `json.loads`. Кодування `utf-8-sig` прибирає BOM при читанні. `errors="replace"` замінює невалідні байти на `�` замість `UnicodeDecodeError`, і це для логів і діагностики, а не для даних.

```python live
import codecs
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "rows.txt"
    path.write_bytes(b"a\r\nb\r\n")
    print(repr(path.read_text(encoding="utf-8")))
    with path.open(encoding="utf-8", newline="") as f:
        print(repr(f.read()))
    path.write_text("a\nb\n", encoding="utf-8", newline="\r\n")
    print(path.read_bytes())

    path.write_bytes(codecs.BOM_UTF8 + '{"title": "Контакт"}'.encode())
    print(repr(path.read_text(encoding="utf-8")[:3]))
    print(repr(path.read_text(encoding="utf-8-sig")[:3]))
    path.write_bytes(b"ok \xff\xfe end")
    print(path.read_text(encoding="utf-8", errors="replace"))
```

```text
'a\nb\n'
'a\r\nb\r\n'
b'a\r\nb\r\n'
'\ufeff{"'
'{"t'
ok �� end
```

<!-- task: t2 -->

## Обхід директорій: `iterdir`, `glob`, `rglob`, `walk`

`iterdir()` віддає прямих нащадків директорії, як `fs.readdirSync`, але одразу як `Path`, а не імена. `glob(pattern)` фільтрує за шаблоном у межах однієї директорії; `**` у шаблоні означає "будь-яка глибина", і `rglob("*.json")` це скорочення для `glob("**/*.json")`. Усі три повертають генератор (m5-l02): файли зчитуються по мірі ітерації, `len()` на результаті не працює, а другий прохід потребує нового виклику.

```ts
import fg from "fast-glob";
fs.readdirSync("forms");                        // імена, порядок від ОС
fg.sync("forms/**/*.json");                     // дотфайли пропускає, dot: false
fs.readdirSync("forms", { recursive: true });   // Node 20+
```

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    for rel in ["contact.json", ".draft.json", "lead/form.json", "lead/theme.css",
                "lead/old/v1.json", "_shared/base.json"]:
        path = root / "forms" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")

    forms = root / "forms"
    print(sorted(p.name for p in forms.iterdir()))
    print(sorted(p.name for p in forms.glob("*.json")))
    print(sorted(p.relative_to(forms).as_posix() for p in forms.rglob("*.json")))
    print(sorted(p.relative_to(forms).as_posix() for p in forms.glob("lead/**/*")))
    print(type(forms.glob("*")).__name__)
```

```text
['.draft.json', '_shared', 'contact.json', 'lead']
['.draft.json', 'contact.json']
['.draft.json', '_shared/base.json', 'contact.json', 'lead/form.json', 'lead/old/v1.json']
['lead/form.json', 'lead/old', 'lead/old/v1.json', 'lead/theme.css']
generator
```

> **Пастка.** Порядок `iterdir`, `glob` і `rglob` не визначений: це порядок, у якому файлова система віддає записи, і на ext4, APFS і NTFS він різний. Тест, який порівнює список файлів без `sorted`, проходить у вас і падає в CI. Сортуйте завжди, коли результат кудись виводиться, порівнюється чи впливає на порядок обробки.

> **Пастка.** `Path.glob("*")` знаходить і дотфайли: `.draft.json` вище потрапив у результат. Це протилежне до shell, `glob.glob` і `fast-glob` з `dot: false`, які приховані файли пропускають. Якщо `.DS_Store` або `.tmp`-файли не мають потрапити в публікацію, відфільтруйте їх явно.

Шаблон відповідає і директоріям: `lead/**/*` повернув `lead/old`, тож там, де потрібні лише файли, додають `p.is_file()`. Фільтрація понад шаблон це comprehension з умовою (m1-l10): тип запису, частини шляху, розмір. Для обходу з відсіканням цілих гілок у 3.12 з'явився `Path.walk()`, аналог давнього `os.walk`, але з `Path` замість рядків. Він віддає трійки `(dirpath, dirnames, filenames)` згори вниз, і якщо змінити список `dirnames` на місці, `walk` не спуститься у викинуті директорії. `rglob` так не вміє: він обійде `node_modules` цілком, а відфільтрувати ви зможете лише результат.

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    for rel in ["src/form.json", "src/old/v1.json", "node_modules/pkg/package.json",
                ".git/config.json", "src/readme.md"]:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")

    print(sorted(p.relative_to(root).as_posix() for p in root.rglob("*.json")
                 if not any(part.startswith(".") or part == "node_modules"
                            for part in p.relative_to(root).parts)))

    found = []
    for dirpath, dirnames, filenames in root.walk():
        dirnames[:] = sorted(d for d in dirnames if d not in {"node_modules", ".git"})
        found += [(dirpath / f).relative_to(root).as_posix()
                  for f in sorted(filenames) if f.endswith(".json")]
    print(found)
```

```text
['src/form.json', 'src/old/v1.json']
['src/form.json', 'src/old/v1.json']
```

`dirnames[:] = ...` замість `dirnames = ...` тут обов'язкове: `walk` тримає посилання на свій список, і присвоєння нового списку імені `dirnames` він не побачить (aliasing, m2-l02). Сортування `dirnames` на місці заодно робить порядок обходу детермінованим.

<!-- task: t3 -->

## Створення, переміщення й видалення: pathlib і `shutil`

Операції над одним файлом або порожньою директорією є методами `Path`. `mkdir(parents=True, exist_ok=True)` це `fs.mkdirSync(p, { recursive: true })`: без `parents` відсутній батько дає `FileNotFoundError`, без `exist_ok` наявна директорія дає `FileExistsError`. `touch()` створює порожній файл або оновлює час зміни наявного. `unlink(missing_ok=True)` видаляє файл і мовчить, якщо його нема. `rmdir()` видаляє лише порожню директорію.

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    try:
        (root / "out" / "contact").mkdir()
    except FileNotFoundError:
        print("mkdir without parents: FileNotFoundError")
    (root / "out" / "contact").mkdir(parents=True)
    (root / "out" / "contact").mkdir(parents=True, exist_ok=True)

    marker = root / "out" / "contact" / ".published"
    marker.touch()
    print(sorted(p.name for p in (root / "out" / "contact").iterdir()))
    marker.unlink()
    marker.unlink(missing_ok=True)
    try:
        (root / "out").rmdir()
    except OSError as e:
        print("rmdir:", type(e).__name__, e.strerror)
    (root / "out" / "contact").rmdir()
    (root / "out").rmdir()
    print(list(root.iterdir()))
```

```text
mkdir without parents: FileNotFoundError
['.published']
rmdir: OSError Directory not empty
[]
```

Переміщення й перейменування це `rename(target)` і `replace(target)`; обидва повертають новий `Path`. Різниця в тому, що робиться з наявною ціллю: `replace` завжди мовчки її замінює, `rename` на Linux і macOS теж замінює, а на Windows падає з `FileExistsError`. Код, який має поводитися однаково скрізь, пише `replace`, коли заміна потрібна, і перевіряє ціль, коли ні. Обидва працюють лише в межах однієї файлової системи: перенесення з `/tmp` на інший диск дає `OSError` з `errno.EXDEV`, і тоді потрібен `shutil.move`.

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    draft = root / "draft.html"
    draft.write_text("<v2>", encoding="utf-8")
    (root / "index.html").write_text("<v1>", encoding="utf-8")

    moved = draft.replace(root / "index.html")
    print(moved.name, moved.read_text(encoding="utf-8"), draft.exists())
    renamed = moved.rename(root / "page.html")
    print(sorted(p.name for p in root.iterdir()), type(renamed).__name__)
```

```text
index.html <v2> False
['page.html'] PosixPath
```

Усе, що стосується вмісту або дерев, у 3.12 живе в `shutil` ("shell utilities"); `Path.copy` і `Path.move` з'являться лише в 3.14. `shutil.copy(src, dst)` копіює вміст і права доступу, `copy2` додатково час зміни й інші метадані, `copyfile` лише вміст. Якщо `dst` директорія, файл кладеться в неї з тим самим ім'ям, як у `cp`. `copytree(src, dst)` копіює дерево і за замовчуванням вимагає, щоб `dst` не існувала; `dirs_exist_ok=True` дозволяє доливати в наявну, а `ignore=shutil.ignore_patterns("*.map")` відсікає непотрібне. `rmtree(path)` це `fs.rmSync(p, { recursive: true })`, `move(src, dst)` переміщує будь-куди, при потребі через копіювання й видалення.

```python live
import os
import shutil
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    assets = root / "assets"
    (assets / "img").mkdir(parents=True)
    (assets / "app.js").write_text("init()", encoding="utf-8")
    (assets / "app.js.map").write_text("{}", encoding="utf-8")
    (assets / "img" / "logo.svg").write_text("<svg/>", encoding="utf-8")
    os.utime(assets / "app.js", (1_700_000_000, 1_700_000_000))

    out = root / "out"
    out.mkdir()
    shutil.copy(assets / "app.js", out)
    shutil.copy2(assets / "app.js", out / "app.v2.js")
    print((out / "app.js").stat().st_mtime == 1_700_000_000,
          (out / "app.v2.js").stat().st_mtime == 1_700_000_000)

    shutil.copytree(assets, out / "assets", ignore=shutil.ignore_patterns("*.map"))
    try:
        shutil.copytree(assets, out / "assets")
    except FileExistsError:
        print("copytree: FileExistsError")
    shutil.copytree(assets, out / "assets", dirs_exist_ok=True)
    shutil.move(out / "app.v2.js", out / "assets" / "img")
    print(sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()))

    shutil.rmtree(out / "assets")
    print(sorted(p.name for p in out.iterdir()))
```

```text
False True
copytree: FileExistsError
['app.js', 'assets/app.js', 'assets/app.js.map', 'assets/img/app.v2.js', 'assets/img/logo.svg']
['app.js']
```

Другий `copytree` з `dirs_exist_ok=True` повернув `app.js.map`, бо `ignore` у нього не передали: кожен виклик копіює рівно те, що йому сказали, і стан цілі для нього не має значення. `copytree` копіює файли через `copy2`, тобто з часом зміни, що важливо для синхронізації, яка порівнює `mtime` (завдання t5). `shutil.make_archive(base, "zip", root_dir)` пакує директорію в архів і повертає шлях до нього; формати `zip`, `tar`, `gztar` і інші, залежно від збірки Python.

```python
import shutil
import tempfile
import zipfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    site = Path(tmp) / "site"
    (site / "assets").mkdir(parents=True)
    (site / "index.html").write_text("<form></form>", encoding="utf-8")
    (site / "assets" / "app.js").write_text("init()", encoding="utf-8")

    archive = shutil.make_archive(str(Path(tmp) / "contact-v3"), "zip", root_dir=site)
    print(Path(archive).name)
    print(sorted(zipfile.ZipFile(archive).namelist()))
```

```text
contact-v3.zip
['assets/', 'assets/app.js', 'index.html']
```

## Помилки файлової системи, EAFP і `stat`

Кожна помилка ОС у Python це `OSError` або його нащадок, і нащадки відповідають кодам `errno`, які ви бачили в Node як `err.code`. Ловлять конкретний клас, а не порівнюють рядки: `FileNotFoundError` це `ENOENT`, `FileExistsError` це `EEXIST`, `IsADirectoryError` це `EISDIR`, `NotADirectoryError` це `ENOTDIR`, `PermissionError` це `EACCES` або `EPERM`. Виняток несе `errno`, `strerror` і `filename`, тож повідомлення для користувача будується без розбору тексту.

```ts
try {
  fs.readFileSync(p, "utf8");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "ENOENT") return defaults;
  throw e;
}
```

```python live
import errno
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "out").mkdir()
    (root / "index.html").write_text("<form>", encoding="utf-8")
    attempts = [
        lambda: (root / "missing.json").read_text(encoding="utf-8"),
        lambda: (root / "out").mkdir(),
        lambda: (root / "out").read_text(encoding="utf-8"),
        lambda: (root / "index.html" / "x").read_text(encoding="utf-8"),
    ]
    for attempt in attempts:
        try:
            attempt()
        except OSError as e:
            print(type(e).__name__, errno.errorcode[e.errno], Path(e.filename).name,
                  isinstance(e, OSError))
```

```text
FileNotFoundError ENOENT missing.json True
FileExistsError EEXIST out True
IsADirectoryError EISDIR out True
NotADirectoryError ENOTDIR x True
```

`PermissionError` у браузерній пісочниці не відтворити, там немає користувачів і прав, тому цей приклад запускався локально на macOS.

```python
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    secret = Path(tmp) / "secret.json"
    secret.write_text("{}", encoding="utf-8")
    secret.chmod(0o000)
    try:
        secret.read_text(encoding="utf-8")
    except PermissionError as e:
        print(type(e).__name__, e.errno, e.strerror)
    finally:
        secret.chmod(0o600)
```

```text
PermissionError 13 Permission denied
```

Звичка з Node `if (fs.existsSync(p)) fs.readFileSync(p)` у Python це LBYL, і для файлів вона гірша, ніж для словників. Між перевіркою і читанням інший процес може видалити файл (TOCTOU, розібрано в m1-l11), `exists()` не відрізняє "файлу нема" від "файл є, але це директорія", а прав доступу не перевіряє взагалі. EAFP-версія робить операцію одразу й обробляє рівно ту помилку, яку вміє обробити; решта летить далі.

```python live
import json
import tempfile
from pathlib import Path

DEFAULTS = {"theme": "light"}

def load_settings(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return dict(DEFAULTS)
    return {**DEFAULTS, **json.loads(text)}

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "settings.json"
    print(load_settings(path))
    path.write_text('{"theme": "dark"}', encoding="utf-8")
    print(load_settings(path))
    path.unlink()
    path.mkdir()
    try:
        load_settings(path)
    except IsADirectoryError as e:
        print(type(e).__name__)
```

```text
{'theme': 'light'}
{'theme': 'dark'}
IsADirectoryError
```

`exists()`, `is_file()` і `is_dir()` при цьому не погані: вони доречні, коли відповідь потрібна сама по собі, а не як підготовка до операції. "Чи є в директорії форми `index.html`" для статусу публікації це законне питання. Те саме з `stat()`: він повертає `os.stat_result` з розміром `st_size`, часом зміни `st_mtime` (секунди з epoch як `float`) і `st_mtime_ns` (ціле, без втрати точності), правами `st_mode`. Час з `stat` переводять у `datetime` з явною зоною UTC (m6-l03). Нижче `os.utime` фіксує час зміни, щоб вивід був детермінованим.

```python live
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    page = Path(tmp) / "index.html"
    page.write_text("<form>Контакт</form>", encoding="utf-8")
    os.utime(page, (1_700_000_000, 1_700_000_000))
    st = page.stat()
    print(st.st_size, st.st_mtime, st.st_mtime_ns)
    print(datetime.fromtimestamp(st.st_mtime, tz=UTC).isoformat())
    try:
        (Path(tmp) / "missing.html").stat()
    except FileNotFoundError:
        print("stat: FileNotFoundError")
```

```text
27 1700000000.0 1700000000000000000
2023-11-14T22:13:20+00:00
stat: FileNotFoundError
```

## `tempfile` і атомарний запис

`tempfile` створює тимчасові файли й директорії з унікальними іменами в безпечний спосіб: ім'я випадкове, файл створюється атомарно з правами лише для власника, тож інший процес не підставить свій файл під передбачене ім'я. Модуль має дві пари API. Контекстні менеджери (m4-l07) прибирають за собою самі: `TemporaryDirectory()` видаляє директорію з усім вмістом на виході з `with`, `NamedTemporaryFile()` видаляє файл. Функції `mkdtemp()` і `mkstemp()` лише створюють, а прибирання на вас; вони потрібні, коли тимчасовий об'єкт має пережити блок, наприклад стати постійним через `replace`.

```python live
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory(prefix="build-") as tmp:
    print(type(tmp).__name__, Path(tmp).name.startswith("build-"))
    workdir = Path(tmp)
    (workdir / "page.html").write_text("<form>", encoding="utf-8")
print("dir after with:", workdir.exists())

with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".html") as f:
    f.write("<form>")
    f.flush()
    name = Path(f.name)
    print(name.suffix, name.read_text(encoding="utf-8"))
print("file after with:", name.exists())

try:
    with tempfile.NamedTemporaryFile() as f:
        f.write("<form>")
except TypeError as e:
    print("default mode:", f.mode, "|", e)

kept = Path(tempfile.mkdtemp(prefix="keep-"))
print("mkdtemp after:", kept.exists())
kept.rmdir()
```

```text
str True
dir after with: False
.html <form>
file after with: False
default mode: rb+ | a bytes-like object is required, not 'str'
mkdtemp after: True
```

> **Пастка.** `NamedTemporaryFile()` за замовчуванням відкритий у режимі `"w+b"`, тобто бінарному (файловий об'єкт показує його як `rb+`), і `write` рядка дає `TypeError`. Для тексту передавайте `"w"` і `encoding`. І `TemporaryDirectory` віддає в `as` рядок, а не `Path`: загорніть одразу, `root = Path(tmp)`.

Де ці файли лежать, вирішує `tempfile.gettempdir()`: змінні оточення `TMPDIR`, `TEMP`, `TMP`, потім системні `/tmp`, `/var/tmp`, і нарешті поточна директорія. На macOS це персональна директорія користувача в `/var/folders/...`, на Linux зазвичай `/tmp`, на Windows `%LOCALAPPDATA%\Temp`. Вивід нижче з однієї машини автора.

```python
import tempfile

print(tempfile.gettempdir())
```

```text
/var/folders/4k/q90b6p552qv2mxsx88chhbdc0000gn/T
```

У тестах `tempfile` напряму майже не пишуть: фікстура pytest `tmp_path` (m3-l03) дає кожному тесту власну директорію як готовий `Path` і не видаляє її одразу, а лишає кілька останніх запусків для розбору. Тому функції, що працюють з файлами, приймають корінь параметром (`root: Path`), а не беруть `Path.cwd()` чи захардкоджений `out/`: тест підставляє `tmp_path`, продакшн-код реальну директорію. Це та сама ін'єкція залежності, що з годинником у m4-l07.

Тепер атомарний запис. `write_text` відкриває файл у режимі `"w"`, і файл обрізається до нуля раніше, ніж записано перший байт. Між обрізанням і останнім `write` будь-хто, хто читає файл, бачить половину: nginx віддає користувачу обрізаний HTML, CDN кешує його на годину, другий воркер читає недописаний JSON. А якщо процес упав посередині, половина лишається на диску назавжди, і попередня версія вже втрачена.

```python live
import tempfile
from pathlib import Path

def render_chunks():
    yield "<main>"
    yield "<form>"
    raise RuntimeError("template error")

with tempfile.TemporaryDirectory() as tmp:
    index = Path(tmp) / "index.html"
    index.write_text("<main><form>v1</form></main>", encoding="utf-8")
    try:
        with index.open("w", encoding="utf-8") as f:
            for chunk in render_chunks():
                f.write(chunk)
    except RuntimeError:
        pass
    print(repr(index.read_text(encoding="utf-8")))
```

```text
'<main><form>'
```

Рецепт атомарного запису: записати новий вміст у тимчасовий файл у тій самій директорії, а потім `os.replace` (або `Path.replace`) поверх цільового. Перейменування в межах однієї файлової системи на POSIX атомарне: системний виклик `rename(2)` міняє запис у директорії одним кроком, і будь-який читач бачить або старий файл цілком, або новий цілком. Тому тимчасовий файл створюють саме поруч (`dir=path.parent`), а не в `gettempdir()`: `/tmp` часто окрема файлова система (tmpfs), і `replace` звідти дасть `OSError: Invalid cross-device link` або, через `shutil.move`, той самий неатомарний копі-запис. Якщо запис упав, тимчасовий файл видаляють, а цільовий не змінювався взагалі.

```python live
import os
import tempfile
from pathlib import Path

def atomic_write_text(path: Path, text: str) -> None:
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with open(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise

with tempfile.TemporaryDirectory() as tmp:
    index = Path(tmp) / "index.html"
    atomic_write_text(index, "<main>v1</main>")
    atomic_write_text(index, "<main>v2</main>")
    print(index.read_text(encoding="utf-8"))
    try:
        atomic_write_text(index, None)
    except TypeError as e:
        print("failed:", e)
    print(index.read_text(encoding="utf-8"), sorted(p.name for p in Path(tmp).iterdir()))
```

```text
<main>v2</main>
failed: write() argument must be str, not None
<main>v2</main> ['index.html']
```

Деталі рецепта. `mkstemp` повертає відкритий дескриптор і шлях; `open(fd, ...)` загортає дескриптор у файловий об'єкт, який закриє його на виході з `with`. Префікс з крапкою ховає тимчасовий файл від `glob`-ів, які шукають `*.html`, а суфікс `.tmp` дозволяє прибирати сироти після падіння процесу. `flush` переносить буфер Python в ОС, `fsync` просить ОС записати дані на диск до перейменування; без нього після вимкнення живлення можна отримати новий файл нульової довжини. `except BaseException` з голим `raise` прибирає і при `KeyboardInterrupt`, і при скасуванні задачі (m1-l11).

> **Пастка.** `mkstemp` створює файл з правами `0o600`, лише для власника, а `replace` переносить ці права на опублікований файл. Якщо статику віддає nginx від іншого користувача, він отримає `403`, хоча файл на місці. Для публічних файлів після запису ставлять `os.chmod(tmp, 0o644)` до `replace`.

```python
import os
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    plain = Path(tmp) / "plain.html"
    plain.write_text("<p>", encoding="utf-8")
    fd, name = tempfile.mkstemp(dir=tmp)
    os.close(fd)
    print(oct(plain.stat().st_mode & 0o777), oct(Path(name).stat().st_mode & 0o777))
```

```text
0o644 0o600
```

Атомарний `replace` працює для одного файлу. Сторінка FormBuilder це `index.html` плюс assets, і для неї атомарність досягається порядком: спершу на місце кладуться assets нової версії в її власну директорію `out/<form_id>/<version>/`, і лише останнім кроком атомарно з'являється `index.html`, який на них посилається. Директорія версії, у якій ще немає `index.html`, для сервера просто не опублікована. На Windows `os.replace` може впасти з `PermissionError`, якщо цільовий файл зараз відкритий іншим процесом; там атомарна публікація потребує повторних спроб.

<!-- task: t4 -->

## Шляхи від користувача: `resolve` і `is_relative_to`

Щойно частина шляху приходить ззовні (id форми з URL, ім'я файлу з завантаження, шлях з конфігу), `root / user_input` перестає бути безпечним. Відносний шлях з `..` виходить за корінь (path traversal), а абсолютний шлях праворуч від `/` відкидає ліву частину повністю. Друге особливо підступне для JS-розробника: `path.join("/srv/out", "/etc/passwd")` у Node дає `/srv/out/etc/passwd`, а Python поводиться як `path.resolve`.

```python live
from pathlib import Path

root = Path("/srv/out")
print(root / "contact/index.html")
print(root / "../../etc/passwd")
print(root / "/etc/passwd")
print((root / "../../etc/passwd").is_relative_to(root))
```

```text
/srv/out/contact/index.html
/srv/out/../../etc/passwd
/etc/passwd
True
```

`is_relative_to` (3.9+) перевіряє, чи шлях починається з частин кореня, і робить це за текстом, як і всі чисті операції. `/srv/out/../../etc/passwd` текстово починається з `/srv/out`, тож перевірка без `resolve()` пропускає traversal. Правильний порядок: спершу `resolve()` і корінь, і результат склеювання, щоб `..` схлопнулись, а symlink-и розкрились, потім `is_relative_to`. Порівнювати по частинах, а не рядками, теж важливо: `"/srv/out-evil".startswith("/srv/out")` істинне, а `Path("/srv/out-evil").is_relative_to("/srv/out")` ні.

```python live
import tempfile
from pathlib import Path

def safe_join(root: Path, user_path: str) -> Path:
    base = root.resolve()
    target = (base / user_path).resolve()
    if not target.is_relative_to(base):
        raise ValueError(f"path escapes root: {user_path!r}")
    return target

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp) / "out"
    root.mkdir()
    for user_path in ["contact/index.html", "contact/../lead/index.html",
                      "../secret.json", "/etc/passwd", "contact/../../x"]:
        try:
            print("ok  ", safe_join(root, user_path).relative_to(root.resolve()).as_posix())
        except ValueError as e:
            print("deny", e)

print(str(Path("/srv/out-evil")).startswith(str(Path("/srv/out"))),
      Path("/srv/out-evil").is_relative_to("/srv/out"))
```

```text
ok   contact/index.html
ok   lead/index.html
deny path escapes root: '../secret.json'
deny path escapes root: '/etc/passwd'
deny path escapes root: 'contact/../../x'
True False
```

`resolve()` розкриває symlink-и, тому ловить і посилання, яке лежить усередині кореня, але вказує назовні. Перевірка, яка лише шукає `..` у рядку, такого не бачить. Приклад з symlink запускався локально; механізм той самий, що в `safe_join` вище.

```python
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp).resolve()
    (base / "out").mkdir()
    (base / "secret.json").write_text("{}", encoding="utf-8")
    (base / "out" / "link.json").symlink_to(base / "secret.json")

    target = base / "out" / "link.json"
    print(".." in str(target), target.is_relative_to(base / "out"))
    print(target.resolve().is_relative_to(base / "out"), target.resolve().name)
```

```text
False True
False secret.json
```

> **Пастка.** Склеювання рядками, `f"{root}/{name}"` чи `root + "/" + name`, ламається трьома способами одразу: подвійні роздільники, `\` на Windows і жодної нормалізації перед перевіркою. А перевірка `startswith` на рядках пропускає сусідні директорії зі спільним префіксом. Шляхи збирають через `Path` і перевіряють через `resolve()` плюс `is_relative_to`.

Для сегментів, які за змістом мають бути одним ім'ям, наприклад id форми в `out/<form_id>/`, надійніша за перевірку шляху перевірка самого значення: дозволити лише `[a-z0-9-]` (регулярні вирази в m6-l04) або хоча б вимагати `Path(form_id).name == form_id and form_id not in {"", ".", ".."}`. `safe_join` лишається другим рубежем для того, що справді є шляхом.

<!-- task: q2 -->

<!-- task: q3 -->

## Для капстоуну

`StaticPublisher` збирає весь урок в одну річ: публікує згенеровану сторінку в `out/<form_id>/<version>/index.html`, копіює assets, прибирає старі версії, і все це з коренем, переданим параметром. Порядок кроків той, що описаний вище: assets копіюються першими, `index.html` з'являється атомарно останнім, старі версії видаляються лише після успішної публікації нової. Номери версій сортуються як числа: рядкове сортування поставило б `"10"` перед `"9"` і видалило б найновішу.

```python live
import os
import shutil
import tempfile
from pathlib import Path

class StaticPublisher:
    def __init__(self, root: Path, keep: int = 3) -> None:
        self.root = root
        self.keep = keep

    def publish(self, form_id: str, version: int, html: str, assets: Path | None = None) -> Path:
        if Path(form_id).name != form_id or form_id in {"", ".", ".."}:
            raise ValueError(f"invalid form id: {form_id!r}")
        target = self.root / form_id / str(version)
        target.mkdir(parents=True, exist_ok=True)
        if assets is not None:
            shutil.copytree(assets, target / "assets", dirs_exist_ok=True)
        index = target / "index.html"
        self._atomic_write(index, html)
        self._prune(self.root / form_id)
        return index

    def _atomic_write(self, path: Path, text: str) -> None:
        fd, name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
        tmp = Path(name)
        try:
            with open(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            tmp.chmod(0o644)
            tmp.replace(path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise

    def _prune(self, form_dir: Path) -> None:
        versions = sorted(int(p.name) for p in form_dir.iterdir() if p.is_dir() and p.name.isdigit())
        for old in versions[:-self.keep]:
            shutil.rmtree(form_dir / str(old))

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    assets = root / "src-assets"
    assets.mkdir()
    (assets / "app.js").write_text("init()", encoding="utf-8")

    publisher = StaticPublisher(root / "out", keep=2)
    for version in [8, 9, 10]:
        index = publisher.publish("contact", version, f"<main>v{version}</main>", assets)
    print(index.relative_to(root).as_posix(), index.read_text(encoding="utf-8"))
    print(sorted(p.relative_to(root / "out").as_posix() for p in (root / "out").rglob("*")))
    try:
        publisher.publish("../etc", 1, "<p>")
    except ValueError as e:
        print(e)
```

```text
out/contact/10/index.html <main>v10</main>
['contact', 'contact/10', 'contact/10/assets', 'contact/10/assets/app.js', 'contact/10/index.html', 'contact/9', 'contact/9/assets', 'contact/9/assets/app.js', 'contact/9/index.html']
invalid form id: '../etc'
```

Тест для нього пишеться з `tmp_path` і нічого не мокає: файлова система в тимчасовій директорії швидка й справжня, тож перевіряються реальні файли, а не виклики. Нижче тест у тому вигляді, у якому він ляже в `capstone/tests/test_publisher.py`; запускався локально через pytest з класом у модулі `formbuilder.publisher`.

```python
from pathlib import Path

import pytest

from formbuilder.publisher import StaticPublisher


def test_publish_writes_index_and_assets(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("init()", encoding="utf-8")

    index = StaticPublisher(tmp_path / "out").publish("contact", 1, "<main></main>", assets)

    assert index == tmp_path / "out" / "contact" / "1" / "index.html"
    assert index.read_text(encoding="utf-8") == "<main></main>"
    assert (index.parent / "assets" / "app.js").is_file()
    assert [p.name for p in index.parent.glob(".*.tmp")] == []


def test_prune_keeps_latest_versions_numerically(tmp_path: Path) -> None:
    publisher = StaticPublisher(tmp_path, keep=2)
    for version in [9, 10, 11]:
        publisher.publish("contact", version, f"v{version}")
    assert sorted(p.name for p in (tmp_path / "contact").iterdir()) == ["10", "11"]


@pytest.mark.parametrize("form_id", ["..", "a/b", "", "../etc"])
def test_rejects_unsafe_form_id(tmp_path: Path, form_id: str) -> None:
    with pytest.raises(ValueError, match="invalid form id"):
        StaticPublisher(tmp_path).publish(form_id, 1, "<p>")
    assert list(tmp_path.iterdir()) == []
```

```text
......                                                                   [100%]
6 passed in 0.02s
```

> **Для капстоуну.** У m6-l06 CLI `formbuilder build config.json --out dist/` створить `StaticPublisher(Path(args.out))`, а в m7-l03 воркер викликатиме `publish` після рендеру. Поки публікація синхронна; асинхронний воркер викличе її через `await asyncio.to_thread(publisher.publish, ...)`, бо файлові операції в Python блокуючі (m5-l05, m5-l08).

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Читання без `encoding`, як `fs.readFileSync(p)`.** У Node без кодування ви отримуєте `Buffer` і бачите це одразу. У Python отримуєте `str`, декодований кодуванням локалі, і помилку побачить колега на Windows через місяць. Правильно: `encoding="utf-8"` у кожному `read_text`, `write_text`, `open` у текстовому режимі.

   ```python
   text = path.read_text()                   # cp1251 на українській Windows
   text = path.read_text(encoding="utf-8")   # однаково скрізь
   ```

2. **Шляхи рядками, як з `path.join`.** `f"{out}/{form_id}/index.html"`, `os.path.join` або, гірше, `+ "/"`. Правильно: `Path` і `/`, а рядок лише на межі з API, яке справді вимагає `str`.

   ```python
   index = out / form_id / str(version) / "index.html"
   ```

3. **`fs.existsSync` перед кожною операцією.** `if path.exists(): path.read_text(...)` має вікно для гонки і не відрізняє директорію від файлу. Правильно: EAFP, операція одразу й `except FileNotFoundError`; для видалення `unlink(missing_ok=True)`, для створення `mkdir(exist_ok=True)`.

   ```python
   try:
       text = path.read_text(encoding="utf-8")
   except FileNotFoundError:
       text = "{}"
   ```

4. **Очікування `fs.promises` і `await` на файлах.** У Python файловий I/O синхронний, `await path.read_text()` не існує, а виклик в `async def` блокує event loop. Правильно: у корутині `await asyncio.to_thread(path.read_text, encoding="utf-8")` або бібліотека `aiofiles`; для коротких локальних файлів часто прийнятний і синхронний виклик.

   ```python
   html = await asyncio.to_thread(index.read_text, encoding="utf-8")
   ```

5. **Прямий `writeFileSync` у файл, який хтось читає.** `write_text` обрізає файл до запису, і сервер віддає половину сторінки. Правильно: тимчасовий файл у тій самій директорії і `replace`.

   ```python
   tmp = path.with_name(f".{path.name}.tmp")
   tmp.write_text(html, encoding="utf-8")
   tmp.replace(path)
   ```

6. **Несортований результат `glob` у тестах і виводі.** Звичка бачити на своїй машині алфавітний порядок і вважати його гарантованим. Правильно: `sorted(...)` завжди, коли порядок видно назовні.

   ```python
   configs = sorted(root.rglob("*.json"))
   ```

7. **`root / user_input` без перевірки.** Очікують поведінку `path.join`, а абсолютний шлях праворуч відкидає корінь, і `..` виводить назовні. Правильно: `resolve()` обох і `is_relative_to`.

   ```python
   target = (root.resolve() / user_path).resolve()
   if not target.is_relative_to(root.resolve()):
       raise ValueError(user_path)
   ```

8. **`Path(__file__)` для файлів пакета.** Переносять `__dirname` у бібліотечний код. Працює в репозиторії, ламається в zip-пакеті чи замороженому бінарнику. Правильно: `importlib.resources.files("formbuilder") / "templates"`.

   ```python
   from importlib.resources import files
   page = (files("formbuilder") / "templates" / "page.html").read_text(encoding="utf-8")
   ```

## Підсумок

- Шлях це `Path`, а не рядок: `/` склеює, `.name`, `.stem`, `.suffix`, `.parent`, `.parts` розбирають, і все це без звернення до диска.
- Відносний шлях рахується від `cwd`; файли поруч із кодом через `Path(__file__).parent`, файли пакета через `importlib.resources.files`.
- `resolve()` іде на диск, схлопує `..` і розкриває symlink-и; `absolute()` і конструктор цього не роблять.
- `encoding="utf-8"` у кожному текстовому читанні й записі; без нього кодування локалі, на українській Windows `cp1251`.
- `open` лише з `with`; режими `r`, `w` (обрізає одразу), `a`, `x`, плюс `b` для `bytes`; `newline` керує перекладом `\r\n`.
- `iterdir`, `glob`, `rglob`, `walk` віддають записи в порядку файлової системи і включно з дотфайлами; результат сортують.
- Один файл чи порожня директорія це методи `Path`; копії, дерева, архіви це `shutil` (`copy2`, `copytree(dirs_exist_ok=True)`, `rmtree`, `move`).
- Помилки ОС це нащадки `OSError` за кодами `errno`; ловіть конкретний клас і працюйте EAFP замість `exists()` перед операцією.
- Атомарний запис: `mkstemp(dir=path.parent)`, запис, `fsync`, `replace`; тимчасовий файл поруч, бо `rename` атомарний лише в межах однієї файлової системи.
- Шлях від користувача: `resolve()` і кореня, і цілі, потім `is_relative_to`; ніколи не склеювати й не порівнювати шляхи рядками.

## Що далі

Наступний урок m6-l02 про формати: `json`, `csv`, `tomllib`, `yaml`. Усе читання там іде через `Path` і `open` з цього уроку, а `newline=""` для CSV і `utf-8-sig` для Excel отримують своє повне пояснення. `StaticPublisher` повернеться в m6-l06 як частина CLI `formbuilder build`, а в m6-l05 той самий `tmp_path` знадобиться для фейкового скрипта-рендерера, який викликається через `subprocess`.
