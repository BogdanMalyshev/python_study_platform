---
id: m2-l09
module: m2-data-typing
title: "Pydantic v2 як Zod"
summary: "Учень описує JSON-конфіг форми як набір Pydantic-моделей з discriminated union, крос-польовими валідаторами й camelCase-аліасами, і знає, де Pydantic перевіряє дані насправді, а де лише анотує."
duration_min: 90
prerequisites: [m2-l05, m2-l06, m2-l08]
---

## Навіщо Pydantic, якщо є mypy

У m2-l08 ви бачили головну різницю між TS і Python: анотації типів у Python не виконуються. mypy чи pyright перевіряють їх статично, а runtime їх ігнорує. Для внутрішнього коду цього досить: ви контролюєте обидва боки виклику. Для даних ззовні (JSON з фронтенду, тіло HTTP-запиту, конфіг із файлу) статична перевірка не допомагає взагалі, бо на момент перевірки даних ще немає. У TS ви вирішували це Zod: тип `User` існує для компілятора, а `UserSchema.parse(json)` перевіряє реальні байти. Pydantic це той самий шар для Python, і `BaseModel` одночасно є і схемою, і типом.

Порівняйте три способи описати "об'єкт з ім'ям і віком", які ви вже знаєте з m2-l05 і m2-l06, з четвертим.

```python live
from dataclasses import dataclass
from typing import TypedDict
from pydantic import BaseModel, ValidationError

@dataclass
class UserDC:
    name: str
    age: int

class UserTD(TypedDict):
    name: str
    age: int

class User(BaseModel):
    name: str
    age: int

print(UserDC(name="Ann", age="not a number"))
td: UserTD = {"name": "Ann", "age": "not a number"}
print(td)
try:
    User(name="Ann", age="not a number")
except ValidationError as e:
    print(e)
```

```text
UserDC(name='Ann', age='not a number')
{'name': 'Ann', 'age': 'not a number'}
1 validation error for User
age
  Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='not a number', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/int_parsing
```

`dataclass` генерує `__init__` і `__repr__`, але `age: int` для нього лише документація: рядок пройшов. `TypedDict` взагалі не існує в runtime як щось окреме, це звичайний `dict` із підказкою для mypy. `BaseModel` під час `__init__` проганяє кожне поле через валідатор, згенерований з анотації. Звідси правило вибору: `dataclass` для внутрішніх структур, які створює ваш власний код; `TypedDict` для анотування "сирого" dict, який ви не хочете перетворювати; `BaseModel` на кожній межі, через яку приходять чужі дані.

> **Під капотом.** Під час створення класу метаклас `BaseModel` читає анотації й компілює з них схему валідації для pydantic-core, написаного на Rust. Саме тому `User(...)` перевіряє типи, а `UserDC(...)` ні: у dataclass ніхто не генерує код перевірки, а в Pydantic він з'являється в момент визначення класу. Ціна: створення екземпляра `BaseModel` у кілька разів дорожче за dataclass. Для вхідних даних це нічого, для мільйона внутрішніх об'єктів у циклі вже ні.

Тепер відповідність Zod → Pydantic на одній схемі. Ось як ви описали б метадані форми в Zod і як це виглядає в Pydantic.

```ts
const Theme = z.enum(["light", "dark"]);

const FormMeta = z.object({
  id: z.string().min(3),
  title: z.string().max(80),
  theme: Theme.default("light"),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),
});

type FormMeta = z.infer<typeof FormMeta>;
```

```python live
from typing import Literal
from pydantic import BaseModel, Field

Theme = Literal["light", "dark"]

class FormMeta(BaseModel):
    id: str = Field(min_length=3)
    title: str = Field(max_length=80)
    theme: Theme = "light"
    tags: list[str] = []
    description: str | None = None

meta = FormMeta(id="contact", title="Contact us", tags=["lead"])
print(meta)
print(meta.theme, meta.description)
print(meta.id.upper())
```

```text
id='contact' title='Contact us' theme='light' tags=['lead'] description=None
light None
CONTACT
```

Розходження одне, але принципове: у Zod схема і тип це дві сутності, і тип виводиться через `z.infer`. У Pydantic клас `FormMeta` і є типом: його можна писати в анотаціях, mypy бачить поля з їхніми типами, а `meta.id.upper()` автодоповнюється без жодного `infer`. Решта відповідностей механічна: `z.object` → клас, `z.string().min(3)` → `Field(min_length=3)`, `z.number().int().min(0)` → `int = Field(ge=0)`, `z.array(X)` → `list[X]`, `z.union([A, B])` → `A | B`, `z.enum([...])` → `Literal[...]`, `.optional()` → `X | None = None`, `.default(v)` → `= v`.

Для `z.enum` є два варіанти. `Literal["light", "dark"]` найближчий за духом: значення лишається звичайним рядком. `StrEnum` (детально в m4-l06) дає об'єкт `Mode.DARK`, який теж дорівнює `"dark"` і серіалізується в `"dark"`, але в `model_dump()` без режиму JSON ви отримаєте саме enum, а не рядок. Повідомлення про помилку в обох випадках однакове.

