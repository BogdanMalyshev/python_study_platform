---
id: m1-l09
module: m1-syntax
title: "lambda, функції вищого порядку і чому в Python пишуть def"
summary: "Учень знає межі lambda і пише def там, де потрібне ім'я чи інструкція, сортує через key= замість компаратора, передає методи й функції з operator як key, розуміє лінивість map і filter, фіксує аргументи через functools.partial і замінює ланцюжки .filter().map().reduce() на any, all, sum, max з генераторним виразом."
duration_min: 70
prerequisites: [m1-l08]
---

## `lambda` це один вираз, а не тіло функції

`lambda params: expr` створює функцію, тіло якої складається рівно з одного виразу, і значення цього виразу автоматично повертається. Офіційна назва в документації мови lambda-вираз (lambda expression), у розмові просто "лямбда". Це те саме, що arrow function з коротким тілом `(x) => x * 2`. Параметри в lambda можуть бути будь-якими, як у `def` (m1-l07): значення за замовчуванням, `*args`, `**kwargs`. Тернарний вираз, який у документації називається conditional expression (слово "ternary" це жаргон, що прийшов з C і JS), теж вираз, тому в lambda він дозволений.

```ts
const double = (x: number) => x * 2;
const label = (f: Field) => (f.required ? `${f.label} *` : f.label);
const normalize = (s: string) => {
  const t = s.trim();
  if (!t) throw new Error("empty label");
  return t.toLowerCase();
};
```

```python
print((lambda x: x * 2)(21))

label = {"label": "Email", "required": True}
print((lambda f: f"{f['label']} *" if f["required"] else f["label"])(label))

print((lambda a, b=10, *rest, **opts: (a, b, rest, opts))(1, 2, 3, mode="x"))
print(type(lambda: 0), type(print))
```

```text
42
Email *
(1, 2, (3,), {'mode': 'x'})
<class 'function'> <class 'builtin_function_or_method'>
```

Розходження в третьому TS-прикладі: arrow function з блоком `{ ... }` у Python не має аналога серед lambda взагалі. Будь-яке тіло довше за один вираз пишеться через `def`. Останній рядок виводу показує, що lambda не окремий тип: це той самий об'єкт `function`, що й від `def`, лише створений виразом і без імені.

Python розрізняє інструкції (statement) і вирази (expression), і це офіційні терміни з language reference. У JS межа розмита: присвоєння там вираз, а блок `{}` можна підставити в arrow function. У Python `return`, `=`, `if` як інструкція, `for`, `try`, `raise`, `with`, `assert` належать до інструкцій, і всередину lambda жодна з них не потрапить. Помилка ловиться ще на етапі компіляції, тобто файл не запуститься навіть частково.

```python
normalize = lambda s: return s.strip()
```

```text
  File "example.py", line 1
    normalize = lambda s: return s.strip()
                          ^^^^^^
SyntaxError: invalid syntax
```

```python
check = lambda v: if v: v
```

```text
  File "example.py", line 1
    check = lambda v: if v: v
                      ^^
SyntaxError: invalid syntax
```

```python
fail = lambda msg: raise ValueError(msg)
```

```text
  File "example.py", line 1
    fail = lambda msg: raise ValueError(msg)
                       ^^^^^
SyntaxError: invalid syntax
```

> **Пастка.** Спроба присвоїти в тілі lambda дає повідомлення, яке збиває з пантелику: `cannot assign to lambda`. Парсер читає рядок як ланцюгове присвоєння `normalize = (lambda s: t) = s.strip()`, тобто намагається присвоїти щось самому lambda-виразу. Повідомлення про lambda, а не про `t`, саме з цієї причини.

```python
normalize = lambda s: t = s.strip()
```

```text
  File "example.py", line 1
    normalize = lambda s: t = s.strip()
                ^^^^^^^^^^^
SyntaxError: cannot assign to lambda
```

Технічно присвоєння всередині виразу існує: оператор `:=`, офіційно assignment expression, у спільноті walrus. У дужках він працює і в lambda. Але lambda з `:=` і `and` це якраз той момент, коли варто зупинитись і написати `def`: тіло вже має проміжну змінну, отже має й логіку, яка заслуговує на ім'я.

```python
first_word = lambda s: (t := s.strip()) and t.split()[0]
print(repr(first_word("  hello world ")))
print(repr(first_word("   ")))

def normalize(s: str) -> str:
    t = s.strip()
    if not t:
        raise ValueError("empty label")
    return t.lower()

print(normalize("  Email "))
```

```text
'hello'
''
email
```

<!-- task: q2 -->

## `<lambda>` замість імені: чому `f = lambda` пишуть як `def`

У lambda немає імені. Атрибут `__name__` у неї завжди `'<lambda>'`, і навіть присвоєння змінній цього не змінює. Тут JS поводиться інакше, ніж очікуєш, якщо до цього не замислювався: рушій виводить ім'я arrow function з імені змінної, тож `const toLabel = () => ...` має `toLabel.name === "toLabel"`. У Python такого виведення немає.

```ts
const toLabel = (f: Field) => f.label.trim();
console.log(toLabel.name); // "toLabel"
```

```python
to_label = lambda f: f["label"].strip()
print(to_label.__name__, to_label.__qualname__)

def to_label(f):
    return f["label"].strip()
print(to_label.__name__, to_label.__qualname__)
```

```text
<lambda> <lambda>
to_label to_label
```

Ім'я функції це те, що ви бачите в traceback, у профайлері, у логах і в `repr`. Коли lambda падає, рядок traceback каже `in <lambda>`, і якщо таких lambda в модулі десяток, лишається лише номер рядка. З `def` той самий traceback називає функцію і показує рядок її тіла.

