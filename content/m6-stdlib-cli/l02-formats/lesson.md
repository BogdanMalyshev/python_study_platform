---
id: m6-l02
module: m6-stdlib-cli
title: "json, csv, tomllib, yaml: формати даних на межі програми"
summary: "Учень читає й пише JSON, CSV, TOML і YAML без сюрпризів: файли й помилки парсингу, власні типи через default= і object_hook, CSV для Excel з BOM і newline=\"\", конфіги через tomllib, YAML лише через safe_load, JSON Lines для великих обсягів, і знає, де валідувати дані й чому не pickle."
duration_min: 75
prerequisites: [m6-l01]
---

## json: файли, помилки і де `JSON.parse` поводиться інакше

Основу `json` ви бачили в m2-l01: таблиця "JSON → Python" при читанні, `dumps` з `ensure_ascii=False`, `indent` і `sort_keys`, `TypeError` для множини й рядкові ключі після round-trip. Тут те, що лишилось для реальної роботи: файли, помилки парсингу, крайові випадки чисел і власні типи.

Модуль має дві пари функцій, і різниця між ними лише в джерелі. `loads`/`dumps` працюють з рядком (літера `s` від string), `load`/`dump` з файловим об'єктом, тобто з будь-чим, що має `.read()` або `.write()`. Аналога `require("./config.json")` чи `import config from "./config.json" with { type: "json" }` немає: файл відкривається явно, з `encoding` (m6-l01), і парситься.

```ts
import { readFileSync, writeFileSync } from "node:fs";

const config = JSON.parse(readFileSync("form.json", "utf-8"));
writeFileSync("form.json", JSON.stringify(config, null, 2) + "\n");
```

```python
import json
from pathlib import Path

path = Path("form.json")
with path.open(encoding="utf-8") as f:
    config = json.load(f)
with path.open("w", encoding="utf-8") as f:
    json.dump(config, f, ensure_ascii=False, indent=2)
    f.write("\n")
```

`JSON.stringify(obj, null, 2)` перекладається як `indent=2`, і всі параметри після `obj` у `dumps` тільки іменовані: позиційне `json.dumps(obj, None, 2)` дає `TypeError`. Другого аргументу, replacer, як такого немає, його роль грає `default=`, і працює він інакше (наступний розділ). `json.dump` не дописує перевід рядка в кінці, тож для файлів під git його додають самі. І `json.load(f)` всередині це буквально `loads(f.read())`: файл читається в пам'ять цілком, жодного потокового парсингу в stdlib немає (як з цим жити, у розділі про JSON Lines).

```python live
import json
import tempfile
from pathlib import Path

config = {"id": "signup", "title": "Реєстрація", "fields": [{"name": "email", "required": True}]}

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "form.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(path.read_text(encoding="utf-8"), end="")

    with path.open(encoding="utf-8") as f:
        print(json.load(f) == config)
    print(json.loads(path.read_bytes())["title"])
```

```text
{
  "id": "signup",
  "title": "Реєстрація",
  "fields": [
    {
      "name": "email",
      "required": true
    }
  ]
}
True
Реєстрація
```

`json.loads` приймає і `bytes`: кодування UTF-8, UTF-16 чи UTF-32 він визначає сам за першими байтами. Тому `json.loads(path.read_bytes())` чи `json.loads(response.content)` працюють без ручного `decode`.

Невалідний JSON дає `json.JSONDecodeError`. Це підклас `ValueError`, тому `except ValueError` його теж ловить, але власний клас корисніший: у нього є `msg`, `lineno`, `colno` і `pos`, тобто точне місце помилки для повідомлення користувачу. Тексти повідомлень свої, не схожі на `Unexpected token` з V8, і варто впізнавати кілька найчастіших.

```python live
import json

broken = ['{"a": 1,}', "{'a': 1}", '{"a": undefined}', "", '{"a": 1}\n{"b": 2}']
for text in broken:
    try:
        json.loads(text)
    except json.JSONDecodeError as e:
        print(f"{text!r:22} line {e.lineno} col {e.colno}: {e.msg}")
print(issubclass(json.JSONDecodeError, ValueError))
```

```text
'{"a": 1,}'            line 1 col 9: Expecting property name enclosed in double quotes
"{'a': 1}"             line 1 col 2: Expecting property name enclosed in double quotes
'{"a": undefined}'     line 1 col 7: Expecting value
''                     line 1 col 1: Expecting value
'{"a": 1}\n{"b": 2}'   line 2 col 1: Extra data
True
```

Кома в кінці й одинарні лапки це звички з JS-літералів і JSON5, які стандартний JSON не приймає. Порожній рядок це теж помилка, а не `None`: порожнє тіло запиту треба перевіряти до парсингу. `Extra data` означає, що після першого документа в рядку є ще щось; саме з цим ви зіткнетесь, якщо віддати файл JSON Lines у `json.loads` цілком.

<!-- task: t1 -->

Тепер про те, де Python-овий `json` поводиться не так, як `JSON.parse` і `JSON.stringify`. Розходжень три: спеціальні float-значення, великі цілі й відсутність `undefined`.

```ts
JSON.stringify({ a: NaN, b: Infinity, c: undefined, d: null }); // '{"a":null,"b":null,"d":null}'
JSON.parse('{"id": 12345678901234567890}').id;                 // 12345678901234567000
JSON.parse('{"x": NaN}');                                       // SyntaxError
```

```python
import json

print(json.dumps({"a": float("nan"), "b": float("inf"), "d": None}))
print(json.loads('{"id": 12345678901234567890}')["id"])
print(json.loads('{"x": NaN, "y": -Infinity}'))
```

```text
{"a": NaN, "b": Infinity, "d": null}
12345678901234567890
{'x': nan, 'y': -inf}
```

Стандарт JSON (RFC 8259) не має `NaN` і `Infinity`, а Python за замовчуванням пише й читає їх як розширення. JS у той самий момент мовчки заміняє їх на `null`, а `JSON.parse` на `NaN` падає. Цілі числа Python зберігає точно в обидва боки, бо `int` не має межі (m1-l02); проблема виникає на іншому боці, де `Number` тримає лише 53 біти. `undefined` у Python немає: `None` стає `null`, і ключ лишається в об'єкті, тоді як `JSON.stringify` поля зі значенням `undefined` прибирає.

> **Пастка.** Ендпоінт FastAPI, який порахував конверсію `0 / 0` через numpy або `float("nan")` з даних, віддасть `{"rate": NaN}`, і `response.json()` у браузері впаде з `SyntaxError`. На межі з JS передавайте `allow_nan=False`: тоді помилка буде на сервері, де видно причину. З тієї ж серії великі id: `2**63` у JSON доходить до фронтенду зіпсованим, тому id, що не вміщаються в 53 біти, віддають рядком.

```python live
import json
from decimal import Decimal

try:
    json.dumps({"rate": float("nan")}, allow_nan=False)
except ValueError as e:
    print("ValueError:", e)

prices = json.loads('{"price": 0.1, "fee": 0.2, "qty": 3}', parse_float=Decimal)
print(prices)
print(0.1 + 0.2, prices["price"] + prices["fee"])

lead = {"email": "a@b.c", "phone": None}
print(json.dumps(lead))
print(json.dumps({k: v for k, v in lead.items() if v is not None}))
print(json.dumps(lead, separators=(",", ":")))
```

