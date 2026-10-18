---
id: m4-l05
module: m4-oop
title: "ABC проти Protocol: номінальний контракт і структурний"
summary: "Учень будує власні ієрархії на abc.ABC з абстрактними методами, property і template method, розуміє віртуальні підкласи через register і __subclasshook__, отримує готові mixin-методи з collections.abc і за чітким правилом обирає між ABC і Protocol або поєднує їх."
duration_min: 75
prerequisites: [m4-l04]
---

## `ABC` і `@abstractmethod`: абстрактний клас, який перевіряє інтерпретатор

У m2-l07 ви описували через `Protocol`, що потрібно споживачу, і бачили ABC лише для контрасту. Тепер друга половина. ABC (abstract base class, офіційна назва з модуля `abc`) це базовий клас, який одночасно дає спільний код і перелік методів, що підклас зобов'язаний перевизначити. Клас наслідує `abc.ABC`, обов'язкові методи позначаються декоратором `@abstractmethod`. Найближчий родич у TS це `abstract class`, а не `interface`.

```ts
abstract class BaseRenderer {
  abstract render(text: string): string;

  renderMany(texts: string[]): string {
    return texts.map((t) => this.render(t)).join("\n");
  }
}

class HtmlRenderer extends BaseRenderer {
  render(text: string) { return `<p>${text}</p>`; }
}

class Draft extends BaseRenderer {}
// tsc: Non-abstract class 'Draft' does not implement inherited abstract member render from class 'BaseRenderer'.
new BaseRenderer();
// tsc: Cannot create an instance of an abstract class.
```

```python
from abc import ABC, abstractmethod


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...

    def render_many(self, texts: list[str]) -> str:
        return "\n".join(self.render(t) for t in texts)


class HtmlRenderer(BaseRenderer):
    def render(self, text: str) -> str:
        return f"<p>{text}</p>"


class Draft(BaseRenderer):
    pass


print(HtmlRenderer().render_many(["a", "b"]))
print("Draft defined")
Draft()
```

```text
$ python abc_basic.py
<p>a</p>
<p>b</p>
Draft defined
TypeError: Can't instantiate abstract class Draft without an implementation for abstract method 'render'
```

```text
$ mypy --strict abc_basic.py
abc_basic.py:23: error: Cannot instantiate abstract class "Draft" with abstract attribute "render"  [abstract]
Found 1 error in 1 file (checked 1 source file)
```

Розходяться дві речі: де помилка і коли. `tsc` свариться на рядку `class Draft extends`, тобто на оголошенні, і лише під час компіляції; у зібраному JS слова `abstract` уже немає, і `new BaseRenderer()` спокійно створює об'єкт. Python оголошення `Draft` пропускає, і інтерпретатор, і mypy скаржаться лише там, де просять екземпляр. Зате перевірка інтерпретатора справжня: вона спрацює і в проді, і в скрипті, який ніколи не бачив mypy.

Абстрактний метод у базі лишається звичайною функцією з прапорцем, а клас пам'ятає множину своїх нереалізованих методів у `__abstractmethods__`. Підклас, що реалізував лише частину, сам лишається абстрактним, і це легально: такий проміжний клас може свідомо закрити половину контракту для кількох нащадків.

```python live
from abc import ABC, abstractmethod


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...

    @abstractmethod
    def wrap(self, body: str) -> str: ...


class PageRenderer(BaseRenderer):
    def wrap(self, body: str) -> str:
        return f"<main>{body}</main>"


class HtmlRenderer(PageRenderer):
    def render(self, text: str) -> str:
        return f"<p>{text}</p>"


print(sorted(BaseRenderer.__abstractmethods__))
print(sorted(PageRenderer.__abstractmethods__))
print(sorted(HtmlRenderer.__abstractmethods__))
print(BaseRenderer.render.__isabstractmethod__)
html = HtmlRenderer()
print(html.wrap(html.render("hi")))
BaseRenderer()
```

```text
['render', 'wrap']
['render']
[]
True
<main><p>hi</p></main>
TypeError: Can't instantiate abstract class BaseRenderer without an implementation for abstract methods 'render', 'wrap'
```

> **Під капотом.** `@abstractmethod` лише ставить функції атрибут `__isabstractmethod__ = True`. Решту робить metaclass (офіційний термін: клас, екземплярами якого є класи) `abc.ABCMeta`; `ABC` це просто зручна база з `metaclass=ABCMeta`. Під час створення класу `ABCMeta` збирає в `__abstractmethods__` імена з прапорцем, власні й успадковані, які ніхто не перевизначив, а `object.__new__` відмовляється створювати екземпляр, поки ця множина не порожня. На етапі оголошення помилки бути не може за побудовою: `PageRenderer` вище абстрактний навмисно, і відрізнити його від класу, де метод забули, Python не здатен. Відрізняє лише момент, коли хтось просить екземпляр.

> **Пастка.** Перевірку вмикає лише пара "`ABCMeta` плюс `@abstractmethod`". Клас, що наслідує `ABC`, але не має жодного `@abstractmethod`, нічого не перевіряє, навіть якщо методи бази кидають `NotImplementedError`. А `@abstractmethod` у класі без `ABC` рантайм ігнорує повністю, хоча mypy його бачить. Звичка з TS "`abstract` у назві класу означає, що його не створити" тут не працює: абстрактність визначають методи, а не назва чи база.

