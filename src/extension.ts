import * as vscode from 'vscode';
import {
  copySource,
  insertCodeBlock,
  insertLink,
  insertTable,
  newDocument,
  toggleWrap,
} from './commands.ts';
import { JiraPreviewManager } from './preview/manager.ts';

export function activate(context: vscode.ExtensionContext): void {
  const manager = new JiraPreviewManager(context);
  context.subscriptions.push(manager);

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
}

export function deactivate(): void {
  // Всё освобождается через context.subscriptions.
}
