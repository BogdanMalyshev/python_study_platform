---
id: m5-l09
module: m5-iter-async
title: "Логування: logging, structlog"
summary: "Учень заводить логер на модуль через getLogger(__name__), налаштовує logging один раз у точці входу (basicConfig, dictConfig, handlers, propagate), пише ліниві повідомлення з extra і log.exception, отримує JSON-логи власним formatter-ом або structlog, протягує job_id через contextvars в async-коді й перевіряє логи в тестах через caplog."
duration_min: 75
prerequisites: [m5-l08]
---

## Чому не `print`: рівні, адресат і формат живуть окремо від коду

`print` вирішує все в місці виклику: що друкувати, куди (stdout) і в якому вигляді. Логування розділяє ці рішення. Код каже лише "ось подія такої важливості", а що з нею робити, вирішує конфігурація: відсікти за рівнем, дописати час і ім'я модуля, віддати в stderr, файл чи JSON для збирача логів. Звідси головне: вимкнути шумні повідомлення або ввімкнути детальні можна без правки коду, змінною оточення. Це той самий набір, заради якого в Node беруть pino або winston замість `console.*`.

```ts
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" }).child({ name: "formbuilder.render" });
log.debug("config loaded: %s", "signup");
log.info("render started: form=%s fields=%d", "signup", 3);
log.warn("template cache miss");
```

```python
import logging
import os

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("formbuilder.render")

log.debug("config loaded: %s", "signup")
log.info("render started: form=%s fields=%d", "signup", 3)
log.warning("template cache miss")
```

```text
$ python app.py
INFO formbuilder.render: render started: form=signup fields=3
WARNING formbuilder.render: template cache miss

$ LOG_LEVEL=DEBUG python app.py
DEBUG formbuilder.render: config loaded: signup
INFO formbuilder.render: render started: form=signup fields=3
WARNING formbuilder.render: template cache miss

$ python app.py 2>/dev/null

$ LOG_LEVEL=WARNING python app.py
WARNING formbuilder.render: template cache miss
```

Розходжень три. pino за замовчуванням пише JSON у stdout, а `logging` пише текст у stderr: `2>/dev/null` прибрав усе. Це зроблено свідомо, stdout лишається для даних програми, які йдуть у pipe. Друге: у pino рівень і адресат це властивості екземпляра логера, а в Python конфігурація глобальна для процесу і живе в модулі `logging`; логери в коді лише посилаються на неї. Третє: `console.debug` у Node друкує завжди, фільтра рівнів у `console` немає взагалі.

> **JS-аналог.** Рівні в обох світах числові, лише зсунуті: у pino `trace 10, debug 20, info 30, warn 40, error 50, fatal 60`, у Python `DEBUG 10, INFO 20, WARNING 30, ERROR 40, CRITICAL 50`. `trace` у Python немає. `fatal` існує як синонім `critical`, а `warn` як застарілий синонім `warning`: у 3.12 він дає `DeprecationWarning`, а в 3.13 метод `Logger.warn` видалено.

```python
import logging

logging.basicConfig(format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("formbuilder")
log.warn("old alias")
log.fatal("fatal alias")
print(logging.getLevelName(30), logging.getLevelName("WARN"), logging.WARN, logging.FATAL)
print(logging.getLevelNamesMapping())
```

```text
warn.py:4: DeprecationWarning: The 'warn' method is deprecated, use 'warning' instead
  log.warn("old alias")
WARNING formbuilder: old alias
CRITICAL formbuilder: fatal alias
WARNING 30 30 50
{'CRITICAL': 50, 'FATAL': 50, 'ERROR': 40, 'WARN': 30, 'WARNING': 30, 'INFO': 20, 'DEBUG': 10, 'NOTSET': 0}
```

Рівень можна поміняти під час роботи, і всі виклики `log.debug` у модулі почнуть або перестануть писати без жодної правки в них. З `print` для цього довелося б обгортати кожен рядок в `if DEBUG:`.

```python live
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.DEBUG, format="%(levelname)s %(name)s: %(message)s", force=True)
log = logging.getLogger("formbuilder.render")


def render(form_id: str, fields: list[str]) -> str:
    log.debug("fields of %s: %s", form_id, fields)
    log.info("rendering %s", form_id)
    return "".join(f"<input name={f!r}>" for f in fields)


log.setLevel(logging.INFO)
render("signup", ["email"])
log.setLevel(logging.DEBUG)
render("survey", ["age"])
```

```text
INFO formbuilder.render: rendering signup
DEBUG formbuilder.render: fields of survey: ['age']
INFO formbuilder.render: rendering survey
```

> **Під капотом.** Стан `logging` (усі логери, їхні рівні, handlers root-логера) живе в модулі, а модуль імпортується один раз на процес. Інтерпретатор у браузері платформи не перезапускається між запусками прикладів, як Jupyter чи довгий REPL, тому стан попереднього запуску лишається. Через це живі приклади уроку викликають `basicConfig(..., force=True)` і явно ставлять рівень своєму логеру. У звичайному скрипті, який стартує з нуля, `force` не потрібен.

## Логер на модуль: `getLogger(__name__)` та ієрархія за крапками

Конвенція одна на всю екосистему: кожен модуль на верхньому рівні пише `log = logging.getLogger(__name__)` (часто `logger`). `__name__` модуля це його повний шлях з крапками (m0-l03), тож у `formbuilder/render.py` логер називається `formbuilder.render`. `getLogger` повертає один і той самий об'єкт для того самого імені, з глобального реєстру, тому модульна змінна безпечна: ніякого "одного логера на застосунок", який імпортують звідусіль, не потрібно.

Ім'я з крапками задає дерево (logger hierarchy, офіційний термін документації): `formbuilder.render` дочірній для `formbuilder`, той для root-логера. Рівень за замовчуванням `NOTSET` (0) означає "спитай у батька", і `getEffectiveLevel()` піднімається деревом до першого логера з виставленим рівнем. Тому достатньо поставити `DEBUG` на `formbuilder`, і весь пакет стане детальним, а `httpx` поруч лишиться тихим.

```python
import logging

render = logging.getLogger("formbuilder.render")
print(render.parent)
pkg = logging.getLogger("formbuilder")
print(render.parent, pkg.parent)
print(logging.getLogger("formbuilder.render") is render)

pkg.setLevel(logging.DEBUG)
print(render.level, render.getEffectiveLevel(), render.isEnabledFor(logging.DEBUG))
render.setLevel("WARNING")
print(render.getEffectiveLevel(), logging.getLogger("formbuilder.render.html").getEffectiveLevel())
```

```text
<RootLogger root (WARNING)>
<Logger formbuilder (WARNING)> <RootLogger root (WARNING)>
True
0 10 True
30 30
```

Перший рядок показує деталь реєстру: поки логера `formbuilder` не існувало, батьком `formbuilder.render` був root, а щойно `formbuilder` створили, зв'язок перебудувався. Порядок імпорту модулів на ієрархію не впливає. Root за замовчуванням має рівень `WARNING`, тому ненастроєний застосунок бачить лише попередження й помилки.

<!-- task: t1 -->

Функції модуля `logging.info(...)`, `logging.warning(...)` пишуть у root-логер. У скрипті на 20 рядків це прийнятно, у бібліотеці чи пакеті ні, і причина не лише в тому, що в записі буде `root` замість імені модуля. Якщо root ще не має handlers, ці функції самі викликають `basicConfig()` з форматом за замовчуванням. Після цього `basicConfig` застосунку нічого не робить, бо root уже налаштований.

```python
import logging


def legacy_helper() -> None:          # код "бібліотеки"
    logging.warning("legacy flag used")


legacy_helper()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("formbuilder").info("app started")
print(logging.getLogger().handlers, logging.getLogger().level)
```

