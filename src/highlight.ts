import hljs from 'highlight.js/lib/common';
import dart from 'highlight.js/lib/languages/dart';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import groovy from 'highlight.js/lib/languages/groovy';
import http from 'highlight.js/lib/languages/http';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';
import properties from 'highlight.js/lib/languages/properties';
import protobuf from 'highlight.js/lib/languages/protobuf';
import scala from 'highlight.js/lib/languages/scala';

/** Языки поверх набора highlight.js/lib/common — те, что часто встречаются в задачах. */
const EXTRA_LANGUAGES = {
  dart,
  dockerfile,
  groovy,
  http,
  nginx,
  powershell,
  properties,
  protobuf,
  scala,
};

for (const [name, definition] of Object.entries(EXTRA_LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

/** Для этих значений подсветка не нужна: код показываем как есть. */
const PLAIN = new Set(['', 'none', 'text', 'plain', 'plaintext', 'raw', 'log', 'output']);

/** Алиасы из Jira/Confluence, которых highlight.js не знает. */
const ALIASES: Record<string, string> = {
  actionscript: 'javascript',
  conf: 'properties',
  gradle: 'groovy',
  jsonc: 'json',
  jsx: 'javascript',
  plsql: 'sql',
  psql: 'sql',
  tsx: 'typescript',
  vue: 'xml',
  zsh: 'bash',
};

/**
 * Возвращает HTML с токенами highlight.js или `null`, если язык неизвестен —
 * тогда вызывающий код экранирует исходник сам.
 */
export function highlightCode(code: string, language: string): string | null {
  const key = language.trim().toLowerCase();
  if (PLAIN.has(key)) return null;

  const name = ALIASES[key] ?? key;
  if (!hljs.getLanguage(name)) return null;

  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}
