---
id: m6-l08
module: m6-stdlib-cli
title: "sqlite3 як сховище для капстоуну"
summary: "Учень зберігає й читає дані капстоуну через sqlite3: параметризовані запити, sqlite3.Row і перетворення в dataclass, ISO-дати й JSON у TEXT, транзакції через with conn і autocommit, міграції через PRAGMA user_version, WAL і потоки, і JobStore за Protocol з in-memory fake для тестів."
duration_min: 80
prerequisites: [m6-l07]
---

## З'єднання і курсор: весь API за п'ять викликів

SQLite це не сервер, до якого підключаються мережею, а бібліотека на C, яка працює всередині вашого процесу й читає та пише один файл. Модуль `sqlite3` зі стандартної бібліотеки це драйвер до неї за специфікацією DB-API 2.0 (PEP 249; "DB-API" це офіційна назва, її вживають і в документації, і на співбесідах). Ту саму форму API (з'єднання, курсор, `execute`, `commit`, плейсхолдери) мають драйвери Postgres і MySQL, тож вивчене тут переноситься. Для капстоуну SQLite вибрано свідомо: нуль налаштувань, жодного окремого контейнера, база це один файл, а одного процесу з одним воркером, що пише, вона витримує з запасом. Postgres, ORM і все, що потребує сервера бази, лишаються для курсу про бази даних.

```ts
import Database from "better-sqlite3";

const db = new Database(":memory:");
db.exec("CREATE TABLE forms (slug TEXT PRIMARY KEY, title TEXT)");
db.prepare("INSERT INTO forms VALUES (?, ?)").run("signup", "Sign up");
console.log(db.prepare("SELECT slug, title FROM forms").all());
// [ { slug: 'signup', title: 'Sign up' } ]
db.close();
```

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE forms (slug TEXT PRIMARY KEY, title TEXT)")
conn.execute("INSERT INTO forms VALUES (?, ?)", ("signup", "Sign up"))
conn.commit()
print(conn.execute("SELECT slug, title FROM forms").fetchall())
conn.close()
```

```text
[('signup', 'Sign up')]
```

Обидва API синхронні, і це добре: модель у голові та сама. Розходиться в трьох місцях. Рядки результату за замовчуванням це кортежі, а не об'єкти з іменами колонок (виправляється `row_factory`, розділ нижче). Параметри передаються одним кортежем, а не окремими аргументами. І `better-sqlite3` комітить кожен запит сам, а `sqlite3` перед `INSERT` неявно відкрив транзакцію, і без `commit()` вставка при закритті зникла б (розділ про транзакції).

`conn.execute(...)` це нестандартний скорочений шлях: він створює курсор (cursor, офіційний термін DB-API), виконує на ньому запит і повертає курсор. Курсор тримає результат і віддає його порціями: `fetchone()` наступний рядок або `None`, `fetchall()` усе, що лишилось, а сам курсор це ітератор, тому по ньому ходять `for`. Після `INSERT` у курсорі є `lastrowid`, після `UPDATE` і `DELETE` кількість змінених рядків у `rowcount`. Колонка `INTEGER PRIMARY KEY` в SQLite це псевдонім внутрішнього `rowid`, тому вона заповнюється сама, як `SERIAL`.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, form_id TEXT, status TEXT)")
cur = conn.execute("INSERT INTO jobs (form_id, status) VALUES ('signup', 'queued')")
print(type(cur).__name__, cur.lastrowid, cur.rowcount)
conn.execute("INSERT INTO jobs (form_id, status) VALUES ('contact', 'done')")
conn.execute("INSERT INTO jobs (form_id, status) VALUES ('signup', 'failed')")
conn.commit()

cur = conn.execute("SELECT id, form_id, status FROM jobs ORDER BY id")
print(cur.fetchone())
print(cur.fetchall())
print(cur.fetchone())

print(conn.execute("SELECT count(*) FROM jobs").fetchone()[0])
for job_id, form_id, status in conn.execute("SELECT * FROM jobs WHERE status != 'queued'"):
    print(job_id, form_id, status)
conn.close()
```

```text
Cursor 1 1
(1, 'signup', 'queued')
[(2, 'contact', 'done'), (3, 'signup', 'failed')]
None
3
2 contact done
3 signup failed
```

> **Пастка.** `fetchone()` на порожньому результаті повертає `None`, а не порожній кортеж. Звичне `conn.execute(...).fetchone()[0]` для "знайди одне значення" падає з `TypeError: 'NoneType' object is not subscriptable`, щойно рядка немає. Агрегати (`count(*)`, `max(...)`) завжди повертають рядок, а пошук за ключем перевіряйте на `None` перед індексуванням.

`sqlite3.connect(path)` створює файл, якщо його немає, і приймає як рядок, так і `Path` (m6-l01). Спеціальне ім'я `":memory:"` дає базу в пам'яті, яка живе, поки відкрите з'єднання, і кожне таке з'єднання отримує власну, порожню базу. Для тестів це ідеально, для двох з'єднань, які мали б бачити ті самі дані, це пастка.

```python live
import sqlite3

a = sqlite3.connect(":memory:")
a.execute("CREATE TABLE forms (slug TEXT)")
b = sqlite3.connect(":memory:")
try:
    b.execute("SELECT * FROM forms")
except sqlite3.OperationalError as e:
    print("OperationalError:", e)
```

```text
OperationalError: no such table: forms
```

<!-- task: t1 -->

## Параметри: `?` і `:name`, а не f-рядок

SQL це код, і f-рядок зі значенням робить значення частиною коду. Рука JS-розробника тягнеться до template literal, бо в `fetch` і логах це норма; тут це інʼєкція (SQL injection). Достатньо, щоб slug прийшов з URL.

```ts
db.prepare(`SELECT slug FROM forms WHERE slug = '${slug}'`).all();  // інʼєкція
db.prepare("SELECT slug FROM forms WHERE slug = ?").all(slug);     // правильно
```

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE forms (slug TEXT, title TEXT)")
conn.executemany("INSERT INTO forms VALUES (?, ?)", [("signup", "Sign up"), ("contact", "Contact")])

def find_unsafe(slug: str) -> list[tuple[str]]:
    return conn.execute(f"SELECT slug FROM forms WHERE slug = '{slug}'").fetchall()

print(find_unsafe("signup"))
print(find_unsafe("x' OR '1'='1"))
find_unsafe("o'brien")
```

```text
[('signup',)]
[('signup',), ('contact',)]
sqlite3.OperationalError: near "brien": syntax error
```

Поведінка розходиться лише в синтаксисі передачі: у `better-sqlite3` значення йдуть окремими аргументами `.all(slug)`, у Python одним кортежем або словником другим аргументом `execute`. Механізм той самий: SQLite компілює запит з "дірками" (prepared statement, офіційний термін SQLite) і прив'язує значення окремо, через `sqlite3_bind_*`. Значення ніколи не розбирається як SQL, тому лапки, `OR` і `;` у ньому це просто символи рядка. Бонусом модуль кешує скомпільовані запити (до 128 на з'єднання за замовчуванням), і той самий текст із різними параметрами не компілюється заново.

Стилів плейсхолдерів (placeholder, так у документації) два. `?` бере значення з послідовності за позицією, `:name` бере з словника за іменем; словник зручний, коли параметрів багато або одне значення використовується двічі. `executemany` виконує один запит для кожного набору параметрів з будь-якого iterable, включно з генератором (m5-l02), і в `rowcount` повертає сумарну кількість рядків.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE forms (slug TEXT, title TEXT, status TEXT)")

conn.execute("INSERT INTO forms VALUES (?, ?, ?)", ("o'brien", "Quote test", "draft"))
conn.execute(
    "INSERT INTO forms VALUES (:slug, :title, :status)",
    {"slug": "signup", "title": "Sign up", "status": "published"},
)
rows = [
    {"slug": "contact", "title": "Contact", "status": "published"},
    {"slug": "survey", "title": "Survey", "status": "draft"},
]
cur = conn.executemany("INSERT INTO forms VALUES (:slug, :title, :status)", rows)
print(cur.rowcount)

print(conn.execute("SELECT slug FROM forms WHERE slug = ?", ("o'brien",)).fetchall())
print(conn.execute("SELECT slug FROM forms WHERE slug = ?", ("x' OR '1'='1",)).fetchall())
print(conn.execute(
    "SELECT slug FROM forms WHERE status = :s OR title = :s ORDER BY slug", {"s": "draft"}
).fetchall())
```

```text
2
[("o'brien",)]
[]
[("o'brien",), ('survey',)]
```

> **Пастка.** Один параметр це все одно послідовність: `(slug,)` з комою. `("signup")` без коми це просто рядок у дужках, а рядок теж послідовність, тому `sqlite3` бачить шість значень, по одному на символ. Помилка чесно каже, скільки отримано, і це найкращий спосіб упізнати пропущену кому.

```python
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE forms (slug TEXT)")
conn.execute("SELECT * FROM forms WHERE slug = ?", ("signup"))
```

```text
sqlite3.ProgrammingError: Incorrect number of bindings supplied. The current statement uses 1, and there are 6 supplied.
```

> **Пастка.** Плейсхолдер підставляє лише значення, а не імена таблиць, колонок чи `ASC`/`DESC`: `SELECT * FROM ?` дає `OperationalError: near "?": syntax error`. Якщо ім'я колонки приходить ззовні (сортування за параметром запиту), його перевіряють за білим списком, і лише значення зі списку потрапляє у f-рядок.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE forms (slug TEXT, title TEXT)")
conn.executemany("INSERT INTO forms VALUES (?, ?)", [("signup", "B"), ("contact", "A")])

SORTABLE = {"slug": "slug", "title": "title"}

def list_forms(order_by: str) -> list[str]:
    column = SORTABLE.get(order_by)
    if column is None:
        raise ValueError(f"cannot sort by {order_by!r}")
    return [slug for (slug,) in conn.execute(f"SELECT slug FROM forms ORDER BY {column}")]

print(list_forms("slug"), list_forms("title"))
try:
    list_forms("slug; DROP TABLE forms")
except ValueError as e:
    print("ValueError:", e)
```

```text
['contact', 'signup'] ['contact', 'signup']
ValueError: cannot sort by 'slug; DROP TABLE forms'
```

<!-- task: q1 -->

<!-- task: t2 -->

## `sqlite3.Row`: рядок за іменем колонки, далі dict або dataclass

Кортеж як рядок результату крихкий: його читають за позицією, а позиції змінюються разом із `SELECT` чи схемою. `conn.row_factory` це функція `(cursor, row_tuple) -> що завгодно`, яку модуль викликає для кожного рядка; "row factory" це офіційна назва атрибута. Вбудована фабрика `sqlite3.Row` написана на C і дає об'єкт, який індексується і за номером, і за іменем колонки (без урахування регістру), має `keys()` і тому перетворюється в `dict` одним викликом: `dict()` приймає будь-що з `keys()` і `__getitem__` (протокол mapping, m4-l02).

```python live
import json
import sqlite3

conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
conn.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, form_id TEXT, status TEXT)")
conn.execute("INSERT INTO jobs (form_id, status) VALUES ('signup', 'queued')")