```text
ValueError: Out of range float values are not JSON compliant: nan
{'price': Decimal('0.1'), 'fee': Decimal('0.2'), 'qty': 3}
0.30000000000000004 0.3
{"email": "a@b.c", "phone": null}
{"email": "a@b.c"}
{"email":"a@b.c","phone":null}
```

`parse_float=Decimal` отримує текст числа таким, як він записаний у JSON, тож `0.1` стає точним `Decimal('0.1')`, а не найближчим двійковим float. Для грошей це правильний спосіб читання. Ціле `3` іде через `parse_int`, який за замовчуванням `int`. `separators=(",", ":")` дає компактний вивід без пробілів, як у `JSON.stringify` без `indent`; за замовчуванням Python ставить пробіл після `:` і `,`.

<!-- task: q1 -->

## Що стає чим: таблиця типів, `default=` і `object_hook`

При записі `json` знає рівно ті типи, для яких у JSON є місце. Усе інше, навіть стандартні `datetime` і `Decimal`, дає `TypeError`, і це рішення дизайну: модуль не вгадує, як ви хочете бачити дату.

| Python | JSON | Примітка |
|---|---|---|
| `dict` | object | ключі `int`, `float`, `bool`, `None` стають рядками `"1"`, `"1.5"`, `"true"`, `"null"`; ключ-кортеж це `TypeError` |
| `list`, `tuple` | array | назад завжди `list` |
| `str`, `StrEnum` | string | `StrEnum` проходить, бо це підклас `str` |
| `int`, `float`, `IntEnum` | number | `nan` та `inf` як `NaN` та `Infinity`, якщо не `allow_nan=False` |
| `True`, `False` | `true`, `false` | |
| `None` | `null` | |
| `set`, `frozenset`, `bytes`, `datetime`, `date`, `Decimal`, `UUID`, `Enum`, dataclass | `TypeError` | потрібен `default=` |

```python live
import json
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum, StrEnum

class Status(StrEnum):
    NEW = "new"

class Color(Enum):
    RED = 1

for value in [(1, 2), Status.NEW, {1: "a", 1.5: "b", None: "c"}]:
    print(repr(value), "->", json.dumps(value))

for value in [{1, 2}, b"x", datetime(2026, 10, 18, tzinfo=timezone.utc), Decimal("9.99"), Color.RED]:
    try:
        json.dumps(value)
    except TypeError as e:
        print(f"{type(value).__name__}: {e}")
```

```text
(1, 2) -> [1, 2]
<Status.NEW: 'new'> -> "new"
{1: 'a', 1.5: 'b', None: 'c'} -> {"1": "a", "1.5": "b", "null": "c"}
set: Object of type set is not JSON serializable
bytes: Object of type bytes is not JSON serializable
datetime: Object of type datetime is not JSON serializable
Decimal: Object of type Decimal is not JSON serializable
Color: Object of type Color is not JSON serializable
```

Для своїх типів є `default=`: функція, яку енкодер викликає для кожного об'єкта, що не вміє серіалізувати сам. Вона повертає щось серіалізоване, а якщо тип незнайомий, кидає `TypeError`. У JS ту саму задачу розв'язують replacer-ом або методом `toJSON`.

```ts
class Money {
  constructor(public amount: string) {}
  toJSON() { return this.amount; }
}
JSON.stringify(lead, (key, value) => (typeof value === "bigint" ? value.toString() : value));
```

```python
def to_jsonable(obj):
    if isinstance(obj, Decimal):
        return str(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

json.dumps(lead, default=to_jsonable)
```

Різниця в моменті виклику. Replacer у JS викликається для кожної пари ключ-значення, включно з рядками й числами. `default` викликається лише для того, що енкодер не впізнав, тому він дешевий і не може випадково зіпсувати звичайні значення. Протоколу на кшталт `toJSON` у Python немає: об'єкт не вирішує, як він виглядає в JSON, вирішує той, хто викликає `dumps`. Те, що повернув `default`, енкодер обробляє далі рекурсивно, і якщо всередині знову незнайомий тип, `default` викличеться ще раз.

```python live
import json
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

@dataclass
class Lead:
    email: str
    amount: Decimal
    created_at: datetime

calls = []

def to_jsonable(obj):
    calls.append(type(obj).__name__)
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return str(obj)
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    if isinstance(obj, (set, frozenset)):
        return sorted(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

lead = Lead("a@b.c", Decimal("19.90"), datetime(2026, 10, 18, 9, 30, tzinfo=timezone.utc))
print(json.dumps({"lead": lead, "tags": {"vip", "eu"}}, default=to_jsonable))
print(calls)

try:
    json.dumps({"avatar": b"\x89PNG"}, default=to_jsonable)
except TypeError as e:
    print("TypeError:", e)
```

```text
{"lead": {"email": "a@b.c", "amount": "19.90", "created_at": "2026-10-18T09:30:00+00:00"}, "tags": ["eu", "vip"]}
['Lead', 'Decimal', 'datetime', 'set']
TypeError: Object of type bytes is not JSON serializable
```

`asdict` перетворив dataclass на словник, але `Decimal` і `datetime` усередині лишились як є, і енкодер повернувся з ними в `default` ще двічі. Одна перевірка `isinstance(obj, date)` покриває і `date`, і `datetime`, бо `datetime` її підклас. `Decimal` пишеться рядком, а не числом: інакше фронтенд прочитає його як float і втратить ту саму точність, яку `Decimal` зберігав. Те саме можна оформити підкласом `json.JSONEncoder` з перевизначеним методом `default`; це рівноцінний варіант, який зручний, коли енкодер передають як `cls=` у чужу бібліотеку.

> **Пастка.** `default=str` виглядає як універсальне рішення і навіть "працює": `datetime` і `Decimal` перетворюються на рядки. Але `str(datetime)` ставить пробіл замість `T`, тобто це не ISO 8601, який чекає `new Date(...)` і Pydantic, а `bytes` і будь-який об'єкт мовчки стають своїм `repr`. Помилка серіалізації зникає, а сміття в даних з'являється.

```python
import json
from datetime import datetime

print(json.dumps({"at": datetime(2026, 10, 18, 9, 30)}, default=str))
print(json.dumps({"raw": b"\x00ok", "obj": object()}, default=str)[:40])
```

```text
{"at": "2026-10-18 09:30:00"}
{"raw": "b'\\x00ok'", "obj": "<object ob
```

<!-- task: q2 -->

<!-- task: t2 -->

Зворотний бік: JSON не має типу "дата", тож після `loads` дата лишається рядком. Перетворити її назад можна хуком. `object_hook` отримує кожен розпарсений об'єкт як `dict` і повертає те, що стане на його місце. `object_pairs_hook` отримує той самий об'єкт ще до побудови словника, як список пар, і це єдиний спосіб помітити дубльовані ключі, які і `JSON.parse`, і `json.loads` мовчки зливають, лишаючи останнє значення.

