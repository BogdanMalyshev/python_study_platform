# Нотатки до m7-l06 "Jinja2: шаблони як простий рендерер статики"

## Що запускалось

Jinja2 немає ні в `.venv` проєкту, ні в Pyodide, тому приклади теорії запускались в окремому scratch venv у підпапці `m7-l06` тимчасової директорії: `uv venv --python 3.12` + `uv pip install jinja2==3.1.6 pytest==9.1.1`. Версії: CPython 3.12.12, Jinja2 3.1.6 (остання на момент написання, `uv pip install -U` нічого не оновив), MarkupSafe 3.0.4 (залежність Jinja2), pytest 9.1.1. Після перевірки підпапку видалено.

- `lesson.md` згенеровано з шаблону, де кожен код-блок підставлявся з реального файлу, а кожен `text`-блок виводу з реального stdout цього файлу; ручного виводу в уроці немає. Потім окремий скрипт витягнув із готового `lesson.md` кожну пару `python` + `text` і перезапустив: 18 з 18 збігаються (адреса об'єкта в прикладі з `meta.items` відрізняється між запусками, її при порівнянні замасковано; у тексті уроку лишився реальний вивід).
- `PackageLoader` перевірено на справжньому пакеті `formbuilder` з директорією `templates/` через `PYTHONPATH` (і для прикладу з `page.html`/`mail.txt`, і для капстоун-рендерера).
- Капстоун-еталон з розділу "Для капстоуну" (`models.py`, `renderers.py`, `jinja_renderer.py`, чотири шаблони, `demo_render.py`, `demo_worker.py`) зібрано як окремий пакет: рендер HTML і запис через `asyncio.to_thread` дають вивід з уроку; `mypy --strict src/formbuilder demo_worker.py` (mypy 2.4.0 з `.venv` проєкту, `--python-executable` scratch venv) дає `Success: no issues found in 5 source files`. Тест з розділу golden HTML (`tests/test_jinja_renderer.py` + `tests/fixtures/signup_dark.html`) пройшов: `2 passed`; час у рядку pytest в уроці округлений до умовного, бо він змінюється між запусками.
- Окремі пробні запуски для тверджень без власного блоку: `{{ a === b }}` і `{{ a && b }}` дають `TemplateSyntaxError` (типові помилки, п. 4); `Markup(", ").join(...)` і `Markup % str` екранують аргументи; текст до `{% extends %}` друкується, після нього поза блоками ігнорується; статичний текст `{% include %}`-шаблону не екранується незалежно від розширення (тому `>` у critical CSS доходить як є); `env.cache.capacity == 400`.
- `tasks.yaml`: розпарсено `yaml.safe_load`; кожен `<!-- task: id -->` вставлено рівно один раз. Для кожного `type: code` виконано `solution + harness` через `.venv/bin/python` проєкту, stdout порівняно з `expected` після нормалізації: 4 з 4. `starter + harness` не дає `expected` для жодного. Усі `solution` проходять `mypy --strict`. Код квізів запущено з Jinja2 у scratch venv: q1 `<p><b>x</b></p>`, q2 рядок `d` єдиний з неекранованим `<script>`, q3 `Email: None` (і `Email: -` для `default('-', true)`, як сказано в explain).

## Рішення

- Урок короткий за задумом: 27 абзаців теорії плюс 8 callout-ів, вісім теоретичних розділів, `Для капстоуну` і три обов'язкові.
- Усі приклади з Jinja2 non-live з реальним виводом; `python live` лише один (`html.escape`, стандартна бібліотека). Браузерні завдання тільки на чистий Python: t1 атрибути з `html.escape`, t2 тема-dataclass у рядок CSS-змінних з відсіюванням CSS-ін'єкції, t3 нормалізація HTML для golden-тесту, t4 міні-шаблонізатор (`{{ path }}`, крапка для dict і об'єктів, екранування, `| safe`, `LookupError` як `StrictUndefined`).
- Квізів 3, проєктних завдань 2: p1 `JinjaRenderer` з шаблонами і тестами екранування, p2 golden-тест, параметризований тест макросів і підключення до воркера через `to_thread`. `verify` в обох `cd capstone && uv run pytest tests/test_jinja_renderer.py -q`. У `capstone/` поки немає моделей, `renderers.py` і воркера з попередніх уроків (лише `cli.py` і smoke-тест), тож команда проти реального репозиторію не запускалась; еталон перевірено як окремий пакет, як описано вище.
- Моделі взято з m2-l05 (`Theme(mode, primary_color)`, `Element(type, id, name, label, children)`), бо це остання канонічна форма; m4-l05 використовує `kind`. У p1 сказано підлаштовувати шаблони під фактичні моделі капстоуну, а не навпаки.
- `JinjaRenderer` реалізує `Renderer` Protocol напряму, без `BaseRenderer`: обхід дерева робить рекурсивний макрос, що прямо узгоджується з приміткою в m4-l05.
- Пробіли: `trim_blocks`, `lstrip_blocks` і `keep_trailing_newline=True`; останнє потрібне, бо інакше `{% include "critical.css" %}` з'їдає перенос перед `</style>`. Ця деталь у тексті не розбирається, вона видна в коді рендерера.
- `SandboxedEnvironment`, `{% call %}`/`caller()`, `enable_async`, `nh3` названі одним реченням кожне, без прикладів: для рендерера статики з власних шаблонів вони не потрібні.
- `FastAPI Jinja2Templates` лише згадано: у капстоуні Jinja рендерить статику у воркері, а не HTML-відповіді ендпоінтів.

## Незакриті питання

Немає. Усі 10 пунктів `questions.md` закриті кодом і реальним виводом.

## Залежності

- Спирається на m2-l05 (frozen dataclass як контекст), m2-l07 (`Renderer` Protocol, реєстр), m4-l05 (`BaseRenderer`, від якого тут свідомо відмовились), m3-l02 і m6-l01 (шаблони як файли пакета, `importlib.resources` проти `__file__`), m5-l08 (`asyncio.to_thread`), m7-l03 (воркер), m7-l04 (WebSocket-статуси, які блокує синхронний рендер), m1-l06 (`for-else` для контрасту з `{% for %}{% else %}`), m2-l09 (валідація кольору теми на вході).
- Готує для m7-l07 (шаблони мають потрапити у wheel і Docker-образ; golden-тест проти встановленого пакета) і для порівняння з Node-рендерером з m6-l05 за тим самим Protocol.

## Редакторська правка: узгодження капстоуну (18.10.2026)

Єдине джерело правди для файлів капстоуну, `JobStore` і залежностей тепер `docs/capstone-map.md`. Пункти вище, що з ним розходяться, застаріли.

- `jinja_renderer.py` → `renderers/jinja.py` з `renderer = JinjaRenderer()` для `get_renderer("jinja")`; моделі з `formbuilder.domain`. Перезапущено: рендер дає той самий HTML, golden-тест і тест екранування 2 passed, `mypy --strict src/formbuilder demo_worker.py` тепер `6 source files`.
