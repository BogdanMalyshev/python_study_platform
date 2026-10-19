---
id: m2-l06
module: m2-data-typing
title: "typing: анотації як TS-типи, які не перевіряються в рантаймі"
summary: "Учень анотує Python-код так само впевнено, як пише TS-типи: вбудовані generics, union з None, Literal, TypedDict, Callable, власні generic-функції й класи, і точно знає, що з цього бачить mypy, що читають бібліотеки в рантаймі, а що не перевіряє ніхто."
duration_min: 90
prerequisites: [m2-l05]
---

## Анотації живуть у рантаймі, але їх ніхто не перевіряє

У m1-l02 ви бачили факт: інтерпретатор зберігає анотації (annotations, офіційний термін; документація й PEP 484 також кажуть type hints) і не перевіряє їх. Тут механізм і наслідки. Синтаксис майже той самий, що в TS, але життєвий цикл протилежний.

```ts
function maxLength(fieldId: string, limit?: number | null): number {
  return limit ?? 255;
}
// maxLength("email", "100") не пройде tsc --strict
// у зібраному JS лишиться: function maxLength(fieldId, limit) { return limit ?? 255; }
```

```python
def max_length(field_id: str, limit: int | None = None) -> int:
    return limit if limit is not None else 255

print(max_length.__annotations__)
print(repr(max_length("email", "100")))
```

```text
{'field_id': <class 'str'>, 'limit': int | None, 'return': <class 'int'>}
'100'
```