```python
from abc import ABC, abstractmethod


class NoMarks(ABC):
    def render(self, text: str) -> str:
        raise NotImplementedError


class NoMeta:
    @abstractmethod
    def render(self, text: str) -> str: ...


a = NoMarks()
b = NoMeta()
print(type(a).__name__, type(b).__name__)
print(NoMarks.__abstractmethods__)
```

```text
$ python no_marks.py
NoMarks NoMeta
frozenset()
```

```text
$ mypy --strict no_marks.py
no_marks.py:15: error: Cannot instantiate abstract class "NoMeta" with abstract attribute "render"  [abstract]
Found 1 error in 1 file (checked 1 source file)
```

Звідси й відповідь, чим `@abstractmethod` кращий за `raise NotImplementedError` з m4-l04: `NotImplementedError` вибухає, коли хтось викличе метод, можливо, на рідкісній гілці в проді, а `@abstractmethod` уже при створенні об'єкта, і mypy показує це місце статично.

<!-- task: q1 -->

<!-- task: t1 -->

## Абстрактні property, classmethod і staticmethod

Абстрактним може бути будь-який член класу, не лише звичайний метод. Правило одне: `@abstractmethod` стоїть найближче до `def`, інший декоратор над ним. Старі `abstractproperty` і `abstractclassmethod` застарілі з Python 3.3; у чужому коді ви їх зустрінете, у своєму пишіть пару декораторів.

```python live
from abc import ABC, abstractmethod


class Exporter(ABC):
    @property
    @abstractmethod
    def extension(self) -> str: ...

    @classmethod
    @abstractmethod
    def from_options(cls, options: dict[str, str]) -> "Exporter": ...

    @staticmethod
    @abstractmethod
    def mime() -> str: ...

    @abstractmethod
    def dump(self, data: dict[str, str]) -> str: ...

    def filename(self, stem: str) -> str:
        return f"{stem}.{self.extension}"


class JsonExporter(Exporter):
    extension = "json"

    @classmethod
    def from_options(cls, options: dict[str, str]) -> "JsonExporter":
        return cls()

    @staticmethod
    def mime() -> str:
        return "application/json"

    def dump(self, data: dict[str, str]) -> str:
        return str(data).replace("'", '"')


class CsvExporter(Exporter):
    def __init__(self, sep: str) -> None:
        self.sep = sep

    @property
    def extension(self) -> str:
        return "tsv" if self.sep == "\t" else "csv"

    @classmethod
    def from_options(cls, options: dict[str, str]) -> "CsvExporter":
        return cls(options.get("sep", ","))

    @staticmethod
    def mime() -> str:
        return "text/csv"

    def dump(self, data: dict[str, str]) -> str:
        return "\n".join(f"{k},{v}" for k, v in data.items())


print(sorted(Exporter.__abstractmethods__))
json_exp = JsonExporter.from_options({})
print(json_exp.filename("answers"), JsonExporter.mime(), json_exp.dump({"email": "a@b.c"}))
print(CsvExporter.from_options({"sep": "\t"}).filename("answers"))
```

```text
$ python exporters.py
['dump', 'extension', 'from_options', 'mime']
answers.json application/json {"email": "a@b.c"}
answers.tsv
```

```text
$ mypy --strict exporters.py
Success: no issues found in 1 source file
```

Зверніть увагу на `extension = "json"`: абстрактну property закрив звичайний атрибут класу. `ABCMeta` перевіряє лише, що під цим іменем у класі лежить щось без прапорця `__isabstractmethod__`, а mypy вважає атрибут класу сумісним з read-only property. `CsvExporter` повертає її вже як справжню property, обчислену з `sep`, і споживачу `filename` різниці не видно.

> **Пастка.** Порядок декораторів має значення. `@abstractmethod` над `@property` намагається поставити прапорець на об'єкт property, а в нього цей атрибут лише для читання. Клас падає вже під час імпорту модуля, а mypy такий порядок пропускає.

```python
from abc import ABC, abstractmethod


class Exporter(ABC):
    @abstractmethod
    @property
    def extension(self) -> str: ...
```

```text
$ python wrong_order.py
AttributeError: attribute '__isabstractmethod__' of 'property' objects is not writable
```

```text
$ mypy --strict wrong_order.py
Success: no issues found in 1 source file
```

> **Пастка.** Абстрактний classmethod захищає лише від створення екземпляра. Викликати його на класі, який його не реалізував, ніхто не забороняє: виконається тіло `...` з бази, і фабрика тихо поверне `None`. mypy тут теж мовчить, тож фабрику, яку викликають на класі, перевіряють тести.

```python
from abc import ABC, abstractmethod


class Exporter(ABC):
    @classmethod
    @abstractmethod
    def create(cls) -> "Exporter": ...

    @abstractmethod
    def dump(self) -> str: ...


class Csv(Exporter):
    def dump(self) -> str:
        return "a,b"


print(Csv.create())
Csv()
```

```text
$ python abstract_factory.py
None
TypeError: Can't instantiate abstract class Csv without an implementation for abstract method 'create'
```

```text
$ mypy --strict abstract_factory.py
abstract_factory.py:19: error: Cannot instantiate abstract class "Csv" with abstract attribute "create"  [abstract]
Found 1 error in 1 file (checked 1 source file)
```

