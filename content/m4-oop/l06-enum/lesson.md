---
id: m4-l06
module: m4-oop
title: "Enum і StrEnum: закритий набір значень як об'єкти"
summary: "Учень описує статуси й типи елементів через Enum і StrEnum, знає, чим член відрізняється від рядка, коли брати Literal, а коли Enum, і як Enum поводиться в match, dataclass і Pydantic."
duration_min: 45
prerequisites: [m4-l05]
---

## Enum: клас, усі екземпляри якого перелічені в тілі

`Enum` (офіційна назва, модуль `enum`) це клас, у якого екземпляри не створюють викликом, а перелічують прямо в тілі. Кожне присвоєння на рівні класу стає членом (member, офіційний термін): об'єктом типу цього класу з двома атрибутами, `.name` (ім'я атрибута) і `.value` (те, що стоїть праворуч від `=`).

```ts
enum Status {
  Draft = "draft",
  Published = "published",
  Archived = "archived",
}
console.log(Status.Draft);          // "draft"
console.log(Object.values(Status)); // ["draft", "published", "archived"]
```

```python live
from enum import Enum

class Status(Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

print(Status.DRAFT)
print(repr(Status.DRAFT))
print(Status.DRAFT.name, Status.DRAFT.value)
print(type(Status.DRAFT), isinstance(Status.DRAFT, Status))
print(list(Status))
print([s.value for s in Status])
print(len(Status))
```

```text
Status.DRAFT
<Status.DRAFT: 'draft'>
DRAFT draft
<enum 'Status'> True
[<Status.DRAFT: 'draft'>, <Status.PUBLISHED: 'published'>, <Status.ARCHIVED: 'archived'>]
['draft', 'published', 'archived']
3
```

Розходження в тому, що таке `Status.DRAFT`. У TS рядковий enum у рантаймі це звичайний об'єкт, і `Status.Draft` повертає сам рядок `"draft"`. У Python `Status.DRAFT` це окремий об'єкт типу `Status`, а рядок лежить у нього в `.value`. Сам клас iterable: `for s in Status` обходить членів у порядку оголошення, тому `Object.values(Status)` тут це `list(Status)`, а `len(Status)` дає кількість членів.

Знайти члена можна двома шляхами, і обидва явні. Виклик класу `Status("published")` шукає за значенням: саме так рядок з JSON перетворюється на члена. Квадратні дужки `Status["ARCHIVED"]` шукають за ім'ям. Невідоме значення дає `ValueError`, невідоме ім'я `KeyError`. Оператор `in` на класі з 3.12 приймає і члена, і сире значення.

```python
print(Status("published"))
print(Status["ARCHIVED"])
print(Status.DRAFT in Status, "draft" in Status, "DRAFT" in Status)
Status("deleted")
```

```text
Status.PUBLISHED
Status.ARCHIVED
True True False
ValueError: 'deleted' is not a valid Status
```

> **Під капотом.** Клас `Status` створює метаклас (metaclass, офіційний термін: клас, екземпляри якого самі є класами) `EnumType`, до 3.11 він називався `EnumMeta`. Коли виконується тіло класу, `EnumType` один раз створює по екземпляру на кожне присвоєння і складає їх у словник `_value2member_map_`. Тому `Status("draft")` не конструктор, а пошук у цьому словнику: нових об'єктів після оголошення класу не з'являється ніколи.

З цього випливає, що кожен член існує в одному екземплярі (singleton, загальний термін патернів, не специфічний для Python). Порівнювати можна і через `is`, і через `==`; хеш стабільний, тому члени працюють як ключі словника й елементи множини. Перепризначити члена чи його `.value` не можна.

```python live
from enum import Enum

class Status(Enum):
    DRAFT = "draft"
    PUBLISHED = "published"

a = Status("draft")
b = Status["DRAFT"]
print(a is b is Status.DRAFT, a == Status.DRAFT)
print(Status._value2member_map_)

labels = {Status.DRAFT: "Чернетка", Status.PUBLISHED: "Опубліковано"}
print(labels[Status("published")])

try:
    Status.DRAFT = "x"
except AttributeError as e:
    print("AttributeError:", e)
```

