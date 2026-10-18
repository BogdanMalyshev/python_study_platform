# Ключові питання уроку m7-l08 "Оглядово: Django, Flask, Litestar"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Оглядовий урок: 20–25 абзаців, код мінімальний (hello world на кожному з локальним виводом у scratch venv), без завдань з кодом у браузері, лише quiz і одне проєктне завдання-есе з чеклістом. Останній урок курсу: "Що далі" підсумовує курс і веде до окремого курсу про бази даних.

- [x] Карта екосистеми: Django (batteries included: ORM, admin, auth, міграції), Flask (мікро, розширення), FastAPI (типи, async, OpenAPI), Litestar (як FastAPI, але з іншими рішеннями щодо DI і шарів), Starlette під FastAPI. Аналогії: Django ≈ Rails/NestJS+Prisma+admin, Flask ≈ Express, FastAPI ≈ Fastify+zod+swagger.
- [x] Django за 10 хвилин: проєкт/застосунки, `models.py` з ORM, міграції, admin, views і urls, DRF для API; hello world з реальним виводом. Де він виграє (CRUD-продукти з адмінкою) і де програє (async, гнучкість).
- [x] Flask за 5 хвилин: hello world, `@app.route`, розширення (SQLAlchemy, Marshmallow); чому для нового API у 2026 беруть FastAPI, але Flask треба читати (легасі).
- [x] Litestar: DI через типи, layered architecture, msgspec; hello world; коли дивитись у його бік.
- [x] WSGI проти ASGI: що це, чому Django має обидва, Flask переважно WSGI, FastAPI лише ASGI; сервери gunicorn/uvicorn/hypercorn.
- [x] Критерії вибору для проєкту: команда, адмінка, async, типи, екосистема; таблиця на 5 рядків. Чесно про те, що FastAPI не має ORM і auth з коробки, і що це тема наступного курсу.
- [x] Що з курсу переноситься на будь-який фреймворк: Pydantic/dataclasses, asyncio, тести, типи, пакування; що специфічне для FastAPI.
- [x] Підсумок курсу: список того, що учень тепер уміє (по модулях), капстоун як артефакт для портфоліо і співбесіди, фраза про FormBuilder-бекенд.
- [x] Що далі: окремий курс про бази даних (SQL, SQLAlchemy, Alembic, PostgreSQL), потім auth і інфраструктура; що почитати (Fluent Python, Architecture Patterns with Python, документація FastAPI).
- [x] Які JS-звички тут шкодять: вибір "найпопулярнішого на npm" без критеріїв, очікування, що один фреймворк покриє фронт і бек (Next.js), пошук "Python-версії NestJS".
