---
id: m4-l02
module: m4-oop
title: "dunder-методи: __repr__, __eq__, __hash__, __iter__, __call__"
summary: "Учень пише класи, з якими працюють print, ==, set і dict, sorted, len, for, in, зрізи, арифметичні оператори й виклик через дужки, знає, що синтаксис шукає ці методи на типі, дотримується контракту __eq__ і __hash__ і повертає NotImplemented для чужих типів."
duration_min: 90
prerequisites: [m4-l01]
---

## Протокол через імена: синтаксис викликає метод типу

Майже кожна вбудована операція Python це виклик методу з фіксованим ім'ям. `len(x)` викликає `__len__`, `a + b` викликає `__add__`, `x[k]` це `__getitem__`, `for` просить `__iter__`, `print(x)` бере `__str__`, `f()` це `__call__`. Такі методи документація називає special methods (офіційний термін, розділ "Data model" у Language Reference), а спільнота називає dunder-методами (жаргон від "double underscore"; на співбесіді вживають обидва). Набір методів, за яким працює певний синтаксис, неформально називають протоколом (m2-l07): ваш клас підключається до `len`, `for` чи `+`, коли визначає метод з потрібним ім'ям, без наслідування й реєстрації.

```python live
class Page:
    def __init__(self, *fields: str) -> None:
        self.fields = list(fields)

    def __len__(self) -> int:
        return len(self.fields)

    def __contains__(self, name: str) -> bool:
        return name in self.fields


page = Page("email", "phone")
print(len(page), type(page).__len__(page))
print("email" in page, Page.__contains__(page, "email"))
print(len("abc"), str.__len__("abc"))
print(1 + 2, int.__add__(1, 2))
```

```text
2 2
True True
3 3
3 3
```

Друга колонка кожного рядка це те, у що інтерпретатор перетворює першу: метод береться з типу об'єкта, а сам об'єкт передається як `self`. Вбудовані типи влаштовані так само, як ваш `Page`: у `str` є `__len__`, у `int` є `__add__`. Окремого механізму "для своїх" немає.

```ts
const tags = new Set(["a", "b"]);
const answers = new Map([["email", "a@b.c"]]);
console.log([1, 2].length, "abc".length, tags.size, answers.size);
```

```python
tags = {"a", "b"}
answers = {"email": "a@b.c"}
print(len([1, 2]), len("abc"), len(tags), len(answers))
```

```text
2 3 2 1
```

У JS розмір кожен тип називає по-своєму: `length` у масиву й рядка, `size` у `Set` і `Map`, а в об'єкта розміру немає взагалі. Python обрав одну вбудовану функцію і один метод-протокол, і ось чому. Перше: імена з подвійними підкресленнями зарезервовані за мовою, тож ваш атрибут `length` чи `size` ніколи не конфліктує з протоколом. Друге: вбудована функція стоїть між викликом і методом і перевіряє контракт, наприклад що довжина це невід'ємний `int`. Третє: для вбудованих типів `len` не шукає метод за іменем зовсім, а читає готовий вказівник у C-структурі типу, тому `len(list)` дешевший за виклик звичайного методу.

```python
class Broken:
    def __len__(self) -> int:
        return -1


print(len(Broken()))
```

```text
ValueError: __len__() should return >= 0
```

> **Під капотом.** Синтаксис шукає special method на типі, а не на екземплярі: `len(x)` це `type(x).__len__(x)`. Під час створення класу CPython розкладає ваші dunder-методи по слотах C-структури типу (`tp_repr`, `sq_length`, `nb_add`), і операції читають слот, а не `__dict__` екземпляра. Тому атрибут `__repr__`, записаний на екземпляр, `repr()` ігнорує (те саме з `__len__` показано в m2-l07), а метод, присвоєний класу після створення, підхоплюється: присвоєння оновлює слот.

Пошук на типі не примха оптимізації, а єдиний несуперечливий варіант. Клас теж об'єкт, і в нього є атрибут `__repr__`: це функція для екземплярів, яка чекає `self`. Якби `repr(Point)` шукав метод на самому об'єкті, він знайшов би саме її і викликав без екземпляра. Шукаючи на типі, `repr(Point)` бере `type(Point).__repr__`, тобто `type.__repr__`, і друкує клас як клас.

```python live
class Point:
    def __init__(self, x: int, y: int) -> None:
        self.x, self.y = x, y

    def __repr__(self) -> str:
        return f"Point({self.x}, {self.y})"


p = Point(1, 2)
print(repr(p))
print(repr(Point))
print(Point.__repr__(p))

p.__repr__ = lambda: "instance attr"
print(repr(p), p.__repr__())

Point.__repr__ = lambda self: f"P<{self.x},{self.y}>"
print(repr(p))
```

```text
Point(1, 2)
<class '__main__.Point'>
Point(1, 2)
Point(1, 2) instance attr
P<1,2>
```

> **JS-аналог.** Найближче до протоколів у JS це well-known symbols: `Symbol.iterator`, `Symbol.toPrimitive`, а також `toString` і `valueOf`. Різниць дві. JS шукає їх звичайним доступом до властивості, тому `obj[Symbol.iterator] = ...` на конкретному екземплярі працює, а в Python атрибут екземпляра ігнорується. І `toString`/`valueOf` у JS існують для неявної коерції: рушій сам перетворює об'єкт на примітив у `obj + 1` чи `${obj}`. У Python коерції немає, кожна операція має власний метод, і якщо його немає, буде `TypeError`, а не перетворення.

<!-- task: q1 -->

## `__repr__` і `__str__`: для розробника і для користувача

