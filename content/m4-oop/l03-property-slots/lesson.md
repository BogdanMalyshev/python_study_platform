---
id: m4-l03
module: m4-oop
title: "property замість геттерів і сеттерів; __slots__"
summary: "Учень починає клас з публічних атрибутів і за потреби перетворює їх на property без зміни інтерфейсу, знає, коли потрібен метод або cached_property, пише власний дескриптор з __set_name__, обмежує екземпляри через __slots__ і розуміє, де валідувати: у property, __post_init__ чи Pydantic."
duration_min: 75
prerequisites: [m4-l02]
---

## Атрибут спочатку, property коли знадобиться

У Java і в багатьох TS-кодових базах поле за замовчуванням приватне, а назовні виставлені `getLabel()` і `setLabel()` або `private _label` плюс `get label()`. Причина оборонна: якщо колись знадобиться валідація, викликаючий код не доведеться переписувати. У Python ця причина зникає, бо звичайний доступ `field.label` можна будь-коли непомітно для викликаючого коду перетворити на виклик функції. Тому клас починають з публічного атрибута і нічого наперед не загортають.

Нижче перша версія класу і код, що ним користується. Потім вимоги змінились: підпис треба чистити від пробілів і не пускати порожній. Друга версія замінює атрибут на `property`, а викликаючий код лишається дослівно тим самим.

```python
class TextField:
    def __init__(self, name: str, label: str) -> None:
        self.name = name
        self.label = label


field = TextField("email", "Email")
field.label = "  E-mail  "
print(repr(field.label))
```

```text
'  E-mail  '
```

```python live
class TextField:
    def __init__(self, name: str, label: str) -> None:
        self.name = name
        self.label = label  # іде через setter нижче

    @property
    def label(self) -> str:
        return self._label

    @label.setter
    def label(self, value: str) -> None:
        value = value.strip()
        if not value:
            raise ValueError("label must not be empty")
        self._label = value


field = TextField("email", "Email")
field.label = "  E-mail  "
print(repr(field.label))

try:
    field.label = "   "
except ValueError as e:
    print("ValueError:", e)
```

```text
'E-mail'
ValueError: label must not be empty
```

Це і є принцип однорідного доступу (uniform access principle, термін Бертрана Меєра з Eiffel; у документації Python його немає, але на співбесіді його впізнають): клієнт не знає й не має знати, чи `label` зберігається, чи обчислюється. Документація Python називає такі атрибути керованими (managed attributes), а сам `property` це вбудований клас, тож "проперті" в розмові означає саме його.

```ts
class TextField {
  #label = "";
  constructor(public name: string, label: string) {
    this.label = label;
  }
  get label(): string {
    return this.#label;
  }
  set label(value: string) {
    value = value.trim();
    if (!value) throw new Error("label must not be empty");
    this.#label = value;
  }
}
```

```python
class TextField:
    def __init__(self, name: str, label: str) -> None:
        self.name = name
        self.label = label

    @property
    def label(self) -> str:
        return self._label

    @label.setter
    def label(self, value: str) -> None:
        value = value.strip()
        if not value:
            raise ValueError("label must not be empty")
        self._label = value
```

Механізм той самий: в обох мовах аксесор живе на класі (у JS на прототипі), присвоєння в конструкторі вже проходить через setter, а викликаючий код пише `field.label`. Розходиться культура і сховище. У TS `#label` справді недоступне ззовні, а в Python `_label` лише конвенція (m4-l01), і будь-хто може прочитати `field._label`. І в TS пара `private _x` плюс геттер часто з'являється з першого дня "про всяк випадок"; у Python property без логіки, що просто віддає й присвоює `_x`, вважається шумом, бо публічний атрибут дає те саме і пізніше без втрат переписується на property.

> **Пастка.** `get_label()` і `set_label()` у Python-коді виглядають як переклад з Java і на code review майже завжди повертаються з проханням "зробіть атрибут". Методи з дієсловом лишаються для того, що робить роботу: `load_schema()`, `render()`, `validate()`. Межу між ними розібрано в розділі про те, коли property не варто.

## `@property`, setter і deleter

`@property` перетворює метод на геттер: доступ `obj.span` викликає функцію без дужок. Якщо setter не оголошено, властивість доступна лише для читання, і спроба присвоєння дає `AttributeError` з точним текстом. Це спосіб зробити read-only значення без окремого ключового слова на кшталт `readonly` з TS, причому заборона діє в runtime, а не лише в перевірці типів.

