# Render Free candidate: pre-commit review

Proposed message: `Prepare single-process MediConnect backend for Render Free`

Branch: `deployment/render-free-single-process`; base commit `db0cbcf60b76ed74983273b580d2b5da1942d8d5`.

Status: **NOT ready for initial public deployment or an all-checks-passed commit.** Local checks pass, but the required real Linux Docker build and hard 512 MiB cgroup test have not executed. No commit, push, workflow run, Render/Netlify deployment or live TiDB operation is authorized by this review.

## Executed checks

- Clean standalone Maven package: 10 tests passed; zero failures/errors/skips. Fresh runtime-generated RSA keys replace references to stored key fixtures in the standalone tests.
- Node container-limit/ephemeral-key and Netlify routing regression tests: 6 passed.
- Production jar inspection passed: correct standalone main class; five byte-identical migrations; no keys, test profile/classes/H2, Eureka, Spring Cloud or OpenAPI UI runtime.
- Latest packaged Windows HTTP journey passed 7,020 requests (30 seconds of eight-client load), including registration/login, profile, doctor browsing/update, same-slot booking race, duplicate rejection, history and cancellation. Peak resident memory: 374,099,968 bytes (356.77 MiB). This is not a Linux cgroup measurement.
- Workflow YAML/safety checks passed: only the deployment branch, standard Ubuntu runner, public-repository guard, read-only contents permission, SHA-pinned official actions, no cloud secrets, no cache/artifact upload, no deployment steps.
- Render Free Blueprint: exactly one Free web service, correct Docker context/path, migrations disabled and auto-deploy off. The authenticated Render validator passed again with one proposed service/action; no resources were created. All 18 environment-variable names cover the standalone placeholders; the 12 database values remain unset secret inputs and JWT settings reference mounted files.
- Original six-service source trees, frontend, original Dockerfile/entrypoint, paid render.yaml and netlify.toml remain unchanged. Only the parent POM adds the opt-in standalone profile.
- No PEM/key, password file, environment file, runtime log, build output, ZIP/patch artifact or real medical record belongs to this proposed file set. Test data is explicitly fictional and ephemeral; existing original microservice RSA fixtures are unchanged and are not staged.

## Linux verification gate and approval dependency

Read-only GitHub API inspection confirmed a public repository with Actions enabled, zero existing workflows and no remote deployment branch. Standard Ubuntu hosted runners in public repositories are free. The workflow skips its job if visibility becomes private and does not use larger runners, caches or uploaded artifacts. See [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

No Docker engine or installed WSL distribution is available locally. GitHub cannot build unpublished local source. A separately approved CI bootstrap commit/push of this reviewed candidate is needed to run the Linux gate, or an existing Linux Docker host must be provided. The first approved push runs CI only on this deployment branch; it does not merge main or deploy Render/Netlify. Its sanitized job summary must be inspected before any deployment-readiness claim. Do not silently use an API commit or another remote branch to bypass approval.

The pending script builds the actual production Dockerfile using backend/ as context, verifies the production ENTRYPOINT/profile and artifact, then tests the same image with an external H2 fixture driver under exactly 512 MiB with swap disabled. It checks cgroup peak memory, memory-pressure/OOM counters and container state. No live TiDB compatibility or persistence claim can be derived from this fixture test; those steps need separate approval.

## Exact staged files (review only)

Only the following paths belong to this candidate. Earlier deployment documentation/SQL is included because the standalone guide references these reviewed provisioning/migration gates. Unrelated Phase 3 artifacts and files/ remain outside the index.

- `.github/workflows/render-free-container.yml`
- `backend/pom.xml`
- `backend/standalone-backend/Dockerfile`
- `backend/standalone-backend/pom.xml`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/DatabaseProperties.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/DomainConfiguration.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/DomainTransactions.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/LocalDirectoryClient.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/PersistenceConfiguration.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/ScopedErrors.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/SecurityConfiguration.java`
- `backend/standalone-backend/src/main/java/com/mediconnect/standalone/StandaloneBackendApplication.java`
- `backend/standalone-backend/src/main/resources/application-render-free.yml`
- `backend/standalone-backend/src/main/resources/application.yml`
- `backend/standalone-backend/src/test/java/com/mediconnect/auth/application/StandaloneTransactionProbe.java`
- `backend/standalone-backend/src/test/java/com/mediconnect/standalone/EphemeralSigningKeys.java`
- `backend/standalone-backend/src/test/java/com/mediconnect/standalone/PersistenceSafetyTest.java`
- `backend/standalone-backend/src/test/java/com/mediconnect/standalone/StandaloneBackendTest.java`
- `backend/standalone-backend/src/test/resources/application-isolated.yml`
- `deployment/DEPLOYMENT.md`
- `deployment/FLYWAY_PLAN.md`
- `deployment/RENDER_FREE.md`
- `deployment/RENDER_FREE_REVIEW.md`
- `deployment/TIDB.md`
- `deployment/TIDB_USERS.md`
- `deployment/container-limits.mjs`
- `deployment/container-limits.test.mjs`
- `deployment/standalone-container-check.mjs`
- `deployment/standalone-fixtures.mjs`
- `deployment/standalone-journey.mjs`
- `deployment/standalone-memory.ps1`
- `deployment/standalone-smoke.mjs`
- `deployment/tidb-user-audit.sql`
- `deployment/tidb-users.proposed.sql`
- `deployment/verify-standalone-artifact.py`
- `render-free.yaml`
