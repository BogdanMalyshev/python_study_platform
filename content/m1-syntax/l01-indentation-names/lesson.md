---
id: m1-l01
module: m1-syntax
title: "Відступи, імена й порядок визначень"
summary: "Учень пише Python-код правильної форми: блоки через двокрапку й відступ, переноси всередині дужок, імена за PEP 8, присвоєння як прив'язку імені до об'єкта, оператори без JS-звичок, і розуміє, що модуль виконується зверху вниз без hoisting."
duration_min: 60
prerequisites: [m0-l06]
---

## Відступ це синтаксис, а не форматування

У JS блок визначають фігурні дужки, а відступи розставляє Prettier для людей. У Python дужок для блоків немає, і відступ це єдине, що каже інтерпретатору, де блок починається і де закінчується. Заголовок складеної інструкції (compound statement, офіційний термін з документації) закінчується двокрапкою, а тіло йде наступними рядками з більшим відступом. Двокрапка відкриває блок після `if`, `elif`, `else`, `for`, `while`, `def`, `class`, `with`, `try`, `except`, `finally`, `match` і `case`. Дужки навколо умови не потрібні: межу умови задає саме двокрапка.

```ts
function check(value: unknown): string {
  if (value) {
    return "ok";
  }
  return "empty";
}
```

```python
def check(value: object) -> str:
    if value:
        return "ok"
    return "empty"


print(check(1), check(0))
```

```text
ok empty
```

Розходиться не лише запис. У TS можна зламати відступи як завгодно, і код працюватиме так само, бо структуру тримають дужки. У Python той самий `return "empty"`, зсунутий на чотири пробіли вправо, опиняється всередині `if` після `return "ok"`, тобто стає недосяжним. Функція для `0` тоді не доходить до жодного `return` і повертає `None`. Жодної помилки при цьому немає: відступ несе семантику так само, як дужки в TS, і помилковий відступ це інша, але валідна програма.

```python
def check(value):
    if value:
        return "ok"
        return "empty"


print(check(0))
```

```text
None
```

> **Під капотом.** Перед парсингом токенізатор (tokenizer, так він називається й у документації CPython) перетворює відступи на явні токени. Коли рядок має більший відступ, ніж попередній, з'являється токен `INDENT`; коли менший, по одному `DEDENT` на кожен закритий рівень. Для граматики це ті самі `{` і `}`, тільки згенеровані з пробілів. Токенізатор тримає стек рівнів відступу, і `DEDENT` дозволений лише на рівень, який уже є в стеку. Модуль `tokenize` зі стандартної бібліотеки показує ці токени напряму: нижче рядок 4 закриває один рівень, кінець файлу закриває останній.

```python live
import io
import tokenize

source = """\
def check(value):
    if value:
        return "ok"
    return "empty"
"""

for tok in tokenize.generate_tokens(io.StringIO(source).readline):
    if tok.type in (tokenize.INDENT, tokenize.DEDENT, tokenize.NEWLINE):
        print(tok.start[0], tokenize.tok_name[tok.type], repr(tok.string))
```

```text
1 NEWLINE '\n'
2 INDENT '    '
2 NEWLINE '\n'
3 INDENT '        '
3 NEWLINE '\n'
4 DEDENT ''
4 NEWLINE '\n'
5 DEDENT ''
```

Зі стеку виростають три помилки відступу, і всі три це `IndentationError`, підклас `SyntaxError`. Важливо, коли вони виникають: на етапі компіляції файлу, до виконання першого рядка. Нижче `print("start")` стоїть першим, але не друкує нічого, бо файл не скомпілювався. Відступ `return "empty"` (6 пробілів) не збігається ні з 4, ні з 0, які є в стеку.

```python
print("start")


def check(value):
    if value:
        return "ok"
      return "empty"
```

```text
  File "main.py", line 7
    return "empty"
                  ^
IndentationError: unindent does not match any outer indentation level
```

Дві інші: зайвий відступ там, де блок не відкривався, і відсутній відступ після двокрапки. Друге повідомлення в 3.12 прямо називає рядок, який відкрив блок.

```python
x = 1
    y = 2
```

```text
  File "main.py", line 2
    y = 2
IndentationError: unexpected indent
```

```python
def check(value):
return value
```

```text
  File "main.py", line 2
    return value
    ^^^^^^
IndentationError: expected an indented block after function definition on line 1
```

Таби й пробіли. Python приймає і ті, і ті, але не змішування в одному блоці, при якому структура залежала б від ширини таба. Токенізатор порівнює відступи двічі, з шириною таба 8 і 1, і якщо порядок рівнів не збігається, кидає `TabError`. У прикладі рядок 3 починається з символу табуляції, а решта з пробілів.

```python
def check(value):
    if value:
	return "ok"
    return "empty"
```

```text
  File "main.py", line 3
    return "ok"
TabError: inconsistent use of tabs and spaces in indentation
```

Стандарт 4 пробіли з PEP 8 (Python Enhancement Proposal 8, офіційний style guide мови). Мова вимагає лише послідовності в межах блоку: два пробіли працюють, і навіть різна глибина в різних блоках того самого файлу. Чотири стали стандартом, бо PEP 8 так сказав у 2001 році, і стандартна бібліотека, `ruff format` та редактори з Python-плагіном роблять саме так. Тіло з однієї інструкції можна записати в тому самому рядку після двокрапки, але PEP 8 це не рекомендує.