TS стирає типи повністю: після компіляції від них не лишається нічого, а перевірка відбувається до запуску, і у вашому пайплайні помилка `tsc` зупиняє збірку. У Python навпаки. Вираз в анотації обчислюється в момент виконання `def`, результат (клас `int`, об'єкт `int | None`) кладеться в словник `__annotations__` функції, і на цьому участь інтерпретатора закінчується. Функція з `-> int` щойно повернула рядок, і нічого не сталося.

Читачів у анотацій два типи. Статичні: type checker (офіційний термін документації `typing`) mypy або pyright читає вихідний текст, не запускаючи його, як `tsc --noEmit`. Рантаймові: бібліотеки, що дістають анотації через інтроспекцію (introspection, загальний термін, у документації Python вживається для `inspect` і подібного), тобто читають `__annotations__` як звичайні дані. dataclasses генерує з них `__init__` (m2-l05), Pydantic будує валідатори (m2-l09), FastAPI вирішує, звідки брати параметр запиту (m7-l01).

```python live
import inspect
from dataclasses import dataclass, fields
from typing import get_type_hints

@dataclass
class Field:
    id: str
    required: bool = False
    note = "без анотації це не поле"

print([f.name for f in fields(Field)])
print(inspect.signature(Field))
print(get_type_hints(Field))
print(Field(id=42))
```

```text
['id', 'required']
(id: str, required: bool = False) -> None
{'id': <class 'str'>, 'required': <class 'bool'>}
Field(id=42, required=False)
```

Тут анотація вплинула на рантайм: саме вона вирішила, які поля є в класі, а `note` без анотації полем не став. Але `Field(id=42)` пройшов, бо dataclass читає анотації для структури, а не для перевірки. `typing.get_type_hints` це правильний спосіб прочитати анотації ззовні: на відміну від сирого `__annotations__`, він перетворює рядкові анотації на об'єкти (розділ про forward references нижче).

Статичну перевірку дає mypy. Ось той самий виклик, запущений і перевірений.

```python
def max_length(field_id: str, limit: int | None = None) -> int:
    return limit if limit is not None else 255


print(max_length("email", "100"))
```

```text
100
```

```text
$ mypy --strict check_me.py
check_me.py:5: error: Argument 2 to "max_length" has incompatible type "str"; expected "int | None"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

> **Пастка.** Немає кроку, який зупинить запуск. `python check_me.py` виконується з будь-якими типами, mypy це окрема програма, і її вердикт ні на що не впливає, доки ви самі не поставите її воротами в pre-commit (m3-l06) або CI. Налаштування й читання виводу mypy детально в m2-l08; тут він лише показує, що бачить чекер.

> **Під капотом.** Анотації локальних змінних усередині функції не обчислюються й не зберігаються взагалі: компілятор їх просто відкидає. На рівні модуля й класу вони потрапляють у `__annotations__`, параметри й повернення в `__annotations__` функції.

```python
def handler() -> None:
    count: UndefinedName = 0
    print(count)

handler()
print(handler.__annotations__)
```

```text
0
{'return': None}
```

<!-- task: q1 -->

## Вбудовані generics, `X | Y` і `type`

З 3.9 стандартні колекції параметризуються прямо: `list[str]`, `dict[str, int]`. Це generics (generic, офіційний термін документації `typing`) у тому самому сенсі, що `Array<string>` у TS. Окремого синтаксису `string[]` немає.

```ts
const ids: string[] = ["email", "phone"];
const limits: Record<string, number> = { email: 255 };
const pair: [number, string] = [1, "email"];
const sizes: readonly number[] = [1, 2, 3];
const tags: Set<string> = new Set();
type FieldId = string | number;
```

```python live
ids: list[str] = ["email", "phone"]
limits: dict[str, int] = {"email": 255}
pair: tuple[int, str] = (1, "email")
sizes: tuple[int, ...] = (1, 2, 3)
tags: set[str] = set()
type FieldId = str | int

print(list[str], type(list[str]))
print(str | int, type(str | int))
print(FieldId, type(FieldId), FieldId.__value__)
```

```text
list[str] <class 'types.GenericAlias'>
str | int <class 'types.UnionType'>
FieldId <class 'typing.TypeAliasType'> str | int
```

Розходження в кортежах. `tuple[int, str]` це рівно два елементи заданих типів, як TS tuple `[number, string]`. `tuple[int, ...]` це будь-яка довжина з однаковим типом, найближче в TS `readonly number[]`, бо кортеж незмінний. Список за конвенцією однорідний: якщо там змішані значення, пишуть `list[int | str]`, а для запису з різнотипними полями беруть кортеж, TypedDict або dataclass. І кожна з цих анотацій це справжній об'єкт у рантаймі (`GenericAlias`, `UnionType`), а не текст для компілятора.

`typing.List`, `Dict`, `Tuple`, `Set`, `Optional`, `Union` залишилися з часів, коли `list[str]` давав `TypeError`: до 3.9 вбудовані класи не підтримували `[]`, і `typing` тримав паралельні версії. PEP 585 (3.9) і PEP 604 (3.10, оператор `|`) зробили їх зайвими; вони deprecated, але працюють, тому в старому коді й туторіалах трапляються скрізь. ruff переписує їх автоматично, а `Optional[str]` у рантаймі буквально дорівнює `str | None`.

```python live
from typing import Optional, Union

print(Optional[str] == (str | None))
print(Union[int, str] == (int | str))
```

```text
True
True
```

```python
from typing import Dict, List, Optional, Union


def group(ids: List[str], limit: Optional[int]) -> Dict[str, Union[int, str]]:
    return {}
```

```text
$ ruff check --select UP --target-version py312 --output-format concise old_style.py
old_style.py:1:1: UP035 `typing.Dict` is deprecated, use `dict` instead
old_style.py:1:1: UP035 `typing.List` is deprecated, use `list` instead
old_style.py:4:16: UP006 [*] Use `list` instead of `List` for type annotation
old_style.py:4:34: UP045 [*] Use `X | None` for type annotations
old_style.py:4:52: UP006 [*] Use `dict` instead of `Dict` for type annotation
old_style.py:4:62: UP007 [*] Use `X | Y` for type annotations
Found 6 errors.
[*] 4 fixable with `--fix`.
```

`type FieldId = str | int` це type alias (офіційна назва), оператор `type` з'явився в 3.12 і є прямим аналогом `type` у TS. Він створює об'єкт `TypeAliasType` і обчислює праву частину ліниво, при першому зверненні, тому alias може посилатися сам на себе: `type Json = dict[str, Json] | list[Json] | str | int | float | bool | None` працює без лапок. До 3.12 писали просто `FieldId = str | int` або `FieldId: TypeAlias = str | int`; у бібліотеках побачите всі три форми.

```python live
type Json = dict[str, Json] | list[Json] | str | int | float | bool | None

config: Json = {"id": "email", "rules": [{"min": 3}], "required": True}
print(Json.__value__)
print(config)
```

```text
dict[str, Json] | list[Json] | str | int | float | bool | None
{'id': 'email', 'rules': [{'min': 3}], 'required': True}
```

> **Пастка.** Анотації не є класами, і `isinstance` з ними працює лише частково. `X | Y` з простих класів підходить, параметризований generic ні, а alias з `type` взагалі не тип для `isinstance`. Аналогічно `typing.get_args` на `type`-alias повертає порожній кортеж, бо значення лежить у `.__value__`. Так рантайм нагадує, що перевірка `list[str]` означала б обійти весь список, і цього ніхто за вас не робить.

```python
from typing import Literal, get_args

type ElementType = Literal["input", "text", "select"]
ElementTypeOld = Literal["input", "text", "select"]

print(get_args(ElementType))
print(get_args(ElementType.__value__))
print(get_args(ElementTypeOld))
print(isinstance("x", str | int))
print(isinstance(["x"], list[str]))
```

```text
()
('input', 'text', 'select')
('input', 'text', 'select')
True
TypeError: isinstance() argument 2 cannot be a parameterized generic
```

## `X | None`: nullable, а не optional

`None` в анотаціях поводиться як `null` у TS зі `strictNullChecks`: `str` не приймає `None`, поки ви не скажете `str | None`. Плутанина виникає зі словом "optional". У TS `?` склеює дві речі: параметр можна не передати, і тоді він `undefined`. У Python `undefined` немає, і ці дві речі розділені: необов'язковість параметра дає значення за замовчуванням, а `| None` лише розширює тип.

```ts
function label(fieldId: string, text?: string): string { ... }        // можна не передати
function label2(fieldId: string, text: string | null): string { ... }  // треба передати, можна null
```

```python
def label(field_id: str, text: str | None) -> str:
    return text if text is not None else field_id.title()

print(label("email", None))
print(label("email", "E-mail"))
print(label("email"))
```

```text
Email
E-mail
TypeError: label() missing 1 required positional argument: 'text'
```

`text: str | None` без `= None` це обов'язковий параметр, який може бути `None`, тобто `text: string | null` з TS. Старе `Optional[str]` означає рівно те саме, `str | None`, і саме назва `Optional` роками вводила в оману: параметр з нею лишається обов'язковим. Тому в сучасному коді пишуть `str | None`, а "можна не передати" виражають через `= None` чи інше значення за замовчуванням.

Звуження типу (type narrowing, офіційний термін у документації mypy і специфікації typing) працює так само, як control flow analysis у TS: після `if text is None: return` чекер знає, що далі `text` це `str`. `reveal_type(x)` просить чекер надрукувати, який тип він бачить у цьому місці.

```python
from typing import reveal_type


def label_bad(field_id: str, text: str | None) -> str:
    return text.strip() or field_id


def label_ok(field_id: str, text: str | None) -> str:
    if text is None:
        return field_id
    reveal_type(text)
    return text.strip() or field_id
```

```text
$ mypy --strict narrowing.py
narrowing.py:5: error: Item "None" of "str | None" has no attribute "strip"  [union-attr]
narrowing.py:11: note: Revealed type is "str"
Found 1 error in 1 file (checked 1 source file)
```

mypy розуміє `is None`, `is not None`, `isinstance`, ранній `return`, `assert x is not None`, `match` і перевірку truthiness. Де звуження ламається (атрибут об'єкта після виклику функції) і як це обходити, детально в m2-l08.

> **Пастка.** `if not text: return field_id` теж звужує `str | None` до `str`, і mypy не заперечить. Але гілка спрацює і для `""`, і для `None` (truthiness з m1-l03). Якщо порожній рядок це валідне значення, наприклад свідомо прихований підпис поля, перевіряйте `is None`.

```python
def label_truthy(field_id: str, text: str | None) -> str:
    if not text:
        return field_id
    return text

print(repr(label_truthy("email", "")))
```

```text
'email'
```

<!-- task: q2 -->

<!-- task: t1 -->

## Literal, Final, ClassVar, Annotated

`Literal["input", "text"]` це union рядкових літералів, тобто `"input" | "text"` з TS. Чекер перевіряє кожне значення, а `match` по такому типу він уміє перевірити на вичерпність: `assert_never` у гілці `case _` це аналог `const _exhaustive: never = kind`. `Final` забороняє перевизначення, як `const`.

```ts
type ElementType = "input" | "text" | "select";
const MAX_FIELDS = 50;
```

```python
from typing import Final, Literal, assert_never

type ElementType = Literal["input", "text", "select"]
MAX_FIELDS: Final = 50


def default_value(kind: ElementType) -> str | list[str]:
    match kind:
        case "input" | "text":
            return ""
        case "select":
            return []
        case _:
            assert_never(kind)


def placeholder(kind: ElementType) -> str:
    match kind:
        case "input" | "text":
            return "Type here"
        case _:
            assert_never(kind)


MAX_FIELDS = 100
print(MAX_FIELDS)
print(default_value("checkbox"))
```

```text
100
AssertionError: Expected code to be unreachable, but got: 'checkbox'
```

```text
$ mypy --strict literals.py
literals.py:22: error: Argument 1 to "assert_never" has incompatible type "Literal['select']"; expected "Never"  [arg-type]
literals.py:25: error: Cannot assign to final name "MAX_FIELDS"  [misc]
literals.py:27: error: Argument 1 to "default_value" has incompatible type "Literal['checkbox']"; expected "Literal['input', 'text', 'select']"  [arg-type]
Found 3 errors in 1 file (checked 1 source file)
```

Рантайм знову нічого не перевірив: `Final` перевизначився, `"checkbox"` пройшов у функцію, і впав лише `assert_never`, бо це звичайна функція, що кидає `AssertionError`. Зате `Literal` дає зворотний бік, якого немає в TS: значення доступні в рантаймі через `get_args`, тож список дозволених типів можна не дублювати. У TS ви робили навпаки, `const TYPES = [...] as const` і `type T = (typeof TYPES)[number]`.

```python live
from typing import Literal, get_args

type ElementType = Literal["input", "text", "select"]
ELEMENT_TYPES: tuple[str, ...] = get_args(ElementType.__value__)

def check_type(value: str) -> str:
    return "ok" if value in ELEMENT_TYPES else f"unknown type {value!r}"

print(ELEMENT_TYPES)
print(check_type("select"))
print(check_type("checkbox"))
```

```text
('input', 'text', 'select')
ok
unknown type 'checkbox'
```

`ClassVar` розрізняє атрибут класу й атрибут екземпляра. Анотація в тілі класу за конвенцією описує атрибут екземпляра, а dataclass узагалі робить з неї поле конструктора. `ClassVar[int]` каже "це спільне значення класу", аналог `static` у TS, і dataclass його пропускає (m2-l05).

```python live
from dataclasses import dataclass, fields
from typing import ClassVar

@dataclass
class Element:
    registry_size: ClassVar[int] = 0
    id: str
    label: str = ""

print([f.name for f in fields(Element)])
print(Element("email"))
```

```text
['id', 'label']
Element(id='email', label='')
```

`Annotated[T, ...]` чіпляє до типу довільні метадані. Для чекера це просто `T`, а бібліотека в рантаймі дістає метадані через `get_type_hints(..., include_extras=True)`. Прямого аналога в TS немає: найближче це Zod-схема, де обмеження живуть поруч із типом. Саме так Pydantic читає `Annotated[int, Field(gt=0)]` (m2-l09).

```python live
from typing import Annotated, get_type_hints

def set_limit(max_length: Annotated[int, "chars", range(1, 1001)]) -> None:
    pass

print(get_type_hints(set_limit))
print(get_type_hints(set_limit, include_extras=True)["max_length"].__metadata__)
```

```text
{'max_length': <class 'int'>, 'return': <class 'NoneType'>}
('chars', range(1, 1001))
```

<!-- task: t2 -->

## TypedDict: тип для JSON, який лишається dict

`TypedDict` описує словник з відомими ключами, і це найближчий аналог TS object type. Оголошується як клас, але класу в рантаймі не виникає: виклик `ElementConfig(...)` повертає звичайний `dict`, а значення з `json.loads` можна анотувати без жодного перетворення.

```ts
type ElementConfig = {
  id: string;
  type: "input" | "text" | "select";
  label?: string;
  options?: string[];
};
const el = JSON.parse(raw) as ElementConfig;
```

```python live
import json
from typing import Literal, NotRequired, TypedDict

type ElementType = Literal["input", "text", "select"]

class ElementConfig(TypedDict):
    id: str
    type: ElementType
    label: NotRequired[str]
    options: NotRequired[list[str]]

el: ElementConfig = json.loads('{"id": "email", "type": "input"}')
print(type(el), el)
print(el.get("label", el["id"]))
print(ElementConfig(id="age", type="input"))
print(json.dumps(el))
```

```text
<class 'dict'> {'id': 'email', 'type': 'input'}
email
{'id': 'age', 'type': 'input'}
{"id": "email", "type": "input"}
```

Поведінка розходиться в двох місцях. `NotRequired[str]` відповідає `label?: string` (ключа може не бути), а `label: str | None` означає інше: ключ обов'язковий, значення може бути `None`, як `label: string | null`. І `json.loads` повертає `Any`, тому присвоєння в `ElementConfig` mypy приймає без перевірки, рівно як `JSON.parse(raw) as ElementConfig`. Перевірку реальних даних робить Pydantic (m2-l09); TypedDict лише описує форму, якій ви довіряєте.

```python
import json
from typing import Literal, NotRequired, TypedDict, reveal_type

type ElementType = Literal["input", "text", "select"]


class ElementConfig(TypedDict):
    id: str
    type: ElementType
    label: NotRequired[str]


ok: ElementConfig = {"id": "email", "type": "input"}
missing: ElementConfig = {"id": "email"}
extra: ElementConfig = {"id": "email", "type": "input", "max": 10}
wrong: ElementConfig = {"id": "email", "type": "checkbox"}
trusted: ElementConfig = json.loads('{"id": 1}')
reveal_type(ok.get("label"))
print(ok["label"])
```

```text
$ mypy --strict typed_dict.py
typed_dict.py:14: error: Missing key "type" for TypedDict "ElementConfig"  [typeddict-item]
typed_dict.py:15: error: Extra key "max" for TypedDict "ElementConfig"  [typeddict-unknown-key]
typed_dict.py:16: error: Incompatible types (expression has type "Literal['checkbox']", TypedDict item "type" has type "Literal['input', 'text', 'select']")  [typeddict-item]
typed_dict.py:18: note: Revealed type is "str | None"
Found 3 errors in 1 file (checked 1 source file)
```

> **Пастка.** Останній рядок, `ok["label"]` на ключі `NotRequired`, mypy пропустив, а в рантаймі це `KeyError`. Для необов'язкових ключів читайте через `.get()`: тоді чекер бачить `str | None` і змусить обробити відсутність.

Коли необов'язкових ключів більшість, зручніше `total=False`: усі ключі класу стають необов'язковими, а `Required[...]` повертає обов'язковість окремим ключам (`Required` і `NotRequired` з 3.11). Обидва набори доступні в рантаймі, на них можна будувати власну перевірку.

```python live
from typing import Required, TypedDict

class ElementPatch(TypedDict, total=False):
    id: Required[str]
    label: str
    options: list[str]

patch: ElementPatch = {"id": "email", "label": "E-mail"}
print(patch)
print(sorted(ElementPatch.__required_keys__))
print(sorted(ElementPatch.__optional_keys__))
```

```text
{'id': 'email', 'label': 'E-mail'}
['id']
['label', 'options']
```

Різниця з dataclass у тому, що dataclass створює власний клас, а TypedDict ні. Звідси решта:

| | TypedDict | dataclass |
|---|---|---|
| Що в рантаймі | `dict` | екземпляр вашого класу |
| Доступ | `el["id"]`, `el.get("label")` | `el.id` |
| `isinstance` | `TypeError` | працює |
| `json.dumps` | напряму | через `asdict` (m2-l05) |
| Сумісність типів | структурна, як TS | номінальна: потрібен саме цей клас |
| Методи, `__post_init__` | немає | є |

Правило для курсу: TypedDict для JSON як він є, коли ви передаєте або трансформуєте сирі словники й не хочете їх конвертувати; dataclass для власних структур, які створює ваш код; Pydantic там, де дані треба перевірити.

<!-- task: q3 -->

## Callable і generic-функції: `[T]` замість `<T>`

Тип функції записується як `Callable[[аргументи], результат]` з `collections.abc` (`typing.Callable` теж deprecated alias). Це `(a: number, b: string) => boolean` без імен параметрів. `Callable[..., Any]` приймає будь-які аргументи, `Callable[[], None]` це `() => void`.

```ts
type Renderer = (el: ElementConfig) => string;
const wrapWith = (tag: string): ((html: string) => string) =>
  (html) => `<${tag}>${html}</${tag}>`;
```

```python live
from collections.abc import Callable

type Wrapper = Callable[[str], str]

def wrap_with(tag: str) -> Wrapper:
    def wrap(html: str) -> str:
        return f"<{tag}>{html}</{tag}>"
    return wrap

def apply_all(html: str, wrappers: list[Wrapper]) -> str:
    for wrap in wrappers:
        html = wrap(html)
    return html

print(apply_all("Email", [wrap_with("label"), wrap_with("div")]))
```

```text
<div><label>Email</label></div>
```

Різниця з TS у тому, чого `Callable` не вміє: назвати параметри, описати іменовані аргументи (keyword arguments, офіційний термін), `*args` з різними типами чи перевантаження. Для цього беруть `Protocol` з методом `__call__`, це тема m2-l07. Для декораторів, що мають зберегти сигнатуру обгорнутої функції, є `ParamSpec`: `def logged[**P, R](fn: Callable[P, R]) -> Callable[P, R]` переносить параметри `fn` на результат, деталі в m5-l04.

Чекер звіряє сигнатури, коли ви кладете функцію в реєстр. Це той самий реєстр рендерерів, що буде в капстоуні.

```python
from collections.abc import Callable

type Renderer = Callable[[dict[str, str]], str]


def render_input(el: dict[str, str]) -> str:
    return f'<input name="{el["id"]}">'


def render_text(el: dict[str, str], rows: int) -> str:
    return f'<textarea name="{el["id"]}" rows="{rows}"></textarea>'


renderers: dict[str, Renderer] = {"input": render_input, "text": render_text}
print(renderers["input"]({"id": "email"}))
```

```text
<input name="email">
```

```text
$ mypy --strict callables.py
callables.py:14: error: Dict entry 1 has incompatible type "str": "Callable[[dict[str, str], int], str]"; expected "str": "Callable[[dict[str, str]], str]"  [dict-item]
Found 1 error in 1 file (checked 1 source file)
```

Generic-функції в 3.12 оголошуються з параметром типу (type parameter, офіційний термін PEP 695) у квадратних дужках після імені: `def first[T](...)`. До 3.12 той самий тип писали через модульну змінну `T = TypeVar("T")`, і в більшості коду й бібліотек побачите саме її. Обмеження задаються після двокрапки: `T: Sized` це bound (офіційний термін, "верхня межа"), тобто `T extends Sized` з TS; `T: (int, str)` це constraints (теж офіційний), `T` дорівнює рівно одному з перелічених типів, і в TS такого немає. У старому синтаксисі це `TypeVar("T", bound=Sized)` і `TypeVar("T", int, str)`.

```ts
function first<T>(items: readonly T[]): T | undefined { return items[0]; }
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}
class Stack<T> { private items: T[] = []; push(item: T) { this.items.push(item); } }
```

```python
from collections.abc import Sequence, Sized
from typing import TypeVar, reveal_type

