# Backlog редакторських правок

Що треба уніфікувати одним проходом, коли контент модулів буде готовий. Не блокує навчання.

## Проєктні завдання: робоча директорія і verify
Агенти модулів 0 і 2 писали до того, як спека зафіксувала правило. Зараз є п'ять конвенцій:
- `~/python-sandbox/m0-l01` (m0-l01 p1, p2)
- `playground/m0-l03/` (m0-l03 p1, p2)
- `practice/m0-l04/` (m0-l04 p1), `debug-lab/` (m0-l05 p1), `formbuilder-draft/` (m0-l02 p2)
- [x] шляхи відносно `capstone/` без `cd` (m2-l05 p1, m2-l06 p1, m2-l07 p1–p2, m2-l09 p1, m5-l05 p1): переведено на `cd capstone && uv run ...`; так само m3-l02 p1 і m7-l08 p1. Модулі 2–7 тепер без винятків
- `cd capstone && uv run ...` (m2-l08 p1–p2)

Правило зі спеки: капстоун → `cd capstone && uv run ...`; решта → `practice/<lesson-id>/` з кореня курсу через `.venv/bin/...`. Переписати `verify` і тексти `prompt` відповідно. m0-l04 p2 вважає, що `capstone/pyproject.toml` існує з m0-l02; насправді з m0-l06, тож p2 або переноситься в m0-l06, або переписується на `practice/m0-l04/`.

## Перетини між уроками
- m1-l01 і m1-l02 обидва розбирають `//` і `%` на від'ємних числах. Лишити в m1-l02, у m1-l01 один приклад і посилання.
- [x] m2-l05 пропонує задачу `to_domain` (Pydantic-моделі з m2-l09 → dataclasses з m2-l05): додано як t6 у m2-l09, функція лягає в `config.py` (m2-l09 p1).

## Обсяг
Уроки понад 45 абзаців, кандидати на поділ, якщо на практиці йтимуть довго: m0-l02 (51), m0-l04 (50), m2-l01 (50), m2-l08 (50), m0-l03 (47), m1-l01 (46).

## Стиль коду
- Зрізи: у лекціях `items[start:start + n]`, `ruff format` хоче `items[start : start + n]`. Вирішити один раз і прогнати форматер по всіх `solution`.
- Два порожні рядки після імпортів у `solution` (I001): частина агентів вирівняла, частина ні.

