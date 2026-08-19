import * as vscode from 'vscode';
import { type Dialect, normalizeDialect } from './parser/dialect.ts';

/**
 * Диалект разметки для конкретного документа. Настройка может быть переопределена
 * на уровне папки, поэтому читаем её с привязкой к файлу, а не глобально.
 */
export function dialectFor(resource: vscode.Uri | undefined): Dialect {
  return normalizeDialect(
    vscode.workspace.getConfiguration('jira', resource).get<string>('markup.dialect'),
  );
}

/** Базовый URL Jira без хвостового слеша, либо undefined, если не задан. */
export function baseUrlFor(resource: vscode.Uri | undefined): string | undefined {
  const value = vscode.workspace
    .getConfiguration('jira', resource)
    .get<string>('baseUrl', '')
    .trim();
  return value || undefined;
}
