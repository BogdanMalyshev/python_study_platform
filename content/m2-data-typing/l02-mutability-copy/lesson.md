---
id: m2-l02
module: m2-data-typing
title: "Змінюваність, aliasing, copy і deepcopy"
summary: "Учень бачить за кожним присвоєнням прив'язку імені до об'єкта, розрізняє мутацію й переприсвоєння, знаходить спільні внутрішні об'єкти через is, свідомо обирає між поверхневою копією, deepcopy і незмінними типами та пише етапи обробки конфігу, які не псують вхідні дані."
duration_min: 75
prerequisites: [m2-l01]
---

## Ім'я прив'язане до об'єкта, присвоєння не копіює

Змінна в Python не коробка зі значенням, а ім'я, прив'язане до об'єкта, який живе окремо від неї. Документація називає це name binding (офіційний термін з розділу Execution model): присвоєння обчислює праву частину, отримує об'єкт і прив'язує до нього ім'я зліва. `b = a` нічого не створює і нічого не копіює: праворуч стоїть ім'я, його значення це вже наявний об'єкт, і до нього прив'язується друге ім'я. Ситуацію "кілька імен на один об'єкт" називають aliasing (термін з офіційного туторіалу Python, загальний для теорії мов). Ви бачили її у m1-l01 (`a = b = []`), m1-l03 (`is`) і m1-l07 (передача аргументів); тут модель цілком.

```ts
const a = { tags: ["x"] };
const b = a;
b.tags.push("y");
console.log(a.tags, a === b); // [ 'x', 'y' ] true

let n = 300;
let m = n;
n += 1;
console.log(n, m); // 301 300
```

```python
a = {"tags": ["x"]}
b = a
b["tags"].append("y")
print(a["tags"], a is b)

n = 300
m = n
print(m is n)
n += 1
print(n, m, m is n)
```

```text
['x', 'y'] True
True
301 300 False
```

Для словника поведінка збігається з JS повністю. Розходження в другій половині: у JS про `let m = n` кажуть "число скопіювалось", а в Python `m is n` дає `True`, тобто обидва імені дивляться на той самий об'єкт `300`. Копії не було, і вона не потрібна: `int` змінити неможливо, тож `n += 1` не чіпає об'єкт, а прив'язує `n` до нового. Правило "примітиви за значенням, об'єкти за посиланням" у Python зайве. Присвоєння завжди прив'язує ім'я до об'єкта; типи відрізняються лише тим, чи можна змінити сам об'єкт.

Перевіряють це двома інструментами з m1-l03. `id(x)` повертає identity об'єкта (офіційний термін: кожен об'єкт має identity, тип і значення), ціле число, унікальне серед живих об'єктів. `a is b` означає рівно `id(a) == id(b)`. Самі числа `id` різні між запусками, тому в коді корисне не значення, а порівняння: "це той самий об'єкт чи ні".

```python
a = [1]
b = a
print(id(a) == id(b), a is b)
print(id([]) == id([]), [] is [])
```

```text
True True
True False
```

Другий рядок показує, чому `id` порівнюють лише для живих об'єктів. `id([]) == id([])` дає `True`, хоча списків два: перший знищено одразу після виклику `id`, і його адресу отримав другий. `[] is []` чесно каже `False`, бо обидва операнди живі під час порівняння. Тому в коді й у тестах пишуть `a is b`, а не зберігають `id` у змінну, щоб порівняти пізніше.

З моделі випливає розрізнення, на якому тримається весь урок. Переприсвоєння (`x = ...`) змінює, на що дивиться ім'я, і не чіпає об'єкт. Мутація (`x.append(...)`, `x[k] = v`, `x.attr = v`, `del x[k]`) змінює сам об'єкт, і її бачать усі імена, що на нього дивляться. У коді обидві операції містять `=`, тому їх легко сплутати.

```python live
config = {"title": "Signup"}
alias = config

alias["title"] = "Login"
print(config, alias is config)

alias = {"title": "Other"}
print(config, alias is config)
```

```text
{'title': 'Login'} True
{'title': 'Login'} False
```

> **Під капотом.** Ім'я на рівні модуля це буквально ключ у словнику `globals()`, а значення за цим ключем це посилання на об'єкт. Присвоєння записує в словник нове посилання і тому не може змінити сам об'єкт. Локальні імена функції зберігаються ефективніше, у масиві слотів кадру, але семантика та сама: ім'я тримає посилання, і більше нічого.

```python
x = [1, 2]
print(globals()["x"] is x)
globals()["x"] = "rebound"
print(x)
```

```text
True
rebound
```

<!-- task: q1 -->

## Незмінні й змінювані типи: що насправді робить `+=`

Незмінні (immutable, офіційний термін) вбудовані типи: `int`, `float`, `bool`, `str`, `bytes`, `tuple`, `frozenset`, `None`. Змінювані (mutable): `list`, `dict`, `set`, `bytearray` і екземпляри звичайних класів. У незмінного об'єкта немає жодної операції, що змінила б його на місці: кожен метод повертає новий об'єкт. Ідея вже була в m1-l02; тут механізм, на якому вона ламає інтуїцію.

