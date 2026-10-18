# Нотатки до m3-l01

## Що запускалось

Усе через `.venv/bin/python` (Python 3.12.12, pydantic 2.14.1, mypy, ruff 0.17.1) у тимчасовій папці
`<scratchpad>/m3-l01/`, видаленій після перевірки. Шляхи в traceback скорочено до basename файлу, решта виводу дослівна.

- Багатофайлові приклади. Кожен приклад з `lesson.md`, показаний як набір блоків ```` ```python ```` з коментарем-іменем
  файлу в першому рядку, скрипт перевірки витягував прямо з `lesson.md`, розкладав у свіжу папку, запускав указаною
  командою і порівнював з наступним блоком `text` (32 перевірки, 0 розбіжностей): повторний імпорт і `reload`,
  імпорт у функції, форми `import`, `from json import dumps` і `sys.modules`, не-live binding, `__all__` і `*`
  (і варіант без `__all__`), `from os import *` і `open`, порядок виконання `__init__.py`, `xml.dom`, namespace package,
  barrel з Pydantic, відносні імпорти за шляхом і через `-m`, `..` вище кореня, `import config` без крапки,
  `json.py` і `random.py` → `tempfile`, обидва варіанти циклу (`ImportError` і `AttributeError`), цикл через
  `__init__.py`, три способи лікування, `NameError` з `TYPE_CHECKING` без лапок, варіанти з лапками і з
  `from __future__ import annotations` (разом з `mypy --strict`), Pydantic з `TYPE_CHECKING`, читання файлу при імпорті,
  подвійне виконання `__main__`, модуль-singleton з `functools.cache`, `importlib.import_module`.
- `python3.14` (Homebrew 3.14.5): той самий `domain.py` з `TYPE_CHECKING` без лапок працює (лінива оцінка анотацій);
  `json.py` дає підказку `consider renaming`. Обидва виводи в уроці позначено як 3.14.
- `sys.path` і запуск з чужого venv: на справжньому `capstone/.venv/bin/python` і `.venv/bin/python` кореня, лише
  читання, без `uv sync`.
- Капстоун: копія `capstone/` у scratch (без `.venv`), `uv add --offline pydantic`, еталонна розкладка
  `config.py`, `domain.py`, `renderers/{__init__,base,html,text}.py`, `cli.py`, тести `test_layers.py` і
  `test_registry.py`. Пройшли `uv run ruff check`, `ruff format --check`, `uv run mypy src tests`, `uv run pytest -q`
  (8 тестів). Обидві команди `verify` з `p1` і `p2` запущено дослівно, код виходу 0. Окремо зібрано стан "лише p1"
  (без реєстру і `text.py`) і на ньому теж пройшов `verify` з `p1`. Вивід TID252, цикл без `TYPE_CHECKING`,
  `formbuilder render ... html/text/pdf`, наївний реєстр з `pdf.py` → `import weasyprint` знято з цієї копії.
  Фрагменти `domain.py` і `renderers/__init__.py` в уроці звірено з файлами еталона (другий збігається дослівно).
- `tasks.yaml`: розпарсено `yaml.safe_load`; кожне `solution + harness` збігається з `expected` після нормалізації;
  кожне `starter + harness` падає або дає інший вивід; для `t1` і `t4` також наївні версії (`startswith` без крапки,
  `except ModuleNotFoundError` без `e.name`) дають інший вивід; для `t2` перевірено і варіант з `__future__`.
  Кожне завдання вставлено в урок рівно один раз. Фрагменти з quiz запущено, відповіді звірені з виводом.
- Списки "Типові помилки": `slugify` як модуль (`TypeError ... Did you mean`), `export_yaml`, `counter.count`,
  `json.__file__` запущено окремо.

## Рішення

- Розділів `##`: вісім теоретичних, `Для капстоуну` і три обов'язкові.
- Обсяг: 45 абзаців теорії за механічним підрахунком, разом з однорядковими зв'язками між прикладами ("`app/__init__.py`
  порожній", "Якщо в `cli.py` написати..."). Вище орієнтира 40, але нижче 50; 12 питань, кожне з багатофайловим
  прикладом. Якщо скорочувати, найлегше винести розділ про `sys.path`/затінення в m0-l03 або m0-l06, але питання
  `questions.md` прямо вимагають його тут.
