---
id: m3-l04
module: m3-modules-tests
title: "Моки: unittest.mock, pytest-mock; coverage"
summary: "Учень відрізняє місце, де потрібен мок, від місця, де потрібна інʼєкція залежності чи fake; пише Mock і patch зі spec і за правилом «патчити там, де шукають»; тестує async-код через AsyncMock і читає звіт coverage з гілками, не плутаючи виконаний рядок з перевіреним."
duration_min: 80
prerequisites: [m3-l03]
---

## Мок потрібен на межі системи, а не всередині

У Jest усе зветься моком: `jest.fn()`, `jest.mock()`, `jest.spyOn()`. У Python корисно розрізняти чотири види дублерів (test double: термін з книжки Meszaros "xUnit Test Patterns", у документації Python його немає, але на співбесіді його розуміють). Stub повертає заготовлену відповідь. Mock ще й записує виклики, щоб тест їх потім перевірив. Spy обгортає справжній об'єкт: поведінка та сама, виклики записуються. Fake це робоча спрощена реалізація, наприклад сховище в словнику. Модуль стандартної бібліотеки `unittest.mock` дає перші три через один клас `Mock` (офіційна назва в документації: mock object); fake пишуть руками.

Мок виправданий там, де тест не контролює світ або не має права його чіпати: мережа, зовнішній процес, годинник, випадковість, сервіс, який шле листи чи списує гроші. Файлова система зазвичай сюди не входить: `tmp_path` з m3-l03 дає справжню тимчасову директорію, і справжній файл перевіряє більше, ніж мок `open`, який перевіряє лише те, що ви правильно вгадали його виклик.

Мокання власного коду це запах. Якщо, щоб протестувати `build()`, ви патчите три допоміжні функції з того самого пакета, тест перевіряє порядок викликів, а не результат: будь-який рефакторинг його ламає, а баг усередині допоміжних функцій лишається невидимим. Зазвичай це означає, що функція змішує логіку й I/O. Ліки: передати залежність параметром (dependency injection, загальний термін, не специфічний для Python; як це роблять без DI-контейнерів, у m4-l08).

```ts
// release.ts
import { uploadToCdn } from "./cdn";

export function release(slug: string, html: string): string {
  if (!html) throw new Error("empty page");
  return uploadToCdn(`${slug}.html`, html);
}

// release.test.ts
jest.mock("./cdn");
(uploadToCdn as jest.Mock).mockReturnValue("https://cdn.test/signup.html");
```

```python live
from collections.abc import Callable


def release(slug: str, html: str, upload: Callable[[str, str], str]) -> str:
    if not html:
        raise ValueError("empty page")
    return upload(f"{slug}.html", html)


uploaded: list[str] = []

def fake_upload(path: str, body: str) -> str:
    uploaded.append(path)
    return f"https://cdn.test/{path}"

print(release("signup", "<form></form>", fake_upload))
print(uploaded)
```

```text
https://cdn.test/signup.html
['signup.html']
```

Розходження в тому, де шов (seam), через який тест підміняє залежність. У Jest шов це реєстр модулів: `jest.mock` підміняє модуль до імпорту, бо ESM-імпорт це прив'язка, до якої тест інакше не дотягнеться. У Python найдешевший шов це параметр: duck typing пускає будь-який об'єкт з потрібною формою, а mypy перевіряє цю форму через `Callable` чи Protocol. Тому в Python-кодовій базі моків помітно менше: половина того, що в Jest робить `jest.mock`, тут це звичайна функція або маленький клас у тесті, і жодної бібліотеки.

> **JS-аналог.** `jest.fn()` це `Mock()`. `jest.mock("./cdn")` найближче до `patch("formbuilder.cli.upload_to_cdn")`, але підміняє один атрибут, а не модуль. `jest.spyOn(obj, "m")` без `mockImplementation` це `mocker.spy(obj, "m")`. `restoreMocks: true` у конфігу Jest це поведінка `patch` і `mocker` за замовчуванням: підміна знімається сама.

## `Mock`: об'єкт, що погоджується на все

`Mock()` створює об'єкт, у якого існує будь-який атрибут і який можна викликати з будь-якими аргументами. Атрибут створюється при першому зверненні як дочірній `Mock` і кешується, тож `m.publish is m.publish`. Виклик повертає `return_value` (за замовчуванням ще один `Mock`) і записує аргументи. Тобто це `jest.fn()` і автомок цілого об'єкта одночасно.

```ts
const upload = jest.fn().mockReturnValue("https://cdn.test/a.html");
upload("a.html", "<p>");
expect(upload).toHaveBeenCalledTimes(1);
expect(upload).toHaveBeenCalledWith("a.html", "<p>");
console.log(upload.mock.calls); // [ [ 'a.html', '<p>' ] ]
```

```python live
from unittest.mock import Mock

upload = Mock(return_value="https://cdn.test/a.html")
print(upload("a.html", "<p>"))

upload.assert_called_once_with("a.html", "<p>")
print(upload.called, upload.call_count)
print(upload.call_args)
print(upload.call_args.args, upload.call_args.kwargs)
print(upload.call_args_list)
```

```text
https://cdn.test/a.html
True 1
call('a.html', '<p>')
('a.html', '<p>') {}
[call('a.html', '<p>')]
```

Асерти живуть на самому моку як методи, а не в окремому `expect`. Виклик записується як об'єкт `call(...)`, який окремо зберігає позиційні аргументи й іменовані, і `assert_called_*` порівнює їх окремо. Тому один і той самий виклик, записаний позиційно і через ім'я, для голого `Mock` різний: він не знає сигнатури справжньої функції. У Jest такої проблеми немає, бо в JS немає іменованих аргументів.

```python
from unittest.mock import Mock

upload = Mock()
upload("a.html", body="<p>")
upload.assert_called_once_with("a.html", "<p>")
```

```text
AssertionError: expected call not found.
Expected: mock('a.html', '<p>')
  Actual: mock('a.html', body='<p>')
```

Повідомлення помилки показує обидва виклики, `Expected` і `Actual`, тож різницю видно одразу. Як прибрати цю чутливість до форми виклику, у наступному розділі (`autospec`). Решта інструментів перевірки: `assert_called()`, `assert_not_called()`, `assert_any_call(...)` для виклику серед багатьох, `assert_has_calls([...])` для послідовності, `reset_mock()` для очищення історії між фазами тесту.

Дочірні моки записують свої виклики й у батьківський: `mock_calls` дає повну історію всього дерева з іменами шляхів. Це зручно, коли важливий порядок викликів різних методів однієї залежності.

