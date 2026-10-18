---
id: m1-l06
module: m1-syntax
title: "Цикли: for ітерує значення, а не індекси"
summary: "Учень пише цикли в стилі Python: for по значеннях з enumerate і zip замість індексів, range як лінива послідовність, for-else замість прапорця, і не наступає на пастки scope, пізнього зв'язування й зміни колекції під час ітерації."
duration_min: 60
prerequisites: [m1-l05]
---

## `for` обходить значення, а не індекси

У Python є рівно один `for`, і він не має ні лічильника, ні умови, ні кроку. Праворуч від `in` стоїть будь-який об'єкт, який уміє віддавати елементи по одному, а зліва ім'я, до якого кожен елемент прив'язується на одну ітерацію. Це `for...of` з JS, тільки без альтернатив: класичного `for (let i = 0; ...)` у мові немає взагалі.

```ts
const fields = ["email", "phone", "age"];
for (const field of fields) console.log(field);
for (const ch of "abc") console.log(ch);
for (const key of Object.keys({ id: "f1", type: "text" })) console.log(key);
```

```python
fields = ["email", "phone", "age"]
for field in fields:
    print(field)

for ch in "abc":
    print(ch)

config = {"id": "f1", "type": "text"}
for key in config:
    print(key)
```

```text
email
phone
age
a
b
c
id
type
```

Поведінка розходиться на словнику: `for key in dict` у Python віддає ключі без жодного `Object.keys`, причому в порядку вставки. Усе інше збігається з `for...of`: список віддає елементи, рядок віддає символи по одному, кортеж і множина теж працюють.

Об'єкт праворуч від `in` називається iterable. На рівні ідеї це все, що `for` може попросити "дай мені ітератор", а ітератор уміє віддати наступний елемент або сказати, що елементи скінчилися. Саме це `for` і робить перед першою ітерацією: викликає `iter()` на об'єкті, а далі питає в ітератора елементи, поки вони є. Протокол цілком, із `__iter__`, `__next__` і `StopIteration`, розібраний у m5-l01. Тут достатньо того, що `iter()` існує і що він повертає для різних типів.

```python
print(iter([1, 2]))
print(iter("ab"))
print(iter({"a": 1}))
print(iter(range(3)))
```

```text
<list_iterator object at 0x100b14af0>
<str_ascii_iterator object at 0x100b14af0>
<dict_keyiterator object at 0x100b31940>
<range_iterator object at 0x100b14a80>
```

Якщо об'єкт не iterable, `for` падає ще до першої ітерації, і текст помилки прямо називає причину. Це той самий випадок, що `for (const x of 5)` у JS з його `5 is not iterable`.

```python
for x in 5:
    print(x)
```

```text
    for x in 5:
             ^
TypeError: 'int' object is not iterable
```

> **JS-аналог.** `for...in` у JS і `for ... in` у Python це різні конструкції з однаковим написанням. JS-варіант обходить рядкові ключі об'єкта, включно з індексами масиву `"0", "1", "2"` і успадкованими enumerable-властивостями, тому в масивах його уникають. Python-варіант обходить значення, і це єдиний цикл по колекції. Звичка "`for...in` для об'єктів, `for...of` для масивів" тут не потрібна: `for ... in` для всього.

Звички з методів масивів переносяться вибірково. `.forEach(cb)` стає звичайним `for`: він коротший, і в ньому працюють `break` і `continue`, яких у `forEach` немає. `.map` і `.filter` стають comprehension (розділ про межу нижче, детально в m1-l10). Деструктуризація в заголовку працює так само, як `for (const [a, b] of pairs)`, і вкладається: `for i, (a, b) in enumerate(pairs)`.

```python
for a, b in [(1, 2), (3, 4)]:
    print(a + b)

for i, (a, b) in enumerate([(1, 2), (3, 4)]):
    print(i, a, b)
```

```text
3
7
0 1 2
1 3 4
```

<!-- task: q2 -->

## `enumerate`, `zip` і `range`: коли таки потрібні числа

