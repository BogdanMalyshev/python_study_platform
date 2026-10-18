---
id: m2-l08
module: m2-data-typing
title: "mypy і pyright у strict-режимі"
summary: "Учень запускає mypy у strict-режимі з конфігом у pyproject.toml, читає його повідомлення й виправляє їх без type: ignore, розуміє, де narrowing працює, а де чекер мовчить, і доводить капстоун до нуля помилок."
duration_min: 75
prerequisites: [m2-l07]
---

## Анотації перевіряє окрема програма, а не інтерпретатор

У m2-l06 ви бачили, що анотації для CPython це метадані: вони лягають у `__annotations__` і більше ні на що не впливають. Функція з `required: bool` спокійно приймає рядок, а рядок `"no"` truthy, тож результат неправильний, і жодного сигналу про це немає.

```python live
def field_label(field_id: str, required: bool) -> str:
    return field_id + (" *" if required else "")


print(field_label("email", True))
print(field_label("phone", "no"))
print(field_label.__annotations__)
```

```text
email *
phone *
{'field_id': <class 'str'>, 'required': <class 'bool'>, 'return': <class 'str'>}
```

Ловить це окремий інструмент, перевірник типів (type checker, офіційний термін документації `typing`). Він читає вихідний код, нічого не виконуючи, і повідомляє про невідповідності. Найстаріший і еталонний з них mypy, він уже стоїть у `.venv` курсу.

```text
$ mypy runtime.py
runtime.py:6: error: Argument 2 to "field_label" has incompatible type "str"; expected "bool"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
$ echo $?
1
```

```ts
// tsc --noEmit: лише перевірка, без збірки
function fieldLabel(fieldId: string, required: boolean): string {
  return fieldId + (required ? " *" : "");
}
fieldLabel("phone", "no"); // TS2345: Argument of type 'string' is not assignable to parameter of type 'boolean'.
```

```python
# mypy: лише перевірка, запуск окремо
def field_label(field_id: str, required: bool) -> str:
    return field_id + (" *" if required else "")

field_label("phone", "no")  # error: Argument 2 ... [arg-type]
```

Найближчий аналог mypy це `tsc --noEmit`: перевірити й нічого не створити. Розходження в тому, що в TS перевірка зазвичай стоїть на шляху до запуску (`tsc` у збірці, `next build` падає на помилці типу), а в Python шлях до запуску взагалі не проходить через чекер. Python поводиться як TS, запущений через `tsx` або esbuild: типи просто відкидаються. Тому чекер у Python це завжди окремий крок, який ви ставите в редактор, pre-commit і CI самі.

Головних чекерів два. mypy (організація `python/mypy` на GitHub) з'явився першим, на ньому обкатувались PEP 484 та більшість наступних PEP про типи; написаний на Python і скомпільований через mypyc, тому `mypy --version` пише `compiled: yes`. pyright робить Microsoft, він написаний на TypeScript і працює на Node. pyright помітно швидший на великих проєктах і з самого початку проєктувався під редактор: перевіряє інкрементно, по мірі набору. Pylance, стандартне Python-розширення VS Code, це pyright усередині плюс закриті фічі автодоповнення й навігації. Тобто якщо ви писали Python у VS Code, підсвічування типів ви вже бачили, і це був pyright.

Чи потрібні обидва? Ні. Джерело правди в проєкті одне: той чекер, що стоїть у CI й блокує merge. У цьому курсі це mypy, бо він в `.venv`, його конфіг живе в `pyproject.toml`, і на ньому побудовано документацію Pydantic і FastAPI. У редакторі при цьому працюватиме Pylance, і треба знати, де вони розходяться (розділ про редактор нижче). Є ще молоді чекери на Rust, ty від Astral (автори ruff і uv) і pyrefly від Meta; на співбесіді досить знати, що вони існують.

> **JS-аналог.** ruff з m0-l04 це ESLint + Prettier: він бачить один файл як синтаксичне дерево і ловить невикористані імпорти, `== None`, mutable default. Типів він не виводить і не знає, що `required` має бути `bool`. Як у TS-проєкті `eslint` і `tsc` два різні кроки, так і тут `ruff check` і `mypy` два різні кроки, і жоден не замінює іншого.

## Перший запуск: як читати вивід mypy

Типова картина першого запуску: є пакет `src/formbuilder/`, частина функцій без анотацій, частина з анотаціями. Команда `uv run mypy src/` (або `.venv/bin/mypy src/`, якщо оточення вже активне) обходить директорію рекурсивно.

```python
# src/formbuilder/config.py
import json


def load_config(path):
    with open(path) as f:
        data: dict = json.load(f)
    return data


def field_ids(config):
    ids = []
    for page in config["pages"]:
        for field in page["fields"]:
            ids.append(field["id"])
    print("found " + len(ids) + " fields")
    return ids


def count_required(config: dict) -> int:
    total = 0
    for page in config["pages"]:
        for field in page["fields"]:
            if field["required"]:
                total += "1"
    return total


def find_field(config: dict, field_id: str) -> dict:
    for page in config["pages"]:
        for field in page["fields"]:
            if field["id"] == field_id:
                return field
```

```text
$ mypy src/
src/formbuilder/config.py:6: note: By default the bodies of untyped functions are not checked, consider using --check-untyped-defs  [annotation-unchecked]
src/formbuilder/config.py:24: error: Unsupported operand types for + ("int" and "str")  [operator]
src/formbuilder/config.py:28: error: Missing return statement  [return]
Found 2 errors in 1 file (checked 2 source files)
```

Кожен рядок має форму `шлях:рядок: рівень: повідомлення  [код]`. Рівень `error` впливає на код виходу, `note` це пояснення до сусідньої помилки або порада. Код у квадратних дужках (error code, офіційна назва) це ідентифікатор категорії, як `TS2345` у TypeScript, тільки словами: `arg-type`, `return`, `union-attr`. Саме його пишуть у `# type: ignore[код]` і в `disable_error_code` конфігу. Останній рядок підсумок, а код виходу `0` означає "чисто", `1` "є помилки", `2` "сам mypy не зміг відпрацювати" (поганий конфіг, синтаксична помилка).

Коди показуються за замовчуванням з mypy 0.990, тому прапорець `--show-error-codes` зі старих статей нічого не змінює; вимкнути їх можна `--hide-error-codes`, але навіщо. Для читання людиною корисніший `--pretty`: він переносить довгі повідомлення й показує рядок коду з підкресленням, як `tsc --pretty`. `--show-column-numbers` додає колонку, щоб редактор чи CI-анотації стрибали в точне місце.

