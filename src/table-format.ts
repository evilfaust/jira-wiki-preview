import { TABLE_LINE_RE, parseTableRow } from './parser/table.ts';

export interface TableBlock {
  /** Первая строка таблицы, 0-based. */
  start: number;
  /** Последняя строка таблицы, 0-based. */
  end: number;
  lines: string[];
}

/** Находит границы таблицы, внутри которой стоит курсор. */
export function findTableAt(lines: string[], line: number): TableBlock | null {
  if (!TABLE_LINE_RE.test(lines[line] ?? '')) return null;

  let start = line;
  while (start > 0 && TABLE_LINE_RE.test(lines[start - 1])) start -= 1;
  let end = line;
  while (end + 1 < lines.length && TABLE_LINE_RE.test(lines[end + 1])) end += 1;

  return { start, end, lines: lines.slice(start, end + 1) };
}

/**
 * Выравнивает столбцы по ширине содержимого.
 *
 * Jira обрезает пробелы по краям ячейки, поэтому дополнить их можно свободно:
 * отрисовка не изменится, а исходник станет читаемым.
 */
export function formatTable(lines: string[]): string[] {
  const rows = lines.map(parseTableRow);
  if (!rows.length || rows.some((row) => !row.length)) return lines;

  const columns = Math.max(...rows.map((row) => row.length));
  const widths = new Array<number>(columns).fill(0);
  for (const row of rows) {
    for (const [index, cell] of row.entries()) {
      widths[index] = Math.max(widths[index], [...cell.text.trim()].length);
    }
  }

  return rows.map((row) => {
    const header = row.every((cell) => cell.header);
    const separator = header ? '||' : '|';
    const cells = Array.from({ length: columns }, (_, index) => {
      const text = row[index]?.text.trim() ?? '';
      return ` ${text}${' '.repeat(widths[index] - [...text].length)} `;
    });
    return `${separator}${cells.join(separator)}${separator}`;
  });
}
