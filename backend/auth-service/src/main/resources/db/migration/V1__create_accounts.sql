CREATE TABLE accounts (
 id BINARY(16) NOT NULL PRIMARY KEY,
 email VARCHAR(254) NOT NULL,
 password_hash VARCHAR(100) NOT NULL,
 role VARCHAR(20) NOT NULL,
 CONSTRAINT uk_accounts_email UNIQUE (email),
 CONSTRAINT ck_accounts_role CHECK (role IN ('PATIENT','DOCTOR','ADMIN'))
);