`x += y` це augmented assignment (офіційна назва, розділ "Augmented assignment statements" у Language Reference). Він виконується в два кроки. Перший: інтерпретатор шукає в типу `x` метод `__iadd__` (in-place add; методи з подвійним підкресленням у спільноті називають dunder, жаргон від double underscore, офіційно special methods). Якщо метод є, викликається він, якщо ні, обчислюється звичайне `x + y`. Другий крок однаковий завжди: результат присвоюється назад у `x`. У `list` є `__iadd__`, він розширює список на місці й повертає той самий список. У `int`, `str` і `tuple` його немає, тож `+=` будує новий об'єкт.

```python live
print(hasattr(list, "__iadd__"), hasattr(int, "__iadd__"), hasattr(str, "__iadd__"), hasattr(tuple, "__iadd__"))

n = 1000
n_before = n
n += 1
print(n, n is n_before)

items = [1, 2]
items_before = items
items += [3]
print(items, items is items_before)

items = items + [4]
print(items, items is items_before, items_before)
```

```text
True False False False
1001 False
[1, 2, 3] True
[1, 2, 3, 4] False [1, 2, 3]
```

Останні два рядки це різниця, яку m1-l07 показував на параметрах функції: `+` будує новий список завжди, `+=` для списку мутує. Обидва кроки `+=` можна виконати руками, і видно, що присвоєння відбувається навіть тоді, коли воно нічого не змінює: `__iadd__` повертає `self`, і ім'я прив'язується до того самого об'єкта, на який і так дивилося.

```python
items = [1]
result = items.__iadd__([2])
print(result is items, items)
items = result
```

```text
True [1, 2]
```

Рядки підкоряються тим самим правилам, що й числа. Кожна операція над `str` повертає новий об'єкт, `s += "x"` прив'язує `s` до нового рядка, а інше ім'я лишається на старому. Чому `+=` у циклі для рядків все одно працює швидко в CPython і чому ідіоматичний `join`, розібрано в m1-l04.

```python
s = "form"
t = s
s += "_v2"
print(s, t, s is t)
print(s.upper(), s)
```

```text
form_v2 form False
FORM_V2 form_v2
```

> **Пастка.** `is` на рядках і числах відповідає не на питання "чи рівні", а на питання "чи вирішив інтерпретатор тримати один екземпляр". Для коротких рядків-літералів CPython робить інтернування (interning, детально в m1-l03), для зібраних під час виконання ні. Це деталь реалізації, і модель aliasing на неї не спирається: для незмінних об'єктів спільний екземпляр нічим не загрожує, бо змінити його ніхто не може.

```python
a = "email"
b = "".join(["em", "ail"])
print(a == b, a is b)
```

```text
True False
```

## `+=` на кортежі зі списком: помилка, яка все одно змінює дані

Кортеж незмінний: у ньому не можна замінити, додати чи прибрати елемент. Але кортеж зберігає посилання, і незмінність стосується лише їх. Об'єкт, на який дивиться посилання, може бути змінюваним і змінюватися далі. Незмінність у Python неглибока (shallow), рівно як `Object.freeze` у JS, про що нижче.

```python
t = ([1], 2)
t[0].append(9)
print(t)
t[0] = [0]
```

```text
([1, 9], 2)
Traceback (most recent call last):
  File "example.py", line 4, in <module>
    t[0] = [0]
    ~^^^
TypeError: 'tuple' object does not support item assignment
```

Тепер обидва механізми разом. `t[0] += [3]` кидає `TypeError`, і це очікувано. Неочікувано інше: після помилки список усередині вже змінений.

```python live
t = ([1], 2)
try:
    t[0] += [3]
except TypeError as e:
    print("TypeError:", e)
print(t)
```

```text
TypeError: 'tuple' object does not support item assignment
([1, 3], 2)
```

Пояснення в двох кроках `+=`. Вираз розгортається в `tmp = t[0]`, потім `tmp = tmp.__iadd__([3])`, потім `t[0] = tmp`. Перший крок дістає список, другий розширює його на місці, і це успішно, бо список змінюваний. Третій крок записує результат назад у кортеж, і тут `TypeError`. На момент винятку мутація вже сталась, а Python нічого не відкочує. Офіційний FAQ розбирає саме цей випадок під назвою "Why does a_tuple[i] += ['item'] raise an exception when the addition works?".

> **Під капотом.** Байткод показує обидва кроки окремими інструкціями: `BINARY_OP 13 (+=)` викликає `__iadd__` на списку, а `STORE_SUBSCR` намагається записати результат у кортеж. Між ними немає нічого, що могло б відкотити першу.

```python
import dis

dis.dis("t[0] += [3]")
```

```text
  0           0 RESUME                   0

  1           2 LOAD_NAME                0 (t)
              4 LOAD_CONST               0 (0)
              6 COPY                     2
              8 COPY                     2
             10 BINARY_SUBSCR
             14 LOAD_CONST               1 (3)
             16 BUILD_LIST               1
             18 BINARY_OP               13 (+=)
             22 SWAP                     3
             24 SWAP                     2
             26 STORE_SUBSCR
             30 RETURN_CONST             2 (None)
```

Якщо список у кортежі справді треба змінити, це робиться методом без присвоєння: `t[0].extend([3])` мутує список і не торкається кортежу, тож помилки немає. Але правильніше питання інше: навіщо змінюваний список у структурі, яку ви оголосили незмінною.

