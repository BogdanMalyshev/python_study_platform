# Ключові питання уроку m4-l06 "Enum, StrEnum"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Короткий урок: 20–30 абзаців.

- [x] `enum.Enum`: оголошення, `Color.RED`, `.name`, `.value`, ітерація по членах, `Color("red")` за значенням, `Color["RED"]` за ім'ям, `ValueError` для невідомого. Члени це singletons: порівняння через `is` і `==`, hashable, як ключі словника.
- [x] `StrEnum` (3.11+) і `IntEnum`: член поводиться як рядок/число (`json.dumps`, порівняння з `"red"`, f-рядки), і чому для статусів і типів елементів у JSON-API беруть `StrEnum`. Пастка `Enum` з рядковим значенням без `StrEnum`: `Color.RED == "red"` хибне.
- [x] `auto()`, `_generate_next_value_` для StrEnum (ім'я малими), `@unique`, аліаси при однакових значеннях.
- [x] Методи і властивості на Enum, члени з даними (кортеж у value, `__init__` на члені), `Flag` і `IntFlag` для бітових прапорців одним прикладом.
- [x] Enum у `match` (`case Status.DONE:`, посилання на m1-l05 про крапкові константи), у typing (`Literal` проти Enum: коли що), у Pydantic (член валідується зі значення, серіалізується у value) і dataclass.
- [x] Порівняння з TS enum: числові enum з reverse mapping, `const enum`, і чому в TS часто радять union of literals; у Python Enum це повноцінні об'єкти з методами.
- [x] Для капстоуну: `ElementType(StrEnum)` (input, text, button, block), `JobStatus(StrEnum)` з методом `can_transition_to`, заміна рядкових літералів у коді модуля 2 на Enum.
- [x] Які JS-звички тут шкодять: об'єкт `as const` як enum, порівняння з рядком без StrEnum, числові значення за замовчуванням (тут `auto()` дає 1, 2, 3 для Enum, але імена для StrEnum), `Object.values(Enum)` (тут `list(Enum)`).
