---
id: m6-l03
module: m6-stdlib-cli
title: "datetime, zoneinfo, UTC за замовчуванням"
summary: "Учень зберігає й рахує час як aware datetime в UTC, показує його в Europe/Kyiv через zoneinfo, парсить і форматує ISO 8601 без втрати зсуву, міряє тривалість через perf_counter і робить код з часом тестованим через інʼєкцію годинника."
duration_min: 75
prerequisites: [m6-l02]
---

## `date`, `time`, `datetime`, `timedelta`: незмінні значення замість `Date`

У JS один тип `Date`, і він водночас мітка часу (мілісекунди від епохи) і її подання в локальному поясі браузера. У модулі `datetime` чотири окремі типи: `date` це календарна дата без часу, `time` це час доби без дати, `datetime` це дата й час разом, `timedelta` це тривалість. Усі чотири незмінні, порівнюються операторами `<` і `==`, хешуються і можуть бути ключами словника. Місяці рахуються з одиниці.

```ts
const d = new Date(2026, 9, 18, 9, 30);   // 9 це жовтень
d.setDate(d.getDate() + 1);               // мутація на місці
console.log(d.getMonth() + 1, d.getDate());
console.log(new Date(2026, 1, 30).toDateString()); // Mon Mar 02 2026
```

```python
from datetime import date, datetime, time, timedelta

dt = datetime(2026, 10, 18, 9, 30)
nxt = dt + timedelta(days=1)
print(dt.month, nxt.day, dt)
print(datetime.combine(date(2026, 10, 18), time(9, 30)))
print(dt.date(), dt.time())
```

```text
10 19 2026-10-18 09:30:00
2026-10-18 09:30:00
2026-10-18 09:30:00
```

Розходяться три речі. Місяць `10` це жовтень, без `+ 1` і `- 1`. Додавання `timedelta` повертає новий об'єкт, а `dt` лишається тим, чим був; методу на кшталт `setDate` немає зовсім. І неіснуюча дата не "перетікає" в наступний місяць, як `new Date(2026, 1, 30)`, а одразу дає `ValueError`. Те саме з `replace`, який є єдиним способом "змінити" поле: він будує копію і валідує її.

```python live
from datetime import date, datetime, timedelta

dt = datetime(2026, 10, 18, 9, 30)
later = dt + timedelta(days=1, hours=2)
print(later)
print(later - dt, type(later - dt).__name__)
print(dt < later, dt == datetime(2026, 10, 18, 9, 30))
print(date(2026, 1, 31) + timedelta(days=1))
print(dt.replace(month=12, day=31), dt)
print({date(2026, 10, 18): "deploy"}[dt.date()])
```

```text
2026-10-19 11:30:00
1 day, 2:00:00 timedelta
True True
2026-02-01
2026-12-31 09:30:00 2026-10-18 09:30:00
deploy
```

> **Пастка.** Незмінність і валідація працюють разом. Присвоєння полю кидає `AttributeError`, а `replace` на неіснуючу дату кидає `ValueError`, навіть якщо після другої заміни дата стала б коректною: `replace(day=31, month=11)` перевіряється як 31 листопада, а не по черзі.

```python
from datetime import date, datetime

dt = datetime(2026, 10, 18, 9, 30)
try:
    dt.year = 2027
except AttributeError as e:
    print("AttributeError:", e)
try:
    date(2026, 2, 30)
except ValueError as e:
    print("ValueError:", e)
try:
    dt.replace(day=31, month=11)
except ValueError as e:
    print("ValueError:", e)
```

```text
AttributeError: attribute 'year' of 'datetime.date' objects is not writable
ValueError: day is out of range for month
ValueError: day is out of range for month
```

> **JS-аналог.** Модель `datetime` ближча до `Temporal`, ніж до `Date`. `Temporal.PlainDate` це `date`, `PlainTime` це `time`, `PlainDateTime` це `datetime` без поясу, `ZonedDateTime` це `datetime` з `ZoneInfo`, `Instant` це `datetime` з `tzinfo=UTC`, а `Duration` це `timedelta`, але без місяців і років (про це нижче). Незмінність і місяці з одиниці теж як у `Temporal`.

Одна дрібниця з ієрархії: `datetime` успадковується від `date`, тому `isinstance(dt, date)` дає `True`. Порівняти їх на порядок не можна, а `==` між ними завжди `False`. Якщо потрібно порівняти дату з моментом, явно беріть `dt.date()`.

```python
from datetime import date, datetime

d = date(2026, 10, 18)
dt = datetime(2026, 10, 18)
print(isinstance(dt, date), d == dt, dt.date() == d)
try:
    print(d < dt)
except TypeError as e:
    print("TypeError:", e)
```

```text
True False True
TypeError: can't compare datetime.datetime to datetime.date
```

## Naive і aware: UTC за замовчуванням

Документація Python ділить `datetime` на два види, і ці терміни офіційні: naive (без `tzinfo`, "наївний") і aware (з `tzinfo`, "обізнаний" про пояс). Naive datetime не означає ні UTC, ні локальний час. Це просто числа на циферблаті, а який пояс малось на увазі, знає лише автор коду. Aware datetime однозначно вказує момент на часовій осі.