```text
True True
{'draft': <Status.DRAFT: 'draft'>, 'published': <Status.PUBLISHED: 'published'>}
Опубліковано
AttributeError: cannot reassign member 'DRAFT'
```

<!-- task: q1 -->

<!-- task: t1 -->

## StrEnum і IntEnum: член, який водночас рядок або число

Звичайний `Enum` з рядковими значеннями не є рядком. Для JS-розробника це найнеочікуваніше місце уроку, бо в TS рядковий enum у рантаймі і є рядком.

> **Пастка.** `Status.DRAFT == "draft"` для звичайного `Enum` дає `False` без жодної помилки: члени порівнюються лише між собою. Так само `json.dumps` не знає, що робити з членом, а f-рядок підставляє `Status.DRAFT` замість `draft`. Перевірка `if job.status == "done"` у такому коді мовчки ніколи не спрацює.

```python
import json
from enum import Enum

class Plain(Enum):
    DRAFT = "draft"

print(Plain.DRAFT == "draft", Plain.DRAFT.value == "draft")
print(f"status={Plain.DRAFT}")
json.dumps({"status": Plain.DRAFT})
```

```text
False True
status=Plain.DRAFT
TypeError: Object of type Plain is not JSON serializable
```

`StrEnum` (з 3.11) наслідує водночас `str` і `Enum`. Член лишається членом, з `.name`, `.value`, методами класу й закритим набором, але при цьому він справжній рядок: дорівнює `"draft"`, має методи `str`, серіалізується в JSON як рядок, у f-рядку дає значення, і пошук у словнику з рядковими ключами його знаходить.

```python live
import json
from enum import StrEnum

class Status(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"

print(Status.DRAFT == "draft", isinstance(Status.DRAFT, str), Status.DRAFT.upper())
print(f"status={Status.DRAFT}", repr(Status.DRAFT))
print(json.dumps({"status": Status.DRAFT}))
print({"draft": 1}[Status.DRAFT])
```

```text
True True DRAFT
status=draft <Status.DRAFT: 'draft'>
{"status": "draft"}
1
```

Тому статуси, типи елементів і будь-які інші значення, що їздять у JSON-API, описують через `StrEnum`. Дані перетинають межу процесу рядками: JSON, query-параметри, колонка в БД, ключ у Redis. `StrEnum` дозволяє віддати члена в кожне з цих місць без `.value`, а всередині коду мати закритий набір з методами. Звичайний `Enum` лишається для станів, які не виходять за межі процесу і значення яких нічого не означають (там зазвичай `auto()`, про нього нижче).

> **Пастка.** У коді до 3.11 замість `StrEnum` писали `class Status(str, Enum)`. Порівняння з рядком і `json.dumps` там працюють, але з 3.11 `format()` і f-рядок для такого класу дають `Status.DRAFT`, а не значення. Код, що збирав URL чи SQL через f-рядок, після оновлення Python почав підставляти ім'я класу. `StrEnum` цієї пастки не має, бо явно перевизначає `__str__` і `__format__`.

```python
from enum import Enum

class Old(str, Enum):
    DRAFT = "draft"

print(Old.DRAFT == "draft", f"{Old.DRAFT}", Old.DRAFT.value)
```

```text
True Old.DRAFT draft
```

<!-- task: q2 -->

`IntEnum` робить те саме для `int`: член порівнюється з числами, сортується разом з ними, працює як індекс і серіалізується в JSON числом. Його беруть для пріоритетів, HTTP-кодів, числових протоколів, які вже існують. Обидва, `StrEnum` і `IntEnum`, наслідують `ReprEnum`: `repr` лишається enum-овим, а `str` і `format` беруться від базового типу.

```python
import json
from enum import IntEnum

class Priority(IntEnum):
    LOW = 1
    NORMAL = 2
    HIGH = 3

print(Priority.HIGH == 3, Priority.HIGH > Priority.LOW, Priority.LOW + 1)
print(sorted([3, Priority.LOW, 2]))
print(f"{Priority.HIGH}", json.dumps({"p": Priority.HIGH}))
```

```text
True True 2
[<Priority.LOW: 1>, 2, 3]
3 {"p": 3}
```

## `auto()`, аліаси і `@unique`

