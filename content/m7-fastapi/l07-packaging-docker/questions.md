# Ключові питання уроку m7-l07 "Пакування й запуск: uvicorn, Dockerfile з uv"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Команди non-live з реальним виводом там, де можливо локально (uvicorn так; docker лише якщо Docker Desktop встановлений і запущений, інакше показати Dockerfile і команди без виводу й сказати це в notes.md). Завдання проєктні в капстоуні, quiz у браузері. Інфраструктура (оркестрація, CI/CD, reverse proxy) не викладається.

- [x] uvicorn: `uvicorn formbuilder.api:app --host 0.0.0.0 --port 8000`, `--reload` лише в dev, `--workers N` і що це означає для in-memory стану (посилання на m7-l03), `--log-level`, програмний запуск `uvicorn.run`. Одне речення про gunicorn з uvicorn-воркерами і про `fastapi run`.
- [x] Налаштування через env у контейнері (посилання на m6-l06): `FORMBUILDER_*`, без `.env` у образі, секрети не в образі.
- [x] Dockerfile з uv: образ `python:3.12-slim`, копіювання uv з офіційного образу, `UV_COMPILE_BYTECODE`, `uv sync --locked --no-dev` у окремому шарі перед копіюванням коду (кеш шарів), non-root користувач, `CMD` через `exec`-форму, щоб SIGTERM доходив (посилання на m6-l07). Порівняти з Node-Dockerfile: `npm ci` → `uv sync --locked`, `node_modules` → `.venv`.
- [x] Multi-stage: builder з компіляцією залежностей і фінальний образ без uv і dev-залежностей; розмір образу до і після.
- [x] `.dockerignore` (`.venv`, `__pycache__`, `dist`, `tests`), `HEALTHCHECK` на `/health`, порти, томи для `out/` і SQLite-файлу.
- [x] `docker compose` з одним сервісом `api` і томом; логи в stdout у JSON (посилання на m5-l09); graceful stop і `stop_grace_period`.
- [x] Локальний запуск без Docker як еталон: `uv run uvicorn ...`, `uv run formbuilder serve` (посилання на m6-l06).
- [x] Для капстоуну: Dockerfile і compose у `capstone/`, `uv run formbuilder serve` як CLI-обгортка над uvicorn, `HEALTHCHECK`; перевірка `docker build` і `curl /health`, якщо Docker є.
- [x] Які JS-звички тут шкодять: `node:alpine` як перший вибір (musl і колеса Python), `npm start` у `CMD` shell-формою, копіювання всього коду до встановлення залежностей, `pm2` у контейнері.
