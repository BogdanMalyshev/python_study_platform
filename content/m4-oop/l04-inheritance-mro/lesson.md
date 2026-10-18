---
id: m4-l04
module: m4-oop
title: "Наслідування, super(), MRO, mixins"
summary: "Учень будує неглибокі ієрархії класів, розуміє super() як \"наступний у MRO\", пише кооперативні __init__ і mixins, реєструє підкласи через __init_subclass__ і знає, коли наслідування замінити композицією."
duration_min: 75
prerequisites: [m4-l03]
---

## `class B(A)`: той самий `extends`, інші правила для `super()`

Батьківський клас пишеться в дужках після імені: `class EmailField(Field)` це `class EmailField extends Field`. Метод з тим самим іменем у підкласі перевизначає батьківський, а `super()` дає доступ до батьківської реалізації. До цього місця все як у TypeScript.

```ts
class Field {
  constructor(public id: string, public label: string) {}
  describe(): string {
    return `${this.constructor.name} '${this.id}': ${this.label}`;
  }
}

class EmailField extends Field {
  constructor(id: string, label: string, public domain?: string) {
    super(id, label);
  }
  describe(): string {
    const base = super.describe();
    return this.domain ? `${base} (@${this.domain})` : base;
  }
}
```

```python live
class Field:
    def __init__(self, id: str, label: str) -> None:
        self.id = id
        self.label = label

    def describe(self) -> str:
        return f"{type(self).__name__} {self.id!r}: {self.label}"


class EmailField(Field):
    def __init__(self, id: str, label: str, domain: str | None = None) -> None:
        super().__init__(id, label)
        self.domain = domain

    def describe(self) -> str:
        base = super().describe()
        return f"{base} (@{self.domain})" if self.domain else base


f = EmailField("email", "Email", domain="example.com")
print(f.describe())
print(Field("age", "Age").describe())
print(isinstance(f, Field), isinstance(f, EmailField), issubclass(EmailField, Field))
print([b.__name__ for b in EmailField.__bases__], [b.__name__ for b in Field.__bases__])
print([c.__name__ for c in EmailField.__mro__])
```

```text
EmailField 'email': Email (@example.com)
Field 'age': Age
True True True
['Field'] ['object']
['EmailField', 'Field', 'object']
```

Розходжень три. `super` у Python це виклик функції `super()`, який повертає проксі-об'єкт, а не ключове слово, тому `super().describe()` з дужками, а батьківський ініціалізатор це звичайний метод `super().__init__(...)`. `isinstance` і `issubclass` відповідають `instanceof` і перевірці прототипу. І кожен клас без явних батьків наслідує `object`: `class Field:` і `class Field(object):` це одне й те саме, друга форма лишилась з Python 2. Ланцюжок пошуку методів лежить у `__mro__`, до нього повернемось у розділі про множинне наслідування.

> **Пастка.** `bool` це підклас `int`, тож `isinstance(True, int)` істинне, а `True + True == 2`. Валідатор числового поля FormBuilder, написаний як `isinstance(value, int)`, пропустить `true` з JSON. Перевіряйте `bool` першим або порівнюйте `type(value) is int`.

```python
print(isinstance(True, int), issubclass(bool, int), True + True)
print([c.__name__ for c in bool.__mro__])
```

```text
True True 2
['bool', 'int', 'object']
```

У JS `this` до `super()` у конструкторі підкласу дає `ReferenceError`, бо об'єкт створює базовий конструктор. У Python екземпляр уже існує до виклику `__init__`: його створив `__new__` (m4-l01), а `__init__` лише заповнює готовий об'єкт. Тому `super().__init__()` можна викликати першим рядком, останнім, за умовою або не викликати зовсім.

```python
class Field:
    def __init__(self, id: str) -> None:
        self.id = id
        self.errors: list[str] = []


class SelectField(Field):
    def __init__(self, id: str, options: list[str]) -> None:
        self.options = [o.strip() for o in options]
        print("before super:", vars(self))
        super().__init__(id)
        print("after super:", vars(self))


s = SelectField("color", [" red", "green "])
```

```text
before super: {'options': ['red', 'green']}
after super: {'options': ['red', 'green'], 'id': 'color', 'errors': []}
```

Зворотний бік тієї самої свободи: ніхто не змушує викликати батьківський `__init__`. TypeScript не скомпілює похідний конструктор без `super(...)`, а Python і mypy мовчать. Забутий виклик проявляється пізніше, коли хтось читає атрибут, який ставив лише батьківський `__init__`.

```python
class Field:
    def __init__(self, id: str) -> None:
        self.id = id
        self.errors: list[str] = []


class CheckboxField(Field):
    def __init__(self, id: str, checked: bool = False) -> None:
        self.checked = checked


c = CheckboxField("terms")
print(vars(c))
print(c.id)
```

```text
{'checked': False}
    print(c.id)
          ^^^^
AttributeError: 'CheckboxField' object has no attribute 'id'
```

<!-- task: q2 -->

`super()` без аргументів працює не магією рантайму, а підказкою компілятора. У Python 2 писали `super(EmailField, self)`: клас, від якого шукати, і об'єкт. З Python 3 компілятор, побачивши ім'я `super` у тілі методу, створює для нього прихований осередок замикання (cell, офіційний термін CPython для змінної замикання) `__class__` з класом, у якому метод визначено, і `super()` розгортається в `super(__class__, <перший аргумент>)`. Явна форма досі працює, але потрібна рідко.

```python
class Field:
    def describe(self) -> str:
        return "field"


class EmailField(Field):
    def describe(self) -> str:
        return "email " + super(EmailField, self).describe()


class PhoneField(Field):
    def describe(self) -> str:
        print(__class__)
        return "phone " + super().describe()


print(EmailField().describe())
print(PhoneField().describe())
print(PhoneField.describe.__code__.co_freevars, Field.describe.__code__.co_freevars)
```

```text
email field
<class '__main__.PhoneField'>
phone field
('__class__',) ()
```

