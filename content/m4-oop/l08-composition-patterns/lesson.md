---
id: m4-l08
module: m4-oop
title: "Композиція замість наслідування, патерни в ідіоматичному Python"
summary: "Учень збирає об'єкти із залежностей, переданих у __init__ і типізованих через Protocol, замінює класові GoF-патерни функціями й мовними конструкціями там, де вони зникають, і знає, які патерни в Python лишаються класами."
duration_min: 90
prerequisites: [m4-l07]
---

## Композиція: тримати залежність і делегувати

Наслідування каже "`Worker` є різновидом `Renderer`", композиція (composition) каже "`Worker` має `Renderer`". Термін не з документації Python, а з загальної OOP-літератури; фраза "favor object composition over class inheritance" походить із книжки GoF. Для сервісного коду друге майже завжди правдивіше: воркер генерації не є ні рендерером, ні публікатором, він їх використовує. У React ви цей шлях уже пройшли, коли `extends React.Component` поступився складанню компонентів. У Python спокуса наслідування сильніша з конкретної причини: множинне наслідування тут справжнє (m4-l04), і "успадкувати від обох" технічно працює.

```python
class HtmlRenderer:
    name = "html"

    def render(self, label: str) -> str:
        return f"<p>{label}</p>"


class FilePublisher:
    name = "file"

    def __init__(self, root: str) -> None:
        self.root = root

    def publish(self, slug: str, html: str) -> str:
        return f"{self.root}/{slug}.html"


class Worker(HtmlRenderer, FilePublisher):
    def process(self, slug: str, labels: list[str]) -> str:
        html = "".join(self.render(label) for label in labels)
        return self.publish(slug, html)


w = Worker("dist")
print(w.process("contact", ["Email"]))
print(w.name)
print([c.__name__ for c in Worker.__mro__])
print(isinstance(w, HtmlRenderer))
```

```text
dist/contact.html
html
['Worker', 'HtmlRenderer', 'FilePublisher', 'object']
True
```

Працює, і саме це погано. `Worker("dist")` спрацював лише тому, що в `HtmlRenderer` немає `__init__`, і пошук по MRO знайшов його у `FilePublisher`: конструктор воркера визначає порядок батьків. `name` мовчки взято з першого батька. `isinstance(w, HtmlRenderer)` істинне, тож воркер можна передати туди, де чекають рендерер. Замінити HTML на текст можна лише новим класом, а тест `process` неминуче тягне справжню публікацію.

Версія з композицією тримає обидві залежності як атрибути й делегує (delegation, загальний OOP-термін: об'єкт передає роботу іншому об'єкту, який тримає) їм роботу явними викликами. Тип залежності описаний через Protocol (m2-l07), тому `Worker` не імпортує жодної реалізації.

```python live
from typing import Protocol


class Renderer(Protocol):
    def render(self, label: str) -> str: ...


class Publisher(Protocol):
    def publish(self, slug: str, html: str) -> str: ...


class Worker:
    def __init__(self, renderer: Renderer, publisher: Publisher) -> None:
        self.renderer = renderer
        self.publisher = publisher

    def process(self, slug: str, labels: list[str]) -> str:
        html = "".join(self.renderer.render(label) for label in labels)
        return self.publisher.publish(slug, html)


class HtmlRenderer:
    def render(self, label: str) -> str:
        return f"<p>{label}</p>"


class FilePublisher:
    def __init__(self, root: str) -> None:
        self.root = root

    def publish(self, slug: str, html: str) -> str:
        return f"{self.root}/{slug}.html"


w = Worker(HtmlRenderer(), FilePublisher("dist"))
print(w.process("contact", ["Email"]))
print(isinstance(w, HtmlRenderer))
print([c.__name__ for c in Worker.__mro__])
```

```text
dist/contact.html
False
['Worker', 'object']
```

Наслідування лишається доречним, коли підклас справді є різновидом базового класу, потрібен поліморфізм і ви володієте ієрархією: власні винятки від `Exception`, реалізації ABC з m4-l05, моделі Pydantic від `BaseModel`. Простий тест: якщо підклас використовує лише частину методів батька або перевизначає метод, щоб той нічого не робив, це композиція, записана через наслідування.

Коли обгортка має делегувати майже все і змінити один-два методи, явні методи-прокладки набридають. Тут допомагає `__getattr__`: Python викликає його лише тоді, коли звичайний пошук атрибута (екземпляр, клас, MRO) нічого не знайшов. Перевизначені методи працюють як є, решта йде у вкладений об'єкт. Найближчий JS-аналог це `Proxy` з `get`-трапом, але вужчий: трап спрацьовує тільки на відсутні атрибути.

```python live
class FilePublisher:
    def __init__(self, root: str) -> None:
        self.root = root

    def publish(self, slug: str, html: str) -> str:
        return f"{self.root}/{slug}.html"


class CountingPublisher:
    def __init__(self, inner: FilePublisher) -> None:
        self._inner = inner
        self.calls = 0

    def publish(self, slug: str, html: str) -> str:
        self.calls += 1
        return self._inner.publish(slug, html)

    def __getattr__(self, name: str) -> object:
        print(f"__getattr__({name!r})")
        return getattr(self._inner, name)


p = CountingPublisher(FilePublisher("dist"))
print(p.publish("contact", "<p></p>"))
print(p.calls)
print(p.root)
```

```text
dist/contact.html
1
__getattr__('root')
dist
```

> **Пастка.** Неявні виклики dunder-методів шукають метод на типі, а не на екземплярі, і `__getattr__` обходять. `t.__len__()` дійде до вкладеного списку, а `len(t)` ні. Те саме з `in`, `[]`, `for`, `with`, `+`: кожен такий протокол обгортка мусить оголосити явно. Друга ціна: mypy вважає, що `__getattr__` відповідає на будь-яке ім'я, і опечатка в атрибуті обгортки перестає бути помилкою типів.

```python
class Tracked:
    def __init__(self, items: list[str]) -> None:
        self._items = items

    def __getattr__(self, name: str) -> object:
        return getattr(self._items, name)


t = Tracked(["email", "phone"])
print(t.__len__())
print(len(t))
```

