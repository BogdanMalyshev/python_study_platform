---
id: m0-l04
module: m0-start
title: "ruff: лінтер і форматер в одному"
summary: "Учень налаштовує ruff у pyproject.toml явним набором правил, читає його діагностики, розрізняє safe і unsafe фікси, проганяє check і format у правильному порядку і знає, які правила ловлять типові JS-звички."
duration_min: 50
prerequisites: [m0-l03]
---

## PEP 8 і звідки взялось стільки інструментів

Стиль Python-коду описаний у PEP 8, "Style Guide for Python Code", 2001 рік. PEP (Python Enhancement Proposal) це офіційна назва документів, через які мова змінюється: кожен має номер, PEP 8 про стиль, PEP 484 про анотації типів, PEP 604 про синтаксис `X | Y`. PEP 8 фіксує те, що ви вже бачили в коді: відступ 4 пробіли, `snake_case` для функцій і змінних, `PascalCase` для класів, `UPPER_CASE` для констант, два порожні рядки між функціями верхнього рівня, імпорти зверху. Конвенції іменування детально в m1-l01.

Вчити PEP 8 напам'ять не треба, бо його правила діляться на два сорти, і обидва автоматизовані. Перший сорт це розкладка: пробіли, переноси, лапки, порожні рядки. Їх детерміновано переписує форматер (formatter), і ви про них не думаєте. Другий сорт це те, що форматер виправити не може, бо зміна зачепить поведінку: `== None`, невикористаний імпорт, змінюване значення за замовчуванням. Їх знаходить лінтер (linter) і повідомляє, а виправляєте ви. Це той самий поділ, що Prettier і ESLint після `eslint-config-prettier`: форматер відповідає за вигляд, лінтер за помилки.

До 2022 року кожну частину робив окремий інструмент. pycodestyle (колись він так і називався, `pep8`) перевіряв стиль, pyflakes шукав логічні помилки на кшталт невикористаних імпортів і невизначених імен, flake8 обгортав обидва й приймав плагіни (flake8-bugbear, pep8-naming та десятки інших). isort сортував імпорти, black з 2018 року став стандартним форматером, pyupgrade переписував старий синтаксис на новий, pylint робив важкий аналіз. Типовий проєкт тримав п'ять інструментів, чотири конфіги (`setup.cfg`, `.flake8`, `.isort.cfg`, `pyproject.toml`) і правила, що конфліктували між собою, як isort і black до появи спільного профілю.

ruff від Astral (тієї самої компанії, що робить uv з m0-l02) переписав правила всіх цих інструментів на Rust в одному бінарнику: лінтер з 2022 року, форматер з 2023. Виграв він двома речами. Перша швидкість: README заявляє 10–100x відносно flake8 і black, і на практиці це різниця між "лінтер у CI займає хвилину" і "лінтер працює в редакторі на кожне натискання". Друга один конфіг у `pyproject.toml` замість чотирьох. Команди нижче запускаються з активованим `.venv` або через `uv run ruff ...` (m0-l02).

```bash
ruff --version
ruff --help | head -15
```

```text
ruff 0.17.1
Ruff: An extremely fast Python linter and code formatter.

Usage: ruff [OPTIONS] <COMMAND>

Commands:
  check    Run Ruff on the given files or directories
  rule     Explain a rule (or all rules)
  config   List or describe the available configuration options
  linter   List all supported upstream linters
  clean    Clear any caches in the current directory and any subdirectories
  format   Run the Ruff formatter on the given files or directories
  server   Run the language server
  analyze  Run analysis over Python source code
  version  Display Ruff's version
  help     Print this message or the help of the given subcommand(s)
```

Спадщина видна в кодах правил: префікс каже, з якого інструмента правило прийшло. `ruff linter` друкує повну таблицю; ось ті префікси, якими користуватиметься курс.

```bash
ruff linter | grep -wE "E/W|F|I|UP|B|N|SIM|RUF"
```

```text
   B flake8-bugbear
 SIM flake8-simplify
   I isort
   N pep8-naming
 E/W pycodestyle
   F Pyflakes
  UP pyupgrade
 RUF Ruff-specific rules
```

> **JS-аналог.** ruff це ESLint, Prettier, `eslint-plugin-import` з правилом `import/order` і кілька популярних плагінів в одному бінарнику. Різниця в тому, що плагінів не ставлять: усі понад 900 правил уже вбудовані, і конфіг лише вирішує, які з них увімкнені.

## `ruff check` і `ruff format`: дві команди одного бінарника

`ruff check` це лінтер: розбирає файл у синтаксичне дерево, проганяє ввімкнені правила, друкує діагностики й завершується з кодом 1, якщо хоч одна знайшлась. `ruff format` це форматер: переписує пробіли, лапки й переноси, не змінюючи того, що код робить. Команди різні, але бінарник, конфіг і кеш у них спільні.

```bash
# JS / TS
npx eslint . --fix
npx prettier --write .
```

```bash
# Python
ruff check --fix .
ruff format .
```

Порядок той самий, що в JS: спершу лінтер з фіксами, потім форматер. Розходження в деталях: `--fix` у ruff за замовчуванням застосовує лише безпечні виправлення (про це в розділі про повідомлення), а обидві команди читають один конфіг замість пари `.eslintrc` і `.prettierrc`.

Ось файл у стилі "переклав з TypeScript як було". Він лежить у папці без жодного конфігу ruff, тобто працює набір правил за замовчуванням.

```python
import os
import json
from typing import List, Optional


def getRequiredFields(fields: List[dict]) -> List[str]:
    requiredIds = []
    for field in fields:
        if field.get("required") == True:
            requiredIds.append(field["id"])
    return requiredIds


def find_label(fields: list[dict], field_id: str) -> Optional[str]:
    for field in fields:
        if field["id"] == field_id:
            label = field.get("label")
            return field.get("label")
    return None


def add_error(message: str, errors: list = []) -> list:
    errors.append(message)
    return errors


is_empty = lambda value: value == None or value == ""
```

Формат за замовчуванням багатослівний, зі сніпетом коду на кожну діагностику; для огляду зручніше `--output-format concise`, по рядку на проблему.

```bash
ruff check --output-format concise form_utils.py
```

