---
id: m5-l04
module: m5-iter-async
title: "Декоратори функцій і класів, декоратори з параметрами"
summary: "Учень пише декоратори функцій, методів і класів, фабрики декораторів з параметрами, декоратори-класи зі станом і асинхронні обгортки, правильно складає кілька декораторів, зберігає метадані через wraps і сигнатуру для mypy через ParamSpec."
duration_min: 80
prerequisites: [m5-l03]
---

## `@deco` це `f = deco(f)` у момент визначення

Декоратор (decorator, офіційний термін із глосарію Python) це будь-який callable (об'єкт, який можна викликати, теж термін глосарію), який приймає функцію або клас і повертає те, що стане на місце цього імені. Рядок `@deco` над `def` нічого не додає до мови: це синтаксичний цукор для `f = deco(f)` одразу після визначення. Усе, що потрібно для декоратора, ви вже бачили в m1-l08: функцію, яку повертає інша функція, і замикання, яке тримає оригінал у cell.

```python live
def shout(fn):
    def wrapper(name):
        return fn(name).upper()
    return wrapper


@shout
def greet(name):
    return f"hello, {name}"


def greet_plain(name):
    return f"hello, {name}"


greet_plain = shout(greet_plain)

print(greet("ann"))
print(greet_plain("ann"))
print(greet.__name__)
print(greet.__closure__[0].cell_contents.__name__)
```

```text
HELLO, ANN
HELLO, ANN
wrapper
greet
```

Обидва записи дають той самий результат. Після декорування ім'я `greet` вказує на `wrapper`, а оригінальна функція живе лише в cell замикання. Внутрішню функцію, яку повертає декоратор, спільнота називає wrapper (жаргон, але документація `functools` теж говорить "wrapper function"); те, що `greet.__name__` тепер `"wrapper"`, виправимо в наступному розділі.

Важливіше за синтаксис момент виконання. Тіло декоратора виконується один раз, коли виконується `def`, тобто для функцій верхнього рівня модуля під час імпорту. Виклики функції потім проходять лише через wrapper, сам декоратор більше не запускається.

```python live
def announce(fn):
    print(f"decorating {fn.__name__}")
    return fn


print("before def")


@announce
def render():
    print("render body")


print("after def")
render()
render()
```

```text
before def
decorating render
after def
render body
render body
```

> **Пастка.** Декоратор із побічним ефектом (реєстрація маршруту, рендерера, команди CLI) спрацьовує лише тоді, коли модуль із декорованою функцією хтось імпортував. Якщо файл `renderers/textarea.py` ніде не імпортується, `@register("textarea")` у ньому не виконається ніколи, і реєстр буде без цього ключа. У JS із side-effect імпортами `import "./polyfill"` та сама історія, але там вона рідкісна, а в Python так влаштовані FastAPI, pytest, Click і більшість плагінних систем.

Найближчий аналог у вашому досвіді це HOC: функція бере компонент і повертає новий компонент з додатковою поведінкою.

```ts
function withLogging<P extends object>(Component: React.ComponentType<P>) {
  const Wrapped = (props: P) => {
    console.log("render", Component.displayName ?? Component.name);
    return <Component {...props} />;
  };
  Wrapped.displayName = `withLogging(${Component.displayName ?? Component.name})`;
  return Wrapped;
}

const LoggedButton = withLogging(Button);
```

```python
def with_logging(fn):
    def wrapper(*args, **kwargs):
        print("call", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper


@with_logging
def button(label):
    return f"<button>{label}</button>"


print(button("Save"))
```

```text
call button
<button>Save</button>
```

Розходження в трьох місцях. HOC зазвичай дає результату нове ім'я (`LoggedButton`), а оригінал `Button` лишається доступним; декоратор перезаписує те саме ім'я, і оригінал без додаткових зусиль більше не дістати. `displayName`, який ви вручну ставите в HOC заради DevTools, у Python має точний відповідник `functools.wraps`. І HOC отримує props одним об'єктом, а wrapper отримує позиційні й іменовані аргументи окремо, тому шаблон завжди `*args, **kwargs`.

TS-декоратори схожі синтаксисом, але працюють інакше. Стандартні декоратори (TC39, TS 5.0+) отримують `(value, context)`, де `context` знає ім'я, вид члена і дає `addInitializer`; legacy-варіант з `experimentalDecorators` отримує `(target, propertyKey, descriptor)` і разом з `emitDecoratorMetadata` пише типи в reflect-metadata. Обидва працюють лише на класах і членах класу.

```ts
function logged<This, Args extends unknown[], R>(
  target: (this: This, ...args: Args) => R,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
) {
  return function (this: This, ...args: Args): R {
    console.log(`call ${String(context.name)}`);
    return target.call(this, ...args);
  };
}

class Form {
  @logged submit() {}
}

// @logged function submit() {}   // помилка компіляції: декоратор тут недопустимий
```

```python
class Form:
    @with_logging
    def submit(self):
        return "sent"


@with_logging
def submit():
    return "sent"


print(Form().submit())
print(submit())
```

```text
call submit
sent
call submit
sent
```

Python-декоратор не отримує жодного контексту: лише сам об'єкт. Той самий `with_logging` працює і на звичайній функції, і на методі, бо метод у тілі класу це теж просто функція. Клас у момент декорування методу ще не існує (тіло класу виконується раніше, ніж створюється об'єкт класу), тож декоратор методу не може дізнатися свій клас; рядок `fn.__qualname__` дає `"Form.submit"`, а справжній доступ до класу дає `__set_name__` дескрипторів (m4-l03). Метаданих типу reflect-metadata немає і не потрібно: анотації й так лежать у рантаймі, про це розділ про реєстри.

<!-- task: q1 -->

## Шаблон `wrapper(*args, **kwargs)` і `functools.wraps`