Неглибока незмінність має ще один наслідок, hashability. Hashable (офіційний термін з глосарію) це об'єкт, чий `hash` не змінюється за життя; лише такі можуть бути ключами `dict` і елементами `set` (m2-l01). Кортеж рахує свій `hash` з елементів, тому кортеж зі списком усередині unhashable. Ламається це зазвичай не в тесті, а на реальних даних: ключ кешу збирали з рядків, а потім одна з частин прийшла з JSON, де масиви завжди стають `list`.

```python
cache = {}
cache[("email", ("required", "trim"))] = "ok"
print(cache)

rules = ["required", "trim"]
cache[("email", rules)] = "ok"
```

```text
{('email', ('required', 'trim')): 'ok'}
Traceback (most recent call last):
  File "example.py", line 6, in <module>
    cache[("email", rules)] = "ok"
    ~~~~~^^^^^^^^^^^^^^^^^^
TypeError: unhashable type: 'list'
```

Виправлення на межі: перетворити змінювану частину на незмінну перед тим, як збирати ключ. Кортеж з тими самими елементами рівний і має той самий `hash`, тому запис іде в наявний ключ, а не створює новий.

```python
cache = {("email", ("required", "trim")): "ok"}
rules = ["required", "trim"]
cache[("email", tuple(rules))] = "updated"
print(cache, len(cache))
```

```text
{('email', ('required', 'trim')): 'updated'} 1
```

<!-- task: q2 -->

## Aliasing у функціях: мутувати або повертати нове

Параметр функції прив'язується до того самого об'єкта, що й аргумент; m1-l07 називав це pass by assignment і показав обидва наслідки. Коротко: мутація параметра видна ззовні, переприсвоєння параметра ні.

```python live
def add_required(fields: list[str]) -> None:
    fields.append("email")


def reset(fields: list[str]) -> None:
    fields = []


my_fields = ["name"]
add_required(my_fields)
reset(my_fields)
print(my_fields)
```

```text
['name', 'email']
```

Звідси конвенція з m1-l07: функція або мутує аргумент і повертає `None`, або повертає новий об'єкт і аргумент не чіпає. Найнебезпечніший варіант це третій, коли функція мовчки робить обидва: мутує вхід і повертає його ж. Вона виглядає як чиста, викликач зберігає "до" і "після" в різні змінні, і вони виявляються одним об'єктом.

```python
def with_defaults(field: dict) -> dict:
    field.setdefault("required", False)
    field["label"] = field.get("label") or field["name"].title()
    return field


raw = {"name": "email"}
prepared = with_defaults(raw)
print(prepared)
print(raw)
print(prepared is raw)
```

```text
{'name': 'email', 'required': False, 'label': 'Email'}
{'name': 'email', 'required': False, 'label': 'Email'}
True
```

Дві чесні версії. Чиста будує новий словник і повертає його; мутуюча змінює аргумент і повертає `None`, тож сигнатура `-> None` сама каже, що відбувається. Стандартна бібліотека дотримується того самого: `list.sort` і `dict.update` повертають `None`, `sorted` і `d1 | d2` новий об'єкт.

```python
def with_defaults(field: dict) -> dict:
    result = {"required": False, **field}
    result["label"] = field.get("label") or field["name"].title()
    return result


def apply_defaults(field: dict) -> None:
    field.setdefault("required", False)
    if not field.get("label"):
        field["label"] = field["name"].title()


raw = {"name": "email"}
prepared = with_defaults(raw)
print(raw, prepared is raw)
print(prepared)

apply_defaults(raw)
print(raw)
```

```text
{'name': 'email'} False
{'required': False, 'name': 'email', 'label': 'Email'}
{'name': 'email', 'required': False, 'label': 'Email'}
```

Коли функція мутує на місці, а потрібно замінити весь вміст, переприсвоєння не спрацює: `items = [...]` усередині прив'яже лише локальне ім'я. Замінити вміст того самого об'єкта можна присвоєнням у зріз `items[:] = ...` (детально в m2-l03) для списку або `d.clear()` і `d.update(...)` для словника. Тоді зміну побачать усі імена, що дивляться на цей об'єкт.

```python
def drop_empty(values: list[str]) -> None:
    values[:] = [v for v in values if v]


answers = ["a", "", "b"]
view = answers
drop_empty(answers)
print(answers, view is answers)
```

```text
['a', 'b'] True
```

> **JS-аналог.** Конвенція та сама, що в React-коді: `setState` і `useMemo` порівнюють посилання через `===`, тому стан не мутують, а будують новий об'єкт. У Python фреймворк цього не вимагає, але причина та сама: хтось інший тримає посилання на ваш об'єкт і не очікує, що він зміниться під ним. `arr.length = 0` проти `arr = []` у JS це рівно `items[:] = []` проти `items = []`.

<!-- task: t2 -->

## Aliasing у структурах: один об'єкт у кількох місцях

Підступніший випадок, коли обидва посилання лежать усередині однієї структури: ви змінюєте одну "клітинку", а змінюється інша. У всіх варіантах корінь один: вираз обчислено один раз, а результат покладено в кілька місць. `[[0] * 3] * 2` (m1-l10), `dict.fromkeys(keys, [])`, `a = b = []` (m1-l01) і mutable default (m1-l07) це одна й та сама пастка в чотирьох формах.

```python live
grid = [[0] * 3] * 2
grid[0][0] = 1
print(grid)

buckets = dict.fromkeys(["input", "text"], [])
buckets["input"].append("email")
print(buckets)

errors = warnings = []
warnings.append("deprecated field")
print(errors)
```

