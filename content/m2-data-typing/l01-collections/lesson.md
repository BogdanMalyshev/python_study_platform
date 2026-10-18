---
id: m2-l01
module: m2-data-typing
title: "list, tuple, dict, set проти Array, Object, Map, Set"
summary: "Учень вибирає між list, tuple, dict і set за роллю та складністю операцій, знає, що повертає кожен метод, чим dict відрізняється від Object і Map, чому ключ має бути hashable і як вкладені структури проходять крізь JSON."
duration_min: 75
prerequisites: [m1-l11]
---

## Чотири колекції і чому відповідність з JS неточна

У Python чотири вбудовані колекції, і в кожної одна роль. `list` це змінювана послідовність: впорядковані елементи з доступом за цілим індексом. `tuple` це незмінна послідовність, яку найчастіше використовують як запис фіксованої форми. `dict` це відображення ключів на значення. `set` це невпорядкований набір унікальних елементів. Слова "послідовність" (sequence) і "відображення" (mapping) це офіційні терміни документації Python: так називають не конкретні типи, а родини типів, і `str` з `range` теж sequence.

```python live
field_ids = ["email", "phone", "email"]
position = (1, 3)
field = {"name": "email", "type": "text", "required": True}
required = {"email", "phone", "email"}

for value in (field_ids, position, field, required):
    print(type(value).__name__, len(value))
```

```text
list 3
tuple 2
dict 3
set 2
```

Дублікат `"email"` у списку лишився, у множині зник ще на етапі літерала. Довжину всіх чотирьох дає одна функція `len`, тоді як у JS це `.length` у масиву й рядка і `.size` у `Map` і `Set`.

JS розкладає ті самі ролі інакше, і саме тут інтуїція підводить. Масив у JS грає і список, і кортеж: `readonly [number, number]` у TS існує лише в типах, у runtime це звичайний змінюваний масив. `Object` грає і запис з відомими полями, і словник з довільними ключами. `Map` і `Set` з'явились у ES2015 і живуть осторонь JSON. У Python запис і словник теж один тип, `dict`, але кортеж це окремий тип зі справжньою незмінністю.

| Python | Роль | Найближче в JS | Де відповідність неточна |
|---|---|---|---|
| `list` | змінювана послідовність | `Array` | без дірок і `undefined`; `len(xs)` замість `.length`; індекс за межами кидає `IndexError` |
| `tuple` | незмінна послідовність, запис | немає; `readonly [A, B]` у TS лише в типах | незмінність перевіряє runtime; може бути ключем `dict` і елементом `set` |
| `dict` | mapping з порядком вставки | `Map`, частково `Object` | ключ будь-якого hashable типу, без прототипу, без `d.key`; літерал і JSON як в `Object` |
| `set` | унікальні елементи | `Set` | порядок не гарантований; елементи порівнюються через `==`, а не за посиланням |

Слово hashable в таблиці це офіційний термін з глосарію Python: об'єкт, хеш якого не змінюється за його життя. Що це дає і чому список не hashable, розібрано в розділі про хеш-таблицю.

Ще одна відмінність видна з першого ж порівняння: колекції порівнюються за вмістом. `==` на двох списках або словниках рекурсивно порівнює елементи, тоді як у JS `[1, 2] === [1, 2]` хибне, і для глибокого порівняння беруть `lodash.isEqual`. Порядок важливий для послідовностей і не важливий для `dict` і `set`. Тип теж важливий: список і кортеж з однаковими елементами не рівні.

```python live
print([1, 2] == [1, 2], [1, 2] == [2, 1])
print({"a": 1, "b": 2} == {"b": 2, "a": 1})
print({1, 2} == {2, 1})
print((1, 2) == [1, 2])
print([1, 2] is [1, 2])
```

```text
True False
True
True
False
False
```

> **JS-аналог.** `===` для об'єктів у JS відповідає `is` у Python: це перевірка, що перед вами той самий об'єкт (m1-l03). `==` для колекцій у Python робить те, для чого в JS потрібна бібліотека.

## list: методи змінюють на місці й повертають `None`

Літерал `[...]`, індексація з нуля, від'ємний індекс рахує з кінця: `xs[-1]` замість `xs.at(-1)` (зрізи детально в m2-l03). Методи списку майже один в один лягають на методи масиву, але з двома систематичними розбіжностями: що вони повертають і як повідомляють про відсутній елемент.

```ts
const ids = ["email", "phone"];
ids.push("age");                      // 3
ids.push(...["city", "zip"]);         // 5
ids.splice(1, 0, "name");             // []
ids.pop();                            // "zip"
ids.shift();                          // "email"
ids.splice(ids.indexOf("city"), 1);   // ["city"]
console.log(ids);                     // ["name", "phone", "age"]
ids.indexOf("zip");                   // -1
ids.includes("phone");                // true
```

```python
ids = ["email", "phone"]
print(ids.append("age"))
ids.extend(["city", "zip"])
ids.insert(1, "name")
print(ids)
print(ids.pop())
print(ids.pop(0))
print(ids.remove("city"))
print(ids)
print(ids.index("age"), ids.count("phone"), "phone" in ids, len(ids))
```

```text
None
['email', 'name', 'phone', 'age', 'city', 'zip']
zip
email
None
['name', 'phone', 'age']
2 1 True 3
```

Розходиться в трьох місцях. `push` приймає скільки завгодно аргументів і повертає нову довжину; `append` додає рівно один елемент і повертає `None`, а для кількох є `extend`. `splice` це універсальний інструмент, який у Python розпадається на `insert(i, x)`, `pop(i)`, `remove(x)`, `del xs[i]` і присвоєння в зріз (m2-l03). І пошук відсутнього: `indexOf` повертає `-1`, а `index` і `remove` кидають `ValueError`. Перевірка наявності це оператор `in` (membership test, офіційна назва з документації), а не метод.

```python
ids = ["email", "phone"]
ids.index("zip")
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    ids.index("zip")
ValueError: 'zip' is not in list
```

