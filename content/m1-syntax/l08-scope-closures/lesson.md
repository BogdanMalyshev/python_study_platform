---
id: m1-l08
module: m1-syntax
title: "Scope LEGB, global і nonlocal, замикання"
summary: "Учень пояснює, де Python шукає ім'я і чому присвоєння робить його локальним на всю функцію, правильно змінює зовнішні змінні через nonlocal або без глобального стану, читає замикання через __closure__ і не потрапляє в пастки пізнього зв'язування й затінення builtins."
duration_min: 70
prerequisites: [m1-l07]
---

## LEGB: чотири рівні пошуку імені

Коли Python зустрічає ім'я у виразі, він шукає його в чотирьох просторах імен у фіксованому порядку: Local (тіло поточної функції), Enclosing (тіла зовнішніх функцій, від найближчої назовні), Global (модуль), Builtin (модуль `builtins`, де живуть `print`, `len`, `list`). Перше знайдене виграє, далі пошук не йде. Якщо не знайдено ніде, `NameError`. Абревіатура LEGB це мнемоніка спільноти з книги Лутца "Learning Python", у документації її немає. Документація говорить про scope (офіційний термін: ділянка коду, де ім'я видно без префікса) і namespace (теж офіційний: відображення "ім'я → об'єкт", фактично словник). На співбесіді доречні всі три слова.

```python
x = "global"

def outer():
    x = "enclosing"

    def inner():
        x = "local"
        print("inner:", x)

    inner()
    print("outer:", x)

outer()
print("module:", x)
print("builtin:", len)
```

```text
inner: local
outer: enclosing
module: global
builtin: <built-in function len>
```

Чотири різні `x` тут не конфліктують: кожне присвоєння створило ім'я у своєму просторі, а кожне читання знайшло найближче. Якщо прибрати присвоєння на нижньому рівні, пошук провалюється на рівень вище, аж до builtins.

```python live
x = "global"

def outer():
    x = "enclosing"

    def inner():
        return x          # L немає, знайдено в E

    return inner()

def no_enclosing():
    return x              # L і E немає, знайдено в G

def only_builtin():
    return len("abc")     # L, E, G немає, знайдено в B

print(outer())
print(no_enclosing())
print(only_builtin())
```

```text
enclosing
global
3
```

Порядок пошуку той самий, що в ланцюжку scope у JS, і так само лексичний: що бачить функція, визначає місце, де її написано, а не місце, звідки її викликали.

```ts
const theme = "light";

function currentTheme() {
  return theme;
}

function renderDark() {
  const theme = "dark";
  return currentTheme();
}

console.log(renderDark()); // "light"
```

```python
theme = "light"

def current_theme():
    return theme

def render_dark():
    theme = "dark"
    return current_theme()

print(render_dark())
```

```text
light
```

Розходиться все інше. Рівнів лише чотири типи, і блоки серед них не рахуються. Global у Python означає модуль, а не процес: кожен модуль має власний словник глобальних імен, спільного `globalThis`, куди пишуть усі файли, немає. Builtins лежать окремим рівнем під усіма модулями одразу, як вбудовані властивості `globalThis`. І головне: локальне ім'я чи ні, вирішує не ключове слово `let`, а сам факт присвоєння в тілі функції. З цього виростають усі пастки уроку.

> **Під капотом.** Функція тримає посилання на словник глобальних імен свого модуля в атрибуті `__globals__`. Атрибути й методи з подвійними підкресленнями з обох боків спільнота називає dunder (жаргон від double underscore); документація каже special attributes і special methods. Через `__globals__` функція з модуля `json` шукає глобальні імена в `json`, хоч би звідки її викликали.

```python
import json

def helper():
    pass

print(helper.__globals__["__name__"])
print(json.dumps.__globals__["__name__"])
print(helper.__globals__ is globals())
```

```text
__main__
json
True
```

## Блоки не створюють scope

`if`, `for`, `while`, `try` і `with` не створюють scope. Ім'я, присвоєне всередині блоку, належить функції або модулю, де стоїть блок, і доступне після нього. Відступ у Python це лише синтаксис групування, а не межа видимості.

```ts
if (true) {
  const status = "ok";
}
console.log(status); // ReferenceError: status is not defined
```

```python
if True:
    status = "ok"
print(status)
```

```text
ok
```