```python
from datetime import UTC, datetime, timedelta, timezone

naive = datetime(2026, 10, 18, 9, 30)
aware = datetime(2026, 10, 18, 9, 30, tzinfo=UTC)
print(naive.isoformat(), aware.isoformat())
print(naive == aware)
try:
    print(naive < aware)
except TypeError as e:
    print("TypeError:", e)
try:
    print(aware - naive)
except TypeError as e:
    print("TypeError:", e)

same_moment = datetime(2026, 10, 18, 12, 30, tzinfo=timezone(timedelta(hours=3)))
print(same_moment == aware, same_moment - aware)
```

```text
2026-10-18T09:30:00 2026-10-18T09:30:00+00:00
False
TypeError: can't compare offset-naive and offset-aware datetimes
TypeError: can't subtract offset-naive and offset-aware datetimes
True 0:00:00
```

Змішати naive і aware в упорядкуванні чи арифметиці не можна, і це правильна поведінка: відповіді не існує. Рівність виняток не кидає, бо `==` у Python зобов'язаний повертати булеве значення (інакше такі об'єкти ламали б `in` і пошук у словнику), тому naive і aware просто ніколи не рівні. Два aware з різними зсувами порівнюються як моменти: `12:30+03:00` і `09:30+00:00` рівні, і різниця між ними нульова.

`datetime.now()` без аргументів повертає naive локальний час машини. На ноутбуці це Київ, у Docker-контейнері зазвичай UTC, на сервері як налаштовано. `datetime.now(UTC)` повертає aware UTC. `UTC` це псевдонім `timezone.utc`, доданий у 3.11, щоб не писати довгу форму. `datetime.utcnow()` повертає час в UTC, але naive, тобто без жодної позначки про це, і з 3.12 він офіційно застарілий з попередженням.

```python
import warnings
from datetime import UTC, datetime, timezone

print(datetime.now().tzinfo)
print(datetime.now(UTC).tzinfo)
print(UTC is timezone.utc)

with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    legacy = datetime.utcnow()
print(legacy.tzinfo)
print(caught[0].category.__name__, caught[0].message)
```

```text
None
UTC
True
None
DeprecationWarning datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
```

> **Пастка.** Методи, яким для роботи потрібен пояс, на naive datetime не падають, а мовчки підставляють локальний пояс машини. `naive.astimezone(UTC)` і `naive.timestamp()` дають різні результати на ноутбуці в Києві й на сервері в Нью-Йорку. Нижче той самий код, запущений з різною змінною оточення `TZ`.

```python
from datetime import UTC, datetime

naive = datetime(2026, 10, 18, 9, 30)
print(naive.astimezone(UTC))
print(naive.timestamp())
```

```text
# TZ=Europe/Kyiv
2026-10-18 06:30:00+00:00
1792305000.0
# TZ=America/New_York
2026-10-18 13:30:00+00:00
1792330200.0
```

Звідси правило, яке в бекенді приймають без обговорень: зберігати й рахувати в UTC, показувати в локальному. Усі мітки всередині системи aware і в UTC: у базі, у черзі, у логах, у JSON між сервісами. Одна вісь часу без літнього часу означає, що порівняння, сортування й віднімання завжди правильні. Переведення в пояс користувача відбувається один раз, на виході: у шаблоні звіту, в API-відповіді для конкретного користувача, у CLI. Naive datetime усередині системи це баг, який чекає на переїзд сервера в інший пояс.

```python live
from datetime import UTC, datetime, timedelta, timezone

kyiv_summer = timezone(timedelta(hours=3))
created = datetime(2026, 10, 18, 9, 30, tzinfo=UTC)

shown = created.astimezone(kyiv_summer)
print(shown, shown.tzname())
print(shown == created)
print(shown.astimezone(UTC))
```

```text
2026-10-18 12:30:00+03:00 UTC+03:00
True
2026-10-18 09:30:00+00:00
```

<!-- task: q1 -->

<!-- task: t2 -->

## `zoneinfo`: пояси за назвою і перехід на літній час

`timezone(timedelta(hours=3))` це фіксований зсув, і він не знає, що в жовтні Київ переходить на `+02:00`. Пояс за назвою (`Europe/Kyiv`) це правила: історія зсувів і дати переходу на літній час (DST, daylight saving time) з бази IANA tz database. Модуль `zoneinfo` (стандартна бібліотека з 3.9) читає цю базу і дає `ZoneInfo`, який підставляється в `tzinfo` так само, як `UTC`. Конвертація між поясами це `astimezone`: момент не змінюється, змінюється подання.

```python
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

KYIV = ZoneInfo("Europe/Kyiv")
created = datetime(2026, 10, 18, 9, 30, tzinfo=UTC)
local = created.astimezone(KYIV)
print(local, local.tzname(), local.utcoffset())
print(local == created)
print(created.astimezone(ZoneInfo("America/New_York")))
```

```text
2026-10-18 12:30:00+03:00 EEST 3:00:00
True
2026-10-18 05:30:00-04:00
```

У 2026 році Україна переводить годинник 29 березня з 03:00 на 04:00 і 25 жовтня з 04:00 на 03:00. Якщо йти по UTC годинами, видно обидві аномалії: навесні локальна година 03:xx не існує, восени 03:xx трапляється двічі. Друге входження позначається атрибутом `fold=1` (PEP 495, офіційна назва): це єдиний спосіб розрізнити дві однакові на вигляд локальні мітки.

```python
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

KYIV = ZoneInfo("Europe/Kyiv")
for h in range(3):
    u = datetime(2026, 3, 29, h, tzinfo=UTC)
    print(u.strftime("%H:%M UTC"), "->", u.astimezone(KYIV).strftime("%H:%M %Z %z"))
for h in range(3):
    u = datetime(2026, 10, 25, h, tzinfo=UTC)
    local = u.astimezone(KYIV)
    print(u.strftime("%H:%M UTC"), "->", local.strftime("%H:%M %Z %z"), "fold", local.fold)
```

