# Phase 6 local data investigation and seed tools

These commands are explicitly invoked development tools, separate from `start-all.ps1`, Vite, Spring startup, and Flyway. They use the existing HTTP APIs and require Node 22.12+ already used by the frontend. They do not change schemas, roles, passwords, existing doctors, patients, or appointments. Use fictional information.

## Inspect before changing data

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\local-data.ps1 -Mode Inspect
```

This anonymous, read-only command enumerates all doctor pages and all available slot pages for each doctor over one fixed seven-day UTC window. It checks direct services (8083/8084), gateway (8080), and frontend proxy (5173). Output includes doctor UUIDs, repeated IDs versus repeated names, availability, and whether all routes agree. Exit code 1 means an endpoint failed or the snapshots differed; concurrent bookings can also change snapshots between requests. Errors never become an empty successful result. No patient information or credentials are printed.

The public slot API deliberately hides expired and booked slots. To distinguish missing, expired, booked, later, or orphaned slot data, run [inspect-local-data.sql](../scripts/inspect-local-data.sql) in your existing local MySQL Workbench connection with read access to the doctor and appointment schemas. It contains only SELECT statements, including each Priya UUID, UTC timestamps, availability counts, and appointment-reference counts. Compare those UUIDs with Inspect's output. Never delete or merge doctors solely because their names match.

## Seed fictional doctors and future slots

Start the usual services using their existing secure prompts. Use an existing local ADMIN account; registration remains PATIENT-only. Seed mode never creates or promotes accounts.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\local-data.ps1 -Mode Seed
```

Enter the ADMIN email and password in the local prompts. The password is masked, sent to the Node child over stdin, and then used for the existing `/api/auth/login` endpoint. Neither the password nor token is placed in arguments, files, reports, or browser storage. The wrapper does not launch a visible child window.

The wrapper supports Windows PowerShell 5.1. When `ProcessStartInfo.StandardInputEncoding` exists, it sets BOM-free UTF-8 before starting Node. On .NET Framework, where that property is absent, an explicit UTF-8 `StreamWriter` writes to the redirected stdin base stream instead of using the default Windows code page. Disposing the writer flushes input and sends EOF. Node uses a streaming UTF-8 decoder so split multi-byte characters survive pipe chunk boundaries. The credential transport never uses shell interpolation or password arguments.

The reported `StandardInputEncoding` failure happened before `Process.Start`; that invocation could not register, log in, seed, or modify an account. A subsequent attempt left an empty placeholder, whose contents could not establish whether registration committed. The original terminal error was unavailable. Follow the fresh database check and controlled retry below; never infer success from an empty file.

If you do not know which account is ADMIN, run [inspect-local-admins.sql](../scripts/inspect-local-admins.sql) in the existing local Workbench connection. It selects only UUID, email, and role for ADMIN rows; it never selects password hashes or changes roles. An application ADMIN email/password is different from a MySQL username/password. Use an existing listed account only if you know its application password; there is no documented default ADMIN password or password-reset API.

