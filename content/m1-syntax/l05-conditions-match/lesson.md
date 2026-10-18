---
id: m1-l05
module: m1-syntax
title: "Умови і match: switch без fallthrough і з деструктуризацією"
summary: "Учень пише умови в стилі Python: if/elif з truthiness-ідіомами, умовний вираз, walrus і guard clauses, а дані за формою розбирає через match зі структурними патернами, не плутаючи захоплення змінної з порівнянням."
duration_min: 60
prerequisites: [m1-l04]
---

## `if / elif / else`: двокрапка і відступ замість дужок

Умова пишеться без круглих дужок, блок відкривається двокрапкою, а тіло блоку це все, що має більший відступ. Фігурних дужок у мові немає взагалі, тож блок закінчується там, де відступ повертається на попередній рівень. Замість `else if` одне слово `elif`.

```ts
function sizeLabel(count: number): string {
  if (count === 0) {
    return "empty";
  } else if (count < 10) {
    return "small";
  } else {
    return "large";
  }
}
```

```python live
def size_label(count: int) -> str:
    if count == 0:
        return "empty"
    elif count < 10:
        return "small"
    else:
        return "large"

print(size_label(0), size_label(3), size_label(42))
```

```text
empty small large
```

Поведінка та сама, розходиться запис. Дужки навколо умови Python не забороняє: `if (count == 0):` працює, бо дужки тут просто групують вираз, але в Python-коді їх не пишуть, і це читається як акцент з іншої мови. Пастки `if (x) a(); b();`, де `b()` виглядає частиною гілки, не існує: що з відступом, те в блоці. І `===` не потрібен, бо `==` у Python не робить коерції типів (m1-l03).

`elif` існує не для краси. Після `else` граматика вимагає двокрапку й блок, тому `else if` це синтаксична помилка, а не синонім. Чесний `else:` з вкладеним `if` усередині працює, але кожна наступна гілка з'їжджала б на рівень правіше; `elif` тримає весь ланцюжок на одному рівні.

```python
x = -1
if x > 0:
    print("positive")
else if x < 0:
    print("negative")
```

```text
  File "example.py", line 4
    else if x < 0:
         ^^
SyntaxError: expected ':'
```

Блок не може бути порожнім: після двокрапки парсер чекає хоча б одну інструкцію з відступом. Для гілки, де навмисно нічого не відбувається, є `pass`, інструкція, яка нічого не робить. У JS порожній блок `{}` легальний, тому звички ставити заглушку немає.

```python
kind = "block"
if kind == "input":
else:
    print("not an input")
```

```text
  File "example.py", line 3
    else:
    ^^^^
IndentationError: expected an indented block after 'if' statement on line 2
```

```python live
kind = "block"
if kind == "input":
    pass  # inputs are handled elsewhere
else:
    print("not an input")
```

```text
not an input
```

## Умова будь-якого типу: truthiness-ідіоми

Після `if` і `elif` може стояти будь-який вираз, не лише `bool`. Python викликає на ньому `bool()` і бере результат; правила, за якими об'єкт вважається хибним, називаються truthiness (жаргон спільноти, позичений з JS-світу; документація каже "truth value testing"). Що саме хибне і чому, розібрано в m1-l03. Тут ідіоми, які з цього випливають і які ви побачите в кожному Python-файлі.

```python live
items = []
config = {"type": "input", "name": "email", "required": False}
label = None

if not items:
    print("no items")
if config:
    print("config is not empty")
if "required" in config:
    print("has required key:", config["required"])
if config.get("required"):
    print("required is truthy")
if label is not None:
    print("label set")
else:
    print("label missing")
```

```text
no items
config is not empty
has required key: False
label missing
```

Три ідіоми відповідають на три різні питання, і плутати їх не можна. `if items:` питає "чи є там щось": і порожній список, і `None` дають `False`. `if label is not None:` питає "чи значення взагалі передали": `0`, `""` і `False` тут вважаються переданими. `if key in d:` питає "чи є такий ключ", значення неважливе. У прикладі `"required" in config` каже так, а `config.get("required")` каже ні, бо ключ є, але значення `False`. Те саме розходження в JS між `"required" in obj` і `if (obj.required)`.

> **Пастка.** `if x == True:` не те саме, що `if x:`. Оператор `==` порівнює значення з об'єктом `True`, який дорівнює `1`, тому непорожній список, рядок чи число `2` дорівнювати `True` не будуть, хоча всі вони truthy. Гілка мовчки не виконується. PEP 8 прямо забороняє порівнювати з `True` і `False` через `==`, ruff ловить це правилом E712.

