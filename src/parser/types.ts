import type { Dialect } from './dialect.ts';

export interface RenderOptions {
  /**
   * Какой набор конструкций считать поддерживаемым. `jira` — только то, что
   * отрисовывает сама Jira; макросы Confluence остаются текстом, как в задаче.
   * `confluence` дополнительно отрисовывает {toc}, {info}, {status} и прочие.
   */
  dialect?: Dialect;
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