Без власних методів екземпляр друкується як `<__main__.Field object at 0x...>`: це `object.__repr__`, яке знає лише ім'я класу й адресу (m4-l01). Методів для тексту два, і в них різні адресати. `__repr__` для розробника: однозначне представлення, яке бачать REPL, відлагоджувач, логи, повідомлення pytest про невдалий `assert` і будь-який контейнер. `__str__` для людини, яка читає результат: його викликають `print`, `str()` і f-рядок без конвертера.

```python live
class Field:
    def __init__(self, name: str, required: bool = False) -> None:
        self.name = name
        self.required = required

    def __repr__(self) -> str:
        return f"{type(self).__name__}({self.name!r}, required={self.required!r})"

    def __str__(self) -> str:
        return self.name + ("*" if self.required else "")


f = Field("email", required=True)
print(f)
print(str(f), repr(f))
print(f"{f} | {f!r} | {f!s}")
print([f, Field("note")])
print({"field": f})
```

```text
email*
email* Field('email', required=True)
email* | Field('email', required=True) | email*
[Field('email', required=True), Field('note', required=False)]
{'field': Field('email', required=True)}
```

Контейнери завжди показують `repr` елементів, навіть коли сам контейнер друкують через `print`. `str` списку не має власного `__str__` і падає на `list.__repr__`, а той викликає `repr` кожного елемента. Інакше рядок `"1"` і число `1` в одному списку виглядали б однаково. Конвертери в f-рядку явно обирають метод: `{x!r}` викликає `repr`, `{x!s}` викликає `str`, без конвертера працює `str`.

```python
print(["1", 1])
print(str(["1", 1]) == repr(["1", 1]))
```

```text
['1', 1]
True
```

REPL друкує результат виразу через `sys.displayhook`, а той викликає `repr`. Тому в інтерактивній сесії рядок видно в лапках, а ваш об'єкт без `__repr__` видно як адресу. Нижче той самий хук, викликаний явно.

```python
import sys


class Field:
    def __init__(self, name: str) -> None:
        self.name = name

    def __repr__(self) -> str:
        return f"Field({self.name!r})"


sys.displayhook(Field("email"))
sys.displayhook("email")
print("email")
```

```text
Field('email')
'email'
email
```

