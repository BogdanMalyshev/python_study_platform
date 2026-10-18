---
id: m5-l03
module: m5-iter-async
title: "itertools і functools: partial, lru_cache, reduce, wraps"
summary: "Учень збирає ліниві конвеєри з itertools замість lodash-ланцюжків на масивах, ріже потоки через batched, islice і pairwise, мемоізує через cache і lru_cache з розумінням hashable-ключів і їхніх пасток, пише reduce лише там, де немає готової згортки, зберігає метадані обгорток через wraps і замінює ланцюжки isinstance на singledispatch."
duration_min: 90
prerequisites: [m5-l02]
---

## itertools: lodash, у якому все ліниве

`itertools` це модуль стандартної бібліотеки, усі функції якого приймають iterable і повертають ітератор (iterator, офіційний термін; протокол у m5-l01). Документація називає їх "iterator building blocks", і це точний опис: кожна функція робить одну дрібну операцію над потоком, а складаються вони так само, як методи lodash. Різниця в моделі виконання. Lodash працює з масивами: звичайні виклики на кожному кроці будують новий масив, а ліниві ланцюжки `_.chain` теж вимагають масиву на вході. itertools ліниві (lazy, жаргон спільноти й загальний CS-термін; документація описує саму поведінку) і не будують нічого, поки результат не почне споживати `for`, `list`, `sum` чи інший споживач, тому однаково працюють зі списком, генератором з m5-l02, рядками файлу або нескінченним потоком. Найближче в JS не lodash, а iterator helpers з ES2025: `Iterator.prototype.take`, `.drop`, `.flatMap`.

```ts
const merged = [...defaults, ...custom];   // новий масив одразу
const flat = _.flatten(pages);             // і ще один
```

```python
from itertools import chain

defaults = ["email", "name"]
custom = ("phone",)
merged = chain(defaults, custom, "xy")
print(type(merged).__name__)
print(list(merged))
print(list(merged))

pages = [["email", "phone"], ["age"], []]
print(list(chain.from_iterable(pages)))
```

```text
chain
['email', 'name', 'phone', 'x', 'y']
[]
['email', 'phone', 'age']
```

Розходження в трьох місцях. `chain` склеює iterable різних типів, і список, кортеж та рядок тут рівноправні, бо від них потрібне лише вміння віддавати елементи. Нічого не копіюється: `chain` тримає посилання на джерела й просто переходить від одного до наступного. І результат одноразовий, як будь-який ітератор: другий `list(merged)` отримав порожнечу без помилки, тоді як масив з JS можна читати скільки завгодно.

`chain.from_iterable(xs)` це `_.flatten` на один рівень, але з важливою відмінністю від `chain(*xs)`. Зірочка розпаковує зовнішню послідовність одразу, у момент виклику, тобто генератор сторінок буде прочитаний повністю ще до першого елемента. `from_iterable` бере наступну сторінку лише тоді, коли попередня скінчилась.

```python
from itertools import chain

def pages():
    for n in range(1, 4):
        print("load page", n)
        yield [f"p{n}a", f"p{n}b"]

flat = chain.from_iterable(pages())
print(next(flat), next(flat), next(flat))

eager = chain(*pages())
print("chain(*...) built")
```

```text
load page 1
load page 2
p1a p1b p2a
load page 1
load page 2
load page 3
chain(*...) built
```

`islice(it, stop)` і `islice(it, start, stop, step)` це зріз для будь-якого iterable: `arr.slice` з JS або `_.take`, але без потреби мати довжину чи індекс. На ітераторі він не копіює, а споживає: щоб віддати елемент з позиції 5, він мусить прочитати й викинути п'ять попередніх. Від'ємних індексів немає з тієї самої причини: щоб знати, де "третій з кінця", треба дочитати до кінця, а ітератор може бути нескінченним.

```python live
from itertools import count, islice

print(list(islice("abcdefg", 3)))
print(list(islice("abcdefg", 2, None, 2)))
print(list(islice(count(100), 3)))
```

```text
['a', 'b', 'c']
['c', 'e', 'g']
[100, 101, 102]
```

```python
from itertools import islice

print(list(islice([1, 2, 3], -1)))
```

```text
ValueError: Stop argument for islice() must be None or an integer: 0 <= x <= sys.maxsize.
```

<!-- task: q1 -->

Три функції дають нескінченні потоки. `count(start=0, step=1)` рахує без кінця, і крок може бути дробовим. `cycle(xs)` повторює елементи по колу. `repeat(x)` віддає те саме значення без кінця, а `repeat(x, n)` рівно `n` разів. Готових аналогів у JS немає: там це генератор з `while (true)`, написаний руками. На практиці нескінченний потік завжди обмежують чимось скінченним: `zip` зупиняється на найкоротшому, `islice` бере перші `n`, `takewhile` зупиняється на умові.

```python live
from itertools import count, cycle, repeat

rows = ["email", "phone", "age", "plan"]
for row, css in zip(rows, cycle(["odd", "even"])):
    print(row, css)

print(list(zip(count(1), "abc")))
print(list(zip(count(0, 0.5), "abc")))
print(list(map(pow, [1, 2, 3], repeat(2))))
print(list(repeat("-", 3)))
```

```text
email odd
phone even
age odd
plan even
[(1, 'a'), (2, 'b'), (3, 'c')]
[(0, 'a'), (0.5, 'b'), (1.0, 'c')]
[1, 4, 9]
['-', '-', '-']
```

> **Пастка.** `repeat(obj, n)` віддає один і той самий об'єкт `n` разів, а не копії, так само як `[[]] * 3` (aliasing, m2-l02). Мутація "одного" елемента видна в усіх. А `list(count())` чи `list(cycle(...))` не впаде, а зависне назавжди, бо `list` чесно чекає кінця потоку. `cycle` до того ж зберігає копію всіх елементів, які пройшли через нього в першому колі: на довгому джерелі це повний список у пам'яті. Останній рядок нижче це показує: генератор не можна пройти вдруге, тож друге коло `cycle` віддає зі своєї копії.

```python
from itertools import cycle, repeat

slots = list(repeat([], 3))
slots[0].append("email")
print(slots)
print(slots[0] is slots[2])
print([[] for _ in range(3)])

c = cycle(x for x in "ab")
print([next(c) for _ in range(5)])
```

```text
[['email'], ['email'], ['email']]
True
[[], [], []]
['a', 'b', 'a', 'b', 'a']
```

## Нарізати й обрізати: batched, pairwise, takewhile, zip_longest