```python live
from enum import StrEnum
from typing import Literal
from pydantic import BaseModel, ValidationError

class Mode(StrEnum):
    LIGHT = "light"
    DARK = "dark"

class A(BaseModel):
    mode: Literal["light", "dark"]

class B(BaseModel):
    mode: Mode

print(A(mode="dark").mode, B(mode="dark").mode, B(mode="dark").mode == "dark")
print(repr(B(mode="dark").mode))
for M in (A, B):
    try:
        M(mode="blue")
    except ValidationError as e:
        err = e.errors(include_url=False)[0]
        print(err["type"], "|", err["msg"])
print(B(mode="dark").model_dump(), B(mode="dark").model_dump_json())
```

```text
dark dark True
<Mode.DARK: 'dark'>
literal_error | Input should be 'light' or 'dark'
enum | Input should be 'light' or 'dark'
{'mode': <Mode.DARK: 'dark'>} {"mode":"dark"}
```

> **JS-аналог.** `Field(...)` це місце для всього, що в Zod іде ланцюжком після типу: `min_length`, `max_length`, `pattern`, `ge`/`gt`/`le`/`lt`, `description`, `alias`, `default_factory`. Альтернативний запис `Annotated[str, Field(min_length=3)]` дає те саме, але дозволяє винести обмеження в окремий тип і перевикористати його, як `const Slug = z.string().min(3)` у Zod.

<!-- task: t1 -->

## parse, safeParse і ValidationError

Zod має `parse`, який кидає, і `safeParse`, який повертає `{ success, data | error }`. Pydantic має три способи створити модель, і всі вони кидають `ValidationError`. `safeParse` як окремого методу немає: його роль виконує `try / except`, бо в Python винятки це нормальний control flow (m1-l11).

```python live
from pydantic import BaseModel, Field, ValidationError

class FormMeta(BaseModel):
    id: str = Field(min_length=3)
    title: str = Field(max_length=80)

raw = {"id": "contact", "title": "Contact us"}

a = FormMeta(**raw)
b = FormMeta.model_validate(raw)
c = FormMeta.model_validate_json('{"id": "contact", "title": "Contact us"}')
print(a == b == c)

try:
    FormMeta.model_validate_json('{"id": "contact", "title": "Contact us"')
except ValidationError as e:
    print(e)
```

```text
True
1 validation error for FormMeta
  Invalid JSON: EOF while parsing an object at line 1 column 39 [type=json_invalid, input_value='{"id": "contact", "title": "Contact us"', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/json_invalid
```

`FormMeta(**raw)` це звичайний виклик конструктора з іменованими аргументами: він вимагає `dict` із рядковими ключами (інакше `TypeError: keywords must be strings` ще до валідації) і підходить, коли ви самі збираєте об'єкт у коді. `model_validate(obj)` приймає будь-що, що схоже на дані: dict, інший екземпляр моделі, об'єкт з атрибутами при `from_attributes=True`, і має параметри `strict` та `context`. Це аналог `schema.parse(value)`. `model_validate_json(str_or_bytes)` парсить JSON сам, у Rust, минаючи `json.loads` і проміжний dict: це швидше, а ще помилка синтаксису JSON стає такою самою `ValidationError`, як і помилка типу, тож на межі API вам потрібен лише один `except`.

> **Пастка.** `model_validate` не приймає рядок із JSON: `FormMeta.model_validate('{"title": "x"}')` дає `model_type: Input should be a valid dictionary or instance of FormMeta`. Рядок це рядок, а не dict. Якщо на вході текст, викликайте `model_validate_json`.

`safeParse` пишеться за п'ять рядків, і `e.errors()` повертає список словників, структурно дуже схожий на `error.issues` у Zod.

```ts
const result = FormMeta.safeParse({ id: "x" });
if (!result.success) {
  console.log(result.error.issues);
  // [{ code: "too_small", path: ["id"], message: "..." }, { code: "invalid_type", path: ["title"], ... }]
}
```

```python live
from pydantic import BaseModel, Field, ValidationError

class FormMeta(BaseModel):
    id: str = Field(min_length=3)
    title: str = Field(max_length=80)

def safe_parse(model: type[BaseModel], data: dict):
    try:
        return {"success": True, "data": model.model_validate(data)}
    except ValidationError as e:
        return {"success": False, "errors": e.errors(include_url=False)}

print(safe_parse(FormMeta, {"id": "contact", "title": "Contact us"}))
print(safe_parse(FormMeta, {"id": "x"}))
```

```text
{'success': True, 'data': FormMeta(id='contact', title='Contact us')}
{'success': False, 'errors': [{'type': 'string_too_short', 'loc': ('id',), 'msg': 'String should have at least 3 characters', 'input': 'x', 'ctx': {'min_length': 3}}, {'type': 'missing', 'loc': ('title',), 'msg': 'Field required', 'input': {'id': 'x'}}]}
```

Pydantic, як і Zod, не зупиняється на першій помилці: кожне поле перевіряється незалежно, і `ValidationError` збирає все. Один запис має чотири ключі, які вам знадобляться: `loc` це шлях до поля як кортеж (`('tags', 1)` для другого елемента списку, аналог `path` у Zod), `type` це машинний код помилки (`string_too_short`, `missing`, `int_parsing`; аналог `code`), `msg` текст англійською, `input` саме те значення, що не пройшло. Для обмежень є ще `ctx` з параметрами (`{'min_length': 3}`), з якого можна зібрати власний текст для UI. `include_url=False` прибирає посилання на документацію з кожного запису; без нього в `errors()` є ключ `url`.

