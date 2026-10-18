---
id: m1-l10
module: m1-syntax
title: "Comprehensions замість map і filter"
summary: "Учень замінює ланцюжки map/filter/reduce на list, dict і set comprehension та generator expression, читає й пише вкладені for, не плутає фільтр з умовним виразом, знає власний scope comprehension і walrus, і вміє вчасно повернутися до звичайного циклу."
duration_min: 70
prerequisites: [m1-l09]
---

## List comprehension: вираз, цикл, фільтр

Comprehension (comprehension; офіційний термін документації: list comprehension, dict comprehension, set comprehension; усталеного українського відповідника немає, на співбесіді кажуть англійською) це вираз, який будує нову колекцію з іншої колекції за один прохід. Те, що в TypeScript пишуть ланцюжком `.filter().map()`, у Python пишуть однією конструкцією в квадратних дужках. Методів `map`, `filter`, `flat` у списку немає взагалі: перетворення колекцій тут не API масиву, а синтаксис мови.

```ts
const fields = [
  { name: "email", type: "email", required: true },
  { name: "phone", type: "phone", required: false },
  { name: "age", type: "number", required: true },
];
const names = fields.filter((f) => f.required).map((f) => f.name.toUpperCase());
console.log(names); // ["EMAIL", "AGE"]
```

```python
fields = [
    {"name": "email", "type": "email", "required": True},
    {"name": "phone", "type": "phone", "required": False},
    {"name": "age", "type": "number", "required": True},
]
names = [f["name"].upper() for f in fields if f["required"]]
print(names)
```

```text
['EMAIL', 'AGE']
```

Розходження у двох місцях. JS-ланцюжок робить два проходи й створює проміжний масив після `filter`; comprehension проходить колекцію один раз і нічого проміжного не будує. І порядок запису інший: у JS кроки йдуть у порядку виконання, а в Python спершу пишеться вираз-результат, потім `for`, потім `if`. Читається це як "ім'я великими літерами, для кожного `f` з `fields`, якщо `f` обов'язкове". Такий порядок узято з математичного запису множин `{x² | x ∈ S, x > 0}`, звідки й назва: у теорії множин це set comprehension.

Comprehension не має власної семантики, це рівно ось такий цикл з `append`, записаний одним виразом. Правило перекладу механічне: `for` і `if` ідуть у тому самому порядку, у якому стояли б вкладені рядки циклу, а вираз з `append` переїжджає на початок. Це правило знадобиться далі, коли `for` стане кілька.

```python
fields = [
    {"name": "email", "type": "email", "required": True},
    {"name": "phone", "type": "phone", "required": False},
    {"name": "age", "type": "number", "required": True},
]

result = []
for f in fields:
    if f["required"]:
        result.append(f["name"].upper())

print(result)
print(result == [f["name"].upper() for f in fields if f["required"]])
```

```text
['EMAIL', 'AGE']
True
```