```text
[[1, 0, 0], [1, 0, 0]]
{'input': ['email'], 'text': ['email']}
['deprecated field']
```

Механізм у кожному випадку свій, але однаковий за суттю. `*` над списком повторює посилання, а не об'єкти. `dict.fromkeys(keys, value)` кладе один і той самий `value` під кожен ключ, бо аргумент обчислюється один раз до виклику, так само як значення за замовчуванням у `def`. Ланцюжкове присвоєння прив'язує всі імена до одного об'єкта. З незмінним заповнювачем (`[0] * 3`, `dict.fromkeys(keys, 0)`) відбувається те саме, але шкоди немає: клітинку з числом можна лише переприсвоїти, а не змінити.

Діагностика через identity. Якщо дві клітинки підозріло змінюються разом, `is` між ними відповідає одразу. Для цілого контейнера зручно порахувати різні `id`: якщо їх менше, ніж елементів, частина елементів це один об'єкт.

```python
grid = [[0] * 3] * 2
buckets = dict.fromkeys(["input", "text"], [])
print(grid[0] is grid[1])
print(len({id(row) for row in grid}), "distinct of", len(grid))
print(buckets["input"] is buckets["text"])
```

```text
True
1 distinct of 2
True
```

Виправлення: вираз, що створює змінюваний об'єкт, має обчислюватися для кожного місця окремо. Comprehension обчислює свій вираз на кожній ітерації. `collections.defaultdict(list)` викликає фабрику `list` для кожного відсутнього ключа; параметр так і називається, `default_factory` (офіційна назва; сам `defaultdict` у m2-l04). Та сама ідея в dataclass, де `field(default_factory=list)` замінює `= []` (m2-l05).

```python
from collections import defaultdict

grid = [[0] * 3 for _ in range(2)]
grid[0][0] = 1
print(grid, grid[0] is grid[1])

buckets = {key: [] for key in ["input", "text"]}
buckets["input"].append("email")
print(buckets)

grouped = defaultdict(list)
grouped["input"].append("email")
grouped["text"].append("intro")
print(dict(grouped))
```

```text
[[1, 0, 0], [0, 0, 0]] False
{'input': ['email'], 'text': []}
{'input': ['email'], 'text': ['intro']}
```

> **Пастка.** Та сама помилка в циклі: словник створено один раз до циклу, а в тілі його лише заповнюють і додають у список. У результаті список містить кілька посилань на один словник з останніми значеннями. Блокового scope в Python немає (m1-l06), тож змінна до циклу виглядає природно, і помилка не кидається в очі. Літерал `{}` має стояти всередині тіла, щоб обчислюватися на кожній ітерації.

```python
row = {}
rows = []
for name in ["email", "phone"]:
    row["name"] = name
    rows.append(row)
print(rows, rows[0] is rows[1])

rows = []
for name in ["email", "phone"]:
    row = {"name": name}
    rows.append(row)
print(rows, rows[0] is rows[1])
```

```text
[{'name': 'phone'}, {'name': 'phone'}] True
[{'name': 'email'}, {'name': 'phone'}] False
```

<!-- task: t1 -->

<!-- task: q3 -->

## Поверхнева копія: новий контейнер, ті самі елементи

Поверхнева копія (shallow copy, офіційний термін з документації модуля `copy`) створює новий контейнер і кладе в нього ті самі посилання, що були в оригіналі. Для списку це `list(x)`, `x[:]`, `x.copy()`, `[*x]`; для словника `dict(d)`, `d.copy()`, `{**d}`; для множини `set(s)` і `s.copy()`; для будь-якого об'єкта `copy.copy(x)`. Це рівно spread з JS: `[...arr]` і `{...obj}`.

```ts
const config = { title: "Signup", elements: [{ id: "email" }] };
const copy = { ...config };
copy.title = "Login";
copy.elements.push({ id: "phone" });
console.log(config.title, config.elements.length); // Signup 2
```

```python
config = {"title": "Signup", "elements": [{"id": "email"}]}
copy_ = {**config}
copy_["title"] = "Login"
copy_["elements"].append({"id": "phone"})
print(config["title"], len(config["elements"]))
print(copy_ is config, copy_["elements"] is config["elements"])
```

```text
Signup 2
False True
```

Поведінка збігається з JS один в один: переприсвоєння ключа в копії оригіналу не стосується, мутація вкладеного списку стосується, бо список один. Різниця лише в кількості способів записати те саме. Усі вони дають новий контейнер з тими самими елементами, і `is` це показує.

```python live
import copy

rows = [[1, 2], [3, 4]]
variants = [
    ("list(x)", list(rows)),
    ("x[:]", rows[:]),
    ("x.copy()", rows.copy()),
    ("[*x]", [*rows]),
    ("copy.copy", copy.copy(rows)),
]
for name, c in variants:
    print(f"{name:10} new container: {c is not rows}, same rows: {c[0] is rows[0]}")
```

```text
list(x)    new container: True, same rows: True
x[:]       new container: True, same rows: True
x.copy()   new container: True, same rows: True
[*x]       new container: True, same rows: True
copy.copy  new container: True, same rows: True
```

Вибір між ними не косметичний. `list(x)` і `dict(d)` це конструктори типу: вони приймають будь-який iterable чи mapping і повертають рівно `list` чи `dict`. `x.copy()` і `copy.copy(x)` зберігають тип оригіналу. Різниця видна на підкласах, наприклад `defaultdict`: `dict(dd)` втрачає фабрику значень за замовчуванням, `.copy()` ні.

