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

## README screenshots and GIF

Never capture the real pane or the user's screen (`screencapture`, clicking in the app): it shows personal session names and data.
Do not click into the app either; synthetic clicks are blocked and unwanted.
Screenshots are hand-built HTML mockups with invented data, rendered by headless Chrome, so collapsed or expanded states are just HTML:

1. Work in `/private/tmp/claude-501/ov-demo/` (`pane2.html` is the animated pane, `sessions-expanded.html`, `expanded.html`, `unc.html`, `status.html`, `changes.html` are the card shots; recreate from `register.tsx` styles if the folder is gone).
2. Render each at 2x: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=420,H --screenshot=out.png file://$PWD/x.html`.
3. For `assets/overview.gif`, render `pane2.html#0..11` and join with `ffmpeg` (palettegen, 2 fps, scale 600).
4. Open every image and check it before committing. Use persona-style names only (billing-service, docs-site), never real session or folder names.
