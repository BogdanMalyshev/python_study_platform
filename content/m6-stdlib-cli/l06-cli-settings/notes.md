# Нотатки до m6-l06

## Що запускалось

Усе з кореня проєкту. Python 3.12.12 (`.venv/bin/python`), pydantic 2.14.1. Typer і pydantic-settings у `.venv`
немає, тому для не-live прикладів створено тимчасовий venv у scratch-підпапці `m6-l06` (uv 0.9.28, той самий
інтерпретатор 3.12.12): typer 0.27.3, pydantic-settings 2.16.0, python-dotenv 1.2.4, rich 15.0.0, pytest 9.1.1.
Після перевірки підпапку видалено.

- 14 stdlib-блоків `lesson.md` (усі `python live` і звичайні `python` з наступним `text`) витягнуто з файлу
  скриптом і виконано через `.venv/bin/python -c` з `PYTHONUNBUFFERED=1`, `COLUMNS=80`, stderr злитим у stdout;
  вивід звірено з `text`-блоками після нормалізації. Збіг 14 з 14; приклад з `sys.exit` усередині функції дав код 1.
- Не-live блоки (argparse `--help`, `fbt.py` на Typer, адаптер `main` для Typer, `one.py` без анотацій, `d1.py`
  з python-dotenv, `settings.py`/`s2.py`/`s3.py`/`s4.py` з pydantic-settings, CliRunner) теж витягнуто з
  `lesson.md` у файли й запущено в scratch-venv під `env -i` (чисте оточення), з тими `.env` і змінними, що
  показані в уроці. Вивід збігається з уроком.
- `uv run --env-file .env` перевірено на uv 0.9.28. `sys.stdout.isatty()` у терміналі знято через
  `script -q /dev/null python -c ...` (емуляція TTY), у пайпі через `| cat`.
- Капстоун-код (`settings.py`, `cli.py` з розділу "Для капстоуну") лежав у scratch-копії пакета `formbuilder`
  з мінімальними заглушками `models.py` (`FormConfig`) і `app.py` (`build_pipeline`, `Pipeline.run` з `JobResult`
  `status/url/error`, як у m4-l08). Перевірено: блоки уроку побайтово збігаються з файлами; `mypy --strict` на
  `src` і `tests` без помилок; `ruff check` і `ruff format --check` з конфігом капстоуну на `cli.py`,
  `settings.py`, `tests/` без зауважень; 7 тестів `tests/test_cli.py` проходять, у тому числі з
  `FORMBUILDER_LOG_LEVEL=nonsense` в оточенні; без autouse-фікстури той самий запуск дає 6 падінь (вивід у
  пастці); команди CLI з розділу знято з цієї копії. `capstone/` курсу не змінювався.
- 5 рішень `tasks.yaml` разом з harness виконано через `.venv/bin/python`, вивід збігся з `expected` після
  нормалізації; стартери дають інший вивід. Перевірено, що кожен id вставлено в `lesson.md` рівно один раз.
- 4 quiz звірені запуском: q1 і q2 через `.venv`, q3 через scratch-venv з `.env` і змінною оточення, q4 за
  довідкою Typer (`--dry-run/--no-dry-run`).

## Рішення

- Повідомлення argparse про `invalid choice` у 3.12.12 друкує варіанти без лапок (`choose from html, text`),
  тоді як ранні патчі 3.12, які може мати Pyodide, друкували їх з лапками. Тому жоден `expected` у завданнях не
  містить текстів помилок argparse: harness перехоплює stderr і друкує лише код `SystemExit` або факт наявності
  `usage`. Довідка (`--help`) теж не потрапляє в `expected`, бо залежить від ширини терміналу.
- Typer 0.27.3 вендорить Click 8.3.1 у `typer._click` і не має залежності `click`; у тексті так і сказано,
  "Click під капотом" з уточненням.
- `exit_on_error=False` згадано одним реченням без прикладу. На 3.12.12 перевірено: невалідний тип, відсутній
  обов'язковий і невідомий аргумент приходять як `ArgumentError`, а `--help` усе одно дає `SystemExit(0)`.
  Чи так само поводиться патч 3.12 у Pyodide, не перевірялось, тому урок радить перехоплювати `SystemExit`.
- Для капстоуну обрано Typer + pydantic-settings, `main(argv) -> int` лишається адаптером, що повертає код
  `SystemExit` від Typer, тож смоук-тест m0-l06 `main(["--help"]) == 0` не ламається. Логування в CLI
  налаштовується заміною обробника логера `formbuilder` на кожен виклик, а не `basicConfig`, щоб працювали
  `capsys` і `caplog` у повторних викликах; у тексті вказано, що зі structlog з m5-l09 це місце замінюється.
- Код виходу для невалідних налаштувань: 2 (помилка виклику, як в argparse), для невалідного конфігу й падіння
  пайплайну: 1.
- pydantic-settings у браузері недоступний, тому t5 відтворює його механізм на звичайному Pydantic: шари
  defaults → env з префіксом → прапорці CLI без `None`.
- `os.environ` подано в обсязі, потрібному для конфігурації; решта `os`/`sys` і сигнали лишаються m6-l07.
  Повний огляд фікстур pytest у m3-l03, налаштування логування в m5-l09, змінні в Docker у m7-l07: тут по одному
  реченню з посиланням.
- Обсяг: 38 абзаців теорії плюс 12 callout-блоків, 8 теоретичних розділів, у межах орієнтира. Поділ не потрібен,
  хоча урок на межі: якщо скорочувати, розділ про тестування CLI найлегше злити з розділом для капстоуну.

## Незакриті питання

Немає, усі пункти `questions.md` позначено.

## Залежності

Спирається на m0-l03 (`sys.argv`, коди виходу), m0-l06 (`[project.scripts]`, `main(argv)`, смоук-тест),
m1-l07 (mutable default), m2-l04 (шари з `None`), m2-l08 (`Namespace` як `Any`), m2-l09 (Pydantic),
m3-l03 (`capsys`, `monkeypatch`, `caplog`), m4-l08 (`build_pipeline`, `@cache get_settings`), m5-l09 (рівні
логування). Готує m6-l07 (`SystemExit`, коди виходу), m6-l08 (шлях до SQLite у `Settings`), m7-l01
(`get_settings` як залежність FastAPI, команда `serve`), m7-l07 (`FORMBUILDER_*` у контейнері).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- У `Settings` додано `workers: int = Field(default=2, ge=0)` (воркери генерації для `create_app` у m7). Перевірено з pydantic-settings: default 2, `workers=-1` дає `FORMBUILDER_WORKERS: Input should be greater than or equal to 0`.
- У коді `cli.py` імпорт `formbuilder.app`/`formbuilder.models` замінено: `build_pipeline` живе в `cli.py` (m4-l08), `FormConfig` з `formbuilder.config`, `pipeline.run` через `asyncio.run`. Вивід прогону знімався на заглушках з тими самими іменами і не змінюється.
