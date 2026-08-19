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
  /**
   * Webview принимает сообщения только после того, как загрузит свой скрипт;
   * отправленное раньше VS Code не ставит в очередь, а молча теряет. Поэтому
   * первую отрисовку заказывает сам webview сообщением `ready`.
   */
  private ready = false;

  /**
   * Не readonly: если файл закрыть и открыть заново, VS Code создаёт новый
   * TextDocument, а прежний навсегда остаётся с текстом на момент закрытия.
   * Ссылку приходится обновлять, иначе превью рисует мёртвый объект.
   */
  private document: vscode.TextDocument;

  constructor(
    private readonly panel: vscode.WebviewPanel,
    document: vscode.TextDocument,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.document = document;
    this.reload();

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.isOurs(event.document)) return;
        // Событие приносит живой документ — берём его вместо своей ссылки.
        this.document = event.document;
        this.scheduleUpdate();
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!this.isOurs(doc)) return;
        this.document = doc;
        this.update();
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        // Файл открыли заново после закрытия: подхватываем новый объект.
        if (!this.isOurs(doc)) return;
        this.document = doc;
        this.update();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        // Смена настроек перестраивает шелл, а это перезагружает webview:
        // ждём от него нового `ready`, иначе отрисовка уйдёт в никуда.
        if (event.affectsConfiguration('jira')) this.reload();
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.onEditorScroll(event)),
      // Пока панель скрыта, сообщения могут не дойти — освежаем при возврате.
      this.panel.onDidChangeViewState(() => {
        if (this.panel.visible) this.update();
      }),
      this.panel.webview.onDidReceiveMessage((message) => this.onMessage(message)),
    );

    this.panel.onDidDispose(() => this.dispose());
  }

  /** Пересобирает разметку панели; отрисовку закажет `ready` от webview. */
  private reload(): void {
    this.ready = false;
    this.panel.webview.html = this.buildShell();
  }

  reveal(column: vscode.ViewColumn): void {
    this.panel.reveal(column, true);
  }

  /**
   * Переключает превью на другой документ — панель следует за редактором.
   * Тот же файл не перезагружает панель, чтобы не терять позицию скролла.
   */
  bind(document: vscode.TextDocument): void {
    if (this.disposed) return;

    if (this.isOurs(document)) {
      // Тот же файл: объект мог пересоздаться, содержимое — измениться.
      this.document = document;
      this.update();
      return;
    }

    this.document = document;
    this.panel.title = previewTitle(document);

    // Присваивание options само по себе перезагружает webview, поэтому трогаем
    // их только когда набор корней действительно изменился — обычно соседние
    // файлы лежат в одной папке, и лишней перезагрузки не будет.
    const roots = localRoots(this.context, document);
    if (!sameRoots(this.panel.webview.options.localResourceRoots, roots)) {
      this.panel.webview.options = { enableScripts: true, localResourceRoots: roots };
    }
    this.reload();
  }

  /** Закрывает панель; отписка произойдёт через onDidDispose. */
  close(): void {
    this.panel.dispose();
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

  private isOurs(document: vscode.TextDocument): boolean {
    return document.uri.toString() === this.document.uri.toString();
  }

  /** Живой документ с тем же URI, если VS Code успел пересоздать наш. */
  private refreshDocument(): void {
    const key = this.document.uri.toString();
    const live = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === key);
    if (live) this.document = live;
  }

  private update(): void {
    if (this.disposed || !this.ready) return;
    this.refreshDocument();
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

    // Webview загрузился и готов принимать сообщения — только теперь рисуем.
    if (data.type === 'ready') {
      this.ready = true;
      this.update();
      return;
    }

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

function sameRoots(current: readonly vscode.Uri[] | undefined, next: vscode.Uri[]): boolean {
  if (!current || current.length !== next.length) return false;
  return current.every((uri, index) => uri.toString() === next[index].toString());
}

export function previewTitle(document: vscode.TextDocument): string {
  const name = document.isUntitled
    ? vscode.l10n.t('Untitled')
    : (document.uri.path.split('/').pop() ?? 'Jira');
  return vscode.l10n.t('Preview: {0}', name);
}

/** Откуда webview разрешено грузить картинки: media, папки проекта и папка файла. */
export function localRoots(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
): vscode.Uri[] {
  const roots = [vscode.Uri.joinPath(context.extensionUri, 'media')];
  for (const folder of vscode.workspace.workspaceFolders ?? []) roots.push(folder.uri);
  if (document.uri.scheme === 'file') roots.push(vscode.Uri.joinPath(document.uri, '..'));
  return roots;
}