```python live
from pydantic import BaseModel, Field, ValidationError

class FormMeta(BaseModel):
    id: str = Field(min_length=3)
    title: str = Field(max_length=80)
    tags: list[str] = []

try:
    FormMeta.model_validate({"id": "x", "tags": ["a", 7]})
except ValidationError as e:
    print(e.error_count())
    for err in e.errors(include_url=False):
        print(err["loc"], err["type"], repr(err["msg"]), repr(err["input"]))
```

```text
3
('id',) string_too_short 'String should have at least 3 characters' 'x'
('title',) missing 'Field required' {'id': 'x', 'tags': ['a', 7]}
('tags', 1) string_type 'Input should be a valid string' 7
```

Перетворити це на відповідь API або на мапу помилок для форми означає згрупувати `msg` за шляхом. `e.json()` віддає той самий список уже серіалізованим, що зручно для 422-відповіді у FastAPI, де саме так і робиться за замовчуванням.

```python live
from pydantic import BaseModel, Field, ValidationError

class FormMeta(BaseModel):
    id: str = Field(min_length=3)
    title: str = Field(max_length=80)
    tags: list[str] = []

def to_api_errors(e: ValidationError) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for err in e.errors():
        path = ".".join(str(part) for part in err["loc"]) or "_root"
        out.setdefault(path, []).append(err["msg"])
    return out

try:
    FormMeta.model_validate({"id": "x", "tags": ["a", 7]})
except ValidationError as e:
    print(to_api_errors(e))
    print(e.json(include_url=False, indent=2))
```

```text
{'id': ['String should have at least 3 characters'], 'title': ['Field required'], 'tags.1': ['Input should be a valid string']}
[
  {
    "type": "string_too_short",
    "loc": [
      "id"
    ],
    "msg": "String should have at least 3 characters",
    "input": "x",
    "ctx": {
      "min_length": 3
    }
  },
  {
    "type": "missing",
    "loc": [
      "title"
    ],
    "msg": "Field required",
    "input": {
      "id": "x",
      "tags": [
        "a",
        7
      ]
    }
  },
  {
    "type": "string_type",
    "loc": [
      "tags",
      1
    ],
    "msg": "Input should be a valid string",
    "input": 7
  }
]
```

> **Пастка.** `loc` це кортеж, навіть для поля верхнього рівня: `('title',)`, а не `'title'`. Порівняння `err["loc"] == "title"` завжди `False`. Або порівнюйте з `("title",)`, або одразу збирайте рядковий шлях через `".".join(...)`, як вище. Помилка `model_validator` на рівні всієї моделі має порожній `loc`, `()`, тому в `to_api_errors` є запасний ключ `_root`.

<!-- task: t2 -->

Тепер про те, що в цих прикладах ховалося за кадром. Zod за замовчуванням строгий: `z.number().parse("42")` кидає, а коерцію треба просити явно через `z.coerce.number()`. Pydantic навпаки: за замовчуванням працює lax-режим, у якому `"42"` стає `42`, `240.0` стає `240`, а `"yes"` стає `True`. Логіка в тому, що JSON і query-рядки приносять числа текстом, і для межі API це зручно. Але lax не означає "будь-що": рядок, який не парситься в ціле, або float з дробовою частиною для `int` все одно відхиляються.

```python live
from pydantic import BaseModel, ValidationError

class Size(BaseModel):
    width: int
    height: int
    visible: bool

print(Size(width="320", height=240.0, visible="yes"))

try:
    Size(width="320px", height=1.5, visible="maybe")
except ValidationError as e:
    for err in e.errors(include_url=False):
        print(err["loc"], err["type"], err["msg"])
```

```text
width=320 height=240 visible=True
('width',) int_parsing Input should be a valid integer, unable to parse string as an integer
('height',) int_from_float Input should be a valid integer, got a number with a fractional part
('visible',) bool_parsing Input should be a valid boolean, unable to interpret input
```

Вимкнути коерцію можна на трьох рівнях: `Field(strict=True)` для одного поля, `model_config = ConfigDict(strict=True)` для всієї моделі, або `strict=True` в конкретному виклику `model_validate`. У strict-режимі `"320"` для `int` дає `int_type`, а не `int_parsing`: Pydantic навіть не намагався парсити. Один нюанс для JSON: у `model_validate_json` strict трохи м'якший за strict для Python-об'єктів, бо JSON не має, наприклад, типу `datetime`, і рядок у форматі ISO для `datetime` приймається навіть у strict. Для `int` і `str` поведінка та сама.

```python live
from pydantic import BaseModel, ConfigDict, Field, ValidationError

class StrictSize(BaseModel):
    model_config = ConfigDict(strict=True)
    width: int
    height: int

class HalfStrict(BaseModel):
    width: int = Field(strict=True)
    height: int

try:
    StrictSize(width="320", height=240)
except ValidationError as e:
    print(e.errors(include_url=False)[0]["type"], e.errors(include_url=False)[0]["msg"])

print(HalfStrict(width=320, height="240"))
try:
    HalfStrict(width="320", height="240")
except ValidationError as e:
    print([err["loc"] for err in e.errors()])

print(StrictSize.model_validate_json('{"width": 320, "height": 240}'))
print(StrictSize.model_validate({"width": 320, "height": 240}, strict=False))
```

