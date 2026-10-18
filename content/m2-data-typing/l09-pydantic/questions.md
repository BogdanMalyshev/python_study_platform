# Ключові питання уроку m2-l09 "Pydantic v2 як Zod"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Учень знає Zod добре: кожна концепція подається через відповідність Zod → Pydantic.

- [x] Навіщо Pydantic, якщо є анотації типів і mypy? Що саме перевіряється під час виконання, а що лише статично? Чим `BaseModel` відрізняється від `dataclass` і `TypedDict` з m2-l05 і m2-l06?
- [x] Як оголосити модель і які відповідності: `z.object` → `BaseModel`, `z.string().min(3)` → `Field(min_length=3)`, `z.optional` → `X | None = None`, `z.enum` → `Literal` або `Enum`, `z.array` → `list[X]`, `z.union` → `X | Y`, `z.infer` → сам клас і є типом?
- [x] Чим `model_validate(dict)` і `Model(**dict)` відрізняються від `model_validate_json(str)`? Що є аналогом `parse` і `safeParse`, якщо `safeParse` у Pydantic немає?
- [x] Як виглядає `ValidationError`: структура `errors()`, поля `loc`, `msg`, `type`, і як з неї зробити відповідь API або повідомлення в UI? Як зібрати всі помилки, а не лише першу?
- [x] Що таке lax і strict режими: чому `"42"` стає `42` за замовчуванням, як це вимкнути (`strict=True` на полі або в `model_config`), і чим це відрізняється від Zod, де коерції треба просити явно через `z.coerce`?
- [x] Як працюють `field_validator` (режими `before` / `after`) і `model_validator`, і чому для перевірки залежностей між полями потрібен саме `model_validator`? Аналог `.refine` і `.superRefine`.
- [x] Як задати значення за замовчуванням, зокрема для mutable типів (`default_factory`), і чому тут немає пастки mutable default з m1-l07?
- [x] Як працюють вкладені моделі й рекурсивні структури (дерево елементів форми, де дочірні елементи того самого типу)?
- [x] Як зробити discriminated union за полем `type` (`Field(discriminator="type")`), аналог `z.discriminatedUnion`, і чому це краще за звичайний `Union` для дерева елементів FormBuilder?
- [x] Як серіалізувати: `model_dump()` проти `model_dump_json()`, `exclude_none`, `by_alias`, і як налаштувати camelCase-аліаси для JSON, який приходить з фронтенду (`alias_generator`, `populate_by_name`)?
- [x] Що робити з зайвими полями у вхідних даних: `extra="ignore"` / `"forbid"` / `"allow"`, аналог `.strict()` / `.passthrough()` у Zod?
- [x] Як згенерувати JSON Schema з моделі і навіщо це капстоуну (контракт для фронтенду, документація FastAPI)?
- [x] Як моделі Pydantic використовуються у FastAPI (одне речення й посилання на m7-l01) і де їх не варто використовувати (внутрішні структури без зовнішнього вводу: там dataclass)?
