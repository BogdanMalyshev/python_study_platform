---
id: m6-l04
module: m6-stdlib-cli
title: "re проти JS RegExp: ті самі вирази, інший API"
summary: "Учень переносить знання JS RegExp на модуль re: вибирає між search, match, fullmatch, findall, finditer, sub і split замість прапорця g, пише шаблони в raw-рядках з іменованими групами й verbose-режимом, знає синтаксичні розбіжності ($, lookbehind, Unicode-класи), розпізнає катастрофічний backtracking і типізує результат як re.Match[str] | None."
duration_min: 75
prerequisites: [m6-l03]
---

## Регулярний вираз це рядок: `r"..."`, компіляція і кеш

Літерала регулярного виразу в Python немає. `/(\d+)px/` у JS це окремий синтаксис, який парсер розбирає разом з кодом. У Python шаблон це звичайний `str`, а все інше дають функції модуля `re` і об'єкт `re.Pattern`, який повертає `re.compile`. Прапорці теж не суфікс після `/`, а аргумент функції.

```ts
const size = /(\d+)px/;
console.log(size.test("16px"));             // true
console.log("w: 16px".match(size)?.[1]);    // "16"
```

```python
import re

size = re.compile(r"(\d+)px")
print(size.search("16px") is not None)
print(size.search("w: 16px")[1])
```

```text
True
16
```

Розходиться розташування методів. У JS пошук розкиданий між `RegExp.prototype` (`test`, `exec`) і `String.prototype` (`match`, `matchAll`, `replace`, `split`, `search`). У Python усе живе в `re`: кожна операція є і методом скомпільованого шаблону `size.search(text)`, і функцією модуля `re.search(pattern, text)`, яка приймає шаблон рядком. Методів регулярних виразів у `str` немає зовсім.

Через те, що шаблон це рядок, зворотну скісну риску обробляють двічі: спершу парсер рядкового літерала, потім сам `re`. Для `\d` чи `\w` це минає майже безболісно, бо Python лишає невідому escape-послідовність як є і лише попереджає `SyntaxWarning` (m1-l04). Але `\b` це валідна послідовність рядка, символ backspace з кодом 8, і до `re` доходить уже він, а не межа слова. Помилки немає, попередження немає, збігів теж немає. Префікс `r` робить raw-рядок (raw string, офіційна назва), у якому риска звичайний символ, і `re` отримує рівно те, що написано. Тому шаблони пишуть `r"..."` завжди, навіть коли рисок немає: так видно, що рядок призначений для `re`.

```python live
import re

print(repr("\bcat\b"), repr(r"\bcat\b"))
print(re.findall("\bcat\b", "cat concat"))
print(re.findall(r"\bcat\b", "cat concat"))
print(re.findall("\\bcat\\b", "cat concat"))
```

```text
'\x08cat\x08' '\\bcat\\b'
[]
['cat']
['cat']
```

> **JS-аналог.** Та сама подвійна обробка є в JS, коли шаблон збирають рядком: `new RegExp("\\d+")` потребує подвоєних рисок, а `new RegExp("\bcat\b")` так само мовчки шукає backspace. Літерал `/.../` від цього рятує. У Python літерала немає, тому роль `/.../` виконує `r"..."`.

> **Пастка.** Тиха поломка без `r` стосується не лише `\b`. Зворотне посилання `\1` у звичайному рядку стає символом з кодом 1, і шаблон `"(a)\1"` шукає `a` плюс невидимий символ.

```python
import re

print(repr("(a)\1"))
print(re.findall("(a)\1", "aa"), re.findall(r"(a)\1", "aa"))
```

```text
'(a)\x01'
[] ['a']
```

<!-- task: q1 -->

Функції модуля на кшталт `re.search(r"\d+", text)` не компілюють шаблон щоразу заново. `re` тримає кеш скомпільованих шаблонів за ключем (тип, шаблон, прапорці), тож другий виклик з тим самим рядком дістає готовий об'єкт. Звідси наслідок, який виглядає дивно: `re.compile` з тим самим аргументом повертає той самий об'єкт. Розмір кешу 512 записів у 3.12 (`re._MAXCACHE`, деталь реалізації, а не гарантія).

```python live
import re

print(re.compile(r"\d+") is re.compile(r"\d+"))
print(re._MAXCACHE)

pattern = re.compile(r"(\d+)px", re.I)
print(pattern.pattern, pattern.groups)
print(re.RegexFlag(pattern.flags))
```

```text
True
512
(\d+)px 1
re.IGNORECASE|re.UNICODE
```

Тому явний `re.compile` рідко дає помітний виграш у швидкості: він економить лише пошук у кеші. Компілюють заради іншого. Шаблон отримує ім'я, яке читається в коді (`NAME_RE.fullmatch(name)` замість рядка з рисками посеред функції), і тип, який можна передати у функцію. Прапорці прибиваються до шаблону один раз, і їх не можна забути на одному з десяти викликів. Помилка в шаблоні вилітає під час імпорту модуля, а не в рідкісній гілці під навантаженням. І лише методи `Pattern` приймають `pos` і `endpos`. Практичне правило: шаблон, який використовується більше одного разу, стає константою модуля `SOMETHING_RE = re.compile(...)`.

> **Під капотом.** `re.compile` розбирає рядок на дерево (модуль `re._parser`), перетворює його на байт-код (`re._compiler`) і віддає C-рушію `_sre`, який виконує цей байт-код з поверненнями назад (backtracking, офіційний термін документації). Це той самий клас рушіїв, що Irregexp у V8, тому семантика жадібності, альтернатив і груп збігається з JS, а розбіжності сидять в API і в окремих конструкціях синтаксису. У Pyodide працює той самий `_sre`, скомпільований у WebAssembly.

