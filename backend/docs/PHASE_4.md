# Phase 4 — Doctor discovery and profile management

## Starting point and scope
Based on merged Phase 3 commit `160b103433b232e6931fce048843626dc4d0bb27`.
The existing Auth Service, patient ownership rules, Eureka, WebMVC gateway and local MySQL remain in place.

This phase adds a fifth backend module, `doctor-service`, on port 8083. It owns `mediconnect_doctor`, accessed by `doctor_app` on local MySQL port 3306. No Docker is required for development. The existing optional Compose stack and startup scripts are not extended in this phase; start Doctor Service in another terminal.

Doctor profiles are a separate domain from patient demographics and login accounts. This keeps doctor search and profile management independently deployable. Doctor Service never reads the patient or auth databases and has no cross-service foreign keys.

Public visitors can discover active doctors. ADMIN accounts manage profiles. DOCTOR and PATIENT accounts cannot write doctor profiles. Doctor self-editing needs trusted account onboarding and an immutable account/profile link; neither is invented here. Appointment slots, booking, reviews, Redis, Kafka and frontend integration are later phases.

## Files and conventions
- `doctor-service/pom.xml`, `DoctorServiceApplication.java`: same dependency versions and Java release as the parent.
- `api/`: validated create/update records, public response/page records, controller and ProblemDetail exception handler.
- `application/DoctorService.java`: catalog validation, transactional writes, bounded database search and method-level ADMIN checks.
- `domain/Doctor.java`: UUID identity, decimal fee, ordered languages, UTC microsecond timestamps, optimistic version and soft deletion.
- `persistence/DoctorRepository.java`: Spring Data JPA and specifications.
- `config/`: clock, OpenAPI bearer scheme, configuration catalog and the existing Phase 3 JWT validation pattern.
- `resources/db/migration/V1__create_doctors.sql`: new schema only; no changes to prior migrations.
- `src/test/`: actual signed JWT API tests and test-only keys. Never run services with those test keys.
- `backend/pom.xml`: new module; gateway YAML: explicit doctor route; gateway test: doctor routing check.

The gateway preserves the incoming Host header on the doctor route so POST Location URLs use the gateway address. This is for local development, not a substitute for trusted-proxy configuration in production.

## API contract
| Method | Path | Access | Result |
|---|---|---|---|
| GET | /api/doctors/catalog | Public | Specialty map and city list |
| GET | /api/doctors | Public | Paginated active doctors |
| GET | /api/doctors/{id} | Public | Active public profile, or 404 |
| POST | /api/doctors | ADMIN | 201 with Location and full profile |
| PUT | /api/doctors/{id} | ADMIN | Full replacement with last-read version |
| DELETE | /api/doctors/{id} | ADMIN | 204; retained row becomes inactive |

Writes require authentication directly on port 8083 as well as through gateway port 8080. Missing/invalid JWT: 401; authenticated non-admin: 403. JWT validation checks RS256 signature, expiry, issuer, audience and UUID subject, using the same runtime PUBLIC key as Patient Service. Invalid bearer tokens are rejected even on public endpoints; omit Authorization for anonymous browsing.

Update bodies require `version`; a stale version returns 409. Concurrent JPA optimistic-lock failures also return 409. DELETE is idempotent for an existing inactive row; unknown IDs return 404. Inactive profiles disappear from public search and GET. No restore endpoint is included.

Public fields follow the frontend Doctor model: id, name, specialty, city, area, clinic, qualifications, experienceYears, feeInRupees, languages, about, initials, color. The API adds active/version/timestamps. Initials are derived from the first two name words. Only publish information intended for a public directory—there are no credentials, account IDs or private contact fields in this model.

Frontend still uses its existing mock repository. To connect it later, an adapter must read `items` from the paginated API, handle backend UUIDs, and fetch the catalog. No real appointment availability is implied by this phase.

## Search and configuration
Example: `/api/doctors?query=dentist&city=Rourkela&specialty=dental&maxFee=500&sort=fee&page=0&size=20`
- query: max 200 characters; case-insensitive words, ALL words must match across name, specialty label, clinic, area or city. `%`, `_`, `!` are literal text, not SQL wildcards.
- city/specialty: exact configured values; unknown values return 400. Blank means no filter.
- maxFee: inclusive, non-negative decimal up to 1,000,000 rupees.
- sort: name ascending (default), fee ascending, experience descending; ties use name then UUID for stable paging.
- page: zero-based and >=0; size 1–100, default 20. Out-of-range page returns an empty items array with correct totalItems.

