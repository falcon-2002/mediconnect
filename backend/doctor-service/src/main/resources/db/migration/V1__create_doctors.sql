CREATE TABLE doctors (
 id BINARY(16) PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 specialty VARCHAR(40) NOT NULL,
 city VARCHAR(80) NOT NULL,
 area VARCHAR(100) NOT NULL,
 clinic VARCHAR(150) NOT NULL,
 qualifications VARCHAR(300) NOT NULL,
 experience_years INT NOT NULL,
 fee_in_rupees DECIMAL(9,2) NOT NULL,
 about VARCHAR(2000) NOT NULL,
 color VARCHAR(10) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 version BIGINT NOT NULL DEFAULT 0,
 created_at DATETIME(6) NOT NULL,
 updated_at DATETIME(6) NOT NULL,
 CONSTRAINT ck_doctor_experience CHECK (experience_years BETWEEN 0 AND 80),
 CONSTRAINT ck_doctor_fee CHECK (fee_in_rupees BETWEEN 0 AND 1000000)
);
CREATE INDEX idx_doctors_discovery ON doctors(active, city, specialty);
CREATE TABLE doctor_languages (
 doctor_id BINARY(16) NOT NULL,
 position INT NOT NULL,
 language VARCHAR(40) NOT NULL,
 PRIMARY KEY (doctor_id,position),
 CONSTRAINT fk_language_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id)
);
