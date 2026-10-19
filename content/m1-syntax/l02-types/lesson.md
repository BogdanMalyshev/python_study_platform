---
id: m1-l02
module: m1-syntax
title: "Типи: int без переповнення, None замість null і undefined"
summary: "Учень знає скалярні типи Python і їхню семантику там, де вона розходиться з JS: точний int без меж, float з винятками замість Infinity і NaN, floor-ділення й остачу зі знаком дільника, bool як підклас int, один None замість null і undefined, явні перетворення без коерції й анотації, які інтерпретатор не перевіряє."
duration_min: 60
prerequisites: [m1-l01]
---

## Вбудовані типи, `type()` і `isinstance()`

Скалярних вбудованих типів (built-in types, офіційна назва з документації), з якими ви працюватимете щодня, п'ять: `int`, `float`, `str`, `bool` і `NoneType` з єдиним значенням `None`. Шостий, `complex`, існує для комплексних чисел з літералом `3j`; у вебі він не трапляється, і далі в курсі його не буде. Порівняно з JS змінився розклад: замість одного `number` два числові типи, замість `null` і `undefined` один `None`, окремий `bigint` не потрібен, а `symbol` серед скалярів аналога не має.

```python
values = [42, 3.14, "42", True, None, 2 + 3j]
for v in values:
    print(repr(v), type(v))
```

```text
42 <class 'int'>
3.14 <class 'float'>
'42' <class 'str'>
True <class 'bool'>
None <class 'NoneType'>
(2+3j) <class 'complex'>
```

`type(x)` повертає клас об'єкта. Це найближче до `typeof`, але відповідь точна: не `"object"` для всього складного і не `"number"` для обох чисел, а конкретний клас. Для перевірок у коді пишуть `isinstance(x, cls)`: "чи є `x` екземпляром `cls` або його підкласу". Другим аргументом можна передати кортеж класів, і тоді це перевірка "одне з". За змістом це `instanceof`, тільки він працює і для чисел та рядків, бо примітивів у Python немає (про це наприкінці розділу).

```python
print(type(42) == int)
print(type(True) == int)
print(isinstance(True, int))
print(isinstance(42, (int, float)))
print(isinstance(3.14, (int, float)))
print(isinstance("42", (int, float)))
```

```text
True
False
True
True
True
False
```

`type(x) == int` гірше за `isinstance(x, int)`, бо ігнорує наслідування. Екземпляр підкласу `int` поводиться як `int`, але точне порівняння класу його відкидає. Другий рядок вище вже показав такий підклас: `bool` успадковує від `int` (окремий розділ нижче). Те саме з будь-яким вашим підкласом:

```python
class Port(int):
    pass

port = Port(8080)
print(port + 1)
print(type(port) == int, isinstance(port, int))
print(type(True) == int, isinstance(True, int))
print(type(port).__name__)
```

```text
8081
False True
False True
Port
```

> **Пастка.** Те саме наслідування робить `isinstance(x, int)` занадто щедрим для даних з JSON: `True` проходить перевірку на число. Коли потрібне саме ціле, а не bool, спершу відсіюють `bool`, або перевіряють точний тип через `type(x) is int`. Це єдиний поширений випадок, де точний тип доречний, і тоді пишуть `is`, а не `==`: клас один на всю програму, тож його порівнюють як об'єкт (identity, детально в m1-l03).

У JS є примітиви й обгортки: `(5).toFixed(2)` працює, бо рушій на мить загортає число в `Number`. У Python обгорток немає, бо примітивів немає: `255` це повноцінний об'єкт класу `int` з методами. Класи теж об'єкти: `int` можна покласти в змінну, передати у функцію, спитати його ім'я. Клас усіх класів називається `type`, і саме тому `type(x)` повертає клас. Глибше, до метакласів, курс тут не йде. Атрибути на кшталт `__name__` з подвійними підкресленнями з обох боків називають dunder (від double underscore, жаргон спільноти; документація каже special attributes і special methods): це імена, які визначає мова.

```python
print((255).bit_length())
print((0.5).as_integer_ratio())
print(int.__name__)
print(type(int))
print(type(type))
print(isinstance(int, object), isinstance(None, object), isinstance(len, object))
```

```text
8
(1, 2)
int
<class 'type'>
<class 'type'>
True True True
```

Дужки навколо `255` потрібні тому, що без них парсер читає `255.` як початок float-літерала:

```python
print(255.bit_length())
```

```text
  File "example.py", line 1
    print(255.bit_length())
             ^
SyntaxError: invalid decimal literal
```

## `int` без переповнення, `float` як `number`

`int` у Python має довільну точність (документація каже "unlimited precision", у спільноті ще arbitrary-precision integers або bignum). Ціле число росте, поки вистачає пам'яті, і арифметика над ним точна. Немає `Number.MAX_SAFE_INTEGER`, немає окремого `BigInt` з суфіксом `n` і забороною змішувати його з `number`: `1` і `2 ** 100` мають один тип.

