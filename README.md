# Overview

A live side pane for Claude Code. It shows how much of your Claude and Codex limits you have used, how full this session's context is, and every agent running right now: your Claude sessions, their subagents, and Codex or any other tmux session.

<img src="assets/overview.gif" alt="Overview pane" width="450">


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

## Context: compact in time, see what is eating it

The Context card sits under your usage. It is one bar and one line, and opens into the full picture.

<img src="assets/context-expanded.png" alt="Context card expanded" width="450">

- **Compact when you need to.** The bar shows how full the context is and the line says how much room is left before auto-compact ("65k until auto-compact", then a nudge as it gets tight). The Compact button runs it in one click, greys out while it works, and reports how far the context dropped.
- **See what is taking the space.** Every category (system prompt, tools, MCP tools, memory files, skills, messages) has its own colour in the bar and its own row with tokens and percent. Memory files list each CLAUDE.md and AGENTS.md with its size, so you know which one is heavy.
- **Get suggestions.** A category that has grown too big gets an amber or red dot and a one-line fix: turn off MCP servers you rarely use, trim a long CLAUDE.md, disable unused skills, compact a long conversation.

## Good to know

- Codex and Claude usage appear only when there is a reading. No Codex, no Codex card.
- Everything is read from your own machine (tmux, `~/.claude`, `~/.codex`). Nothing is sent anywhere.
- macOS only for now, with tmux installed to see tmux sessions.

MIT licensed.