```python
fields = [{"id": "email", "order": 2}, {"id": "phone"}]
by_order = sorted(fields, key=lambda f: f["order"])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    by_order = sorted(fields, key=lambda f: f["order"])
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 2, in <lambda>
    by_order = sorted(fields, key=lambda f: f["order"])
                                            ~^^^^^^^^^
KeyError: 'order'
```

```python
def field_order(f):
    return f["order"]

fields = [{"id": "email", "order": 2}, {"id": "phone"}]
by_order = sorted(fields, key=field_order)
```

```text
Traceback (most recent call last):
  File "example.py", line 5, in <module>
    by_order = sorted(fields, key=field_order)
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 2, in field_order
    return f["order"]
           ~^^^^^^^^^
KeyError: 'order'
```

Звідси правило PEP 8, офіційного стайлгайду мови (PEP це Python Enhancement Proposal, документ, яким змінюють мову і її конвенції): не прив'язувати lambda-вираз до імені через присвоєння, а писати `def`. Лінтери, зокрема ruff з m0-l04, ловлять це правилом E731. Аргумент простий: `f = lambda x: ...` не коротший за `def f(x): return ...` на один рядок, але втрачає ім'я, docstring і анотації типів, бо синтаксис lambda не дозволяє анотувати параметри.

```python
def required_label(f: dict) -> str:
    """Label with a star for required fields."""
    return f"{f['label']} *" if f["required"] else f["label"]

print(required_label.__doc__)
print(required_label.__annotations__)
lam = lambda f: f["label"]
print(lam.__doc__, lam.__annotations__)
```

```text
Label with a star for required fields.
{'f': <class 'dict'>, 'return': <class 'str'>}
None {}
```

Lambda доречна там, де функція одноразова й анонімна за природою: аргумент для іншої функції, який читається разом із викликом. `key=lambda f: f["order"]` у `sorted`, однорядковий callback, маленький адаптер, що переставляє аргументи. Якщо lambda отримує ім'я, використовується двічі, або в ній з'явився вкладений тернарний вираз, це `def`. Для доступу до ключа чи атрибута часто є варіант ще кращий за lambda, функції з модуля `operator` (розділ нижче).

> **Пастка.** Lambda в циклі замикає змінну, а не значення, тож усі lambda бачать її останнє значення; механізм пізнього зв'язування розібраний у m1-l08 і m1-l06. Виправлення в один рядок: параметр за замовчуванням `lambda i=i: i`, бо default обчислюється в момент створення функції.

```python
handlers = [lambda: i for i in range(3)]
print([h() for h in handlers])
handlers = [lambda i=i: i for i in range(3)]
print([h() for h in handlers])
```

```text
[2, 2, 2]
[0, 1, 2]
```

## `key=` замість компаратора: `sorted`, `min`, `max`, `list.sort`

У JS ви сортуєте компаратором `(a, b) => a.order - b.order`, і `arr.sort` мутує масив. У Python 3 компараторів у `sorted` немає взагалі. Замість них key-функція (key function, офіційний термін з глосарію): функція одного аргументу, яка перетворює елемент на значення, що порівнюється звичайним `<`. `sorted(iterable, key=...)` повертає новий список і нічого не мутує; `list.sort(key=...)` сортує на місці й повертає `None` (ця пастка з `x = items.sort()` розібрана в m1-l07).

```ts
const byOrder = [...fields].sort((a, b) => a.order - b.order);
const byLabel = fields.toSorted((a, b) => a.label.localeCompare(b.label));
```

```python
fields = [
    {"id": "phone", "label": "phone", "order": 3},
    {"id": "email", "label": "Email", "order": 1},
    {"id": "age", "label": "age", "order": 2},
]
by_order = sorted(fields, key=lambda f: f["order"])
print([f["id"] for f in by_order])
by_label = sorted(fields, key=lambda f: f["label"].lower())
print([f["id"] for f in by_label])
print([f["id"] for f in fields])
```

```text
['email', 'age', 'phone']
['age', 'email', 'phone']
['phone', 'email', 'age']
```

Різниця не лише у формі. Компаратор відповідає на питання "хто з двох менший" і викликається O(n log n) разів, на кожне порівняння. Key-функція відповідає на питання "за чим порівнювати цей елемент" і викликається рівно один раз на елемент. Якщо з legacy-коду прийшов саме компаратор, його обгортає `functools.cmp_to_key`, але писати нові компаратори в Python немає причини.

```python
def order_key(f):
    print("key for", f["id"])
    return f["order"]

fields = [{"id": "phone", "order": 3}, {"id": "email", "order": 1}, {"id": "age", "order": 2}]
print([f["id"] for f in sorted(fields, key=order_key)])
```

```text
key for phone
key for email
key for age
['email', 'age', 'phone']
```

```python
from functools import cmp_to_key

calls = {"key": 0, "cmp": 0}

def order_key(n):
    calls["key"] += 1
    return n

def compare(a, b):
    calls["cmp"] += 1
    return a - b

data = [(i * 37) % 100 for i in range(100)]
assert sorted(data, key=order_key) == sorted(data, key=cmp_to_key(compare))
print(calls)
```

```text
{'key': 100, 'cmp': 539}
```

> **Під капотом.** `sorted` спершу обчислює ключі для всіх елементів, потім сортує пари "ключ, елемент" алгоритмом Timsort, порівнюючи лише ключі, і нарешті повертає елементи в новому порядку. Тому дорога key-функція (запит до словника, нормалізація рядка) коштує n викликів, а не n log n.

Key-функцією може бути будь-яка функція одного аргументу, не обов'язково lambda. `str.lower` вже така функція, тому сортування без урахування регістру пишеться `key=str.lower` без жодної обгортки (чому метод можна передати як функцію, у наступному розділі). Без key рядки порівнюються за кодами символів, тож усі великі літери стоять перед малими. `min` і `max` приймають той самий `key=` і повертають елемент, а не ключ.