```text
int_type Input should be a valid integer
width=320 height=240
[('width',)]
width=320 height=240
width=320 height=240
```

> **Пастка.** `bool` у lax-режимі приймає `"true"`, `"yes"`, `"on"`, `"1"`, `1` і їхні заперечення. Якщо фронтенд надішле `visible: "false"`, Pydantic мовчки зробить `False`, і це правильно. Але він так само прийме `"0"` і `"off"`, тому для полів, де рядок це помилка контракту, ставте `strict=True` на полі. Для конфігу FormBuilder, який приходить із вашого ж TS-коду, строгий режим на булевих і числових полях доречний: коерція ховає баги фронтенду.

<!-- task: q1 -->

## Валідатори: refine, superRefine і значення за замовчуванням

Обмеження з `Field` покривають довжину, діапазон і regex. Все інше, що в Zod іде в `.refine` або `.transform`, у Pydantic робиться декоратором `field_validator`. Він приймає значення після стандартної перевірки типу (режим `after`, за замовчуванням) і має або повернути значення (можливо, змінене), або кинути `ValueError`. Pydantic перехопить `ValueError` і перетворить на запис `ValidationError` з `type='value_error'` і текстом, який ви передали.

```ts
const Condition = z.object({
  field: z.string().transform((s) => s.trim()).refine(isIdentifier, "not a valid field name"),
  operator: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
```

```python live
from pydantic import BaseModel, ValidationError, field_validator

class Condition(BaseModel):
    field: str
    operator: str
    value: str | int | bool

    @field_validator("field")
    @classmethod
    def normalize_field(cls, v: str) -> str:
        v = v.strip()
        if not v.isidentifier():
            raise ValueError(f"{v!r} is not a valid field name")
        return v

print(Condition(field="  country ", operator="eq", value="UA"))
try:
    Condition(field="first name", operator="eq", value="x")
except ValidationError as e:
    print(e.errors(include_url=False)[0]["msg"])
    print(e.errors(include_url=False)[0]["type"])
```

```text
field='country' operator='eq' value='UA'
Value error, 'first name' is not a valid field name
value_error
```

Різниця з Zod у тому, що `transform` і `refine` тут одна функція: валідатор і перевіряє, і повертає нормалізоване значення. Звідси обов'язок написати `return v` наприкінці. Декоратор `@classmethod` під `@field_validator` потрібен, бо функція отримує клас, а не екземпляр: екземпляра ще не існує, він збирається з полів по одному.

Режим `before` запускає функцію до перевірки типу, на сирому вході. Це місце для `z.preprocess`: наприклад, прийняти список тегів як рядок через кому й перетворити на `list[str]` до того, як Pydantic перевірить, що це список рядків.

```python live
from pydantic import BaseModel, field_validator

class Tagged(BaseModel):
    tags: list[str]

    @field_validator("tags", mode="before")
    @classmethod
    def split_csv(cls, v):
        if isinstance(v, str):
            return [part.strip() for part in v.split(",")]
        return v

print(Tagged(tags="lead, newsletter ,promo").tags)
print(Tagged(tags=["a", "b"]).tags)
```

```text
['lead', 'newsletter', 'promo']
['a', 'b']
```

Для правил, які стосуються кількох полів одразу (`min <= max`, "якщо `operator == "in"`, то `value` має бути списком"), потрібен `model_validator(mode="after")`. Він отримує вже зібраний екземпляр і повертає його. Це аналог `.superRefine` на рівні `z.object` або `.refine` на всьому об'єкті. Помилка з нього має порожній `loc`, бо стосується моделі цілком.

```python live
from typing import Self
from pydantic import BaseModel, ValidationError, model_validator

class Range(BaseModel):
    min: int
    max: int

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.min > self.max:
            raise ValueError(f"min ({self.min}) must be <= max ({self.max})")
        return self

print(Range(min=1, max=5))
try:
    Range(min=9, max=5)
except ValidationError as e:
    err = e.errors(include_url=False)[0]
    print(err["loc"], err["msg"])
try:
    Range(min="nine", max=5)
except ValidationError as e:
    print([err["loc"] for err in e.errors()])
```

```text
min=1 max=5
() Value error, min (9) must be <= max (5)
[('min',)]
```

Чому не `field_validator`? У `field_validator` є другий аргумент `info: ValidationInfo`, і в `info.data` лежать уже перевірені поля. Але лише ті, що оголошені вище в класі й пройшли перевірку. Якщо `min` не пройшов, його в `info.data` не буде, і валідатор для `max` мусить це передбачити. Порядок полів стає частиною логіки, і це крихко. `model_validator(mode="after")` взагалі не запускається, поки хоч одне поле не пройшло (зверніть увагу на третій виклик вище: помилка лише `('min',)`, перевірка порядку не стартувала), тому всередині нього всі поля гарантовано валідні.

> **Під капотом.** Порядок виконання для одного поля: `before`-валідатори, потім вбудована перевірка типу й обмежень з `Field`, потім `after`-валідатори. Коли всі поля зібрані, запускаються `model_validator(mode="after")`. Є ще `model_validator(mode="before")`, який отримує сирий dict до всього і підходить, щоб перейменувати застарілі ключі або розгорнути обгортку `{"data": {...}}`.