```text
WARNING:root:legacy flag used
[<StreamHandler <stderr> (NOTSET)>] 30
```

Застосунок просив `INFO` і власний формат, а отримав чужий формат і `WARNING`: `app started` не надрукувався. ruff ловить такі виклики правилом `LOG015` (приклад нижче, у розділі про повідомлення). Бібліотека пише лише через `getLogger(__name__)` і нічого не налаштовує. Максимум, що вона робить, це `NullHandler` на своєму верхньому логері: без нього, коли застосунок логування не налаштував, `WARNING` бібліотеки потрапляє в запасний handler `logging.lastResort` і друкується в stderr голим текстом.

```python
import logging

lib = logging.getLogger("formlib")
lib.warning("before NullHandler")
lib.addHandler(logging.NullHandler())
lib.warning("after NullHandler")
logging.basicConfig(format="%(levelname)s %(name)s: %(message)s")
lib.warning("after app configured logging")
```

```text
before NullHandler
WARNING formlib: after app configured logging
```

<!-- task: q1 -->

## Конфігурація один раз на вході: handlers, formatters, propagate

Налаштовує логування той, хто запускає процес: `if __name__ == "__main__"`, функція CLI, lifespan FastAPI, а не модуль під час імпорту. Для скрипта досить `logging.basicConfig`: він створює handler (за замовчуванням у stderr, `stream=` або `filename=` міняють адресат), formatter з `format` і ставить рівень root. Важлива поведінка: якщо root уже має handlers, `basicConfig` нічого не робить, включно з `level`. `force=True` (з 3.8) спершу знімає наявні handlers.

```python
import logging
import sys

logging.basicConfig(stream=sys.stdout, format="%(levelname)s %(message)s")
logging.basicConfig(stream=sys.stdout, level=logging.DEBUG, format="%(name)s | %(message)s")
log = logging.getLogger("formbuilder")
log.debug("debug after second basicConfig")
log.warning("format from the first call")

logging.basicConfig(stream=sys.stdout, level=logging.DEBUG, format="%(name)s | %(message)s", force=True)
log.debug("force=True replaced the handlers")
```

```text
WARNING format from the first call
formbuilder | force=True replaced the handlers
```

Рядок формату це %-шаблон з іменами атрибутів запису (`LogRecord`, офіційна назва класу): `%(asctime)s` час, `%(levelname)s` рівень, `%(name)s` ім'я логера, `%(message)s` повідомлення з підставленими аргументами, `%(funcName)s` і `%(lineno)d` місце виклику, `%(process)d`, `%(threadName)s`, а з 3.12 ще `%(taskName)s` для asyncio. `-8` після `%` вирівнює рівень по ширині. Параметр `style="{"` дозволяє писати шаблон у стилі `str.format`, `datefmt` задає формат часу.

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s:%(lineno)d %(funcName)s() %(message)s",
)
log = logging.getLogger("formbuilder.render")


def render(form_id: str) -> None:
    log.info("rendering %s", form_id)


render("signup")
logging.getLogger("formbuilder").warning("cache miss")
```

```text
2026-10-18 14:23:39,944 INFO     formbuilder.render:11 render() rendering signup
2026-10-18 14:23:39,944 WARNING  formbuilder:15 <module>() cache miss
```

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="{asctime} {levelname:<8} {name}: {message}",
    style="{",
    datefmt="%H:%M:%S",
)
logging.getLogger("formbuilder.render").info("rendering %s", "signup")
```

```text
14:23:39 INFO     formbuilder.render: rendering signup
```

