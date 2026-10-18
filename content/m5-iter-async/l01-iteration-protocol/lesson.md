---
id: m5-l01
module: m5-iter-async
title: "Протокол ітерації: __iter__, __next__, StopIteration"
summary: "Учень розгортає for у виклики iter() і next(), пише власні ітератори й колекції, які можна обходити повторно, відрізняє одноразовий ітератор від iterable і користується next з default, iter з sentinel та лінивістю без пасток."
duration_min: 75
prerequisites: [m4-l08]
---

## Iterable і iterator: дві ролі, два методи

У m1-l06 `for` був описаний на рівні ідеї: він викликає `iter()` на об'єкті й питає в результату елементи, поки вони є. Тут механізм цілком. Він називається протоколом ітерації (iterator protocol, офіційна назва з документації, розділ "Iterator Types") і складається з двох ролей. Iterable (офіційний термін глосарію) це об'єкт, у якого є `__iter__`, що повертає iterator. Iterator (теж офіційний) це об'єкт, у якого є `__next__`, що повертає наступний елемент або кидає `StopIteration`, і `__iter__`, що повертає сам об'єкт. Обидва методи це dunder (жаргон спільноти від "double underscore", детально в m4-l02), тобто їх викликають не напряму, а через вбудовані `iter(x)` і `next(it)`.

```ts
const fields = ["email", "phone"];
const it = fields[Symbol.iterator]();
console.log(it.next()); // { value: 'email', done: false }
console.log(it.next()); // { value: 'phone', done: false }
console.log(it.next()); // { value: undefined, done: true }
```

```python
fields = ["email", "phone"]
it = iter(fields)
print(next(it))
print(next(it))
print(next(it))
```

```text
email
phone
StopIteration
```

Розходження в тому, як ітератор каже "кінець". JS на кожному кроці повертає обгортку `{ value, done }`, і кінець це звичайне значення з `done: true`. Python повертає сам елемент, а кінець сигналізує винятком `StopIteration`. Обидві схеми розв'язують одну проблему: елементом може бути що завгодно, включно з `undefined` чи `None`, тому "кінець" не можна закодувати значенням. JS виносить прапорець в обгортку, Python виносить його з каналу значень у канал винятків. Для Python це не дивно й не дорого: винятки тут штатний control flow (EAFP, m1-l11), а `for` ловить `StopIteration` сам, тож у прикладному коді ви його майже не бачите.

`iter()` і `next()` це тонкі обгортки над методами класу, так само як `len()` над `__len__`. Метод шукається на типі, а не на екземплярі, тож `next(it)` по суті `type(it).__next__(it)`.

```python
fields = ["email", "phone"]
it = fields.__iter__()
print(type(it).__name__)
print(it.__next__())
print(next(it))
print(iter(it) is it)
```

```text
list_iterator
email
phone
True
```

Ось що `for` робить буквально. Перед першою ітерацією один виклик `iter()`, далі `next()` у нескінченному циклі, а `StopIteration` перетворюється на вихід з циклу. Гілка `else` у `for` (m1-l06) виконується саме тоді, коли вихід стався через `StopIteration`, а не через `break`.

```python live
fields = ["email", "phone", "age"]

for field in fields:
    print("for:", field)

it = iter(fields)
while True:
    try:
        field = next(it)
    except StopIteration:
        break
    print("while:", field)
```

```text
for: email
for: phone
for: age
while: email
while: phone
while: age
```

Навіщо ітератору `__iter__`, що повертає себе. `for` завжди викликає `iter()` на тому, що йому дали, тож ітератор мусить пережити цей виклик і не почати спочатку. Повернути себе означає "продовжуй звідти, де стоїш". Через це ітератор можна частково спожити вручну, а решту віддати `for`. Класичний приклад: зняти заголовок CSV через `next`, а рядки обійти циклом.

```python live
rows = ["id,type", "email,text", "age,number"]
it = iter(rows)
header = next(it).split(",")
for row in it:
    print(dict(zip(header, row.split(","))))
```

```text
{'id': 'email', 'type': 'text'}
{'id': 'age', 'type': 'number'}
```

> **JS-аналог.** Вбудовані ітератори JS влаштовані так само: `arr.values()[Symbol.iterator]()` повертає той самий об'єкт, тому `for (const x of arr.values())` працює. Різниця в статусі правила. У JS це домовленість для вбудованих ітераторів, і власний об'єкт лише з `next()` у `for...of` не піде. У Python `__iter__`, що повертає `self`, це частина контракту ітератора, і `collections.abc.Iterator` перевіряє обидва методи.

<!-- task: t1 -->

## Ітератор одноразовий, iterable ні

