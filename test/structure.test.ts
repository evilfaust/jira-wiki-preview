import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanDocument } from '../src/parser/scan.ts';
import { findTableAt, formatTable } from '../src/table-format.ts';

test('заголовки собираются с уровнями и номерами строк', () => {
  const scan = scanDocument('h1. Первый\n\nтекст\n\nh2. Второй\n\nh1. Третий');
  assert.deepEqual(
    scan.headings.map((h) => [h.level, h.text, h.line]),
    [
      [1, 'Первый', 0],
      [2, 'Второй', 4],
      [1, 'Третий', 6],
    ],
  );
});

test('заголовок внутри {code} заголовком не считается', () => {
  const scan = scanDocument('{code}\nh1. Не заголовок\n{code}');
  assert.deepEqual(scan.headings, []);
  assert.deepEqual(scan.verbatim, [false, true, false]);
});

test('границы блочных макросов', () => {
  const scan = scanDocument('{panel}\nтекст\n{panel}\n\n{code:java}\nint x;\n{code}');
  assert.deepEqual(
    scan.regions.map((r) => [r.name, r.start, r.end]),
    [
      ['panel', 0, 2],
      ['code', 4, 6],
    ],
  );
});

test('незакрытый блок помечается концом -1', () => {
  const scan = scanDocument('{panel}\nтекст');
  assert.deepEqual(
    scan.regions.map((r) => [r.name, r.end]),
    [['panel', -1]],
  );
});

test('блок целиком на одной строке', () => {
  const scan = scanDocument('{code:java}int x;{code}');
  assert.deepEqual(
    scan.regions.map((r) => [r.name, r.start, r.end]),
    [['code', 0, 0]],
  );
});

test('макросы Confluence видны только в своём диалекте', () => {
  assert.deepEqual(scanDocument('{info}\nтекст\n{info}').regions, []);
  assert.deepEqual(
    scanDocument('{info}\nтекст\n{info}', 'confluence').regions.map((r) => [r.name, r.end]),
    [['info', 2]],
  );
});

test('границы таблицы под курсором', () => {
  const lines = ['абзац', '||А||Б||', '|1|2|', '|3|4|', '', 'дальше'];
  const block = findTableAt(lines, 2);
  assert.deepEqual([block?.start, block?.end], [1, 3]);
  assert.equal(findTableAt(lines, 0), null);
  assert.equal(findTableAt(lines, 5), null);
});

test('выравнивание столбцов таблицы', () => {
  assert.deepEqual(formatTable(['||Поле||Значение||', '|Статус|Готово|', '|Исполнитель|Иванов|']), [
    '|| Поле        || Значение ||',
    '| Статус      | Готово   |',
    '| Исполнитель | Иванов   |',
  ]);
});

test('короткая строка добивается пустыми ячейками', () => {
  assert.deepEqual(formatTable(['||А||Б||В||', '|1|2|']), [
    '|| А || Б || В ||',
    '| 1 | 2 |   |',
  ]);
});

test('выравнивание идемпотентно', () => {
  const once = formatTable(['||Поле||Значение||', '|Статус|Готово|']);
  assert.deepEqual(formatTable(once), once);
});