```python
def check(value):
  if value:
          return "ok"
  return "empty"


ready = True
if ready: print("go")
print(check(1), check(0))
```

```text
go
ok empty
```

### Порожній блок: `pass`, `...` і docstring

Блок не може бути порожнім, а коментар не рахується за тіло, бо токенізатор коментарі викидає. Там, де в JS стоїть `{}`, у Python потрібна хоч одна інструкція.

```python
def todo():
    # TODO: implement

print("after")
```

```text
  File "main.py", line 4
    print("after")
    ^^^^^
IndentationError: expected an indented block after function definition on line 1
```

Заповнювачів три, і різниця між ними в намірі. `pass` це інструкція "нічого не робити", яка існує лише заради синтаксису: порожній клас-маркер, гілка, яку свідомо пропускають. `...` це літерал об'єкта `Ellipsis` (офіційна назва), звичайний вираз, який обчислюється й викидається; за конвенцією він означає "тіло не важливе або ще не написане": заглушки, методи в `Protocol` (m2-l07), stub-файли `.pyi` (stub files, офіційний термін з документації typing: файли лише із сигнатурами). Третій варіант: тіло з одного docstring, про який нижче, теж валідний блок. Функція з будь-яким із трьох тіл повертає `None`.

```python live
def todo():
    pass


def stub() -> int: ...


def documented():
    """Body is only a docstring, and that is a valid block."""


class Draft:
    pass


print(todo(), stub(), documented())
print(...)
print(type(...))
print(... is Ellipsis)
```

```text
None None None
Ellipsis
<class 'ellipsis'>
True
```

## Кінець рядка, переноси й коментарі

Інструкція закінчується разом із рядком. Крапка з комою в мові існує, але лише як роздільник кількох інструкцій в одному рядку; в кінці рядка вона нічого не робить, і лінтер позначає її як зайву (правило E703 у ruff). Код нижче працює, але так не пишуть.

```python
x = 1; y = 2; print(x + y);
```

```text
3
```

Логічний рядок продовжується на наступний фізичний у двох випадках. Неявне продовження: всередині незакритих `()`, `[]` або `{}` перенос можна ставити будь-де, і відступ продовження не має значення. Явне продовження: зворотний слеш останнім символом рядка. PEP 8 радить дужки, бо слеш крихкий: пробіл після нього, невидимий в редакторі, ламає синтаксис. Сусідні рядкові літерали в дужках склеюються в один рядок ще на етапі компіляції (детально в m1-l04).

```python live
total = (1
         + 2
         + 3)
fields = [
    "email",
    "phone",
]
is_ready = total > 5 and \
    len(fields) == 2
print(total, fields, is_ready)
print("multi"
      "line")
```

```text
6 ['email', 'phone'] True
multiline
```

```python
is_ready = True and \ 
    False
```

```text
  File "main.py", line 1
    is_ready = True and \ 
                         ^
SyntaxError: unexpected character after line continuation character
```

JS-звичка "перенос де завгодно" ламається у двох місцях. Перше: оператор у кінці рядка поза дужками. Парсер JS бачить незавершений вираз і читає далі, Python вважає, що інструкція закінчилась на переносі. Друге: ланцюжок методів з крапкою на початку рядка, стандартний стиль Prettier. Для Python це окремий рядок з відступом, якого ніхто не відкривав. Виправлення в обох випадках одне: обгорнути весь вираз у круглі дужки.

```python
total = 1 +
    2
```

```text
  File "main.py", line 1
    total = 1 +
               ^
SyntaxError: invalid syntax
```

```python
fields = ["email", "phone", "age"]
result = fields
    .copy()
```

```text
  File "main.py", line 3
    .copy()
IndentationError: unexpected indent
```

```python live
title = "  Email Address "
field_id = (
    title
    .strip()
    .lower()
    .replace(" ", "_")
)
print(field_id)
```

```text
email_address
```

> **Пастка.** `return` на окремому рядку від значення. У JS це відома пастка ASI: `return` з переносом повертає `undefined`. У Python результат той самий з іншої причини: `return` без виразу це повна інструкція, яка повертає `None`, а наступний рядок з тим самим відступом стає мертвим кодом. Помилки немає в жодній мові.

```python
def total():
    return
    1 + 2


print(total())
```

```text
None
```

<!-- task: q1 -->

### Коментарі й docstring

Коментар лише один: `#` до кінця рядка. Блокового `/* */` немає. Іноді як блоковий коментар використовують рядок `"""..."""`, і це працює, бо рядок-вираз, який нікуди не присвоєно, обчислюється й викидається. Але це рядок, а не коментар, і в одному місці він поводиться зовсім інакше. Docstring (офіційний термін, описаний у PEP 257) це рядковий літерал, що стоїть першою інструкцією модуля, функції або класу. На відміну від коментаря, він потрапляє в об'єкт: інтерпретатор кладе його в атрибут `__doc__`, а `help()`, IDE й генератори документації показують його як опис. Коментар зникає ще на токенізації, і в жодному об'єкті його немає. Найближчий JS-аналог JSDoc `/** */`, з різницею, що JSDoc читають лише інструменти, а docstring доступний програмі під час виконання.

