---
id: m3-l03
module: m3-modules-tests
title: "pytest: assert, parametrize, fixtures, conftest.py"
summary: "Учень пише тести на pytest без звичок Jest: плоскі функції з голим assert, parametrize замість it.each, фікстури з інʼєкцією за іменем і yield замість beforeEach/afterEach, conftest.py з фабриками даних, вбудовані tmp_path, monkeypatch, capsys, caplog, маркери, і читає вивід падіння."
duration_min: 100
prerequisites: [m3-l02]
---

## Тест це функція з `assert`

У Jest тест це виклик `it(...)` з колбеком, а перевірка це ланцюжок матчерів `expect(x).toBe(y)`. У pytest немає ні реєстрації тестів, ні матчерів. Тест це звичайна функція з іменем `test_*` у файлі `test_*.py`, а перевірка це вбудований оператор мови `assert`. pytest сам знаходить такі функції (collection, офіційний термін документації pytest: збирання тестів) і викликає кожну окремо.

```ts
// slug.test.ts
import { slugify } from "./slug";

describe("slugify", () => {
  it("joins words with dashes", () => {
    expect(slugify("Contact Us")).toBe("contact-us");
  });
});
```

```python
# test_slug.py
def slugify(title: str) -> str:
    return "-".join(title.lower().split())


def test_slugify_spaces():
    assert slugify("Contact Us") == "contact-us"


def test_slugify_punctuation():
    assert slugify("Hello, World!") == "hello-world"
```

Розходження в тому, де живе знання про порівняння. У Jest його несе матчер: `toBe`, `toEqual`, `toContain`, `toMatchObject`, і кожен знає, як красиво показати різницю. У pytest порівняння це звичайний Python-вираз (`==`, `in`, `is`, `<`, `isinstance`), а показ різниці pytest бере на себе. Тому матчерів вчити не треба: ви вже знаєте весь "API" перевірок, це оператори мови. Функцію в прикладі покладено в тестовий файл лише для компактності; у проєкті вона в `src/`. Запуск:

```bash
uv run pytest
```

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.12, pytest-9.1.1, pluggy-1.7.0
collected 2 items

test_slug.py .F                                                          [100%]

=================================== FAILURES ===================================
___________________________ test_slugify_punctuation ___________________________

    def test_slugify_punctuation():
>       assert slugify("Hello, World!") == "hello-world"
E       AssertionError: assert 'hello,-world!' == 'hello-world'
E         
E         - hello-world
E         + hello,-world!
E         ?      +      +

test_slug.py:11: AssertionError
=========================== short test summary info ============================
FAILED test_slug.py::test_slugify_punctuation - AssertionError: assert 'hello...
========================= 1 failed, 1 passed in 0.02s ==========================
```

(Тут і далі з заголовка сесії прибрано рядки `rootdir:` і `plugins:`, а шляхи скорочено до імен файлів.) Звичайний `assert` у Python такого не вміє. Без pytest невдала перевірка дає голий `AssertionError` без жодних значень; єдине, що можна додати, це рядок-повідомлення після коми.

```python live
def slugify(title: str) -> str:
    return "-".join(title.lower().split())


try:
    assert slugify("Hello, World!") == "hello-world"
except AssertionError as exc:
    print(repr(exc))

try:
    assert slugify("Hello, World!") == "hello-world", "slug must drop punctuation"
except AssertionError as exc:
    print(repr(exc))
```

```text
AssertionError()
AssertionError('slug must drop punctuation')
```

> **Під капотом.** Значення обох сторін з'являються завдяки assertion rewriting (офіційний термін документації pytest). pytest ставить власний import hook, і коли імпортується тестовий модуль, він парсить його в AST, переписує кожен `assert` у код, що зберігає проміжні значення, і лише потім компілює. Переписаний байткод кешується окремо від звичайного, з тегом pytest в імені: `__pycache__/test_slug.cpython-312-pytest-9.1.1.pyc`. Перевірити, що вся магія саме тут, можна прапорцем `--assert=plain`, який вимикає переписування: той самий тест падає з голим `AssertionError`.

```bash
uv run pytest -q --assert=plain
```

```text
    def test_slugify_punctuation():
>       assert slugify("Hello, World!") == "hello-world"
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E       AssertionError
```

Повідомлення після коми в pytest теж працює і не заважає переписуванню: pytest показує і його, і розкладку значень. Але воно потрібне рідко, бо назва тесту і розкладка вже кажуть, що зламалось.

> **Пастка.** `assert (x == y, "message")` з дужками навколо всього це перевірка кортежу, а непорожній кортеж завжди truthy. Такий assert не впаде ніколи. Звичка тягнеться з `expect(x, "message")` і з виклику функції з двома аргументами, але `assert` це оператор, а не функція. Python і pytest попереджають, проте лише попередженням, тест лишається зеленим.

```python live
status = "draft"
assert (status == "published", "form must be published")
print("passed, although status is", status)
print(bool((False, "message")))
```

```text
SyntaxWarning: assertion is always true, perhaps remove parentheses?
passed, although status is draft
True
```

Під pytest те саме: попередження в підсумку і зелений тест. Поруч правильна форма з повідомленням після коми, і видно, що pytest друкує і повідомлення, і розкладку значень.

```python
# test_tuple.py
def test_message_in_parens():
    status = "draft"
    assert (status == "published", "form must be published")


def test_message_after_comma():
    status = "draft"
    assert status == "published", "form must be published"
```

```text
.F                                                                       [100%]
=================================== FAILURES ===================================
___________________________ test_message_after_comma ___________________________

    def test_message_after_comma():
        status = "draft"
>       assert status == "published", "form must be published"
E       AssertionError: form must be published
E       assert 'draft' == 'published'
E         
E         - published
E         + draft

test_tuple.py:9: AssertionError
=============================== warnings summary ===============================
test_tuple.py:4
  test_tuple.py:4: PytestAssertRewriteWarning: assertion is always true, perhaps remove parentheses?
    assert (status == "published", "form must be published")
...
1 failed, 1 passed, 1 warning in 0.01s
```

<!-- task: q3 -->

<!-- task: t1 -->

## Запуск і читання падіння

Прапорці pytest майже один в один лягають на знайомі з Jest. `-q` стискає вивід до крапок і підсумку, `-v` друкує кожен тест окремим рядком з його node id (офіційний термін: шлях до тесту виду `файл::клас::функція[параметри]`). `-x` зупиняє сесію на першому падінні, як `--bail`. Файл для прикладів цього розділу:

```python
# test_labels.py
def label(name: str) -> str:
    return name.replace("_", " ").capitalize()


def test_label_snake_case():
    assert label("first_name") == "First name"


def test_label_single_word():
    print("debug: single word")
    assert label("email") == "Email"


def test_label_keeps_acronym():
    assert label("api_key") == "API key"


def test_label_empty():
    assert label("") == ""
```

```bash
uv run pytest -v
uv run pytest -q -x
```

```text
test_labels.py::test_label_snake_case PASSED                             [ 25%]
test_labels.py::test_label_single_word PASSED                            [ 50%]
test_labels.py::test_label_keeps_acronym FAILED                          [ 75%]
test_labels.py::test_label_empty PASSED                                  [100%]
...
FAILED test_labels.py::test_label_keeps_acronym - AssertionError: assert 'Api...
!!!!!!!!!!!!!!!!!!!!!!!!!! stopping after 1 failures !!!!!!!!!!!!!!!!!!!!!!!!!!!
1 failed, 2 passed in 0.02s
```

З `-x` четвертий тест не запускався зовсім: у підсумку два зелені й один червоний.

Замість `test.only` і `-t "pattern"` у pytest є `-k`: вираз над іменами тестів з `and`, `or`, `not` і підрядками. Він фільтрує при запуску і нічого не вимагає міняти в коді, тож забутий у коміті `.only` тут неможливий. Конкретний тест запускають за його node id. `--lf` (last failed) повторює лише ті, що впали минулого разу; список зберігається в `.pytest_cache/`, це аналог `--onlyFailures`.

```bash
uv run pytest -q -k "single or empty"
uv run pytest -v -k "label and not acronym"
uv run pytest -q "test_labels.py::test_label_empty"
uv run pytest -v --lf
```

```text
..                                                                       [100%]
2 passed, 2 deselected in 0.00s