```python live
from unittest.mock import Mock, call

publisher = Mock()
publisher.publish.return_value = "https://cdn.test/signup.html"

url = publisher.publish("signup", "<form>")
publisher.stats.increment("published")

print(url)
print(publisher.mock_calls)
print(publisher.mock_calls == [call.publish("signup", "<form>"), call.stats.increment("published")])
print(publisher.stats.increment.call_count, publisher.publish.call_count)
print(publisher.publish is publisher.publish)
```

```text
https://cdn.test/signup.html
[call.publish('signup', '<form>'), call.stats.increment('published')]
True
1 1
True
```

<!-- task: t1 -->

`side_effect` керує тим, що відбувається при виклику, і має пріоритет над `return_value`. Він приймає три різні речі. Виняток (клас або екземпляр) кидається. Iterable віддає по одному значенню на виклик, а якщо елемент сам виняток, той кидається; це `mockReturnValueOnce` і `mockRejectedValueOnce` ланцюжком. Функція викликається з тими самими аргументами, що й мок, і її результат стає результатом виклику; це `mockImplementation`.

```python live
from unittest.mock import Mock

fetch = Mock(side_effect=ConnectionError("reset by peer"))
try:
    fetch("forms/1")
except ConnectionError as e:
    print("raised:", e)

fetch.side_effect = [ConnectionError("reset"), {"id": "f1"}]
for _ in range(3):
    try:
        print("got:", fetch("forms/1"))
    except Exception as e:
        print("raised:", type(e).__name__, e)

fetch.side_effect = lambda path: {"id": path.rsplit("/", 1)[-1]}
print("got:", fetch("forms/42"))
print(fetch.call_count)
```

```text
raised: reset by peer
raised: ConnectionError reset
got: {'id': 'f1'}
raised: StopIteration 
got: {'id': '42'}
5
```

> **Пастка.** Коли список у `side_effect` вичерпано, мок кидає `StopIteration`, а не повертає останнє значення чи `return_value`. У Jest після `mockReturnValueOnce` мок мовчки повертається до `mockReturnValue` або `undefined`; тут третій виклик падає. Якщо код під тестом викликає залежність більше разів, ніж ви заклали, тест упаде з `StopIteration` десь глибоко, і це правильний сигнал, а не збій тесту.

<!-- task: t2 -->

`MagicMock` це `Mock` з налаштованими спеціальними методами (dunder, від "double underscore", жаргон спільноти для `__len__`, `__iter__`, `__enter__`; в документації вони звуться special methods). Голий `Mock` не можна передати в `len()`, ітерувати чи використати в `with`; `MagicMock` можна, і `patch` за замовчуванням створює саме його.

```python live
from unittest.mock import MagicMock, Mock

try:
    len(Mock())
except TypeError as e:
    print("TypeError:", e)

m = MagicMock()
print(len(m), list(m), bool(m))
m.__len__.return_value = 3
m.__iter__.return_value = iter(["email", "phone"])
print(len(m), list(m))
with m as entered:
    print(entered is m.__enter__.return_value)
```

```text
TypeError: object of type 'Mock' has no len()
0 [] True
3 ['email', 'phone']
True
```

> **Під капотом.** Звичайні атрибути `Mock` створює через `__getattr__`, який викликається, коли атрибута немає. Спеціальні методи Python шукає не на екземплярі, а на типі, і `__getattr__` для них не спрацьовує (детально в m4-l02). Тому `MagicMock` заздалегідь прописує їх, а кожен екземпляр мока отримує власний підклас, щоб `m.__len__ = ...` змінювало поведінку лише цього мока, а не всіх.

## `spec` і `autospec`: мок, який знає форму

Мок, що погоджується на все, бреше в обидва боки. Опечатка в коді під тестом проходить, бо `pubish` існує так само, як `publish`. Опечатка в самому тесті теж проходить: асерт, якого немає, просто створює дочірній мок і викликає його.

```python
from unittest.mock import Mock


class Publisher:
    def publish(self, slug: str, html: str) -> str:
        raise NotImplementedError


def release(publisher: Publisher, slug: str, html: str) -> str:
    return publisher.pubish(slug, html)          # опечатка в коді


pub = Mock()
print(type(release(pub, "signup", "<form>")).__name__)
pub.publish.toHaveBeenCalledWith("signup", "<form>")   # звичка з Jest
pub.publish.assert_called_once                          # без дужок
print("test passed")
```

```text
Mock
test passed
```

Три помилки, нуль падінь. Друга й третя особливо підступні, бо читаються як перевірка. Частину таких випадків Python 3.12 уже ловить: атрибут, що починається з `assert`, `assret`, `asert`, `aseert` чи `assrt`, або має ім'я асерта без префікса `assert_`, дає `AttributeError`. Але `toHaveBeenCalledWith` і асерт без дужок під цей захист не потрапляють.

```python
from unittest.mock import Mock

pub = Mock()
for name in ["assert_called_once_wiht", "called_once_with", "toHaveBeenCalledWith"]:
    try:
        getattr(pub.publish, name)("signup")
        print(name, "-> passed silently")
    except AttributeError as e:
        print(name, "->", str(e).split(".")[0])
```

```text
assert_called_once_wiht -> 'assert_called_once_wiht' is not a valid assertion
called_once_with -> 'called_once_with' is not a valid assertion
toHaveBeenCalledWith -> passed silently
```

Захист від усіх трьох це `spec`: мок отримує форму справжнього класу. `Mock(spec=Publisher)` дозволяє лише атрибути, які є в `dir(Publisher)`, але сигнатуру викликів не перевіряє. `create_autospec(Publisher, instance=True)` перевіряє і атрибути, і сигнатуру кожного методу, а `assert_called_with` порівнює виклики через сигнатуру, тож позиційний і іменований аргумент стають рівноцінними. `patch(..., autospec=True)` робить те саме для патча. `spec_set=` на додачу забороняє присвоїти атрибут, якого немає в класі.

```python live
from unittest.mock import Mock, create_autospec


class Publisher:
    def publish(self, slug: str, html: str) -> str:
        raise NotImplementedError


pub = Mock(spec=Publisher)
try:
    pub.pubish("signup", "<form>")
except AttributeError as e:
    print("AttributeError:", e)
pub.publish("signup")                       # spec не бачить сигнатури
print(pub.publish.call_args)

pub = create_autospec(Publisher, instance=True)
pub.publish.return_value = "https://cdn.test/signup.html"
try:
    pub.publish("signup")
except TypeError as e:
    print("TypeError:", e)
print(pub.publish("signup", html="<form>"))
pub.publish.assert_called_once_with("signup", "<form>")
print("positional == keyword under autospec")
```

```text
AttributeError: Mock object has no attribute 'pubish'
call('signup')
TypeError: missing a required argument: 'html'
https://cdn.test/signup.html
positional == keyword under autospec
```

