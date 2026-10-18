---
id: m2-l07
module: m2-data-typing
title: "Protocol: структурна типізація, duck typing офіційно"
summary: "Учень описує інтерфейси через typing.Protocol замість базових класів, читає помилки mypy про невідповідність протоколу, знає, що саме перевіряє isinstance з @runtime_checkable, і анотує параметри найширшим протоколом на кшталт Iterable[str]."
duration_min: 75
prerequisites: [m2-l06]
---

## Duck typing: форма замість родоводу

Python ніколи не питає об'єкт "якого ти класу", перш ніж викликати метод. Він просто шукає атрибут з потрібним ім'ям і викликає його; якщо атрибута немає, падає в момент виклику. Це називається duck typing (офіційний термін із глосарію Python): якщо щось ходить як качка і крякає як качка, з ним працюють як з качкою. Функція нижче не знає жодного класу рендерера, вона знає лише, що в кожного елемента має бути `render`.

```ts
class HtmlRenderer { render(text: string) { return `<p>${text}</p>`; } }
class MarkdownRenderer { render(text: string) { return `**${text}**`; } }
class Logger { log(text: string) { console.log(text); } }

function renderAll(renderers: { render(text: string): string }[], text: string) {
  return renderers.map((r) => r.render(text));
}
renderAll([new HtmlRenderer(), new MarkdownRenderer()], "Hi");
renderAll([new Logger()], "Hi"); // tsc: Property 'render' is missing in type 'Logger'
```

```python live
class HtmlRenderer:
    def render(self, text):
        return f"<p>{text}</p>"


class MarkdownRenderer:
    def render(self, text):
        return f"**{text}**"


class Logger:
    def log(self, text):
        print(text)


def render_all(renderers, text):
    return [r.render(text) for r in renderers]


print(render_all([HtmlRenderer(), MarkdownRenderer()], "Hi"))
print(render_all([Logger()], "Hi"))
```

```text
['<p>Hi</p>', '**Hi**']
AttributeError: 'Logger' object has no attribute 'render'
```

Ідея та сама, що в TS: сумісність визначає набір методів, а не `extends` чи `implements`. Розходиться момент, коли ви дізнаєтесь про помилку. `tsc` відмовляє ще до запуску; Python без анотацій виконує код, доки не дійде до `r.render` на `Logger`, і кидає `AttributeError`, точно як plain JS кидає `r.render is not a function`. Тобто duck typing у Python це структурна типізація TS без статичної половини. `typing.Protocol` повертає цю половину, і про нього решта уроку.

Duck typing це не стиль, який дозволено в користувацькому коді, а фундамент самої мови. `len(x)` викликає `x.__len__()`, `for` просить `__iter__`, `x[k]` це `__getitem__`, `in` це `__contains__`, `if x:` питає `__bool__`, `with` викликає `__enter__` і `__exit__`. Методи з подвійними підкресленнями офіційно називаються special methods; "dunder" (від double underscore) це жаргон спільноти, який ви почуєте на співбесіді частіше за офіційну назву. Набір таких методів, за яким працює певний синтаксис, документація неформально називає протоколом: iterator protocol, context manager protocol. Клас нижче не наслідує нічого і реалізує лише два методи, а з ним працюють `len`, `bool`, `for`, `in` і `reversed`.

```python live
class Options:
    def __init__(self, *values: str) -> None:
        self.values = list(values)

    def __len__(self) -> int:
        return len(self.values)

    def __getitem__(self, index: int) -> str:
        return self.values[index]


opts = Options("red", "green")
print(len(opts))
print(bool(opts), bool(Options()))
for v in opts:
    print(v)
print("green" in opts, "blue" in opts)
print(list(reversed(opts)))
```

```text
2
True False
red
green
True False
['green', 'red']
```

Половина цього працює через запасні шляхи. Без `__bool__` truthiness береться з `__len__`; без `__iter__` цикл викликає `__getitem__` з індексами 0, 1, 2, доки не отримає `IndexError`; без `__contains__` оператор `in` перебирає елементи циклом. Повний перелік special methods і їхні запасні шляхи в m4-l02, протокол `with` у m4-l07; тут важливо лише, що синтаксис мови спирається на форму об'єкта, а не на його клас.

> **Під капотом.** Синтаксис шукає special method на типі, а не на екземплярі: `len(b)` робить `type(b).__len__(b)`. Тому атрибут `__len__`, доданий конкретному об'єкту, викликається напряму, але `len()` його не бачить. Звичайний доступ через крапку, як `b.render` чи `b.__len__()`, бачить і атрибути екземпляра, тому для звичайних методів такого обмеження немає.

```python live
class Box:
    pass


b = Box()
b.__len__ = lambda: 5
print(b.__len__())
print(len(b))
```

```text
5
TypeError: object of type 'Box' has no len()
```

## `typing.Protocol`: TS interface для mypy

`Protocol` це клас, що наслідує `typing.Protocol` і містить лише сигнатури методів з тілом `...`. Будь-який клас, у якого є методи з такими самими сигнатурами, автоматично відповідає протоколу: без наслідування, без реєстрації, без `implements`. PEP 544, який це ввів, називає механізм structural subtyping, або static duck typing; обидва терміни офіційні. Протилежність, де сумісність дає лише явне наслідування, там же названа nominal subtyping.

```ts
interface Renderer {
  render(text: string): string;
}

class HtmlRenderer {
  render(text: string): string { return `<p>${text}</p>`; }
}

const r: Renderer = new HtmlRenderer(); // ok: implements не потрібен
```

```python
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class HtmlRenderer:
    def render(self, text: str) -> str:
        return f"<p>{text}</p>"


class Logger:
    def log(self, text: str) -> None:
        print(text)


def render_all(renderers: list[Renderer], text: str) -> list[str]:
    return [r.render(text) for r in renderers]


print(render_all([HtmlRenderer()], "Hi"))
print(render_all([Logger()], "Hi"))
```