Робочий декоратор має чотири обов'язкові частини: wrapper приймає `*args, **kwargs` і передає їх далі без змін (m1-l07), викликає оригінал, повертає його результат, і обгорнутий `functools.wraps`. Пропустити будь-яку з них можна, але кожен пропуск ламає щось своє.

```python live
import functools


def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print(f"call {fn.__name__} args={args} kwargs={kwargs}")
        result = fn(*args, **kwargs)
        print(f"{fn.__name__} -> {result!r}")
        return result
    return wrapper


@logged
def make_field(name, kind="text", *, required=False):
    """Build a field config."""
    return {"name": name, "type": kind, "required": required}


make_field("email", "email", required=True)
print(make_field.__name__, "|", make_field.__doc__)
```

```text
call make_field args=('email', 'email') kwargs={'required': True}
make_field -> {'name': 'email', 'type': 'email', 'required': True}
make_field | Build a field config.
```

> **Пастка.** Забутий `return` у wrapper. У JS `(...args) => fn(...args)` повертає значення неявно, і ця звичка переноситься в Python, де функція без `return` повертає `None`. Помилки немає: декорована функція просто тихо перестає щось повертати.

```python
def logged_broken(fn):
    def wrapper(*args, **kwargs):
        print("call", fn.__name__)
        fn(*args, **kwargs)
    return wrapper


@logged_broken
def add(a, b):
    return a + b


print(add(2, 3))
```

```text
call add
None
```

Без `wraps` wrapper назовні виглядає як wrapper: власне ім'я, порожній docstring і сигнатура `(*args, **kwargs)`. `functools.wraps(fn)` копіює з оригіналу `__module__`, `__name__`, `__qualname__`, `__doc__`, `__annotations__` (у 3.12 ще `__type_params__`), доповнює `__dict__` і додає `__wrapped__` з посиланням на оригінал. Сам механізм і порівняння "до/після" в m5-l03; тут важливо, хто цими метаданими користується.

```python live
import functools
import inspect


def plain(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper


def wrapped(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper


def make_field(name: str, kind: str = "text") -> dict:
    """Build a field config."""
    return {"name": name, "type": kind}


for deco in (plain, wrapped):
    f = deco(make_field)
    print(deco.__name__, f.__name__, f.__doc__, inspect.signature(f))

f = wrapped(make_field)
print(f.__wrapped__ is make_field, inspect.unwrap(f) is make_field)
```

```text
plain wrapper None (*args, **kwargs)
wrapped make_field Build a field config. (name: str, kind: str = 'text') -> dict
True True
```

`inspect.signature` іде по ланцюжку `__wrapped__` до оригіналу, тому з `wraps` сигнатура правильна, хоча сам wrapper приймає що завгодно. На цьому тримаються інструменти, які читають сигнатуру в рантаймі: pytest дізнається з неї імена фікстур і параметрів, FastAPI будує з неї параметри запиту й `Depends`, `help()` і IDE показують її користувачу. Без `wraps` pytest бачить функцію без параметрів і відмовляється збирати тест.

```python
import functools

import pytest


def plain(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper


def wrapped(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper


@pytest.mark.parametrize("value", [1, 2])
@plain
def test_plain(value):
    assert value > 0


@pytest.mark.parametrize("value", [1, 2])
@wrapped
def test_wrapped(value):
    assert value > 0
```

```text
$ pytest test_wraps.py -q
________________________ ERROR collecting test_wraps.py ________________________
In test_wraps.py::test_plain: function uses no argument 'value'
```

Якщо прибрати `test_plain`, `test_wrapped` збирається і проходить обидва параметри (`2 passed`). `__wrapped__` корисний і в ваших тестах: `publish.__wrapped__("home")` викликає функцію в обхід `@retry` чи `@timed`, без моків.

<!-- task: t1 -->

## Декоратори з параметрами: фабрика на три рівні

`@retry(times=3)` виглядає як декоратор з аргументами, але таких у Python немає. Після `@` стоїть звичайний вираз (з 3.9 будь-який, PEP 614), і Python спершу обчислює його, а результат застосовує до функції. `retry(times=3)` має повернути декоратор, той прийме функцію і поверне wrapper. Звідси три рівні вкладеності: фабрика (decorator factory, жаргон спільноти; документація говорить просто про функцію, що повертає декоратор), декоратор і wrapper. Кожен рівень це замикання на змінні попереднього: wrapper бачить і `fn`, і `times`.

```python live
import functools


def retry(times):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except ConnectionError as exc:
                    print(f"attempt {attempt} failed: {exc}")
                    if attempt == times:
                        raise
        return wrapper
    return decorator


responses = iter([ConnectionError("timeout"), ConnectionError("reset"), "/home"])


@retry(times=3)
def publish(page):
    result = next(responses)
    if isinstance(result, Exception):
        raise result
    return result


print(publish("home"))
print(publish.__name__)
```

```text
attempt 1 failed: timeout
attempt 2 failed: reset
/home
publish
```

Без синтаксичного цукру це `publish = retry(times=3)(publish)`: два виклики підряд. `raise` без аргументу в останній спробі перекидає той самий виняток з оригінальним traceback, тож назовні видно справжню причину, а не загальне "не вдалося".

> **Пастка.** Дужки мають значення в обидва боки. `@retry` без дужок передає функцію як `times`: декоратор "спрацює", а ім'я `publish` вкаже на внутрішній `decorator`, і помилка вилізе лише при першому виклику. Навпаки, `@logged()` для простого декоратора падає одразу під час визначення, бо `logged` чекає функцію.

```python
@retry
def ping():
    return "pong"


ping()
```

```text
TypeError: retry.<locals>.decorator() missing 1 required positional argument: 'fn'
```