```ts
const order = JSON.parse(text, (key, value) =>
  key.endsWith("_at") ? new Date(value) : value,
);
```

```python
order = json.loads(text, object_hook=revive_dates, parse_float=Decimal)
```

Reviver у JS викликається для кожної пари, `object_hook` для кожного об'єкта: всередині хука ви самі проходите ключі. Порядок однаковий: знизу вгору, спершу вкладені об'єкти, потім той, що їх містить. Тому коли хук бачить зовнішній словник, внутрішні вже перетворені.

```python live
import json
from datetime import datetime
from decimal import Decimal

seen = []

def revive_dates(d: dict) -> dict:
    seen.append(list(d))
    for key, value in d.items():
        if key.endswith("_at") and isinstance(value, str):
            d[key] = datetime.fromisoformat(value)
    return d

text = '{"id": "o1", "created_at": "2026-10-18T09:30:00+00:00", "meta": {"paid_at": "2026-10-19T10:00:00+00:00"}, "total": 19.90}'
order = json.loads(text, object_hook=revive_dates, parse_float=Decimal)
print(order["created_at"].isoformat(), order["meta"]["paid_at"].day, repr(order["total"]))
print(seen)

def no_duplicates(pairs: list[tuple[str, object]]) -> dict:
    keys = [key for key, _ in pairs]
    dupes = sorted({key for key in keys if keys.count(key) > 1})
    if dupes:
        raise ValueError(f"duplicate keys: {dupes}")
    return dict(pairs)

print(json.loads('{"name": "email", "name": "phone"}'))
try:
    json.loads('{"name": "email", "name": "phone"}', object_pairs_hook=no_duplicates)
except ValueError as e:
    print("ValueError:", e)
```

```text
2026-10-18T09:30:00+00:00 19 Decimal('19.90')
[['paid_at'], ['id', 'created_at', 'meta', 'total']]
{'name': 'phone'}
ValueError: duplicate keys: ['name']
```

> **Під капотом.** Сам парсер і енкодер написані на C (модуль `_json`), а `default`, `object_hook` і `parse_float` це виклики Python-функцій з C-коду для кожного відповідного вузла. На конфігу форми різниці не видно, на мільйоні записів хук стає помітною частиною часу. Для великих обсягів простіше читати без хуків і перетворювати лише потрібні поля.

<!-- task: t3 -->

Усе вище це ручна типізація: ви самі вирішуєте, які ключі містять дати, а які гроші. Для даних, що перетинають межу сервісу, цю роботу робить Pydantic (детально в m2-l09): `model_dump_json` знає `datetime`, `Decimal`, `set` і enum без жодного `default`, а `model_validate_json` парсить JSON і валідує типи за один крок, і поганий синтаксис, і поганий тип стають однією `ValidationError`.

```python live
from datetime import datetime, timezone
from decimal import Decimal

from pydantic import BaseModel, ValidationError

class Lead(BaseModel):
    email: str
    amount: Decimal
    created_at: datetime
    tags: set[str] = set()

lead = Lead(email="a@b.c", amount=Decimal("19.90"), created_at=datetime(2026, 10, 18, 9, 30, tzinfo=timezone.utc), tags={"vip"})
text = lead.model_dump_json()
print(text)
back = Lead.model_validate_json(text)
print(repr(back.amount), back.created_at.isoformat(), back == lead)

for bad in ['{"email": "a@b.c"', '{"email": "a@b.c", "amount": "abc", "created_at": "yesterday"}']:
    try:
        Lead.model_validate_json(bad)
    except ValidationError as e:
        print([(err["loc"], err["type"]) for err in e.errors()])
```

```text
{"email":"a@b.c","amount":"19.90","created_at":"2026-10-18T09:30:00Z","tags":["vip"]}
Decimal('19.90') 2026-10-18T09:30:00+00:00 True
[((), 'json_invalid')]
[(('amount',), 'decimal_parsing'), (('created_at',), 'datetime_from_date_parsing')]
```

Правило вибору просте. `json` з `default` і хуками для логів, дампів, внутрішніх файлів і там, де схеми немає. Pydantic для всього, що приходить ззовні або йде назовні за контрактом: тіло запиту, конфіг форми, відповідь API.

## csv: reader, writer і чому все рядки

Модуль `csv` це парсер і серіалізатор одного конкретного діалекту, того, що пише Excel, з налаштуваннями для решти. Він нічого не вгадує: типів у CSV немає, і `reader` повертає списки рядків, а `writer` перетворює значення через `str`. У Node ту саму роботу роблять `csv-parse` чи `papaparse` з колбеками або стрімами; тут `reader` це звичайний ітератор, по якому йде `for`.

```python live
import csv
import io

buf = io.StringIO()
writer = csv.writer(buf)
writer.writerow(["email", "note", "age"])
writer.writerow(["a@b.c", 'said "hi", left', 30])
writer.writerow(["x@y.z", "line1\nline2", None])
print(repr(buf.getvalue()))

buf.seek(0)
for row in csv.reader(buf):
    print(row)
```

```text
'email,note,age\r\na@b.c,"said ""hi"", left",30\r\nx@y.z,"line1\nline2",\r\n'
['email', 'note', 'age']
['a@b.c', 'said "hi", left', '30']
['x@y.z', 'line1\nline2', '']
```

Видно всі правила формату разом. Поле береться в лапки, лише якщо містить роздільник, лапку чи перевід рядка; лапка всередині подвоюється; `None` пишеться як порожнє поле; рядки закінчуються `\r\n`, як вимагає RFC 4180 і як пише Excel. На читанні типи не повертаються: `30` став `'30'`, а `None` став `''`, і відрізнити "порожній рядок" від "нічого" після CSV вже неможливо.

`DictReader` і `DictWriter` працюють зі словниками замість списків: перший рядок файлу стає `fieldnames`, і кожен наступний віддається як `dict`. Це те, що зазвичай потрібно, але поведінка на кривих рядках різна: читач мовчить, письменник кидає помилку.

```python live
import csv
import io

reader = csv.DictReader(io.StringIO("email,age\na@b.c\nx@y.z,30,extra\n"))
print(reader.fieldnames)
for row in reader:
    print(row)

buf = io.StringIO()
writer = csv.DictWriter(buf, fieldnames=["email", "age"])
writer.writeheader()
writer.writerow({"email": "a@b.c", "age": 30})
writer.writerow({"email": "x@y.z"})
print(repr(buf.getvalue()))
try:
    writer.writerow({"email": "q@q.q", "phone": "+380"})
except ValueError as e:
    print("ValueError:", e)
```

```text
['email', 'age']
{'email': 'a@b.c', 'age': None}
{'email': 'x@y.z', 'age': '30', None: ['extra']}
'email,age\r\na@b.c,30\r\nx@y.z,\r\n'
ValueError: dict contains fields not in fieldnames: 'phone'
```

Короткий рядок отримує `None` для відсутніх колонок (параметр `restval`), зайві значення складаються списком під ключ `None` (параметр `restkey`). Обидва випадки тихі, тож для імпорту перевіряйте їх самі. `DictWriter` навпаки суворий до зайвих ключів; `extrasaction="ignore"` вимикає перевірку, і тоді в CSV потрапляють лише колонки з `fieldnames`, що зручно для експорту підмножини полів.

