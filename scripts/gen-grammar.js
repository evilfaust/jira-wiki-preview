const fs = require('node:fs');
const path = require('node:path');

// Языки, для которых {code:lang} подсвечивается вложенной грамматикой VS Code.
const EMBEDDED = [
  ['java', 'source.java', ['java']],
  ['javascript', 'source.js', ['javascript', 'js', 'node']],
  ['typescript', 'source.ts', ['typescript', 'ts']],
  ['json', 'source.json', ['json']],
  ['xml', 'text.xml', ['xml']],
  ['html', 'text.html.basic', ['html']],
  ['sql', 'source.sql', ['sql']],
  ['python', 'source.python', ['python', 'py']],
  ['shell', 'source.shell', ['bash', 'shell', 'sh']],
  ['yaml', 'source.yaml', ['yaml', 'yml']],
  ['css', 'source.css', ['css']],
  ['go', 'source.go', ['go', 'golang']],
  ['php', 'source.php', ['php']],
  ['ruby', 'source.ruby', ['ruby', 'rb']],
  ['csharp', 'source.cs', ['csharp', 'c#']],
  ['groovy', 'source.groovy', ['groovy']],
];

const CODE_END = '^\\s*(\\{)(code)(\\})\\s*$';
const CODE_END_CAPTURES = {
  1: { name: 'punctuation.definition.macro.jira' },
  2: { name: 'support.function.macro.jira' },
  3: { name: 'punctuation.definition.macro.jira' },
};

const repository = {};
const codeIncludes = [];

for (const [key, scope, aliases] of EMBEDDED) {
  const name = `code-${key}`;
  const alt = aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  repository[name] = {
    name: `markup.raw.block.jira meta.embedded.block.${key}`,
    begin: `^\\s*(\\{)(code)(:)((?:[^}\\n]*\\|)?(?:language=)?(?:${alt}))((?:\\|[^}\\n]*)?)(\\})\\s*$`,
    beginCaptures: {
      1: { name: 'punctuation.definition.macro.jira' },
      2: { name: 'support.function.macro.jira' },
      3: { name: 'punctuation.separator.jira' },
      4: { name: 'variable.parameter.jira' },
      5: { name: 'variable.parameter.jira' },
      6: { name: 'punctuation.definition.macro.jira' },
    },
    end: CODE_END,
    endCaptures: CODE_END_CAPTURES,
    contentName: `meta.embedded.block.${key}`,
    patterns: [{ include: scope }],
  };
  codeIncludes.push({ include: `#${name}` });
}

repository['code-generic'] = {
  name: 'markup.raw.block.jira',
  begin: '^\\s*(\\{)(code)(?:(:)([^}\\n]*))?(\\})\\s*$',
  beginCaptures: {
    1: { name: 'punctuation.definition.macro.jira' },
    2: { name: 'support.function.macro.jira' },
    3: { name: 'punctuation.separator.jira' },
    4: { name: 'variable.parameter.jira' },
    5: { name: 'punctuation.definition.macro.jira' },
  },
  end: CODE_END,
  endCaptures: CODE_END_CAPTURES,
  contentName: 'markup.raw.block.jira',
};

repository['noformat'] = {
  name: 'markup.raw.block.jira',
  begin: '^\\s*(\\{)(noformat)(?:(:)([^}\\n]*))?(\\})\\s*$',
  beginCaptures: {
    1: { name: 'punctuation.definition.macro.jira' },
    2: { name: 'support.function.macro.jira' },
    3: { name: 'punctuation.separator.jira' },
    4: { name: 'variable.parameter.jira' },
    5: { name: 'punctuation.definition.macro.jira' },
  },
  end: '^\\s*(\\{)(noformat)(\\})\\s*$',
  endCaptures: {
    1: { name: 'punctuation.definition.macro.jira' },
    2: { name: 'support.function.macro.jira' },
    3: { name: 'punctuation.definition.macro.jira' },
  },
  contentName: 'markup.raw.block.jira',
};

repository['heading'] = {
  match: '^\\s*(h[1-6]\\.)[ \\t]*(.*)$',
  captures: {
    1: { name: 'punctuation.definition.heading.jira keyword.control.jira' },
    2: { name: 'markup.heading.jira entity.name.section.jira', patterns: [{ include: '#inline' }] },
  },
};

repository['thematic-break'] = {
  match: '^\\s*-{4,}\\s*$',
  name: 'meta.separator.jira punctuation.definition.thematic-break.jira',
};

repository['blockquote-line'] = {
  match: '^\\s*(bq\\.)[ \\t]*(.*)$',
  captures: {
    1: { name: 'punctuation.definition.quote.jira keyword.control.jira' },
    2: { name: 'markup.quote.jira', patterns: [{ include: '#inline' }] },
  },
};

repository['list'] = {
  match: '^\\s*([*#-]+)(?=[ \\t])',
  captures: {
    1: { name: 'punctuation.definition.list.jira keyword.control.jira' },
  },
};