```text
$ mypy --strict protocol_basic.py
protocol_basic.py:23: error: List item 0 has incompatible type "Logger"; expected "Renderer"  [list-item]
Found 1 error in 1 file (checked 1 source file)
```

```text
$ python protocol_basic.py
['<p>Hi</p>']
AttributeError: 'Logger' object has no attribute 'render'
```

На рівні mypy це TS interface один в один: `HtmlRenderer` підходить, бо має `render(str) -> str`, `Logger` ні, і помилка вказує на місце використання. Розходження в тому, що лишається після перевірки. `tsc` не дасть зібрати бандл з помилкою, а Python запускає файл попри будь-які помилки mypy (анотації рантайм ігнорує, m2-l06), тому другий `print` усе одно доходить до `AttributeError`. Статична перевірка тут окремий крок у CI чи редакторі; як її налаштувати, у m2-l08.

У рантаймі Protocol лишається звичайним класом з особливим метакласом. Він пам'ятає імена своїх членів у `__protocol_attrs__` (з'явилось у 3.12), а створити його екземпляр не можна: протокол це опис форми, а не реалізація.

```python
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...


print(Renderer.__mro__)
print(Renderer.__protocol_attrs__)
Renderer()
```

```text
(<class '__main__.Renderer'>, <class 'typing.Protocol'>, <class 'typing.Generic'>, <class 'object'>)
{'render'}
TypeError: Protocols cannot be instantiated
```

> **JS-аналог.** Ключового слова `interface` у Python немає, і `Protocol` його не додає: це звичайний `class` з базою `Protocol`. Там, де в TS ви б писали `type Renderer = { render(...): string }` чи `interface`, у Python пишуть Protocol. А `implements` не потрібен узагалі: ні як обов'язок, ні як "щоб клас став того типу".

<!-- task: t1 -->

## Як mypy звіряє клас з протоколом

mypy порівнює кожен член протоколу з однойменним членом класу. Метод відповідає, якщо його можна викликати скрізь, де викликали б метод протоколу, і результат можна використати скрізь, де використали б результат протоколу. Звідси два найчастіші промахи: зайвий обов'язковий параметр (виклик за протоколом його не передасть) і інший тип результату. Повідомлення одне й те саме, `incompatible type`, а примітка `Following member(s) ... have conflicts` показує обидві сигнатури поруч.

```python
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class ThemedRenderer:
    def render(self, text: str, theme: str) -> str:
        return f'<p class="{theme}">{text}</p>'


class BytesRenderer:
    def render(self, text: str) -> bytes:
        return text.encode()


def show(r: Renderer) -> None:
    print(r.render("hi"))


show(ThemedRenderer())
show(BytesRenderer())
```

```text
$ mypy --strict conformance.py
conformance.py:22: error: Argument 1 to "show" has incompatible type "ThemedRenderer"; expected "Renderer"  [arg-type]
conformance.py:22: note: Following member(s) of "ThemedRenderer" have conflicts:
conformance.py:22: note:     Expected:
conformance.py:22: note:         def render(self, text: str) -> str
conformance.py:22: note:     Got:
conformance.py:22: note:         def render(self, text: str, theme: str) -> str
conformance.py:23: error: Argument 1 to "show" has incompatible type "BytesRenderer"; expected "Renderer"  [arg-type]
conformance.py:23: note: Following member(s) of "BytesRenderer" have conflicts:
conformance.py:23: note:     Expected:
conformance.py:23: note:         def render(self, text: str) -> str
conformance.py:23: note:     Got:
conformance.py:23: note:         def render(self, text: str) -> bytes
Found 2 errors in 1 file (checked 1 source file)
```

Правило "можна викликати скрізь, де викликали б протокол" має офіційну назву variance. Тип результату коваріантний (covariance): реалізація може повертати вужчий тип, ніж обіцяє протокол. Типи параметрів контраваріантні (contravariance): реалізація може приймати ширший тип, але не вужчий. Це той самий `strictFunctionTypes` з TS, лише для методів mypy застосовує його завжди, тоді як TS для методів (на відміну від властивостей-функцій) лишає біваріантність.

```python
from typing import Protocol


class Element:
    label: str = "x"


class InputElement(Element):
    pass


class InputHandler(Protocol):
    def handle(self, el: InputElement) -> Element: ...


class AnyHandler(Protocol):
    def handle(self, el: Element) -> Element: ...


class Wide:
    def handle(self, el: Element) -> InputElement:
        return InputElement()


class Narrow:
    def handle(self, el: InputElement) -> Element:
        return el


class Vague:
    def handle(self, el: InputElement) -> object:
        return el


h1: InputHandler = Wide()
h2: AnyHandler = Narrow()
h3: InputHandler = Vague()
```

```text
$ mypy --strict variance.py
variance.py:36: error: Incompatible types in assignment (expression has type "Narrow", variable has type "AnyHandler")  [assignment]
variance.py:36: note: Following member(s) of "Narrow" have conflicts:
variance.py:36: note:     Expected:
variance.py:36: note:         def handle(self, el: Element) -> Element
variance.py:36: note:     Got:
variance.py:36: note:         def handle(self, el: InputElement) -> Element
variance.py:37: error: Incompatible types in assignment (expression has type "Vague", variable has type "InputHandler")  [assignment]
variance.py:37: note: Following member(s) of "Vague" have conflicts:
variance.py:37: note:     Expected:
variance.py:37: note:         def handle(self, el: InputElement) -> Element
variance.py:37: note:     Got:
variance.py:37: note:         def handle(self, el: InputElement) -> object
Found 2 errors in 1 file (checked 1 source file)
```

