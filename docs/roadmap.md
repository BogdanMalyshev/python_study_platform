# Роадмап: Python для Senior Frontend-розробника

Версія 3 від 18.10.2026. Профіль учня: 5+ років JavaScript / TypeScript / React / Next.js, lead-досвід,
Jest і Cypress, Zod, GraphQL, socket.io. Проєктував контракти з Python-бекендом FormBuilder, але сам бекенд не писав.

Межі курсу: мова Python та її екосистема. Бекенд присутній лише настільки, наскільки це Python: FastAPI, Pydantic,
asyncio, тести, пакування. Бази даних, HTTP-теорія, автентифікація, інфраструктура й архітектура бекенду
винесені в окремий майбутній курс. Там, де капстоун потребує сховища, використовується найпростіше (SQLite
через стандартну бібліотеку або JSON-файли) з позначкою "глибше в курсі про бази даних".

Джерела: Python Tutorial, roadmap.sh/python, CS50P, Automate the Boring Stuff, PCEP/PCAP, Python for Everybody,
MIT 6.100L, документація typing, Pydantic, FastAPI, pytest, uv, ruff; книги Fluent Python, Python Distilled.

## Принципи

- Кожен урок має блок "JS-аналог": що це в JavaScript / TypeScript і де Python поводиться інакше. Вчимо різницю, а не з нуля.
- Основи програмування (що таке змінна, цикл, функція), git, базове відлагодження як окремі уроки пропущені. Усе це вже є.
- Завдання на платформі з першого модуля функції з типами: перевірка викликає функцію і порівнює результат.
- Один наскрізний капстоун: бекенд FormBuilder на Python. Росте з модуля 2 і закривається в модулі 7.
- Темп: 8–10 годин на тиждень, 10–11 тижнів до капстоуну включно.

---

## Етап A. Мова (модулі 0–5, 6.5 тижня)

### Модуль 0. Старт і інструменти (0.5 тижня)
1. Установка через uv або pyenv, кілька версій Python поруч — JS-аналог: nvm
2. Віртуальне оточення, pip, uv, pyproject.toml — JS-аналог: node_modules, package.json, lockfile
3. REPL, запуск скриптів, `python -m`, `if __name__ == "__main__"`
4. ruff як лінтер і форматер, базова конфігурація — JS-аналог: ESLint + Prettier в одному
5. Читання traceback знизу вгору, `breakpoint()`, pdb за 15 хвилин — JS-аналог: debugger у DevTools
6. Структура проєкту: src-layout, tests/, точка входу

Завдання: налаштувати проєкт-шаблон, який далі використовується для капстоуну.

### Модуль 1. Синтаксис через призму JS (1 тиждень)
1. Відступи замість дужок, snake_case, немає `;`, немає hoisting, порядок визначень важливий
2. Типи: int без переповнення, float, str як незмінна послідовність, bool, None — JS-аналог: null і undefined злиті в None
3. `==` проти `is`, truthiness: порожні колекції хибні, `0 == False` — JS-аналог: `===` і коерція
4. Рядки: f-рядки, методи, зрізи — JS-аналог: template literals, slice
5. Умови, `match` — JS-аналог: switch без fallthrough і з деструктуризацією
6. Цикли: `for x in` ітерує значення, не індекси; `range`, `enumerate`, `zip`; `else` у циклі — JS-аналог: for...of, entries()
7. Функції: позиційні та іменовані аргументи, значення за замовчуванням (пастка з mutable default), `*args`, `**kwargs` — JS-аналог: rest / spread, деструктуризація параметрів
8. Область видимості LEGB, `global` і `nonlocal`, замикання — JS-аналог: лексичний scope, але блоки не створюють scope
9. `lambda` лише вираз — JS-аналог: arrow function; чому в Python пишуть `def`
10. Comprehensions замість ланцюжків `map` / `filter`; `sorted(key=)`, `any`, `all`
11. Винятки: `try / except / else / finally`, ієрархія, `raise from`, EAFP замість LBYL — JS-аналог: try/catch, але в Python винятки це нормальний control flow

Завдання: 10–12 функцій-перекладів з JS на Python з однаковою поведінкою.

### Модуль 2. Структури даних і типізація (1 тиждень)
1. list / tuple / dict / set проти Array / Object / Map / Set; dict зберігає порядок вставки
2. Змінюваність, aliasing, `copy` і `deepcopy` — JS-аналог: spread-копія vs structuredClone
3. Зрізи, розпакування, `*rest`, обмін значеннями
4. collections: Counter, defaultdict, deque, namedtuple
5. dataclasses як "типізований об'єкт" — JS-аналог: interface + конструктор; `frozen=True` як readonly
6. typing: `list[str]`, `dict[str, int]`, Optional, Union, Literal, TypedDict, Generic, TypeVar — JS-аналог: TS types один в один
7. Protocol: структурна типізація — JS-аналог: TS interface за формою, duck typing офіційно
8. mypy або pyright у strict-режимі; чим перевірка типів у Python відрізняється від TS (runtime їх ігнорує)
9. Pydantic v2: BaseModel, валідатори, `model_validate`, `model_dump`, помилки — JS-аналог: Zod schema, parse, safeParse, infer