T_old = TypeVar("T_old")


def first_old(items: Sequence[T_old]) -> T_old | None:
    return items[0] if items else None


def first[T](items: Sequence[T]) -> T | None:
    return items[0] if items else None


def longest[T: Sized](a: T, b: T) -> T:
    return a if len(a) >= len(b) else b


def double[T: (int, str)](value: T) -> T:
    return value * 2


class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)


reveal_type(first([1, 2]))
reveal_type(first_old(("a", "b")))
reveal_type(longest([1], [2, 3]))
reveal_type(double("ab"))
stack = Stack[int]()
stack.push("oops")
double(1.5)
longest(1, 2)
```

```text
Runtime type is 'int'
Runtime type is 'str'
Runtime type is 'list'
Runtime type is 'str'
TypeError: object of type 'int' has no len()
```

```text
$ mypy --strict generics.py
generics.py:31: note: Revealed type is "int | None"
generics.py:32: note: Revealed type is "str | None"
generics.py:33: note: Revealed type is "list[int]"
generics.py:34: note: Revealed type is "str"
generics.py:36: error: Argument 1 to "push" of "Stack" has incompatible type "str"; expected "int"  [arg-type]
generics.py:37: error: Value of type variable "T" of "double" cannot be "float"  [type-var]
generics.py:38: error: Value of type variable "T" of "longest" cannot be "int"  [type-var]
Found 3 errors in 1 file (checked 1 source file)
```

Виведення `T` з аргументів таке саме, як у TS: `first([1, 2])` дає `int | None` без явного параметра. А рантайм знову все ігнорує: `push("oops")` у `Stack[int]` і `double(1.5)` пройшли мовчки, і впав лише `longest(1, 2)`, коли тіло дійшло до `len`. `Stack[int]()` створює звичайний `Stack`; від параметра типу в рантаймі лишаються тільки метадані на кшталт `__type_params__`.

```python live
class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

