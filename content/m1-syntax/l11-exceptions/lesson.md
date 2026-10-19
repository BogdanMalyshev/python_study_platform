---
id: m1-l11
module: m1-syntax
title: "Винятки: try/except/else/finally, EAFP"
summary: "Учень ловить винятки за конкретним типом з урахуванням ієрархії, тримає try вузьким через else і finally, перекладає технічні винятки в доменні через raise from, пише власну ієрархію винятків, читає traceback з ланцюжками причин і обирає між EAFP та LBYL свідомо."
duration_min: 75
prerequisites: [m1-l10]
---

## Звичайні операції кидають винятки

Перше, що ламає інтуїцію JS-розробника, навіть не `try`, а кількість місць, де Python кидає виняток там, де JS мовчки повертає щось "порожнє". Звернення до відсутнього ключа, індекс за межами списку, атрибут на `None`, рядок, що не є числом: у JS це `undefined`, `NaN` або тихе приведення типів, у Python це виняток у тому самому рядку.

```ts
const config: Record<string, string> = { type: "text" };
const fields = ["email", "phone"];
config["label"];          // undefined
fields[99];               // undefined
Number("x");              // NaN
"age: " + 30;             // "age: 30"
1 / 0;                    // Infinity
```

```python
config = {"type": "text"}
print(config["label"])
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    print(config["label"])
          ~~~~~~^^^^^^^^^
KeyError: 'label'
```

Розходження принципове: JS віддає значення-маркер і дозволяє коду йти далі, тож `undefined` вилазить через десять рядків як `Cannot read properties of undefined`. Python зупиняється там, де сталася проблема, і називає її. Нижче повний набір повсякденних випадків; `try` тут лише для того, щоб показати всі вісім винятків в одному запуску.

```python live
config = {"type": "text"}
fields = ["email", "phone"]
label = config.get("label")

operations = [
    lambda: config["label"],
    lambda: fields[99],
    lambda: int("x"),
    lambda: config.label,
    lambda: label.upper(),
    lambda: label[0],
    lambda: "age: " + 30,
    lambda: 1 / 0,
]
for op in operations:
    try:
        op()
    except Exception as e:
        print(f"{type(e).__name__}: {e}")
```

```text
KeyError: 'label'
IndexError: list index out of range
ValueError: invalid literal for int() with base 10: 'x'
AttributeError: 'dict' object has no attribute 'label'
AttributeError: 'NoneType' object has no attribute 'upper'
TypeError: 'NoneType' object is not subscriptable
TypeError: can only concatenate str (not "int") to str
ZeroDivisionError: division by zero
```

Зверніть увагу на два рядки з `None`. Аналог JS-ного `TypeError: Cannot read properties of null` тут розпадається на два різні винятки: доступ до атрибута чи методу дає `AttributeError`, індексація дає `TypeError`. І словник не має атрибутів-ключів: `config.label` це `AttributeError`, а не `config["label"]`, як в об'єкті JS.

Коли відсутність значення нормальна, у мови є безпечні форми, які не кидають. `dict.get(key, default)` для словника, `getattr(obj, name, default)` для атрибута, `next(iterator, default)` для ітератора. Для індексу списку окремого `get` немає; там або перевірка довжини, або `try` (розділ про EAFP нижче). Для `int()` безпечної форми теж немає, і це перше завдання уроку.

```python live
class Field:
    type = "text"

config = {"type": "text"}
field = Field()

print(config.get("label"))
print(config.get("label", "Untitled"))
print(getattr(field, "label", "Untitled"))
print(hasattr(field, "type"))
print(next(iter([]), "empty"))
print(next(iter(["first", "second"]), "empty"))
```

```text
None
Untitled
Untitled
True
empty
first
```

> **Пастка.** `.get()` без значення за замовчуванням повертає `None` і цим повертає вам JS-поведінку разом з її проблемою: помилка переїжджає далеко від причини. `options = config.get("options")`, а через 30 рядків `options[0]` дає `TypeError: 'NoneType' object is not subscriptable` замість чесного `KeyError: 'options'` у тому місці, де ключа не виявилось. Якщо ключ зобов'язаний бути, пишіть `config["options"]`.

```python
config = {"type": "text"}
options = config.get("options")
# ... 30 рядків потому
print(options[0])
```

```text
Traceback (most recent call last):
  File "main.py", line 4, in <module>
    print(options[0])
          ~~~~~~~^^^
TypeError: 'NoneType' object is not subscriptable
```

## `except` за типом і шлях винятку крізь стек

У TypeScript `catch (e)` ловить усе, а `e` має тип `unknown` (у strict-режимі), тому фільтр за типом ви пишете руками через `instanceof` і не забуваєте кинути далі все інше. У Python фільтр стоїть у заголовку: `except ValueError` ловить лише `ValueError` і його нащадків, а все інше летить далі само, без жодного коду.

```ts
try {
  console.log(parseAge(raw));
} catch (e) {
  if (e instanceof RangeError) console.log("invalid:", e.message);
  else throw e;
}
```

```python live
def parse_age(raw: str) -> int:
    age = int(raw)
    if age < 0:
        raise ValueError(f"age must be >= 0, got {age}")
    return age

for raw in ["30", "abc", "-5"]:
    try:
        print(parse_age(raw))
    except ValueError as e:
        print("invalid:", e)
```

```text
30
invalid: invalid literal for int() with base 10: 'abc'
invalid: age must be >= 0, got -5
```

Розходження в тому, що неперехоплений тип у Python не потребує `else throw e`. Передайте `None`, і `int()` кине `TypeError`; гілка `except ValueError` його не бачить, тож він проходить крізь `try` так, ніби того не було, і зупиняє програму.

```python
def parse_age(raw: str) -> int:
    age = int(raw)
    if age < 0:
        raise ValueError(f"age must be >= 0, got {age}")
    return age

try:
    parse_age(None)
except ValueError as e:
    print("invalid:", e)
print("not reached")
```

```text
Traceback (most recent call last):
  File "main.py", line 8, in <module>
    parse_age(None)
  File "main.py", line 2, in parse_age
    age = int(raw)
          ^^^^^^^^
TypeError: int() argument must be a string, a bytes-like object or a real number, not 'NoneType'
```

Кілька типів з однаковою обробкою перелічують кортежем `except (TypeError, ValueError)`. Різна обробка означає кілька гілок `except` одна під одною: перевіряються зверху вниз, виконується перша, що підійшла, решта пропускаються. `as e` прив'язує сам об'єкт винятку. У нього є `e.args`, кортеж аргументів конструктора, і `str(e)`, текст повідомлення; `type(e).__name__` дає ім'я класу для логів.