```text
$ mypy --pretty src/
src/formbuilder/config.py:6: note: By default the bodies of untyped functions are not checked, consider using --check-untyped-defs  [annotation-unchecked]
src/formbuilder/config.py:24: error: Unsupported operand types for + ("int" and
"str")  [operator]
                    total += "1"
                             ^~~
src/formbuilder/config.py:28: error: Missing return statement  [return]
    def find_field(config: dict, field_id: str) -> dict:
    ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Found 2 errors in 1 file (checked 2 source files)
$ mypy --show-column-numbers src/
src/formbuilder/config.py:6:9: note: By default the bodies of untyped functions are not checked, consider using --check-untyped-defs  [annotation-unchecked]
src/formbuilder/config.py:24:26: error: Unsupported operand types for + ("int" and "str")  [operator]
src/formbuilder/config.py:28:1: error: Missing return statement  [return]
Found 2 errors in 1 file (checked 2 source files)
```

Тепер головне: у файлі чотири функції й щонайменше три баги, а mypy знайшов два, обидва в анотованих функціях. `"found " + len(ids)` у `field_ids` це `TypeError` у рантаймі, класична JS-звичка конкатенувати рядок із числом, але mypy про нього мовчить. Нотатка `annotation-unchecked` підказує причину: тіла неанотованих функцій за замовчуванням не перевіряються взагалі.

<!-- task: q1 -->

## Поступовість: від неанотованого коду до `--strict`

mypy створювався для поступової типізації (gradual typing, офіційний термін з PEP 483): мільйони рядків наявного коду мали проходити перевірку без жодної правки, а анотації додаватись по файлу. Звідси правило за замовчуванням: функція без жодної анотації вважається динамічною, її параметри й результат мають тип `Any`, а тіло не аналізується. Для легасі-коду це зручно, для нового проєкту це означає, що чекер мовчить саме там, де ви забули написати типи. Аналог у TS це `allowJs` без `checkJs`: JS-файли компілюються, але не перевіряються. Шлях до суворості складається з прапорців, і їх варто побачити по одному на тому самому файлі.

```text
$ mypy --check-untyped-defs src/
src/formbuilder/config.py:15: error: Unsupported operand types for + ("str" and "int")  [operator]
src/formbuilder/config.py:24: error: Unsupported operand types for + ("int" and "str")  [operator]
src/formbuilder/config.py:28: error: Missing return statement  [return]
Found 3 errors in 1 file (checked 2 source files)
$ mypy --disallow-untyped-defs src/
src/formbuilder/config.py:4: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/config.py:6: note: By default the bodies of untyped functions are not checked, consider using --check-untyped-defs  [annotation-unchecked]
src/formbuilder/config.py:10: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/config.py:24: error: Unsupported operand types for + ("int" and "str")  [operator]
src/formbuilder/config.py:28: error: Missing return statement  [return]
Found 4 errors in 1 file (checked 2 source files)
```

`--check-untyped-defs` перевіряє тіла неанотованих функцій, виводячи типи локальних змінних, і одразу знаходить `"found " + len(ids)`. `--disallow-untyped-defs` вимагає анотацій у кожній функції, але сам по собі тіла не перевіряє: рядок 15 знову зник. Тобто ці два прапорці закривають різні дірки, і повноцінна перевірка виходить лише з обома. Тому на практиці не збирають прапорці вручну, а вмикають `--strict`.

```text
$ mypy --strict src/
src/formbuilder/config.py:4: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/config.py:6: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/config.py:10: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/config.py:15: error: Unsupported operand types for + ("str" and "int")  [operator]
src/formbuilder/config.py:19: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/config.py:24: error: Unsupported operand types for + ("int" and "str")  [operator]
src/formbuilder/config.py:28: error: Missing return statement  [return]
src/formbuilder/config.py:28: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/config.py:32: error: Returning Any from function declared to return "dict[Any, Any]"  [no-any-return]
Found 9 errors in 1 file (checked 2 source files)
```

Що саме вмикає `--strict`, mypy каже сам: `mypy --help` у mypy 2.4 перелічує тринадцять прапорців. Список змінюється між версіями, тому джерело правди це `--help` вашої версії, а не стаття.

| Прапорець | Що забороняє або вмикає |
|---|---|
| `--disallow-untyped-defs` | функції без повних анотацій |
| `--disallow-incomplete-defs` | частково анотовані функції |
| `--check-untyped-defs` | пропуск тіл неанотованих функцій |
| `--disallow-untyped-calls` | виклик неанотованої функції з анотованої |
| `--disallow-untyped-decorators` | декоратор без типів, що "з'їдає" сигнатуру |
| `--disallow-any-generics` | голі `dict`, `list` без параметрів (це `dict[Any, Any]`) |
| `--disallow-subclassing-any` | наслідування від класу типу `Any` (з нетипізованої бібліотеки) |
| `--warn-return-any` | повернення `Any` з функції, що обіцяє конкретний тип |
| `--warn-redundant-casts` | `cast` до типу, який вираз уже має |
| `--warn-unused-ignores` | `# type: ignore`, під яким уже немає помилки |
| `--no-implicit-reexport` | імпорт імені з модуля, який його лише сам імпортував |
| `--strict-equality` | `==` і `in` між типами, що не можуть збігтися |
| `--extra-checks` | кілька додаткових перевірок на межі коректності |

Два з них несподівані для TS-розробника, і обидва зачіпають капстоун. `--no-implicit-reexport`: якщо `formbuilder/__init__.py` робить `from formbuilder.config import FieldConfig`, то `from formbuilder import FieldConfig` в іншому файлі буде помилкою, доки ім'я не потрапить у `__all__`. Це як різниця між `import` і `export { X } from` в ESM: імпортувати ще не означає експортувати. `--strict-equality` ловить порівняння, яке завжди `False`, на кшталт `kind == 1` для рядка; в TS це помилка TS2367 "This comparison appears to be unintentional".

```python
# formbuilder/__init__.py
from formbuilder.config import FieldConfig

# app.py
from formbuilder import FieldConfig


def is_email(field: FieldConfig, kind: str) -> bool:
    return kind == 1 or field["id"] == "email"
```

```text
$ mypy --strict app.py formbuilder
app.py:1: error: Module "formbuilder" does not explicitly export attribute "FieldConfig"  [attr-defined]
app.py:5: error: Non-overlapping equality check (left operand type: "str", right operand type: "Literal[1]")  [comparison-overlap]
Found 2 errors in 1 file (checked 3 source files)
```

Для нового проєкту strict вмикають у перший день, з тієї самої причини, з якої `tsc --init` сьогодні генерує `"strict": true`. Ввімкнути суворість на порожньому репозиторії коштує нуль: кожна нова функція одразу пишеться з типами. Ввімкнути її через рік означає сотні помилок, які виправляють тижнями або глушать списком `ignore`, що ніколи не скорочується. Поступовий шлях (`check_untyped_defs`, потім `disallow_untyped_defs` по модулях через overrides) потрібен лише для легасі-коду, який не можна переписати за раз.

## Конфіг у `pyproject.toml`