`Wide` пройшов з обох боків: приймає будь-який `Element` і повертає вужчий `InputElement`. `Narrow` не підходить до `AnyHandler`, бо той, хто тримає `AnyHandler`, має право передати будь-який `Element`, а `Narrow` готовий лише до `InputElement`. `Vague` не підходить, бо обіцяє лише `object`, а протокол обіцяв `Element`.

> **Пастка.** Імена параметрів mypy при звірянні з протоколом не порівнює, а Python при виклику з keyword-аргументом порівнює. Якщо протокол каже `accept(self, el)`, а реалізація `accept(self, element)`, mypy мовчить, і виклик `s.accept(el=...)` падає в рантаймі. Якщо ім'я параметра не має значення, зробіть його positional-only у протоколі через `/`, і тоді виклик за іменем mypy відхилить ще в споживачі.

```python
from typing import Protocol


class Element:
    pass


class Sink(Protocol):
    def accept(self, el: Element) -> None: ...


class Printer:
    def accept(self, element: Element) -> None:
        print("accepted")


def use(s: Sink) -> None:
    s.accept(el=Element())


use(Printer())
```

```text
$ mypy --strict param_names.py
Success: no issues found in 1 source file
```

```text
$ python param_names.py
TypeError: Printer.accept() got an unexpected keyword argument 'el'
```

```python
from typing import Protocol


class Element:
    pass


class Sink(Protocol):
    def accept(self, el: Element, /) -> None: ...


class Printer:
    def accept(self, element: Element) -> None:
        print("accepted")


def use(s: Sink) -> None:
    s.accept(Element())
    s.accept(el=Element())


use(Printer())
```

```text
$ mypy --strict posonly.py
posonly.py:19: error: Unexpected keyword argument "el" for "accept" of "Sink"  [call-arg]
Found 1 error in 1 file (checked 1 source file)
```

`Printer` з іншим ім'ям параметра лишився сумісним, а некоректний виклик тепер ловиться там, де його написали.

Клас може і явно наслідувати Protocol, як `class HtmlRenderer(Renderer)`. Це не потрібно для сумісності, але дає дві речі. Перша: документацію, видиму без IDE. Друга: mypy перевіряє реалізацію на місці оголошення класу, а не там, де екземпляр уперше передали у функцію; без явного наслідування клас з помилкою в сигнатурі спокійно живе, доки його ніхто не використав як `Renderer`. Методи протоколу з тілом `...` при явному наслідуванні mypy вважає абстрактними, а методи з реальним тілом успадковуються як звичайні, тож протокол може дати реалізацію за замовчуванням.

```python
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...

    def render_many(self, texts: list[str]) -> str:
        return "\n".join(self.render(t) for t in texts)


class HtmlRenderer(Renderer):
    def render(self, text: str, theme: str) -> str:
        return f"<p>{text}</p>"


class DraftRenderer(Renderer):
    def draw(self, text: str) -> str:
        return text


class UpperRenderer(Renderer):
    def render(self, text: str) -> str:
        return text.upper()


draft = DraftRenderer()
print(UpperRenderer().render_many(["a", "b"]))
```

```text
$ mypy --strict explicit.py
explicit.py:12: error: Signature of "render" incompatible with supertype "Renderer"  [override]
explicit.py:12: note:      Superclass:
explicit.py:12: note:          def render(self, text: str) -> str
explicit.py:12: note:      Subclass:
explicit.py:12: note:          def render(self, text: str, theme: str) -> str
explicit.py:26: error: Cannot instantiate abstract class "DraftRenderer" with abstract attribute "render"  [abstract]
Found 2 errors in 1 file (checked 1 source file)
```

```text
$ python explicit.py
A
B
```

Помилка `HtmlRenderer` тепер на рядку 12, де клас оголошено, з кодом `[override]` замість `[arg-type]` десь далеко. А `DraftRenderer()` mypy відхиляє, хоча Python створює його без заперечень: рантайм про абстрактність методів протоколу нічого не знає.

> **Пастка.** Підклас протоколу сам протоколом не стає. `class ThemedRenderer(Renderer)` це звичайний клас, що реалізує `Renderer`, і чужі класи йому вже не відповідають структурно. Щоб розширити протокол, `Protocol` треба знову вказати в базах: `class ThemedRenderer(Renderer, Protocol)`. Те саме з комбінацією: `class SizedRenderer(Renderer, Sized, Protocol)`.

```python
from typing import Protocol


class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class ThemedRenderer(Renderer):
    def theme(self) -> str: ...


class ThemedRendererProto(Renderer, Protocol):
    def theme(self) -> str: ...


class Stranger:
    def render(self, text: str) -> str:
        return text

    def theme(self) -> str:
        return "dark"


a: ThemedRenderer = Stranger()
b: ThemedRendererProto = Stranger()
```

```text
$ mypy --strict extend.py
extend.py:9: error: Missing return statement  [empty-body]
extend.py:9: note: If the method is meant to be abstract, use @abc.abstractmethod
extend.py:24: error: Incompatible types in assignment (expression has type "Stranger", variable has type "ThemedRenderer")  [assignment]
Found 2 errors in 1 file (checked 1 source file)
```

Перша помилка теж підказка: у звичайному класі `...` замість тіла mypy читає як забутий `return`, а в протоколі як "тут лише сигнатура".

## Protocol проти ABC

ABC (abstract base class, офіційна назва з модуля `abc`) це номінальний інтерфейс. Клас відповідає йому лише тоді, коли явно наслідує, методи з `@abstractmethod` обов'язково перевизначаються, а екземпляр класу, де хоч один такий метод не реалізовано, Python відмовляється створити вже в рантаймі. Класу з тією самою формою, але без наслідування, ні mypy, ні `isinstance` не визнають.

