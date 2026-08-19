import { normalizeDialect } from './dialect.ts';
import { EMOTICON_ICONS } from './emoticons.ts';
import type { InlineMatch, RenderOptions } from './types.ts';

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

const WORD_RE = /[\p{L}\p{N}_]/u;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_RE.test(ch);
}

/** Парные символы форматирования Jira → HTML-тег. */
const EMPHASIS: Record<string, string> = {
  '*': 'strong',
  _: 'em',
  '-': 'del',
  '+': 'ins',
  '^': 'sup',
  '~': 'sub',
};

/** Написания, ведущие на ту же иконку, что и канонический эмотикон. */
const EMOTICON_SYNONYMS: Record<string, string> = {
  ':p': ':P',
  ':-)': ':)',
  ':-(': ':(',
  ';-)': ';)',
  '(Y)': '(y)',
  '(N)': '(n)',
  '(I)': '(i)',
  '(X)': '(x)',
};

/** Сначала более длинные ключи, чтобы `(*r)` не съедался как `(*)`. */
const EMOTICON_KEYS = [...Object.keys(EMOTICON_ICONS), ...Object.keys(EMOTICON_SYNONYMS)].sort(
  (a, b) => b.length - a.length,
);

const URL_SCHEME_RE = /^(https?|ftp|ftps|file|mailto|tel):/i;
const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|ogv)$/i;
const AUDIO_EXT_RE = /\.(mp3|m4a|wav|ogg|oga|flac)$/i;
/** Форматы, для которых Jira рисовала плеер, а современный браузер — уже нет. */
const LEGACY_MEDIA_EXT_RE = /\.(swf|wma|wmv|rm|ram)$/i;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Пропускает только заведомо безопасные значения цвета в style-атрибут. */
export function sanitizeColor(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^[a-zA-Z]+$/.test(v)) return v.toLowerCase();
  if (/^rgba?\(\s*[\d.,%\s]+\)$/.test(v)) return v;
  return 'inherit';
}

/** Разбивает строку по разделителю, игнорируя его внутри [] и {}. */
export function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depthSquare = 0;
  let depthCurly = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '[') depthSquare++;
    else if (ch === ']') depthSquare = Math.max(0, depthSquare - 1);
    else if (ch === '{') depthCurly++;
    else if (ch === '}') depthCurly = Math.max(0, depthCurly - 1);
    if (ch === sep && depthSquare === 0 && depthCurly === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Разбирает `title=Foo|borderStyle=dashed` в объект; безымянные значения — в `_`. */
export function parseParams(params: string): Record<string, string> {
  const result: Record<string, string> = {};
  const bare: string[] = [];
  for (const chunk of splitTopLevel(params, '|')) {
    const part = chunk.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) {
      bare.push(part);
      continue;
    }
    result[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  if (bare.length) result._ = bare.join('|');
  return result;
}

export function renderInline(src: string, opts: RenderOptions = {}): string {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\') {
      if (src[i + 1] === '\\') {
        out += '<br/>';
        i += 2;
        continue;
      }
      if (i + 1 < src.length) {
        out += escapeHtml(src[i + 1]);
        i += 2;
        continue;
      }
      out += '\\';
      i += 1;
      continue;
    }

    if (ch === '{') {
      const macro = tryMacro(src, i, opts);
      if (macro) {
        out += macro.html;
        i += macro.length;
        continue;
      }
    }

    if (ch === '[') {
      const link = tryLink(src, i, opts);
      if (link) {
        out += link.html;
        i += link.length;
        continue;
      }
    }

    if (ch === '!') {
      const image = tryImage(src, i, opts);
      if (image) {
        out += image.html;
        i += image.length;
        continue;
      }
    }

    if (ch === 'h' || ch === 'f' || ch === 'w') {
      const auto = tryAutoLink(src, i);
      if (auto) {
        out += auto.html;
        i += auto.length;
        continue;
      }
    }

    if (ch === '-' && src[i + 1] === '-' && !isWordChar(src[i - 1])) {
      if (src[i + 2] === '-') {
        out += '&mdash;';
        i += 3;
      } else {
        out += '&ndash;';
        i += 2;
      }
      continue;
    }

    if (ch === '?' && src[i + 1] === '?') {
      const cite = tryPaired(src, i, '??', 'cite', opts);
      if (cite) {
        out += cite.html;
        i += cite.length;
        continue;
      }
    }

    if (EMPHASIS[ch] !== undefined) {
      const emphasis = tryEmphasis(src, i, opts);
      if (emphasis) {
        out += emphasis.html;
        i += emphasis.length;
        continue;
      }
    }

    if (ch === ':' || ch === ';' || ch === '(') {
      const emoticon = tryEmoticon(src, i);
      if (emoticon) {
        out += emoticon.html;
        i += emoticon.length;
        continue;
      }
    }

    out += escapeHtml(ch);
    i += 1;
  }

  return out;
}