Перша інтуїція JS-розробника, коли потрібен індекс, це `range(len(fields))`. Воно працює, але вважається поганим стилем з конкретної причини: цикл отримує число, а потім сам лізе в колекцію за елементом. Це той самий `for (let i = 0; i < arr.length; i++) arr[i]` після того, як ви вже звикли до `for...of`.

```python
fields = ["email", "phone", "age"]
for i in range(len(fields)):
    print(i, fields[i])
```

```text
0 email
1 phone
2 age
```

`enumerate(iterable)` віддає пари `(index, element)`, і їх одразу розпаковують у заголовку. Це `arr.entries()` з JS, але працює з будь-яким iterable, а не лише з масивом. Параметр `start` зсуває нумерацію: `enumerate(fields, start=1)` для повідомлень користувачу, де "поле 1" природніше за "поле 0".

```python live
fields = ["email", "phone", "age"]
for i, field in enumerate(fields):
    print(i, field)

for n, field in enumerate(fields, start=1):
    print(f"{n}. {field}")

print(list(enumerate(fields, start=1)))
```

```text
0 email
1 phone
2 age
1. email
2. phone
3. age
[(1, 'email'), (2, 'phone'), (3, 'age')]
```

<!-- task: t1 -->

Дві й більше послідовностей одночасно обходять через `zip`: воно віддає кортежі з i-х елементів кожної. `dict(zip(keys, values))` складає словник з двох списків, це `Object.fromEntries(keys.map((k, i) => [k, values[i]]))` в один виклик.

```python
names = ["email", "phone", "age"]
values = ["a@b.c", "+380", 30]
for name, value in zip(names, values):
    print(f"{name} = {value!r}")

print(dict(zip(names, values)))
```

```text
email = 'a@b.c'
phone = '+380'
age = 30
{'email': 'a@b.c', 'phone': '+380', 'age': 30}
```

> **Пастка.** `zip` мовчки зупиняється на найкоротшій послідовності. Якщо заголовки й рядок таблиці різної довжини, зайве просто зникає без помилки. Для даних, де довжини зобов'язані збігатися, передавайте `strict=True`: тоді розбіжність дає `ValueError` замість тихої втрати.

```python
print(list(zip([1, 2, 3], ["a", "b"])))
```

```text
[(1, 'a'), (2, 'b')]
```

```python
print(list(zip([1, 2, 3], ["a", "b"], strict=True)))
```

```text
ValueError: zip() argument 2 is shorter than argument 1
```

<!-- task: t2 -->

`range` виглядає як список чисел, але це окремий тип: лінива незмінна послідовність, яка зберігає лише `start`, `stop`, `step` і рахує елементи на вимогу. `range(10**9)` займає 48 байт, тоді як список з тисячі чисел уже 8 кілобайт. У JS найближче `Array.from({ length: n }, (_, i) => i)`, і він якраз матеріалізує весь масив.

```python
import sys

r = range(10**9)
print(type(r))
print(r)
print(len(r))
print(sys.getsizeof(r))
print(sys.getsizeof(list(range(1000))))
```

```text
<class 'range'>
range(0, 1000000000)
1000000000
48
8056
```

Через те, що `range` зберігає формулу, а не елементи, його можна пройти скільки завгодно разів, індексувати, брати `len`, і перевірка `in` у ньому це арифметика, а не перебір. Це відрізняє його від ітератора, який вичерпується після одного проходу (m5-l01).

```python
r = range(3)
print(list(r))
print(list(r))
print(r[0], r[-1])
print(2 in r, 3 in r)
print(999_999_999 in range(10**9))
```

```text
[0, 1, 2]
[0, 1, 2]
0 2
True False
True
```

Сигнатура та сама, що в `slice`: `range(stop)`, `range(start, stop)`, `range(start, stop, step)`. `stop` не входить, від'ємний крок іде вниз, а порожній діапазон це нормальне значення, а не помилка. Для зворотного обходу готової послідовності зручніше `reversed(...)`, ніж підбирати від'ємні межі.

```python live
print(list(range(5)))
print(list(range(2, 5)))
print(list(range(0, 10, 3)))
print(list(range(10, 0, -3)))
print(list(range(5, 0)))
print(list(reversed(range(5))))
```