```python live
def to_int(value: object) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError) as e:
        print(f"{type(e).__name__}: {e.args}")
        return None

print(to_int("42"))
print(to_int("4.2"))
print(to_int(None))


def read_value(fields: list[dict], index: int, key: str) -> str:
    try:
        return fields[index][key]
    except IndexError:
        return "no such field"
    except KeyError as e:
        return f"field has no key {e}"

fields = [{"id": "email", "type": "text"}]
print(read_value(fields, 0, "type"))
print(read_value(fields, 5, "type"))
print(read_value(fields, 0, "label"))
```

```text
42
ValueError: ("invalid literal for int() with base 10: '4.2'",)
None
TypeError: ("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'",)
None
text
no such field
field has no key 'label'
```

`str(e)` не завжди те, що ви очікуєте. Для одного аргументу це сам аргумент, для кількох це текст усього кортежу, а `KeyError` додає лапки, бо показує `repr` ключа. Тому `f"missing {e}"` для `KeyError` дає `missing 'label'` з лапками, а для повідомлень користувачу ключ краще брати з `e.args[0]`.

```python
e = KeyError("label")
print(e.args, str(e), repr(e))

e = ValueError("bad age", 42)
print(e.args, str(e))

e = ValueError("bad age")
print(e.args, str(e))
```

```text
('label',) 'label' KeyError('label')
('bad age', 42) ('bad age', 42)
('bad age',) bad age
```

> **Пастка.** Після m1-l06 ви знаєте, що блоки в Python не створюють scope, і змінна циклу живе після циклу. Ім'я з `except ... as e` поводиться навпаки: Python видаляє його в кінці гілки `except`. Якщо об'єкт винятку потрібен пізніше, присвойте його іншому імені всередині гілки.

```python
try:
    int("x")
except ValueError as e:
    print("caught:", e)
print(e)
```

```text
caught: invalid literal for int() with base 10: 'x'
Traceback (most recent call last):
  File "main.py", line 5, in <module>
    print(e)
          ^
NameError: name 'e' is not defined
```

> **Під капотом.** Виняток тримає посилання на свій traceback, traceback на кадр функції, а кадр на всі локальні змінні, серед яких і `e`. Це цикл посилань, який утримував би в пам'яті весь кадр до наступного проходу збирача сміття. Щоб цього не було, компілятор неявно дописує `del e` у кінець кожної гілки `except ... as e`.

Виняток, який ніхто не зловив у поточній функції, не "повертається" з неї: виконання функції обривається, і виняток піднімається до того, хто її викликав, далі до його викликача, поки не знайдеться відповідний `except` або не закінчиться стек. Це поширення винятку (propagation, загальний термін; документація Python каже, що виняток "propagates"). Механізм той самий, що в JS для синхронного `throw`, тож нижче важливіше інше: як цей шлях записано в traceback.

```python
def parse_value(raw: str) -> int:
    return int(raw)

def parse_field(field: dict) -> dict:
    return {"id": field["id"], "value": parse_value(field["value"])}

def parse_form(fields: list[dict]) -> list[dict]:
    return [parse_field(f) for f in fields]

parse_form([{"id": "age", "value": "30"}, {"id": "height", "value": "1.8"}])
```

```text
Traceback (most recent call last):
  File "main.py", line 10, in <module>
    parse_form([{"id": "age", "value": "30"}, {"id": "height", "value": "1.8"}])
  File "main.py", line 8, in parse_form
    return [parse_field(f) for f in fields]
            ^^^^^^^^^^^^^^
  File "main.py", line 5, in parse_field
    return {"id": field["id"], "value": parse_value(field["value"])}
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "main.py", line 2, in parse_value
    return int(raw)
           ^^^^^^^^
ValueError: invalid literal for int() with base 10: '1.8'
```

Traceback (офіційна назва в документації Python; так називається і модуль `traceback`) читається знизу вгору. Останній рядок це тип і повідомлення, і цього часто досить. Над ним найглибший кадр, де виняток виник: файл, номер рядка, ім'я функції, сам рядок коду і з 3.11 позначки `^^^^`, що підкреслюють точний підвираз. Вище йдуть викликачі аж до `<module>`, верхнього рівня скрипта. Заголовок `most recent call last` прямо каже про порядок, і він протилежний до `error.stack` у V8, де найсвіжіший кадр перший. У реальному проєкті між вашими кадрами будуть кадри бібліотек; шукайте знизу перший кадр з вашим файлом. Відлагоджувач `pdb` і `breakpoint()` у m0-l05.

> **Під капотом.** Між `parse_form` і `parse_field` немає окремого кадру для comprehension. До 3.12 там був би `<listcomp>`; у 3.12 list/dict/set comprehension вбудовуються в тіло функції (PEP 709), тому traceback коротший.

<!-- task: t1 -->

## Ієрархія: чому не `except Exception`

Винятки це класи, і `except X` перевіряє `isinstance(exc, X)`. Тому гілка ловить і сам тип, і всіх його нащадків, а ієрархія вбудованих винятків визначає, що саме ви ловите. Найпростіше подивитися її через `__mro__`, ланцюжок батьківських класів.

```python
for cls in [KeyError, IndexError, ValueError, TypeError, AttributeError,
            FileNotFoundError, ZeroDivisionError, KeyboardInterrupt, SystemExit]:
    chain = " -> ".join(c.__name__ for c in cls.__mro__[:-1])
    print(chain)
```

```text
KeyError -> LookupError -> Exception -> BaseException
IndexError -> LookupError -> Exception -> BaseException
ValueError -> Exception -> BaseException
TypeError -> Exception -> BaseException
AttributeError -> Exception -> BaseException
FileNotFoundError -> OSError -> Exception -> BaseException
ZeroDivisionError -> ArithmeticError -> Exception -> BaseException
KeyboardInterrupt -> BaseException
SystemExit -> BaseException
```

Корінь усього `BaseException`. Під ним `Exception`, батько всіх "помилок програми", і поруч із ним кілька винятків, які помилками не є: `SystemExit` кидає `sys.exit()`, `KeyboardInterrupt` прилітає на Ctrl+C, `GeneratorExit` закриває генератор. Їх винесли з-під `Exception` навмисно: це сигнали "завершуйся", і звичайна обробка помилок не повинна їх перехоплювати. Проміжні класи групують споріднене: `LookupError` батько `KeyError` та `IndexError`, `OSError` батько всього файлового й мережевого (`FileNotFoundError`, `PermissionError`, `TimeoutError`). Один `except LookupError` закриває "немає ключа" і "немає індексу" одночасно.

