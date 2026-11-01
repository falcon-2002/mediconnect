package com.mediconnect.appointment.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="slots",uniqueConstraints=@UniqueConstraint(columnNames={"doctor_id","starts_at"}))
public class Slot {
 @Id @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID id;
 @Column(name="doctor_id",nullable=false) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID doctorId;
 @Column(name="starts_at",nullable=false,columnDefinition="DATETIME(6)") @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.TIMESTAMP) public Instant startsAt;
 @Column(nullable=false) public boolean booked;
 protected Slot() {}
 public Slot(UUID doctorId,Instant startsAt){this.id=UUID.randomUUID();this.doctorId=doctorId;this.startsAt=startsAt;}
}
