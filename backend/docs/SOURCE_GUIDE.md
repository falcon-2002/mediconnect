# MediConnect backend Phase 1 — complete source guide

This guide contains the full key-file contents for the runnable Patient service. The ZIP includes the standard generated Maven Wrapper scripts; their contents are not duplicated below. No frontend files are replaced.

## File tree

```text
mediconnect-backend/
  .mvn/
    wrapper/
      maven-wrapper.properties
  docs/
    PHASE_1_LESSON.md
    VALIDATION.md
  patient-service/
    src/
      main/
        java/
          com/
            mediconnect/
              patient/
                api/
                  ApiExceptionHandler.java
                  CreatePatientRequest.java
                  PatientController.java
                  PatientPage.java
                  PatientResponse.java
                  UpdatePatientRequest.java
                application/
                  PatientException.java
                  PatientService.java
                config/
                  ApplicationConfig.java
                domain/
                  Patient.java
                persistence/
                  PatientRepository.java
                PatientServiceApplication.java
        resources/
          db/
            migration/
              V1__create_patients.sql
          application.yml
      test/
        java/
          com/
            mediconnect/
              patient/
                PatientApiContract.java
                PatientApiTest.java
                PatientMySqlIT.java
        resources/
          application-test.yml
    Dockerfile
    pom.xml
  requests/
    MediConnect_Phase_1.postman_collection.json
    patients.http
  .dockerignore
  .env.example
  .gitignore
  README.md
  compose.yaml
  mvnw
  mvnw.cmd
  pom.xml
  docs/SOURCE_GUIDE.md
```

Generated target/ directories are excluded from the source archive. This guide does not recursively include itself.

## README.md

````markdown
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
````

## docs/PHASE_1_LESSON.md

````markdown
# Phase 1 lesson — understanding the first service

Goal: send an HTTP request, validate it, write a patient to MySQL, and read it back after restarting the service. Do this before introducing Eureka, JWT, Kafka, or Redis.

## 1. Understand the boundary before the classes

Patient service answers: **Who is this patient, and what are their profile details?**

Doctor service will answer: **Who can provide care?** Appointment service will answer: **Which slot belongs to which patient, with which doctor?** Auth service will answer: **Who is making this request, and what are they allowed to do?**

We do not put booking state into the Patient table. A later appointment row will keep `patientId`, not a JPA `@ManyToOne` to Patient service’s entity. Such an annotation would require a shared database and blur ownership.

This phase is a standalone microservice foundation. One runnable service does not yet constitute the whole distributed system.

## 2. Establish the build and database

Read `pom.xml` at the backend root. `packaging=pom` and `<modules>` mean it organizes builds. It does not run as a server. `patient-service/pom.xml` selects the dependencies and produces the executable JAR.

Important starters:

- `spring-boot-starter-webmvc`: controller routing and embedded HTTP server.
- `spring-boot-starter-data-jpa`: JPA/Hibernate and Spring Data repositories.
- `spring-boot-starter-validation`: Jakarta Bean Validation.
- `spring-boot-starter-flyway` + `flyway-mysql`: migration startup integration and MySQL support.
- `mysql-connector-j`: JDBC communication with MySQL.
- Actuator: small health endpoint; springdoc: generated OpenAPI/Swagger.

Maven inherits compatible library versions from Spring Boot instead of pinning Hibernate, Jackson, and Spring independently. springdoc is explicitly pinned separately.

Read `compose.yaml`. `patient-db` is a container DNS name when Java also runs in Docker. `127.0.0.1:3307` is used when Java runs on your computer. The datasource URL changes with the process’s network context; the database name stays the same.

Run `docker compose up -d --wait patient-db`. Then run the service following README. If MySQL is unavailable, resolve that before continuing.

## 3. Give schema ownership to Flyway

Read `patient-service/src/main/resources/db/migration/V1__create_patients.sql`.

`patients.id` is the primary key. `uq_patients_email` prevents duplicate canonical email addresses even if two requests pass the application precheck together. `active, created_at, id` supports the active-list access pattern.

Flyway records successful migrations in `flyway_schema_history`. The V1 script is applied once. JPA runs with `ddl-auto=validate`, so mismatched entity/schema definitions cause startup failure. We do not use `ddl-auto=update` to silently evolve data.

Verify in MySQL Workbench at 127.0.0.1:3307:

```sql
SHOW TABLES;
SELECT version, description, success FROM flyway_schema_history;
SELECT BIN_TO_UUID(id), full_name, email, active, version FROM patients;
```

Use fictional data in these checks.

## 4. Follow one POST through the application

### HTTP boundary — `api/PatientController.java`

```java
@PostMapping
public ResponseEntity<PatientResponse> create(@Valid @RequestBody CreatePatientRequest request) {
    var response = service.create(request);
    var location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
            .buildAndExpand(response.id()).toUri();
    return ResponseEntity.created(location).body(response);
}
```

`@RequestBody` converts JSON into the request record. `@Valid` applies field constraints. The controller translates HTTP input/output; it does not run database queries itself. `201 Created` and `Location` tell the client where the new resource is.

### Input contract — `api/CreatePatientRequest.java`

The request record has `fullName`, `email`, `phone`, `dateOfBirth`, and `address`. Its compact constructor trims strings and lowercases email before validation. `LocalDate` represents a birthday without timezone ambiguity. `@Past` rejects today/future birth dates in this learning contract. No client-provided `id`, `active`, version, or registration timestamp is accepted for creation.

### Business operation — `application/PatientService.java`

```java
@Transactional
public PatientResponse create(CreatePatientRequest request) {
    if (repository.existsByEmail(request.email())) throw new PatientException(EMAIL_TAKEN);
    var patient = new Patient(request.fullName(), request.email(), request.phone(),
            request.dateOfBirth(), request.address(), Instant.now(clock));
    return PatientResponse.from(repository.saveAndFlush(patient));
}
```

`@Transactional` groups persistence work into a database transaction. If a write fails, the transaction rolls back. The precheck improves the error response; the database unique constraint remains the authority.

`Clock` is injected rather than hard-coded inside every method, allowing controlled time in future unit tests. The current application uses UTC.

`saveAndFlush` asks JPA to issue SQL before we build the success response. We return an explicit DTO, not the managed entity.

### Persistence — `persistence/PatientRepository.java`

```java
public interface PatientRepository extends JpaRepository<Patient, UUID> {
    Optional<Patient> findByIdAndActiveTrue(UUID id);
    Page<Patient> findByActiveTrue(Pageable pageable);
    boolean existsByEmail(String email);
    boolean existsByEmailAndIdNot(String email, UUID id);
}
```

Spring Data creates this repository implementation at runtime. Method names describe query conditions. `JpaRepository` supplies `saveAndFlush`, `findById`, and other basic operations.

### Stored model — `domain/Patient.java`

`@Entity` maps a Java object to a table. UUID identity is generated server-side. The protected empty constructor is for JPA. Business changes use `update`/`deactivate` instead of exposing a setter for every field. `@Version` is maintained by Hibernate.

### Response — `api/PatientResponse.java`

The response record explicitly selects API fields. Future persistence-only fields can stay off the public API, and another service does not need the entity class just to read the JSON.

## 5. Understand dependency injection

```java
public PatientService(PatientRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock;
}
```

The service declares what it needs. Spring finds the repository bean and the Clock bean and passes them to this constructor. That is constructor dependency injection. The class does not create a database connection or call `new PatientRepository()`.

`@SpringBootApplication` scans packages beneath `com.mediconnect.patient`, finds components/configuration, and starts the application. Keeping the main class above the subpackages makes component scanning predictable.

## 6. Protect updates and retain identities

Suppose two screens both read `version: 0`. The first sends PUT with version 0, changes the row, and gets version 1. The second still sends version 0 and receives 409 instead of overwriting newer information. If two transactions both load version 0 before either commits, Hibernate’s `@Version` check is the final protection at the SQL update.

This is **optimistic locking for profile updates**. It does not prove the future appointment engine is concurrency-safe. Booking will need its own transactional slot-claim rule and concurrent integration tests.

DELETE sets `active=false`. The row remains available for future historical references. The normal GET/list routes only return active profiles. Repeated deactivation of an existing inactive row succeeds without another change. Unknown IDs still return 404. Reactivation and legal data-retention policies are outside this phase.

## 7. Read errors as part of the API

`ApiExceptionHandler` maps missing profiles to 404; duplicate email and stale versions to 409; invalid request fields/JSON to 400. Problem Details describes the error without returning SQL, stack traces, or rejected patient values. Field validation includes field names and safe validation messages.