Список це iterable: кожен виклик `iter(lst)` створює новий ітератор зі своїм курсором, тому список можна обходити скільки завгодно разів, у тому числі двома незалежними ітераторами одночасно. Ітератор сам є курсором. Його `__iter__` повертає себе, тож другий прохід продовжує з того місця, де закінчився перший, тобто з кінця. Такий ітератор називається вичерпаним (exhausted, офіційне слово з глосарію), і другий прохід по ньому дає нуль елементів без жодної помилки.

```python live
fields = ["email", "phone"]
print(list(fields), list(fields))

it = iter(fields)
print(list(it), list(it))

a, b = iter(fields), iter(fields)
print(next(a), next(a), next(b))
```

```text
['email', 'phone'] ['email', 'phone']
['email', 'phone'] []
email phone email
```

Проблема в тому, що в Python ітератори повертає половина вбудованих функцій. `zip`, `map`, `filter`, `enumerate`, `reversed`, файловий об'єкт, `io.StringIO`, усе з `itertools` це ітератори, тобто одноразові. Колекції й `range` це iterable, а не ітератори. Перевірка `iter(obj) is obj` надійно розрізняє одне від іншого.

```python
import io

for obj in [zip([], []), map(str, []), filter(None, []), enumerate([]), reversed([]), io.StringIO("")]:
    print(type(obj).__name__, iter(obj) is obj)

for obj in [[], (), {}, {}.keys(), "", range(0)]:
    print(type(obj).__name__, iter(obj) is obj)
```

```text
zip True
map True
filter True
enumerate True
list_reverseiterator True
StringIO True
list False
tuple False
dict False
dict_keys False
str False
range False
```

Файл поводиться так само: рядки читаються з поточної позиції, і другий цикл по тому самому відкритому файлу порожній. Різниця з рештою ітераторів у тому, що файл можна перемотати через `seek(0)`. У загального ітератора кнопки "назад" немає.

```python
import tempfile

with tempfile.TemporaryFile("w+") as f:
    f.write("email\nphone\n")
    f.seek(0)
    print(iter(f) is f)
    print([line.strip() for line in f])
    print([line.strip() for line in f])
    f.seek(0)
    print([line.strip() for line in f])
```

```text
True
['email', 'phone']
[]
['email', 'phone']
```

> **Пастка.** Результат `map` чи `zip`, використаний двічі, другий раз порожній, і помилки немає. Особливо підступна перевірка `in`: на ітераторі вона перебирає елементи до першого збігу й споживає їх, тож після `"phone" in ids` у `ids` лишається тільки хвіст.

```python
raw = ["Email", "Phone", "Age"]
ids = map(str.lower, raw)
print("phone" in ids)
print(list(ids))
```

```text
True
['age']
```

У JS та сама поведінка: `for...of` по вичерпаному ітератору теж мовчки порожній. Але в JS на це рідко натрапляють, бо `arr.map()` і `arr.filter()` повертають масиви, а ітератори з'являються лише явно, через `.values()`, `.entries()` чи генератор. У Python `map`, `filter`, `zip` і `enumerate` повертають ітератори завжди, і пастка повторного використання щоденна. Найчастіше вона ховається у функції, яка обходить параметр двічі: зі списком працює, з ітератором тихо повертає неправильний результат.

```python live
def summary(ids):
    total = sum(1 for _ in ids)
    longest = max(ids, key=len, default=None)
    return total, longest

raw = ["email", "phone", "age"]
print(summary(raw))
print(summary(map(str.upper, raw)))

def summary_fixed(ids):
    ids = list(ids)
    return len(ids), max(ids, key=len, default=None)

print(summary_fixed(map(str.upper, raw)))
```

```text
(3, 'email')
(3, None)
(3, 'EMAIL')
```

Два способи лікування. Якщо функції потрібно кілька проходів, вона на вході один раз матеріалізує дані через `list(...)` або в анотації просить `Sequence`, а не `Iterable` (правило анотацій у m2-l07). Якщо кілька проходів потрібні викликачу, він зберігає не ітератор, а джерело, і щоразу будує новий `map` чи `zip`.

<!-- task: q1 -->

## Власний ітератор класом

Ітератор пишеться класом з двома методами. Стан, тобто курсор, живе в полях екземпляра: `__next__` читає поточне значення, зсуває курсор і повертає елемент, а коли елементів немає, кидає `StopIteration`. `__iter__` повертає `self`. Анотація `Self` з `typing` (Python 3.11+) каже саме це: метод повертає той самий об'єкт.

```python live
from typing import Self

class Countdown:
    def __init__(self, start: int) -> None:
        self.current = start

    def __iter__(self) -> Self:
        return self

    def __next__(self) -> int:
        if self.current <= 0:
            raise StopIteration
        value = self.current
        self.current -= 1
        return value

for n in Countdown(3):
    print(n)

cd = Countdown(2)
print(next(cd), next(cd))
print(list(cd), list(cd))
```

