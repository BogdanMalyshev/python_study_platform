# Ключові питання уроку m6-l07 "os, sys, signal: коректне завершення по SIGTERM"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Сигнали й процеси недоступні в Pyodide: реальні приклади non-live з локальним виводом, завдання `runtime: local` у `practice/m6-l07/`, у браузері quiz і чисті функції. Короткий урок: 25–30 абзаців.

- [x] `sys`: `argv`, `exit`, `stdin`/`stdout`/`stderr`, `path`, `version_info`, `platform`, `executable`, `getsizeof`, `setrecursionlimit`; що з цього вже бачили (посилання на m0-l03) і що нове.
- [x] `os`: `environ`, `getcwd`/`chdir`, `getpid`, `cpu_count`, `urandom`, `os.name`/`platform.system()`; що з `os.path` лишається (посилання на m6-l01); `os.fork` лише згадка.
- [x] Сигнали: `SIGINT` (Ctrl-C → `KeyboardInterrupt`), `SIGTERM` (docker stop, systemd, kill), `SIGKILL` не перехоплюється, `SIGHUP`; `signal.signal(SIGTERM, handler)`, обмеження обробника (виконується в головному потоці між байткодами), встановлення прапорця замість важкої роботи.
- [x] Graceful shutdown синхронного воркера: прапорець `stop_requested`, дообробка поточної задачі, запис стану, вихід з кодом 0; таймаут на завершення.
- [x] Graceful shutdown в asyncio: `loop.add_signal_handler(SIGTERM, ...)`, скасування задач, `asyncio.run` і `KeyboardInterrupt` (посилання на m5-l05); чому `signal.signal` з asyncio працює гірше.
- [x] `atexit` для очищення, і коли він не спрацює (SIGKILL, `os._exit`); контекстні менеджери як надійніша альтернатива (посилання на m4-l07).
- [x] Docker і PID 1: сигнал приходить процесу Python лише якщо він PID 1 або запущений через `exec`; `tini` одним реченням; посилання на m7-l07.
- [x] Для капстоуну: воркер генерації з обробкою SIGTERM: не брати нові задачі з черги, дочекатись поточних з таймаутом 10 с, записати незавершені назад у чергу (SQLite, посилання на m6-l08), вийти.
- [x] Які JS-звички тут шкодять: `process.on("SIGTERM", ...)` з async-колбеком (тут обробник синхронний), `process.exit()` всередині обробника, очікування `beforeExit`, `unhandledRejection`-аналоги.