> **Пастка.** `spec` будується з класу, тож атрибути, які з'являються лише в `__init__` (`self.root = root`), йому невідомі: `create_autospec(DirPublisher, instance=True).root` дає `AttributeError`. Анотація на рівні класу (`root: Path`) не допомагає, бо `dir()` її не бачить. Якщо тесту потрібен такий атрибут, присвойте його мокові явно (`pub.root = tmp_path`; із `spec_set` так не можна) або візьміть fake.

```python
from pathlib import Path
from unittest.mock import create_autospec


class DirPublisher:
    root: Path

    def __init__(self, root: Path) -> None:
        self.root = root

    def publish(self, slug: str, html: str) -> str:
        return str(self.root / f"{slug}.html")


pub = create_autospec(DirPublisher, instance=True)
try:
    pub.root
except AttributeError as e:
    print("AttributeError:", e)
pub.root = Path("/tmp/dist")
print(pub.root)
```

```text
AttributeError: Mock object has no attribute 'root'
/tmp/dist
```

Ціна `autospec` невелика: створення мока трохи повільніше, бо інспектуються сигнатури. Ставити `spec` або `autospec` варто за замовчуванням для кожного мока, що стоїть на місці справжнього класу; голий `Mock()` лишити для дрібних callback-ів, де форма очевидна з тесту. Протокол з m2-l07 теж годиться як spec: `create_autospec(Publisher, instance=True)` для `class Publisher(Protocol)` працює так само, як для звичайного класу.

<!-- task: q1 -->

<!-- task: t3 -->

## `patch`: підміна атрибута там, де його шукають

`patch("package.module.name")` робить рівно три речі: імпортує `package.module`, запам'ятовує його атрибут `name` і присвоює на його місце замінник (за замовчуванням `MagicMock`, для `async def` автоматично `AsyncMock`), а на виході повертає оригінал. Жодної магії реєстру модулів: це `setattr` на об'єкті модуля з гарантованим відкатом. `jest.mock` працює інакше: він підміняє модуль у реєстрі до того, як його хтось імпортує, і для цього Jest піднімає виклик над імпортами. У Python ні підйому, ні фабрики модуля немає: на момент запуску тесту модулі вже імпортовані й лежать у `sys.modules`.

Форм три, поведінка однакова: контекстний менеджер, декоратор (мок приходить додатковим аргументом), `patch.object(obj, "name")`, коли об'єкт уже в руках.

```python live
import os
from unittest.mock import patch


def workdir_label() -> str:
    return f"cwd={os.getcwd()}"


with patch("os.getcwd", return_value="/srv/forms") as fake:
    print(workdir_label())
fake.assert_called_once_with()
print(workdir_label() == f"cwd={os.getcwd()}")


@patch("os.getcwd", return_value="/tmp/build")
def run(fake_getcwd) -> str:
    return workdir_label()

print(run())

with patch.object(os, "getcwd", return_value="/a"):
    print(workdir_label())
```

```text
cwd=/srv/forms
True
cwd=/tmp/build
cwd=/a
```

> **Пастка.** Кілька декораторів `@patch` передають моки знизу вгору: найближчий до `def` іде першим аргументом. Це звичайний порядок застосування декораторів, але читається він навпаки. У pytest цю проблему знімає `mocker`, де кожен патч це окремий рядок із власною змінною.

```python
import os
from unittest.mock import patch


@patch("os.getcwd", return_value="/cwd")
@patch("os.getpid", return_value=42)
def check(fake_getpid, fake_getcwd) -> None:
    print(os.getpid(), os.getcwd())

check()
```

```text
42 /cwd
```

Тепер головне правило: патчити там, де ім'я шукають, а не там, де його визначено. `from formbuilder.render import render` у `cli.py` виконується один раз при імпорті `cli` і створює в просторі імен `cli` власне ім'я `render`, прив'язане до того самого об'єкта функції. Імен стає два, об'єкт один. `patch("formbuilder.render.render")` переприв'язує ім'я в модулі `render`, а `cli` далі тримає своє, старе. Це і є відмінність від ESM: імпорт в ESM це жива прив'язка до експорту, а `from x import y` у Python це присвоєння в момент імпорту.

```python
# formbuilder/render.py
def render(config: dict[str, str]) -> str:
    return f"<form id={config['id']!r}>"


# formbuilder/cli.py
from formbuilder.render import render


def build(config: dict[str, str]) -> str:
    html = render(config)
    return f"built {len(html)} bytes"


# tests/test_patch_target.py
from unittest.mock import Mock, patch

import pytest

from formbuilder import cli


def test_patch_where_defined() -> None:
    with patch("formbuilder.render.render", return_value="<x>"):
        assert cli.build({"id": "signup"}) == "built 3 bytes"


def test_patch_where_used() -> None:
    with patch("formbuilder.cli.render", return_value="<x>") as fake:
        assert cli.build({"id": "signup"}) == "built 3 bytes"
    fake.assert_called_once_with({"id": "signup"})


def test_monkeypatch_same_rule(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = Mock(return_value="<x>")
    monkeypatch.setattr("formbuilder.cli.render", fake)
    assert cli.build({"id": "signup"}) == "built 3 bytes"
    fake.assert_called_once_with({"id": "signup"})
```

```text
$ pytest -q tests/test_patch_target.py --tb=short
F..                                                                      [100%]
=================================== FAILURES ===================================
___________________________ test_patch_where_defined ___________________________
tests/test_patch_target.py:10: in test_patch_where_defined
    assert cli.build({"id": "signup"}) == "built 3 bytes"
E   AssertionError: assert 'built 18 bytes' == 'built 3 bytes'
E     
E     - built 3 bytes
E     ?       ^
E     + built 18 bytes
E     ?       ^^
=========================== short test summary info ============================
FAILED tests/test_patch_target.py::test_patch_where_defined - AssertionError:...
1 failed, 2 passed in 0.02s
```

Перший тест патчив `formbuilder.render.render`, а `build` викликав справжній `render` через ім'я в `cli` і отримав 18 байтів замість 3. Другий патчить `formbuilder.cli.render`, тобто саме ім'я, яке `build` читає при виклику. Якщо модуль пише `import formbuilder.render` і викликає `formbuilder.render.render(...)`, пошук іде через атрибут модуля в момент виклику, і тоді патч у місці визначення спрацює. Звідси практичне правило: дивіться на рядок, де викликають, і патчте той модуль, у просторі імен якого це ім'я шукається.

`monkeypatch.setattr` з m3-l03 підкоряється тому самому правилу, бо робить той самий `setattr`. Різниця у ролі: `monkeypatch` нічого не створює, ви даєте замінник самі, і він не записує виклики, доки ви не передасте йому `Mock`. `patch` створює мок сам. Для змінних оточення є `patch.dict("os.environ", {...})`, але в pytest природніший `monkeypatch.setenv`.