```text
form_utils.py:1:1: I001 [*] Import block is un-sorted or un-formatted
form_utils.py:1:8: F401 [*] `os` imported but unused
form_utils.py:2:8: F401 [*] `json` imported but unused
form_utils.py:3:1: UP035 `typing.List` is deprecated, use `list` instead
form_utils.py:6:31: UP006 [*] Use `list` instead of `List` for type annotation
form_utils.py:6:46: UP006 [*] Use `list` instead of `List` for type annotation
form_utils.py:14:54: UP045 [*] Use `X | None` for type annotations
form_utils.py:17:13: F841 Local variable `label` is assigned to but never used
form_utils.py:22:44: B006 Do not use mutable data structures for argument defaults
Found 9 errors.
[*] 6 fixable with `--fix` (2 unsafe fixes available with `--fix --unsafe-fixes`).
```

`[*]` позначає правило з автоматичним виправленням. Подивитись, що саме зробить `--fix`, не чіпаючи файл, можна через `--diff`; потім `--fix` записує зміни й друкує лише те, що лишилось.

```bash
ruff check --diff form_utils.py
```

```text
--- form_utils.py
+++ form_utils.py
@@ -1,9 +1,6 @@
-import os
-import json
-from typing import List, Optional
 
 
-def getRequiredFields(fields: List[dict]) -> List[str]:
+def getRequiredFields(fields: list[dict]) -> list[str]:
     requiredIds = []
     for field in fields:
         if field.get("required") == True:
@@ -11,7 +8,7 @@
     return requiredIds
 
 
-def find_label(fields: list[dict], field_id: str) -> Optional[str]:
+def find_label(fields: list[dict], field_id: str) -> str | None:
     for field in fields:
         if field["id"] == field_id:
             label = field.get("label")

Would fix 7 errors (2 additional fixes available with `--unsafe-fixes`).
```

```bash
ruff check --fix --output-format concise form_utils.py
```

```text
form_utils.py:14:13: F841 Local variable `label` is assigned to but never used
form_utils.py:19:44: B006 Do not use mutable data structures for argument defaults
Found 9 errors (7 fixed, 2 remaining).
2 unsafe fixes available with `--fix --unsafe-fixes`.
```

Після `--fix` на початку файлу лишились два порожні рядки на місці видаленого імпорту: лінтер виправляє зміст і не дбає про розкладку. Це робота форматера. `ruff format --check` нічого не пише й лише повідомляє, чи файл відформатований (код виходу 1, якщо ні); `--diff` показує зміни; без прапорців `ruff format` переписує файл.

```bash
ruff format --check form_utils.py
```

```text
unformatted: File would be reformatted
 --> form_utils.py:1:1
  |
  -
  -
1 | def getRequiredFields(fields: list[dict]) -> list[str]:
  |

1 file would be reformatted
```

```bash
ruff format form_utils.py
```

```text
1 file reformatted
```

Звідси порядок: спершу `ruff check --fix`, потім `ruff format`. Фікси лінтера можуть зіпсувати розкладку, а форматер ніколи не додає нових порушень правил, тож зворотний порядок означає другий прохід.

> **Пастка.** Лінтер не перевіряє типи. Анотації для ruff це синтаксис, а не контракт: функція, яка обіцяє `str` і повертає `int`, проходить чисто. У TS `tsc` і ESLint теж різні інструменти, але `tsc` запускається при кожній збірці, і ви звикли, що типи "просто перевіряються". У Python перевірку типів робить окремий інструмент, mypy або pyright, а рантайм анотації ігнорує (m2-l08).

```python
def next_step(step: int) -> str:
    return step + 1


print(next_step("2"))
```

```bash
ruff check types_demo.py
python types_demo.py
```

```text
All checks passed!
Traceback (most recent call last):
  File "types_demo.py", line 5, in <module>
    print(next_step("2"))
          ^^^^^^^^^^^^^^
  File "types_demo.py", line 2, in next_step
    return step + 1
           ~~~~~^~~
TypeError: can only concatenate str (not "int") to str
```

<!-- task: q3 -->

## Конфігурація в `pyproject.toml`

ruff шукає конфіг від файлу вгору по дереву: найближчий `pyproject.toml` із секцією `[tool.ruff]` (або `ruff.toml`) і є конфігом. Сам `pyproject.toml` і секція `[project]` розібрані в m0-l02; тут лише секції ruff.

```jsonc
// .eslintrc.json
{
  "extends": ["eslint:recommended", "plugin:import/recommended", "prettier"],
  "rules": { "eqeqeq": "error", "camelcase": "error" }
}
// .prettierrc
{ "printWidth": 88, "singleQuote": false }
```

```toml
# pyproject.toml
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "N", "SIM", "RUF"]
ignore = ["E501"]
```

Розходження в тому, що тут немає ні `extends`, ні пакетів із конфігами: набори правил вибираються префіксами кодів, і все в одному файлі з рештою налаштувань проєкту. `line-length` спільний для форматера й правила E501. `target-version` каже, на якій версії Python запускатиметься код: від цього залежить, що пропонують правила `UP` і який синтаксис дозволений. Якщо `target-version` не вказано, ruff бере його з `requires-python` у `[project]`.

У `[tool.ruff.lint]` три ключі. `select` задає набір правил повністю і замінює набір за замовчуванням. `extend-select` додає правила до того, що вже ввімкнено. `ignore` вимикає окремі правила або групи. Значенням може бути префікс групи (`"E"`), підгрупа (`"E7"`) або конкретний код (`"E711"`); існує й `"ALL"`, але з ним кожне оновлення ruff вмикає вам нові правила без попередження.

Тепер чому `select` явний. Набір за замовчуванням у ruff 0.17 великий, 407 правил з `F`, `B`, `UP`, `RUF`, `SIM`, `PL` та інших груп, але майже без pycodestyle й без `N`: розробники ruff прибрали зі стандартного набору стильові правила. Тому `== None` і `lambda` у змінній за замовчуванням не ловляться зовсім. `--isolated` запускає ruff так, ніби конфігу немає.

```bash
ruff check --isolated answers.py
```

```text
All checks passed!
```

Той самий файл з конфігом вище дає дві помилки (повний вивід розібраний у наступному розділі), а файл `form_utils.py` з попереднього розділу замість дев'яти дає чотирнадцять.

```bash
ruff check --output-format concise form_utils.py
```

