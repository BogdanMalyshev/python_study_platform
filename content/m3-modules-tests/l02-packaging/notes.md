# Нотатки до m3-l02

## Що запускалось

Інструменти: uv 0.9.28 (`/Users/mac/.local/bin/uv`), CPython 3.12.12 (uv-managed), backend `uv_build>=0.9.28,<0.10.0`;
для порівняння backend-ів hatchling і setuptools>=77 (ставились uv у build isolation). Python-приклади й завдання
запускались через `.venv/bin/python` кореня курсу (3.12.12, packaging 26.3). Уся робота з проєктами велась у
`<scratchpad>/m3-l02/` на копіях `capstone/`; справжній `capstone/` не змінювався.

- Копії капстоуну: `capstone/` (робоча, 0.1.0 -> 0.2.0), `replay/capstone/` (свіжа копія для повторного прогону
  кожного bash-блоку в тому вигляді, як він написаний в уроці), `capstone-ws/` (workspace, editable-залежність,
  індекс TestPyPI), `untouched/capstone/` (негативна перевірка `verify`).
- `uv build`, `uv build --clear`, `tar tzf`, `unzip -l`/`-p` для `METADATA`, `WHEEL`, `RECORD`, `entry_points.txt`;
  перерахунок sha256 з `RECORD` для `cli.py`.
- Чисте venv: `uv venv ../wheel-check` + `uv pip install` wheel (з extra `[web]` і без), запуск `formbuilder --help`,
  `--version`, `importlib.metadata`, `importlib.resources`, `load_renderers()`.
- Пастка з `Path(__file__).parents[2] / "templates"`: працює через `uv run`, `FileNotFoundError` з wheel.
  Setuptools без `package-data` не кладе `templates/page.html.j2` у wheel, з `[tool.setuptools.package-data]` кладе;
  hatchling кладе сам.
- `uv run --isolated --no-project --with dist/<wheel>` після перезбирання з тією ж версією показав старий вміст
  (відтворено двічі, `--refresh` і `--refresh-package` не допомогли). Тому і в уроці, і у `verify` перевірка йде через свіже venv.
- `uv add "pydantic>=2.11,<3"`, `uv add --optional web fastapi`, `uv add --optional web "uvicorn[standard]..."`,
  `uv sync` / `uv sync --extra web`, `uv tree --depth 1`, `uv tree --outdated`, `uv lock --upgrade-package pydantic==2.12.0`
  і назад, `uv lock --check` на розсинхронізованому lock, `uv version` з різними `--bump --dry-run`.
- Пре-релізи: чотири wheel тестового пакета `fb-demo-lib` (0.9, 1.0, 1.0.post1, 1.1rc1) у локальній папці,
  `uv pip install --no-index --find-links` з `>=1.0`, `>=1.1`, `>=1.1rc1`, `--prerelease allow`.
- Workspace: `uv init --package --lib plugins/fb-markdown`, `uv add --package fb-markdown formbuilder`, entry point
  плагіна, `uv sync` проти `uv sync --all-packages`, `uv build --package`. `uv add --editable ../fb-shared`,
  METADATA без шляху, установка wheel у чисте venv з `--no-index` падає; `uv build --no-sources` цього не ловить.
- `uv tool install ruff==0.17.1` з `UV_TOOL_DIR`/`UV_TOOL_BIN_DIR`, перенаправленими в scratch (глобально нічого
  не ставилось); `uv tool dir` без змінних для стандартних шляхів.
- `uv publish --dry-run` (без `dist/` -> `No files found to publish`; з `--publish-url` і з іменованим індексом
  `testpypi`): лише перевірка файлів, без облікових даних і без завантаження. Нічого не публікувалось.
- `ruff check`, `ruff format --check`, `mypy src` (strict), `pytest -q` на фінальному стані копії капстоуну.
- Скрипт звірки: усі `python`/`python live` блоки з `lesson.md`, за якими йде `text`, виконано й звірено з
  виводом (5 блоків, усі збіглися). `tasks.yaml` розпарсено, кожне `solution + harness` звірено з `expected`
  після нормалізації (t1–t5 OK), кожен `starter + harness` без синтаксичних помилок, кожен `<!-- task -->`
  вставлено рівно один раз. t2 і t3 додатково звірено з `packaging.requirements.Requirement` і `packaging.version.Version`.
- `verify` з p1 виконано дослівно: на завершеній копії `wheel ok 0.2.0`, exit 0; на незміненій копії капстоуну
  `AssertionError: no [web] extra in METADATA`, exit 1.

