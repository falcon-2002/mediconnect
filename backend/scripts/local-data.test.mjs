import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ApiFailure, client, seedPlan, seed, seedTwice, promotionSql, readLocalInput, allPages, repeatedDoctors, inspect, verifyJourney, withSeedState } from './local-data.mjs';

test('stdin preserves Unicode even when each UTF-8 byte arrives in a separate chunk', async () => {
  const expected = { email: 'fixture@example.test', password: 'Synthetic-Caf\u00e9-\u0939\u093f\u0902\u0926\u0940-\u{1fa7a}' };
  const bytes = Buffer.from(JSON.stringify(expected), 'utf8');
  const input = Readable.from([...bytes].map(byte => Buffer.from([byte])));
  assert.deepEqual(await readLocalInput(input), expected);
});

const now = new Date('2026-11-03T18:29:59.000Z'); // Just before IST midnight.
const catalog = { cities: ['Rourkela', 'Bengaluru', 'Bhubaneswar'], specialties:
  { general: 'General physician', dental: 'Dentist', skin: 'Dermatologist', pediatric: 'Pediatrician', gynecology: 'Gynecologist', ent: 'ENT specialist' } };

test('promotion SQL targets only the returned new UUID and exact email without selecting hashes', () => {
  const account = { id: '12345678-1234-1234-1234-123456789012', email: "new'admin@example.test", role: 'PATIENT' };
  const sql = promotionSql(account, account.email);
  assert.match(sql, /WHERE id = UNHEX\('12345678123412341234123456789012'\) AND BINARY email = 0x[0-9a-f]+ AND role = 'PATIENT'/);
  assert.ok(!sql.includes(account.email));
  assert.ok(!sql.includes('password_hash'));
  assert.match(sql, /FOR UPDATE/);
  assert.throws(() => promotionSql({ ...account, id: "bad-id" }, account.email), /identity/);
  assert.throws(() => promotionSql(account, 'different@example.test'), /identity/);
  assert.throws(() => promotionSql({ ...account, role: 'ADMIN' }, account.email), /identity/);
});

function fixture() {
  const doctors = [{ id: 'existing', name: 'Dr. Priya Sen', about: 'Existing profile', city: 'Rourkela', specialty: 'general' }];
  const slots = [], appointments = [], calls = [];
  let failDoctorAfterCommit = false;
  const api = async (path, body) => {
    calls.push({ path, body });
    const url = new URL(path, 'http://127.0.0.1');
    const page = items => {
      const index = Number(url.searchParams.get('page') || 0), size = Number(url.searchParams.get('size') || 100);
      return { items: items.slice(index * size, (index + 1) * size), page: index, totalPages: Math.ceil(items.length / size), totalItems: items.length, size };
    };
    if (url.pathname === '/api/doctors/catalog') return catalog;
    if (url.pathname === '/api/doctors' && body) {
      const doctor = { ...body, id: `doctor-${doctors.length}` };
      doctors.push(doctor);
      if (failDoctorAfterCommit) { failDoctorAfterCommit = false; throw new ApiFailure(0, 'POST', path); }
      return doctor;
    }
    if (url.pathname === '/api/doctors') return page(doctors);
    if (url.pathname.startsWith('/api/doctors/')) {
      const found = doctors.find(d => d.id === url.pathname.split('/').at(-1));
      if (!found) throw new ApiFailure(404, 'GET', path);
      return found;
    }
    if (url.pathname === '/api/slots' && body) {
      if (slots.some(s => s.doctorId === body.doctorId && s.startsAt === body.startsAt)) throw new ApiFailure(409, 'POST', path);
      const slot = { ...body, id: `slot-${slots.length}`, booked: false };
      slots.push(slot); return slot;
    }
    if (url.pathname === '/api/slots') return page(slots.filter(s => s.doctorId === url.searchParams.get('doctorId') && !s.booked &&
      Date.parse(s.startsAt) >= Date.parse(url.searchParams.get('from')) && Date.parse(s.startsAt) < Date.parse(url.searchParams.get('to'))));
    if (url.pathname === '/api/patients/me') return { id: 'fictional-patient' };
    if (url.pathname === '/api/appointments' && body) {
      const slot = slots.find(s => s.id === body.slotId);
      if (slot.booked) throw new ApiFailure(409, 'POST', path);
      slot.booked = true;
      const appointment = { ...body, id: `appointment-${appointments.length}`, status: 'BOOKED' };
      appointments.push(appointment); return { ...appointment };
    }
    if (url.pathname === '/api/appointments') return page(appointments.map(a => ({ ...a })));
    if (url.pathname.endsWith('/cancel')) {
      const appointment = appointments.find(a => a.id === url.pathname.split('/')[3]);
      appointment.status = 'CANCELLED';
      slots.find(s => s.id === appointment.slotId).booked = false;
      return { ...appointment };
    }
    throw new Error(`Unexpected fixture path: ${path}`);
  };
  return { api, doctors, slots, appointments, calls, failNextDoctor: () => { failDoctorAfterCommit = true; } };
}