```python
import copy
from collections import defaultdict

dd = defaultdict(list, {"a": [1]})
print(type(dict(dd)).__name__, type(dd.copy()).__name__, type(copy.copy(dd)).__name__)
```

```text
dict defaultdict defaultdict
```

Для незмінних типів поверхнева копія часто не створює нічого: `tuple(t)`, `t[:]`, `copy.copy(t)` і `str(s)` повертають той самий об'єкт. Це законна оптимізація, а не порушення: якщо об'єкт змінити неможливо, копія не відрізнялася б від оригіналу нічим, крім `id`.

```python
import copy

t = (1, "a")
s = "abc"
print(tuple(t) is t, t[:] is t, copy.copy(t) is t)
print(s[:] is s, str(s) is s)
```

```text
True True True
True True
```

`copy.copy` на екземплярі класу створює новий екземпляр того самого класу з поверхневою копією атрибутів. Атрибут-рядок у копії можна переприсвоїти незалежно, атрибут-список лишається спільним. Клас може перевизначити поведінку методом `__copy__` (dunder-методи в m4-l02).

```python
import copy


class Field:
    def __init__(self, name: str, rules: list[str]) -> None:
        self.name = name
        self.rules = rules


f = Field("email", ["required"])
g = copy.copy(f)
g.name = "phone"
g.rules.append("trim")
print(type(g).__name__, f.name, f.rules)
```

```text
Field email ['required', 'trim']
```

<!-- task: q4 -->

## Глибока копія: `deepcopy` і `structuredClone`

`copy.deepcopy(x)` рекурсивно копіює все змінюване: контейнер, контейнери в ньому, атрибути екземплярів. Аналог у JS це `structuredClone`. Незмінні об'єкти без змінюваних частин усередині не копіюються, а повертаються як є, з тієї ж причини, що й у поверхневій копії.

```python live
import copy

config = {"title": "Signup", "elements": [{"id": "email", "rules": ["required"]}]}
clone = copy.deepcopy(config)
clone["elements"][0]["rules"].append("trim")
print(config["elements"][0]["rules"])
print(clone["elements"][0]["rules"])
print(clone["elements"] is config["elements"], clone["elements"][0] is config["elements"][0])
print(clone["title"] is config["title"])

flat = (1, "a")
nested = ([1], 2)
print(copy.deepcopy(flat) is flat, copy.deepcopy(nested) is nested)
```

```text
['required']
['required', 'trim']
False False
True
True False
```

Механізм тримається на словнику `memo` (так називається параметр у документації), який зіставляє `id` вже скопійованого оригіналу з його копією. Перед копіюванням кожного об'єкта `deepcopy` заглядає в `memo` і, якщо об'єкт уже бачила, повертає готову копію. Звідси дві властивості. Цикли не дають нескінченної рекурсії. І спільна структура зберігається: якщо в оригіналі два місця дивилися на один список, у копії вони дивитимуться на один новий список. `structuredClone` поводиться так само.

```python
import copy

shared_rules = ["required"]
form = {"email": shared_rules, "phone": shared_rules}
clone = copy.deepcopy(form)
print(clone["email"] is clone["phone"], clone["email"] is shared_rules)

node = {"id": "root", "children": []}
node["children"].append(node)
clone = copy.deepcopy(node)
print(clone["children"][0] is clone, clone is node)
```

```text
True False
True False
```

Ціна цього в швидкості. `deepcopy` написана на Python і для кожного об'єкта робить пошук у `memo`, диспетчеризацію за типом, а для екземплярів класів ще й протокол `__reduce_ex__`. На конфігу форми з п'ятдесяти полів вона на три порядки повільніша за поверхневу копію (яка, щоправда, копіює лише верхній рівень) і приблизно втричі повільніша навіть за обхід через JSON, бо модуль `json` має прискорення на C.

```python
import copy
import json
import timeit

config = {
    "id": "signup",
    "theme": {"color": "#333", "font": "Inter"},
    "elements": [
        {"id": f"f{i}", "type": "input", "name": f"field_{i}", "rules": ["required", "trim"], "visible_if": None}
        for i in range(50)
    ],
}

for label, fn in [
    ("dict(config)", lambda: dict(config)),
    ("json roundtrip", lambda: json.loads(json.dumps(config))),
    ("copy.deepcopy", lambda: copy.deepcopy(config)),
]:
    seconds = timeit.timeit(fn, number=2000)
    print(f"{label:15} {seconds / 2000 * 1_000_000:8.2f} us")
```

```text
dict(config)        0.08 us
json roundtrip     47.37 us
copy.deepcopy     127.72 us
```

Числа з одного запуску на ноутбуці автора; у вас вони будуть інші, а порядок той самий. Звідси правило, коли `deepcopy` потрібна. Вона потрібна, коли ви збираєтеся мутувати дані, якими не володієте, і хтось інший тримає на них посилання: вхід API, який викликач ще використає, шаблон з кешу, який треба підлаштувати під запит, фікстура тесту. Вона не потрібна, коли код і так будує нові структури (comprehension, чисті функції), і тим більше, коли дані лише читаються. Копіюють один раз на межі володіння, а не "про всяк випадок" на кожному кроці.

