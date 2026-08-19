import * as vscode from 'vscode';
import { markdownToJira } from './convert/index.ts';

const TEXT_MIME = 'text/plain';
const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Text.append('jira');

const URL_RE = /^(?:https?|ftp|ftps|mailto|tel|file):\S+$/i;

/** Признаки, по которым текст в буфере опознаётся как Markdown. */
const MARKDOWN_RE = /(^|\n)\s*(#{1,6}\s|```|\d+[.)]\s|[-*+]\s|>\s|\|.*\|)|\*\*\S|~~\S|\]\(\S/;

/**
 * Вставка с преобразованием.
 *
 * Провайдер не перехватывает обычный Ctrl+V молча: он добавляет вариант в
 * список «Вставить как», а когда в буфере ссылка и есть выделение — предлагает
 * готовую ссылку Jira, как это делает встроенная поддержка Markdown.
 */
export class JiraPasteProvider implements vscode.DocumentPasteEditProvider {
  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    if (!vscode.workspace.getConfiguration('jira', document.uri).get<boolean>('paste.smart', true)) {
      return undefined;
    }

    const text = await dataTransfer.get(TEXT_MIME)?.asString();
    if (!text || token.isCancellationRequested) return undefined;

    const range = ranges[0];
    const selected = range ? document.getText(range) : '';
    const converted = convert(text, selected);
    if (converted === null) return undefined;

    const edit = new vscode.DocumentPasteEdit(converted, describe(text, selected), PASTE_KIND);
    // Обычная вставка остаётся вариантом по умолчанию — наш идёт следом.
    edit.yieldTo = [vscode.DocumentDropOrPasteEditKind.Text];
    return [edit];
  }
}

/** Что вставить вместо буфера обмена, либо null, если преобразовывать нечего. */
function convert(text: string, selected: string): string | null {
  const trimmed = text.trim();
  if (URL_RE.test(trimmed) && selected.trim()) return `[${selected}|${trimmed}]`;
  if (!MARKDOWN_RE.test(text)) return null;

  const converted = markdownToJira(text);
  return converted === text ? null : converted;
}

function describe(text: string, selected: string): string {
  return URL_RE.test(text.trim()) && selected.trim()
    ? vscode.l10n.t('Insert as a Jira link')
    : vscode.l10n.t('Insert as Jira markup');
}

/** Команда «Вставить как разметку Jira»: то же самое, но без выбора варианта. */
export async function pasteAsJira(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const clipboard = await vscode.env.clipboard.readText();
  if (!clipboard) return;

  await editor.edit((builder) => {
    for (const selection of editor.selections) {
      const selected = editor.document.getText(selection);
      builder.replace(selection, convert(clipboard, selected) ?? markdownToJira(clipboard));
    }
  });
}
