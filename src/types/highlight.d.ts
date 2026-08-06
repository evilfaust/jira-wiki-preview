// В highlight.js карта exports не объявляет типы для подпутей,
// хотя сами типы в пакете есть.
declare module 'highlight.js/lib/common' {
  import type { HLJSApi } from 'highlight.js';
  const hljs: HLJSApi;
  export default hljs;
}

declare module 'highlight.js/lib/languages/*' {
  import type { LanguageFn } from 'highlight.js';
  const language: LanguageFn;
  export default language;
}
