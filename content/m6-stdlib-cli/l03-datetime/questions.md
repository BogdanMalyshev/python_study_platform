# Ключові питання уроку m6-l03 "datetime, zoneinfo, UTC за замовчуванням"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] `datetime`, `date`, `time`, `timedelta`: створення, арифметика (`+ timedelta(days=1)`), порівняння, `replace`. Порівняти з `Date` (мілісекунди, мутабельність, місяці з 0) і `Temporal`.
- [x] Naive проти aware: `datetime.now()` без tz це пастка; `datetime.now(tz=timezone.utc)` або `datetime.now(UTC)` (3.11+); `TypeError: can't compare offset-naive and offset-aware`; правило "зберігати і рахувати в UTC, показувати в локальному".
- [x] `zoneinfo.ZoneInfo("Europe/Kyiv")`: конвертація через `astimezone`, перехід на літній час на реальному прикладі, чому `pytz` застарів; база tzdata на macOS і в Docker (`tzdata` пакет).
- [x] Форматування і парсинг: `strftime`/`strptime` з кодами (`%Y-%m-%d %H:%M:%S%z`), `isoformat`/`fromisoformat` (3.11+ розуміє `Z`), f-рядки з форматом (посилання на m1-l04); `datetime.utcnow()` як застарілий.
- [x] Unix time: `timestamp()`, `fromtimestamp(ts, tz=UTC)`, секунди проти мілісекунд JS; `time.time()`, `time.monotonic()` і `time.perf_counter()` для вимірювань (чому не `datetime` для тривалості).
- [x] `timedelta`: `total_seconds()`, немає місяців і років (чому), `dateutil.relativedelta` одним реченням; округлення й truncation до початку дня.
- [x] Діапазони дат: генератор днів між датами (посилання на m5-l02), `calendar` модуль коротко, перший день тижня (понеділок, `weekday()` проти `isoweekday()`).
- [x] datetime у JSON (`isoformat`, `default=`), у Pydantic (парсить ISO автоматично, серіалізує в ISO), у SQLite (рядки ISO, посилання на m6-l08).
- [x] Тестування часу: інʼєкція `clock: Callable[[], datetime]`, `freezegun`/`time-machine` (посилання на m3-l04).
- [x] Для капстоуну: `created_at`/`finished_at` задач генерації в UTC, тривалість через `perf_counter`, відображення в Europe/Kyiv у звіті, TTL для старих версій статики.
- [x] Які JS-звички тут шкодять: `new Date()` локальний час як норма, `getMonth()+1`, `Date.now()` у мілісекундах, `toISOString()` завжди UTC (тут `isoformat` зберігає tz), moment/dayjs-ланцюжки.
