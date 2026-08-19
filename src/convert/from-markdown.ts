/**
 * Markdown → разметка Jira.
 *
 * Самый частый рабочий сценарий: текст пишут в Markdown, а вставлять его надо
 * в описание задачи. Конвертер намеренно консервативен — если конструкции нет
 * в Jira, текст остаётся как есть, а не выбрасывается.
 */

import { PLACEHOLDER, restore } from './placeholder.ts';

const FENCE_RE = /^(\s*)(```+|~~~+)\s*([\w+#.-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+(.*)$/;
const TABLE_DIVIDER_RE = /^\s*\|?(?:\s*:?-{1,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/;

interface ListLevel {
  indent: number;
  kind: '*' | '#';
}

export function markdownToJira(source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const out: string[] = [];
  /** Открытые уровни списка: маркер Jira — это все их символы подряд. */
  let levels: ListLevel[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE_RE.exec(line);
    if (fence) {
      levels = [];
      const closing = new RegExp(`^\\s*${fence[2][0]}{${fence[2].length},}\\s*$`);
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !closing.test(lines[j])) {
        body.push(lines[j]);
        j += 1;
      }
      const language = fence[3];
      out.push(language ? `{code:${language}}` : '{noformat}');
      out.push(...body, language ? '{code}' : '{noformat}');
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      levels = [];
      out.push(`h${heading[1].length}. ${inline(heading[2])}`);
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      levels = [];
      out.push('----');
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      levels = [];
      const body: string[] = [];
      while (i < lines.length) {
        const quote = QUOTE_RE.exec(lines[i]);
        if (!quote) break;
        body.push(inline(quote[1]));
        i += 1;
      }
      // Одна строка выглядит лучше как bq., несколько — как блок.
      if (body.length === 1) out.push(`bq. ${body[0]}`);
      else out.push('{quote}', ...body, '{quote}');
      continue;
    }

    const table = readTable(lines, i);
    if (table) {
      levels = [];
      out.push(...table.rows);
      i = table.next;
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = bullet ? null : ORDERED_RE.exec(line);
    const item = bullet ?? ordered;
    if (item) {
      const marker = pushLevel(levels, item[1].length, bullet ? '*' : '#');
      out.push(`${marker} ${inline(item[2])}`);
      i += 1;
      continue;
    }

    if (!line.trim()) levels = [];
    out.push(inline(line));
    i += 1;
  }

  return out.join('\n');
}

/**
 * Отступ Markdown превращает в глубину Jira. Маркер собирается из символов
 * всех предков, поэтому список внутри нумерованного даёт `#*`, как в Jira.
 */
function pushLevel(levels: ListLevel[], indent: number, kind: '*' | '#'): string {
  while (levels.length && levels[levels.length - 1].indent > indent) levels.pop();

  const last = levels[levels.length - 1];
  if (!last || last.indent < indent) levels.push({ indent, kind });
  else levels[levels.length - 1] = { indent, kind };

  return levels.map((level) => level.kind).join('');
}

interface TableRead {
  rows: string[];
  next: number;
}

/** Таблица GFM: строка шапки, строка-разделитель и тело. */
function readTable(lines: string[], start: number): TableRead | null {
  const header = lines[start];
  if (!header?.includes('|') || !lines[start + 1] || !TABLE_DIVIDER_RE.test(lines[start + 1])) {
    return null;
  }

  const rows = [`||${splitRow(header).map(inline).join('||')}||`];
  let i = start + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
    rows.push(`|${splitRow(lines[i]).map(inline).join('|')}|`);
    i += 1;
  }

  return { rows, next: i };
}

/** Делит строку таблицы на ячейки; экранированный `\|` разделителем не считается. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      current += '\\|';
      i += 1;
      continue;
    }
    if (trimmed[i] === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += trimmed[i];
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Все строчные конструкции разбираются одним проходом.
 *
 * Цепочка последовательных `replace` здесь не годится: `**жирный**` станет
 * `*жирный*`, и следующее же правило приняло бы это за курсив. Один проход
 * в собственный результат не заглядывает.
 */
const INLINE_RE = new RegExp(
  [
    /!\[[^\]]*\]\((?<image>[^)\s]+)(?:\s+"[^"]*")?\)/,
    /\[(?<label>[^\]]+)\]\((?<url>[^)\s]+)(?:\s+"(?<tip>[^"]*)")?\)/,
    /<(?<autolink>https?:\/\/[^>\s]+)>/,
    /\*\*\*(?<strongEmStar>\S(?:[^*\n]*\S)?)\*\*\*/,
    /___(?<strongEmScore>\S(?:[^_\n]*\S)?)___/,
    /\*\*(?<strongStar>\S(?:[^*\n]*\S)?)\*\*/,
    /__(?<strongScore>\S(?:[^_\n]*\S)?)__/,
    /(?<![\w*])\*(?<em>\S(?:[^*\n]*\S)?)\*(?![\w*])/,
    /~~(?<strike>\S(?:[^~\n]*\S)?)~~/,
    /(?<lineBreak><br\s*\/?>)/,
  ]
    .map((part) => part.source)
    .join('|'),
  'gi',
);

function inline(text: string): string {
  if (!text) return text;

  // Код в обратных кавычках прячем первым: внутри него разметки нет.
  const spans: string[] = [];
  const masked = text.replace(/(`+)(.+?)\1/g, (_all, _ticks: string, code: string) => {
    spans.push(`{{${code}}}`);
    return `${PLACEHOLDER}${spans.length - 1}${PLACEHOLDER}`;
  });

  const converted = masked.replace(INLINE_RE, (match, ...rest) => {
    const groups = rest[rest.length - 1] as Record<string, string | undefined>;

    // Подпись картинки в Jira отдельным параметром не задаётся — она теряется.
    if (groups.image) return `!${groups.image}!`;
    if (groups.url) {
      const { label = '', url, tip } = groups;
      if (label === url) return `[${url}]`;
      return tip ? `[${label}|${url}|${tip}]` : `[${label}|${url}]`;
    }
    if (groups.autolink) return `[${groups.autolink}]`;

    const strongEm = groups.strongEmStar ?? groups.strongEmScore;
    if (strongEm) return `*_${strongEm}_*`;

    const strong = groups.strongStar ?? groups.strongScore;
    if (strong) return `*${strong}*`;

    if (groups.em) return `_${groups.em}_`;
    if (groups.strike) return `-${groups.strike}-`;
    if (groups.lineBreak) return '\\\\';
    return match;
  });

  return restore(converted, spans);
}
