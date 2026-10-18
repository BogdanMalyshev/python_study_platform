# Ключові питання уроку m3-l06 "pre-commit з ruff і mypy"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Команди у ```bash з реальним виводом. Короткий урок: 20–30 абзаців. git не вчимо, лише хуки.

- [x] Що таке pre-commit framework (не плутати з git-хуком як таким): конфіг `.pre-commit-config.yaml`, встановлення хука `pre-commit install`, ізольовані оточення для кожного хука, кеш. Аналог husky + lint-staged.
- [x] Хуки для цього курсу: `ruff` (check з `--fix`) і `ruff-format` з офіційного репозиторію `astral-sh/ruff-pre-commit`, `mypy` з `pre-commit/mirrors-mypy` і його `additional_dependencies`, базові `pre-commit-hooks` (trailing-whitespace, end-of-file-fixer, check-yaml, check-toml, check-added-large-files). Показати конфіг і перший прогін `pre-commit run --all-files`.
- [x] Чому mypy у pre-commit складний (потрібні залежності проєкту в ізольованому оточенні) і альтернатива: локальний хук `language: system` з `uv run mypy src`. Показати обидва варіанти і сказати, який обрано для капстоуну.
- [x] Поведінка: хук, що змінив файли, провалює коміт, і треба додати зміни й закомітити знову; `--no-verify` як аварійний обхід; `pre-commit autoupdate` для версій хуків; `SKIP=mypy git commit`.
- [x] Той самий набір перевірок у CI: GitHub Actions job з `uv sync --locked`, `uv run ruff check`, `uv run ruff format --check`, `uv run mypy src`, `uv run pytest`; або `pre-commit run --all-files` у CI. Показати мінімальний workflow-файл без запуску (CI тут не запускається, сказати це).
- [x] Порядок хуків і швидкість: форматер перед лінтером, mypy і pytest не в pre-commit, а в pre-push або CI, бо повільні.
- [x] Для капстоуну: додати `.pre-commit-config.yaml` у `capstone/`, встановити хук, зробити тестовий прогін на всіх файлах; `verify` через `cd capstone && uv run pre-commit run --all-files` (pre-commit у dev-групі).
- [x] Які JS-звички тут шкодять: lint-staged конфіг у package.json, husky-скрипти в `.husky/`, `npm run lint` як єдина точка, очікування, що хук запускає лінтер проєкту з node_modules (pre-commit тримає власні оточення).
