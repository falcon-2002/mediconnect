# Phase 6 — connect the patient frontend to Spring Boot

Base reviewed: `7c1ab68427dc2cab7e6b8df58ba79cf47692ad23` on `main`, the merge of Phase 5. Development branch: `phase-6-frontend-integration`.

## Scope and review findings

Phase 2 supplies Patient Service, Eureka and the MVC API Gateway. Phase 3 supplies RS256 JWT login, roles and patient ownership; Phase 4 supplies public doctor discovery and ADMIN management; Phase 5 supplies real slots, appointments, cancellation and database-enforced booking concurrency.

The original frontend was an independent mock application. `main.tsx` injected `createMockRepository`; slots were generated in the browser; appointments were stored in sessionStorage; search filtered the mock array locally. Its feature-based folders, repository context, route layout, CSS, date helpers and cards provide the foundation for Phase 6.

The existing APIs support the patient journey except for finding your own profile after signing in on a new browser session. Patient listing is correctly ADMIN-only, and the frontend does not know a returning patient's UUID. The necessary additive backend change is `GET /api/patients/me`, resolving the profile by authenticated account ID.

No existing profile is reassigned. No schema migration, new database, password rotation, JWT-key change, gateway route change, dependency upgrade or booking-transaction refactor is needed.

## Architecture decisions

1. Keep React, TypeScript, Vite, React Router and the existing test stack. No new runtime dependencies; the package lock is unchanged.
2. Keep the `HealthcareRepository` / `RepositoryProvider` boundary, replacing the runtime mock adapter with a typed HTTP adapter. The old contract is named `DemoHealthcareRepository` and is retained only for its isolated tests. Legacy booking logic never runs in the live application.
3. Use same-origin `/api` requests, proxied by Vite to the gateway on 8080. This is sufficient for local development without loosening Spring CORS or exposing keys in frontend configuration. A future deployment must supply the equivalent HTTPS reverse proxy.
4. Keep JWTs in memory, with an expiry timer and request-time expiry checks. A reload asks for login again; profiles/appointments persist in MySQL. There is no silent refresh or server-side logout/revocation in the existing backend.
5. Read roles to choose screens only. Server authorization and ownership checks remain authoritative even if a user edits the browser.
6. Use server-side doctor filters and paginated results. Load the catalog from the Doctor Service rather than duplicating its allowed cities/specialties in frontend business logic. Local icons/hints remain presentation choices.
7. Display actual slot IDs/timestamps, never generate live availability in JavaScript. Booking sends only `{ slotId, patientId }`, with patientId obtained from `/patients/me`.
8. Preserve the current appointment response. Join slot and public doctor details only for the current page, deduplicating requests within the page. An unavailable/deactivated doctor does not hide appointment history. A future backend read projection could reduce these requests but is not necessary here.
9. Do not retry writes automatically. A timeout is ambiguous: the database may already have committed. The booking form directs the user to My appointments before trying again. After a successful POST, the submit guard stays locked until navigation completes.

## Files changed

- Patient Service: `PatientController.java`, `PatientService.java`, `PatientRepository.java`, `PatientSecurityTest.java`.
- Gateway: `GatewayRoutingTest.java` only; new assertion for `/api/patients/me` path/bearer forwarding.
- Frontend `src/data/`: typed DTOs, HTTP client/repository and tests; contract evolution; historical mock adapter type annotation.
- Frontend `src/features/auth/`: in-memory session, registration/login, PATIENT route guard.
- Frontend `src/features/patients/`: own-profile view and first-time profile setup.
- Existing doctor and appointment screens: real APIs, catalog, pagination and booking/cancellation states.
- `src/app/`: auth routes/navigation, catalog provider and HTTP-boundary journey tests.
- `src/main.tsx`, `src/shared/Pagination.tsx`, `src/styles.css`, `vite.config.ts`.
- Fictional HTTP test fixtures and documentation. `SOURCE_GUIDE.md` receives a historical-snapshot notice only.

## Browser-to-API map

