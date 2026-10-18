---
id: m4-l01
module: m4-oop
title: "Класи, __init__, self, атрибути класу й екземпляра"
summary: "Учень пише звичайні класи без dataclass і розуміє механізм під ними: __init__ як ініціалізатор, явний self і зв'язані методи, пошук атрибута екземпляр → клас, спільні атрибути класу, classmethod як альтернативний конструктор, __dict__ замість private, клас як об'єкт типу type, і знає, коли клас узагалі не потрібен."
duration_min: 75
prerequisites: [m3-l06]
---

## `class` і `__init__`: ініціалізатор, а не конструктор

Клас у Python оголошується інструкцією `class`, а екземпляр створюється викликом класу як функції. Оператора `new` немає: `Field("email")` і є створення об'єкта. Метод `__init__` виглядає як `constructor` з TS, і на практиці його так і називають, але документація називає його ініціалізатором (initializer), і різниця не термінологічна.

```ts
class Field {
  name: string;
  label: string;
  constructor(name: string, label?: string) {
    this.name = name;
    this.label = label ?? name;
  }
  describe(): string {
    return `${this.name}: ${this.label}`;
  }
}
const f = new Field("email", "Email");
console.log(f.describe());
```

```python
class Field:
    def __init__(self, name: str, label: str | None = None) -> None:
        self.name = name
        self.label = label if label is not None else name

    def describe(self) -> str:
        return f"{self.name}: {self.label}"

f = Field("email", "Email")
print(f.describe())
print(Field("phone").describe())
```

```text
email: Email
phone: phone
```

Поведінка розходиться в трьох місцях. Поля не оголошуються в тілі класу: атрибут з'являється в момент присвоєння `self.name = ...`, як властивість JS-об'єкта при `this.name = ...`. Метод отримує екземпляр явним першим параметром `self` замість неявного `this`. І `__init__` не створює об'єкт, а отримує вже створений і наповнює його: виклик `Field(...)` спершу викликає `__new__`, який виділяє порожній екземпляр, а потім передає його в `__init__`. `__new__` перевизначають лише для незмінних типів і кешування екземплярів, у прикладному коді він майже не трапляється.

```python
class Field:
    def __init__(self, name: str) -> None:
        self.name = name

f = Field.__new__(Field)
print(vars(f))
Field.__init__(f, "email")
print(vars(f))
```

```text
{}
{'name': 'email'}
```

Ці два рядки і є тим, що робить `Field("email")`. Звідси обмеження: `__init__` нічого не повертає, бо результат виклику класу це об'єкт від `__new__`. JS дозволяє `constructor` повернути інший об'єкт замість `this`, Python на будь-яке значення, крім `None`, кидає `TypeError`.

```python
class Field:
    def __init__(self, name: str) -> None:
        self.name = name
        return self

Field("email")
```

```text
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    Field("email")
TypeError: __init__() should return None, not 'Field'
```

Ще одна відмінність від JS видна на першому ж `print`. `console.log` показує поля будь-якого об'єкта, а Python для об'єкта без власного `__repr__` друкує ім'я класу й адресу в пам'яті. `__repr__` це dunder-метод (від double underscore; жаргон спільноти, документація каже "special method"), який повертає рядок для відлагодження: його показують `print`, REPL, traceback, `repr()` і контейнери, коли друкують свій вміст. Писати мінімальний `__repr__` одразу, разом з `__init__`, це звичка, яка окупається на першому ж логу. Формат за конвенцією такий, щоб рядок виглядав як вираз створення об'єкта; `!r` у f-рядку бере `repr` значення, тобто рядки в лапках. Решта dunder-методів і різниця `__repr__` та `__str__` в m4-l02.

```python
class Bare:
    def __init__(self, name: str) -> None:
        self.name = name

class Field:
    def __init__(self, name: str, label: str = "") -> None:
        self.name = name
        self.label = label

    def __repr__(self) -> str:
        return f"Field(name={self.name!r}, label={self.label!r})"

print(Bare("email"))
print(Field("email", "Email"))
print([Field("a"), Field("b")])
```

```text
<__main__.Bare object at 0x102f0f950>
Field(name='email', label='Email')
[Field(name='a', label=''), Field(name='b', label='')]
```

<!-- task: t1 -->

## `self` явний, і саме тому він не губиться

Метод у Python це звичайна функція, визначена в тілі класу. Ніякого ключового слова `this` у мові немає: екземпляр приходить першим позиційним аргументом, і ім'я `self` для нього лише конвенція, яку перевіряють лінтери, а не синтаксис. Виклик `f.describe()` інтерпретатор перетворює на `Field.describe(f)`, і обидва записи працюють. Через клас `Field.describe` це просто функція: термін unbound method лишився з Python 2, окремого типу для нього в Python 3 немає.

```python
class Field:
    def __init__(self, name: str) -> None:
        self.name = name

    def describe(self) -> str:
        return f"field {self.name}"

f = Field("email")
print(f.describe())
print(Field.describe(f))
print(type(Field.describe).__name__)
```

```text
field email
field email
function
```

Явний `self` має прямі наслідки, на які JS-розробник наступає в перший день. Якщо забути `self` у сигнатурі, виклик через екземпляр передасть екземпляр, а приймати його нікому. Якщо забути `self.` перед атрибутом, ім'я шукається як звичайна змінна за правилом LEGB (m1-l08), а тіло класу в цей ланцюжок не входить: метод не бачить імен, оголошених поруч з ним у класі, без явного `self.` або `ClassName.`.

