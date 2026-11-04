// Explicit local development tools. No dependencies, startup hooks, or SQL writes.
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const markerPrefix = 'mediconnect-local-seed:v1:';
const day = 86400000;
const ist = 19800000;
export const endpoints = {
  backend: { doctors: 'http://127.0.0.1:8083', slots: 'http://127.0.0.1:8084' },
  gateway: { doctors: 'http://127.0.0.1:8080', slots: 'http://127.0.0.1:8080' },
  proxy: { doctors: 'http://127.0.0.1:5173', slots: 'http://127.0.0.1:5173' },
};

export class ApiFailure extends Error {
  constructor(status, method, path, hint = '') {
    const hints = {
      0: 'Outcome unknown. Check saved records before another write.',
      400: 'Invalid request. For registration, check email and use a nonblank 12-72 character password of at most 72 UTF-8 bytes; omit role.',
      401: 'Login was rejected. Check the locally entered email/password.',
      403: 'This account is not authorized for the operation.',
      409: 'A record already exists or conflicts. Inspect it; do not create a replacement account.',
      429: 'Too many requests. Wait before trying again.',
    };
    super(`${method} ${path.split('?')[0]}: ${status || 'connection failed or timed out'}. ${hint || hints[status] || 'Unexpected service response; inspect service health and saved records.'} No write was retried.`);
    this.status = status;
  }
}