```python
def slugify(title: str) -> str:
    """Turn a field title into a field id: 'Email Address' -> 'email_address'."""
    # strip first, then lowercase
    return title.strip().lower().replace(" ", "_")


def legacy(title):
    # Turn a field title into a field id.
    return title


print(slugify.__doc__)
print(legacy.__doc__)
help(slugify)
```

```text
Turn a field title into a field id: 'Email Address' -> 'email_address'.
None
Help on function slugify in module __main__:

slugify(title: str) -> str
    Turn a field title into a field id: 'Email Address' -> 'email_address'.

```

Docstring визначається позицією, а не лапками. Той самий рядок другою інструкцією функції це просто вираз, і `__doc__` лишається `None`. Стиль docstring для функцій (однорядковий, багаторядковий, Google style) розібраний у m1-l07.

```python
def slugify(title):
    x = 1
    """Not a docstring: not the first statement."""
    return title


print(slugify.__doc__)
```

```text
None
```

> **Під капотом.** Запуск з `python -OO` викидає docstrings з байткоду, і `__doc__` стає `None` навіть у документованої функції, а `help()` показує лише сигнатуру. Нижче той самий файл з `slugify` і `legacy`, запущений з цим прапорцем. Тому логіка, що читає `__doc__`, має переживати його відсутність.

```text
$ python -OO main.py
None
None
Help on function slugify in module __main__:

slugify(title: str) -> str

```

## `print` і `input`

`print` приймає будь-яку кількість позиційних аргументів, перетворює кожен через `str()`, з'єднує роздільником `sep` (за замовчуванням пробіл) і дописує `end` (за замовчуванням `"\n"`). Обидва змінюються іменованими аргументами. Повертає `print` завжди `None`, тож результат виклику нікуди не присвоюють.

```ts
console.log("email", 42, null, true, ["a", "b"]);
// email 42 null true [ 'a', 'b' ]
```

```python
print("email", 42, None, True, ["a", "b"])
```

```text
email 42 None True ['a', 'b']
```

Поведінка розходиться в деталях. `console.log` інспектує складні значення і підставляє `%s`-шаблони; `print` нічого не інспектує, він просто бере `str()` від кожного аргументу, а форматування робиться f-рядками (m1-l04). Список друкується з лапками навколо рядків, бо `str()` списку викликає `repr()` для елементів. Аналог `console.error` це `print(..., file=sys.stderr)`, а `print(*items)` розпаковує список в окремі аргументи, як `console.log(...items)` (розпакування в аргументах детально в m1-l07).

```python live
print("email", "phone", "age", sep=", ")
print("loading", end="... ")
print("done")
print()
print(*["email", "phone"], sep=" | ")
result = print("x")
print(result)
print("a", "b", sep="")
```

```text
email, phone, age
loading... done

email | phone
x
None
ab
```

`input(prompt)` друкує підказку, блокує виконання до Enter і повертає рядок, завжди `str`, навіть якщо ввели число (перетворення типів у m1-l02). Далі в курсі він не використовується: завдання перевіряють функції, а дані приходять аргументами, не з клавіатури. Тут вивід при подачі `Ada` на stdin:

```python
name = input("Name: ")
print(type(name), repr(name))
```

```text
Name: <class 'str'> 'Ada'
```

<!-- task: t1 -->

## Імена: що перевіряє інтерпретатор, а що лише PEP 8

Інтерпретатор перевіряє небагато. Ім'я складається з літер, цифр і `_`, не починається з цифри, розрізняє регістр і не збігається з ключовим словом. Символу `$` в іменах немає, тож `$el` і `$store` не переносяться. Ключових слів 35, і `True`, `False`, `None` серед них, з великої літери. Окремо є чотири soft keywords (офіційний термін): `match`, `case`, `type`, `_` ключові лише в певній позиції, тож `type = ...` синтаксично легальне, хоч і затіняє вбудовану функцію (m1-l08). Конфлікт імені з ключовим словом вирішують підкресленням у кінці: `class_`, `type_`.

```python live
import keyword

print(len(keyword.kwlist))
print(keyword.kwlist[:3], "class" in keyword.kwlist)
print(keyword.softkwlist)
```

```text
35
['False', 'None', 'True'] True
['_', 'case', 'match', 'type']
```

```python
$el = 1
```

```text
  File "main.py", line 1
    $el = 1
    ^
SyntaxError: invalid syntax
```

```python
class = "primary"
```

```text
  File "main.py", line 1
    class = "primary"
          ^
SyntaxError: invalid syntax
```

Решта це конвенції PEP 8. Інтерпретатор їх не бачить: `maxLength` і `max_LENGTH` однаково легальні. Імена перевіряє лінтер: у ruff для цього є набір правил `N` (pep8-naming), який за замовчуванням вимкнений і вмикається в `[tool.ruff.lint]` у `pyproject.toml` (налаштування ruff в m0-l04).

| Форма | Для чого | Перевіряє інтерпретатор |
|---|---|---|
| `snake_case` | змінні, функції, методи, модулі | ні |
| `PascalCase` (у PEP 8 "CapWords") | класи, винятки, `TypeVar` | ні |
| `UPPER_CASE` | константи рівня модуля | ні |
| `_name` | внутрішнє, не частина публічного API | лише `from m import *` |
| `__name` в тілі класу | атрибут без колізій у підкласах | так, name mangling |
| `__name__` | імена, зарезервовані мовою | ні, але свої не вигадувати |
| `_` | значення не потрібне | ні, це звичайне ім'я |
| `name_` | обхід конфлікту з ключовим словом | ні |