```python
class Field:
    def describe():
        return "field"

Field().describe()
```

```text
Traceback (most recent call last):
  File "example.py", line 5, in <module>
    Field().describe()
TypeError: Field.describe() takes 0 positional arguments but 1 was given
```

```python
class Field:
    prefix = "field"

    def describe(self) -> str:
        return prefix

Field().describe()
```

```text
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    Field().describe()
  File "example.py", line 5, in describe
    return prefix
           ^^^^^^
NameError: name 'prefix' is not defined. Did you mean: 'self.prefix'?
```

> **Пастка.** Тіло класу схоже на scope: наступний рядок тіла бачить `prefix` без жодного префікса. Але функції, визначені в тілі, його не бачать, бо простір імен класу не входить у LEGB для вкладених функцій. Те саме стосується comprehension у тілі класу, і це вже несподівано: у 3.12 він теж не бачить імен класу. Константу, яку методи читають без префікса, тримайте на рівні модуля, а атрибут класу читайте через `self.`.

```python
class Field:
    prefix = "field"
    full = prefix + "-email"
    print(full)
    names = ["a", "b"]
    labels = [prefix + n for n in names]
```

```text
field-email
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    class Field:
  File "example.py", line 6, in Field
    labels = [prefix + n for n in names]
              ^^^^^^
NameError: name 'prefix' is not defined
```

Тепер чому `self` явний. Відповідь з офіційного Design and History FAQ: атрибут екземпляра видно з першого погляду (`self.x` проти локальної `x`), без конвенцій на кшталт `m_x`; присвоєння `self.x = ...` однозначно пише в екземпляр, тож не потрібні оголошення полів; і метод можна викликати з явним екземпляром, `Field.describe(f)`, що потрібно, наприклад, для виклику методу батька. Гвідо ван Россум додає ще одну причину: метод не відрізняється від функції, тому для "функції всередині класу" немає окремих правил. Ціна: на кілька символів більше в кожній сигнатурі. Виграш: `self` ніколи не залежить від того, як метод викликали.

```ts
class Counter {
  count = 0;
  inc() { this.count++; }
}
const c = new Counter();
const inc = c.inc;
inc();                                     // TypeError: Cannot read properties of undefined
button.addEventListener("click", c.inc);   // this === button, а не c
button.addEventListener("click", () => c.inc()); // або c.inc.bind(c), або inc = () => {...} у полі
```

```python
class Counter:
    def __init__(self) -> None:
        self.count = 0

    def inc(self) -> None:
        self.count += 1

c = Counter()
callbacks = [c.inc, c.inc]
for cb in callbacks:
    cb()
print(c.count)
```

```text
2
```

У JS `this` визначається в момент виклику, тому відірваний від об'єкта метод губить його, і звідси `bind`, стрілки в полях класу й `onClick={() => this.handle()}`. У Python екземпляр прив'язується в момент читання атрибута `c.inc`, задовго до виклику, тож переданий як callback метод уже несе свій `self`. У m1-l09 це показано на рівні "працює"; нижче механізм.

Зв'язаний метод (bound method, офіційний термін) створюється під час доступу до атрибута. Функція, що лежить у класі, є дескриптором (descriptor, офіційний термін з data model: об'єкт класу, що має метод `__get__` і тому керує тим, що повертає доступ до атрибута). Коли `c.inc` не знаходить `inc` в екземплярі й знаходить його в класі, інтерпретатор викликає `Counter.__dict__["inc"].__get__(c, Counter)`, і той повертає новий об'єкт `method`, що тримає функцію в `__func__` і екземпляр у `__self__`. Виклик цього об'єкта підставляє `__self__` першим аргументом. Протокол дескрипторів повністю розібраний у m4-l03, де на ньому побудовано `property`.

```python live
class Counter:
    def __init__(self) -> None:
        self.count = 0

    def inc(self) -> None:
        self.count += 1

c = Counter()
func = Counter.__dict__["inc"]
bound = func.__get__(c, Counter)
print(type(func).__name__, type(bound).__name__)
print(bound.__func__ is func, bound.__self__ is c)
bound()
print(c.count)
print(c.inc is c.inc, c.inc == c.inc)
```

```text
function method
True True
1
False True
```

Останній рядок прямо з механізму: кожен доступ `c.inc` викликає `__get__` і створює новий об'єкт `method`, тому два доступи не ідентичні (`is`), але рівні (`==` порівнює `__func__` і `__self__`). Практичний наслідок: щоб відписати callback, зареєстрований як `bus.subscribe(self.on_change)`, передавайте `self.on_change` ще раз, і пошук через `==` у списку його знайде, а порівняння через `is` ні.

> **JS-аналог.** Стрілка всередині методу `items.map(x => this.format(x))` у Python пишеться як `[self.format(x) for x in items]` або `map(self.format, items)`, і жодного захоплення `this` не потрібно: `self` це звичайна локальна змінна методу, і замикання бачать її за правилами LEGB, як будь-яку іншу.

<!-- task: q4 -->

## Атрибути екземпляра й атрибути класу