```text
2
TypeError: object of type 'Tracked' has no len()
```

```text
$ mypy --strict proxy.py        # той самий CountingPublisher, плюс рядок print(p.rooot)
Success: no issues found in 1 source file
```

<!-- task: q1 -->

## Інʼєкція залежностей без контейнера

Інʼєкція залежностей (dependency injection, DI, архітектурний термін, не з документації Python) у Python це параметри `__init__`. Типом параметра стоїть Protocol, значенням може бути будь-що відповідної форми. Ні декораторів, ні токенів, ні модуля з провайдерами.

```ts
export const RENDERER = Symbol("RENDERER");

@Injectable()
export class Pipeline {
  constructor(
    @Inject(RENDERER) private readonly renderer: Renderer,
    private readonly publisher: FilePublisher,
  ) {}
}

@Module({
  providers: [Pipeline, FilePublisher, { provide: RENDERER, useClass: HtmlRenderer }],
})
export class GenerationModule {}
```

```python
class Pipeline:
    def __init__(self, renderer: Renderer, publisher: Publisher | None = None) -> None:
        self.renderer = renderer
        self.publisher = publisher if publisher is not None else FilePublisher("dist")


def build_pipeline(out_dir: str) -> Pipeline:      # composition root
    return Pipeline(HtmlRenderer(), FilePublisher(out_dir))
```

Контейнер у NestJS розв'язує три задачі, яких у Python немає або які закриваються мовою. Перша: TS-інтерфейс стирається при компіляції, тож контейнеру потрібен рантайм-токен `RENDERER`, щоб знати, що підставити. У Python Protocol у рантаймі теж нічого не перевіряє, але токен не потрібен, бо об'єкт ви передаєте самі. Друга: граф залежностей. Його збирає одна функція на старті застосунку, composition root (термін Марка Сімана з DI-літератури, не Python-специфічний), і це єдине місце, яке знає конкретні класи. Третя: час життя. Об'єкт рівня застосунку це змінна модуля, яка створюється один раз (розділ про Singleton нижче), а request-scope дає `Depends` у FastAPI (m7-l01). Бібліотеки-контейнери для Python існують, але в типовому проєкті їх немає.

Значення за замовчуванням дає продакшн-реалізацію там, де вона очевидна, а тест передає fake (термін з тестування, з класифікації test doubles Джерарда Месароса): робочу реалізацію протоколу в пам'яті. На відміну від `Mock` з m3-l04, fake перевіряється mypy проти того самого Protocol і поводиться як справжня реалізація, тому тест перевіряє результат, а не послідовність викликів.

```python live
from typing import Protocol


class Renderer(Protocol):
    def render(self, label: str) -> str: ...


class Publisher(Protocol):
    def publish(self, slug: str, html: str) -> str: ...


class HtmlRenderer:
    def render(self, label: str) -> str:
        return f"<p>{label}</p>"


class FilePublisher:
    def __init__(self, root: str) -> None:
        self.root = root

    def publish(self, slug: str, html: str) -> str:
        return f"{self.root}/{slug}.html"   # справжній запис файлу буде в m6-l01


class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[str, str] = {}

    def publish(self, slug: str, html: str) -> str:
        self.pages[slug] = html
        return f"memory://{slug}"


class Pipeline:
    def __init__(self, renderer: Renderer, publisher: Publisher | None = None) -> None:
        self.renderer = renderer
        self.publisher = publisher if publisher is not None else FilePublisher("dist")

    def run(self, slug: str, labels: list[str]) -> str:
        html = "".join(self.renderer.render(label) for label in labels)
        return self.publisher.publish(slug, html)


prod = Pipeline(HtmlRenderer())
print(prod.run("contact", ["Email"]))

fake = MemoryPublisher()
test = Pipeline(HtmlRenderer(), publisher=fake)
print(test.run("contact", ["Email", "Phone"]))
print(fake.pages)
```

```text
dist/contact.html
memory://contact
{'contact': '<p>Email</p><p>Phone</p>'}
```

`publisher if publisher is not None else ...`, а не `publisher or ...`: друге перевіряє truthiness, і publisher із `__len__`, що повертає `0`, мовчки замінився б на файловий. Чому не просто `publisher: Publisher = FilePublisher("dist")` у сигнатурі, показує тест нижче.

<!-- task: q2 -->

> **Пастка.** Екземпляр як значення за замовчуванням у сигнатурі створюється один раз, у момент виконання `def`, і далі ділиться між усіма викликами. Це той самий механізм, що mutable default з m1-l07, тільки замість списку сервіс зі станом: два пайплайни пишуть в один `MemoryPublisher`. Для об'єктів без стану це безпечно, але правило "`None` у сигнатурі, створення в тілі" простіше, ніж щоразу перевіряти, чи є стан. У dataclass той самий результат дає `field(default_factory=...)`.

```python
from dataclasses import dataclass, field


class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[str, str] = {}


@dataclass
class Pipeline:
    publisher: MemoryPublisher = field(default_factory=MemoryPublisher)


a, b = Pipeline(), Pipeline()
a.publisher.pages["contact"] = "<p>a</p>"
print(b.publisher.pages, a.publisher is b.publisher)
```

```text
{} False
```

## Патерни, які стають функціями

Книжку GoF писали в 1994 році для C++ і Smalltalk, і частина патернів там існує тому, що функцію не можна було передати як значення. Пітер Норвіг у 1996-му переписав їх на Lisp і Dylan: 16 із 23 там стали простішими або зникли зовсім. У Python функції це об'єкти першого класу (first-class objects, формулювання з документації): їх передають, кладуть у список, повертають і тримають в атрибутах. Для JS-розробника це не новина, колбеки ви передаєте щодня. Новина в іншому: у Python-коді клас з одним методом і без стану вважається запахом сильніше, ніж у TS, а тип для такого параметра це `Callable` з `collections.abc`.

Strategy. "До" це абстрактний клас з одним методом і по підкласу на варіант. "Після" це параметр типу `Callable`. Стандартна бібліотека сама так побудована: `sorted(key=...)`, `max(key=...)`, `re.sub(repl=...)` приймають стратегію-функцію.