Чому `__repr__` обов'язковий, а `__str__` за потреби: `object.__str__` за замовчуванням викликає `repr`, а не навпаки. Клас лише з `__repr__` отримує обидва представлення однаковими, клас лише з `__str__` у списку, у лозі й у відлагоджувачі лишається адресою. Формат `__repr__` за конвенцією з документації має виглядати як вираз, що створює рівний об'єкт: `Field('email', required=True)`. Тому всередині `__repr__` значення підставляють через `!r`, щоб рядки отримали лапки, а ім'я класу беруть з `type(self).__name__`, щоб підклас друкувався своїм іменем. Коли відтворити об'єкт виразом неможливо (з'єднання, файл, задача в черзі), пишуть кутові дужки: `<Job 42 running>`.

> **Пастка.** JS-звичка писати лише `toString()` переноситься як "написати лише `__str__`". `print(obj)` виглядає добре, і ви не помічаєте проблеми, доки об'єкт не потрапить у список, у `assert` або в лог через `%r`.

```python
class OnlyStr:
    def __str__(self) -> str:
        return "only-str"


x = OnlyStr()
print(x)
print([x])
```

```text
only-str
[<__main__.OnlyStr object at 0x104f3a3c0>]
```

<!-- task: t1 -->

## `__eq__` і `__hash__`: рівність і контракт хешу

`==` за замовчуванням успадковується від `object` і означає identity (m1-l03). У JS на цьому все: `==` і `===` для об'єктів не перевизначаються, і метод `equals` за конвенцією оператор ніколи не викличе. У Python власний `__eq__` вирішує, що таке рівність для вашого типу. Три правила для нього. Для чужого типу повертати `NotImplemented` (вбудована константа, не виняток), а не `False`. `!=` писати не треба: `object.__ne__` викликає ваш `__eq__` і інвертує результат. І найважливіше: щойно клас визначив `__eq__`, Python записує в нього `__hash__ = None`, і екземпляри перестають бути hashable.

```python live
class FieldRef:
    def __init__(self, form_id: str, field_id: str) -> None:
        self.form_id = form_id
        self.field_id = field_id

    def __repr__(self) -> str:
        return f"FieldRef({self.form_id!r}, {self.field_id!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, FieldRef):
            return NotImplemented
        return (self.form_id, self.field_id) == (other.form_id, other.field_id)


a = FieldRef("signup", "email")
b = FieldRef("signup", "email")
print(a == b, a != b, a is b)
print(a == "email", a.__eq__("email"))
print(FieldRef.__hash__)
print({a})
```

```text
True False False
False NotImplemented
None
TypeError: unhashable type: 'FieldRef'
```

Чому Python відбирає хеш. `dict` і `set` спираються на контракт: з `a == b` випливає `hash(a) == hash(b)` (хеш-таблиця детально в m2-l01). Успадкований `object.__hash__` рахується від `id` і узгоджений лише з identity-рівністю. Щойно рівність стала порівнювати поля, два рівні об'єкти з різними `id` мали б різні хеші, і множина тримала б обидва. Python не знає, які поля ви вважаєте значущими, тому замість тихого порушення контракту робить клас unhashable. Ось що було б, якби хеш від `id` лишився:

```python
class BadRef(FieldRef):
    __hash__ = object.__hash__


refs = {BadRef("signup", "email"), BadRef("signup", "email")}
print(len(refs))
print(BadRef("signup", "email") in refs)
```

```text
2
False
```

Правильний `__hash__` рахується з тих самих полів, що й `__eq__`, найпростіше через кортеж: `hash((self.form_id, self.field_id))`. Обернене не вимагається: різні об'єкти можуть мати однаковий хеш (колізія), таблиця тоді просто порівняє їх через `==`.

```python live
class FieldRef:
    def __init__(self, form_id: str, field_id: str) -> None:
        self.form_id = form_id
        self.field_id = field_id

    def __repr__(self) -> str:
        return f"FieldRef({self.form_id!r}, {self.field_id!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, FieldRef):
            return NotImplemented
        return (self.form_id, self.field_id) == (other.form_id, other.field_id)

    def __hash__(self) -> int:
        return hash((self.form_id, self.field_id))


a = FieldRef("signup", "email")
b = FieldRef("signup", "email")
print(hash(a) == hash(b), len({a, b}))
labels = {a: "Email"}
print(labels[FieldRef("signup", "email")])

seen = {a}
a.field_id = "phone"
print(a in seen)
print(FieldRef("signup", "email") in seen)
print(seen)
```

```text
True 1
Email
False
False
{FieldRef('signup', 'phone')}
```

Останні три рядки пояснюють, чому змінюваний об'єкт не має бути hashable. Об'єкт лежить у кошику, обчисленому від старого хешу. Після зміни поля пошук за новим хешем іде в інший кошик і нічого не знаходить, а пошук рівним "старим" ключем потрапляє в правильний кошик, але `==` з уже зміненим об'єктом дає `False`. Об'єкт є в множині, ітерація його показує, а знайти його неможливо. Звідси правило, якого дотримуються вбудовані типи: або незмінний і hashable (`str`, `tuple`, `frozenset`), або змінюваний і без хешу (`list`, `dict`, `set`). Для своїх класів `@dataclass(frozen=True)` генерує обидва методи разом (m2-l05), а read-only атрибути руками робляться через `property` і `__slots__` (m4-l03).

> **Під капотом.** `a == b` викликає `a.__eq__(b)`. Якщо результат `NotImplemented`, Python пробує дзеркальний `b.__eq__(a)`, а якщо й там `NotImplemented`, порівнює identity. Виняток з порядку: якщо тип `b` є підкласом типу `a` і перевизначає метод, першим питають `b`. Саме тому `NotImplemented` кращий за `False`: він дає слово другому операнду. `False` обриває діалог, і рівність стає несиметричною.

```python
class Strict:
    def __init__(self, v: int) -> None:
        self.v = v

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Strict):
            return False
        return self.v == other.v


class Loose:
    def __init__(self, v: int) -> None:
        self.v = v

    def __eq__(self, other: object) -> bool:
        return self.v == getattr(other, "v", other)


print(Strict(1) == Loose(1), Loose(1) == Strict(1))
Strict.__eq__ = lambda self, other: (
    self.v == other.v if isinstance(other, Strict) else NotImplemented
)
print(Strict(1) == Loose(1), Loose(1) == Strict(1))
```

```text
False True
True True
```

> **Пастка.** Хеш рядків у CPython рандомізований для кожного процесу (захист від атак на хеш-таблиці; керується змінною `PYTHONHASHSEED`). `hash("email")` стабільний усередині одного запуску й різний між запусками, тому його не можна зберігати в базі, у файлі кешу чи передавати іншому воркеру. Для стабільного ключа беруть `hashlib`.

```python
import subprocess
import sys

cmd = [sys.executable, "-c", "print(hash('email'))"]
values = {
    subprocess.run(cmd, capture_output=True, text=True, env={"PYTHONHASHSEED": seed}).stdout
    for seed in ("1", "2", "3")
}
print(len(values))
```

```text
3
```

<!-- task: q2 -->

## Порядок: `__lt__`, `total_ordering` і `sorted` без `key`

Операторів порівняння шість, і кожен має свій метод: `__lt__` (`<`), `__le__` (`<=`), `__gt__`, `__ge__`, `__eq__`, `__ne__`. Документація називає їх rich comparison methods (офіційний термін). На відміну від `__ne__`, решта одне з одного не виводиться: `<=` не дорівнює автоматично "`<` або `==`". Зате працює віддзеркалення: якщо в `a` немає `__gt__`, `a > b` спробує `b.__lt__(a)`. `sorted`, `list.sort`, `min` і `max` використовують лише `<` (з віддзеркаленням), тому для сортування без `key` досить одного `__lt__`.

```python live
class Version:
    def __init__(self, text: str) -> None:
        self.parts = tuple(int(p) for p in text.split("."))

    def __repr__(self) -> str:
        return f"Version({'.'.join(map(str, self.parts))!r})"

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        return self.parts < other.parts


versions = [Version("1.10.0"), Version("1.2.3"), Version("1.2.0")]
print(sorted(versions))
print(max(versions))
print(Version("1.2") > Version("1.1"))
print(Version("1.2") <= Version("1.3"))
```

```text
[Version('1.2.0'), Version('1.2.3'), Version('1.10.0')]
Version('1.10.0')
True
TypeError: '<=' not supported between instances of 'Version' and 'Version'
```

Уся логіка порядку тут в одному рядку: кортежі порівнюються поелементно, тому `(1, 10, 0) > (1, 2, 3)`. У JS `["1.10.0", "1.2.3"].sort()` порівнює рядки й ставить `1.10.0` першим, а будь-яке порівняння об'єктів вимагає компаратора в кожному місці виклику. У Python об'єкт сам знає свій порядок, і `sorted`, `min`, `max`, `bisect` працюють з ним без параметрів.

Щоб не писати всі чотири методи порядку, `functools.total_ordering` добудовує відсутні з `__eq__` і одного з `__lt__`, `__le__`, `__gt__`, `__ge__`. Ціна в тому, що згенеровані методи роблять додатковий виклик, тож на гарячому шляху сортування мільйонів об'єктів вони помітно повільніші. Альтернатива для класів-записів: `@dataclass(order=True)`, який порівнює поля як кортеж у порядку оголошення (m2-l05).

```python live
from functools import total_ordering


@total_ordering
class Version:
    def __init__(self, text: str) -> None:
        self.parts = tuple(int(p) for p in text.split("."))

    def __repr__(self) -> str:
        return f"Version({'.'.join(map(str, self.parts))!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        return self.parts == other.parts

    def __hash__(self) -> int:
        return hash(self.parts)

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return NotImplemented
        return self.parts < other.parts


a, b = Version("1.2"), Version("1.3")
print(a <= b, a >= b, b > a, a != b)
print(a == "1.2")
print(a < "1.3")
```

```text
True False True True
False
TypeError: '<' not supported between instances of 'Version' and 'str'
```

Поведінка з чужим типом різна для `==` і `<`, і це те саме правило з m1-l03. Обидва методи повернули `NotImplemented`, обидві сторони відмовились; для `==` є запасний варіант, identity, і результат `False`, для `<` запасного варіанту немає, і Python кидає `TypeError`. Природний порядок типу варто задавати лише тоді, коли він справді один. Поля форми можна сортувати за позицією, за назвою, за датою зміни, і тут `sorted(fields, key=...)` чесніший за `__lt__`, що обрав один з варіантів за всіх.

<!-- task: t2 -->

## Контейнер: `__len__`, `__getitem__`, `__contains__`, `__iter__`

`x[key]` викликає `type(x).__getitem__(x, key)`, і `key` це рівно те, що стоїть у дужках: `int`, рядок, кортеж для `x[1, 2]` або об'єкт `slice` для `x[1:3]` (m2-l03). Клас сам вирішує, які ключі приймає. Найпростіший робочий шлях: зберігати дані у списку й делегувати йому, тоді від'ємні індекси, `IndexError` і вся семантика зрізів дістаються безкоштовно. Контракт зрізу: він повертає об'єкт того самого типу, як зріз списку повертає список.

```python live
class FieldList:
    def __init__(self, names: list[str]) -> None:
        self._names = list(names)

    def __repr__(self) -> str:
        return f"FieldList({self._names!r})"

    def __len__(self) -> int:
        return len(self._names)

    def __getitem__(self, key):
        print("key:", repr(key))
        if isinstance(key, slice):
            return FieldList(self._names[key])
        return self._names[key]


fl = FieldList(["email", "phone", "age", "note"])
print(fl[0])
print(fl[-1])
print(fl[1:3])
print(fl[::2])
print(len(fl), bool(fl), bool(FieldList([])))
```

```text
key: 0
email
key: -1
note
key: slice(1, 3, None)
FieldList(['phone', 'age'])
key: slice(None, None, 2)
FieldList(['email', 'age'])
4 True False
```

Якщо дані лежать не у списку, `slice.indices(len)` перетворює зріз на конкретні `(start, stop, step)` з урахуванням `None` і від'ємних меж, і далі це звичайний `range`. Запис і видалення через дужки це окремі методи `__setitem__` і `__delitem__`; без них `fl[0] = "x"` дає `TypeError`. Truthiness контейнера без `__bool__` береться з `__len__`, це видно в останньому рядку виводу вище (порядок перевірки в m1-l03).

```python
print(slice(None, None, -1).indices(4), slice(-2, None).indices(4))
print(list(range(*slice(None, None, -1).indices(4))))


class EditableList(FieldList):
    def __setitem__(self, key, value) -> None:
        self._names[key] = value

    def __delitem__(self, key) -> None:
        del self._names[key]


names = EditableList(["email", "phone", "age"])
names[0] = "login"
del names[1:]
print(names)

fl = FieldList(["email"])
fl[0] = "phone"
```

```text
(3, -1, -1) (2, 4, 1)
[3, 2, 1, 0]
FieldList(['login'])
TypeError: 'FieldList' object does not support item assignment
```

У `FieldList` немає ні `__iter__`, ні `__contains__`, але `for` і `in` з ним працюють. Це запасні шляхи. Без `__iter__` `iter()` створює ітератор, який викликає `__getitem__` з 0, 1, 2 і зупиняється на `IndexError` (старий протокол послідовностей, що лишився з часів до `__iter__`). Без `__contains__` оператор `in` перебирає елементи й порівнює кожен через `==`. Принт у `__getitem__` показує ціну: лінійний перебір і зайвий виклик з індексом за межами.

```python
fl = FieldList(["email", "phone", "age"])
print("phone" in fl)
print([name for name in fl])
```

```text
key: 0
key: 1
True
key: 0
key: 1
key: 2
key: 3
['email', 'phone', 'age']
```

Явні методи кращі за обидва запасні шляхи. `__contains__` може відповідати за O(1) через множину або словник. `__iter__` зобов'язаний повернути ітератор (iterator; офіційний термін: об'єкт з `__next__`, який віддає елементи по одному й вичерпується), і найпростіше його отримати через генератор: метод з `yield` при виклику повертає генератор (generator, офіційний термін), а той уже є готовим ітератором (детально в m5-l02). Кожен виклик `__iter__` створює новий генератор, тому контейнер можна обходити скільки завгодно разів і навіть вкладеними циклами.

