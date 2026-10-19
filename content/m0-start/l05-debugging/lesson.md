---
id: m0-l05
module: m0-start
title: "Traceback, breakpoint() і pdb за 15 хвилин"
summary: "Учень читає traceback знизу вгору й відрізняє свій кадр від бібліотечного, дебажить через f\"{x=}\" і pprint, зупиняє програму breakpoint(), за 15 хвилин проходить сесію pdb з n, s, c, p, w, u, d, b, вміє post-mortem і бачить приховані warnings."
duration_min: 60
prerequisites: [m0-l04]
---

## Traceback читається знизу вгору

Коли виняток ніхто не перехопив, Python друкує в stderr traceback (офіційна назва: так зветься і розділ документації, і модуль `traceback`; "stack trace" теж зрозуміють) і завершує процес з кодом 1. Нижче три функції, і третя падає на полі з `label: None`.

```python
def render_field(field: dict) -> str:
    label = field["label"].strip()
    return f"<label>{label}</label>"


def render_page(page: dict) -> list[str]:
    html = []
    for field in page["fields"]:
        html.append(render_field(field))
    return html


page = {"fields": [{"label": " Email "}, {"label": None}]}
print(render_page(page))
```

```text
Traceback (most recent call last):
  File "app.py", line 14, in <module>
    print(render_page(page))
          ^^^^^^^^^^^^^^^^^
  File "app.py", line 9, in render_page
    html.append(render_field(field))
                ^^^^^^^^^^^^^^^^^^^
  File "app.py", line 2, in render_field
    label = field["label"].strip()
            ^^^^^^^^^^^^^^^^^^^^
AttributeError: 'NoneType' object has no attribute 'strip'
```

Читати з останнього рядка. `AttributeError: 'NoneType' object has no attribute 'strip'` це тип винятку і повідомлення, і часто їх уже достатньо: хтось викликав `.strip()` на `None`. Вище йдуть кадри стеку (stack frame, у документації просто "frame"), по два-три рядки на кадр: `File "app.py", line 2, in render_field` каже файл, рядок і функцію; під ним сам рядок коду; під ним стрілки, які показують, який саме вираз виконувався. Заголовок `most recent call last` описує порядок буквально: перший кадр це точка входу (`<module>`, верхній рівень скрипта), останній це місце, де виник виняток.

Отже, розбір цього traceback знизу вгору: впало в `render_field`, рядок 2, на `field["label"].strip()`; викликала її `render_page` з рядка 9 у циклі; ту викликав модуль з рядка 14. У кадрі `<module>` стрілок немає там, де вираз займає весь рядок, і є там, де виконувалась лише частина рядка: у рядку 14 це `render_page(page)` всередині `print(...)`.

```ts
function renderField(field) {
  const label = field.label.trim();
  return `<label>${label}</label>`;
}

function renderPage(page) {
  return page.fields.map((field) => renderField(field));
}

const page = { fields: [{ label: " Email " }, { label: null }] };
console.log(renderPage(page));
```

```python
def render_field(field: dict) -> str:
    label = field["label"].strip()
    return f"<label>{label}</label>"


def render_page(page: dict) -> list[str]:
    html = []
    for field in page["fields"]:
        html.append(render_field(field))
    return html
```

```text
$ node app.js
app.js:2
  const label = field.label.trim();
                            ^

TypeError: Cannot read properties of null (reading 'trim')
    at renderField (app.js:2:29)
    at app.js:7:37
    at Array.map (<anonymous>)
    at renderPage (app.js:7:22)
    at Object.<anonymous> (app.js:11:13)
    at Module._compile (node:internal/modules/cjs/loader:1760:14)
    at Object..js (node:internal/modules/cjs/loader:1893:10)
    at Module.load (node:internal/modules/cjs/loader:1480:32)
    at Module._load (node:internal/modules/cjs/loader:1299:12)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)

Node.js v24.9.0
```

Порядок перевернутий. У Node повідомлення зверху, під ним найсвіжіший кадр, а точка входу внизу, разом з кадрами самого Node. У Python точка входу зверху, найсвіжіший кадр і повідомлення внизу. Звичка "очі на перший рядок" у Python приводить до `<module>`, тобто до найменш корисного місця. Друга різниця: V8 за замовчуванням обрізає стек до 10 кадрів (`Error.stackTraceLimit`), а Python друкує всі кадри і під кожним показує рядок коду, тож відкривати файл часто не треба.

> **Під капотом.** Source maps у Python не потрібні, бо виконується той самий `.py`, який ви редагуєте, а не бандл. Рядки коду в traceback не зберігаються в байткоді: модуль `linecache` читає їх з диска в момент друку. Якщо файл змінили після запуску процесу, traceback покаже правильний номер рядка, але новий текст. Типовий випадок: dev-сервер без автоперезавантаження, ви вже щось поправили, а traceback показує рядок, який не міг упасти. Нижче `rules.py` і скрипт `stale.py`, який імпортує його, переписує файл на диску і лише тоді викликає `check`.

```python
def check(value: str) -> None:
    raise ValueError(f"bad value: {value!r}")
```

```python
from pathlib import Path

import rules

Path("rules.py").write_text(
    "# edited after import\n"
    "def check(value: str) -> None:\n"
)
rules.check("x")
```

```text
Traceback (most recent call last):
  File "stale.py", line 9, in <module>
    rules.check("x")
  File "rules.py", line 2, in check
    def check(value: str) -> None:
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: bad value: 'x'
```

Коли в стеку є бібліотека, кадри йдуть упереміш: ваші файли, потім стандартна бібліотека або `site-packages`. Шлях виду `.../lib/python3.12/json/decoder.py` це stdlib, `.../site-packages/...` це встановлений пакет. Бібліотечні кадри майже ніколи не містять бага; потрібен останній кадр з вашого коду, бо саме там ви передали бібліотеці щось не те. Що саме не те, каже повідомлення внизу.

```python
import json


def load_config(raw: str) -> dict:
    config = json.loads(raw)
    return config


def build(raw: str) -> None:
    config = load_config(raw)
    print(config["title"])


build('{"title": "Signup", "fields": [],}')
```

```text
Traceback (most recent call last):
  File "config.py", line 14, in <module>
    build('{"title": "Signup", "fields": [],}')
  File "config.py", line 10, in build
    config = load_config(raw)
             ^^^^^^^^^^^^^^^^
  File "config.py", line 5, in load_config
    config = json.loads(raw)
             ^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 338, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 354, in raw_decode
    obj, end = self.scan_once(s, idx)
               ^^^^^^^^^^^^^^^^^^^^^^
json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 34 (char 33)
```

<!-- task: q1 -->

Останній кадр каже, де програма впала, а не де помилка. Якщо функція отримала неправильні аргументи, вона впаде у своєму тілі, а виправляти треба того, хто її викликав, на один-два кадри вище. Звідси правило: знайти останній свій кадр, прочитати повідомлення, і якщо значення там уже погане, підніматися стеком, поки не знайдеться кадр, де воно стало поганим.

