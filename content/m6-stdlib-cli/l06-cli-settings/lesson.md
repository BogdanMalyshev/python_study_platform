---
id: m6-l06
module: m6-stdlib-cli
title: "CLI: argparse або Typer, змінні оточення, pydantic-settings"
summary: "Учень будує CLI з підкомандами на argparse і на Typer за контрактом main(argv) -> int з кодами 0/1/2 і stderr для діагностики, читає змінні оточення без пасток з типами, збирає налаштування в одну модель pydantic-settings з пріоритетом CLI → env → .env → defaults і тестує все це через capsys, monkeypatch і CliRunner."
duration_min: 90
prerequisites: [m6-l05]
---

## `argparse`: парсер як декларація, а не розбір `argv` руками

У m0-l03 аргументи командного рядка були зрізом `sys.argv[1:]`, і розбір `--out dist` лягав на вас. `argparse` зі стандартної бібліотеки робить це декларативно: ви описуєте, які аргументи існують, а парсер сам розкладає список рядків, перетворює типи, перевіряє значення, генерує `--help` і повідомлення про помилки. Найближчий аналог з JS це commander або yargs, з тією різницею, що `argparse` вже є в будь-якому Python і не потребує жодної залежності.

```ts
import { Command, Option } from "commander";

const program = new Command("formbuilder")
  .argument("<config>", "path to form config JSON")
  .option("--out <dir>", "output directory", "dist")
  .addOption(new Option("--renderer <name>").choices(["html", "text"]).default("html"))
  .option("--workers <n>", "parallel renders", (v) => parseInt(v, 10), 4)
  .option("--dry-run", "validate and render without writing");

program.parse(["signup.json", "--workers", "8", "--dry-run"], { from: "user" });
console.log(program.args[0], program.opts());
```

```python live
import argparse

parser = argparse.ArgumentParser(prog="formbuilder", description="Build static pages from form configs.")
parser.add_argument("config", help="path to form config JSON")
parser.add_argument("--out", default="dist", help="output directory")
parser.add_argument("--renderer", choices=["html", "text"], default="html")
parser.add_argument("--workers", type=int, default=4, help="parallel renders")
parser.add_argument("--dry-run", action="store_true", help="validate and render without writing")

args = parser.parse_args(["signup.json", "--workers", "8", "--dry-run"])
print(args)
print(args.config, args.workers + 1, args.dry_run)
print(vars(parser.parse_args(["signup.json"])))
```

```text
Namespace(config='signup.json', out='dist', renderer='html', workers=8, dry_run=True)
signup.json 9 True
{'config': 'signup.json', 'out': 'dist', 'renderer': 'html', 'workers': 4, 'dry_run': False}
```

Різниця з commander у трьох місцях. Ім'я без дефісів (`config`) документація argparse називає positional argument, ім'я з дефісами (`--out`) це optional argument, хоча його можна зробити обов'язковим; на співбесіді кажуть "позиційний аргумент" і "опція" або "прапорець". Результат це один об'єкт `argparse.Namespace` (офіційна назва класу) з атрибутами, де `--dry-run` стає `dry_run`, бо дефіс в ідентифікаторі неможливий. І `parse_args` приймає список явно: без аргументу він бере `sys.argv[1:]`, а зі списком стає чистою функцією, яку можна викликати в тесті чи прямо в цьому уроці.

`type=` це не назва типу, а будь-який callable, що отримує рядок і повертає значення. `int`, `float`, `Path` працюють, бо їх можна викликати з рядком. Власна функція-перетворювач кидає `ValueError` або `argparse.ArgumentTypeError`, і парсер перетворює це на повідомлення про помилку. `nargs` задає кількість значень: `"+"` один або більше, `"*"` нуль або більше, `"?"` нуль або одне з `const` для випадку "прапорець без значення". `action="append"` збирає повторені опції в список, `required=True` робить опцію обов'язковою.

```python live
import argparse
from pathlib import Path


def positive_int(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError(f"must be >= 1, got {value}")
    return value


parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("configs", nargs="+", type=Path)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--workers", type=positive_int, default=4)
parser.add_argument("--tag", action="append", default=[])
parser.add_argument("--theme", nargs="?", const="light", default=None)

ns = parser.parse_args(["a.json", "b.json", "--out", "dist", "--tag", "promo", "--tag", "q4", "--theme"])
print(ns)
print(ns.configs[0].suffix, ns.out / "a")
print(parser.parse_args(["a.json", "--out", "dist", "--theme", "dark"]).theme)
```

```text
Namespace(configs=[PosixPath('a.json'), PosixPath('b.json')], out=PosixPath('dist'), workers=4, tag=['promo', 'q4'], theme='light')
.json dist/a
dark
```

> **Пастка.** `type=bool` не робить прапорець. `bool` викликається з рядком, а будь-який непорожній рядок truthy, тож `--strict false` дає `True`. Для прапорців є `action="store_true"` або `action=argparse.BooleanOptionalAction`, яка генерує пару `--strict/--no-strict`.

```python
import argparse

parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("--strict", type=bool, default=False)
print(parser.parse_args(["--strict", "false"]).strict)
print(parser.parse_args(["--strict", ""]).strict)
```

```text
True
False
```

> **Пастка.** argparse за замовчуванням приймає скорочення довгих опцій: `--ren` розпізнається як `--renderer`, якщо скорочення однозначне. Сьогодні це зручно, а завтра ви додаєте `--render-timeout`, і чийсь CI-скрипт з `--ren` падає з помилкою неоднозначності. Для публічної CLI вимикайте це через `allow_abbrev=False`.

```python
import argparse

parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("--renderer", default="html")
parser.add_argument("--out-dir", default="dist")
print(parser.parse_args(["--ren", "text", "--out", "public"]))

strict = argparse.ArgumentParser(prog="formbuilder", allow_abbrev=False)
strict.add_argument("--renderer", default="html")
try:
    strict.parse_args(["--ren", "text"])
except SystemExit as exc:
    print("SystemExit", exc.code)
```

```text
Namespace(renderer='text', out_dir='public')
usage: formbuilder [-h] [--renderer RENDERER]
formbuilder: error: unrecognized arguments: --ren text
SystemExit 2
```

<!-- task: t1 -->

## Помилки, `--help` і підкоманди

Помилку розбору argparse не повертає і не кидає як звичайний виняток. Він друкує usage і повідомлення в stderr і викликає `sys.exit(2)`; `--help` друкує довідку в stdout і викликає `sys.exit(0)`. Оскільки `sys.exit` лише кидає `SystemExit`, це можна перехопити, і саме так тести та браузерні завдання цього уроку перевіряють помилкові випадки.

```python
import argparse
import sys

parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("config")
parser.add_argument("--renderer", choices=["html", "text"], default="html")
parser.add_argument("--workers", type=int, default=4)

for argv in [[], ["a.json", "--renderer", "pdf"], ["a.json", "--workers", "many"], ["a.json", "--color"]]:
    try:
        parser.parse_args(argv)
    except SystemExit as e:
        print("SystemExit", e.code, file=sys.stderr)
```

```text
usage: formbuilder [-h] [--renderer {html,text}] [--workers WORKERS] config
formbuilder: error: the following arguments are required: config
SystemExit 2
usage: formbuilder [-h] [--renderer {html,text}] [--workers WORKERS] config
formbuilder: error: argument --renderer: invalid choice: 'pdf' (choose from html, text)
SystemExit 2
usage: formbuilder [-h] [--renderer {html,text}] [--workers WORKERS] config
formbuilder: error: argument --workers: invalid int value: 'many'
SystemExit 2
usage: formbuilder [-h] [--renderer {html,text}] [--workers WORKERS] config
formbuilder: error: unrecognized arguments: --color
SystemExit 2
```

