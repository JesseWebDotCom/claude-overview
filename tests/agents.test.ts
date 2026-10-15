import { expect, test } from 'bun:test'
import { modelName, activity, expandTitle, pace, codexLimits, claudeLimits, resetsIn, typeOf, ageLabel, clean, claudeRows, subagentRows, lastLine, overlayHealth, paneState, parsePanes, sortRows, summary, tmuxRow } from '../hooks/agents'

test('a pane with an approval prompt needs you; esc to interrupt is working; an empty prompt is idle', () => {
  expect(paneState('Allow command? (y/n)')).toBe('needs')
  expect(paneState('• Working (12s • esc to interrupt)')).toBe('working')
  expect(paneState('done\n› ')).toBe('idle')
})

test('lastLine skips rules and empty prompts', () => {
  expect(lastLine('Fixed the test\n──────\n› \n')).toBe('Fixed the test')
})

test('parsePanes keeps one row per session and tmuxRow carries age', () => {
  const out = 'codex-w1|||%1|||node|||990|||0\ncodex-w1|||%2|||zsh|||1|||0\nbuild|||%3|||node|||0|||1'
  const panes = parsePanes(out)
  expect(panes.map(p => p.session)).toEqual(['codex-w1', 'build'])
  const r = tmuxRow(panes[0], 'Working (3s • esc to interrupt)', 1000)
  expect(r).toMatchObject({ state: 'working', ageSec: 10 })
  expect(tmuxRow(panes[1], '', 1000).state).toBe('done')
})

test('claudeRows reads stat lines and skips the own session', () => {
  const out = '990 /Users/me/.claude/projects/-Users-me-Developer-github-com-my-project/abc12345-x.jsonl|||Robot work\n100 /Users/me/.claude/projects/-Users-me-Developer-gitea-homelab/own.jsonl'
  expect(claudeRows(out, 1000, 'own')).toEqual([expect.objectContaining({ name: 'Robot work', detail: 'my-project', state: 'working', ageSec: 10 })])
})

test('stale health.json is ignored; fresh one adds detail and problems', () => {
  const rows = [tmuxRow({ session: 'codex-w1', id: '%1', command: 'node', activity: 0, dead: false }, '', 0)]
  const h = { checkedAt: '2026-10-15T00:00:00Z', items: { 'lane:codex-w1': { state: 'hung', detail: 'No output for 25 min.', owner: 'codex-w1' } } }
  const now = Date.parse('2026-10-15T00:01:00Z')
  expect(overlayHealth(rows, h, now)[0]).toMatchObject({ state: 'problem', detail: 'No output for 25 min.' })
  expect(overlayHealth(rows, h, now + 3600_000)).toEqual(rows)
})

test('clean drops spinner and icon glyphs', () => {
  expect(clean('26.10.0 ⠀⣿  6.39s')).toBe('26.10.0 6.39s')
})

test('sorting, labels and summary', () => {
  const rows = sortRows([
    { key: 'a', kind: 'tmux', name: 'a', state: 'idle', detail: '', ageSec: 5 },
    { key: 'b', kind: 'tmux', name: 'b', state: 'needs', detail: '', ageSec: 5 },
  ])
  expect(rows[0].key).toBe('b')
  expect(summary(rows)).toBe('1 waiting on you · 1 idle')
  expect(ageLabel(125)).toBe('2m 05s')
  expect(ageLabel(1500)).toBe('25m')
  expect(summary([])).toBe('Nothing running')
})

test('subagent files become rows under their session, working only while the transcript is fresh', () => {
  const out = '995 /Users/me/.claude/projects/-Users-me-p/sess1/subagents/agent-a1.jsonl|||Survey robot APIs\n100 /Users/me/.claude/projects/-Users-me-p/sess1/subagents/agent-a2.jsonl|||Old one'
  expect(subagentRows(out, 1000)).toEqual([
    expect.objectContaining({ parent: 'sess1', name: 'Survey robot APIs', state: 'working', ageSec: 5 }),
    expect.objectContaining({ name: 'Old one', state: 'done' }),
  ])
})

test('typeOf tells Claude (subagents too), Codex, local coder and other tmux apart', () => {
  const r = (kind: any, name: string, detail = '') => ({ key: name, kind, name, state: 'idle', detail, ageSec: 1 }) as any
  expect(typeOf(r('claude', 'ALPHA'))).toBe('claude')
  expect(typeOf(r('subagent', 'Survey'))).toBe('claude')
  expect(typeOf(r('tmux', 'codex-w1', 'GPT-6-Luna low'))).toBe('codex')
  expect(typeOf(r('tmux', 'reika-9b'))).toBe('local')
  expect(typeOf(r('tmux', 'WIZ-LIVE-NOW-APP'))).toBe('tmux')
})