```python
items = ["email"]
count = 2
flag = 1
print(bool(items), items == True)
print(bool(count), count == True)
print(flag == True, flag is True)
```

```text
True False
True False
True False
```

Якщо потрібен саме булевий `True`, а не будь-що truthy, це `is True`. Буває рідко, наприклад для прапорця з JSON, який може бути `true`, `false` або відсутнім, і три стани означають різне. У решті випадків просто `if x:`.

## Умовний вираз і walrus `:=`

Тернарний оператор у Python виглядає як `a if cond else b`. Офіційна назва "conditional expression", слово "ternary" це жаргон, але на співбесіді зрозуміють обидва. Порядок частин інший, ніж у JS: спершу значення для істинного випадку, потім умова, потім альтернатива. Обчислюється спершу умова, потім лише одна з гілок.

```ts
const label = field.required ? `${field.name} *` : field.name;
```

```python live
field = {"type": "input", "name": "email", "required": True}
label = f"{field['name']} *" if field["required"] else field["name"]
print(label)
```

```text
email *
```

Лінивість та сама, що в JS: невибрана гілка не обчислюється. Розходиться лише порядок читання, і він зроблений навмисно: Гвідо ван Россум обирав синтаксис у PEP 308 так, щоб вираз читався як англійське речення, а символи `?` і `:` у мові вже були зайняті (`:` відкриває блок). До Python 2.5 умовного виразу не було взагалі, і замість нього писали `cond and a or b`. Цей хак ламається, коли `a` хибне: `and` повертає `a`, `or` бачить falsy і бере `b`.

```python
required = True
print(repr(required and "" or "optional"))
print(repr("" if required else "optional"))
```

```text
'optional'
''
```

Умовні вирази вкладаються праворуч: `a if c1 else b if c2 else d` читається як `a if c1 else (b if c2 else d)`, як ланцюжок `?:` у JS. Два рівні це межа: далі `if/elif` або `match` читаються краще.

```python live
def sign(n: int) -> str:
    return "negative" if n < 0 else "zero" if n == 0 else "positive"

print(sign(-5), sign(0), sign(7))
```

```text
negative zero positive
```

<!-- task: t1 -->

Присвоєння в Python це інструкція, а не вираз, тому звичне з JS `if ((m = re.exec(s)))` не пишеться. `if (x = 5)` дає `SyntaxError`, і парсер одразу підказує дві правильні альтернативи.

```python
x = 0
if (x = 5):
    print(x)
```

```text
  File "example.py", line 2
    if (x = 5):
        ^^^^^
SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='?
```

`:=` з'явився в 3.8. Офіційна назва "assignment expression" (PEP 572), а "walrus operator" це прізвисько через схожість із моржем, яке вживають і в доповідях, і в документації змін 3.8. Він присвоює значення імені й повертає те саме значення, тож присвоєння можна вбудувати в умову. Класичні місця: регулярний вираз, де результат або `None`, або об'єкт, з якого далі треба дістати групу, і цикл читання до порожнього фрагмента. Модуль `re` детально в m6-l04; тут важливо лише, що `fullmatch` повертає `None`, якщо рядок не підходить.

```python live
import re

def parse_px(value: str) -> int | None:
    if (m := re.fullmatch(r"(\d+)px", value)):
        return int(m.group(1))
    return None

print(parse_px("16px"), parse_px("1.5rem"))
```

```text
16 None
```

```python live
import io

stream = io.StringIO("name=email;type=input")
while (chunk := stream.read(8)):
    print(repr(chunk))
print(repr(chunk))
```

```text
'name=ema'
'il;type='
'input'
''
```

Останній рядок показує ще одне: ім'я, створене через `:=`, не обмежене умовою чи циклом. Блокового scope в Python немає, змінна живе у функції або модулі далі (детально в m1-l06 і m1-l08).

> **Пастка.** `:=` має найнижчий пріоритет серед операторів, нижчий за порівняння. `if n := len(items) > 2:` присвоює `n` результат порівняння, тобто `bool`, а не довжину. Коли значення далі порівнюється, дужки обов'язкові.

```python
items = ["a", "b", "c"]
if n := len(items) > 2:
    print("n =", n)
if (n := len(items)) > 2:
    print("n =", n)
```

```text
n = True
n = 3
```

Walrus доречний, коли значення потрібне і в умові, і в тілі, а без нього довелося б обчислити його двічі або винести присвоєння окремим рядком перед `if` чи перед `while True`. Недоречний як заміна звичайного присвоєння: `x := 5` окремою інструкцією це `SyntaxError`, мова навмисно не дає ним зловживати. Два walrus в одній умові або walrus глибоко у виразі з `and` і `or` це сигнал розбити код на рядки.