> **Пастка.** `json.loads(json.dumps(x))` це той самий трюк, що `JSON.parse(JSON.stringify(x))` у JS до появи `structuredClone`, і він гірший за `deepcopy` не лише в Python. Кортеж стає списком, числові ключі стають рядками, спільні об'єкти розпадаються на окремі копії, а `set`, `datetime` і екземпляри класів не серіалізуються взагалі. Цикл дає `ValueError: Circular reference detected`. Він швидший, але копіює не ваші дані, а їх JSON-проєкцію.

```python
import json

data = {"order": (1, 2), 10: "ten"}
print(json.loads(json.dumps(data)))

shared = ["required"]
form = {"email": shared, "phone": shared}
clone = json.loads(json.dumps(form))
print(clone["email"] is clone["phone"])

try:
    json.dumps({"tags": {"a", "b"}})
except TypeError as e:
    print("TypeError:", e)
```

```text
{'order': [1, 2], '10': 'ten'}
False
TypeError: Object of type set is not JSON serializable
```

> **JS-аналог.** `structuredClone` теж обробляє цикли, `Map`, `Set` і `Date`, але кидає на функціях і втрачає прототип: екземпляр класу стає звичайним об'єктом. `deepcopy` зберігає клас (копія це екземпляр того самого класу), а функції, класи й модулі вважає атомарними і не копіює, а повертає як є. Клас може перевизначити глибоке копіювання методом `__deepcopy__(self, memo)`.

```python
import copy


def not_empty(value: str) -> bool:
    return bool(value)


class Field:
    def __init__(self, name: str, validate) -> None:
        self.name = name
        self.validate = validate


f = Field("email", not_empty)
g = copy.deepcopy(f)
print(type(g).__name__, g is f, g.validate is f.validate)
```

```text
Field False True
```

Між повною копією і мутацією є третій шлях, знайомий з Redux та Immer: копіювати лише шлях до зміненого місця, а решту дерева ділити між старою і новою версією. Це називають structural sharing (жаргонний термін з функціонального програмування й бібліотек незмінних структур). У JS це `{...state, theme: {...state.theme, color}}`, у Python той самий запис через `**`. Безпечно воно лише доти, доки ніхто не мутує спільні частини, тому добре поєднується з незмінними типами з наступного розділу.

```python
config = {"theme": {"color": "#333", "font": "Inter"}, "elements": [{"id": "email"}]}
updated = {**config, "theme": {**config["theme"], "color": "#000"}}
print(config["theme"]["color"], updated["theme"]["color"])
print(updated["theme"] is config["theme"], updated["elements"] is config["elements"])
```

```text
#333 #000
False True
```

<!-- task: t3 -->

## Незмінні версії змінюваних типів: `tuple`, `frozenset`, `MappingProxyType`

У JS незмінність має дві окремі ручки. `const` стосується прив'язки імені й нічого не каже про об'єкт. `Object.freeze` стосується об'єкта, працює неглибоко і в нестрогому режимі мовчки ігнорує запис. У Python немає жодної з них у звичному вигляді. `const` немає взагалі: константи позначають іменем `UPPER_CASE` за конвенцією і, за бажання, анотацією `typing.Final`, яку перевіряє лише mypy чи pyright, а не runtime (m2-l06, m2-l08). Заморозити наявний список чи словник теж не можна. Незмінність у Python це властивість типу: якщо потрібен незмінний список, ви берете інший тип.

```ts
const fields = Object.freeze(["email", "phone"]);
fields.push("age"); // TypeError: Cannot add property 2, object is not extensible
const required = new Set(["email"]); // незмінного Set немає
```

```python
fields = ["email", "phone"]
frozen_fields = tuple(fields)
required = frozenset({"email", "phone"})

fields.append("age")
print(frozen_fields, "age" in required, len(required))
print(hasattr(frozen_fields, "append"), hasattr(required, "add"))
print(hash(required) == hash(frozenset({"phone", "email"})))
```

```text
('email', 'phone') False 2
False False
True
```

Розходження в трьох місцях. `tuple(lst)` і `frozenset(s)` це не заморожений оригінал, а новий об'єкт іншого типу: оригінальний список далі змінюється, а кортеж ні. Методів, що змінюють, у незмінних типів просто немає, тож помилка буде `AttributeError` на рівні "такого методу не існує", а не тихе ігнорування. І незмінні типи hashable, тому `frozenset` може бути ключем словника чи елементом множини, а заморожений масив у JS залишається звичайним об'єктом з тією самою семантикою ключів.

Для словника незмінного вбудованого типу немає, є read-only view: `types.MappingProxyType(d)` (документація називає його read-only proxy of a mapping). Це не копія: проксі дивиться на той самий словник, тому зміни в оригіналі через нього видно, а запис через проксі кидає `TypeError`. Звичний патерн: модуль тримає приватний `_REGISTRY` і віддає назовні `REGISTRY = MappingProxyType(_REGISTRY)`, тобто читати можуть усі, писати лише власник. Інтерпретатор сам так робить з атрибутами класів: `str.__dict__` це mappingproxy.

```python
from types import MappingProxyType

source = {"color": "#333"}
theme = MappingProxyType(source)
print(theme["color"], len(theme), "color" in theme, type(str.__dict__).__name__)
source["color"] = "#000"
print(theme["color"])
theme["color"] = "#fff"
```