- "config" у розкладці капстоуну трактовано як вхідну межу JSON-конфігу форми (Pydantic-моделі з m2-l09 + `load_config`),
  а не як налаштування застосунку: так його використовує `questions.md` уроку m3-l03 ("тести для `formbuilder.config`,
  валідні й невалідні конфіги"). Налаштування застосунку лишаються для m6-l06 (pydantic-settings).
- `p1` переносить файли модуля 2: `models.py` → `config.py`, `renderers.py` → пакет `renderers/`, `config_types.py`
  видаляється. Тексти завдань m2-l05...m2-l09 посилаються на старі імена; їх не змінено.
- Шари: `cli` → `config`, `renderers` → `domain`; `domain` → `renderers` лише під `TYPE_CHECKING`. Правило перевіряє
  тест `test_layers.py` через `subprocess` (subprocess це тема m6-l05, але код тесту даний готовим). import-linter
  згадано одним реченням, не встановлювався.
- Реєстр рендерерів через `importlib.import_module` + `pkgutil.iter_modules`; entry points для сторонніх плагінів
  лише згадано з посиланням на m3-l02. Реєстрація через декоратори і `__init_subclass__` лишається для m4-l04 і m5-l04,
  розкладка з ними сумісна.
- Модуль як singleton дано на одному прикладі (`settings.load()` з `functools.cache` + атрибут `verbose`) з
  посиланням на m4-l08; `monkeypatch` лише згадано (m3-l03, m3-l04).
- `if __name__ == "__main__"` і `-m` не пояснюються заново (m0-l03), показано лише наслідок кешу за іменем:
  подвійне виконання скрипта.
- PEP 810 (явні `lazy import`, прийнятий для 3.15) в уроці не згадано, бо його не можна запустити на 3.12;
  можна додати одним реченням, коли курс перейде на новішу версію.
- Завдання з кодом лише `runtime: browser`: багатофайлову поведінку в t1 і t4 харнес моделює пакетом у
  `tempfile.mkdtemp()` з `importlib.invalidate_caches()`. Імена пакетів `m3l01_*` унікальні, щоб не зіткнутися
  з чимось у Pyodide.

## Незакриті питання

Немає: усі 12 питань `questions.md` закриті кодом і виводом.

## Залежності

- Спирається на m0-l03 (`sys.path[0]`, `-m`, `__name__`), m0-l06 (src layout, `.pth`, editable install),
  m2-l05 (domain dataclass-и), m2-l07 (Protocol, `@runtime_checkable`), m2-l08 (mypy strict), m2-l09 (Pydantic-моделі).
- Готує для m3-l02 (вміст wheel, entry points для `formbuilder.renderers`), m3-l03 (тести для `formbuilder.config`,
  `monkeypatch` атрибутів модуля), m3-l04 ("патчити там, де шукають" спирається на розділ про `from ... import`),
  m3-l05 (doctest для `formbuilder.domain`), m4-l04, m4-l05, m5-l04 (реєстр рендерерів), m4-l08 (модуль як singleton),
  m6-l06 (CLI `render CONFIG [FORMAT]`).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- p1 більше нічого не перейменовує: файли модуля 2 вже на місцях (`config.py`, `domain.py`, пакет `renderers/`). Замість `load_config` тут `parse_config(text)` через `to_domain`; `load_config` з `ConfigError` додає m3-l03. Третій тест `test_layers.py` (формати не імпортуються наперед) переїхав у p2, бо до p2 `renderers/__init__.py` з m2-l07 імпортує формати.
- p2 замінює `RENDERERS`/`register()` з m2-l07 на `available_formats`/`get_renderer`; `verify` p2 проганяє ще й `test_layers.py`.
