// Exercise the real wrapper with synthetic input and a child that never calls an API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

for (const shell of ['powershell.exe', 'pwsh.exe']) {
  const available = process.platform === 'win32' && spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0']).status === 0;
  test(`${shell}: wrapper sends BOM-free UTF-8 JSON and EOF without leaking input`, { skip: !available }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mediconnect-stdin-test-'));
    const expected = { email: 'fixture@example.test', password: 'Synthetic-Caf\u00e9-\u0939\u093f\u0902\u0926\u0940-\u{1fa7a}-"-$-`' };
    try {
      await copyFile(new URL('./local-data.ps1', import.meta.url), join(directory, 'local-data.ps1'));
      const encoded = Buffer.from(JSON.stringify(expected)).toString('base64');
      await writeFile(join(directory, 'run.ps1'), `
$ErrorActionPreference = 'Stop'
$global:mediconnectStdinFixture = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if ($AsSecureString) { return ConvertTo-SecureString $global:mediconnectStdinFixture.password -AsPlainText -Force }
    return $global:mediconnectStdinFixture.email
}
& (Join-Path $PSScriptRoot 'local-data.ps1') -Mode RegisterAdmin -AccountAbsenceConfirmed
`);
      await writeFile(join(directory, 'local-data.mjs'), `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const bytes = Buffer.concat(chunks);
if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) process.exit(11);
const actual = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const expected = JSON.parse(Buffer.from('${encoded}', 'base64').toString('utf8'));
if (actual.email !== expected.email || actual.password !== expected.password) process.exit(12);
if (process.argv.length !== 3 || process.argv[2] !== 'registeradmin') process.exit(13);
console.log('UTF8_STDIN_VERIFIED');
`);
      const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(directory, 'run.ps1')], { encoding: 'utf8', timeout: 30000 });
      assert.equal(result.status, 0, `Wrapper failed: ${result.stderr}`);
      assert.equal(result.stdout.trim(), 'UTF8_STDIN_VERIFIED');
      assert.equal(result.stderr, '');
    } finally {
      const withinTemp = relative(tmpdir(), directory);
      assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
      await rm(directory, { recursive: true, force: true });
    }
  });
}