```python live
class FieldList:
    def __init__(self, names: list[str]) -> None:
        self._names = list(names)
        self._index = set(self._names)

    def __len__(self) -> int:
        return len(self._names)

    def __iter__(self):
        yield from self._names

    def __contains__(self, name: object) -> bool:
        return name in self._index


fl = FieldList(["email", "phone"])
print(type(iter(fl)).__name__)
print(list(fl), list(fl))
print([(x, y) for x in fl for y in fl])
print("phone" in fl, "age" in fl)
```

```text
generator
['email', 'phone'] ['email', 'phone']
[('email', 'email'), ('email', 'phone'), ('phone', 'email'), ('phone', 'phone')]
True False
```

> **Пастка.** У JS поширений патерн `[Symbol.iterator]() { return this; }` з `next()` на тому самому об'єкті. Перенесений у Python як `__iter__`, що повертає `self`, плюс `__next__` з лічильником в екземплярі, він дає одноразову колекцію: другий цикл порожній, вкладений цикл ламається. У Python контейнер (iterable) і ітератор зазвичай розділені: контейнер на кожен `__iter__` віддає свіжий ітератор, а `return self` пишуть лише самі ітератори. Повний протокол з `__next__` і `StopIteration` у m5-l01.

```python
class OneShot:
    def __init__(self, names: list[str]) -> None:
        self._names = names
        self._i = 0

    def __iter__(self):
        return self

    def __next__(self) -> str:
        if self._i >= len(self._names):
            raise StopIteration
        self._i += 1
        return self._names[self._i - 1]


shot = OneShot(["email", "phone"])
print(list(shot), list(shot))
```

