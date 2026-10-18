---
id: m3-l05
module: m3-modules-tests
title: "doctest як документація, що виконується"
summary: "Учень пише в docstring приклади `>>>`, які перевіряють `python -m doctest` і `pytest --doctest-modules`, обходить пастки текстового порівняння директивами й відрізняє приклад використання від тесту крайових випадків."
duration_min: 45
prerequisites: [m3-l04]
---

## Docstring, який перевіряє сам себе

Docstring (офіційний термін, PEP 257) ви бачили в m1-l07: рядковий літерал першою інструкцією функції, класу чи модуля, який інтерпретатор зберігає в `__doc__`. doctest (так називається модуль стандартної бібліотеки) шукає в docstring фрагменти, що виглядають як сесія REPL: рядок з `>>>` і під ним те, що REPL мав би надрукувати. Кожен такий фрагмент doctest виконує й порівнює реальний вивід із записаним. Збіглося, приклад пройшов; ні, тест упав. Нижче модуль `slugs.py` з двома прикладами.

```python
"""Helpers for turning form titles into URL slugs."""


def slugify(title: str) -> str:
    """Turn a form title into a URL slug.

    >>> slugify("Contact Us")
    'contact-us'
    >>> slugify("  Sign   up  ")
    'sign-up'
    """
    return "-".join(title.lower().split())
```

```bash
python -m doctest slugs.py; echo "exit=$?"
python -m doctest -v slugs.py
```

```text
exit=0
Trying:
    slugify("Contact Us")
Expecting:
    'contact-us'
ok
Trying:
    slugify("  Sign   up  ")
Expecting:
    'sign-up'
ok
1 items had no tests:
    slugs
1 items passed all tests:
   2 tests in slugs.slugify
2 tests in 2 items.
2 passed and 0 failed.
Test passed.
```

Без `-v` успішний прогін нічого не друкує, і про результат говорить лише код виходу, як у звичайного юніксового інструмента. "Items" у звіті це об'єкти, у яких doctest шукав docstring (модуль, функції, класи, методи), "tests" це окремі приклади `>>>`. Цінність механізму в тому, що приклад у документації перестає бути коментарем, який застаріває першим. Змінили сигнатуру чи формат результату, і docstring, що бреше, падає разом з рештою тестів.

> **JS-аналог.** Тег `@example` у JSDoc ніхто не виконує: це текст, який TypeDoc кладе на сторінку як є, і в типовому проєкті на Jest приклади з коментарів не перевіряються. У Python перевірка прикладів входить у стандартну бібліотеку, а pytest збирає такі приклади нарівні з тестами.

Той самий механізм доступний з коду: `doctest.run_docstring_examples` проганяє приклади однієї функції. У живих прикладах і завданнях цього уроку так і зроблено, бо файлу на диску в браузері немає.

```python live
import doctest


def slugify(title: str) -> str:
    """Turn a form title into a URL slug.

    >>> slugify("Contact Us")
    'contact-us'
    >>> print(slugify("  Sign   up  "))
    sign-up
    """
    return "-".join(title.lower().split())


doctest.run_docstring_examples(slugify, globals(), verbose=True, name="slugify")
print(slugify.__doc__.splitlines()[0])
```

```text
Finding tests in slugify
Trying:
    slugify("Contact Us")
Expecting:
    'contact-us'
ok
Trying:
    print(slugify("  Sign   up  "))
Expecting:
    sign-up
ok
Turn a form title into a URL slug.
```

## Синтаксис прикладу: `>>>`, `...`, вивід і винятки

Правила розбору прості, і всі вони з REPL. `>>>` починає приклад, `...` продовжує його для багаторядкових інструкцій (дужки, `for`, `def`). Очікуваний вивід це рядки одразу під прикладом, аж до порожнього рядка або наступного `>>>`. Спільний відступ docstring doctest зрізає сам, тому приклади можна вкладати в секцію `Examples:` з додатковим відступом. Приклади одного docstring виконуються по черзі в одному просторі імен: змінна з першого прикладу видима в наступних.