Іноді хочеться, щоб працювали обидві форми, `@retry` і `@retry(times=5)`, як у `@dataclass` і `@dataclass(frozen=True)`. Прийом один: перший параметр це функція або `None`, а налаштування лише іменовані (keyword-only, офіційний термін документації: параметр після `*`). Якщо функцію передали, декоратор застосовується одразу; якщо ні, повертається сам декоратор.

```python live
import functools


def retry(fn=None, *, times=3):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except ConnectionError:
                    if attempt == times:
                        raise
        wrapper.times = times
        return wrapper

    if fn is None:
        return decorator
    return decorator(fn)


@retry
def ping():
    return "pong"


@retry(times=5)
def publish(page):
    return f"/{page}"


print(ping(), ping.times)
print(publish("home"), publish.times)
```

```text
pong 3
/home 5
```

`*` у сигнатурі тут обов'язкова: без неї `@retry(5)` передав би `5` як `fn`, і `decorator(5)` впав би з незрозумілою помилкою. У власному коді простіше завжди писати дужки; подвійна форма потрібна бібліотекам, де декоратор з'являється сотні разів і `@fixture` читається краще за `@fixture()`.

<!-- task: t2 -->

## Кілька декораторів: порядок застосування

Коли декораторів кілька, Python спершу обчислює вирази після `@` згори вниз, а потім застосовує результати знизу вгору: найближчий до `def` обгортає першим. `@a @b def f` означає `f = a(b(f))`. Під час виклику порядок дзеркальний: першим виконується зовнішній wrapper, тобто верхній декоратор.

```python live
def tag(name):
    print(f"evaluate tag({name!r})")

    def decorator(fn):
        print(f"apply {name} to {fn.__name__}")

        def wrapper():
            return f"<{name}>{fn()}</{name}>"
        wrapper.__name__ = f"{name}_{fn.__name__}"
        return wrapper
    return decorator


@tag("b")
@tag("i")
def hello():
    return "hi"


print(hello())
print(hello.__name__)
```

```text
evaluate tag('b')
evaluate tag('i')
apply i to hello
apply b to i_hello
<b><i>hi</i></b>
b_i_hello
```

Порядок такий самий, як у TS-декораторів, тож нового тут лише те, що він має наслідки для семантики. `@timed` над `@retry` міряє всі спроби разом із паузами, `@retry` над `@timed` міряє кожну спробу окремо; `@cache` над `@logged` логує лише промахи кешу, під ним логує кожен виклик. Вирішуйте, що саме має бачити зовнішній шар, і ставте його вище.

Справжні поломки з'являються, коли в стеку є `@property`, `@staticmethod` чи `@classmethod`. Вони повертають не функцію, а дескриптор (descriptor, офіційний термін: об'єкт з `__get__`, детально в m4-l03), і ваш декоратор, поставлений над ними, отримує цей дескриптор замість функції.

```python
from functools import cache


class Form:
    @cache
    @property
    def schema(self):
        return {"fields": []}
```

```text
TypeError: the first argument must be callable
```

`cache` хоче callable, а об'єкт `property` не callable, тому помилка ще під час створення класу. Зворотний порядок `@property` над `@cache` працює, бо `cache` обгортає звичайну функцію, але кеш тримає кожен `self` як ключ, і екземпляри ніколи не звільняються з пам'яті. Для "обчислити властивість один раз" є `functools.cached_property` (m5-l03).

```python live
import functools


def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print("call", fn.__name__, args)
        return fn(*args, **kwargs)
    return wrapper


class Slug:
    def __repr__(self):
        return "Slug()"

    @staticmethod
    @logged
    def ok(title):
        return title.lower()

    @logged
    @staticmethod
    def bad(title):
        return title.lower()

    @logged
    @classmethod
    def cbad(cls):
        return cls.__name__


print(Slug.ok("A"), Slug().ok("B"))
print(Slug.bad("C"))
for call in (lambda: Slug().bad("D"), Slug.cbad):
    try:
        call()
    except TypeError as exc:
        print("TypeError:", exc)
```

```text
call ok ('A',)
call ok ('B',)
a b
call bad ('C',)
c
call bad (Slug(), 'D')
TypeError: Slug.bad() takes 1 positional argument but 2 were given
call cbad ()
TypeError: 'classmethod' object is not callable
```

`@logged` над `@staticmethod` отримує об'єкт `staticmethod`. З 3.10 він callable, тому виклик через клас працює, але wrapper це звичайна функція, і через екземпляр вона прив'язується як метод: `self` їде першим аргументом у статичну функцію, яка його не чекає. `classmethod` не callable зовсім. Правило просте: `@property`, `@staticmethod`, `@classmethod` завжди найвищі в стеку, ваші декоратори під ними.

<!-- task: q2 -->

## Декоратор-клас і декоратори методів

Декоратор не мусить бути функцією: підходить будь-який callable, що приймає функцію. Клас теж callable, тож `@CountCalls` означає `validate = CountCalls(validate)`: `__init__` відпрацьовує як декоратор, екземпляр стає на місце функції, а його `__call__` (m4-l02) грає роль wrapper. Внутрішнього `def`, на який можна повісити `@wraps`, тут немає, тому метадані копіюються функцією `functools.update_wrapper(self, fn)`. `wraps` це та сама `update_wrapper`, загорнута в декоратор.

```python live
import functools


class CountCalls:
    def __init__(self, fn):
        functools.update_wrapper(self, fn)
        self.fn = fn
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return self.fn(*args, **kwargs)

    def reset(self):
        self.calls = 0


@CountCalls
def validate(value):
    """Check that value is not empty."""
    return bool(value)


validate("a")
validate("")
print(validate.calls, validate.__name__, validate.__doc__)
validate.reset()
print(validate.calls, type(validate).__name__)
```

```text
2 validate Check that value is not empty.
0 CountCalls
```

