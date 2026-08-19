import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type LintRule, lintJira } from '../src/lint/rules.ts';

const rules = (source: string, dialect: 'jira' | 'confluence' = 'jira'): LintRule[] =>
  lintJira(source, dialect).map((issue) => issue.rule);

test('чистый документ не даёт замечаний', () => {
  const source = [
    'h1. Заголовок',
    '',
    '||Поле||Значение||',
    '|Статус|Готово|',
    '',
    '{code:java}',
    'int x = 1;',
    '{code}',
    '',
    '{panel:title=Итог}',
    'текст',
    '{panel}',
  ].join('\n');
  assert.deepEqual(lintJira(source), []);
});

test('незакрытый блочный макрос', () => {
  const issues = lintJira('{panel}\nтекст');
  assert.deepEqual(rules('{panel}\nтекст'), ['unclosed-macro']);
  assert.equal(issues[0].line, 0);
  assert.deepEqual(issues[0].args, ['panel']);

  assert.deepEqual(rules('{code:java}\nint x;'), ['unclosed-macro']);
  assert.deepEqual(rules('{quote}\nцитата\n{quote}'), []);
});

test('закрывающий тег снимает ближайший одноимённый блок', () => {
  // Парсер закроет {panel} третьей строкой, а {quote} останется незакрытым.
  const issues = lintJira('{panel}\n{quote}\n{panel}');
  assert.deepEqual(
    issues.map((i) => [i.rule, i.line, i.args[0]]),
    [['unclosed-macro', 1, 'quote']],
  );
});

test('содержимое {code} не разбирается как разметка', () => {
  const source = '{code}\n{panel}\nif (a) { b(); }\n{code}';
  assert.deepEqual(lintJira(source), []);
});

test('{color} на одной строке блок не открывает', () => {
  assert.deepEqual(rules('{color:red}важно{color}'), []);
  assert.deepEqual(rules('текст {color:red}важно{color} дальше'), []);
  assert.deepEqual(rules('текст {color:red}важно и всё'), ['unclosed-inline-macro']);
});

test('незакрытый {{моноширинный}}', () => {
  assert.deepEqual(rules('вызов {{method()'), ['unclosed-monospace']);
  assert.deepEqual(rules('вызов {{method()}} готов'), []);
});

test('макросы Confluence в диалекте jira', () => {
  const issues = lintJira('{info}\nтекст\n{info}');
  // Пара тегов — одно замечание, а не два.
  assert.deepEqual(
    issues.map((i) => [i.rule, i.line, i.args[0]]),
    [['confluence-macro', 0, 'info']],
  );

  assert.deepEqual(rules('{toc:maxLevel=2}'), ['confluence-macro']);
  assert.deepEqual(rules('{status:colour=Green|title=OK}'), ['confluence-macro']);
  assert.deepEqual(rules('{info}\nтекст\n{info}', 'confluence'), []);
  assert.deepEqual(rules('{toc}', 'confluence'), []);
});

test('неизвестный Jira язык подсветки', () => {
  const issues = lintJira('{code:typescript}\nlet x = 1;\n{code}');
  assert.deepEqual(
    issues.map((i) => [i.rule, i.args[0]]),
    [['unknown-code-language', 'typescript']],
  );
  assert.deepEqual(rules('{code:java}\nint x;\n{code}'), []);
  assert.deepEqual(rules('{code}\nтекст\n{code}'), []);
  assert.deepEqual(rules('{code:title=Foo|language=sql}\nSELECT 1;\n{code}'), []);
});

test('строка таблицы с другим числом ячеек', () => {
  const issues = lintJira('||А||Б||В||\n|1|2|3|\n|1|2|');
  assert.deepEqual(
    issues.map((i) => [i.rule, i.line]),
    [['table-row-width', 2]],
  );
  assert.deepEqual(issues[0].args, ['2', '3', '1']);
});

test('соседние таблицы считаются по отдельности', () => {
  assert.deepEqual(rules('||А||Б||\n|1|2|\n\nтекст\n\n||А||Б||В||\n|1|2|3|'), []);
});

test('вертикальная черта внутри [] не делит ячейку', () => {
  assert.deepEqual(rules('||А||Б||\n|[текст|https://x]|обычная|'), []);
  // А внутри {code} — делит: скобки закрываются сразу после {code:java},
  // поэтому и парсер, и сама Jira требуют экранировать такой `|` как `\\|`.
  assert.deepEqual(rules('||А||Б||\n|{code:java}a|b{code}|ещё|'), ['table-row-width']);
});
