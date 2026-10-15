# Overview mod

A Claude Code mod (live side pane). Code is in `hooks/`, tests in `tests/` (`bun test`).

## Shipping a change

The installed plugin is a snapshot in `~/.claude/plugins/cache/claude-overview/overview/<version>/`,
not a live link to this folder. An edit here does nothing in a session until the snapshot is refreshed,
and a snapshot is only refreshed when the version changes.

1. `bun test` passes.
2. Bump `version` in `.claude-plugin/plugin.json` (patch for a fix).
3. Commit. The install reads committed content, so uncommitted edits are not shipped.
4. Run, one per line:
   - `~/.local/bin/claude plugin marketplace update claude-overview`
   - `~/.local/bin/claude plugin update overview@claude-overview`
5. Start a new session. An open session keeps the code it loaded at start.

Use `~/.local/bin/claude`, not `claude`: the zsh `claude` function is broken (`_mr_themed`).