Атрибут екземпляра створюється присвоєнням через екземпляр, `self.x = ...`, у будь-якому методі, не лише в `__init__`. Атрибут класу це будь-яке ім'я, визначене в тілі класу: значення, функція, вкладений клас. Тіло класу виконується один раз, при виконанні інструкції `class`, тому значення атрибута класу існує в одному примірнику на всі екземпляри.

```python live
class Job:
    MAX_ATTEMPTS = 3
    status = "queued"

    def __init__(self, job_id: str) -> None:
        self.id = job_id

    def start(self) -> None:
        self.status = "running"
        self.started_by = "worker-1"

a, b = Job("j1"), Job("j2")
a.start()
print(vars(a))
print(vars(b))
print(a.status, b.status, Job.status)
print(a.MAX_ATTEMPTS, Job.MAX_ATTEMPTS)
try:
    b.started_by
except AttributeError as e:
    print("AttributeError:", e)
```

```text
{'id': 'j1', 'status': 'running', 'started_by': 'worker-1'}
{'id': 'j2'}
running queued queued
3 3
AttributeError: 'Job' object has no attribute 'started_by'
```

`started_by` існує лише в `a`: атрибут, створений поза `__init__`, з'являється тільки після виклику методу, і код, що читає його в інших екземплярах, падає. Тому конвенція вимагає заводити всі атрибути в `__init__`, хоча б як `None`. Пошук атрибута при читанні йде по ланцюжку: спершу словник екземпляра, потім словник класу, потім словники батьківських класів у порядку MRO (method resolution order, офіційний термін; детально в m4-l04). Запис іде завжди в екземпляр. Тому `b.status` дає `"queued"` з класу, а `a.status` після `start()` дає власне значення, яке затіняє класове, і сам клас при цьому не змінився. Незмінне значення за замовчуванням в атрибуті класу (`status = "queued"`, `MAX_ATTEMPTS = 3`) це нормальна ідіома: екземпляри читають спільне значення, доки не отримають власне.

> **Під капотом.** Ланцюжок "екземпляр, потім клас" має одне виключення: data-дескриптори класу, тобто об'єкти з `__set__`, як `property`, перемагають навіть атрибут екземпляра з тим самим іменем. Звичайні функції й значення не є data-дескрипторами, тож для всього в цьому уроці правило просте. Повний порядок у m4-l03.

Звідси перша пастка з лічильником. `self.count += 1` розгортається в `self.count = self.count + 1`: читання знаходить атрибут класу, а запис створює атрибут екземпляра. Лічильник класу лишається нулем, а кожен екземпляр отримує власну одиницю.

```python live
class Job:
    created = 0

    def __init__(self) -> None:
        self.created += 1

class FixedJob:
    created = 0

    def __init__(self) -> None:
        FixedJob.created += 1

jobs = [Job(), Job(), Job()]
print(Job.created, [vars(j) for j in jobs])
fixed = [FixedJob(), FixedJob(), FixedJob()]
print(FixedJob.created, vars(fixed[0]))
```

```text
0 [{'created': 1}, {'created': 1}, {'created': 1}]
3 {}
```

Писати в атрибут класу треба через клас: `FixedJob.created += 1` або `type(self).created += 1`. Різниця між ними проявляється з наслідуванням. `type(self).created += 1` в екземплярі підкласу читає лічильник бази, а пише в підклас, тож у підкласу з'являється власний лічильник, який стартує з поточного значення бази. Для лічильника "усіх задач" надійніше явне ім'я класу.

```python
class Base:
    created = 0

    def __init__(self) -> None:
        type(self).created += 1

class Sub(Base):
    pass

Base()
Sub()
Sub()
print(Base.created, Sub.created, "created" in vars(Sub))
```

```text
1 3 True
```

<!-- task: q1 -->

Друга пастка гірша, бо мовчазна, і народжується прямо зі звички до полів класу в TS. У TS ініціалізатор поля в тілі класу виконується в конструкторі для кожного екземпляра окремо, а `static` поле живе на класі й через `this` не читається. У Python присвоєння в тілі класу завжди створює атрибут класу, тобто TS-поле з ініціалізатором у Python перетворюється на `static`, яке до того ж видно через `self`.

```ts
class Form {
  static created = 0;          // на класі, через this не видно
  fields: string[] = [];       // новий масив у кожному екземплярі
  addField(name: string) { this.fields.push(name); }
}
const a = new Form();
const b = new Form();
a.addField("email");
console.log(b.fields);        // []
```

```python
class Form:
    fields: list[str] = []

    def add_field(self, name: str) -> None:
        self.fields.append(name)

a, b = Form(), Form()
a.add_field("email")
print(b.fields)
print(a.fields is b.fields is Form.fields, vars(a))
```

```text
['email']
True {}
```

`self.fields.append(...)` не присвоює атрибут, а читає його і мутує знайдений об'єкт. Читання знайшло список на класі, і всі екземпляри мутують один і той самий список. Це та сама природа, що в mutable default з m1-l07: значення обчислене один раз, у момент визначення, і далі розділене. Dataclass цю помилку ловить і вимагає `default_factory` (m2-l05), звичайний клас мовчить. Правило без винятків: усе змінюване (`list`, `dict`, `set`, екземпляри інших класів) створюється в `__init__` через `self.x = ...`.

```python
class Form:
    def __init__(self) -> None:
        self.fields: list[str] = []

    def add_field(self, name: str) -> None:
        self.fields.append(name)

a, b = Form(), Form()
a.add_field("email")
print(a.fields, b.fields)
```

