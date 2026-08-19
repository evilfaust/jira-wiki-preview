/**
 * Общий механизм защиты фрагментов при конвертации.
 *
 * Код нельзя переписывать вместе с остальным текстом, поэтому его сначала
 * заменяют меткой, а после всех преобразований возвращают на место. Метка
 * строится на NUL: в осмысленном тексте он не встречается.
 */

export const PLACEHOLDER = '\u0000';

const RESTORE_RE = new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g');

export function restore(text: string, spans: string[]): string {
  if (!spans.length) return text;
  return text.replace(RESTORE_RE, (_all, index: string) => spans[Number(index)]);
}
