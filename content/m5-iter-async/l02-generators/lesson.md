---
id: m5-l02
module: m5-iter-async
title: "Генератори, yield, yield from, ліниві конвеєри"
summary: "Учень пише генераторну функцію там, де раніше писав клас-ітератор або збирав список, будує ліниві конвеєри з yield і yield from, розуміє send, return і close як механізм, на якому стоять корутини, і не наступає на пастки одноразовості й очищення."
duration_min: 90
prerequisites: [m5-l01]
---

## `yield`: функція, яка ставить себе на паузу

Функція, у тілі якої є хоч один `yield`, стає генераторною функцією (generator function; офіційний термін документації). Її виклик не виконує тіло, а повертає об'єкт-генератор (у глосарії generator iterator, у коді й розмові просто generator). Тіло біжить шматками: на першому `next()` від початку до першого `yield`, на кожному наступному від того `yield`, де зупинилось, до наступного. Це `function*` з JS один в один, лише без зірочки: генераторною функцію робить вміст, а не заголовок.

```ts
function* steps() {
  console.log("start");
  yield 1;
  console.log("between");
  yield 2;
  console.log("end");
}
const gen = steps();          // нічого не надруковано
console.log(gen.next());      // start, { value: 1, done: false }
console.log(gen.next());      // between, { value: 2, done: false }
console.log(gen.next());      // end, { value: undefined, done: true }
```

```python
def steps():
    print("start")
    yield 1
    print("between")
    yield 2
    print("end")

gen = steps()
print("created", type(gen).__name__)
print(next(gen))
print(next(gen))
next(gen)
```

```text
created generator
start
1
between
2
end
StopIteration
```

Розходиться лише сигнал кінця, і він той самий, що в протоколі ітерації з m5-l01: замість `{ done: true }` Python кидає `StopIteration`. Руками його бачать рідко, бо `for`, `list`, `sum` і решта споживачів ловлять його самі. Порядок виконання, ледачий старт і рядок `end`, що друкується лише на спробі взяти третій елемент, збігаються з JS повністю.

