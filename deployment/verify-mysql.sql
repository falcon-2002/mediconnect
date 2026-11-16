-- Read-only. Run separately against each hosted schema with its own app user.
-- No account identities, password hashes, patient data, or credentials selected.
SELECT DATABASE() AS connected_schema, VERSION() AS mysql_version,
       @@session.time_zone AS session_time_zone;
SHOW SESSION STATUS LIKE 'Ssl_cipher';
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() ORDER BY table_name;