stack = Stack[int]()
stack.push("oops")
print(stack._items, type(stack).__name__)
print(Stack.__type_params__)
```

```text
['oops'] Stack
(T,)
```

> **Пастка.** `reveal_type` існує і в рантаймі (з 3.11 у `typing`): друкує в stderr фактичний клас об'єкта й повертає аргумент. Порівняйте два виводи вище: рантайм бачить `list`, чекер бачить `list[int]`. Параметри generic-типу існують лише в голові чекера.

## Any, object і широкі типи параметрів

`Any` вимикає перевірку в обидва боки: його можна присвоїти будь-куди й викликати на ньому будь-що. Це `any` з TS, і небезпечний він так само, бо розповзається: значення з `Any` тихо потрапляє у типізований код. `object` це `unknown`: прийняти можна що завгодно, але зробити з ним нічого не можна без звуження.

```ts
function a(x: any) { x.foo(); }       // компілюється
function u(x: unknown) { x.foo(); }   // error: 'x' is of type 'unknown'
```

```python
from typing import Any


def a(x: Any) -> None:
    x.foo()


def u(x: object) -> None:
    x.foo()


def u_ok(x: object) -> str:
    if isinstance(x, str):
        return x.upper()
    return repr(x)


print(u_ok("email"), u_ok(42))
```

```text
EMAIL 42
```

```text
$ mypy --strict any_object.py
any_object.py:9: error: "object" has no attribute "foo"  [attr-defined]
Found 1 error in 1 file (checked 1 source file)
```

Різниця з TS у тому, звідки `Any` береться без вашого відома. `json.loads`, нетипізовані бібліотеки, голий `list` без параметра, функція без анотацій: усе це `Any`. `--strict` у mypy ловить більшість таких місць, зокрема голий generic і повернення `Any` з типізованої функції.

```python
import json
from typing import Any


