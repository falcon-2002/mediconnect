import assert from 'node:assert/strict';
import { randomUUID, sign } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// The caller owns the isolated loopback endpoint and its freshly generated signing key.
export async function standaloneJourney(request, privateKey, duration = 60) {
  assert.ok(Number.isInteger(duration) && duration >= 10 && duration <= 600);
  const checks = {};
  const catalog = await request('/api/doctors/catalog');
  assert.equal(catalog.cities.length, 3); assert.equal(Object.keys(catalog.specialties).length, 6);
  checks.originalCatalog = true;
  const password = `Synthetic-${randomUUID()}`;
  const email = `standalone-${randomUUID()}@example.test`;
  const account = await request('/api/auth/register', { body: { email, password }, status: 201 });
  assert.equal(account.role, 'PATIENT');
  await request('/api/auth/register', { body: { email: `forbidden-${email}`, password, role: 'ADMIN' }, status: 400 });
  const login = await request('/api/auth/login', { body: { email, password } });
  const token = login.accessToken;
  const patient = await request('/api/patients', { token, status: 201, body: { fullName: 'Fictional Patient', email,
    phone: '9876543210', dateOfBirth: '1995-09-09', address: 'Fictional address, Rourkela' } });
  await request('/api/patients/me', { token });
  checks.registrationLoginAndProfile = true;
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  const encoded = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: 'mediconnect-auth', sub: randomUUID(),
    aud: ['mediconnect-api'], iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900, roles: ['ADMIN'] })}`;
  const admin = `${encoded}.${sign('RSA-SHA256', Buffer.from(encoded), privateKey).toString('base64url')}`;
  const doctorBody = { name: 'Dr. Fictional Demo', specialty: 'general', city: 'Rourkela', area: 'Demo area',
    clinic: 'Fictional clinic', qualifications: 'MBBS', experienceYears: 5, feeInRupees: 250,
    languages: ['English', 'Hindi'], about: 'Fictional test doctor', color: 'sky' };
  const doctor = await request('/api/doctors', { token: admin, body: doctorBody, status: 201 });
  await request(`/api/doctors/${doctor.id}`, { method: 'PUT', token: admin, body: { ...doctorBody, languages: ['English'], version: doctor.version } });
  await request('/api/doctors?city=Rourkela&specialty=general&sort=fee');
  checks.doctorSearchAndUpdate = true;
  const startsAt = new Date((Math.floor(Date.now() / 1800000) + 48) * 1800000).toISOString();
  const slot = await request('/api/slots', { token: admin, body: { doctorId: doctor.id, startsAt }, status: 201 });
  const booking = { patientId: patient.id, slotId: slot.id };
  const results = await Promise.all(Array.from({ length: 8 }, () => request('/api/appointments', { token, body: booking, status: null })));
  const winner = results.find(result => typeof result === 'object');
  assert.ok(winner); assert.equal(results.filter(result => result === 409).length, 7);
  await request('/api/appointments', { token, body: booking, status: 409 });
  const again = await request('/api/auth/login', { body: { email, password } });
  const history = await request('/api/appointments', { token: again.accessToken });
  assert.equal(history.items[0].id, winner.id);
  const cancelled = await request(`/api/appointments/${winner.id}/cancel`, { method: 'POST', token });
  assert.equal(cancelled.status, 'CANCELLED');
  await request(`/api/appointments/${winner.id}/cancel`, { method: 'POST', token });
  assert.equal((await request(`/api/slots/${slot.id}`)).booked, false);
  checks.bookingConcurrencyHistoryAndCancellation = true;
  await request('/api/patients/me', { status: 401 });
  await request('/api/appointments', { token: 'invalid.signature.token', status: 401 });
  await request('/api/patients', { token, status: 403 });
  await request('/api/doctors');
  checks.securityAndPublicBrowsing = true;
  const until = Date.now() + duration * 1000;
  let loadRequests = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (Date.now() < until) {
      await request(`/api/doctors?city=Rourkela&specialty=general&page=0&size=20`);
      await request('/api/appointments', { token });
      loadRequests += 2;
      await delay(40);
    }
  }));
  checks.sustainedConcurrentReads = true;
  return { checks, loadRequests };
}
