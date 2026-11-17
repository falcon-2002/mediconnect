# Single-process Render Free deployment candidate

Prepared on `deployment/render-free-single-process`. Nothing in this guide authorizes a commit, push, live migration or deployment. The original six services, Dockerfile, `render.yaml` and frontend remain available unchanged. Earlier uncommitted deployment documents and unrelated artifacts are preserved.

## Why the existing Free deployment failed

The existing service `mediconnect-backend` uses the Phase 6 branch, `./backend` context and `./backend/Dockerfile`, on the Free plan. Read-only log inspection confirmed PatientServiceApplication, the default profile and connection-refused/MySQL communications failures. Read-only environment inspection confirmed that SERVICE, SPRING_PROFILES_ACTIVE, SPRING_PROFILES_DEFAULT and PATIENT_DB_URL were absent; no raw environment values or credentials were printed.

That Dockerfile has `ARG SERVICE=patient-service`. Without a supplied build argument, Maven packages Patient Service. A build argument is not a runtime Spring profile; the Docker entrypoint does not activate one. The original Blueprint normally supplies both settings. Manually creating a Free web service from the Dockerfile does not apply the Blueprint's environment variables.

With no active profile and no PATIENT_DB_URL, Patient Service's base `application.yml` selects MySQL at `127.0.0.1:3306/mediconnect_patient`. Loopback means inside the Render container, where no MySQL server runs. This explains the failure; it does not show a failed connection to the real TiDB hostname. Adding a TiDB URL to that one service would still not deploy Auth, Doctor, Appointment or the gateway.

## Implementation and preservation

- The opt-in Maven profile `standalone` adds `backend/standalone-backend`. The normal parent build still contains the original six modules.
- The adapter compiles existing controllers, domain models, repositories and business services directly from their original source trees. It excludes their application bootstraps and per-service infrastructure configuration. It adds no Eureka, gateway or OpenAPI UI runtime.
- One Spring Boot context, one embedded HTTP server and one JVM expose the same `/api/auth`, `/api/patients`, `/api/doctors`, `/api/slots` and `/api/appointments` paths. Netlify still uses its existing API_GATEWAY_ORIGIN setting, now targeting this single backend URL.
- Four independent Hikari pools (maximum two connections each), entity-manager factories, transaction managers and Flyway histories preserve the four schema/user boundaries. Existing unqualified service transactions are qualified by domain package; repository transactions use explicit per-domain manager references. The existing Appointment persistence context uses the Appointment factory. There is no new cross-database distributed transaction.
- A local DirectoryClient adapter replaces only HTTP transport. It reuses the proxied Doctor/Patient services and validates the forwarded JWT before Patient ownership checks. Booking/cancellation ordering, locking and active-slot uniqueness stay in the existing business services. Security context is restored after the lookup; no self-HTTP calls or worker-thread starvation loop is introduced.
- Shared JWT security retains BCrypt cost 12, RS256, issuer/audience/expiry/UUID-subject validation, public browsing and existing role/ownership rules. Each original error handler is scoped to its original controller package.
- No production datasource has a localhost URL or password fallback. Bare DNS JDBC URLs are required; TLS/UTC/collation properties are supplied by the adapter. Production startup checks all four TiDB sessions before any explicitly enabled migration.

## Exact Render settings (review only)

Do not update the existing failed service or create a duplicate without approval. Future deployment should deliberately choose which existing service to update/reuse.

| Field | Value |
| --- | --- |
| Repository | falcon-2002/mediconnect |
| Branch | deployment/render-free-single-process (not pushed yet) |
| Root directory override | Leave empty; paths below are relative to repository root |
| Runtime | Docker |
| Instance | Free, 512 MB |
| Docker context | ./backend |
| Dockerfile | ./backend/standalone-backend/Dockerfile |
| Docker command override | Leave empty |
| SERVICE build argument | Not used by this Dockerfile |
| Health check | /actuator/health |
| Auto deploy | Off until migrations/configuration have been approved and verified |

The root `render-free.yaml` describes one new Free service for review. Render's authenticated read-only validator returned `valid: true`; its plan mentioned one service and one action. Validation did not execute that action. The original six-service paid Blueprint is unchanged. Initial application of even a Free Blueprint provisions and deploys resources, so do not apply it yet.

The image explicitly activates `render-free`, binds `0.0.0.0:${PORT}`, runs as a non-root user, and starts the standalone jar directly. It cannot silently choose Patient Service through a missing build argument.

### Required values and secrets

Enter values only in the corresponding hosting secret/environment controls. Do not save filled environment files, database passwords, PEM keys or token responses in Git.

