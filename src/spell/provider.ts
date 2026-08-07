import * as vscode from 'vscode';
import { SpellClient } from './client.ts';
import { maskNonProse } from './mask.ts';
import { extractWords, normalizeWord, type WordLanguage, type WordOptions } from './words.ts';

const DIAGNOSTIC_SOURCE = 'Jira: орфография';
const CHECK_DEBOUNCE_MS = 400;
const ADD_WORD_COMMAND = 'jira.spell.addWord';

interface SpellSettings extends WordOptions {
  enabled: boolean;
  userWords: Set<string>;
}

/** Проверка орфографии для файлов Jira: диагностики и быстрые исправления. */
export class SpellChecker implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('jira-spell');
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly client: SpellClient;
  private errorShown = false;

  constructor(context: vscode.ExtensionContext) {
    this.client = new SpellClient(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'speller.js').fsPath,
      vscode.Uri.joinPath(context.extensionUri, 'dictionaries').fsPath,
      (message) => this.reportError(message),
    );

    this.disposables.push(
      this.diagnostics,
      vscode.workspace.onDidOpenTextDocument((document) => this.schedule(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.diagnostics.delete(document.uri);
        this.cancel(document);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('jira.spell')) this.recheckAll();
      }),
      vscode.languages.registerCodeActionsProvider('jira', new SpellActions(this), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }),
      vscode.commands.registerCommand(ADD_WORD_COMMAND, (word: string) => this.addWord(word)),
    );

    this.recheckAll();
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.client.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  async suggest(language: WordLanguage, word: string): Promise<string[]> {
    try {
      return await this.client.suggest(language, word);
    } catch {
      return [];
    }
  }

  private settings(resource: vscode.Uri | undefined): SpellSettings {
    const config = vscode.workspace.getConfiguration('jira', resource);
    const languages = config.get<string[]>('spell.languages', ['ru', 'en']);
    return {
      enabled: config.get<boolean>('spell.enabled', true),
      languages: languages.filter((l): l is WordLanguage => l === 'ru' || l === 'en'),
      minLength: Math.max(1, config.get<number>('spell.minWordLength', 3)),
      ignoreAllCaps: config.get<boolean>('spell.ignoreAllCaps', true),
      userWords: new Set(
        config.get<string[]>('spell.userWords', []).map((word) => normalizeWord(word)),
      ),
    };
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
        void this.check(document);
      }, CHECK_DEBOUNCE_MS),
    );
  }

  private async check(document: vscode.TextDocument): Promise<void> {
    const settings = this.settings(document.uri);
    if (!settings.enabled || !settings.languages.length) {
      this.diagnostics.delete(document.uri);
      return;
    }

    const version = document.version;
    const text = document.getText();
    const found = extractWords(maskNonProse(text), settings).filter(
      (item) => !settings.userWords.has(normalizeWord(item.word)),
    );
    if (!found.length) {
      this.diagnostics.set(document.uri, []);
      return;
    }

    // В словарь уходят только уникальные слова: в тексте они повторяются часто.
    const unique = new Map<WordLanguage, Set<string>>();
    for (const item of found) {
      const bucket = unique.get(item.language) ?? new Set<string>();
      bucket.add(item.word);
      unique.set(item.language, bucket);
    }

    const unknown = new Map<WordLanguage, Set<string>>();
    try {
      for (const [language, words] of unique) {
        unknown.set(language, new Set(await this.client.check(language, [...words])));
      }
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : 'Проверка орфографии не удалась');
      return;
    }

    // Пока ждали словарь, документ мог измениться — тогда сработает следующая проверка.
    if (document.version !== version) return;

    const diagnostics = found
      .filter((item) => unknown.get(item.language)?.has(item.word))
      .map((item) => {
        const range = new vscode.Range(
          document.positionAt(item.offset),
          document.positionAt(item.offset + item.word.length),
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          `Возможна опечатка: «${item.word}»`,
          vscode.DiagnosticSeverity.Information,
        );
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostic.code = item.language;
        return diagnostic;
      });

    this.diagnostics.set(document.uri, diagnostics);
  }

  private async addWord(word: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('jira');
    const current = config.get<string[]>('spell.userWords', []);
    if (current.some((existing) => normalizeWord(existing) === normalizeWord(word))) return;
    await config.update(
      'spell.userWords',
      [...current, word].sort((a, b) => a.localeCompare(b, 'ru')),
      vscode.ConfigurationTarget.Global,
    );
  }

  private reportError(message: string): void {
    if (this.errorShown) return;
    this.errorShown = true;
    void vscode.window.showWarningMessage(`Jira: ${message}`);
  }
}

/** Быстрые исправления: варианты замены и добавление слова в словарь. */
class SpellActions implements vscode.CodeActionProvider {
  constructor(private readonly checker: SpellChecker) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const relevant = context.diagnostics.filter((d) => d.source === DIAGNOSTIC_SOURCE);
    if (!relevant.length) return [];

    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of relevant.slice(0, 3)) {
      const word = document.getText(diagnostic.range);
      const language = diagnostic.code === 'en' ? 'en' : 'ru';

      // Подсказки считаются лениво — они дороже самой проверки.
      const suggestions = await this.checker.suggest(language, word);
      for (const [index, suggestion] of suggestions.entries()) {
        const action = new vscode.CodeAction(
          `Заменить на «${suggestion}»`,
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diagnostic.range, suggestion);
        action.diagnostics = [diagnostic];
        action.isPreferred = index === 0;
        actions.push(action);
      }

      const add = new vscode.CodeAction(
        `Добавить «${word}» в словарь`,
        vscode.CodeActionKind.QuickFix,
      );
      add.command = { command: ADD_WORD_COMMAND, title: 'Добавить в словарь', arguments: [word] };
      add.diagnostics = [diagnostic];
      actions.push(add);
    }

    return actions;
  }
}
