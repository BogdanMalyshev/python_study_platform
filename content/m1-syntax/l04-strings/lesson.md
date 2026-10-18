---
id: m1-l04
module: m1-syntax
title: "Рядки: f-рядки, методи, зрізи"
summary: "Учень форматує вивід через f-рядки й специфікації формату, ріже рядки зрізами, збирає їх через join, знає Python-імена всіх звичних JS-методів з їхніми розбіжностями, розрізняє str і bytes і не наступає на пастки code points і сортування."
duration_min: 75
prerequisites: [m1-l03]
---

## Літерали: лапки, екранування, raw-рядки

Одинарні й подвійні лапки в Python рівнозначні: ні інтерполяції, ні різниці в екрануванні між ними немає, як у JS між `'...'` і `"..."`. Вибирають ті, що не конфліктують із вмістом. Backtick як окремого виду рядка немає зовсім; інтерполяцію дає префікс `f`, про нього наступний розділ. `repr()` показує рядок так, як його треба написати в коді, і сам вибирає лапки.

```python
print('it\'s' == "it's")
print(repr("it's"))
print(repr('say "hi"'))
print(repr("it's \"quoted\""))
```

```text
True
"it's"
'say "hi"'
'it\'s "quoted"'
```

Escape-послідовності (escape sequence, офіційна назва в документації) ті самі, що в JS: `\n`, `\t`, `\\`, `\'`, `\uXXXX`, плюс `\xXX`, `\UXXXXXXXX` для символів з номером понад `FFFF` і `\N{NAME}` за назвою символу з Unicode. Розходження в невідомих послідовностях. JS мовчки викидає зворотну скісну риску, і `"\d"` у JS це просто `"d"`. Python її зберігає, а з 3.12 ще й видає `SyntaxWarning` під час компіляції, бо майже завжди це regex, написаний без `r`.

```python
print("\u0410\x41\N{SNOWMAN}")
pattern = "\d+"
print(pattern)
```

```text
example.py:2: SyntaxWarning: invalid escape sequence '\d'
  pattern = "\d+"
АA☃
\d+
```

Префікс `r` робить raw-рядок (raw string, офіційна назва): зворотна скісна риска в ньому звичайний символ. Це потрібно для regex і Windows-шляхів. У JS для regex є окремий літерал `/\d+/`, тож проблема там не виникає; у Python regex завжди рядок, тому `r"..."` поруч із `re` пишуть за замовчуванням (сам `re` розібраний у m6-l04). Найближчий JS-аналог raw-рядка це тег `String.raw`.

```python live
print(len("\n"), len(r"\n"))
print(r"\d+\.\d+")
print("C:\new\table")
print(r"C:\new\table")
```

```text
1 2
\d+\.\d+
C:
ew	able
C:\new\table
```

> **Пастка.** Raw-рядок не може закінчуватися непарною кількістю зворотних рисок: остання екранує лапку навіть у raw-режимі, і літерал не закривається. Для шляху з рискою в кінці пишуть `"C:\\dir\\"` або склеюють `r"C:\dir" + "\\"`, а для шляхів узагалі беруть `pathlib` (m6-l01).

```python
path = r"C:\dir\"
```

```text
  File "example.py", line 1
    path = r"C:\dir\"
           ^
SyntaxError: unterminated string literal (detected at line 1)
```

Потрійні лапки `"""..."""` або `'''...'''` дають багаторядковий літерал, у якому переноси рядків зберігаються як є. Ними ж пишуть docstring (docstring, офіційний термін з PEP 257): рядок першим виразом у функції, класі чи модулі, який стає документацією. Окремо від цього є склеювання сусідніх літералів (string literal concatenation, офіційна назва): `"a" "b"` компілятор перетворює на `"ab"` ще до виконання. Так розбивають довгий рядок у дужках без `+`.

```python
message = (
    "Field is required. "
    "Fill it in and submit again."
)
print(message)
print("a" "b" 'c')
```

```text
Field is required. Fill it in and submit again.
abc
```

> **Пастка.** Склеювання сусідніх літералів спрацьовує й там, де ви його не хотіли. Забута кома в списку рядків не дає помилки: два елементи мовчки стають одним, і список коротшає.

```python
fields = [
    "email"
    "phone",
    "age",
]
print(fields)
```

```text
['emailphone', 'age']
```

Потрійні лапки всередині функції захоплюють і відступ коду: кожен рядок літерала починається з тих пробілів, якими відступлено тіло функції, а перший і останній рядки порожні. `textwrap.dedent` прибирає спільний для всіх рядків відступ, а `\` одразу після відкривних лапок прибирає перший перенос. Це той самий біль, що з template literal у JS, тільки там для нього потрібна стороння бібліотека.

```python live
import textwrap

def form_html():
    return """
        <form>
          <input name="email">
        </form>
    """

print(repr(form_html()))
print(textwrap.dedent(form_html()).strip())

text = textwrap.dedent("""\
    line one
      indented
    line three
""")
print(repr(text))
```

```text
'\n        <form>\n          <input name="email">\n        </form>\n    '
<form>
  <input name="email">