### `newline=""` при відкритті файлу

Документація `csv` вимагає відкривати файли з `newline=""`, і це не формальність. Текстовий режим Python за замовчуванням перекладає переводи рядків: при читанні `\r\n` стає `\n`, при записі `\n` стає `os.linesep`, на Windows це `\r\n`. Модуль `csv` сам відповідає за переводи рядків, і подвійна обробка ламає дані в обидва боки.

```python live
import csv
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "leads.csv"
    path.write_bytes(b'id,note\r\n1,"line1\r\nline2"\r\n')
    with path.open(encoding="utf-8", newline="") as f:
        print(list(csv.reader(f)))
    with path.open(encoding="utf-8") as f:
        print(list(csv.reader(f)))

    # newline="\r\n" робить на будь-якій ОС те, що текстовий режим робить на Windows за замовчуванням
    with path.open("w", encoding="utf-8", newline="\r\n") as f:
        csv.writer(f).writerow(["a", "b"])
    print(path.read_bytes())
    with path.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerow(["a", "b"])
    print(path.read_bytes())
```

```text
[['id', 'note'], ['1', 'line1\r\nline2']]
[['id', 'note'], ['1', 'line1\nline2']]
b'a,b\r\r\n'
b'a,b\r\n'
```

При читанні без `newline=""` значення поля в лапках змінилось: `\r\n` усередині нотатки став `\n` ще до того, як `csv` його побачив. При записі на Windows `writer` пише `\r\n`, текстовий режим перетворює `\n` на `\r\n`, і виходить `\r\r\n`, який Excel показує як порожній рядок після кожного запису. На macOS і Linux друга проблема не проявляється, тому її ловлять уже в користувачів.

### Діалекти, роздільник `;` і лапки

Діалект (dialect, офіційний термін модуля, клас `csv.Dialect`) це набір параметрів формату: `delimiter`, `quotechar`, `quoting`, `lineterminator` та інші. Вбудованих три: `excel` (за замовчуванням), `excel-tab` і `unix` (`\n` і лапки навколо всього). Окремі параметри передаються іменованими аргументами просто в `reader` чи `writer`, і це найчастіший спосіб. Excel з українською чи будь-якою європейською локаллю зберігає CSV з `;`, бо кома там десятковий роздільник: `19,90`.

```python live
import csv
import io

for name in ["QUOTE_MINIMAL", "QUOTE_ALL", "QUOTE_NONNUMERIC"]:
    buf = io.StringIO()
    csv.writer(buf, quoting=getattr(csv, name)).writerow(["a@b.c", 30, 1.5, "x;y", None])
    print(f"{name:17}", repr(buf.getvalue()))

buf = io.StringIO()
csv.writer(buf, delimiter=";").writerow(["19,90", "x;y"])
print(repr(buf.getvalue()))

text = "email;age\na@b.c;30\n"
print(list(csv.DictReader(io.StringIO(text))))
print(list(csv.DictReader(io.StringIO(text), delimiter=";")))
print(repr(csv.Sniffer().sniff(text).delimiter))
```

```text
QUOTE_MINIMAL     'a@b.c,30,1.5,x;y,\r\n'
QUOTE_ALL         '"a@b.c","30","1.5","x;y",""\r\n'
QUOTE_NONNUMERIC  '"a@b.c",30,1.5,"x;y",""\r\n'
'19,90;"x;y"\r\n'
[{'email;age': 'a@b.c;30'}]
[{'email': 'a@b.c', 'age': '30'}]
';'
```

Лапки ставляться відносно поточного роздільника: з `delimiter=";"` значення `19,90` пишеться без лапок, бо кома тут звичайний символ, а `x;y` в лапках. Файл з `;`, прочитаний з роздільником за замовчуванням, не дає помилки: виходить одна колонка з назвою `'email;age'`. Це найтиповіший тихий збій імпорту з Excel. `csv.Sniffer` уміє вгадати діалект за зразком тексту, але це евристика: для файлів, формат яких ви контролюєте, роздільник задають явно.

### BOM і Excel

Excel на Windows відкриває CSV без підказки в кодуванні системної локалі, тобто cp1251, і UTF-8 перетворюється на кракозябри. Підказка це BOM (byte order mark, офіційний термін Unicode): три байти `EF BB BF` на початку файлу. Кодек `utf-8-sig` пише їх при записі й прибирає при читанні, якщо вони є, а якщо їх нема, читає як звичайний UTF-8.

```python live
import csv
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "leads.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["email", "ім'я"])
        writer.writerow(["a@b.c", "Олена"])
    print(path.read_bytes()[:9])

    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        print(reader.fieldnames)
        try:
            print(next(reader)["email"])
        except KeyError as e:
            print("KeyError:", e)

    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        print(reader.fieldnames, next(reader)["email"])
```

```text
b'\xef\xbb\xbfemail;'
['\ufeffemail', "ім'я"]
KeyError: 'email'
['email', "ім'я"] a@b.c
```

> **Пастка.** Файл, збережений з Excel як "CSV UTF-8", починається з BOM. Прочитаний через `encoding="utf-8"`, він дає першу колонку з невидимим `\ufeff` у назві, і `row["email"]` падає з `KeyError: 'email'`, хоча в `print(row)` ключ виглядає правильно. Для CSV, що міг пройти через Excel, читайте через `utf-8-sig` завжди: файлам без BOM це не шкодить.

### Типізація вручну

Після `DictReader` усі значення рядки, і конвертація лежить на вас: `int(...)` для чисел, `Decimal(value.replace(",", "."))` для сум з комою, явне правило для булевих, `None` для порожніх клітинок. Аналог з `csv-parse` це опція `cast`, яка тут відсутня. Альтернатива це Pydantic-модель на рядок: у lax-режимі вона сама перетворить `"30"` на `30`, але порожній рядок для поля `int | None` це помилка, а не `None`, тому порожні клітинки чистять до валідації.

```python live
import csv
import io

from pydantic import BaseModel, ValidationError

class LeadRow(BaseModel):
    email: str
    age: int | None = None
    consent: bool

text = "email;age;consent\na@b.c;30;1\nx@y.z;;0\n"
for row in csv.DictReader(io.StringIO(text), delimiter=";"):
    print(row)
    try:
        LeadRow.model_validate(row)
    except ValidationError as e:
        print("  raw:", [(err["loc"], err["type"]) for err in e.errors()])
    cleaned = {key: value or None for key, value in row.items()}
    print("  ok: ", LeadRow.model_validate(cleaned))
```

```text
{'email': 'a@b.c', 'age': '30', 'consent': '1'}
  ok:  email='a@b.c' age=30 consent=True
{'email': 'x@y.z', 'age': '', 'consent': '0'}
  raw: [(('age',), 'int_parsing')]
  ok:  email='x@y.z' age=None consent=False
```

<!-- task: q3 -->

<!-- task: t4 -->

## tomllib: конфіги лише на читання