```text
form_utils.py:1:1: I001 [*] Import block is un-sorted or un-formatted
form_utils.py:1:8: F401 [*] `os` imported but unused
form_utils.py:2:8: F401 [*] `json` imported but unused
form_utils.py:3:1: UP035 `typing.List` is deprecated, use `list` instead
form_utils.py:6:5: N802 Function name `getRequiredFields` should be lowercase
form_utils.py:6:31: UP006 [*] Use `list` instead of `List` for type annotation
form_utils.py:6:46: UP006 [*] Use `list` instead of `List` for type annotation
form_utils.py:7:5: N806 Variable `requiredIds` in function should be lowercase
form_utils.py:9:12: E712 Avoid equality comparisons to `True`; use `field.get("required"):` for truth checks
form_utils.py:14:54: UP045 [*] Use `X | None` for type annotations
form_utils.py:17:13: F841 Local variable `label` is assigned to but never used
form_utils.py:22:44: B006 Do not use mutable data structures for argument defaults
form_utils.py:27:1: E731 Do not assign a `lambda` expression, use a `def`
form_utils.py:27:35: E711 Comparison to `None` should be `cond is None`
Found 14 errors.
[*] 6 fixable with `--fix` (5 unsafe fixes available with `--fix --unsafe-fixes`).
```

> **Пастка.** Статті й чужі конфіги кажуть, що за замовчуванням увімкнено лише `E4`, `E7`, `E9` і `F`. Так було в старших версіях ruff; у 0.17 стандартний набір інший, і правило з тієї самої статті у вас може не спрацювати. Явний `select` робить конфіг незалежним від того, що автори ruff вирішать увімкнути в наступній версії, так само як lockfile робить незалежними версії пакетів.

Набір для курсу і навіщо кожна група. `E` це помилки pycodestyle: `E711`, `E712`, `E731`, `E701` (кілька інструкцій в одному рядку), `E722` (голий `except:`). `F` це pyflakes: невикористані імпорти й змінні, невизначені імена. `I` сортує імпорти. `UP` (pyupgrade) переписує застарілий синтаксис під `target-version`. `B` (flake8-bugbear, назва плагіна, від якого прийшли правила) ловить ймовірні баги, як змінюваний default. `N` (pep8-naming) перевіряє іменування. `SIM` (flake8-simplify) пропонує простіші конструкції. `RUF` це власні правила ruff, серед них `RUF100` про застарілі `noqa`.

`ignore = ["E501"]` вимикає правило "рядок довший за `line-length`". Довжину рядків тримає форматер, а E501 лишився б лише на рядкових літералах, які форматер не розриває, тобто на тексті повідомлень, де переносити нема чого.

> **Пастка.** Деякі правила суперечать форматеру: форматер ставить або прибирає кому так, як вважає правильним, а правило вимагає іншого. Якщо ввімкнути таке правило, `ruff format` попередить, і це попередження варто послухати, а не вимикати форматер.

```bash
# у pyproject.toml цієї папки: [tool.ruff.lint] extend-select = ["COM"]
ruff format fields.py
```

```text
warning: The following rule may cause conflicts when used with the formatter: `missing-trailing-comma` (`COM812`). To avoid unexpected behavior, we recommend disabling this rule, either by removing it from the `lint.select` or `lint.extend-select` configuration, or adding it to the `lint.ignore` configuration.
1 file left unchanged
```

<!-- task: q1 -->

## Як читати повідомлення ruff

Повний формат кожної діагностики складається з однакових частин. Перший рядок: код правила, `[*]`, якщо є безпечний фікс, і повідомлення. Далі `-->` з `файл:рядок:колонка`, сніпет коду з `^` під проблемним місцем, `help:` з пропонованим виправленням у вигляді диф-фрагмента і, якщо фікс небезпечний, `note:` про це. Ось `answers.py` з конфігом курсу.

```python
def is_answered(value: object, required: bool) -> bool:
    if value == None:
        return not required
    if required == True:
        return value != ""
    return True
```

```bash
ruff check answers.py
```

```text
E711 Comparison to `None` should be `cond is None`
 --> answers.py:2:17
  |
1 | def is_answered(value: object, required: bool) -> bool:
2 |     if value == None:
  |                 ^^^^
3 |         return not required
4 |     if required == True:
  |
help: Replace with `cond is None`
  |
1 | def is_answered(value: object, required: bool) -> bool:
  -     if value == None:
2 +     if value is None:
3 |         return not required
  |
note: This is an unsafe fix and may change runtime behavior

E712 Avoid equality comparisons to `True`; use `required:` for truth checks
 --> answers.py:4:8
  |
2 |     if value == None:
3 |         return not required
4 |     if required == True:
  |        ^^^^^^^^^^^^^^^^
5 |         return value != ""
6 |     return True
  |
help: Replace with `required`
  |
3 |         return not required
  -     if required == True:
4 +     if required:
5 |         return value != ""
  |
note: This is an unsafe fix and may change runtime behavior

Found 2 errors.
2 unsafe fixes available with `--fix --unsafe-fixes`.
```

Код правила складається з префікса групи й номера, а ще в кожного правила є читабельна назва в kebab-case: `E711` це `none-comparison`, `F841` це `unused-variable`. Назви видно в `ruff check --statistics`, який заодно групує діагностики за кількістю; це перше, що варто запустити на чужому проєкті. Пояснення правила, з прикладом і причиною, друкує `ruff rule <код>`, без браузера й мережі.

```bash
ruff check --statistics form_utils.py
```

```text
2	UP006	[*] non-pep585-annotation
2	F401 	[*] unused-import
1	UP035	[ ] deprecated-import
1	N802 	[ ] invalid-function-name
1	E731 	[ ] lambda-assignment
1	B006 	[ ] mutable-argument-default
1	N806 	[ ] non-lowercase-variable-in-function
1	UP045	[*] non-pep604-annotation-optional
1	E711 	[ ] none-comparison
1	E712 	[ ] true-false-comparison
1	I001 	[*] unsorted-imports
1	F841 	[ ] unused-variable
Found 14 errors.
[*] 6 fixable with `--fix` (5 unsafe fixes available with `--fix --unsafe-fixes`).
```

```bash
ruff rule F841 | head -16
```

```text
# unused-variable (F841)

Derived from the **Pyflakes** linter.

Fix is sometimes available.

## What it does
Checks for the presence of unused variables in function scopes.

## Why is this bad?
A variable that is defined but not used is likely a mistake, and should
be removed to avoid confusion.

If a variable is intentionally defined-but-not-used, it should be
prefixed with an underscore, or some other value that adheres to the
[`lint.dummy-variable-rgx`] pattern.
```