`auto()` просить клас самому обчислити значення. Обчислює його метод `_generate_next_value_`, і в різних базових класах він різний: `Enum` рахує цілі числа з 1 (не з 0, як числовий enum у TS), `IntEnum` продовжує від останнього значення, а `StrEnum` бере ім'я члена малими літерами. Для `StrEnum` це найкорисніше: `INPUT = auto()` дає рівно той рядок, що в JSON.

```python live
from enum import Enum, IntEnum, StrEnum, auto

class Step(Enum):
    START = auto()
    MIDDLE = auto()
    END = auto()

class ElementType(StrEnum):
    INPUT = auto()
    TEXT = auto()
    BUTTON = auto()

class Code(IntEnum):
    A = 10
    B = auto()

print([m.value for m in Step])
print([m.value for m in ElementType])
print([m.value for m in Code])
```

```text
[1, 2, 3]
['input', 'text', 'button']
[10, 11]
```

Правило генерації можна замінити, оголосивши власний `_generate_next_value_` як `@staticmethod`. Оголошувати його треба до членів, бо `auto()` обчислюється в момент присвоєння; пізніше оголошення дає `TypeError: _generate_next_value_ must be defined before members`.

```python
from enum import Enum, auto

class Event(Enum):
    @staticmethod
    def _generate_next_value_(name, start, count, last_values):
        return name.lower().replace("_", ".")

    FORM_CREATED = auto()
    FORM_PUBLISHED = auto()

print([e.value for e in Event])
```

```text
['form.created', 'form.published']
```

<!-- task: q3 -->

Друге ім'я з тим самим значенням не стає новим членом: це аліас (alias, офіційний термін документації), який вказує на першого. Пошук за значенням повертає першого, `list()` аліасів не показує, а `__members__` показує всі імена. Аліаси корисні при перейменуванні: старе ім'я лишається працювати, поки код мігрує. Якщо однакові значення в класі означають помилку копіювання, декоратор `@unique` перетворює їх на `ValueError` при оголошенні класу.

```python
from enum import Enum, unique

class Status(Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    LIVE = "published"

print(Status.LIVE, Status.LIVE is Status.PUBLISHED)
print(list(Status))
print(list(Status.__members__))

@unique
class Strict(Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    LIVE = "published"
```

```text
Status.PUBLISHED True
[<Status.DRAFT: 'draft'>, <Status.PUBLISHED: 'published'>]
['DRAFT', 'PUBLISHED', 'LIVE']
ValueError: duplicate values found in <enum 'Strict'>: LIVE -> PUBLISHED
```

<!-- task: t2 -->

## Методи, властивості й члени з даними

Enum це повноцінний клас, тож у нього бувають методи, `@property` і `@classmethod`, а `self` у методі це конкретний член. Членом стає лише присвоєння звичайного значення; функції, властивості й декоровані методи є дескрипторами (descriptor, офіційний термін, детально в m4-l03) і членами не стають. Логіка, яка в TS розповзається по `switch`-ах у різних файлах, тут живе поруч зі значеннями.

```python live
from enum import StrEnum, auto

class ElementType(StrEnum):
    INPUT = auto()
    TEXT = auto()
    BUTTON = auto()
    BLOCK = auto()

    @property
    def is_container(self) -> bool:
        return self is ElementType.BLOCK

    def label(self) -> str:
        return self.name.capitalize()

    @classmethod
    def containers(cls) -> list["ElementType"]:
        return [t for t in cls if t.is_container]

print(ElementType.BLOCK.is_container, ElementType("input").is_container)
print(ElementType.BUTTON.label())
print(ElementType.containers())
```

```text
True False
Button
[<ElementType.BLOCK: 'block'>]
```

> **Пастка.** Довідкова таблиця в тілі класу, наприклад `TRANSITIONS = {...}`, теж присвоєння звичайного значення, тож вона стає членом. У `Enum` вона мовчки з'явиться в `list(JobStatus)`, у `StrEnum` клас не оголоситься взагалі. Такі таблиці тримають на рівні модуля, поруч з класом.

