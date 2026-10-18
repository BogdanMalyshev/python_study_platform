# Нотатки до m6-l08 "sqlite3 як сховище для капстоуну"

## Що запускалось

Усе через `.venv/bin/python` (CPython 3.12.12, SQLite 3.50.4) з кореня проєкту; тимчасові скрипти в `<scratchpad>/m6-l08/`, видалені після перевірки.

- `lesson.md`: скрипт витягує кожен блок ```` ```python ```` / ```` ```python live ````, за яким іде ```` ```text ````, запускає окремим файлом у тимчасовій директорії й порівнює stdout (плюс останній рядок stderr для блоків, що падають). 27 блоків, усі збігаються. Не запускались як блоки: пари `ts`, сніпети в "Типових помилках" (ілюстрації без виводу).
- Вивід консольних клієнтів (`sqlite3 ... ".tables" ".schema configs"` з системним sqlite3 3.51.0 на macOS і `python -m sqlite3`) отримано реальним запуском на базі `data/formbuilder.db` з тією самою схемою.
- Контрактний тест з розділу "Для капстоуну": у scratch зібрано мініпроєкт (`src/formbuilder/store.py` = код уроку + рішення t6, `tests/fakes.py` з `MemoryJobStore`, `tests/test_store.py` дослівно з уроку), `pytest -q` дав `4 passed in 0.01s`; `mypy --strict` на store, fake і тестах без помилок (mypy, до речі, спіймав fake без `requeue_running`, що підтверджує тезу про Protocol); `ruff check` чистий.
- `tasks.yaml`: кожен `<!-- task: id -->` вставлено рівно один раз; для t1–t6 `solution + harness` збігається з `expected`, `starter + harness` не збігається. Код з q1–q4 запущено, результат відповідає `answer` (q4 з `asyncio.to_thread` дає `ProgrammingError`). `ruff` на рішеннях: лише F401 у t4 (`timedelta`, `timezone` імпортовані в starter/solution, бо їх використовує харнес).
- Окремо перевірені твердження без блоку виводу: `PRAGMA user_version = ?` дає syntax error; `executescript` у `with conn:` при `autocommit=False` відкочується; `sqlite3.threadsafety == 3`; у Pyodide-збірці платформи (`platform/vendor/pyodide/sqlite3-*.whl`) SQLite 3.39.0 (рядок версії з `_sqlite3.so`), тобто `json_extract`, `json_array_length`, `STRICT` і `RETURNING` там є.

## Рішення

- Pyodide платформи це CPython 3.13.2, а не 3.12, як у специфікації. Браузерні завдання уникають усього, що поводиться по-різному в 3.12 і 3.13 (немає іменованих плейсхолдерів з послідовністю, немає вбудованих адаптерів дат); `autocommit` є в обох.
- Режим транзакцій для капстоуну: `autocommit=False` (PEP 249) з WAL, увімкненим до перемикання, і правилом "кожен метод сховища це один `with conn:`". Обидві пастки цього режиму (PRAGMA всередині транзакції і застарілий знімок у читача) показані реальним запуском. Твердження "за замовчуванням згодом стане False" взяте з документації `sqlite3.connect` 3.12, запуском не перевіряється.
- Схема: до полів з `questions.md` у `jobs` додано `config_version`, бо `configs` має складений ключ `(id, version)`, і задача мусить будувати конкретну версію. Це пояснено в уроці одним реченням.
- Годинник інжектується в `SqliteJobStore` (`Clock = Callable[[], datetime]`, як у `Pipeline` з m4-l08), а не передається в кожен метод: так Protocol чистіший, а тести детерміновані через `StepClock`.
- Урок показує `save_config`, `enqueue`, `next_pending`, `history`; `mark_done`, `mark_failed`, `requeue_running` винесені в t6, щоб завдання не було копією прикладу. `requeue_running` додано до Protocol заради m6-l07 (SIGTERM) і m7-l03 (рестарт воркера).
- Тестування (`:memory:` у фікстурі, `tmp_path`, фабрика з'єднань, контрактний тест fake проти SQLite) розміщене в розділі "Для капстоуну", щоб не перевищити 8 розділів теорії.
- Конкурентні воркери (`BEGIN IMMEDIATE`, `UPDATE ... RETURNING`), JOIN, індекси, ORM і Alembic згадані одним реченням з відсиланням до курсу про бази даних.
- Обсяг: 30 абзаців теорії + 11 callout-ів, 7 розділів теорії + "Для капстоуну"; найдовша серія абзаців без коду дорівнює 2.

## Питання з questions.md

Усі 11 закриті й позначені `[x]`.

## Залежності

Спирається на: m2-l05 (dataclass), m2-l07 (Protocol), m3-l03/m3-l04 (фікстури, fake замість mock), m4-l01 (логіка повторів `GenerationJob`), m4-l06 (`JobStatus`), m4-l07 (`closing`), m4-l08 (інжекція годинника, composition root), m5-l05 і m5-l08 (блокуючі виклики, `to_thread`), m6-l01 (`Path`), m6-l03 (aware-дати в UTC), m6-l06 (`Settings.db_path`), m6-l07 (повернення `running` у чергу при SIGTERM).

Готує для: m7-l01 (`connect` як залежність з `yield`, `dependency_overrides`), m7-l03 (воркер через `to_thread(store.next_pending)`, `requeue_running` при старті), m7-l05 (ізоляція тестів через `:memory:`, `tmp_path` і `MemoryJobStore`).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `JobStatus` імпортується з `formbuilder.jobs`; `MemoryJobStore` живе в `store.py`, а не в `tests/fakes.py` (ним підмінюють сховище в модулі 7). Фрагмент `tests/test_store.py` з новим імпортом перевірено на чернетці: 4 passed.
- Цей Protocol зафіксовано як базовий `JobStore` до кінця курсу; m7-l01 додає `latest_config`/`get_job`, m7-l03 `retry=` у `mark_failed` і правило вичерпаних спроб у `requeue_running`.