Фікси діляться на безпечні (safe fix) і небезпечні (unsafe fix); обидві назви офіційні, з документації ruff. Безпечний гарантовано зберігає поведінку: видалити невикористаний імпорт, замінити `List` на `list`. Небезпечний може її змінити, і тому `--fix` його не застосовує, а лише каже, що він є. Застосовує `--fix --unsafe-fixes`, і тут треба читати диф, а не довіряти. Простий приклад: перевірка "чекбокс увімкнено".

```python
def is_checked(value: object) -> bool:
    return value == True
```

```bash
ruff check --fix checkbox.py
```

```text
E712 Avoid equality comparisons to `True`; use `value:` for truth checks
 --> checkbox.py:2:12
  |
1 | def is_checked(value: object) -> bool:
2 |     return value == True
  |            ^^^^^^^^^^^^^
help: Replace with `value`
  |
1 | def is_checked(value: object) -> bool:
  -     return value == True
2 +     return value
  |
note: This is an unsafe fix and may change runtime behavior

Found 1 error.
1 unsafe fix available with `--fix --unsafe-fixes`.
```

```bash
ruff check --fix --unsafe-fixes checkbox.py
cat checkbox.py
```

```text
Found 1 error (1 fixed, 0 remaining).
def is_checked(value: object) -> bool:
    return value
```

Функція з анотацією `-> bool` тепер повертає сам аргумент. Порівняйте три версії на значеннях, які реально приходять у JSON від старих конфігів.

```python live
def is_checked_eq(value: object) -> bool:
    return value == True  # як було: E712


def is_checked_fixed(value: object) -> bool:
    return value  # після --unsafe-fixes


def is_checked_strict(value: object) -> bool:
    return value is True


for raw in [True, 1, "yes", ""]:
    print(repr(raw), is_checked_eq(raw), repr(is_checked_fixed(raw)), is_checked_strict(raw))
```

```text
True True True True
1 True 1 False
'yes' False 'yes' False
'' False '' False
```

> **Пастка.** Небезпечний фікс E712 замінює порівняння на перевірку істинності (truthiness, усталений термін спільноти; документація говорить про truth value testing), а `== True` і truthiness це різні перевірки. Оригінал вважав `1` увімкненим, бо `1 == True` (bool у Python підклас int, m1-l03), а після фіксу `"yes"` теж став "увімкненим" і повертається як рядок. Правило каже правду, що `== True` поганий запис, але правильну заміну, `is True` чи truthiness, обираєте ви, знаючи дані.

<!-- task: q4 -->

Точково вимкнути правило на одному рядку можна коментарем `# noqa: F401` у кінці цього рядка. Назва `noqa` це спадщина flake8, "no quality assurance"; у документації ruff це офіційна назва директиви. Код після двокрапки обов'язковий за змістом: голий `# noqa` глушить усі правила на рядку, включно з тими, про які ви не знали. Якщо проблему пізніше прибрали, а коментар лишився, `RUF100` про це скаже.

```python
import json  # noqa: F401
import os  # noqa: F401


def label(field: dict) -> str:
    return os.path.basename(field["id"])
```

```bash
ruff check noqa_demo.py
```

```text
RUF100 [*] Unused `noqa` directive (unused: `F401`)
 --> noqa_demo.py:2:12
  |
1 | import json  # noqa: F401
2 | import os  # noqa: F401
  |            ^^^^^^^^^^^^
help: Remove unused `noqa` directive
  |
1 | import json  # noqa: F401
  - import os  # noqa: F401
2 + import os
3 |
  |

Found 1 error.
[*] 1 fixable with `--fix`.
```

`noqa` має бути рідкістю, бо кожен такий коментар означає "правило загалом слушне, але тут я знаю краще", і рев'юер має це перевірити. Законні випадки поодинокі: імпорт заради побічного ефекту (модуль реєструє щось при імпорті) або реекспорт. Для змінної, яку справді не треба використовувати, є префікс `_`, який F841 пропускає. Для цілої категорії файлів, наприклад тестів, правило вимикають у конфігі через `[tool.ruff.lint.per-file-ignores]`, а не коментарем у кожному рядку. Усе інше лікується виправленням коду.

> **JS-аналог.** `// eslint-disable-next-line no-unused-vars` ставиться над рядком. `# noqa` ставиться в кінці того самого рядка; над рядком він стосується лише себе, тобто порожнього коментаря, і правило спрацює.

## Правила, на які наступає JS-розробник

**E711 і E712: `== None`, `== True`.** Повний вивід для обох уже був вище на `answers.py`. Механізм такий: `==` викликає метод `__eq__` лівого операнда, а `is` порівнює identity, тобто чи це той самий об'єкт. Методи з подвійними підкресленнями на кшталт `__eq__` називають dunder-методами (dunder, жаргон спільноти від "double underscore"; у документації це special methods). `__eq__` клас може перевизначити як завгодно, і бібліотеки так роблять: колонка SQLAlchemy на `== None` повертає вираз SQL, масив numpy повертає масив. `None` існує в одному екземплярі, тому `is None` завжди чесний. З `== True` інша історія: `bool` у Python підклас `int`, тому `1 == True`.

```python live
class Anything:
    def __eq__(self, other):
        return True


value = Anything()
print(value == None)
print(value is None)

print(1 == True)
print("yes" == True, bool("yes"))
```

```text
True
False
True
False True
```

**E731: `lambda` у змінній.** У JS `const normalize = (v) => ...` це норма, у Python `lambda` лише вираз для передачі аргументом (`sorted(key=lambda f: f["order"])`), і `def` для іменованої функції такий самий за довжиною. Причина правила не естетика: функція з `lambda` називається `<lambda>`, і саме так вона з'явиться в traceback, у логах і профайлері; анотацій типів і docstring (рядка документації, офіційний термін з PEP 257) у неї теж не буде. Детально про межі `lambda` в m1-l09.

```python
normalize = lambda value: value.strip().lower()
```

```bash
ruff check normalize.py
```

