# MediConnect: Render + Netlify + TiDB Cloud Starter deployment

Current no-card Render Free candidate: see [RENDER_FREE.md](RENDER_FREE.md) and the separate [render-free.yaml](../render-free.yaml). The six-service paid Blueprint below is preserved and is not approved for provisioning. The standalone branch and its proposed GitHub Actions container check still require commit/push approval; the Linux check has not run.

Prepared 16 November 2026 and updated for the owner's TiDB Cloud Starter account. The owner has approved the deployment-source commit/push only, with message `Prepare Render Netlify and TiDB deployment`. No database connection or modification, resource provisioning, paid service, or public deployment is authorized in this review. Existing data and unrelated Phase 3 extraction artifacts are preserved.

## Review and cost approval before provisioning

The draft [render.yaml](../render.yaml) defines six Docker services in Singapore: one public API Gateway and five private services (Eureka, Auth, Patient, Doctor, Appointment). All use the same workspace/region. Auto-deploy is off; Blueprint creation still provisions billable resources and performs an initial deploy. Do not click Apply until the owner approves costs and database setup. No Render disk or Render PostgreSQL is requested.

Current official references checked 16 November 2026:

- [Render free limitations](https://render.com/docs/free): 750 free instance hours per workspace/month, idle spin-down, and no receiving private-network traffic. Private services have no free instance option. Six always-on private-network microservices cannot run on this free allowance.
- [Compute plans](https://render.com/docs/compute-plans) and [pricing](https://render.com/pricing): `0.5c-512mb` is $7/month; `1c-2g` is $25/month. The draft chooses 2 GB per service, **$150/month compute** before taxes, usage, or any workspace upgrade. This is conservative initial capacity, not a measured production memory requirement. Six 512 MB services would be $42/month, but that sizing must pass startup/load tests before use; bounded heap alone does not prove sufficient native/metaspace/thread memory.
- [TiDB Cloud Starter quotas](https://docs.pingcap.com/tidbcloud/serverless-limitations/): eligible MySQL-compatible Starter instances include 5 GiB row storage, 5 GiB columnar storage and 50 million RUs/month. Keep spending limit zero; quotas and one-day free backup retention are real limits. The selected provider is now TiDB, superseding the earlier Aiven recommendation. With zero TiDB spending and Netlify Free, the draft still costs **approximately $150/month Render compute**, before taxes/usage. No paid service is approved.
- [Netlify Free](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/): $0 with 300 credits/month and a hard limit. [Credit usage](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) includes 15 credits per production deploy plus traffic. Confirm the account's actual plan; this is not unlimited hosting.

No paid provisioning is authorized by this guide. Confirm the final dashboard estimate before applying it. No hosting or domain purchase is necessary to review or build these files.

## Changes and boundaries

- Six `application-render.yml` profiles bind to `0.0.0.0` and `PORT`, require actual private hostnames/discovery address and DB credentials, advertise private DNS to Eureka, and expose only minimal health information. Local defaults are retained in the base profiles. Production does not inherit localhost connection fallbacks.
- One [backend/Dockerfile](../backend/Dockerfile) builds the selected `SERVICE`, with every parent reactor module POM present. Only the chosen service's production source/resources enter the build. Tests run separately; test keys and test code are excluded from the image. The obsolete Patient-only Dockerfile is replaced; local Compose now points to the shared file.
- Java 17 build/runtime, non-root user, Render secret-file group access, bounded JVM heap, reduced Tomcat threads, graceful termination, and a container health check are configured. The Docker health check uses container loopback intentionally; inter-service traffic uses private DNS. Render's HTTP `healthCheckPath` applies only to the public gateway; private services get TCP readiness from Render. Check each private service's `/actuator/health` and logs separately.
- Discovery adds Actuator, so all six services expose a health endpoint. A healthy gateway alone does not prove downstream health or registry convergence.
- TiDB TLS uses `VERIFY_IDENTITY`, Java trusted public CA roots, and separate passwords outside JDBC URLs. Custom CA/truststore support remains optional. The four DB services add the `tidb` profile after `render`, shortening pool lifetimes and selecting a supported connection collation. Read-only callbacks reject missing CHECK/FK enforcement or non-pessimistic transactions before Flyway validation/migration. Flyway validation/clean protection and Hibernate `ddl-auto: validate` are retained; existing migration files are unchanged. Full compatibility conditions and permission gates are in [TIDB.md](TIDB.md).
- [netlify.toml](../netlify.toml) builds the existing UI and invokes a small routing generator. Public `API_GATEWAY_ORIGIN` is required; malformed/insecure/local origins fail the Netlify build. `/api/*` is proxied to the public gateway before the React Router fallback. Browser API calls remain same-origin and bearer headers are forwarded. No runtime mock adapter, new browser URL configuration, or UI change is introduced.

## Reproduce verification locally

From the repository root, with installed frontend dependencies and the established Java/Maven setup:

```powershell
Set-Location frontend
npm.cmd test
npm.cmd run build
Set-Location ../backend
.\mvnw.cmd verify
Set-Location ..
node --test deployment/netlify-routing.test.mjs backend/scripts/local-data.test.mjs backend/scripts/local-data-powershell.test.mjs backend/scripts/local-registration.test.mjs
git diff --check
```

For the isolated six-process integration check after packaging:

```powershell
$env:SMOKE_H2_JAR = 'C:\Users\hp\.m2\repository\com\h2database\h2\2.4.240\h2-2.4.240.jar'
node deployment/smoke-stack.mjs --isolated-h2
Remove-Item Env:SMOKE_H2_JAR
```

Use your installed Maven test-scoped H2 path if it differs. This explicitly starts the six packaged Java services with Render profiles on temporary loopback ports. It creates only disposable in-memory H2 data, uses committed test-only RSA fixtures, makes test registrations/bookings, and stops its own processes in `finally`. It does not connect to local or hosted MySQL. Safe results/logs go under ignored `logs/deployment-smoke/`; do not upload raw service logs without checking them.

For the optional browser run, also set `SMOKE_PLAYWRIGHT_MODULE` to an existing installed Playwright module and `SMOKE_CHROMIUM_PATH` to its installed Chromium executable, then run the same command. No new application dependency is required. The helper serves the production `frontend/dist` bundle with a temporary Vite preview proxy to the isolated gateway, creates a fictional patient through the UI, and checks the authenticated journey. This verifies the bundle against real Java services with H2, not Netlify's deployed edge proxy. Clear these optional environment variables afterward. The Windows helper resolves the real Java executable behind the PATH launcher shim so cleanup stops the actual JVMs.

Docker is not installed in the current workspace, so actual Linux image builds/entrypoint execution are pending on a Docker-capable machine or Render. For each of `discovery-server`, `auth-service`, `patient-service`, `doctor-service`, `appointment-service`, `api-gateway`:

```powershell
docker build --build-arg SERVICE=discovery-server -t mediconnect-discovery:review backend
```

Replace `SERVICE` and tag for each image. Validate the Blueprint using the official Render dashboard validator or `render blueprints validate render.yaml` when the Render CLI/account is available. Local syntax/schema checks cannot establish account permissions, plan availability, secret-file access, or live network reachability.

## TiDB Cloud Starter setup (after database-operation approval)

Use the existing **MySQL-compatible** Starter account. Read [TIDB.md](TIDB.md) for the full compatibility matrix, exact console steps, JDBC example and required live checks. No live database was contacted during source verification.

1. Inspect the existing instance, region, intended database branch and spending limit. Keep spending at zero; do not create another instance or reset credentials without permission.
2. After explicit permission for a read-only connection, run [tidb-preflight.sql](tidb-preflight.sql). CHECK support must be ON **before** the existing migrations are applied. TiDB defaults differ from MySQL. If the selected Starter instance cannot enforce CHECKs, stop; it is not a verified target for the current invariant-preserving setup.
3. Only after schema/user/migration permission, create the four missing empty schemas using supported `utf8mb4_0900_bin`, and use separate schema-scoped SQL users. Preserve existing schemas, data, UUIDs and Flyway histories. Do not use the previous MySQL-only `utf8mb4_0900_as_cs` instruction.
4. Set each `*_DB_URL`, `*_DB_USER`, `*_DB_PASSWORD` in the corresponding Render service. Use the exact full/prefixed SQL user and public endpoint DNS/port from TiDB **Connect**. JDBC/TLS details are in TIDB.md. Standard Starter needs no custom CA secret or truststore password; JVM CA roots plus hostname verification are used.
5. After approved migrations, inspect Flyway history, SHOW CREATE TABLE and actual constraint behavior in a disposable test schema. Confirm all four CHECK constraints and three foreign keys are enforced. Verify real JDBC TLS and the two-session slot race/cancellation tests before calling the deployment ready.
6. Review the TiDB **Data -> Backup** page. Free MySQL Starter currently has daily backups and one-day retention. A restore/import/recovery rehearsal is separate, permission-gated work.

To migrate existing data later, stop writes, create a protected consistent backup of **all four** local schemas including Flyway history, and restore only into verified empty hosted schemas after explicit approval. Preserve original binary UUIDs, account hashes, relationships and cancelled history; never re-register existing users or reseed restored doctors to replace them. Retain the original database and backup until row counts, IDs, booking constraints and restore behavior are verified. No export/import, reset, repair, baseline, clean or production deletion is part of these preparation changes.

## RSA keys and Render environment

Generate a new production RSA key pair locally using an approved password-manager/secure terminal workflow, separate from test fixtures and local development. Auth requires a matching PKCS8 private key and X509 public key of at least 2048 bits. Never generate keys during the Docker build or container startup; redeploying must retain signing identity.

Example commands in a private directory outside the repository:

```text
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out jwt-private.pem
openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
```

Restrict local file permissions, keep a protected backup, then enter file contents only in the cloud secret-file dashboard. Add `jwt-private.pem` **only to Auth**; add the same `jwt-public.pem` to Auth, Patient, Doctor and Appointment. Never use `backend/*/src/test/resources/test-*.pem` for a public deployment. The existing decoders enforce issuer, audience `mediconnect-api`, expiry, signature and UUID subject; roles/ownership stay server-side. Private networks do not replace those checks.

Required variable names are also listed without values in [.env.example](.env.example):

| Where | Names |
| --- | --- |
| All Render services (Blueprint) | `SPRING_PROFILES_ACTIVE`, `PORT`, `SERVICE`, `SERVICE_HOSTNAME` |
| All except Discovery (Blueprint) | `DISCOVERY_HOSTPORT` |
| Auth/Patient/Doctor/Appointment | `JWT_ISSUER`, `JWT_PUBLIC_KEY`; profiles `render,tidb` |
| Auth only | `AUTH_DB_URL`, `AUTH_DB_USER`, `AUTH_DB_PASSWORD`, `JWT_PRIVATE_KEY` |
| Patient only | `PATIENT_DB_URL`, `PATIENT_DB_USER`, `PATIENT_DB_PASSWORD` |
| Doctor only | `DOCTOR_DB_URL`, `DOCTOR_DB_USER`, `DOCTOR_DB_PASSWORD` |
| Appointment only | `APPOINTMENT_DB_URL`, `APPOINTMENT_DB_USER`, `APPOINTMENT_DB_PASSWORD` |
| Optional custom CA only (not standard TiDB Starter) | `MYSQL_CA_CERT`, `MYSQL_TRUSTSTORE_PASSWORD`, generated `MYSQL_TRUSTSTORE_URL` |
| Optional JVM override | `JAVA_TOOL_OPTIONS` |
| Netlify build only | `API_GATEWAY_ORIGIN` |

Do not put any DB password, JWT key or application token in Netlify/VITE variables. `SERVICE` is the only Docker build argument declared by this Dockerfile. Render passes environment variables as build arguments automatically, but the build does not declare or consume secret arguments. Secret files are runtime-only.

## Render dashboard steps (after Git and cost approval)

Account access review: the available Render integration is not installed/connected. No matching Netlify or TiDB connector, authenticated CLI, or existing relevant CLI session was found. The user's GitHub connections do not grant this agent cloud account access. Render integration can be connected separately; otherwise follow the manual dashboard steps. No cloud password, API token, private key or DB credential was requested/read. See the access summary in TIDB.md and below.

1. The owner approved source commit/push with `Prepare Render Netlify and TiDB deployment`. Resource/database/public-deployment approval is still separate. Do not force-push or merge main merely to deploy. The following dashboard steps are future actions, not actions executed by this review.
2. In Render, choose **New â†’ Blueprint**, authorize the existing `falcon-2002/mediconnect` repository, and select the branch containing the approved deployment commit (currently the working branch is `phase-6-frontend-integration`). Use root `render.yaml`. Review all six services, selected region, plan charges and the environment-group changes before applying. All services must share workspace/region.
3. After TiDB preflight and database permission, enter per-service DB credentials/URLs in the secure prompts. Standard TiDB Starter does not require a custom truststore password. `sync: false` prompts occur on initial creation; later updates must be made in service settings. No credentials are embedded in the Blueprint.
4. Add `jwt-private.pem` only to Auth and `jwt-public.pem` to all four DB services as described above. No `mysql-ca.pem` is required for standard Starter TLS. Initial startup can fail until these files exist; this is expected and must not be reported as a completed deployment. Save and manually deploy again after completing them. A shared dashboard-managed environment group may distribute the public JWT key to the four DB services; never distribute Auth's private key. Verify the Blueprint sets `render,tidb` only on the four DB services, while Discovery/Gateway use `render`.
5. Start Discovery first, then Auth/Patient/Doctor, then Appointment, then Gateway using **Manual Deploy â†’ Deploy latest commit**. Check each log for bound port, successful Flyway validation, and Eureka registration. Services retry registry connectivity during startup; allow time for client registry/load-balancer caches to converge after changes.
6. From a Render private-service shell, inspect Discovery at `http://DISCOVERY_INTERNAL_HOST:10000/eureka/apps` with `Accept: application/json`. The four business services and gateway must be UP; their advertised hostnames must be Render private DNS, not `127.0.0.1`. Check each `/actuator/health`. The image contains curl for these checks. Eureka must have no public URL.
7. Record the **actual Gateway public HTTPS URL** from its service dashboard. Verify `/actuator/health`, `/api/doctors/catalog`, `/api/doctors`, and anonymous `/api/patients/me` (401). Check Auth, slots and appointment routes as part of the workflow tests. A catalog response establishes Eureka routing to Doctor; it does not establish all other routes.

## Netlify dashboard steps

1. Choose **Add new project â†’ Import an existing project â†’ GitHub**, authorize `falcon-2002/mediconnect`, and select the approved deployment branch.
2. Use root `netlify.toml` (configuration file takes precedence): base `frontend`, build `npm run build && node ../deployment/netlify-routing.mjs`, publish `dist` relative to base, Node 24. Leave the package directory unset unless Netlify explicitly requests the same frontend directory. The existing `frontend/package-lock.json` controls dependencies.
3. Set `API_GATEWAY_ORIGIN` in the **build environment** to the actual public Render HTTPS origin, with no `/api` suffix. It is public configuration, not a token. Do not include credentials, query strings or fragments. Trigger a new build after changing it; the rewrite target is generated at build time.
4. Verify generated `_redirects` in the deploy artifact: `/api/*` â†’ gateway `/api/:splat` with status 200 before `/*` â†’ `/index.html`. No local fallback is supplied. Netlify's static rewrites do not interpolate environment variables directly, so the build script writes the concrete destination.
5. Open the actual `.netlify.app` URL, refresh `/doctors` and `/login` directly, then inspect network requests. All browser API requests should go to `https://ACTUAL_SITE.netlify.app/api/...`; Netlify forwards to Render, including Authorization. No CORS permission is needed for this same-origin topology. No cross-origin CORS wildcard is enabled. Direct-browser calls to the gateway would require a separately reviewed exact-origin CORS configuration; they are not the configured path.
6. Verify API responses have the services' no-store security headers and that authenticated payloads are not cached. Netlify proxy timeouts (26 seconds) and the frontend's 15-second timeout mean always-on backend capacity matters. Never retry uncertain booking writes automatically.

The new hosted schemas start empty. For useful public demo availability, explicitly approve a dedicated demo ADMIN setup and use the existing registration/exact-account SQL bootstrap plus supported ADMIN doctor/slot APIs after connectivity is verified. Public registration remains PATIENT-only. The existing `backend/scripts/local-data.ps1` intentionally accepts loopback endpoints only; do not bypass that protection or report its old local seed as hosted data. Restoring an approved complete database backup is a separate alternative, preserving UUID references. Neither option runs on normal startup.

## Final public verification (pending real account/resources)

Use fictional data. Record HTTP statuses and sanitized checks, never passwords/tokens or patient payloads in screenshots/logs.

- Public frontend and nested-route refresh load without localhost requests or JavaScript errors.
- All six Render services and each DB health check are UP; Eureka advertises private DNS; all four Flyway histories validate. Confirm actual JDBC TLS and restore readiness.
- Register a fresh PATIENT through the UI; supplying a registration role is rejected. Login returns a valid session, bad credentials fail, and invalid/expired JWTs are rejected server-side.
- Create/retrieve the owned patient profile. A second patient cannot read or cancel the first patient's records. Reload and re-login preserve saved profiles/history.
- Browse/search/filter/sort/page doctors, including duplicate names linked to distinct UUIDs. Confirm actual future unbooked availability and the honest empty state. Seed data is never inserted automatically in production; use authorized admin APIs if demo data is needed.
- Book a future slot; a fast double-click sends one UI POST. Attempting to book the same occupied slot returns 409. Verify persisted history, cancel it, retain cancelled history and verify slot release.
- Sign out; private screens require login and public browsing remains available. Browser storage remains empty of JWT/profile data. Verify no CORS/mixed-content errors.
- Restart/redeploy services and verify DB persistence and stable signing keys. Recheck all actual public URLs and inspect sanitized logs. A local H2/browser fixture pass is not a public production pass.

## Actual verification results

Checks executed in this workspace on 16 November 2026:

| Check | Actual result |
| --- | --- |
| Existing frontend unit/integration tests | 41 passed across six files |
| Frontend production build | TypeScript and Vite passed; two existing React Router `use client` warnings remain non-fatal |
| Full Maven reactor `verify` after Render profile/Actuator changes | Six modules packaged; 45 tests passed, zero failures/errors/skips (Appointment 10, Doctor 8, Auth 3, Patient 19, Gateway 5). Discovery subsequently repackaged after correcting its standalone peer URL |
| Local-tool plus Netlify routing regression tests | 26 passed, zero failed; one PowerShell 7 check skipped because it is not installed. Windows PowerShell 5.1 passed |
| Six packaged Java services with Render profiles | All six started and health checks passed. All 15 isolated API checks passed: configured Eureka hostnames, gateway routing, registration/login/JWT rejection, profile ownership, search, real slots, booking via real directory services, duplicate 409, history, cancellation and slot release |
| Chromium against the production bundle + isolated Java stack | All 13 checks passed: registration, login, first profile setup, availability, one booking POST on double click/history, reload/re-login/history, cancellation/history, public browsing after signout, empty browser storage, mobile no-overflow, no JavaScript errors, same-origin API requests and private no-store responses. Uses H2, not hosted MySQL |
| Render Blueprint | Passed the current official Render JSON Schema using AJV 2020-12; all six profile YAML files parsed, service references/bindings/hostname/TLS settings checked |
| Netlify configuration | TOML parsed; concrete API rewrite and SPA fallback generation passed; invalid/local/insecure origins rejected |
| Container entrypoint | POSIX shell syntax and LF endings passed; Linux image/runtime execution pending |
| Secret review | No private-key contents, real token patterns, or credential patterns found in the proposed deployment files. Eight existing tracked RSA fixtures are test-only; no tracked runtime key or environment file was found |
| Existing local standard ports | MySQL 3306 accepts TCP, but no DB credentials/TLS session was used. App services/Vite on their usual ports were unreachable. The isolated stack uses separate temporary ports |

The production bundle includes two `http://localhost` strings inside React Router's URL-parsing fallbacks. Inspection showed these are library URL bases, not MediConnect backend endpoints. Application HTTP requests remain relative `/api/...`; no dependency patch was made to remove inert library strings.

The earlier browser-helper attempts were not full passes: a full page navigation cleared the in-memory session as designed, and the first helper also left a response-wait promise unhandled. The helper now uses React navigation, handles both waits together, and records sanitized failure stages. Windows' Java PATH shim also required launching the real JVM directly for reliable cleanup. Only the final clean run is counted as the completed browser check; it exited 0 after stopping its test processes. Evidence is retained under ignored `logs/deployment-smoke/result.json`; an older `browser-diagnostic.json` describes a prior failed attempt, not the final result.

The earlier Phase 6 live MySQL/Chromium pass is historical evidence from 4 November, not a new hosted deployment result. Hosted MySQL connections/TLS/backup restore, MySQL Testcontainers integration tests (Docker unavailable), Linux Docker builds/secret-file access, Render private DNS, actual Netlify routing, and final public workflows remain pending cloud setup. No actual public deployment URL has been obtained. The prior no-commit instruction was superseded by the owner's explicit approval for this deployment-only commit/push. Cloud database operations, provisioning and public deployment remain unapproved.


## TiDB follow-up: focused verification and account access

The previous 41 frontend tests/build, 45 backend tests/packages, 26 tooling tests, 15 API checks and 13 Chromium checks are retained as **earlier local** evidence. They were not needlessly rerun or relabelled as TiDB/cloud results.

- New offline `TiDbDeploymentChecksTest` tests: **40 passed** (10 in each DB service), zero failures/errors/skips. They verify capability rejection, sanitized SQL errors, profile-only callback registration, merged TLS/pool settings and installed Flyway metadata dispatch. All connections/result sets are mocks; no live SQL was executed.
- The two existing Netlify routing tests were rerun and passed. POSIX entrypoint syntax passed again.
- All four changed DB services repackaged successfully with tests skipped after the focused test pass. Each JAR contains its Render/TiDB profiles and deployment callback, uses Java 17 callback bytecode, and excludes the test private-key resource.
- The updated Blueprint passed the current official Render JSON Schema, topology/private references/profile-selection checks; all production YAML parsed. Netlify TOML and entrypoint shell syntax passed. These are configuration checks, not hosted deployment results.

| Account | Agent access confirmed by this review |
| --- | --- |
| GitHub | Existing authenticated repository access verified; new standalone commit/push is not yet approved |
| Render | CLI v2.36.0 authenticated; My Workspace. Read-only service/log/config checks confirmed the failed manually created Free service; no resource change performed |
| Netlify | CLI v27.10.1 authenticated as satya prakash under Falcon Builds; the last read-only inventory found only the unrelated portfolio site |
| TiDB Cloud Starter | No available matching connector or authenticated CLI found; manual dashboard required. No DB connection authorized or attempted |

The rows describe agent access, including the later 17 November CLI checks, not merely whether the owner is signed into a browser. Render and Netlify login need not be repeated. Live TiDB constraint enforcement, metadata/migrations, JDBC TLS, distributed booking concurrency and Linux container execution remain blockers for a public deployment. The standalone Free path is documented separately; do not apply the paid Blueprint to pursue the no-card goal.

## Remaining setup after the owner's TiDB preflight

The owner now reports the existing MySQL-compatible Starter instance, four databases with zero tables, TiDB 8.5.3, CHECK=1, FK=1, pessimistic mode, NO_AUTO_CREATE_USER present and an empty visible user inventory. These results satisfy the settings expected by the deployment callback, but do not prove full account-inventory visibility, its execution with each app user or successful Flyway migrations. No cloud connection or change was made by the agent in this follow-up.

The read-only inventory is owner-completed. Next follow [TIDB_USERS.md](TIDB_USERS.md), resolve the prefix locally from Connect and review the explicit CREATE/GRANT statements in [tidb-users.proposed.sql](tidb-users.proposed.sql). Refresh only the account/settings checks immediately before manual writes; run one selected statement at a time, with secure password entry outside unverified SQL Editor history. Existing users must not be overwritten or silently adopted. [FLYWAY_PLAN.md](FLYWAY_PLAN.md) describes the separate live migration approval and execution sequence. New source changes in this follow-up are not approved for commit/push by the earlier deployment commit's authorization.

### Cheapest hosting options with the six services preserved

| Configuration | Monthly Render compute before tax/usage | Readiness |
| --- | ---: | --- |
| Existing six 1c-2g services | $150 | Current Blueprint; conservative capacity, still needs Linux/cloud/load verification |
| Discovery/Gateway 512 MB; four DB services 2 GB | $114 | Lower-cost candidate; the two smaller services must be measured first |
| Six 0.5c-512mb services | $42 | Lowest listed always-on paid instance combination for all six; NOT verified to fit or perform adequately |
| Five paid 512 MB private services + Free public Gateway | $35 | Conditional demo-only alternative; Gateway can send private traffic but spins down, has cold-start/quota limits and can exceed frontend/proxy request timeouts. Memory remains unverified |

These are choices for review, not changes to render.yaml or permission to provision. The practical cheapest always-on candidate to benchmark is $42/month; it cannot be called a proven production sizing. Earlier isolated tests used 256 MB Java heaps, which do not bound total process RSS/native/metaspace/thread memory or simulate Render CPU limits. Docker/cgroup and realistic MySQL/TiDB traffic/load measurements are needed before selecting a smaller plan. Upgrade only the service that exceeds its budget rather than assuming all need 2 GB. The existing image's percentage heap bound is not evidence that 512 MB is sufficient.

Render private services cannot use Free instances. A Free gateway has different reliability behavior despite being able to make outbound private requests. Keep the current $150 Blueprint unchanged until a plan and explicit budget are approved. TiDB spending stays zero and Netlify Free remains quota-limited; no paid resource was created.

Sources: [Render pricing](https://render.com/pricing), [compute plans](https://render.com/docs/compute-plans), [free instance limits](https://render.com/docs/free), [private networking](https://render.com/docs/private-network).

### Remaining dashboard actions

- **TiDB:** existing instance -> Connect for the exact prefix/endpoint; SQL Editor or approved existing TLS admin client for the read-only inventory. An organization/GitHub identity is not an application SQL account. User creation/grants require approval of the resolved proposal; migrations require their own approval. Do not recreate schemas or reset passwords.
- **Render:** direct access is still unavailable to this agent. An available Render integration is unconnected; connecting GitHub alone does not change this. Once a budget, user/grant plan and migrations are approved, review New -> Blueprint using the existing repo/branch and root render.yaml. Applying it creates billable services and starts initial deployments even though auto-deploy is off. Add JWT secret files through the dashboard; only Auth receives the private key. Do not click Apply in this preparation step.
- **Netlify:** no matching authenticated connector/CLI was found. After a real Gateway HTTPS origin exists and public deployment is approved, import the same repo/branch with root netlify.toml. Base frontend, publish dist, configured build command and Node 24 are already present. Set build variable API_GATEWAY_ORIGIN to that real origin only. No live origin is known now, so no fabricated value or cloud variable was set. The generated API proxy precedes the SPA fallback and preserves same-origin requests. Do not deploy in this preparation step.

The detailed variable names are unchanged in [.env.example](.env.example). Database passwords/keys belong only in secure local prompts/managers and cloud secret fields, never SQL templates or Git.

### Checks actually executed in this remaining-setup review

- Existing frontend production build: passed TypeScript/Vite; the two known React Router use-client warnings remain non-fatal.
- Existing Netlify routing tests: two passed; no failures. Netlify TOML parsed and entrypoint shell syntax passed.
- Render Blueprint passed the cached official JSON Schema plus six-service/private-reference/profile/binding/TLS checks. All six existing packaged JARs and their production profiles were inspected, not rebuilt or started.
- New SQL templates passed static checks for SELECT/SHOW-only auditing, four CREATE/four scoped GRANT statements, escaped schema wildcard characters, no overwrite/revoke/drop/global-grant operations, and no credential-like content. This is not live SQL syntax/privilege testing: the password markers are intentionally unresolved and non-executable.
- git diff --check passed. No application source, migration, Blueprint plan, cloud environment, user/grant, data or Git history was changed; only six documentation/proposal files are new or modified and remain unstaged/uncommitted. Earlier unit/API/browser results were not rerun as cloud evidence.
