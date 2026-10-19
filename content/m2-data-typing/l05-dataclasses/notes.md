# Нотатки до m2-l05

## Що запускалось

Усе через `.venv/bin/python` (Python 3.12.12, pydantic 2.x з `.venv`) з тимчасової підпапки `m2-l05` у scratch-директорії,
яку після перевірки видалено.

- 34 python-блоки `lesson.md`, за якими йде блок `text`, виконано окремими скриптами `example.py`; вивід (stdout + stderr)
  вставлено в урок автоматично, без ручного редагування, а потім урок прогнано повторно в режимі звірки.
  Звірка збігається для всіх блоків, крім чотирьох, де вивід за природою змінний: адреса об'єкта в `repr` звичайного класу,
  час доступу до атрибута (`slots`), час `asdict` проти ручного `to_dict`, час створення dataclass проти `BaseModel`.
  Ці блоки не `live` і в тексті позначені як "цифри з одного запуску".
- У traceback шляхи замінено на basename (`example.py`, `<string>`); кадри всередині стандартної бібліотеки
  (`dataclasses.py`, `json/encoder.py`) прибрано, кадр користувацького коду, кадри згенерованих методів
  `File "<string>"` і останній рядок з винятком лишились дослівно.
- Блоки без `text` (ілюстрації в callout і в "Типових помилках") перевірено на синтаксис через `compile`.
- `tasks.yaml` розпарсено `yaml.safe_load`; для кожного `code`-завдання `solution + harness` виконано, `expected`
  вставлено з реального stdout і звірено ще раз після нормалізації. `starter + harness` для всіх п'яти завдань
  дає інший вивід, тобто заготовка не проходить сама.
- Перевірено, що типові хибні рішення не проходять: t2 без `frozen=True` (`TypeError: unhashable type`),
  t3 без перевірки `bool` (пропускає `True` для `lt`), t3 з `self.value = ...` (`FrozenInstanceError`),
  t5 без structural sharing (`is` дає `False`).
- Код трьох quiz-питань виконано, відповіді збігаються з реальним виводом.
- `ruff check` на рішеннях: лишаються лише `I001` (стиль порожніх рядків, як в усіх уроках курсу) і `F401` у t2
  (`FrozenInstanceError` імпортується в заготовці для харнеса).

Команди: `.venv/bin/python fill.py lesson.md fill|check`, `.venv/bin/python runtasks.py tasks.yaml show|check|starter`,
`.venv/bin/ruff check --no-cache sol_*.py`.

## Рішення

- Розділів `##` дванадцять: вісім теоретичних, `Для капстоуну` і три обов'язкові. Теорії 37 абзаців без callout-блоків,
  таблиці й списку помилок, у межах орієнтира 20–40. Ділити урок не пропоную: 12 питань `questions.md` щільно пов'язані.
- `Element` у цьому уроці це один запис з тегом `type` (`input`, `text`, `button`, `block`), а не ієрархія класів.
  Причини: бриф задає `Element (type, name, children, visible_if)`, `match` за `type` демонструє class patterns, а ієрархію
  класів з `Protocol` для рендерерів роадмап відводить m4. Інваріант "лише `input` має `name`, лише `block` має `children`"
  живе в `__post_init__` як приклад межі "інваріант проти валідації вводу". Імена полів (`id`, `type`, `name`, `label`,
  `children`, `visible_if`, `Condition(field, operator, value)`, `Theme(mode, primary_color)`) збігаються з моделями m2-l09.
- Узгодженість з m2-l09: там `dataclass` протиставлено `BaseModel` як "не перевіряє типи" і "кілька разів дешевше
  у створенні". Тут обидва твердження показано кодом: `Theme(mode=42)` проходить, а вимірювання створення дає
  ~180 ns для звичайного dataclass, ~300 ns для frozen+slots і ~520 ns для `BaseModel`. Для frozen-варіанта різниця
  менша (близько 1.7x), і урок це прямо каже.
- `slots=True`: питання просить "для пам'яті й швидкості". Пам'ять показано (96 проти 64 байтів на екземпляр з трьома
  полями), а прискорення доступу в 3.12 вимірювання не підтвердило (26 проти 26–29 мс на мільйон читань), тому урок
  каже про це чесно і пояснює через ліниві `__dict__` з 3.11. Друга практична перевага, `AttributeError` на одруківку,
  показана окремо.