<!-- task: q2 -->

## Template method: база тримає алгоритм, підкласи дають кроки

Головна причина взяти ABC замість Protocol це спільний код, який викликає абстрактні кроки. База визначає алгоритм у конкретному методі, а підкласи заповнюють лише кроки, які відрізняються. Це патерн template method (назва з каталогу GoF, у документації Python окремого терміна немає). Нижче `render` однаковий для всіх тегів, а `open_tag` і `close_tag` кожен підклас дає свої.

```python live
from abc import ABC, abstractmethod
from html import escape


class TagRenderer(ABC):
    tag: str

    def render(self, text: str) -> str:
        return self.open_tag() + escape(text) + self.close_tag()

    @abstractmethod
    def open_tag(self) -> str: ...

    @abstractmethod
    def close_tag(self) -> str:
        return f"</{self.tag}>"


class Paragraph(TagRenderer):
    tag = "p"

    def open_tag(self) -> str:
        return "<p>"

    def close_tag(self) -> str:
        return super().close_tag()


class Link(TagRenderer):
    tag = "a"

    def __init__(self, href: str) -> None:
        self.href = href

    def open_tag(self) -> str:
        return f'<a href="{escape(self.href)}">'

    def close_tag(self) -> str:
        return super().close_tag()


class Bold(TagRenderer):
    tag = "b"

    def open_tag(self) -> str:
        return "<b>"


print(Paragraph().render("a < b"))
print(Link("/terms?a=1&b=2").render("Terms"))
Bold()
```

```text
<p>a &lt; b</p>
<a href="/terms?a=1&amp;b=2">Terms</a>
TypeError: Can't instantiate abstract class Bold without an implementation for abstract method 'close_tag'
```

`close_tag` абстрактний і водночас має тіло. Це звичайна для Python техніка: реалізація за замовчуванням існує, але підклас зобов'язаний явно вирішити, що з нею робити, і щонайменше написати `return super().close_tag()`. `Bold` про це забув і не створюється, хоча тіло в базі є. Так база змушує подумати про крок, де мовчазне успадкування небезпечне.

> **JS-аналог.** У TS абстрактний метод не може мати тіла: `Method 'closeTag' cannot have an implementation because it is marked abstract.` Там вибір бінарний: або `abstract` без реалізації, або звичайний метод, який підклас може мовчки успадкувати. Python дає третій варіант: "реалізація є, але перевизначити обов'язково".

Два статичні запобіжники доповнюють патерн. `typing.final` на шаблонному методі забороняє підкласам його перевизначати, бо алгоритм належить базі. А виклик `super()` до абстрактного методу з тілом `...` mypy вважає помилкою: такий виклик поверне `None` замість рядка.

```python
from abc import ABC, abstractmethod
from typing import final


class TagRenderer(ABC):
    tag: str

    @final
    def render(self, text: str) -> str:
        return self.open_tag() + text + self.close_tag()

    @abstractmethod
    def open_tag(self) -> str: ...

    @abstractmethod
    def close_tag(self) -> str:
        return f"</{self.tag}>"


class Bold(TagRenderer):
    tag = "b"

    def open_tag(self) -> str:
        return super().open_tag()

    def close_tag(self) -> str:
        return super().close_tag()

    def render(self, text: str) -> str:
        return text.upper()
```

```text
$ mypy --strict template_guards.py
template_guards.py:24: error: Call to abstract method "open_tag" of "TagRenderer" with trivial body via super() is unsafe  [safe-super]
template_guards.py:29: error: Cannot override final attribute "render" (previously declared in base class "TagRenderer")  [misc]
Found 2 errors in 1 file (checked 1 source file)
```

`super().close_tag()` пройшов, бо тіло справжнє. `@final` рантайм не перевіряє, це лише позначка для mypy, як `final` у Java чи `sealed`-методи в C#.

<!-- task: t2 -->

## Віртуальні підкласи: `register` і `__subclasshook__`

У m2-l07 `isinstance(fs, Sized)` повертав `True` для класу, який нічого не наслідує. Механізм такий. `ABCMeta` перевизначає `isinstance` і `issubclass` для своїх класів, і `issubclass(C, SomeABC)` питає три джерела: спершу хук `__subclasshook__`, потім справжнє наслідування через MRO, потім реєстр класів, оголошених через `register`. Клас, визнаний через хук або реєстр, офіційно називається virtual subclass: `isinstance` його визнає, але в його MRO бази немає, і він нічого з неї не успадковує.

`register` це явна заява "цей клас є різновидом цього ABC", зроблена поза класом. Вона нічого не перевіряє: зареєструвати можна і клас без жодного потрібного методу. Метод можна вживати і як декоратор, `@BaseRenderer.register`.

```python live
from abc import ABC, abstractmethod


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...

    def render_many(self, texts: list[str]) -> str:
        return "\n".join(self.render(t) for t in texts)


class LegacyRenderer:
    def render(self, text: str) -> str:
        return text.upper()


class Broken:
    pass


BaseRenderer.register(LegacyRenderer)
BaseRenderer.register(Broken)

legacy = LegacyRenderer()
print(isinstance(legacy, BaseRenderer), issubclass(Broken, BaseRenderer))
print(BaseRenderer in LegacyRenderer.__mro__)
print(hasattr(legacy, "render_many"))
Broken().render("x")
```