> **Під капотом.** Осередок `__class__` з'являється лише у функції, визначеній у тілі класу. Функція, написана окремо й потім присвоєна класу, його не має, і `super()` у ній падає. Це рідкісний випадок, але він пояснює, чому в Python 3 `super()` не потребує аргументів, а в JS `super` взагалі синтаксис, а не значення.

```python
class Field:
    def describe(self) -> str:
        return "field"


def describe(self) -> str:
    return "patched " + super().describe()


class EmailField(Field):
    pass


EmailField.describe = describe
print(EmailField().describe())
```

```text
RuntimeError: super(): __class__ cell not found
```

> **Пастка.** `isinstance` перевіряє ідентичність об'єкта класу, а не ім'я. У JS `instanceof` ламається між iframe або коли в `node_modules` дві копії однієї бібліотеки. У Python аналог: модуль, запущений як скрипт, виконується двічі, як `__main__` і як `models` при імпорті з іншого файлу, і з'являються два різні класи `Field` з однаковим іменем.

```python
# models.py
class Field:
    def __init__(self, id: str) -> None:
        self.id = id


if __name__ == "__main__":
    import validators

    f = Field("email")
    print(validators.is_field(f))
    print(type(f), validators.Field)
    print(type(f) is validators.Field)
```

```python
# validators.py
from models import Field


def is_field(obj: object) -> bool:
    return isinstance(obj, Field)
```

```text
$ python models.py
False
<class '__main__.Field'> <class 'models.Field'>
False
```

Механізм розібраний у m3-l01: модуль виконується один раз і кешується в `sys.modules` під своїм іменем, а `__main__` і `models` це два різні імена. Рецепт: модулі з класами не запускати як скрипти, точку входу тримати окремо або запускати через `python -m package.module`.

<!-- task: t1 -->

## Перевизначення: розширити, не зламати контракт

Перевизначений метод рідко пишуть з нуля. Типова форма вже була вище: викликати `super().method(...)`, взяти результат і додати своє до або після. Межу того, що підклас може змінити, задає принцип підстановки Лісков (Liskov substitution principle, LSP; загальний термін ООП, не специфічний для Python): підклас можна передати всюди, де очікується базовий клас, і нічого не зламається. На практиці це означає, що перевизначений метод приймає ті самі аргументи, повертає той самий тип і не кидає нових винятків.

```python
class Field:
    def validate(self, value: str) -> list[str]:
        return [] if value else ["required"]


class AgeField(Field):
    def validate(self, value: str, strict: bool) -> list[str]:
        errors = super().validate(value)
        if value and not value.isdigit():
            errors.append("not a number")
        return errors


def check_all(fields: list[Field], value: str) -> list[list[str]]:
    return [f.validate(value) for f in fields]


print(check_all([Field(), AgeField()], "abc"))
```

```text
    return [f.validate(value) for f in fields]
            ^^^^^^^^^^^^^^^^^
TypeError: AgeField.validate() missing 1 required positional argument: 'strict'
```

Рантайм дізнається про порушення лише в момент виклику. mypy ловить його в оголошенні підкласу, тому для ієрархій класів він особливо корисний:

```text
$ mypy --strict lsp.py
lsp.py:7: error: Signature of "validate" incompatible with supertype "Field"  [override]
lsp.py:7: note:      Superclass:
lsp.py:7: note:          def validate(self, value: str) -> list[str]
lsp.py:7: note:      Subclass:
lsp.py:7: note:          def validate(self, value: str, strict: bool) -> list[str]
Found 1 error in 1 file (checked 1 source file)
```

Виняток з цього правила `__init__`: mypy свідомо не перевіряє сумісність конструкторів, бо зазвичай ви викликаєте `AgeField(...)`, знаючи конкретний клас. Ризик з'являється, коли базовий клас сам створює екземпляри через `cls(...)` або `type(self)(...)`: альтернативний конструктор `from_dict`, метод копіювання. Тоді підклас з іншою сигнатурою `__init__` ламає успадкований метод, і жоден інструмент цього не підкаже.

```python
from typing import Any, Self


class Field:
    def __init__(self, id: str, label: str) -> None:
        self.id = id
        self.label = label

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(data["id"], data["label"])

    def with_label(self, label: str) -> Self:
        return type(self)(self.id, label)


class SelectField(Field):
    def __init__(self, id: str, label: str, options: list[str]) -> None:
        super().__init__(id, label)
        self.options = options


s = SelectField("color", "Color", ["red", "green"])
print(Field.from_dict({"id": "age", "label": "Age"}).label)
s.with_label("Colour")
```

```text
Age
    return type(self)(self.id, label)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
TypeError: SelectField.__init__() missing 1 required positional argument: 'options'
```

```text
$ mypy --strict init_sig.py
Success: no issues found in 1 source file
```

Правило: якщо базовий клас має методи, що створюють `cls(...)`, підклас додає до `__init__` лише параметри зі значеннями за замовчуванням, бажано keyword-only, або перевизначає ці методи теж.

Абстрактний метод без жодних модулів пишуть так: базовий клас оголошує метод, тіло якого `raise NotImplementedError`. Це контракт "підклас зобов'язаний реалізувати", і базовий клас може вже викликати цей метод зі свого спільного коду, як `export_all` нижче.

```python
class Exporter:
    def export(self, rows: list[dict]) -> str:
        raise NotImplementedError(f"{type(self).__name__}.export")

    def export_all(self, batches: list[list[dict]]) -> list[str]:
        return [self.export(rows) for rows in batches]


class CsvExporter(Exporter):
    def export(self, rows: list[dict]) -> str:
        return "\n".join(",".join(map(str, r.values())) for r in rows)


class XmlExporter(Exporter):
    pass


print(CsvExporter().export_all([[{"id": "email", "type": "text"}]]))
x = XmlExporter()
print("created:", type(x).__name__)
x.export_all([[{"id": "email"}]])
```

```text
['email,text']
created: XmlExporter
NotImplementedError: XmlExporter.export
```

