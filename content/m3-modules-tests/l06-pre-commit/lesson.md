---
id: m3-l06
module: m3-modules-tests
title: "pre-commit з ruff і mypy"
summary: "Учень ставить pre-commit у капстоун: ruff і базові перевірки на коміт, mypy і pytest через uv run на push, розуміє ізольовані оточення хуків, поведінку хука, що змінив файли, аварійні виходи й той самий набір перевірок у CI."
duration_min: 40
prerequisites: [m3-l05]
---

## pre-commit це менеджер хуків, а не сам хук

Git-хук (hook, офіційний термін git, `man githooks`) це виконуваний файл у `.git/hooks/`, який git запускає у певний момент; ненульовий код виходу з `.git/hooks/pre-commit` скасовує коміт. Проблема у двох місцях: `.git/` не версіонується, тож хук не поділити з командою, а писати shell-скрипт, який знає, які файли в індексі і як запустити на них п'ять інструментів, ніхто не хоче. pre-commit (пишеться так само, як стадія git, і це постійне джерело плутанини) це Python-програма, яка закриває обидві проблеми: список перевірок живе у версіонованому `.pre-commit-config.yaml`, а в `.git/hooks/` кладеться лише тонкий скрипт-диспетчер.

```bash
# у capstone/, після uv add --dev pre-commit
uv run pre-commit --version
uv run pre-commit install
grep -E "^ARGS=|exec " ../.git/hooks/pre-commit
```

```text
pre-commit 4.7.0
pre-commit installed at .git/hooks/pre-commit
ARGS=(hook-impl --config=capstone/.pre-commit-config.yaml --hook-type=pre-commit)
    exec "$INSTALL_PYTHON" -mpre_commit "${ARGS[@]}"
    exec pre-commit "${ARGS[@]}"
```

Приклади теорії зняті в розкладці монорепо: `capstone/` лежить усередині більшого git-репозиторію, тому `.git/` на рівень вище, і скрипт це врахував: шлях до конфігу записаний відносно кореня git, а `INSTALL_PYTHON` вказує на `capstone/.venv/bin/python3`. На такій розкладці видно, що pre-commit завжди працює з кореня git. Ваш капстоун у цьому уроці стає окремим репозиторієм (`git init` у `capstone/`, p1): там `.git/` лежить поруч з `pyproject.toml`, `--config` дорівнює просто `.pre-commit-config.yaml`, і монорепо-налаштування з прикладів нижче зникають (підсумковий конфіг у розділі "Для капстоуну"). Хук викликає pre-commit з того оточення, з якого його встановили; якщо пакет звідти зник, скрипт шукає `pre-commit` у `PATH` і інакше падає з порадою активувати virtualenv.

> **JS-аналог.** Це husky і lint-staged в одному. husky кладе хук, lint-staged вирішує, на яких staged-файлах що запустити. Різниця в тому, що husky v9 ставить хук сам через скрипт `prepare` під час `npm install`, а `uv sync` скриптів встановлення не виконує: `uv run pre-commit install` кожен розробник робить один раз після клонування.

<!-- task: q4 -->

## Конфіг курсу і перший прогін

Конфіг це список репозиторіїв з хуками. `repo` це git-URL, `rev` тег, з якого брати хуки, `hooks` ті з них, що вмикаються, з необов'язковими `args`. Для курсу два зовнішні репозиторії. `pre-commit-hooks` від авторів pre-commit дає дрібні гігієнічні перевірки: зайві пробіли в кінці рядків, кінцевий перенос рядка, синтаксис YAML і TOML, випадково доданий великий файл. `ruff-pre-commit` від Astral дає `ruff-check` і `ruff-format`; id `ruff` у тому ж репозиторії лишився як legacy alias для `ruff-check`.

```yaml
# capstone/.pre-commit-config.yaml, перша версія
files: ^capstone/
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-added-large-files

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.17.1
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format
```

Верхньорівневий `files` потрібен саме у вкладеній розкладці. pre-commit завжди працює з кореня git, і `--all-files` означає всі файли зовнішнього репозиторію. Без фільтра `trailing-whitespace` охоче "виправив" би конспекти в `content/`:

```text
trim trailing whitespace.................................................Failed
- hook id: trailing-whitespace
- exit code: 1
- files were modified by this hook

Fixing content/notes.md
```

Фільтр це регулярний вираз, який застосовується через `re.search` до шляху відносно кореня git, тому якір `^` обов'язковий.

```python live
import re

names = ["capstone/src/formbuilder/cli.py", "content/notes.md", "docs/capstone/plan.md"]
for pattern in ["^capstone/", "capstone/"]:
    print(pattern, [name for name in names if re.search(pattern, name)])
```

```text
^capstone/ ['capstone/src/formbuilder/cli.py']
capstone/ ['capstone/src/formbuilder/cli.py', 'docs/capstone/plan.md']
```

Перший прогін повільний: pre-commit клонує кожен репозиторій хуків і ставить йому оточення. Другий з того самого конфігу займає менше секунди.

```bash
time uv run pre-commit run --all-files
```

```text
[INFO] Initializing environment for https://github.com/pre-commit/pre-commit-hooks.
[INFO] Initializing environment for https://github.com/astral-sh/ruff-pre-commit.
[INFO] Installing environment for https://github.com/pre-commit/pre-commit-hooks.
[INFO] Once installed this environment will be reused.
[INFO] This may take a few minutes...
[INFO] Installing environment for https://github.com/astral-sh/ruff-pre-commit.
[INFO] Once installed this environment will be reused.
[INFO] This may take a few minutes...
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
check yaml...........................................(no files to check)Skipped
check toml...............................................................Passed
check for added large files..............................................Passed
ruff check...............................................................Passed
ruff format..............................................................Passed
uv run pre-commit run --all-files  4.95s user 1.68s system 68% cpu 9.697 total
```

> **Пастка.** `check yaml` пропущено, хоча YAML-файл щойно створено. `--all-files` бере список з `git ls-files`, тобто лише відстежувані файли, а новий конфіг ще не додано в індекс. Після `git add .pre-commit-config.yaml` той самий прогін друкує `check yaml....Passed` за 0.7 секунди.

## Під капотом: ізольоване оточення для кожного хука

Кожен репозиторій хуків містить файл `.pre-commit-hooks.yaml`, у коді pre-commit він зветься manifest. Маніфест описує хук повністю: команду (`entry`), мову, для якої pre-commit має зібрати оточення (`language`), і типи файлів. Ваш конфіг лише вибирає хук і додає `args`.

```yaml
# .pre-commit-hooks.yaml у astral-sh/ruff-pre-commit@v0.17.1, фрагмент
- id: ruff-check
  name: ruff check
  description: "Run 'ruff check' for extremely fast Python linting"
  entry: ruff check --force-exclude
  language: python
  types_or: [python, pyi, jupyter]
  args: []
  require_serial: true
```

Для `language: python` pre-commit створює окремий virtualenv на кожну трійку (репозиторій, `rev`, `additional_dependencies`) і ставить туди пакет хука. Усе це лежить у кеші `~/.cache/pre-commit` і переживає видалення `.venv` проєкту. Ruff у хуку це не ruff з `capstone/.venv`, а окрема копія:

```bash
ls ~/.cache/pre-commit
~/.cache/pre-commit/repordal76lk/py_env-python3.12/bin/ruff --version
```

```text
README
db.db
repopy646cu9
repordal76lk
ruff 0.17.1
```

Наслідок: версій ruff у проєкті дві, `rev` у конфігу і рядок в `uv.lock`, і синхронізуєте їх ви. Розійдуться, і редактор (він бере ruff з `.venv`) та хук почнуть сперечатися про той самий файл. `pre-commit gc` прибирає з кешу оточення, на які не посилається жоден відомий конфіг, а `pre-commit clean` видаляє кеш повністю.

## Хук змінив файли: коміт не відбувся