def load_ids(raw: str) -> list:
    return json.loads(raw)


def count(raw: str) -> int:
    data: Any = json.loads(raw)
    return data["count"]
```

```text
$ mypy --strict implicit_any.py
implicit_any.py:5: error: Missing type arguments for generic type "list"  [type-arg]
implicit_any.py:6: error: Returning Any from function declared to return "list[Any]"  [no-any-return]
implicit_any.py:11: error: Returning Any from function declared to return "int"  [no-any-return]
Found 3 errors in 1 file (checked 1 source file)
```

Три інструменти для спілкування з чекером. `cast(T, value)` каже чекеру "вважай це `T`" і в рантаймі повертає `value` без змін, це `as` з TS з тією самою відповідальністю. `TYPE_CHECKING` це константа, яка `False` у рантаймі й `True` для чекера: під `if TYPE_CHECKING:` ставлять імпорти, потрібні лише для анотацій, щоб уникнути циклічних або важких імпортів (m3-l01). `reveal_type` ви вже бачили.

```python live
from typing import TYPE_CHECKING, cast

if TYPE_CHECKING:
    from decimal import Decimal

def total(prices: "list[Decimal]") -> "Decimal":
    return sum(prices, start=cast("Decimal", 0))

value = cast(int, "100")
print(value, type(value))
print(TYPE_CHECKING)
print(total([]))
```

```text
100 <class 'str'>
False
0
```

> **Пастка.** `cast` нічого не перетворює й нічого не перевіряє, як і `as` у TS. `cast(int, "100")` лишається рядком, а `cast(int, x) + 1` впаде в рантаймі. Для перетворення потрібне `int(x)`, для перевірки `isinstance` або Pydantic.

Типи параметрів беруть з `collections.abc` за правилом "приймати найширший тип, повертати найточніший". `Iterable[str]` приймає список, кортеж, множину й генератор; `Sequence[str]` потрібен, коли треба `len` чи індекс; `Mapping[str, int]` це словник лише для читання. Ці типи є протоколами, тобто відповідність перевіряється за формою, без наслідування: детально `Protocol` у m2-l07. Повертати ж краще конкретний `list[str]` чи `dict[str, int]`, щоб викликач міг з ним робити все.

```python
from collections.abc import Iterable, Mapping