```python
def render_fields(names: list[str]) -> str:
    """Render one label per line, with an empty line after the header.

    >>> names = ["email",
    ...          "phone"]
    >>> for line in render_fields(names).splitlines():
    ...     print(repr(line))
    'Fields:'
    ''
    'email'
    'phone'
    >>> print(render_fields(["email"]))
    Fields:
    <BLANKLINE>
    email
    """
    return "\n".join(["Fields:", "", *names])


def field_index(names: list[str], name: str) -> int:
    """Return the position of a field by name.

    >>> field_index(["email", "phone"], "phone")
    1
    >>> field_index(["email"], "fax")
    Traceback (most recent call last):
        ...
    ValueError: unknown field 'fax'
    """
    if name not in names:
        raise ValueError(f"unknown field {name!r}")
    return names.index(name)
```

```bash
python -m doctest -v fields.py | tail -6
```

```text
2 items passed all tests:
   2 tests in fields.field_index
   3 tests in fields.render_fields
5 tests in 3 items.
5 passed and 0 failed.
Test passed.
```

Порожній рядок завершує очікуваний вивід, тому справжній порожній рядок у виводі записують маркером `<BLANKLINE>`. Без нього doctest вважає, що вивід скінчився на `Fields:`, а `email` нижче це вже звичайний текст документації. Повідомлення про падіння показує це прямо: в `Got:` doctest сам підставив `<BLANKLINE>`.

```python
def render_fields(names: list[str]) -> str:
    """Render one label per line, with an empty line after the header.

    >>> print(render_fields(["email"]))
    Fields:

    email
    """
    return "\n".join(["Fields:", "", *names])
```

```text
**********************************************************************
File "fields.py", line 4, in fields.render_fields
Failed example:
    print(render_fields(["email"]))
Expected:
    Fields:
Got:
    Fields:
    <BLANKLINE>
    email
**********************************************************************
1 items had failures:
   1 of   1 in fields.render_fields
***Test Failed*** 1 failures.
```

Очікуваний виняток записують так, як його друкує REPL: рядок `Traceback (most recent call last):`, потім що завгодно (за конвенцією `...` з відступом), потім останній рядок `ValueError: unknown field 'fax'`. Порівнюються лише тип і повідомлення. Стек викликів doctest пропускає свідомо: у ньому шляхи до файлів і номери рядків, які змінюються від будь-якого редагування.

> **Під капотом.** Кожен приклад doctest компілює в режимі `"single"`, тому самому, що й інтерактивний REPL, і виконує через `exec`. У цьому режимі значення виразу не повертається, а передається в `sys.displayhook`, який друкує `repr(value)` і нічого не друкує для `None`. Тому вивід у doctest це завжди `repr`, а не `str`: рядок з лапками, `None` не видно взагалі. Хочете `str`, пишіть `print(...)`.

```python live
import sys

sys.displayhook("contact-us")
sys.displayhook(None)
sys.displayhook({"filled": 2, "empty": 1})
sys.displayhook(0.1 + 0.2)
print("contact-us")
```

```text
'contact-us'
{'filled': 2, 'empty': 1}
0.30000000000000004
contact-us
```

<!-- task: t1 -->

<!-- task: t2 -->

## Текст замість значень: `repr`, `None`, `set`, `float` і адреси

doctest порівнює рядки, а не значення. `assert result == expected` у pytest порівнює об'єкти через `==`; doctest бере текст, який надрукував `displayhook`, і порівнює його посимвольно з тим, що записано в docstring. Усе, де текстове представлення не збігається з вашим уявленням про значення, стає пасткою. Три такі місця в одному файлі:

```python
def lookup(answers: dict[str, str], name: str) -> str | None:
    """Return the answer for a field, or None.

    >>> lookup({"email": "a@b.c"}, "fax")
    None
    """
    return answers.get(name)


def field_types(fields: list[dict]) -> set[str]:
    """Collect distinct field types.

    >>> field_types([{"type": "text"}, {"type": "email"}, {"type": "number"}])
    {'email', 'number', 'text'}
    """
    return {f["type"] for f in fields}


def share(part: float, total: float) -> float:
    """Return a share of the total.

    >>> share(0.1 + 0.2, 1)
    0.3
    """
    return part / total
```

```bash
PYTHONHASHSEED=1 python -m doctest pitfalls.py
```