```text
#333 1 True mappingproxy
#000
Traceback (most recent call last):
  File "example.py", line 8, in <module>
    theme["color"] = "#fff"
    ~~~~~^^^^^^^^^
TypeError: 'mappingproxy' object does not support item assignment
```

> **Пастка.** Незмінні версії неглибокі, як і `Object.freeze`. У кортежі зі списком і в проксі над словником зі списками вміст вкладених списків змінюється вільно. `frozenset` захищений краще лише тому, що його елементи мусять бути hashable, тож список у нього не покласти взагалі. Глибока незмінність у Python означає незмінні типи на кожному рівні, і будувати її треба явно.

```python live
from types import MappingProxyType

theme = MappingProxyType({"fonts": ["Inter"]})
theme["fonts"].append("Roboto")
print(theme["fonts"])
```

```text
['Inter', 'Roboto']
```

Для записів з фіксованими полями є ще два інструменти, про які далі в модулі. `@dataclass(frozen=True)` дає незмінний типізований запис з `FrozenInstanceError` при спробі запису і `dataclasses.replace` для "зміни" через новий об'єкт (m2-l05). Pydantic-моделі мають `frozen=True` у конфігурації і `model_copy` (m2-l09).

<!-- task: t4 -->

## Для капстоуну

Конфіг форми в капстоуні приходить як `dict` з `json.loads` (а з m2-l09 як Pydantic-модель) і проходить кілька етапів: нормалізація, валідація, рендер. Правило для всіх етапів: етап повертає новий об'єкт, або явно документує мутацію сигнатурою `-> None` і назвою на кшталт `apply_...`. Якщо якийсь етап таки мутує, вхід API копіюють `deepcopy` один раз на самому початку. Ось баг, який це правило запобігає: нормалізація мутує вхідний конфіг і повертає його ж.

```python
import json

RAW = '{"id": "signup", "elements": [{"type": "input", "name": " Email "}, {"type": "button", "label": "Send"}]}'


def normalize(config: dict) -> dict:
    for element in config["elements"]:
        if element["type"] == "input":
            element["name"] = element["name"].strip().lower()
            element.setdefault("required", False)
    return config


received = json.loads(RAW)
normalized = normalize(received)
print(received["elements"][0])
print(normalized is received)
```

```text
{'type': 'input', 'name': 'email', 'required': False}
True
```

Чому це баг, а не оптимізація. Отриманий конфіг у капстоуні зберігається як версія "як надіслав користувач" (історія версій у SQLite, m6-l08), потрапляє в лог для порівняння або повертається в тілі 422-помилки, щоб фронтенд підсвітив поле так, як його ввели. Після такої нормалізації оригіналу більше немає. Поверхнева копія не рятує: `dict(config)` копіює лише верхній рівень, а список `elements` і словники в ньому лишаються спільними.

```python
import json

RAW = '{"id": "signup", "elements": [{"type": "input", "name": " Email "}, {"type": "button", "label": "Send"}]}'


def normalize(config: dict) -> dict:
    for element in config["elements"]:
        if element["type"] == "input":
            element["name"] = element["name"].strip().lower()
            element.setdefault("required", False)
    return config


received = json.loads(RAW)
normalize(dict(received))
print(received["elements"][0])
```

```text
{'type': 'input', 'name': 'email', 'required': False}
```

Два робочі виправлення. Перше: залишити мутуючий код, але дати йому власну глибоку копію на вході. Друге: переписати нормалізацію як чисту функцію, яка будує нові словники. Друга версія ділить з оригіналом незмінені елементи (тут кнопку), тобто це structural sharing: безпечно, поки наступні етапи нічого не мутують, і саме тому правило "етап повертає нове" має діяти для всіх етапів, а не лише для першого.

```python
import copy
import json

RAW = '{"id": "signup", "elements": [{"type": "input", "name": " Email "}, {"type": "button", "label": "Send"}]}'


def normalize(config: dict) -> dict:
    for element in config["elements"]:
        if element["type"] == "input":
            element["name"] = element["name"].strip().lower()
            element.setdefault("required", False)
    return config


def normalize_copy(config: dict) -> dict:
    return normalize(copy.deepcopy(config))


def normalize_pure(config: dict) -> dict:
    def fix(element: dict) -> dict:
        if element["type"] != "input":
            return element
        return {**element, "name": element["name"].strip().lower(), "required": element.get("required", False)}

    return {**config, "elements": [fix(e) for e in config["elements"]]}


received = json.loads(RAW)
a = normalize_copy(received)
b = normalize_pure(received)
print(received["elements"][0])
print(a["elements"][0])
print(b["elements"][0])
print(a["elements"][1] is received["elements"][1], b["elements"][1] is received["elements"][1])
```

```text
{'type': 'input', 'name': ' Email '}
{'type': 'input', 'name': 'email', 'required': False}
{'type': 'input', 'name': 'email', 'required': False}
False True
```

> **Для капстоуну.** Pydantic знімає частину проблеми: `FormConfig.model_validate(data)` будує нові об'єкти моделей і не мутує вхідний `dict`. Але "змінити модель" там теж означає вибір: `model_copy(update={...})` за замовчуванням робить поверхневу копію, і вкладені моделі та списки лишаються спільними, а `model_copy(deep=True)` глибоку (детально в m2-l09).

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **Очікування, що "примітиви копіюються, а об'єкти за посиланням".** У Python усе передається й присвоюється однаково, посиланням на об'єкт. Числа й рядки поводяться "як значення" лише тому, що незмінні. Правильно: думати категоріями "мутація чи переприсвоєння" і "змінюваний чи ні тип".

   ```python
   n = 300
   m = n
   print(m is n)   # -> True: копії немає, і вона не потрібна
   ```