<!-- task: t3 -->

Значення за замовчуванням задаються як у dataclass: `= value`. Для mutable типів у m1-l07 ви бачили пастку: `def f(tags=[])` ділить один список між усіма викликами. У Pydantic `tags: list[str] = []` безпечний, бо під час створення екземпляра значення за замовчуванням копіюється (deepcopy для mutable типів), і кожен екземпляр отримує свій список. `Field(default_factory=dict)` робить те саме через виклик фабрики й потрібен, коли значення треба обчислити або коли це вкладена модель (`Field(default_factory=Validation)` замість `= Validation()`).

```python live
from pydantic import BaseModel, Field

class Settings(BaseModel):
    tags: list[str] = []
    props: dict[str, str] = Field(default_factory=dict)

a = Settings()
b = Settings()
a.tags.append("x")
a.props["k"] = "v"
print(a.tags, b.tags)
print(a.props, b.props)
print(a.tags is b.tags)
```

```text
['x'] []
{'k': 'v'} {}
False
```

<!-- task: q3 -->

## Дерево елементів: вкладені моделі, рекурсія, discriminated union

Поле з типом іншої моделі валідує вкладений dict рекурсивно, а `loc` у помилці стає шляхом з кількох елементів. Це те саме, що вкладений `z.object` у Zod.

```python live
from pydantic import BaseModel, Field, ValidationError

class Validation(BaseModel):
    required: bool = False
    min_length: int | None = Field(default=None, ge=0)
    pattern: str | None = None

class InputElement(BaseModel):
    name: str
    label: str
    validation: Validation = Field(default_factory=Validation)

el = InputElement.model_validate({
    "name": "email",
    "label": "Email",
    "validation": {"required": True, "pattern": r"^\S+@\S+$"},
})
print(el.validation.required, el.validation.min_length)
print(InputElement(name="phone", label="Phone").validation)

try:
    InputElement.model_validate({"name": "age", "label": "Age", "validation": {"min_length": -1}})
except ValidationError as e:
    err = e.errors(include_url=False)[0]
    print(err["loc"], err["msg"])
```

```text
True None
required=False min_length=None pattern=None
('validation', 'min_length') Input should be greater than or equal to 0
```

Рекурсивна структура (блок, що містить блоки) описується посиланням на ще не визначене ім'я в лапках: `list["Block"]`. У Zod для цього потрібен `z.lazy(() => Block)` і ручна анотація типу, бо `infer` не вміє в рекурсію. Pydantic розв'язує forward reference сам, коли клас повністю визначений.

```python live
from pydantic import BaseModel

class Block(BaseModel):
    name: str
    children: list["Block"] = []

tree = Block.model_validate({
    "name": "root",
    "children": [
        {"name": "left", "children": [{"name": "leaf"}]},
        {"name": "right"},
    ],
})
print(tree.children[0].children[0].name)
print(type(tree.children[1]).__name__)
```

```text
leaf
Block
```

Справжнє дерево форми неоднорідне: у списку `children` лежать елементи різних типів. Перша спроба це звичайний union `Input | Text | Button | Block`. Pydantic у "smart"-режимі спробує кожен варіант і візьме найкращий збіг, але на невалідних даних видасть помилки для кожного варіанту окремо, і їх буде п'ять там, де проблема одна.

```python live
from typing import Literal
from pydantic import BaseModel, ValidationError

class Input(BaseModel):
    type: Literal["input"]
    name: str
    label: str

class Text(BaseModel):
    type: Literal["text"]
    content: str

class Button(BaseModel):
    type: Literal["button"]
    label: str

class PlainForm(BaseModel):
    elements: list[Input | Text | Button]

try:
    PlainForm.model_validate({"elements": [{"type": "input", "name": "email"}]})
except ValidationError as e:
    print(e.error_count())
    for err in e.errors(include_url=False):
        print(err["loc"], err["msg"])
```

```text
5
('elements', 0, 'Input', 'label') Field required
('elements', 0, 'Text', 'type') Input should be 'text'
('elements', 0, 'Text', 'content') Field required
('elements', 0, 'Button', 'type') Input should be 'button'
('elements', 0, 'Button', 'label') Field required
```

Discriminated union, аналог `z.discriminatedUnion("type", [...])`, каже Pydantic: спершу подивись на поле `type`, вибери за ним одну модель і валідуй лише її. Оголошується через `Annotated[A | B | C, Field(discriminator="type")]`, а поле `type` у кожній моделі має бути `Literal` з одним значенням. Результат: одна точна помилка замість п'яти, зрозуміле повідомлення для невідомого тегу, і швидша валідація, бо не перебираються всі варіанти.