Між `yield` локальні змінні не зникають. Звичайна функція при `return` викидає свій фрейм (frame object; офіційна назва об'єкта, що тримає локальні змінні й поточну інструкцію), а генератор тримає його в атрибуті `gi_frame` і наступного разу продовжує з того самого рядка з тими самими змінними. `inspect.getgeneratorstate` показує, де генератор зараз: створений, призупинений на `yield`, виконується чи закритий.

```python live
import inspect

def counter(limit):
    n = 0
    while n < limit:
        n += 1
        yield n

gen = counter(2)
print(inspect.getgeneratorstate(gen), gen.gi_frame.f_locals)
print(next(gen), inspect.getgeneratorstate(gen), gen.gi_frame.f_locals)
print(next(gen), gen.gi_frame.f_locals)
print(list(gen), inspect.getgeneratorstate(gen), gen.gi_frame)
```

```text
GEN_CREATED {'limit': 2}
1 GEN_SUSPENDED {'limit': 2, 'n': 1}
2 {'limit': 2, 'n': 2}
[] GEN_CLOSED None
```

> **Під капотом.** Заморожений фрейм, який можна відновити ззовні, це і є весь механізм. Корутина `async def` з m5-l05 зроблена з того самого: її об'єкт тримає фрейм у `cr_frame`, має ті самі методи `send`, `throw`, `close`, а `await` зупиняє її рівно так, як `yield` зупиняє генератор. Як саме це з'єднано, показано в розділі про `yield from`.

<!-- task: q1 -->

> **Пастка.** Генераторною функцію робить будь-який `yield` у тілі, навіть у гілці, яка ніколи не виконується. Після цього `return value` більше не повертає `value` викликачу: виклик завжди дає генератор, а `return` лише завершує його. Ранній вихід "повернути заглушку, якщо даних немає" тихо перетворюється на порожній генератор.

```python
def field_ids(config):
    if not config.get("fields"):
        return ["<empty>"]
    for field in config["fields"]:
        yield field["id"]

print(list(field_ids({"fields": [{"id": "email"}]})))
print(list(field_ids({})))
print(type(field_ids({})).__name__)
```

```text
['email']
[]
generator
```

<!-- task: q2 -->

## Генератор як найпростіший ітератор

У m5-l01 `Countdown` був класом: стан в атрибуті, `__iter__`, що повертає `self`, `__next__`, що кидає `StopIteration`. Генераторна функція з тією самою поведінкою займає три рядки, бо об'єкт-генератор уже реалізує протокол ітератора: `__iter__` повертає сам генератор, `__next__` відновлює фрейм до наступного `yield`, кінець функції кидає `StopIteration`.

```python
from collections.abc import Iterator

class Countdown:
    def __init__(self, start: int) -> None:
        self.current = start

    def __iter__(self) -> "Countdown":
        return self

    def __next__(self) -> int:
        if self.current <= 0:
            raise StopIteration
        value = self.current
        self.current -= 1
        return value

def countdown(start: int) -> Iterator[int]:
    while start > 0:
        yield start
        start -= 1

print(list(Countdown(3)), list(countdown(3)))
gen = countdown(3)
print(iter(gen) is gen, isinstance(gen, Iterator))
```

```text
[3, 2, 1] [3, 2, 1]
True True
```

Різниця глибша за кількість рядків. Клас мусить сам кодувати, "де ми зупинились": лічильник, індекс, прапорець, а для обходу дерева явний стек. Генератор зберігає це в позиції всередині фрейму, тому код читається як звичайний цикл зверху вниз. Саме тому клас з `__next__` пишуть рідко: лише коли ітератору потрібні додаткові методи чи публічний стан.

Друге типове місце генератора: `__iter__` контейнера. Якщо `__iter__` написати як генераторну функцію, кожен `for` по об'єкту викликає її заново й отримує свіжий генератор. Розділення контейнера й ітератора з m5-l01 виходить безкоштовно: два вкладені цикли по одному об'єкту не заважають один одному.

```python live
class Form:
    def __init__(self, fields: list[dict]) -> None:
        self.fields = fields

    def __iter__(self):
        for field in self.fields:
            if not field.get("hidden"):
                yield field["id"]

form = Form([{"id": "email"}, {"id": "utm", "hidden": True}, {"id": "age"}])
print(list(form))
print(list(form))
print([(a, b) for a in form for b in form if a < b])
```

```text
['email', 'age']
['email', 'age']
[('age', 'email')]
```

> **JS-аналог.** Це `*[Symbol.iterator]() { ... }` у класі: генераторний метод як iterable-протокол. У TS так теж пишуть, але рідко, бо класи-колекції у фронтенді рідкісні. У Python це стандартний спосіб зробити клас iterable.

<!-- task: t1 -->

## Generator expression: пам'ять і одноразовість

Generator expression `(expr for x in xs if cond)` з m1-l10 дає той самий об'єкт `generator`, що й генераторна функція з `for`, `if` і `yield` усередині. Вираз зручний для одного кроку перетворення прямо в аргументі `sum`, `any`, `all`, `max`, `"".join`; функція потрібна, коли кроків більше, є стан або потрібна назва.

```python live
fields = [{"id": "email", "required": True}, {"id": "age", "required": False}]

def required_ids(fields):
    for f in fields:
        if f["required"]:
            yield f["id"]

print(type(f["id"] for f in fields if f["required"]).__name__)
print(list(required_ids(fields)), list(f["id"] for f in fields if f["required"]))
print(any(f["required"] for f in fields), ",".join(required_ids(fields)))
```

```text
generator
['email'] ['email']
True email
```

У m1-l10 розмір рахувався через `sys.getsizeof`, а він показує лише сам контейнер: масив вказівників списку без чисел, на які той вказує. Чесніше міряти пікову пам'ять усього обчислення через `tracemalloc` зі стандартної бібліотеки: він рахує кожну алокацію інтерпретатора між `start` і `stop`. Нижче один запуск на 64-бітному CPython 3.12 (macOS); у браузерному Pyodide 32-бітні об'єкти й інший алокатор, цифри будуть іншими, тому приклад не живий.

```python
import tracemalloc

def peak_bytes(compute) -> int:
    tracemalloc.start()
    compute()
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return peak

print(peak_bytes(lambda: sum([n * n for n in range(1_000_000)])))
print(peak_bytes(lambda: sum(n * n for n in range(1_000_000))))
```

```text
40448200
464
```

Сорок мегабайтів проти пів кілобайта, і розрив тільки росте з даними: список тримає одночасно мільйон об'єктів `int` плюс вісім байтів вказівника на кожен, а генератор у кожен момент тримає одне число і свій фрейм. Пік генератора від довжини джерела не залежить узагалі. Ціна лінивості це трохи нижча швидкість на маленьких даних і одноразовість.

> **Пастка.** Генератор вичерпується (exhausted; так у документації) за один прохід, і другий прохід не падає, а тихо нічого не дає. Підступніше з `in`: перевірка споживає генератор до першого збігу, тому друга така сама перевірка шукає вже в залишку.

```python live
fields = [{"id": "email", "required": True}, {"id": "age", "required": False}]
required = (f["id"] for f in fields if f["required"])
print("email" in required)
print("email" in required)
print(list(required))

required = [f["id"] for f in fields if f["required"]]
print("email" in required, "email" in required)
```

```text
True
False
[]
True True
```

Генератор не знає своєї довжини й не має індексу: обидва вимагали б обчислити елементи наперед. `len(gen)` і `gen[0]` дають `TypeError`, а не `undefined`, як `gen.length` у JS. Якщо потрібні довжина, індекс або кілька проходів, це сигнал матеріалізувати результат через `list(...)` один раз і далі працювати зі списком.

```python
gen = (n * n for n in range(5))
try:
    len(gen)
except TypeError as error:
    print(error)
try:
    gen[0]
except TypeError as error:
    print(error)
squares = list(gen)
print(len(squares), squares[0], squares[-1])
```

```text
object of type 'generator' has no len()
'generator' object is not subscriptable
5 0 16
```

<!-- task: q3 -->

## Ліниві конвеєри: елемент проходить увесь ланцюжок

Генератор, що приймає iterable і повертає ітератор, можна підставити на вхід іншому такому самому. Так складається конвеєр (pipeline; загальний інженерний термін, у документації Python окремого визначення немає): `read_lines → parse → filter → take`. Модель pull-based: кінцевий споживач просить один елемент, той запит іде вгору ланцюжком до джерела, і елемент проходить усі етапи до того, як береться наступний. Поки споживач не просить, не працює ніхто.

```ts
const result = lines
  .map(parse)          // розпарсили всі рядки
  .filter(isFilled)    // відфільтрували всі
  .slice(0, 2);        // узяли два, решту викинули
```

```python
from itertools import islice

result = list(islice(only_filled(parse(lines)), 2))
```

Ланцюжок методів масиву в JS жадібний: кожен крок проходить усі елементи й будує новий масив, а `slice(0, 2)` наприкінці викидає зроблену роботу. Python-конвеєр робить рівно стільки роботи, скільки потрібно для двох результатів, і не тримає проміжних колекцій. Найближче в JS це iterator helpers з ES2025 (`iterator.map(...).filter(...).take(2)`, Node 22+): вони ліниві за тією самою моделлю, але в живому коді досі переважають масиви.

Порядок виконання видно з print-ів. Джерело тут `io.StringIO`, об'єкт із файловим інтерфейсом у пам'яті: ітерується рядками, як відкритий файл, і дозволяє після роботи подивитися, що лишилось непрочитаним.

```python live
import io
from itertools import islice

def read_lines(f):
    for line in f:
        print(f"read  {line.strip()!r}")
        yield line

def parse(lines):
    for line in lines:
        name, _, value = line.strip().partition("=")
        print(f"parse {name}")
        yield name, value

def only_filled(pairs):
    for name, value in pairs:
        if value:
            yield name, value
        else:
            print(f"skip  {name}")

source = io.StringIO("email=a@b.c\nphone=\nage=30\ncity=Kyiv\nzip=01001\n")
for item in islice(only_filled(parse(read_lines(source))), 2):
    print("got  ", item)
print("unread:", source.read().split())
```

```text
read  'email=a@b.c'
parse email
got   ('email', 'a@b.c')
read  'phone='
parse phone
skip  phone
read  'age=30'
parse age
got   ('age', '30')
unread: ['city=Kyiv', 'zip=01001']
```

Кожен рядок проходить `read → parse → filter` до кінця, перш ніж читається наступний; `phone` відсіюється на третьому етапі й одразу запитується `age`. Після другого результату `islice` більше не просить, і два останні рядки файлу так і не прочитані. Для справжнього файлу на гігабайт це різниця між "прочитати два рядки" і "прочитати гігабайт".

`itertools.islice(iterable, n)` це лінивий зріз для будь-якого ітератора: віддає перші `n` елементів і не запитує `n+1`-й. Синтаксис `gen[:2]` для генератора не працює з тієї ж причини, що й індекс. З нескінченним джерелом `islice` взагалі єдиний спосіб зупинитись; решта `itertools` розібрана в m5-l03.

```python live
from itertools import count, islice

def ids(prefix):
    for n in count(1):
        yield f"{prefix}-{n}"

print(list(islice(ids("field"), 3)))
print(list(islice(ids("page"), 2, 4)))
```

```text
['field-1', 'field-2', 'field-3']
['page-3', 'page-4']
```

> **Пастка.** Одного `list(...)` або `sorted(...)` посеред ланцюжка досить, щоб лінивість зникла: етап, якому потрібні всі елементи одразу, змушує попередні етапи відпрацювати повністю. `sorted` інакше не вміє, бо не може віддати найменший елемент, не побачивши всіх; `list` зазвичай вставляють за звичкою.

```python
reads = []

def read(source):
    for line in source:
        reads.append(line)
        yield line

lines = ["a", "b", "c", "d"]
print(next(iter(read(lines))), len(reads))
reads.clear()
print(next(iter(list(read(lines)))), len(reads))
```

```text
a 1
a 4
```

<!-- task: t2 -->

## `send`, `throw` і `return`: генератор як двосторонній канал

`yield` це вираз, а не лише інструкція: `received = yield value` віддає `value` назовні і, коли генератор відновлять, отримує те, що передали ззовні. Передають через `gen.send(x)`: метод відновлює фрейм, `x` стає значенням виразу `yield`, а `send` повертає наступне віддане значення. `next(gen)` це те саме, що `gen.send(None)`. Генератор, що приймає значення, історично називають корутиною (coroutine; офіційний термін, у PEP 342 так названі саме генератори з `send`, а з 3.5 слово перейшло до `async def`).

```python live
def averager():
    total = 0.0
    count = 0
    average = None
    while True:
        value = yield average
        total += value
        count += 1
        average = total / count

avg = averager()
print(next(avg))
print(avg.send(10))
print(avg.send(20))
print(avg.send(60))
```

```text
None
10.0
15.0
30.0
```

Перший виклик завжди `next(gen)` або `send(None)`: генератор ще не дійшов до жодного `yield`, і значенню нікуди потрапити. Цей крок у спільноті називають priming (жаргон, "заправити" генератор). JS у тій самій ситуації мовчки ігнорує аргумент першого `gen.next(value)`; Python відмовляє явно.

```python
def echo():
    while True:
        received = yield
        print("got", received)

gen = echo()
gen.send("hello")
```

```text
TypeError: can't send non-None value to a just-started generator
```

`return value` у генераторі кладе `value` в атрибут `value` того `StopIteration`, яким генератор завершується. `for`, `list` і `sum` це значення викидають так само, як `for...of` і spread у JS викидають `value` з фінального `{ value, done: true }`. Напряму через `except StopIteration as stop` його читають рідко; звичайний споживач повернутого значення це `yield from` з наступного розділу.

```python
def import_fields(rows):
    skipped = 0
    for row in rows:
        if not row.strip():
            skipped += 1
            continue
        yield row.strip()
    return skipped

print(list(import_fields(["email", " ", "age", ""])))

gen = import_fields(["email", " ", "age", ""])
while True:
    try:
        print("field", next(gen))
    except StopIteration as stop:
        print("skipped", stop.value)
        break
```

```text
['email', 'age']
field email
field age
skipped 2
```

`gen.throw(exc)` кидає виняток усередині генератора, у точці, де той стоїть на `yield`. Якщо генератор його перехопить і дійде до наступного `yield`, `throw` поверне це значення; якщо ні, виняток вилетить до того, хто викликав `throw`. Руками це роблять рідко, але на цьому стоять дві речі з сусідніх уроків: `contextlib.contextmanager` передає виняток з тіла `with` у генератор через `throw` (m4-l07), а asyncio скасовує задачу, кидаючи `CancelledError` у корутину (m5-l05).

```python
def worker():
    while True:
        try:
            job = yield
            print("run", job)
        except ValueError as error:
            print("skip:", error)

w = worker()
next(w)
w.send("render")
w.throw(ValueError("bad config"))
w.send("publish")
w.throw(KeyError("fatal"))
```

```text
run render
skip: bad config
run publish
KeyError: 'fatal'
```

> **JS-аналог.** `gen.next(v)`, `gen.throw(e)` і `gen.return(v)` з JS відповідають `send(v)`, `throw(e)` і `close()`. Різниця в останньому: `close()` не приймає значення і нічого не повертає, лише закриває генератор (розділ про очищення).

<!-- task: t3 -->

## `yield from`: делегування, рекурсія і місток до `async`

`yield from iterable` віддає назовні по черзі всі елементи iterable, це `yield*` з JS. Без `from` `yield` віддає об'єкт цілком, хоч би це був список, і в Python, і в JS: `yield items` дає один елемент-список, а не елементи списку.

```python
def flat_wrong(pages):
    for page in pages:
        yield page

def flat(pages):
    for page in pages:
        yield from page

pages = [["email", "phone"], ["age"]]
print(list(flat_wrong(pages)))
print(list(flat(pages)))
```

```text
[['email', 'phone'], ['age']]
['email', 'phone', 'age']
```

Головне застосування це рекурсія. Кожен рекурсивний виклик генераторної функції повертає генератор, і `yield from` прокидає його елементи на рівень вище, тож обхід дерева читається як визначення: "віддай себе, потім усе з кожної дитини". Ні явного стеку, ні списку-акумулятора, який передають у кожен виклик.

```ts
function* walk(node: Node): Generator<string> {
  yield node.name;
  for (const child of node.children ?? []) yield* walk(child);
}
```

```python
def walk(node: dict):
    yield node["name"]
    for child in node.get("children", []):
        yield from walk(child)
```

Тут розбіжності немає взагалі: `yield*` у JS теж прокидає `next(v)` і `throw` у вкладений генератор і повертає його `return`-значення. Різниця лише в тому, як часто цим користуються: у Python рекурсивні генератори це звичайний спосіб обходу дерев, файлових систем і вкладених конфігів.

```python live
def walk(node: dict):
    yield node["name"]
    for child in node.get("children", []):
        yield from walk(child)

form = {"name": "signup", "children": [
    {"name": "contact", "children": [{"name": "email"}, {"name": "phone"}]},
    {"name": "plan"},
]}
print(list(walk(form)))
print(next(walk(form)))
```

```text
['signup', 'contact', 'email', 'phone', 'plan']
signup
```

Для простої ітерації `yield from sub` і `for x in sub: yield x` дають однаковий результат. Різниця з'являється на двосторонньому каналі. `yield from` з'єднує зовнішнього споживача прямо з вкладеним генератором (subgenerator; термін з PEP 380): `send` і `throw` ідуть у нього, а значення виразу `yield from` дорівнює його `return`. Ручний цикл викликає `next` на вкладеному генераторі, тож `send`-значення губляться в зовнішньому, а `return` вкладеного ніхто не бачить.

```python
def inner():
    received = yield "inner ready"
    print("inner got", received)
    return "inner result"

def via_yield_from():
    result = yield from inner()
    print("outer got", result)

def via_for():
    for value in inner():
        yield value

for make in (via_yield_from, via_for):
    gen = make()
    print(next(gen))
    try:
        gen.send("hello")
    except StopIteration:
        pass
```

```text
inner ready
inner got hello
outer got inner result
inner ready
inner got None
```

<!-- task: q4 -->

<!-- task: t4 -->

> **Під капотом.** Саме цей канал "наскрізь до найглибшого генератора" зробив можливим asyncio. До Python 3.5 корутини були генераторами, а `await` писали як `yield from` (декоратор `@asyncio.coroutine`, прибраний у 3.11). Синтаксис `async def`/`await` відокремив корутини від генераторів за типом, але не за механізмом: обидва компілюються в ті самі інструкції `SEND` і `YIELD_VALUE`.

```python
import dis

def delegate(sub):
    yield from sub

async def wait(awaitable):
    await awaitable

for func in (delegate, wait):
    ops = [i.opname for i in dis.get_instructions(func)]
    print(func.__name__, [op for op in ops if op in {"SEND", "YIELD_VALUE"}])
```

```text
delegate ['SEND', 'YIELD_VALUE']
wait ['SEND', 'YIELD_VALUE']
```

Ланцюжок `await` закінчується об'єктом, чий `__await__` є генератором, і той `yield` летить через усі рівні `await` до того, хто викликав `send`. Цей хтось і є event loop: він крутить корутину через `send(None)`, отримує віддане значення як знак "я чекаю на щось", а коли дочекався, відновлює її. Нижче цикл подій замінено трьома рядками руками; як це робить справжній цикл, детально в m5-l05.

```python live
class Pause:
    def __await__(self):
        reply = yield "waiting"
        return reply

async def job() -> int:
    value = await Pause()
    return value * 2

coro = job()
print(type(coro).__name__, coro.send(None))
try:
    coro.send(21)
except StopIteration as stop:
    print("result", stop.value)
```

```text
coroutine waiting
result 42
```

## Очищення: `finally`, `close()` і `GeneratorExit`

Генератор можуть кинути на півдорозі: споживач узяв два елементи з десяти й пішов. Якщо генератор тримає ресурс, прибирання пишуть у `try/finally` навколо `yield`. `finally` виконується в трьох випадках: генератор дійшов до кінця; хтось викликав `gen.close()`; об'єкт генератора знищується збирачем сміття, який перед цим сам викликає `close()`. `close()` кидає в точку зупинки виняток `GeneratorExit`, той розкручує `try`, і `finally` відпрацьовує.

```python live
def numbered(items):
    print("open")
    try:
        for n, item in enumerate(items, 1):
            yield f"{n}. {item}"
    finally:
        print("cleanup")

gen = numbered(["email", "phone", "age"])
print(next(gen))
gen.close()
print("after close")
print(next(gen, "exhausted"))
```

```text
open
1. email
cleanup
after close
exhausted
```

> **Пастка.** У JS `break` з `for...of` сам викликає `iterator.return()`, і `finally` генератора відпрацьовує одразу. Python-ський `for` при `break` генератор не закриває. Якщо генератор лежить у змінній, він лишається призупиненим, доки змінна жива; прибирання станеться пізніше, при `close()` або знищенні об'єкта. Генератор, створений прямо в заголовку `for`, у CPython знищується одразу після циклу, бо на нього більше ніхто не посилається, тому там `finally` спрацьовує вчасно. Це гарантія підрахунку посилань у CPython (і в Pyodide, який теж CPython), а не мови: на PyPy знищення відкладене.

```python
def numbered(items):
    print("open")
    try:
        for n, item in enumerate(items, 1):
            yield f"{n}. {item}"
    finally:
        print("cleanup")

gen = numbered(["email", "phone"])
for line in gen:
    break
print("after break")
del gen
print("after del")

for line in numbered(["email", "phone"]):
    break
print("after inline break")
```

```text
open
after break
cleanup
after del
open
cleanup
after inline break
```

`GeneratorExit` успадковує від `BaseException`, а не від `Exception`, тому `except Exception` у тілі генератора його не перехоплює і закриттю не заважає. Перехоплювати `GeneratorExit` явно можна, але після цього генератор мусить завершитись. Якщо він натомість дійде до наступного `yield`, `close()` кидає `RuntimeError`.

```python
print(issubclass(GeneratorExit, Exception), issubclass(GeneratorExit, BaseException))

def stubborn():
    try:
        yield 1
    except GeneratorExit:
        print("not closing")
    yield 2

gen = stubborn()
next(gen)
try:
    gen.close()
except RuntimeError as error:
    print("RuntimeError:", error)
```

```text
False True
not closing
RuntimeError: generator ignored GeneratorExit
```

Звідси правило для генератора, що читає файл: `with open(...)` пишеться всередині генераторної функції. Файл відкривається на першому `next`, а не при виклику, і закривається, коли генератор доходить до кінця, закривається або знищується. Вийти з `with` раніше, повернувши генератор назовні, означає віддати споживачу генератор над уже закритим файлом.

```python live
import os
import tempfile

path = os.path.join(tempfile.mkdtemp(), "fields.txt")
with open(path, "w") as f:
    f.write("email\nphone\nage\n")

opened = []

def read_lines(path):
    with open(path) as f:
        opened.append(f)
        for line in f:
            yield line.rstrip("\n")

gen = read_lines(path)
print(len(opened))
print(next(gen), opened[0].closed)
gen.close()
print(opened[0].closed)

def read_lines_broken(path):
    with open(path) as f:
        return (line.rstrip("\n") for line in f)

try:
    print(list(read_lines_broken(path)))
except ValueError as error:
    print("ValueError:", error)
```

```text
0
email False
True
ValueError: I/O operation on closed file.
```

> **Для капстоуну.** Генератор з одним `yield` усередині `try/finally` це рівно те, що `contextlib.contextmanager` перетворює на контекстний менеджер: код до `yield` стає входом у `with`, код після нього виходом, а `throw` доставляє виняток з тіла `with` у точку `yield`. Детально в m4-l07; тимчасова директорія збірки в капстоуні пишеться саме так.

## Типізація: `Iterator`, `Iterable`, `Generator`

Анотація повернення генераторної функції описує об'єкт, який повертає виклик, а не те, що віддає `yield`. Для звичайного генератора це `Iterator[str]` (можна й `Iterable[str]`, але `Iterator` чесніше: `next` на результаті дозволений). Коли генератор приймає `send` або повертає значення через `return`, потрібен `Generator[YieldType, SendType, ReturnType]`; у 3.12 усі три параметри обов'язкові, значення за замовчуванням для двох останніх з'являються лише в 3.13. Параметр, який генератор лише обходить, анотують найширшим `Iterable[str]`: тоді підходять і список, і кортеж, і файл, і інший генератор. Усе імпортується з `collections.abc` (m2-l06).

```python
from collections.abc import Generator, Iterable, Iterator

def clean(lines: Iterable[str]) -> Iterator[str]:
    for line in lines:
        if line.strip():
            yield line.strip()

def averager() -> Generator[float | None, float, int]:
    total, count, average = 0.0, 0, None
    while True:
        value = yield average
        if value < 0:
            return count
        total, count = total + value, count + 1
        average = total / count

def broken(lines: Iterable[str]) -> list[str]:
    for line in lines:
        yield line

print(len(clean(["a", " "])))
```

```text
$ mypy --strict typed.py
typed.py:17: error: The return type of a generator function should be "Generator" or one of its supertypes  [misc]
typed.py:21: error: Argument 1 to "len" has incompatible type "Iterator[str]"; expected "Sized"  [arg-type]
```

Перевірка вище це mypy у strict-режимі (m2-l08): обидві помилки ловляться до запуску. Під час виконання анотації нічого не перевіряють: виклик `broken` спокійно поверне генератор, хоча анотація обіцяє список. Для `isinstance` годяться ті самі ABC з `collections.abc`, генератор проходить перевірку і на `Iterator`, і на `Generator`, а список лише на `Iterable`.

```python live
from collections.abc import Generator, Iterable, Iterator

def clean(lines: Iterable[str]) -> Iterator[str]:
    for line in lines:
        if line.strip():
            yield line.strip()

gen = clean(["a", " ", "b"])
print(isinstance(gen, Iterator), isinstance(gen, Generator))
print(isinstance(["a"], Iterable), isinstance(["a"], Iterator))
print(clean.__annotations__["return"])
```

```text
True True
True False
collections.abc.Iterator[str]
```

> **Пастка.** Порядок параметрів у TS інший: `Generator<T, TReturn, TNext>` це "віддає, повертає, приймає". У Python `Generator[Y, S, R]` це "віддає, приймає, повертає". Перекладаючи тип з TS, легко переставити `send` і `return` місцями.

## Для капстоуну

У m1-l10 дерево конфігу форми розгорталось у список рекурсивним comprehension `all_elements`. Генератор `walk` робить те саме ліниво: пошук першого елемента за умовою зупиняється на ньому, а не будує список усіх елементів. Разом з `next(..., None)` з m5-l01 це пошук без проходу всього дерева. Глибину зручно передавати параметром і віддавати разом з елементом: так будується outline конфігу для логів і повідомлень про помилки.

```python live
from collections.abc import Iterator

form = {
    "type": "form", "name": "signup", "children": [
        {"type": "section", "name": "contact", "children": [
            {"type": "email", "name": "email"},
            {"type": "phone", "name": "phone"},
        ]},
        {"type": "select", "name": "plan"},
    ],
}

def walk(element: dict, depth: int = 0) -> Iterator[tuple[int, dict]]:
    yield depth, element
    for child in element.get("children", []):
        yield from walk(child, depth + 1)

for depth, el in walk(form):
    print("  " * depth + f"{el['type']}:{el['name']}")

print(next((el["name"] for _, el in walk(form) if el["type"] == "phone"), None))
```

```text
form:signup
  section:contact
    email:email
    phone:phone
  select:plan
phone
```

Генерація сторінок у капстоуні це конвеєр того самого вигляду, що й `read_lines → parse → filter`: `configs → validate → render → publish`. Джерело конфігів (файли, рядки з SQLite) віддає по одному, невалідні відсіюються, рендер іде по одному, а воркер забирає результати порціями через `islice`, щоб публікувати пачками й не тримати всю генерацію в пам'яті. Синхронна версія нижче це прообраз асинхронної: у m5-l05 рендер стане корутиною під `TaskGroup`, а в m5-l06 етапи стануть асинхронними генераторами з `async for`.

```python live
from collections.abc import Iterable, Iterator
from itertools import islice

def validate(configs: Iterable[dict]) -> Iterator[dict]:
    for config in configs:
        if config.get("fields"):
            yield config
        else:
            print("invalid", config["id"])

def render(configs: Iterable[dict]) -> Iterator[str]:
    for config in configs:
        yield f"<form id={config['id']}>"

configs = [{"id": f"f{n}", "fields": ["email"] * (n % 3)} for n in range(1, 7)]
pages = render(validate(configs))
while batch := list(islice(pages, 2)):
    print("publish", batch)
```

```text
publish ['<form id=f1>', '<form id=f2>']
invalid f3
publish ['<form id=f4>', '<form id=f5>']
invalid f6
```

`invalid f3` друкується між пачками, а `invalid f6` після останньої: валідація відбувається не наперед, а тоді, коли воркер просить наступну порцію і `islice` тягне елементи через увесь ланцюжок. Останній `list(islice(...))` повертає порожній список, і `while` з walrus завершується.

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **Генератори як екзотика.** У JS `function*` трапляється рідко, тому функцію, що віддає послідовність, пишуть через список-акумулятор, а ітератор через клас. У Python ліниві ітератори всюди: `map`, `zip`, `enumerate`, файл, `re.finditer` працюють за тією самою моделлю, а `os.walk` і `contextmanager` це буквально генератори. Правильно: якщо результат обходять один раз, `yield` замість `append`.

   ```python
   def visible(fields):          # за звичкою
       result = []
       for f in fields:
           if not f.get("hidden"):
               result.append(f["id"])
       return result

   def visible(fields):          # правильно
       for f in fields:
           if not f.get("hidden"):
               yield f["id"]
   ```

2. **`Array.from(gen)` і `[...gen]`.** Їх аналог `list(gen)`, але частіше він не потрібен зовсім: `sum`, `any`, `max`, `"".join`, `set`, `dict` приймають генератор напряму. `list` ставлять, лише коли потрібні довжина, індекс або кілька проходів.

   ```python
   total = sum(list(len(f) for f in fields))   # зайвий список
   total = sum(len(f) for f in fields)         # правильно
   ```

3. **`yield items` замість `yield from items`.** Без `from` віддається весь список одним елементом, як `yield arr` без зірочки в JS. Правильно: `yield from` для делегування й рекурсії.

   ```python
   def flat(pages):
       for page in pages:
           yield from page        # не yield page
   ```

4. **Повторний прохід по вичерпаному генератору.** Результат функції зберегли в змінну, обійшли раз для перевірки, другий раз для роботи, і другий цикл тихо нічого не зробив. Правильно: `list(...)` один раз, якщо проходів кілька, або новий виклик генераторної функції на кожен прохід.

   ```python
   ids = (f["id"] for f in fields)
   print("email" in ids)
   print(list(ids))              # залишок або [], без помилки
   ids = [f["id"] for f in fields]
   ```

5. **`return` як `{ value, done: true }`, який хтось прочитає.** `return` у генераторі не повертає значення викликачу, а `for` і `list` викидають `StopIteration.value`. Ранній `return []` дає порожній генератор. Правильно: віддавати дані через `yield`, а `return value` використовувати лише разом з `yield from` або `send`-протоколом.

   ```python
   def ids(fields):
       if not fields:
           return ["<empty>"]    # list(ids([])) == []
       yield from (f["id"] for f in fields)
   ```

6. **Очікування, що `break` закриє генератор.** У JS `for...of` викликає `return()`, у Python ні: генератор у змінній лишається відкритим разом з файлом чи з'єднанням усередині. Правильно: `with` усередині генератора плюс `gen.close()` або `contextlib.closing(gen)` там, де генератор кидають на півдорозі.

   ```python
   from contextlib import closing

   with closing(read_lines(path)) as lines:
       for line in lines:
           if line == "stop":
               break             # close() гарантовано на виході з with
   ```

7. **`send` до першого `next`.** У JS перший `next(value)` мовчки ігнорує аргумент, у Python `send(value)` на новому генераторі кидає `TypeError`. Правильно: спершу `next(gen)`, потім `send`.

   ```python
   avg = averager()
   next(avg)                     # priming
   avg.send(10)
   ```

8. **Параметри `Generator` у порядку TS.** `Generator<T, TReturn, TNext>` переносять як `Generator[T, R, S]`. Правильно: `Generator[Yield, Send, Return]`, а для простого генератора взагалі `Iterator[T]`.

   ```python
   def averager() -> Generator[float | None, float, int]: ...
   def clean(lines: Iterable[str]) -> Iterator[str]: ...
   ```

## Підсумок

- Будь-який `yield` у тілі робить функцію генераторною: виклик повертає генератор, тіло стартує лише на першому `next`.
- Генератор це заморожений фрейм: локальні змінні й позиція зберігаються між `yield`; кінець тіла кидає `StopIteration`.
- Генератор уже є ітератором; клас з `__next__` пишуть рідко, а `__iter__` контейнера пишуть генератором.
- Генератор тримає в пам'яті один елемент і свій фрейм, але проходиться один раз і не має `len` та індексу.
- Конвеєр з генераторів pull-based: кожен елемент проходить увесь ланцюжок, `islice` зупиняє роботу на `n` елементах; `list` або `sorted` посередині вбиває лінивість.
- `yield from` делегує під-генератору: елементи, `send`, `throw` і `return`-значення; це основа рекурсивних обходів.
- `send` передає значення у вираз `yield`, `throw` кидає виняток у точку зупинки, `return value` потрапляє в `StopIteration.value`.
- `async def` і `await` стоять на тому самому механізмі, що генератор і `yield from`; event loop це той, хто викликає `send`.
- Прибирання в `try/finally` навколо `yield`, файл через `with` усередині генератора; `break` генератор не закриває, `close()` і `closing` закривають.
- Типи: `Iterator[T]` для простого генератора, `Generator[Y, S, R]` для `send`/`return`, `Iterable[T]` для параметрів.

## Що далі

Наступний урок m5-l03 про `itertools` і `functools`: `islice`, `chain`, `batched`, `groupby` і решта ледачих будівельних блоків, якими конвеєри з цього уроку складаються без власних генераторів. Модель "елемент проходить увесь ланцюжок" і одноразовість ітераторів там мовчки припускаються. Далі m5-l05 повертається до `send` і `yield from` уже як до механізму корутин, а m5-l06 переносить конвеєри в асинхронні генератори.
