# Ключові питання уроку m2-l06 "typing: анотації як TS-типи, які не перевіряються в рантаймі"

Урок готовий, коли на кожне питання є відповідь з кодом, виводом і, де доречно, реальним виводом `mypy` (встановлений у `.venv`).

- [x] Що таке анотації з погляду інтерпретатора: зберігаються в `__annotations__`, не перевіряються, не впливають на виконання. Хто їх читає: mypy/pyright (статично), Pydantic/dataclasses/FastAPI (у рантаймі через introspection). Чим це відрізняється від TS, де типи стираються повністю.
- [x] Вбудовані generics з 3.9+: `list[str]`, `dict[str, int]`, `tuple[int, str]`, `tuple[int, ...]`, `set[str]`, і чому `List`, `Dict` з `typing` застаріли. `type` statement і `X | Y` замість `Union`, `X | None` замість `Optional` (3.10+).
- [x] `Optional` і `None`: `str | None` означає "або рядок, або None", не "необов'язковий параметр" (це робить `= None`). Narrowing через `if x is None: return`, і як mypy це розуміє. Аналог `string | null` і strictNullChecks.
- [x] `Literal["input", "text"]` як union рядкових літералів, `Final` для констант, `ClassVar`, `Annotated` для метаданих (використовує Pydantic, m2-l09).
- [x] `TypedDict`: тип для dict із відомими ключами, `total=False`, `NotRequired`/`Required` (3.11+), і чим він відрізняється від dataclass (це все ще dict у рантаймі). Коли TypedDict (JSON як є), коли dataclass (власна структура). Аналог TS object type.
- [x] `Callable[[int, str], bool]`, `Callable[..., Any]`, типізація функцій вищого порядку, `ParamSpec` одним реченням. Аналог `(a: number, b: string) => boolean`.
- [x] Generic функції й класи: `TypeVar`, синтаксис 3.12 `def first[T](items: list[T]) -> T`, `class Stack[T]`, обмеження `T: (int, str)` і `bound=`. Порівняти з `<T>` у TS.
- [x] `Any` проти `object`: `Any` вимикає перевірку, `object` вимагає narrowing. Чому `Any` це `any` з TS і так само небезпечний. `cast`, `TYPE_CHECKING`, `reveal_type` як інструменти.
- [x] `Protocol` одним реченням з посиланням на m2-l07, `Iterable`/`Sequence`/`Mapping` з `collections.abc` як правильні типи параметрів (приймати найширший, повертати найточніший): `def f(items: Iterable[str]) -> list[str]`.
- [x] Відкладені анотації: `from __future__ import annotations`, рядкові анотації `"Element"` для рекурсивних і forward-посилань, `get_type_hints`. Що зміниться в 3.14 (PEP 649), одне речення.
- [x] Overload, `@overload` для функцій з різною поведінкою за типом (коротко), `TypeGuard`/`TypeIs` для власних narrowing-функцій (коротко). Аналог type predicates `x is Foo`.
- [x] Для капстоуну: типи для конфігу форми через `TypedDict` (сирий JSON), `Literal` для `type` елемента, `Callable` для реєстру рендерерів, generic `Result[T]` або `tree_map[T]`.
- [x] Які JS-звички тут заважають: `interface` як runtime-перевірка (ні), `string[]` замість `list[str]`, `?` для optional (у Python `= None` + `| None`), `as` для приведення (у Python `cast`, і він теж нічого не робить), очікування, що `tsc` зупинить запуск (Python запуститься з будь-якими типами).