Stdout цього запуску порожній: усе вище прийшло в stderr. Commander поводиться схоже, він теж викликає `process.exit` усередині бібліотеки, а `exitOverride()` перетворює це на виняток. В argparse аналогом є `ArgumentParser(exit_on_error=False)`, тоді помилки розбору приходять як `argparse.ArgumentError`. Але `--help` усе одно завершується через `SystemExit(0)`, тож універсальний спосіб для тестів і для `main` один: перехоплювати `SystemExit` на межі.

> **Пастка.** Без `prog=` ім'я програми береться з `sys.argv[0]`. З терміналу це ім'я скрипта, але в тесті під pytest, у `python -c` чи в браузері воно інше, і usage раптом починається з `usage: pytest` або `usage: -c`. Для console script з `[project.scripts]` ім'я збігається, проте явний `prog="formbuilder"` робить вивід однаковим скрізь.

```bash
python -c "import argparse; print(argparse.ArgumentParser().prog)"
pytest -q -s test_prog.py   # тест друкує argparse.ArgumentParser().prog
```

```text
-c
pytest
```

Підкоманди (subcommands, в документації argparse "sub-commands") це `git commit` і `git push`: перше слово обирає окремий парсер зі своїми аргументами. `add_subparsers` повертає об'єкт, у якого `add_parser` створює парсер підкоманди. `dest="command"` кладе ім'я обраної підкоманди в `Namespace`, `required=True` робить підкоманду обов'язковою. Щоб не писати `if args.command == "build"`, кожен підпарсер через `set_defaults` прикріплює до `Namespace` свою функцію-обробник, і диспетчеризація стає одним викликом. Це `program.command("build").action(fn)` з commander.

```python live
import argparse


def run_build(args: argparse.Namespace) -> int:
    print(f"build {args.config} -> {args.out} ({args.renderer})")
    return 0


def run_validate(args: argparse.Namespace) -> int:
    print(f"validate {args.configs} strict={args.strict}")
    return 0


parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("-v", "--verbose", action="count", default=0)
sub = parser.add_subparsers(dest="command", required=True)

build = sub.add_parser("build", help="render a config to static files")
build.add_argument("config")
build.add_argument("--out", default="dist")
build.add_argument("--renderer", choices=["html", "text"], default="html")
build.set_defaults(handler=run_build)

validate = sub.add_parser("validate", help="check configs without rendering")
validate.add_argument("configs", nargs="+")
validate.add_argument("--strict", action=argparse.BooleanOptionalAction, default=True)
validate.set_defaults(handler=run_validate)

for argv in (["build", "signup.json", "--out", "public"], ["-vv", "validate", "a.json", "b.json", "--no-strict"]):
    args = parser.parse_args(argv)
    print({k: v for k, v in vars(args).items() if k != "handler"})
    args.handler(args)
```

```text
{'verbose': 0, 'command': 'build', 'config': 'signup.json', 'out': 'public', 'renderer': 'html'}
build signup.json -> public (html)
{'verbose': 2, 'command': 'validate', 'configs': ['a.json', 'b.json'], 'strict': False}
validate ['a.json', 'b.json'] strict=False
```

`--help` генерується для кожного рівня окремо з тих самих оголошень: `help=` у `add_parser` потрапляє в список команд, а `formbuilder build --help` показує аргументи підкоманди. Ширина довідки береться з терміналу, тому вивід нижче знято з `COLUMNS=80`.

```bash
python fb_argparse.py --help
```

```text
usage: formbuilder [-h] [-v] {build,validate} ...

positional arguments:
  {build,validate}
    build           render a config to static files
    validate        check configs without rendering

options:
  -h, --help        show this help message and exit
  -v, --verbose
```

> **Пастка.** Опції головного парсера пишуться до імені підкоманди. Після `build` розбором займається підпарсер, і він про `-v` нічого не знає. У commander і yargs глобальні опції зазвичай працюють у будь-якій позиції, тож звичка `formbuilder build a.json -v` тут дає помилку.

```python
import argparse

parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("-v", "--verbose", action="count", default=0)
sub = parser.add_subparsers(dest="command", required=True)
sub.add_parser("build").add_argument("config")

for argv in (["-v", "build", "a.json"], ["build", "a.json", "-v"]):
    try:
        print(parser.parse_args(argv))
    except SystemExit as e:
        print("exit", e.code)
```

```text
Namespace(verbose=1, command='build', config='a.json')
usage: formbuilder [-h] [-v] {build} ...
formbuilder: error: unrecognized arguments: -v
exit 2
```

<!-- task: q2 -->

<!-- task: t2 -->

## Структура CLI-модуля: `main(argv) -> int`, stderr і коди виходу

Каркас з m0-l06 лишається: `[project.scripts] formbuilder = "formbuilder.cli:main"`, згенерований скрипт робить `sys.exit(main())`, а `main(argv: list[str] | None = None) -> int` приймає список у тестах і `None` у бойовому запуску. Тепер ця функція отримує зміст, і він завжди однаковий: розібрати аргументи, викликати обробник, перекласти результат або виняток у код виходу (exit code). Конвенція, якої тримаються argparse, Click і більшість Unix-утиліт: `0` успіх, `1` очікувана помилка роботи (невалідний конфіг, рендерер упав), `2` неправильний виклик (невідома опція, відсутній аргумент).

```python live
import argparse
import sys


class CliError(Exception):
    """Expected failure: a message for the user, exit code 1."""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="formbuilder")
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("config")
    build.add_argument("--out", default="dist")
    return parser


def cmd_build(config: str, out: str) -> None:
    if not config.endswith(".json"):
        raise CliError(f"{config}: expected a .json config")
    print(f"{out}/index.html")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # --help -> 0, usage error -> 2
        return exc.code if isinstance(exc.code, int) else 2
    try:
        cmd_build(args.config, args.out)
    except CliError as exc:
        print(f"formbuilder: {exc}", file=sys.stderr)
        return 1
    return 0


print("exit", main(["build", "signup.json"]))
print("exit", main(["build", "signup.yaml"]))
print("exit", main([]))
```

```text
dist/index.html
exit 0
formbuilder: signup.yaml: expected a .json config
exit 1
usage: formbuilder [-h] {build} ...
formbuilder: error: the following arguments are required: command
exit 2
```

Розподіл потоків тут принциповий. У stdout іде лише результат команди, тут шлях до згенерованої сторінки, у stderr усе для людини: помилки, попередження, логи, прогрес. Тоді `formbuilder build signup.json | xargs open` або `$(formbuilder build ...)` у shell отримують чистий шлях, а діагностика все одно видна в терміналі. Це та сама різниця між `console.log` і `console.error`, тільки в CLI вона стає частиною контракту. Повідомлення починається з імені програми, `formbuilder: ...`, як у `ls: foo: No such file or directory`, щоб у довгому пайплайні було видно, хто скаржиться.

> **Пастка.** `sys.exit` посеред коду це не "зупинити програму", а `raise SystemExit`. `SystemExit` успадковує `BaseException`, а не `Exception`, тому `except Exception` у воркері чи в тестовому хелпері його не ловить, і процес завершується з будь-якого рівня вкладеності. Це та сама проблема, що й `process.exit()` у глибині Node-модуля, тільки замаскована під виняток. Глибокий код кидає власний виняток, а в код виходу його перетворює лише `main`.

```python
import sys


def load_config(path: str) -> dict:
    if not path.endswith(".json"):
        print(f"formbuilder: {path}: not a JSON file", file=sys.stderr)
        sys.exit(1)
    return {}


try:
    load_config("form.yaml")
except Exception as exc:
    print("caught:", exc)
finally:
    print("finally runs")
print("unreachable")
```

