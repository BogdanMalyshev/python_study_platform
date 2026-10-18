# Ключові питання уроку m6-l05 "subprocess: виклик зовнішнього процесу"

Урок готовий, коли на кожне питання є відповідь з кодом і виводом. Pyodide не має процесів: усі реальні приклади це non-live блоки з виводом, захопленим локально; завдання `runtime: local` у `practice/m6-l05/` плюс quiz і чисті функції (побудова argv, парсинг виводу) у браузері.

- [x] `subprocess.run([...])`: список аргументів замість рядка (чому), `capture_output=True`, `text=True`, `check=True` і `CalledProcessError`, `CompletedProcess` з `returncode`/`stdout`/`stderr`, `timeout` і `TimeoutExpired`, `cwd`, `env`. Порівняти з `child_process.execFile`/`spawn`/`exec`.
- [x] `shell=True`: коли потрібен (пайпи, glob) і чому небезпечний з даними користувача (інʼєкція), `shlex.split`/`shlex.quote`; пайп між процесами без shell через `Popen` і `stdin=`.
- [x] `Popen` для стрімінгу: читання stdout по рядках у реальному часі, `communicate`, deadlock при повних буферах без `communicate`, `stderr=subprocess.STDOUT`.
- [x] Коди завершення й сигнали: `returncode` від'ємний при сигналі, `terminate`/`kill`, `wait`, graceful stop з таймаутом.
- [x] Асинхронно: `asyncio.create_subprocess_exec`, `await proc.communicate()`, кілька процесів паралельно з Semaphore (посилання на m5-l05), і чому для воркера генерації саме це.
- [x] Кодування виводу: `text=True` з `encoding="utf-8"`, `errors="replace"`, бінарний вивід; `PATH` і пошук виконуваного файлу (`shutil.which`).
- [x] Виклик Node з Python: `node render.js config.json`, передача JSON через stdin і читання через stdout, обробка помилок рендерера. Виклик Python з Python (`sys.executable`, `-m`).
- [x] Тестування коду з subprocess: мок `subprocess.run` через `mocker.patch` з `CompletedProcess` (посилання на m3-l04), fake-скрипт у `tmp_path`.
- [x] Для капстоуну: `NodeRenderer`, що викликає зовнішній рендерер через `create_subprocess_exec`, передає конфіг через stdin, читає HTML зі stdout, таймаут і повідомлення про помилку з stderr; fallback на Jinja2-рендерер (посилання на m7-l06).
- [x] Які JS-звички тут шкодять: `exec("cmd " + arg)` з рядком, очікування подій `on("data")` (тут читання по рядках або `communicate`), `spawn` без `await` завершення, `execSync` з shell за замовчуванням.