У JS блоковий scope з'явився разом з `let` і `const`: є декларація, і її можна прив'язати до найближчих фігурних дужок. У Python декларацій немає взагалі, тож прив'язувати нічого. Найближча модель з JS це `var`: ім'я живе на рівні функції, незалежно від того, в якому блоці його присвоїли. Тільки без hoisting зі значенням `undefined`: до першого присвоєння імені просто немає значення. Змінна циклу після `for` теж лишається з останнім значенням, це розібрано в m1-l06.

```python
import io

def parse(raw: str) -> None:
    try:
        value = int(raw)
    except ValueError:
        value = None

    with io.StringIO(raw) as buf:
        first_char = buf.read(1)

    n = 0
    while n < 2:
        n += 1
        last = n

    print(value, first_char, buf.closed, last)

parse("42")
```

```text
42 4 True 2
```

> **Пастка.** Ім'я з гілки, яка не виконалась, не існує. JS-розробник очікує або блоковий scope (тоді помилка видна одразу), або `undefined` від `var`. Python не дає ні того, ні іншого: код працює на одних даних і падає на інших. Усередині функції це `UnboundLocalError`, на рівні модуля `NameError`. Чому саме такий виняток, у наступному розділі.

```python
def label(required: bool) -> str:
    if required:
        suffix = " *"
    return "Email" + suffix

print(label(True))
print(label(False))
```

```text
Email *
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    print(label(False))
          ^^^^^^^^^^^^
  File "example.py", line 4, in label
    return "Email" + suffix
                     ^^^^^^
UnboundLocalError: cannot access local variable 'suffix' where it is not associated with a value
```

> **Пастка.** Один виняток з правила "блок не чіпає імена": `except ... as e`. Наприкінці блоку `except` Python неявно виконує `del e`, бо виняток тримає traceback, traceback тримає frame функції, а frame тримає `e`, і без `del` вийшов би цикл посилань. Якщо помилка потрібна після блоку, присвойте її іншому імені.

```python
try:
    int("x")
except ValueError as e:
    error = e

print(error)
print(e)
```

```text
invalid literal for int() with base 10: 'x'
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    print(e)
          ^
NameError: name 'e' is not defined
```

Scope створюють рівно чотири конструкції: модуль, функція (`def` і `lambda`), тіло класу і comprehension разом з generator expression. Comprehension, тобто вираз на кшталт `[x * 2 for x in xs]`, це офіційна назва з документації (list comprehension, dict comprehension), детально в m1-l10; generator expression `(x for x in xs)` теж офіційний термін. У Python 3 змінна comprehension не витікає назовні і не затирає однойменну зовнішню; у Python 2 витікала, і це вважалось дефектом мови.

```python live
x = "outer"
doubled = [x * 2 for x in range(3)]
print(doubled, x)

total = sum(n for n in range(4))
print(total, "n" in globals())
```

```text
[0, 2, 4] outer
6 False
```

> **Під капотом.** З Python 3.12 list, dict і set comprehension компілюються inline у функцію, де стоять (PEP 709): окремого frame більше немає, і це швидше. Ізоляція змінної циклу при цьому лишилась гарантією мови, компілятор зберігає і відновлює зовнішнє значення. Generator expression не інлайниться, бо він лінивий і має жити окремо від поточного frame; це досі окрема вкладена функція.

Тіло класу теж scope, але методи не бачать його як enclosing: ім'я з тіла класу всередині методу доступне лише через `self` або ім'я класу, точно як поле класу в JS доступне лише через `this`.

```python
class Field:
    kind = "text"

    def describe(self):
        return kind

Field().describe()
```

```text
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    Field().describe()
  File "example.py", line 5, in describe
    return kind
           ^^^^
NameError: name 'kind' is not defined. Did you mean: 'self.kind'?
```

## Присвоєння робить ім'я локальним на всю функцію

Правило, з якого виростає більшість помилок цього уроку: якщо ім'я хоч раз зв'язується будь-де в тілі функції, воно локальне для всієї функції, від першого рядка. Не з рядка присвоєння, а з початку. Зв'язування імені (name binding, офіційний термін з розділу "Naming and binding" документації) це не лише `=`: так само працюють `+=` та інші розширені присвоєння, ціль `for`, `with ... as`, `except ... as`, `import`, `def`, `class`, walrus `:=` і навіть `del`. Читання такого імені до присвоєння дає `UnboundLocalError`, підклас `NameError`.

```python
count = 0

def bump():
    print(count)
    count = 1

bump()
```

```text
Traceback (most recent call last):
  File "example.py", line 7, in <module>
    bump()
  File "example.py", line 4, in bump
    print(count)
          ^^^^^
UnboundLocalError: cannot access local variable 'count' where it is not associated with a value
```