```text
formbuilder: form.yaml: not a JSON file
finally runs
```

```bash
echo "exit $?"
```

```text
exit 1
```

`Namespace` має один системний недолік: mypy бачить усі його атрибути як `Any` (про це вже йшлося в m2-l08), тож одруківка `args.ouput` проходить статичну перевірку й падає лише під час виконання. Коли обробник більший за кілька рядків, `Namespace` перекладають у типізований об'єкт одразу після розбору, і далі код працює з ним. Typer у наступному розділі закриває цю дірку інакше: аргументи там і є параметрами функції з анотаціями.

```python live
import argparse
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BuildArgs:
    config: Path
    out: Path
    dry_run: bool


parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("config", type=Path)
parser.add_argument("--out", type=Path, default=Path("dist"))
parser.add_argument("--dry-run", action="store_true")

ns = parser.parse_args(["signup.json", "--dry-run"])
args = BuildArgs(config=ns.config, out=ns.out, dry_run=ns.dry_run)
print(args)
```

```text
BuildArgs(config=PosixPath('signup.json'), out=PosixPath('dist'), dry_run=True)
```

<!-- task: t3 -->

## Typer: та сама CLI з анотацій типів

Typer (бібліотека від автора FastAPI) будує CLI з сигнатури функції: параметр без значення за замовчуванням стає позиційним аргументом, параметр зі значенням стає опцією, анотація задає тип і перевірку. Під капотом Typer побудований на Click, найпопулярнішій сторонній CLI-бібліотеці Python. У версії 0.27, на якій перевірено урок, код Click вендорено всередину пакета як `typer._click`, тож окремої залежності `click` у списку немає. Нижче та сама CLI, що в argparse-розділі. Typer не входить у стандартну бібліотеку і не працює в браузерному рантаймі уроку, тому приклади не live, вивід знято локально з `COLUMNS=80`.

```python
# fbt.py
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import typer

app = typer.Typer(help="Build static pages from form configs.", add_completion=False)


class RendererName(StrEnum):
    html = "html"
    text = "text"


@app.command()
def build(
    config: Annotated[Path, typer.Argument(help="path to form config JSON")],
    out: Annotated[Path, typer.Option(help="output directory")] = Path("dist"),
    renderer: RendererName = RendererName.html,
    workers: int = 4,
    dry_run: bool = False,
) -> None:
    """Render a config to static files."""
    print(f"build {config} -> {out} renderer={renderer.value} workers={workers} dry_run={dry_run}")


@app.command()
def validate(
    configs: list[Path],
    strict: Annotated[bool, typer.Option("--strict/--no-strict")] = True,
) -> None:
    """Check configs without rendering."""
    print(f"validate {[str(c) for c in configs]} strict={strict}")


if __name__ == "__main__":
    app()
```

```bash
python fbt.py build signup.json --dry-run --workers 8
python fbt.py validate a.json b.json --no-strict
python fbt.py build --help
```

```text
build signup.json -> dist renderer=html workers=8 dry_run=True
validate ['a.json', 'b.json'] strict=False
                                                                                
 Usage: fbt.py build [OPTIONS] {config}                                         
                                                                                
 Render a config to static files.                                               
                                                                                
╭─ Arguments ──────────────────────────────────────────────────────────────────╮
│ *    config      <path>  path to form config JSON [required]                 │
╰──────────────────────────────────────────────────────────────────────────────╯
╭─ Options ────────────────────────────────────────────────────────────────────╮
│ --out                         <path>       output directory [default: dist]  │
│ --renderer                    <html|text>  [default: html]                   │
│ --workers                     <int>        [default: 4]                      │
│ --dry-run     --no-dry-run                 [default: no-dry-run]             │
│ --help                                     Show this message and exit.       │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Правила перекладу з сигнатури варто знати напам'ять, бо з них виростає вся поведінка. `dry_run: bool = False` стає парою `--dry-run/--no-dry-run`, підкреслення в імені стають дефісами. `StrEnum` або `Literal["html", "text"]` дають `choices`. `list[Path]` без значення за замовчуванням це `nargs="+"`. Docstring функції стає описом команди, а `typer.Argument` і `typer.Option` всередині `Annotated` додають довідку, власні імена (`"--verbose", "-v"`), `count=True` для `-vvv`, `exists=True` для перевірки, що файл існує. Кожна функція з `@app.command()` стає підкомандою з іменем функції; якщо команда одна, Typer робить застосунок без підкоманд. Значення в тілі вже мають правильний тип, і mypy це бачить, бо це звичайні параметри.

```bash
python fbt.py build signup.json --renderer pdf; echo "exit $?"
```

```text
Usage: fbt.py build [OPTIONS] {config}
Try 'fbt.py build --help' for help.
╭─ Error ──────────────────────────────────────────────────────────────────────╮
│ Invalid value for '--renderer': 'pdf' is not one of 'html', 'text'.          │
╰──────────────────────────────────────────────────────────────────────────────╯
exit 2
```

Коди виходу ті самі, що в argparse: помилка використання дає 2. Свій код з команди повертають через `raise typer.Exit(code=1)`, а `typer.BadParameter("...")` дає помилку використання з кодом 2 для перевірок, які анотацією не виразити. Сам `app()` поводиться як argparse: завжди закінчується `SystemExit`, навіть при успіху. Тому контракт `main(argv) -> int` з Typer це тонкий адаптер, що перехоплює `SystemExit` і повертає його код.

```python
import sys
from typing import Literal

import typer

app = typer.Typer(add_completion=False)


@app.command()
def build(config: str, renderer: Literal["html", "text"] = "html") -> None:
    if config == "bad.json":
        print("formbuilder: bad.json: invalid config", file=sys.stderr)
        raise typer.Exit(code=1)
    print(config, renderer)


@app.command()
def other() -> None:
    pass


def main(argv: list[str] | None = None) -> int:
    try:
        app(args=argv, prog_name="formbuilder")
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 1
    return 0


for argv in (["build", "a.json"], ["build", "bad.json"], ["build"]):
    print("main ->", main(argv))
```

```text
a.json html
main -> 0
formbuilder: bad.json: invalid config
main -> 1
Usage: formbuilder build [OPTIONS] {config}
Try 'formbuilder build --help' for help.
╭─ Error ──────────────────────────────────────────────────────────────────────╮
│ Missing argument 'config'.                                                   │
╰──────────────────────────────────────────────────────────────────────────────╯
main -> 2
```

> **Під капотом.** Typer на старті читає сигнатуру через `inspect.signature` і `typing.get_type_hints`, з кожного параметра будує об'єкт `Parameter` для Click, а Click уже розбирає `argv`. Тому анотації тут не підказка для mypy, а дані, які бібліотека читає під час виконання. Це той самий підхід, що в Pydantic і FastAPI. Звідси й пастка: без анотації Typer не виводить тип зі значення за замовчуванням, параметр просто стає рядком.

```python
import typer

app = typer.Typer(add_completion=False)


@app.command()
def build(config, workers=4):
    print(repr(config), repr(workers))


