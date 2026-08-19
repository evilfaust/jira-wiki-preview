import * as vscode from 'vscode';
import { dialectFor } from '../config.ts';
import { type HeadingInfo, scanDocument } from '../parser/scan.ts';

/** Заголовки h1–h6 в панели структуры, хлебных крошках и Ctrl+Shift+O. */
export class JiraSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const { headings, lineCount } = scanDocument(document.getText(), dialectFor(document.uri));
    return buildTree(document, headings, lineCount);
  }
}

/** Сворачивание секций по заголовкам и тел блочных макросов. */
export class JiraFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const { headings, regions, lineCount } = scanDocument(
      document.getText(),
      dialectFor(document.uri),
    );
    const ranges: vscode.FoldingRange[] = [];

    for (const [index, heading] of headings.entries()) {
      const end = sectionEnd(headings, index, lineCount);
      if (end > heading.line) ranges.push(new vscode.FoldingRange(heading.line, end));
    }

    for (const region of regions) {
      // Незакрытый блок тянется до конца документа — свернуть его всё равно можно.
      const end = region.end < 0 ? lineCount - 1 : region.end;
      if (end > region.start) ranges.push(new vscode.FoldingRange(region.start, end));
    }

    return ranges;
  }
}

/** Последняя строка секции: до заголовка того же или более высокого уровня. */
function sectionEnd(headings: HeadingInfo[], index: number, lineCount: number): number {
  const level = headings[index].level;
  for (let next = index + 1; next < headings.length; next++) {
    if (headings[next].level <= level) return headings[next].line - 1;
  }
  return lineCount - 1;
}

function buildTree(
  document: vscode.TextDocument,
  headings: HeadingInfo[],
  lineCount: number,
): vscode.DocumentSymbol[] {
  const roots: vscode.DocumentSymbol[] = [];
  /** Открытые заголовки от h1 к текущему: последний — потенциальный родитель. */
  const stack: { level: number; symbol: vscode.DocumentSymbol }[] = [];

  for (const [index, heading] of headings.entries()) {
    const end = Math.max(heading.line, sectionEnd(headings, index, lineCount));
    const selection = new vscode.Range(
      heading.line,
      0,
      heading.line,
      document.lineAt(heading.line).text.length,
    );
    const symbol = new vscode.DocumentSymbol(
      heading.text || `h${heading.level}`,
      '',
      vscode.SymbolKind.String,
      new vscode.Range(heading.line, 0, end, document.lineAt(end).text.length),
      selection,
    );

    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
    if (stack.length) stack[stack.length - 1].symbol.children.push(symbol);
    else roots.push(symbol);
    stack.push({ level: heading.level, symbol });
  }

  return roots;
}