| Name | Requirement |
| --- | --- |
| AUTH_DB_URL | `jdbc:mysql://<actual-TiDB-DNS-host>:<actual-port>/mediconnect_auth` |
| PATIENT_DB_URL | Same host/port, exact `mediconnect_patient` schema |
| DOCTOR_DB_URL | Same host/port, exact `mediconnect_doctor` schema |
| APPOINTMENT_DB_URL | Same host/port, exact `mediconnect_appointment` schema |
| AUTH_DB_USER | Dedicated full prefixed Auth user |
| AUTH_DB_PASSWORD | That SQL user's private password |
| PATIENT_DB_USER | Dedicated full prefixed Patient user |
| PATIENT_DB_PASSWORD | That SQL user's private password |
| DOCTOR_DB_USER | Dedicated full prefixed Doctor user |
| DOCTOR_DB_PASSWORD | That SQL user's private password |
| APPOINTMENT_DB_USER | Dedicated full prefixed Appointment user |
| APPOINTMENT_DB_PASSWORD | That SQL user's private password |
| JWT_PUBLIC_KEY | `file:/etc/secrets/jwt-public.pem` |
| JWT_PRIVATE_KEY | `file:/etc/secrets/jwt-private.pem` |
| JWT_ISSUER | `mediconnect-auth` |
| SPRING_PROFILES_ACTIVE | `render-free` (already set by image/Blueprint) |
| PORT | Render-provided port; default 10000 |
| MEDICONNECT_MIGRATIONS_ENABLED | `false`; do not enable without separate live-migration approval |
| JAVA_TOOL_OPTIONS | Keep image's measured memory bounds unless retested |

Mount the matching RSA public/private PEM files through Render Secret Files with the filenames above. Use PKCS#8 private and X.509 public encoding, minimum 2048-bit RSA. Do not use committed test keys for a deployed service. Both keys are needed by the one process; no key generation or upload was performed here.

New datasource URL format is intentionally **bare**: no username, password, query parameters or fragment. The driver uses VERIFY_IDENTITY, JVM CA roots, TLS 1.2/1.3, UTC and utf8mb4_0900_bin. A `sslMode=DISABLED` URL cannot override these settings. No custom truststore is needed for standard Starter certificates.

No SERVICE, SERVICE_HOSTNAME, DISCOVERY_HOSTPORT, Eureka or internal service URL variables are required. Netlify needs only the existing API_GATEWAY_ORIGIN build variable set to the final public HTTPS backend origin, without `/api` or credentials. No frontend source/design change is needed.

## Database and migration gate

All four cloud schemas were reported empty by the owner. The agent has not connected to them. Create and verify the approved dedicated users first, with the existing reviewed grants; then obtain separate approval for the five original migrations.

Flyway auto-configuration is excluded. The adapter's default `MEDICONNECT_MIGRATIONS_ENABLED=false` does not execute Flyway migrate; Hibernate validates existing tables rather than creating/updating them. Therefore a startup against empty schemas must fail until migrations have separately been approved and applied. This is intentional, not something to bypass with ddl-auto:update or create.

If explicit future approval enables the migration switch, the adapter runs the unchanged Auth V1, Patient V1/V2, Doctor V1 and Appointment V1 scripts with isolated locations/history tables. It checks all four TiDB connections/capabilities before the first migration, disables clean and baseline-on-migrate, and stops on failure. DDL may partially persist; do not automatically repair, reset, retry or promise rollback. Return the switch to false after the approved migration run. The earlier [FLYWAY_PLAN.md](FLYWAY_PLAN.md) still requires review for the exact live execution target and recovery checkpoint.

## Executed verification

The final clean package succeeded using Java 17 and the existing Maven cache: **10 tests passed, zero failures/errors/skips** (8 integration tests and 2 persistence safety tests). New integration tests exercise public browsing, registration/login, profile ownership, scoped errors, doctor updates/language removal, booking/history/cancellation, duplicate and concurrent booking rejection, JWT claim rejection, four independent histories and transaction-manager selection/rollback. All tests use disposable in-memory H2. Additional safety tests check migrations disabled means no application/history tables are created and credentials are omitted from property diagnostics.

Production-jar inspection confirmed the standalone start class, five byte-identical original migration scripts, and absence of H2, test keys/profile, Eureka, Spring Cloud and OpenAPI UI runtime dependencies. Node/PowerShell script syntax checks, static whitespace/secret-pattern checks and git diff --check passed. The original six service source trees, frontend, original Dockerfile/entrypoint, render.yaml and netlify.toml have no diff. No original service build/test was rerun because its code was not changed; the parent reactor profile declaration was the only original source/build-file edit.

