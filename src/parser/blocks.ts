import { escapeHtml, parseParams, renderInline, sanitizeColor } from './inline.ts';
import type { RenderOptions } from './types.ts';

const HEADING_RE = /^\s*h([1-6])\.\s*(.*)$/i;
const HR_RE = /^\s*-{4,}\s*$/;
const BQ_RE = /^\s*bq\.\s?(.*)$/i;
const LIST_RE = /^(\s*)([*#-]+)\s+(.*)$/;
const TABLE_RE = /^\s*\|/;
const MACRO_RE = /^\s*\{([a-zA-Z]+)(?::([^}\n]*))?\}(.*)$/;

const BLOCK_MACROS = new Set([
  'code',
  'noformat',
  'panel',
  'quote',
  'color',
  'tip',
  'note',
  'info',
  'warning',
  'excerpt',
  'section',
  'column',
]);

const MESSAGE_ICONS: Record<string, string> = {
  info: 'ℹ️',
  note: '📌',
  tip: '💡',
  warning: '⚠️',
};

const BORDER_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'none']);

interface MacroLine {
  name: string;
  params: string;
  /** Текст на той же строке после открывающего тега. */
  rest: string;
  /** Тело макроса, если он открыт и закрыт на одной строке. */
  inlineBody: string | null;
}

/** Переводит Jira Wiki Markup в HTML. */
export function renderJira(source: string, opts: RenderOptions = {}): string {
  const lines = source.split(/\r\n|\r|\n/);
  return renderBlocks(lines, 0, opts);
}

function renderBlocks(lines: string[], offset: number, opts: RenderOptions): string {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNumber = offset + i;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const macro = matchBlockMacro(line);
    if (macro) {
      if (macro.inlineBody !== null) {
        out.push(renderMacro(macro.name, macro.params, [macro.inlineBody], lineNumber, lineNumber, opts));
        i += 1;
        continue;
      }
      const body: string[] = [];
      let bodyOffset = lineNumber;
      if (macro.rest.trim()) body.push(macro.rest);
      else bodyOffset = lineNumber + 1;

      const closeRe = new RegExp(`^\\s*\\{${macro.name}\\}\\s*$`, 'i');
      let j = i + 1;
      while (j < lines.length && !closeRe.test(lines[j])) {
        body.push(lines[j]);
        j += 1;
      }
      out.push(renderMacro(macro.name, macro.params, body, bodyOffset, lineNumber, opts));
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1];
      const text = heading[2];
      const id = slugify(text);
      out.push(
        `<h${level} data-line="${lineNumber}" id="${escapeHtml(id)}">${renderInline(text, opts)}</h${level}>`,
      );
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push(`<hr data-line="${lineNumber}"/>`);
      i += 1;
      continue;
    }

    const blockQuote = BQ_RE.exec(line);
    if (blockQuote) {
      out.push(
        `<blockquote class="jira-quote" data-line="${lineNumber}"><p>${renderInline(blockQuote[1], opts)}</p></blockquote>`,
      );
      i += 1;
      continue;
    }

    if (TABLE_RE.test(line)) {
      const rows: TableRow[] = [];
      let j = i;
      while (j < lines.length && TABLE_RE.test(lines[j])) {
        const cells = parseTableRow(lines[j]);
        if (!cells.length) break;
        rows.push({ cells, line: offset + j });
        j += 1;
      }
      if (rows.length) {
        out.push(renderTable(rows, lineNumber, opts));
        i = j;
        continue;
      }
    }

    if (LIST_RE.test(line)) {
      const items: ListSource[] = [];
      let j = i;
      while (j < lines.length) {
        const match = LIST_RE.exec(lines[j]);
        if (!match) break;
        items.push({ marker: match[2], text: match[3], line: offset + j });
        j += 1;
      }
      out.push(renderList(buildListTree(items), opts));
      i = j;
      continue;
    }

    const paragraph: ParagraphLine[] = [{ text: line, line: lineNumber }];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      paragraph.push({ text: lines[i], line: offset + i });
      i += 1;
    }
    out.push(renderParagraph(paragraph, opts));
  }

  return out.join('\n');
}

