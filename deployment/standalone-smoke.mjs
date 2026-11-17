// Explicit disposable H2 verification of ONE JVM. Never uses local/cloud DB data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { ephemeralFixtures } from './standalone-fixtures.mjs';
import { standaloneJourney } from './standalone-journey.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('../', import.meta.url));
const resultDirectory = resolve(root, 'logs/standalone-smoke');
const resultFile = resolve(resultDirectory, 'result.json');
const jar = resolve(root, 'backend/standalone-backend/target/standalone-backend-0.1.0-SNAPSHOT.jar');
const memory = { samples: 0, peakResidentBytes: 0, peakPrivateBytes: 0, idleResidentBytes: 0 };
const checks = {};
let child, monitor, stream, interval, fixtures, requestCount = 0;
const started = Date.now();
const duration = Number(process.env.SMOKE_DURATION_SECONDS ?? '60');
let origin;

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
function sample(value) {
  memory.samples++;
  memory.lastResidentBytes = value.residentBytes;
  memory.peakResidentBytes = Math.max(memory.peakResidentBytes, value.residentBytes, value.peakResidentBytes ?? 0);
  memory.peakPrivateBytes = Math.max(memory.peakPrivateBytes, value.privateBytes ?? 0);
}
async function request(path, { method, body, token, status = 200 } = {}) {
  const response = await fetch(origin + path, { method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000), redirect: 'error' });
  requestCount++;
  if (status !== null) assert.equal(response.status, status, `${path.split('?')[0]} HTTP status`);
  // Raw bodies and auth headers are never printed, including on failure.
  if (response.status >= 400 || response.status === 204) { await response.arrayBuffer(); return response.status; }
  return response.json();
}
async function waitForHealth() {
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error('The isolated JVM exited; inspect the ignored smoke log.');
    try { if ((await fetch(origin + '/actuator/health', { signal: AbortSignal.timeout(2000) })).ok) return; } catch { }
    await delay(500);
  }
  throw new Error('Timed out waiting for isolated startup.');
}
try {
  if (process.argv[2] !== '--isolated-h2') throw new Error('Use --isolated-h2 explicitly; live database verification is not supported.');
  if (!Number.isInteger(duration) || duration < 10 || duration > 600) throw new Error('SMOKE_DURATION_SECONDS must be 10..600.');
  const h2 = process.env.SMOKE_H2_JAR;
  if (!h2) throw new Error('Set SMOKE_H2_JAR to the existing test-scoped H2 jar in the Maven cache.');
  await Promise.all([access(h2), access(jar)]);
  fixtures = await ephemeralFixtures();
  await mkdir(resultDirectory, { recursive: true });
  await writeFile(resultFile, JSON.stringify({ status: 'running', passed: false }));
  const settings = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8', windowsHide: true,
    env: { ...process.env, JAVA_TOOL_OPTIONS: '', JDK_JAVA_OPTIONS: '', _JAVA_OPTIONS: '' } });
  const javaHome = process.env.SMOKE_JAVA_HOME ?? settings.stderr?.match(/java\.home\s*=\s*(.+)/)?.[1].trim();
  if (settings.status !== 0 || !javaHome) throw new Error('Cannot resolve the actual Java executable.');
  const java = resolve(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const port = await freePort(); origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), SPRING_PROFILES_ACTIVE: 'isolated', SPRING_APPLICATION_JSON: '',
    JAVA_TOOL_OPTIONS: '', JDK_JAVA_OPTIONS: '', _JAVA_OPTIONS: '', DEBUG: 'false', TRACE: 'false',
    JWT_PUBLIC_KEY: pathToFileURL(fixtures.publicKeyPath).href, JWT_PRIVATE_KEY: pathToFileURL(fixtures.privateKeyPath).href };
  const args = ['-Xms64m', '-Xmx192m', '-XX:MaxMetaspaceSize=144m', '-XX:ReservedCodeCacheSize=48m',
    '-XX:MaxDirectMemorySize=16m', '-XX:+UseSerialGC', '-Xss512k', '-XX:+ExitOnOutOfMemoryError',
    `-Dloader.path=${h2}`, '-cp', jar, 'org.springframework.boot.loader.launch.PropertiesLauncher',
    '--spring.profiles.active=isolated', '--mediconnect.migrations-enabled=true', '--logging.level.root=WARN'];
  // Highest-precedence CLI URLs ensure an inherited environment cannot select a real DB.
  for (const unit of ['auth', 'patient', 'doctor', 'appointment']) {
    args.push(`--mediconnect.databases.${unit}.url=jdbc:h2:mem:smoke_${unit};MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE`);
    env[`${unit.toUpperCase()}_DB_USER`] = 'sa'; env[`${unit.toUpperCase()}_DB_PASSWORD`] = 'synthetic-isolated-only';
  }
  stream = createWriteStream(resolve(resultDirectory, 'jvm.log'));
  child = spawn(java, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
  await writeFile(resolve(resultDirectory, 'process.json'), JSON.stringify({ pid: child.pid, origin }));
  if (process.platform === 'win32') {
    monitor = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'deployment/standalone-memory.ps1'),
      '-WatchedProcessId', String(child.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    createInterface({ input: monitor.stdout }).on('line', line => { try { sample(JSON.parse(line)); } catch { } });
  } else if (process.platform === 'linux') {
    interval = setInterval(async () => {
      try {
        const status = await readFile(`/proc/${child.pid}/status`, 'utf8');
        const bytes = key => Number(status.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) * 1024;
        sample({ residentBytes: bytes('VmRSS'), peakResidentBytes: bytes('VmHWM') });
      } catch { }
    }, 250);
  } else throw new Error('Memory monitor supports Windows or Linux only.');
  await waitForHealth();
  const startupSeconds = (Date.now() - started) / 1000;
  await delay(2000); memory.idleResidentBytes = memory.lastResidentBytes;
  checks.health = true;
  const journey = await standaloneJourney(request, fixtures.privateKey, duration);
  Object.assign(checks, journey.checks);
  const loadRequests = journey.loadRequests;
  await delay(1000);
  assert.ok(memory.samples > 0, 'Memory monitor must produce real measurements');
  const result = { status: 'passed', passed: true, platform: process.platform, fixture: 'four disposable in-memory H2 databases',
    javaHome, heapMaxMiB: 192, metaspaceMaxMiB: 144, codeCacheMaxMiB: 48, directMaxMiB: 16,
    startupSeconds, loadSeconds: duration, concurrency: 8, requestCount, loadRequests, checks, memory,
    below512MiBResident: memory.peakResidentBytes < 512 * 1024 * 1024,
    limitations: 'Local process measurements only. No Linux container/cgroup limit or live TiDB TLS/load verification; not a production capacity guarantee.' };
  await writeFile(resultFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await mkdir(resultDirectory, { recursive: true });
  // Assertion messages contain only endpoint/status or test-independent descriptions.
  await writeFile(resultFile, JSON.stringify({ status: 'failed', passed: false, requestCount, checks, memory,
    error: error instanceof assert.AssertionError ? error.message : 'Smoke startup or request failed; inspect the ignored local log.' }, null, 2));
  console.error('Isolated standalone verification failed; see logs/standalone-smoke/result.json.');
  process.exitCode = 1;
} finally {
  clearInterval(interval);
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([new Promise(done => child.once('exit', done)), delay(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (monitor && monitor.exitCode === null) monitor.kill();
  stream?.end();
  await fixtures?.cleanup();
}