- `asdict` показано як глибоку копію через `is` і зміну копії; повільність виміряно на дереві з 1111 елементів
  (приблизно 1.3 мс проти 0.18 мс у ручної функції).
- Генераторна версія `walk` з `yield from` свідомо не використана: це m5-l02, у тексті є посилання.
  `typing.get_type_hints`, `ClassVar`, `Literal`, `from __future__ import annotations` дано на рівні, потрібному для
  dataclass, з посиланням на m2-l06. `InitVar` і `field(hash=...)` не розглядались: питання їх не вимагають.
- `copy.replace` (3.13) не згадано, курс на 3.12.
- Проєктне завдання p1 створює `src/formbuilder/domain.py` і `tests/test_domain.py` у капстоуні. Воно спирається на
  скелет з m0-l06 і на синтаксис smoke-тесту звідти; `pytest.raises` дано одним рядком з посиланням на m3-l03.
  `verify` у тому самому форматі, що p1 у m2-l09. Перетворення Pydantic-моделей m2-l09 у ці dataclass поки ніде не
  описане як завдання: варто додати в m2-l09 або m3 функцію `to_domain(config: models.FormConfig) -> domain.FormConfig`.

## Незакриті питання

Усі 12 питань з `questions.md` закриті кодом і виводом.

## Залежності

- Спирається на m1-l03 (`is` проти `==`), m1-l05 (class patterns у `match`), m1-l07 (mutable default, keyword-only
  параметри), m1-l10 (`sorted(key=)`), m2-l04 (`NamedTuple` у порівняльній таблиці).
- Готує m2-l06 (`Literal`, `ClassVar`, `str | None`, forward references, `get_type_hints`, `TypedDict` проти dataclass),
  m2-l09 (правило "dataclass всередині, Pydantic на межі", `Element(**data)` не відновлює вкладені рівні як мотивація
  для `model_validate`), m4-l02 (dunder-методи, які тут генерує decorator), m5-l02 (`walk` як генератор),
  m5-l03 (hashable frozen-записи як ключі кешу).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `verify` p1 переведено на `cd capstone && uv run pytest tests/test_domain.py -q`; у prompt `models.py` замінено на `config.py`.
- Запропонована тут задача `to_domain` додана в m2-l09 як t6 (а функція лягає в `config.py`, p1 m2-l09).

## Редакторська правка: відповідність завдань пройденому

Правило: завдання використовує лише конструкції, пояснені в попередніх уроках або в цьому уроці до свого маркера.

Що змінено: нічого. Аудит усіх завдань не знайшов конструкцій з пізніших уроків чи з цього уроку після маркера. Синтаксис класу вводиться саме тут, для dataclass; методи з `self` (`__post_init__`) теж.

Завдання уроку:
- t1 `Choice`/`make_choices`: `@dataclass`, default і `field(default_factory=list)` з розділу "Поля", m1-l10 (list comprehension), m1-l04 (`upper`).
- t2 `Theme`, `unique_themes`, `dark_map`: `frozen=True`, `replace`, `FrozenInstanceError` з розділу до маркера; m2-l01 (set/dict як "уже бачене"). `Literal["light", "dark"]` у стартері показаний у прикладі на початку уроку з посиланням на m2-l06; на розв'язок не впливає.
- t3 `Condition.__post_init__`: `__post_init__` і `object.__setattr__` з розділу до маркера, m1-l02 (`isinstance` з кортежем, `type(x).__name__`), m1-l11 (`raise ValueError`).
- t4 `render`: m1-l05 (`match` з class patterns), позиційні підпатерни через `__match_args__` і рядкова анотація `"Element"` з розділу "Дерево елементів" до маркера, m1-l08 (рекурсія).
- t5 `rename_field`: `replace`, `slots`/`kw_only`, `from __future__ import annotations` з цього уроку до маркера; m1-l07 (`**changes`), m1-l09 (`any` з generator expression), m1-l06 (`zip`). `walk` у стартері рекурсивний зі списком, без генераторів.
- q1-q3: рівність dataclass різних класів, unhashable не-frozen dataclass, `order=True`; кожен після свого розділу.
- p1 (проєкт, легка перевірка): згадує `with pytest.raises(...)` (with-блок у m4-l07, pytest у m3-l03); у тексті це подано як готовий рядок з посиланням, учню достатньо скопіювати. Не змінювалось.