def sorted_ids(fields: list[str]) -> list[str]:
    return sorted(fields)


def sorted_ids_wide(fields: Iterable[str]) -> list[str]:
    return sorted(fields)


def max_limit(limits: dict[str, int | None]) -> int:
    return max((v for v in limits.values() if v is not None), default=0)


def max_limit_wide(limits: Mapping[str, int | None]) -> int:
    return max((v for v in limits.values() if v is not None), default=0)


limits: dict[str, int] = {"email": 255, "bio": 1000}
print(sorted_ids(("phone", "email")))
print(sorted_ids_wide({"phone", "email"}))
print(sorted_ids_wide(f for f in ["phone", "email"]))
print(max_limit(limits), max_limit_wide(limits))
```

```text
['email', 'phone']
['email', 'phone']
['email', 'phone']
1000 1000
```

```text
$ mypy --strict wide_params.py
wide_params.py:21: error: Argument 1 to "sorted_ids" has incompatible type "tuple[str, str]"; expected "list[str]"  [arg-type]
wide_params.py:24: error: Argument 1 to "max_limit" has incompatible type "dict[str, int]"; expected "dict[str, int | None]"  [arg-type]
wide_params.py:24: note: "dict" is invariant -- see https://mypy.readthedocs.io/en/stable/common_issues.html#variance
wide_params.py:24: note: Consider using "Mapping" instead, which is covariant in the value type
Found 2 errors in 1 file (checked 1 source file)
```

Друга помилка дивує TS-розробника. `dict` інваріантний за типом значення (invariant, термін теорії типів, яким користується документація mypy): `dict[str, int]` не підходить під `dict[str, int | None]`, бо функція з таким параметром має право покласти у словник `None`, і ваш `dict[str, int]` після виклику збреше про свій тип. TS тут поблажливий (масиви й об'єкти в нього коваріантні, і це відома дірка), mypy ні. `Mapping` не має методів запису, тому такої проблеми не має й приймає обидва.

<!-- task: q4 -->

<!-- task: t3 -->

## Forward references, overload і власний narrowing

У 3.12 анотації класу обчислюються в момент виконання тіла класу, а ім'я класу з'являється лише після. Тому рекурсивна анотація `children: list[Element]` падає з `NameError`, хоча в TS такий тип очевидний. Посилання на ще не визначене ім'я називається forward reference (офіційний термін).

```python
class Element:
    id: str
    children: list[Element]
```

```text
NameError: name 'Element' is not defined
```

Три способи обійти. Рядкова анотація `list["Element"]` не обчислюється, чекер читає її як код. `from __future__ import annotations` на початку модуля перетворює всі анотації модуля на рядки (PEP 563). `type`-alias обчислюється ліниво сам по собі. `get_type_hints` у рантаймі розв'язує рядки назад в об'єкти, тому бібліотеки користуються саме ним, а не сирим `__annotations__`.

```python live
from __future__ import annotations

from typing import get_type_hints

class Element:
    id: str
    children: list[Element]
    parent: Element | None

