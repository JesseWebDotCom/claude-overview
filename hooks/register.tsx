import type { Register } from 'claude-code'
import { claudeRows, expandTitle, pace, overlayHealth, parsePanes, sortRows, subagentRows, codexLimits, claudeLimits, resetsIn, typeOf, summary, tmuxRow, ageLabel } from './agents'
import type { Row, Limit } from './agents'

const PANE = 'overview'
const POLL_MS = 2000
const TICK_MS = 1000
const SPIN = ['●', '●', '○', '○']
const _GROUPS: { state: Row['state'][]; label: string }[] = [
  { state: ['needs'], label: 'Waiting on you' },
  { state: ['problem'], label: 'Stuck' },
  { state: ['working'], label: 'Working' },
  { state: ['idle'], label: 'Idle' },
  { state: ['done'], label: 'Finished' },
]
const MAX_PANES = 16
const HEALTH_PATH = 'data-scratch/lane-health/health.json'
const KIND: Record<Row['kind'], string> = { subagent: 'Subagent', claude: 'Claude session', tmux: 'Other' }
// Subtle tints per model family; the label stays dim so the pill reads as a tag, not a button.
const PILL: Record<string, string> = { sonnet: '#4a86e822', opus: '#d9693a22', fable: '#9a6ad922', haiku: '#3aa86a22', gpt: '#3aa86a22' }
const pillColor = (m: string): string => PILL[m.toLowerCase().split(/[ -]/)[0]] ?? '#8a8a8522'
const sub = (r: { model?: string; detail: string }): string => (r.model && r.detail.startsWith(r.model + ' · ') ? r.detail.slice(r.model.length + 3) : r.detail === r.model ? '' : r.detail)

const TYPE_COLOR: Record<string, string> = { claude: '#4a86e8', codex: '#d9693a', local: '#c98b2b', tmux: '#8a8a85' }
const TYPE_LABEL: Record<string, string> = { claude: 'Claude', codex: 'Codex', local: 'Local', tmux: 'Other' }
// Simplified marks (a starburst and a six-loop knot), not the official artwork.
const ICON: Record<string, string> = {
  Claude: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><g stroke="#d97757" stroke-width="3" stroke-linecap="round">' + [0, 45, 90, 135].map(a => `<line x1="12" y1="3" x2="12" y2="21" transform="rotate(${a} 12 12)"/>`).join('') + '</g></svg>',
  Codex: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><g fill="none" stroke="#10a37f" stroke-width="1.8">' + [0, 60, 120, 180, 240, 300].map(a => `<rect x="8" y="1.5" width="8" height="12" rx="4" transform="rotate(${a} 12 12)"/>`).join('') + '</g></svg>',
}
const DOT: Record<Row['state'], string> = { needs: 'warning', problem: 'error', working: 'success', idle: 'inactive', done: 'inactive' }
const WORD: Record<Row['state'], string> = { needs: 'waiting on you', problem: 'stuck', working: 'working', idle: 'idle', done: 'done' }

let rows: Row[] = []
let polledAt = 0
const since = new Map<string, { state: string; at: number }>()
let busy = false
let claudeLim: Limit[] = []
let codexLim: Limit[] = []
const closed = new Set<string>(['inactive'])

async function run($: any, argv: string[], timeoutMs = 3000): Promise<string> {
  try {
    const r = await $.process.run(argv, { timeoutMs })
    return r.exitCode === 0 ? String(r.stdout) : ''
  } catch {
    return ''
  }
}