Те саме можна зробити замиканням: функції в Python це об'єкти, і їм можна вішати атрибути, `wrapper.calls += 1` усередині wrapper змінює атрибут, а не переприсвоює ім'я, тому `nonlocal` не потрібен. Але такий атрибут невидимий для mypy: під `--strict` він повідомляє `"_Wrapped[P, R, P, R]" has no attribute "calls"` на кожне звернення. Клас доречніший, коли в декоратора є стан, який читають ззовні, або методи (`reset`, `cache_clear`, `stats`); замикання лишається нормою для всього без стану. Ще одне застосування класу: фабрика з параметрами без третього рівня вкладеності, де `__init__(self, times)` зберігає параметри, а `__call__(self, fn)` повертає wrapper.

```python
import functools


class retry:
    def __init__(self, times):
        self.times = times

    def __call__(self, fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, self.times + 1):
                try:
                    return fn(*args, **kwargs)
                except ConnectionError:
                    if attempt == self.times:
                        raise
        return wrapper


@retry(times=2)
def ping():
    return "pong"


print(ping(), ping.__name__)
```

```text
pong ping
```

Декоратор методу нічим не відрізняється від декоратора функції: у тілі класу метод це звичайна функція, і wrapper стає на її місце. Коли код звертається до `job.start`, Python прив'язує вже wrapper до екземпляра, бо функції це дескриптори з `__get__` (m4-l03), і `self` приходить у wrapper першим елементом `args`. Ні `this`, ні `bind`, ні `fn.apply(this, args)` не потрібні: `fn(*args, **kwargs)` передає `self` далі так само, як решту аргументів.

Якщо декоратору потрібен сам екземпляр, параметр `self` пишуть у wrapper явно. Типовий випадок: перевірка стану об'єкта перед викликом. Так у капстоуні `GenerationJob` не дасть завершити задачу, яка не стартувала.

```python live
import functools


def require_status(*allowed):
    def decorator(method):
        @functools.wraps(method)
        def wrapper(self, *args, **kwargs):
            if self.status not in allowed:
                raise RuntimeError(f"{method.__name__}() not allowed in status {self.status!r}")
            return method(self, *args, **kwargs)
        return wrapper
    return decorator


class GenerationJob:
    def __init__(self):
        self.status = "queued"

    @require_status("queued")
    def start(self):
        self.status = "running"

    @require_status("running")
    def finish(self, url):
        self.status = "done"
        return url


job = GenerationJob()
try:
    job.finish("/home")
except RuntimeError as exc:
    print(exc)
job.start()
print(job.finish("/home"), job.status)
```

```text
finish() not allowed in status 'queued'
/home done
```

> **Пастка.** Декоратор-клас ламає методи. Екземпляр `CountCalls` не функція і не має `__get__`, тому через екземпляр класу він не прив'язується, і `self` губиться. Функція-wrapper цієї проблеми не має саме тому, що функції дескриптори.

```python
class Form:
    def __init__(self, name):
        self.name = name

    @CountCalls
    def submit(self):
        return f"submit {self.name}"


Form("signup").submit()
```

```text
TypeError: Form.submit() missing 1 required positional argument: 'self'
```

Лікується одним методом: `__get__` повертає прив'язаний метод, тобто той самий екземпляр декоратора з уже підставленим `obj`. `types.MethodType(self, obj)` робить рівно те, що функції роблять для себе автоматично. Лічильник при цьому один на всі екземпляри `Form`, бо декоратор живе на класі.

```python live
import functools
import types


class CountCalls:
    def __init__(self, fn):
        functools.update_wrapper(self, fn)
        self.fn = fn
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return self.fn(*args, **kwargs)

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        return types.MethodType(self, obj)


class Form:
    def __init__(self, name):
        self.name = name

    @CountCalls
    def submit(self):
        return f"submit {self.name}"


print(Form("signup").submit())
print(Form("login").submit())
print(Form.submit.calls)
```

```text
submit signup
submit login
2
```

<!-- task: t3 -->

## Декоратори класів і реєстри

Декоратор класу (class decorator, офіційний термін з PEP 3129) отримує вже створений клас, тобто після виконання всього тіла, і повертає клас. Зазвичай той самий, змінений на місці. `@dataclass` (m2-l05) працює саме так: читає `__annotations__`, генерує `__init__`, `__repr__`, `__eq__`, дописує їх у клас і повертає його ж, а не новий.

```python live
from dataclasses import dataclass


class Field:
    name: str
    required: bool = False


original = Field
result = dataclass(Field)
print(result is original, "__init__" in Field.__dict__)
print(Field("email"))
```

```text
True True
Field(name='email', required=False)
```

Найчастіший власний декоратор класу це реєстратор: фабрика з ключем кладе клас у словник і повертає його без змін. Це той самий патерн, що `@app.get("/")` у FastAPI, лише без фреймворку.

```python live
RENDERERS = {}


def register(kind):
    def decorator(cls):
        if kind in RENDERERS:
            raise ValueError(f"renderer for {kind!r} already registered")
        RENDERERS[kind] = cls
        cls.kind = kind
        return cls
    return decorator


@register("input")
class InputRenderer:
    def render(self, el):
        return f'<input name="{el["name"]}">'


@register("textarea")
class TextareaRenderer:
    def render(self, el):
        return f'<textarea name="{el["name"]}"></textarea>'


def render(el):
    return RENDERERS[el["type"]]().render(el)


print(list(RENDERERS))
print(render({"type": "textarea", "name": "bio"}))
print(InputRenderer.kind)
```

```text
['input', 'textarea']
<textarea name="bio"></textarea>
input
```

> **Пастка.** Забутий `return cls`. Клас потрапить у реєстр, бо реєстрація вже сталась, але ім'я `InputRenderer` у модулі стане `None`, і все зламається лише там, де клас використовують напряму, наприклад у тестах.

```python
def register_broken(kind):
    def decorator(cls):
        RENDERERS[kind] = cls
    return decorator


@register_broken("select")
class SelectRenderer:
    pass


print(SelectRenderer, RENDERERS["select"].__name__)
```

