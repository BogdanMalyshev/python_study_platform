# Ключові питання уроку m6-l06 "CLI: argparse або Typer, змінні оточення, pydantic-settings"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. CLI-команди це non-live блоки з реальним виводом; у браузері лише чисті функції (парсер через `parse_args(list)` працює в Pyodide і детермінований) і quiz; проєктні завдання в капстоуні.

- [x] `argparse`: `ArgumentParser`, позиційні й опціональні аргументи, `type=`, `default`, `choices`, `action="store_true"`, `nargs`, `required`, підкоманди через `add_subparsers`, автоматичний `--help`, `parse_args(argv)` для тестів. Порівняти з commander/yargs.
- [x] Typer як сучасна альтернатива (анотації типів стають аргументами, `typer.Option`, `typer.Argument`, підкоманди через `app.command()`), click під капотом; коли argparse (без залежностей), коли Typer (зручність). Показати ту саму CLI обома способами.
- [x] Структура CLI-модуля: `main(argv: list[str] | None = None) -> int`, `sys.exit(main())`, `[project.scripts]` (посилання на m0-l06), вивід помилок у stderr, коди завершення 0/1/2.
- [x] Змінні оточення: `os.environ`, `os.getenv(name, default)`, типи завжди рядки, `.env` через `python-dotenv` лише локально, чому секрети не в коді. Порівняти з `process.env` і dotenv.
- [x] `pydantic-settings`: `BaseSettings` з типізованими полями, пріоритет джерел (аргументи → env → .env → defaults), `env_prefix`, вкладені налаштування, валідація на старті з чітким повідомленням. Чому це краще за розкидані `getenv`.
- [x] Логування у CLI (`-v`/`-q` перемикають рівень, посилання на m5-l09), прогрес для довгих операцій (`rich` одним реченням), кольори лише в TTY (`sys.stdout.isatty()`).
- [x] Тестування CLI: `main([...])` напряму з `capsys`, `typer.testing.CliRunner`, fixture з `monkeypatch.setenv` (посилання на m3-l03).
- [x] Для капстоуну: `formbuilder build config.json --out dist/ --renderer html`, `formbuilder validate`, `formbuilder serve` як заглушка для m7; `Settings` з `FORMBUILDER_OUT_DIR`, `FORMBUILDER_LOG_LEVEL`; замінити заглушку `cli.py` з m0-l06 на справжню.
- [x] Які JS-звички тут шкодять: `process.argv.slice(2)` вручну, `process.env.X` без валідації, `process.exit()` посеред коду, `yargs` ланцюжки, очікування, що `.env` читається автоматично.