<!-- task: q2 -->

<!-- task: t4 -->

## `pytest-mock`: фікстура `mocker`

`pytest-mock` це плагін, який додає фікстуру `mocker`: тонку обгортку над `unittest.mock`, прив'язану до життєвого циклу тесту. `mocker.patch`, `mocker.patch.object`, `mocker.patch.dict` приймають ті самі аргументи, що й `patch`, але без `with` і без декоратора: підміна діє до кінця тесту й знімається в teardown фікстури, навіть якщо тест упав. Ті самі класи доступні як `mocker.Mock`, `mocker.MagicMock`, `mocker.AsyncMock`, `mocker.create_autospec`, тож окремий імпорт з `unittest.mock` не потрібен. Встановлюється як dev-залежність: `uv add --dev pytest-mock`.

`mocker.spy(obj, "name")` це `jest.spyOn` без `mockImplementation`: справжня функція виконується, виклики записуються, а результат лежить у `spy.spy_return` (виняток у `spy.spy_exception`). Під капотом це `patch.object` з `autospec=True` і `side_effect`, що викликає оригінал.

```python
# tests/test_mocker.py
from pytest_mock import MockerFixture

from formbuilder import cli, render


def test_build_with_mocker(mocker: MockerFixture) -> None:
    fake = mocker.patch("formbuilder.cli.render", return_value="<x>")
    assert cli.build({"id": "signup"}) == "built 3 bytes"
    fake.assert_called_once_with({"id": "signup"})


def test_build_with_spy(mocker: MockerFixture) -> None:
    spy = mocker.spy(cli, "render")
    assert cli.build({"id": "signup"}) == "built 18 bytes"
    spy.assert_called_once_with({"id": "signup"})
    assert spy.spy_return == "<form id='signup'>"


def test_patches_are_gone() -> None:
    assert cli.render is render.render
```

```text
$ pytest -q tests/test_mocker.py
...                                                                      [100%]
3 passed in 0.01s
```

Останній тест показує автоматичне зняття: після двох тестів з патчами `cli.render` знову той самий об'єкт, що `render.render`. Друга перевага `mocker` у повідомленнях: коли `assert_called_*` падає, плагін додає до тексту `unittest.mock` розбір від pytest, як для звичайного `assert`.

```python
# tests/test_mocker_fail.py
from pytest_mock import MockerFixture

from formbuilder import cli


def test_wrong_args(mocker: MockerFixture) -> None:
    fake = mocker.patch("formbuilder.cli.render", return_value="<x>")
    cli.build({"id": "signup"})
    fake.assert_called_once_with({"id": "login"})
```

```text
$ pytest -q tests/test_mocker_fail.py --tb=short
F                                                                        [100%]
=================================== FAILURES ===================================
_______________________________ test_wrong_args ________________________________
tests/test_mocker_fail.py:9: in test_wrong_args
    fake.assert_called_once_with({"id": "login"})
E   AssertionError: expected call not found.
E   Expected: render({'id': 'login'})
E     Actual: render({'id': 'signup'})
E   
E   pytest introspection follows:
E   
E   Args:
E   assert ({'id': 'signup'},) == ({'id': 'login'},)
E     
E     At index 0 diff: {'id': 'signup'} != {'id': 'login'}
E     Use -v to get more diff
=========================== short test summary info ============================
FAILED tests/test_mocker_fail.py::test_wrong_args - AssertionError: expected ...
1 failed in 0.02s
```

Третя перевага в тому, що `mocker` це звичайна фікстура, тож патч можна сховати в іншу фікстуру в `conftest.py` і отримувати готовий мок за іменем параметра, як будь-яку залежність з m3-l03. З `unittest.mock.patch` для цього довелося б писати `yield` усередині `with`. Через ці три причини в pytest-проєктах `patch` напряму пишуть рідко; в уроці далі він лишається там, де код має запускатися без pytest, наприклад у браузерних завданнях.

```python
# tests/conftest.py
from unittest.mock import MagicMock

import pytest
from pytest_mock import MockerFixture


@pytest.fixture
def fake_render(mocker: MockerFixture) -> MagicMock:
    return mocker.patch("formbuilder.cli.render", autospec=True, return_value="<x>")


# tests/test_fixture_mock.py
from unittest.mock import MagicMock

from formbuilder import cli


def test_build_uses_renderer(fake_render: MagicMock) -> None:
    assert cli.build({"id": "signup"}) == "built 3 bytes"
    fake_render.assert_called_once_with({"id": "signup"})


def test_build_uses_renderer_by_keyword(fake_render: MagicMock) -> None:
    cli.build({"id": "signup"})
    fake_render.assert_called_once_with(config={"id": "signup"})
```

```text
$ pytest -q tests/test_fixture_mock.py
..                                                                       [100%]
2 passed in 0.01s
```

Другий тест заодно показує `autospec=True` у патчі: `build` викликав `render` позиційно, а асерт з `config=` проходить, бо порівняння йде через сигнатуру справжньої функції.

## Час, випадковість і `async`-функції

`datetime.now` і `time.time` це класичні кандидати на мок, і перша спроба зазвичай невдала: `datetime.datetime` написаний на C, і його атрибути не можна переприсвоїти. Робочий шлях за правилом попереднього розділу: патчити ім'я `datetime` у модулі, який його імпортував. Але тоді мокається весь клас: будь-яке `datetime(...)`, `datetime.fromisoformat(...)` чи `isinstance(x, datetime)` у цьому модулі тепер працює з моком.

```python
from datetime import UTC, datetime
from unittest.mock import patch

FIXED = datetime(2026, 10, 18, 9, 30, tzinfo=UTC)


def build_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M")


def parse_published(raw: str) -> datetime:
    return datetime.fromisoformat(raw)


try:
    with patch("datetime.datetime.now", return_value=FIXED):
        pass
except TypeError as e:
    print("TypeError:", e)

with patch(f"{__name__}.datetime") as fake_dt:
    fake_dt.now.return_value = FIXED
    print(build_stamp())
    print(type(parse_published("2026-01-01T00:00:00")).__name__)
```

```text
TypeError: cannot set 'now' attribute of immutable type 'datetime.datetime'
20261018-0930
MagicMock
```

> **Пастка.** `FIXED` створено до патча не випадково. Усередині `with` рядок `datetime(2026, 10, 18, ...)` у цьому модулі повернув би `MagicMock`, і `strftime` повернув би ще один мок замість рядка. Мок класу, а не функції, тихо заражає все, що цей клас використовує.

