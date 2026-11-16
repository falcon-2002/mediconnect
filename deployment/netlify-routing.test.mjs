import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redirects, gatewayOrigin, writeRouting } from './netlify-routing.mjs';

test('production routing preserves API paths before the SPA fallback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mediconnect-netlify-'));
  try {
    await writeRouting('https://mediconnect-example.onrender.com/', directory);
    assert.equal(await readFile(join(directory, '_redirects'), 'utf8'),
      '/api/* https://mediconnect-example.onrender.com/api/:splat 200!\n/* /index.html 200\n');
    assert.match(await readFile(join(directory, '_headers'), 'utf8'), /nosniff/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing, local, insecure, or credential-bearing origins cannot publish', () => {
  for (const value of [undefined, '', 'http://api.example.com', 'https://localhost',
    'https://127.0.0.1', 'https://[::1]', 'https://a.internal', 'https://a.localhost',
    'https://a.local', 'https://a.test', 'https://api.example.com/api',
    'https://api.example.com?token=synthetic', 'https://a:b@api.example.com',
    'https://api.example.com:8080', 'https://api.example.com/#fragment']) {
    assert.throws(() => redirects(value));
  }
  assert.equal(gatewayOrigin('https://api.example.com/'), 'https://api.example.com');
});