```text
None SelectRenderer
```

Ту саму реєстрацію можна зробити через `__init_subclass__` (m4-l04): базовий клас реєструє кожного нащадка сам, і забути декоратор неможливо. Різниця в тому, хто вирішує. Декоратор це явний opt-in на кожному класі, працює з класами без спільної бази і з функціями. `__init_subclass__` вимагає наслідування, зате реєструє всіх нащадків, включно з тими, кого реєструвати не хотіли (абстрактні проміжні класи, тестові підкласи).

```python
class Renderer:
    registry = {}

    def __init_subclass__(cls, kind, **kwargs):
        super().__init_subclass__(**kwargs)
        Renderer.registry[kind] = cls


class InputRenderer(Renderer, kind="input"):
    pass


print(Renderer.registry)
```

```text
{'input': <class '__main__.InputRenderer'>}
```

Вбудовані й поширені декоратори, які ви зустрінете щодня, діляться на ті самі групи: обгортки, дескриптори і реєстратори.

- `@staticmethod`, `@classmethod`, `@property` повертають дескриптори, а не функції (m4-l01, m4-l03), тому завжди стоять найвище в стеку.
- `@functools.cache` і `@lru_cache(maxsize=...)` обгортки з мемоізацією, а `@cached_property` дескриптор (m5-l03).
- `@contextlib.contextmanager` перетворює генератор на контекстний менеджер (m4-l07).
- `@functools.singledispatch` робить з функції диспетчер за типом першого аргументу, а `@fn.register` реєструє реалізації (m5-l03).
- `@dataclass` декоратор класу, що генерує методи (m2-l05).
- `@pytest.fixture` реєструє фікстуру, а pytest потім підставляє її за ім'ям параметра з сигнатури (m3-l03).
- `@app.get("/path")` у FastAPI це фабрика-реєстратор: кладе функцію в таблицю маршрутів і повертає її без змін, тому ендпоінт лишається звичайною функцією, яку можна викликати в тесті (m7-l01).

Останній пункт показує, чим замінено reflect-metadata: нічим, бо анотації вже лежать на функції. Реєстратор у стилі FastAPI зберігає функцію, а потім читає її сигнатуру через `inspect`.

```python live
import inspect


class App:
    def __init__(self):
        self.routes = {}

    def get(self, path):
        def decorator(fn):
            self.routes[("GET", path)] = fn
            return fn
        return decorator


app = App()


@app.get("/forms/{form_id}")
def read_form(form_id: str, version: int = 1) -> dict:
    return {"id": form_id, "version": version}


for (method, path), fn in app.routes.items():
    params = {name: p.annotation.__name__ for name, p in inspect.signature(fn).parameters.items()}
    print(method, path, fn.__name__, params)
print(read_form("f1"))
```

```text
GET /forms/{form_id} read_form {'form_id': 'str', 'version': 'int'}
{'id': 'f1', 'version': 1}
```

<!-- task: t4 -->

## Асинхронні функції під декоратором

Виклик `async def` функції не виконує її тіло, а лише створює об'єкт корутини (coroutine, офіційний термін), який виконається, коли його хтось `await`-не (детально в m5-l05). Звичайний wrapper про це не знає: він викликає `fn(...)`, отримує корутину, виконує свій код "після" і повертає корутину назовні. Тіло функції запуститься пізніше, вже поза wrapper.

```python live
import asyncio
import functools


def announce(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print(f"start {fn.__name__}")
        result = fn(*args, **kwargs)
        print(f"end {fn.__name__}")
        return result
    return wrapper


@announce
async def publish(page):
    print(f"publishing {page}")
    await asyncio.sleep(0.01)
    return f"/{page}"


async def main():
    url = await publish("home")
    print(url)


asyncio.run(main())
```

```text
start publish
end publish
publishing home
/home
```

Результат працює, але `end` надруковано до того, як тіло почалось. Таймер у такому wrapper завжди міряє нуль, а `try/except` нічого не ловить: виняток виникає при `await`, коли wrapper уже повернувся. `@retry` з розділу про фабрики над асинхронною функцією не робить жодного повтору.

```python
@retry(times=3)
async def flaky_publish(page):
    raise ConnectionError("upstream down")


asyncio.run(flaky_publish("home"))
```

```text
ConnectionError: upstream down
```

Жодного рядка `attempt ... failed`: перша ж помилка вилітає назовні. Виправлення в тому, що wrapper сам має бути `async def` і робити `await fn(...)`. Тоді він повертає корутину, яка всередині чекає оригінал, і код до й після `await` виконується в правильний момент.

```python live
import asyncio
import functools


def retry(times):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return await fn(*args, **kwargs)
                except ConnectionError as exc:
                    print(f"attempt {attempt} failed: {exc}")
                    if attempt == times:
                        raise
        return wrapper
    return decorator


calls = 0


@retry(times=3)
async def publish(page):
    global calls
    calls += 1
    await asyncio.sleep(0.01)
    if calls < 3:
        raise ConnectionError(f"call {calls}")
    return f"/{page}"


print(asyncio.run(publish("home")))
```

```text
attempt 1 failed: call 1
attempt 2 failed: call 2
/home
```

Якщо декоратор має працювати і з синхронними, і з асинхронними функціями, він перевіряє `inspect.iscoroutinefunction(fn)` у момент декорування й повертає один із двох wrapper. Перевірка дивиться на сам об'єкт, а не на `__wrapped__`, тому синхронний wrapper без цього розгалуження ще й ховає асинхронність від усіх, хто вирішує за цією ознакою, як вирішує FastAPI: синхронні ендпоінти він запускає в пулі потоків, асинхронні чекає в event loop. `asyncio.iscoroutinefunction` робить те саме, але в 3.14 оголошена застарілою, тож беріть версію з `inspect`.