`batched(iterable, n)` з'явився в 3.12 і робить те, що `_.chunk`: ріже потік на пачки по `n` елементів, остання може бути коротшою. У JS chunk зазвичай пишуть циклом зі `slice`, і Python-розробник до 3.12 писав так само. Тепер це один виклик, який до того ж не потребує ні довжини, ні індексу.

```ts
const chunks: string[][] = [];
for (let i = 0; i < ids.length; i += 2) chunks.push(ids.slice(i, i + 2));
// або _.chunk(ids, 2)
```

```python
from itertools import batched

ids = ["e1", "e2", "e3", "e4", "e5"]
print(list(batched(ids, 2)))

def stream():
    for n in range(1, 6):
        print("read", n)
        yield n

for batch in batched(stream(), 2):
    print("upload", batch)
```

```text
[('e1', 'e2'), ('e3', 'e4'), ('e5',)]
read 1
read 2
upload (1, 2)
read 3
read 4
upload (3, 4)
read 5
upload (5,)
```

Розходження: пачки це кортежі, а не списки, і вони створюються на вимогу. Друга частина виводу показує, що `batched` читає з джерела рівно стільки, скільки треба на поточну пачку, тож пачками можна публікувати потік, який не вміщується в пам'ять. `n` менше одиниці дає `ValueError: n must be at least one`. У 3.13 додано `strict=True`, що кидає помилку на неповній останній пачці; у 3.12 цього параметра ще немає.

> **Під капотом.** До 3.12 `batched` писали через `islice` на одному спільному ітераторі: кожен виклик `islice(it, n)` забирає наступні `n` елементів, бо `islice` споживає джерело. Порожній кортеж означає кінець. Той самий прийом стане в пригоді, коли потрібна пачка іншого типу, наприклад список.

```python
from itertools import islice

def chunked(iterable, n):
    it = iter(iterable)
    while batch := list(islice(it, n)):
        yield batch

print(list(chunked("abcdefg", 3)))
```

```text
[['a', 'b', 'c'], ['d', 'e', 'f'], ['g']]
```

<!-- task: t1 -->

`pairwise(xs)` (3.10+) віддає сусідні пари `(x0, x1), (x1, x2), ...`. У lodash аналога немає, у JS це `arr.slice(1).map((x, i) => [arr[i], x])`, а в RxJS є оператор з тією самою назвою. Python-ідіома до 3.10, `zip(xs, xs[1:])`, вимагала зрізу, тобто списку; `pairwise` працює на будь-якому ітераторі за один прохід. Типові задачі: перевірити, що порядок зростає, порахувати різниці, знайти розриви в нумерації.

```python live
from itertools import pairwise

orders = [1, 2, 4, 5, 9]
print(list(pairwise(orders)))
print(all(a < b for a, b in pairwise(orders)))
print([b - a for a, b in pairwise(orders)])
print([(a, b) for a, b in pairwise(orders) if b - a > 1])
print(list(pairwise("x")))
```

```text
[(1, 2), (2, 4), (4, 5), (5, 9)]
True
[1, 2, 1, 4]
[(2, 4), (5, 9)]
[]
```

`takewhile(pred, xs)` віддає елементи, поки предикат істинний, і зупиняється на першому хибному; `dropwhile(pred, xs)` пропускає їх, а далі віддає все, включно з подальшими елементами, для яких предикат знову істинний. Це `_.takeWhile` і `_.dropWhile`, тільки ліниві. Класичне застосування: розібрати файл, де спершу йдуть заголовки, потім порожній рядок і тіло.

```python live
from itertools import dropwhile, takewhile

lines = ["title: Sign up", "theme: dark", "", "<form>", "</form>"]
print(list(takewhile(bool, lines)))
print(list(dropwhile(bool, lines)))
print(list(takewhile(lambda n: n < 3, [1, 2, 5, 1])))
print(list(dropwhile(lambda n: n < 3, [1, 2, 5, 1])))
```

```text
['title: Sign up', 'theme: dark']
['', '<form>', '</form>']
[1, 2]
[5, 1]
```

> **Пастка.** Щоб дізнатися, що час зупинитись, `takewhile` мусить прочитати перший елемент, що не пройшов перевірку. Із списку це непомітно, але зі спільного ітератора цей елемент зникає: він уже спожитий і нікуди не повертається. Якщо після `takewhile` ви продовжуєте читати те саме джерело, перший "чужий" елемент втрачено.

```python
from itertools import takewhile

it = iter([1, 2, 5, 3, 1])
print(list(takewhile(lambda n: n < 3, it)))
print(list(it))
```

```text
[1, 2]
[3, 1]
```

`zip_longest(*its, fillvalue=None)` доходить до кінця найдовшого iterable і заповнює дірки `fillvalue`. Тут JS-інтуїція перевернута: `_.zip` з lodash поводиться саме як `zip_longest` і доповнює `undefined`, а вбудований `zip` у Python мовчки обрізає по найкоротшому (m1-l06). Переносячи код з lodash, легко отримати тиху втрату даних.

```ts
_.zip(["email", "phone", "age"], ["a@b.c"]);
// [["email", "a@b.c"], ["phone", undefined], ["age", undefined]]
```

```python
from itertools import zip_longest

names = ["email", "phone", "age"]
values = ["a@b.c"]
print(list(zip(names, values)))
print(list(zip_longest(names, values)))
print(dict(zip_longest(names, values, fillvalue="")))
```

```text
[('email', 'a@b.c')]
[('email', 'a@b.c'), ('phone', None), ('age', None)]
{'email': 'a@b.c', 'phone': '', 'age': ''}
```

Розходження в замовчуванні: lodash за замовчуванням доповнює, Python за замовчуванням обрізає. Вибір між трьома варіантами в Python явний: `zip` коли коротший потік легально задає довжину, `zip(..., strict=True)` коли довжини зобов'язані збігатися, `zip_longest` коли пропуски треба заповнити.

## Комбінаторика й накопичення: product, combinations, accumulate

`product(*its, repeat=1)` це декартів добуток (cartesian product, так його називає документація), тобто вкладені цикли, записані одним виразом. У JS це вкладені `flatMap`, у lodash окремої функції немає. У m1-l06 `product` вже з'являвся як спосіб вийти з вкладених циклів одним `break`; тут він як генератор комбінацій, наприклад усіх варіантів сторінки для попереднього рендеру.

```ts
const variants = themes.flatMap((t) => locales.map((l) => [t, l]));
```

```python
from itertools import product

themes = ["light", "dark"]
locales = ["uk", "en", "pl"]
print(list(product(themes, locales)))
print(len(list(product(themes, locales))))
print(list(product([0, 1], repeat=2)))
```

