# Нотатки до m0-l06

## Що запускалось

Інструменти: uv 0.9.28, CPython 3.12.12 (uv-managed), у `capstone/.venv`: pytest 9.1.1, ruff 0.17.1, mypy 2.4.0,
build backend `uv_build` (>=0.9.28,<0.10.0). Python-приклади й завдання через `.venv/bin/python` кореня курсу (3.12.12).
Тимчасові проєкти й скрипти лежали в `<scratchpad>/m0-l06/` і видалені після перевірки.

- Скелет `capstone/` створено `uv init --package --vcs none --python 3.12 --name formbuilder capstone` +
  `uv add --dev pytest ruff mypy`, далі файли дописано руками. На свіжому `.venv` (видалено й створено заново)
  прогнано: `uv sync`, `uv run pytest`, `uv run pytest -q`, `uv run pytest --collect-only -q`, `uv run pytest -q`
  з папки `tests/`, `uv run ruff check`, `uv run ruff format --check`, `uv run mypy src`, `uv run mypy src tests`,
  `uv run formbuilder --help` / `build form.json` / `--version` з `echo $?`, `uv run python -m formbuilder --version`,
  і фінальний ланцюжок `uv sync && uv run pytest -q && uv run ruff check && uv run mypy src && uv run formbuilder --help`.
- Editable install: `ls site-packages`, `cat formbuilder.pth`, `direct_url.json`, `entry_points.txt`, `cat .venv/bin/formbuilder`,
  `uv pip show formbuilder`, імпорт і `sys.path` з `/tmp`. У scratch-копії: `uv venv && uv pip install -e .` дає ті самі
  `formbuilder.pth` і `"editable":true`; правка `cli.py` видна в `.venv/bin/formbuilder` без перевстановлення; новий
  запис `fb` у `[project.scripts]` відсутній у `.venv/bin` до `uv run`.
- Bump версії: виконано в самому `capstone/` (`0.1.0 -> 0.2.0`, `.venv/bin/python` показує 0.1.0, `uv run` перевстановлює
  і показує 0.2.0), потім повернуто `0.1.0` і `uv sync`; `pyproject.toml` звірено з бекапом через `diff`, `uv.lock` знову
  на 0.1.0. Ці команди запускались у капстоуні, а не в scratch, щоб у виводі уроку були шляхи капстоуну, а не тимчасової папки.
- Flat проти src: два scratch-проєкти на setuptools з `packages = ["formbuilder"]` і підпакетом `render/`,
  `uv sync --no-editable`, `.venv/bin/python -m pytest -q`: flat проходить, src падає на `ModuleNotFoundError`;
  вміст встановленого пакета перевірено `ls`. Окремо `uv run --no-project --isolated python -c "import formbuilder"`
  у flat і src проєктах.
- Відносний імпорт: `uv run python src/formbuilder/check.py` з `from .config import load` (ImportError),
  `uv run python -m formbuilder.check` і абсолютний варіант за шляхом (обидва працюють).
- Коди виходу: `python -c "import sys; sys.exit(...)"; echo $?` для `0`, `None`, `2`, `True`, рядка; для q3 у scratch-копії
  `main() -> bool` з `return True` як console script дав `exit 1`.
- 4 `python live` блоки (затінення через `sys.path`, `.pth` через `site.addsitedir`, `dist-info` і `importlib.metadata`,
  `__init__.py` з реекспортом і `__all__`) виконано з файлу `lesson.md` скриптом і звірено з наступним `text`-блоком.
- `tasks.yaml` розпарсено `yaml.safe_load`; кожне `solution + harness` виконано й звірено з `expected` після нормалізації;
  кожен `starter + harness` запускається без синтаксичних помилок. Кожен `<!-- task: -->` вставлений рівно один раз.

Шлях у виводах (`/Users/mac/projects/full_stack_study/python-course/capstone`) це реальний шлях на машині учня; дрібні
числа в `uv`/pytest (мілісекунди) залежать від запуску. Тому жоден з цих виводів не є `expected` завдання.

