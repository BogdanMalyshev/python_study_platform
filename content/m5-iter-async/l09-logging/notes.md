# Нотатки до m5-l09 "Логування: logging, structlog"

## Що запускалось

Усе через `.venv/bin/python` (CPython 3.12.12) з кореня проєкту; ruff 0.17.1 і pytest 9.1.1 з того ж `.venv`. structlog у `.venv` і в Pyodide платформи немає, тому для прикладів зі structlog і `python-json-logger` створено окремий venv у тимчасовій підпапці `m5-l09` (`.venv/bin/python -m venv`, далі `pip install structlog python-json-logger pytest mypy`): structlog 26.1.0, python-json-logger 4.2.0. Тимчасова підпапка видалена після перевірки.

- Кожен блок ```` ```python ```` / ```` ```python live ```` з `lesson.md`, за яким іде блок ```` ```text ````, витягнутий скриптом і запущений окремим файлом (structlog-блоки в тимчасовому venv). Вивід порівняно з уроком. Розбіжності лише очікувані: імена файлів (`main.py` проти `loader.py`/`exc2.py`/...), часові мітки, мілісекунди в `slow.py` (149 проти 155 мс), порядок stdout/stderr при перенаправленні в pipe.
- Блоки-транскрипти з `$` (`LOG_LEVEL=... python app.py`, `ruff check --select G,LOG`, два прогони pytest з `caplog`, два режими `run.py` капстоуну) запускались окремо тими самими командами в тимчасовій папці.
- Емуляція браузера платформи: `platform/worker.js` тримає один інтерпретатор і не скидає стан stdlib-модулів між запусками, тобто стан `logging` (логери, рівні, handlers) переживає запуск. Скрипт виконав у одному процесі з постійним об'єктом `sys.stdout` і свіжим `__main__` на кожен запуск послідовність: усі 10 live-блоків, усі 5 завдань (solution + harness), усе це у зворотному порядку і ще раз live-блоки. Кожен запуск збігся з очікуваним виводом. Через це живі блоки викликають `basicConfig(..., force=True)` і ставлять рівень своєму логеру явно, `dictConfig` у живому блоці використовує окремий логер `formbuilder.config` і `disable_existing_loggers: False`, а приклад з дублюванням через `propagate` зроблено не живим (він лишав би handler на `formbuilder` для наступних блоків). Завдання пишуть у власні логери (`formbuilder.submissions`, `.batch`, `.storage`, `.jobs`) з `handlers[:] = [...]` і `propagate = False`, щоб не впливати на живі блоки.
- Емуляція виявила, що після живого блоку з root на `DEBUG` CPython-івський `asyncio.run` пише `DEBUG asyncio: Using selector...`. У Pyodide `asyncio.run` замінено на `await` у вже запущеному циклі, тож цього рядка там не буде, але в харнес t5 додано `logging.getLogger("asyncio").setLevel(logging.WARNING)` про всяк випадок.
- Завдання t1–t5: `solution + harness` дає точно `expected` (після нормалізації з `lesson-spec`), `starter + harness` не проходить. Квізи q1–q4 перевірені запуском коду з питання (q3 з модулем `formbuilder/plugins.py`, що викликає `basicConfig()`; q4 це той самий тест, що падає в уроці).
- Код капстоуну (`logs.py`, `timing.py`) пройшов `mypy --strict` у тимчасовому venv. Перевірено, що `filter_by_level` відкидає `debug` при `INFO` і пропускає при `DEBUG`.
- `structlog` у прикладі з `bound_contextvars` спершу дав різний порядок ключів між запусками (контекст це незмінне відображення без гарантованого порядку), тому в рендерер додано `sort_keys=True`; з ним три прогони дали однаковий md5 виводу.

## Що редаговано у виводах

- Шляхи скорочені як у m0-l05: тимчасова папка прибрана до імені файлу, шлях до stdlib замінено на `.../lib/python3.12/...`.
- У двох виводах середина traceback замінена рядком `  ...`: блок `--- Logging error ---` при відсутньому полі `extra` (прибрано 4 кадри всередині `logging/__init__.py`) і `KeyError` для зарезервованого ключа `extra` (прибрано кадри виклику до `makeRecord`). Решта тексту дослівна.
- Приклад з фільтром на логері: у тексті показано лише stdout, а вміст stderr (`--- Logging error ---` з `ValueError: Formatting field not found in record: 'job_id'`) переказано реченням з точною цитатою останнього рядка.
- Попередження `DeprecationWarning` для `log.warn` показано першим рядком, як у терміналі; при перенаправленні в pipe stderr виводиться після буферизованого stdout.

## Рішення щодо обсягу й меж

- 8 розділів теорії + "Для капстоуну" + три обов'язкові. Абзаців теорії 43 плюс 12 callout-ів, це вище орієнтиру 20–40, але нижче 50. Тема покриває 11 питань, і половина з них (contextvars, structlog, caplog, гігієна) самостійна. Якщо урок здасться важким, природна лінія поділу: "logging: логери, конфігурація, повідомлення, винятки" і "Структуровані логи й контекст: JSON, structlog, contextvars, тести, капстоун". Урок здано цілим.
- Усі браузерні завдання лише на stdlib `logging` з handler у `sys.stdout`, фіксованим форматом без часу; виняток у виводі зводиться до останнього рядка через `formatException`, щоб не залежати від шляхів.
- structlog показано не живими блоками з реальним виводом з тимчасового venv. Часові мітки у виводі structlog і капстоуну реальні.
- `QueueHandler`/`QueueListener` показано одним прикладом (3.12 `dictConfig` з `handlers` у `QueueHandler`), без деталей потоків: це m5-l08.
- Не розглядались `logging.config.fileConfig`, `SysLogHandler`, `SMTPHandler`, `HTTPHandler`, власні рівні (`TRACE`), `setLogRecordFactory`, OpenTelemetry і кореляція з трейсами, налаштування логів uvicorn (`log_config`): це m7.
- Для капстоуну обрано structlog поверх stdlib через `ProcessorFormatter`, щоб логи uvicorn/httpx мали той самий формат. Модуль названо `formbuilder/logs.py`, а не `logging.py`, щоб не плутати зі stdlib.

## Питання з questions.md

Усі 11 закриті в уроці з кодом і виводом.

## Залежності від сусідніх уроків

Спирається на: m0-l05 (читання traceback, `traceback.format_exc`, `warnings` і фільтри, які тут перенаправляються в logging), m1-l11 (`raise from`, правило "логувати або перекидати"), m3-l03 (фікстури pytest, `caplog` тут розібрано лише в частині логування), m5-l04 (`@timed`, тут переписаний на structlog), m5-l05/m5-l06 (TaskGroup, довгоживучий воркер, у якому важливо скидати контекст між задачами), m5-l07 (httpx пише кожен запит на INFO), m5-l08 (потоки для `QueueListener`), m2-l09 (`SecretStr`).

Готує для: m6-l01 (логування кроків `Publisher`), m6-l06 (`configure_logging` викликається з CLI, змінні оточення переходять у pydantic-settings), m6-l07 (коректна зупинка, `listener.stop()` перед виходом), m7 (логи uvicorn через `ProcessorFormatter`, `job_id`/request id у контексті, тести з `capture_logs`).