Чистіший шлях без патча: зробити годинник залежністю. Функція приймає `now: Callable[[], datetime]` зі справжнім значенням за замовчуванням, тест передає `lambda: FIXED`. Коли годинник розкиданий по чужому коду, беруть бібліотеку: `freezegun` підміняє `datetime` в усіх завантажених модулях, `time-machine` перехоплює системний час на рівні C і тому працює швидше; обидві ставляться як dev-залежності й тут не потрібні.

```python live
import random
from collections.abc import Callable
from datetime import UTC, datetime


def build_stamp(now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> str:
    return now().strftime("%Y%m%d-%H%M")


def slug_suffix(rng: random.Random, length: int = 6) -> str:
    return "".join(rng.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=length))


fixed = datetime(2026, 10, 18, 9, 30, tzinfo=UTC)
print(build_stamp(lambda: fixed))
print(len(build_stamp()))
print(slug_suffix(random.Random(42)), slug_suffix(random.Random(42)))
```

```text
20261018-0930
13
xaji0y xaji0y
```

З випадковістю те саме. `random.seed(42)` у тесті налаштовує глобальний генератор, спільний для всього процесу: будь-який інший код, що звертався до `random` раніше, зсуває послідовність, і результат залежить від порядку тестів. Окремий `random.Random(seed)`, переданий параметром, детермінований і ні з чим не ділиться станом. Для `uuid.uuid4` і `secrets` діє правило з `patch`: патчити ім'я там, де його викликають, або передати генератор параметром.

Асинхронні функції потребують окремого мока. `async def` і `await` читаються як у JS; відмінність, яка тут важлива, одна: виклик `async def`-функції повертає корутину (coroutine, офіційний термін), і нічого не виконується, доки її не `await`-нуть, а цикл подій запускається явно через `asyncio.run(main())` (детально в m5-l05). Звичайний `Mock()` при виклику повертає `Mock`, а на ньому `await` падає. `AsyncMock` при виклику повертає корутину, `await` дає `return_value` або спрацьовує `side_effect`, а перевірки мають пару з `awaited`: `assert_awaited_once_with`, `await_count`, `await_args`.

```python live
import asyncio
from unittest.mock import AsyncMock, Mock


async def release(publisher, slug: str, html: str) -> str:
    url = await publisher.publish(slug, html)
    return f"released {url}"


async def main() -> None:
    pub = Mock()
    pub.publish = AsyncMock(return_value="https://cdn.test/signup.html")
    print(await release(pub, "signup", "<form>"))
    pub.publish.assert_awaited_once_with("signup", "<form>")
    print(pub.publish.await_count, pub.publish.await_args)

    try:
        await release(Mock(), "signup", "<form>")
    except TypeError as e:
        print("TypeError:", e)

asyncio.run(main())
```

```text
released https://cdn.test/signup.html
1 call('signup', '<form>')
TypeError: object Mock can't be used in 'await' expression
```

Руками ставити `AsyncMock` рідко доводиться: `spec`, `autospec`, `patch` і `mocker.patch` дивляться на оригінал і для `async def` самі створюють `AsyncMock`. Протокол з асинхронним методом теж підходить.

```python live
from typing import Protocol
from unittest.mock import Mock, create_autospec


class Publisher(Protocol):
    async def publish(self, slug: str, html: str) -> str: ...


print(type(Mock(spec=Publisher).publish).__name__)
print(type(create_autospec(Publisher, instance=True).publish).__name__)
```

```text
AsyncMock
AsyncMock
```

> **Пастка.** `assert_called_once_with` на `AsyncMock` перевіряє лише, що мок викликали, а не що результат дочекались. Код, який забув `await`, створює корутину й викидає її: `assert_called_*` проходить, `assert_awaited_*` падає, а Python лише друкує `RuntimeWarning` у stderr, яке легко не помітити серед виводу pytest. Для асинхронних залежностей перевіряйте `awaited`.

```python
import asyncio
from unittest.mock import AsyncMock, Mock


async def release_buggy(publisher, slug: str, html: str) -> str:
    publisher.publish(slug, html)              # забули await
    return "released"


async def main() -> None:
    pub = Mock()
    pub.publish = AsyncMock()
    print(await release_buggy(pub, "signup", "<form>"))
    pub.publish.assert_called_once_with("signup", "<form>")
    print("assert_called_once_with: ok")
    try:
        pub.publish.assert_awaited_once_with("signup", "<form>")
    except AssertionError as e:
        print("AssertionError:", e)

asyncio.run(main())
```

```text
released
assert_called_once_with: ok
AssertionError: Expected publish to have been awaited once. Awaited 0 times.
```

У stderr того самого запуску (шлях до файлу скорочено):

```text
.../release_buggy.py:6: RuntimeWarning: coroutine 'AsyncMockMixin._execute_mock_call' was never awaited
  publisher.publish(slug, html)              # забули await
RuntimeWarning: Enable tracemalloc to get the object allocation traceback
```

Для HTTP-клієнтів мокати методи `httpx.AsyncClient` через `AsyncMock` не треба: у httpx є `MockTransport`, який підставляє відповіді на рівні транспорту (m5-l07), а тести API з `AsyncClient` розібрані в m7-l05.

<!-- task: q3 -->

## Fake замість Mock: перевіряти стан, а не виклики

Fake це справжня реалізація протоколу з m2-l07, тільки в пам'яті: `MemoryPublisher` кладе сторінки в словник. Тест з моком перевіряє взаємодію ("`publish` дочекались з такими аргументами"), тест з fake перевіряє результат ("після генерації сторінка з цим slug існує й містить цей HTML"). Різниця відчувається при рефакторингу: якщо `generate` почне публікувати через інший метод або двома викликами замість одного, мок-тест падає, хоча поведінка та сама, а fake-тест падає лише тоді, коли сторінки справді немає. І fake перевіряє mypy на відповідність протоколу, а мок ніхто не перевіряє.

```python live
import asyncio
from typing import Protocol


class Renderer(Protocol):
    def render(self, element: dict[str, str]) -> str: ...


class Publisher(Protocol):
    async def publish(self, slug: str, html: str) -> str: ...


class TextRenderer:
    def render(self, element: dict[str, str]) -> str:
        return f"{element['kind']}:{element['id']}"


class MemoryPublisher:
    def __init__(self) -> None:
        self.pages: dict[str, str] = {}

    async def publish(self, slug: str, html: str) -> str:
        self.pages[slug] = html
        return f"memory://{slug}"


async def generate(
    slug: str, elements: list[dict[str, str]], renderer: Renderer, publisher: Publisher
) -> str:
    if not elements:
        raise ValueError(f"form {slug!r} has no elements")
    html = "\n".join(renderer.render(el) for el in elements)
    return await publisher.publish(slug, html)


async def main() -> None:
    pub = MemoryPublisher()
    form = [{"kind": "input", "id": "email"}, {"kind": "button", "id": "send"}]
    print(await generate("signup", form, TextRenderer(), pub))
    print(pub.pages)

asyncio.run(main())
```