/** Индексы в Jira пишутся вплотную к слову: `x^2^`, `H~2~O`. */
const WORD_ADJACENT = new Set(['^', '~']);

function tryEmphasis(src: string, i: number, opts: RenderOptions): InlineMatch | null {
  const ch = src[i];
  const tag = EMPHASIS[ch];
  const adjacent = WORD_ADJACENT.has(ch);
  if (src[i - 1] === ch) return null;
  if (!adjacent && isWordChar(src[i - 1])) return null;

  const first = src[i + 1];
  if (first === undefined || first === ch || /\s/.test(first)) return null;

  for (let j = i + 2; j < src.length; j++) {
    if (src[j] !== ch) continue;
    if (/\s/.test(src[j - 1])) continue;
    if (!adjacent && isWordChar(src[j + 1])) continue;
    const content = src.slice(i + 1, j);
    return {
      html: `<${tag}>${renderInline(content, opts)}</${tag}>`,
      length: j - i + 1,
    };
  }
  return null;
}

function tryPaired(
  src: string,
  i: number,
  delimiter: string,
  tag: string,
  opts: RenderOptions,
): InlineMatch | null {
  if (isWordChar(src[i - 1])) return null;
  const start = i + delimiter.length;
  if (start >= src.length || /\s/.test(src[start])) return null;
  const end = src.indexOf(delimiter, start + 1);
  if (end < 0 || /\s/.test(src[end - 1])) return null;
  const content = src.slice(start, end);
  if (!content) return null;
  return {
    html: `<${tag}>${renderInline(content, opts)}</${tag}>`,
    length: end + delimiter.length - i,
  };
}

function tryEmoticon(src: string, i: number): InlineMatch | null {
  for (const key of EMOTICON_KEYS) {
    if (!src.startsWith(key, i)) continue;
    if (isWordChar(src[i + key.length])) continue;
    const icon = EMOTICON_ICONS[EMOTICON_SYNONYMS[key] ?? key];
    if (!icon) continue;
    return {
      html: `<span class="jira-emoticon" title="${escapeHtml(key)}">${icon}</span>`,
      length: key.length,
    };
  }
  return null;
}

