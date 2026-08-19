/**
 * Разметка Jira → Markdown.
 *
 * Обратное направление беднее прямого: у Markdown нет цвета, панелей и
 * статусов. Такие конструкции разворачиваются в ближайший аналог, их
 * оформление теряется — но текст сохраняется целиком.
 */

import { parseParams } from '../parser/inline.ts';
import { TABLE_LINE_RE, parseTableRow } from '../parser/table.ts';
import { PLACEHOLDER, restore } from './placeholder.ts';

const HEADING_RE = /^\s*h([1-6])\.\s*(.*)$/i;
const HR_RE = /^\s*-{4,}\s*$/;
const BQ_RE = /^\s*bq\.\s?(.*)$/i;
const LIST_RE = /^\s*([*#-]+)\s+(.*)$/;
const MACRO_RE = /^\s*\{([a-zA-Z]+)(?::([^}\n]*))?\}\s*$/;

/** Похоже ли содержимое `!…!` на вложение, а не на два восклицательных знака. */
const MEDIA_SOURCE_RE = /(^(https?|data):)|(\.[a-z0-9]{2,5}$)/i;

/** Макросы с телом, которые разворачиваются в блок Markdown. */
const BLOCK_MACROS = new Set([
  'code',
  'noformat',
  'panel',
  'quote',
  'info',
  'note',
  'tip',
  'warning',
  'excerpt',
  'section',
  'column',
]);

/** У этих плашек имя само по себе несёт смысл — оно становится заголовком. */
const TITLED_MACROS = new Set(['info', 'note', 'tip', 'warning']);

export function jiraToMarkdown(source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const macro = MACRO_RE.exec(line);
    const name = macro ? macro[1].toLowerCase() : null;
    if (macro && name && BLOCK_MACROS.has(name)) {
      const closeRe = new RegExp(`^\\s*\\{${name}\\}\\s*$`, 'i');
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !closeRe.test(lines[j])) {
        body.push(lines[j]);
        j += 1;
      }
      out.push(...renderBlockMacro(name, macro[2] ?? '', body));
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      out.push(`${'#'.repeat(Number(heading[1]))} ${inline(heading[2])}`);
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push('---');
      i += 1;
      continue;
    }

    const quote = BQ_RE.exec(line);
    if (quote) {
      out.push(`> ${inline(quote[1])}`);
      i += 1;
      continue;
    }

    if (TABLE_LINE_RE.test(line)) {
      const table = readTable(lines, i);
      if (table) {
        out.push(...table.rows);
        i = table.next;
        continue;
      }
    }

    const item = LIST_RE.exec(line);
    if (item) {
      const marker = item[1];
      const indent = '  '.repeat(marker.length - 1);
      out.push(`${indent}${marker.endsWith('#') ? '1.' : '-'} ${inline(item[2])}`);
      i += 1;
      continue;
    }

    out.push(inline(line));
    i += 1;
  }

  return out.join('\n');
}

