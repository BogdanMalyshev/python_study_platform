---
id: m1-l03
module: m1-syntax
title: "== проти is, truthiness: порівняння без коерції"
summary: "Учень порівнює значення через ==, об'єкти через is лише для None і sentinel-об'єктів, знає, що в Python хибне і як це вирішує сам об'єкт, пише дефолти без пастки з or і читає ланцюжкові порівняння."
duration_min: 60
prerequisites: [m1-l02]
---

## `==` порівнює значення, `is` порівнює об'єкт

У JS два оператори рівності, і кожен змішує дві різні роботи. `===` для примітивів порівнює значення, а для об'єктів посилання; `==` робить те саме, але спершу зводить операнди до спільного типу. Python розводить ці роботи по двох операторах без змішування: `==` завжди питає "чи рівні значення", `is` завжди питає "чи це той самий об'єкт". Коерції між типами немає в жодному з них.

```ts
const a = [1, 2];
const b = [1, 2];
const c = a;
console.log(a == b);    // false
console.log(a === b);   // false
console.log(c === a);   // true
console.log(1 == "1");  // true
```

```python
a = [1, 2]
b = [1, 2]
c = a
print(a == b)
print(a is b)
print(c is a)
print(id(a) == id(b), id(c) == id(a))
print(1 == "1")
```

```text
True
False
True
False True
False
```

Розходження перше: `==` на двох різних списках з однаковим вмістом дає `True`, у JS для масивів обидва оператори дають `false`, бо порівнюють посилання. Друге: `1 == "1"` у Python `False`, а не `true`. Те, що в JS робить `===` для об'єктів, у Python робить `is`, а те, що `===` робить для примітивів, робить звичайний `==`.

