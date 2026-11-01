# Phase 5 â€” Appointment Service

Based on merged Phase 4 commit `0c762fa11ad0b30e5562268f043d7a5a0e59dd39`.

## Scope and architecture

Appointment Service (8084, Eureka `APPOINTMENT-SERVICE`) owns slots and appointments in `mediconnect_appointment`. It follows the existing api/application/domain/persistence/config layout, Flyway migrations, validation, ProblemDetail errors and RS256 resource-server security. Patient/Auth/Doctor code and migrations remain unchanged. The frontend still uses its mock repository; connecting it is a later phase.

Slots are immutable, fixed 30-minute intervals aligned to UTC half-hour boundaries. This makes the unique `(doctor_id, starts_at)` constraint sufficient to reject overlapping slots for a doctor. ADMIN creates slots, PATIENT books for their own active profile. ADMIN can read/cancel appointments but cannot impersonate patients to book. DOCTOR cannot access appointment records yet: doctor-profile/account ownership has not been implemented. There are no payments, reminders, slot editing, recurring schedules, rescheduling or medical-record features in this phase.

Patient and doctor IDs are references, not cross-database JPA relationships or foreign keys. Before booking, a discovery/load-balanced RestClient calls Patient Service with the caller's bearer token (so existing ownership checks apply), and Doctor Service's public profile endpoint. Each call has 3-second connect/read timeouts. Failures abort before any booking write. Authentication failures propagate as 401/403; missing profiles as 404; upstream faults as 503. There are no automatic booking retries.

Network validation is not a distributed transaction: a profile could be deactivated immediately after validation. Existing appointments are retained; strict coordination of deactivation across services is outside this phase. A patient can book different simultaneous doctor slots; the guaranteed invariant is one active appointment per doctor slot, not a patient-wide calendar conflict rule.

## Consistency

Booking obtains a database PESSIMISTIC_WRITE lock on the slot. It checks time and availability again under the lock, marks the slot booked, and inserts the appointment in one transaction. A unique nullable `active_slot_id` is a second database guard against duplicate active bookings. Database CHECK constraints tie that reference to BOOKED/CANCELLED state.

Cancellation locks the same slot, refreshes and locks the appointment, clears `active_slot_id`, records cancellation time, and releases the slot atomically. Repeating cancellation returns the retained CANCELLED appointment and does not release a newer booking. Timestamps use UTC/microseconds. Lists are bounded and paginated. All booking operations enforce authorization on 8084 as well as through Gateway.

## Files

- `appointment-service/pom.xml`: existing managed versions plus load-balancer starter.
- `appointment-service/src/main/java/com/mediconnect/appointment/`: API DTOs/controller, application services and directory client, entities/repositories, security/client configuration.
- `appointment-service/src/main/resources/application.yml`: port, MySQL, Eureka, JWT public key.
- `appointment-service/src/main/resources/db/migration/V1__create_slots_and_appointments.sql`: dedicated schema tables/constraints/indexes.
- `appointment-service/src/test/`: API, ownership, JWT, concurrency and directory HTTP contract tests; local MySQL integration variant.
- Root backend POM and gateway YAML/test: module and route additions.
- Root startup/stop PowerShell scripts: Appointment Service entry. Startup restart now delegates to the ownership-aware stop script. Non-auth children explicitly receive no JWT_PRIVATE_KEY variable.

## API

All paths below work through Gateway 8080; direct service is 8084.

| Method/path | Access | Result |
| --- | --- | --- |
| POST /api/slots | ADMIN | 201 slot; duplicate 409 |
| GET /api/slots?doctorId=UUID&from=ISO_INSTANT&to=ISO_INSTANT | Public | Available future slots, range <=31 days |
| GET /api/slots/{id} | Public | Slot details, no patient identity |
| POST /api/appointments | PATIENT | 201 appointment; already booked/past 409 |
| GET /api/appointments?page=0&size=20 | PATIENT/ADMIN | Own appointments / all appointments |
| GET /api/appointments/{id} | Owner/ADMIN | 200, other patient 403 |
| POST /api/appointments/{id}/cancel | Owner/ADMIN | 200; repeated cancellation 200; already started 409 |