```python live
import asyncio
import functools
import inspect


def announce(fn):
    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def async_wrapper(*args, **kwargs):
            print(f"start {fn.__name__}")
            result = await fn(*args, **kwargs)
            print(f"end {fn.__name__}")
            return result
        return async_wrapper

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print(f"start {fn.__name__}")
        result = fn(*args, **kwargs)
        print(f"end {fn.__name__}")
        return result
    return wrapper


@announce
def render(page):
    print(f"rendering {page}")
    return f"<html>{page}</html>"


@announce
async def publish(page):
    print(f"publishing {page}")
    await asyncio.sleep(0.01)
    return f"/{page}"


print(render("home"))
print(asyncio.run(publish("home")))
print(inspect.iscoroutinefunction(render), inspect.iscoroutinefunction(publish))
```

```text
start render
rendering home
end render
<html>home</html>
start publish
publishing home
end publish
/home
False True
```

<!-- task: q3 -->

<!-- task: t5 -->

## Типізація: `ParamSpec` зберігає сигнатуру

Для mypy декоратор це функція, яка бере callable і повертає callable, і тип результату визначається лише анотацією декоратора. Неанотований декоратор під `--strict` дає помилку на самому декораторі й на кожній функції, яку він обгортає, а її тип стає `Any`.

```python
import functools


def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print("call", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper


@logged
def add(a: int, b: int) -> int:
    return a + b


reveal_type(add)
add("1", "2")
```

```text
$ mypy --strict untyped.py
untyped.py:4: error: Function is missing a type annotation  [no-untyped-def]
untyped.py:6: error: Function is missing a type annotation  [no-untyped-def]
untyped.py:12: error: Untyped decorator makes function "add" untyped  [untyped-decorator]
untyped.py:17: note: Revealed type is "Any"
Found 3 errors in 1 file (checked 1 source file)
```

Перша спроба виправити це `Callable[..., Any]` (m2-l06). Вона гірша за помилку: mypy задоволений, а `add` перетворився на функцію з будь-якими аргументами й результатом `Any`. Неправильний виклик і неправильне присвоєння проходять мовчки.

```python
import functools
from collections.abc import Callable
from typing import Any


def logged(fn: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        print("call", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper


@logged
def add(a: int, b: int) -> int:
    return a + b


reveal_type(add)
add("1", "2")
total: str = add(1, 2)
```

```text
$ mypy --strict any_callable.py
any_callable.py:19: note: Revealed type is "def (*Any, **Any) -> Any"
Success: no issues found in 1 source file
```

У TS ця задача розв'язується звичайним generic по кортежу аргументів. У Python для неї окремий вид змінної типу, `ParamSpec` (офіційна назва з модуля `typing`, PEP 612): він захоплює весь список параметрів разом з іменами, значеннями за замовчуванням і keyword-only.

```ts
function logged<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args) => {
    console.log("call", fn.name);
    return fn(...args);
  };
}

const add = logged((a: number, b: number) => a + b);
add("1", "2"); // error: string is not assignable to number
```

```python
import functools
from collections.abc import Callable


def logged[**P, R](fn: Callable[P, R]) -> Callable[P, R]:
    @functools.wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        print("call", fn.__name__)
        return fn(*args, **kwargs)
    return wrapper


@logged
def add(a: int, b: int) -> int:
    return a + b


reveal_type(add)
add("1", "2")
total: str = add(1, 2)
add(1, b=2)
```

```text
$ mypy --strict paramspec.py
paramspec.py:18: note: Revealed type is "def (a: int, b: int) -> int"
paramspec.py:19: error: Argument 1 to "add" has incompatible type "str"; expected "int"  [arg-type]
paramspec.py:19: error: Argument 2 to "add" has incompatible type "str"; expected "int"  [arg-type]
paramspec.py:20: error: Incompatible types in assignment (expression has type "int", variable has type "str")  [assignment]
Found 3 errors in 1 file (checked 1 source file)
```

Різниця з TS у тому, що кортеж `A` описує лише позиційні аргументи, а сигнатура Python-функції це ще й імена, за якими можна передати будь-який параметр (`add(1, b=2)` теж валідний виклик). Тому `P` не розкладається на кортеж: `P.args` і `P.kwargs` мають сенс лише разом, як анотації `*args` і `**kwargs` одного wrapper. `[**P, R]` це синтаксис 3.12; у старшому коді ви побачите `P = ParamSpec("P")` і `R = TypeVar("R")` на рівні модуля, значення те саме.

Фабрика отримує ті самі змінні типу, а в анотації результату стоїть тип декоратора: функція з `Callable[P, R]` у `Callable[P, R]`. mypy розуміє, що `P` і `R` розв'язуються не при виклику `retry(3)`, а при застосуванні результату до функції, і показує це як generic callable.

```python
import functools
from collections.abc import Callable


def retry[**P, R](times: int) -> Callable[[Callable[P, R]], Callable[P, R]]:
    def decorator(fn: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(fn)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except ConnectionError:
                    if attempt == times:
                        raise
            raise AssertionError("unreachable")
        return wrapper
    return decorator


@retry(times=3)
def publish(page: str) -> str:
    return f"/{page}"


reveal_type(retry(3))
reveal_type(publish)
publish(42)
```

```text
$ mypy --strict factory.py
factory.py:25: note: Revealed type is "def [P, R] (def (*P.args, **P.kwargs) -> R) -> def (*P.args, **P.kwargs) -> R"
factory.py:26: note: Revealed type is "def (page: str) -> str"
factory.py:27: error: Argument 1 to "publish" has incompatible type "int"; expected "str"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

`raise AssertionError("unreachable")` після циклу потрібен лише чекеру: mypy не знає, що цикл з `times >= 1` завжди закінчиться `return` або `raise`, і без цього рядка повідомить про відсутній `return`.

Декоратор, що змінює сигнатуру, теж типізується. Це аналог HOC, який підставляє компоненту проп: `withUser(Component)` повертає компонент без пропа `user`. `Concatenate[User, P]` каже "перший параметр `User`, далі решта", а результат `Callable[P, R]` уже без нього.

```python
import functools
from collections.abc import Callable
from typing import Concatenate


