---
id: m4-l07
module: m4-oop
title: "Контекстні менеджери: with, contextmanager"
summary: "Учень пише власні контекстні менеджери класом і через contextlib.contextmanager, розуміє протокол __enter__/__exit__ включно з придушенням винятків, керує динамічним набором ресурсів через ExitStack, знає готові менеджери стандартної бібліотеки і відрізняє одноразові, повторні й реентерабельні менеджери."
duration_min: 75
prerequisites: [m4-l06]
---

## Ресурс треба звільнити на кожному шляху: від `try/finally` до `with`

Файл, блокування, тимчасова директорія, змінений `cwd`: усе це треба повернути назад і після успіху, і після винятку, і після раннього `return`. З m1-l11 ви знаєте інструмент, який це гарантує, `try/finally`. Він працює, але має дві вади: захоплення й звільнення ресурсу розірвані в коді, і цю пару треба правильно повторити в кожному місці використання.

```python
import tempfile
from pathlib import Path

path = Path(tempfile.mkdtemp()) / "form.json"
path.write_text('{"title": "Contact"}', encoding="utf-8")

def read_config(path: Path) -> str:
    f = open(path, encoding="utf-8")
    try:
        return f.read()
    finally:
        f.close()

print(read_config(path))
```

```text
{"title": "Contact"}
```

"Правильно повторити" не перебільшення. Найчастіша помилка: захоплення ресурсу всередині `try`. Якщо `open` впав, змінна `f` так і не з'явилась, і `finally` падає вже на ній, а справжня причина, `FileNotFoundError`, опиняється в ланцюжку "During handling of the above exception" вище в traceback.

```python
import tempfile
from pathlib import Path

def read_config_broken(path: Path) -> str:
    try:
        f = open(path, encoding="utf-8")
        return f.read()
    finally:
        f.close()

read_config_broken(Path(tempfile.mkdtemp()) / "missing.json")
```

```text
UnboundLocalError: cannot access local variable 'f' where it is not associated with a value
```

`with` забирає цю механіку в сам об'єкт. Об'єкт, який уміє "увійти" і "вийти", називається контекстним менеджером (context manager, офіційний термін документації), а `with` гарантує, що вихід буде викликаний, як би не завершився блок. Файл, повернутий `open`, такий менеджер: на виході він закривається сам.

```python live
import tempfile
from pathlib import Path

path = Path(tempfile.mkdtemp()) / "form.json"
path.write_text('{"title": "Contact"}', encoding="utf-8")

with open(path, encoding="utf-8") as f:
    print(f.read())
    print("inside:", f.closed)
print("after:", f.closed)

try:
    with open(path, encoding="utf-8") as f:
        int(f.read())
except ValueError as e:
    print("error:", type(e).__name__)
print("after error:", f.closed)
```

```text
{"title": "Contact"}
inside: False
after: True
error: ValueError
after error: True
```

Що відбувається по кроках. Вираз після `with` обчислюється, на результаті викликається `__enter__`, і те, що він повернув, прив'язується до імені після `as`. Потім виконується тіло. Після тіла викликається `__exit__`: при нормальному виході з трьома `None`, при винятку з інформацією про виняток. Сам виняток після `__exit__` летить далі, якщо менеджер не вирішив інакше; як він це вирішує, у наступному розділі.

У TypeScript 5.2 з'явилось те саме під назвою explicit resource management: об'єкт реалізує `Symbol.dispose`, а оголошення `using` гарантує його виклик на виході з блоку.

```ts
class TempDir implements Disposable {
  constructor(readonly path: string) { console.log("create", path); }
  [Symbol.dispose]() { console.log("remove", this.path); }
}

{
  using dir = new TempDir("/tmp/build");
  console.log("render into", dir.path);
}
// dir тут не існує
```

```python
class TempDir:
    def __init__(self, path: str) -> None:
        self.path = path
        print("create", path)

    def __enter__(self) -> "TempDir":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        print("remove", self.path)

with TempDir("/tmp/build") as dir_:
    print("render into", dir_.path)
print(dir_.path)
```

```text
create /tmp/build
render into /tmp/build
remove /tmp/build
/tmp/build
```

Розходжень три. `using` прив'язаний до блокового scope і змінна зникає разом з блоком; `with` scope не створює, `dir_` живе далі, а ресурс за нею вже звільнений. `[Symbol.dispose]()` не отримує винятку з блоку і не може на нього вплинути, а `__exit__` бачить виняток і може його проковтнути. І хронологія: `with` з'явився в Python 2.5 у 2006 році (PEP 343), а пропозиція TC39 прямо називає Python серед prior art; `DisposableStack` повторює `contextlib.ExitStack`, `await using` повторює `async with`. Обидва нижче в цьому уроці.

> **Пастка.** `with` не створює scope, як і `for` (m1-l06). Ім'я після `as` лишається доступним після блоку і вказує на звільнений ресурс. Читання закритого файлу дає не `NameError`, а `ValueError`.

