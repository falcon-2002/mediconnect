# Proposed live Flyway verification plan — approval required

This plan has NOT been executed. The owner reports TiDB 8.5.3 and four existing application databases with CHECK=1, FK=1 and pessimistic mode. Existing table contents/history, dedicated-user isolation and JDBC TLS are still unverified. No database is to be recreated or cleaned.

## Scope for a separate approval

Approve one service/schema at a time, beginning with Auth. Target the exact existing TiDB instance and branch identified locally in Connect, using its dedicated SQL user and verified TLS. No endpoint or credential is embedded here. This approval is separate from user provisioning, Git changes, Render payments and public deployment.

| Order | Schema/service | Existing migration files | Intended fresh-schema effects |
| --- | --- | --- | --- |
| 1 | mediconnect_auth / auth-service | V1__create_accounts.sql | accounts, role CHECK, unique email |
| 2 | mediconnect_patient / patient-service | V1__create_patients.sql; V2__patient_account_ownership.sql | patients, nullable account_id and unique ownership, discovery index |
| 3 | mediconnect_doctor / doctor-service | V1__create_doctors.sql | doctors, doctor_languages, FK, two CHECKs, discovery index |
| 4 | mediconnect_appointment / appointment-service | V1__create_slots_and_appointments.sql | slots, appointments, two FKs, booking-state CHECK, active-slot uniqueness and indexes |

Flyway creates its own history table and success index in each schema as well. No migration inserts demo users/patients/doctors/slots. These five existing scripts contain CREATE TABLE/INDEX and Patient ALTER TABLE only; none is rewritten, dropped, renumbered or marked already applied by this plan. Review the exact committed scripts under each service's src/main/resources/db/migration before approval.

## Execution sequence

1. **Read-only audit:** confirm actual table inventory and Flyway history separately in each schema. If nonempty without valid matching history, mismatched checksums, failed rows or unexpected objects are present, stop. No automatic baseline, repair, deletion, DROP, clean or retry is allowed.
2. **Recovery checkpoint:** confirm existing provider backup/export options. If data already exists, obtain and verify an approved recovery copy before DDL. A restore/export/branch creation is separate work that must not be inferred from this plan.
3. **Dedicated-user check:** complete TIDB_USERS.md, including fresh-connection TLS/hostname validation, capability settings and own/cross-schema access. Verify the selected collation without altering an existing schema. Keep passwords outside files/arguments/logs.
4. **One controlled startup:** start only the selected packaged service with its existing render,tidb profiles, its own DB variables and locally entered secret/key settings using an approved secure startup path. Spring Boot invokes the existing Flyway migration automatically; the read-only deployment callback must succeed first. Do not start all six services or a Render Blueprint as a migration shortcut. Eureka/key/server settings needed for this controlled check must be agreed before executing it; no command is run by this document.
5. **Observe and stop on failure:** record only sanitized migration versions/statuses. TiDB/MySQL DDL can commit individual operations, so a failure can leave partial tables/history. Do not promise a cross-schema rollback or automatically rerun a failed migration. Preserve partial state for inspection.
6. **Read-only post-check:** inspect successful history and SHOW CREATE TABLE with the intended user. Verify the four named CHECKs and three FKs, types, indexes and active-slot uniqueness. A global CHECK setting alone does not prove the constraints exist, and Hibernate ddl-auto:validate is not a complete constraint-enforcement test.
7. **Proceed after review:** repeat for the next service only after the previous result is confirmed. Expected fresh result is five migration versions across four histories, six application tables plus four history tables. No existing local or cloud account/patient/appointment is changed by these scripts.
8. **Separate functional-test approval:** registration/profile/demo doctor/slot creation, same-slot concurrent booking, cancellation races, CHECK/FK rejection writes, and persistence tests create or change records. Plan them on an explicitly approved disposable target or agreed fictional demo data. They are not authorized merely by permission to run read-only preflight. H2/mocks and SQL source review are not substitutes for these live TiDB tests.

## Compatibility assessment

The mapped UUID BINARY(16), DATETIME(6), DECIMAL, boolean, nullable unique keys and ordinary indexes/FKs are supported feature families on modern TiDB. The current query layer uses normal JPA/criteria SQL and pessimistic booking locks. No stored routine, trigger or unsupported schema feature was found in the five scripts. The earlier MySQL-only collation instruction has already been replaced by a supported TiDB collation profile.

The installed Flyway MySQL adapter's metadata dispatch has passed offline tests; its actual TiDB server-version handling, advisory locking, permissions and DDL behavior have not been tested live. The owner's successful preflight removes an earlier settings uncertainty, but does not establish migration compatibility or cross-session booking concurrency. Do not bypass a failed startup guard or relax constraints to force a pass.

No live Flyway execution is approved or claimed by this plan.