row = conn.execute("SELECT * FROM jobs").fetchone()
print(type(row).__name__, row["form_id"], row["STATUS"], row[0])
print(row.keys())
print(dict(row))
print(json.dumps(dict(row)))

try:
    row.form_id
except AttributeError as e:
    print("AttributeError:", e)
try:
    json.dumps(row)
except TypeError as e:
    print("TypeError:", e)
```

```text
Row signup queued 1
['id', 'form_id', 'status']
{'id': 1, 'form_id': 'signup', 'status': 'queued'}
{"id": 1, "form_id": "signup", "status": "queued"}
AttributeError: 'sqlite3.Row' object has no attribute 'form_id'
TypeError: Object of type Row is not JSON serializable
```

> **Пастка.** `Row` схожий на об'єкт з Prisma лише наполовину. Доступу через крапку немає, `.get()` немає, у JSON він не серіалізується, і FastAPI теж не зможе його повернути. `Row` живе всередині шару сховища; назовні виходить `dict` або, краще, dataclass із нормальними Python-типами.

Перетворення в dataclass (m2-l05) робиться функцією на межі сховища. `Job(**row)` спокусливий, але не працює: `**` вимагає справжнього mapping з ключами-рядками, а головне, у базі `created_at` це рядок, а в dataclass має бути `datetime`. Явна функція `job_from_row` і є місцем, де з'являються типи: `fetchone()` анотований як `Any`, тому mypy нічого не знає про рядки результату, а функція, яка повертає `Job | None`, повертає типізацію в решту коду.

```python live
import sqlite3
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Job:
    id: int
    form_id: str
    status: str
    created_at: datetime