class User:
    name = "bogdan"


def with_user[**P, R](fn: Callable[Concatenate[User, P], R]) -> Callable[P, R]:
    @functools.wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return fn(User(), *args, **kwargs)
    return wrapper


@with_user
def greet(user: User, greeting: str) -> str:
    return f"{greeting}, {user.name}"


reveal_type(greet)
greet("hi")
greet(User(), "hi")
```

```text
$ mypy --strict inject.py
inject.py:22: note: Revealed type is "def (greeting: str) -> str"
inject.py:24: error: Too many arguments for "greet"  [call-arg]
inject.py:24: error: Argument 1 to "greet" has incompatible type "User"; expected "str"  [arg-type]
Found 2 errors in 1 file (checked 1 source file)
```

Асинхронний декоратор приймає `Callable[P, Awaitable[R]]` і повертає `Callable[P, Coroutine[Any, Any, R]]`, бо `async def wrapper` повертає саме корутину. Забутий `await` при виклику mypy ловить. А от синхронний wrapper над корутиною з попереднього розділу типізується без жодної помилки: тип результату чесний, це справді корутина, тож баг "end до початку тіла" лишається на вас.

```python
import functools
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any


def logged[**P, R](fn: Callable[P, Awaitable[R]]) -> Callable[P, Coroutine[Any, Any, R]]:
    @functools.wraps(fn)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        print("call", fn.__name__)
        return await fn(*args, **kwargs)
    return wrapper


@logged
async def publish(page: str) -> str:
    return f"/{page}"


def sync_logged[**P, R](fn: Callable[P, R]) -> Callable[P, R]:
    @functools.wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return fn(*args, **kwargs)
    return wrapper


@sync_logged
async def fetch(page: str) -> str:
    return page


reveal_type(publish)
reveal_type(fetch)


async def main() -> None:
    url: str = await publish("home")
    bad: str = publish("home")
```

```text
$ mypy --strict asyncdeco.py
asyncdeco.py:31: note: Revealed type is "def (page: str) -> typing.Coroutine[Any, Any, str]"
asyncdeco.py:32: note: Revealed type is "def (page: str) -> typing.Coroutine[Any, Any, str]"
asyncdeco.py:37: error: Incompatible types in assignment (expression has type "Coroutine[Any, Any, str]", variable has type "str")  [assignment]
asyncdeco.py:37: note: Maybe you forgot to use "await"?
Found 1 error in 1 file (checked 1 source file)
```

## Для капстоуну

У бекенді FormBuilder декоратори закривають три задачі: реєстр рендерерів за типом елемента, вимір тривалості етапів пайплайну й повтор публікації. Реєстр функцій-рендерерів з ключем `ElementType` (StrEnum з m4-l06) працює як `register` вище; ключ-`StrEnum` дорівнює своєму рядку і має той самий хеш, тому пошук за `el["type"]` із сирого JSON знаходить його без перетворень.

```python live
from enum import StrEnum


class ElementType(StrEnum):
    INPUT = "input"
    TEXTAREA = "textarea"


RENDERERS = {}


def register(kind):
    def decorator(fn):
        if kind in RENDERERS:
            raise ValueError(f"renderer for {kind!r} already registered")
        RENDERERS[kind] = fn
        return fn
    return decorator


@register(ElementType.INPUT)
def render_input(el):
    return f'<input name="{el["name"]}">'


@register(ElementType.TEXTAREA)
def render_textarea(el):
    return f'<textarea name="{el["name"]}"></textarea>'


config = [{"type": "input", "name": "email"}, {"type": "textarea", "name": "bio"}]
print("".join(RENDERERS[el["type"]](el) for el in config))
print(render_input({"name": "phone"}))
```

```text
<input name="email"><textarea name="bio"></textarea>
<input name="phone">
```

`@timed` і `@retry` у пайплайні асинхронні й отримують годинник і `sleep` параметрами. У продакшні це `time.perf_counter` і `asyncio.sleep`, у тестах фейковий годинник, у якого час рухається лише через `sleep`. Тоді тривалості й паузи в логах детерміновані, а тест з п'ятьма повторами не чекає реальних секунд. Логування тут мінімальне, через `logging` у stdout; повна конфігурація зі structlog і `job_id` у контексті в m5-l09.

```python live
import asyncio
import functools
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("formbuilder.pipeline")


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    async def sleep(self, seconds):
        self.now += seconds
        await asyncio.sleep(0)


def timed(stage, *, clock):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            start = clock()
            try:
                return await fn(*args, **kwargs)
            finally:
                log.info("%s took %.2fs", stage, clock() - start)
        return wrapper
    return decorator


def retry(times, delay, *, sleep, exceptions=(ConnectionError,)):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return await fn(*args, **kwargs)
                except exceptions as exc:
                    if attempt == times:
                        raise
                    pause = delay * 2 ** (attempt - 1)
                    log.warning("%s attempt %d failed: %s; retry in %.1fs", fn.__name__, attempt, exc, pause)
                    await sleep(pause)
        return wrapper
    return decorator


clock = FakeClock()
failures = iter([ConnectionError("503"), ConnectionError("503")])


@timed("publish", clock=clock)
@retry(times=4, delay=0.5, sleep=clock.sleep)
async def publish(html):
    await clock.sleep(0.1)
    if (exc := next(failures, None)) is not None:
        raise exc
    return "/forms/signup"


