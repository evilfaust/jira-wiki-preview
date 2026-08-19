import * as vscode from 'vscode';
import { baseUrlFor, dialectFor } from '../config.ts';
import { highlightCode } from '../highlight.ts';
import { renderJira } from '../parser/index.ts';

export const PREVIEW_VIEW_TYPE = 'jira.preview';

const UPDATE_DEBOUNCE_MS = 150;
/** Столько миллисекунд после программного скролла игнорируем ответное эхо. */
const SCROLL_ECHO_MS = 250;

interface PreviewSettings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  maxWidth: number;
  scrollPreviewWithEditor: boolean;
  scrollEditorWithPreview: boolean;
  doubleClickToSwitchToEditor: boolean;
  highlightCode: boolean;
}

/** Одна панель превью, привязанная к конкретному документу. */
export class JiraPreview implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private updateTimer: NodeJS.Timeout | undefined;
  private lastEditorScrollAt = 0;
  private lastPreviewScrollAt = 0;
  private disposed = false;

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly document: vscode.TextDocument,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel.webview.html = this.buildShell();

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === this.document.uri.toString()) this.scheduleUpdate();
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.toString() === this.document.uri.toString()) this.update();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('jira')) {
          this.panel.webview.html = this.buildShell();
          this.update();
        }
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.onEditorScroll(event)),
      this.panel.webview.onDidReceiveMessage((message) => this.onMessage(message)),
    );

    this.panel.onDidDispose(() => this.dispose());
    this.update();
  }

  reveal(column: vscode.ViewColumn): void {
    this.panel.reveal(column, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }

  private settings(): PreviewSettings {
    const config = vscode.workspace.getConfiguration('jira', this.document.uri);
    return {
      theme: config.get<string>('preview.theme', 'jira'),
      fontSize: config.get<number>('preview.fontSize', 14),
      fontFamily: config.get<string>('preview.fontFamily', 'sans-serif'),
      maxWidth: config.get<number>('preview.maxWidth', 0),
      scrollPreviewWithEditor: config.get<boolean>('preview.scrollPreviewWithEditor', true),
      scrollEditorWithPreview: config.get<boolean>('preview.scrollEditorWithPreview', true),
      doubleClickToSwitchToEditor: config.get<boolean>('preview.doubleClickToSwitchToEditor', true),
      highlightCode: config.get<boolean>('preview.highlightCode', true),
    };
  }

  private scheduleUpdate(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.update(), UPDATE_DEBOUNCE_MS);
  }

  private update(): void {
    if (this.disposed) return;
    const settings = this.settings();

    let html: string;
    try {
      html = renderJira(this.document.getText(), {
        dialect: dialectFor(this.document.uri),
        baseUrl: baseUrlFor(this.document.uri),
        resolveImage: (src) => this.resolveImage(src),
        highlightCode: settings.highlightCode ? highlightCode : undefined,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? escapeHtmlText(error.message) : vscode.l10n.t('unknown error');
      html = `<p class="jira-error">${escapeHtmlText(vscode.l10n.t('Could not render the markup:'))} ${reason}</p>`;
    }

    void this.panel.webview.postMessage({ type: 'update', html, settings });
  }

  private resolveImage(src: string): string {
    if (/^(https?:|data:)/i.test(src)) return src;
    if (this.document.uri.scheme !== 'file') return '';
    try {
      const folder = vscode.Uri.joinPath(this.document.uri, '..');
      const target = vscode.Uri.joinPath(folder, src);
      return this.panel.webview.asWebviewUri(target).toString();
    } catch {
      return '';
    }
  }

  private onEditorScroll(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (event.textEditor.document.uri.toString() !== this.document.uri.toString()) return;
    if (!this.settings().scrollPreviewWithEditor) return;
    if (Date.now() - this.lastPreviewScrollAt < SCROLL_ECHO_MS) return;
    const range = event.visibleRanges[0];
    if (!range) return;
    this.lastEditorScrollAt = Date.now();
    void this.panel.webview.postMessage({ type: 'scrollTo', line: range.start.line });
  }

  private onMessage(message: unknown): void {
    const data = message as { type?: string; line?: number } | undefined;
    if (!data?.type) return;

    if (data.type === 'revealLine' && typeof data.line === 'number') {
      if (!this.settings().scrollEditorWithPreview) return;
      if (Date.now() - this.lastEditorScrollAt < SCROLL_ECHO_MS) return;
      this.lastPreviewScrollAt = Date.now();
      const editor = this.findEditor();
      if (!editor) return;
      const line = clampLine(this.document, data.line);
      editor.revealRange(
        new vscode.Range(line, 0, line, 0),
        vscode.TextEditorRevealType.AtTop,
      );
      return;
    }

    if (data.type === 'clickLine' && typeof data.line === 'number') {
      void this.focusLine(data.line);
    }
  }

  private async focusLine(rawLine: number): Promise<void> {
    const line = clampLine(this.document, rawLine);
    const editor =
      this.findEditor() ??
      (await vscode.window.showTextDocument(this.document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      }));
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
  }

  private findEditor(): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === this.document.uri.toString(),
    );
  }

  private buildShell(): string {
    const webview = this.panel.webview;
    const nonce = createNonce();
    const settings = this.settings();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.js'),
    );
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `media-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="stylesheet" href="${styleUri}"/>
<title>Jira preview</title>
</head>
<body class="theme-${settings.theme === 'editor' ? 'editor' : 'jira'}" data-uri="${escapeHtmlText(
      this.document.uri.toString(),
    ).replace(/"/g, '&quot;')}">
<div id="content" class="jira-content"><p class="jira-placeholder">${escapeHtmlText(vscode.l10n.t('Loading…'))}</p></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function clampLine(document: vscode.TextDocument, line: number): number {
  return Math.max(0, Math.min(line, Math.max(0, document.lineCount - 1)));
}

function escapeHtmlText(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}