def job_from_row(row: sqlite3.Row) -> Job:
    return Job(
        id=row["id"],
        form_id=row["form_id"],
        status=row["status"],
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def get_job(conn: sqlite3.Connection, job_id: int) -> Job | None:
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return None if row is None else job_from_row(row)


conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
conn.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, form_id TEXT, status TEXT, created_at TEXT)")
conn.execute("INSERT INTO jobs VALUES (1, 'signup', 'queued', '2026-10-18T12:00:00+00:00')")

job = get_job(conn, 1)
print(job)
print(get_job(conn, 99))
```

```text
Job(id=1, form_id='signup', status='queued', created_at=datetime.datetime(2026, 10, 18, 12, 0, tzinfo=datetime.timezone.utc))
None
```

Якщо `Row` не потрібен зовсім, фабрика пишеться в один рядок через `cursor.description`, де лежать імена колонок поточного запиту. Це рецепт з документації; він повільніший за `sqlite3.Row`, зате одразу дає `dict`.

```python live
import sqlite3

def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {col[0]: value for col, value in zip(cursor.description, row)}

conn = sqlite3.connect(":memory:")
conn.row_factory = dict_factory
print(conn.execute("SELECT 1 AS id, 'signup' AS form_id").fetchone())
```

```text
{'id': 1, 'form_id': 'signup'}
```

<!-- task: t3 -->

## Типи: SQLite зберігає те, що дали

У SQLite п'ять класів зберігання, і вони один в один лягають на Python: `NULL` на `None`, `INTEGER` на `int`, `REAL` на `float`, `TEXT` на `str`, `BLOB` на `bytes`. Тип колонки в `CREATE TABLE` при цьому лише підказка, у термінах SQLite affinity (type affinity, офіційна назва). Колонка `INTEGER` перетворить рядок `'42'` на число, але рядок `'abc'` збереже як рядок, і тип визначається для кожного значення окремо, а не для колонки. Таблиці `STRICT` (SQLite 3.37+) вмикають справжню перевірку.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE t (n INTEGER)")
conn.executemany("INSERT INTO t VALUES (?)", [(1,), ("42",), ("abc",), (4.0,), (None,)])
print(conn.execute("SELECT n, typeof(n) FROM t").fetchall())

conn.execute("CREATE TABLE s (n INTEGER) STRICT")
try:
    conn.execute("INSERT INTO s VALUES ('abc')")
except sqlite3.IntegrityError as e:
    print("IntegrityError:", e)
```

```text
[(1, 'integer'), (42, 'integer'), ('abc', 'text'), (4, 'integer'), (None, 'null')]
IntegrityError: cannot store TEXT value in INTEGER column s.n
```

> **Під капотом.** Перетворення типів робить C-модуль `_sqlite3`. При записі він дивиться на Python-тип значення і викликає `sqlite3_bind_int64`, `_double`, `_text` або `_blob`; при читанні питає в SQLite тип конкретного значення через `sqlite3_column_type` і створює відповідний Python-об'єкт. Тому з однієї колонки може прийти і `int`, і `str`, і ніякої схеми модуль не читає.

Типу `bool` в SQLite немає. `True` записується як `1` і повертається як `1`. Порівняння `== True` у Python ще спрацює, бо `True == 1`, але `is True` уже ні, а у JSON-відповіді фронтенд отримає `1` замість `true`. JSON-конфіг так само зберігається в `TEXT` через `json.dumps` і повертається рядком: колонок-об'єктів, як `Json` у Prisma чи `jsonb` у Postgres-драйвері, тут немає.

```ts
// Prisma: поле Json і Boolean приходять уже розібраними
const form = await prisma.form.findUnique({ where: { id: "signup" } });
form.config.elements.length;  // object
form.isPublished === true;    // boolean
```

```python live
import json
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE forms (id TEXT, config TEXT, is_published INTEGER)")
config = {"id": "signup", "theme": {"accent": "#0066cc"}, "elements": [{"kind": "input"}]}
conn.execute("INSERT INTO forms VALUES (?, ?, ?)", ("signup", json.dumps(config), True))

raw, published = conn.execute("SELECT config, is_published FROM forms").fetchone()
print(type(raw).__name__, published, published is True)
print(json.loads(raw)["theme"]["accent"], bool(published))

print(conn.execute(
    "SELECT json_extract(config, '$.theme.accent'), json_array_length(config, '$.elements')"
    " FROM forms WHERE json_extract(config, '$.id') = ?",
    ("signup",),
).fetchone())
```

```text
str 1 False
#0066cc True
('#0066cc', 1)
```

Різниця з Prisma в тому, хто розбирає значення: там ORM знає схему й повертає готові `object` і `boolean`, тут драйвер віддає те, що лежить у базі, і перетворення `json.loads` та `bool(...)` пишете ви, в одній функції на межі сховища. Натомість SQLite уміє дивитися всередину JSON-рядка без завантаження в Python: функції `json_extract`, `json_array_length` (вбудовані з SQLite 3.38) працюють у `SELECT` і `WHERE`. Для капстоуну цього достатньо, щоб знайти версії конфігу з певною темою, не читаючи всі конфіги.

Дати зберігаються як ISO-рядок у UTC: `moment.astimezone(UTC).isoformat()` на запис, `datetime.fromisoformat` на читання (детально про aware-дати в m6-l03). Причина саме в UTC, а не просто в ISO: SQLite порівнює ці рядки як рядки, і `ORDER BY created_at` чи `WHERE created_at < ?` правильні лише тоді, коли всі значення в одному форматі й з одним зсувом. Змішані зсуви дають правильні рядки в неправильному порядку.

```python live
from datetime import UTC, datetime, timedelta, timezone

kyiv = timezone(timedelta(hours=3))
a = datetime(2026, 10, 18, 11, 30, tzinfo=UTC)
b = datetime(2026, 10, 18, 14, 0, tzinfo=kyiv)   # це 11:00 UTC, тобто раніше за a
print(b < a)
print(sorted([a.isoformat(), b.isoformat()]))
print(sorted([a.isoformat(), b.astimezone(UTC).isoformat()]))
```

```text
True
['2026-10-18T11:30:00+00:00', '2026-10-18T14:00:00+03:00']
['2026-10-18T11:00:00+00:00', '2026-10-18T11:30:00+00:00']
```

