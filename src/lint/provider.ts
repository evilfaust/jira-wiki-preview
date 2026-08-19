import * as vscode from 'vscode';
import { dialectFor } from '../config.ts';
import { type LintIssue, type LintRule, lintJira } from './rules.ts';

const SOURCE = 'Jira';
const DEBOUNCE_MS = 300;

/** Макросы Confluence, которым есть прямая замена из арсенала самой Jira. */
const PANEL_REPLACEMENTS = new Set(['info', 'note', 'tip', 'warning']);

/** Проверяет разметку на то, что Jira отрисует не так, как задумал автор. */
export class JiraLinter implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('jira');
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.disposables.push(
      this.diagnostics,
      vscode.workspace.onDidOpenTextDocument((document) => this.schedule(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.diagnostics.delete(document.uri);
        this.cancel(document);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('jira')) this.recheckAll();
      }),
      vscode.languages.registerCodeActionsProvider('jira', new LintActions(), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }),
    );

    this.recheckAll();
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private recheckAll(): void {
    this.diagnostics.clear();
    for (const document of vscode.workspace.textDocuments) this.schedule(document);
  }

  private cancel(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  private schedule(document: vscode.TextDocument): void {
    if (document.languageId !== 'jira') return;
    this.cancel(document);
    const key = document.uri.toString();
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.check(document);
      }, DEBOUNCE_MS),
    );
  }

  private check(document: vscode.TextDocument): void {
    const enabled = vscode.workspace
      .getConfiguration('jira', document.uri)
      .get<boolean>('lint.enabled', true);
    if (!enabled) {
      this.diagnostics.delete(document.uri);
      return;
    }

    const issues = lintJira(document.getText(), dialectFor(document.uri));
    this.diagnostics.set(document.uri, issues.map(toDiagnostic));
  }
}

function toDiagnostic(issue: LintIssue): vscode.Diagnostic {
  const range = new vscode.Range(
    issue.line,
    issue.column,
    issue.line,
    issue.column + Math.max(1, issue.length),
  );
  const diagnostic = new vscode.Diagnostic(range, describe(issue), severityOf(issue.rule));
  diagnostic.source = SOURCE;
  diagnostic.code = issue.rule;
  return diagnostic;
}

function severityOf(rule: LintRule): vscode.DiagnosticSeverity {
  return rule === 'unknown-code-language'
    ? vscode.DiagnosticSeverity.Information
    : vscode.DiagnosticSeverity.Warning;
}

function describe(issue: LintIssue): string {
  const [first, second, third] = issue.args;
  switch (issue.rule) {
    case 'unclosed-macro':
      return vscode.l10n.t('“{0}” is never closed, so everything below it is swallowed.', `{${first}}`);
    case 'confluence-macro':
      return vscode.l10n.t(
        '“{0}” is a Confluence macro. Jira does not know it and prints it as plain text.',
        `{${first}}`,
      );
    case 'table-row-width':
      return vscode.l10n.t(
        'This row has {0} cells, but the table started with {1} on line {2}. A literal “|” inside a cell has to be escaped.',
        first,
        second,
        third,
      );
    case 'unknown-code-language':
      return vscode.l10n.t(
        'Jira does not know the language “{0}”, so the code will be shown without highlighting.',
        first,
      );
    case 'unclosed-monospace':
      return vscode.l10n.t('“{0}” is never closed, so monospace ends at the end of the line.', '{{');
    case 'unclosed-inline-macro':
      return vscode.l10n.t(
        '“{0}” is never closed on this line, so it will not be applied.',
        `{${first}}`,
      );
  }
}

/** Быстрые исправления к замечаниям линтера. */
class LintActions implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== SOURCE || diagnostic.code !== 'confluence-macro') continue;
      const name = /\{([a-zA-Z]+)/.exec(document.getText(diagnostic.range))?.[1]?.toLowerCase();
      if (!name) continue;

      if (PANEL_REPLACEMENTS.has(name)) {
        actions.push(replaceWithPanel(document, diagnostic, name));
      }
      actions.push(switchDialect(diagnostic));
    }

    return actions;
  }
}

/**
 * {info}…{info} → {panel}…{panel}: панель Jira отрисовывает, так что смысл
 * блока сохраняется. Заменяем обе строки — открывающую и закрывающую.
 */
function replaceWithPanel(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  name: string,
): vscode.CodeAction {
  const action = new vscode.CodeAction(
    vscode.l10n.t('Replace {0} with {1}', `{${name}}`, '{panel}'),
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  action.edit = new vscode.WorkspaceEdit();

  const open = document.getText(diagnostic.range);
  const params = /^\{[a-zA-Z]+(:[^}]*)?\}$/.exec(open)?.[1] ?? '';
  action.edit.replace(document.uri, diagnostic.range, `{panel${params}}`);

  const close = findClosingTag(document, name, diagnostic.range.end.line);
  if (close) action.edit.replace(document.uri, close, '{panel}');

  return action;
}

/** Ищет закрывающий `{name}` ниже указанной строки. */
function findClosingTag(
  document: vscode.TextDocument,
  name: string,
  fromLine: number,
): vscode.Range | null {
  const tag = `{${name}}`;
  for (let line = fromLine + 1; line < document.lineCount; line++) {
    const text = document.lineAt(line).text;
    const at = text.toLowerCase().indexOf(tag);
    if (at >= 0) return new vscode.Range(line, at, line, at + tag.length);
  }
  return null;
}

function switchDialect(diagnostic: vscode.Diagnostic): vscode.CodeAction {
  const action = new vscode.CodeAction(
    vscode.l10n.t('Render Confluence macros in the preview'),
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.command = {
    command: 'jira.useConfluenceDialect',
    title: vscode.l10n.t('Render Confluence macros in the preview'),
  };
  return action;
}