collected 4 items / 1 deselected / 3 selected
test_labels.py::test_label_snake_case PASSED                             [ 33%]
test_labels.py::test_label_single_word PASSED                            [ 66%]
test_labels.py::test_label_empty PASSED                                  [100%]

.                                                                        [100%]
1 passed in 0.00s

collected 1 item
run-last-failure: rerun previous 1 failure
```

pytest перехоплює stdout кожного тесту (capturing, офіційний термін). `print` у зеленому тесті ви не побачите, а в червоному він з'явиться окремою секцією `Captured stdout call` під помилкою. Це протилежність Jest, який друкує `console.log` завжди. `-s` вимикає перехоплення, і `print` іде в термінал одразу.

```bash
uv run pytest -q -s -k single
```

```text
debug: single word
.
1 passed, 3 deselected in 0.00s
```

Найцінніше в падінні це розкладка значень для колекцій. Для списку pytest каже перший індекс, де вони розходяться; для словника окремо перелічує однакові ключі, відмінні й зайві. Тест нижче порівнює словник поля зі зразком і список імен з очікуваним порядком.

```python
def build_field(name: str, required: bool = False) -> dict:
    field = {"name": name, "type": "text", "label": name.title()}
    if required:
        field["validation"] = {"required": True}
    print(f"built {name!r}")
    return field


def test_build_required_field():
    field = build_field("email", required=True)
    assert field == {
        "name": "email",
        "type": "email",
        "label": "Email",
        "validation": {"required": True, "max_length": 254},
    }


def test_field_order():
    names = [f["name"] for f in map(build_field, ["email", "phone", "age"])]
    assert names == ["email", "age", "phone"]
```

```text
>       assert field == {
            "name": "email",
            "type": "email",
            "label": "Email",
            "validation": {"required": True, "max_length": 254},
        }
E       AssertionError: assert {'name': 'ema...uired': True}} == {'name': 'ema...length': 254}}
E         
E         Omitting 2 identical items, use -vv to show
E         Differing items:
E         {'type': 'text'} != {'type': 'email'}
E         {'validation': {'required': True}} != {'validation': {'required': True, 'max_length': 254}}
E         Use -v to get more diff

test_diff.py:11: AssertionError
----------------------------- Captured stdout call -----------------------------
built 'email'
...
>       assert names == ["email", "age", "phone"]
E       AssertionError: assert ['email', 'phone', 'age'] == ['email', 'age', 'phone']
E         
E         At index 1 diff: 'phone' != 'age'
E         Use -v to get more diff
```

Довгі значення обрізаються до `'ema...uired'`. `-vv` показує їх повністю і додає построковий diff. Читати його треба уважно: рядки з `-` це права сторона `==`, тобто очікуване, рядки з `+` це ліва, фактичне. Якщо писати `assert actual == expected`, як у Jest `expect(actual).toEqual(expected)`, то `+` завжди означає "що прийшло насправді".

```bash
uv run pytest -vv -k required
```

Показано лише рядки з `E`:

```text
E       AssertionError: assert {'name': 'email', 'type': 'text', 'label': 'Email', 'validation': {'required': True}} == {'name': 'email', 'type': 'email', 'label': 'Email', 'validation': {'required': True, 'max_length': 254}}
E         
E         Common items:
E         {'label': 'Email', 'name': 'email'}
E         Differing items:
E         {'type': 'text'} != {'type': 'email'}
E         {'validation': {'required': True}} != {'validation': {'required': True, 'max_length': 254}}
E         
E         Full diff:
E           {
E               'name': 'email',
E         -     'type': 'email',
E         ?               ^^^^
E         +     'type': 'text',
E         ?              + ^^
E               'label': 'Email',
E               'validation': {
E                   'required': True,
E         -         'max_length': 254,
E               },
E           }
```

Протилежний бік: коли падінь багато, повний traceback заважає. `--tb=short` лишає по рядку на кадр, `--tb=line` по рядку на падіння. `-l` (`--showlocals`) друкує локальні змінні тесту в момент падіння, і це часто швидше, ніж ставити `breakpoint()`.

```bash
uv run pytest -q --tb=short -l -k order
```

```text
_______________________________ test_field_order _______________________________
test_diff.py:21: in test_field_order
    assert names == ["email", "age", "phone"]
E   AssertionError: assert ['email', 'phone', 'age'] == ['email', 'age', 'phone']
E     
E     At index 1 diff: 'phone' != 'age'
E     Use -v to get more diff
        names      = ['email', 'phone', 'age']
----------------------------- Captured stdout call -----------------------------
built 'email'
built 'phone'
built 'age'
```

## Винятки, попередження і float

`expect(() => fn()).toThrow(...)` у pytest це контекстний менеджер `pytest.raises`: код, що має кинути, пишеться в блоці `with`. Лямбда-обгортка не потрібна, бо `with` сам ловить виняток, що вилетів з блоку (механізм `with` у m4-l07). Параметр `match` перевіряє текст повідомлення, а `as excinfo` дає доступ до самого об'єкта винятку через `excinfo.value` після блоку.

```ts
expect(() => parseMaxLength("-5")).toThrow(RangeError);
expect(() => parseMaxLength("-5")).toThrow(/>= 0, got -5/);
```

```python
import pytest


def parse_max_length(raw: str) -> int:
    value = int(raw)
    if value < 0:
        raise ValueError(f"max_length must be >= 0, got {value}")
    return value


def test_negative_rejected():
    with pytest.raises(ValueError, match=r">= 0, got -5"):
        parse_max_length("-5")


def test_not_a_number():
    with pytest.raises(ValueError) as excinfo:
        parse_max_length("ten")
    print(type(excinfo.value).__name__, excinfo.value.args)
    assert "invalid literal" in str(excinfo.value)


def test_wrong_message():
    with pytest.raises(ValueError, match="must be positive"):
        parse_max_length("-5")


def test_no_exception():
    with pytest.raises(ValueError):
        parse_max_length("5")
```

```bash
uv run pytest -q -s
```

```text
.ValueError ("invalid literal for int() with base 10: 'ten'",)
.FF
...
>       with pytest.raises(ValueError, match="must be positive"):
E       AssertionError: Regex pattern did not match.
E         Expected regex: 'must be positive'
E         Actual message: 'max_length must be >= 0, got -5'
...
>       with pytest.raises(ValueError):
E       Failed: DID NOT RAISE ValueError
```

Розходження з Jest два. Перше: `pytest.raises(ValueError)` ловить і підкласи, як `except ValueError`, тож `pytest.raises(Exception)` пройде на будь-якій помилці, включно з `KeyError` від опечатки в тесті; клас винятку треба брати якомога вужчий. Друге: `assert` після рядка, що кинув, усередині `with` не виконається ніколи, тому перевірки на `excinfo.value` пишуть після блоку з меншим відступом. Обидва тести нижче зелені, хоча жоден нічого корисного не перевіряє.

```python
def test_too_broad():
    config = {"id": "signup"}
    with pytest.raises(Exception):
        parse_max_length(config["max_length"])  # KeyError, not ValueError


def test_dead_assert():
    with pytest.raises(ValueError) as excinfo:
        parse_max_length("-5")
        assert excinfo.value.args == ("never checked",)
