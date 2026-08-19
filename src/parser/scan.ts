/**
 * Разбор структуры документа: заголовки и границы блочных макросов.
 *
 * Один и тот же обход нужен трём потребителям — линтеру, панели структуры и
 * сворачиванию, — поэтому он живёт отдельно от отрисовки. Логика закрытия
 * блоков повторяет `renderBlocks`: блок закрывается первым же одноимённым
 * тегом, а всё, что осталось открытым внутри, так и остаётся незакрытым.
 */

import { type Dialect, isBlockMacro, normalizeDialect } from './dialect.ts';

const HEADING_RE = /^\s*h([1-6])\.\s*(.*)$/i;
const BLOCK_OPEN_RE = /^(\s*)\{([a-zA-Z]+)(?::([^}\n]*))?\}(.*)$/;

export interface HeadingInfo {
  level: number;
  text: string;
  line: number;
}

export interface MacroRegion {
  name: string;
  /** Строка с открывающим тегом. */
  start: number;
  /** Строка с закрывающим тегом; -1, если блок так и не закрыли. */
  end: number;
  /** Колонка открывающего тега. */
  column: number;
  /** Длина открывающего тега вместе с хвостом строки. */
  length: number;
  /** Параметры после `{name:`, либо null, если их нет. */
  params: string | null;
}

export interface DocumentScan {
  lineCount: number;
  headings: HeadingInfo[];
  regions: MacroRegion[];
  /** Для каждой строки: лежит ли она внутри тела {code} или {noformat}. */
  verbatim: boolean[];
}

export function scanDocument(source: string, dialect: Dialect = 'jira'): DocumentScan {
  const active = normalizeDialect(dialect);
  const lines = source.split(/\r\n|\r|\n/);
  const headings: HeadingInfo[] = [];
  const regions: MacroRegion[] = [];
  const verbatim = new Array<boolean>(lines.length).fill(false);

  const open: MacroRegion[] = [];
  /** Пока стоим внутри {code}/{noformat}, содержимое разметкой не считается. */
  let fence: string | null = null;

  for (const [index, line] of lines.entries()) {
    const match = BLOCK_OPEN_RE.exec(line);
    const name = match ? match[2].toLowerCase() : null;
    const isBareTag = match !== null && !match[3] && !match[4].trim();

    if (fence) {
      if (name === fence && isBareTag) {
        fence = null;
        const region = open.pop();
        if (region) {
          region.end = index;
          regions.push(region);
        }
      } else {
        verbatim[index] = true;
      }
      continue;
    }

    if (match && name && isBlockMacro(name, active)) {
      const matching = isBareTag ? lastIndexOfName(open, name) : -1;

      if (matching >= 0) {
        const [closed, ...orphans] = open.splice(matching);
        closed.end = index;
        regions.push(closed, ...orphans);
      } else if (!closedOnSameLine(line, name)) {
        open.push({
          name,
          start: index,
          end: -1,
          column: match[1].length,
          length: line.trimEnd().length - match[1].length,
          params: match[3] ?? null,
        });
        if (name === 'code' || name === 'noformat') fence = name;
      } else {
        // `{code:java}x{code}` — блок целиком на одной строке.
        regions.push({
          name,
          start: index,
          end: index,
          column: match[1].length,
          length: line.trimEnd().length - match[1].length,
          params: match[3] ?? null,
        });
      }
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      headings.push({ level: Number(heading[1]), text: heading[2].trim(), line: index });
    }
  }

  regions.push(...open);
  regions.sort((a, b) => a.start - b.start);

  return { lineCount: lines.length, headings, regions, verbatim };
}

/** `{color:red}важно{color}` на одной строке блок не открывает. */
function closedOnSameLine(line: string, name: string): boolean {
  const lower = line.toLowerCase();
  const open = lower.indexOf(`{${name}`);
  return lower.indexOf(`{${name}}`, open + 1) > open;
}

function lastIndexOfName(open: MacroRegion[], name: string): number {
  for (let i = open.length - 1; i >= 0; i--) {
    if (open[i].name === name) return i;
  }
  return -1;
}