```python live
labels = ["beta", "Alpha", "gamma", "Delta"]
print(sorted(labels))
print(sorted(labels, key=str.lower))
print(min(labels, key=str.lower), max(labels, key=len))
labels.sort(key=str.lower)
print(labels)
```

```text
['Alpha', 'Delta', 'beta', 'gamma']
['Alpha', 'beta', 'Delta', 'gamma']
Alpha Alpha
['Alpha', 'beta', 'Delta', 'gamma']
```

> **Пастка.** `max` і `min` на порожній послідовності кидають `ValueError`, а не повертають `-Infinity`, як `Math.max()` у JS. Якщо порожнеча легальна, передавайте `default=`. Ще одна відмінність від JS: `max` приймає і iterable (офіційний термін: усе, що можна обійти `for`, m1-l06), і кілька аргументів, `max(3, 7)` працює без spread.

```python
print(max([]))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(max([]))
          ^^^^^^^
ValueError: max() iterable argument is empty
```

```python
print(max([], default=None))
print(max(["ab", "cd", "x"], key=len))
print(max(3, 7), min("b", "a", "c"))
```

```text
None
ab
7 a
```

<!-- task: t1 -->

Сортування в Python стабільне (stable sort, гарантія з документації, а не деталь реалізації): елементи з однаковим ключем зберігають взаємний порядок із вхідних даних. `reverse=True` обертає порядок ключів, але стабільність зберігає, тобто рівні елементи не міняються місцями. Це не те саме, що `sorted(...)[::-1]`, який перевертає й рівні елементи.

```python
rows = [("phone", 2), ("email", 1), ("age", 2), ("name", 1)]
print(sorted(rows, key=lambda r: r[1]))
print(sorted(rows, key=lambda r: r[1], reverse=True))
print(sorted(rows, key=lambda r: r[1])[::-1])
```

```text
[('email', 1), ('name', 1), ('phone', 2), ('age', 2)]
[('phone', 2), ('age', 2), ('email', 1), ('name', 1)]
[('age', 2), ('phone', 2), ('name', 1), ('email', 1)]
```

<!-- task: q3 -->

Сортування за кількома ключами робиться кортежем: кортежі порівнюються лексикографічно, спершу перші елементи, при рівності другі, і так далі. Це заміна JS-компаратора на кшталт `a.page - b.page || a.order - b.order`. Якщо один ключ потрібен за спаданням, а інший за зростанням, для чисел працює трюк з `-x`: мінус обертає порядок лише цього ключа.

```python live
fields = [
    {"id": "email", "page": 1, "order": 2, "priority": 5},
    {"id": "phone", "page": 1, "order": 1, "priority": 1},
    {"id": "age", "page": 2, "order": 1, "priority": 5},
    {"id": "name", "page": 2, "order": 0, "priority": 3},
]
print([f["id"] for f in sorted(fields, key=lambda f: (f["page"], f["order"]))])
print([f["id"] for f in sorted(fields, key=lambda f: (-f["priority"], f["id"]))])
print((1, "b") < (1, "c"), (1, 9) < (2, 0))
```

```text
['phone', 'email', 'name', 'age']
['age', 'email', 'name', 'phone']
True True
```

Для рядків мінуса немає, і тут стабільність стає інструментом: сортують у кілька проходів, від другорядного ключа до головного. Кожен наступний прохід зберігає порядок, встановлений попереднім, для рівних ключів. Нижче "пріоритет за зростанням, а при рівності `id` за спаданням".

```python
fields = [{"id": "email", "priority": 5}, {"id": "age", "priority": 5}]
print(sorted(fields, key=lambda f: (f["priority"], -f["id"])))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(sorted(fields, key=lambda f: (f["priority"], -f["id"])))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 2, in <lambda>
    print(sorted(fields, key=lambda f: (f["priority"], -f["id"])))
                                                       ^^^^^^^^
TypeError: bad operand type for unary -: 'str'
```

```python
fields = [
    {"id": "phone", "priority": 1},
    {"id": "email", "priority": 5},
    {"id": "age", "priority": 5},
]
step1 = sorted(fields, key=lambda f: f["id"], reverse=True)
step2 = sorted(step1, key=lambda f: f["priority"])
print([f["id"] for f in step2])
```

```text
['phone', 'email', 'age']
```

> **Пастка.** JS-сортування приводить усе до рядків і щось та поверне. Python порівнює ключі як є, і якщо серед них трапився `None` поруч із числами, сортування падає з `TypeError`. Для поля, якого може не бути, ключ робиться кортежем "спершу прапорець відсутності, потім значення": `False < True`, тож елементи без `order` йдуть у кінець.

```python
fields = [{"id": "email", "order": 2}, {"id": "note", "order": None}, {"id": "age", "order": 1}]
print(sorted(fields, key=lambda f: f["order"]))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(sorted(fields, key=lambda f: f["order"]))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
TypeError: '<' not supported between instances of 'NoneType' and 'int'
```

```python
fields = [{"id": "email", "order": 2}, {"id": "note", "order": None}, {"id": "age", "order": 1}]
result = sorted(fields, key=lambda f: (f["order"] is None, f["order"] or 0))
print([f["id"] for f in result])
```

```text
['age', 'email', 'note']
```

<!-- task: t2 -->

## Методи й модуль `operator` замість дрібних lambda

`str.upper` можна передати в `map` або як `key`, бо метод, взятий з класу, це функція, яка першим аргументом очікує `self`. `str.upper("abc")` і `"abc".upper()` один і той самий виклик, записаний двома способами. Для класів, написаних на Python, `Field.title` буквально об'єкт `function`; для вбудованих типів, написаних на C, це `method_descriptor`, але поводиться він так само. Термін "unbound method" ви побачите в старих статтях: це Python 2, у Python 3 такого окремого типу немає, лишилась звичайна функція.