```

```text
..                                                                       [100%]
2 passed in 0.00s
```

> **Пастка.** `match` це регулярний вираз, який шукається через `re.search`, а не підрядок. Jest `toThrow("text")` шукає підрядок, тож звичка писати туди людський текст переноситься, і все працює, поки в повідомленні не з'являться дужки, крапки, `?` або `[`. Тоді pytest скаже "Regex pattern did not match" на повідомленні, яке візуально збігається. Для буквального тексту є `re.escape`.

```python live
import re

msg = "visible_if references unknown field 'phone' (in step 2)"
print(bool(re.search("unknown field", msg)))
print(bool(re.search("'phone' (in step 2)", msg)))
print(bool(re.search(re.escape("'phone' (in step 2)"), msg)))
print(re.escape("(in step 2)"))
```

```text
True
False
True
\(in\ step\ 2\)
```

<!-- task: q2 -->

`pytest.warns` працює так само для попереджень з модуля `warnings`. Вони не є винятками: код продовжує роботу і повертає значення, тому з блоку можна забрати результат. Типовий випадок для FormBuilder: старий ключ конфігу ще приймається, але має попередити про deprecation.

```python
# test_warns_approx.py
import warnings

import pytest


def read_placeholder(field: dict) -> str:
    if "placeholderText" in field:
        warnings.warn("placeholderText is deprecated, use placeholder", DeprecationWarning)
        return field["placeholderText"]
    return field.get("placeholder", "")


def test_old_key_warns():
    with pytest.warns(DeprecationWarning, match="use placeholder"):
        value = read_placeholder({"placeholderText": "Your email"})
    assert value == "Your email"
```

Для float рівність через `==` ламається на тих самих `0.1 + 0.2`, що й у JS. Аналог `toBeCloseTo` це `pytest.approx`: за замовчуванням відносна точність `1e-6`, явна абсолютна через `abs=`. На відміну від `toBeCloseTo`, `approx` обгортає і списки, і словники, порівнюючи поелементно. У стандартній бібліотеці для одного числа є `math.isclose`.

```python live
import math

print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)
print(math.isclose(0.1 + 0.2, 0.3))
print(abs(1 / 3 * 100 - 33.33) <= 0.01)
```

```text
0.30000000000000004
False
True
True
```

```python
# test_warns_approx.py, продовження
def conversion_rate(submits: int, views: int) -> float:
    return submits / views * 100


def test_float_plain():
    assert 0.1 + 0.2 == 0.3


def test_float_approx():
    assert 0.1 + 0.2 == pytest.approx(0.3)
    assert conversion_rate(1, 3) == pytest.approx(33.33, abs=0.01)
    assert [0.1 + 0.2, 1 / 3] == pytest.approx([0.3, 0.3333333])
    assert {"rate": 0.1 + 0.2} == pytest.approx({"rate": 0.3})


def test_float_approx_fails():
    assert conversion_rate(1, 3) == pytest.approx(33.3)
```

```text
>       assert 0.1 + 0.2 == 0.3
E       assert (0.1 + 0.2) == 0.3
...
>       assert conversion_rate(1, 3) == pytest.approx(33.3)
E       assert 33.33333333333333 == 33.3 ± 3.3e-05
E         
E         comparison failed
E         Obtained: 33.33333333333333
E         Expected: 33.3 ± 3.3e-05
...
2 failed, 2 passed in 0.02s
```

Зелені тут `test_old_key_warns` і `test_float_approx`; `± 3.3e-05` у повідомленні це і є відносна точність `1e-6`, помножена на очікуване `33.3`.

## `parametrize` замість `it.each`

Один тест на багато вхідних даних у Jest пишуть через `it.each(table)`. У pytest це marker (маркер, офіційний термін для декораторів `@pytest.mark.*`) `parametrize`: перший аргумент це імена параметрів, другий це список рядків таблиці. pytest створює окремий тест на кожен рядок, і кожен падає, проходить і перезапускається незалежно.

```ts
it.each([
  ["#2563eb", true],
  ["2563eb", false],
])("isHexColor(%s) -> %s", (value, expected) => {
  expect(isHexColor(value)).toBe(expected);
});
```

```python
import re

import pytest


def is_hex_color(value: str) -> bool:
    return re.fullmatch(r"#[0-9a-fA-F]{6}", value) is not None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("#2563eb", True),
        ("#2563EB", True),
        ("2563eb", False),
        ("#256", False),
        ("#2563eg", False),
        ("", False),
    ],
)
def test_is_hex_color(value, expected):
    assert is_hex_color(value) == expected
