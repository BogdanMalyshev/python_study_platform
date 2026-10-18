---
id: m2-l04
module: m2-data-typing
title: "collections: Counter, defaultdict, deque, namedtuple"
summary: "Учень рахує через Counter, групує через defaultdict, тримає чергу в deque, описує незмінні записи через NamedTuple і складає шари конфігурації через ChainMap, знаючи, коли вистачає вбудованого dict і де кожна структура підводить."
duration_min: 75
prerequisites: [m2-l03]
---

## Counter: підрахунок одним викликом

Модуль `collections` це набір спеціалізованих контейнерів поверх `dict`, `list` і `tuple`. Перший з них, `Counter`, закриває задачу, яку в JS розв'язують `reduce` з об'єктом-акумулятором: скільки разів кожне значення зустрілось. `Counter` приймає будь-який iterable і повертає словник "елемент → кількість".

```ts
const types = ["text", "email", "text", "select", "text", "email"];
const counts = types.reduce<Record<string, number>>((acc, t) => {
  acc[t] = (acc[t] ?? 0) + 1;
  return acc;
}, {});
console.log(counts.checkbox); // undefined
```

```python
from collections import Counter

types = ["text", "email", "text", "select", "text", "email"]
counts = Counter(types)
print(counts)
print(counts["text"], counts["checkbox"])
print("checkbox" in counts)
print(isinstance(counts, dict))
```

```text
Counter({'text': 3, 'email': 2, 'select': 1})
3 0
False
True
```

Розходження в трьох місцях. Акумулятора немає: прохід по iterable і `+1` зроблені всередині конструктора. Відсутній ключ дає `0`, а не `undefined` і не `KeyError`, як у звичайного `dict`, причому читання не додає ключ у лічильник, тому `in` після нього все ще `False`. І результат це справжній `dict` (підклас), тож `items()`, `json.dumps`, `dict(...)` працюють без перетворень.

`most_common(n)` повертає `n` пар з найбільшими лічильниками, без аргументу всі пари за спаданням. `total()` (з 3.10) це сума всіх лічильників, раніше писали `sum(c.values())`. `elements()` робить зворотне до конструктора: ітератор, який повторює кожен елемент стільки разів, скільки його нарахували.

```python live
from collections import Counter

counts = Counter(["text", "email", "text", "select", "text", "email"])
print(counts.most_common(2))
print(counts.most_common())
print(counts.total())
print(sorted(counts.elements()))
```

```text
[('text', 3), ('email', 2)]
[('text', 3), ('email', 2), ('select', 1)]
6
['email', 'email', 'select', 'text', 'text', 'text']
```

> **Пастка.** При рівних лічильниках `most_common` не сортує за ключем: пари з однаковою кількістю йдуть у порядку першої появи елемента у вхідних даних. Якщо результат іде в API, тест або UI, рівність треба розв'язати явно через `sorted` з ключем `(-count, name)`, інакше порядок залежить від порядку вводу.

```python
from collections import Counter

counts = Counter(["select", "text", "email", "text", "email"])
print(counts.most_common())
print(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))
```

```text
[('text', 2), ('email', 2), ('select', 1)]
[('email', 2), ('text', 2), ('select', 1)]
```

Анотація пишеться як `Counter[str]`: клас з `collections` параметризується напряму, як `list[str]`. `typing.Counter`, `typing.DefaultDict`, `typing.Deque` це застарілі псевдоніми з часів до 3.9, у новому коді їх не імпортують (детально про generics у m2-l06).

```python live
from collections import Counter

def count_types(elements: list[dict[str, str]]) -> Counter[str]:
    return Counter(el["type"] for el in elements)

form = [{"id": "email", "type": "email"}, {"id": "name", "type": "text"}, {"id": "bio", "type": "text"}]
print(count_types(form))
print(count_types([]))
```

```text
Counter({'text': 2, 'email': 1})
Counter()
```

<!-- task: t1 -->

## Арифметика лічильників і `update`

`Counter` це мультимножина (multiset; так його називає документація, у спільноті ще кажуть "bag"): множина, де кожен елемент має кратність. Звідси операції: `+` додає кратності, `-` віднімає, `&` бере мінімум, `|` максимум. Усі чотири повертають новий `Counter` і викидають елементи, у яких результат нуль або менше.

```python
from collections import Counter

v1 = Counter(text=3, email=1, select=1)
v2 = Counter(text=2, email=1, checkbox=2)
print(v1 + v2)
print(v2 - v1)
print(v1 - v2)
print(v1 & v2)
print(v1 | v2)
```

```text
Counter({'text': 5, 'email': 2, 'checkbox': 2, 'select': 1})
Counter({'checkbox': 2})
Counter({'text': 1, 'select': 1})
Counter({'text': 2, 'email': 1})
Counter({'text': 3, 'checkbox': 2, 'email': 1, 'select': 1})
```