```ts
console.log(2 ** 53 + 1);       // 9007199254740992
console.log(9007199254740993);  // 9007199254740992
console.log(2n ** 100n);        // 1267650600228229401496703205376n
console.log(2n ** 100n + 0.5);  // TypeError: Cannot mix BigInt and other types
```

```python
print(2 ** 53 + 1)
print(9007199254740993)
print(2 ** 100)
print(2 ** 100 + 0.5)
print(type(2 ** 100), type(2 ** 100 + 0.5))
```

```text
9007199254740993
9007199254740993
1267650600228229401496703205376
1.2676506002282294e+30
<class 'int'> <class 'float'>
```

Поведінка розходиться в двох місцях. У JS число за `2 ** 53` мовчки округлюється до найближчого представного double; у Python ціле лишається точним, хоч яке велике. А змішування цілого з дробовим у Python не помилка, як з `BigInt`, а звичайне приведення до `float`, і в цей момент точність втрачається так само, як у JS.

> **Під капотом.** CPython зберігає `int` як масив "цифр" по 30 біт і додає цифри, коли число росте. Звідси ціна: маленьке ціле займає 28 байт, а не 8, і операції повільніші за машинні. `sys.maxsize` це не межа `int`, а максимальний розмір контейнера на цій платформі, і його можна перевищити звичайним `+ 1`.

```python
import sys
print(sys.getsizeof(1), sys.getsizeof(2 ** 100), sys.getsizeof(2 ** 1000))
print(sys.maxsize, sys.maxsize + 1)
```

```text
28 40 160
9223372036854775807 9223372036854775808
```

Це вивід 64-бітного CPython; у браузерному Pyodide, який 32-бітний, числа будуть іншими, тому приклад не live. Практичний висновок інший: переповнення цілих у Python не буває, і код на кшталт `x | 0` чи `>>> 0`, яким у JS обрізають до 32 біт, тут не потрібен.

> **Пастка.** Межа все ж є, але не в арифметиці, а в перетворенні між `int` і рядком: з 2022 року (Python 3.11 і патч-релізи старших гілок) `int(s)` і `str(n)` відмовляються працювати з числами довше 4300 цифр. Це захист від DoS, бо алгоритм перетворення квадратичний, а бекенд парсить числа з чужих JSON. Ліміт змінюється через `sys.set_int_max_str_digits()`.

```python
print(int("1" * 5000))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(int("1" * 5000))
          ^^^^^^^^^^^^^^^
ValueError: Exceeds the limit (4300 digits) for integer string conversion: value has 5000 digits; use sys.set_int_max_str_digits() to increase the limit
```

`float` це той самий IEEE 754 double, що й `number` у JS, тож усе відоме про `0.1 + 0.2` переноситься один в один. Порівнювати дробові через `==` не можна ні там, ні тут; замість `Math.abs(a - b) < Number.EPSILON` у Python є `math.isclose`. Нескінченність і NaN теж є, але без літералів: `float("inf")`, `float("nan")` або константи `math.inf` і `math.nan`.

```python live
import math

print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)
print(math.isclose(0.1 + 0.2, 0.3))
print(1e3, type(1e3))
print(float("inf"), -math.inf, float("nan"))
print(float("inf") > 10 ** 300)

nan = float("nan")
print(nan == nan, nan != nan)
print(math.isnan(nan))
```

```text
0.30000000000000004
False
True
1000.0 <class 'float'>
inf -inf nan
True
False True
True
```

`nan != nan` не примха Python, а правило IEEE 754: NaN не дорівнює нічому, включно із собою, бо це "результат без значення", і два такі результати не обов'язково однакові. Те саме в JS: `NaN !== NaN`, а `math.isnan` це `Number.isNaN`. Різниця в іншому: у Python NaN і нескінченність майже не виникають самі. Там, де JS мовчки повертає `Infinity` або `NaN`, Python кидає виняток.

```python
print(1 / 0)
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(1 / 0)
          ~~^~~
ZeroDivisionError: division by zero
```

```python
import math

def attempt(fn):
    try:
        return fn()
    except Exception as e:
        return f"{type(e).__name__}: {e}"

print(attempt(lambda: 0 / 0))
print(attempt(lambda: math.sqrt(-1)))
print(attempt(lambda: float("abc")))
print(attempt(lambda: float(10 ** 400)))
print(attempt(lambda: int(float("nan"))))
inf = float("inf")
print(inf - inf, inf * 0)
```

```text
ZeroDivisionError: division by zero
ValueError: math domain error
ValueError: could not convert string to float: 'abc'
OverflowError: int too large to convert to float
ValueError: cannot convert float NaN to integer
nan nan
```

У JS ці п'ять рядків дали б `NaN`, `NaN`, `NaN`, `Infinity` і `NaN`, і помилка поїхала б далі по обчисленнях. У Python NaN з'являється лише тоді, коли ви його явно створили або коли арифметика над уже наявною нескінченністю не має відповіді, як останній рядок. `int` взагалі не має ні NaN, ні нескінченності.

> **Пастка.** Якщо NaN таки потрапив у список, сортування й `max` ламаються мовчки: будь-яке порівняння з NaN дає `False`, і алгоритм сортування робить хибні висновки. Фільтруйте NaN до сортування через `math.isnan`.