```text
00:00 UTC -> 02:00 EET +0200
01:00 UTC -> 04:00 EEST +0300
02:00 UTC -> 05:00 EEST +0300
00:00 UTC -> 03:00 EEST +0300 fold 0
01:00 UTC -> 03:00 EET +0200 fold 1
02:00 UTC -> 04:00 EET +0200 fold 0
```

> **Пастка.** Арифметика двох datetime з тим самим `tzinfo` іде за настінним годинником (wall clock, жаргон для "що показує годинник на стіні") і ігнорує зміну зсуву. Від полудня 28 березня до полудня 29 березня в Києві `timedelta` покаже рівно добу, хоча фізично минуло 23 години. `+ timedelta(hours=24)` теж дає полудень наступного дня, а не 13:00. Реальну тривалість дає лише переведення в UTC.

```python
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

KYIV = ZoneInfo("Europe/Kyiv")
before = datetime(2026, 3, 28, 12, 0, tzinfo=KYIV)
after = before + timedelta(days=1)
print(before, after)
print(after - before)
print(after.astimezone(UTC) - before.astimezone(UTC))
print(before + timedelta(hours=24))
print((before.astimezone(UTC) + timedelta(hours=24)).astimezone(KYIV))
```

```text
2026-03-28 12:00:00+02:00 2026-03-29 12:00:00+03:00
1 day, 0:00:00
23:00:00
2026-03-29 12:00:00+03:00
2026-03-29 13:00:00+03:00
```

> **Під капотом.** `datetime` з `ZoneInfo` зберігає локальні поля (рік, місяць, ..., година) і посилання на правила, а не мітку в UTC. Якщо в операндів однаковий `tzinfo`, арифметика й порівняння працюють з локальними полями, як із naive; якщо різний, обидва спершу переводяться в UTC. Тому "додати день у календарі" (наступна зустріч о 12:00) і "додати 24 години" (TTL кешу) це різні операції, і друга завжди робиться в UTC. Неіснуючий час (`03:30` 29 березня) `datetime` приймає без помилки, а при переведенні в UTC і назад він стає `04:30`; неоднозначний час (`03:30` 25 жовтня) за замовчуванням трактується як перше входження, `fold=1` вибирає друге.

```python
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

KYIV = ZoneInfo("Europe/Kyiv")
gap = datetime(2026, 3, 29, 3, 30, tzinfo=KYIV)
print(gap, gap.astimezone(UTC).astimezone(KYIV))
first = datetime(2026, 10, 25, 3, 30, tzinfo=KYIV)
second = first.replace(fold=1)
print(first.astimezone(UTC), second.astimezone(UTC))
```

```text
2026-03-29 03:30:00+02:00 2026-03-29 04:30:00+03:00
2026-10-25 00:30:00+00:00 2026-10-25 01:30:00+00:00
```

<!-- task: q3 -->

До 3.9 пояси за назвою давав сторонній `pytz`, і в старому коді й відповідях на Stack Overflow він досі скрізь. Його API несумісний із протоколом `tzinfo`: зону не можна передати в конструктор `datetime(..., tzinfo=pytz.timezone(...))`, бо отримаєте історичний місцевий сонячний час (LMT) зі зсувом у дивні хвилини, а не EET. Замість цього треба було викликати `tz.localize(naive)` і після кожної арифметики `tz.normalize(dt)`. `zoneinfo` працює зі звичайним `tzinfo=` і `astimezone` без ритуалів, тому для нового коду `pytz` не потрібен, а в старому його замінюють.

Сам `zoneinfo` бази не містить. Він шукає файли поясів у системних каталогах зі списку `zoneinfo.TZPATH`, а якщо там нічого немає, у пакеті `tzdata` з PyPI. На macOS і в повних Linux-дистрибутивах база лежить у `/usr/share/zoneinfo`. У мінімальних Docker-образах (alpine, частина slim-образів) і на Windows її може не бути, і тоді `ZoneInfo("Europe/Kyiv")` падає. Нижче ця ситуація відтворена: шлях пошуку обнулено, пакета `tzdata` немає.

```python
import zoneinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

print(zoneinfo.TZPATH)
print("Europe/Kyiv" in zoneinfo.available_timezones())
try:
    ZoneInfo("Europe/Kyyiv")
except ZoneInfoNotFoundError as e:
    print("ZoneInfoNotFoundError:", e)

zoneinfo.reset_tzpath(to=[])
try:
    ZoneInfo.no_cache("Europe/Kyiv")
except ZoneInfoNotFoundError as e:
    print("ZoneInfoNotFoundError:", e)
print(issubclass(ZoneInfoNotFoundError, KeyError))
```

```text
('/usr/share/zoneinfo', '/usr/lib/zoneinfo', '/usr/share/lib/zoneinfo', '/etc/zoneinfo')
True
ZoneInfoNotFoundError: 'No time zone found with key Europe/Kyyiv'
ZoneInfoNotFoundError: 'No time zone found with key Europe/Kyiv'
True
```

> **Для капстоуну.** Додайте `tzdata` у залежності проєкту (`uv add tzdata`). Це кілька сотень кілобайт, які роблять поведінку однаковою на macOS, у будь-якому Docker-образі і в CI. Системна база, якщо вона є, однаково має пріоритет; пакет лише страхує. З тієї ж причини в браузерних завданнях цього уроку пояси задані фіксованими зсувами: у Pyodide бази поясів за замовчуванням немає.