```python
from enum import Enum, StrEnum

class Loose(Enum):
    QUEUED = "queued"
    TRANSITIONS = {"queued": ["running"]}

print(list(Loose))

class JobStatus(StrEnum):
    QUEUED = "queued"
    TRANSITIONS = {"queued": ["running"]}
```

```text
[<Loose.QUEUED: 'queued'>, <Loose.TRANSITIONS: {'queued': ['running']}>]
TypeError: {'queued': ['running']} is not a string
```

Члену можна дати кілька полів даних: значенням робиться кортеж, а `__init__` класу отримує його розпакованим і розкладає по атрибутах. Значенням члена при цьому лишається весь кортеж, тому пошук за одним полем треба писати самому, зазвичай як `@classmethod`.

```python live
from enum import Enum

class InputKind(Enum):
    TEXT = ("text", str)
    NUMBER = ("number", int)

    def __init__(self, html_type: str, py_type: type) -> None:
        self.html_type = html_type
        self.py_type = py_type

    @classmethod
    def from_html(cls, html_type: str) -> "InputKind":
        for kind in cls:
            if kind.html_type == html_type:
                return kind
        raise ValueError(f"unknown html type: {html_type!r}")

print(InputKind.NUMBER.value)
print(InputKind.NUMBER.html_type, InputKind.NUMBER.py_type("42") + 1)
print(InputKind.from_html("text"))
```

```text
('number', <class 'int'>)
number 43
InputKind.TEXT
```

`Flag` призначений для бітових прапорців: `auto()` дає степені двійки, члени комбінуються через `|`, перевірка через `in`, а ітерація по комбінації з 3.11 віддає лише встановлені біти. Комбінацію можна оголосити як члена, і вона, як аліас, не потрапить у `list()`. `IntFlag` те саме, але члени ще й `int`: порівнюються з числами й друкуються числом, тоді як член `Flag` числу не дорівнює.

```python live
from enum import Flag, IntFlag, auto

class Perm(Flag):
    READ = auto()
    WRITE = auto()
    PUBLISH = auto()
    EDITOR = READ | WRITE

print([p.value for p in Perm])
granted = Perm.READ | Perm.PUBLISH
print(granted, Perm.WRITE in granted, Perm.READ in granted)
print(list(granted))
print(Perm.EDITOR.value, list(Perm.EDITOR))

class Mode(IntFlag):
    R = 4
    W = 2

print(Mode.R | Mode.W, (Mode.R | Mode.W) == 6, Perm.READ == 1)
```

```text
[1, 2, 4]
Perm.READ|PUBLISH False True
[<Perm.READ: 1>, <Perm.PUBLISH: 4>]
3 [<Perm.READ: 1>, <Perm.WRITE: 2>]
6 True False
```

<!-- task: t3 -->

## TS enum, union of literals і `Literal` проти Enum

У TS навколо enum склалася окрема культура обережності. Числовий enum компілюється в об'єкт з reverse mapping: `Status[0] === "Draft"`, і `Object.values` віддає і імена, і числа впереміш. `const enum` інлайниться і зникає з бандла, але ламається з `isolatedModules` і в бібліотеках. Тому типова порада звучить як "не беріть enum, беріть union рядкових літералів, а для списку значень у рантаймі об'єкт `as const`".

```ts
enum Step { Start, Middle }
console.log(Step[0], Object.values(Step)); // "Start" ["Start", "Middle", 0, 1]

const ElementType = { Input: "input", Block: "block" } as const;
type ElementType = (typeof ElementType)[keyof typeof ElementType]; // "input" | "block"
```

```python
from enum import Enum, StrEnum, auto
from typing import Literal

class Step(Enum):
    START = auto()
    MIDDLE = auto()

print(Step(1), Step["START"], list(Step))

class ElementType(StrEnum):
    INPUT = auto()
    BLOCK = auto()

type ElementTypeLiteral = Literal["input", "block"]
```

```text
Step.START Step.START [<Step.START: 1>, <Step.MIDDLE: 2>]
```

У Python цієї дилеми в такій формі немає. Reverse mapping не змішаний з членами: пошук за значенням і за ім'ям це два окремі явні виклики, а ітерація дає лише членів. Zero-cost enum, як `const enum`, теж немає: `Enum` завжди рантайм-об'єкт з методами. Роль union of literals виконує `Literal` з m2-l06, який у рантаймі нічого не створює і читається лише чекером та Pydantic.

