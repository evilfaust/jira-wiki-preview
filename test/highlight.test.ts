import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightCode } from '../src/highlight.ts';

test('подсвечивает известные языки', () => {
  const html = highlightCode('int x = 1;', 'java');
  assert.ok(html);
  assert.match(html, /<span class="hljs-type">int<\/span>/);
});

test('понимает алиасы', () => {
  for (const language of ['js', 'ts', 'py', 'sh', 'c#', 'yml', 'html', 'jsx', 'gradle', 'zsh']) {
    assert.ok(highlightCode('x', language) !== null, `алиас ${language} не распознан`);
  }
});

test('дополнительные языки поверх common-набора', () => {
  for (const language of ['groovy', 'scala', 'dart', 'dockerfile', 'powershell', 'http']) {
    assert.ok(highlightCode('x', language) !== null, `язык ${language} не зарегистрирован`);
  }
});

test('для plaintext и неизвестных языков возвращает null', () => {
  for (const language of ['', 'none', 'text', 'plain', 'log', 'какой-то-язык']) {
    assert.equal(highlightCode('x', language), null);
  }
});

test('экранирует HTML в исходнике', () => {
  const html = highlightCode('const a = "<script>alert(1)</script>";', 'javascript');
  assert.ok(html);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('не падает на синтаксически неверном коде', () => {
  assert.doesNotThrow(() => highlightCode('public class { ) ] "незакрытая строка', 'java'));
});