`tomllib` з'явився в stdlib у 3.11, і вміє лише читати: `load` з файлу, `loads` з рядка, `dump` немає. Це перенесена бібліотека `tomli`, а причина появи в stdlib проста: `pyproject.toml` став стандартом для опису пакетів (PEP 518 і PEP 621, m0-l02), і інструментам потрібно читати його без залежностей. Для конфігів застосунку TOML добрий з тих самих причин: коментарі є, типи явні (рядок завжди в лапках, ціле відрізняється від дробового, дата це дата), відступи нічого не означають, і неявних перетворень, як у YAML, немає.

```python live
import tomllib

text = """
# formbuilder.toml
app_name = "formbuilder"
debug = false
max_upload_mb = 5
ratio = 0.75
release = 2026-10-18
deploy_at = 2026-10-18T09:30:00Z
local_start = 2026-10-18T09:30:00
daily_at = 07:00:00
allowed_origins = ["http://localhost:3000", "https://forms.example.com"]

[database]
path = "data/formbuilder.db"
timeout = { connect = 2.5, read = 10 }

[[themes]]
name = "light"
primary = "#0050ff"

[[themes]]
name = "dark"
primary = "#7aa2ff"
"""
for key, value in tomllib.loads(text).items():
    print(f"{key}: {type(value).__name__} = {value!r}")
```

```text
app_name: str = 'formbuilder'
debug: bool = False
max_upload_mb: int = 5
ratio: float = 0.75
release: date = datetime.date(2026, 10, 18)
deploy_at: datetime = datetime.datetime(2026, 10, 18, 9, 30, tzinfo=datetime.timezone.utc)
local_start: datetime = datetime.datetime(2026, 10, 18, 9, 30)
daily_at: time = datetime.time(7, 0)
allowed_origins: list = ['http://localhost:3000', 'https://forms.example.com']
database: dict = {'path': 'data/formbuilder.db', 'timeout': {'connect': 2.5, 'read': 10}}
themes: list = [{'name': 'light', 'primary': '#0050ff'}, {'name': 'dark', 'primary': '#7aa2ff'}]
```

Таблиця `[database]` стає вкладеним словником, inline-таблиця `{ connect = 2.5, read = 10 }` теж. Масив таблиць `[[themes]]` (array of tables, термін специфікації TOML) це список словників: кожен заголовок `[[themes]]` додає новий елемент, і це TOML-спосіб записати те, що в JSON було б `"themes": [{...}, {...}]`. Дати й час повертаються вже як `datetime.date`, `datetime.datetime` і `datetime.time`: дата з `Z` або зсувом стає aware, без зсуву naive (різниця між ними в m6-l03).

Файл відкривається в бінарному режимі, і це перше, на чому спотикаються.

```python live
import tempfile
import tomllib
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "formbuilder.toml"
    path.write_text('[database]\npath = "data/formbuilder.db"\n', encoding="utf-8")
    try:
        with path.open(encoding="utf-8") as f:
            tomllib.load(f)
    except TypeError as e:
        print("TypeError:", e)
    with path.open("rb") as f:
        print(tomllib.load(f))
```

```text
TypeError: File must be opened in binary mode, e.g. use `open('foo.toml', 'rb')`
{'database': {'path': 'data/formbuilder.db'}}
```

> **Під капотом.** Специфікація TOML вимагає UTF-8, тож `tomllib.load` читає байти й декодує їх сам, завжди як UTF-8. Текстовий режим віддав би рішення про кодування й переводи рядків платформі, а саме цього формат не допускає. `json.load` такої вимоги не має, бо приймає вже декодований текст, і кодування на вашій відповідальності.

TOML суворий там, де YAML поблажливий: дубльований ключ, ціле з нулем попереду, "булеве" `yes` це помилки парсингу, а не тихі перетворення. `TOMLDecodeError` підклас `ValueError` і повідомляє рядок і колонку.

```python live
import tomllib

for text in ['name = "a"\nname = "b"', "port = 08", "enabled = yes", 'version = "3.10"']:
    try:
        print(f"{text!r:26} -> {tomllib.loads(text)}")
    except tomllib.TOMLDecodeError as e:
        print(f"{text!r:26} -> TOMLDecodeError: {e}")
print(issubclass(tomllib.TOMLDecodeError, ValueError))
```

```text
'name = "a"\nname = "b"'   -> TOMLDecodeError: Cannot overwrite a value (at end of document)
'port = 08'                -> TOMLDecodeError: Expected newline or end of document after a statement (at line 1, column 9)
'enabled = yes'            -> TOMLDecodeError: Invalid value (at line 1, column 11)
'version = "3.10"'         -> {'version': '3.10'}
True
```

Записувати TOML у stdlib нічим; для генерації файлів є пакет `tomli-w` (`tomli_w.dumps(data)`), а якщо треба змінити значення і зберегти коментарі, то `tomlkit`. Читати `pyproject.toml` власного проєкту можна тим самим `tomllib`; нижче справжній файл капстоуну, запущений з кореня курсу.

```python
import tomllib

with open("capstone/pyproject.toml", "rb") as f:
    pyproject = tomllib.load(f)
print(pyproject["project"]["name"], pyproject["project"]["requires-python"])
print(pyproject["project"]["scripts"])
print(pyproject["tool"]["ruff"]["lint"]["extend-select"])
```

```text
formbuilder >=3.12
{'formbuilder': 'formbuilder.cli:main'}
['I', 'UP', 'B', 'N', 'SIM', 'RUF']
```

<!-- task: t5 -->

## YAML: pyyaml, `safe_load` і неявні типи

YAML у stdlib немає. Стандарт де-факто пакет `pyyaml` (`uv add pyyaml`, імпорт `import yaml`), який реалізує YAML 1.1. На платформі курсу його немає, тому приклади цього розділу не живі; вивід отримано локально з pyyaml 6.0.3.

Головне правило: лише `yaml.safe_load`. Повний завантажувач YAML уміє будувати довільні Python-об'єкти через теги `!!python/...`, тобто викликати функції під час парсингу. З pyyaml 6.0 `yaml.load` без явного `Loader` просто не запускається, але `yaml.unsafe_load` чи `Loader=yaml.Loader` досі виконують код з документа.

```python
import yaml

try:
    yaml.load("a: 1")
except TypeError as e:
    print("TypeError:", e)

payload = "name: !!python/object/apply:builtins.print ['code executed while parsing']"
try:
    yaml.safe_load(payload)
except yaml.YAMLError as e:
    print(type(e).__name__, str(e).splitlines()[0])

print(yaml.unsafe_load(payload))
```

```text
TypeError: load() missing 1 required positional argument: 'Loader'
ConstructorError could not determine a constructor for the tag 'tag:yaml.org,2002:python/object/apply:builtins.print'
code executed while parsing
{'name': None}
```

Замість `print` у справжньому payload стоїть `os.system` чи `subprocess.check_output`, і YAML-файл з PR, з тікета чи з запиту виконує його на сервері. `safe_load` будує лише базові типи: `dict`, `list`, `str`, `int`, `float`, `bool`, `None`, дати.

> **JS-аналог.** У `js-yaml` історія дзеркальна: з версії 4 `load` безпечний за замовчуванням, а небезпечні типи треба вмикати схемою. У pyyaml безпечна функція має окрему назву, тож звичка "просто `load`" з JS тут веде або в `TypeError`, або, якщо підставити `Loader` з першої відповіді на Stack Overflow, у виконання коду.