```python live
class RangeField:
    def __init__(self, minimum: int, maximum: int) -> None:
        self.minimum = minimum
        self.maximum = maximum

    @property
    def span(self) -> int:
        return self.maximum - self.minimum


r = RangeField(0, 10)
print(r.span)
r.maximum = 25
print(r.span)

try:
    r.span = 5
except AttributeError as e:
    print("AttributeError:", e)

try:
    del r.span
except AttributeError as e:
    print("AttributeError:", e)
```

```text
10
25
AttributeError: property 'span' of 'RangeField' object has no setter
AttributeError: property 'span' of 'RangeField' object has no deleter
```

`span` тут обчислювана властивість (computed property, загальний термін, у документації Python окремої назви не має): значення не зберігається, а рахується при кожному читанні. Тому після зміни `maximum` воно одразу актуальне, і синхронізувати нічого не треба. Кешу немає, і це правильна поведінка за замовчуванням: кеш потрібен лише для дорогих обчислень (розділ нижче).

<!-- task: t1 -->

Setter оголошується декоратором `@<ім'я>.setter`. Це не магічний синтаксис, а метод `setter` на вже створеному об'єкті property: він повертає новий property з тим самим геттером і доданим setter-ом. Звідси правило, що функція setter-а мусить мати те саме ім'я, що й властивість: результат декоратора присвоюється імені функції, і лише так новий об'єкт з обома функціями замінить старий на класі. Перевірки в setter-і спрацьовують і при створенні, бо `self.max_length = ...` в `__init__` це таке саме присвоєння, як ззовні; валідація живе в одному місці.

```python live
class TextField:
    def __init__(self, name: str, max_length: int = 255) -> None:
        self.name = name
        self.max_length = max_length

    @property
    def max_length(self) -> int:
        return self._max_length

    @max_length.setter
    def max_length(self, value: int) -> None:
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(f"max_length must be int, got {type(value).__name__}")
        if value < 1:
            raise ValueError(f"max_length must be >= 1, got {value}")
        self._max_length = value


f = TextField("bio", 500)
print(f.max_length)

for bad in [0, "100", True]:
    try:
        f.max_length = bad
    except (TypeError, ValueError) as e:
        print(f"{type(e).__name__}: {e}")

try:
    TextField("bio", -1)
except ValueError as e:
    print("in __init__:", e)

print(f.max_length)
```

```text
500
ValueError: max_length must be >= 1, got 0
TypeError: max_length must be int, got str
TypeError: max_length must be int, got bool
in __init__: max_length must be >= 1, got -1
500
```

`isinstance(value, bool)` перевіряється окремо, бо `bool` у Python підклас `int` (m1-l02), і `True` інакше пройшов би як `1`. Після невдалих присвоєнь значення лишилося `500`: setter кидає виняток до того, як змінить стан, і це варто тримати як звичку, щоб об'єкт ніколи не опинявся напіводновленим.

> **Пастка.** У setter-і присвоюють у `self._label`, а не в `self.label`. Друге знову викликає той самий setter, і так до `RecursionError`. У TS це та сама помилка (`set label(v) { this.label = v }`), але в Python її роблять частіше, бо атрибут і властивість пишуться однаково.

```python
class Field:
    @property
    def label(self) -> str:
        return self._label

    @label.setter
    def label(self, value: str) -> None:
        self.label = value


try:
    Field().label = "Email"
except RecursionError as e:
    print("RecursionError:", e)
```

```text
RecursionError: maximum recursion depth exceeded
```

`@<ім'я>.deleter` задає, що відбувається на `del obj.attr`. Потрібен рідко; реальний випадок це "скинути до значення за замовчуванням", коли саме значення за замовчуванням обчислюється. Тут `placeholder`, якщо його не задали, будується з підпису, а `del` повертає до цієї поведінки.

```python live
class TextField:
    def __init__(self, label: str) -> None:
        self.label = label
        self._placeholder: str | None = None

    @property
    def placeholder(self) -> str:
        if self._placeholder is None:
            return f"Enter {self.label.lower()}"
        return self._placeholder

    @placeholder.setter
    def placeholder(self, value: str) -> None:
        self._placeholder = value

    @placeholder.deleter
    def placeholder(self) -> None:
        self._placeholder = None


f = TextField("Email")
print(f.placeholder)
f.placeholder = "you@example.com"
print(f.placeholder)
del f.placeholder
print(f.placeholder)
```

```text
Enter email
you@example.com
Enter email
```

<!-- task: q2 -->

<!-- task: t2 -->

## Коли property не варто: ціна доступу і `cached_property`

Читач коду бачить `job.report` і припускає три речі: це дешево, повторне читання дає те саме, і нічого не змінюється. Property, що ходить у мережу, читає файл, рахує щось важке або змінює стан, ламає всі три припущення, і ламає непомітно, бо зовні це атрибут. Найпростіший наслідок: умова на кшталт `if job.report and job.report.ok` виконує роботу двічі.