```python
import math

values = [1.5, float("nan"), 0.5]
print(sorted(values))
print(max(values), max([float("nan"), 1.5]))
print(sorted(v for v in values if not math.isnan(v)))
```

```text
[1.5, nan, 0.5]
1.5 nan
[0.5, 1.5]
```

Для точної десяткової арифметики, гроші насамперед, у стандартній бібліотеці є `decimal.Decimal`, а для точних дробів `fractions.Fraction`; обидва повільніші за `float`. `Decimal` створюють з рядка: з `float` він чесно скопіює вже неточне двійкове значення.

```python live
from decimal import Decimal
from fractions import Fraction

print(Decimal("0.1") + Decimal("0.2"))
print(Decimal("0.1") + Decimal("0.2") == Decimal("0.3"))
print(Fraction(1, 3) + Fraction(1, 6))
print(Decimal(0.1))
```

```text
0.3
True
1/2
0.1000000000000000055511151231257827021181583404541015625
```

## Ділення, остача й округлення

Операторів ділення два. `/` (true division, назва з PEP 238, який розвів два види ділення) завжди повертає `float`, навіть для `6 / 2`. `//` це цілочисельне ділення з округленням униз (floor division, офіційна назва з документації): результат округлюється до мінус нескінченності, а не до нуля. Для додатних чисел різниці немає, для від'ємних є.

```ts
7 / 2;               // 3.5
6 / 2;               // 3
Math.floor(-7 / 2);  // -4
Math.trunc(-7 / 2);  // -3
-7 % 3;              // -1
7 % -3;              // 1
```

```python
print(7 / 2, 6 / 2, type(6 / 2))
print(7 // 2, -7 // 2)
print(7 % 3, -7 % 3, 7 % -3)
print(7.5 // 2, -7.5 // 2)
```

```text
3.5 3.0 <class 'float'>
3 -4
1 2 -2
3.0 -4.0
```

Поведінка розходиться на від'ємних числах. `-7 // 2` це `-4`, як `Math.floor`, а не `-3`, як `Math.trunc` чи `(a / b) | 0`, якими в JS зазвичай отримують ціле. `%` у Python бере знак дільника, а в JS знак діленого: `-7 % 3` дає `2` проти `-1`. І `//` на `float` повертає `float` з цілим значенням, а не `int`.

> **Під капотом.** `//` і `%` узгоджені однією тотожністю: `a == (a // b) * b + a % b`. Якщо частка округлюється вниз, остача мусить мати знак дільника, інакше рівність не зійдеться. У JS той самий зв'язок тримається з `Math.trunc` і остачею зі знаком діленого. Python вибрав floor, бо тоді `x % n` для додатного `n` завжди лежить у `[0, n)`, і циклічні індекси не потребують `((x % n) + n) % n`.

`divmod(a, b)` повертає пару `(a // b, a % b)` за одну операцію. Поведінку JS, якщо вона справді потрібна, дають `math.trunc` і `math.fmod`.

```python live
import math

print(divmod(7, 3), divmod(-7, 3))
q, r = divmod(-7, 3)
print(q * 3 + r)

print((0 - 1) % 7)
minutes, seconds = divmod(125, 60)
print(f"{minutes}:{seconds:02d}")

print(int(-7 / 2), math.trunc(-7 / 2), math.fmod(-7, 3))
```

```text
(2, 1) (-3, 2)
-7
6
2:05
-3 -3 -1.0
```

`(0 - 1) % 7` дорівнює `6`: день тижня перед неділею-нулем це субота-шість без жодних перевірок на від'ємне. У JS тут вийшло б `-1`.