```text
memory://signup
{'signup': 'input:email\nbutton:send'}
```

Тут спрощений `Renderer` з одним аргументом; у капстоуні сигнатура `render(element, theme)` з m2-l07, нижче в розділі "Для капстоуну". Fake кращий, коли залежність має стан, який тест хоче прочитати (сховище, черга, публікатор), коли та сама підміна потрібна в десятках тестів, і коли залежність простіша за свій мок. Мок кращий, коли взаємодія і є поведінкою (лист має піти рівно один раз, повторів не має бути), коли потрібно один раз вкинути помилку через `side_effect`, і коли в залежності сто методів, а тесту потрібен один. На практиці в одному тесті часто поєднують обидва: fake для того, що рахує, мок для того, що має зламатися.

<!-- task: t5 -->

## coverage: виконаний рядок не означає перевірений

coverage.py ставить хук трасування інтерпретатора й записує кожен виконаний рядок, а з `--cov-branch` ще й кожен перехід між рядками. У pytest його підключає плагін `pytest-cov` (`uv add --dev pytest-cov`): `--cov=formbuilder` каже, який пакет міряти, `--cov-report=term-missing` друкує номери непокритих рядків. Аналог `jest --coverage` на Istanbul, з однією відмінністю, яка нижче.

Демо-модуль з двох функцій і чотири тести, що виглядають нормально.

```python
# formbuilder/publish.py
from collections.abc import Callable


def page_url(slug: str, cdn: str | None = None) -> str:
    base = "https://forms.example.com"
    if cdn:
        base = cdn.rstrip("/")
    return f"{base}/{slug}.html"


def release(slug: str, html: str, upload: Callable[[str, str], str]) -> str:
    if not html:
        raise ValueError("empty page")
    return upload(f"{slug}.html", html)


# tests/test_publish.py
from unittest.mock import Mock

import pytest
from pytest_mock import MockerFixture

from formbuilder import publish
from formbuilder.publish import page_url, release


def test_page_url_with_cdn() -> None:
    assert page_url("signup", "https://cdn.test/") == "https://cdn.test/signup.html"


def test_release_calls_upload() -> None:
    upload = Mock(return_value="https://cdn.test/signup.html")
    release("signup", "<form>", upload)


def test_upload_error_propagates() -> None:
    upload = Mock(side_effect=ConnectionError("cdn down"))
    with pytest.raises(Exception):
        release("signup", "", upload)


def test_release_returns_url(mocker: MockerFixture) -> None:
    mocker.patch("formbuilder.publish.release", return_value="https://cdn.test/signup.html")
    assert publish.release("signup", "<form>", Mock()) == "https://cdn.test/signup.html"
```

```text
$ pytest -q --cov=formbuilder --cov-report=term-missing
....                                                                     [100%]
================================ tests coverage ================================
______________ coverage: platform darwin, python 3.12.12-final-0 _______________

Name                      Stmts   Miss  Cover   Missing
-------------------------------------------------------
formbuilder/__init__.py       0      0   100%
formbuilder/publish.py       10      0   100%
-------------------------------------------------------
TOTAL                        10      0   100%
4 passed in 0.02s
```

```text
$ pytest -q --cov=formbuilder --cov-branch --cov-report=term-missing
....                                                                     [100%]
================================ tests coverage ================================
______________ coverage: platform darwin, python 3.12.12-final-0 _______________

Name                      Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------------------
formbuilder/__init__.py       0      0      0      0   100%
formbuilder/publish.py       10      0      4      1    93%   6->8
---------------------------------------------------------------------
TOTAL                        10      0      4      1    93%
4 passed in 0.02s
```

Колонки: `Stmts` інструкції, `Miss` невиконані, `Branch` кількість можливих переходів, `BrPart` гілки, з яких пройдено лише один бік, `Missing` номери рядків і переходи. `6->8` означає перехід з рядка 6 (`if cdn:`) одразу на рядок 8: випадок без CDN жоден тест не пройшов. Без `--cov-branch` усі рядки виконані, тож 100%. Istanbul у Jest рахує гілки завжди, coverage.py лише за запитом, тому `branch = true` варто одразу записати в конфіг.

Тепер про те, чого coverage не бачить. Усі чотири тести вище нічого корисного не перевіряють, а покриття рядків 100%. `test_release_calls_upload` це мок без асерта: `release` могла б не викликати `upload` зовсім. `test_upload_error_propagates` задає `side_effect`, який ніколи не спрацьовує: порожній `html` дає `ValueError` ще до `upload`, широкий `pytest.raises(Exception)` його ловить, і тест ще й зараховує собі рядок з `raise`. `test_release_returns_url` це асерт на моку замість поведінки: тест патчить саму функцію, яку нібито перевіряє, і переконується, що мок повертає те, що в нього поклали; справжній `release` у ньому не виконується взагалі. Перевірка цього твердження: ламаємо `release` так, щоб він не публікував нічого.

```python
def release(slug: str, html: str, upload: Callable[[str, str], str]) -> str:
    if not html:
        raise ValueError("empty page")
    return ""
```

```text
$ pytest -q
....                                                                     [100%]
4 passed in 0.01s
```

> **Пастка.** coverage міряє, що код виконався під час тестів, а не що якийсь тест перевірив результат. До того ж це сума по всіх тестах: якщо інший тест уже проходить рядок, зламаний тест на тому самому рядку ніяк не видно. Лікує не coverage, а звичка: кожен мок закінчується `assert_*` на ньому або асертом на результаті, `pytest.raises` завжди з конкретним типом і `match=`, а новий тест хоча б раз бачити червоним (зламати код руками й переконатися, що тест падає). Систематично це робить мутаційне тестування (`mutmut`), одним реченням: інструмент сам вносить такі поломки й рахує, скільки з них тести не помітили.

Налаштування живуть у `pyproject.toml`, і тоді в командному рядку достатньо `--cov` без аргументу. `fail_under` валить запуск, якщо покриття нижче порогу; `exclude_also` додає шаблони рядків, які не рахуються; `# pragma: no cover` у кінці рядка виключає рядок або весь блок, що з нього починається, а `# pragma: no branch` прибирає з підрахунку лише гілки цього рядка; `--cov-report=html` пише інтерактивний звіт у `htmlcov/index.html`, де непокриті рядки й гілки підсвічені прямо в коді.

```toml
[tool.coverage.run]
branch = true
source = ["formbuilder"]

[tool.coverage.report]
show_missing = true
skip_covered = true
fail_under = 95
exclude_also = [
    'if __name__ == "__main__":',
]
```