```python live
from typing import Annotated, Literal
from pydantic import BaseModel, Field, ValidationError

class Input(BaseModel):
    type: Literal["input"]
    name: str
    label: str

class Text(BaseModel):
    type: Literal["text"]
    content: str

class Button(BaseModel):
    type: Literal["button"]
    label: str
    action: Literal["submit", "next", "reset"] = "submit"

class Block(BaseModel):
    type: Literal["block"]
    children: list["Element"] = []

Element = Annotated[Input | Text | Button | Block, Field(discriminator="type")]

class Form(BaseModel):
    elements: list[Element]

form = Form.model_validate({"elements": [
    {"type": "text", "content": "Hello"},
    {"type": "block", "children": [{"type": "input", "name": "email", "label": "Email"}]},
    {"type": "button", "label": "Send"},
]})
print([type(e).__name__ for e in form.elements])
print(form.elements[1].children[0].name)

try:
    Form.model_validate({"elements": [{"type": "input", "name": "email"}]})
except ValidationError as e:
    for err in e.errors(include_url=False):
        print(err["loc"], err["msg"])

try:
    Form.model_validate({"elements": [{"type": "image", "src": "x.png"}]})
except ValidationError as e:
    for err in e.errors(include_url=False):
        print(err["loc"], err["msg"])
```

```text
['Text', 'Block', 'Button']
email
('elements', 0, 'input', 'label') Field required
('elements', 0) Input tag 'image' found using 'type' does not match any of the expected tags: 'input', 'text', 'button', 'block'
```

Зверніть увагу на `loc`: у ньому з'явився тег `'input'`, тобто шлях каже не тільки де помилка, а й яку гілку union Pydantic вибрав. `Block` посилається на `"Element"` у лапках, хоча `Element` визначений нижче: forward reference працює й для аліасів типу, головне, щоб ім'я існувало в модулі на момент першої валідації. Після `model_validate` у вас справжні екземпляри `Input`, `Block` тощо, і `isinstance(el, Block)` або `match el: case Block(children=...)` з m1-l05 працюють як narrowing за `type` у TS.

> **Для капстоуну.** Саме так описується дерево елементів FormBuilder: `Element` як discriminated union за `type`, `Block.children: list[Element]`, умови видимості як окрема модель `{field, operator, value}`. Фінальне завдання цього уроку збирає це в `FormConfig`, і цей модуль поїде в капстоун без змін.

## Серіалізація, аліаси, зайві поля, JSON Schema

У зворотний бік модель перетворюється двома методами. `model_dump()` повертає `dict` із Python-об'єктами всередині (enum лишається enum, `datetime` лишається `datetime`). `model_dump_json()` повертає рядок JSON, уже з усіма перетвореннями. Обидва приймають `include`, `exclude`, `exclude_none`, `exclude_unset`, `by_alias`. Аналог у Zod відсутній: там результат `parse` це вже plain object, який просто йде в `JSON.stringify`.

```python live
from pydantic import BaseModel

class Meta(BaseModel):
    id: str
    title: str

m = Meta(id="contact", title="Contact")
print(m.model_dump())
print(m.model_dump_json())
print(type(m.model_dump()).__name__, type(m.model_dump_json()).__name__)
print(m.model_dump(exclude={"id"}))
print(m.model_dump(include={"id"}))
```

```text
{'id': 'contact', 'title': 'Contact'}
{"id":"contact","title":"Contact"}
dict str
{'title': 'Contact'}
{'id': 'contact'}
```

Фронтенд шле camelCase, Python-код живе в snake_case. Pydantic розв'язує це аліасами: `alias_generator=to_camel` у `model_config` генерує для кожного поля JSON-ім'я, `validate_by_name=True` дозволяє також передавати snake_case із Python-коду, а `by_alias=True` при dump повертає camelCase назад. Три прапорці, які варто ставити разом для моделей на межі з фронтендом.

```python live
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class Validation(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, validate_by_alias=True)
    required: bool = False
    min_length: int | None = None
    max_length: int | None = None

v = Validation.model_validate({"required": True, "maxLength": 80})
print(v)
print(v.model_dump())
print(v.model_dump(by_alias=True))
print(v.model_dump(by_alias=True, exclude_none=True))
print(v.model_dump_json(by_alias=True, exclude_none=True))
print(Validation(min_length=3).model_dump(by_alias=True, exclude_none=True))
```

```text
required=True min_length=None max_length=80
{'required': True, 'min_length': None, 'max_length': 80}
{'required': True, 'minLength': None, 'maxLength': 80}
{'required': True, 'maxLength': 80}
{"required":true,"maxLength":80}
{'required': False, 'minLength': 3}
```

У старих прикладах і статтях ви побачите `populate_by_name=True`: це попередня назва `validate_by_name`, вона досі працює. Якщо не хочеться щоразу писати `by_alias=True`, є `serialize_by_alias=True` у тому самому `ConfigDict`: тоді `model_dump()` і `model_dump_json()` віддають camelCase за замовчуванням.

```python live
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class Old(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    min_length: int | None = None

print(Old(min_length=3), Old.model_validate({"minLength": 4}))

class New(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, serialize_by_alias=True)
    min_length: int | None = None

print(New(min_length=3).model_dump())
print(New(min_length=3).model_dump_json())
```

```text
min_length=3 min_length=4
{'minLength': 3}
{"minLength":3}
```

> **Пастка.** З `alias_generator` без `validate_by_name` модель приймає лише аліас. Якщо передати `{"min_length": 3}`, помилки не буде: ключ `min_length` вважається зайвим і мовчки ігнорується, а поле отримує значення за замовчуванням `None`. Це найтихіший баг у цій темі, і проти нього два запобіжники: `validate_by_name=True` і `extra="forbid"`, про який далі.

<!-- task: t4 -->