```python
from abc import ABC, abstractmethod


class BaseRenderer(ABC):
    @abstractmethod
    def render(self, text: str) -> str: ...


class HtmlRenderer(BaseRenderer):
    def render(self, text: str) -> str:
        return f"<p>{text}</p>"


class Draft(BaseRenderer):
    pass


class Stranger:
    def render(self, text: str) -> str:
        return text


def show(r: BaseRenderer) -> None:
    print(r.render("hi"))


show(HtmlRenderer())
print(isinstance(Stranger(), BaseRenderer))
show(Stranger())
Draft()
```

```text
$ mypy --strict abc_nominal.py
abc_nominal.py:29: error: Argument 1 to "show" has incompatible type "Stranger"; expected "BaseRenderer"  [arg-type]
abc_nominal.py:30: error: Cannot instantiate abstract class "Draft" with abstract attribute "render"  [abstract]
Found 2 errors in 1 file (checked 1 source file)
```

```text
$ python abc_nominal.py
<p>hi</p>
False
hi
TypeError: Can't instantiate abstract class Draft without an implementation for abstract method 'render'
```

Порівняйте з попереднім розділом: для Protocol `DraftRenderer()` створився в рантаймі, для ABC `Draft()` дає `TypeError`. Це головна практична різниця, крім самої номінальності: ABC працює й без чекера. У TS такої пари немає взагалі, бо навіть `abstract class` у TS сумісний структурно: об'єкт з тією самою формою можна присвоїти змінній типу абстрактного класу, якщо в класі немає `private` полів. Python розводить два підходи по різних інструментах.

Вибір між ними простий. Protocol, коли описуєте, що потрібно споживачу: параметр функції, елемент реєстру, callback, особливо якщо реалізації чужі (стандартна бібліотека, сторонній пакет, тестовий дублер), і ви не можете чи не хочете змушувати їх наслідувати ваш клас. ABC, коли будуєте власну ієрархію, де базовий клас дає спільну реалізацію, а помилка "забув реалізувати метод" має ловитись у рантаймі, навіть без mypy. Детально ABC, `register` і `__subclasshook__` у m4-l05; тут ABC лише для контрасту.

<!-- task: q4 -->

## `@runtime_checkable`: isinstance, який дивиться лише на імена

Звичайний Protocol існує лише для чекера, і `isinstance(obj, Renderer)` з ним кидає `TypeError`. Декоратор `@runtime_checkable` дозволяє таку перевірку, але перевіряє вона значно менше, ніж обіцяє назва: лише те, що в об'єкта є атрибути з іменами членів протоколу, і що метод не дорівнює `None`. Сигнатури, типи параметрів і результату, навіть те, чи атрибут узагалі можна викликати, рантайм не звіряє, бо анотацій він не читає.

```python live
from typing import Protocol, runtime_checkable


class Plain(Protocol):
    def render(self, text: str) -> str: ...


@runtime_checkable
class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class HtmlRenderer:
    def render(self, text: str) -> str:
        return f"<p>{text}</p>"


class WrongSignature:
    def render(self) -> int:
        return 42


class NotCallable:
    render = "yes"


class Disabled:
    render = None


print(isinstance(HtmlRenderer(), Renderer))
print(isinstance(WrongSignature(), Renderer))
print(isinstance(NotCallable(), Renderer))
print(isinstance(Disabled(), Renderer))
print(isinstance("text", Renderer))
print(isinstance(HtmlRenderer, Renderer))
print(isinstance(HtmlRenderer(), Plain))
```

```text
$ python runtime_check.py
True
True
True
False
False
True
TypeError: Instance and class checks can only be used with @runtime_checkable protocols
```

```text
$ mypy --strict runtime_check.py
runtime_check.py:37: error: Only @runtime_checkable protocols can be used with instance and class checks  [misc]
Found 1 error in 1 file (checked 1 source file)
```

Три обмани з шести видно одразу: `WrongSignature` з іншою сигнатурою, `NotCallable` з рядком замість методу і сам клас `HtmlRenderer` (не екземпляр, але атрибут `render` у класу є) проходять перевірку. `render = None` це задокументований спосіб явно сказати "цього методу немає", тому `Disabled` не проходить.

Обман буває й у зворотний бік. З 3.12 перевірка шукає атрибути через `inspect.getattr_static`, тобто без виклику `__getattr__`, тож метод, який об'єкт віддає динамічно, не рахується, хоча виклик працює.

```python live
from typing import Protocol, runtime_checkable


@runtime_checkable
class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class Dynamic:
    def __getattr__(self, name: str) -> object:
        return lambda *args: f"dynamic {name}"


dyn = Dynamic()
print(dyn.render("x"))
print(isinstance(dyn, Renderer))
```

```text
dynamic render
False
```

Гірше, що mypy після `isinstance` звужує тип до протоколу і повністю довіряє результату. Код нижче проходить `--strict` без жодного зауваження, а в рантаймі падає на виклику, бо `isinstance` пропустив об'єкт з невідповідною сигнатурою.

```python
from typing import Protocol, runtime_checkable


@runtime_checkable
class Renderer(Protocol):
    def render(self, text: str) -> str: ...


class WrongSignature:
    def render(self) -> int:
        return 42


def load_plugin(obj: object) -> str:
    if isinstance(obj, Renderer):
        return obj.render("hi")
    return "skip"


print(load_plugin(WrongSignature()))
```

```text
$ mypy --strict plugin.py
Success: no issues found in 1 source file
```

```text
$ python plugin.py
TypeError: WrongSignature.render() takes 1 positional argument but 2 were given
```

Коли це все ж корисно: на межі, де статичного типу немає. Плагін, завантажений за іменем з конфігу, об'єкт із чужої бібліотеки, значення типу `object` з десеріалізації. Там `isinstance` з runtime-протоколом відсіює явне сміття і дає mypy звуження для подальшого коду, а сигнатури лишаються на совісті автора плагіна або на тестах. Усередині власного коду, де типи відомі, `isinstance` з протоколом не потрібен: це перевірка, яку mypy вже зробив статично.