```python
max_LENGTH = 3
maxLength = 4
print(max_LENGTH, maxLength)
```

```text
3 4
```

Одне підкреслення на початку означає "внутрішнє". Модуль чи клас не забороняє доступ до `_name`, це сигнал читачу й лінтеру. Єдиний ефект у runtime: `from module import *` не імпортує імена, що починаються з `_` (якщо модуль не задав список `__all__`). Явний імпорт працює. JS-аналог тут відсутність `export`, але в Python межа м'яка: "не експортовано" означає лише "не потрапляє в зірочку".

```python
# helpers.py
def render(field):
    return f"<{field}>"


def _escape(text):
    return text.replace("<", "&lt;")
```

```python
# main.py
from helpers import *

print(render("input"))
print(_escape("<b>"))
```

```text
<input>
Traceback (most recent call last):
  File "main.py", line 5, in <module>
    print(_escape("<b>"))
          ^^^^^^^
NameError: name '_escape' is not defined
```

Два підкреслення на початку імені атрибута в тілі класу вмикають name mangling (офіційний термін, у документації "private name mangling"). Компілятор переписує `self.__secret` усередині класу `FormField` на `self._FormField__secret`. Мета не сховати атрибут, бо дістати його можна, а уникнути випадкового перезапису в підкласі, де теж є `__secret`. Це не `#private` з JS: там справжня приватність на рівні мови, тут перейменування. Класи детально в m4-l01.

```python
class FormField:
    def __init__(self, field_id):
        self.field_id = field_id
        self._cache = {}
        self.__secret = "token"


field = FormField("email")
print(list(vars(field)))
print(field._cache)
print(field._FormField__secret)
print(field.__secret)
```

```text
['field_id', '_cache', '_FormField__secret']
{}
token
Traceback (most recent call last):
  File "main.py", line 12, in <module>
    print(field.__secret)
          ^^^^^^^^^^^^^^
AttributeError: 'FormField' object has no attribute '__secret'
```

Подвійне підкреслення з обох боків, `__init__`, `__doc__`, `__name__`, `__len__`, у спільноті називають dunder (жаргон від "double underscore"; у документації це "special method names" і "special attributes", на співбесіді годяться обидва). Це простір імен мови: інтерпретатор сам викликає такі методи, наприклад `len(x)` викликає `x.__len__()`. Name mangling на них не діє. Свої dunder-імена вигадувати не можна за конвенцією: наступна версія Python може зайняти те саме ім'я. Детально в m4-l02.

```python
print("abc".__len__(), len("abc"))
print(__name__)
```

```text
3 3
__main__
```

Одне `_` означає "значення не потрібне": змінна циклу, яку не читають, або зайвий елемент при розпакуванні. Для інтерпретатора це звичайне ім'я, яке отримує значення і зберігає його. В інтерактивному REPL `_` має додаткову роль: там у ньому лежить результат останнього виразу.

```python
for _ in range(2):
    print("tick")
first, _, third = (1, 2, 3)
print(first, third, _)
```

```text
tick
tick
1 3 2
```

```text
>>> 2 + 3
5
>>> _ * 10
50
```

<!-- task: q2 -->

## Присвоєння прив'язує ім'я до об'єкта