```

```text
test_colors.py::test_is_hex_color[#2563eb-True] PASSED                   [ 16%]
test_colors.py::test_is_hex_color[#2563EB-True] PASSED                   [ 33%]
test_colors.py::test_is_hex_color[2563eb-False] PASSED                   [ 50%]
test_colors.py::test_is_hex_color[#256-False] PASSED                     [ 66%]
test_colors.py::test_is_hex_color[#2563eg-False] PASSED                  [ 83%]
test_colors.py::test_is_hex_color[-False] PASSED                         [100%]
```

Значення потрапляють у тест за іменами: `"value"` з декоратора стає параметром `value` функції. Імена можна дати і рядком `"value,expected"`, але кортеж рядків надійніший для рефакторингу. Різниця з `it.each` у назвах: Jest будує назву з printf-шаблону, який ви пишете, а pytest генерує id (офіційний термін: parameter ID) сам. Рядки, числа, `bool` і `None` потрапляють в id як є, через дефіс; усе інше, словник, список, об'єкт, стає іменем параметра з номером рядка: `field0`, `field1`. Такий id нічого не каже, тому для складних значень id задають явно.

Явний id і окремі мітки для одного рядка дає `pytest.param(...)`. `marks=pytest.mark.xfail` позначає рядок як відоме падіння (xfail, expected failure, офіційний термін): тест виконується, але його падіння не червоне. `ids=` приймає або список рядків, або функцію від значення.

```python
def is_required(field: dict) -> bool:
    return bool(field.get("validation", {}).get("required"))


@pytest.mark.parametrize(
    ("field", "expected"),
    [
        ({"name": "email", "validation": {"required": True}}, True),
        ({"name": "phone"}, False),
        ({"name": "age", "validation": {"required": "yes"}}, False),
    ],
)
def test_is_required_auto_ids(field, expected):
    assert is_required(field) == expected


@pytest.mark.parametrize(
    ("field", "expected"),
    [
        pytest.param({"name": "email", "validation": {"required": True}}, True, id="required"),
        pytest.param({"name": "phone"}, False, id="no-validation"),
        pytest.param(
            {"name": "age", "validation": {"required": "yes"}},
            False,
            id="string-is-not-bool",
            marks=pytest.mark.xfail(reason="truthiness: 'yes' counts as required"),
        ),
    ],
)
def test_is_required(field, expected):
    assert is_required(field) == expected


@pytest.mark.parametrize("name", ["email", "phone"], ids=lambda n: f"field={n}")
def test_ids_callable(name):
    assert name


@pytest.mark.parametrize("value,expected", [("a", 1)])
def test_string_names(value, expected):
    assert (value, expected) == ("a", 1)
```

```text
test_required.py::test_is_required_auto_ids[field0-True] PASSED          [ 11%]
test_required.py::test_is_required_auto_ids[field1-False] PASSED         [ 22%]
test_required.py::test_is_required_auto_ids[field2-False] FAILED         [ 33%]
test_required.py::test_is_required[required] PASSED                      [ 44%]
test_required.py::test_is_required[no-validation] PASSED                 [ 55%]
test_required.py::test_is_required[string-is-not-bool] XFAIL (truthi...) [ 66%]
test_required.py::test_ids_callable[field=email] PASSED                  [ 77%]
test_required.py::test_ids_callable[field=phone] PASSED                  [ 88%]
test_required.py::test_string_names[a-1] PASSED                          [100%]

=================================== FAILURES ===================================
___________________ test_is_required_auto_ids[field2-False] ____________________

field = {'name': 'age', 'validation': {'required': 'yes'}}, expected = False

    ...
>       assert is_required(field) == expected
E       AssertionError: assert True == False
E        +  where True = is_required({'name': 'age', 'validation': {'required': 'yes'}})
```

Падіння параметризованого тесту одразу друкує значення параметрів цього рядка, а рядок `+ where True = is_required(...)` показує, що повернув виклик усередині assert. Це теж assertion rewriting: pytest запам'ятовує результати викликів, а не лише дві сторони `==`. id рядка годиться для `-k`: `-k "string-is-not-bool"` запускає один рядок таблиці (тут з папки, де лежать і інші файли цього розділу, тому deselected так багато).

```bash
uv run pytest -v -k "string-is-not-bool"
```

```text
collected 34 items / 33 deselected / 1 selected

test_required.py::test_is_required[string-is-not-bool] XFAIL (truthi...) [100%]

====================== 33 deselected, 1 xfailed in 0.02s =======================
```

<!-- task: t2 -->

Кілька декораторів `parametrize` на одному тесті дають декартовий добуток: два значення на три дають шість тестів. Порядок у id іде від найближчого до функції декоратора, і саме його значення змінюються найповільніше. Таблиця на кшталт "кожен тип поля в кожній темі" пишеться без вкладених циклів.

```python
# test_matrix.py
@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("required", [True, False])
@pytest.mark.parametrize("input_type", ["text", "email", "tel"])
def test_render(theme, required, input_type):
    pass
```

```bash
uv run pytest --collect-only -q test_matrix.py
```

```text
test_matrix.py::test_render[text-True-light]
test_matrix.py::test_render[text-True-dark]
test_matrix.py::test_render[text-False-light]
test_matrix.py::test_render[text-False-dark]
test_matrix.py::test_render[email-True-light]
...
test_matrix.py::test_render[tel-False-dark]

12 tests collected in 0.00s
```

`--collect-only` показує, що pytest зібрав, нічого не запускаючи. Повторювані id pytest робить унікальними суфіксом: `a0`, `a1`, а якщо id закінчується цифрою, то через підкреслення, `email-3_0`. З опцією `strict = true` (pytest 9, розділ про конфіг нижче) повтори id стають помилкою збирання.

```python
# test_ids.py
@pytest.mark.parametrize(
    ("value", "limit"),
    [("email", 3), ("", None), ("a b", 1.5), (True, -2), ({"k": 1}, [1, 2]), ("email", 3), ((1, 2), "x")],
)
def test_auto(value, limit):
    pass
```

```text
test_ids.py::test_auto[email-3_0]
test_ids.py::test_auto[-None]
test_ids.py::test_auto[a b-1.5]
test_ids.py::test_auto[True--2]
test_ids.py::test_auto[value4-limit4]
test_ids.py::test_auto[email-3_1]
test_ids.py::test_auto[value6-x]

7 tests collected in 0.00s
```

<!-- task: q4 -->

<!-- task: t4 -->

## Фікстури: інʼєкція за іменем замість `beforeEach`

У Jest підготовка даних живе в `beforeEach`, який пише в змінну з зовнішнього scope `describe`, а тест цю змінну читає. У pytest це fixture (фікстура, офіційний термін): функція з декоратором `@pytest.fixture`, яка повертає значення. Тест просить фікстуру, назвавши параметр так само, як вона називається, і pytest передає туди результат її виклику.

```ts
let form: FormConfig;

beforeEach(() => {
  form = { id: "signup", elements: [{ type: "input", name: "email" }] };
});

it("has email", () => {
  expect(form.elements[0].name).toBe("email");
});
```

```python
import pytest


@pytest.fixture
def form():
    return {"id": "signup", "elements": [{"type": "input", "name": "email"}]}


def test_has_email(form):
    assert form["elements"][0]["name"] == "email"


def test_add_element(form):
    form["elements"].append({"type": "button", "label": "Send"})
    assert len(form["elements"]) == 2


def test_still_one_element(form):
    assert len(form["elements"]) == 1


def test_typo(fomr):
    assert fomr
```

```text
...E                                                                     [100%]
==================================== ERRORS ====================================
_________________________ ERROR at setup of test_typo __________________________
file test_fixtures.py, line 22
  def test_typo(fomr):
E       fixture 'fomr' not found
>       available fixtures: cache, capfd, capfdbinary, caplog, capsys, ..., form, monkeypatch, ..., tmp_path, tmp_path_factory, tmpdir, tmpdir_factory
>       use 'pytest --fixtures [testpath]' for help on them.
=========================== short test summary info ============================
ERROR test_fixtures.py::test_typo
3 passed, 1 error in 0.00s
```

(Список доступних фікстур скорочено.) Різниця з `beforeEach` у трьох речах. Залежність явна: з сигнатури видно, що тесту потрібно, і фікстура виконується лише для тих тестів, які її просять, тоді як `beforeEach` працює для кожного тесту блоку. Стану між тестами немає: за замовчуванням фікстура викликається заново для кожного тесту, тому `test_add_element` не зачіпає `test_still_one_element`, а в Jest те саме залежить від того, чи ви не забули перестворити об'єкт. І помилка в підготовці відрізняється від падіння перевірки: pytest пише `ERROR`, а не `FAILED`, тобто зламано не код, а оточення тесту.

Механізм пояснює, чому опечатка в імені параметра ловиться ще до запуску: pytest читає сигнатуру тестової функції і для кожного імені шукає фікстуру. Це та сама інтроспекція, що доступна будь-якому Python-коду.

```python live
import inspect


def test_title(saved_form, db):
    ...


print(list(inspect.signature(test_title).parameters))

fixtures = {"db": lambda: {"configs": {}}, "saved_form": lambda: {"title": "Sign up"}}
kwargs = {name: fixtures[name]() for name in inspect.signature(test_title).parameters}
print(kwargs)
```

```text
['saved_form', 'db']
{'saved_form': {'title': 'Sign up'}, 'db': {'configs': {}}}
```

`afterEach` окремо не пишуть. Фікстура, що робить `yield` замість `return`, віддає значення в тест, а код після `yield` виконується після тесту, навіть якщо тест упав: підготовка й прибирання лежать поруч в одній функції. Фікстура може просити інші фікстури тим самим способом, через параметри. `scope="module"` або `scope="session"` створює значення один раз на файл або на весь запуск, як `beforeAll`. `autouse=True` вмикає фікстуру для всіх тестів у її зоні видимості без явного параметра. Вбудована фікстура `request` дає доступ до поточного тесту, тут до його імені.

```python
import pytest


@pytest.fixture(scope="module")
def db():
    print("\n[db] connect")
    conn = {"configs": {}}
    yield conn
    print("[db] close")


@pytest.fixture
def saved_form(db):
    print("[saved_form] insert")
    db["configs"]["signup"] = {"title": "Sign up"}
    yield db["configs"]["signup"]
    print("[saved_form] delete")
    del db["configs"]["signup"]


@pytest.fixture(autouse=True)
def trace(request):
    print(f"[trace] start {request.node.name}")
    yield
    print(f"[trace] end {request.node.name}")


def test_title(saved_form):
    print("  test_title body")
    assert saved_form["title"] == "Sign up"


def test_db_is_clean(db):
    print("  test_db_is_clean body")
    assert db["configs"] == {}
```

```bash
uv run pytest -q -s
```

```text
[db] connect
[trace] start test_title
[saved_form] insert
  test_title body
.[saved_form] delete
[trace] end test_title
[trace] start test_db_is_clean
  test_db_is_clean body
.[trace] end test_db_is_clean
[db] close

2 passed in 0.00s
```

Порядок читається з виводу: фікстури ширшого scope створюються першими, `db` один раз на модуль і закривається після останнього тесту файлу; прибирання йде у зворотному порядку створення, як розмотування стеку. `saved_form` прибрав за собою, тому `test_db_is_clean` бачить порожню базу; і `insert` для нього не друкувався, бо цей тест `saved_form` не просив. Прибирання виконується і після червоного тесту. А якщо фікстура впала до `yield`, тест отримує `ERROR`, і код після `yield` не виконується, бо прибирати нічого.

```python
@pytest.fixture
def resource():
    print("\n[resource] setup")
    yield "r"
    print("[resource] teardown")


@pytest.fixture
def broken():
    print("\n[broken] setup")
    raise RuntimeError("db is down")
    yield
    print("[broken] teardown")


def test_fails(resource):
    assert resource == "other"


def test_uses_broken(broken):
    pass
```

```bash
uv run pytest -q -s --tb=line
```

```text
[resource] setup
F[resource] teardown

[broken] setup
E
...
FAILED test_teardown.py::test_fails - AssertionError: assert 'r' == 'other'
ERROR test_teardown.py::test_uses_broken - RuntimeError: db is down
1 failed, 1 error in 0.01s
```

> **Пастка.** `scope="module"` з мутабельним значенням повертає ту саму модель Jest з `beforeAll` і спільним об'єктом: перший тест міняє дані, другий бачить зміни. Гірше, що кожен тест окремо зелений, а червоним стає лише порядок, у якому їх запустили. Ширший scope виправданий для дорогих і незмінних ресурсів (з'єднання, скомпільована схема, піднятий застосунок), а не для даних.

```python
@pytest.fixture(scope="module")
def base_form():
    return {"id": "signup", "elements": []}


def test_add_button(base_form):
    base_form["elements"].append({"type": "button"})
    assert len(base_form["elements"]) == 1


def test_form_starts_empty(base_form):
    assert base_form["elements"] == []
```

```text
base_form = {'id': 'signup', 'elements': [{'type': 'button'}]}

    def test_form_starts_empty(base_form):
>       assert base_form["elements"] == []
E       AssertionError: assert [{'type': 'button'}] == []
E         
E         Left contains one more item: {'type': 'button'}
...
1 failed, 1 passed in 0.02s
```

```bash
uv run pytest -q test_leak.py -k starts
```

```text
1 passed, 1 deselected in 0.00s
```

<!-- task: q1 -->

## `conftest.py`, класи `Test*` і фабрики даних

Структуру проєкту задав m0-l06: код у `src/formbuilder/`, тести в окремому `tests/` без `__init__.py`, у `pyproject.toml` секція `[tool.pytest.ini_options]` з `testpaths = ["tests"]` і `addopts = ["--import-mode=importlib"]`. Наслідок `importlib`-режиму, згаданий там: тестові файли не імпортують один одного. Спільне між ними кладуть у `conftest.py` (офіційна назва файлу; документація називає його local per-directory plugin).

`conftest.py` не імпортують. pytest сам підвантажує кожен `conftest.py` на шляху від `rootdir` до тестового файлу, і фікстури з нього доступні всім тестам цієї папки та вкладених. Фікстура з тим самим іменем у глибшому `conftest.py` перекриває зовнішню і може попросити зовнішню як параметр, щоб її розширити. Це заміна `setupFiles` і спільних хелперів, які в Jest імпортують у кожен файл руками.

```text
tests/
├── conftest.py            # make_form, theme
├── test_forms.py
└── rendering/
    ├── conftest.py        # theme перевизначено
    └── test_render.py
```

```python
# tests/conftest.py
from collections.abc import Callable
from typing import Any

import pytest

type Form = dict[str, Any]


@pytest.fixture
def make_form() -> Callable[..., Form]:
    """Factory: a fresh minimal form; keyword arguments replace top-level keys."""

    def _make(**overrides: Any) -> Form:
        form: Form = {
            "id": "signup",
            "title": "Sign up",
            "elements": [{"type": "input", "name": "email"}],
        }
        form.update(overrides)
        return form

    return _make


@pytest.fixture
def theme() -> str:
    """Default theme name."""
    return "light"
```

```python
# tests/rendering/conftest.py
import pytest


@pytest.fixture
def theme(theme: str) -> str:
    """Rendering tests use the high-contrast variant of the parent theme."""
    return f"{theme}-high-contrast"
```

```python
# tests/test_forms.py
def test_default_form(make_form):
    assert make_form()["title"] == "Sign up"


def test_two_independent_forms(make_form):
    a = make_form()
    b = make_form(title="Contact", elements=[])
    a["elements"].append({"type": "button"})
    assert len(a["elements"]) == 2
    assert b["elements"] == []
    assert make_form()["elements"] == [{"type": "input", "name": "email"}]


def test_theme(theme):
    assert theme == "light"


# tests/rendering/test_render.py
def test_theme_overridden(theme, make_form):
    assert theme == "light-high-contrast"
    assert make_form(id="landing")["id"] == "landing"
```

```bash
uv run pytest -v
uv run pytest --fixtures tests/rendering
```

Вивід `--fixtures` обрізано до фікстур проєкту; вище в ньому йдуть вбудовані.

```text
tests/rendering/test_render.py::test_theme_overridden PASSED             [ 25%]
tests/test_forms.py::test_default_form PASSED                            [ 50%]
tests/test_forms.py::test_two_independent_forms PASSED                   [ 75%]
tests/test_forms.py::test_theme PASSED                                   [100%]

--------------------- fixtures defined from tests.conftest ---------------------
make_form -- tests/conftest.py:11
    Factory: a fresh minimal form; keyword arguments replace top-level keys.

theme -- tests/conftest.py:27
    Default theme name.

---------------- fixtures defined from tests.rendering.conftest ----------------
theme -- tests/rendering/conftest.py:6
    Rendering tests use the high-contrast variant of the parent theme.
```

`make_form` це factory fixture ("factories as fixtures", назва патерну з документації pytest): фікстура повертає не дані, а функцію, яка їх будує. Тест отримує стільки об'єктів, скільки треба, і кожен з потрібними відмінностями, а дефолти описані в одному місці. Це краще за десяток фікстур `valid_form`, `form_without_title`, `form_with_two_buttons`: тест показує саме ту відмінність, яку перевіряє, `make_form(title="")`, і не змушує читача шукати визначення. `--fixtures` друкує docstring кожної фікстури, тому однорядковий docstring тут не формальність. Важливо, що словник збирається всередині `_make` на кожен виклик. Модульна константа з дефолтами і `{**DEFAULT, **overrides}` дає неглибоку копію, і вкладені списки ділять усі "незалежні" об'єкти.

```python live
DEFAULT_FORM = {"id": "signup", "elements": []}


def make_form(**overrides):
    return {**DEFAULT_FORM, **overrides}


a = make_form()
a["elements"].append({"type": "button"})
b = make_form(id="contact")
print(b["elements"])
print(a["elements"] is b["elements"] is DEFAULT_FORM["elements"])
```

```text
[{'type': 'button'}]
True
```

<!-- task: t3 -->

Класи в pytest лише групують тести, як `describe`, і не більше. Клас має називатися `Test*`, не наслідуватися ні від чого і не мати `__init__`. На кожен тест-метод pytest створює новий екземпляр класу, тому `self.x` з одного тесту в іншому не видно. Атрибут класу, навпаки, один на всі тести, і це той самий спільний мутабельний стан, що й у модульній фікстурі. Клас з `__init__` pytest не збирає взагалі і лише попереджає.

```python
def label(name: str) -> str:
    return name.replace("_", " ").capitalize()


class TestLabel:
    seen: list[str] = []

    def test_snake_case(self):
        self.count = 1
        self.seen.append("snake")
        assert label("first_name") == "First name"

    def test_single_word(self):
        print(hasattr(self, "count"), self.seen)
        assert label("email") == "Email"


class TestWithInit:
    def __init__(self):
        self.form = {}

    def test_never_runs(self):
        assert False
```

```text
test_classes.py::TestLabel::test_snake_case PASSED
test_classes.py::TestLabel::test_single_word False ['snake']
PASSED

=============================== warnings summary ===============================
test_classes.py:18
  test_classes.py:18: PytestCollectionWarning: cannot collect test class 'TestWithInit' because it has a __init__ constructor (from: test_classes.py)
    class TestWithInit:
========================= 2 passed, 1 warning in 0.00s =========================
```

> **Пастка.** Assertion rewriting діє лише на тестові модулі (`test_*.py`, `*_test.py`) і `conftest.py`. Хелпер з `assert` у звичайному модулі, наприклад `tests/helpers.py`, падає голим `AssertionError` без значень. Перевірки, які хочеться перевикористати, кладуть у `conftest.py` як фікстуру або реєструють модуль через `pytest.register_assert_rewrite("helpers")` до його імпорту.

```python
# tests/helpers.py
def assert_valid_field(field: dict) -> None:
    assert field["type"] in {"input", "text", "button", "block"}


# tests/conftest.py
@pytest.fixture
def assert_field():
    def _check(field: dict) -> None:
        assert field["type"] in {"input", "text", "button", "block"}
    return _check
```

Обидва тести викликають ту саму перевірку з полем `{"type": "select"}`, перший через функцію з `helpers.py`, другий через фікстуру `assert_field`.

```text
____________________________ test_via_helper_module ____________________________
E       AssertionError
______________________________ test_via_conftest _______________________________
E       AssertionError: assert 'select' in {'block', 'button', 'input', 'text'}
```

## Вбудовані фікстури: `tmp_path`, `monkeypatch`, `capsys`, `caplog`

pytest приносить готові фікстури для того, що в Jest робиться хаками. Усі вони прибирають за собою після тесту автоматично. `tmp_path` це унікальна порожня тека (`pathlib.Path`, детально в m6-l01) для кожного тесту; pytest створює її в системній тимчасовій директорії і зберігає три останні запуски для розбору. Ім'я теки похідне від імені тесту.

`monkeypatch` (офіційна назва фікстури; "monkey patching" це жаргонна назва підміни атрибутів під час виконання) замінює `process.env.X = ...` з ручним відновленням: `setenv` і `delenv` для змінних оточення, `chdir` для робочої директорії, `setattr` для атрибута модуля чи об'єкта. Після тесту все повертається як було. `capsys` перехоплює stdout і stderr, `readouterr()` повертає те, що надрукувалось з минулого виклику, це заміна `jest.spyOn(console, "log")`. `caplog` збирає записи `logging` (модуль логування у m5-l09); `set_level` вмикає потрібний рівень для конкретного логера.

```python
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("formbuilder.publish")


def publish(config: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{config['id']}.json"
    target.write_text(json.dumps(config))
    print(f"published {target.name}")
    logger.info("published %s", config["id"])
    if not config.get("elements"):
        logger.warning("form %s has no elements", config["id"])
    return target


def output_dir() -> Path:
    return Path(os.environ.get("FORMBUILDER_OUT", "dist"))


def test_publish_writes_file(tmp_path):
    target = publish({"id": "signup", "elements": [1]}, tmp_path / "dist")
    print(tmp_path.name)
    assert target.read_text() == '{"id": "signup", "elements": [1]}'
    assert [p.name for p in (tmp_path / "dist").iterdir()] == ["signup.json"]


def test_output_dir_from_env(monkeypatch):
    monkeypatch.setenv("FORMBUILDER_OUT", "/srv/forms")
    assert output_dir() == Path("/srv/forms")


def test_output_dir_default(monkeypatch):
    monkeypatch.delenv("FORMBUILDER_OUT", raising=False)
    assert output_dir() == Path("dist")


def test_relative_paths(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    target = publish({"id": "landing", "elements": [1]}, output_dir())
    assert target.resolve() == tmp_path / "dist" / "landing.json"


def test_stdout(tmp_path, capsys):
    publish({"id": "signup", "elements": [1]}, tmp_path)
    captured = capsys.readouterr()
    assert captured.out == "published signup.json\n"
    assert captured.err == ""


def test_warning_logged(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="formbuilder.publish")
    publish({"id": "empty", "elements": []}, tmp_path)
    assert [r.levelname for r in caplog.records] == ["INFO", "WARNING"]
    assert "has no elements" in caplog.text


def test_monkeypatch_setattr(monkeypatch, tmp_path):
    monkeypatch.setattr(json, "dumps", lambda obj: "stub")
    target = publish({"id": "x", "elements": [1]}, tmp_path)
    assert target.read_text() == "stub"


def test_json_restored():
    assert json.dumps({"a": 1}) == '{"a": 1}'
```

```bash
uv run pytest -v
uv run pytest -q -s -k writes_file
```

```text
test_builtin.py::test_publish_writes_file PASSED                         [ 12%]
test_builtin.py::test_output_dir_from_env PASSED                         [ 25%]
test_builtin.py::test_output_dir_default PASSED                          [ 37%]
test_builtin.py::test_relative_paths PASSED                              [ 50%]
test_builtin.py::test_stdout PASSED                                      [ 62%]
test_builtin.py::test_warning_logged PASSED                              [ 75%]
test_builtin.py::test_monkeypatch_setattr PASSED                         [ 87%]
test_builtin.py::test_json_restored PASSED                               [100%]

published signup.json
test_publish_writes_file0
.
1 passed, 7 deselected in 0.01s
```

Останні два тести показують головне: `json.dumps` підмінено для одного тесту, а наступний бачить справжню функцію, без `jest.restoreAllMocks()` в `afterEach`. Глибше про підміну, правило "патчити там, де шукають" і `unittest.mock` в m3-l04. Тут достатньо, що `monkeypatch.setattr` покриває більшість випадків, де у фронтенді ви б писали `jest.spyOn(obj, "method").mockReturnValue(...)`.

Фікстура `request`, яка вже траплялась у `trace`, описує поточний тест: `request.node.name`, маркери, конфіг. Друге її застосування це параметризована фікстура: `@pytest.fixture(params=[...])` запускає кожен тест, що її просить, по разу на значення, а саме значення лежить у `request.param`. Так одна фікстура теми проганяє всі тести рендеру в обох темах без жодного `parametrize` на тестах.

```python
@pytest.fixture(params=["light", "dark"])
def theme(request):
    return request.param


def test_render_theme(theme):
    assert theme in {"light", "dark"}
```

```text
test_markers.py::test_render_theme[light] PASSED                         [ 14%]
test_markers.py::test_render_theme[dark] PASSED                          [ 28%]
```

<!-- task: t5 -->

## Маркери, конфіг і асинхронні тести

`parametrize` і `xfail` вже трапились; решта вбудованих маркерів керує тим, чи запускати тест. `skip` пропускає безумовно, `skipif(умова, reason=...)` за умовою, обчисленою при збиранні. `xfail` запускає тест і очікує падіння, а з `strict=True` проходження стає помилкою `XPASS(strict)`: виправлений баг не лишиться з міткою "відомо зламано". Власні маркери на кшталт `slow` реєструють у `markers` конфігу і фільтрують через `-m`, де працюють ті самі `and`, `or`, `not`, що й у `-k`.

```toml
[tool.pytest.ini_options]
addopts = ["--strict-markers", "-ra"]
markers = [
    "slow: long-running test, deselect with -m 'not slow'",
]
```

```python
import sys

import pytest


@pytest.mark.skip(reason="renderer not ported yet")
def test_render_html():
    ...


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX paths only")
def test_posix_paths():
    assert "/" in "dist/signup.html"


@pytest.mark.xfail(reason="bug #42: nested blocks lose order", strict=True)
def test_nested_order():
    assert [3, 1, 2] == [1, 2, 3]


@pytest.mark.xfail(reason="was broken, now fixed?", strict=True)
def test_fixed_meanwhile():
    assert True


@pytest.mark.slow
def test_render_hundred_forms():
    assert sum(range(100)) == 4950
```

```bash
uv run pytest -v
uv run pytest -q -m "not slow"
```

```text
test_markers.py::test_render_html SKIPPED (renderer not ported yet)      [ 42%]
test_markers.py::test_posix_paths PASSED                                 [ 57%]
test_markers.py::test_nested_order XFAIL (bug #42: nested blocks los...) [ 71%]
test_markers.py::test_fixed_meanwhile FAILED                             [ 85%]
test_markers.py::test_render_hundred_forms PASSED                        [100%]

=================================== FAILURES ===================================
_____________________________ test_fixed_meanwhile _____________________________
[XPASS(strict)] was broken, now fixed?
=========================== short test summary info ============================
SKIPPED [1] test_markers.py:15: renderer not ported yet
XFAIL test_markers.py::test_nested_order - bug #42: nested blocks lose order
FAILED test_markers.py::test_fixed_meanwhile - [XPASS(strict)] was broken, no...
============== 1 failed, 4 passed, 1 skipped, 1 xfailed in 0.02s ===============

XFAIL test_markers.py::test_nested_order - bug #42: nested blocks lose order
FAILED test_markers.py::test_fixed_meanwhile - [XPASS(strict)] was broken, no...
1 failed, 3 passed, 1 skipped, 1 deselected, 1 xfailed in 0.02s
```

(Перші два рядки `-v`-виводу, `test_render_theme[light]` і `[dark]`, з того самого файлу, показані в розділі про `request`.) `-ra` додає в підсумок причини всіх skip і xfail, без нього там лише падіння.

> **Пастка.** `@pytest.mark.<будь-що>` створює маркер на льоту, тому опечатка `@pytest.mark.slwo` без налаштувань дає лише попередження `PytestUnknownMarkWarning`, а `-m "not slow"` цей тест не відфільтрує. `--strict-markers` перетворює незареєстрований маркер на помилку збирання. У pytest 9 є ширший перемикач `strict = true`: він вмикає строгі маркери, строгий конфіг (невідомий ключ у секції стає помилкою), `strict` для всіх `xfail` і заборону повторюваних id у `parametrize`.

```toml
[tool.pytest.ini_options]
strict = true
markers = ["slow: long"]
```

```text
ERROR test_m.py - Failed: 'slwo' not found in `markers` configuration option
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
1 error in 0.05s
```

Асинхронні тести (`async def test_...`) pytest сам не виконує: без плагіна такий тест падає з поясненням, що потрібен плагін. Плагіни два: `pytest-asyncio` з маркером `@pytest.mark.asyncio` і `anyio`, який приходить разом з httpx і FastAPI і дає маркер `@pytest.mark.anyio`. Корутини й event loop розібрані в m5-l05, тести асинхронного API капстоуну в m7-l05; тут лише як виглядає падіння, щоб упізнати його.

```text
_____________________________ test_without_plugin ______________________________
async def functions are not natively supported.
You need to install a suitable plugin for your async framework, for example:
  - anyio
  - pytest-asyncio
  - pytest-tornasync
  - pytest-trio
  - pytest-twisted
```

## Для капстоуну

У капстоуні тести вже є: smoke-тест з m0-l06 і `tests/test_models.py` з проєктного завдання m2-l09. Тут вони отримують структуру. `conftest.py` тримає три фікстури: справжній конфіг з `tests/fixtures/form_signup.json`, свіжий на кожен тест, фабрику `make_form` і фабрику файлів `write_config` поверх `tmp_path`. Усі ключі в прикладах записані в snake_case: моделі з m2-l09 приймають і camelCase з фронтенду, і імена полів (`validate_by_name=True`), а camelCase окремо перевіряє один рядок таблиці валідних конфігів.

```python
# tests/conftest.py
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"

type Raw = dict[str, Any]


@pytest.fixture
def signup_raw() -> Raw:
    """Real signup config from tests/fixtures, a fresh dict for every test."""
    return json.loads((FIXTURES / "form_signup.json").read_text(encoding="utf-8"))


@pytest.fixture
def make_form() -> Callable[..., Raw]:
    """Factory: minimal valid config; keyword arguments replace top-level keys."""

    def _make(**overrides: Any) -> Raw:
        form: Raw = {
            "id": "signup",
            "title": "Sign up",
            "elements": [
                {"type": "input", "id": "email", "name": "email", "label": "Email"},
                {"type": "button", "id": "send", "label": "Send"},
            ],
        }
        form.update(overrides)
        return form

    return _make


@pytest.fixture
def write_config(tmp_path: Path) -> Callable[[Raw | str], Path]:
    """Writes a dict as JSON (or a raw string as is) into tmp_path/form.json."""

    def _write(data: Raw | str) -> Path:
        path = tmp_path / "form.json"
        text = data if isinstance(data, str) else json.dumps(data)
        path.write_text(text, encoding="utf-8")
        return path

    return _write
```

Невалідні конфіги лягають у таблицю `parametrize`: що змінено відносно мінімального і який `type` помилки Pydantic очікується. Перевіряється не лише факт `ValidationError`, а й те, що помилка одна і саме та: тест, який ловить "якусь" помилку, проходить і тоді, коли конфіг зламався з іншої причини. Повну таблицю на 20 рядків пише проєктне завдання; тут сім.

```python
# tests/test_models.py (фрагмент)
import pytest
from pydantic import ValidationError

from formbuilder.config import FormConfig

EMAIL = {"type": "input", "id": "email", "name": "email", "label": "Email"}
SEND = {"type": "button", "id": "send", "label": "Send"}
IF_PHONE = {"field": "phone", "operator": "eq", "value": "x"}


@pytest.mark.parametrize(
    ("overrides", "error_type"),
    [
        pytest.param({"title": ""}, "string_too_short", id="empty-title"),
        pytest.param({"title": "x" * 121}, "string_too_long", id="long-title"),
        pytest.param({"theme": {"primary_color": "blue"}}, "string_pattern_mismatch", id="bad-color"),
        pytest.param({"elements": [{"type": "select", "id": "s"}]}, "union_tag_invalid", id="unknown-type"),
        pytest.param({"elements": [{**EMAIL, "placeholder": "x"}]}, "extra_forbidden", id="extra-key"),
        pytest.param({"elements": [{**EMAIL, "input_type": "date"}]}, "literal_error", id="bad-input-type"),
        pytest.param({"elements": [{**SEND, "visible_if": IF_PHONE}]}, "value_error", id="unknown-ref"),
    ],
)
def test_invalid_config(make_form, overrides, error_type):
    with pytest.raises(ValidationError) as excinfo:
        FormConfig.model_validate(make_form(**overrides))
    assert [e["type"] for e in excinfo.value.errors()] == [error_type]
```

У `formbuilder/config.py` поруч з моделями з m2-l09 з'являється `load_config`: вона читає конфіг з диска і перетворює всі причини відмови (немає файлу, не JSON, не проходить валідацію) на один `ConfigError`, який згодом покаже CLI з m6-l06. Його тести не мокають файлову систему: `tmp_path` дає справжню теку, і перевіряється справжнє читання.

```python
# src/formbuilder/config.py (фрагмент: моделі FormConfig і to_domain з m2-l09 не показано)
from pathlib import Path

from pydantic import ValidationError


class ConfigError(Exception):
    """Config file is missing, is not valid JSON, or fails validation."""


def load_config(path: Path) -> FormConfig:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise ConfigError(f"config not found: {path.name}") from None
    try:
        return FormConfig.model_validate_json(raw)
    except ValidationError as exc:
        raise ConfigError(f"{path.name}: {exc.error_count()} validation error(s)") from exc
```

```python
# tests/test_config.py
import pytest

from formbuilder.config import ConfigError, load_config


def test_load_valid(write_config, make_form):
    config = load_config(write_config(make_form(title="Contact")))
    assert config.title == "Contact"


def test_missing_file(tmp_path):
    with pytest.raises(ConfigError, match=r"^config not found: nope\.json$"):
        load_config(tmp_path / "nope.json")


def test_broken_json(write_config):
    with pytest.raises(ConfigError, match=r"form\.json: 1 validation error") as excinfo:
        load_config(write_config("{not json"))
    assert excinfo.value.__cause__.errors()[0]["type"] == "json_invalid"
```

```bash
cd capstone && uv run pytest -v
```

```text
tests/test_config.py::test_load_valid PASSED                             [  6%]
tests/test_config.py::test_missing_file PASSED                           [ 12%]
tests/test_config.py::test_broken_json PASSED                            [ 18%]
tests/test_models.py::test_real_signup_config PASSED                     [ 25%]
tests/test_models.py::test_valid_config[minimal] PASSED                  [ 31%]
tests/test_models.py::test_valid_config[dark-theme] PASSED               [ 37%]
tests/test_models.py::test_valid_config[no-elements] PASSED              [ 43%]
tests/test_models.py::test_valid_config[condition-camel-case] PASSED     [ 50%]
tests/test_models.py::test_invalid_config[empty-title] PASSED            [ 56%]
tests/test_models.py::test_invalid_config[long-title] PASSED             [ 62%]
tests/test_models.py::test_invalid_config[bad-color] PASSED              [ 68%]
tests/test_models.py::test_invalid_config[unknown-type] PASSED           [ 75%]
tests/test_models.py::test_invalid_config[extra-key] PASSED              [ 81%]
tests/test_models.py::test_invalid_config[bad-input-type] PASSED         [ 87%]
tests/test_models.py::test_invalid_config[unknown-ref] PASSED            [ 93%]
tests/test_smoke.py::test_package_is_installed_and_cli_runs PASSED       [100%]

============================== 16 passed in 0.17s ==============================
```

> **Для капстоуну.** `test_broken_json` перевіряє `__cause__`: `raise ... from exc` зберігає вихідну `ValidationError`, і тест гарантує, що причину не загублено при обгортанні (ланцюжки винятків у m1-l11). Кожен рядок з `id=` стає зрозумілою назвою в CI: `test_invalid_config[unknown-ref] FAILED` читається без відкриття файлу.

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **Вкладені `describe` як класи в класах.** Переносять дерево `describe > describe > it` у вкладені `class TestX: class TestY:`. Працює, але id стають довгими, а кожен рівень нічого не дає, бо спільна підготовка в pytest живе у фікстурах, а не в області видимості блоку. Правильно: плоскі функції в файлі, названому за модулем, і класи лише для угруповання, без вкладеності.

   ```python
   def test_label_snake_case(): ...
   def test_label_single_word(): ...
   ```

2. **Матчери замість `assert`.** Пишуть власні `expect_equal(a, b)` або тягнуть бібліотеки матчерів. Хелпер у звичайному модулі ще й не переписується, і падіння втрачає значення. Правильно: голий `assert` з будь-яким виразом мови.

   ```python
   assert field["type"] == "input"
   assert "email" in names
   assert isinstance(element, InputElement)
   ```

3. **`beforeEach` з присвоєнням у спільну змінну.** Модульна змінна `form = None` і autouse-фікстура, що її перезаписує, або `self.form` у `setup_method`. Правильно: фікстура, яку тест просить параметром; дані через фабрику.

   ```python
   @pytest.fixture
   def form(make_form):
       return make_form(title="Contact")
   ```

4. **Модульний scope для зручності.** `scope="module"` на фікстурі з даними, "щоб не створювати щоразу". Тести починають залежати від порядку. Правильно: `function` scope (за замовчуванням) для всього мутабельного, ширший лише для дорогих незмінних ресурсів.

   ```python
   @pytest.fixture  # не scope="module" для словника, який тести змінюють
   def base_form(): return {"id": "signup", "elements": []}
   ```

5. **`test.only` і закоментовані тести.** Шукають `it.only` і правлять код. Правильно: `-k` або node id у команді, `--lf` для повтору впалих; у коді нічого не міняється.

   ```bash
   uv run pytest -k "required and not xfail"
   uv run pytest "tests/test_models.py::test_invalid_config[unknown-ref]"
   ```

6. **Мокання всього підряд.** Звичка з `jest.mock` для кожного імпорту. У Python файли пишуть у `tmp_path`, оточення ставлять через `monkeypatch.setenv`, вивід читають через `capsys`, і моки потрібні значно рідше. Правильно: справжні дані й справжня тека, підміна лише зовнішнього I/O (детально в m3-l04).

   ```python
   def test_load_valid(write_config, make_form):
       assert load_config(write_config(make_form())).id == "signup"
   ```

7. **Snapshot замість конкретної перевірки.** `toMatchSnapshot()` на весь об'єкт. Для pytest є плагін `syrupy` з тим самим підходом, але для конфігів і моделей точне порівняння з `==` і `-vv`-diff дає ту саму читабельність без файлів-знімків, які оновлюють не дивлячись. Правильно: `assert result == expected` з явним очікуваним значенням або `[e["type"] for e in errors] == [...]`.

   ```python
   assert [e["type"] for e in excinfo.value.errors()] == ["extra_forbidden"]
   ```

8. **`assert` з дужками як виклик функції.** `assert(x == y, "msg")` за аналогією з `expect(x, "msg")` або `console.assert(x, msg)`. Кортеж завжди truthy, тест зелений назавжди. Правильно: без дужок.

   ```python
   assert status == "published", "form must be published"
   ```

## Підсумок

- Тест це функція `test_*` у файлі `test_*.py`; перевірка це голий `assert` з будь-яким виразом. Матчерів немає, і вони не потрібні.
- Значення обох сторін показує assertion rewriting: pytest переписує `assert` у тестових модулях і `conftest.py` при імпорті. Хелпери в інших модулях не переписуються.
- `-q`, `-v`, `-x`, `-k expr`, node id, `--lf`, `-s`, `-vv` для повного diff, `--tb=short`, `-l`; у diff `+` це фактичне значення при `assert actual == expected`.
- `pytest.raises(Exc, match=...)`: `match` це regex через `re.search`; `excinfo.value` після блоку. `pytest.warns` для попереджень, `pytest.approx` для float, списків і словників.
- `parametrize` замість `it.each`; `pytest.param(..., id=..., marks=...)` для назв і xfail; стек декораторів дає декартовий добуток.
- Фікстура це функція, яку тест просить за іменем параметра; `yield` розділяє підготовку і прибирання; `scope` за замовчуванням `function`, і для даних так і треба.
- `conftest.py` не імпортують: pytest підхоплює його за папкою, глибший перекриває зовнішній. Дані через factory fixture, а не через набір фікстур на кожен варіант.
- Класи `Test*` лише групують: без наслідування, без `__init__`, новий екземпляр на кожен тест.
- `tmp_path`, `monkeypatch`, `capsys`, `caplog`, `request` прибирають за собою самі і замінюють більшість моків.
- Маркери реєструють у конфігу; `strict = true` у pytest 9 робить опечатки в маркерах, конфігу й повтори id помилками. Асинхронні тести потребують плагіна.

## Що далі

m3-l04 про моки: `unittest.mock`, `pytest-mock`, правило "патчити там, де шукають" і coverage. Там знадобляться `monkeypatch.setattr` з цього уроку, фікстури як спосіб видавати моки тестам і звичка спершу шукати справжню реалізацію (`tmp_path`, fake-об'єкт), а мок лишати для зовнішнього I/O. Після нього m3-l05 додасть doctest, який запускається тим самим pytest.