```text
$ pytest -q --cov --cov-report=term-missing --cov-report=html
....
ERROR: Coverage failure: total of 93 is less than fail-under=95
                                                                         [100%]
================================ tests coverage ================================
______________ coverage: platform darwin, python 3.12.12-final-0 _______________

Name                     Stmts   Miss Branch BrPart  Cover   Missing
--------------------------------------------------------------------
formbuilder/publish.py      10      0      4      1    93%   6->8
--------------------------------------------------------------------
TOTAL                       10      0      4      1    93%

1 file skipped due to complete coverage.
Coverage HTML written to dir htmlcov
FAIL Required test coverage of 95.0% not reached. Total coverage: 92.86%
4 passed in 0.03s
```

Чому 100% не мета. Останні відсотки зазвичай коштують тестів на захисні гілки, які ніколи не виконаються, і `pragma` на кожному кроці, а цифра при цьому нічого не каже про якість асертів, як показала демонстрація. Корисні два режими. Звіт `term-missing` або HTML як карта: де немає жодного тесту, і чи там справді нічого важливого. `fail_under` як храповик: поставити поточне значення, щоб воно не падало непомітно, і піднімати, коли покриття зросло. Непокрита гілка (`BrPart`) часто цікавіша за непокритий рядок: це `if` без `else`, де "інакше" ніхто не перевіряв, або `match`, де жоден `case` не спрацював.

<!-- task: q4 -->

## Для капстоуну

У капстоуні один крок генерації це "відрендерити форму й опублікувати сторінку". Рендерер уже є з m2-l07 (`Renderer` з методом `render(element, theme)`), публікатор з'являється тут як ще один Protocol з асинхронним методом у `publisher.py`: сьогодні він пише в локальну директорію, пізніше в тому самому модулі з'являться `HttpPublisher` (m5-l07) і `StaticPublisher` з версіями (m6-l01). Сам крок живе в `generate.py`. Воркер з m5-l05 викликатиме саме цю функцію. Обидві залежності приходять параметрами, тож тести не патчать нічого всередині `generate`.

```python
# src/formbuilder/publisher.py
"""Where generated pages go: a Protocol and a local-directory implementation."""

from pathlib import Path
from typing import Protocol


class Publisher(Protocol):
    async def publish(self, slug: str, html: str) -> str: ...


class DirPublisher:
    """Writes pages into a local directory and returns a file:// URL."""

    def __init__(self, root: Path) -> None:
        self.root = root

    async def publish(self, slug: str, html: str) -> str:
        path = self.root / f"{slug}.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8")
        return path.as_uri()
```

```python
# src/formbuilder/generate.py
"""One generation step: render a form and publish the page."""

from collections.abc import Sequence

from formbuilder.domain import Element, Theme
from formbuilder.publisher import Publisher
from formbuilder.renderers import Renderer


async def generate(
    slug: str,
    elements: Sequence[Element],
    theme: Theme,
    renderer: Renderer,
    publisher: Publisher,
) -> str:
    if not elements:
        raise ValueError(f"form {slug!r} has no elements")
    html = "\n".join(renderer.render(el, theme) for el in elements)
    return await publisher.publish(slug, html)
```

Тест кроку поєднує все з уроку: fake-рендерер (клас у тесті без жодного наслідування, mypy перевіряє його на відповідність `Renderer`), `AsyncMock` для публікатора через `create_autospec` від протоколу (сигнатура перевіряється, `publish` автоматично асинхронний), `asyncio.run` усередині звичайного тесту, щоб не ставити `pytest-asyncio` заради одного файлу. `DirPublisher` тестується без моків взагалі: `tmp_path` дає справжню директорію, а справжній файл перевіряє і шлях, і кодування, і `mkdir`.

```python
# tests/test_generate.py
import asyncio
from pathlib import Path
from unittest.mock import create_autospec

from formbuilder.domain import Element, Theme
from formbuilder.generate import generate
from formbuilder.publisher import DirPublisher, Publisher

FORM = [
    Element(type="input", id="email", name="email", label="Email"),
    Element(type="button", id="send", label="Send"),
]
LIGHT = Theme(mode="light", primary_color="#0066cc")


class FakeRenderer:
    def render(self, element: Element, theme: Theme) -> str:
        return f"{element.type}:{element.id}[{theme.mode}]"


def test_generate_publishes_rendered_page() -> None:
    publisher = create_autospec(Publisher, instance=True)
    publisher.publish.return_value = "https://cdn.test/signup.html"

    url = asyncio.run(generate("signup", FORM, LIGHT, FakeRenderer(), publisher))

    assert url == "https://cdn.test/signup.html"
    publisher.publish.assert_awaited_once_with(
        "signup", "input:email[light]\nbutton:send[light]"
    )


def test_dir_publisher_writes_file(tmp_path: Path) -> None:
    publisher = DirPublisher(tmp_path / "dist")

    url = asyncio.run(publisher.publish("signup", "<form></form>"))

    page = tmp_path / "dist" / "signup.html"
    assert page.read_text(encoding="utf-8") == "<form></form>"
    assert url == page.as_uri()
```

CLI з m0-l06 дає готовий приклад правила "патчити там, де шукають" на справжньому коді: `cli.py` пише `from formbuilder import __version__`, тож версію для тесту треба підміняти в `formbuilder.cli`, а патч `formbuilder.__version__` до `main` не доходить. Вивід перевіряється через `capsys` з m3-l03, без моків `print`.

```python
# tests/test_cli.py
import pytest
from pytest_mock import MockerFixture

from formbuilder.cli import main


def test_version_is_read_from_cli_namespace(
    mocker: MockerFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    mocker.patch("formbuilder.cli.__version__", "9.9.9")
    main(["--version"])
    assert capsys.readouterr().out == "formbuilder 9.9.9\n"


def test_patching_package_attribute_does_not_reach_cli(
    mocker: MockerFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    mocker.patch("formbuilder.__version__", "9.9.9")
    main(["--version"])
    assert capsys.readouterr().out == "formbuilder 0.1.0\n"
```

Coverage для капстоуну налаштовується один раз у `pyproject.toml`. `__main__.py` з трьох рядків виключено через `omit`: він лише викликає `main`, а `main` покрито напряму.

```toml
[tool.coverage.run]
branch = true
source = ["formbuilder"]
omit = ["*/__main__.py"]

[tool.coverage.report]
show_missing = true
skip_covered = true
fail_under = 95
```

```text
$ uv run pytest -q --cov
...........                                                              [100%]
================================ tests coverage ================================
______________ coverage: platform darwin, python 3.12.12-final-0 _______________

Name                           Stmts   Miss Branch BrPart  Cover   Missing
--------------------------------------------------------------------------
src/formbuilder/renderers.py      24      1      6      2    90%   33, 34->exit
--------------------------------------------------------------------------
TOTAL                             58      1     12      2    96%

3 files skipped due to complete coverage.
Required test coverage of 95.0% reached. Total coverage: 95.71%
11 passed in 0.07s
```