Чотири хуки з набору це fixer-и (жаргон спільноти: хук, який сам переписує файл): `trailing-whitespace`, `end-of-file-fixer`, `ruff-check --fix`, `ruff-format`. Для pre-commit змінений файл це провал хука, навіть якщо інструмент завершився з кодом `0`, а провал будь-якого хука скасовує коміт. Ось файл, перекладений з JS як було: невідсортовані й зайві імпорти, `Optional`, одинарні лапки, пробіли в кінці рядка, немає кінцевого переносу.

```bash
git add src/formbuilder/labels.py
git commit -m "add labels helper"
```

```text
trim trailing whitespace.................................................Failed
- hook id: trailing-whitespace
- exit code: 1
- files were modified by this hook

Fixing capstone/src/formbuilder/labels.py

fix end of files.........................................................Failed
- hook id: end-of-file-fixer
- exit code: 1
- files were modified by this hook

Fixing capstone/src/formbuilder/labels.py

check yaml...........................................(no files to check)Skipped
check toml...........................................(no files to check)Skipped
check for added large files..............................................Passed
ruff check...............................................................Failed
- hook id: ruff-check
- files were modified by this hook

Found 4 errors (4 fixed, 0 remaining).

ruff format..............................................................Failed
- hook id: ruff-format
- files were modified by this hook

1 file reformatted
```

Виправлення лежать у робочій копії, а в індексі стара версія. Ви дивитесь диф, додаєте й комітите знову, і тепер усе зелене.

```bash
git status --short
git diff
```

```text
AM src/formbuilder/labels.py
diff --git a/capstone/src/formbuilder/labels.py b/capstone/src/formbuilder/labels.py
index bb7743c..a9d11df 100644
--- a/capstone/src/formbuilder/labels.py
+++ b/capstone/src/formbuilder/labels.py
@@ -1,6 +1,2 @@
-import sys
-from typing import Optional
-import json
-
-def label_for(field: dict) -> Optional[str]:   
-    return field.get('label')
\ No newline at end of file
+def label_for(field: dict) -> str | None:
+    return field.get("label")
```

```bash
git add src/formbuilder/labels.py
git commit -m "add labels helper"
```

```text
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
check yaml...........................................(no files to check)Skipped
check toml...........................................(no files to check)Skipped
check for added large files..............................................Passed
ruff check...............................................................Passed
ruff format..............................................................Passed
[main d7077d5] add labels helper
 1 file changed, 2 insertions(+)
 create mode 100644 capstone/src/formbuilder/labels.py
```

> **Пастка.** lint-staged з версії 10 сам додає зміни своїх задач у коміт, і JS-розробник чекає того самого. pre-commit цього свідомо не робить: автоматична правка, яку ніхто не бачив, не має потрапляти в історію. Тому після `Failed` з `files were modified` правильна реакція це `git diff`, `git add -u`, повторний коміт, а не пошук бага в конфігу.

Як і lint-staged, pre-commit перевіряє саме те, що піде в коміт. Якщо у файлі є і staged, і unstaged зміни, незакомічена частина на час прогону ховається в патч і потім повертається.

```text
[WARNING] Unstaged files detected.
[INFO] Stashing unstaged files to ~/.cache/pre-commit/patch1792322352-92596.
trim trailing whitespace.................................................Passed
...
ruff format..............................................................Passed
[INFO] Restored changes from ~/.cache/pre-commit/patch1792322352-92596.
```

<!-- task: q1 -->

## Аварійні виходи й оновлення версій

Не все виправляється автоматично. Ім'я `getLabel` ruff перейменувати не може, тож хук просто падає, нічого не змінивши, і коміт не відбувається.

```text
ruff check...............................................................Failed
- hook id: ruff-check
- exit code: 1

N802 Function name `getLabel` should be lowercase
  --> capstone/src/formbuilder/labels.py:13:5
   |
13 | def getLabel(field: dict[str, str]) -> str:
   |     ^^^^^^^^
14 |     return field["label"]
   |

Found 1 error.

ruff format..............................................................Passed
```

Обходів два, і обидва для аварій, а не для щоденної роботи. `SKIP` зі списком id через кому вимикає конкретні хуки на один запуск, решта працює. `git commit --no-verify` (або `-n`) це прапорець самого git: він не викликає `.git/hooks/pre-commit` взагалі, тож pre-commit нічого не друкує.