app()
```

```bash
python one.py a.json --workers 8
```

```text
'a.json' '8'
```

Заодно видно ще одне правило: застосунок з однією командою Typer запускає без імені підкоманди.

Вибір між ними прагматичний. argparse, коли залежностей бути не може: скрипт у CI, утиліта в Docker-образі без venv, бібліотека, яка не хоче тягнути Click і rich своїм користувачам, код, що має працювати в будь-якому Python, включно з Pyodide. Typer, коли CLI це частина застосунку з уже наявними залежностями, команд кілька, а типи аргументів хочеться описати один раз і отримати і перевірку, і довідку, і автодоповнення. Click напряму обирають, коли потрібен його повний API груп, контексту й плагінів без шару анотацій. Для капстоуну це Typer: FastAPI в m7 однаково принесе ту саму філософію "анотація як схема".

<!-- task: q4 -->

## Змінні оточення: `os.environ`, `getenv` і `.env`

Змінні оточення (environment variables) це другий канал конфігурації після аргументів: їх задає оболонка, CI, Docker чи systemd, і процес успадковує їх від батька. У Python вони живуть у `os.environ`, це mapping, схожий на `dict`, а `os.getenv(name, default)` це скорочення для `os.environ.get`. Аналог `process.env`, але з іншою реакцією на помилки.

```ts
const workers = Number(process.env.FORMBUILDER_WORKERS ?? "4");
const debug = process.env.FORMBUILDER_DEBUG === "true";
const outDir = process.env.FORMBUILDER_OUT_DIR || "dist";
process.env.FORMBUILDER_PORT = 8000 as any; // мовчки стає "8000"
```

```python
import os

workers = int(os.environ.get("FORMBUILDER_WORKERS", "4"))
debug = os.environ.get("FORMBUILDER_DEBUG", "").lower() in {"1", "true", "yes", "on"}
out_dir = os.environ.get("FORMBUILDER_OUT_DIR") or "dist"
os.environ["FORMBUILDER_PORT"] = "8000"  # лише str, інакше TypeError
```

Розходження в трьох місцях. Відсутня змінна через `os.environ["X"]` дає `KeyError`, а не `undefined`, і це корисно для обов'язкових значень: процес падає на старті з іменем змінної, а не далі з `None` у дивному місці. Значення завжди `str`: і читання, і запис; спроба записати число дає `TypeError`, тоді як Node мовчки перетворює його на рядок. І зміна `os.environ` всередині процесу видна дочірнім процесам (`subprocess` з m6-l05 успадковує поточне оточення), але не батьківській оболонці.

```python live
import os

os.environ["FORMBUILDER_WORKERS"] = "8"
os.environ["FORMBUILDER_DEBUG"] = "false"

print(os.environ["FORMBUILDER_WORKERS"] * 2)
print(os.getenv("FORMBUILDER_OUT_DIR"))
print(os.getenv("FORMBUILDER_OUT_DIR", "dist"))
print(bool(os.getenv("FORMBUILDER_DEBUG")))
try:
    os.environ["FORMBUILDER_PORT"] = 8000
except TypeError as exc:
    print("TypeError:", exc)
try:
    os.environ["FORMBUILDER_SECRET"]
except KeyError as exc:
    print("KeyError:", exc)
```

```text
88
None
dist
True
TypeError: str expected, not int
KeyError: 'FORMBUILDER_SECRET'
```

> **Пастка.** `"8" * 2` це `"88"`, а `bool("false")` це `True`. Обидва рядки виглядають як робочий код і обидва помиляються мовчки, бо з оточення приходить рядок, а не число чи bool. Кожна змінна потребує явного перетворення й перевірки, і якщо таких змінних більше двох, ручне перетворення розповзається по кодбазі. Саме це закриває pydantic-settings у наступному розділі.

Код, що читає оточення, тестується так само, як `main(argv)`: оточення передається параметром `env: Mapping[str, str]`, а `os.environ` підставляється лише на вході. Тоді тест дає звичайний словник і не чіпає глобальний стан процесу. Значення за замовчуванням `env=os.environ` тут безпечне, попри правило про mutable default з m1-l07: `os.environ` це один живий об'єкт процесу, і функція лише читає з нього.

`.env` файл Python сам не читає. Next.js, Vite і `node --env-file` (з Node 20.6) привчили, що `.env` підхоплюється автоматично; тут без явного кроку змінних з файлу немає. Варіантів три: `python-dotenv` з `load_dotenv()` на старті, `uv run --env-file .env ...` на рівні запуску, або pydantic-settings, який читає `.env` сам. `load_dotenv` за замовчуванням не перезаписує змінні, які вже є в оточенні, тож реальне оточення завжди сильніше за файл.

```bash
printf 'FORMBUILDER_OUT_DIR=from-dotenv\nDATABASE_URL=sqlite:///x.db\n' > .env
FORMBUILDER_OUT_DIR=from-env python d1.py
```

```python
# d1.py
import os

from dotenv import load_dotenv

print(os.environ.get("FORMBUILDER_OUT_DIR"), os.environ.get("DATABASE_URL"))
print(load_dotenv())
print(os.environ.get("FORMBUILDER_OUT_DIR"), os.environ.get("DATABASE_URL"))
load_dotenv(override=True)
print(os.environ.get("FORMBUILDER_OUT_DIR"))
```

```text
from-env None
True
from-env sqlite:///x.db
from-dotenv
```

```bash
uv run --env-file .env python -c "import os; print(os.environ['FORMBUILDER_OUT_DIR'])"
```

```text
from-dotenv
```

`.env` це зручність локальної розробки, а не механізм доставки конфігурації. Він лежить у `.gitignore`, поруч комітиться `.env.example` з іменами змінних без значень, а на сервері й у контейнері змінні задає оркестратор (детально в m7-l07). Секрети (токени вебхуків, ключі API) не пишуться в код і не мають значень за замовчуванням: git пам'ятає їх назавжди в історії, вони потрапляють у логи, трейсбеки й образи, а ротація секрету перетворюється на реліз.

<!-- task: q1 -->

<!-- task: t4 -->

## pydantic-settings: типізовані налаштування в одному місці

`pydantic-settings` (окремий пакет, з Pydantic v2 він винесений з ядра) дає клас `BaseSettings`: це `BaseModel` з m2-l09, який при створенні сам збирає значення полів з оточення, `.env` і значень за замовчуванням, а потім валідує їх звичайною валідацією Pydantic. Найближчий JS-аналог це схема Zod поверх `process.env` (`z.object({...}).parse(process.env)`) або `@t3-oss/env`, тільки тут читання джерел вбудоване. Пакет не входить у браузерний рантайм уроку, тому приклади не live.

```python
# settings.py
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class RendererSettings(BaseModel):
    timeout_s: float = 30.0
    node_bin: str = "node"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FORMBUILDER_",
        env_file=".env",
        env_nested_delimiter="__",
    )

    out_dir: Path = Path("dist")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    workers: int = 4
    debug: bool = False
    webhook_token: SecretStr | None = None
    renderer: RendererSettings = RendererSettings()
```

```bash
python -c "from settings import Settings; print(Settings())"
FORMBUILDER_WORKERS=8 FORMBUILDER_DEBUG=false FORMBUILDER_OUT_DIR=/srv/out \
  FORMBUILDER_RENDERER__TIMEOUT_S=5 FORMBUILDER_WEBHOOK_TOKEN=s3cr3t \
  python -c "from settings import Settings; print(Settings())"