```text
**********************************************************************
File "pitfalls.py", line 13, in pitfalls.field_types
Failed example:
    field_types([{"type": "text"}, {"type": "email"}, {"type": "number"}])
Expected:
    {'email', 'number', 'text'}
Got:
    {'number', 'email', 'text'}
**********************************************************************
File "pitfalls.py", line 4, in pitfalls.lookup
Failed example:
    lookup({"email": "a@b.c"}, "fax")
Expected:
    None
Got nothing
**********************************************************************
File "pitfalls.py", line 22, in pitfalls.share
Failed example:
    share(0.1 + 0.2, 1)
Expected:
    0.3
Got:
    0.30000000000000004
**********************************************************************
3 items had failures:
   1 of   1 in pitfalls.field_types
   1 of   1 in pitfalls.lookup
   1 of   1 in pitfalls.share
***Test Failed*** 3 failures.
```

```bash
PYTHONHASHSEED=3 python -m doctest pitfalls.py | tail -4
```

```text
2 items had failures:
   1 of   1 in pitfalls.lookup
   1 of   1 in pitfalls.share
***Test Failed*** 2 failures.
```

Найпідступніша з трьох це множина: з `PYTHONHASHSEED=1` приклад падає, з `PYTHONHASHSEED=3` проходить. Хеш рядків у Python солиться випадковим числом при кожному старті інтерпретатора (hash randomization, офіційний термін, захист від DoS через колізії), а порядок обходу `set` залежить від хешів. Без фіксованого `PYTHONHASHSEED` такий doctest моргає: локально зелений, у CI червоний. Словник цієї проблеми не має, бо порядок вставки гарантований мовою (m2-l01), тож `{'filled': 2, 'empty': 1}` у doctest стабільний. `float` друкується найкоротшим `repr`, що відтворює точне значення, і `0.1 + 0.2` це `0.30000000000000004`, а не `0.3`.

> **Пастка.** Вираз, що повертає `None`, у doctest не друкує нічого, і очікуване `None` під ним падає з `Got nothing`. Для функцій, що повертають `X | None`, пишіть `print(lookup(...))` або `lookup(...) is None` з очікуваним `True`. У JS-консолі ви звикли бачити `undefined` після кожного виклику, тут ця звичка й підводить.

Для того, що текстом не зафіксувати, є директиви (directives, офіційний термін документації doctest; у коді це option flags). Директива пишеться коментарем `# doctest: +FLAG` у рядку прикладу і діє лише на нього. `+ELLIPSIS` дозволяє `...` в очікуваному виводі як "будь-яка підстрока", і це спосіб пережити адресу `0x102996510` у `repr` об'єкта без власного `__repr__`. `+NORMALIZE_WHITESPACE` вважає будь-яку послідовність пробілів і переносів однаковою, тож довгий список можна перенести на кілька рядків. `+SKIP` не виконує приклад зовсім: для прикладів, що ходять у мережу чи потребують середовища, яке тест не має. Множину перед порівнянням сортують, `float` округлюють.

```python
class Field:
    def __init__(self, name: str) -> None:
        self.name = name


def make_fields(names: list[str]) -> list[Field]:
    """Wrap names into Field objects.

    >>> make_fields(["email"])  # doctest: +ELLIPSIS
    [<fixed.Field object at 0x...>]
    >>> [f.name for f in make_fields(["email", "phone", "company", "country", "zip"])]
    ... # doctest: +NORMALIZE_WHITESPACE
    ['email', 'phone',
     'company', 'country', 'zip']
    >>> make_fields(["email"])[0].name
    'email'
    >>> fetch_remote_schema()  # doctest: +SKIP
    {'fields': [...]}
    """
    return [Field(n) for n in names]


def summary(answers: dict[str, str]) -> dict[str, int]:
    """Count answers by status; dict keeps insertion order.

    >>> summary({"email": "a@b.c", "phone": "", "zip": "01001"})
    {'filled': 2, 'empty': 1}
    >>> print(answers_get({}, "fax"))
    None
    >>> answers_get({}, "fax") is None
    True
    >>> sorted({"text", "email", "number"})
    ['email', 'number', 'text']
    >>> round(0.1 + 0.2, 2)
    0.3
    """
    filled = sum(1 for v in answers.values() if v)
    return {"filled": filled, "empty": len(answers) - filled}


def answers_get(answers: dict[str, str], name: str) -> str | None:
    return answers.get(name)
```

```bash
python -m doctest -v fixed.py | tail -5
python -c "import fixed; print(fixed.make_fields(['email']))"
```