```text
[('light', 'uk'), ('light', 'en'), ('light', 'pl'), ('dark', 'uk'), ('dark', 'en'), ('dark', 'pl')]
6
[(0, 0), (0, 1), (1, 0), (1, 1)]
```

Розходження в тому, що `product` не будує проміжних масивів: варіанти віддаються по одному, і якщо їх тисячі, у пам'яті одночасно лише поточний. Зате всі вхідні iterable він читає повністю й одразу, бо кожен з них треба обійти багато разів; нескінченний потік у `product` передавати не можна.

`permutations(xs, r)` віддає впорядковані вибірки довжини `r` (порядок має значення, `(a, b)` і `(b, a)` різні), `combinations(xs, r)` невпорядковані (кожна пара один раз), `combinations_with_replacement` дозволяє повтори. Кількість результатів рахують `math.perm` і `math.comb`, не перебираючи їх. У lodash нічого з цього немає. Найчастіша практична задача з цієї групи: перевірити всі пари елементів між собою, не порівнюючи елемент із самим собою й не перевіряючи пару двічі.

```python live
import math
from itertools import combinations, permutations

fields = ["email", "phone", "age"]
print(list(permutations(fields, 2)))
print(list(combinations(fields, 2)))
print(math.perm(3, 2), math.comb(3, 2), math.comb(50, 2))

labels = {"email": "Contact", "phone": "Contact", "age": "Age"}
for a, b in combinations(labels, 2):
    if labels[a] == labels[b]:
        print("same label:", a, b)
```

```text
[('email', 'phone'), ('email', 'age'), ('phone', 'email'), ('phone', 'age'), ('age', 'email'), ('age', 'phone')]
[('email', 'phone'), ('email', 'age'), ('phone', 'age')]
6 3 1225
same label: email phone
```

`accumulate(xs, func=operator.add, *, initial=None)` віддає проміжні результати згортки: не лише фінальну суму, а кожну часткову. Це `scan` з RxJS; у lodash і в масивах JS його немає, там пишуть `reduce`, що штовхає значення в масив-акумулятор. Функція за замовчуванням додавання, але підходить будь-яка функція двох аргументів: `max` дає поточний максимум, `operator.mul` поточний добуток. `initial` додає стартове значення першим елементом виводу.

```ts
const offsets = counts.reduce<number[]>((acc, n) => [...acc, acc.at(-1)! + n], [0]);
```

```python
import operator
from itertools import accumulate

counts = [3, 1, 4]
print(list(accumulate(counts)))
print(list(accumulate(counts, initial=0)))
print(list(accumulate([2, 5, 3, 7, 1], max)))
print(list(accumulate([1, 2, 3, 4], operator.mul)))
```

```text
[3, 4, 8]
[0, 3, 4, 8]
[2, 5, 5, 7, 7]
[1, 2, 6, 24]
```

Розходження з JS-версією не лише в довжині. `accumulate(counts, initial=0)` дає зміщення початку кожної сторінки: сторінка 1 починається з елемента 0, друга з 3, третя з 4, а останнє число це загальна кількість. Ця задача (глобальна нумерація полів по сторінках) у FormBuilder виникає щоразу, коли рендерер показує "питання 5 з 8".

У модулі є ще кілька функцій, які рідше потрібні, але корисно знати, що вони є: `compress(data, selectors)` фільтрує за маскою з булевих значень, `filterfalse(pred, xs)` це `_.reject`, а `starmap(f, pairs)` викликає `f(*pair)` для кожного кортежу.

```python live
from itertools import compress, filterfalse, starmap

fields = ["email", "phone", "age"]
print(list(compress(fields, [True, False, True])))
print(list(filterfalse(lambda f: f.startswith("e"), fields)))
print(list(starmap(pow, [(2, 3), (10, 2)])))
```

```text
['email', 'age']
['phone', 'age']
[8, 100]
```

## Один ітератор, кілька споживачів: groupby, tee і конвеєр

`groupby` групує лише сусідні елементи з однаковим ключем і тому потребує попереднього `sorted`; це не `_.groupBy`, для групування в словник є `defaultdict(list)`, детально в m2-l04. Тут важливе інше: групи, які він віддає, це не окремі списки, а вікна в один спільний ітератор. Коли зовнішній цикл просувається до наступного ключа, попередня група стає недійсною, і її елементи вже не прочитати.

```python
from itertools import groupby

elements = [("p1", "email"), ("p1", "phone"), ("p2", "age")]
groups = list(groupby(elements, key=lambda e: e[0]))
print([(page, list(group)) for page, group in groups])

by_page = {page: [e[1] for e in group] for page, group in groupby(elements, key=lambda e: e[0])}
print(by_page)
```

```text
[('p1', []), ('p2', [])]
{'p1': ['email', 'phone'], 'p2': ['age']}
```

Правило звідси: групу треба спожити всередині тієї ітерації, в якій вона з'явилась, наприклад comprehension-ом, як у другому прикладі. Будь-який споживач, що спершу проходить зовнішній ітератор до кінця (`list`, `dict`, `sorted`), отримає порожні групи без жодної помилки.

<!-- task: q2 -->

`tee(it, n=2)` розщеплює один ітератор на `n` незалежних. Найближчий JS-аналог `ReadableStream.prototype.tee()` з Web Streams; у lodash і серед iterator helpers такого немає. Механізм простий: `tee` тримає буфер елементів, які вже прочитав найшвидший споживач, але ще не прочитав найповільніший. Коли один з них іде вперед, елементи з джерела потрапляють у буфер, а другий потім читає їх звідти, не торкаючись джерела.

```python
from itertools import tee

def source():
    for n in range(1, 4):
        print("read", n)
        yield n

a, b = tee(source())
print(list(a))
print(list(b))
```

```text
read 1
read 2
read 3
[1, 2, 3]
[1, 2, 3]
```

Звідси дві пастки. Якщо один споживач проходить потік повністю раніше за інший, буфер вміщує весь потік, і `tee` нічим не кращий за `list`, тільки складніший; документація прямо радить у такому разі `list()`. `tee` виправданий, коли копії просуваються приблизно разом, як у рецепті `pairwise`: одна копія відстає від іншої рівно на один елемент.

> **Пастка.** Після `tee` оригінальний ітератор чіпати не можна. Копії читають з того самого джерела, і все, що ви заберете напряму, зникне з обох копій без попередження. Безпечний звичай: одразу перезаписати змінну, `it, copy = tee(it)`.

```python
from itertools import tee

it = iter(["e1", "e2", "e3", "e4"])
a, b = tee(it)
print(next(it))
print(list(a), list(b))
```

```text
e1
['e2', 'e3', 'e4'] ['e2', 'e3', 'e4']
```

