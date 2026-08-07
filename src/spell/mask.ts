/**
 * Заменяет пробелами всё, что не является прозой: код, ссылки, имена макросов,
 * ключи задач. Длина строки сохраняется, поэтому смещения найденных слов
 * остаются валидными для исходного текста.
 */

const FENCE_OPEN = /^\s*\{(code|noformat)(?::[^}\n]*)?\}/i;
const FENCE_CLOSE = /^\s*\{(code|noformat)\}\s*$/i;

const URL_RE = /(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s<>"'`)\]}]+/gi;
const MONOSPACE_RE = /\{\{[^\n]*?\}\}/g;
const MACRO_RE = /\{([a-zA-Z]+)(?::([^}\n]*))?\}/g;
const IMAGE_RE = /!([^\s!|][^!\n]*?)(?:\|[^!\n]*)?!/g;
const ISSUE_KEY_RE = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;
const LINK_RE = /\[([^\]\n]*)\]/g;

/** Внутри тега макроса значение title — обычная проза, его проверяем. */
const TITLE_RE = /title=([^|}]*)/gi;

export function maskNonProse(text: string): string {
  const chars = [...text];
  const mask = (start: number, end: number) => {
    for (let i = Math.max(0, start); i < Math.min(chars.length, end); i++) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  };
  const unmask = (start: number, end: number) => {
    for (let i = Math.max(0, start); i < Math.min(chars.length, end); i++) {
      chars[i] = text[i];
    }
  };

  maskFencedBlocks(text, mask);

  // Дальнейшие правила применяем к уже замаскированному тексту, чтобы
  // не заглядывать внутрь блоков кода.
  const stage = chars.join('');

  for (const match of stage.matchAll(MONOSPACE_RE)) {
    mask(match.index, match.index + match[0].length);
  }

  for (const match of stage.matchAll(MACRO_RE)) {
    const start = match.index;
    mask(start, start + match[0].length);
    const params = match[2];
    if (!params) continue;
    // Смещение параметров внутри тега: `{name:` — это имя плюс две скобки.
    const paramsStart = start + 1 + match[1].length + 1;
    for (const title of params.matchAll(TITLE_RE)) {
      const valueStart = paramsStart + title.index + 'title='.length;
      unmask(valueStart, valueStart + title[1].length);
    }
  }

  for (const match of stage.matchAll(IMAGE_RE)) {
    mask(match.index, match.index + match[0].length);
  }

  for (const match of stage.matchAll(LINK_RE)) {
    const inner = match[1];
    const innerStart = match.index + 1;
    const pipe = inner.indexOf('|');
    if (pipe >= 0) {
      // `[текст|адрес]` — подпись проверяем, адрес нет.
      mask(innerStart + pipe, innerStart + inner.length);
    } else if (/^[~^#]/.test(inner.trim()) || /^[a-z]+:/i.test(inner.trim())) {
      // Упоминание, вложение, якорь или голый URL — целиком служебное.
      mask(match.index, match.index + match[0].length);
    }
  }

  for (const match of stage.matchAll(URL_RE)) {
    mask(match.index, match.index + match[0].length);
  }

  for (const match of stage.matchAll(ISSUE_KEY_RE)) {
    mask(match.index, match.index + match[0].length);
  }

  return chars.join('');
}

/** Маскирует блоки {code}…{code} и {noformat}…{noformat} вместе с тегами. */
function maskFencedBlocks(text: string, mask: (start: number, end: number) => void): void {
  const lines = text.split('\n');
  let offset = 0;
  let fence: string | null = null;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;

    if (fence === null) {
      const open = FENCE_OPEN.exec(line);
      if (!open) continue;
      const name = open[1].toLowerCase();
      const closesOnSameLine = line.toLowerCase().indexOf(`{${name}}`, open[0].length) >= 0;
      mask(lineStart, lineStart + line.length);
      if (!closesOnSameLine) fence = name;
      continue;
    }

    mask(lineStart, lineStart + line.length);
    const close = FENCE_CLOSE.exec(line);
    if (close && close[1].toLowerCase() === fence) fence = null;
  }
}
