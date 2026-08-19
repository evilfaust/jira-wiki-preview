# Changelog

All notable changes to this extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.5.1] — 2026-08-19

### Fixed

- The preview went stale and only recovered when it was closed and opened again.
  It held on to the `TextDocument` object it was created with, and VS Code creates a
  new one whenever a file is closed and opened — the old object keeps the text it had
  at closing time forever. Updates were firing all along; they were re-rendering a dead
  document. The preview now resolves the live document by URI on every render. The
  `Jira: Open Preview` command made this easy to hit: the panel takes over the editor's
  tab, so the editor closes and reopening the file left the preview stuck.
- The preview now follows the active editor, the way the built-in Markdown preview does.
  It used to be bound to one file for good, so editing a second Jira file changed
  nothing on screen. There is now one preview panel instead of one per file.
- The first render could be lost. `postMessage` is dropped when the webview has not
  finished loading, and the extension posted the initial content immediately after
  assigning the HTML instead of waiting for the `ready` message the webview already
  sent. The same race blanked the preview after any `jira.*` setting changed. The
  preview also refreshes when its panel becomes visible again.
- Restoring the scroll position after a re-render was reported back to the editor as if
  the reader had scrolled, so the editor jumped around while typing.

## [0.5.0] — 2026-08-19

Jira and Confluence share a markup family, but Jira knows far fewer macros. The preview
rendered both, so it drew a tidy coloured panel where the issue itself will show the bare
text `{info}`. This release lines the preview up with Jira's own notation help, and spends
the room freed up by dropping the spell checker on things that help more.

### Removed

- **Spell checking is gone**, along with the bundled dictionaries, the helper process and
  the five `jira.spell.*` settings. It accounted for 4 MB of the 4.45 MB unpacked package
  and up to 250 MB of memory for the Russian dictionary, while dedicated extensions such
  as Code Spell Checker do the same job for every language at once. The package went from
  913 KB to 108 KB.
- Snippets `info`, `note`, `tip`, `warning` and `status`, which offered markup Jira does
  not have. Those macros now come from completion instead, and only in the Confluence
  dialect.

### Added

- Setting `jira.markup.dialect`. In `jira` mode — the default — the Confluence macros
  `{toc}`, `{info}`, `{note}`, `{tip}`, `{warning}`, `{status}`, `{section}`, `{column}`
  and `{excerpt}` stay plain text, exactly as the issue will show them. `confluence` mode
  keeps the previous behaviour.
- Markup diagnostics: unclosed `{code}`, `{panel}`, `{color}` and `{{`, a table row with
  the wrong number of cells, a language in `{code:lang}` that Jira does not know, and a
  Confluence macro in a file meant for Jira. Quick fixes replace `{info}` with `{panel}`
  or switch the dialect. Turn them off with `jira.lint.enabled`.
- Markdown conversion in both directions: commands *Convert from Markdown*, *Convert to
  Markdown*, *Copy as Markdown* and *Paste as Jira Markup* (`Ctrl+Alt+V` / `Cmd+Alt+V`).
- Paste with conversion: a URL on the clipboard with text selected offers a ready
  `[text|url]`, and a clipboard that looks like Markdown offers the converted markup.
  The ordinary paste stays the default (`jira.paste.smart`).
- Headings in the Outline view and the breadcrumbs (`Ctrl+Shift+O`); folding for heading
  sections and for the bodies of block macros.
- Completion for macro names, code languages, colors and emoticons, aware of the dialect.
- Command *Align Table Columns*.

### Fixed

- `{code}` and `{noformat}` ignored the `{panel}` parameters — `title`, `bgColor`,
  `borderStyle`, `borderColor`, `borderWidth`, `titleBGColor` — although Jira's own help
  states they are valid for both.
- Embedded media (`!clip.mp4!`, `!song.mp3!`) silently disappeared: attachment parsing
  accepted nothing but images. Video and audio now render as a player, and the formats a
  browser no longer plays — Flash, Real and Windows Media — render as a placeholder.

### Changed

- Minimum VS Code version is now 1.97, where the paste API behind `jira.paste.smart`
  became stable.

## [0.4.3] — 2026-08-07

### Changed

- The README now opens with a screenshot of the editor and the live preview side
  by side, taken from the `samples/demo.jira` file that ships with the repository.

No functional changes to the extension. The packaged `.vsix` is also slightly
smaller: the README screenshot and the icon source are no longer shipped inside it,
since the Marketplace pulls the screenshot from GitHub anyway.

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
