# Ключові питання уроку m5-l05 "asyncio: event loop, який треба запустити самому"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Учень добре знає Promise, async/await і event loop у Node: кожна концепція подається через зіставлення, а головна увага на відмінностях.

- [x] Що таке корутина в Python і чому виклик `async def`-функції без `await` нічого не виконує (на відміну від JS, де виклик async-функції одразу запускає тіло до першого `await`)? Що таке "coroutine was never awaited"?
- [x] Чому в Python немає "вбудованого" event loop, що робить `asyncio.run()`, і чому його не можна викликати з уже запущеного циклу? Де тут різниця з Node, де цикл є завжди?
- [x] Що робить `await` з корутиною: послідовно чи паралельно? Чому два `await fetch_a(); await fetch_b()` виконуються один за одним, і що є аналогом `Promise.all`?
- [x] Що таке `Task`, чим `asyncio.create_task` відрізняється від простого `await`, що станеться з Task, на який ніхто не чекає і на який ніхто не тримає посилання (garbage collection, зникнення задачі)?
- [x] `asyncio.gather` проти `asyncio.TaskGroup` (3.11+): поведінка при винятку в одній із задач, `return_exceptions`, скасування решти, `ExceptionGroup` і `except*`. Аналоги `Promise.all` і `Promise.allSettled`.
- [x] Чому `time.sleep(1)` усередині корутини зупиняє весь цикл, а `await asyncio.sleep(1)` ні? Що взагалі означає "блокуючий виклик" і як його виявити (`asyncio.run(debug=True)`, slow callback warning)?
- [x] Як виконати блокуючу або CPU-важку функцію, не зупиняючи цикл: `asyncio.to_thread`, `loop.run_in_executor`, `ProcessPoolExecutor`. Коли що (посилання на m5-l08 про GIL).
- [x] Як працюють таймаути і скасування: `asyncio.wait_for`, `asyncio.timeout()` (3.11+), `task.cancel()`, `CancelledError`, чому його не можна ковтати через голий `except Exception` (`CancelledError` це `BaseException`), і де тут аналог `AbortController`?
- [x] Як обмежити паралелізм: `asyncio.Semaphore` навколо корутини, патерн "N воркерів читають з `asyncio.Queue`". Аналог `p-limit`.
- [x] Як виглядає порядок виконання у простому прикладі з `create_task`, `await asyncio.sleep(0)` і `print`: передбачити вивід до запуску і пояснити, чому саме так. Чи є в asyncio аналог мікрозадач і `process.nextTick`?
- [x] Чому "асинхронна" функція, яка всередині викликає синхронну бібліотеку (`requests`, синхронний драйвер БД), не дає переваг, і як це перевірити?
- [x] Асинхронні контекстні менеджери й ітератори: `async with`, `async for`, навіщо вони (одне речення й посилання на m5-l06, детально там).
- [x] Для капстоуну: як виглядає скелет воркера генерації: черга задач, N воркерів з Semaphore, graceful shutdown через скасування задач.
