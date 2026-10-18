---
id: m7-l06
module: m7-fastapi
title: "Jinja2: шаблони як простий рендерер статики"
summary: "Учень рендерить сторінку форми через Jinja2: один Environment з PackageLoader, автоекрануванням і StrictUndefined, шаблони з циклами, фільтрами, macro на тип елемента і базовою сторінкою через extends, без |safe на user-content, з golden-тестом; у капстоуні JinjaRenderer реалізує Renderer Protocol і викликається воркером через to_thread."
duration_min: 50
prerequisites: [m7-l05]
---

## Навіщо шаблонізатор, коли є f-рядки

Рендерери з m2-l07 і m4-l05 збирали HTML f-рядками і викликали `html.escape` вручну на кожному `label`. Для трьох типів елементів це терпимо. Для сторінки з `<head>`, темою, кількома видами сторінок і двома десятками місць підстановки вже ні: одне забуте `escape` дає XSS, а розмітка розмазана по Python-коду. Шаблонізатор (template engine, загальноприйнятий термін, у документації Jinja так і названо) виносить розмітку в окремі файли, а Jinja2 серед шаблонізаторів Python стандарт де-факто: на ньому Flask, Ansible, dbt, а FastAPI має для нього готову обгортку `Jinja2Templates`.

```ts
const label = '<img src=x onerror="alert(1)">';
const viaLiteral = `<label>${label}</label>`;              // рядок як є
const viaJsx = renderToString(<label>{label}</label>);    // React екранує
```

```python
from jinja2 import Environment, select_autoescape

label = '<img src=x onerror="alert(1)">'
print(f"<label>{label}</label>")

env = Environment(autoescape=select_autoescape())
print(env.from_string("<label>{{ label }}</label>").render(label=label))
```

```text
<label><img src=x onerror="alert(1)"></label>
<label>&lt;img src=x onerror=&#34;alert(1)&#34;&gt;</label>
```

Різниця в механізмі. React екранує, бо JSX будує дерево об'єктів і сам серіалізує текстові вузли: рядок не може стати розміткою без `dangerouslySetInnerHTML`. Jinja2 працює з текстом: шаблон це рядок з дірками, і екранується лише те, що виходить з `{{ }}`. f-рядок, як і template literal, не екранує нічого.

Понад екранування шаблонізатор дає цикли й умови прямо в розмітці і наслідування шаблонів (template inheritance, офіційний термін документації Jinja): базова сторінка оголошує блоки, дочірня їх перевизначає. Найближчий знайомий вам аналог не JSX, а Nunjucks: Mozilla писала його як порт Jinja2 на JavaScript, тому `{{ }}`, `{% for %}`, `{% extends %}`, `{% macro %}` і фільтри через `|` ви вже бачили. Розбіжності в деталях: вирази тут Python-подібні, набір вбудованих фільтрів інший, і одна різниця в налаштуваннях за замовчуванням небезпечна.

> **Пастка.** Nunjucks з версії 2 вмикає автоекранування (autoescaping, офіційний термін) за замовчуванням. `jinja2.Environment()` ні: без аргументу `autoescape` він вставляє рядок як є і не попереджає.

```python
from jinja2 import Environment

label = "<script>steal()</script>"
print(Environment().from_string("<p>{{ label }}</p>").render(label=label))
print(Environment(autoescape=True).from_string("<p>{{ label }}</p>").render(label=label))
```

```text
<p><script>steal()</script></p>
<p>&lt;script&gt;steal()&lt;/script&gt;</p>
```

Під капотом автоекранування це та сама заміна п'яти символів (`& < > " '`), що робить `html.escape` зі стандартної бібліотеки. `quote=True`, увімкнений за замовчуванням, потрібен для значень атрибутів: без нього `"` закриває атрибут, і решта рядка стає новими атрибутами. Jinja (точніше бібліотека MarkupSafe під нею) пише `"` як `&#34;`, а `html.escape` як `&quot;`: браузеру однаково, тесту, що порівнює рядки, ні.

```python live
from html import escape

label = 'Tom & "Jerry" <b>'
print(escape(label))
print(escape(label, quote=False))
print(f'<input value="{escape(label)}">')
```

```text
Tom &amp; &quot;Jerry&quot; &lt;b&gt;
Tom &amp; "Jerry" &lt;b&gt;
<input value="Tom &amp; &quot;Jerry&quot; &lt;b&gt;">
```

<!-- task: t1 -->

## Environment, loader і шаблони як ресурси пакета

Центральний об'єкт Jinja2 це `Environment`: конфігурація (екранування, пробіли, поведінка невизначених змінних), завантажувач шаблонів (loader, офіційна назва, звідси класи `PackageLoader`, `FileSystemLoader`) і кеш скомпільованих шаблонів. Це `new nunjucks.Environment(loader, opts)`. Шаблон береться через `env.get_template(name)` і рендериться через `template.render(...)`, який приймає і словник, і іменовані аргументи.

```text
src/formbuilder/
├── __init__.py
└── templates/
    ├── mail.txt
    └── page.html
```

