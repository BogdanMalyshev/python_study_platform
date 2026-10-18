---
id: m2-l03
module: m2-data-typing
title: "Зрізи, розпакування, *rest"
summary: "Учень ріже будь-яку послідовність через start:stop:step, змінює список присвоєнням у зріз замість splice, передає зріз як об'єкт slice, розпаковує пари, вкладені структури й хвости через *rest, зливає списки й словники через * і ** і знає, чим замінити деструктуризацію об'єкта за ключами."
duration_min: 75
prerequisites: [m2-l02]
---

## Зріз працює однаково для всіх послідовностей

У m1-l04 зріз (slicing, офіційна назва операції) показано на рядках. Насправді це загальна операція над будь-якою послідовністю (sequence, офіційний термін з глосарію: тип з `len` і доступом за цілим індексом від нуля). Синтаксис один, `seq[start:stop:step]`, і він працює для `list`, `tuple`, `str`, `range` і `bytes`. Результат завжди того самого типу, що й оригінал: зріз кортежу це кортеж, зріз `range` це новий `range`, а не список.

```python live
items = ["header", "email", "phone", "age", "submit"]
print(items[1:4])
print(("a", "b", "c", "d")[1:3])
print("FormBuilder"[4:])
print(range(0, 100, 10)[2:5])
print(b"\x89PNG\r\n"[1:4])
```

```text
['email', 'phone', 'age']
('b', 'c')
Builder
range(20, 50, 10)
b'PNG'
```

Правила ті самі, що в `Array.prototype.slice`: `start` включно, `stop` ні, від'ємне число рахується з кінця. Python додає дві речі. Будь-яку межу можна пропустити, і тоді це початок або кінець послідовності. І є третій параметр, крок, якого в JS немає зовсім.

```ts
const items = ["header", "email", "phone", "age", "submit"];
items.slice(1, 4);                        // ["email", "phone", "age"]
items.slice(-2);                          // ["age", "submit"]
items.at(-1);                             // "submit"
items[-1];                                // undefined
items.filter((_, i) => i % 2 === 0);      // кроку в slice немає
[...items].reverse();                     // reverse() мутує, тому спершу копія
```

```python
items = ["header", "email", "phone", "age", "submit"]
print(items[1:4])
print(items[-2:])
print(items[-1])
print(items[::2])
print(items[::-1])
print(items[1:-1])
```

```text
['email', 'phone', 'age']
['age', 'submit']
submit
['header', 'phone', 'submit']
['submit', 'age', 'phone', 'email', 'header']
['email', 'phone', 'age']
```

Розходжень три. Від'ємний індекс рідний для `[]`, тому окремий `at()` не потрібен. Крок замінює `filter` по індексу. А `[::-1]` повертає новий розвернутий список і не чіпає оригінал, тоді як `reverse()` у JS мутує масив; у Python `list.reverse()` теж мутує, а зріз ні.

Від'ємний крок іде з кінця, і пропущені межі тоді міняють зміст: пропущений `start` означає останній елемент, пропущений `stop` означає "до самого початку включно". Межі все одно пишуться в порядку обходу, тобто `start` більший за `stop`, інакше результат порожній. `stop` і тут не входить.

```python live
digits = list(range(10))
print(digits[::3])
print(digits[1::2])
print(digits[7:2:-1])
print(digits[2:7:-1])
print(digits[-1:-4:-1])
print(digits[::-2])
```

```text
[0, 3, 6, 9]
[1, 3, 5, 7, 9]
[7, 6, 5, 4, 3]
[]
[9, 8, 7]
[9, 7, 5, 3, 1]
```

Зріз ніколи не кидає виняток через межі, а індекс кидає. Зріз повертає "усі елементи, чиї позиції потрапили в діапазон", тому межі за довжиною просто обрізаються, а порожній діапазон дає порожню послідовність. Індекс обіцяє рівно один елемент, і замість `undefined` Python кидає `IndexError` (той самий механізм для рядків розібраний у m1-l04). Єдина помилка, яку можна отримати від самого зрізу, це нульовий крок.

```python
items = ["header", "email", "phone"]
print(items[1:100])
print(items[100:])
print(items[::0])
```

```text
['email', 'phone']
[]
Traceback (most recent call last):
  File "example.py", line 4, in <module>
    print(items[::0])
          ~~~~~^^^^^
ValueError: slice step cannot be zero
```

```python
items = ["header", "email", "phone"]
print(items[100])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(items[100])
          ~~~~~^^^^^
IndexError: list index out of range
```

> **Пастка.** У JS `arr.slice(-1)[0]` пишуть як безпечне "останній або `undefined`". У Python `items[-1]` на порожньому списку дає `IndexError`, а `items[-1:]` дає `[]`, і `[0]` від нього знову `IndexError`. Безпечне "останній або `None`" пишеться явно: `items[-1] if items else None`. І пам'ятайте з m1-l04, що `items[-k:]` при `k == 0` повертає весь список, бо `-0` це `0`.

