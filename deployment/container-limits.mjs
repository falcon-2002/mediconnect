import assert from 'node:assert/strict';

export const LIMIT_BYTES = 512 * 1024 * 1024;
export function verifyLimits(host, limits) {
  assert.equal(host.Memory, LIMIT_BYTES, 'Docker must enforce exactly 512 MiB');
  assert.equal(host.MemorySwap, LIMIT_BYTES, 'Docker must disable swap');
  assert.equal(limits.maximum, LIMIT_BYTES, 'cgroup memory.max must match Docker limit');
  assert.equal(limits.swapMaximum, 0, 'cgroup swap must be disabled');
}
export function parseCgroup(text) {
  const [current, peak, maximum, swapMaximum, ...eventLines] = text.trim().split('\n');
  const events = Object.fromEntries(eventLines.map(line => line.trim().split(/\s+/)).filter(parts => parts.length === 2)
    .map(([name, value]) => [name, Number(value)]));
  for (const value of [current, peak, maximum, swapMaximum]) assert.match(value, /^\d+$/, 'Numeric cgroup-v2 accounting is required');
  return { current: Number(current), peak: Number(peak), maximum: Number(maximum), swapMaximum: Number(swapMaximum), events };
}
export function verifyOutcome(state, accounting) {
  assert.equal(state.Running, true, 'Container must remain running');
  assert.equal(state.OOMKilled, false, 'Container must not be OOM-killed');
  assert.equal(accounting.events.oom, 0, 'No cgroup OOM event is acceptable');
  assert.equal(accounting.events.oom_kill, 0, 'No cgroup OOM kill is acceptable');
  assert.equal(accounting.events.max, 0, 'No hard-limit memory-pressure event is acceptable');
  assert.ok(accounting.peak > 0 && accounting.peak < LIMIT_BYTES, 'Measured cgroup peak must remain below 512 MiB');
}
