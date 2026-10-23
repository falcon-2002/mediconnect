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
