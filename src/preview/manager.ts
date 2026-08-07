import * as vscode from 'vscode';
import { JiraPreview, PREVIEW_VIEW_TYPE } from './preview.ts';

/**
 * Держит по одной панели превью на документ и решает, какую показать
 * при вызове команды.
 */
export class JiraPreviewManager implements vscode.Disposable {
  private readonly previews = new Map<string, JiraPreview>();
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
            const uri = vscode.Uri.parse(raw);
            const document = await vscode.workspace.openTextDocument(uri);
            this.attach(panel, document);
          } catch {
            panel.dispose();
          }
        },
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
    const key = document.uri.toString();
    const existing = this.previews.get(key);
    if (existing) {
      existing.reveal(column);
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
    const key = document.uri.toString();
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: localRoots(this.context, document),
    };
    const preview = new JiraPreview(panel, document, this.context);
    this.previews.set(key, preview);
    panel.onDidDispose(() => this.previews.delete(key));
  }

  dispose(): void {
    for (const preview of this.previews.values()) preview.dispose();
    this.previews.clear();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

function previewTitle(document: vscode.TextDocument): string {
  const name = document.isUntitled
    ? vscode.l10n.t('Untitled')
    : document.uri.path.split('/').pop() ?? 'Jira';
  return vscode.l10n.t('Preview: {0}', name);
}

function localRoots(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
): vscode.Uri[] {
  const roots = [vscode.Uri.joinPath(context.extensionUri, 'media')];
  for (const folder of vscode.workspace.workspaceFolders ?? []) roots.push(folder.uri);
  if (document.uri.scheme === 'file') {
    roots.push(vscode.Uri.joinPath(document.uri, '..'));
  }
  return roots;
}
