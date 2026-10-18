# Ключові питання уроку m2-l04 "collections: Counter, defaultdict, deque, namedtuple"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] `Counter`: підрахунок з iterable, `most_common(n)`, арифметика лічильників (`+`, `-`, `&`, `|`), `total()` (3.10+), `elements()`, відсутній ключ дає 0, а не `KeyError`. Заміна `reduce` з акумулятором-об'єктом у JS.
- [x] `defaultdict`: фабрика за замовчуванням (`list`, `int`, `set`, lambda), групування `groups[key].append(x)` без перевірки, пастка: читання неіснуючого ключа створює його. Коли `dict.setdefault` достатньо, коли `defaultdict` краще. Аналог `Object.groupBy` (ES2024) і ручного `acc[k] ??= []`.
- [x] `deque`: двостороння черга з O(1) `appendleft`/`popleft` проти O(n) `list.insert(0)`/`pop(0)`, `maxlen` як кільцевий буфер, `rotate`. Коли `list` як черга це баг продуктивності (показати вимірюванням). Аналог `shift`/`unshift`, які в JS теж O(n).
- [x] `namedtuple`: запис з іменованими полями, незмінний, розпаковується як tuple, `_replace`, `_asdict`, `_fields`. Коли namedtuple, коли dataclass (посилання на m2-l05), коли tuple.
- [x] `OrderedDict`: чому майже не потрібен після 3.7, що лишилось (`move_to_end`, порівняння з урахуванням порядку), одне речення.
- [x] `ChainMap`: пошук по кількох словниках без злиття, для шарів конфігурації (defaults → file → env → CLI). Показати на темі форми й overrides елемента.
- [x] `dict.get` з default, `dict.setdefault`, `dict.fromkeys`, `dict.pop(key, default)` як вбудовані альтернативи, щоб не тягнути `collections` без потреби.
- [x] `itertools.groupby` проти `defaultdict` для групування: чому `groupby` потребує відсортованого вводу і яка з двох ідіом частіша (одне речення, детально itertools у m5-l03).
- [x] Типізація цих структур: `Counter[str]`, `defaultdict[str, list[int]]`, `deque[Job]`, і `typing.NamedTuple` як сучасний спосіб оголошення namedtuple з типами (посилання на m2-l06).
- [x] Для капстоуну: `Counter` типів елементів у формі, `defaultdict(list)` для елементів по сторінках, `deque` як черга задач генерації (прообраз `asyncio.Queue`, m5-l05), `ChainMap` для шарів теми.
- [x] Які JS-звички тут заважають: `reduce` для підрахунку й групування, `arr.shift()` у циклі, `Map` з ручною ініціалізацією `if (!m.has(k)) m.set(k, [])`, об'єкт як запис без типу замість namedtuple/dataclass.