```text
['email'] []
```

<!-- task: t2 -->

Залишився рядок `fields: list[str]` з TS-звички оголошувати поле в тілі класу, але без значення. Анотація без присвоєння не створює атрибута взагалі: інтерпретатор записує тип у `__annotations__` класу і йде далі. Атрибут з'явиться лише тоді, коли його присвоять у `__init__`. Тому таке оголошення корисне, але лише для mypy й IDE, як `declare` поле в TS.

```python live
class Element:
    id: str
    label: str = ""

print(Element.__annotations__)
print("id" in vars(Element), "label" in vars(Element))
e = Element()
print(repr(e.label))
print(hasattr(e, "id"))
```

```text
{'id': <class 'str'>, 'label': <class 'str'>}
False True
''
False
```

Різниця з dataclass саме тут. Для звичайного класу `id: str` це лише анотація, а `label: str = ""` це атрибут класу. Для `@dataclass` обидва рядки стають полями, тобто параметрами згенерованого `__init__` й атрибутами кожного екземпляра; декоратор читає ті самі `__annotations__` і пише `__init__` за вас (m2-l05). Один і той самий текст тіла класу означає різне залежно від того, чи стоїть над ним `@dataclass`.

```python
from dataclasses import dataclass

class Plain:
    id: str
    label: str = ""

@dataclass
class Record:
    id: str
    label: str = ""

print(Record("e1"))
Plain("e1")
```

```text
Record(id='e1', label='')
Traceback (most recent call last):
  File "example.py", line 13, in <module>
    Plain("e1")
TypeError: Plain() takes no arguments
```

<!-- task: q2 -->

## `@classmethod`, `@staticmethod` і альтернативні конструктори

Звичайний метод отримує екземпляр. `@classmethod` отримує клас першим параметром, за конвенцією `cls`, незалежно від того, викликали його через клас чи через екземпляр. Головне застосування: альтернативний конструктор (alternative constructor, усталений термін спільноти, у stdlib так влаштовані `dict.fromkeys` і `datetime.fromisoformat`). У TS це `static fromDict(...)`, але в Python одного `__init__` не перевантажити різними сигнатурами, тому іменовані фабрики `from_dict`, `from_json`, `from_config` тут норма, а не прикраса.

```ts
class Condition {
  constructor(public field: string, public operator: string, public value: unknown) {}
  static fromDict(data: { field: string; op?: string; value: unknown }): Condition {
    return new Condition(data.field, data.op ?? "eq", data.value);
  }
}
```

```python live
class Condition:
    def __init__(self, field: str, operator: str, value: object) -> None:
        self.field = field
        self.operator = operator
        self.value = value

    @classmethod
    def from_dict(cls, data: dict) -> "Condition":
        return cls(data["field"], data.get("op", "eq"), data["value"])

    def __repr__(self) -> str:
        return f"{type(self).__name__}({self.field!r}, {self.operator!r}, {self.value!r})"

class StrictCondition(Condition):
    pass

print(Condition.from_dict({"field": "country", "value": "UA"}))
print(StrictCondition.from_dict({"field": "age", "op": "gt", "value": 18}))
```

```text
Condition('country', 'eq', 'UA')
StrictCondition('age', 'gt', 18)
```

Розходження з TS у `cls`. `static fromDict` повертає `new Condition(...)`, і в підкласі ви отримаєте екземпляр бази, якщо не перепишете фабрику. `cls(...)` створює екземпляр того класу, через який метод викликали, тому `StrictCondition.from_dict` повертає `StrictCondition` без жодного перевизначення. З тієї ж причини `__repr__` вище бере ім'я через `type(self).__name__`, а не пише `Condition` руками. Анотацію повернення `"Condition"` (рядок, бо клас ще не визначений) з 3.11 точніше писати як `Self` з `typing`: тоді mypy знає, що `StrictCondition.from_dict` повертає `StrictCondition`. Синтаксис `class StrictCondition(Condition)` це наслідування, детально в m4-l04.

`@staticmethod` прибирає прив'язку зовсім: функція лежить у класі, але не отримує ні екземпляра, ні класу. Це прямий аналог TS `static` для утиліти. У Python для утиліти є краще місце, модуль: він і є простором імен, і функцію модуля можна імпортувати, передати й протестувати без класу. `staticmethod` виправданий, коли функція є частиною інтерфейсу класу, наприклад її мають перевизначати підкласи або її зручно викликати через `self.` у методах.

```python live
class Slug:
    @staticmethod
    def make(text: str) -> str:
        return "-".join(text.lower().split())

def make_slug(text: str) -> str:
    return "-".join(text.lower().split())

print(Slug.make("Contact Form"), Slug().make("Contact Form"))
print(make_slug("Contact Form"))
print(type(Slug.__dict__["make"]).__name__, type(Slug.make).__name__)
```

```text
contact-form contact-form
contact-form
staticmethod function
```

> **Під капотом.** `classmethod` і `staticmethod` теж дескриптори, і різниця між трьома видами методів лише в тому, що повертає їхній `__get__`. Функція прив'язує екземпляр, `classmethod` прив'язує клас, `staticmethod` повертає функцію як є. Видно це і в останньому рядку: у словнику класу лежить обгортка `staticmethod`, а доступ через клас віддає звичайну `function`.