## Рішення

- Капстоун створено в модулі 0, хоча `lesson-spec.md` (розділ 3) каже "репозиторій капстоуну створюється в модулі 2".
  Роадмап для модуля 0 вимагає шаблон проєкту для капстоуну, і замовник уроку явно доручив створити `capstone/`;
  у спеці це речення варто оновити. Проєктне завдання p1 тому доречне вже тут.
- У скелет додано `addopts = ["--import-mode=importlib"]`: документація pytest радить цей режим для нових проєктів,
  і він прибирає потребу в `tests/__init__.py`. Ціна (тестові модулі не імпортують один одного) названа одним реченням,
  детально в m3-l03.
- `cli.py` трохи більше за "одну заглушку help": `--help`/без аргументів, `--version` з `importlib.metadata`, і код 2 зі
  stderr на невідомі аргументи. Це дає реальний матеріал для контракту `sys.exit(main())` і smoke-тесту, без argparse
  (m6-l06).
- `__version__` у `__init__.py` читається з `importlib.metadata.version`, а не пишеться руками: це і є відповідь на питання
  про версію. `py.typed` не додавався: `mypy src tests` проходить і без нього, пакет не публікується як бібліотека.
- Build backend лишився `uv_build`, який згенерував `uv init`; setuptools використано лише в експерименті flat/src, бо
  на ньому класична помилка "підпакет не потрапив у wheel" відтворюється чесно (uv_build пакує всю папку модуля сам).
- Утиліти `tree` на машині немає, тому дерево показано реальним виводом `find ... | sort` і згадано `tree -a -I .venv`.
- Розділів `##` сім теоретичних, `Для капстоуну` і три обов'язкові. Теорії 38 абзаців (у межах 20–40), 9 callout-блоків.
  Ділити урок не варто: питань 11, і майже кожне вимагає реального виводу команд.
- Завдання з кодом (5, усі `runtime: browser`, stdlib only) моделюють механізми уроку функціями, бо справжня структура
  проєкту в браузері не запускається: шлях -> ім'я модуля, завантаження entry point через `importlib`, `main()` з кодами
  виходу і stderr, правила збору pytest, лінтер скелета на `tomllib`. Саму структуру перевіряє проєктне завдання p1 з
  `verify`, що запускається з кореня курсу і починається з `cd capstone && uv sync && uv run ...` (конвенція
  `docs/lesson-spec.md` для капстоун-завдань; редакторська правка, перевірена на копії еталонного `capstone/`).
- Не переказувались: склад `.gitignore` і `[dependency-groups]` (m0-l02), набір правил ruff (m0-l04), механізм `-m` і
  `sys.path[0]` (m0-l03), фікстури й assertion rewriting (m3-l03), відносні імпорти й циклічні імпорти (m3-l01),
  strict mypy (m2-l08). Скрізь одне речення з посиланням.

## Незакриті питання

Немає. Усі 11 питань `questions.md` закриті командами з реальним виводом або live-прикладами.

## Залежності

- Спирається на m0-l02 (uv, `pyproject.toml`, `uv.lock`, `.gitignore`), m0-l03 (`sys.path[0]`, `python -m`, `__name__`),
  m0-l04 (конфіг ruff), m0-l05 (формально попередній урок; traceback-и тут читаються знизу вгору).
- Готує для m1-l01 і всього модуля 1 (робоче місце для перенесення прикладів), m2-l08 (`[tool.mypy] strict` вже в
  конфігу), m2-l09 (p1 там кладе `src/formbuilder/models.py` у цей скелет), m3-l01 (абсолютні/відносні імпорти,
  `__init__.py`, `__all__`), m3-l03 (`testpaths`, `importlib` mode, smoke-тест як перший тест), m6-l06 (заглушка
  `cli.py` замінюється справжньою CLI), модуль 7 (той самий пакет отримує FastAPI-застосунок).
- Еталонний скелет: `capstone/` у корені курсу (`.venv/` лишено, він у `.gitignore`).