```python
x := 5
```

```text
  File "example.py", line 1
    x := 5
      ^^
SyntaxError: invalid syntax
```

## Guard clauses, `assert` і помилки замість кодів

Guard clause це перевірка на початку функції, яка одразу виходить через `return` або `raise`, щоб основна логіка йшла без вкладеності. Термін не з документації Python, це загальний жаргон з книжок про рефакторинг; ще кажуть "early return". У JS ви робите те саме, але в Python ціна вкладеності вища: структура коду це буквально відступ, і кожен рівень зсуває логіку на чотири пробіли праворуч без закривальної дужки, по якій око знаходить кінець гілки. У PEP 20 це сформульовано як "Flat is better than nested".

```python live
def check_nested(field: dict, value: str | None) -> str | None:
    if value is not None and value != "":
        if len(value) <= field.get("max_length", 100):
            return None
        else:
            return f"{field['name']}: too long"
    else:
        if field.get("required"):
            return f"{field['name']}: required"
        else:
            return None


def check(field: dict, value: str | None) -> str | None:
    if not value:
        return f"{field['name']}: required" if field.get("required") else None
    if len(value) > field.get("max_length", 100):
        return f"{field['name']}: too long"
    return None


field = {"type": "input", "name": "email", "required": True, "max_length": 5}
for value in [None, "a@b.c", "long@example.com"]:
    print(check_nested(field, value), check(field, value))
```

```text
email: required email: required
None None
email: too long email: too long
```

Друга версія читається зверху вниз як список правил: порожнє значення, задовге значення, усе гаразд. `else` після `return` не потрібен, бо до наступного рядка виконання дійде лише тоді, коли `return` не спрацював; ruff має на це окреме правило RET505. Фінальний `return None` можна опустити, функція без `return` і так повертає `None`, але в функції з типом `str | None` явний `return None` показує, що це навмисний результат, а не забута гілка.

Guard для ситуації, коли функція не може виконати свою роботу, у Python закінчується `raise`, а не поверненням `-1`, `None` чи `{"error": ...}`: винятки тут нормальний механізм керування потоком, і вся мова на них побудована (детально в m1-l11).

```python
def children_of(element: dict) -> list:
    if element.get("type") != "block":
        raise ValueError(f"not a block: {element.get('type')!r}")
    return element["children"]

print(children_of({"type": "block", "children": []}))
print(children_of({"type": "input", "name": "email"}))
```

```text
[]
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    print(children_of({"type": "input", "name": "email"}))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 3, in children_of
    raise ValueError(f"not a block: {element.get('type')!r}")
ValueError: not a block: 'input'
```

`assert cond, message` кидає `AssertionError`, якщо умова хибна. Він призначений для інваріантів, тобто тверджень, які не можуть бути хибними, якщо ваш код правильний: "сюди приходить лише block", "список уже відсортований". Для перевірки вхідних даних він не годиться з конкретної причини: запуск `python -O` вимикає всі `assert` на етапі компіляції, бо вбудована константа `__debug__` стає `False`, і перевірка зникає з коду разом з повідомленням.

```python
def render_block(element: dict) -> str:
    assert element["type"] == "block", f"expected block, got {element['type']!r}"
    return "<div></div>"

print(render_block({"type": "input", "name": "email"}))
```

```text
$ python example.py
Traceback (most recent call last):
  File "example.py", line 5, in <module>
    print(render_block({"type": "input", "name": "email"}))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 2, in render_block
    assert element["type"] == "block", f"expected block, got {element['type']!r}"
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: expected block, got 'input'

$ python -O example.py
<div></div>
```

> **Пастка.** `assert` це інструкція, а не функція. `assert(cond, "message")` з дужками перетворюється на перевірку кортежу з двох елементів, а непорожній кортеж завжди truthy. Такий `assert` ніколи не спрацює; Python попереджає про це ще під час компіляції.

```python
def check(field):
    assert (field is not None, "field must not be None")

check(None)
print("assert did not fire")
```

```text
example.py:2: SyntaxWarning: assertion is always true, perhaps remove parentheses?
  assert (field is not None, "field must not be None")
assert did not fire
```

<!-- task: t2 -->

## `match`: це не `switch`

`match` з'явився в 3.10, офіційна назва "structural pattern matching" (PEP 634, туторіал у PEP 636). Виглядає як `switch`, але працює інакше: значення після `match` (у документації subject) по черзі звіряється з патернами в `case`, виконується тіло першого, що збігся, і на цьому `match` закінчується. Fallthrough немає, `break` не потрібен, кілька значень на одну гілку пишуться через `|`, а гілка за замовчуванням це `case _:` (wildcard pattern, офіційний термін).