## Платформа має врахувати
- `## ` всередині ```text блоків (m0-l04, вивід `ruff rule`) не має потрапляти в правий сайдбар: парсити заголовки лише поза кодовими блоками.
- Живі блоки, що друкують `__main__.X` або використовують `from __future__ import annotations` першим рядком (m2-l06): виконувати код як `__main__` і нічого не дописувати перед першим рядком.
- Pyodide 32-бітний: блоки з `sys.getsizeof`/`sys.maxsize` навмисно не `live` (m1-l02).
- Завдання t3 у m0-l03 пише у stderr; порівнюється лише stdout.

## Капстоун: назви файлів між модулями
Канонічна розкладка, хто що створює, `JobStore`, залежності й файли тестів тепер у `docs/capstone-map.md`.
- [x] Модуль 2 одразу створює остаточні файли: `config.py` (m2-l06 TypedDict → m2-l09 Pydantic), `domain.py`, пакет `renderers/` (m2-l07). m3-l01 p1 нічого не перейменовує, лише фіксує шари; `load_config` і `ConfigError` додає m3-l03 у той самий `config.py`.
- [x] Поза канонічною розкладкою прибрано: `tree.py` (m4-l02 → `domain.py`), `testing.py` (m2-l07, m4-l04 → `renderers/text.py`), `enums.py` (m4-l06 → `domain.py`/`jobs.py`), `pipeline.py` і `app.py` (m4-l08 → `generate.py`/`cli.py`), `jinja_renderer.py` (m7-l06 → `renderers/jinja.py`), `api/events.py` і `api/hub.py` (m7-l04 → `hub.py` і `api/ws.py`), `api/__init__.py` з `create_app` (m7-l01 → `api/app.py`). `Publisher`/`DirPublisher` з m3-l04 у `publisher.py`, `generate.py` лише крок генерації.
- [x] m3-l06: капстоун стає окремим git-репозиторієм (`git init` у `capstone/`), конфіг без `files: ^capstone/` і `--directory capstone`, CI у `capstone/.github/workflows/ci.yml`. Теорія уроку лишилась на монорепо-розкладці і так підписана.

## Капстоун: інтерфейс JobStore
- [x] Одна сигнатура з m6-l08 (`enqueue`, `next_pending`, `mark_done`, `mark_failed`, `requeue_running`, `history`, `save_config`) плюс `latest_config` і `get_job` з m7-l01. `FormStore` у m7-l01 і `create/get/save/recover` у m7-l03 переписано; `recover` став `requeue_running` (і t2 m7-l03). `config_version` лишився. `MemoryJobStore` живе в `store.py`.
- [x] Розширення, яких вимагав воркер: keyword-only `retry: bool = True` у `mark_failed` і правило "вичерпані спроби → failed" у `requeue_running` (обидва в m7-l03 p1, поведінка m6-l08 за замовчуванням не змінилась).
- [x] Файли тестів m7-l03 і m7-l05 узгоджено: `test_api.py`, `test_api_errors.py`, `test_worker.py`, `test_ws.py` (тест хаба напряму теж у `test_ws.py`).
- [x] Тести капстоуну на httpx2: m7-l01 і m7-l04 кажуть про `uv add --dev httpx2` одним реченням.

## Модуль 7: узгодити між уроками
- [x] m7-l05 обирає anyio-плагін, `uv add --dev httpx2 asgi-lifespan`; m7-l01 і m7-l04 це згадують.
- [x] `create_app(settings)` в `api/app.py` і `Settings.workers` вводить m7-l01; `workers` додано в `Settings` у m6-l06.
- [x] Формат помилок m7-l05 звірено з m7-l02: 404 форми `http_404`, 500 `internal_error`, шлях поля як `loc_to_path` (t3 m7-l05 тепер зрізає й `query`). Префікс `/api/v1` прибрано з m7-l02 p1, шляхи спільні для m7-l01–m7-l05.
- [x] m7-l04: `JobEvents.watch` підписує в момент виклику й повертає генератор; додано живий приклад втраченої події і пастку про незапущений генератор.
- [x] fastapi/uvicorn в основних `dependencies`: прибрано extra `web` з m3-l02 (p1, розділ капстоуну, callout у теорії extras) і `--extra web` з m7-l07. У m7-l07 поле `workers: Literal[1]` перейменовано на `uvicorn_workers`, бо `workers` означає воркерів генерації.

## Капстоун: лишилось
Свідомо не вирівняно в цьому проході: або чужі файли, або це вимагало переписати урок, а не підправити.
- m6-l01 p1 (поза зоною цього редактора) каже "створіть `publisher.py`", хоча модуль уже є з m3-l04 і m5-l07; `StaticPublisher.publish(form_id, version, html, assets)` синхронний і повертає `Path`, а `Publisher` з m3-l04 асинхронний `publish(slug, html) -> str`, на нього спираються m4-l08 і `generate`. Треба вибрати один протокол публікації сторінки (пропозиція: синхронний з версією, як у m6-l01 і сценарії m7-l03, виклик через `to_thread`) і переписати m3-l04 p2 та m4-l08 p1.
- m6-l02 p1 (поза зоною) імпортує `FormConfig` з `formbuilder.models`; має бути `formbuilder.config`.
- Протокол рендерера у воркері: `Renderer.render(element, theme)` у пакеті `renderers/`, а сценарій m7-l03 і fake у m7-l05 рендерять конфіг цілком (`render(config_id)`, `render(config: FormConfig)`). Потрібен один адаптер "конфіг → сторінка" (наприклад, `FormConfig.render` з m3-l01 після `to_domain`), і ним має користуватися `Worker`.
- Тип `job_id`: у сховищі й API ціле, у подіях m7-l04 `job_id: str`, шлях WebSocket рядковий. Вирівняти, коли m7-l04 перезапускатимуть цілком.
- `JobEvents` з t4 m7-l03 має `publish(job_id, status)` з рядковими статусами, а з m7-l04 `publish(event)` з типізованими подіями; m7-l04 p1 каже перенести хаб у `hub.py`, але сигнатура змінюється, і воркер з m7-l03 треба оновити.
- Два оркестратори генерації: `Pipeline` (m4-l08, CLI `build`) і `Worker` (m7-l03, API). Можна звести `Worker` до виклику `Pipeline.run`.
- `logs.py`: m5-l09 налаштовує structlog (`configure_logging`), m7-l07 stdlib `JsonFormatter` і `log_config` для uvicorn. Співіснують, але варто пояснити зв'язок в одному з уроків.
- `GET /health` формально з'являється в m7-l07 p1, а тести m7-l05 його вже використовують.
- CLI: команда `render CONFIG [FORMAT]` з m3-l01 не згадана в Typer-CLI m6-l06.
- m3-l02: entry point `html = "formbuilder.renderers.html:render"`, а модуль формату з m3-l01 експортує об'єкт `renderer`, не функцію `render`.
- Ілюстрації з реальним виводом, зняті на ранніх розкладках, лишились як є: цикл імпортів з `formbuilder/models.py` (теорія m2-l08), плоский `renderers.py` (теорія m3-l01), вивід mypy з `capstone/src/formbuilder/models.py` (монорепо-теорія m3-l06, підписана), coverage з `renderers.py` (m3-l04, підписано) і з `events.py` дзеркала (m7-l05, підписано). Перезняти, коли буде зібраний еталонний капстоун.
- m3-l02 `questions.md` вимагає `optional-dependencies` `[web]`; питання закрите теорією extras, капстоун свідомо без extra (questions.md не редагується).