Коли шаблон збирають з даних, спецсимволи в даних треба екранувати. `re.escape` робить те саме, що `RegExp.escape` (з'явився в ES2025, у Node 24 уже є). Без нього крапка в розширенні файлу означає "будь-який символ".

```python live
import re

ext = ".tar.gz"
print(re.escape(ext))
print(re.search(ext + r"\Z", "archive_tar.gz") is not None)
print(re.search(re.escape(ext) + r"\Z", "archive_tar.gz") is not None)

prefix = "v1.2"
print(re.findall(rf"{re.escape(prefix)}\.\d{{2}}", "v1.2.10 v1x2.10 v1.2.5"))
```

```text
\.tar\.gz
True
False
['v1.2.10']
```

> **Пастка.** У `rf"..."` фігурні дужки належать f-рядку. Квантифікатор `\d{2}` треба писати `\d{{2}}`, інакше f-рядок обчислить вираз `{2}` і підставить число 2, а `\d2` шукає цифру, за якою йде двійка. Якщо в шаблоні багато квантифікаторів з дужками, простіше склеїти `re.escape(prefix) + r"\.\d{2}"`.

## `search`, `match`, `fullmatch` і об'єкт `Match`

Три функції шукають один збіг і відрізняються лише прив'язкою. `search` шукає будь-де в рядку, це `exec`, `test` і `String.prototype.match` без `g`. `match` прив'язаний до початку рядка, але не до кінця, як шаблон з `^` попереду. `fullmatch` вимагає, щоб шаблон покрив увесь рядок. Найближчий аналог `fullmatch` у JS це `^(?:...)$`, і він не точний, про що нижче. Результат у всіх трьох або `None`, або об'єкт `re.Match`.

```ts
const digits = /\d+/;
console.log(digits.test("id: 42"));           // true
console.log("id: 42".match(digits)?.[0]);     // "42"
console.log("id: 42".search(digits));         // 4
console.log(/^\d+$/.test("42 id"));           // false
```

```python live
import re

print(re.search(r"\d+", "id: 42"))
print(re.match(r"\d+", "id: 42"))
print(re.match(r"\d+", "42 id"))
print(re.fullmatch(r"\d+", "42 id"), re.fullmatch(r"\d+", "42"))
print(re.search(r"\d+", "id: 42").start())
```

```text
<re.Match object; span=(4, 6), match='42'>
None
<re.Match object; span=(0, 2), match='42'>
None <re.Match object; span=(0, 2), match='42'>
4
```

Головна пастка тут у назві: `re.match` і `String.prototype.match` роблять різне. JS-ний `match` шукає будь-де; Python-ний `match` перевіряє лише початок, тому `re.match(r"\d+", "id: 42")` дає `None`. Якщо рука тягнеться написати `re.match`, щоб "знайти", потрібен `search`. Окремого `test` немає: перевірка на збіг це `is not None` або truthiness результату, бо `Match` завжди істинний, а `None` хибний.

`fullmatch` не те саме, що `^...$`, у двох місцях. Перше: `^a|ab$` читається як `(^a)|(ab$)`, тому якорі треба загортати в групу, а `fullmatch` застосовує вимогу "до кінця" до шаблону цілком і за потреби відступає в іншу гілку альтернативи. Друге, ще підступніше, `$` у Python має власну семантику (розділ про синтаксис нижче). Для валідації рядка цілком у Python пишуть `fullmatch` без якорів.

```python
import re

print(re.match(r"a|ab", "ab"))
print(re.fullmatch(r"a|ab", "ab"))
print(re.search(r"^a|b$", "xb"))
```

```text
<re.Match object; span=(0, 1), match='a'>
<re.Match object; span=(0, 2), match='ab'>
<re.Match object; span=(1, 2), match='b'>
```

<!-- task: q2 -->

Об'єкт `Match` (match object, офіційна назва) замінює масив, який повертає `exec` у JS. Замість `m[0]`, `m[1]`, `m.index`, `m.groups` і `m.indices` (прапорець `d`) тут методи: `group()` повертає весь збіг або групи за номером чи ім'ям, `groups()` кортеж усіх груп, `groupdict()` словник іменованих, `span()`, `start()`, `end()` позиції, причому позиції є завжди, без окремого прапорця. Індексація `m[1]` і `m["unit"]` теж працює і читається коротше за `m.group(1)`. Синтаксис `(?P<name>...)` нижче, у розділі про групи.

```python live
import re

m = re.search(r"(?P<value>\d+)(?P<unit>px|rem)?", "width: 16px")
print(m)
print(m.group(), m.group(0), m[0])
print(m.group(1), m["unit"], m.group("value", "unit"))
print(m.groups())
print(m.groupdict())
print(m.span(), m.start("unit"), m.end())

m = re.search(r"(?P<value>\d+)(?P<unit>px|rem)?", "width: 16")
print(m.groups(), m.groups(default=""))
```

```text
<re.Match object; span=(7, 11), match='16px'>
16px 16px 16px
16 px ('16', 'px')
('16', 'px')
{'value': '16', 'unit': 'px'}
(7, 11) 9 11
('16', None) ('16', '')
```

> **Пастка.** Група, яка не брала участі в збігу, це `None`, а не `undefined` і не порожній рядок, тож `m["unit"].upper()` падає з `AttributeError`. `groups(default="")` і `groupdict(default="")` підставляють значення замість `None`. А звернення до групи, якої в шаблоні немає, це не `undefined`, а виняток.

```python
import re

m = re.search(r"(\d+)", "a1")
print(m.group(3))
```

```text
IndexError: no such group
```

Тип результату пошуку `re.Match[str] | None`, і mypy не дасть звернутися до групи, не перевіривши `None`. Звідси ідіома з walrus-оператором `:=` (m1-l05): присвоїти результат і перевірити в одній умові. Після перевірки тип звужується до `re.Match[str]` (type narrowing, офіційний термін специфікації типізації; механізм той самий, що narrowing у TS після `if (m)`). `re.Pattern` і `re.Match` generic за типом рядка (generics детально в m2-l06): шаблон з `str` дає `Pattern[str]`, з `bytes` дає `Pattern[bytes]`, і змішати їх не можна. Старі `typing.Pattern` і `typing.Match` застарілі з 3.9.

```python
import re

SIZE_RE = re.compile(r"(?P<value>\d+)(?P<unit>px|rem)")


def parse_bad(value: str) -> int:
    m = SIZE_RE.fullmatch(value)
    return int(m["value"])


def parse(value: str) -> tuple[int, str] | None:
    if (m := SIZE_RE.fullmatch(value)) is None:
        return None
    reveal_type(m)
    return int(m["value"]), m["unit"]


reveal_type(SIZE_RE)
reveal_type(SIZE_RE.fullmatch("16px"))
reveal_type(re.compile(rb"\d+"))
```

```text
$ mypy --strict typing_demo.py
typing_demo.py:8: error: Value of type "Match[str] | None" is not indexable  [index]
typing_demo.py:14: note: Revealed type is "re.Match[str]"
typing_demo.py:18: note: Revealed type is "re.Pattern[str]"
typing_demo.py:19: note: Revealed type is "re.Match[str] | None"
typing_demo.py:20: note: Revealed type is "re.Pattern[bytes]"
Found 1 error in 1 file (checked 1 source file)
```

<!-- task: t1 -->

## Глобальність задає метод: `findall`, `finditer`, `sub`, `split`

Прапорця `g` у Python немає. У JS той самий об'єкт регулярного виразу поводиться по-різному залежно від `g`: `match` повертає або перший збіг з групами, або всі збіги без груп, `replace` замінює або перший, або всі, а `matchAll` без `g` кидає `TypeError`. У Python "один чи всі" задає вибір функції, а шаблон від цього не залежить.

```ts
const text = "w: 16px; h: 24px";
console.log(text.match(/\d+px/g));                             // ["16px", "24px"]
console.log([...text.matchAll(/(\d+)px/g)].map((m) => m[1]));  // ["16", "24"]
console.log(text.replace(/px/g, "rem"));                       // "w: 16rem; h: 24rem"
console.log(text.replace(/px/, "rem"));                        // "w: 16rem; h: 24px"
```

```python live
import re

text = "w: 16px; h: 24px"
print(re.findall(r"\d+px", text))
print([m[1] for m in re.finditer(r"(\d+)px", text)])
print(re.sub(r"px", "rem", text))
print(re.sub(r"px", "rem", text, count=1))
print(re.subn(r"px", "rem", text))
```

```text
['16px', '24px']
['16', '24']
w: 16rem; h: 24rem
w: 16rem; h: 24px
('w: 16rem; h: 24rem', 2)
```

Розходиться замовчування в заміні. JS-ний `replace` без `g` замінює лише перший збіг; `re.sub` замінює всі, а обмеження задає `count`. Це та сама логіка, що в `str.replace` з m1-l04: у Python заміна за замовчуванням глобальна. `re.subn` повертає ще й кількість замін, на яку в JS довелося б рахувати виклики колбека.

Без `g` зникає і стан. Глобальний регулярний вираз у JS пам'ятає `lastIndex`, тому той самий об'єкт, викликаний двічі на тому самому рядку, дає різні відповіді, а спільна константа з `g` між двома функціями стає джерелом плаваючих багів. `re.Pattern` незмінний: між викликами в ньому нічого не зберігається, і одну константу можна безпечно використовувати звідусіль, зокрема з кількох потоків.

```ts
const email = /email/g;
console.log(email.test("email"), email.test("email"), email.lastIndex); // true false 0
```

```python live
import re

email = re.compile(r"email")
print(email.search("email") is not None, email.search("email") is not None)
```

```text
True True
```

`findall` повертає список рядків, але форма списку залежить від кількості груп у шаблоні. Без груп це весь збіг, з однією групою вміст групи, з двома й більше кортежі груп. У JS `match` з `g` групи просто ігнорує.

```python live
import re

text = "w: 16px; h: 24rem"
print(re.findall(r"\d+(?:px|rem)", text))
print(re.findall(r"\d+(px|rem)", text))
print(re.findall(r"(\d+)(px|rem)", text))
```

```text
['16px', '24rem']
['px', 'rem']
[('16', 'px'), ('24', 'rem')]
```

> **Пастка.** Додали групу в шаблон, щоб згрупувати альтернативу, і `findall` тихо змінив, що повертає: замість `'16px'` тепер `'px'`. Групи, які не треба захоплювати, пишуть `(?:...)`, як і в JS. Коли потрібні і весь збіг, і групи, і позиції, беруть `finditer`: він віддає об'єкти `Match`, і форма результату від кількості груп не залежить.

<!-- task: q3 -->

`finditer` це `matchAll`, але без вимоги `g` і без копіювання в масив: він повертає ітератор, який шукає наступний збіг лише тоді, коли його попросили (ліниве обчислення, детально про ітератори в m5-l01). `findall` будує список з усіма збігами одразу. Для великого тексту, з якого потрібні перші кілька збігів, або для обробки потоком різниця суттєва; вимір у розділі про продуктивність.

```python
import re

matches = re.finditer(r"\d+", "a1 b22 c333")
print(type(matches))
print(next(matches))
print([m.span() for m in matches])
```

```text
<class 'callable_iterator'>
<re.Match object; span=(1, 2), match='1'>
[(4, 6), (8, 11)]
```

`re.split` ріже рядок за шаблоном, і якщо в шаблоні є група, захоплені роздільники потрапляють у результат між частинами. JS-ний `split` з групою в регулярному виразі робить рівно те саме, тож тут інтуїція не підводить. Відрізняється обмеження: `maxsplit` обмежує кількість розрізів і лишає хвіст цілим, як у `str.split`, а `limit` у JS просто обрізає масив.

```python live
import re

print(re.split(r"[,;]\s*", "email, phone;age"))
print(re.split(r"([,;])\s*", "email, phone;age"))
print(re.split(r"[,;]\s*", "email, phone;age", maxsplit=1))
print(re.split(r",", ",a,"))
```

```text
['email', 'phone', 'age']
['email', ',', 'phone', ';', 'age']
['email', 'phone;age']
['', 'a', '']
```

> **Пастка.** У `sub`, `subn` і `split` четвертий позиційний параметр це `count` або `maxsplit`, а не прапорці. `re.sub(p, r, s, re.I)` не вмикає ігнорування регістру, а передає `re.I`, тобто число 2, як `count`. У 3.12 це мовчить, з 3.13 дає `DeprecationWarning`. Прапорці й `count` завжди передавати іменованими.

```python
import re

print(re.sub("a", "x", "a-b-A-a-a", re.I))
print(re.sub("a", "x", "a-b-A-a-a", flags=re.I))
```

```text
x-b-A-x-a
x-b-x-x-x
```

<!-- task: t2 -->

## Іменовані групи, зворотні посилання і заміна

Іменовані групи в Python пишуться `(?P<name>...)`. Літера `P` лишилась з часів, коли Python першим додав іменовані групи як розширення синтаксису Perl; JS прийшов до них пізніше і взяв коротшу форму `(?<name>...)`, яку `re` не приймає. Відповідно змінюються зворотне посилання в шаблоні й посилання в рядку заміни.

```ts
const date = /(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/;
console.log("2026-10-18".match(date)?.groups?.d);          // "18"
console.log("2026-10-18".replace(date, "$<d>.$<m>.$<y>")); // "18.10.2026"
console.log("2026-10-18".replace(date, "$3.$2.$1"));       // "18.10.2026"
console.log(`say "a'b" ok`.match(/(?<q>['"]).*?\k<q>/)?.[0]); // "\"a'b\""
```

```python live
import re

date = re.compile(r"(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})")
print(date.search("2026-10-18")["d"])
print(date.sub(r"\g<d>.\g<m>.\g<y>", "2026-10-18"))
print(date.sub(r"\3.\2.\1", "2026-10-18"))
print(re.search(r"(?P<q>['\"]).*?(?P=q)", "say \"a'b\" ok")[0])
```

```text
18
18.10.2026
18.10.2026
"a'b"
```

Таблиця відповідностей коротка: `(?<n>...)` стає `(?P<n>...)`, `\k<n>` стає `(?P=n)`, `$<n>` у заміні стає `\g<n>`, `$1` стає `\1` або `\g<1>`, `$&` (весь збіг) стає `\g<0>`. Числові зворотні посилання `\1` у самому шаблоні однакові в обох мовах. Форма `\g<1>` потрібна, коли за номером групи йде цифра: `\10` читається як група 10, а `\g<1>0` як група 1 і символ `0`. А `$1` у рядку заміни Python не розуміє взагалі і вставляє буквально.

```python live
import re

print(re.sub(r"(\d+)px", "$1rem", "16px"))
print(re.sub(r"(\d+)px", r"\1rem", "16px"))
print(re.sub(r"(\d+)px", r"\g<1>0rem", "16px"))
print(re.sub(r"\d+", r"[\g<0>]", "a1b22"))
```

```text
$1rem
16rem
160rem
a[1]b[22]
```

```python
import re

re.compile(r"(?<y>\d{4})")
```

```text
re.error: unknown extension ?<y at position 1
```

<!-- task: q4 -->

> **Пастка.** Рядок заміни в `re.sub` це шаблон, а не дані: зворотні риски в ньому обробляються. Якщо підставити туди значення з даних, наприклад шлях Windows чи текст користувача, отримаєте або `re.error`, або спотворений результат. Дані підставляють через функцію заміни, її повернене значення вставляється як є. У JS аналогічна проблема з `$` у рядку заміни, і рішення те саме: колбек.

```python
import re

print(re.sub("x", lambda m: r"C:\data", "path: x"))
print(re.sub("x", r"C:\data", "path: x"))
```

```text
path: C:\data
re.error: bad escape \d at position 2
```

Функція як заміна це колбек з `replace`, з однією різницею в сигнатурі. JS передає в колбек розгорнуті позиційні аргументи: весь збіг, кожну групу окремо, зсув, вихідний рядок і об'єкт `groups`. Python передає один об'єкт `Match`, з якого все це береться методами. Повернути треба `str`; число, на відміну від JS, саме в рядок не перетвориться.

```ts
const prices = "milk 10 bread 25";
console.log(prices.replace(/\d+/g, (m) => String(Number(m) * 2)));         // "milk 20 bread 50"
console.log("a-b".replace(/(\w)-(\w)/, (_m, a, b, offset) => `${b}-${a}@${offset}`)); // "b-a@0"
```

```python live
import re

prices = "milk 10 bread 25"
print(re.sub(r"\d+", lambda m: str(int(m[0]) * 2), prices))


def swap(m: re.Match[str]) -> str:
    return f"{m[2]}-{m[1]}@{m.start()}"


print(re.sub(r"(\w)-(\w)", swap, "a-b"))
```

```text
milk 20 bread 50
b-a@0
```

Розходження в поведінці одне, і воно про типи: JS приведе будь-яке повернене значення до рядка, а `re.sub` з функцією, що повертає `int`, падає з `TypeError: sequence item 1: expected str instance, int found`. Повідомлення про "sequence item" видає внутрішню механіку: `sub` збирає результат через `"".join` з шматків між збігами й результатів функції.

<!-- task: t3 -->

## Прапорці й verbose-режим

Прапорці це константи `re.RegexFlag`, у кожної є коротке й довге ім'я, і комбінуються вони через `|`. Відповідності з JS: `re.I` (`IGNORECASE`) це `i`, `re.M` (`MULTILINE`) це `m`, `re.S` (`DOTALL`) це `s`. `g` немає, бо глобальність задає функція. `y` (sticky) замінює `pattern.match(text, pos)`: метод скомпільованого шаблону приймає позицію, з якої прив'язувати збіг. `d` не потрібен, бо `span()` є завжди. `u` не потрібен, бо шаблон з `str` і так працює з Unicode. Зате є два прапорці, яких у JS немає: `re.X` (`VERBOSE`) і `re.A` (`ASCII`).

```python live
import re

text = "Name: A\nname: b"
print(re.findall(r"^name: (\w)", text))
print(re.findall(r"^name: (\w)", text, re.I | re.M))
print(re.findall(r"(?im)^name: (\w)", text))
print(re.search(r"A.name", text), re.search(r"A.name", text, re.S))

digits = re.compile(r"\d+")
print(digits.match("ab12", 2), digits.match("ab12", 1))
```

```text
[]
['A', 'b']
['A', 'b']
None <re.Match object; span=(6, 12), match='A\nname'>
<re.Match object; span=(2, 4), match='12'> None
```

Прапорці можна вписати в сам шаблон: `(?im)` на початку діє на весь шаблон, а з 3.11 стоїть лише на початку, інакше `re.error: global flags not at the start of the expression`. Локальна форма `(?i:...)` вмикає прапорець для частини шаблону; у Python вона є з 3.6, у JS з'явилась лише в ES2025 (Node 24 її вже виконує). Вбудовані прапорці зручні, коли шаблон зберігається як рядок у конфігу і прапорці мають їхати разом з ним.

`re.X` (verbose mode, офіційна назва; прапорець `re.VERBOSE`) це головна причина, чому складні регулярні вирази в Python читаються краще, ніж у JS. У цьому режимі пробіли й переноси рядків у шаблоні ігноруються, а `#` починає коментар до кінця рядка. Шаблон можна розкласти по рядках з поясненнями, як звичайний код. У JS такого прапорця немає: `new RegExp(src, "x")` кидає `SyntaxError: Invalid flags`, і довгі вирази або тягнуться одним рядком, або склеюються з шматків.

```ts
const VERSION_RE = new RegExp(
  String.raw`(?<major>0|[1-9]\d*)\.` +
    String.raw`(?<minor>0|[1-9]\d*)\.` +
    String.raw`(?<patch>0|[1-9]\d*)` +
    String.raw`(?:-(?<pre>[0-9A-Za-z.-]+))?`, // pre-release: 1.0.0-beta.2
);
console.log("1.4.0-beta.2".match(new RegExp(`^${VERSION_RE.source}$`))?.groups);
```

```python live
import re

VERSION_RE = re.compile(
    r"""
    (?P<major>0|[1-9]\d*) \.
    (?P<minor>0|[1-9]\d*) \.
    (?P<patch>0|[1-9]\d*)
    (?: - (?P<pre>[0-9A-Za-z.-]+) )?   # pre-release: 1.0.0-beta.2
    """,
    re.VERBOSE,
)
print(VERSION_RE.fullmatch("1.4.0-beta.2").groupdict())
print(VERSION_RE.fullmatch("01.4.0"))
```

```text
{'major': '1', 'minor': '4', 'patch': '0', 'pre': 'beta.2'}
None
```

Різниця не косметична. У JS-версії коментар можна поставити лише між шматками рядка, а самі шматки однаково нечитабельні, і `fullmatch` доводиться імітувати, збираючи новий `RegExp` з якорями. У Python шаблон читається згори вниз як граматика, його можна рев'ювити рядок за рядком, а `fullmatch` бере на себе якорі. У поєднанні з `(?P<name>...)` це найближче, що стандартна бібліотека має до парсера, і для форматів на кшталт версій, тривалостей чи CSS-значень цього досить.

> **Пастка.** У verbose-режимі пробіл у шаблоні більше не означає пробіл. Буквальний пробіл пишуть `\ `, `[ ]` або `\s`; усередині класу символів `[...]` пробіли й `#` зберігають звичайне значення. Шаблон, який працював, тихо змінює сенс, якщо до нього дописати `re.X`.

```python
import re

print(re.fullmatch(r"a b", "ab", re.X), re.fullmatch(r"a b", "a b", re.X))
print(re.fullmatch(r"a[ ]b", "a b", re.X))
```

```text
<re.Match object; span=(0, 2), match='ab'> None
<re.Match object; span=(0, 3), match='a b'>
```

<!-- task: t4 -->

## Синтаксис, що розходиться з JS

Більшість синтаксису спільна: класи, квантифікатори, альтернативи, lookahead, незахоплюючі групи пишуться однаково. Розбіжностей чотири групи, і перша з них найнебезпечніша для валідації: `$` у Python без `re.M` збігається не лише в самому кінці рядка, а й перед завершальним `\n`. Рядок `"email\n"` проходить перевірку `^[a-z]+$`. JS-ний `$` без `m` означає строго кінець. У Python строгий кінець пишуть `\Z`, строгий початок `\A` (у JS таких якорів немає, вони там і не потрібні), а найчастіше просто `fullmatch`.

```ts
console.log(/^[a-z]+$/.test("email\n")); // false
```

```python live
import re

print(re.match(r"^[a-z]+$", "email\n"))
print(re.match(r"^[a-z]+\Z", "email\n"))
print(re.fullmatch(r"[a-z]+", "email\n"))
```

```text
<re.Match object; span=(0, 5), match='email'>
None
None
```

Значення з форм і JSON-тіл запитів регулярно приходять з хвостовим переносом рядка, а `$` пропускає їх як валідні. Python-ний `$` успадкований від Perl, де він задуманий для рядків, прочитаних з файлу разом з `\n`. Для всього, що валідує значення цілком, правило одне: `fullmatch` або `\Z`, але не `$`.

Друга група: lookbehind (lookbehind assertion, офіційна назва) у `re` має бути фіксованої довжини. V8 з ES2018 підтримує lookbehind довільної довжини, і `(?<=\$\d+)` там працює. У Python такий шаблон не компілюється, і навіть альтернатива з гілками різної довжини всередині lookbehind заборонена. Обхід: захопити те, що мало бути в lookbehind, і взяти потрібну групу, або розбити альтернативу на кілька lookbehind фіксованої довжини.

```ts
console.log("$100.50".match(/(?<=\$\d+)\.\d+/)?.[0]); // ".50"
```

```python live
import re

for pattern in (r"(?<=\$\d+)\.\d+", r"(?<=a|bc)x"):
    try:
        re.compile(pattern)
    except re.error as e:
        print(pattern, "->", e)

print(re.search(r"\$\d+(\.\d+)", "$100.50")[1])
print(re.findall(r"(?:(?<=a)|(?<=bc))x", "ax bcx dx"))
```

```text
(?<=\$\d+)\.\d+ -> look-behind requires fixed-width pattern
(?<=a|bc)x -> look-behind requires fixed-width pattern
.50
['x', 'x']
```

Третя група стосується класів символів. POSIX-класів `[[:alpha:]]` немає ні в `re`, ні в JS, але `re` хоча б попереджає: `[[:alpha:]]` розбирається як клас із символів `[:alph` і буквальна `]` після нього, і Python видає `FutureWarning: Possible nested set`. Unicode-властивостей `\p{L}` теж немає, це `re.error: bad escape \p`.

```python
import re

print(re.findall(r"[[:alpha:]]+", "word p]]"))
```

```text
FutureWarning: Possible nested set at position 1
['p]]']
```

Четверта група протилежна до JS. Для шаблонів з `str` класи `\w`, `\d`, `\s` і межа `\b` за замовчуванням Unicode: `\w` ловить кирилицю, `\d` ловить будь-які десяткові цифри Unicode, зокрема арабсько-індійські й повноширинні. У JS `\w` і `\d` ASCII завжди, навіть з прапорцем `u`; літери там шукають через `\p{L}` з `u`. Прапорець `re.A` повертає Python до ASCII-поведінки. Для "лише літера" без `\p{L}` у `re` є ідіома `[^\W\d_]`: словесний символ, який не цифра й не підкреслення (подвійне заперечення через `\W`).

```ts
console.log("Ім'я: Олена_1, age 30".match(/\w+/g)); // ["_1", "age", "30"]
console.log("Ім'я: Олена_1, age 30".match(/\p{L}+/gu)); // ["Ім", "я", "Олена", "age"]
console.log(/^\d+$/.test("١٢٣")); // false
```

```python live
import re

text = "Ім'я: Олена_1, age 30"
print(re.findall(r"\w+", text))
print(re.findall(r"\w+", text, re.A))
print(re.findall(r"[^\W\d_]+", text))
print(re.fullmatch(r"\d+", "١٢٣"), int("١٢٣"))
print(re.fullmatch(r"\d+", "１２３"), re.fullmatch(r"[0-9]+", "１２３"))
```

```text
['Ім', 'я', 'Олена_1', 'age', '30']
['_1', 'age', '30']
['Ім', 'я', 'Олена', 'age']
<re.Match object; span=(0, 3), match='١٢٣'> 123
<re.Match object; span=(0, 3), match='１２３'> None
```

Для тексту Unicode-класи це перевага: `\w+` розбирає українські слова без додаткових прапорців. Для валідації це пастка: поле "кількість" з `\d+` пропустить `"١٢٣"`, а `int()` спокійно перетворить його на 123, тож дивне значення пройде всю перевірку. Ідентифікатори, коди, числа з форм перевіряють явним `[0-9]` і `[a-z]` або з `re.A`.

> **JS-аналог.** Пакет `regex` з PyPI (не стандартна бібліотека) це надмножина `re` з тим, чого тут бракує: lookbehind довільної довжини, `\p{L}`, POSIX-класи, параметр `timeout`; у проєкт його беруть, коли потрібен саме цей синтаксис, а за замовчуванням лишаються на `re`.

## Жадібність, backtracking і продуктивність

Жадібні й ліниві квантифікатори поводяться так само, як у JS: `*`, `+`, `?`, `{m,n}` захоплюють максимум, а з `?` після них (`*?`, `+?`) мінімум. Документація Python називає їх greedy і non-greedy (або minimal); "lazy" це жаргон спільноти, який розуміють усі. Класичний приклад для форм: плейсхолдери `{{ ... }}` у тексті. Жадібний `.+` з'їдає все від першого `{{` до останнього `}}`.

```python live
import re

text = "{{ a }} and {{ b }}"
print(re.sub(r"\{\{(.+)\}\}", r"<\1>", text))
print(re.sub(r"\{\{(.+?)\}\}", r"<\1>", text))
print(re.sub(r"\{\{([^{}]*)\}\}", r"<\1>", text))
```

```text
< a }} and {{ b >
< a > and < b >
< a > and < b >
```

Третій варіант з запереченим класом `[^{}]*` кращий за лінивий квантифікатор не стилістично, а механічно. Лінивий `.+?` після кожного символу пробує, чи не почався вже `}}`, і відступає назад; заперечений клас іде вперед без повернень і не може вийти за межі плейсхолдера. Повернення назад і є backtracking: рушій запам'ятовує точки вибору і, коли подальший збіг не вдається, повертається до останньої та пробує інший варіант.

Катастрофічний backtracking (catastrophic backtracking, назва спільноти; документація Python окремого терміна не має, а в безпеці атаку через нього називають ReDoS) виникає, коли шаблон дає експоненційно багато способів розкласти той самий рядок, а збіг у підсумку неможливий. `(a+)+$` на рядку з `n` літер `a` і `b` наприкінці: кожен спосіб поділити `a` між внутрішнім і зовнішнім `+` рушій перебирає, перш ніж визнати невдачу, а таких способів `2^(n-1)`. Кожна нова літера подвоює час. Приклад нижче не live: вивід виміряний локально на Mac з Python 3.12, у браузері числа будуть інші, а більші `n` просто підвісять вкладку.

```python
import re
import time

for n in (20, 22, 24, 25):
    start = time.perf_counter()
    re.match(r"(a+)+$", "a" * n + "b")
    print(n, f"{time.perf_counter() - start:.2f}s")

for pattern in (r"(?>a+)+$", r"(a++)+$", r"a+$"):
    start = time.perf_counter()
    re.match(pattern, "a" * 25 + "b")
    print(pattern, f"{time.perf_counter() - start:.3f}s")
```

```text
20 0.04s
22 0.14s
24 0.57s
25 1.11s
(?>a+)+$ 0.000s
(a++)+$ 0.000s
a+$ 0.000s
```

V8 поводиться так само: той самий шаблон на 25 літерах у Node 24 на тій самій машині виконується близько двох секунд, бо Irregexp теж backtracking-рушій. Ліки в Python є, яких у JS немає. З 3.11 `re` підтримує атомарні групи `(?>...)` і посесивні квантифікатори `*+`, `++`, `?+` (atomic group і possessive quantifier, офіційні назви в документації): захоплене ними рушій ніколи не віддає назад, тож експоненційного перебору немає. У JS обидві конструкції це `SyntaxError`. Але найкращі ліки зазвичай простіші: переписати шаблон без вкладених квантифікаторів над тим самим, як `a+$` вище.

> **Пастка.** Таймауту в `re` немає: ні параметра, ні глобального налаштування. Шаблон, який ви пишете для даних від користувача, захищають самі: обмеженням довжини вхідного рядка перед пошуком, шаблоном без вкладених квантифікаторів, атомарними групами, або виконанням в окремому процесі з таймаутом (subprocess у m6-l05). У пакета `regex` є параметр `timeout`.

> **Під капотом.** `_sre` періодично перевіряє сигнали під час пошуку, тому довгий пошук можна перервати сигналом. На Unix у головному потоці `signal.setitimer` з обробником, що кидає виняток, працює як грубий таймаут; на Windows і в потоках цього немає, тож універсальним рішенням він не є. Сигнали розібрані в m6-l07.

```python
import re
import signal
import time


class Timeout(Exception):
    pass


def on_alarm(signum, frame):
    raise Timeout


signal.signal(signal.SIGALRM, on_alarm)
signal.setitimer(signal.ITIMER_REAL, 0.2)
start = time.perf_counter()
try:
    re.match(r"(a+)+$", "a" * 30 + "b")
except Timeout:
    print(f"interrupted after {time.perf_counter() - start:.2f}s")
```

```text
interrupted after 0.21s
```

Лінивість `finditer` має сенс саме для продуктивності. `findall` проходить увесь текст і будує список; `next(re.finditer(...))` зупиняється на першому збігу, і решта тексту не читається. Вивід нижче теж виміряний локально.

```python
import re
import time

text = "id=1;" + "x" * 50_000_000

start = time.perf_counter()
first = next(re.finditer(r"id=(\d+)", text))
print(first[1], f"{time.perf_counter() - start:.3f}s")

start = time.perf_counter()
everything = re.findall(r"id=(\d+)", text)
print(everything, f"{time.perf_counter() - start:.3f}s")
```

```text
1 0.000s
['1'] 0.017s
```

## Коли regex не потрібен

Найчастіша помилка з регулярними виразами в Python не синтаксична, а в самому виборі інструмента. Методи `str` з m1-l04 покривають більшість перевірок, які в JS за звичкою пишуть регулярним виразом: `startswith` і `endswith` приймають кортеж варіантів, `in` шукає підрядок, `partition` ділить по першому роздільнику на три частини, `split` без аргументу розбиває по пробілах. Вони швидші, не мають синтаксису, який треба екранувати, і в них неможливий катастрофічний backtracking.

```python live
import re

url = "https://example.com/form"
print(re.match(r"https?://", url) is not None, url.startswith(("http://", "https://")))
print(re.search(r"form", url) is not None, "form" in url)

key, _, value = "lang=uk=UA".partition("=")
print(key, value)
print(re.split(r"=", "lang=uk=UA", maxsplit=1))
print("  a  b\tc ".split(), re.split(r"\s+", "  a  b\tc ".strip()))
```

```text
True True
True True
lang uk=UA
['lang', 'uk=UA']
['a', 'b', 'c'] ['a', 'b', 'c']
```

Друга межа проходить по структурованих даних. JSON, TOML, CSV розбирають модулі `json`, `tomllib`, `csv` (m6-l02), URL розбирає `urllib.parse`, а HTML парсер. Регулярний вираз бачить текст як рядок символів і не знає про вкладеність, лапки, екранування і порядок атрибутів, тому на першому ж нетиповому, але валідному вході він мовчки пропускає дані. `html.parser.HTMLParser` у стандартній бібліотеці простий, але справжній токенізатор HTML.

```python live
import re
from html.parser import HTMLParser

html = """<a href="/a">A</a> <a class="x" href='/b'>B</a> <a title="a>b" href="/c">C</a>"""
print(re.findall(r'<a href="([^"]+)"', html))


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self.hrefs += [value for name, value in attrs if name == "href" and value]


collector = LinkCollector()
collector.feed(html)
print(collector.hrefs)
```

```text
['/a']
['/a', '/b', '/c']
```

Регулярний вираз лишається правильним інструментом там, де формат справді плаский і описується граматикою з одного рівня: ідентифікатори, коди, версії, тривалості, токени в рядку, плейсхолдери в шаблоні. Якщо для шаблону потрібна рекурсія, балансування дужок або стан між збігами, це вже парсер, і його варто писати як парсер.

## Для капстоуну

У бекенді FormBuilder регулярні вирази потрібні в трьох місцях, і всі три пласкі. Ім'я елемента форми (`name` у JSON-конфігу) має відповідати `^[a-z][a-z0-9_]*$`, бо воно стає ключем у відповідях і ідентифікатором у шаблоні. Тексти форми містять плейсхолдери `{{ field }}`, які треба знайти разом з позиціями, щоб повідомити про невідоме поле з номером рядка й колонки. І заголовок форми перетворюється на slug для URL опублікованої сторінки. Усі три шаблони стають константами модуля.

```python live
import re
from typing import Final

NAME_RE: Final = re.compile(r"[a-z][a-z0-9_]*")
PLACEHOLDER_RE: Final = re.compile(r"\{\{\s*(?P<name>[^{}\s]+)\s*\}\}")
SLUG_SEPARATOR_RE: Final = re.compile(r"[\W_]+")


def is_valid_name(name: str) -> bool:
    return NAME_RE.fullmatch(name) is not None


def placeholders(text: str) -> list[tuple[str, int]]:
    return [(m["name"], m.start()) for m in PLACEHOLDER_RE.finditer(text)]


def slugify(title: str) -> str:
    return SLUG_SEPARATOR_RE.sub("-", title.lower()).strip("-")


print([is_valid_name(n) for n in ["first_name", "email\n", "Email", "1st", ""]])
print(placeholders("Привіт, {{ first_name }}. Ваш {{email}} і {{ bad name }}."))
print(slugify("Форма реєстрації: Крок 2 / 3"))
print(slugify("  Contact_us -- NOW  "))
```

```text
[True, False, False, False, False]
[('first_name', 8), ('email', 30)]
форма-реєстрації-крок-2-3
contact-us-now
```

> **Для капстоуну.** Шаблон з ТЗ `^[a-z][a-z0-9_]*$` у Python переписується без якорів через `fullmatch`: з `$` ім'я `"email\n"` пройшло б валідацію і стало б ключем, який ніколи не збігається з відповіддю. Явні класи `[a-z]` і `[0-9]` тут не випадковість: `\w` пропустив би кирилицю й повноширинні цифри. У Pydantic-моделі (m2-l09) той самий шаблон можна віддати в `Field(pattern=...)`, але валідатор Pydantic використовує власний Rust-рушій, де `$` поводиться як у JS; одна функція `is_valid_name` на основі `fullmatch` дає однакову поведінку і в моделі, і в CLI. Slug тут лишає кирилицю як є; транслітерація в латиницю потребує таблиці відповідностей і в цей урок не входить.

```python live
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class RustEngine(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")


class PythonEngine(BaseModel):
    model_config = ConfigDict(regex_engine="python-re")
    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")


for model in (RustEngine, PythonEngine):
    try:
        model(name="email\n")
        print(model.__name__, "accepted 'email\\n'")
    except ValidationError:
        print(model.__name__, "rejected 'email\\n'")
```

```text
RustEngine rejected 'email\n'
PythonEngine accepted 'email\n'
```

<!-- task: t5 -->

<!-- task: p1 -->

## Типові помилки JS-розробника

1. **Шукати прапорець `g` і `lastIndex`.** Звичка з `/.../g` змушує шукати "глобальний режим". Його немає: усі збіги дають `findall` і `finditer`, заміну всіх дає `sub` за замовчуванням, а шаблон не має стану між викликами.

   ```python
   re.findall(r"\d+", "a1 b22")                       # ['1', '22']
   [m.span() for m in re.finditer(r"\d+", "a1 b22")]  # [(1, 2), (4, 6)]
   ```

2. **`re.match` як `String.prototype.match`.** Очікують пошук будь-де, отримують `None`, бо `re.match` прив'язаний до початку. Правильно: `search` для пошуку, `fullmatch` для валідації.

   ```python
   re.match(r"\d+", "id: 42")    # None
   re.search(r"\d+", "id: 42")   # <re.Match object; span=(4, 6), match='42'>
   ```

3. **`String.prototype.match` з `g` переносять у `findall` і забувають про групи.** Додана група змінює форму результату з повних збігів на вміст групи або кортежі. Правильно: `(?:...)` для групування без захоплення або `finditer`.

   ```python
   re.findall(r"\d+(px|rem)", "16px 2rem")    # ['px', 'rem']
   re.findall(r"\d+(?:px|rem)", "16px 2rem")  # ['16px', '2rem']
   ```

4. **`$1` і `$<name>` у рядку заміни.** Python вставляє їх буквально. Правильно: `\1`, `\g<1>`, `\g<name>`, `\g<0>` для всього збігу, у raw-рядку.

   ```python
   re.sub(r"(\d+)px", "$1rem", "16px")    # '$1rem'
   re.sub(r"(\d+)px", r"\1rem", "16px")   # '16rem'
   ```

5. **Очікувати, що `sub` замінить лише перший збіг, і передати прапорці позиційно.** `sub` замінює всі, як `replaceAll`; четвертий позиційний аргумент це `count`, і `re.I` там означає "дві заміни". Правильно: `count=1` і `flags=re.I` іменованими.

   ```python
   re.sub("a", "x", "a-a-a")                    # 'x-x-x'
   re.sub("a", "x", "a-A-a", re.I)              # 'x-A-x', прапорець став count=2
   re.sub("a", "x", "a-A-a", count=1, flags=re.I)  # 'x-A-a'
   ```

6. **Шаблон без `r`.** Переносять `/\bword\b/` як `"\bword\b"` і отримують шаблон з символами backspace, який ніколи не збігається, без жодного попередження. Правильно: кожен шаблон `r"..."`.

   ```python
   re.findall("\bcat\b", "cat")    # []
   re.findall(r"\bcat\b", "cat")   # ['cat']
   ```

7. **`^...$` для валідації.** У Python `$` збігається перед завершальним `\n`, тож `"email\n"` проходить. Правильно: `fullmatch` або `\Z`.

   ```python
   bool(re.match(r"^[a-z]+$", "email\n"))   # True
   bool(re.fullmatch(r"[a-z]+", "email\n")) # False
   ```

8. **`\w` і `\d` як ASCII-класи.** У JS вони ASCII, у Python Unicode: `\d+` пропускає `"١٢٣"`, `\w` пропускає кирилицю. Правильно: явні `[0-9]`, `[a-z]` або прапорець `re.A` там, де потрібен ASCII.

   ```python
   re.fullmatch(r"\d+", "١٢٣")          # <re.Match object; span=(0, 3), match='١٢٣'>
   re.fullmatch(r"\d+", "١٢٣", re.A)    # None
   ```

## Підсумок

- Літерала немає: шаблон це рядок, завжди `r"..."`; без `r` `\b` і `\1` ламаються мовчки.
- `re` кешує 512 скомпільованих шаблонів, тож `re.compile` потрібен для імені, типу й прапорців в одному місці, а не заради швидкості.
- `search` шукає будь-де, `match` лише з початку, `fullmatch` увесь рядок; для валідації `fullmatch`, а не `^...$`.
- Прапорця `g` немає: один збіг дають `search`/`match`/`fullmatch`, усі `findall` (форма залежить від груп) і `finditer` (ледачий, з `Match`); `sub` замінює всі, `count` обмежує.
- `re.Pattern` без стану: ні `lastIndex`, ні сюрпризів від повторного виклику.
- Іменована група `(?P<name>...)`, посилання `(?P=name)`, у заміні `\g<name>`, `\1`, `\g<0>`; `$1` вставляється буквально; функція-заміна отримує один `Match` і повертає `str`.
- `re.X` дає багаторядкові шаблони з коментарями; `re.A` вмикає ASCII-класи; прапорці передавати іменованими.
- `$` пропускає завершальний `\n`, lookbehind лише фіксованої довжини, `\p{L}` і `[[:alpha:]]` немає, `\w` і `\d` Unicode.
- Таймаутів немає; від катастрофічного backtracking захищають простіший шаблон, атомарні групи й посесивні квантифікатори (3.11+), обмеження довжини входу.
- Фіксований підрядок це метод `str`, структурований формат це парсер; regex для пласких граматик.

## Що далі

Наступний урок m6-l05 про `subprocess`: виклик зовнішнього Node-рендерера з Python і читання його stdout потоком. Звідти знадобляться `finditer` для розбору рядків логу рендерера й `fullmatch` для перевірки версії, яку повертає `node --version`, а окремий процес з таймаутом це саме той спосіб обмежити час небезпечного регулярного виразу, про який тут ішлося.