`round` округлює до парного при рівно половині (документація каже "round half to even", у спільноті banker's rounding, банківське округлення). `round(2.5)` це `2`, а не `3`, як `Math.round`. Причина: це режим за замовчуванням в IEEE 754, і при сумуванні багатьох округлених значень він не дає систематичного зсуву вгору. `round(x)` повертає `int`, `round(x, n)` повертає `float`.

```python
print(round(0.5), round(1.5), round(2.5), round(3.5), round(-2.5))
print(round(2.675, 2))
print(round(3.14159, 2), round(1234, -2))
print(type(round(2.7)), type(round(2.7, 0)))
```

```text
0 2 2 4 -2
2.67
3.14 1200
<class 'int'> <class 'float'>
```

> **Пастка.** `round(2.675, 2)` дає `2.67` вже не через банківське правило: `2.675` у двійковому вигляді трохи менше за `2.675`, і округлення чесно йде вниз. Якщо бізнес-правило вимагає "половина вгору", як у чеках, рахуйте в `Decimal` з явним режимом округлення.

```python
from decimal import Decimal, ROUND_HALF_UP

print(Decimal("2.5").quantize(Decimal("1"), rounding=ROUND_HALF_UP))
print(Decimal("2.675").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
```

```text
3
2.68
```

<!-- task: q1 -->

<!-- task: t1 -->

## `bool` це підклас `int`

`True` і `False` це екземпляри `bool`, а `bool` успадковує від `int`. `True` дорівнює `1`, `False` дорівнює `0`, і з ними працює вся арифметика цілих. Причина історична: `bool` з'явився лише в Python 2.3 (PEP 285), коли код уже роками повертав `1` і `0` як істину й хибність. Щоб не зламати його, новий тип зробили підкласом `int`, і всі старі порівняння й обчислення лишились коректними.

```python
print(True + True, True * 10, False - 1)
print(isinstance(True, int), issubclass(bool, int))
print(True == 1, False == 0)
print(int(True), bool.__mro__)
```

```text
2 10 -1
True True
True True
1 (<class 'bool'>, <class 'int'>, <class 'object'>)
```

Корисна частина: `sum` по булевих значеннях рахує істинні, і це ідіоматичний лічильник без `filter(...).length`.

```python
answers = [True, False, True, True]
print(sum(answers))

fields = [
    {"id": "email", "required": True},
    {"id": "age", "required": False},
    {"id": "phone", "required": True},
]
print(sum(f["required"] for f in fields))
```

```text
3
2
```

Шкідлива частина: для словників, множин і `in` значення `True` і `1` це той самий ключ, бо вони рівні й мають однаковий хеш. Ключ `True` перезаписує ключ `1`, множина з `0, False, 1, True` має два елементи, а `True` можна навіть використати як індекс списку.

```python live
print(True in [1, 2, 3])
print(1 in [True])
print({1: "one", True: "true"})
print(len({0, False, 1, True}))
print(["a", "b"][True])
```

```text
True
True
{1: 'true'}
2
b
```

> **Пастка.** У JS `true + true` теж `2`, але через коерцію в number, а `typeof true` лишається `"boolean"`. У Python `bool` справді є `int` за типом, тому перевірка `isinstance(value, int)` пропускає `True`. Для валідатора, де JSON `true` у числовому полі має бути помилкою, `bool` перевіряють першим.

```python
def is_int(value) -> bool:
    return isinstance(value, int)

def is_real_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)

for v in [5, True, 5.0]:
    print(repr(v), is_int(v), is_real_int(v), type(v) is int)
```

```text
5 True True True
True True False False
5.0 False False False
```

<!-- task: q2 -->

<!-- task: t2 -->

## `None`: одне "нічого" замість `null` і `undefined`

`None` це єдиний екземпляр типу `NoneType`. Такі об'єкти називають singleton (термін з PEP 8 і спільноти; документація каже "the sole value of the type NoneType"). Через те, що `None` один на всю програму, його перевіряють через `is None`, тобто "це той самий об'єкт", а не через `==` (чому `== None` вважається помилкою, детально в m1-l03). Аналога `typeof null === "object"` немає: тип `None` це `NoneType`, і все.

```python
print(type(None))
print(None is None, None == None)
x = None
y = None
print(x is y)
print(repr(None), str(None), bool(None))
```

```text
<class 'NoneType'>
True True
True
None None False
```

Функція без `return`, або з голим `return`, повертає `None`. Те саме роблять методи, які змінюють об'єкт на місці: `list.append`, `list.sort`, `dict.update`. Їхній результат `None`, а не новий список і не довжина, як у `Array.prototype.push`.

```python
def log(message: str):
    print("log:", message)

result = log("saved")
print(result)
print([].append(1))
```

```text
log: saved
None
None
```

```python
fields = ["email"]
fields = fields.append("phone")
print(fields)
```

```text
None
```

Чому Python обійшовся одним "нічого". У JS `undefined` виникає в чотирьох ситуаціях: змінна оголошена без значення, властивості немає в об'єкті, аргумент не передали, функція нічого не повернула. У Python перші три це помилки: змінної без значення не буває (`NameError`), відсутній ключ дає `KeyError`, відсутній атрибут `AttributeError`, пропущений аргумент `TypeError`. Лишається тільки функція без `return`, і для неї вистачає `None`. Тому `None` завжди означає "значення свідомо порожнє", а відсутність чогось видно одразу як виняток, а не як `undefined`, що тихо проповз на три виклики далі.

```python
config = {"id": "email"}
print(config["label"])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(config["label"])
          ~~~~~~^^^^^^^^^
KeyError: 'label'
```

```python
def greet(name):
    return f"hi {name}"

greet()
```

```text
Traceback (most recent call last):
  File "example.py", line 4, in <module>
    greet()
TypeError: greet() missing 1 required positional argument: 'name'
```

Операторів `??` і `?.` у Python немає (PEP 505 пропонував їх, і пропозиція відкладена). Їх перекладають так. `a ?? b` стає умовним виразом `a if a is not None else b`. Читання необов'язкового ключа словника це `d.get(key, default)`, необов'язкового атрибута `getattr(obj, name, default)`. Ланцюжок `a?.b?.c` по словниках це послідовні `.get`.

```ts
const label = field.label ?? field.id;
const maxLen = field.max ?? 255;
const placeholder = field.placeholder ?? "Untitled";
const limit = config.validation?.max;
```

```python
field = {"id": "email", "label": None, "max": 0}
config = {"validation": {"max": 100}}

label = field["label"] if field["label"] is not None else field["id"]
max_len = field["max"] if field["max"] is not None else 255
placeholder = field.get("placeholder", "Untitled")
limit = config.get("validation", {}).get("max")
print(label, max_len, placeholder, limit)

print(field["max"] or 255)
```

```text
email 0 Untitled 100
255
```

Розходження в деталях. `??` у JS спрацьовує і на `null`, і на `undefined`, а `dict.get` з дефолтом спрацьовує лише на відсутній ключ: якщо ключ є зі значенням `None`, повернеться `None`. Останній рядок показує, чому `or` не є заміною `??`: він ловить усі хибні значення, і `0` перетворюється на `255` (truthiness, детально в m1-l03).

> **Пастка.** `d.get("label", "Untitled")` не підставляє дефолт для `{"label": None}`. А ланцюжок `.get("validation", {}).get("max")` падає, якщо ключ `validation` є, але дорівнює `None`, бо `.get` повертає наявний `None`, а не ваш `{}`.

```python
field = {"id": "email", "label": None}
print(field.get("label", "Untitled"))

config = {"id": "email", "validation": None}
print(config.get("validation", {}).get("max"))
```

```text
None
Traceback (most recent call last):
  File "example.py", line 5, in <module>
    print(config.get("validation", {}).get("max"))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AttributeError: 'NoneType' object has no attribute 'get'
```

Надійний ланцюжок для JSON, де `null` і відсутність рівноправні, це `(d.get(key) or {})`: тут `or` доречний, бо і `None`, і порожній словник ведуть до одного результату. Для атрибутів об'єктів той самий прийом дає `getattr` з третім аргументом.

```python live
config = {"id": "email", "validation": None}
print((config.get("validation") or {}).get("max"))

class Field:
    label = "Email"

class Page:
    pass

print(getattr(Field(), "label", None))
print(getattr(Page(), "label", None))
```

```text
None
Email
None
```

<!-- task: t3 -->

## Перетворення типів без коерції

Перетворення в Python явні, і роблять їх конструктори типів: `int(x)`, `float(x)`, `str(x)`, `bool(x)`. `int` з рядка приймає ціле з необов'язковими пробілами навколо й підкресленнями між цифрами, а з `float` відкидає дробову частину в бік нуля, на відміну від `//`. Рядок `"42.0"` для `int` не ціле, і це помилка, а не `42`.

```python live
print(int("42"), int(" 42\n"), int("-7"), int("1_000"))
print(int(3.9), int(-3.9))
print(float("1e3"), float("3.14"), float(" -0.5 "))
print(str(42), str(3.0), str(None), str(True))
print(bool([]), bool([0]), bool(""), bool("False"), bool(0.0))
print(int("ff", 16), int("0b101", 0), int("777", 8))
```

```text
42 42 -7 1000
3 -3
1000.0 3.14 -0.5
42 3.0 None True
False True False True False
255 5 511
```

`bool(x)` повертає truthiness значення (жаргон спільноти; документація каже "truth value testing"): порожні колекції, `0` і `""` хибні, решта істинна. Тому `bool("False")` це `True`, як і в JS. Повна таблиця й власні класи в m1-l03.

```python
print(int("42.0"))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(int("42.0"))
          ^^^^^^^^^^^
ValueError: invalid literal for int() with base 10: '42.0'
```

```python
print(int("42px"))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(int("42px"))
          ^^^^^^^^^^^
ValueError: invalid literal for int() with base 10: '42px'
```

Тут розходження з JS найбільше: `parseInt("42px")` дає `42`, `Number("")` дає `0`, `Number("abc")` дає `NaN`. У Python конструктор або повертає точне значення, або кидає `ValueError`. Немає ні часткового розбору, ні тихого NaN. Рядок з дробовим числом у ціле перетворюють у два кроки, `int(float(s))`, і це свідоме рішення "відкинути дробову частину".

```python
print(int(float("42.0")))
print(int(float("42.9")))
```

```text
42
42
```

Неявного приведення між рядками й числами немає зовсім. У JS `+` з рядком перетворює все на рядок, а `*` і `-` на число. У Python рядок із числом не складається.

```ts
"1" + 1;   // "11"
"5" * 2;   // 10
"5" - 2;   // 3
```

```python
print("1" + 1)
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print("1" + 1)
          ~~~~^~~
TypeError: can only concatenate str (not "int") to str
```

Перший рядок падає, а не дає `"11"`. При цьому множення рядка на ціле працює, але означає інше: повторення послідовності (sequence, офіційна назва групи типів `str`, `list`, `tuple`, `range`), як `"5".repeat(2)`. Тому `"5" * 2` це `"55"`, а не `10`, і з `float` замість `int` повторення вже не працює. Віднімання в рядків не визначене взагалі.

```python live
print("1" + str(1), int("1") + 1, f"{1}{1}")
print("1" * 3)
print("5" * 2)
print([0] * 3)
print("-" * 20)
```

```text
11 2 11
111
55
[0, 0, 0]
--------------------
```

```python
print("5" * 2.0)
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print("5" * 2.0)
          ~~~~^~~~~
TypeError: can't multiply sequence by non-int of type 'float'
```

> **Під капотом.** Оператор у Python це виклик dunder-методу лівого операнда: `a + b` спершу пробує `a.__add__(b)`. Метод, який не вміє працювати з таким аргументом, повертає спеціальний об'єкт `NotImplemented`, і тоді інтерпретатор пробує дзеркальний `b.__radd__(a)`. Якщо й він не вміє, це `TypeError`. Кроку "привести обидва до спільного типу", як у JS, у цьому алгоритмі немає. Рядок визначає `__mul__` для `int` як повторення, тому `"1" * 3` працює.

```python
print((1).__add__("1"))
print(1 + "1")
```

```text
NotImplemented
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(1 + "1")
          ~~^~~~~
TypeError: unsupported operand type(s) for +: 'int' and 'str'
```

Єдине неявне приведення в мові числове, і його документація якраз і називає coercion (офіційний термін з глосарію): у виразі з `int` і `float` ціле піднімається до `float`, а `bool` поводиться як `int`. Це той самий механізм `__add__` і `__radd__`: `float` уміє складатися з `int`.

```python
print(1 + 2.0, type(1 + 2.0))
print(True + 0.5)
print(10 / 5, 2 ** -1)
```

```text
3.0 <class 'float'>
1.5
2.0 0.5
```

<!-- task: q3 -->

<!-- task: t4 -->

## `str` без `char` і незмінність скалярів

`str` у Python це незмінна послідовність Unicode code points (офіційне формулювання з документації; code point це номер символу в Unicode). Окремого типу для символу немає, як і в JS: `s[0]` це теж `str` довжини 1. Розходження в тому, що саме рахує `len`. JS-рядок складається з UTF-16 code units, і символ поза базовою площиною, як нотний ключ `𝄞` (U+1D11E) чи більшість емодзі, займає два. Python рахує code points, тож `len("𝄞")` це `1`, а `"𝄞"[0]` це весь символ, а не половина сурогатної пари.

```ts
"form"[0];           // "f"
"𝄞".length;         // 2
"𝄞"[0] === "𝄞";    // false
```

```python
s = "form"
print(s[0], type(s[0]), len(s[0]))
print("𝄞"[0] == "𝄞")

for word in ["form", "їжак", "café", "𝄞"]:
    print(word, len(word), len(word.encode("utf-8")))
```

```text
f <class 'str'> 1
True
form 4 4
їжак 4 8
café 4 5
𝄞 1 4
```

`len` рядка не дорівнює розміру в байтах: кирилиця в UTF-8 займає 2 байти на символ, символи поза базовою площиною 4. Байти це окремий тип `bytes`, який отримують з `str` через `encode` і повертають через `decode`, і він не склеюється зі `str`; методи, зрізи й `bytes` детально в m1-l04.

`int`, `float`, `str`, `bool`, `None` і `tuple` незмінні (immutable, офіційний термін), а `list`, `dict` і `set` змінні (mutable). Незмінний об'єкт не можна поміняти на місці: кожна "зміна" створює новий об'єкт. Спроба записати в рядок за індексом дає `TypeError`, а не мовчазне ігнорування, як у нестрогому JS.

```python
s = "form"
s[0] = "F"
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    s[0] = "F"
    ~^^^
TypeError: 'str' object does not support item assignment
```

Найпомітніше це на `+=`. Для числа `n += 1` обчислює новий об'єкт і перев'язує на нього ім'я `n`. Для списку `items += [3]` змінює той самий список на місці, як `extend`. `id(x)` повертає ідентифікатор об'єкта (identity, офіційний термін: кожен об'єкт має identity, тип і значення), тож рівність `id` до й після показує, чи це той самий об'єкт.

```python live
n = 10
before = id(n)
n += 1
print(n, id(n) == before)

items = [1, 2]
before = id(items)
items += [3]
print(items, id(items) == before)

t = (1, 2)
before = id(t)
t += (3,)
print(t, id(t) == before)
```

```text
11 False
[1, 2, 3] True
(1, 2, 3) False
```

Наслідок видно, коли на об'єкт посилаються два імені. Друге ім'я для числа після `+=` бачить старе значення, бо перше ім'я переїхало на новий об'єкт. Друге ім'я для списку бачить зміну, бо об'єкт один. У JS так само поводяться примітиви й масиви, але `arr += [3]` там узагалі перетворює масив на рядок, тож аналогії з `+=` немає. Ситуацію "два імені на один об'єкт" називають aliasing (термін з офіційного туторіалу Python); вона й копіювання детально в m2-l02.

```python
a = 10
b = a
a += 1
print(a, b)

xs = [1, 2]
ys = xs
xs += [3]
print(xs, ys, xs is ys)
```

```text
11 10
[1, 2, 3] [1, 2, 3] True
```

Незмінність ще й робить об'єкт придатним як ключ словника чи елемент множини: такі об'єкти називають hashable (офіційний термін з глосарію), у них стабільний `hash`. Список ключем бути не може, кортеж може.

```python
print({(1, 2): "point"})
print(hash([1, 2]))
```

```text
{(1, 2): 'point'}
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(hash([1, 2]))
          ^^^^^^^^^^^^
TypeError: unhashable type: 'list'
```

## Анотації типів не перевіряються

Анотації (annotations, офіційний термін; документація також каже type hints) пишуться як у TS: `x: int = 5`, `def f(a: str) -> bool`. Синтаксис знайомий, семантика ні. Інтерпретатор зберігає анотації в атрибуті `__annotations__` і більше нічого з ними не робить: присвоїти рядок змінній з анотацією `int` можна, повернути рядок з функції з `-> bool` теж.

```ts
let maxLength: number = 100;
maxLength = "unlimited";   // tsc: Type 'string' is not assignable to type 'number'
```

```python
max_length: int = 100
max_length = "unlimited"
print(max_length, type(max_length))

def is_required(field_id: str) -> bool:
    return field_id.upper()

print(is_required("email"))
print(is_required.__annotations__)

x: int = "a"
print(x)
```

```text
unlimited <class 'str'>
EMAIL
{'field_id': <class 'str'>, 'return': <class 'bool'>}
a
```

У TS перевірку робить компілятор до запуску, а в рантаймі типів немає взагалі. У Python навпаки: анотації доживають до рантайму як звичайні об'єкти, але інтерпретатор їх не перевіряє ні при присвоєнні, ні при виклику. Перевіркою займаються зовнішні інструменти, mypy або pyright, які читають код так само, як `tsc` (налаштування в m2-l08). А бібліотеки на кшталт Pydantic читають анотації в рантаймі й будують з них валідацію, на цьому стоїть увесь бекенд капстоуну (m2-l09).

> **Пастка.** Анотація без значення не створює змінну. `let x: number;` у TS дає змінну зі значенням `undefined`, а `x: int` у Python лише записує анотацію, і читання `x` дає `NameError`.

```python
x: int
print(__annotations__)
print(x)
```

```text
{'x': <class 'int'>}
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    print(x)
          ^
NameError: name 'x' is not defined
```

Звичка з першого дня: анотувати параметри й результат кожної функції. Навіть без перевірки це документація, яку читає редактор для автодоповнення, і основа, на якій потім увімкнеться mypy. "Значення або `None`" записується через `|`, як union у TS. Повний набір, від `list[str]` до `TypedDict` і generics, в m2-l06.

```python live
def parse_limit(raw: str | None) -> int | None:
    if raw is None:
        return None
    return int(raw)

print(parse_limit("10"), parse_limit(None))
```

```text
10 None
```

<!-- task: q4 -->

## Для капстоуну

Бекенд FormBuilder приймає JSON-конфіги й відповіді форм, і перший шар роботи з ними це типи з цього уроку. `json.loads` перетворює `null` на `None`, `true` на `True`, ціле на `int`, дробове на `float`. Ціле з JSON лишається точним, хоч яке довге.

```python
import json

payload = json.loads('{"max": 10, "step": 0.5, "required": true, "label": null, "id": 12345678901234567890}')
for key, value in payload.items():
    print(key, repr(value), type(value).__name__)

print(json.dumps({"label": None, "required": True, "id": 2 ** 64}))
```

```text
max 10 int
step 0.5 float
required True bool
label None NoneType
id 12345678901234567890 int
{"label": null, "required": true, "id": 18446744073709551616}
```

> **Для капстоуну.** Python віддасть `18446744073709551616` у JSON точно, а `JSON.parse` у браузері прочитає його як `18446744073709552000`. Це питання контракту, а не Python: ідентифікатори й суми, які можуть вийти за `2 ** 53`, у JSON-контракті з фронтендом передають рядками. Гроші всередині бекенду рахують у `Decimal` або в цілих копійках, але не у `float`.

Друга річ, яку тут треба тримати в голові, це різниця між "ключа немає" і "ключ є зі значенням `null`". У частковому оновленні конфігу (PATCH) це різні команди: відсутній ключ означає "не чіпати", `null` означає "очистити". `dict.get` ці випадки зливає, тому перевірка робиться через `in` і `is None` окремо.

```python
patch = {"label": None}
current = {"label": "Email", "placeholder": "you@example.com"}
for key in ("label", "placeholder"):
    if key not in patch:
        print(key, "-> keep", repr(current[key]))
    elif patch[key] is None:
        print(key, "-> clear")
    else:
        print(key, "-> set", repr(patch[key]))
```

```text
label -> clear
placeholder -> keep 'you@example.com'
```

Третя: відповіді форм приходять із браузера рядками, і перетворювати їх треба явно, з урахуванням того, що `bool("false")` це `True`, а `int("42.5")` падає. Функцію, яка збирає все це разом і відкидає некоректні відповіді, ви напишете в m1-l11, коли з'явиться `try`/`except`.

## Типові помилки JS-розробника

1. **`type(x) == int` для перевірки типу.** Звичка з `typeof x === "number"`. Відкидає підкласи, тож ламається на першому ж `class Port(int)` чи `IntEnum`. Правильно: `isinstance(x, int)`, а якщо треба відсіяти саме `bool`, перевірити його окремо або свідомо написати `type(x) is int`.

   ```python
   print(type(True) == int, isinstance(True, int))           # False True
   print(isinstance(True, int) and not isinstance(True, bool))  # False
   ```

2. **`int(a / b)` або `//` як `Math.trunc`.** На від'ємних числах `//` округлює вниз, а `%` бере знак дільника. Правильно: свідомо вибирати `//` (floor) або `math.trunc` (до нуля); для годин і хвилин зі знаком ділити модуль.

   ```python
   print(-7 // 2, -7 % 3)                 # -4 2
   print(divmod(abs(-330), 60))           # (5, 30)
   ```

3. **Очікування `Infinity` і `NaN` замість винятку.** У JS `1 / 0` це `Infinity`, `Number("abc")` це `NaN`. У Python це `ZeroDivisionError` і `ValueError`, і їх треба обробляти, а не перевіряти результат на NaN.

   ```python
   try:
       float("abc")
   except ValueError as e:
       print(e)                           # could not convert string to float: 'abc'
   ```

4. **`round` як `Math.round`.** `round(2.5)` дає `2`, бо округлення до парного. Правильно: для "половина вгору" `Decimal.quantize` з `ROUND_HALF_UP`.

   ```python
   from decimal import Decimal, ROUND_HALF_UP
   print(round(2.5), Decimal("2.5").quantize(Decimal("1"), rounding=ROUND_HALF_UP))  # 2 3
   ```

5. **`x or default` як `x ?? default` і `d.get(k, default)` для `null`.** `or` ловить `0` і `""`, `get` не ловить наявний `None`. Правильно: `x if x is not None else default`, а для JSON-ланцюжків `(d.get(k) or {})`.

   ```python
   field = {"max": 0, "label": None}
   print(field["max"] or 255, field.get("label", "Untitled"))  # 255 None
   print(field["max"] if field["max"] is not None else 255)   # 0
   ```

6. **`parseInt` і `+s` як `int(s)`.** `int("42px")`, `int("")` і `int("42.0")` кидають `ValueError`; `bool("false")` це `True`. Правильно: валідувати вхід і розбирати рядки явними правилами.

   ```python
   raw = "false"
   print(int(float("42.0")), bool(raw), raw == "true")  # 42 True False
   ```

7. **`items = items.append(x)`.** Звичка з `push`, який щось повертає, або з іммутабельних оновлень у React. Методи, що змінюють об'єкт на місці, повертають `None`. Правильно: `items.append(x)` окремим рядком або `items = [*items, x]`, якщо потрібен новий список.

   ```python
   items = ["email"]
   items.append("phone")
   print(items, [*items, "age"])          # ['email', 'phone'] ['email', 'phone', 'age']
   ```

8. **Віра в анотації як у перевірку.** Анотація `-> int` нічого не гарантує під час виконання. Правильно: анотувати завжди, перевіряти mypy (m2-l08), а дані ззовні валідувати в рантаймі (Pydantic, m2-l09).

   ```python
   def double(value: int) -> int:
       return value * 2
   print(double("ab"))                    # abab
   ```

## Підсумок

- Скаляри: `int`, `float`, `str`, `bool`, `None`; `complex` існує, але не знадобиться. Примітивів немає, усе об'єкти, і класи теж.
- Тип перевіряють через `isinstance(x, cls)`; `type(x) is cls` лише тоді, коли підкласи свідомо відкидаються, найчастіше `bool`.
- `int` точний і без меж: `2 ** 100` і `9007199254740993` без втрат, `BigInt` не потрібен. Межа лише в 4300 цифр при перетворенні в рядок і назад.
- `float` це IEEE 754, як `number`: `0.1 + 0.2 != 0.3`, `nan != nan`. Але `1 / 0`, `float("abc")` і `math.sqrt(-1)` кидають виняток, а не дають `Infinity` чи `NaN`.
- `/` завжди `float`; `//` округлює вниз, `%` має знак дільника; `round` округлює половину до парного.
- `bool` підклас `int`: `True == 1`, `sum` рахує істинні, ключі `True` і `1` зливаються.
- `None` один, тип `NoneType`, перевірка `is None`. Відсутність ключа, атрибута чи аргументу це виняток, а не `undefined`.
- `??` це `x if x is not None else y`; `?.` це `.get` і `getattr` з дефолтом, з поправкою на наявний `None`.
- Коерції між рядком і числом немає: `"1" + 1` це `TypeError`, `"5" * 2` це `"55"`. Перетворення явні, і невалідний рядок дає `ValueError`.
- Скаляри й `tuple` незмінні: `+=` на числі створює новий об'єкт, на списку змінює той самий. Анотації інтерпретатор зберігає, але не перевіряє.

## Що далі

Наступний урок m1-l03 про `==` проти `is` і truthiness: там пояснюється, чому `None` перевіряють через `is`, яка повна таблиця хибних значень і чому `x or default` не є `??`. Урок m1-l04 розгортає `str` і `bytes` з цього уроку в методи, зрізи й f-рядки, а незмінність і aliasing повертаються в m2-l02, анотації в m2-l06.
