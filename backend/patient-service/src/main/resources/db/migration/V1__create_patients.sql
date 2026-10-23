CREATE TABLE patients (
    id BINARY(16) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    date_of_birth DATE NOT NULL,
    address VARCHAR(500) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT pk_patients PRIMARY KEY (id),
    CONSTRAINT uq_patients_email UNIQUE (email)
);

CREATE INDEX ix_patients_active_created ON patients (active, created_at, id);
