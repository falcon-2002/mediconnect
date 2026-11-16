// Explicit isolated integration check: real packaged services/Eureka, disposable H2.
// Never connects to a configured local/cloud MySQL instance or reads runtime keys.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['discovery-server', 'auth-service', 'patient-service', 'doctor-service', 'appointment-service', 'api-gateway'];
const processes = [], outputStreams = [];
const checks = {};
const resultPath = resolve(root, 'logs/deployment-smoke/result.json');

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}

async function waitFor(check, description, timeout = 180000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (processes.some(child => child.exitCode !== null)) throw new Error('A smoke service exited; inspect its ignored smoke log.');
    try { if (await check()) return; } catch { /* Startup/discovery convergence only. No writes retried. */ }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function request(origin, path, { body, token, status = 200 } = {}) {
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Never include raw bodies/headers in failures: auth responses contain tokens.
  assert.equal(response.status, status, `${path.split('?')[0]} HTTP status`);
  if (status === 401 || status === 403 || status === 409) return;
  return response.json();
}

try {
  if (process.argv[2] !== '--isolated-h2') throw new Error('Explicitly use --isolated-h2; this is not a live MySQL verifier.');
  const h2 = process.env.SMOKE_H2_JAR;
  if (!h2) throw new Error('Set SMOKE_H2_JAR to the existing test-scoped H2 jar in your Maven cache.');
  await access(h2);
  // On Windows PATH may point at Oracle's javapath shim, which starts another
  // JVM. Launch the real executable so cleanup terminates the actual service.
  const javaSettings = spawnSync('java', ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, JAVA_TOOL_OPTIONS: '', JDK_JAVA_OPTIONS: '', _JAVA_OPTIONS: '' },
  });
  const javaHome = javaSettings.stderr?.match(/java\.home\s*=\s*(.+)/)?.[1].trim();
  if (javaSettings.status !== 0 || !javaHome) throw new Error('Cannot resolve the real Java executable.');
  const java = resolve(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  await access(java);
  for (const name of names) await access(resolve(root, `backend/${name}/target/${name}-0.1.0-SNAPSHOT.jar`));
  const logDir = resolve(root, 'logs/deployment-smoke');
  await mkdir(logDir, { recursive: true });
  await writeFile(resultPath, JSON.stringify({ status: 'running', startedAt: new Date().toISOString(), passed: false }));
  const ports = Object.fromEntries(await Promise.all(names.map(async name => [name, await freePort()])));
  const origin = name => `http://127.0.0.1:${ports[name]}`;
  const prefix = { 'auth-service': 'AUTH', 'patient-service': 'PATIENT', 'doctor-service': 'DOCTOR', 'appointment-service': 'APPOINTMENT' };
  for (const name of names) {
    const jar = resolve(root, `backend/${name}/target/${name}-0.1.0-SNAPSHOT.jar`);
    const env = { ...process.env, SPRING_PROFILES_ACTIVE: 'render', PORT: String(ports[name]),
      SERVICE_HOSTNAME: 'localhost', DISCOVERY_HOSTPORT: `127.0.0.1:${ports['discovery-server']}`,
      JWT_ISSUER: 'mediconnect-auth', MYSQL_TRUSTSTORE_URL: 'file:/not-used-with-h2', MYSQL_TRUSTSTORE_PASSWORD: 'synthetic-h2-only',
      JAVA_TOOL_OPTIONS: '', JDK_JAVA_OPTIONS: '', _JAVA_OPTIONS: '', SPRING_APPLICATION_JSON: '', DEBUG: 'false', TRACE: 'false',
      LOGGING_LEVEL_ORG_SPRINGFRAMEWORK: 'WARN', LOGGING_LEVEL_ORG_HIBERNATE: 'WARN' };
    // File resources are test-only fixtures, never runtime signing keys.
    env.JWT_PUBLIC_KEY = new URL('../backend/auth-service/src/test/resources/test-public.pem', import.meta.url).href;
    env.JWT_PRIVATE_KEY = new URL('../backend/auth-service/src/test/resources/test-private.pem', import.meta.url).href;
    if (prefix[name]) {
      env[`${prefix[name]}_DB_URL`] = `jdbc:h2:mem:${randomUUID()};MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE;IGNORE_UNKNOWN_SETTINGS=TRUE`;
      env[`${prefix[name]}_DB_USER`] = 'sa'; env[`${prefix[name]}_DB_PASSWORD`] = 'synthetic-h2-only';
    }
    const args = ['-Xmx256m', '-Dloader.path=' + h2, '-cp', jar, 'org.springframework.boot.loader.launch.PropertiesLauncher',
      '--spring.datasource.driver-class-name=org.h2.Driver', '--logging.level.root=WARN',
      '--eureka.client.registry-fetch-interval-seconds=5', '--eureka.client.initial-instance-info-replication-interval-seconds=1',
      '--spring.cloud.loadbalancer.cache.ttl=5s'];
    const log = createWriteStream(resolve(logDir, `${name}.log`)); outputStreams.push(log);
    const child = spawn(java, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.on('error', () => { child.exitCode = 1; });
    processes.push(child);
    await writeFile(resolve(logDir, 'processes.json'), JSON.stringify(processes.map(child => ({ pid: child.pid })), null, 2));
    await waitFor(async () => (await fetch(origin(name) + '/actuator/health', { signal: AbortSignal.timeout(3000) })).ok, name);
    console.log(`${name}: started with render profile (isolated H2 where applicable)`);
  }
  checks.allSixHealthChecks = true;
  await waitFor(async () => {
    const registry = await request(origin('discovery-server'), '/eureka/apps');
    const apps = registry.applications.application;
    return ['AUTH-SERVICE', 'PATIENT-SERVICE', 'DOCTOR-SERVICE', 'APPOINTMENT-SERVICE', 'API-GATEWAY'].every(name =>
      apps.some(app => app.name === name && app.instance.some(instance => instance.status === 'UP' && instance.hostName === 'localhost')));
  }, 'Eureka registrations');
  checks.eurekaConfiguredHostnameRegistration = true;
  const gateway = origin('api-gateway');
  await waitFor(async () => (await fetch(gateway + '/api/doctors/catalog')).ok, 'gateway load-balanced routes');
  checks.gatewayDiscoveryRoute = true;
  let password = `Synthetic-${randomUUID()}`;
  const email = `smoke-${randomUUID()}@example.test`;
  const account = await request(gateway, '/api/auth/register', { body: { email, password }, status: 201 });
  assert.equal(account.role, 'PATIENT'); checks.registrationPatientOnly = true;
  const login = await request(gateway, '/api/auth/login', { body: { email, password } }); password = '';
  const token = login.accessToken;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(claims.sub, account.id); assert.ok(claims.aud.includes('mediconnect-api')); checks.loginJwtClaims = true;
  await request(gateway, '/api/patients/me', { status: 401 });
  await request(gateway, '/api/patients/me', { token: token.slice(0, -8) + 'invalid0', status: 401 });
  checks.missingAndInvalidJwtRejected = true;
  const profile = await request(gateway, '/api/patients', { body: { fullName: 'Fictional Deployment Patient', email,
    phone: '9876543210', dateOfBirth: '1995-01-01', address: 'Fictional smoke address' }, token, status: 201 });
  assert.equal((await request(gateway, '/api/patients/me', { token })).id, profile.id); checks.profileOwnership = true;
  // A synthetic ADMIN JWT is signed only with the already-committed test key for isolated H2.
  const adminClaims = { sub: randomUUID(), iss: 'mediconnect-auth', aud: ['mediconnect-api'], roles: ['ADMIN'], exp: Math.floor(Date.now() / 1000) + 600 };
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encoded({ alg: 'RS256' })}.${encoded(adminClaims)}`;
  const key = createPrivateKey(await readFile(new URL('../backend/auth-service/src/test/resources/test-private.pem', import.meta.url)));
  const admin = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');
  const doctor = await request(gateway, '/api/doctors', { token: admin, status: 201, body: {
    name: 'Dr. Fictional Deployment', specialty: 'general', city: 'Rourkela', area: 'Demo', clinic: 'Fictional Clinic',
    qualifications: 'Test only', experienceYears: 5, feeInRupees: 500, languages: ['English'], about: 'Isolated H2 smoke fixture', color: 'sage' } });
  const search = await request(gateway, '/api/doctors?query=Fictional&city=Rourkela&specialty=general');
  assert.ok(search.items.some(d => d.id === doctor.id)); checks.doctorListingAndSearch = true;
  const startsAt = new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000).toISOString();
  const slot = await request(gateway, '/api/slots', { token: admin, body: { doctorId: doctor.id, startsAt }, status: 201 });
  const slotPath = '/api/slots?' + new URLSearchParams({ doctorId: doctor.id, from: new Date().toISOString(), to: new Date(Date.now() + 7 * 86400000).toISOString() });
  assert.ok((await request(gateway, slotPath)).items.some(s => s.id === slot.id)); checks.realAvailability = true;
  const booking = await request(gateway, '/api/appointments', { token, body: { slotId: slot.id, patientId: profile.id }, status: 201 });
  checks.bookingViaRealDirectoryServices = booking.status === 'BOOKED';
  await request(gateway, '/api/appointments', { token, body: { slotId: slot.id, patientId: profile.id }, status: 409 }); checks.duplicateBookingRejected = true;
  assert.ok((await request(gateway, '/api/appointments', { token })).items.some(a => a.id === booking.id)); checks.history = true;
  assert.ok(!(await request(gateway, slotPath)).items.some(s => s.id === slot.id)); checks.bookedSlotHidden = true;
  assert.equal((await request(gateway, `/api/appointments/${booking.id}/cancel`, { token, body: {} })).status, 'CANCELLED');
  assert.ok((await request(gateway, slotPath)).items.some(s => s.id === slot.id)); checks.cancellationAndSlotRelease = true;
  await request(gateway, '/api/appointments', { status: 401 }); checks.anonymousHistoryRejected = true;
  assert.ok(Object.values(checks).every(Boolean));
  console.log('All 15 isolated API checks passed.');
  let browser;
  if (process.env.SMOKE_PLAYWRIGHT_MODULE || process.env.SMOKE_CHROMIUM_PATH) {
    if (!process.env.SMOKE_PLAYWRIGHT_MODULE || !process.env.SMOKE_CHROMIUM_PATH) throw new Error('Supply both SMOKE_PLAYWRIGHT_MODULE and SMOKE_CHROMIUM_PATH.');
    const port = await freePort();
    const config = resolve(logDir, 'vite-preview.mjs');
    await writeFile(config, `export default ${JSON.stringify({ preview: { proxy: { '/api': { target: gateway, changeOrigin: true } } } })};`);
    const child = spawn(process.execPath, [resolve(root, 'frontend/node_modules/vite/bin/vite.js'), 'preview', '--config', config,
      '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: resolve(root, 'frontend'), windowsHide: true, stdio: 'ignore' });
    processes.push(child);
    const frontend = `http://127.0.0.1:${port}`;
    await writeFile(resolve(logDir, 'processes.json'), JSON.stringify(processes.map(child => ({ pid: child.pid })), null, 2));
    await waitFor(async () => (await fetch(frontend)).ok, 'production frontend preview');
    console.log('Checking the production bundle in Chromium.');
    browser = await (await import('./smoke-browser.mjs')).verifyBrowser(frontend, doctor.id, resolve(logDir, 'browser-diagnostic.json'));
  }
  await writeFile(resolve(logDir, 'result.json'), JSON.stringify({ database: 'isolated H2; not MySQL/TLS', renderProfile: true, checks, browser: browser ?? 'not requested', passed: true }, null, 2));
  console.log(JSON.stringify({ checks, browser: browser ?? 'not requested', passed: true }, null, 2));
} catch (error) {
  await writeFile(resultPath, JSON.stringify({ status: 'failed', checks, message: error.message, passed: false }, null, 2)).catch(() => {});
  console.error(error.message); process.exitCode = 1;
} finally {
  for (const child of processes) if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.all(processes.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(done => child.once('exit', done))));
  for (const stream of outputStreams) stream.end();
}