Відкидання від'ємних зручне для "скільки ще треба", але губить інформацію, коли потрібна різниця зі знаком: `v2 - v1` не каже, що `select` зник. Для цього є метод `subtract`, який змінює лічильник на місці й залишає нулі та від'ємні значення. Унарний `+c` потім прибирає все, що не більше нуля, а `-c` дає додатні лічильники для від'ємних.

```python
from collections import Counter

v1 = Counter(text=3, email=1, select=1)
v2 = Counter(text=2, email=1, checkbox=2)
diff = Counter(v2)
diff.subtract(v1)
print(diff)
print(+diff)
print(-diff)
```

```text
Counter({'checkbox': 2, 'email': 0, 'text': -1, 'select': -1})
Counter({'checkbox': 2})
Counter({'text': 1, 'select': 1})
```

> **Пастка.** `Counter.update` додає, а не замінює, на відміну від `dict.update`. Звичка "update перезаписує ключі" тут дає подвоєні лічильники. Приймає і словник лічильників, і просто iterable елементів.

```python
from collections import Counter

c = Counter(text=1)
c.update({"text": 5})
c.update(["text", "email"])
print(c)

d = {"text": 1}
d.update({"text": 5})
print(d)
```

```text
Counter({'text': 7, 'email': 1})
{'text': 5}
```

> **Під капотом.** `Counter` не перевизначає `__getitem__`. Звичайний `dict.__getitem__`, не знайшовши ключ, перевіряє, чи є в класу метод `__missing__`, і якщо є, повертає його результат замість `KeyError`. `Counter.__missing__` просто повертає `0` і нічого не записує. Той самий гачок використовує `defaultdict`, але записує, і звідси різниця в поведінці, розібрана нижче. Методи з подвійним підкресленням називають dunder-методами (dunder; жаргон спільноти від "double underscore", офіційна назва в документації special methods).

```python
from collections import Counter, defaultdict

print("__getitem__" in vars(Counter), "__missing__" in vars(Counter))
print("__missing__" in vars(defaultdict))
print(Counter()["anything"], defaultdict(int)["anything"])
```

```text
False True
True
0 0
```

<!-- task: q1 -->

<!-- task: t2 -->

## defaultdict: групування без перевірки ключа

`defaultdict(factory)` це `dict`, який при зверненні `d[key]` до відсутнього ключа викликає `factory()` без аргументів, кладе результат під цей ключ і повертає його. Фабрика (default factory; офіційна назва, так зветься і атрибут `default_factory`) це будь-що викликане без аргументів: `list`, `int`, `set`, клас або `lambda`. Найчастіший сценарій: групування, де в JS пишуть `Object.groupBy` (ES2024) або `??=` в циклі.

```ts
const byPage = Object.groupBy(elements, (el) => el.page);

const ids: Record<number, string[]> = {};
for (const el of elements) (ids[el.page] ??= []).push(el.id);
```

```python
from collections import defaultdict

elements = [
    {"id": "email", "page": 1},
    {"id": "phone", "page": 1},
    {"id": "plan", "page": 2},
    {"id": "consent", "page": 3},
    {"id": "coupon", "page": 2},
]
by_page: defaultdict[int, list[str]] = defaultdict(list)
for el in elements:
    by_page[el["page"]].append(el["id"])
print(by_page)
print(dict(by_page))
```

```text
defaultdict(<class 'list'>, {1: ['email', 'phone'], 2: ['plan', 'coupon'], 3: ['consent']})
{1: ['email', 'phone'], 2: ['plan', 'coupon'], 3: ['consent']}
```

`Object.groupBy` це один виклик, що повертає готові масиви цілих елементів. Вбудованого аналога для словника в Python немає, `defaultdict` ближче до варіанта з `??=`: ви самі пишете цикл і самі вирішуєте, що класти (тут лише `id`, а не весь елемент), але без перевірки ключа. Друга відмінність у природі результату: це змінювана структура, яка й після циклу продовжує створювати ключі на звернення, тому назовні її зазвичай віддають як `dict(...)`.

Фабрика визначає, з чого починається кожен ключ. `int` дає `0` і робить `defaultdict(int)` простим лічильником, але для підрахунку краще `Counter` з його `most_common` і арифметикою. `set` збирає унікальні значення, `lambda` дає довільне початкове значення. Фабрика викликається щоразу заново, тому кожен ключ отримує власний список чи множину.

```python live
from collections import defaultdict

types_on_page: defaultdict[int, set[str]] = defaultdict(set)
answers: defaultdict[str, int] = defaultdict(int)
labels: defaultdict[str, str] = defaultdict(lambda: "untitled")

for page, el_type in [(1, "text"), (1, "text"), (2, "email")]:
    types_on_page[page].add(el_type)
    answers[el_type] += 1
print(dict(types_on_page))
print(dict(answers))
print(labels["hero"], dict(labels))
print(types_on_page[1] is types_on_page[2])
```

```text
{1: {'text'}, 2: {'email'}}
{'text': 2, 'email': 1}
untitled {'hero': 'untitled'}
False
```

