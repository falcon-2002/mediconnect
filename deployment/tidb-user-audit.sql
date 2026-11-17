-- READ ONLY. Run as an authorized administrator on the EXISTING Starter instance.
-- Keep the results local. No password/hash/token column is selected.
-- A SQL Editor proxy identity is not a password-based application SQL user.
SELECT CURRENT_USER() AS authenticated_sql_account, VERSION() AS server_version,
       @@GLOBAL.tidb_enable_check_constraint AS check_constraints_enabled,
       @@SESSION.foreign_key_checks AS foreign_key_checks,
       @@SESSION.tidb_txn_mode AS transaction_mode,
       @@SESSION.sql_mode AS session_sql_mode;
SHOW SESSION STATUS LIKE 'Ssl_cipher';
SHOW GRANTS;

-- Inspect identities only. If denied, use your approved admin connection or stop;
-- do not grant mysql.* access to an application user just to run this audit.
SELECT User, Host FROM mysql.user ORDER BY User, Host;

-- Confirm the four existing schema identities/collations and inventory only.
SELECT schema_name, default_character_set_name, default_collation_name
FROM information_schema.schemata
WHERE schema_name IN ('mediconnect_auth', 'mediconnect_patient',
                      'mediconnect_doctor', 'mediconnect_appointment');
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema IN ('mediconnect_auth', 'mediconnect_patient',
                       'mediconnect_doctor', 'mediconnect_appointment')
ORDER BY table_schema, table_name;

-- Per-account grants: substitute an EXACT existing username and host, then run
-- one SELECT/SHOW at a time in the client. Never use SHOW CREATE USER or SELECT *
-- on mysql.user: those can expose authentication material.
-- SHOW GRANTS FOR 'EXACT_PREFIX.mc_auth'@'%';
-- SHOW GRANTS FOR 'EXACT_PREFIX.mc_patient'@'%';
-- SHOW GRANTS FOR 'EXACT_PREFIX.mc_doctor'@'%';
-- SHOW GRANTS FOR 'EXACT_PREFIX.mc_appointment'@'%';