print(Element.__annotations__)
print(get_type_hints(Element))
```

```text
{'id': 'str', 'children': 'list[Element]', 'parent': 'Element | None'}
{'id': <class 'str'>, 'children': list[__main__.Element], 'parent': __main__.Element | None}
```

У 3.14 (PEP 649) анотації за замовчуванням обчислюються ліниво при першому читанні, тож `children: list[Element]` працюватиме без лапок і без `__future__`-імпорту.

`@overload` описує функцію, тип результату якої залежить від типу аргументу, як перевантаження в TS: кілька сигнатур без тіла, потім одна реалізація. У рантаймі декоратор `overload` підміняє сигнатури заглушками, і виконується лише остання функція.

```ts
function parse(raw: string): number;
function parse(raw: string[]): number[];
function parse(raw: string | string[]): number | number[] { ... }
```

```python
from typing import overload, reveal_type


@overload
def parse(raw: str) -> int: ...
@overload
def parse(raw: list[str]) -> list[int]: ...
def parse(raw: str | list[str]) -> int | list[int]:
    if isinstance(raw, str):
        return int(raw)
    return [int(x) for x in raw]


reveal_type(parse("1"))
reveal_type(parse(["1", "2"]))
```

```text
Runtime type is 'int'
Runtime type is 'list'
```

```text
$ mypy --strict overloads.py
overloads.py:14: note: Revealed type is "int"
overloads.py:15: note: Revealed type is "list[int]"
Success: no issues found in 1 source file
```

Без `overload` обидва виклики дали б `int | list[int]`, і викликач мусив би звужувати сам. Різниця з TS одна: реалізацію ніхто не звіряє з сигнатурами в рантаймі, як і решту анотацій.

Власна функція звуження це type predicate з TS, `v is ElementType`. У Python їх дві: `TypeGuard[T]` (3.10) і `TypeIs[T]` (3.13, для 3.12 з пакета `typing_extensions`, який ставиться разом із mypy і Pydantic). `TypeIs` поводиться як TS-предикат: звужує і в `if`, і в `else`. `TypeGuard` звужує лише `if`, а в `else` лишає вихідний тип. Для нового коду беріть `TypeIs`.

```ts
function isMulti(raw: string | string[]): raw is string[] { return Array.isArray(raw); }
```

```python
from typing import TypeGuard, reveal_type

from typing_extensions import TypeIs


def is_multi(raw: str | list[str]) -> TypeIs[list[str]]:
    return isinstance(raw, list)


def is_multi_guard(raw: str | list[str]) -> TypeGuard[list[str]]:
    return isinstance(raw, list)


def check(raw: str | list[str]) -> None:
    if is_multi(raw):
        reveal_type(raw)
    else:
        reveal_type(raw)
    if is_multi_guard(raw):
        reveal_type(raw)
    else:
        reveal_type(raw)


check("email")
```

```text
Runtime type is 'str'
Runtime type is 'str'
```

```text
$ mypy --strict guards.py
guards.py:16: note: Revealed type is "list[str]"
guards.py:18: note: Revealed type is "str"
guards.py:20: note: Revealed type is "list[str]"
guards.py:22: note: Revealed type is "str | list[str]"
Success: no issues found in 1 source file
```

> **Пастка.** Тіло предиката ніхто не перевіряє: функція з `-> TypeIs[list[str]]`, яка повертає `True` для рядка, обдурить чекер так само, як `x is Foo` з неправильним тілом обдурює `tsc`. У рантаймі це звичайна функція, що повертає `bool`.

<!-- task: t4 -->

## Для капстоуну

Сирий JSON-конфіг FormBuilder до валідації Pydantic зручно описати через TypedDict: тип елемента як `Literal`, рендерери як `Callable` у реєстрі, а обхід дерева елементів як generic `tree_map`, який не знає, що лежить у вузлах. Модуль нижче проходить `mypy --strict` без жодного `Any` і `cast`.

```python
from collections.abc import Callable, Mapping
from typing import Literal, NotRequired, TypedDict

type ElementType = Literal["form", "input", "text", "select"]


class ElementConfig(TypedDict):
    id: str
    type: ElementType
    label: NotRequired[str]
    children: NotRequired[list["ElementConfig"]]


type Renderer = Callable[[ElementConfig, list[str]], str]


class Node[T](TypedDict):
    value: T
    children: list["Node[T]"]


def to_tree(el: ElementConfig) -> Node[ElementConfig]:
    return {"value": el, "children": [to_tree(c) for c in el.get("children", [])]}


def tree_map[T, U](node: Node[T], fn: Callable[[T], U]) -> Node[U]:
    return {"value": fn(node["value"]), "children": [tree_map(c, fn) for c in node["children"]]}


def render(node: Node[ElementConfig], registry: Mapping[ElementType, Renderer]) -> str:
    inner = [render(c, registry) for c in node["children"]]
    return registry[node["value"]["type"]](node["value"], inner)


REGISTRY: dict[ElementType, Renderer] = {
    "form": lambda el, inner: f'<form id="{el["id"]}">{"".join(inner)}</form>',
    "input": lambda el, inner: f'<input name="{el["id"]}">',
    "text": lambda el, inner: f'<textarea name="{el["id"]}"></textarea>',
    "select": lambda el, inner: f'<select name="{el["id"]}"></select>',
}

