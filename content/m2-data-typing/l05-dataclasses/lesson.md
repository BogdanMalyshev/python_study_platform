---
id: m2-l05
module: m2-data-typing
title: "dataclasses як типізований запис"
summary: "Учень описує внутрішні структури як dataclass: поля з типами й безпечними значеннями за замовчуванням, frozen-записи як ключі словника, __post_init__ для інваріантів, asdict для JSON, match по полях, і знає, де закінчується dataclass і починається Pydantic."
duration_min: 75
prerequisites: [m2-l04]
---

## `@dataclass`: запис без шаблонного коду

У TS запис із полями це `interface` плюс об'єктний літерал: тип живе в компіляторі, об'єкт у runtime, і обидва пишуться в один рядок. У Python так не вийде. Словник доступний лише через `config["mode"]`, а атрибутний доступ `theme.mode` дає тільки екземпляр класу. Ручний клас-запис виглядає як TS-клас з конструктором, і на цьому схожість закінчується.

```ts
class Theme {
  constructor(public mode: "light" | "dark", public primaryColor: string) {}
}
const a = new Theme("dark", "#111827");
const b = new Theme("dark", "#111827");
console.log(a);       // Theme { mode: 'dark', primaryColor: '#111827' }
console.log(a === b); // false
```

```python
class Theme:
    def __init__(self, mode: str, primary_color: str) -> None:
        self.mode = mode
        self.primary_color = primary_color

a = Theme("dark", "#111827")
b = Theme("dark", "#111827")
print(a)
print(a == b)
```

```text
<__main__.Theme object at 0x104ecb410>
False
```

Обидві мови порівнюють такі об'єкти за identity, але JS хоча б показує поля в `console.log`, а Python друкує адресу в пам'яті: стандартні `__repr__` і `__eq__` успадковуються від `object` і нічого не знають про ваші поля. Щоб клас-запис був придатний для відлагодження й тестів, руками дописують `__repr__`, `__eq__`, часто ще й `__hash__`, і кожне нове поле треба не забути додати в усі три. Методи з подвійним підкресленням з обох боків називають dunder-методами (від double underscore; це жаргон спільноти, документація каже "special methods"), детально вони в m4-l02.

`@dataclass` генерує цей шаблонний код за вас. Це decorator (офіційний термін, синтаксис той самий, що в TS): функція, яка отримує щойно створений клас і повертає його ж, дописавши методи. Поля він бере з анотацій класу. Тобто анотації, які інтерпретатор зазвичай ігнорує (m2-l06), тут читаються в runtime і стають специфікацією конструктора.

```python live
from dataclasses import dataclass

@dataclass
class Theme:
    mode: str
    primary_color: str

a = Theme("dark", "#111827")
b = Theme(mode="dark", primary_color="#111827")
print(a)
print(a == b, a is b)
```

```text
Theme(mode='dark', primary_color='#111827')
True False
```