```python
class Job:
    def __init__(self) -> None:
        self.loads = 0

    @property
    def report(self) -> dict:
        self.loads += 1  # уявіть тут HTTP-запит
        return {"ok": True}


job = Job()
if job.report and job.report["ok"]:
    print("ok")
for _ in range(3):
    job.report
print("loads:", job.loads)
```

```text
ok
loads: 5
```

Правило: якщо за доступом стоїть I/O, помітний час, побічний ефект або виняток, який залежить від зовнішнього світу, це метод з дієсловом у назві, `load_report()` або `fetch_schema()`. Дужки й дієслово чесно кажуть, що буде робота, і викликаючий код сам вирішить, зберегти результат у змінну чи ні. Property лишається для дешевого похідного значення зі стану самого об'єкта.

Проміжний випадок: обчислення без I/O, але дороге, і стан, з якого воно рахується, після створення не змінюється. Для цього є `functools.cached_property` (офіційна назва, стандартна бібліотека). Перше читання викликає функцію і кладе результат у `__dict__` екземпляра під тим самим іменем; далі читається вже звичайний атрибут, функція більше не викликається.

```python live
from functools import cached_property


class FormSchema:
    def __init__(self, fields: list[dict]) -> None:
        self.fields = fields
        self.builds = 0

    @cached_property
    def by_id(self) -> dict[str, dict]:
        self.builds += 1
        return {f["id"]: f for f in self.fields}


schema = FormSchema([{"id": "email"}, {"id": "phone"}])
print("by_id" in schema.__dict__)
print(schema.by_id["email"])
print(schema.by_id["phone"])
print("builds:", schema.builds)
print("by_id" in schema.__dict__)
```

```text
False
{'id': 'email'}
{'id': 'phone'}
builds: 1
True
```

> **Пастка.** `cached_property` не знає, від чого залежить результат. Якщо стан змінився, кеш лишається старим, і жодної помилки не буде. Скидання робиться через `del obj.attr`, але `del` на ще не обчисленій властивості кидає `AttributeError`, тому в методах, що змінюють стан, надійніше `self.__dict__.pop("by_id", None)`.

```python
from functools import cached_property


class FormSchema:
    def __init__(self, fields: list[dict]) -> None:
        self.fields = fields

    @cached_property
    def by_id(self) -> dict[str, dict]:
        return {f["id"]: f for f in self.fields}


schema = FormSchema([{"id": "email"}])
print(list(schema.by_id))
schema.fields.append({"id": "phone"})
print(list(schema.by_id))
del schema.by_id
print(list(schema.by_id))

fresh = FormSchema([])
try:
    del fresh.by_id
except AttributeError as e:
    print("AttributeError:", e)
print(fresh.__dict__.pop("by_id", None))

schema.by_id = {}
print(schema.by_id)
```

```text
['email']
['email']
['email', 'phone']
AttributeError: 'FormSchema' object has no attribute 'by_id'
None
{}
```

Ще дві властивості `cached_property`, про які варто знати. Значення можна перезаписати звичайним присвоєнням (останній рядок прикладу вище), тобто це не read-only, на відміну від property без setter-а. І вона потребує `__dict__` екземпляра, тому з `__slots__` не працює (розділ про `__slots__` нижче). З Python 3.12 у неї немає внутрішнього блокування, тож у багатопотоковому коді функція може виконатись більше одного разу. `lru_cache` на методах і його пастка з `self` у кеші це m5-l03.

<!-- task: t3 -->

## Під капотом: property це дескриптор

Дескриптор (descriptor, офіційний термін документації, є окремий "Descriptor HowTo Guide") це об'єкт, клас якого визначає `__get__`, `__set__` або `__delete__`, і який лежить як атрибут класу. Коли Python шукає атрибут на екземплярі й знаходить на класі дескриптор, він не віддає його як є, а викликає відповідний метод. `property` це просто вбудований клас з цими трьома методами, і `@property` створює його екземпляр.

```python live
class RangeField:
    def __init__(self, minimum: int, maximum: int) -> None:
        self.minimum = minimum
        self.maximum = maximum

    @property
    def span(self) -> int:
        return self.maximum - self.minimum


r = RangeField(0, 10)
prop = RangeField.__dict__["span"]
print(type(prop).__name__)
print(hasattr(prop, "__get__"), hasattr(prop, "__set__"))
print(prop.__get__(r, RangeField))
print(RangeField.span is prop)
print(prop.fget.__name__, prop.fset)
```

```text
property
True True
10
True
span None
```

