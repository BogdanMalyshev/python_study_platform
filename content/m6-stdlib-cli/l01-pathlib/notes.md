# Нотатки до m6-l01

## Що запускалось

Усе через `.venv/bin/python` (Python 3.12.12) з кореня проєкту; тимчасові скрипти в `<scratchpad>/m6-l01/`, після
перевірки підпапку видалено.

- Скрипт-раннер витягав з `lesson.md` кожен ```` ```python ```` / ```` ```python live ```` блок, за яким іде ```` ```text ````,
  запускав окремим процесом і порівнював вивід (для винятку: stdout плюс останній рядок stderr) з text-блоком.
  29 блоків з виводом, 0 розбіжностей після фінальних правок.
- Два блоки звірено вручну, бо їм потрібне оточення:
  - `tools/build.py`: створено `project/tools/build.py` і `project/tools/templates/page.html`, запуск
    `cd project && python tools/build.py`.
  - тест `test_publisher.py`: клас `StaticPublisher` з розділу "Для капстоуну" покладено в
    `formbuilder/publisher.py` у scratch, `PYTHONPATH=. python -m pytest tests/test_publisher.py -q` дав
    `6 passed`; той самий модуль пройшов `mypy --strict` і `ruff check`.
- `bash`-блок з `EncodingWarning` запущено як `python -X warn_default_encoding -c '...'`.
- `tasks.yaml`: `yaml.safe_load`, для кожного code-завдання `solution + harness` порівняно з `expected` після
  нормалізації (усі 5 PASS), `starter + harness` перевірено, що НЕ дає `expected` (усі 5 не дають). Коди з трьох
  quiz запущено, вивід збігся з `options[answer]`. Перевірено, що кожен id вставлено в `lesson.md` рівно один раз.
  Остання підказка t4 запускалась як окреме рішення й проходить харнес. Початкова третя підказка t3 з walrus у
  comprehension давала `SyntaxError`, її замінено.

Не відтворювані в браузері або машинозалежні приклади зроблено не-`live`: `__file__` (потрібен скрипт),
zip-пакет з `importlib.resources`, `make_archive`, `PermissionError` через `chmod 0o000`, `gettempdir()` (вивід з
macOS автора, `/var/folders/...`), symlink за межі кореня, права `0o600` у `mkstemp`, pytest-тест. Усі live-блоки
й browser-завдання тримають роботу всередині `TemporaryDirectory()` і друкують лише відносні шляхи та відсортовані
списки. У Pyodide їх не запускав: перевірено лише CPython 3.12 на macOS. Ризикові місця для Pyodide: `os.utime` і
`st_mtime_ns` (t5 і приклад з `copy2`; MEMFS може зберігати час з точністю до мілісекунд, у харнесі лише цілі
секунди, тож порівняння має витримати), текст `strerror` у прикладі з `rmdir`.

## Рішення

- Теоретичних розділів 8, плюс "Для капстоуну" і три обов'язкові: 12 заголовків `##`. Ресурси пакета вкладено в
  розділ про `cwd`/`__file__`, бо питання одне: "відносно чого шукати файл".
- Теорії 37 абзаців без callout-ів (10 штук) і без списку помилок, у межах 20–40. Максимум 3 абзаци поспіль без
  коду. Урок щільний: 11 питань `questions.md`; якщо ділити, природна межа "pathlib + читання/запис + обхід" і
  "shutil + tempfile + атомарний запис + безпека шляхів". Здано цілим.
- `csv`/`newline=""` і `utf-8-sig` для Excel лише згадано з посиланням на m6-l02; `datetime` з `stat` одним рядком
  з посиланням на m6-l03; regex для `form_id` лише згадано (m6-l04), у проєктному завданні `re.fullmatch` без
  пояснення синтаксису.
- `fs.promises`: одне речення в callout "Для капстоуну" і пункт у типових помилках (`asyncio.to_thread`, `aiofiles`).
- Атомарність директорії версії не через rename директорії, а через порядок кроків (assets першими, `index.html`
  атомарно останнім). Rename цілої staging-директорії не розібрано: `os.replace` на непорожню директорію падає, і
  це тягне окрему тему.
- `Path.copy`/`Path.move` з 3.14 згадано одним реченням (у 3.12 `hasattr(Path, "copy")` перевірено як `False`).
  Твердження про PEP 686 (UTF-8 за замовчуванням у 3.15), правило ruff `PLW1514`, поведінку `rename` на Windows і
  `%LOCALAPPDATA%\Temp` взято з документації, запуском не перевірялись (немає Windows і 3.15).
- У m5-l07 вже є `Publisher` (HTTP-вебхук), тому файловий клас тут названо `StaticPublisher`, щоб не конфліктувати;
  у m4-l08 є навчальний `FilePublisher`.
- Завдання: 5 code (усі `runtime: browser`), 3 quiz, 1 project (капстоун). t1 чисті операції над шляхом, t2
  bytes/BOM/CRLF, t3 `rglob` з фільтрами, t4 атомарний запис потоку з прибиранням при винятку, t5 синхронізація
  дерева (усе разом: обхід, `stat`, `copy2`, `mkdir`, `unlink`, сортування).
- m4-l07 існує і використаний: посилання на `with`, `TemporaryDirectory`, `build_workdir`.

## Незакриті питання

Усі 11 питань з `questions.md` закриті кодом і виводом.

## Залежності

- Спирається на m1-l04 (str/bytes), m1-l11 (EAFP, TOCTOU, `BaseException` + `raise`), m1-l10 (comprehension),
  m2-l02 (`dirnames[:] =`, aliasing), m3-l02 (ресурси в wheel), m3-l03 (`tmp_path`, `pytest.raises`,
  `parametrize`), m4-l02 (`__truediv__`), m4-l07 (`with`, `tempfile`), m5-l02 (генератори), m5-l05/m5-l08
  (`to_thread`).
- Готує для m6-l02 (`open`, `newline=""`, `utf-8-sig`), m6-l05 (`tmp_path` для фейкового рендерера)
  m6-l06 (CLI `formbuilder build --out` створює `StaticPublisher`), m7-l03 (воркер викликає
  `publish`), m7-l06 (`PackageLoader` поверх `importlib.resources`).