</form>
'line one\n  indented\nline three\n'
```

## f-рядки: template literals з мовою форматування

f-рядок (f-string, офіційна назва "formatted string literal", коротка форма "f-string" теж у документації) це template literal з префіксом `f` замість backtick. Усередині `{}` стоїть будь-який вираз: доступ до словника, виклик методу, тернарний оператор. Обчислюється він у момент виконання рядка, як `${}` у JS.

```ts
const user = { name: "Bogdan" };
const items = ["email", "phone"];
console.log(`Hi, ${user.name}. ${items.length} fields: ${items.join(", ")}`);
console.log(`total: ${(1234.5).toFixed(2)}`);
```

```python
user = {"name": "Bogdan"}
items = ["email", "phone"]
print(f"Hi, {user['name']}. {len(items)} fields: {', '.join(items)}")
print(f"total: {1234.5:.2f}")
```

```text
Hi, Bogdan. 2 fields: email, phone
total: 1234.50
```

Розходяться дві речі. Перша: f-рядок це звичайні лапки з префіксом, тож якщо префікс забути, ніякої помилки не буде, у виводі просто з'являться фігурні дужки. Backtick у JS такої можливості не залишає. Буквальні `{` і `}` у f-рядку подвоюють. Друга: після виразу можна поставити `:` і специфікацію формату, яка робить роботу `toFixed`, `padStart` і `toLocaleString` усередині самого рядка.

```python
name = "Bogdan"
print("Hi, {name}")
print(f"Hi, {name}")
print(f"{{name}} = {name}")
```

```text
Hi, {name}
Hi, Bogdan
{name} = Bogdan
```

Перед двокрапкою може стояти перетворення (conversion, офіційна назва): `!r` підставляє `repr(value)` замість `str(value)`. Для рядків це означає лапки й видимі `\t`, `\n`, тобто саме те, що потрібно в повідомленні про помилку або в лозі. Суфікс `=` (з 3.8, у документації "self-documenting expressions") друкує сам вираз, знак рівності і значення через `repr`; це `console.log({ value })` для дебагу. `=` поєднується зі специфікацією формату.

```python live
value = "a\tb"
count = 3
print(f"{value}|")
print(f"{value!r}")
print(f"{value=}")
print(f"{count * 2 = }")
print(f"{count=:>5}")
```

```text
a	b|
'a\tb'
value='a\tb'
count * 2 = 6
count=    3
```

Специфікація після двокрапки написана мовою, яку документація називає Format Specification Mini-Language. Загальна форма `[[fill]align][sign][width][,|_][.precision][type]`: заповнювач і вирівнювання (`<` вліво, `>` вправо, `^` по центру), мінімальна ширина, роздільник тисяч, точність і тип (`f` число з фіксованою крапкою, `%` відсоток, `x` шістнадцяткове, `b` двійкове). Ширина тут мінімальна: довше значення не обрізається. Обрізає рядок точність: `{s:.4}`. За замовчуванням рядки вирівнюються вліво, а числа вправо, бо так їх зручно читати в стовпчиках. Ширину можна підставити з іншої змінної вкладеними дужками `{key:<{width}}`.

```python live
price = 1234.5
n = 1234567
print(f"[{price:.2f}]")
print(f"[{n:>10}] [{n:<10}] [{n:^10}]")
print(f"[{'ab':*^8}]")
print(f"[{n:,}] [{n:_}] [{price:,.2f}]")
print(f"[{0.256:.1%}] [{7:03}] [{255:x}] [{255:#b}]")
print(f"[{'ab':5}] [{42:5}]")
print(f"[{'FormBuilder':5}] [{'FormBuilder':.4}]")
width = 8
print(f"[{'id':<{width}}]")
```

```text
[1234.50]
[   1234567] [1234567   ] [ 1234567  ]
[***ab***]
[1,234,567] [1_234_567] [1,234.50]
[25.6%] [007] [ff] [0b11111111]
[ab   ] [   42]
[FormBuilder] [Form]
[id      ]
```

> **Під капотом.** `f"{x:spec}"` викликає `format(x, "spec")`, а та звертається до методу `type(x).__format__`. Методи з подвійними підкресленнями з обох боків документація називає special methods, а спільнота dunder methods (жаргон від "double underscore"); на співбесіді зрозуміють обидва варіанти. Кожен тип сам вирішує, що означає специфікація. Для чисел це mini-language вище, а `datetime` і `date` передають специфікацію в `strftime`, тому `{d:%Y-%m-%d}` працює без жодного виклику методу. Специфікацію, яку тип не розуміє, він відкидає з помилкою.

```python
from datetime import date

d = date(2026, 10, 18)
print(f"{d:%Y-%m-%d}")
print(f"{d:%d.%m.%Y}")
print(format(d, "%Y-%m-%d"))
print(format(1234.5, ",.2f"))
```

```text
2026-10-18
18.10.2026
2026-10-18
1,234.50
```

```python
total = None
print(f"{total:.2f}")
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(f"{total:.2f}")
            ^^^^^^^^^^^
TypeError: unsupported format string passed to NoneType.__format__
```

З Python 3.12 (PEP 701) вираз усередині f-рядка розбирається як звичайний код: можна використовувати ті самі лапки, що й зовні, і зворотну риску. До 3.12 це була синтаксична помилка, тому в старому коді всюди `f"{user['name']}"` з іншими лапками. Платформа курсу і проєкт працюють на 3.12, але бібліотеки, які підтримують старі версії, так ще не пишуть.

```python
user = {"name": "Bogdan"}
print(f"Hello, {user["name"]}")
print(f"{"\n".join(["a", "b"])}")
```

```text
Hello, Bogdan
a
b
```

Той самий перший рядок у Python 3.10:

```text
  File "example.py", line 2
    print(f"Hello, {user["name"]}")
                          ^^^^