```python live
def first_option(field: dict) -> str:
    try:
        return field["options"][0]
    except LookupError as e:
        return f"{type(e).__name__}: {e}"

print(first_option({"options": ["red", "green"]}))
print(first_option({"options": []}))
print(first_option({}))
print(issubclass(KeyError, LookupError), isinstance(IndexError(), LookupError))
```

```text
red
IndexError: list index out of range
KeyError: 'options'
True True
```

> **Пастка.** Гілки `except` перевіряються згори вниз, і перемагає перша, що підходить, а не найточніша. Загальний тип вище за конкретний робить конкретну гілку мертвою, і Python про це не попереджає. Порядок завжди від нащадків до батьків.

```python
def parse(raw: str) -> str:
    try:
        return str(int(raw))
    except Exception:
        return "generic handler"
    except ValueError:
        return "never reached"

print(parse("x"))
```

```text
generic handler
```

<!-- task: q2 -->

Голий `except:` без типу (bare except, термін з PEP 8) дорівнює `except BaseException:` і ловить узагалі все, включно з сигналами завершення. Код нижче викликає `sys.exit(1)`, а програма продовжує працювати; так само проковтнутий Ctrl+C робить скрипт, який неможливо зупинити з клавіатури. `except Exception:` сигнали завершення пропускає, і другий `KeyboardInterrupt` нижче справді зупиняє програму.

```python
import sys

def finish() -> None:
    sys.exit(1)

try:
    finish()
except:
    print("swallowed:", sys.exc_info()[0].__name__)
print("still running")
```

```text
swallowed: SystemExit
still running
```

```python
try:
    raise KeyboardInterrupt
except:
    print("Ctrl+C ignored")

try:
    raise KeyboardInterrupt
except Exception:
    print("not printed")
```

```text
Ctrl+C ignored
Traceback (most recent call last):
  File "main.py", line 7, in <module>
    raise KeyboardInterrupt
KeyboardInterrupt
```

`except Exception` не ламає завершення, але має іншу ваду: він ловить ваші баги. `NameError` від одруківки, `TypeError` від неправильного виклику, `AttributeError` від перейменованого поля стають "очікуваною помилкою", функція повертає заглушку, і баг живе в продакшені тихо. Нижче одруківка `itmes` перетворюється на правдоподібний нуль; з вузьким `except KeyError` той самий код падає з підказкою `Did you mean: 'items'?`.

```python
def total_price(items: list[dict]) -> int:
    try:
        return sum(item["price"] * item["qty"] for item in itmes)
    except Exception:
        return 0

print(total_price([{"price": 10, "qty": 2}]))
```

```text
0
```

```python
def total_price(items: list[dict]) -> int:
    try:
        return sum(item["price"] * item["qty"] for item in itmes)
    except KeyError:
        return 0

print(total_price([{"price": 10, "qty": 2}]))
```

```text
Traceback (most recent call last):
  File "main.py", line 7, in <module>
    print(total_price([{"price": 10, "qty": 2}]))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "main.py", line 3, in total_price
    return sum(item["price"] * item["qty"] for item in itmes)
                                                       ^^^^^
NameError: name 'itmes' is not defined. Did you mean: 'items'?
```

Легітимне місце для `except Exception` одне: межа, за якою виняток нікому передати. Цикл воркера, що обробляє чергу задач, обробник запиту на рівні фреймворку, верхній рівень CLI. Там одна зламана одиниця роботи не повинна класти все, і виняток логується з типом і текстом, а не ковтається. Ruff ловить обидва антипатерни: `E722` для голого `except:` і `BLE001` для `except Exception` без повторного кидання чи логування.

```python
def render(config: dict) -> str:
    return config["title"].upper()

configs = [{"title": "Contact"}, {}, {"title": None}, {"title": "Survey"}]
for config in configs:
    try:
        print(render(config))
    except Exception as e:
        print(f"skipped: {type(e).__name__}: {e}")
```

```text
CONTACT
skipped: KeyError: 'title'
skipped: AttributeError: 'NoneType' object has no attribute 'upper'
SURVEY
```

> **Під капотом.** Ще два місця, де ієрархія важлива, обидва з asyncio. `asyncio.CancelledError` з Python 3.8 успадковується від `BaseException`, а не від `Exception`, саме для того, щоб звичний `except Exception` не ламав скасування задач; голий `except:` його ламає (m5-l05). `ExceptionGroup` (3.11+) несе кілька винятків одночасно, його піднімає `asyncio.TaskGroup`, коли падають кілька задач, і ловлять його окремим синтаксисом `except*`; розбір у m5-l05.

<!-- task: t2 -->

## `else` і `finally`: вузький `try` і порядок виконання

`try` у Python має чотири частини. `except` виконується, якщо в `try` стався виняток відповідного типу. `else` виконується, якщо `try` завершився без винятку. `finally` виконується завжди: після успіху, після обробленого винятку, після необробленого, після `return`. `else` у JS немає, і саме він вирішує найчастішу проблему з обробкою помилок: занадто широкий `try`.

Код нижче ловить `KeyError` заради випадку "у поля немає `type`". Але той самий тип кидає і `LABELS[field_type]`, коли тип невідомий, і `except` не розрізняє, звідки прилетіло. Поле з типом `date` отримує неправдиве повідомлення "no type", а реальна проблема (немає мітки для `date`) зникає.

```python
LABELS = {"text": "Text input", "number": "Number input"}

def describe(field: dict) -> str:
    try:
        field_type = field["type"]
        return f"{field['id']}: {LABELS[field_type]}"
    except KeyError:
        return f"{field['id']}: no type"

print(describe({"id": "age", "type": "number"}))
print(describe({"id": "note"}))
print(describe({"id": "dob", "type": "date"}))
```

```text
age: Number input
note: no type
dob: no type
```

Правило: у `try` лише той рядок, чий виняток ви очікуєте, а код, що має виконатися при успіху, в `else`. Винятки з `else` не потрапляють у `except` того самого `try`, тому `KeyError: 'date'` тепер летить назовні і показує реальну проблему. Чим `else` кращий за код просто після всього `try/except`: він виконується лише при успіху, тоді як код після блоку виконається і після обробленого винятку, якщо `except` не зробив `return`.