```text
   3 tests in fixed.make_fields
   5 tests in fixed.summary
8 tests in 6 items.
8 passed and 0 failed.
Test passed.
[<fixed.Field object at 0x102996510>]
```

Приклад з `+SKIP` не рахується в "tests": у `make_fields` чотири приклади, а виконано три. Директиву можна поставити й на рядку продовження `...`, як у другому прикладі, коли сам рядок довгий. Щоб не повторювати ту саму директиву в кожному прикладі, її вмикають глобально: `doctest.testmod(optionflags=doctest.ELLIPSIS)` або `doctest_optionflags` у конфігу pytest, про нього в наступному розділі.

<!-- task: q1 -->

<!-- task: q3 -->

<!-- task: t3 -->

## Запуск: `python -m doctest`, `testmod` і pytest

Три способи запуску дають той самий результат. `python -m doctest -v module.py` (у проєкті на uv це `uv run python -m doctest -v src/formbuilder/domain.py`) імпортує файл як модуль і проганяє всі docstring; при падінні код виходу 1, тож команду можна ставити в скрипт. Старіша ідіома, `doctest.testmod()` у блоці `if __name__ == "__main__":`, перетворює сам модуль на свій тест-раннер. Вона ж показує ще одне правило: кожен docstring отримує власну копію глобальних імен модуля, і імена, створені прикладами одного docstring, в інший не потрапляють.

```python
"""Doctest namespaces.

>>> FIELDS = ["email", "phone"]
>>> count(FIELDS)
2
"""


def count(names: list[str]) -> int:
    """Count names.

    >>> count(FIELDS)
    2
    """
    return len(names)


if __name__ == "__main__":
    import doctest

    print(doctest.testmod())
```

```bash
python scope.py
```

```text
**********************************************************************
File "scope.py", line 12, in __main__.count
Failed example:
    count(FIELDS)
Exception raised:
    Traceback (most recent call last):
      File "doctest.py", line 1368, in __run
        exec(compile(example.source, filename, "single",
      File "<doctest __main__.count[0]>", line 1, in <module>
        count(FIELDS)
              ^^^^^^
    NameError: name 'FIELDS' is not defined
**********************************************************************
1 items had failures:
   1 of   1 in __main__.count
***Test Failed*** 1 failures.
TestResults(failed=1, attempted=3)
```

У traceback видно той самий `exec(compile(..., "single"))` з попереднього розділу. `count` видимий у docstring без імпорту, бо копія глобальних імен модуля включає всі його функції; `FIELDS` створений прикладом у docstring модуля і живе лише там. Це ізоляція того ж рівня, що між тестами в pytest: порядок docstring не впливає на результат.

У проєкті doctest запускають через pytest. Прапорець `--doctest-modules` змушує pytest імпортувати кожен `.py` у переданих шляхах і зібрати docstring з прикладами як тести: один docstring дає один тест, скільки б прикладів у ньому не було. Падіння показується в форматі pytest, з номерами рядків файлу; нижче другий прогін, у якому з `'contact-us'` у `slugs.py` прибрали лапки.

```bash
pytest --doctest-modules src -v | grep -E "PASSED|FAILED|passed"
pytest --doctest-modules src -q
```

```text
src/shop/slugs.py::shop.slugs.slugify PASSED                             [100%]
============================== 1 passed in 0.01s ===============================
```

```text
F                                                                        [100%]
=================================== FAILURES ===================================
_________________________ [doctest] shop.slugs.slugify _________________________
005 Turn a form title into a URL slug.
006 
007     >>> slugify("Contact Us")
Expected:
    contact-us
Got:
    'contact-us'

src/shop/slugs.py:7: DocTestFailure
=========================== short test summary info ============================
FAILED src/shop/slugs.py::shop.slugs.slugify
1 failed in 0.01s
```

Щоб не набирати прапорці щоразу, їх кладуть у `[tool.pytest.ini_options]`. Важливі три деталі. `--doctest-modules` збирає лише з тих шляхів, які pytest обходить, тому `src` треба додати в `testpaths`, інакше `pytest` без аргументів зайде лише в `tests/`. `doctest_optionflags` вмикає директиви для всіх прикладів. `--doctest-glob="*.md"` збирає приклади `>>>` з текстових файлів, наприклад з README.