Прогін зроблено на еталонному розв'язку p1 і p2 (тести вище плюс помилкові шляхи й `--help`) і з тестами `HtmlRenderer` лише на `input` і `text`, у ранній версії еталона, де рендерери лежали одним модулем `renderers.py`; у капстоуні той самий рядок буде в `renderers/html.py`, а номери й відсотки будуть інші. Цікавий тут `34->exit`. Рядок 34 це `case "text":` у `match` з m2-l07, а `exit` означає вихід з функції. coverage каже, що жоден тест не пройшов шлях, де `kind` не збігся з жодним `case` і функція неявно повернула `None`. mypy знає, що такого шляху немає, бо `kind` це `Literal` з трьох значень; coverage про типи не знає. Такий перехід не варто закривати тестом з невалідним `kind`, який обходить типи. Його позначають коментарем `# pragma: no branch` на рядку `case "text":`, після чого `34->exit` зникає зі звіту, а `BrPart` для файлу стає 1; або свідомо залишають у звіті.

> **Для капстоуну.** Дві нові dev-залежності додаються одним рядком: `uv add --dev pytest-mock pytest-cov`. Обидві потрапляють у `[dependency-groups] dev` і в `uv.lock`, у пакет `formbuilder` вони не входять (різниця груп і extras у m3-l02).

<!-- task: p1 -->

<!-- task: p2 -->

<!-- task: p3 -->

## Типові помилки JS-розробника

1. **`jest.mock("module")` цілим модулем.** Пишуть `patch("formbuilder.render")`, очікуючи, що всі функції модуля стануть моками. Насправді підміняється атрибут `render` пакета `formbuilder`, а `cli`, який зробив `from formbuilder.render import render`, далі тримає справжню функцію. Правильно: патчити конкретне ім'я там, де його викликають.

   ```python
   mocker.patch("formbuilder.render")              # за звичкою: cli цього не бачить
   mocker.patch("formbuilder.cli.render")          # правильно
   ```

2. **Чекати автомоків і папки `__mocks__`.** Такого механізму немає: модуль не підміняється сам лише тому, що поруч лежить файл. Правильно: fake-клас у `tests/` або фікстура в `conftest.py`, яка повертає готовий мок, і передача залежності параметром.

   ```python
   @pytest.fixture
   def publisher() -> MemoryPublisher:
       return MemoryPublisher()
   ```

3. **Патчити там, де визначено, бо "імпорт це жива прив'язка".** В ESM так, у Python `from x import y` копіює посилання в момент імпорту. Патч у `formbuilder.render` не бачить ніхто, хто імпортував ім'я раніше.

   ```python
   from formbuilder.render import render   # у cli.py: окреме ім'я cli.render
   patch("formbuilder.render.render")      # змінює render.render, не cli.render
   ```

4. **Очікувати, що мок без `spec` впаде на неіснуючому методі.** `Mock()` створить `pubish` так само охоче, як `publish`, і тест пройде з опечаткою в коді. Правильно: `create_autospec(Cls, instance=True)` або `patch(..., autospec=True)` для всього, що стоїть на місці справжнього класу.

   ```python
   pub = create_autospec(Publisher, instance=True)
   pub.pubish("signup", "<form>")   # AttributeError: Mock object has no attribute 'pubish'
   ```

5. **Асерти в стилі Jest або без дужок.** `pub.publish.toHaveBeenCalledWith(...)` і `pub.publish.assert_called_once` нічого не перевіряють і не падають. Правильно: методи `assert_*` з дужками, а для асинхронних залежностей `assert_awaited_*`, бо `assert_called_*` не помічає пропущений `await`.

   ```python
   pub.publish.assert_awaited_once_with("signup", "<form>")
   ```

6. **`jest.useFakeTimers()` як рефлекс на час.** Пробують `patch("datetime.datetime.now")` і отримують `TypeError: cannot set 'now' attribute of immutable type`. Патч імені `datetime` у модулі працює, але мокає весь клас. Правильно: годинник параметром, або `time-machine` / `freezegun`, коли час читає чужий код.

   ```python
   def build_stamp(now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> str: ...
   build_stamp(lambda: FIXED)
   ```

7. **Мок без асерта і `pytest.raises(Exception)`.** Тест проходить, coverage рахує рядки, а поведінку ніхто не перевірив. Правильно: кожен мок закінчується `assert_*` або асертом на результаті, `pytest.raises` з конкретним типом і `match=`, новий тест хоча б раз побачити червоним.

   ```python
   with pytest.raises(ConnectionError, match="cdn down"):
       release("signup", "<form>", upload)
   upload.assert_called_once_with("signup.html", "<form>")
   ```

## Підсумок

- Мок потрібен на межі з тим, що тест не контролює: мережа, процеси, годинник, випадковість, платні сервіси. Власний код не мокають, а передають залежність параметром.
- `Mock` погоджується на все: будь-який атрибут, будь-який виклик, і будь-який неіснуючий асерт. `create_autospec` або `autospec=True` за замовчуванням.
- `side_effect`: виняток кидається, iterable віддається по одному (після кінця `StopIteration`), функція викликається замість мока. Він сильніший за `return_value`.
- `MagicMock` це `Mock` зі спеціальними методами; `patch` створює його сам, а для `async def` створює `AsyncMock`.
- `patch` це тимчасовий `setattr` на модулі. Патчити там, де ім'я шукають: `from x import y` створює окреме ім'я в модулі, що імпортує.
- У pytest `mocker` замість `patch`: без `with` і декораторів, знімається сам, комбінується з фікстурами, дає кращі повідомлення. `mocker.spy` це `jest.spyOn`.
- `datetime.datetime.now` не патчиться; годинник і `random.Random` передають параметром.
- Для асинхронних залежностей `AsyncMock` і `assert_awaited_*`; `assert_called_*` пропущений `await` не ловить.
- Fake перевіряє стан і переживає рефакторинг, мок перевіряє взаємодію; fake перевіряє mypy, мок ніхто.
- coverage міряє виконання, не перевірку. `branch = true` одразу, `fail_under` як храповик, 100% не мета.

## Що далі

m3-l05 про doctest: приклади в docstring, які виконує той самий pytest, тож `uv run pytest --cov` з цього уроку стане однією командою для тестів і документації. Крок `generate` з `Publisher` і тести з `AsyncMock` знадобляться в m5-l05, де воркер генерації викликатиме його з черги, а правило "патчити там, де шукають" і `mocker` повернуться в m7-l05 у тестах FastAPI.
