package com.mediconnect.doctor.domain;
import jakarta.persistence.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.math.BigDecimal;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.mediconnect.doctor.api.CreateDoctorRequest;
@Entity @Table(name="doctors")
public class Doctor {
    @Id @GeneratedValue(strategy=GenerationType.UUID) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(nullable=false,length=100) private String name;
    @Column(nullable=false,length=40) private String specialty;
    @Column(nullable=false,length=80) private String city;
    @Column(nullable=false,length=100) private String area;
    @Column(nullable=false,length=150) private String clinic;
    @Column(nullable=false,length=300) private String qualifications;
    @Column(name="experience_years",nullable=false) private int experienceYears;
    @Column(name="fee_in_rupees",nullable=false,precision=9,scale=2) private BigDecimal feeInRupees;
    @ElementCollection @CollectionTable(name="doctor_languages",joinColumns=@JoinColumn(name="doctor_id"))
    @OrderColumn(name="position") @Column(name="language",nullable=false,length=40)
    private List<String> languages=new ArrayList<>();
    @Column(nullable=false,length=2000) private String about;
    @Column(nullable=false,length=10) private String color;
    @Column(nullable=false) private boolean active=true;
    @Version private long version;
    @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected Doctor() {}
    public Doctor(CreateDoctorRequest request,Instant now){createdAt=now.truncatedTo(ChronoUnit.MICROS);update(request,now);}
    public void update(CreateDoctorRequest r,Instant now){
        name=r.name();specialty=r.specialty();city=r.city();area=r.area();clinic=r.clinic();
        qualifications=r.qualifications();experienceYears=r.experienceYears();feeInRupees=r.feeInRupees();
        languages.clear();languages.addAll(r.languages());about=r.about();color=r.color();updatedAt=now.truncatedTo(ChronoUnit.MICROS);
    }
    public void deactivate(Instant now){active=false;updatedAt=now.truncatedTo(ChronoUnit.MICROS);}
    public UUID getId(){return id;} public String getName(){return name;}
    public String getSpecialty(){return specialty;} public String getCity(){return city;}
    public String getArea(){return area;} public String getClinic(){return clinic;}
    public String getQualifications(){return qualifications;} public int getExperienceYears(){return experienceYears;}
    public BigDecimal getFeeInRupees(){return feeInRupees;} public List<String> getLanguages(){return List.copyOf(languages);}
    public String getAbout(){return about;} public String getColor(){return color;}
    public boolean isActive(){return active;} public long getVersion(){return version;}
    public Instant getCreatedAt(){return createdAt;} public Instant getUpdatedAt(){return updatedAt;}
}
