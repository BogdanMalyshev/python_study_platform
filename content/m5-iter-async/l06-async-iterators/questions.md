# Ключові питання уроку m5-l06 "Асинхронні ітератори й генератори, async with"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. m5-l05 дав asyncio; тут асинхронні протоколи. Короткий урок: 20–30 абзаців.

- [x] `async for` і протокол `__aiter__`/`__anext__` з `StopAsyncIteration`; чому звичайний `for` не може чекати між елементами; порівняти з `for await (const x of ...)` і `Symbol.asyncIterator`.
- [x] Асинхронні генератори: `async def` з `yield`, `await` усередині, `async for` як споживач; типовий випадок: читання сторінок API або потоку подій. Аналог `async function*`.
- [x] Асинхронні comprehension: `[x async for x in agen()]`, `await` усередині comprehension, і де вони дозволені (лише в `async def`).
- [x] `async with` і протокол `__aenter__`/`__aexit__`, `contextlib.asynccontextmanager`; чому `with` не підходить для ресурсів з асинхронним відкриттям (клієнт httpx, посилання на m5-l07, lifespan FastAPI, посилання на m7-l01).
- [x] Очищення асинхронних генераторів: `aclose()`, `asyncio.run` закриває їх наприкінці, `contextlib.aclosing`, пастка з перерваним `async for`.
- [x] Паралельне споживання: асинхронний генератор сам по собі послідовний; для паралелізму потрібні Task або `asyncio.as_completed` (посилання на m5-l05); патерн "генератор продюсер + черга".
- [x] Типізація: `AsyncIterator`, `AsyncGenerator`, `AsyncIterable` з `collections.abc`.
- [x] Для капстоуну: асинхронний генератор подій статусу генерації (`queued → running → done`), який WebSocket-ендпоінт у m7-l04 буде стрімити клієнту; `asynccontextmanager` для пулу воркерів.
- [x] Які JS-звички тут шкодять: `for await` по масиву промісів (тут `asyncio.as_completed`), очікування, що `async` генератор можна споживати звичайним `for`, `await using`.