Друге обмеження важливіше. Traceback показує лише кадри, активні в момент винятку. Функція, яка вже повернула результат, у ньому відсутня, навіть якщо саме вона зіпсувала дані: `parse_answers` нормалізувала ключі неправильно, повернула словник, і впала вже `age_of`, коли не знайшла ключ. Такі баги traceback не локалізує, їх ловлять друком проміжних значень або дебагером, про обидва далі в уроці.

<!-- task: q2 -->

Буває, що виняток виникає під час обробки іншого. Тоді Python друкує обидва traceback, розділені фразою. "The above exception was the direct cause of the following exception" означає навмисне перекладання через `raise ... from e`. "During handling of the above exception, another exception occurred" означає, що всередині `except` стався новий виняток, і інтерпретатор не знає, навмисно чи через баг в обробнику. В обох випадках читати так само: найнижчий рядок усього виводу це виняток, який зупинив програму, а над фразою його причина. Механізм `raise from`, `from None` і `__cause__` детально в m1-l11.

```python
import json


def load_config(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError("config is not valid JSON") from e


load_config('{"title": "Signup",}')
```

```text
Traceback (most recent call last):
  File "chain.py", line 6, in load_config
    return json.loads(raw)
           ^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 338, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 354, in raw_decode
    obj, end = self.scan_once(s, idx)
               ^^^^^^^^^^^^^^^^^^^^^^
json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 20 (char 19)

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "chain.py", line 11, in <module>
    load_config('{"title": "Signup",}')
  File "chain.py", line 8, in load_config
    raise ValueError("config is not valid JSON") from e
ValueError: config is not valid JSON
```

```python
WIDGETS = {"text": "TextInput"}


def widget_for(field: dict) -> str:
    try:
        return WIDGETS[field["type"]]
    except KeyError:
        return WIDGETS[field["fallback"]]


widget_for({"id": "dob", "type": "date"})
```

```text
Traceback (most recent call last):
  File "chain2.py", line 6, in widget_for
    return WIDGETS[field["type"]]
           ~~~~~~~^^^^^^^^^^^^^^^
KeyError: 'date'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "chain2.py", line 11, in <module>
    widget_for({"id": "dob", "type": "date"})
  File "chain2.py", line 8, in widget_for
    return WIDGETS[field["fallback"]]
                   ~~~~~^^^^^^^^^^^^
KeyError: 'fallback'
```

<!-- task: q3 -->

## Підказки інтерпретатора: "Did you mean" і стрілки під виразом

З 3.10 по 3.12 повідомлення про помилки переписали так, що на половину опечаток Python сам підказує виправлення. `NameError` і `AttributeError` шукають найближче ім'я в scope або серед атрибутів об'єкта (3.10). Для `NameError` на імені стандартного модуля 3.12 підказує забутий `import`, а всередині методу пропонує `self.`, якщо такий атрибут є. `ImportError` у `from x import y` з 3.12 теж підказує близьке ім'я.

```python
field_count = 3
print(field_cont)
```

```text
Traceback (most recent call last):
  File "h.py", line 2, in <module>
    print(field_cont)
          ^^^^^^^^^^
NameError: name 'field_cont' is not defined. Did you mean: 'field_count'?
```

```python
fields = []
fields.apend("email")
```

```text
Traceback (most recent call last):
  File "h.py", line 2, in <module>
    fields.apend("email")
    ^^^^^^^^^^^^
AttributeError: 'list' object has no attribute 'apend'. Did you mean: 'append'?
```

```python
print(sys.argv)
```

```text
Traceback (most recent call last):
  File "h.py", line 1, in <module>
    print(sys.argv)
          ^^^
NameError: name 'sys' is not defined. Did you forget to import 'sys'?
```

```python
class Field:
    def __init__(self, name):
        self.name = name

    def label(self):
        return name.title()

Field("email").label()
```

```text
Traceback (most recent call last):
  File "h.py", line 8, in <module>
    Field("email").label()
  File "h.py", line 6, in label
    return name.title()
           ^^^^
NameError: name 'name' is not defined. Did you mean: 'self.name'?
```

```python
from collections import namedtupel
```

```text
Traceback (most recent call last):
  File "h.py", line 1, in <module>
    from collections import namedtupel
ImportError: cannot import name 'namedtupel' from 'collections' (.../lib/python3.12/collections/__init__.py). Did you mean: 'namedtuple'?
```

Стрілки під виразом з'явились у 3.11 (PEP 657): інтерпретатор зберігає для кожної інструкції байткоду не лише рядок, а й колонки початку й кінця. Позначення двох видів: `^` під тією операцією, яка впала, `~` під рештою виразу, до якого вона належить. На ланцюжку індексів це показує, який саме `[...]` отримав `None`, а в арифметиці, яке з ділень було на нуль. У JS аналогом є номер колонки `app.js:2:29`, але не підсвітка частини виразу.

```python
config = {"fields": [{"id": "email", "options": None}]}
print(config["fields"][0]["options"][0])
```

```text
Traceback (most recent call last):
  File "h.py", line 2, in <module>
    print(config["fields"][0]["options"][0])
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^
TypeError: 'NoneType' object is not subscriptable
```

```python
total, count = 10, 0
avg = total / count + 1
```

```text
Traceback (most recent call last):
  File "h.py", line 2, in <module>
    avg = total / count + 1
          ~~~~~~^~~~~~~
ZeroDivisionError: division by zero
```

`SyntaxError` теж став конкретним (3.10): незакрита дужка вказує на місце відкриття, а не на кінець файлу, пропущена кома й `=` замість `==` називаються прямо. Зверніть увагу на відсутній заголовок `Traceback`: синтаксична помилка виникає при компіляції файлу, жоден кадр ще не виконувався.

```python
config = {"title": "Signup", "fields": [
print(config)
```

```text
  File "h.py", line 1
    config = {"title": "Signup", "fields": [
                                           ^
SyntaxError: '[' was never closed
```

```python
x = [1, 2 3]
```

```text
  File "h.py", line 1
    x = [1, 2 3]
            ^^^
SyntaxError: invalid syntax. Perhaps you forgot a comma?
```

```python
if x = 1:
    pass
```

```text
  File "h.py", line 1
    if x = 1:
       ^^^^^
SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='?
```

> **Під капотом.** Підказка "Did you mean" не є частиною повідомлення винятку. Її обчислює форматувальник traceback у момент друку, дивлячись на атрибути винятку (`e.name`, `e.obj`). Тому `str(e)` у вашому `except` і в повідомленні для користувача підказки не містить, а `traceback.format_exception_only(e)` і логи через `logging.exception` містять.

```python live
import traceback

fields = []
try:
    fields.apend("email")
except AttributeError as e:
    print(str(e))
    print(e.name, type(e.obj))
    print(traceback.format_exception_only(e)[-1], end="")
```

```text
'list' object has no attribute 'apend'
apend <class 'list'>
AttributeError: 'list' object has no attribute 'apend'. Did you mean: 'append'?
```

## print-дебаг: `f"{x=}"`, `repr` і `pprint`

