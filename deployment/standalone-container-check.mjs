// Linux Docker capacity gate. This script has no cloud credentials or live DB mode.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ephemeralFixtures } from './standalone-fixtures.mjs';
import { standaloneJourney } from './standalone-journey.mjs';
import { LIMIT_BYTES, parseCgroup, verifyLimits, verifyOutcome } from './container-limits.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'logs/standalone-container');
const resultFile = resolve(directory, 'result.json');
const runId = randomUUID();
const image = `mediconnect-standalone-check:${runId}`;
const containers = [];
let fixtures, application, origin, requestCount = 0, interval, sampling = false;
let peakDuringStartup = 0, accounting, sampledPeak = 0, imageBuilt = false;
const report = { passed: false, platform: process.platform, fixture: 'four disposable in-memory H2 databases', checks: {}, memorySamples: 0 };

async function execute(binary, args, { timeout = 30000, display = false, allowFailure = false } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd: root, stdio: ['ignore', display ? 'inherit' : 'pipe', display ? 'inherit' : 'pipe'] });
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    // Never print command arguments, raw stderr, response payloads, keys or tokens.
    child.stderr?.resume();
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.once('error', () => { clearTimeout(timer); reject(new Error('A required local test tool could not start')); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0 && !allowFailure) reject(new Error(`${binary} test operation failed`));
      else done({ code, output: output.trim() });
    });
  });
}
const docker = async (args, options) => (await execute('docker', args, options)).output;
const inspect = async id => JSON.parse(await docker(['inspect', id]))[0];
async function createContainer(name, extra) {
  const id = await docker(['create', '--name', name, '--label', `mediconnect.capacity-check=${runId}`,
    '--memory=512m', '--memory-swap=512m', '--pids-limit=128', ...extra]);
  assert.match(id, /^[a-f0-9]{64}$/);
  containers.push(id); return id;
}
async function measure() {
  if (sampling || !application) return;
  sampling = true;
  try {
    const raw = await docker(['exec', application, 'sh', '-c',
      'cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max /sys/fs/cgroup/memory.events']);
    accounting = parseCgroup(raw); sampledPeak = Math.max(sampledPeak, accounting.peak);
    report.memorySamples++;
  } finally { sampling = false; }
}
async function request(path, { method, body, token, status = 200 } = {}) {
  assert.ok(path.startsWith('/api/'));
  const response = await fetch(origin + path, { method: method ?? (body === undefined ? 'GET' : 'POST'),
    redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  requestCount++;
  if (status !== null) assert.equal(response.status, status, `${path.split('?')[0]} HTTP status`);
  if (response.status >= 400 || response.status === 204) { await response.arrayBuffer(); return response.status; }
  return response.json();
}
try {
  assert.equal(process.argv[2], '--isolated-h2', 'Explicit --isolated-h2 is required');
  assert.equal(process.platform, 'linux', 'A real Linux Docker host is required; Windows/WSL emulation is not claimed');
  const duration = Number(process.env.SMOKE_DURATION_SECONDS ?? '90');
  assert.ok(Number.isInteger(duration) && duration >= 10 && duration <= 600);
  const h2 = process.env.SMOKE_H2_JAR;
  assert.ok(h2, 'SMOKE_H2_JAR must identify the test-scoped H2 dependency');
  assert.equal(await docker(['info', '--format', '{{.CgroupVersion}}']), '2', 'cgroup v2 accounting is required');
  await mkdir(directory, { recursive: true });
  await writeFile(resultFile, JSON.stringify(report));
  fixtures = await ephemeralFixtures(h2);
  console.log('Building the production Dockerfile with backend/ as context; no secrets/build arguments supplied.');
  await docker(['build', '--file', 'backend/standalone-backend/Dockerfile', '--tag', image, 'backend'], { timeout: 12 * 60000, display: true });
  imageBuilt = true; report.checks.productionDockerBuild = true;
  const guard = await createContainer(`mc-entrypoint-${runId}`, ['--network=none', image]);
  const built = await inspect(guard);
  assert.equal(built.Config.User, 'mediconnect');
  assert.deepEqual(built.Config.Entrypoint, ['java', '-jar', '/app/app.jar']);
  assert.ok(built.Config.Env.includes('SPRING_PROFILES_ACTIVE=render-free'));
  assert.equal(built.HostConfig.Memory, LIMIT_BYTES); assert.equal(built.HostConfig.MemorySwap, LIMIT_BYTES);
  const artifact = resolve(directory, 'image.jar');
  await docker(['cp', `${guard}:/app/app.jar`, artifact]);
  await execute('python3', ['deployment/verify-standalone-artifact.py', artifact], { display: true });
  report.checks.productionArtifact = true;
  // Exact production ENTRYPOINT/profile must select standalone and fail without DB secrets,
  // rather than silently select Patient Service or migrate a default database.
  await docker(['start', guard]);
  const guardExit = Number(await docker(['wait', guard], { timeout: 120000 }));
  const guardState = (await inspect(guard)).State;
  const guardLog = await docker(['logs', guard]);
  assert.ok(guardExit !== 0 && guardExit !== 137);
  assert.equal(guardState.OOMKilled, false);
  assert.ok(guardLog.includes('StandaloneBackendApplication') && guardLog.includes('render-free'));
  assert.ok(!guardLog.includes('PatientServiceApplication'));
  report.checks.productionEntrypointAndMissingSecretGuard = true;

  const environment = ['SPRING_PROFILES_ACTIVE=isolated', 'MEDICONNECT_MIGRATIONS_ENABLED=true', 'JWT_ISSUER=mediconnect-auth',
    'JWT_PUBLIC_KEY=file:/run/fixture/public.pem', 'JWT_PRIVATE_KEY=file:/run/fixture/private.pem', 'PORT=10000',
    'LOGGING_LEVEL_ROOT=WARN', 'DEBUG=false', 'TRACE=false'];
  for (const unit of ['auth', 'patient', 'doctor', 'appointment']) environment.push(
    `${unit.toUpperCase()}_DB_URL=jdbc:h2:mem:container_${unit};MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE`,
    `${unit.toUpperCase()}_DB_USER=sa`, `${unit.toUpperCase()}_DB_PASSWORD=synthetic-isolated-only`);
  application = await createContainer(`mc-capacity-${runId}`, ['--read-only', '--tmpfs', '/tmp:rw,nosuid,size=64m',
    '--group-add', String(process.getgid()), '--mount', `type=bind,src=${fixtures.directory},dst=/run/fixture,readonly`,
    '--publish', '127.0.0.1::10000', ...environment.flatMap(value => ['--env', value]), '--entrypoint', 'java', image,
    '-Dloader.path=/run/fixture/h2.jar', '-cp', '/app/app.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher']);
  await docker(['start', application]);
  const started = Date.now();
  const details = await inspect(application);
  const port = details.NetworkSettings.Ports['10000/tcp'][0];
  assert.equal(port.HostIp, '127.0.0.1');
  origin = `http://127.0.0.1:${port.HostPort}`;
  await measure(); verifyLimits(details.HostConfig, accounting);
  interval = setInterval(() => { measure().catch(() => { /* Final inspect/accounting is authoritative. */ }); }, 1000);
  const deadline = Date.now() + 180000;
  let healthy = false;
  while (Date.now() < deadline) {
    assert.equal((await inspect(application)).State.Running, true, 'Container exited before startup completed');
    try { healthy = (await fetch(origin + '/actuator/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { }
    if (healthy) break;
    await delay(500);
  }
  assert.ok(healthy, 'Health startup deadline exceeded');
  report.startupSeconds = (Date.now() - started) / 1000;
  await measure(); peakDuringStartup = accounting.peak;
  report.checks.health = true;
  console.log('Container is healthy under the verified hard 512 MiB/no-swap limit; running representative workflows.');
  const journey = await standaloneJourney(request, fixtures.privateKey, duration);
  Object.assign(report.checks, journey.checks);
  report.requestCount = requestCount; report.loadRequests = journey.loadRequests;
  report.loadSeconds = duration; report.concurrency = 8;
  clearInterval(interval);
  while (sampling) await delay(50);
  await measure();
  const final = await inspect(application);
  verifyLimits(final.HostConfig, accounting); verifyOutcome(final.State, accounting);
  report.memory = { limitBytes: LIMIT_BYTES, swapLimitBytes: 0, startupPeakBytes: peakDuringStartup,
    cgroupPeakBytes: Math.max(accounting.peak, sampledPeak), finalCurrentBytes: accounting.current, events: accounting.events };
  report.image = { id: final.Image, user: final.Config.User, fixtureDriverOutsideImage: true };
  report.passed = true;
  report.limitations = 'Disposable H2 only; no live TiDB TLS/schema/persistence or Render latency verification. This is not a production certification.';
} catch (error) {
  report.passed = false;
  report.error = error instanceof assert.AssertionError ? error.message : 'Container test operation failed; no raw credentials, API payloads or JVM logs printed.';
  process.exitCode = 1;
} finally {
  clearInterval(interval);
  while (sampling) await delay(50);
  if (application) {
    try {
      const state = (await inspect(application)).State;
      report.finalState = { running: state.Running, oomKilled: state.OOMKilled, exitCode: state.ExitCode };
      if (!state.Running || state.OOMKilled) { report.passed = false; process.exitCode = 1; }
    } catch { report.passed = false; process.exitCode = 1; report.error = 'Final container state could not be verified'; }
  }
  if (process.platform === 'linux') {
    await mkdir(directory, { recursive: true }); await writeFile(resultFile, JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `\n### MediConnect 512 MiB container check\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
  }
  console.log(JSON.stringify(report));
  for (const id of containers.reverse()) {
    try {
      const details = await inspect(id);
      assert.equal(details.Config.Labels['mediconnect.capacity-check'], runId);
      await docker(['rm', '--force', id]);
    } catch { console.error('Test-container cleanup was not confirmed.'); }
  }
  if (imageBuilt) await docker(['image', 'rm', image], { allowFailure: true }).catch(() => {});
  await fixtures?.cleanup();
}