```text
3
2
1
2 1
[] []
```

Останній рядок показує частину контракту, яку легко пропустити. Ітератор, який одного разу кинув `StopIteration`, мусить кидати його й на всіх наступних викликах. Документація прямо називає ітератор, що після кінця знову віддає елементи, зламаним. `Countdown` дотримується цього автоматично: `current` лишається нулем.

> **Пастка.** Половина протоколу не працює. Клас лише з `__next__` не iterable, бо `for` спершу викликає `iter()` і не знаходить `__iter__`. Клас, чий `__iter__` повертає список замість ітератора, падає на тому ж кроці: `iter()` перевіряє, що результат має `__next__`.

```python
class OnlyNext:
    def __next__(self) -> int:
        raise StopIteration

for x in OnlyNext():
    pass
```

```text
TypeError: 'OnlyNext' object is not iterable
```

```python
class WrongIter:
    def __iter__(self):
        return [1, 2]

for x in WrongIter():
    pass
```

```text
TypeError: iter() returned non-iterator of type 'list'
```

На практиці такий клас пишуть рідко, бо генератор це короткий шлях. Функція з `yield` при виклику повертає об'єкт, у якого Python сам згенерував `__iter__`, `__next__`, збереження стану між кроками й `StopIteration` у кінці. Протокол той самий: генератор теж ітератор, і `iter(gen) is gen`.

```python live
def countdown(start: int):
    while start > 0:
        yield start
        start -= 1

print(list(countdown(3)))
gen = countdown(2)
print(iter(gen) is gen, next(gen), list(gen), list(gen))
```

```text
[3, 2, 1]
True 2 [1] []
```

Генератори детально в m5-l02, там `Countdown` переписується саме так. Клас-ітератор лишається доречним, коли в ітератора є власні публічні методи окрім `__next__`: `peek()`, лічильник спожитих елементів, `reset()`, або коли стан зручніше тримати й показувати явно, як у прикладі обходу дерева в кінці уроку.

<!-- task: t2 -->

## Колекція окремо від ітератора

Типова JS-звичка: колекція сама є своїм ітератором. `[Symbol.iterator]()` повертає `this`, а `next()` тримає курсор у полі колекції. Перенесена в Python один в один, вона ламається на другому проході й на вкладених циклах, бо курсор один на всіх.

```ts
class FieldSet {
  #i = 0;
  constructor(private ids: string[]) {}
  [Symbol.iterator]() { return this; }
  next() {
    return this.#i < this.ids.length
      ? { value: this.ids[this.#i++], done: false }
      : { value: undefined, done: true };
  }
}
```

```python
class FieldSet:
    def __init__(self, ids: list[str]) -> None:
        self.ids = ids
        self.i = 0

    def __iter__(self):
        return self

    def __next__(self) -> str:
        if self.i >= len(self.ids):
            raise StopIteration
        self.i += 1
        return self.ids[self.i - 1]

fs = FieldSet(["email", "phone", "age"])
for a in fs:
    for b in fs:
        print(a, b)
print(list(fs))
```

```text
email phone
email age
[]
```

Тут поведінка не розходиться: TS-версія ламається точно так само. Зовнішній цикл бере `email`, внутрішній дочитує курсор до кінця, і зовнішньому вже нічого не лишається. Різниця в культурі, а не в мові: у Python такий об'єкт вважається помилкою дизайну, і вбудовані типи її не роблять. `list` і `list_iterator`, `dict` і `dict_keyiterator` це різні класи: контейнер тримає дані, ітератор тримає курсор, і на один контейнер може припадати скільки завгодно курсорів.

Правило: `__iter__` колекції щоразу повертає новий ітератор, а `__next__` у колекції немає. Найпростіше делегувати вбудованому ітератору внутрішнього списку через `iter(self._ids)`.

```python live
from collections.abc import Iterator

class FieldSet:
    def __init__(self, ids: list[str]) -> None:
        self._ids = list(ids)

    def __iter__(self) -> Iterator[str]:
        return iter(self._ids)

    def __len__(self) -> int:
        return len(self._ids)

fs = FieldSet(["email", "phone", "age"])
for a in fs:
    for b in fs:
        if a < b:
            print(a, b)
print(list(fs), list(fs), len(fs))
print(iter(fs) is iter(fs))
```

```text
email phone
age email
age phone
['email', 'phone', 'age'] ['email', 'phone', 'age'] 3
False
```

Коли обхід має власну логіку, наприклад пропускає приховані поля, ітератор виноситься в окремий клас, а колекція в `__iter__` створює його екземпляр. Курсор живе в ітераторі, колекція лишається незмінною. Третій варіант, `__iter__` як генератор з `yield`, найкоротший і в реальному коді найчастіший, він у m5-l02.