```python
from jinja2 import Environment, PackageLoader, select_autoescape

env = Environment(
    loader=PackageLoader("formbuilder", "templates"),
    autoescape=select_autoescape(),
)

context = {"title": "Sign up", "note": "Terms & conditions"}
page = env.get_template("page.html")
print(page.render(**context))
print(page.render(context) == page.render(**context))
print(env.get_template("mail.txt").render(**context))
print(env.list_templates())
```

```text
<h1>Sign up</h1>
<p>Terms &amp; conditions</p>
True
Subject: Sign up
Terms & conditions
['mail.txt', 'page.html']
```

`PackageLoader("formbuilder", "templates")` шукає директорію `templates` всередині імпортованого пакета `formbuilder`, а не відносно поточної директорії. Тому шаблони знаходяться однаково з `uv run` у репозиторії, із встановленого wheel і в Docker-образі. Обидві передумови з попередніх уроків: шаблони мають потрапити у wheel як файли пакета (m3-l02), а `FileSystemLoader(Path(__file__).parent / "templates")` ламається на пакеті, який не лежить на диску директорією (m6-l01). `FileSystemLoader` лишається для шаблонів поза пакетом, наприклад клієнтської теми з директорії на сервері.

`select_autoescape()` повертає функцію від імені шаблону: екранування вмикається для `.html`, `.htm`, `.xml` і для шаблонів з рядка (`from_string`, ім'я `None`), для решти вимикається. Тому `mail.txt` вище вивів `&` як є, і це правильно: `&amp;` у текстовому листі був би помилкою.

```python
from jinja2 import select_autoescape

is_html = select_autoescape()
print(is_html("page.html"), is_html("feed.xml"), is_html("critical.css"), is_html("mail.txt"))
print(is_html(None))
```

```text
True True False False
True
```

<!-- task: q1 -->

## Синтаксис: вирази, цикли, умови, фільтри

Три види розділювачів: `{{ вираз }}` друкує, `{% інструкція %}` керує, `{# коментар #}` зникає з виводу. Фільтр (filter, офіційний термін) це функція, застосована через `|`: `variant | default('plain')` означає `default(variant, 'plain')`, і фільтри ланцюжаться зліва направо. Власний фільтр це звичайна Python-функція в словнику `env.filters`. Усередині `{% for %}` доступна змінна `loop` з `index` (від 1), `index0`, `first`, `last`, `length`, а `{% else %}` у циклі спрацьовує, коли колекція порожня. Це не те `else`, що в Python-циклі після відсутнього `break` (m1-l06).

```python
from jinja2 import Environment, select_autoescape

env = Environment(autoescape=select_autoescape(), trim_blocks=True, lstrip_blocks=True)
env.filters["kebab"] = lambda value: value.replace("_", "-")

source = """\
{# коментар не потрапляє у вивід #}
<ul class="{{ variant | default('plain') }}">
{% for field in fields %}
  <li id="{{ field.name | kebab }}">{{ loop.index }}. {{ field.label }}
  {%- if field.required %} *{% endif %}
  {%- if loop.last %} (last){% endif %}</li>
{% else %}
  <li>No fields</li>
{% endfor %}
</ul>
<p>{{ fields | map(attribute='label') | join(', ') }}</p>
<p>{{ fields | length }} {{ 'field' if fields | length == 1 else 'fields' }}</p>
"""
fields = [
    {"name": "first_name", "label": "First name", "required": True},
    {"name": "promo_code", "label": "Promo <code>", "required": False},
]
template = env.from_string(source)
print(template.render(fields=fields))
print(template.render(fields=[], variant="compact"))
```

```text
<ul class="plain">
  <li id="first-name">1. First name *</li>
  <li id="promo-code">2. Promo &lt;code&gt; (last)</li>
</ul>
<p>First name, Promo &lt;code&gt;</p>
<p>2 fields</p>
<ul class="compact">
  <li>No fields</li>
</ul>
<p></p>
<p>0 fields</p>
```

`trim_blocks` прибирає перенос рядка після тегу `{% %}`, `lstrip_blocks` прибирає пробіли перед ним на початку рядка, а `-` біля розділювача (`{%-`, `-%}`, `{{-`) з'їдає пробіли з цього боку вручну. Без цих опцій кожен `{% for %}` і `{% if %}` лишає в HTML порожній рядок. Браузеру однаково, а читабельності виводу і golden-тестам ні.

Вираз у `{{ }}` схожий на Python, але це окрема маленька мова: літерали, атрибути, індекси, виклики методів, арифметика, `in`, `~` для конкатенації рядків, inline `if ... else`. Comprehension, lambda, присвоєння і тим більше JS-синтаксис парсер відхиляє на етапі компіляції шаблону, тобто вже в `from_string` чи `get_template`, до будь-якого рендера.

```python
from jinja2 import Environment, TemplateSyntaxError

env = Environment(autoescape=True)
ok = "{{ label.upper() ~ '!' }} {{ 'yes' if 'mail' in label else 'no' }} {{ items[0] * 2 }}"
print(env.from_string(ok).render(label="email", items=[21]))

for bad in [
    "{{ [x * 2 for x in items] }}",
    "{{ items.map(x => x * 2) }}",
    "{{ total = 1 }}",
]:
    try:
        env.from_string(bad)
    except TemplateSyntaxError as e:
        print(f"{bad:32} TemplateSyntaxError: {e.message}")
```

```text
EMAIL! yes 42
{{ [x * 2 for x in items] }}     TemplateSyntaxError: expected token ',', got 'for'
{{ items.map(x => x * 2) }}      TemplateSyntaxError: unexpected '>'
{{ total = 1 }}                  TemplateSyntaxError: expected token 'end of print statement', got '='
```

> **Пастка.** Обмежений синтаксис не робить шаблон безпечним: `{{ obj.method() }}` викликає довільний метод об'єкта з контексту. Шаблон це код. Шаблони, які пишуть користувачі (наприклад, кастомний HTML клієнта у FormBuilder), не рендерять звичайним `Environment`; для них є `jinja2.sandbox.SandboxedEnvironment`, і навіть він не замінює рев'ю.

> **JS-аналог.** JSX-звичка тягне логіку в розмітку: `.filter().map()`, обчислення класів, форматування дат прямо в `{}`. У Jinja вираз свідомо бідніший, і відповідь на "як тут написати filter" зазвичай не хитрий фільтр, а підготовка даних у Python: відфільтрований кортеж, готовий рядок класів, готовий рядок CSS-змінних. Шаблон лише розкладає готове по місцях.

## Macro, extends, include: композиція без компонентів

Повторне використання дають три механізми. Макрос (macro, офіційна назва) це функція, що повертає розмітку; її імпортують з іншого шаблону через `{% import "macros.html" as ui %}` і викликають `{{ ui.input(...) }}`. `{% extends %}` з `{% block %}` це наслідування: дочірній шаблон оголошує батька й перевизначає його блоки, а `{{ super() }}` вставляє вміст батьківського блоку. `{% include %}` вставляє інший шаблон цілком з поточним контекстом.

```python
from jinja2 import DictLoader, Environment, select_autoescape

templates = {
    "base.html": """\
<!doctype html>
<title>{% block title %}FormBuilder{% endblock %}</title>
<main>
{% block body %}{% endblock %}
</main>
{% include "footer.html" %}
""",
    "footer.html": "<footer>Made with FormBuilder</footer>",
    "macros.html": """\
{% macro input(name, label, type="text") -%}
<label>{{ label }} <input name="{{ name }}" type="{{ type }}"></label>
{%- endmacro %}
""",
    "form.html": """\
{% extends "base.html" %}
{% import "macros.html" as ui %}
{% block title %}{{ title }} | {{ super() }}{% endblock %}
{% block body %}
<form>
  {{ ui.input("email", "Email", type="email") }}
  {{ ui.input("company", "Company & Co") }}
</form>
{% endblock %}
""",
}
env = Environment(
    loader=DictLoader(templates),
    autoescape=select_autoescape(),
    trim_blocks=True,
    lstrip_blocks=True,
)
print(env.get_template("form.html").render(title="Sign up"))
```

```text
<!doctype html>
<title>Sign up | FormBuilder</title>
<main>
<form>
  <label>Email <input name="email" type="email"></label>
  <label>Company &amp; Co <input name="company" type="text"></label>
</form>
</main>
<footer>Made with FormBuilder</footer>
```

Порівняно з Next.js напрям інвертований. Там layout обгортає сторінку, і сторінка про layout не знає; тут сторінка сама пише `{% extends "base.html" %}` і заповнює дірки, а текст поза `{% block %}` після `{% extends %}` у дочірньому шаблоні ігнорується. Макрос схожий на функціональний компонент без стану: немає hooks, немає життєвого циклу, замість `children` є `{% call %}` з `caller()`, які для елементів форми майже не потрібні. Якщо макрос обростає умовами й обчисленнями, це той самий сигнал, що й вище: логіку в Python, у макрос лише розмітку.

## Автоекранування, `Markup` і `|safe`

Як Jinja відрізняє рядок, який треба екранувати, від готової розмітки? За типом. `markupsafe.Markup` це підклас `str` зі значенням "це вже безпечний HTML". `escape()` повертає `Markup`, повторний `escape` його не чіпає, а `Markup` у парі зі звичайним `str` (через `+`, `%`, `.format`, `.join`) екранує саме `str`. Вивід макроса теж `Markup`, тому вкладені макроси не дають `&amp;amp;`.

```python
from markupsafe import Markup, escape

user = "<script>steal()</script>"
safe = escape(user)
print(type(safe).__name__, safe)
print(escape(safe))
print(Markup("<b>") + user)
print(Markup("<b>{}</b>").format(user))
print(Markup(f"<b>{user}</b>"))
print(isinstance(safe, str))
```

```text
Markup &lt;script&gt;steal()&lt;/script&gt;
&lt;script&gt;steal()&lt;/script&gt;
<b>&lt;script&gt;steal()&lt;/script&gt;
<b>&lt;script&gt;steal()&lt;/script&gt;</b>
<b><script>steal()</script></b>
True
```

Передостанній рядок і є головна пастка. `Markup(f"<b>{user}</b>")` спершу підставляє рядок f-рядком без жодного екранування, а потім оголошує результат безпечним. Правильна форма `Markup("<b>{}</b>").format(user)`: довірений лише літерал розмітки, аргументи екрануються. Фільтр `|safe` у шаблоні робить те саме, що `Markup(value)`, тобто вимикає екранування для одного значення.

```python
from jinja2 import Environment

env = Environment(autoescape=True)
template = env.from_string("<label>{{ label }}</label> <label>{{ label | safe }}</label>")
print(template.render(label="<b>Email</b> <img src=x onerror=alert(1)>"))

macro_twice = env.from_string(
    "{% macro bold(text) %}<b>{{ text }}</b>{% endmacro %}"
    "{{ bold(bold('A & B')) }}"
)
print(macro_twice.render())
```

```text
<label>&lt;b&gt;Email&lt;/b&gt; &lt;img src=x onerror=alert(1)&gt;</label> <label><b>Email</b> <img src=x onerror=alert(1)></label>
<b><b>A &amp; B</b></b>
```

Що це означає для `label` у FormBuilder: автор форми пише в конструкторі `<b>Email</b>` і бачить на сторінці теги текстом. Це правильна поведінка, а не баг. Якщо продукт хоче форматування в підписах, рішення не `|safe`, а sanitizer зі списком дозволених тегів під час збереження конфігу (наприклад, бібліотека `nh3`), після чого очищений HTML загортають у `Markup` у Python-коді, один раз і в одному місці. `|safe` доречний для HTML, який згенерував ваш власний код, і більше ні для чого.

> **JS-аналог.** `|safe` це `dangerouslySetInnerHTML`. У React-кодобазах він трапляється як норма для "HTML з CMS"; у генераторі статики той самий рефлекс дає stored XSS на кожній опублікованій формі, причому з вашого домену.

<!-- task: q2 -->

## Контекст: dataclass, dict, `Undefined` і `None`

Контекст це словник імен, доступних шаблону, а значення будь-які Python-об'єкти: frozen dataclass з m2-l05 передаються як є, без `asdict`. `{{ a.b }}` спершу пробує `getattr(a, "b")`, потім `a["b"]`; `{{ a["b"] }}` пробує в зворотному порядку. Тому крапка працює і для dataclass, і для dict, як для об'єкта в JS.

```python
from dataclasses import dataclass

from jinja2 import Environment


@dataclass(frozen=True)
class Theme:
    mode: str = "light"
    primary_color: str = "#2563eb"


env = Environment(autoescape=True)
t = env.from_string(
    "{{ theme.mode }} {{ theme['primary_color'] }} | {{ cfg.mode }} {{ cfg['mode'] }}"
)
print(t.render(theme=Theme(), cfg={"mode": "dark"}))

meta = {"items": 3, "title": "Order"}
print(env.from_string("{{ meta.title }}: {{ meta['items'] }} / {{ meta.items }}").render(meta=meta))
```

```text
light #2563eb | dark dark
Order: 3 / &lt;built-in method items of dict object at 0x103947880&gt;
```

> **Пастка.** Ключ словника з іменем методу `dict` (`items`, `keys`, `values`, `get`, `update`) через крапку повертає метод, бо `getattr` іде першим. Для таких ключів пишіть `meta['items']`, а краще передавайте в контекст dataclass замість dict.

Відсутня змінна за замовчуванням не помилка: значення `Undefined` друкується порожнім рядком, а падає лише спроба взяти з нього атрибут. Опечатка `titel` дає порожній `<h1>` в опублікованій сторінці. `StrictUndefined` робить помилкою будь-яке використання невизначеного значення, при цьому `is defined` і `|default` працюють. Для генератора статики, де шаблони й дані контролюєте ви, це правильний режим: помилка падає в тесті, а не в продакшні.

```python
from jinja2 import Environment, StrictUndefined, UndefinedError

loose = Environment(autoescape=True)
print(repr(loose.from_string("<h1>{{ titel }}</h1>").render(title="Sign up")))
try:
    loose.from_string("{{ theme.mode }}").render()
except UndefinedError as e:
    print("UndefinedError:", e)

strict = Environment(autoescape=True, undefined=StrictUndefined)
try:
    strict.from_string("<h1>{{ titel }}</h1>").render(title="Sign up")
except UndefinedError as e:
    print("UndefinedError:", e)
print(strict.from_string("{{ hint | default('no hint') }}|{% if hint is defined %}set{% endif %}").render())
```

```text
'<h1></h1>'
UndefinedError: 'theme' is undefined
UndefinedError: 'titel' is undefined
no hint|
```

`None` у контексті це визначене значення, а не `Undefined`. Воно друкується рядком `None`, і `|default` його не ловить, бо реагує лише на `Undefined`. Для порожніх значень є `|default(x, true)` (спрацьовує на будь-яке хибне значення, включно з `""`), `or`, або `{% if %}` навколо всього елемента, що з погляду розмітки зазвичай і правильно: немає підказки, немає `<small>`.

```python
from jinja2 import Environment

env = Environment(autoescape=True)
ctx = {"hint": None, "empty": ""}
print(env.from_string("<small>{{ hint }}</small>").render(ctx))
print(env.from_string("<small>{{ hint | default('—') }}</small>").render(ctx))
print(env.from_string("<small>{{ hint | default('—', true) }}</small>").render(ctx))
print(env.from_string("<small>{{ empty or '—' }}</small>").render(ctx))
print(env.from_string("{% if hint %}<small>{{ hint }}</small>{% endif %}|{{ hint is none }}").render(ctx))
```

```text
<small>None</small>
<small>None</small>
<small>—</small>
<small>—</small>
|True
```

<!-- task: q3 -->

<!-- task: t2 -->

## Дерево елементів: рекурсивний macro і диспетчеризація за типом

Форма FormBuilder це дерево: блоки містять елементи й інші блоки. Перший спосіб обійти його в Jinja це рекурсивний макрос, який викликає сам себе для дітей. Диспетчеризацію за `type` зручніше робити словником `тип -> макрос`, ніж ланцюжком `{% if el.type == "input" %}...{% elif %}`: новий тип елемента це новий макрос і один рядок у словнику, як реєстр рендерерів з m2-l07. Другий спосіб `{% for ... recursive %}`: виклик `loop(children)` запускає той самий цикл для дітей, а `loop.depth` дає глибину від 1. Він зручний для плоских обходів з відступами, як outline нижче, а для HTML із вкладеною розміткою макрос читається краще.

```python
from dataclasses import dataclass

from jinja2 import DictLoader, Environment, StrictUndefined, select_autoescape


@dataclass(frozen=True)
class Element:
    type: str
    id: str
    label: str = ""
    name: str | None = None
    children: tuple["Element", ...] = ()


templates = {
    "elements.html": """\
{% macro input(el) %}<label>{{ el.label }} <input name="{{ el.name }}"></label>{% endmacro %}
{% macro text(el) %}<p>{{ el.label }}</p>{% endmacro %}
{% macro button(el) %}<button>{{ el.label }}</button>{% endmacro %}
{% macro block(el) %}<fieldset>{% for child in el.children %}{{ render(child) }}{% endfor %}</fieldset>{% endmacro %}
{% macro render(el) %}{{ {"input": input, "text": text, "button": button, "block": block}[el.type](el) }}{% endmacro %}
""",
    "outline.txt": """\
{% for el in elements recursive %}
{{ "  " * (loop.depth - 1) }}{{ loop.depth }}. {{ el.type }} {{ el.id }}
{% if el.children %}{{ loop(el.children) }}{% endif %}
{% endfor %}
""",
}
env = Environment(
    loader=DictLoader(templates),
    autoescape=select_autoescape(),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
form = (
    Element("input", "e1", "Email", name="email"),
    Element("block", "b1", children=(
        Element("text", "t1", "Company <optional>"),
        Element("input", "e2", "Company", name="company"),
    )),
    Element("button", "s1", "Send"),
)
ui = env.get_template("elements.html").module
print("".join(ui.render(el) for el in form))
print(env.get_template("outline.txt").render(elements=form))
```

```text
<label>Email <input name="email"></label><fieldset><p>Company &lt;optional&gt;</p><label>Company <input name="company"></label></fieldset><button>Send</button>
1. input e1
1. block b1
  2. text t1
  2. input e2
1. button s1
```

`get_template(...).module` віддає макроси шаблону як Python-callables, тож макрос можна викликати з коду чи з тесту без окремого шаблону-обгортки. Critical CSS у FormBuilder інлайниться в `<style>` через `{% include "critical.css" %}`; статичний текст шаблону ніколи не екранується, тож `>` у селекторах доходить як є, екранується лише вивід `{{ }}`.

## Продуктивність і тестування рендера

`get_template` читає файл, парсить його, генерує Python-код і компілює в байткод. Результат кешується в `Environment` за іменем шаблону (LRU на 400 шаблонів за замовчуванням), тому другий `get_template` повертає той самий об'єкт, а рендер це лише виклик готової функції. Новий `Environment` має порожній кеш і компілює все наново.

```python
from jinja2 import Environment, FunctionLoader


def load(name: str) -> str:
    print("load and compile", name)
    return "<h1>{{ title }}</h1>"

env = Environment(loader=FunctionLoader(load), autoescape=True)
first = env.get_template("page.html")
second = env.get_template("page.html")
print(first is second, env.cache.capacity)
for title in ["A", "B"]:
    print(env.get_template("page.html").render(title=title))

per_request = [Environment(loader=FunctionLoader(load)).get_template("page.html") for _ in range(2)]
```

```text
load and compile page.html
True 400
<h1>A</h1>
<h1>B</h1>
load and compile page.html
load and compile page.html
```

> **Під капотом.** Скомпільований шаблон це генератор, що віддає шматки рядка, і кожна вставка обгорнута `escape`, якщо автоекранування для шаблону ввімкнене. Тому `select_autoescape` вирішує долю шаблону один раз, за іменем, під час компіляції, а не на кожному рендері.

```python
from jinja2 import Environment

env = Environment(autoescape=True)
source = env.compile("<h1>{{ title }}</h1>", raw=True)
print("\n".join(line for line in source.splitlines() if line.startswith("    yield ")))
```

```text
    yield '<h1>'
    yield escape((undefined(name='title') if l_0_title is missing else l_0_title))
    yield '</h1>'
```

`render` синхронний і навантажує CPU. Для однієї форми це частки мілісекунди, але в asyncio-воркері (m7-l03) рендер великої сторінки чи пачки сторінок блокує event loop разом з усіма WebSocket-статусами (m7-l04). Рішення з m5-l08: `await asyncio.to_thread(renderer.render, form, theme)`. `Environment(enable_async=True)` вирішує іншу задачу, асинхронні джерела даних усередині шаблону, і CPU-роботу з event loop не прибирає.

> **Пастка.** `Environment` усередині FastAPI-обробника чи функції, яку воркер викликає на кожну задачу, компілює шаблони на кожен виклик. Створюйте його один раз: атрибут рендерера, створеного при старті застосунку, або змінна модуля.

HTML-рендер перевіряють golden-тестом (golden file, жаргон спільноти; у Jest те саме називають snapshot-тестом): еталонний HTML лежить у `tests/fixtures`, тест рендерить ту саму форму й порівнює. Порівнюють після нормалізації пробілів, щоб зміна відступу в шаблоні не валила тест, а зміна тегу чи атрибута валила. Еталон генерують тим самим рендерером і перечитують очима перед комітом: ручний еталон з `&quot;` замість `&#34;` дасть хибну розбіжність. Екранування перевіряють окремим тестом з навмисно ворожим `label`, щоб ця гарантія не губилася серед еталонів.

```python
import re
from pathlib import Path

import pytest

from formbuilder.domain import Element, Theme
from formbuilder.renderers.jinja import JinjaRenderer

FIXTURES = Path(__file__).parent / "fixtures"


def normalize(html: str) -> str:
    html = re.sub(r">\s+<", "><", html.strip())
    return re.sub(r"\s+", " ", html)


@pytest.fixture(scope="module")
def renderer() -> JinjaRenderer:
    return JinjaRenderer()


def signup_form() -> Element:
    return Element(type="block", id="signup", label="Sign up", children=(
        Element(type="input", id="e1", name="email", label="Email"),
        Element(type="block", id="b1", children=(
            Element(type="text", id="t1", label="Company <optional>"),
            Element(type="input", id="e2", name="company", label="Company & Co"),
        )),
        Element(type="button", id="s1", label="Send"),
    ))


def test_matches_golden_html(renderer: JinjaRenderer) -> None:
    html = renderer.render(signup_form(), Theme(mode="dark", primary_color="#16a34a"))
    expected = (FIXTURES / "signup_dark.html").read_text(encoding="utf-8")
    assert normalize(html) == normalize(expected)


def test_label_is_escaped(renderer: JinjaRenderer) -> None:
    form = Element(type="block", id="f", label="X", children=(
        Element(type="text", id="t", label="<script>alert(1)</script>"),
    ))
    html = renderer.render(form, Theme())
    assert "<script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
```

```text
$ pytest tests/test_jinja_renderer.py -q
..                                                                       [100%]
2 passed in 0.05s
```

<!-- task: t3 -->

Останнє завдання з кодом збирає механізм уроку в мініатюрі: пошук значення через крапку для dict і об'єктів, екранування за замовчуванням, `| safe` як явний виняток і помилка на невизначеному імені, як у `StrictUndefined`.

<!-- task: t4 -->

## Для капстоуну

`JinjaRenderer` реалізує `Renderer` Protocol з m2-l07 напряму, без `BaseRenderer` з m4-l05: дерево обходить рекурсивний макрос, тож Python-частині лишається створити `Environment` і передати контекст. Воркер і реєстр рендерерів цієї різниці не бачать, бо спираються лише на метод `render(element, theme) -> str`.

```text
src/formbuilder/
├── domain.py            # Theme, Element з m2-l05
├── renderers/
│   ├── __init__.py      # available_formats(), get_renderer() з m3-l01
│   ├── base.py          # Renderer Protocol з m2-l07
│   └── jinja.py         # JinjaRenderer і renderer = JinjaRenderer()
└── templates/
    ├── base.html
    ├── critical.css
    ├── elements.html
    └── form.html
```

```python
# src/formbuilder/renderers/jinja.py
from jinja2 import Environment, PackageLoader, StrictUndefined, select_autoescape

from formbuilder.domain import Element, Theme


class JinjaRenderer:
    def __init__(self, lang: str = "uk") -> None:
        self.lang = lang
        self.env = Environment(
            loader=PackageLoader("formbuilder", "templates"),
            autoescape=select_autoescape(),
            undefined=StrictUndefined,
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True,
        )

    def render(self, element: Element, theme: Theme) -> str:
        template = self.env.get_template("form.html")
        return template.render(form=element, theme=theme, lang=self.lang)


renderer = JinjaRenderer()  # get_renderer("jinja") з m3-l01 знаходить його за іменем модуля
```

```jinja
{# templates/base.html #}
<!doctype html>
<html lang="{{ lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{% block title %}{% endblock %}</title>
<style>
:root { --fb-primary: {{ theme.primary_color }}; }
{% include "critical.css" %}
</style>
</head>
<body class="fb-theme-{{ theme.mode }}">
{% block body %}{% endblock %}
</body>
</html>
```

```jinja
{# templates/form.html #}
{% extends "base.html" %}
{% import "elements.html" as ui %}
{% block title %}{{ form.label }}{% endblock %}
{% block body %}
<form class="fb-form" id="{{ form.id }}" method="post">
{% for el in form.children %}
{{ ui.render(el) }}
{%- endfor %}
</form>
{% endblock %}
```

```jinja
{# templates/elements.html #}
{% macro input(el) %}
<label for="{{ el.id }}">{{ el.label }}</label>
<input id="{{ el.id }}" name="{{ el.name }}">
{% endmacro %}

{% macro text(el) %}
<p>{{ el.label }}</p>
{% endmacro %}

{% macro button(el) %}
<button type="submit">{{ el.label }}</button>
{% endmacro %}

{% macro block(el) %}
<div class="fb-block" id="{{ el.id }}">
{% for child in el.children %}
{{ render(child) }}
{%- endfor %}
</div>
{% endmacro %}

{% set by_type = {"input": input, "text": text, "button": button, "block": block} %}

{% macro render(el) %}
{{- by_type[el.type](el) -}}
{% endmacro %}
```

```css
/* templates/critical.css */
.fb-form { display: grid; gap: 12px; padding: 16px; }
.fb-form > label { font-weight: 600; }
.fb-form button { background: var(--fb-primary); color: #fff; }
@media (min-width: 640px) { .fb-form { max-width: 560px; margin: 0 auto; } }
```

```python
from formbuilder.domain import Element, Theme
from formbuilder.renderers.jinja import JinjaRenderer

form = Element(type="block", id="signup", label="Sign up", children=(
    Element(type="input", id="e1", name="email", label="Email"),
    Element(type="block", id="b1", children=(
        Element(type="text", id="t1", label="Company <optional>"),
        Element(type="input", id="e2", name="company", label="Company & Co"),
    )),
    Element(type="button", id="s1", label="Send"),
))
print(JinjaRenderer().render(form, Theme(mode="dark", primary_color="#16a34a")))
```

```text
<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign up</title>
<style>
:root { --fb-primary: #16a34a; }
.fb-form { display: grid; gap: 12px; padding: 16px; }
.fb-form > label { font-weight: 600; }
.fb-form button { background: var(--fb-primary); color: #fff; }
@media (min-width: 640px) { .fb-form { max-width: 560px; margin: 0 auto; } }
</style>
</head>
<body class="fb-theme-dark">
<form class="fb-form" id="signup" method="post">
<label for="e1">Email</label>
<input id="e1" name="email">
<div class="fb-block" id="b1">
<p>Company &lt;optional&gt;</p>
<label for="e2">Company &amp; Co</label>
<input id="e2" name="company">
</div>
<button type="submit">Send</button>
</form>
</body>
</html>
```

Тема потрапляє в сторінку як CSS-змінна в `:root`, а `critical.css` читає її через `var(--fb-primary)`: стилі статичні й однакові для всіх форм, від форми до форми змінюються лише значення змінних. Адаптивність дає `@media` у тому ж critical CSS, без жодного JS на сторінці. `StrictUndefined` тут не формальність: шаблонів четверо, і опечатка в імені поля в одному з них має валити тест.

> **Пастка.** Значення теми всередині `<style>` HTML-екранування захищає лише від `</style>`; від CSS-ін'єкції на кшталт `red; } body { display: none` воно не захищає. Колір валідують на вході шаблоном `^#[0-9a-fA-F]{6}$` у Pydantic-моделі (m2-l09), тож до шаблону доходить лише перевірене значення.

Воркер з m7-l03 отримує рендерер як залежність типу `Renderer`, створену один раз, і виносить рендер з event loop через `to_thread`:

```python
import asyncio
import tempfile
from pathlib import Path

from formbuilder.domain import Element, Theme
from formbuilder.renderers import Renderer
from formbuilder.renderers.jinja import JinjaRenderer


async def build_page(
    form: Element, theme: Theme, renderer: Renderer, out_dir: Path
) -> Path:
    html = await asyncio.to_thread(renderer.render, form, theme)
    target = out_dir / form.id / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")
    return target


async def main() -> None:
    renderer = JinjaRenderer()
    form = Element(type="block", id="signup", label="Sign up", children=(
        Element(type="input", id="e1", name="email", label="Email"),
    ))
    with tempfile.TemporaryDirectory() as tmp:
        page = await build_page(form, Theme(), renderer, Path(tmp))
        print(page.relative_to(tmp), page.read_text(encoding="utf-8").count("<input"))


asyncio.run(main())
```

```text
signup/index.html 1
```

```text
$ mypy --strict src/formbuilder demo_worker.py
Success: no issues found in 6 source files
```

<!-- task: p1 -->

<!-- task: p2 -->

## Типові помилки JS-розробника

1. **HTML через f-рядок, як через template literal.** Працює, доки в `label` не прийде `<`. Правильно: шаблон з автоекрануванням, або хоча б `html.escape` на кожну вставку.

   ```python
   html = f"<label>{label}</label>"                                       # XSS
   html = env.from_string("<label>{{ label }}</label>").render(label=label)  # екранується
   ```

2. **`Environment()` без `autoescape`, бо в Nunjucks екранування ввімкнене за замовчуванням.** Тут воно вимкнене, і помилки немає. Правильно: `autoescape=select_autoescape()` у кожному `Environment`, що рендерить HTML.

   ```python
   env = Environment(loader=PackageLoader("formbuilder", "templates"), autoescape=select_autoescape())
   ```

3. **`|safe` і `Markup` як `dangerouslySetInnerHTML` "для HTML з конфігу".** Дає stored XSS у кожній опублікованій формі; `Markup(f"...")` дає його навіть без `|safe` у шаблоні. Правильно: user-content завжди екранується, форматування лише після sanitizer, `Markup` лише над літералом.

   ```python
   Markup(f"<b>{label}</b>")           # небезпечно
   Markup("<b>{}</b>").format(label)   # аргумент екранується
   ```

4. **JS-вирази в `{{ }}`.** `===`, `&&`, стрілкові функції, `.map` з колбеком: `TemplateSyntaxError` ще під час компіляції. Правильно: `==`, `and`, `not`, фільтри `map`/`select`, а складне в Python до рендера.

   ```jinja
   {{ a === b }}              {# TemplateSyntaxError: unexpected '=' #}
   {{ a == b and not c }}
   {{ fields | map(attribute='label') | join(', ') }}
   ```

5. **JSX-мислення: макрос як компонент з логікою.** Обчислення класів, фільтрація й форматування в шаблоні роблять його нечитабельним і нетестованим. Правильно: готувати контекст у Python (рядок CSS-змінних, відфільтровані елементи), шаблон лише розкладає.

   ```python
   template.render(form=form, theme=theme, css_vars=css_vars(theme))
   ```

6. **Розраховувати, що опечатка в імені впаде, як `ReferenceError`.** За замовчуванням `Undefined` тихо друкується порожнім рядком. Правильно: `undefined=StrictUndefined`.

   ```python
   env = Environment(autoescape=True, undefined=StrictUndefined)
   ```

7. **`|default` як `??` для `None`.** `None` визначене значення, і фільтр його пропускає. Правильно: `|default(x, true)` або `{% if %}`.

   ```jinja
   {{ hint | default('-') }}        {# None #}
   {{ hint | default('-', true) }}  {# - #}
   ```

8. **`Environment` на кожен запит чи задачу.** Кожен новий екземпляр компілює шаблони заново. Правильно: один на застосунок, як атрибут рендерера, створеного при старті.

   ```python
   renderer = JinjaRenderer()  # один раз при старті, далі передається воркеру
   ```

## Підсумок

- Шаблонізатор дає екранування за замовчуванням, цикли й умови в розмітці і наслідування; Nunjucks це порт Jinja2, синтаксис той самий.
- `Environment` це конфігурація, loader і кеш; один на застосунок.
- Шаблони пакета через `PackageLoader("formbuilder", "templates")`, а не через `__file__`.
- `Environment()` за замовчуванням не екранує; `autoescape=select_autoescape()` вмикає екранування за розширенням.
- `{{ }}` друкує обмежений Python-подібний вираз, `{% %}` керує, `|` застосовує фільтр; власні фільтри в `env.filters`.
- Макрос для повторюваного елемента, `extends`/`block` для базової сторінки, `include` для вставки як є.
- `Markup` позначає безпечний HTML; `|safe` і `Markup(f"...")` над user-content це XSS.
- Крапка пробує атрибут, потім ключ; dataclass і dict однаково зручні в контексті.
- `StrictUndefined` перетворює опечатки на помилки; `None` друкується як `None`, і `|default` його не ловить.
- Рендер синхронний: у воркері через `asyncio.to_thread`; перевірка golden-тестом з нормалізацією пробілів і окремим тестом екранування.

## Що далі

Наступний урок m7-l07 пакує капстоун: uvicorn, Dockerfile з uv, змінні оточення. Шаблони з цього уроку там стають перевіркою пакування: якщо `templates/` не потрапили у wheel чи образ, `PackageLoader` впаде при першому рендері, тож golden-тест варто запускати і проти встановленого пакета. Альтернативу Jinja, зовнішній Node-рендерер через subprocess, розібрано в m6-l05, і обидва варіанти живуть у капстоуні за одним `Renderer` Protocol.