export function client(base, token, fetcher = fetch) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Use a local http://127.0.0.1:<port> origin.');
  return async (path, body, expectedStatus) => {
    const method = body === undefined ? 'GET' : 'POST';
    if (!path.startsWith('/api/') || /[\\\r\n]/.test(path)) throw new Error('Invalid API path.');
    let response;
    try {
      response = await fetcher(new URL(path, url), {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new ApiFailure(0, method, path); }
    if (!response.ok) throw new ApiFailure(response.status, method, path);
    if (expectedStatus !== undefined && response.status !== expectedStatus)
      throw new ApiFailure(response.status, method, path, `Expected HTTP ${expectedStatus}; success was not confirmed. Check records before retrying.`);
    try { return await response.json(); }
    catch { throw new ApiFailure(502, method, path); }
  };
}

export async function allPages(api, path) {
  const items = [];
  for (let page = 0; page < 1000; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}page=${page}&size=100`);
    if (!Array.isArray(result.items) || result.page !== page || !Number.isInteger(result.totalPages))
      throw new Error('Unexpected pagination response.');
    items.push(...result.items);
    if (page + 1 >= result.totalPages) return items;
  }
  throw new Error('Pagination limit reached; refusing an incomplete inventory.');
}

export function slotPath(doctorId, from, to) {
  return `/api/slots?${new URLSearchParams({ doctorId, from: from.toISOString(), to: to.toISOString() })}`;
}

export function seedPlan(catalog, now = new Date()) {
  const cities = [...new Set(catalog.cities)].sort();
  const specialties = Object.keys(catalog.specialties).sort();
  if (!cities.length || !specialties.length) throw new Error('The server catalog is empty.');
  const firstNames = ['Asha', 'Dev', 'Ira', 'Kabir', 'Leela', 'Nikhil'];
  const colors = ['sage', 'sand', 'rose', 'sky'];
  // Tomorrow through day six, 09:00 and 09:30 IST: safely inside the rolling seven-day window.
  const midnight = Math.floor((now.getTime() + ist) / day) * day - ist;
  const starts = Array.from({ length: 6 }, (_, i) => [9, 9.5].map(hour =>
    new Date(midnight + (i + 1) * day + hour * 3600000).toISOString())).flat();
  return cities.flatMap((city, c) => specialties.map((specialty, s) => {
    const key = `${markerPrefix}${encodeURIComponent(city)}:${encodeURIComponent(specialty)}`;
    return { key, starts, doctor: {
      name: `Dr. ${firstNames[s % firstNames.length]} Demo ${c + 1}-${s + 1}`,
      specialty, city, area: 'Demo Central', clinic: `Fictional ${city} Clinic`,
      qualifications: 'Fictional qualification for local testing', experienceYears: 5 + s + c,
      feeInRupees: 350 + 100 * s + 50 * c, languages: ['English', 'Hindi'],
      about: `Fictional local development profile. Not a real clinician. [${key}]`,
      color: colors[(c + s) % colors.length],
    } };
  }));
}

function hasMarker(doctor, key) { return doctor.about?.includes(`[${key}]`); }

export async function seed(api, { now = new Date(), manifest = {}, save = async () => {} } = {}) {
  const plan = seedPlan(await api('/api/doctors/catalog'), now);
  const inventory = await allPages(api, '/api/doctors?sort=name');
  const selected = new Map();
  // Resolve every identity before creating anything. Never merge same-name doctors.
  for (const entry of plan) {
    const matches = inventory.filter(d => hasMarker(d, entry.key));
    if (matches.length > 1) throw new Error(`Multiple seed identities for ${entry.key}; inspect IDs before continuing.`);
    let doctor = matches[0];
    if (manifest[entry.key]) {
      // A missing/deactivated/edited known doctor requires manual review, not a replacement UUID.
      doctor = await api(`/api/doctors/${encodeURIComponent(manifest[entry.key])}`);
      if (!hasMarker(doctor, entry.key) || (matches[0] && matches[0].id !== doctor.id))
        throw new Error(`Seed identity changed for ${entry.key}; existing references were preserved.`);
    }
    if (doctor && (doctor.city !== entry.doctor.city || doctor.specialty !== entry.doctor.specialty))
      throw new Error(`Seed catalog fields changed for ${entry.key}; inspect before continuing.`);
    selected.set(entry.key, doctor);
  }
  const counts = { doctorsCreated: 0, doctorsReused: 0, slotsCreated: 0, slotsReused: 0, slotConflicts: 0 };
  for (const entry of plan) {
    let doctor = selected.get(entry.key);
    if (!doctor) { doctor = await api('/api/doctors', entry.doctor); counts.doctorsCreated++; }
    else counts.doctorsReused++;
    manifest[entry.key] = doctor.id;
    await save(manifest); // Persist UUIDs after each doctor, before creating its slots.
    const available = await allPages(api, slotPath(doctor.id, now, new Date(now.getTime() + 7 * day)));
    const starts = new Set(available.map(s => Date.parse(s.startsAt)));
    for (const startsAt of entry.starts) {
      if (starts.has(Date.parse(startsAt))) { counts.slotsReused++; continue; }
      try { await api('/api/slots', { doctorId: doctor.id, startsAt }); counts.slotsCreated++; }
      catch (error) {
        // Public listing omits booked slots. The database's (doctor_id, starts_at) unique
        // constraint protects them. Leave any conflicting row untouched and report it.
        if (error instanceof ApiFailure && error.status === 409) counts.slotConflicts++;
        else throw error;
      }
    }
  }
  return { ...counts, plannedDoctors: plan.length, plannedSlots: plan.reduce((n, p) => n + p.starts.length, 0) };
}

export function repeatedDoctors(doctors) {
  const names = new Map(), ids = new Map();
  for (const d of doctors) {
    const key = d.name.trim().toLowerCase();
    names.set(key, [...(names.get(key) ?? []), { id: d.id, name: d.name, city: d.city, specialty: d.specialty, clinic: d.clinic }]);
    ids.set(d.id, (ids.get(d.id) ?? 0) + 1);
  }
  return { repeatedIds: [...ids].filter(([, count]) => count > 1),
    repeatedNames: [...names.values()].filter(group => group.length > 1) };
}

export async function inspect(routes = endpoints, now = new Date()) {
  const report = { from: now.toISOString(), to: new Date(now.getTime() + 7 * day).toISOString(), routes: {} };
  for (const [name, route] of Object.entries(routes)) {
    try {
      const doctors = await allPages(client(route.doctors), '/api/doctors?sort=name');
      const slots = [];
      for (const doctor of doctors) {
        const available = await allPages(client(route.slots), slotPath(doctor.id, now, new Date(report.to)));
        slots.push({ doctorId: doctor.id, name: doctor.name, slots: available });
      }
      report.routes[name] = { doctorCount: doctors.length, doctorIds: doctors.map(d => d.id),
        ...repeatedDoctors(doctors), availability: slots };
    } catch (error) { report.routes[name] = { error: error.message }; }
  }
  const results = Object.values(report.routes);
  const signatures = results.filter(r => !r.error).map(r => JSON.stringify({
    doctors: [...r.doctorIds].sort(),
    slots: r.availability.flatMap(d => d.slots.map(s => [s.id, s.doctorId, Date.parse(s.startsAt), s.booked])).sort(),
  }));
  report.routesAgree = results.every(r => !r.error) && new Set(signatures).size === 1;
  return report;
}

export async function verifyJourney(api, publicApi, now = new Date()) {
  const patient = await api('/api/patients/me');
  const doctors = await allPages(publicApi, '/api/doctors?sort=name');
  let slot;
  for (const doctor of doctors.filter(d => d.about?.includes(`[${markerPrefix}`))) {
    slot = (await allPages(publicApi, slotPath(doctor.id, now, new Date(now.getTime() + 7 * day))))
      .find(s => !s.booked && Date.parse(s.startsAt) > now.getTime() + 300000);
    if (slot) break;
  }
  if (!slot) throw new Error('No available seeded slot. Run seed first.');
  const body = { slotId: slot.id, patientId: patient.id };
  const booking = await api('/api/appointments', body);
  const checks = { bookingCreated: booking.status === 'BOOKED', duplicateRejected: false, historyVisible: false,
    bookedSlotHidden: false, cancelled: false, cancelledHistoryVisible: false, slotReleased: false };
  let unexpectedDuplicate;
  try {
    try { unexpectedDuplicate = await api('/api/appointments', body); }
    catch (error) { if (error instanceof ApiFailure && error.status === 409) checks.duplicateRejected = true; else throw error; }
    checks.historyVisible = (await allPages(api, '/api/appointments')).some(a => a.id === booking.id && a.status === 'BOOKED');
    checks.bookedSlotHidden = !(await allPages(publicApi, slotPath(slot.doctorId, now, new Date(now.getTime() + 7 * day)))).some(s => s.id === slot.id);
  } finally {
    // Cancel only the appointment just created by this invocation; retain its history.
    if (unexpectedDuplicate?.id && unexpectedDuplicate.id !== booking.id)
      await api(`/api/appointments/${unexpectedDuplicate.id}/cancel`, {});
    const cancelled = await api(`/api/appointments/${booking.id}/cancel`, {});
    checks.cancelled = cancelled.status === 'CANCELLED';
  }
  checks.cancelledHistoryVisible = (await allPages(api, '/api/appointments')).some(a => a.id === booking.id && a.status === 'CANCELLED');
  checks.slotReleased = (await allPages(publicApi, slotPath(slot.doctorId, now, new Date(now.getTime() + 7 * day)))).some(s => s.id === slot.id && !s.booked);
  return { appointmentId: booking.id, checks, passed: Object.values(checks).every(Boolean) };
}

export async function withSeedState(directory, run) {
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, 'seed.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch { throw new Error('Seed lock exists or is inaccessible. Do not run simultaneous seeds; see LOCAL_DATA.md.'); }
  try {
    await lock.writeFile(String(process.pid));
    const path = resolve(directory, 'doctors.json');
    let manifest = {};
    try { manifest = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Seed manifest is unreadable; preserve it and inspect before rerunning.'); }
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object' || Object.values(manifest).some(id => typeof id !== 'string'))
      throw new Error('Invalid seed manifest.');
    return await run(manifest, async value => {
      await open(resolve(directory, 'doctors.tmp'), 'w').then(async file => {
        try { await file.writeFile(JSON.stringify(value, null, 2)); } finally { await file.close(); }
      });
      await rename(resolve(directory, 'doctors.tmp'), path);
    });
  } finally { await lock.close(); await unlink(lockPath); }
}

export function promotionSql(account, expectedEmail) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(account.id) ||
      account.email !== expectedEmail || account.role !== 'PATIENT')
    throw new Error('Registration identity did not match the new account; no promotion SQL was generated.');
  // Hex literals avoid treating user-selected email text as SQL syntax.
  const id = account.id.replaceAll('-', '');
  const email = Buffer.from(account.email, 'utf8').toString('hex');
  const predicate = `id = UNHEX('${id}') AND BINARY email = 0x${email}`;
  return `-- Only the account returned by this successful new registration is eligible.
-- Run this complete transaction in your existing local MySQL Workbench connection.
-- The UUID/email predicates verify identity before the role update; no hash is selected.
START TRANSACTION;
SELECT BIN_TO_UUID(id) AS account_id, email, role
FROM mediconnect_auth.accounts WHERE ${predicate} FOR UPDATE;
UPDATE mediconnect_auth.accounts SET role = 'ADMIN'
WHERE ${predicate} AND role = 'PATIENT';
SELECT ROW_COUNT() AS promoted_accounts;
SELECT BIN_TO_UUID(id) AS account_id, email, role
FROM mediconnect_auth.accounts WHERE ${predicate};
COMMIT;
`;
}

export async function seedTwice(api, options) {
  const first = await seed(api, options);
  const afterFirst = await allPages(api, '/api/doctors?sort=name');
  const second = await seed(api, options);
  const afterSecond = await allPages(api, '/api/doctors?sort=name');
  const ids = list => list.map(d => d.id).sort().join(',');
  const unchanged = ids(afterFirst) === ids(afterSecond) && second.doctorsCreated === 0 && second.slotsCreated === 0;
  return { first, second, doctorIdsUnchanged: ids(afterFirst) === ids(afterSecond), passed: unchanged };
}

export async function readLocalInput(input) {
  // Decode across pipe chunk boundaries; Buffer.toString per chunk can corrupt UTF-8.
  input.setEncoding('utf8');
  let text = '';
  for await (const chunk of input) text += chunk;
  return JSON.parse(text);
}

export function validateRegistration(credentials) {
  const email = typeof credentials.email === 'string' ? credentials.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email))
    throw new Error('Registration email must be a valid nonblank address of at most 254 characters.');
  const password = credentials.password;
  if (typeof password !== 'string' || !password.trim() || password.length < 12 || password.length > 72 || Buffer.byteLength(password, 'utf8') > 72)
    throw new Error('Registration password must be nonblank, 12-72 characters, and at most 72 UTF-8 bytes. No request was sent.');
  return email;
}

export async function registerAdmin(api, credentials, { directory, absenceConfirmed = false }) {
  let lock, phase = 'preflight';
  const journal = resolve(directory, 'registration-result.json');
  try {
    if (absenceConfirmed !== true)
      throw new Error('First verify zero rows for the exact chosen email in mediconnect_auth.accounts; then use -AccountAbsenceConfirmed. No request was sent.');
    const email = validateRegistration(credentials);
    await mkdir(directory, { recursive: true });
    lock = await open(resolve(directory, 'registration.lock'), 'wx');
    const receiptPath = resolve(directory, 'new-account.json');
    let existing;
    try { existing = await readFile(receiptPath, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing !== undefined && existing.length !== 0)
      throw new Error('A nonempty registration receipt already exists. Preserve that account and resume promotion/seeding; no request was sent.');
    try {
      await readFile(resolve(directory, 'promote-new-account.sql'));
      throw new Error('Promotion SQL already exists. Inspect the existing identity; no request was sent.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Preserve the legacy empty placeholder after the explicit fresh database check.
    if (existing === '') await rename(receiptPath, resolve(directory, `empty-receipt-${randomUUID()}.json`));
    phase = 'request';
    await writeFile(journal, JSON.stringify({ status: 'request_pending', at: new Date().toISOString() }, null, 2));
    const response = await api('/api/auth/register', { email, password: credentials.password }, 201);
    credentials.password = '';
    phase = 'response';
    // Only allowlisted identity fields can enter artifacts, even if a server returns extras.
    const account = { id: response?.id, email: response?.email, role: response?.role };
    const sql = promotionSql(account, email);
    phase = 'save';
    await writeFile(receiptPath, JSON.stringify(account, null, 2), { flag: 'wx' });
    await writeFile(resolve(directory, 'promote-new-account.sql'), sql, { flag: 'wx' });
    await writeFile(journal, JSON.stringify({ status: 'confirmed', httpStatus: 201, artifactsSaved: true, at: new Date().toISOString() }, null, 2));
    return account;
  } catch (error) {
    if (lock && phase !== 'preflight') {
      const message = error instanceof ApiFailure ? error.message :
        phase === 'response' ? 'Response identity was invalid. Check the database before another registration.' :
        phase === 'save' ? 'Registration was confirmed but artifacts could not all be saved. Preserve the account; do not register again.' :
        'Registration outcome is unknown. Check the database before another write.';
      await writeFile(journal, JSON.stringify({ status: phase === 'save' ? 'confirmed_artifact_error' : 'not_confirmed',
        phase, httpStatus: error instanceof ApiFailure ? error.status : null, message, at: new Date().toISOString() }, null, 2));
      throw new Error(message);
    }
    throw error;
  } finally {
    credentials.password = '';
    if (lock) { await lock.close(); await unlink(resolve(directory, 'registration.lock')); }
  }
}

async function main() {
  const mode = process.argv[2];
  if (!['inspect', 'registeradmin', 'seed', 'seedtwice', 'verify'].includes(mode)) throw new Error('Use local-data.ps1 -Mode Inspect, RegisterAdmin, Seed, SeedTwice, or Verify.');
  if (mode === 'inspect') {
    const report = await inspect();
    console.log(JSON.stringify(report, null, 2));
    if (!report.routesAgree) process.exitCode = 1;
    return;
  }
  // Credentials arrive only over the wrapper's stdin pipe; never arguments, files, or logs.
  const credentials = await readLocalInput(process.stdin);
  if (mode === 'registeradmin') {
    const directory = fileURLToPath(new URL('../../logs/local-admin-setup/', import.meta.url));
    const account = await registerAdmin(client(endpoints.gateway.doctors), credentials, {
      directory, absenceConfirmed: credentials.accountAbsenceConfirmed,
    });
    console.log(JSON.stringify({ account, next: 'Run logs/local-admin-setup/promote-new-account.sql in local MySQL Workbench, then use -Mode SeedTwice. Password was not saved.' }, null, 2));
    return;
  }
  const login = await client(endpoints.gateway.doctors)('/api/auth/login', { email: credentials.email, password: credentials.password });
  credentials.password = '';
  const role = mode === 'seed' || mode === 'seedtwice' ? 'ADMIN' : 'PATIENT';
  const claims = JSON.parse(Buffer.from(login.accessToken.split('.')[1], 'base64url').toString());
  if (!claims.roles?.includes(role)) throw new Error(`This command requires an existing ${role} account. No roles were changed.`);
  // Role decoding is a convenience check only. Every write is authorized by Spring.
  const api = client(endpoints.gateway.doctors, login.accessToken);
  if (mode === 'seed' || mode === 'seedtwice') {
    const directory = fileURLToPath(new URL('../../logs/local-seed/', import.meta.url));
    const now = new Date(); // Both runs use one fixed schedule, even across IST midnight.
    const result = await withSeedState(directory, (manifest, save) =>
      mode === 'seedtwice' ? seedTwice(api, { manifest, save, now }) : seed(api, { manifest, save, now }));
    await writeFile(resolve(directory, 'last-run.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (mode === 'seedtwice' && !result.passed) process.exitCode = 1;
  } else {
    // Exercise the patient's real journey through the actual frontend proxy.
    const result = await verifyJourney(client(endpoints.proxy.doctors, login.accessToken), client(endpoints.proxy.doctors));
    const directory = fileURLToPath(new URL('../../logs/local-seed/', import.meta.url));
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'last-verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Do not dump objects, response bodies, headers, or credential-bearing stack traces.
    console.error(error instanceof ApiFailure ? error.message :
      error instanceof SyntaxError ? 'Invalid local input or server response.' : error.message);
    process.exitCode = 1;
  });
}
