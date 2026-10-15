import { expect, test } from 'bun:test'
import { codexModel, codexModels, paneSessions, procRows, etimeSec, contextView, contextNote, sessionRows, sessionSummary, liveParents, contextAdvice, fileAdvice, kTokens, modelName, activity, expandTitle, pace, codexLimits, claudeLimits, resetsIn, typeOf, ageLabel, clean, claudeRows, subagentRows, lastLine, overlayRuns, paneState, parsePanes, sortRows, summary, tmuxRow } from '../hooks/agents'

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

test('a tmux row named in a wt.sh session file gets its owner and run state', () => {
  const rows = [tmuxRow({ session: 'bot-amber-tiger-codex', id: '%1', command: 'node', activity: 0, dead: false }, '', 0), tmuxRow({ session: 'other', id: '%2', command: 'node', activity: 0, dead: false }, '', 0)]
  const out = JSON.stringify({ tmux: 'bot-amber-tiger-codex', owner: 'sess-123', runState: 'FAILED' }) + '\nnot json\n' + JSON.stringify({ tmux: null, owner: 'x' })
  const [a, b] = overlayRuns(rows, out)
  expect(a).toMatchObject({ state: 'problem', owner: 'sess-123', parent: 'sess-123' })
  expect(a.detail.startsWith('FAILED · ')).toBe(true)
  expect(b).toEqual(rows[1])
  expect(overlayRuns(rows, JSON.stringify({ tmux: 'other', owner: 'codex', runState: 'running' }))[1]).toMatchObject({ owner: undefined, state: rows[1].state })
})