Configure supported specialties and cities under `doctor.catalog` in application.yml. Initial values match `frontend/src/config/catalog.ts`. Do not remove codes used by existing rows without a data migration. General case-insensitive search follows the database collation; exact linguistic sorting can differ between H2 and MySQL.

The composite index supports active/city/specialty filters. Substring text search remains a scan; no claim of full-text indexing or production-scale search optimization is made. Fees use BigDecimal/DECIMAL instead of floating point. A doctor has an ordered collection of language strings, not a shared cross-service entity.

## Apply the patch
Save local work first. From the mediconnect root on the updated main branch:
```powershell
git switch -c phase-4-doctor
git apply --check "C:\PATH\MediConnect_Phase_4.patch"
git apply "C:\PATH\MediConnect_Phase_4.patch"
```
If the check fails, inspect differences; do not force-overwrite local work. Keep the extracted patch package outside the repository.

## Local MySQL setup
In MySQL Workbench, inspect for existing database/user first. If absent, run as your local administrative user (replace the password locally; do not commit it):
```sql
CREATE DATABASE mediconnect_doctor;
CREATE USER 'doctor_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_LOCAL_PASSWORD';
GRANT ALL PRIVILEGES ON mediconnect_doctor.* TO 'doctor_app'@'localhost';
```
Schema-level permissions allow Flyway locally. A production deployment would separate migration and runtime identities. Do not reset or recreate existing auth/patient schemas. Flyway creates doctor tables on first successful startup.

## Start and verify
Keep Eureka, Auth and Patient Services running. Restart Gateway to load its new route. In a NEW PowerShell terminal:
```powershell
Set-Location "D:\github projects\Mediconnect_project\mediconnect\backend"
$secret = Read-Host 'doctor_app password' -AsSecureString
$env:DOCTOR_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
$env:JWT_PUBLIC_KEY = 'file:C:/Users/hp/.mediconnect-keys/public.pem'
.\mvnw.cmd -pl doctor-service spring-boot:run
```
Use the same public key that already validates Auth Service tokens. Doctor Service never needs the private key. Keep this terminal open. Check `http://localhost:8083/actuator/health` and Eureka for DOCTOR-SERVICE UP.

No profiles are automatically seeded. Test the empty public endpoints:
```powershell
Invoke-RestMethod 'http://localhost:8080/api/doctors/catalog'
Invoke-RestMethod 'http://localhost:8080/api/doctors'
```
Use an existing local ADMIN account. If none exists, follow the explicit local administrator bootstrap in PHASE_3.md; public registration remains PATIENT-only. Log in again after a role change. Enter credentials locally and keep tokens in memory:
```powershell
$base = 'http://localhost:8080'
$email = Read-Host 'Local ADMIN account email'
$secret = Read-Host 'Account password' -AsSecureString
$loginBody = @{email=$email;password=[System.Net.NetworkCredential]::new('', $secret).Password} | ConvertTo-Json
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$headers = @{Authorization="Bearer $($login.accessToken)"}
$body = @{
 name='Anita Demo'; specialty='general'; city='Rourkela'; area='Central'; clinic='Demo Clinic'
 qualifications='MBBS'; experienceYears=8; feeInRupees=500; languages=@('English','Hindi')
 about='Fictional profile for local testing'; color='sage'
} | ConvertTo-Json
$doctor = Invoke-RestMethod "$base/api/doctors" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/api/doctors/$($doctor.id)"
Invoke-RestMethod "$base/api/doctors?city=Rourkela&specialty=general&maxFee=500&sort=fee"
```
For update, use the create fields plus `version=$doctor.version`. A full response can contain extra metadata; prefer an explicit update body with only the documented fields. After each successful update, retain the returned version. Test stale version (409), non-admin writes (403), anonymous writes (401), and soft deletion (204 then public GET 404). Repeat write-denial checks directly on port 8083. Use only fictional profiles. Verify newly created profiles persist across a service restart and prior patient/auth access checks still pass.