```bash
SKIP=ruff-check git commit -m "getLabel"
git commit --no-verify -m "getLabel"
```

```text
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
check yaml...........................................(no files to check)Skipped
check toml...........................................(no files to check)Skipped
check for added large files..............................................Passed
ruff check..............................................................Skipped
ruff format..............................................................Passed
[main ebb053b] getLabel
 1 file changed, 4 insertions(+)
[main d6b6c65] getLabel
 1 file changed, 4 insertions(+)
```

`rev` у конфігу не оновлюється сам, як версія в `package.json` без `^`. `pre-commit autoupdate` питає кожен репозиторій про останній тег і переписує `rev`; `repo: local` не чіпає. Для демонстрації конфіг спершу відкотили на старші теги. Після нього ruff в `uv.lock` підтягується окремо, `uv lock --upgrade-package ruff`, щоб версії знову збіглись.

```bash
uv run pre-commit autoupdate
git diff
```

```text
[https://github.com/pre-commit/pre-commit-hooks] updating v5.0.0 -> v6.0.0
[https://github.com/astral-sh/ruff-pre-commit] updating v0.16.10 -> v0.17.1
diff --git a/capstone/.pre-commit-config.yaml b/capstone/.pre-commit-config.yaml
index bc27512..312622c 100644
--- a/capstone/.pre-commit-config.yaml
+++ b/capstone/.pre-commit-config.yaml
@@ -5,7 +5,7 @@ files: ^capstone/
 
 repos:
   - repo: https://github.com/pre-commit/pre-commit-hooks
-    rev: v5.0.0
+    rev: v6.0.0
     hooks:
       - id: trailing-whitespace
       - id: end-of-file-fixer
@@ -14,7 +14,7 @@ repos:
       - id: check-added-large-files
 
   - repo: https://github.com/astral-sh/ruff-pre-commit
-    rev: v0.16.10
+    rev: v0.17.1
     hooks:
       - id: ruff-check
         args: [--fix]
```

## mypy: чому готовий хук тут не підходить

Для mypy є готовий хук `pre-commit/mirrors-mypy`, і він працює рівно так, як описано вище: mypy в ізольованому оточенні, запуск з кореня git, змінені файли аргументами, плюс аргументи з маніфесту `--ignore-missing-imports --scripts-are-modules`. Для ruff це нормально, бо ruff дивиться лише на текст файлу. mypy потребує двох речей, яких в ізольованому оточенні немає: встановлених залежностей проєкту (без pydantic `BaseModel` для нього `Any`) і конфігу `[tool.mypy]` із `capstone/pyproject.toml`. У файл `labels.py` додано функцію без анотацій.

```yaml
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v2.4.0
    hooks:
      - id: mypy
```

```bash
uv run mypy
uv run pre-commit run mypy --all-files
```

```text
src/formbuilder/labels.py:1: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/labels.py:5: error: Function is missing a type annotation  [no-untyped-def]
Found 2 errors in 1 file (checked 7 source files)
mypy.....................................................................Passed
```

Хук зелений, бо з кореня зовнішнього репозиторію mypy конфіг капстоуну не знаходить (він шукає в поточній директорії й вище, а `capstone/` нижче) і працює без `strict`. Явний `args: [--config-file=capstone/pyproject.toml]` вмикає strict, але одразу ламається на залежностях:

```text
mypy.....................................................................Failed
- hook id: mypy
- exit code: 1

capstone/src/formbuilder/models.py:5: error: Cannot find implementation or library stub for module named "pydantic"  [import-not-found]
capstone/src/formbuilder/models.py:6: error: Cannot find implementation or library stub for module named "pydantic.alias_generators"  [import-not-found]
capstone/src/formbuilder/models.py:6: note: See https://mypy.readthedocs.io/en/stable/running_mypy.html#missing-imports
capstone/src/formbuilder/models.py:9: error: Class cannot subclass "BaseModel" (has type "Any")  [misc]
capstone/src/formbuilder/models.py:19: error: Class cannot subclass "BaseModel" (has type "Any")  [misc]
capstone/src/formbuilder/labels.py:1: error: Missing type arguments for generic type "dict"  [type-arg]
capstone/src/formbuilder/labels.py:5: error: Function is missing a type annotation  [no-untyped-def]
Found 6 errors in 2 files (checked 7 source files)
```