Звернення через клас, `RangeField.span`, віддає сам об'єкт property: дескриптор отримує `obj=None` і за конвенцією повертає себе. `prop.__get__(r, RangeField)` це рівно те, що робить `r.span`.

> **Під капотом.** Пошук `obj.x` у `object.__getattribute__` іде так. Спершу `x` шукається в класі та його предках (MRO, m4-l04). Якщо знайдено дескриптор даних (data descriptor, офіційний термін: є `__set__` або `__delete__`), викликається його `__get__`, і `__dict__` екземпляра навіть не дивляться. Інакше шукається в `obj.__dict__`. Інакше, якщо на класі знайдено дескриптор без даних (non-data descriptor, лише `__get__`), викликається він, а якщо там звичайне значення, воно повертається. Інакше `AttributeError` або `__getattr__` (m4-l02). Property завжди дескриптор даних, навіть без setter-а: `__set__` у нього є і кидає "has no setter". `cached_property` дескриптор без даних, і саме тому значення, яке вона поклала в `__dict__`, перемагає її саму при наступному читанні.

Власний дескриптор потрібен, коли однакова логіка повторюється на багатьох атрибутах. Писати по property на кожне поле з перевіркою типу означає копіювати той самий setter. Дескриптор `Validated` нижче пишеться раз і ставиться на скільки завгодно полів. `__set_name__(owner, name)` викликається один раз при створенні класу і повідомляє дескриптору, під яким іменем його поклали, тож не треба повторювати ім'я в аргументах, як `Validated(str, "name")`.

```python live
class Validated:
    def __init__(self, kind: type) -> None:
        self.kind = kind

    def __set_name__(self, owner: type, name: str) -> None:
        self.public = name
        self.private = "_" + name

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        return getattr(obj, self.private)

    def __set__(self, obj, value) -> None:
        if not isinstance(value, self.kind):
            raise TypeError(
                f"{self.public} must be {self.kind.__name__}, got {type(value).__name__}"
            )
        setattr(obj, self.private, value)


class Element:
    name = Validated(str)
    order = Validated(int)

    def __init__(self, name: str, order: int) -> None:
        self.name = name
        self.order = order


a = Element("email", 1)
b = Element("phone", 2)
print(a.name, a.order, b.name, b.order)
print(vars(a))
print(Element.order.public, Element.order.private)

try:
    b.order = "3"
except TypeError as e:
    print("TypeError:", e)
```

```text
email 1 phone 2
{'_name': 'email', '_order': 1}
order _order
TypeError: order must be int, got str
```

Один екземпляр `Validated` обслуговує всі екземпляри `Element`, тому значення він зберігає не в собі, а на `obj`. Покласти `self.value = value` у дескрипторі означає, що `a` і `b` ділитимуть одне значення: це класична помилка першого дескриптора. Поля моделей у SQLAlchemy і Django ORM побудовані саме на цьому протоколі: `User.email` на класі це дескриптор, а `user.email` на екземплярі значення.

Звідси відповідь, чому дескриптор живе на класі, а не на екземплярі. `object.__getattribute__` перевіряє наявність `__get__` лише в того, що знайдено на `type(obj)`. Значення в `__dict__` екземпляра повертається як є, хоч би яким об'єктом воно було, тож property, присвоєна екземпляру, це просто об'єкт property в атрибуті.

```python
class Field:
    pass


f = Field()
f.upper_label = property(lambda self: "EMAIL")
print(type(f.upper_label).__name__)

Field.upper_label = property(lambda self: "EMAIL")
g = Field()
print(g.upper_label)
```

```text
property
EMAIL
```

> **JS-аналог.** `Object.defineProperty(obj, "x", { get() {...} })` працює на будь-якому об'єкті, включно з окремим екземпляром, і саме так у JS часто "дочіплюють" аксесор. У Python аксесор на окремому екземплярі неможливий: дескриптор діє лише з класу, і присвоєння класу змінює поведінку всіх екземплярів одразу. Якщо одному об'єкту потрібна інша поведінка, це інший клас або стратегія (m4-l08).

Дескриптори не екзотика, а механізм, на якому стоять звичайні методи. Функція це дескриптор без даних: `__get__` функції повертає bound method з прив'язаним `self` (m4-l01). `classmethod` у `__get__` прив'язує клас замість екземпляра, `staticmethod` повертає функцію без прив'язки. Ось ті самі три виклики вручну.

```python live
class Element:
    def render(self) -> str:
        return "render"

    @classmethod
    def build(cls) -> str:
        return f"build {cls.__name__}"

    @staticmethod
    def slug(text: str) -> str:
        return text.lower()


el = Element()
raw = Element.__dict__

print(type(raw["render"]).__name__, type(raw["build"]).__name__, type(raw["slug"]).__name__)
print(raw["render"].__get__(el, Element)())
print(raw["build"].__get__(el, Element)())
print(raw["slug"].__get__(el, Element)("Email"))
print(el.render.__self__ is el, Element.build.__self__ is Element)
```