function renderBlockMacro(name: string, params: string, body: string[]): string[] {
  if (name === 'code' || name === 'noformat') {
    const parsed = parseParams(params);
    const language = name === 'code' ? (parsed.language ?? parsed._ ?? '') : '';
    return [`\`\`\`${language}`, ...body, '```'];
  }

  const inner = jiraToMarkdown(body.join('\n')).split('\n');
  const quoted = inner.map((text) => (text ? `> ${text}` : '>'));
  if (name === 'quote') return quoted;

  // Панель и плашки ближе всего к цитате с жирным заголовком.
  const title =
    parseParams(params).title ?? (TITLED_MACROS.has(name) ? capitalize(name) : '');
  return title ? [`> **${inline(title)}**`, '>', ...quoted] : quoted;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface TableRead {
  rows: string[];
  next: number;
}

function readTable(lines: string[], start: number): TableRead | null {
  const cells: string[][] = [];
  let i = start;
  while (i < lines.length && TABLE_LINE_RE.test(lines[i])) {
    const row = parseTableRow(lines[i]);
    if (!row.length) break;
    cells.push(row.map((cell) => inline(cell.text.trim()).replace(/\|/g, '\\|')));
    i += 1;
  }
  if (!cells.length) return null;

  const width = Math.max(...cells.map((row) => row.length));
  const pad = (row: string[]) => [...row, ...Array(width - row.length).fill('')];
  return {
    rows: [
      `| ${pad(cells[0]).join(' | ')} |`,
      `| ${Array(width).fill('---').join(' | ')} |`,
      ...cells.slice(1).map((row) => `| ${pad(row).join(' | ')} |`),
    ],
    next: i,
  };
}

/**
 * Строчные конструкции разбираются одним проходом: цепочка `replace` спотыкалась
 * бы о собственный результат — `-текст-` превращается в `~~текст~~`, а это уже
 * похоже на нижний индекс `~…~`.
 */
const INLINE_RE = new RegExp(
  [
    /\{color(?::[^}\n]*)?\}(?<color>)/,
    /\{status:(?<status>[^}\n]*)\}/,
    /\{anchor:(?<anchor>[^}\n]*)\}/,
    /!(?<media>[^!\n]+)!/,
    /\[(?<link>[^\]\n]+)\]/,
    /\*(?<strong>\S(?:[^*\n]*\S)?)\*/,
    /(?<![\w_])_(?<em>\S(?:[^_\n]*\S)?)_(?![\w_])/,
    /(?<![\w-])-(?<strike>\S(?:[^-\n]*\S)?)-(?![\w-])/,
    /(?<![\w+])\+(?<ins>\S(?:[^+\n]*\S)?)\+(?![\w+])/,
    /\?\?(?<cite>\S(?:[^?\n]*\S)?)\?\?/,
    /\^(?<sup>\S(?:[^^\n]*\S)?)\^/,
    /~(?<sub>\S(?:[^~\n]*\S)?)~/,
    /(?<lineBreak>\\\\)/,
  ]
    .map((part) => part.source)
    .join('|'),
  'g',
);

function inline(text: string): string {
  if (!text) return text;

  // Код внутри строки трогать нельзя ни в каком виде.
  const spans: string[] = [];
  const hide = (code: string) => {
    spans.push(`\`${code}\``);
    return `${PLACEHOLDER}${spans.length - 1}${PLACEHOLDER}`;
  };
  const masked = text
    .replace(/\{code(?::[^}\n]*)?\}([\s\S]*?)\{code\}/g, (_all, code: string) => hide(code))
    .replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, (_all, code: string) => hide(code))
    .replace(/\{\{(.+?)\}\}/g, (_all, code: string) => hide(code));

  const converted = masked.replace(INLINE_RE, (match, ...rest) => {
    const groups = rest[rest.length - 1] as Record<string, string | undefined>;

    // Цвет в Markdown передать нечем — от макроса остаётся только текст.
    if (groups.color !== undefined) return '';
    if (groups.status !== undefined) {
      const parsed = parseParams(groups.status);
      return `**${parsed.title ?? parsed._ ?? ''}**`;
    }
    if (groups.anchor !== undefined) return `<a id="${groups.anchor}"></a>`;
    if (groups.media !== undefined) return convertMedia(groups.media, match);
    if (groups.link !== undefined) return convertLink(groups.link);

    if (groups.strong) return `**${groups.strong}**`;
    if (groups.em) return `*${groups.em}*`;
    if (groups.strike) return `~~${groups.strike}~~`;
    if (groups.ins) return `<ins>${groups.ins}</ins>`;
    if (groups.cite) return `<cite>${groups.cite}</cite>`;
    if (groups.sup) return `<sup>${groups.sup}</sup>`;
    if (groups.sub) return `<sub>${groups.sub}</sub>`;
    if (groups.lineBreak) return '<br>';
    return match;
  });

  return restore(converted, spans);
}

/** `!файл.png|thumbnail!` → картинка; «Ура! Готово!» — не трогаем. */
function convertMedia(body: string, original: string): string {
  const source = body.split('|')[0].trim();
  return MEDIA_SOURCE_RE.test(source) ? `![](${source})` : original;
}

function convertLink(inner: string): string {
  if (inner.startsWith('~')) return `@${inner.slice(1)}`;
  if (inner.startsWith('^')) return inner.slice(1);

  const parts = inner.split('|');
  if (parts.length > 1) return `[${parts[0].trim()}](${parts[1].trim()})`;
  if (inner.startsWith('#')) return `[${inner}](${inner})`;
  if (/^(https?|ftp|ftps|mailto|tel|file):/i.test(inner)) return `<${inner}>`;
  // Ключ задачи или страница без адреса: скобки в Markdown только помешают.
  return inner;
}
