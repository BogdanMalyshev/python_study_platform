# Ключові питання уроку m0-l01 "Установка Python і кілька версій поруч"

Урок готовий, коли на кожне питання є відповідь з командами і реальним виводом (macOS, zsh).

- [x] Який Python уже є на macOS (`/usr/bin/python3`, версія з Xcode Command Line Tools, зараз 3.9) і чому його не використовують для розробки: стара версія, системна залежність, без права ставити пакети глобально (PEP 668, "externally-managed-environment").
- [x] Чим `uv python install 3.12` відрізняється від `pyenv install 3.12` і від `brew install python`: де лежать інтерпретатори, хто керує, що радять у 2026. Аналогія з nvm і чому uv ближчий до "nvm + npm + npx в одному".
- [x] Як подивитись, які версії встановлені (`uv python list`), яка активна (`python --version`, `which python`, `uv run python --version`), і як закріпити версію для проєкту (`.python-version`, `requires-python` у pyproject). Аналог `.nvmrc`, `engines`.
- [x] Чому `python` і `python3` це різні команди, що таке shebang `#!/usr/bin/env python3`, і як не зламати систему, замінивши `python`.
- [x] Що таке CPython, і чим він відрізняється від PyPy, і чому "Python" у розмові майже завжди означає CPython. Одне речення про версії 3.11/3.12/3.13 і темп релізів (щороку в жовтні), і яку версію ставити для курсу (3.12) і чому не найновішу (підтримка бібліотек).
- [x] Як виглядає REPL при запуску `python` і як з нього вийти (`exit()`, Ctrl-D). Лише дотик, детально в m0-l03.
- [x] Як перевірити, що все працює: `uv run python -c "import sys; print(sys.version)"`, `python -c "import this"`.
- [x] Які JS-звички тут заважають: очікування, що `npm i -g` аналог існує (`pip install` глобально це помилка), очікування одного `node` на систему, пошук `package.json` замість `pyproject.toml`.