```python live
from typing import Any, Self

class _VisibleIds:
    def __init__(self, fields: list[dict[str, Any]]) -> None:
        self._fields = fields
        self._pos = 0

    def __iter__(self) -> Self:
        return self

    def __next__(self) -> str:
        while self._pos < len(self._fields):
            field = self._fields[self._pos]
            self._pos += 1
            if not field.get("hidden"):
                return field["id"]
        raise StopIteration

class Form:
    def __init__(self, fields: list[dict[str, Any]]) -> None:
        self._fields = fields

    def __iter__(self) -> _VisibleIds:
        return _VisibleIds(self._fields)

form = Form([{"id": "email"}, {"id": "utm", "hidden": True}, {"id": "phone"}])
print(list(form))
print([(a, b) for a in form for b in form if a != b])
```

```text
['email', 'phone']
[('email', 'phone'), ('phone', 'email')]
```

<!-- task: q2 -->

## next з default, iter з sentinel і StopIteration у генераторі

`next(it, default)` повертає `default` замість `StopIteration`, коли ітератор вичерпано. У парі з генераторним виразом (generator expression, офіційний термін; дужки навколо comprehension, m1-l10, детально в m5-l02) це пошук першого елемента за умовою: `next` бере перший результат і зупиняється, решта елементів не перевіряється. Аналог `arr.find(pred) ?? null`, тільки для будь-якого iterable.

```python live
fields = [
    {"id": "name", "required": False},
    {"id": "email", "required": True},
    {"id": "phone", "required": True},
]
print(next((f["id"] for f in fields if f["required"]), None))
print(next((f["id"] for f in fields if f["id"] == "age"), None))
print(next(iter([]), "empty"))
print(next(iter(fields))["id"])
```

```text
email
None
empty
name
```

> **Пастка.** `next` приймає лише ітератор. Звичка взяти перший елемент через `next(lst)` дає `TypeError`, бо список це iterable, а не iterator. Перший елемент списку це `lst[0]`, а безпечний перший елемент будь-чого, включно з порожнім, це `next(iter(xs), None)`. Без `default` порожній ітератор кидає голий `StopIteration` без повідомлення, і такий traceback поза `for` читати неприємно.

```python
next(["email"])
```

```text
TypeError: 'list' object is not an iterator
```

У `iter` є друга форма: `iter(callable, sentinel)`. Вона викликає `callable()` без аргументів знову й знову й віддає результати, доки результат не дорівнюватиме `sentinel` (так названо параметр у документації; sentinel, "вартовий", це загальноприйнятий термін для значення-маркера кінця). Головне застосування це читання блоками: `stream.read(size)` повертає порожній рядок у кінці, тож `""` і є sentinel. Аргумент `size` прив'язує `functools.partial`. У JS прямого аналога немає, там пишуть `while ((chunk = read()) !== "")`.

```python live
import io
from functools import partial

stream = io.StringIO("email,phone,age")
for chunk in iter(partial(stream.read, 4), ""):
    print(repr(chunk))

lines = io.StringIO("Host: x\nAccept: */*\n\nbody\n")
print(list(iter(lines.readline, "\n")))
print(repr(lines.read()))
```

```text
'emai'
'l,ph'
'one,'
'age'
['Host: x\n', 'Accept: */*\n']
'body\n'
```

Другий приклад читає рядки до першого порожнього, як заголовки до тіла в HTTP, і лишає курсор потоку одразу за порожнім рядком. Для бінарного файлу sentinel це `b""`.

> **Пастка.** Sentinel порівнюється через `==` і має бути саме тим, що `callable` повертає в кінці. `iter(f.readline, "\n")` на потоці без порожнього рядка ніколи не зупиниться: у кінці файлу `readline` повертає `""`, а не `"\n"`, і повертає його нескінченно.

`StopIteration` це сигнал лише на межі протоколу: його кидає `__next__`, і його ловить той, хто викликав `next`. Якщо він виривається з тіла генератора, наприклад з `next()` на вичерпаному ітераторі, Python з версії 3.7 перетворює його на `RuntimeError` (PEP 479). Раніше генератор у такому разі просто мовчки закінчувався, і дані губились без жодної помилки.

```python
def pairs(items):
    it = iter(items)
    while True:
        a = next(it)
        b = next(it)
        yield a, b

print(list(pairs([1, 2, 3, 4])))
```

```text
RuntimeError: generator raised StopIteration
```

Виправлення: не дозволяти `next` кидати всередині генератора. `for a in it` сам коректно обробляє кінець, а другий елемент береться з того самого ітератора через `next(it, None)`. Це заодно ілюстрація спільного курсора: `for` і `next` у тілі просувають один і той самий ітератор.