repository['table'] = {
  begin: '^(?=\\s*\\|)',
  end: '$',
  patterns: [
    { match: '\\|\\|', name: 'punctuation.definition.table.header.jira keyword.control.jira' },
    { match: '\\|', name: 'punctuation.definition.table.jira keyword.control.jira' },
    { include: '#inline' },
  ],
};

repository['macro'] = {
  match:
    '(\\{)(panel|quote|color|note|info|tip|warning|anchor|status|excerpt|section|column|toc|children|jiraissues)(?:(:)([^}\\n]*))?(\\})',
  captures: {
    1: { name: 'punctuation.definition.macro.jira' },
    2: { name: 'support.function.macro.jira' },
    3: { name: 'punctuation.separator.jira' },
    4: { name: 'variable.parameter.jira' },
    5: { name: 'punctuation.definition.macro.jira' },
  },
};

repository['escape'] = {
  match: '\\\\.',
  name: 'constant.character.escape.jira',
};

repository['monospace'] = {
  match: '(\\{\\{)([^\\n]*?)(\\}\\})',
  captures: {
    1: { name: 'punctuation.definition.raw.jira' },
    2: { name: 'markup.inline.raw.jira string.other.jira' },
    3: { name: 'punctuation.definition.raw.jira' },
  },
};

repository['link'] = {
  match: '(\\[)([^\\]\\n]*?)(?:(\\|)([^\\]\\n]*?))?(\\])',
  captures: {
    1: { name: 'punctuation.definition.link.jira' },
    2: { name: 'string.other.link.title.jira' },
    3: { name: 'punctuation.separator.jira' },
    4: { name: 'markup.underline.link.jira' },
    5: { name: 'punctuation.definition.link.jira' },
  },
};

repository['image'] = {
  match: '(!)([^\\s!|][^!\\n]*?)(!)',
  captures: {
    1: { name: 'punctuation.definition.image.jira' },
    2: { name: 'markup.underline.link.image.jira' },
    3: { name: 'punctuation.definition.image.jira' },
  },
};

/** Парные символы форматирования: имя scope → символ. */
// `wordAdjacent` — индексы вида x^2^ и H~2~O пишутся вплотную к слову.
const EMPHASIS = [
  ['bold', '\\*', 'markup.bold.jira', false],
  ['italic', '_', 'markup.italic.jira', false],
  ['strikethrough', '-', 'markup.strikethrough.jira', false],
  ['underline', '\\+', 'markup.underline.jira', false],
  ['superscript', '\\^', 'markup.other.superscript.jira', true],
  ['subscript', '~', 'markup.other.subscript.jira', true],
];

for (const [name, char, scope, wordAdjacent] of EMPHASIS) {
  const before = wordAdjacent ? '(?<!\\\\)' : '(?<![\\p{L}\\p{N}_\\\\])';
  const after = wordAdjacent ? '' : '(?![\\p{L}\\p{N}_])';
  repository[name] = {
    name: scope,
    match: `${before}(${char})(?![\\s${char}])([^\\n]*?)(?<!\\s)(${char})${after}`,
    captures: {
      1: { name: 'punctuation.definition.jira' },
      3: { name: 'punctuation.definition.jira' },
    },
  };
}

repository['citation'] = {
  name: 'markup.quote.jira',
  match: '(\\?\\?)(?!\\s)([^\\n]*?)(?<!\\s)(\\?\\?)',
  captures: {
    1: { name: 'punctuation.definition.jira' },
    3: { name: 'punctuation.definition.jira' },
  },
};

repository['url'] = {
  match: '(?<![\\p{L}\\p{N}_])(?:https?://|ftp://|www\\.)[^\\s<>"\'`)\\]}]+',
  name: 'markup.underline.link.jira',
};

repository['inline'] = {
  patterns: [
    { include: '#escape' },
    { include: '#monospace' },
    { include: '#macro' },
    { include: '#image' },
    { include: '#link' },
    { include: '#url' },
    { include: '#citation' },
    { include: '#bold' },
    { include: '#italic' },
    { include: '#underline' },
    { include: '#superscript' },
    { include: '#subscript' },
    { include: '#strikethrough' },
  ],
};

const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Jira Wiki Markup',
  scopeName: 'text.jira',
  patterns: [
    ...codeIncludes,
    { include: '#code-generic' },
    { include: '#noformat' },
    { include: '#heading' },
    { include: '#thematic-break' },
    { include: '#blockquote-line' },
    { include: '#table' },
    { include: '#list' },
    { include: '#inline' },
  ],
  repository,
};

const out = path.join(process.argv[2] ?? path.join(__dirname, '..'), 'syntaxes', 'jira.tmLanguage.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(grammar, null, 2) + '\n');
console.log('written', out, Object.keys(repository).length, 'rules');