Друк проміжних значень (print debugging, жаргон спільноти) лишається найшвидшим способом знайти баг у функції, яка вже повернула результат. У Python для цього є специфікатор `=` у f-рядку: у документації це "self-documenting expressions" (з 3.8). Він друкує текст виразу, знак `=` і значення через `repr`. Працює з будь-яким виразом, а не лише з ім'ям, і поважає пробіли навколо `=`. Аналог `console.log({ fieldId, value })`, але без обгортки в об'єкт і з викликами всередині.

```python live
field_id = "age"
value = "30"
fields = ["email", "age"]

print(f"{field_id=}")
print(f"{value=}, {len(fields)=}")
print(f"{value = }")
print(f"{value=!s}")
print(f"{fields.index(field_id)=}")
```

```text
field_id='age'
value='30', len(fields)=2
value = '30'
value=30
fields.index(field_id)=1
```

Чому `repr`, а не `str`: `print` за замовчуванням викликає `str()`, і рядок `"30"` та число `30` друкуються однаково. `repr()` дає представлення для розробника: рядки в лапках, спецсимволи екрановані, порожній рядок видно як `''`. Для дебагу потрібне саме воно, бо половина багів з даними форм це "прийшов рядок замість числа". Контейнери друкують свої елементи через `repr` завжди, тому в списку різниця видна і без `!r`.

```python
print("30", 30)
print(repr("30"), repr(30))
print(["30", 30])
print(str(None), repr(""), repr("a\tb"))
```

```text
30 30
'30' 30
['30', 30]
None '' 'a\tb'
```

> **Пастка.** `console.log(obj)` у DevTools дає розгорнутий інтерактивний об'єкт. `print(obj)` для екземпляра вашого класу дає `repr` за замовчуванням: ім'я класу й адресу в пам'яті, без жодного поля. Поля показує `vars(obj)`; постійне рішення це `@dataclass` (m2-l05) або власний `__repr__` (m4-l02).

```python
class Field:
    def __init__(self, field_id: str, required: bool):
        self.field_id = field_id
        self.required = required


field = Field("email", True)
print(field)
print(vars(field))
```

```text
<__main__.Field object at 0x104a85280>
{'field_id': 'email', 'required': True}
```

Для вкладених структур, як конфіг форми, `print` видає один довгий рядок. `pprint` з модуля `pprint` розбиває його по рівнях вкладеності так, щоб рядок не перевищував `width` (80 за замовчуванням). Та сама функція стоїть за командою `pp` у pdb.

```python
from pprint import pprint

config = {
    "title": "Signup",
    "pages": [
        {"id": "contact", "fields": [{"id": "email", "type": "email", "required": True},
                                     {"id": "phone", "type": "tel", "required": False}]},
    ],
    "meta": {"version": 3, "locale": "uk"},
}
print(config)
pprint(config)
print("----")
pprint(config, sort_dicts=False, width=60)
```

```text
{'title': 'Signup', 'pages': [{'id': 'contact', 'fields': [{'id': 'email', 'type': 'email', 'required': True}, {'id': 'phone', 'type': 'tel', 'required': False}]}], 'meta': {'version': 3, 'locale': 'uk'}}
{'meta': {'locale': 'uk', 'version': 3},
 'pages': [{'fields': [{'id': 'email', 'required': True, 'type': 'email'},
                       {'id': 'phone', 'required': False, 'type': 'tel'}],
            'id': 'contact'}],
 'title': 'Signup'}
----
{'title': 'Signup',
 'pages': [{'id': 'contact',
            'fields': [{'id': 'email',
                        'type': 'email',
                        'required': True},
                       {'id': 'phone',
                        'type': 'tel',
                        'required': False}]}],
 'meta': {'version': 3, 'locale': 'uk'}}
```

> **Пастка.** `pprint` за замовчуванням сортує ключі словників, тоді як сам словник зберігає порядок вставки. Якщо порядок полів має значення (а в конфігу форми це порядок на екрані), передавайте `sort_dicts=False`.

<!-- task: q4 -->

<!-- task: t1 -->

Print-дебаг закінчується там, де значення треба дивитися в кількох місцях одночасно або підніматися стеком. Тоді не додають ще десять `print`, а зупиняють програму.

## `breakpoint()` замість `debugger;`

`breakpoint()` (вбудована функція з 3.7, PEP 553) зупиняє програму в цьому місці й відкриває дебагер у тому ж терміналі. За замовчуванням це pdb, стандартний консольний дебагер. Ви бачите поточний рядок і запрошення `(Pdb)`, де можна дивитися змінні; `c` продовжує виконання.

```python
def total(prices: list[float]) -> float:
    result = sum(prices)
    breakpoint()
    return round(result, 2)


print(total([9.99, 0.01, 5.5]))
```

```text
$ python bp.py
> bp.py(4)total()
-> return round(result, 2)
(Pdb) p prices, result
([9.99, 0.01, 5.5], 15.5)
(Pdb) c
15.5
```

```ts
function total(prices: number[]): number {
  const result = prices.reduce((a, b) => a + b, 0);
  debugger;
  return Math.round(result * 100) / 100;
}
```

```python
def total(prices: list[float]) -> float:
    result = sum(prices)
    breakpoint()
    return round(result, 2)
```

`debugger;` у JS нічого не робить, поки не відкриті DevTools або не підключено інспектор (`node --inspect`), тож забутий `debugger` у продакшені просто ігнорується. `breakpoint()` у Python спрацьовує завжди: дебагер не підключається ззовні, він запускається всередині процесу й читає команди зі stdin. Звідси і зручність (нічого не треба запускати окремо), і небезпека: забутий `breakpoint()` зупинить сервер або CI-джоб.

Механізм у два кроки. `breakpoint()` викликає `sys.breakpointhook()`. Хук за замовчуванням на кожному виклику читає змінну оточення `PYTHONBREAKPOINT`: порожня означає `pdb.set_trace`, `0` вимикає всі `breakpoint()` у процесі, а будь-який інший рядок трактується як шлях `module.callable`, який треба імпортувати й викликати. Так підключають ipdb (pdb з підсвіткою й автодоповненням IPython) або pudb (повноекранний TUI): `pip install ipdb`, далі `PYTHONBREAKPOINT=ipdb.set_trace python app.py`. Якщо пакет не встановлено, Python не падає, а попереджає й іде далі.

```text
$ PYTHONBREAKPOINT=0 python bp.py
15.5

$ PYTHONBREAKPOINT=ipdb.set_trace python bp.py
bp.py:3: RuntimeWarning: Ignoring unimportable $PYTHONBREAKPOINT: "ipdb.set_trace"
  breakpoint()
15.5
```

Хук можна замінити і з коду: так роблять у тестах, щоб `breakpoint()` нічого не блокував, і так під'єднуються графічні дебагери IDE.

```python live
import sys


def total(prices: list[float]) -> float:
    result = sum(prices)
    breakpoint()
    return round(result, 2)


print(sys.breakpointhook)
sys.breakpointhook = lambda *args, **kwargs: print("breakpoint() called")
print(total([9.99, 0.01, 5.5]))
```

