# Нотатки до m3-l05 "doctest як документація, що виконується"

## Що запускалось

Середовище: `.venv/bin/python` і `.venv/bin/pytest` у корені проєкту (Python 3.12.12, pytest 9.1.1); для капстоуну
`uv 0.9.28`. Тимчасові файли в scratch-підпапці `m3-l05/`, після перевірки видалена.

- Кожен модуль-приклад з `lesson.md` записано у файл з тим іменем, яке названо в уроці (`slugs.py`, `fields.py`,
  `pitfalls.py`, `fixed.py`, `scope.py`, `answers.py`, `forms.py`), і запущено саме тією командою, що стоїть
  у ```` ```bash ```` під ним: `python -m doctest [-v] file.py`, `PYTHONHASHSEED=1|3 python -m doctest pitfalls.py`,
  `python scope.py` (`doctest.testmod()`), `python -OO -c ...`, `help(...)`. Абсолютні шляхи у виводі замінено на
  базові імена (`File "slugs.py"`, `File "doctest.py"`), інше дослівно.
- pytest: тимчасовий src-layout проєкт `shop` з `tests/`, `README.md` і `pyproject.toml` з уроку:
  `pytest --doctest-modules src -v | grep ...`, падіння з `-q` (приклад без лапок), `pytest -v` з `addopts`,
  `testpaths`, `doctest_optionflags`, `--doctest-glob=*.md`; `pytest -q README.md` з закривною огорожею без
  порожнього рядка (реальна пастка, знайдена під час написання); `pytest -q --doctest-modules .` з `parametrize`.
- 2 блоки ```` ```python live ```` виконано як скрипти і як `exec(compile(..., "<exec>", "exec"))` з
  `__name__ == "__main__"` (наближення до платформи); вивід однаковий.
- Капстоун: копія `capstone/` (без `.venv` і кешів) у scratch, туди додано `src/formbuilder/domain.py` за m2-l05 p1
  плюс docstring з прикладами і `find_by_name`, змінено `[tool.pytest.ini_options]`. Запущено
  `uv run pytest --doctest-modules src -q` (5 passed), `-v`, `uv run python -m doctest -v src/formbuilder/domain.py`,
  `uv run pytest -q` (6 passed: smoke + 5 doctest), `uv run ruff check`, `uv run mypy src` (обидва чисті).
  Без docstring-прикладів та сама команда дає `no tests ran` і `exit=5`, це в callout. З початковим pyproject
  `uv run pytest -q --doctest-modules` без шляхів дає `1 passed` (лише smoke), це відповідь q2.
- Підсумковий прогін скриптом: усі блоки `lesson.md` до "Типові помилки" витягнуто регулярним виразом, кожен
  модуль записано у файл, кожна команда виконана, вивід порівняно з наступним ```` ```text ```` після нормалізації
  (кінцеві пробіли, порожні рядки в кінці, `in 0.01s`, адреси `0x...`). 20 перевірок з 20 збіглися; фрагменти
  `walk` і `find_by_name` з розділу "Для капстоуну" дослівно присутні в перевіреному `domain.py`.
- `tasks.yaml` розпарсено `yaml.safe_load`; для кожного з 4 завдань `solution + harness` виконано через `exec` і
  як `python -c` з `PYTHONHASHSEED` = 0, 1, 2, 3, random: вивід збігається з `expected` у всіх 6 запусках. Кожен
  `starter + harness` дає вивід, відмінний від `expected`. Наївна версія t4 з голим `find_field(tree, "fax")`
  під `None` падає з `Got nothing`, тобто харнес ловить саме пастку уроку.
- Квізи: q1 (`Got nothing`) і q3 (множина проходить з seed 3, падає з seed 1) взяті з реальних прогонів;
  q2 перевірено на копії капстоуну. `{3, 1, 2}` друкується як `{1, 2, 3}` (згадка в explain q3).
- Кожен id з `tasks.yaml` (t1–t4, q1–q3, p1) вставлено в `lesson.md` рівно один раз.

## Рішення

- Обсяг: 22 абзаци теорії, 6 callout-блоків, 2 живі приклади. Розділів `##` десять: шість теоретичних,
  "Для капстоуну" і три обов'язкові.
- Базовий синтаксис docstring і PEP 257 дано в m1-l07; тут лише посилання і те, що потрібно проєкту:
  Google проти NumPy style, docstring модуля й класу, `help()`, IDE, `-OO`.
- Браузерні завдання перевіряють docstring через `doctest.DocTestFinder().find(func, ...)` і
  `DocTestRunner` з атрибутами `tries` і `failures`, а не через `testmod()`: так не залежимо від того, під яким
  `__name__` платформа виконує код учня. Звіт doctest про падіння (з `File ..., line ...`) друкується лише при
  падінні, тому `expected` детермінований. Припущення: модуль `doctest` (і його імпорти `pdb`, `difflib`,
  `unittest`) доступний у Pyodide; це стандартна бібліотека і не входить до списку модулів, які Pyodide виносить
  окремо, але в самому Pyodide не запускалось.
- t3 вимагає закрити ім'я модуля в `repr` через `...` (`<...Registry object at 0x...>`), бо на платформі код
  учня може виконуватись не як `__main__`. Це сказано в умові.
- p1 спирається на `domain.py` з m2-l05 p1 і додає `find_by_name`; він ще й вмикає `--doctest-modules` в
  `addopts` капстоуну, тож m3-l06 (pre-commit / CI) отримує одну команду `uv run pytest`.
- `IGNORE_EXCEPTION_DETAIL`, `REPORT_ONLY_FIRST_FAILURE`, `FAIL_FAST`, `doctest.DocFileSuite`, інтеграція з
  `unittest` (`load_tests`) і Sphinx `doctest`-розширення свідомо не розглядались: для мети уроку це шум.
- Sphinx (napoleon) і mkdocs (mkdocstrings) згадані одним реченням, як вимагає `questions.md`.

## Незакриті питання

Усі 9 питань з `questions.md` закриті кодом і реальним виводом. Поведінку підказок IDE (Pylance, PyCharm)
запуском не показати; вона описана словами, а `help()` і `__doc__` показано з виводом.

## Залежності

- Спирається на m1-l07 (docstring, `__doc__`, `help()`), m2-l01 (порядок `dict`), m2-l05 (`domain.py` з frozen
  dataclass, `walk`, `field_names`), m3-l03 (pytest, `parametrize`, `testpaths`, `addopts`), m0-l06 (src-layout,
  `--import-mode=importlib`).
- Готує m3-l06: `uv run pytest` з `--doctest-modules` в `addopts` як крок pre-push / CI.
