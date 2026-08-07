import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskNonProse } from '../src/spell/mask.ts';
import { extractWords, normalizeWord } from '../src/spell/words.ts';

const OPTIONS = { minLength: 3, ignoreAllCaps: true, languages: ['ru', 'en'] as const };

const words = (text: string, overrides: Partial<typeof OPTIONS> = {}) =>
  extractWords(maskNonProse(text), { ...OPTIONS, ...overrides } as never).map((w) => w.word);

test('маскирование сохраняет длину и переводы строк', () => {
  const source = 'обычный текст\n{code:java}\nint x = 1;\n{code}\nещё текст';
  const masked = maskNonProse(source);
  assert.equal(masked.length, source.length);
  assert.equal(masked.split('\n').length, source.split('\n').length);
});

test('код и noformat не проверяются', () => {
  assert.deepEqual(words('{code:java}\nпривед медвед\n{code}'), []);
  assert.deepEqual(words('{noformat}\nпривед медвед\n{noformat}'), []);
  assert.deepEqual(words('Это {{моношырина}} тут'), ['Это', 'тут']);
});

test('текст вокруг блока кода проверяется', () => {
  assert.deepEqual(words('было\n{code}\nвнутри\n{code}\nстало'), ['было', 'стало']);
});

test('ссылки: подпись проверяем, адрес нет', () => {
  assert.deepEqual(words('смотри [документацию|https://exampledocs.com/page]'), [
    'смотри',
    'документацию',
  ]);
  assert.deepEqual(words('голый https://example.com/verylongpath адрес'), ['голый', 'адрес']);
  assert.deepEqual(words('пинг [~ivanov] сюда'), ['пинг', 'сюда']);
  assert.deepEqual(words('файл [^report.pdf] тут'), ['файл', 'тут']);
});

test('имена макросов и ключи задач не проверяются', () => {
  assert.deepEqual(words('{panel:borderStyle=dashed}\nтекст\n{panel}'), ['текст']);
  assert.deepEqual(words('связано с ABC-123 задачей'), ['связано', 'задачей']);
});

test('заголовок макроса — это проза, его проверяем', () => {
  assert.deepEqual(words('{panel:title=Итоговое решение}'), ['Итоговое', 'решение']);
});

test('картинки не проверяются', () => {
  assert.deepEqual(words('вот !скриншотик.png|thumbnail! смотри'), ['вот', 'смотри']);
});

test('смещения слов указывают на исходный текст', () => {
  const source = 'привет {{код}} мир';
  const found = extractWords(maskNonProse(source), OPTIONS as never);
  assert.deepEqual(
    found.map((w) => source.slice(w.offset, w.offset + w.word.length)),
    found.map((w) => w.word),
  );
  assert.deepEqual(
    found.map((w) => w.word),
    ['привет', 'мир'],
  );
});

test('язык слова определяется по алфавиту', () => {
  const found = extractWords(maskNonProse('деплой release'), OPTIONS as never);
  assert.deepEqual(
    found.map((w) => [w.word, w.language]),
    [
      ['деплой', 'ru'],
      ['release', 'en'],
    ],
  );
});

test('смесь алфавитов пропускается', () => {
  assert.deepEqual(words('слово kоманда обычное'), ['слово', 'обычное']);
});

test('капс и короткие слова пропускаются', () => {
  assert.deepEqual(words('ТЗ на API готово'), ['готово']);
  // Без фильтра капса возвращается API, но ТЗ всё равно короче minLength.
  assert.deepEqual(words('ТЗ на API готово', { ignoreAllCaps: false }), ['API', 'готово']);
  assert.deepEqual(words('ТЗ на API готово', { ignoreAllCaps: false, minLength: 2 }), [
    'ТЗ',
    'на',
    'API',
    'готово',
  ]);
  assert.deepEqual(words('он не был тут', { minLength: 2 }), ['он', 'не', 'был', 'тут']);
});

test('слова с дефисом остаются целыми', () => {
  assert.deepEqual(words('веб-интерфейс готов'), ['веб-интерфейс', 'готов']);
  assert.deepEqual(words('неразрывный‑дефис тоже'), ['неразрывный‑дефис', 'тоже']);
});

test('тире не склеивает слова', () => {
  assert.deepEqual(words('текст — тире'), ['текст', 'тире']);
  assert.deepEqual(words('текст—тире без пробелов'), ['текст', 'тире', 'без', 'пробелов']);
  assert.deepEqual(words('что–то короткое тире'), ['что', 'короткое', 'тире']);
});

test('normalizeWord приводит регистр и ё к сравнимому виду', () => {
  assert.equal(normalizeWord('Ёлка'), 'елка');
  assert.equal(normalizeWord('ДЕПЛОЙ'), normalizeWord('деплой'));
});

test('фильтр языков', () => {
  assert.deepEqual(words('деплой release', { languages: ['ru'] as never }), ['деплой']);
  assert.deepEqual(words('деплой release', { languages: ['en'] as never }), ['release']);
});