formbuilder_workers=6 python -c "from settings import Settings; print(Settings())"
```

```text
out_dir=PosixPath('dist') log_level='INFO' workers=4 debug=False webhook_token=None renderer=RendererSettings(timeout_s=30.0, node_bin='node')
out_dir=PosixPath('/srv/out') log_level='INFO' workers=8 debug=False webhook_token=SecretStr('**********') renderer=RendererSettings(timeout_s=5.0, node_bin='node')
out_dir=PosixPath('dist') log_level='INFO' workers=6 debug=False webhook_token=None renderer=RendererSettings(timeout_s=30.0, node_bin='node')
```

Ім'я змінної це `env_prefix` плюс ім'я поля, регістр за замовчуванням не важливий. `"8"` стає `int`, `"false"` стає `False` (Pydantic розуміє `0/1`, `true/false`, `yes/no`, `on/off`), рядок шляху стає `Path`. Вкладена модель збирається зі змінних з `env_nested_delimiter`: `FORMBUILDER_RENDERER__TIMEOUT_S` це `settings.renderer.timeout_s`. `SecretStr` ховає значення в `repr` і логах, а справжнє дістається лише явним `settings.webhook_token.get_secret_value()`.

Джерела мають фіксований пріоритет, від сильнішого до слабшого: аргументи конструктора `Settings(...)`, змінні оточення, `.env`, файли секретів (`secrets_dir`, для Docker secrets), значення за замовчуванням у класі. Вищий шар перекриває нижчий поле за полем. Аргументи конструктора і є місцем для CLI-прапорців: CLI сильніша за оточення, як і належить.

```bash
printf 'FORMBUILDER_OUT_DIR=from-dotenv\nFORMBUILDER_WORKERS=2\nFORMBUILDER_LOG_LEVEL=DEBUG\n' > .env
FORMBUILDER_OUT_DIR=from-env python s2.py
```

```python
# s2.py
import os
from pathlib import Path

from settings import Settings

print(os.environ.get("FORMBUILDER_LOG_LEVEL"))
s = Settings()
print(s.out_dir, s.workers, s.log_level)
s = Settings(out_dir=Path("from-cli"))
print(s.out_dir, s.workers, s.log_level)
s = Settings(_env_file=None)
print(s.out_dir, s.workers, s.log_level)
```

```text
None
from-env 2 DEBUG
from-cli 2 DEBUG
from-env 4 INFO
```

Рядок за рядком: `.env` не потрапляє в `os.environ`, pydantic-settings читає файл сам і лише для своїх полів, на відміну від `load_dotenv`. `out_dir` прийшов з оточення, бо воно сильніше за `.env`, а `workers` і `log_level` з `.env`, бо в оточенні їх немає. Аргумент конструктора перекрив оточення. `_env_file=None` вимикає файл для конкретного виклику, і лишаються оточення й defaults.

> **Під капотом.** `BaseSettings.__init__` викликає класметод `settings_customise_sources`, який повертає кортеж джерел у порядку пріоритету: `init_settings, env_settings, dotenv_settings, file_secret_settings`. Кожне джерело повертає словник, словники зливаються так, що перше джерело виграє, і лише потім результат проходить звичайну валідацію моделі. Перевизначивши цей метод, можна поміняти порядок, прибрати `.env` у проді або додати власне джерело, наприклад TOML-файл (m6-l02).

Валідація відбувається один раз і на старті, а не тоді, коли код уперше звернеться до змінної. Невалідне оточення дає одну `ValidationError` з усіма помилками одразу.

```bash
FORMBUILDER_WORKERS=many FORMBUILDER_LOG_LEVEL=verbose python s3.py
```

```python
# s3.py
from pydantic import ValidationError

from settings import Settings

try:
    Settings()
except ValidationError as e:
    print(e)
