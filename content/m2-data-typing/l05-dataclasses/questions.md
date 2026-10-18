# Ключові питання уроку m2-l05 "dataclasses як типізований запис"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] Проблема, яку вирішує `@dataclass`: клас-запис без шаблонного `__init__`, `__repr__`, `__eq__`. Показати "до" і "після" і що саме згенеровано (`inspect.signature`, `dataclasses.fields`). Аналог: TS interface + конструктор, або об'єкт із типом.
- [x] Оголошення полів через анотації, значення за замовчуванням, порядок (поля без default після полів з default це помилка), `field(default_factory=list)` для mutable і чому `items: list = []` кидає `ValueError` (dataclass захищає від пастки з m1-l07).
- [x] `frozen=True`: незмінний екземпляр, `FrozenInstanceError`, hashable, як ключ словника і елемент set. Аналог `readonly`/`as const`. `dataclasses.replace` для "зміни" через новий об'єкт.
- [x] `__post_init__` для валідації й похідних полів; `field(init=False)`, `field(repr=False)`, `field(compare=False)`. Чому валідацію складніше за інваріант віддають Pydantic (посилання на m2-l09).
- [x] `order=True` для порівнянь, `slots=True` (3.10+) для пам'яті й швидкості, `kw_only=True` (3.10+) для обов'язкових іменованих полів. Коли вмикати кожне.
- [x] `asdict`, `astuple`, і чому `asdict` рекурсивний і робить глибоку копію (повільно на великих деревах). Серіалізація в JSON через `asdict` + `json.dumps`.
- [x] Наслідування dataclass і порядок полів; композиція (dataclass у dataclass) для дерева елементів форми. Рекурсивна анотація `children: list["Element"]` і `from __future__ import annotations`.
- [x] dataclass проти `NamedTuple` проти `TypedDict` проти звичайного класу проти Pydantic: таблиця "змінюваність, валідація, пам'ять, серіалізація, коли що". Правило для курсу: dataclass для внутрішніх структур, Pydantic на межі з зовнішнім світом.
- [x] Типізація: `list[Element]`, `str | None`, `Literal["input", "text"]`, `ClassVar` для атрибутів класу, що не є полями (посилання на m2-l06).
- [x] `match` по dataclass: `case Element(type="input", name=name)` (посилання на m1-l05), позиційні патерни через `__match_args__`, який dataclass генерує.
- [x] Для капстоуну: `Theme`, `Element`, `FormConfig` як frozen dataclasses для внутрішнього представлення після валідації Pydantic; функція обходу дерева.
- [x] Які JS-звички тут заважають: об'єктний літерал як запис без класу, `interface` без runtime, `class` з ручним конструктором `this.x = x`, очікування, що `===` на двох записах хибне (у dataclass `==` поелементне), `Object.freeze`.