```python
LABELS = {"text": "Text input", "number": "Number input"}

def describe(field: dict) -> str:
    try:
        field_type = field["type"]
    except KeyError:
        return f"{field['id']}: no type"
    else:
        return f"{field['id']}: {LABELS[field_type]}"

print(describe({"id": "age", "type": "number"}))
print(describe({"id": "note"}))
print(describe({"id": "dob", "type": "date"}))
```

```text
age: Number input
note: no type
Traceback (most recent call last):
  File "main.py", line 13, in <module>
    print(describe({"id": "dob", "type": "date"}))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "main.py", line 9, in describe
    return f"{field['id']}: {LABELS[field_type]}"
                             ~~~~~~^^^^^^^^^^^^
KeyError: 'date'
```

Порядок виконання з `return` усередині варто побачити, а не запам'ятати. Три сценарії: `try` дійшов до кінця, `try` кинув виняток, `try` зробив `return`. В останньому `else` не виконується: документація формулює умову `else` як "керування вийшло з `try` без винятку і без `return`, `break` чи `continue`". `finally` виконується в усіх трьох, причому після того, як значення для `return` вже обчислене.

```python live
def run(mode: str) -> str:
    try:
        print("  try")
        if mode == "raise":
            raise ValueError("boom")
        if mode == "return":
            return "from try"
    except ValueError:
        print("  except")
        return "from except"
    else:
        print("  else")
        return "from else"
    finally:
        print("  finally")

for mode in ["ok", "raise", "return"]:
    print(mode)
    print("  result:", run(mode))
```

```text
ok
  try
  else
  finally
  result: from else
raise
  try
  except
  finally
  result: from except
return
  try
  finally
  result: from try
```

> **Під капотом.** `return x` у `try` спершу обчислює `x` і відкладає результат, потім виконує `finally`, потім повертає відкладене. Тому присвоєння `log = [...]` у `finally` на результат не впливає, а мутація того самого об'єкта через `log.append` впливає: відкладено посилання на список, а не його копію.

```python
def compute() -> list[str]:
    log = ["start"]
    try:
        return log
    finally:
        log.append("finally")
        log = ["replaced"]

print(compute())
```

```text
['start', 'finally']
```

> **Пастка.** `return` усередині `finally` перекриває і `return` з `try`, і виняток, що летів: виняток зникає безслідно. JS поводиться так само, але в Python з версії 3.14 компілятор на це видає `SyntaxWarning` (PEP 765). У `finally` лише прибирання, без `return`, `break` і `continue`.

```python
def override() -> str:
    try:
        return "from try"
    finally:
        return "from finally"

def swallow() -> str:
    try:
        raise ValueError("lost forever")
    finally:
        return "from finally"

print(override())
print(swallow())
```

```text
from finally
from finally
```

<!-- task: q1 -->

`try/finally` без жодного `except` це повноцінна і поширена форма: "що б не сталося, прибери за собою, а виняток нехай летить далі". Звільнити блокування, повернути прапорець, закрити ресурс. Функція нижче не знає, що робити з відсутнім `title`, тому не ловить `KeyError`, але стан `busy` відновлює в обох випадках.

```python
state = {"busy": False}

def publish(config: dict) -> str:
    state["busy"] = True
    try:
        return config["title"].upper()
    finally:
        state["busy"] = False

print(publish({"title": "Contact"}), state)
try:
    publish({})
except KeyError as e:
    print("failed:", e, state)
```

```text
CONTACT {'busy': False}
failed: 'title' {'busy': False}
```

> **JS-аналог.** `finally` у JS той самий. Але для файлів, з'єднань і блокувань у Python замість ручного `try/finally` пишуть `with`: контекстний менеджер сам робить прибирання у своєму `__exit__`. Це ближче до `using` з TS 5.2, ніж до `finally`; детально в m4-l07.

<!-- task: t3 -->

## `raise`, повторне кидання і ланцюжки причин

`raise` приймає екземпляр винятку або клас; клас Python інстанціює сам, без аргументів. Кинути можна лише нащадка `BaseException`. JS-звичка `throw "message"` дає `TypeError` уже на самому `raise`, і рядок повідомлення до обробника навіть не доходить.

```python
try:
    raise ValueError
except ValueError as e:
    print(repr(e))

try:
    raise ValueError("age must be >= 0")
except ValueError as e:
    print(repr(e))
```

```text
ValueError()
ValueError('age must be >= 0')
```

```python
raise "age must be >= 0"
```

```text
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    raise "age must be >= 0"
TypeError: exceptions must derive from BaseException
```

`raise` без аргументів усередині `except` кидає далі поточний виняток (re-raise; так його називає і офіційний туторіал). Traceback лишається оригінальний, з кадром, де виняток виник, тож це правильний спосіб "залогувати й передати далі". Аналог `catch (e) { log(e); throw e; }`.

```python
def parse_age(raw: str) -> int:
    try:
        return int(raw)
    except ValueError:
        print(f"log: bad age {raw!r}")
        raise

parse_age("abc")
```

```text
log: bad age 'abc'
Traceback (most recent call last):
  File "main.py", line 8, in <module>
    parse_age("abc")
  File "main.py", line 3, in parse_age
    return int(raw)
           ^^^^^^^^
ValueError: invalid literal for int() with base 10: 'abc'
```

Часто виняток треба не передати, а перекласти: технічний `KeyError` з нутрощів має стати зрозумілим `ValueError` або доменним винятком. Якщо просто кинути новий виняток усередині `except`, Python все одно запам'ятає старий і надрукує обидва, розділивши їх фразою "During handling of the above exception, another exception occurred". Вона означає: під час обробки першого винятку стався другий, і інтерпретатор не знає, навмисно чи через баг в обробнику.

```python
WIDGETS = {"text": "TextInput", "number": "NumberInput"}

def widget_for(field: dict) -> str:
    try:
        return WIDGETS[field["type"]]
    except KeyError:
        raise ValueError(f"field {field['id']!r}: unknown type")

widget_for({"id": "dob", "type": "date"})
```

```text
Traceback (most recent call last):
  File "main.py", line 5, in widget_for
    return WIDGETS[field["type"]]
           ~~~~~~~^^^^^^^^^^^^^^^
KeyError: 'date'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "main.py", line 9, in <module>
    widget_for({"id": "dob", "type": "date"})
  File "main.py", line 7, in widget_for
    raise ValueError(f"field {field['id']!r}: unknown type")
ValueError: field 'dob': unknown type
```