```text
[0, 1, 2, 3, 4]
[2, 3, 4]
[0, 3, 6, 9]
[10, 7, 4, 1]
[]
[4, 3, 2, 1, 0]
```

<!-- task: t3 -->

## Змінна циклу живе після циклу: scope і пізнє зв'язування

`for` не створює scope. Змінна циклу це звичайна змінна функції або модуля, яку цикл перезаписує на кожній ітерації, і після циклу вона лишається з останнім значенням. У JS `for (let i ...)` дає `i` блоковий scope, і після циклу `i` не існує; у Python існує, бо блоків у мові немає, scope дають лише функція, клас і модуль (детально LEGB у m1-l08).

```ts
for (let i = 0; i < 3; i++) {}
console.log(i); // ReferenceError: i is not defined
```

```python
for i in range(3):
    pass
print(i)

for field in ["email", "phone"]:
    last = field
print(field, last)
```

```text
2
phone phone
```

Розходження стосується не лише читання після циклу. Якщо до циклу вже була змінна з тим самим ім'ям, цикл її затирає, тому що це та сама змінна, а не нова в тіні. І якщо iterable виявився порожнім, тіло не виконалось ні разу, присвоєння не сталось, і змінної не існує взагалі.

```python
field = "outer"
for field in ["a", "b"]:
    pass
print(field)
```

```text
b
```

```python
for item in []:
    pass
print(item)
```

```text
NameError: name 'item' is not defined. Did you mean: 'iter'?
```

<!-- task: q1 -->

З того самого факту, що змінна одна на весь цикл, виростає друга пастка: замикання, створені в циклі, бачать останнє значення. Функція не копіює значення змінної в момент створення, вона запам'ятовує саму змінну і читає її при виклику. Усі три `lambda` нижче посилаються на одну `i`, а коли їх викликають, `i` вже дорівнює `2`.

```python live
callbacks = []
for i in range(3):
    callbacks.append(lambda: i)

print([cb() for cb in callbacks])
```

```text
[2, 2, 2]
```

> **Пастка.** У JS це та сама історія з `var`, яку `let` закрив: `for (let i ...)` створює свіжу прив'язку на кожну ітерацію, тому `() => i` у циклі з `let` повертає `0, 1, 2`. Python такої свіжої прив'язки не робить ніколи, незалежно від того, як написано цикл. Якщо потрібно зафіксувати значення, це робиться явно.

Три робочі способи фіксації. Аргумент за замовчуванням `lambda i=i: i` обчислюється в момент створення функції, тож кожна lambda отримує свою копію (той самий механізм, що дає пастку з mutable default у m1-l07). `functools.partial` прив'язує аргумент до готової функції. Фабрика `make_callback(i)` дає кожному замиканню окремий scope функції, і це найчитабельніший варіант, коли тіло більше за один вираз.

```python
from functools import partial

callbacks = [lambda i=i: i for i in range(3)]
print([cb() for cb in callbacks])

def show(i):
    return i

callbacks = [partial(show, i) for i in range(3)]
print([cb() for cb in callbacks])

def make_callback(i):
    return lambda: i

callbacks = [make_callback(i) for i in range(3)]
print([cb() for cb in callbacks])
```

```text
[0, 1, 2]
[0, 1, 2]
[0, 1, 2]
```

<!-- task: q4 -->

<!-- task: t4 -->

## `while`, відсутній `do...while` і `else` після циклу

`while` потрібен, коли на старті невідомо, скільки буде ітерацій: умова залежить від того, що відбувається в тілі. Опитування черги, повтор запиту, читання до порожнього фрагмента. Якщо ви можете назвати колекцію або діапазон, по якому йдете, це `for`; `while` з лічильником це майже завжди `for` по `range`, написаний довше.

```python
queue = ["render", "upload", "notify"]
while queue:
    job = queue.pop(0)
    print("run", job)
print(queue)
```

```text
run render
run upload
run notify
[]
```

`do...while` у Python немає. Ідіоматична заміна це `while True` з `break` усередині в тому місці, де в JS стояла б умова. Тіло гарантовано виконується хоча б раз, а умова виходу читається там, де вона перевіряється. `break` і `continue` поводяться так само, як у JS.