```text
['email', 'phone'] []
```

<!-- task: t3 -->

## Оператори: `__add__`, `__radd__`, `__iadd__`, `__neg__`

Кожен бінарний оператор це пара методів: прямий і віддзеркалений (reflected; офіційна назва в документації, ще кажуть "swapped operands"). `a + b` викликає `a.__add__(b)`; якщо методу немає або він повернув `NotImplemented`, Python пробує `b.__radd__(a)`; якщо й там відмова, `TypeError`. Те саме для `-` (`__sub__`/`__rsub__`), `*` (`__mul__`/`__rmul__`), `/`, `//`, `%`, `**`, `&`, `|`. Унарні мінус і плюс це `__neg__` і `__pos__`.

```ts
class Money {
  constructor(public cents: number) {}
  valueOf() { return this.cents; }
}
const a = new Money(100);
const b = new Money(250);
console.log(a + b);   // 350, тип number, Money втрачено
console.log(a + 5);   // 105
```

```python live
class Money:
    def __init__(self, cents: int, currency: str = "UAH") -> None:
        self.cents = cents
        self.currency = currency

    def __repr__(self) -> str:
        return f"Money({self.cents}, {self.currency!r})"

    def __add__(self, other: object) -> "Money":
        if not isinstance(other, Money):
            return NotImplemented
        if other.currency != self.currency:
            raise ValueError(f"currency mismatch: {self.currency} + {other.currency}")
        return Money(self.cents + other.cents, self.currency)

    def __neg__(self) -> "Money":
        return Money(-self.cents, self.currency)

    def __sub__(self, other: object) -> "Money":
        if not isinstance(other, Money):
            return NotImplemented
        return self + -other


a, b = Money(100), Money(250)
print(a + b, -a, b - a)
for expr in (lambda: a + 5, lambda: a + Money(1, "USD")):
    try:
        expr()
    except (TypeError, ValueError) as e:
        print(type(e).__name__, e)
```

```text
Money(350, 'UAH') Money(-100, 'UAH') Money(150, 'UAH')
TypeError unsupported operand type(s) for +: 'Money' and 'int'
ValueError currency mismatch: UAH + USD
```

JS перевантаження операторів не має зовсім: `+` перетворює обидва об'єкти на примітиви через `valueOf`, і результат уже число, а не `Money`. У Python оператор не перетворює, а питає об'єкти, і тип результату вирішує метод. Два різні сигнали в коді вище: `NotImplemented` означає "з цим типом я не працюю, хай спробує інший операнд", а `ValueError` означає "тип правильний, значення ні". Методи незмінного типу повертають новий об'єкт і не чіпають операнди, як це роблять `int` і `str`.

Віддзеркалений метод потрібен там, де ваш об'єкт стоїть праворуч. Найчастіше це `sum`: він починає з `0` і робить `0 + перший`. `int.__add__` не знає `Money` і повертає `NotImplemented`, тож усе вирішує `Money.__radd__`. Без нього `sum` падає, з ним, що обробляє нуль, працює. Інший шлях це передати старт явно: `sum(items, Money(0))`.

```python
print(sum([Money(100), Money(250)]))
```

```text
TypeError: unsupported operand type(s) for +: 'int' and 'Money'
```

```python
def money_radd(self: Money, other: object) -> Money:
    if other == 0:
        return self
    return self.__add__(other)


Money.__radd__ = money_radd
print(sum([Money(100), Money(250)]))
print(sum([Money(100)], Money(0)))
print(0 + Money(5))
```

```text
Money(350, 'UAH')
Money(100, 'UAH')
Money(5, 'UAH')
```

`x += y` це окремий оператор (augmented assignment, офіційний термін) з методом `__iadd__`. Якщо метод є, Python викликає його і прив'язує ім'я до результату; якщо немає, виконує `x = x + y`. Змінювані типи визначають `__iadd__`, що змінює об'єкт на місці: `list.__iadd__` це `extend`, і зміну бачать усі посилання на список. Незмінні типи `__iadd__` не мають, `+=` створює новий об'єкт, і alias лишається старим. Для свого незмінного класу `__iadd__` не пишуть зовсім, а для змінюваного він змінює `self` і повертає `self`.

```python
items = [1]
alias = items
items += [2]
print(alias)

t = (1,)
alias_t = t
t += (2,)
print(alias_t, t)

m = Money(100)
alias_m = m
m += Money(50)
print(m, alias_m)
```

```text
[1, 2]
(1,) (1, 2)
Money(150, 'UAH') Money(100, 'UAH')
```

> **Пастка.** `__iadd__`, що змінює `self` і нічого не повертає, мовчки перетворює змінну на `None`: результат методу прив'язується до імені, а результат функції без `return` це `None`.

```python
class Bag:
    def __init__(self) -> None:
        self.items: list[str] = []

    def __iadd__(self, item: str) -> None:
        self.items.append(item)


bag = Bag()
bag += "email"
print(bag)
```

```text
None
```