> **Пастка.** `append` зі списком в аргументі не розгортає його, а додає як один вкладений елемент. `ids.append(["a", "b"])` це `push(["a", "b"])`, а не `push(...["a", "b"])`. Розгортають `extend` і `+=`.

```python live
ids = ["email"]
ids.append(["a", "b"])
print(ids, len(ids))

ids = ["email"]
ids.extend(["a", "b"])
ids += ["c"]
print(ids, len(ids))
```

```text
['email', ['a', 'b']] 2
['email', 'a', 'b', 'c'] 4
```

`None` з методів, що змінюють список, не недогляд, а правило мови: метод або змінює об'єкт на місці й повертає `None`, або нічого не змінює й повертає новий об'єкт. Так неможливо переплутати "відсортував копію" з "відсортував оригінал". Звідси пари `sort` і `sorted`, `reverse` і `reversed`. `sorted` це `toSorted` з ES2023, тільки приймає будь-який iterable, не лише список, і завжди повертає список. `reversed` повертає лінивий ітератор, тож для друку його загортають у `list`.

```python live
scores = [30, 10, 20]
print(sorted(scores), scores)
print(scores.sort(), scores)
print(type(reversed(scores)).__name__)
print(list(reversed(scores)), scores)
scores.reverse()
print(scores)
print(sorted("cab"), sorted({"b": 1, "a": 2}))
```

```text
[10, 20, 30] [30, 10, 20]
None [10, 20, 30]
list_reverseiterator
[30, 20, 10] [10, 20, 30]
[30, 20, 10]
['a', 'b', 'c'] ['a', 'b']
```

> **Пастка.** `ids = ids.sort()` або `ids = ids.append(x)` за звичкою з ланцюжків JS кладе в змінну `None`, і помилка вилазить не тут, а при першому зверненні до неї.

```python
ids = ["phone", "email"]
ids = ids.sort()
print(ids)
print(len(ids))
```

```text
None
Traceback (most recent call last):
  File "main.py", line 4, in <module>
    print(len(ids))
          ^^^^^^^^
TypeError: object of type 'NoneType' has no len()
```

Сортування теж поводиться інакше. `Array.prototype.sort` без компаратора перетворює елементи на рядки, тому `[10, 9, 1].sort()` у JS дає `[1, 10, 9]`. Python порівнює значення їхніми власними правилами: числа як числа, рядки посимвольно за кодами (великі літери раніше за малі), а порівняння несумісних типів це `TypeError`, а не тихе приведення. Ключ сортування задається через `key=` (m1-l10).

```python
print(sorted([10, 9, 1]))
print(sorted(["b", "B", "a"]), sorted(["b", "B", "a"], key=str.lower))
print(sorted([3, "1"]))
```

```text
[1, 9, 10]
['B', 'a', 'b'] ['a', 'b', 'B']
Traceback (most recent call last):
  File "main.py", line 3, in <module>
    print(sorted([3, "1"]))
          ^^^^^^^^^^^^^^^^
TypeError: '<' not supported between instances of 'str' and 'int'
```

Оператори `+` і `*` для списків означають конкатенацію і повторення, обидва повертають новий список. У JS `[1, 2] + [3]` дає рядок `"1,23"`, а `[1, 2] * 2` дає `NaN`, бо обидва оператори спершу приводять масиви до примітивів, тож аналогії немає. `+` вимагає список з обох боків: кортеж справа це `TypeError`, хоча `+=` і `extend` приймуть будь-який iterable.

```python live
a = [1, 2]
print(a + [3], a * 2, [0] * 3, a)
print(3 in a, 3 not in a)
a += (3,)
print(a)
print(a + (4,))
```

```text
[1, 2, 3] [1, 2, 1, 2] [0, 0, 0] [1, 2]
False True
[1, 2, 3]
Traceback (most recent call last):
  File "main.py", line 6, in <module>
    print(a + (4,))
          ~~^~~~~~
TypeError: can only concatenate list (not "tuple") to list
```

> **Пастка.** `*` повторює посилання, а не копіює елементи: `[[]] * 3` це три посилання на один і той самий порожній список. Для чисел і рядків це непомітно, для вкладених списків це баг; детально в m2-l02.

<!-- task: t1 -->

## tuple: кортеж робить кома

Кортеж (tuple, офіційна назва типу) створює кома, а не дужки. `(1)` це число в дужках, `(1,)` і навіть `1,` це кортежі з одного елемента. Дужки потрібні лише там, де без них кома означала б щось інше: порожній кортеж `()`, кортеж як аргумент функції, кортеж усередині іншого виразу.

```python live
a = (1)
b = (1,)
c = 1,
d = 1, 2
print(type(a).__name__, type(b).__name__, type(c).__name__, d, ())
print(len(("email")), len(("email",)))
```

```text
int tuple tuple (1, 2) ()
5 1
```

> **Пастка.** Кома в кінці рядка присвоєння тихо робить кортеж. `label = "Email",` після рефакторингу з виклику функції або з багаторядкового словника дає `('Email',)`, і помилка проявляється далеко від причини.

```python
label = "Email",
print(repr(label))
print(label.upper())
```

```text
('Email',)
Traceback (most recent call last):
  File "main.py", line 3, in <module>
    print(label.upper())
          ^^^^^^^^^^^
AttributeError: 'tuple' object has no attribute 'upper'
```

Найчастіше кортеж з'являється, коли функція повертає кілька значень. У JS для цього повертають масив і деструктурують його; у Python повертають значення через кому, тобто кортеж, і розпаковують у кілька імен. Розпакування (sequence unpacking, офіційний термін) з `*rest` і вкладеністю розібране в m2-l03.

```ts
function splitName(full: string): [string, string] {
  const i = full.indexOf(" ");
  return [full.slice(0, i), full.slice(i + 1)];
}
const [first, last] = splitName("Ada Lovelace");
```

```python
def split_name(full: str) -> tuple[str, str]:
    first, _, last = full.partition(" ")
    return first, last

result = split_name("Ada King Lovelace")
print(result, type(result).__name__)
first, last = split_name("Ada Lovelace")
print(first, last)
```