> **Пастка.** Для протоколів з атрибутами-даними (`name: str`) `isinstance` працює, а `issubclass` кидає `TypeError: Protocols with non-method members don't support issubclass()`: атрибут екземпляра може з'явитись лише в `__init__`, і по класу цього не видно.

```python
from typing import Protocol, runtime_checkable


@runtime_checkable
class Named(Protocol):
    name: str


class Field:
    def __init__(self, name: str) -> None:
        self.name = name


print(isinstance(Field("email"), Named))
print(issubclass(Field, Named))
```

```text
True
TypeError: Protocols with non-method members don't support issubclass()
```

> **JS-аналог.** `instanceof` у JS перевіряє ланцюжок прототипів, тобто номінальний зв'язок, і TS-інтерфейс через нього не перевірити зовсім, бо в рантаймі інтерфейсу немає. Ви писали для цього type guard `function isRenderer(x): x is Renderer { return typeof x?.render === "function" }`. `@runtime_checkable` і є такий type guard, згенерований автоматично, і навіть трохи слабший: `typeof === "function"` він не робить.

<!-- task: q1 -->

<!-- task: t2 -->

## Атрибути, property, `__call__` і generic Protocol

Протокол описує не лише методи. Анотація `name: str` у тілі протоколу означає атрибут, який можна читати й записувати. Якщо споживачу потрібне лише читання, член оголошують через `@property`, і тоді підходить і звичайний атрибут, і property, і поле frozen dataclass. Різниця принципова: протокол з `name: str` обіцяє споживачу право на `x.name = ...`, і реалізація без сетера цю обіцянку порушує.

```python
from dataclasses import dataclass
from typing import Protocol


class Named(Protocol):
    name: str


class ReadOnlyNamed(Protocol):
    @property
    def name(self) -> str: ...


@dataclass
class Field:
    name: str


@dataclass(frozen=True)
class FrozenField:
    name: str


class Computed:
    def __init__(self, first: str) -> None:
        self._first = first

    @property
    def name(self) -> str:
        return self._first.lower()


def label(x: ReadOnlyNamed) -> str:
    return x.name


a: Named = Field("email")
b: Named = Computed("Email")
c: Named = FrozenField("email")
d: ReadOnlyNamed = Field("email")
e: ReadOnlyNamed = Computed("Email")
f: ReadOnlyNamed = FrozenField("email")
print(label(Field("email")), label(Computed("Email")), label(FrozenField("phone")))
```

```text
$ mypy --strict members.py
members.py:38: error: Incompatible types in assignment (expression has type "Computed", variable has type "Named")  [assignment]
members.py:38: note: Protocol member Named.name expected settable variable, got read-only attribute
members.py:39: error: Incompatible types in assignment (expression has type "FrozenField", variable has type "Named")  [assignment]
members.py:39: note: Protocol member Named.name expected settable variable, got read-only attribute
Found 2 errors in 1 file (checked 1 source file)
```

```text
$ python members.py
email email phone
```

> **Пастка.** У TS `readonly`-поле реалізації присвоюється інтерфейсу з мутабельним полем без помилки, це відома дірка в системі типів. mypy тут суворіший. Звичка писати в протоколі `name: str` "бо так коротше" робить протокол несумісним з frozen dataclass і з property. За замовчуванням для даних у протоколі беріть `@property`, а `name: str` лише тоді, коли споживач справді записує.

Метод `__call__` у протоколі описує функцію за формою. Офіційно це callback protocol, і він потрібен там, де `Callable[[str], str | None]` (m2-l06) не вміщає сигнатуру: keyword-only параметри, значення за замовчуванням, `*args`, перевантаження, додаткові атрибути. TS-аналог це call signature в інтерфейсі, `interface Validator { (value: string, opts: { fieldId: string }): string | null }`. Протоколу відповідає і звичайна функція, і екземпляр класу з `__call__`.

```python
from collections.abc import Callable
from typing import Protocol


class Validator(Protocol):
    def __call__(self, value: str, *, field_id: str = "") -> str | None: ...


def not_empty(value: str, *, field_id: str = "") -> str | None:
    return f"{field_id}: required" if not value else None


class MaxLength:
    def __init__(self, limit: int) -> None:
        self.limit = limit

    def __call__(self, value: str, *, field_id: str = "") -> str | None:
        return f"{field_id}: max {self.limit}" if len(value) > self.limit else None


def lowercase_only(value: str) -> str | None:
    return None if value.islower() else "lowercase only"


def run(validators: list[Validator], value: str) -> list[str]:
    return [err for v in validators if (err := v(value, field_id="email")) is not None]


print(run([not_empty, MaxLength(3)], ""))
print(run([not_empty, MaxLength(3)], "abcdef"))
print(run([lowercase_only], "abc"))

SimpleValidator = Callable[[str], str | None]
simple: list[SimpleValidator] = [not_empty, MaxLength(3), lowercase_only]
```

```text
$ mypy --strict callback.py
callback.py:31: error: List item 0 has incompatible type "Callable[[str], str | None]"; expected "Validator"  [list-item]
callback.py:31: note: "Validator.__call__" has type "def __call__(self, value: str, *, field_id: str = ...) -> str | None"
Found 1 error in 1 file (checked 1 source file)
```

```text
$ python callback.py
['email: required']
['email: max 3']
TypeError: lowercase_only() got an unexpected keyword argument 'field_id'
```

mypy відхилив `lowercase_only` саме за відсутній `field_id`, і рантайм підтвердив, що виклик з ним упав би. Останній рядок показує зворотний бік: під простий `Callable[[str], str | None]` підходять усі три, бо кожен приймає один позиційний рядок. Callback protocol вибирають, коли форма виклику важлива; `Callable`, коли досить "функції від рядка".