| User action | Gateway request | Access |
| --- | --- | --- |
| Search filters | GET `/api/doctors/catalog` | Public |
| Doctor discovery | GET `/api/doctors?query=&city=&specialty=&maxFee=&sort=&page=&size=12` | Public |
| Doctor profile | GET `/api/doctors/{id}` | Public |
| Availability | GET `/api/slots?doctorId=&from=&to=&page=&size=100` | Public; fixed next-seven-day window |
| Selected slot | GET `/api/slots/{id}` | Public |
| Register | POST `/api/auth/register` with email/password only | Public; backend assigns PATIENT |
| Login | POST `/api/auth/login` | Public; receives 15-minute bearer token |
| Own profile | GET `/api/patients/me` | PATIENT; JWT account ownership |
| Create own profile | POST `/api/patients` | PATIENT in this UI; existing API also supports ADMIN |
| Book | POST `/api/appointments` | PATIENT; existing backend validates ownership and availability |
| My appointments | GET `/api/appointments?page=&size=10` | PATIENT; backend restricts records to caller |
| Cancel | POST `/api/appointments/{id}/cancel` | Owner PATIENT; existing API also supports ADMIN |

### New backend contract

`GET /api/patients/me` returns the existing `PatientResponse` JSON and `Cache-Control: no-store`.

- 200: active profile whose account_id equals the JWT subject.
- 401: no usable JWT (existing signature/issuer/audience/expiry checks apply).
- 403: authenticated non-PATIENT role, including ADMIN/DOCTOR.
- 404: no active owned profile, including deactivated or unassigned legacy profiles.

The literal `/me` route coexists with `/{id}`. No account ID or email parameter controls the lookup. The unique account ownership constraint from Phase 3 remains unchanged.

## Historical package application instructions

Phase 6 is already applied in this branch. Do not reapply the package or switch to main to continue this checkout. The commands below document the original package installation only.

Extract the package outside the repository, for example `C:\Users\hp\Downloads\MediConnect_Phase_6`. Do not extract its `files/` directory directly over the project or blindly replace conflicting files.

From the real repository root (not `backend ph-2`):

```powershell
Set-Location "D:\github projects\Mediconnect_project\mediconnect"
git status
git switch main
git pull --ff-only origin main
git switch -c phase-6-frontend-integration
git apply --check "C:\Users\hp\Downloads\MediConnect_Phase_6\MediConnect_Phase_6.patch"
git apply "C:\Users\hp\Downloads\MediConnect_Phase_6\MediConnect_Phase_6.patch"
git diff --check
```

Review local edits before switching branches. Old untracked Phase 3 extraction artifacts are not application code; do not stage them. If patch checking fails, compare the affected files with the package and preserve newer changes; do not force the patch or reset the working tree. The included `files/` tree is for review/manual merging and contains only changed/new files, not an entire replacement project.

## Build, restart, run

No MySQL Workbench step is needed. Keep existing credentials and RSA keys outside source control. Use the established startup script's local secure prompts; do not put secrets in command-line arguments or transcripts.