Правило вибору таке. `Literal` для локального набору значень одного параметра, для тегів discriminated union і там, де дані лишаються звичайними рядками та словниками. `StrEnum` для доменного поняття, яке зустрічається в багатьох модулях, має поведінку (методи, переходи станів), або чий список значень потрібен у рантаймі для повідомлення про помилку чи випадного списку в UI. Різниця видна й у mypy: функція, що приймає `JobStatus`, відкидає рядок `"done"` навіть тоді, коли в рантаймі він би спрацював; `Literal` той самий рядок приймає. Перевірка вичерпності через `assert_never` працює для Enum так само, як для `Literal`.

```python
from enum import StrEnum
from typing import Literal, assert_never


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


def describe(status: JobStatus) -> str:
    match status:
        case JobStatus.QUEUED:
            return "waiting for a worker"
        case JobStatus.RUNNING:
            return "rendering"
        case JobStatus.DONE:
            return "finished"
        case _:
            assert_never(status)


Theme = Literal["light", "dark"]


def set_theme(theme: Theme) -> None: ...


describe("done")
set_theme("dark")
```

```text
$ mypy --strict statuses.py
statuses.py:21: error: Argument 1 to "assert_never" has incompatible type "Literal[JobStatus.FAILED]"; expected "Never"  [arg-type]
statuses.py:30: error: Argument 1 to "describe" has incompatible type "str"; expected "JobStatus"  [arg-type]
Found 2 errors in 1 file (checked 1 source file)
```

## Enum у `match`, dataclass і Pydantic

`case JobStatus.DONE:` це value pattern з m1-l05: ім'я з крапкою порівнюється через `==`, а не захоплює значення. Там цей механізм показано на звичайному класі-просторі імен, Enum додає закритий набір і перевірку вичерпності. Оскільки `StrEnum` дорівнює своєму рядку, такий `match` збігається і з сирим `"done"`.

```python live
from enum import StrEnum

class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"

def describe(status: JobStatus) -> str:
    match status:
        case JobStatus.QUEUED:
            return "waiting for a worker"
        case JobStatus.RUNNING:
            return "rendering"
        case JobStatus.DONE | JobStatus.FAILED:
            return "finished"

print(describe(JobStatus.RUNNING))
print(describe(JobStatus("failed")))
print(describe("done"))
```

```text
rendering
finished
finished
```

Dataclass анотацію не перевіряє (m2-l05), тому поле `status: JobStatus` спокійно прийме будь-який рядок, і помилка виявиться далеко від місця, де вона сталася. Сирі дані на межі перетворюються явно, через `JobStatus(raw)`, який сам кине `ValueError` на невідомому значенні.

```python
from dataclasses import dataclass
from enum import StrEnum

class JobStatus(StrEnum):
    QUEUED = "queued"
    DONE = "done"

@dataclass
class Job:
    id: str
    status: JobStatus = JobStatus.QUEUED

bad = Job("j2", status="finished")
print(bad, type(bad.status).__name__)
print(Job("j3", status=JobStatus("done")))
```

```text
Job(id='j2', status='finished') str
Job(id='j3', status=<JobStatus.DONE: 'done'>)
```

Pydantic перевіряє Enum-поле за значенням: вхідний `"running"` стає членом `JobStatus.RUNNING`, ім'я `"RUNNING"` не підходить, а помилка перелічує допустимі значення. Усередині моделі лежить член, тому `model_dump()` повертає членів, а `model_dump(mode="json")` і `model_dump_json()` значення. Це працює і для звичайного `Enum` з числами. Якщо членів у моделі не хочеться взагалі, `ConfigDict(use_enum_values=True)` зберігає одразу значення, але тоді втрачаються методи на полі.