## Формат і парсинг: `isoformat`, `strftime` і f-рядки

Обмін датами між сервісами йде у форматі ISO 8601. У JS `toISOString()` завжди переводить у UTC і завжди пише мілісекунди та `Z`. У Python `isoformat()` пише те, що є в об'єкті: зсув зберігається, мікросекунди з'являються лише якщо вони ненульові, а naive datetime виходить взагалі без зсуву.

```ts
new Date("2026-10-18T12:30:05+03:00").toISOString(); // '2026-10-18T09:30:05.000Z'
```

```python
from datetime import UTC, datetime, timedelta, timezone

dt = datetime(2026, 10, 18, 9, 30, 5, 123456, tzinfo=UTC)
print(dt.isoformat())
print(dt.isoformat(timespec="seconds"))
print(dt.isoformat(timespec="milliseconds"))
print(dt.astimezone(timezone(timedelta(hours=3))).isoformat(timespec="seconds"))
print(datetime(2026, 10, 18, 9, 30).isoformat())
```

```text
2026-10-18T09:30:05.123456+00:00
2026-10-18T09:30:05+00:00
2026-10-18T09:30:05.123+00:00
2026-10-18T12:30:05+03:00
2026-10-18T09:30:00
```

Розходження в тому, що `isoformat` не нормалізує: якщо об'єкт у `+03:00`, рядок теж буде в `+03:00`. Саме тому `to_utc` на межі перед серіалізацією важливий. UTC Python пише як `+00:00`, а не `Z`; обидва варіанти коректний ISO 8601, і `Date.parse` у JS розуміє обидва. Формат мікросекунд відрізняється від JS-ових мілісекунд, тому для контракту з фронтендом зручно фіксувати `timespec="milliseconds"`.

`datetime.fromisoformat` з 3.11 розуміє майже весь ISO 8601, зокрема `Z` у кінці (до 3.11 він приймав лише те, що сам генерував, і `Z` ламав парсинг). Рядок зі зсувом дає aware, рядок без зсуву дає naive, рядок з датою дає північ.

```python live
from datetime import datetime

print(datetime.fromisoformat("2026-10-18T09:30:05.123Z"))
print(datetime.fromisoformat("2026-10-18T12:30:05+03:00"))
print(datetime.fromisoformat("2026-10-18 12:30"))
print(datetime.fromisoformat("2026-10-18"))
print(datetime.fromisoformat("2026-10-18T09:30:05Z").tzinfo)
try:
    datetime.fromisoformat("18.10.2026")
except ValueError as e:
    print("ValueError:", e)
```

```text
2026-10-18 09:30:05.123000+00:00
2026-10-18 12:30:05+03:00
2026-10-18 12:30:00
2026-10-18 00:00:00
UTC
ValueError: Invalid isoformat string: '18.10.2026'
```

> **Пастка.** Naive ISO-рядок у JSON-відповіді фронтенд прочитає як свій локальний час: `new Date("2026-10-18T09:30:00")` у браузері в Києві це 06:30 UTC, у Лісабоні 08:30 UTC. Якщо бекенд мав на увазі UTC, різниця в кілька годин з'являється без жодної помилки. Мітка без зсуву в контракті API це помилка контракту, а не стиль.

Для довільних форматів є пара `strftime` (format, об'єкт у рядок) і `strptime` (parse, рядок в об'єкт) з кодами в стилі C: `%Y` рік, `%m` місяць, `%d` день, `%H:%M:%S` час, `%z` зсув як `+0300`, `%Z` назва поясу, `%a`/`%A` день тижня, `%j` день року, `%V` ISO-тиждень. Ті самі коди працюють як специфікатор формату у f-рядку `f"{dt:%d.%m.%Y}"`, бо `datetime.__format__` передає специфікацію в `strftime` (механізм розібраний у m1-l04). `strptime` без `%z` у шаблоні завжди дає naive.

```python
from datetime import UTC, datetime, timedelta, timezone

dt = datetime(2026, 10, 18, 9, 30, 5, tzinfo=UTC)
local = dt.astimezone(timezone(timedelta(hours=3)))
print(dt.strftime("%Y-%m-%d %H:%M:%S%z"))
print(local.strftime("%d.%m.%Y %H:%M (%z)"))
print(f"{local:%d.%m.%Y %H:%M}")
print(dt.strftime("%a %b %d, day %j, week %V"))

print(repr(datetime.strptime("18.10.2026 12:30", "%d.%m.%Y %H:%M")))
print(repr(datetime.strptime("2026-10-18 12:30:00+0300", "%Y-%m-%d %H:%M:%S%z")))
try:
    datetime.strptime("2026-10-18", "%d.%m.%Y")
except ValueError as e:
    print("ValueError:", e)
```

```text
2026-10-18 09:30:05+0000
18.10.2026 12:30 (+0300)
18.10.2026 12:30
Sun Oct 18, day 291, week 42
datetime.datetime(2026, 10, 18, 12, 30)
datetime.datetime(2026, 10, 18, 12, 30, tzinfo=datetime.timezone(datetime.timedelta(seconds=10800)))
ValueError: time data '2026-10-18' does not match format '%d.%m.%Y'
```