Pagination is bounded to size 1–100 so callers cannot accidentally request an unbounded patient list. The current list route is for local API learning; the auth phase will restrict it to appropriate roles rather than expose a global patient directory.

## 8. Verify the implementation

1. Fast tests: `mvnw.cmd test` or `./mvnw test`. These execute the real controller/service/JPA path with an H2 database and the actual V1 migration.
2. Manual MySQL checks: run Compose, start Patient service, create/get/update/deactivate via Swagger, and restart the service to check persistence.
3. Real MySQL contract: `mvnw.cmd -Pmysql-it verify`. Testcontainers starts isolated MySQL and reuses the API tests. No silent skip when Docker is missing.
4. Read `docs/VALIDATION.md` for what was actually run in the authoring environment. H2 compatibility mode is not proof of MySQL behavior.

## Completion checkpoint

You should be able to explain and demonstrate:

- Why Patient service owns its own database.
- What `@RestController`, `@Service`, `@Entity`, `@Valid`, and `@Transactional` do.
- Why an email precheck is not enough without the unique database constraint.
- Why we use DTOs and constructor injection.
- How stale profile updates are rejected.
- Why this phase does not yet connect the React mock repository or implement authentication.

The next lesson adds Eureka and Gateway around this working service. Security then establishes user identity and access before public-facing integration.
````

## docs/VALIDATION.md

````markdown
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
````

## .dockerignore

````text
**/target
.git
.env
docs
requests
````

## .env.example

````text
# Local learning credentials only. Keep .env out of Git.
PATIENT_DB_PASSWORD=local_patient_password
MYSQL_ROOT_PASSWORD=local_root_password
````

## .gitignore

````text
**/target/
.env
.idea/
*.iml
.vscode/
*.log
````

## .mvn/wrapper/maven-wrapper.properties

````text
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
wrapperVersion=3.3.2
distributionType=only-script
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip
````

## compose.yaml

````yaml
services:
  patient-db:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: mediconnect_patient
      MYSQL_USER: patient_app
      MYSQL_PASSWORD: ${PATIENT_DB_PASSWORD:-local_patient_password}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-local_root_password}
      TZ: UTC
    command: ["--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_as_cs"]
    ports:
      - "127.0.0.1:3307:3306"
    volumes:
      - patient-data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "MYSQL_PWD=$$MYSQL_PASSWORD mysql -h 127.0.0.1 -u $$MYSQL_USER -D $$MYSQL_DATABASE -e 'SELECT 1' >/dev/null 2>&1"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 20s

  patient-service:
    profiles: ["full"]
    build:
      context: .
      dockerfile: patient-service/Dockerfile
    environment:
      SERVER_ADDRESS: 0.0.0.0
      PATIENT_DB_URL: jdbc:mysql://patient-db:3306/mediconnect_patient?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true
      PATIENT_DB_USER: patient_app
      PATIENT_DB_PASSWORD: ${PATIENT_DB_PASSWORD:-local_patient_password}
    ports:
      - "127.0.0.1:8081:8081"
    depends_on:
      patient-db:
        condition: service_healthy

volumes:
  patient-data:
````

## patient-service/Dockerfile

````text
FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./
COPY patient-service/pom.xml patient-service/pom.xml
RUN mvn -B -pl patient-service dependency:go-offline
COPY patient-service/src patient-service/src
RUN mvn -B -pl patient-service package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN groupadd --system mediconnect && useradd --system --gid mediconnect mediconnect
COPY --from=build --chown=mediconnect:mediconnect /build/patient-service/target/patient-service-0.1.0-SNAPSHOT.jar app.jar
USER mediconnect
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
````

## patient-service/pom.xml

````xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>com.mediconnect</groupId><artifactId>mediconnect-backend</artifactId><version>0.1.0-SNAPSHOT</version></parent>
  <artifactId>patient-service</artifactId>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-actuator</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-flyway</artifactId></dependency>
    <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-mysql</artifactId></dependency>
    <dependency><groupId>com.mysql</groupId><artifactId>mysql-connector-j</artifactId><scope>runtime</scope></dependency>
    <dependency><groupId>org.springdoc</groupId><artifactId>springdoc-openapi-starter-webmvc-ui</artifactId><version>${springdoc.version}</version></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc-test</artifactId><scope>test</scope></dependency>
    <dependency><groupId>com.h2database</groupId><artifactId>h2</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>testcontainers-mysql</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>testcontainers-junit-jupiter</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
  <profiles><profile><id>mysql-it</id><build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-failsafe-plugin</artifactId><executions><execution><goals><goal>integration-test</goal><goal>verify</goal></goals></execution></executions></plugin></plugins></build></profile></profiles>
