# Ключові питання уроку m7-l01 "FastAPI: роутери, моделі запитів і відповідей, Depends"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. FastAPI не працює в Pyodide: приклади non-live з реальним виводом (`uvicorn` + `httpx` локально, або `TestClient`), завдання `type: project` у `capstone/` з `verify: cd capstone && uv run pytest tests/test_api.py -q`, у браузері quiz і чисті функції (Pydantic-моделі запитів з `requires: [pydantic]`). HTTP-теорія (методи, статуси, REST-дизайн) не викладається: лише те, що є Python і FastAPI.

- [x] Мінімальний застосунок: `FastAPI()`, `@app.get("/health")`, запуск `uvicorn formbuilder.api:app --reload`, автоматична документація `/docs` і `/openapi.json`. Порівняти з Express/NestJS: декоратор замість `app.get(path, handler)`, типи параметрів з анотацій.
- [x] Параметри: path (`/forms/{form_id}`), query (аргументи функції зі значеннями за замовчуванням), тіло (параметр з типом `BaseModel`), заголовки й cookies через `Header`/`Cookie`; валідація і 422 з деталями від Pydantic (посилання на m2-l09); `Annotated[int, Query(ge=1)]`.
- [x] Моделі відповіді: `response_model`, фільтрація зайвих полів, `status_code=201`, повернення dict/моделі/списку, `model_config` з camelCase-аліасами для фронтенду (посилання на m2-l09).
- [x] `APIRouter`: розбиття на модулі (`forms`, `jobs`), `prefix`, `tags`, `include_router`; структура пакета `formbuilder/api/` (посилання на m3-l01).
- [x] `Depends`: функція-залежність як інʼєкція (сховище, налаштування, поточний користувач), залежності з `yield` для ресурсів (з'єднання з SQLite, посилання на m6-l08), кешування в межах запиту, `app.dependency_overrides` для тестів. Порівняти з providers/DI у NestJS і пояснити, чому тут це просто функції (посилання на m4-l08).
- [x] Sync проти async обробників: `def` виконується в threadpool, `async def` у циклі подій; блокуючий код у `async def` вішає сервер (посилання на m5-l05); коли що для капстоуну.
- [x] `lifespan` через `asynccontextmanager` (посилання на m5-l06): відкрити сховище і запустити воркер на старті, зупинити на виході; `app.state`.
- [x] Налаштування через `pydantic-settings` і `Depends(get_settings)` з `lru_cache` (посилання на m6-l06, m5-l03).
- [x] Для капстоуну: `POST /forms` приймає `FormConfig`, зберігає версію, повертає id; `GET /forms/{id}`; `POST /forms/{id}/build` ставить задачу в чергу (посилання на m7-l03) і повертає `job_id`; `GET /jobs/{id}` статус. Перший тест через `TestClient`.
- [x] Які JS-звички тут шкодять: `req`/`res` об'єкти (тут параметри функції), middleware для парсингу body, `res.status(201).json()`, класи-контролери з декораторами NestJS, DTO + ValidationPipe (тут одна Pydantic-модель).