```

```text
2 validation errors for Settings
log_level
  Input should be 'DEBUG', 'INFO', 'WARNING' or 'ERROR' [type=literal_error, input_value='verbose', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/literal_error
workers
  Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='many', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/int_parsing
```

Повідомлення каже `workers`, а людина, що запускає контейнер, бачить у своєму compose-файлі `FORMBUILDER_WORKERS`. Тому CLI перекладає `exc.errors()` у рядки з іменами змінних (функція `describe_error` у розділі для капстоуну) і виходить з кодом 2. Порівняно з розкиданими `os.getenv` це дає чотири речі: усі налаштування описані в одному класі, який і є документацією; типи перевіряються до першого рядка бізнес-логіки; помилка конфігурації ловиться при деплої, а не о третій ночі в рідкісній гілці коду; у тестах налаштування створюються конструктором з потрібними значеннями, без маніпуляцій з оточенням.

> **Пастка.** `extra="forbid"` за замовчуванням у `BaseSettings` діє на `.env` асиметрично. Зайва змінна з префіксом в оточенні (`FORMBUILDER_WORKRES=3`, одруківка) мовчки ігнорується, бо з оточення беруться лише змінні відомих полів. А `.env` читається цілим, і будь-який зайвий рядок, навіть без префікса, як `DATABASE_URL` для іншого інструмента, валить старт. Спільний `.env` вимагає `extra="ignore"` у `model_config`.

```bash
printf 'FORMBUILDER_OUT_DIR=from-dotenv\nFORMBUILDER_WORKRES=2\nDATABASE_URL=sqlite:///x.db\n' > .env
FORMBUILDER_WORKRES=3 python s3.py
```

```text
2 validation errors for Settings
formbuilder_workres
  Extra inputs are not permitted [type=extra_forbidden, input_value='2', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/extra_forbidden
database_url
  Extra inputs are not permitted [type=extra_forbidden, input_value='sqlite:///x.db', input_type=str]
    For further information visit https://errors.pydantic.dev/2.14/v/extra_forbidden
```

> **Пастка.** `settings = Settings()` на рівні модуля читає оточення в момент першого імпорту. Тест, що робить `monkeypatch.setenv` після імпорту, змін не побачить. Лінивий варіант з m4-l08, функція під `@cache`, читає оточення при першому виклику, а `cache_clear()` у фікстурі скидає його між тестами. FastAPI в m7 використовує саме таку функцію як залежність.

```python
# s4.py
import os
from functools import cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FORMBUILDER_")
    workers: int = 4


settings = Settings()  # читається один раз, при імпорті модуля


@cache
def get_settings() -> Settings:
    return Settings()


print(settings.workers, get_settings().workers)
os.environ["FORMBUILDER_WORKERS"] = "16"
print(settings.workers, get_settings().workers)
get_settings.cache_clear()
print(settings.workers, get_settings().workers)
```

```text
4 4
4 4
4 16
```

У pydantic-settings є і власний розбір командного рядка (`cli_parse_args=True` у `SettingsConfigDict`), який перетворює поля на опції. Для застосунку з кількома підкомандами зручніше лишити CLI за Typer і передавати в `Settings(...)` лише ті прапорці, які користувач справді вказав: `None` від невказаної опції інакше перекриє оточення (та сама пастка з шарами й `None`, що з `ChainMap` у m2-l04).

<!-- task: q3 -->

<!-- task: t5 -->

## Логування, прогрес і кольори в CLI

Рівень логування в CLI задають прапорці `-v` і `-q`, які можна повторювати: `-vv` докладніше, `-qq` тихіше. В argparse це `action="count"`, у Typer `count=True`. Кількість зсуває рівень відносно базового (з налаштувань або `WARNING`), а налаштовує логування лише `main`, бо бібліотечний код логування не конфігурує (детально в m5-l09). Логи йдуть у stderr, як і будь-яка діагностика.

```python live
import argparse
import logging
import sys

LEVELS = [logging.DEBUG, logging.INFO, logging.WARNING, logging.ERROR]


def level_for(verbose: int, quiet: int, base: int = logging.WARNING) -> int:
    index = LEVELS.index(base) - verbose + quiet
    return LEVELS[max(0, min(index, len(LEVELS) - 1))]


parser = argparse.ArgumentParser(prog="formbuilder")
parser.add_argument("-v", "--verbose", action="count", default=0)
parser.add_argument("-q", "--quiet", action="count", default=0)

for argv in ([], ["-v"], ["-vv"], ["-vvv"], ["-q"], ["-qqq"]):
    args = parser.parse_args(argv)
    print(argv, logging.getLevelName(level_for(args.verbose, args.quiet)))

args = parser.parse_args(["-v"])
logging.basicConfig(
    level=level_for(args.verbose, args.quiet),
    stream=sys.stderr,
    format="%(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("formbuilder.cli")
log.debug("not shown at INFO")
log.info("rendering %s", "signup.json")
```

```text
[] WARNING
['-v'] INFO
['-vv'] DEBUG
['-vvv'] DEBUG
['-q'] ERROR
['-qqq'] ERROR
INFO formbuilder.cli: rendering signup.json
```

Кольори й анімація доречні лише тоді, коли на іншому кінці людина. `sys.stdout.isatty()` каже, чи потік під'єднано до терміналу (TTY, teletypewriter, загальноприйнята назва). При перенаправленні у файл чи пайп ANSI-коди перетворюються на сміття на кшталт `\x1b[31m` у логах CI. Конвенції `NO_COLOR` (будь-яке непорожнє значення вимикає кольори, no-color.org) і `FORCE_COLOR` перекривають автовизначення. Для прогресу довгих операцій беруть `rich` (`rich.progress.track`), він уже приходить залежністю Typer.

```bash
python -c "import sys; print(sys.stdout.isatty())"          # у терміналі
python -c "import sys; print(sys.stdout.isatty())" | cat
```

```text
True
False
```

```python live
import io
import os
from collections.abc import Mapping
from typing import TextIO


def use_color(stream: TextIO, env: Mapping[str, str] = os.environ) -> bool:
    if env.get("NO_COLOR"):
        return False
    if env.get("FORCE_COLOR"):
        return True
    return stream.isatty()


class FakeTTY(io.StringIO):
    def isatty(self) -> bool:
        return True


print(use_color(io.StringIO(), {}))
print(use_color(FakeTTY(), {}))
print(use_color(FakeTTY(), {"NO_COLOR": "1"}))
print(use_color(io.StringIO(), {"FORCE_COLOR": "1"}))
```

```text
False
True
False
True
```

Typer і rich роблять цю перевірку самі: довідка з рамками в цьому уроці знята через пайп і тому без ANSI-кодів. Власні кольорові повідомлення варто пропускати через ту саму функцію, а не писати escape-коди напряму.

## Тестування CLI: `main([...])`, `capsys`, `monkeypatch`, `CliRunner`

Контракт `main(argv) -> int` робить тест CLI звичайним викликом функції, без subprocess. Фікстура `capsys` з pytest перехоплює stdout і stderr окремо, `monkeypatch.setenv` і `monkeypatch.delenv` змінюють оточення лише на час тесту, `monkeypatch.chdir` переносить робочу директорію, щоб випадковий `.env` у репозиторії не підхопився (усі вбудовані фікстури розібрані в m3-l03). Це `jest.spyOn(process.stdout, "write")` і ручне збереження й відновлення `process.env` в одному рядку. Механізм `capsys` у мініатюрі це підміна `sys.stdout` і `sys.stderr` на буфери:

```python live
import contextlib
import io
import sys


def main(argv: list[str]) -> int:
    print("dist/signup/index.html")
    print("formbuilder: warning: theme not set", file=sys.stderr)
    return 0


out, err = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
    code = main(["build", "signup.json"])
print(code, repr(out.getvalue()), repr(err.getvalue()))
```

```text
0 'dist/signup/index.html\n' 'formbuilder: warning: theme not set\n'
```

Тести нижче написані для CLI капстоуну з наступного розділу, але патерн той самий для будь-якого `main`. Перша фікстура `autouse=True` прибирає всі `FORMBUILDER_*` з оточення розробника і переносить тест у `tmp_path`, друга дає шлях до фікстури конфігу.

```python
# tests/conftest.py
import os
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """No FORMBUILDER_* from the developer's shell, no .env from the repo."""
    for name in list(os.environ):
        if name.startswith("FORMBUILDER_"):
            monkeypatch.delenv(name)
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def signup() -> Path:
    return FIXTURES / "form_signup.json"
```

```python
# tests/test_cli.py (фрагмент)
from pathlib import Path

import pytest

from formbuilder.cli import main


def test_build_writes_page(
    signup: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["build", str(signup), "--out", str(tmp_path / "out")]) == 0
    out, err = capsys.readouterr()
    assert out.strip() == (tmp_path / "out" / "signup" / "index.html").as_posix()
    assert err.startswith("INFO formbuilder.cli: build")


def test_flag_beats_env(
    signup: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FORMBUILDER_OUT_DIR", str(tmp_path / "env-out"))
    assert main(["build", str(signup), "--out", str(tmp_path / "cli-out")]) == 0
    assert (tmp_path / "cli-out" / "signup").is_dir()
    assert not (tmp_path / "env-out").exists()


def test_bad_env_is_exit_2(
    signup: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("FORMBUILDER_LOG_LEVEL", "loud")
    assert main(["build", str(signup)]) == 2
    assert "FORMBUILDER_LOG_LEVEL" in capsys.readouterr().err


def test_verbose_logs_debug(signup: Path, caplog: pytest.LogCaptureFixture) -> None:
    assert main(["-v", "build", str(signup)]) == 0
    assert [r.levelname for r in caplog.records] == ["INFO", "DEBUG"]
```

```bash
FORMBUILDER_LOG_LEVEL=nonsense uv run pytest tests/test_cli.py -v
```

```text
tests/test_cli.py::test_build_writes_page PASSED                         [ 14%]
tests/test_cli.py::test_out_dir_from_env PASSED                          [ 28%]
tests/test_cli.py::test_flag_beats_env PASSED                            [ 42%]
tests/test_cli.py::test_bad_env_is_exit_2 PASSED                         [ 57%]
tests/test_cli.py::test_invalid_config_is_exit_1 PASSED                  [ 71%]
tests/test_cli.py::test_verbose_logs_debug PASSED                        [ 85%]
tests/test_cli.py::test_cli_runner PASSED                                [100%]

============================== 7 passed in 0.17s ===============================
```

> **Пастка.** Без фікстури, що чистить оточення, тести CLI залежать від shell розробника. Той самий запуск з вимкненим `autouse` і `FORMBUILDER_LOG_LEVEL=verbose`, що лишився в терміналі з учорашнього відлагодження, валить майже все, а в CI, де змінної немає, тести зелені. Це найчастіша причина "у мене падає, а в CI ні" для CLI.

```text
FAILED tests/test_cli.py::test_build_writes_page - AssertionError: assert 2 == 0
FAILED tests/test_cli.py::test_out_dir_from_env - AssertionError: assert 2 == 0
FAILED tests/test_cli.py::test_flag_beats_env - AssertionError: assert 2 == 0
FAILED tests/test_cli.py::test_invalid_config_is_exit_1 - AssertionError: ass...
FAILED tests/test_cli.py::test_verbose_logs_debug - AssertionError: assert 2 ...
FAILED tests/test_cli.py::test_cli_runner - assert "unknown renderer 'pdf'" i...
6 failed, 1 passed in 0.13s
```

Для Typer є `typer.testing.CliRunner`: він викликає застосунок в тому самому процесі, підміняє потоки й оточення і повертає `Result` з `exit_code`, `stdout`, `stderr` і `output` (обидва потоки разом). Різниця з `main([...])` у тому, що runner тестує саме Typer-застосунок з його обробкою помилок і не потребує адаптера; `env=` додає змінні поверх поточного оточення, а не замість нього.

```python
from typer.testing import CliRunner

from formbuilder.cli import app

runner = CliRunner()
result = runner.invoke(app, ["serve", "--port", "9000"])
print(result.exit_code)
print(repr(result.stdout))
print(repr(result.stderr))
result = runner.invoke(app, ["--version"])
print(result.exit_code, repr(result.output))
```

```text
1
''
'formbuilder: serve 127.0.0.1:9000 is not implemented yet\n'
0 'formbuilder 0.1.0\n'
```

## Для капстоуну

Заглушка `cli.py` з m0-l06 замінюється справжньою CLI на Typer, а налаштування переїжджають у `src/formbuilder/settings.py`. Команди: `validate` перевіряє конфіги моделями з m2-l09, `build` проганяє пайплайн з m4-l08 (`build_pipeline(fmt, out_dir)` і `Pipeline.run`), `serve` поки лише заглушка з кодом 1 до m7-l01. CLI не містить бізнес-логіки: вона перекладає аргументи й оточення у виклики наявного коду, а результат і винятки у коди виходу.

```python
"""Application settings: FORMBUILDER_* env vars, .env locally, defaults."""

from pathlib import Path
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PREFIX = "FORMBUILDER_"
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


def _upper(value: object) -> object:
    return value.upper() if isinstance(value, str) else value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix=ENV_PREFIX,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    out_dir: Path = Path("dist")
    log_level: Annotated[LogLevel, BeforeValidator(_upper)] = "INFO"
    renderer: str = "html"
    workers: int = Field(default=2, ge=0)  # generation workers in the API (m7-l01, m7-l03)


def describe_error(exc: ValidationError) -> str:
    lines = [f"formbuilder: invalid settings ({exc.error_count()} error(s))"]
    for err in exc.errors():
        name = ENV_PREFIX + "__".join(str(part) for part in err["loc"]).upper()
        lines.append(f"  {name}: {err['msg']} (got {err['input']!r})")
    return "\n".join(lines)
```

`BeforeValidator(_upper)` дозволяє писати `FORMBUILDER_LOG_LEVEL=debug` маленькими літерами, `workers` CLI не читає, але він уже тут, бо в m7-l01 фабрика `create_app(settings)` запускає стільки воркерів генерації (у тестах `workers=0`), `extra="ignore"` робить `.env` спільним з іншими інструментами, а `describe_error` перекладає `loc` помилки Pydantic назад в ім'я змінної оточення.

```python
"""Command-line interface: formbuilder build | validate | serve."""

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Annotated, Any

import typer
from pydantic import ValidationError

from formbuilder import __version__
from formbuilder.config import FormConfig
from formbuilder.settings import Settings, describe_error

# build_pipeline(fmt, out_dir) з m4-l08 лишається в цьому модулі без змін

log = logging.getLogger("formbuilder.cli")
LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"]

app = typer.Typer(
    name="formbuilder",
    help="FormBuilder backend: validate form configs and build static pages.",
    add_completion=False,
    no_args_is_help=True,
)

ConfigPath = Annotated[
    Path,
    typer.Argument(exists=True, dir_okay=False, help="Form config JSON."),
]


def effective_level(base: str, verbose: int, quiet: int) -> str:
    index = LEVELS.index(base) - verbose + quiet
    return LEVELS[max(0, min(index, len(LEVELS) - 1))]


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    logger = logging.getLogger("formbuilder")
    logger.handlers[:] = [handler]
    logger.setLevel(level)


def load_settings(ctx: typer.Context, **overrides: Any) -> Settings:
    try:
        settings = Settings(**{k: v for k, v in overrides.items() if v is not None})
    except ValidationError as exc:
        print(describe_error(exc), file=sys.stderr)
        raise typer.Exit(2) from None
    verbose, quiet = ctx.obj
    configure_logging(effective_level(settings.log_level, verbose, quiet))
    return settings


def show_version(value: bool) -> None:
    if value:
        print(f"formbuilder {__version__}")
        raise typer.Exit()


@app.callback()
def root(
    ctx: typer.Context,
    verbose: Annotated[
        int, typer.Option("--verbose", "-v", count=True, help="More logs.")
    ] = 0,
    quiet: Annotated[
        int, typer.Option("--quiet", "-q", count=True, help="Fewer logs.")
    ] = 0,
    version: Annotated[
        bool,
        typer.Option("--version", callback=show_version, is_eager=True),
    ] = False,
) -> None:
    ctx.obj = (verbose, quiet)


@app.command()
def validate(
    ctx: typer.Context,
    configs: Annotated[list[Path], typer.Argument(exists=True, dir_okay=False)],
) -> None:
    """Check configs without rendering."""
    load_settings(ctx)
    failed = 0
    for path in configs:
        try:
            FormConfig.model_validate_json(path.read_text(encoding="utf-8"))
        except ValidationError as exc:
            failed += 1
            print(f"formbuilder: {path}: {exc.error_count()} error(s)", file=sys.stderr)
            for err in exc.errors():
                loc = ".".join(str(part) for part in err["loc"])
                print(f"  {loc}: {err['msg']}", file=sys.stderr)
        else:
            print(f"{path}: ok")
    if failed:
        raise typer.Exit(1)


@app.command()
def build(
    ctx: typer.Context,
    config: ConfigPath,
    out: Annotated[
        Path | None, typer.Option(help="Output dir [env: FORMBUILDER_OUT_DIR].")
    ] = None,
    renderer: Annotated[
        str | None, typer.Option(help="Renderer [env: FORMBUILDER_RENDERER].")
    ] = None,
) -> None:
    """Render a config to static files."""
    settings = load_settings(ctx, out_dir=out, renderer=renderer)
    try:
        pipeline = build_pipeline(settings.renderer, settings.out_dir)
    except ValueError as exc:
        raise typer.BadParameter(str(exc), param_hint="--renderer") from None
    try:
        raw = json.loads(config.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"formbuilder: {config}: invalid JSON: {exc}", file=sys.stderr)
        raise typer.Exit(1) from None
    log.info("build %s renderer=%s out=%s", config, settings.renderer, settings.out_dir)
    result = asyncio.run(pipeline.run(config.stem, raw))
    if result.error is not None:
        print(f"formbuilder: {config}: {result.error}", file=sys.stderr)
        raise typer.Exit(1)
    log.debug("published %s", result.url)
    print(result.url)


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run the HTTP API (arrives in m7)."""
    print(f"formbuilder: serve {host}:{port} is not implemented yet", file=sys.stderr)
    raise typer.Exit(1)


def main(argv: list[str] | None = None) -> int:
    try:
        app(args=argv, prog_name="formbuilder")
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 1
    return 0
```

Кілька рішень тут неочевидні. `--out` і `--renderer` мають `None` за замовчуванням і передаються в `Settings(...)` лише тоді, коли користувач їх вказав, тож пріоритет "прапорець → оточення → `.env` → default" виходить сам. Рівень логування береться з налаштувань і зсувається `-v`/`-q`. `configure_logging` замінює обробник логера `formbuilder` при кожному виклику `main`, а не через `basicConfig`: `basicConfig` спрацьовує лише раз на процес і запам'ятовує потік stderr, який у наступному тесті вже інший. Якщо в капстоуні вже налаштовано structlog з m5-l09, передайте рівень туди і приберіть цю функцію. `typer.Argument(exists=True)` перетворює відсутній файл на помилку використання з кодом 2 ще до виклику команди.

```bash
formbuilder --version
formbuilder -v build tests/fixtures/form_signup.json --out public
FORMBUILDER_OUT_DIR=srv FORMBUILDER_LOG_LEVEL=debug formbuilder build tests/fixtures/form_signup.json
formbuilder validate tests/fixtures/form_signup.json tests/fixtures/form_broken.json; echo "exit $?"
FORMBUILDER_LOG_LEVEL=loud formbuilder build tests/fixtures/form_signup.json; echo "exit $?"
formbuilder serve; echo "exit $?"
```

```text
formbuilder 0.1.0
INFO formbuilder.cli: build tests/fixtures/form_signup.json renderer=html out=public
DEBUG formbuilder.cli: published public/signup/index.html
public/signup/index.html
INFO formbuilder.cli: build tests/fixtures/form_signup.json renderer=html out=srv
DEBUG formbuilder.cli: published srv/signup/index.html
srv/signup/index.html
formbuilder: tests/fixtures/form_broken.json: 1 error(s)
  elements.0.label: Field required
tests/fixtures/form_signup.json: ok
exit 1
formbuilder: invalid settings (1 error(s))
  FORMBUILDER_LOG_LEVEL: Input should be 'DEBUG', 'INFO', 'WARNING' or 'ERROR' (got 'LOUD')
exit 2
formbuilder: serve 127.0.0.1:8000 is not implemented yet
exit 1
```

Вивід знято з перенаправленням у пайп, тому рядок `form_signup.json: ok` (stdout) стоїть після помилок (stderr), хоча друкувався раніше: stdout при перенаправленні буферизується блоками, stderr ні (m0-l03). У терміналі порядок збігається з порядком виклику. Моделі й пайплайн у прогоні вище це мінімальні заглушки з тими самими іменами; у вашому капстоуні замість них працює код з m2-l09 і m4-l08, і текст помилок валідації відповідатиме вашим моделям.

> **Для капстоуну.** Смоук-тест з m0-l06 `main(["--help"]) == 0` лишається зеленим без змін: адаптер повертає код `SystemExit`, який `--help` дає нульовим. Тест `--version` тепер має перевіряти рядок `formbuilder 0.1.0` у stdout, а `uv run formbuilder` без аргументів показує довідку з кодом 2, бо `no_args_is_help=True` у Typer 0.27 вважає це помилкою використання.

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **`process.argv.slice(2)` вручну.** Звичка розбирати `sys.argv[1:]` циклом з `if arg == "--out"`. Довідки немає, `--out=dist` не працює, помилки без usage і з довільним кодом виходу. Правильно: `argparse` або Typer, які дають усе це з оголошень.

   ```python
   out = sys.argv[sys.argv.index("--out") + 1]           # за звичкою: ValueError, IndexError
   parser.add_argument("--out", type=Path, default=Path("dist"))  # правильно
   ```

2. **`process.env.X` без валідації.** `int(os.getenv("WORKERS"))` у випадковому місці коду, `bool(os.getenv("DEBUG"))`, що дає `True` для `"false"`. Помилка вилазить посеред роботи, а не на старті. Правильно: одна модель `BaseSettings` з типами, створена на вході.

   ```python
   debug = bool(os.getenv("FORMBUILDER_DEBUG"))  # "false" -> True
   settings = Settings()                          # FORMBUILDER_DEBUG=false -> settings.debug is False
   ```

3. **`process.exit()` посеред коду.** `sys.exit(1)` у функції завантаження конфігу. `SystemExit` проходить крізь `except Exception`, вбиває воркер і тест, що викликав функцію. Правильно: власний виняток у глибині, код виходу лише в `main`.

   ```python
   raise CliError(f"{path}: expected a .json config")  # у глибині
   except CliError as exc:                              # у main
       print(f"formbuilder: {exc}", file=sys.stderr)
       return 1
   ```

4. **Ланцюжки yargs як структура CLI.** Спроба відтворити `.command().option().option()` одним виразом або словником конфігурації. В argparse оголошення це послідовні виклики `add_argument` на підпарсерах, а в Typer сигнатури функцій. Правильно: функція `build_parser()`, яку можна викликати в тесті, або `@app.command()` на звичайній функції.

   ```python
   @app.command()
   def build(config: Path, out: Path = Path("dist"), dry_run: bool = False) -> None: ...
   ```

5. **Очікування, що `.env` читається автоматично.** Після Next.js і Vite `.env` поруч із кодом здається достатнім. Python його не читає, і `os.getenv` повертає `None`. Правильно: `env_file=".env"` у pydantic-settings, `load_dotenv()` на старті або `uv run --env-file .env`.

   ```python
   model_config = SettingsConfigDict(env_prefix="FORMBUILDER_", env_file=".env", extra="ignore")
   ```

6. **Глобальні опції після підкоманди.** `formbuilder build a.json -v` як у commander. Підпарсер не знає опцій головного парсера, виходить `unrecognized arguments: -v` і код 2. Правильно: глобальні опції до підкоманди, або оголосити опцію на рівні підкоманди.

   ```bash
   formbuilder -v build a.json
   ```

7. **Діагностика в stdout.** `print("Building...")` поруч із результатом, як `console.log` для всього. `$(formbuilder build ...)` отримує сміття разом зі шляхом. Правильно: результат у stdout, логи, прогрес і помилки в stderr.

   ```python
   log.info("build %s", config)   # stderr через logging
   print(result.url)              # stdout: лише результат
   ```

8. **`type=bool` для прапорця.** Інтуїція "тип bool, значить прапорець". `--strict false` стає `True`. Правильно: `action="store_true"` або `BooleanOptionalAction`; у Typer просто `strict: bool = False`.

   ```python
   parser.add_argument("--strict", action=argparse.BooleanOptionalAction, default=True)
   ```

## Підсумок

- `argparse` у стандартній бібліотеці: позиційні аргументи й опції, `type=` як будь-який callable, `choices`, `nargs`, `action="store_true" / "count" / "append"`, підкоманди через `add_subparsers(dest=..., required=True)` і `set_defaults(handler=...)`.
- `parse_args(list)` робить парсер чистою функцією; без списку він бере `sys.argv[1:]`. Завжди задавайте `prog=`.
- Помилка розбору це usage у stderr і `SystemExit(2)`, `--help` це stdout і `SystemExit(0)`; на межі їх перехоплюють як `SystemExit`.
- Контракт CLI: `main(argv: list[str] | None = None) -> int`, `sys.exit(main())` лише в точці входу, коди `0` успіх, `1` помилка роботи, `2` неправильний виклик; результат у stdout, діагностика в stderr.
- Typer будує CLI з анотацій: параметр без default це аргумент, з default це опція, `bool` дає `--x/--no-x`, `Annotated[..., typer.Option(...)]` для деталей; працює на Click (у 0.27 вендореному), `typer.Exit(code)` для свого коду.
- argparse, коли залежностей бути не може; Typer, коли CLI це частина застосунку з кількома командами.
- `os.environ` це mapping рядків: `[]` кидає `KeyError`, запис не-рядка кидає `TypeError`, `bool("false")` це `True`.
- `.env` автоматично не читається; лише локально, у `.gitignore`; секрети ніколи в коді.
- `BaseSettings`: типізовані поля, `env_prefix`, `env_nested_delimiter`, пріоритет init → env → `.env` → secrets → defaults, валідація всього одразу на старті.
- Тести CLI: `main([...])` з `capsys`, оточення через `monkeypatch`, `autouse`-фікстура проти змінних з shell, `CliRunner` для Typer.

## Що далі

Наступний урок m6-l07 про `os`, `sys` і `signal`: як CLI і воркер коректно завершуються по SIGTERM. Звідти знадобиться все, що тут сказано про `SystemExit`, коди виходу й те, що `sys.exit` це виняток, а не миттєва зупинка. Налаштування з `Settings` далі отримають шлях до SQLite-файлу в m6-l08 і стануть залежністю FastAPI в m7-l01, а в m7-l07 ті самі `FORMBUILDER_*` задаються вже в Dockerfile і compose.