```ts
let value: string;
do {
  value = inputs.next().value.trim();
} while (!value);
```

```python
inputs = iter(["", "  ", "ok"])

while True:
    value = next(inputs).strip()
    if value:
        break
print(repr(value))
```

```text
'ok'
```

Розходження тільки у формі: умова з хвоста переїхала в тіло. Коли умова зводиться до "отримав непорожнє значення", є компактніший варіант через walrus-оператор `:=`, який присвоює і повертає значення в одному виразі, як `while ((chunk = next()))` у JS.

```python
chunks = iter(["abc", "de", ""])
while (chunk := next(chunks)):
    print(len(chunk))
```

```text
3
2
```

Обидва цикли, `for` і `while`, мають гілку `else`. Назва невдала, бо читається як "інакше", а означає "якщо цикл дійшов до кінця без `break`". Тобто `else` виконується, коли iterable вичерпано або умова `while` стала хибною, і не виконується, коли був `break`. Порожній iterable теж рахується як "дійшов до кінця", тому `else` спрацьовує.

Задача, для якої це зроблено: пошук без прапорця. У JS ви заводите `let found = false`, ставите `true` перед `break` і перевіряете після циклу. У Python ту саму логіку несе `else`.

```python
fields = [{"id": "email", "required": True}, {"id": "phone", "required": False}]

found = False
for field in fields:
    if field["id"] == "phone":
        found = True
        break
if not found:
    print("phone: not found")
else:
    print("phone: found")
```

```text
phone: found
```

```python live
fields = [{"id": "email", "required": True}, {"id": "phone", "required": False}]

for field in fields:
    if field["id"] == "phone":
        print("phone: found")
        break
else:
    print("phone: not found")

for field in fields:
    if field["id"] == "age":
        print("age: found")
        break
else:
    print("age: not found")

for field in []:
    break
else:
    print("empty: else ran")
```

```text
phone: found
age: not found
empty: else ran
```

З `while` правило те саме: `else` виконується після того, як умова стала хибною, і пропускається після `break`.

```python
n = 0
while n < 3:
    n += 1
else:
    print("while finished, n =", n)

n = 0
while n < 3:
    n += 1
    if n == 2:
        break
else:
    print("not printed")
print("after break, n =", n)
```

```text
while finished, n = 3
after break, n = 2
```

> **Під капотом.** `else` прив'язаний не до `if` усередині циклу, а до самого `break`: компілятор ставить тіло `else` одразу після циклу, а `break` стрибає за межі обох. Тому `else` не має сенсу без `break` усередині, і ruff це підкаже. Якщо після `else` ви бачите код без `break` у циклі, це просто код після циклу, записаний із зайвим відступом.

<!-- task: q3 -->

## Зміна колекції під час ітерації: словники й списки

Словник ітерується трьома способами: `for key in d` дає ключі, `d.values()` значення, `d.items()` пари, які одразу розпаковуються. Порядок завжди порядок вставки, це гарантія мови з 3.7, а не деталь реалізації. У JS найближче `for (const [k, v] of Object.entries(obj))`, з тією різницею, що в Python це рідний обхід, а не перетворення в масив пар.

```python live
answers = {"email": "a@b.c", "phone": "", "age": 30}

for key in answers:
    print(key)
for value in answers.values():
    print(value)
for key, value in answers.items():
    print(f"{key}: {value!r}")
```

```text
email
phone
age
a@b.c

30
email: 'a@b.c'
phone: ''
age: 30
```

> **Пастка.** Додавати або видаляти ключі словника під час ітерації по ньому заборонено: ітератор перевіряє розмір словника на кожному кроці й кидає `RuntimeError`. Міняти значення за наявними ключами можна, розмір від цього не змінюється.

```python
answers = {"email": "a@b.c", "phone": "", "age": 30}
for key in answers:
    if answers[key] == "":
        del answers[key]
```

```text
RuntimeError: dictionary changed size during iteration
```

```python
answers = {"email": "a@b.c", "phone": ""}
for key in answers:
    answers[key] = answers[key] or None
print(answers)
```

```text
{'email': 'a@b.c', 'phone': None}
```