```python
class Demo:
    def method(self): ...

    @classmethod
    def cls_method(cls): ...

    @staticmethod
    def static_method(): ...

d = Demo()
print(d.method.__self__ is d)
print(d.cls_method.__self__ is Demo, Demo.cls_method.__self__ is Demo)
print(type(d.static_method).__name__)
```

```text
True
True True
function
```

<!-- task: t3 -->

## `__dict__`, динамічні атрибути й відсутність `private`

Атрибути екземпляра живуть у словнику `obj.__dict__`. `vars(obj)` повертає той самий словник, і саме його ви бачили у прикладах вище. Тому екземпляр поводиться як JS-об'єкт: атрибут можна додати ззовні, видалити через `del`, і одруківка в імені при присвоєнні мовчки створює новий атрибут. Словник класу теж є, але це `mappingproxy`, обгортка тільки для читання: атрибути класу змінюють через `setattr` чи присвоєння `Class.x = ...`, а не через словник.

```python live
class Field:
    def __init__(self, name: str) -> None:
        self.name = name

f = Field("email")
f.required = True
f.nmae = "phone"
print(vars(f), vars(f) is f.__dict__)
del f.nmae
print(f.__dict__)
print(type(Field.__dict__).__name__, list(Field.__dict__)[:3])
```

```text
{'name': 'email', 'required': True, 'nmae': 'phone'} True
{'name': 'email', 'required': True}
mappingproxy ['__module__', '__init__', '__dict__']
```

Для доступу за іменем у рядку є чотири вбудовані функції: `getattr(obj, name, default)`, `setattr(obj, name, value)`, `hasattr(obj, name)` і `delattr(obj, name)`. Це `obj[key]`, присвоєння, `key in obj` і `delete obj[key]` з JS, з тією різницею, що в Python атрибутний і ключовий доступ розділені: `obj["name"]` на звичайному класі не працює. `getattr` з третім аргументом не кидає виняток, а повертає значення за замовчуванням, як `obj?.[key] ?? default`. `hasattr` насправді викликає `getattr` і повертає `False`, якщо той кинув `AttributeError`, тобто проходить той самий ланцюжок пошуку, включно з атрибутами класу.

```python live
class Field:
    kind = "input"

    def __init__(self, name: str) -> None:
        self.name = name

f = Field("email")
patch = {"label": "Email", "required": True}
for key, value in patch.items():
    setattr(f, key, value)
print(getattr(f, "label"), getattr(f, "placeholder", None))
print(hasattr(f, "kind"), "kind" in vars(f))
delattr(f, "required")
print(vars(f))
try:
    f["name"]
except TypeError as e:
    print("TypeError:", e)
```

```text
Email None
True False
{'name': 'email', 'label': 'Email'}
TypeError: 'Field' object is not subscriptable
```

Словник на кожен екземпляр і є причиною того, що звичайний екземпляр важчий за dataclass зі `slots=True`. З 3.11 CPython тримає значення атрибутів компактно і створює справжній `dict` лише тоді, коли хтось звертається до `__dict__` (через `vars`, серіалізатор чи відлагоджувач), але місце під динамічні атрибути закладене в кожен об'єкт. `__slots__` (офіційний термін) замінює словник фіксованим набором комірок: менше пам'яті й `AttributeError` на одруківку; детально в m4-l03, а `dataclass(slots=True)` з вимірюванням у m2-l05. Цифри нижче з одного запуску 64-бітного CPython 3.12, співвідношення стабільне.

```python
import tracemalloc
from dataclasses import dataclass

class Plain:
    def __init__(self, id: str, type: str, name: str) -> None:
        self.id = id
        self.type = type
        self.name = name

@dataclass(slots=True)
class Slotted:
    id: str
    type: str
    name: str

def bytes_per_instance(make, touch_dict: bool = False) -> int:
    tracemalloc.start()
    items = [make() for _ in range(100_000)]
    if touch_dict:
        for obj in items:
            obj.__dict__
    size, _ = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return size // len(items)

print("plain class:         ", bytes_per_instance(lambda: Plain("e1", "input", "email")))
print("plain, __dict__ read:", bytes_per_instance(lambda: Plain("e1", "input", "email"), True))
print("dataclass slots:     ", bytes_per_instance(lambda: Slotted("e1", "input", "email")))
```

```text
plain class:          96
plain, __dict__ read: 160
dataclass slots:      64
```

<!-- task: t4 -->

Модифікаторів доступу в Python немає, ні `private`, ні `protected`, ні `#x`. Замість них дві конвенції. Одне підкреслення, `self._cache`, означає "внутрішнє, не чіпайте ззовні": інтерпретатор його ніяк не захищає, але IDE, лінтери й люди розуміють сигнал, а `from module import *` пропускає такі імена модуля. Це найближче до `private` у TS, який теж існує лише для компілятора і стирається в JS.

Два підкреслення на початку (і не більше одного в кінці), `self.__state`, вмикають name mangling (офіційний термін, у документації "private name mangling"): компілятор переписує ім'я на `_ClassName__state` всередині тіла класу. Ззовні `obj.__state` не знаходиться, але `obj._Job__state` доступний, тобто це не приватність, як `#state` у JS, яка справді недосяжна ззовні.