```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests", "src", "README.md"]
addopts = ["--doctest-modules", "--doctest-glob=*.md"]
doctest_optionflags = ["NORMALIZE_WHITESPACE", "ELLIPSIS"]
```

```bash
pytest -v | grep -E "PASSED|FAILED|passed"
```

```text
tests/test_slugs.py::test_empty_title PASSED                             [ 33%]
src/shop/slugs.py::shop.slugs.slugify PASSED                             [ 66%]
README.md::README.md PASSED                                              [100%]
============================== 3 passed in 0.02s ===============================
```

> **Пастка.** У Markdown приклад живе всередині огорожі ```` ```pycon ````, і закривна огорожа одразу під очікуваним виводом стає його частиною: doctest не знає Markdown і читає до порожнього рядка. Перед закривною огорожею потрібен порожній рядок.

```bash
pytest -q README.md
```

````text
F                                                                        [100%]
=================================== FAILURES ===================================
_____________________________ [doctest] README.md ______________________________
001 # shop
002 
003 ```pycon
004 >>> from shop.slugs import slugify
005 >>> slugify("Contact Us")
Expected:
    'contact-us'
    ```
Got:
    'contact-us'

README.md:5: DocTestFailure
=========================== short test summary info ============================
FAILED README.md::README.md
1 failed in 0.01s
````

<!-- task: q2 -->

## Межа: приклад використання, а не набір тестів

doctest відповідає на питання "як цим користуватись", pytest на питання "чи це правильно в усіх випадках". У docstring місце для двох-трьох прикладів публічного API: типовий виклик, один характерний результат, одна очікувана помилка. Крайові випадки (порожній рядок, табуляції, Unicode), регресії з багтрекера, перевірки з фікстурами й моками живуть у pytest з `parametrize` (m3-l03), де кожен випадок має ім'я, а падіння показує diff значень, а не тексту.

```python
import pytest

from slugs import slugify


@pytest.mark.parametrize(
    ("title", "slug"),
    [
        ("", ""),
        ("   ", ""),
        ("Already-slug", "already-slug"),
        ("Tab\tand\nnewline", "tab-and-newline"),
        ("Ünïcode Form", "ünïcode-form"),
    ],
)
def test_slugify_edge_cases(title: str, slug: str) -> None:
    assert slugify(title) == slug
```

```bash
pytest -q --doctest-modules .
```

```text
......                                                                   [100%]
6 passed in 0.01s
```

Шість тестів: п'ять параметризованих і один docstring `slugify` з двома прикладами. Docstring на 30 рядків `>>>` шкодить з кількох причин. Його показують `help()` і спливна підказка IDE, і опис функції тоне в налаштуванні даних. Фікстур і `parametrize` немає, тож однакові приклади копіюються. Приклади ділять простір імен, і перше падіння тягне за собою всі наступні, які залежали від його змінних. І порівняння текстом крихке: зміна `__repr__` класу ламає двадцять прикладів, жоден з яких не перевіряв `__repr__`.

## Стилі docstring і де їх читають

Структуру багаторядкового docstring m1-l07 дав коротко; тут те, що треба знати для проєкту. Однорядковий docstring це одне речення в наказовому способі (`"""Return required fields that have no answer."""`), і для більшості приватних функцій його досить. Для публічних функцій поширені дві конвенції секцій: Google style (`Args:`, `Returns:`, `Raises:`, `Examples:`) і NumPy style (підкреслені заголовки `Parameters`, `Returns`, `Examples`, типи текстом). Обидві розуміють генератори документації: Sphinx через розширення napoleon і mkdocs через плагін mkdocstrings будують з них сайт API. У проєкті обирають одну; для капстоуну це Google style, він коротший.

```ts
/**
 * Return required fields that have no answer.
 * @param {Record<string, string>} answers - Answers by field name.
 * @param {string[]} required - Names of required fields.
 * @returns {string[]} Missing names in the order of `required`.
 * @example
 * missingRequired({ email: "a@b.c" }, ["email", "phone"]); // ["phone"]
 */