`raise New(...) from e` робить зв'язок явним: це ланцюжок винятків (exception chaining, офіційна назва розділу в документації). Traceback той самий за структурою, але фраза інша: "The above exception was the direct cause of the following exception", тобто "новий виняток навмисно описує старий". Це і є JS-ний `new Error(msg, { cause: e })` з ES2022, тільки Python ще й друкує причину сам.

```ts
try {
  return lookupWidget(field.type);
} catch (e) {
  throw new Error(`field '${field.id}': unknown type`, { cause: e });
}
```

```python
WIDGETS = {"text": "TextInput", "number": "NumberInput"}

def widget_for(field: dict) -> str:
    try:
        return WIDGETS[field["type"]]
    except KeyError as e:
        raise ValueError(f"field {field['id']!r}: unknown type") from e

widget_for({"id": "dob", "type": "date"})
```

```text
Traceback (most recent call last):
  File "main.py", line 5, in widget_for
    return WIDGETS[field["type"]]
           ~~~~~~~^^^^^^^^^^^^^^^
KeyError: 'date'

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "main.py", line 9, in <module>
    widget_for({"id": "dob", "type": "date"})
  File "main.py", line 7, in widget_for
    raise ValueError(f"field {field['id']!r}: unknown type") from e
ValueError: field 'dob': unknown type
```

Розходження з JS у тому, що `cause` в JS лише поле, яке консоль може показати, а може й ні, а в Python ланцюжок це частина стандартного друку traceback. Ланцюжковий traceback читається так само знизу вгору: внизу виняток, який вилетів назовні, над фразою-розділювачем його причина, і кожен блок має власний стек. Якщо причина нікому не потрібна, наприклад внутрішній `KeyError` лише деталь реалізації, пишіть `from None`: друкується тільки новий виняток.

```python
WIDGETS = {"text": "TextInput", "number": "NumberInput"}

def widget_for(field: dict) -> str:
    try:
        return WIDGETS[field["type"]]
    except KeyError:
        raise ValueError(f"field {field['id']!r}: unknown type") from None

widget_for({"id": "dob", "type": "date"})
```

```text
Traceback (most recent call last):
  File "main.py", line 9, in <module>
    widget_for({"id": "dob", "type": "date"})
  File "main.py", line 7, in widget_for
    raise ValueError(f"field {field['id']!r}: unknown type") from None
ValueError: field 'dob': unknown type
```

> **Під капотом.** Ланцюжок живе у трьох атрибутах з подвійним підкресленням (dunder, від "double underscore"; жаргон спільноти, документація каже "special attributes"). `__context__` Python заповнює завжди, коли новий виняток виник під час обробки іншого. `__cause__` заповнює лише `from e`. `__suppress_context__` стає `True` від будь-якого `from`, і тоді друк показує `__cause__` замість `__context__`. `from None` це `__cause__ = None` плюс `__suppress_context__ = True`: контекст зберігається для відлагодження, але не друкується.

```python
WIDGETS = {"text": "TextInput"}

def widget_for(field: dict, mode: str) -> str:
    try:
        return WIDGETS[field["type"]]
    except KeyError as e:
        if mode == "implicit":
            raise ValueError("unknown type")
        if mode == "from e":
            raise ValueError("unknown type") from e
        raise ValueError("unknown type") from None

for mode in ["implicit", "from e", "from None"]:
    try:
        widget_for({"type": "date"}, mode)
    except ValueError as e:
        print(f"{mode:10} cause={e.__cause__!r} context={e.__context__!r} suppress={e.__suppress_context__}")
```

```text
implicit   cause=None context=KeyError('date') suppress=False
from e     cause=KeyError('date') context=KeyError('date') suppress=True
from None  cause=None context=KeyError('date') suppress=True
```

<!-- task: q4 -->

## Власні винятки для домену

Власний виняток це клас-нащадок `Exception`. Мінімальний варіант не потребує нічого, крім імені й docstring: конструктор, `args` і `str()` успадковуються. Від `BaseException` напряму не успадковуються: тоді ваш виняток пролетить повз чужі `except Exception`, як `KeyboardInterrupt`.

```ts
class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
```

```python
class ConfigError(Exception):
    """Будь-яка помилка конфігу форми."""

try:
    raise ConfigError("config has no pages")
except ConfigError as e:
    print(repr(e), e.args)
print(ConfigError.__mro__)
```

```text
ConfigError('config has no pages') ('config has no pages',)
(<class '__main__.ConfigError'>, <class 'Exception'>, <class 'BaseException'>, <class 'object'>)
```

Розходження на рівні механіки: у TS `this.name` треба виставляти руками, інакше в стеку буде `Error`, а `instanceof` для нащадків `Error` колись ламався при компіляції в ES5. У Python ім'я класу і є ім'я винятку в traceback, а `except` за класом працює завжди. Справжня користь починається з ієрархії: один базовий `ConfigError` для всього модуля і конкретні нащадки з додатковими атрибутами. Межа API ловить базовий клас, а код, якому важлива деталь, ловить конкретний і читає атрибути, а не парсить текст повідомлення.

```python live
class ConfigError(Exception):
    """Будь-яка помилка конфігу форми."""

class UnknownElementType(ConfigError):
    def __init__(self, element_id: str, type_name: str) -> None:
        super().__init__(f"element {element_id!r}: unknown type {type_name!r}")
        self.element_id = element_id
        self.type_name = type_name

class DuplicateElementId(ConfigError):
    def __init__(self, element_id: str) -> None:
        super().__init__(f"duplicate element id {element_id!r}")
        self.element_id = element_id

KNOWN_TYPES = {"text", "number", "select"}

def check_elements(elements: list[dict]) -> None:
    seen = set()
    for el in elements:
        if el["type"] not in KNOWN_TYPES:
            raise UnknownElementType(el["id"], el["type"])
        if el["id"] in seen:
            raise DuplicateElementId(el["id"])
        seen.add(el["id"])

for elements in [
    [{"id": "age", "type": "number"}, {"id": "dob", "type": "date"}],
    [{"id": "age", "type": "number"}, {"id": "age", "type": "text"}],
]:
    try:
        check_elements(elements)
    except UnknownElementType as e:
        print("unknown:", e.type_name, "| hint: supported", sorted(KNOWN_TYPES))
    except ConfigError as e:
        print(f"{type(e).__name__}: {e}")
```

```text
unknown: date | hint: supported ['number', 'select', 'text']
DuplicateElementId: duplicate element id 'age'
```