> **Пастка.** `%a`, `%A`, `%b`, `%B` залежать від локалі процесу (`locale.setlocale`), а `strptime` з ними на іншій локалі не розпарсить рядок. Для машинних форматів використовуйте лише числові коди, для людських назв місяців українською краще явний словник у шаблоні, ніж глобальна локаль процесу.

<!-- task: t1 -->

## Unix time і вимірювання тривалості

Unix time у Python рахується в секундах, а не в мілісекундах, і це `float`. `dt.timestamp()` перетворює aware datetime у секунди від епохи, `datetime.fromtimestamp(ts, tz=UTC)` назад. Без `tz=` результат буде naive локальним, і тоді відтворюється пастка з попереднього розділу.

```ts
Date.now();                          // 1792315800123, мілісекунди
new Date(1792315800123).toISOString();
```

```python
from datetime import UTC, datetime

dt = datetime(2026, 10, 18, 9, 30, tzinfo=UTC)
print(dt.timestamp())
print(datetime.fromtimestamp(1792315800.0, tz=UTC))

js_ms = 1792315800123
print(datetime.fromtimestamp(js_ms / 1000, tz=UTC))
print(int(dt.timestamp() * 1000))
try:
    datetime.fromtimestamp(js_ms, tz=UTC)
except ValueError as e:
    print("ValueError:", e)
```

```text
1792315800.0
2026-10-18 09:30:00+00:00
2026-10-18 09:30:00.123000+00:00
1792315800000
ValueError: year 58766 is out of range
```

Межа з JS це завжди множення або ділення на 1000. Мілісекунди, передані як секунди, дають рік 58766 і `ValueError`, а секунди, передані в `new Date(...)` на фронтенді, дають січень 1970 без жодної помилки. У контракті API назва поля має містити одиницю (`created_at_ms`), або краще передавати ISO-рядок.

Для вимірювання тривалості `datetime.now()` і `time.time()` не годяться: обидва читають системний годинник, який можна переставити (NTP-синхронізація, ручне налаштування, перехід віртуальної машини). Різниця двох таких читань може бути від'ємною або стрибнути на хвилини. `time.monotonic()` гарантовано не йде назад; `time.perf_counter()` теж монотонний і має найкращу доступну роздільність, тому для замірів беруть його. Абсолютне значення обох нічого не означає, має сенс лише різниця.

```python
import time

for name in ("time", "monotonic", "perf_counter"):
    print(name, "adjustable:", time.get_clock_info(name).adjustable)

started = time.perf_counter()
time.sleep(0.2)
print(f"{time.perf_counter() - started:.1f}s")
```

```text
time adjustable: True
monotonic adjustable: False
perf_counter adjustable: False
0.2s
```

> **JS-аналог.** `time.perf_counter()` це `performance.now()`, тільки в секундах. `time.time()` це `Date.now() / 1000`. `time.time_ns()` і `time.perf_counter_ns()` повертають `int` наносекунд для випадків, де `float` втрачає точність.

## `timedelta`: тривалість без місяців, округлення до дня

`timedelta` зберігає три поля: `days`, `seconds` (від 0 до 86399) і `microseconds`; усі аргументи конструктора (`weeks`, `hours`, `minutes`, `milliseconds`) нормалізуються в ці три. Звідси перша пастка: атрибут `.seconds` це не тривалість у секундах, а залишок після цілих днів. Повну тривалість дає `total_seconds()`. Ділення `timedelta` на `timedelta` дає число, цілочислове ділення дає кількість цілих інтервалів.

```python live
from datetime import timedelta

td = timedelta(hours=26, minutes=5)
print(td, repr(td))
print(td.days, td.seconds, td.total_seconds())

neg = timedelta(hours=-1)
print(neg, neg.seconds, neg.total_seconds())

print(timedelta(weeks=2) / timedelta(days=1))
print(timedelta(minutes=90) // timedelta(hours=1), timedelta(minutes=90) % timedelta(hours=1))
print(timedelta(hours=1) * 1.5, abs(neg))
```

```text
1 day, 2:05:00 datetime.timedelta(days=1, seconds=7500)
1 7500 93900.0
-1 day, 23:00:00 82800 -3600.0
14.0
1 0:30:00
1:30:00 1:00:00
```

<!-- task: q2 -->

Місяців і років у `timedelta` немає, бо це не тривалості: місяць має від 28 до 31 дня, рік 365 або 366, і "31 січня плюс місяць" не має єдиної відповіді. `timedelta` зберігає фіксовану кількість мікросекунд, тож усе, що в ньому є, має однакову довжину завжди. Календарну арифметику доведеться писати явно, і `replace(month=...)` чесно падає на неіснуючій даті. Якщо таких операцій багато, сторонній пакет `python-dateutil` дає `relativedelta(months=+1)`, який обрізає 31 січня до 28 лютого.

```python
from datetime import date, timedelta

try:
    timedelta(months=1)
except TypeError as e:
    print("TypeError:", e)
try:
    date(2026, 1, 31).replace(month=2)
except ValueError as e:
    print("ValueError:", e)
```

```text
TypeError: 'months' is an invalid keyword argument for __new__()
ValueError: day is out of range for month
```

Методу `round` чи `floor` у `datetime` немає. Обрізання (truncation) до початку дня чи години робиться через `replace` з нулями або `datetime.combine(d, time.min, tzinfo=...)`. Округлення до довільного кроку, наприклад до 15 хвилин для групування метрик, це цілочислове ділення відстані від епохи на крок. Початок локального дня в UTC вимагає двох кроків: обрізати в локальному поясі, потім перевести.

