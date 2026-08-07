/**
 * Публикует релиз на GitHub: собирает .vsix, ставит тег vX.Y.Z и прикладывает пакет.
 *
 * Описание релиза берётся из раздела CHANGELOG.md для текущей версии, поэтому
 * версия и changelog не могут разъехаться незаметно.
 *
 * Запуск:
 *   npm run release:github                  — собрать и опубликовать
 *   npm run release:github -- --dry-run     — пройти весь путь, кроме публикации:
 *                                             проверки, сборка, проверка пакета,
 *                                             запись описания. Останов перед
 *                                             необратимым gh release create.
 *   npm run release:github -- --checks-only — только проверки и текст описания,
 *                                             без сборки (быстро)
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const checksOnly = process.argv.includes('--checks-only');

function fail(message, hint) {
  console.error(`\n✘ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  // При stdio: inherit вывод уходит в терминал, а execFileSync возвращает null.
  const output = execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  return typeof output === 'string' ? output.trim() : '';
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
// Разбором по заголовкам, а не одной регуляркой: у последнего раздела нет
// следующего `## [`, и якорь конца текста тут легко поставить неверно.
const sections = changelog.split(/^## \[/m).slice(1);
const section = sections.find((part) => part.startsWith(`${version}]`));
const body = section ? section.slice(section.indexOf('\n') + 1).trim() : '';

if (!body) {
  fail(
    `В CHANGELOG.md нет раздела для версии ${version}.`,
    `Добавьте заголовок вида: ## [${version}] — ГГГГ-ММ-ДД`,
  );
}

const notes = `${body}

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

if (checksOnly) {
  console.log(`\n--- описание релиза ---\n${notes}`);
  console.log(`Только проверки: сборка и публикация пропущены. Был бы приложен ${vsix}.`);
  process.exit(0);
}

console.log('Собираю пакет…');
const startedAt = Date.now();
run('npm', ['run', 'vsix'], { stdio: ['ignore', 'inherit', 'inherit'] });

const vsixPath = path.join(root, vsix);
if (!fs.existsSync(vsixPath)) fail(`Сборка не создала ${vsix}.`);

/** Пакет должен быть свежим zip-архивом, а не остатком прошлой сборки. */
const stat = fs.statSync(vsixPath);
if (stat.size < 1024) fail(`${vsix} подозрительно мал: ${stat.size} байт.`);
if (stat.mtimeMs < startedAt) {
  fail(
    `${vsix} не перезаписан текущей сборкой.`,
    'Похоже, это файл от прошлого запуска — удалите его и попробуйте снова.',
  );
}
const header = Buffer.alloc(2);
const handle = fs.openSync(vsixPath, 'r');
fs.readSync(handle, header, 0, 2, 0);
fs.closeSync(handle);
if (header.toString('latin1') !== 'PK') fail(`${vsix} не похож на zip-архив.`);
console.log(`Пакет собран: ${vsix}, ${(stat.size / 1024).toFixed(0)} КБ.`);

const notesFile = path.join(root, `.release-notes-${version}.md`);
const ghArgs = [
  'release',
  'create',
  tag,
  vsix,
  '--title',
  `${tag} — ${manifest.displayName}`,
  '--notes-file',
  notesFile,
];

fs.writeFileSync(notesFile, notes);

if (dryRun) {
  console.log(`Описание записано во временный файл: ${path.basename(notesFile)}.`);
  fs.rmSync(notesFile, { force: true });
  console.log(`\n--- описание релиза ---\n${notes}`);
  console.log(`Пробный запуск. Осталась одна команда, она не выполнялась:\n  gh ${ghArgs.join(' ')}`);
  process.exit(0);
}

try {
  run('gh', ghArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
} finally {
  fs.rmSync(notesFile, { force: true });
}

console.log(`\nГотово: https://github.com/evilfaust/jira-wiki-preview/releases/tag/${tag}`);