Змінна в Python це не комірка зі значенням, а ім'я, прив'язане до об'єкта (name binding, офіційний термін з language reference). `=` нічого не копіює: обчислює об'єкт праворуч і прив'язує до нього ім'я ліворуч. `same = fields` дає два імені на один список. Для JS-розробника це звична модель посилань на об'єкти, з різницею в тому, що окремої категорії примітивів, які копіюються, у Python немає: усе об'єкти, а числа й рядки поводяться "як значення" лише тому, що незмінні (m1-l02). Identity (офіційний термін: тотожність об'єкта, а не рівність значень), `id()` і `is` детально в m1-l03.

```ts
const fields = ["email", "phone"];
let same = fields;
same.push("age");
console.log(fields); // [ 'email', 'phone', 'age' ]
same = ["other"];
console.log(fields); // [ 'email', 'phone', 'age' ]
```

```python
fields = ["email", "phone"]
same = fields
same.append("age")
print(fields)
print(same is fields)

same = ["other"]
print(fields)
print(same is fields)
```

```text
['email', 'phone', 'age']
True
['email', 'phone', 'age']
False
```

Тут поведінка збігається повністю: мутація через одне ім'я видна через інше, переприсвоєння змінює лише одне ім'я. Розходження в іншому: у JS `const` забороняє переприсвоєння, а в Python такого ключового слова немає взагалі (про константи нижче). Будь-яке ім'я можна переприв'язати до об'єкта будь-якого типу.

Ланцюжкове присвоєння `a = b = 0` обчислює праворуч один об'єкт і прив'язує до нього обидва імені. З числом це безпечно: `b += 1` створює новий `int` і переприв'язує лише `b`. Зі списком два імені вказують на один змінюваний об'єкт.

> **Пастка.** `errors = warnings = []` це не два порожні списки, а один список під двома іменами. Усе, що додано у `warnings`, з'явиться і в `errors`. Окремі об'єкти дає лише окреме обчислення: `errors, warnings = [], []` або два рядки. Повна картина aliasing (кілька імен на один об'єкт; загальний термін з теорії мов, не специфічно пайтонівський) і копіювання в m2-l02.

```python live
a = b = 0
b += 1
print(a, b)

errors = warnings = []
warnings.append("phone is empty")
print(errors)
print(errors is warnings)

errors, warnings = [], []
warnings.append("phone is empty")
print(errors, warnings)
```

```text
0 1
['phone is empty']
True
[] ['phone is empty']
```

<!-- task: t2 -->

Розпакування (iterable unpacking, офіційний термін) це кілька імен ліворуч через кому і будь-який iterable праворуч. Iterable (офіційний термін з глосарію) це об'єкт, який віддає елементи по одному: список, кортеж, рядок, словник. `1, 2` без дужок теж кортеж, бо кортеж створює кома, а не дужки. JS-аналог деструктуризація масиву, але кількість мусить збігатися точно; `*rest` працює як `...rest` (детально в m2-l03).

```ts
const [width, height] = [320, 240, 10];
console.log(width, height); // 320 240
```

```python
width, height = 320, 240
print(width, height)

pair = 1, 2
print(type(pair), pair)

first, *rest = ["email", "phone", "age"]
print(first, rest)
```

```text
320 240
<class 'tuple'> (1, 2)
email ['phone', 'age']
```

JS мовчки відкидає зайвий елемент і підставляє `undefined` на місце відсутнього. Python не вгадує: будь-яка розбіжність довжин це `ValueError` у момент присвоєння.

```python
width, height = 320, 240, 10
```

```text
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    width, height = 320, 240, 10
    ^^^^^^^^^^^^^
ValueError: too many values to unpack (expected 2)
```

Обмін значеннями `a, b = b, a` працює без тимчасової змінної, бо права частина повністю обчислюється до того, як ліва почне прив'язуватись. У JS той самий трюк `[a, b] = [b, a]` створює проміжний масив; у Python для двох-трьох імен компілятор не створює навіть кортежу.

```python live
width, height = 320, 240
width, height = height, width
print(width, height)
```

```text
240 320
```

> **Під капотом.** Дизасемблер показує, що для обміну двох імен CPython 3.12 кладе обидва значення на стек, міняє їх місцями інструкцією `SWAP` і прив'язує. Кортеж з'являється лише в загальному випадку з довшою правою частиною.

```python
import dis

dis.dis("a, b = b, a")
```

```text
  0           0 RESUME                   0

  1           2 LOAD_NAME                0 (b)
              4 LOAD_NAME                1 (a)
              6 SWAP                     2
              8 STORE_NAME               1 (a)
             10 STORE_NAME               0 (b)
             12 RETURN_CONST             0 (None)
```

Присвоєння в Python це інструкція (statement), а не вираз (expression): воно нічого не повертає і не може стояти всередині умови. `if (x = 5)` неможливе, і 3.12 у повідомленні сам підказує обидві правильні форми. `:=` це walrus operator (жаргон, від схожості з моржем; офіційно assignment expression), присвоєння-вираз для умов і `while`, детально в m1-l05.

```python
if count = 5:
    pass
```

```text
  File "main.py", line 1
    if count = 5:
       ^^^^^^^^^
SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='?
```

Інкременту `++` і декременту `--` немає. Є augmented assignment (офіційний термін): `+=`, `-=`, `*=`, `/=`, `//=`, `%=`, `**=` і побітові. `x++` дає `SyntaxError`, а от `++x` це пастка: два унарні плюси підряд, валідний вираз, який повертає `x` без змін і нічого не присвоює.

```python
x = 5
x++
```

```text
  File "main.py", line 2
    x++
       ^
SyntaxError: invalid syntax
```

```python live
x = 5
print(++x)
print(--x)
print(x)
x += 1
print(x)
```

```text
5
5
5
6
```

<!-- task: q3 -->

### Константи без `const`

Ключового слова для констант немає. Константа це ім'я рівня модуля в `UPPER_CASE`, і захищає його лише домовленість. `typing.Final` позначає ім'я як неперевизначуване для type checker (mypy, pyright), але інтерпретатор анотацію ігнорує, і переприсвоєння спрацьовує. Анотації та `Final` детально в m2-l06, перевірка типів у m2-l08.

```python
from typing import Final

MAX_FIELDS: Final = 50
MAX_FIELDS = 100
print(MAX_FIELDS)
```

```text
100
```

> **JS-аналог.** `const` у JS забороняє переприсвоєння імені, але не робить значення незмінним: `const fields = []` дозволяє `fields.push(...)`. У Python ці дві речі розведені. Переприсвоєння обмежує лише конвенція й type checker, а незмінність значення дає тип: `tuple` замість `list`, `frozenset` замість `set` (m1-l02, m2-l01).

## Модуль виконується зверху вниз, hoisting немає

Python виконує файл від першого рядка до останнього, і `def` та `class` серед цих рядків теж інструкції. `def` під час виконання створює об'єкт функції й прив'язує його до імені, так само як `=`. До цього рядка імені не існує. Тому виклик функції вище за її `def` падає.

```ts
console.log(greet("Ada")); // Hello, Ada
function greet(name: string) {
  return `Hello, ${name}`;
}
```

```python
print(greet("Ada"))


def greet(name):
    return f"Hello, {name}"
```

```text
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    print(greet("Ada"))
          ^^^^^
NameError: name 'greet' is not defined
```

У JS hoisting має три форми: function declaration піднімається цілком, `let` і `const` піднімаються в temporal dead zone і дають `ReferenceError`, `var` піднімається як `undefined`. У Python жодної з трьох: ім'я або вже прив'язане, або його немає, і для функцій, і для змінних результат той самий `NameError`. Підказка `Did you mean` у 3.12 шукає схожі імена серед доступних.

```python
print(limit)
limit = 10
```

```text
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    print(limit)
          ^^^^^
NameError: name 'limit' is not defined. Did you mean: 'list'?
```

Що `def` і `class` це інструкції, видно напряму. До рядка з `def` імені немає в просторі імен модуля, після нього є, і це звичайний об'єкт типу `function`. Тіло класу виконується одразу, коли інтерпретатор доходить до `class`, а не при створенні екземпляра. Те саме відбувається при `import`: файл модуля виконується зверху вниз один раз, і всі його `def` у цей момент створюють функції (звідси й `if __name__ == "__main__"` з m0-l03).

```python live
print("greet" in globals())


def greet(name):
    return f"Hello, {name}"


print("greet" in globals())
print(type(greet), greet.__name__)

print("before class")


class Registry:
    print("class body runs now")
    items = []


print("after class")
```

```text
False
True
<class 'function'> greet
before class
class body runs now
after class
```

Для взаємних викликів це означає таке: тіло функції при `def` не виконується, імена в ньому шукаються в момент виклику. Тому порядок `def` між собою не важливий, важливо, щоб виклик стався після того, як усі потрібні імена прив'язані. `is_even` нижче посилається на `is_odd`, визначену пізніше, і це працює, бо виклик стоїть унизу.

```python
def is_even(n):
    if n == 0:
        return True
    return is_odd(n - 1)


def is_odd(n):
    if n == 0:
        return False
    return is_even(n - 1)


print(is_even(10), is_odd(7))
```

```text
True True
```

Той самий код з викликом між двома `def` падає вже всередині `is_even`: на момент виклику `is_odd` ще не існує. Traceback показує, що помилка не в рядку виклику, а в рядку, де ім'я шукалось.

```python
def is_even(n):
    if n == 0:
        return True
    return is_odd(n - 1)


print(is_even(2))


def is_odd(n):
    if n == 0:
        return False
    return is_even(n - 1)
```

```text
Traceback (most recent call last):
  File "main.py", line 7, in <module>
    print(is_even(2))
          ^^^^^^^^^^
  File "main.py", line 4, in is_even
    return is_odd(n - 1)
           ^^^^^^
NameError: name 'is_odd' is not defined
```

> **Пастка.** Деякі частини `def` обчислюються в момент визначення, а не виклику: значення за замовчуванням, анотації параметрів, декоратори. Константа, на яку посилається default, мусить бути визначена вище за функцію. Те саме зі словником-реєстром обробників на рівні модуля: `{"text": render_text}` обчислюється одразу, тому стоїть нижче за всі `def`. Момент обчислення default детально в m1-l07.

```python
def truncate(text, limit=MAX_LENGTH):
    return text[:limit]


MAX_LENGTH = 5
```

```text
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    def truncate(text, limit=MAX_LENGTH):
                             ^^^^^^^^^^
NameError: name 'MAX_LENGTH' is not defined
```

Повторний `def` з тим самим іменем мовчки переприв'язує ім'я, як повторне `=`. До другого `def` працює перша версія. У JS обидві function declaration піднімаються, і перемагає остання навіть для виклику, що стоїть між ними. ruff з типовим набором правил ловить лише перевизначення функції, яку до того ніде не використали (F811); у прикладі нижче першу версію викликано, тож лінтер мовчить. А оскільки `def` це інструкція, її можна поставити в `if`, щоб визначити різні версії функції залежно від умови під час виконання.

```ts
console.log(label()); // second
function label() { return "first"; }
console.log(label()); // second
function label() { return "second"; }
```

```python
def label():
    return "first"


print(label())


def label():
    return "second"


print(label())
```

```text
first
second
```

> **Пастка.** Єдине місце, де Python схожий на hoisting, це рішення про scope всередині функції. Якщо функція десь присвоює ім'я, воно локальне для всієї функції ще до рядка присвоєння, і читання вище дає не глобальне значення, а `UnboundLocalError`. Піднімається рішення "це локальна змінна", а не значення. Механізм і `global`/`nonlocal` у m1-l08.

```python
limit = 10


def check(value):
    if value > limit:
        return "too big"
    limit = 0
    return "ok"


print(check(5))
```

```text
Traceback (most recent call last):
  File "main.py", line 11, in <module>
    print(check(5))
          ^^^^^^^^
  File "main.py", line 5, in check
    if value > limit:
               ^^^^^
UnboundLocalError: cannot access local variable 'limit' where it is not associated with a value
```

<!-- task: q4 -->

<!-- task: t3 -->

## Оператори, яких немає в JS або які поводяться інакше

Арифметика відрізняється в трьох операторах. `/` завжди дає `float`, навіть для `6 / 2`. `//` це floor division (офіційний термін), ціле ділення, якого в JS немає як оператора; `%` остача. На від'ємних числах обидва поводяться не так, як звичні JS-ідіоми, приклад нижче. `**` є в обох мовах з тією самою правою асоціативністю, але в Python він зв'язує сильніше за унарний мінус, тож `-2 ** 2` це `-4`, а JS таке записати не дає взагалі. Числа детально в m1-l02, тут лише форма операторів.

```ts
console.log(2 ** 10, 2 ** -1, 2 ** 3 ** 2); // 1024 0.5 512
console.log(7 / 2, 6 / 2);                  // 3.5 3
console.log(Math.trunc(-7 / 2), -7 % 3);    // -3 -1
// -2 ** 2 → SyntaxError: '**' cannot be applied to unary/await expression
```

```python
print(2 ** 10, 2 ** -1, 2 ** 3 ** 2)
print(-2 ** 2, (-2) ** 2)
print(7 / 2, 6 / 2)
print(-7 // 2, -7 % 3)
```

```text
1024 0.5 512
-4 4
3.5 3.0
-4 2
```

Найбільше розходиться останній рядок. `//` округлює до мінус нескінченності, а не до нуля, тож `-7 // 2` це `-4`, а не `-3`, як `Math.trunc` або `(a / b) | 0`. `%` бере знак дільника, а не діленого: `-7 % 3` це `2`, а не `-1`. Чому ці два оператори узгоджені між собою і як на цьому тримаються циклічні індекси без `((x % n) + n) % n`, детально в m1-l02 у розділі "Ділення, остача й округлення".

`@` це оператор матричного множення (офіційно matrix multiplication operator, з'явився в 3.5). Жоден вбудований тип його не реалізує, він існує для NumPy і подібних бібліотек, які визначають `__matmul__`. Не плутати з `@decorator` на рядку перед `def`: це інший синтаксис з тим самим символом (m5-l04).

```python
print(1 @ 2)
```

```text
Traceback (most recent call last):
  File "main.py", line 1, in <module>
    print(1 @ 2)
          ~~^~~
TypeError: unsupported operand type(s) for @: 'int' and 'int'
```

Логічні оператори записуються словами: `and`, `or`, `not`. Символьних `&&`, `||`, `!` у мові немає, як і `===`, `??`, `?.` і тернарного `? :`. Усе це `SyntaxError` ще до виконання. `==` у Python не має коерції між типами, тому `===` не потрібен (m1-l03); `and` і `or` повертають операнд, а не `bool`, як `&&` і `||` у JS (теж m1-l03).

```python live
for source in ["a && b", "!a", "a === b", "a ?? b", "c ? a : b", "x++", "a?.b"]:
    try:
        compile(source, "<js-habit>", "eval")
    except SyntaxError as e:
        print(f"{source:10} SyntaxError: {e.msg}")
```

```text
a && b     SyntaxError: invalid syntax
!a         SyntaxError: invalid syntax
a === b    SyntaxError: invalid syntax
a ?? b     SyntaxError: invalid syntax
c ? a : b  SyntaxError: invalid syntax
x++        SyntaxError: invalid syntax
a?.b       SyntaxError: invalid syntax
```

Порівняння можна з'єднувати в ланцюжок (chained comparison, у документації "comparisons can be chained"): `0 < x < 10` означає `0 < x and x < 10`, причому `x` обчислюється один раз. У JS той самий запис компілюється, але означає `(0 < x) < 10`, тобто порівнює `true` або `false` з числом.

```ts
const x = 50;
console.log(0 < x < 10, 10 > 5 > 1); // true false
```

```python
x = 50
print(0 < x < 10, 10 > 5 > 1)
```

```text
False True
```

У JS `0 < 50 < 10` дає `true`, бо `true < 10` після коерції це `1 < 10`; `10 > 5 > 1` дає `false`, бо `1 > 1` хибне. Python читає обидва вирази так, як їх читає людина. Пастки на кшталт `x == 1 or 2` і пріоритети `not`/`and`/`or` розібрані в m1-l03.

Решта операторів-слів: `in` і `not in` перевіряють належність (елемент у списку, підрядок у рядку, ключ у словнику), заміняючи `includes` і JS-оператор `in`. `is` і `is not` перевіряють identity, той самий об'єкт, і потрібні майже лише для `None` (m1-l03). Тернарний оператор має форму `a if cond else b` (офіційно conditional expression), детально в m1-l05. Побітові `&`, `|`, `^`, `~`, `<<`, `>>` такі самі, як у JS; `>>>` немає, бо `int` не має фіксованої ширини.

```python live
age = 30
print(18 <= age < 65)
print("email" in ["email", "phone"], "e" in "email", "id" in {"id": 1})
print("age" not in {"id": 1})
value = None
print(value is None, value is not None)
print("adult" if age >= 18 else "minor")
print(not age, age and "set", 0 or "default")
```

```text
True
True True True
True
True False
adult
False set default
```

<!-- task: t4 -->

## Для капстоуну

Бекенд FormBuilder приймає JSON-конфіги, які фронтенд пише в camelCase: `fieldId`, `isRequired`, `maxLength`. PEP 8 стосується імен у коді, а не ключів словника: `payload["fieldId"]` це рядок-ключ, і він лишається таким, як у контракті. Конвертація відбувається на межі: дані з JSON читаються за camelCase-ключами, а змінні, функції й атрибути в Python уже snake_case. У Pydantic це робить `alias_generator` (m2-l09), а до нього вистачить явної функції-перекладача; її ви напишете в m1-l06, коли з'являться цикли по рядку й по словнику. Зверніть увагу на значення: JSON-ові `true` і `null` після `json.loads` стають Python-овими `True` і `None`, бо літерали JSON це не синтаксис Python, і парсер перекладає їх в об'єкти.

```python
import json

payload = json.loads('{"fieldId": "email", "isRequired": true, "maxLength": null}')
print(payload)

field_id = payload["fieldId"]
is_required = payload["isRequired"]
max_length = payload["maxLength"]
print(field_id, is_required, max_length)
```

```text
{'fieldId': 'email', 'isRequired': True, 'maxLength': None}
email True None
```

> **Для капстоуну.** Модуль рендерерів буде мати реєстр `RENDERERS = {"input": render_input, ...}`, з якого диспетчер вибирає функцію за `type` елемента. Через виконання зверху вниз реєстр стоїть унизу файлу, після всіх `def`, а константи на кшталт `DEFAULT_TYPE` угорі. Порушення порядку дає `NameError` при імпорті модуля, а не при першому запиті, тож воно ловиться найпершим тестом.

## Типові помилки JS-розробника

1. **`;` в кінці рядків і `{}` для блоків.** Крапка з комою легальна й нічого не робить. Фігурні дужки в Python це літерал словника або множини, тож `if (ready) {` дає `SyntaxError`. Правильно: двокрапка, новий рядок, 4 пробіли.

   ```python
   if ready:          # не if (ready) {
       print("go")    # не print("go");
   ```

2. **camelCase в іменах.** Інтерпретатор не заперечує, але кожен рецензент і ruff з правилами `N` заперечить. Правильно: `snake_case` для змінних і функцій, `PascalCase` для класів, `UPPER_CASE` для констант модуля.

   ```python
   maxLength = 120    # за звичкою
   max_length = 120   # правильно
   MAX_LENGTH = 120   # якщо це константа модуля
   ```

3. **`===`, `&&`, `||`, `!x`.** `SyntaxError` ще до запуску. Правильно: `==`, `and`, `or`, `not x`.

   ```python
   if not errors and status == "ok":   # не if (!errors && status === "ok")
       print("submit")
   ```

4. **`null`, `true`, `false` з малої.** Це не помилка синтаксису, а звичайні невідомі імена: `NameError` лише в момент виконання рядка, тож у рідко досяжній гілці помилка ховається довго. Правильно: `None`, `True`, `False`.

   ```python
   print(true)   # NameError: name 'true' is not defined. Did you mean: 'True'?
   print(null)   # NameError: name 'null' is not defined
   ```

5. **`x++` і `++x`.** Перше `SyntaxError`, друге мовчки нічого не змінює. Правильно: `x += 1`.

   ```python
   x = 5
   ++x          # 5, x не змінився
   x += 1       # 6
   ```

6. **Виклик або реєстр до `def`.** Очікування hoisting дає `NameError`. Правильно: спершу `def`, потім код, що їх використовує; виклик точки входу внизу файлу.

   ```python
   RENDERERS = {"text": render_text}   # NameError: name 'render_text' is not defined

   def render_text(name): ...
   ```

7. **`a = b = []` як два порожні списки.** Це один список під двома іменами. Правильно: `a, b = [], []`.

   ```python
   errors = warnings = []   # один об'єкт
   errors, warnings = [], []   # два
   ```

8. **Перенос рядка з оператором у кінці або крапкою на початку.** У JS парсер читає далі, у Python рядок закінчився. Правильно: обгорнути вираз у круглі дужки.

   ```python
   field_id = (
       title
       .strip()
       .lower()
   )
   ```

## Підсумок

- Відступ це синтаксис: токенізатор перетворює його на `INDENT`/`DEDENT`, помилки відступу ловляться до виконання першого рядка.
- Двокрапка відкриває блок; порожній блок заповнюють `pass` (навмисно нічого) або `...` (ще не написано); 4 пробіли, без табів.
- Перенос рядка всередині дужок вільний, поза дужками закінчує інструкцію; ланцюжки й довгі вирази обгортають у `()`.
- Docstring це перший рядковий літерал тіла, він живе в `__doc__`; коментар `#` зникає на токенізації.
- Інтерпретатор перевіряє в іменах лише синтаксис і ключові слова; `snake_case`, `PascalCase`, `UPPER_CASE`, `_name` це PEP 8. `__name` вмикає name mangling, `__name__` зарезервовано мовою.
- `=` прив'язує ім'я до об'єкта, нічого не копіюючи; `a = b = []` це один список.
- Розпакування вимагає точної кількості; `a, b = b, a` обмінює без тимчасової змінної.
- `def` і `class` це інструкції, що виконуються зверху вниз; hoisting немає, імена в тілі функції шукаються при виклику, default обчислюється при `def`.
- `const` і `++` немає; константа це `UPPER_CASE` за домовленістю, `Final` перевіряє лише type checker.
- `/` дає float, `//` округлює вниз, `%` бере знак дільника, `and`/`or`/`not` словами, `0 < x < 10` працює як у математиці.

## Що далі

Наступний урок m1-l02 про типи: `int` без переповнення, `float`, `str`, `bool` як підклас `int` і `None` замість пари `null`/`undefined`. Звідси там знадобиться модель "ім'я прив'язане до об'єкта": саме вона пояснює, чому `+=` на числі дає новий об'єкт, а на списку змінює той самий, і `//` з `%` там розібрані вже на рівні чисел.