</project>
````

## patient-service/src/main/java/com/mediconnect/patient/PatientServiceApplication.java

````java
package com.mediconnect.patient;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PatientServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(PatientServiceApplication.class, args);
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/api/ApiExceptionHandler.java

````java
package com.mediconnect.patient.api;

import com.mediconnect.patient.application.PatientException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private final Clock clock;
    public ApiExceptionHandler(Clock clock) { this.clock = clock; }

    @ExceptionHandler(PatientException.class)
    ProblemDetail patientError(PatientException exception) {
        var status = exception.getKind() == PatientException.Kind.NOT_FOUND ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
        return problem(status, exception.getKind().name(), exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail dataConflict(DataIntegrityViolationException exception) {
        // Do not echo SQL or patient values from the database exception.
        return problem(HttpStatus.CONFLICT, "DATA_CONFLICT", "The patient conflicts with an existing record or database constraint.");
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail staleWrite(OptimisticLockingFailureException exception) {
        return problem(HttpStatus.CONFLICT, "STALE_VERSION", "This patient changed during your request. Fetch it again before updating.");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        var body = problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Some fields are invalid.");
        Map<String, String> errors = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        body.setProperty("fieldErrors", errors);
        return handleExceptionInternal(exception, body, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return handleExceptionInternal(exception,
                problem(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Use valid JSON and ISO dates in yyyy-MM-dd format."),
                headers, status, request);
    }

    private ProblemDetail problem(HttpStatus status, String code, String detail) {
        var body = ProblemDetail.forStatusAndDetail(status, detail);
        body.setTitle(status.getReasonPhrase());
        body.setProperty("code", code);
        body.setProperty("timestamp", Instant.now(clock));
        return body;
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/api/CreatePatientRequest.java

````java
package com.mediconnect.patient.api;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record CreatePatientRequest(
        @NotBlank @Size(min = 2, max = 100) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "[6-9][0-9]{9}", message = "must be a 10-digit Indian mobile number") String phone,
        @NotNull @Past LocalDate dateOfBirth,
        @NotBlank @Size(max = 500) String address
) {
    public CreatePatientRequest {
        fullName = fullName == null ? null : fullName.strip();
        email = email == null ? null : email.strip().toLowerCase(java.util.Locale.ROOT);
        phone = phone == null ? null : phone.strip();
        address = address == null ? null : address.strip();
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/api/PatientController.java

````java
package com.mediconnect.patient.api;

import com.mediconnect.patient.application.PatientService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/patients")
@Tag(name = "Patients", description = "Local development patient-profile API")
public class PatientController {
    private final PatientService service;

    public PatientController(PatientService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "List active patients with bounded pagination")
    public PatientPage list(@RequestParam(defaultValue = "0") @Min(0) int page,
                            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Fetch one active patient")
    public PatientResponse get(@PathVariable UUID id) { return service.get(id); }

    @PostMapping
    @Operation(summary = "Create a patient")
    public ResponseEntity<PatientResponse> create(@Valid @RequestBody CreatePatientRequest request) {
        var response = service.create(request);
        var location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
                .buildAndExpand(response.id()).toUri();
        return ResponseEntity.created(location).body(response);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace profile details using the last-read version")
    public PatientResponse update(@PathVariable UUID id, @Valid @RequestBody UpdatePatientRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate a patient; retain its row and identity")
    public ResponseEntity<Void> deactivate(@PathVariable UUID id) {
        service.deactivate(id);
        return ResponseEntity.noContent().build();
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/api/PatientPage.java

````java
package com.mediconnect.patient.api;

import java.util.List;

public record PatientPage(List<PatientResponse> items, int page, int size, long totalItems, int totalPages) { }
````

## patient-service/src/main/java/com/mediconnect/patient/api/PatientResponse.java

````java
package com.mediconnect.patient.api;

import com.mediconnect.patient.domain.Patient;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record PatientResponse(UUID id, String fullName, String email, String phone,
                              LocalDate dateOfBirth, String address, boolean active,
                              long version, Instant createdAt, Instant updatedAt) {
    public static PatientResponse from(Patient patient) {
        return new PatientResponse(patient.getId(), patient.getFullName(), patient.getEmail(),
                patient.getPhone(), patient.getDateOfBirth(), patient.getAddress(), patient.isActive(),
                patient.getVersion(), patient.getCreatedAt(), patient.getUpdatedAt());
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/api/UpdatePatientRequest.java

````java
package com.mediconnect.patient.api;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record UpdatePatientRequest(
        @NotBlank @Size(min = 2, max = 100) String fullName,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "[6-9][0-9]{9}", message = "must be a 10-digit Indian mobile number") String phone,
        @NotNull @Past LocalDate dateOfBirth,
        @NotBlank @Size(max = 500) String address,
        @NotNull @PositiveOrZero Long version
) {
    public UpdatePatientRequest {
        fullName = fullName == null ? null : fullName.strip();
        email = email == null ? null : email.strip().toLowerCase(java.util.Locale.ROOT);
        phone = phone == null ? null : phone.strip();
        address = address == null ? null : address.strip();
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/application/PatientException.java

````java
package com.mediconnect.patient.application;

public class PatientException extends RuntimeException {
    public enum Kind { NOT_FOUND, EMAIL_TAKEN, STALE_VERSION }
    private final Kind kind;

    public PatientException(Kind kind) {
        super(switch (kind) {
            case NOT_FOUND -> "Patient not found.";
            case EMAIL_TAKEN -> "A patient with this email already exists.";
            case STALE_VERSION -> "This patient was changed by another request. Fetch the latest version and try again.";
        });
        this.kind = kind;
    }

    public Kind getKind() { return kind; }
}
````

## patient-service/src/main/java/com/mediconnect/patient/application/PatientService.java

````java
package com.mediconnect.patient.application;

import com.mediconnect.patient.api.*;
import com.mediconnect.patient.domain.Patient;
import com.mediconnect.patient.persistence.PatientRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.mediconnect.patient.application.PatientException.Kind.*;

@Service
@Transactional(readOnly = true)
public class PatientService {
    private final PatientRepository repository;
    private final Clock clock;

    public PatientService(PatientRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public PatientResponse get(UUID id) { return PatientResponse.from(requireActive(id)); }

    public PatientPage list(int page, int size) {
        var result = repository.findByActiveTrue(PageRequest.of(page, size,
                Sort.by("createdAt").descending().and(Sort.by("id"))));
        return new PatientPage(result.map(PatientResponse::from).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public PatientResponse create(CreatePatientRequest request) {
        if (repository.existsByEmail(request.email())) throw new PatientException(EMAIL_TAKEN);
        var patient = new Patient(request.fullName(), request.email(), request.phone(),
                request.dateOfBirth(), request.address(), Instant.now(clock));
        // Flush now so database constraint errors are translated before returning success.
        return PatientResponse.from(repository.saveAndFlush(patient));
    }

    @Transactional
    public PatientResponse update(UUID id, UpdatePatientRequest request) {
        var patient = requireActive(id);
        if (patient.getVersion() != request.version()) throw new PatientException(STALE_VERSION);
        if (repository.existsByEmailAndIdNot(request.email(), id)) throw new PatientException(EMAIL_TAKEN);
        patient.update(request.fullName(), request.email(), request.phone(), request.dateOfBirth(),
                request.address(), Instant.now(clock));
        repository.flush(); // Dirty checking writes changes and checks @Version.
        return PatientResponse.from(patient);
    }

    @Transactional
    public void deactivate(UUID id) {
        var patient = repository.findById(id).orElseThrow(() -> new PatientException(NOT_FOUND));
        if (patient.isActive()) {
            patient.deactivate(Instant.now(clock));
            repository.flush();
        }
    }

    private Patient requireActive(UUID id) {
        return repository.findByIdAndActiveTrue(id).orElseThrow(() -> new PatientException(NOT_FOUND));
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/config/ApplicationConfig.java

````java
package com.mediconnect.patient.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@Configuration
public class ApplicationConfig {
    @Bean
    Clock clock() { return Clock.systemUTC(); }

    @Bean
    OpenAPI openApi() {
        return new OpenAPI().info(new Info().title("MediConnect Patient Service")
                .version("0.1.0").description("Phase 1: localhost learning API. Use fictional patient data only."));
    }
}
````

## patient-service/src/main/java/com/mediconnect/patient/domain/Patient.java

````java
package com.mediconnect.patient.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "patients")
public class Patient {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(nullable = false, length = 254)
    private String email;

    @Column(nullable = false, length = 10)
    private String phone;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Column(nullable = false, length = 500)
    private String address;

    @Column(nullable = false)
    private boolean active;

    @Version
    @Column(nullable = false)
    private long version;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Patient() { }

    public Patient(String fullName, String email, String phone, LocalDate dateOfBirth,
                   String address, Instant now) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.dateOfBirth = dateOfBirth;
        this.address = address;
        this.active = true;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(String fullName, String email, String phone, LocalDate dateOfBirth,
                       String address, Instant now) {
        this.fullName = fullName;
        this.email = email;
        this.phone = phone;
        this.dateOfBirth = dateOfBirth;
        this.address = address;
        this.updatedAt = now;
    }

    public void deactivate(Instant now) { active = false; updatedAt = now; }

    public UUID getId() { return id; }
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public String getAddress() { return address; }
    public boolean isActive() { return active; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
````

## patient-service/src/main/java/com/mediconnect/patient/persistence/PatientRepository.java

````java
package com.mediconnect.patient.persistence;

import com.mediconnect.patient.domain.Patient;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PatientRepository extends JpaRepository<Patient, UUID> {
    Optional<Patient> findByIdAndActiveTrue(UUID id);
    Page<Patient> findByActiveTrue(Pageable pageable);
    boolean existsByEmail(String email);
    boolean existsByEmailAndIdNot(String email, UUID id);
}
````

## patient-service/src/main/resources/application.yml

````yaml
server:
  port: ${SERVER_PORT:8081}
  address: ${SERVER_ADDRESS:127.0.0.1}
  error:
    include-message: never
    include-stacktrace: never
    include-binding-errors: never

spring:
  application:
    name: patient-service
  datasource:
    url: ${PATIENT_DB_URL:jdbc:mysql://127.0.0.1:3307/mediconnect_patient?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true}
    username: ${PATIENT_DB_USER:patient_app}
    password: ${PATIENT_DB_PASSWORD:local_patient_password}
    hikari:
      maximum-pool-size: 5
  jpa:
    open-in-view: false
    show-sql: false
    hibernate:
      ddl-auto: validate
    properties:
      hibernate.jdbc.time_zone: UTC
  flyway:
    enabled: true
  mvc:
    problemdetails:
      enabled: true

management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: never

springdoc:
  swagger-ui:
    path: /swagger-ui.html
  paths-to-match: /api/**

logging:
  level:
    org.hibernate.orm.jdbc.bind: OFF
    org.hibernate.SQL: OFF
    org.hibernate.engine.jdbc.spi.SqlExceptionHelper: OFF
    org.hibernate.orm.jdbc.error: OFF
````

## patient-service/src/main/resources/db/migration/V1__create_patients.sql

````sql
CREATE TABLE patients (
    id BINARY(16) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    date_of_birth DATE NOT NULL,
    address VARCHAR(500) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT pk_patients PRIMARY KEY (id),
    CONSTRAINT uq_patients_email UNIQUE (email)
);

CREATE INDEX ix_patients_active_created ON patients (active, created_at, id);
````

## patient-service/src/test/java/com/mediconnect/patient/PatientApiContract.java

````java
package com.mediconnect.patient;

import com.jayway.jsonpath.JsonPath;
import com.mediconnect.patient.domain.Patient;
import com.mediconnect.patient.persistence.PatientRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// This contract runs against H2 by default and against real MySQL with -Pmysql-it.
abstract class PatientApiContract {
    @Autowired MockMvc mvc;
    @Autowired PatientRepository repository;

    @BeforeEach
    void resetDatabase() { repository.deleteAll(); }

    static String createJson(String email) {
        return """
                {"fullName":" Demo Patient ","email":"%s","phone":"9876543210",
                 "dateOfBirth":"1995-09-09","address":"Demo Road, Rourkela"}
                """.formatted(email);
    }

    String createPatient(String email) throws Exception {
        return mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content(createJson(email)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    static String id(String json) { return JsonPath.read(json, "$.id"); }

    @Test
    void createsCanonicalProfileWithServerGeneratedMetadata() throws Exception {
        var result = mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON)
                        .content(createJson("  DEMO@EXAMPLE.COM  ")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("Demo Patient"))
                .andExpect(jsonPath("$.email").value("demo@example.com"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.createdAt").isString()).andReturn();
        var json = result.getResponse().getContentAsString();
        assertThat(UUID.fromString(id(json))).isNotNull();
        assertThat(result.getResponse().getHeader("Location")).endsWith("/api/patients/" + id(json));
        assertThat(Instant.parse(JsonPath.read(json, "$.createdAt"))).isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void readsCreatedPatient() throws Exception {
        var json = createPatient("demo@example.com");
        mvc.perform(get("/api/patients/" + id(json))).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("demo@example.com"));
    }

    @Test
    void rejectsDuplicateCanonicalEmail() throws Exception {
        createPatient("demo@example.com");
        mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON)
                        .content(createJson("DEMO@example.com")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void databaseAlsoEnforcesUniqueEmailWithoutThePrecheck() throws Exception {
        createPatient("demo@example.com");
        var duplicate = new Patient("Another Patient", "demo@example.com", "9876543211",
                LocalDate.of(1990, 1, 1), "Demo address", Instant.now());
        assertThatThrownBy(() -> repository.saveAndFlush(duplicate)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsInvalidFieldsWithoutEchoingPatientValues() throws Exception {
        mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":" ","email":"invalid-secret-value","phone":"123",
                 "dateOfBirth":"2999-01-01","address":" "}
                """))
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.fullName").exists())
                .andExpect(jsonPath("$.fieldErrors.dateOfBirth").exists())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("invalid-secret-value"))));
    }

    @Test
    void rejectsImpossibleDate() throws Exception {
        mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON)
                        .content(createJson("demo@example.com").replace("1995-09-09", "1995-02-30")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
    }

    @Test
    void handlesMissingPatientsAndInvalidIdentifiers() throws Exception {
        mvc.perform(get("/api/patients/" + UUID.randomUUID())).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(get("/api/patients/not-a-uuid")).andExpect(status().isBadRequest());
    }

    @Test
    void updatesProfileThenRejectsAStaleVersion() throws Exception {
        String patientId = id(createPatient("demo@example.com"));
        String update = createJson("changed@example.com").strip().replace("}", ",\"version\":0}");
        mvc.perform(put("/api/patients/" + patientId).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.email").value("changed@example.com"));
        mvc.perform(put("/api/patients/" + patientId).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_VERSION"));
    }

    @Test
    void updatingCannotTakeAnotherPatientsEmail() throws Exception {
        var patientId = id(createPatient("first@example.com"));
        createPatient("second@example.com");
        var update = createJson("second@example.com").strip().replace("}", ",\"version\":0}");
        mvc.perform(put("/api/patients/" + patientId).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isConflict());
    }

    @Test
    void deactivationIsIdempotentAndKeepsTheDatabaseIdentity() throws Exception {
        var patientId = id(createPatient("demo@example.com"));
        mvc.perform(delete("/api/patients/" + patientId)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/patients/" + patientId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/patients/" + patientId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/patients")).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(0));
        assertThat(repository.findById(UUID.fromString(patientId)).orElseThrow().isActive()).isFalse();
    }

    @Test
    void listsBoundedPagesAndRejectsInvalidPageSizes() throws Exception {
        createPatient("first@example.com");
        createPatient("second@example.com");
        mvc.perform(get("/api/patients?page=0&size=1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/patients?size=101")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/patients?page=-1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/patients?size=0")).andExpect(status().isBadRequest());
    }

    @Test
    void exposesHealthAndOpenApi() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("$.paths['/api/patients']").exists());
    }
}
````

## patient-service/src/test/java/com/mediconnect/patient/PatientApiTest.java

````java
package com.mediconnect.patient;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PatientApiTest extends PatientApiContract { }
````

## patient-service/src/test/java/com/mediconnect/patient/PatientMySqlIT.java

````java
package com.mediconnect.patient;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class PatientMySqlIT extends PatientApiContract {
    @Container
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4")
            .withDatabaseName("mediconnect_patient")
            .withUsername("patient_app")
            .withPassword("test_patient_password")
            .withCommand("--collation-server=utf8mb4_0900_as_cs");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", MYSQL::getJdbcUrl);
        properties.add("spring.datasource.username", MYSQL::getUsername);
        properties.add("spring.datasource.password", MYSQL::getPassword);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
    }
}
````

## patient-service/src/test/resources/application-test.yml

````yaml
spring:
  datasource:
    url: jdbc:h2:mem:patient_test;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE
    username: sa
    password:
    driver-class-name: org.h2.Driver
````

## pom.xml

````xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.1.1</version><relativePath/></parent>
  <groupId>com.mediconnect</groupId><artifactId>mediconnect-backend</artifactId><version>0.1.0-SNAPSHOT</version><packaging>pom</packaging>
  <name>MediConnect Backend</name>
  <properties><java.version>17</java.version><springdoc.version>3.1.1</springdoc.version></properties>
  <modules><module>patient-service</module></modules>
</project>
````

## requests/MediConnect_Phase_1.postman_collection.json

````json
{
  "info": {
    "name": "MediConnect Phase 1 \u2014 Patients",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:8081"
    },
    {
      "key": "patientId",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "1 Health",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/actuator/health",
        "header": []
      }
    },
    {
      "name": "2 Create patient (saves patientId)",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/patients",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"fullName\": \"Demo Patient\",\n  \"email\": \"demo.patient@example.com\",\n  \"phone\": \"9876543210\",\n  \"dateOfBirth\": \"1995-09-09\",\n  \"address\": \"Demo Road, Rourkela\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Created', () => pm.response.to.have.status(201));",
              "if (pm.response.code === 201) pm.collectionVariables.set('patientId', pm.response.json().id);"
            ]
          }
        }
      ]
    },
    {
      "name": "3 List patients",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/api/patients?page=0&size=20",
        "header": []
      }
    },
    {
      "name": "4 Get patient",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/api/patients/{{patientId}}",
        "header": []
      }
    },
    {
      "name": "5 Update patient (version 0 initially)",
      "request": {
        "method": "PUT",
        "url": "{{baseUrl}}/api/patients/{{patientId}}",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"fullName\": \"Demo Patient Updated\",\n  \"email\": \"demo.patient@example.com\",\n  \"phone\": \"9876543210\",\n  \"dateOfBirth\": \"1995-09-09\",\n  \"address\": \"Demo Road, Rourkela\",\n  \"version\": 0\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    },
    {
      "name": "6 Deactivate patient",
      "request": {
        "method": "DELETE",
        "url": "{{baseUrl}}/api/patients/{{patientId}}",
        "header": []
      }
    }
  ]
}
````

## requests/patients.http

````http
@baseUrl = http://localhost:8081
@patientId = REPLACE_WITH_ID_FROM_CREATE_RESPONSE

### 1. Health: expect 200 and status UP
GET {{baseUrl}}/actuator/health

### 2. Create: expect 201 and Location header (fictional data)
POST {{baseUrl}}/api/patients
Content-Type: application/json

{
  "fullName": "Demo Patient",
  "email": "demo.patient@example.com",
  "phone": "9876543210",
  "dateOfBirth": "1995-09-09",
  "address": "Demo Road, Rourkela"
}

### 3. List: expect 200, items array and totalItems
GET {{baseUrl}}/api/patients?page=0&size=20

### 4. Get: paste the returned UUID into patientId above
GET {{baseUrl}}/api/patients/{{patientId}}

### 5. Update: use the version from your most recent GET; initially 0
PUT {{baseUrl}}/api/patients/{{patientId}}
Content-Type: application/json

{
  "fullName": "Demo Patient Updated",
  "email": "demo.patient@example.com",
  "phone": "9876543210",
  "dateOfBirth": "1995-09-09",
  "address": "Updated Demo Road, Rourkela",
  "version": 0
}

### 6. Run create again: expect 409 duplicate email
### Run the update again with version 0: expect 409 stale version

### 7. Invalid details: expect 400 with fieldErrors
POST {{baseUrl}}/api/patients
Content-Type: application/json

{
  "fullName": "",
  "email": "not-an-email",
  "phone": "123",
  "dateOfBirth": "2999-01-01",
  "address": ""
}

### 8. Deactivate: expect 204; later GET should be 404
DELETE {{baseUrl}}/api/patients/{{patientId}}
````