Тепер усе разом. Конвеєр з itertools це вкладені виклики, кожен з яких тягне з попереднього по одному елементу. Нижче сторінки завантажуються генератором, сплющуються `chain.from_iterable`, нормалізуються `map`, фільтруються `filter`, і `islice` забирає перші три. Друк показує порядок: кожне поле проходить весь ланцюжок до того, як береться наступне, і як тільки `islice` отримав три, решта сторінок не завантажується.

```python
from itertools import chain, islice

def load_pages():
    for n, page in enumerate([["Email ", " phone"], ["", "Age"], ["plan"]], start=1):
        print("load page", n)
        yield page

def normalize(label):
    print("  normalize", repr(label))
    return label.strip().lower()

visible = filter(None, map(normalize, chain.from_iterable(load_pages())))
print(list(islice(visible, 3)))
```

```text
load page 1
  normalize 'Email '
  normalize ' phone'
load page 2
  normalize ''
  normalize 'Age'
['email', 'phone', 'age']
```

Той самий конвеєр генераторною функцією (m5-l02). Довше, але читається зверху вниз, а не зсередини назовні, і в ньому природно з'являються речі, які в itertools-версію не вкладаються: лічильник, умова з кількох частин, `try/except` навколо одного кроку, лог на межі сторінок.

```python
def first_visible(pages, limit):
    taken = 0
    for page in pages:
        for label in page:
            label = label.strip().lower()
            if not label:
                continue
            yield label
            taken += 1
            if taken == limit:
                return

print(list(first_visible([["Email ", " phone"], ["", "Age"], ["plan"]], 3)))
```

```text
['email', 'phone', 'age']
```

Межа така. Якщо кожен крок це вже названа функція (`str.strip`, `normalize`, `is_visible`) і кроків два-три, ланцюжок itertools або генераторний вираз читається добре. Якщо для кроку доводиться писати lambda, якщо потрібен стан між елементами або кроків більше трьох, генераторна функція чесніша: її можна назвати, протестувати окремо й прочитати без розмотування дужок. Обидва варіанти однаково ліниві, тож це вибір читабельності, а не продуктивності.

<!-- task: t2 -->

## partial, reduce, cmp_to_key, total_ordering

`functools` збирає функції, що працюють з іншими функціями: приймають їх, повертають їх або змінюють. `partial` уже розібраний у m1-l09: фіксація аргументів у момент створення, атрибути `func`, `args`, `keywords`, порівняння з `bind` і з lambda. Дві речі, яких там не було. Вкладений `partial` сплющується в один об'єкт, тож ланцюжок налаштувань не створює ланцюжка обгорток. І `partial` від функції модуля можна серіалізувати через `pickle`, а lambda не можна, що стане важливим у m5-l08, де функції передаються в інші процеси.

```python
import pickle
from functools import partial

def render(el, theme, locale):
    return f"{el}:{theme}:{locale}"

dark = partial(render, theme="dark")
dark_uk = partial(dark, locale="uk")
print(dark_uk.func is render, dark_uk.args, dark_uk.keywords)
print(dark_uk("email"))

print(pickle.loads(pickle.dumps(dark_uk))("phone"))
try:
    pickle.dumps(lambda el: render(el, "dark", "uk"))
except Exception as e:
    print(type(e).__name__)
```

```text
True () {'theme': 'dark', 'locale': 'uk'}
email:dark:uk
phone:dark:uk
PicklingError
```

`partialmethod` це те саме для методів класу: він фіксує аргументи, але залишає місце для `self`, тож `set_dark = partialmethod(set_theme, "dark")` у тілі класу дає метод, який викликається як `obj.set_dark()`.

```python
from functools import partialmethod

class Page:
    theme = "light"

    def set_theme(self, theme):
        self.theme = theme

    set_dark = partialmethod(set_theme, "dark")

p = Page()
p.set_dark()
print(p.theme)
```

```text
dark
```

`reduce(func, iterable, initial)` згортає послідовність зліва направо: `reduce(f, [a, b, c], init)` обчислює `f(f(f(init, a), b), c)`. Це `Array.prototype.reduce` з двома відмінностями: колбек отримує лише акумулятор і елемент (без індексу й масиву), а аргументи йдуть у порядку "функція, дані, старт".

```ts
const total = [1, 2, 3].reduce((acc, x) => acc + x, 10);
```

```python
from functools import reduce

def step(acc, x):
    print(f"step({acc}, {x})")
    return acc + x

print(reduce(step, [1, 2, 3], 10))
```

```text
step(10, 1)
step(11, 2)
step(13, 3)
16
```

Розходження ще в одному: `reduce` у Python 3 навіть не вбудована функція, її винесли в `functools`. Причина в тому, що майже кожна поширена згортка має власну назву, яка читається краще за акумулятор: `sum`, `max`, `min`, `math.prod`, `"".join`, `any`, `all`, `collections.Counter`, а для проміжних значень `accumulate` (заміни детально в m1-l09 і m1-l10). `reduce` доречний там, де згортка не має назви, але природно описується як "застосовуй ту саму двомісну операцію по черзі". Таких випадків три поширених: прохід по шляху в дереві (`_.get`), композиція функцій (`_.flow`) і злиття кількох однорідних об'єктів. Модуль `operator` (m1-l09) дає для них готові двомісні функції: `getitem`, `or_`.

```python live
import operator
from functools import reduce

config = {"pages": [{"fields": [{"id": "email"}, {"id": "phone"}]}]}
path = ["pages", 0, "fields", 1, "id"]
print(reduce(operator.getitem, path, config))

def compose(*fns):
    return lambda x: reduce(lambda acc, fn: fn(acc), fns, x)

slugify = compose(str.strip, str.lower, lambda s: s.replace(" ", "-"))
print(slugify("  First Name "))

defaults = {"theme": "light", "locale": "uk"}
form = {"theme": "dark"}
override = {"locale": "en"}
print(reduce(operator.or_, [defaults, form, override]))
print(sorted(reduce(operator.and_, [{"email", "phone", "age"}, {"email", "age"}, {"age", "email", "plan"}])))
```

```text
phone
first-name
{'theme': 'dark', 'locale': 'en'}
['age', 'email']
```

> **Пастка.** На порожній послідовності без стартового значення `reduce` падає, а не повертає `undefined`, як і `[].reduce(f)` у JS. А стартове значення в 3.12 можна передати лише позиційно: `initial=` як ключовий аргумент дає `TypeError` (ключовим він став лише в 3.14).

```python
from functools import reduce
import operator

print(reduce(operator.add, [], 0))
print(reduce(operator.add, []))
```

```text
0
TypeError: reduce() of empty iterable with no initial value
```