Інтуїція "до рядка `count = 1` ще працює глобальна `count`" не справджується, бо рішення ухвалює не виконання, а компіляція. Найпереконливіше це видно на присвоєнні, яке не виконається ніколи: функція все одно падає.

```python
count = 0

def read_only():
    print(count)
    if False:
        count = 1

read_only()
```

```text
Traceback (most recent call last):
  File "example.py", line 8, in <module>
    read_only()
  File "example.py", line 4, in read_only
    print(count)
          ^^^^^
UnboundLocalError: cannot access local variable 'count' where it is not associated with a value
```

> **Під капотом.** Коли Python компілює `def`, він проходить усе тіло і складає список локальних імен у `__code__.co_varnames`. Локальні змінні живуть не в словнику, а в масиві слотів frame, і байткод звертається до них за індексом інструкціями `LOAD_FAST` / `STORE_FAST`. Ім'я, якого немає серед локальних, читається через `LOAD_GLOBAL`, який іде в словник модуля, а потім у builtins. Вибір інструкції фіксується назавжди в момент компіляції, тому один рядок присвоєння перемикає всі читання імені у функції.

```python
import dis

count = 0

def reads():
    return count

def reads_then_assigns():
    print(count)
    count = 1

print(reads.__code__.co_varnames, reads.__code__.co_names)
print(reads_then_assigns.__code__.co_varnames)
for fn in (reads, reads_then_assigns):
    print([(i.opname, i.argval) for i in dis.get_instructions(fn) if i.argval == "count"])
```

```text
() ('count',)
('count',)
[('LOAD_GLOBAL', 'count')]
[('LOAD_FAST_CHECK', 'count'), ('STORE_FAST', 'count')]
```

Що всі форми зв'язування роблять ім'я локальним, видно навіть без виклику функції: компілятор уже все вирішив, щойно виконався `def`.

```python
def binders(param):
    total = 0
    count += 1
    for item in []:
        pass
    with open("config.json") as fh:
        pass
    try:
        pass
    except ValueError as err:
        pass
    import json
    def helper():
        pass
    if (n := 1):
        pass
    del total

print(binders.__code__.co_varnames)
```

```text
('param', 'total', 'count', 'item', 'fh', 'err', 'json', 'helper', 'n')
```

Найближчий родич у JS це temporal dead zone (TDZ), а не `var`.

```ts
let count = 0;

function bump() {
  console.log(count); // ReferenceError: Cannot access 'count' before initialization
  let count = 1;
}
```

```python
count = 0

def bump():
    print(count)  # UnboundLocalError
    count = 1
```

Механізм той самий: локальне ім'я існує для всього тіла з самого початку, але не має значення до першого зв'язування, і зовнішнє однойменне вже затінене. Різниця в тому, що в JS ви пишете `let` і бачите декларацію, а в Python декларацією працює будь-яке присвоєння, де б воно не стояло. `count = 1` на десятому рядку функції фактично означає `let count` на першому. Варіанта з `var`, де читання до присвоєння мовчки дає `undefined`, у Python немає: або значення, або виняток.

<!-- task: q1 -->

<!-- task: t1 -->

## `global`: читати можна, присвоювати ні

Читати глобальне ім'я з функції можна без жодних декларацій, це рівень G у LEGB. Присвоїти не можна: присвоєння створить локальне ім'я. Інструкція `global name` у тілі функції каже компілятору, що в цій функції `name` означає ім'я модуля, і тоді і читання, і запис ідуть у словник модуля. Через `global` можна навіть створити нове ім'я модуля зсередини функції.

```python
calls = 0

def track() -> None:
    global calls
    calls += 1

track()
track()
print(calls)

def init() -> None:
    global settings
    settings = {"theme": "dark"}

init()
print(settings)
```

```text
2
{'theme': 'dark'}
```

`global` майже завжди запах коду, і причини конкретні. Сигнатура функції бреше: `track()` нічого не приймає і нічого не повертає, а насправді читає й змінює стан. Тести стають залежними від порядку, бо стан модуля переживає тест і перетікає в наступний. У сервері один процес обслуговує багато запитів, тож глобальна змінна спільна для всіх користувачів одночасно. І `init()` вище показує ще одну проблему: ім'я `settings` з'являється в модулі лише після виклику, читач модуля його не знайде.

Обходяться без `global` трьома способами, у порядку переваги. Повернути значення і передати його параметром: стан видно в сигнатурі. Клас, коли стан живе довго і до нього прив'язано кілька операцій (класи детально в модулі 4). Явний модульний стан, коли він справді потрібен: контейнер, який мутують, але ніколи не переприсвоюють, тож `global` не знадобиться (чому, у наступному розділі).

