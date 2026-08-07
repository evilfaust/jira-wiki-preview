const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Словари не бандлятся: это большие текстовые файлы, которые процесс проверки
 * читает с диска. Копируем их в dictionaries/, откуда они попадают в .vsix.
 */
const DICTIONARIES = [
  ['ru', 'dictionary-ru'],
  ['en', 'dictionary-en'],
];

function copyDictionaries() {
  for (const [language, packageName] of DICTIONARIES) {
    const from = path.join(__dirname, 'node_modules', packageName);
    const to = path.join(__dirname, 'dictionaries', language);
    fs.mkdirSync(to, { recursive: true });
    // Лицензию словаря обязаны сохранять: dictionary-ru под BSD-3-Clause.
    for (const file of ['index.aff', 'index.dic', 'license']) {
      fs.copyFileSync(path.join(from, file), path.join(to, file));
    }
  }
}

/** Печатает ошибки сборки в формате, который понимает problem matcher VS Code. */
const problemMatcherPlugin = {
  name: 'problem-matcher',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  copyDictionaries();

  const ctx = await esbuild.context({
    entryPoints: {
      extension: 'src/extension.ts',
      speller: 'src/spell/server.ts',
    },
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node18',
    outdir: 'dist',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [problemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