SyntaxError: f-string: unmatched '['
```

У чужому коді трапляються ще два способи форматування, і кожен живе з конкретної причини. `str.format` з'явився до f-рядків (3.6), але лишився корисним там, де шаблон це дані, а не код: текст повідомлення лежить у конфігу чи перекладі, і значення підставляються пізніше. f-рядок так не вміє, він обчислюється там, де написаний. `%`-форматування найстаріше, і досі живе в `logging`: `logger.info("saved %s", form_id)` передає шаблон і аргументи окремо, а рядок збирається лише тоді, коли запис справді виводиться (логування в m5-l09).

```python
template = "Field {label} is required"   # прийшло з конфігу, а не з коду
print(template.format(label="Email"))
print(template.format_map({"label": "Phone"}))
print("%s has %d fields" % ("contact", 3))

import logging
logging.basicConfig(format="%(levelname)s %(message)s")
logging.warning("form %s saved", "contact")
```

```text
Field Email is required
Field Phone is required
contact has 3 fields
WARNING form contact saved
```

<!-- task: t1 -->

## Індекси й зрізи

Рядок індексується з нуля, як у JS, але від'ємний індекс працює рідно: `s[-1]` це останній символ, без `at()`. Окремого типу "символ" немає, `s[0]` теж `str` довжиною 1 (детально в m1-l02). Головне розходження в межах: індекс за межами рядка в Python це `IndexError`, а не `undefined` чи порожній рядок.

```ts
const s = "FormBuilder";
s[0];            // "F"
s.at(-1);        // "r"
s[-1];           // undefined
s.charAt(100);   // ""
s.slice(1, 4);   // "orm"
s.slice(-7);     // "Builder"
```

```python
s = "FormBuilder"
print(s[0])
print(s[-1])
print(s[1:4])
print(s[-7:])
```

```text
F
r
orm
Builder
```

`s[1:4]` це зріз (slicing, офіційна назва операції; об'єкт, що її описує, називається slice). Семантика та сама, що в `slice(start, end)` з JS: `start` включно, `stop` виключно, від'ємні межі рахуються з кінця. Відрізняється синтаксис і два доповнення: будь-яку межу можна пропустити, і є третій параметр, крок. `s[::2]` бере кожен другий символ, `s[::-1]` розвертає рядок, на що в JS потрібен ланцюжок `split("").reverse().join("")`.

```python live
s = "FormBuilder"
print(s[:4])
print(s[4:])
print(s[::2])
print(s[::-1])
print(s[1:-1])
print(repr(s[100:]))
print(repr(s[5:2]))
print(s[-100:4])
```

```text
Form
Builder
FrBidr
redliuBmroF
ormBuilde
''
''
Form
```

Останні три рядки показують асиметрію, про яку варто пам'ятати: зріз ніколи не падає, індекс падає. Причина в тому, що вони обіцяють різне. Зріз повертає "усі символи, чиї позиції потрапили в діапазон", і порожня множина позицій це нормальний результат, тож межі просто обрізаються до довжини рядка. Індекс обіцяє рівно один символ, і якщо його немає, повернути нічого. Замість `undefined` Python кидає виняток.

```python
s = "FormBuilder"
print(s[100])
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(s[100])
          ~^^^^^
IndexError: string index out of range
```

> **Пастка.** `-0` це `0`. Вираз `s[-k:]` "останні k символів" працює для будь-якого `k`, крім нуля: `s[-0:]` це `s[0:]`, тобто весь рядок, а не порожній. Якщо `k` може бути нулем, рахуйте позицію від початку: `s[len(s) - k:]`.

```python
phone = "+380501234567"
for k in (4, 0):
    print(repr(phone[-k:]))
print(repr(phone[len(phone) - 0:]))
```

```text
'4567'
'+380501234567'
''
```

`substring` і `substr` з JS окремих аналогів не мають, обидва стають зрізом. `substr(start, length)` (deprecated у JS) це `s[start:start + length]`. `substring(a, b)` міняє аргументи місцями, якщо `a > b`, і обрізає від'ємні до нуля; зріз так не робить, `s[4:0]` порожній. Зріз можна зберегти в змінну як об'єкт `slice(0, 4)`, але в коді це рідкість. Зрізи списків і кортежів, присвоєння в зріз і розпакування розібрані в m2-l03.

```python
s = "FormBuilder"
start, length = 4, 3
print(s[start:start + length])   # substr(4, 3)
print(repr(s[4:0]))              # substring(4, 0) дав би "Form"
print(s[0:4])
print(s[slice(0, 4)])
```

```text
Bui
''
Form
Form
```

<!-- task: q1 -->

<!-- task: t2 -->

## Незмінність: кожен метод повертає новий рядок

`str` незмінний (immutable, офіційний термін): після створення його вміст не змінюється. У JS рядки теж незмінні, але присвоєння `s[0] = "N"` у нестрогому режимі мовчки ігнорується, і помилку дає лише strict mode. У Python спроба завжди голосна.

```python
s = "Form"
s[0] = "N"
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    s[0] = "N"
    ~^^^
TypeError: 'str' object does not support item assignment
```

Наслідок той самий, що в JS: кожен метод повертає новий рядок, а оригінал лишається як був. Виклик `s.upper()` без присвоєння нічого не робить. "Замінити символ" означає зібрати новий рядок зі зрізів або через `replace`. А `s += "!"` не дописує в рядок, а створює новий об'єкт і перев'язує на нього ім'я `s`; інше ім'я, яке дивилося на старий рядок, бачить старе значення.

```python live
s = "Form"
s.upper()
print(s)
s = s.upper()
print(s)
print("N" + s[1:])
print(s.replace("F", "N"))

