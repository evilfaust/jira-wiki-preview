import * as vscode from 'vscode';
import { jiraToMarkdown, markdownToJira } from './convert/index.ts';
import { findTableAt, formatTable } from './table-format.ts';

/**
 * Оборачивает выделение парой маркеров, а если оно уже обёрнуто — снимает их.
 * Пустое выделение расширяется до слова под курсором.
 */
export async function toggleWrap(open: string, close: string = open): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const document = editor.document;

  const replacements: { range: vscode.Range; text: string }[] = [];
  const insertions: vscode.Position[] = [];

  for (const selection of editor.selections) {
    let range = new vscode.Range(selection.start, selection.end);
    if (selection.isEmpty) {
      const word = document.getWordRangeAtPosition(selection.active);
      if (!word) {
        insertions.push(selection.active);
        continue;
      }
      range = word;
    }

    const text = document.getText(range);
    if (
      text.length >= open.length + close.length &&
      text.startsWith(open) &&
      text.endsWith(close)
    ) {
      replacements.push({ range, text: text.slice(open.length, text.length - close.length) });
      continue;
    }

    const outer = expand(document, range, open.length, close.length);
    if (outer && document.getText(outer) === `${open}${text}${close}`) {
      replacements.push({ range: outer, text });
      continue;
    }

    replacements.push({ range, text: `${open}${text}${close}` });
  }

  if (replacements.length) {
    await editor.edit((builder) => {
      for (const item of replacements) builder.replace(item.range, item.text);
    });
  }

  if (insertions.length) {
    const snippet = new vscode.SnippetString();
    snippet.appendText(open);
    snippet.appendTabstop(0);
    snippet.appendText(close);
    await editor.insertSnippet(snippet, insertions);
  }
}

function expand(
  document: vscode.TextDocument,
  range: vscode.Range,
  openLength: number,
  closeLength: number,
): vscode.Range | null {
  const start = document.offsetAt(range.start) - openLength;
  const end = document.offsetAt(range.end) + closeLength;
  if (start < 0) return null;
  const lastOffset = document.offsetAt(
    document.lineAt(document.lineCount - 1).range.end,
  );
  if (end > lastOffset) return null;
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

export async function insertLink(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const selected = editor.document.getText(selection).trim();
  const snippet = new vscode.SnippetString('[');

  if (/^(https?:\/\/|www\.|mailto:)/i.test(selected)) {
    snippet.appendPlaceholder(vscode.l10n.t('link text'));
    snippet.appendText('|');
    snippet.appendText(selected);
  } else {
    if (selected) snippet.appendText(selected);
    else snippet.appendPlaceholder(vscode.l10n.t('link text'));
    snippet.appendText('|');
    snippet.appendPlaceholder('https://');
  }
  snippet.appendText(']');
  snippet.appendTabstop(0);

  await editor.insertSnippet(snippet, selection);
}

export async function insertCodeBlock(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const selected = editor.document.getText(selection);
  const snippet = new vscode.SnippetString('{code:');
  snippet.appendPlaceholder('java');
  snippet.appendText('}\n');
  if (selected) snippet.appendText(selected.replace(/\n$/, ''));
  else snippet.appendTabstop(0);
  snippet.appendText('\n{code}\n');

  await editor.insertSnippet(snippet, selection);
}

export async function insertTable(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const snippet = new vscode.SnippetString();
  snippet.appendText('||');
  snippet.appendPlaceholder(vscode.l10n.t('Heading 1'));
  snippet.appendText('||');
  snippet.appendPlaceholder(vscode.l10n.t('Heading 2'));
  snippet.appendText('||\n|');
  snippet.appendPlaceholder(vscode.l10n.t('cell'));
  snippet.appendText('|');
  snippet.appendPlaceholder(vscode.l10n.t('cell'));
  snippet.appendText('|\n');
  snippet.appendTabstop(0);

  await editor.insertSnippet(snippet, editor.selection);
}

export async function newDocument(): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument({ language: 'jira', content: '' });
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  return document;
}

export async function copySource(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const selection = editor.selection;
  const text = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);
  await vscode.env.clipboard.writeText(text);
  void vscode.window.setStatusBarMessage(vscode.l10n.t('Jira markup copied to clipboard'), 2500);
}

/** Выравнивает столбцы таблицы, внутри которой стоит курсор. */
export async function formatTableAtCursor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const lines = document.getText().split(/\r\n|\r|\n/);
  const block = findTableAt(lines, editor.selection.active.line);
  if (!block) {
    void vscode.window.setStatusBarMessage(vscode.l10n.t('The cursor is not inside a table'), 2500);
    return;
  }

  const formatted = formatTable(block.lines);
  if (formatted.join('\n') === block.lines.join('\n')) return;

  const range = new vscode.Range(
    block.start,
    0,
    block.end,
    document.lineAt(block.end).text.length,
  );
  await editor.edit((builder) => builder.replace(range, formatted.join('\n')));
}

/** Заменяет документ или выделение результатом преобразования. */
async function replaceWith(transform: (text: string) => string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const selection = editor.selection;
  const range = selection.isEmpty
    ? new vscode.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
    : new vscode.Range(selection.start, selection.end);

  const converted = transform(document.getText(range));
  await editor.edit((builder) => builder.replace(range, converted));
}

export function convertFromMarkdown(): Promise<void> {
  return replaceWith(markdownToJira);
}

export function convertToMarkdown(): Promise<void> {
  return replaceWith(jiraToMarkdown);
}

/** Кладёт документ или выделение в буфер обмена уже в виде Markdown. */
export async function copyAsMarkdown(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const source = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);

  await vscode.env.clipboard.writeText(jiraToMarkdown(source));
  void vscode.window.setStatusBarMessage(vscode.l10n.t('Copied to clipboard as Markdown'), 2500);
}

/** Переключает диалект на Confluence — вызывается быстрым исправлением. */
export async function useConfluenceDialect(): Promise<void> {
  await vscode.workspace
    .getConfiguration('jira')
    .update('markup.dialect', 'confluence', vscode.ConfigurationTarget.Workspace);
}