<!-- task: q3 -->

<!-- task: t4 -->

Протокол може бути generic, як `interface Parser<T>` у TS. З 3.12 параметр типу пишеться в дужках після імені, `class Parser[T](Protocol)`, той самий синтаксис, що для generic-класів у m2-l06. mypy виводить `T` з реалізації: `IntParser` повертає `int`, тож `parse_all(IntParser(), ...)` має тип `list[int]`.

```python
from typing import Protocol, reveal_type


class Parser[T](Protocol):
    def parse(self, raw: str) -> T: ...


class IntParser:
    def parse(self, raw: str) -> int:
        return int(raw)


class BoolParser:
    def parse(self, raw: str) -> bool:
        return raw.lower() in {"1", "true", "yes"}


def parse_all[T](parser: Parser[T], raws: list[str]) -> list[T]:
    return [parser.parse(r) for r in raws]


ages = parse_all(IntParser(), ["30", "41"])
flags = parse_all(BoolParser(), ["yes", "no"])
reveal_type(ages)
reveal_type(flags)
names: list[str] = parse_all(IntParser(), ["1"])
```

```text
$ mypy --strict generic_proto.py
generic_proto.py:24: note: Revealed type is "list[int]"
generic_proto.py:25: note: Revealed type is "list[bool]"
generic_proto.py:26: error: Argument 1 to "parse_all" has incompatible type "IntParser"; expected "Parser[str]"  [arg-type]
generic_proto.py:26: note: Following member(s) of "IntParser" have conflicts:
generic_proto.py:26: note:     Expected:
generic_proto.py:26: note:         def parse(self, raw: str) -> str
generic_proto.py:26: note:     Got:
generic_proto.py:26: note:         def parse(self, raw: str) -> int
Found 1 error in 1 file (checked 1 source file)
```

В останньому рядку mypy вивів `T = str` з анотації змінної зліва й тоді звірив `IntParser` з `Parser[str]`. Варіантність параметра типу (`T`, який лише повертається, коваріантний) mypy з синтаксисом 3.12 виводить сам. У старому синтаксисі з `TypeVar`, який ви зустрінете в більшості чужого коду, її вказують руками, і mypy вимагає це для протоколів.

```python
from typing import Protocol, TypeVar

T = TypeVar("T")


class Parser(Protocol[T]):
    def parse(self, raw: str) -> T: ...
```

```text
$ mypy --strict typevar_proto.py
typevar_proto.py:6: error: Invariant type variable "T" used in protocol where covariant one is expected  [misc]
Found 1 error in 1 file (checked 1 source file)
```

Виправлення: `T_co = TypeVar("T_co", covariant=True)` і `class Parser(Protocol[T_co])`. Суфікс `_co` це конвенція з typeshed, а не синтаксис.

<!-- task: p1 -->

## Вбудовані протоколи: `Iterable`, `Sized`, `Hashable` і чому параметр не `list`

Більшість абстракцій з `collections.abc` для mypy є протоколами: `Iterable` (є `__iter__`), `Iterator` (`__iter__` і `__next__`), `Sized` (`__len__`), `Container` (`__contains__`), `Hashable` (`__hash__`). У `typing` до них додаються `SupportsInt`, `SupportsFloat`, `SupportsIndex`, `SupportsAbs` (є відповідно `__int__`, `__float__` і так далі). Власний клас відповідає їм без жодного наслідування, і `isinstance` теж працює, бо ці ABC мають `__subclasshook__`, що перевіряє наявність методу. Але не всі абстракції з `collections.abc` такі: `Sequence`, `Mapping`, `MutableSequence` номінальні, їм треба наслідувати або реєструватись.

```python live
from collections.abc import Container, Hashable, Iterable, Iterator, Sequence, Sized
from typing import SupportsInt


class FieldSet:
    def __init__(self, *ids: str) -> None:
        self._ids = list(ids)

    def __len__(self) -> int:
        return len(self._ids)

    def __iter__(self) -> Iterator[str]:
        return iter(self._ids)

    def __contains__(self, item: object) -> bool:
        return item in self._ids


fs = FieldSet("email", "phone")
print(isinstance(fs, Sized), isinstance(fs, Iterable), isinstance(fs, Container))
print(isinstance(fs, Sequence))
print(isinstance(fs, Hashable), isinstance([], Hashable), isinstance((1, 2), Hashable))
print(isinstance(3.7, SupportsInt), isinstance("3", SupportsInt))
```

```text
$ python abc_runtime.py
True True True
False
True False True
True False
```

`FieldSet` хешований, бо успадкував `__hash__` від `object`, а список ні: `list` явно ставить `__hash__ = None`, і `Hashable` бачить це так само, як `render = None` вище. Рядок `"3"` не `SupportsInt`, хоча `int("3")` працює: розбір рядка це окремий шлях усередині `int()`, а не метод `__int__`. Статично mypy поводиться так само: `Sized` та `Iterable[str]` приймають `FieldSet`, а `Sequence[str]` відхиляє навіть з доданим `__getitem__`.

```python
from collections.abc import Iterable, Iterator, Sequence, Sized
from typing import SupportsInt


class FieldSet:
    def __init__(self, *ids: str) -> None:
        self._ids = list(ids)

    def __len__(self) -> int:
        return len(self._ids)

    def __iter__(self) -> Iterator[str]:
        return iter(self._ids)

    def __getitem__(self, index: int) -> str:
        return self._ids[index]


def count(x: Sized) -> int:
    return len(x)


def first(x: Iterable[str]) -> str:
    return next(iter(x))


def at(x: Sequence[str], i: int) -> str:
    return x[i]


def to_int(x: SupportsInt) -> int:
    return int(x)


fs = FieldSet("email", "phone")
count(fs)
first(fs)
at(fs, 0)
to_int(3.7)
to_int("3")
```

