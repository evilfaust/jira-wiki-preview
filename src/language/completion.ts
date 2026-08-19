import * as vscode from 'vscode';
import { dialectFor } from '../config.ts';
import { CODE_LANGUAGES, type Dialect, isConfluenceOnly } from '../parser/dialect.ts';
import { EMOTICON_ICONS } from '../parser/emoticons.ts';

interface MacroSuggestion {
  name: string;
  /** Тело сниппета вместе с открывающей скобкой. */
  body: string;
}

/** Макросы, которые отрисовывает сама Jira. */
const JIRA_SUGGESTIONS: MacroSuggestion[] = [
  { name: 'code', body: '{code:${1|java,javascript,json,xml,sql,python,bash,yaml,none|}}\n$0\n{code}' },
  { name: 'noformat', body: '{noformat}\n$0\n{noformat}' },
  { name: 'panel', body: '{panel:title=${1:Title}}\n$0\n{panel}' },
  { name: 'quote', body: '{quote}\n$0\n{quote}' },
  { name: 'color', body: '{color:${1|red,green,blue,orange,purple,#172B4D|}}${2:text}{color}$0' },
  { name: 'anchor', body: '{anchor:${1:name}}$0' },
];

/** Макросы Confluence — предлагаются только в одноимённом диалекте. */
const CONFLUENCE_SUGGESTIONS: MacroSuggestion[] = [
  { name: 'info', body: '{info:title=${1:Info}}\n$0\n{info}' },
  { name: 'note', body: '{note}\n$0\n{note}' },
  { name: 'tip', body: '{tip}\n$0\n{tip}' },
  { name: 'warning', body: '{warning}\n$0\n{warning}' },
  { name: 'toc', body: '{toc:maxLevel=${1:3}}$0' },
  { name: 'status', body: '{status:colour=${1|Green,Yellow,Red,Blue,Grey|}|title=${2:Done}}$0' },
  { name: 'excerpt', body: '{excerpt}\n$0\n{excerpt}' },
  { name: 'section', body: '{section}\n$0\n{section}' },
  { name: 'column', body: '{column:width=${1:50%}}\n$0\n{column}' },
];

const COLORS = ['red', 'green', 'blue', 'orange', 'purple', 'grey', '#172B4D', '#DE350B', '#00875A'];

/** Дополняет имена макросов, языки подсветки, цвета и эмотиконы. */
export class JiraCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const dialect = dialectFor(document.uri);

    const code = /\{code:(?:[^}]*\|)?([\w+#.-]*)$/i.exec(before);
    if (code) return plainItems(CODE_LANGUAGES, position, code[1].length, vscode.CompletionItemKind.Value);

    const color = /\{color:([\w#]*)$/i.exec(before);
    if (color) return plainItems(COLORS, position, color[1].length, vscode.CompletionItemKind.Color);

    const macro = /\{([a-zA-Z]*)$/.exec(before);
    if (macro) return macroItems(dialect, position, macro[1].length + 1);

    // Эмотиконы шумят в обычном тексте, поэтому только по явному Ctrl+Space.
    const emoticon = /(\([\w*/!?+-]*)$/.exec(before);
    if (emoticon) return emoticonItems(position, emoticon[1].length);

    return undefined;
  }
}

/** Диапазон, который заменит подстановка: уже набранный префикс. */
function replacing(position: vscode.Position, typed: number): vscode.Range {
  return new vscode.Range(position.translate(0, -typed), position);
}

function plainItems(
  values: readonly string[],
  position: vscode.Position,
  typed: number,
  kind: vscode.CompletionItemKind,
): vscode.CompletionItem[] {
  const range = replacing(position, typed);
  return values.map((value) => {
    const item = new vscode.CompletionItem(value, kind);
    item.range = range;
    return item;
  });
}

function macroItems(
  dialect: Dialect,
  position: vscode.Position,
  typed: number,
): vscode.CompletionItem[] {
  const suggestions =
    dialect === 'confluence'
      ? [...JIRA_SUGGESTIONS, ...CONFLUENCE_SUGGESTIONS]
      : JIRA_SUGGESTIONS;
  const range = replacing(position, typed);

  return suggestions.map((suggestion) => {
    const item = new vscode.CompletionItem(suggestion.name, vscode.CompletionItemKind.Snippet);
    item.insertText = new vscode.SnippetString(suggestion.body);
    item.range = range;
    item.filterText = `{${suggestion.name}`;
    if (isConfluenceOnly(suggestion.name)) {
      item.detail = 'Confluence';
      item.documentation = vscode.l10n.t('Jira does not render this macro.');
      // Родные макросы Jira должны стоять выше в списке.
      item.sortText = `z${suggestion.name}`;
    } else {
      item.detail = 'Jira';
      item.sortText = `a${suggestion.name}`;
    }
    return item;
  });
}

function emoticonItems(position: vscode.Position, typed: number): vscode.CompletionItem[] {
  const range = replacing(position, typed);
  return Object.keys(EMOTICON_ICONS).map((key) => {
    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);
    item.insertText = key;
    item.range = range;
    item.filterText = key;
    return item;
  });
}