alias = s
s += "!"
print(alias, s, alias is s)
```

```text
Form
FORM
NORM
NORM
FORM FORM! False
```

Звідси правило збирання рядка в циклі: частини складають у список і склеюють одним `"".join(parts)` наприкінці. Теоретично кожне `s += part` копіює весь накопичений рядок, і цикл стає квадратичним. На практиці CPython має оптимізацію: якщо на рядок зліва є рівно одне посилання, інтерпретатор розширює його на місці замість копіювання, і `+=` у простому циклі працює майже лінійно. Але оптимізація крихка: варто з'явитися другому посиланню на той самий рядок, і вона вимикається.

```python
from time import perf_counter

N = 200_000

def plus_equals():
    s = ""
    for _ in range(N):
        s += "x"
    return s

def plus_equals_with_alias():
    s = ""
    for _ in range(N):
        keep = s          # друге посилання на той самий рядок
        s += "x"
    return s

def with_join():
    parts = []
    for _ in range(N):
        parts.append("x")
    return "".join(parts)

for fn in (plus_equals, plus_equals_with_alias, with_join):
    start = perf_counter()
    result = fn()
    print(f"{fn.__name__:<24}{len(result):>8}{perf_counter() - start:>8.3f} s")
```

```text
plus_equals               200000   0.009 s
plus_equals_with_alias    200000   0.800 s
with_join                 200000   0.006 s
```

Час з одного запуску на ноутбуці автора; абсолютні числа у вас будуть інші, а порядок той самий: друге посилання робить `+=` у десятки разів повільнішим. Тому `+=` у циклі не катастрофа в CPython, але `join` ідіоматичний: він не залежить від деталей реалізації (у PyPy цієї оптимізації немає, а документація прямо рекомендує `join`), він рахує підсумкову довжину один раз, і він виражає намір "склеїти частини через роздільник" без ручної боротьби з зайвою комою в кінці. У JS це та сама ідіома `parts.push(...)` і `parts.join("")`.

> **Під капотом.** Оптимізація живе в обробнику `+=` для `str` і спирається на лічильник посилань (reference count, офіційний термін з документації C API) CPython: якщо рядок нікому, крім цієї змінної, не потрібен, його буфер можна збільшити через `realloc`, і ніхто не помітить порушення незмінності. Будь-яке друге посилання, будь то змінна, елемент списку чи аргумент функції, яка ще працює, робить таке "тихе мутування" небезпечним, і інтерпретатор повертається до чесного копіювання.

## `split` і `join`: розібрати й склеїти

`join` у Python це метод роздільника, а не масиву: `", ".join(items)`. Порядок незвичний, але причина практична. Склеювати можна будь-який iterable (iterable, офіційний термін: усе, що можна обійти `for`, детально в m1-l06) з рядків: список, кортеж, ключі словника, сам рядок, генератор. Якби `join` був методом колекції, його довелося б реалізувати в кожному типі окремо; у JS `join` є лише в `Array`, і все інше спершу перетворюють у масив.

```ts
"a,b,,c".split(",");        // ["a", "b", "", "c"]
" a  b ".split(" ");        // ["", "a", "", "b", ""]
"a-b-c-d".split("-", 2);    // ["a", "b"]
"abc".split("");            // ["a", "b", "c"]
["a", "b"].join(", ");      // "a, b"
```

```python
print("a,b,,c".split(","))
print(" a  b ".split())
print("a-b-c-d".split("-", 2))
print(list("abc"))
print(", ".join(["a", "b"]))
```

```text
['a', 'b', '', 'c']
['a', 'b']
['a', 'b', 'c-d']
['a', 'b', 'c']
a, b
```

Розходжень три. `split()` без аргументу це окремий режим, якого в JS немає (найближче `s.trim().split(/\s+/)`). Другий аргумент `maxsplit` обмежує кількість розрізів, а не довжину результату: залишок лишається цілим в останньому елементі, тоді як `limit` у JS просто відкидає хвіст. І порожній роздільник у Python заборонений, рядок на символи розбирає `list(s)`.

```python
print("x".split(""))
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print("x".split(""))
          ^^^^^^^^^^^^^
ValueError: empty separator
```

Чому `"a,b,,c".split(",")` і `"a  b".split()` поводяться по-різному: це два різні завдання. З явним роздільником кожне входження це межа поля, тому два роздільники поспіль дають порожнє поле, а порожній рядок дає один порожній елемент; так розбирають CSV-подібні формати, де порожнє поле щось означає. Без аргументу задача "розбити на слова": будь-яка послідовність пробілів, табів і переносів вважається одним роздільником, краї обрізаються, порожніх елементів не буває. Тому `"".split()` це `[]`, а `"".split(",")` це `[""]`.

```python live
print("a,b,,c".split(","))
print("  a  b\t\nc  ".split())
print("  a  b ".split(" "))
print("".split(","), "".split())
print("a=b=c".split("=", 1), "a=b=c".rsplit("=", 1))
```

```text
['a', 'b', '', 'c']
['a', 'b', 'c']
['', '', 'a', '', 'b', '']
[''] []
['a', 'b=c'] ['a=b', 'c']
```

`join` приймає лише рядки, числа треба перетворити явно; коерції, як у JS-шному `[1, 2].join(",")`, немає. Перетворюють через `map(str, items)` або генераторний вираз (generator expression, офіційна назва) `str(i) for i in items`, синтаксис якого розібраний у m1-l10. Рядок і словник теж iterable, тому `"-".join("abc")` склеює символи, а `join` по словнику склеює ключі.

```python
ids = [1, 2, 3]
print(",".join(ids))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(",".join(ids))
          ^^^^^^^^^^^^^