Модуль уміє і сам перетворювати типи: адаптери (`register_adapter`, Python-тип у SQLite-значення) і конвертери (`register_converter` з `detect_types`, назад). Вбудовані адаптер і конвертер для `date` і `datetime` у 3.12 оголошені застарілими: вони неявні, пишуть `str(dt)` з пробілом замість `T` і погано поводяться з часовими зонами. Документація пропонує рецепти власних адаптерів, але для капстоуну явне перетворення в одній функції простіше читати й тестувати.

```python live
import sqlite3
import warnings
from datetime import UTC, datetime

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE t (at TEXT)")
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    conn.execute("INSERT INTO t VALUES (?)", (datetime(2026, 10, 18, 12, 0, tzinfo=UTC),))
print(caught[0].category.__name__, caught[0].message)
print(conn.execute("SELECT at FROM t").fetchone())
```

```text
DeprecationWarning The default datetime adapter is deprecated as of Python 3.12; see the sqlite3 documentation for suggested replacement recipes
('2026-10-18 12:00:00+00:00',)
```

<!-- task: q3 -->

<!-- task: t4 -->

## Транзакції: хто відкриває і хто комітить

За замовчуванням (`isolation_level=""`, у 3.12 це режим `LEGACY_TRANSACTION_CONTROL`) модуль сам виконує `BEGIN` перед кожним `INSERT`, `UPDATE`, `DELETE` і `REPLACE`, якщо транзакція ще не відкрита. Перед `SELECT` і `CREATE TABLE` він цього не робить. Зміни бачать інші з'єднання лише після `commit()`, а `close()` без `commit()` це `rollback`. У цьому сенсі "автокоміт вимкнений за замовчуванням", і саме тут JS-звичка з `better-sqlite3` губить дані.

```python
import sqlite3
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "app.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY)")
    print("after CREATE:", conn.in_transaction)
    conn.execute("INSERT INTO jobs DEFAULT VALUES")
    print("after INSERT:", conn.in_transaction)
    conn.close()

    conn = sqlite3.connect(path)
    print("rows:", conn.execute("SELECT count(*) FROM jobs").fetchone()[0])
    conn.close()
```

```text
after CREATE: False
after INSERT: True
rows: 0
```

З'єднання це контекстний менеджер, але не той, якого чекаєш після `with open(...)`. `__exit__` робить `commit()`, якщо блок завершився без винятку, і `rollback()`, якщо з винятком, після чого виняток летить далі. З'єднання при цьому лишається відкритим. Тобто `with conn:` це транзакція, як `prisma.$transaction(...)`, а не звільнення ресурсу, як `using` у TS 5.2.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE configs (id TEXT, version INTEGER, PRIMARY KEY (id, version))")

with conn:
    conn.execute("INSERT INTO configs VALUES ('signup', 1)")

try:
    with conn:
        conn.execute("INSERT INTO configs VALUES ('signup', 2)")
        conn.execute("INSERT INTO configs VALUES ('signup', 1)")   # дубль ключа
except sqlite3.IntegrityError as e:
    print("IntegrityError:", e)

print(conn.execute("SELECT id, version FROM configs").fetchall())
```

```text
IntegrityError: UNIQUE constraint failed: configs.id, configs.version
[('signup', 1)]
```

> **Пастка.** `with sqlite3.connect(path) as conn:` читається як "відкрив і закрив", а насправді лише комітить. У сервері, який робить так на кожен запит, з'єднання й файлові дескриптори накопичуються, поки їх не прибере збирач сміття. Для закриття потрібен `contextlib.closing` (m4-l07), і обидва менеджери поєднуються в одному `with`.

```python
import sqlite3
from contextlib import closing

with sqlite3.connect(":memory:") as conn:
    conn.execute("CREATE TABLE t (x)")
print(conn.execute("SELECT count(*) FROM t").fetchone())   # з'єднання ще живе

with closing(sqlite3.connect(":memory:")) as conn, conn:
    conn.execute("CREATE TABLE t (x)")
    conn.execute("INSERT INTO t VALUES (1)")
conn.execute("SELECT 1")
```

```text
(0,)
sqlite3.ProgrammingError: Cannot operate on a closed database.
```

Неявний `BEGIN` лише перед DML має наслідок, який ламає міграції: `CREATE TABLE` у legacy-режимі виконується поза транзакцією, і `rollback` його не відкочує. Старий спосіб узяти керування в свої руки це `isolation_level=None`: модуль більше нічого не відкриває сам, а `BEGIN` ви пишете явно (значення `"DEFERRED"`, `"IMMEDIATE"`, `"EXCLUSIVE"` лише обирають, який `BEGIN` модуль вставлятиме неявно). У 3.12 з'явився кращий параметр `autocommit`. `autocommit=False` означає поведінку за PEP 249: з'єднання завжди всередині транзакції, нова відкривається одразу після `connect`, `commit` і `rollback`, і в неї потрапляє все, включно з `CREATE` і `ALTER`. `autocommit=True` означає, що кожен запит комітиться сам, `commit()` нічого не робить, і `with conn:` теж. Документація попереджає, що за замовчуванням згодом стане `False`.

```python live
import sqlite3

for mode in ("legacy", False):
    conn = sqlite3.connect(":memory:") if mode == "legacy" else sqlite3.connect(":memory:", autocommit=False)
    print(mode, "in_transaction after connect:", conn.in_transaction)
    try:
        with conn:
            conn.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY)")
            conn.execute("INSERT INTO jobs DEFAULT VALUES")
            raise RuntimeError("migration step failed")
    except RuntimeError:
        pass
    print(mode, "tables:", conn.execute("SELECT name FROM sqlite_master").fetchall())
```

```text
legacy in_transaction after connect: False
legacy tables: [('jobs',)]
False in_transaction after connect: True
False tables: []
```

> **Пастка.** Деякі `PRAGMA` не працюють усередині транзакції, а з `autocommit=False` транзакція відкрита завжди. `PRAGMA journal_mode=WAL` падає з `OperationalError: cannot change into wal mode from within a transaction`, а `PRAGMA foreign_keys=ON` мовчки нічого не робить. Рецепт: відкрити з'єднання з `autocommit=True`, виконати `PRAGMA`, потім присвоїти `conn.autocommit = False`. Атрибут можна змінювати після створення, і перемикання в `False` одразу відкриває транзакцію.

```python
import sqlite3
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    conn = sqlite3.connect(Path(tmp) / "a.db", autocommit=False)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError as e:
        print("OperationalError:", e)
    conn.close()

    conn = sqlite3.connect(Path(tmp) / "b.db", autocommit=True)
    print(conn.execute("PRAGMA journal_mode=WAL").fetchone()[0])
    conn.execute("PRAGMA foreign_keys=ON")
    conn.autocommit = False
    print(conn.in_transaction, conn.execute("PRAGMA foreign_keys").fetchone()[0])
    conn.close()