```python
print(str.upper("abc"), "abc".upper())
print(list(map(str.strip, ["  email ", "phone  "])))
print(type(str.upper).__name__)

class Field:
    def __init__(self, label):
        self.label = label
    def title(self):
        return self.label.title()

print(type(Field.title).__name__)
print(Field.title(Field("first name")))
```

```text
ABC ABC
['email', 'phone']
method_descriptor
function
First Name
```

Метод, взятий з екземпляра, це зв'язаний метод (bound method, офіційний термін): окремий об'єкт, який пам'ятає і функцію (`__func__`), і екземпляр (`__self__`). Його можна покласти в змінну, передати як callback, і `self` нікуди не дінеться. Детально про механізм, який це робить, у m4-l01.

```ts
class Counter {
  count = 0;
  inc() { this.count++; }
}
const c = new Counter();
const inc = c.inc;
inc();                       // TypeError: Cannot read properties of undefined
const bound = c.inc.bind(c); // так це лагодять у JS
```

```python
class Counter:
    def __init__(self):
        self.count = 0

    def inc(self):
        self.count += 1

c = Counter()
inc = c.inc
inc()
inc()
print(c.count)
Counter.inc(c)
print(c.count)
print(type(inc).__name__, inc.__self__ is c, inc.__func__ is Counter.inc)
```

```text
2
3
method True True
```

Розходження принципове: у JS `this` визначається в момент виклику, тому метод, відірваний від об'єкта, губить його, і звідси `bind`, стрілки в полях класу й `onClick={() => this.handle()}`. У Python `self` прив'язується в момент читання атрибута `c.inc`, тож `bind`, `call` і `apply` не потрібні: зв'язаний метод уже прив'язаний, `Counter.inc(c)` це `call`, а `f(*args)` це `apply`.