test('catalog coverage and UTC half-hour slots stay inside seven days across IST midnight', () => {
  for (const instant of [now, new Date('2026-11-03T18:30:00Z'), new Date('2026-12-31T23:59:59Z')]) {
    const plan = seedPlan(catalog, instant);
    assert.equal(plan.length, 18);
    assert.equal(new Set(plan.map(p => p.key)).size, 18);
    assert.equal(new Set(plan.map(p => p.doctor.name)).size, 18);
    for (const entry of plan) for (const start of entry.starts) {
      const time = Date.parse(start);
      assert.ok(time > instant.getTime() && time < instant.getTime() + 7 * 86400000);
      assert.equal(time % 1800000, 0);
      assert.match(new Date(time + 19800000).toISOString(), /T09:(00|30):00/);
    }
    assert.equal(plan.flatMap(p => p.starts).length, 216);
  }
});

test('first seed creates 18 doctors/216 slots; repeat preserves existing and booked records', async () => {
  const f = fixture(), manifest = {};
  const original = structuredClone(f.doctors[0]);
  assert.deepEqual(await seed(f.api, { now, manifest }), { doctorsCreated: 18, doctorsReused: 0, slotsCreated: 216, slotsReused: 0, slotConflicts: 0, plannedDoctors: 18, plannedSlots: 216 });
  f.slots[0].booked = true;
  assert.deepEqual(await seed(f.api, { now, manifest }), { doctorsCreated: 0, doctorsReused: 18, slotsCreated: 0, slotsReused: 215, slotConflicts: 1, plannedDoctors: 18, plannedSlots: 216 });
  assert.deepEqual(f.doctors[0], original);
  assert.equal(f.slots.length, 216);
  assert.equal(f.slots[0].booked, true);
  assert.equal(f.appointments.length, 0);
});

test('two-run workflow verifies zero duplicate writes and unchanged doctor UUIDs', async () => {
  const f = fixture();
  const result = await seedTwice(f.api, { now, manifest: {} });
  assert.equal(result.first.doctorsCreated, 18);
  assert.equal(result.first.slotsCreated, 216);
  assert.equal(result.second.doctorsCreated, 0);
  assert.equal(result.second.slotsCreated, 0);
  assert.equal(result.passed, true);
  assert.equal(f.slots.length, 216);
});

test('next-day seed adds only the new day; it does not replace old slots or doctor IDs', async () => {
  const f = fixture(), manifest = {};
  await seed(f.api, { now, manifest });
  const oldIds = f.slots.map(s => s.id);
  const result = await seed(f.api, { now: new Date(now.getTime() + 86400000), manifest });
  assert.equal(result.doctorsCreated, 0);
  assert.equal(result.slotsCreated, 36);
  assert.equal(result.slotsReused, 180);
  assert.deepEqual(f.slots.slice(0, 216).map(s => s.id), oldIds);
});

