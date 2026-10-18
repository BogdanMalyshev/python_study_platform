# Нотатки до m0-l02

## Що запускалось

macOS (Darwin 25.6, zsh), uv 0.9.28, CPython 3.12.12 під керуванням uv (`/Users/mac/.local/bin/python3.12`).
Усе виконувалось у тимчасових проєктах у scratch-підпапці `m0-l02/`, яку після перевірки видалено. Курсовий
`.venv` і корінь курсу не змінювались, глобально нічого не ставилось: спроба `python3.12 -m pip install pydantic`
показана саме тому, що вона безпечно відмовляє (`EXTERNALLY-MANAGED` у uv-керованому Python).

Тимчасові проєкти й що в них перевірено:

- `demo/`: `python3.12 -m venv .venv`, вміст `.venv`, `pyvenv.cfg`, `sys.prefix` / `sys.base_prefix`, `activate` /
  `deactivate` і `PATH`, рядки скрипта `activate`, `pip install "pydantic>=2,<3"`, `pip list`, `pip freeze`,
  `ModuleNotFoundError` у базовому Python, `--require-hashes` на freeze-файлі (і звичайний `-r` у свіжому venv),
  `pip uninstall` із сиротами, непереносність venv (`mv demo demo-moved`, `bad interpreter`).
- окремий venv: `pip install pydantic>2` без лапок у zsh (вивід пішов у файл `2`, код 0).
- `fb-core/`: `uv init --package`, `pip install -e .`, `__file__` у `src/`, entry point `fb-core`.
- `forms-api/`: `uv init`, лінивий `.venv` і `uv.lock` після `uv run`, `uv add`, `uv add --dev`, `--bounds major`
  (preview), `uv remove` з транзитивними, `uv tree`, `uv run which python`, `VIRTUAL_ENV`, `uvx ruff@0.15.0`,
  відсутність `.venv/bin/pip`, `uv.lock` (заголовок і запис pydantic), `rm -rf .venv && uv sync`, `--no-dev`,
  ручна правка `pyproject.toml` і `--locked` проти `--frozen`, `uv lock`, неточна синхронізація `uv run`, звичайний
  `uv sync` мовчки оновлює lock (для пояснення q3), `[tool.ruff]` і `[tool.pytest.ini_options]` з `uv run pytest -v`,
  `pydantic[email]`, помилки на `^` і `~=2`, `uv pip show`, `__file__`, `importlib.metadata.version`,
  `uv run --with pyyaml`, `__pycache__` і `git status --ignored`, `.venv/.gitignore`, `uv export` у
  `requirements-txt` і `pylock.toml`, `.venv/bin/python -m pytest`.