```python
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

dt = datetime(2026, 10, 18, 14, 47, 31, 500000, tzinfo=UTC)
print(dt.replace(hour=0, minute=0, second=0, microsecond=0))
print(datetime.combine(dt.date(), time.min, tzinfo=UTC))
print(dt.replace(minute=0, second=0, microsecond=0))

step = timedelta(minutes=15)
epoch = datetime(1970, 1, 1, tzinfo=UTC)
print(epoch + (dt - epoch) // step * step)

KYIV = ZoneInfo("Europe/Kyiv")
local_midnight = datetime.combine(dt.astimezone(KYIV).date(), time.min, tzinfo=KYIV)
print(local_midnight, local_midnight.astimezone(UTC))
```

```text
2026-10-18 00:00:00+00:00
2026-10-18 00:00:00+00:00
2026-10-18 14:00:00+00:00
2026-10-18 14:45:00+00:00
2026-10-18 00:00:00+03:00 2026-10-17 21:00:00+00:00
```

<!-- task: t4 -->

## Діапазони дат, тиждень і `calendar`

`range` для дат немає. Ідіоматична заміна це генератор (детально в m5-l02), який крокує `timedelta(days=1)` від початку до кінця напіввідкритого інтервалу. Довжину місяців і високосні роки враховує `date`, а генератор не будує список, тож рік днів коштує стільки ж пам'яті, скільки тиждень.

```python live
from collections.abc import Iterator
from datetime import date, timedelta


def days(start: date, end: date) -> Iterator[date]:
    current = start
    while current < end:
        yield current
        current += timedelta(days=1)


for d in days(date(2026, 10, 16), date(2026, 10, 20)):
    print(d, d.strftime("%a"), d.weekday(), d.isoweekday())
print(sum(1 for _ in days(date(2026, 1, 1), date(2027, 1, 1))))
```

```text
2026-10-16 Fri 4 5
2026-10-17 Sat 5 6
2026-10-18 Sun 6 7
2026-10-19 Mon 0 1
365
```

Тиждень у Python починається з понеділка. `weekday()` повертає 0 для понеділка і 6 для неділі, `isoweekday()` за ISO 8601 повертає 1..7. У JS `getDay()` дає 0 для неділі, і перенесена напряму перевірка `day === 0 || day === 6` на вихідні в Python ловить понеділок і неділю. Понеділок поточного тижня це `d - timedelta(days=d.weekday())`, а номер ISO-тижня дає `isocalendar()`.

```python
from datetime import date, timedelta

today = date(2026, 10, 18)
monday = today - timedelta(days=today.weekday())
print(monday, monday.strftime("%A"))
print(today.isocalendar())
print(today.isocalendar().week)
```

```text
2026-10-12 Monday
datetime.IsoCalendarDate(year=2026, week=42, weekday=7)
42
```

Модуль `calendar` потрібен рідко, але дві речі з нього корисні: `monthrange(year, month)` повертає день тижня першого числа і кількість днів у місяці, `isleap` перевіряє високосний рік. Ще він друкує текстовий календар, у якому перший день тижня теж понеділок (`calendar.firstweekday()` дає `0`, змінюється через `setfirstweekday`).

```python
import calendar

print(calendar.monthrange(2026, 2))
print(calendar.monthrange(2028, 2)[1], calendar.isleap(2028))
print(calendar.firstweekday())
print(calendar.month(2026, 10))
```

```text
(calendar.SUNDAY, 28)
29 True
0
    October 2026
Mo Tu We Th Fr Sa Su
          1  2  3  4
 5  6  7  8  9 10 11
12 13 14 15 16 17 18
19 20 21 22 23 24 25
26 27 28 29 30 31
```

<!-- task: q4 -->

<!-- task: t3 -->

## datetime на межах системи: JSON, Pydantic, SQLite, тести

У JSON немає типу дати, і `json.dumps` на `datetime` падає. Стандартне рішення це `default=`, функція, яку `json` викликає для кожного незнайомого об'єкта; для дат вона повертає `isoformat()`. Назад `json.loads` дає рядок, і перетворити його в `datetime` треба явно. Повний розбір `default=` і `object_hook` в m6-l02.

```python
import json
from datetime import UTC, date, datetime

job = {"id": "build-1", "created_at": datetime(2026, 10, 18, 9, 30, tzinfo=UTC)}
try:
    json.dumps(job)
except TypeError as e:
    print("TypeError:", e)


def encode(value: object) -> str:
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(f"not serializable: {type(value).__name__}")


raw = json.dumps(job, default=encode)
print(raw)
back = json.loads(raw)
print(type(back["created_at"]).__name__, datetime.fromisoformat(back["created_at"]) == job["created_at"])
```

```text
TypeError: Object of type datetime is not JSON serializable
{"id": "build-1", "created_at": "2026-10-18T09:30:00+00:00"}
str True
```

Pydantic (m2-l09) робить обидва напрями сам: поле `datetime` приймає ISO-рядок, зокрема з `Z`, і навіть Unix time числом, а `model_dump_json` пише ISO, причому UTC як `Z`. Але звичайне поле `datetime` мовчки приймає й naive рядок. Тип `AwareDatetime` з Pydantic відхиляє мітки без зсуву на межі API, і саме його варто ставити в моделі запитів.