```python live
class Job:
    def __init__(self) -> None:
        self._attempts = 0
        self.__state = "queued"

    def state(self) -> str:
        return self.__state

job = Job()
print(vars(job))
print(job._attempts, job.state(), job._Job__state)
try:
    job.__state
except AttributeError as e:
    print("AttributeError:", e)
```

```text
{'_attempts': 0, '_Job__state': 'queued'}
0 queued queued
AttributeError: 'Job' object has no attribute '__state'
```

Справжнє призначення name mangling: уникнути випадкового конфлікту імен між класом і його підкласами. Якщо базовий клас з бібліотеки тримає внутрішній `self.__cache`, а ваш підклас заводить свій `self.__cache`, це два різні атрибути `_Base__cache` і `_Child__cache`, і підклас не зламає базу. З одним підкресленням вони б злилися в один. Dunder-імена на кшталт `__init__` не переписуються, бо закінчуються двома підкресленнями.

```python
class Base:
    def __init__(self) -> None:
        self.__cache = "base data"

    def base_cache(self) -> str:
        return self.__cache

class Child(Base):
    def __init__(self) -> None:
        super().__init__()
        self.__cache = "child data"

c = Child()
print(vars(c))
print(c.base_cache())
```

```text
{'_Base__cache': 'base data', '_Child__cache': 'child data'}
base data
```

Чому мова не захищає атрибути: Python виходить з того, що розробник, який лізе в `_internal`, знає, на що йде, і відповідає за це сам. У спільноті це формулюють як "we are all consenting adults here" (жаргон, не документація). Практично це означає, що тести, відлагоджувач і серіалізатори бачать усе без рефлексії й обхідних шляхів. Правило для власного коду: `_x` для всього внутрішнього, `__x` лише в класах, які проєктуються під наслідування чужим кодом, а контроль доступу, коли він справді потрібен, через `property` (m4-l03).

<!-- task: q3 -->

## Клас теж об'єкт

Інструкція `class` виконується в runtime, як `def`: інтерпретатор виконує тіло класу як блок коду, збирає імена, що в ньому з'явились, у словник, створює з нього об'єкт класу і прив'язує його до імені. Тіло класу може містити будь-який код, і він виконується один раз, у момент визначення, а не при створенні екземплярів.

```python
print("before class")

class Field:
    print("class body runs")
    kind = "input"

print("after class")
Field()
Field()
print(Field, type(Field))
```

```text
before class
class body runs
after class
<class '__main__.Field'> <class 'type'>
```

Створений об'єкт класу має тип `type`. `type` це метаклас (metaclass, офіційний термін): клас, екземплярами якого є класи. Власні метакласи пишуть рідко, і майже все, для чого вони колись були потрібні, сьогодні робиться через декоратор класу або `__init_subclass__` (m4-l04). Для практики важливо інше: клас це звичайне значення, і з ним можна робити все, що з будь-яким об'єктом. Передати як аргумент, повернути з функції, покласти в словник, створити динамічно викликом `type(name, bases, namespace)`.

```python live
class TextInput:
    def __init__(self, name: str) -> None:
        self.name = name

class Checkbox:
    def __init__(self, name: str) -> None:
        self.name = name

REGISTRY: dict[str, type] = {"text": TextInput, "checkbox": Checkbox}

def build(kind: str, name: str) -> object:
    cls = REGISTRY[kind]
    return cls(name)

el = build("checkbox", "terms")
print(type(el).__name__, el.name)

Hidden = type("Hidden", (), {"kind": "hidden", "describe": lambda self: f"hidden {self.kind}"})
print(Hidden, Hidden().describe())
```

```text
Checkbox terms
<class '__main__.Hidden'> hidden hidden
```

Реєстр `{тип: клас}` замість `switch` з `new` у кожній гілці це головна практична користь від "клас це значення": у JS ви теж можете покласти клас у `Map`, але в Python це стандартний спосіб будувати фабрики, і в m4-l04 такий реєстр заповнюватиметься автоматично. Для перевірок типу є чотири інструменти: `type(obj)` і `obj.__class__` повертають точний клас, `isinstance(obj, cls)` перевіряє з урахуванням підкласів і приймає кортеж класів, `issubclass(a, b)` порівнює самі класи.

```python live
class Field:
    pass

class EmailField(Field):
    pass

e = EmailField()
print(type(e) is EmailField, e.__class__ is EmailField, type(e) is Field)
print(isinstance(e, Field), isinstance(e, (str, Field)))
print(issubclass(EmailField, Field), issubclass(Field, object))
print(isinstance(True, int), type(True) is int)
print(isinstance(Field, type), type(type))
```

```text
True True False
True True
True True
True False
True <class 'type'>
```

> **Пастка.** `isinstance(True, int)` дає `True`, бо `bool` є підкласом `int` (m1-l02). Перевірка "це число" через `isinstance(value, int)` пропустить `True` і `False`, і поле `"age": true` з JSON пройде як вік. Якщо `bool` треба відсікти, перевіряйте його першим: `isinstance(value, bool)` або `type(value) is int`. В іншому `isinstance` кращий за `type(x) is ...`, бо не ламає підкласи; це аналог `instanceof`, який теж іде по ланцюжку прототипів.

## Коли клас, а не словник і функції

