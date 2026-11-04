-- Read-only MySQL 8 inspection. Run in the existing local Workbench connection.
-- No accounts, credentials, patient details, or JWTs are selected.
-- UUIDs use BIN_TO_UUID(..., 0), matching Hibernate's BINARY(16) layout.
SELECT UTC_TIMESTAMP(6) AS database_utc_now;

SELECT BIN_TO_UUID(id) AS doctor_id, name, city, specialty, clinic, active, created_at
FROM mediconnect_doctor.doctors
WHERE LOWER(name) LIKE '%priya%'
ORDER BY name, id;

SELECT LOWER(TRIM(name)) AS normalized_name, COUNT(*) AS active_records
FROM mediconnect_doctor.doctors WHERE active = TRUE
GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1;

SELECT BIN_TO_UUID(d.id) AS doctor_id, d.name, d.active,
       COUNT(s.id) AS all_slots,
       COALESCE(SUM(s.starts_at <= UTC_TIMESTAMP(6)), 0) AS expired_slots,
       COALESCE(SUM(s.starts_at > UTC_TIMESTAMP(6) AND s.starts_at < UTC_TIMESTAMP(6) + INTERVAL 7 DAY AND s.booked = FALSE), 0) AS available_next_seven_days,
       COALESCE(SUM(s.starts_at > UTC_TIMESTAMP(6) AND s.starts_at < UTC_TIMESTAMP(6) + INTERVAL 7 DAY AND s.booked = TRUE), 0) AS booked_next_seven_days,
       COALESCE(SUM(s.starts_at >= UTC_TIMESTAMP(6) + INTERVAL 7 DAY), 0) AS later_slots,
       MIN(s.starts_at) AS first_slot_utc, MAX(s.starts_at) AS last_slot_utc
FROM mediconnect_doctor.doctors d
LEFT JOIN mediconnect_appointment.slots s ON s.doctor_id = d.id
GROUP BY d.id, d.name, d.active ORDER BY d.name, d.id;

SELECT BIN_TO_UUID(s.doctor_id) AS missing_doctor_id, COUNT(*) AS slots
FROM mediconnect_appointment.slots s
LEFT JOIN mediconnect_doctor.doctors d ON d.id = s.doctor_id
WHERE d.id IS NULL GROUP BY s.doctor_id;

-- References remain intact even if names repeat. No deduplication/deletion is performed.
SELECT BIN_TO_UUID(s.doctor_id) AS doctor_id, COUNT(a.id) AS appointment_references
FROM mediconnect_appointment.slots s
JOIN mediconnect_appointment.appointments a ON a.slot_id = s.id
GROUP BY s.doctor_id;