```python
import io

with io.StringIO("data") as f:
    pass
print(f.closed)
f.read()
```

```text
True
ValueError: I/O operation on closed file
```

<!-- task: q1 -->

## Протокол: `__enter__` і `__exit__`

Контекстний менеджер це будь-який об'єкт, у класі якого є два dunder-методи (dunder від "double underscore", жаргон спільноти; детально в m4-l02). Документація називає цю пару протоколом контекстного менеджера (context management protocol). `__enter__(self)` повертає значення для `as`, найчастіше `self`, але не обов'язково. `__exit__(self, exc_type, exc, tb)` отримує клас винятку, сам виняток і traceback, або три `None`, якщо блок завершився нормально.

```python live
class Tracer:
    def __enter__(self):
        print("__enter__")
        return "value for as"

    def __exit__(self, exc_type, exc, tb):
        print("__exit__:", exc_type, repr(exc), type(tb).__name__)
        return False

with Tracer() as value:
    print("body:", value)

try:
    with Tracer():
        raise KeyError("title")
except KeyError as e:
    print("caught outside:", repr(e))
```

```text
__enter__
body: value for as
__exit__: None None NoneType
__enter__
__exit__: <class 'KeyError'> KeyError('title') traceback
caught outside: KeyError('title')
```

> **Під капотом.** `with` розгортається компілятором приблизно в такий код (PEP 343). Методи шукаються на класі, а не на екземплярі, як і всі спеціальні методи; виняток з тіла передається в `__exit__`, і якщо той повернув хибне значення, кидається далі тим самим `raise`. Об'єкт без цих методів дає `TypeError` ще до входу в блок: словник, хоч і схожий на JS-об'єкт "з чимось", менеджером не є.

```python
class Tracer:
    def __enter__(self):
        print("enter")
        return 42

    def __exit__(self, exc_type, exc, tb):
        print("exit", exc_type)
        return False

def run_with(mgr, body):
    enter = type(mgr).__enter__
    exit_ = type(mgr).__exit__
    value = enter(mgr)
    try:
        body(value)
    except BaseException as e:
        if not exit_(mgr, type(e), e, e.__traceback__):
            raise
    else:
        exit_(mgr, None, None, None)

run_with(Tracer(), lambda value: print("body", value))

with {"title": "Contact"} as config:
    pass
```

```text
enter
body 42
exit None
TypeError: 'dict' object does not support the context manager protocol
```

Перший практичний менеджер: `Timer`, який міряє тривалість блоку. Годинник передається параметром: у продакшні це `time.perf_counter`, у прикладі й тестах фальшивий годинник, який щоразу віддає час на 0.25 с більший. Так вивід детермінований, і це той самий прийом ін'єкції залежності, що в m4-l08. Тривалість пишеться в атрибут, тож вона доступна після блоку через ім'я з `as`.

```python live
import time
from itertools import count
from types import TracebackType
from typing import Self

class Timer:
    def __init__(self, label: str, clock=time.perf_counter) -> None:
        self.label = label
        self.clock = clock
        self.elapsed: float | None = None

    def __enter__(self) -> Self:
        self.start = self.clock()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.elapsed = self.clock() - self.start
        status = "ok" if exc_type is None else f"failed: {exc_type.__name__}"
        print(f"{self.label}: {self.elapsed:.2f}s {status}")

fake_clock = count(start=0.0, step=0.25).__next__

with Timer("validate", clock=fake_clock) as t:
    pass
print("elapsed after block:", t.elapsed)

try:
    with Timer("render", clock=fake_clock):
        raise RuntimeError("template missing")
except RuntimeError as e:
    print("caught:", e)
```

```text
validate: 0.25s ok
elapsed after block: 0.25
render: 0.25s failed: RuntimeError
caught: template missing
```

`__exit__` тут повертає `None`, і це свідомо: `None` хибне, тож виняток летить далі. Анотація `-> None` теж має значення для mypy: якщо `__exit__` анотовано як `-> bool`, перевірка типів вважає, що менеджер може проковтнути виняток, і по-іншому аналізує досяжність коду після `with`. Менеджер, який нічого не ковтає, анотують `-> None`.

`__enter__` не зобов'язаний повертати `self`. `ChangeDir` нижче змінює робочу директорію і повертає попередню, бо саме вона цікава коду всередині блоку. Стан між входом і виходом живе в атрибутах екземпляра. У стандартній бібліотеці з 3.11 є готовий `contextlib.chdir`, а клас тут для того, щоб побачити, що за ним стоїть.

```python
import os
import tempfile

class ChangeDir:
    def __init__(self, path: str) -> None:
        self.path = path

    def __enter__(self) -> str:
        self.previous = os.getcwd()
        os.chdir(self.path)
        return self.previous

    def __exit__(self, exc_type, exc, tb) -> None:
        os.chdir(self.previous)

start = os.getcwd()
target = os.path.realpath(tempfile.mkdtemp())

with ChangeDir(target) as previous:
    print(os.getcwd() == target, previous == start)

try:
    with ChangeDir(target):
        raise OSError("disk full")
except OSError:
    pass
print(os.getcwd() == start)
```

