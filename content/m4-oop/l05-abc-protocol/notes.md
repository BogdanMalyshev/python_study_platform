# Нотатки до m4-l05 "ABC проти Protocol: номінальний контракт і структурний"

## Що запускалось

Середовище: `.venv/bin/python` (Python 3.12.12) і `.venv/bin/mypy` (mypy 2.4.0, compiled) з кореня проєкту. Тимчасові файли лежали в підпапці `m4-l05` scratch-директорії, після перевірки її видалено.

- `lesson.md`: скрипт витягував кожен блок ```` ```python ```` / ```` ```python live ```` разом із суміжними ```` ```text ```` блоками. Заголовок `$ mypy --strict NAME.py` означає: код записано в `NAME.py`, запущено `mypy --strict NAME.py` з тієї ж директорії, вивід порівняно дослівно (тому номери рядків у виводі відповідають рядкам блоку). Заголовок `$ python NAME.py` або його відсутність: запуск через `.venv/bin/python`, порівнювались stdout плюс останній рядок traceback, якщо був виняток. 29 python-блоків теорії, 31 text-блок, розбіжностей 0. Вісім коротких фрагментів у "Типові помилки" ілюстративні й окремо не запускались; кожен з них повторює поведінку, показану запуском вище в уроці.
- Перший прогін дав три розбіжності, усі виправлено реальним виводом або зміною коду: `CsvExporter(JsonExporter)` з property поверх атрибута класу mypy відхиляв (`Cannot override writeable attribute with read-only property`), тож `CsvExporter` тепер наслідує `Exporter` напряму; `Disabled(Markdown)` з `render = None` давав `[assignment]`, тож `Disabled` без бази; один номер рядка в `java_ts.py`.
- TS-фрагменти перевірено локальним `tsc` 5.9.3 (`--strict --noEmit`) з іншого проєкту користувача: TS2515 (точний текст без лапок навколо `render`), TS2511, TS1245 для абстрактного методу з тілом, і що `const b: BaseRenderer = new Fake()` проходить (abstract class як тип структурний).
- `tasks.yaml`: розпарсено `yaml.safe_load`; кожен `<!-- task: id -->` вставлено рівно один раз. Для кожного `type: code` виконано `solution + harness`, stdout порівняно з `expected` після нормалізації: 4 з 4 збігаються. Кожне `solution` окремо проходить `mypy --strict`. Кожен `starter` компілюється, а `starter + harness` не дає `expected`.
- t3: три хибні варіанти хука перевірено мутаціями, кожен харнес відхиляє: без `cls is not Exportable` (`Strict` стає структурним), без перевірки на `None` (`Disabled` визнається), `return False` замість `NotImplemented` (`LegacyRow` перестає визнаватись через `register`).
- t4: останній рядок харнесу перевіряє, що `get`, `keys`, `items`, `values`, `__contains__`, `__eq__` не визначені в класі учня, тобто прийшли з `Mapping`.
- Квізи: код кожного запущено через python і mypy. q1 `created` + `NotImplementedError`; q2 `AttributeError` до `print`, mypy `Success`; q3 `True` + `TypeError: object of type 'Form' has no len()`; q4 `True` + `IndexError`.
- Твердження, перевірені окремими пробними запусками, а не блоком уроку: таблиця mixin-методів у розділі `collections.abc` згенерована обходом `vars()` по MRO кожного ABC і збігається з таблицею документації; `Sized.__subclasshook__` і `Mapping.__abc_tpflags__` прочитано у `_collections_abc.py` інтерпретатора (код не цитується, у уроці власний еквівалент `HasRender`); `__subclasshook__` з `-> bool` і `return NotImplemented` дає в `--strict` `[no-any-return]`, тому в уроці `-> Any`; порядок `issubclass` (хук, потім MRO, потім реєстр) перевірено класом `Vetoing`, де `False` перекриває і наслідування, і `register`.

## Рішення

- Розділів `##` десять: шість теоретичних, `Для капстоуну` і три обов'язкові.
- Теорії 29 абзаців без callout-блоків (9 callout-ів окремо), у межах 20–40; найдовший пробіг без коду чи завдання 3 абзаци. Поділ не пропоную.
- Protocol не перевикладається: лише одна таблиця порівняння, правило вибору і посилання на m2-l07. Від m2-l07 узято контраст "Protocol без `@abstractmethod` створюється в рантаймі" і доповнено фактом, що `_ProtocolMeta` наслідує `ABCMeta`, тому `@abstractmethod` у протоколі все ж працює для явних підкласів.
- `NotImplementedError` одним реченням з посиланням на m4-l04, як просить питання. Пастка `class X(dict)` з обхідним `__getitem__` показана одним коротким блоком як мотивація для `Mapping`, розбір і `UserDict` лишено m4-l04.
- Для `Sequence` окремого прикладу класу немає: mypy вимагає для `__getitem__` overload на `int` і `slice`, і це роздуло б урок. `Sequence`, `MutableSequence`, `MutableMapping`, `Set` закриті таблицею (абстрактні методи надруковано кодом) і рядком про номінальність.
- `typing.final` на шаблонному методі введено одним mypy-блоком разом з `[safe-super]`: обидва статичні запобіжники template method; p1 вимагає `@final` у капстоуні.
- Завдання: 4 `type: code` (усі `runtime: browser`, лише stdlib, детерміновані; повідомлення `TypeError` про абстрактні методи в CPython 3.12 сортують імена, тож текст стабільний), 4 `type: quiz`, 1 `type: project`. Фінальне завдання t4 це власний `Mapping` над деревом елементів з mixin-методами.
- p1: `verify` у форматі специфікації (`cd capstone && uv run ...`). У `capstone/` поки немає `renderers.py` з m2-l07 і тестів рендерерів, тож команда проти реального репозиторію не запускалась; еталон з розділу "Для капстоуну" перевірено як окремий файл (`mypy --strict` Success, вивід у уроці).

## Незакриті питання

Немає. Усі 10 пунктів `questions.md` закриті кодом, виводом інтерпретатора і, де йдеться про статику, реальним виводом `mypy --strict`.

## Залежності

- Спирається на m2-l07 (Protocol, `@runtime_checkable`, `[abstract]` для явних підкласів протоколу, вбудовані протоколи `Sized`/`Iterable`), m2-l06 (`Mapping[str, X]` як тип), m2-l05 (frozen dataclass), m4-l02 (`__eq__` робить клас unhashable, контейнерні special methods), m4-l04 (MRO, `super()`, `NotImplementedError`, пастка наслідування `dict`), m1-l05 (`match`, включно з шаблоном-словником).
- Готує для m4-l06 (ще один metaclass, `EnumMeta`; `kind: Literal[...]` у дереві стане enum), m4-l08 (template method через ABC проти функції з кроками-параметрами, Registry), m5-l01 (`Iterator` з `collections.abc`, mixin `__iter__`), m7-l06 (Jinja2-рендерер як реалізація `Renderer` без `BaseRenderer`).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- p1 переводить `BaseRenderer` з m4-l04 на ABC у `renderers/base.py` замість додавати другий клас з тим самим іменем; `TimingMixin` прибирається (конфлікт з `@final`), вимір часу повертається декоратором `@timed` з m5-l04. Замість функції `publish` чекліст посилається на `generate` з m3-l04.