Зайві ключі на вході. Zod за замовчуванням їх викидає (`.strip()`), `.strict()` кидає помилку, `.passthrough()` зберігає. Pydantic має ту саму трійку в `model_config`: `extra="ignore"` за замовчуванням, `extra="forbid"` і `extra="allow"`, при якому зайві поля доступні через `model_extra` і потрапляють у `model_dump()`.

```python live
from pydantic import BaseModel, ConfigDict, ValidationError

class Ignore(BaseModel):
    name: str

class Forbid(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str

class Allow(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str

raw = {"name": "email", "placeholder": "you@example.com"}
print(Ignore.model_validate(raw))
try:
    Forbid.model_validate(raw)
except ValidationError as e:
    err = e.errors(include_url=False)[0]
    print(err["loc"], err["type"], err["msg"])
a = Allow.model_validate(raw)
print(a)
print(a.model_extra)
print(a.model_dump())
```

```text
name='email'
('placeholder',) extra_forbidden Extra inputs are not permitted
name='email' placeholder='you@example.com'
{'placeholder': 'you@example.com'}
{'name': 'email', 'placeholder': 'you@example.com'}
```

Для конфігу FormBuilder правильний вибір `forbid`: якщо фронтенд додав елементу новий проп, який бекенд не знає, краще впасти на валідації, ніж мовчки втратити дані при збереженні. Для вебхуків від сторонніх сервісів навпаки `ignore` або `allow`.

<!-- task: q2 -->

Останнє, чого Zod не вміє з коробки, а Pydantic уміє: `model_json_schema()` генерує JSON Schema з моделі. Це той контракт, який ви раніше проєктували руками й віддавали бекенду. Тепер він виводиться з коду і не розходиться з ним: схему можна покласти в репозиторій фронтенду, згенерувати з неї TS-типи (`json-schema-to-typescript`) і валідувати конфіг у редакторі форм ще до відправлення. У FastAPI з тих самих схем збирається OpenAPI-документація.

```python live
import json
from typing import Literal
from pydantic import BaseModel, Field

class Condition(BaseModel):
    field: str
    operator: Literal["eq", "neq", "in"]
    value: str | int | bool | list[str]

print(json.dumps(Condition.model_json_schema(), indent=2))
```

```text
{
  "properties": {
    "field": {
      "title": "Field",
      "type": "string"
    },
    "operator": {
      "enum": [
        "eq",
        "neq",
        "in"
      ],
      "title": "Operator",
      "type": "string"
    },
    "value": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "integer"
        },
        {
          "type": "boolean"
        },
        {
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      ],
      "title": "Value"
    }
  },
  "required": [
    "field",
    "operator",
    "value"
  ],
  "title": "Condition",
  "type": "object"
}
```

Discriminated union у схемі стає `oneOf` з блоком `discriminator: {propertyName: "type", mapping: {...}}`, тобто саме тим, що розуміють OpenAPI-генератори клієнтів.

```python live
import json
from typing import Annotated, Literal
from pydantic import BaseModel, Field

class Text(BaseModel):
    type: Literal["text"]
    content: str

class Button(BaseModel):
    type: Literal["button"]
    label: str

class Form(BaseModel):
    elements: list[Annotated[Text | Button, Field(discriminator="type")]]

schema = Form.model_json_schema()
print(json.dumps(schema["properties"]["elements"], indent=2))
print(list(schema["$defs"]))
```

```text
{
  "items": {
    "discriminator": {
      "mapping": {
        "button": "#/$defs/Button",
        "text": "#/$defs/Text"
      },
      "propertyName": "type"
    },
    "oneOf": [
      {
        "$ref": "#/$defs/Text"
      },
      {
        "$ref": "#/$defs/Button"
      }
    ]
  },
  "title": "Elements",
  "type": "array"
}
['Button', 'Text']
```

## Для капстоуну

У FastAPI (m7-l01) модель Pydantic, вказана як тип параметра ендпоінта, автоматично стає валідацією тіла запиту, 422-відповіддю з `e.errors()` при помилці та схемою в OpenAPI; вам лишиться написати `def create_form(config: FormConfig)`. Тому моделі з цього уроку це не вправа, а вміст `formbuilder/config.py` у капстоуні: TypedDict з m2-l06 у ньому замінюються Pydantic-моделями з тими самими іменами.

Де Pydantic не потрібен: для структур, які створює й споживає лише ваш код (результат рендеру, запис у черзі воркера, проміжні обчислення). Там немає чужого вводу, валідувати нічого, а `BaseModel` лише додасть накладні витрати на створення. Для таких речей залишається `dataclass` з m2-l05, і в m4 дерево елементів для обходу й рендеру ви опишете саме класами, а Pydantic-моделі будуть на вході, у шарі API. Межу між шарами тримає одна функція `to_domain` у `config.py`, яка перекладає перевірену модель у frozen dataclass з `domain.py` (завдання t6).

Домен такий, як був у вашому реальному FormBuilder: конфіг форми має `id`, `title`, `theme` і дерево `elements`. Елемент це `input`, `text`, `button` або `block` з `children`. Кожен елемент має `id` і необов'язкове `visible_if` виду `{field, operator, value}`, де `field` це `name` якогось `input` у тій самій формі. Правило цілісності "умова посилається на існуюче поле" не виражається типами, тому воно живе в `model_validator` на `FormConfig`: він обходить дерево, збирає імена інпутів і перевіряє кожну умову. Валідація внутрішніх `Validation` і `Condition` при цьому вже відпрацювала, бо `after`-валідатор бачить готові вкладені моделі.