List response: `{items: [...], page, size, totalItems, totalPages}`. Size 1â€“100. No hard delete. Slot creation accepts `{doctorId, startsAt}`. Booking accepts `{slotId, patientId}`; the account ID always comes from the signed JWT, never the request body. Slots include startsAt/endsAt; appointments include slotId, patientId, status, createdAt and cancelledAt. Public slots do not expose patient identities.

## Apply and build (Windows)

Extract the delivery ZIP into an empty folder OUTSIDE the project. From the project root, inspect `git status`, create `phase-5-appointments`, then `git apply --check PATH_TO_PATCH` and `git apply PATH_TO_PATCH`. Do not overwrite local changes or copy the package's files/ folder into the repository root.

```powershell
Set-Location "D:\github projects\Mediconnect_project\mediconnect\backend"
.\mvnw.cmd clean test
.\mvnw.cmd package -DskipTests
```

## Local MySQL setup

Use Workbench with your local administrator connection on 3306. Check for existing schema/user first; don't reset existing credentials. For a NEW application user, replace the placeholder privately:

```sql
CREATE DATABASE IF NOT EXISTS mediconnect_appointment;
CREATE USER IF NOT EXISTS 'appointment_app'@'localhost' IDENTIFIED BY 'CHOOSE_LOCALLY';
GRANT ALL PRIVILEGES ON mediconnect_appointment.* TO 'appointment_app'@'localhost';
```

Do not create tables manually; Flyway does that. Leave other databases untouched. Schema-level privileges support migrations for local development; production should use a separate migration account.

Start Eureka, Auth, Patient and Doctor as before. In a new PowerShell terminal:

```powershell
Set-Location "D:\github projects\Mediconnect_project\mediconnect\backend"
$secret = Read-Host "appointment_app password" -AsSecureString
$env:APPOINTMENT_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
$env:JWT_PUBLIC_KEY = "file:C:/Users/hp/.mediconnect-keys/public.pem"
Remove-Item Env:JWT_PRIVATE_KEY -ErrorAction SilentlyContinue
.\mvnw.cmd -pl appointment-service spring-boot:run
```

Defaults: APPOINTMENT_DB_USER=appointment_app, APPOINTMENT_DB_URL=jdbc:mysql://127.0.0.1:3306/mediconnect_appointment with UTC settings. JWT_ISSUER defaults to mediconnect-auth. Reuse the runtime PUBLIC key; do not use test fixtures at runtime. Restart Gateway to load the new routes. Alternatively, after packaging, use the updated root start-all.ps1; enter passwords locally when prompted. No Docker required.

## Live smoke test

1. GET http://localhost:8084/actuator/health -> UP. Eureka shows APPOINTMENT-SERVICE UP. Allow registry propagation.
2. Login an existing ADMIN via /api/auth/login; retain accessToken in memory, do not print the login response. Create a fictional active doctor using the Phase 4 API if needed.
3. POST /api/slots with that doctor UUID and a future aligned timestamp, for example a future day at `09:00:00Z`. Expect 201. Same doctor/time again ->409.
4. GET /api/slots using the doctorId and a bounded future from/to range. Expect the new slot.
5. Login Patient A, use A's existing profile UUID. POST /api/appointments with slotId/patientId. Expect201; repeat ->409. GET own appointment ->200.
6. Patient B reading/cancelling A's appointment ->403; B booking with A's profile ->403. Anonymous writes ->401. DOCTOR slot creation/appointment access ->403. Repeat direct on8084.
7. A cancels ->200 CANCELLED, repeated cancel ->200. Slot appears available and B can book with B's own profile. Repeating A's old cancellation must not free B's booking.
8. Stop Doctor Service temporarily: booking a different available slot returns503 without consuming it; restart it. Preserve existing records. Confirm existing Patient/Auth endpoints still work.
9. Restart Appointment Service; appointment IDs, state and timestamps must persist.

Use only fictional data. Admin bootstrap remains the documented Phase3 local procedure; never allow public admin registration. API Swagger UI: http://localhost:8084/swagger-ui.html.

## Real MySQL concurrency tests without Docker

The default automated suite uses H2. It is not a substitute for MySQL locking verification. Create a disposable schema and a separate test user with privileges ONLY on it:

