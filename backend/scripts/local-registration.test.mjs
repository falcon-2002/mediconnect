import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { ApiFailure, client, registerAdmin, validateRegistration } from './local-data.mjs';

const identity = { id: '12345678-1234-1234-1234-123456789012', email: 'fixture@example.test', role: 'PATIENT' };
const input = () => ({ email: identity.email, password: 'Synthetic-only-password' });
async function isolated(run) {
  const directory = await mkdtemp(join(tmpdir(), 'mediconnect-registration-test-'));
  try { await run(directory); }
  finally {
    const path = relative(tmpdir(), directory);
    assert.ok(path && !path.startsWith('..') && !isAbsolute(path));
    await rm(directory, { recursive: true, force: true });
  }
}

test('registration validates size and UTF-8 byte limits without exposing values', () => {
  for (const password of ['short', ' '.repeat(12), 'x'.repeat(73), '\u0939'.repeat(25)])
    assert.throws(() => validateRegistration({ ...input(), password }), /12-72 characters/);
  assert.throws(() => validateRegistration({ ...input(), email: 'not-an-email' }), /email must/);
  assert.equal(validateRegistration({ ...input(), email: ' Fixture@Example.Test ' }), identity.email);
});

test('no request or artifact before the fresh absence check and input validation', () => isolated(async directory => {
  let calls = 0;
  const api = async () => { calls++; return identity; };
  await assert.rejects(registerAdmin(api, input(), { directory }), /zero rows/);
  await assert.rejects(registerAdmin(api, { ...input(), password: 'short' }, { directory, absenceConfirmed: true }), /12-72/);
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(directory), []);
}));

for (const status of [400, 409, 503, 0]) {
  test(`HTTP ${status}: one attempt, safe diagnostic, no success artifacts`, () => isolated(async directory => {
    let calls = 0;
    const credentials = input();
    await assert.rejects(registerAdmin(async () => { calls++; throw new ApiFailure(status, 'POST', '/api/auth/register'); }, credentials,
      { directory, absenceConfirmed: true }), /No write was retried/);
    assert.equal(calls, 1);
    assert.equal(credentials.password, '');
    assert.deepEqual(await readdir(directory), ['registration-result.json']);
    const text = await readFile(join(directory, 'registration-result.json'), 'utf8');
    assert.equal(JSON.parse(text).httpStatus, status);
    assert.ok(!text.includes(input().password));
    assert.ok(!text.includes(identity.email));
  }));
}

test('valid 201 identity creates only safe artifacts; existing receipt blocks another POST', () => isolated(async directory => {
  let calls = 0;
  const api = async (path, body, expectedStatus) => {
    calls++;
    assert.equal(path, '/api/auth/register');
    assert.deepEqual(Object.keys(body).sort(), ['email', 'password']);
    assert.equal(expectedStatus, 201);
    return { ...identity, accessToken: 'must-not-save', password: 'must-not-save' };
  };
  await writeFile(join(directory, 'new-account.json'), '');
  assert.deepEqual(await registerAdmin(api, input(), { directory, absenceConfirmed: true }), identity);
  const names = await readdir(directory);
  assert.equal(names.filter(n => n.startsWith('empty-receipt-')).length, 1);
  for (const name of names) {
    const text = await readFile(join(directory, name), 'utf8');
    assert.ok(!text.includes('must-not-save'));
    assert.ok(!text.includes(input().password));
  }
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'new-account.json'), 'utf8')), identity);
  assert.equal(JSON.parse(await readFile(join(directory, 'registration-result.json'), 'utf8')).status, 'confirmed');
  await assert.rejects(registerAdmin(api, input(), { directory, absenceConfirmed: true }), /nonempty registration receipt/);
  assert.equal(calls, 1);
}));

test('mismatched registration identity leaves no receipt or promotion SQL', () => isolated(async directory => {
  await assert.rejects(registerAdmin(async () => ({ ...identity, email: 'wrong@example.test' }), input(), { directory, absenceConfirmed: true }), /identity was invalid/);
  assert.deepEqual(await readdir(directory), ['registration-result.json']);
}));

test('unexpected success status and raw server error text are never accepted or echoed', async () => {
  const api = client('http://127.0.0.1:8080', undefined, async () => new Response(JSON.stringify(identity), { status: 200 }));
  await assert.rejects(api('/api/auth/register', input(), 201), /Expected HTTP 201/);
  const rejected = client('http://127.0.0.1:8080', undefined, async () => new Response('password=must-not-print token=must-not-print', { status: 400 }));
  await assert.rejects(rejected('/api/auth/register', input(), 201), error => error.status === 400 && !error.message.includes('must-not-print'));
});
