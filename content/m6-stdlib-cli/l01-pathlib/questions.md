# Ключові питання уроку m6-l01 "pathlib, shutil, tempfile"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом.

- [x] `Path` як об'єкт замість рядків: `Path("a") / "b"`, `.name`, `.stem`, `.suffix`, `.parent`, `.parts`, `.resolve()`, `.exists()`, `.is_file()`, `Path.cwd()`, `Path.home()`, `Path(__file__).parent`. Порівняти з `path.join`, `path.basename`, `__dirname`. Чому `os.path` ще трапляється.
- [x] Читання й запис: `read_text`/`write_text` з `encoding="utf-8"`, `read_bytes`, `open()` на Path з режимами `r`/`w`/`a`/`rb`, `with`; `newline`; чому завжди вказують encoding (Windows). str проти bytes (посилання на m1-l04).
- [x] Обхід: `iterdir`, `glob("*.json")`, `rglob`, `Path.walk()` (3.12+), фільтрація через comprehension, сортування результатів для детермінованості.
- [x] Створення і видалення: `mkdir(parents=True, exist_ok=True)`, `touch`, `unlink(missing_ok=True)`, `rmdir`, `rename`/`replace`, і коли потрібен `shutil`: `copy`, `copy2`, `copytree(dirs_exist_ok=True)`, `rmtree`, `move`, `make_archive`.
- [x] Атомарний запис: записати у тимчасовий файл поруч і `replace`, щоб читач ніколи не бачив половину файлу; чому це важливо для публікації статики.
- [x] `tempfile`: `TemporaryDirectory` і `NamedTemporaryFile` як контекстні менеджери (посилання на m4-l07), `mkdtemp`, де лежить `tempfile.gettempdir()`; використання у тестах через `tmp_path` (посилання на m3-l03).
- [x] Винятки файлової системи: `FileNotFoundError`, `PermissionError`, `FileExistsError`, `IsADirectoryError` і EAFP (посилання на m1-l11); `Path.stat()`, розмір, mtime.
- [x] Шляхи і безпека: `resolve()` проти `..` у шляхах від користувача, `is_relative_to` (3.9+), чому не склеюють шляхи рядками.
- [x] Ресурси пакета: `importlib.resources.files("formbuilder") / "templates"` замість `Path(__file__)` для файлів усередині пакета (посилання на m3-l02).
- [x] Для капстоуну: `Publisher`, що пише згенеровану статику в `out/<form_id>/<version>/index.html` атомарно, прибирає старі версії, копіює assets через `shutil`; тест з `tmp_path`.
- [x] Які JS-звички тут шкодять: `fs.readFileSync` без encoding, `path.join` з рядками, `fs.promises` очікування (у Python синхронний I/O за замовчуванням, async через `to_thread` або aiofiles, одне речення), `fs.existsSync` перед кожною операцією замість try/except.