Правильно або ітерувати копію ключів `list(answers)`, щоб видаляти з оригіналу, або побудувати новий словник comprehension-ом з умовою. Другий варіант у Python майже завжди кращий: без мутації, без копії ключів, одна строка.

```python
answers = {"email": "a@b.c", "phone": "", "age": 30}
for key in list(answers):
    if answers[key] == "":
        del answers[key]
print(answers)

answers = {"email": "a@b.c", "phone": "", "age": 30}
answers = {k: v for k, v in answers.items() if v != ""}
print(answers)
```

```text
{'email': 'a@b.c', 'age': 30}
{'email': 'a@b.c', 'age': 30}
```

Зі списком гірше: він не кидає помилку, він тихо пропускає елементи. Ітератор списку тримає індекс; після `remove` елементи зсуваються вліво, індекс іде далі, і сусід видаленого елемента ніколи не потрапляє під перевірку. У JS `splice` у `for...of` поводиться так само, тож пастка знайома, але в Python на неї наступають частіше, бо `remove` виглядає невинно.

```python
values = ["", "", "ok", "", "x"]
for v in values:
    if v == "":
        values.remove(v)
print(values)
```

```text
['ok', '', 'x']
```

Три робочі варіанти: comprehension у нову змінну, ітерація по копії `values[:]` з видаленням з оригіналу, або `values[:] = [...]`, якщо на цей список є інші посилання і їх треба побачити зміну (aliasing детально в m2-l02).

```python
values = ["", "", "ok", "", "x"]
values = [v for v in values if v != ""]
print(values)

values = ["", "", "ok", "", "x"]
for v in values[:]:
    if v == "":
        values.remove(v)
print(values)

values = ["", "", "ok", "", "x"]
values[:] = [v for v in values if v != ""]
print(values)
```

```text
['ok', 'x']
['ok', 'x']
['ok', 'x']
```

## Вкладені цикли, вихід назовні й межа з comprehension

`break` виходить лише з найближчого циклу, і міток, як `outer: for (...)` у JS, у Python немає. Зовнішній цикл іде далі, ніби нічого не сталось.

```python
pages = [["email", "phone"], ["age", "phone"]]
seen = set()
for page in pages:
    for field_id in page:
        if field_id in seen:
            print("duplicate:", field_id)
            break
        seen.add(field_id)
    print("page done")
```

```text
page done
duplicate: phone
page done
```

Перший за пріоритетом спосіб: винести вкладені цикли у функцію і виходити через `return`. Це одночасно і спосіб назвати, що саме шукалось, і спосіб повернути результат, а не прапорець. Другий спосіб, якщо функція недоречна, це пара `for-else` і `break`: `else: continue` на внутрішньому циклі означає "внутрішній дійшов до кінця, крутимо зовнішній далі", а `break` одразу після нього виконується лише тоді, коли внутрішній перервали. Третій спосіб, коли вкладеність це просто декартів добуток, сплющити її через `itertools.product` або генераторний вираз, і тоді `break` один.

```python
pages = [["email", "phone"], ["age", "phone"]]

def find_duplicate(pages: list[list[str]]) -> str | None:
    seen = set()
    for page in pages:
        for field_id in page:
            if field_id in seen:
                return field_id
            seen.add(field_id)
    return None

print(find_duplicate(pages))
print(find_duplicate([["a"], ["b"]]))
```

```text
phone
None
```

```python
pages = [["email", "phone"], ["age", "phone"]]
seen = set()
for page in pages:
    for field_id in page:
        if field_id in seen:
            break
        seen.add(field_id)
    else:
        continue
    break
print("stopped at", field_id)
```

```text
stopped at phone
```

```python
from itertools import product

for x, y in product([0, 1], ["a", "b"]):
    print(x, y)
```

```text
0 a
0 b
1 a
1 b
```

Межа між циклом і comprehension проходить по тому, що цикл робить. Якщо тіло накопичує новий список, словник або множину з елементів, це comprehension. Якщо тіло рахує суму або лічильник, це `sum` з генераторним виразом. Якщо тіло шукає "хоч один" або "всі", це `any` чи `all`. У всіх трьох випадках версія з циклом довша й ховає намір за механікою `append` і `+= 1`. Синтаксис і вкладені comprehension розібрані в m1-l10.