Слабке місце видно у виводі: об'єкт без реалізації створюється без проблем, а падає лише тоді, коли хтось дійде до виклику. `abc.ABC` з `@abstractmethod` переносить перевірку в момент створення екземпляра (`TypeError: Can't instantiate abstract class`), детально в m4-l05.

> **Пастка.** `NotImplemented` і `NotImplementedError` це різні речі. Перше це константа, яку повертають бінарні dunder-методи (dunder, жаргон спільноти від double underscore) на кшталт `__eq__`, щоб Python спробував інший операнд (m4-l02). Друге це виняток. `raise NotImplemented` падає не з тим повідомленням, яке ви чекали.

```python
class Exporter:
    def export(self, rows):
        raise NotImplemented


Exporter().export([])
```

```text
TypeError: exceptions must derive from BaseException
```

## Атрибути класу в ієрархії і `__init_subclass__`

Атрибут шукається спершу в `__dict__` екземпляра, потім у класах по черзі з `__mro__`. Звідси дешевий вид поліморфізму: базовий метод читає константу через `self`, підклас перевизначає лише константу, і успадкований метод поводиться інакше без жодного рядка перевизначеного коду. У TS для цього довелось би писати `(this.constructor as typeof Element).tag`, у Python `self.tag` знаходить атрибут класу сам.

```python live
class Element:
    tag = "div"
    void = False

    def __init__(self, id: str) -> None:
        self.id = id

    def render(self) -> str:
        if self.void:
            return f'<{self.tag} id="{self.id}">'
        return f'<{self.tag} id="{self.id}"></{self.tag}>'


class Input(Element):
    tag = "input"
    void = True


class Button(Element):
    tag = "button"


class SubmitButton(Button):
    pass


for el in [Element("box"), Input("email"), SubmitButton("send")]:
    print(el.render())

print("tag" in vars(SubmitButton), "tag" in vars(Button))
print([c.__name__ for c in SubmitButton.__mro__ if "tag" in vars(c)])
```

```text
<div id="box"></div>
<input id="email">
<button id="send"></button>
False True
['Button', 'Element']
```

`SubmitButton` не має власного `tag`, пошук іде по MRO і першим знаходить `Button.tag`. Якби базовий `render` читав `Element.tag` замість `self.tag`, перевизначення в підкласах ніколи б не спрацювало: ім'я класу в тілі методу прибиває пошук до одного місця.

> **Пастка.** Змінюваний атрибут класу спільний не лише для екземплярів (m4-l01), а й для всіх підкласів. `Input.classes.append(...)` змінює список, що лежить на `Element`, бо `Input` власного списку не має. Свій список у підкласі з'являється лише після присвоєння.

```python
class Element:
    css_classes: list[str] = []


class Input(Element):
    pass


Input.css_classes.append("form-control")
print(Element.css_classes)


class Button(Element):
    css_classes = Element.css_classes + ["btn"]


print(Element.css_classes, Button.css_classes)
```

```text
['form-control']
['form-control'] ['form-control', 'btn']
```

<!-- task: q3 -->

Іноді базовому класу треба знати про кожен свій підклас: зареєструвати рендерер за іменем формату, перевірити, що підклас визначив обов'язкову константу. Для цього є хук `__init_subclass__` (офіційна назва, PEP 487). Python викликає його на батьківському класі щоразу, коли закінчує виконувати оператор `class` підкласу, і передає новий підклас як `cls`. Keyword-аргументи з рядка оголошення, `class HtmlRenderer(Renderer, fmt="html")`, потрапляють у його параметри. Метод неявно є `classmethod`, декоратор не потрібен.

```python live
class Renderer:
    registry: dict[str, type["Renderer"]] = {}

    def __init_subclass__(cls, /, fmt: str | None = None, **kwargs) -> None:
        super().__init_subclass__(**kwargs)
        print(f"__init_subclass__: cls={cls.__name__}, fmt={fmt!r}")
        if fmt is None:
            return
        if fmt in Renderer.registry:
            raise ValueError(f"format {fmt!r} already taken by {Renderer.registry[fmt].__name__}")
        Renderer.registry[fmt] = cls


class HtmlRenderer(Renderer, fmt="html"):
    pass


class TextRenderer(Renderer, fmt="text"):
    pass


class PrettyHtmlRenderer(HtmlRenderer):
    pass


print({k: v.__name__ for k, v in Renderer.registry.items()})
print(type(Renderer.__dict__["__init_subclass__"]).__name__)
```

```text
__init_subclass__: cls=HtmlRenderer, fmt='html'
__init_subclass__: cls=TextRenderer, fmt='text'
__init_subclass__: cls=PrettyHtmlRenderer, fmt=None
{'html': 'HtmlRenderer', 'text': 'TextRenderer'}
classmethod
```

Хук спрацьовує і для онуків: `PrettyHtmlRenderer` наслідує `HtmlRenderer`, але `__init_subclass__` знайдено по MRO на `Renderer`. Тому параметр `fmt` має значення за замовчуванням: проміжні й тестові класи без формату не реєструються. Виклик `super().__init_subclass__(**kwargs)` робить хук кооперативним, щоб інший базовий клас у множинному наслідуванні теж отримав свої аргументи. Помилки ловляться в момент оголошення класу, тобто при імпорті модуля. Продовження прикладу вище:

```python
class AnotherHtml(Renderer, fmt="html"):
    pass
```

```text
__init_subclass__: cls=AnotherHtml, fmt='html'
ValueError: format 'html' already taken by HtmlRenderer
```

Якщо базовий клас хук не визначає, keyword-аргумент у рядку `class` дійде до `object.__init_subclass__`, який аргументів не приймає:

```python
class Renderer:
    pass


class HtmlRenderer(Renderer, fmt="html"):
    pass