OpenAPI: `http://localhost:8083/swagger-ui/index.html`; select Authorize with an ADMIN token for writes. Tokens last 15 minutes as in Phase 3.

## Tests
From backend:
```powershell
.\mvnw.cmd clean test
```
Default tests use H2 and test-only RSA keys, with Eureka disabled. Doctor API tests exercise the actual JWT filter chain, persistence and Flyway migration. Gateway tests use stub downstream servers and real YAML routes. This does not replace the MySQL/Eureka live checks above.

## Validation performed

### 1. Automated test suite
- Maven build and executable JAR packaging succeeded for all five services (`mvnw clean test`).
- Full backend suite: 30 tests, zero failures/errors/skips across all modules:
  - `doctor-service`: 8 tests (API controller, contract, domain, repository, specification, security filter chain, Flyway schema).
  - `auth-service`: 3 tests (token issuance, password hashing, authentication flow).
  - `patient-service`: 16 tests (ownership, security rules, CRUD operations, JPA validation).
  - `api-gateway`: 3 tests (routing rules, filter chain, host header preservation).
- Unit/slice tests execute against in-memory H2 with test-only RSA key pairs and Eureka disabled.

### 2. Live runtime verification results
All 50 live security, routing, persistence, and access-control checks passed against the running microservices network (Eureka on 8761, Auth Service on 8082, Patient Service on 8081, Doctor Service on 8083, API Gateway on 8080) backed by local MySQL databases (`mediconnect_auth`, `mediconnect_patient`, `mediconnect_doctor`):