function startsBlock(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    BQ_RE.test(line) ||
    LIST_RE.test(line) ||
    TABLE_RE.test(line) ||
    matchBlockMacro(line) !== null
  );
}

function matchBlockMacro(line: string): MacroLine | null {
  const match = MACRO_RE.exec(line);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!BLOCK_MACROS.has(name)) return null;

  const rest = match[3] ?? '';
  const closeTag = `{${name}}`;
  const closeIndex = rest.toLowerCase().indexOf(closeTag);
  if (closeIndex < 0) return { name, params: match[2] ?? '', rest, inlineBody: null };

  // `{color:red}важно{color} и дальше текст` — это инлайновое использование,
  // а не блок: пусть строку обработает парсер абзацев.
  if (rest.slice(closeIndex + closeTag.length).trim()) return null;
  return { name, params: match[2] ?? '', rest, inlineBody: rest.slice(0, closeIndex) };
}

function renderMacro(
  name: string,
  params: string,
  body: string[],
  bodyOffset: number,
  blockLine: number,
  opts: RenderOptions,
): string {
  const anchor = ` data-line="${blockLine}"`;
  const parsed = parseParams(params);

  if (name === 'code' || name === 'noformat') {
    const language = name === 'code' ? (parsed.language ?? parsed._ ?? '') : '';
    const languageClass = /^[\w+#.-]+$/.test(language) ? ` language-${language.toLowerCase()}` : '';
    const title = parsed.title ? `<div class="jira-code-title">${escapeHtml(parsed.title)}</div>` : '';

    const raw = trimBlankEdges(body).join('\n');
    const highlighted = language && opts.highlightCode ? opts.highlightCode(raw, language) : null;
    const content = highlighted ?? escapeHtml(raw);
    const contentClass = `jira-code-content${languageClass}${highlighted === null ? '' : ' hljs'}`;

    return (
      `<div class="jira-code"${anchor}>${title}` +
      `<pre class="jira-code-body"><code class="${contentClass}">${content}</code></pre></div>`
    );
  }

  const inner = renderBlocks(body, bodyOffset, opts);

  if (name === 'panel') {
    const bodyStyles: string[] = [];
    const titleStyles: string[] = [];
    if (parsed.bgcolor) bodyStyles.push(`background-color:${sanitizeColor(parsed.bgcolor)}`);
    if (parsed.bordercolor) bodyStyles.push(`border-color:${sanitizeColor(parsed.bordercolor)}`);
    if (parsed.borderstyle && BORDER_STYLES.has(parsed.borderstyle.toLowerCase())) {
      bodyStyles.push(`border-style:${parsed.borderstyle.toLowerCase()}`);
    }
    if (parsed.borderwidth && /^\d+$/.test(parsed.borderwidth)) {
      bodyStyles.push(`border-width:${parsed.borderwidth}px`);
    }
    if (parsed.titlebgcolor) titleStyles.push(`background-color:${sanitizeColor(parsed.titlebgcolor)}`);
    const title = parsed.title
      ? `<div class="jira-panel-title"${styleAttr(titleStyles)}>${renderInline(parsed.title, opts)}</div>`
      : '';
    return `<div class="jira-panel"${anchor}${styleAttr(bodyStyles)}>${title}<div class="jira-panel-body">${inner}</div></div>`;
  }

  if (name === 'quote') {
    return `<blockquote class="jira-quote"${anchor}>${inner}</blockquote>`;
  }

  if (MESSAGE_ICONS[name]) {
    const title = parsed.title
      ? `<div class="jira-msg-title">${renderInline(parsed.title, opts)}</div>`
      : '';
    return (
      `<div class="jira-msg jira-msg-${name}"${anchor}>` +
      `<span class="jira-msg-icon">${MESSAGE_ICONS[name]}</span>` +
      `<div class="jira-msg-content">${title}${inner}</div></div>`
    );
  }

  if (name === 'color') {
    return `<div class="jira-color"${anchor} style="color:${sanitizeColor(params)}">${inner}</div>`;
  }

  return `<div class="jira-${name}"${anchor}>${inner}</div>`;
}

function styleAttr(styles: string[]): string {
  return styles.length ? ` style="${escapeHtml(styles.join(';'))}"` : '';
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_+^~{}[\]|]/g, '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

interface ParagraphLine {
  text: string;
  line: number;
}

function renderParagraph(lines: ParagraphLine[], opts: RenderOptions): string {
  const inner = lines
    .map((l) => `<span class="jira-line" data-line="${l.line}">${renderInline(l.text, opts)}</span>`)
    .join('<br/>');
  return `<p data-line="${lines[0].line}">${inner}</p>`;
}

interface TableCell {
  text: string;
  header: boolean;
}

interface TableRow {
  cells: TableCell[];
  line: number;
}

/** Разбирает `||h1||h2||` и `|a|b|`; `|` внутри [] и {} разделителем не считается. */
function parseTableRow(line: string): TableCell[] {
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

function renderTable(rows: TableRow[], blockLine: number, opts: RenderOptions): string {
  const isHeaderRow = (row: TableRow) => row.cells.every((c) => c.header);
  const parts: string[] = [
    `<div class="jira-table-wrap" data-line="${blockLine}"><table class="jira-table">`,
  ];

  let index = 0;
  if (rows.length && isHeaderRow(rows[0])) {
    parts.push('<thead>');
    while (index < rows.length && isHeaderRow(rows[index])) {
      parts.push(renderRow(rows[index], opts));
      index += 1;
    }
    parts.push('</thead>');
  }
  if (index < rows.length) {
    parts.push('<tbody>');
    for (; index < rows.length; index++) parts.push(renderRow(rows[index], opts));
    parts.push('</tbody>');
  }
  parts.push('</table></div>');
  return parts.join('');
}

function renderRow(row: TableRow, opts: RenderOptions): string {
  const cells = row.cells
    .map((cell) => {
      const tag = cell.header ? 'th' : 'td';
      return `<${tag}>${renderInline(cell.text.trim(), opts)}</${tag}>`;
    })
    .join('');
  return `<tr data-line="${row.line}">${cells}</tr>`;
}

interface ListSource {
  marker: string;
  text: string;
  line: number;
}

interface ListNode extends ListSource {
  children: ListNode[];
}

function buildListTree(items: ListSource[]): ListNode[] {
  const roots: ListNode[] = [];
  /** levels[k] — последний узел на глубине k+1. */
  const levels: ListNode[] = [];

  for (const item of items) {
    const node: ListNode = { ...item, children: [] };
    const depth = item.marker.length;
    if (depth <= 1 || levels.length === 0) {
      roots.push(node);
      levels.length = 0;
      levels[0] = node;
      continue;
    }
    const parent = levels[Math.min(depth, levels.length + 1) - 2];
    if (parent) parent.children.push(node);
    else roots.push(node);
    levels.length = Math.min(depth, levels.length + 1);
    levels[levels.length - 1] = node;
  }

  return roots;
}

function renderList(nodes: ListNode[], opts: RenderOptions): string {
  if (!nodes.length) return '';
  const out: string[] = [];
  let index = 0;

  while (index < nodes.length) {
    const depth = nodes[index].marker.length;
    const kind = listKind(nodes[index].marker);
    const group: ListNode[] = [];
    while (
      index < nodes.length &&
      listKind(nodes[index].marker) === kind &&
      nodes[index].marker.length === depth
    ) {
      group.push(nodes[index]);
      index += 1;
    }
    const tag = kind === 'ordered' ? 'ol' : 'ul';
    const cls = kind === 'dash' ? ' class="jira-dash-list"' : '';
    const items = group
      .map(
        (node) =>
          `<li data-line="${node.line}">${renderInline(node.text, opts)}${renderList(node.children, opts)}</li>`,
      )
      .join('');
    out.push(`<${tag}${cls}>${items}</${tag}>`);
  }

  return out.join('');
}

function listKind(marker: string): 'ordered' | 'bullet' | 'dash' {
  const last = marker[marker.length - 1];
  if (last === '#') return 'ordered';
  if (last === '-') return 'dash';
  return 'bullet';
}