У типовому TS-коді класів більше, ніж у Python, і причина не в стилі, а в тому, що в Python для більшості задач є щось простіше. Простір імен для утиліт дає модуль, а не клас зі `static`. Запис із полями це dataclass, `NamedTuple` або `TypedDict` (m2-l04 – m2-l06). Невеликий стан з однією дією дає замикання (m1-l08) або `functools.partial`. Стратегію передають як функцію, бо функції це значення. Клас-утиліта, яку ніхто не інстанціює, це ознака того, що код перенесено з TS чи Java без перекладу.

```ts
export class StringUtils {
  static slugify(text: string): string { return text.toLowerCase().split(/\s+/).join("-"); }
}
```

```python
def slugify(text: str) -> str:
    return "-".join(text.lower().split())
```

Розходження в тому, що в TS-файлі функції теж можна експортувати без класу, але Java-традиція і DI-контейнери привчили загортати їх у класи. У Python ця обгортка нічого не дає: модуль `utils.slugify` вже простір імен, mock у тестах працює на рівні модуля (m3-l04), а `staticmethod` додає лише зайвий рівень у імені.

Клас потрібен, коли виконується хоча б одна з трьох умов. Перша: стан і поведінка, що його змінює, мають бути разом, і стан має інваріанти (умови, які мають бути істинними для кожного екземпляра). Якщо статус задачі можна змінити лише через `start` і `fail`, ці методи гарантують, що задача не стане `done`, не побувавши `running`; зі словником і вільними функціями будь-який код може записати `job["status"] = "done"`. Друга: кілька реалізацій одного інтерфейсу, які підставляються одна замість одної, наприклад рендерери HTML і тексту; тип такої залежності описує Protocol з m2-l07. Третя: об'єкт з життєвим циклом, з'єднання чи файл, де клас дає `__enter__`/`__exit__` (m4-l07). Якщо жодна не виконується, функції над dataclass або словником простіші. Повний розбір патернів у m4-l08.

```python live
def start(job: dict) -> None:
    job["status"] = "running"

job = {"id": "j1", "status": "queued"}
start(job)
job["status"] = "done"
job["stauts"] = "failed"
print(job)

class Job:
    def __init__(self, job_id: str) -> None:
        self.id = job_id
        self.status = "queued"

    def start(self) -> None:
        if self.status != "queued":
            raise ValueError(f"cannot start job in status {self.status!r}")
        self.status = "running"

    def __repr__(self) -> str:
        return f"Job(id={self.id!r}, status={self.status!r})"

j = Job("j1")
j.start()
print(j)
try:
    j.start()
except ValueError as e:
    print("ValueError:", e)
```

```text
{'id': 'j1', 'status': 'done', 'stauts': 'failed'}
Job(id='j1', status='running')
ValueError: cannot start job in status 'running'
```

Клас не робить інваріант непорушним: `j.status = "done"` ззовні все одно спрацює, бо приватності немає. Але він дає місце, де правило записане, і конвенцію "стан змінюють методи". Коли перевірку треба повісити на саме присвоєння, атрибут стає `property` (m4-l03), і саме так `status` з цього уроку буде переписано там.

## Для капстоуну

Воркер генерації в бекенді FormBuilder працює із задачами: конфіг форми потрапляє в чергу, воркер бере задачу, рендерить, публікує або фіксує помилку й ставить на повтор. Це рівно той випадок, коли потрібен клас: у задачі є стан (`id`, `config`, `status`, `attempts`), правила переходів між статусами й кілька способів створення. Dataclass тут теж можливий, але головне в `GenerationJob` не поля, а методи, що стережуть переходи.

```python live
class GenerationJob:
    MAX_ATTEMPTS = 3
    created = 0

    def __init__(self, job_id: str, config: dict) -> None:
        self.id = job_id
        self.config = config
        self.status = "queued"
        self.attempts = 0
        self.error: str | None = None
        GenerationJob.created += 1

    @classmethod
    def from_config(cls, config: dict) -> "GenerationJob":
        form_id = config.get("id")
        if not form_id:
            raise ValueError("config has no id")
        return cls(f"{form_id}-{cls.created + 1}", config)

    def start(self) -> None:
        if self.status != "queued":
            raise ValueError(f"cannot start job in status {self.status!r}")
        self.status = "running"
        self.attempts += 1

    def __repr__(self) -> str:
        return f"GenerationJob(id={self.id!r}, status={self.status!r}, attempts={self.attempts})"

a = GenerationJob.from_config({"id": "signup", "elements": []})
b = GenerationJob.from_config({"id": "contact", "elements": []})
a.start()
print(a, b)
print(GenerationJob.created, "created" in vars(a))
try:
    GenerationJob.from_config({"elements": []})
except ValueError as e:
    print("ValueError:", e)
```

```text
GenerationJob(id='signup-1', status='running', attempts=1) GenerationJob(id='contact-2', status='queued', attempts=0)
2 False
ValueError: config has no id
```