```python live
from abc import ABC, abstractmethod
from collections.abc import Callable

FIELDS = [{"id": "phone", "order": 2}, {"id": "email", "order": 1}, {"id": "age", "order": 3}]


# до: ієрархія стратегій
class SortStrategy(ABC):
    @abstractmethod
    def key(self, field: dict) -> int | str: ...


class ByOrder(SortStrategy):
    def key(self, field: dict) -> int | str:
        return field["order"]


def sort_fields_cls(fields: list[dict], strategy: SortStrategy) -> list[str]:
    return [f["id"] for f in sorted(fields, key=strategy.key)]


# після: стратегія це функція
def sort_fields(fields: list[dict], key: Callable[[dict], int | str]) -> list[str]:
    return [f["id"] for f in sorted(fields, key=key)]


print(sort_fields_cls(FIELDS, ByOrder()))
print(sort_fields(FIELDS, lambda f: f["order"]))
print(sort_fields(FIELDS, lambda f: f["id"]))
```

```text
['email', 'phone', 'age']
['email', 'phone', 'age']
['age', 'email', 'phone']
```

Стратегії з налаштуванням (`max_len(255)`) це замикання або `partial`, а не клас із `__init__`. Клас повертається, коли в стратегії кілька пов'язаних методів або стан між викликами; тоді вона реалізує Protocol, як `Renderer` вище.

<!-- task: t1 -->