TypeError: sequence item 0: expected str instance, int found
```

```python
ids = [1, 2, 3]
print(",".join(map(str, ids)))
print(",".join(str(i) for i in ids))
print("-".join("abc"))
print(", ".join({"email": 1, "phone": 2}))
```

```text
1,2,3
1,2,3
a-b-c
email, phone
```

`partition(sep)` ділить по першому входженню і завжди повертає кортеж із трьох елементів: до, сам роздільник, після. Якщо роздільника немає, винятку не буде, середній елемент просто порожній. Для пар "ключ=значення" це надійніше, ніж `split("=")`, бо значення, що містить `=`, лишається цілим, а відсутність `=` не ламає розпакування. `rpartition` робить те саме з правого краю, наприклад відрізає розширення файлу.

```python
print("token=a=b".partition("="))
print("flag".partition("="))
print("report.final.csv".rpartition("."))
key, _, value = "lang = uk".partition("=")
print(repr(key.strip()), repr(value.strip()))
```

```text
('token', '=', 'a=b')
('flag', '', '')
('report.final', '.', 'csv')
'lang' 'uk'
```

Багаторядковий текст розбирають через `splitlines()`, а не `split("\n")`. `splitlines` розуміє `\n`, `\r\n` і `\r`, і не створює порожнього елемента після завершального переносу. `split("\n")` залишить `\r` у кінці рядків з Windows-файлу і порожній рядок наприкінці. Назад склеюють `"\n".join(lines)`.

```python live
text = "a\nb\r\nc\n"
print(text.splitlines())
print(text.split("\n"))
print("\n".join(["first", "second"]))
```

```text
['a', 'b', 'c']
['a', 'b\r', 'c', '']
first
second
```

<!-- task: q2 -->

<!-- task: t3 -->

## Пошук, перевірки, регістр і вирівнювання

Більшість методів з `String.prototype` мають прямий відповідник, але з іншим ім'ям, а кілька поводяться інакше за тієї самої назви. Нижче той самий набір операцій обома мовами.

```ts
const s = "form-builder";
s.includes("build");          // true
s.indexOf("build");           // 5
s.startsWith("form");         // true
"  x  ".trim();               // "x"
"a-b-a".replace("a", "x");    // "x-b-a"
"a-b-a".replaceAll("a", "x"); // "x-b-x"
"7".padStart(3, "0");         // "007"
"ab".padEnd(5, ".");          // "ab..."
"ab".repeat(3);               // "ababab"
```

```python
s = "form-builder"
print("build" in s)
print(s.find("build"))
print(s.startswith("form"))
print(repr("  x  ".strip()))
print("a-b-a".replace("a", "x", 1))
print("a-b-a".replace("a", "x"))
print("7".zfill(3), "7".rjust(3, "0"), "-7".zfill(4))
print("ab".ljust(5, "."))
print("ab".center(8, "*"))
print("ab" * 3)
```

```text
True
5
True
'x'
x-b-a
x-b-x
007 007 -007
ab...
***ab***
ababab
```

Головне розходження в `replace`: у Python він замінює всі входження, тобто працює як `replaceAll`, а обмеження задає третій аргумент `count`. `includes` перетворився на оператор `in`, який для рядка шукає підрядок. `trim` став `strip`, `padStart` і `padEnd` стали `rjust` і `ljust` (заповнювач лише з одного символу), `repeat` став множенням на число, а `center` аналога в JS не має. Для чисел із нулями попереду є `zfill`, який, на відміну від `rjust`, правильно ставить знак: `"-7".zfill(4)` дає `-007`.

Пошук підрядка дає чотири інструменти з різною реакцією на відсутність. `in` повертає `bool` і потрібен у дев'яти випадках з десяти. `find` повертає позицію або `-1`, як `indexOf`. `index` повертає позицію або кидає `ValueError`; це краще, коли відсутність означає помилку в даних і має зупинити виконання. `count` рахує входження без перекриття. `rfind` і `rindex` шукають справа. Для шаблонів, а не фіксованих підрядків, потрібен `re` (m6-l04).

```python live
t = "form-builder"
print("build" in t, "zzz" in t)
print(t.find("build"), t.find("zzz"), t.rfind("r"))
print(t.index("build"))
print(t.count("-"), "aaaa".count("aa"))
```

```text
True False
5 -1 11
5
1 2
```

```python
t = "form-builder"
print(t.index("zzz"))
```

```text
Traceback (most recent call last):
  File "example.py", line 2, in <module>
    print(t.index("zzz"))
          ^^^^^^^^^^^^^^
ValueError: substring not found
```

> **Пастка.** Результат `find` не можна використовувати як умову. Збіг на початку рядка дає `0`, а це хибне значення, тоді як "не знайдено" дає `-1`, а будь-яке ненульове число істинне (truthiness розібрана в m1-l03). Умова вийде рівно навпаки. Для перевірки наявності є `in`.

```python
t = "form-builder"
if t.find("form"):
    print("found")
else:
    print("not found?")