Власний `__init__` має передати готове повідомлення в `super().__init__(message)`. Якщо цього не зробити, Python все одно запише в `args` аргументи конструктора (це робить `BaseException.__new__`), і `str(e)` стане текстом кортежу. Traceback покаже `UnknownElementType: ('dob', 'date')` замість речення, а `str(e)` у відповіді API буде нечитабельним.

```python
class UnknownElementType(Exception):
    def __init__(self, element_id: str, type_name: str) -> None:
        self.element_id = element_id
        self.type_name = type_name

try:
    raise UnknownElementType("dob", "date")
except UnknownElementType as e:
    print(repr(str(e)), e.args)
```

```text
"('dob', 'date')" ('dob', 'date')
```

Імена закінчуються на `Error`: це пряма рекомендація PEP 8 для винятків, що позначають помилку, і так названі майже всі вбудовані (`ValueError`, `KeyError`, `OSError`). Винятки, що помилками не є, суфікса не мають: `StopIteration`, `KeyboardInterrupt`, `SystemExit`. У доменних ієрархіях суфікс часто ставлять лише на базовий клас, а нащадки називають за ситуацією (`UnknownElementType`), бо `ConfigError` у батьках уже каже, що це помилка; обидва стилі зустрічаються в бібліотеках, головне тримати один у межах проєкту.

<!-- task: t4 -->

## EAFP проти LBYL: винятки як control flow

У Python для цього вибору є офіційні назви з глосарію документації. LBYL (Look Before You Leap, "подивись, перш ніж стрибати"): спершу перевірити, що операція можлива, потім виконати. EAFP (Easier to Ask for Forgiveness than Permission, "легше попросити пробачення, ніж дозволу"): виконати одразу й обробити виняток, якщо не вийшло. Глосарій прямо називає EAFP поширеним стилем Python, а LBYL типовим для C. На співбесіді обидві абревіатури доречні.

```ts
const raw = answers["age"];
const age = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
```

```python
answers = {"email": "a@b.c", "age": "30"}

if "age" in answers and answers["age"].isdigit():
    age = int(answers["age"])
else:
    age = None
print(age)

try:
    age = int(answers["age"])
except (KeyError, ValueError):
    age = None
print(age)
```

```text
30
30
```

У JS `throw` для керування потоком вважають поганим тоном: винятки нетипізовані, `catch` ловить усе, а в старих рушіях функція з `try` гірше оптимізувалась. У Python аргументи протилежні. Перше: перевірка LBYL дублює логіку операції і розходиться з нею. `"-5".isdigit()` дає `False`, хоча `int` його приймає; `"²".isdigit()` дає `True`, хоча `int` його відкидає. EAFP питає саму операцію, тому не помиляється в жоден бік.

```python live
for raw in ["30", "-5", " 7 ", "²", "3_000"]:
    try:
        parsed = int(raw)
    except ValueError:
        parsed = "ValueError"
    print(f"{raw!r:8} isdigit={raw.isdigit()!s:5} int={parsed}")
```

```text
'30'     isdigit=True  int=30
'-5'     isdigit=False int=-5
' 7 '    isdigit=False int=7
'²'      isdigit=True  int=ValueError
'3_000'  isdigit=False int=3000
```

Друге: між перевіркою і дією світ може змінитися. `if path.exists(): open(path)` має вікно, у яке інший процес видалить файл (у безпеці це називають TOCTOU, time-of-check to time-of-use); `try: open(path) except FileNotFoundError` такого вікна не має. Третє, і найважливіше для розуміння мови: винятки вже є частиною звичайного керування потоком в самому Python. `for` закінчується не тому, що перевіряє довжину, а тому, що ітератор кидає `StopIteration`.

```python
it = iter(["email", "phone"])
print(next(it))
print(next(it))
try:
    next(it)
except StopIteration:
    print("StopIteration")
```

```text
email
phone
StopIteration
```

> **Під капотом.** `for field in fields:` це скорочення для циклу нижче: отримати ітератор, просити `next`, поки не прилетить `StopIteration`. Для вбудованих типів інтерпретатор робить це без створення об'єкта винятку, але на рівні протоколу кінець ітерації це саме виняток, і власний ітератор (m5-l01) сигналізує про кінець тільки так.

```python
fields = ["email", "phone"]

it = iter(fields)
while True:
    try:
        field = next(it)
    except StopIteration:
        break
    print(field)
```

```text
email
phone
```