- `pip-to-uv/` і `pip-to-uv-bad/`: міграція через `uv add -r` (пастка з п'ятьма прямими пінами) і правильна
  міграція; `verify` з p1 проходить на правильному варіанті і падає з `AssertionError` на наївному.
- `formbuilder-draft/`: `uv init --bare --name formbuilder`, `uv python pin 3.12`, `uv add --dev pytest ruff mypy`,
  таблиці інструментів, `uv sync --locked`, `uv run pytest --version`; `verify` з p2 проходить тут і падає
  (`AssertionError: name`) на `forms-api/`.
- `curl https://pypi.org/pypi/pydantic/json` для метаданих PyPI.
- Специфікатори перевірено через `packaging.specifiers.SpecifierSet` у venv `forms-api` (обидва python-блоки
  уроку), а рішення t1 додатково звірене з `SpecifierSet` на ~600 версіях для чотирьох прикладів з харнесу.

Після запису файлів: `tasks.yaml` розпарсено `yaml.safe_load`, кожне `solution + harness` виконано через
`.venv/bin/python` курсу й порівняно з `expected` після нормалізації, `starter + harness` перевірено на
розбіжність з `expected`; три python-блоки `lesson.md` виконано з файлу й звірено з наступним `text`-блоком;
чотири `toml`-блоки розпарсено `tomllib`; кожен `<!-- task -->` вставлено рівно один раз.

Особливості виводу:
- Довгий шлях до scratch-папки у виводах замінено на `…` (про це сказано в уроці один раз). Повідомлення
  `bad interpreter` zsh сам обрізає на довгому шляху; показано початок шляху й `…`.
- Довгі списки пакетів у `uv sync` і вивід `pip install` скорочено, у тексті це позначено.
- В оточенні агента стоїть `PYTHONDONTWRITEBYTECODE=1`, тому демонстрація `__pycache__` запускалась з цією
  змінною знятою (`unset`), як у звичайному терміналі учня.
- Версії в виводі (pydantic 2.14.1, pytest 9.1.1, ruff 0.17.1, mypy 2.4.0) актуальні на 18.10.2026; у учня
  будуть новіші, тому в `verify` версії не перевіряються.

Побічний ефект під час роботи: одна команда випадково скопіювала `pyproject.toml` у `/tmp/never`; файл одразу
видалено, інших змін поза scratch-підпапкою й папкою уроку немає.

## Рішення

- Розділів теорії вісім плюс `Для капстоуну` і три обов'язкові. Теорії 50 абзаців (разом з короткими
  реченнями-зв'язками перед командами), 12 callout-блоків; це верхня межа орієнтира. Урок закриває 10 питань,
  кожне з командами й виводом. Якщо автор захоче розвантажити, природний поділ: "venv і pip" (перші чотири
  розділи) і "uv і pyproject.toml" (решта). Урок здано цілим.
- Зіставлення `npm ci` → `uv sync --frozen` з `questions.md` уточнено: за поведінкою `npm ci` відповідає
  `--locked` (падає на розбіжності), `--frozen` не перевіряє `pyproject.toml`. Показано обидва з реальним виводом,
  у таблиці стоїть `--locked`, на це окремий quiz q3.
- `uv add` пише лише нижню межу (`>=`); пояснено чому, і показано `--bounds major` з позначкою preview.
- `.python-version`, `requires-python` як закріплення версії й PEP 668 лише згадані з посиланням на m0-l01.
- `python -m`, `sys.path[0]`, байткод і механізм `__pycache__` лише одним реченням з посиланням на m0-l03.
- Editable install показано одним прикладом `pip install -e .` на `uv init --package`, src-layout і
  `[project.scripts]` детально лишено m0-l06; `[build-system]` і публікація лишені m3-l02.
- `uv tool install` як заміну `npm i -g` в уроці не показано командою: це глобальна установка, яку правила
  роботи агента забороняють; згадано лише `uvx` для разового запуску.
- `uv venv` не згадується в уроці: для курсу venv створює `uv sync`/`uv run`, а `python -m venv` потрібен, щоб
  показати механізм без uv.
- Завдань з кодом три, усі `runtime: browser`, stdlib only (`tomllib`, `re`): переклад `~=` у межі, переклад
  npm-ного `^` у PEP 440, імена залежностей з `pyproject.toml`. Більше чисто пайтонівських задач тема не дає,
  основна практика в двох проєктних завданнях з `verify`.
- Проєктні завдання живуть у `practice/m0-l02/pip-to-uv/` і `practice/m0-l02/formbuilder-draft/` у корені курсу.
  Вони про uv і потребують власного оточення, тому `verify` робить `cd practice/m0-l02/<проєкт> && uv ...`
  (конвенція з `docs/lesson-spec.md`). Після перенесення шляхів обидва `verify` перепрогнано в scratch-копії кореня
  курсу: на порожніх папках падають, p1 падає з `AssertionError` на міграції через `uv add -r`, на рішеннях проходять.
- `line-length` у чернетці капстоуну 88, а не 100: так само, як у m0-l04 і в `capstone/pyproject.toml`; m0-l04 p2
  дописує в цю ж чернетку `[tool.ruff.lint]`.
- Капстоун-завдання p2 готує лише `pyproject.toml`, `.python-version`, `uv.lock` у `practice/m0-l02/formbuilder-draft/`; у m0-l06
  вони переїжджають у `capstone/`. До файлу додано `[tool.mypy] strict = true`, хоча питання вимагає лише
  dev-групу: m2-l08 вмикає строгий режим, і краще мати його з першого файлу.

## Незакриті питання

Усі 10 питань з `questions.md` закриті командами й реальним виводом.

## Залежності

- Спирається на m0-l01: uv і Python 3.12 встановлені, `python3.12` у `PATH`, `.python-version` і PEP 668 відомі.
- Готує m0-l03 (`uv run`, `.venv/bin/python`, `__pycache__` згадано), m0-l04 (`[tool.ruff]` у pyproject),
  m0-l06 (чернетка `pyproject.toml` капстоуну, editable install, `[project.scripts]`), m2-l08 (`[tool.mypy]`),
  m3-l02 (пакування, `[build-system]`, dependency groups і lockfile), m7 (`uv sync --frozen`/`--locked` у Docker).