Оператор `@` має метод `__matmul__`. Жоден вбудований тип його не реалізує; його ввели для матричного множення в numpy, і в звичайному коді він трапляється рідко.

```python
class Vec:
    def __init__(self, *xs: int) -> None:
        self.xs = xs

    def __matmul__(self, other: "Vec") -> int:
        return sum(a * b for a, b in zip(self.xs, other.xs, strict=True))


print(Vec(1, 2, 3) @ Vec(4, 5, 6))
```

```text
32
```

<!-- task: q3 -->

<!-- task: t4 -->

## `__call__`: об'єкт, який викликають як функцію

`obj(args)` це `type(obj).__call__(obj, args)`. Функції це об'єкти з `__call__`, класи теж викликані, а будь-який ваш клас стає викликаним (callable; офіційний термін із глосарію), щойно визначає `__call__`. Вбудована `callable(x)` перевіряє саме це. Навіщо: функція з конфігурацією й видимим станом. Валідатор з параметрами, рендерер з налаштованою темою, decorator, якому потрібен стан між викликами (класи-декоратори в m5-l04), callback, описаний через Protocol з `__call__` (m2-l07).

```ts
function maxLength(limit: number) {
  const check = (value: string) => (value.length > limit ? `max ${limit} chars` : null);
  return Object.assign(check, { limit });
}
const v = maxLength(5);
console.log(v("abcdef"), v.limit);   // "max 5 chars" 5
```

```python live
class MaxLength:
    def __init__(self, limit: int) -> None:
        self.limit = limit

    def __repr__(self) -> str:
        return f"MaxLength({self.limit})"

    def __call__(self, value: str) -> str | None:
        return f"max {self.limit} chars" if len(value) > self.limit else None


def required(value: str) -> str | None:
    return "required" if not value else None


v = MaxLength(5)
print(v("abcdef"), v.limit, v)
validators = [required, MaxLength(5)]
print([check("abcdef") for check in validators])
print([check("") for check in validators])
print(callable(v), callable(MaxLength), callable("abc"))
```

```text
max 5 chars 5 MaxLength(5)
[None, 'max 5 chars']
['required', None]
True True False
```

Мови йдуть до однієї мети з протилежних боків. У JS функція це об'єкт, тому властивості чіпляють на функцію через `Object.assign`; а от екземпляр класу викликаним зробити не можна, лише `Proxy` з пасткою `apply`, і та працює, тільки якщо ціль сама функція. У Python будь-який об'єкт може бути викликаним, тому стан, поведінка, `__repr__` і `__eq__` живуть в одному класі, а для коду, що викликає, функція й екземпляр взаємозамінні. Замикання (m1-l08) доречне, коли стан нікому не треба бачити. Клас з `__call__` доречний, коли параметри мають бути видні в лозі, порівнювані між собою або налаштовувані після створення.

> **Під капотом.** Виклик класу теж `__call__`, тільки метакласу: `MaxLength(3)` це `type.__call__(MaxLength, 3)`, а вже він викликає `__new__` і `__init__`. Тому "клас" і "функція, що повертає об'єкт" для коду, що їх викликає, нерозрізнені.

```python
print(type(MaxLength).__call__(MaxLength, 3))
```

```text
MaxLength(3)
```

<!-- task: t5 -->

## Доступ до атрибутів: `__getattr__`, `__getattribute__`, `__setattr__`, `__delattr__`

Читання `obj.name` іде через `type(obj).__getattribute__(obj, "name")`. Стандартна реалізація з `object` проходить увесь алгоритм пошуку: дескриптори на класі, `__dict__` екземпляра, атрибути класу й батьків. Якщо вона кидає `AttributeError` і в класі є `__getattr__`, викликається він. Тобто `__getattr__` це хук лише на промах, безпечний для проксі й запасних значень, а `__getattribute__` перехоплює кожне читання, включно з `self._x` у ваших же методах, і перевизначають його рідко. Запис `obj.x = v` завжди іде через `__setattr__`, видалення `del obj.x` через `__delattr__`. Дескриптори (descriptor, офіційний термін), на яких тримаються `property`, методи й `classmethod`, працюють усередині `object.__getattribute__`; детально в m4-l03.

```ts
const config = { title: "Signup", theme: "dark" };
const readOnly = new Proxy(config, {
  set: (_target, key) => { throw new TypeError(`read-only: cannot set ${String(key)}`); },
});
console.log(readOnly.title);   // "Signup"
readOnly.title = "x";          // TypeError
```

```python live
class Config:
    def __init__(self, title: str, theme: str) -> None:
        self.title = title
        self.theme = theme


class ReadOnly:
    def __init__(self, target: object) -> None:
        object.__setattr__(self, "_target", target)

    def __getattr__(self, name: str):
        return getattr(self._target, name)

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError(f"read-only: cannot set {name!r}")

    def __delattr__(self, name: str) -> None:
        raise AttributeError(f"read-only: cannot delete {name!r}")


view = ReadOnly(Config("Signup", "dark"))
print(view.title, view.theme)
for action in (lambda: setattr(view, "title", "x"), lambda: delattr(view, "theme")):
    try:
        action()
    except AttributeError as e:
        print(e)

items = ReadOnly([1, 2, 3])
print(items.count(2), items.__len__())
print(len(items))
```

```text
Signup dark
read-only: cannot set 'title'
read-only: cannot delete 'theme'
1 3
TypeError: object of type 'ReadOnly' has no len()
```

Розходження з JS-проксі в останньому рядку. `Proxy` перехоплює все, бо в JS і `length`, і `Symbol.iterator` це звичайне читання властивості. Python шукає special methods на типі, повз `__getattribute__` і `__getattr__` екземпляра, тому `items.__len__()` проходить через проксі, а `len(items)` ні. Проксі, що має підтримувати `len`, `for`, `in` чи `==`, зобов'язаний визначити ці dunder-методи явно. Зверніть увагу й на `__init__`: `self._target = target` там викликав би наш же `__setattr__` і впав, тому запис іде напряму через `object.__setattr__`.

