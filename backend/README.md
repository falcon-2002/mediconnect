# MediConnect backend — Phase 1: Patient service

Your frontend runs. This phase creates the first real backend service with Spring Boot and MySQL. It is a separate backend addition; the existing frontend source is not replaced.

## What you will learn

A request travels through **Controller → Service → Repository → MySQL**, then returns a response DTO. Spring creates these objects and supplies their dependencies through constructors. Flyway creates the schema; Hibernate checks it; Spring Data JPA handles persistence.

This service owns patient **profiles**, not appointments, doctor profiles, login credentials, or clinical records. Other services will reference the patient UUID rather than share this service’s entity or tables.

## Prerequisites

- JDK **17** (Java 21 also works). Verify `java -version`.
- Docker Desktop with Linux containers running and Docker Compose v2. Verify `docker version` and `docker compose version`.
- Internet for the first dependency/image download.
- No separately installed Maven is required: Maven Wrapper is included.

Versions: Spring Boot **4.1.1**, springdoc **3.1.1**, Maven **3.9.11**, MySQL **8.4**. This new backend deliberately uses Boot 4 rather than copying the older Boot 3 reference. Java remains 17, matching your backend learning goal. Use the provided files together; Boot 3 tutorial imports/dependencies can differ. We will choose a compatible Spring Cloud release when adding Eureka/gateway.

## Put this beside your frontend

If your existing project contains `src/`, `package.json`, and `vite.config.ts`, place this backend inside a new `backend/` directory:

```text
mediconnect/
  src/                     # existing frontend; leave as-is
  package.json
  vite.config.ts
  backend/                 # contents of this mediconnect-backend folder
    pom.xml
    mvnw
    mvnw.cmd
    compose.yaml
    patient-service/
```

You may also keep the extracted folder named `mediconnect-backend` beside the frontend. Commands below assume your terminal is inside the folder containing the backend `pom.xml` and `compose.yaml`.

## Run: recommended for learning

### 1. Start only MySQL

```powershell
# Windows PowerShell, inside the backend folder
Copy-Item .env.example .env
docker compose up -d --wait patient-db
```

macOS/Linux:

```bash
cp .env.example .env
docker compose up -d --wait patient-db
```

`docker compose ps` should show `patient-db` healthy. MySQL is exposed at **127.0.0.1:3307**, not 3306, to avoid conflicting with a MySQL installation you already have. Database: `mediconnect_patient`; user: `patient_app`; local password: `local_patient_password`.

The supplied credentials are for localhost learning only. Compose reads `.env`; Java does not automatically read that file. Default application settings match `.env.example`. If you change the DB password, also set `PATIENT_DB_PASSWORD` in the terminal that launches Java. Changing a MySQL container’s environment does not reset credentials in an existing database volume.

### 2. Run the fast tests

Windows:

```powershell
.\mvnw.cmd test
```

macOS/Linux:

```bash
chmod +x mvnw
./mvnw test
```

These use **H2 in MySQL compatibility mode**, Flyway, the full Spring context, MockMvc, and JPA. They do not require Docker or touch your running MySQL database. H2 is test-scoped and is not a runtime fallback for the application.

### 3. Run Patient service

Windows:

```powershell
.\mvnw.cmd -pl patient-service spring-boot:run
```

macOS/Linux:

```bash
./mvnw -pl patient-service spring-boot:run
```

Keep the terminal running. At startup, Flyway applies `V1__create_patients.sql`; JPA validates the schema. The application must connect successfully to MySQL before normal startup completes.

Open:

- Health: http://localhost:8081/actuator/health
- Swagger UI: http://localhost:8081/swagger-ui.html
- OpenAPI JSON: http://localhost:8081/v3/api-docs

Expected health response: `{"status":"UP"}`.

### 4. Create and inspect a patient

In Swagger, expand **POST /api/patients**, choose **Try it out**, and send:

```json
{
  "fullName": "Demo Patient",
  "email": "demo.patient@example.com",
  "phone": "9876543210",
  "dateOfBirth": "1995-09-09",
  "address": "Demo Road, Rourkela"
}
```

Expect **201**, a generated UUID, `version: 0`, `active: true`, server-generated UTC timestamps, and a `Location` header. Copy that ID into **GET /api/patients/{id}**. Restart the Java service and GET again to verify MySQL persistence.

Use `requests/patients.http` as a manual checklist or import the requests into Postman. In Windows PowerShell, use `curl.exe` rather than a PowerShell `curl` alias if following curl examples.

### 5. Verify error cases and update behavior

- Repeat the create request: **409**. Emails are trimmed and lowercased.
- Empty name, invalid phone/email, or a future birth date: **400**.
- Unknown patient UUID: **404**.
- PUT requires all profile fields plus the `version` from the latest GET. On a successful change, the version increments. Reusing an old version: **409**.
- DELETE is **soft deactivation**, not physical deletion. It returns **204**, retains the row/UUID, and removes the profile from active GET/list results. Repeating DELETE on that existing inactive ID returns 204. Its email remains reserved.

Example version-aware PUT:

```json
{
  "fullName": "Demo Patient Updated",
  "email": "demo.patient@example.com",
  "phone": "9876543210",
  "dateOfBirth": "1995-09-09",
  "address": "Updated Demo Road, Rourkela",
  "version": 0
}
```

### 6. Run the real MySQL contract tests

With Docker running:

```powershell
.\mvnw.cmd -Pmysql-it verify
```