```python live
fields = [
    {"id": "email", "required": True, "value": "a@b.c"},
    {"id": "phone", "required": True, "value": ""},
    {"id": "note", "required": False, "value": ""},
]

ids = []
for field in fields:
    ids.append(field["id"])
print(ids)
print([field["id"] for field in fields])

total = 0
for field in fields:
    if field["required"]:
        total += 1
print(total)
print(sum(1 for field in fields if field["required"]))

print(any(field["required"] and not field["value"] for field in fields))
print(all(field["value"] for field in fields if field["required"]))
```

```text
['email', 'phone', 'note']
['email', 'phone', 'note']
2
2
True
False
```

Цикл лишається циклом, коли в тілі є побічні ефекти (запис, виклик API, `print`), кілька залежних кроків, або коли потрібно щось зробити й з елементом, і з його сусідом. Comprehension заради побічного ефекту, на кшталт `[save(f) for f in fields]`, це антипатерн: список будується й викидається. І не варто думати, що `any` з генератором перебирає все: він зупиняється на першому `True`, як `.some` у JS.

```python
def check(field):
    print("checking", field["id"])
    return field["required"] and not field["value"]

fields = [
    {"id": "email", "required": True, "value": "a@b.c"},
    {"id": "phone", "required": True, "value": ""},
    {"id": "note", "required": False, "value": ""},
]
print(any(check(f) for f in fields))
```

```text
checking email
checking phone
True
```

<!-- task: t5 -->

## Для капстоуну

Конфіг форми FormBuilder це дерево: сторінки, у них поля, у полях правила. Майже вся валідація до появи Pydantic (m2-l09) це вкладений `for` з `enumerate(start=1)`, щоб повідомлення про помилку вказувало на сторінку й поле так, як їх бачить користувач конструктора. Нижче перевірка унікальності `id` по всіх сторінках, яка в капстоуні стане першим валідатором конфігу.

```python
config = {
    "pages": [
        {"title": "Contact", "fields": [{"id": "email", "required": True}, {"id": "phone", "required": False}]},
        {"title": "Details", "fields": [{"id": "age", "required": True}, {"id": "email", "required": False}]},
    ]
}

seen: dict[str, int] = {}
errors: list[str] = []
for page_no, page in enumerate(config["pages"], start=1):
    for field_no, field in enumerate(page["fields"], start=1):
        field_id = field["id"]
        if field_id in seen:
            errors.append(f"page {page_no}, field {field_no}: duplicate id {field_id!r} (first on page {seen[field_id]})")
            continue
        seen[field_id] = page_no

for error in errors:
    print(error)
print("ok" if not errors else f"{len(errors)} error(s)")
```

```text
page 2, field 2: duplicate id 'email' (first on page 1)
1 error(s)
```

> **Для капстоуну.** Відповіді на форму приходять як словник `{field_id: value}`, а список обов'язкових полів із конфігу. Перевірка "всі обов'язкові заповнені" це `for-else` по списку обов'язкових з `answers.get(...)`, а не прапорець. І пам'ятайте, що словник відповідей не можна чистити від порожніх значень тим самим циклом, яким по ньому йдете: будуйте новий comprehension-ом.

```python
answers = {"email": "a@b.c", "phone": "", "age": 30}
required = ["email", "phone"]

for field_id in required:
    if not answers.get(field_id):
        print(f"missing: {field_id}")
        break
else:
    print("all required answered")
```

```text
missing: phone
```

## Типові помилки JS-розробника

1. **`range(len(x))` замість `enumerate`.** За звичкою з `for (let i ...)` пишуть індекс і дістають елемент самі. Працює, але читається як перебір чисел, а не елементів. Правильно: `enumerate`, а якщо індекс не потрібен, просто `for x in xs`.

   ```python
   for i in range(len(fields)):      # за звичкою
       print(i, fields[i])
   for i, field in enumerate(fields):  # правильно
       print(i, field)
   ```