```

```text
TypeError: HtmlRenderer.__init_subclass__() takes no keyword arguments
```

> **JS-аналог.** У JS немає хука "мене успадкували". Найближче це статичний блок у кожному підкласі, `static { registry.set("html", this); }`, який треба не забути написати. Альтернатива в Python, декоратор класу `@register("html")`, розібрана в m5-l04: вона явна і працює для будь-якого класу, а `__init_subclass__` автоматичний для всіх нащадків і не дає забути реєстрацію. Обидва варіанти мають одну спільну пастку: клас реєструється, лише коли його модуль імпортовано.

<!-- task: t2 -->

## Множинне наслідування і MRO

Python дозволяє кілька батьків: `class Form(Validating, Logging)`. Порядок, у якому інтерпретатор шукає атрибути, називається MRO (method resolution order, офіційний термін документації). Він обчислюється один раз при створенні класу, лежить у `Class.__mro__` як кортеж класів, і будь-який пошук атрибута, від методу до константи, іде по ньому зліва направо. Класичний приклад це ромб (diamond, загальний термін ООП): два батьки зі спільним предком.

```python live
class Base:
    def save(self) -> None:
        print("Base.save")


class Validating(Base):
    def save(self) -> None:
        print("Validating.save")
        super().save()


class Logging(Base):
    def save(self) -> None:
        print("Logging.save")
        super().save()


class Form(Validating, Logging):
    def save(self) -> None:
        print("Form.save")
        super().save()


print([c.__name__ for c in Form.__mro__])
Form().save()
print("---")
Validating().save()
```

```text
['Form', 'Validating', 'Logging', 'Base', 'object']
Form.save
Validating.save
Logging.save
Base.save
---
Validating.save
Base.save
```

Ключове в цьому виводі: `super()` у `Validating.save` для екземпляра `Form` викликає `Logging.save`, хоча `Validating` про `Logging` нічого не знає і наслідує лише `Base`. `super()` означає не "мій батько", а "наступний після мене клас у MRO типу `type(self)`". Для екземпляра самого `Validating` наступним буде `Base`, що видно в другій частині виводу. Завдяки цьому `Base.save` виконується рівно один раз, а кожен клас у ромбі отримує свою чергу.

Сам порядок будує алгоритм C3-лінеаризації (C3 linearization, офіційна назва, документ "The Python 2.3 Method Resolution Order"). Він гарантує три речі: клас стоїть перед своїми батьками; батьки йдуть у тому порядку, у якому їх перелічено в оголошенні; власний MRO кожного батька зберігається. Механіка: MRO класу це сам клас плюс злиття (merge) MRO батьків і списку батьків. На кожному кроці береться перший кандидат зі списків, якого немає в "хвості" (усе, крім першого елемента) жодного іншого списку.

```text
L[Validating] = [Validating, Base, object]
L[Logging]    = [Logging, Base, object]

L[Form] = Form + merge([Validating, Base, object], [Logging, Base, object], [Validating, Logging])
        = Form, Validating + merge([Base, object], [Logging, Base, object], [Logging])
          # Base стоїть у хвості другого списку, отже ще рано; беремо Logging
        = Form, Validating, Logging + merge([Base, object], [Base, object])
        = Form, Validating, Logging, Base, object
```

Простий обхід у глибину дав би `Form, Validating, Base, Logging`: `Base` раніше за `Logging`, і для методу, якого немає у `Validating`, знайшлася б версія `Base`, а перевизначення з `Logging` лишилось би непоміченим. Саме так працювали "класичні" класи Python 2; C3 з'явився в 2.3. Перевірити результат можна без ручного обчислення: `Form.mro()` повертає той самий порядок списком.

> **JS-аналог.** Ланцюжок прототипів у JS це однозв'язний список: у кожного об'єкта рівно один `[[Prototype]]`, тому порядок пошуку лінійний за побудовою і обчислювати нічого не треба. MRO виконує ту саму роль, але його обчислено з графа: батьків може бути кілька, і C3 розкладає граф у список один раз, при створенні класу. Прохід `Object.getPrototypeOf` по черзі в JS відповідає проходу по `__mro__` у Python.

Буває, що три вимоги C3 несумісні. `class C(A, B)` каже "`A` перед `B`", а `B` підклас `A`, отже `B` мусить стояти перед `A`. Такий клас не створюється, і помилка виникає в момент оголошення, а не при виклику методу:

```python
class A: pass
class B(A): pass
class C(A, B): pass
```

```text
TypeError: Cannot create a consistent method resolution
order (MRO) for bases A, B
```

<!-- task: q1 -->

З того, що `super()` веде до наступного в MRO, випливає проблема з `__init__`. Кожен клас у ланцюжку має свої параметри, а наступний клас заздалегідь невідомий: для `Labeled` у складі `TextInput` це `Required`, а не `Field`. Передати позиційні аргументи "батькові" неможливо. Рішення називається кооперативним множинним наслідуванням (cooperative multiple inheritance, формулювання з документації `super()`): усі `__init__` приймають keyword-only аргументи, кожен забирає свої, а решту передає далі через `**kwargs`.

```python live
class Field:
    def __init__(self, *, id: str, **kwargs) -> None:
        print("Field got", kwargs)
        super().__init__(**kwargs)
        self.id = id


class Labeled(Field):
    def __init__(self, *, label: str, **kwargs) -> None:
        print("Labeled got", kwargs)
        super().__init__(**kwargs)
        self.label = label


class Required(Field):
    def __init__(self, *, required: bool = False, **kwargs) -> None:
        print("Required got", kwargs)
        super().__init__(**kwargs)
        self.required = required


class TextInput(Labeled, Required):
    pass


