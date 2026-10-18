# Ключові питання уроку m5-l03 "itertools і functools: partial, lru_cache, reduce, wraps"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] itertools як "lodash для ітераторів", усе ліниве: `chain`, `islice`, `count`, `cycle`, `repeat`, `takewhile`/`dropwhile`, `zip_longest`, `product`, `permutations`/`combinations`, `accumulate`, `batched` (3.12+), `pairwise` (3.10+), `groupby` (потребує сортування, посилання на m2-l04), `tee` і його пастка. Кожна з прикладом і JS-відповідником або "немає аналога".
- [x] `functools.partial`: фіксація аргументів, `.func/.args/.keywords`, порівняння з `bind` і з lambda (посилання на m1-l09); `partialmethod` одним реченням.
- [x] `functools.cache` і `lru_cache(maxsize)`: мемоізація, вимоги до аргументів (hashable), `cache_info`, `cache_clear`, пастка з методами (кеш тримає `self` і росте), `cached_property` (посилання на m4-l03). Коли кеш це баг (змінювані результати, час).
- [x] `functools.reduce`: як працює, чому в Python рідко (є `sum`, `max`, `math.prod`, `"".join`, `accumulate`), коли все ж доречний.
- [x] `functools.wraps`: навіщо декоратору (зберегти `__name__`, `__doc__`, `__wrapped__`), показати "до" і "після" (посилання на m5-l04, де декоратори повністю).
- [x] `functools.singledispatch`: перевантаження за типом першого аргументу як заміна ланцюжку `isinstance`; `singledispatchmethod`. Рендер елемента за типом через dispatch.
- [x] `functools.total_ordering` (посилання на m4-l02), `cmp_to_key` для старих компараторів, `operator` модуль як пара до functools (посилання на m1-l09).
- [x] Комбінування: конвеєр `chain.from_iterable → map → filter → islice` і коли замість цього писати генераторну функцію заради читабельності.
- [x] Для капстоуну: `batched` для публікації сторінок пачками, `lru_cache` на завантаженні теми з диска, `singledispatch` для рендеру елементів за типом dataclass (посилання на m2-l05), `partial` для попередньо налаштованого рендерера.
- [x] Які JS-звички тут шкодять: lodash-ланцюжки на масивах (тут ліниві ітератори), `_.memoize` без думки про hashable, `reduce` для всього, `bind` для фіксації аргументів, `chunk` через `slice` у циклі.