Праворуч від `in` стоїть будь-який iterable (iterable; офіційний термін з глосарію документації: об'єкт, який віддає елементи по одному, детально в m1-l06). Тому comprehension однаково працює зі списком, рядком, `range`, словником чи його `.items()`, а результат завжди список, незалежно від типу джерела.

```python live
answers = {"email": "a@b.c", "phone": "", "age": 30}
print([key for key, value in answers.items() if value])
print([ch.upper() for ch in "abc"])
print([n * n for n in range(5) if n % 2 == 0])
print([len(word) for word in "comprehension builds a list".split()])
```

```text
['email', 'age']
['A', 'B', 'C']
[0, 4, 16]
[13, 6, 1, 4]
```

<!-- task: t1 -->

## Фільтр у кінці, умовний вираз на початку

У comprehension буває два різні `if`, і вони стоять у різних місцях. `if` після `for` це фільтр: він вирішує, чи потрапить елемент у результат, і `else` у нього бути не може. `a if cond else b` перед `for` це умовний вираз (conditional expression; офіційна назва в language reference, а "тернарний оператор" це жаргон, перенесений з C і JS, на співбесіді зрозуміють обидва): він вирішує, яке значення покласти, а кількість елементів не змінює, тому `else` обов'язковий.

```python
scores = [3, 0, 7, 0]
print([s for s in scores if s > 0])
print([s if s > 0 else None for s in scores])
print([s * 10 if s > 5 else s for s in scores if s])
```

```text
[3, 7]
[3, None, 7, None]
[3, 70]
```

Третій рядок поєднує обидва: фільтр у кінці викинув нулі, умовний вираз на початку помножив лише те, що більше за 5. Якщо читати за правилом з першого розділу, плутанини немає: усе, що до `for`, це вираз для `append`, усе після `for` це структура циклу.

> **JS-аналог.** `cond ? a : b` у Python пишеться `a if cond else b`: значення "за замовчуванням" стоїть першим, умова посередині. Це вираз, а не інструкція, тому його можна ставити в comprehension, в аргумент, у `return`. Інструкцію `if` без `else` у вираз не вставити.

> **Пастка.** Переставлені місцями частини не дають іншої семантики, вони дають `SyntaxError`. `else` у фільтрі не має сенсу, бо фільтр або пропускає елемент, або ні; `if` без `else` на початку не має сенсу, бо вираз мусить щось повернути для кожного елемента.

```python
scores = [3, 0, 7, 0]
print([s for s in scores if s > 0 else None])
```

```text
  File "example.py", line 2
    print([s for s in scores if s > 0 else None])
                                      ^^^^
SyntaxError: invalid syntax
```

```python
scores = [3, 0, 7, 0]
print([s if s > 0 for s in scores])
```

```text
  File "example.py", line 2
    print([s if s > 0 for s in scores])
           ^^^^^^^^^^
SyntaxError: expected 'else' after 'if' expression
```

Фільтрів після `for` може бути кілька підряд, і вони поєднуються як `and`. Це легально, але на практиці пишуть один `if` з `and`: так очевидніше, що умова одна.

```python
print([n for n in range(20) if n % 2 == 0 if n % 3 == 0])
print([n for n in range(20) if n % 2 == 0 and n % 3 == 0])
```

```text
[0, 6, 12, 18]
[0, 6, 12, 18]
```

<!-- task: q1 -->

## Кілька `for`: вкладені цикли, сплющення, матриці

Comprehension може мати кілька `for` поспіль, і порядок у них той самий, що у вкладених циклах: перший `for` зовнішній, наступний вкладений у нього. Це пряме застосування правила перекладу. Найчастіше так будують усі комбінації двох наборів, тобто декартів добуток.

```python
names = ["email", "phone"]
langs = ["uk", "en"]
print([(name, lang) for name in names for lang in langs])

pairs = []
for name in names:
    for lang in langs:
        pairs.append((name, lang))
print(pairs)

print([(a, b) for a in range(3) for b in range(3) if a < b])
```

```text
[('email', 'uk'), ('email', 'en'), ('phone', 'uk'), ('phone', 'en')]
[('email', 'uk'), ('email', 'en'), ('phone', 'uk'), ('phone', 'en')]
[(0, 1), (0, 2), (1, 2)]
```

Фільтр може стояти після будь-якого `for` і бачить усі змінні, оголошені лівіше. Друга часта задача на кілька `for` це сплющення (flatten; загальновживаний жаргон, у Python немає вбудованої функції з такою назвою): список списків перетворюється на плаский список.

```ts
const pages = [
  { title: "Contact", fields: [{ id: "email" }, { id: "phone" }] },
  { title: "About", fields: [{ id: "age" }] },
];
const ids = pages.flatMap((p) => p.fields).map((f) => f.id);
const flat = [[1, 2], [3], []].flat();
```

```python
pages = [
    {"title": "Contact", "fields": [{"id": "email"}, {"id": "phone"}]},
    {"title": "About", "fields": [{"id": "age"}]},
]
ids = [f["id"] for page in pages for f in page["fields"]]
print(ids)

grid = [[1, 2], [3], []]
print([item for row in grid for item in row])
```

```text
['email', 'phone', 'age']
[1, 2, 3]
```

`flat()` і `flatMap()` у Python не потрібні, бо другий `for` у comprehension і є `flatMap`: для кожного зовнішнього елемента він розгортає внутрішню колекцію в той самий результат. Різниця з `flat(depth)` у тому, що кількість рівнів задається кількістю `for`, тобто відома під час написання коду. Для дерева довільної глибини потрібна рекурсія, вона в розділі для капстоуну. Ліниве сплющення одного рівня без побудови списку робить `itertools.chain.from_iterable(grid)`, itertools детально в m5-l03.

> **Пастка.** Інтуїція підказує писати "від елемента до контейнера": `[item for item in row for row in grid]`. Це читається по-англійськи, але порушує порядок вкладених циклів: перший `for` виконується першим, а `row` на той момент ще не існує. Якщо змінна `row` випадково лишилась з попереднього коду, помилки не буде, буде тихо неправильний результат.

```python
grid = [[1, 2], [3], []]
print([item for item in row for row in grid])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print([item for item in row for row in grid])
                            ^^^
NameError: name 'row' is not defined. Did you mean: 'pow'?
```

Кілька `for` в одній comprehension і comprehension всередині виразу іншої comprehension це різні речі. Перше дає плаский список, друге дає список списків. Вкладена comprehension це стандартний спосіб створити матрицю: зовнішня перебирає рядки, внутрішня будує кожен рядок заново. Ім'я `_` за конвенцією означає "значення не потрібне", синтаксичного сенсу в нього немає.

```python live
rows, cols = 2, 3
grid = [[0] * cols for _ in range(rows)]
grid[0][0] = 1
print(grid)

matrix = [[1, 2, 3], [4, 5, 6]]
print([[row[i] for row in matrix] for i in range(len(matrix[0]))])
print([list(col) for col in zip(*matrix)])
```

```text
[[1, 0, 0], [0, 0, 0]]
[[1, 4], [2, 5], [3, 6]]
[[1, 4], [2, 5], [3, 6]]
```

> **Пастка.** Коротший запис `[[0] * cols] * rows` створює не `rows` рядків, а `rows` посилань на один і той самий рядок. `*` над списком копіює посилання, а не об'єкти; для `[0] * cols` це безпечно, бо `0` незмінний, а для списку списків зміна однієї клітинки видна в усіх рядках. Модель посилань і aliasing детально в m2-l02.

```python
grid = [[0] * 3] * 2
grid[0][0] = 1
print(grid)
print(grid[0] is grid[1])
```

```text
[[1, 0, 0], [1, 0, 0]]
True
```

<!-- task: t2 -->

## dict і set comprehension

Ті самі правила з фігурними дужками дають словник або множину. `{key: value for ...}` це dict comprehension, `{value for ...}` це set comprehension; обидві назви офіційні (dict comprehension з'явилась у PEP 274). JS-шлях до словника з масиву проходить через проміжний масив пар і `Object.fromEntries`, у Python пари не створюються.

```ts
const types = Object.fromEntries(fields.map((f) => [f.name, f.type]));
const kinds = new Set(fields.map((f) => f.type));
```

```python
fields = [
    {"name": "email", "type": "text"},
    {"name": "company", "type": "text"},
    {"name": "age", "type": "number"},
]
types = {f["name"]: f["type"] for f in fields}
kinds = {f["type"] for f in fields}
print(types)
print(sorted(kinds))
```

```text
{'email': 'text', 'company': 'text', 'age': 'number'}
['number', 'text']
```

Розходження в ключах і порядку. Ключем словника може бути будь-яке хешоване значення, не лише рядок: число, кортеж, `None`. Порядок у словнику це порядок вставки, як у JS `Map`. А множина порядку не гарантує, тому вище її відсортовано перед друком: для рядків порядок у `set` змінюється навіть між запусками однієї програми, бо хеш рядка за замовчуванням рандомізований.

```text
$ PYTHONHASHSEED=1 python -c 'print({"email", "phone", "number"})'
{'number', 'phone', 'email'}
$ PYTHONHASHSEED=2 python -c 'print({"email", "phone", "number"})'
{'phone', 'number', 'email'}
```

`{}` це порожній словник, а не порожня множина. Словники були в мові з самого початку й отримали фігурні дужки першими; літерал множини `{1, 2}` з'явився значно пізніше, і порожні дужки вже були зайняті. Порожня множина пишеться тільки `set()`. Set comprehension з порожнього джерела теж повертає множину, бо тип визначає синтаксис, а не вміст.

```python
print(type({}), type(set()), type({1}))
empty = {x for x in []}
print(empty, type(empty))
```

```text
<class 'dict'> <class 'set'> <class 'set'>
set() <class 'set'>
```

Інвертування словника це dict comprehension по `.items()` з переставленими місцями ключем і значенням. Вона коректна, лише коли значення унікальні. Якщо два ключі мають однакове значення, в інвертованому словнику виживе останній, і жодної помилки не буде: dict comprehension, як і `Object.fromEntries`, мовчки перезаписує ключ.

```python
labels = {"email": "Email", "phone": "Phone", "mobile": "Phone"}
print({label: key for key, label in labels.items()})
```

```text
{'Email': 'email', 'Phone': 'mobile'}
```

Найкорисніша dict comprehension у бекенді це індекс: словник від ідентифікатора до запису, щоб замість пошуку по списку за O(n) отримувати запис за O(1). Значеннями в індексі лежать ті самі об'єкти, що й у списку, а не копії: зміна через індекс видна в списку.

```python live
elements = [
    {"id": "email", "type": "email"},
    {"id": "age", "type": "number"},
]
index = {el["id"]: el for el in elements}
print(index["age"])
print(index["email"] is elements[0])
```

```text
{'id': 'age', 'type': 'number'}
True
```

Групування до comprehension не зводиться, і це межа, яку JS-звичка до `reduce` перетинає найчастіше. Comprehension будує одне значення на один ключ, а групування накопичує кілька значень під одним ключем. Записати його comprehension-ом можна лише з повторним проходом по всьому списку для кожного ключа, тобто квадратично.

```ts
const byType = fields.reduce<Record<string, string[]>>((acc, f) => {
  (acc[f.type] ??= []).push(f.name);
  return acc;
}, {});
```

```python
from collections import Counter, defaultdict

fields = [
    {"name": "email", "type": "text"},
    {"name": "company", "type": "text"},
    {"name": "age", "type": "number"},
]
by_type = defaultdict(list)
for f in fields:
    by_type[f["type"]].append(f["name"])
print(dict(by_type))
print(Counter(f["type"] for f in fields))
```

```text
{'text': ['email', 'company'], 'number': ['age']}
Counter({'text': 2, 'number': 1})
```

Python-версія не має акумулятора, який треба повертати з колбека: `defaultdict(list)` сам створює порожній список для нового ключа, а `Counter` рахує входження одним викликом. Обидва з модуля `collections`, детально в m2-l04. Правило: якщо в JS ви тягнетесь до `reduce`, у Python спершу перевірте `sum`, `Counter`, `defaultdict` чи `dict` comprehension; `functools.reduce` лишається для рідкісних згорток, які нічим із цього не виражаються (m1-l09).

<!-- task: t3 -->

## Generator expression: лінивий і одноразовий

Ті самі частини в круглих дужках дають generator expression (generator expression; офіційний термін з глосарію, скорочення "genexp" це жаргон). Це не кортеж: tuple comprehension у Python не існує, кортеж будують `tuple(...)` від generator expression. Generator expression нічого не обчислює одразу, він повертає об'єкт-генератор, який віддає елементи на вимогу й вичерпується (exhausted; так пишуть і в документації) після одного проходу.

```python
fields = ["email", "phone", "age"]
gen = (name.upper() for name in fields)
print(type(gen))
print(list(gen))
print(list(gen))
print(tuple(name.upper() for name in fields))
```

```text
<class 'generator'>
['EMAIL', 'PHONE', 'AGE']
[]
('EMAIL', 'PHONE', 'AGE')
```

Ліниві обчислення (lazy evaluation; загальний термін, не специфічний для Python) видно, якщо вираз має побічний ефект. Створення генератора не викликає `load` жодного разу; кожен `next` обчислює рівно один елемент; `list` добирає решту. Це та сама модель, що в JS-генератора `function*`, лише записана виразом.

```python live
def load(name):
    print("load", name)
    return name.upper()

gen = (load(name) for name in ["email", "phone"])
print("created")
print(next(gen))
print("after first")
print(list(gen))
```

```text
created
load email
EMAIL
after first
load phone
['PHONE']
```

Через лінивість генератор не тримає елементи в пам'яті: його розмір не залежить від довжини джерела. Список із мільйона чисел займає мегабайти, генератор над тим самим `range` займає кількасот байтів. Числа нижче для 64-бітного CPython; у браузерному Pyodide вони інші, тому приклад не живий.

```python
import sys

squares_list = [n * n for n in range(1_000_000)]
squares_gen = (n * n for n in range(1_000_000))
print(sys.getsizeof(squares_list))
print(sys.getsizeof(squares_gen))
print(sum(squares_gen) == sum(squares_list))
```

```text
8448728
200
True
```

Коли generator expression єдиний аргумент виклику, власні дужки можна не писати: `sum(x for x in xs)` замість `sum((x for x in xs))`. Звідси головне застосування: передати послідовність значень прямо в агрегатор `sum`, `any`, `all`, `max`, `min`, `sorted`, `set`, `dict`, `"".join`, не будуючи список, який одразу викинуть.

```python live
fields = [
    {"name": "email", "required": True},
    {"name": "phone", "required": False},
    {"name": "age", "required": True},
]
print(sum(1 for f in fields if f["required"]))
print(max(len(f["name"]) for f in fields))
print(all(f["name"].islower() for f in fields))
print(", ".join(f["name"] for f in fields))
print(sorted((f["name"] for f in fields), key=len))
```

```text
2
5
True
email, phone, age
['age', 'email', 'phone']
```

> **Пастка.** Дужки можна опустити, лише коли аргумент один. Щойно поруч з'являється другий аргумент, навіть іменований, генератор треба взяти у власні дужки, як у `sorted(...)` вище. Інакше `SyntaxError`.

```python
fields = [{"name": "email"}, {"name": "age"}]
print(sum(len(f["name"]) for f in fields, start=0))
```

```text
  File "example.py", line 2
    print(sum(len(f["name"]) for f in fields, start=0))
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
SyntaxError: Generator expression must be parenthesized
```

Вибір між generator expression і list comprehension простий. Якщо результат споживається один раз і одразу агрегатором, це generator expression. Якщо потрібні `len`, індексація, кілька проходів, друк або повернення з функції як готових даних, це список. Виняток `str.join`: він усередині все одно перетворює аргумент на послідовність, бо мусить порахувати сумарну довжину рядка заздалегідь, тож лінивість там нічого не дає, і `", ".join([...])` зі списком навіть швидший (виміри в розділі про швидкість). Обидва варіанти ідіоматичні.

> **Пастка.** `max` і `min` на порожньому джерелі кидають `ValueError`, а не повертають `-Infinity`, як `Math.max()` у JS. Для генератора, який може нічого не віддати, передавайте `default=`; через другий аргумент дужки навколо генератора знову обов'язкові.

```python
fields = []
print(max((len(f["name"]) for f in fields), default=0))
print(max(len(f["name"]) for f in fields))
```

```text
0
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    print(max(len(f["name"]) for f in fields))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: max() iterable argument is empty
```

Генератори як механізм, `yield`, `yield from` і конвеєри з кількох генераторів розібрані в m5-l02. Тут достатньо того, що generator expression це найкоротший спосіб їх отримати.

<!-- task: q2 -->

<!-- task: t4 -->

## Власний scope і walrus

Змінна циклу comprehension не виходить назовні. Звичайний `for` (m1-l06) перезаписує змінну з тим самим ім'ям і лишає її після циклу, а comprehension має власну область видимості: її `x` інша, ніж зовнішня. При цьому все, що визначено зовні, всередині видно, як у будь-якій вкладеній функції. Повна модель LEGB у m1-l08.

```python
x = "outer"
factor = 10
print([x * factor for x in range(3)])
print(x)

for x in range(3):
    pass
print(x)
```

```text
[0, 10, 20]
outer
2
```

> **Під капотом.** У Python 2 змінна list comprehension витікала, як у `for`. Python 3 компілював кожну comprehension у приховану функцію, звідси ізоляція. У 3.12 PEP 709 (PEP, Python Enhancement Proposal: офіційний документ, яким вносять зміни в мову) вбудував list, dict і set comprehension у код навколо без окремої функції, бо створення й виклик функції на кожну comprehension коштували часу; ізоляцію змінних зберегли вручну. Generator expression так і лишився окремою функцією, бо мусить призупинятися між елементами. Це видно в traceback: помилка в list comprehension не має окремого кадру, а в generator expression має кадр `<genexpr>`.

```python
values = [1, 0]
print([10 / v for v in values])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print([10 / v for v in values])
           ~~~^~~
ZeroDivisionError: division by zero
```

```python
values = [1, 0]
print(sum(10 / v for v in values))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(sum(10 / v for v in values))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 2, in <genexpr>
    print(sum(10 / v for v in values))
              ~~~^~~
ZeroDivisionError: division by zero
```

Типова незручність comprehension: значення, обчислене у фільтрі, потрібне й у виразі. Наївний запис викликає функцію двічі на кожен елемент, що пройшов фільтр. Для дешевих функцій це просто зайва робота, для функцій з побічними ефектами чи запитами це помилка.

```python
def parse_age(raw):
    print("parse", repr(raw))
    return int(raw) if raw.isdigit() else None

raw_ages = ["30", "x", "0"]
print([parse_age(r) for r in raw_ages if parse_age(r) is not None])
```

```text
parse '30'
parse '30'
parse 'x'
parse '0'
parse '0'
[30, 0]
```

Вихід дає вираз присвоєння `:=` (assignment expression; офіційна назва з PEP 572, а "walrus operator", оператор-морж, це прізвисько, яке вживає навіть офіційний "What's New in Python 3.8"). Він присвоює значення імені й повертає його в одному виразі, тому результат фільтра можна одразу використати у виразі зліва. Дужки навколо `(age := ...)` обов'язкові. Альтернатива без walrus це вкладений generator expression: внутрішній обчислює, зовнішній фільтрує.

```python live
def parse_age(raw):
    print("parse", repr(raw))
    return int(raw) if raw.isdigit() else None

raw_ages = ["30", "x", "0"]
print([age for r in raw_ages if (age := parse_age(r)) is not None])
print([age for age in (parse_age(r) for r in raw_ages) if age is not None])
```

```text
parse '30'
parse 'x'
parse '0'
[30, 0]
parse '30'
parse 'x'
parse '0'
[30, 0]
```

Зверніть увагу на `is not None` замість голої перевірки truthiness: `0` це валідний вік, а `if (age := parse_age(r))` його б відкинув (truthiness детально в m1-l03).

> **Пастка.** Ім'я, присвоєне через `:=` усередині comprehension, на відміну від змінної циклу, виходить назовні: PEP 572 навмисно прив'язує його до охопної функції чи модуля, щоб можна було дізнатися, на чому зупинився `any`. Після comprehension воно тримає останнє присвоєне значення, навіть якщо фільтр цей елемент відкинув. А перезаписати через `:=` саму змінну циклу заборонено.

```python
print([y for x in [1, 0, 2] if (y := x * 10)])
print(y)
print("x" in dir())
```

```text
[10, 20]
20
False
```

```python
print([(x := x + 1) for x in range(3)])
```

```text
  File "example.py", line 1
    print([(x := x + 1) for x in range(3)])
            ^
SyntaxError: assignment expression cannot rebind comprehension iteration variable 'x'
```

<!-- task: q3 -->

<!-- task: t5 -->

## Межа читабельності і швидкість

Comprehension будує значення, цикл виконує дії. Comprehension заради побічного ефекту, як `[print(x) for x in xs]` за аналогією з `xs.forEach(console.log)`, працює, але будує список з `None` і викидає його, а читач шукає, де цей список використовується. Для дій пишуть `for`.

```python
result = [print(name) for name in ["email", "phone"]]
print(result)
```

```text
email
phone
[None, None]
```

Comprehension перестає бути виграшем, коли її треба розбирати довше, ніж еквівалентний цикл. Сигнали: більше двох `for`, умовний вираз усередині умовного виразу, кілька фільтрів з різними змінними, потреба в `try` (інструкцію в вираз не вставити, m1-l11). Перший інструмент не повернення до `append`, а винесення виразу в іменовану функцію: comprehension лишається, а логіка отримує ім'я й тести. Довгу comprehension пишуть по рядку на кожну частину: тоді кожен `for` і `if` читається як рядок вкладеного циклу.

```python live
pages = [
    {"visible": True, "fields": [
        {"id": "full_name", "type": "text"},
        {"id": "email", "type": "email", "label": " E-mail "},
        {"id": "token", "type": "hidden"},
    ]},
    {"visible": False, "fields": [{"id": "promo_code", "type": "text"}]},
]

labels = [f["label"].strip() if f.get("label") else f["id"].replace("_", " ").title() if "_" in f["id"] else f["id"].title() for page in pages if page.get("visible", True) for f in page["fields"] if f["type"] != "hidden"]
print(labels)

def label_for(field: dict) -> str:
    if field.get("label"):
        return field["label"].strip()
    return field["id"].replace("_", " ").title()

labels = [
    label_for(f)
    for page in pages
    if page.get("visible", True)
    for f in page["fields"]
    if f["type"] != "hidden"
]
print(labels)
```

```text
['Full Name', 'E-mail']
['Full Name', 'E-mail']
```

Винесення у функцію заодно показало, що вкладений умовний вираз був зайвим: `replace` без підкреслень нічого не робить, і гілка `if "_" in f["id"]` дублює іншу. В однорядковому варіанті цього не видно, у функції видно одразу.

Щодо швидкості. List comprehension швидша за цикл з `append`, бо `append` у циклі це на кожній ітерації пошук атрибута `.append` і виклик методу, а comprehension компілюється в окрему інструкцію байткоду `LIST_APPEND` без пошуку й виклику. `map` з lambda повільніша за обидва, бо на кожен елемент викликає Python-функцію. `map` з функцією, написаною на C (`len`, `abs`, `int`), часто швидша за comprehension, бо весь цикл іде в C без виконання байткоду на кожен елемент. Але не завжди: `map(str, ...)` програє comprehension, причина нижче. Ось один запуск `timeit` на 10 000 елементах:

```python
import timeit

nums = list(range(10_000))
words = [str(n) for n in nums]

def loop_append():
    out = []
    for n in nums:
        out.append(n * 2)
    return out

cases = {
    "for + append": loop_append,
    "comprehension": lambda: [n * 2 for n in nums],
    "map + lambda": lambda: list(map(lambda n: n * 2, nums)),
    "comp len(w)": lambda: [len(w) for w in words],
    "map(len, ...)": lambda: list(map(len, words)),
    "comp str(n)": lambda: [str(n) for n in nums],
    "map(str, ...)": lambda: list(map(str, nums)),
    "join(list)": lambda: ",".join([w for w in words]),
    "join(genexpr)": lambda: ",".join(w for w in words),
}
for name, fn in cases.items():
    best = min(timeit.repeat(fn, number=200, repeat=5))
    print(f"{name:15} {best / 200 * 1e6:5.0f} µs")
```

На цій машині (Apple M1 Pro, CPython 3.12.12):

```text
for + append      222 µs
comprehension     190 µs
map + lambda      405 µs
comp len(w)       130 µs
map(len, ...)     113 µs
comp str(n)       396 µs
map(str, ...)     529 µs
join(list)        153 µs
join(genexpr)     269 µs
```

> **Під капотом.** CPython 3.12 переписує інструкції байткоду, що часто виконуються, на спеціалізовані варіанти під конкретний тип (specializing adaptive interpreter, офіційна назва з PEP 659). Виклик `str(n)` у comprehension стає `CALL_NO_KW_STR_1`, який одразу перетворює об'єкт на рядок. `map(str, nums)` натомість щоразу викликає тип `str` загальним шляхом створення об'єкта з розбором аргументів, і цей шлях дорожчий за всю економію на циклі. `len(w)` теж спеціалізується, але `map(len, ...)` викликає `len` напряму як C-функцію без створення об'єкта, тому там виграє `map`. Спеціалізацію видно в `dis` з `adaptive=True` після кількох прогонів.

```python
import dis

nums = list(range(100))

def as_strings():
    return [str(n) for n in nums]

def lengths():
    return [len(w) for w in ["ab"] * 100]

for _ in range(100):
    as_strings()
    lengths()
for fn in (as_strings, lengths):
    print([i.opname for i in dis.get_instructions(fn, adaptive=True) if i.opname.startswith("CALL")])
```

```text
['CALL_NO_KW_STR_1']
['CALL_NO_KW_LEN']
```

Висновок з цих чисел не "завжди пишіть `map`" і не "завжди comprehension". Між comprehension і `map` з вбудованою функцією різниця 10–40% в обидва боки, на мікросекундах, і вона змінюється між версіями інтерпретатора. Пишіть те, що читається; `map(lambda ...)` уникайте не через швидкість, а тому, що comprehension з тим самим виразом коротша. Якщо ділянка справді гаряча, міряйте `timeit` на своїх даних.

## Для капстоуну

Конфіг форми у FormBuilder це дерево елементів: кожен елемент має `type` і `name`, контейнери мають `children`, будь-який елемент може мати `visible_if` з умовою показу. Майже кожна перевірка конфігу починається з того, щоб розгорнути дерево в плаский список. Рекурсія плюс comprehension з двома `for` роблять це в один вираз: елемент, а за ним усі нащадки кожної дитини. Поле тут це елемент без `children`.

```python live
form = {
    "type": "form", "name": "signup", "children": [
        {"type": "section", "name": "contact", "children": [
            {"type": "email", "name": "email"},
            {"type": "checkbox", "name": "wants_call"},
            {"type": "phone", "name": "phone", "visible_if": {"wants_call": True}},
        ]},
        {"type": "select", "name": "plan"},
        {"type": "section", "name": "company_info", "visible_if": {"plan": "pro"}, "children": [
            {"type": "text", "name": "company"},
        ]},
    ],
}

def all_elements(element: dict) -> list[dict]:
    return [element] + [
        descendant
        for child in element.get("children", [])
        for descendant in all_elements(child)
    ]

elements = all_elements(form)
field_names = [el["name"] for el in elements if "children" not in el]
index = {el["name"]: el for el in elements}
conditions = {el["name"]: el["visible_if"] for el in elements if "visible_if" in el}

print(field_names)
print(index["phone"]["type"])
print(conditions)
```

```text
['email', 'wants_call', 'phone', 'plan', 'company']
phone
{'phone': {'wants_call': True}, 'company_info': {'plan': 'pro'}}
```

Три рядки після `all_elements` це три типові потреби бекенду: список полів для схеми відповідей, індекс за ім'ям для перевірки посилань і злиття відповіді з конфігом, словник умов для обчислення видимості. Зверніть увагу, що `company` у `conditions` не потрапило, хоча його секція умовна: умова контейнера успадковується, і плаский список про ієрархію вже нічого не знає. Таке успадкування вимагає передавати стан у рекурсію, це останнє завдання уроку.

> **Для капстоуну.** Індекс `{el["name"]: el ...}` мовчки затре елемент з повторюваним ім'ям, а для бекенду дубль імені поля означає дві відповіді в один ключ. Перед побудовою індексу перевіряйте унікальність: порівняння довжин ловить сам факт, `Counter` показує, які саме імена повторюються. У m2-l09 ця перевірка переїде у валідатор Pydantic-моделі, але вираз лишиться той самий.

```python
from collections import Counter

names = ["email", "phone", "email", "plan"]
index = {name: i for i, name in enumerate(names)}
print(len(index) == len(names))
print([name for name, count in Counter(names).items() if count > 1])
```

```text
False
['email']
```

<!-- task: t6 -->

## Типові помилки JS-розробника

1. **Ланцюжок `map` / `filter` з lambda.** Переносять `.filter(...).map(...)` буквально, і виходить вкладення викликів, яке читається зсередини назовні. Правильно: одна comprehension, де фільтр і вираз видно на своїх місцях.

   ```python
   names = list(map(lambda f: f["name"], filter(lambda f: f["required"], fields)))  # за звичкою
   names = [f["name"] for f in fields if f["required"]]                              # правильно
   ```

2. **`forEach` або цикл з `append` для побудови списку.** `const out = []; arr.forEach(x => out.push(...))` переходить у `for` з `append`. Працює, але намір "побудувати список" схований у механіці. Правильно: comprehension; цикл з `append` лишається для випадків з кількома кроками чи `try` у тілі.

   ```python
   upper = []
   for name in names:           # за звичкою
       upper.append(name.upper())
   upper = [name.upper() for name in names]  # правильно
   ```

3. **`Object.fromEntries(entries.map(...))` як `dict([...])`.** Будують список пар, щоб передати його в `dict`. Правильно: dict comprehension без проміжних пар; `dict(zip(keys, values))` лишається для двох готових паралельних списків.

   ```python
   types = dict([(f["name"], f["type"]) for f in fields])  # за звичкою
   types = {f["name"]: f["type"] for f in fields}          # правильно
   ```

4. **`reduce` для суми, підрахунку, пошуку максимуму.** `functools.reduce(lambda acc, f: acc + f["price"], items, 0)` це переклад `arr.reduce`, але для всіх таких згорток є готові функції з generator expression.

   ```python
   total = sum(item["price"] for item in items)
   required_count = sum(1 for f in fields if f["required"])
   longest = max((len(f["name"]) for f in fields), default=0)
   ```

5. **`reduce` для групування.** Акумулятор-об'єкт з `acc[key] ??= []` переносять як dict comprehension з вкладеним фільтром і отримують квадратичний прохід. Правильно: цикл з `defaultdict(list)` або `Counter` для підрахунку (m2-l04).

   ```python
   by_type = {t: [f["name"] for f in fields if f["type"] == t] for t in kinds}  # O(n * k)
   by_type = defaultdict(list)
   for f in fields:
       by_type[f["type"]].append(f["name"])
   ```

6. **Comprehension заради побічного ефекту.** `[save(f) for f in fields]` з інтуїції `fields.forEach(save)`. Будується й викидається список з `None`. Правильно: `for`.

   ```python
   [print(x) for x in xs]  # [None, None, ...]
   for x in xs:
       print(x)
   ```

7. **Матриця через множення списку.** `Array(m).fill(Array(n).fill(0))` у JS має ту саму пастку, і в Python `[[0] * n] * m` повторює її: усі рядки один об'єкт. Правильно: вкладена comprehension, яка створює кожен рядок заново.

   ```python
   grid = [[0] * 3] * 2                 # grid[0] is grid[1] -> True
   grid = [[0] * 3 for _ in range(2)]   # окремі рядки
   ```

8. **`{}` як порожня множина і очікування, що `map` поверне список.** `{}` це dict, порожня множина тільки `set()`. А `map` і `filter` повертають одноразові ітератори, як і generator expression: другий прохід порожній.

   ```python
   seen = {}            # dict, seen.add(...) -> AttributeError
   seen = set()         # правильно
   upper = map(str.upper, ["a", "b"])
   print(list(upper), list(upper))  # ['A', 'B'] []
   ```

## Підсумок

- `[expr for x in iterable if cond]` це цикл з `append`: `for` і `if` у порядку вкладених рядків, вираз переїхав на початок.
- `if` у кінці фільтрує і не має `else`; `a if c else b` на початку вибирає значення і без `else` не існує.
- Кілька `for` ідуть як вкладені цикли, перший зовнішній; другий `for` це `flatMap`, `flat()` не потрібен.
- `{k: v for ...}` будує словник без проміжних пар, `{x for ...}` множину; `{}` це dict, порожня множина `set()`.
- Dict comprehension мовчки перезаписує дублі ключів: інвертування й індекс перевіряйте на унікальність.
- `(x for ...)` це лінивий одноразовий генератор, а не кортеж; у єдиному аргументі дужки не потрібні, з другим аргументом обов'язкові.
- Агрегатори `sum`, `any`, `all`, `max(default=)`, `min`, `sorted` беруть generator expression; групування це `defaultdict` і `Counter`, а не comprehension.
- Змінна циклу comprehension не витікає назовні, зовнішні імена видно; ім'я з `:=` витікає.
- Walrus `(y := f(x))` у фільтрі прибирає подвійне обчислення; перевіряйте `is not None`, а не truthiness.
- Comprehension будує значення, цикл виконує дії; складний вираз виносьте у функцію, швидкість міряйте `timeit`, а не вгадуйте.

## Що далі

Наступний урок m1-l11 про винятки: `try / except / else / finally` і EAFP. Звідти стане зрозуміло, чому `parse_age` з цього уроку повертає `None`, а не кидає виняток: `try` це інструкція, і всередину comprehension його не вставити, тож перетворення з можливою помилкою загортають у функцію, а результат фільтрують через walrus. Generator expression як частина протоколу ітерації повернеться в m5-l02.