test('parsePanes hides plain shells and keeps agent processes', () => {
  const out = 'WIZ|||%1|||zsh|||1|||0\ncodex-w1|||%2|||codex|||1|||0'
  expect(parsePanes(out).map(p => p.session)).toEqual(['codex-w1'])
})

test('codexLimits reads the last rate_limits record', () => {
  const rec = (a: number, b: number) => `{"rate_limits":{"limit_id":"codex","primary":{"used_percent":${a},"window_minutes":300,"resets_at":1000},"secondary":{"used_percent":${b},"window_minutes":10080,"resets_at":2000},"credits":{}}}`
  expect(codexLimits(rec(1, 2) + '\n' + rec(26, 68))).toEqual([
    { name: '5-hour', pct: 26, resetsAtSec: 1000 },
    { name: 'Weekly', pct: 68, resetsAtSec: 2000 },
  ])
  expect(codexLimits('nothing')).toEqual([])
})

test('claudeLimits and resetsIn label windows and countdowns', () => {
  expect(claudeLimits([{ kind: 'five_hour', percentUsed: 2, resetsAt: '1970-01-01T00:16:40Z' }])).toEqual([{ name: '5-hour', pct: 2, resetsAtSec: 1000 }])
  expect(resetsIn(1000 + 4 * 3600 + 12 * 60, 1000)).toBe('4h 12m')
  expect(resetsIn(1000 + 2 * 86400 + 3 * 3600, 1000)).toBe('2d 3h')
})

test('tmuxRow shows the Codex footer model, effort and session title', () => {
  const pane = { session: 'codex-w1', id: '%1', command: 'codex', activity: 0, dead: false }
  const r = tmuxRow(pane, '  GPT-6-Luna low · ~/Developer/project · Execute ALPHA-01 brief\n  ← for agents', 1000)
  expect(r.detail).toBe('GPT-6-Luna low · Execute ALPHA-01 brief')
})

test('pace judges the burn rate against the window', () => {
  const now = 1_000_000
  expect(pace([{ name: 'Weekly', pct: 20, resetsAtSec: now + 302400 }], now)).toBe("On track to use about 40% of this week's limit")
  expect(pace([{ name: 'Weekly', pct: 80, resetsAtSec: now + 302400 }], now)).toStartWith("Slow down: this week's limit runs out in about ")
  expect(pace([{ name: '5-hour', pct: 100, resetsAtSec: now + 600 }], now)).toBe('Limit reached. It resets in 10m')
})

test('expandTitle completes a Codex footer cut to the pane width', () => {
  const rows = [{ key: 'tmux:a', kind: 'tmux' as const, name: 'a', state: 'working' as const, detail: 'GPT-6-Luna low · Execute ALPHA-03 brie…', ageSec: 0 }]
  const out = expandTitle(rows, '{"thread_name":"Execute ALPHA-03 brief"}\n')
  expect(out[0].detail).toBe('GPT-6-Luna low · Execute ALPHA-03 brief')
})

test('claudeRows links a session to the session that started it', () => {
  const line = (id: string) => `1000 /h/.claude/projects/-Users-x-home/${id}.jsonl|||T|||`
  const rows = claudeRows(line('cli-child') + '\n' + line('cli-parent'), 1005, '', 'cli-child|||local_c|||local_p\ncli-parent|||local_p|||')
  expect(rows.find(r => r.parent === 'cli-child')?.spawnParent).toBe('cli-parent')
  expect(rows.find(r => r.parent === 'cli-parent')?.spawnParent).toBeUndefined()
})

test('claudeRows goes idle at once when the last message ended the turn', () => {
  const l = (e: string) => `1000 /h/.claude/projects/-Users-x-home/a.jsonl|||T|||Bash x|||${e}`
  expect(claudeRows(l('1'), 1002)[0].state).toBe('idle')
  expect(claudeRows(l('0'), 1002)[0].state).toBe('working')
  expect(claudeRows(l('0'), 1100)[0].state).toBe('idle')
})

test('activity names what the last message is doing', () => {
  expect(activity('think')).toBe('Thinking')
  expect(activity('write')).toBe('Writing a reply')
  expect(activity('tool mcp__x__wrap_up /a/b/c.md')).toBe('Tool call: wrap_up · c.md')
  expect(activity('tool Bash ')).toBe('Tool call: Bash')
})

test('modelName shortens Claude model ids', () => {
  expect(modelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('')).toBe('')
})