Що саме згенеровано, видно через introspection (офіційний термін: дослідження об'єкта в runtime). `inspect.signature` показує сигнатуру `__init__`, `dataclasses.fields` повертає опис кожного поля, а в `__dict__` класу лежать самі методи.

```python live
import inspect
from dataclasses import MISSING, dataclass, fields

@dataclass
class Theme:
    mode: str
    primary_color: str = "#2563eb"

print(inspect.signature(Theme))
for f in fields(Theme):
    print(f.name, f.type, "required" if f.default is MISSING else repr(f.default))
print([name for name in ("__init__", "__repr__", "__eq__") if name in Theme.__dict__])
print(Theme.__hash__)
```

```text
(mode: str, primary_color: str = '#2563eb') -> None
mode <class 'str'> required
primary_color <class 'str'> '#2563eb'
['__init__', '__repr__', '__eq__']
None
```

Останній рядок не випадковий. Згенерований `__eq__` порівнює поля, а об'єкт, рівність якого залежить від полів, які можна змінити, не може мати стабільного хешу: поклали в set, змінили поле, і об'єкт загубився у "неправильному кошику". Тому звичайний dataclass свідомо unhashable, і в set чи як ключ словника його не покласти. Hashable це офіційний термін з глосарію Python: об'єкт має хеш, який не змінюється за час його життя, і порівнюється через `__eq__`; лише такі об'єкти годяться в set і як ключі dict. Як це змінює `frozen=True`, розібрано нижче.

> **Під капотом.** `dataclasses` буквально збирає текст `__init__`, `__repr__` і `__eq__` рядком і компілює його через `exec`, тому у traceback ці методи видно як `File "<string>"`. Згенерований у 3.12 `__eq__` має такий вигляд:
> ```python
> def __eq__(self, other):
>     if other.__class__ is self.__class__:
>         return (self.mode, self.primary_color) == (other.mode, other.primary_color)
>     return NotImplemented
> ```
> Рівність поелементна, але лише між екземплярами одного класу: структурної типізації, як у TS, тут немає.

> **Пастка.** Анотації для dataclass лише специфікація полів, а не перевірка. `Theme(mode=42, primary_color=None)` створюється без жодної помилки. Перевірку типів роблять mypy статично (m2-l08) або Pydantic у runtime (m2-l09).

```python
from dataclasses import dataclass

@dataclass
class Theme:
    mode: str
    primary_color: str

print(Theme(mode=42, primary_color=None))
```

```text
Theme(mode=42, primary_color=None)
```

<!-- task: q1 -->

## Поля: типи, значення за замовчуванням і `default_factory`

Полем стає кожне ім'я в тілі класу, яке має анотацію. Значення після `=` стає значенням за замовчуванням параметра `__init__`. Ім'я без анотації полем не є: це звичайний атрибут класу, спільний для всіх екземплярів, і в `__init__` його немає. Для констант, які хочеться анотувати, але не можна робити полями, є `ClassVar`. Самі типи пишуться так само, як у m2-l06: `list[str]`, `str | None`, `Literal[...]`; dataclass їх зберігає, але не перевіряє.

```python live
from dataclasses import dataclass, fields
from typing import ClassVar, Literal

ElementType = Literal["input", "text", "button", "block"]

@dataclass
class Element:
    KINDS: ClassVar[tuple[str, ...]] = ("input", "text", "button", "block")
    renderer = "html"

    type: ElementType
    id: str
    name: str | None = None
    label: str = ""

print([f.name for f in fields(Element)])
print(Element("input", "email", name="email"))
print(Element.KINDS, Element.renderer)
print(Element("image", 42))
```

```text
['type', 'id', 'name', 'label']
Element(type='input', id='email', name='email', label='')
('input', 'text', 'button', 'block') html
Element(type='image', id=42, name=None, label='')
```

Порядок полів має значення. Згенерований `__init__` це звичайна функція, а в Python параметр без значення за замовчуванням не може стояти після параметра зі значенням (m1-l07). Dataclass перевіряє це в момент визначення класу, тобто при імпорті модуля, а не при першому створенні екземпляра.

```python
from dataclasses import dataclass

@dataclass
class Element:
    type: str = "input"
    id: str
```

```text
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    @dataclass
     ^^^^^^^^^
TypeError: non-default argument 'id' follows default argument
```

Тепер пастка з m1-l07: `def f(tags=[])` обчислює список один раз, і всі виклики ділять його. Значення поля після `=` обчислюється так само, один раз при визначенні класу, і стало б спільним для всіх екземплярів. Dataclass цю пастку бачить і відмовляється створювати клас.

```python
from dataclasses import dataclass

@dataclass
class Element:
    id: str
    classes: list[str] = []
```

```text
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    @dataclass
     ^^^^^^^^^
ValueError: mutable default <class 'list'> for field classes is not allowed: use default_factory
```

Правильний спосіб це `field(default_factory=...)`: замість значення передається callable (офіційний термін: будь-що, що можна викликати), і згенерований `__init__` викликає його для кожного нового екземпляра. `list`, `dict` і `set` самі є такими callable; для непорожнього значення підходить `lambda`.

```python live
from dataclasses import dataclass, field

@dataclass
class Element:
    id: str
    classes: list[str] = field(default_factory=list)
    attrs: dict[str, str] = field(default_factory=lambda: {"data-role": "field"})

a = Element("email")
b = Element("phone")
a.classes.append("wide")
a.attrs["data-role"] = "primary"
print(a)
print(b)
```

```text
Element(id='email', classes=['wide'], attrs={'data-role': 'primary'})
Element(id='phone', classes=[], attrs={'data-role': 'field'})
```

> **Пастка.** Dataclass перевіряє не "чи змінюване значення", а "чи воно unhashable": `list`, `dict`, `set` і звичайні (не frozen) dataclass відхиляються. Екземпляр звичайного класу має хеш за identity, перевірку проходить і тихо стає спільним для всіх екземплярів, рівно як `def f(tags=[])`.

```python
from dataclasses import dataclass

class Registry:
    def __init__(self) -> None:
        self.items: list[str] = []

@dataclass
class Form:
    registry: Registry = Registry()

a, b = Form(), Form()
a.registry.items.append("email")
print(b.registry.items, a.registry is b.registry)
```

```text
['email'] True
```

<!-- task: t1 -->

## `frozen=True`: незмінність, hash і `replace`

`@dataclass(frozen=True)` забороняє присвоєння полям після `__init__`. Це не `readonly` з TS, який існує лише для компілятора, і не `Object.freeze`, який поза strict mode ігнорує присвоєння мовчки: спроба змінити поле frozen-екземпляра завжди кидає `FrozenInstanceError` у runtime.

```ts
type Theme = Readonly<{ mode: "light" | "dark"; primaryColor: string }>;
const theme: Theme = Object.freeze({ mode: "light", primaryColor: "#2563eb" });
theme.mode = "dark"; // tsc: Cannot assign to 'mode' because it is a read-only property
                     // runtime: TypeError у strict mode, мовчки ігнорується без нього
```

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Theme:
    mode: str = "light"
    primary_color: str = "#2563eb"

theme = Theme()
theme.mode = "dark"
```

```text
Traceback (most recent call last):
  File "example.py", line 9, in <module>
    theme.mode = "dark"
    ^^^^^^^^^^
  File "<string>", line 4, in __setattr__
dataclasses.FrozenInstanceError: cannot assign to field 'mode'
```

У TS два незалежні механізми, компіляторний `readonly` і runtime `Object.freeze`, і їх легко мати лише один. У Python механізм один, runtime: dataclass генерує `__setattr__` і `__delattr__`, які кидають виняток (рядок `File "<string>"` у traceback це саме він). Спільне з `Object.freeze` те, що заморожування неглибоке: захищені прив'язки полів, а не об'єкти, на які поля посилаються.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Element:
    id: str
    classes: list[str]

el = Element("email", ["wide"])
el.classes.append("dark")
print(el)
print(hash(el))
```

```text
Element(id='email', classes=['wide', 'dark'])
Traceback (most recent call last):
  File "example.py", line 11, in <module>
    print(hash(el))
          ^^^^^^^^
  File "<string>", line 3, in __hash__
TypeError: unhashable type: 'list'
```

Звідси правило: всередині frozen-запису колекції тримають як `tuple` (або `frozenset`), а не `list`. Тоді запис справді незмінний і має хеш. Хеш frozen dataclass обчислюється з кортежу полів, тому два рівні записи мають однаковий хеш, а сам запис годиться як ключ словника й елемент set.

```python live
from dataclasses import dataclass

@dataclass(frozen=True)
class Theme:
    mode: str = "light"
    primary_color: str = "#2563eb"

css_cache = {Theme(): "light.css", Theme("dark", "#111827"): "dark.css"}
print(css_cache[Theme("dark", "#111827")])
print(len({Theme(), Theme(), Theme("dark")}))
print(hash(Theme()) == hash(Theme()))
```

```text
dark.css
2
True
```

> **JS-аналог.** У `Map` і `Set` з JS об'єкти-ключі порівнюються за identity: `new Map([[{ mode: "dark" }, "dark.css"]]).get({ mode: "dark" })` дає `undefined`, і тому ключем роблять `JSON.stringify(theme)`. У Python ключем стає сам frozen-запис, бо dict шукає за `__hash__` і `__eq__`, а не за адресою.

"Змінити" frozen-запис означає створити новий з потрібними відмінностями. `dataclasses.replace(obj, **changes)` це `{ ...theme, mode: "dark" }` з JS, але з однією різницею: новий об'єкт створюється через `__init__`, тож нові значення проходять ту саму обробку, що й при звичайному створенні (зокрема `__post_init__` з наступного розділу), а ім'я неіснуючого поля дає помилку, а не тихо додає ключ.

```python live
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Theme:
    mode: str = "light"
    primary_color: str = "#2563eb"

light = Theme()
dark = replace(light, mode="dark")
print(light)
print(dark)
print(replace(light) == light, replace(light) is light)
try:
    replace(light, colour="#000000")
except TypeError as e:
    print("TypeError:", e)
```

```text
Theme(mode='light', primary_color='#2563eb')
Theme(mode='dark', primary_color='#2563eb')
True False
TypeError: Theme.__init__() got an unexpected keyword argument 'colour'
```

<!-- task: q2 -->

<!-- task: t2 -->

## `__post_init__` і параметри `field()`

Згенерований `__init__` лише присвоює поля. Якщо в класі визначено метод `__post_init__`, `__init__` викликає його останнім рядком, коли всі поля вже присвоєні. Це місце для трьох речей: перевірки інваріантів (умов, які мають бути істинними для кожного екземпляра; термін математичний, у спільноті вживається так само), нормалізації значень і обчислення похідних полів. Похідне поле оголошують через `field(init=False)`: воно є в `repr`, `==` і `fields()`, але не є параметром конструктора.

```python live
import inspect
from dataclasses import dataclass, field, replace

@dataclass
class Validation:
    required: bool = False
    min_length: int = 0
    max_length: int | None = None
    bounded: bool = field(init=False)

    def __post_init__(self) -> None:
        if self.min_length < 0:
            raise ValueError(f"min_length must be >= 0, got {self.min_length}")
        if self.max_length is not None and self.max_length < self.min_length:
            raise ValueError(f"max_length {self.max_length} < min_length {self.min_length}")
        self.bounded = self.max_length is not None

print(inspect.signature(Validation))
print(Validation(required=True, max_length=80))
print(Validation())
for kwargs in ({"min_length": 10, "max_length": 5}, {"min_length": -1, "max_length": -5}):
    try:
        Validation(**kwargs)
    except ValueError as e:
        print("ValueError:", e)
try:
    replace(Validation(max_length=80), min_length=100)
except ValueError as e:
    print("ValueError after replace:", e)
```

```text
(required: bool = False, min_length: int = 0, max_length: int | None = None) -> None
Validation(required=True, min_length=0, max_length=80, bounded=True)
Validation(required=False, min_length=0, max_length=None, bounded=False)
ValueError: max_length 5 < min_length 10
ValueError: min_length must be >= 0, got -1
ValueError after replace: max_length 80 < min_length 100
```

У frozen-класі `self.bounded = ...` у `__post_init__` кинув би `FrozenInstanceError`: заборонений `__setattr__` на цей момент уже стоїть. Згенерований `__init__` сам обходить заборону через `object.__setattr__`, і в `__post_init__` роблять так само. Це не хак, а задокументований спосіб для frozen dataclass.

```python live
from dataclasses import dataclass, field

@dataclass(frozen=True)
class Slug:
    text: str
    value: str = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "value", "-".join(self.text.lower().split()))

print(Slug("  Contact   Form "))
print(Slug("Contact Form") == Slug("contact form"))
```

```text
Slug(text='  Contact   Form ', value='contact-form')
False
```

Останній рядок показує, що похідне поле бере участь у порівнянні, а `text` теж, тому два слаги з різним написанням нерівні. Керують цим параметри `field()`: `compare=False` виключає поле з `__eq__`, з `order` і з хешу; `repr=False` прибирає його з `repr`. Типові кандидати: службові дані на кшталт номера рядка у вихідному файлі або сирого JSON, з якого запис зібрано, і все, що не має потрапити в лог.

```python live
from dataclasses import dataclass, field

@dataclass(frozen=True)
class Element:
    id: str
    type: str
    source_line: int = field(default=0, compare=False)
    raw: dict = field(default_factory=dict, repr=False, compare=False)

a = Element("email", "input", source_line=12, raw={"id": "email", "type": "input"})
b = Element("email", "input", source_line=40)
print(a)
print(a == b, hash(a) == hash(b))
print(a.raw)
```

```text
Element(id='email', type='input', source_line=12)
True True
{'id': 'email', 'type': 'input'}
```

Зверніть увагу: frozen-запис має поле-словник і все одно hashable, бо `compare=False` виключив `raw` з хешу. А тепер межа відповідальності. `__post_init__` бачить уже присвоєні значення без жодного приведення типів, падає на першій проблемі (друга помилка з прикладу вище так і не була показана), не знає шляху до поля у вкладеній структурі, і кожну перевірку ви пишете руками. Для даних ззовні потрібно все навпаки: усі помилки разом, шлях `('elements', 0, 'label')`, приведення `"42"` до `42`, розбір JSON. Це робить Pydantic (m2-l09). Правило: `__post_init__` стереже інваріанти, які може порушити ваш власний код (`min_length <= max_length`, "лише `input` має `name`"), а валідація вводу користувача відбувається на межі, до того як дані стануть dataclass.

<!-- task: t3 -->

## `order`, `slots`, `kw_only` і наслідування

`order=True` генерує `__lt__`, `__le__`, `__gt__`, `__ge__`, які порівнюють кортежі полів у порядку оголошення, тобто лексикографічно, як кортежі. Без нього `<` між двома dataclass кидає `TypeError`, і `sorted` не працює.

```python live
from dataclasses import dataclass

@dataclass(frozen=True, order=True)
class SchemaVersion:
    major: int
    minor: int = 0
    patch: int = 0

versions = [SchemaVersion(2, 0, 1), SchemaVersion(1, 9), SchemaVersion(2), SchemaVersion(1, 10)]
print(sorted(versions))
print(SchemaVersion(1, 10) > SchemaVersion(1, 9))
print(max(versions))

@dataclass(frozen=True)
class Theme:
    mode: str

try:
    sorted([Theme("light"), Theme("dark")])
except TypeError as e:
    print("TypeError:", e)
```

```text
[SchemaVersion(major=1, minor=9, patch=0), SchemaVersion(major=1, minor=10, patch=0), SchemaVersion(major=2, minor=0, patch=0), SchemaVersion(major=2, minor=0, patch=1)]
True
SchemaVersion(major=2, minor=0, patch=1)
TypeError: '<' not supported between instances of 'Theme' and 'Theme'
```

`order=True` доречний, лише коли порядок оголошення полів і є природним порядком, як у версії. Для елементів форми він дав би сортування спершу за `type`, потім за `id`, і це семантика, яку ніхто не замовляв. Для сортування за конкретним полем лишається `sorted(items, key=lambda el: el.label)` з m1-l10.

<!-- task: q3 -->

Звичайний екземпляр зберігає атрибути в персональному словнику `__dict__`, і, як у JS-об'єкт, у нього можна дописати будь-що, включно з одруківкою. `slots=True` (3.10+) генерує `__slots__` (офіційний термін): фіксований набір атрибутів, що зберігаються в комірках фіксованого розміру без `__dict__`. Наслідки два: одруківка в імені атрибута стає `AttributeError` замість тихого нового поля, і екземпляр займає менше пам'яті.

```python
from dataclasses import dataclass

@dataclass
class Loose:
    name: str

@dataclass(slots=True)
class Strict:
    name: str

a = Loose("email")
a.nmae = "phone"
print(a, a.__dict__)

b = Strict("email")
b.nmae = "phone"
```

```text
Loose(name='email') {'name': 'email', 'nmae': 'phone'}
Traceback (most recent call last):
  File "example.py", line 16, in <module>
    b.nmae = "phone"
    ^^^^^^
AttributeError: 'Strict' object has no attribute 'nmae'
```

Пам'ять видно на ста тисячах екземплярів. Цифри нижче з одного запуску CPython 3.12 на 64-бітній машині; у Pyodide вони інші, але співвідношення те саме. Третю перевагу, швидший доступ до атрибутів, часто згадують за старими статтями, але в 3.12 її майже немає: з 3.11 звичайний екземпляр теж тримає значення полів компактно, а повноцінний `__dict__` створює лише на вимогу, тому різниця в часі доступу в межах шуму.

```python
import timeit
import tracemalloc
from dataclasses import dataclass

@dataclass
class Plain:
    id: str
    type: str
    name: str

@dataclass(slots=True)
class Slotted:
    id: str
    type: str
    name: str

def bytes_per_instance(cls: type) -> int:
    tracemalloc.start()
    items = [cls("e1", "input", "email") for _ in range(100_000)]
    size, _ = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return size // len(items)

def access_ms(obj: object) -> float:
    return timeit.timeit(lambda: obj.name, number=1_000_000) * 1000

print("plain:", bytes_per_instance(Plain), "bytes,", f"{access_ms(Plain('e1', 'input', 'email')):.0f} ms per 1M reads")
print("slots:", bytes_per_instance(Slotted), "bytes,", f"{access_ms(Slotted('e1', 'input', 'email')):.0f} ms per 1M reads")
```

```text
plain: 96 bytes, 27 ms per 1M reads
slots: 64 bytes, 26 ms per 1M reads
```

`kw_only=True` (3.10+) робить усі поля keyword-only (офіційний термін), тобто параметрами після `*` у сигнатурі, як `def f(*, a, b)` з m1-l07. Це дає дві речі. Виклики читаються: `Condition(field="country", operator="eq", value="UA")` замість трьох позиційних рядків, які легко переплутати. І зникає правило порядку полів, бо keyword-only параметри можуть мати значення за замовчуванням у будь-якому порядку.

```python live
from dataclasses import KW_ONLY, dataclass

@dataclass(kw_only=True)
class Condition:
    operator: str = "eq"
    field: str
    value: str

@dataclass
class Button:
    label: str
    _: KW_ONLY
    action: str = "submit"
    disabled: bool = False

print(Condition(field="country", value="UA"))
print(Button("Send", disabled=True))
try:
    Condition("eq", "country", "UA")
except TypeError as e:
    print("TypeError:", e)
```

```text
Condition(operator='eq', field='country', value='UA')
Button(label='Send', action='submit', disabled=True)
TypeError: Condition.__init__() takes 1 positional argument but 4 were given
```

Друге місце, де `kw_only` рятує, це наслідування. Дочірній dataclass дописує свої поля після полів базового, і згенерований `__init__` іде в тому самому порядку. Якщо в базі є поле зі значенням за замовчуванням, а дочірній клас додає обов'язкове, виходить та сама помилка порядку, і саме така форма в елементів форми: спільні `id` і `visible` у базі, власні обов'язкові поля в нащадках.

```python
from dataclasses import dataclass

@dataclass
class BaseElement:
    id: str
    visible: bool = True

@dataclass
class InputElement(BaseElement):
    name: str
```

```text
Traceback (most recent call last):
  File "example.py", line 8, in <module>
    @dataclass
     ^^^^^^^^^
TypeError: non-default argument 'name' follows default argument
```

```python live
import inspect
from dataclasses import dataclass

@dataclass(kw_only=True)
class BaseElement:
    id: str
    visible: bool = True

@dataclass
class InputElement(BaseElement):
    name: str
    label: str = ""

print(inspect.signature(InputElement))
print(InputElement("email", id="e1"))
```

```text
(name: str, label: str = '', *, id: str, visible: bool = True) -> None
InputElement(id='e1', visible=True, name='email', label='')
```

Keyword-only поля бази переїхали в кінець сигнатури, тому обов'язковий `name` став першим позиційним. При цьому `repr`, `==` і `fields()` ідуть у порядку оголошення: спершу поля бази, потім нащадка. Коли що вмикати: `frozen=True` за замовчуванням для всього, що описує значення (тема, умова, версія конфігу), а змінюваний dataclass лише для накопичувачів і білдерів; `slots=True`, коли екземплярів багато або хочеться захисту від одруківок; `kw_only=True`, коли полів більше трьох, коли кілька полів одного типу або коли є наслідування; `order=True` лише для природного порядку.

## Дерево елементів: композиція, рекурсія і `match`

Поле може мати тип іншого dataclass, і так складається дерево: `FormConfig` містить `Theme` і кортеж `Element`. Для вкладеного значення за замовчуванням працює те саме правило hashability: frozen `Theme()` можна поставити прямо як `theme: Theme = Theme()`, бо незмінний об'єкт безпечно ділити між екземплярами, а змінюваний вимагає `field(default_factory=Theme)`.

Рекурсивне поле, `children` з елементами того самого типу, впирається в порядок виконання: тіло класу виконується до того, як ім'я `Element` з'являється в модулі, а анотації в 3.12 обчислюються одразу.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Element:
    type: str
    id: str
    children: tuple[Element, ...] = ()
```

```text
Traceback (most recent call last):
  File "example.py", line 4, in <module>
    class Element:
  File "example.py", line 7, in Element
    children: tuple[Element, ...] = ()
                    ^^^^^^^
NameError: name 'Element' is not defined
```

Два виходи. Анотація-рядок `tuple["Element", ...]` (forward reference, офіційний термін) відкладає обчислення одного імені. `from __future__ import annotations` на початку модуля робить рядками всі анотації файлу, і рекурсивні, і звичайні. Dataclass це влаштовує, бо типів він не обчислює. Ціна в тому, що `fields(...).type` тепер повертає рядок, а справжній тип дістається через `typing.get_type_hints` (детально про відкладені анотації й зміни в 3.14 в m2-l06).

```python live
from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Literal, get_type_hints

@dataclass(frozen=True, slots=True)
class Condition:
    field: str
    operator: Literal["eq", "neq", "in", "gt", "lt"]
    value: str | int | bool | tuple[str, ...]

@dataclass(frozen=True, slots=True)
class Element:
    type: Literal["input", "text", "button", "block"]
    id: str
    name: str | None = None
    label: str = ""
    children: tuple[Element, ...] = ()
    visible_if: Condition | None = None

def walk(elements: tuple[Element, ...]) -> list[Element]:
    result: list[Element] = []
    for el in elements:
        result.append(el)
        result.extend(walk(el.children))
    return result

form = (
    Element("input", "e1", name="email", label="Email"),
    Element("block", "b1", children=(
        Element("input", "e2", name="company", label="Company",
                visible_if=Condition("email", "neq", "")),
        Element("text", "t1", label="We will contact you"),
    )),
    Element("button", "s1", label="Send"),
)
print([el.id for el in walk(form)])
print(form[1].children[0].visible_if)
print(fields(Element)[4].type)
print(get_type_hints(Element)["children"])
```

```text
['e1', 'b1', 'e2', 't1', 's1']
Condition(field='email', operator='neq', value='')
tuple[Element, ...]
tuple[__main__.Element, ...]
```

`walk` тут збирає список рекурсивно, обходом у глибину в порядку документа. У m5-l02 той самий обхід стане генератором з `yield from`, який не будує проміжних списків.

Dataclass добре працює з `match` з m1-l05. Class pattern `case Element(type="input", name=name)` перевіряє `isinstance`, порівнює `type` з літералом і захоплює `name`, і все це одним рядком, як narrowing за discriminant-полем у TS. Позиційні підпатерни `case Element("block", id)` теж працюють, бо dataclass генерує `__match_args__` (офіційне ім'я атрибута): кортеж імен полів у порядку `__init__`, який каже `match`, якому полю відповідає перша позиція, другому і так далі.

```python live
from dataclasses import dataclass

@dataclass(frozen=True)
class Condition:
    field: str
    operator: str
    value: object

@dataclass(frozen=True)
class Element:
    type: str
    id: str
    name: str | None = None
    label: str = ""
    children: tuple["Element", ...] = ()
    visible_if: Condition | None = None

def describe(el: Element) -> str:
    match el:
        case Element(type="input", name=name, visible_if=Condition(dep, "neq", "")):
            return f"input {name}, shown when {dep} is filled"
        case Element(type="input", name=name):
            return f"input {name}"
        case Element("block", block_id, children=children):
            return f"block {block_id} with {len(children)} children"
        case Element(type=kind, label=label):
            return f"{kind}: {label}"

print(Element.__match_args__)
print(Condition.__match_args__)
for el in (
    Element("input", "e1", name="email"),
    Element("input", "e2", name="company", visible_if=Condition("email", "neq", "")),
    Element("block", "b1", children=(Element("text", "t1"),)),
    Element("button", "s1", label="Send"),
):
    print(describe(el))
```

```text
('type', 'id', 'name', 'label', 'children', 'visible_if')
('field', 'operator', 'value')
input email
input company, shown when email is filled
block b1 with 1 children
button: Send
```

> **Пастка.** Keyword-only поля в `__match_args__` не потрапляють, бо в `__init__` у них немає позиції. Для `kw_only=True` класу позиційний патерн падає в runtime, а не при визначенні функції: пишіть `case Condition(field="email", operator=op)`.

```python
from dataclasses import dataclass

@dataclass(kw_only=True)
class Condition:
    field: str
    operator: str

print(Condition.__match_args__)
match Condition(field="email", operator="eq"):
    case Condition("email", op):
        print(op)
```

```text
()
Traceback (most recent call last):
  File "example.py", line 10, in <module>
    case Condition("email", op):
         ^^^^^^^^^^^^^^^^^^^^^^
TypeError: Condition() accepts 0 positional sub-patterns (2 given)
```

<!-- task: t4 -->

## `asdict`, `astuple` і JSON

`asdict(obj)` перетворює dataclass на словник рекурсивно: вкладені dataclass стають словниками, у списках, кортежах і словниках він заходить у кожен елемент, а все інше копіює через `copy.deepcopy`. `astuple` робить те саме з кортежами. Результат повністю незалежний від оригіналу, і це глибока копія, а не "погляд" на поля.

```python live
from dataclasses import asdict, astuple, dataclass, field

@dataclass
class Theme:
    mode: str = "light"
    primary_color: str = "#2563eb"

@dataclass
class FormConfig:
    id: str
    theme: Theme = field(default_factory=Theme)
    tags: list[str] = field(default_factory=list)

form = FormConfig("signup", tags=["lead"])
data = asdict(form)
print(data)
print(astuple(form))
data["tags"].append("changed")
data["theme"]["mode"] = "dark"
print(form)
print(data["tags"] is form.tags)
```

```text
{'id': 'signup', 'theme': {'mode': 'light', 'primary_color': '#2563eb'}, 'tags': ['lead']}
('signup', ('light', '#2563eb'), ['lead'])
FormConfig(id='signup', theme=Theme(mode='light', primary_color='#2563eb'), tags=['lead'])
False
```

Ціна глибокої копії пропорційна всьому дереву: `asdict` обходить кожен вузол, створює новий словник і копіює кожне значення. На конфігу з десятком полів це непомітно, на дереві з тисячами вузлів у гарячому циклі вже ні. Нижче дерево з 1111 елементів і порівняння з ручною функцією, яка будує ті самі словники без `deepcopy`; цифри з одного запуску і на іншій машині будуть іншими, співвідношення стабільне.

```python
import timeit
from dataclasses import asdict, dataclass

@dataclass(frozen=True, slots=True)
class Element:
    id: str
    type: str
    children: tuple["Element", ...] = ()

def build(depth: int) -> Element:
    if depth == 0:
        return Element("leaf", "input")
    return Element(f"block{depth}", "block", tuple(build(depth - 1) for _ in range(10)))

def to_dict(el: Element) -> dict:
    return {"id": el.id, "type": el.type, "children": [to_dict(c) for c in el.children]}

def count(el: Element) -> int:
    return 1 + sum(count(c) for c in el.children)

tree = build(3)
print(count(tree), "elements")
print(f"asdict:  {timeit.timeit(lambda: asdict(tree), number=20) / 20 * 1000:.2f} ms")
print(f"to_dict: {timeit.timeit(lambda: to_dict(tree), number=20) / 20 * 1000:.2f} ms")
```

```text
1111 elements
asdict:  1.26 ms
to_dict: 0.18 ms
```

`json.dumps` знає лише `dict`, `list`, `tuple`, `str`, числа, `bool` і `None`. Це головна розбіжність з `JSON.stringify`, який серіалізує будь-який об'єкт за його власними полями. Dataclass спершу перетворюють через `asdict`, і кортежі при цьому стають JSON-масивами.

```python
import json
from dataclasses import asdict, dataclass

@dataclass(frozen=True)
class Element:
    type: str
    id: str
    children: tuple["Element", ...] = ()

tree = Element("block", "b1", children=(Element("input", "e1"),))
print(json.dumps(asdict(tree)))
print(json.dumps(tree))
```

```text
{"type": "block", "id": "b1", "children": [{"type": "input", "id": "e1", "children": []}]}
Traceback (most recent call last):
  File "example.py", line 12, in <module>
    print(json.dumps(tree))
          ^^^^^^^^^^^^^^^^
TypeError: Object of type Element is not JSON serializable
```

Зворотного шляху `asdict` не має. `Element(**data)` відновлює лише верхній рівень: вкладені `children` лишаються словниками, бо dataclass не дивиться на анотації під час створення, а кортежі після JSON стали списками. Відновити дерево з JSON з правильними типами на всіх рівнях і з помилками там, де дані не ті, це рівно та робота, яку робить `model_validate` у Pydantic (m2-l09). А `dict_factory` дозволяє підправити форму словника на виході, наприклад прибрати `None`, щоб JSON для фронтенду не був засміченим.

```python live
import json
from dataclasses import asdict, dataclass

@dataclass(frozen=True)
class Element:
    type: str
    id: str
    name: str | None = None
    children: tuple["Element", ...] = ()

tree = Element("block", "b1", children=(Element("input", "e1", name="email"),))
data = json.loads(json.dumps(asdict(tree)))
restored = Element(**data)
print(restored)
print(type(restored.children[0]).__name__, restored == tree)

def drop_none(pairs: list[tuple[str, object]]) -> dict:
    return {key: value for key, value in pairs if value is not None}

print(json.dumps(asdict(tree, dict_factory=drop_none)))
```

```text
Element(type='block', id='b1', name=None, children=[{'type': 'input', 'id': 'e1', 'name': 'email', 'children': []}])
dict False
{"type": "block", "id": "b1", "children": [{"type": "input", "id": "e1", "name": "email", "children": []}]}
```

## dataclass серед сусідів: NamedTuple, TypedDict, клас, Pydantic

Форму "запис з іменованими полями" в Python можна описати п'ятьма способами, і вони різняться не синтаксисом, а тим, чим об'єкт є в runtime. `TypedDict` (m2-l06) це звичайний `dict` з підказкою для mypy. `NamedTuple` (m2-l04) це справжній кортеж з іменами позицій. Dataclass і звичайний клас це екземпляри класу, Pydantic `BaseModel` теж, але з валідатором, зібраним з анотацій.

```python live
from dataclasses import dataclass
from typing import NamedTuple, TypedDict

class ThemeTD(TypedDict):
    mode: str
    primary_color: str

class ThemeNT(NamedTuple):
    mode: str
    primary_color: str

@dataclass(frozen=True, slots=True)
class ThemeDC:
    mode: str
    primary_color: str

td: ThemeTD = {"mode": "dark", "primary_color": "#111827"}
nt = ThemeNT("dark", "#111827")
dc = ThemeDC("dark", "#111827")

print(type(td).__name__, td["mode"])
print(nt.mode, nt[0], len(nt))
mode, color = nt
print(mode, color)
print(dc.mode, dc == ThemeDC("dark", "#111827"))
print(nt == ("dark", "#111827"), dc == ("dark", "#111827"))
```

```text
dict dark
dark dark 2
dark #111827
dark True
True False
```

Останній рядок показує, чому `NamedTuple` небезпечний як доменний запис: він дорівнює будь-якому кортежу з тими самими значеннями, а отже й іншому `NamedTuple` з іншими іменами полів. Dataclass дорівнює лише екземпляру того самого класу. За пам'яттю dataclass з `slots=True` найкомпактніший з усіх, а `BaseModel` найважчий: крім словника полів він тримає службові дані, зокрема множину явно переданих полів для `model_dump(exclude_unset=True)` (вимірювання як у розділі про `slots`, 64-бітний CPython 3.12, запис з двох рядкових полів).

```python
import tracemalloc
from dataclasses import dataclass
from typing import NamedTuple

from pydantic import BaseModel

class ThemeNT(NamedTuple):
    mode: str
    primary_color: str

@dataclass
class ThemePlain:
    mode: str
    primary_color: str

@dataclass(slots=True)
class ThemeSlots:
    mode: str
    primary_color: str

class ThemeModel(BaseModel):
    mode: str
    primary_color: str

def bytes_per_instance(make) -> int:
    tracemalloc.start()
    items = [make() for _ in range(100_000)]
    size, _ = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return size // len(items)

print("dict:      ", bytes_per_instance(lambda: {"mode": "dark", "primary_color": "#111827"}))
print("NamedTuple:", bytes_per_instance(lambda: ThemeNT("dark", "#111827")))
print("dataclass: ", bytes_per_instance(lambda: ThemePlain("dark", "#111827")))
print("slots=True:", bytes_per_instance(lambda: ThemeSlots("dark", "#111827")))
print("BaseModel: ", bytes_per_instance(lambda: ThemeModel(mode="dark", primary_color="#111827")))
```

```text
dict:       191
NamedTuple: 72
dataclass:  88
slots=True: 56
BaseModel:  480
```

| | Що в runtime | Змінюваність | Перевірка типів у runtime | Пам'ять, 2 поля | Серіалізація | Коли |
|---|---|---|---|---|---|---|
| `dict` / `TypedDict` | `dict` | змінюваний | немає | ~190 B | `json.dumps` напряму | сирий JSON, який ви лише передаєте далі |
| `NamedTuple` | `tuple` | незмінний | немає | ~70 B | `_asdict()` | легкий кортеж-результат, розпакування `a, b = f()` |
| звичайний клас | екземпляр | як напишете | немає | як dataclass | вручну | об'єкт з поведінкою й станом, не запис (m4-l01) |
| `@dataclass` | екземпляр | `frozen=True` за вибором | немає | ~90 B, зі `slots=True` ~55 B | `asdict` + `json.dumps` | внутрішні структури вашого коду |
| `BaseModel` | екземпляр | змінюваний, `frozen` у конфігу | так, з приведенням | ~480 B | `model_dump_json()` | межа з чужими даними: API, файли, конфіги (m2-l09) |

Правило курсу: dataclass всередині, Pydantic на межі. Усе, що приходить ззовні, спершу проходить через `BaseModel`, бо тільки він перевіряє дані насправді. Після цього ваш код працює з об'єктами, які вже гарантовано правильні, і для них достатньо dataclass: він не тягне залежностей, не робить вигляд, що щось перевіряє, і створюється дешевше. Цифри нижче з одного запуску, співвідношення стабільне. Frozen-варіант повільніший за звичайний, бо його `__init__` присвоює поля через `object.__setattr__`, але й він випереджає `BaseModel`, який на кожне поле запускає валідатор.

```python
import timeit
from dataclasses import dataclass
from pydantic import BaseModel

@dataclass
class ThemeDC:
    mode: str
    primary_color: str

@dataclass(frozen=True, slots=True)
class ThemeFrozen:
    mode: str
    primary_color: str

class ThemeModel(BaseModel):
    mode: str
    primary_color: str

n = 200_000
for cls in (ThemeDC, ThemeFrozen, ThemeModel):
    seconds = timeit.timeit(lambda: cls(mode="dark", primary_color="#111827"), number=n)
    print(f"{cls.__name__:<12} {seconds / n * 1e9:.0f} ns")
```

```text
ThemeDC      175 ns
ThemeFrozen  298 ns
ThemeModel   512 ns
```

## Для капстоуну

У бекенді FormBuilder конфіг форми проходить два шари. На вході `FormConfig` з Pydantic (m2-l09) розбирає JSON з фронтенду і повертає всі помилки з шляхами. Далі конфіг перетворюється на внутрішнє представлення з frozen dataclass, з яким працюють рендерер, черга генерації і кеш. Незмінність тут не естетика: воркер, який рендерить версію конфігу, не може випадково змінити її для інших воркерів, а hashable `Theme` чи `Element` годиться як ключ кешу відрендерених фрагментів.

```python live
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

ElementType = Literal["input", "text", "button", "block"]
Operator = Literal["eq", "neq", "in", "gt", "lt"]

@dataclass(frozen=True, slots=True)
class Theme:
    mode: Literal["light", "dark"] = "light"
    primary_color: str = "#2563eb"

@dataclass(frozen=True, slots=True)
class Condition:
    field: str
    operator: Operator
    value: str | int | bool | tuple[str, ...]

@dataclass(frozen=True, slots=True, kw_only=True)
class Element:
    type: ElementType
    id: str
    name: str | None = None
    label: str = ""
    children: tuple[Element, ...] = ()
    visible_if: Condition | None = None

    def __post_init__(self) -> None:
        if (self.type == "input") != (self.name is not None):
            raise ValueError(f"element {self.id!r}: only input elements have a name")
        if self.children and self.type != "block":
            raise ValueError(f"element {self.id!r}: only block elements have children")

@dataclass(frozen=True, slots=True, kw_only=True)
class FormConfig:
    id: str
    title: str
    theme: Theme = Theme()
    elements: tuple[Element, ...] = ()

def walk(elements: tuple[Element, ...]) -> list[Element]:
    result: list[Element] = []
    for el in elements:
        result.append(el)
        result.extend(walk(el.children))
    return result

def field_names(form: FormConfig) -> list[str]:
    return [el.name for el in walk(form.elements) if el.name is not None]

form = FormConfig(
    id="signup",
    title="Sign up",
    elements=(
        Element(type="input", id="e1", name="email", label="Email"),
        Element(type="block", id="b1", children=(
            Element(type="input", id="e2", name="company", label="Company",
                    visible_if=Condition("email", "neq", "")),
        )),
        Element(type="button", id="s1", label="Send"),
    ),
)
print(field_names(form))
print(form.theme, hash(form) == hash(replace(form)))
dark = replace(form, theme=replace(form.theme, mode="dark"))
print(dark.theme.mode, form.theme.mode, dark.elements is form.elements)
try:
    Element(type="text", id="t1", name="oops")
except ValueError as e:
    print("ValueError:", e)
```

```text
['email', 'company']
Theme(mode='light', primary_color='#2563eb') True
dark light True
ValueError: element 't1': only input elements have a name
```

> **Для капстоуну.** `replace(form, theme=...)` повертає нову форму, яка ділить з оригіналом незмінений кортеж `elements`: це structural sharing, знайомий вам з immutable-оновлень стану в React. У фінальному завданні ви поширите його на все дерево: змінене піддерево створюється заново, незмінене повертається тим самим об'єктом. У m4 те саме дерево стане ієрархією класів з `__iter__` і `__getitem__`, а в m2-l09 з'явиться вхідний шар Pydantic, з якого ці dataclass будуються.

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Словник як запис замість класу.** Звичка з об'єктних літералів: `el = {"type": "input", "name": "email"}` і доступ через ключі. Одруківка в ключі стає `KeyError` десь глибоко в рендері, IDE нічого не підказує, а типу немає. Правильно: dataclass для власних структур, `TypedDict`, лише якщо це сирий JSON, який ви не перетворюєте.

   ```python
   el = {"type": "input", "name": "email"}
   el["nmae"]                                   # KeyError: 'nmae'
   el = Element(type="input", id="e1", name="email")
   el.name                                      # автодоповнення, mypy, repr
   ```

2. **Очікування, що анотація перевіряється, як `interface` у TS.** `Theme(mode=42)` створюється без помилки, бо dataclass лише читає анотації. Правильно: дані ззовні через Pydantic (m2-l09), всередині mypy (m2-l08).

   ```python
   Theme(mode=42, primary_color=None)           # Theme(mode=42, primary_color=None)
   ```

3. **Ручний конструктор `this.x = x`.** Звичайний клас з `__init__` без `__repr__` і `__eq__` друкує адресу і порівнюється за identity. Правильно: `@dataclass`, і ручний клас лише тоді, коли в нього є поведінка, а не лише поля.

   ```python
   @dataclass
   class Theme:
       mode: str
       primary_color: str
   ```

4. **Очікування, що `==` на двох записах хибне, як `===`.** У dataclass `==` порівнює поля, і два окремо створені рівні записи дорівнюють один одному. Identity перевіряється через `is` (m1-l03).

   ```python
   Theme("dark", "#111827") == Theme("dark", "#111827")   # True
   Theme("dark", "#111827") is Theme("dark", "#111827")   # False
   ```

5. **`tags: list = []` як значення за замовчуванням.** Dataclass кидає `ValueError` ще при визначенні класу, а екземпляр звичайного класу як default тихо стає спільним. Правильно: `field(default_factory=list)` або `default_factory=Registry`.

   ```python
   tags: list[str] = field(default_factory=list)
   ```

6. **`frozen=True` як `Object.freeze` у глибину.** Заморожування неглибоке: список усередині frozen-запису змінюється, а сам запис втрачає хеш. Правильно: `tuple` замість `list` усередині frozen.

   ```python
   children: tuple[Element, ...] = ()
   ```

7. **Присвоєння полю замість нового об'єкта.** Звичка мутувати стан там, де в React ви б писали `{ ...theme, mode: "dark" }`. На frozen це `FrozenInstanceError`. Правильно: `replace`, який ще й прожене `__post_init__` для нових значень.

   ```python
   dark = replace(theme, mode="dark")
   ```

8. **`json.dumps(obj)` як `JSON.stringify(obj)`.** `json` не знає класів і кидає `TypeError: Object of type Element is not JSON serializable`. Правильно: `json.dumps(asdict(obj))`, а назад з JSON у дерево класів через Pydantic, бо `Element(**data)` вкладених рівнів не відновлює.

   ```python
   json.dumps(asdict(tree))
   ```

## Підсумок

- `@dataclass` генерує `__init__`, `__repr__` і `__eq__` з анотованих полів класу; анотації читаються, але не перевіряються.
- `==` на dataclass порівнює поля і лише між екземплярами одного класу; identity це `is`.
- Поле без default не може йти після поля з default; mutable default заборонений, замість нього `field(default_factory=list)`.
- Звичайний dataclass unhashable; `frozen=True` дає `FrozenInstanceError` на присвоєння і хеш із полів, тому запис годиться як ключ dict і елемент set.
- Frozen неглибокий: колекції всередині тримати як `tuple`.
- `replace(obj, **changes)` це spread-копія, але через `__init__`, з `__post_init__` і перевіркою імен полів.
- `__post_init__` для інваріантів, нормалізації й похідних полів `field(init=False)`; у frozen присвоювати через `object.__setattr__`. Валідація чужого вводу це Pydantic.
- `order=True` лише для природного порядку полів; `slots=True` для пам'яті й захисту від одруківок; `kw_only=True` для читабельних викликів і наслідування.
- Рекурсивні поля через `"Element"` або `from __future__ import annotations`; `match` працює з class patterns і позиційно через `__match_args__`.
- `asdict` рекурсивний і робить глибоку копію; JSON це `json.dumps(asdict(x))`, зворотного шляху немає. Dataclass всередині, Pydantic на межі.

## Що далі

Наступний урок m2-l06 про typing: там `Literal`, `ClassVar`, `str | None`, `get_type_hints` і відкладені анотації з цього уроку отримують повне пояснення, а `TypedDict` стає поруч із dataclass як тип для сирого JSON. У m2-l09 Pydantic бере на себе вхідний шар, з якого будуються frozen-записи `Theme`, `Element` і `FormConfig`, а в m4-l02 ви напишете руками ті dunder-методи, які тут генерував decorator.