Шлях запису через систему такий. `log.info(...)` спершу порівнює рівень з ефективним рівнем логера; якщо не проходить, запису не існує. Далі створюється `LogRecord`, через фільтри (filter, офіційний термін) самого логера, і віддається handlers цього логера. Handler (офіційний термін: об'єкт, що доставляє запис адресату) має власний рівень, власні фільтри і formatter (офіційний термін: перетворює запис на рядок). Потім, якщо `propagate` логера `True` (за замовчуванням), запис іде до handlers батька, і так до root.

> **Під капотом.** Під час спливання (propagation, офіційний термін, як і атрибут `propagate`) рівні батьківських логерів не перевіряються, лише рівні їхніх handlers. Рівень логера це фільтр на вході, у місці виклику; рівень handler це фільтр на виході до адресата. Звідси два регулятори: `formbuilder` на `DEBUG` при root на `WARNING` все одно надрукує `DEBUG` через handler root.

```python
import logging
import sys

root_handler = logging.StreamHandler(sys.stdout)
root_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
root = logging.getLogger()
root.addHandler(root_handler)
root.setLevel(logging.WARNING)

render = logging.getLogger("formbuilder.render")
render.setLevel(logging.DEBUG)
render.debug("passes: root level is not checked on propagation")
logging.getLogger("formbuilder.publish").debug("dropped: effective level WARNING")

root_handler.setLevel(logging.INFO)
render.debug("dropped by the handler level")
render.info("passes the handler level")
```

```text
DEBUG formbuilder.render: passes: root level is not checked on propagation
INFO formbuilder.render: passes the handler level
```

Handlers у `logging` і `logging.handlers`: `StreamHandler` (stderr або будь-який потік), `FileHandler`, `RotatingFileHandler` (ротація за розміром), `TimedRotatingFileHandler` (за часом), `QueueHandler` (про нього в розділі про гігієну), `NullHandler`. Це те, що в pino роблять transport-и й `pino.destination`, тільки в одному процесі і синхронно. У контейнері зазвичай вистачає stdout, а ротацію й доставку робить платформа; файли з ротацією потрібні там, де процес живе на звичайному сервері.

```python
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

Path("logs").mkdir(exist_ok=True)
handler = RotatingFileHandler("logs/formbuilder.log", maxBytes=200, backupCount=2, encoding="utf-8")
handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
log = logging.getLogger("formbuilder")
log.addHandler(handler)
log.setLevel(logging.INFO)

for n in range(1, 21):
    log.info("job %02d rendered", n)

for path in sorted(Path("logs").iterdir()):
    lines = path.read_text().splitlines()
    print(f"{path.name:<18} {len(lines)} lines, first: {lines[0]}")
```

```text
formbuilder.log    5 lines, first: INFO formbuilder: job 16 rendered
formbuilder.log.1  5 lines, first: INFO formbuilder: job 11 rendered
formbuilder.log.2  5 lines, first: INFO formbuilder: job 06 rendered
```

Записи `job 01`–`job 05` зникли: `backupCount=2` тримає два старі файли, третій видаляється при ротації. Для застосунку з кількома handlers і логерами конфігурацію описують даними через `logging.config.dictConfig`: словник зі схемою `version`, `formatters`, `handlers`, `loggers`, `root`. Його зручно тримати в одному модулі або читати з TOML/YAML, і він повторно застосовується без дублювання handlers.

```python live
import logging
import logging.config

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "plain",
        },
    },
    "loggers": {
        "formbuilder.config": {"level": "DEBUG"},
        "httpx": {"level": "WARNING"},
    },
    "root": {"level": "INFO", "handlers": ["console"]},
}

logging.config.dictConfig(LOGGING)
logging.getLogger("formbuilder.config").debug("fields: %s", ["email", "age"])
logging.getLogger("httpx").info("HTTP Request: GET /health")
logging.getLogger("uvicorn").info("Application startup complete.")
```

```text
DEBUG formbuilder.config: fields: ['email', 'age']
INFO uvicorn: Application startup complete.
```

> **Пастка.** `disable_existing_loggers` за замовчуванням `True`: `dictConfig` вимикає всі логери, які вже існували на момент виклику і не згадані в конфігу. Модулі створюють логери при імпорті, тобто до конфігурації, тому без `False` логи вашого ж пакета тихо зникають.

```python
import logging
import logging.config

log = logging.getLogger("formbuilder.render")   # створений при імпорті модуля

logging.config.dictConfig({
    "version": 1,
    "handlers": {"console": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout"}},
    "root": {"level": "INFO", "handlers": ["console"]},
})
log.info("render started")
print(log.disabled)
```

```text
True
```

> **Пастка.** Handler на проміжному логері плюс handler на root дають кожен запис двічі: спливання не зупиняється на першому handler, як подія DOM після `stopPropagation`. Або тримайте handlers лише на root, або ставте `propagate = False` на логері з власним handler.

```python
import logging
import logging.config

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "root": {"format": "root    | %(name)s: %(message)s"},
        "fb": {"format": "fb      | %(name)s: %(message)s"},
    },
    "handlers": {
        "root_console": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "root"},
        "fb_console": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "fb"},
    },
    "loggers": {"formbuilder": {"level": "INFO", "handlers": ["fb_console"]}},
    "root": {"level": "INFO", "handlers": ["root_console"]},
})
log = logging.getLogger("formbuilder.render")
log.info("rendered")

logging.getLogger("formbuilder").propagate = False
log.info("rendered again")
```

```text
fb      | formbuilder.render: rendered
root    | formbuilder.render: rendered
fb      | formbuilder.render: rendered again
```

<!-- task: q2 -->

<!-- task: q3 -->

## Повідомлення: `%s`-аргументи замість f-рядка, `extra` для полів

Аргументи передаються окремо від шаблону: `log.info("form %s published", form_id)`, а не `log.info(f"form {form_id} published")`. Це називають lazy formatting (жаргон спільноти; документація каже, що злиття повідомлення з аргументами відкладено до моменту виводу). Причина перша: f-рядок обчислюється до виклику, навіть коли рівень вимкнений, а `%s` підставляється лише тоді, коли запис дійшов до handler.

```python live
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(message)s", force=True)
log = logging.getLogger("formbuilder.loader")
log.setLevel(logging.INFO)


class Config:
    def __str__(self) -> str:
        print("  Config.__str__ called")
        return "Config(signup)"


config = Config()
print("f-string, DEBUG:")
log.debug(f"loaded {config}")
print("%s-args, DEBUG:")
log.debug("loaded %s", config)
print("%s-args, INFO:")
log.info("loaded %s", config)
```

```text
f-string, DEBUG:
  Config.__str__ called
%s-args, DEBUG:
%s-args, INFO:
  Config.__str__ called
INFO loaded Config(signup)
```

Причина друга важливіша для продакшну: запис зберігає шаблон і аргументи окремо. `record.msg` однаковий для всіх форм, тож Sentry чи будь-який агрегатор групує тисячу подій в одну проблему "form %s published". З f-рядком кожне повідомлення унікальне, і групування ламається.

```python live
import logging


class ShowRecord(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        print(f"msg={record.msg!r} args={record.args!r}")
        print(f"   -> {record.getMessage()!r}")


logging.basicConfig(handlers=[ShowRecord()], level=logging.INFO, force=True)
log = logging.getLogger("formbuilder.publish")
log.setLevel(logging.INFO)

for form_id in ["signup", "survey"]:
    log.info("form %s published", form_id)
    log.info(f"form {form_id} published")
```

```text
msg='form %s published' args=('signup',)
   -> 'form signup published'
msg='form signup published' args=()
   -> 'form signup published'
msg='form %s published' args=('survey',)
   -> 'form survey published'
msg='form survey published' args=()
   -> 'form survey published'
```

ruff перевіряє це правилами `G` (flake8-logging-format) і `LOG` (flake8-logging); варто додати обидві групи в `extend-select` (m0-l04).

```python
import logging

log = logging.getLogger(__name__)
form_id = "signup"
log.info(f"form {form_id} published")
log.info("form %s published" % form_id)
log.info("form {} published".format(form_id))
log.info("form %s published", form_id)
log.warn("deprecated alias")
logging.info("root logger")
```

```text
$ ruff check --select G,LOG --output-format concise ruffcheck.py
ruffcheck.py:5:10: G004 Logging statement uses f-string
ruffcheck.py:6:10: G002 Logging statement uses `%`
ruffcheck.py:7:10: G001 Logging statement uses `str.format`
ruffcheck.py:9:5: G010 [*] Logging statement uses `warn` instead of `warning`
ruffcheck.py:10:1: LOG015 `info()` call on root logger
Found 5 errors.
[*] 1 fixable with `--fix`.
```

> **Пастка.** Лінивим є лише форматування, а не аргументи. У `log.debug("config: %s", json.dumps(config, indent=2))` виклик `json.dumps` виконується до того, як `debug` перевірить рівень. Дорогі аргументи обгортають перевіркою `log.isEnabledFor(logging.DEBUG)`.

```python
import json
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(message)s", force=True)
log = logging.getLogger("formbuilder.render")

config = {"title": "Signup", "fields": [{"id": "email"}, {"id": "age"}]}
if log.isEnabledFor(logging.DEBUG):
    log.debug("config: %s", json.dumps(config, indent=2))
log.info("render %s", config["title"])
```

```text
INFO render Signup
```

Окремі поля для машин (id форми, тривалість, статус) передаються через `extra={...}`: ключі словника стають атрибутами `LogRecord`, і formatter може на них посилатися. Це аналог першого аргументу-об'єкта в `log.info({ formId }, "msg")` з pino, лише текстовий formatter мусить знати імена полів заздалегідь.

```python live
import logging
import sys

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(levelname)s %(name)s: %(message)s [form=%(form_id)s ms=%(duration_ms)d]",
    force=True,
)
log = logging.getLogger("formbuilder.render")
log.setLevel(logging.INFO)

log.info("render done", extra={"form_id": "signup", "duration_ms": 12})
record = logging.makeLogRecord({"msg": "x", "form_id": "signup"})
print(record.form_id)
```

```text
INFO formbuilder.render: render done [form=signup ms=12]
signup
```

> **Пастка.** Формат з `%(form_id)s` вимагає це поле в кожному записі. Запис без `extra` не кидає виняток у ваш код: handler друкує в stderr `--- Logging error ---` з traceback, а програма йде далі. Ключ `extra`, що збігається зі стандартним атрибутом (`name`, `msg`, `message`, `args`), навпаки, кидає `KeyError` прямо в місці виклику.

```python
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s [form=%(form_id)s]")
log = logging.getLogger("formbuilder.render")

log.info("render done", extra={"form_id": "signup"})
log.info("cache warmed")
print("still running")
```

```text
INFO render done [form=signup]
--- Logging error ---
Traceback (most recent call last):
  File ".../lib/python3.12/logging/__init__.py", line 464, in format
    return self._format(record)
           ^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/logging/__init__.py", line 460, in _format
    return self._fmt % values
           ~~~~~~~~~~^~~~~~~~
KeyError: 'form_id'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  ...
  File ".../lib/python3.12/logging/__init__.py", line 466, in format
    raise ValueError('Formatting field not found in record: %s' % e)
ValueError: Formatting field not found in record: 'form_id'
Call stack:
  File "extra_missing.py", line 7, in <module>
    log.info("cache warmed")
Message: 'cache warmed'
Arguments: ()
still running
```

```python
import logging

log = logging.getLogger("formbuilder.render")
log.warning("field rejected", extra={"name": "email"})
```

```text
Traceback (most recent call last):
  ...
  File ".../lib/python3.12/logging/__init__.py", line 1656, in makeRecord
    raise KeyError("Attempt to overwrite %r in LogRecord" % key)
KeyError: "Attempt to overwrite 'name' in LogRecord"
```

Найближче до `pino.child({ jobId })` у стандартній бібліотеці це `logging.LoggerAdapter`: обгортка над логером, яка додає свій `extra` до кожного запису. У 3.12 її `extra` повністю замінює `extra` виклику (злиття додали лише в 3.13 параметром `merge_extra`), тому для багатьох полів зручніші structlog або фільтр з `contextvars`, обидва нижче.

```python live
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s [%(job_id)s] %(message)s", force=True)
base = logging.getLogger("formbuilder.worker")
base.setLevel(logging.INFO)

log = logging.LoggerAdapter(base, {"job_id": "j-42"})
log.info("job started")
log.info("stage %s done", "render")
```

```text
INFO [j-42] job started
INFO [j-42] stage render done
```

<!-- task: t2 -->

## Винятки в логах: `log.exception`, `exc_info`, `stack_info`

Звичка з Node: `console.error(err)` друкує стек, бо `Error` несе його в собі. У Python `log.error("failed: %s", e)` друкує лише `str(e)`, тобто повідомлення без стеку. Traceback додає `exc_info=True` на будь-якому рівні або `log.exception(...)`, що дорівнює `log.error(..., exc_info=True)`. Формат traceback той самий, що при падінні, і читається так само знизу вгору (m0-l05).

```python
import json
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("formbuilder.loader")


def load(raw: str) -> dict | None:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("config rejected: %s", e)
        log.warning("config rejected", exc_info=True)
        return None


load('{"title": }')
```

```text
ERROR formbuilder.loader: config rejected: Expecting value: line 1 column 11 (char 10)
WARNING formbuilder.loader: config rejected
Traceback (most recent call last):
  File "loader.py", line 11, in load
    return json.loads(raw)
           ^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 338, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File ".../lib/python3.12/json/decoder.py", line 356, in raw_decode
    raise JSONDecodeError("Expecting value", s, err.value) from None
json.decoder.JSONDecodeError: Expecting value: line 1 column 11 (char 10)
```

`exc_info=True` бере виняток, який обробляється зараз (`sys.exc_info()`), тому `log.exception` має сенс лише всередині `except`. Поза ним активного винятку немає, і в лог потрапляє дивне `NoneType: None`. Інша річ `stack_info=True`: він друкує стек місця виклику, а не винятку, і корисний, коли треба зрозуміти, хто викликав функцію з поганими аргументами, хоча нічого не впало.

```python
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("formbuilder.publish")


def publish(form_id: str) -> None:
    log.info("publishing %s", form_id, stack_info=True)


def handler() -> None:
    publish("signup")


handler()
log.exception("no active exception here")
```

```text
INFO formbuilder.publish: publishing signup
Stack (most recent call last):
  File "exc2.py", line 16, in <module>
    handler()
  File "exc2.py", line 13, in handler
    publish("signup")
  File "exc2.py", line 9, in publish
    log.info("publishing %s", form_id, stack_info=True)
ERROR formbuilder.publish: no active exception here
NoneType: None
```

`exc_info` приймає і сам об'єкт винятку. Це потрібно, коли винятки зібрані раніше й логуються вже поза `except`: результати `gather(..., return_exceptions=True)` (m5-l05) або список помилок пакетної обробки. Traceback береться з `e.__traceback__`, тож стек на місці.

```python
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("formbuilder.worker")

errors: list[Exception] = []
for job_id in ["j-1", "j-2"]:
    try:
        raise TimeoutError(f"render of {job_id} took too long")
    except TimeoutError as e:
        errors.append(e)

for e in errors:
    log.error("job failed", exc_info=e)
```

```text
ERROR formbuilder.worker: job failed
Traceback (most recent call last):
  File "exc3.py", line 10, in <module>
    raise TimeoutError(f"render of {job_id} took too long")
TimeoutError: render of j-1 took too long
ERROR formbuilder.worker: job failed
Traceback (most recent call last):
  File "exc3.py", line 10, in <module>
    raise TimeoutError(f"render of {job_id} took too long")
TimeoutError: render of j-2 took too long
```

> **Пастка.** "Залогувати й перекинути" (`log.exception(...)` і `raise` в одному `except`) на кожному рівні стеку дає той самий traceback три-чотири рази. Правило: виняток або обробляють і логують, або перекидають далі (з `raise ... from e`, m1-l11), а логує його той, хто остаточно вирішує, що робити: воркер навколо задачі, обробник запиту, `main`.

<!-- task: t3 -->

## Структуровані логи: власний JSON-formatter і structlog

Структуроване логування (structured logging, жаргон спільноти, але усталений) означає, що запис це набір полів, а не речення. Рядок `form signup rendered in 12 ms` можна знайти grep-ом, а запит "усі рендери довші за 500 мс для `form_id=signup`" можна виконати лише над полями. Збирачі логів (Loki, Elasticsearch, CloudWatch, Datadog) читають JSON по рядку на запис, і pino видає саме такий формат за замовчуванням. У `logging` JSON дає formatter: досить перевизначити `format(record)`.

```python live
import json
import logging
import sys

STANDARD = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        data |= {k: v for k, v in vars(record).items() if k not in STANDARD}
        return json.dumps(data, ensure_ascii=False)


handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(handlers=[handler], level=logging.INFO, force=True)
log = logging.getLogger("formbuilder.render")
log.setLevel(logging.INFO)

log.info("render done", extra={"form_id": "signup", "duration_ms": 12})
log.warning("field %s has no label", "email")
```

```text
{"level": "info", "logger": "formbuilder.render", "msg": "render done", "form_id": "signup", "duration_ms": 12}
{"level": "warning", "logger": "formbuilder.render", "msg": "field email has no label"}
```

Прийом з `STANDARD` працює, бо `extra` просто дописує атрибути в `LogRecord`: усе, чого немає в порожньому записі, прийшло ззовні. Готовий пакет з тим самим підходом це `python-json-logger` (`pip install python-json-logger`): поля задаються рядком формату, винятки серіалізуються в `exc_info`.

```python
import logging
import sys

from pythonjsonlogger.json import JsonFormatter

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter("%(levelname)s %(name)s %(message)s"))
logging.basicConfig(handlers=[handler], level=logging.INFO)
log = logging.getLogger("formbuilder.render")

log.info("render done", extra={"form_id": "signup", "duration_ms": 12})
try:
    {}["title"]
except KeyError:
    log.exception("config broken")
```

```text
{"levelname": "INFO", "name": "formbuilder.render", "message": "render done", "form_id": "signup", "duration_ms": 12}
{"levelname": "ERROR", "name": "formbuilder.render", "message": "config broken", "exc_info": "Traceback (most recent call last):\n  File \"pjl.py\", line 13, in <module>\n    {}[\"title\"]\n    ~~^^^^^^^^^\nKeyError: 'title'"}
```

<!-- task: t4 -->

structlog (`pip install structlog`, у цьому уроці 26.1) будує логування навколо полів з самого початку. Подія це ім'я плюс іменовані аргументи, `bind` повертає новий логер з прив'язаними полями, як `pino.child`. Без жодної конфігурації structlog пише в stdout зручний для людини формат з часом і рівнем (у терміналі ще й кольоровий).

```ts
const log = pino();
log.info({ formId: "signup", fields: 3 }, "render started");
const jobLog = log.child({ jobId: "j-42" });
jobLog.info({ stage: "render", durationMs: 12 }, "stage done");
```

```python
import structlog

log = structlog.get_logger()
log.info("render started", form_id="signup", fields=3)
log.debug("template resolved", template="default.html")

job_log = log.bind(job_id="j-42")
job_log.info("stage done", stage="render", duration_ms=12)
job_log.warning("cache miss")
```

```text
2026-10-18 14:24:45 [info     ] render started                 fields=3 form_id=signup
2026-10-18 14:24:45 [debug    ] template resolved              template=default.html
2026-10-18 14:24:45 [info     ] stage done                     duration_ms=12 job_id=j-42 stage=render
2026-10-18 14:24:45 [warning  ] cache miss                     job_id=j-42
```

Розходжень з pino три. Перше, порядок аргументів: у structlog спершу подія (`event`), потім поля іменованими аргументами, тому питання "f-рядок чи `%s`" зникає, подія лишається константою. Друге: за замовчуванням structlog не фільтрує рівні, `debug` надрукувався. Третє: він не йде через `logging` взагалі, його `PrintLogger` пише прямо в stdout. Обидва останні пункти задаються конфігурацією.

Механізм structlog це ланцюжок процесорів (processor, офіційний термін structlog): функцій `(logger, method_name, event_dict) -> event_dict`, які по черзі додають, змінюють чи прибирають поля, а останній, рендерер (renderer), перетворює словник на рядок. Рівень, час, контекст, маскування секретів, формат винятку це окремі процесори в списку, як middleware.

```python
import structlog


def redact_secrets(logger, method_name, event_dict):
    for key in ("password", "token", "api_key"):
        if key in event_dict:
            event_dict[key] = "***"
    return event_dict


def show(logger, method_name, event_dict):
    print("processor sees:", event_dict)
    return event_dict


structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        redact_secrets,
        show,
        structlog.processors.KeyValueRenderer(key_order=["level", "event"]),
    ],
)
structlog.get_logger().info("webhook registered", url="https://example.com/hook", token="s3cr3t")
```

```text
processor sees: {'url': 'https://example.com/hook', 'token': '***', 'event': 'webhook registered', 'level': 'info'}
level='info' event='webhook registered' url='https://example.com/hook' token='***'
```

Для продакшну міняється лише кінець ланцюжка: `JSONRenderer` замість консольного, час в ISO у UTC, і фільтр рівня через `make_filtering_bound_logger`, який відкидає `debug` ще до процесорів, тобто так само дешево, як рівень логера в `logging`.

```python
import logging

import structlog

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)

log = structlog.get_logger().bind(job_id="j-42")
log.debug("template resolved", template="default.html")
log.info("stage done", stage="render", duration_ms=12)
```

```text
{"job_id": "j-42", "stage": "render", "duration_ms": 12, "event": "stage done", "level": "info", "timestamp": "2026-10-18T11:24:45.907078Z"}
```

Обидва шляхи робочі. Власний formatter або `python-json-logger` підходять, коли пакетів ставити не хочеться і полів небагато. structlog вигідніший, коли полів багато й вони накопичуються по ходу (`bind`, контекст задачі), коли потрібні два режими виводу і коли записи сторонніх бібліотек теж мають виходити JSON-ом. **Для капстоуну обрано structlog поверх stdlib `logging`**: власний код пише через structlog, а uvicorn, httpx і решта пишуть у `logging`, і обидва потоки проходять через один handler з однаковими процесорами (розділ "Для капстоуну").

## Контекст задачі: `contextvars` замість `threading.local`

Воркер обробляє кілька задач одночасно, і кожен запис має містити `job_id`. Передавати `job_id` параметром у кожну функцію вниз по стеку незручно, а глобальна змінна в async-коді не працює: задачі чергуються на одному потоці. У Node для цього є `AsyncLocalStorage`; у Python це `contextvars.ContextVar` (з 3.7, офіційна назва "context variable"). Кожна asyncio-задача при створенні отримує копію поточного контексту, тому `set` усередині задачі бачать лише ця задача і те, що вона створить.

```ts
import { AsyncLocalStorage } from "node:async_hooks";

const jobContext = new AsyncLocalStorage<{ jobId: string }>();
await Promise.all([
  jobContext.run({ jobId: "j-1" }, () => runJob(20)),
  jobContext.run({ jobId: "j-2" }, () => runJob(10)),
]);
// всередині: log.info({ jobId: jobContext.getStore()?.jobId }, "rendered")
```

```python
import contextvars

job_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("job_id", default="-")

async def run_job(job_id: str, delay: float) -> None:
    job_id_var.set(job_id)          # видно лише в цій задачі
    ...
```

Різниця в моменті ізоляції. `AsyncLocalStorage.run` треба викликати явно, інакше контекст спільний. У Python межу задає сама задача: `create_task` і `TaskGroup` копіюють контекст автоматично, а `set` без `run` безпечний, бо міняє копію. Щоб значення потрапило в кожен запис `logging`, його дописує фільтр на handler: фільтр може не лише відкидати записи, а й додавати атрибути.

```python live
import asyncio
import contextvars
import logging
import sys

job_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("job_id", default="-")


class JobIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.job_id = job_id_var.get()
        return True


handler = logging.StreamHandler(sys.stdout)
handler.addFilter(JobIdFilter())
logging.basicConfig(handlers=[handler], level=logging.INFO, format="[%(job_id)s] %(name)s: %(message)s", force=True)
log = logging.getLogger("formbuilder.worker")
log.setLevel(logging.INFO)


async def render(delay: float) -> None:
    await asyncio.sleep(delay)
    log.info("rendered")


async def run_job(job_id: str, delay: float) -> None:
    job_id_var.set(job_id)
    log.info("started")
    await render(delay)
    log.info("finished")


async def main() -> None:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(run_job("j-1", 0.02))
        tg.create_task(run_job("j-2", 0.01))
    log.info("all done")


asyncio.run(main())
```

```text
[j-1] formbuilder.worker: started
[j-2] formbuilder.worker: started
[j-2] formbuilder.worker: rendered
[j-2] formbuilder.worker: finished
[j-1] formbuilder.worker: rendered
[j-1] formbuilder.worker: finished
[-] formbuilder.worker: all done
```

`render` нічого не знає про задачу, а записи правильні, і `main` після групи бачить `-`: значення з задач назад не протекло. `threading.local` для цього не годиться: він ізолює потоки, а всі asyncio-задачі виконуються в одному потоці, тож задачі перезаписують значення одна одної між `await`.

```python live
import asyncio
import threading

local = threading.local()


async def run_job(job_id: str, delay: float) -> None:
    local.job_id = job_id
    await asyncio.sleep(delay)
    print(f"{job_id} sees job_id={local.job_id}")


async def main() -> None:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(run_job("j-1", 0.02))
        tg.create_task(run_job("j-2", 0.01))


asyncio.run(main())
```

```text
j-2 sees job_id=j-2
j-1 sees job_id=j-2
```

> **Пастка.** Фільтр, доданий на логер, а не на handler, бачить лише записи, створені цим самим логером. Записи нащадків спливають до handlers предків, минаючи фільтри предків, тож `formbuilder.render` прийде без `job_id`, а формат з `%(job_id)s` дасть `--- Logging error ---` у stderr. Фільтри, що збагачують записи, вішають на handler.

```python
import contextvars
import logging
import sys

job_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("job_id", default="-")


class JobIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.job_id = job_id_var.get()
        return True


logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="[%(job_id)s] %(name)s: %(message)s", force=True)
logging.getLogger("formbuilder").addFilter(JobIdFilter())
job_id_var.set("j-1")
logging.getLogger("formbuilder").info("from the logger with the filter")
logging.getLogger("formbuilder.render").info("from a child logger")
```

```text
[j-1] formbuilder: from the logger with the filter
```

У stdout лише перший рядок; другий запис закінчився в stderr блоком `--- Logging error ---` з `ValueError: Formatting field not found in record: 'job_id'`. Для простих випадків 3.12 дає готовий атрибут `%(taskName)s` з ім'ям поточної asyncio-задачі, але імена на кшталт `Task-3` нічого не кажуть про бізнес-задачу, якщо не задати `name=` явно.

```python
import asyncio
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(taskName)s %(name)s: %(message)s", force=True)
log = logging.getLogger("formbuilder.worker")


async def run_job(job_id: str) -> None:
    log.info("started %s", job_id)


async def main() -> None:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(run_job("j-1"), name="job:j-1")
        tg.create_task(run_job("j-2"))
    log.info("all done")


asyncio.run(main())
log.info("outside the loop")
```

```text
job:j-1 formbuilder.worker: started j-1
Task-3 formbuilder.worker: started j-2
Task-1 formbuilder.worker: all done
None formbuilder.worker: outside the loop
```

У structlog фільтр не потрібен: `structlog.contextvars.bind_contextvars(...)` кладе поля в `ContextVar`, а процесор `merge_contextvars` на початку ланцюжка додає їх у кожну подію. Контекстний менеджер `bound_contextvars(...)` прив'язує поля на час блоку і повертає попередні значення на виході.

```python
import asyncio

import structlog
from structlog.contextvars import bind_contextvars, bound_contextvars, clear_contextvars

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.KeyValueRenderer(key_order=["level", "event"], sort_keys=True),
    ],
)
log = structlog.get_logger()


async def render(delay: float) -> None:
    await asyncio.sleep(delay)
    log.info("rendered")


async def run_job(job_id: str, delay: float) -> None:
    clear_contextvars()
    bind_contextvars(job_id=job_id)
    log.info("started")
    with bound_contextvars(stage="render"):
        await render(delay)
    log.info("finished")


async def main() -> None:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(run_job("j-1", 0.02))
        tg.create_task(run_job("j-2", 0.01))
    log.info("all done")


asyncio.run(main())
```

```text
level='info' event='started' job_id='j-1'
level='info' event='started' job_id='j-2'
level='info' event='rendered' job_id='j-2' stage='render'
level='info' event='finished' job_id='j-2'
level='info' event='rendered' job_id='j-1' stage='render'
level='info' event='finished' job_id='j-1'
level='info' event='all done'
```

> **Для капстоуну.** Воркер з m5-l05 це одна довгоживуча задача, яка в циклі бере з черги багато `GenerationJob`. Копія контексту робиться при створенні задачі, а не на кожну ітерацію, тому `bind_contextvars(job_id=...)` без очищення протягне `job_id` попередньої задачі в наступну, якщо та його не перезапише. Обробку однієї задачі обгортайте в `with bound_contextvars(job_id=job.id):`.

<!-- task: t5 -->

## Логи в тестах і гігієна в продакшні

`caplog` (вбудована фікстура pytest, детально про фікстури в m3-l03) вішає свій handler на root і збирає записи: `caplog.records` дає `LogRecord`, `caplog.messages` повідомлення з підставленими аргументами, `caplog.record_tuples` трійки `(логер, рівень, повідомлення)`, зручні для одного `assert`. Модуль під тестом нижче, далі тести до нього.

```python
import json
import logging

log = logging.getLogger(__name__)


def load(raw: str) -> dict | None:
    try:
        config = json.loads(raw)
    except json.JSONDecodeError:
        log.exception("config rejected")
        return None
    log.debug("config keys: %s", sorted(config))
    log.info("config %s loaded", config.get("title"))
    return config
```

```python
import logging

from loader import load


def test_rejected_config_is_logged(caplog):
    assert load('{"title": }') is None
    assert caplog.record_tuples == [("loader", logging.ERROR, "config rejected")]
    assert caplog.records[0].exc_info is not None


def test_info_message(caplog):
    load('{"title": "Signup"}')
    assert caplog.messages == ["config Signup loaded"]
```

```text
$ pytest -q test_loader.py
.F                                                                       [100%]
=================================== FAILURES ===================================
______________________________ test_info_message _______________________________

caplog = <_pytest.logging.LogCaptureFixture object at 0x108acc560>

    def test_info_message(caplog):
        load('{"title": "Signup"}')
>       assert caplog.messages == ["config Signup loaded"]
E       AssertionError: assert [] == ['config Signup loaded']
E         
E         Right contains one more item: 'config Signup loaded'
E         Use -v to get more diff

test_loader.py:14: AssertionError
=========================== short test summary info ============================
FAILED test_loader.py::test_info_message - AssertionError: assert ...
1 failed, 1 passed in 0.01s
```

> **Пастка.** Handler `caplog` приймає все, але ефективний рівень логера `loader` успадкований від root, тобто `WARNING`, і `log.info` повертається, не створивши запису. `ERROR` у першому тесті пройшов, `INFO` у другому ні. Рівень у тесті ставить `caplog.set_level(...)`, опційно для одного логера; для всього прогону є `log_level = "INFO"` у `[tool.pytest.ini_options]`. Друга пастка: логер з `propagate = False` до root не доходить, і `caplog` не бачить нічого.

```python
import logging

from loader import load


def test_info_message(caplog):
    caplog.set_level(logging.INFO)
    load('{"title": "Signup"}')
    assert caplog.messages == ["config Signup loaded"]


def test_debug_for_one_logger(caplog):
    caplog.set_level(logging.DEBUG, logger="loader")
    load('{"title": "Signup"}')
    assert [(r.levelname, r.getMessage()) for r in caplog.records] == [
        ("DEBUG", "config keys: ['title']"),
        ("INFO", "config Signup loaded"),
    ]


def test_propagate_off_hides_records(caplog):
    caplog.set_level(logging.INFO)
    logging.getLogger("loader").propagate = False
    try:
        load('{"title": "Signup"}')
    finally:
        logging.getLogger("loader").propagate = True
    assert caplog.messages == []
```

```text
$ pytest -q test_loader2.py
...                                                                      [100%]
3 passed in 0.00s
```

Для structlog є `structlog.testing.capture_logs()`: контекстний менеджер, що на час блоку підміняє процесори й повертає список словників подій, без рендерингу й без залежності від рівнів stdlib.

```python
import structlog
from structlog.testing import capture_logs

log = structlog.get_logger("formbuilder.worker")


def finish(job_id: str) -> None:
    log.info("job finished", job_id=job_id, status="ok")


with capture_logs() as logs:
    finish("j-42")
print(logs)
```

```text
[{'job_id': 'j-42', 'status': 'ok', 'event': 'job finished', 'log_level': 'info'}]
```

<!-- task: q4 -->

Гігієна починається з того, що в лог не потрапляє. Токени, паролі, повні тіла запитів з персональними даними в логах живуть довше за будь-яку базу і читаються ширшим колом людей. Перше правило: не передавати секрети в лог взагалі; Pydantic `SecretStr` (m2-l09) друкується як `**********` саме для цього. Друге: страховка на рівні handler, фільтр або процесор, що маскує відомі ключі. Фільтр бачить запис до форматування і може переписати повідомлення.

```python live
import logging
import re
import sys

SECRET = re.compile(r"(token|password|api_key)=\S+")


class RedactSecrets(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = SECRET.sub(r"\1=***", record.getMessage())
        record.args = None
        return True


handler = logging.StreamHandler(sys.stdout)
handler.addFilter(RedactSecrets())
logging.basicConfig(handlers=[handler], level=logging.INFO, format="%(levelname)s %(name)s: %(message)s", force=True)
log = logging.getLogger("formbuilder.webhooks")
log.setLevel(logging.INFO)

url = "https://hooks.example.com/notify?token=s3cr3t"
log.info("webhook registered: %s", url)
log.info("login with password=%s", "hunter2")
```

```text
INFO formbuilder.webhooks: webhook registered: https://hooks.example.com/notify?token=***
INFO formbuilder.webhooks: login with password=***
```

> **Пастка.** Процесор structlog `dict_tracebacks` за замовчуванням кладе в JSON локальні змінні кожного кадру traceback (`"locals": {...}`), а серед них легко опиняються токени й тіла запитів. Для продакшну беріть `format_exc_info` (traceback рядком) або `ExceptionRenderer` з `ExceptionDictTransformer(show_locals=False)`.

У продакшні рівень `INFO`, а `DEBUG` вмикається змінною оточення на час розслідування. Сторонні бібліотеки мають власні логери, і деякі балакучі: httpx пише кожен запит на `INFO` (m5-l07). Їх приглушують рівнем на їхньому логері, не чіпаючи свого. Попередження з модуля `warnings` (m0-l05) можна спрямувати в логи через `logging.captureWarnings(True)`: вони стають записами `WARNING` логера `py.warnings` і йдуть тим самим форматом, що й решта, замість окремого тексту в stderr.

```python
import logging
import sys

import httpx

logging.basicConfig(stream=sys.stdout, level=logging.DEBUG, format="%(levelname)s %(name)s: %(message)s")
transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"ok": True}))

with httpx.Client(transport=transport, base_url="https://renderer.local") as client:
    client.get("/health")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    client.get("/health")
logging.getLogger("formbuilder").info("health checked twice")
```

```text
INFO httpx: HTTP Request: GET https://renderer.local/health "HTTP/1.1 200 OK"
INFO formbuilder: health checked twice
```

```python
import logging
import sys
import warnings

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s %(name)s: %(message)s", force=True)
logging.captureWarnings(True)


def legacy_render(form_id: str) -> str:
    warnings.warn("legacy_render() is deprecated, use render()", DeprecationWarning, stacklevel=2)
    return f"<form id={form_id!r}>"


legacy_render("signup")
warnings.warn("template cache is disabled")
```

```text
WARNING py.warnings: capwarn.py:14: DeprecationWarning: legacy_render() is deprecated, use render()
  legacy_render("signup")

WARNING py.warnings: capwarn.py:15: UserWarning: template cache is disabled
  warnings.warn("template cache is disabled")

```

Останнє: `logging` синхронний. `emit` кожного handler виконується в потоці, що викликав `log.info`, під блокуванням handler. Для stdout це мікросекунди, але повільний handler (мережевий, файл на повільному диску) блокує event loop так само, як будь-який блокуючий виклик у async-коді (m5-l05). pino уникає цього, віддаючи запис через sonic-boom або transport у worker thread. У Python той самий прийом робиться явно: `QueueHandler` кладе запис у чергу, а `QueueListener` в окремому потоці (m5-l08) віддає його повільним handlers. З 3.12 це налаштовується прямо в `dictConfig`.

```python
import asyncio
import logging
import sys
import time


class SlowHandler(logging.StreamHandler):
    def emit(self, record: logging.LogRecord) -> None:
        time.sleep(0.05)          # мережевий або повільний дисковий handler
        super().emit(record)


logging.basicConfig(handlers=[SlowHandler(sys.stdout)], level=logging.INFO, format="%(message)s")
log = logging.getLogger("formbuilder.worker")


async def heartbeat() -> None:
    for _ in range(3):
        start = time.perf_counter()
        await asyncio.sleep(0.01)
        print(f"heartbeat late by {(time.perf_counter() - start - 0.01) * 1000:.0f} ms")


async def chatty() -> None:
    for n in range(3):
        log.info("stage %d", n)
        await asyncio.sleep(0)


async def main() -> None:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(heartbeat())
        tg.create_task(chatty())


asyncio.run(main())
```

```text
stage 0
stage 1
stage 2
heartbeat late by 149 ms
heartbeat late by 2 ms
heartbeat late by 2 ms
```

```python
import logging
import logging.config
import time


class SlowHandler(logging.StreamHandler):
    def emit(self, record: logging.LogRecord) -> None:
        time.sleep(0.05)
        super().emit(record)


logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "slow_console": {"()": SlowHandler, "stream": "ext://sys.stdout"},
        "queue": {"class": "logging.handlers.QueueHandler", "handlers": ["slow_console"]},
    },
    "root": {"level": "INFO", "handlers": ["queue"]},
})
queue_handler = logging.getHandlerByName("queue")
queue_handler.listener.start()

log = logging.getLogger("formbuilder.worker")
start = time.perf_counter()
for n in range(3):
    log.info("stage %d", n)
print(f"3 log calls took {(time.perf_counter() - start) * 1000:.1f} ms")
queue_handler.listener.stop()
```

```text
3 log calls took 0.1 ms
stage 0
stage 1
stage 2
```

Таймер запізнився на 150 мс, бо три записи по 50 мс виконались прямо в event loop. З черговим handler три виклики `log.info` зайняли 0.1 мс, а друк відбувся у фоновому потоці. `listener.stop()` у кінці обов'язковий: він дописує решту черги перед виходом, інакше останні записи втрачаються.

## Для капстоуну

Логування FormBuilder: structlog поверх stdlib. Власний код пише через `structlog.get_logger(__name__)`, uvicorn і httpx пишуть у `logging`, і обидва потоки потрапляють в один handler з `structlog.stdlib.ProcessorFormatter`. Спільні процесори (`SHARED`) додають контекст, рівень, ім'я логера й час однаково для обох; для записів stdlib вони запускаються через `foreign_pre_chain`. Формат обирає змінна `FORMBUILDER_LOG_FORMAT`: `console` локально, `json` у контейнері. Конфігурацію викликає точка входу, повторний виклик замінює handler, а не додає ще один.

```python
import logging
import os
import sys

import structlog
from structlog.typing import Processor

SHARED: list[Processor] = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    structlog.processors.TimeStamper(fmt="iso", utc=True),
]


def configure_logging(fmt: str | None = None, level: str | None = None) -> None:
    fmt = fmt or os.environ.get("FORMBUILDER_LOG_FORMAT", "console")
    level = level or os.environ.get("FORMBUILDER_LOG_LEVEL", "INFO")

    tail: list[Processor]
    if fmt == "json":
        tail = [structlog.processors.format_exc_info, structlog.processors.JSONRenderer()]
    else:
        tail = [structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty())]

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *SHARED,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=SHARED,
            processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, *tail],
        )
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.captureWarnings(True)
```

`@timed` з m5-l04 тепер пише подію з полями замість тексту: `stage`, `status`, `duration_ms`. `job_id` декоратор не знає, його додасть `merge_contextvars` з контексту задачі. Типізація через `ParamSpec` (синтаксис `[**P, R]` з 3.12) зберігає сигнатуру обгорнутої функції для mypy; `mypy --strict` на обох модулях проходить.

```python
import functools
import time
from collections.abc import Awaitable, Callable

import structlog

log = structlog.get_logger(__name__)


def timed[**P, R](stage: str) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    def decorator(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @functools.wraps(fn)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            start = time.perf_counter()
            status = "error"
            try:
                result = await fn(*args, **kwargs)
                status = "ok"
                return result
            finally:
                duration_ms = round((time.perf_counter() - start) * 1000, 1)
                log.info("stage finished", stage=stage, status=status, duration_ms=duration_ms)
        return wrapper
    return decorator
```

Перевірка на одній задачі, де публікація падає, плюс запис від stdlib-логера uvicorn після неї:

```python
import asyncio
import logging

import structlog
from structlog.contextvars import bound_contextvars

from formbuilder.logs import configure_logging
from formbuilder.timing import timed

configure_logging()
log = structlog.get_logger("formbuilder.worker")


@timed("render")
async def render(form_id: str) -> str:
    await asyncio.sleep(0.02)
    return f"<form id={form_id!r}></form>"


@timed("publish")
async def publish(html: str) -> str:
    await asyncio.sleep(0.01)
    raise ConnectionError("storage unavailable")


async def run_job(job_id: str, form_id: str) -> None:
    with bound_contextvars(job_id=job_id):
        log.info("job started", form_id=form_id)
        try:
            await publish(await render(form_id))
        except ConnectionError:
            log.exception("job failed")


asyncio.run(run_job("j-42", "signup"))
logging.getLogger("uvicorn.error").info("Application startup complete.")
```

```text
$ python run.py
2026-10-18T11:30:45.735855Z [info     ] job started                    [formbuilder.worker] form_id=signup job_id=j-42
2026-10-18T11:30:45.758442Z [info     ] stage finished                 [formbuilder.timing] duration_ms=22.1 job_id=j-42 stage=render status=ok
2026-10-18T11:30:45.770193Z [info     ] stage finished                 [formbuilder.timing] duration_ms=11.6 job_id=j-42 stage=publish status=error
2026-10-18T11:30:45.770329Z [error    ] job failed                     [formbuilder.worker] job_id=j-42
Traceback (most recent call last):
  File "run.py", line 30, in run_job
    await publish(await render(form_id))
  File "formbuilder/timing.py", line 17, in wrapper
    result = await fn(*args, **kwargs)
             ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "run.py", line 23, in publish
    raise ConnectionError("storage unavailable")
ConnectionError: storage unavailable
2026-10-18T11:30:45.771323Z [info     ] Application startup complete.  [uvicorn.error]

$ FORMBUILDER_LOG_FORMAT=json python run.py
{"form_id": "signup", "event": "job started", "job_id": "j-42", "level": "info", "logger": "formbuilder.worker", "timestamp": "2026-10-18T11:30:45.833499Z"}
{"stage": "render", "status": "ok", "duration_ms": 20.9, "event": "stage finished", "job_id": "j-42", "level": "info", "logger": "formbuilder.timing", "timestamp": "2026-10-18T11:30:45.854802Z"}
{"stage": "publish", "status": "error", "duration_ms": 12.1, "event": "stage finished", "job_id": "j-42", "level": "info", "logger": "formbuilder.timing", "timestamp": "2026-10-18T11:30:45.867131Z"}
{"event": "job failed", "job_id": "j-42", "level": "error", "logger": "formbuilder.worker", "timestamp": "2026-10-18T11:30:45.867231Z", "exception": "Traceback (most recent call last):\n  File \"run.py\", line 30, in run_job\n    await publish(await render(form_id))\n  File \"formbuilder/timing.py\", line 17, in wrapper\n    result = await fn(*args, **kwargs)\n             ^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"run.py\", line 23, in publish\n    raise ConnectionError(\"storage unavailable\")\nConnectionError: storage unavailable"}
{"event": "Application startup complete.", "level": "info", "logger": "uvicorn.error", "timestamp": "2026-10-18T11:30:45.868308Z"}
```

Запис `uvicorn.error` пройшов через ті самі процесори і має ті самі поля, що й записи structlog, хоча uvicorn про structlog нічого не знає. `job_id` є і в записах `@timed`, і в `job failed`, а після виходу з `bound_contextvars` його вже немає. `filter_by_level` першим у ланцюжку відкидає `debug` при рівні `INFO` до запуску решти процесорів.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`console.log` у бібліотечному коді, тобто `print`.** Вимкнути його без правки коду неможливо, рівня немає, і він змішується з даними в stdout. Правильно: логер модуля і рівень.

   ```python
   log = logging.getLogger(__name__)
   log.debug("fields: %s", fields)   # замість print(fields)
   ```

2. **Template literal у логах, тобто f-рядок.** Обчислюється навіть при вимкненому рівні і ламає групування за шаблоном. Правильно: `%s`-аргументи; в structlog подія-константа плюс поля.

   ```python
   log.info("form %s published", form_id)            # не f"form {form_id} published"
   structlog_log.info("form published", form_id=form_id)
   ```

3. **Один глобальний логер на застосунок або `logging.info` на root.** Імпортують `logger` з `utils.py` усюди, і в записах немає модуля; `logging.info` в бібліотеці мовчки налаштовує root за застосунок. Правильно: `getLogger(__name__)` у кожному модулі, конфігурація лише в точці входу.

   ```python
   log = logging.getLogger(__name__)   # у кожному модулі
   ```

4. **Шукати pino-transport, а писати другий handler на проміжний логер.** Адресати в `logging` це handlers на root, і кожен handler на дочірньому логері без `propagate = False` дублює записи. Правильно: усі handlers в одному місці конфігурації, найчастіше на root.

   ```python
   "root": {"level": "INFO", "handlers": ["console", "file"]}
   ```

5. **Очікувати асинхронного логування, як у pino.** `emit` виконується в потоці виклику і блокує event loop, якщо handler повільний. Правильно: швидкий stdout або `QueueHandler` з `QueueListener` для повільних адресатів.

   ```python
   "queue": {"class": "logging.handlers.QueueHandler", "handlers": ["slow_console"]}
   ```

6. **`log.error(e)` як `console.error(err)`.** Друкується лише повідомлення, стек губиться. Правильно: `log.exception(...)` у `except` або `exc_info=e` поза ним.

   ```python
   except ConnectionError:
       log.exception("publish failed")
   ```

7. **`log.warn` з pino.** У 3.12 це `DeprecationWarning`, у 3.13 `AttributeError`. Правильно: `log.warning`; ruff `G010` виправляє автоматично.

   ```python
   log.warning("template cache miss")
   ```

8. **`dictConfig` без `"disable_existing_loggers": False`.** Логери, створені під час імпорту модулів, вимикаються, і логи пакета зникають без помилки. Правильно: завжди явно `False`.

   ```python
   {"version": 1, "disable_existing_loggers": False, ...}
   ```

## Підсумок

- Логування розділяє подію в коді й рішення про рівень, адресат і формат у конфігурації; `logging` за замовчуванням пише текст у stderr, root на `WARNING`.
- У кожному модулі `log = logging.getLogger(__name__)`; ім'я з крапками задає ієрархію, `NOTSET` успадковує рівень від батька.
- Налаштовує точка входу: `basicConfig` для скрипта (повторний виклик нічого не робить без `force=True`), `dictConfig` з `disable_existing_loggers: False` для застосунку. Бібліотека не налаштовує нічого.
- Запис іде: рівень логера, фільтри, handlers логера, потім handlers предків без перевірки їхніх рівнів; handler на проміжному логері дублює записи.
- `log.info("x %s", value)`, а не f-рядок: форматування відкладене, шаблон групується; поля через `extra`, дорогі аргументи під `isEnabledFor`.
- `log.exception` лише в `except`; `exc_info=e` для збережених винятків; логують там, де виняток остаточно обробили.
- JSON-логи дає власний `Formatter`, `python-json-logger` або structlog; у капстоуні structlog поверх stdlib через `ProcessorFormatter`.
- `job_id` через `ContextVar`: кожна asyncio-задача має копію контексту; `threading.local` у asyncio спільний для всіх задач. Фільтри-збагачувачі вішають на handler.
- `caplog` бачить лише записи, що пройшли рівень логера: `caplog.set_level(logging.INFO)`; для structlog `capture_logs()`.
- У продакшні: без секретів, `INFO` за замовчуванням, шумні бібліотеки на `WARNING`, `captureWarnings(True)`, повільні handlers за `QueueHandler`.

## Що далі

Модуль 6 починається з m6-l01 про `pathlib`, `shutil` і `tempfile`: `Publisher` пише статику на диск, і кожен його крок (запис, атомарна заміна, прибирання старих версій) логуватиметься подіями structlog з `job_id` у контексті, як тут. Функцію `configure_logging` викликатиме CLI з m6-l06, а `FORMBUILDER_LOG_FORMAT` і `FORMBUILDER_LOG_LEVEL` переїдуть у налаштування pydantic-settings.
