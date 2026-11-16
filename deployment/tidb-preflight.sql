-- READ ONLY; provided for the owner to run only after database access approval.
-- No passwords, account rows, password hashes, or patient data are selected.
-- Run before starting any service against a fresh TiDB target.
SELECT VERSION() AS server_version, DATABASE() AS selected_schema,
       @@GLOBAL.tidb_enable_check_constraint AS check_constraints_enabled,
       @@SESSION.foreign_key_checks AS foreign_key_checks,
       @@SESSION.tidb_txn_mode AS transaction_mode,
       @@SESSION.time_zone AS session_time_zone;
SHOW SESSION STATUS LIKE 'Ssl_cipher';
SHOW COLLATION WHERE Collation = 'utf8mb4_0900_bin';
SELECT schema_name, default_character_set_name, default_collation_name
FROM information_schema.schemata
WHERE schema_name IN ('mediconnect_auth', 'mediconnect_patient',
                      'mediconnect_doctor', 'mediconnect_appointment');

-- After migrations, inspect each schema with its own application user:
-- SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
-- SHOW CREATE TABLE accounts;
-- SHOW CREATE TABLE doctors;
-- SHOW CREATE TABLE doctor_languages;
-- SHOW CREATE TABLE slots;
-- SHOW CREATE TABLE appointments;
-- SHOW CREATE TABLE patients;