Механізм той самий `__missing__`, що в `Counter`, і саме тому він спрацьовує лише на `d[key]`. `get`, `in` і `setdefault` не викликають `__missing__`, вони працюють як у звичайному словнику. Це легко перевірити на власному підкласі `dict`.

```python
class Loud(dict):
    def __missing__(self, key):
        print("__missing__ called for", key)
        return "fallback"

d = Loud(a=1)
print(d["a"])
print(d["b"])
print(d.get("b"))
print("b" in d)
```

```text
1
__missing__ called for b
fallback
None
False
```

> **Пастка.** Читання відсутнього ключа через `d[key]` у `defaultdict` створює цей ключ. Перевірка "чи є щось на сторінці 2" через `if by_page[2]:` додає порожню сторінку 2 у результат, і далі вона потрапить у JSON, у `len`, у цикл. Для читання без побічного ефекту використовуйте `in` або `get`.

```python
from collections import defaultdict

by_page = defaultdict(list, {1: ["email"]})
if not by_page[2]:
    print("page 2 is empty")
print(dict(by_page))
print(by_page.get(3), 3 in by_page)
print(dict(by_page))
```

```text
page 2 is empty
{1: ['email'], 2: []}
None False
{1: ['email'], 2: []}
```

<!-- task: q2 -->

<!-- task: t3 -->

У стандартній бібліотеці є ще `itertools.groupby`, і назва вводить в оману: це не `Object.groupBy`. Воно групує лише сусідні елементи з однаковим ключем, як `uniq` в Unix, і віддає пари `(key, iterator)`. На невідсортованому вводі той самий ключ з'являється кількома групами.

```python
from itertools import groupby

elements = [
    {"id": "email", "page": 1},
    {"id": "phone", "page": 1},
    {"id": "plan", "page": 2},
    {"id": "consent", "page": 3},
    {"id": "coupon", "page": 2},
]
for page, group in groupby(elements, key=lambda el: el["page"]):
    print(page, [el["id"] for el in group])

print("---")
by_key = sorted(elements, key=lambda el: el["page"])
for page, group in groupby(by_key, key=lambda el: el["page"]):
    print(page, [el["id"] for el in group])
```

```text
1 ['email', 'phone']
2 ['plan']
3 ['consent']
2 ['coupon']
---
1 ['email', 'phone']
2 ['plan', 'coupon']
3 ['consent']
```

Причина в тому, що `groupby` лінивий і однопрохідний: він не тримає словник уже побачених ключів, а лише порівнює поточний ключ з попереднім. Тому він працює на нескінченних потоках, але вимагає `sorted` (O(n log n)) для групування "як у словнику". Для групування в словник ідіома за замовчуванням `defaultdict(list)`: один прохід, будь-який порядок вводу; `groupby` беруть, коли дані вже відсортовані або потрібні саме послідовні серії. Детально `itertools` у m5-l03.

## Вбудований dict: коли collections не потрібен

Половина задач, для яких тягнуть `collections`, закривається методами самого `dict` (усі чотири розібрані в m2-l01, тут лише вибір між ними й `collections`). `get(key, default)` читає без `KeyError`. `setdefault(key, default)` повертає значення, а якщо ключа немає, спершу записує `default`: це групування без `defaultdict`. `dict.fromkeys(keys, value)` будує словник з однаковим значенням. `pop(key, default)` видаляє ключ і повертає значення, не падаючи на відсутньому.

```python live
answers = {"email": "a@b.c", "plan": "pro"}
print(answers.get("phone", ""))

groups: dict[int, list[str]] = {}
for page, el_id in [(1, "email"), (2, "plan"), (1, "phone")]:
    groups.setdefault(page, []).append(el_id)
print(groups)

print(dict.fromkeys(["email", "phone", "plan"], 0))
print(answers.pop("coupon", None), answers.pop("plan", None), answers)
```

```text

{1: ['email', 'phone'], 2: ['plan']}
{'email': 0, 'phone': 0, 'plan': 0}
None pro {'email': 'a@b.c'}
```

`setdefault` проти `defaultdict` вирішується тим, хто володіє словником і скільки місць його наповнюють. Аргумент `setdefault` обчислюється на кожному виклику, навіть коли ключ уже є: `[]` створюється й викидається щоразу. Натомість результат лишається звичайним `dict`, і пізніше `d[missing]` чесно кидає `KeyError`. Тому `setdefault` для одного місця групування або для словника, що прийшов ззовні (з JSON), `defaultdict` для структури, яку ви будуєте самі й наповнюєте в кількох місцях, з `dict(...)` на виході.

```python
def new_list():
    print("new list created")
    return []

d = {"a": [1]}
d.setdefault("a", new_list()).append(2)
print(d)
```

```text
new list created
{'a': [1, 2]}
```

> **Пастка.** `dict.fromkeys(keys, [])` не створює список на кожен ключ: значення обчислюється один раз, і всі ключі посилаються на той самий об'єкт. Це той самий механізм, що `Array(3).fill([])` у JS. Для змінюваних значень потрібен comprehension або `defaultdict`.

