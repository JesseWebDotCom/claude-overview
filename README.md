# Overview

A live side pane for Claude Code. It shows how much of your Claude and Codex limits you have used, and every agent running right now: your Claude sessions, their subagents, and Codex or any other tmux session.

![Overview pane](assets/overview.gif)

*Preview with made-up sessions.*

It updates by itself every couple of seconds. No model is asked to write anything, so it costs nothing to leave open.

## Install

Type this at the prompt of a Claude Code session:

```
/plugin install overview --marketplace JesseWebDotCom/claude-overview
```

Answer `y` to add the marketplace, then pick a scope.

## Use

```
/overview
```

The pane opens beside the chat. Green-to-red bars are your usage, with a line saying whether you are on track. Each agent shows what it is doing and which model it runs on. Idle agents tuck under Inactive.

## Good to know

- Codex and Claude usage appear only when there is a reading. No Codex, no Codex card.
- Everything is read from your own machine (tmux, `~/.claude`, `~/.codex`). Nothing is sent anywhere.
- macOS and Linux with tmux installed.

MIT licensed.
