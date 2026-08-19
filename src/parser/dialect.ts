/**
 * Что именно умеет разметка Jira, а что пришло из Confluence.
 *
 * Набор сверен со справкой «Text Formatting Notation Help», которую Jira
 * показывает по кнопке «?» рядом с полем описания: в разделе Advanced
 * Formatting перечислены ровно три макроса — {code}, {noformat} и {panel},
 * плюс {quote} и {color} в разделе текстовых эффектов и {anchor} в ссылках.
 *
 * Всё остальное ({toc}, {info}, {note}, {tip}, {warning}, {status},
 * {section}, {column}, {excerpt}) — макросы Confluence. Jira их не знает и
 * печатает как обычный текст, поэтому по умолчанию так же поступаем и мы:
 * превью должно показывать то, что увидит читатель задачи.
 */

export type Dialect = 'jira' | 'confluence';

const DEFAULT_DIALECT: Dialect = 'jira';

/** Блочные макросы, которые отрисовывает сама Jira. */
const JIRA_BLOCK_MACROS = ['code', 'noformat', 'panel', 'quote', 'color'] as const;

/** Блочные макросы Confluence — в диалекте `jira` остаются текстом. */
const CONFLUENCE_BLOCK_MACROS = [
  'info',
  'note',
  'tip',
  'warning',
  'excerpt',
  'section',
  'column',
] as const;

/** Строчные макросы Confluence. */
const CONFLUENCE_INLINE_MACROS = ['status'] as const;

/** Макросы Confluence, у которых нет тела: пишутся одним тегом. */
const CONFLUENCE_STANDALONE_MACROS = ['toc'] as const;

const JIRA_BLOCKS = new Set<string>(JIRA_BLOCK_MACROS);
const ALL_BLOCKS = new Set<string>([...JIRA_BLOCK_MACROS, ...CONFLUENCE_BLOCK_MACROS]);

/** Все макросы, которых в Jira нет: их ищет линтер. */
const CONFLUENCE_ONLY = new Set<string>([
  ...CONFLUENCE_BLOCK_MACROS,
  ...CONFLUENCE_INLINE_MACROS,
  ...CONFLUENCE_STANDALONE_MACROS,
]);

export function normalizeDialect(value: string | undefined): Dialect {
  return value === 'confluence' ? 'confluence' : DEFAULT_DIALECT;
}

/** Открывает ли `name` блок с телом в этом диалекте. */
export function isBlockMacro(name: string, dialect: Dialect): boolean {
  return (dialect === 'confluence' ? ALL_BLOCKS : JIRA_BLOCKS).has(name);
}

/** Знает ли диалект макрос без тела: сейчас это только {toc}. */
export function isStandaloneMacro(name: string, dialect: Dialect): boolean {
  return dialect === 'confluence' && name === 'toc';
}

/** Есть ли такой макрос в Confluence, но не в Jira. */
export function isConfluenceOnly(name: string): boolean {
  return CONFLUENCE_ONLY.has(name.toLowerCase());
}

/**
 * Языки подсветки, перечисленные в справке Jira для {code}. Всё остальное
 * Jira покажет без подсветки, даже если highlight.js в превью справится.
 */
const JIRA_CODE_LANGUAGES = [
  'actionscript',
  'ada',
  'applescript',
  'bash',
  'c',
  'c#',
  'c++',
  'css',
  'erlang',
  'go',
  'groovy',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'lua',
  'none',
  'nyan',
  'objc',
  'perl',
  'php',
  'python',
  'r',
  'ruby',
  'scala',
  'sql',
  'swift',
  'visualbasic',
  'xml',
  'yaml',
] as const;

export const CODE_LANGUAGES: readonly string[] = JIRA_CODE_LANGUAGES;

const CODE_LANGUAGE_SET = new Set<string>(JIRA_CODE_LANGUAGES);

/** Знает ли Jira такой язык в {code:язык}. */
export function isKnownCodeLanguage(language: string): boolean {
  return CODE_LANGUAGE_SET.has(language.trim().toLowerCase());
}