```text
E731 Do not assign a `lambda` expression, use a `def`
 --> normalize.py:1:1
  |
1 | normalize = lambda value: value.strip().lower()
  | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
help: Rewrite `normalize` as a `def`
  |
  - normalize = lambda value: value.strip().lower()
1 + def normalize(value):
2 +     return value.strip().lower()
  |
note: This is an unsafe fix and may change runtime behavior

Found 1 error.
1 unsafe fix available with `--fix --unsafe-fixes`.
```

```python
normalize = lambda value: value.strip().lower()


def normalize_def(value):
    return value.strip().lower()


print(normalize.__name__, normalize_def.__name__)
normalize(None)
```

```text
<lambda> normalize_def
Traceback (most recent call last):
  File "lambda_trace.py", line 9, in <module>
    normalize(None)
  File "lambda_trace.py", line 1, in <lambda>
    normalize = lambda value: value.strip().lower()
                              ^^^^^^^^^^^
AttributeError: 'NoneType' object has no attribute 'strip'
```

**B006: змінюване значення за замовчуванням.** Значення за замовчуванням обчислюється один раз, коли виконується `def`, і живе в атрибуті функції. Список чи словник там спільний для всіх викликів, які аргумент не передали. У JS default обчислюється на кожен виклик, тому інтуїція підводить саме тут. Механізм детально в m1-l07; ruff ловить це до запуску.

```python
def build_field(field_id: str, attrs: dict = {}) -> dict:
    attrs["id"] = field_id
    return attrs
```

```bash
ruff check defaults.py
```

```text
B006 Do not use mutable data structures for argument defaults
 --> defaults.py:1:46
  |
1 | def build_field(field_id: str, attrs: dict = {}) -> dict:
  |                                              ^^
2 |     attrs["id"] = field_id
3 |     return attrs
  |
help: Replace with `None`; initialize within function
  |
  - def build_field(field_id: str, attrs: dict = {}) -> dict:
1 + def build_field(field_id: str, attrs: dict = None) -> dict:
2 +     if attrs is None:
3 +         attrs = {}
4 |     attrs["id"] = field_id
  |
note: This is an unsafe fix and may change runtime behavior

Found 1 error.
1 unsafe fix available with `--fix --unsafe-fixes`.
```

```python live
def build_field(field_id: str, attrs: dict = {}) -> dict:
    attrs["id"] = field_id
    return attrs


email = build_field("email")
phone = build_field("phone")
print(email, phone, email is phone)
print(build_field.__defaults__)
```

```text
{'id': 'phone'} {'id': 'phone'} True
({'id': 'phone'},)
```

**F401 і F841: невикористані імпорт і змінна.** Обидва вже були у виводі `form_utils.py` вище. Це `noUnusedLocals` і `no-unused-vars` з TS-світу, з однією різницею для F401: у Python немає бандлера з tree-shaking, `import` виконує код модуля під час імпорту, тому зайвий імпорт коштує часу старту, а не лише рядка (система імпортів у m3-l01). F401 фікситься безпечно, F841 лише небезпечно, бо видалення присвоєння може прибрати коментар біля нього або виклик із побічним ефектом.

**N802, N803, N806: camelCase.** Функції, аргументи й локальні змінні в `snake_case`; правила group `N` перевіряють саме ідентифікатори і не чіпають рядки та ключі словників. Автофіксу немає: перейменування зачіпає код, який ці імена викликає, і ruff його не бачить. Конвенції в m1-l01.

```python
def getFieldById(fields: list[dict], fieldId: str) -> dict | None:
    for field in fields:
        matchedField = field if field["id"] == fieldId else None
        if matchedField:
            return matchedField
    return None
```

```bash
ruff check naming.py
```

```text
N802 Function name `getFieldById` should be lowercase
 --> naming.py:1:5
  |
1 | def getFieldById(fields: list[dict], fieldId: str) -> dict | None:
  |     ^^^^^^^^^^^^
2 |     for field in fields:
3 |         matchedField = field if field["id"] == fieldId else None
  |

N803 Argument name `fieldId` should be lowercase
 --> naming.py:1:38
  |
1 | def getFieldById(fields: list[dict], fieldId: str) -> dict | None:
  |                                      ^^^^^^^^^^^^
2 |     for field in fields:
3 |         matchedField = field if field["id"] == fieldId else None
  |

N806 Variable `matchedField` in function should be lowercase
 --> naming.py:3:9
  |
1 | def getFieldById(fields: list[dict], fieldId: str) -> dict | None:
2 |     for field in fields:
3 |         matchedField = field if field["id"] == fieldId else None
  |         ^^^^^^^^^^^^
4 |         if matchedField:
5 |             return matchedField
  |

Found 3 errors.
```

**UP: старий синтаксис типів.** Половина туторіалів і відповідей у мережі написані до Python 3.9–3.10 і імпортують `List`, `Dict`, `Optional`, `Union` з `typing`. З 3.9 працює `list[str]`, з 3.10 `str | None`. Правила `UP` знають `target-version` і пропонують сучасний запис; ці фікси безпечні, і `--fix` прибирає зайвий імпорт сам. Сама типізація в m2-l06.

```python
from typing import Dict, List, Optional, Union


def group(fields: List[dict]) -> Dict[str, List[dict]]: ...


def parse(raw: Union[str, bytes]) -> Optional[dict]: ...
```

```bash
ruff check --output-format concise old_types.py
ruff check --fix old_types.py
cat old_types.py
```

```text
old_types.py:1:1: UP035 `typing.Dict` is deprecated, use `dict` instead
old_types.py:1:1: UP035 `typing.List` is deprecated, use `list` instead
old_types.py:4:19: UP006 [*] Use `list` instead of `List` for type annotation
old_types.py:4:34: UP006 [*] Use `dict` instead of `Dict` for type annotation
old_types.py:4:44: UP006 [*] Use `list` instead of `List` for type annotation
old_types.py:7:16: UP007 [*] Use `X | Y` for type annotations
old_types.py:7:38: UP045 [*] Use `X | None` for type annotations
Found 7 errors.
[*] 5 fixable with `--fix`.
Found 9 errors (9 fixed, 0 remaining).


def group(fields: list[dict]) -> dict[str, list[dict]]: ...


def parse(raw: str | bytes) -> dict | None: ...
```

**SIM118: `key in d.keys()`.** Звичка з `Object.keys(obj).includes(key)`. У Python `in` на словнику вже перевіряє ключі, за хешем, без проміжного об'єкта. Поруч часто спрацьовує SIM103: `if умова: return True else: return False` це просто `return умова`.