<!-- task: t5 -->

<!-- task: t6 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`str | None` без значення за замовчуванням, у надії, що це `optional`.** У Zod `.optional()` робить ключ необов'язковим. У Pydantic `description: str | None` означає "поле обов'язкове, але може бути `None`": без ключа буде `Field required`. Необов'язковість дає лише `= None`.

   ```python
   class A(BaseModel):
       description: str | None
   class B(BaseModel):
       description: str | None = None
   A()   # ValidationError: ('description',) Field required
   B()   # description=None
   ```

2. **Валідатор без `return`.** Звичка з `.refine`, де callback повертає boolean, а значення не чіпається. У Pydantic валідатор повертає значення поля; забути `return v` означає мовчки записати `None`.

   ```python
   class Bad(BaseModel):
       name: str
       @field_validator("name")
       @classmethod
       def strip(cls, v: str):
           v.strip()          # немає return
   Bad(name="  x  ")          # name=None
   ```

3. **Порівняння `loc` з рядком.** `err["loc"]` це кортеж, `('title',) == "title"` дає `False`, і обробник помилок не знаходить жодного поля. Порівнюйте з кортежем або збирайте шлях через `".".join(str(p) for p in loc)`.

   ```python
   err["loc"] == "title"          # False
   err["loc"] == ("title",)       # True
   ```

4. **Звичайний union замість discriminated для дерева елементів.** `list[Input | Text | Button]` валідується, але на помилці видає по запису на кожну гілку, і фронтенд отримує п'ять повідомлень замість одного. Для об'єктів із полем-тегом завжди `Annotated[..., Field(discriminator="type")]`.

   ```python
   Element = Annotated[Input | Text | Button | Block, Field(discriminator="type")]
   ```

5. **Очікування, що `"42"` для `int` впаде.** Zod строгий, Pydantic lax: `"42"` стає `42`. Якщо рядок у числовому полі це помилка контракту, ставте `Field(strict=True)` або `ConfigDict(strict=True)`.

   ```python
   class User(BaseModel):
       age: int
   User(age="42").age        # 42, тип int
   ```

6. **camelCase-аліас без `validate_by_name` і без `extra="forbid"`.** Передали `min_length` замість `minLength`, ключ проігнорований, поле отримало `None`, і ніхто не помітив. Для моделей на межі з фронтендом ставте обидва прапорці.

   ```python
   model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, extra="forbid")
   ```

7. **Присвоєння після створення не валідується.** `m.title = 42` проходить, бо за замовчуванням Pydantic перевіряє лише конструктор. Якщо модель мутується в коді, вмикайте `ConfigDict(validate_assignment=True)`; краще ж не мутувати, а створювати нову через `m.model_copy(update={...})`.

   ```python
   m = Meta(title="ok")
   m.title = 42               # проходить, m.title == 42
   ```

8. **`model_validate` на рядку з JSON.** Рядок це не dict, помилка `model_type`. Для тексту є `model_validate_json`, і він ще й швидший, бо парсить JSON у Rust.

   ```python
   Meta.model_validate('{"title": "x"}')        # model_type: Input should be a valid dictionary ...
   Meta.model_validate_json('{"title": "x"}')   # title='x'
   ```

## Підсумок

- Анотації типів у runtime не перевіряються; `BaseModel` компілює з них валідатор, тому потрібен на кожній межі з чужими даними. Всередині коду лишається `dataclass`.
- Клас-модель одночасно є схемою і типом: `z.infer` не потрібен.
- `z.object` → клас, `z.string().min(3)` → `Field(min_length=3)`, `.optional()` → `X | None = None`, `z.enum` → `Literal`, `z.array` → `list[X]`, `z.union` → `X | Y`.
- `parse` це `model_validate(dict)` або `model_validate_json(str)`; `safeParse` це `try / except ValidationError`.
- `e.errors()` збирає всі помилки; у кожній `loc` (кортеж-шлях), `type`, `msg`, `input`.
- За замовчуванням lax: `"42"` → `42`. Строгість вмикається `strict=True` на полі, у `model_config` або у виклику.
- `field_validator` для одного поля (режими `before` / `after`, обов'язковий `return`), `model_validator(mode="after")` для правил між полями.
- `tags: list[str] = []` безпечний: значення за замовчуванням копіюється для кожного екземпляра.
- Дерево з тегом `type` описується `Annotated[A | B, Field(discriminator="type")]`, рекурсія через `list["Element"]`.
- `model_dump()` дає dict, `model_dump_json()` рядок; `alias_generator=to_camel` + `validate_by_name` + `by_alias` для camelCase; `extra="forbid"` на вході від фронтенду; `model_json_schema()` як контракт.

## Що далі

Наступний модуль m3 про імпорти, пакети й pytest: моделі з `t5` уже лежать у `formbuilder/config.py` (p1), а в m3 отримають розкладку шарів і перші тести з `parametrize` на валідні й невалідні конфіги. У m4 ви опишете те саме дерево класами з `__iter__` і `__getitem__` для обходу й рендеру, а в m7-l01 `FormConfig` стане типом параметра FastAPI-ендпоінта без жодних змін.