Завдання: описати JSON-конфіг форми з FormBuilder як набір Pydantic-моделей з валідацією conditional-правил. Перша частина капстоуну.

### Модуль 3. Модулі, пакети, тести (1 тиждень)
1. Система імпортів: абсолютні й відносні, `__init__.py`, циклічні імпорти — JS-аналог: ESM, barrel-файли
2. Пакет із pyproject.toml, залежності, dev-залежності, lockfile через uv
3. pytest: функції `test_`, голий assert без матчерів, `parametrize`, fixtures, `conftest.py`, `tmp_path`, `monkeypatch` — JS-аналог: Jest describe / it / beforeEach / jest.mock
4. Моки: `unittest.mock`, `pytest-mock`; coverage
5. doctest як документація, що виконується
6. pre-commit з ruff і mypy

Завдання: покрити тестами Pydantic-моделі з модуля 2; параметризований тест на 20 валідних і невалідних конфігів.

### Модуль 4. ООП і протоколи по-пайтонівськи (1 тиждень)
1. Класи, `__init__`, `self`, атрибути класу й екземпляра — JS-аналог: class, this, static
2. dunder-методи: `__repr__`, `__eq__`, `__hash__`, `__len__`, `__getitem__`, `__iter__`, `__call__`
3. property замість геттерів / сеттерів; `__slots__`
4. Наслідування, `super()`, MRO, множинне наслідування і mixins — JS-аналог: одинарне наслідування, mixins через функції
5. ABC проти Protocol: коли номінальна типізація, коли структурна
6. Enum, StrEnum — JS-аналог: TS enum, union of literals
7. Контекстні менеджери: `with`, `contextlib.contextmanager` — JS-аналог: try/finally, `using` в TS 5.2
8. Композиція замість наслідування; знайомі патерни в ідіоматичному Python: Strategy як функція, Singleton як модуль, Decorator як декоратор, Observer як список callback-ів

Завдання: модель дерева елементів FormBuilder як класи з `__iter__` для обходу, `__getitem__` за id, Protocol для рендерерів.

### Модуль 5. Ітератори, генератори, декоратори, asyncio (2 тижні)
1. Протокол ітерації: `__iter__`, `__next__`, StopIteration — JS-аналог: Symbol.iterator
2. Генератори, `yield`, `yield from`, генераторні вирази, ліниві конвеєри — JS-аналог: function*
3. itertools, functools: `partial`, `lru_cache`, `reduce`, `wraps`
4. Декоратори функцій і класів, декоратори з параметрами — JS-аналог: TS decorators, HOC у React
5. asyncio: event loop, корутини, `await`, Task, `gather`, `TaskGroup`, таймаути, скасування — JS-аналог: Promise, Promise.all, AbortController. Ключова різниця: цикл подій запускається явно, а блокуючий виклик зупиняє все
6. Асинхронні ітератори й генератори, `async with`
7. httpx для асинхронних запитів — JS-аналог: fetch
8. GIL, threading, multiprocessing, concurrent.futures: що куди — JS-аналог: worker_threads, cluster
9. Логування: logging, structlog, рівні, формат, контекст — JS-аналог: pino, console.*

Завдання: асинхронний пайплайн генерації: конфіги читаються генератором, рендеряться паралельно через TaskGroup з лімітом через Semaphore, результати логуються.

---

## Етап B. Python у реальній роботі (модулі 6–7, 4 тижні)

### Модуль 6. Стандартна бібліотека і CLI (1 тиждень)
1. pathlib, shutil, tempfile — файли генерації
2. json, csv, tomllib, yaml
3. datetime, zoneinfo, UTC за замовчуванням — JS-аналог: Date і Temporal
4. re проти JS RegExp: іменовані групи, verbose-режим, `re.compile`
5. subprocess: виклик зовнішнього процесу (наприклад, Node-рендерера) з Python, стріми stdout
6. CLI: argparse або Typer; змінні оточення, pydantic-settings — JS-аналог: commander, dotenv
7. os, sys, signal: коректне завершення по SIGTERM
8. sqlite3 зі стандартної бібліотеки як сховище для капстоуну, лише на рівні "зберегти і прочитати" (глибше в курсі про бази даних)

