import * as vscode from 'vscode';
import {
  convertFromMarkdown,
  convertToMarkdown,
  copyAsMarkdown,
  copySource,
  formatTableAtCursor,
  insertCodeBlock,
  insertLink,
  insertTable,
  newDocument,
  toggleWrap,
  useConfluenceDialect,
} from './commands.ts';
import { JiraCompletionProvider } from './language/completion.ts';
import { JiraFoldingProvider, JiraSymbolProvider } from './language/outline.ts';
import { JiraLinter } from './lint/provider.ts';
import { JiraPasteProvider, pasteAsJira } from './paste.ts';
import { JiraPreviewManager } from './preview/manager.ts';

const JIRA: vscode.DocumentSelector = { language: 'jira' };

export function activate(context: vscode.ExtensionContext): void {
  const manager = new JiraPreviewManager(context);
  context.subscriptions.push(manager, new JiraLinter());

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(JIRA, new JiraSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(JIRA, new JiraFoldingProvider()),
    vscode.languages.registerCompletionItemProvider(JIRA, new JiraCompletionProvider(), '{', ':'),
    vscode.languages.registerDocumentPasteEditProvider(JIRA, new JiraPasteProvider(), {
      providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Text.append('jira')],
      pasteMimeTypes: ['text/plain'],
    }),
  );

  const register = (command: string, callback: () => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));

  register('jira.showPreviewToSide', () => manager.showPreview(vscode.ViewColumn.Beside));
  register('jira.showPreview', () => manager.showPreview(vscode.ViewColumn.Active));

  register('jira.newDocument', async () => {
    await newDocument();
    await manager.showPreview(vscode.ViewColumn.Beside);
  });

  register('jira.copySource', () => copySource());
  register('jira.toggleBold', () => toggleWrap('*'));
  register('jira.toggleItalic', () => toggleWrap('_'));
  register('jira.toggleMonospace', () => toggleWrap('{{', '}}'));
  register('jira.toggleStrikethrough', () => toggleWrap('-'));
  register('jira.insertLink', () => insertLink());
  register('jira.insertCodeBlock', () => insertCodeBlock());
  register('jira.insertTable', () => insertTable());
  register('jira.formatTable', () => formatTableAtCursor());
  register('jira.pasteAsJira', () => pasteAsJira());
  register('jira.convertFromMarkdown', () => convertFromMarkdown());
  register('jira.convertToMarkdown', () => convertToMarkdown());
  register('jira.copyAsMarkdown', () => copyAsMarkdown());
  register('jira.useConfluenceDialect', () => useConfluenceDialect());
}

export function deactivate(): void {
  // Всё освобождается через context.subscriptions.
}
