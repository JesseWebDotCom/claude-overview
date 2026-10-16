# Overview

One live pane beside Claude Code that shows everything about your coding setup at a glance: how healthy your machine is (CPU, memory, disk, GPU), what has changed in your repos, how much of your Claude and Codex limits you have used, what is filling this session's context, which sessions are waiting on you, and every agent running right now (subagents, spawned sessions, Codex and other tmux runs).

<img src="assets/overview.gif" alt="Overview pane: System, Changes, Subscriptions, Context, Sessions, Agents" width="450">

It refreshes by itself every few seconds. No model writes anything, so it costs nothing to leave open. Everything is read from your own machine (tmux, git, `~/.claude`, `~/.codex`); nothing is sent anywhere.

## Install and use

In a Claude Code session:

```
/plugin install overview --marketplace JesseWebDotCom/claude-overview
```

Answer `y` to add the marketplace, pick a scope, then open the pane:

```
/overview
```

Choose which cards show and in what order. The choice is kept in `~/.claude/overview.json`.

| Command | Does |
|---|---|
| `/overview hide agents` | Hide a card (`system`, `changes`, `subscriptions`, `context`, `sessions`, `agents`, or `all`) |
| `/overview show agents` | Show it again |
| `/overview agents context` | Put these cards on top, in order; the rest follow in the default order |
| `/overview first agents` / `last agents` | Move one card to the top or bottom |
| `/overview reset` | Show every card, default order |

Default order: System, Changes, Subscriptions, Context, Sessions, Agents.

## The cards

- **System.** One line of CPU, memory, disk and GPU percents (green, amber from 80%, red from 92%). Open it for bars, numbers and the top five processes for CPU and memory. Reads `ps`, `vm_stat`, `df` and `ioreg` (Mac) or `/proc` and `nvidia-smi` (Linux).
- **Changes.** Appears when a folder you work in has changes: files, lines added and removed against `origin/main`, an **Open** button, and per-folder **Create PR** when expanded. Also pinned in the status line.
- **Subscriptions.** Claude and Codex usage bars with a line saying whether you are on track. A provider with no reading is left out.
- **Context.** How full the context is and how much room is left before auto-compact, with a one-click **Compact**. Expanded, every category (system prompt, tools, MCP, memory files, skills, messages) gets its own row, and an oversized one gets a one-line fix.

  <img src="assets/context-expanded.png" alt="Context card expanded" width="450">

- **Sessions.** Your sessions from the last day: blocked, active or idle. A blocked session shows its question in amber, and the card pulses amber while anything waits on you. If the session's `YOU:` line asks for one step, its row gets a **▶** that does it: `Run /cmd` runs the command in the current session, `Reply "text"` sends that reply to another session. A question with several options gets no ▶.
- **Agents.** Every running agent with what it is doing and its model, parents followed by children, alphabetical so rows never jump. Codex runs and other tmux sessions show too.

## Good to know

- Buttons in the pane (Compact, Open, Create PR, ▶) may need a second click. This is a quirk of Claude mods, not of Overview.
- macOS only for now, with tmux installed to see tmux sessions.

MIT licensed.