> **Пастка.** `key=str.lower` працює лише тоді, коли всі елементи рядки. Якщо серед них `None`, помилка не про `None`, а про дескриптор (descriptor, офіційний термін з data model: об'єкт, що керує доступом до атрибута класу; механізм у модулі 4), і часто це перше місце, де JS-розробник бачить це слово. Читати її треба як "`str.lower` викликали з не-рядком".

```python
labels = ["Email", None, "phone"]
print(sorted(labels, key=str.lower))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(sorted(labels, key=str.lower))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
TypeError: descriptor 'lower' for 'str' objects doesn't apply to a 'NoneType' object
```

Модуль `operator` містить функції для операторів мови і готові фабрики key-функцій. `operator.add(a, b)` це `a + b` у вигляді функції, `mul`, `sub`, `truediv`, `eq` так само. `itemgetter("order")` повертає функцію, що робить `x["order"]`; з кількома ключами вона повертає кортеж, тобто одразу підходить для сортування за кількома полями. `attrgetter("meta.order")` читає атрибути, у тому числі через крапку. `methodcaller("strip", "*")` викликає метод з аргументами. Усі вони замінюють найчастіші lambda: `lambda x: x[0]`, `lambda x: x.name`, `lambda s: s.strip("*")`.

```python live
import operator
from operator import itemgetter, methodcaller

print(operator.add(2, 3), operator.mul(4, 5))

get_order = itemgetter("order")
print(get_order({"id": "email", "order": 2}))
print(itemgetter(0, 2)(["a", "b", "c"]))
print(get_order)

fields = [
    {"id": "phone", "page": 2, "order": 1},
    {"id": "email", "page": 1, "order": 2},
    {"id": "age", "page": 1, "order": 1},
]
print([f["id"] for f in sorted(fields, key=itemgetter("page", "order"))])
print(max(fields, key=itemgetter("order"))["id"])

strip_stars = methodcaller("strip", "*")
print(strip_stars("**Email*"))
print(list(map(methodcaller("split", "."), ["user.email", "user.name"])))
```

```text
5 20
2
('a', 'c')
operator.itemgetter('order')
['age', 'email', 'phone']
email
Email
[['user', 'email'], ['user', 'name']]
```

`attrgetter` для об'єктів з атрибутами. `SimpleNamespace` нижче це просто об'єкт з довільними атрибутами без оголошення класу, найближче до JS-літерала `{ id: "email" }`, до якого звертаються через крапку.

```python
from operator import attrgetter
from types import SimpleNamespace

el = SimpleNamespace(id="email", meta=SimpleNamespace(order=2))
el2 = SimpleNamespace(id="age", meta=SimpleNamespace(order=1))
print(attrgetter("id")(el), attrgetter("meta.order")(el))
print([e.id for e in sorted([el, el2], key=attrgetter("meta.order"))])
```

```text
email 2
['age', 'email']
```

Чому `itemgetter("order")` кращий за `lambda f: f["order"]`, хоча робить те саме. Він має читабельний `repr` (`operator.itemgetter('order')` у виводі вище, проти `<function <lambda> at 0x...>`), приймає кілька ключів без побудови кортежу руками і реалізований на C, тож не додає Python-виклику на кожен елемент. Але це не догма: якщо ключ потребує хоч якоїсь логіки (`.lower()`, `-x`, `is None`), lambda або `def` чесніші за спроби скласти це з `operator`.

## `map` і `filter` повертають ітератори, а не списки

`map(f, xs)` у JS-розумінні це `xs.map(f)`, але результат не масив. Це ітератор (iterator, офіційний термін): об'єкт, що віддає елементи по одному на вимогу і пам'ятає, де зупинився. Значення обчислюються ліниво (lazy, жаргон спільноти й загальний CS-термін; документація каже "iterator" і описує поведінку): функція `f` ще не викликана жодного разу, коли `map` повернув результат. Щоб отримати список, його явно збирають через `list(...)`. Протокол ітерації як такий розібрано в m5-l01.

```ts
const labels = ["  email ", "phone  ", " age"];
const trimmed = labels.map((s) => s.trim());
console.log(trimmed);        // ["email", "phone", "age"]
console.log(trimmed);        // ["email", "phone", "age"]
```

```python
labels = ["  email ", "phone  ", " age"]
m = map(str.strip, labels)
print(type(m))
print(list(m))
print(list(m))
```

```text
<class 'map'>
['email', 'phone', 'age']
[]
```

Розходження в третьому рядку виводу. Масив у JS можна читати скільки завгодно разів. Ітератор одноразовий: перший `list(m)` вичерпав його, другий отримує порожнечу без жодної помилки. Лінивість видно, якщо функція друкує свої виклики: нічого не відбувається до першого `next`, а далі виклики чергуються зі споживанням, по одному.

```python
def strip(s):
    print("strip", repr(s))
    return s.strip()

m = map(strip, [" a", "b ", " c "])
print("map created")
print(next(m))
for x in m:
    print("got", x)
```

```text
map created
strip ' a'
a
strip 'b '
got b
strip ' c '
got c
```

> **Пастка.** Ітератор не послідовність: у нього немає ні індексу, ні довжини. Код, який очікує від `map` масив (`m[0]`, `len(m)`, повторний прохід), ламається або, гірше, тихо отримує порожнечу при другому проході. Якщо результат потрібен більше одного разу, одразу `list(map(...))`.

```python
m = map(str.strip, [" a", "b "])
print(m[0])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(m[0])
          ~^^^
TypeError: 'map' object is not subscriptable
```

```python
m = map(str.strip, [" a", "b "])
print(len(m))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(len(m))
          ^^^^^^
TypeError: object of type 'map' has no len()
```

<!-- task: q1 -->

`filter(pred, xs)` так само лінивий. `filter(None, xs)` лишає елементи, які істинні за правилами truthiness з m1-l03 (жаргон спільноти; документація називає це truth value testing), і тому викидає не лише `None` і `""`, а й `0` та `False`, що для відповідей форми зазвичай помилка. `map` приймає кілька iterable і тоді передає функції по елементу з кожного, зупиняючись на найкоротшому, як `zip`.

```python live
values = ["a@b.c", "", None, 0, "x", False]
print(type(filter(None, values)))
print(list(filter(None, values)))
print(list(filter(lambda v: v is not None and v != "", values)))
print(list(map(lambda a, b: a * b, [1, 2, 3], [10, 20])))
```

```text
<class 'filter'>
['a@b.c', 'x']
['a@b.c', 0, 'x', False]
[10, 40]
```

Ланцюжок `.filter(...).map(...)` з JS у Python через `map` і `filter` читається зсередини назовні й обростає `lambda` та `list`. Тому в Python його майже завжди пишуть як comprehension (list comprehension, офіційний термін з документації; українського відповідника немає): `[вираз for x in xs if умова]`. Синтаксис і всі різновиди розібрані в m1-l10, тут лише межа: `map` лишається доречним, коли функція вже готова й має ім'я, наприклад `map(int, parts)` чи `map(str.strip, lines)`. Коли для `map` чи `filter` доводиться писати lambda, це comprehension.

```python
fields = [
    {"id": "email", "required": True},
    {"id": "note", "required": False},
    {"id": "phone", "required": True},
]
print(list(map(lambda f: f["id"].upper(), filter(lambda f: f["required"], fields))))
print([f["id"].upper() for f in fields if f["required"]])
print(list(map(int, "10,20,30".split(","))))
```

```text
['EMAIL', 'PHONE']
['EMAIL', 'PHONE']
[10, 20, 30]
```

`reduce` у Python 3 навіть не вбудована функція: її винесли в `functools`, бо для більшості задач є щось читабельніше. Сума це `sum`, добуток `math.prod`, склеювання рядків `"".join`, максимум `max`, групування `dict` або `collections.Counter`/`defaultdict` (m2-l04). `reduce` лишається для рідкісних згорток, яким немає назви; детальніше про `functools` у m5-l03.

```python
print(reduce(lambda a, b: a + b, [1, 2]))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(reduce(lambda a, b: a + b, [1, 2]))
          ^^^^^^
NameError: name 'reduce' is not defined
```

```python
from functools import reduce
import math
import operator

prices = [120, 80, 45]
print(reduce(operator.add, prices, 0), sum(prices))
print(reduce(operator.mul, [2, 3, 4]), math.prod([2, 3, 4]))
print(reduce(lambda acc, s: acc + s, ["a", "b", "c"]), "".join(["a", "b", "c"]))
```

```text
245 245
24 24
abc abc
```

## Функції вищого порядку і `functools.partial`

Функція вищого порядку (higher-order function, загальний CS-термін, який вживає й документація `functools`) приймає функцію аргументом або повертає функцію. Функції в Python об'єкти першого класу (m1-l07), тому все, що ви робили з колбеками в JS, працює так само: передати, повернути з фабрики (замикання, m1-l08), покласти в список чи словник. Перевірити, що щось можна викликати, дозволяє вбудована `callable()`; callable це офіційна назва для всього, що викликається: функцій, методів, класів, об'єктів з `__call__`. Тип для анотацій `Callable[[аргументи], результат]` береться з `collections.abc`.

```python
from collections.abc import Callable

def apply_all(value: str, transforms: list[Callable[[str], str]]) -> str:
    for transform in transforms:
        value = transform(value)
    return value

def make_max_length(limit: int) -> Callable[[str], str]:
    def cut(value: str) -> str:
        return value[:limit]
    return cut

print(apply_all("  Hello World  ", [str.strip, str.lower, make_max_length(5)]))
print(callable(str.strip), callable(make_max_length(5)), callable("x"))
```

```text
hello
True True False
```

Словник функцій (у спільноті dispatch table, "таблиця диспетчеризації", жаргон) замінює ланцюжок `if/elif` або `match` (m1-l05) там, де гілки відрізняються лише функцією, яку треба викликати. У TS це `Record<string, Handler>`. Перевага над `match` у тому, що набір гілок це дані: його можна розширити з іншого модуля, перевірити (`op in OPS`), перелічити в повідомленні про помилку.

```ts
const OPS: Record<string, (a: number, b: number) => number> = {
  "+": (a, b) => a + b,
  "*": (a, b) => a * b,
};
OPS["%"](1, 2); // TypeError: OPS[op] is not a function
```

```python
import operator

OPS = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
}

def calc(op: str, a: int, b: int) -> int:
    return OPS[op](a, b)

print(calc("+", 2, 3), calc("*", 4, 5))
print(calc("%", 1, 2))
```

```text
5 20
Traceback (most recent call last):
  File "example.py", line 13, in <module>
    print(calc("%", 1, 2))
          ^^^^^^^^^^^^^^^
  File "example.py", line 10, in calc
    return OPS[op](a, b)
           ~~~^^^^
KeyError: '%'
```

Розходження в помилці: JS отримує `undefined` і падає вже на виклику з невиразним `is not a function`, Python падає на читанні ключа з `KeyError` і назвою ключа. Якщо для невідомого ключа є розумна поведінка за замовчуванням, її дає `dict.get(key, fallback)`, і fallback теж функція.

```python live
def render_input(el):
    return f"<input name={el['name']!r}>"

def render_text(el):
    return f"<p>{el['text']}</p>"

def render_unknown(el):
    return f"<!-- unknown: {el['type']} -->"

RENDERERS = {"input": render_input, "text": render_text}

for el in [{"type": "text", "text": "Hi"}, {"type": "input", "name": "email"}, {"type": "video"}]:
    render = RENDERERS.get(el["type"], render_unknown)
    print(render(el))
```

```text
<p>Hi</p>
<input name='email'>
<!-- unknown: video -->
```

<!-- task: t3 -->

`functools.partial(func, *args, **kwargs)` фіксує частину аргументів і повертає новий callable, який при виклику дописує решту. Це `fn.bind(null, a)` з JS без `this`, і з тим, чого `bind` не вміє: фіксацією іменованих аргументів. Результат це partial object (офіційна назва з документації `functools`), і він не чорна скринька, як замикання: атрибути `func`, `args` і `keywords` показують, що саме зафіксовано, а `repr` це друкує.

```ts
function checkLength(value: string, min: number, max: number) { /* ... */ }
const checkName = (value: string) => checkLength(value, 2, 20);
const parseBinary = (s: string) => parseInt(s, 2);
```

```python
from functools import partial

def check_length(value: str, min_len: int, max_len: int) -> bool:
    return min_len <= len(value) <= max_len

check_name = partial(check_length, min_len=2, max_len=20)
print(check_name("Bo"), check_name("B"))
print(check_name.func.__name__, check_name.args, check_name.keywords)

parse_binary = partial(int, base=2)
print(parse_binary("1010"), parse_binary)
print(parse_binary("ff", base=16))
```

```text
True False
check_length () {'min_len': 2, 'max_len': 20}
10 functools.partial(<class 'int'>, base=2)
255
```

Розходження з JS-обгорткою в двох місцях. Зафіксовані іменовані аргументи можна перевизначити при виклику, як `base=16` в останньому рядку. І `partial` обчислює аргументи в момент створення, тоді як lambda чи замикання читає змінні в момент виклику. Тому `partial` не має пастки пізнього зв'язування, і саме тому його пропонують як виправлення для lambda в циклі.

```python
from functools import partial

def greet(greeting, name):
    return f"{greeting}, {name}"

hello = partial(greet, "Hello")
print(hello("Bohdan"))

prefix = "Hi"
by_lambda = lambda name: greet(prefix, name)
by_partial = partial(greet, prefix)
prefix = "Bye"
print(by_lambda("Ann"), "|", by_partial("Ann"))
```

```text
Hello, Bohdan
Bye, Ann | Hi, Ann
```

> **Пастка.** Позиційні аргументи `partial` стають на початок списку аргументів, а не "на вільні місця". Якщо зафіксувати перший параметр іменовано, а потім передати значення позиційно, воно знову піде в перший параметр, і виклик упаде. Правило: фіксуйте позиційно лише ведучі параметри, решту через ключові слова, і викликайте результат так само.

```python
from functools import partial

def greet(greeting, name):
    return f"{greeting}, {name}"

hello = partial(greet, greeting="Hello")
print(hello(name="Ann"))
print(hello("Ann"))
```

```text
Hello, Ann
Traceback (most recent call last):
  File "example.py", line 8, in <module>
    print(hello("Ann"))
          ^^^^^^^^^^^^
TypeError: greet() got multiple values for argument 'greeting'
```

Коли що брати. `partial`, коли є готова функція і треба зафіксувати її аргументи: читається як намір, інтроспектується, не має пізнього зв'язування. Lambda, коли треба переставити аргументи або додати крихту логіки в один вираз. `def`-фабрика із замиканням, коли нова функція має власне тіло.

<!-- task: t4 -->

## `any`, `all`, `sum`, `max`, `min` замість ланцюжків

Ланцюжки `.filter().map().reduce()` у Python згортаються в один виклик агрегатної функції з генераторним виразом (generator expression, офіційний термін з глосарію): це comprehension у круглих дужках, який не будує список, а віддає елементи ліниво, як `map`. Якщо він єдиний аргумент функції, другі дужки не потрібні: `sum(x for x in xs)`. Детально генераторні вирази в m1-l10, генератори в m5-l02.

```ts
const total = items.filter((i) => i.paid).map((i) => i.price).reduce((a, b) => a + b, 0);
const hasUnpaid = items.some((i) => !i.paid);
const allPositive = items.every((i) => i.price > 0);
const maxPaid = Math.max(...items.filter((i) => i.paid).map((i) => i.price));
```

```python live
items = [
    {"id": "basic", "price": 120, "paid": True},
    {"id": "pro", "price": 80, "paid": False},
    {"id": "addon", "price": 45, "paid": True},
]
print(sum(i["price"] for i in items if i["paid"]))
print(any(not i["paid"] for i in items))
print(all(i["price"] > 0 for i in items))
print(max(i["price"] for i in items if i["paid"]))
print(min((i for i in items if i["paid"]), key=lambda i: i["price"])["id"])
```

```text
165
True
True
120
addon
```

Розходження з JS у трьох деталях. Жодного проміжного масиву: генераторний вираз віддає елементи прямо в `sum`, і `any` з `all` зупиняються на першому вирішальному елементі (short-circuit, термін з документації булевих операторів `and`/`or`; демонстрація викликів у m1-l06), як `.some` і `.every`. `max` з `key=` повертає сам елемент, а не обчислене значення, тому `min(..., key=...)["id"]` дає `id` найдешевшого, без пари `Math.min` плюс `find`. І порожні випадки поводяться так само, як `[].every` і `[].some` у JS, крім `max`, якому потрібен `default=`.

```python
print(all([]), any([]))
print(sum([]), sum([0.5, 0.25], start=10))
print(max((x for x in [] if x), default=0))
```

```text
True False
0 10.75
0
```

> **Пастка.** Генераторний вираз без власних дужок дозволений лише як єдиний аргумент. Щойно поруч з'являється другий аргумент, наприклад стартове значення `sum`, потрібні явні дужки. А `sum` для рядків заборонений навмисно, і помилка прямо підказує `"".join`.

```python
prices = [120, 80, 45]
print(sum(p for p in prices, 0))
```

```text
  File "example.py", line 2
    print(sum(p for p in prices, 0))
              ^^^^^^^^^^^^^^^^^
SyntaxError: Generator expression must be parenthesized
```

```python
prices = [120, 80, 45]
print(sum((p for p in prices), 100))
print(sum(["a", "b"], ""))
```

```text
345
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    print(sum(["a", "b"], ""))
          ^^^^^^^^^^^^^^^^^^^
TypeError: sum() can't sum strings [use ''.join(seq) instead]
```

`zip` і `enumerate` теж замінюють колбеки, тільки з іншого боку. У JS індекс і "сусідній" масив приходять другим аргументом колбека: `xs.map((x, i) => ...)`, `a.map((x, i) => x * b[i])`. У Python колбек не потрібен: `enumerate` і `zip` (m1-l06) обгортають сам iterable і віддають пари, які розпаковуються в генераторному виразі або в `key=`. Індекс максимального елемента це `max(enumerate(xs), key=itemgetter(1))`, скалярний добуток `sum(a * b for a, b in zip(xs, ys))`.

```python live
from operator import itemgetter

scores = [70, 95, 88]
weights = [0.2, 0.5, 0.3]
print(sum(s * w for s, w in zip(scores, weights)))
best_index, best = max(enumerate(scores), key=itemgetter(1))
print(best_index, best)
labels = ["email", "phone"]
print([f"{i}:{label}" for i, label in enumerate(labels, start=1)])
```

```text
87.9
1 95
['1:email', '2:phone']
```

## Для капстоуну

Рендерер FormBuilder отримує дерево елементів і для кожного викликає функцію за його `type`. Це словник-реєстр `{"input": render_input, "text": render_text}`, а не `if/elif` по типах: новий тип елемента додається одним рядком у реєстр, і реєстр можна перевірити заздалегідь, до рендерингу. Порядок на сторінці задає поле `order`, і `sorted(..., key=itemgetter("order"))` дає його без lambda; стабільність гарантує, що елементи з однаковим `order` лишаться в порядку з конфігу.

```python
from collections.abc import Callable
from operator import itemgetter

Element = dict
Renderer = Callable[[Element], str]

def render_input(el: Element) -> str:
    return f'<input name="{el["name"]}" type="{el.get("input_type", "text")}">'

def render_text(el: Element) -> str:
    return f"<p>{el['text']}</p>"

RENDERERS: dict[str, Renderer] = {
    "input": render_input,
    "text": render_text,
}

def render_page(elements: list[Element]) -> str:
    lines = []
    for el in sorted(elements, key=itemgetter("order")):
        render = RENDERERS.get(el["type"])
        if render is None:
            raise ValueError(f"no renderer for type {el['type']!r}")
        lines.append(render(el))
    return "\n".join(lines)

elements = [
    {"type": "input", "name": "email", "input_type": "email", "order": 2},
    {"type": "text", "text": "Contact us", "order": 1},
    {"type": "input", "name": "phone", "order": 3},
]
print(render_page(elements))
print(render_page([{"type": "video", "order": 1}]))
```

```text
<p>Contact us</p>
<input name="email" type="email">
<input name="phone" type="text">
Traceback (most recent call last):
  File "example.py", line 33, in <module>
    print(render_page([{"type": "video", "order": 1}]))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 23, in render_page
    raise ValueError(f"no renderer for type {el['type']!r}")
ValueError: no renderer for type 'video'
```

> **Для капстоуну.** У m1-l07 сигнатура рендерера `render(element, *, theme, depth=0)`. Реєстр від цього не змінюється: `RENDERERS[el["type"]](el, theme=theme)`. Якщо тема одна на весь прохід, її фіксують один раз через `partial(renderer, theme=theme)` і далі передають уже готовий callable. Такий словник і є патерн Strategy в ідіоматичному Python (m4-l08), а після m5-l04 реєстр можна поповнювати декоратором на кшталт `@register("input")` замість ручного запису в словник.

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **Arrow function з блоком тіла, перенесена в lambda.** Пишуть `lambda x: { ... }` або `lambda x: return ...` і отримують `SyntaxError` ще до запуску. Правильно: усе, що довше за один вираз, це `def`.

   ```python
   def normalize(s: str) -> str:
       t = s.strip()
       if not t:
           raise ValueError("empty label")
       return t.lower()
   ```

2. **`const f = () => ...` як `f = lambda ...`.** У JS це звичайний спосіб оголосити функцію, у Python це E731: ім'я `<lambda>` у traceback, без docstring і анотацій. Правильно: `def`.

   ```python
   to_label = lambda f: f["label"].strip()   # за звичкою
   def to_label(f: dict) -> str:              # правильно
       return f["label"].strip()
   ```

3. **Ланцюжок `.filter().map().reduce()` через `map`, `filter` і `reduce`.** Перекладають буквально і отримують `list(map(lambda ..., filter(lambda ..., xs)))`, що читається зсередини назовні. Правильно: comprehension для нової колекції, `sum`/`any`/`all`/`max` з генераторним виразом для згортки.

   ```python
   total = reduce(lambda a, i: a + i["price"], filter(lambda i: i["paid"], items), 0)  # за звичкою
   total = sum(i["price"] for i in items if i["paid"])                                 # правильно
   ```

4. **Очікування, що `map` повертає масив.** Індексують `m[0]`, беруть `len(m)` або проходять результат двічі й удруге отримують порожнечу. Правильно: `list(map(...))`, якщо результат потрібен як колекція, або comprehension одразу.

   ```python
   names = list(map(str.strip, raw_names))
   names = [n.strip() for n in raw_names]
   ```

5. **`arr.sort(compareFn)` з мутацією оригіналу.** Шукають параметр-компаратор, пишуть `x = items.sort()` і отримують `None`, а оригінал уже змінено. Правильно: `sorted(items, key=...)` для нового списку, `items.sort(key=...)` лише коли мутація потрібна свідомо; кілька ключів кортежем, спадання через `reverse=True` або `-x`.

   ```python
   ordered = sorted(fields, key=itemgetter("page", "order"))
   ranked = sorted(fields, key=lambda f: (-f["priority"], f["id"]))
   ```

6. **`bind`, `call`, `apply` за звичкою.** Шукають, як прив'язати `this`, хоча `obj.method` вже зв'язаний метод. Правильно: передавати `obj.method` як є, для фіксації аргументів `partial`, замість `apply` розпакування `f(*args, **kwargs)`.

   ```python
   callback = counter.inc                 # self уже прив'язаний
   check_name = partial(check_length, min_len=2, max_len=20)
   result = greet(*["Hello", "Ann"])
   ```

7. **`filter(Boolean)` як "прибрати порожні".** `filter(None, xs)` викидає і `0`, і `False`, які для відповідей форми цілком валідні. Правильно: явна умова.

   ```python
   answers = [v for v in values if v is not None and v != ""]
   ```

8. **`Math.max(...arr)` на порожньому масиві.** У JS це `-Infinity`, у Python `max([])` кидає `ValueError`. Правильно: `default=` там, де порожнеча легальна.

   ```python
   best = max((f["score"] for f in fields), default=0)
   ```

## Підсумок

- `lambda params: expr` це рівно один вираз з неявним `return`; тернарний вираз можна, інструкції (`return`, `=`, `if`, `try`, `raise`) не можна.
- Lambda не має імені: `__name__ == '<lambda>'` навіть після присвоєння, тому `f = lambda` пишуть як `def` (PEP 8, E731).
- Lambda доречна як одноразовий аргумент: короткий `key=`, однорядковий callback; повторне використання чи логіка означає `def`.
- `key=` замість компаратора: викликається один раз на елемент; кілька ключів кортежем, спадання через `reverse=True` або `-x`, рядки за спаданням через кілька стабільних проходів.
- Сортування стабільне, і `reverse=True` цю стабільність зберігає; `None` серед ключів дає `TypeError`.
- `str.lower`, `itemgetter`, `attrgetter`, `methodcaller` замінюють більшість дрібних lambda; зв'язаний метод `obj.m` вже пам'ятає `self`, `bind` не потрібен.
- `map` і `filter` повертають лінивий одноразовий ітератор без `len` і індексу; з lambda всередині їх замінює comprehension, `reduce` живе в `functools` і рідко потрібен.
- Функції це значення: словник функцій замінює `if/elif` за типом, `dict.get(key, fallback)` дає обробник за замовчуванням.
- `partial` фіксує аргументи в момент створення, має `func`, `args`, `keywords`; позиційні аргументи стають на початок.
- `sum`, `any`, `all`, `max`, `min` з генераторним виразом замінюють ланцюжки `.filter().map().reduce()`; `max` на порожньому потребує `default=`.

## Що далі

Наступний урок m1-l10 про comprehensions: тут вони з'являлися як заміна `map` і `filter`, там розібрано синтаксис, dict і set comprehension, генераторні вирази й межу читабельності. `key=`, `itemgetter` і `any`/`all` звідси там використовуються як готові інструменти, а `functools` повертається в m5-l03 разом з `lru_cache`, `reduce` і `wraps`.