```python live
from enum import Enum, StrEnum
from pydantic import BaseModel, ConfigDict, ValidationError

class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"

class Priority(Enum):
    LOW = 1
    HIGH = 2

class Job(BaseModel):
    id: str
    status: JobStatus = JobStatus.QUEUED
    priority: Priority = Priority.LOW

job = Job.model_validate({"id": "j1", "status": "running", "priority": 2})
print(repr(job.status), repr(job.priority))
print(job.model_dump())
print(job.model_dump(mode="json"))
print(job.model_dump_json())
try:
    Job.model_validate({"id": "j2", "status": "RUNNING"})
except ValidationError as e:
    err = e.errors(include_url=False)[0]
    print(err["type"], "|", err["loc"], "|", err["msg"])

class FlatJob(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    status: JobStatus

print(repr(FlatJob(status="done").status))
```

```text
<JobStatus.RUNNING: 'running'> <Priority.HIGH: 2>
{'id': 'j1', 'status': <JobStatus.RUNNING: 'running'>, 'priority': <Priority.HIGH: 2>}
{'id': 'j1', 'status': 'running', 'priority': 2}
{"id":"j1","status":"running","priority":2}
enum | ('status',) | Input should be 'queued', 'running' or 'done'
'done'
```

> **Пастка.** `model_dump()` без `mode="json"` віддає членів, а не рядки. Для `StrEnum` це зазвичай непомітно, бо член і є рядком, але для звичайного `Enum` результат далі не піде в `json.dumps`. Для відповіді API беріть `model_dump_json()` або `mode="json"`.

## Для капстоуну

У капстоуні рядкові константи з модуля 2 стають двома enum без нових модулів: `ElementType(StrEnum)` з `auto()` для `input`, `text`, `button`, `block` лягає в `formbuilder/domain.py` (його імпортують і dataclass, і Pydantic-моделі в `config.py`), а `JobStatus(StrEnum)` для черги рендеру з методом `can_transition_to` у `formbuilder/jobs.py` поруч з `GenerationJob` з m4-l01. Таблиця переходів живе на рівні модуля, бо в тілі `StrEnum` вона б стала членом. Моделі з m2-l09 при цьому не переписуються, змінюються лише теги: `Literal["input"]` стає `Literal[ElementType.INPUT]`, і discriminated union працює так само, а `model_dump_json()` віддає той самий JSON.

```python live
from enum import StrEnum, auto
from typing import Annotated, Literal
from pydantic import BaseModel, Field, ValidationError

class ElementType(StrEnum):
    INPUT = auto()
    TEXT = auto()
    BUTTON = auto()
    BLOCK = auto()

class Input(BaseModel):
    type: Literal[ElementType.INPUT]
    name: str

class Text(BaseModel):
    type: Literal[ElementType.TEXT]
    content: str

Element = Annotated[Input | Text, Field(discriminator="type")]

class Form(BaseModel):
    elements: list[Element]

form = Form.model_validate({"elements": [
    {"type": "input", "name": "email"},
    {"type": "text", "content": "Hi"},
]})
print([type(e).__name__ for e in form.elements])
print(repr(form.elements[0].type), form.elements[0].type == "input")
print(form.model_dump_json())
try:
    Form.model_validate({"elements": [{"type": "slider"}]})
except ValidationError as e:
    err = e.errors(include_url=False)[0]
    print(err["type"], "|", err["msg"])
```

```text
['Input', 'Text']
<ElementType.INPUT: 'input'> True
{"elements":[{"type":"input","name":"email"},{"type":"text","content":"Hi"}]}
union_tag_invalid | Input tag 'slider' found using 'type' does not match any of the expected tags: <ElementType.INPUT: 'input'>, <ElementType.TEXT: 'text'>
```

Виграш у тому, що `ElementType` тепер один на весь проєкт: рендерер у `match` пише `case ElementType.BLOCK:`, валідатор бере `list(ElementType)` для повідомлень, а опечатка `ElementType.BLOK` падає з `AttributeError` одразу, тоді як `"blok"` у `Literal` ловить лише mypy. Ціна видна в останньому рядку: повідомлення про невідомий тег показує `repr` членів, і якщо цей текст іде клієнту, його варто переформулювати у власному обробнику помилок (m7-l02).

<!-- task: t4 -->

## Типові помилки JS-розробника

