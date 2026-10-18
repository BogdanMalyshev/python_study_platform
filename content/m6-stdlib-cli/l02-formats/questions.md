# Ключові питання уроку m6-l02 "json, csv, tomllib, yaml"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] `json`: `loads`/`dumps` і `load`/`dump` для файлів, `indent`, `ensure_ascii=False`, `sort_keys`, `default=` для несеріалізованих типів (datetime, Decimal, dataclass через `asdict`), `object_hook` для зворотного перетворення, `JSONDecodeError`. Відмінності від `JSON.parse`: `NaN`/`Infinity` дозволені за замовчуванням, великі int точні, ключі лише рядки.
- [x] JSON і типи: що стає чим (таблиця), tuple → list, set не серіалізується, `int` ключ стає рядком; Pydantic `model_dump_json`/`model_validate_json` як типізована альтернатива (посилання на m2-l09).
- [x] `csv`: `reader`/`writer`, `DictReader`/`DictWriter`, `newline=""` при відкритті (чому), діалекти, роздільник `;`, лапки, кодування і BOM для Excel (`utf-8-sig`). Усе рядки: типізація вручну.
- [x] `tomllib` (3.11+, лише читання): `load` з `open(..., "rb")`, типи TOML (дати, масиви таблиць), чому TOML для конфігів і pyproject; запис через `tomli-w` одним реченням.
- [x] YAML: немає в stdlib, `pyyaml` з `safe_load` (і чому ніколи `load`), пастки YAML (`no` → False, `1.0` → float, `08` → помилка), `ruamel.yaml` для збереження коментарів одним реченням. Де YAML доречний (CI, конфіги з коментарями) і де JSON/TOML.
- [x] Вибір формату для конфігу форми FormBuilder (JSON від фронтенду), для налаштувань застосунку (TOML або env, посилання на m6-l06), для тестових фікстур (YAML або JSON).
- [x] Потокова обробка великих файлів: `csv` по рядках, JSON Lines (`jsonl`) замість одного великого масиву, генератор рядків (посилання на m5-l02).
- [x] Схеми і валідація: JSON Schema з Pydantic (`model_json_schema`), `jsonschema` пакет одним реченням, чому валідація на межі обов'язкова.
- [x] `pickle`: що це, чому не для зовнішніх даних (виконання коду), де доречний (кеш між своїми процесами); `shelve` одним реченням.
- [x] Для капстоуну: завантаження конфігу форми з JSON-файлу через Pydantic, експорт списку лідів або статусів у CSV для маркетингу, читання `formbuilder.toml` з налаштуваннями.
- [x] Які JS-звички тут шкодять: `JSON.stringify(obj, null, 2)` (тут `indent=2`), очікування `undefined`-полів зниклих з виводу (у Python `None` стає `null`), `require("./config.json")`, `csv-parse` з колбеками, YAML як "просто JSON з відступами".