test('an idle owner waits on its running Codex run, and the run names its worktree', () => {
  const owner = claudeRows('900 /h/.claude/projects/-Users-x-Developer-github-com-o-repo/sess-1.jsonl|||Voice|||write|||1|||claude-sonnet-5-5|||/r', 1000)
  const run = [tmuxRow({ session: 'bot-amber-codex', id: '%1', command: 'node', activity: 0, dead: false }, '', 0)]
  run[0].detail = 'Running'
  const out = JSON.stringify({ tmux: 'bot-amber-codex', owner: 'sess-1', runState: 'running', path: '/w/bot-amber-sc-voice' })
  const [o, r] = overlayRuns([...owner, ...run], out)
  expect(o).toMatchObject({ state: 'working', detail: 'Waiting on run: bot-amber-sc-voice' })
  expect(r.detail).toBe('Running in bot-amber-sc-voice')
  expect(overlayRuns([...owner, ...run], out.replace('running', 'DONE'))[0].state).toBe('idle')
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

test('a subagent stuck in a long tool call stays working; a stale one with no pending tool does not', () => {
  const f = (n: string) => `/Users/me/.claude/projects/-Users-me-p/sess1/subagents/agent-${n}.jsonl`
  const out = [`700 ${f('a1')}|||Runs check|||claude-sonnet-5-5|||tool Bash bash scripts/check.sh|||0`, `700 ${f('a2')}|||Stale thinker|||claude-sonnet-5-5|||think|||0`, `100 ${f('a3')}|||Long dead|||claude-sonnet-5-5|||tool Bash x|||0`, `700 ${f('a4')}|||Finished|||claude-sonnet-5-5|||tool Bash x|||1`].join('\n')
  const by = Object.fromEntries(subagentRows(out, 1000).map(r => [r.name, r.state]))
  expect(by).toEqual({ 'Runs check': 'working', 'Stale thinker': 'done', 'Long dead': 'done', Finished: 'done' })
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

import { dotted, brief } from '../hooks/agents'
test('dotted cycles none to three dots on working rows only', () => {
  expect([0, 1, 2, 3, 4].map(i => dotted('Thinking', true, i))).toEqual(['Thinking', 'Thinking.', 'Thinking..', 'Thinking...', 'Thinking'])
  expect(dotted('Thinking', false, 2)).toBe('Thinking')
  expect(dotted('Tool call: Bash', true, 2)).toBe('Tool call: Bash..')
  expect(dotted('Working…', true, 1)).toBe('Working.')
  expect(dotted('', true, 0)).toBe('')
})

import { staleActivity } from '../hooks/agents'
test('a quiet row hides what it last did', () => {
  expect(staleActivity('Writing a reply', 'idle')).toBe('Idle, waiting for a message')
  expect(staleActivity('Tool call: Bash', 'done')).toBe('Finished')
  expect(staleActivity('Writing a reply', 'working')).toBe('Writing a reply')
  expect(staleActivity('Execute API-12 brief', 'idle')).toBe('Execute API-12 brief')
})

test('contextView shapes the breakdown', () => {
  const v = contextView({ context: { percent: 82.4, breakdown: { totalTokens: 160400, maxTokens: 200000, categories: [
    { name: 'Messages', tokens: 89000, kind: 'used' }, { name: 'Empty', tokens: 0, kind: 'used' },
    { name: 'MCP tools (deferred)', tokens: 52000, isDeferred: true, kind: 'deferred' }, { name: 'Free space', tokens: 6200, kind: 'free' } ] } } })
  expect(v?.percent).toBe(45)
  expect(v?.used).toBe(89000)
  expect(v?.cats.map(c => c.name)).toEqual(['Messages', 'MCP tools (deferred)', 'Free space'])
  expect(v?.cats[0].pct).toBeCloseTo(44.5)
  expect(v?.cats[1].dim).toBe(true)
  expect(contextView({})).toBeNull()
})
test('contextView leaves the auto-compact reserve and deferred tools out of used', () => {
  const v = contextView({ context: { percent: 60, breakdown: { totalTokens: 120000, maxTokens: 200000, categories: [
    { name: 'System tools', tokens: 40000, kind: 'used' }, { name: 'Messages', tokens: 47000, kind: 'used' },
    { name: 'MCP tools (deferred)', tokens: 30000, isDeferred: true, kind: 'deferred' },
    { name: 'Autocompact buffer', tokens: 33000, kind: 'reserved' }, { name: 'Free space', tokens: 80000, kind: 'free' } ] } } })
  expect(v?.used).toBe(87000)
  expect(v?.percent).toBe(44)
  expect(contextNote(v!)).toBe('80k until auto-compact')
})
test('kTokens', () => {
  expect(kTokens(160400)).toBe('160k')
  expect(kTokens(6200)).toBe('6.2k')
  expect(kTokens(511)).toBe('511')
})
test('compact pace captions are short', () => {
  expect(pace([{ name: 'Weekly', pct: 98, resetsAt: 0 } as any], 0, true).length).toBeLessThan(30)
})

test('contextAdvice nudges only oversized categories; every counted category has its own colour', () => {
  expect(contextAdvice('Memory files', 3000, 200000)).toBeNull()
  expect(contextAdvice('Memory files', 9000, 200000)?.level).toBe('warn')
  expect(contextAdvice('MCP tools', 23600, 200000)).toBeNull()
  expect(contextAdvice('MCP tools', 36000, 200000)?.level).toBe('warn')
  expect(contextAdvice('MCP tools', 52000, 200000)?.level).toBe('high')
  expect(contextAdvice('Messages', 120000, 200000)?.level).toBe('warn')
  expect(contextAdvice('System tools', 99999, 200000)).toBeNull()
  expect(fileAdvice(9400)?.level).toBe('high')
  const v = contextView({ context: { percent: 50, breakdown: { totalTokens: 100, maxTokens: 200, categories: [{ name: 'A', tokens: 10 }, { name: 'B', tokens: 10 }, { name: 'C', tokens: 10 }, { name: 'D', tokens: 10 }, { name: 'E', tokens: 10 }] } } })
  expect(new Set(v?.cats.map(c => c.color)).size).toBe(5)
})

test('sessionRows ranks asking first, then active, then recent; drops archived and old', () => {
  const now = 1_000_000_000_000
  const line = (ageMin: number, archived: string, title: string, cat: string, detail: string, needs: string, id: string) => [now - ageMin * 60000, archived, title, cat, detail, needs, 'claude-sonnet-5-5', id].join('|||')
  const out = [line(200, 'false', 'Old chat', 'completed', 'done', '', 'l1'), line(1, 'false', 'Live', 'review_ready', 'building', '', 'l2'), line(900, 'false', 'Asks', 'blocked', 'q', 'Which database \\"main\\"?', 'l3'), line(5, 'true', 'Gone', 'completed', '', '', 'l4'), line(3000, 'false', 'Stale', 'completed', '', '', 'l5')].join('\n')
  const r = sessionRows(out, now)
  expect(r.map(x => x.id)).toEqual(['l3', 'l2', 'l1'])
  expect(r[0].needs).toBe('Which database "main"?')
  expect(r[0].model).toBe('Sonnet 5.5')
  expect(sessionSummary(r)).toBe('1 blocked · 2 idle')
})

test('sessionRows nests sub-sessions under the session that started them', () => {
  const now = 1_000_000_000_000
  const line = (ageMin: number, title: string, cat: string, id: string, spawn: string) => [now - ageMin * 60000, 'false', title, cat, '', '', 'claude-sonnet-5-5', id, spawn].join('|||')
  const out = [line(1, 'Quiet', 'completed', 'a', ''), line(30, 'Parent', 'completed', 'p', ''), line(40, 'Child', 'blocked', 'c', 'p'), line(2, 'Orphan', 'completed', 'o', 'gone')].join('\n')
  const r = sessionRows(out, now)
  expect(r.map(x => x.id + ':' + x.depth)).toEqual(['p:0', 'c:1', 'a:0', 'o:0'])
})

test('brief keeps one short sentence', () => {
  expect(brief('pick option 1 (active only when a subagent runs). Then continue with the rest')).toBe('pick option 1')
  expect(brief('x'.repeat(100)).length).toBe(70)
})

test('sessionRows treats an unanswered question in the transcript as blocked', () => {
  const now = 1_000_000_000
  const out = `${now - 60_000}|||false|||Needs answer||||||||||||||claude-sonnet-5-5|||local_a||||||cli-a|||1\n${now - 60_000}|||false|||Quiet||||||||||||||claude-sonnet-5-5|||local_b||||||cli-b|||0`
  const r = sessionRows(out, now)
  expect(r.find(x => x.id === 'local_a')?.kind).toBe('blocked')
  expect(r.find(x => x.id === 'local_b')?.kind).toBe('idle')
})

test('claudeRows and sessionRows carry the working folder', () => {
  const rows = claudeRows('100 /h/.claude/projects/-Users-x-Developer-app/abc.jsonl|||T|||write|||1|||claude-opus-5-5|||/Users/x/Developer/app', 110)
  expect(rows[0].cwd).toBe('/Users/x/Developer/app')
  const s = sessionRows(`${1_000_000_000 - 1000}|||false|||T||||||||||||claude-opus-5-5|||local_a||||||cli-a|||0|||/Users/x/app`, 1_000_000_000)
  expect(s[0].cwd).toBe('/Users/x/app')
})

test('dirtyList gives the per-folder rows, dirtiest first', async () => {
  const { dirtyList } = await import('../hooks/register')
  const m = new Map([['/a/home', { n: 8 }], ['/a/x', { n: 0 }], ['/a/bot', { n: 3 }]])
  expect(dirtyList(m)).toEqual([['home', 8], ['bot', 3]])
})

test('dirtyBrief lists the dirtiest folders, three at most', async () => {
  const { dirtyBrief } = await import('../hooks/register')
  const m = new Map([['/a/home', { n: 8 }], ['/a/wt-one', { n: 3 }], ['/a/c', { n: 2 }], ['/a/d', { n: 1 }]])
  expect(dirtyBrief(m)).toBe('± uncommitted · home 8 · wt-one 3 · c 2 · +1 more')
  expect(dirtyBrief(new Map([['/a/x', { n: 0 }]]))).toBe('')
})

test('procRows lists a headless codex exec, not its shell wrapper or an interactive codex', () => {
  const out = [
    '61037 1 05:12 codex exec --add-dir /x/y Read /x/y/BRIEF-maingate.md and do it exactly',
    '61035 1 05:12 zsh -c codex exec --add-dir /x/y Read /x/y/BRIEF-maingate.md > log',
    '70000 1 01:00 /opt/bin/codex',
    '70001 1 1-02:03:04 /opt/bin/codex exec do the thing',
    '80001 1 02:00 tmux new-session -d -s s',
    '80002 80001 02:00 zsh -c codex exec -',
    '80003 80002 02:00 codex exec -C /w -',
  ].join('\n')
  const rows = procRows(out, new Map([[80002, 'bot-x-codex']]), codexModels('/w|||gpt-6-luna|||low'))
  expect(rows).toHaveLength(3)
  expect(rows[2]).toMatchObject({ key: 'proc:80003', name: 'bot-x-codex', detail: 'Running', model: 'GPT-6 Luna low' })
  expect(rows[0].model).toBe('Codex')
  expect(codexModel('')).toBe('Codex')
  expect(rows[0]).toMatchObject({ key: 'proc:61037', name: 'codex exec BRIEF-maingate', state: 'working', ageSec: 312 })
  expect(rows[1]).toMatchObject({ name: 'codex exec', ageSec: 93784 })
  expect(typeOf(rows[0])).toBe('codex')
})

test('etimeSec parses ps elapsed time', () => {
  expect(etimeSec('00:09')).toBe(9)
  expect(etimeSec('12:34')).toBe(754)
  expect(etimeSec('3:04:05')).toBe(11045)
  expect(etimeSec('nope')).toBeNull()
})

test('a session with a working agent is active, ranked above idle and below blocked', () => {
  const now = 1_000_000_000
  const line = (title: string, id: string, cli: string, pending: string) => `${now - 60_000}|||false|||${title}||||||||||||||claude-sonnet-5-5|||${id}||||||${cli}|||${pending}`
  const out = [line('Quiet', 'l1', 'cli-1', '0'), line('Busy', 'l2', 'cli-2', '0'), line('Asks', 'l3', 'cli-3', '1')].join('\n')
  const live = liveParents([
    { key: 'sub:a', kind: 'subagent', name: 'x', state: 'working', detail: '', ageSec: 1, parent: 'cli-2' },
    { key: 'sub:b', kind: 'subagent', name: 'y', state: 'done', detail: '', ageSec: 1, parent: 'cli-1' },
  ])
  const r = sessionRows(out, now, '', live)
  expect(r.map(x => x.id + ':' + x.kind)).toEqual(['l3:blocked', 'l2:active', 'l1:idle'])
  expect(sessionSummary(r)).toBe('1 blocked · 1 active · 1 idle')
})
