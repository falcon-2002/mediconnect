# Phase 3 — Authentication and patient authorization

## Repository review and scope
Based on upstream commit 58435ee48a7d6ad31ac149465accb5b8dd7482b4. Phase 2 contains a Maven multi-module backend (Spring Boot 4.1.1, Spring Cloud 2025.1.3, Java release 17), WebMVC Gateway on 8080, Eureka on 8761, and Patient Service on 8081. Patient code uses api/application/domain/persistence/config packages, record DTOs, Flyway, JPA optimistic locking, soft deletion and ProblemDetail errors. Existing patient API contract tests are retained with administrator authentication.

The React frontend uses a mock repository. This backend phase does not connect its booking UI or introduce Doctor/Appointment services. Existing startup scripts remain unchanged; start Auth Service separately. Docker Compose is an older optional deployment path, not the Phase 3 launch procedure.

The gateway had both legacy and current MVC route namespaces. Only the current `spring.cloud.gateway.server.webmvc.routes` namespace is retained. Auth routing is added without switching to WebFlux.

## Decisions
- Auth Service owns accounts in mediconnect_auth, using a separate database user. Patient Service keeps mediconnect_patient.
- Public registration always creates PATIENT. Supplying a non-null role fails validation. Passwords are BCrypt hashed (cost 12), minimum 12 characters and maximum 72 UTF-8 bytes.
- Login issues RS256 JWTs lasting 15 minutes: issuer mediconnect-auth, audience mediconnect-api, subject immutable account UUID, roles array. No passwords or patient details in tokens.
- Only Auth Service receives the private key. Patient Service validates signatures with the public key and checks expiry, issuer, audience and UUID subject. It does not trust identity headers from callers or the gateway.
- Stateless bearer authentication: no login cookies or HTTP sessions. CSRF protection is disabled for these bearer APIs. Frontend integration, refresh tokens, logout revocation, password reset, login throttling and email verification are deferred; this is a local learning implementation, not a production identity provider. Issued tokens remain valid until expiration.
- Registration and profile creation are separate operations. If profile creation fails, the account remains usable and the user can retry. No shared database transaction or database foreign key crosses services.
- V2 adds a nullable unique account_id to patients. Existing records, IDs, timestamps and V1 migration remain intact. No automatic linking by email. Existing rows are administrator-only. Any later account-linking workflow must verify ownership separately.
- A patient creates one profile; ownership comes from the validated token, never the request body. Soft deletion retains the unique account link, preventing duplicate profiles. Profile contact email is separate from account login email.

## Access rules
| Endpoint | Access |
|---|---|
| POST /api/auth/register, /api/auth/login | Public |
| GET /actuator/health | Public on each service |
| POST /api/patients | PATIENT creates own profile; ADMIN creates unassigned profile |
| GET /api/patients | ADMIN only |
| GET/PUT/DELETE /api/patients/{id} | ADMIN or owning PATIENT |
| Patient data with DOCTOR role | Denied until appointment permissions exist |

Missing/invalid credentials return 401; authenticated forbidden operations return 403. UUID guessing cannot bypass ownership. API gateway forwards the Authorization header; Patient Service enforces security even on direct port 8081. No public admin or doctor creation endpoint is provided.

## Local Windows setup
Use the existing backend folder and MySQL on 3306. Back up your database before schema changes. Do not change V1 or recreate mediconnect_patient.

Create a separate database/user in MySQL Workbench as a privileged local user, replacing the example placeholder with a new local password (never commit it):
```sql
CREATE DATABASE mediconnect_auth;
CREATE USER 'auth_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_LOCAL_PASSWORD';
GRANT ALL PRIVILEGES ON mediconnect_auth.* TO 'auth_app'@'localhost';
```
These schema-level permissions support Flyway locally; use a separate migration identity in production.