test('uncertain doctor POST is not retried; rerun recovers its marker without duplication', async () => {
  const f = fixture();
  f.failNextDoctor();
  await assert.rejects(seed(f.api, { now }), { status: 0 });
  assert.equal(f.doctors.length, 2);
  const result = await seed(f.api, { now });
  assert.equal(result.doctorsCreated, 17);
  assert.equal(result.doctorsReused, 1);
  assert.equal(f.doctors.length, 19);
});

test('duplicate markers and deactivated known identities stop before any write', async () => {
  const f = fixture();
  const entry = seedPlan(catalog, now)[0];
  f.doctors.push({ ...entry.doctor, id: 'one' }, { ...entry.doctor, id: 'two' });
  await assert.rejects(seed(f.api, { now }), /Multiple seed identities/);
  assert.equal(f.calls.filter(c => c.body).length, 0);
  f.doctors.splice(1);
  await assert.rejects(seed(f.api, { now, manifest: { [entry.key]: 'deactivated' } }), { status: 404 });
  assert.equal(f.calls.filter(c => c.body).length, 0);
});

test('inventory traverses pages and distinguishes same-name rows from repeated IDs', async () => {
  const f = fixture();
  f.doctors.push(...Array.from({ length: 104 }, (_, i) => ({ ...f.doctors[0], id: `copy-${i}` })));
  const inventory = await allPages(f.api, '/api/doctors?sort=name');
  assert.equal(inventory.length, 105);
  assert.deepEqual(repeatedDoctors(inventory).repeatedIds, []);
  assert.equal(repeatedDoctors(inventory).repeatedNames[0].length, 105);
  assert.deepEqual(repeatedDoctors([...inventory, inventory[0]]).repeatedIds, [['existing', 2]]);
});

test('journey verifies booking/conflict/history/cancellation without changing pre-existing appointments', async () => {
  const f = fixture();
  await seed(f.api, { now });
  f.appointments.push({ id: 'existing-appointment', status: 'BOOKED', slotId: 'unrelated-slot' });
  const result = await verifyJourney(f.api, f.api, now);
  assert.equal(result.passed, true);
  assert.equal(f.appointments[0].status, 'BOOKED');
  assert.equal(f.appointments[1].status, 'CANCELLED');
  assert.equal(f.slots[0].booked, false);
});

test('journey cancels its new booking if a later history read fails', async () => {
  const f = fixture();
  await seed(f.api, { now });
  const api = (path, body) => path.startsWith('/api/appointments?') ? Promise.reject(new ApiFailure(503, 'GET', path)) : f.api(path, body);
  await assert.rejects(verifyJourney(api, f.api, now), { status: 503 });
  assert.equal(f.appointments[0].status, 'CANCELLED');
  assert.equal(f.slots[0].booked, false);
});

test('manifest survives reruns and an exclusive lock prevents overlapping seeds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mediconnect-seed-test-'));
  try {
    await withSeedState(directory, async (manifest, save) => {
      await assert.rejects(withSeedState(directory, () => {}), /Seed lock/);
      manifest.key = 'doctor-id'; await save(manifest);
    });
    await withSeedState(directory, async manifest => assert.equal(manifest.key, 'doctor-id'));
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'doctors.json'), 'utf8')), { key: 'doctor-id' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('HTTP client hides server error bodies, rejects remote origins and never retries writes', async () => {
  assert.throws(() => client('https://example.com'), /local/);
  let calls = 0;
  const api = client('http://127.0.0.1:8080', 'test-token', async () => { calls++; return new Response('sensitive response', { status: 403 }); });
  await assert.rejects(api('/api/doctors', {}), error => error.status === 403 && !error.message.includes('sensitive'));
  assert.equal(calls, 1);
});

test('inspect compares real HTTP responses across routes and reports outages without inventing availability', async () => {
  const f = fixture();
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(await f.api(request.url)));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const route = { doctors: origin, slots: origin };
    const result = await inspect({ backend: route, gateway: route, proxy: route }, now);
    assert.equal(result.routesAgree, true);
    assert.equal(result.routes.proxy.availability[0].slots.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
  const result = await inspect({ offline: { doctors: origin, slots: origin } }, now);
  assert.equal(result.routesAgree, false);
  assert.match(result.routes.offline.error, /connection failed/);
});