```powershell
Set-Location "D:\github projects\Mediconnect_project\mediconnect\backend"
.\mvnw.cmd -pl patient-service,api-gateway -am test
.\mvnw.cmd -pl patient-service -am package -DskipTests

Set-Location "D:\github projects\Mediconnect_project\mediconnect"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\start-all.ps1" -SkipFrontend -Restart PatientService

Set-Location ".\frontend"
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The existing script uses packaged JARs, so rebuilding Patient Service before restarting is important. `-Restart PatientService` is explicit: running the startup script alone may retain an already healthy old process. If Vite already occupies 5173, stop the existing frontend process/terminal before starting the new one so it loads the updated proxy configuration. Do not kill unrelated Node/Java processes.

Open http://127.0.0.1:5173. Eureka 8761, Auth 8082, Patient 8081, Doctor 8083, Appointment 8084 and Gateway 8080 should be healthy. Discovery may take a short time to refresh. An old Patient JAR can cause `/api/patients/me` to fail; restart the rebuilt service before debugging the frontend.

## Local end-to-end verification

For repeatable fictional doctors and real future slots, use the explicitly invoked [local data tools](LOCAL_DATA.md). The guide includes read-only API/SQL diagnosis, secure ADMIN seed prompts, rerun behavior, and a PATIENT booking/cancellation verifier. These commands are separate from normal startup and preserve existing records.

Live verification on 4 November 2026 is recorded in that guide: the seed created 18 doctors and 216 slots, a second pass created none, all three API routes agreed, and a fresh Chromium booking/conflict/re-login/history/cancellation/sign-out journey passed. Existing records and the uncommitted Phase 6 implementation were preserved.

Use fictional data and a newly registered PATIENT account. Do not expose passwords or tokens in the IDE report.

1. Browse doctors while signed out; try specialty, city, fee, sort and pagination. The Network panel should show `/api/...` requests to the frontend origin, forwarded through 8080.
2. Open a doctor and select a future slot. If no slots exist in the next seven days, use the existing ADMIN slot API from Phase 5 to create one. Keep the existing half-hour UTC boundary rule. Do not synthesize availability in the frontend or promote a patient to ADMIN for this flow.
3. Follow the login screen's registration link. Register, then sign in. The original booking destination should be preserved.
4. Set up the first-time profile using fictional contact details. It must be linked automatically; no patient UUID entry is requested.
5. Confirm the booking. Verify it appears under My appointments and in the existing backend API/database. A quick double-click must not create two frontend POSTs.
6. Reload and sign in again. Verify the same profile and appointment are retrieved. Reload intentionally clears the in-memory token, not the database record.
7. Cancel a future appointment. Verify its status is cancelled and the slot becomes available again. Rebook if desired; old appointment history remains.
8. With two separate patient sessions, load the same slot before either books it. The backend accepts one booking and rejects the other with 409. The losing UI must not show success. This complements, rather than replaces, the Phase 5 MySQL concurrency test.
9. Sign out and log in as another patient. Neither the previous profile nor appointments should appear. Direct-port and cross-patient enforcement remain backend responsibilities with existing tests.
10. Stop a relevant backend service temporarily: the screen should show an error, not mock records or a fabricated successful booking. Restore the service. Do not automatically repeat an uncertain booking POST; inspect saved appointments first.
11. With a DOCTOR or ADMIN login, public discovery remains usable but patient routes show "Patient account required". No new admin UI is provided.
12. Check browser storage: this phase stores neither JWTs nor profiles/appointments in localStorage or sessionStorage. Earlier demo data may still exist from an old version but is ignored; clear only the old demo key manually if desired.

## Validation and boundaries

The original package results are recorded below; current verification and remaining checks are recorded in [LOCAL_DATA.md](LOCAL_DATA.md). Automated frontend tests use controlled HTTP responses. Backend tests use isolated H2 with real signed JWTs and the gateway routing test server. The separate live Chromium journey against Windows services/MySQL has passed; it does not establish that every manual checklist scenario above was exercised.

Existing limits remain: no refresh tokens or server revocation; inactive/legacy profile recovery is an administrator task; no profile editing UI, admin dashboard, rescheduling, Redis, Kafka, payments or notifications. Sign-out/password changes do not themselves invalidate already issued JWTs.

The application has an original MediConnect design. This phase preserves that design and its feature folders while replacing offline behavior with real service contracts.

## Official references

- Vite proxy: https://vite.dev/config/server-options#server-proxy
- React external store subscription: https://react.dev/reference/react/useSyncExternalStore

## Package verification results — 2 November 2026

- `npm run build`: passed, including TypeScript checking and the Vite production bundle. Vite reports the existing React Router `use client` directive warning; the build succeeds.
- `npm test`: 37 tests passed across six files; zero failures. Includes existing isolated search/mock-booking tests and new HTTP/session/journey tests.
- `mvnw -pl patient-service,api-gateway -am test`: 24 tests passed (Patient Service 19, Gateway 5); zero failures/errors/skips. After extending the ownership assertions to two active patient profiles, all six `PatientSecurityTest` methods were rerun successfully.
- Chromium against Vite plus an isolated HTTP fixture server: passed discovery → login → profile setup → booking → reload/re-login → history → cancellation → logout. 48 requests passed through the actual Vite `/api` proxy. Fast double-click produced exactly one booking POST; browser storage remained empty; no page JavaScript errors; 390px mobile viewport had no horizontal overflow. Desktop/mobile screenshots were inspected.
- `git diff --check`: passed.

The original package browser fixture server was not the real Spring/MySQL backend. No real credentials were requested or used for those package checks. See LOCAL_DATA.md for the subsequent live verification and remaining manual scenarios.