```text
<built-in function breakpointhook>
breakpoint() called
15.5
```

> **Пастка.** Забутий `breakpoint()` у коді, який запускається без термінала. Якщо stdin закритий (CI, cron, `docker run` без `-it`), pdb отримує кінець вводу, виходить і кидає `bdb.BdbQuit`; якщо stdin відкритий, але ніхто не пише (сервер у фоні), процес просто висить. До `breakpoint()` у 3.7 писали `import pdb; pdb.set_trace()`, і цей рядок досі трапляється в старому коді. Обидва варіанти ловить правило ruff `T100` (m0-l04), варто тримати його в `select`.

```text
$ python bp.py < /dev/null
> bp.py(4)total()
-> return round(result, 2)
(Pdb) 
Traceback (most recent call last):
  File "bp.py", line 7, in <module>
    print(total([9.99, 0.01, 5.5]))
          ^^^^^^^^^^^^^^^^^^^^^^^^
  File "bp.py", line 4, in total
    return round(result, 2)
           ^^^^^
  File ".../lib/python3.12/bdb.py", line 100, in trace_dispatch
    return self.dispatch_line(frame)
           ^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/bdb.py", line 125, in dispatch_line
    if self.quitting: raise BdbQuit
                      ^^^^^^^^^^^^^
bdb.BdbQuit
```

```python
import pdb


def total(prices: list[float]) -> float:
    result = sum(prices)
    breakpoint()
    pdb.set_trace()
    return round(result, 2)
```

```text
$ ruff check --select T10 leftover.py
T100 Import for `pdb` found
 --> leftover.py:1:1
  |
1 | import pdb
  | ^^^^^^^^^^

T100 Trace found: `breakpoint` used
 --> leftover.py:6:5
  |
4 | def total(prices: list[float]) -> float:
5 |     result = sum(prices)
6 |     breakpoint()
  |     ^^^^^^^^^^^^
7 |     pdb.set_trace()
8 |     return round(result, 2)
  |

T100 Trace found: `pdb.set_trace` used
 --> leftover.py:7:5
  |
5 |     result = sum(prices)
6 |     breakpoint()
7 |     pdb.set_trace()
  |     ^^^^^^^^^^^^^^^
8 |     return round(result, 2)
  |

Found 3 errors.
```

> **Для капстоуну.** У FastAPI-обробнику `breakpoint()` зупиняє весь потік, а з ним і event loop: поки ви сидите в `(Pdb)`, сервер не відповідає на жоден інший запит. Це той самий ефект, що від будь-якого блокуючого виклику в async-коді (m5-l05). Для дебагу одного запиту це нормально, для навантажувального сценарію ні.

## pdb за 15 хвилин

pdb (Python Debugger, модуль стандартної бібліотеки) керується однолітерними командами. Усе, що не є командою, виконується як Python-вираз у поточному кадрі, тож `len(required)` після `(Pdb)` просто друкує результат. Порожній Enter повторює попередню команду, що зручно для серії `n`. Ось увесь набір, який покриває 95% сесій, з відповідниками в DevTools.

| Команда | Що робить | У DevTools |
|---|---|---|
| `n` (next) | виконати поточний рядок, не заходячи у виклики | Step over |
| `s` (step) | зайти у виклик на поточному рядку | Step into |
| `r` (return) | виконати до виходу з поточної функції | Step out |
| `c` (continue) | виконувати до наступного breakpoint | Resume |
| `l` / `ll` | 11 рядків навколо поточного / вся поточна функція | панель Sources |
| `p expr` / `pp expr` | надрукувати `repr` / `pprint` виразу | Console, hover |
| `w` (where) | стек кадрів, найсвіжіший внизу, як у traceback | Call Stack |
| `u` / `d` (up / down) | перейти на кадр вище (до того, хто викликав) / нижче | клік по кадру в Call Stack |
| `b file:line[, cond]` | поставити breakpoint, опційно з умовою; `b` без аргументів показує список | клік по номеру рядка |
| `q` | вийти з дебагера | Stop |
| `h [команда]` | довідка | |

Баг для сесії: відсоток заповнення форми. Поле `phone` необов'язкове, обидва обов'язкові поля заповнені, тож очікується `100%`, а скрипт друкує `67%`. Винятку немає, traceback нема що читати.

```python
def is_filled(value) -> bool:
    return value not in (None, "")


def completion(fields: list[dict], answers: dict) -> float:
    required = [f for f in fields if f["required"]]
    breakpoint()
    filled = 0
    for field in required:
        if is_filled(answers.get(field["id"])):
            filled += 1
    return filled / len(required)


fields = [
    {"id": "email", "required": True},
    {"id": "phone", "required": "false"},
    {"id": "age", "required": True},
]
answers = {"email": "a@b.c", "age": 30}
print(f"{completion(fields, answers):.0%}")
```

Перша частина сесії: орієнтуємось і крокуємо. `ll` показує функцію зі стрілкою на поточному рядку. `n` і порожній Enter (він повторює попередню команду) доводять до `if`, `p field` показує перше поле, `s` заходить у `is_filled` (pdb друкує `--Call--` на вході у функцію), ще один `n`, і `p value` показує аргумент уже всередині виклику.

```text
$ python stats_bp.py
> stats_bp.py(8)completion()
-> filled = 0
(Pdb) ll
  5  	def completion(fields: list[dict], answers: dict) -> float:
  6  	    required = [f for f in fields if f["required"]]
  7  	    breakpoint()
  8  ->	    filled = 0
  9  	    for field in required:
 10  	        if is_filled(answers.get(field["id"])):
 11  	            filled += 1
 12  	    return filled / len(required)
(Pdb) n
> stats_bp.py(9)completion()
-> for field in required:
(Pdb) 
> stats_bp.py(10)completion()
-> if is_filled(answers.get(field["id"])):
(Pdb) p field
{'id': 'email', 'required': True}
(Pdb) s
--Call--
> stats_bp.py(1)is_filled()
-> def is_filled(value) -> bool:
(Pdb) n
> stats_bp.py(2)is_filled()
-> return value not in (None, "")
(Pdb) p value
'a@b.c'
```

Друга частина тієї ж сесії: рухаємося стеком і знаходимо баг. `w` друкує стек у тому ж порядку, що traceback, а `>` позначає поточний кадр. `u` переносить контекст у кадр `completion`, не виконуючи жодного рядка: тепер `p` бачить локальні змінні викликача. `d` повертає назад, `r` доводить `is_filled` до кінця і показує повернуте значення `->True`. Повернувшись у `completion`, порівнюємо знаменник з очікуванням: обов'язкових полів має бути два, а `len(required)` дає три. `pp required` показує причину: `"false"` з JSON-конфігу прийшов рядком, а непорожній рядок істинний, у Python так само, як у JS.