```

```text
OperationalError: cannot change into wal mode from within a transaction
wal
True 1
```

<!-- task: q2 -->

## Схема і міграції без фреймворку

`CREATE TABLE IF NOT EXISTS` вирішує перший запуск: таблиця створюється, якщо її немає, і повторний запуск не падає. Еволюцію схеми він не вирішує. Коли через місяць у `jobs` знадобиться колонка `url`, `IF NOT EXISTS` побачить, що таблиця вже є, і нічого не зробить; на нових машинах колонка буде, на старих ні.

```python live
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, status TEXT)")
conn.execute("CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, status TEXT, url TEXT)")
print([col[1] for col in conn.execute("PRAGMA table_info(jobs)")])
```

```text
['id', 'status']
```

Для одного застосунку достатньо одного числа. `PRAGMA user_version` це ціле в заголовку файлу бази, яке SQLite не використовує сам і віддає застосунку. Міграції (migration, жаргон спільноти, у документації SQLite просто "schema change") це список кроків; крок `i` переводить схему з версії `i` у версію `i + 1`. Функція `migrate` читає поточну версію, виконує лише кроки після неї і в тій самій транзакції записує новий номер. З `autocommit=False` крок і номер або застосовуються разом, або не застосовуються зовсім.

```python live
import sqlite3

MIGRATIONS: list[list[str]] = [
    ["CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT NOT NULL)"],
    ["ALTER TABLE jobs ADD COLUMN url TEXT"],
]


def migrate(conn: sqlite3.Connection) -> int:
    (current,) = conn.execute("PRAGMA user_version").fetchone()
    for version, statements in enumerate(MIGRATIONS[current:], start=current + 1):
        with conn:
            for sql in statements:
                conn.execute(sql)
            conn.execute(f"PRAGMA user_version = {version}")
        print("applied", version)
    return len(MIGRATIONS)


conn = sqlite3.connect(":memory:", autocommit=False)
print(migrate(conn))
print(migrate(conn))
print([col[1] for col in conn.execute("PRAGMA table_info(jobs)")])
```

```text
applied 1
applied 2
2
2
['id', 'status', 'url']
```

> **Пастка.** `PRAGMA` не приймає плейсхолдерів: `PRAGMA user_version = ?` дає `OperationalError: near "?": syntax error`. Тут f-рядок допустимий, бо `version` це `int`, порахований вашим кодом, а не прийдешнє ззовні значення. Те саме правило, що для імен колонок: у SQL-текст потрапляє лише те, що ви контролюєте.

> **JS-аналог.** `prisma migrate` і `knex migrate` роблять те саме, але зберігають список застосованих файлів в окремій таблиці й генерують SQL зі схеми. Тут номер версії і список у коді, і для капстоуну з двома таблицями цього достатньо. У SQLAlchemy-світі цю роль виконує Alembic; це тема курсу про бази даних. Метод `executescript` теж уміє виконати кілька запитів, але в legacy-режимі спершу робить неявний `COMMIT`, тож для міграцій зрозуміліше `execute` у циклі всередині `with conn:`.

<!-- task: t5 -->

## Файл бази: один writer, WAL, потоки і бекап

SQLite блокує на запис увесь файл: читачів може бути багато, writer один. Друге з'єднання, яке хоче писати, поки перше тримає транзакцію, чекає `timeout` секунд (за замовчуванням 5.0) і після цього отримує `OperationalError: database is locked`. Це не баг і не корупція, а сигнал, що хтось занадто довго тримає транзакцію відкритою: найчастіше забутий `commit` або повільна робота всередині `with conn:`.

```python
import sqlite3
import tempfile
import time
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "app.db"
    writer = sqlite3.connect(path)
    writer.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY, status TEXT)")
    writer.execute("INSERT INTO jobs (status) VALUES ('queued')")   # транзакція відкрита

    other = sqlite3.connect(path, timeout=0.2)
    print("read:", other.execute("SELECT count(*) FROM jobs").fetchone())
    start = time.perf_counter()
    try:
        other.execute("INSERT INTO jobs (status) VALUES ('queued')")
    except sqlite3.OperationalError as e:
        print(f"OperationalError: {e} after {time.perf_counter() - start:.1f}s")

    writer.commit()
    other.execute("INSERT INTO jobs (status) VALUES ('queued')")
    other.commit()
    print("read:", other.execute("SELECT count(*) FROM jobs").fetchone())
```

```text
read: (0,)
OperationalError: database is locked after 0.2s
read: (2,)
```

`PRAGMA journal_mode=WAL` (write-ahead log, офіційна назва режиму) змінює спосіб запису: нові сторінки дописуються в окремий файл `-wal`, і читачі не блокують writer, а writer не блокує читачів. Writer однаково один. Режим зберігається у файлі бази, тож його досить увімкнути раз, але поруч з'являються файли `app.db-wal` і `app.db-shm`, і копіювати базу командою `cp` під час роботи вже не можна. Для капстоуну з API, що читає статуси, і воркером, що їх пише, WAL саме те, що треба.

```python
import sqlite3
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    conn = sqlite3.connect(Path(tmp) / "app.db")
    print(conn.execute("PRAGMA journal_mode=WAL").fetchone())
    conn.execute("CREATE TABLE t (x)")
    print(sorted(p.name for p in Path(tmp).iterdir()))
    conn.close()
```

```text
('wal',)
['app.db', 'app.db-shm', 'app.db-wal']
```

> **Пастка.** З `autocommit=False` з'єднання, яке лише читає й ніколи не комітить, тримає одну транзакцію вічно, а в WAL-режимі транзакція бачить знімок (snapshot, жаргон) бази на момент першого читання. Воркер, що опитує `jobs` таким з'єднанням, ніколи не побачить нових задач. Без WAL ще гірше: відкрита транзакція читача не дає writer закомітити, і запис падає з `database is locked`. Правило для капстоуну: кожен метод сховища, включно з читанням, це один `with conn:`, і транзакція закривається в кінці методу.

```python
import sqlite3
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "app.db"
    setup = sqlite3.connect(path, autocommit=True)
    setup.execute("PRAGMA journal_mode=WAL")
    setup.execute("CREATE TABLE jobs (id INTEGER PRIMARY KEY)")
    setup.close()

    api = sqlite3.connect(path, autocommit=False)
    worker = sqlite3.connect(path, autocommit=False)
    print("worker sees", worker.execute("SELECT count(*) FROM jobs").fetchone()[0])
    with api:
        api.execute("INSERT INTO jobs DEFAULT VALUES")
    print("worker sees", worker.execute("SELECT count(*) FROM jobs").fetchone()[0])
    worker.commit()
    print("after commit", worker.execute("SELECT count(*) FROM jobs").fetchone()[0])