```ts
function htmlType(kind: string): string {
  switch (kind) {
    case "email":
    case "tel":
    case "url":
      return kind;
    case "number":
    case "integer":
      return "number";
    default:
      return "text";
  }
}
```

```python live
def html_type(kind: str) -> str:
    match kind:
        case "email" | "tel" | "url":
            return kind
        case "number" | "integer":
            return "number"
        case _:
            return "text"

print(html_type("tel"), html_type("integer"), html_type("date"))
```

```text
tel number text
```

У JS fallthrough це поведінка за замовчуванням, а `break` спосіб її зупинити, тому забутий `break` класичний баг. У Python цієї категорії багів немає: після тіла `case` виконання виходить з `match`. Порожній `case` для "провалитися в наступний" не пишеться, бо порожній блок це `IndentationError`, а `break` усередині `match` належить до циклу навколо нього, і без циклу це `SyntaxError: 'break' outside loop`. Ще одна різниця: JS `switch` порівнює через `===`, а літерал у `case` порівнюється через `==`, крім `None`, `True` і `False`, які порівнюються через `is`.

```python live
def describe(value) -> str:
    match value:
        case True:
            return "bool True"
        case 1:
            return "one"
        case None:
            return "none"
        case _:
            return "other"

print(describe(True), describe(1), describe(1.0), describe(None), describe(0), sep=" | ")
```

```text
bool True | one | one | none | other
```

`1 == True` у Python істинне (m1-l03), тому якби `case True` порівнював через `==`, число `1` потрапило б у гілку булевого значення. Перевірка через `is` розводить їх, а `1.0` при цьому збігається з `case 1`, бо для чисел працює звичайне `==`.

> **Під капотом.** `match` не компілюється в таблицю переходів, як `switch` по цілих числах у C. Це послідовна перевірка патернів зверху вниз, по суті ланцюжок `if/elif` з розпакуванням, тому порядок `case` важливий, а ціна росте з їх кількістю. Слова `match`, `case` і `_` це soft keywords (офіційний термін): ключові слова лише в позиції початку конструкції. Тому старий код зі змінною `match`, наприклад результатом `re.match`, після 3.10 не зламався.

```python
match = {"type": "input"}
match match:
    case {"type": t}:
        print(t)
```

```text
input
```

<!-- task: q2 -->

## Структурні патерни: послідовності, словники, класи

Справжня різниця зі `switch` у тому, що патерн описує форму даних, а імена всередині патерна захоплюють частини значення. Це деструктуризація і перевірка в одному кроці: як `const [first, second] = path`, але лише якщо форма збіглася, інакше перехід до наступного `case`. Патерн послідовності `[a, b]` вимагає точну довжину, `*rest` збирає решту, як rest-елемент у JS.

```python live
def describe_path(path) -> str:
    match path:
        case []:
            return "root"
        case [single]:
            return f"top-level {single}"
        case [first, second]:
            return f"{first} > {second}"
        case [first, *rest]:
            return f"{first} > ... ({len(rest)} more)"
        case _:
            return "not a path"

print(describe_path([]))
print(describe_path(["page1"]))
print(describe_path(["page1", "block2"]))
print(describe_path(["page1", "block2", "row3", "email"]))
print(describe_path(("page1", "block2")))
```

```text
root
top-level page1
page1 > block2
page1 > ... (3 more)
page1 > block2
```

Квадратні дужки в патерні не означають "лише list": `[a, b]` і `(a, b)` однаково збігаються з будь-якою послідовністю, тому кортеж в останньому рядку пройшов той самий шлях, що й список. Механізм: для патерна послідовності Python перевіряє, що subject є послідовністю, звіряє довжину, а потім рекурсивно застосовує вкладені патерни до елементів.

> **Пастка.** Рядок теж послідовність, але патерни послідовностей його навмисно не приймають, як і `bytes`. Інакше `case [x]` ловив би кожен однолітерний рядок, а `case [first, *rest]` розбирав би текст на символи. Якщо в даних може прийти рядок, для нього потрібен окремий `case`.

```python
match "ab":
    case [a, b]:
        print("sequence", a, b)
    case _:
        print("not a sequence pattern")
```

```text
not a sequence pattern
```

<!-- task: t3 -->