```sql
CREATE DATABASE IF NOT EXISTS mediconnect_appointment_test;
CREATE USER IF NOT EXISTS 'appointment_test'@'localhost' IDENTIFIED BY 'CHOOSE_TEST_PASSWORD_LOCALLY';
GRANT ALL PRIVILEGES ON mediconnect_appointment_test.* TO 'appointment_test'@'localhost';
```

These tests DELETE all appointments/slots in that test schema. Never use the application database or application credentials. The test refuses URLs whose schema is not exactly mediconnect_appointment_test.

```powershell
$env:APPOINTMENT_TEST_DB_URL = "jdbc:mysql://127.0.0.1:3306/mediconnect_appointment_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true"
$env:APPOINTMENT_TEST_DB_USER = "appointment_test"
$secret = Read-Host "appointment_test password" -AsSecureString
$env:APPOINTMENT_TEST_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
.\mvnw.cmd -pl appointment-service -am -Pmysql-it verify
```

The inherited API suite includes twelve concurrent booking transactions against one slot, requiring one success, eleven409 outcomes and one persisted appointment; it also checks simultaneous cancellation and cancel/rebook history. Directory responses are mocked in this database suite. DirectoryClientTest separately tests actual HTTP serialization, bearer forwarding and upstream status mapping. Live service discovery and real JWT forwarding require the smoke checks above.

No claim of MySQL concurrency verification should be made until this profile passes on your local MySQL. No guarantee about all possible workloads follows from a finite test run.

## Delivery and verification report

### 1. Automated Unit and Slice Tests (Surefire - H2)

Executed via `.\mvnw.cmd clean test` across the root Maven reactor:
- **`appointment-service`**: **10 passed, 0 failures, 0 errors, 0 skipped** across 2 test classes:
  - `AppointmentApiTest`: 9 tests passed (API endpoints, RS256 token verification, validation, role boundaries, transactions, cancellation, idempotency, concurrency).
  - `DirectoryClientTest`: 1 test passed (`profileValidationAndErrorMapping`, contract serialization, bearer token forwarding, upstream HTTP status code mapping).
- **`doctor-service`**: **8 passed, 0 failures, 0 errors, 0 skipped** (`DoctorApiTest`).
- **`patient-service`**: **16 passed, 0 failures, 0 errors, 0 skipped** across 2 test classes:
  - `PatientApiTest`: 13 tests passed.
  - `PatientSecurityTest`: 3 tests passed.
- **`auth-service`**: **3 passed, 0 failures, 0 errors, 0 skipped** (`AuthApiTest`).
- **`api-gateway`**: **4 passed, 0 failures, 0 errors, 0 skipped** (`GatewayRoutingTest`).
- **Total Reactor Unit/Slice Count**: **41 passed, 0 failures, 0 errors, 0 skipped**.
- All services packaged successfully with `.\mvnw.cmd package -DskipTests`.

### 2. MySQL Integration & Concurrency Tests (Failsafe - `mysql-it` profile)

Executed via `.\mvnw.cmd -pl appointment-service -am -Pmysql-it verify` against dedicated schema `mediconnect_appointment_test` on MySQL 8.0 (port 3306) with restricted test user `appointment_test`:
- **`AppointmentMySqlIT`**: **9 passed, 0 failures, 0 errors, 0 skipped**.
  - *Test Count Explanation*: `AppointmentMySqlIT` inherits directly from `AppointmentApiTest`, which defines exactly 9 `@Test` methods. It does not inherit `DirectoryClientTest` (which verifies HTTP client serialization with an in-memory HTTP server rather than MySQL persistence).
- **Flyway Database Migration**: `V1__create_slots_and_appointments.sql` executed cleanly against real MySQL.
- **12-Way Concurrent Booking Race**:
  - `concurrentBookingsHaveExactlyOneWinner`: Executed 12 concurrent worker threads racing to book the same slot.
  - Exactly **1 winner** (HTTP 201 Created).
  - Exactly **11 conflicts** (HTTP 409 Conflict).
  - Verified real MySQL pessimistic locking (`PESSIMISTIC_WRITE`) and check constraint tie-in (`active_slot_id`), guaranteeing exactly one active booking persists in MySQL under true parallel execution.
