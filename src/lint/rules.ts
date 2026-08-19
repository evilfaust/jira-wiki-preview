/**
 * Проверка разметки: ищет то, что Jira отрисует не так, как рассчитывал автор.
 *
 * Модуль намеренно ничего не знает про vscode — он возвращает правило и его
 * аргументы, а формулировки на нужном языке подставляет `provider.ts`.
 */

import { type Dialect, isConfluenceOnly, isKnownCodeLanguage, normalizeDialect } from '../parser/dialect.ts';
import { parseParams } from '../parser/inline.ts';
import { type MacroRegion, scanDocument } from '../parser/scan.ts';
import { TABLE_LINE_RE, parseTableRow } from '../parser/table.ts';

export type LintRule =
  | 'unclosed-macro'
  | 'confluence-macro'
  | 'table-row-width'
  | 'unknown-code-language'
  | 'unclosed-monospace'
  | 'unclosed-inline-macro';

export interface LintIssue {
  rule: LintRule;
  /** Строка, 0-based. */
  line: number;
  /** Колонка, 0-based. */
  column: number;
  length: number;
  /** Подстановки для сообщения: имя макроса, язык, число ячеек. */
  args: string[];
}

/** Любой тег макроса внутри строки. */
const MACRO_RE = /\{([a-zA-Z]+)(?::([^}\n]*))?\}/g;

export function lintJira(source: string, dialect: Dialect = 'jira'): LintIssue[] {
  const active = normalizeDialect(dialect);
  const lines = source.split(/\r\n|\r|\n/);
  const scan = scanDocument(source, active);
  const issues: LintIssue[] = [];

  for (const region of scan.regions) {
    if (region.end < 0) {
      issues.push({
        rule: 'unclosed-macro',
        line: region.start,
        column: region.column,
        length: region.length,
        args: [region.name],
      });
    }
    if (region.name === 'code' && region.params) {
      checkCodeLanguage(region, issues);
    }
  }

  checkTables(lines, scan.verbatim, issues);

  /** Уже открытые макросы Confluence — чтобы не ругаться на закрывающий тег. */
  const openConfluence = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (scan.verbatim[index]) continue;
    collectInlineIssues(line, index, active, openConfluence, issues);
  }

  return issues.sort((a, b) => a.line - b.line || a.column - b.column);
}

function checkCodeLanguage(region: MacroRegion, issues: LintIssue[]): void {
  const parsed = parseParams(region.params ?? '');
  const language = (parsed.language ?? parsed._ ?? '').trim();
  if (!language || isKnownCodeLanguage(language)) return;
  issues.push({
    rule: 'unknown-code-language',
    line: region.start,
    column: region.column,
    length: region.length,
    args: [language],
  });
}

/** Строка, в которой ячеек не столько же, сколько в первой строке таблицы. */
function checkTables(lines: string[], verbatim: boolean[], issues: LintIssue[]): void {
  let width: number | null = null;
  let startLine = -1;

  for (const [index, line] of lines.entries()) {
    if (verbatim[index]) continue;

    if (!TABLE_LINE_RE.test(line)) {
      if (line.trim()) width = null;
      continue;
    }

    const cells = parseTableRow(line).length;
    if (!cells) continue;

    if (width === null) {
      width = cells;
      startLine = index;
      continue;
    }
    if (cells === width) continue;

    const column = line.length - line.trimStart().length;
    issues.push({
      rule: 'table-row-width',
      line: index,
      column,
      length: line.trimEnd().length - column,
      args: [String(cells), String(width), String(startLine + 1)],
    });
  }
}

/** Проверки, которые смотрят внутрь одной строки. */
function collectInlineIssues(
  line: string,
  index: number,
  dialect: Dialect,
  openConfluence: Set<string>,
  issues: LintIssue[],
): void {
  // {{моноширинный}} парсер закрывает только в пределах строки.
  for (const match of line.matchAll(/\{\{/g)) {
    if (line.indexOf('}}', match.index + 2) < 0) {
      issues.push({
        rule: 'unclosed-monospace',
        line: index,
        column: match.index,
        length: line.length - match.index,
        args: [],
      });
      break;
    }
  }

  for (const match of line.matchAll(MACRO_RE)) {
    const name = match[1].toLowerCase();

    if (dialect === 'jira' && isConfluenceOnly(name)) {
      // Закрывающий тег пары уже учтён вместе с открывающим.
      if (openConfluence.has(name)) {
        openConfluence.delete(name);
        continue;
      }
      if (isPairedMacro(name)) openConfluence.add(name);
      issues.push({
        rule: 'confluence-macro',
        line: index,
        column: match.index,
        length: match[0].length,
        args: [name],
      });
      continue;
    }

    // {color:red} посреди строки обязан закрыться на ней же.
    if (name === 'color' && match[2] !== undefined) {
      if (line.indexOf('{color}', match.index + match[0].length) < 0) {
        issues.push({
          rule: 'unclosed-inline-macro',
          line: index,
          column: match.index,
          length: match[0].length,
          args: [name],
        });
      }
    }
  }
}

/** Есть ли у макроса тело: {toc} и {status} пишутся одним тегом. */
function isPairedMacro(name: string): boolean {
  return name !== 'toc' && name !== 'status';
}