Абсолютні шляхи у виводі скорочено до `…/` (у реальному запуску це scratch-папка). Мілісекунди в `uv` залежать від
запуску; жоден такий вивід не є `expected` завдання.

## Рішення

- m0-l02 уже розібрав `~=`, `==2.1.*`, `0.x`, `--locked`/`--frozen`, `uvx`, extras на рівні синтаксису; m0-l06 розібрав
  editable, `.pth`, `dist-info`, console scripts і `__version__`. Тут лише посилання на них, а глибина пішла в
  збирання, вміст wheel, теги, PEP 508-маркери, PEP 440 проти semver, внутрішності lock, entry points як плагіни,
  workspace і публікацію.
- Python-приклади з `packaging` позначені як звичайні `python`, не `live`: у браузері доступні лише stdlib і pydantic.
  Live-блоки (модель `Requires-Dist` з `tomllib`, модель entry points з тимчасовими `dist-info`) лише на stdlib.
- Капстоун у scratch доведено до 0.2.0: метадані PyPI, `LICENSE`, extra `web` (fastapi, uvicorn[standard]),
  `templates/page.html.j2` + `templating.py`, `renderers/html.py`, `plugins.py`, entry point `formbuilder.renderers`.
  У справжній `capstone/` це не перенесено: це зміст проєктного завдання p1. `pydantic` у scratch додано як стан після m2-l09.
- `authors = [{ name = "Your Name" }]` замість реального імені: учень підставляє своє.
- Класифікатор `Typing :: Typed` прибрано, бо `py.typed` у капстоуні немає (рішення m0-l06).
- `verify` ставить перевірочне venv у `dist/venv`: `uv build --clear` щоразу прибирає його разом зі старими wheel,
  нічого не лишається в `/tmp`, а `dist/` уже в `.gitignore`. Перевіряється наявність шаблону у wheel і extra `web`
  у METADATA; entry point лишився в checklist, бо залежить від того, як учень розклав `renderers/` у m3-l01.
- Вимога спеки "verify починається з `cd capstone && uv run ...`" тут свідомо порушена: перевіряється wheel, а не
  оточення проєкту, тому команда починається з `cd capstone && uv build`, як і просив замовник уроку.
- Обсяг: 37 абзаців теорії, 12 callout-блоків, 8 теоретичних розділів + "Для капстоуну" + три обов'язкові. Ділити
  не пропоную, хоча урок довгий (90 хвилин): майже кожне з 12 питань вимагає реального виводу команд.

## Незакриті питання

Немає, усі 12 позначено `[x]`.

## Залежності від сусідніх уроків

- Спирається на m0-l02 (uv, специфікатори, lock, `uvx`, PEP 668), m0-l06 (src layout, editable, `dist-info`,
  console scripts, `__version__`), m3-l01 (`renderers/`, динамічний імпорт, на який спирається `ep.load()`).
- Готує: m3-l03 (pytest-плагіни через групу `pytest11`, тести імпортують встановлений пакет), m3-l06 (`uv lock --check`
  як pre-commit хук), m7-l06 (шаблони Jinja2 з пакета через `PackageLoader`), m7-l07 (Dockerfile: `uv sync --locked
  --no-dev --extra web`, wheel-тег і musl).

## Інцидент під час роботи

Одна команда в scratch випадково скопіювала `pyproject.toml` у чужу порожню директорію `/tmp/x` (її створив інший
процес о 14:15). Файл ідентифікований як мій (`cmp` з копією) і видалений; сама директорія `/tmp/x` залишена як була.
Перевірочний прогін `verify` з `mktemp -d` створив venv у системному `$TMPDIR`; його знайдено за вмістом і видалено,
після чого `verify` переписано на `dist/venv`.

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- FastAPI і uvicorn у капстоуні тепер основні `dependencies`, а не extra `web`: p1 (крок 2, чекліст, `verify` перевіряє `Requires-Dist: fastapi` без маркера `extra`), розділ капстоуну, команда `uv add "uvicorn[standard]..."`. Теорія extras лишилась на навчальному варіанті з extra `web` і явно так підписана; новий callout пояснює, чому капстоуну extra не потрібен.
- Питання з `questions.md` про `[web]` закрите теорією extras; для самого капстоуну свідомо обрано основні залежності (рішення редакції).
- `verify` починається з `cd capstone && uv run pytest -q`, далі збірка wheel.
