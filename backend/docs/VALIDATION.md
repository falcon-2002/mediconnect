# Validation report — Phase 1

- Java: OpenJDK 17.
- Root and service POMs parse and resolve successfully.
- Application and all three test source files compile, including the MySQL Testcontainers contract subclass.
- **Maven package succeeded** and produced an executable Spring Boot JAR. Its final configuration was inspected, and H2 is excluded from the runtime artifact.
- **12 API/database tests passed, 0 failures, 0 errors, 0 skipped.**
- The tests load the full Spring context, execute the actual Flyway V1 migration against H2 in MySQL mode, validate the JPA schema, and exercise HTTP contracts via MockMvc.
- Covered: canonical creation and metadata, GET, duplicate email, database-enforced uniqueness, invalid fields, impossible dates, missing/invalid IDs, successful update/stale version rejection, conflicting email update, soft deactivation/idempotence, pagination limits, health, and generated OpenAPI.
- Maven Wrapper generated using the official Apache Maven Wrapper plugin; Maven distribution pinned to 3.9.11.
- Postman collection JSON, Compose YAML, and Maven XML parsed successfully.
- The final configuration additionally suppresses Hibernate’s SQL error logger so a database constraint failure does not log patient values. The implementation also disables SQL/bind logging and excludes stack traces/error binding values from HTTP responses.
- **Not executed here:** MySQL container startup, Testcontainers MySQL tests, Docker image build, and manual MySQL persistence across restarts. This environment has no Docker engine. The included `-Pmysql-it verify` command is required to verify the database-specific contract on a Docker-enabled machine; it is not silently skipped when Docker is missing.
- H2 compatibility mode is useful feedback but does not prove MySQL behavior. The same shared API tests are ready to run against real MySQL.

Expected informational logs: Flyway may note that the managed H2 test driver is newer than its verified H2 baseline; the migration and tests still pass. springdoc warns that docs endpoints are enabled, as intended for this localhost lesson.
