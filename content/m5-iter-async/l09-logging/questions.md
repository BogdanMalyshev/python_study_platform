# Ключові питання уроку m5-l09 "Логування: logging, structlog"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] Чому не `print`: рівні, вимкнення без правки коду, куди йде вивід, формат, контекст. Порівняти з `console.*` і pino/winston.
- [x] Модуль `logging`: `logging.getLogger(__name__)` у кожному модулі, ієрархія логерів за крапками, рівні DEBUG/INFO/WARNING/ERROR/CRITICAL, чому `logging.info(...)` на root-логері це антипатерн у бібліотеці.
- [x] Конфігурація один раз на вході: `logging.basicConfig(level, format)` для скриптів, `dictConfig` для застосунків, формат з `%(asctime)s %(levelname)s %(name)s %(message)s`; handlers (stream, file, rotating), formatters, propagate. Чому бібліотека не конфігурує логування.
- [x] Ліниве форматування `log.info("user %s", user_id)` проти f-рядка і чому (не обчислювати, якщо рівень вимкнений; агрегація в системах логів), `extra={}` для полів.
- [x] `log.exception(...)` у `except` (traceback автоматично), `exc_info=True`, `stack_info`; посилання на m1-l11 і m0-l05.
- [x] Структуровані логи: JSON-formatter через `python-json-logger` або власний Formatter; `structlog` як зручніший шар (bind контексту, процесори, pretty у dev, JSON у prod). Аналог pino. Показати обидва шляхи і сказати, що для капстоуну обрано.
- [x] Контекст запиту/задачі: `contextvars` для `job_id` через async-код і structlog `bind_contextvars`; чому threading.local не підходить для asyncio.
- [x] Логи в тестах: `caplog` (посилання на m3-l03), перевірка рівня й повідомлення.
- [x] Продуктивність і гігієна: не логувати секрети, рівень DEBUG вимкнений у prod, `logging.getLogger("httpx").setLevel(WARNING)` для шумних бібліотек, `warnings` → логи через `logging.captureWarnings`.
- [x] Для капстоуну: налаштувати structlog у `formbuilder` з `job_id` у контексті, логувати етапи пайплайну з тривалістю (декоратор `@timed` з m5-l04), JSON у prod і кольоровий вивід локально за змінною оточення.
- [x] Які JS-звички тут шкодять: `console.log` у бібліотечному коді, template literal у логах, один глобальний логер, pino-transport як у Node (тут handlers), очікування асинхронного логування за замовчуванням.
