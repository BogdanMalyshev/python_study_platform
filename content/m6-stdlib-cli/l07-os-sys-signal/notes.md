# Нотатки до m6-l07

## Що запускалось

Усе через `.venv/bin/python` (Python 3.12.12, macOS arm64) з кореня проєкту; тимчасові файли в scratch-підпапці
`m6-l07`, видаленій після перевірки. Фонових процесів після перевірки не лишилось (`pgrep` після кожного прогону).

- Усі python-блоки `lesson.md` витягнуто з файлу скриптом і запущено повторно. Блоки без сигналів (`sys`, рекурсія,
  `os`, `os.environ`, `getsignal`, `SIGKILL`/потік) звичайним запуском з кореня курсу, `env -u FB_WORKERS`.
- Блоки із сигналами запускались двома обгортками в scratch:
  - `bg.sh`: `python script.py & sleep N; kill -SIG $!; wait $!; echo "exit code: $?"`, тобто саме те, що показано
    в уроці в ```` ```bash ````-рядках (`no_handler.py` з TERM і KILL, `flag_sleep.py`, `worker.py` в обох сценаріях,
    `gen_worker.py`);
  - `drive.py`: `subprocess.Popen` + `send_signal` + друк `[returncode=N]`. Ним надсилався `SIGINT`
    (`no_handler.py`, `async_int.py`), бо фоновий процес з `&` у неінтерактивному shell має `SIGINT` проігнорованим,
    і `kill -INT $!` до нього не дійде. Також ним запущено `exit_in_handler.py`, `async_bad.py`, `async_good.py`.
- Демо з `entrypoint.sh` без `exec` і з `exec`: скрипт-обгортка, `kill -TERM` на PID shell-а через 1.5 с, далі 4 с
  очікування, щоб побачити вивід осиротілого Python. Час старту інтерпретатора на цій машині плаває (0.05–0.5 с),
  тому в уроці вивід першого чистого прогону; повторний прогін дав той самий результат з іншим моментом сигналу.
- `atexit_demo.py` у трьох режимах, код завершення через `echo $?`.
- Твердження з "Типових помилок": `async def` як обробник `signal.signal` дає `RuntimeWarning: coroutine ... was never
  awaited`, `create_task` без `await` дає `Task exception was never retrieved` і код 0, `TaskGroup` піднімає
  `ExceptionGroup`. Перевірено окремим скриптом.
- `tasks.yaml`: розпарсено `yaml.safe_load`, урок перевірено `platform/build.py:load_lesson` (без запису `dist/`,
  помилок 0). Для t1, t2, t4 `solution + harness` дає точно `expected` після нормалізації, `starter + harness` ні.
  t3 і p1: `verify` виконано дослівно з `tasks.yaml` через `bash -c` і `zsh -c` у дзеркальному корені в scratch
  (`practice/m6-l07/` + symlink `.venv`): рішення дає `OK`; стартовий код t3 падає з
  `AssertionError: graceful shutdown: exit code -15, expected 0`; p1 з навмисною помилкою (`timeout=None`) падає
  з `worker did not stop within 5 s`, а не зависає.
- `ruff check` на кодах рішень і прикладах воркерів: чисто.

Вивід із вмістом, що змінюється між запусками (PID у прикладі `os`, абсолютний шлях `sys.executable`), лишено в
non-live блоках як реальний вивід одного запуску. У traceback `KeyboardInterrupt` шлях до scratch-файлу скорочено до
`.../no_handler.py`; номер рядка справжній. Вивід `exit_in_handler.py` показано лише рядком з `finally`
(рядок `[returncode=0]` від обгортки опущено).

## Рішення

- Обсяг: 24 абзаци теорії плюс 4 callout-и, у межах "короткого уроку" 25–30. Розділів `##` вісім теоретичних
  (з "Для капстоуну") плюс три обов'язкові.
- Docker-частина без запуску Docker: демона на машині немає, і контейнери це m7-l07. Механіка "сигнал отримує shell, а
  не Python" показана локально на `entrypoint.sh` з `exec` і без. Правило ядра "PID 1 без обробника ігнорує
  `SIGTERM`" сказано без демонстрації; його варто показати в m7-l07 на `docker stop` з `time`.
- `asyncio.run` і `KeyboardInterrupt` розібрано тут з реальним виводом: у m5-l05 цього немає, хоча `questions.md`
  посилається туди. Варто додати одне речення-посилання в m5-l05 на цей урок.
- `signal.alarm` як таймаут синхронного воркера: Unix-only, як і `loop.add_signal_handler`. Windows згадано одним
  callout-ом без демонстрації.
- Капстоунний воркер і p1 живуть у `practice/m6-l07/`, а не в `capstone/`: сховище ще фейкове, SQLite з'являється
  в m6-l08. Інтерфейс `mark_done`/`requeue` навмисно збігається з `JobStore` з `questions.md` m6-l08.
- t3 (`runtime: local`) і p1 перевіряються Python-скриптом у heredoc, а не shell-логікою: він чекає конкретного
  рядка у stdout перед сигналом, тож не залежить від часу старту інтерпретатора. Тому учню прямо сказано про
  `flush=True`.

## Незакриті питання

Немає; усі дев'ять пунктів `questions.md` позначено.

## Залежності

Спирається на m0-l03 (`sys.argv`, `sys.exit`, коди завершення), m1-l11 (`BaseException`, `KeyboardInterrupt`),
m4-l07 (контекстні менеджери), m5-l05 (воркер на `asyncio.Queue`, скасування, `TaskGroup`), m6-l06 (налаштування з
оточення). Готує: m6-l08 (`JobStore.requeue`, повернення "застряглих" `running` при старті), m7-l03 (воркер поруч
з FastAPI), m7-l07 (exec-форма `CMD`, PID 1, `tini`, `PYTHONUNBUFFERED`).