Generate keys using PowerShell 7 (pwsh), once, outside the repository:
```powershell
$keyDirectory = Join-Path $env:USERPROFILE '.mediconnect-keys'
New-Item -ItemType Directory -Force $keyDirectory | Out-Null
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
[IO.File]::WriteAllText((Join-Path $keyDirectory 'private.pem'), $rsa.ExportPkcs8PrivateKeyPem())
[IO.File]::WriteAllText((Join-Path $keyDirectory 'public.pem'), $rsa.ExportSubjectPublicKeyInfoPem())
$rsa.Dispose()
```
If using Windows PowerShell 5.1, generate keys with OpenSSL instead:
```text
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```
Run those commands in a private folder outside the repository. Restrict private-key file access to your Windows account. Keep these keys stable across restarts; do not use the committed TEST-ONLY fixtures under src/test/resources.

In the Patient Service terminal (set your existing database password locally as before):
```powershell
$env:JWT_PUBLIC_KEY = 'file:C:/Users/YOUR_WINDOWS_USER/.mediconnect-keys/public.pem'
.\mvnw.cmd -pl patient-service spring-boot:run
```
In a fourth backend terminal:
```powershell
$env:JWT_PUBLIC_KEY = 'file:C:/Users/YOUR_WINDOWS_USER/.mediconnect-keys/public.pem'
$env:JWT_PRIVATE_KEY = 'file:C:/Users/YOUR_WINDOWS_USER/.mediconnect-keys/private.pem'
$secret = Read-Host 'Auth database password' -AsSecureString
$env:AUTH_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
.\mvnw.cmd -pl auth-service spring-boot:run
```
Start Eureka first as before and restart Gateway to load the auth route. Allow registry propagation. Health endpoints are on 8761/8080/8081/8082 as configured. A missing key intentionally prevents startup rather than creating an insecure default.

## Verify through the gateway
In a separate PowerShell terminal, use fictional data:
```powershell
$base = 'http://localhost:8080'
$credentials = @{ email='phase3@example.com'; password='local-demo-password-123' } | ConvertTo-Json
$account = Invoke-RestMethod "$base/api/auth/register" -Method Post -ContentType 'application/json' -Body $credentials
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body $credentials
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$profile = @{ fullName='Phase Three Patient'; email='phase3@example.com'; phone='9876543210'; dateOfBirth='1995-09-09'; address='Demo Road' } | ConvertTo-Json
$patient = Invoke-RestMethod "$base/api/patients" -Method Post -Headers $headers -ContentType 'application/json' -Body $profile
Invoke-RestMethod "$base/api/patients/$($patient.id)" -Headers $headers
Invoke-RestMethod "http://localhost:8081/api/patients/$($patient.id)" -Headers $headers
```
Repeat runs should log in to the existing account rather than registering again. Record the returned profile ID. Test without a token (401), with a second patient's token on that ID (403), and patient list access (403). Duplicate account/profile creation returns 409. The original Phase 2 sample remains stored but is not assigned to the newly registered account.

For local administrator testing only: create a separate account through registration, then a database administrator may promote that exact account UUID in mediconnect_auth (verify it first):
```sql
UPDATE accounts SET role = 'ADMIN' WHERE id = UNHEX(REPLACE('EXACT_ACCOUNT_UUID', '-', ''));
```
Log in again to obtain a token with the new role. The administrator can fetch the existing Phase 2 sample through the gateway. This is a manual development bootstrap, not a public API.

## Tests
```powershell
.\mvnw.cmd clean test
```
Default tests use H2, disable Eureka and use TEST-ONLY RSA fixtures; no Docker or real MySQL needed. PatientSecurityTest sends real signed tokens through the security filter chain. AuthApiTest verifies password hashing and token issuance. The existing 13 patient contract tests now run as ADMIN; none disables security filters. Optional `-Pmysql-it verify` uses the existing MySQL Testcontainers path and requires Docker. Do not claim H2 verifies all MySQL behavior.

The manual gateway checks above are required on your machine to verify discovery, actual MySQL credentials, RSA file paths, and network routing together. Old unauthenticated Phase 1 request examples are historical and require a bearer token now.