```python
def has_field(fields: dict, field_id: str) -> bool:
    if field_id in fields.keys():
        return True
    else:
        return False
```

```bash
ruff check --output-format concise simplify.py
```

```text
simplify.py:2:5: SIM103 Return the condition `field_id in fields.keys()` directly
simplify.py:2:8: SIM118 [*] Use `key in dict` instead of `key in dict.keys()`
Found 2 errors.
[*] 1 fixable with `--fix` (1 unsafe fix available with `--fix --unsafe-fixes`).
```

<!-- task: t1 -->

<!-- task: t2 -->

<!-- task: t3 -->

## `ruff format`: що змінюється, а що ні

Форматер ruff відтворює стиль black майже один в один. Ось файл, написаний з JS-звичками, і диф, який дає форматер.

```python
field = {'id': 'email', 'type': 'email', 'required': True, 'label': 'Email address', 'placeholder': 'you@example.com'}
options = [
    'small',
    'large',
]
short = ['a',
         'b']
def render(field,mode='html'):
    if field['type']=='email' : return '<input type="email">'
    return "<input>"
message = 'it\'s required'
```

```bash
ruff format --diff style.py
```

```text
--- style.py
+++ style.py
@@ -1,11 +1,21 @@
-field = {'id': 'email', 'type': 'email', 'required': True, 'label': 'Email address', 'placeholder': 'you@example.com'}
+field = {
+    "id": "email",
+    "type": "email",
+    "required": True,
+    "label": "Email address",
+    "placeholder": "you@example.com",
+}
 options = [
-    'small',
-    'large',
+    "small",
+    "large",
 ]
-short = ['a',
-         'b']
-def render(field,mode='html'):
-    if field['type']=='email' : return '<input type="email">'
+short = ["a", "b"]
+
+
+def render(field, mode="html"):
+    if field["type"] == "email":
+        return '<input type="email">'
     return "<input>"
-message = 'it\'s required'
+
+
+message = "it's required"

1 file would be reformatted
```

Що тут сталось. Лапки стали подвійними, крім рядка, де всередині є подвійні лапки: `'<input type="email">'` лишився в одинарних, щоб не екранувати. Рядок `'it\'s required'` став `"it's required"` без екранування. Пробіли навколо операторів і після ком розставлені, `if ...: return` розбито на два рядки, навколо функції верхнього рівня по два порожні рядки. Довгий словник розкладено по рядку на елемент, і в кінці додано кому (trailing comma), а короткий список `short` зібрано в один рядок.

Чому `options` лишився багаторядковим, хоча влазить в один рядок: через кому після останнього елемента. Це magic trailing comma, офіційний термін документації black і ruff: якщо в колекції чи виклику стоїть кінцева кома, форматер не збирає їх в один рядок. Це єдиний важіль, яким ви керуєте розкладкою, і корисний він для списків, що ростуть: диф при додаванні елемента буде в один рядок.

Чого форматер не робить. Не перейменовує (`getLabel` лишився), не чіпає текст коментарів, не розриває довгі рядкові літерали, не сортує імпорти (`import os` лишився перед `import json`) і не змінює поведінку. Для блоку, де ручне вирівнювання несе зміст, як матриця нижче, є `# fmt: off` і `# fmt: on`; для одного рядка `# fmt: skip` у його кінці.

```python
import os
import json

def getLabel(fieldId):
    # TODO   handle   missing labels
    return LABELS.get(fieldId)

ERROR = "Field value is too long for this form element, please shorten it to fit the configured limit"
pair = ["a", "b",]
call = dict(a = 1)  # fmt: skip
LAYOUT = [
    1, 0, 0,
    0, 1, 0,
]
# fmt: off
GRID = [
    1, 0, 0,
    0, 1, 0,
]
# fmt: on
```

```bash
ruff format --diff untouched.py
```

```text
--- untouched.py
+++ untouched.py
@@ -1,16 +1,25 @@
 import os
 import json
 
+
 def getLabel(fieldId):
     # TODO   handle   missing labels
     return LABELS.get(fieldId)
 
+
 ERROR = "Field value is too long for this form element, please shorten it to fit the configured limit"
-pair = ["a", "b",]
+pair = [
+    "a",
+    "b",
+]
 call = dict(a = 1)  # fmt: skip
 LAYOUT = [
-    1, 0, 0,
-    0, 1, 0,
+    1,
+    0,
+    0,
+    0,
+    1,
+    0,
 ]
 # fmt: off
 GRID = [

1 file would be reformatted
```

Про стиль у Python-командах не сперечаються, бо сперечатися нема про що. У форматера кілька налаштувань (`line-length`, `quote-style`, `indent-style` і ще кілька), і це навмисно: black назвав себе "uncompromising", і ruff успадкував цю позицію. 88 символів, подвійні лапки, кома в кінці багаторядкових конструкцій це не чийсь смак, а стандарт, однаковий у більшості відкритих Python-проєктів і у вашому капстоуні. У Prettier опцій більше, і команди досі обговорюють `singleQuote` і `semi`; тут таке обговорення закінчується на "запусти форматер".

> **Пастка.** Одинарні лапки з JS-звички. `quote-style = "single"` у `[tool.ruff.format]` існує, але з ним ваш код виглядатиме чужим для будь-якого Python-розробника, і кожен diff між вашим кодом і скопійованим прикладом буде у лапках. Лапки не варто налаштовувати; форматер переписує їх сам, тож і стежити за ними не доводиться.

<!-- task: q2 -->

## Сортування імпортів

Правило `I001` перевіряє, що блок імпортів розбитий на секції й відсортований. Секцій чотири, через порожній рядок: стандартна бібліотека, сторонні пакети (third-party), пакети вашого проєкту (first-party) і відносні імпорти з `.`. Терміни third-party і first-party офіційні, з документації isort і ruff. Усередині секції спершу рядки `import x`, потім `from x import y`, за алфавітом, а `import sys, os` розбивається на два рядки.

```python
from formbuilder.models import FormConfig
import pydantic
import json
from pathlib import Path
import sys, os
from .utils import slugify
from typing import Any
import httpx

__all__ = ["FormConfig", "pydantic", "json", "Path", "sys", "os", "slugify", "Any", "httpx"]
```

```bash
ruff check --select I imports.py
```

