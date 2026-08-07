export type WordLanguage = 'ru' | 'en';

export interface FoundWord {
  word: string;
  offset: number;
  language: WordLanguage;
}

export interface WordOptions {
  /** Слова короче этого не проверяем — там в основном сокращения. */
  minLength: number;
  /** Пропускать СЛОВА КАПСОМ: обычно это аббревиатуры вроде ТЗ или API. */
  ignoreAllCaps: boolean;
  /** Какие языки проверяем. */
  languages: WordLanguage[];
}

/**
 * Буква, за ней буквы, диакритика, апострофы и дефисы.
 *
 * Соединяют слово только настоящие дефисы: обычный, типографский (U+2010)
 * и неразрывный (U+2011). Тире — короткое (U+2013) и длинное (U+2014) — это
 * знаки препинания: «текст—тире» без пробелов должно давать два слова, иначе
 * получаем гарантированную ложную опечатку.
 */
const WORD_RE = /\p{L}[\p{L}\p{M}'’‐‑-]*/gu;
const TRAILING_JOINERS_RE = /['’‐‑-]+$/u;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

/** Находит слова, пригодные для проверки орфографии, в замаскированном тексте. */
export function extractWords(text: string, options: WordOptions): FoundWord[] {
  const result: FoundWord[] = [];

  for (const match of text.matchAll(WORD_RE)) {
    // Хвостовые дефисы и апострофы к слову не относятся.
    const raw = match[0].replace(TRAILING_JOINERS_RE, '');
    if (!raw) continue;

    const offset = match.index;
    const cyrillic = CYRILLIC_RE.test(raw);
    const latin = LATIN_RE.test(raw);

    // Смесь кириллицы и латиницы — почти всегда идентификатор или опечатка
    // раскладки; подсказки для такого бессмысленны.
    if (cyrillic && latin) continue;

    const language: WordLanguage = cyrillic ? 'ru' : 'en';
    if (!cyrillic && !latin) continue;
    if (!options.languages.includes(language)) continue;
    if ([...raw].length < options.minLength) continue;
    if (options.ignoreAllCaps && raw === raw.toUpperCase() && raw !== raw.toLowerCase()) continue;

    result.push({ word: raw, offset, language });
  }

  return result;
}

/** Приводит слово к виду для сравнения со словарём пользователя. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/ё/g, 'е');
}