Друга проблема YAML: неявна типізація. Значення без лапок тип вгадує парсер за формою тексту, і правила YAML 1.1 вгадують агресивно.

```python
import yaml

doc = """
countries: [ua, pl, no]
answer: no
enabled: on
python: 3.10
mode: 010
zip: 01001
port: 08
time: 12:30
release: 2026-10-18
empty:
"""
for key, value in yaml.safe_load(doc).items():
    print(f"{key}: {type(value).__name__} = {value!r}")
```

```text
countries: list = ['ua', 'pl', False]
answer: bool = False
enabled: bool = True
python: float = 3.1
mode: int = 8
zip: int = 513
port: str = '08'
time: int = 750
release: date = datetime.date(2026, 10, 18)
empty: NoneType = None
```

Код країни Норвегії `no` став `False` (відома "норвезька проблема"), `on`/`off`/`yes`/`no` це булеві. Версія `3.10` стала float `3.1`. Нуль попереду означає вісімкове число, тож поштовий індекс `01001` став `513`. А `08` не валідне вісімкове, і pyyaml не кидає помилку, а мовчки лишає рядок `'08'`: сусідні значення того самого поля приходять різними типами. `12:30` прочитано як шістдесяткове число `12 * 60 + 30`. Ліки одні: брати в лапки все, що не є очевидним числом чи булевим, і валідувати результат `safe_load` моделлю. Pydantic ловить ці підміни, бо `bool` для поля `str` це `string_type`.

```python
import yaml
from pydantic import BaseModel, ValidationError

class Country(BaseModel):
    code: str
    python: str

try:
    Country.model_validate(yaml.safe_load("code: no\npython: 3.10"))
except ValidationError as e:
    print([(err["loc"], err["type"]) for err in e.errors()])
print(Country.model_validate(yaml.safe_load('code: "no"\npython: "3.10"')))
```

```text
[(('code',), 'string_type'), (('python',), 'string_type')]
code='no' python='3.10'
```

Запис через `yaml.dump` має два несподівані дефолти: ключі сортуються, а не-ASCII екранується. Для читабельного файлу використовують `safe_dump(data, allow_unicode=True, sort_keys=False)`. Емітер сам бере в лапки значення, які при читанні змінили б тип, як `'no'` і `'3.10'`, тож round-trip через pyyaml безпечний; ламаються саме рукописні файли.

```python
import yaml

data = {"title": "Реєстрація", "answer": "no", "version": "3.10", "fields": [{"name": "email", "required": True}]}
print(yaml.dump(data))
print(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
```

```text
answer: 'no'
fields:
- name: email
  required: true
title: "\u0420\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044F"
version: '3.10'

title: Реєстрація
answer: 'no'
version: '3.10'
fields:
- name: email
  required: true

```

`pyyaml` при записі губить коментарі й форматування; якщо програма має змінити YAML-файл, який редагують люди, беруть `ruamel.yaml`, який реалізує YAML 1.2 і вміє round-trip з коментарями. Де YAML доречний: CI (GitHub Actions), docker compose, Kubernetes, рукописні фікстури з коментарями й багаторядковими рядками, тобто файли, які пишуть і читають люди. Де ні: контракти між сервісами (JSON) і налаштування застосунку, які читає Python (TOML або змінні оточення).

> **Пастка.** "YAML це JSON без дужок" правильно лише в один бік: валідний JSON майже завжди є валідним YAML, і `yaml.safe_load('{"a": 1}')` працює. У зворотний бік YAML додає неявну типізацію, якої JSON не має: у JSON `"no"` завжди рядок, бо лапки обов'язкові, а в YAML лапки необов'язкові, і рішення про тип ухвалює парсер.

<!-- task: q4 -->

## Великі файли: потоково по рядках і JSON Lines

`json.load` читає весь файл, і в пам'яті одночасно опиняються і текст, і все дерево об'єктів. Для конфігу форми це нормально, для журналу на кілька гігабайтів ні. CSV тут влаштований краще: `csv.reader` і `DictReader` ітератори, вони беруть у файлу по одному рядку, коли `for` просить наступний запис, і пам'ять не росте з розміром файлу.

Для JSON те саме дає формат JSON Lines (назва формату з jsonlines.org; той самий формат ще називають NDJSON, обидві назви з екосистеми, а не з документації Python): один JSON-документ на рядок, без коми між ними й без обгорткового масиву. Розширення `.jsonl`. Він працює, бо `json.dumps` без `indent` ніколи не вставляє справжній перевід рядка: `\n` усередині рядкових значень екранується як `\\n`, тож кожен запис займає рівно один рядок файлу.

```python live
import json

print(json.dumps({"note": "line1\nline2"}))
print(len(json.dumps({"note": "line1\nline2"}).splitlines()))
```

```text
{"note": "line1\nline2"}
1
```

Читання JSONL це генератор (m5-l02): файл віддає рядки, генератор парсить по одному, споживач бере скільки треба. Порожні рядки пропускають, бо вони з'являються в кінці файлу й при ручному редагуванні.

```python live
import io
import json
from collections.abc import Iterable, Iterator

def read_jsonl(lines: Iterable[str]) -> Iterator[dict]:
    for lineno, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        print(f"parse line {lineno}")
        yield json.loads(line)

src = io.StringIO('{"email": "a@b.c", "plan": "pro"}\n{"email": "x@y.z", "plan": "free"}\n\n{"email": "q@q.q", "plan": "pro"}\n')
for lead in read_jsonl(src):
    print(lead["email"])
    if lead["plan"] == "free":
        break
print("unread:", src.read().split("\n"))
```

```text
parse line 1
a@b.c
parse line 2
x@y.z
unread: ['', '{"email": "q@q.q", "plan": "pro"}', '']
```

Після `break` генератор більше нічого не просить у файлу, і два останні рядки лишились непрочитаними. Друга перевага JSONL проявляється при збої. Процес, який дописує JSON-масив, при падінні лишає файл без закривальної `]`, і невалідним стає весь документ. Процес, який дописує JSONL у режимі `"a"` по одному рядку на запис, у гіршому разі лишає зіпсованим останній рядок, а все записане раніше читається.

```python live
import json

as_array = '[{"email": "a@b.c"}, {"email": "x@y.z"}, {"emai'
try:
    json.loads(as_array)
except json.JSONDecodeError as e:
    print("array:", e)

as_jsonl = '{"email": "a@b.c"}\n{"email": "x@y.z"}\n{"emai'
emails = []
for lineno, line in enumerate(as_jsonl.splitlines(), start=1):
    try:
        emails.append(json.loads(line)["email"])
    except json.JSONDecodeError as e:
        print(f"line {lineno}: {e.msg}")
print(emails)
```

```text
array: Unterminated string starting at: line 1 column 43 (char 42)
line 3: Unterminated string starting at
['a@b.c', 'x@y.z']
```

Конвертація між форматами теж іде потоком: `DictReader` віддає рядок CSV, з нього будується запис, `json.dumps` пише рядок JSONL, і жодного списку всіх записів у пам'яті немає. Той самий конвеєр у зворотний бік, з JSONL у CSV, це завдання нижче.

