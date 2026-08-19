import * as vscode from 'vscode';
import { JiraPreview, PREVIEW_VIEW_TYPE, localRoots, previewTitle } from './preview.ts';

/**
 * Держит единственную панель превью, которая следует за активным редактором:
 * переключились на другой файл Jira — превью показывает его, как это делает
 * встроенное превью Markdown. Второй панели не заводим: иначе непонятно,
 * какая из них должна следовать за редактором.
 */
export class JiraPreviewManager implements vscode.Disposable {
  private preview: JiraPreview | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.window.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, {
        deserializeWebviewPanel: async (panel, state: unknown) => {
          const raw = (state as { uri?: string } | undefined)?.uri;
          if (!raw) {
            panel.dispose();
            return;
          }
          try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(raw));
            this.attach(panel, document);
          } catch {
            panel.dispose();
          }
        },
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        // При переходе в саму панель превью активного редактора нет —
        // undefined означает «остаёмся на прежнем файле», а не «сбросить».
        if (editor?.document.languageId === 'jira') this.preview?.bind(editor.document);
      }),
    );
  }

  async showPreview(column: vscode.ViewColumn): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Open a file with Jira markup to see the preview.'),
      );
      return;
    }

    const document = editor.document;
    if (this.preview) {
      this.preview.bind(document);
      this.preview.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PREVIEW_VIEW_TYPE,
      previewTitle(document),
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: localRoots(this.context, document),
      },
    );

    this.attach(panel, document);
  }

  private attach(panel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: localRoots(this.context, document),
    };

    const previous = this.preview;
    const preview = new JiraPreview(panel, document, this.context);
    this.preview = preview;

    panel.onDidDispose(() => {
      if (this.preview === preview) this.preview = undefined;
    });

    // Сюда попадаем и при восстановлении сессии: если панель превью осталась
    // с прошлого запуска не одна, лишние закрываем — следует за редактором одна.
    previous?.close();
  }

  dispose(): void {
    this.preview?.dispose();
    this.preview = undefined;
    for (const disposable of this.disposables) disposable.dispose();
  }
}