```text
True True
False
False
AttributeError: 'Broken' object has no attribute 'render'
```

Для чого це потрібно: визнати класи, які ви не можете змінити. Саме так стандартна бібліотека робить `list`, `tuple`, `str` і `range` різновидами `Sequence`, а `dict` різновидом `Mapping`: жоден вбудований тип ці ABC не наслідує.

```python
from collections.abc import Mapping, Sequence

for t in (list, tuple, str, range, dict):
    print(t.__name__, issubclass(t, Sequence), Sequence in t.__mro__, issubclass(t, Mapping))
```

```text
list True False False
tuple True False False
str True False False
range True False False
dict False False True
```

mypy про `register` не знає нічого. Реєстрація відбувається в рантаймі викликом методу, а чекер читає оголошення класів, тож для нього `LegacyRenderer` лишається чужим класом.

```python
from abc import ABC, abstractmethod


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...


class LegacyRenderer:
    def render(self, text: str) -> str:
        return text.upper()


BaseRenderer.register(LegacyRenderer)


def show(r: BaseRenderer) -> None:
    print(r.render("hi"))


show(LegacyRenderer())
```

```text
$ mypy --strict register_static.py
register_static.py:21: error: Argument 1 to "show" has incompatible type "LegacyRenderer"; expected "BaseRenderer"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

`__subclasshook__` це classmethod на ABC, який `issubclass` викликає з класом-кандидатом. Він повертає `True` (визнати), `False` (відмовити) або `NotImplemented` (не знаю, перевіряйте звичайним шляхом). Хук має перше слово, тож `False` сильніший і за реєстрацію, і навіть за справжнє наслідування; саме тому коректний хук у сумнівних випадках повертає `NotImplemented`, а не `False`.

```python
from abc import ABC


class Vetoing(ABC):
    @classmethod
    def __subclasshook__(cls, other: type) -> bool:
        return False


class Child(Vetoing):
    pass


class Registered:
    pass


Vetoing.register(Registered)
print(issubclass(Child, Vetoing), issubclass(Registered, Vetoing), isinstance(Child(), Vetoing))
```

```text
False False False
```

`Sized` реалізує хук обережно: шукає `__len__` у словниках класів по MRO кандидата, відмовляє, лише якщо знайшов `__len__ = None`, а якщо не знайшов нічого, повертає `NotImplemented`. Нижче той самий прийом для власного ABC.

```python
from abc import ABC, abstractmethod
from collections.abc import Sized
from typing import Any