Ціна. З Python 3.11 вхід у `try` нічого не коштує: компілятор не вставляє інструкцій на початку блоку, а будує таблицю діапазонів, яку читає лише тоді, коли виняток справді стався (у What's New 3.11 це названо zero-cost exceptions). Дорогий лише сам `raise` і пошук обробника. Звідси правило: EAFP вигідний, коли виняток рідкісний, і програє, коли "невдача" це звичайний випадок. Цифри нижче з одного запуску на машині автора; на вашій будуть інші, але співвідношення таке саме.

```python
import timeit

answers = {"email": "a@b.c"}

def eafp_hit():
    try:
        return answers["email"]
    except KeyError:
        return None

def lbyl_hit():
    return answers["email"] if "email" in answers else None

def eafp_miss():
    try:
        return answers["age"]
    except KeyError:
        return None

def lbyl_miss():
    return answers["age"] if "age" in answers else None

for fn in [eafp_hit, lbyl_hit, eafp_miss, lbyl_miss]:
    seconds = timeit.timeit(fn, number=1_000_000)
    print(f"{fn.__name__:10} {seconds:.3f} s")
```

```text
eafp_hit   0.028 s
lbyl_hit   0.036 s
eafp_miss  0.124 s
lbyl_miss  0.030 s
```

На промаху EAFP вчетверо повільніший, на влучанні трохи швидший, бо робить один пошук замість двох. LBYL доречний там, де невдача очікувана і часта, а найчастіше це валідація вводу користувача: порожні поля, неправильний формат, і вам потрібні всі помилки разом, а не перша. Для словника між двома стилями є третій шлях, який часто кращий за обидва: `.get(key, default)`.

Той самий вибір стоїть при проєктуванні API функції: повернути маркер відсутності чи кинути виняток. Стандартна бібліотека показує обидва підходи на одній парі методів: `str.find` повертає `-1`, `str.index` кидає `ValueError`. У списку `find` немає зовсім, лише `index`, що кидає.

```python
ids = "email,phone,age"
print(ids.find("phone"))
print(ids.find("name"))
print(ids.index("phone"))
print(["email", "phone"].index("phone"))
print(["email", "phone"].index("name"))
```

```text
6
-1
6
1
Traceback (most recent call last):
  File "main.py", line 6, in <module>
    print(["email", "phone"].index("name"))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: 'name' is not in list
```

> **Пастка.** `-1` у Python не "неіснуючий індекс", а валідний індекс останнього елемента. `ids[ids.find("name"):]` не впаде, а тихо поверне останній символ. У JS `indexOf` теж повертає `-1`, але `arr[-1]` там дає `undefined`, тож з індексацією помилка видна раніше (зі `slice` у JS та сама пастка). У Python результат `find` треба перевіряти завжди, або брати `index` і ловити `ValueError`.

```python
ids = "email,phone,age"
pos = ids.find("name")
print(repr(ids[pos:]))
```

```text
'e'
```

Для власних функцій правило таке. Якщо відсутність результату нормальна ("знайди поле за id, якщо є"), повертайте `None` і пишіть це в типі `-> Field | None`: перевірка типів (m2-l08) змусить викликача обробити `None`. Якщо відсутність означає, що щось пішло не так ("дай поле, яке точно має бути"), кидайте виняток: його неможливо проігнорувати випадково, як `None` чи `-1`, і він автоматично проходить крізь проміжні функції до того, хто знає, що робити. `dict[key]` проти `dict.get(key)` і `index` проти `find` це та сама пара.

## `assert`: інваріанти, а не валідація

`assert cond, message` кидає `AssertionError(message)`, якщо `cond` хибне. Це оператор мови, а не функція, і призначення в нього вузьке: перевірити інваріант (invariant, загальний термін), тобто умову, яка за правильного коду не може бути порушена. Якщо `assert` спрацював, баг у коді, а не у вхідних даних.

```python
def page_slice(items: list, page: int, size: int) -> list:
    assert page >= 1 and size >= 1, f"bad paging: page={page}, size={size}"
    start = (page - 1) * size
    return items[start:start + size]

print(page_slice(list(range(10)), 2, 3))
print(page_slice(list(range(10)), 0, 3))
```

```text
[3, 4, 5]
Traceback (most recent call last):
  File "main.py", line 7, in <module>
    print(page_slice(list(range(10)), 0, 3))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "main.py", line 2, in page_slice
    assert page >= 1 and size >= 1, f"bad paging: page={page}, size={size}"
           ^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: bad paging: page=0, size=3
```

Чому не для валідації вводу: запуск `python -O` вимикає всі `assert` разом з обчисленням повідомлення. Компілятор просто не генерує для них коду, а вбудована константа `__debug__` стає `False`. Той самий файл під `-O` не падає, а повертає тихо неправильний результат: `items[-3:0]` це порожній список.

```text
$ python -O main.py
[3, 4, 5]
[]
```

```python
print(__debug__)
```

```text
True
```

Під `python -O` той самий рядок друкує `False`. Ввід користувача, параметри API, вміст конфігу перевіряються явним `if` і `raise ValueError` (або Pydantic, m2-l09), бо ці перевірки мають працювати завжди. `assert` лишається для внутрішніх домовленостей і для тестів: pytest (m3-l03) використовує голий `assert` замість матчерів `expect(...).toBe(...)` і переписує його так, щоб у повідомленні були обидва значення.

```python
def set_discount(percent: int) -> int:
    if not 0 <= percent <= 100:
        raise ValueError(f"percent must be in 0..100, got {percent}")
    return percent

try:
    set_discount(150)
except ValueError as e:
    print(e)
```

```text
percent must be in 0..100, got 150
```

> **Пастка.** `assert (cond, "message")` з дужками це перевірка кортежу з двох елементів, а непорожній кортеж завжди truthy. Інтуїція з `console.assert(cond, msg)` підказує дужки, бо в JS це виклик функції. Python 3.12 попереджає `SyntaxWarning` під час компіляції, але код виконується, і `assert` не перевіряє нічого.

```python
percent = 150
assert (0 <= percent <= 100, "percent out of range")
print("passed, percent =", percent)
```

```text
main.py:2: SyntaxWarning: assertion is always true, perhaps remove parentheses?
  assert (0 <= percent <= 100, "percent out of range")
passed, percent = 150
```

<!-- task: q3 -->

## Для капстоуну

Бекенд FormBuilder отримує JSON-конфіг форми, і майже кожна помилка в ньому має доходити до клієнта як зрозуміла відповідь 422, а не як 500 з traceback. Ієрархія для цього: один базовий `ConfigError` у модулі конфігу, від нього конкретні `UnknownElementType`, `DuplicateElementId`, `InvalidConfig` з атрибутами, які потрібні UI конструктора для підсвічування поля. Валідацію структури в капстоуні робить Pydantic, і його `ValidationError` (`errors()` з `loc`, `msg`, `type` розібрані в m2-l09) не повинен витікати з модуля конфігу: решта коду знає лише про `ConfigError`. Переклад робиться через `from e`, тож у логах сервера лишається повна причина.

```python
from pydantic import BaseModel, ValidationError


class ConfigError(Exception):
    """Базовий виняток для всього, що не так з конфігом форми."""


class InvalidConfig(ConfigError):
    def __init__(self, errors: list[dict]) -> None:
        paths = ", ".join(".".join(map(str, err["loc"])) for err in errors)
        super().__init__(f"invalid config: {paths}")
        self.errors = errors


class FormConfig(BaseModel):
    title: str
    version: int


def load_config(raw: dict) -> FormConfig:
    try:
        return FormConfig.model_validate(raw)
    except ValidationError as e:
        raise InvalidConfig(e.errors(include_url=False)) from e


def handle_post_config(raw: dict) -> dict:
    """Межа API: тут і лише тут ConfigError стає відповіддю."""
    try:
        config = load_config(raw)
    except ConfigError as e:
        return {"status": 422, "error": str(e)}
    return {"status": 201, "title": config.title}


print(handle_post_config({"title": "Contact", "version": 1}))
print(handle_post_config({"version": "first"}))

try:
    load_config({"version": "first"})
except InvalidConfig as e:
    print(type(e.__cause__).__name__)
    print([(err["loc"], err["type"]) for err in e.errors])
```

```text
{'status': 201, 'title': 'Contact'}
{'status': 422, 'error': 'invalid config: title, version'}
ValidationError
[(('title',), 'missing'), (('version',), 'int_parsing')]
```

> **Для капстоуну.** Де ловити: на межі, і лише там. Функції розбору, перевірки й збереження конфігу кидають `ConfigError` і нічого не ловлять; ловить обробник запиту, а в FastAPI взагалі один глобальний exception handler на `ConfigError` (m7-l02). Це протилежність звичці з фронтенду обгортати кожен `fetch` у свій `.catch`: проміжний код у Python пропускає винятки крізь себе, бо поширення стеком безкоштовне, а знає, що відповісти клієнту, лише верхній рівень. Усе, що не `ConfigError`, на межі не ловиться і стає 500 з повним traceback у логах, бо це баг сервера, а не помилка клієнта.

<!-- task: t5 -->

<!-- task: t6 -->

## Типові помилки JS-розробника

1. **`try { } catch (e) { }` як голий `except:`.** Переносять "ловити все" з JS, де інакше неможливо. У Python це ковтає `SystemExit`, Ctrl+C і `CancelledError`, а також ваші `NameError` і `TypeError`. Правильно: конкретний тип або кортеж типів; `except Exception` лише на межі з логуванням.

   ```python
   try:
       age = int(raw)
   except:                       # за звичкою: ловить і Ctrl+C
       age = None
   try:
       age = int(raw)
   except (TypeError, ValueError):  # правильно
       age = None
   ```

2. **`throw "string"`.** Рядок не виняток. `raise "age must be >= 0"` падає з `TypeError: exceptions must derive from BaseException`. Правильно: екземпляр вбудованого або власного класу.

   ```python
   raise ValueError("age must be >= 0")
   ```

3. **`if (result === undefined)` замість очікування винятку.** Пишуть `user = users.get(user_id)` і далі `user["name"]`, хоча користувач зобов'язаний існувати. Помилка переїжджає: замість `KeyError` з id в місці пошуку виходить `TypeError: 'NoneType' object is not subscriptable` у місці використання. Правильно: `users[user_id]`, коли відсутність це помилка; `.get` і перевірка на `None`, коли відсутність нормальна.

   ```python
   name = users[user_id]["name"]          # KeyError: 42, одразу видно, кого немає
   user = users.get(user_id)              # лише якщо "немає" це нормальний випадок
   name = user["name"] if user is not None else "guest"
   ```

4. **`instanceof`-ланцюжок усередині одного `catch`.** Переносять `if (e instanceof A) ... else if (e instanceof B) ... else throw e`. У Python це працює через `isinstance`, але дублює те, що `except` за типом робить сам, і легко забути фінальне `raise`. Правильно: окремі гілки `except`, від конкретних до загальних.

   ```python
   try:
       value = fields[index][key]
   except IndexError:
       value = "no such field"
   except KeyError:
       value = "no such key"
   ```

5. **`Promise.catch`-мислення: обробник у кожній функції.** Кожну функцію обгортають у `try/except`, який логує і повертає `None`. Викликач отримує `None` без причини, а traceback втрачено. Правильно: проміжні функції не ловлять нічого або перекладають виняток через `raise ... from e`; ловить одна межа.

   ```python
   def load_config(raw: dict) -> FormConfig:
       try:
           return FormConfig.model_validate(raw)
       except ValidationError as e:
           raise InvalidConfig(e.errors()) from e   # переклад, а не ковтання
   ```

6. **Увесь код функції в `try`.** Звичка з одного великого `try` навколо async-функції. `except KeyError` ловить і очікуваний `KeyError`, і чужий з глибини, і повідомлення бреше. Правильно: в `try` лише рядок, чий виняток очікуєте, решта в `else`.

   ```python
   try:
       field_type = field["type"]
   except KeyError:
       return "no type"
   else:
       return LABELS[field_type]
   ```

7. **`find` і `-1` як "не знайдено" в індексації.** З JS `indexOf` переносять перевірку `!== -1` або забувають її. У Python `-1` валідний індекс, і `s[s.find(x):]` тихо бере останній символ. Правильно: `index` з `except ValueError` або оператор `in`, коли позиція не потрібна.

   ```python
   if "phone" in ids:
       pos = ids.index("phone")
   ```

8. **`assert` для валідації вводу.** `assert percent <= 100` виглядає як коротка перевірка, але зникає під `python -O`, а `assert (cond, "msg")` з дужками не перевіряє нічого ніколи. Правильно: `if` + `raise ValueError` для вводу, `assert` без дужок лише для інваріантів.

   ```python
   if not 0 <= percent <= 100:
       raise ValueError(f"percent must be in 0..100, got {percent}")
   ```

## Підсумок

- Python кидає там, де JS повертає `undefined` чи `NaN`: `KeyError`, `IndexError`, `ValueError`, `AttributeError` на `None.x`, `TypeError` на `None[0]`. Безпечні форми: `d.get`, `getattr(o, n, default)`, `next(it, default)`.
- `except X` це `isinstance(exc, X)`: ловить тип і нащадків, гілки перевіряються згори вниз, перша підходяща перемагає.
- `BaseException` корінь; `SystemExit`, `KeyboardInterrupt`, `CancelledError` поза `Exception` навмисно. Голий `except:` ловить їх усі, `except Exception` ловить ваші баги; обидва лише на межі.
- `LookupError` батько `KeyError` та `IndexError`, `OSError` батько файлових помилок.
- `else` виконується лише при успіху `try` без `return`, і його винятки не ловить той самий `except`; так `try` лишається вузьким. `finally` виконується завжди, `return` у ньому ковтає виняток.
- `raise` без аргументів кидає поточний виняток далі з оригінальним traceback; `raise New() from e` це "direct cause", новий виняток в `except` без `from` це "During handling"; `from None` ховає причину.
- Власні винятки: нащадок `Exception`, повідомлення в `super().__init__`, дані в атрибутах, ім'я на `Error`, один базовий клас на домен.
- Traceback читається знизу вгору: тип і повідомлення, потім кадр, де стався виняток, вище викликачі; ланцюжок це кілька таких блоків, розділених фразою про зв'язок.
- EAFP типовий для Python: `try` з 3.11 безкоштовний, дорогий лише `raise`; `for` сам зупиняється на `StopIteration`. LBYL або `.get`, коли невдача часта, особливо при валідації вводу.
- `assert` для інваріантів і тестів, не для вводу: `-O` його вимикає, дужки з кортежем роблять його завжди істинним.

## Що далі

Це останній урок модуля 1. Модуль 2 починається з m2-l01 про list, tuple, dict і set проти Array, Object, Map і Set: там знадобиться все про `KeyError`, `IndexError`, `.get` і `LookupError` з цього уроку, а ієрархія `ConfigError` з `from e` повернеться в m2-l09, коли конфіг FormBuilder стане набором Pydantic-моделей.