Прапорці командного рядка добрі для експериментів, але в проєкті все живе в `pyproject.toml` під `[tool.mypy]`, як у TS-проєкті в `tsconfig.json`. Тоді `mypy` без аргументів у корені проєкту робить те саме, що в CI і в pre-commit.

```json
{
  "compilerOptions": { "target": "ES2022", "strict": true, "noEmit": true },
  "include": ["src", "tests"]
}
```

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
files = ["src", "tests"]

[[tool.mypy.overrides]]
module = ["legacy_forms", "legacy_forms.*"]
ignore_missing_imports = true
```

Ключі конфігу це назви прапорців з підкресленнями замість дефісів і без `--`. `python_version` каже, для якої версії мови перевіряти синтаксис і stdlib-стаби, як `target` у tsconfig; без нього mypy бере версію інтерпретатора, яким запущений. `files` це `include`: що перевіряти, коли аргументів у командному рядку немає. `warn_return_any` уже входить у `strict`, і писати його окремо не обов'язково, але його часто тримають явно, щоб у overrides можна було вимкнути для одного модуля. `warn_unused_configs` попереджає про секції конфігу, які ні на що не вплинули, і це важливіше, ніж здається.

`[[tool.mypy.overrides]]` це масив таблиць TOML (подвійні дужки означають "ще один елемент списку"): налаштування для окремих модулів. `module` приймає точне ім'я або шаблон з `.*`. Найчастіший випадок це стороння бібліотека без типів, про неї окремий розділ нижче. В останньому `note` виводу видно роботу `warn_unused_configs`: модуль `legacy_forms` ніде не імпортується, тож override нічого не робить.

```text
$ mypy
src/formbuilder/config.py:4: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/config.py:6: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/config.py:10: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/config.py:15: error: Unsupported operand types for + ("str" and "int")  [operator]
src/formbuilder/config.py:19: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/config.py:24: error: Unsupported operand types for + ("int" and "str")  [operator]
src/formbuilder/config.py:28: error: Missing return statement  [return]
src/formbuilder/config.py:28: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/config.py:32: error: Returning Any from function declared to return "dict[Any, Any]"  [no-any-return]
tests/test_config.py:4: error: Function is missing a return type annotation  [no-untyped-def]
tests/test_config.py:4: note: Use "-> None" if function does not return a value
pyproject.toml: note: unused section(s): module = ['legacy_forms', 'legacy_forms.*']
Found 10 errors in 2 files (checked 3 source files)
```

> **Пастка.** Шаблон у `module` порівнюється з іменем модуля, яке mypy виводить з `__init__.py`, а не зі шляхом. Якщо в `tests/` немає `__init__.py`, файл `tests/test_x.py` для mypy це модуль `test_x`, і override `module = ["tests.*"]` до нього не застосовується. Без `warn_unused_configs` ви цього не помітите.

```text
$ mypy
tests/test_x.py:1: error: Function is missing a return type annotation  [no-untyped-def]
tests/test_x.py:1: note: Use "-> None" if function does not return a value
pyproject.toml: note: unused section(s): module = ['tests.*']
Found 1 error in 1 file (checked 1 source file)
$ touch tests/__init__.py && mypy
Success: no issues found in 2 source files
```

Після того як усі помилки з першого файлу виправлено (`TypedDict` для конфігу, повні анотації, явний `return None`), той самий `mypy` без аргументів дає чистий результат. Повний виправлений файл є в розділі для капстоуну, тут лише результат.

```text
$ mypy
Success: no issues found in 3 source files
```

## Narrowing: як mypy звужує union

Звуження (narrowing, офіційний термін документації mypy і специфікації typing) це те, що TS робить з `string | null` після `if (x === null) return`: у гілці після перевірки тип змінної вужчий за оголошений. mypy розуміє ті самі конструкції, що й TS, плюс специфічні для Python. Побачити звужений тип можна через `reveal_type(x)`: mypy друкує тип у місці виклику як `note`.

```python
def label(placeholder: str | None) -> str:
    reveal_type(placeholder)
    if placeholder is None:
        return "-"
    reveal_type(placeholder)
    return placeholder.upper()


def width(value: int | str) -> int:
    if isinstance(value, str):
        reveal_type(value)
        return len(value)
    reveal_type(value)
    return value


def first_char(value: str | None) -> str:
    assert value is not None
    reveal_type(value)
    return value[0]


def truthy(value: str | None) -> str:
    if value:
        reveal_type(value)
        return value
    reveal_type(value)
    return ""
```

```text
$ mypy --strict narrowing.py
narrowing.py:2: note: Revealed type is "str | None"
narrowing.py:5: note: Revealed type is "str"
narrowing.py:11: note: Revealed type is "str"
narrowing.py:13: note: Revealed type is "int"
narrowing.py:19: note: Revealed type is "str"
narrowing.py:25: note: Revealed type is "str"
narrowing.py:27: note: Revealed type is "Literal[''] | None"
Success: no issues found in 1 source file
```

`is None` з раннім `return` це аналог `=== null`, `isinstance` це `typeof` і `instanceof` в одному, `assert` звужує все, що йде після нього. Останній рядок показує, що mypy точніший за інтуїцію: у хибній гілці `if value:` лишається не "рядок або None", а `Literal[''] | None`, бо з рядків хибний лише порожній. Важливо, що narrowing це не магія чекера, а звичайний код, який виконується: та сама перевірка, що переконує mypy, у рантаймі обирає гілку.

```python live
def describe(value: int | str | None) -> str:
    if value is None:
        return "empty"
    if isinstance(value, str):
        return f"text of {len(value)} chars"
    return f"number {value + 1}"


for v in [None, "email", 41]:
    print(describe(v))
print(describe.__annotations__["value"])
```

```text
empty
text of 5 chars
number 42
int | str | None
```

> **Пастка.** `assert` звужує тип для mypy, але інтерпретатор із прапорцем `-O` викидає всі `assert` з байткоду. Перевірка, від якої залежить коректність, має бути `if ... raise`, а `assert` лишається для інваріантів, які "не можуть" порушитись.

```text
$ python assert_o.py
AssertionError: value is required
$ python -O assert_o.py
TypeError: 'NoneType' object is not subscriptable
```

<!-- task: t1 -->

`match` звужує в кожній гілці `case`, і класові патерни `case int():` працюють як `isinstance`. Для union літералів є прийом, який у TS пишуть через `never`: в останній гілці викликати `assert_never(x)` з `typing`. Якщо всі варіанти оброблено, тип `x` там `Never`, і виклик легальний. Якщо варіант забули, mypy називає його в помилці, тобто ви отримуєте перевірку повноти (exhaustiveness checking, так це називає документація mypy) як у `switch` з `const _: never = kind`.

```python
from typing import Literal, assert_never

Kind = Literal["input", "text", "button"]