Офіційні ліки це `additional_dependencies: [pydantic==2.14.1]`: pre-commit доставляє пакети в оточення хука, і після цього лишаються дві справжні помилки. Але ціна висока. Кожна залежність, яку бачить mypy (pydantic, pytest для тестів, stubs), дублюється з `uv.lock` руками, з версією, яку ніхто не оновить автоматично, а кожна зміна списку створює в кеші нове оточення. Плюс хук отримує лише змінені файли, а помилка типу часто виникає у файлі, який імпортує змінений.

Тому в капстоуні mypy це локальний хук. `repo: local` означає, що хук описаний прямо в конфігу, без маніфесту. `language: system` (з pre-commit 4.4 той самий режим називається `unsupported`, старе ім'я лишилось псевдонімом) каже pre-commit не будувати оточення, а просто виконати `entry`. `uv run` бере mypy і pydantic з `capstone/.venv`, тобто з `uv.lock`; `--directory capstone` переносить запуск туди, де лежить `pyproject.toml` (в окремому репозиторії капстоуну корінь git і є цією директорією, тож `--directory` не потрібен, а проблема залежностей в ізольованому оточенні лишається тією самою); `pass_filenames: false` прибирає аргументи, і mypy перевіряє `files = ["src", "tests"]` з конфігу.

```yaml
  - repo: local
    hooks:
      - id: mypy
        name: mypy (uv run)
        entry: uv run --directory capstone mypy
        language: system
        types: [python]
        pass_filenames: false
```

```text
mypy (uv run)............................................................Failed
- hook id: mypy
- exit code: 1

src/formbuilder/labels.py:1: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/labels.py:5: error: Function is missing a type annotation  [no-untyped-def]
Found 2 errors in 1 file (checked 7 source files)
```

> **Під капотом.** Ціна локального хука в тому, що він працює лише там, де вже є `capstone/.venv`, тобто після `uv sync`. Для розробника це так завжди, а для сервісів на кшталт pre-commit.ci, які проганяють конфіг у чистому контейнері, ні. Капстоун перевіряється в GitHub Actions, де `uv sync` іде першим кроком, тому вибір на користь `uv run` безкоштовний.

<!-- task: q2 -->

## Порядок хуків і що куди: коміт, push, CI

Хуки виконуються по черзі, у порядку конфігу, і кожен бачить результат попереднього. Звідси правило: спершу fixer-и, потім перевірки, які лише читають. Серед fixer-ів документація ruff вимагає ставити `ruff-check --fix` перед `ruff-format`, з тієї самої причини, що в m0-l04: фікс лінтера, наприклад видалений імпорт, лишає порожні рядки, а прибирає їх лише форматер. У зворотному порядку файл з двома зайвими імпортами проходить лише з третьої спроби, у правильному з другої.

```bash
# .wrong-order.yaml: той самий ruff-pre-commit, але ruff-format стоїть першим
for i in 1 2 3; do
  echo "== run $i"
  uv run pre-commit run -c .wrong-order.yaml --files src/formbuilder/order_demo.py
done
```

```text
== run 1
ruff format..............................................................Failed
- hook id: ruff-format
- files were modified by this hook

1 file reformatted

ruff check...............................................................Failed
- hook id: ruff-check
- files were modified by this hook

Found 2 errors (2 fixed, 0 remaining).

== run 2
ruff format..............................................................Failed
- hook id: ruff-format
- files were modified by this hook

1 file reformatted

ruff check...............................................................Passed
== run 3
ruff format..............................................................Passed
ruff check...............................................................Passed
```

```bash
# .right-order.yaml: ruff-check --fix, потім ruff-format, той самий вихідний файл
for i in 1 2; do
  echo "== run $i"
  uv run pre-commit run -c .right-order.yaml --files src/formbuilder/order_demo.py
done
```

```text
== run 1
ruff check...............................................................Failed
- hook id: ruff-check
- files were modified by this hook

Found 2 errors (2 fixed, 0 remaining).

ruff format..............................................................Failed
- hook id: ruff-format
- files were modified by this hook

1 file reformatted

== run 2
ruff check...............................................................Passed
ruff format..............................................................Passed
```

Другий критерій швидкість. Хук на коміт має вкладатися в секунду, інакше його обходять через `-n`. ruff на всьому капстоуні працює 0.06 с, а на коміті отримує лише змінені файли. mypy і pytest завжди проходять увесь проєкт: зараз це 0.7 с mypy з холодним кешем і 0.4 с тестів, але обидва числа ростуть з кожним модулем, а ruff лишається миттєвим. Їм місце на стадії pre-push або в CI. Стадія (stage, офіційний термін pre-commit) задається ключем `stages` у хука, а `default_install_hook_types` каже `pre-commit install` ставити одразу два git-хуки.

```yaml
default_install_hook_types: [pre-commit, pre-push]
# ...
      - id: mypy
        # ...
        stages: [pre-push]
```

```bash
uv run pre-commit install
uv run pre-commit run --all-files --hook-stage pre-push
```

```text
pre-commit installed at .git/hooks/pre-commit
pre-commit installed at .git/hooks/pre-push
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
check yaml...............................................................Passed
check toml...............................................................Passed
check for added large files..............................................Passed
ruff check...............................................................Passed
ruff format..............................................................Passed
mypy (uv run)............................................................Failed
- hook id: mypy
- exit code: 1

src/formbuilder/labels.py:1: error: Missing type arguments for generic type "dict"  [type-arg]
src/formbuilder/labels.py:5: error: Function is missing a type annotation  [no-untyped-def]
Found 2 errors in 1 file (checked 7 source files)

pytest (uv run)..........................................................Passed
```

Той самий вивід дає справжній `git push`, і він закінчується рядком `error: failed to push some refs to '../remote.git'`: коміт є локально, але на сервер не пішов. Хук без `stages` працює на будь-якій стадії, тому ruff перевіряється і тут; на стадії `pre-commit` mypy і pytest не існують.

<!-- task: q3 -->

Конфіг після `yaml.safe_load` це звичайний словник зі списками, і логіку вибору хуків легко відтворити, щоб перевірити, що ви її розумієте.

```python
import yaml

with open(".pre-commit-config.yaml") as f:
    config = yaml.safe_load(f)

print(config["files"], config["default_install_hook_types"])
for repo in config["repos"]:
    for hook in repo["hooks"]:
        print(repo["repo"].rsplit("/", 1)[-1], hook["id"], hook.get("stages", "-"))
```

```text
^capstone/ ['pre-commit', 'pre-push']
pre-commit-hooks trailing-whitespace -
pre-commit-hooks end-of-file-fixer -
pre-commit-hooks check-yaml -
pre-commit-hooks check-toml -
pre-commit-hooks check-added-large-files -
ruff-pre-commit ruff-check -
ruff-pre-commit ruff-format -
local mypy ['pre-push']
local pytest ['pre-push']
```

<!-- task: t1 -->

<!-- task: t2 -->

## Ті самі перевірки в CI

Локальні хуки можна обійти, не встановити (свіжий клон) або встановити зі старим конфігом. `SKIP` працює і для push, і так на сервер потрапляє функція без анотацій:

```bash
SKIP=mypy git push
```

```text
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
check yaml...........................................(no files to check)Skipped
check toml...........................................(no files to check)Skipped
check for added large files..............................................Passed
ruff check...............................................................Passed
ruff format..............................................................Passed
mypy (uv run)...........................................................Skipped
pytest (uv run)..........................................................Passed
To ../remote.git
   02055e1..983a981  main -> main
```

Тому справжні ворота це CI, а pre-commit лише ловить помилки раніше й дешевше. У CI ті самі команди запускаються явно через `uv run`, з версіями з `uv.lock`. Workflow нижче показаний, але в межах курсу не запускався: CI тут немає. Окремо локально прогнано кожну його команду в капстоуні.

```yaml
# .github/workflows/capstone.yml у корені репозиторію курсу
name: capstone

on:
  push:
    branches: [main]
    paths: ["capstone/**"]
  pull_request:
    paths: ["capstone/**"]

jobs:
  checks:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: capstone
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10.3.0
      - run: uv sync --locked
      - run: uv run ruff check --output-format github .
      - run: uv run ruff format --check .
      - run: uv run mypy
      - run: uv run pytest -q
```

`working-directory` і `paths` це той самий монорепо-нюанс, що `files: ^capstone/` у pre-commit; в окремому репозиторії капстоуну обидва рядки зникають, а workflow лежить у `capstone/.github/workflows/ci.yml`. `uv sync --locked` це `npm ci`: ставить рівно `uv.lock` і падає, якщо lockfile не відповідає `pyproject.toml`, замість тихо його оновити. `--output-format github` перетворює діагностики ruff на анотації в рядках PR (m0-l04). Кожна перевірка окремим кроком, щоб у UI одразу було видно, що саме впало. setup-uv з версії 8 не публікує плаваючих тегів на кшталт `@v10`, тому версія повна.

```bash
uv sync --locked   # після ручного додавання httpx у [project] dependencies
```

```text
Resolved 34 packages in 178ms
The lockfile at `uv.lock` needs to be updated, but `--locked` was provided. To update the lockfile, run `uv lock`.
```

Альтернатива це один крок `uv run pre-commit run --all-files --hook-stage pre-push --show-diff-on-failure`: один список перевірок на всі місця, і в CI неможливо забути хук, який є локально. Ціна в тому, що CI щоразу будує оточення хуків (потрібен кеш `~/.cache/pre-commit` за хешем конфігу), а ruff береться з `rev`, а не з `uv.lock`. Для капстоуну обрано явні кроки.

## Для капстоуну

Підсумковий конфіг. Капстоун тепер окремий git-репозиторій (`git init` у `capstone/`), тож конфіг лежить у його корені поруч з `pyproject.toml`, ставить хуки на коміт і на push, а mypy з pytest бере з `.venv` проєкту. Порівняно з прикладами уроку зникли два монорепо-налаштування: `files: ^capstone/` і `--directory capstone`.

```yaml
# capstone/.pre-commit-config.yaml: корінь git це capstone/
default_install_hook_types: [pre-commit, pre-push]

repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-added-large-files

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.17.1
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format

  - repo: local
    hooks:
      - id: mypy
        name: mypy (uv run)
        entry: uv run mypy
        language: unsupported
        types: [python]
        pass_filenames: false
        stages: [pre-push]
      - id: pytest
        name: pytest (uv run)
        entry: uv run pytest -q
        language: unsupported
        types: [python]
        pass_filenames: false
        stages: [pre-push]
```

```bash
uv run pre-commit validate-config .pre-commit-config.yaml
uv run pre-commit run --all-files --hook-stage pre-push
```

```text
trim trailing whitespace.................................................Passed
fix end of files.........................................................Passed
check yaml...............................................................Passed
check toml...............................................................Passed
check for added large files..............................................Passed
ruff check...............................................................Passed
ruff format..............................................................Passed
mypy (uv run)............................................................Passed
pytest (uv run)..........................................................Passed
```

> **Для капстоуну.** `check-added-large-files` з порогом 500 КБ за замовчуванням знадобиться раніше, ніж здається: фікстури реальних конфігів FormBuilder і згенерована статика з модуля 6 легко його перевищують. Для статики правильна відповідь `.gitignore`, для великої фікстури `args: [--maxkb=1000]` у хука, а не `--no-verify`.

```text
check for added large files..............................................Failed
- hook id: check-added-large-files
- exit code: 1

tests/fixtures/big.json (684 KB) exceeds 500 KB.
```

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Конфіг хуків у `package.json` або `pyproject.toml`.** Звичка з `"lint-staged": {...}` у `package.json`. pre-commit читає лише `.pre-commit-config.yaml`, секції `[tool.pre-commit]` не існує.

   ```yaml
   # capstone/.pre-commit-config.yaml, і більше ніде
   repos: []
   ```

2. **Скрипти в `.husky/` або руками в `.git/hooks/`.** Хук пишуть shell-скриптом, як `.husky/pre-commit` з `npx lint-staged`. У pre-commit скрипт генерує `pre-commit install`, а все, що треба запускати, це запис у конфігу, навіть якщо це довільна команда.

   ```yaml
   - repo: local
     hooks:
       - id: pytest
         name: pytest (uv run)
         entry: uv run pytest -q
         language: unsupported
         pass_filenames: false
   ```

3. **Чекати, що хук візьме лінтер проєкту, як `node_modules/.bin`.** lint-staged запускає ESLint з `node_modules`. `ruff-pre-commit` і `mirrors-mypy` ставлять власні копії в `~/.cache/pre-commit`, і версію задає `rev`, а не `uv.lock`. Правильно: тримати `rev` ruff рівним версії в lockfile, а для mypy брати `uv run`.

   ```bash
   uv tree --only-dev --depth 1 | grep ruff   # └── ruff v0.17.1 (group: dev)
   ```

4. **`npm run lint` як єдина точка входу.** Хочеться один скрипт `lint`, який викликають і хук, і CI. Тут роль цього списку грає конфіг pre-commit, а CI запускає ті самі команди явними кроками; окремий `Makefile` чи скрипт поверх них лише третє місце, яке треба синхронізувати.

   ```bash
   uv run pre-commit run --all-files --hook-stage pre-push   # "lint everything" локально
   ```

5. **Чекати, що виправлення fixer-а потрапить у коміт.** lint-staged додає зміни сам, pre-commit ні: коміт скасовано, правка в робочій копії.

   ```bash
   git diff && git add -u && git commit -m "..."
   ```

6. **mypy і тести на кожен коміт.** Переносять `"*.ts": ["eslint", "tsc --noEmit", "jest --findRelatedTests"]` з lint-staged. На коміт тільки швидке; mypy і pytest на `pre-push` і в CI.

   ```yaml
   stages: [pre-push]
   ```

7. **Забути `pre-commit install` після клонування.** husky ставиться на `npm install` сам, `uv sync` хуків не ставить.

   ```bash
   uv sync && uv run pre-commit install
   ```

## Підсумок

- Git-хук це файл у `.git/hooks/`; pre-commit генерує його і тримає перевірки у версіонованому `.pre-commit-config.yaml`.
- `pre-commit install` виконується один раз на клон; `default_install_hook_types` ставить і `pre-commit`, і `pre-push`.
- Кожен зовнішній хук живе у власному virtualenv у `~/.cache/pre-commit`, версію задає `rev`; проєктний `.venv` хук не бачить.
- Хук, що змінив файл, провалюється; коміт скасовано, правки треба переглянути й додати самому.
- `--all-files` бере лише відстежувані файли; `files` і `exclude` це `re.search` по шляху від кореня git, тому в монорепо `^capstone/` з якорем. Капстоун окремий репозиторій, і фільтр йому не потрібен.
- Порядок: fixer-и перед перевірками, `ruff-check --fix` перед `ruff-format`.
- mypy через `repo: local` і `uv run mypy` з `pass_filenames: false`, а не `mirrors-mypy` з дубльованими `additional_dependencies`.
- mypy і pytest на `stages: [pre-push]`; на коміт лише те, що працює за секунду.
- `SKIP=id git commit` вимикає окремі хуки, `--no-verify` усі; `pre-commit autoupdate` оновлює `rev`, а ruff в `uv.lock` оновлюється окремо.
- Справжні ворота це CI: `uv sync --locked`, ruff check, ruff format --check, mypy, pytest окремими кроками.

## Що далі

Модуль 3 закрито: капстоун має пакет, тести й автоматичні ворота на коміт і push. Наступний урок m4-l01 про класи, `__init__`, `self` і атрибути класу проти атрибутів екземпляра. Кожен клас, який ви там напишете в капстоуні, пройде через ці хуки: ruff перевірить імена класів у `CapWords` (N801), а strict mypy вимагатиме `-> None` в `__init__` без параметрів (якщо параметри анотовані, `None` він виводить сам).