```python live
def pairs(items):
    it = iter(items)
    for a in it:
        b = next(it, None)
        yield a, b

print(list(pairs([1, 2, 3, 4, 5])))
```

```text
[(1, 2), (3, 4), (5, None)]
```

> **Під капотом.** PEP 479 захищає лише генератори. Клас-ітератор і вбудовані ітератори на C такого захисту не мають: `StopIteration`, що вилетів з функції всередині `map`, виглядає для `list()` як звичайний кінець `map`, і результат мовчки обрізається.

```python
empty = iter([])
print(list(map(lambda x: next(empty), [1, 2, 3])))
```

```text
[]
```

<!-- task: q3 -->

## Лінивість: ітератор не знає довжини

Ітератор обчислює елемент у момент виклику `next` і не раніше. Цю властивість називають лінивістю (lazy evaluation; "lazy" трапляється в документації, але як опис, а не офіційний термін, у розмові це жаргон спільноти). З неї випливає все інше: у ітератора немає довжини, бо він не знає, скільки елементів попереду; немає індексу, бо до п'ятого елемента треба пройти чотири попередні; у пам'яті одночасно лише поточний елемент; ітератор може бути нескінченним.

```ts
const ids = ["Email", "Phone"].map((s) => s.toLowerCase());
console.log(ids.length, ids[0]); // 2 'email'
```

```python
ids = map(str.lower, ["Email", "Phone"])
print(len(ids))
```

```text
TypeError: object of type 'map' has no len()
```

`Array.prototype.map` у JS жадібний: обходить масив одразу й повертає новий масив, у якого є `length` і індекс. Python-`map` лінивий і повертає ітератор, тому `len` і `ids[0]` падають з `TypeError`. Найближчий JS-аналог Python-`map` це iterator helpers з ES2025, `arr.values().map(fn)`: теж лінивий, теж без `length`. Те саме з `filter`, `zip` і `enumerate`.

```python
ids = map(str.lower, ["Email", "Phone"])
print(ids[0])
```

```text
TypeError: 'map' object is not subscriptable
```

Порядок виконання показує лінивість найкраще. `filter` при створенні не викликає функцію жодного разу, а потім кожен елемент проходить перевірку рівно тоді, коли цикл його просить. List comprehension спершу перевіряє все, а потім цикл отримує готовий список.

```python live
def check(field_id: str) -> bool:
    print("  check", field_id)
    return field_id != "phone"

ids = ["email", "phone", "age"]

lazy = filter(check, ids)
print("filter created")
for field_id in lazy:
    print("got", field_id)

eager = [f for f in ids if check(f)]
print("list built")
for field_id in eager:
    print("got", field_id)
```

```text
filter created
  check email
got email
  check phone
  check age
got age
  check email
  check phone
  check age
list built
got email
got age
```

Пам'ять: список з мільйона квадратів займає мегабайти лише під масив посилань, без самих чисел, а `map` над тим самим `range` важить кілька десятків байт, бо зберігає функцію й ітератор джерела. Цифри нижче з 64-бітного CPython; у браузерному Pyodide покажчики 32-бітні й числа інші, тому приклад не живий.

```python
import sys

squares_list = [n * n for n in range(1_000_000)]
squares_map = map(lambda n: n * n, range(1_000_000))
print(sys.getsizeof(squares_list))
print(sys.getsizeof(squares_map))
```

```text
8448728
48
```

Нескінченний ітератор це нормальна річ, поки його не намагаються матеріалізувати. `itertools.count(1)` рахує вічно, а `next` чи `for` з `break` беруть з нього скільки треба. `list(count())` не завершиться ніколи. Перші n елементів без матеріалізації дає `itertools.islice`, це m5-l03.

```python live
from itertools import count

ids = map(lambda n: f"field_{n}", count(1))
print(next(ids), next(ids))
print(next(i for i in ids if i.endswith("7")))
print(next(ids))
```

```text
field_1 field_2
field_7
field_8
```

Коли все ж потрібен `list()`: якщо потрібні `len`, індекс чи зріз; якщо дані обходять двічі; якщо функція повертає результат, який викликач буде перевикористовувати (API, що повертає ітератор, перекладає пастку повторного використання на кожного викликача); якщо джерело може змінитись до того, як ітератор доспоживають. Лінивість виграє, коли даних багато або вони нескінченні, коли потрібні лише перші кілька, і коли обробка йде конвеєром, де кожен крок бере по одному елементу (конвеєри генераторів у m5-l02).

> **Пастка.** Налагоджувальний `print(list(it))` споживає ітератор. Звичка `console.log([...it])` з JS тут ламає код, який іде далі: після друку даних уже немає.

```python
ids = map(str.lower, ["Email", "Phone"])
print(list(ids))
print(repr(",".join(ids)))
```

```text
['email', 'phone']
''
```