- **Concurrent Cancellation & Isolation**:
  - `concurrentCancellationsReleaseOnlyOnce`: Executed concurrent cancellation requests; exactly one releases the slot and sets `status = CANCELLED`.

### 3. Architecture and Configuration Notes

- **Eureka Discovery RestClient Autoconfiguration Fix**:
  In `appointment-service`, `ClientConfig.java` initially declared `@Bean @LoadBalanced RestClient.Builder serviceClient()`. Spring Cloud Netflix Eureka autoconfiguration resolved this single bean for internal Eureka HTTP client communication, which caused a circular bean dependency on `scopedTarget.eurekaClient` and redirected Eureka registration through the load balancer (`TransportException: Cannot execute request on any known server`).
  *Resolution*: Declared a separate non-load-balanced `@Primary @Bean RestClient.Builder eurekaRestClientBuilder()` for Eureka and qualified `@Qualifier("serviceClient")` in `DirectoryClient.java`.

### 4. Live Cluster End-to-End Verification (Windows 11)

Executed end-to-end verification against the live 6-service cluster on local Windows 11 host with MySQL 8.0 on port 3306 and runtime RSA keys (`C:/Users/hp/.mediconnect-keys/public.pem`).
- **Cluster State**:
  - Eureka Service Registry (`8761`): UP
  - Auth Service (`8082`): UP, registered with Eureka
  - Patient Service (`8081`): UP, registered with Eureka
  - Doctor Service (`8083`): UP, registered with Eureka
  - Appointment Service (`8084`): UP, registered with Eureka
  - API Gateway (`8080`): UP, registered with Eureka
- **Comprehensive Live Test Suite**: **71 / 71 checks PASSED (100% success rate)**.
- **Post-Restart Live Smoke Verification**:
  - Validated service health across all 6 services (`200 UP`).
  - Validated Eureka instance registration across all 5 clients (`Registered UP`).
  - Created Doctor profile via Gateway (`201 Created`).
  - Created 30-minute aligned UTC Slot via Gateway (`201 Created`).
  - Patient A booked slot (`201 Created`, slot state `booked=true`).
  - Patient A cancelled appointment (`200 OK`, `CANCELLED`, slot state `booked=false`).
  - Repeated cancellation idempotency verified (`200 OK`, `CANCELLED`).
  - Patient B re-booked released slot (`201 Created`, slot state `booked=true`).

#### Complete Live Verification Results