```text
True True
True
```

<!-- task: t1 -->

Тепер друга половина протоколу. Якщо `__exit__` повертає істинне значення, виняток вважається обробленим: `with` його ковтає, і виконання продовжується з рядка після блоку. Хибне значення, включно з `None` за замовчуванням, означає "кидай далі". Менеджер нижче ковтає лише `KeyError` і його нащадків.

```python live
class IgnoreMissing:
    def __enter__(self) -> None:
        return None

    def __exit__(self, exc_type, exc, tb) -> bool:
        return exc_type is not None and issubclass(exc_type, KeyError)

config = {"title": "Contact"}
with IgnoreMissing():
    print(config["title"])
    print(config["label"])
    print("not reached")
print("after with")

with IgnoreMissing():
    int("x")
```

```text
Contact
after with
ValueError: invalid literal for int() with base 10: 'x'
```

> **Пастка.** Проковтнутий виняток не означає "продовжити тіло з наступного рядка". Тіло обривається там, де стався виняток, як у `try`, а `with` лише не кидає його далі. `print("not reached")` вище не виконався. Це аналог порожнього `catch {}`, і зловживати ним так само шкідливо.

> **Пастка.** Python перевіряє truthiness результату `__exit__`, а не рівність `True`. `return self`, `return "done"` чи `return len(log)` з ненульовою довжиною мовчки ковтають будь-який виняток з тіла. Повертайте або `None`, або явний `bool`.

<!-- task: q2 -->

<!-- task: t2 -->

## `contextlib.contextmanager`: менеджер з генератора

Клас з двома методами для кожного менеджера громіздкий: стан розкиданий по атрибутах, вхід і вихід у різних методах. `contextlib.contextmanager` перетворює на менеджер функцію з одним `yield`. Код до `yield` це `__enter__`, значення `yield` іде в `as`, код після `yield` це `__exit__`. Функція з `yield` у Python генераторна (детально в m5-l02), і саме це дозволяє їй "заснути" посередині, поки виконується тіло `with`.

```python live
from contextlib import contextmanager

@contextmanager
def tag(name: str):
    print(f"<{name}>")
    yield name.upper()
    print(f"</{name}>")

with tag("form") as value:
    print("body", value)

try:
    with tag("form"):
        raise ValueError("bad field")
except ValueError:
    print("caught")
```

```text
<form>
body FORM
</form>
<form>
caught
```

У другому випадку закривального тегу немає. Причина в механізмі: `__exit__` такого менеджера при винятку не "продовжує" генератор, а вкидає виняток у нього через `gen.throw(exc)`, і виняток з'являється в рядку `yield`, наче його кинув сам `yield`. Код після `yield` пропускається, як будь-який код після рядка з винятком. Без винятку `__exit__` просто робить `next(gen)`, і генератор доходить до кінця.

> **Пастка.** Генераторний менеджер без `try/finally` навколо `yield` не прибирає за собою при винятку. Це найчастіша помилка в самописних менеджерах, і вона не видна, поки тіло не впаде. Прибирання завжди в `finally`.

```python live
from contextlib import contextmanager

@contextmanager
def tag(name: str):
    print(f"<{name}>")
    try:
        yield name.upper()
    finally:
        print(f"</{name}>")

try:
    with tag("form"):
        raise ValueError("bad field")
except ValueError:
    print("caught")
```

```text
<form>
</form>
caught
```

Раз виняток з'являється в рядку `yield`, його можна там і ловити. `except` навколо `yield` бачить винятки з тіла `with`: можна перекласти технічний виняток у доменний через `raise ... from` (m1-l11), можна записати й кинути далі через голий `raise`. Якщо `except` завершився без `raise`, генератор дійшов до кінця, і менеджер ковтає виняток; це еквівалент `return True` у `__exit__`.

```python live
from contextlib import contextmanager

class ConfigError(Exception):
    pass

@contextmanager
def config_section(name: str):
    try:
        yield
    except KeyError as e:
        raise ConfigError(f"{name}: missing key {e}") from e

@contextmanager
def ignore(*exc_types: type[BaseException]):
    try:
        yield
    except exc_types as e:
        print("ignored", repr(e))

config = {"title": "Contact", "fields": [{"id": "email"}]}
try:
    with config_section("fields[0]"):
        field = config["fields"][0]
        print("id:", field["id"])
        print("type:", field["type"])
except ConfigError as e:
    print(repr(e))
    print("cause:", repr(e.__cause__))

with ignore(KeyError, IndexError):
    config["fields"][5]
print("after ignore")
```

```text
id: email
ConfigError("fields[0]: missing key 'type'")
cause: KeyError('type')
ignored IndexError('list index out of range')
after ignore
```