<!-- task: t3 -->

## Хто ще ітерується: __getitem__, collections.abc і reversed

У `iter()` є запасний шлях. Якщо в класу немає `__iter__`, але є `__getitem__`, `iter()` будує ітератор, який викликає `obj[0]`, `obj[1]` і так далі, доки `__getitem__` не кине `IndexError`. Документація `iter()` називає це sequence protocol, і це спадок з часів до Python 2.2, коли `__iter__` ще не було. Саме тому клас з одним `__getitem__` уже працює у `for` і в `in` (контейнерні dunder-методи в m4-l02). `str` у Python 3 має власний `__iter__` (у m1-l06 `iter("ab")` повернув `str_ascii_iterator`); через `__getitem__` рядки ітерувались у Python 2.

```python
class Steps:
    def __init__(self, *names: str) -> None:
        self._names = names

    def __getitem__(self, index: int) -> str:
        return self._names[index]

steps = Steps("contact", "details", "confirm")
print(list(steps))
print("details" in steps)
print(type(iter(steps)).__name__)
print(hasattr(Steps, "__iter__"), hasattr(str, "__iter__"))
```

```text
['contact', 'details', 'confirm']
True
iterator
False True
```

> **Пастка.** Запасний шлях спрацьовує й там, де його не просили. Клас-реєстр з `__getitem__` за рядковим ключем, але без `__iter__`, у `for` отримує виклик `obj[0]` і падає з `KeyError: 0`, бо цикл зупиняє лише `IndexError`. Те саме з `in`, який без `__contains__` теж іде через ітерацію. Лікування: визначити `__iter__` (і `__contains__`), щойно в класу з'являється `__getitem__` не за індексом.

```python
class Registry:
    def __init__(self, items: dict[str, str]) -> None:
        self._items = items

    def __getitem__(self, key: str) -> str:
        return self._items[key]

reg = Registry({"email": "EmailField"})
print(reg["email"])
for name in reg:
    print(name)
```

```text
EmailField
KeyError: 0
```

`collections.abc.Iterable` і `Iterator` потрібні для `isinstance` і для анотацій. Обидва розібрані в m2-l07 як протоколи; тут те, що стосується ітерації. `Iterable` перевіряє наявність `__iter__`, `Iterator` наявність і `__iter__`, і `__next__`. Звідси наслідок: клас лише з `__getitem__` не проходить `isinstance(x, Iterable)`, хоча `iter(x)` для нього працює. Документація `collections.abc` прямо каже, що єдиний надійний спосіб перевірити, чи об'єкт ітерується, це викликати `iter()`. Тобто EAFP: спробувати й зловити `TypeError`.

```python
from collections.abc import Iterable, Iterator

class Steps:
    def __getitem__(self, index: int) -> str:
        return ("contact", "details")[index]

class OnlyNext:
    def __next__(self) -> int:
        raise StopIteration

print(isinstance([], Iterable), isinstance([], Iterator))
print(isinstance(iter([]), Iterator), isinstance(map(str, []), Iterator))
print(isinstance(Steps(), Iterable), list(Steps()))
print(isinstance(OnlyNext(), Iterator))

def is_iterable(obj: object) -> bool:
    try:
        iter(obj)
    except TypeError:
        return False
    return True

print(is_iterable(Steps()), is_iterable(5))
```

```text
True False
True True
False ['contact', 'details']
False
True False
```

В анотаціях: параметр, який лише обходять, це `Iterable[str]`; `__iter__` колекції повертає `Iterator[str]`; `__iter__` самого ітератора повертає `Self`. Для генераторів є ще `Generator[Y, S, R]`, він у m5-l02.

`reversed(x)` теж працює за протоколом. Спершу шукається `__reversed__`. Якщо його немає, `reversed` використовує sequence protocol у зворотному напрямку, і для цього потрібні обидва методи, `__len__` і `__getitem__`, бо треба знати, з якого індексу почати. Ітератор не розвертається ніколи: довжини він не знає, а назад не ходить. `dict` розвертається з Python 3.8, `set` ні, бо порядку в нього немає.

```python
print(list(reversed([1, 2, 3])), list(reversed("abc")))
print(list(reversed({"a": 1, "b": 2})), list(reversed(range(3))))
reversed(iter([1, 2, 3]))
```

```text
[3, 2, 1] ['c', 'b', 'a']
['b', 'a'] [2, 1, 0]
TypeError: 'list_iterator' object is not reversible
```

Власна колекція отримує `reversed` двома способами: через `__len__` і `__getitem__` за індексом, або явним `__reversed__`, який повертає новий ітератор у зворотному порядку. Другий варіант потрібен, коли індексу немає або він дорогий. Делегувати знову найпростіше вбудованому: `reversed(self._ids)` лінивий і не копіює список.