`is` перевіряє identity (ідентичність об'єкта; офіційний термін, документація пише "object identity"). Кожен об'єкт має `id(x)`, ціле число, унікальне серед живих об'єктів, і `a is b` означає рівно `id(a) == id(b)`. У CPython `id` це адреса об'єкта в пам'яті, але це деталь реалізації: важливо лише, що два живі об'єкти не мають однакового `id`.

Коерції в `==` немає, тому порівняння значень різних типів просто дає `False`, без перетворень і без винятку. Виняток із правила лише один, і він не коерція: числові типи порівнюються за математичним значенням, а `bool` це підклас `int` (m1-l02), тож `True == 1` і `1 == 1.0` істинні.

```python
print(1 == "1", 0 == "", None == 0, [] == False, "" == False)
print(1 == 1.0, True == 1, False == 0, 0.5 == 1 / 2)
print(1 != "1")
```

```text
False False False False False
True True True True
True
```

Через це в Python немає й не потрібен `===`: `==` уже строгий щодо типів, а порівняння посилань має окреме слово. Заперечення теж два: `!=` для значень і `is not` для об'єктів.

Що саме вважати "рівними значеннями", вирішує тип лівого операнда: `a == b` викликає метод `a.__eq__(b)`. Методи з подвійними підкресленнями з обох боків називають dunder-методами (від "double underscore"; це жаргон спільноти, документація називає їх special methods). Клас без власного `__eq__` успадковує його від `object`, і там рівність означає identity. Свій `__eq__` змінює це, а `!=` автоматично стає його запереченням. Детально про `__eq__` і пару до нього `__hash__` в m4-l02.

```python
class FieldRef:
    def __init__(self, field_id: str):
        self.field_id = field_id

print(FieldRef("email") == FieldRef("email"))


class FieldRef:
    def __init__(self, field_id: str):
        self.field_id = field_id

    def __eq__(self, other):
        return isinstance(other, FieldRef) and self.field_id == other.field_id


a = FieldRef("email")
b = FieldRef("email")
print(a == b)
print(a != b)
print(a is b)
print(a == "email")
```

```text
False
True
False
False
False
```

> **Під капотом.** Коли `int.__eq__` отримує рядок, він не кидає помилку і не повертає `False`, а повертає спеціальну константу `NotImplemented`: "я не знаю, як порівнюватись із цим типом". Тоді Python пробує дзеркальний виклик `"1".__eq__(1)`. Якщо й той повертає `NotImplemented`, `==` падає назад на identity, і для різних об'єктів це `False`. Саме тому `1 == "1"` дає `False`, а не `TypeError`.

```python
print((1).__eq__("1"), "1".__eq__(1))
print((1).__eq__(1))
```

```text
NotImplemented NotImplemented
True
```

<!-- task: q1 -->

## Коли потрібен `is`: `None` і sentinel-об'єкти

`is` правильний там, де за задумом існує рівно один об'єкт, і питання звучить як "це він?". Головний випадок це `None`: він singleton, другого `None` створити не можна навіть явно, тому `x is None` відповідає точно і не залежить від того, що за об'єкт `x`.

`x == None` для вбудованих типів працює, але питає не те. Він викликає `x.__eq__(None)`, а цей метод може повернути що завгодно. Нижче клас, який вважає себе рівним усьому; у реальному коді так поводяться колонки SQLAlchemy, де `column == None` будує SQL-вираз `IS NULL`, і масиви numpy, де `==` порівнює поелементно.

```python
class Anything:
    def __eq__(self, other):
        return True


x = Anything()
print(x == None)
print(x is None)
print(type(None)() is None)
```

```text
True
False
True
```

> **Пастка.** `x == None` і `x != None` з JS-звички `x !== null` працюють, поки `x` вбудованого типу, і ламаються на першому класі з власним `__eq__`. PEP 8 вимагає порівнювати з singleton-ами лише через `is` / `is not`, лінтери ловлять це правилом E711. JS-ланцюжок `x !== null && x !== undefined` перекладається одним `x is not None`.

З `True` і `False` інакше. PEP 8 не радить ні `if flag == True:`, ні `if flag is True:`, правильно просто `if flag:`. `is True` виправданий лише тоді, коли значення може бути будь-яким truthy-об'єктом, а потрібен саме булевий `True`: наприклад, у JSON-конфігу `"required": 1` і `"required": true` треба розрізнити. `== True` тут не допоможе, бо `1 == True`.

```python
flags = [True, 1, 1.0, "yes"]
print([v == True for v in flags])
print([v is True for v in flags])
print([isinstance(v, bool) and v for v in flags])
```

```text
[True, True, True, False]
[True, False, False, False]
[True, False, False, False]
```

Третій законний випадок це sentinel-об'єкт (sentinel; слово з документації, так названо параметр `iter(callable, sentinel)`, а сам патерн це загальновживаний термін спільноти). Він потрібен, коли `None` є нормальним значенням і не може означати "нічого не передали". Типова ситуація: у конфігу `"label": null` означає "підпис явно прибрали", а відсутній ключ означає "не чіпати". Sentinel створюють як `object()`: такий об'єкт унікальний і нічому, крім себе, не рівний.

```python
_MISSING = object()


def get_option(options: dict, key: str, default=_MISSING):
    value = options.get(key, _MISSING)
    if value is _MISSING:
        if default is _MISSING:
            raise KeyError(key)
        return default
    return value


options = {"label": None, "max_length": 0}
print(get_option(options, "label"))
print(get_option(options, "max_length"))
print(get_option(options, "hint", "n/a"))
print(get_option(options, "hint"))
```

```text
None
0
n/a
Traceback (most recent call last):
  File "example.py", line 17, in <module>
    print(get_option(options, "hint"))
          ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "example.py", line 8, in get_option
    raise KeyError(key)
KeyError: 'hint'
```

Перевіряють sentinel через `is`, а не `==`, з тієї самої причини, що й `None`: `==` дає слово чужому `__eq__`. Стандартна бібліотека робить так само, наприклад `dataclasses.MISSING` для полів без значення за замовчуванням.

```python
class Anything:
    def __eq__(self, other):
        return True


_MISSING = object()
print(Anything() == _MISSING)
print(Anything() is _MISSING)
```

```text
True
False
```

<!-- task: t1 -->

## Кеш малих int та інтернування рядків: деталь реалізації

JS-розробник, який перейшов на `is` як на "строге порівняння", швидко бачить, що на малих числах це працює, і так само швидко отримує баг на великих. Приклад нижче запущено як скрипт у CPython 3.12. Результат `is` тут не гарантія мови, а наслідок того, як саме CPython створює й зберігає об'єкти; інший інтерпретатор або інша версія можуть дати інше.

```python live
a = 256
b = 256
print(a is b)

x = int("256")
y = int("256")
print(x is y)

x = int("257")
y = int("257")
print(x == y, x is y)

c = 257
d = 257
print(c is d)
```

```text
True
True
True False
True
```

Пояснення три. CPython при старті створює об'єкти для всіх цілих від -5 до 256 і завжди повертає ці самі об'єкти, тож будь-яке `256` це один об'єкт (жаргонно "кеш малих int"; у документації C API до `PyLong_FromLong` це прямо названо поведінкою поточної реалізації). `int("257")` щоразу створює новий об'єкт, тому `is` дає `False` при рівних значеннях. А `c = 257; d = 257` дає `True` з іншої причини: компілятор зберігає однакові константи одного блоку коду один раз, і обидва імені вказують на ту саму константу.

Останнє залежить від того, як код скомпільовано. REPL компілює кожен рядок окремо, тому там `c is d` для 257 дає `False`. `exec` кожного рядка окремо відтворює саме цю поведінку:

```python
ns = {}
exec("c = 257", ns)
exec("d = 257", ns)
print(ns["c"] == ns["d"], ns["c"] is ns["d"])
```

```text
True False
```

З рядками те саме явище називається інтернуванням (interning; офіційний термін, є функція `sys.intern`). Рядкові літерали, схожі на ідентифікатори, CPython зберігає в одному екземплярі, а рядок, зібраний під час виконання, це новий об'єкт, доки його явно не інтернувати.

```python
import sys

a = "email"
b = "email"
print(a is b)

c = "".join(["em", "ail"])
print(a == c, a is c)
print(sys.intern(c) is a)
```

```text
True
True False
True
```

Висновок практичний: те, чи дасть `is` на числі або рядку `True`, залежить від діапазону, від того, звідки прийшло значення (літерал, обчислення, `json.loads`), і від того, як скомпільовано код. На це не можна спиратись ніде. Компілятор з 3.8 сам попереджає, коли бачить `is` з літералом:

```python
x = 5
print(x is 5)
print(x == 5)
```

```text
example.py:2: SyntaxWarning: "is" with 'int' literal. Did you mean "=="?
  print(x is 5)
True
True
```

> **Пастка.** `True` у першому рядку виводу вище це не "працює", а збіг: 5 потрапило в кеш. Значення, що приходять з бази, форми чи JSON, рідко бувають літералами в тому самому файлі, і `is` на них зламається без жодного попередження. Правило: `is` лише для `None`, sentinel-об'єктів, `True`/`False` у рідкісному випадку вище і явного питання "це той самий список?". Усе інше `==`.

## `==` на колекціях: поелементно і рекурсивно

У JS порівняти два масиви або об'єкти за вмістом можна лише бібліотекою (`isEqual` з lodash) або хаком через `JSON.stringify`, який ще й чутливий до порядку ключів. У Python це звичайний `==`: списки, кортежі, словники й множини порівнюються за вмістом, рекурсивно, і кожна пара елементів порівнюється своїм `==`.

```ts
console.log([1] == [1]);                    // false
console.log(JSON.stringify({ a: 1, b: 2 }) === JSON.stringify({ b: 2, a: 1 }));  // false
```

```python
print([1, 2] == [1, 2])
print([1, [2, {"a": 3}]] == [1, [2, {"a": 3}]])
print({"a": 1, "b": 2} == {"b": 2, "a": 1})
print({1, 2, 3} == {3, 2, 1})
print([1, 2] == [2, 1])
print([1, 2] == (1, 2))
print(list((1, 2)) == [1, 2])
print([1, 2.0, True] == [1, 2, 1])
```

```text
True
True
True
True
False
False
True
True
```

Поведінка розходиться в трьох місцях. Тип контейнера важливий: `[1, 2] == (1, 2)` це `False`, бо список і кортеж різні типи, і коерції немає навіть між послідовностями; якщо потрібне порівняння вмісту, приведіть явно. Порядок важливий для списків і кортежів, але не для словників і множин, на відміну від `JSON.stringify`. Елементи порівнюються своїм `==`, тому всередині колекцій діє те саме числове правило: `[2.0] == [2]` і `[True] == [1]`.

> **Під капотом.** Порівнюючи елементи, список спершу перевіряє `is`, і лише потім `==`. Різниця видна на `nan`, який за IEEE 754 не дорівнює сам собі: той самий об'єкт `nan` у двох списках дає рівні списки, два різні `nan` не дають.

```python
nan = float("nan")
print(nan == nan)
print([nan] == [nan])
print([nan] == [float("nan")])
```

```text
False
True
False
```

`==` відповідає на питання "чи однаковий зараз вміст", `is` на питання "чи зміна через одне ім'я буде видна через інше". Для двох імен одного списку це одне й те саме місце в пам'яті, тому `append` через `b` змінює `a`. Aliasing і копіювання детально в m2-l02.

```python
a = [1, 2]
b = a
b.append(3)
print(a, a is b)
```

```text
[1, 2, 3] True
```

<!-- task: q2 -->

## Truthiness: що хибне і чому

Truthiness (жаргон спільноти; документація називає це "truth value testing", а слова truthy і falsy теж жаргон, але на співбесіді їх зрозуміють) це те, яким `bool` стає об'єкт в `if`, `while`, `not`, `and`, `or`. Хибних значень у Python небагато, і всі вони підпадають під одне правило: "нічого", нуль будь-якого числового типу, або порожня колекція.

```python
falsy = [None, False, 0, 0.0, "", [], {}, set(), (), range(0)]
print([bool(v) for v in falsy])

truthy = ["0", "False", " ", [0], [[]], {"": None}, -1, 0.001, (None,)]
print([bool(v) for v in truthy])
```

```text
[False, False, False, False, False, False, False, False, False, False]
[True, True, True, True, True, True, True, True, True]
```

Правило "порожнє хибне" не окремий перелік типів, а наслідок механізму: контейнер хибний, коли його довжина нуль (як саме, в наступному розділі). Тому `[0]` і `[[]]` істинні, у них по одному елементу, а що це за елемент, не важить. Рядок `"False"` і рядок з пробілу теж непорожні, тож істинні.

```ts
if ([]) console.log("[] truthy");
if ({}) console.log("{} truthy");
if ("0") console.log('"0" truthy');
if (!0) console.log("0 falsy");
console.log(Boolean(NaN));  // false
```

```python
if not []:
    print("[] falsy")
if not {}:
    print("{} falsy")
if "0":
    print('"0" truthy')
if not 0:
    print("0 falsy")
print(bool(float("nan")))
```

```text
[] falsy
{} falsy
"0" truthy
0 falsy
True
```

Розходження в контейнерах: порожній масив і порожній об'єкт у JS істинні, у Python порожні список і словник хибні. `"0"` істинний в обох мовах, `0` хибний в обох. `NaN` навпаки: у JS хибний, у Python `nan` істинний, бо він не дорівнює нулю. `Boolean(x)` і `!!x` перекладаються як `bool(x)`, а JS-ідіома `if (arr.length)` стає просто `if items:`.

Звідси ідіома перевірки на порожнечу: `if not items:` замість `if len(items) == 0:`, і `if items:` замість `if len(items) > 0:`. PEP 8 рекомендує саме її, вона працює однаково для списку, рядка, словника, множини і будь-якого класу з `__len__`. Але вона зливає два різні стани: "даних немає зовсім" (`None`) і "дані є, але порожні" (`[]`). Там, де ця різниця важлива, `is None` перевіряється окремо і першим.

```python
def summarize(items: list[str] | None) -> str:
    if items is None:
        return "not loaded"
    if not items:
        return "empty"
    return f"{len(items)} item(s)"


print(summarize(None))
print(summarize([]))
print(summarize(["email"]))


def summarize_naive(items: list[str] | None) -> str:
    if not items:
        return "empty"
    return f"{len(items)} item(s)"


print(summarize_naive(None))
```

```text
not loaded
empty
1 item(s)
empty
```

> **Пастка.** `if not value:` у валідації відповіді на форму вважає незаповненими `0`, `0.0` і `False`. Для поля "кількість" нуль це відповідь, для чекбокса `False` теж. Truthiness підходить для колекцій, а для скалярних значень, де `0` легальний, перевіряйте явно: `value is None`, `value == ""`.

<!-- task: t2 -->

## `__bool__` і `__len__`: як об'єкт вирішує свою truthiness

`bool(x)` і будь-яка умова питають об'єкт у фіксованому порядку. Якщо в класі є `__bool__`, результат його виклику і є відповіддю. Якщо `__bool__` немає, але є `__len__`, об'єкт хибний при довжині нуль. Якщо немає жодного, об'єкт завжди істинний. Саме тому "порожні колекції хибні": у `list`, `dict`, `str` немає `__bool__`, а є `__len__`.

```python
class Page:
    def __init__(self, fields: list[str]):
        self.fields = fields

    def __len__(self):
        return len(self.fields)


class Answer:
    def __init__(self, value):
        self.value = value

    def __bool__(self):
        return self.value is not None


class Plain:
    pass


print(bool(Page([])), bool(Page(["email"])))
print(bool(Answer(None)), bool(Answer(0)))
print(bool(Plain()))
if not Page([]):
    print("page is empty")
```

```text
False True
False True
True
page is empty
```

Якщо є обидва методи, `__len__` для truthiness не викликається взагалі, і об'єкт може мати довжину нуль, але бути істинним. Так робити варто лише свідомо, бо читач очікує, що порожнє хибне.

```python
class Both:
    def __bool__(self):
        print("__bool__ called")
        return True

    def __len__(self):
        print("__len__ called")
        return 0


print(bool(Both()))
print(len(Both()))
```

```text
__bool__ called
True
__len__ called
0
```

`__bool__` зобов'язаний повернути саме `bool`. Повернути `1` чи непорожній рядок, як це прокатило б у JS, не вийде: Python перевіряє тип результату.

```python
class Broken:
    def __bool__(self):
        return 1


print(bool(Broken()))
```

```text
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    print(bool(Broken()))
          ^^^^^^^^^^^^^^
TypeError: __bool__ should return bool, returned int
```

> **JS-аналог.** У JS об'єкт не може вплинути на свою truthiness: будь-який об'єкт істинний, навіть `new Boolean(false)`. У Python клас вирішує сам, і це частина контракту типу. Детально про dunder-методи, зокрема `__len__` поруч із `__getitem__` і `__iter__`, в m4-l02.

<!-- task: t3 -->

## `and`, `or`, `not`: оператори-слова, що повертають операнд

Логічні оператори в Python це слова `and`, `or`, `not`. Символьних `&&`, `||`, `!` немає, і JS-звичка дає `SyntaxError` ще до запуску.

```python
ok = True
if ok && ok:
    print("ok")
```

```text
  File "example.py", line 2
    if ok && ok:
           ^
SyntaxError: invalid syntax
```

`and` і `or` повертають не `bool`, а один з операндів, і обчислюють правий лише за потреби (short-circuit; офіційний термін, документація називає їх short-circuit operators). `a or b` повертає `a`, якщо `a` truthy, інакше `b`. `a and b` повертає `a`, якщо `a` falsy, інакше `b`. Це в точності `||` і `&&` з JS, тільки з Python-правилами truthiness.

```python
print(0 or 10)
print("" or "default")
print("value" or "default")
print(None or [] or 0)
print(1 and "x")
print(0 and "x")
print([] and "x")
```

```text
10
default
value
0
x
0
[]
```

```python
def load(name):
    print("load", repr(name))
    return name


print(load("") or load("fallback") or load("never"))
print(load(0) and load("never"))
```

```text
load ''
load 'fallback'
fallback
load 0
0
```

Ідіома `x or default` тому скрізь у Python-коді, але це `||`, а не `??`. Оператора `??` у Python немає.

```ts
const count = 0;
console.log(count || 10);  // 10
console.log(count ?? 10);  // 0
```

```python
count = 0
print(count or 10)
print(count if count is not None else 10)

count = None
print(count or 10)
print(count if count is not None else 10)
```

```text
10
0
10
10
```

Поведінка розходиться в тому, що `??` у JS підміняє лише `null` і `undefined`, а `or` у Python підміняє будь-яке falsy-значення: `0`, `""`, `[]`, `False`. Коли ці значення легальні, `or` це баг. Точний переклад `??` це умовний вираз `x if x is not None else default` (синтаксис тернарного виразу детально в m1-l05).

> **Пастка.** `page_size = params.get("page_size") or 20` виглядає як дефолт, але запит з `page_size=0` мовчки отримає 20. Те саме з `timeout or 30`, де `0` означало "не чекати", і з `label or "Untitled"`, де порожній рядок це свідомий вибір користувача. `or` для дефолту доречний лише там, де всі falsy-значення справді означають "немає".

<!-- task: q3 -->

`not` на відміну від `and` і `or` завжди повертає `bool`. Пріоритет від найсильнішого: порівняння (`==`, `<`, `in`, `is`), потім `not`, потім `and`, потім `or`. Тому `not a == b` означає `not (a == b)`, а `a or b and c` означає `a or (b and c)`. Для `is` і `in` є готові заперечення `is not` і `not in`, і саме їх пишуть замість `not x is None`: результат той самий, але читається як одна операція.

```python
a, b, c = True, False, False
print(a or b and c)
print((a or b) and c)
print(not 1 == 2)

x = None
print(not x is None)
print(x is not None)
print("a" not in ["b"])
```

```text
True
False
True
False
False
True
```

Пріоритет пояснює класичну пастку `x == 1 or 2`. Читається як "x дорівнює 1 або 2", а розбирається як `(x == 1) or 2`. Коли `x` не 1, ліва частина `False`, і `or` повертає `2`, яке в `if` істинне. Умова істинна завжди. Правильна форма це `x in (1, 2)`, або повністю `x == 1 or x == 2`.

```python
for x in [1, 2, 3]:
    print(x, x == 1 or 2, bool(x == 1 or 2), x in (1, 2))
```

```text
1 True True True
2 2 True True
3 2 True False
```

<!-- task: q4 -->

## Ланцюжкові порівняння і порядок між типами

Порівняння в Python можна ставити в ланцюжок (chained comparisons; офіційна назва з документації): `0 <= x < 10` читається як у математиці. У JS той самий запис компілюється, але означає інше.

```ts
console.log(3 > 2 > 1);  // false: (3 > 2) is true, true > 1 is 1 > 1
```

```python live
x = 5
print(0 <= x < 10)
print(0 <= x and x < 10)
print(3 > 2 > 1)
print((3 > 2) > 1)
print(1 < 3 > 2)
a = b = c = 7
print(a == b == c)
```

```text
True
True
True
False
True
True
```

Розходження в тому, що `a < b < c` у Python це не `(a < b) < c`, а `a < b and b < c`. JS обчислює ліве порівняння, отримує `true`, і порівнює вже його з `1`. Python так зробить лише з явними дужками, і тоді результат збігається з JS. Ланцюжок не обов'язково монотонний: `1 < 3 > 2` легальний і істинний, хоча читається погано.

Середній операнд ланцюжка обчислюється один раз. Ручне розгортання через `and` викликає функцію двічі, і для функції з побічним ефектом це не те саме.

```python
def value():
    print("value() called")
    return 5


print(0 <= value() < 10)
print(0 <= value() and value() < 10)
```

```text
value() called
True
value() called
value() called
True
```

> **Пастка.** У ланцюжок потрапляють усі оператори порівняння, включно з `in`, `is` і `==`. `1 in [1] == True` це не `(1 in [1]) == True`, а `1 in [1] and [1] == True`, і результат `False`. Змішувати `in`/`is` з іншими порівняннями в одному ланцюжку не варто взагалі; а `== True` після `in` зайве, як видно з розділу про `is`.

```python
print(1 in [1] == True)
print((1 in [1]) == True)
print(1 in [1] and [1] == True)
```

```text
False
True
False
```

Ланцюжки працюють лише між типами, які вміють упорядковуватись. `==` між різними типами тихо дає `False`, а `<` дає `TypeError`: для порядку немає запасного варіанту на кшталт identity, і якщо обидва `__lt__` повернули `NotImplemented`, Python не вигадує відповідь. У JS `1 < "a"` це `false`, бо `"a"` перетворюється в `NaN`.

```python
print(1 < 2.5, True < 2)
print(1 == "a", None == 0)
print(1 < "a")
```

```text
True True
False False
Traceback (most recent call last):
  File "example.py", line 3, in <module>
    print(1 < "a")
          ^^^^^^^
TypeError: '<' not supported between instances of 'int' and 'str'
```

Через це сортування змішаного списку падає, а не дає JS-результат. JS `[10, 9, "a", 1].sort()` порівнює все як рядки й повертає `[1, 10, 9, "a"]`. Python вимагає, щоб елементи були порівнюваними між собою, і `None` серед чисел це найчастіший спосіб на це наступити.

```python
print(sorted([3, "a", 1]))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(sorted([3, "a", 1]))
          ^^^^^^^^^^^^^^^^^^^
TypeError: '<' not supported between instances of 'str' and 'int'
```

```python
print(sorted([3, None, 1]))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print(sorted([3, None, 1]))
          ^^^^^^^^^^^^^^^^^^^^
TypeError: '<' not supported between instances of 'NoneType' and 'int'
```

Виправлення завжди явне: вирішити, як упорядковувати різнотипні значення, і сказати це через `key`. `key=str` відтворює поведінку JS, відфільтрувати `None` або винести його в кінець кортежем `(v is None, ...)` це вже рішення для даних. Кортежі порівнюються поелементно, тож першим іде прапорець, другим саме значення. `sorted` з `key` детально в m1-l10.

```python
print(sorted([10, 9, "a", 1], key=str))

values = [3, None, 1]
print(sorted(v for v in values if v is not None))
print(sorted(values, key=lambda v: (v is None, v or 0)))
```

```text
[1, 10, 9, 'a']
[1, 3]
[1, 3, None]
```

## Для капстоуну

Конфіг поля FormBuilder і відповіді на форму приходять як JSON, а `json.loads` перетворює `null` у `None`, `false` у `False`, а відсутній ключ просто не створює. Тобто в одному словнику живуть три різні стани: "ключа немає", "значення `None`" і "значення falsy, але легальне" (`0`, `False`, `""`). Усі три `or` і `if not` зливають в один.

```python
import json

field = json.loads('{"id": "note", "label": null, "max_length": 0, "required": false}')
print(field)

print(field.get("max_length") or 255)

max_length = field.get("max_length")
if max_length is None:
    max_length = 255
print(max_length)

print("label" in field, field.get("label") is None)
print("hint" in field, field.get("hint") is None)
print(field["required"] is False, not field["required"])
```

```text
{'id': 'note', 'label': None, 'max_length': 0, 'required': False}
255
0
True True
False True
True True
```

`field.get("max_length") or 255` перетворив свідомий `0` на 255. Явна перевірка `is None` зберегла його. А розрізнити "ключа немає" і "ключ є зі значенням `None`" можна лише через `in` або через `get` із sentinel замість `None`, бо `field.get(...)` в обох випадках повертає `None`.

> **Для капстоуну.** PATCH-запит на зміну поля це саме ця трійка станів: ключа немає означає "не чіпати", `null` означає "очистити", будь-яке інше значення означає "встановити", включно з `0` і `""`. У модулі 2 Pydantic дасть для цього `model_dump(exclude_unset=True)` (m2-l09), але під ним та сама ідея, що й у sentinel-об'єкта.

<!-- task: t4 -->

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **`===` і `!==` за звичкою.** Пальці набирають три знаки, Python бачить `SyntaxError`. Правильно: `==` і `!=` для значень; вони вже без коерції. Для identity `is` і `is not`.

   ```python
   if x === 1:     # SyntaxError: invalid syntax
       ...
   if x == 1:      # правильно
       ...
   ```

2. **`x !== null && x !== undefined` перекладають як `x != None`.** Працює на вбудованих типах і ламається на класі з власним `__eq__`. Правильно: одне `x is not None`, бо `undefined` у Python немає.

   ```python
   if x != None:       # за звичкою, E711
       ...
   if x is not None:   # правильно
       ...
   ```

3. **`is` як "строге порівняння" для чисел і рядків.** На малих числах і коротких літералах збігається з `==` через кеш CPython, на значеннях з JSON чи бази ламається. Правильно: `==` для всіх значень, `is` лише для `None`, sentinel і identity.

   ```python
   x = int("257")
   y = int("257")
   print(x is y)   # False у CPython 3.12
   print(x == y)   # True
   ```

4. **`if (arr.length)` і `if len(items) == 0`.** Пряма калька з JS. Правильно: `if items:` і `if not items:`; якщо `None` означає щось інше, ніж порожній список, перевірити `is None` окремо першим.

   ```python
   if len(items) == 0:   # за звичкою
       ...
   if not items:         # правильно
       ...
   ```

5. **`||` для дефолтів переїжджає в `or`.** `count or 10` при `count == 0` дає 10, як `||` у JS, а не 0, як `??`. Правильно: `x if x is not None else default`.

   ```python
   count = 0
   print(count or 10)                              # 10
   print(count if count is not None else 10)       # 0
   ```

6. **`Boolean(x)` і `!!x`.** `Boolean` у Python немає, `!` це `SyntaxError`, `not not x` працює, але так ніхто не пише. Правильно: `bool(x)`, а в умові нічого, бо `if` сам застосовує truthiness.

   ```python
   print(bool([]), bool("0"), bool(float("nan")))   # False True True
   ```

7. **`x == 1 or 2` як "x дорівнює 1 або 2".** Розбирається як `(x == 1) or 2` і завжди істинне. Правильно: `x in (1, 2)`.

   ```python
   x = 3
   print(bool(x == 1 or 2))   # True
   print(x in (1, 2))         # False
   ```

8. **Очікування, що порівняння різних типів дасть `false`.** `1 < "a"` і `sorted([3, None, 1])` дають `TypeError`. Правильно: привести дані до одного типу або передати `key` у `sorted`.

   ```python
   sorted([3, None, 1])                                        # TypeError
   sorted([3, None, 1], key=lambda v: (v is None, v or 0))     # [1, 3, None]
   ```

## Підсумок

- `==` порівнює значення через `__eq__`, `is` порівнює identity (`id`); `===` немає, бо `==` і так без коерції.
- Різні типи рівні лише серед чисел: `1 == 1.0`, `True == 1`; `1 == "1"` це `False`.
- `is` лише для `None`, sentinel-об'єктів (`object()`) і рідкісного "саме `True`, а не `1`"; `x == None` це помилка стилю й потенційний баг.
- Кеш малих int (-5..256), спільні константи в скрипті й інтернування рядків це деталі CPython; `is` на числах і рядках не використовувати.
- `==` на списках, кортежах, словниках і множинах порівнює вміст рекурсивно; тип контейнера важливий, порядок ключів словника ні.
- Хибні: `None`, `False`, нуль будь-якого числового типу, порожні колекції. `[]` і `{}` хибні, на відміну від JS; `"0"` і `nan` істинні.
- Truthiness об'єкта: `__bool__`, якщо є, інакше `__len__ != 0`, інакше `True`.
- `and` і `or` повертають операнд, як `&&` і `||`; `or` це не `??`, точний аналог `x if x is not None else default`.
- Пріоритет: порівняння, `not`, `and`, `or`; `x == 1 or 2` завжди істинне, правильно `x in (1, 2)`.
- `a < b < c` це `a < b and b < c` з одним обчисленням `b`; порядок між несумісними типами дає `TypeError`.

## Що далі

Наступний урок m1-l04 про рядки: f-рядки, методи й зрізи. Там знадобиться все про `==` і `in` для рядків, а ідіома `if not s.strip():` поєднає truthiness з методами рядка. Далі m1-l05 будує умови й `match` на truthiness і `is None` з цього уроку, а m2-l02 розгортає різницю між `==` і `is` у повну картину змінюваності й копіювання.
