import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jiraToMarkdown, markdownToJira } from '../src/convert/index.ts';

test('Markdown → Jira: заголовки и разделитель', () => {
  assert.equal(markdownToJira('# Первый'), 'h1. Первый');
  assert.equal(markdownToJira('###### Шестой'), 'h6. Шестой');
  assert.equal(markdownToJira('####### Не заголовок'), '####### Не заголовок');
  assert.equal(markdownToJira('---'), '----');
});

test('Markdown → Jira: форматирование текста', () => {
  assert.equal(markdownToJira('**жирный**'), '*жирный*');
  assert.equal(markdownToJira('__жирный__'), '*жирный*');
  assert.equal(markdownToJira('*курсив*'), '_курсив_');
  assert.equal(markdownToJira('_курсив_'), '_курсив_');
  assert.equal(markdownToJira('***и то и другое***'), '*_и то и другое_*');
  assert.equal(markdownToJira('~~зачёркнутый~~'), '-зачёркнутый-');
  assert.equal(markdownToJira('вызов `method()` тут'), 'вызов {{method()}} тут');
});

test('Markdown → Jira: внутри кода разметку не трогаем', () => {
  assert.equal(markdownToJira('`a * b * c`'), '{{a * b * c}}');
  assert.equal(markdownToJira('`**не жирный**` и **жирный**'), '{{**не жирный**}} и *жирный*');
});

test('Markdown → Jira: подчёркивания в именах не превращаются в курсив', () => {
  assert.equal(markdownToJira('some_snake_case_name'), 'some_snake_case_name');
  assert.equal(markdownToJira('2 * 3 * 4'), '2 * 3 * 4');
});

test('Markdown → Jira: ссылки и картинки', () => {
  assert.equal(markdownToJira('[текст](https://x.dev)'), '[текст|https://x.dev]');
  assert.equal(markdownToJira('[https://x.dev](https://x.dev)'), '[https://x.dev]');
  assert.equal(markdownToJira('<https://x.dev>'), '[https://x.dev]');
  assert.equal(markdownToJira('[с подсказкой](https://x.dev "подсказка")'), '[с подсказкой|https://x.dev|подсказка]');
  assert.equal(markdownToJira('![схема](img/schema.png)'), '!img/schema.png!');
});

test('Markdown → Jira: блоки кода', () => {
  assert.equal(markdownToJira('```java\nint x;\n```'), '{code:java}\nint x;\n{code}');
  assert.equal(markdownToJira('```\nпросто текст\n```'), '{noformat}\nпросто текст\n{noformat}');
  // Разметку внутри блока конвертер не трогает.
  assert.equal(markdownToJira('```\n**как есть**\n```'), '{noformat}\n**как есть**\n{noformat}');
});

test('Markdown → Jira: списки и вложенность', () => {
  assert.equal(markdownToJira('- один\n- два'), '* один\n* два');
  assert.equal(markdownToJira('1. один\n2. два'), '# один\n# два');
  assert.equal(markdownToJira('- верх\n  - вложенный\n    - глубже'), '* верх\n** вложенный\n*** глубже');
  // Маркер собирается из всех предков: список внутри нумерованного даёт `#*`.
  assert.equal(markdownToJira('1. шаг\n   - подпункт'), '# шаг\n#* подпункт');
});

test('Markdown → Jira: цитаты', () => {
  assert.equal(markdownToJira('> одна строка'), 'bq. одна строка');
  assert.equal(markdownToJira('> первая\n> вторая'), '{quote}\nпервая\nвторая\n{quote}');
});

test('Markdown → Jira: таблицы', () => {
  const md = '| Поле | Значение |\n| --- | --- |\n| Статус | Готово |';
  assert.equal(markdownToJira(md), '||Поле||Значение||\n|Статус|Готово|');
  // Без внешних вертикальных черт — тоже таблица GFM.
  assert.equal(markdownToJira('А | Б\n--- | ---\n1 | 2'), '||А||Б||\n|1|2|');
});

test('Jira → Markdown: заголовки и форматирование', () => {
  assert.equal(jiraToMarkdown('h2. Раздел'), '## Раздел');
  assert.equal(jiraToMarkdown('*жирный*'), '**жирный**');
  assert.equal(jiraToMarkdown('_курсив_'), '*курсив*');
  assert.equal(jiraToMarkdown('-зачёркнутый-'), '~~зачёркнутый~~');
  assert.equal(jiraToMarkdown('{{код}}'), '`код`');
  assert.equal(jiraToMarkdown('??цитата??'), '<cite>цитата</cite>');
  assert.equal(jiraToMarkdown('x^2^'), 'x<sup>2</sup>');
});

test('Jira → Markdown: блоки', () => {
  assert.equal(jiraToMarkdown('{code:java}\nint x;\n{code}'), '```java\nint x;\n```');
  assert.equal(jiraToMarkdown('{noformat}\nтекст\n{noformat}'), '```\nтекст\n```');
  assert.equal(jiraToMarkdown('bq. цитата'), '> цитата');
  assert.equal(jiraToMarkdown('{quote}\nодин\nдва\n{quote}'), '> один\n> два');
});

test('Jira → Markdown: панель разворачивается в цитату с заголовком', () => {
  assert.equal(
    jiraToMarkdown('{panel:title=Итог}\nтекст\n{panel}'),
    '> **Итог**\n>\n> текст',
  );
});

test('Jira → Markdown: ссылки, упоминания и вложения', () => {
  assert.equal(jiraToMarkdown('[текст|https://x.dev]'), '[текст](https://x.dev)');
  assert.equal(jiraToMarkdown('[https://x.dev]'), '<https://x.dev>');
  assert.equal(jiraToMarkdown('[~ivanov]'), '@ivanov');
  assert.equal(jiraToMarkdown('[^report.pdf]'), 'report.pdf');
  assert.equal(jiraToMarkdown('!schema.png!'), '![](schema.png)');
  assert.equal(jiraToMarkdown('!schema.png|thumbnail!'), '![](schema.png)');
});

test('Jira → Markdown: цвет теряется, текст остаётся', () => {
  assert.equal(jiraToMarkdown('{color:red}важно{color}'), 'важно');
});

test('Jira → Markdown: таблица получает строку-разделитель', () => {
  assert.equal(
    jiraToMarkdown('||Поле||Значение||\n|Статус|Готово|'),
    '| Поле | Значение |\n| --- | --- |\n| Статус | Готово |',
  );
});

test('Jira → Markdown: списки', () => {
  assert.equal(jiraToMarkdown('* один\n** вложенный'), '- один\n  - вложенный');
  assert.equal(jiraToMarkdown('# шаг\n#* подпункт'), '1. шаг\n  - подпункт');
});

test('круговой перегон сохраняет смысл', () => {
  const jira = [
    'h1. Заголовок',
    '',
    'Текст с *жирным*, _курсивом_ и {{кодом}}.',
    '',
    '* один',
    '** вложенный',
    '',
    '||Поле||Значение||',
    '|Статус|Готово|',
    '',
    '{code:java}',
    'int x = 1;',
    '{code}',
  ].join('\n');

  assert.equal(markdownToJira(jiraToMarkdown(jira)), jira);
});