class HasRender(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...

    @classmethod
    def __subclasshook__(cls, other: type) -> Any:
        if cls is not HasRender:
            return NotImplemented
        for klass in other.__mro__:
            if "render" in klass.__dict__:
                return klass.__dict__["render"] is not None
        return NotImplemented


class Markdown:
    def render(self, text: str) -> str:
        return f"**{text}**"


class Disabled:
    render = None


class StrictRenderer(HasRender):
    pass


class FieldSet:
    def __len__(self) -> int:
        return 2


class Countable(Sized):
    pass


print(isinstance(Markdown(), HasRender), isinstance(Disabled(), HasRender))
print(isinstance(Markdown(), StrictRenderer))
print(isinstance(FieldSet(), Sized), isinstance(FieldSet(), Countable))


def show(r: HasRender) -> None:
    print(r.render("hi"))


show(Markdown())
```

```text
$ python hook.py
True False
False
True False
**hi**
```

```text
$ mypy --strict hook.py
hook.py:51: error: Argument 1 to "show" has incompatible type "Markdown"; expected "HasRender"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

Перевірка `cls is not HasRender` важлива: хук успадковується, і без неї кожен підклас `HasRender` теж став би структурним. З нею `StrictRenderer` номінальний, а `Markdown` йому не відповідає. `Sized` захищений так само, тому `Countable(Sized)` вже не визнає `FieldSet`. Анотація `-> Any` тут вимушена: mypy типізує `NotImplemented` як `Any`, і з `-> bool` режим `--strict` скаржиться на `[no-any-return]`.

Обидва механізми лежать посередині між номінальною і структурною типізацією. `register` номінальний за духом (зв'язок оголошено явно), але без наслідування і без жодної перевірки. `__subclasshook__` структурний за духом (визнається форма), але працює лише в рантаймі і бачить лише імена, як `@runtime_checkable` з m2-l07. Власне, `runtime_checkable` побудований на тій самій машинерії `ABCMeta`. Статично mypy не бачить ні того, ні іншого: `Sized` і `Iterable` для нього структурні лише тому, що в typeshed вони описані як Protocol, а ваш `HasRender` для mypy лишається звичайним номінальним класом.

<!-- task: q3 -->

<!-- task: t3 -->

## `collections.abc`: реалізуйте три методи, отримайте решту

Модуль `collections.abc` грає дві ролі. Першу ви бачили в m2-l06 і m2-l07: це типи для анотацій, `Iterable[str]`, `Mapping[str, int]`. Друга роль: це ABC, від яких можна наслідуватись. Підклас реалізує кілька абстрактних методів, а решту інтерфейсу отримує готовою, написаною через ваші методи. Документація називає їх mixin methods (офіційний термін з таблиці в документації `collections.abc`). У JS найближче `[Symbol.iterator]`, який дає `for...of` і spread, але API на рівні `Map` вам довелось би писати руками або наслідувати сам `Map`.

```python live
from collections import abc

for name in ["Iterable", "Iterator", "Sequence", "MutableSequence", "Mapping", "MutableMapping", "Set"]:
    cls = getattr(abc, name)
    print(f"{name}: {sorted(cls.__abstractmethods__)}")
```

```text
Iterable: ['__iter__']
Iterator: ['__next__']
Sequence: ['__getitem__', '__len__']
MutableSequence: ['__delitem__', '__getitem__', '__len__', '__setitem__', 'insert']
Mapping: ['__getitem__', '__iter__', '__len__']
MutableMapping: ['__delitem__', '__getitem__', '__iter__', '__len__', '__setitem__']
Set: ['__contains__', '__iter__', '__len__']
```

| ABC | Реалізуєте | Отримуєте безкоштовно |
|---|---|---|
| `Iterable` | `__iter__` | нічого, але `isinstance` визнає клас і без наслідування |
| `Iterator` | `__next__` | `__iter__`, що повертає `self` |
| `Sequence` | `__getitem__`, `__len__` | `__contains__`, `__iter__`, `__reversed__`, `index`, `count` |
| `MutableSequence` | те саме + `__setitem__`, `__delitem__`, `insert` | ще `append`, `extend`, `pop`, `remove`, `reverse`, `clear`, `+=` |
| `Mapping` | `__getitem__`, `__iter__`, `__len__` | `__contains__`, `keys`, `items`, `values`, `get`, `__eq__` |
| `MutableMapping` | те саме + `__setitem__`, `__delitem__` | ще `pop`, `popitem`, `clear`, `update`, `setdefault` |
| `Set` | `__contains__`, `__iter__`, `__len__` | порівняння `<=`, `<` і інші, `&`, `\|`, `-`, `^`, `isdisjoint` |

`Iterable`, `Iterator`, `Sized`, `Container`, `Collection`, `Hashable` мають `__subclasshook__` і визнають клас за формою. `Sequence`, `Mapping`, `Set` і їхні змінні версії номінальні: щоб `isinstance` їх визнав, клас наслідує або реєструється. Ось колекція елементів форми за `id`: три методи, і об'єкт поводиться як незмінний словник.

```python live
from collections.abc import Iterator, Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Element:
    id: str
    kind: str


class FormElements(Mapping[str, Element]):
    def __init__(self, *elements: Element) -> None:
        self._by_id = {el.id: el for el in elements}

    def __getitem__(self, key: str) -> Element:
        return self._by_id[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._by_id)

    def __len__(self) -> int:
        return len(self._by_id)


form = FormElements(Element("email", "input"), Element("send", "button"))
print(form["email"])
print("email" in form, "phone" in form)
print(form.get("phone"), form.get("phone", "-"))
print(list(form.keys()), [el.kind for el in form.values()])
print(form == {"email": Element("email", "input"), "send": Element("send", "button")})
print(form.keys() & {"send", "phone"})
print(len(form), bool(form), bool(FormElements()))
match form:
    case {"email": Element(kind=kind)}:
        print("email is", kind)
hash(form)
```

```text
Element(id='email', kind='input')
True False
None -
['email', 'send'] ['input', 'button']
True
{'send'}
2 True False
email is input
TypeError: unhashable type: 'FormElements'
```

```text
$ mypy --strict form_elements.py
Success: no issues found in 1 source file
```

> **Під капотом.** Mixin-методи написані через ваші три. `get` і `in` викликають `self[key]` і ловлять `KeyError`. `keys()`, `items()`, `values()` повертають view-об'єкти навколо `self`, які ходять у `__iter__` і `__getitem__`; `keys()` при цьому сам є `Set`, тому `&` працює. `__eq__` порівнює `dict(self.items())` з іншим `Mapping`, і саме визначений `__eq__` робить клас unhashable, як пояснено в m4-l02. `bool` бере `__len__`. А `match` з шаблоном-словником працює, бо `Mapping` під час створення класу ставить типу службовий прапорець "я mapping", той самий, що має `dict`.

> **Пастка.** Увесь цей контракт тримається на тому, що `__getitem__` для відсутнього ключа кидає саме `KeyError`. JS-звичка "відсутній ключ дає `undefined`" перетворюється на `__getitem__`, який повертає `None`, і тоді `in` каже `True` для будь-якого ключа, а `get` ігнорує значення за замовчуванням. Якщо ж `__getitem__` пропускає назовні `IndexError` чи інший виняток, `get` і `in` падають замість відповіді.

```python
from collections.abc import Iterator, Mapping


class Lenient(Mapping[str, str]):
    def __init__(self, data: dict[str, str]) -> None:
        self._data = data

    def __getitem__(self, key: str) -> str | None:
        return self._data.get(key)

    def __iter__(self) -> Iterator[str]:
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)


m = Lenient({"email": "a@b.c"})
print("phone" in m)
print(m.get("phone", "default"))
```

```text
$ python lenient.py
True
None
```

```text
$ mypy --strict lenient.py
lenient.py:8: error: Return type "str | None" of "__getitem__" incompatible with return type "str" in supertype "typing.Mapping"  [override]
Found 1 error in 1 file (checked 1 source file)
```

mypy цей варіант ловить, бо `Mapping[str, str]` обіцяє `str` з `__getitem__`. Варіант з `IndexError` (наприклад, `self._items[key]` поверх списку) статично не відрізнити, його ловлять тести на `get` і `in`.

Чому не наслідувати просто `dict`? Бо методи `dict` написані на C і ваш перевизначений `__getitem__` обходять: `get` і `in` його не викликають. Детально про цю пастку й `collections.UserDict` у m4-l04. `Mapping` протилежний: кожен mixin-метод іде через ваш `__getitem__`.

```python
class Lower(dict[str, str]):
    def __getitem__(self, key: str) -> str:
        return super().__getitem__(key.lower())


d = Lower(email="a@b.c")
print(d["EMAIL"])
print(d.get("EMAIL"), "EMAIL" in d)
```

```text
a@b.c
None False
```

<!-- task: q4 -->

<!-- task: t4 -->

## Правило вибору: ABC чи Protocol

У Java є два інструменти, `interface` і `abstract class`, і обидва номінальні: тип дає лише `implements` чи `extends`. У TS обидва структурні: `interface` за формою, і навіть `abstract class` як тип приймає будь-який об'єкт з тією самою формою. Python розводить ролі інакше: `Protocol` це TS `interface` (структурний, лише для чекера), а ABC це Java `abstract class` (номінальний, зі спільним кодом і перевіркою в рантаймі). Слова "interface" у мові немає, і коли пітоніст каже "інтерфейс", він має на увазі Protocol або просто набір методів.

```ts
interface Renderer {
  render(text: string): string;
}

abstract class BaseRenderer implements Renderer {
  abstract render(text: string): string;
  renderMany(texts: string[]): string { return texts.map((t) => this.render(t)).join("\n"); }
}

class Fake {
  render(text: string) { return text; }
  renderMany(texts: string[]) { return texts.join(","); }
}

const a: Renderer = new Fake();      // ok
const b: BaseRenderer = new Fake();  // теж ok: abstract class як тип структурний
```

```python
from abc import ABC, abstractmethod
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...

    def render_many(self, texts: list[str]) -> str:
        return "\n".join(self.render(t) for t in texts)


class Fake:
    def render(self, text: str) -> str:
        return text

    def render_many(self, texts: list[str]) -> str:
        return ",".join(texts)


a: Renderer = Fake()
b: BaseRenderer = Fake()
```

```text
$ mypy --strict java_ts.py
java_ts.py:26: error: Incompatible types in assignment (expression has type "Fake", variable has type "BaseRenderer")  [assignment]
Found 1 error in 1 file (checked 1 source file)
```

Розходиться другий рядок: у TS форма `Fake` збігається з `BaseRenderer`, і цього досить; у Python ABC номінальний і для mypy, і для `isinstance`, тож без наслідування чи `register` клас не того типу. Через це звичка TS "абстрактний клас як тип параметра" в Python дає жорсткіший контракт, ніж ви очікуєте: тестовий дублер, чужий клас чи об'єкт зі сторонньої бібліотеки під такий параметр не підійдуть.

| | ABC | Protocol |
|---|---|---|
| Перевірка | у рантаймі при створенні екземпляра, плюс mypy | лише статична, mypy |
| Наслідування | потрібне (або `register`) | не потрібне |
| Спільний код | так, це головна причина | лише для тих, хто явно наслідує протокол |
| `isinstance` | так, завжди | лише з `@runtime_checkable`, і лише за іменами |
| Чужі класи | лише через `register` | приймаються автоматично |
| Ближчий аналог | Java `abstract class` | TS `interface` |

Правило. ABC, коли ви володієте ієрархією: усі реалізації ваші, у них є спільний код (template method, допоміжні методи, спільний `__init__`), і забутий метод має ловитись у рантаймі навіть без mypy. Protocol, коли ви описуєте вимогу споживача: тип параметра функції, елемент реєстру, callback, і особливо коли реалізації чужі або тестові (детально в m2-l07). Якщо сумніваєтесь, починайте з Protocol: його можна додати, не чіпаючи жодної реалізації, а ABC вимагає змінити бази всіх класів.

Інструменти не конкурують, а відповідають на різні питання, тому їх часто ставлять поруч. Protocol каже, що потрібно функції. ABC каже, як зручно будувати ваші власні реалізації. Підклас ABC автоматично відповідає протоколу, бо має потрібні методи, а чужий клас відповідає протоколу без жодної бази. Функція знає лише про протокол, і ABC лишається деталлю реалізації.

```python live
from abc import ABC, abstractmethod
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class BaseRenderer(ABC):
    def render(self, text: str) -> str:
        return self.open_tag() + text + self.close_tag()

    @abstractmethod
    def open_tag(self) -> str: ...

    @abstractmethod
    def close_tag(self) -> str: ...


class Paragraph(BaseRenderer):
    def open_tag(self) -> str:
        return "<p>"

    def close_tag(self) -> str:
        return "</p>"


class UpperRenderer:
    def render(self, text: str) -> str:
        return text.upper()


def publish(renderer: Renderer, text: str) -> str:
    return renderer.render(text)


print(publish(Paragraph(), "hi"))
print(publish(UpperRenderer(), "hi"))
```

```text
$ python combined.py
<p>hi</p>
HI
```

```text
$ mypy --strict combined.py
Success: no issues found in 1 source file
```

> **Під капотом.** Конфлікту немає й на рівні механіки: metaclass протоколів, `typing._ProtocolMeta`, сам є підкласом `ABCMeta`. Тому `@abstractmethod`, поставлений у протоколі, працює в рантаймі для класів, що явно його наслідують. У m2-l07 `Draft(Renderer)` створювався, бо методи протоколу там були без `@abstractmethod`.

```python
from abc import ABCMeta, abstractmethod
from typing import Protocol


class Renderer(Protocol):
    @abstractmethod
    def render(self, text: str) -> str: ...


class Draft(Renderer):
    pass


print(type(Renderer).__name__, issubclass(type(Renderer), ABCMeta))
Draft()
```

```text
_ProtocolMeta True
TypeError: Can't instantiate abstract class Draft without an implementation for abstract method 'render'
```

Можливість є, але ролі краще не змішувати: протокол описує вимогу, а за спільним кодом і рантайм-перевіркою йдіть до окремого ABC. Так видно, що з них є публічним контрактом, а що внутрішньою зручністю.

## Для капстоуну

У m2-l07 рендерери капстоуну були незалежними класами під `Renderer` Protocol. Тепер форма це дерево (сторінка, групи, поля), і обхід дерева однаковий для всіх форматів: відрендерити дітей, обгорнути їх результатом батька, загорнути все в сторінку. Цей обхід переїжджає в `BaseRenderer(ABC)` як template method `render_tree`, а формати реалізують лише два кроки, `render_element` і `wrap_page`. Воркер, як і раніше, приймає `Renderer` Protocol і про `BaseRenderer` не знає нічого.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from html import escape
from typing import Literal, Protocol


@dataclass(frozen=True)
class Theme:
    name: str
    accent: str


@dataclass(frozen=True)
class Element:
    kind: Literal["page", "group", "input", "button"]
    id: str
    label: str
    children: tuple["Element", ...] = ()


class Renderer(Protocol):
    def render(self, element: Element, theme: Theme) -> str: ...


class BaseRenderer(ABC):
    def render(self, element: Element, theme: Theme) -> str:
        return self.wrap_page(self.render_tree(element, theme), theme)

    def render_tree(self, element: Element, theme: Theme) -> str:
        children = [self.render_tree(child, theme) for child in element.children]
        return self.render_element(element, children, theme)

    @abstractmethod
    def render_element(self, element: Element, children: list[str], theme: Theme) -> str: ...

    @abstractmethod
    def wrap_page(self, body: str, theme: Theme) -> str: ...


class HtmlRenderer(BaseRenderer):
    def render_element(self, element: Element, children: list[str], theme: Theme) -> str:
        label = escape(element.label)
        inner = "".join(children)
        match element.kind:
            case "page":
                return f"<h1>{label}</h1>{inner}"
            case "group":
                return f"<fieldset><legend>{label}</legend>{inner}</fieldset>"
            case "input":
                return f'<label>{label} <input name="{element.id}"></label>'
            case "button":
                return f'<button style="background: {theme.accent}">{label}</button>'

    def wrap_page(self, body: str, theme: Theme) -> str:
        return f'<form class="theme-{theme.name}">{body}</form>'


class OutlineRenderer(BaseRenderer):
    def render_element(self, element: Element, children: list[str], theme: Theme) -> str:
        lines = [f"{element.kind} {element.id}: {element.label}"]
        for child in children:
            lines.extend("  " + line for line in child.splitlines())
        return "\n".join(lines)

    def wrap_page(self, body: str, theme: Theme) -> str:
        return f"[{theme.name}]\n{body}"


class FakeRenderer:
    def render(self, element: Element, theme: Theme) -> str:
        return f"fake:{element.id}"


def publish(form: Element, renderer: Renderer, theme: Theme) -> str:
    return renderer.render(form, theme)


form = Element("page", "signup", "Sign up", (
    Element("group", "contact", "Contact", (
        Element("input", "email", "Email"),
        Element("input", "phone", "Phone & fax"),
    )),
    Element("button", "send", "Send"),
))
light = Theme("light", "#0066cc")
for renderer in (HtmlRenderer(), OutlineRenderer(), FakeRenderer()):
    print(publish(form, renderer, light))
```

```text
$ python base_renderer.py
<form class="theme-light"><h1>Sign up</h1><fieldset><legend>Contact</legend><label>Email <input name="email"></label><label>Phone &amp; fax <input name="phone"></label></fieldset><button style="background: #0066cc">Send</button></form>
[light]
page signup: Sign up
  group contact: Contact
    input email: Email
    input phone: Phone & fax
  button send: Send
fake:signup
```

```text
$ mypy --strict base_renderer.py
Success: no issues found in 1 source file
```

`HtmlRenderer` і `OutlineRenderer` відповідають `Renderer`, бо успадкували від бази `render` з правильною сигнатурою; `FakeRenderer` відповідає, бо має такий самий метод сам. Новий формат, де забули `wrap_page`, не створиться ні в тесті, ні в проді, а mypy покаже це на рядку з конструктором.

> **Для капстоуну.** `BaseRenderer` живе в `renderers/base.py` поруч із Protocol і не експортується як тип для воркера: сигнатура воркера, `get_renderer` з m3-l01 і тестові дублери спираються лише на Protocol. Якщо ви колись захочете Jinja2-рендерер (m7-l06), що не проходить дерево сам, він просто реалізує `render` без бази, і воркер цього не помітить.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`interface` з `implements` як єдиний спосіб.** Для кожної абстракції пишуть ABC і змушують усі реалізації, включно з тестовими дублерами, його наслідувати, бо в Java й C# так прийнято. Правильно: Protocol для вимоги споживача, ABC лише там, де є спільний код у власній ієрархії.

   ```python
   def publish(renderer: Renderer, text: str) -> str: ...  # Protocol: підходить будь-хто з render
   ```

2. **Очікування, що абстрактний клас перевіряється лише при компіляції.** З TS звикли, що `abstract` зникає в рантаймі, і в тесті створюють базу напряму, щоб перевірити її спільний метод. Отримують `TypeError`. Правильно: у тесті мінімальний конкретний підклас.

   ```python
   class Stub(TagRenderer):
       tag = "x"
       def open_tag(self) -> str: return "<x>"
       def close_tag(self) -> str: return super().close_tag()
   assert Stub().render("a") == "<x>a</x>"
   ```

3. **ABC без `@abstractmethod`.** Наслідують `ABC` і вважають, що клас тепер "абстрактний", а методи кидають `NotImplementedError`. Нічого не перевіряється: клас створюється, падає лише виклик. Правильно: кожен обов'язковий метод з `@abstractmethod`.

   ```python
   class Base(ABC):
       @abstractmethod
       def render(self, text: str) -> str: ...
   ```

4. **Очікування помилки на оголошенні підкласу.** У TS незакритий абстрактний метод видно на рядку `class X extends`. У Python підклас оголошується мовчки, а помилка чекає на перше створення екземпляра, яке може трапитись рідко. Правильно: тест, що створює кожну реалізацію з реєстру, і mypy, що ловить `[abstract]` біля конструктора.

   ```python
   for cls in (HtmlRenderer, OutlineRenderer):
       cls()  # TypeError тут, а не при імпорті модуля
   ```

5. **Неправильний порядок декораторів.** `@abstractmethod` над `@property`, бо в TS модифікатори пишуть у будь-якому порядку. Модуль падає з `AttributeError` при імпорті, mypy мовчить. Правильно: `@abstractmethod` найближче до `def`.

   ```python
   @property
   @abstractmethod
   def extension(self) -> str: ...
   ```

6. **Обгортка над словником з усіма методами вручну або `class X(dict)`.** У JS для Map-подібного класу пишуть `get`, `has`, `keys`, `entries` руками або наслідують `Map`. У Python ручна версія розходиться в деталях з `dict`, а наслідування `dict` обходить ваш `__getitem__`. Правильно: `Mapping` або `MutableMapping` і три-п'ять абстрактних методів.

   ```python
   class FormElements(Mapping[str, Element]):
       def __getitem__(self, key: str) -> Element: ...
       def __iter__(self) -> Iterator[str]: ...
       def __len__(self) -> int: ...
   ```

7. **`__getitem__`, що повертає `None` для відсутнього ключа.** Звичка `obj[key] === undefined`. Ламає `in` і `get` з усього mixin-набору. Правильно: кидати `KeyError`, а "м'яке" читання лишити `get`.

   ```python
   def __getitem__(self, key: str) -> Element:
       return self._by_id[key]  # KeyError для відсутнього ключа
   ```

8. **`register` як `implements`.** Реєструють клас і вважають, що Python перевірив методи і що mypy тепер прийме його як підтип. Не перевірив і не прийме. Правильно: `register` лише для чужих класів, які справді мають потрібні методи, а для статичної сумісності Protocol.

   ```python
   BaseRenderer.register(Broken)   # жодної перевірки
   Broken().render("x")            # AttributeError
   ```

## Підсумок

- ABC це абстрактний клас з Java, а не TS-інтерфейс: номінальний, зі спільним кодом і перевіркою в рантаймі.
- Перевірку дає лише пара `ABCMeta` (база `ABC`) і `@abstractmethod`; без будь-якої з них нічого не перевіряється.
- Помилка виникає при створенні екземпляра, а не при оголошенні підкласу, бо проміжні абстрактні класи легальні.
- `@abstractmethod` завжди найближче до `def`; абстрактну property може закрити звичайний атрибут класу.
- Абстрактний метод може мати тіло: підклас мусить перевизначити його, але може викликати `super()`. Це основа template method.
- `register` і `__subclasshook__` дають віртуальні підкласи: `isinstance` їх визнає, MRO і mypy ні.
- `collections.abc` дає mixin-методи: для `Mapping` досить `__getitem__`, `__iter__`, `__len__`, і `__getitem__` мусить кидати `KeyError`.
- Protocol для вимоги споживача і чужих реалізацій, ABC для власної ієрархії зі спільним кодом; у сумніві починайте з Protocol.
- Поєднання нормальне: параметр типізований Protocol, власні реалізації наслідують ABC, який цьому протоколу відповідає.

## Що далі

Наступний урок m4-l06 про `Enum` і `StrEnum`. `kind: Literal[...]` у дереві елементів там стане enum-ом, і ви побачите ще один клас зі своїм metaclass, чия поведінка, як і в `ABCMeta`, визначається в момент створення класу. Template method з цього уроку повернеться в m4-l08, де його порівняють з функцією, що приймає кроки як параметри.