```python
def track(calls: int) -> int:
    return calls + 1

calls = 0
calls = track(calls)
calls = track(calls)
print(calls)

class Tracker:
    def __init__(self) -> None:
        self.calls = 0

    def track(self) -> None:
        self.calls += 1

tracker = Tracker()
tracker.track()
tracker.track()
print(tracker.calls)

_stats = {"calls": 0}

def track_stats() -> None:
    _stats["calls"] += 1

track_stats()
print(_stats)
```

```text
2
2
{'calls': 1}
```

> **JS-аналог.** У JS функція в модулі робить `count++` з модульною `let count` без жодного ключового слова, і знайти всіх, хто пише в змінну, можна лише пошуком по імені. Python змушує писати `global`, і це корисна незручність: `grep global` знаходить кожну функцію, яка змінює стан модуля.

> **Пастка.** `global` діє на всю функцію і має стояти до першого використання імені. Якщо ім'я вже прочитано вище, компіляція падає ще до запуску.

```python
calls = 0

def track() -> None:
    print(calls)
    global calls
    calls += 1
```

```text
  File "example.py", line 5
    global calls
    ^^^^^^^^^^^^
SyntaxError: name 'calls' is used prior to global declaration
```

## `nonlocal` і різниця між мутацією та переприсвоєнням

Лічильник через замикання це перша функція, яку JS-розробник пише, щоб перевірити замикання. У Python вона падає.

```ts
function makeCounter() {
  let count = 0;
  return () => {
    count += 1;
    return count;
  };
}

const counter = makeCounter();
console.log(counter()); // 1
```

```python
def make_counter():
    count = 0

    def increment():
        count += 1
        return count

    return increment

counter = make_counter()
counter()
```

```text
Traceback (most recent call last):
  File "example.py", line 11, in <module>
    counter()
  File "example.py", line 5, in increment
    count += 1
    ^^^^^
UnboundLocalError: cannot access local variable 'count' where it is not associated with a value
```

У JS декларації явні: в стрілковій функції немає `let count`, тому `count += 1` іде ланцюжком scope вгору і знаходить змінну `makeCounter`. У Python `count += 1` сам є декларацією: компілятор бачить зв'язування і робить `count` локальною в `increment`, а потім `+=` пробує прочитати локальну, яка ще не має значення. Це той самий механізм з попереднього розділу, тільки з рівнем E замість G.

Інструкція `nonlocal count` каже компілятору: це ім'я з найближчої зовнішньої функції, де воно зв'язане. Тепер `+=` читає і пише змінну `make_counter`, і кожен виклик `make_counter` створює окремий лічильник.

```python live
def make_counter():
    count = 0

    def increment():
        nonlocal count
        count += 1
        return count

    return increment

a = make_counter()
b = make_counter()
print(a(), a(), a())
print(b())
```

```text
1 2 3
1
```

`nonlocal` шукає ім'я лише у функціях, що охоплюють поточну, і ніколи в модулі: для модуля є `global`. Якщо зовнішньої функції з таким ім'ям немає, це помилка компіляції, а не виконання. У прикладі нижче `print("start")` не встигає виконатись, бо файл не компілюється.

```python
print("start")
count = 0

def increment():
    nonlocal count
    count += 1
```

```text
  File "example.py", line 5
    nonlocal count
    ^^^^^^^^^^^^^^
SyntaxError: no binding for nonlocal 'count' found
```

Тепер межа, яку важливо відчувати: `nonlocal` і `global` потрібні лише для переприсвоєння імені. Виклик методу `items.append(x)`, запис за ключем `data[key] = v`, запис атрибута `obj.attr = v` і запис у зріз `items[i:j] = ...` не зв'язують ім'я `items`. Вони знаходять об'єкт через звичайний пошук LEGB і змінюють його, тож жодних декларацій не треба. Різниця між "змінити об'єкт" і "прив'язати ім'я до іншого об'єкта" детально в m2-l02.

```python
def make_collector():
    items = []
    meta = {"calls": 0}

    def add(x):
        items.append(x)
        meta["calls"] += 1
        items[len(items):] = [x * 10]

    return add, items, meta

add, items, meta = make_collector()
add(1)
add(2)
print(items, meta)
```

```text
[1, 10, 2, 20] {'calls': 2}
```

> **Пастка.** `items += [x]` на списку змінює список на місці, як `extend`, але синтаксично це розширене присвоєння імені `items`. Компілятор робить `items` локальною, і рядок падає, хоча `items.extend([x])` поруч працює.

