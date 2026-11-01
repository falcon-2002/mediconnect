package com.mediconnect.appointment.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="appointments")
public class Appointment {
 @Id @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID id;
 @Column(name="slot_id",nullable=false) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID slotId;
 @Column(name="active_slot_id",unique=true) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID activeSlotId;
 @Column(name="patient_id",nullable=false) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID patientId;
 @Column(name="account_id",nullable=false) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY) public UUID accountId;
 @Column(nullable=false) public String status;
 @Column(name="created_at",nullable=false,columnDefinition="DATETIME(6)") @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.TIMESTAMP) public Instant createdAt;
 @Column(name="cancelled_at",columnDefinition="DATETIME(6)") @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.TIMESTAMP) public Instant cancelledAt;
 protected Appointment() {}
 public Appointment(UUID slotId,UUID patientId,UUID accountId,Instant now){
  id=UUID.randomUUID();this.slotId=slotId;activeSlotId=slotId;this.patientId=patientId;this.accountId=accountId;
  status="BOOKED";createdAt=now;
 }
}