```

```text
worker sees 0
worker sees 0
after commit 1
```

Друга межа це потоки. З'єднання за замовчуванням перевіряє, що ним користуються в тому потоці, де його створили (`check_same_thread=True`), і в іншому потоці кидає `ProgrammingError`. Перевірка лишилась з часів, коли SQLite не завжди збирали потокобезпечною; сьогоднішні збірки серіалізовані (`sqlite3.threadsafety == 3`), і `check_same_thread=False` знімає перевірку. Відповідальність за те, щоб двоє не писали одночасно в одну транзакцію, тоді на вас: один воркер, або `threading.Lock`, або окреме з'єднання на кожен потік.

Для asyncio це прямий наслідок: виклики `sqlite3` блокуючі, і всередині `async def` вони зупиняють event loop (m5-l05). Блокуючий виклик виносять у `asyncio.to_thread` (m5-l08), а той бере потік з пулу, щоразу можливо інший, тож з'єднання для нього створюють з `check_same_thread=False`. Бібліотека `aiosqlite` робить те саме всередині: тримає для з'єднання окремий потік і дає `await`-обгортки; для капстоуну достатньо `to_thread`.

```python
import asyncio
import sqlite3
import tempfile
from pathlib import Path


async def main(path: Path) -> None:
    strict = sqlite3.connect(path)
    try:
        await asyncio.to_thread(strict.execute, "SELECT 1")
    except sqlite3.ProgrammingError as e:
        print("ProgrammingError:", str(e).split(".")[0])

    shared = sqlite3.connect(path, check_same_thread=False)
    print(await asyncio.to_thread(lambda: shared.execute("SELECT 40 + 2").fetchone()))


with tempfile.TemporaryDirectory() as tmp:
    asyncio.run(main(Path(tmp) / "app.db"))
```

```text
ProgrammingError: SQLite objects created in a thread can only be used in that same thread
(42,)
```

Шлях до файлу береться з налаштувань (`FORMBUILDER_DB_PATH` у `Settings`, m6-l06), а не з коду. `sqlite3` створює файл, але не директорію: для `data/formbuilder.db` без `data/` буде `OperationalError: unable to open database file`, тому фабрика з'єднань робить `path.parent.mkdir(parents=True, exist_ok=True)`. Резервна копія робиться не `cp`, а методом `conn.backup(target)`: він копіює базу посторінково через SQLite, узгоджено навіть під час запису і з урахуванням WAL.

```python
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    try:
        sqlite3.connect(Path(tmp) / "data" / "formbuilder.db")
    except sqlite3.OperationalError as e:
        print("OperationalError:", e)

    path = Path(tmp) / "data" / "formbuilder.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as src:
        with src:
            src.execute("CREATE TABLE configs (id TEXT, version INTEGER)")
            src.execute("INSERT INTO configs VALUES ('signup', 1)")
        with closing(sqlite3.connect(Path(tmp) / "backup.db")) as dst:
            src.backup(dst)
            print(dst.execute("SELECT * FROM configs").fetchall())
```

```text
OperationalError: unable to open database file
[('signup', 1)]
```

Подивитися в базу руками можна консольним клієнтом `sqlite3`: на macOS він є з коробки, `.tables` і `.schema` показують структуру. У slim-образах Docker бінарника зазвичай немає, і там допомагає `python -m sqlite3` (з 3.12): він виконує SQL, а схему показує запит до `sqlite_schema`.

```text
$ sqlite3 data/formbuilder.db ".tables" ".schema configs" "PRAGMA user_version;"
configs
CREATE TABLE configs(id TEXT, version INTEGER, json TEXT, created_at TEXT, PRIMARY KEY (id, version));
0
$ python -m sqlite3 data/formbuilder.db "SELECT sql FROM sqlite_schema WHERE name = 'configs'"
('CREATE TABLE configs(id TEXT, version INTEGER, json TEXT, created_at TEXT, PRIMARY KEY (id, version))',)
```

<!-- task: q4 -->

## Для капстоуну

Сховище капстоуну має дві таблиці: `configs(id, version, json, created_at)` з версіями конфігу форми і `jobs(id, config_id, config_version, status, attempts, created_at, finished_at, error)` з задачами генерації. `config_version` додано до полів з плану свідомо: задача будує конкретну версію, а не "останню на момент, коли воркер дійшов до черги". Статуси ті самі, що в `JobStatus` з m4-l06 (у капстоуні `store.py` імпортує його з `formbuilder.jobs`, тут він повторений, щоб приклад запускався сам), а логіка повторів та сама, що в `GenerationJob.fail` з m4-l01: поки `attempts < MAX_ATTEMPTS`, задача повертається в `queued`.

Інтерфейс описано через Protocol (m2-l07), і саме він, а не `SqliteJobStore`, з'являється в сигнатурах воркера й FastAPI-залежностей. Годинник приходить параметром, як у `Pipeline` з m4-l08, тому тест задає фіксований час без `freezegun`. Методи `mark_done`, `mark_failed` і `requeue_running` ви допишете в t6; нижче все, що потрібно для черги.

```python live
import json
import sqlite3
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, Protocol

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


@dataclass(frozen=True)
class Job:
    id: int
    config_id: str
    config_version: int
    status: JobStatus
    attempts: int
    created_at: datetime
    finished_at: datetime | None
    error: str | None


class JobStore(Protocol):
    def save_config(self, config_id: str, config: Mapping[str, Any]) -> int: ...
    def enqueue(self, config_id: str, version: int) -> int: ...
    def next_pending(self) -> Job | None: ...
    def mark_done(self, job_id: int) -> None: ...
    def mark_failed(self, job_id: int, error: str) -> None: ...
    def history(self, config_id: str) -> list[Job]: ...
    def requeue_running(self) -> int: ...


