---
id: m1-l07
module: m1-syntax
title: "Функції: аргументи, значення за замовчуванням, *args і **kwargs"
summary: "Учень пише функції з анотаціями й ідіоматичними сигнатурами: іменовані аргументи замість об'єкта опцій, None замість mutable default, *args і **kwargs для збирання й прокидання, keyword-only для прапорців, і розуміє, що функція отримує той самий об'єкт, а не копію."
duration_min: 75
prerequisites: [m1-l06]
---

## `def`, `return` і неявний `None`

Функція оголошується інструкцією `def`, тіло йде відступом, результат повертає `return`. Анотації параметрів і результату (annotations, офіційний термін; у typing-документації їх ще називають type hints) пишуться з першого дня: інтерпретатор їх не перевіряє, але їх читають mypy і pyright (m2-l08), IDE та FastAPI, який будує з них валідацію запитів. Функцію, яка нічого не повертає, анотують `-> None`.

```ts
function fullName(first: string, last: string): string {
  return `${first} ${last}`;
}

function log(message: string): void {
  console.log(`[log] ${message}`);
}

const result = log("saved"); // undefined
```

```python
def full_name(first: str, last: str) -> str:
    return f"{first} {last}"


def log(message: str) -> None:
    print(f"[log] {message}")


print(full_name("Ada", "Lovelace"))
result = log("saved")
print(result)
```

```text
Ada Lovelace
[log] saved
None
```

Розходження в тому, що саме повертається "нічого". `undefined` у Python немає: функція без `return`, з голим `return` або з `return None` повертає один і той самий об'єкт `None`. І `-> None` це не `void` у сенсі "ігноруй результат", а буквальне "повертає об'єкт `None`", який можна присвоїти, порівняти через `is` і випадково передати далі. Анотації при цьому лише документація для інструментів: виклик з рядком замість числа не впаде, якщо операція має сенс для рядка.

```python
def double(x: int) -> int:
    return x * 2


print(double(21))
print(double("ab"))
```

```text
42
abab
```

Кілька значень повертаються через кортеж. `return width, height` повертає один об'єкт `tuple`, бо кортеж утворює кома, а не дужки. На стороні виклику його одразу розпаковують, як `const [w, h] = ...` у JS, тільки кількість імен зобов'язана збігтися з кількістю елементів.

```python live
def split_size(size: str) -> tuple[int, int]:
    width, height = size.split("x")
    return int(width), int(height)


result = split_size("1200x800")
print(result, type(result))

width, height = split_size("1200x800")
print(width, height)

width, _ = split_size("640x480")
print(width)
```

```text
(1200, 800) <class 'tuple'>
1200 800
640
```

> **Пастка.** У JS `const [a, b, c] = [1, 2]` мовчки дає `c === undefined`. У Python розпакування з іншою кількістю імен це `ValueError` у момент присвоєння. Непотрібні значення ловлять ім'ям `_` (конвенція "мені це не потрібно", а не синтаксис), а якщо значень більше трьох, повертають dict, dataclass або NamedTuple (m2-l04, m2-l05), а не довгий кортеж.

```python
def split_size(size: str) -> tuple[int, int]:
    width, height = size.split("x")
    return int(width), int(height)


width, height, depth = split_size("1200x800")
```

```text
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    width, height, depth = split_size("1200x800")
    ^^^^^^^^^^^^^^^^^^^^
ValueError: not enough values to unpack (expected 3, got 2)
```

<!-- task: t1 -->

## Позиційні та іменовані аргументи