```text
$ mypy --strict builtin_protocols.py
builtin_protocols.py:38: error: Argument 1 to "at" has incompatible type "FieldSet"; expected "Sequence[str]"  [arg-type]
builtin_protocols.py:40: error: Argument 1 to "to_int" has incompatible type "str"; expected "SupportsInt"  [arg-type]
Found 2 errors in 1 file (checked 1 source file)
```

Звідси правило анотації параметрів: просіть найменше, що функції справді потрібно. Якщо функція лише обходить елементи, параметр `Iterable[str]`, а не `list[str]`. `list[str]` вимагає саме список і відкидає кортеж, множину, генератор і ключі словника, хоча функція з ними працює однаково. Результат навпаки анотують точно (`list[str]`), щоб викликач міг користуватись усім, що вміє список. У TS це звичка писати `readonly string[]` чи `Iterable<string>` замість `string[]`, тільки в Python різниця помітніша, бо генератори тут на кожному кроці.

```python
from collections.abc import Iterable


def normalize_list(ids: list[str]) -> list[str]:
    return [i.strip().lower() for i in ids]


def normalize(ids: Iterable[str]) -> list[str]:
    return [i.strip().lower() for i in ids]


normalize_list(("Email", "Phone"))
normalize_list({"Email"})
normalize_list(f["id"] for f in [{"id": "Email"}])

print(normalize(["Email "]))
print(normalize(("Email", "Phone")))
print(normalize(f["id"] for f in [{"id": " Age"}]))
print(normalize({"Email": 1, "Phone": 2}))
print(normalize("Email"))
```

```text
$ mypy --strict iterable_param.py
iterable_param.py:12: error: Argument 1 to "normalize_list" has incompatible type "tuple[str, str]"; expected "list[str]"  [arg-type]
iterable_param.py:13: error: Argument 1 to "normalize_list" has incompatible type "set[str]"; expected "list[str]"  [arg-type]
iterable_param.py:14: error: Argument 1 to "normalize_list" has incompatible type "Generator[str, None, None]"; expected "list[str]"  [arg-type]
Found 3 errors in 1 file (checked 1 source file)
```

```text
$ python iterable_param.py
['email']
['email', 'phone']
['age']
['email', 'phone']
['e', 'm', 'a', 'i', 'l']
```

> **Пастка.** `str` сам є `Iterable[str]`: кожен символ це теж `str`. Тому `normalize("Email")` проходить mypy і повертає список літер. Якщо голий рядок на місці колекції це помилка, перевіряйте `isinstance(ids, str)` явно на початку функції; статично mypy цього не відрізнить.

Якщо потрібно більше, ніж обхід, беріть наступну сходинку, а не одразу `list`: `Collection[str]` (обхід, `len`, `in`), `Sequence[str]` (ще й індекс, тож підходять `list`, `tuple`, `str`, `range`), `Mapping[str, int]` для словника, який функція лише читає. Ця драбина типів детально розібрана в m2-l06; тут важливо, що нижні сходинки структурні, а з `Sequence` починається номінальність.

<!-- task: q2 -->

<!-- task: t3 -->

## Для капстоуну

У капстоуні рендерер перетворює елемент форми на рядок: HTML для публікації, текст для snapshot-тестів, пізніше Jinja2-шаблон (m7-l06) або зовнішній Node-рендерер через subprocess (m6-l05). Спільного в них лише форма виклику `render(element, theme) -> str`, а коду для спільного базового класу немає. Це рівно той випадок, для якого Protocol: реєстр типізований як `dict[str, Renderer]`, і кожна реалізація потрапляє туди, бо має правильний метод, а не правильного предка.

```python live
from collections.abc import Iterable
from dataclasses import dataclass
from html import escape
from typing import Literal, Protocol


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


class HtmlRenderer:
    def render(self, element: Element, theme: Theme) -> str:
        label = escape(element.label)
        match element.kind:
            case "input":
                return f'<label for="{element.id}">{label}</label><input id="{element.id}">'
            case "button":
                return f'<button style="background: {theme.accent}">{label}</button>'
            case "text":
                return f"<p>{label}</p>"


class TextRenderer:
    def render(self, element: Element, theme: Theme) -> str:
        return f"{element.kind}:{element.id} {element.label!r} [{theme.name}]"


RENDERERS: dict[str, Renderer] = {
    "html": HtmlRenderer(),
    "text": TextRenderer(),
}


def render_form(elements: Iterable[Element], theme: Theme, fmt: str) -> str:
    renderer = RENDERERS[fmt]
    return "\n".join(renderer.render(el, theme) for el in elements)


form = [
    Element("input", "email", "Email"),
    Element("text", "note", "Terms & conditions"),
    Element("button", "submit", "Send"),
]
light = Theme("light", "#0066cc")
print(render_form(form, light, "html"))
print(render_form(form, light, "text"))
```

```text
$ mypy --strict renderers.py
Success: no issues found in 1 source file
```

```text
$ python renderers.py
<label for="email">Email</label><input id="email">
<p>Terms &amp; conditions</p>
<button style="background: #0066cc">Send</button>
input:email 'Email' [light]
text:note 'Terms & conditions' [light]
button:submit 'Send' [light]
```

`match` по `Literal`-полю mypy вважає вичерпним: усі три варіанти покриті, тому `Missing return statement` немає. Новий рендерер, що не відповідає протоколу, mypy зупиняє прямо в оголошенні реєстру.

```python
from renderers import Element, HtmlRenderer, Renderer, TextRenderer


class PdfRenderer:
    def render(self, element: Element) -> bytes:
        return element.label.encode()


RENDERERS: dict[str, Renderer] = {
    "html": HtmlRenderer(),
    "text": TextRenderer(),
    "pdf": PdfRenderer(),
}
```