```text
function classmethod staticmethod
render
build Element
email
True True
```

<!-- task: q1 -->

<!-- task: t4 -->

## `__slots__`: фіксований набір атрибутів

Звичайний екземпляр поводиться як JS-об'єкт: у нього можна дописати будь-який атрибут, включно з одруківкою, і нічого не впаде. Атрибут класу `__slots__` (офіційна назва; `__x__`-імена загалом звуть dunder, від double underscore, це жаргон спільноти) замінює цю гнучкість на фіксований список імен. Для кожного імені Python створює на класі дескриптор (`member_descriptor`), а в екземплярі резервує комірку фіксованого розміру, і `__dict__` екземпляр не отримує.

```python live
class Plain:
    def __init__(self, name: str) -> None:
        self.name = name


class Slotted:
    __slots__ = ("name",)

    def __init__(self, name: str) -> None:
        self.name = name


p = Plain("email")
p.nmae = "phone"
print(vars(p))

s = Slotted("email")
try:
    s.nmae = "phone"
except AttributeError as e:
    print("AttributeError:", e)

print(hasattr(p, "__dict__"), hasattr(s, "__dict__"))
print(type(Slotted.name).__name__)

empty = Slotted.__new__(Slotted)
try:
    empty.name
except AttributeError as e:
    print("AttributeError:", e)
```

```text
{'name': 'email', 'nmae': 'phone'}
AttributeError: 'Slotted' object has no attribute 'nmae'
True False
member_descriptor
AttributeError: 'Slotted' object has no attribute 'name'
```

Слот це дескриптор на класі, так само як property з попереднього розділу: `s.name` читає комірку через `Slotted.name.__get__`. Останній рядок показує, що слот описує місце, а не значення: поки в комірку нічого не записали, читання дає `AttributeError`, як і для звичайного відсутнього атрибута.

Друга причина для `__slots__` це пам'ять. Різницю видно на ста тисячах об'єктів. Цифри нижче з одного запуску на цій машині (CPython 3.12, macOS, arm64, 64-бітна збірка); у браузерному Pyodide збірка 32-бітна, і числа там інші, тому цей приклад не інтерактивний. Рахує `tracemalloc`, який бачить усі виділення пам'яті, а не `sys.getsizeof`, і чому саме так, видно з першого рядка виводу.

```python
import sys
import tracemalloc


class Plain:
    def __init__(self, id, type, name):
        self.id = id
        self.type = type
        self.name = name


class Slotted:
    __slots__ = ("id", "type", "name")

    def __init__(self, id, type, name):
        self.id = id
        self.type = type
        self.name = name


def bytes_per_instance(cls, touch_dict=False):
    tracemalloc.start()
    items = [cls("e1", "input", "email") for _ in range(100_000)]
    if touch_dict:
        for obj in items:
            obj.__dict__
    size, _ = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return size // len(items)


print("getsizeof:", sys.getsizeof(Plain("e1", "input", "email")), sys.getsizeof(Slotted("e1", "input", "email")))
print("Plain:  ", bytes_per_instance(Plain))
print("Slotted:", bytes_per_instance(Slotted))
print("Plain after __dict__:", bytes_per_instance(Plain, touch_dict=True))
```

```text
getsizeof: 48 56
Plain:   96
Slotted: 64
Plain after __dict__: 160
```

> **Пастка.** `sys.getsizeof` каже, що звичайний екземпляр (48) легший за slotted (56), і це неправда. `getsizeof` рахує лише сам об'єкт, без пам'яті під значення атрибутів, яку звичайний екземпляр тримає окремо. `tracemalloc` бачить усе: 96 байт проти 64, тобто третина економії на кожному об'єкті.

> **Під капотом.** У CPython 3.11+ звичайний екземпляр теж не створює словник одразу: значення атрибутів лежать у компактному масиві, а справжній `__dict__` матеріалізується при першому зверненні до нього (`vars(obj)`, `obj.__dict__`, серіалізація через `__dict__`). Останній рядок виводу показує ціну: після такого звернення об'єкт важить 160 байт. Slotted-екземпляр стабільно 64, хоч би що з ним робили. Через цю оптимізацію старі статті перебільшують і виграш за пам'яттю, і виграш у швидкості доступу: у 3.12 різниця в часі доступу в межах шуму (вимір у m2-l05).

<!-- task: q3 -->

