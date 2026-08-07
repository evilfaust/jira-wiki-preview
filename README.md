# Jira Wiki Markup — Editor & Preview

Write Jira descriptions and comments in VS Code instead of a cramped browser textarea.
Syntax highlighting for Jira Wiki Markup plus a live side-by-side preview — the same
workflow you already have for Markdown.

[Русская версия README](README.ru.md)

## Why

Jira's comment and description fields are small, and the wiki markup they accept is
easy to get wrong without seeing the result. This extension gives you a real editor
for that markup: highlighting while you type, and a preview pane that shows what Jira
will render. Write the text, then paste it into Jira.

## Features

- **Live preview** (`Ctrl+Shift+V` / `Cmd+Shift+V`) styled after the Jira UI, with light
  and dark palettes — or your current VS Code theme colors.
- **Two-way scroll sync** between editor and preview, and double-click in the preview to
  jump to the corresponding source line.
- **Syntax highlighting** in the editor *and* in the preview, including code inside
  `{code:java}`, `{code:sql}`, `{code:json}` and ~45 other languages.
- **Formatting shortcuts**: `Ctrl+B` bold, `Ctrl+I` italic, `Ctrl+Shift+M` monospace,
  `Ctrl+K` link. Pressing again removes the formatting.
- **Snippets** for the constructs you actually type: `h1`, `code`, `table`, `panel`,
  `info`, `note`, `tip`, `warning`, `link`, `status`, and more.
- **Scratch document**: the `Jira: New Jira document` command opens an empty file with
  the preview already open — write, then copy into Jira.
- **Issue links**: set `jira.baseUrl` and `ABC-123` / `[~user]` become clickable.
- **Spell checking** for Russian and English that understands the markup: code blocks,
  monospace, URLs, link targets, macro names and issue keys are skipped, so only prose
  is checked. Quick fixes offer replacements and *add to dictionary*.

> The command titles and settings descriptions are currently in Russian; the extension
> itself works the same in any locale. Translations are welcome — see
> [Contributing](#contributing).

## Supported syntax

| Category | Markup |
| --- | --- |
| Headings | `h1.` … `h6.` |
| Text effects | `*bold*`, `_italic_`, `-strikethrough-`, `+underline+`, `^sup^`, `~sub~`, `??citation??`, `{{monospace}}` |
| Color and status | `{color:red}…{color}`, `{status:colour=Green\|title=Done}` |
| Lists | `*`, `#`, `-` with arbitrary nesting and mixing (`*#`) |
| Tables | `\|\|header\|\|` and `\|cell\|` |
| Blocks | `{code:lang\|title=…}`, `{noformat}`, `{quote}`, `bq.`, `{panel:title=…}` |
| Message macros | `{info}`, `{note}`, `{tip}`, `{warning}` |
| Links | `[url]`, `[text\|url]`, `[text\|url\|tooltip]`, `[~user]`, `[^attachment]`, `[#anchor]`, `{anchor:name}` |
| Images | `!file.png!`, `!file.png\|thumbnail!`, `!url\|width=300, align=right!` |
| Misc | `----` rule, `\\` line break, `---`/`--` dashes |
| Emoticons | `(+) (-) (!) (/) (x) (?) (i) (y) (n) (on) (off) (*) (*r) (*g) (*b) (flag) (flagoff) :) :( :D ;) :P` — drawn as the classic Atlassian icons, not system emoji |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `jira.preview.theme` | `jira` | Preview styling: `jira` colors or `editor` (current VS Code theme) |
| `jira.preview.fontSize` | `14` | Preview font size, px |
| `jira.preview.fontFamily` | system | Preview font family |
| `jira.preview.maxWidth` | `0` | Max text column width in px (`0` — unlimited) |
| `jira.preview.scrollPreviewWithEditor` | `true` | Preview follows the editor's scroll |
| `jira.preview.scrollEditorWithPreview` | `true` | Editor follows the preview's scroll |
| `jira.preview.doubleClickToSwitchToEditor` | `true` | Double-click in preview jumps to the source line |
| `jira.preview.highlightCode` | `true` | Syntax highlighting inside `{code:lang}` blocks |
| `jira.baseUrl` | `""` | Your Jira base URL, e.g. `https://company.atlassian.net` |
| `jira.spell.enabled` | `true` | Check spelling in Jira files |
| `jira.spell.languages` | `["ru","en"]` | Languages to check; the alphabet of each word decides which dictionary is used |
| `jira.spell.userWords` | `[]` | Words to always accept |
| `jira.spell.minWordLength` | `3` | Skip words shorter than this |
| `jira.spell.ignoreAllCaps` | `true` | Skip ALL-CAPS words — usually acronyms |

### About the spell checker

Dictionaries are hunspell dictionaries read through [nspell](https://github.com/wooorm/nspell).
They run in a **helper process**, not in the extension host: the Russian dictionary needs
roughly 250 MB of memory and about a second to build. The process starts on the first
check and shuts itself down after five minutes of inactivity, so the cost is only paid
while you are actually writing Jira text. Suggestions are computed lazily, when you open
the quick-fix menu.

## File types

The extension activates for `.jira`, `.jira.txt` and `.jirawiki` files. For any other
file, switch manually: `Ctrl+Shift+P` → `Change Language Mode` → `Jira Wiki Markup`.

## Installing from a `.vsix`

Grab the package from the [Releases](https://github.com/evilfaust/jira-wiki-preview/releases)
page, then either use the Extensions view (`…` menu → **Install from VSIX…**) or run:

```bash
code --install-extension jira-wiki-preview-0.1.0.vsix
```

## Development

```bash
npm install
npm run compile      # bundle into dist/
npm run watch        # rebuild on change
npm test             # parser and highlighter tests
npm run typecheck    # type checking
npm run grammar      # regenerate the TextMate grammar
npm run icon         # regenerate the extension icon
npm run vsix         # build the .vsix package
```

Press `F5` in VS Code to launch an Extension Development Host with `samples/demo.jira`
open — that file exercises every supported construct.

The markup parser in `src/parser/` depends on neither the VS Code API nor highlight.js
(highlighting is injected through the `highlightCode` option), so it is covered by plain
unit tests in `test/`. The TextMate grammar is generated by `scripts/gen-grammar.js`,
and the icon by `scripts/gen-icon.js`.

## Contributing

Issues and pull requests are welcome — in particular, translating the command titles
and setting descriptions to English via VS Code's `package.nls.json` localization.

## License

[MIT](LICENSE).

Bundled dictionaries keep their own licenses, shipped alongside them in
`dictionaries/<lang>/license`: Russian — BSD-3-Clause, English — MIT and BSD.

Jira is a trademark of Atlassian. This extension is an independent project and is not
affiliated with, endorsed by, or sponsored by Atlassian.