```text
(Pdb) w
  stats_bp.py(21)<module>()
-> print(f"{completion(fields, answers):.0%}")
  stats_bp.py(10)completion()
-> if is_filled(answers.get(field["id"])):
> stats_bp.py(2)is_filled()
-> return value not in (None, "")
(Pdb) u
> stats_bp.py(10)completion()
-> if is_filled(answers.get(field["id"])):
(Pdb) p field["id"], filled
('email', 0)
(Pdb) d
> stats_bp.py(2)is_filled()
-> return value not in (None, "")
(Pdb) r
--Return--
> stats_bp.py(2)is_filled()->True
-> return value not in (None, "")
(Pdb) n
> stats_bp.py(11)completion()
-> filled += 1
(Pdb) n
> stats_bp.py(9)completion()
-> for field in required:
(Pdb) len(required)
3
(Pdb) pp required
[{'id': 'email', 'required': True},
 {'id': 'phone', 'required': 'false'},
 {'id': 'age', 'required': True}]
(Pdb) q
Traceback (most recent call last):
  File "stats_bp.py", line 21, in <module>
    print(f"{completion(fields, answers):.0%}")
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "stats_bp.py", line 9, in completion
    for field in required:
                 ^^^^^^^^
  File ".../lib/python3.12/bdb.py", line 100, in trace_dispatch
    return self.dispatch_line(frame)
           ^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/bdb.py", line 125, in dispatch_line
    if self.quitting: raise BdbQuit
                      ^^^^^^^^^^^^^
bdb.BdbQuit
```

Виправлення в місці, де значення стало поганим, тобто у фільтрі. У капстоуні конфіг валідуватиме Pydantic (m2-l09), який або перетворить `"false"` на `False`, або в strict-режимі відхилить його ще на вході.

```python
    required = [f for f in fields if f["required"] is True]
```

```text
100%
```

> **Пастка.** `q` у сесії, відкритій через `breakpoint()`, не "відпускає" програму, а вбиває її через `bdb.BdbQuit`, як видно вище. Щоб програма відпрацювала до кінця, виходьте через `c`. Під `python -m pdb` навпаки, `q` завершує сесію чисто.

Без правки коду дебагер запускають як модуль: `python -m pdb script.py` зупиняється перед першим рядком скрипта. Далі breakpoint ставлять командою `b`: за номером рядка, за `файл:рядок` або за ім'ям функції, і з умовою після коми, як conditional breakpoint у DevTools. Тут умова пропускає `email` і зупиняє лише на полі `phone`.

```text
$ python -m pdb stats.py
> stats.py(1)<module>()
-> def is_filled(value) -> bool:
(Pdb) l
  1  ->	def is_filled(value) -> bool:
  2  	    return value not in (None, "")
  3  	
  4  	
  5  	def completion(fields: list[dict], answers: dict) -> float:
  6  	    required = [f for f in fields if f["required"]]
  7  	    filled = 0
  8  	    for field in required:
  9  	        if is_filled(answers.get(field["id"])):
 10  	            filled += 1
 11  	    return filled / len(required)
(Pdb) b stats.py:9, field["id"] == "phone"
Breakpoint 1 at stats.py:9
(Pdb) b
Num Type         Disp Enb   Where
1   breakpoint   keep yes   at stats.py:9
	stop only if field["id"] == "phone"
(Pdb) c
> stats.py(9)completion()
-> if is_filled(answers.get(field["id"])):
(Pdb) p field
{'id': 'phone', 'required': 'false'}
(Pdb) p answers.get(field["id"])
None
```

`h` без аргументів показує всі команди, `h команда` довідку по одній. Продовження тієї ж сесії; зверніть увагу на текст довідки `w`: "most recent frame at the bottom", той самий порядок, що в traceback.

```text
(Pdb) h

Documented commands (type help <topic>):
========================================
EOF    c          d        h         list      q        rv       undisplay
a      cl         debug    help      ll        quit     s        unt      
alias  clear      disable  ignore    longlist  r        source   until    
args   commands   display  interact  n         restart  step     up       
b      condition  down     j         next      return   tbreak   w        
break  cont       enable   jump      p         retval   u        whatis   
bt     continue   exit     l         pp        run      unalias  where    

Miscellaneous help topics:
==========================
exec  pdb

(Pdb) h w
      Usage: w(here)
      
      Print a stack trace, with the most recent frame at the bottom.
      An arrow indicates the "current frame", which determines the
      context of most commands.  'bt' is an alias for this command.
(Pdb) q
```

> **Пастка.** Змінна з ім'ям команди. Якщо в коді є `n`, `c`, `s`, `l` або `p`, то набране `n` це крок, а не друк змінної. Для читання пишіть `p n`, для присвоєння префікс `!`, який означає "це Python, а не команда". Присвоєння змінює стан програми, що зручно, щоб перевірити гіпотезу без перезапуску.

```python
def page_count(total: int, size: int) -> int:
    n = total // size
    breakpoint()
    extra = total % size > 0
    return n + extra


print(page_count(7, 3))
```

```text
$ python pages.py
> pages.py(4)page_count()
-> extra = total % size > 0
(Pdb) n
> pages.py(5)page_count()
-> return n + extra
(Pdb) p n
2
(Pdb) !n = 10
(Pdb) c
11
```

> **Пастка.** Шлях у `b файл:рядок` pdb шукає відносно `sys.path`, тобто папки скрипта, а не поточної директорії термінала. Запуск з кореня проєкту `python -m pdb practice/m0-l05/discount.py` і команда `b practice/m0-l05/discount.py:21` дають `*** 'practice/m0-l05/discount.py' not found from sys.path`. Пишіть `b discount.py:21` або `b 21` для поточного файлу.

pdb читає команди зі stdin, тому сесію можна записати у файл або передати через pipe і відтворити без людини. Команди тоді не відлунюються в терміналі, у виводі видно лише запрошення й відповіді. Так перевіряється і проєктне завдання нижче.

```text
$ printf 'b 9\nc\np filled, field\nc\np filled, field\nq\n' | python -m pdb stats.py
> stats.py(1)<module>()
-> def is_filled(value) -> bool:
(Pdb) Breakpoint 1 at stats.py:9
(Pdb) > stats.py(9)completion()
-> if is_filled(answers.get(field["id"])):
(Pdb) (0, {'id': 'email', 'required': True})
(Pdb) > stats.py(9)completion()
-> if is_filled(answers.get(field["id"])):
(Pdb) (1, {'id': 'phone', 'required': 'false'})
(Pdb) 
```

<!-- task: p1 -->

## Post-mortem: огляд стану після падіння

Post-mortem debugging (офіційний термін документації pdb) означає відкрити дебагер у кадрі, де виняток уже стався, з усіма локальними змінними на момент падіння. Ставити breakpoint заздалегідь не треба. Найпростіший спосіб: запустити скрипт під `python -m pdb` і одразу `c`. Коли виняток долітає до верху, pdb друкує traceback (з кількома власними кадрами зверху) і зупиняється в найглибшому кадрі; `u` і `p` працюють як зазвичай.