def default_value(value: int | str | list[str] | None) -> str:
    match value:
        case None:
            return ""
        case int():
            reveal_type(value)
            return str(value)
        case str():
            reveal_type(value)
            return value
        case [first, *_]:
            reveal_type(first)
            return first
        case _:
            reveal_type(value)
            return ""


def tag(kind: Kind) -> str:
    match kind:
        case "input":
            return "<input>"
        case "text":
            return "<p>"
        case _:
            assert_never(kind)
```

```text
$ mypy --strict match_narrow.py
match_narrow.py:11: note: Revealed type is "int"
match_narrow.py:14: note: Revealed type is "str"
match_narrow.py:17: note: Revealed type is "str"
match_narrow.py:20: note: Revealed type is "list[str]"
match_narrow.py:31: error: Argument 1 to "assert_never" has incompatible type "Literal['button']"; expected "Never"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

У рантаймі `assert_never` не порожній: якщо значення поза union таки прийшло (з JSON, наприклад), він кидає `AssertionError` з цим значенням у тексті, а не повертає мовчки `None`.

```python live
from typing import Literal, assert_never

Kind = Literal["input", "text"]


def tag(kind: Kind) -> str:
    match kind:
        case "input":
            return "<input>"
        case "text":
            return "<p>"
        case _:
            assert_never(kind)


try:
    tag("button")  # type: ignore[arg-type]
except AssertionError as e:
    print(e)
```

```text
Expected code to be unreachable, but got: 'button'
```

<!-- task: t2 -->

Тепер місця, де narrowing не працює. mypy звужує вирази, які можна перечитати без побічних ефектів: змінні, атрибути, індекси з літералом. Результат виклику функції чи методу він не звужує ніколи, бо другий виклик може повернути інше. Умову, збережену в окрему змінну, mypy теж не пов'язує з початковою (pyright пов'язує, про це в розділі про редактор). І в замиканні звуження втрачається, якщо змінну перепризначено після створення `lambda`.

```python
from dataclasses import dataclass


@dataclass
class Field:
    id: str
    placeholder: str | None = None

    def hint(self) -> str | None:
        return self.placeholder


def by_call(field: Field) -> str:
    if field.hint() is not None:
        return field.hint().upper()
    return ""


def by_alias(field: Field) -> str:
    has_hint = field.placeholder is not None
    if has_hint:
        return field.placeholder.upper()
    return ""


def by_dict(data: dict[str, str | None]) -> str:
    if data.get("placeholder") is not None:
        return data.get("placeholder").upper()
    if data["placeholder"] is not None:
        return data["placeholder"].upper()
    return ""
```

```text
$ mypy --strict limits.py
limits.py:15: error: Item "None" of "str | None" has no attribute "upper"  [union-attr]
limits.py:22: error: Item "None" of "str | None" has no attribute "upper"  [union-attr]
limits.py:28: error: Item "None" of "str | None" has no attribute "upper"  [union-attr]
Found 3 errors in 1 file (checked 1 source file)
```

```python
def make_prefixer(prefix: str | None) -> list[str]:
    if prefix is None:
        prefix = ""
    names = ["email", "phone"]
    result = list(map(lambda n: prefix + n, names))
    prefix = None
    return result
```

```text
$ mypy --strict closure.py
closure.py:5: error: Unsupported left operand type for + ("None")  [operator]
closure.py:5: note: Left operand is of type "str | None"
Found 1 error in 1 file (checked 1 source file)
```

Зворотний бік: звуження атрибута переживає виклик будь-якої функції, навіть такої, що цей атрибут змінює. Тут mypy свідомо ненадійний (unsound, термін з теорії типів, у документації mypy вживається саме так): якби він скидав звуження після кожного виклику, у реальному коді довелося б перевіряти той самий атрибут десятки разів. TS робить той самий компроміс із властивостями об'єктів.

```python
from dataclasses import dataclass


@dataclass
class Field:
    id: str
    placeholder: str | None = None


def reset(field: Field) -> None:
    field.placeholder = None


def shout(field: Field) -> str:
    if field.placeholder is not None:
        reset(field)
        return field.placeholder.upper()
    return ""


print(shout(Field("email", "you@example.com")))
```

```text
$ mypy --strict unsound.py
Success: no issues found in 1 source file
$ python unsound.py
AttributeError: 'NoneType' object has no attribute 'upper'
```

Ліки від усіх трьох випадків однакові: зафіксувати значення в локальній змінній і звужувати її. Локальну змінну ніхто, крім вашої функції, перепризначити не може, тому і mypy, і рантайм бачать те саме. Для результату виклику найкоротший запис дає walrus-оператор `:=` (жаргон спільноти; офіційно assignment expression, PEP 572): присвоїти й перевірити в одній умові.

```python
# Field з методом hint() і reset() як вище
def shout(field: Field) -> str:
    placeholder = field.placeholder
    if placeholder is not None:
        reset(field)
        return placeholder.upper()
    return ""


def by_call(field: Field) -> str:
    if (hint := field.hint()) is not None:
        return hint.upper()
    return ""


print(shout(Field("email", "you@example.com")))
print(by_call(Field("email", "you@example.com")))
```

```text
$ mypy --strict fixed.py
Success: no issues found in 1 source file
$ python fixed.py
YOU@EXAMPLE.COM
YOU@EXAMPLE.COM
```

<!-- task: q2 -->

## Повідомлення, які ви побачите першими

Шість повідомлень покривають більшість того, що mypy скаже на коді JS-розробника в перший місяць. Кожне нижче показано з мінімальним кодом, реальним виводом і виправленням, яке проходить `--strict`.

`Incompatible types in assignment`: змінна отримала тип з першого присвоєння, і друге йому не відповідає. У TS це `let maxLength = 255; maxLength = "unlimited"` з TS2322. Виправлення не "перейменувати", а оголосити справжній тип одразу: якщо "без обмеження" легальне значення, це `int | None`.

```python
max_length = 255
max_length = "unlimited"
```

```text
assign.py:2: error: Incompatible types in assignment (expression has type "str", variable has type "int")  [assignment]
```

```python
max_length: int | None = 255
max_length = None
```

`Argument 1 to "..." has incompatible type`: аргумент не того типу, найчастіше рядок з JSON чи форми там, де чекають число. Цей приклад варто запустити: у рантаймі він не падає, а дає `"3" * 8`, тобто рядок, повторений вісім разів. Виправлення: явне перетворення на межі, `field_width(int(raw["columns"]))`, а для даних ззовні Pydantic (m2-l09), який зробить це перетворення з валідацією.

```python
def field_width(columns: int) -> str:
    return f"{columns * 8}px"


raw = {"columns": "3"}
print(field_width(raw["columns"]))
```

```text
$ mypy --strict argument.py
argument.py:6: error: Argument 1 to "field_width" has incompatible type "str"; expected "int"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
$ python argument.py
33333333px
```