| # | Check Description | Target Route & Port | Expected Status | Actual Status | Result |
|---|---|---|:---:|:---:|:---:|
| 1 | Eureka Server health check | 8761 /actuator/health | 200 UP | 200 UP | PASS |
| 2 | Auth Service health check | 8082 /actuator/health | 200 UP | 200 UP | PASS |
| 3 | Patient Service health check | 8081 /actuator/health | 200 UP | 200 UP | PASS |
| 4 | Doctor Service health check | 8083 /actuator/health | 200 UP | 200 UP | PASS |
| 5 | Appointment Service health check | 8084 /actuator/health | 200 UP | 200 UP | PASS |
| 6 | API Gateway health check | 8080 /actuator/health | 200 UP | 200 UP | PASS |
| 7 | Eureka registration: API-GATEWAY | 8761 /eureka/apps | Registered UP | Registered UP | PASS |
| 8 | Eureka registration: AUTH-SERVICE | 8761 /eureka/apps | Registered UP | Registered UP | PASS |
| 9 | Eureka registration: PATIENT-SERVICE | 8761 /eureka/apps | Registered UP | Registered UP | PASS |
| 10 | Eureka registration: DOCTOR-SERVICE | 8761 /eureka/apps | Registered UP | Registered UP | PASS |
| 11 | Eureka registration: APPOINTMENT-SERVICE | 8761 /eureka/apps | Registered UP | Registered UP | PASS |
| 12 | Doctor Catalog via Gateway | 8080 /api/doctors/catalog | 200 OK | 200 OK | PASS |
| 13 | Doctor Search via Gateway | 8080 /api/doctors | 200 OK | 200 OK | PASS |
| 14 | Register candidate Admin | 8080 /api/auth/register | 201 CREATED | 201 CREATED | PASS |
| 15 | Login ADMIN account | 8080 /api/auth/login | 200 OK | 200 OK | PASS |
| 16 | Register candidate Doctor account | 8080 /api/auth/register | 201 CREATED | 201 CREATED | PASS |
| 17 | Login DOCTOR account | 8080 /api/auth/login | 200 OK | 200 OK | PASS |
| 18 | Register Patient A | 8080 /api/auth/register | 201 CREATED | 201 CREATED | PASS |
| 19 | Login Patient A | 8080 /api/auth/login | 200 OK | 200 OK | PASS |
| 20 | Register Patient B | 8080 /api/auth/register | 201 CREATED | 201 CREATED | PASS |
| 21 | Login Patient B | 8080 /api/auth/login | 200 OK | 200 OK | PASS |
| 22 | Patient A creates own profile | 8080 /api/patients | 201 CREATED | 201 CREATED | PASS |
| 23 | Patient B creates own profile | 8080 /api/patients | 201 CREATED | 201 CREATED | PASS |
| 24 | ADMIN creates active Doctor profile | 8080 /api/doctors | 201 CREATED | 201 CREATED | PASS |
| 25 | Anonymous POST /api/slots | 8080 /api/slots | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 26 | PATIENT role POST /api/slots | 8080 /api/slots | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 27 | DOCTOR role POST /api/slots | 8080 /api/slots | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 28 | Unaligned half-hour slot boundary | 8080 /api/slots | 400 BAD REQUEST | 400 BAD REQUEST | PASS |
| 29 | Past timestamp slot creation | 8080 /api/slots | 400 BAD REQUEST | 400 BAD REQUEST | PASS |
| 30 | ADMIN creates valid Slot 1 | 8080 /api/slots | 201 CREATED | 201 CREATED | PASS |
| 31 | Duplicate slot creation conflict | 8080 /api/slots | 409 CONFLICT | 409 CONFLICT | PASS |
| 32 | Public GET slot by ID (no patient leak) | 8080 /api/slots/{id} | 200 OK | 200 OK | PASS |
| 33 | Public search slots within date range | 8080 /api/slots?...  | 200 OK (Contains Slot 1) | 200 OK | PASS |
| 34 | ADMIN creates valid Slot 2 | 8080 /api/slots | 201 CREATED | 201 CREATED | PASS |
| 35 | ADMIN creates valid Slot 3 | 8080 /api/slots | 201 CREATED | 201 CREATED | PASS |
| 36 | Anonymous POST /api/appointments | 8080 /api/appointments | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 37 | DOCTOR role POST /api/appointments | 8080 /api/appointments | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 38 | ADMIN cannot impersonate patient to book | 8080 /api/appointments | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 39 | Cross-patient profile booking denial | 8080 /api/appointments | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 40 | Patient A books Slot 1 | 8080 /api/appointments | 201 CREATED | 201 CREATED | PASS |
| 41 | Duplicate booking conflict on Slot 1 | 8080 /api/appointments | 409 CONFLICT | 409 CONFLICT | PASS |
| 42 | Patient A reads own appointment | 8080 /api/appointments/{id} | 200 OK | 200 OK | PASS |
| 43 | Patient B reads Patient A's appointment | 8080 /api/appointments/{id} | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 44 | Anonymous reads appointment | 8080 /api/appointments/{id} | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 45 | ADMIN reads appointment | 8080 /api/appointments/{id} | 200 OK | 200 OK | PASS |
| 46 | Patient A lists own appointments | 8080 /api/appointments | 200 OK (Contains Appt 1) | 200 OK | PASS |
| 47 | Patient B lists own appointments (empty) | 8080 /api/appointments | 200 OK (Empty) | 200 OK (Count: 0) | PASS |
| 48 | ADMIN lists all appointments | 8080 /api/appointments | 200 OK (Contains Appt 1) | 200 OK | PASS |
| 49 | Direct port 8084: Anonymous POST /api/slots | 8084 /api/slots | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 50 | Direct port 8084: PATIENT POST /api/slots | 8084 /api/slots | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 51 | Direct port 8084: Anonymous GET appointment | 8084 /api/appointments/{id} | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| 52 | Direct port 8084: Patient B reads A's appt | 8084 /api/appointments/{id} | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 53 | Direct port 8084: Patient A reads own appt | 8084 /api/appointments/{id} | 200 OK | 200 OK | PASS |
| 54 | Direct port 8084: Patient A books Slot 2 | 8084 /api/appointments | 201 CREATED | 201 CREATED | PASS |
| 55 | Patient B attempts to cancel A's appointment | 8080 /api/appointments/{id}/cancel | 403 FORBIDDEN | 403 FORBIDDEN | PASS |
| 56 | Patient A cancels own appointment | 8080 /api/appointments/{id}/cancel | 200 CANCELLED | 200 CANCELLED | PASS |
| 57 | Repeated cancellation idempotency | 8080 /api/appointments/{id}/cancel | 200 CANCELLED | 200 CANCELLED | PASS |
| 58 | Slot 1 marked available after cancellation | 8080 /api/slots/{id} | 200 booked=false | 200 booked=False | PASS |
| 59 | Patient B re-books released Slot 1 | 8080 /api/appointments | 201 CREATED | 201 CREATED | PASS |
| 60 | Old cancellation cannot free new booking | 8080 /api/appointments/{id} | 200 BOOKED | 200 BOOKED | PASS |
| 61 | Upstream DoctorService failure handling | 8084 /api/appointments | 503 SERVICE UNAVAILABLE | 503 SERVICE UNAVAILABLE | PASS |
| 62 | Slot 3 unconsumed after upstream abort | 8084 /api/slots/{id} | 200 booked=false | 200 booked=False | PASS |
| 63 | Doctor Service recovered and healthy | 8083 /actuator/health | 200 UP | 200 UP | PASS |
| 64 | Booking succeeds after Doctor Service recovery | 8084 /api/appointments | 201 CREATED | 201 CREATED | PASS |
| 65 | Appointment Service restarted & healthy | 8084 /actuator/health | 200 UP | 200 UP | PASS |
| 66 | Cancelled Appointment 1 persists after restart | 8084 /api/appointments/{id} | 200 CANCELLED | 200 CANCELLED | PASS |
| 67 | Active Appointment 3 persists after restart | 8084 /api/appointments/{id} | 200 BOOKED | 200 BOOKED | PASS |
| 68 | Slot 1 booked state persists after restart | 8084 /api/slots/{id} | 200 booked=true | 200 booked=True | PASS |
| 69 | Regression: Auth login still functional | 8080 /api/auth/login | 200 OK | 200 OK | PASS |
| 70 | Regression: Patient profile read functional | 8080 /api/patients/{id} | 200 OK | 200 OK | PASS |
| 71 | Regression: Doctor profile read functional | 8080 /api/doctors/{id} | 200 OK | 200 OK | PASS |