```text
I001 [*] Import block is un-sorted or un-formatted
  --> imports.py:1:1
   |
 1 | / from formbuilder.models import FormConfig
 2 | | import pydantic
 3 | | import json
 4 | | from pathlib import Path
 5 | | import sys, os
 6 | | from .utils import slugify
 7 | | from typing import Any
 8 | | import httpx
   | |____________^
 9 |
10 |   __all__ = ["FormConfig", "pydantic", "json", "Path", "sys", "os", "slugify", "Any", "httpx"]
   |
help: Organize imports
   |
   - from formbuilder.models import FormConfig
   - import pydantic
1  | import json
2  + import os
3  + import sys
4  | from pathlib import Path
   - import sys, os
   - from .utils import slugify
5  | from typing import Any
6  +
7  | import httpx
8  + import pydantic
9  +
10 + from formbuilder.models import FormConfig
11 +
12 + from .utils import slugify
13 |
   |

Found 1 error.
[*] 1 fixable with `--fix`.
```

```bash
ruff check --select I --fix imports.py
cat imports.py
```

```text
Found 1 error (1 fixed, 0 remaining).
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
import pydantic

from formbuilder.models import FormConfig

from .utils import slugify

__all__ = ["FormConfig", "pydantic", "json", "Path", "sys", "os", "slugify", "Any", "httpx"]
```

Звідки ruff знає, що `formbuilder` ваш, а `pydantic` сторонній. Налаштування `src` за замовчуванням дорівнює `[".", "src"]`: модуль, знайдений у корені проєкту або в `src/`, вважається first-party. У цій папці лежить `src/formbuilder/`, тобто src-layout, до якого курс прийде в m0-l06. Якщо структура нестандартна, ім'я пакета вказують явно: `known-first-party = ["formbuilder"]` у `[tool.ruff.lint.isort]`.

Сортування імпортів це правило лінтера, а не форматера: `ruff format` порядок імпортів не чіпає, це було видно в дифі `untouched.py` вище. Тому `I` має бути в `select`, і тоді звичайний `ruff check --fix` сортує імпорти разом з іншими фіксами. `--select I` у командному рядку замінює набір з конфігу на цей запуск, і це зручно для разового прибирання імпортів у чужому коді без решти діагностик.

> **JS-аналог.** Це `import/order` з `eslint-plugin-import` або `prettier-plugin-organize-imports`, з різницею в тому, що секції фіксовані стандартом (PEP 8 описує саме такий порядок), а не налаштовуються під кожен проєкт.

<!-- task: p1 -->

## Редактор, pre-commit і CI

У VS Code ставиться розширення Ruff від Astral (`charliermarsh.ruff`). Воно запускає language server, вбудований у сам бінарник (`ruff server` з `ruff --help` вище), бере `ruff` з `.venv` проєкту і конфіг з того самого `pyproject.toml`, тому редактор і CLI бачать однакові правила. Format on save і фікси при збереженні вмикаються в `settings.json` так само, як для ESLint і Prettier.

```json
{
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll": "explicit",
      "source.organizeImports": "explicit"
    }
  }
}
```

`source.fixAll` застосовує ті самі безпечні фікси, що `ruff check --fix`, а `source.organizeImports` сортує імпорти. У PyCharm той самий результат дає плагін Ruff з JetBrains Marketplace; принцип однаковий: IDE викликає ruff з `.venv` і читає `pyproject.toml`.

Щоб неформатований код не потрапляв у коміт, ruff ставлять у pre-commit-хук; це окремий інструмент зі своїм конфігом, детально в m3-l06. У CI достатньо одного рядка: перевірка без змін і з кодом виходу 1, якщо щось не так. `--output-format github` друкує діагностики у форматі анотацій GitHub Actions, і вони з'являються прямо в рядках PR.

```bash
ruff check --output-format github . && ruff format --check .
```

```text
2 files already formatted
```

На чистому проєкті `check` у цьому форматі мовчить, а підсумок друкує лише `format --check`. На файлі з помилками кожна діагностика стає рядком `::error`, який Actions перетворює на анотацію.

```bash
ruff check --output-format github answers.py
```

```text
::error title=ruff (E711),file=answers.py,line=2,col=17,endLine=2,endColumn=21::answers.py:2:17: E711 Comparison to `None` should be `cond is None`%0A  help: Replace with `cond is None`
::error title=ruff (E712),file=answers.py,line=4,col=8,endLine=4,endColumn=24::answers.py:4:8: E712 Avoid equality comparisons to `True`; use `required:` for truth checks%0A  help: Replace with `required`
```

Кеш ruff пише в `.ruff_cache/` поруч з конфігом і сам кладе туди `.gitignore`, тож у git кеш не потрапить навіть без запису в кореневому `.gitignore` (його вміст для Python-проєкту розібраний у m0-l02).

```bash
ls -a .ruff_cache
cat .ruff_cache/.gitignore
```

```text
.
..
.gitignore
0.17.1
CACHEDIR.TAG
# Automatically created by ruff.
*
```

## Для капстоуну