```python live
from collections.abc import Iterator

class FieldSet:
    def __init__(self, ids: list[str]) -> None:
        self._ids = list(ids)

    def __iter__(self) -> Iterator[str]:
        return iter(self._ids)

    def __reversed__(self) -> Iterator[str]:
        return reversed(self._ids)

class Steps:
    def __getitem__(self, index: int) -> str:
        return ("contact", "details")[index]

fs = FieldSet(["email", "phone", "age"])
print(list(reversed(fs)), list(fs))
try:
    reversed(Steps())
except TypeError as e:
    print(e)
```

```text
['age', 'phone', 'email'] ['email', 'phone', 'age']
object of type 'Steps' has no len()
```

Повідомлення у другому рядку саме про `__len__`: `__getitem__` у `Steps` є, але без довжини `reversed` не знає, з якого індексу починати.

<!-- task: t4 -->

## Для капстоуну

Конфіг форми FormBuilder це дерево: форма, сторінки, групи, поля. Його доводиться обходити у двох порядках. У глибину (depth-first) це порядок читання й рендеру: сторінка, усе її вміст, наступна сторінка. У ширину (breadth-first) це "спершу верхній рівень": усі сторінки, потім усе, що на другому рівні, і так далі. Це два різні iterable над одним і тим самим конфігом. Кожен у `__iter__` створює свіжий ітератор, тож обидва можна обходити повторно й одночасно, а сам конфіг не змінюється.

Ітератор один на обидва порядки, з явним стеком. Різниця лише в тому, з якого кінця `deque` брати наступний вузол: з правого кінця це стек і обхід у глибину, з лівого це черга й обхід у ширину. Для глибини дочірні вузли кладуться у зворотному порядку, щоб першим знімався перший.

```python
from collections import deque
from collections.abc import Iterator
from typing import Any, Self

Element = dict[str, Any]

form: Element = {"id": "form", "type": "form", "children": [
    {"id": "contact", "type": "page", "children": [
        {"id": "name", "type": "group", "children": [
            {"id": "first_name", "type": "text", "required": True},
        ]},
        {"id": "email", "type": "email", "required": True},
    ]},
    {"id": "details", "type": "page", "children": [
        {"id": "age", "type": "number", "required": False},
    ]},
]}

class _Walker:
    def __init__(self, root: Element, breadth_first: bool) -> None:
        self._pending = deque([root])
        self._breadth_first = breadth_first

    def __iter__(self) -> Self:
        return self

    def __next__(self) -> Element:
        if not self._pending:
            raise StopIteration
        if self._breadth_first:
            node = self._pending.popleft()
            self._pending.extend(node.get("children", []))
        else:
            node = self._pending.pop()
            self._pending.extend(reversed(node.get("children", [])))
        return node

class DepthFirst:
    def __init__(self, root: Element) -> None:
        self._root = root

    def __iter__(self) -> Iterator[Element]:
        return _Walker(self._root, breadth_first=False)

class BreadthFirst:
    def __init__(self, root: Element) -> None:
        self._root = root

    def __iter__(self) -> Iterator[Element]:
        return _Walker(self._root, breadth_first=True)

dfs = DepthFirst(form)
print([el["id"] for el in dfs])
print([el["id"] for el in BreadthFirst(form)])
print(len(list(dfs)), len(list(dfs)))

def is_input(el: Element) -> bool:
    return "children" not in el

print(next((el["id"] for el in DepthFirst(form) if is_input(el)), None))
print(next((el["id"] for el in BreadthFirst(form) if is_input(el)), None))
print(next((el for el in DepthFirst(form) if el["type"] == "date"), None))
```

```text
['form', 'contact', 'name', 'first_name', 'email', 'details', 'age']
['form', 'contact', 'details', 'name', 'email', 'age', 'first_name']
7 7
first_name
email
None
```

Перший інпут у глибину це `first_name`, бо він перший у порядку читання форми. У ширину це `email`, бо він найменш вкладений. Обидві відповіді правильні для різних питань: "куди поставити фокус при відкритті" і "яке поле видно без розгортання груп". `next(..., None)` зупиняє обхід на першому збігу, тож решта дерева не обходиться взагалі.

> **Для капстоуну.** У модулі 4 дерево елементів стало класами з `__iter__` для обходу і `__getitem__` за id. Після цього уроку `__iter__` такого класу повертає свіжий ітератор, а `__getitem__` за рядковим id не лишається без `__iter__`, інакше `for` впаде з `KeyError: 0`. У m5-l02 `_Walker` скоротиться до п'яти рядків генератора з `yield from`, а в m5-l05 той самий обхід стане джерелом задач для асинхронного рендеру.

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **Колекція як власний ітератор.** За звичкою `[Symbol.iterator]() { return this }` курсор кладуть у поле колекції. Другий прохід порожній, вкладені цикли бачать половину пар. Правильно: `__iter__` повертає новий ітератор, `__next__` у колекції немає.

   ```python
   class FieldSet:
       def __iter__(self):
           return iter(self._ids)   # новий курсор щоразу
   ```

