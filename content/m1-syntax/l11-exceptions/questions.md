# Ключові питання уроку m1-l11 "Винятки: try/except/else/finally, EAFP"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] `try / except / else / finally`: що робить кожна частина, коли виконується `else` (лише якщо винятку не було) і чому це корисно (вузький `try`). Порядок виконання з `return` усередині `try` і `finally`.
- [x] Перехоплення конкретного типу `except ValueError:`, кількох `except (TypeError, ValueError):`, доступ до об'єкта `as e`, `str(e)`, `e.args`. Чому голий `except:` і `except Exception:` майже завжди помилка (ковтає `KeyboardInterrupt`, `CancelledError`, приховує баги).
- [x] Ієрархія: `BaseException` → `Exception` → `ValueError`, `TypeError`, `KeyError`, `IndexError`, `AttributeError`, `LookupError` як батько `KeyError`/`IndexError`, `OSError`/`FileNotFoundError`. Як `except LookupError` ловить обидва. `SystemExit`, `KeyboardInterrupt` поза `Exception` і чому.
- [x] `raise`: кинути виняток з повідомленням, `raise` без аргументів для повторного кидання всередині `except` (зберігає traceback), `raise ... from e` для ланцюжка причин і `from None` для приховування. Як виглядає "During handling of the above exception, another exception occurred" і чим відрізняється від "The above exception was the direct cause".
- [x] Власні винятки: клас-нащадок `Exception`, ієрархія власних винятків для домену (`ConfigError` → `UnknownElementType`), додаткові атрибути через `__init__`. Чому імена закінчуються на `Error`.
- [x] EAFP проти LBYL: `try: d[key] except KeyError` проти `if key in d:`. Чому в Python винятки це нормальний control flow (ітерація зупиняється через `StopIteration`), чому це дешево, коли винятків мало, і коли LBYL все ж доречний (перевірка вводу користувача). Порівняти з JS, де `throw` для control flow вважають поганим тоном.
- [x] Винятки у стандартних операціях, які JS-розробник не очікує: `d["missing"]` кидає `KeyError` замість `undefined`, `lst[99]` кидає `IndexError`, `int("x")` кидає `ValueError`, `obj.missing` кидає `AttributeError`, `None.x` кидає `AttributeError`, а не `TypeError: cannot read properties of null`. Безпечні альтернативи: `d.get`, `getattr(obj, "x", default)`, `next(it, default)`.
- [x] Читання traceback: знизу вгору, останній рядок це тип і повідомлення, стек викликів вище. Де файл і рядок, як відрізнити ланцюжок причин.
- [x] `finally` для очищення і чому зазвичай замість нього `with` (одне речення й посилання на m4-l07). `try/finally` без `except` як легітимна форма.
- [x] `assert`: інваріанти в коді, а не валідація вводу; вимикається `python -O`; `AssertionError`. Пастка `assert (cond, "msg")` з кортежем завжди істинна.
- [x] Винятки й функції: виняток проходить крізь стек викликів до першого відповідного `except`; функція, яка "повертає помилку" через `None` або `-1`, проти функції, яка кидає. Коли що в API: `find` повертає `-1`, `index` кидає.
- [x] `ExceptionGroup` і `except*` (3.11+): одне речення, навіщо (asyncio TaskGroup, m5-l05), без глибини.
- [x] Для капстоуну: ієрархія винятків валідації конфігу форми, перетворення `ValidationError` з Pydantic (m2-l09) у власний `ConfigError` з `from e`, і де їх ловити (на межі API, а не в кожній функції).
- [x] Які JS-звички тут шкодять: `try { } catch (e) { }` без типу (голий `except`), `throw "string"` (у Python лише екземпляри `BaseException`), `if (result === undefined)` замість очікування винятку, перевірка `e instanceof` через `isinstance` правильно, але `except` за типом краще, `Promise.catch`-мислення.