```python
pages = dict.fromkeys([1, 2, 3], [])
pages[1].append("email")
print(pages)
print(pages[1] is pages[3])
print({p: [] for p in [1, 2, 3]})
```

```text
{1: ['email'], 2: ['email'], 3: ['email']}
True
{1: [], 2: [], 3: []}
```

`pop(key, default)` це безпечне видалення. У JS `delete obj.key` ніколи не падає й повертає `true` навіть для відсутнього ключа; у Python `del d[key]` на відсутньому дає `KeyError`, а `pop` без default теж. Для "прибрати, якщо є, і взяти значення" це `d.pop(key, None)`.

`OrderedDict` після 3.7, коли звичайний `dict` гарантує порядок вставки, потрібен рідко: лишились `move_to_end` і `popitem(last=False)` для LRU-подібних структур і порівняння `==`, яке враховує порядок.

```python
from collections import OrderedDict

a = OrderedDict(email=1, phone=2)
b = OrderedDict(phone=2, email=1)
print(a == b, dict(a) == dict(b))
a.move_to_end("email")
print(list(a))
```

```text
False True
['phone', 'email']
```

## namedtuple і NamedTuple: кортеж з іменами полів

`namedtuple` створює клас-підклас `tuple`, у якого позиції мають імена. Екземпляр поводиться як кортеж (індекси, розпакування, `len`, порівняння, hashable, незмінний) і додатково дає доступ за атрибутом. Сучасне оголошення з типами це `typing.NamedTuple` у формі класу (анотації як такі розібрані в m2-l06); стара фабрична функція `collections.namedtuple` дає те саме без анотацій. Найближче в TS це іменовані елементи кортежу, з різницею, що там імена живуть лише в типі.

```ts
type Job = readonly [formId: string, page: number, attempt?: number];
const job: Job = ["signup", 2];
const [formId, page] = job;
// job.formId does not exist: labels are for the type checker only
```

```python
from collections import namedtuple
from typing import NamedTuple

JobT = namedtuple("JobT", ["form_id", "page"])

class Job(NamedTuple):
    form_id: str
    page: int
    attempt: int = 1

job = Job("signup", 2)
print(job)
print(job.form_id, job[0], len(job))
form_id, page, attempt = job
print(form_id, page, attempt)
print(isinstance(job, tuple))
print(JobT("signup", 2))
```

```text
Job(form_id='signup', page=2, attempt=1)
signup signup 3
signup 2 1
True
JobT(form_id='signup', page=2)
```

Імена полів існують у runtime: `job.form_id` працює, `repr` їх показує, `_asdict()` дає словник. Решта від кортежу: розпакування, індекс, незмінність. У TS `Job` зник би після компіляції й лишився масивом. Анотації в `NamedTuple` runtime не перевіряє, як і будь-які анотації: `Job(1, "x")` створиться без помилки, ловить це лише type checker (m2-l08).

Незмінність означає, що атрибут не присвоюється. "Зміна" робиться через `_replace`, який повертає новий екземпляр. `_asdict()` повертає `dict` для JSON, `_fields` кортеж імен полів, `_field_defaults` значення за замовчуванням. Підкреслення тут не означає "приватне": документація пояснює його тим, що так методи не конфліктують з іменами полів користувача.

```python live
from typing import NamedTuple

class Job(NamedTuple):
    form_id: str
    page: int
    attempt: int = 1

job = Job("signup", 2)
retry = job._replace(attempt=job.attempt + 1)
print(job, retry)
print(job._asdict())
print(Job._fields, Job._field_defaults)
print(Job(42, "two"))
job.attempt = 5
```

```text
Job(form_id='signup', page=2, attempt=1) Job(form_id='signup', page=2, attempt=2)
{'form_id': 'signup', 'page': 2, 'attempt': 1}
('form_id', 'page', 'attempt') {'attempt': 1}
Job(form_id=42, page='two', attempt=1)
Traceback (most recent call last):
  File "example.py", line 14, in <module>
    job.attempt = 5
    ^^^^^^^^^^^
AttributeError: can't set attribute
```

> **Пастка.** `NamedTuple` порівнюється як кортеж: за значеннями, без урахування класу й імен полів. Він дорівнює звичайному кортежу з тими самими значеннями і будь-якому іншому namedtuple з тими самими значеннями, і має з ними однаковий хеш. Два різні типи записів, які випадково збіглися за значеннями, стануть одним ключем у словнику. `dataclass` такого не робить (m2-l05).

```python
from typing import NamedTuple

class Job(NamedTuple):
    form_id: str
    page: int

class Ref(NamedTuple):
    name: str
    index: int

print(Job("signup", 2) == ("signup", 2))
print(Job("signup", 2) == Ref("signup", 2))
print({Job("signup", 2): "job"}[Ref("signup", 2)])
```