Документація розрізняє параметр (parameter, ім'я в `def`) і аргумент (argument, значення в момент виклику); обидва слова офіційні, і на співбесіді їх не плутають. Аргумент можна передати позиційно, за місцем, або як іменований (keyword argument, офіційний термін), за ім'ям параметра. Будь-який звичайний параметр приймає обидва способи, нічого оголошувати додатково не треба.

```python live
def make_field(field_id: str, field_type: str, required: bool) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


print(make_field("email", "email", True))
print(make_field(field_id="email", field_type="email", required=True))
print(make_field(required=True, field_id="email", field_type="email"))
print(make_field("email", "email", required=True))
```

```text
{'id': 'email', 'type': 'email', 'required': True}
{'id': 'email', 'type': 'email', 'required': True}
{'id': 'email', 'type': 'email', 'required': True}
{'id': 'email', 'type': 'email', 'required': True}
```

Змішувати можна з одним правилом: спершу позиційні, потім іменовані. Інтерпретатор прив'язує позиційні аргументи до параметрів зліва направо, а потім іменовані за назвою; позиційний після іменованого не мав би однозначного місця. Тому це `SyntaxError`, і він виникає під час компіляції файлу, до виконання будь-якого рядка: перший `print` у прикладі не спрацьовує.

```python
print("module starts")


def make_field(field_id: str, field_type: str, required: bool) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


make_field(field_id="email", "email", True)
```

```text
  File "example.py", line 8
    make_field(field_id="email", "email", True)
                                              ^
SyntaxError: positional argument follows keyword argument
```

Усі інші невідповідності між викликом і сигнатурою це `TypeError` у момент виклику. Найважливіша для JS-розробника: пропущений аргумент не стає `undefined`, функція просто не викликається.

```python
def make_field(field_id: str, field_type: str, required: bool) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


make_field("email", "email")
```

```text
Traceback (most recent call last):
  File "example.py", line 5, in <module>
    make_field("email", "email")
TypeError: make_field() missing 1 required positional argument: 'required'
```

Так само мова ловить зайвий позиційний аргумент, два значення для одного параметра і невідоме ім'я. Усі три в JS пройшли б мовчки: зайве потрапило б в `arguments`, дубль переписав би значення, а друкарська помилка в ключі об'єкта опцій просто ігнорувалась би в рантаймі.

```python
def make_field(field_id: str, field_type: str, required: bool) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


try:
    make_field("email", "email", True, "extra")
except TypeError as e:
    print(e)

try:
    make_field("email", "email", True, field_id="phone")
except TypeError as e:
    print(e)

try:
    make_field("email", "email", requird=True)
except TypeError as e:
    print(e)
```

```text
make_field() takes 3 positional arguments but 4 were given
make_field() got multiple values for argument 'field_id'
make_field() got an unexpected keyword argument 'requird'
```

Звідси головна заміна JS-звички. Коли функція має кілька необов'язкових налаштувань, у JS їх збирають в об'єкт опцій і деструктуризують у сигнатурі. У Python ту саму роль грають іменовані аргументи зі значеннями за замовчуванням.

```ts
type FieldOptions = { type?: string; required?: boolean };

function makeField(id: string, { type = "text", required = false }: FieldOptions = {}) {
  return { id, type, required };
}

makeField("email", { required: true });
makeField("email", { requird: true } as FieldOptions); // tsc мовчить через as, рантайм ігнорує ключ
```

```python
def make_field(field_id: str, field_type: str = "text", required: bool = False) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


print(make_field("email", required=True))
make_field("email", requird=True)
```

```text
{'id': 'email', 'type': 'text', 'required': True}
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    make_field("email", requird=True)
TypeError: make_field() got an unexpected keyword argument 'requird'
```

Поведінка розходиться в тому, хто перевіряє імена. У TS це об'єкт, який збирає викликач, і контроль ключів є лише на етапі компіляції; у рантаймі будь-який зайвий або помилковий ключ проходить. У Python іменовані аргументи це механізм мови: інтерпретатор зіставляє імена з сигнатурою при кожному виклику, не потребує ні `= {}` для порожнього об'єкта, ні значень за замовчуванням усередині деструктуризації, і не створює проміжного об'єкта.

> **Пастка.** Якщо будь-який параметр можна передати за ім'ям, то ім'я параметра стає частиною публічного контракту функції. Перейменування `field_type` на `kind` ламає кожен виклик `make_field(..., field_type="email")`, хоча позиційні виклики працюють далі. У JS перейменування параметра безпечне завжди, тут ні. Як закрити ім'я від викликачів, показано нижче в розділі про `/`.

## Значення за замовчуванням обчислюються один раз

`def` це інструкція, яка виконується, коли до неї доходить інтерпретатор: вона створює об'єкт функції, обчислює вирази значень за замовчуванням саме в цю мить, зберігає результати в об'єкті функції й прив'язує ім'я. У JS вираз за замовчуванням обчислюється заново при кожному виклику, де аргумент `undefined`.

```ts
function defaultTheme(): string {
  console.log("defaultTheme() called");
  return "light";
}

function render(element: string, theme = defaultTheme()): string {
  return `${element}:${theme}`;
}

render("input");  // defaultTheme() called
render("button"); // defaultTheme() called
```

```python
def default_theme() -> str:
    print("default_theme() called")
    return "light"


def render(element: str, theme: str = default_theme()) -> str:
    return f"{element}:{theme}"


print("--- def done ---")
print(render("input"))
print(render("button"))
print(render.__defaults__)
```

```text
default_theme() called
--- def done ---
input:light
button:light
('light',)
```

Розходження видно по порядку рядків: `default_theme()` викликалась один раз, ще до `--- def done ---`, і більше ніколи. Обчислене значення лежить у кортежі `render.__defaults__`, і кожен виклик без `theme` бере його звідти. Атрибути з подвійним підкресленням з обох боків у спільноті називають dunder (жаргон від double underscore; офіційно це special attributes і special methods). Для незмінних значень, як рядок, число, `None` чи кортеж, момент обчислення непомітний. Для змінних це найвідоміша пастка Python.

```python live
def add_field(field_id: str, fields: list[str] = []) -> list[str]:
    fields.append(field_id)
    return fields


print(add_field("email"))
print(add_field("phone"))
print(add_field.__defaults__)
```

```text
['email']
['email', 'phone']
(['email', 'phone'],)
```

> **Під капотом.** Список `[]` створено один раз при `def` і покладено в `__defaults__`. Кожен виклик без `fields` прив'язує локальне ім'я `fields` до цього самого об'єкта, `append` мутує його, і наступний виклик отримує вже змінений список. Ніякої магії "статичної змінної" немає: це звичайне спільне посилання, і `is` це доводить.

```python
def add_field(field_id: str, fields: list[str] = []) -> list[str]:
    fields.append(field_id)
    return fields


first = add_field("email")
second = add_field("phone")
print(first is second, first is add_field.__defaults__[0])
print(first)
```

```text
True True
['email', 'phone']
```

У спільноті це називають mutable default argument (жаргонна назва пастки; в офіційному FAQ вона розібрана як "Why are default values shared between objects?"). Вона однаково стосується `{}`, `set()` і будь-якого виклику в значенні за замовчуванням: `created_at=time.time()` чи `datetime.now()` дасть час визначення функції, а не час виклику.

```python
import time


def stamp(created_at: float = time.time()) -> float:
    return created_at


a = stamp()
time.sleep(0.01)
b = stamp()
print(a == b)
```

```text
True
```

Правильна ідіома: значення за замовчуванням `None`, а новий об'єкт створюється в тілі, тобто при кожному виклику. `None` незмінний і єдиний, тож спільним він бути може. Анотація `list[str] | None` чесно каже, що параметр можна не передавати.

```python live
def add_field(field_id: str, fields: list[str] | None = None) -> list[str]:
    if fields is None:
        fields = []
    fields.append(field_id)
    return fields


print(add_field("email"))
print(add_field("phone"))
mine = ["id"]
print(add_field("age", mine), mine)
print(add_field.__defaults__)
```

```text
['email']
['phone']
['id', 'age'] ['id', 'age']
(None,)
```

> **Пастка.** Перевіряти треба саме `is None`, а не скорочувати до `fields = fields or []`. Порожній список хибний (truthiness з m1-l03), тож `or` підмінить явно переданий порожній список новим, і викликач не побачить свого результату.

```python
def add_field(field_id: str, fields: list[str] | None = None) -> list[str]:
    fields = fields or []
    fields.append(field_id)
    return fields


mine: list[str] = []
add_field("email", mine)
print(mine)
```

```text
[]
```

Коли `None` сам є осмисленим значенням, як у PATCH-оновленні, де "не передали label" і "скинути label у null" це різні команди, замість `None` ставлять sentinel (жаргон спільноти для унікального маркера; PEP 661 пропонує стандартизувати їх). Найпростіший sentinel це `object()`: такий об'єкт рівний лише сам собі, і викликач не може передати його випадково.

```python
_MISSING = object()


def update_label(field: dict, label: object = _MISSING) -> dict:
    if label is _MISSING:
        return field
    return {**field, "label": label}


field = {"id": "email", "label": "Email"}
print(update_label(field))
print(update_label(field, None))
print(update_label(field, "E-mail"))
```

```text
{'id': 'email', 'label': 'Email'}
{'id': 'email', 'label': None}
{'id': 'email', 'label': 'E-mail'}
```

Той самий механізм дає `lambda i=i: i` з m1-l06: значення `i` обчислюється при створенні lambda і фіксується в її `__defaults__`. І ще одне правило: параметр без значення за замовчуванням не може стояти після параметра зі значенням. У JS `function f(a = 1, b)` легальна, а пропуск роблять через `f(undefined, 2)`; у Python пропуску позиції немає, параметри пропускають за ім'ям, тому така сигнатура не має сенсу і не компілюється.

```python
def make_field(field_type: str = "text", field_id: str) -> dict:
    return {"id": field_id, "type": field_type}
```

```text
  File "example.py", line 1
    def make_field(field_type: str = "text", field_id: str) -> dict:
                                             ^^^^^^^^^^^^^
SyntaxError: parameter without a default follows parameter with a default
```

<!-- task: q1 -->

<!-- task: t2 -->

## `*args` і `**kwargs`: зібрати й розгорнути

`*name` у сигнатурі збирає всі зайві позиційні аргументи в кортеж, `**name` збирає всі зайві іменовані в словник. Зірочки це синтаксис, а імена `args` і `kwargs` лише конвенція, яку всі тримають, бо їх миттєво впізнають. У документації це arbitrary argument lists, а `inspect` називає такі параметри VAR_POSITIONAL і VAR_KEYWORD; у розмові кажуть просто "args і kwargs" або "star-args".

```python live
def log_event(name: str, *args: object, **kwargs: object) -> None:
    print(name, args, kwargs)


log_event("click")
log_event("click", 1, 2)
log_event("click", 1, 2, button="left", shift=True)
```

```text
click () {}
click (1, 2) {}
click (1, 2) {'button': 'left', 'shift': True}
```

Та сама зірочка при виклику працює навпаки: розгортає iterable в окремі позиційні аргументи (argument unpacking, офіційна назва з туторіалу). Це rest і spread з JS, з тією самою симетрією.

```ts
function total(...nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

const values = [1, 2, 3];
total(1, 2, 3);
total(...values);
total(...values, 10, ...[0, 1]);
```

```python
def total(*nums: int) -> int:
    return sum(nums)


values = [1, 2, 3]
print(total(1, 2, 3))
print(total(*values))
print(total(*values, 10, *range(2)))
print(total())
```

```text
6
6
17
0
```

Різниця перша: rest у Python це кортеж, а не масив, тобто незмінний, і `args.append` не спрацює. Анотація `*nums: int` описує кожен елемент, а не весь кортеж. Різниця друга й важливіша: у JS немає аналога `**kwargs` у параметрах, бо в JS немає іменованих аргументів. Найближче `({ id, ...rest })`, але там ви деструктуризуєте один об'єкт, який зібрав викликач. У Python словник `kwargs` будує інтерпретатор з імен у виклику; ключі завжди рядки, а порядок відповідає порядку у виклику.

Оскільки ключі `**kwargs` це довільні рядки, через розгортання словника туди потрапляють і імена, які не можна написати як ідентифікатор. Для фронтендера це HTML-атрибути з дефісом.

```python
def tag(name: str, **attrs: str) -> str:
    rendered = " ".join(f'{key}="{value}"' for key, value in attrs.items())
    return f"<{name} {rendered}>"


print(tag("input", type="email", id="email"))
print(tag("button", **{"aria-label": "Close", "data-id": "x1"}))
```

```text
<input type="email" id="email">
<button aria-label="Close" data-id="x1">
```

`**` при виклику розгортає словник в іменовані аргументи, і його можна комбінувати з `*` та звичайними аргументами в одному виклику. Так конфіг, що прийшов JSON-ом, перетворюється на виклик функції без ручного перекладання полів.

```python live
def make_field(field_id: str, field_type: str = "text", required: bool = False) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


row = ["email", "email"]
options = {"required": True}
print(make_field(*row, **options))

defaults = {"field_type": "number", "required": False}
print(make_field("age", **defaults))
print(make_field("age", **{**defaults, "required": True}))
```

```text
{'id': 'email', 'type': 'email', 'required': True}
{'id': 'age', 'type': 'number', 'required': False}
{'id': 'age', 'type': 'number', 'required': True}
```

> **Пастка.** У літералі словника `{**defaults, "required": True}` пізніший ключ перемагає, як у JS `{...defaults, required: true}`. У виклику функції це не так: один параметр, отриманий двічі, це `TypeError`. Спершу злийте словник, потім розгортайте.

```python
def make_field(field_id: str, field_type: str = "text", required: bool = False) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


defaults = {"field_type": "number", "required": False}
make_field("age", **defaults, required=True)
```

```text
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    make_field("age", **defaults, required=True)
TypeError: __main__.make_field() got multiple values for keyword argument 'required'
```

Пара `*args, **kwargs` у сигнатурі приймає будь-який виклик, а пара `*args, **kwargs` у виклику відтворює його без змін. Разом це прокидання: обгортка нічого не знає про сигнатуру цільової функції й передає все як є. На цьому стоять декоратори (m5-l04). Ціна в тому, що IDE і type checker бачать лише `(*args, **kwargs)`, тож у публічному API явні параметри кращі; `*args, **kwargs` лишають для прокидання і справді варіативних функцій.

```python
def make_field(field_id: str, field_type: str = "text", required: bool = False) -> dict:
    return {"id": field_id, "type": field_type, "required": required}


def logged(fn, *args, **kwargs):
    print(f"call {fn.__name__} args={args} kwargs={kwargs}")
    return fn(*args, **kwargs)


print(logged(make_field, "email", required=True))
```

```text
call make_field args=('email',) kwargs={'required': True}
{'id': 'email', 'type': 'text', 'required': True}
```

<!-- task: t3 -->

## Keyword-only, positional-only і порядок у сигнатурі

Усі параметри після `*` у сигнатурі, голої зірочки чи `*args`, можна передати лише за ім'ям. Це keyword-only параметри (офіційний термін, PEP 3102). Головне застосування: булеві прапорці. Виклик `save(config, True, False)` не читається без документації, і в спільноті це називають boolean trap (жаргон); `*,` змушує викликача написати ім'я.

```python
def save(config: dict, *, overwrite: bool = False, validate: bool = True) -> str:
    return f"overwrite={overwrite} validate={validate}"


print(save({}, overwrite=True))
print(save({}, validate=False, overwrite=True))
save({}, True)
```

```text
overwrite=True validate=True
overwrite=True validate=False
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    save({}, True)
TypeError: save() takes 1 positional argument but 2 were given
```

> **JS-аналог.** `save(config, { overwrite: true })` виражає ту саму ідею: прапорець має ім'я в точці виклику. Keyword-only дає це без об'єкта, і на відміну від об'єкта опцій інтерпретатор перевіряє як імена, так і обов'язковість.

Keyword-only параметр без значення за замовчуванням обов'язковий, і його відсутність дає окреме повідомлення про keyword-only аргумент. Параметри після `*args` теж keyword-only автоматично; так влаштований `print`: усе позиційне йде в `*args`, тому `sep` і `end` можна передати тільки за ім'ям.

```python
def render(element: str, *, theme: str) -> str:
    return f"{element}:{theme}"


print(render("input", theme="dark"))
print("a", "b", sep=" | ")
render("input")
```

```text
input:dark
a | b
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    render("input")
TypeError: render() missing 1 required keyword-only argument: 'theme'
```

Дзеркальна конструкція `/` (positional-only, офіційний термін, PEP 570, з Python 3.8): усе до `/` передається лише позиційно. Найчастіше вона трапляється у вбудованих функціях: сигнатура `len` це `len(obj, /)`, тому `len(obj=...)` не працює.

```python
print(len([1, 2, 3]))
len(obj=[1, 2, 3])
```

```text
3
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    len(obj=[1, 2, 3])
TypeError: len() takes no keyword arguments
```

Причин дві. Перша: ім'я positional-only параметра не входить у контракт, і автор може його перейменувати без breaking change, на відміну від пастки з попереднього розділу. Друга: `**kwargs` може містити ключ з тим самим іменем, що й позиційний параметр, без конфлікту. Без `/` інтерпретатор вирішує, що `name` передали двічі.

```python
def tag(name: str, /, **attrs: str) -> str:
    return f"<{name} {attrs}>"


print(tag("input", name="email", type="email"))


def tag_without_slash(name: str, **attrs: str) -> str:
    return f"<{name} {attrs}>"


tag_without_slash("input", name="email")
```

```text
<input {'name': 'email', 'type': 'email'}>
Traceback (most recent call last):
  File "example.py", line 12, in <module>
    tag_without_slash("input", name="email")
TypeError: tag_without_slash() got multiple values for argument 'name'
```

Повний порядок у сигнатурі фіксований: positional-only, `/`, звичайні, `*args` або гола `*`, keyword-only, `**kwargs`. Будь-яку частину можна пропустити, але не переставити. `inspect.signature` показує вид кожного параметра офіційними назвами, і ці назви варто знати.

```python live
import inspect


def f(a, /, b, *args, c, d=4, **kwargs):
    pass


for name, param in inspect.signature(f).parameters.items():
    print(f"{name:8} {param.kind.name}")
```

```text
a        POSITIONAL_ONLY
b        POSITIONAL_OR_KEYWORD
args     VAR_POSITIONAL
c        KEYWORD_ONLY
d        KEYWORD_ONLY
kwargs   VAR_KEYWORD
```

Порушення порядку це `SyntaxError` ще до виконання, тому нижче сигнатури лише компілюються через `compile`, щоб показати всі повідомлення в одному прикладі. `**kwargs` завжди останній, гола `*` вимагає хоча б одного keyword-only параметра після себе, параметр без значення за замовчуванням не йде після параметра зі значенням у позиційній частині. Серед keyword-only параметрів останнього обмеження немає: обов'язковий `c` може стояти після `d=4`, бо keyword-only аргументи все одно зіставляються за ім'ям, а не за місцем.

```python
signatures = [
    "def f(**kwargs, *args): pass",
    "def f(a, *, **kwargs): pass",
    "def f(a=1, b): pass",
    "def f(*args, d=4, c): pass",
]
for source in signatures:
    try:
        compile(source, "example.py", "exec")
        print(f"{source:30} ok")
    except SyntaxError as e:
        print(f"{source:30} {e.msg}")
```

```text
def f(**kwargs, *args): pass   arguments cannot follow var-keyword argument
def f(a, *, **kwargs): pass    named arguments must follow bare *
def f(a=1, b): pass            parameter without a default follows parameter with a default
def f(*args, d=4, c): pass     ok
```

Ці ж маркери ви бачите в документації й у `help()`. `sorted(iterable, /, *, key=None, reverse=False)` читається так: `iterable` лише позиційно, `key` і `reverse` лише за ім'ям. Старі сигнатури в документації вбудованих функцій пишуть необов'язкові частини у квадратних дужках, як `range(start, stop[, step])`; це нотація документації, а не синтаксис Python.

```python
import inspect

print(inspect.signature(sorted))
print(inspect.signature(print))
help(len)
```

```text
(iterable, /, *, key=None, reverse=False)
(*args, sep=' ', end='\n', file=None, flush=False)
Help on built-in function len in module builtins:

len(obj, /)
    Return the number of items in a container.
```

<!-- task: q4 -->

<!-- task: t4 -->

## Передача аргументів: pass by assignment

Python не копіює аргумент і не передає "змінну". При виклику параметр прив'язується до того самого об'єкта, що й аргумент, рівно як присвоєння `param = argument`. Офіційний FAQ формулює це як "arguments are passed by assignment", туторіал як call by object reference, а в літературі й на співбесідах звучить call by sharing. Звідси два наслідки: мутація об'єкта всередині функції видна ззовні, переприсвоєння імені ні.

```python live
def add_required(fields: list[str]) -> None:
    fields.append("email")


def replace(fields: list[str]) -> None:
    fields = ["phone"]


def bump(count: int) -> None:
    count += 1


my_fields: list[str] = []
add_required(my_fields)
replace(my_fields)
n = 0
bump(n)
print(my_fields, n)
```

```text
['email'] 0
```

> **JS-аналог.** Модель та сама, що в JS для об'єктів: передається посилання, і `obj.x = 1` у функції видно ззовні, а `obj = {}` ні. Звичне правило "примітиви за значенням, об'єкти за посиланням" у Python не потрібне: передача однакова для всього, бо все об'єкти. `int`, `str`, `tuple` просто незмінні, тож функція не може змінити їх на місці, і для них це виглядає як передача за значенням.

`is` показує механізм напряму: всередині функції параметр це той самий об'єкт, поки його не переприсвоїли.

```python
def show(items: list[int]) -> None:
    print(items is data)
    items = items + [4]
    print(items is data, items)


data = [1, 2, 3]
show(data)
print(data)
```

```text
True
False [1, 2, 3, 4]
[1, 2, 3]
```

> **Пастка.** `items += [4]` і `items = items + [4]` для списку не одне й те саме. `+` будує новий список, `+=` для змінюваного списку розширює існуючий на місці і прив'язує ім'я до того самого об'єкта, тож мутація протікає назовні. Для `int`, `str` і `tuple` `+=` створює новий об'єкт, бо змінити їх на місці неможливо. Детально про aliasing у m2-l02.

```python
def extend_in_place(items: list[int]) -> None:
    items += [4]


def extend_copy(items: list[int]) -> None:
    items = items + [4]


a = [1]
b = [1]
extend_in_place(a)
extend_copy(b)
print(a, b)
```

```text
[1, 4] [1]
```

Конвенція, що з цього випливає: функція або мутує аргумент і повертає `None`, або повертає новий об'єкт і аргумент не чіпає. Обидва одразу не роблять, бо викликач не знає, на що розраховувати. Якщо функції потрібна змінена версія вхідних даних, вона спершу робить копію, `list(items)`, `dict(config)` або `{**config}` (неглибоку; глибока копія в m2-l02).

```python
def with_required(field: dict) -> dict:
    result = dict(field)
    result["required"] = True
    return result


original = {"id": "email"}
updated = with_required(original)
print(original, updated)
```

```text
{'id': 'email'} {'id': 'email', 'required': True}
```

<!-- task: q2 -->

## Мутація повертає `None`: `sort()` проти `sorted()`

Ця конвенція вбудована в стандартну бібліотеку, і JS-звичка `const x = arr.sort()` на ній ламається. Методи, що змінюють об'єкт на місці, повертають `None`: `list.sort`, `list.reverse`, `list.append`, `list.extend`, `dict.update`, `random.shuffle`. Їхні двійники без мутації повертають новий об'єкт: `sorted`, `reversed`.

```ts
const fields = ["phone", "email", "age"];
const ordered = fields.sort();
console.log(ordered === fields); // true: той самий масив, уже відсортований
const copy = fields.toSorted();  // ES2023: нова копія
```

```python
fields = ["phone", "email", "age"]
ordered = fields.sort()
print(ordered)
print(fields)
print(sorted(["phone", "email", "age"]))
```

```text
None
['age', 'email', 'phone']
['age', 'email', 'phone']
```

У JS `sort` і мутує, і повертає той самий масив, тому `const ordered = arr.sort()` працює, хоча й псує оригінал. У Python `sort` повертає `None` навмисно, щоб мутація не маскувалась під обчислення; `sorted` це `toSorted`. Неприємність у тому, що помилка вилазить не в рядку з `sort`, а там, де результат використали.

```python
fields = ["phone", "email", "age"]
fields = fields.sort()
print(fields[0])
```

```text
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    print(fields[0])
          ~~~~~~^^^
TypeError: 'NoneType' object is not subscriptable
```

Друге джерело неявного `None`: гілка, яка забула `return`. Функція тихо повертає `None`, і помилка знову з'являється далеко від причини. Анотація `-> str` тут окупається: mypy позначить таку функцію як "Missing return statement" ще до запуску (m2-l08).

```python
def field_label(field: dict) -> str:
    if "label" in field:
        return field["label"]
    field["id"].replace("_", " ").title()


print(field_label({"id": "email", "label": "E-mail"}))
print(field_label({"id": "first_name"}))
```

```text
E-mail
None
```

<!-- task: q3 -->

## Функція як об'єкт: атрибути й docstring

Функція в Python це об'єкт типу `function`, повноцінне значення (first-class object, загальний термін з теорії мов, у документації Python вживається описово). Її присвоюють іншому імені, передають аргументом, кладуть у словник, повертають з іншої функції. Тут JS-інтуїція працює повністю; функції вищого порядку й словники-диспетчери детально в m1-l09, повернення функції з функції й замикання в m1-l08.

```python live
def render_input(field: dict) -> str:
    return f'<input name="{field["id"]}">'


def render_textarea(field: dict) -> str:
    return f'<textarea name="{field["id"]}"></textarea>'


renderers = {"input": render_input, "textarea": render_textarea}
render = renderers["textarea"]
print(render({"id": "bio"}))
print(type(render), render.__name__, render is render_textarea)
```

```text
<textarea name="bio"></textarea>
<class 'function'> render_textarea True
```

Як об'єкт функція має атрибути, і деякі з них ви вже бачили. `__name__` це ім'я з `def`, воно не змінюється при присвоєнні іншому імені. `__defaults__` кортеж значень за замовчуванням позиційних параметрів, `__kwdefaults__` словник значень keyword-only параметрів, `__annotations__` словник анотацій, `__doc__` docstring. Docstring (офіційний термін, PEP 257) це рядковий літерал першою інструкцією в тілі функції: інтерпретатор зберігає його в `__doc__`, а не викидає, як коментар.

```python
def make_field(field_id: str, field_type: str = "text", *, required: bool = False) -> dict:
    """Build a field config for the form builder."""
    return {"id": field_id, "type": field_type, "required": required}


print(make_field.__name__)
print(make_field.__doc__)
print(make_field.__defaults__)
print(make_field.__kwdefaults__)
print(make_field.__annotations__)
```

```text
make_field
Build a field config for the form builder.
('text',)
{'required': False}
{'field_id': <class 'str'>, 'field_type': <class 'str'>, 'required': <class 'bool'>, 'return': <class 'dict'>}
```

Стиль docstring задає PEP 257. Однорядковий: одне речення в наказовому способі, лапки на тому самому рядку. Багаторядковий: рядок-резюме, порожній рядок, деталі, закривні лапки окремим рядком. Для опису параметрів є дві поширені конвенції, Google style з секціями `Args:` / `Returns:` / `Raises:` і NumPy style з підкресленими заголовками; обидві розуміють IDE та генератори документації, у проєкті обирають одну. `help(f)` друкує сигнатуру й docstring.

```python
def make_field(field_id: str, field_type: str = "text", *, required: bool = False) -> dict:
    """Build a field config for the form builder.

    Args:
        field_id: Unique id of the field within the form.
        field_type: Input type, e.g. "text" or "email".
        required: Whether the field must be filled.

    Returns:
        A dict ready to be serialized to JSON.
    """
    return {"id": field_id, "type": field_type, "required": required}


help(make_field)
```

```text
Help on function make_field in module __main__:

make_field(field_id: str, field_type: str = 'text', *, required: bool = False) -> dict
    Build a field config for the form builder.

    Args:
        field_id: Unique id of the field within the form.
        field_type: Input type, e.g. "text" or "email".
        required: Whether the field must be filled.

    Returns:
        A dict ready to be serialized to JSON.
```

> **JS-аналог.** JSDoc `/** ... */` це коментар, його немає в рантаймі. Docstring це значення, яке живе в об'єкті функції, і його читають `help()`, IDE, pytest-doctest (m3-l05) і FastAPI, який кладе docstring ендпоінта в опис OpenAPI.

<!-- task: t5 -->

## Для капстоуну

Рендерер елемента форми в капстоуні рекурсивний: елемент, тема, глибина вкладеності для відступів. У TS таку функцію зазвичай пишуть з об'єктом опцій і на кожному рівні рекурсії збирають новий об'єкт.

```ts
type RenderOptions = { theme: string; depth?: number };

function render(element: FormElement, { theme, depth = 0 }: RenderOptions): string {
  const indent = "  ".repeat(depth);
  const lines = [`${indent}<${element.type} data-theme="${theme}">`];
  for (const child of element.children ?? []) {
    lines.push(render(child, { theme, depth: depth + 1 }));
  }
  return lines.join("\n");
}
```

```python
def render(element: dict, *, theme: str, depth: int = 0) -> str:
    indent = "  " * depth
    lines = [f'{indent}<{element["type"]} data-theme="{theme}">']
    for child in element.get("children", []):
        lines.append(render(child, theme=theme, depth=depth + 1))
    return "\n".join(lines)


form = {
    "type": "form",
    "children": [
        {"type": "input"},
        {"type": "fieldset", "children": [{"type": "select"}]},
    ],
}
print(render(form, theme="dark"))
```

```text
<form data-theme="dark">
  <input data-theme="dark">
  <fieldset data-theme="dark">
    <select data-theme="dark">
```

Сигнатура `render(element, *, theme, depth=0)` дає те саме, що об'єкт опцій, і більше. `theme` обов'язковий, і забутий `theme` падає `TypeError` у точці виклику, а не `undefined` десь на третьому рівні рекурсії. `depth` має значення за замовчуванням прямо в сигнатурі, без деструктуризації. Виклик читається як конфіг (`theme=theme, depth=depth + 1`), а keyword-only гарантує, що нова опція, скажімо `locale`, додається без зламу наявних викликів і що ніхто не напише `render(el, "dark", 1)`. Якщо опції приходять з JSON-конфігу словником, їх розгортають через `**`, і невідомий ключ конфігу одразу стає помилкою, а не тихо ігнорується.

```python
def render(element: dict, *, theme: str, depth: int = 0) -> str:
    indent = "  " * depth
    lines = [f'{indent}<{element["type"]} data-theme="{theme}">']
    for child in element.get("children", []):
        lines.append(render(child, theme=theme, depth=depth + 1))
    return "\n".join(lines)


options = {"theme": "light"}
print(render({"type": "input"}, **options))
render({"type": "input"}, **{"theme": "light", "colour": "red"})
```

```text
<input data-theme="light">
Traceback (most recent call last):
  File "example.py", line 11, in <module>
    render({"type": "input"}, **{"theme": "light", "colour": "red"})
TypeError: render() got an unexpected keyword argument 'colour'
```

> **Для капстоуну.** FastAPI читає сигнатуру функції-ендпоінта буквально: імена параметрів стають іменами query-параметрів, значення за замовчуванням роблять їх необов'язковими, анотації задають валідацію (m7-l01). Усе з цього уроку, від `= None` замість `= []` до keyword-only, у капстоуні перетворюється на HTTP-контракт.

<!-- task: t6 -->

## Типові помилки JS-розробника

1. **Словник опцій замість іменованих аргументів.** За звичкою з `fn(id, { required: true })` пишуть `options: dict` і дістають ключі через `.get`. Друкарська помилка в ключі тихо дає значення за замовчуванням. Правильно: іменовані параметри зі значеннями за замовчуванням, прапорці keyword-only.

   ```python
   def make_field(field_id, options={}):                  # за звичкою
       return {"id": field_id, "required": options.get("required", False)}

   def make_field(field_id, *, required=False):            # правильно
       return {"id": field_id, "required": required}
   ```

2. **Пошук `arguments`.** Об'єкта `arguments` немає. Змінну кількість аргументів оголошують у сигнатурі, і вона приходить кортежем.

   ```python
   def total(*nums: int) -> int:
       return sum(nums)

   total(1, 2, 3)  # -> 6
   ```

3. **Перевантаження через `typeof`.** Одна функція приймає "або id, або індекс" і розгалужується по типу аргументу. У Python це так само можливо через `isinstance`, але ідіоматично розвести на дві функції або дати різні іменовані параметри; `typing.overload` описує перевантаження лише для type checker, рантайм-диспетчеризації він не дає.

   ```python
   def get_field(fields, key):                  # за звичкою
       return fields[key] if isinstance(key, int) else next(f for f in fields if f["id"] == key)

   def get_field(fields, *, field_id):          # правильно: намір видно у виклику
       return next(f for f in fields if f["id"] == field_id)
   ```

4. **Змінюване значення за замовчуванням.** `(items = [])` у JS безпечне, бо обчислюється при кожному виклику. У Python список створюється один раз при `def` і накопичує дані між викликами. Правильно: `None` і створення в тілі.

   ```python
   def add(item, items=[]): ...                        # спільний список на всі виклики
   def add(item, items: list | None = None):
       if items is None:
           items = []
   ```

5. **Очікування `undefined` для пропущеного аргументу.** Пропущений аргумент це `TypeError: missing 1 required positional argument`, а не значення-заглушка. Необов'язковий параметр оголошують явно зі значенням за замовчуванням.

   ```python
   def greet(name, greeting="Hello"):
       return f"{greeting}, {name}"

   greet("Ada")  # -> 'Hello, Ada'
   greet()       # TypeError: greet() missing 1 required positional argument: 'name'
   ```

6. **`x = arr.sort()`.** Метод повертає `None`, а помилка вилазить далі, при першому зверненні до `x`. Правильно: `sorted(arr)` для нового списку або `arr.sort()` окремим рядком без присвоєння.

   ```python
   ordered = sorted(fields)
   fields.sort()
   ```

7. **Переприсвоєння параметра в надії, що викликач побачить.** `items = [...]` всередині функції змінює лише локальне ім'я. Правильно: повернути нове значення і присвоїти його у викликача.

   ```python
   def normalize(items):
       return [x.strip() for x in items]

   items = normalize(items)
   ```

8. **Булеві прапорці позиційно.** `save(cfg, True, False)` з JS-звички передавати позиційно все. Правильно: `*` у сигнатурі, і виклик сам себе документує.

   ```python
   def save(config, *, overwrite=False, validate=True): ...

   save(cfg, overwrite=True, validate=False)
   ```

## Підсумок

- Функція без `return` повертає `None`; `-> None` у сигнатурі буквальне, а не `void`. Анотації пишуться завжди, але рантайм їх не перевіряє.
- Кілька значень це кортеж: `return a, b`, розпакування `a, b = f()` з точною кількістю імен.
- Будь-який звичайний параметр приймає аргумент і за місцем, і за ім'ям; спершу позиційні, потім іменовані. Імена параметрів тому частина контракту.
- Невідповідність виклику й сигнатури це `TypeError` у момент виклику; `undefined` для пропущеного аргументу немає.
- Значення за замовчуванням обчислюються один раз при `def` і живуть у `__defaults__`. Змінюване значення за замовчуванням спільне для всіх викликів; ідіома `x: list | None = None` і `if x is None` у тілі.
- `*args` збирає позиційні в кортеж, `**kwargs` іменовані в словник; у виклику `*` і `**` розгортають. Дубль параметра при розгортанні це помилка, а не "пізніший перемагає".
- Після `*` параметри keyword-only, до `/` positional-only. Порядок: `a, /, b, *args, c, **kwargs`.
- Передача pass by assignment: параметр прив'язаний до того самого об'єкта; мутація видна ззовні, переприсвоєння ні.
- Методи, що мутують, повертають `None`: `list.sort()` проти `sorted()`.
- Функція це об'єкт з `__name__`, `__doc__`, `__defaults__`, `__kwdefaults__`, `__annotations__`; docstring це значення в рантаймі, його показує `help()`.

## Що далі

Наступний урок m1-l08 про scope: як функція знаходить імена (LEGB), чому присвоєння всередині функції робить ім'я локальним і як працюють замикання з `nonlocal`. Звідти стане видно, чому `lambda i=i` з m1-l06 працює саме через `__defaults__`, а не через замикання. Далі m1-l09 спирається на функції як об'єкти з цього уроку: `key=`, `functools.partial` і словник рендерерів для капстоуну.