```python
def make_collector():
    items = []

    def add(x):
        items += [x]

    return add

make_collector()(1)
```

```text
Traceback (most recent call last):
  File "example.py", line 9, in <module>
    make_collector()(1)
  File "example.py", line 5, in add
    items += [x]
    ^^^^^
UnboundLocalError: cannot access local variable 'items' where it is not associated with a value
```

З цієї межі виріс старий прийом: загорнути число в список чи словник і мутувати його замість переприсвоєння. До Python 3.0 `nonlocal` не було, і це був єдиний спосіб; у старому коді й відповідях на Stack Overflow він досі трапляється.

```python
def make_counter():
    box = [0]

    def increment():
        box[0] += 1
        return box[0]

    return increment

counter = make_counter()
print(counter(), counter())
```

```text
1 2
```

Працює, але гірше за `nonlocal` з трьох причин. Намір захований: читач бачить список і мусить зрозуміти, що це не колекція, а коробка для одного числа. Тип бреше: для type checker це `list[int]`, будь-яку довжину можна покласти. І `nonlocal count` прямо на першому рядку функції каже "ця функція переприсвоює зовнішню змінну", а `box[0] += 1` губиться в тілі. Мутація зовнішнього контейнера доречна тоді, коли стан справді колекція: кеш, реєстр, список помилок.

<!-- task: q2 -->

<!-- task: t2 -->

## Замикання: cell, `__closure__` і пізнє зв'язування

Замикання (closure; слово використовують і документація, і спільнота, атрибут так і називається `__closure__`) це функція разом із посиланнями на змінні зовнішніх функцій, які вона використовує. Такі змінні документація називає free variables: ім'я використано в блоці коду, але зв'язане не в ньому. Python зберігає не значення, а саму змінну, загорнуту в об'єкт cell (офіційна назва з CPython, тип `types.CellType`). Зовнішня функція тримає свої захоплені змінні в cell замість звичайного слота (список у `co_cellvars`), внутрішня отримує ті самі cell у `__closure__`, а значення лежить у `cell_contents`.

```python live
def make_multiplier(n: int):
    def multiply(x: int) -> int:
        return x * n
    return multiply

double = make_multiplier(2)
triple = make_multiplier(3)
print(double(5), triple(5))

print(make_multiplier.__code__.co_cellvars)
print(double.__code__.co_freevars)
print(type(double.__closure__[0]))
print(double.__closure__[0].cell_contents, triple.__closure__[0].cell_contents)
```

```text
10 15
('n',)
('n',)
<class 'cell'>
2 3
```

Фабрика функцій `make_multiplier` працює, бо кожен виклик створює новий frame і новий cell для `n`. Функцію `multiply` компілятор зібрав один раз, а `double` і `triple` це два об'єкти з тим самим кодом, але різними `__closure__`. Frame `make_multiplier` давно завершився, але cell живе, поки на нього посилається хоч одна функція.

> **JS-аналог.** Механізм той самий, що у V8: захоплені змінні живуть в об'єкті Context, а DevTools показує їх у `[[Scopes]]` як `Closure`. Різниця в доступі: у JS `[[Scopes]]` не прочитати з коду, у Python `__closure__` і `cell_contents` доступні звичайному коду, тож механізм можна перевірити руками.

Cell один на змінну, а не на функцію. Якщо дві внутрішні функції замикають ту саму змінну, вони ділять один cell, і переприсвоєння через `nonlocal` в одній видно в іншій.

```python
def make_field():
    value = ""

    def get() -> str:
        return value

    def set_(new: str) -> None:
        nonlocal value
        value = new

    return get, set_

get, set_ = make_field()
set_("a@b.c")
print(get())
print(get.__closure__[0] is set_.__closure__[0])
```

```text
a@b.c
True
```

Звідси пізнє зв'язування (late binding; термін спільноти, з "The Hitchhiker's Guide to Python", документація окремої назви не дає): замикання читає змінну в момент виклику, а не в момент створення. Яке значення лежить у cell, коли функцію викликали, таке вона й побачить.

```python
def make_greeting():
    name = "draft"

    def greet() -> str:
        return f"hello, {name}"

    name = "final"
    return greet

print(make_greeting()())
```

```text
hello, final
```

Цикл робить те саме, тільки помітніше: усі функції, створені в циклі, замикають одну змінну, отже один cell, і після циклу в ньому останнє значення. Повний розбір пастки з `[lambda: i for i in range(3)]` у m1-l06; тут лише доказ через `__closure__`, що cell справді один.

