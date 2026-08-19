import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderJira } from '../src/parser/index.ts';

const render = (source: string) => renderJira(source);
/** Разметка Confluence отрисовывается только в одноимённом диалекте. */
const renderConfluence = (source: string) => renderJira(source, { dialect: 'confluence' });

test('заголовки', () => {
  assert.match(render('h1. Привет'), /<h1 data-line="0" id="привет">Привет<\/h1>/);
  assert.match(render('h3. Раздел'), /<h3 [^>]*>Раздел<\/h3>/);
  assert.doesNotMatch(render('h7. Не заголовок'), /<h7/);
});

test('форматирование текста', () => {
  assert.match(render('это *жирный* текст'), /<strong>жирный<\/strong>/);
  assert.match(render('это _курсив_ текст'), /<em>курсив<\/em>/);
  assert.match(render('это -зачёркнутый- текст'), /<del>зачёркнутый<\/del>/);
  assert.match(render('это +подчёркнутый+ текст'), /<ins>подчёркнутый<\/ins>/);
  assert.match(render('x^2^'), /<sup>2<\/sup>/);
  assert.match(render('H~2~O'), /<sub>2<\/sub>/);
  assert.match(render('??цитата??'), /<cite>цитата<\/cite>/);
  assert.match(render('{{код}}'), /<code class="jira-mono">код<\/code>/);
});

test('форматирование не срабатывает внутри слова', () => {
  assert.doesNotMatch(render('some_snake_case_name тут'), /<em>/);
  assert.doesNotMatch(render('файл-с-дефисами'), /<del>/);
  assert.doesNotMatch(render('2 * 3 * 4'), /<strong>/);
});

test('вложенное форматирование', () => {
  assert.match(render('*жирный _и курсив_*'), /<strong>жирный <em>и курсив<\/em><\/strong>/);
});