```text
$ mypy --strict registry_bad.py
registry_bad.py:12: error: Dict entry 2 has incompatible type "str": "PdfRenderer"; expected "str": "Renderer"  [dict-item]
Found 1 error in 1 file (checked 1 source file)
```

> **Для капстоуну.** У капстоуні кожен рендерер живе у своєму модулі пакета `formbuilder/renderers/` (`html.py`, `text.py`), а протокол у `base.py`. `text.py` нічого не імпортує з `html.py`, а `Renderer` нічого не знає про конкретні формати: залежність іде лише від протоколу. Якщо реєстр колись наповнюватиметься плагінами з конфігу за іменем класу, додайте `@runtime_checkable` і перевірку в `register()`, пам'ятаючи, що вона ловить лише відсутній метод, а сигнатуру мусять ловити тести.

<!-- task: t5 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **`implements` за звичкою.** Кожен клас наслідує протокол "щоб було видно, що він Renderer", а потім розширення `class ThemedRenderer(Renderer)` випадково стає звичайним класом і перестає приймати чужі реалізації. Правильно: наслідувати протокол лише тоді, коли потрібна перевірка на місці оголошення; розширювати протокол лише з `Protocol` у базах.

   ```python
   class HtmlRenderer:                          # достатньо форми
       def render(self, text: str) -> str: ...
   class ThemedRenderer(Renderer, Protocol):    # розширення протоколу
       def theme(self) -> str: ...
   ```

2. **Очікування, що без наслідування клас "не того типу".** Пишуть базовий клас ABC для кожної абстракції і змушують тестові дублери його наслідувати. Правильно: Protocol для параметрів і реєстрів, ABC лише для власної ієрархії зі спільною реалізацією.

   ```python
   def publish(renderer: Renderer) -> None: ...   # приймає будь-що з render(str) -> str
   publish(FakeRenderer())                       # тестовий дублер без жодних баз
   ```

3. **`isinstance` як перевірка інтерфейсу.** Звичка з `instanceof` і type guard: перевіряють протокол через `isinstance` усередині власного коду. Без `@runtime_checkable` це `TypeError`, з ним перевірка лише імен, і mypy після неї вірить у сигнатуру, якої ніхто не перевіряв. Правильно: статична анотація всередині коду, `isinstance` з runtime-протоколом лише на межі з невідомими об'єктами, і завжди з тестами.

   ```python
   isinstance(Legacy(), Renderer)   # True, хоча render(self) -> bytes
   ```

4. **Об'єктний літерал як реалізація.** У TS `{ render: (t) => t }` задовольняє інтерфейс. У Python словник має ключі, а не атрибути, і протоколу не відповідає ні для mypy, ні в рантаймі. Правильно: клас (або dataclass), а для протоколу з одним `__call__` звичайна функція.

   ```python
   r: Renderer = {"render": lambda text: text}
   # error: Incompatible types in assignment (expression has type "dict[str, Callable[[Any], Any]]", variable has type "Renderer")
   ```

5. **`list[str]` у параметрі.** `string[]` переноситься як `list[str]`, і функція раптом не приймає кортеж чи генератор. Правильно: `Iterable[str]` для обходу, `Sequence[str]` для індексу, `list[str]` лише для результату чи коли функція мутує список.

   ```python
   def normalize(ids: Iterable[str]) -> list[str]:
       return [i.strip().lower() for i in ids]
   ```

6. **`name: str` у протоколі для даних, які лише читаються.** Пряма копія поля TS-інтерфейсу. Протокол тоді вимагає сетер і відкидає frozen dataclass і property. Правильно: `@property` у протоколі за замовчуванням.

   ```python
   class Named(Protocol):
       @property
       def name(self) -> str: ...
   ```

7. **Інші імена параметрів у реалізації.** У TS імена параметрів у сигнатурі нічого не важать, тож їх перейменовують вільно. mypy теж не скаже, але виклик з keyword-аргументом за протоколом упаде. Правильно: однакові імена або positional-only `/` у протоколі.

   ```python
   class Sink(Protocol):
       def accept(self, el: Element, /) -> None: ...
   ```

## Підсумок

- Duck typing це норма Python: метод шукають за іменем у момент виклику; `len`, `for`, `in`, `with` працюють через special methods, а не через класи.
- `typing.Protocol` це TS interface для mypy: клас відповідає за формою, без наслідування і без `implements`.
- Python запускає код попри помилки mypy; Protocol у рантаймі лише клас, екземпляр якого створити не можна.
- mypy звіряє сигнатури: результат може бути вужчим (коваріантність), параметри ширшими (контраваріантність); імена параметрів не звіряє.
- Явне наслідування протоколу переносить перевірку на місце оголошення класу; для розширення протоколу `Protocol` указують у базах знову.
- ABC номінальний і ловить нереалізовані методи в рантаймі; Protocol структурний і перевіряється лише статично.
- `@runtime_checkable` дає `isinstance`, який перевіряє лише наявність атрибутів, а не сигнатури; він для меж з невідомими об'єктами.
- `name: str` у протоколі означає записуваний атрибут; для читання `@property`. `__call__` описує функцію за формою там, де `Callable` замало.
- Параметри анотують найширшим протоколом (`Iterable[str]`), результат точним типом; `str` теж `Iterable[str]`.

## Що далі

Наступний урок m2-l08 про mypy і pyright у strict-режимі: конфіг у `pyproject.toml`, коди помилок на кшталт `[arg-type]` і `[override]`, які ви тут уже бачили, і `# type: ignore[code]`. Там же видно, чому IDE (Pylance працює на pyright) і mypy у CI можуть розходитись у деталях. Протоколи повернуться в m4-l02 (special methods цілком) і m4-l05, де ABC отримає повний розбір поруч із Protocol.
