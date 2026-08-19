/** Разбор строк таблицы Jira: `||шапка||` и `|ячейка|`. */

export const TABLE_LINE_RE = /^\s*\|/;

export interface TableCell {
  text: string;
  header: boolean;
}

/** Разбирает `||h1||h2||` и `|a|b|`; `|` внутри [] и {} разделителем не считается. */
export function parseTableRow(line: string): TableCell[] {
  const text = line.trim();
  if (!text.startsWith('|')) return [];

  const cells: TableCell[] = [];
  let i = 0;
  while (i < text.length) {
    let header = false;
    if (text.startsWith('||', i)) {
      header = true;
      i += 2;
    } else if (text[i] === '|') {
      i += 1;
    } else {
      break;
    }

    const start = i;
    let depthSquare = 0;
    let depthCurly = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '[') depthSquare += 1;
      else if (ch === ']') depthSquare = Math.max(0, depthSquare - 1);
      else if (ch === '{') depthCurly += 1;
      else if (ch === '}') depthCurly = Math.max(0, depthCurly - 1);
      else if (ch === '|' && depthSquare === 0 && depthCurly === 0) break;
      i += 1;
    }
    const content = text.slice(start, Math.min(i, text.length));
    if (i >= text.length && !content.trim()) break; // хвостовой разделитель
    cells.push({ text: content, header });
  }
  return cells;
}