```text
$ python -m pdb app.py
> app.py(1)<module>()
-> def render_field(field: dict) -> str:
(Pdb) c
Traceback (most recent call last):
  File ".../lib/python3.12/pdb.py", line 1960, in main
    pdb._run(target)
  File ".../lib/python3.12/pdb.py", line 1754, in _run
    self.run(target.code)
  File ".../lib/python3.12/bdb.py", line 627, in run
    exec(cmd, globals, locals)
  File "<string>", line 1, in <module>
  File "app.py", line 14, in <module>
    print(render_page(page))
          ^^^^^^^^^^^^^^^^^
  File "app.py", line 9, in render_page
    html.append(render_field(field))
                ^^^^^^^^^^^^^^^^^^^
  File "app.py", line 2, in render_field
    label = field["label"].strip()
            ^^^^^^^^^^^^^^^^^^^^
AttributeError: 'NoneType' object has no attribute 'strip'
Uncaught exception. Entering post mortem debugging
Running 'cont' or 'step' will restart the program
> app.py(2)render_field()
-> label = field["label"].strip()
(Pdb) p field
{'label': None}
(Pdb) u
> app.py(9)render_page()
-> html.append(render_field(field))
(Pdb) p html, field
(['<label>Email</label>'], {'label': None})
(Pdb) q
Post mortem debugger finished. The app.py will be restarted
> app.py(1)<module>()
-> def render_field(field: dict) -> str:
(Pdb) q
```

`p html` у кадрі `render_page` показує те, чого traceback не показав: перше поле оброблено успішно, впало друге. Другий спосіб для тих, хто не хоче одразу дебагер: `python -i script.py` (m0-l03) після падіння залишає вас у REPL з глобальними змінними скрипта, а `pdb.pm()` відкриває post-mortem на останньому винятку. З 3.12 сам виняток лежить у `sys.last_exc`.

```text
$ python -i app.py
Traceback (most recent call last):
  File "app.py", line 14, in <module>
    print(render_page(page))
          ^^^^^^^^^^^^^^^^^
  File "app.py", line 9, in render_page
    html.append(render_field(field))
                ^^^^^^^^^^^^^^^^^^^
  File "app.py", line 2, in render_field
    label = field["label"].strip()
            ^^^^^^^^^^^^^^^^^^^^
AttributeError: 'NoneType' object has no attribute 'strip'
>>> page["fields"][1]
{'label': None}
>>> import pdb; pdb.pm()
> app.py(2)render_field()
-> label = field["label"].strip()
(Pdb) p field
{'label': None}
(Pdb) q
>>> import sys; sys.last_exc
AttributeError("'NoneType' object has no attribute 'strip'")
>>> exit()
```

> **Під капотом.** Post-mortem можливий тому, що об'єкт винятку тримає посилання на traceback-об'єкт (`e.__traceback__`; атрибути з подвійним підкресленням спільнота називає dunder, це жаргон, у документації "special attributes"). Traceback це зв'язаний список вузлів `tb_next`, і кожен вузол тримає живий кадр з його `f_locals`. Поки виняток існує, локальні змінні всіх кадрів не звільняються. pdb лише ходить цим списком; те саме можна зробити руками.

```python live
def render_field(field: dict) -> str:
    label = field["label"].strip()
    return label


def render_page(page: dict) -> list[str]:
    html = []
    for field in page["fields"]:
        html.append(render_field(field))
    return html


try:
    render_page({"fields": [{"label": " Email "}, {"label": None}]})
except AttributeError as e:
    tb = e.__traceback__.tb_next
    while tb is not None:
        frame = tb.tb_frame
        print(frame.f_code.co_name, tb.tb_lineno, frame.f_locals)
        tb = tb.tb_next
```

```text
render_page 9 {'page': {'fields': [{'label': ' Email '}, {'label': None}]}, 'html': ['Email'], 'field': {'label': None}}
render_field 2 {'field': {'label': None}}
```

## Без падіння: `traceback`, `logging.exception` і warnings

Коли виняток перехоплено, traceback за замовчуванням зникає разом з ним. Щоб обробити помилку й продовжити, але не втратити стек, є модуль `traceback`. `traceback.print_exc()` усередині `except` друкує в stderr той самий текст, який Python надрукував би при падінні, і програма йде далі.

```python
import json
import traceback

configs = ['{"title": "Signup"}', '{"title": }', '{"title": "Survey"}']

for raw in configs:
    try:
        print("loaded:", json.loads(raw)["title"])
    except json.JSONDecodeError:
        traceback.print_exc()
print("done")
```

```text
loaded: Signup
Traceback (most recent call last):
  File "tb1.py", line 8, in <module>
    print("loaded:", json.loads(raw)["title"])
                     ^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 338, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 356, in raw_decode
    raise JSONDecodeError("Expecting value", s, err.value) from None
json.decoder.JSONDecodeError: Expecting value: line 1 column 11 (char 10)
loaded: Survey
done
```

`traceback.format_exc()` повертає той самий текст рядком, щоб покласти в лог, у відповідь API для dev-режиму або в поле помилки задачі. `format_exception_only(e)` дає лише останній рядок без кадрів, `extract_tb(e.__traceback__)` повертає кадри як об'єкти з `name`, `lineno`, `filename`, без розбору тексту регулярками.

```python
import json
import traceback

try:
    json.loads('{"title": }')
except json.JSONDecodeError as e:
    text = traceback.format_exc()
    print(type(text), len(text.splitlines()), "lines")
    print(text.splitlines()[-1])
    print(traceback.format_exception_only(e))
    frame = traceback.extract_tb(e.__traceback__)[-1]
    print(frame.name, frame.lineno)
```

```text
<class 'str'> 12 lines
json.decoder.JSONDecodeError: Expecting value: line 1 column 11 (char 10)
['json.decoder.JSONDecodeError: Expecting value: line 1 column 11 (char 10)\n']
raw_decode 356
```

У робочому коді замість `print_exc` пишуть `log.exception("...")` усередині `except`: це запис рівня `ERROR`, до якого logging сам додає повний traceback. Налаштування logging, рівні й формат детально в m5-l09.

```python
import json
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("formbuilder.loader")

try:
    json.loads('{"title": }')
except json.JSONDecodeError:
    log.exception("config rejected")
print("still running")
```

```text
ERROR formbuilder.loader: config rejected
Traceback (most recent call last):
  File "tb3.py", line 8, in <module>
    json.loads('{"title": }')
  File ".../lib/python3.12/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 338, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 356, in raw_decode
    raise JSONDecodeError("Expecting value", s, err.value) from None
json.decoder.JSONDecodeError: Expecting value: line 1 column 11 (char 10)
still running
```

> **Для капстоуну.** Воркер генерації в капстоуні обробляє задачі в циклі, і одна зламана задача не має зупиняти решту. Шаблон саме цей: `except Exception` навколо однієї задачі, `log.exception(...)` для стеку в логах, `traceback.format_exception_only(e)` для короткого тексту в статусі задачі, який побачить клієнт.

<!-- task: q5 -->