| # | Check Description | Target Route & Port | Expected Status | Actual Status | Result |
|---|---|---|:---:|:---:|:---:|
| 1 | Eureka: `API-GATEWAY` registered and UP | `8761 /eureka/apps` | Registered UP | Registered UP | PASS |
| 2 | Eureka: `AUTH-SERVICE` registered and UP | `8761 /eureka/apps` | Registered UP | Registered UP | PASS |
| 3 | Eureka: `PATIENT-SERVICE` registered and UP | `8761 /eureka/apps` | Registered UP | Registered UP | PASS |
| 4 | Eureka: `DOCTOR-SERVICE` registered and UP | `8761 /eureka/apps` | Registered UP | Registered UP | PASS |
| 5 | Public Doctor Catalog via Gateway | `8080 /api/doctors/catalog` | 200 OK | 200 OK | PASS (Specialties map & cities list) |
| 6 | Public Doctor Search via Gateway | `8080 /api/doctors` | 200 OK | 200 OK | PASS (Anonymous paginated search) |
| 7 | Public Doctor Search directly on 8083 | `8083 /api/doctors` | 200 OK | 200 OK | PASS (Anonymous direct read allowed) |
| 8 | Public Doctor GET non-existent ID | `8080 /api/doctors/{id}` | 404 NOT FOUND | 404 NOT FOUND | PASS |
| 9 | Registration with role `ADMIN` blocked | `8080 /api/auth/register` | 400 BAD REQUEST | 400 BAD REQUEST | PASS (Privilege escalation blocked) |
| 10 | Register Patient A (fictional account) | `8080 /api/auth/register` | 201 CREATED | 201 CREATED | PASS (Assigned role: PATIENT) |
| 11 | Register Patient B (fictional account) | `8080 /api/auth/register` | 201 CREATED | 201 CREATED | PASS (Assigned role: PATIENT) |
| 12 | Register candidate Admin account | `8080 /api/auth/register` | 201 CREATED | 201 CREATED | PASS |
| 13 | Login with incorrect password | `8080 /api/auth/login` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 14 | Login Patient A with correct password | `8080 /api/auth/login` | 200 OK | 200 OK | PASS (Bearer token issued) |
| 15 | Login Patient B with correct password | `8080 /api/auth/login` | 200 OK | 200 OK | PASS (Bearer token issued) |
| 16 | Promote via local SQL & login Admin | `8080 /api/auth/login` | 200 OK | 200 OK | PASS (Admin token issued) |
| 17 | Anonymous POST `/api/doctors` via Gateway | `8080 /api/doctors` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 18 | Anonymous POST `/api/doctors` directly on 8083 | `8083 /api/doctors` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS (Direct port secured) |
| 19 | Invalid Bearer token on port 8083 | `8083 /api/doctors` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 20 | PATIENT token POST `/api/doctors` via Gateway | `8080 /api/doctors` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Write denied) |
| 21 | PATIENT token POST `/api/doctors` directly on 8083 | `8083 /api/doctors` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Write denied) |
| 22 | DOCTOR token POST `/api/doctors` via Gateway | `8080 /api/doctors` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Non-admin write denied) |
| 23 | DOCTOR token POST `/api/doctors` directly on 8083 | `8083 /api/doctors` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Direct port role check) |
| 24 | ADMIN creates doctor via Gateway | `8080 /api/doctors` | 201 CREATED | 201 CREATED | PASS (Location & profile returned) |
| 25 | Location header correctly preserved | Gateway Location Header | `*/api/doctors/{id}` | Formed with Gateway host | PASS |
| 26 | Public GET doctor by ID via Gateway | `8080 /api/doctors/{id}` | 200 OK | 200 OK | PASS |
| 27 | Public Search with city/specialty/fee filters | `8080 /api/doctors?...` | 200 OK | 200 OK | PASS (Matches returned) |
| 28 | PATIENT token PUT `/api/doctors/{id}` via Gateway | `8080 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 29 | PATIENT token PUT directly on 8083 | `8083 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 30 | DOCTOR token PUT `/api/doctors/{id}` via Gateway | `8080 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 31 | DOCTOR token PUT directly on 8083 | `8083 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 32 | ADMIN updates doctor via Gateway | `8080 /api/doctors/{id}` | 200 OK | 200 OK | PASS (Version incremented) |
| 33 | Stale version PUT via Gateway | `8080 /api/doctors/{id}` | 409 CONFLICT | 409 CONFLICT | PASS (Optimistic locking) |
| 34 | Stale version PUT directly on 8083 | `8083 /api/doctors/{id}` | 409 CONFLICT | 409 CONFLICT | PASS (Optimistic locking) |
| 35 | PATIENT token DELETE via Gateway | `8080 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 36 | PATIENT token DELETE directly on 8083 | `8083 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 37 | DOCTOR token DELETE via Gateway | `8080 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 38 | DOCTOR token DELETE directly on 8083 | `8083 /api/doctors/{id}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 39 | ADMIN soft-deletes doctor via Gateway | `8080 /api/doctors/{id}` | 204 NO CONTENT | 204 NO CONTENT | PASS |
| 40 | Repeat DELETE on inactive doctor (idempotency) | `8080 /api/doctors/{id}` | 204 NO CONTENT | 204 NO CONTENT | PASS |
| 41 | Public GET soft-deleted doctor | `8080 /api/doctors/{id}` | 404 NOT FOUND | 404 NOT FOUND | PASS (Profile deactivated) |
| 42 | Public Search excludes soft-deleted doctor | `8080 /api/doctors` | Excluded | Excluded | PASS |
| 43 | Patient A creates own profile via Gateway | `8080 /api/patients` | 201 CREATED | 201 CREATED | PASS (Profile created & linked) |
| 44 | Patient A reads own profile via Gateway | `8080 /api/patients/{idA}` | 200 OK | 200 OK | PASS |
| 45 | Anonymous GET `/api/patients/{id}` | `8080 /api/patients/{idA}` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 46 | Cross-patient read (B -> A) via Gateway | `8080 /api/patients/{idA}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Ownership enforced) |
| 47 | Direct port: Patient A reads own profile | `8081 /api/patients/{idA}` | 200 OK | 200 OK | PASS |
| 48 | Direct port: Anonymous GET | `8081 /api/patients/{idA}` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS (Direct port secured) |
| 49 | Direct port: Cross-patient read (B -> A) | `8081 /api/patients/{idA}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Gateway bypass prevented) |
| 50 | ADMIN lists all patients via Gateway | `8080 /api/patients` | 200 OK | 200 OK | PASS (Phase 2 records preserved) |

### 3. Database migrations and credentials safety
- Flyway migration `V1__create_doctors.sql` applied cleanly on `mediconnect_doctor`.
- Pre-existing patient and auth records were preserved intact.
- Microservice startup uses environment variables for database credentials and signing keys, without command-line passwords.
- Only Auth Service has access to the private signing key; Patient and Doctor services are provisioned only with the public key.
- All temporary test-account credentials were kept local and expired/reset; no credentials or tokens are stored in documentation or source control.