Or `./mvnw -Pmysql-it verify` on macOS/Linux. Testcontainers creates an isolated disposable MySQL container on a random port, applies the migration, and runs the same API contract as the fast tests. It does not use your development database. If Docker is unavailable this command fails rather than silently skipping the MySQL checks.

## Alternative: run both pieces in Docker

Do not also run the Java service locally on 8081.

```bash
docker compose --profile full up --build -d --wait
docker compose logs -f patient-service
```

The container build runs the fast tests before packaging and starts the application after the database health check succeeds. Check `/actuator/health` afterward: Compose `--wait` ensures service container startup, but the application container has no separate healthcheck. Container images bind their published host ports only to 127.0.0.1.

Stop the stack with `docker compose --profile full down`. The named volume retains database records. Avoid adding `-v` unless you intentionally want to erase the local development database.

## API contract

| Method | Endpoint | Success | Purpose |
| --- | --- | --- | --- |
| POST | `/api/patients` | 201 | Create profile |
| GET | `/api/patients/{id}` | 200 | Get active profile |
| GET | `/api/patients?page=0&size=20` | 200 | List active profiles; size 1–100 |
| PUT | `/api/patients/{id}` | 200 | Replace details with version check |
| DELETE | `/api/patients/{id}` | 204 | Deactivate without losing identity |

The list response is an explicit object: `items`, `page`, `size`, `totalItems`, `totalPages`. We do not serialize JPA entities or Spring’s Page implementation as the public contract. Domain errors use Problem Details (`application/problem+json`) with a stable `code`; field validation adds `fieldErrors`. Framework errors such as invalid UUID/query parameters use standard Spring Problem Details.

## Architecture decisions

- **Separate database ownership:** only Patient service uses this schema. No cross-service foreign keys or shared entity library.
- **Flyway + ddl-auto=validate:** schema changes are reviewed SQL migrations, not automatic Hibernate modifications. Never edit an already-applied V1 migration; add V2 next time.
- **Database uniqueness:** the email precheck gives a readable response, but the SQL unique constraint is the final authority under simultaneous requests. Save/flush exposes failures before returning 201.
- **Optimistic locking:** `@Version` prevents concurrent updates from silently overwriting each other. A version supplied by the client must also match the last-read row. This protects patient updates; it is not the future appointment-slot locking engine.
- **Soft deactivation:** future appointment references can keep a stable patient ID. There is no reactivation endpoint in this phase.
- **Explicit DTOs:** input validation and API fields are separate from persistence. Date of birth is LocalDate; timestamps are UTC Instants; IDs are UUIDs.
- **Constructor injection:** dependencies are visible and testable. There is no field injection and no Lombok requirement.
- **Local development boundary:** API binds to 127.0.0.1 by default. Authentication/RBAC comes in the next security phase. This phase is not ready for public hosting or real patient data. There is no CORS configuration or frontend adapter switch yet.

## Read the implementation in this order

1. `pom.xml`, `patient-service/pom.xml`: versions, module, starters.
2. `application.yml` and `V1__create_patients.sql`: configuration and schema.
3. `domain/Patient.java`: entity identity, timestamps, status, optimistic version.
4. `api/CreatePatientRequest.java`, `UpdatePatientRequest.java`, `PatientResponse.java`: input and output contracts.
5. `persistence/PatientRepository.java`: generated Spring Data queries.
6. `application/PatientService.java`: transactions and business rules.
7. `api/PatientController.java`: HTTP contracts.
8. `api/ApiExceptionHandler.java`: readable failures without echoing SQL/patient values.
9. `PatientApiContract.java`: executable examples shared by both database test modes.

`docs/PHASE_1_LESSON.md` explains these files as a mentor walkthrough. `docs/SOURCE_GUIDE.md` includes the file tree and complete key-file contents.

## What comes next

After this service runs and the manual checks pass: **Eureka + API Gateway**, then **Auth/JWT/RBAC**, then **Doctor service**, then **Appointment service with atomic slot booking**. Later phases connect the frontend to these APIs and add Kafka/Redis where needed. No empty pretend implementations of those services are included here. The later gateway route should preserve `/api/patients/**`; unlike the old reference, do not strip `/api` before forwarding to this controller.

## Reference comparison

The reviewed Java reference uses controller/service/repository/DTO layers, PostgreSQL, patient CRUD, gateway routing, gRPC billing, and Kafka analytics. This phase retains its useful layering while choosing MySQL for your brief, explicit migrations, typed dates, bounded pagination, clearer HTTP errors, optimistic version checks, and preserved identities. Billing/Kafka are deferred because profile creation does not need them to be correct.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Java not found / invalid release | Install JDK 17 or 21; restart the IDE terminal; check JAVA_HOME points to the JDK |
| `docker` cannot connect | Start Docker Desktop and wait for the engine; use Linux containers |
| Port 3307 occupied | Stop only the conflicting local process or change Compose’s host port and PATIENT_DB_URL together |
| Port 8081 occupied | Stop a previous Patient service instance or set SERVER_PORT in your terminal |
| Access denied connecting to MySQL | Check password in the Java terminal and Compose .env; an existing volume retains its original credentials |
| Flyway checksum mismatch | Restore the original migration and add a new migration; do not disable Flyway validation |
| First build takes time | Maven is downloading dependencies; later builds reuse its cache |
| Existing frontend still shows demo data | Expected: the frontend is not connected in Phase 1 |

Official references: https://docs.spring.io/spring-boot/system-requirements.html · https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html · https://springdoc.org/ · https://java.testcontainers.org/modules/databases/mysql/