Warnings (модуль `warnings`) це повідомлення "працює, але так не треба", які не зупиняють програму. Найважливіші два класи. `DeprecationWarning` каже, що API буде видалено: наприклад, `datetime.utcnow()` застарів у 3.12. `RuntimeWarning` каже про підозрілу поведінку під час виконання, класичний випадок в asyncio це корутина, яку викликали без `await`. Python фільтрує warnings за правилами, і за замовчуванням `DeprecationWarning` показується лише тоді, коли його спричинив код у `__main__`, тобто ваш скрипт. Той самий виклик усередині імпортованого модуля мовчить.

```python
import warnings

print(*warnings.filters[:5], sep="\n")
```

```text
('default', None, <class 'DeprecationWarning'>, '__main__', 0)
('ignore', None, <class 'DeprecationWarning'>, None, 0)
('ignore', None, <class 'PendingDeprecationWarning'>, None, 0)
('ignore', None, <class 'ImportWarning'>, None, 0)
('ignore', None, <class 'ResourceWarning'>, None, 0)
```

Перше правило показує `DeprecationWarning`, спричинений кодом з `__main__`, друге ігнорує його в усіх інших модулях. Перевірка: функція з `utcnow()` у модулі `legacy.py` і такий самий виклик прямо в скрипті `w_main.py`; у виводі лише попередження з рядка 6 скрипта.

```python
from datetime import datetime


def build_stamp() -> str:
    return datetime.utcnow().strftime("%Y")
```

```python
from datetime import datetime

from legacy import build_stamp

print(build_stamp())
print(datetime.utcnow().strftime("%Y"))
```

```text
$ python w_main.py
2026
w_main.py:6: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  print(datetime.utcnow().strftime("%Y"))
2026
```

Логіка фільтра: deprecation-попередження адресовані розробнику, який може виправити код, а не користувачу бібліотеки, який її лише запускає. Наслідок для вас: застарілі виклики у ваших модулях (не в головному скрипті) не видно, доки API не зникне в наступній версії. Увімкнути показ можна прапорцем `-W` або змінною `PYTHONWARNINGS` (m0-l03) з тим самим синтаксисом `дія::Категорія`: `default` показує кожне попередження один раз на місце виклику, `error` перетворює його на виняток з traceback, що зручно в CI. `-X dev` (dev mode) вмикає показ усіх warnings разом з додатковими перевірками.

```text
$ python -W default w_main.py
legacy.py:5: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  return datetime.utcnow().strftime("%Y")
2026
w_main.py:6: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  print(datetime.utcnow().strftime("%Y"))
2026

$ PYTHONWARNINGS=error::DeprecationWarning python w_main.py
Traceback (most recent call last):
  File "w_main.py", line 5, in <module>
    print(build_stamp())
          ^^^^^^^^^^^^^
  File "legacy.py", line 5, in build_stamp
    return datetime.utcnow().strftime("%Y")
           ^^^^^^^^^^^^^^^^^
DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).

$ python -X dev w_main.py
legacy.py:5: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  return datetime.utcnow().strftime("%Y")
2026
w_main.py:6: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  print(datetime.utcnow().strftime("%Y"))
2026
```

`RuntimeWarning` за замовчуванням видно. Корутина (coroutine, офіційний термін; детально в m5-l05), викликана без `await`, нічого не виконує, а попередження з'являється в момент знищення невикористаного об'єкта корутини; у CPython це відбувається одразу, щойно на нього не лишилось посилань, тому рядок стоїть перед `main done`. Це аналог промісу, який створили й забули, тільки в JS проміс хоча б почав виконуватись, а тут тіло функції не стартувало взагалі.

```python
import asyncio


async def render(page: str) -> str:
    await asyncio.sleep(0)
    return f"<h1>{page}</h1>"


async def main() -> None:
    render("signup")
    print("main done")


asyncio.run(main())
```

```text
$ python w_async.py
w_async.py:10: RuntimeWarning: coroutine 'render' was never awaited
  render("signup")
RuntimeWarning: Enable tracemalloc to get the object allocation traceback
main done
```

> **Пастка.** `-W error` не робить це попередження винятком у вашому коді. Воно виникає у фіналізаторі об'єкта корутини, звідки виняток кинути нікуди, тому Python лише друкує "Exception ignored in" і продовжує. Для корутин без `await` надійніший захист статичний: mypy (m2-l08) ловить їх ще до запуску правилом `unused-coroutine`, увімкненим за замовчуванням.

```text
$ python -W error w_async.py
Exception ignored in: <coroutine object render at 0x10338de40>
Traceback (most recent call last):
  File ".../lib/python3.12/warnings.py", line 555, in _warn_unawaited_coroutine
    warn(msg, category=RuntimeWarning, stacklevel=2, source=coro)
RuntimeWarning: coroutine 'render' was never awaited
main done
```

```text
$ mypy w_async.py
w_async.py:10: error: Value of type "Coroutine[Any, Any, str]" must be used  [unused-coroutine]
w_async.py:10: note: Are you missing an await?
Found 1 error in 1 file (checked 1 source file)
```

pytest (m3-l03) за замовчуванням збирає всі warnings, які виникли під час тестів, включно з `DeprecationWarning` з ваших модулів, і друкує їх окремим блоком у кінці прогону. Тому тести це місце, де застарілі виклики зазвичай помічають уперше. Тест `test_legacy.py` поруч із `legacy.py`:

```python
from legacy import build_stamp


def test_stamp():
    assert build_stamp()
```

```text
$ pytest -q
.                                                                        [100%]
=============================== warnings summary ===============================
test_legacy.py::test_stamp
  legacy.py:5: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    return datetime.utcnow().strftime("%Y")

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
1 passed, 1 warning in 0.00s
```

## Графічний дебагер: VS Code, PyCharm і debugpy