`Item "None" of "X | None" has no attribute "..."`: ви звертаєтесь до атрибута значення, яке може бути `None`. Найчастіше це результат `re.search`, `dict.get`, `next(..., None)` чи пошуку в списку. Аналог TS18047 "'match' is possibly 'null'". Виправлення завжди через narrowing: вирішити, що робити з `None`, і написати це кодом.

```python
import re


def domain(email: str) -> str:
    match = re.search(r"@(.+)$", email)
    return match.group(1)
```

```text
none_attr.py:6: error: Item "None" of "Match[str] | None" has no attribute "group"  [union-attr]
```

```python
import re


def domain(email: str) -> str:
    match = re.search(r"@(.+)$", email)
    if match is None:
        raise ValueError(f"not an email: {email!r}")
    return match.group(1)


print(domain("a@formbuilder.dev"))  # -> formbuilder.dev
```

<!-- task: q3 -->

`Need type annotation for "..."`: порожній `[]` чи `{}`, тип елементів якого mypy не може вивести з того ж scope. Усередині однієї функції він зазвичай виводить тип з першого `append`, але на рівні модуля, якщо наповнення відбувається в іншій функції, просить анотацію. У TS порожній масив без анотації стає `any[]` або `never[]` залежно від налаштувань; у Python підказка в повідомленні прямо каже, що написати.

```python
errors = []
seen = {}


def validate(ids: list[str]) -> None:
    for field_id in ids:
        if field_id in seen:
            errors.append(field_id)
        seen[field_id] = True
```

```text
need_ann.py:1: error: Need type annotation for "errors" (hint: "errors: list[<type>] = ...")  [var-annotated]
need_ann.py:2: error: Need type annotation for "seen" (hint: "seen: dict[<type>, <type>] = ...")  [var-annotated]
```

```python
errors: list[str] = []
seen: dict[str, bool] = {}
```

`Returning Any from function declared to return "..."`: це `warn_return_any` зі strict. Функція обіцяє `str`, а повертає значення типу `Any`, найчастіше прямо з `json.loads`, `yaml.safe_load` чи нетипізованої бібліотеки. Виправлення не `cast`, а перевірка: `isinstance` звужує `Any` так само, як union.

```python
import json


def load_title(raw: str) -> str:
    data = json.loads(raw)
    return data["title"]
```

```text
any_return.py:6: error: Returning Any from function declared to return "str"  [no-any-return]
```

```python
import json


def load_title(raw: str) -> str:
    data = json.loads(raw)
    title = data["title"]
    if not isinstance(title, str):
        raise TypeError(f"title must be str, got {type(title).__name__}")
    return title


def load_title_silent(raw: str) -> str:
    title: str = json.loads(raw)["title"]
    return title


print(load_title('{"title": "Signup"}'))
print(repr(load_title_silent('{"title": 42}')))
```

```text
$ mypy --strict any_return_fix.py
Success: no issues found in 1 source file
$ python any_return_fix.py
Signup
42
```

> **Пастка.** `load_title_silent` теж проходить `--strict`, і це дірка: `Any` можна присвоїти змінній будь-якого типу без помилки, а `warn_return_any` ловить лише пряме повернення `Any`. Анотація `title: str = <Any>` нічого не перевіряє, і функція, що "повертає `str`", повертає `42`. Це той самий `any` з TS, який тихо розходиться кодом. `Any` проти `object` розібрано в m2-l06: `object` вимагає narrowing перед будь-якою операцією, `Any` дозволяє все.

```python
from typing import Any


def columns(config: Any) -> str:
    config.lenght()
    return f"{config['columns'] * 8}px"


def columns_obj(config: object) -> str:
    return f"{config['columns'] * 8}px"
```

```text
$ mypy --strict any_param.py
any_param.py:10: error: Value of type "object" is not indexable  [index]
Found 1 error in 1 file (checked 1 source file)
```

`Missing return statement`: функція з типом результату, відмінним від `None`, має шлях виконання без `return`. У Python такий шлях неявно повертає `None`, тому для `-> str` це помилка. TS ловить те саме як TS2366 "Function lacks ending return statement", коли тип результату не включає `undefined`. Виправлення залежить від наміру: або `raise` для неможливого випадку, або чесне `-> str | None` з `return None` у кінці.

```python
def field_type(kind: str) -> str:
    if kind == "email":
        return "input"
    elif kind == "note":
        return "textarea"
```

```text
missing_return.py:1: error: Missing return statement  [return]
```

```python
def field_type(kind: str) -> str:
    if kind == "email":
        return "input"
    elif kind == "note":
        return "textarea"
    raise ValueError(f"unknown kind: {kind}")
```

## Аварійні виходи: `type: ignore`, `cast`, `TYPE_CHECKING`, `reveal_type`

Коментар `# type: ignore` вимикає помилки mypy на одному рядку, як `// @ts-ignore`. Різниця в тому, що в mypy він приймає код у дужках: `# type: ignore[arg-type]` глушить лише цю категорію, і якщо на рядку з'явиться інша помилка, її буде видно. Без коду коментар глушить усе, включно з помилками, яких ще не було, коли його писали. `strict` вмикає `warn_unused_ignores`, тож коментар, під яким помилки вже немає, теж стає помилкою, і застарілі ignore не накопичуються.

```python
def field_width(columns: int) -> str:
    return f"{columns * 8}px"


a = field_width("3")  # type: ignore
b = field_width("3")  # type: ignore[arg-type]
c = field_width("3")  # type: ignore[union-attr]
d = field_width(3)  # type: ignore[arg-type]
e = field_width("3").upperr()  # type: ignore
```

```text
$ mypy --strict ignores.py
ignores.py:7: error: Unused "type: ignore" comment  [unused-ignore]
ignores.py:7: error: Argument 1 to "field_width" has incompatible type "str"; expected "int"  [arg-type]
ignores.py:7: note: Error code "arg-type" not covered by "type: ignore[union-attr]" comment
ignores.py:8: error: Unused "type: ignore" comment  [unused-ignore]
Found 3 errors in 1 file (checked 1 source file)
$ mypy --strict --enable-error-code ignore-without-code ignores.py
ignores.py:5: error: "type: ignore" comment without error code (consider "type: ignore[arg-type]" instead)  [ignore-without-code]
ignores.py:7: error: Unused "type: ignore" comment  [unused-ignore]
ignores.py:7: error: Argument 1 to "field_width" has incompatible type "str"; expected "int"  [arg-type]
ignores.py:7: note: Error code "arg-type" not covered by "type: ignore[union-attr]" comment
ignores.py:8: error: Unused "type: ignore" comment  [unused-ignore]
ignores.py:9: error: "type: ignore" comment without error code (consider "type: ignore[arg-type, attr-defined]" instead)  [ignore-without-code]
Found 5 errors in 1 file (checked 1 source file)
```

