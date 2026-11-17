-- MANUAL REVIEW TEMPLATE ONLY. The agent has not executed any statement.
-- Owner reports all four schemas empty, no visible users, CHECK/FK=1,
-- pessimistic transactions and NO_AUTO_CREATE_USER present. Recheck below.
-- Review deployment/TIDB_USERS.md before manually selecting any write statement.
-- No instance prefix is stored in the checked-in configuration. In your local
-- editor replace __TIDB_PREFIX__ with ONLY the prefix before .root in Connect.
-- Example shape only: PREFIX.mc_auth, not PREFIX.root.mc_auth.
-- Password markers below are deliberately INVALID SQL, not default passwords.
-- Supply each SQL password only in the approved local secure client/UI.
-- Never save a password-filled copy in this repository or a shell transcript.
--
-- Run one account block at a time; STOP on any error, including CREATE collision.
-- If a name/host already exists, do NOT execute its CREATE or GRANT; inspect its
-- existing purpose/grants and request a reviewed reuse/delta plan instead.
-- No IF NOT EXISTS, ALTER USER, REVOKE, DROP, GRANT OPTION, or global grants.
-- Check NO_AUTO_CREATE_USER is present in @@SESSION.sql_mode before GRANT.
-- Account-management DDL auto-commits; ROLLBACK is not a recovery mechanism.
-- SQL Editor has query logs/saved SQL; it is NOT a verified masked password
-- prompt. Use it for these password-free checks/GRANT/SHOW statements. Do not
-- paste real passwords there unless protected entry and persistence handling
-- are verified. Otherwise create via the approved secure local-client workflow
-- in TIDB_USERS.md. Never save a password-filled SQL file.

-- STEP 1: Select and run ONLY these read-only checks after resolving the prefix.
-- The first result must contain NO_AUTO_CREATE_USER; it must NOT show a proxy
-- identity being mistaken for one of the four application users.
SELECT CURRENT_USER() AS executing_account,
       @@SESSION.sql_mode AS session_sql_mode,
       @@GLOBAL.tidb_enable_check_constraint AS check_constraints_enabled,
       @@SESSION.foreign_key_checks AS foreign_key_checks,
       @@SESSION.tidb_txn_mode AS transaction_mode;
-- Any matching row means STOP that account's CREATE/GRANT and review its grants.
-- Empty output can reflect limited visibility; it is not proof of absence.
SELECT User, Host FROM mysql.user
WHERE User IN ('__TIDB_PREFIX__.mc_auth', '__TIDB_PREFIX__.mc_patient',
               '__TIDB_PREFIX__.mc_doctor', '__TIDB_PREFIX__.mc_appointment')
ORDER BY User, Host;

-- STEP 2: Review each block. Execute CREATE separately; only after its confirmed
-- success select its GRANT, then SHOW GRANTS. Never use Run All. A failed CREATE
-- must not be followed by GRANT, even if the editor continues after errors.

-- AUTH: registration/login plus normal Flyway history creation and indexing.
CREATE USER '__TIDB_PREFIX__.mc_auth'@'%'
  IDENTIFIED BY <AUTH_PASSWORD_LITERAL_ENTERED_ONLY_IN_APPROVED_LOCAL_CLIENT>
  REQUIRE SSL;
GRANT SELECT, INSERT, CREATE, INDEX
  ON `mediconnect\_auth`.* TO '__TIDB_PREFIX__.mc_auth'@'%';
SHOW GRANTS FOR '__TIDB_PREFIX__.mc_auth'@'%';

-- PATIENT: profile writes/soft deletion, V2 ALTER and normal Flyway operations.
CREATE USER '__TIDB_PREFIX__.mc_patient'@'%'
  IDENTIFIED BY <PATIENT_PASSWORD_LITERAL_ENTERED_ONLY_IN_APPROVED_LOCAL_CLIENT>
  REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX
  ON `mediconnect\_patient`.* TO '__TIDB_PREFIX__.mc_patient'@'%';
SHOW GRANTS FOR '__TIDB_PREFIX__.mc_patient'@'%';

-- DOCTOR: profile writes, language collection row deletion, indexes and FK.
CREATE USER '__TIDB_PREFIX__.mc_doctor'@'%'
  IDENTIFIED BY <DOCTOR_PASSWORD_LITERAL_ENTERED_ONLY_IN_APPROVED_LOCAL_CLIENT>
  REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES
  ON `mediconnect\_doctor`.* TO '__TIDB_PREFIX__.mc_doctor'@'%';
SHOW GRANTS FOR '__TIDB_PREFIX__.mc_doctor'@'%';

-- APPOINTMENT: slot/booking writes and cancellation updates, indexes and FKs.
CREATE USER '__TIDB_PREFIX__.mc_appointment'@'%'
  IDENTIFIED BY <APPOINTMENT_PASSWORD_LITERAL_ENTERED_ONLY_IN_APPROVED_LOCAL_CLIENT>
  REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, CREATE, INDEX, REFERENCES
  ON `mediconnect\_appointment`.* TO '__TIDB_PREFIX__.mc_appointment'@'%';
SHOW GRANTS FOR '__TIDB_PREFIX__.mc_appointment'@'%';

-- STEP 3: Verify each user in a fresh TLS VERIFY_IDENTITY application-user
-- connection, not the SQL Editor proxy. Repeat the read-only settings query,
-- SHOW GRANTS, and USE own schema / USE each other schema (must be denied).
-- Repeating CREATE is intentionally NOT a no-op: on a rerun inventory first,
-- preserve completed users/passwords, and skip their creation. If CREATE worked
-- but GRANT failed, review SHOW GRANTS and the exact missing grant before resuming
-- that account. No automatic reuse, password reset, DROP, or broad grant recovery.