`pyproject.toml` проєкту `formbuilder` з m0-l02 (чернетка в `practice/m0-l02/formbuilder-draft/`, бо `capstone/` з'явиться в m0-l06) отримує секції ruff. Команди нижче виконуються з папки чернетки. Набір той самий, що в цьому уроці; він фіксується зараз, до першого рядка коду, щоб кожен наступний модуль писався вже під нього.

```toml
[project]
name = "formbuilder"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "N", "SIM", "RUF"]
ignore = ["E501"]
```

Стартовий файл, перенесений з JS-логіки показу поля за умовою `visibleIf`, як вона жила у FormBuilder.

```python
from typing import List
import json


def visibleFields(config: dict, answers: dict) -> List[dict]:
    result = []
    for field in config['fields']:
        visibleIf = field.get('visibleIf')
        if visibleIf == None:
            result.append(field)
        elif answers.get(visibleIf['field']) == visibleIf['equals']:
            result.append(field)
    return result
```

```bash
ruff check --output-format concise .
```

```text
src/formbuilder/visibility.py:1:1: UP035 `typing.List` is deprecated, use `list` instead
src/formbuilder/visibility.py:1:1: I001 [*] Import block is un-sorted or un-formatted
src/formbuilder/visibility.py:2:8: F401 [*] `json` imported but unused
src/formbuilder/visibility.py:5:5: N802 Function name `visibleFields` should be lowercase
src/formbuilder/visibility.py:5:51: UP006 [*] Use `list` instead of `List` for type annotation
src/formbuilder/visibility.py:8:9: N806 Variable `visibleIf` in function should be lowercase
src/formbuilder/visibility.py:9:9: SIM114 [*] Combine `if` branches using logical `or` operator
src/formbuilder/visibility.py:9:25: E711 Comparison to `None` should be `cond is None`
Found 8 errors.
[*] 4 fixable with `--fix` (1 unsafe fix available with `--fix --unsafe-fixes`).
```

Робочий цикл: `ruff check --fix .` забирає безпечне, лишаються ручні правки.

```bash
ruff check --fix --output-format concise .
```

```text
src/formbuilder/visibility.py:3:5: N802 Function name `visibleFields` should be lowercase
src/formbuilder/visibility.py:6:9: N806 Variable `visibleIf` in function should be lowercase
src/formbuilder/visibility.py:7:25: E711 Comparison to `None` should be `cond is None`
Found 8 errors (5 fixed, 3 remaining).
1 unsafe fix available with `--fix --unsafe-fixes`.
```

Після перейменування і `is None` рядок умови виріс за 88 символів, і саме тому форматер іде останнім: він розбиває умову в дужки, а лінтер на довжину не скаржиться, бо E501 вимкнено.

```bash
ruff format .
ruff check . && ruff format --check .
```

```text
1 file reformatted
All checks passed!
1 file already formatted
```

```python
def visible_fields(config: dict, answers: dict) -> list[dict]:
    result = []
    for field in config["fields"]:
        visible_if = field.get("visibleIf")
        if (
            visible_if is None
            or answers.get(visible_if["field"]) == visible_if["equals"]
        ):
            result.append(field)
    return result
```

> **Для капстоуну.** Ключі JSON-конфігу FormBuilder лишаються в camelCase: `field.get("visibleIf")` правила `N` не чіпають, бо це рядок, а не ідентифікатор. Перекладається в `snake_case` лише Python-ім'я змінної. Коли з'являться Pydantic-моделі (m2-l09), розрив між `visibleIf` у JSON і `visible_if` в атрибуті закриє `alias_generator`, а не ручне перейменування.

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **Шукати плагіни, як для ESLint.** За звичкою ставлять `flake8-bugbear` чи шукають `ruff-plugin-*`. У ruff усі правила вбудовані, плагін вмикається префіксом.

   ```toml
   [tool.ruff.lint]
   select = ["E", "F", "I", "UP", "B", "N", "SIM", "RUF"]  # B це і є bugbear
   ```

2. **Думати, що `select` додає до стандартного набору.** `select` замінює набір повністю; разовий `--select` у CLI так само. Хто пише `select = ["B"]`, вимикає і F401, і все інше.

   ```bash
   ruff check --select B --output-format concise form_utils.py
   ```

   ```text
   form_utils.py:22:44: B006 Do not use mutable data structures for argument defaults
   Found 1 error.
   1 unsafe fix available with `--fix --unsafe-fixes`.
   ```

3. **Форматувати до фіксів.** Звичка `prettier --write` першим. Фікси лінтера лишають порожні рядки й довгі рядки, тож порядок завжди `check --fix`, потім `format`.

   ```bash
   ruff check --fix . && ruff format .
   ```

4. **Чекати від лінтера перевірки типів.** Функція, яка обіцяє `str` і повертає `int`, проходить `ruff check` чисто й падає лише в рантаймі. Типи перевіряє mypy або pyright (m2-l08).

   ```python
   def next_step(step: int) -> str:
       return step + 1
   ```

   ```text
   All checks passed!
   ```

5. **`--unsafe-fixes` наосліп.** E712 перетворює `return value == True` на `return value`, і функція з `-> bool` повертає рядки. Небезпечні фікси застосовують, прочитавши `--diff`, або руками.

   ```python
   def is_checked(value: object) -> bool:
       return value is True  # явне рішення замість truthiness
   ```

6. **`# noqa` над рядком, як `eslint-disable-next-line`.** Коментар над рядком нічого не глушить, а сам стає порушенням RUF100. Голий `# noqa` без коду глушить усе підряд.

   ```python
   # noqa: F401
   import os
   ```

   ```text
   noqa_above.py:1:1: RUF100 [*] Unused `noqa` directive (unused: `F401`)
   noqa_above.py:2:8: F401 [*] `os` imported but unused
   Found 2 errors.
   [*] 2 fixable with `--fix`.
   ```

7. **Одинарні лапки як стиль і налаштування форматера під себе.** `quote-style = "single"` технічно можливий, але стандарт спільноти подвійні лапки, і форматер ставить їх сам.

   ```python
   message = "it's required"  # так пише ruff format, і так читають усі
   ```

## Підсумок

- PEP 8 не вчать напам'ять: розкладку робить `ruff format`, решту ловить `ruff check`.
- ruff замінив flake8, black, isort і pyupgrade: один бінарник на Rust, один конфіг у `pyproject.toml`, коди правил зберегли префікси джерел.
- `ruff check --fix` застосовує лише безпечні фікси; `--diff` показує зміни без запису; `ruff format --check` для CI.
- Порядок завжди такий: `ruff check --fix`, потім `ruff format`.
- `select` замінює стандартний набір, `extend-select` додає, `ignore` вимикає; набір для курсу `E, F, I, UP, B, N, SIM, RUF` без `E501`.
- Стандартний набір ruff 0.17 не містить E711, E712, E731 і правил `N`; явний `select` робить конфіг незалежним від версії.
- `ruff rule КОД` пояснює правило; `# noqa: КОД` у кінці рядка і лише з кодом; застарілі `noqa` ловить RUF100.
- Небезпечний фікс може змінити поведінку, як E712 з `== True`; читати диф перед `--unsafe-fixes`.
- Сортування імпортів це правило `I001`, а не форматер; first-party визначається через `src`.
- Лінтер не перевіряє типи: це mypy або pyright.

## Що далі

Наступний урок m0-l05 про traceback, `breakpoint()` і pdb. Traceback ви вже бачили вище, з `<lambda>` у ньому; там же з'явиться причина додати до набору правило `T100`, яке ловить забутий `breakpoint()` (`extend-select = ["T10"]`). Конфіг ruff з цього уроку переїде у скелет капстоуну в m0-l06, а в m3-l06 ruff разом з mypy стане pre-commit-хуком.