Рядок 9 показує, чому голий ignore це запах: його поставили через `arg-type`, а він заодно сховав одруківку `upperr` (`attr-defined`), яка в рантаймі дасть `AttributeError`. Код помилки `ignore-without-code` не входить у `strict`, його вмикають у конфігу рядком `enable_error_code = ["ignore-without-code"]`, і для цього курсу це рекомендовано. Правило для code review: кожен ignore має код і коментар, чому тут неможливо інакше.

<!-- task: q4 -->

`typing.cast(T, value)` каже чекеру "вважай, що тут `T`". Це `as` з TS у найгіршому сенсі: у рантаймі `cast` просто повертає `value`, нічого не перевіряючи й не перетворюючи. Чесне застосування є, коли ви знаєте більше за чекер (наприклад, після перевірки, яку mypy не розуміє), але для даних ззовні він лише переносить помилку з чекера в продакшн. `warn_redundant_casts` зі strict ловить `cast`, який нічого не змінює.

```python
import json
from typing import cast, reveal_type

data = json.loads('{"title": 42}')
title = cast(str, data["title"])
reveal_type(title)
print(type(title).__name__)
print(cast(int, "not an int"))
n = cast(int, 5)
```

```text
$ mypy --strict casts.py
casts.py:6: note: Revealed type is "str"
casts.py:9: error: Redundant cast to "int"  [redundant-cast]
Found 1 error in 1 file (checked 1 source file)
$ python casts.py
Runtime type is 'int'
int
not an int
```

У цьому виводі видно й `reveal_type` з двох боків. Для mypy це спеціальна форма, яка друкує статичний тип; з Python 3.11 це також звичайна функція з `typing`, яка в рантаймі пише в stderr фактичний тип і повертає аргумент. Тут розбіжність `str` у чекера проти `int` у рантаймі і є діагнозом брехливого `cast`. mypy розпізнає `reveal_type` і без імпорту, але тоді рантайм упаде, тож або імпортуйте його, або прибирайте перед комітом.

```text
$ mypy revealrt.py
revealrt.py:2: note: Revealed type is "str"
Success: no issues found in 1 source file
$ python revealrt.py
NameError: name 'reveal_type' is not defined
```

<!-- task: t3 -->

`typing.TYPE_CHECKING` це константа, яка дорівнює `False` у рантаймі й вважається `True` чекером. Імпорт під `if TYPE_CHECKING:` бачить лише mypy, і це стандартний спосіб розірвати циклічний імпорт, потрібний тільки для анотацій. Без нього два модулі, які посилаються один на одного типами, падають на старті, і mypy цього не помічає, бо він не виконує імпорти.

```python
# formbuilder/models.py
from dataclasses import dataclass

from formbuilder.renderer import Renderer


@dataclass
class Form:
    id: str

    def render_with(self, renderer: Renderer) -> str:
        return renderer.render(self)

# formbuilder/renderer.py
from formbuilder.models import Form


class Renderer:
    def render(self, form: Form) -> str:
        return f"<form id={form.id!r}></form>"

# main.py
from formbuilder.models import Form
from formbuilder.renderer import Renderer

print(Form("signup").render_with(Renderer()))
```

```text
$ mypy --strict main.py formbuilder
Success: no issues found in 4 source files
$ python main.py
ImportError: cannot import name 'Form' from partially initialized module 'formbuilder.models' (most likely due to a circular import) (formbuilder/models.py)
```

```python
# formbuilder/models.py
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from formbuilder.renderer import Renderer


@dataclass
class Form:
    id: str

    def render_with(self, renderer: Renderer) -> str:
        return renderer.render(self)
```

```text
$ mypy --strict main.py formbuilder
Success: no issues found in 4 source files
$ python main.py
<form id='signup'></form>
```

`from __future__ import annotations` тут обов'язковий: в рантаймі імені `Renderer` немає, і анотацію не можна обчислювати під час визначення методу (відкладені анотації розібрані в m2-l06). TS-аналог це `import type { Renderer } from "./renderer"`, який стирається при компіляції. Відмінність лише в тому, що в TS це окремий синтаксис імпорту, а в Python звичайний `if`, який у рантаймі ніколи не виконується.

## Сторонні бібліотеки, редактор і CI

Звідки mypy знає типи чужого коду, трьома способами. Бібліотека, яка поставляє анотації в собі, кладе в пакет порожній файл-маркер `py.typed` (PEP 561); у `.venv` курсу він є в pydantic, httpx, pytest. Для стандартної бібліотеки й популярних пакетів без вбудованих типів існує typeshed, репозиторій стабів (stub, офіційна назва: файл `.pyi` лише з сигнатурами, аналог `.d.ts`). Стаби stdlib вбудовані в mypy, а стаби сторонніх пакетів публікуються на PyPI як `types-<назва>`: `types-requests`, `types-PyYAML`. Це прямий аналог `@types/*` з DefinitelyTyped.

```python
import httpx
import yaml
import pygments
```

```text
$ mypy --strict uses_libs.py
uses_libs.py:2: error: Library stubs not installed for "yaml"  [import-untyped]
uses_libs.py:2: note: Hint: "python3 -m pip install types-PyYAML"
uses_libs.py:2: note: (or run "mypy --install-types" to install all missing stub packages)
uses_libs.py:2: note: See https://mypy.readthedocs.io/en/stable/running_mypy.html#missing-imports
uses_libs.py:3: error: Library stubs not installed for "pygments"  [import-untyped]
uses_libs.py:3: note: Hint: "python3 -m pip install types-Pygments"
Found 2 errors in 1 file (checked 1 source file)
```

`httpx` пройшов мовчки, бо має `py.typed`. Для `yaml` і `pygments` mypy знає, що в typeshed є стаби, і прямо називає пакет. Ставити їх треба як dev-залежність (`uv add --dev types-PyYAML`), бо в рантаймі вони не потрібні. Після цього типи з'являються, і вони чесні: `yaml.safe_load` повертає `Any`, бо YAML може містити що завгодно.

Якщо бібліотека не має ні `py.typed`, ні стабів у typeshed, повідомлення інше. Варіантів три, від найгіршого до найкращого: `ignore_missing_imports` у override робить увесь модуль `Any`; `follow_untyped_imports` змушує mypy читати вихідний код бібліотеки й виводити, що вийде; власний `.pyi` у теці стабів описує лише ті функції, які ви справді використовуєте. Чернетку стабу генерує `stubgen` з того ж пакета mypy.

```python
import legacy_forms
import yaml

config = yaml.safe_load("id: signup")
html = legacy_forms.render(config)
reveal_type(config)
reveal_type(html)
```

```text
$ mypy --strict uses_legacy.py
uses_legacy.py:1: error: Skipping analyzing "legacy_forms": module is installed, but missing library stubs or py.typed marker  [import-untyped]
uses_legacy.py:1: note: See https://mypy.readthedocs.io/en/stable/running_mypy.html#missing-imports
uses_legacy.py:6: note: Revealed type is "Any"
uses_legacy.py:7: note: Revealed type is "Any"
Found 1 error in 1 file (checked 1 source file)
```

