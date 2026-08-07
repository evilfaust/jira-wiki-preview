import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// Тест читает файлы проекта целиком, поэтому запускается из корня репозитория
// (так его и вызывает `npm test`).
const root = process.cwd();

function readJson(file: string): Record<string, string> {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return entry.name.endsWith('.ts') ? [relative] : [];
  });
}

/** Строки, переданные в vscode.l10n.t() по всему коду расширения. */
function runtimeStrings(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles('src')) {
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/vscode\.l10n\.t\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

/** Ключи вида %key%, на которые ссылается package.json. */
function manifestKeys(): Set<string> {
  const manifest = readFileSync(path.join(root, 'package.json'), 'utf8');
  return new Set([...manifest.matchAll(/"%([^%"]+)%"/g)].map((m) => m[1]));
}

test('запуск из корня репозитория', () => {
  assert.ok(
    existsSync(path.join(root, 'package.json')),
    'тесты локализации нужно запускать из корня проекта',
  );
});

test('каждая строка из l10n.t переведена на русский', () => {
  const bundle = readJson('l10n/bundle.l10n.ru.json');
  for (const value of runtimeStrings()) {
    assert.ok(bundle[value], `нет перевода для «${value}»`);
  }
});

test('в русском бандле нет ключей, которых больше нет в коде', () => {
  const bundle = readJson('l10n/bundle.l10n.ru.json');
  const used = runtimeStrings();
  for (const key of Object.keys(bundle)) {
    assert.ok(used.has(key), `перевод «${key}» больше не используется`);
  }
});

test('все %ключи% из package.json есть в обоих package.nls', () => {
  const keys = manifestKeys();
  const en = readJson('package.nls.json');
  const ru = readJson('package.nls.ru.json');
  assert.ok(keys.size > 0);
  for (const key of keys) {
    assert.ok(en[key], `нет английской строки для %${key}%`);
    assert.ok(ru[key], `нет русской строки для %${key}%`);
  }
});

test('в package.nls нет лишних ключей', () => {
  const keys = manifestKeys();
  for (const file of ['package.nls.json', 'package.nls.ru.json']) {
    for (const key of Object.keys(readJson(file))) {
      assert.ok(keys.has(key), `${file}: ключ ${key} нигде не используется`);
    }
  }
});

test('плейсхолдеры {0} совпадают в оригинале и переводе', () => {
  const bundle = readJson('l10n/bundle.l10n.ru.json');
  const placeholders = (text: string) => [...text.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
  for (const [original, translated] of Object.entries(bundle)) {
    assert.deepEqual(
      placeholders(translated),
      placeholders(original),
      `разные плейсхолдеры в «${original}»`,
    );
  }
});