The earlier packaged one-JVM HTTP/memory run completed on Windows with JDK 17.0.1, four disposable H2 databases and test-only signing fixtures injected outside the production jar. These historical measurements preceded the tooling change to generate fresh signing keys at runtime:

| Measurement | Actual result |
| --- | --- |
| Startup to healthy | 21.066 seconds |
| Sustained workload | 90 seconds, 8 concurrent readers |
| Total HTTP requests | 20,886 (20,858 during read load) |
| Memory samples | 442, approximately 250 ms apart |
| Idle resident memory after startup | 297,234,432 bytes (283.46 MiB) |
| Peak resident memory | 387,416,064 bytes (369.47 MiB) |
| Peak sampled private committed memory | 395,878,400 bytes (377.54 MiB) |
| JVM bounds | Heap 192 MiB; metaspace 144 MiB; code cache 48 MiB; direct memory 16 MiB; Serial GC; 512 KiB thread stacks |

The workload also exercised registration/login/profile creation, doctor creation/update, eight simultaneous same-slot booking attempts (one success, seven conflicts), duplicate rejection, history after re-login, cancellation and anonymous/public browsing. The latest ignored machine-readable receipt is `logs/standalone-smoke/result.json`; it contains no credentials or tokens and is replaced on each run. The runner terminates only its own child JVM and memory monitor.

**Assessment: technically feasible and promising for a small demo, not certified to fit Render's 512 MB Linux cgroup limit reliably yet.** These are real Windows process measurements, not heap-only estimates, but Windows working set/private bytes are not Linux cgroup usage. H2 has no TiDB network/TLS round trips or real dataset. Docker and WSL are unavailable here, so the Docker image has not been built/run locally and no hard 512 MB container limit, live TiDB, long-duration stability, public-browser or Render capacity test has passed. Do not interpret the local request rate as Render Free throughput. Render uses a current Temurin 17 image, not this older Windows JDK patch level.

The next capacity gate is the exact Docker image under `--memory=512m --memory-swap=512m`, with an approved disposable MySQL-compatible target and then separately approved TiDB tests. Record cgroup peak memory/OOM events and workload latency; leave headroom for TLS, connection creation and bursts. Do not lower memory settings or weaken security just to force startup. If that gate fails, this candidate is not a reliable Render Free deployment: use a larger-memory backend host/instance or keep the backend local while choosing another host. No paid fallback is approved.

### Reproduce isolated checks on Windows