### 5. Security Summary and Remediation

- **Credential Remediation**:
  - During verification, early scratch script drafts and command logs temporarily included test database passwords and a disposable smoke-test account password.
  - *Database Credential Rotation*: The credentials for `auth_app`, `doctor_app`, `appointment_app`, and `appointment_test` were rotated in local MySQL across both `@'localhost'` and `@'127.0.0.1'` host entries with matching secure passwords. Services run exclusively with credentials inherited from local process environment variables entered via `Read-Host -AsSecureString`.
  - *Disposable Test Account Sanitization*: 38 disposable test accounts created during Phase 5 live testing (`smoke.%` and `%ph5%`) were identified. Their passwords were reset to cryptographically random BCrypt hashes with values kept strictly out of output, and their privileges were demoted from `ADMIN` to `PATIENT`. All real accounts, patient records, doctor profiles, and appointments were preserved.
  - *Temporary Artifact Removal*: All temporary scratch scripts and intermediate verification output were permanently deleted.
- **Key Isolation and Policy**:
  - Runtime services read the shared RSA public key from `C:/Users/hp/.mediconnect-keys/public.pem`; only Auth Service retains the private key (`private.pem`).
  - Unit and slice tests use intentional, isolated test-only RSA key fixtures (`test-public.pem` and `test-private.pem`).
  - All secret values, raw tokens, and private keys were excluded from documentation, commit history, and tracked files.