> **Під капотом.** `@contextmanager` повертає функцію, кожен виклик якої створює новий об'єкт `_GeneratorContextManager` зі свіжим генератором усередині. Його `__enter__` викликає `next(gen)` і повертає значення `yield`. `__exit__` без винятку викликає `next(gen)` ще раз і чекає `StopIteration`; якщо генератор віддав другий `yield`, це `RuntimeError: generator didn't stop`. Генератор, який не дійшов до `yield` взагалі, дає `RuntimeError: generator didn't yield`. Звідси правило: рівно один `yield` на кожному шляху виконання.

```python
from contextlib import contextmanager

@contextmanager
def two_yields():
    yield 1
    yield 2

@contextmanager
def no_yield(enabled: bool):
    if enabled:
        yield

print(type(two_yields()).__name__)

for cm in (two_yields(), no_yield(False)):
    try:
        with cm:
            pass
    except RuntimeError as e:
        print("RuntimeError:", e)
```

```text
_GeneratorContextManager
RuntimeError: generator didn't stop
RuntimeError: generator didn't yield
```

Чому в реальному коді ця форма найчастіша. Вхід, тіло й вихід читаються згори вниз в одній функції, так само як `try/finally`, який вона й ховає. Стан живе в локальних змінних, а не в атрибутах `self`. Параметри менеджера це параметри функції. `Timer` з попереднього розділу в генераторній формі вміщається в десяток рядків; результат, який потрібен після блоку, віддається через `yield` як змінюваний об'єкт.

```python live
import time
from collections.abc import Iterator
from contextlib import contextmanager
from itertools import count

@contextmanager
def timer(label: str, clock=time.perf_counter) -> Iterator[dict[str, float]]:
    result: dict[str, float] = {}
    start = clock()
    try:
        yield result
    finally:
        result["elapsed"] = clock() - start
        print(f"{label}: {result['elapsed']:.2f}s")

fake_clock = count(start=0.0, step=0.5).__next__
with timer("publish", clock=fake_clock) as stats:
    pass
print(stats)
```

```text
publish: 0.50s
{'elapsed': 0.5}
```