У VS Code дебаг Python дає розширення Python Debugger, конфігурація лежить у `.vscode/launch.json`, як і для Node. Тип конфігурації `debugpy`; запустити можна файл (`program`) або модуль (`module`, еквівалент `python -m`). Breakpoint ставиться кліком по номеру рядка, а `breakpoint()` у коді під дебагером IDE теж зупиняє в IDE, бо дебагер підміняє `sys.breakpointhook` тим самим механізмом, що в розділі вище.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: current file",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "console": "integratedTerminal",
      "justMyCode": true
    },
    {
      "name": "Python: module with args",
      "type": "debugpy",
      "request": "launch",
      "module": "formbuilder",
      "args": ["build", "config.json"],
      "cwd": "${workspaceFolder}",
      "justMyCode": false
    }
  ]
}
```

`justMyCode` (за замовчуванням `true`) означає: крокування не заходить у stdlib і `site-packages`, а зупинки на винятках обмежені вашим кодом. pdb такого фільтра за замовчуванням не має: `s` на рядку з `json.loads` веде прямо в `json/__init__.py`. Це корисно, коли ви підозрюєте бібліотеку або хочете зрозуміти, як вона працює; у VS Code для цього ставлять `"justMyCode": false`.

```text
$ python into_lib.py
> into_lib.py(6)load()
-> data = json.loads(raw)
(Pdb) s
--Call--
> .../lib/python3.12/json/__init__.py(299)loads()
-> def loads(s, *, cls=None, object_hook=None, parse_float=None,
(Pdb) s
> .../lib/python3.12/json/__init__.py(333)loads()
-> if isinstance(s, str):
(Pdb) w
  into_lib.py(10)<module>()
-> print(load('{"title": "Signup"}'))
  into_lib.py(6)load()
-> data = json.loads(raw)
> .../lib/python3.12/json/__init__.py(333)loads()
-> if isinstance(s, str):
(Pdb) c
{'title': 'Signup'}
```

Графічний дебагер зручніший, коли треба тримати перед очима багато змінних одночасно, дивитись watch-вирази на кожному кроці, ставити breakpoints у кількох файлах і дебажити сервер, якому ви шлете запити з браузера чи Postman. pdb зручніший там, де IDE немає або вона далеко: SSH на сервер, контейнер, CI, або швидка перевірка однієї гіпотези, де `breakpoint()` і два `p` швидші за налаштування конфігурації. PyCharm має власний дебагер з тими самими можливостями, конфігурується через Run/Debug Configurations у GUI замість JSON.

debugpy це реалізація протоколу Debug Adapter Protocol для Python, яку VS Code запускає під капотом; її ж можна запустити в процесі в Docker-контейнері, щоб IDE на хості під'єдналася до нього по порту, як `node --inspect` з attach.

> **Для капстоуну.** Для FastAPI у m7 знадобиться друга конфігурація з `"module": "uvicorn"` і `"justMyCode": false`, щоб крокувати в код FastAPI і Pydantic, коли незрозуміло, чому валідація відхиляє запит.

## Типові помилки JS-розробника

1. **Читати traceback зверху, як стек у JS.** Перший рядок це точка входу `<module>`, найменш інформативне місце. Правильно: останній рядок (тип і повідомлення), потім останній кадр з вашого коду, потім вгору.

   ```text
   Traceback (most recent call last):
     File "app.py", line 14, in <module>
       print(render_page(page))
             ^^^^^^^^^^^^^^^^^
     File "app.py", line 9, in render_page
       html.append(render_field(field))
                   ^^^^^^^^^^^^^^^^^^^
     File "app.py", line 2, in render_field
       label = field["label"].strip()
               ^^^^^^^^^^^^^^^^^^^^
   AttributeError: 'NoneType' object has no attribute 'strip'
   ```

2. **Лагодити останній кадр.** Додають `if total == 0: return 0` туди, де впало, хоча помилка в аргументах, переданих кадром вище. Правильно: з'ясувати, звідки прийшло погане значення, і виправити там.

   ```python
   return percent(len(fields), filled)   # баг: аргументи переставлені
   return percent(filled, len(fields))   # виправлення у викликача
   ```

3. **`print(obj)` з очікуванням розгорнутого об'єкта, як `console.log`.** Для власного класу виходить адреса в пам'яті. Правильно: `vars(obj)`, `pprint`, а в довгостроковій перспективі `@dataclass` або `__repr__`.

   ```python
   print(field)        # <__main__.Field object at 0x104a85280>
   print(vars(field))  # {'field_id': 'email', 'required': True}
   ```

4. **`breakpoint()` як `debugger;`, який сам зникне без DevTools.** Він спрацьовує завжди: сервер висить на `(Pdb)`, CI падає з `BdbQuit`. Правильно: ruff з `T100` у `select`, а для тимчасового вимкнення всіх зупинок `PYTHONBREAKPOINT=0`.

   ```text
   $ PYTHONBREAKPOINT=0 python bp.py
   15.5
   ```

5. **Набрати в pdb ім'я змінної, яке збігається з командою.** `n`, `c`, `s`, `l`, `p` виконуються як команди. Правильно: `p n` для читання, `!n = 10` для присвоєння.

   ```text
   (Pdb) p n
   2
   ```

6. **`q`, щоб "відпустити" програму після `breakpoint()`.** `q` завершує програму через `BdbQuit`. Правильно: `c`.

   ```text
   (Pdb) c
   15.5
   ```

7. **Шукати source maps і довіряти рядку в traceback після правки файлу.** Python виконує вихідний `.py`, а текст рядка читає з диска в момент друку. Якщо файл змінили після старту процесу, номер рядка правильний, а текст новий. Правильно: перезапустити процес, перш ніж читати traceback.

   ```text
     File "rules.py", line 2, in check
       def check(value: str) -> None:
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ValueError: bad value: 'x'
   ```

8. **Чекати, що застарілі API покаже консоль, як React dev-попередження.** `DeprecationWarning` з імпортованих модулів за замовчуванням вимкнено. Правильно: `-W default` локально, `PYTHONWARNINGS=error::DeprecationWarning` у CI, і читати блок warnings у звіті pytest.

   ```text
   $ python -W default w_main.py
   legacy.py:5: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
     return datetime.utcnow().strftime("%Y")
   ```

## Підсумок

- Traceback читається знизу: останній рядок це тип і повідомлення, над ним кадри від точки входу до місця падіння. У JS навпаки.
- Шукайте останній кадр з вашого коду; кадри з `lib/python3.12` і `site-packages` майже ніколи не містять бага.
- Місце падіння не завжди місце бага, а функцій, що вже повернулись, у traceback немає зовсім.
- У ланцюжку винятків найнижчий виняток зупинив програму, над фразою-розділювачем його причина; глибина в m1-l11.
- 3.10–3.12 підказують імена ("Did you mean", забутий `import`, `self.`), а стрілки `~~~^^^` показують точний підвираз.
- `f"{x=}"` друкує вираз і `repr`; `repr` розрізняє `"30"` і `30`; `pprint(..., sort_dicts=False)` для конфігів.
- `breakpoint()` викликає `sys.breakpointhook`, керується `PYTHONBREAKPOINT` (`0` вимикає, `module.callable` підміняє) і спрацьовує завжди, на відміну від `debugger;`.
- pdb: `n`/`s`/`r`/`c` для руху, `p`/`pp` для значень, `w`/`u`/`d` для стеку, `b файл:рядок, умова` для зупинок; виходити з `breakpoint()` через `c`, а не `q`.
- Post-mortem: `python -m pdb script.py` + `c`, або `python -i script.py` + `pdb.pm()`; кадри з локальними змінними тримає `e.__traceback__`.
- Перехоплений виняток зі стеком: `traceback.format_exc()` або `log.exception()`; `DeprecationWarning` за межами `__main__` прихований, вмикається через `-W` і `PYTHONWARNINGS`.

## Що далі

Наступний урок m0-l06 збирає структуру проєкту: src-layout, `tests/`, точку входу через `python -m formbuilder`. Там знадобиться з цього уроку те, що pdb шукає файл у `b` відносно `sys.path`, і конфігурація `"module"` у `launch.json` для запуску пакета під дебагером. Винятки як механізм, з `raise from`, ієрархією і власними класами, розбирає m1-l11, а logging з рівнями й форматом m5-l09.