2. **Очікування, що змінна циклу зникне після циклу.** Пишуть `for field in fields` і далі заводять іншу `field`, не помічаючи, що вона вже є, або навпаки читають змінну після порожнього циклу й отримують `NameError`. Правильно: вважати змінну циклу звичайною змінною функції; якщо значення після циклу потрібне, це сигнал, що пошук варто винести у функцію з `return`.

   ```python
   for field in []:
       pass
   print(field)  # NameError: name 'field' is not defined
   ```

3. **Lambda в циклі без фіксації значення.** Очікують поведінку `let`, отримують усі замикання з останнім значенням. Правильно: `lambda i=i: ...`, `functools.partial` або фабрика-функція.

   ```python
   callbacks = [lambda: i for i in range(3)]        # [2, 2, 2]
   callbacks = [lambda i=i: i for i in range(3)]    # [0, 1, 2]
   ```

4. **`zip` на даних різної довжини без `strict=True`.** Заголовки й рядки таблиці не збігаються, зайве відкидається мовчки. Правильно: `zip(headers, row, strict=True)` скрізь, де довжини зобов'язані збігатися.

   ```python
   list(zip([1, 2, 3], ["a", "b"]))               # [(1, 'a'), (2, 'b')]
   list(zip([1, 2, 3], ["a", "b"], strict=True))  # ValueError
   ```

5. **Видалення зі словника або списку під час ітерації по ньому.** Словник кидає `RuntimeError`, список тихо пропускає сусідів видаленого. Правильно: будувати нову колекцію comprehension-ом або ітерувати копію `list(d)` / `xs[:]`.

   ```python
   answers = {k: v for k, v in answers.items() if v != ""}
   ```

6. **Прапорець `found` замість `for-else`.** Переносять `let found = false` з JS. Працює, але це три зайві рядки й змінна, яку потім хтось перевикористає. Правильно: `else` після циклу або `return` із функції.

   ```python
   for field in fields:
       if field["id"] == target:
           break
   else:
       raise KeyError(target)
   ```

7. **`break` у вкладеному циклі як вихід назовні.** Очікують поведінку `outer: for` з міткою; виходить лише внутрішній. Правильно: функція з `return`, `for-else` + `continue` + `break`, або сплющити цикли через `itertools.product`.

   ```python
   def find(pages):
       for page in pages:
           for field in page:
               if match(field):
                   return field
       return None
   ```

8. **Comprehension заради побічного ефекту.** `[print(x) for x in xs]` з інтуїції `xs.forEach(console.log)`. Будується список з `None`, який одразу викидається. Правильно: звичайний `for`; comprehension лише тоді, коли результат потрібен.

   ```python
   for x in xs:
       print(x)
   ```

## Підсумок

- `for x in iterable` це `for...of`: обходить значення, а не індекси; іншого `for` у мові немає.
- Iterable це все, у чого `iter()` дає ітератор; список, рядок, словник, `range`, файл. Протокол у m5-l01.
- Індекс через `enumerate(xs, start=...)`, паралельний обхід через `zip`, `strict=True` там, де довжини зобов'язані збігатися.
- `range` зберігає формулу, а не елементи: 48 байт для мільярда чисел, можна пройти двічі, `in` без перебору, `stop` не входить.
- Цикл не створює scope: змінна циклу живе після нього з останнім значенням, а після порожнього циклу не існує.
- Замикання в циклі бачать останнє значення; фіксувати через `lambda i=i`, `partial` або фабрику.
- `while` для невідомої кількості ітерацій; `do...while` це `while True` з `break`.
- `else` у `for` і `while` виконується, коли не було `break`; це заміна прапорцю `found`.
- Словник під час ітерації не змінювати за розміром, список не чистити в тому ж циклі; будувати нову колекцію.
- `break` виходить з одного циклу; з вкладених через `return` із функції, `for-else`, або `itertools.product`.

## Що далі

Наступний урок m1-l07 про функції: позиційні й іменовані аргументи, `*args`, `**kwargs` і значення за замовчуванням. Прийом `lambda i=i` звідси там розкривається повністю, бо момент обчислення значень за замовчуванням і є причиною пастки з mutable default. Далі m1-l10 забирає межу "цикл чи comprehension" і розбирає comprehension як окрему тему, а m5-l01 повертає `for` на рівень протоколу ітерації.
