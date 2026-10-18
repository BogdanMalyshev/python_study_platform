# Нотатки до m7-l03 "Фонові задачі: BackgroundTasks і воркер на asyncio.Queue"

## Що запускалось

- **Stdlib-частини** (усі `python live` блоки, приклади з потоками/процесами, усі завдання): `.venv/bin/python` з кореня курсу, CPython 3.12.12, SQLite 3.50.4.
- **FastAPI-частини**: окремий venv у `<scratchpad>/m7-l03/.venv`, створений `uv venv --python 3.12` + `uv pip install fastapi httpx pytest anyio` (uv 0.9.28). Версії: fastapi 0.143.5, starlette 1.8.0, pydantic 2.14.1, pydantic-core 2.50.1, httpx 0.28.1, httpcore 1.0.9, anyio 4.15.1, pytest 9.1.1. Підпапку scratch після перевірки видалено.
- **Як збирався урок.** Кожен приклад з виводом лежав окремим файлом у scratch; `lesson.md` згенеровано з шаблону, який вставляв код файлу і його реальний stdout (для `l_obs.py` stdout+stderr з `PYTHONUNBUFFERED=1`, щоб порядок рядків був справжнім; абсолютний шлях до scratch прибрано з тексту попередження). FastAPI-файли запускались з `-W ignore::DeprecationWarning` (див. нижче), решта як є. Урок перегенеровано 5 разів поспіль, md5 файлу однаковий: усі виводи стабільні, включно з прикладами з потоками (тікер 40 мс проти рендера 100 мс), двома процесами і сценарієм рестарту в капстоуні.
- **Завдання.** t1–t5: `solution + harness` збігається з `expected` після нормалізації; `starter + harness` для кожного не збігається. t4 і t5 (з таймінгами) прогнані 5 разів: вивід стабільний. Сумарний `asyncio.sleep` у t5 близько 0.1 с, у t4 менше 0.15 с.
- **Квізи.** q1 перевірено запуском (`add_task(send_email(...))`: клієнт отримує 202, після відповіді `TypeError: the first argument must be callable` з `functools.partial` у `starlette.concurrency.run_in_threadpool`, плюс `RuntimeWarning ... never awaited`); q2 запуском (статус лишається `'running'`); q3 запуском двох процесів з тим самим застосунком (`404` в іншому процесі).
- **pytest-приклад** (розділ про тестування): `pytest -q` у scratch-venv, `4 passed in 0.01s`; плагін anyio без фікстури `anyio_backend` запускає лише asyncio (4 тести, а не 8).
- **Валідація платформою**: `platform/build.py:load_lesson(...)` без помилок; кожен маркер завдання рівно один раз.

## Знахідки під час перевірки, що стали частиною уроку

- `TestClient` повертає відповідь лише після фонових задач, тому в тестах їх ефект видно одразу; порядок "відповідь, потім задача" показано прямим ASGI-викликом.
- Виняток у першій фоновій задачі скасовує наступні (`audit` не виконався).
- Порожня `asyncio.Queue` проходить pickle без помилки, тож задача з чергою подій іде в `ProcessPoolExecutor`, але зміни в дочірньому процесі губляться; пастку сформульовано саме так, а не "Queue не серіалізується". Lambda дає `AttributeError: Can't get local object ...` (текст 3.12.12).
- Скасування корутини, що чекає `to_thread`, не зупиняє потік, а вихід з циклу подій чекає на нього (перша версія сценарію капстоуну зависала на 5 с таймауту `Event.wait`). Це стало пасткою і аргументом за ідемпотентність.

## Потрібна увага автора курсу

- **Starlette 1.8 і httpx.** `from fastapi.testclient import TestClient` з httpx 0.28 дає `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` У виводах уроку цього попередження немає (stderr, `-W ignore`). Це тема m7-l01/m7-l05: варто вирішити, чи капстоун ставить `httpx2`, і згадати там. У цьому уроці не згадується, щоб не дублювати.
- **Окремий venv.** Кореневий `.venv` не має FastAPI; для FastAPI-прикладів використано scratch-venv за брифом.