If no usable ADMIN exists, [Phase 3's local bootstrap](PHASE_3.md) documents registering a **separate, deliberately chosen** development account, checking its exact UUID, and having the local database administrator promote only that account before logging in again. This is an explicit manual setup step; the seed tool never performs it. Review the chosen new account and requested role change before proceeding. Do not promote an arbitrary patient, expose ADMIN registration publicly, reset an existing password, or recreate the auth database.

For the dedicated local account setup approved in this investigation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\local-data.ps1 -Mode RegisterAdmin -AccountAbsenceConfirmed
```

Before using the flag, repeat the read-only Workbench lookup for the exact chosen email in `mediconnect_auth.accounts` and verify zero rows. The flag records your confirmation; it is not an automated database lookup. Use the same chosen email for the controlled retry and enter your own password locally (nonblank, 12–72 characters, at most 72 UTF-8 bytes). Local checks reject invalid input before any request; server validation remains authoritative. This registers through the unchanged public API and returns PATIENT. It does not request ADMIN at registration. A 409 never causes an existing account to be adopted or promoted. Only HTTP 201 followed by a valid UUID, exact normalized email, and PATIENT role can produce the receipt and promotion SQL.

The ignored `logs/local-admin-setup/new-account.json` receipt contains only UUID/email/role. Open `logs/local-admin-setup/promote-new-account.sql` in the existing local Workbench connection. Execute `START TRANSACTION` and its first `SELECT ... FOR UPDATE`; compare that UUID and email with the receipt. If they match, execute the remaining statements through `COMMIT`. If they do not, execute `ROLLBACK` and investigate. The UPDATE itself also requires the exact UUID, byte-exact email, and original PATIENT role. Expected: one affected row and ADMIN in the final SELECT. No existing account is eligible; password hashes are neither selected nor changed. A repeat of that exact transaction changes zero rows after successful promotion.

The corrected helper uses a separate exclusive `registration.lock`, never an empty success receipt, while making one registration attempt. It preserves any nonempty receipt or existing promotion SQL and refuses another POST. After the fresh zero-row check, a legacy empty receipt is archived as `empty-receipt-<uuid>.json`; it is not discarded. Receipt and promotion SQL are written only after confirmed success. No existing account is modified by the helper.

Request status and a sanitized explanation are saved in `logs/local-admin-setup/registration-result.json`. This diagnostic contains no email, password, token, hash, request body, or raw server response. HTTP 400 explains validation requirements; 409 directs you to inspect the existing account; network/timeouts and unexpected responses are explicitly unconfirmed. No request is automatically retried. If success is confirmed but artifact saving fails, preserve that account and any receipt; do not register again. If a process is forcibly stopped, inspect the lock and database state before removing only a stale lock. A timeout or a leftover `request_pending` diagnostic requires another database lookup before any new attempt.

After promotion, this command logs in afresh with the locally entered password and executes both seed passes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\local-data.ps1 -Mode SeedTwice
```

Both passes use one fixed schedule so crossing midnight cannot change the plan between runs. The report requires zero doctor/slot creates on the second pass and unchanged doctor UUIDs. Counts and the pass/fail result are saved in ignored `logs/local-seed/last-run.json`; no credentials are saved. The existing slot uniqueness constraint prevents duplicate times, including booked slots.

The tool reads `/api/doctors/catalog`, then creates one clearly fictional profile per configured city/specialty pair. With the current three cities and six specialties, the plan is **18 doctors and 216 slots**. Names differ across all 18 profiles. Each doctor receives 09:00 and 09:30 IST slots tomorrow through day six. Those instants are UTC half-hour boundaries inside the frontend's next-seven-day window, including near IST midnight. Slot POSTs go through the ADMIN API and persist in the existing appointment database; the frontend generates no availability.

Repeat the same command to verify idempotency. An unchanged same-day rerun should create **zero doctors and zero slots**, reusing the existing rows. A later day's run adds only missing future times; expired slots and appointment history remain intact. The summary reports created/reused doctors, created/reused slots, and slot conflicts separately. A 409 slot conflict can be an existing booked slot hidden from public listing; the tool leaves the row alone rather than cancelling or replacing it.

Identity and restart behavior:

- Stable markers in each seeded doctor's `about` field allow recovery after an interrupted create. Names alone never identify records. Existing unmarked doctors are untouched.
- UUIDs are also saved in ignored `logs/local-seed/doctors.json`. Keep this manifest. If a known doctor is deactivated, missing, or has a changed marker/catalog identity, the command stops for review instead of replacing its UUID. Multiple matching markers also stop the run before writes.
- `logs/local-seed/seed.lock` excludes concurrent runs from this checkout. Do not seed the same database from multiple checkouts/machines simultaneously: the existing doctor API has no unique seed-key constraint. If a process is forcibly terminated, confirm that its recorded PID is no longer a seed process before removing **only** that stale lock. Preserve the manifest.
- There are no automatic write retries. A failed run may have partly committed; rerun to reconcile existing markers and slot uniqueness. If the response to a doctor POST was lost, its marker recovers it on the next run. Losing the manifest and also editing/deactivating a marker requires manual review.
- No startup files, database migrations, runtime frontend modules, or dependencies are changed by seeding. The tool does not deduplicate earlier manual test records.

## Verify the live patient journey

Use a fictional PATIENT account that already has a patient profile, created through the normal frontend. The verifier logs in using secure local prompts, then sends all journey requests through Vite's real `/api` proxy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\local-data.ps1 -Mode Verify
```

It selects a future **seeded** slot, books it, requires 409 on a second booking attempt, checks appointment history and absence from available slots, cancels only the booking it created, then checks cancelled history and restored availability. A successful run intentionally leaves one cancelled test appointment in history. It never cancels a pre-existing booking. A known newly created booking is cancelled in `finally` if an intermediate check fails. If the first booking POST times out, or cancellation itself fails, check My appointments before rerunning; the script never blindly retries a write. Exit code 1 means a check failed or a request could not be confirmed.

Successful verifier output is also saved in ignored `logs/local-seed/last-verification.json`, containing only the new appointment ID and check results.

After seeding, rerun Inspect to compare real availability through all three routes. Browser checks remain separate from this API verifier: select a seeded doctor, book through the form, reload/re-login to check persistence, cancel, and verify sign-out keeps public doctor cards visible. No passwords or tokens should appear in shared output.

## Automated tool tests

```powershell
node --test .\backend\scripts\local-data.test.mjs
node --test .\backend\scripts\local-data-powershell.test.mjs
node --test .\backend\scripts\local-registration.test.mjs
```

These tests use controlled in-memory API fixtures and an ephemeral HTTP server, not the user's MySQL database. They cover catalog coverage, IST boundaries, same-day/next-day reruns, preservation of booked slots and existing profiles, uncertain doctor POST recovery, identity conflicts, pagination, booking/cancellation verification, error cleanup, lock/manifest behavior, and safe HTTP errors. Frontend regression tests separately cover same-name UUID links, true empty availability, UTC filtering, and public browsing after sign-out.

PowerShell compatibility regression results, 4 November 2026: **15 tests passed, zero failures, one skipped** across both tool test files. The actual Windows PowerShell 5.1 wrapper was exercised with synthetic Unicode credentials and an isolated Node child that makes no network requests. The test checks UTF-8 without a BOM, JSON equality, EOF, no credential arguments, and no credential output. PowerShell 7 was not installed, so its test was explicitly skipped. A separate test delivers every UTF-8 byte in its own chunk to verify Node's streaming decoder.

After the controlled-registration fix, **24 tests passed, zero failures, one skipped** across all three tool test files. Additional checks cover the fresh-absence requirement, password character/byte limits, exactly one request on 400/409/503/network failures, sanitized diagnostics, no success artifacts on failure, required HTTP 201, rejection of mismatched identities, preserving existing receipts, archiving legacy empty placeholders, and excluding unexpected response fields from artifacts. These tests made no requests to the real Auth API and created no live accounts.

## Investigation evidence — 3 November 2026

Before seeding, direct services, gateway, and frontend proxy all returned the same **six active doctor UUIDs**, with **zero repeated UUIDs** and **zero available slots for every doctor** in the seven-day window.

Four separate records were named `Dr. Priya Sen`, all reporting Rourkela/general/Heart Care Clinic:

| Doctor UUID | Observed in |
| --- | --- |
| `0bfc9665-7597-4d53-84fc-4d84139f5f48` | Direct API, gateway, frontend proxy |
| `66982c5e-9663-4367-82ad-16587ad66f6e` | Direct API, gateway, frontend proxy |
| `b2a9d037-2e15-4204-a8ee-acc79cde7d6d` | Direct API, gateway, frontend proxy |
| `b5b3a241-c1dc-4eec-ac44-e82700ea8a33` | Direct API, gateway, frontend proxy |

The repeated name originates in the API data. The controller reads active persisted doctor entities; the schema does not make doctor names unique. The frontend maps each item once with `key={doctor.id}`, and server ordering includes UUID as a pagination tie-breaker. No render-time deduplication, renaming, deletion, or reassignment was applied. The historical operation that created these records cannot be inferred from their names alone.

The empty state agrees with all three live API routes. Requests use the profile's UUID and ISO UTC instants, while display/grouping uses Asia/Kolkata. No timezone/proxy/rendering defect has been established. Direct SQL results are needed to distinguish absent slot rows from expired/booked/out-of-window rows; do not call the data expired without that evidence.

The subsequent live seed counts and authenticated patient journey are recorded below.

### Live seed verification — 4 November 2026

The dedicated account was successfully registered and its exact UUID/email matched the receipt and the Workbench row before its approved promotion. The locally executed `SeedTwice` report now confirms:

| Pass | Doctors created | Doctors reused | Slots created | Slots reused | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: |
| First | 18 | 0 | 216 | 0 | 0 |
| Second | 0 | 18 | 0 | 216 | 0 |

`doctorIdsUnchanged` and `passed` are both true. The manifest contains 18 identities and no seed lock remains. Independent anonymous checks through direct services, gateway, and Vite proxy all agree on 24 doctors and 216 available slots. The seeded profiles have 18 distinct UUIDs and names, covering all three configured cities and six specialties. All six original doctor UUIDs remain present. The available slots have 216 distinct UUIDs and doctor/start pairs, are aligned to UTC half-hour boundaries, and fall within the queried seven-day window. Existing repeated Priya records were preserved.

The counts above are actual live results. Authenticated browser verification is recorded separately below; the seed report alone does not verify booking.

The first authenticated browser attempt reached a successful booking, one frontend POST on double-click, HTTP 409 for the repeated booking, and visible appointment history. Its availability assertion then failed; automated cleanup cancelled only its newly created appointment and returned HTTP 200. This was not a completed end-to-end pass. The local checker was updated to follow the slot UUID actually submitted, record slot/appointment state, and detect intervening browser cancellations. The initial run did not retain enough diagnostics to attribute the assertion failure to application code or interactive navigation.

The fresh **live Chromium run passed all 12 checks** on 4 November 2026:

- Double-click sent exactly one frontend booking POST, which returned 201.
- A second POST for that booked slot returned 409.
- Appointment history showed the booking; its actual slot was marked booked and absent from public availability.
- Reload cleared the in-memory session; after the user signed in again with the same patient, the saved appointment was visible.
- Browser cancellation returned 200/CANCELLED, and cancelled history remained visible.
- The same slot became available again through direct Appointment Service, gateway, and Vite proxy.
- Sign-out preserved public doctor cards; localStorage/sessionStorage remained empty; no page JavaScript errors occurred.

The successful run's initial, submitted, and response slot UUIDs matched; its availability check observed no intervening browser cancellation. Its test appointment was cancelled, not deleted. Both browser attempts preserved their cancelled test history and left pre-existing appointments alone. Final anonymous inspection again found matching counts on all three routes: **24 active doctors and 216 available slots**. Sanitized evidence is in ignored `logs/local-seed/browser-verification.json` and `logs/phase6-final-api-inspection.json`; credentials/tokens were not saved. The earlier empty-slot records still need direct SQL inspection to distinguish missing rows from expired/booked/out-of-window rows.

Validation during this investigation:

- Frontend: 41 tests passed across six files; TypeScript/production build passed. The existing React Router `use client` bundling warnings remain non-fatal.
- Backend: 42 selected tests passed (Appointment 10, Doctor 8, Patient 19, Gateway 5), zero failures/errors/skips. These use isolated H2/stub services, not the live MySQL databases. Auth's old report was not counted as a fresh run.
- Local data tools: 13 tests passed, including exact-account promotion SQL and the two-run seed workflow; PowerShell wrapper syntax parsed successfully.
- Live Chromium: six cards matched the API, four Priya links used distinct UUIDs, all six doctor profiles showed the empty slot state with no booking links, city filter/sort/reset passed, no JavaScript page errors, and no horizontal overflow at 390px width. This was public browsing, not an authenticated booking check.
- Live anonymous API comparison: all three routes agreed on IDs and availability. No live seed rows were inserted by the agent before ADMIN access was established.
- `git diff --check`: passed. Existing uncommitted Phase 6 work was preserved; no commit or push was made.

### Pre-commit verification — 4 November 2026

The Phase 6 source and local tools were reviewed before the requested GitHub save. Fresh checks:

- `npm.cmd test` in `frontend`: 41 tests passed across six files.
- `npm.cmd run build` in `frontend`: TypeScript and production Vite build passed. The two existing React Router `use client` warnings remain non-fatal.
- `mvnw.cmd -pl auth-service,doctor-service,appointment-service,patient-service,api-gateway -am test` in `backend`: 45 tests passed (Appointment 10, Doctor 8, Auth 3, Patient 19, Gateway 5), zero failures/errors/skips, with isolated H2/stub services.
- `node --test backend/scripts/local-data.test.mjs backend/scripts/local-data-powershell.test.mjs backend/scripts/local-registration.test.mjs`: 24 passed, zero failed, one skipped because PowerShell 7 is not installed. Windows PowerShell 5.1 passed.
- Initial frontend/Maven attempts could not write generated files under the restricted filesystem. Reruns with the required filesystem access passed; no source fix was necessary.
- Staged review: 43 relevant files; no excluded-path or credential-pattern findings. `git diff --cached --check` passed. Synthetic test credentials and token builders were retained deliberately.

The saved live Chromium report was reviewed again and still records all 12 successful journey checks described above; the authenticated browser journey was not rerun for this commit. Remaining live browser checklist scenarios without recorded completion are two independent patient sessions racing for one slot, switching between two patients to check isolation, a deliberate service outage, and non-PATIENT route access. Automated authorization/error tests cover related behavior, but are not substitutes for those browser checks. Live first-time profile setup was not established by the successful existing-patient journey; it is covered by fixture tests.

The original six doctors' SQL slot-date breakdown remains pending. The supplied two-column UUID/count result matches the shape of appointment-reference counts, not the requested missing/expired/booked/later slot breakdown, so it does not establish expiration as the cause. No existing doctor or appointment was deleted or merged.

Only source, tests, scripts and documentation are intended for the commit. Local logs, account receipts, promotion SQL, runtime keys, environment files, dependencies and build output remain excluded. Deliberately fictional test credentials/JWT builders and existing test-only key fixtures are not runtime secrets. Old Phase 3 extraction artifacts remain untracked and preserved.