Клас лишається кращим вибором у трьох випадках: менеджер сам є ресурсом з власними методами (файл, з'єднання, клієнт), потрібен менеджер, який можна використати кілька разів (розділ про повторне використання нижче), або є складний стан, з яким працюють і всередині блоку, і після. Тип повернення генераторного менеджера анотують як `Iterator[T]`, де `T` це тип значення `yield`.

<!-- task: t3 -->

<!-- task: t4 -->

## Кілька менеджерів, вкладеність і `ExitStack`

Кілька менеджерів можна перелічити в одному `with` через кому. Це рівно те саме, що вкладені `with`: входи йдуть зліва направо, виходи у зворотному порядку, як стек. Якщо падає `__enter__` другого менеджера, перший уже відкритий і закривається, а `__exit__` другого не викликається: менеджер, який не увійшов, не виходить.

```python live
from contextlib import contextmanager

@contextmanager
def resource(name: str, fail: bool = False):
    print("open", name)
    if fail:
        raise OSError(f"cannot open {name}")
    try:
        yield name
    finally:
        print("close", name)

with resource("a") as a, resource("b") as b:
    print("body", a, b)

try:
    with resource("a"), resource("b", fail=True), resource("c"):
        print("body")
except OSError as e:
    print("error:", e)
```

```text
open a
open b
body a b
close b
close a
open a
open b
close a
error: cannot open b
```

Довгий список менеджерів з 3.10 можна взяти в дужки і розбити по рядках з кінцевою комою, як аргументи функції. До 3.10 для цього були лише `\` в кінці рядка або вкладені `with`. Вкладений `with` потрібен і зараз, коли між двома входами є код: другий ресурс залежить від того, що дав перший.

```python
from contextlib import contextmanager

@contextmanager
def resource(name: str):
    print("open", name)
    try:
        yield name
    finally:
        print("close", name)

with (
    resource("header") as header,
    resource("body") as body,
):
    print("render", header, body)

with resource("config") as cfg:
    output = f"{cfg}.html"
    with resource(output) as out:
        print("write", out)
```

```text
open header
open body
render header body
close body
close header
open config
open config.html
write config.html
close config.html
close config
```

Коли кількість ресурсів відома лише під час виконання, `with` через кому не допоможе, а `[open(p) for p in paths]` протікає: якщо третій `open` упав, перші два ніхто явно не закриє, і вони чекатимуть збирача сміття. Для цього `contextlib.ExitStack`. Це менеджер-стек: `enter_context(cm)` входить у менеджер і запам'ятовує його вихід, `callback(fn, *args)` реєструє довільну функцію прибирання. На виході зі `with ExitStack()` усе зареєстроване виконується у зворотному порядку, і при помилці посередині закривається лише те, що встигло відкритись.

```python live
from contextlib import ExitStack, contextmanager

@contextmanager
def resource(name: str, fail: bool = False):
    print("open", name)
    if fail:
        raise OSError(f"cannot open {name}")
    try:
        yield name
    finally:
        print("close", name)

names = ["header", "fields", "footer"]
with ExitStack() as stack:
    opened = [stack.enter_context(resource(n)) for n in names]
    stack.callback(print, "callback: rendered", len(opened))
    print("body", opened)

try:
    with ExitStack() as stack:
        for n in names:
            stack.enter_context(resource(n, fail=n == "fields"))
except OSError as e:
    print("error:", e)
```

```text
open header
open fields
open footer
body ['header', 'fields', 'footer']
callback: rendered 3
close footer
close fields
close header
open header
open fields
close header
error: cannot open fields
```

> **JS-аналог.** `ExitStack` це `DisposableStack` з TS 5.2: `stack.use(x)` відповідає `enter_context`, `stack.defer(fn)` відповідає `callback`, обидва звільняють у зворотному порядку. Різниця та сама, що й між `using` і `with`: `ExitStack` передає виняток кожному `__exit__` і дає менеджерам у стеку шанс його проковтнути.

<!-- task: t5 -->

## Готові менеджери стандартної бібліотеки

Більшість менеджерів у реальному коді не пишуть, а беруть готовими. `contextlib.suppress(*exceptions)` ковтає перелічені винятки, і це ідіоматична форма "видалити, якщо є": EAFP без порожнього `except`. У JS для того самого пишуть `try { fs.unlinkSync(p) } catch (e) { if (e.code !== "ENOENT") throw e }`. `redirect_stdout(stream)` тимчасово підміняє `sys.stdout`, і весь `print` іде в заданий потік; корисно для чужого коду, який друкує, а не повертає.

```python live
import io
import os
import tempfile
from contextlib import redirect_stdout, suppress

path = os.path.join(tempfile.mkdtemp(), "build.lock")
with suppress(FileNotFoundError):
    os.remove(path)
print("lock removed or never existed")

def legacy_render() -> None:
    print("<form>")
    print("</form>")

buffer = io.StringIO()
with redirect_stdout(buffer):
    legacy_render()
print(repr(buffer.getvalue()))
```

```text
lock removed or never existed
'<form>\n</form>\n'
```

> **Пастка.** `redirect_stdout` підміняє глобальний `sys.stdout` для всього процесу, а не лише для коду в блоці. Інші потоки й корутини, що друкують у цей момент, теж пишуть у ваш буфер. Для бібліотечного коду правильніше приймати потік параметром, а `redirect_stdout` лишити для скриптів і тестів.

`closing(obj)` робить менеджер з будь-якого об'єкта з методом `close()`, який сам протокол не реалізує: старі API, з'єднання сторонніх бібліотек. `nullcontext(value)` це менеджер, який нічого не робить і віддає `value` в `as`. Він потрібен для умовного менеджера: функція приймає або шлях, або вже відкритий потік, і потік, який їй дали, вона не повинна закривати.

```python live
import io
from contextlib import closing, nullcontext

class Connection:
    def __init__(self, name: str) -> None:
        self.name = name

    def close(self) -> None:
        print("close", self.name)

with closing(Connection("sqlite")) as conn:
    print("query via", conn.name)

def read_text(source: str | io.StringIO) -> str:
    cm = open(source, encoding="utf-8") if isinstance(source, str) else nullcontext(source)
    with cm as f:
        return f.read()

stream = io.StringIO("from memory")
print(read_text(stream), "| closed:", stream.closed)
```

```text
query via sqlite
close sqlite
from memory | closed: False
```

`tempfile.TemporaryDirectory()` створює директорію, віддає в `as` її шлях рядком і видаляє з усім вмістом на виході, зокрема після винятку (pathlib і tempfile детально в m6-l01). `contextlib.chdir(path)` з 3.11 тимчасово змінює робочу директорію, як `ChangeDir` вище. У прикладі обидва стоять в одному `with`, і другий використовує ім'я, прив'язане першим; порядок виходу гарантує, що спершу повернеться `cwd`, а вже потім зникне директорія. `threading.Lock` теж менеджер: `with lock:` це `acquire()` на вході й `release()` на виході, і це єдина нормальна форма роботи з блокуванням, бо забутий `release` вішає всі потоки (потоки в m5-l08).

```python live
import os
import tempfile
import threading
from contextlib import chdir
from pathlib import Path

with tempfile.TemporaryDirectory(prefix="build-") as tmp, chdir(tmp):
    Path("index.html").write_text("<form></form>", encoding="utf-8")
    print(type(tmp).__name__, os.listdir("."))
print("exists after:", Path(tmp).exists())

lock = threading.Lock()
with lock as acquired:
    print("acquired:", acquired, "| locked:", lock.locked())
print("locked after:", lock.locked())
```

```text
str ['index.html']
exists after: False
acquired: True | locked: True
locked after: False
```

`pytest.raises` з m3-l03 це теж контекстний менеджер, і тепер видно, як він влаштований. Його `__exit__` повертає `True`, якщо тип винятку підходить, тобто ковтає очікуваний виняток, а якщо винятку не було, сам кидає `Failed: DID NOT RAISE`. Об'єкт з `as` заповнюється на виході, тому перевірки `exc_info` пишуть після блоку, і це працює саме тому, що `with` не створює scope. Приклад запускається локально, у браузері pytest немає.

```python
import pytest

with pytest.raises(KeyError, match="label") as exc_info:
    {"title": "Contact"}["label"]
print(exc_info.type.__name__, exc_info.value)

try:
    with pytest.raises(KeyError):
        pass
except BaseException as e:
    print(type(e).__name__, e)
```

```text
KeyError 'label'
Failed DID NOT RAISE KeyError
```

## Одноразові, повторні й реентерабельні менеджери

Документація `contextlib` ділить менеджери на три види. Одноразовий (single use) можна використати в `with` лише один раз. Повторний (reusable) можна використовувати багато разів послідовно. Реентерабельний (reentrant) можна використати ще раз усередині власного `with`, тобто вкладено. Усі три терміни офіційні, з розділу "Single use, reusable and reentrant context managers".

Генераторний менеджер одноразовий: генератор проходить свій `yield` один раз і закінчується. Проблеми не видно, поки кожен `with` викликає функцію заново, бо кожен виклик створює новий об'єкт. Вона з'являється, коли об'єкт менеджера зберегли в змінну чи атрибут і увійшли в нього вдруге. Повідомлення про помилку в 3.12 не допомагає зрозуміти причину.

```python live
from contextlib import contextmanager

@contextmanager
def tag(name: str):
    print(f"<{name}>")
    try:
        yield
    finally:
        print(f"</{name}>")

with tag("p"):
    pass
with tag("p"):
    pass

cm = tag("li")
with cm:
    pass
with cm:
    pass
```

```text
<p>
</p>
<p>
</p>
<li>
</li>
AttributeError: '_GeneratorContextManager' object has no attribute 'args'
```

Клас, який заново ініціалізує стан у `__enter__`, повторний: `Timer` з початку уроку можна використати скільки завгодно разів підряд. Але він не реентерабельний. Якщо увійти в той самий екземпляр вкладено, другий `__enter__` перезапише `self.start`, і зовнішній блок отримає неправильний час. Виправлення: тримати стан входів у стеку, по одному запису на кожен вхід.

```python live
from itertools import count

class Stopwatch:
    def __init__(self, clock) -> None:
        self.clock = clock

    def __enter__(self) -> None:
        self.start = self.clock()

    def __exit__(self, *exc) -> None:
        print(f"elapsed {self.clock() - self.start:.2f}")

class ReentrantStopwatch:
    def __init__(self, clock) -> None:
        self.clock = clock
        self.starts: list[float] = []

    def __enter__(self) -> None:
        self.starts.append(self.clock())

    def __exit__(self, *exc) -> None:
        print(f"elapsed {self.clock() - self.starts.pop():.2f}")

for cls in (Stopwatch, ReentrantStopwatch):
    sw = cls(count(start=0.0, step=1.0).__next__)
    with sw:
        with sw:
            pass
```

```text
elapsed 1.00
elapsed 2.00
elapsed 1.00
elapsed 3.00
```

У стандартній бібліотеці та сама різниця між `threading.Lock` і `threading.RLock`. `Lock` не реентерабельний: вкладений `with lock:` у тому самому потоці чекатиме сам на себе вічно. `RLock` рахує входи власника і пускає його повторно. У прикладі замість справжнього дедлоку `acquire(blocking=False)`, який повертає `False` там, де вкладений `with` завис би.

```python
import threading

lock = threading.Lock()
with lock:
    print("Lock again:", lock.acquire(blocking=False))

rlock = threading.RLock()
with rlock:
    print("RLock again:", rlock.acquire(blocking=False))
    rlock.release()
```

```text
Lock again: False
RLock again: True
```

Менеджер можна використати як декоратор: тоді все тіло функції стає блоком `with`. За це відповідає базовий клас `contextlib.ContextDecorator`. Менеджери з `@contextmanager` уже його нащадки, і ось тонкість: декоратор не входить в один і той самий одноразовий об'єкт, а перед кожним викликом функції створює новий, тому одноразовість тут не заважає. Власний клас стає декоратором через наслідування від `ContextDecorator`; тоді один екземпляр обслуговує всі виклики, тож він має бути повторним. Обмеження декораторної форми: функція не бачить значення з `as`. Декоратори як такі детально в m5-l04.

```python live
from contextlib import ContextDecorator, contextmanager

@contextmanager
def tag(name: str):
    print(f"<{name}>")
    try:
        yield
    finally:
        print(f"</{name}>")

@tag("li")
def render_item(text: str) -> None:
    print(text)

render_item("email")
render_item("phone")

class log_calls(ContextDecorator):
    def __init__(self, label: str) -> None:
        self.label = label

    def __enter__(self):
        print("enter", self.label)
        return self

    def __exit__(self, *exc) -> None:
        print("exit", self.label)

@log_calls("publish")
def publish(page: str) -> None:
    print("publishing", page)

publish("contact")
```

```text
<li>
email
</li>
<li>
phone
</li>
enter publish
publishing contact
exit publish
```

<!-- task: q3 -->

<!-- task: t6 -->

## Асинхронні менеджери: `async with`

Звичайний `__enter__` не може нічого чекати: якщо відкриття ресурсу асинхронне (HTTP-клієнт, пул з'єднань, запуск воркерів), потрібна асинхронна версія протоколу. `async with` викликає `__aenter__` і `__aexit__`, які є корутинами, і чекає їх через `await`. Генераторна форма та сама: `contextlib.asynccontextmanager` над `async def` з одним `yield`. Це прямий відповідник `await using` з TS 5.2.

```python live
import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def worker_pool(size: int):
    print("starting", size, "workers")
    await asyncio.sleep(0.01)
    try:
        yield [f"worker-{i}" for i in range(size)]
    finally:
        await asyncio.sleep(0.01)
        print("workers stopped")

async def main() -> None:
    async with worker_pool(2) as pool:
        print("using", pool)

asyncio.run(main())
```

```text
starting 2 workers
using ['worker-0', 'worker-1']
workers stopped
```

Асинхронний менеджер у звичайному `with` дає `TypeError` про відсутній протокол, а `async with` можливий лише всередині `async def`. Протокол `__aenter__`/`__aexit__`, асинхронні генератори й прибирання в них розібрані в m5-l06. У FastAPI цей самий декоратор описує життєвий цикл застосунку: код до `yield` виконується при старті сервера, після `yield` при зупинці (lifespan, m7-l01).

## Для капстоуну

Генерація сторінки FormBuilder працює з файлами: рендер пише проміжні файли в робочу директорію, і ця директорія має зникнути навіть тоді, коли рендер упав на середині. `build_workdir` створює директорію з префіксом, віддає `Path` і видаляє її у `finally`. Шаблони, кількість яких залежить від конфігу, відкриваються через `ExitStack`.

```python live
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path

@contextmanager
def build_workdir(prefix: str = "formbuilder-") -> Iterator[Path]:
    path = Path(tempfile.mkdtemp(prefix=prefix))
    try:
        yield path
    finally:
        shutil.rmtree(path)

templates = {"page.html": "<main>{body}</main>", "field.html": "<input name={id}>"}

with build_workdir() as workdir:
    for name, text in templates.items():
        (workdir / name).write_text(text, encoding="utf-8")
    with ExitStack() as stack:
        files = {name: stack.enter_context(open(workdir / name, encoding="utf-8")) for name in templates}
        print({name: f.read() for name, f in files.items()})
    print("all closed:", all(f.closed for f in files.values()))
    print(workdir.name.startswith("formbuilder-"))
print("exists after:", workdir.exists())

try:
    with build_workdir() as workdir:
        (workdir / "partial.html").write_text("<main>", encoding="utf-8")
        raise RuntimeError("render failed")
except RuntimeError as e:
    print("error:", e, "| exists:", workdir.exists())
```

```text
{'page.html': '<main>{body}</main>', 'field.html': '<input name={id}>'}
all closed: True
True
exists after: False
error: render failed | exists: False
```

Свій менеджер замість готового `TemporaryDirectory` тут виправданий тим, що в капстоуні до нього додасться політика: залишити директорію при помилці для діагностики, записати шлях у лог, перенести результат у `dist/` лише при успіху. Усе це ляже в ту саму функцію навколо `yield`, а код рендеру лишиться одним `with build_workdir() as workdir:`.

> **Для капстоуну.** `StageTimer` із завдання t6 це готовий вимірювач етапів генерації: `with timer.stage("validate"):`, `with timer.stage("render"):` і `@timer.stage("publish")` над функцією публікації. Звіт по етапах піде в лог воркера (m5-l09), а годинник-параметр дозволить тестувати його без реального часу. У m4-l08 той самий прийом стане ін'єкцією `clock` у `Pipeline`.

## Типові помилки JS-розробника

1. **Ручний `try/finally` у кожному місці використання.** Переносять звичку з JS, де до TS 5.2 іншого способу не було. Працює, але пара "захопити/звільнити" повторюється й рано чи пізно ламається. Правильно: `with` для готових ресурсів і власний `@contextmanager`, якщо та сама пара `try/finally` трапилась удруге.

   ```python
   lock.acquire()          # за звичкою
   try:
       update()
   finally:
       lock.release()

   with lock:              # правильно
       update()
   ```

2. **Очікування, що `with` створює scope.** Як `using` у блоці TS. Ім'я з `as` живе після блоку й вказує на закритий ресурс, а помилка буде `ValueError: I/O operation on closed file`, а не `NameError`. Правильно: усю роботу з ресурсом робити всередині блоку; значення, потрібні далі, копіювати в змінні.

   ```python
   with open(path, encoding="utf-8") as f:
       text = f.read()
   print(text)       # ок
   f.read()          # ValueError: I/O operation on closed file
   ```

3. **`yield` без `try/finally` у `@contextmanager`.** Пишуть "до" і "після" як у прикладі з документації і не перевіряють шлях з винятком. Виняток з'являється в рядку `yield`, і код після нього не виконується. Правильно: прибирання завжди у `finally`.

   ```python
   @contextmanager
   def workdir():
       path = Path(tempfile.mkdtemp())
       try:
           yield path
       finally:
           shutil.rmtree(path)
   ```

4. **Випадкове ковтання винятків.** `__exit__`, який повертає `self` чи будь-яке істинне значення, або `except Exception: pass` навколо `yield`. Тіло тихо обривається, помилка зникає. Правильно: `__exit__ -> None` для менеджерів, що нічого не ковтають; у генераторі після `except` або голий `raise`, або свідоме рішення ковтати конкретний тип.

   ```python
   def __exit__(self, exc_type, exc, tb) -> None:
       self.close()          # без return: None, виняток летить далі
   ```

5. **Повторне використання збереженого генераторного менеджера.** `self.section = tag("li")` у `__init__` і `with self.section:` у методі, який викликають двічі. Другий вхід падає з `AttributeError`, що нічого не пояснює. Правильно: зберігати фабрику, а не об'єкт, і викликати її в кожному `with`; або написати повторний менеджер класом.

   ```python
   self.section = lambda: tag("li")
   with self.section():
       ...
   ```

6. **Відкриття списку ресурсів comprehension-ом.** `[open(p) for p in paths]`, а потім `try/finally` з циклом закриття. Якщо падає третій `open`, список так і не створюється, і перші два файли ніхто явно не закриває: CPython закриє їх збирачем сміття з `ResourceWarning`, інші реалізації невідомо коли. Правильно: `ExitStack` і `enter_context` для кожного ресурсу.

   ```python
   with ExitStack() as stack:
       files = [stack.enter_context(open(p, encoding="utf-8")) for p in paths]
   ```

7. **`__del__` як деструктор або `FinalizationRegistry`.** Шукають місце, де "об'єкт сам себе прибере", і пишуть `__del__`. Момент його виклику не гарантований, у PyPy і при циклічних посиланнях він настає будь-коли або ніколи. Правильно: детерміноване звільнення через `with`; `__del__` не для ресурсів.

   ```python
   class Connection:
       def __enter__(self): return self
       def __exit__(self, *exc) -> None: self.close()
   ```

8. **`using` і `Symbol.dispose` як новинка, під яку треба шукати бібліотеку.** У Python протокол існує з 2006 року, і менеджерами вже є файли, блокування, тимчасові директорії, клієнти `httpx`, `pytest.raises`, `unittest.mock.patch`. Правильно: перед тим як писати `close()` вручну, перевірити, чи об'єкт підтримує `with`, і прочитати, що саме робить його `__exit__`. З'єднання `sqlite3` теж менеджер, але його `with` завершує транзакцію (commit або rollback), а не закриває з'єднання, тому для закриття `closing`.

   ```python
   import sqlite3
   from contextlib import closing
   with closing(sqlite3.connect(":memory:")) as conn:
       conn.execute("select 1")
   ```

## Підсумок

- `with` гарантує вихід з менеджера на кожному шляху: успіх, виняток, `return`, `break`. Це `try/finally`, упакований в об'єкт.
- Протокол: `__enter__` повертає значення для `as`; `__exit__(exc_type, exc, tb)` отримує три `None` або виняток.
- Істинний результат `__exit__` ковтає виняток, хибний (і `None`) кидає далі; тіло в будь-якому разі обривається на рядку з винятком.
- `@contextmanager`: генератор з рівно одним `yield`; виняток з тіла з'являється в рядку `yield`, тому прибирання в `finally`, обробка в `except`.
- Кілька менеджерів в одному `with` входять зліва направо й виходять справа наліво; дужки для багаторядкового списку з 3.10.
- `ExitStack` для динамічної кількості ресурсів: `enter_context`, `callback`, звільнення у зворотному порядку і лише того, що відкрилось.
- Готові: `suppress`, `redirect_stdout`, `closing`, `nullcontext`, `chdir`, `TemporaryDirectory`, `Lock`, `pytest.raises`.
- Генераторні менеджери одноразові, класи можуть бути повторними, реентерабельність вимагає стану на кожен вхід (`RLock`, а не `Lock`).
- Менеджер як декоратор через `ContextDecorator`; `@contextmanager` дає його безкоштовно і створює новий менеджер на кожен виклик.
- `with` не створює scope. `async with` і `@asynccontextmanager` для асинхронних ресурсів; `using` і `DisposableStack` у TS це той самий дизайн, запозичений з Python.

## Що далі

Наступний урок m4-l08 про композицію замість наслідування і про те, як GoF-патерни виглядають у Python. Контекстний менеджер там з'явиться як мовна форма патерну "захоплення ресурсу", а годинник-параметр з `Timer` і `StageTimer` як ін'єкція залежностей без фреймворку. Механізм `yield`, на якому стоїть `@contextmanager`, розбирається в m5-l02, а `async with` повністю в m5-l06.