MIGRATIONS: list[list[str]] = [
    [
        """CREATE TABLE configs (
               id TEXT NOT NULL,
               version INTEGER NOT NULL,
               json TEXT NOT NULL,
               created_at TEXT NOT NULL,
               PRIMARY KEY (id, version))""",
        """CREATE TABLE jobs (
               id INTEGER PRIMARY KEY,
               config_id TEXT NOT NULL,
               config_version INTEGER NOT NULL,
               status TEXT NOT NULL,
               attempts INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL,
               finished_at TEXT,
               error TEXT)""",
    ],
]


def migrate(conn: sqlite3.Connection) -> int:
    (current,) = conn.execute("PRAGMA user_version").fetchone()
    for version, statements in enumerate(MIGRATIONS[current:], start=current + 1):
        with conn:
            for sql in statements:
                conn.execute(sql)
            conn.execute(f"PRAGMA user_version = {version}")
    return len(MIGRATIONS)


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, autocommit=True, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")   # лише поза транзакцією
    conn.autocommit = False                   # далі PEP 249: завжди в транзакції
    conn.row_factory = sqlite3.Row
    migrate(conn)
    return conn


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat()


def job_from_row(row: sqlite3.Row) -> Job:
    finished = row["finished_at"]
    return Job(
        id=row["id"],
        config_id=row["config_id"],
        config_version=row["config_version"],
        status=JobStatus(row["status"]),
        attempts=row["attempts"],
        created_at=datetime.fromisoformat(row["created_at"]),
        finished_at=datetime.fromisoformat(finished) if finished else None,
        error=row["error"],
    )


class SqliteJobStore:
    MAX_ATTEMPTS = 3

    def __init__(self, conn: sqlite3.Connection, clock: Clock = utc_now) -> None:
        self._conn = conn
        self._clock = clock

    def save_config(self, config_id: str, config: Mapping[str, Any]) -> int:
        with self._conn:
            version: int = self._conn.execute(
                "SELECT coalesce(max(version), 0) + 1 FROM configs WHERE id = ?",
                (config_id,),
            ).fetchone()[0]
            self._conn.execute(
                "INSERT INTO configs (id, version, json, created_at) VALUES (?, ?, ?, ?)",
                (config_id, version, json.dumps(config), _iso(self._clock())),
            )
        return version

    def enqueue(self, config_id: str, version: int) -> int:
        with self._conn:
            cur = self._conn.execute(
                "INSERT INTO jobs (config_id, config_version, status, created_at)"
                " VALUES (?, ?, ?, ?)",
                (config_id, version, JobStatus.QUEUED, _iso(self._clock())),
            )
        assert cur.lastrowid is not None
        return cur.lastrowid

    def next_pending(self) -> Job | None:
        with self._conn:
            row = self._conn.execute(
                "SELECT id FROM jobs WHERE status = ? ORDER BY id LIMIT 1",
                (JobStatus.QUEUED,),
            ).fetchone()
            if row is None:
                return None
            self._conn.execute(
                "UPDATE jobs SET status = ?, attempts = attempts + 1 WHERE id = ?",
                (JobStatus.RUNNING, row["id"]),
            )
            return self._get(row["id"])

    def history(self, config_id: str) -> list[Job]:
        with self._conn:
            rows = self._conn.execute(
                "SELECT * FROM jobs WHERE config_id = ? ORDER BY id", (config_id,)
            ).fetchall()
        return [job_from_row(row) for row in rows]

    def _get(self, job_id: int) -> Job:
        row = self._conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise KeyError(job_id)
        return job_from_row(row)


class StepClock:
    """Fake-годинник: кожен виклик на хвилину пізніше."""

    def __init__(self, start: datetime) -> None:
        self._now = start

    def __call__(self) -> datetime:
        current = self._now
        self._now += timedelta(minutes=1)
        return current


def show(job: Job | None) -> str:
    if job is None:
        return "None"
    return f"#{job.id} {job.config_id}@v{job.config_version} {job.status} attempts={job.attempts} created={job.created_at:%H:%M}"


store = SqliteJobStore(
    connect(":memory:"), clock=StepClock(datetime(2026, 10, 18, 12, 0, tzinfo=UTC))
)
v1 = store.save_config("signup", {"id": "signup", "elements": []})
v2 = store.save_config("signup", {"id": "signup", "elements": [{"kind": "input", "id": "email"}]})
store.save_config("contact", {"id": "contact", "elements": []})
print("versions:", v1, v2)

print("enqueued:", store.enqueue("signup", v2), store.enqueue("contact", 1))
print(show(store.next_pending()))
print(show(store.next_pending()))
print(show(store.next_pending()))
print([show(job) for job in store.history("signup")])
```

```text
versions: 1 2
enqueued: 1 2
#1 signup@v2 running attempts=1 created=12:03
#2 contact@v1 running attempts=1 created=12:04
None
['#1 signup@v2 running attempts=1 created=12:03']
```

Кілька рішень тут не випадкові. `connect` вмикає WAL до перемикання в `autocommit=False` (пастка з розділу про транзакції) і ставить `check_same_thread=False`, бо воркер у m7-l03 викликатиме сховище через `asyncio.to_thread`. Кожен публічний метод це рівно один `with self._conn:`, тому він атомарний і не лишає відкритої транзакції зі старим знімком. `next_pending` читає і оновлює в одній транзакції; для одного воркера цього досить, а для кількох процесів-воркерів знадобився б `BEGIN IMMEDIATE` або `UPDATE ... RETURNING`, і це вже курс про бази даних. Усі три запити написані руками, і їх справді три: ORM для такого сховища додав би шар, який доведеться вивчати довше, ніж SQL.

Тести сховища потребують двох речей: справжньої бази, яка нічого не лишає після себе, і fake для тестів воркера й API, де SQL не перевіряється. `:memory:` у фікстурі дає перше: нова порожня база на кожен тест, без файлів. `tmp_path / "test.db"` (m3-l03) потрібен лише тоді, коли тест перевіряє саме файл: два з'єднання, WAL, бекап. Друге дає `MemoryJobStore` на словнику, той самий прийом, що `MemoryPublisher` у m3-l04; він лежить поруч у `store.py`, бо ним підмінятимуть сховище тести модуля 7. Щоб fake не розійшовся з оригіналом, обидві реалізації проганяють через один набір тестів: фікстура з `params` створює то одну, то іншу, і тест працює лише з Protocol `JobStore` (контрактний тест, contract test, жаргон спільноти).

```python
# tests/test_store.py
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest

from formbuilder.jobs import JobStatus
from formbuilder.store import JobStore, MemoryJobStore, SqliteJobStore, StepClock, connect

START = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)