```text
('Ada', 'King Lovelace') tuple
Ada Lovelace
```

Розходження в тому, що лишається в runtime. TS-тип `[string, string]` стирається при компіляції, і повернений масив можна змінити, дописати третій елемент чи відсортувати. Python-кортеж і в runtime незмінний: присвоїти в нього не можна, методів `append` чи `sort` у нього немає. Але незмінність неглибока. Кортеж зберігає посилання на об'єкти, і заборонено лише міняти самі посилання; змінюваний об'єкт усередині кортежу змінюється як завжди.

```python
record = (["email"], 2)
record[0].append("phone")
print(record)
record[0] = []
```

```text
(['email', 'phone'], 2)
Traceback (most recent call last):
  File "main.py", line 4, in <module>
    record[0] = []
    ~~~~~~^^^
TypeError: 'tuple' object does not support item assignment
```

Чому для запису фіксованої форми беруть tuple, а не list. Перше, позиція в кортежі має значення: `(page, order)` це "сторінка, потім порядок", довжина фіксована, і тип це показує: `tuple[int, int]` проти `list[int]` довільної довжини (типи в m2-l06). Друге, кортеж hashable, якщо hashable його елементи, тому може бути ключем словника і елементом множини, а список ні (розділ про хеш-таблицю нижче). Третє, кортеж сигналізує читачеві й колегам, що цю структуру ніхто не змінюватиме. Список лишається для однорідних даних змінної довжини: поля форми, помилки валідації, черга задач.

```python live
positions = {(1, 1): "email", (1, 2): "phone", (2, 1): "plan"}
print(positions[(1, 2)])
print(positions[2, 1])
print((1, 2) in positions)
```

```text
phone
plan
True
```

Під час індексації словника дужки навколо кортежу можна не писати: `positions[2, 1]` це той самий `positions[(2, 1)]`, бо кортеж робить кома. Коли полів більше двох і позиційний доступ `record[3]` перестає читатися, беруть `namedtuple` або `typing.NamedTuple`: той самий кортеж, але з іменами полів (m2-l04); для змінюваного запису з типами є dataclass (m2-l05).

<!-- task: q1 -->

## dict: доступ, view-об'єкти і злиття

Словник це літерал `{key: value}` і три способи читання. `d[key]` для ключа, який зобов'язаний бути: відсутній дає `KeyError` (m1-l11). `d.get(key, default)` для необов'язкового. `d.setdefault(key, default)` повертає наявне значення, а якщо ключа немає, спершу записує `default` і повертає його. `in` перевіряє ключі, а не значення. Видалення через `del d[key]` або `d.pop(key, default)`; `pop` без `default` на відсутньому ключі теж кидає `KeyError`.

```python live
field = {"name": "email", "type": "text"}
print(field["name"])
print(field.get("label"), field.get("label", "Email"))
print(field.setdefault("required", False), field)
print(field.setdefault("required", True), field)
field["label"] = "Email"
print("label" in field, "Email" in field)
print(field.pop("label"), field.pop("missing", None))
del field["required"]
print(field)
```

```text
email
None Email
False {'name': 'email', 'type': 'text', 'required': False}
False {'name': 'email', 'type': 'text', 'required': False}
True False
Email None
{'name': 'email', 'type': 'text'}
```

`setdefault` виглядає дивно, доки не стає видно, для чого він: одна операція "дай список за ключем, а якщо його немає, створи порожній", тобто `acc[k] ??= []` з JS. Групування в один рядок без `if key not in d`. Для частого групування є `defaultdict` (m2-l04), але `setdefault` вбудований і для одного місця його досить.

```python
fields = [("email", 1), ("phone", 1), ("plan", 2)]
by_page = {}
for name, page in fields:
    by_page.setdefault(page, []).append(name)
print(by_page)
```

```text
{1: ['email', 'phone'], 2: ['plan']}
```

> **JS-аналог.** `"name" in obj` у JS теж перевіряє ключі, але проходить ланцюжком прототипів: `"toString" in {}` дає `true`. У Python `in` бачить лише ключі самого словника, бо прототипу в нього немає (наступний розділ).

`keys()`, `values()` і `items()` повертають не списки, а view-об'єкти (dictionary view objects, офіційна назва з документації). View не копія: це вікно в словник, яке бачить усі подальші зміни. `Object.keys(obj)` у JS навпаки повертає новий масив, знімок на момент виклику. View можна ітерувати, перевіряти `in` і брати `len`, але не індексувати; список ключів, якщо він справді потрібен, це `list(d)`.

```python
answers = {"email": "a@b.c"}
keys = answers.keys()
items = answers.items()
print(keys, len(keys))
answers["phone"] = "+380"
print(keys, len(keys))
print(items)
print(list(answers))
print(keys[0])
```

```text
dict_keys(['email']) 1
dict_keys(['email', 'phone']) 2
dict_items([('email', 'a@b.c'), ('phone', '+380')])
['email', 'phone']
Traceback (most recent call last):
  File "main.py", line 9, in <module>
    print(keys[0])
          ~~~~^^^
TypeError: 'dict_keys' object is not subscriptable
```

`keys()` і `items()` ще й поводяться як множини: до них застосовні `&`, `|`, `-`, `^`. "Які обов'язкові поля відсутні у відповідях" це одна операція `required - answers.keys()`, без циклу й без проміжного `set(...)`.

```python live
answers = {"email": "a@b.c", "phone": "+380"}
print(answers.keys() & {"email", "plan"})
print(answers.keys() - {"email"})
print({"email", "plan"} - answers.keys())
```

```text
{'email'}
{'phone'}
{'plan'}
```

Злиття словників: оператор `|` (з 3.9) повертає новий словник, `|=` і `update` змінюють лівий на місці. Це `{...a, ...b}` і `Object.assign(a, b)` з JS, з тим самим правилом: при збігу ключа виграє правий, але ключ лишається на позиції, де він з'явився вперше. Розпакування `{**a, **b}` теж працює, детально в m2-l03.

