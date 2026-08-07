/**
 * Публикует релиз на GitHub: собирает .vsix, ставит тег vX.Y.Z и прикладывает пакет.
 *
 * Описание релиза берётся из раздела CHANGELOG.md для текущей версии, поэтому
 * версия и changelog не могут разъехаться незаметно.
 *
 * Запуск:
 *   npm run release:github            — собрать и опубликовать
 *   npm run release:github -- --dry-run — показать, что будет сделано
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function fail(message, hint) {
  console.error(`\n✘ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options }).trim();
}

function tryRun(command, args) {
  try {
    return run(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = manifest.version;
const tag = `v${version}`;
const vsix = `${manifest.name}-${version}.vsix`;

// --- Проверки до сборки -------------------------------------------------
if (tryRun('gh', ['auth', 'status']) === null) {
  fail('gh CLI недоступен или не авторизован.', 'Выполните: gh auth login');
}

if (run('git', ['status', '--porcelain'])) {
  fail(
    'В рабочем дереве есть незакоммиченные изменения.',
    'Релиз должен точно соответствовать коммиту: закоммитьте или спрячьте их.',
  );
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  fail(`Текущая ветка — ${branch}, а не main.`, 'Релизы делаются из main.');
}

const unpushed = tryRun('git', ['rev-list', '--count', '@{u}..HEAD']);
if (unpushed === null) {
  fail('У ветки нет upstream.', 'Выполните: git push -u origin main');
}
if (unpushed !== '0') {
  fail(`${unpushed} коммит(ов) не отправлено на GitHub.`, 'Выполните: git push');
}

if (tryRun('git', ['rev-parse', '--verify', `refs/tags/${tag}`])) {
  fail(`Тег ${tag} уже существует.`, 'Поднимите версию в package.json и допишите CHANGELOG.md.');
}
if (tryRun('gh', ['release', 'view', tag])) {
  fail(`Релиз ${tag} на GitHub уже опубликован.`, 'Поднимите версию в package.json.');
}

// --- Описание релиза из CHANGELOG ---------------------------------------
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const section = new RegExp(
  `^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|\\z)`,
  'm',
).exec(changelog);

if (!section || !section[1].trim()) {
  fail(
    `В CHANGELOG.md нет раздела для версии ${version}.`,
    `Добавьте заголовок вида: ## [${version}] — ГГГГ-ММ-ДД`,
  );
}

const notes = `${section[1].trim()}

## Install

Download \`${vsix}\` below, then either use the Extensions view
(\`…\` menu → **Install from VSIX…**) or run:

\`\`\`
code --install-extension ${vsix}
\`\`\`

Reload the window afterwards.

Full history in [CHANGELOG.md](https://github.com/evilfaust/jira-wiki-preview/blob/main/CHANGELOG.md).
`;

// --- Сборка и публикация ------------------------------------------------
console.log(`Версия ${version}, тег ${tag}, ветка ${branch} — проверки пройдены.`);

if (dryRun) {
  console.log(`\n--- описание релиза ---\n${notes}`);
  console.log(`Пробный запуск: сборка и публикация пропущены. Был бы приложен ${vsix}.`);
  process.exit(0);
}

console.log('Собираю пакет…');
run('npm', ['run', 'vsix'], { stdio: ['ignore', 'inherit', 'inherit'] });

if (!fs.existsSync(path.join(root, vsix))) {
  fail(`Сборка не создала ${vsix}.`);
}

const notesFile = path.join(root, `.release-notes-${version}.md`);
fs.writeFileSync(notesFile, notes);
try {
  run(
    'gh',
    [
      'release',
      'create',
      tag,
      vsix,
      '--title',
      `${tag} — ${manifest.displayName}`,
      '--notes-file',
      notesFile,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
} finally {
  fs.rmSync(notesFile, { force: true });
}

console.log(`\nГотово: https://github.com/evilfaust/jira-wiki-preview/releases/tag/${tag}`);
