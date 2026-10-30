ALTER TABLE patients ADD COLUMN account_id BINARY(16) NULL;
ALTER TABLE patients ADD CONSTRAINT uk_patients_account UNIQUE (account_id);