> **Пастка.** Усередині `__setattr__` звичайне `self.x = value` знову викликає `__setattr__`, і так до `RecursionError`. Записувати треба через батьківську реалізацію: `super().__setattr__(name, value)`. Те саме з `__getattribute__`: будь-яке `self.щось` усередині нього це рекурсія, читати треба через `super().__getattribute__(name)`.

```python
class Normalized:
    def __setattr__(self, name: str, value: object) -> None:
        if isinstance(value, str):
            value = value.strip()
        setattr(self, name, value)


n = Normalized()
n.label = "  Email  "
```

```text
RecursionError: maximum recursion depth exceeded
```

```python live
class Normalized:
    def __setattr__(self, name: str, value: object) -> None:
        if isinstance(value, str):
            value = value.strip()
        super().__setattr__(name, value)


n = Normalized()
n.label = "  Email  "
print(repr(n.label), vars(n))


class Spy:
    def __init__(self) -> None:
        self.items = [1, 2]

    def __getattribute__(self, name: str):
        print("get", name)
        return super().__getattribute__(name)

    def __len__(self) -> int:
        return len(self.items)


s = Spy()
print(len(s))
print(s.__len__())
```

```text
'Email' {'label': 'Email'}
get items
2
get __len__
get items
2
```

`Spy` показує той самий обхід ще раз: `len(s)` знаходить `__len__` у слоті типу, і `__getattribute__` бачить лише `self.items` усередині методу, а явне `s.__len__()` проходить через нього двічі.

Решта хуків класу виходить за межі уроку, але їх варто впізнавати. `__enter__` і `__exit__` реалізують `with` (m4-l07). `__init_subclass__` викликається на батьківському класі щоразу, коли створюється підклас, і дає реєстр плагінів без метакласів. `__class_getitem__` обробляє дужки на самому класі: саме через нього працює `list[int]`, а синтаксис 3.12 `class Box[T]` генерує його за вас (m2-l06).

```python live
class Renderer:
    registry: dict[str, type["Renderer"]] = {}

    def __init_subclass__(cls, kind: str, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        Renderer.registry[kind] = cls


class HtmlRenderer(Renderer, kind="html"):
    pass


class MarkdownRenderer(Renderer, kind="md"):
    pass


print(Renderer.registry)
print(list[int], list.__class_getitem__(int))


class Box[T]:
    pass


print(Box[int])
```

```text
{'html': <class '__main__.HtmlRenderer'>, 'md': <class '__main__.MarkdownRenderer'>}
list[int] list[int]
__main__.Box[int]
```

<!-- task: q4 -->

## Для капстоуну

Внутрішнє представлення конфігу з m2-l05 це кортеж frozen-елементів, і кожен сервіс бекенду ходить по ньому своїм циклом. `ElementTree` збирає ці обходи в один тип, з яким працює звичайний синтаксис: `len(tree)` рахує всі елементи з вкладеними, `for el in tree` обходить дерево в глибину, `tree["email"]` знаходить поле за `name`, `"email" in tree` перевіряє його наявність, а `==` порівнює два конфіги. Обхід зроблено генератором зі стеком замість рекурсії, щоб глибина вкладеності не впиралась у ліміт рекурсії.

```python live
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass


@dataclass(frozen=True, slots=True, kw_only=True)
class Element:
    type: str
    id: str
    name: str | None = None
    children: tuple[Element, ...] = ()


class ElementTree:
    def __init__(self, form_id: str, elements: tuple[Element, ...]) -> None:
        self.form_id = form_id
        self.elements = elements
        self._by_name: dict[str, Element] = {}
        self._size = 0
        for el in self:
            self._size += 1
            if el.name is None:
                continue
            if el.name in self._by_name:
                raise ValueError(f"duplicate name {el.name!r}")
            self._by_name[el.name] = el

    def __repr__(self) -> str:
        inputs = list(self._by_name)
        return f"<ElementTree {self.form_id!r}: {self._size} elements, inputs={inputs}>"

    def __len__(self) -> int:
        return self._size

    def __iter__(self) -> Iterator[Element]:
        stack = list(reversed(self.elements))
        while stack:
            el = stack.pop()
            yield el
            stack.extend(reversed(el.children))

    def __getitem__(self, name: str) -> Element:
        return self._by_name[name]

    def __contains__(self, name: object) -> bool:
        return isinstance(name, str) and name in self._by_name

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ElementTree):
            return NotImplemented
        return (self.form_id, self.elements) == (other.form_id, other.elements)

    def __hash__(self) -> int:
        return hash((self.form_id, self.elements))


form = (
    Element(type="input", id="e1", name="email"),
    Element(type="block", id="b1", children=(
        Element(type="input", id="e2", name="company"),
        Element(type="text", id="t1"),
    )),
    Element(type="button", id="s1"),
)
tree = ElementTree("signup", form)
print(tree)
print(len(tree), [el.id for el in tree])
print(tree["company"].id, "email" in tree, "phone" in tree, None in tree)
print(tree == ElementTree("signup", form), tree == ElementTree("signup", form[:1]))
print(len({tree, ElementTree("signup", form)}))
print(tree["phone"])
```

```text
<ElementTree 'signup': 5 elements, inputs=['email', 'company']>
5 ['e1', 'b1', 'e2', 't1', 's1']
e2 True False False
True False
1
KeyError: 'phone'
```

`__eq__` і `__hash__` тут законні, бо дерево незмінне: елементи frozen, кортежі не змінюються, індекс `_by_name` будується один раз. Рівність делегована полям, і frozen dataclass порівнює вкладені елементи рекурсивно, тож два конфіги з однаковим вмістом рівні незалежно від того, звідки прийшли. `__repr__` у кутових дужках: відтворити дерево з п'ятдесяти елементів одним виразом у лозі нереально, а кількість елементів і список полів це те, що потрібно при відлагодженні.

