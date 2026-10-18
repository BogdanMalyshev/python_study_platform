# Ключові питання уроку m0-l05 "Traceback, breakpoint() і pdb за 15 хвилин"

Урок готовий, коли на кожне питання є відповідь з кодом і реальним виводом.

- [x] Як читати traceback: знизу вгору, останній рядок це тип і повідомлення, вище стек від точки входу до місця помилки, `File "...", line N, in func`. Показати 3-рівневий traceback і розібрати рядок за рядком. Де відрізняється від стеку JS (порядок перевернутий: у JS помилка зверху).
- [x] Покращені повідомлення 3.10+: підказки "Did you mean", стрілки `^^^^` під проблемним виразом (3.11+), `NameError` з пропозицією імпорту. Показати на реальних прикладах.
- [x] Ланцюжки винятків у traceback: "During handling of the above exception, another exception occurred" і "The above exception was the direct cause", як читати (одне речення й посилання на m1-l11).
- [x] `print`-дебаг по-пайтонівськи: `print(f"{x=}")`, `repr` проти `str`, `pprint` для структур, `breakpoint()` як наступний крок.
- [x] `breakpoint()`: що робить (викликає `sys.breakpointhook`, за замовчуванням pdb), як вимкнути через `PYTHONBREAKPOINT=0`, як підмінити на ipdb/pudb. Аналог `debugger;` у JS.
- [x] pdb за 15 хвилин: команди `n`, `s`, `c`, `l`, `ll`, `p expr`, `pp`, `w` (where), `u`/`d`, `b file:line`, `q`, `h`. Сесія з реальним виводом на простому багу.
- [x] Post-mortem: `python -m pdb script.py` і `pdb.pm()` після падіння, `python -i script.py` для огляду стану після винятку.
- [x] Дебагер у VS Code / PyCharm: `launch.json` для Python, `justMyCode`, і коли графічний дебагер зручніший за pdb. Одне речення про debugpy.
- [x] `warnings`: що таке `DeprecationWarning`, `RuntimeWarning: coroutine was never awaited`, чому їх не видно за замовчуванням і як увімкнути (`-W error`, `PYTHONWARNINGS`).
- [x] `traceback` модуль: `traceback.print_exc()`, `format_exc()` для логування винятку без падіння. `logging.exception` як правильний спосіб (детально в m5-l09).
- [x] Які JS-звички тут заважають: читання стеку зверху, `console.log(obj)` з очікуванням розгорнутого об'єкта (у Python `print` дає `repr` або адресу для своїх класів), `debugger` без запуску з DevTools, очікування source maps.