## Рішення щодо обсягу й меж

- 8 теоретичних розділів + "Для капстоуну" + 3 обов'язкові. 34 абзаци теорії, 7 callout-ів, максимум 3 абзаци поспіль без коду. У межах орієнтиру, поділ не пропоную.
- Redis/arq/Celery/RQ/BullMQ одним реченням у розділі про межу процесу. Окремий процес-воркер над SQLite показано лише механікою умовного `UPDATE ... WHERE status = 'queued'` з `rowcount` (live, `:memory:`, кроки двох воркерів перемежовані вручну); цикл опитування не реалізовано.
- SIGTERM, `add_signal_handler`, таймаут на дочекання поточних задач: одне речення і посилання на m6-l07. Тут лише поведінка воркера на `CancelledError` (повернути в `queued`, `raise`).
- GIL і вимір на 50 конфігах: посилання на m5-l08. Тут один локальний приклад з тікером і `ProcessPoolExecutor` з детермінованим результатом.
- `Depends` для черги/сховища згадано і внесено в p2, але приклади уроку читають `request.app.state` напряму, щоб не тягнути m7-l01.
- `pytest-asyncio` проти anyio: в уроці використано anyio (йде з FastAPI), остаточний вибір для капстоуну залишено m7-l05.
- `JobStore` в уроці має чотири методи (`create`, `get`, `save`, `recover`), а не набір з m6-l08 (`enqueue`, `next_pending`, `mark_done`, `mark_failed`, `history`): `save(job)` після кожного переходу простіше склеюється з `run_job`/`on_status`. p1 посилається на Protocol з m6-l08 і просить додати `recover()`; якщо m6-l08 зафіксує інші назви, варто узгодити.
- Код капстоун-розділу імпортує `run_job`, `SqliteJobStore`, `JobEvents` з модуля `jobs_core` (у scratch це були визначення з розділів уроку й розв'язок t4); в уроці це сказано коментарем.
- p2 має `verify: cd capstone && uv run pytest tests/test_api.py -q` (як у питаннях m7-l01), p1 `tests/test_worker.py` за брифом. Якщо m7-l05 розіб'є тести на `test_api_jobs.py`, verify p2 треба оновити.

## Питання з questions.md

Усі 10 закриті в уроці з кодом і виводом, позначені `[x]`.

## Залежності від сусідніх уроків

Спирається на: m5-l05 (воркери на `Queue`, `Semaphore`, `CancelledError`), m5-l06 (`worker_pool`, `watch`, `aclosing`), m5-l04 (`@retry`, ін'єкція `sleep`), m4-l08 (Observer, `Renderer`/`Publisher`, ін'єкція годинника), m6-l08 (`JobStore`, `check_same_thread`), m7-l01 (`lifespan`, `app.state`, `TestClient`).

Готує для: m7-l04 (`JobEvents.watch` як джерело WebSocket-подій, знімок для запізнілого клієнта), m7-l05 (fake-рендерер, `sleep=`, `with TestClient(app)` для lifespan, сценарій рестарту), m6-l07 (зупинка воркера з поверненням задачі в `queued`), m7-l07 (один процес uvicorn на контейнер).

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- Сховище переписано на імена `JobStore` з m6-l08: `create/get/save/recover` стали `enqueue/get_job/next_pending/mark_done/mark_failed/requeue_running`. Демо сховища і сценарій капстоуну (два застосунки над одним SQLite) перезапущено, вивід вставлено (сценарій тричі поспіль дав однаковий вивід). Черга носить лише сигнал, задачу воркер бере через `next_pending`.
- t2 `recover` → `requeue_running(jobs, max_attempts) -> int` (кількість повернутих у `queued`); `expected` оновлено, `solution + harness` збігається.
- p1: клас `Worker` з `run_once()`/`run()` (його викликає m7-l05), ретраї через `mark_failed`, нове `retry=False` для постійних помилок. p2: lifespan з `settings.workers`, `requeue_running` на вході й виході, `JobOut.url` як `/sites/<config_id>/<version>/`.
