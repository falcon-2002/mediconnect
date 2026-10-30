package com.mediconnect.auth.domain;
import jakarta.persistence.*;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="accounts")
public class Account {
 @Id @GeneratedValue(strategy=GenerationType.UUID) @JdbcTypeCode(SqlTypes.BINARY)
 private UUID id;
 @Column(nullable=false, unique=true, length=254) private String email;
 @Column(name="password_hash",nullable=false,length=100) private String passwordHash;
 @Column(nullable=false,length=20) private String role;
 protected Account() {}
 public Account(String email, String passwordHash) {
  this.email=email; this.passwordHash=passwordHash; this.role="PATIENT";
 }
 public UUID getId(){return id;}
 public String getEmail(){return email;}
 public String getPasswordHash(){return passwordHash;}
 public String getRole(){return role;}
}
