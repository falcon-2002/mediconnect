import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT_BYTES, parseCgroup, verifyLimits, verifyOutcome } from './container-limits.mjs';
import { ephemeralFixtures } from './standalone-fixtures.mjs';
import { readFile, stat } from 'node:fs/promises';
import { createPublicKey, sign, verify } from 'node:crypto';

const valid = () => parseCgroup(`300000000\n400000000\n${LIMIT_BYTES}\n0\nlow 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n`);
test('accepts real numeric cgroup accounting only with matching hard limit and no swap', () => {
  verifyLimits({ Memory: LIMIT_BYTES, MemorySwap: LIMIT_BYTES }, valid());
  verifyOutcome({ Running: true, OOMKilled: false }, valid());
});
test('rejects unlimited memory or a swap-enabled container', () => {
  assert.throws(() => verifyLimits({ Memory: 0, MemorySwap: LIMIT_BYTES }, valid()));
  assert.throws(() => verifyLimits({ Memory: LIMIT_BYTES, MemorySwap: -1 }, valid()));
  assert.throws(() => verifyLimits({ Memory: LIMIT_BYTES, MemorySwap: LIMIT_BYTES }, { ...valid(), maximum: LIMIT_BYTES * 2 }));
  assert.throws(() => verifyLimits({ Memory: LIMIT_BYTES, MemorySwap: LIMIT_BYTES }, { ...valid(), swapMaximum: LIMIT_BYTES }));
  assert.throws(() => parseCgroup('1\n2\nmax\nmax\noom 0\noom_kill 0'));
});
test('cannot report a passing container when it exited, hit the limit or recorded OOM', () => {
  assert.throws(() => verifyOutcome({ Running: false, OOMKilled: false }, valid()));
  assert.throws(() => verifyOutcome({ Running: true, OOMKilled: true }, valid()));
  assert.throws(() => verifyOutcome({ Running: true, OOMKilled: false }, { ...valid(), peak: LIMIT_BYTES }));
  assert.throws(() => verifyOutcome({ Running: true, OOMKilled: false }, { ...valid(), events: { max: 1, oom: 0, oom_kill: 0 } }));
  assert.throws(() => verifyOutcome({ Running: true, OOMKilled: false }, { ...valid(), events: { oom: 1, oom_kill: 0 } }));
  assert.throws(() => verifyOutcome({ Running: true, OOMKilled: false }, { ...valid(), events: { oom: 0, oom_kill: 1 } }));
});
test('test signing keys are fresh matching pairs and deleted after use', async () => {
  const first = await ephemeralFixtures(), second = await ephemeralFixtures();
  try {
    const firstPublic = await readFile(first.publicKeyPath), secondPublic = await readFile(second.publicKeyPath);
    assert.notDeepEqual(firstPublic, secondPublic);
    const message = Buffer.from('synthetic-fixture-check');
    assert.ok(verify('RSA-SHA256', message, createPublicKey(firstPublic), sign('RSA-SHA256', message, first.privateKey)));
  } finally { await first.cleanup(); await second.cleanup(); }
  await assert.rejects(stat(first.privateKeyPath), { code: 'ENOENT' });
  await assert.rejects(stat(second.directory), { code: 'ENOENT' });
});