```python
def make_handlers():
    handlers = []
    for i in range(3):
        handlers.append(lambda: i)
    return handlers

handlers = make_handlers()
print([h() for h in handlers])
print(handlers[0].__closure__[0] is handlers[2].__closure__[0])
print(handlers[0].__closure__[0].cell_contents)
```

```text
[2, 2, 2]
True
2
```

Виправлення зводяться до того, щоб скопіювати значення в момент створення в місце, яке не змінюється. Параметр за замовчуванням `i=i` обчислюється при створенні функції і лягає в `__defaults__` (момент обчислення default розібраний у m1-l07). `functools.partial` кладе аргумент у власний атрибут `args` (детально в m1-l09). Фабрика `make_handler(i)` дає кожній функції новий frame і новий cell.

```python
from functools import partial

def show(i: int) -> int:
    return i

by_default = [lambda i=i: i for i in range(3)]
by_partial = [partial(show, i) for i in range(3)]

print([f() for f in by_default], by_default[0].__defaults__, by_default[0].__closure__)
print([f() for f in by_partial], by_partial[0].args)
```

```text
[0, 1, 2] (0,) None
[0, 1, 2] (0,)
```

> **Пастка.** `lambda i=i: i` робить `i` справжнім параметром, і він стає частиною сигнатури: виклик з аргументом мовчки підмінить зафіксоване значення. Для внутрішніх колбеків це прийнятно, для функцій, які віддаються назовні, краще `partial` з іменованим аргументом або фабрика: там зайвий аргумент дає `TypeError`.

```python
from functools import partial

def show(*, i: int) -> int:
    return i

leaky = lambda i=0: i
fixed = partial(show, i=0)

print(leaky(), leaky(99))
print(fixed())
fixed(99)
```

```text
0 99
0
Traceback (most recent call last):
  File "example.py", line 11, in <module>
    fixed(99)
TypeError: show() takes 0 positional arguments but 1 positional argument (and 1 keyword-only argument) were given
```

<!-- task: q3 -->

<!-- task: t3 -->

<!-- task: t4 -->

## Builtins: затінення та інтроспекція

Останній рівень LEGB це звичайний модуль `builtins`. `print`, `len`, `list`, `id`, `type` не ключові слова, а імена в ньому, і будь-яке присвоєння на вищому рівні їх затінює (shadowing; термін спільноти й лінтерів, документація окремої назви не дає). Пошук знаходить ваше ім'я раніше за вбудоване, і вбудоване стає недосяжним у цьому scope. Оригінал завжди лежить у `builtins.list`, а `del list` на рівні модуля прибирає затінення, бо пошук знову доходить до B.

```python
list = ["email", "phone"]
names = list("ab")
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    names = list("ab")
            ^^^^^^^^^^
TypeError: 'list' object is not callable
```

```python live
import builtins

list = ["email", "phone"]
print(list)
print(builtins.list("ab"))

del list
print(list("ab"))
```

```text
['email', 'phone']
['a', 'b']
['a', 'b']
```

Найчастіше затінюють імена, які природно звучать як назви даних: `id`, `type`, `input`, `str`, `list`, `dict`, `max`, `min`, `sum`, `filter`, `format`, `hash`, `next`. Для FormBuilder найнебезпечніші `id` і `type`, бо саме так називаються поля в JSON-конфігу. Затінення в параметрі функції діє лише всередині цієї функції: поки там не потрібен вбудований `type()`, проблеми немає, але перший такий виклик впаде. Помітити заздалегідь допомагає лінтер: правила `A001`/`A002` у ruff (набір flake8-builtins) ловлять затінення змінною і параметром, але за замовчуванням вимкнені, їх вмикають через `select = ["A"]`. Перевірити простір імен можна й руками.

```python
import builtins

def render(id: str, type: str) -> str:
    return f"{type}#{id}"

print(render("email", "input"))

max = 10
input = "email"
print(sorted(name for name in globals() if not name.startswith("__") and hasattr(builtins, name)))
```

```text
input#email
['input', 'max']
```

<!-- task: q4 -->

Для інтроспекції (introspection, загальний термін, документація його використовує) просторів імен є чотири функції. `globals()` повертає живий словник модуля: запис у нього створює глобальне ім'я. `locals()` повертає словник локальних імен; на рівні модуля це той самий `globals()`, а всередині функції знімок. `vars(obj)` повертає `__dict__` об'єкта, `vars()` без аргументу дорівнює `locals()`. `dir()` повертає відсортований список імен у поточному scope або атрибутів об'єкта. У робочому коді вони майже не потрібні, це інструменти для REPL і відлагодження.