```python live
import csv
import io
import json

src = io.StringIO("email;age;plan\na@b.c;30;pro\nx@y.z;;free\n")
dst = io.StringIO()
for row in csv.DictReader(src, delimiter=";"):
    record = {**row, "age": int(row["age"]) if row["age"] else None}
    dst.write(json.dumps(record, ensure_ascii=False) + "\n")
print(dst.getvalue(), end="")
```

```text
{"email": "a@b.c", "age": 30, "plan": "pro"}
{"email": "x@y.z", "age": null, "plan": "free"}
```

> **JS-аналог.** У Node це `readline.createInterface({ input: fs.createReadStream(path) })` з `for await (const line of rl)` і `JSON.parse(line)`. У Python файловий об'єкт уже ітерується рядками, тож окремого `readline`-модуля не потрібно, а синхронний `for` замінює `for await`. Якщо великий файл це саме один JSON-масив і змінити формат не можна, потоковий парсинг дає пакет `ijson`.

<!-- task: t6 -->

## Вибір формату, валідація на межі і `pickle`

Формат обирається за тим, хто пише файл і хто його читає. Для FormBuilder розклад такий.

| Дані | Формат | Чому |
|---|---|---|
| Конфіг форми від редактора | JSON | на фронтенді `JSON.stringify`, контракт описується JSON Schema, на сервері `model_validate_json` |
| Налаштування застосунку | TOML (`formbuilder.toml`) або змінні оточення | коментарі, явні типи, читається stdlib; env і pydantic-settings у m6-l06 |
| Тестові фікстури | JSON для тіл запитів, YAML для рукописних наборів кейсів | тіло запиту має бути саме тим, що надсилає фронтенд; YAML дає коментарі й багаторядкові рядки |
| Експорт лідів для маркетингу | CSV, `utf-8-sig`, `;` | відкривається в Excel без імпорту |
| Журнал подій, історія збірок | JSON Lines | дописування в кінець, читання потоком, стійкість до обриву |
| Кеш між своїми процесами | `pickle` | будь-які Python-об'єкти, але лише ваші власні дані |

Валідація на межі обов'язкова з простої причини: `json.loads`, `tomllib.load`, `yaml.safe_load` і `csv` повертають те, що написано у файлі, а не те, що ви очікуєте. Анотація `config: dict = json.loads(text)` нічого не перевіряє, mypy вірить вам на слово, бо `loads` повертає `Any`. Помилка формату тоді проявляється не на вході, а глибоко в бізнес-логіці, з `TypeError` без жодного зв'язку з файлом.

```python live
import json

for text in ['{"fields": []}', "[]", '"fields"', "null"]:
    data = json.loads(text)
    try:
        print(type(data).__name__, len(data["fields"]))
    except (TypeError, KeyError) as e:
        print(type(data).__name__, type(e).__name__, e)
```

```text
dict 0
list TypeError list indices must be integers or slices, not str
str TypeError string indices must be integers, not 'str'
NoneType TypeError 'NoneType' object is not subscriptable
```

Тому парсинг і валідація йдуть одним кроком на вході, і далі по коду ходить уже модель. Схема контракту для фронтенду генерується з тієї ж моделі через `model_json_schema()` (m2-l09) і зберігається у файл тим самим `json.dump` з `indent` і `sort_keys=True`, щоб дифф у PR показував лише справжні зміни. Якщо джерелом правди є сама схема, а не Python-модель (наприклад, схема спільна з `ajv` на фронтенді), словник перевіряють проти неї пакетом `jsonschema`.

```python live
import json
import tempfile
from pathlib import Path

from pydantic import BaseModel

class FieldConfig(BaseModel):
    name: str
    required: bool = False

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "field.schema.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(FieldConfig.model_json_schema(), f, indent=2, sort_keys=True)
        f.write("\n")
    print(path.read_text(encoding="utf-8"), end="")
```

```text
{
  "properties": {
    "name": {
      "title": "Name",
      "type": "string"
    },
    "required": {
      "default": false,
      "title": "Required",
      "type": "boolean"
    }
  },
  "required": [
    "name"
  ],
  "title": "FieldConfig",
  "type": "object"
}
```

`pickle` це бінарна серіалізація самих Python-об'єктів: dataclass, `Decimal`, `set`, `datetime` зберігаються й відновлюються без жодного `default` чи хука. Ціна в тому, що формат це не дані, а програма для невеликої віртуальної машини, яка відтворює об'єкти, і ця програма може викликати будь-яку функцію. Об'єкт сам вирішує, як його відновлювати, через метод `__reduce__`, і нічого не заважає йому повернути `os.system` з аргументами.

```python live
import pickle
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

@dataclass
class Build:
    form_id: str
    built_on: date
    cost: Decimal
    tags: set[str]

build = Build("signup", date(2026, 10, 18), Decimal("0.10"), {"eu"})
blob = pickle.dumps(build)
print(type(blob).__name__, blob[:2])
print(pickle.loads(blob) == build)

class Evil:
    def __reduce__(self):
        return (print, ("code executed while unpickling",))

payload = pickle.dumps(Evil())
print(pickle.loads(payload))
```

```text
bytes b'\x80\x04'
True
code executed while unpickling
None
```

`pickle.loads` на байтах з мережі, з завантаженого файлу чи з кукі це виконання чужого коду, тому `pickle` лише для даних, які ваш процес записав і ваш процес читає: кеш обчислень, передача об'єктів між власними процесами (саме так `multiprocessing` передає аргументи, m5-l08). Він ще й прив'язаний до коду: перейменуйте клас, і старий кеш не відновиться. `shelve` поверх `pickle` дає словник, що живе у файлі, з тими самими обмеженнями; для сховища капстоуну замість нього буде SQLite (m6-l08).

## Для капстоуну

У капстоуні всі три формати сходяться в одному модулі, наприклад `src/formbuilder/formats.py`. Конфіг форми читається з JSON-файлу одразу в Pydantic-модель, без проміжного `json.load`: `model_validate_json(path.read_bytes())` парсить і валідує за один крок. Налаштування застосунку лежать у `formbuilder.toml` і теж проходять через модель, щоб помилка в типі значення ловилась при старті, а не при першому запиті. Ліди для маркетингу вивантажуються в CSV, який відкривається в Excel подвійним кліком.