У `__slots__` є обмеження, і всі вони прямо випливають з "немає `__dict__`, є фіксовані комірки". Нащадок без власних `__slots__` знову отримує `__dict__`, і захист від одруківок тихо зникає; кожен клас в ієрархії має оголосити свої `__slots__` лише з новими іменами. Два батьки з непорожніми слотами несумісні, бо їхні комірки претендують на ті самі позиції в пам'яті. Слабкі посилання (`weakref`) потребують окремого слота `__weakref__`. Ім'я слота не можна одночасно зробити атрибутом класу: значення за замовчуванням через `name = "x"` у тілі класу і property з тим самим іменем дають помилку ще при створенні класу.

```python
import weakref


class Base:
    __slots__ = ("id",)


class Loose(Base):
    pass


class Strict(Base):
    __slots__ = ("label",)


loose = Loose()
loose.nmae = "oops"
print("Loose:", vars(loose))

strict = Strict()
try:
    strict.nmae = "oops"
except AttributeError as e:
    print("Strict:", e)


class Other:
    __slots__ = ("type",)


try:
    class Both(Base, Other):
        pass
except TypeError as e:
    print("TypeError:", e)

try:
    weakref.ref(Base())
except TypeError as e:
    print("TypeError:", e)


class WithRef:
    __slots__ = ("id", "__weakref__")


print(weakref.ref(WithRef()) is not None)

try:
    class WithDefault:
        __slots__ = ("status",)
        status = "queued"
except ValueError as e:
    print("ValueError:", e)
```

```text
Loose: {'nmae': 'oops'}
Strict: 'Strict' object has no attribute 'nmae'
TypeError: multiple bases have instance lay-out conflict
TypeError: cannot create weak reference to 'Base' object
True
ValueError: 'status' in __slots__ conflicts with class variable
```

Звідси і найпоширеніша комбінація slots з property: слот під "сире" значення з підкресленням, property з публічним іменем поверх нього. `cached_property` із цією парою не працює, їй потрібен `__dict__`.

```python
from functools import cached_property


class Job:
    __slots__ = ("_status",)

    def __init__(self) -> None:
        self._status = "queued"

    @property
    def status(self) -> str:
        return self._status

    @cached_property
    def summary(self) -> str:
        return f"job is {self._status}"


job = Job()
print(job.status)
try:
    job.summary
except TypeError as e:
    print("TypeError:", e)
```

```text
queued
TypeError: No '__dict__' attribute on 'Job' instance to cache 'summary' property.
```

Писати `__slots__` вручну доводиться в звичайних класах. Для класів-записів зручніший шлях `@dataclass(slots=True)` з m2-l05: він генерує `__slots__` з анотацій полів і обходить конфлікт зі значеннями за замовчуванням, бо будує новий клас без атрибутів класу під ці імена. Коли вмикати: об'єктів десятки тисяч і більше (вузли дерева, рядки, події) або важливий захист від одруківок у класі з фіксованою формою. Коли ні: класи, яким потрібні динамічні атрибути, `cached_property` або множинне наслідування від кількох класів зі станом.

<!-- task: t5 -->

## Де валідувати: property, `__post_init__` чи Pydantic

Ту саму перевірку `max_length >= 1` можна поставити в трьох місцях, і вони відрізняються не синтаксисом, а моментом, коли перевірка спрацьовує. `__post_init__` у dataclass (m2-l05) виконується лише при створенні: подальше присвоєння його обходить. Pydantic-модель (m2-l09) за замовчуванням теж перевіряє лише при створенні, а на присвоєння лише з `validate_assignment=True`. Property перевіряє кожне присвоєння, бо присвоєння і є викликом setter-а.

```python
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field, ValidationError


@dataclass
class DcField:
    max_length: int

    def __post_init__(self) -> None:
        if self.max_length < 1:
            raise ValueError("max_length must be >= 1")


class PropField:
    def __init__(self, max_length: int) -> None:
        self.max_length = max_length

    @property
    def max_length(self) -> int:
        return self._max_length

    @max_length.setter
    def max_length(self, value: int) -> None:
        if value < 1:
            raise ValueError("max_length must be >= 1")
        self._max_length = value


class PdField(BaseModel):
    max_length: int = Field(ge=1)


class PdStrictField(BaseModel):
    model_config = ConfigDict(validate_assignment=True)
    max_length: int = Field(ge=1)


dc = DcField(10)
dc.max_length = -5
print("dataclass:", dc)

pd = PdField(max_length="10")
pd.max_length = -5
print("pydantic:", pd)

for obj in [PropField(10), PdStrictField(max_length=10)]:
    try:
        obj.max_length = -5
    except (ValueError, ValidationError) as e:
        print(type(obj).__name__, "->", type(e).__name__)
```

