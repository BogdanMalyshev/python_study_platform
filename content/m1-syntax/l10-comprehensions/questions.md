# Ключові питання уроку m1-l10 "Comprehensions замість map і filter"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] Синтаксис list comprehension `[expr for x in iterable if cond]`: порядок частин, як читати (зліва вираз, далі цикл, далі фільтр), чим це дорівнює звичайному циклу з `append`. Переклад `arr.filter(f).map(g)` у одну comprehension.
- [x] Умова в кінці (фільтр) проти тернарного виразу на початку (`a if c else b for x in ...`): це різні речі й стоять у різних місцях. Поширена плутанина.
- [x] Вкладені цикли `[(x, y) for x in xs for y in ys]`: порядок такий самий, як у вкладених `for`; сплющення списку списків `[item for row in grid for item in row]`. Чому `flat()`/`flatMap()` тут не потрібні.
- [x] Dict comprehension `{k: v for ...}`, set comprehension `{x for ...}`, і чому `{}` порожнє це dict, а не set. Інвертування словника, побудова індексу `{el["id"]: el for el in elements}`.
- [x] Generator expression `(x for ...)`: лінивий, одноразовий, без дужок усередині виклику `sum(x for x in ...)`. Коли gen expr замість list comprehension (великі дані, `any`/`all`/`sum`/`max`, `join`). Детально про генератори в m5-l02.
- [x] Своя область видимості: змінна циклу не витікає назовні (на відміну від звичайного `for`, посилання на m1-l08). Але вкладена змінна бачить зовнішні.
- [x] Межа читабельності: коли comprehension перетворюється на нечитабельний однорядник (більше двох `for`, вкладені тернарники, side effects) і треба повернутись до циклу. Правило: comprehension будує значення, цикл робить дії. `[print(x) for x in xs]` як антипатерн.
- [x] Walrus у comprehension `[y for x in xs if (y := f(x)) is not None]` як спосіб не обчислювати двічі.
- [x] Продуктивність: comprehension швидша за цикл з `append` і за `map` з lambda; `map` з builtin-функцією (`map(str, xs)`) може бути швидшою за comprehension. Показати через `timeit` один раз, без культу мікрооптимізацій.
- [x] Вкладені comprehension для матриць `[[0] * n for _ in range(m)]` і пастка `[[0] * n] * m` (один і той самий внутрішній список, посилання на m2-l02).
- [x] Для капстоуну: зібрати всі імена полів з дерева елементів форми (рекурсія + comprehension), побудувати словник `{name: element}`, відфільтрувати елементи з `visible_if`.
- [x] Які JS-звички тут шкодять: ланцюжки `.map().filter()`, `forEach` для побудови масиву, `Object.fromEntries(entries.map(...))` замість dict comprehension, `reduce` для сум і групування (у Python `sum`, `Counter`, `defaultdict`).
