# Changelog

All notable changes to this extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
