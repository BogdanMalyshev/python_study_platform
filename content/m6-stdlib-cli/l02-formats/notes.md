# Нотатки до m6-l02

## Що запускалось

Усе через `.venv/bin/python` (Python 3.12.12, pydantic 2.14.1, pyyaml 6.0.3) з кореня проєкту. Тимчасові скрипти
лежали в `<scratchpad>/m6-l02/` і видалені після перевірки.

- Експерименти до написання: поведінка `json` (NaN/Infinity, `allow_nan`, великі `int`, `parse_float=Decimal`,
  дубльовані ключі, `separators`, тексти `JSONDecodeError`, `json.load` = `loads(fp.read())` за `inspect.getsource`),
  таблиця типів і `TypeError`, `default=` з рекурсивним викликом, `default=str`, `object_hook` (порядок знизу вгору),
  `object_pairs_hook`; `csv` (`writer`/`reader`, `DictReader` з `restval`/`restkey`, `DictWriter` і `extrasaction`,
  `newline=""` на читанні й на записі з емуляцією Windows через `newline="\r\n"`, діалекти, `quoting`, `;`, `Sniffer`,
  BOM і `utf-8-sig`); `tomllib` (типи, дати, масиви таблиць, `TypeError` у текстовому режимі, тексти
  `TOMLDecodeError`); pyyaml (`load` без `Loader`, `unsafe_load` з `!!python/object/apply`, неявні типи, `dump`
  проти `safe_dump`); `pickle` з `__reduce__`; Pydantic `model_dump_json`/`model_validate_json`/`model_json_schema`.
- Після запису: скрипт витягав кожен ```` ```python ```` / ```` ```python live ```` блок `lesson.md`, за яким іде
  ```` ```text ````, запускав окремо (cwd корінь курсу) і порівнював вивід після нормалізації: 31 блок збігся,
  3 ілюстративні блоки без виводу пропущені (пари з TS і фрагмент з `json.dump` у файл `form.json`).
- `tasks.yaml`: `yaml.safe_load`, кожне `solution + harness` порівняно з `expected` (6/6), кожен `starter + harness`
  не проходить (6/6), кожен id вставлений у `lesson.md` рівно один раз. Додатково перевірено, що типові наївні
  рішення падають: t5 з неглибокою копією `DEFAULTS` (змінює дефолти), t6 з `list(lines)` (`streaming: False`),
  t4 з `utf-8` замість `utf-8-sig` (`KeyError: 'email'`).
- Квізи q1–q4 запущені, правильні відповіді збігаються з реальним виводом.
- `platform/build.py`: `load_lesson` для цього уроку без помилок (запуск без запису `dist/`). Повний `build()` зараз
  падає через чужі уроки (m3-l05 без вставленого q2, m6-l06 без `tasks.yaml`), не через цей.

## Рішення

- Повтору з m2-l01 немає: базова таблиця "JSON → Python", `ensure_ascii`, `indent`, `sort_keys`, множина і рядкові ключі
  згадані одним абзацом із посиланням. Тут таблиця в обидва боки з тим, чого там не було (`StrEnum`, ключі
  `None`/`float`, `Decimal`, `datetime`, dataclass).
- YAML-приклади не `live` (pyyaml немає в Pyodide), у розділі це сказано; жодне браузерне завдання yaml не потребує.
  q4 про YAML це quiz, він не виконується.
- `questions.md` каже "`08` → помилка". Насправді pyyaml 6.0.3 не кидає помилку: `08` стає рядком `'08'`
  (не валідне вісімкове), а `010` → `8`, `01001` → `513`. В уроці показано реальну поведінку і підкреслено, що це
  гірше за помилку (різні типи в одному полі); помилку `port = 08` дає TOML, це показано в розділі про `tomllib`.
- Pydantic-приклади з `datetime` друкують `isoformat()`, а не `repr`, бо repr tzinfo у pydantic різниться між
  версіями (локально 2.14, у Pyodide 2.12.5). Тексти `TOMLDecodeError` у браузерних завданнях не друкуються
  (t5 кидає власний `ValueError("invalid TOML")`), бо платформа на Python 3.13.
- Приклад з читанням `capstone/pyproject.toml` не `live`: він читає реальний файл з кореня курсу.
- `pickle` показано живим прикладом з `__reduce__`, що викликає `print`; `shelve` і `jsonschema`, `tomli-w`,
  `tomlkit`, `ruamel.yaml`, `ijson` одним реченням.
- Підрозділи `###` у розділі про csv (`newline`, діалекти, BOM, типізація): розділ найбільший, і без них права
  колонка мала б лише один пункт на чверть уроку. Платформа будує сайдбар з `##`, тож `###` на неї не впливають.
- Обсяг: 50 абзаців теорії (рахунок скриптом, без callout-ів, таблиць і закривальних розділів), на верхній межі
  орієнтира; найдовший відрізок без коду 2 абзаци. `questions.md` має 11 широких пунктів, урок зданий цілим.
  Якщо ділити, природна межа: "json глибше + JSON Lines + валідація + pickle" і "csv, tomllib, yaml".
- 7 теоретичних розділів, `## Для капстоуну` і три обов'язкові. 6 завдань з кодом (усі `browser`, stdlib), 4 quiz,
  1 project для капстоуну (`formats.py`, verify через `cd capstone && uv run pytest tests/test_formats.py -q`).

## Незакриті питання

Немає. Усі 11 пунктів `questions.md` закриті кодом і виводом; уточнення про `08` вище.

## Залежності

- Спирається на m2-l01 (база `json`), m6-l01 (файли, `encoding`, `tempfile`), m5-l02 (генератори для JSONL),
  m2-l09 (Pydantic, `model_json_schema`), m4-l06 (Enum/StrEnum), m2-l05 (dataclass, `asdict`).
- Готує m6-l03 (ISO-рядки, aware/naive дати з `tomllib` і хуків, формат дати в CSV-експорті), m6-l06
  (`formbuilder.toml` і модель налаштувань, яку замінить pydantic-settings), m6-l08 (SQLite замість `shelve`),
  капстоун (`load_form_config`, `load_settings`, `export_leads_csv`).
