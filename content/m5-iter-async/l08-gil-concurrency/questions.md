# Ключові питання уроку m5-l08 "GIL, threading, multiprocessing, concurrent.futures"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Потоки й процеси в браузері платформи недоступні: усі завдання з реальними потоками `runtime: local`; у браузері лише quiz і чисті функції.

- [x] Що таке GIL: один потік виконує байткод у момент часу, перемикання кожні 5 мс або на блокуючому I/O; чому потоки допомагають для I/O і не допомагають для CPU; показати виміром (CPU-задача в 1 і 4 потоках, I/O-задача в 1 і 4 потоках). Порівняти з однопотоковим event loop Node і worker_threads.
- [x] Три моделі і коли яка: asyncio (багато I/O, один потік, явні await), threading (I/O з блокуючими бібліотеками, яких не переписати), multiprocessing (CPU). Таблиця з критеріями. Одне речення про free-threaded 3.13t як експеримент.
- [x] `threading.Thread`, `Lock`, race condition на лічильнику з реальним неправильним результатом і виправленням через `Lock`; `queue.Queue` як безпечна черга між потоками; daemon-потоки.
- [x] `concurrent.futures`: `ThreadPoolExecutor` і `ProcessPoolExecutor` з однаковим API, `submit`/`map`/`as_completed`, `Future`; чому це рекомендований шлях замість ручних потоків.
- [x] multiprocessing: окремі інтерпретатори, передача даних через pickle (що не серіалізується: lambda, відкриті файли), `if __name__ == "__main__"` обов'язковий на macOS (spawn), накладні витрати на старт.
- [x] Міст з asyncio: `asyncio.to_thread` для блокуючих викликів, `loop.run_in_executor(ProcessPoolExecutor(), fn)` для CPU, і чому не можна викликати asyncio-код з потоку без `run_coroutine_threadsafe` (посилання на m5-l05).
- [x] Типові помилки: спільний змінюваний стан без Lock, deadlock з двома Lock, потік, що пережив програму, CPU-робота в asyncio-циклі, ProcessPool з великими аргументами.
- [x] Для капстоуну: рендер HTML це CPU-робота: порівняти async-воркер з `to_thread` і з `ProcessPoolExecutor` на 50 конфігах; вибрати і пояснити.
- [x] Які JS-звички тут шкодять: "Python однопотоковий, як Node" (ні, потоки є, але з GIL), worker_threads з SharedArrayBuffer (тут процеси й pickle), очікування паралелізму від потоків на CPU, Atomics.