2. **Очікування `{done, value}` або `None` у кінці.** Пишуть `while (x := next(it)) is not None`, як перевірку `done`. Вичерпаний ітератор не повертає `None`, а кидає `StopIteration`, і поза `for` це вилітає як виняток. Правильно: `for`, або `next(it, default)` зі своїм маркером кінця.

   ```python
   END = object()
   while (x := next(it, END)) is not END:
       print(x)
   ```

3. **`.length` і індекс на результаті `map`, `filter`, `zip`.** У JS `arr.map()` повертає масив. У Python `len(map(...))` і `map(...)[0]` дають `TypeError`. Правильно: `list(...)`, якщо потрібні довжина чи індекс, або comprehension одразу.

   ```python
   ids = [s.lower() for s in raw]      # список з len та індексом
   ids = list(map(str.lower, raw))     # те саме через map
   ```

4. **`[...it]` для налагодження.** Еквівалент у Python це `list(it)` (`[*it]` теж працює, але так не пишуть), і він споживає ітератор. `print(list(it))` посеред коду лишає наступним рядкам порожнечу. Правильно: матеріалізувати один раз у змінну й друкувати її.

   ```python
   ids = list(map(str.lower, raw))
   print(ids)
   process(ids)
   ```

5. **Повторне використання вичерпаного ітератора.** Результат `zip` передають у `dict()`, а потім ще раз у цикл; функція обходить параметр двічі. Другий прохід порожній без помилки. Правильно: `list()` один раз на вході або параметр типу `Sequence`.

   ```python
   def summary(ids: Iterable[str]) -> tuple[int, str | None]:
       ids = list(ids)
       return len(ids), max(ids, key=len, default=None)
   ```

6. **`next(lst)` для першого елемента.** Список не ітератор: `TypeError: 'list' object is not an iterator`. Правильно: `lst[0]` для непорожнього списку, `next(iter(xs), None)` для будь-якого iterable, `next((x for x in xs if pred(x)), None)` для `find`.

   ```python
   first = next(iter(fields), None)
   ```

7. **`next()` без default усередині генератора чи `map`.** У генераторі це `RuntimeError: generator raised StopIteration`, у `map` тихе обрізання результату. Правильно: `next(it, default)` або `for` по ітератору.

   ```python
   for a in it:
       b = next(it, None)
   ```

8. **`__getitem__` за ключем без `__iter__`.** Клас-словник з `__getitem__(self, key: str)` у `for` падає з `KeyError: 0`, бо `iter()` пробує старий протокол з індексами. Правильно: визначити `__iter__` і `__contains__` разом з таким `__getitem__`.

   ```python
   def __iter__(self) -> Iterator[str]:
       return iter(self._items)
   ```

## Підсумок

- Iterable має `__iter__`, що повертає iterator; iterator має `__next__` і `__iter__`, що повертає `self`.
- `for` це `iter()` один раз, потім `next()`, поки не прилетить `StopIteration`; винятком сигналізують кінець замість `{done: true}`.
- Ітератор одноразовий: другий прохід порожній без помилки. `zip`, `map`, `filter`, `enumerate`, `reversed`, файл це ітератори; колекції й `range` ні. Перевірка `iter(x) is x`.
- `in` на ітераторі споживає елементи до збігу; `print(list(it))` споживає все.
- Колекція в `__iter__` щоразу повертає новий ітератор; курсор живе в ітераторі, не в колекції.
- Власний клас-ітератор потрібен рідко; короткий шлях це генератор (m5-l02).
- `next(it, default)` для першого елемента й пошуку за умовою; `iter(callable, sentinel)` для читання блоками.
- `StopIteration` з тіла генератора стає `RuntimeError` (PEP 479); з `map` і класів-ітераторів тихо обрізає результат.
- Ітератор лінивий: без `len`, індексу й `reversed`, пам'ять на один елемент, може бути нескінченним. `list()`, коли потрібні довжина, індекс чи кілька проходів.
- `isinstance(x, Iterable)` не бачить старого протоколу через `__getitem__`; надійна перевірка це `iter(x)` у `try`.

## Що далі

Наступний урок m5-l02 про генератори: `yield` пише `__iter__`, `__next__` і `StopIteration` за вас, тож `Countdown` і `_Walker` з цього уроку там скорочуються до кількох рядків. Знадобиться все звідси: одноразовість, спільний курсор, лінивість і `next(it, default)`, бо генератор це той самий ітератор, і всі пастки цього уроку переходять на нього без змін.