```python
empty: list[str] = []
print(empty[-1:])
print(empty[-1] if empty else None)
print([1, 2, 3][-0:])
```

```text
[]
None
[1, 2, 3]
```

<!-- task: t1 -->

## Читання зрізу копіює, запис у зріз змінює на місці

Зріз списку створює новий список. Змінювати його можна як завгодно, оригінал цього не побачить. Копія поверхнева (shallow copy, офіційний термін з документації модуля `copy`): новий лише сам список, а елементи ті самі об'єкти, тому `items[:]` це ідіоматична поверхнева копія, як `[...arr]` у JS (детально про shallow і deep copy в m2-l02).

```python live
items = ["email", "phone", "age"]
part = items[:2]
part[0] = "EMAIL"
part.append("extra")
print(items)
print(part)
print(items[:] == items, items[:] is items)

fields = [{"id": "email"}, {"id": "phone"}]
first = fields[:1]
first[0]["id"] = "EMAIL"
print(fields)
```

```text
['email', 'phone', 'age']
['EMAIL', 'phone', 'extra']
True False
[{'id': 'EMAIL'}, {'id': 'phone'}]
```

Для `list`, `tuple`, `str`, `range` і `bytes` зріз ніколи не буває view (так у документації називають об'єкт, що дивиться на чужі дані без копії, як `dict.keys()`). Винятки свідомо поза стандартними колекціями: `memoryview` над `bytes`/`bytearray` і масиви NumPy, де зріз саме view і запис у нього змінює оригінал.

```python
data = bytearray(b"hello")
view = memoryview(data)[1:3]
view[0] = ord("E")
print(data)
```

```text
bytearray(b'hEllo')
```

> **Під капотом.** Для незмінних типів CPython іноді не копіює зовсім: повний зріз кортежу чи рядка повертає той самий об'єкт, бо змінити його все одно неможливо і різницю не видно. Для списку копія створюється завжди. Тому `is` на зрізах нічого не гарантує, і порівнювати їх треба через `==`.

```python
t = (1, 2, 3)
s = "FormBuilder"
lst = [1, 2, 3]
print(t[:] is t, s[:] is s, lst[:] is lst)
```

```text
True True False
```

Ліворуч від `=` зріз означає інше: "заміни цю ділянку списку елементами з правої частини". Довжини не мусять збігатися, список росте або стискається, а всі імена, що дивляться на цей список, бачать зміну. Це `splice` з JS, розписаний через синтаксис.

```ts
const items = ["a", "b", "c", "d"];
items.splice(1, 2, "X", "Y", "Z");   // замінити 2 елементи трьома
items.splice(1, 0, "new");           // вставка без видалення
items.splice(1, 2);                  // видалення, повертає видалене
```

```python
items = ["a", "b", "c", "d"]
items[1:3] = ["X", "Y", "Z"]
print(items)
items[1:1] = ["new"]
print(items)
removed = items[1:3]
items[1:3] = []
print(items, removed)
```

```text
['a', 'X', 'Y', 'Z', 'd']
['a', 'new', 'X', 'Y', 'Z', 'd']
['a', 'Y', 'Z', 'd'] ['new', 'X']
```

Різниця в тому, що `splice` це метод з результатом, а присвоєння в зріз це інструкція (statement) без значення. Видалене, якщо воно потрібне, спершу читають тим самим зрізом. Права частина може бути будь-яким iterable (офіційний термін з глосарію: об'єкт, що віддає елементи по одному), і вона спершу перетворюється на список. Звідси пастка з рядком.

> **Пастка.** `items[1:2] = "ab"` не вставляє рядок, а вставляє його символи, бо рядок це iterable символів. Щоб вставити рядок як один елемент, загорніть його в список.

```python
items = ["a", "b", "c"]
items[1:2] = "XY"
print(items)
items[1:3] = ["XY"]
print(items)
```

```text
['a', 'X', 'Y', 'c']
['a', 'XY', 'c']
```

`items[:] = []` і `items = []` виглядають однаково, але роблять протилежне. Друге створює новий порожній список і перев'язує ім'я; старий список нікуди не дівся, і всі інші посилання на нього бачать старі дані. Перше очищає той самий об'єкт, і зміну бачать усі. Те саме роблять `items.clear()` і `del items[:]`. Різниця важлива скрізь, де список спільний: реєстр, кеш, аргумент функції (aliasing, m2-l02).

```python live
fields = ["email", "phone"]
alias = fields
fields = []
print(fields, alias)

fields = ["email", "phone"]
alias = fields
fields[:] = []
print(fields, alias)

fields = ["email", "phone"]
alias = fields
fields[:] = ["age"]
print(alias, alias is fields)
```

```text
[] ['email', 'phone']
[] []
['age'] True
```

`del` зі зрізом видаляє ділянку, і крок тут теж працює: `del items[::2]` прибирає кожен другий елемент на місці. Присвоєння в зріз з кроком (extended slice, офіційна назва з документації) суворіше за звичайне: замінити можна лише стільки елементів, скільки зріз вибрав, бо інакше незрозуміло, куди ставити зайві.

```python
items = list(range(8))
del items[::2]
print(items)
items[::2] = ["a", "b"]
print(items)
items[::2] = ["only one"]
```

```text
[1, 3, 5, 7]
['a', 3, 'b', 7]
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    items[::2] = ["only one"]
    ~~~~~^^^^^
ValueError: attempt to assign sequence of size 1 to extended slice of size 2
```

Кортеж, рядок, `range` і `bytes` незмінні, тож присвоєння в зріз для них не існує. "Змінений" кортеж збирають заново зі зрізів і конкатенації.

```python
row = ("email", "text", False)
row = row[:2] + (True,)
print(row)
row[2:] = (False,)
```

```text
('email', 'text', True)
Traceback (most recent call last):
  File "example.py", line 4, in <module>
    row[2:] = (False,)
    ~~~^^^^
TypeError: 'tuple' object does not support item assignment
```

<!-- task: q1 -->

## Об'єкт `slice`: зріз як значення

Запис `items[1:3]` це синтаксичний цукор для `items[slice(1, 3)]`. `slice` це звичайний вбудований тип з трьома атрибутами `start`, `stop`, `step`; пропущена межа зберігається як `None`. Його можна покласти в змінну, передати у функцію, повернути з функції.

```python live
s = slice(1, 3)
print(s, s.start, s.stop, s.step)
items = ["header", "email", "phone", "age"]
print(items[s], "FormBuilder"[s])
reverse = slice(None, None, -1)
print(items[reverse])
```

```text
slice(1, 3, None) 1 3 None
['email', 'phone'] or
['age', 'phone', 'email', 'header']
```

Навіщо це в коді. Перше: іменовані зрізи для форматів з фіксованими позиціями, де магічні числа в квадратних дужках не читаються. Друге: передача "якої частини" параметром, коли функції потрібен не діапазон індексів, а будь-який зріз, включно з кроком. В обох випадках `slice` замінює пару чи трійку окремих чисел одним значенням з назвою.

```python
record = "email     text      required"
FIELD_ID = slice(0, 10)
FIELD_TYPE = slice(10, 20)
FLAGS = slice(20, None)
print(record[FIELD_ID].strip(), record[FIELD_TYPE].strip(), record[FLAGS])


def take(items: list[str], window: slice = slice(None)) -> list[str]:
    return items[window]


items = ["header", "email", "phone", "age", "submit"]
print(take(items, slice(1, 3)))
print(take(items, slice(None, None, 2)))
print(take(items))
```

```text
email text required
['email', 'phone']
['header', 'phone', 'submit']
['header', 'email', 'phone', 'age', 'submit']
```

Метод `s.indices(length)` переводить зріз у конкретні числа для послідовності заданої довжини: підставляє значення замість `None`, перераховує від'ємні межі від кінця й обрізає все, що виходить за довжину. Результат це трійка `(start, stop, step)`, яку можна віддати в `range`, щоб отримати рівно ті індекси, які вибере зріз. Так пишуть власні структури зі зрізами або нормалізують "від'ємний індекс як у JS" без ручних `if`.

```python live
print(slice(-3, None).indices(10))
print(list(range(*slice(-3, None).indices(10))))
print(slice(1, 100).indices(5))
print(slice(-100, 2).indices(5))
print(slice(None, None, -1).indices(5))
```

```text
(7, 10, 1)
[7, 8, 9]
(1, 5, 1)
(0, 2, 1)
(4, -1, -1)
```

> **Пастка.** Трійка з `indices` призначена для `range`, а не для нового зрізу. Для від'ємного кроку `stop` стає `-1`, що в `range` означає "до нуля включно", а в зрізі означає "останній елемент". Підставлена назад у квадратні дужки, вона дає порожній результат.

```python
items = ["a", "b", "c", "d", "e"]
start, stop, step = slice(None, None, -1).indices(len(items))
print(items[start:stop:step])
print([items[i] for i in range(start, stop, step)])
```

```text
[]
['e', 'd', 'c', 'b', 'a']
```

Власний клас отримує зріз так само: `obj[1:3]` викликає спеціальний метод `__getitem__` (dunder-метод, жаргон спільноти від double underscore; офіційно special method) з об'єктом `slice` як ключем, і клас сам вирішує, що з ним робити (детально в m4-l02). Звідси ж обмеження: зріз працює лише там, де `__getitem__` його розуміє. Генератор чи ітератор зрізу не підтримує, для них є `itertools.islice` (m5-l03).

```python
class Probe:
    def __getitem__(self, key):
        return key


p = Probe()
print(p[2])
print(p[1:3])
print(p[::-1])

squares = (n * n for n in range(10))
print(squares[:3])
```

```text
2
slice(1, 3, None)
slice(None, None, -1)
Traceback (most recent call last):
  File "example.py", line 12, in <module>
    print(squares[:3])
          ~~~~~~~^^^^
TypeError: 'generator' object is not subscriptable
```

<!-- task: t2 -->

## Розпакування: кілька імен ліворуч від `=`

Розпакування (iterable unpacking, офіційний термін) коротко було в m1-l01: кілька імен ліворуч, будь-який iterable праворуч, кількість мусить збігатися точно. Праворуч може стояти кортеж, список, рядок, `range`, генератор. Ліворуч імена можуть бути вкладеними, і тоді структура зліва повторює структуру справа.

```python live
pair = ("email", "text")
field_id, field_type = pair
print(field_id, field_type)

a, b, c = "xyz"
print(a, b, c)

low, high = range(2)
print(low, high)

(field_id, field_type), required = ("email", "text"), True
print(field_id, field_type, required)
```

```text
email text
x y z
0 1
email text True
```

```ts
const [id, type] = ["email", "text"];
const [[x, y], flag] = [["email", "text"], true];
const [a, b] = [1, 2, 3];        // 3 мовчки відкинуто
const [p, q, r] = [1, 2];        // r === undefined
```

```python
a, b = [1, 2, 3]
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    a, b = [1, 2, 3]
    ^^^^
ValueError: too many values to unpack (expected 2)
```

Деструктуризація масиву в JS толерантна до довжини: зайве відкидається, відсутнє стає `undefined`. Python не вгадує, будь-яка розбіжність це `ValueError` у момент присвоєння, і повідомлення каже, в який бік: `too many values` або `not enough values` з очікуваною і фактичною кількістю. Для даних ззовні це перевага: зламаний рядок CSV чи кортеж іншої форми падає одразу, а не тягне `undefined` далі.

```python
p, q, r = [1, 2]
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    p, q, r = [1, 2]
    ^^^^^^^
ValueError: not enough values to unpack (expected 3, got 2)
```

Дужки ліворуч не обов'язкові, бо кортеж утворює кома, а не дужки. Ліворуч від `=` граматика допускає список цілей через кому, і `a, b`, `(a, b)`, `[a, b]` означають одне й те саме; дужки потрібні лише для вкладеності. Розпакування одного елемента пишеться з кінцевою комою, і цю кому легко не помітити на рев'ю, тому `[value] = ...` читається краще.

```python
a, b = 1, 2
(a, b) = (1, 2)
[a, b] = [1, 2]
print(a, b)

row = 1, 2
print(type(row), row)

value, = ["only"]
[value] = ["only"]
print(value)
```

```text
1 2
<class 'tuple'> (1, 2)
only
```

Обмін `a, b = b, a` працює без тимчасової змінної, бо права частина обчислюється повністю, перш ніж ліва почне прив'язуватись (як CPython робить це без кортежу, показано в m1-l01). Те саме працює для елементів списку. Порядок прив'язки зліва направо, і це видно, коли пізніша ціль залежить від ранішої.

```python live
a, b = "left", "right"
a, b = b, a
print(a, b)

items = ["a", "b", "c"]
items[0], items[-1] = items[-1], items[0]
print(items)

i = 0
i, items[i] = 2, "X"
print(i, items)
```

```text
right left
['c', 'b', 'a']
2 ['c', 'b', 'X']
```

> **Під капотом.** В останньому присвоєнні права частина `(2, "X")` обчислена до будь-якої прив'язки, але ліві цілі обробляються по черзі: спершу `i = 2`, потім `items[i] = "X"` уже з новим `i`. Тому змінився третій елемент, а не перший. Писати так не варто, але ця механіка пояснює, чому обмін `items[i], items[j] = items[j], items[i]` безпечний: індекси там не змінюються посередині.

## Зірочка в присвоєнні: `*rest` будь-де і `_` для непотрібного

Ім'я із зірочкою ліворуч (starred target, офіційний термін граматики; сама можливість прийшла з PEP 3132 "Extended Iterable Unpacking") забирає все, що не дісталося звичайним іменам. Це rest-елемент з деструктуризації JS, з однією суттєвою різницею: зірочка може стояти будь-де, а не лише в кінці.

```ts
const items = ["header", "email", "phone", "submit"];
const [first, ...rest] = items;
// const [...init, last] = items;   // SyntaxError: Rest element must be last element
const init = items.slice(0, -1);
const last = items.at(-1);
```

```python
items = ["header", "email", "phone", "submit"]
first, *rest = items
print(first, rest)
*init, last = items
print(init, last)
head, *middle, tail = items
print(head, middle, tail)
```

```text
header ['email', 'phone', 'submit']
['header', 'email', 'phone'] submit
header ['email', 'phone'] submit
```

Ім'я із зірочкою завжди отримує список, навіть якщо праворуч кортеж, рядок чи `range`. Якщо на нього нічого не лишилося, це `[]`, а не помилка. Помилка буде, коли не вистачає на звичайні імена: `head, *middle, tail` вимагає хоча б двох елементів, і повідомлення каже `expected at least`.

```python live
first, *rest = ("only",)
print(first, rest)

*chars, last = "abc"
print(chars, last)

head, *middle, tail = range(5)
print(head, middle, tail)
```

```text
only []
['a', 'b'] c
0 [1, 2, 3] 4
```

```python
head, *middle, tail = ["only"]
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    head, *middle, tail = ["only"]
    ^^^^^^^^^^^^^^^^^^^
ValueError: not enough values to unpack (expected at least 2, got 1)
```

Зірочка в присвоєнні одна на рівень вкладеності: дві зірочки на одному рівні неоднозначні, бо невідомо, як поділити елементи між ними. Зірочка сама по собі теж заборонена, бо це просто `list(items)`, записаний загадково. Обидва випадки це `SyntaxError` ще до виконання, тому нижче рядки лише компілюються через `compile`.

```python
sources = [
    "first, *mid, *rest = items",
    "*rest = items",
    "*rest, = items",
    "(a, *b), *c = items",
]
for src in sources:
    try:
        compile(src, "example.py", "exec")
        print(f"{src:28} ok")
    except SyntaxError as e:
        print(f"{src:28} {e.msg}")
```

```text
first, *mid, *rest = items   multiple starred expressions in assignment
*rest = items                starred assignment target must be in a list or tuple
*rest, = items               ok
(a, *b), *c = items          ok
```

Для значень, які не потрібні, є конвенція `_`. Це не синтаксис, а звичайне ім'я, яке домовились читати як "мені це не потрібно", і рев'ювер не шукає, де воно використовується далі. `*_` викидає довільну кількість елементів. У межах одного присвоєння `_` можна повторювати, і в ній лишається останнє прив'язане значення.

```python live
row = ("email", "text", True, "Email", "you@example.com")
field_id, field_type, *_ = row
print(field_id, field_type)

_, _, required, *_ = row
print(required)
print(_)
```

```text
email text
True
['Email', 'you@example.com']
```

> **Пастка.** У трьох місцях `_` уже зайняте. В інтерактивному REPL `_` автоматично зберігає результат останнього виразу, і якщо ви присвоїли `_` самі, ця автоматика перестає працювати до `del _`. У коді з інтернаціоналізацією `_` за конвенцією це функція перекладу з `gettext`, і `_, x = pair` її затре. А в `match` `case _` це wildcard-патерн (офіційний термін), який нічого не прив'язує взагалі, на відміну від `_` у присвоєнні (m1-l05).

```text
>>> 1 + 1
2
>>> _
2
>>> _ = "ignored"
>>> 2 + 2
4
>>> _
'ignored'
```

<!-- task: q2 -->

<!-- task: t3 -->

## Зірочка у виклику й у літералах: spread

При виклику `f(*args)` розгортає iterable в позиційні аргументи, `f(**kwargs)` розгортає словник в іменовані; це розібрано в m1-l07. Та сама зірочка працює всередині літералів списку, кортежу, множини й словника (PEP 448 "Additional Unpacking Generalizations"; у розмові це просто spread, як у JS). Це прямий аналог `[...a, ...b]` і `{...a, ...b}`.

```ts
const defaults = ["email", "phone"];
const extra = ["age"];
const ids = [...defaults, ...extra, "submit"];
const theme = { color: "black", font: "Inter" };
const style = { ...theme, color: "red" };
const style2 = Object.assign({}, theme, { color: "red" });
```

```python
defaults = ["email", "phone"]
extra = ("age",)
print([*defaults, *extra, "submit"])
print((*defaults, *extra))
print(sorted({*defaults, *extra, "email"}))

theme = {"color": "black", "font": "Inter"}
print({**theme, "color": "red"})
print(theme | {"color": "red"})
```

```text
['email', 'phone', 'age', 'submit']
('email', 'phone', 'age')
['age', 'email', 'phone']
{'color': 'red', 'font': 'Inter'}
{'color': 'red', 'font': 'Inter'}
```

Розходжень два. `*` приймає будь-який iterable, тому розгортаються й кортежі, й `range`, й генератори, і рядок розсипається на символи, як `[..."ab"]` у JS. А `**` приймає лише mapping (офіційний термін з глосарію: об'єкт з доступом за ключем, найчастіше `dict`). JS дозволяє `{..."ab"}` і отримує `{0: "a", 1: "b"}`; Python відмовляється, і список пар теж не пройде, його спершу перетворюють через `dict(pairs)`. Для злиття двох словників з 3.9 є ще оператор `|`, а `|=` зливає на місці.

```python live
print([*"ab", *range(3)])

theme = {"color": "black", "font": "Inter", "size": 14}
override = {"size": 16, "color": "red"}
print({**theme, **override})
print({**override, **theme})

theme_copy = dict(theme)
theme_copy |= override
print(theme_copy)
```

```text
['a', 'b', 0, 1, 2]
{'color': 'red', 'font': 'Inter', 'size': 16}
{'size': 14, 'color': 'black', 'font': 'Inter'}
{'color': 'red', 'font': 'Inter', 'size': 16}
```

Порядок ключів у результаті злиття часто дивує: позицію ключа задає перша поява, а значення останнє. У `{**theme, **override}` ключ `color` лишився першим, хоча значення прийшло з `override`. JS поводиться так само для рядкових ключів, тож це не розходження, а нагадування, що порядок у dict стабільний і передбачуваний (m2-l01). Спроба розгорнути через `**` список пар, який у JS спершу пройшов би через `Object.fromEntries`, падає з прямим повідомленням.

```python
pairs = [("color", "red")]
style = {**pairs}
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    style = {**pairs}
            ^^^^^^^^^
TypeError: 'list' object is not a mapping
```

Обмеження на кількість зірочок діє лише в присвоєнні. У виклику й у літералах їх скільки завгодно, у будь-якому порядку зі звичайними значеннями. У виклику є одне додаткове правило з m1-l07: той самий іменований аргумент двічі через `**` це `TypeError`, а в літералі словника пізніший ключ просто перемагає.

```python
first_page = ["email", "phone"]
second_page = ("age",)
print(*first_page, *second_page, "submit", sep=" | ")
print(max(*[3, 9], *(4, 1), 7))
```

```text
email | phone | age | submit
9
```

> **Пастка.** Spread копіює один рівень, як і в JS. Вкладений словник у результаті злиття це той самий об'єкт, що в оригіналі, і зміна через злитий словник зіпсує тему. Глибокого злиття в стандартній бібліотеці немає: або рекурсивна функція, або `copy.deepcopy` перед злиттям (m2-l02).

```python
theme = {"color": "black", "spacing": {"top": 8, "bottom": 8}}
merged = {**theme, "color": "red"}
print(merged["spacing"] is theme["spacing"])
merged["spacing"]["top"] = 0
print(theme)
```

```text
True
{'color': 'black', 'spacing': {'top': 0, 'bottom': 8}}
```

<!-- task: q3 -->

<!-- task: t4 -->

## Словники: розпакування без деструктуризації за ключами

У Python немає `const { a, b } = obj`. Розпакування позиційне: воно бере елементи з iterable по черзі, а ітерація словника віддає ключі. Тому присвоєння `a, b = config` синтаксично коректне, працює без помилки і прив'язує імена ключів, а не значення. На словнику з іншою кількістю ключів воно впаде з `ValueError`, на словнику з тією самою кількістю мовчки дасть не те.

```python
config = {"id": "email", "type": "text"}
a, b = config
print(a, b)
```

```text
id type
```

Чому немає синтаксису для ключів: `{a, b}` у Python вже означає множину, а словник не простір імен з атрибутами, як об'єкт у JS. Найближча заміна це звичайні звернення за ключем, `dict.get` для значень за замовчуванням і `operator.itemgetter`, який дістає кілька ключів одним викликом.

```ts
const { id, type } = config;
const { label = "Untitled", ...rest } = config;
```

```python
from operator import itemgetter

config = {"id": "email", "type": "text", "required": True}
field_id, field_type = config["id"], config["type"]
label = config.get("label", "Untitled")
rest = {k: v for k, v in config.items() if k not in {"id", "type"}}
print(field_id, field_type, label, rest)

field_id, field_type = itemgetter("id", "type")(config)
print(field_id, field_type)
print(itemgetter("id")(config))
[field_id] = itemgetter("id")(config)
```

```text
email text Untitled {'required': True}
email text
email
Traceback (most recent call last):
  File "example.py", line 12, in <module>
    [field_id] = itemgetter("id")(config)
    ^^^^^^^^^^
ValueError: too many values to unpack (expected 1)
```

Тут три розбіжності з JS. Відсутній ключ дає `KeyError`, а не `undefined`, тому необов'язкові поля читають через `.get`. `itemgetter` з одним ключем повертає саме значення, а не кортеж з одного елемента, тому `[field_id] = itemgetter("id")(config)` намагається розпакувати рядок посимвольно й падає. Деструктуризацію разом з перевіркою форми, найближчу до `{ id, ...rest }`, дає патерн словника в `match` з `**rest` (m1-l05).

```python
config = {"id": "email", "type": "text", "required": True}
match config:
    case {"id": field_id, "type": field_type, **rest}:
        print(field_id, field_type, rest)
```

```text
email text {'required': True}
```

Звичайне розпакування зі словником працює через пари. `d.items()` віддає кортежі `(key, value)`, і їх розпаковують у заголовку `for`. Зворотний напрям, словник з двох паралельних списків, це `dict(zip(keys, values))`, бо `dict` приймає iterable пар. Словник з рівно одним ключем розпаковують через `(key, value), = d.items()`, і це заодно перевірка, що ключ справді один.

```python live
answers = {"email": "a@b.c", "age": 30}
for key, value in answers.items():
    print(f"{key}={value!r}")

keys = ["id", "type", "required"]
row = ["email", "text", True]
print(dict(zip(keys, row, strict=True)))

(only_key, only_value), = {"theme": "dark"}.items()
print(only_key, only_value)
```

```text
email='a@b.c'
age=30
{'id': 'email', 'type': 'text', 'required': True}
theme dark
```

Розпакування працює в кожному місці, де Python прив'язує імена: у заголовку `for` (детально з `enumerate` і `zip` у m1-l06), у `for` всередині comprehension, і в патернах `match`, де воно ще й перевіряє форму (m1-l05). Зірочка дозволена в усіх трьох.

```python live
pairs = [("email", "a@b.c"), ("age", 30)]
for i, (name, value) in enumerate(pairs, start=1):
    print(i, name, value)

print({name: value for name, value in pairs})
print([f"{first}..{last}" for first, *_, last in [[1, 2, 3], [4, 5]]])

for event in [("click", "submit"), ("input", "email", "a", "b"), ("blur",)]:
    match event:
        case ("click", target):
            print("click on", target)
        case ("input", field, *chunks):
            print("input into", field, chunks)
        case (kind, *_):
            print("other:", kind)
```

```text
1 email a@b.c
2 age 30
{'email': 'a@b.c', 'age': 30}
['1..3', '4..5']
click on submit
input into email ['a', 'b']
other: blur
```

<!-- task: q4 -->

## Для капстоуну

У бекенді FormBuilder три місця, де зрізи й розпакування закривають задачу без допоміжних функцій. Рендер першого екрана: перші кілька елементів сторінки рендеряться одразу, решта ліниво. Стиль елемента: тема форми плюс локальні overrides елемента, де пізніше перемагає. Пагінація: довгий список елементів у редакторі чи в API віддається сторінками.

```python
theme = {"color": "black", "font": "Inter", "size": 14}
elements = [
    {"id": "hero", "type": "block"},
    {"id": "email", "type": "input", "style": {"color": "red"}},
    {"id": "phone", "type": "input"},
    {"id": "age", "type": "input", "style": {"size": 12}},
    {"id": "submit", "type": "button"},
]

hero, *rest = elements
print(hero["id"], [e["id"] for e in rest])

first_screen, below_fold = elements[:2], elements[2:]
print([e["id"] for e in first_screen], [e["id"] for e in below_fold])

for element in elements[:2]:
    style = {**theme, **element.get("style", {})}
    print(element["id"], style)

page_size = 2
for page_no, start in enumerate(range(0, len(elements), page_size), start=1):
    page = elements[start:start + page_size]
    print(page_no, [e["id"] for e in page])
```

```text
hero ['email', 'phone', 'age', 'submit']
['hero', 'email'] ['phone', 'age', 'submit']
hero {'color': 'black', 'font': 'Inter', 'size': 14}
email {'color': 'red', 'font': 'Inter', 'size': 14}
1 ['hero', 'email']
2 ['phone', 'age']
3 ['submit']
```

> **Для капстоуну.** Конфіг приходить з API, і довжину списку ніхто не гарантує. `hero, *rest = elements` на порожньому списку кидає `ValueError`, а зріз `elements[:1]` повертає `[]`. На межі API беріть зрізи, які не падають, або перевіряйте форму явно; коли з'явиться Pydantic-модель (m2-l09), мінімальну довжину перевірить вона. А злиття теми робіть новим словником, а не `theme.update(...)`: тема одна на всю форму, і мутація з першого елемента протече в усі наступні.

```python
elements: list[dict] = []
print(elements[:1], elements[1:])
hero, *rest = elements
```

```text
[] []
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    hero, *rest = elements
    ^^^^^^^^^^^
ValueError: not enough values to unpack (expected at least 1, got 0)
```

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **`arr.slice(-1)[0]` замість `items[-1]`.** Переносять "безпечний останній" з JS. У Python `items[-1:][0]` на порожньому списку падає так само, як `items[-1]`, тож безпеки не додає, лише шум. Правильно: `items[-1]`, а якщо список може бути порожнім, явно.

   ```python
   last = items[-1]                         # непорожній список
   last = items[-1] if items else None      # може бути порожнім
   ```

2. **`const { a, b } = obj` як `a, b = obj`.** Присвоєння проходить без помилки і дає ключі, а не значення. Правильно: звернення за ключем або `itemgetter`.

   ```python
   from operator import itemgetter

   config = {"id": "email", "type": "text"}
   a, b = config                               # a == "id", b == "type"
   a, b = config["id"], config["type"]         # a == "email", b == "text"
   a, b = itemgetter("id", "type")(config)     # те саме
   ```

3. **Rest лише в кінці.** Звичка з `[a, ...rest]` змушує вручну вирізати середину й кінець. Правильно: зірочка там, де потрібна.

   ```python
   head, middle, tail = items[0], items[1:-1], items[-1]   # за звичкою
   head, *middle, tail = items                             # правильно
   ```

4. **`Object.assign` як `dict.update` з присвоєнням результату.** `Object.assign(target, src)` повертає `target`, а `dict.update` повертає `None`, і ще й мутує тему. Правильно: новий словник через `{**a, **b}` або `a | b`.

   ```python
   style = theme.update(override)     # style is None, theme змінено
   style = {**theme, **override}      # новий словник, theme цілий
   style = theme | override           # те саме з 3.9
   ```

5. **Відсутність кроку.** Пишуть `filter` по індексу або `reverse()` з присвоєнням. `list.reverse()` мутує й повертає `None`, як `sort()` (m1-l07). Правильно: крок у зрізі.

   ```python
   evens = [x for i, x in enumerate(items) if i % 2 == 0]   # за звичкою
   evens = items[::2]                                       # правильно
   backwards = items.reverse()                              # None
   backwards = items[::-1]                                  # новий список
   ```

6. **Очікування, що зріз це view.** Як `subarray` у TypedArray, зріз списку здається вікном в оригінал. Насправді це копія, і сортування чи зміна зрізу оригіналу не торкаються. Правильно: присвоєння в зріз.

   ```python
   items = [3, 1, 2, 0]
   items[:3].sort()                   # сортує копію, items без змін
   items[:3] = sorted(items[:3])      # items == [1, 2, 3, 0]
   ```

7. **`items = []` для очищення спільного списку.** Ім'я перев'язується, а інші посилання бачать старі дані. Правильно: `items[:] = []` або `items.clear()`.

   ```python
   registry = ["email"]
   alias = registry
   registry = []          # alias == ["email"]
   registry = alias
   registry.clear()       # alias == []
   ```

## Підсумок

- `seq[start:stop:step]` однаковий для `list`, `tuple`, `str`, `range`, `bytes` і повертає той самий тип; `stop` не входить.
- Від'ємний індекс рідний; від'ємний крок обходить з кінця, `[::-1]` дає нову розвернуту копію.
- Зріз за межами ніколи не падає, індекс падає `IndexError`; нульовий крок це `ValueError`.
- Читання зрізу списку це поверхнева копія, не view; view дають лише `memoryview` і NumPy.
- Присвоєння в зріз це `splice`: змінює довжину й працює на місці; `items[:] = []` очищає спільний список, `items = []` ні.
- `slice(start, stop, step)` це значення: іменовані зрізи, зріз як параметр, `indices(len)` для `range`.
- Розпакування вимагає точної кількості, інакше `ValueError`; кортеж утворює кома, дужки лише для вкладеності.
- `*rest` будь-де, завжди `list`, одна зірочка на рівень; `_` і `*_` для непотрібного.
- `*` і `**` у виклику й літералах скільки завгодно; `**` лише для mapping; злиття однорівневе, пізніший ключ перемагає.
- Деструктуризації словника за ключами немає: `a, b = d` дає ключі; беріть `d["a"]`, `.get`, `itemgetter` або `match` з `**rest`.

## Що далі

Наступний урок m2-l04 про модуль `collections`. `namedtuple` там розпаковується так само, як кортеж з цього уроку, `deque` підтримує індекси, але не зрізи, а `ChainMap` дає шари теми й overrides без злиття через `{**a, **b}`. Об'єкт `slice` повернеться в m4-l02, де `__getitem__` власного класу сам розбиратиме зрізи.