config: ElementConfig = {
    "id": "signup",
    "type": "form",
    "children": [{"id": "email", "type": "input"}, {"id": "bio", "type": "text"}],
}
tree = to_tree(config)
print(tree_map(tree, lambda el: el["id"]))
print(render(tree, REGISTRY))
```

```text
{'value': 'signup', 'children': [{'value': 'email', 'children': []}, {'value': 'bio', 'children': []}]}
<form id="signup"><input name="email"><textarea name="bio"></textarea></form>
```

```text
$ mypy --strict config.py
Success: no issues found in 1 source file
```

> **Для капстоуну.** `dict[ElementType, Renderer]` гарантує, що ключ це відомий тип елемента, а значення має правильну сигнатуру: `"checkbox"` у реєстрі mypy відхилить. Повноти ключів він не гарантує: якщо додати `"date"` у `Literal` і забути рендерер, чекер промовчить, і впаде `KeyError` у `render`. Гарантію "кожен тип має рендерер" дає тест через `get_args(ElementType.__value__)` (m3-l03). У m2-l07 `Renderer` стане `Protocol`, а в m2-l09 `ElementConfig` перетвориться на Pydantic-модель, яка вже перевіряє дані, а не лише описує їх.

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Очікування, що `tsc` зупинить запуск.** Пишуть анотації й вважають, що невідповідний виклик не відбудеться. Python запуститься з будь-якими типами; воротами стає лише mypy у pre-commit або CI.

   ```python
   def max_length(limit: int) -> int:
       return limit
   print(max_length("100"))   # -> 100, без помилки
   ```

2. **`interface` як рантаймова перевірка.** Переносять звичку думати, що описаний тип "захищає" дані з JSON. TypedDict і анотації нічого не перевіряють, а `isinstance` з TypedDict падає. Правильно: валідувати межу через Pydantic (m2-l09), а анотаціями описувати вже перевірене.

   ```python
   isinstance({"id": "email"}, ElementConfig)
   # TypeError: TypedDict does not support instance and class checks
   ```

3. **`string[]` і `List[str]`.** Шукають TS-синтаксис масиву або копіюють `from typing import List` зі старих туторіалів. Правильно: `list[str]`, `dict[str, int]`, `tuple[int, ...]`, `X | None`.

   ```python
   def ids(fields: list[str]) -> dict[str, int | None]:
       return {f: None for f in fields}
   ```

4. **`?` як `| None`.** Пишуть `text: str | None` і очікують, що параметр можна не передати. Необов'язковість дає лише значення за замовчуванням: `text: str | None = None`.

   ```python
   def label(field_id: str, text: str | None = None) -> str:
       return text if text is not None else field_id
   print(label("email"))   # -> email
   ```

5. **`as` як перетворення.** `cast(int, raw)` не робить з рядка число, так само як `raw as number` у TS. Правильно: `int(raw)` для перетворення, `isinstance` для звуження, `cast` лише коли ви знаєте більше за чекер.

   ```python
   from typing import cast
   print(cast(int, "42") + 1)
   # TypeError: can only concatenate str (not "int") to str
   ```

6. **`any` "поки що".** Голий `list`, `dict` без параметрів чи `Any` на вході розповзаються по коду й вимикають перевірку далі за течією. Правильно: `object` там, де тип справді невідомий, і звуження через `isinstance`; `--strict` у mypy ловить голі generics.

   ```python
   def first_id(raw: object) -> str:
       if isinstance(raw, dict):
           value = raw.get("id")
           if isinstance(value, str):
               return value
       raise ValueError("no id")
   ```

7. **`list[str]` для параметра, який лише читається.** У TS параметр `string[]` звичний, бо дані майже завжди масиви. У Python поруч живуть кортежі, множини й генератори, і `list[str]` жодного з них не прийме, а `dict[str, int]` не пройде як `dict[str, int | None]`. Правильно: `Iterable`, `Sequence`, `Mapping` на вході, конкретний тип на виході.

   ```python
   from collections.abc import Iterable
   def sorted_ids(fields: Iterable[str]) -> list[str]:
       return sorted(fields)
   ```

## Підсумок

- Анотації обчислюються під час `def` і лежать у `__annotations__`; інтерпретатор їх не перевіряє, а Python запускається з будь-якими типами.
- Читачі анотацій: mypy і pyright статично, dataclasses, Pydantic і FastAPI у рантаймі через `get_type_hints`.
- `list[str]`, `dict[str, int]`, `tuple[int, str]`, `tuple[int, ...]`, `X | Y`; `typing.List` і `Optional` застарілі. `type Alias = ...` з 3.12 лінивий і дозволяє рекурсію.
- `str | None` це `string | null`, а не `?`; необов'язковість дає лише `= default`. Звуження через `is None` mypy розуміє так само, як TS.
- `Literal` це union літералів з доступом до значень через `get_args`; `Final` це `const`; `ClassVar` це `static`; `Annotated` несе метадані для бібліотек.
- TypedDict описує JSON як він є і в рантаймі лишається `dict`; `NotRequired` це `key?:`, `str | None` це `key: string | null`.
- `Callable[[A, B], R]` це `(a: A, b: B) => R`; іменовані аргументи через Protocol (m2-l07), збереження сигнатури через `ParamSpec`.
- Generics: `def f[T](...)`, `class C[T]`; `T: Bound` це `extends`, `T: (int, str)` це constraints, яких у TS немає.
- `Any` це `any`, `object` це `unknown`; `cast` це `as` і нічого не робить у рантаймі; `TYPE_CHECKING` для імпортів лише для чекера.
- На вході `Iterable` / `Sequence` / `Mapping`, на виході конкретний тип; `dict[str, int]` не пройде як `dict[str, int | None]`, а `Mapping` пройде.

## Що далі

Наступний урок m2-l07 про `Protocol`: структурну типізацію, яка тут з'являлась у вигляді `Iterable` і `Mapping`, і `Renderer` з капстоуну стане протоколом з методом `render`. Далі m2-l08 перетворює вивід mypy з цього уроку на щоденний інструмент: конфіг `strict` у `pyproject.toml`, коди помилок, `type: ignore`. А в m2-l09 `Literal`, `Annotated` і TypedDict-конфіг стануть Pydantic-моделлю, яка перевіряє дані в рантаймі.