```text
dataclass: DcField(max_length=-5)
pydantic: max_length=-5
PropField -> ValueError
PdStrictField -> ValidationError
```

Зверніть увагу на `PdField(max_length="10")`: Pydantic привів рядок до `int`, а property і `__post_init__` такого не роблять, і `"10" < 1` у них впало б з `TypeError`. Це і є межа відповідальності, яка звучала в m2-l05 і m2-l09: дані ззовні (JSON запиту, конфіг з файлу) валідує Pydantic на межі системи, з приведенням типів і всіма помилками разом. Далі всередині коду живуть об'єкти, яким потрібно стерегти власні інваріанти.

| Де | Коли перевіряє | Приведення типів | Помилки | Доречно для |
|---|---|---|---|---|
| property setter | кожне присвоєння | лише те, що напишете | перша | змінюваний стан з правилами переходу, нормалізація одного поля |
| `__post_init__` | лише при створенні | немає | перша | інваріанти між полями dataclass, що після створення не змінюється (часто `frozen=True`) |
| Pydantic | створення, присвоєння з `validate_assignment` | так | усі разом, з шляхом | вхідні дані: JSON, конфіги, запити |

Практичне правило. Якщо об'єкт незмінний, достатньо перевірки при створенні, і це `__post_init__` у frozen dataclass або Pydantic, якщо дані ззовні. Якщо об'єкт змінюється в процесі життя, і є правила, яких зміни мають дотримуватись (статус задачі, лічильник спроб, межі діапазону), це property, бо лише він бачить кожне присвоєння. Валідувати ту саму річ двічі, у Pydantic на вході й у property всередині, нормально, якщо це різні правила: формат на межі, допустимі переходи в домені.

## Для капстоуну

`GenerationJob` з m4-l01 тримає статус як рядок, і будь-який код може написати `job.status = "done"` для задачі, яка ще навіть не стартувала. Property робить переходи явними: таблиця допустимих переходів живе в класі, setter відмовляє в недопустимому і заодно фіксує час старту й завершення. `duration` обчислювана властивість: для задачі, що ще виконується, вона показує час на поточний момент. Годинник передається в конструктор, щоб тести не залежали від реального часу (у бекенді це буде `time.monotonic`). Рядки статусів у капстоуні стануть `StrEnum` з m4-l06.

```python live
from collections.abc import Callable


class GenerationJob:
    __slots__ = ("id", "_status", "started_at", "finished_at", "_clock")

    TRANSITIONS = {
        "queued": {"running"},
        "running": {"done", "failed"},
        "done": set(),
        "failed": set(),
    }

    def __init__(self, id: str, clock: Callable[[], float]) -> None:
        self.id = id
        self._clock = clock
        self._status = "queued"
        self.started_at: float | None = None
        self.finished_at: float | None = None

    @property
    def status(self) -> str:
        return self._status

    @status.setter
    def status(self, new: str) -> None:
        if new not in self.TRANSITIONS[self._status]:
            raise ValueError(f"{self.id}: {self._status} -> {new} is not allowed")
        if new == "running":
            self.started_at = self._clock()
        else:
            self.finished_at = self._clock()
        self._status = new

    @property
    def duration(self) -> float | None:
        if self.started_at is None:
            return None
        end = self.finished_at if self.finished_at is not None else self._clock()
        return end - self.started_at


ticks = iter([100.0, 102.5, 104.0])
job = GenerationJob("signup-p1", clock=lambda: next(ticks))
print(job.status, job.duration)

job.status = "running"
print(job.status, job.duration)

job.status = "done"
print(job.status, job.duration)

for bad in ["running", "queued"]:
    try:
        job.status = bad
    except ValueError as e:
        print("ValueError:", e)

try:
    job.duration = 0
except AttributeError as e:
    print("AttributeError:", e)
```

```text
queued None
running 2.5
done 4.0
ValueError: signup-p1: done -> running is not allowed
ValueError: signup-p1: done -> queued is not allowed
AttributeError: property 'duration' of 'GenerationJob' object has no setter
```

`__slots__` тут обґрунтований: задач у черзі може бути багато, а фіксована форма об'єкта захищає від `job.stauts = ...`. Константа `TRANSITIONS` це атрибут класу, а не слот, тому конфлікту немає. Зверніть увагу, що `status` у слотах немає: там `_status`, а публічне ім'я займає property.

> **Для капстоуну.** Елементи дерева форми в капстоуні вже `@dataclass(frozen=True, slots=True)` з m2-l05, і саме для них економія на кожному об'єкті має сенс: великий конфіг це тисячі вузлів, а сервер тримає кілька конфігів одночасно. Валідація конфігу лишається в Pydantic-моделях на вході API (m2-l09), а property стереже те, що змінюється під час роботи сервера: статус задачі, кількість спроб, прогрес публікації.

