# Ключові питання уроку m6-l08 "sqlite3 як сховище для капстоуну"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Це урок про модуль `sqlite3` як бібліотеку, не про SQL і бази даних (окремий курс): SQL лише на рівні `CREATE TABLE`, `INSERT`, `SELECT ... WHERE`, `UPDATE`, без JOIN-теорії, індексів і нормалізації. Pyodide має sqlite3 (in-memory і файл у віртуальній ФС), тож завдання `runtime: browser` з `:memory:` можливі.

- [x] `sqlite3.connect` (файл або `:memory:`), `execute`, `executemany`, `fetchone`/`fetchall`, `commit`, `close`; з'єднання як контекстний менеджер (комітить, не закриває: пастка) і `contextlib.closing`. Чому SQLite для капстоуну: нуль налаштувань, один файл, достатньо для одного воркера.
- [x] Параметризовані запити `?` і `:name` замість f-рядків (інʼєкція), передача dict, `executemany` для пачок.
- [x] `row_factory = sqlite3.Row` для доступу за іменем колонки, перетворення рядка в dict або dataclass (посилання на m2-l05), типізація результату.
- [x] Типи: SQLite динамічний, `datetime` зберігати як ISO-рядок у UTC (посилання на m6-l03), JSON-конфіг як TEXT з `json.dumps` або через JSON1-функції (`json_extract`), bool як INTEGER, адаптери/конвертери одним реченням і чому вбудовані застаріли в 3.12.
- [x] Транзакції: автокоміт вимкнений за замовчуванням, `isolation_level`, `with conn:` як транзакція, `rollback` при винятку, `autocommit` параметр у 3.12. Лише механіка, без теорії ізоляції.
- [x] Схема і міграції для одного застосунку: `CREATE TABLE IF NOT EXISTS`, `PRAGMA user_version` як номер версії схеми, функція `migrate(conn)` з послідовними кроками.
- [x] Паралельність: один writer, `PRAGMA journal_mode=WAL`, `check_same_thread=False` і коли він потрібен, `sqlite3.OperationalError: database is locked` і таймаут; asyncio: `to_thread` або `aiosqlite` одним реченням (посилання на m5-l08).
- [x] Робота з файлом: де лежить БД (налаштування, посилання на m6-l06), резервна копія через `conn.backup`, `sqlite3` CLI для огляду, `.schema`.
- [x] Тестування: `:memory:` у фікстурі, або `tmp_path / "test.db"`, фабрика з'єднань як залежність (посилання на m3-l04, m4-l08).
- [x] Для капстоуну: `JobStore` з таблицями `configs(id, version, json, created_at)` і `jobs(id, config_id, status, attempts, created_at, finished_at, error)`; методи `enqueue`, `next_pending`, `mark_done`, `mark_failed`, `history`; Protocol для сховища, щоб у тестах був in-memory fake.
- [x] Які JS-звички тут шкодять: ORM-мислення (Prisma) там, де потрібні три запити, `better-sqlite3` синхронний API як норма (тут теж синхронний, але у воркері через `to_thread`), string-конкатенація SQL, очікування JSON-колонок як об'єктів.