Патерн словника `{"key": pattern}` збігається з будь-яким mapping (офіційний термін з glossary: об'єкт з доступом за ключем, найчастіше `dict`), у якому є ці ключі, а значення під ключами самі є патернами: літерал порівнюється, ім'я захоплює. Ключові відмінності від патерна послідовності: зайві ключі ігноруються, а `**rest` збирає ті, що не згадані в патерні. Для конфігу FormBuilder це саме те, що треба: елемент з `"type": "input"` і `name` збігається, хоч би які ще в нього були `placeholder` чи `label`.

```python live
def describe(element: dict) -> str:
    match element:
        case {"type": "input", "name": name, "required": True}:
            return f"required input {name}"
        case {"type": "input", "name": name}:
            return f"input {name}"
        case {"type": "block", "children": []}:
            return "empty block"
        case {"type": "block", "children": [first, *_]}:
            return f"block starting with {first['type']}"
        case {"type": kind, **rest}:
            return f"unknown {kind} with keys {sorted(rest)}"
        case _:
            return "not an element"

print(describe({"type": "input", "name": "email", "required": True}))
print(describe({"type": "input", "name": "phone", "placeholder": "+380"}))
print(describe({"type": "block", "children": []}))
print(describe({"type": "block", "children": [{"type": "input", "name": "age"}]}))
print(describe({"type": "slider", "min": 0, "max": 10}))
print(describe({"name": "orphan"}))
```

```text
required input email
input phone
empty block
block starting with input
unknown slider with keys ['max', 'min']
not an element
```

`json.loads` повертає звичайні `dict` і `list`, тому розпарсений JSON-конфіг можна віддавати в `match` без жодних перетворень. `*_` у патерні послідовності нічого не зберігає: це "решта мене не цікавить". А `"required": True` збігається лише з булевим `True` через `is`, тож `"required": 1` пішов би в наступну гілку.

<!-- task: q3 -->

Патерн класу `Point(x=0)` перевіряє `isinstance(subject, Point)` і далі атрибути за іменами. Конструктор при цьому не викликається: це не створення об'єкта, а опис форми. Позиційна форма `Point(x, 0)` потребує атрибута класу `__match_args__`, який каже, в якому порядку зіставляти позиції з атрибутами; dataclass генерує його сам (dataclasses детально в m2-l05). Імена з подвійними підкресленнями з обох боків спільнота називає dunder, від "double underscore"; це жаргон, документація каже "special method" або "special attribute".

```python live
from dataclasses import dataclass

@dataclass
class Point:
    x: int
    y: int

def where(p: Point) -> str:
    match p:
        case Point(x=0, y=0):
            return "origin"
        case Point(x=0):
            return f"on y axis at {p.y}"
        case Point(x, 0):
            return f"on x axis at {x}"
        case _:
            return "elsewhere"

print(where(Point(0, 0)), where(Point(0, 5)), where(Point(3, 0)), where(Point(1, 1)), sep=" | ")
print(Point.__match_args__)
```

```text
origin | on y axis at 5 | on x axis at 3 | elsewhere
('x', 'y')
```

Для вбудованих типів `str(name)`, `int(n)`, `list(items)` патерн класу з одним позиційним підпатерном означає "перевір тип і захопи значення цілком". Для JSON це головний інструмент: значення з конфігу може виявитися будь-чим, і `case {"name": str(name)}` одночасно звужує тип і дістає значення. Патерн `as` прив'язує ім'я до частини, яка збіглася з альтернативою: `"input" | "textarea" as kind` дає знати, яка саме з них.

```python live
def element_key(element: dict) -> str:
    match element:
        case {"type": "input" | "textarea" as kind, "name": str(name)}:
            return f"{kind}:{name}"
        case {"type": "input" | "textarea", "name": other}:
            return f"bad name type: {type(other).__name__}"
        case _:
            return "no key"

print(element_key({"type": "textarea", "name": "comment"}))
print(element_key({"type": "input", "name": 42}))
print(element_key({"type": "block", "children": []}))
```

```text
textarea:comment
bad name type: int
no key
```

<!-- task: q4 -->

Голе ім'я в патерні, як `name` чи `other` вище, це capture pattern (офіційний термін): воно збігається з будь-яким значенням і прив'язує його. Звідси пастка, на яку наступають усі: `case x:` на верхньому рівні ловить усе, як `case _`, тільки ще й присвоює. Документація називає такий case irrefutable, тобто таким, що не може не збігтися. Якщо після нього є ще гілки, Python відмовляється компілювати код, бо вони недосяжні.

```python
kind = "phone"
match kind:
    case kind_name:
        print("any", kind_name)
    case "email":
        print("email")
```

```text
  File "example.py", line 3
    case kind_name:
         ^^^^^^^^^
SyntaxError: name capture 'kind_name' makes remaining patterns unreachable
```

Останнім рядком `case other:` легальний і корисний: це default, який ще й дає ім'я значенню для повідомлення про помилку.

## Guard у `case`, константи через крапку і пастка голого імені

Guard (офіційний термін) це умова після патерна: `case pattern if cond:`. Вона перевіряється після того, як патерн збігся й захопив імена, тому в умові можна використовувати захоплене. Якщо guard хибний, `match` не завершується, а переходить до наступного `case`. У JS для цього пишуть трюк `switch (true) { case x > 5: ... }`; тут це штатний синтаксис.

```python live
def check_length(element: dict) -> str:
    match element:
        case {"type": "input", "name": name, "max_length": int(limit)} if limit <= 0:
            return f"{name}: max_length must be positive"
        case {"type": "input", "name": name, "max_length": int(limit)} if limit > 1000:
            return f"{name}: max_length is too large"
        case {"type": "input", "name": name}:
            return f"{name}: ok"
        case _:
            return "skip"

print(check_length({"type": "input", "name": "email", "max_length": 0}))
print(check_length({"type": "input", "name": "bio", "max_length": 5000}))
print(check_length({"type": "input", "name": "phone", "max_length": 20}))
print(check_length({"type": "block", "children": []}))
```

```text
email: max_length must be positive
bio: max_length is too large
phone: ok
skip
```

Оскільки голе ім'я завжди захоплення, порівняти з константою через `case INPUT:` неможливо. Це найнеочікуваніше місце `match` для всіх, хто прийшов зі `switch`: у JS `case INPUT:` порівнює з константою, у Python він присвоює. Якщо такий `case` стоїть не останнім, рятує `SyntaxError` з попереднього розділу. Якщо останнім, помилки немає, гілка ловить усе, а на рівні модуля ще й мовчки перезаписує константу.

```python
INPUT = "input"
element_type = "slider"
match element_type:
    case "block":
        print("container")
    case INPUT:
        print("field")
print(INPUT)
```

```text
field
slider
```

Порівняння з константою вмикається крапкою: будь-яке ім'я з крапкою, `Kind.INPUT`, `module.NAME`, `Color.RED`, це value pattern (офіційний термін), і він порівнюється через `==`. На практиці такі константи живуть в Enum, `case Color.RED:` найпоширеніша форма (Enum і StrEnum детально в m4-l06). Нижче звичайний клас як простір імен, механізм той самий.

```python live
class Kind:
    INPUT = "input"
    BLOCK = "block"

def kind_of(element_type: str) -> str:
    match element_type:
        case Kind.INPUT:
            return "field"
        case Kind.BLOCK:
            return "container"
        case other:
            return f"unknown: {other}"

print(kind_of("input"), kind_of("block"), kind_of("slider"), sep=" | ")
```

```text
field | container | unknown: slider
```

> **Під капотом.** Правило "ім'я захоплює" випливає з того, що синтаксис патернів дзеркалить синтаксис присвоєння: у `[a, b] = pair` імена `a` і `b` отримують значення, і в `case [a, b]:` вони роблять те саме. Автори в PEP 622 і PEP 635 розглядали варіанти з явною позначкою захоплення або константи (наприклад, `.RED` з крапкою на початку) і обрали правило "ім'я з крапкою означає значення". Регістр імені ролі не грає: `case INPUT:` у верхньому регістрі все одно захоплення.

<!-- task: q1 -->

<!-- task: t4 -->

## Switch на словнику: ідіома до 3.10

До 3.10 `switch` у Python не було ніякого, і замість ланцюжка `if/elif` на десять гілок писали словник, де ключ це значення, а значення це функція. Функції в Python звичайні об'єкти, їх можна класти в словник і викликати пізніше через `()`. Ідіома жива й зараз, бо вона робить з диспетчеризації дані: словник можна доповнити під час роботи програми, а пошук за ключем це один хеш-лукап незалежно від кількості гілок.

```ts
const handlers: Record<string, (el: Element) => string> = {
  input: renderInput,
  block: renderBlock,
};
const handler = handlers[el.type] ?? renderUnknown;
console.log(handler(el));
```

```python live
def render_input(element: dict) -> str:
    return f'<input name="{element["name"]}">'

def render_block(element: dict) -> str:
    return "<div></div>"

def render_unknown(element: dict) -> str:
    return f"<!-- unknown: {element['type']} -->"

HANDLERS = {"input": render_input, "block": render_block}

for element in [{"type": "input", "name": "email"}, {"type": "slider"}]:
    handler = HANDLERS.get(element["type"], render_unknown)
    print(handler(element))
```

```text
<input name="email">
<!-- unknown: slider -->
```

Це той самий object lookup, що в JS, з однією різницею: `HANDLERS["slider"]` для відсутнього ключа кидає `KeyError`, а не повертає `undefined`. Аналог `?? fallback` це `.get(key, default)`. Тому ідіома завжди пишеться через `.get` з функцією за замовчуванням, а не через квадратні дужки.

> **Пастка.** Класти в словник треба функції, а не результати їхніх викликів. Літерал словника обчислює всі значення одразу, тому `{"input": load_input(), "block": load_block()}[kind]` викликає обидві функції, хоча потрібна одна. Без дужок у словнику лежать самі функції, і викликається лише вибрана.

```python
def load_input():
    print("loading input")
    return "input template"

def load_block():
    print("loading block")
    return "block template"

kind = "input"
template = {"input": load_input(), "block": load_block()}[kind]
print(template)
template = {"input": load_input, "block": load_block}[kind]()
print(template)
```

```text
loading input
loading block
input template
loading input
input template
```

## Для капстоуну

Бекенд FormBuilder весь час робить одну операцію: отримує елемент дерева `{"type": ..., ...}` і вирішує, що з ним робити, залежно від типу. Є три способи записати це рішення, і кожен доречний у своєму місці. `match` найкраще працює там, де гілка залежить від форми даних: які ключі є, якого вони типу, що всередині `children`. Він водночас перевіряє структуру й дістає значення, тому рендер дерева, у якому рекурсія йде по `children`, на ньому найкоротший. Обхід дітей тут звичайний `for`, детально в m1-l06.

```python live
def render(element: dict) -> str:
    match element:
        case {"type": "input", "name": str(name), "required": True}:
            return f'<input name="{name}" required>'
        case {"type": "input", "name": str(name)}:
            return f'<input name="{name}">'
        case {"type": "block", "children": list(children)}:
            html = ""
            for child in children:
                html += render(child)
            return f"<div>{html}</div>"
        case {"type": str(kind)}:
            raise ValueError(f"unknown element type: {kind!r}")
        case _:
            raise ValueError(f"not an element: {element!r}")

form = {
    "type": "block",
    "children": [
        {"type": "input", "name": "email", "required": True},
        {"type": "block", "children": [{"type": "input", "name": "phone"}]},
    ],
}
print(render(form))
```

```text
<div><input name="email" required><div><input name="phone"></div></div>
```

Ланцюжок `if/elif` лишається правильним вибором, коли гілки залежать від незалежних умов, а не від форми одного значення: прапорці, діапазони чисел, дві-три гілки без розпакування. Писати `match` заради `case _ if x > 10:` означає вдягнути `if` у чужий синтаксис. Словник обробників потрібен, коли набір типів відкритий: нові типи елементів реєструються ззовні, з плагіна чи окремого модуля, і диспетчер не повинен змінюватися, коли з'являється слайдер. Усі обробники мають однакову сигнатуру, і перевірки форми всередині них, а не в диспетчері.

```python
def render_slider(element: dict) -> str:
    return f'<input type="range" min="{element["min"]}" max="{element["max"]}">'

HANDLERS = {"input": lambda e: f'<input name="{e["name"]}">'}
HANDLERS["slider"] = render_slider  # registered by a plugin, dispatcher unchanged

element = {"type": "slider", "min": 0, "max": 10}
print(HANDLERS[element["type"]](element))
```

```text
<input type="range" min="0" max="10">
```

> **Для капстоуну.** У модулі 2 конфіг форми опише Pydantic (m2-l09), і диспетчеризація за `type` переїде в discriminated union: модель сама вибере клас за полем `type` ще на етапі валідації. `match` при цьому не зникне, а зміниться формою: замість патернів словників будуть патерни класів `case InputField(name=name, required=True):` по вже валідованих моделях. А реєстр обробників за типом стане основою рендерера, до якого в капстоуні підключатимуться нові типи елементів.

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **`switch` з `break` і порожніми `case` для fallthrough.** Пишуть `case "email":` без тіла, щоб провалитися в наступний, і `break` наприкінці гілки. Перше дає `IndentationError`, друге `SyntaxError` поза циклом. Правильно: кілька значень через `|`, `break` не потрібен.

   ```python
   # case "email":
   # case "tel":          IndentationError: expected an indented block after 'case' statement
   match kind:
       case "email" | "tel":
           print("contact field")
   ```

2. **`cond ? a : b` або `cond and a or b`.** Перше `SyntaxError`, друге тихо повертає `b`, коли `a` хибне. Правильно: `a if cond else b`.

   ```python
   # label = required ? "*" : ""      SyntaxError: invalid syntax
   label = "*" if required else ""
   ```

3. **`else if` замість `elif`.** Звичка з будь-якої C-подібної мови. Правильно: `elif`, весь ланцюжок на одному рівні.

   ```python
   # else if count < 10:      SyntaxError: expected ':'
   if count == 0:
       size = "empty"
   elif count < 10:
       size = "small"
   ```

4. **`if (m = pattern.exec(s))` з присвоєнням в умові.** У Python присвоєння не вираз, `=` в умові дає `SyntaxError` з підказкою. Правильно: `:=` у дужках, особливо якщо далі порівняння.

   ```python
   # if (m = re.fullmatch(r"(\d+)px", value)):    SyntaxError: ... Maybe you meant '==' or ':='
   if (m := re.fullmatch(r"(\d+)px", value)):
       size = int(m.group(1))
   ```

5. **`== True` і `===` за звичкою.** `if items == True:` не спрацює для непорожнього списку, а `===` у Python не існує. Правильно: `if items:`, для `None` окремо `is not None`, для строго булевого `is True`.

   ```python
   if items:                # not: if items == True
       ...
   if label is not None:    # not: if label !== null && label !== undefined
       ...
   ```

6. **`case NAME:` як порівняння з константою.** `case "email":` з літералом справді порівнює через `==`, тому здається, що `case EMAIL:` з константою працює так само. Ні: голе ім'я в патерні це захоплення, воно ловить усе й перезаписує змінну. Правильно: літерал, ім'я з крапкою (`Kind.INPUT`, член Enum) або guard `case x if x == NAME:`.

   ```python
   match element_type:
       case Kind.INPUT:     # value pattern, compared with ==
           ...
       case other:          # capture, catches everything, must be last
           ...
   ```

7. **Очікування, що патерн словника перевіряє точну форму.** Як `.strict()` у Zod. Насправді зайві ключі ігноруються, і `{"type": "input"}` збігається з будь-яким input. Правильно: якщо зайві ключі мають бути помилкою, зібрати їх через `**rest` і перевірити guard-ом.

   ```python
   match element:
       case {"type": "input", "name": str(name), **rest} if not rest:
           print("strict input", name)
       case {"type": "input", **rest}:
           print("extra keys:", sorted(rest))
   ```

8. **`assert` для валідації вводу.** Звичка з `console.assert` чи тестів. Під `python -O` усі `assert` зникають, і перевірка разом з ними. Правильно: `if ...: raise ValueError(...)` для даних ззовні, `assert` лише для інваріантів власного коду.

   ```python
   if not isinstance(config.get("children"), list):
       raise ValueError("children must be a list")
   ```

## Підсумок

- `if / elif / else` без дужок навколо умови й без фігурних дужок; блок це відступ, порожній блок заповнюють `pass`.
- Умова може бути будь-якого типу; `if items:`, `if x is not None:` і `if key in d:` відповідають на три різні питання. `== True` не писати.
- Умовний вираз `a if cond else b`: значення, умова, альтернатива; більше двох рівнів вкладення не читається.
- Присвоєння не вираз; `:=` присвоює й повертає, має найнижчий пріоритет, тому з порівнянням береться в дужки.
- Guard clauses з `return` або `raise` на початку функції замість вкладеності; функція, яка не може виконати роботу, кидає виняток, а не повертає код помилки.
- `assert` для інваріантів, не для вводу: `python -O` його вимикає.
- `match` перевіряє `case` зверху вниз до першого збігу; fallthrough і `break` немає, альтернативи через `|`, default `case _:`.
- Патерни послідовностей вимагають точну довжину й не приймають рядки; патерни словників ігнорують зайві ключі; `str(x)`, `int(x)` перевіряють тип і захоплюють.
- Голе ім'я в `case` це захоплення, а не порівняння; константи через крапку (`Kind.INPUT`, Enum), умови через guard `if`.
- Словник функцій `.get(key, default)(...)` це диспетчер для відкритого набору типів; `match` для розбору за формою; `if/elif` для незалежних умов.

## Що далі

Наступний урок m1-l06 про цикли: `for` по значеннях, `enumerate`, `zip`, `while` і `else` після циклу. Звідти знадобляться walrus у `while (chunk := ...)`, guard clauses з `continue` замість `return` і рекурсивний обхід `children`, який тут був одним `for`. Винятки, якими тут закінчувалися guard-и, розібрані в m1-l11, а `case Color.RED` повернеться разом з Enum у m4-l06.
