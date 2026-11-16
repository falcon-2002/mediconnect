// Optional Chromium check against the production bundle and the isolated stack.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export async function verifyBrowser(origin, doctorId, diagnosticPath) {
  const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM_PATH, headless: true });
  const checks = {}, errors = [], foreignApiRequests = [], cacheablePrivateResponses = [];
  let apiRequests = 0;
  let stage = 'launch';
  const responses = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.name));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        apiRequests++;
        if (url.origin !== origin) foreignApiRequests.push(url.origin);
      }
    });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/')) responses.push({ path, status: response.status() });
      if (/^\/api\/(auth|patients|appointments)(\/|$)/.test(path) &&
          !response.headers()['cache-control']?.includes('no-store')) cacheablePrivateResponses.push(path);
    });
    const email = `browser-${randomUUID()}@example.test`, password = `Synthetic-${randomUUID()}`;
    async function login() {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/appointments*');
    }
    stage = 'registration'; await page.goto(origin + '/register');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.waitForURL('**/login?*'); checks.registration = true;
    stage = 'login'; await login(); checks.login = true;
    stage = 'profile setup';
    await page.getByRole('link', { name: 'My profile', exact: true }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Fictional Browser Patient');
    await page.getByLabel('Contact email', { exact: true }).fill(email);
    await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
    await page.getByLabel('Date of birth', { exact: true }).fill('1995-01-01');
    await page.getByLabel('Address', { exact: true }).fill('Fictional smoke address');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.waitForURL('**/appointments'); checks.profileSetup = true;
    // Use client navigation: a full page.goto intentionally clears the in-memory JWT.
    stage = 'availability';
    await page.getByRole('link', { name: 'Find a doctor', exact: true }).click();
    await page.locator(`a[href="/doctors/${doctorId}"]`).first().click();
    await page.locator('a.slot').first().waitFor(); checks.availability = true;
    await page.locator('a.slot').first().click();
    let posts = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/appointments') posts++; });
    stage = 'booking form';
    const confirm = page.getByRole('button', { name: /Confirm appointment/ });
    await confirm.waitFor();
    stage = 'booking submit';
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/appointments'),
      confirm.evaluate(button => { button.click(); button.click(); }),
    ]);
    assert.equal(response.status(), 201);
    const appointment = await response.json();
    await page.waitForURL('**/appointments?confirmed=*');
    await page.locator('article').filter({ hasText: appointment.id }).waitFor();
    assert.equal(posts, 1); checks.singleBookingPostAndHistory = true;
    stage = 'reload and re-login'; await page.reload(); await page.waitForURL('**/login?*');
    await login(); await page.locator('article').filter({ hasText: appointment.id }).waitFor(); checks.historyAfterRelogin = true;
    stage = 'cancellation'; const card = page.locator('article').filter({ hasText: appointment.id });
    await card.getByRole('button', { name: 'Cancel appointment', exact: true }).click();
    await card.getByRole('button', { name: 'Yes, cancel', exact: true }).click();
    await page.getByText('Appointment cancelled. The slot is available again.', { exact: true }).waitFor();
    await card.getByText('cancelled', { exact: true }).waitFor(); checks.cancellationHistory = true;
    stage = 'signout and public browsing'; await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.goto(origin + '/doctors'); await page.locator('.doctor-card').first().waitFor(); checks.publicAfterSignout = true;
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); checks.noPersistedSession = true;
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); checks.mobileNoOverflow = true;
    assert.deepEqual(errors, []); checks.noJavaScriptErrors = true;
    assert.ok(apiRequests > 0); assert.deepEqual(foreignApiRequests, []); checks.sameOriginApiRequests = true;
    assert.deepEqual(cacheablePrivateResponses, []); checks.privateResponsesNoStore = true;
    return { checks, passed: true };
  } catch {
    if (diagnosticPath) await writeFile(diagnosticPath, JSON.stringify({ stage, path: page ? new URL(page.url()).pathname : null,
      headings: page ? await page.getByRole('heading').allTextContents().catch(() => []) : [], responses, checks }, null, 2));
    throw new Error(`Isolated browser check failed at ${stage}; see the sanitized browser diagnostic.`);
  } finally { await browser.close(); }
}
