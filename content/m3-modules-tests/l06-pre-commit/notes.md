# Нотатки до m3-l06 "pre-commit з ruff і mypy"

## Що запускалось

Середовище: macOS, git 2.50.1, uv 0.9.28, Python 3.12.12. Проєктний `.venv` курсу не змінювався:
ruff 0.17.1, mypy 2.4.0, pyyaml з нього використано лише для прикладів і перевірки `tasks.yaml`.

- pre-commit 4.7.0 у scratch-venv (`uv venv` + `uv pip install pre-commit`) і, для прогонів з капстоуна, як
  dev-залежність у **копії** капстоуна в scratch. Справжній `capstone/` не чіпався, `.git` у курсі не створювався.
- Тимчасовий git-репозиторій `<scratchpad>/m3-l06/course/` повторює розкладку курсу: `capstone/` (копія без
  `.venv` і кешів) плюс `content/notes.md` з пробілами в кінці рядка, щоб показати потребу у `files: ^capstone/`.
  Копію капстоуна доведено до стану модуля 3: блок `[tool.mypy]` з m2-l08 (strict, `files = ["src", "tests"]`),
  `py.typed`, мінімальний `models.py` на pydantic 2.14.1 і `tests/test_models.py`, `uv add --dev pre-commit`.
- Мережа використовувалась один раз для клонування хуків (`pre-commit-hooks` v6.0.0, `ruff-pre-commit` v0.17.1,
  `mirrors-mypy` v2.4.0), для `pre-commit autoupdate` і `git ls-remote --tags` (останні теги хуків і actions),
  а також щоб звірити CHANGELOG pre-commit щодо `language: unsupported` (з'явився в 4.4.0 як псевдонім `system`).
- Кеш хуків перенаправлено змінною `PRE_COMMIT_HOME` у scratch. Один контрольний прогін поза git (перевірка тексту помилки) пішов без цієї змінної й створив `~/.cache/pre-commit/` з порожньою `db.db` і `pre-commit.log`; видалити його не вдалося (дію заблоковано), його можна прибрати вручну. В уроці
  команди й шляхи показані з типовим `~/.cache/pre-commit` (листинг кешу, рядки про stash unstaged-змін);
  інших замін у виводі немає. Bare-репозиторій для `git push` підключено як `../remote.git`, тому в виводі
  push відносний шлях.
- Усе в уроці отримано реальними командами: `pre-commit install` (з одним і двома типами хуків), перший і
  повторний `run --all-files` з `time`, коміт файлу, який виправляють fixer-и, повторний коміт, stash
  unstaged-змін, незвиправна N802, `SKIP=ruff-check git commit`, `git commit --no-verify`, `autoupdate` з
  відкоченими тегами, `gc`, `mirrors-mypy` у трьох варіантах (як є, з `--config-file`, з
  `additional_dependencies`), локальний хук з `language: system`, неправильний і правильний порядок ruff-хуків
  (`-c .wrong-order.yaml` / `.right-order.yaml`), `--hook-stage pre-push`, справжній `git push` (заблокований
  mypy, потім успішний), `SKIP=mypy git push`, `check-added-large-files` на файлі 684 КБ, `validate-config`,
  `uv sync --locked` на застарілому lockfile, `uv tree --only-dev --depth 1`.
- Підсумковий конфіг з розділу "Для капстоуну" побайтно порівняно з файлом у копії (`diff`), на ньому виконано
  команду `verify` з p1: обидві стадії зелені.
- Workflow GitHub Actions **не запускався** (у курсі немає CI, урок це прямо каже). Перевірено лише, що YAML
  парситься, і кожна його команда (`uv sync --locked`, `ruff check --output-format github .`,
  `ruff format --check .`, `mypy`, `pytest -q`) проходить локально в копії капстоуна.
- Додатково перевірено: mypy 2.4 шукає конфіг у поточній директорії й вище (з `capstone/src` знаходить
  `capstone/pyproject.toml`, з кореня курсу ні); `__init__` з анотованими параметрами під `--strict` не вимагає
  `-> None`, без параметрів вимагає; N801 на класі `field_c`.
- `tasks.yaml`: кожне `solution` + `harness` прогнано через `.venv/bin/python`, stdout збігається з `expected`;
  starter + harness не збігається (як і має бути). `answer` у квізах у межах `options`.
- Живий приклад з `re.search` прогнано через `.venv/bin/python`.

## Рішення

- **Капстоун усередині репозиторію курсу.** m0-l06 фіксує, що `capstone/` не має власного git. Тому конфіг
  лежить у `capstone/`, але git-корінь вище: звідси `files: ^capstone/` і `uv run --directory capstone` у
  локальних хуках, а workflow лежить у корені курсу з `working-directory: capstone`. Якщо автор курсу колись
  винесе капстоун в окремий репозиторій, `files:` треба прибрати (інакше всі хуки `Skipped`), а `--directory
  capstone` замінити на запуск з кореня.
- **`verify` проєктного завдання.** Через те що mypy і pytest на стадії `pre-push`, `uv run pre-commit run
  --all-files` їх не запускає. `verify` тому складений з двох команд:
  `cd capstone && uv run pre-commit run --all-files && uv run pre-commit run --all-files --hook-stage pre-push`.
  Обидві потребують git-репозиторію: на машині, де корінь курсу не під git, pre-commit падає з
  `git failed. Is it installed, and are you in a Git repository directory?` ще до хуків.
- **Порядок "форматер перед лінтером" у questions.md.** Для ruff офіційна документація `ruff-pre-commit` і
  m0-l04 кажуть навпаки: `ruff-check --fix` перед `ruff-format`, бо фікси лінтера псують розкладку. Урок
  відповідає на питання як на загальне правило "fixer-и перед перевірками, форматер останнім серед fixer-ів" і
  показує реальним прогоном, що зворотний порядок коштує зайвої спроби. Питання позначене закритим саме в
  такому прочитанні.
- **`language: system` проти `unsupported`.** Урок показує `system` (як у питанні й у більшості статей) і
  пояснює, що з pre-commit 4.4 це псевдонім `unsupported`; підсумковий конфіг капстоуна пише `unsupported`.
- **mypy у капстоуні:** локальний хук через `uv run`, `pass_filenames: false`, стадія `pre-push`; `mirrors-mypy`
  показано і відкинуто з реальним виводом (без конфігу проєкту зелений на strict-помилках, без pydantic падає,
  з `additional_dependencies` працює ціною дублювання версій з `uv.lock`).
- **CI:** обрано явні кроки `uv run ...`, альтернатива `pre-commit run --all-files --hook-stage pre-push
  --show-diff-on-failure` описана абзацом. `actions/checkout@v7`; `astral-sh/setup-uv@v10.3.0` повною версією,
  бо з v8 плаваючих мажорних тегів немає (за `git ls-remote`).
- **Кількість завдань з кодом: 2 замість 3–6.** Тема інструментальна; за домовленістю з автором основне
  навантаження на квізи (4) і проєкт (1). Два браузерні завдання моделюють логіку вибору хуків (`stages`,
  `default_stages`, `SKIP`) і файлів (`files`/`exclude` через `re.search`, `types`/`types_or`), тобто механізм,
  а не рецепт. PyYAML у браузері немає, тож конфіг дається словником, як після `yaml.safe_load`.
- **Обсяг:** 28 абзаців прози плюс 5 callout-ів, 8 розділів теорії плюс "Для капстоуну". Короткий урок у межах
  орієнтира 20–30 з questions.md, якщо не рахувати callout-и.
- **Без пари `ts`/`python`:** зіставлення з husky/lint-staged подано callout-ом `JS-аналог` і пунктами типових
  помилок, бо порівнюються конфіги й поведінка інструментів, а не код.

## Незакриті питання

Немає. Усі 8 пунктів questions.md позначені `[x]`; застереження щодо порядку хуків описане вище.

## Залежності

- Спирається на: m0-l04 (конфіг і порядок ruff, `--output-format github`), m0-l06 (капстоун у репозиторії
  курсу, src-layout, `uv`), m2-l08 (strict-конфіг mypy з `files = ["src", "tests"]`, обіцянка "`uv run mypy` у
  pre-commit"), m2-l09 (pydantic-моделі в капстоуні, через них ламається `mirrors-mypy`), m3-l02 (dev-група,
  `uv.lock`, `uv sync --locked`), m3-l03 (pytest у капстоуні).
- Готує: модулі 4–7 пишуть код капстоуна вже під воротами pre-commit/pre-push; "Що далі" веде в m4-l01 (N801 і
  `-> None` для `__init__`). m7 (Dockerfile, пакування) може посилатися на workflow звідси.

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- Капстоун стає окремим git-репозиторієм (`git init` у `capstone/`, крок 1 p1). Підсумковий конфіг без `files: ^capstone/` і без `--directory capstone`, workflow у `capstone/.github/workflows/ci.yml`. Теорія лишилась на монорепо-розкладці й так підписана; вивід хуків не залежить від розкладки, шлях у прикладі `check-added-large-files` став відносним до кореня капстоуну.