function tryAutoLink(src: string, i: number): InlineMatch | null {
  if (isWordChar(src[i - 1])) return null;
  const match = /^(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`)\]}]+/i.exec(src.slice(i));
  if (!match) return null;
  let url = match[0];
  // Точка или запятая в конце — почти всегда часть предложения, а не адреса.
  const trimmed = url.replace(/[.,;:!?]+$/, '');
  if (trimmed.length > 8) url = trimmed;
  const href = /^www\./i.test(url) ? `https://${url}` : url;
  return {
    html: `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`,
    length: url.length,
  };
}

function tryMacro(src: string, i: number, opts: RenderOptions): InlineMatch | null {
  if (src.startsWith('{{', i)) {
    const end = src.indexOf('}}', i + 2);
    if (end > i + 2) {
      return {
        html: `<code class="jira-mono">${escapeHtml(src.slice(i + 2, end))}</code>`,
        length: end + 2 - i,
      };
    }
  }

  const match = /^\{([a-zA-Z]+)(?::([^}\n]*))?\}/.exec(src.slice(i));
  if (!match) return null;
  const name = match[1].toLowerCase();
  const params = match[2] ?? '';
  const openLength = match[0].length;

  // `{code}` и `{noformat}` в Jira блочные, но их постоянно пишут внутри строки —
  // чаще всего в ячейке таблицы. Отрисовываем как инлайновый код: <div> внутри
  // <p> или <td> был бы невалидной вложенностью.
  if (name === 'code' || name === 'noformat') {
    const closeTag = `{${name}}`;
    const close = src.toLowerCase().indexOf(closeTag, i + openLength);
    if (close < 0) return null;

    const content = src.slice(i + openLength, close);
    const parsed = parseParams(params);
    const language = name === 'code' ? (parsed.language ?? parsed._ ?? '') : '';
    const highlighted =
      language && opts.highlightCode ? opts.highlightCode(content, language) : null;
    const languageClass = /^[\w+#.-]+$/.test(language) ? ` language-${language.toLowerCase()}` : '';
    const classes = `jira-code-inline${languageClass}${highlighted === null ? '' : ' hljs'}`;

    return {
      html: `<code class="${classes}">${highlighted ?? escapeHtml(content)}</code>`,
      length: close + closeTag.length - i,
    };
  }

  if (name === 'anchor') {
    return {
      html: `<a class="jira-anchor" id="${escapeHtml(params.trim())}"></a>`,
      length: openLength,
    };
  }

  if (name === 'color') {
    const close = src.indexOf('{color}', i + openLength);
    if (close < 0) return null;
    const content = src.slice(i + openLength, close);
    return {
      html: `<span style="color:${sanitizeColor(params)}">${renderInline(content, opts)}</span>`,
      length: close + '{color}'.length - i,
    };
  }

  // {status} — макрос Confluence: в Jira он остаётся текстом.
  if (name === 'status' && normalizeDialect(opts.dialect) === 'confluence') {
    const parsed = parseParams(params);
    const colour = (parsed.colour ?? parsed.color ?? 'grey').toLowerCase();
    const title = parsed.title ?? parsed._ ?? colour;
    const safeColour = /^[a-z]+$/.test(colour) ? colour : 'grey';
    return {
      html: `<span class="jira-status jira-status-${safeColour}">${escapeHtml(title)}</span>`,
      length: openLength,
    };
  }

  return null;
}

function tryLink(src: string, i: number, opts: RenderOptions): InlineMatch | null {
  let depth = 0;
  let end = -1;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\n') break;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  if (end < 0) return null;

  const inner = src.slice(i + 1, end);
  if (!inner.trim()) return null;

  const parts = splitTopLevel(inner, '|');
  const label = parts.length > 1 ? parts[0] : null;
  const target = (parts.length > 1 ? parts[1] : parts[0]).trim();
  const tip = parts.length > 2 ? parts[2].trim() : '';
  if (!target) return null;

  return { html: buildLink(label, target, tip, opts), length: end + 1 - i };
}

function buildLink(
  label: string | null,
  target: string,
  tip: string,
  opts: RenderOptions,
): string {
  const titleAttr = tip ? ` title="${escapeHtml(tip)}"` : '';
  const text = (fallback: string) =>
    label !== null ? renderInline(label, opts) : escapeHtml(fallback);

  if (target.startsWith('~')) {
    const user = target.slice(1);
    const base = opts.baseUrl ? trimTrailingSlash(opts.baseUrl) : '';
    const inner = text(`@${user}`);
    if (!base) return `<span class="jira-mention"${titleAttr}>${inner}</span>`;
    const href = `${base}/secure/ViewProfile.jspa?name=${encodeURIComponent(user)}`;
    return `<a class="jira-mention" href="${escapeHtml(href)}"${titleAttr}>${inner}</a>`;
  }

  if (target.startsWith('^')) {
    return `<span class="jira-attachment"${titleAttr}>📎 ${text(target.slice(1))}</span>`;
  }

  const href = resolveHref(target, opts);
  const inner = text(target);
  if (!href) return `<span class="jira-link-unresolved"${titleAttr}>${inner}</span>`;
  return `<a href="${escapeHtml(href)}"${titleAttr}>${inner}</a>`;
}

function resolveHref(target: string, opts: RenderOptions): string | null {
  if (URL_SCHEME_RE.test(target)) return target;
  if (target.startsWith('#')) return target;
  if (/^www\./i.test(target)) return `https://${target}`;
  const base = opts.baseUrl ? trimTrailingSlash(opts.baseUrl) : '';
  if (base && ISSUE_KEY_RE.test(target)) return `${base}/browse/${target}`;
  return null;
}

type MediaKind = 'video' | 'audio' | 'legacy';

/** Определяет, что за вложение указано в `!имя!`: плеер или картинка. */
function mediaKind(source: string): MediaKind | null {
  if (VIDEO_EXT_RE.test(source)) return 'video';
  if (AUDIO_EXT_RE.test(source)) return 'audio';
  if (LEGACY_MEDIA_EXT_RE.test(source)) return 'legacy';
  return null;
}

interface ImageParams {
  styles: string[];
  attrs: string[];
  classes: string[];
}

/** Разбирает `width=300, height=400, align=right, thumbnail` из `!файл|…!`. */
function parseImageParams(raw: string): ImageParams {
  const styles: string[] = [];
  const attrs: string[] = [];
  const classes: string[] = [];

  for (const chunk of raw.split(',')) {
    const part = chunk.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) {
      if (part.toLowerCase() === 'thumbnail') classes.push('jira-thumbnail');
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    switch (key) {
      case 'width':
      case 'height':
        if (/^\d+%?$/.test(value)) styles.push(`${key}:${/%$/.test(value) ? value : `${value}px`}`);
        break;
      case 'align':
        if (/^(left|right)$/i.test(value)) styles.push(`float:${value.toLowerCase()}`);
        else if (/^center$/i.test(value)) styles.push('display:block;margin-left:auto;margin-right:auto');
        break;
      case 'border':
        if (/^\d+$/.test(value)) styles.push(`border:${value}px solid var(--jira-border)`);
        break;
      case 'vspace':
        if (/^\d+$/.test(value)) styles.push(`margin-top:${value}px;margin-bottom:${value}px`);
        break;
      case 'hspace':
        if (/^\d+$/.test(value)) styles.push(`margin-left:${value}px;margin-right:${value}px`);
        break;
      case 'alt':
      case 'title':
        attrs.push(`${key}="${escapeHtml(value)}"`);
        break;
      default:
        break;
    }
  }

  return { styles, attrs, classes };
}

/** Заглушка для вложения, которое показать нельзя. */
function missingMedia(cls: string, icon: string, source: string): string {
  return `<span class="${cls}" title="${escapeHtml(source)}">${icon} ${escapeHtml(source)}</span>`;
}

function tryImage(src: string, i: number, opts: RenderOptions): InlineMatch | null {
  const match = /^!([^!\n|]+?)(?:\|([^!\n]*))?!/.exec(src.slice(i));
  if (!match) return null;

  const source = match[1].trim();
  const kind = mediaKind(source);
  const looksLikeImage = IMAGE_EXT_RE.test(source) || /^(https?:\/\/|data:image\/)/i.test(source);
  if (!kind && !looksLikeImage) return null;

  const length = match[0].length;
  const { styles, attrs, classes } = parseImageParams(match[2] ?? '');
  const styleAttr = styles.length ? ` style="${escapeHtml(styles.join(';'))}"` : '';
  const attrsStr = attrs.length ? ` ${attrs.join(' ')}` : '';

  // Flash, Real и Windows Media Jira встраивала плеером, но браузер их
  // уже не проигрывает — показываем ссылку на вложение, а не пустоту.
  if (kind === 'legacy') {
    return { html: missingMedia('jira-media-missing', '🎬', source), length };
  }

  const resolved = opts.resolveImage ? opts.resolveImage(source) : source;
  if (!resolved) {
    return kind
      ? { html: missingMedia('jira-media-missing', '🎬', source), length }
      : { html: missingMedia('jira-image-missing', '🖼', source), length };
  }

  if (kind) {
    const tag = kind === 'video' ? 'video' : 'audio';
    return {
      html: `<${tag} class="jira-media" controls preload="metadata" src="${escapeHtml(resolved)}"${styleAttr}${attrsStr}></${tag}>`,
      length,
    };
  }

  return {
    html: `<img class="${['jira-image', ...classes].join(' ')}" src="${escapeHtml(resolved)}"${styleAttr}${attrsStr}/>`,
    length,
  };
}