Command: дія, упакована в об'єкт, щоб покласти її в чергу, відкласти, залогувати. У Python це функція з уже прив'язаними аргументами, і `functools.partial` робить її в один рядок. На відміну від `lambda`, `partial` фіксує значення аргументів одразу (пастки пізнього зв'язування з m1-l06 немає) і зберігає їх в атрибутах `func`, `args`, `keywords`, тож команду можна залогувати.

```python live
from functools import partial


# до: клас-команда
class PublishCommand:
    def __init__(self, slug: str, html: str) -> None:
        self.slug = slug
        self.html = html

    def execute(self) -> str:
        return publish(self.slug, self.html)


# після: функція + partial
def publish(slug: str, html: str, *, notify: bool = False) -> str:
    return f"published {slug} ({len(html)} chars, notify={notify})"


queue = [
    PublishCommand("legacy", "<p></p>").execute,
    partial(publish, "contact", "<p>Hi</p>"),
    partial(publish, "survey", "<form></form>", notify=True),
]
for command in queue:
    print(command())
print(queue[2].func.__name__, queue[2].args, queue[2].keywords)
```

```text
published legacy (7 chars, notify=False)
published contact (9 chars, notify=False)
published survey (13 chars, notify=True)
publish ('survey', '<form></form>') {'notify': True}
```

Зверніть увагу на перший елемент черги: `PublishCommand(...).execute` це зв'язаний метод (bound method, офіційний термін), тобто функція з уже підставленим `self`. Тому черга з функцій приймає і старі класи-команди без жодного адаптера. Command лишається класом, коли потрібна операція `undo` або коли команду треба серіалізувати в чергу чи базу: тоді це dataclass з даними плюс окрема функція-обробник.

Observer: об'єкт повідомляє підписників про подію. GoF-версія вимагає інтерфейс `Observer` з методом `update`; Python-версія тримає список callback-ів (callback, термін з глосарію Python: функція, передана для виклику в майбутньому). `subscribe` повертає функцію відписки, як `useEffect` повертає cleanup.

```python live
from collections.abc import Callable


# до: інтерфейс спостерігача
class LogObserver:
    def update(self, job_id: str, status: str) -> None:
        print(f"[log] {job_id}: {status}")


# після: список callback-ів
Listener = Callable[[str, str], None]


class StatusFeed:
    def __init__(self) -> None:
        self._listeners: list[Listener] = []

    def subscribe(self, listener: Listener) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    def emit(self, job_id: str, status: str) -> None:
        for listener in list(self._listeners):
            listener(job_id, status)


feed = StatusFeed()
history: list[tuple[str, str]] = []
feed.subscribe(LogObserver().update)
feed.subscribe(lambda job_id, status: history.append((job_id, status)))
unsubscribe = feed.subscribe(lambda job_id, status: print(f"[ws] {job_id}: {status}"))

feed.emit("j1", "rendering")
unsubscribe()
feed.emit("j1", "published")
print(history)
```

```text
[log] j1: rendering
[ws] j1: rendering
[log] j1: published
[('j1', 'rendering'), ('j1', 'published')]
```

> **Пастка.** `emit` ітерує копію `list(self._listeners)`. Без неї підписник, який відписується під час розсилки (типовий `once`), зсуває список, і наступний за ним підписник подію пропускає. Це та сама пастка "видалення зі списку під час ітерації" з m1-l06, тільки видалення сховане в чужому колбеку.

```python
listeners = []

def once(job_id: str) -> None:
    print("once", job_id)
    listeners.remove(once)

listeners += [once, lambda job_id: print("ws", job_id)]
for listener in listeners:
    listener("j1")
```

```text
once j1
```

> **Під капотом.** Відписка через `remove(obj.method)` працює, хоча кожне звернення `obj.method` створює новий об'єкт зв'язаного методу: `remove` порівнює через `==`, а зв'язані методи рівні, якщо в них той самий `__self__` і та сама функція. Через `is` вони не рівні, тож перевірка на кшталт `listener is self.on_status` завжди хибна: у коді відписки порівнюйте через `==`, як це робить `remove`, або тримайте функцію відписки, яку повернула `subscribe`.

```python
class Ws:
    def send(self, job_id: str, status: str) -> None: ...

ws = Ws()
print(ws.send is ws.send, ws.send == ws.send)
```

```text
False True
```

<!-- task: t2 -->

Template Method: базовий клас визначає скелет алгоритму і викликає кроки, які перевизначають підкласи (m4-l05 будує так `BaseRenderer`). Якщо змінних кроків один-два і вони не ділять стан, скелет стає функцією, а кроки стають keyword-параметрами з дефолтами.

```python live
from abc import ABC, abstractmethod
from collections.abc import Callable


# до: ABC зі скелетом
class PageTemplate(ABC):
    def render_page(self, body: str) -> str:
        return self.header() + body + self.footer()

    @abstractmethod
    def header(self) -> str: ...

    def footer(self) -> str:
        return ""


class LandingPage(PageTemplate):
    def header(self) -> str:
        return "<h1>Landing</h1>"


# після: функція з hook-параметрами
def render_page(
    body: str,
    *,
    header: Callable[[], str] = lambda: "",
    footer: Callable[[], str] = lambda: "",
) -> str:
    return header() + body + footer()


print(LandingPage().render_page("<form/>"))
print(render_page("<form/>", header=lambda: "<h1>Landing</h1>"))
print(render_page("<form/>", footer=lambda: "<small>v2</small>"))
```

```text
<h1>Landing</h1><form/>
<h1>Landing</h1><form/>
<form/><small>v2</small>
```

ABC-версія виграє, коли hook-ів багато, вони користуються спільним станом екземпляра і ви хочете, щоб інтерпретатор не дав створити клас без обов'язкового кроку. Для одного-двох кроків функція коротша й тестується без підкласу.

## Патерни, які стають мовою

Singleton. Модуль у Python виконується один раз при першому імпорті й кешується в `sys.modules`; кожен наступний `import` повертає той самий об'єкт. Отже змінна рівня модуля, `settings = Settings()` у `config.py`, уже є єдиним екземпляром на процес, і класу-синглтона не потрібно. У JS те саме з ESM: модуль обчислюється один раз, тому IIFE-патерн "модуль із замиканням" лишився в епосі до модулів. У Python модуль і є тим замиканням.

```python
import json
import json as again
import sys

print(json is again, sys.modules["json"] is json)
```

```text
True True
```

Якщо створення дороге або залежить від конфігурації, яка з'являється пізніше, лінивий синглтон це фабрика під `functools.cache`: перший виклик створює, наступні повертають кешоване. `cache_clear()` скидає його в тестах, чого клас із прихованим `_instance` не дає без хаків.

```python live
from functools import cache


@cache
def get_registry() -> dict[str, str]:
    print("building registry")
    return {"html": "HtmlRenderer"}


a = get_registry()
print(a is get_registry())
get_registry.cache_clear()
print(a is get_registry())
```

```text
building registry
True
building registry
False
```

<!-- task: q3 -->

Iterator. GoF-інтерфейс із `hasNext()` і `next()` у Python це протокол `__iter__`/`__next__` (m5-l01), і вручну його пишуть рідко: генератор із `yield` реалізує протокол сам (m5-l02). Обхід дерева елементів форми займає п'ять рядків.

```python live
def walk(node: dict, depth: int = 0):
    yield depth, node["id"]
    for child in node.get("children", []):
        yield from walk(child, depth + 1)


tree = {"id": "form", "children": [
    {"id": "page1", "children": [{"id": "email"}, {"id": "phone"}]},
    {"id": "page2", "children": [{"id": "submit"}]},
]}
for depth, node_id in walk(tree):
    print("  " * depth + node_id)
```

```text
form
  page1
    email
    phone
  page2
    submit
```

Decorator. Одна назва, дві різні речі. GoF Decorator обгортає об'єкт, зберігаючи його інтерфейс: `CountingPublisher` з першого розділу саме він, і в Python він лишається класом-обгорткою, тобто композицією. Python-декоратор `@name` обгортає функцію або клас у момент визначення і закриває найчастіший випадок, коли обгорнути треба одну функцію: логування, повтор, кеш. Механіка, `wraps` і параметри детально в m5-l04.

```python
from functools import wraps


def logged(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        print(f"-> {func.__name__}{args}")
        return func(*args, **kwargs)
    return wrapper


@logged
def render(label: str) -> str:
    return f"<p>{label}</p>"


print(render("Email"))
```

```text
-> render('Email',)
<p>Email</p>
```

Захоплення й звільнення ресурсу, яке в C++ називають RAII, а в Java пишуть через `try/finally`, у Python це контекстний менеджер (m4-l07). Окремого класу-"менеджера ресурсу" не потрібно: генератор з одним `yield` під `@contextmanager`.

```python
from contextlib import contextmanager


@contextmanager
def build_dir(slug: str):
    print(f"create build/{slug}")
    try:
        yield f"build/{slug}"
    finally:
        print(f"remove build/{slug}")


with build_dir("contact") as path:
    print("render into", path)
```

```text
create build/contact
render into build/contact
remove build/contact
```

Factory. Альтернативний конструктор це `@classmethod`, і стандартна бібліотека повна ними: `dict.fromkeys`, `datetime.fromisoformat`, `int.from_bytes`. `cls` у classmethod це клас, на якому метод викликали, тому підклас отримує екземпляр підкласу без перевизначення. А оскільки клас викликається як функція, сам клас уже є фабрикою: словник `dict[str, type[Field]]` замінює `FieldFactory` з `switch` усередині.

```python live
from dataclasses import dataclass
from typing import Self


@dataclass
class Field:
    id: str
    label: str
    required: bool = False

    @classmethod
    def from_dict(cls, data: dict) -> Self:
        return cls(
            id=data["id"],
            label=data.get("label", data["id"].title()),
            required=bool(data.get("required")),
        )


class EmailField(Field):
    pass


print(Field.from_dict({"id": "email"}))
print(EmailField.from_dict({"id": "email", "required": 1}))

KINDS: dict[str, type[Field]] = {"text": Field, "email": EmailField}
print(KINDS["email"](id="work_email", label="Work email"))
```

```text
Field(id='email', label='Email', required=False)
EmailField(id='email', label='Email', required=True)
EmailField(id='work_email', label='Work email', required=False)
```

Builder. У TS fluent builder потрібен, бо позиційні аргументи конструктора нечитабельні, а об'єкт-параметр не дає дефолтів без ручного злиття. У Python обидві проблеми закриває мова: іменовані аргументи з дефолтами, і dataclass генерує такий `__init__` сам.

```ts
const form = new FormBuilder()
  .title("Contact")
  .field("email")
  .field("phone")
  .build();
const dark = form.toBuilder().theme("dark").build();
```

```python live
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Form:
    title: str
    theme: str = "light"
    fields: tuple[str, ...] = ()
    submit_label: str = "Send"


form = Form("Contact", fields=("email", "phone"))
dark = replace(form, theme="dark")
print(form)
print(dark)
print(form.theme, dark is form)
```

```text
Form(title='Contact', theme='light', fields=('email', 'phone'), submit_label='Send')
Form(title='Contact', theme='dark', fields=('email', 'phone'), submit_label='Send')
light False
```

Розходження з builder-ом у тому, коли ловиться помилка. Неіснуючий метод builder-а TS ловить на компіляції, а неіснуюче ім'я аргументу Python ловить при виклику, але вже з точним `TypeError`; mypy ловить його статично. `dataclasses.replace` дає копію frozen-об'єкта з частиною змінених полів, тобто роботу `toBuilder()`. Builder як клас виправданий, коли об'єкт збирається покроково з перевірками між кроками, наприклад з потоку подій; і навіть тоді часто достатньо списку частин і `"".join`.

```python
Form("Contact", titel="Typo")
```

```text
TypeError: Form.__init__() got an unexpected keyword argument 'titel'
```

## Патерни, які лишаються класами

Duck typing (офіційний термін глосарію Python) прибирає частину Adapter-ів ще до того, як вони з'являться (детально в m2-l07). Функція, якій потрібно "щось із `render`", приймає будь-який об'єкт із таким методом, включно з класом зі сторонньої бібліотеки, який про ваш Protocol не чув. А якщо в чужого об'єкта потрібний метод називається інакше, але сигнатура та сама, адаптер це зв'язаний метод, переданий у параметр `Callable`. Клас-адаптер потрібен, коли не збігається сама форма виклику: інші аргументи, інший тип результату, кілька чужих викликів замість одного.

```python live
from collections.abc import Callable, Iterable
from typing import Protocol


class Renderer(Protocol):
    def render(self, label: str) -> str: ...


def render_all(renderer: Renderer, labels: Iterable[str]) -> list[str]:
    return [renderer.render(label) for label in labels]


def render_with(fn: Callable[[str], str], labels: Iterable[str]) -> list[str]:
    return [fn(label) for label in labels]


class VendorWidget:                       # чужий клас, форма збіглась
    def render(self, label: str) -> str:
        return f"**{label}**"


class VendorMarkdown:                     # чужий клас, ім'я методу інше
    def to_html(self, text: str) -> str:
        return f"<em>{text}</em>"


class LegacyTemplateEngine:               # чужий клас, форма зовсім інша
    def fill(self, template: str, context: dict[str, str]) -> str:
        return template.format(**context)


class TemplateRenderer:                   # Adapter
    def __init__(self, engine: LegacyTemplateEngine, template: str) -> None:
        self._engine = engine
        self._template = template

    def render(self, label: str) -> str:
        return self._engine.fill(self._template, {"label": label})


print(render_all(VendorWidget(), ["Email"]))
print(render_with(VendorMarkdown().to_html, ["Email"]))
print(render_all(TemplateRenderer(LegacyTemplateEngine(), "<b>{label}</b>"), ["Email"]))
```

```text
['**Email**']
['<em>Email</em>']
['<b>Email</b>']
```

Facade, один простий вхід поверх кількох підсистем, у Python найчастіше функція модуля: `publish_form(raw)` всередині створює валідатор, рендерер і публікатор та викликає їх у правильному порядку. Класом фасад стає, коли тримає довгоживучі залежності, як `Pipeline` у розділі для капстоуну: його `run` і є фасадом для воркера, а `build_pipeline` фасадом для збирання.

```python
def publish_form(raw: dict, out_dir: str = "dist") -> str:
    """Facade: один виклик замість трьох об'єктів і правильного порядку."""
    return build_pipeline(out_dir).run(raw["slug"], raw["labels"])
```

Registry: словник "ім'я → клас" або "ім'я → екземпляр", з якого фабрика бере реалізацію за рядком із конфігу. Сам реєстр це просто `dict`; питання лише, хто його заповнює. Декоратор `@register("html")` (механіка в m5-l04) працює з будь-яким класом без спільного предка, що узгоджується з Protocol-підходом. `__init_subclass__` (m4-l04) реєструє автоматично в момент визначення підкласу, тож забути реєстрацію неможливо, але потрібен базовий клас, тобто рівно один рівень наслідування.

```python live
RENDERERS: dict[str, type] = {}


def register(name: str):
    def deco(cls: type) -> type:
        RENDERERS[name] = cls
        return cls
    return deco


@register("html")
class HtmlRenderer:
    def render(self, label: str) -> str:
        return f"<p>{label}</p>"


@register("text")
class TextRenderer:
    def render(self, label: str) -> str:
        return label


print(sorted(RENDERERS))
print(RENDERERS["html"]().render("Email"))


class Element:
    registry: dict[str, type["Element"]] = {}

    def __init_subclass__(cls, *, kind: str, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        Element.registry[kind] = cls


class Input(Element, kind="input"):
    pass


print(Element.registry)
```

```text
['html', 'text']
<p>Email</p>
{'input': <class '__main__.Input'>}
```

> **Під капотом.** `kind="input"` у рядку `class Input(Element, kind="input")` це keyword-аргумент оголошення класу. Python передає його в `__init_subclass__` батька одразу після створення об'єкта класу, ще до наступного рядка модуля. Тому реєстр заповнений, щойно модуль імпортовано, і саме тому модулі з реалізаціями мусять бути імпортовані хоча б раз, наприклад у `__init__.py` пакета рендерерів.

<!-- task: t3 -->

State: поведінка об'єкта залежить від стану. GoF-варіант це клас на кожен стан із методами-переходами. У більшості реальних випадків різниця між станами полягає лише в тому, які переходи дозволені, і тоді це дані: Enum зі станами (m4-l06) і словник переходів. Таблицю видно цілком в одному місці, її можна серіалізувати, а тест переходів це один `parametrize` по парах.

```python live
from enum import StrEnum, auto


class JobStatus(StrEnum):
    QUEUED = auto()
    RENDERING = auto()
    PUBLISHED = auto()
    FAILED = auto()


TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
    JobStatus.QUEUED: frozenset({JobStatus.RENDERING, JobStatus.FAILED}),
    JobStatus.RENDERING: frozenset({JobStatus.PUBLISHED, JobStatus.FAILED}),
    JobStatus.PUBLISHED: frozenset(),
    JobStatus.FAILED: frozenset({JobStatus.QUEUED}),
}


class Job:
    def __init__(self, job_id: str) -> None:
        self.id = job_id
        self.status = JobStatus.QUEUED

    def move_to(self, new: JobStatus) -> None:
        if new not in TRANSITIONS[self.status]:
            raise ValueError(f"{self.status} -> {new} is not allowed")
        self.status = new


job = Job("j1")
job.move_to(JobStatus.RENDERING)
job.move_to(JobStatus.PUBLISHED)
print(job.status)
try:
    job.move_to(JobStatus.RENDERING)
except ValueError as e:
    print(e)
```

```text
published
published -> rendering is not allowed
```

Класи станів виправдані, коли в різних станах різна поведінка, а не лише різні дозволені переходи: наприклад, `handle(event)` у стані "редагування" валідує поле, а в стані "опубліковано" створює нову чернетку. Тоді кожен стан це об'єкт з однаковим Protocol, а контекст тримає поточний стан і делегує йому, тобто та сама композиція.

<!-- task: t4 -->

## Mixin, композиція і плоска ієрархія

Mixin (жаргон спільноти; у документації слово трапляється, наприклад колонка "Mixin Methods" у `collections.abc`, але формального визначення в глосарії немає) це маленький клас з поведінкою без власного стану, якій потрібен `self`. Він не має сенсу окремо і підмішується до інших через наслідування (m4-l04). Типові приклади: узагальнений `__repr__`, серіалізація, порівняння.

```python
class ReprMixin:
    def __repr__(self) -> str:
        fields = ", ".join(f"{k}={v!r}" for k, v in vars(self).items())
        return f"{type(self).__name__}({fields})"


class FilePublisher(ReprMixin):
    def __init__(self, root: str) -> None:
        self.root = root


print(FilePublisher("dist"))
```

```text
FilePublisher(root='dist')
```

Межа проходить по стану. Щойно поведінці потрібні власні дані, як кешу потрібен словник і лічильник, mixin мусить мати `__init__`, а кооперативні `__init__` через MRO і `**kwargs` (m4-l04) крихкі. Обгортка-композиція тримає стан у собі, обгортає будь-яку реалізацію протоколу без нового класу на кожну комбінацію, тестується окремо з fake всередині і замінюється в рантаймі присвоєнням атрибута.

```python live
from typing import Protocol


class Renderer(Protocol):
    def render(self, label: str) -> str: ...


class HtmlRenderer:
    def render(self, label: str) -> str:
        print(f"  rendering {label}")
        return f"<p>{label}</p>"


class CachingRenderer:
    def __init__(self, inner: Renderer) -> None:
        self._inner = inner
        self._cache: dict[str, str] = {}
        self.hits = 0

    def render(self, label: str) -> str:
        if label in self._cache:
            self.hits += 1
        else:
            self._cache[label] = self._inner.render(label)
        return self._cache[label]


class Worker:
    def __init__(self, renderer: Renderer) -> None:
        self.renderer = renderer


worker = Worker(HtmlRenderer())
worker.renderer = CachingRenderer(worker.renderer)   # заміна в рантаймі
for label in ["Email", "Phone", "Email"]:
    print(worker.renderer.render(label))
print("hits:", worker.renderer.hits)
```

```text
  rendering Email
<p>Email</p>
  rendering Phone
<p>Phone</p>
<p>Email</p>
hits: 1
```

Робоче правило: один рівень наслідування, далі композиція. Протокол або ABC, під ним конкретні класи, і все. Коли хочеться успадкувати від конкретного класу, щоб змінити один метод, цей метод насправді є стратегією, і його варто зробити параметром. Ієрархія рендерерів з m4-l04 показує, чому: дві незалежні осі варіацій (CSS-фреймворк і екранування) у наслідуванні множаться.

```python
from html import escape


class HtmlRenderer:
    def css_class(self, kind: str) -> str:
        return ""

    def escape(self, text: str) -> str:
        return escape(text)

    def render(self, kind: str, label: str) -> str:
        return f'<div class="{self.css_class(kind)}">{self.escape(label)}</div>'


class BootstrapRenderer(HtmlRenderer):
    def css_class(self, kind: str) -> str:
        return {"input": "form-control", "button": "btn btn-primary"}.get(kind, "")


class TrustedBootstrapRenderer(BootstrapRenderer):
    def escape(self, text: str) -> str:
        return text


class TailwindRenderer(HtmlRenderer): ...
class TrustedTailwindRenderer(TailwindRenderer): ...
# третій фреймворк дасть ще два класи, третій режим екранування ще три


print(TrustedBootstrapRenderer().render("button", "Send <now>"))
print([c.__name__ for c in TrustedBootstrapRenderer.__mro__])
```

```text
<div class="btn btn-primary">Send <now></div>
['TrustedBootstrapRenderer', 'BootstrapRenderer', 'HtmlRenderer', 'object']
```

Після рефакторингу рендерер один, а осі варіацій стали параметрами: `HtmlRenderer(css_class, escaper)`. Кожна вісь це функція, кожна комбінація це виклик конструктора, а клас відповідає протоколу `Renderer` з m2-l07 з сигнатурою `render(element, theme)`.

```python live
from collections.abc import Callable
from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class Theme:
    name: str
    accent: str


@dataclass(frozen=True)
class Element:
    kind: str
    id: str
    label: str


ClassStrategy = Callable[[str], str]
Escaper = Callable[[str], str]


def classes_from(mapping: dict[str, str]) -> ClassStrategy:
    return lambda kind: mapping.get(kind, "")


bootstrap = classes_from({"input": "form-control", "button": "btn btn-primary"})
tailwind = classes_from({"input": "border rounded px-2", "button": "bg-blue-600 text-white"})


def trusted(text: str) -> str:
    return text


class HtmlRenderer:
    def __init__(self, css_class: ClassStrategy, escaper: Escaper = escape) -> None:
        self._css_class = css_class
        self._escape = escaper

    def render(self, element: Element, theme: Theme) -> str:
        css = self._css_class(element.kind)
        return f'<div class="{css}" data-theme="{theme.name}">{self._escape(element.label)}</div>'


el = Element("button", "send", "Send <now>")
theme = Theme("light", "#0066cc")
for renderer in [
    HtmlRenderer(bootstrap),
    HtmlRenderer(bootstrap, trusted),
    HtmlRenderer(tailwind),
    HtmlRenderer(tailwind, trusted),
]:
    print(renderer.render(el, theme))
```

```text
<div class="btn btn-primary" data-theme="light">Send &lt;now&gt;</div>
<div class="btn btn-primary" data-theme="light">Send <now></div>
<div class="bg-blue-600 text-white" data-theme="light">Send &lt;now&gt;</div>
<div class="bg-blue-600 text-white" data-theme="light">Send <now></div>
```

Новий фреймворк це ще один словник, новий режим екранування ще одна функція, і жодного нового класу. Рефакторинг механічний: знайти методи, які підкласи перевизначають, винести кожен в окремий параметр конструктора з дефолтом, а підкласи видалити, замінивши їх фабричними функціями або записами в реєстрі.

## Для капстоуну

Генерація сторінки в капстоуні це чотири незалежні кроки: валідувати сирий конфіг у типізовану форму, відрендерити елементи, опублікувати HTML, позначити час. `Pipeline` тримає по одній залежності на крок, кожна описана через Protocol, а годинник через `Callable[[], datetime]`, бо `Callable` і є протоколом з одним методом `__call__`. Рендерер береться з реєстру `RENDERERS: dict[str, Renderer]` з m2-l07 у composition root `build_pipeline`, а статуси розсилаються списком callback-ів, як у розділі про Observer.

```python live
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum, auto
from html import escape
from typing import Protocol


@dataclass(frozen=True)
class Theme:
    name: str
    accent: str


@dataclass(frozen=True)
class Element:
    kind: str
    id: str
    label: str


@dataclass(frozen=True)
class Form:
    slug: str
    theme: Theme
    elements: tuple[Element, ...]


class JobStatus(StrEnum):
    VALIDATING = auto()
    RENDERING = auto()
    PUBLISHED = auto()


class Validator(Protocol):
    def validate(self, raw: Mapping[str, object]) -> Form: ...


class Renderer(Protocol):
    def render(self, element: Element, theme: Theme) -> str: ...


class Publisher(Protocol):
    def publish(self, slug: str, html: str) -> str: ...


Clock = Callable[[], datetime]
StatusListener = Callable[[str, JobStatus], None]


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class JobResult:
    job_id: str
    url: str
    published_at: datetime


class Pipeline:
    def __init__(
        self,
        validator: Validator,
        renderer: Renderer,
        publisher: Publisher,
        clock: Clock = utc_now,
    ) -> None:
        self._validator = validator
        self._renderer = renderer
        self._publisher = publisher
        self._clock = clock
        self._listeners: list[StatusListener] = []

    def subscribe(self, listener: StatusListener) -> None:
        self._listeners.append(listener)

    def _notify(self, job_id: str, status: JobStatus) -> None:
        for listener in list(self._listeners):
            listener(job_id, status)

    def run(self, job_id: str, raw: Mapping[str, object]) -> JobResult:
        self._notify(job_id, JobStatus.VALIDATING)
        form = self._validator.validate(raw)
        self._notify(job_id, JobStatus.RENDERING)
        html = "\n".join(self._renderer.render(el, form.theme) for el in form.elements)
        url = self._publisher.publish(form.slug, html)
        self._notify(job_id, JobStatus.PUBLISHED)
        return JobResult(job_id, url, self._clock())


# --- реалізації: у капстоуні це окремі модулі ---
class DictValidator:                     # у капстоуні: Pydantic-модель з m2-l09
    def validate(self, raw: Mapping[str, object]) -> Form:
        items = raw["elements"]
        assert isinstance(items, list)
        return Form(
            slug=str(raw["slug"]),
            theme=Theme("light", "#0066cc"),
            elements=tuple(Element(**item) for item in items),
        )


class HtmlRenderer:
    def render(self, element: Element, theme: Theme) -> str:
        if element.kind == "button":
            return f'<button style="background: {theme.accent}">{escape(element.label)}</button>'
        return f'<label for="{element.id}">{escape(element.label)}</label><input id="{element.id}">'


RENDERERS: dict[str, Renderer] = {"html": HtmlRenderer()}


def build_pipeline(fmt: str, publisher: Publisher, clock: Clock = utc_now) -> Pipeline:
    """Composition root: єдине місце, що знає конкретні класи."""
    return Pipeline(DictValidator(), RENDERERS[fmt], publisher, clock)


# --- тест: fake-публікатор і fake-годинник ---
class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[str, str] = {}

    def publish(self, slug: str, html: str) -> str:
        self.pages[slug] = html
        return f"memory://{slug}"


publisher = MemoryPublisher()
fixed = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)
pipeline = build_pipeline("html", publisher, clock=lambda: fixed)

statuses: list[str] = []
pipeline.subscribe(lambda job_id, status: statuses.append(str(status)))
pipeline.subscribe(lambda job_id, status: print(f"[ws] {job_id}: {status}"))

result = pipeline.run("j1", {
    "slug": "contact",
    "elements": [
        {"kind": "input", "id": "email", "label": "Email"},
        {"kind": "button", "id": "send", "label": "Send"},
    ],
})
print(result)
print(publisher.pages["contact"])
print(statuses)
```

```text
[ws] j1: validating
[ws] j1: rendering
[ws] j1: published
JobResult(job_id='j1', url='memory://contact', published_at=datetime.datetime(2026, 10, 18, 12, 0, tzinfo=datetime.timezone.utc))
<label for="email">Email</label><input id="email">
<button style="background: #0066cc">Send</button>
['validating', 'rendering', 'published']
```

`Pipeline` не імпортує ні Pydantic, ні Jinja2, ні файлової системи; тест не мокає жодного модуля, бо всі зовнішні ефекти прийшли параметрами. Цей `run` покриває лише щасливий шлях: статус `failed`, час старту й фінішу та відписка спостерігачів додаються в завданні t5. Далі архітектура не змінюється, лише нарощується. Воркер у m5-l05 приймає `render` параметром, і `pipeline.run` стане цим параметром, коли кроки отримають `async def`. Список спостерігачів у m7-l04 отримає ще одного підписника: функцію, яка пересилає `(job_id, status)` у WebSocket-з'єднання клієнта.

> **Для капстоуну.** Composition root живе в одному місці верхнього шару: для командного рядка це `build_pipeline` у `formbuilder/cli.py`, який читає налаштування, вибирає рендерер з реєстру, створює публікатор для `settings.out_dir` і віддає готовий `Pipeline` (сам `Pipeline` лежить у `generate.py`). У FastAPI (m7-l01) ту саму роль грає фабрика `create_app` в `api/app.py`, а залежності стануть провайдерами для `Depends`, і тести підмінять їх через `app.dependency_overrides` на версію з fake-ами. Жоден інший модуль не створює залежностей сам; якщо всередині класу з'являється `FilePublisher(...)`, це місце, де тест доведеться мокати.

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Клас для сервісу без стану.** `SlugService` з одним методом і порожнім `__init__`, бо "в NestJS усе сервіс". Екземпляр нічого не тримає, `self` не використовується. Правильно: функція в модулі; якщо потрібна підміна в тесті, функція передається параметром.

   ```python
   class SlugService:                    # за звичкою
       def slugify(self, title: str) -> str:
           return title.lower().replace(" ", "-")

   def slugify(title: str) -> str:       # правильно
       return title.lower().replace(" ", "-")
   ```

2. **DI-контейнер як у NestJS або Angular.** Тягнуть бібліотеку з `@inject`, токенами й автозв'язуванням, бо без контейнера "незрозуміло, хто що створює". Правильно: параметри `__init__` з типом Protocol і одна функція composition root; request-scope дає `Depends` у FastAPI.

   ```python
   def build_pipeline(settings: Settings) -> Pipeline:
       return Pipeline(PydanticValidator(), RENDERERS[settings.fmt], DirectoryPublisher(settings.out_dir))
   ```

3. **Singleton через замикання або `__new__`.** Модульний патерн з IIFE або клас із `_instance` і `__new__`, де `__init__` щоразу перезаписує стан. Правильно: змінна рівня модуля, а для лінивого створення фабрика під `@cache`.

   ```python
   settings = Settings()                 # config.py: один на процес

   @cache
   def get_settings() -> Settings:       # лінивий варіант, cache_clear() у тестах
       return Settings()
   ```

4. **Інтерфейс, клас і фабрика для дрібниці.** `IEscaper`, `HtmlEscaper`, `EscaperFactory` для однієї функції. Правильно: параметр `Callable` з дефолтом.

   ```python
   class HtmlRenderer:
       def __init__(self, escaper: Callable[[str], str] = html.escape) -> None:
           self._escape = escaper
   ```

5. **`abstract class` для стратегії.** `abstract class SortStrategy { abstract key(f): string }` і по підкласу на варіант. Правильно: `key: Callable[[Field], str]`, як у `sorted`.

   ```python
   sort_fields(fields, key=lambda f: f["order"])
   ```

6. **Екземпляр як значення за замовчуванням.** `publisher: Publisher = MemoryPublisher()` у сигнатурі створюється один раз і ділиться між усіма об'єктами. Правильно: `None` і створення в тілі або `field(default_factory=...)`.

   ```python
   def __init__(self, publisher: Publisher | None = None) -> None:
       self.publisher = publisher if publisher is not None else FilePublisher("dist")
   ```

7. **Новий підклас на кожну варіацію.** `TrustedBootstrapRenderer(BootstrapRenderer(HtmlRenderer))`, і кожна нова вісь множить класи. Правильно: один рівень наслідування, варіації як параметри конструктора.

   ```python
   HtmlRenderer(css_class=bootstrap, escaper=trusted)
   ```

8. **Проксі через `__getattr__` як повний `Proxy`.** Очікують, що `len`, `in`, `with`, `[]` теж делегуються. Вони шукають dunder на типі й `__getattr__` не бачать. Правильно: явно оголосити потрібні dunder-методи або делегувати явними методами.

   ```python
   def __len__(self) -> int:
       return len(self._items)
   ```

## Підсумок

- Композиція: об'єкт тримає залежності в атрибутах і делегує їм; тип залежності це Protocol, реалізацію передає той, хто створює об'єкт.
- Наслідування для справжнього "є різновидом" з поліморфізмом; правило "один рівень наслідування, далі композиція".
- DI у Python це параметри `__init__` плюс одна функція composition root; контейнер не потрібен, бо токенів немає, а модуль уже дає час життя "на процес".
- Екземпляр як дефолт у сигнатурі ділиться між усіма викликами: `None` і створення в тілі.
- Strategy, Command, Observer, Template Method часто стають функцією, `partial`, списком callback-ів і функцією з hook-параметрами.
- Singleton це модуль або `@cache` на фабриці; Iterator це генератор; Builder це keyword-аргументи, dataclass і `replace`; Factory це `@classmethod` або клас як callable.
- GoF Decorator обгортає об'єкт і лишається класом; Python-декоратор обгортає функцію при визначенні.
- Adapter, Facade, State і Registry лишаються класами або словниками; State часто це Enum плюс таблиця переходів.
- `__getattr__` делегує лише звичайні атрибути; dunder-протоколи обгортка оголошує сама.
- Mixin для поведінки без стану, якій потрібен `self`; стан, тестованість і заміна в рантаймі означають композицію.

## Що далі

Модуль 5 відкриває m5-l01 про протокол ітерації: `__iter__`, `__next__` і `StopIteration`, тобто те, на що в цьому уроці перетворився патерн Iterator. Генератор `walk` звідси там розібраний до рівня протоколу, а реєстр через декоратор і `@cache` повернуться в m5-l03 і m5-l04. `Pipeline` з цього уроку стане `render`-параметром воркера в m5-l05.