test('HTML экранируется', () => {
  const html = render('<script>alert(1)</script> & "кавычки"');
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('маркированный и нумерованный списки', () => {
  const html = render('* один\n* два\n** вложенный');
  assert.match(html, /<ul><li[^>]*>один<\/li><li[^>]*>два<ul><li[^>]*>вложенный<\/li><\/ul><\/li><\/ul>/);
  assert.match(render('# раз\n# два'), /<ol><li[^>]*>раз<\/li><li[^>]*>два<\/li><\/ol>/);
});

test('одинаковые маркеры всегда на одном уровне', () => {
  // Таблица прерывает список, и следующий блок начинается сразу с `**`.
  const html = render('* верх\n||a||b||\n|1|2|\n** первый\n** второй\n*** глубже\n*** ещё глубже');
  assert.match(
    html,
    /<ul class="jira-list-depth-2"><li[^>]*>первый<\/li><li[^>]*>второй<ul><li[^>]*>глубже<\/li><li[^>]*>ещё глубже<\/li><\/ul><\/li><\/ul>/,
  );
});

test('список, начатый с глубины, получает отступ', () => {
  assert.match(render('** сразу второй уровень'), /<ul class="jira-list-depth-2">/);
  assert.match(render('*** сразу третий'), /<ul class="jira-list-depth-3">/);
  // Обычный список отступа не получает.
  assert.doesNotMatch(render('* обычный'), /jira-list-depth/);
  // Вложенные списки отступ не дублируют — они уже внутри <li>.
  assert.equal(render('* a\n** b').match(/jira-list-depth/g), null);
});

test('пропуск уровня не ломает соседство', () => {
  const html = render('* a\n*** глубоко\n*** рядом\n* b');
  assert.match(
    html,
    /<li[^>]*>a<ul><li[^>]*>глубоко<\/li><li[^>]*>рядом<\/li><\/ul><\/li><li[^>]*>b<\/li>/,
  );
});

test('смешанная вложенность списков', () => {
  const html = render('* пункт\n#* подпункт'.replace('#*', '*#'));
  assert.match(html, /<ul><li[^>]*>пункт<ol><li[^>]*>подпункт<\/li><\/ol><\/li><\/ul>/);
});

test('таблица с заголовком', () => {
  const html = render('||A||B||\n|1|2|');
  assert.match(html, /<div class="jira-table-wrap" data-line="0"><table class="jira-table">/);
  assert.match(html, /<thead>/);
  assert.match(html, /<th>A<\/th><th>B<\/th>/);
  assert.match(html, /<tbody><tr[^>]*><td>1<\/td><td>2<\/td><\/tr><\/tbody>/);
});

test('вертикальная черта внутри ссылки не рвёт ячейку', () => {
  const html = render('|[текст|https://example.com]|вторая|');
  assert.match(html, /<td><a href="https:\/\/example.com">текст<\/a><\/td><td>вторая<\/td>/);
});

test('блок кода сохраняет содержимое дословно', () => {
  const html = render('{code:java}\nif (a < b) { *x*; }\n{code}');
  assert.match(html, /class="jira-code-content language-java"/);
  assert.match(html, /if \(a &lt; b\) \{ \*x\*; \}/);
  assert.doesNotMatch(html, /<strong>/);
});

test('блок кода с заголовком', () => {
  const html = render('{code:java|title=Foo.java}\nx\n{code}');
  assert.match(html, /<div class="jira-code-title">Foo\.java<\/div>/);
  assert.match(html, /language-java/);
});

test('подсветка кода вставляется как есть', () => {
  const html = renderJira('{code:java}\nint x = 1;\n{code}', {
    highlightCode: (code, language) => `<span class="hljs-test">${language}:${code}</span>`,
  });
  assert.match(html, /class="jira-code-content language-java hljs"/);
  assert.match(html, /<span class="hljs-test">java:int x = 1;<\/span>/);
});

test('без языка подсветка не вызывается', () => {
  let called = false;
  const html = renderJira('{code}\nx < 1\n{code}', {
    highlightCode: () => {
      called = true;
      return 'подсвечено';
    },
  });
  assert.equal(called, false);
  assert.match(html, /x &lt; 1/);
  assert.doesNotMatch(html, / hljs"/);
});

test('noformat не подсвечивается', () => {
  let called = false;
  renderJira('{noformat}\nx\n{noformat}', {
    highlightCode: () => {
      called = true;
      return 'подсвечено';
    },
  });
  assert.equal(called, false);
});

test('если подсветка вернула null, код экранируется', () => {
  const html = renderJira('{code:неизвестный}\n<b>x</b>\n{code}', {
    highlightCode: () => null,
  });
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(html, / hljs"/);
});

test('{code} внутри строки отрисовывается как код', () => {
  const html = render('смотри {code:java}int x = 1;{code} вот так');
  assert.match(html, /<code class="jira-code-inline language-java">int x = 1;<\/code>/);
  assert.match(html, /смотри /);
  assert.match(html, / вот так/);
});

test('{code} внутри ячейки таблицы', () => {
  const html = render('||now||new||\n| {code:java}$code = "sbp";{code} | {code}x{code} |');
  assert.match(html, /<td><code class="jira-code-inline language-java">\$code = &quot;sbp&quot;;<\/code><\/td>/);
  assert.match(html, /<td><code class="jira-code-inline">x<\/code><\/td>/);
});

test('{noformat} внутри строки', () => {
  assert.match(render('вот {noformat}*как есть*{noformat} тут'), /<code class="jira-code-inline">\*как есть\*<\/code>/);
});

test('инлайновый {code} подсвечивается тем же обработчиком', () => {
  const html = renderJira('| {code:java}x{code} |', {
    highlightCode: (code, language) => `<i>${language}:${code}</i>`,
  });
  assert.match(html, /class="jira-code-inline language-java hljs"><i>java:x<\/i>/);
});

test('{code} на отдельной строке остаётся блоком', () => {
  const html = render('{code:java}\nint x = 1;\n{code}');
  assert.match(html, /<div class="jira-code"/);
  assert.doesNotMatch(html, /jira-code-inline/);
});

test('незакрытый инлайновый {code} не съедает текст', () => {
  const html = render('текст {code:java} без закрытия');
  assert.match(html, /\{code:java\} без закрытия/);
});

test('noformat', () => {
  const html = render('{noformat}\n*как есть*\n{noformat}');
  assert.match(html, /\*как есть\*/);
  assert.doesNotMatch(html, /<strong>/);
});

test('панель с заголовком', () => {
  const html = render('{panel:title=Итог}\nтекст\n{panel}');
  assert.match(html, /<div class="jira-panel-title"[^>]*>Итог<\/div>/);
  assert.match(html, /<div class="jira-panel-body"><p[^>]*><span[^>]*>текст<\/span><\/p><\/div>/);
});

test('макросы-сообщения в диалекте Confluence', () => {
  assert.match(renderConfluence('{note}\nтекст\n{note}'), /class="jira-msg jira-msg-note"/);
  assert.match(renderConfluence('{warning}\nтекст\n{warning}'), /class="jira-msg jira-msg-warning"/);
  assert.match(
    renderConfluence('{info:title=Инфо}\nтекст\n{info}'),
    /<div class="jira-msg-title">Инфо<\/div>/,
  );
});

test('цитаты', () => {
  assert.match(render('bq. цитата'), /<blockquote class="jira-quote"[^>]*><p>цитата<\/p><\/blockquote>/);
  assert.match(render('{quote}\nтекст\n{quote}'), /<blockquote class="jira-quote"/);
});

test('ссылки', () => {
  assert.match(render('[https://example.com]'), /<a href="https:\/\/example.com">https:\/\/example.com<\/a>/);
  assert.match(render('[тут|https://example.com]'), /<a href="https:\/\/example.com">тут<\/a>/);
  assert.match(render('[тут|https://example.com|подсказка]'), /title="подсказка"/);
  assert.match(render('[#якорь]'), /<a href="#якорь">/);
  assert.match(render('[^файл.pdf]'), /class="jira-attachment"/);
});

test('javascript: в ссылке не проходит', () => {
  const html = render('[клик|javascript:alert(1)]');
  assert.doesNotMatch(html, /href/);
  assert.match(html, /jira-link-unresolved/);
});

test('упоминания и ключи задач с baseUrl', () => {
  const html = renderJira('[~ivanov] и [ABC-123]', { baseUrl: 'https://jira.example.com/' });
  assert.match(html, /href="https:\/\/jira\.example\.com\/secure\/ViewProfile\.jspa\?name=ivanov"/);
  assert.match(html, /href="https:\/\/jira\.example\.com\/browse\/ABC-123"/);
});

test('без baseUrl упоминание остаётся текстом', () => {
  assert.match(render('[~ivanov]'), /<span class="jira-mention">@ivanov<\/span>/);
});

test('автоссылки', () => {
  assert.match(render('см. https://example.com/a?b=1 дальше'), /<a href="https:\/\/example.com\/a\?b=1">/);
  assert.match(render('текст https://example.com.'), /<a href="https:\/\/example.com">/);
});

test('картинки', () => {
  assert.match(render('!pic.png!'), /<img class="jira-image" src="pic\.png"\/>/);
  assert.match(render('!pic.png|thumbnail!'), /class="jira-image jira-thumbnail"/);
  assert.match(render('!pic.png|width=300!'), /style="width:300px"/);
  assert.doesNotMatch(render('Внимание! Это важно!'), /<img/);
});

test('resolveImage подставляет URL', () => {
  const html = renderJira('!pic.png!', { resolveImage: () => 'vscode-resource://pic.png' });
  assert.match(html, /src="vscode-resource:\/\/pic\.png"/);
});

test('цвет', () => {
  assert.match(render('текст {color:red}важно{color} дальше'), /<span style="color:red">важно<\/span>/);
  assert.match(render('{color:#FF0000}важно{color}'), /color:#FF0000/);
  assert.match(render('{color:expression(evil)}x{color}'), /color:inherit/);
});

test('горизонтальная линия и тире', () => {
  assert.match(render('----'), /<hr data-line="0"\/>/);
  assert.match(render('раз --- два'), /&mdash;/);
  assert.match(render('раз -- два'), /&ndash;/);
});

test('перенос строки и экранирование', () => {
  assert.match(render('строка\\\\ещё'), /<br\/>/);
  assert.doesNotMatch(render('\\*не жирный\\*'), /<strong>/);
});

test('абзацы разделяются пустой строкой', () => {
  const html = render('первый\n\nвторой');
  assert.equal(html.match(/<p /g)?.length, 2);
});

test('строки внутри абзаца разделяются <br/>', () => {
  const html = render('первая\nвторая');
  assert.equal(html.match(/<p /g)?.length, 1);
  assert.match(html, /<br\/>/);
});

test('привязка к строкам исходника', () => {
  const html = render('h1. Заголовок\n\nабзац\n\n* пункт');
  assert.match(html, /<h1 data-line="0"/);
  assert.match(html, /<p data-line="2"/);
  assert.match(html, /<li data-line="4"/);
});

test('эмотиконы отрисовываются иконками Jira', () => {
  const html = render('(+) (-) (!) (/) (?)');
  assert.equal(html.match(/<span class="jira-emoticon"/g)?.length, 5);
  assert.equal(html.match(/<svg viewBox="0 0 16 16"/g)?.length, 5);
  assert.match(html, /title="\(!\)"/);
  // Цвета классического набора Atlassian: зелёный плюс, красный минус, синий вопрос
  assert.match(render('(+)'), /#14892c/);
  assert.match(render('(-)'), /#d04437/);
  assert.match(render('(?)'), /#3572b0/);
});

test('эмотиконы: синонимы и границы слова', () => {
  assert.match(render(':-) привет'), /jira-emoticon/);
  assert.match(render('(Y) ок'), /jira-emoticon/);
  assert.doesNotMatch(render('функция(x)вызов'), /jira-emoticon/);
  // (*r) не должен разбираться как (*)
  assert.equal(render('(*r)').match(/<svg/g)?.length, 1);
});

test('оглавление {toc}', () => {
  const html = renderConfluence('{toc}\n\nh1. Первый\n\nh2. Вложенный\n\nh1. Второй');
  assert.match(html, /<div class="jira-toc" data-line="0">/);
  assert.match(html, /<a href="#первый">Первый<\/a><ul class="jira-toc-list"><li><a href="#вложенный">/);
  // Оглавление стоит выше заголовков, но собирает их все.
  assert.match(html, /<a href="#второй">Второй<\/a>/);
});

test('{toc} с параметрами', () => {
  assert.match(
    renderConfluence('{toc:type=flat}\n\nh1. А\n\nh2. Б'),
    /class="jira-toc jira-toc-flat"/,
  );
  const levels = renderConfluence('{toc:minLevel=2|maxLevel=2}\n\nh1. А\n\nh2. Б\n\nh3. В');
  assert.match(levels, /href="#б"/);
  assert.doesNotMatch(levels, /href="#а"/);
  assert.doesNotMatch(levels, /href="#в"/);
});

test('{toc} без заголовков не ломается', () => {
  assert.match(renderConfluence('{toc}'), /class="jira-toc jira-toc-empty"/);
});

test('одинаковые заголовки получают разные якоря', () => {
  const html = render('h1. Итог\n\nh1. Итог\n\nh1. Итог');
  assert.match(html, /id="итог"/);
  assert.match(html, /id="итог-2"/);
  assert.match(html, /id="итог-3"/);
});

test('заголовок без букв всё равно получает якорь', () => {
  assert.match(render('h2. !!!'), /id="heading-1"/);
});

test('пустой документ', () => {
  assert.equal(render(''), '');
  assert.equal(render('\n\n\n'), '');
});

test('незакрытый макрос не роняет парсер', () => {
  assert.match(render('{code:java}\nx = 1'), /jira-code/);
  assert.match(render('{panel:title=A}\nтекст'), /jira-panel/);
});

test('диалект jira не отрисовывает макросы Confluence', () => {
  // Jira печатает незнакомый макрос как есть — превью обязано делать так же.
  for (const macro of ['info', 'note', 'tip', 'warning', 'excerpt', 'section', 'column']) {
    const html = render(`{${macro}}\nтекст\n{${macro}}`);
    assert.doesNotMatch(html, /jira-msg|jira-excerpt|jira-section|jira-column/);
    assert.match(html, new RegExp(`\\{${macro}\\}`));
  }
});

test('диалект jira оставляет {toc} и {status} текстом', () => {
  const toc = render('{toc}\n\nh1. Заголовок');
  assert.doesNotMatch(toc, /jira-toc/);
  assert.match(toc, /\{toc\}/);

  const status = render('Готово: {status:colour=Green|title=OK}');
  assert.doesNotMatch(status, /jira-status/);
  assert.match(status, /\{status:colour=Green\|title=OK\}/);
});

test('{toc} в диалекте jira не разрывает абзац', () => {
  const html = render('первая строка\n{toc}\nвторая строка');
  assert.equal(html.match(/<p /g)?.length, 1);
});

test('{status} отрисовывается в диалекте Confluence', () => {
  assert.match(
    renderConfluence('{status:colour=Green|title=Готово}'),
    /<span class="jira-status jira-status-green">Готово<\/span>/,
  );
});

test('{code} и {noformat} принимают параметры {panel}', () => {
  // Справка Jira: все необязательные параметры {panel} валидны и для них.
  assert.match(
    render('{noformat:title=Вывод|bgColor=#eee}\nтекст\n{noformat}'),
    /<div class="jira-code-title"[^>]*>Вывод<\/div>/,
  );
  assert.match(
    render('{noformat:bgColor=#eeeeee}\nтекст\n{noformat}'),
    /<div class="jira-code" data-line="0" style="background-color:#eeeeee"/,
  );
  assert.match(
    render('{code:java|borderStyle=dashed}\nint x;\n{code}'),
    /style="border-style:dashed"/,
  );
});

test('встроенное медиа', () => {
  assert.match(
    render('!demo.mp4!'),
    /<video class="jira-media" controls preload="metadata" src="demo\.mp4"><\/video>/,
  );
  assert.match(render('!song.mp3!'), /<audio class="jira-media"[^>]*src="song\.mp3"/);
  assert.match(render('!clip.mov|width=300,height=200!'), /<video[^>]*style="width:300px;height:200px"/);
  // Flash и Windows Media браузер не проиграет — показываем заглушку, а не пустоту.
  assert.match(render('!banner.swf!'), /<span class="jira-media-missing"[^>]*>🎬 banner\.swf<\/span>/);
  assert.match(render('!old.wmv!'), /jira-media-missing/);
});

test('картинки по-прежнему картинки', () => {
  assert.match(render('!schema.png!'), /<img class="jira-image" src="schema\.png"\/>/);
  assert.match(render('!schema.png|thumbnail!'), /class="jira-image jira-thumbnail"/);
  assert.doesNotMatch(render('!не картинка!'), /<img|<video|<audio/);
});