```python
from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, ValidationError


class Job(BaseModel):
    id: str
    created_at: datetime


job = Job.model_validate_json('{"id": "build-1", "created_at": "2026-10-18T12:30:00+03:00"}')
print(repr(job.created_at))
print(job.model_dump_json())
print(Job(id="b", created_at=datetime(2026, 10, 18, 9, 30, tzinfo=UTC)).model_dump_json())
print(Job(id="c", created_at=1792315800).created_at)
print(Job(id="d", created_at="2026-10-18T09:30:00").created_at.tzinfo)


class StrictJob(BaseModel):
    id: str
    created_at: AwareDatetime


try:
    StrictJob(id="e", created_at="2026-10-18T09:30:00")
except ValidationError as e:
    print(e.errors()[0]["type"], "-", e.errors()[0]["msg"])
```

```text
datetime.datetime(2026, 10, 18, 12, 30, tzinfo=TzInfo(10800))
{"id":"build-1","created_at":"2026-10-18T12:30:00+03:00"}
{"id":"b","created_at":"2026-10-18T09:30:00Z"}
2026-10-18 09:30:00+00:00
None
timezone_aware - Input should have timezone info
```

У SQLite окремого типу дати теж немає, і `datetime` зберігають як ISO-рядок (детально в m6-l08). Причина зберігати саме в UTC практична: рядки в одному зсуві й одному форматі сортуються лексикографічно в тому самому порядку, що й моменти, тож `ORDER BY created_at` і `WHERE created_at < ?` працюють на рядках. Змішані зсуви цей порядок ламають.

```python
from datetime import UTC, datetime

a = datetime.fromisoformat("2026-10-18T12:30:00+03:00")
b = datetime.fromisoformat("2026-10-18T10:00:00+00:00")
print(a < b, a.isoformat() < b.isoformat())
print(a.astimezone(UTC).isoformat() < b.astimezone(UTC).isoformat())
```

```text
True False
True
```

Код, що сам викликає `datetime.now(UTC)`, не протестувати без патчів. Чистіше зробити годинник залежністю (dependency injection): функція приймає `clock: Callable[[], datetime]` зі справжнім значенням за замовчуванням, а тест передає `lambda: FIXED`. Якщо годинник розкиданий по чужому коду, беруть `freezegun` або `time-machine`, які підміняють поточний час для всього процесу; обидва і пастки `patch("module.datetime")` розібрані в m3-l04.

```python live
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


def is_expired(created_at: datetime, ttl: timedelta, clock: Clock = utc_now) -> bool:
    return clock() - created_at > ttl


created = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
fixed = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
print(is_expired(created, timedelta(days=14), clock=lambda: fixed))
print(is_expired(created, timedelta(days=30), clock=lambda: fixed))
```

```text
True
False
```

<!-- task: t5 -->

## Для капстоуну

Задача генерації статики в бекенді FormBuilder має три часові поля: `created_at` і `finished_at` як aware UTC з годинника-залежності, і `duration_s`, виміряну через `perf_counter`, а не як різницю двох `datetime`. Звіт для людей переводить `created_at` у `Europe/Kyiv` в останній момент. TTL старих версій статики це порівняння в UTC з тим самим годинником. Нижче дві задачі по обидва боки переходу на зимовий час: в UTC між ними година, а на київському годиннику обидві о 03:30, і лише `%Z` показує різницю.

```python
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

Clock = Callable[[], datetime]
KYIV = ZoneInfo("Europe/Kyiv")


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class GenerationJob:
    id: str
    created_at: datetime
    finished_at: datetime | None = None
    duration_s: float | None = None


def run_job(job_id: str, render: Callable[[], None], clock: Clock = utc_now) -> GenerationJob:
    job = GenerationJob(id=job_id, created_at=clock())
    started = time.perf_counter()
    render()
    job.duration_s = time.perf_counter() - started
    job.finished_at = clock()
    return job


def report_line(job: GenerationJob) -> str:
    local = job.created_at.astimezone(KYIV)
    return f"{job.id}  {local:%d.%m.%Y %H:%M %Z}  {job.duration_s:.1f}s"


def expired_versions(versions: dict[str, datetime], ttl: timedelta, clock: Clock = utc_now) -> list[str]:
    cutoff = clock() - ttl
    return [version for version, created in versions.items() if created < cutoff]


ticks = iter([
    datetime(2026, 10, 25, 0, 30, tzinfo=UTC),
    datetime(2026, 10, 25, 0, 30, 1, tzinfo=UTC),
    datetime(2026, 10, 25, 1, 30, tzinfo=UTC),
    datetime(2026, 10, 25, 1, 30, 1, tzinfo=UTC),
])
clock = lambda: next(ticks)
jobs = [run_job("build-7", lambda: time.sleep(0.2), clock), run_job("build-8", lambda: time.sleep(0.1), clock)]
for job in jobs:
    print(job.created_at.isoformat(), "->", report_line(job))

versions = {
    "v1": datetime(2026, 9, 1, tzinfo=UTC),
    "v2": datetime(2026, 10, 10, tzinfo=UTC),
    "v3": datetime(2026, 10, 24, tzinfo=UTC),
}
print(expired_versions(versions, timedelta(days=30), clock=lambda: datetime(2026, 10, 25, tzinfo=UTC)))
```

```text
2026-10-25T00:30:00+00:00 -> build-7  25.10.2026 03:30 EEST  0.2s
2026-10-25T01:30:00+00:00 -> build-8  25.10.2026 03:30 EET  0.1s
['v1']
```