> **Для капстоуну.** PATCH конфігу, який нічого не змінив, не повинен ставити нову задачу генерації: `if new_tree == current_tree: return current_version`. А от `hash(tree)` як ключ кешу живе лише в межах процесу: хеші рядків рандомізовані, і воркер в іншому процесі отримає інше число. Для ключа, що переживає процес, рахуйте `hashlib.sha256` від канонічного JSON конфігу.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Лише `__str__` за звичкою `toString()`.** `print(obj)` виглядає добре, а список, лог і повідомлення pytest показують адресу. Правильно: спершу `__repr__` у форматі виразу-конструктора, `__str__` лише якщо людям потрібен інший текст.

   ```python
   def __repr__(self) -> str:
       return f"{type(self).__name__}({self.name!r}, required={self.required!r})"
   ```

2. **`length` або `size()` замість `__len__`.** Метод з JS-іменем працює лише через крапку, а `len()`, `bool()` і все, що очікує `Sized`, його не бачать. І навпаки, `[1, 2].length` дає `AttributeError`.

   ```python
   def __len__(self) -> int:   # не length / size
       return len(self._items)

   len(items)                  # не items.length
   ```

3. **`__eq__` без `__hash__` або хеш від змінюваних полів.** Перше робить клас unhashable (`TypeError: unhashable type`), друге губить об'єкти в множинах після зміни поля. Правильно: незмінний клас з `__hash__` від тих самих полів, що й `__eq__`, або `@dataclass(frozen=True)`.

   ```python
   def __hash__(self) -> int:
       return hash((self.form_id, self.field_id))
   ```

4. **`return False` або `raise NotImplementedError` для чужого типу.** `False` робить рівність несиметричною, `NotImplementedError` (виняток для абстрактних методів) ламає навіть `obj == None`. Правильно: `return NotImplemented`, вбудована константа, яку інтерпретатор розуміє як "спитай іншого".

   ```python
   if not isinstance(other, FieldRef):
       return NotImplemented
   ```

5. **`__iter__`, що повертає `self`, як `[Symbol.iterator]() { return this; }`.** Колекція стає одноразовою: другий `for` нічого не бачить. Правильно: `__iter__` як генератор, свіжий ітератор на кожен виклик.

   ```python
   def __iter__(self):
       yield from self._items
   ```

6. **Очікування коерції, як з `valueOf`.** `sum(moneys)` і `0 + money` падають з `unsupported operand type(s) for +: 'int' and 'Money'`, бо Python нічого не перетворює. Правильно: `__radd__` з обробкою нуля або явний старт `sum(items, Money(0))`.

   ```python
   def __radd__(self, other: object) -> "Money":
       return self if other == 0 else self.__add__(other)
   ```

7. **Проксі на `__getattr__` як на `Proxy`.** `len(proxy)`, `for`, `in` і `==` не проходять через `__getattr__`, а `self.x = ...` усередині `__setattr__` дає `RecursionError`. Правильно: dunder-методи в проксі визначати явно, а в `__setattr__` писати через `super().__setattr__`.

   ```python
   def __len__(self) -> int:
       return len(self._target)
   ```

8. **Dunder на екземплярі, як `obj[Symbol.iterator] = ...`.** `obj.__repr__ = ...` чи `obj.__len__ = ...` синтаксис ігнорує, бо шукає на типі. Правильно: метод у класі, а різну поведінку екземплярів робити через їхні дані.

   ```python
   p.__repr__ = lambda: "custom"
   print(repr(p))   # Point(1, 2): метод класу, а не атрибут екземпляра
   ```

## Підсумок

- Special methods (dunder) це протоколи синтаксису: `len`, `==`, `+`, `[]`, `for`, `in`, `()`, `print` викликають метод з фіксованим ім'ям.
- Метод шукається на типі, а не на екземплярі: `len(x)` це `type(x).__len__(x)`; атрибут екземпляра й `__getattr__` у цьому не беруть участі.
- `__repr__` обов'язковий і виглядає як вираз-конструктор; `__str__` за потреби, без нього `str` падає на `repr`; контейнери показують `repr` елементів.
- Власний `__eq__` скидає `__hash__` у `None`; рівні об'єкти зобов'язані мати рівні хеші; хешувати лише незмінне, з тих самих полів, що й `__eq__`.
- Для чужого типу `return NotImplemented`: це дає шанс другому операнду, а `!=` виводиться з `__eq__` сам.
- `sorted`, `min`, `max` потребують лише `__lt__`; решту порядку добудовує `functools.total_ordering`.
- `__getitem__` отримує те, що в дужках, включно з `slice`; зріз повертає той самий тип; `__iter__` пишеться генератором і щоразу дає свіжий ітератор.
- Бінарний оператор це `__add__`, потім `__radd__`; `__radd__` потрібен для `sum`; `__iadd__` лише для змінюваних типів і повертає `self`.
- `__call__` робить екземпляр функцією зі станом; `callable()` перевіряє саме його.
- `__getattr__` лише на промах, `__getattribute__` на кожне читання; у `__setattr__` писати через `super().__setattr__`.

## Що далі

Наступний урок m4-l03 про `property` і `__slots__`. Там з'ясується, що `property` це дескриптор, який працює всередині `object.__getattribute__` з цього уроку, і що read-only атрибути та `__slots__` дають той самий незмінний клас, якому дозволено мати `__hash__`. Генератор у `__iter__` повернеться в m5-l01 і m5-l02, де протокол ітерації розібрано до `__next__` і `StopIteration`, а `__call__` стане основою класів-декораторів у m5-l04.
