# Ключові питання уроку m7-l02 "Обробка помилок, middleware, CORS, OpenAPI"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Той самий режим, що m7-l01: non-live приклади, проєктні завдання в капстоуні, quiz у браузері.

- [x] `HTTPException(status_code, detail)`: де кидати, як виглядає відповідь, `headers`; власні винятки домену (`ConfigError` з m1-l11) і `@app.exception_handler(ConfigError)`, що перетворює їх у JSON з єдиним форматом помилки.
- [x] Формат помилок валідації 422 від Pydantic: структура `detail` з `loc`/`msg`/`type`, перевизначення через обробник `RequestValidationError` під формат фронтенду (camelCase, плоский список), посилання на m2-l09.
- [x] Неочікувані винятки: обробник `Exception` з логуванням (посилання на m5-l09) і відповіддю 500 без traceback назовні; чому в dev показують деталі, а в prod ні; `debug=`.
- [x] Middleware: `@app.middleware("http")` для request id і часу обробки, `BaseHTTPMiddleware` і його обмеження, ASGI-middleware одним реченням; порядок виконання; `request.state`.
- [x] CORS: `CORSMiddleware` з `allow_origins`, `allow_methods`, `allow_headers`, `allow_credentials`; лише як налаштувати для фронтенду FormBuilder на іншому origin, без теорії CORS (учень знає її з фронтенду).
- [x] OpenAPI: `tags`, `summary`, `description`, `responses={404: {...}}`, `examples` у моделях, `openapi_url` вимкнути в prod; генерація TS-клієнта з `openapi.json` одним реченням як місток до фронтенду.
- [x] Версіонування і префікси (`/api/v1`), `root_path` за проксі, trailing slash.
- [x] Статика і файли: `StaticFiles` для згенерованих сторінок, `FileResponse`, `StreamingResponse` для великих файлів (посилання на m5-l02).
- [x] Для капстоуну: єдиний формат помилок `{"error": {"code", "message", "fields"}}`, обробники для `ConfigError`, `JobNotFound`, `RequestValidationError`; middleware з request id у логах; CORS для `http://localhost:5173`; статика з `out/`.
- [x] Які JS-звички тут шкодять: error-handling middleware з чотирма аргументами, `next()`, `try/catch` у кожному обробнику, `cors()` з `*` і credentials, helmet-мислення (тут окремі middleware або проксі).