```text
True
True
job
```

> **Під капотом.** Клас, згенерований `namedtuple`, має `__slots__ = ()`: у екземпляра немає `__dict__`, поля лежать у самому кортежі, а `form_id` це дескриптор (descriptor; офіційний термін: об'єкт в атрибуті класу, який перехоплює читання атрибута екземпляра, детально в m4-l03), що читає елемент кортежу за індексом. Тому екземпляр важить рівно стільки, скільки кортеж такої довжини, помітно менше за словник з тими самими даними.

```python
import sys
from typing import NamedTuple

class Job(NamedTuple):
    form_id: str
    page: int
    attempt: int = 1

job = Job("signup", 2)
print(sys.getsizeof(job), sys.getsizeof(("signup", 2, 1)), sys.getsizeof(job._asdict()))
print(hasattr(job, "__dict__"))
```

```text
64 64 184
False
```

Вибір між трьома формами запису. Звичайний `tuple`, коли елементів два-три і їхній зміст очевидний з місця: ключ сортування `(page, order)`, результат `divmod`. `NamedTuple`, коли потрібен незмінний легкий запис, який до того ж мусить лишатися кортежем: розпаковуватися, бути ключем словника, підходити під API, що чекає кортеж. Так зроблено в самій стандартній бібліотеці: `urlparse` повертає namedtuple. `dataclass`, коли потрібні методи, валідація в `__post_init__`, змінюваність або змінювані поля з `default_factory`, і коли порівняння з кортежем це баг, а не фіча (m2-l05).

```python
from urllib.parse import urlparse

url = urlparse("https://forms.example.com/signup?step=2")
print(url)
scheme, host, path, *_ = url
print(scheme, host, path, url.query)
```

```text
ParseResult(scheme='https', netloc='forms.example.com', path='/signup', params='', query='step=2', fragment='')
https forms.example.com /signup step=2
```

<!-- task: q3 -->

## deque: черга, у якої обидва кінці дешеві

`list` у Python це динамічний масив. `append` і `pop()` з кінця амортизовано O(1), а `insert(0, x)` і `pop(0)` зсувають усі решта елементів на одну позицію, тобто O(n). `deque` (double-ended queue; офіційна назва, вимовляється "дек") дає O(1) на обох кінцях: `append`/`pop` праворуч, `appendleft`/`popleft` ліворуч. У JS ситуація та сама, що з `list`: `push`/`pop` дешеві, `shift`/`unshift` у загальному випадку O(n), рушій інколи оптимізує окремі випадки, але гарантії немає.

```ts
const queue = ["render", "upload"];
queue.push("notify");
const next = queue.shift();
queue.unshift("urgent");
```

```python
from collections import deque

queue = deque(["render", "upload"])
queue.append("notify")
nxt = queue.popleft()
queue.appendleft("urgent")
print(nxt, queue)
print(queue[0], queue[-1], len(queue), "upload" in queue)
```

```text
render deque(['urgent', 'upload', 'notify'])
urgent notify 3 True
```

API знайомий, змінились лише назви, і в цьому небезпека: `list.pop(0)` теж працює, і на малих чергах різниці не видно. Вона з'являється, коли черга росте з вхідними даними. Нижче той самий цикл "забрати все з голови", розміри 25, 50 і 100 тисяч елементів. Вивід одного запуску на цій машині (Apple M1 Pro, Python 3.12.12); абсолютні цифри у вас будуть інші, характер росту ні.

```python
from collections import deque
from timeit import timeit

def drain_list(n: int) -> None:
    q = list(range(n))
    while q:
        q.pop(0)

def drain_deque(n: int) -> None:
    q = deque(range(n))
    while q:
        q.popleft()

for n in (25_000, 50_000, 100_000):
    t_list = timeit(lambda: drain_list(n), number=1)
    t_deque = timeit(lambda: drain_deque(n), number=1)
    print(f"n={n:>7,}  list.pop(0) {t_list * 1000:7.1f} ms   deque.popleft() {t_deque * 1000:5.1f} ms")
```

```text
n= 25,000  list.pop(0)    45.0 ms   deque.popleft()   0.6 ms
n= 50,000  list.pop(0)   198.2 ms   deque.popleft()   1.3 ms
n=100,000  list.pop(0)   820.8 ms   deque.popleft()   2.6 ms
```

Подвоєння `n` подвоює час `deque` (лінійно, бо кожна операція O(1)) і приблизно вчетверо збільшує час `list` (квадратично, бо кожен `pop(0)` O(n)). Тому `list` як черга це баг продуктивності, який не видно на тестових даних і видно на продакшн-обсязі. `list` як стек (`append` + `pop()`) при цьому цілком нормальний.

> **Під капотом.** У CPython `deque` це двозв'язний список блоків по 64 слоти. Операції на кінцях торкаються лише крайнього блоку, тому O(1) без амортизації. Ціна: доступ за індексом у середину O(n), бо треба пройти блоки, і зрізів немає зовсім.

```python
from collections import deque

q = deque(range(10))
print(q[0], q[-1], q[5])
print(q[2:4])
```

```text
0 9 5
Traceback (most recent call last):
  File "example.py", line 5, in <module>
    print(q[2:4])
          ~^^^^^
TypeError: sequence index must be integer, not 'slice'
```

`maxlen` перетворює `deque` на кільцевий буфер (ring buffer; загальний термін з CS, документація пише "bounded length deque"): коли черга повна, `append` мовчки викидає елемент з протилежного кінця. Це "останні N подій" без ручного обрізання. `rotate(n)` зсуває елементи по колу: `rotate(1)` переносить останній у голову, `rotate(-1)` перший у хвіст, зручно для round-robin.

```python live
from collections import deque

recent: deque[str] = deque(maxlen=3)
for event in ["open", "focus:email", "input:email", "focus:phone", "submit"]:
    recent.append(event)
print(recent)
print(list(recent))

workers = deque(["w1", "w2", "w3"])
for job in ["a", "b", "c", "d"]:
    print(job, "->", workers[0])
    workers.rotate(-1)
print(workers)
```

```text
deque(['input:email', 'focus:phone', 'submit'], maxlen=3)
['input:email', 'focus:phone', 'submit']
a -> w1
b -> w2
c -> w3
d -> w1
deque(['w2', 'w3', 'w1'])
```

Анотація `deque[Job]` разом з `NamedTuple` з попереднього розділу дає типізовану чергу задач. `deque` не блокує читача, коли черга порожня: `popleft` на порожній черзі кидає `IndexError`, і чекати нових задач доводиться самому. Черга, на якій можна `await` до появи задачі, це `asyncio.Queue` (m5-l05), а `deque` це її синхронний прообраз для одного процесу без очікування.

```python
from collections import deque
from typing import NamedTuple

class Job(NamedTuple):
    form_id: str
    page: int

queue: deque[Job] = deque()
queue.append(Job("signup", 1))
queue.append(Job("survey", 2))
while queue:
    job = queue.popleft()
    print("render", job.form_id, "page", job.page)
queue.popleft()
```

```text
render signup page 1
render survey page 2
Traceback (most recent call last):
  File "example.py", line 14, in <module>
    queue.popleft()
IndexError: pop from an empty deque
```

<!-- task: t4 -->

## ChainMap: шари конфігурації без злиття

`ChainMap(*maps)` це перегляд кількох словників як одного. Пошук іде зліва направо, перший словник, де знайшовся ключ, перемагає. Нічого не копіюється: `ChainMap` тримає список посилань на словники в атрибуті `maps`. Найближча аналогія в JS не spread, а ланцюжок прототипів: `Object.create(defaults)` теж шукає властивість угору по ланцюжку і теж не копіює.

```ts
const defaults = { color: "#111", font: "Inter", radius: "4px" };
const theme = { color: "#0a58ca" };
const merged = { ...defaults, ...theme };
const layered = Object.assign(Object.create(defaults), theme);
```

```python
from collections import ChainMap

defaults = {"color": "#111", "font": "Inter", "radius": "4px"}
theme = {"color": "#0a58ca"}
merged = defaults | theme
layered = ChainMap(theme, defaults)
print(merged["color"], layered["color"], layered["font"])

theme["radius"] = "12px"
print(merged["radius"], layered["radius"])
print(dict(layered))
print(layered.maps)
```

```text
#0a58ca #0a58ca Inter
4px 12px
{'color': '#0a58ca', 'font': 'Inter', 'radius': '12px'}
[{'color': '#0a58ca', 'radius': '12px'}, {'color': '#111', 'font': 'Inter', 'radius': '4px'}]
```

`defaults | theme` (злиття з m2-l01) і spread роблять знімок: пізніша зміна `theme` у `merged` не потрапляє. `ChainMap` живий, бо щоразу шукає заново. Друга різниця в порядку аргументів: у злитті пріоритет у правого, у `ChainMap` у лівого, бо пошук іде зліва. Обидва записи описують ту саму ієрархію "тема над defaults", але дзеркально.

Запис і видалення в `ChainMap` торкаються лише першого словника, `maps[0]`. Це і є сенс конструкції: нижні шари лише читаються. `new_child(m)` повертає новий `ChainMap` з `m` на початку, тобто ще один шар зверху, а `parents` повертає ланцюжок без першого шару. Так оформлюються overrides окремого елемента форми поверх теми: зміни елемента не протікають у тему.

```python live
from collections import ChainMap

defaults = {"color": "#111", "font": "Inter", "radius": "4px"}
theme = {"color": "#0a58ca"}
base = ChainMap(theme, defaults)

button = base.new_child({"radius": "999px"})
print(button["radius"], button["color"], base["radius"])

button["color"] = "white"
print(button.maps[0])
print(theme)
print(button.parents["color"])
print(len(button), sorted(button))
```

```text
999px #0a58ca 4px
{'radius': '999px', 'color': 'white'}
{'color': '#0a58ca'}
#0a58ca
3 ['color', 'font', 'radius']
```

> **Пастка.** `del chain[key]` шукає ключ лише в першому словнику. Якщо значення прийшло з нижнього шару, видалення падає з `KeyError`, хоча `chain[key]` щойно повернув значення. Те саме з `pop`. А якщо ключ є і в першому, і в нижньому шарі, після `del` читання поверне значення з нижнього, а не відсутність.

```python
from collections import ChainMap

defaults = {"color": "#111", "font": "Inter"}
theme = {"color": "#0a58ca"}
chain = ChainMap(theme, defaults)

del chain["color"]
print(chain["color"])
try:
    del chain["font"]
except KeyError as e:
    print("KeyError:", e)
```

```text
#111
KeyError: "Key not found in the first mapping: 'font'"
```

Класичне застосування: шари налаштувань "defaults → файл → змінні оточення → CLI", де вищий шар перекриває нижчий. Тут є ще одна пастка, специфічна для шарів: `None` у верхньому шарі теж значення, і воно перекриває нижні. `argparse` віддає `None` для кожного прапорця, який не передали, тому такий шар треба очистити від `None`, інакше CLI "скидає" все, що прийшло з файлу.

```python
from collections import ChainMap

defaults = {"port": 8000, "debug": False, "theme": "light"}
file_cfg = {"theme": "dark"}
env = {"port": 9000}
cli = {"port": None, "debug": True, "theme": None}

naive = ChainMap(cli, env, file_cfg, defaults)
print(dict(naive))

cli_set = {k: v for k, v in cli.items() if v is not None}
config = ChainMap(cli_set, env, file_cfg, defaults)
print(dict(config))
```

```text
{'port': None, 'debug': True, 'theme': None}
{'port': 9000, 'debug': True, 'theme': 'dark'}
```

Анотується як `ChainMap[str, str]`, і всі шари мусять мати сумісні типи ключів і значень; змішаний конфіг, як вище, на практиці описують `ChainMap[str, object]` або переносять у типізовану модель (Pydantic, m2-l09), а `ChainMap` лишають для шарів однорідних даних на кшталт CSS-властивостей.

<!-- task: q4 -->

<!-- task: t5 -->

## Для капстоуну

Усі п'ять структур з уроку мають місце в бекенді FormBuilder ще до появи Pydantic-моделей. `Counter` дає статистику типів елементів (для аналітики конструктора й для лімітів на кшталт "не більше одного поля `file`"). `defaultdict(list)` розкладає елементи по сторінках для рендера багатосторінкової форми. `deque` тримає чергу задач генерації, поки воркер на `asyncio.Queue` не з'явиться в m5-l05. `ChainMap` складає тему з базових значень, теми проєкту й overrides конкретного елемента.

```python
from collections import ChainMap, Counter, defaultdict, deque
from typing import NamedTuple

class GenerationJob(NamedTuple):
    form_id: str
    page: int

config = {
    "id": "signup",
    "theme": {"color": "#0a58ca"},
    "elements": [
        {"id": "email", "type": "email", "page": 1},
        {"id": "name", "type": "text", "page": 1},
        {"id": "plan", "type": "select", "page": 2, "style": {"radius": "999px"}},
        {"id": "bio", "type": "text", "page": 2},
        {"id": "terms", "type": "checkbox", "page": 3},
    ],
}
DEFAULT_THEME = {"color": "#111", "font": "Inter", "radius": "4px"}

types: Counter[str] = Counter(el["type"] for el in config["elements"])
print(sorted(types.items(), key=lambda kv: (-kv[1], kv[0])))

by_page: defaultdict[int, list[str]] = defaultdict(list)
for el in config["elements"]:
    by_page[el["page"]].append(el["id"])
pages = dict(by_page)
print(pages)

queue: deque[GenerationJob] = deque(GenerationJob(config["id"], page) for page in pages)
print(queue.popleft(), len(queue))

theme = ChainMap(config["theme"], DEFAULT_THEME)
for el in config["elements"]:
    style = theme.new_child(el.get("style", {}))
    if style.maps[0]:
        print(el["id"], dict(style))
```

```text
[('text', 2), ('checkbox', 1), ('email', 1), ('select', 1)]
{1: ['email', 'name'], 2: ['plan', 'bio'], 3: ['terms']}
GenerationJob(form_id='signup', page=1) 2
plan {'color': '#0a58ca', 'font': 'Inter', 'radius': '999px'}
```

> **Для капстоуну.** `defaultdict` з цього коду не повинен виходити за межі функції, яка його будує: віддавайте `dict(by_page)`, інакше обробник HTTP-запиту, який прочитає `pages[4]` для неіснуючої сторінки, мовчки створить її замість 404. `deque` тут живе в пам'яті одного процесу: перезапуск сервера губить чергу, і постійне сховище задач це вже тема курсу про бази даних та інфраструктуру.

## Типові помилки JS-розробника

1. **`reduce` з об'єктом-акумулятором для підрахунку.** Переносять `acc[x] = (acc[x] ?? 0) + 1` як цикл з `d[x] = d.get(x, 0) + 1`. Працює, але `Counter` робить це одним викликом і дає `most_common`, `total` та арифметику.

   ```python
   counts = {}
   for t in types:
       counts[t] = counts.get(t, 0) + 1     # за звичкою
   counts = Counter(types)                  # правильно
   ```

2. **Ручна ініціалізація групи, як `if (!m.has(k)) m.set(k, [])`.** Три рядки на кожне групування й шанс забути гілку. Правильно: `defaultdict(list)` для структури, яку будуєте самі, `setdefault` для чужого словника.

   ```python
   if page not in groups:                   # за звичкою
       groups[page] = []
   groups[page].append(el_id)
   groups.setdefault(page, []).append(el_id)  # або defaultdict(list)
   ```

3. **`arr.shift()` у циклі як `list.pop(0)`.** На малих даних непомітно, на великих квадратично. Правильно: `deque.popleft()`.

   ```python
   while jobs:
       job = jobs.pop(0)        # O(n) на кожну задачу
   queue = deque(jobs)
   while queue:
       job = queue.popleft()    # O(1)
   ```

4. **Перевірка наявності через `d[key]` у `defaultdict`.** Інтуїція з JS: читання відсутнього ключа дає `undefined` і нічого не змінює. Тут воно створює ключ з порожнім значенням. Правильно: `key in d` або `d.get(key)`.

   ```python
   if by_page[2]: ...           # створює by_page[2] = []
   if 2 in by_page: ...         # лише перевіряє
   ```

5. **`dict.fromkeys(keys, [])` як `Array(n).fill([])`.** Одне й те саме посилання на всі ключі. Правильно: `{k: [] for k in keys}` або `defaultdict(list)`.

   ```python
   pages = dict.fromkeys([1, 2], [])        # один список на двох
   pages = {p: [] for p in [1, 2]}          # окремі списки
   ```

6. **Словник або голий кортеж як запис без типу.** `{"form_id": "signup", "page": 2}` не ловить друкарську помилку в ключі, а `("signup", 2)` не каже, що де. Правильно: `NamedTuple` для незмінного легкого запису, `dataclass` (m2-l05) для решти.

   ```python
   class Job(NamedTuple):
       form_id: str
       page: int
   job = Job("signup", 2)
   job.form_id                              # замість job["form_id"] або job[0]
   ```

7. **Порядок шарів як у spread.** `{...defaults, ...theme}` пишуть зліва направо від слабшого до сильнішого і так само передають у `ChainMap`. Тоді перемагають defaults. Правильно: у `ChainMap` найсильніший шар перший.

   ```python
   ChainMap(defaults, theme)["color"]       # '#111': defaults перемогли
   ChainMap(theme, defaults)["color"]       # '#0a58ca'
   ```

8. **Опора на порядок `most_common` при рівних лічильниках.** Тест проходить локально й падає на інших даних. Правильно: явне `sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))`, коли рівність можлива.

## Підсумок

- `Counter(iterable)` рахує одним викликом; відсутній ключ дає `0` і не створюється; це `dict`.
- `most_common` сортує за кількістю, рівні йдуть у порядку першої появи; для стабільного результату `sorted` з `(-count, key)`.
- `+ - & |` між лічильниками відкидають нулі й від'ємні; `subtract` і `update` змінюють на місці, `update` додає.
- `defaultdict(factory)` створює значення на `d[key]` через `__missing__`; `get` і `in` його не викликають; назовні віддавати `dict(...)`.
- `setdefault` для одного місця групування або чужого словника; `dict.fromkeys` зі змінюваним значенням ділить один об'єкт.
- `itertools.groupby` групує лише сусідні елементи; для групування в словник `defaultdict(list)`.
- `NamedTuple` це кортеж з іменами: незмінний, розпаковується, `_replace`, `_asdict`, `_fields`; дорівнює звичайному кортежу з тими самими значеннями.
- `list.pop(0)` це O(n), `deque.popleft()` O(1); `maxlen` дає кільцевий буфер; індекс у середину `deque` O(n), зрізів немає.
- `ChainMap` шукає зліва направо без копіювання, пише й видаляє лише в перший шар; найсильніший шар перший.
- Анотації: `Counter[str]`, `defaultdict[int, list[str]]`, `deque[Job]`, `ChainMap[str, str]`, класи з `collections` напряму, без `typing.Counter`.

## Що далі

Наступний урок m2-l05 про `dataclass`: запис, який, на відміну від `NamedTuple`, може бути змінюваним, має `default_factory` для змінюваних полів і не дорівнює кортежу. Таблиця "tuple, NamedTuple, dataclass" з цього уроку там розшириться до `TypedDict` і Pydantic, а `Counter[str]` і `deque[Job]` стануть прикладами generics у m2-l06.