> **Для капстоуну.** Три рішення в цьому класі не випадкові. Лічильник `created` пишеться через ім'я класу, інакше кожна задача отримала б власну одиницю. `MAX_ATTEMPTS` лежить на класі як значення за замовчуванням і читається через `self`, тому для окремої задачі ліміт можна перевизначити присвоєнням в екземпляр, не чіпаючи інших. Змінюване (`config`, майбутній список логів) створюється лише в `__init__`. Лічильник у пам'яті процесу губиться при перезапуску, і в капстоуні ідентифікатори згодом даватиме SQLite (m6-l08); тут він ілюструє атрибут класу. Методи `succeed` і `fail` з повторною спробою допишете в t5, а в m4-l03 `status` стане `property` з таблицею дозволених переходів.

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Поле з ініціалізатором у тілі класу, як у TS.** `fields: list[str] = []` у TS дає новий масив кожному екземпляру, у Python один список на клас, який мутують усі. Правильно: змінюване створювати в `__init__`.

   ```python
   class Form:
       fields: list[str] = []          # один список на всіх
   class Form:
       def __init__(self) -> None:
           self.fields: list[str] = []  # свій у кожного
   ```

2. **`this` за звичкою або забутий `self`.** Метод без `self` у сигнатурі падає з `takes 0 positional arguments but 1 was given`, а ім'я без `self.` шукається як змінна і дає `NameError`, навіть якщо атрибут з таким ім'ям є в класі. Правильно: `self` першим параметром і `self.` перед кожним атрибутом.

   ```python
   def describe(self) -> str:
       return f"{self.prefix} {self.name}"
   ```

3. **`bind`, стрілка в полі класу чи `() => this.handle()` для callback-ів.** У Python `obj.handle` вже зв'язаний метод, `self` прив'язується при читанні атрибута, а не при виклику. Правильно: передавати `self.handle` як є.

   ```python
   bus.subscribe(self.on_change)       # без lambda і bind
   ```

4. **`self.count += 1` для лічильника класу.** Читання знаходить атрибут класу, запис створює атрибут екземпляра, лічильник класу стоїть на нулі. Правильно: `ClassName.count += 1` або `type(self).count += 1`.

   ```python
   GenerationJob.created += 1
   ```

5. **`private`/`#x` і геттер на кожне поле.** Модифікаторів доступу немає, `__x` це name mangling для уникнення конфліктів у підкласах, а не приватність: `obj._Class__x` доступний. Пара `_status` + `get_status()`, як `private` поле з `get status()` у TS, теж не потрібна. Правильно: `_x` як сигнал "внутрішнє", публічний атрибут за замовчуванням, а коли знадобиться логіка доступу, `property` без зміни інтерфейсу (m4-l03).

   ```python
   self._attempts = 0                  # внутрішнє за конвенцією
   self.status = "queued"              # публічне, без get_status()
   ```

6. **Клас з `static`-методами як контейнер утиліт.** Звичка з TS/Java-сервісів. Модуль уже простір імен. Правильно: функції модуля, `staticmethod` лише там, де функція частина інтерфейсу класу.

   ```python
   # utils.py
   def slugify(text: str) -> str:
       return "-".join(text.lower().split())
   ```

7. **`static fromDict` з жорстко прописаним ім'ям класу.** `return Condition(...)` у фабриці повертає базовий клас навіть з підкласу. Правильно: `@classmethod` і `cls(...)`.

   ```python
   @classmethod
   def from_dict(cls, data: dict) -> "Condition":
       return cls(data["field"], data.get("op", "eq"), data["value"])
   ```

8. **`new Field()` і `toString` для відлагодження.** `new` у Python немає, клас викликається як функція, а без `__repr__` `print` показує адресу. Правильно: `Field("email")` і мінімальний `__repr__` разом з `__init__`.

   ```python
   def __repr__(self) -> str:
       return f"Field(name={self.name!r})"
   ```

## Підсумок

- `Class(...)` викликає `__new__` (створює) і `__init__` (наповнює); `new` немає, `__init__` повертає лише `None`.
- `self` це звичайний перший параметр; `obj.m()` те саме, що `Class.m(obj)`; ім'я з тіла класу без `self.` метод не бачить.
- `obj.m` створює зв'язаний метод через `__get__` дескриптора-функції: `self` прив'язаний при читанні, `bind` не потрібен.
- Атрибут екземпляра створює присвоєння `self.x = ...` у будь-якому методі; атрибут класу будь-яке ім'я в тілі класу, один на всіх.
- Читання шукає в екземплярі, потім у класі, потім у батьках; запис завжди в екземпляр, тому `self.count += 1` затіняє, а не збільшує.
- Змінюване значення в тілі класу спільне для всіх екземплярів; списки й словники створювати в `__init__`.
- Анотація `x: str` без значення не створює атрибут, лише запис у `__annotations__`; з `@dataclass` вона стає полем.
- `@classmethod` з `cls` для альтернативних конструкторів, працює і для підкласів; `@staticmethod` рідко, частіше функція модуля.
- Атрибути в `__dict__`; `getattr`/`setattr`/`hasattr`/`delattr` для доступу за рядком; `private` немає, є `_x` і name mangling `__x`.
- Клас це об'єкт типу `type`: його кладуть у словник-реєстр і передають; `isinstance` замість `type(x) is`, пам'ятаючи про `bool`.

## Що далі

Наступний урок m4-l02 про dunder-методи: `__repr__` з цього уроку отримає пару `__str__`, а `__eq__`, `__hash__`, `__iter__` і `__getitem__` зроблять ваші класи схожими на вбудовані типи. Механізм `__get__`, на якому тут працюють зв'язані методи й `classmethod`, повністю розкриється в m4-l03 разом з `property`, яка перетворить `GenerationJob.status` на атрибут з перевіркою переходів, а пошук атрибутів по батьківських класах розгорнеться в MRO в m4-l04.