```python live
defaults = {"type": "text", "required": False, "label": ""}
override = {"required": True, "label": "Email", "hint": "work email"}
merged = defaults | override
print(merged)
print(defaults)
defaults |= {"placeholder": ""}
print(defaults)
override.update(required=False, max_length=120)
print(override)
```

```text
{'type': 'text', 'required': True, 'label': 'Email', 'hint': 'work email'}
{'type': 'text', 'required': False, 'label': ''}
{'type': 'text', 'required': False, 'label': '', 'placeholder': ''}
{'required': False, 'label': 'Email', 'hint': 'work email', 'max_length': 120}
```

Порядок ключів у словнику це порядок вставки. Так було в CPython 3.6 як деталь реалізації, а з 3.7 це гарантія мови. Перезапис наявного ключа позицію не змінює, видалення й повторна вставка переносять ключ у кінець. У JS `Object` такої гарантії немає: ключі, схожі на цілі числа, завжди йдуть першими за зростанням, а вже потім рядкові в порядку вставки. `Map` у JS зберігає порядок вставки так само, як `dict`.

```ts
Object.keys({ b: 1, 10: 1, a: 1, 2: 1 });   // ["2", "10", "b", "a"]
[...new Map<unknown, number>([["b", 1], [10, 1], ["a", 1], [2, 1]]).keys()];   // ["b", 10, "a", 2]
```

```python
d = {"b": 1, 10: 1, "a": 1, 2: 1}
print(list(d))
d["b"] = 2
print(list(d))
del d["b"]
d["b"] = 3
print(list(d))
```

```text
['b', 10, 'a', 2]
['b', 10, 'a', 2]
[10, 'a', 2, 'b']
```

Поведінка розходиться саме на числових ключах: JSON з бекенду `{"10": ..., "2": ...}` після `JSON.parse` у браузері переставиться, а в Python після `json.loads` ні. Якщо фронтенд колись покладався на порядок ключів об'єкта, на Python-боці він раптом стане "правильним", і різниця вилізе на порівнянні результатів.

> **Під капотом.** З 3.6 словник у CPython складається з двох масивів: щільного масиву записів (хеш, ключ, значення) в порядку додавання і розрідженої хеш-таблиці індексів у цей масив. Пошук іде через таблицю індексів, а ітерація просто йде щільним масивом, тому порядок вставки виходить безкоштовно. Видалення лишає в масиві записів "дірку", яку прибирає наступна перебудова таблиці.

<!-- task: t2 -->

## dict проти Object і Map

`dict` синтаксично схожий на `Object`, а семантично на `Map`. Ключем може бути будь-який hashable об'єкт: рядок, число, `None`, кортеж. Ключі не приводяться до рядка, тож `1` і `"1"` це два різні ключі, як у `Map`. Зате `True` і `1` це один ключ, бо `True == 1` і в них однаковий хеш (`bool` це підклас `int`, m1-l03); `1.0` туди ж.

```ts
const obj: Record<string, string> = {};
obj[1] = "one";
obj["1"] = "uno";
console.log(Object.keys(obj));                  // ["1"]
const m = new Map<unknown, string>([[1, "one"], ["1", "uno"], [true, "yes"]]);
console.log(m.size);                            // 3
```

```python
by_key = {}
by_key[1] = "one"
by_key["1"] = "uno"
by_key[True] = "yes"
by_key[(1, 2)] = "pair"
by_key[None] = "nothing"
print(by_key)
print(len(by_key))
```

```text
{1: 'yes', '1': 'uno', (1, 2): 'pair', None: 'nothing'}
4
```

Розходження з обома JS-структурами в одному рядку: `True` не створив новий ключ, а перезаписав значення під ключем `1`, причому сам ключ лишився `1`, тим об'єктом, що був вставлений першим. `Object` привів би `1` до `"1"` і злив з рядковим ключем, `Map` тримав би `1`, `"1"` і `true` окремо, бо порівнює за SameValueZero, а не за `==`.