@pytest.fixture(params=["sqlite", "memory"])
def store(request: pytest.FixtureRequest) -> Iterator[JobStore]:
    if request.param == "memory":
        yield MemoryJobStore(clock=StepClock(START))
        return
    conn = connect(":memory:")
    yield SqliteJobStore(conn, clock=StepClock(START))
    conn.close()


def test_versions_grow_per_config(store: JobStore) -> None:
    assert store.save_config("signup", {}) == 1
    assert store.save_config("signup", {}) == 2
    assert store.save_config("contact", {}) == 1


def test_next_pending_takes_oldest_and_counts_attempt(store: JobStore) -> None:
    first = store.enqueue("signup", 1)
    store.enqueue("signup", 1)
    job = store.next_pending()
    assert job is not None
    assert (job.id, job.status, job.attempts) == (first, JobStatus.RUNNING, 1)
```

```text
$ uv run pytest tests/test_store.py -q
....                                                                     [100%]
4 passed in 0.01s
```

> **Для капстоуну.** Сховище з'єднується з рештою в трьох місцях. У FastAPI (m7-l01) залежність з `yield` відкриває з'єднання через `connect(settings.db_path)` і закриває після запиту, а тести підмінюють її через `dependency_overrides` на `:memory:` або fake. Воркер з m7-l03 бере задачі через `await asyncio.to_thread(store.next_pending)` і пише результат через `mark_done` або `mark_failed`. Обробник SIGTERM з m6-l07 і старт застосунку викликають `requeue_running()`: задача, яка була `running` у момент падіння процесу, інакше висіла б у цьому статусі вічно.

<!-- task: t6 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **f-рядок або конкатенація замість плейсхолдера.** Template literal у SQL виглядає як звичайний рядок, а виходить інʼєкція і `syntax error` на першому апострофі в імені. Правильно: `?` або `:name`, а імена колонок через білий список.

   ```python
   conn.execute(f"SELECT * FROM forms WHERE slug = '{slug}'")    # інʼєкція
   conn.execute("SELECT * FROM forms WHERE slug = ?", (slug,))   # правильно
   ```

2. **Очікування автокоміту, як у `better-sqlite3`.** `INSERT` без `commit()` неявно відкрив транзакцію, і `close()` її відкотив. Правильно: кожна операція запису в `with conn:`.

   ```python
   with conn:
       conn.execute("INSERT INTO jobs (status) VALUES (?)", ("queued",))
   ```

3. **`with sqlite3.connect(...) as conn` як закриття.** Блок комітить, з'єднання лишається відкритим. Правильно: `closing(...)` для закриття, `with conn:` для транзакції.

   ```python
   with closing(sqlite3.connect(path)) as conn, conn:
       conn.execute("INSERT INTO jobs (status) VALUES ('queued')")
   ```

4. **Очікування JSON-колонки як об'єкта і `bool` як `bool`.** Як у Prisma з `Json` і `Boolean`. Насправді приходять `str` і `int`. Правильно: `json.loads` і `bool(...)` в одній функції `*_from_row`.

   ```python
   config = json.loads(row["json"])
   is_test = bool(row["is_test"])
   ```

5. **ORM-мислення там, де потрібні три запити.** Перший рефлекс "підключити Prisma-подібне" (SQLAlchemy, Peewee) для двох таблиць і п'яти методів. Додається модель, сесія, міграційний інструмент, а SQL однаково доведеться читати. Правильно для капстоуну: клас-сховище з явними запитами за Protocol; ORM розбирається в курсі про бази даних.

   ```python
   class SqliteJobStore:            # три SQL-запити, ніякої магії
       def next_pending(self) -> Job | None: ...
   ```

6. **Синхронний `sqlite3` прямо в `async def`.** Як `better-sqlite3` у Node, що теж блокує, тільки тут блокується весь event loop разом з іншими запитами. Правильно: `asyncio.to_thread` і з'єднання з `check_same_thread=False`.

   ```python
   job = await asyncio.to_thread(store.next_pending)
   ```

7. **`(slug)` замість `(slug,)`.** Рядок у дужках це не кортеж, і кожен символ стає окремим параметром. Правильно: кома, або словник з `:name`.

   ```python
   conn.execute("SELECT * FROM forms WHERE slug = ?", (slug,))
   conn.execute("SELECT * FROM forms WHERE slug = :slug", {"slug": slug})
   ```

8. **Локальний час або змішані зсуви в датах.** `datetime.now().isoformat()` без зони або з різними зсувами ламає `ORDER BY`. Правильно: aware-дата, перетворена в UTC перед записом.

   ```python
   created_at = moment.astimezone(UTC).isoformat()
   ```

## Підсумок

- `sqlite3` це DB-API-драйвер до вбудованої бібліотеки: `connect`, `execute`, `fetchone`/`fetchall`, `commit`, `close`; база це один файл або `:memory:` на з'єднання.
- Значення лише через плейсхолдери `?` (кортеж, `(x,)` з комою) або `:name` (словник); `executemany` для пачок; імена колонок через білий список.
- `row_factory = sqlite3.Row` дає доступ за іменем; назовні сховища виходить dataclass, зібраний явною функцією.
- SQLite зберігає тип значення, а не колонки; `bool` повертається як `int`, JSON як `str`, дати зберігаються ISO-рядком в UTC.
- Вбудовані адаптери `datetime` застаріли в 3.12; перетворюйте явно.
- Legacy-режим неявно відкриває транзакцію перед DML, але не перед DDL; `with conn:` комітить або відкочує і не закриває.
- `autocommit=False` (3.12+) дає транзакцію завжди, включно з DDL; `PRAGMA journal_mode` і `foreign_keys` виконуються до перемикання.
- Міграції: список кроків, номер у `PRAGMA user_version`, крок і номер в одній транзакції.
- Writer один; WAL розводить читачів і writer; `database is locked` означає задовгу транзакцію; у потоках і `to_thread` потрібен `check_same_thread=False`.
- `JobStore` як Protocol, `SqliteJobStore` і `MemoryJobStore` проходять той самий контрактний тест.

## Що далі

Модуль 7 починається з m7-l01: FastAPI, роутери й `Depends`. Фабрика `connect` звідси стане залежністю з `yield`, `JobStore` прийде в обробники як параметр, а `dependency_overrides` підмінить його на `:memory:` або fake. У m7-l03 воркер на `asyncio.Queue` викликатиме `next_pending`, `mark_done` і `mark_failed` через `to_thread`.