```python
globals()["created"] = "via globals()"
print(created)

def snapshot():
    a = 1
    snap = locals()
    snap["a"] = 100
    b = 2
    print(a, snap)

snapshot()

class Field:
    def __init__(self) -> None:
        self.id = "email"
        self.required = True

print(vars(Field()))

def names():
    a = 1
    return dir()

print(names())
```

```text
via globals()
1 {'a': 100}
{'id': 'email', 'required': True}
['a']
```

Знімок тут тому, що локальні змінні функції лежать у масиві слотів frame, а не в словнику (механізм з розділу про присвоєння). `locals()` копіює слоти в словник у момент виклику: запис у цей словник не змінює змінну, а змінна `b`, створена після виклику, у знімок не потрапила. У 3.13 цю поведінку формалізував PEP 667: кожен виклик `locals()` у функції повертає незалежний знімок. Змінювати локальні змінні через `locals()` не можна в жодній версії.

## Для капстоуну

Рендерер FormBuilder обходить дерево елементів і тягне за собою контекст: тему, глибину вкладеності, генератор унікальних `id`. Перша спокуса тримати лічильник `id` у глобальній змінній. Проблема видна вже на другому рендері: лічильник продовжує рахувати з того місця, де зупинився перший, тож одна й та сама форма отримує різні `id` залежно від того, скільки форм сервер відрендерив до неї.

```python
_next_id = 0

def next_id(kind: str) -> str:
    global _next_id
    _next_id += 1
    return f"{kind}-{_next_id}"

def render(element: dict, depth: int = 0) -> list[str]:
    lines = [f"{'  ' * depth}{next_id(element['type'])}"]
    for child in element.get("children", []):
        lines += render(child, depth + 1)
    return lines

form = {"type": "form", "children": [{"type": "input"}, {"type": "input"}]}
print(render(form))
print(render(form))
```

```text
['form-1', '  input-2', '  input-3']
['form-4', '  input-5', '  input-6']
```

Правильна форма: контекст іде параметрами, а генератор `id` це замикання, яке створюється на кожен рендер. Стан лічильника живе в cell конкретного генератора, два рендери не бачать один одного, і результат детермінований. Keyword-only параметри `*,` з m1-l07 тут роблять кожен виклик самодокументованим. `Callable[[str], str]` це тип "функція з рядка в рядок", типи детально в m2-l06.

```python
from collections.abc import Callable

def make_id_generator(prefix: str) -> Callable[[str], str]:
    counter = 0

    def next_id(kind: str) -> str:
        nonlocal counter
        counter += 1
        return f"{prefix}-{kind}-{counter}"

    return next_id

def render(element: dict, *, theme: str, depth: int, next_id: Callable[[str], str]) -> list[str]:
    el_id = next_id(element["type"])
    lines = [f"{'  ' * depth}<{element['type']} id={el_id} theme={theme}>"]
    for child in element.get("children", []):
        lines += render(child, theme=theme, depth=depth + 1, next_id=next_id)
    return lines

def render_form(form: dict, theme: str = "light") -> str:
    lines = render(form, theme=theme, depth=0, next_id=make_id_generator("f"))
    return "\n".join(lines)

form = {
    "type": "form",
    "children": [{"type": "input"}, {"type": "group", "children": [{"type": "input"}]}],
}
print(render_form(form))
print(render_form(form, theme="dark"))
```

```text
<form id=f-form-1 theme=light>
  <input id=f-input-2 theme=light>
  <group id=f-group-3 theme=light>
    <input id=f-input-4 theme=light>
<form id=f-form-1 theme=dark>
  <input id=f-input-2 theme=dark>
  <group id=f-group-3 theme=dark>
    <input id=f-input-4 theme=dark>
```

> **Для капстоуну.** Коли параметрів контексту стане більше трьох (тема, локаль, глибина, генератор `id`, режим preview), їх збирають в один об'єкт `RenderContext` на dataclass (m2-l05) і передають одним параметром. Готовий лічильник без власного замикання дає `itertools.count` (m5-l03): `ids = count(1)`, далі `next(ids)`. Глобального стану в рендерері не має бути зовсім: у капстоуні воркер рендерить форми підряд в одному процесі, і будь-який модульний лічильник перетече з однієї форми в іншу.

```python
from itertools import count

ids = count(1)
print(next(ids), next(ids), next(ids))
```

