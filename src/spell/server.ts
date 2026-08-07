/**
 * Отдельный процесс со словарями hunspell.
 *
 * Русский словарь занимает около 250 МБ и собирается примерно секунду,
 * поэтому он живёт здесь, а не в процессе расширения: так extension host
 * не раздувается и не подвисает, а процесс можно просто убить.
 *
 * Общение — обычные сообщения child_process: {id, type, …} → {id, …}.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import nspell from 'nspell';

type Language = 'ru' | 'en';

interface CheckRequest {
  id: number;
  type: 'check';
  language: Language;
  words: string[];
}

interface SuggestRequest {
  id: number;
  type: 'suggest';
  language: Language;
  word: string;
}

type Request = CheckRequest | SuggestRequest;

/** Каталог с распакованными словарями передаётся аргументом при запуске. */
const dictionaryRoot = process.argv[2];
const loaded = new Map<Language, ReturnType<typeof nspell>>();

function dictionary(language: Language): ReturnType<typeof nspell> {
  const existing = loaded.get(language);
  if (existing) return existing;

  const base = path.join(dictionaryRoot, language);
  const spell = nspell(
    readFileSync(path.join(base, 'index.aff')),
    readFileSync(path.join(base, 'index.dic')),
  );
  loaded.set(language, spell);
  return spell;
}

/**
 * Слово известно, если его знает словарь напрямую либо если это составное
 * слово через дефис и известны все части («веб-интерфейс», «из-за»).
 */
function isKnown(spell: ReturnType<typeof nspell>, word: string): boolean {
  if (spell.correct(word)) return true;
  if (spell.correct(word.toLowerCase())) return true;
  if (!word.includes('-')) return false;

  const parts = word.split('-').filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => spell.correct(part) || spell.correct(part.toLowerCase()));
}

process.on('message', (message: Request) => {
  try {
    if (message.type === 'check') {
      const spell = dictionary(message.language);
      const unknown = message.words.filter((word) => !isKnown(spell, word));
      process.send?.({ id: message.id, unknown });
      return;
    }

    if (message.type === 'suggest') {
      const spell = dictionary(message.language);
      process.send?.({ id: message.id, suggestions: spell.suggest(message.word).slice(0, 8) });
      return;
    }
  } catch (error) {
    process.send?.({
      id: message.id,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
});

// Если родитель исчез, помощник не нужен.
process.on('disconnect', () => process.exit(0));