> **Для капстоуну.** У моделях запитів FastAPI поля часу оголошуйте як `AwareDatetime`, а перед записом у SQLite проганяйте через `to_utc`. Тоді в базі не буде naive рядків і рядків у `+03:00`, а сортування за `created_at` в SQL збігатиметься з порядком подій. Пояс для показу (`Europe/Kyiv`) це налаштування застосунку (m6-l06), а не константа в коді звіту.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`datetime.now()` як "поточний час".** За звичкою з `new Date()` беруть локальний час машини. Результат naive і залежить від поясу сервера. Правильно: `datetime.now(UTC)`.

   ```python
   created_at = datetime.now()      # naive, пояс машини
   created_at = datetime.now(UTC)   # aware UTC
   ```

2. **`+ 1` і `- 1` до місяця.** Звичка з `getMonth() + 1` дає листопад замість жовтня. У Python місяці з одиниці, а неіснуюча дата кидає `ValueError` замість перенесення в наступний місяць.

   ```python
   datetime(2026, 10, 18).month          # 10, без поправок
   date(2026, 2, 30)                     # ValueError: day is out of range for month
   ```

3. **Мілісекунди замість секунд.** `Date.now()` переносять як є, і `fromtimestamp` отримує число в тисячу разів більше. Правильно: ділити на 1000 і завжди передавати `tz=UTC`.

   ```python
   datetime.fromtimestamp(1792315800123, tz=UTC)          # ValueError: year 58766 is out of range
   datetime.fromtimestamp(1792315800123 / 1000, tz=UTC)   # 2026-10-18 09:30:00.123000+00:00
   ```

4. **Очікування, що `isoformat()` поверне UTC з `Z`, як `toISOString()`.** Він повертає зсув об'єкта, а для naive взагалі без зсуву, і фронтенд прочитає такий рядок як свій локальний час. Правильно: нормалізувати в UTC перед серіалізацією і ніколи не віддавати naive.

   ```python
   local.isoformat()                    # '2026-10-18T12:30:05+03:00'
   local.astimezone(UTC).isoformat()    # '2026-10-18T09:30:05+00:00'
   ```

5. **`.seconds` замість `total_seconds()`.** Інтуїція "поле з назвою seconds і є тривалість" ламається на інтервалах понад добу і на від'ємних. Правильно: `total_seconds()`.

   ```python
   timedelta(days=1, seconds=10).seconds           # 10
   timedelta(days=1, seconds=10).total_seconds()   # 86410.0
   ```

6. **Тривалість через `datetime.now()` до і після.** З `Date.now() - start` переносять у Python різницю двох `datetime`. Системний годинник можна переставити, і на переході на літній час з naive локальним часом "тривалість" зсувається на годину. Правильно: `time.perf_counter()`.

   ```python
   started = time.perf_counter()
   render()
   duration_s = time.perf_counter() - started
   ```

7. **Ланцюжки в стилі moment/dayjs.** Шукають `dt.add(1, "month").startOf("day")` або сторонню бібліотеку для простих речей. У стандартній бібліотеці це `+ timedelta`, `replace` і `datetime.combine(d, time.min, tzinfo=...)`; місяці явно або через `relativedelta`.

   ```python
   start_of_day = datetime.combine(dt.date(), time.min, tzinfo=UTC)
   next_week = dt + timedelta(weeks=1)
   ```

8. **`getDay() === 0` як неділя.** Перенесена перевірка вихідних ловить понеділок. Правильно: `weekday() >= 5` або `isoweekday() in (6, 7)`.

   ```python
   date(2026, 10, 18).weekday()      # 6, неділя
   date(2026, 10, 19).weekday()      # 0, понеділок
   ```

## Підсумок

- Чотири незмінні типи: `date`, `time`, `datetime`, `timedelta`; місяці з одиниці; неіснуюча дата дає `ValueError`, а не перенесення.
- Naive не має поясу взагалі; naive і aware не впорядковуються (`TypeError`), а `==` між ними завжди `False`.
- `datetime.now(UTC)` замість `datetime.now()` і застарілого `utcnow()`; на naive `astimezone` і `timestamp` мовчки беруть пояс машини.
- Зберігати й рахувати в UTC, показувати в локальному через `astimezone(ZoneInfo("Europe/Kyiv"))` на виході.
- Арифметика в одному `ZoneInfo` іде за настінним годинником; реальна тривалість через DST лише в UTC; `fold` розрізняє повторну годину.
- `pytz` застарів; `zoneinfo` бере базу з системи або з пакета `tzdata`, який варто додати в залежності.
- `isoformat` зберігає зсув, `fromisoformat` з 3.11 розуміє `Z`; `strptime` без `%z` дає naive.
- Unix time у секундах (`float`), межа з JS це `/ 1000`; тривалість через `perf_counter`, не через `datetime`.
- `timedelta` без місяців і років; `.seconds` це залишок, тривалість це `total_seconds()`; обрізання через `replace` або `combine(..., time.min)`.
- Годинник як залежність `Clock = Callable[[], datetime]`; на межах API `AwareDatetime`, у SQLite ISO-рядки в UTC.

## Що далі

Наступний урок m6-l04 про модуль `re` і відмінності від JS `RegExp`. Там знадобиться звичка з цього уроку не парсити вручну те, для чого є готовий парсер: дати з рядка дістають `fromisoformat` або `strptime`, а регулярний вираз лише знаходить фрагмент. Мітки часу в UTC і ISO-формат повернуться в m6-l08, де історія збірок ляже в SQLite, і в m7, де `AwareDatetime` стоїть у моделях запитів FastAPI.