t = TextInput(id="email", label="Email", required=True)
print([c.__name__ for c in TextInput.__mro__])
print(vars(t))
```

```text
Labeled got {'id': 'email', 'required': True}
Required got {'id': 'email'}
Field got {}
['TextInput', 'Labeled', 'Required', 'Field', 'object']
{'id': 'email', 'required': True, 'label': 'Email'}
```

Кінець ланцюжка це `object.__init__`, який не приймає жодних аргументів. Це корисно: якщо хтось передав зайвий або помилково названий аргумент, він не зникне мовчки, а дійде до `object` і впаде. Те саме повідомлення з'являється, коли один клас у ланцюжку викликає батька напряму, `Field.__init__(self, **kwargs)`, замість `super()`: `Required.__init__` пропускається, його `required` ніхто не забрав, і він доходить до `object`.

```python
class Field:
    def __init__(self, *, id: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self.id = id


class Labeled(Field):
    def __init__(self, *, label: str, **kwargs) -> None:
        Field.__init__(self, **kwargs)
        self.label = label


class Required(Field):
    def __init__(self, *, required: bool = False, **kwargs) -> None:
        super().__init__(**kwargs)
        self.required = required


class TextInput(Labeled, Required):
    pass


TextInput(id="email", label="Email", required=True)
```

```text
    super().__init__(**kwargs)
TypeError: object.__init__() takes exactly one argument (the instance to initialize)
```

> **Пастка.** Повідомлення вказує на `object.__init__`, а справжня причина вище: клас, що звернувся до батька на ім'я, вирізав частину MRO. У множинному наслідуванні або всі класи ієрархії викликають `super()`, або жоден; змішування дає саме такі помилки.

<!-- task: t3 -->

## Mixins: поведінка без стану

Mixin (жаргон спільноти; окремої конструкції в мові немає, але слово вживається і в stdlib: `socketserver.ThreadingMixIn`, розділ "Mixin Methods" у `collections.abc`) це невеликий клас, який не призначений для самостійного використання. Він додає кілька методів, не має власного `__init__` і стану, і спирається лише на те, що є в будь-якого екземпляра: `vars(self)`, `type(self)`, методи, які гарантує базовий клас.

```python live
import json


class ReprMixin:
    def __repr__(self) -> str:
        fields = ", ".join(f"{k}={v!r}" for k, v in vars(self).items())
        return f"{type(self).__name__}({fields})"


class JsonMixin:
    def to_dict(self) -> dict:
        return dict(vars(self))

    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class Element:
    def __init__(self, id: str, kind: str) -> None:
        self.id = id
        self.kind = kind


class Input(ReprMixin, JsonMixin, Element):
    def __init__(self, id: str, placeholder: str = "") -> None:
        super().__init__(id, "input")
        self.placeholder = placeholder


i = Input("email", placeholder="you@example.com")
print(repr(i))
print(i.to_json())
print([c.__name__ for c in Input.__mro__])
```

```text
Input(id='email', kind='input', placeholder='you@example.com')
{"id": "email", "kind": "input", "placeholder": "you@example.com"}
['Input', 'ReprMixin', 'JsonMixin', 'Element', 'object']
```

Зверніть увагу, що `super().__init__(id, "input")` в `Input` пройшов через `ReprMixin` і `JsonMixin` до `Element`: у mixins немає `__init__`, пошук іде далі по MRO. У TypeScript mixin це функція, що приймає клас і повертає анонімний підклас.

```ts
type Ctor<T = object> = new (...args: any[]) => T;

const Jsonable = <B extends Ctor>(Base: B) =>
  class extends Base {
    toJSON() { return { ...this }; }
  };

const Reprable = <B extends Ctor>(Base: B) =>
  class extends Base {
    toString() { return `${this.constructor.name}(${JSON.stringify(this)})`; }
  };

class Input extends Reprable(Jsonable(Element)) {}
```

```python
class Input(ReprMixin, JsonMixin, Element): ...
```

TS-патерн це ручна лінеаризація: вкладеність викликів і є ланцюжок прототипів, і кожен виклик створює новий анонімний клас. У Python лінеаризацію робить C3, mixin це звичайний іменований клас, який видно в `__mro__` і можна перевірити через `isinstance`, а спільний предок у ромбі не дублюється. `Object.assign(Base.prototype, mixin)` ще далі від Python: методи копіюються, `super` з них не працює, а однакові імена мовчки перезаписуються.

Mixins пишуть ліворуч від базового класу. Причина в напрямку пошуку: щоб метод mixin перекрив метод бази, mixin мусить стояти в MRO раніше. Праворуч він спрацює лише для методів, яких база не має.

```python
class ReprMixin:
    def __repr__(self) -> str:
        fields = ", ".join(f"{k}={v!r}" for k, v in vars(self).items())
        return f"{type(self).__name__}({fields})"


class Element:
    def __init__(self, id: str) -> None:
        self.id = id

    def __repr__(self) -> str:
        return f"<element {self.id}>"


class Left(ReprMixin, Element):
    pass


class Right(Element, ReprMixin):
    pass


print(Left("email"), [c.__name__ for c in Left.__mro__])
print(Right("email"), [c.__name__ for c in Right.__mro__])
```

```text
Left(id='email') ['Left', 'ReprMixin', 'Element', 'object']
<element email> ['Right', 'Element', 'ReprMixin', 'object']
```

Друга причина стояти ліворуч: mixin може обгортати метод бази через `super()`, і тоді `super()` веде вглиб, до бази. Кілька таких mixins утворюють конвеєр у порядку оголошення. Самостійно такий mixin не працює: у його власному MRO після нього лише `object`.

```python live
class Field:
    def clean(self, value: str) -> str:
        return value


class StripMixin:
    def clean(self, value: str) -> str:
        print("strip")
        return super().clean(value.strip())


class LowerMixin:
    def clean(self, value: str) -> str:
        print("lower")
        return super().clean(value.lower())


class EmailField(StripMixin, LowerMixin, Field):
    pass


print(repr(EmailField().clean("  Ann@Example.COM ")))
print([c.__name__ for c in EmailField.__mro__])
```

```text
strip
lower
'ann@example.com'
['EmailField', 'StripMixin', 'LowerMixin', 'Field', 'object']
```

```python
StripMixin().clean(" x ")
```

```text
strip
AttributeError: 'super' object has no attribute 'clean'
```

Чому mixin без `__init__` простіший: `__init__` mixin стає частиною кооперативного ланцюжка, і якщо він не приймає `**kwargs` і не викликає `super().__init__`, він обриває ініціалізацію бази. Нижче `Input("email")` знаходить по MRO `TimestampMixin.__init__` раніше за `Element.__init__`. Якщо mixin справді потребує стану, він мусить бути кооперативним за всіма правилами попереднього розділу, і це зазвичай сигнал, що тут потрібна композиція (m4-l08).

```python
class TimestampMixin:
    def __init__(self) -> None:
        self.created_at = 0


class Element:
    def __init__(self, id: str) -> None:
        self.id = id


class Input(TimestampMixin, Element):
    pass


Input("email")
```

```text
TypeError: TimestampMixin.__init__() takes 1 positional argument but 2 were given
```

<!-- task: t4 -->

## Наслідування від `dict` і `list`

Вбудовані типи можна наслідувати, і `class Answers(dict)` виглядає як природний спосіб перехопити запис. Але перевизначений `__setitem__` бачить лише `a[key] = value`. Конструктор, `update` і `setdefault` його обходять.

```python
class Answers(dict):
    def __setitem__(self, key: str, value: object) -> None:
        super().__setitem__(key.strip().lower(), value)


a = Answers(Email="x@y.z")
a["  Phone "] = "+380"
a.update({"AGE": 30})
a.setdefault("Name", "Ann")
print(a)
```

```text
{'Email': 'x@y.z', 'phone': '+380', 'AGE': 30, 'Name': 'Ann'}
```

> **Під капотом.** `dict` реалізований на C, і його методи пишуть у хеш-таблицю внутрішньою C-функцією напряму, не шукаючи `__setitem__` на типі об'єкта. Це свідоме рішення заради швидкості: вбудовані типи не обіцяють, що один метод реалізований через інший. Для `list` те саме, плюс операції повертають базовий тип: `FieldList + [...]`, зріз і `copy()` дають звичайний `list`.

```python
class FieldList(list):
    def names(self) -> list[str]:
        return [f["id"] for f in self]


fields = FieldList([{"id": "email"}])
more = fields + [{"id": "age"}]
print(type(more).__name__)
print(type(fields[:1]).__name__, type(fields.copy()).__name__)
more.names()
```

```text
list
list list
AttributeError: 'list' object has no attribute 'names'
```

<!-- task: q4 -->

Для таких випадків у `collections` є `UserDict`, `UserList` і `UserString`. Це обгортки на чистому Python: дані лежать у `self.data`, а всі методи, успадковані від `MutableMapping`, ідуть через ваші `__setitem__` і `__getitem__`. Той самий клас з `UserDict` нормалізує ключі на всіх шляхах запису.

```python live
from collections import UserDict


class Answers(UserDict):
    def __setitem__(self, key: str, value: object) -> None:
        super().__setitem__(key.strip().lower(), value)


a = Answers(Email="x@y.z")
a["  Phone "] = "+380"
a.update({"AGE": 30})
a.setdefault("Name", "Ann")
print(a)
print(type(a.data), isinstance(a, dict))
```

```text
{'email': 'x@y.z', 'phone': '+380', 'age': 30, 'name': 'Ann'}
<class 'dict'> False
```

Ціна в останньому рядку: `UserDict` не є `dict`. Код, що перевіряє `isinstance(x, dict)`, його відкине, а `json.dumps` не серіалізує, тому на межі з JSON його перетворюють через `dict(a)`. Часто ще простіший шлях це композиція: звичайний клас, що тримає `dict` усередині й має лише ті методи, які потрібні (m4-l08), або власна `MutableMapping` (m4-l05).

```python
import json
from collections import UserDict
from collections.abc import MutableMapping


class Answers(UserDict):
    pass


a = Answers(email="x@y.z")
print(isinstance(a, MutableMapping))
print(json.dumps(dict(a)))
try:
    json.dumps(a)
except TypeError as e:
    print("TypeError:", e)
```

```text
True
{"email": "x@y.z"}
TypeError: Object of type Answers is not JSON serializable
```

<!-- task: t5 -->

## Коли наслідувати, а коли ні

Наслідування доречне, коли підклас справді є різновидом базового класу і код працює з базовим типом, отримуючи різну поведінку: `HtmlRenderer` це `Renderer`, і функція, що приймає рендерер, не знає, який саме. Недоречне, коли мета взяти готові методи. Підклас успадковує весь публічний інтерфейс батька, і клієнти почнуть ним користуватись.

```python
class HttpClient:
    def get(self, path: str) -> str:
        return f"GET {path}"

    def delete(self, path: str) -> str:
        return f"DELETE {path}"


class FormService(HttpClient):
    def load_form(self, form_id: str) -> str:
        return self.get(f"/forms/{form_id}")


service = FormService()
print(service.load_form("f1"))
print(service.delete("/forms"))
print([name for name in dir(service) if not name.startswith("_")])


class FormServiceComposed:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def load_form(self, form_id: str) -> str:
        return self._http.get(f"/forms/{form_id}")


composed = FormServiceComposed(HttpClient())
print(composed.load_form("f1"))
print([name for name in dir(composed) if not name.startswith("_")])
```

```text
GET /forms/f1
DELETE /forms
['delete', 'get', 'load_form']
GET /forms/f1
['load_form']
```

`FormService` не є HTTP-клієнтом, але тепер має `delete` для будь-якого шляху, і прибрати його вже не можна, не зламавши когось. Версія з композицією показує назовні рівно один метод, а `HttpClient` у тестах замінюється фейком через параметр.

Робоче правило: глибина ієрархії 1–2 рівні. Базовий клас і реалізації, щонайбільше один проміжний рівень. Глибше кожна зміна в середині ламає все нижче, а щоб зрозуміти, звідки береться метод, треба читати MRO. "Зручні методи, яким потрібен `self`" це mixin, "зручні методи без `self`" це функції модуля, повторне використання коду зі станом це композиція. Детально про композицію і про те, які GoF-патерни в Python перестають бути ієрархіями, у m4-l08.

## Для капстоуну

У m2-l07 рендерери FormBuilder не мали спільного предка, бо спільного коду в них не було, лише форма виклику `render(element, theme) -> str`. Тепер спільний код з'являється: реєстрація за іменем формату, `render_form` для списку елементів, вимірювання часу. Це критерій з того самого уроку, тому з'являється базовий клас. Protocol `Renderer` нікуди не дівається: він лишається типом параметрів і словників у коді, що рендерери використовує, а `BaseRenderer` це зручна база для власних реалізацій, які протоколу відповідають структурно.

```python live
import time
from collections.abc import Iterable
from dataclasses import dataclass
from html import escape
from typing import ClassVar, Literal, Protocol


@dataclass(frozen=True)
class Theme:
    name: str
    accent: str


@dataclass(frozen=True)
class Element:
    kind: Literal["input", "text", "button"]
    id: str
    label: str


class Renderer(Protocol):
    def render(self, element: Element, theme: Theme) -> str: ...


class BaseRenderer:
    registry: ClassVar[dict[str, type["BaseRenderer"]]] = {}

    def __init_subclass__(cls, /, fmt: str | None = None, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        if fmt is None:
            return
        if fmt in BaseRenderer.registry:
            taken = BaseRenderer.registry[fmt].__name__
            raise ValueError(f"format {fmt!r} already registered by {taken}")
        BaseRenderer.registry[fmt] = cls

    @classmethod
    def create(cls, fmt: str) -> "BaseRenderer":
        try:
            return BaseRenderer.registry[fmt]()
        except KeyError:
            known = ", ".join(sorted(BaseRenderer.registry))
            raise ValueError(f"unknown format {fmt!r}, known: {known}") from None

    def render(self, element: Element, theme: Theme) -> str:
        raise NotImplementedError(f"{type(self).__name__}.render")

    def render_form(self, elements: Iterable[Element], theme: Theme) -> str:
        return "\n".join(self.render(el, theme) for el in elements)


class HtmlRenderer(BaseRenderer, fmt="html"):
    def render(self, element: Element, theme: Theme) -> str:
        label = escape(element.label)
        match element.kind:
            case "input":
                return f'<label for="{element.id}">{label}</label><input id="{element.id}">'
            case "button":
                return f'<button style="background: {theme.accent}">{label}</button>'
            case "text":
                return f"<p>{label}</p>"


class TextRenderer(BaseRenderer, fmt="text"):
    def render(self, element: Element, theme: Theme) -> str:
        return f"{element.kind}:{element.id} {element.label!r} [{theme.name}]"


class TimingMixin(BaseRenderer):
    last_render_ms: float = 0.0

    def now(self) -> float:
        return time.perf_counter()

    def render(self, element: Element, theme: Theme) -> str:
        start = self.now()
        try:
            return super().render(element, theme)
        finally:
            self.last_render_ms = (self.now() - start) * 1000


class TimedHtmlRenderer(TimingMixin, HtmlRenderer, fmt="html+timing"):
    pass


class SteppedClockHtml(TimedHtmlRenderer):
    def __init__(self, step_ms: float) -> None:
        super().__init__()
        self._t = 0.0
        self._step = step_ms / 1000

    def now(self) -> float:
        self._t += self._step
        return self._t


form = [
    Element("input", "email", "Email"),
    Element("text", "note", "Terms & conditions"),
    Element("button", "submit", "Send"),
]
light = Theme("light", "#0066cc")

print({fmt: cls.__name__ for fmt, cls in BaseRenderer.registry.items()})
print([c.__name__ for c in TimedHtmlRenderer.__mro__])

print(BaseRenderer.create("text").render_form(form, light))

timed = SteppedClockHtml(step_ms=2.5)
print(timed.render(form[1], light))
print(f"{timed.last_render_ms:.1f} ms")

renderers: dict[str, Renderer] = {fmt: BaseRenderer.create(fmt) for fmt in ("html", "text")}
print(sorted(renderers))
```

```text
{'html': 'HtmlRenderer', 'text': 'TextRenderer', 'html+timing': 'TimedHtmlRenderer'}
['TimedHtmlRenderer', 'TimingMixin', 'HtmlRenderer', 'BaseRenderer', 'object']
input:email 'Email' [light]
text:note 'Terms & conditions' [light]
button:submit 'Send' [light]
<p>Terms &amp; conditions</p>
2.5 ms
['html', 'text']
```

```text
$ mypy --strict renderers.py
Success: no issues found in 1 source file
```

Порядок `TimingMixin, HtmlRenderer` дає MRO, у якому `super().render` з mixin веде в `HtmlRenderer.render`, а `try/finally` записує час навіть тоді, коли рендер упав. `TimingMixin` не реєструється, бо не передає `fmt`, а `SteppedClockHtml` теж ні: це тестовий клас, який підміняє годинник перевизначенням `now()`, і тому вивід детермінований.

> **Під капотом.** `TimingMixin` наслідує `BaseRenderer`, а не стоїть сам по собі, як `ReprMixin`. Причина в mypy: для класу без батьків `super().render` викликає метод, якого в `object` немає, і статично це помилка, хоча в рантаймі MRO комбінованого класу все розставить правильно. Mixin, що обгортає метод бази, наслідує цю базу; MRO від цього не змінюється, бо `BaseRenderer` однаково стоїть після `HtmlRenderer`.

```python
import time


class TimingMixin:
    last_render_ms: float = 0.0

    def render(self, element: object, theme: object) -> str:
        start = time.perf_counter()
        try:
            return super().render(element, theme)
        finally:
            self.last_render_ms = (time.perf_counter() - start) * 1000
```

```text
$ mypy --strict mixin_untyped.py
mixin_untyped.py:10: error: Returning Any from function declared to return "str"  [no-any-return]
mixin_untyped.py:10: error: "render" undefined in superclass  [misc]
Found 2 errors in 1 file (checked 1 source file)
```

> **Для капстоуну.** Реєстр заповнюється при імпорті модулів: `HtmlRenderer` потрапляє в `BaseRenderer.registry` після імпорту `formbuilder.renderers.html`, `TextRenderer` після `formbuilder.renderers.text`. Пакет `renderers/` з m3-l01 свідомо не імпортує формати наперед, тож реєстр класів наповнюється тоді ж, коли `get_renderer` вперше просить формат. У m4-l05 `render` стане `@abstractmethod`, і `BaseRenderer(ABC)` отримає template method `render_tree`; у m4-l08 ця ієрархія перебудовується в композицію і буде видно, що з неї лишиться.

<!-- task: t6 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Вважати, що `super().__init__()` обов'язково перший рядок, або що до нього немає `self`.** У Python `self` уже створений, а виклик можна ставити будь-де. Важливо лише, що батьківський `__init__` перезапише все, що він ставить, якщо викликати його після своїх присвоєнь.

   ```python
   def __init__(self, id: str, options: list[str]) -> None:
       self.options = [o.strip() for o in options]  # можна до super()
       super().__init__(id)
   ```

2. **Забути `super().__init__()` взагалі.** TypeScript не скомпілює такий конструктор, Python і mypy мовчать, а `AttributeError` вилазить при першому читанні батьківського атрибута. Правильно: у кожному перевизначеному `__init__` виклик `super().__init__(...)`, якщо немає свідомої причини його пропустити.

   ```python
   class CheckboxField(Field):
       def __init__(self, id: str, checked: bool = False) -> None:
           super().__init__(id)
           self.checked = checked
   ```

3. **`super()` як "батько" і виклик батька на ім'я.** `Base.__init__(self, ...)` у множинному наслідуванні вирізає частину MRO, бо наступний клас не обов'язково батько. Правильно: завжди `super()`, keyword-only аргументи й `**kwargs` у ланцюжку.

   ```python
   def __init__(self, *, label: str, **kwargs) -> None:
       super().__init__(**kwargs)  # а не Field.__init__(self, **kwargs)
       self.label = label
   ```

4. **Mixins через `Object.assign` або справа від бази.** Копіювання методів у клас (`for name, fn in vars(Mixin).items(): setattr(...)`) ламає `super()` і MRO. Mixin справа від бази не перекриває її методів. Правильно: mixin як клас у списку батьків, ліворуч.

   ```python
   class Input(ReprMixin, JsonMixin, Element):
       ...
   ```

5. **Змінюваний атрибут класу як "статичне поле за замовчуванням".** `classes = []` у базовому класі спільний для всіх підкласів і їхніх екземплярів. Правильно: незмінне значення (кортеж, `frozenset`) або новий об'єкт у підкласі через присвоєння.

   ```python
   class Element:
       css_classes: tuple[str, ...] = ()

   class Button(Element):
       css_classes = (*Element.css_classes, "btn")
   ```

6. **`class X(dict)` для перехоплення записів.** `update`, конструктор і `setdefault` обходять перевизначений `__setitem__`. Правильно: `collections.UserDict` або композиція.

   ```python
   from collections import UserDict

   class Answers(UserDict):
       def __setitem__(self, key: str, value: object) -> None:
           super().__setitem__(key.strip().lower(), value)
   ```

7. **`instanceof`-інтуїція "той самий клас за іменем".** Модуль, запущений як скрипт і імпортований з іншого файлу, дає два різні класи, і `isinstance` повертає `False`. Правильно: класи в модулях, точка входу окремо, запуск через `python -m`.

   ```bash
   python -m formbuilder.cli    # а не python src/formbuilder/domain.py
   ```

8. **Очікувати, що множинного наслідування немає, і будувати глибокі ланцюжки.** `TimedPrettyHtmlRenderer extends PrettyHtmlRenderer extends HtmlRenderer extends BaseRenderer` замість пласкої комбінації. Правильно: база плюс реалізації, поведінку додавати mixins у списку батьків, решту композицією.

   ```python
   class TimedHtmlRenderer(TimingMixin, HtmlRenderer, fmt="html+timing"):
       pass
   ```

## Підсумок

- `class B(A)` це `extends`; кожен клас зрештою наслідує `object`; `isinstance`/`issubclass` перевіряють ідентичність класу, а не ім'я.
- `self` існує до `__init__`, тож `super().__init__()` можна викликати де завгодно, і ніхто не змусить його викликати.
- `super()` без аргументів працює через осередок `__class__`, який компілятор створює для методів у тілі класу.
- `super()` означає "наступний після поточного класу в MRO `type(self)`", а не "батько".
- MRO будує C3: клас перед батьками, батьки в порядку оголошення, MRO кожного батька збережено; суперечність дає `TypeError` при оголошенні класу.
- Кооперативний `__init__`: keyword-only аргументи, `**kwargs` далі по ланцюжку, `object.__init__` ловить зайві аргументи.
- Mixin це клас без стану й `__init__`, ліворуч від бази; mixin, що обгортає метод бази через `super()`, для mypy наслідує цю базу.
- Атрибути класу шукаються по MRO; базовий код читає їх через `self`; змінюваний атрибут класу спільний для всієї ієрархії.
- `__init_subclass__` викликається на базі для кожного нового підкласу, приймає keyword-аргументи з рядка `class` і є місцем для реєстру.
- `NotImplementedError` у базовому методі падає лише при виклику; `@abstractmethod` (m4-l05) перевіряє при створенні екземпляра.
- `dict`/`list` не викликають ваших перевизначень зі своїх методів; `UserDict` або композиція. Глибина ієрархії 1–2.

## Що далі

Наступний урок m4-l05 про ABC проти Protocol: `NotImplementedError` з цього уроку там замінюється на `@abstractmethod`, `BaseRenderer` стає `BaseRenderer(ABC)` з template method, а MRO і mixins знадобляться, щоб зрозуміти, як `collections.abc` дарує `get`, `items` і `__contains__` за кілька реалізованих методів. Правило "коли не наслідувати" розгортається в m4-l08, а декоратор-реєстратор як альтернатива `__init_subclass__` у m5-l04.