```toml
# варіант 1: [[tool.mypy.overrides]] з ignore_missing_imports = true
# результат: Success, але html: Any

# варіант 2: [[tool.mypy.overrides]] з follow_untyped_imports = true
# результат: error: Call to untyped function "render" in typed context  [no-untyped-call]

# варіант 3: власний стаб
[tool.mypy]
strict = true
mypy_path = "stubs"
```

```python
# stubs/legacy_forms.pyi
from collections.abc import Mapping

def render(config: Mapping[str, object], theme: str = ...) -> str: ...
```

```text
$ mypy uses_legacy.py
uses_legacy.py:6: note: Revealed type is "Any"
uses_legacy.py:7: note: Revealed type is "str"
Success: no issues found in 1 source file
```

У редакторі Pylance за замовчуванням перевірку типів вимкнено (`typeCheckingMode` дорівнює `off`, лишаються лише нерозв'язані імпорти й синтаксис), тому "Pylance нічого не підкреслює" ще нічого не означає. Режим перемикається в `settings.json` VS Code ключем `"python.analysis.typeCheckingMode": "strict"`, але краще в `pyproject.toml` секцією `[tool.pyright]` з `typeCheckingMode = "strict"` і `pythonVersion = "3.12"`: її читають і Pylance, і CLI pyright, і вона їде в репозиторій разом з кодом. Навіть у strict обидва чекери не збігаються повністю: це дві незалежні реалізації однієї специфікації з різними компромісами. Ось один файл, перевірений обома CLI в режимі за замовчуванням (у pyright це `standard`, у mypy без прапорців).

```python
def count_required(fields):
    total = 0
    for field in fields:
        if field["required"]:
            total += "1"
    return total


def shout(placeholder: str | None) -> str:
    has_hint = placeholder is not None
    if has_hint:
        return placeholder.upper()
    return ""
```

```text
$ mypy compare.py
compare.py:12: error: Item "None" of "str | None" has no attribute "upper"  [union-attr]
Found 1 error in 1 file (checked 1 source file)
$ pyright compare.py
compare.py
  compare.py:5:13 - error: Operator "+=" not supported for types "Literal[0]" and "Literal['1']"
    Operator "+" not supported for types "Literal[0]" and "Literal['1']" (reportOperatorIssue)
1 error, 0 warnings, 0 informations
```

Результати дзеркальні. pyright перевіряє тіла неанотованих функцій завжди, виводячи типи з використання, тому знайшов `0 + "1"`. mypy цього не робить без `check_untyped_defs`. Зате pyright розуміє збережену в змінну умову `has_hint` і звужує `placeholder`, а mypy ні. Практичний висновок: якщо Pylance мовчить, а CI з mypy червоний (або навпаки), правий той, хто стоїть у CI, а код варто переписати так, щоб його розуміли обидва, тут через пряму перевірку `if placeholder is not None`.

Поза редактором mypy запускається ще у двох місцях. У pre-commit (детально в m3-l06) хук викликає `uv run mypy`, щоб чекер бачив встановлені залежності проєкту; готовий хук `mirrors-mypy` працює в ізольованому оточенні й без додаткового налаштування не бачить pydantic. У CI це один крок, який падає з кодом `1` на будь-якій помилці, як `tsc --noEmit` у пайплайні.

```text
$ uv run mypy src
Success: no issues found in 2 source files
```

Нарешті, чекер не замінює тести (pytest у m3-l03). Він доводить, що типи узгоджені, а не що логіка правильна: функція нижче рахує не ті поля, має бездоганні типи й повертає `1` замість `2`. Типи прибирають цілий клас тестів, які в JS пишуть на "а якщо передати рядок", але тест на поведінку лишається обов'язковим.

```python
from typing import TypedDict


class FieldConfig(TypedDict):
    id: str
    required: bool


def count_required(fields: list[FieldConfig]) -> int:
    return sum(1 for field in fields if not field["required"])


fields: list[FieldConfig] = [
    {"id": "email", "required": True},
    {"id": "phone", "required": True},
    {"id": "note", "required": False},
]
print(count_required(fields))
```

```text
$ mypy --strict notests.py
Success: no issues found in 1 source file
$ python notests.py
1
```

## Для капстоуну

Скелет `capstone/` з m0-l06 має `src/formbuilder/` з `cli.py` і `__main__.py`, `tests/test_smoke.py` і `pyproject.toml`. Дописати в нього треба три речі: mypy як dev-залежність, блок `[tool.mypy]` і маркер `py.typed`, щоб пакет оголошував себе типізованим для тих, хто його імпортує.

```text
$ uv add --dev mypy
```

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_unused_configs = true
enable_error_code = ["ignore-without-code"]
files = ["src", "tests"]
```

Перший прогін на типовому скелеті, де `cli.py` написано без анотацій, виглядає так. Зверніть увагу на `no-untyped-call` у `__main__.py`: модульний рівень теж вважається типізованим контекстом.

```text
$ uv run mypy src
src/formbuilder/cli.py:5: error: Function is missing a return type annotation  [no-untyped-def]
src/formbuilder/cli.py:11: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/cli.py:12: error: Call to untyped function "build_parser" in typed context  [no-untyped-call]
src/formbuilder/__main__.py:3: error: Call to untyped function "main" in typed context  [no-untyped-call]
Found 4 errors in 2 files (checked 3 source files)
$ uv run mypy
src/formbuilder/cli.py:5: error: Function is missing a return type annotation  [no-untyped-def]
src/formbuilder/cli.py:11: error: Function is missing a type annotation  [no-untyped-def]
src/formbuilder/cli.py:12: error: Call to untyped function "build_parser" in typed context  [no-untyped-call]
src/formbuilder/__main__.py:3: error: Call to untyped function "main" in typed context  [no-untyped-call]
tests/test_smoke.py:4: error: Function is missing a type annotation  [no-untyped-def]
tests/test_smoke.py:5: error: Call to untyped function "main" in typed context  [no-untyped-call]
Found 6 errors in 3 files (checked 4 source files)
```

Виправлення механічні: повертаний тип `argparse.ArgumentParser`, `argv: list[str] | None = None` і `-> int` для `main`, `-> None` і тип фікстури для тесту. Дві помилки `no-untyped-call` зникають самі, коли анотовано функцію, яку викликають.

```python
import argparse
from importlib.metadata import version


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="formbuilder")
    parser.add_argument("--version", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.version:
        print(version("formbuilder"))
        return 0
    print("formbuilder: nothing to do yet")
    return 0
```

```python
import pytest

from formbuilder.cli import main


def test_main_runs(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([]) == 0
    assert "nothing to do" in capsys.readouterr().out
```

```text
$ uv run mypy src
Success: no issues found in 3 source files
$ uv run mypy
Success: no issues found in 4 source files
```

> **Для капстоуну.** `args.version` має тип `Any`: `argparse.Namespace` не знає своїх атрибутів, і strict тут не скаржиться, бо `Any` в умові дозволений. Коли CLI розростеться (m6-l06), це місце варто закрити або Typer, або Pydantic-моделлю для аргументів. Pydantic v2 з m2-l09 mypy розуміє без плагіна: `Field(id=42)` і одруківка в імені аргументу ловляться як `arg-type` і `call-arg`. Плагін `plugins = ["pydantic.mypy"]` додає строгіші перевірки `__init__`, але для старту не потрібен.

Повний файл `config.py` з першого розділу після виправлень. У капстоун він не кладеться: там `config.py` уже є з m2-l06 і описує ваш справжній контракт, а цей файл показує, як виглядає модуль після проходу strict. `load_config` у ньому свідомо показує ту саму дірку з `Any`: `json.loads` нічого не перевіряє, і анотація `FormConfig` лише обіцянка; справжня перевірка з'явиться в m2-l09.

```python
import json
from pathlib import Path
from typing import TypedDict


class FieldConfig(TypedDict):
    id: str
    required: bool


class PageConfig(TypedDict):
    fields: list[FieldConfig]


class FormConfig(TypedDict):
    pages: list[PageConfig]


def load_config(path: Path) -> FormConfig:
    data: FormConfig = json.loads(path.read_text())
    return data


def field_ids(config: FormConfig) -> list[str]:
    ids = [field["id"] for page in config["pages"] for field in page["fields"]]
    print(f"found {len(ids)} fields")
    return ids


def count_required(config: FormConfig) -> int:
    return sum(1 for page in config["pages"] for field in page["fields"] if field["required"])


def find_field(config: FormConfig, field_id: str) -> FieldConfig | None:
    for page in config["pages"]:
        for field in page["fields"]:
            if field["id"] == field_id:
                return field
    return None
```

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **Очікувати, що помилка типу зупинить запуск.** У TS-збірці `tsc` падає, і код не потрапляє в бандл. У Python `python app.py` запускається з будь-якими типами, а помилка проявляється пізніше й в іншому місці. Правильно: mypy окремим кроком у pre-commit і CI, який блокує merge.

   ```python
   print(field_width("3"))  # mypy: arg-type; python: 33333333px
   ```

2. **`Any` як "потім виправлю".** Як `any` у TS, він вимикає перевірку для всього, до чого торкається, і розповзається: `title: str = <Any>` проходить strict. Правильно: `object` з narrowing для невідомих даних, Pydantic на межі, `Any` лише з коментарем чому.

   ```python
   def columns(config: object) -> str:      # не Any
       if not isinstance(config, dict):
           raise TypeError("config must be a dict")
       ...
   ```

3. **Голий `# type: ignore` за звичкою `// @ts-ignore`.** Він ховає всі помилки рядка, включно з майбутніми. Правильно: `# type: ignore[код]` і `enable_error_code = ["ignore-without-code"]` у конфігу, щоб голий ignore сам став помилкою.

   ```python
   e = field_width("3").upperr()  # type: ignore            # сховав і arg-type, і attr-defined
   b = field_width("3")  # type: ignore[arg-type]            # лише те, що треба
   ```

4. **`cast` як `as`.** У TS `as User` теж нічого не перевіряє, але ним рідко приводять сирий JSON, бо є Zod. У Python `cast(str, data["title"])` з тієї ж причини лише переносить помилку в рантайм. Правильно: `isinstance` для одиничних значень, Pydantic для структур.

   ```python
   title = data["title"]
   if not isinstance(title, str):
       raise TypeError("title must be str")
   ```

5. **Вірити, що IDE і CLI покажуть те саме.** Pylance за замовчуванням з вимкненою перевіркою типів, mypy у CI зі strict; один перевіряє тіла неанотованих функцій, інший розуміє збережені в змінну умови. Правильно: strict в обох (`[tool.mypy]` і `[tool.pyright]` у `pyproject.toml`), а джерелом правди вважати той, що в CI.

   ```toml
   [tool.pyright]
   typeCheckingMode = "strict"
   pythonVersion = "3.12"
   ```

6. **Звужувати результат виклику.** `if field.hint() is not None: field.hint().upper()` працює в голові, бо так пишуть з optional chaining, але mypy результат виклику не звужує. Правильно: walrus або локальна змінна.

   ```python
   if (hint := field.hint()) is not None:
       return hint.upper()
   ```

7. **Вмикати strict "колись потім".** У TS-проєкті без `strict: true` з першого дня вмикання через рік коштує тижні. Тут так само: на порожньому проєкті strict безкоштовний. Правильно: `strict = true` у першому коміті, overrides лише для чужого коду.

   ```toml
   [tool.mypy]
   strict = true
   ```

## Підсумок

- Інтерпретатор анотації не перевіряє; mypy і pyright це окремі програми, аналог `tsc --noEmit`, і їх треба явно ставити в редактор, pre-commit і CI.
- Формат виводу `файл:рядок: error: повідомлення  [код]`; код помилки йде в `# type: ignore[код]` і в конфіг. Код виходу `1` означає помилки.
- За замовчуванням mypy не перевіряє тіла неанотованих функцій; `--strict` вмикає тринадцять прапорців, серед них і перевірку тіл, і обов'язкові анотації.
- Конфіг у `pyproject.toml`: `[tool.mypy]` зі `strict = true`, `files`, `python_version`, `warn_unused_configs`; `[[tool.mypy.overrides]]` для окремих модулів за іменем модуля, а не шляхом.
- Narrowing працює через `is None`, `isinstance`, `assert`, truthiness, ранній `return` і `match`; `assert_never` дає перевірку повноти, як `never` у TS.
- Результат виклику, збережену в змінну умову й перепризначену в замиканні змінну mypy не звужує; атрибут звужує навіть після виклику, що його змінює. Ліки: локальна змінна або `:=`.
- `Any` вимикає перевірку і тихо присвоюється будь-чому; `cast` у рантаймі нічого не робить; голий `type: ignore` ховає зайве.
- Сторонні типи: `py.typed` у пакеті, `types-*` з typeshed, інакше власний `.pyi` або `ignore_missing_imports` як крайній варіант.
- Pylance це pyright; він і mypy розходяться в деталях, правий той, що в CI.
- Чекер доводить узгодженість типів, а не правильність логіки; тести лишаються.

## Що далі

Наступний урок m2-l09 про Pydantic v2: саме він закриває дірку, яку цей урок показав кілька разів, коли `json.loads` повертає `Any`, а анотація лише обіцяє тип. Strict-конфіг капстоуну звідси стане перевіркою для моделей конфігу форми, а в m3-l06 той самий `uv run mypy` переїде в pre-commit поруч з ruff.