print("form" in t)
```

```text
not found?
True
```

`startswith` і `endswith` приймають кортеж варіантів і перевіряють, чи підходить хоч один; у JS для цього пишуть `some`. Другий аргумент задає позицію, з якої перевіряти. А от аргумент `strip`, `lstrip` і `rstrip` це не префікс, а набір символів: метод знімає з краю будь-які символи з цього набору, скільки б їх не було. Для `"--==title==--".strip("-=")` це саме те, що потрібно. Для відрізання точного префікса чи суфікса є `removeprefix` і `removesuffix` (з 3.9); якщо префікса немає, рядок повертається без змін.

```python live
print("form.py".endswith((".py", ".pyi")), "form-builder".startswith("build", 5))
print("--==title==--".strip("-="))
print("https://shop.com".lstrip("https://"))
print("https://shop.com".removeprefix("https://"))
print("report.csv".removesuffix(".csv"), "report".removesuffix(".csv"))
```

```text
True True
title
op.com
shop.com
report report
```

Регістр: `upper`, `lower`, `title` (кожне слово з великої), `capitalize` (лише перша літера рядка), `swapcase`. `title` вважає межею слова будь-який не-літерний символ, тому апостроф ламає результат; для імен і заголовків з апострофами він не підходить. Для порівняння без урахування регістру правильний метод `casefold` (casefolding, офіційний термін з Unicode, і назва методу та сама). Він агресивніший за `lower`: німецьке `ß` у верхньому регістрі `SS`, і лише `casefold` зводить обидва написання до одного.

```python
print("hello WORLD".upper(), "hello WORLD".lower(), "hello".capitalize())
print("they're bill's".title())
print("Straße".lower(), "Straße".casefold())
print("STRASSE".lower() == "Straße".lower())
print("STRASSE".casefold() == "Straße".casefold())
```

```text
HELLO WORLD hello world Hello
They'Re Bill'S
straße strasse
False
True
```

Предикати `isdigit`, `isalpha`, `isalnum`, `isspace` перевіряють, що рядок непорожній і всі його символи з певної категорії Unicode. Вони знають Unicode, тому `"Київ".isalpha()` істинне. Через це ж `isdigit` не валідатор чисел: `"²"` (верхній індекс) для нього цифра, а `"-42"` і `"4.2"` ні. Число перевіряють спробою перетворення `int(value)` з обробкою `ValueError` (винятки в m1-l11). `isdecimal` суворіший і пропускає лише десяткові цифри.

```python live
print("42".isdigit(), "-42".isdigit(), "4.2".isdigit(), "".isdigit())
print("²".isdigit(), "²".isdecimal())
print("abc".isalpha(), "Київ".isalpha(), "a1".isalnum(), " \t".isspace())
```

```text
True False False False
True False
True True True True
```

<!-- task: q3 -->

## Символи, code points і `bytes`

Рядок в Python це послідовність code points (code point, термін зі стандарту Unicode, яким користується й документація Python: номер символу в таблиці Unicode). `for ch in s` віддає їх по одному як рядки довжиною 1, `ord(ch)` дає номер, `chr(n)` робить навпаки; це `codePointAt` і `String.fromCodePoint` з JS. Індекс разом із символом дає `enumerate` (розібраний у m1-l06).

```python live
for ch in "ok?":
    print(ch, ord(ch))
for i, ch in enumerate("ab"):
    print(i, ch)