From `backend`:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17.0.1'
$env:DEBUG = 'false'
$env:TRACE = 'false'
.\mvnw.cmd -o -Pstandalone -pl standalone-backend -am package '-Dlogging.level.root=WARN'
```

From repository root (replace only local tool/cache paths if different):

```powershell
$env:SMOKE_H2_JAR = Join-Path $env:USERPROFILE '.m2\repository\com\h2database\h2\2.4.240\h2-2.4.240.jar'
$env:SMOKE_JAVA_HOME = 'C:\Program Files\Java\jdk-17.0.1'
$env:SMOKE_DURATION_SECONDS = '90'
node deployment/standalone-smoke.mjs --isolated-h2
```

H2 is test-scoped only. The standalone tests and runner now generate fresh RSA signing pairs in temporary directories and delete them afterward. No existing RSA fixture file is read or copied by the standalone tests; the original microservices' tracked test fixtures are preserved unchanged. The isolated profile rejects every URL except `jdbc:h2:mem:`; the runner supplies highest-precedence disposable URLs and never reads runtime signing keys. No cloud account, local application database, patient or appointment is touched.

## GitHub Actions Linux gate: prepared, not executed

Read-only GitHub checks confirmed `falcon-2002/mediconnect` is public, Actions is enabled, no workflows currently exist, and `deployment/render-free-single-process` does not yet exist remotely. Docker is not available locally and WSL is not installed. Consequently no real Linux Docker build or memory-limit result is claimed here.

The proposed [.github/workflows/render-free-container.yml](../.github/workflows/render-free-container.yml) runs only on pushes to this deployment branch. It uses a standard `ubuntu-24.04` runner, read-only contents permission, pinned official action commits, a 20-minute timeout and a job condition that skips execution if the repository becomes private. It uploads no artifacts/caches, reads no repository/cloud secrets, and has no deployment step. Standard hosted runners are free for public repositories; larger runners are not selected. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The first approved branch push can trigger this workflow without changing or merging main. Since GitHub cannot execute unpublished local source/workflows, the request to run Linux CI before any commit/push has a sequencing dependency: a separate, explicitly approved CI bootstrap commit/push is needed first, or a local Linux Docker host must be provided. No API commit, temporary remote branch, workflow dispatch, or other publication was used to bypass the current no-commit/no-push instruction.

The runner will:

1. Run the 10 isolated backend tests, inspect the packaged production jar, and run the six harness/routing tests.
2. Build the **actual** `backend/standalone-backend/Dockerfile` using `backend/` as context, without secrets or build arguments.
3. Copy the jar from that image for inspection. Require the standalone start class, five byte-identical original migrations, no keys/test classes/profile/H2, no Eureka/Spring Cloud/OpenAPI UI runtime, and a non-root image user.
4. Start the exact production ENTRYPOINT with no database credentials and no network. Require the explicit render-free profile/standalone main class and a non-OOM failure rather than a Patient Service/default-database fallback.
5. Start the same production image with test-only H2 injected from a read-only external fixture mount. For this functional fixture only, PropertiesLauncher injects the H2 driver and the isolated profile selects four disposable in-memory databases. No test driver or key is baked into the production image. The image's JVM memory bounds are retained.
6. Enforce `--memory=512m --memory-swap=512m`. Verify Docker HostConfig and cgroup-v2 memory.max are exactly 536870912 bytes, and memory.swap.max is zero. Sample memory.current and kernel-recorded memory.peak throughout startup/workflows/read load.
7. Exercise registration, login, profile setup, doctor browsing/update, concurrent booking (one winner), duplicate rejection, history/re-login and cancellation, plus 90 seconds of eight-client read load. Require a running container, no OOM kill/event, no hard-limit pressure event, and a kernel-recorded peak below the limit.
8. Write only sanitized metrics to `logs/standalone-container/result.json` and the GitHub job summary. Do not upload private keys, raw application logs, real user data, credentials or images. Delete only containers labelled with this test's unique run ID, its image tag and generated fixture files.

The fixture run verifies Linux packaging and bounded runtime behavior, **not** live TiDB TLS, hosted schema compatibility or durable database persistence. Its external H2 driver/isolated profile are explicit test substitutions; it is not a claim that the production TiDB profile was exercised against a cloud database. No Docker CPU limit is imposed, so the result does not establish Render Free request latency or cold-start time.

Local checks rerun after the ephemeral-key change passed: 10 backend tests, six harness/routing tests, production-jar inspection and script syntax checks. The new packaged Windows journey passed 7,020 HTTP requests, with 30 seconds of eight-client read load and startup in 10.353 seconds. Peak resident memory was 374,099,968 bytes (356.77 MiB), and peak sampled private memory was 383,639,552 bytes (365.87 MiB). These remain Windows measurements, not the pending Linux gate.

On an existing Linux Docker host, after the local Maven test/package step and with SMOKE_H2_JAR pointing to the downloaded test dependency:

```sh
node deployment/standalone-container-check.mjs --isolated-h2
```

The script refuses non-Linux execution and offers no live database mode. Do not treat Node unit tests of cgroup parsing or local YAML validation as a completed container test. Initial public deployment is still blocked by the unexecuted Linux gate and the separately approved TiDB connection/user/migration steps.

When Docker becomes available, local build only (no deployment):

```powershell
docker build --file backend/standalone-backend/Dockerfile --tag mediconnect-standalone:local backend
```

Do not run the production image against existing databases until the connection/migration plan is approved. No cloud secrets belong in Docker build arguments, build context or image layers.

## Remaining approval and operational limits

1. Review this branch's source/configuration diff and the new tests. Only the explicit [review manifest](RENDER_FREE_REVIEW.md) is staged for review; nothing is committed or pushed. Unrelated artifacts remain outside the index.
2. Complete the Linux hard-limit/TiDB compatibility gates above. Obtain separate user provisioning and live migration approvals.
3. Review and approve any commit/push, then push this deployment branch only. The cloud cannot build unpushed code.
4. Approve updating the existing Free service versus creating a new one, its secret files/environment and initial public deployment. Do not apply either Blueprint automatically.
5. After a healthy backend exists, set Netlify API_GATEWAY_ORIGIN and approve its Git branch/site deployment. Preserve the unrelated portfolio site.
6. Verify registration, login, ownership, availability, booking races, cancellation, durable TiDB persistence, proxying and nested-route browser refreshes against the actual public URLs before claiming public success.

Render Free spins down after 15 idle minutes and shares 750 free instance hours across the workspace. Cold starts can take about a minute; the existing frontend/proxy timeouts are shorter, so the first API call after idle may fail and require a retry once backend health is ready. No frontend timeout/UI change was made. Without a payment method, exhausted quotas can suspend service; Netlify/TiDB free quotas also apply. Free hosting is a demo option, not an always-on availability promise.

Sources: [Render Free limits](https://render.com/docs/free), [Docker on Render](https://render.com/docs/docker), [Blueprint reference](https://render.com/docs/blueprint-spec).
