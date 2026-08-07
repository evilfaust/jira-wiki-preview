# Changelog

All notable changes to this extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.4.2] — 2026-08-07

### Fixed

- Nesting of list items no longer depends on where a list block starts. When a table
  or a paragraph interrupted a list, the following `**` items ended up on different
  levels: the first became a top-level bullet and the second its child. The level now
  follows the markers alone, so identical markers are always siblings.
- Skipping a level (`*` straight to `***`) split the deeper items into separate
  lists instead of keeping them together.

### Changed

- The README now documents every construct the extension converts, including the full
  emoticon set.

## [0.4.1] — 2026-08-07

### Fixed

- `{code}` and `{noformat}` written inside a line — most often in a table cell,
  as in `| {code:java}$code = "sbp";{code} |` — were rendered as literal text.
  They are now rendered as inline code, with highlighting, and remain valid HTML
  inside a paragraph or a table cell. A `{code}` block on its own lines is
  unchanged.

## [0.4.0] — 2026-08-07

### Fixed

- Spell checking no longer joins words across an em or en dash: `текст—тире`
  written without spaces used to become a single token and was always reported as
  a misspelling. Only real hyphens join words now.
- `Ctrl+K` / `Cmd+K` no longer shadows VS Code's chord prefix inside Jira files —
  inserting a link moved to `Ctrl+Alt+K` / `Cmd+Alt+K`. Chords such as
  `Ctrl+K Ctrl+S` work again.

### Added

- `{toc}` renders a table of contents, with `minLevel`, `maxLevel` and `type=flat`.
- Heading anchors are now unique: repeated headings get `-2`, `-3` suffixes instead
  of silently pointing at the first one.
- Command `Jira: Turn Spell Checking On or Off` for a quick toggle.
- Localization: English by default, Russian for a Russian VS Code interface. Covers
  command titles, setting descriptions and runtime messages.

## [0.3.0] — 2026-08-07

### Added

- Spell checking for Russian and English, aware of the markup: code blocks,
  `{{monospace}}`, URLs, link targets, macro names, image names, issue keys and
  `[~user]` mentions are skipped, so only prose is checked. Misspellings appear as
  hints with quick fixes offering replacements and *add to dictionary*.
- Settings `jira.spell.enabled`, `jira.spell.languages`, `jira.spell.userWords`,
  `jira.spell.minWordLength`, `jira.spell.ignoreAllCaps`.

### Notes

- Dictionaries (hunspell, via `nspell`) run in a helper process, not in the extension
  host: the Russian dictionary needs about 250 MB and a second to build. The process
  starts on the first check and shuts down after five minutes of inactivity.
- The extension now activates when a Jira file is opened, not only on a command.

## [0.2.0] — 2026-08-07

### Changed

- Emoticons are now drawn as inline SVG copies of the classic Atlassian icon set,
  so the preview matches what Jira actually renders. Previously they were substituted
  with system emoji, which look different on every platform. Icons scale with
  `jira.preview.fontSize`.
- The publisher id changed from `local` to `evilfaust` in preparation for the
  Marketplace. **This changes the extension id**, so an older build installed from a
  `.vsix` must be uninstalled manually — it will not be replaced automatically.

### Added

- Alternative emoticon spellings that Jira also accepts: `:-)`, `:-(`, `;-)`,
  `(Y)`, `(N)`, `(I)`, `(X)`.
- Extension icon and Marketplace metadata; English README for the storefront.

## [0.1.0] — 2026-08-06

First release.

### Added

- A `jira` language for `.jira`, `.jira.txt` and `.jirawiki` files, with a TextMate
  grammar that also highlights embedded languages inside `{code:…}` blocks.
- A live preview pane (`Ctrl+Shift+V` / `Cmd+Shift+V`) with debounced updates,
  two-way scroll sync, and double-click to jump to the source line.
- Preview styling that follows the Jira UI in light and dark palettes, or the current
  VS Code theme colors (`jira.preview.theme`).
- Syntax highlighting inside `{code:lang}` blocks in the preview via highlight.js
  (~45 languages), switchable with `jira.preview.highlightCode`.
- Formatting commands with keyboard shortcuts: bold, italic, monospace, strikethrough,
  insert link, insert code block, insert table.
- A `Jira: New Jira document` command that opens a scratch file with the preview
  already open, plus `Jira: Copy source to clipboard`.
- 22 snippets for common markup constructs.
- A `jira.baseUrl` setting that turns `ABC-123` issue keys and `[~user]` mentions
  into working links.