export async function poll($: any): Promise<void> {
  if (busy) return
  busy = true
  try {
    const nowMs = await $.clock.now()
    const nowSec = Math.floor(nowMs / 1000)
    const panes = parsePanes(await run($, ['tmux', 'list-panes', '-a', '-F', '#{session_name}|||#{pane_id}|||#{pane_current_command}|||#{window_activity}|||#{pane_dead}'])).slice(0, MAX_PANES)
    const tmux = await Promise.all(panes.map(async p => tmuxRow(p, await run($, ['tmux', 'capture-pane', '-p', '-t', p.id, '-S', '-14']), nowSec)))
    const claudeScript = String.raw`for f in $(find "$HOME/.claude/projects" -maxdepth 2 -name "*.jsonl" -mmin -360 2>/dev/null); do
t=$(grep -o '"customTitle":"[^"]*"' "$f" | tail -1 | cut -d'"' -f4)
L=$(tail -n 40 "$f" | grep -E '"type":"(assistant|user)"' | tail -1)
if echo "$L" | grep -q '"type":"user"'; then act=think
elif echo "$L" | grep -q '"type":"tool_use"'; then
n=$(echo "$L" | grep -o '"type":"tool_use","id":"[^"]*","name":"[A-Za-z_]*"' | tail -1 | sed 's/.*"name":"//;s/"$//')
a=$(echo "$L" | grep -o '"\(description\|file_path\)":"[^"]\{1,90\}' | tail -1 | cut -d'"' -f4)
act="tool $n $a"
elif echo "$L" | grep -q '"type":"thinking"'; then act=think
else act=write; fi
e=$(tail -n 40 "$f" | grep -E '"type":"(assistant|user)"' | tail -1 | grep -c '"stop_reason":"end_turn"')
m=$(tail -n 80 "$f" | grep -o '"model":"claude[^"]*"' | tail -1 | cut -d'"' -f4)
echo "$(stat -f %m "$f") $f|||$t|||$act|||$e|||$m"
done`
    const linkScript = String.raw`find "$HOME/Library/Application Support/Claude/claude-code-sessions" -name 'local_*.json' -mmin -1500 2>/dev/null | while read -r f; do
echo "$(grep -o '"cliSessionId":"[^"]*"' "$f" | head -1 | cut -d'"' -f4)|||$(grep -o '"sessionId":"local_[^"]*"' "$f" | head -1 | cut -d'"' -f4)|||$(grep -o '"spawnedFrom":{"sessionId":"[^"]*"' "$f" | head -1 | cut -d'"' -f6)"
done`
    const claude = claudeRows(await run($, ['sh', '-c', claudeScript], 6000), nowSec, '', await run($, ['sh', '-c', linkScript], 4000))
    try { claudeLim = claudeLimits((await $.session.usage()).rateLimits ?? []) } catch { /* not on a subscription */ }
    codexLim = codexLimits(await run($, ['sh', '-c', 'for f in $(ls -t $(find "$HOME/.codex/sessions" -name "*.jsonl" -mmin -1440 2>/dev/null) 2>/dev/null | head -4); do grep -h "rate_limits" "$f" | tail -1; done | head -1'], 5000))
    const subScript = String.raw`for f in $(find "$HOME/.claude/projects" -path "*/subagents/*.jsonl" -mmin -30 2>/dev/null); do
d=$(grep -o '"description":"[^"]*"' "$(dirname "$f")/$(basename "$f" .jsonl).meta.json" 2>/dev/null | head -1 | cut -d'"' -f4)
L=$(tail -n 40 "$f" | grep -E '"type":"(assistant|user)"' | tail -1)
if echo "$L" | grep -q '"type":"user"'; then act=think
elif echo "$L" | grep -q '"type":"tool_use"'; then
n=$(echo "$L" | grep -o '"type":"tool_use","id":"[^"]*","name":"[A-Za-z_]*"' | tail -1 | sed 's/.*"name":"//;s/"$//')
a=$(echo "$L" | grep -o '"\(description\|file_path\)":"[^"]\{1,90\}' | tail -1 | cut -d'"' -f4)
act="tool $n $a"
elif echo "$L" | grep -q '"type":"thinking"'; then act=think
else act=write; fi
e=$(echo "$L" | grep -c '"stop_reason":"end_turn"')
m=$(tail -n 80 "$f" | grep -o '"model":"claude[^"]*"' | tail -1 | cut -d'"' -f4)
echo "$(stat -f %m "$f") $f|||$d|||$m|||$act|||$e"
done`
    const subs = subagentRows(await run($, ['sh', '-c', subScript], 5000), nowSec)
    let health: unknown = null
    try { health = JSON.parse((await $.fs.read(HEALTH_PATH)).text ?? '') } catch { /* optional */ }
    const index = await run($, ['sh', '-c', 'tail -n 200 "$HOME/.codex/session_index.jsonl" 2>/dev/null'], 3000)
    const all = overlayHealth([...subs, ...claude, ...expandTitle(tmux, index)], health, nowMs)
    // A busy tmux pane redraws constantly, so its last-activity age is always 0s. For working rows, show how long it has been working since this mod first saw it.
    const keep = new Set(all.map(r => r.key))
    for (const k of [...since.keys()]) if (!keep.has(k)) since.delete(k)
    rows = sortRows(all.map(r => {
      const prev = since.get(r.key)
      if (!prev || prev.state !== r.state) since.set(r.key, { state: r.state, at: nowMs })
      const at = since.get(r.key)!.at
      return r.state === 'working' && r.kind === 'tmux' ? { ...r, ageSec: Math.max(0, (nowMs - at) / 1000) } : r
    }))
    polledAt = nowMs
    $.ui.invalidate('ui.render')
  } finally {
    busy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try { await $.command.register({ name: 'overview', description: 'Show every agent (subagents, Claude sessions, tmux) in a live pane' }) } catch { /* the pane still works */ }
    void $.ui.open({ id: PANE, title: 'Overview' })
    void poll($)
    $.clock.every(POLL_MS, () => { void poll($) })
    $.clock.every(TICK_MS, () => { $.ui.invalidate('ui.render') })
    return next(e)
  })

  on('command.run', { command: 'overview' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Overview' })
    return { text: 'Agents pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const now = await $.clock.now()
    const drift = polledAt > 0 ? Math.max(0, (now - polledAt) / 1000) : 0
    const pulse = Math.floor(now / TICK_MS) % 2 === 0
    const age = (r: Row) => ageLabel(r.ageSec === null ? null : r.ageSec + drift)
    // A session nests under the session that started it, and a subagent under its session, when both are in this list.
    const nest = (list: Row[]): Row[] => {
      const out: Row[] = []
      const put = (r: Row, depth: number) => {
        out.push(depth > 0 ? { ...r, depth } as Row : r)
        for (const c of list) {
          if (c.kind === 'claude' && r.kind === 'claude' && c.spawnParent === r.parent) put(c, depth + 1)
          else if (c.kind === 'subagent' && r.kind === 'claude' && c.parent === r.parent) put(c, depth + 1)
        }
      }
      const nested = (r: Row) => (r.kind === 'subagent' && list.some(p => p.kind === 'claude' && p.parent === r.parent)) || (r.kind === 'claude' && !!r.spawnParent && list.some(p => p.kind === 'claude' && p.parent === r.spawnParent))
      for (const r of list) if (!nested(r)) put(r, 0)
      return out
    }
    const isLive = (r: Row) => r.state === 'needs' || r.state === 'working' || r.state === 'problem'
    // A tree is active when any member is, so a working child keeps its idle parent in view.
    const trees: Row[][] = []
    for (const r of nest(rows)) {
      if (((r as any).depth ?? 0) === 0 || trees.length === 0) trees.push([r])
      else trees[trees.length - 1].push(r)
    }
    // An idle subagent never sits in the active list, even under a working parent.
    const idleSub = (r: Row) => r.kind === 'subagent' && !isLive(r)
    const active = trees.filter(t => t.some(isLive)).flat().filter(r => !idleSub(r))
    const inactive = [...trees.filter(t => !t.some(isLive)).flat(), ...trees.filter(t => t.some(isLive)).flat().filter(idleSub)]
    const types = Object.keys(TYPE_COLOR).filter(t => rows.some(r => typeOf(r) === t))
    const total = Math.max(1, rows.length)
    // One segment per agent, grouped by type: working ones solid, inactive ones faded.
    const w = 700 / total
    const live = (r: Row) => r.state !== 'idle' && r.state !== 'done'
    const ordered = types.flatMap(t => rows.filter(r => typeOf(r) === t).sort((p, q) => Number(live(q)) - Number(live(p))))
    const bar = ordered.map((r, i) => `<rect x="${i * w + 1}" y="0" width="${Math.max(1, w - 2)}" height="4" rx="2" fill="${TYPE_COLOR[typeOf(r)]}" fill-opacity="${live(r) ? 1 : 0.28}"/>`).join('')
    const toggle = (id: string) => { closed.has(id) ? closed.delete(id) : closed.add(id); void $.ui.invalidate('ui.render') }
    const row = (r: Row) => (
      <Box key={r.key} flexDirection="column" marginLeft={((r as any).depth ?? 0) * 2}>
        <Box justifyContent="space-between" gap={2}>
          <Text size="footnote" wrap="truncate-end"><Text color={TYPE_COLOR[typeOf(r)]} dimColor={(r as any).depth > 0 && r.state === 'working' && pulse}>{(r as any).depth > 0 ? '↳' : r.state === 'working' && pulse ? '□' : '■'}</Text>  <Text bold>{r.name}</Text></Text>
          <Box gap={1}>
            {r.state === 'problem' && <Text size="caption" color="#f85149" bold>stuck</Text>}
            {r.state === 'needs' && <Text size="caption" color="#e3a008" bold>waiting</Text>}
            <Text size="caption" dimColor tabular>{age(r)}</Text>
          </Box>
        </Box>
        {(r.model || r.detail !== '') && (
          <Box marginLeft={2} gap={1} alignItems="flex-start">
            {r.model && <Box paddingX={1} flexShrink={0} backgroundColor={pillColor(r.model)}><Text size="caption" dimColor wrap="truncate-end">{r.model}</Text></Box>}
            {sub(r) !== '' && <Text size="caption" dimColor>{sub(r)}</Text>}
          </Box>
        )}
      </Box>
    )
    const head = (id: string, title: string, n: number) => (
      <Box justifyContent="space-between">
        <Button plain key={'t' + id} onPress={() => toggle(id)}>
          <Text size="footnote">{title} {closed.has(id) ? '›' : '⌄'}</Text>
        </Button>
        <Text size="caption" dimColor>{n}</Text>
      </Box>
    )
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        {(claudeLim.length > 0 || codexLim.length > 0) && <Box flexDirection="column" borderStyle="round" borderColor="rgba(128,128,128,0.22)" backgroundColor="rgba(128,128,128,0.08)" paddingX={2} paddingY={1} gap={1}>
          <Text size="footnote" bold>Subscriptions</Text>
          {[['Claude', claudeLim], ['Codex', codexLim]].map(([who, list]: any) => {
            if (list.length === 0) return null
            const bars = list.slice(0, 2).map((l: Limit, i: number) =>
              `<rect y="${i * 6}" width="700" height="4" rx="2" fill="#484f58" fill-opacity="0.5"/><rect y="${i * 6}" width="${Math.max(4, Math.min(100, l.pct) * 7)}" height="4" rx="2" fill="url(#h)"/>`).join('')
            const text = list.slice(0, 2).map((l: Limit) => (l.name === '5-hour' ? '5h' : l.name === 'Weekly' ? 'Wk' : l.name) + ' ' + Math.round(l.pct) + '%').join(' · ')
            return (
              <Box key={who} flexDirection="column" marginTop={1}>
                <Box justifyContent="space-between" gap={2}>
                  <Box gap={0} alignItems="center">
                    <Svg width={14} height={14} alt={who} source={ICON[who]} />
                    <Text size="footnote" bold> {who}</Text>
                  </Box>
                  <Text size="caption" dimColor tabular>{text}</Text>
                </Box>
                <Svg height={10} alt={who + ' usage'} source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 10" width="700" height="10" preserveAspectRatio="none"><defs><linearGradient id="h" gradientUnits="userSpaceOnUse" x1="0" x2="700" y1="0" y2="0"><stop offset="0" stop-color="#22c55e"/><stop offset="0.5" stop-color="#eab308"/><stop offset="0.75" stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>${bars}</svg>`} />
                {pace(list, Math.floor(now / 1000)) !== '' && <Text size="caption" dimColor>{pace(list, Math.floor(now / 1000))}</Text>}
              </Box>
            )
          })}
        </Box>}
        <Box flexDirection="column" borderStyle="round" borderColor="rgba(128,128,128,0.22)" backgroundColor="rgba(128,128,128,0.08)" paddingX={2} paddingY={1} gap={1}>
          <Box justifyContent="space-between">
            <Text size="footnote" bold>Agents</Text>
            <Text size="caption" dimColor>{summary(rows)}</Text>
          </Box>
          <Svg height={4} alt="Agents by type" source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 4" width="700" height="4" preserveAspectRatio="none">${bar}</svg>`} />
          <Box gap={3} flexWrap="wrap">
            {types.map(t => (
              <Text key={t} size="caption" dimColor><Text color={TYPE_COLOR[t]}>■</Text> {TYPE_LABEL[t]}</Text>
            ))}
          </Box>
          {active.length === 0 && <Text size="caption" dimColor>Nothing active.</Text>}
          {active.map(row)}
          {head('inactive', 'Inactive', inactive.length)}
          {!closed.has('inactive') && inactive.map(row)}
        </Box>
      </Box>
    )
  })
}
export const current = (): Row[] => rows