## Validation performed for this change
- 21 tests passed: AuthApiTest (3), existing PatientApiTest (13), PatientSecurityTest (3), GatewayRoutingTest (2).
- Auth, patient, discovery and gateway executable JARs packaged successfully. After correcting the gateway test's property-list override, its two tests and packaging passed on a targeted rerun.
- Gateway tests use the real YAML route predicates with local HTTP stubs for destinations; they check auth routing and bearer-header forwarding, not live Eureka discovery.
- Environment: Java 17, Maven 3.9.11, H2, no Docker. This execution environment needed Mockito supplied explicitly as a JVM javaagent because dynamic attachment stalled; no production setting was changed for this.
- Real MySQL migrations and the four-process Windows setup were not run here. Follow the manual checks before merging/deploying. Frontend files and startup scripts were not changed.

## End-to-end verification results

All 18 live security, routing, and access control verification checks passed successfully against the running services (Eureka on 8761, Auth Service on 8082, Patient Service on 8081, API Gateway on 8080) connected to MySQL on port 3306:

| # | Check | Target Port & Route | Expected Status | Actual Status | Result |
|:---|:---|:---|:---:|:---:|:---:|
| 1 | Register Patient A (fictional user) | `8080 /api/auth/register` | 201 CREATED | 201 CREATED | PASS (Assigned role: PATIENT) |
| 2 | Register with role ADMIN rejected | `8080 /api/auth/register` | 400 BAD REQUEST | 400 BAD REQUEST | PASS (Privilege escalation blocked) |
| 3 | Login with incorrect password | `8080 /api/auth/login` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 4 | Login Patient A with correct password | `8080 /api/auth/login` | 200 OK | 200 OK | PASS (Bearer token issued) |
| 5 | Patient A creates own profile | `8080 /api/patients` | 201 CREATED | 201 CREATED | PASS (Profile created & linked) |
| 6 | Patient A reads own profile | `8080 /api/patients/{idA}` | 200 OK | 200 OK | PASS |
| 7 | Register Patient B (second user) | `8080 /api/auth/register` | 201 CREATED | 201 CREATED | PASS (Assigned role: PATIENT) |
| 8 | Login Patient B | `8080 /api/auth/login` | 200 OK | 200 OK | PASS (Bearer token issued) |
| 9 | Patient B creates own profile | `8080 /api/patients` | 201 CREATED | 201 CREATED | PASS (Profile created & linked) |
| 10 | Patient B reads own profile | `8080 /api/patients/{idB}` | 200 OK | 200 OK | PASS |
| 11 | Request without token | `8080 /api/patients/{idA}` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 12 | Cross-patient read (Patient B -> A) | `8080 /api/patients/{idA}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Ownership enforced) |
| 13 | Cross-patient update (Patient B -> A) | `8080 /api/patients/{idA}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Ownership enforced) |
| 14 | Cross-patient delete (Patient B -> A) | `8080 /api/patients/{idA}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Ownership enforced) |
| 15 | PATIENT lists all patients | `8080 /api/patients` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Admin only) |
| 16 | Direct port: Patient A reads own profile | `8081 /api/patients/{idA}` | 200 OK | 200 OK | PASS |
| 17 | Direct port: Missing token | `8081 /api/patients/{idA}` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS (Direct port secured) |
| 18 | Direct port: Cross-patient read (B -> A) | `8081 /api/patients/{idA}` | 403 FORBIDDEN | 403 FORBIDDEN | PASS (Gateway bypass prevented) |

### Database migration and data preservation
- Flyway migration `V1__create_accounts.sql` applied cleanly on `mediconnect_auth`.
- Flyway migration `V2__patient_account_ownership.sql` applied cleanly on `mediconnect_patient`, adding nullable unique `account_id`.
- Pre-existing Phase 2 patient records were preserved intact with `account_id = NULL` (accessible to administrators only).

Reference: Spring Security's [JWT Resource Server documentation](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).