2. **`const` як "незмінне" і `Object.freeze` як "глибоке".** `const` у Python немає, `typing.Final` перевіряє лише type checker. `tuple`, `frozenset` і `MappingProxyType` неглибокі, як і `freeze`. Правильно: незмінні типи на кожному рівні, якщо потрібна глибока незмінність.

   ```python
   frozen = ([1], 2)
   frozen[0].append(3)
   print(frozen)   # -> ([1, 3], 2)
   ```

3. **`{**d}`, `[*a]`, `list(a)` як глибока копія.** Перенесене з `{...obj}`: вкладені об'єкти лишаються спільними. Правильно: `copy.deepcopy`, якщо вкладене буде мутуватися, або чисті функції, що будують нове.

   ```python
   import copy

   config = {"elements": [{"id": "email"}]}
   shallow = {**config}
   deep = copy.deepcopy(config)
   print(shallow["elements"] is config["elements"], deep["elements"] is config["elements"])   # -> True False
   ```

4. **`dict.fromkeys(keys, [])` як `Object.fromEntries(keys.map(k => [k, []]))`.** У JS callback `map` створює новий масив на кожен ключ; у Python аргумент обчислюється один раз, і список один на всіх. Правильно: comprehension `{k: [] for k in keys}` або `defaultdict(list)`. (Те саме в JS дає `Array(3).fill([])`.)

   ```python
   groups = dict.fromkeys(["input", "text"], [])
   groups["input"].append("email")
   print(groups["text"])   # -> ['email']
   ```

5. **Функція, що мутує вхід і повертає його ж.** Звичка з `arr.sort()`, який у JS і мутує, і повертає масив. Викликач вважає результат новим об'єктом. Правильно: або `-> None` і мутація, або новий об'єкт без мутації.

   ```python
   def with_label(field: dict) -> dict:
       return {**field, "label": field["name"].title()}
   ```

6. **`json.loads(json.dumps(x))` як deepcopy.** Перенесене з `JSON.parse(JSON.stringify(x))`. Кортежі стають списками, числові ключі рядками, `set` і `datetime` падають, спільні об'єкти розпадаються. Правильно: `copy.deepcopy`.

   ```python
   import json

   print(json.loads(json.dumps({1: (2, 3)})))   # -> {'1': [2, 3]}
   ```

7. **`+=` на елементі кортежу в `try/except` з думкою "нічого не змінилося".** Список усередині вже змінений до винятку. Правильно: мутувати список методом (`t[0].extend(...)`) або не класти змінюване в кортеж.

   ```python
   t = ([1], 2)
   try:
       t[0] += [3]
   except TypeError:
       pass
   print(t)   # -> ([1, 3], 2)
   ```

8. **Перевикористання одного словника в циклі.** `row = {}` до циклу і `rows.append(row)` у тілі дає список посилань на один словник. Правильно: створювати словник усередині тіла.

   ```python
   rows = [{"name": name} for name in ["email", "phone"]]
   print(rows[0] is rows[1])   # -> False
   ```

## Підсумок

- Змінна це ім'я, прив'язане до об'єкта; присвоєння ніколи не копіює, а лише прив'язує ще одне ім'я.
- Мутація змінює об'єкт і видна через усі імена; переприсвоєння змінює лише ім'я. Діагностика через `is` або порівняння `id`.
- Незмінні: `int`, `float`, `bool`, `str`, `bytes`, `tuple`, `frozenset`, `None`. Змінювані: `list`, `dict`, `set`, екземпляри класів.
- `x += y` це `x = x.__iadd__(y)`, якщо метод є, інакше `x = x + y`. Для списку мутація на місці, для числа, рядка, кортежу новий об'єкт.
- `t[0] += [x]` на кортежі зі списком кидає `TypeError` після того, як список уже змінено.
- Функція або мутує аргумент і повертає `None`, або повертає новий об'єкт; мовчки обидва не можна.
- `[[0] * n] * m`, `dict.fromkeys(keys, [])`, `a = b = []`, mutable default: один об'єкт у кількох місцях. Лікується comprehension або `default_factory`.
- Поверхнева копія (`list(x)`, `x[:]`, `.copy()`, `{**d}`, `copy.copy`) це новий контейнер з тими самими елементами, як `[...arr]` і `{...obj}`.
- `copy.deepcopy` рекурсивна, зберігає цикли й спільну структуру через `memo`, повільна; копіювати один раз на межі володіння. JSON-обхід не заміна.
- Незмінність у Python це тип, а не `const` чи `freeze`: `tuple`, `frozenset`, `MappingProxyType`, і всі вони неглибокі.

## Що далі

Наступний урок m2-l03 про зрізи й розпакування. Там стане видно, чому зріз списку це поверхнева копія, як присвоєння в зріз `items[:] = ...` змінює вміст на місці, і як `{**a, **b}` зливає словники, тобто весь інструментарій structural sharing з цього уроку. Далі `defaultdict` з m2-l04 і `frozen=True` з `dataclasses.replace` у m2-l05 повертаються до незмінності вже на рівні записів.
