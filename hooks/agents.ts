// Pure rules for the Agents list: turn raw readings (tmux, transcript mtimes, $.agent.list, health.json) into rows.
// Nothing here touches the machine, so tests drive it with literal strings.

export type Kind = 'subagent' | 'claude' | 'tmux'
export type State = 'needs' | 'working' | 'idle' | 'done' | 'problem'
export type Row = { key: string; kind: Kind; name: string; state: State; detail: string; model?: string; ageSec: number | null; parent?: string; spawnParent?: string }

const BUSY = /esc to interrupt|Working \(|✻|✽|✶|Thinking|Running…/i
const NEEDS = /\(y\/n\)|\[y\/N\]|\[Y\/n\]|Do you want to (proceed|allow|run|make)|Would you like to run|Yes, proceed|Press enter to confirm|1\.\s+Yes/i
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g

// Keeps plain text only: terminal UIs draw braille spinners and icon-font glyphs the pane's font shows as boxes.
export const clean = (s: string): string => s.replace(ANSI, '').replace(/[^\n\x20-\x7e\u00a0-\u024f\u2022\u2026\u00b7\u2190-\u21ff]/g, '').replace(/ {2,}/g, ' ')

// The last line with real words in it: not a rule line, not an empty prompt.
export function lastLine(text: string): string {
  const lines = clean(text).split('\n').map(l => l.trim()).filter(l => l.length > 0 && !/^[─━═│╭╰╮╯\-_=|\s>›]+$/.test(l) && !/for shortcuts|context left|esc to interrupt$/.test(l))
  return (lines[lines.length - 1] ?? '').slice(0, 160)
}

export function paneState(text: string): State {
  const t = clean(text)
  if (NEEDS.test(t)) return 'needs'
  if (BUSY.test(t.split('\n').slice(-12).join('\n'))) return 'working'
  return 'idle'
}

export type Pane = { session: string; id: string; command: string; activity: number; dead: boolean }

export function parsePanes(out: string): Pane[] {
  const seen = new Set<string>()
  const panes: Pane[] = []
  for (const line of out.split('\n')) {
    const [session, id, command, activity, dead] = line.split('|||')
    if (!session || !id || seen.has(session) || /^-?(zsh|bash|sh|fish|dash)$/.test(command ?? '')) continue
    seen.add(session)
    panes.push({ session, id, command: command ?? '', activity: Number(activity) || 0, dead: dead === '1' })
  }
  return panes
}

export function tmuxRow(p: Pane, captured: string, nowSec: number): Row {
  const state = p.dead ? 'done' : paneState(captured)
  const last = lastLine(captured)
  // Codex's footer reads `GPT-6-Luna low · ~/path · session title`: the model, effort and what the session was started on.
  const foot = /([A-Za-z][\w.-]*(?: (?:low|medium|high|xhigh|max))?) · (?:~|\/)\S* · (.+)$/m.exec(captured)
  const ids = captured.match(/\b[A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]+)*-\d+[a-z]?\b/g)
  return { key: 'tmux:' + p.session, kind: 'tmux', name: p.session, state, model: foot ? foot[1] : undefined, detail: foot ? foot[1] + ' · ' + clean(foot[2]).trim() : ids ? ids[ids.length - 1] : last || p.command, ageSec: p.activity > 0 ? Math.max(0, nowSec - p.activity) : null }
}

// `claude-sonnet-5-5` or `claude-haiku-4-5-20251001` becomes `Sonnet 5.5` or `Haiku 4.5`; anything else is left out.
export function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id.trim())
  return m ? m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[2] + '.' + m[3] : ''
}

// The scan reports `think`, `write` or `tool <name> <arg>` for the last message; a file path keeps only its last part and MCP prefixes are dropped.
export function activity(raw: string): string {
  const t = clean(raw).trim()
  if (t === 'think') return 'Thinking'
  if (t === 'write') return 'Writing a reply'
  const m = /^tool\s+(\S+)\s*(.*)$/.exec(t)
  if (!m) return ''
  const tool = m[1].replace(/^mcp__.*__/, '')
  const arg = m[2].startsWith('/') ? m[2].split('/').pop() ?? '' : m[2]
  return ('Tool call: ' + (arg ? tool + ' · ' + arg : tool)).slice(0, 110)
}