```python
from functools import reduce
import operator

print(reduce(operator.add, [1, 2], initial=0))
```

```text
TypeError: reduce() takes no keyword arguments
```

<!-- task: t3 -->

`cmp_to_key` перетворює компаратор `(a, b) -> int` на key-функцію для `sorted`. У m1-l09 показано, чому key кращий за компаратор; `cmp_to_key` лишається для коду, який прийшов готовим компаратором, наприклад перенесеного з фронтенду, або для функцій стандартної бібліотеки, що вже мають форму компаратора. Нове сортування краще одразу писати через кортеж-ключ.

```ts
const byPriority = (a: Field, b: Field) => b.priority - a.priority || a.id.localeCompare(b.id);
```

```python
from functools import cmp_to_key

def by_priority(a, b):
    return (b["priority"] - a["priority"]) or (a["id"] > b["id"]) - (a["id"] < b["id"])

fields = [{"id": "phone", "priority": 1}, {"id": "email", "priority": 5}, {"id": "age", "priority": 5}]
print([f["id"] for f in sorted(fields, key=cmp_to_key(by_priority))])
print([f["id"] for f in sorted(fields, key=lambda f: (-f["priority"], f["id"]))])
```

```text
['age', 'email', 'phone']
['age', 'email', 'phone']
```

Різниця видна на `localeCompare`: у Python немає вбудованого тризначного порівняння рядків, тому порт компаратора обростає виразом `(a > b) - (a < b)`. Кортеж-ключ у другому рядку робить те саме без цього.

`total_ordering` це декоратор класу: ви визначаєте `__eq__` і один з методів порівняння (`__lt__`, `__le__`, `__gt__` або `__ge__`), а решту він дописує через них. Ці методи в документації називаються rich comparison methods, детально про них і про те, як `sorted` порівнює об'єкти без `key`, у m4-l02. Для dataclass те саме дає `@dataclass(order=True)` (m2-l05), але він порівнює всі поля по черзі, а `total_ordering` дозволяє задати власне правило.

```python
from functools import total_ordering

@total_ordering
class Version:
    def __init__(self, text):
        self.parts = tuple(int(p) for p in text.split("."))

    def __eq__(self, other):
        return self.parts == other.parts

    def __lt__(self, other):
        return self.parts < other.parts

print(Version("1.10") > Version("1.9"), Version("1.2") >= Version("1.2"))
print(sorted(["1.10", "1.9", "1.2"], key=Version))
print(sorted(["1.10", "1.9", "1.2"]))
```

```text
True True
['1.2', '1.9', '1.10']
['1.10', '1.2', '1.9']
```

## cache і lru_cache: мемоізація з умовами

Мемоізація (memoization, загальний CS-термін; документація `functools` каже "memoizing callable") означає, що функція запам'ятовує результат для кожного набору аргументів і при повторному виклику повертає його, не виконуючи тіло. `@cache` (3.9+) зберігає все без обмежень, `@lru_cache(maxsize=128)` тримає не більше `maxsize` записів і викидає ті, до яких найдовше не звертались (LRU, least recently used, офіційна назва стратегії в документації). Обидва дають `cache_info()` зі статистикою і `cache_clear()` для скидання.

```ts
const loadTheme = _.memoize((name: string) => readThemeFile(name));
loadTheme("dark");
loadTheme.cache.clear();
```

```python
from functools import cache

reads = []

@cache
def load_theme(name: str) -> dict:
    reads.append(name)
    return {"name": name, "primary": "#2563eb"}

load_theme("dark")
load_theme("dark")
load_theme("light")
print(reads)
print(load_theme.cache_info())
load_theme.cache_clear()
load_theme("dark")
print(reads)
```

```text
['dark', 'light']
CacheInfo(hits=1, misses=2, maxsize=None, currsize=2)
['dark', 'light', 'dark']
```