## Типові помилки JS-розробника

1. **Приватне поле плюс геттер як норма.** Переносять `private _label` + `get label()` або `getLabel()` з першого дня. Це шум: публічний атрибут дає той самий інтерфейс і пізніше без змін у викликаючому коді стає property.

   ```python
   class TextField:
       def __init__(self, label: str) -> None:
           self.label = label  # property з'явиться, коли з'явиться логіка
   ```

2. **`Object.defineProperty` на екземплярі.** Пишуть `obj.x = property(...)` або чекають, що аксесор можна додати окремому об'єкту. Дескриптор діє лише з класу; на екземплярі це звичайне значення.

   ```python
   f.upper = property(lambda self: "X")
   print(type(f.upper).__name__)  # property, а не "X"
   ```

3. **Геттер з побічним ефектом або I/O.** `@property def report(self): return requests.get(...)` за аналогією з "розумними" геттерами. Кожне читання повторює роботу, і читач цього не бачить. Правильно: метод з дієсловом.

   ```python
   def load_report(self) -> dict:
       ...
   report = job.load_report()
   ```

4. **Присвоєння самій властивості в setter-і.** `self.label = value` усередині `@label.setter` дає `RecursionError`. Правильно: сховище з підкресленням.

   ```python
   @label.setter
   def label(self, value: str) -> None:
       self._label = value.strip()
   ```

5. **Setter з іншим ім'ям функції.** `@label.setter def set_label(...)` створює нову властивість `set_label`, а `label` лишається read-only. Функції геттера, setter-а і deleter-а мають називатися однаково.

   ```python
   @label.setter
   def label(self, value: str) -> None:  # те саме ім'я
       self._label = value
   ```

6. **`cached_property` на змінюваних даних без скидання.** Кешують індекс зі списку, потім додають елемент і читають старий індекс. Правильно: скидати кеш у кожному методі, що змінює джерело.

   ```python
   def add_field(self, field: dict) -> None:
       self.fields.append(field)
       self.__dict__.pop("by_id", None)
   ```

7. **Очікування JS-об'єкта від slotted-класу.** Дописують атрибут "на льоту", отримують `AttributeError`; або успадковують від slotted-класу без власних `__slots__` і втрачають захист. Правильно: кожен клас ієрархії оголошує `__slots__` з новими іменами.

   ```python
   class Strict(Base):
       __slots__ = ("label",)
   ```

8. **`sys.getsizeof` як мірило пам'яті.** Він не рахує значення атрибутів і показує звичайний екземпляр легшим за slotted. Правильно: `tracemalloc` на великій кількості об'єктів.

   ```python
   tracemalloc.start()
   items = [Slotted("e1", "input", "email") for _ in range(100_000)]
   print(tracemalloc.get_traced_memory()[0] // len(items))
   ```

## Підсумок

- Клас починають з публічних атрибутів; коли з'являється логіка, атрибут стає property без зміни викликаючого коду (uniform access).
- `@property` без setter-а це read-only у runtime; присвоєння дає `AttributeError: property ... has no setter`.
- Setter валідує кожне присвоєння, включно з тим, що в `__init__`; зберігає в `self._x`, а не в `self.x`; функції мають однакове ім'я.
- Обчислювана властивість рахується при кожному читанні, кешу немає. Дороге, з I/O або побічними ефектами це метод з дієсловом.
- `cached_property` рахує раз і кладе результат у `__dict__`; при зміні стану скидати через `self.__dict__.pop(name, None)`; зі `__slots__` не працює.
- property, функції, `classmethod`, `staticmethod`, слоти це дескриптори; дескриптор діє лише як атрибут класу.
- Дескриптор даних (є `__set__`) перемагає `__dict__` екземпляра, дескриптор без даних йому програє.
- Власний дескриптор з `__set_name__` для однакової логіки на багатьох полях; значення зберігати на екземплярі, не в дескрипторі.
- `__slots__` прибирає `__dict__`: одруківки стають `AttributeError`, на цій машині 64 байти проти 96 на об'єкт. Нащадки мають оголошувати власні слоти; `__weakref__` окремо.
- Валідація: Pydantic на вході, `__post_init__` для інваріантів незмінного запису, property для правил змін стану.

## Що далі

Наступний урок m4-l04 про наслідування, `super()` і MRO. Порядок пошуку атрибута з розділу про дескриптори там розширюється на весь ланцюжок батьків, а правило "кожен клас ієрархії оголошує власні `__slots__`" і конфлікт двох батьків зі слотами знадобляться, коли мова дійде до mixins: невеликих класів з поведінкою без стану.
