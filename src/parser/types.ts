export interface RenderOptions {
  /**
   * Преобразует путь картинки из разметки в URL, доступный из webview.
   * Возвращает пустую строку, если картинку показать нельзя.
   */
  resolveImage?: (src: string) => string;
  /** Базовый URL Jira, например https://company.atlassian.net. */
  baseUrl?: string;
  /**
   * Подсвечивает содержимое {code:lang}. Должен вернуть безопасный HTML
   * (с уже экранированным текстом) либо null — тогда код экранируется как есть.
   */
  highlightCode?: (code: string, language: string) => string | null;
}

export interface InlineMatch {
  html: string;
  /** Сколько символов исходника поглощено. */
  length: number;
}