Розходження з `_.memoize` у ключі. Lodash за замовчуванням бере ключем лише перший аргумент і кладе його в `Map`, тому `memoize(f)(1, 2)` і `memoize(f)(1, 3)` повернуть те саме, якщо не передати resolver. Python будує ключ з усіх аргументів, позиційних і ключових, і кладе його в словник. Звідси вимога: усі аргументи мають бути hashable (офіційний термін з глосарію: об'єкт, хеш якого не змінюється за час життя, і тому він може бути ключем словника). Рядки, числа, кортежі, `frozenset`, frozen dataclass підходять; списки, словники й множини ні.

```python
from functools import cache

@cache
def count_required(field_ids):
    return len(field_ids)

print(count_required(("email", "phone")))
print(count_required(["email", "phone"]))
```

```text
2
TypeError: unhashable type: 'list'
```

Ключ складається з аргументів буквально так, як їх передали, без нормалізації. Виклики, які для функції означають одне й те саме, але записані по-різному, займають окремі записи: позиційний і ключовий аргумент, різний порядок ключових, явно переданий аргумент зі значенням за замовчуванням. Документація прямо попереджає, що такі виклики можуть кешуватись окремо.

```python
from functools import cache

@cache
def label(text, upper=False):
    return text.upper() if upper else text

label("email", upper=True)
label(upper=True, text="email")
label(text="email", upper=True)
print(label.cache_info())
```

```text
CacheInfo(hits=0, misses=3, maxsize=None, currsize=3)
```

<!-- task: q3 -->

`lru_cache(maxsize=n)` потрібен, коли різних аргументів може бути багато, а пам'ять не безмежна: теми, локалі, шаблони. Кожен успішний виклик піднімає запис нагору, а при переповненні викидається той, що внизу. `maxsize=None` дає те саме, що `@cache`.

```python live
from functools import lru_cache

reads = []

@lru_cache(maxsize=2)
def load_theme(name: str) -> str:
    reads.append(name)
    return name.upper()

for name in ["light", "dark", "light", "contrast", "dark"]:
    load_theme(name)
print(reads)
print(load_theme.cache_info())
```

```text
['light', 'dark', 'contrast', 'dark']
CacheInfo(hits=1, misses=4, maxsize=2, currsize=2)
```

`light` прочитано один раз, бо третій виклик підняв його нагору, і при появі `contrast` викинуто `dark`, тож останній виклик знову пішов на диск.

> **Пастка.** Кеш повертає той самий об'єкт, а не копію. Якщо функція повертає список чи словник і хтось змінить результат, змінений об'єкт отримають усі наступні виклики. У `_.memoize` це та сама проблема, але в Python вона частіша, бо кешують зазвичай саме завантаження конфігів. Рішення: повертати незмінне (`tuple`, frozen dataclass, `types.MappingProxyType`, тобто read-only погляд на словник) або копіювати на виході.

```python
from functools import cache
from types import MappingProxyType

@cache
def default_fields(form_type: str) -> list[str]:
    return ["email"]

fields = default_fields("signup")
fields.append("phone")
print(default_fields("signup"))

@cache
def load_theme(name: str) -> MappingProxyType:
    return MappingProxyType({"name": name, "primary": "#2563eb"})

theme = load_theme("dark")
try:
    theme["primary"] = "red"
except TypeError as e:
    print(e)
```

```text
['email', 'phone']
'mappingproxy' object does not support item assignment
```

> **Пастка.** `@cache` або `@lru_cache` на методі класу кешує за ключем, у якому є `self`. Кеш живе на функції, тобто на класі, а не на екземплярі, і тримає сильне посилання на кожен `self`, з яким метод викликали. Екземпляри ніколи не звільняються, кеш росте, а `maxsize` лише обмежує цей ріст. Ruff ловить це правилом B019.

```python
import gc
import weakref
from functools import cache

class Renderer:
    @cache
    def render(self, el_id: str) -> str:
        return f"<div id={el_id}>"

r = Renderer()
r.render("email")
alive = weakref.ref(r)
del r
gc.collect()
print(alive() is not None)
print(Renderer.render.cache_info().currsize)
```

```text
True
1
```

Виправлення залежить від того, що насправді кешується. Якщо результат не залежить від екземпляра, винесіть функцію на рівень модуля з hashable аргументами. Якщо треба обчислити щось один раз на екземпляр, це `functools.cached_property`: він кладе значення в `__dict__` самого екземпляра і зникає разом з ним (механізм і пастки в m4-l03).

Кеш стає багом, коли результат залежить від чогось, крім аргументів: від часу, від файлу, який можуть змінити, від стану бази, від випадковості. Кешована функція "поточний час" завжди повертає перший час. Кешоване читання теми з диска не побачить, що дизайнер змінив файл, поки процес не перезапустять. Для таких функцій або не кешують, або додають у ключ щось, що змінюється разом з даними (час модифікації файлу, версію), або явно викликають `cache_clear()`. Оригінальна некешована функція доступна як `__wrapped__`, це зручно в тестах.

```python
from functools import cache

THEME_FILES = {"dark": {"primary": "#000"}}

@cache
def load_theme(name: str) -> dict:
    return dict(THEME_FILES[name])

print(load_theme("dark"))
THEME_FILES["dark"] = {"primary": "#111"}
print(load_theme("dark"))
print(load_theme.__wrapped__("dark"))
load_theme.cache_clear()
print(load_theme("dark"))
```

```text
{'primary': '#000'}
{'primary': '#000'}
{'primary': '#111'}
{'primary': '#111'}
```

> **Під капотом.** Ключ кешу будується з кортежу позиційних аргументів, маркера-роздільника і пар ключових аргументів у порядку передачі. Тому ключові аргументи в різному порядку дають різні ключі. Сам кеш це словник плюс, для `lru_cache`, двозв'язний список, що тримає порядок звернень; обидва реалізовані на C. Структура кешу потокобезпечна, але функція може виконатись двічі для одного ключа, якщо два потоки прийшли одночасно до того, як результат записано.

<!-- task: t4 -->

## wraps: що обгортка губить без нього

Будь-яка функція, що обгортає іншу (декоратор, logging-обгортка, кеш), повертає новий об'єкт-функцію, обгортку (wrapper, так її називає й документація `functools`). Без додаткових зусиль цей об'єкт має власне ім'я, порожній docstring і сигнатуру `(*args, **kwargs)`, тож traceback, документація, `help()`, pytest і FastAPI бачать обгортку, а не вашу функцію. `functools.wraps(original)` копіює метадані оригіналу на обгортку і додає атрибут `__wrapped__` з посиланням на оригінал. Декоратори повністю, з параметрами й типізацією, розібрані в m5-l04; тут лише "до" і "після".

```python
import inspect

def logged(fn):
    def wrapper(*args, **kwargs):
        print("call", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper

@logged
def render_field(field_id: str, *, theme: str = "light") -> str:
    """Render one field as HTML."""
    return f"<input id={field_id} class={theme}>"

print(render_field("email"))
print(render_field.__name__, render_field.__doc__)
print(inspect.signature(render_field))
print(hasattr(render_field, "__wrapped__"))
```

```text
call render_field
<input id=email class=light>
wrapper None
(*args, **kwargs)
False
```

```python
import inspect
from functools import wraps

def logged(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        print("call", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper

@logged
def render_field(field_id: str, *, theme: str = "light") -> str:
    """Render one field as HTML."""
    return f"<input id={field_id} class={theme}>"

print(render_field("email"))
print(render_field.__name__, render_field.__doc__)
print(inspect.signature(render_field))
print(render_field.__wrapped__("phone"))
```

```text
call render_field
<input id=email class=light>
render_field Render one field as HTML.
(field_id: str, *, theme: str = 'light') -> str
<input id=phone class=light>
```

> **JS-аналог.** Це проблема `displayName` у HOC з React: `withTheme(Button)` у DevTools показується як `Anonymous` або ім'я обгортки, поки не написати `Wrapped.displayName = ...` руками. `wraps` робить це одним рядком і для всіх атрибутів одразу. `inspect.signature` бачить справжню сигнатуру саме через `__wrapped__`: він іде за цим посиланням до оригіналу.

Список того, що копіюється, лежить у константах модуля: `WRAPPER_ASSIGNMENTS` перезаписуються на обгортці, `WRAPPER_UPDATES` об'єднуються з її власними. `@cache` і `@lru_cache` роблять те саме всередині, тому в попередньому розділі `load_theme.__wrapped__` існував. Без декоратора те саме робить `functools.update_wrapper(wrapper, fn)`.

```python
from functools import WRAPPER_ASSIGNMENTS, WRAPPER_UPDATES, cache

print(WRAPPER_ASSIGNMENTS)
print(WRAPPER_UPDATES)

@cache
def load_theme(name: str) -> str:
    """Load theme from disk."""
    return name

print(load_theme.__name__, load_theme.__doc__)
print(type(load_theme).__name__, type(load_theme.__wrapped__).__name__)
```

```text
('__module__', '__name__', '__qualname__', '__doc__', '__annotations__', '__type_params__')
('__dict__',)
load_theme Load theme from disk.
_lru_cache_wrapper function
```

## singledispatch: вибір реалізації за типом

Рендерер елементів з dataclass-ами (m2-l05) неминуче приходить до питання "яка функція для цього типу". У TS це discriminated union і `switch (el.type)` з перевіркою вичерпності компілятором. У Python наївний переклад це ланцюжок `isinstance`, який росте з кожним новим типом і живе в одному файлі. `functools.singledispatch` перетворює функцію на generic function (офіційний термін з глосарію: функція з кількома реалізаціями для різних типів), де реалізація вибирається за типом першого аргументу. Сам механізм документація називає single dispatch.

```ts
type Element = { type: "input"; name: string } | { type: "text"; text: string };
function render(el: Element): string {
  switch (el.type) {
    case "input": return `<input name="${el.name}">`;
    case "text": return `<p>${el.text}</p>`;
  }
}
```

```python
from dataclasses import dataclass
from functools import singledispatch

@dataclass(frozen=True)
class Input:
    name: str

@dataclass(frozen=True)
class Text:
    text: str

@dataclass(frozen=True)
class Block:
    children: tuple = ()

@singledispatch
def render(el) -> str:
    raise TypeError(f"no renderer for {type(el).__name__}")

@render.register
def _(el: Input) -> str:
    return f'<input name="{el.name}">'

@render.register
def _(el: Text) -> str:
    return f"<p>{el.text}</p>"

@render.register
def _(el: Block) -> str:
    return "<div>" + "".join(render(child) for child in el.children) + "</div>"

print(render(Block((Text("Contact"), Input("email")))))
print(render(42))
```

```text
<div><p>Contact</p><input name="email"></div>
TypeError: no renderer for int
```

Розходження в тому, де живе знання про типи. TS-`switch` закритий: усі гілки в одному місці, зате компілятор перевіряє вичерпність. `singledispatch` відкритий: реалізацію для нового типу можна зареєструвати з будь-якого модуля, навіть з плагіна, не чіпаючи базову функцію, але перевірки вичерпності немає, і забутий тип виявляється лише в runtime через базову реалізацію. Тип для реєстрації береться з анотації першого параметра; ім'я `_` для реалізацій це конвенція спільноти, бо `register` повертає функцію, і без `_` кожна реалізація зайняла б ім'я в модулі.

Вибір реалізації йде за MRO (method resolution order, офіційний термін: порядок, у якому Python обходить предків класу, m4-l04): підклас без власної реєстрації отримує реалізацію найближчого предка. `register` приймає й тип явно, що потрібно для lambda чи вже готових функцій, а з 3.11 і union-анотації. `dispatch(cls)` показує, яка реалізація спрацює, а `registry` містить усі зареєстровані типи.

```python
from dataclasses import dataclass
from functools import singledispatch

@dataclass(frozen=True)
class Input:
    name: str

@dataclass(frozen=True)
class EmailInput(Input):
    pass

@singledispatch
def describe(el) -> str:
    return "unknown"

@describe.register
def _(el: Input) -> str:
    return f"input {el.name}"

@describe.register
def _(el: int | float) -> str:
    return f"number {el}"

describe.register(str, lambda el: f"text {el!r}")

print(describe(EmailInput("email")))
print(describe(3), describe(2.5), describe("hi"), describe(None))
print(describe.dispatch(EmailInput) is describe.registry[Input])
print(sorted(t.__name__ for t in describe.registry))
```

```text
input email
number 3 number 2.5 text 'hi' unknown
True
['Input', 'float', 'int', 'object', 'str']
```

> **Пастка.** Диспетчеризація йде лише за типом і лише першого аргументу. Значення не враховуються, тому для конфігів-словників, де тип записано в полі `"type"`, усі елементи потраплять в одну реалізацію для `dict`. Для таких даних лишається словник-реєстр з m1-l09 (`RENDERERS[el["type"]]`), а `singledispatch` вступає в гру тоді, коли конфіг уже перетворено на dataclass-и.

```python
from functools import singledispatch

@singledispatch
def render(el) -> str:
    return "?"

@render.register
def _(el: dict) -> str:
    return f"dict with type={el['type']}"

print(render({"type": "input"}))
print(render({"type": "text"}))
```

```text
dict with type=input
dict with type=text
```

<!-- task: q4 -->

`singledispatchmethod` робить те саме для методів: перший аргумент `self` пропускається, і тип береться з наступного. Це зручно, коли рендерер має стан, наприклад тему, і реалізації мають до неї доступ.

```python
from dataclasses import dataclass
from functools import singledispatchmethod

@dataclass(frozen=True)
class Input:
    name: str

@dataclass(frozen=True)
class Text:
    text: str

class HtmlRenderer:
    def __init__(self, theme: str):
        self.theme = theme

    @singledispatchmethod
    def render(self, el) -> str:
        raise TypeError(type(el).__name__)

    @render.register
    def _(self, el: Input) -> str:
        return f'<input name="{el.name}" class="{self.theme}">'

    @render.register
    def _(self, el: Text) -> str:
        return f'<p class="{self.theme}">{el.text}</p>'

r = HtmlRenderer("dark")
print(r.render(Text("Hi")), r.render(Input("email")))
```

```text
<p class="dark">Hi</p> <input name="email" class="dark">
```

<!-- task: t5 -->

## Для капстоуну

Публікація у FormBuilder збирає все з цього уроку в одну функцію. Тема читається з диска один раз на процес через `lru_cache` і повертається read-only, щоб жоден рендер не зіпсував її для наступних. Елементи це frozen dataclass-и (m2-l05), і `singledispatch` вибирає рендерер за типом. Тема фіксується один раз через `partial`, і далі в конвеєр іде готовий callable з одним аргументом. Сторінки рендеряться ліниво, а `batched` збирає готові файли в пачки для завантаження: сховище статики приймає кілька файлів за запит, але не всю форму одразу. Нижче диск імітовано словником, щоб приклад ішов у браузері; у капстоуні там буде `json.loads(Path(...).read_text())` (m6-l01, m6-l02).

```python
from dataclasses import dataclass
from functools import lru_cache, partial, singledispatch
from itertools import batched
from types import MappingProxyType

THEME_FILES = {"dark": {"input": "in-dark", "text": "tx-dark"}}
disk_reads: list[str] = []

@lru_cache(maxsize=8)
def load_theme(name: str) -> MappingProxyType:
    disk_reads.append(name)
    return MappingProxyType(dict(THEME_FILES[name]))

@dataclass(frozen=True)
class Input:
    name: str

@dataclass(frozen=True)
class Text:
    text: str

@singledispatch
def render(el, *, theme) -> str:
    raise TypeError(f"no renderer for {type(el).__name__}")

@render.register
def _(el: Input, *, theme) -> str:
    return f'<input name="{el.name}" class="{theme["input"]}">'

@render.register
def _(el: Text, *, theme) -> str:
    return f'<p class="{theme["text"]}">{el.text}</p>'

def render_pages(pages, theme_name):
    render_el = partial(render, theme=load_theme(theme_name))
    for n, page in enumerate(pages, start=1):
        yield f"page-{n}.html", "".join(map(render_el, page))

def publish(pages, theme_name, batch_size):
    for batch in batched(render_pages(pages, theme_name), batch_size):
        print("upload", [name for name, _ in batch])

pages = [
    [Text("Contact"), Input("email")],
    [Input("phone")],
    [Text("Thanks")],
]
publish(pages, "dark", batch_size=2)
publish(pages[:1], "dark", batch_size=2)
print(disk_reads)
print(next(render_pages(pages, "dark")))
```

```text
upload ['page-1.html', 'page-2.html']
upload ['page-3.html']
upload ['page-1.html']
['dark']
('page-1.html', '<p class="tx-dark">Contact</p><input name="email" class="in-dark">')
```

> **Для капстоуну.** Кешована тема не побачить зміну файлу, поки процес живий. У воркері, який працює тижнями, це баг: додайте в ключ час модифікації файлу (`load_theme(name, mtime)`, де `mtime = path.stat().st_mtime`), тоді новий файл дає новий ключ, а старий запис з часом витісниться за LRU. А `cache_clear()` у фікстурі pytest (m3-l03) прибирає витік стану між тестами: без нього тест, який підмінив тему, зламає наступний.

<!-- task: t6 -->

## Типові помилки JS-розробника

1. **Lodash-ланцюжок на масивах, перекладений через `list()` на кожному кроці.** Звичка "кожен крок дає масив" перетворюється на `list(map(...))`, `list(filter(...))`, і лінивість зникає: читається весь потік, навіть якщо потрібні перші три елементи. Правильно: тримати ітератори до самого кінця, `list()` один раз на виході, або генераторна функція.

   ```python
   names = list(map(str.strip, lines))                  # за звичкою
   names = list(filter(None, names))[:3]
   names = list(islice(filter(None, map(str.strip, lines)), 3))  # правильно
   ```

2. **Chunk через `slice` у циклі.** Переносять `for (i = 0; i < n; i += size) arr.slice(i, i + size)`, що вимагає списку й довжини. Правильно: `batched` з 3.12, який працює на будь-якому iterable й лінивий.

   ```python
   chunks = [ids[i:i + 2] for i in range(0, len(ids), 2)]  # за звичкою
   chunks = list(batched(ids, 2))                          # правильно
   ```

3. **`_.memoize` без думки про hashable і про спільний результат.** Кешують функцію, що приймає список (`TypeError: unhashable type`), або повертають з кешу список, який хтось потім змінює. Правильно: аргументи як `tuple` чи frozen dataclass, результат незмінний.

   ```python
   @cache
   def required_ids(field_ids: tuple[str, ...]) -> tuple[str, ...]:
       return tuple(f for f in field_ids if f != "note")
   ```

4. **`@cache` на методі.** Пишуть, як мемоізований метод класу в TS, і отримують кеш, що тримає всі екземпляри назавжди. Правильно: функція модуля з hashable аргументами або `cached_property`.

   ```python
   @lru_cache(maxsize=32)
   def render_cached(el: Input, theme: str) -> str: ...
   ```

5. **`reduce` для всього.** Сума, максимум, склеювання рядків, групування через акумулятор. Правильно: `sum`, `max`, `"".join`, `defaultdict`, `accumulate`; `reduce` лише для безіменних згорток на кшталт проходу по шляху.

   ```python
   total = reduce(lambda acc, x: acc + x["price"], items, 0)  # за звичкою
   total = sum(x["price"] for x in items)                     # правильно
   ```

6. **`_.zip` і `_.groupBy` як `zip` і `groupby`.** `_.zip` доповнює `undefined`, `zip` обрізає; `_.groupBy` збирає словник, `groupby` групує лише сусідів і віддає одноразові групи. Правильно: `zip_longest` для доповнення, `defaultdict(list)` для групування в словник.

   ```python
   pairs = list(zip_longest(names, values, fillvalue=""))
   ```

7. **`bind` або обгортка-lambda для фіксації аргументів.** `render_dark = lambda el: render(el, theme="dark")` працює, але не серіалізується, не показує в `repr`, що зафіксовано, і читає змінні в момент виклику. Правильно: `partial`.

   ```python
   render_dark = partial(render, theme="dark")
   ```

8. **Ланцюжок `isinstance` або `if el.type == ...` для dataclass-ів.** Переносять `switch` з discriminated union. Правильно: `singledispatch` для dataclass-ів, словник-реєстр для сирих dict-конфігів.

   ```python
   @render.register
   def _(el: Input) -> str: ...
   ```

## Підсумок

- itertools ліниві й однопрохідні: результат це ітератор, який нічого не обчислює до споживання і вичерпується після одного проходу.
- `chain.from_iterable` сплющує на рівень, `islice` ріже будь-який iterable і споживає джерело, `count`, `cycle`, `repeat` нескінченні й обмежуються `zip`, `islice` або `takewhile`.
- `batched` (3.12) замість chunk через `slice`, `pairwise` для сусідів, `zip_longest` там, де lodash-`zip` доповнював `undefined`.
- `takewhile` з'їдає перший елемент, що не пройшов; `groupby` інвалідує попередню групу; оригінал після `tee` не чіпати.
- Конвеєр з itertools для двох-трьох названих кроків, генераторна функція, коли потрібні стан, lambda чи більше кроків.
- `reduce` лише для згорток без назви: шлях у дереві, композиція, злиття; порожнє без старту падає, `initial` у 3.12 тільки позиційно.
- `cache`/`lru_cache` будують ключ з усіх аргументів буквально як передані; аргументи мають бути hashable, результат краще повертати незмінним.
- Кеш на методі тримає `self` назавжди; кеш на функції, що залежить від часу чи файлу, повертає застарілі дані без `cache_clear()` або версії в ключі.
- `wraps` копіює `__name__`, `__doc__`, анотації й додає `__wrapped__`, за яким `inspect.signature` бачить справжню сигнатуру.
- `singledispatch` обирає реалізацію за типом першого аргументу через MRO; відкритий для розширення, але без перевірки вичерпності й без диспетчеризації за значенням.

## Що далі

Наступний урок m5-l04 про декоратори: `@cache`, `@singledispatch` і `@total_ordering` звідси там стають прикладами загального механізму, а `wraps` з'являється в кожному написаному декораторі, з параметрами, для методів і для корутин. Реєстр рендерерів з цього уроку там отримує власний декоратор `@register("input")` як альтернативу `singledispatch` для конфігів, де тип записано рядком.