// What an agent last did is only worth showing while it is doing it: a quiet row hides it.
export function staleActivity(text: string, state: State): string {
  return (state === 'idle' || state === 'done') && /^(Thinking|Writing a reply|Tool call: )/.test(text) ? '' : text
}

// Animated ellipsis after the subtitle of a working row, replacing any trailing dots or ellipsis.
export function dotted(text: string, working: boolean, step: number): string {
  if (!working || text === '') return text
  return text.replace(/\s*(\.+|\u2026)$/, '') + '.'.repeat(((step % 4) + 4) % 4)
}

// Lines of `<mtime> <path>|||<custom title>` for ~/.claude/projects/<dir>/<id>.jsonl
export function claudeRows(out: string, nowSec: number, skipId = '', links = ''): Row[] {
  const rows: Row[] = []
  const links3 = links.split('\n').map(l => l.split('|||'))
  const cliOfLocal = new Map(links3.filter(l => l[0] && l[1]).map(l => [l[1], l[0]]))
  const parentOf = new Map(links3.filter(l => l[0] && l[2]).map(l => [l[0], cliOfLocal.get(l[2])]))
  for (const line of out.split('\n')) {
    const [head, title = '', act = '', ended = '', model = ''] = line.trim().split('|||')
    const m = /^(\d+) (.+\/projects\/([^/]+)\/([^/]+)\.jsonl)$/.exec(head)
    if (!m) continue
    const age = Math.max(0, nowSec - Number(m[1]))
    if (m[4] === skipId) continue
    // A finished turn (last message ended with end_turn) is idle at once; otherwise it is working while the transcript keeps moving.
    const state: State = ended.trim() !== '1' && age < 45 ? 'working' : age < 6 * 3600 ? 'idle' : 'done'
    const where = m[3].replace(/^-Users-[^-]+-/, '').replace(/^Developer-(github-com-|gitea-)?/, '') || 'home'
    rows.push({ key: 'claude:' + m[4], kind: 'claude', parent: m[4], name: clean(title).trim() || where, state, model: modelName(model) || undefined, detail: activity(act) || where, ageSec: age, spawnParent: parentOf.get(m[4]) })
  }
  return rows
}

// Lines of `<mtime> <path>|||<description>` for ~/.claude/projects/<dir>/<session>/subagents/<agent>.jsonl
export function subagentRows(out: string, nowSec: number): Row[] {
  const rows: Row[] = []
  for (const line of out.split('\n')) {
    const [head, desc = '', model = '', act = '', ended = ''] = line.trim().split('|||')
    const m = /^(\d+) (.+\/projects\/([^/]+)\/([^/]+)\/subagents\/(agent-[^/]+)\.jsonl)$/.exec(head)
    if (!m) continue
    const age = Math.max(0, nowSec - Number(m[1]))
    rows.push({ key: 'sub:' + m[5], kind: 'subagent', parent: m[4], name: clean(desc).trim() || m[5], state: ended !== '1' && age < 30 ? 'working' : 'done', detail: activity(act), model: modelName(model) || undefined, ageSec: age })
  }
  return rows
}

// health.json from the lane-health script: used only while fresh, and only to say more about a tmux row.
export function overlayHealth(rows: Row[], health: unknown, nowMs: number, maxAgeMs = 5 * 60_000): Row[] {
  const h = health as { checkedAt?: string; items?: Record<string, { state?: string; detail?: string; owner?: string }> } | null
  const at = h?.checkedAt ? Date.parse(h.checkedAt) : NaN
  if (!h?.items || !Number.isFinite(at) || nowMs - at > maxAgeMs) return rows
  const by = new Map<string, { state?: string; detail?: string }>()
  for (const [k, v] of Object.entries(h.items)) by.set(v.owner ?? k.replace(/^lane:/, ''), v)
  return rows.map(r => {
    const it = r.kind === 'tmux' ? by.get(r.name) : undefined
    if (!it) return r
    const state: State = it.state === 'hung' || it.state === 'credits' ? 'problem' : it.state === 'needs-you' || it.state === 'waiting' ? 'needs' : r.state
    return { ...r, state, detail: it.detail ? clean(it.detail).slice(0, 160) : r.detail }
  })
}

const ORDER: Record<State, number> = { needs: 0, problem: 1, working: 2, idle: 3, done: 4 }
export const sortRows = (rows: Row[]): Row[] => [...rows].sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.ageSec ?? 1e9) - (b.ageSec ?? 1e9) || a.name.localeCompare(b.name))