Завдання: CLI `formbuilder build config.json --out dist/`, яка валідує конфіг, викликає рендер і пише статику; історія збірок у SQLite.

### Модуль 7. FastAPI і капстоун (3 тижні)
Тут лише те, що є Python: фреймворк, моделі, асинхронність, тести, пакування. Теорія HTTP, REST, автентифікація, бази даних, черги та інфраструктура йдуть в окремий курс.

1. FastAPI: роутери, Pydantic-моделі запитів і відповідей, `Depends` як інʼєкція залежностей — JS-аналог: контролери й провайдери в NestJS
2. Обробка помилок, middleware, CORS, автоматична OpenAPI-документація
3. Фонові задачі: `BackgroundTasks` і власний воркер на asyncio з чергою `asyncio.Queue`
4. WebSocket у FastAPI для статусу генерації — JS-аналог: socket.io з боку сервера
5. Тести API: pytest + httpx AsyncClient, фікстури для застосунку й тимчасового сховища
6. Jinja2: шаблони як простий рендерер статики
7. Пакування й запуск: uvicorn, Dockerfile з uv, змінні оточення
8. Оглядово: Django, Flask, Litestar, коли що вибирають

**Капстоун: FormBuilder Backend на Python.** Бекенд, який у Volsor писали без вас:
- приймає типізований JSON-конфіг форми, валідує через Pydantic (модуль 2)
- зберігає версії конфігів у SQLite (модуль 6)
- ставить задачу генерації в чергу, воркер рендерить сторінку через Jinja2 або зовнішній рендерер через subprocess
- публікує статику у директорію, повертає URL
- віддає статус генерації через WebSocket
- тести, Docker, README зі схемою

Готово, коли: один контейнер піднімає API і воркер, а POST конфігу закінчується готовою статичною сторінкою. На співбесіді це дає чесну фразу: "бекенд FormBuilder був на Python, контракти проєктував я, а потім реалізував власну версію".

---

## Етап C. Опціонально, після капстоуну

### C1. Дані (3–4 тижні)
pandas і NumPy для аналітики на кшталт SUPROI: агрегації по кампаніях, воронки, конверсії; Matplotlib або Plotly; Jupyter. Спосіб робити аналітичну частину самому.

### C2. Автоматизація (2–3 тижні)
requests і BeautifulSoup, Excel через openpyxl, планувальник через APScheduler, Telegram-боти через aiogram. Для звітів і внутрішніх інструментів.

### Паралельна доріжка: задачі
2–3 рази на тиждень по 30 хвилин розв'язувати алгоритмічні задачі на Python (NeetCode, рівень easy). Це не про алгоритми, а про швидкість набору ідіоматичного синтаксису: зрізи, comprehensions, Counter, sorted(key=).

---

## Темп

| Частина | Тривалість при 8–10 год/тиждень |
|---|---|
| Етап A, мова (модулі 0–5) | 6.5 тижня |
| Етап B, FastAPI і капстоун (модулі 6–7) | 4 тижні |
| Разом | 10–11 тижнів |
| Етап C, один напрямок | ще 2–4 тижні |

При 15+ годинах на тиждень етапи A+B стискаються до 6–7 тижнів. Найбільший резерв часу: капстоун, він може зайняти стільки ж, скільки весь модуль 5.

## Що свідомо пропущено
- Основи програмування, git, базове відлагодження, PEP 8 як окремий урок.
- Бази даних, SQL, ORM, міграції; HTTP-теорія, REST-дизайн, автентифікація, кешування, черги, Docker глибше за один Dockerfile. Окремий курс.
- Jupyter і наукові бібліотеки поза етапом C, GUI, ігри.

## Ресурси
- Офіційний туторіал, вибірково розділи 4–9 і 12 — https://docs.python.org/3/tutorial/
- typing: cheat sheet mypy — https://mypy.readthedocs.io/en/stable/cheat_sheet_py3.html ; документація typing — https://docs.python.org/3/library/typing.html
- Pydantic v2 — https://docs.pydantic.dev/latest/
- pytest — https://docs.pytest.org/
- uv — https://docs.astral.sh/uv/ ; ruff — https://docs.astral.sh/ruff/
- asyncio — https://docs.python.org/3/library/asyncio.html
- FastAPI — https://fastapi.tiangolo.com/
- Книги: "Fluent Python" (Ramalho) для модулів 4–5; "Python Distilled" (Beazley) як стислий довідник
- Швидкий огляд синтаксису для тих, хто вже програмує — https://learnxinyminutes.com/docs/python/
- Для звірки порядку тем: roadmap.sh/python, cs50.harvard.edu/python, pythoninstitute.org/pcap-exam-syllabus