export function missingRequired(answers: Record<string, string>, required: string[]): string[] {
  return required.filter((name) => !answers[name]);
}
```

```python
def missing_required(answers: dict[str, str], required: list[str]) -> list[str]:
    """Return required fields that have no answer.

    Args:
        answers: Answers by field name.
        required: Names of required fields.

    Returns:
        Missing names in the order of ``required``.

    Examples:
        >>> missing_required({"email": "a@b.c"}, ["email", "phone"])
        ['phone']
        >>> missing_required({"email": ""}, ["email"])
        ['email']
    """
    return [name for name in required if not answers.get(name)]


def missing_required_numpy(answers: dict[str, str], required: list[str]) -> list[str]:
    """Return required fields that have no answer.

    Parameters
    ----------
    answers : dict of str to str
        Answers by field name.
    required : list of str
        Names of required fields.

    Returns
    -------
    list of str
        Missing names in the order of ``required``.

    Examples
    --------
    >>> missing_required_numpy({"email": "a@b.c"}, ["email", "phone"])
    ['phone']
    """
    return [name for name in required if not answers.get(name)]
```

Розходження з JSDoc у типах. У TS-проєкті `{string[]}` у JSDoc уже зайве, бо тип є в сигнатурі, а в JS-проєкті JSDoc і є єдиним джерелом типів. У Python джерело типів це анотації: їх читають mypy, IDE і `help()`. Google style тому пише в `Args:` лише сенс параметра; тип у дужках поруч з анотацією це друга копія, яка розійдеться з першою при першому рефакторингу. NumPy style типи текстом допускає історично, з часів до анотацій. Приклад `@example` у JSDoc лишається текстом, `Examples:` у docstring стає тестом.

```bash
python -m doctest -v answers.py | tail -6
```

```text
2 items passed all tests:
   2 tests in answers.missing_required
   1 tests in answers.missing_required_numpy
3 tests in 3 items.
3 passed and 0 failed.
Test passed.
```

Docstring є не лише у функцій. Docstring модуля стоїть першим рядком файлу і описує, що в ньому живе; docstring класу стоїть першим у тілі `class` і описує призначення й інваріанти; методи мають свої. Усі вони потрапляють у `__doc__`, їх збирає `help()` і doctest. Коментар `#` над функцією, звичний з JS, нікуди не потрапляє: ні в `__doc__`, ні в підказку.

```python
"""Form tree helpers for the FormBuilder backend.

The module works on plain dicts parsed from JSON configs.
"""


class FieldRegistry:
    """Index of form fields by name.

    >>> registry = FieldRegistry(["email", "phone"])
    >>> registry.has("email")
    True
    """

    def __init__(self, names: list[str]) -> None:
        self._names = set(names)

    def has(self, name: str) -> bool:
        """Return True if a field with this name exists."""
        return name in self._names
```

```python
import forms

print(forms.__doc__)
print(forms.FieldRegistry.has.__doc__)
help(forms.FieldRegistry)
```

```text
Form tree helpers for the FormBuilder backend.

The module works on plain dicts parsed from JSON configs.

Return True if a field with this name exists.
Help on class FieldRegistry in module forms:

class FieldRegistry(builtins.object)
 |  FieldRegistry(names: list[str]) -> None
 |
 |  Index of form fields by name.
 |
 |  >>> registry = FieldRegistry(["email", "phone"])
 |  >>> registry.has("email")
 |  True
 |
 |  Methods defined here:
 |
 |  __init__(self, names: list[str]) -> None
 |      Initialize self.  See help(type(self)) for accurate signature.
 |
 |  has(self, name: str) -> bool
 |      Return True if a field with this name exists.
 |
 |  ----------------------------------------------------------------------
 |  Data descriptors defined here:
 |
 |  __dict__
 |      dictionary for instance variables
 |
 |  __weakref__
 |      list of weak references to the object
```

IDE показує те саме при наведенні: Pylance у VS Code і PyCharm беруть docstring з вихідного коду й ставлять його під сигнатуру з анотаціями, а секції Google і NumPy форматують як заголовки й списки. Тому однорядковий docstring на кожній публічній функції окупається одразу: це текст, який колега бачить, не відкриваючи файл. Приклади `>>>` там теж видно, і вони гарантовано правдиві.

> **Під капотом.** Docstring це звичайний рядок в атрибуті, і його можна викинути: `python -OO` прибирає всі docstring при компіляції, `__doc__` стає `None`. Код, який читає `__doc__` для логіки (CLI-довідка, опис ендпоінта), під `-OO` поводиться інакше, тож на `__doc__` покладаються лише для документації.

