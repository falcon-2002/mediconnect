-- Read-only lookup in the existing local MySQL Workbench connection.
-- Deliberately select only account identity and role, never password_hash.
SELECT BIN_TO_UUID(id) AS account_id, email, role
FROM mediconnect_auth.accounts
WHERE role = 'ADMIN'
ORDER BY email;