print(ord("К"), chr(1050), hex(ord("ї")))
print(list("Київ"))
```

```text
o 111
k 107
? 63
0 a
1 b
1050 К 0x457
['К', 'и', 'ї', 'в']
```

`len` рахує code points. У JS `.length` рахує одиниці UTF-16, тому символ поза Basic Multilingual Plane (BMP, термін стандарту Unicode: перші 65 536 code points; поза нею емодзі, музичні й математичні знаки) має там довжину 2, а індекс може потрапити в половину сурогатної пари (surrogate pair, теж термін Unicode).

```ts
"𝄞".length;              // 2
[..."𝄞"].length;         // 1
"𝄞".codePointAt(0);      // 119070
```

```python
print(len("𝄞"))
print(ord("𝄞"))
print(len("𝄞".encode("utf-16-le")) // 2)
```

```text
1
119070
2
```

Python тут чесніший: індекс і зріз ніколи не розрізають символ навпіл, і `len` збігається зі спредом `[...s].length` з JS. Але code point ще не той символ, який бачить користувач. `é` можна записати одним code point `U+00E9` (форма нормалізації NFC) або двома: `e` і комбінований наголос `U+0301` (форма NFD, так, наприклад, macOS зберігає імена файлів). На екрані однаково, а `len` дає 1 і 2, і `==` повертає `False`. Тому рядки від користувача перед порівнянням нормалізують через `unicodedata.normalize("NFC", s)`.

```python
import unicodedata

nfc = "\u00e9"
nfd = "e\u0301"
print(nfc, nfd, len(nfc), len(nfd), nfc == nfd)
print(unicodedata.normalize("NFC", nfd) == nfc)
print([unicodedata.name(c) for c in nfd])
```

```text
é é 1 2 False
True
['LATIN SMALL LETTER E', 'COMBINING ACUTE ACCENT']
```

`str` це текст, а `bytes` це незмінна послідовність чисел від 0 до 255; між ними стоїть кодування. `s.encode()` перетворює текст на байти, `b.decode()` назад, і за замовчуванням обидва використовують UTF-8. Літерал `b"..."` допускає лише ASCII, решту записують через `\x`. Індекс у `bytes` дає число, а не однобайтовий рядок. У JS цю роль грають `Uint8Array` і `Buffer`, а `TextEncoder` і `TextDecoder` роблять `encode` і `decode`.

```python live
data = "Київ".encode()
print(data, type(data))
print(len("Київ"), len(data))
print(data.decode("utf-8"))
print(b"abc"[0], list(b"ab"))
```

```text
b'\xd0\x9a\xd0\xb8\xd1\x97\xd0\xb2' <class 'bytes'>
4 8
Київ
97 [97, 98]
```

Python не змішує `str` і `bytes` неявно. Node перетворить `Buffer` на рядок при `+` через `toString()`, а тут `b"..." + "..."` це `TypeError`. Порівняння не падає, а просто дає `False`, і саме тому це пастка: `b"abc" == "abc"` мовчки хибне. `str(b"abc")` повертає не `"abc"`, а `"b'abc'"`, і цей рядок легко потрапляє в лог чи в HTML. Битий UTF-8 дає `UnicodeDecodeError`, а не символ-заміну, якщо не попросити `errors="replace"`.

```python
print(b"abc" == "abc")
print(str(b"abc"))
print(b"\xd0\x9a\xd0".decode("utf-8", errors="replace"))
print(b"id=" + "42")
```

```text
False
b'abc'
К�
Traceback (most recent call last):
  File "example.py", line 4, in <module>
    print(b"id=" + "42")
          ~~~~~~~^~~~~~
TypeError: can't concat str to bytes
```

Зустрінете `bytes` там, де дані перетинають межу процесу: файли, відкриті в режимі `"rb"`, сокети й HTTP-тіла (`response.content` проти `response.text` у httpx), stdout з `subprocess` без `text=True`, `hashlib` і `base64`. Правило, яке спільнота називає "Unicode sandwich" (жаргон, не офіційний термін): декодувати на вході, всередині програми працювати лише зі `str`, кодувати на виході. Кодування файлів, `errors=`, BOM і `open(encoding=...)` детально в m6-l01.

<!-- task: t4 -->

## Порівняння й сортування

Рядки порівнюються лексикографічно по code points: береться перша позиція, де символи різняться, і менший той рядок, у якого там менший `ord`. Якщо один рядок є префіксом іншого, коротший менший. Звідси `"Z" < "a"` (90 проти 97) і `"10" < "9"` (порівнюються `"1"` і `"9"`, а не числа). JS порівнює так само, тільки по одиницях UTF-16, що для звичайного тексту дає той самий порядок.

```python live
print("Z" < "a", ord("Z"), ord("a"))
print("10" < "9", "abc" < "abd", "ab" < "abc", "" < "a")
print(sorted(["b", "B", "a", "10", "9"]))
```

```text
True 90 97
True True True True
['10', '9', 'B', 'a', 'b']
```

```ts
const words = ["banana", "Apple", "cherry", "apple", "Banana"];
[...words].sort();
[...words].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
```

```python
words = ["banana", "Apple", "cherry", "apple", "Banana"]
print(sorted(words))
print(sorted(words, key=str.lower))
print(min(words, key=str.casefold))
print(words)
```

```text
['Apple', 'Banana', 'apple', 'banana', 'cherry']
['Apple', 'apple', 'banana', 'Banana', 'cherry']
Apple
['banana', 'Apple', 'cherry', 'apple', 'Banana']
```

Тут розходиться модель. JS `sort` приймає компаратор від двох аргументів і мутує масив. `sorted` повертає новий список (а `list.sort()` сортує на місці) і приймає не компаратор, а функцію ключа (key function, офіційна назва з Sorting HOWTO): вона викликається один раз на елемент, і далі порівнюються ключі. `key=str.lower` означає "порівнюй так, ніби все в нижньому регістрі", а сам елемент у результаті лишається як був. Сортування стабільне, тому `banana` і `Banana` з однаковим ключем стоять у тому порядку, в якому були у вхідному списку. Детально `sorted(key=)`, `reverse` і складені ключі в m1-l10.

Для порівняння без урахування регістру, і в `==`, і як ключ сортування, правильніший `casefold`, а не `lower`, з причини з попереднього розділу: `lower` не зводить `ß` і `SS`. Для англійських ідентифікаторів різниці немає, для довільного тексту від користувача є.

> **Пастка.** Порядок code points не алфавітний для української. `і`, `ї`, `є` і `ґ` у таблиці Unicode стоять поза діапазоном `а`–`я`, тому опиняються після `я`, а велика `І` (U+0406) стоїть навіть перед `А` (U+0410). JS-ний `localeCompare` чи `Intl.Collator("uk")` враховує мову; у стандартній бібліотеці Python є лише `locale.strxfrm`, результат якого залежить від локалі системи. Для правильного алфавіту в бекенді беруть ICU (пакет PyICU) або сортують у базі даних з колацією.

```python
print(sorted(["ґанок", "яблуко", "їжак", "абрикос", "Ірина", "іній"]))
```

```text
['Ірина', 'абрикос', 'яблуко', 'іній', 'їжак', 'ґанок']
```

Порівняння рядка з числом, на відміну від JS, не перетворює типи: `"10" < 9` це `TypeError`, і сортування списку з рядками й числами впаде (детально в m1-l03).

```python
print("10" < 9)
```

```text
Traceback (most recent call last):
  File "example.py", line 1, in <module>
    print("10" < 9)
          ^^^^^^^^
TypeError: '<' not supported between instances of 'str' and 'int'
```

<!-- task: q4 -->

<!-- task: t5 -->

## Для капстоуну

У бекенді FormBuilder рядки з'являються в трьох місцях: ідентифікатори полів, повідомлення про помилки валідації і згенерована статика. `id` поля часто виводять з підпису, тому функція на кшталт `slugify` з завдання t4 стане частиною моделі конфігу. Повідомлення про помилки пишуть через `!r`, щоб порожній рядок і рядок з пробілами було видно: `''` і `' '` в лозі розрізняються, а без лапок ні. Шаблони повідомлень, які лежать у JSON-конфігу, заповнюють `format_map`, а не f-рядком, бо шаблон це дані.

```python
config = {"messages": {"required": "Field {label} is required", "max_length": "{label}: at most {limit} characters"}}
field = {"id": "email", "label": "E-mail", "limit": 64}
value = " "

print(f"field {field['id']!r}: value {value!r} is blank")
print(config["messages"]["required"].format_map(field))
print(config["messages"]["max_length"].format_map(field))
```

```text
field 'email': value ' ' is blank
Field E-mail is required
E-mail: at most 64 characters
```

> **Для капстоуну.** `str.format` уміє ходити по атрибутах: шаблон `"{label.__class__}"` повертає `<class 'str'>`. Шаблони з конфігу, який редагує адміністратор, це прийнятно; шаблони, які може задати кінцевий користувач, не можна пропускати через `format`, для них є `string.Template` з простою підстановкою `$name`. І коли статика збирається f-рядками, кожне значення від користувача проходить через `html.escape`, інакше `<script>` у підписі поля потрапить на сторінку як є. У модулі 7 цю роботу забирає Jinja2 з автоекрануванням (m7-l06).

```python
import html
from string import Template

label = '<script>alert(1)</script>'
print(f"<label>{html.escape(label)}</label>")
print(Template("Field $label is required").substitute(label="Email"))
print("{label.__class__}".format(label="Email"))
```

```text
<label>&lt;script&gt;alert(1)&lt;/script&gt;</label>
Field Email is required
<class 'str'>
```

## Типові помилки JS-розробника

1. **`s.length` замість `len(s)`.** Довжина в Python це вбудована функція, а не властивість, і для будь-якої колекції вона та сама. Правильно: `len(s)`.

   ```python
   s = "abc"
   s.length   # AttributeError: 'str' object has no attribute 'length'
   len(s)     # 3
   ```

2. **`arr.join(",")` замість `",".join(arr)`.** У списку немає `join`; це метод роздільника, і всі елементи мають бути рядками. Правильно: `",".join(map(str, items))`.

   ```python
   ["a", "b"].join(",")   # AttributeError: 'list' object has no attribute 'join'
   ",".join(["a", "b"])   # 'a,b'
   ",".join([1, 2])       # TypeError: sequence item 0: expected str instance, int found
   ```

3. **`s.includes(x)` або `if s.find(x):` для перевірки наявності.** `includes` не існує, а `find` повертає `0` для збігу на початку, і умова хибна. Правильно: оператор `in`.

   ```python
   "form-builder".find("form")   # 0, у if це False
   "form" in "form-builder"      # True
   ```

4. **`+=` для збирання рядка в циклі.** Працює швидко лише завдяки оптимізації CPython, яка зникає при другому посиланні на рядок. Правильно: збирати частини в список і склеїти один раз.

   ```python
   parts = []
   for field in ["email", "phone"]:
       parts.append(f"<input name={field!r}>")
   markup = "\n".join(parts)
   ```

5. **`substr`, `substring`, `padStart`.** Їх немає. Правильно: зріз `s[start:start + length]`, `rjust` або `zfill`, або специфікація формату.

   ```python
   s = "FormBuilder"
   s[4:4 + 3]          # 'Bui'
   "7".rjust(3, "0")   # '007'
   f"{7:03}"           # '007'
   ```

6. **`split` з лімітом як у JS і `split("")`.** `maxsplit` обмежує кількість розрізів, залишок не відкидається; порожній роздільник це `ValueError`. Правильно: брати потрібні елементи зрізом і розбирати на символи через `list(s)`.

   ```python
   "a-b-c-d".split("-", 2)       # ['a', 'b', 'c-d'], а не ['a', 'b']
   "a-b-c-d".split("-")[:2]      # ['a', 'b']
   list("abc")                   # ['a', 'b', 'c']
   ```

7. **`strip("https://")` як відрізання префікса.** Аргумент `strip` це набір символів, а не підрядок. Правильно: `removeprefix` і `removesuffix`.

   ```python
   "https://shop.com".lstrip("https://")        # 'op.com'
   "https://shop.com".removeprefix("https://")  # 'shop.com'
   ```

## Підсумок

- `'...'` і `"..."` рівнозначні, `"""..."""` багаторядковий, `r"..."` для regex і шляхів; сусідні літерали склеюються, і забута кома в списку рядків стає склеюванням.
- f-рядок це template literal з `f`; `!r` для `repr`, `=` для дебагу, після `:` специфікація формату (`.2f`, `>10`, `,`, `%Y-%m-%d`), яку інтерпретує `__format__` типу.
- `str.format` потрібен, коли шаблон це дані; `%` живе в `logging`.
- Від'ємний індекс рідний; індекс за межами дає `IndexError`, зріз ніколи не падає; `s[-0:]` це весь рядок.
- Рядок незмінний: методи повертають новий рядок, присвоєння в індекс це `TypeError`; збирати через список і `"".join`.
- `join` це метод роздільника і приймає будь-який iterable з рядків; `split()` без аргументу ділить по пробілах без порожніх елементів, `split(sep)` зберігає порожні поля, `maxsplit` не відкидає залишок.
- `in` замість `includes`, `find` повертає `-1`, `index` кидає; `replace` замінює всі входження; `strip(chars)` знімає набір символів, префікс знімає `removeprefix`.
- `len` рахує code points, а не одиниці UTF-16; перед порівнянням тексту від користувача потрібна нормалізація NFC.
- `str` і `bytes` неявно не змішуються: `encode` і `decode` на межі програми, UTF-8 за замовчуванням.
- Порівняння і `sorted` йдуть по code points: `"Z" < "a"`, `"10" < "9"`; без урахування регістру через `key=str.casefold`; український алфавіт потребує ICU.

## Що далі

Наступний урок m1-l05 про умови й `match`: там порівняння рядків, `in` і `startswith` з цього уроку стають умовами, а `match` по рядкових літералах замінює `switch` по рядку. Пізніше зрізи повертаються в m2-l03 уже для списків, `bytes` і кодування в m6-l01, а `re` для пошуку за шаблоном у m6-l04.