```text
1 2 3
```

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **Очікування блокового scope.** Ім'я, присвоєне в `if`, вважають тимчасовим або, навпаки, читають після `if`, забувши, що гілка могла не виконатись. Правильно: присвоїти до блоку або одним виразом.

   ```python
   if user:
       greeting = f"hi, {user}"
   print(greeting)  # UnboundLocalError / NameError, якщо user порожній

   greeting = f"hi, {user}" if user else "hi"
   ```

2. **`var`-подібне мислення про hoisting.** Очікують, що до локального присвоєння ще видно зовнішнє ім'я, або що буде `undefined`. Насправді присвоєння будь-де робить ім'я локальним на всю функцію, і читання до нього дає `UnboundLocalError`. Правильно: різні імена для зовнішнього і локального значення.

   ```python
   theme = "light"

   def resolve(override):
       resolved = override or theme  # а не theme = override or theme
       return resolved
   ```

3. **Присвоєння зовнішній змінній без `nonlocal`.** Лічильник із JS переносять один в один, `count += 1` падає. Правильно: `nonlocal count` у внутрішній функції.

   ```python
   def make_counter():
       count = 0
       def increment():
           nonlocal count
           count += 1
           return count
       return increment
   ```

4. **`global` для стану між викликами.** Модульна змінна, яку функція змінює, бо так було з `let` у модулі JS. Правильно: повертати значення, передавати параметром, або клас.

   ```python
   def track(calls: int) -> int:  # замість global calls; calls += 1
       return calls + 1
   ```

5. **Коробка `[0]` замість `nonlocal`.** Підглянутий у старому коді прийом ховає намір і бреше про тип. Правильно: `nonlocal`; мутацію контейнера лишити для справжніх колекцій.

   ```python
   box = [0]
   box[0] += 1   # погано: це лічильник, а не список
   ```

6. **IIFE для ізоляції.** `(() => { const cache = {}; ... })()` у Python не потрібне: модуль уже окремий scope, імпорт виконує його один раз. Правильно: модульні імена з підкресленням `_` як позначка "внутрішнє".

   ```python
   _cache: dict[str, str] = {}

   def cached(key: str) -> str | None:
       return _cache.get(key)
   ```

7. **Модульний патерн через замикання.** `createStore()`, що повертає об'єкт з `get` і `set` над приватною змінною, у Python пишуть як модуль з функціями або як клас. Замикання доречне для однієї функції зі станом, а не для імітації об'єкта.

   ```python
   class Store:
       def __init__(self) -> None:
           self._state: dict[str, str] = {}

       def get(self, key: str) -> str | None:
           return self._state.get(key)
   ```

8. **Затінення builtins.** `list = ...`, `id = ...`, `type = ...` на рівні модуля ламають вбудовані функції для всього файлу. Правильно: `items`, `field_id`, `field_type`; увімкнути правила `A` в ruff.

   ```python
   list = ["email"]
   list("ab")  # TypeError: 'list' object is not callable
   ```

## Підсумок

- Ім'я шукається в порядку LEGB: Local, Enclosing, Global, Builtin; перше знайдене виграє, scope лексичний.
- Scope створюють лише модуль, функція, тіло класу і comprehension з generator expression; `if`, `for`, `while`, `try`, `with` ні.
- Будь-яке зв'язування імені в тілі функції (`=`, `+=`, `for`, `import`, `as`, `def`) робить його локальним на всю функцію, і це вирішує компілятор.
- `UnboundLocalError` це TDZ з JS, де декларацією працює будь-яке присвоєння.
- `global` для переприсвоєння імені модуля, `nonlocal` для імені зовнішньої функції; читати можна без обох.
- Мутація об'єкта (`append`, `d[k] = v`) не є присвоєнням імені і декларацій не потребує; `items += [x]` є.
- Замикання тримає cell, а не значення: `__closure__[i].cell_contents`, один cell на змінну, спільний для всіх внутрішніх функцій.
- Пізнє зв'язування: замикання читає значення при виклику; фіксують через default-параметр, `partial` або фабрику.
- Builtins це модуль, їх можна затінити; оригінал у `builtins.<name>`, ловить ruff `A`.
- Стан рендеру передавати параметром або об'єктом, лічильники робити замиканням на кожен виклик, а не `global`.

## Що далі

Наступний урок m1-l09 про `lambda`, функції вищого порядку і `functools.partial`: усе про scope і замикання з цього уроку діє на `lambda` без змін, а `partial` там розбирається повністю як заміна і `bind`, і фіксації значення через замикання. Замикання з `nonlocal` і фабрики функцій повернуться в m5-l04 як фундамент декораторів.