```python live
import csv
import tempfile
import tomllib
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel

class FieldConfig(BaseModel):
    name: str
    type: str
    required: bool = False

class FormConfig(BaseModel):
    id: str
    title: str
    fields: list[FieldConfig]

class Settings(BaseModel):
    out_dir: Path = Path("dist")
    debug: bool = False

def load_form_config(path: Path) -> FormConfig:
    return FormConfig.model_validate_json(path.read_bytes())

def load_settings(path: Path) -> Settings:
    with path.open("rb") as f:
        return Settings.model_validate(tomllib.load(f))

def export_leads_csv(leads: list[dict], path: Path, fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(leads)

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "signup.json").write_text(
        '{"id": "signup", "title": "Реєстрація", "fields": [{"name": "email", "type": "email", "required": true}]}',
        encoding="utf-8",
    )
    (root / "formbuilder.toml").write_text('out_dir = "public"\ndebug = true\n', encoding="utf-8")

    config = load_form_config(root / "signup.json")
    settings = load_settings(root / "formbuilder.toml")
    print(config.title, [f.name for f in config.fields if f.required])
    print(settings)

    leads = [
        {"email": "a@b.c", "name": "Олена", "submitted_at": datetime(2026, 10, 18, 9, 30, tzinfo=timezone.utc), "ip": "10.0.0.1"},
        {"email": "x@y.z", "name": "Тарас", "submitted_at": datetime(2026, 10, 18, 11, 5, tzinfo=timezone.utc), "ip": "10.0.0.2"},
    ]
    export_leads_csv(leads, root / "leads.csv", ["email", "name", "submitted_at"])
    print((root / "leads.csv").read_bytes()[:3])
    print((root / "leads.csv").read_text(encoding="utf-8-sig"), end="")
```

```text
Реєстрація ['email']
out_dir=PosixPath('public') debug=True
b'\xef\xbb\xbf'
email;name;submitted_at
a@b.c;Олена;2026-10-18 09:30:00+00:00
x@y.z;Тарас;2026-10-18 11:05:00+00:00
```

> **Для капстоуну.** У CSV дата потрапила через `str(datetime)`, з пробілом замість `T` і зсувом `+00:00`. Excel таке розпізнає як текст, і сортування за датою в маркетингу не працюватиме. Перед записом форматуйте явно: `submitted_at.strftime("%Y-%m-%d %H:%M")` у тому часовому поясі, в якому працює команда (m6-l03). А поле `ip` не потрапило у файл завдяки `extrasaction="ignore"`: експорт явно перелічує колонки, і персональні дані, яких маркетингу не треба, не витікають через новий ключ у записі.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`JSON.stringify(obj, null, 2)` дослівно.** Пишуть `json.dumps(obj, None, 2)`, а всі параметри після `obj` іменовані. Правильно: `json.dumps(obj, indent=2)`, і `ensure_ascii=False`, якщо в даних кирилиця.

   ```python
   json.dumps({"a": 1}, None, 2)   # TypeError: dumps() takes 1 positional argument but 3 were given
   json.dumps({"a": 1}, indent=2)
   ```

2. **Очікування, що `None` зникне з виводу, як `undefined`.** `None` серіалізується в `null`, ключ лишається. Правильно: прибрати явно comprehension-ом або через `model_dump_json(exclude_none=True)` у Pydantic.

   ```python
   json.dumps({"email": "a@b.c", "phone": None})                       # {"email": "a@b.c", "phone": null}
   json.dumps({k: v for k, v in lead.items() if v is not None})        # {"email": "a@b.c"}
   ```

3. **`require("./config.json")` як імпорт.** Імпортувати JSON у Python не можна, і шлях відносно поточного модуля теж не працює: відносний шлях рахується від cwd. Правильно: явне відкриття з `encoding` і шлях від `Path(__file__).parent` або `importlib.resources` для файлів пакета (m6-l01).

   ```python
   with (Path(__file__).parent / "config.json").open(encoding="utf-8") as f:
       config = json.load(f)
   ```

4. **`default=str` як універсальний фікс `TypeError`.** Дата виходить не в ISO, `bytes` і об'єкти стають `repr`. Правильно: функція `default`, яка знає свої типи й кидає `TypeError` на решту, або Pydantic.

   ```python
   json.dumps({"at": datetime(2026, 10, 18, 9, 30)}, default=str)   # {"at": "2026-10-18 09:30:00"}
   json.dumps({"at": datetime(2026, 10, 18, 9, 30)}, default=lambda o: o.isoformat())  # "2026-10-18T09:30:00"
   ```

5. **`csv-parse` з колбеками і `cast: true` в голові.** Шукають подію `data` і автоматичні типи. Тут `reader` це ітератор, а всі значення рядки. Правильно: `for row in csv.DictReader(f)` і явна конвертація або модель на рядок.

   ```python
   for row in csv.DictReader(f, delimiter=";"):
       age = int(row["age"]) if row["age"] else None
   ```

6. **CSV відкритий як звичайний текстовий файл.** Без `newline=""` псуються переводи рядків у полях і з'являються порожні рядки в Excel на Windows; без `utf-8-sig` кирилиця ламається в Excel, а BOM ламає назву першої колонки. Правильно: обидва параметри завжди.

   ```python
   with path.open("w", encoding="utf-8-sig", newline="") as f:
       writer = csv.writer(f, delimiter=";")
   ```

7. **YAML як "просто JSON з відступами" і `yaml.load`.** Значення без лапок змінюють тип (`no`, `3.10`, `01001`), а `load` з повним завантажувачем виконує код з документа. Правильно: `yaml.safe_load`, лапки навколо рядків, модель після парсингу.

   ```python
   yaml.safe_load("code: no")     # {'code': False}
   yaml.safe_load('code: "no"')   # {'code': 'no'}
   ```

8. **Один великий JSON-масив для журналу.** Дописувати не можна без перезапису, читати лише цілком, обрив запису псує весь файл. Правильно: JSON Lines, рядок на запис, читання генератором.

   ```python
   with path.open("a", encoding="utf-8") as f:
       f.write(json.dumps(event, ensure_ascii=False) + "\n")
   ```

## Підсумок

- `loads`/`dumps` для рядків, `load`/`dump` для файлів; параметри після `obj` лише іменовані; `json.load` читає файл цілком.
- `JSONDecodeError` це `ValueError` з `lineno`, `colno` і `msg`; `Extra data` означає кілька документів в одному рядку.
- Python пише й читає `NaN` та `Infinity`, а JS ні: на межі з фронтендом `allow_nan=False`; великі `int` точні, але JS їх псує, тож великі id рядком.
- `None` стає `null`, ключ лишається; `undefined`-поведінки немає.
- `default=` викликається лише для незнайомих типів і має кидати `TypeError` на решту; `default=str` це сміття замість помилки.
- `object_hook` знизу вгору для кожного об'єкта, `parse_float=Decimal` для грошей, `object_pairs_hook` для дубльованих ключів.
- `csv` повертає лише рядки; файли завжди з `newline=""`; для Excel `utf-8-sig` і `;`; читач мовчить на кривих рядках, `DictWriter` кидає `ValueError` на зайві ключі.
- `tomllib` лише читає, файл лише в `"rb"`, типи й дати справжні, помилки суворі; запис через `tomli-w`.
- YAML лише через `safe_load`, значення без лапок змінюють тип; після парсингу валідація моделлю.
- Великі обсяги: CSV по рядках, JSON Lines замість масиву, генератор на читанні; `pickle` лише для власних даних.

## Що далі

Наступний урок m6-l03 про `datetime` і `zoneinfo`. Звідси там знадобляться ISO-рядки з `isoformat` і `fromisoformat` у хуках `json`, aware і naive дати, які повертає `tomllib`, і дата в CSV-експорті, яку треба форматувати в часовому поясі команди. Налаштування з `formbuilder.toml` повернуться в m6-l06 разом зі змінними оточення й pydantic-settings.