```bash
python -OO -c "import forms; print(forms.__doc__, forms.FieldRegistry.has.__doc__)"
```

```text
None None
```

<!-- task: t4 -->

## Для капстоуну

`formbuilder.domain` з m2-l05 складається з чистих функцій над frozen dataclass: обхід дерева, імена полів, перейменування. Це ідеальне місце для doctest: функції без I/O, результат детермінований, а приклад одночасно пояснює формат дерева тому, хто відкриє модуль уперше. Нижче фрагмент з двома функціями; `find_by_name` нова, вона знадобиться для перевірки посилань `visible_if.field` і для рендерера.

```python
def walk(elements: tuple[Element, ...]) -> list[Element]:
    """Return all elements in depth-first order.

    Args:
        elements: Top-level elements of a form or the children of a block.

    Returns:
        A flat list where every element is followed by its descendants.

    Examples:
        >>> tree = (
        ...     Element(type="input", id="e1", name="email"),
        ...     Element(type="block", id="b1", children=(
        ...         Element(type="input", id="e2", name="company"),
        ...     )),
        ...     Element(type="button", id="s1"),
        ... )
        >>> [el.id for el in walk(tree)]
        ['e1', 'b1', 'e2', 's1']
        >>> walk(())
        []
    """
    result: list[Element] = []
    for el in elements:
        result.append(el)
        result.extend(walk(el.children))
    return result


def find_by_name(form: FormConfig, name: str) -> Element | None:
    """Find an input element by its field name anywhere in the tree.

    Args:
        form: The form to search.
        name: Field name, as used in answers and conditions.

    Returns:
        The first matching element, or None if there is no such field.

    Examples:
        >>> form = FormConfig(id="f", title="F", elements=(
        ...     Element(type="block", id="b1", children=(
        ...         Element(type="input", id="e1", name="email", label="Email"),
        ...     )),
        ... ))
        >>> find_by_name(form, "email")  # doctest: +ELLIPSIS
        Element(type='input', id='e1', name='email', label='Email', ...)
        >>> print(find_by_name(form, "fax"))
        None
    """
    for el in walk(form.elements):
        if el.name == name:
            return el
    return None
```

Усі три пастки уроку тут у ділі. `repr` dataclass друкує всі поля, і `+ELLIPSIS` обрізає хвіст `children=(), visible_if=None)`, який до прикладу не стосується. Відсутній елемент показано через `print`, бо голе `None` doctest не надрукує. Приклади ділять одну форму в межах docstring, але не між функціями, тож кожен docstring будує своє маленьке дерево.

```bash
cd capstone
uv run pytest --doctest-modules src -v | grep -E "PASSED|FAILED|passed"
uv run python -m doctest -v src/formbuilder/domain.py | tail -9
```

```text
src/formbuilder/domain.py::formbuilder.domain PASSED                     [ 20%]
src/formbuilder/domain.py::formbuilder.domain.Element PASSED             [ 40%]
src/formbuilder/domain.py::formbuilder.domain.field_names PASSED         [ 60%]
src/formbuilder/domain.py::formbuilder.domain.find_by_name PASSED        [ 80%]
src/formbuilder/domain.py::formbuilder.domain.walk PASSED                [100%]
============================== 5 passed in 0.02s ===============================
5 items passed all tests:
   2 tests in domain
   1 tests in domain.Element
   2 tests in domain.field_names
   3 tests in domain.find_by_name
   3 tests in domain.walk
11 tests in 35 items.
11 passed and 0 failed.
Test passed.
```

> **Для капстоуну.** Поки в капстоуні жодного docstring з прикладами, `uv run pytest --doctest-modules src -q` закінчується `no tests ran` і кодом виходу 5, а не 0; у CI це червоний крок. Після цього уроку в `pyproject.toml` капстоуну `testpaths = ["tests", "src"]` і `--doctest-modules` в `addopts`, тож звичайний `uv run pytest -q` проганяє і тести, і приклади. У m3-l06 ця ж команда стане кроком CI.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Типи в docstring за звичкою JSDoc.** Пишуть `@param {string} name` або `name (str): ...` поруч з анотацією `name: str`. Дві копії типу розходяться при першому рефакторингу, а mypy перевіряє лише анотацію. Правильно: тип в анотації, у `Args:` лише сенс.

   ```python
   def find_by_name(form: FormConfig, name: str) -> Element | None:
       """Find an input element by its field name.

       Args:
           name: Field name, as used in answers and conditions.
       """
   ```