export function ageLabel(sec: number | null): string {
  if (sec === null) return ''
  sec = Math.floor(sec)
  if (sec < 60) return sec + 's'
  if (sec < 600) return Math.floor(sec / 60) + 'm ' + String(sec % 60).padStart(2, '0') + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h'
  return Math.floor(sec / 86400) + 'd'
}

export function summary(rows: Row[]): string {
  const n = (s: State) => rows.filter(r => r.state === s).length
  const parts = [[n('needs'), 'waiting on you'], [n('problem'), 'stuck'], [n('working'), 'working'], [n('idle'), 'idle']] as const
  const text = parts.filter(([c]) => c > 0).map(([c, l]) => c + ' ' + l).join(' · ')
  return text || 'Nothing running'
}

// A row is only worth redrawing for when something visible changed; ages tick on their own coarser label.
export const signature = (rows: Row[]): string => rows.map(r => [r.key, r.state, r.detail, ageLabel(r.ageSec)].join('|')).join('\n')

export type Type = 'claude' | 'codex' | 'local' | 'tmux'

export function typeOf(r: Row): Type {
  if (r.kind === 'subagent') return 'claude'
  if (r.kind === 'claude') return 'claude'
  const t = r.name + ' ' + r.detail
  if (/codex|gpt/i.test(t)) return 'codex'
  if (/reika|local|qwen|llama|ollama|lm.?studio/i.test(t)) return 'local'
  return 'tmux'
}

export type Limit = { name: string; pct: number; resetsAtSec: number | null }

const windowName = (min: number): string => (min <= 300 ? '5-hour' : min >= 10000 ? 'Weekly' : Math.round(min / 60) + '-hour')