1. **Об'єкт `as const` як enum.** Переносять `const Status = {DRAFT: "draft"}` словником або класом з атрибутами. Набір не закритий, ітерація дає ключі, методів і перевірки за значенням немає. Правильно: `StrEnum`.

   ```python
   STATUS = {"DRAFT": "draft", "DONE": "done"}   # за звичкою
   class Status(StrEnum):                         # правильно
       DRAFT = auto()
       DONE = auto()
   ```

2. **Порівняння звичайного `Enum` з рядком.** `if job.status == "done"` для `class Status(Enum)` завжди `False`, без помилки. Правильно: `StrEnum` для значень, що приходять рядками, або порівняння з членом.

   ```python
   Plain.DONE == "done"       # False
   job.status is Status.DONE  # порівняння з членом
   ```

3. **Очікування, що `auto()` дає 0, 1, 2.** Звичка з числового enum у TS. `Enum` рахує з 1, а `StrEnum` взагалі дає ім'я малими літерами. Правильно: для значень, що потрапляють у JSON чи БД, писати їх явно або брати `StrEnum`, де `auto()` передбачуваний.

   ```python
   class Step(Enum):
       START = auto()      # 1, а не 0
   class Kind(StrEnum):
       INPUT = auto()      # "input"
   ```

4. **`Object.values(Enum)` через `.__members__` чи `vars()`.** Шукають аналог і дістають словник з аліасами або службові атрибути. Правильно: `list(Status)` для членів, `[s.value for s in Status]` для значень.

   ```python
   allowed = ", ".join(s.value for s in Status)
   ```

5. **`class Status(str, Enum)` з коду до 3.11.** Копіюють зі старих відповідей; f-рядок з 3.11 підставляє `Status.DONE` замість `done`. Правильно: `StrEnum`.

   ```python
   f"{Old.DRAFT}"     # 'Old.DRAFT'
   f"{Status.DRAFT}"  # 'draft' для StrEnum
   ```

6. **Таблиця або константа в тілі Enum.** `TRANSITIONS = {...}` усередині класу стає членом або ламає `StrEnum`. Правильно: таблиця на рівні модуля, доступ з методу.

   ```python
   _TRANSITIONS = {JobStatus.QUEUED: {JobStatus.RUNNING}}
   ```

7. **`Status[value]` для розбору JSON.** Квадратні дужки шукають за ім'ям, як `Status["DRAFT"]`, і на `"draft"` дають `KeyError`. Правильно: `Status("draft")`, виклик шукає за значенням.

   ```python
   Status("draft")   # Status.DRAFT
   Status["draft"]   # KeyError: 'draft'
   ```

## Підсумок

- Enum це клас, екземпляри якого створюються один раз при оголошенні; кожен член має `.name` і `.value`.
- `Status(value)` шукає за значенням (`ValueError`), `Status[name]` за ім'ям (`KeyError`); `list(Status)` це `Object.values`.
- Члени singletons: `is` і `==` рівнозначні, хешуються, працюють як ключі словника.
- Звичайний `Enum` не дорівнює своєму значенню і не серіалізується в JSON; `StrEnum` і `IntEnum` є рядком і числом.
- Для статусів і типів у JSON-API беруть `StrEnum`; `(str, Enum)` застарів і з 3.11 інакше форматується.
- `auto()`: 1, 2, 3 для `Enum`, ім'я малими для `StrEnum`; однакові значення дають аліаси, `@unique` їх забороняє.
- Методи, `property` і `classmethod` на Enum звичні; значення в тілі класу стає членом, тож таблиці виносять на рівень модуля.
- `Literal` для локального набору рядків і тегів, `StrEnum` для доменного поняття з поведінкою і рантайм-списком значень.
- `case Status.DONE:` порівнює через `==`; dataclass Enum-поле не перевіряє; Pydantic валідує за значенням і серіалізує у значення лише в режимі JSON.

## Що далі

Наступний урок m4-l07 про контекстні менеджери: `with`, `__enter__`/`__exit__` і `contextlib.contextmanager`, аналог `try/finally` і `using` з TS 5.2. З цього уроку туди йде звичка тримати поведінку поруч з даними: перевести задачу в `JobStatus.RUNNING` на вході в блок і в `DONE` чи `FAILED` на виході залежно від винятку це рівно та робота, яку зручно сховати в контекстний менеджер у воркері капстоуну.
