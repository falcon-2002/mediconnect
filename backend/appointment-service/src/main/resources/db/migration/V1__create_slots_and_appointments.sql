CREATE TABLE slots (
 id BINARY(16) PRIMARY KEY, doctor_id BINARY(16) NOT NULL,
 starts_at DATETIME(6) NOT NULL, booked BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT uq_doctor_start UNIQUE(doctor_id,starts_at)
);
CREATE TABLE appointments (
 id BINARY(16) PRIMARY KEY, slot_id BINARY(16) NOT NULL,
 active_slot_id BINARY(16) NULL UNIQUE, patient_id BINARY(16) NOT NULL,
 account_id BINARY(16) NOT NULL, status VARCHAR(255) NOT NULL,
 created_at DATETIME(6) NOT NULL, cancelled_at DATETIME(6) NULL,
 CONSTRAINT fk_appointment_slot FOREIGN KEY(slot_id) REFERENCES slots(id),
 CONSTRAINT fk_active_slot FOREIGN KEY(active_slot_id) REFERENCES slots(id),
 CONSTRAINT ck_booking_state CHECK ((status='BOOKED' AND active_slot_id=slot_id AND active_slot_id IS NOT NULL AND cancelled_at IS NULL) OR (status='CANCELLED' AND active_slot_id IS NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX ix_appointment_owner ON appointments(account_id,created_at);
CREATE INDEX ix_slot_search ON slots(doctor_id,booked,starts_at);