print(asyncio.run(publish("<form></form>")))
```

```text
WARNING formbuilder.pipeline: publish attempt 1 failed: 503; retry in 0.5s
WARNING formbuilder.pipeline: publish attempt 2 failed: 503; retry in 1.0s
INFO formbuilder.pipeline: publish took 1.80s
/forms/signup
```

`@timed` стоїть над `@retry`, тому 1.80s це вся публікація: три спроби по 0.1s і паузи 0.5s та 1.0s. Поміняйте їх місцями, і `timed` залогує три окремі тривалості по 0.10s, без пауз. Обидва варіанти корисні, але це різні метрики, і в дашборді їх не варто плутати. `finally` у `timed` гарантує запис і тоді, коли всі спроби провалились.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Шукати клас, щоб повісити декоратор.** TS-декоратори існують лише на класах і членах, тому рука тягнеться загорнути функцію в клас заради `@logged`. У Python декоратор на звичайній функції це норма, класи для цього не потрібні.

   ```python
   @logged
   def publish(page):
       return f"/{page}"
   ```

2. **Забутий `return`.** Є три місця, де його гублять: `return fn(...)` у wrapper (результат стає `None`), `return wrapper` у декораторі (функція стає `None`), `return cls` у декораторі класу (клас стає `None`). Жодне не дає помилки в момент визначення.

   ```python
   def wrapper(*args, **kwargs):
       return fn(*args, **kwargs)   # не просто fn(*args, **kwargs)
   ```

3. **`bind`, `call`, `apply` для `this`.** У wrapper методу пишуть `fn.__get__(self)(*args)` або шукають, як прокинути контекст. `self` це звичайний перший позиційний аргумент, він уже лежить в `args`.

   ```python
   def wrapper(*args, **kwargs):
       return fn(*args, **kwargs)   # self всередині args
   ```

4. **HOC з пропсами як декоратор, що підставляє аргумент.** `@with_user` прибирає параметр із сигнатури: читач бачить `def greet(user, greeting)`, а викликає `greet("hi")`. Без `Concatenate` mypy цього не розуміє, а FastAPI взагалі читає сигнатуру. Якщо значення можна передати явно або через `Depends`, так і робіть; підстановку лишайте для справді наскрізних речей.

   ```python
   def with_user[**P, R](fn: Callable[Concatenate[User, P], R]) -> Callable[P, R]: ...
   ```

5. **Очікувати reflect-metadata.** Заводять окремий словник "функція → типи параметрів" або вимагають, щоб декоратор отримав типи аргументом. Анотації вже лежать на функції, а декоратор може прочитати їх сам; потрібен лише `wraps`, щоб обгортка їх не сховала.

   ```python
   inspect.signature(fn).parameters["form_id"].annotation   # <class 'str'>
   ```

6. **Декоратор без `functools.wraps`.** У JS `displayName` HOC потрібен лише для DevTools, тому його пропускають. У Python без `wraps` ламаються `__name__` у логах, `help()`, і, головне, pytest і FastAPI, які читають сигнатуру.

   ```python
   def logged(fn):
       @functools.wraps(fn)
       def wrapper(*args, **kwargs): ...
   ```

7. **Синхронний wrapper над `async def`.** Інтуїція з JS "async-функцію можна обгорнути будь-якою функцією, проміс просто пройде крізь неї" технічно правильна, але все, що wrapper робить після виклику, відбувається до виконання тіла. Таймер міряє нуль, `retry` не повторює, `except` нічого не ловить.

   ```python
   @functools.wraps(fn)
   async def wrapper(*args, **kwargs):
       return await fn(*args, **kwargs)
   ```

8. **Власний декоратор над `@staticmethod`, `@classmethod` чи `@property`.** Ці три повертають дескриптори, і ваш wrapper отримує не функцію. Вони завжди найвищі в стеку.

   ```python
   @staticmethod
   @logged
   def slug(title): ...
   ```

## Підсумок

- `@deco` над `def` це `f = deco(f)` одразу після визначення; декоратор виконується один раз, при імпорті модуля, а виклики йдуть через wrapper.
- Шаблон: `@functools.wraps(fn)`, `def wrapper(*args, **kwargs)`, `return fn(*args, **kwargs)`, `return wrapper`; без `wraps` ламаються `__name__`, docstring, `inspect.signature`, pytest і FastAPI.
- `@retry(times=3)` це фабрика: вираз після `@` обчислюється першим і повертає декоратор; три рівні вкладеності, кожен замикає змінні попереднього.
- Необов'язкові дужки: `def deco(fn=None, *, option=...)`, налаштування лише keyword-only.
- Вирази декораторів обчислюються згори вниз, застосовуються знизу вгору: `@a @b def f` це `a(b(f))`, і верхній бачить усе, що роблять нижні.
- `@property`, `@staticmethod`, `@classmethod` повертають дескриптори й стоять найвище в стеку.
- Декоратор-клас: `update_wrapper(self, fn)` у `__init__`, wrapper у `__call__`; для методів потрібен `__get__`, інакше губиться `self`.
- Декоратор класу отримує готовий клас і має повернути його; реєстратор це явний opt-in, `__init_subclass__` автоматична реєстрація нащадків.
- Для `async def` wrapper теж `async def` з `await`; змішані випадки через `inspect.iscoroutinefunction`.
- Типізація: `def deco[**P, R](fn: Callable[P, R]) -> Callable[P, R]`, `Concatenate` для підстановки аргументу; `Callable[..., Any]` мовчки стирає типи.

## Що далі

Наступний урок m5-l05 про asyncio: event loop, корутини, `Task`, `TaskGroup`, таймаути й скасування. Асинхронні wrapper з цього уроку там стануть звичайним інструментом, а `@retry` з паузою через `asyncio.sleep` отримає сусідів: `asyncio.timeout` і скасування задачі, які теж треба правильно пропускати крізь wrapper. Декоратор `@timed` повернеться в m5-l09, де замість `basicConfig` з'явиться structlog з контекстом задачі.
