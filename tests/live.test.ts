// Drives the real poll against a real tmux server on a private socket-free session name: start one, see it; kill it, see it go.
import { expect, test } from 'bun:test'
import { current, poll } from '../hooks/register'

const sh = (...a: string[]) => Bun.spawnSync(a)
const $ = {
  clock: { now: async () => Date.now() },
  process: { run: async (argv: string[]) => { const r = Bun.spawnSync(argv); return { exitCode: r.exitCode, stdout: r.stdout.toString() } } },
  agent: { list: async () => [] },
  fs: { read: async () => { throw new Error('none') } },
  ui: { invalidate: () => {} },
}
const has = (n: string) => current().some(r => r.key === 'tmux:' + n)

test('a tmux session appears within one poll and disappears when killed', async () => {
  const name = 'overview-test-' + process.pid
  await poll($)
  expect(has(name)).toBe(false)
  sh('tmux', 'new-session', '-d', '-s', name, 'echo hello from the lane; sleep 60')
  await Bun.sleep(300)
  await poll($)
  expect(current().find(r => r.key === 'tmux:' + name)?.detail).toContain('hello from the lane')
  sh('tmux', 'kill-session', '-t', name)
  await poll($)
  expect(has(name)).toBe(false)
})