// Last `"rate_limits":{...}` record in a Codex rollout file.
export function codexLimits(text: string): Limit[] {
  const all = [...text.matchAll(/"rate_limits":\{.*?"primary":\{"used_percent":([\d.]+),"window_minutes":(\d+),"resets_at":(\d+)\},"secondary":\{"used_percent":([\d.]+),"window_minutes":(\d+),"resets_at":(\d+)\}/g)]
  const m = all[all.length - 1]
  if (!m) return []
  return [
    { name: windowName(Number(m[2])), pct: Number(m[1]), resetsAtSec: Number(m[3]) },
    { name: windowName(Number(m[5])), pct: Number(m[4]), resetsAtSec: Number(m[6]) },
  ]
}

export function claudeLimits(list: { kind: string; percentUsed: number; resetsAt?: string }[]): Limit[] {
  const name = (k: string) => (k === 'five_hour' ? '5-hour' : k === 'seven_day' ? 'Weekly' : k.replace(/_/g, ' '))
  return list.map(l => ({ name: name(l.kind), pct: l.percentUsed, resetsAtSec: l.resetsAt ? Math.floor(Date.parse(l.resetsAt) / 1000) : null }))
}

export function resetsIn(atSec: number | null, nowSec: number): string {
  if (atSec === null) return ''
  const s = Math.max(0, atSec - nowSec)
  if (s >= 86400) return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h'
  if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'
  return Math.floor(s / 60) + 'm'
}

const WINDOW_SEC: Record<string, number> = { '5-hour': 18000, Weekly: 604800 }
const SHORT: Record<string, string> = { '5-hour': '5h', Weekly: 'Wk' }
const span = (s: number): string => (s >= 86400 ? Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h' : s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm' : Math.max(1, Math.floor(s / 60)) + 'm')

// One line on whether the burn rate fits each window, judged on the window that is furthest ahead of pace.
export function pace(list: Limit[], nowSec: number, compact = false): string {
  let worst: { text: string; score: number } | null = null
  for (const l of list) {
    const win = WINDOW_SEC[l.name]
    if (!win || l.resetsAtSec === null) continue
    const left = Math.max(0, l.resetsAtSec - nowSec)
    const elapsed = win - left
    if (l.pct >= 100) { const r = { text: (compact ? 'Limit reached, resets in ' : 'Limit reached. It resets in ') + span(left), score: 1e9 }; if (!worst || r.score > worst.score) worst = r; continue }
    if (elapsed < win * 0.1) continue
    const projected = (l.pct * win) / elapsed
    const when = compact ? (l.name === 'Weekly' ? 'the week' : 'the 5 hours') : l.name === 'Weekly' ? "this week's limit" : 'this 5-hour limit'
    const text = projected > 100
      ? (compact ? 'Slow down: out in ~' : 'Slow down: ' + when + ' runs out in about ') + span(((100 - l.pct) / l.pct) * elapsed)
      : (compact ? 'On track: ~' : 'On track to use about ') + Math.round(projected) + '% of ' + when
    if (!worst || projected > worst.score) worst = { text, score: projected }
  }
  return worst?.text ?? ''
}

// Codex cuts its footer to the pane width ("Execute ALPHA-03 brie…"); the full title is in ~/.codex/session_index.jsonl.
export function expandTitle(rows: Row[], indexText: string): Row[] {
  const names = [...indexText.matchAll(/"thread_name":"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).reverse()
  return rows.map(r => {
    if (r.kind !== 'tmux' || !r.detail.endsWith('…')) return r
    const cut = r.detail.indexOf(' · ')
    if (cut < 0) return r
    const prefix = r.detail.slice(cut + 3, -1)
    const full = prefix ? names.find(n => n.startsWith(prefix) && n.length > prefix.length) : undefined
    return full ? { ...r, detail: r.detail.slice(0, cut + 3) + clean(full).trim() } : r
  })
}

export type CtxCat = { name: string; tokens: number; pct: number; dim: boolean; free: boolean; color: string; tip: Advice | null }
export type Advice = { level: 'warn' | 'high'; tip: string }
export type CtxFile = { name: string; type: string; tokens: number; tip: Advice | null }
export type CtxView = { percent: number; used: number; max: number; cats: CtxCat[]; files: CtxFile[] }

export function kTokens(n: number): string {
  return n >= 1000 ? (n >= 100000 ? Math.round(n / 1000) : Math.round(n / 100) / 10) + 'k' : String(n)
}

// Shapes the session's context breakdown for display; null when there is nothing to show.
const CTX_PALETTE = ['#4a86e8', '#d97757', '#2fa36b', '#d9a21b', '#9b6bd6', '#2fb5c4', '#d9608a', '#8fb339', '#c9742f']

// A quiet nudge per category: nothing while it is a sensible size, an amber or red tip with the fix when it is not.
export function contextAdvice(name: string, tokens: number, max: number): Advice | null {
  const rule = (warn: number, high: number, tip: string): Advice | null => tokens >= high ? { level: 'high', tip } : tokens >= warn ? { level: 'warn', tip } : null
  if (/^memory files/i.test(name)) return rule(8000, 16000, 'Heavy. Trim CLAUDE.md and AGENTS.md; move detail into docs read on demand.')
  if (/^mcp tools/i.test(name)) return rule(8000, 15000, 'Many tool definitions. Turn off MCP servers you rarely use.')
  if (/^skills/i.test(name)) return rule(5000, 10000, 'Disable skills you do not use.')
  if (/^custom agents/i.test(name)) return rule(3000, 6000, 'Remove agent definitions you do not use.')
  if (/^messages/i.test(name) && max > 0) return rule(max * 0.5, max * 0.7, 'Long conversation. Compact to free room.')
  return null
}

export function fileAdvice(tokens: number): Advice | null {
  return tokens >= 8000 ? { level: 'high', tip: 'Very long. Keep it short and link to docs.' } : tokens >= 4000 ? { level: 'warn', tip: 'Long. Move detail into docs read on demand.' } : null
}

export function contextView(usage: any): CtxView | null {
  const b = usage?.context?.breakdown
  const percent = usage?.context?.percent ?? b?.percentage
  if (typeof percent !== 'number') return null
  const max = b?.maxTokens ?? usage?.context?.window ?? 0
  const cats: CtxCat[] = (b?.categories ?? []).filter((c: any) => c.tokens > 0).map((c: any) => ({
    name: String(c.name), tokens: c.tokens, pct: max > 0 ? (c.tokens / max) * 100 : 0, dim: c.isDeferred === true || c.kind === 'deferred', free: c.kind === 'free', color: '', tip: null,
  }))
  // Every counted category gets its own colour so the bar and the rows match; the reserve and unused space stay quiet.
  let n = 0
  for (const c of cats) {
    c.color = c.dim || c.free ? '#8a8a8555' : /autocompact/i.test(c.name) ? '#6b728099' : CTX_PALETTE[n++ % CTX_PALETTE.length]
    c.tip = c.dim || c.free ? null : contextAdvice(c.name, c.tokens, max)
  }
  const used = b?.totalTokens ?? usage?.context?.tokens ?? 0
  const files: CtxFile[] = (b?.memoryFiles ?? []).filter((f: any) => f?.tokens > 0).map((f: any) => ({ name: String(f.path ?? '').split('/').slice(-2).join('/'), type: String(f.type ?? ''), tokens: f.tokens, tip: fileAdvice(f.tokens) })).sort((x: CtxFile, y: CtxFile) => y.tokens - x.tokens)
  return { files, percent: Math.round(max > 0 && used > 0 ? (used / max) * 100 : percent), used, max, cats }
}

// The line under the context bar, worded like Claude's own: how much room is left before auto-compact, and a nudge to compact when it is close.
export function contextNote(c: CtxView): string {
  const buffer = c.cats.find(x => /autocompact/i.test(x.name))?.tokens ?? 0
  const left = Math.max(0, c.max - c.used - buffer)
  if (c.max <= 0) return ''
  if (left <= c.max * 0.05) return 'Auto-compact is about to run'
  if (left <= c.max * 0.15) return 'Auto-compact soon · ' + kTokens(left) + ' left. Compact now to choose what to keep'
  return kTokens(left) + ' until auto-compact'
}

// Desktop sessions (one json per session): what is asking you, what is running, what ran lately.
export type SessKind = 'blocked' | 'active' | 'idle'
export type SessRow = { id: string; title: string; kind: SessKind; detail: string; needs: string; model: string; ageSec: number; spawn: string; depth: number; cli: string; current: boolean }

const unesc = (s: string): string => s.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\./g, '').trim()
const ACTIVE_SEC = 300
const RECENT_SEC = 86400
const ASKING_SEC = 3 * 86400

export function sessionRows(out: string, nowMs: number, currentCli = ''): SessRow[] {
  const rows: SessRow[] = []
  for (const line of out.split('\n')) {
    const [at, archived, title, cat, detail, needs, model, id, spawn, cli] = line.split('|||')
    const ms = Number(at)
    if (!id || !Number.isFinite(ms) || archived === 'true') continue
    const ageSec = Math.max(0, (nowMs - ms) / 1000)
    const asking = cat === 'blocked'
    if (ageSec > (asking ? ASKING_SEC : RECENT_SEC)) continue
    rows.push({ id, title: unesc(title) || 'Untitled', kind: asking ? 'blocked' : ageSec < ACTIVE_SEC ? 'active' : 'idle', detail: unesc(detail), needs: unesc(needs), model: modelName(model ?? ''), ageSec, spawn: (spawn ?? '').trim(), depth: 0, cli: (cli ?? '').trim(), current: !!currentCli && (cli ?? '').trim() === currentCli })
  }
  const rank: Record<SessKind, number> = { blocked: 0, active: 1, idle: 2 }
  const byId = new Map(rows.map(r => [r.id, r]))
  const rootOf = (r: SessRow): SessRow => { let cur = r; for (let n = 0; n < 8; n++) { const p = byId.get(cur.spawn); if (!p || p === cur) break; cur = p } return cur }
  // A session that started others stays with them: a tree ranks by its most urgent member, children follow their parent.
  const trees = new Map<string, SessRow[]>()
  for (const r of rows) { const k = rootOf(r).id; trees.set(k, [...(trees.get(k) ?? []), r]) }
  const best = (m: SessRow[]) => Math.min(...m.map(r => rank[r.kind]))
  const recency = (m: SessRow[]) => Math.min(...m.map(r => r.ageSec))
  const res: SessRow[] = []
  const put = (r: SessRow, depth: number, members: SessRow[]) => {
    res.push({ ...r, depth })
    for (const c of members.filter(m => m.spawn === r.id && m !== r).sort((p, q) => rank[p.kind] - rank[q.kind] || p.ageSec - q.ageSec)) put(c, depth + 1, members)
  }
  for (const [k, members] of [...trees.entries()].sort((p, q) => best(p[1]) - best(q[1]) || recency(p[1]) - recency(q[1]))) put(byId.get(k)!, 0, members)
  return res
}

export function sessionSummary(rows: SessRow[]): string {
  const n = (k: SessKind) => rows.filter(r => r.kind === k).length
  const parts = [[n('blocked'), 'blocked'], [n('active'), 'active'], [n('idle'), 'idle']].filter(([c]) => (c as number) > 0).map(([c, w]) => c + ' ' + w)
  return parts.join(' · ') || 'none'
}