2. **Коментар `//`-стилю над функцією замість docstring.** `# Find element by name` над `def` не потрапляє в `__doc__`, `help()` і підказку IDE. Правильно: рядок першою інструкцією тіла.

   ```python
   # Find element by name           <- нікуди не потрапляє
   def find_by_name(form, name):
       """Find an input element by its field name."""   # <- __doc__, help(), IDE
   ```

3. **Приклад у документації як текст, який ніхто не перевіряє.** Звичка з `@example`: приклад пишуть з пам'яті, і він застаріває. Правильно: оформити приклад як `>>>` і запускати `pytest --doctest-modules`; неправдивий приклад тоді падає.

   ```python
   """
   >>> slugify("Contact Us")
   'contact-us'
   """
   ```

4. **Очікуваний вивід як `str` замість `repr`.** Пишуть `contact-us` під виразом, що повертає рядок, бо так його покаже `console.log`. doctest бачить `'contact-us'` з лапками. Правильно: `repr` під виразом або `print(...)` у прикладі.

   ```python
   >>> slugify("Contact Us")
   'contact-us'
   >>> print(slugify("Contact Us"))
   contact-us
   ```

5. **`None` в очікуваному виводі.** З JS-консолі звикли, що `undefined` друкується. doctest для `None` не друкує нічого і падає з `Got nothing`. Правильно: `print(...)` або `... is None`.

   ```python
   >>> print(find_by_name(form, "fax"))
   None
   ```

6. **Множина або адреса об'єкта у виводі.** Порядок `set` рядків залежить від `PYTHONHASHSEED`, адреса `0x...` від запуску; тест моргає. Правильно: `sorted(...)` для множин, `+ELLIPSIS` для адрес або власний `__repr__`.

   ```python
   >>> sorted(field_types(fields))
   ['email', 'text']
   >>> make_fields(["email"])  # doctest: +ELLIPSIS
   [<...Field object at 0x...>]
   ```

7. **doctest як заміна тестів.** Тридцять прикладів у docstring замість `parametrize`. Правильно: два-три приклади використання в docstring, крайові випадки й регресії в `tests/`.

   ```python
   @pytest.mark.parametrize(("title", "slug"), [("", ""), ("   ", "")])
   def test_slugify_edge_cases(title: str, slug: str) -> None:
       assert slugify(title) == slug
   ```

## Підсумок

- doctest виконує приклади `>>>` з docstring і порівнює надрукований текст із записаним; неправдивий приклад падає як тест.
- `>>>` починає приклад, `...` продовжує, вивід іде одразу під ним до порожнього рядка; порожній рядок у виводі це `<BLANKLINE>`.
- Виняток: `Traceback (most recent call last):`, `...`, останній рядок з типом і повідомленням; стек не порівнюється.
- Вивід це `repr` через `sys.displayhook`: рядки з лапками, `None` не друкується; для `str` і `None` пишіть `print(...)`.
- Порівняння текстове: `set` рядків нестабільний через hash randomization, `dict` стабільний, `float` з повним `repr`, адреси змінюються; `sorted`, `round`, `+ELLIPSIS`, `+NORMALIZE_WHITESPACE`, `+SKIP`.
- Кожен docstring виконується у власній копії глобальних імен модуля; імена між docstring не переходять.
- Запуск: `python -m doctest -v file.py`, `doctest.testmod()`, `pytest --doctest-modules`; у pyproject `addopts`, `testpaths` з `src`, `doctest_optionflags`, `--doctest-glob` для Markdown.
- doctest для прикладів публічного API, pytest для крайових випадків і регресій.
- Google style (`Args:`, `Returns:`, `Raises:`, `Examples:`) без типів у тексті: типи в анотаціях; docstring модуля й класу теж читають `help()` та IDE.

## Що далі

Наступний урок m3-l06 про pre-commit з ruff і mypy та мінімальний CI. Команда `uv run pytest` з `--doctest-modules` у `addopts` звідси стане там одним із кроків перевірки, тож приклади в docstring капстоуну перевірятимуться при кожному push разом з тестами.