У словника немає прототипу. Порожній `{}` справді порожній: у ньому немає `toString`, `constructor` чи `__proto__`, а методи `keys`, `get`, `items` живуть на типі `dict` і не перетинаються з ключами. Ключ `"keys"` не ламає метод `.keys()`, а ключ `"__proto__"` з JSON це просто ключ, тож prototype pollution (вразливість, коли JSON з ключем `__proto__` змінює прототип усіх об'єктів) тут неможлива за побудовою.

```python
d = {"keys": 1, "items": 2, "__proto__": 3}
print(d.keys())
print(d["keys"], len(d))
print("toString" in {}, "keys" in {})
```

```text
dict_keys(['keys', 'items', '__proto__'])
1 3
False False
```

Крапкової нотації для ключів немає. `field.name` шукає атрибут об'єкта, `field["name"]` шукає ключ, і в Python це два різні простори імен з різними механізмами (`__getattribute__` і `__getitem__`, m4-l02). У JS `obj.name` і `obj["name"]` це одне й те саме, тому звичка друкувати крапку дає `AttributeError`. Коли потрібен доступ через крапку і відомі поля, це вже не словник, а dataclass (m2-l05) або Pydantic-модель (m2-l09).

```python
field = {"name": "email"}
print(field.name)
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    print(field.name)
          ^^^^^^^^^^
AttributeError: 'dict' object has no attribute 'name'
```

Від `Map` словник відрізняється зручністю: у нього є літерал, comprehension (m1-l10) і пряме перетворення в JSON і назад. `Map` у JS створюють через `new Map(Object.entries(obj))`, а `JSON.stringify(new Map([["a", 1]]))` мовчки дає `"{}"`. У Python немає вибору "Object чи Map": `dict` один, і він покриває обидва випадки.

```python live
import json

types = {name: kind for name, kind in [("email", "text"), ("age", "number")]}
print(types)
print(json.dumps(types))
print(json.loads('{"a": 1}') == {"a": 1})
```

```text
{'email': 'text', 'age': 'number'}
{"email": "text", "age": "number"}
True
```

<!-- task: q2 -->

## set: членство й алгебра множин

Літерал множини `{1, 2}`, але порожня множина тільки `set()`, бо `{}` це порожній словник (m1-l10). `add` додає елемент, `remove` видаляє і кидає `KeyError`, якщо елемента немає, `discard` видаляє мовчки. Порядок елементів не гарантований, тому в прикладах множини рядків сортуються перед друком.

```python live
required = {"email", "phone"}
required.add("email")
required.add("age")
print(len(required), sorted(required))
required.discard("zip")
required.remove("age")
print(sorted(required))
print("email" in required, type({}).__name__, set())
```

```text
3 ['age', 'email', 'phone']
['email', 'phone']
True dict set()
```

```python
required = {"email"}
required.remove("zip")
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    required.remove("zip")
KeyError: 'zip'
```

Головне, навіщо множина: перевірка `in` за O(1) і алгебра множин. У JS методи `union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf` з'явились лише в ES2025; до того писали `new Set([...a].filter((x) => b.has(x)))`. У Python це оператори `|`, `&`, `-`, `^`, `<=` і рівнозначні методи.

```ts
const a = new Set(["email", "phone", "age"]);
const b = new Set(["phone", "city"]);
a.union(b);              // Set {"email", "phone", "age", "city"}
a.intersection(b);       // Set {"phone"}
a.difference(b);         // Set {"email", "age"}
a.symmetricDifference(b);
new Set(["phone"]).isSubsetOf(a);   // true
```

```python
a = {"email", "phone", "age"}
b = {"phone", "city"}
print(sorted(a | b))
print(sorted(a & b))
print(sorted(a - b))
print(sorted(a ^ b))
print({"phone"} <= a, {"phone"}.issubset(a), a.isdisjoint({"zip"}))
print(sorted(a.union(["zip", "zip"])))
print(a | ["zip"])
```

```text
['age', 'city', 'email', 'phone']
['phone']
['age', 'email']
['age', 'city', 'email']
True True True
['age', 'email', 'phone', 'zip']
Traceback (most recent call last):
  File "main.py", line 9, in <module>
    print(a | ["zip"])
          ~~^~~~~~~~~
TypeError: unsupported operand type(s) for |: 'set' and 'list'
```

Оператори вимагають множину з обох боків, методи приймають будь-який iterable. Друга розбіжність важливіша. JS `Set` порівнює елементи за посиланням (SameValueZero), тому два масиви `[1, 2]` у ньому це два елементи. Python `set` порівнює через `==` і хеш, тому два однакові кортежі це один елемент, а `1`, `True` і `1.0` теж один.

```python live
print({(1, 2), (1, 2)})
print({1, True, 1.0})
print(len({"a", "a", "b"}))
```

```text
{(1, 2)}
{1}
2
```

> **Пастка.** JS `Set` зберігає порядок вставки, тому `[...new Set(arr)]` це дедуплікація зі збереженням порядку. Python `set` порядку не гарантує, і для рядків він змінюється навіть між запусками однієї програми, бо хеш рядка рандомізований на старті процесу. `list(set(ids))` дає унікальні елементи в довільному порядку.

```text
$ PYTHONHASHSEED=1 python -c 'print(list(set(["phone", "email", "phone", "age"])))'
['age', 'phone', 'email']
$ PYTHONHASHSEED=3 python -c 'print(list(set(["phone", "email", "phone", "age"])))'
['phone', 'age', 'email']
```

Дедуплікація зі збереженням порядку в Python іде через словник: `dict.fromkeys(xs)` створює словник з ключами з `xs` і значеннями `None`, ключі унікальні й ідуть у порядку першої появи. Якщо порядок не потрібен, а потрібен стабільний вивід, `sorted(set(xs))`.

```python live
ids = ["phone", "email", "phone", "age", "email"]
print(dict.fromkeys(ids))
print(list(dict.fromkeys(ids)))
print(sorted(set(ids)))
```

```text
{'phone': None, 'email': None, 'age': None}
['phone', 'email', 'age']
['age', 'email', 'phone']
```

Множина сама змінювана, тому не може бути елементом іншої множини чи ключем словника. Для цього є `frozenset`: незмінна й hashable версія `set` з тими самими операціями, але без `add` і `remove`; наприклад, ключ "комбінація полів" у правилі, де порядок полів не важливий.

```python live
rules = {frozenset({"email", "phone"}): "contact"}
print(rules[frozenset({"phone", "email"})])
```

```text
contact
```

<!-- task: t3 -->

## Хеш-таблиця: hashable і ціна `in`

`dict` і `set` побудовані на хеш-таблиці. Щоб знайти ключ, Python обчислює `hash(key)`, за ним одразу переходить до потрібної комірки таблиці й викликає `==` лише для записів з тим самим хешем, а не для всіх ключів. Тому пошук, вставка й видалення в середньому O(1), незалежно від розміру. Механізм має дві умови. Хеш ключа не може змінюватися, поки ключ лежить у таблиці, інакше пошук піде в іншу комірку. І рівні об'єкти зобов'язані мати рівні хеші: з `a == b` випливає `hash(a) == hash(b)`.

Об'єкт, який задовольняє обидві умови, називається hashable (офіційний термін з глосарію Python): у нього є `__hash__`, значення якого не змінюється за життя об'єкта, і `__eq__`, узгоджений з ним. Числа, рядки, `None`, кортежі з hashable елементів і `frozenset` hashable. Списки, словники й множини ні: їхній вміст змінюється, тож хеш від вмісту змінився б разом з ним, і Python просто не визначає для них `__hash__`. Як `__hash__` і `__eq__` пишуться для власних класів, розібрано в m4-l02.

```python
print(hash(42), hash(True), hash(1.0) == hash(1))
print(hash("email") == hash("email"), hash((1, "a")) == hash((1, "a")))
print(list.__hash__, dict.__hash__, tuple.__hash__ is not None)

key = ["email"]
before = hash(tuple(key))
key.append("phone")
print(before == hash(tuple(key)))
```

```text
42 1 True
True True
None None True
False
```

Останні два рядки показують, чому список не може бути ключем: якби хеш рахувався від вмісту, після `append` він став би іншим, і ключ "загубився" б у таблиці. Спроба покласти список у множину чи зробити ключем словника дає `TypeError: unhashable type`.

```python
seen = set()
seen.add(["email", "phone"])
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    seen.add(["email", "phone"])
TypeError: unhashable type: 'list'
```

> **Пастка.** Кортеж hashable лише тоді, коли hashable всі його елементи: хеш кортежу обчислюється з хешів елементів. Кортеж зі списком усередині виглядає незмінним, але ключем бути не може. Те саме зі словником усередині.

```python
layout = {}
layout[(1, ["email"])] = "page 1"
```

```text
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    layout[(1, ["email"])] = "page 1"
    ~~~~~~^^^^^^^^^^^^^^^^
TypeError: unhashable type: 'list'
```

Виправлення завжди одне: перетворити змінюваний вміст на незмінний перед тим, як класти в ключ. Список стає кортежем, множина стає `frozenset`, словник стає кортежем пар `tuple(sorted(d.items()))` або, частіше, кортежем з потрібних полів.

```python live
option = {"value": "ua", "label": "Україна"}
key = (option["value"], option["label"])
seen = {key}
print(("ua", "Україна") in seen)
print({(1, ("email",)): "page 1"})
```

```text
True
{(1, ('email',)): 'page 1'}
```

Звідси й складність базових операцій. `in` для списку перебирає елементи по одному і порівнює через `==`, тобто O(n); для `set` і `dict` це обчислення хешу й перехід до комірки, O(1) в середньому. Решта таблиці для повсякденних рішень:

| Операція | `list` | `set` | `dict` |
|---|---|---|---|
| `x in c` | O(n) | O(1) | O(1), по ключах |
| `c[i]` / `d[key]` | O(1) | немає | O(1) |
| `append` / `add` / `d[key] = v` | O(1) амортизовано | O(1) | O(1) |
| `insert(0, x)` / `pop(0)` | O(n) | немає | немає |
| `pop()` з кінця | O(1) | O(1), довільний елемент | немає |
| `len(c)` | O(1) | O(1) | O(1) |

Хеш-таблиця прискорює лише пошук за ключем. `x in d.values()` перебирає значення одне за одним, як список, тобто O(n). `(key, value) in d.items()` залишається O(1): view спершу шукає ключ у таблиці й лише потім порівнює значення.

Одне вимірювання на цьому комп'ютері (Apple M1 Pro, Python 3.12), щоб відчути порядок: 1000 перевірок відсутнього елемента в колекції зі 100 000 рядків. Абсолютні цифри відрізнятимуться на вашій машині й між запусками, але різниця в тисячі разів лишиться: вона росте разом із розміром списку.

```python
from timeit import timeit

ids_list = [f"field_{i}" for i in range(100_000)]
ids_set = set(ids_list)

t_list = timeit(lambda: "missing" in ids_list, number=1_000)
t_set = timeit(lambda: "missing" in ids_set, number=1_000)
print(f"list: {t_list * 1000:.1f} ms")
print(f"set:  {t_set * 1000:.3f} ms")
print(f"set швидший у {t_list / t_set:.0f} разів")
```

```text
list: 487.1 ms
set:  0.030 ms
set швидший у 16488 разів
```

Побудова множини зі списку сама коштує O(n), тому перетворювати є сенс тоді, коли перевірок багато. Типовий випадок, де це критично: `if x in some_list` усередині циклу по іншій колекції. Це O(n·m), яке на тисячах елементів уже відчутне; множину будують один раз перед циклом.

Вибір структури зводиться до питання, яку операцію ви робитимете найчастіше. Потрібен порядок і дозволені дублікати: `list`. Потрібна перевірка "чи є" або унікальність: `set`. Потрібен пошук за ключем: `dict`. Потрібен незмінний запис фіксованої форми або складений ключ: `tuple`.

```python live
fields = ["email", "phone", "email", "age"]
allowed = {"email", "phone", "age", "plan"}
by_name = {"email": {"type": "email"}, "phone": {"type": "tel"}}
position = (1, 2)

print([f for f in fields if f in allowed])
print(by_name["phone"]["type"])
print({position: "phone"}[1, 2])
```

```text
['email', 'phone', 'email', 'age']
tel
phone
```

<!-- task: t4 -->

<!-- task: q3 -->

## Вкладені структури і JSON

JSON-конфіг з фронтенду в Python стає вкладеними словниками й списками, і доступ до глибокого значення це ланцюжок `[]`. Різниця з JS у тому, що відсутній рівень не дає `undefined`, який тихо пройде далі, а кидає `KeyError` чи `IndexError` саме на тому кроці, де ключа немає (механізм і EAFP у m1-l11). Оператора `?.` у Python немає.

```ts
const config = {
  elements: [
    { name: "email", validation: { required: true } },
    { name: "age" },
  ],
};
config.elements[1].validation?.required;      // undefined
config.elements[1].validation.required;       // TypeError: Cannot read properties of undefined
```

```python
config = {
    "elements": [
        {"name": "email", "validation": {"required": True}},
        {"name": "age"},
    ],
}
print(config["elements"][0]["name"])
print(config["elements"][0]["validation"]["required"])
print(config["elements"][1].get("validation", {}).get("required", False))
print(config["elements"][1]["validation"]["required"])
```

```text
email
True
False
Traceback (most recent call last):
  File "main.py", line 10, in <module>
    print(config["elements"][1]["validation"]["required"])
          ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^
KeyError: 'validation'
```

Traceback у 3.12 підкреслює саме той індекс, на якому впав ланцюжок, тож "який рівень відсутній" видно без дебагера. Правило з m1-l11 тут стає практичним: `[]` для рівнів, які зобов'язані бути за контрактом, `.get(key, {})` для необов'язкових, і не змішувати, бо `.get` без default на середньому рівні повертає `None` і наступний `[]` дасть `TypeError` замість чесного `KeyError`.

```python live
config = {"elements": [{"name": "email"}]}
lookups = [
    lambda: config["elements"][0]["name"],
    lambda: config["elements"][1]["name"],
    lambda: config["elements"][0]["label"],
    lambda: config.get("theme")["color"],
]
for lookup in lookups:
    try:
        print(lookup())
    except (KeyError, IndexError, TypeError) as e:
        print(f"{type(e).__name__}: {e}")
```

```text
email
IndexError: list index out of range
KeyError: 'label'
TypeError: 'NoneType' object is not subscriptable
```

Модуль `json` переводить JSON у Python-типи за фіксованою таблицею: object стає `dict`, array стає `list`, string `str`, ціле число `int`, число з дробовою частиною `float`, `true` і `false` стають `True` і `False`, `null` стає `None`. Кортежів і множин після `json.loads` не буває ніколи.

```python live
import json

text = '{"name": "email", "max": 100, "ratio": 0.5, "required": true, "hint": null, "options": ["a", "b"]}'
data = json.loads(text)
for key, value in data.items():
    print(key, type(value).__name__, repr(value))
```

```text
name str 'email'
max int 100
ratio float 0.5
required bool True
hint NoneType None
options list ['a', 'b']
```

`json.dumps` іде у зворотний бік. За замовчуванням усе, що не ASCII, екранується як `\uXXXX`: це валідний JSON, але українські мітки стають нечитабельними, тому для конфігів і логів передають `ensure_ascii=False`. `indent` форматує, `sort_keys=True` сортує ключі, що зручно для стабільних диффів і снапшот-тестів. Кортеж серіалізується як список.

```python live
import json

field = {"name": "email", "label": "Пошта", "position": (1, 2), "required": True, "hint": None}
print(json.dumps(field))
print(json.dumps(field, ensure_ascii=False))
print(json.dumps(field, ensure_ascii=False, indent=2, sort_keys=True))
```

```text
{"name": "email", "label": "\u041f\u043e\u0448\u0442\u0430", "position": [1, 2], "required": true, "hint": null}
{"name": "email", "label": "Пошта", "position": [1, 2], "required": true, "hint": null}
{
  "hint": null,
  "label": "Пошта",
  "name": "email",
  "position": [
    1,
    2
  ],
  "required": true
}
```

Множина не серіалізується взагалі, і це `TypeError`, а не тихий результат, як `JSON.stringify(new Set([1]))`, що дає `"{}"`. Найпростіше виправлення: перетворити множину на відсортований список перед `dumps` або передати `default=sorted`, функцію, яку `json` викликає для кожного об'єкта, що не вміє серіалізувати сам.

```python
import json

print(json.dumps({"required": {"phone", "email"}}, default=sorted))
try:
    json.dumps({"required": {"email"}})
except TypeError as e:
    print("TypeError:", e)
```

```text
{"required": ["email", "phone"]}
TypeError: Object of type set is not JSON serializable
```

Ключі об'єкта в JSON завжди рядки. Словник з цілими ключами `dumps` перетворить на рядкові, а `loads` поверне рядкові, і `restored[1]` це вже `KeyError`, бо в Python `1` і `"1"` різні ключі. Кортеж ключем JSON-об'єкта бути не може зовсім. Читання й запис JSON-файлів через `json.load` і `json.dump` розібрані в m6-l02.

```python
import json

positions = {1: "email", 2: "phone"}
restored = json.loads(json.dumps(positions))
print(restored)
print(restored == positions, restored.get(1), restored["1"])
try:
    json.dumps({(1, 2): "email"})
except TypeError as e:
    print("TypeError:", e)
```

```text
{'1': 'email', '2': 'phone'}
False None email
TypeError: keys must be str, int, float, bool or None, not tuple
```

<!-- task: q4 -->

## Для капстоуну

Конфіг форми FormBuilder приходить як JSON і до m2-l09, де він стане набором Pydantic-моделей, живе як вкладений `dict`. Елементи лежать списком, бо в редакторі вони впорядковані й ідуть один за одним. Але бекенду майже ніколи не потрібен "елемент номер 3": потрібен елемент за `name`, множина обов'язкових полів і порядок рендеру. Тому після `json.loads` з конфігу один раз будуються три похідні структури.

```python
import json

raw = """
{
  "title": "Реєстрація",
  "elements": [
    {"name": "phone", "type": "tel", "page": 1, "order": 3},
    {"name": "email", "type": "email", "page": 1, "order": 1, "required": true},
    {"name": "plan", "type": "select", "page": 2, "order": 1, "required": true},
    {"name": "name", "type": "text", "page": 1, "order": 2, "required": true}
  ]
}
"""
config = json.loads(raw)
elements = config["elements"]

by_name = {el["name"]: el for el in elements}
required = {el["name"] for el in elements if el.get("required", False)}
ordered = sorted(elements, key=lambda el: (el["page"], el["order"]))

print(by_name["plan"]["type"])
print(sorted(required))
print([(el["page"], el["order"], el["name"]) for el in ordered])

answers = {"email": "a@b.c", "phone": "+380", "promo": "X"}
print(sorted(required - answers.keys()))
print(sorted(answers.keys() - by_name.keys()))
```

```text
select
['email', 'name', 'plan']
[(1, 1, 'email'), (1, 2, 'name'), (1, 3, 'phone'), (2, 1, 'plan')]
['name', 'plan']
['promo']
```

`by_name` перетворює пошук елемента з O(n) по списку на O(1) по словнику, і через нього проходять умовні правила `visible_if`, які посилаються на інші поля за іменем. `required` це множина, бо єдине, що з нею роблять, це перевірка членства й різниця з ключами відповідей. Ключ сортування `(page, order)` працює тому, що кортежі порівнюються поелементно: спершу сторінка, і лише за рівних сторінок порядок. Це той самий механізм, що в `sorted(key=...)` з m1-l10, тільки з кількома рівнями без жодного компаратора.

```python
print((1, 3) < (2, 1), (1, 2) < (1, 10), (2, 1) < (1, 99))
print(sorted([(2, 1), (1, 10), (1, 2)]))
print(sorted(["10", "2", "1"]))
```

```text
True True False
[(1, 2), (1, 10), (2, 1)]
['1', '10', '2']
```

> **Для капстоуну.** Dict comprehension `{el["name"]: el for el in elements}` мовчки перезаписує дублікати: два елементи з однаковим `name` дадуть індекс з одним, і другий просто зникне. Перевірка унікальності `len(by_name) != len(elements)` має стояти одразу після побудови індексу. А якщо `page` і `order` прийшли з фронтенду рядками, сортування `("1", "10") < ("1", "2")` буде лексикографічним, і `"10"` стане раніше `"2"`; у m2-l09 це закриє Pydantic, тут перетворюйте явно через `int(...)`.

<!-- task: t5 -->

## Типові помилки JS-розробника

1. **`d.key` замість `d["key"]`.** Крапкова нотація шукає атрибут, а не ключ. Правильно: `d["key"]` для обов'язкового ключа, `d.get("key", default)` для необов'язкового.

   ```python
   field = {"name": "email"}
   field.name          # AttributeError: 'dict' object has no attribute 'name'
   field["name"]       # 'email'
   ```

2. **`xs.length` і `d.size`.** Довжина будь-якої колекції це вбудована функція `len`, яка викликає `__len__` об'єкта. Правильно: `len(xs)`.

   ```python
   ids = ["email", "phone"]
   ids.length          # AttributeError: 'list' object has no attribute 'length'
   len(ids)            # 2
   ```

3. **Присвоєння результату `append`, `sort`, `update`.** Методи, що змінюють об'єкт на місці, повертають `None`. Правильно: викликати метод окремим рядком або брати функцію, що повертає нове: `sorted`, `a | b`, `xs + [x]`.

   ```python
   ids = ["phone", "email"]
   ids = ids.sort()            # ids is None
   ids = sorted(["phone", "email"])   # ['email', 'phone']
   ```

4. **`Object.keys(d)` за звичкою.** Пишуть `list(d.keys())` для ітерації, перевірки чи довжини. Словник сам iterable по ключах, `in` перевіряє ключі, `len` рахує ключі. Правильно: `for key in d`, `key in d`, `len(d)`; `list(d)` лише тоді, коли справді потрібен список.

   ```python
   answers = {"email": "a@b.c", "phone": ""}
   "email" in answers.keys()   # True, але зайвий виклик
   "email" in answers          # True
   list(answers)               # ['email', 'phone']
   ```

5. **`list(set(xs))` як `[...new Set(arr)]`.** Унікальні елементи будуть, порядку ні. Правильно: `list(dict.fromkeys(xs))` для збереження порядку, `sorted(set(xs))` для стабільного виводу.

   ```python
   ids = ["phone", "email", "phone"]
   list(dict.fromkeys(ids))    # ['phone', 'email']
   sorted(set(ids))            # ['email', 'phone']
   ```

6. **`Array.isArray(x)` як "це послідовність".** Аналог `isinstance(x, list)`, але кортеж під нього не підпадає, і перевірка мовчки відкидає кортежі, які теж послідовності. Правильно: `isinstance(x, list)` для даних з JSON (там завжди `list`), `isinstance(x, (list, tuple))`, коли приходять обидва.

   ```python
   isinstance([1], list), isinstance((1,), list)   # (True, False)
   isinstance((1,), (list, tuple))                  # True
   ```

7. **Очікування, що ключі з JSON можна читати числом.** `JSON.parse` дає об'єкт, де `obj[1]` і `obj["1"]` це одне. У Python після `json.loads` ключі рядкові, а `d[1]` шукає цілий ключ. Правильно: читати рядком або перетворити ключі явно `{int(k): v for k, v in d.items()}`.

   ```python
   import json
   d = json.loads('{"1": "email"}')
   d.get(1), d["1"]                         # (None, 'email')
   {int(k): v for k, v in d.items()}[1]     # 'email'
   ```

8. **`indexOf(x) !== -1` і `indexOf` як перевірка.** `index` не повертає `-1`, він кидає `ValueError`. Правильно: `x in xs` для перевірки, `index` лише тоді, коли елемент гарантовано є або `ValueError` обробляється.

   ```python
   ids = ["email"]
   "zip" in ids        # False
   ids.index("zip")    # ValueError: 'zip' is not in list
   ```

## Підсумок

- `list` для впорядкованих даних з дублікатами, `tuple` для незмінного запису і складеного ключа, `dict` для пошуку за ключем, `set` для членства й унікальності.
- Колекції порівнюються за вмістом через `==`; `is` це JS-ний `===` для об'єктів.
- Методи, що змінюють список на місці (`append`, `sort`, `reverse`, `extend`), повертають `None`; `sorted` і `reversed` повертають нове.
- `index` і `remove` кидають `ValueError`, `d[key]` кидає `KeyError`; перевірка наявності це `in`.
- Кортеж створює кома: `(1,)`, а не `(1)`; незмінність кортежу неглибока.
- `dict` зберігає порядок вставки з 3.7, ключі не приводяться до рядка, `True` і `1` один ключ, прототипу й крапкової нотації немає.
- `keys()`, `values()`, `items()` це живі view-об'єкти, а `keys()` і `items()` ще й підтримують операції множин.
- Ключ `dict` і елемент `set` мають бути hashable; список, словник, множина і кортеж зі змінюваним усередині не hashable.
- `in` для `list` O(n), для `set` і `dict` O(1); множину будують один раз перед циклом перевірок.
- JSON дає лише `dict`, `list`, `str`, `int`, `float`, `bool`, `None`; ключі завжди рядки, кортеж стає списком, множина не серіалізується.

## Що далі

Наступний урок m2-l02 про змінюваність, aliasing, `copy` і `deepcopy`. Звідси там знадобиться все про незмінність кортежу, яка виявилась неглибокою, `[[]] * 3` з трьома посиланнями на один список і view-об'єкти, які бачать зміни словника. Далі m2-l03 розбирає зрізи й розпакування, які тут використовувались лише в найпростішій формі, а m2-l04 додає до чотирьох базових колекцій `Counter`, `defaultdict`, `deque` і `namedtuple`.
