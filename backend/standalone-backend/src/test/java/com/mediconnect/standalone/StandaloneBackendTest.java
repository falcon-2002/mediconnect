package com.mediconnect.standalone;

import com.jayway.jsonpath.JsonPath;
import com.mediconnect.auth.application.StandaloneTransactionProbe;
import com.mediconnect.auth.persistence.AccountRepository;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest
@AutoConfigureMockMvc(print = org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint.NONE)
@ActiveProfiles("isolated")
@Import(StandaloneBackendTest.Probes.class)
class StandaloneBackendTest {
    @DynamicPropertySource
    static void signingKeys(DynamicPropertyRegistry properties) { EphemeralSigningKeys.configure(properties); }
    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @Autowired PersistenceConfiguration.DatabaseSet databases;
    @Autowired AccountRepository accounts;
    @Autowired StandaloneTransactionProbe probe;
    @Autowired org.springframework.context.ApplicationContext context;

    @TestConfiguration(proxyBeanMethods = false)
    static class Probes {
        @Bean StandaloneTransactionProbe standaloneTransactionProbe(AccountRepository repository) {
            return new StandaloneTransactionProbe(repository);
        }
    }
    record Person(String token, String patientId) {}
    private String signed(UUID subject, String role) {
        return signed(subject.toString(), role, "mediconnect-auth", List.of("mediconnect-api"), Instant.now().plusSeconds(600));
    }
    private String signed(String subject, String role, String issuer, List<String> audience, Instant expires) {
        var claims = JwtClaimsSet.builder().subject(subject).issuer(issuer).audience(audience)
                .issuedAt(Instant.now().minusSeconds(3600)).claim("roles", List.of(role));
        if (expires != null) claims.expiresAt(expires);
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(), claims.build())).getTokenValue();
    }
    private MvcResult request(MockHttpServletRequestBuilder builder, String token, String body, int status) throws Exception {
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.contentType(MediaType.APPLICATION_JSON).content(body);
        var result = mvc.perform(builder).andReturn();
        // Never include request/response bodies or tokens in an assertion failure.
        assertThat(result.getResponse().getStatus()).as("HTTP status").isEqualTo(status);
        return result;
    }
    private String json(MvcResult response, String path) throws Exception {
        return JsonPath.read(response.getResponse().getContentAsString(), path).toString();
    }
    private String login(String email, String password) throws Exception {
        return json(request(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", 200), "$.accessToken");
    }
    private Person person() throws Exception {
        String email = "standalone-" + UUID.randomUUID() + "@example.test";
        String password = "Synthetic-" + UUID.randomUUID();
        var registered = request(post("/api/auth/register"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", 201);
        assertThat(json(registered, "$.role")).isEqualTo("PATIENT");
        String token = login(email, password);
        String body = """
                {"fullName":"Fictional Patient","email":"%s","phone":"9876543210",
                 "dateOfBirth":"1995-09-09","address":"Fictional address, Rourkela"}
                """.formatted(email);
        String patient = json(request(post("/api/patients"), token, body, 201), "$.id");
        return new Person(token, patient);
    }
    private String doctor(String admin) throws Exception {
        return json(request(post("/api/doctors"), admin, """
                {"name":"Dr. Fictional Demo","specialty":"general","city":"Rourkela","area":"Demo area",
                 "clinic":"Fictional clinic","qualifications":"MBBS","experienceYears":5,"feeInRupees":250,
                 "languages":["English","Hindi"],"about":"Fictional test doctor","color":"sky"}
                """, 201), "$.id");
    }
    private String slot(String admin, String doctor) throws Exception {
        var future = Instant.ofEpochSecond((Instant.now().getEpochSecond() / 1800 + 48) * 1800);
        return json(request(post("/api/slots"), admin,
                "{\"doctorId\":\"" + doctor + "\",\"startsAt\":\"" + future + "\"}", 201), "$.id");
    }
    private String booking(Person person, String slot) {
        return "{\"patientId\":\"" + person.patientId() + "\",\"slotId\":\"" + slot + "\"}";
    }

    @Test void registrationBookingHistoryCancellationAndDuplicateRejection() throws Exception {
        var patient = person();
        String admin = signed(UUID.randomUUID(), "ADMIN");
        String doctor = doctor(admin), slot = slot(admin, doctor);
        request(get("/api/doctors/catalog"), null, null, 200);
        request(get("/api/doctors").param("city", "Rourkela").param("specialty", "general"), null, null, 200);
        request(get("/api/doctors/" + doctor), null, null, 200);
        var available = request(get("/api/slots").param("doctorId", doctor).param("from", Instant.now().toString())
                .param("to", Instant.now().plusSeconds(7 * 86400).toString()), null, null, 200);
        assertThat(json(available, "$.items[0].id")).isEqualTo(slot);
        String id = json(request(post("/api/appointments"), patient.token(), booking(patient, slot), 201), "$.id");
        var duplicate = request(post("/api/appointments"), patient.token(), booking(patient, slot), 409);
        assertThat(duplicate.getResponse().getContentAsString()).doesNotContain("INSERT", "password", "jdbc:");
        assertThat(json(request(get("/api/appointments"), patient.token(), null, 200), "$.items[0].id")).isEqualTo(id);
        assertThat(json(request(get("/api/appointments/" + id), patient.token(), null, 200), "$.status")).isEqualTo("BOOKED");
        assertThat(json(request(post("/api/appointments/" + id + "/cancel"), patient.token(), null, 200), "$.status")).isEqualTo("CANCELLED");
        request(post("/api/appointments/" + id + "/cancel"), patient.token(), null, 200);
        assertThat(json(request(get("/api/slots/" + slot), null, null, 200), "$.booked")).isEqualTo("false");
        request(post("/api/appointments"), patient.token(), booking(patient, slot), 201);
        // Logging out is frontend token disposal; anonymous public browsing stays available.
        request(get("/api/doctors"), null, null, 200);
        request(get("/api/appointments"), null, null, 401);
    }

    @Test void ownershipAndAdminBoundariesSurviveLocalDirectoryTransport() throws Exception {
        var first = person(); var other = person();
        String admin = signed(UUID.randomUUID(), "ADMIN"), doctor = doctor(admin), slot = slot(admin, doctor);
        request(get("/api/patients/" + first.patientId()), other.token(), null, 403);
        request(get("/api/patients"), first.token(), null, 403);
        request(post("/api/doctors"), first.token(), "{}", 403);
        request(post("/api/slots"), first.token(), "{}", 403);
        request(post("/api/appointments"), other.token(), booking(first, slot), 403);
        String id = json(request(post("/api/appointments"), first.token(), booking(first, slot), 201), "$.id");
        request(get("/api/appointments/" + id), other.token(), null, 403);
        request(post("/api/appointments/" + id + "/cancel"), other.token(), null, 403);
        request(get("/api/patients/me"), first.token(), null, 200);
    }

    @Test void rejectsInvalidIssuerAudienceSubjectExpiryAndSignature() throws Exception {
        String subject = UUID.randomUUID().toString();
        var invalid = List.of(
                signed(subject, "PATIENT", "wrong-issuer", List.of("mediconnect-api"), Instant.now().plusSeconds(60)),
                signed(subject, "PATIENT", "mediconnect-auth", List.of("wrong-audience"), Instant.now().plusSeconds(60)),
                signed("not-a-uuid", "PATIENT", "mediconnect-auth", List.of("mediconnect-api"), Instant.now().plusSeconds(60)),
                signed(subject, "PATIENT", "mediconnect-auth", List.of("mediconnect-api"), Instant.now().minusSeconds(120)),
                signed(subject, "PATIENT", "mediconnect-auth", List.of("mediconnect-api"), null),
                "invalid.signature.token");
        for (String token : invalid) request(get("/api/patients/me"), token, null, 401);
    }

    @Test void scopedErrorsAndDoctorLanguageUpdatesRetainTheirContracts() throws Exception {
        var person = person(); String admin = signed(UUID.randomUUID(), "ADMIN");
        var error = request(post("/api/patients"), person.token(), "{}", 400);
        assertThat(json(error, "$.code")).isEqualTo("VALIDATION_ERROR");
        String doctor = doctor(admin);
        String update = """
                {"name":"Dr. Fictional Updated","specialty":"dental","city":"Bengaluru","area":"Demo area",
                 "clinic":"Fictional clinic","qualifications":"BDS","experienceYears":6,"feeInRupees":300,
                 "languages":["English"],"about":"Fictional updated doctor","color":"sky","version":0}
                """;
        var updated = request(put("/api/doctors/" + doctor), admin, update, 200);
        assertThat(json(updated, "$.languages.length()")).isEqualTo("1");
        assertThat(json(request(put("/api/doctors/" + doctor), admin, update, 409), "$.status")).isEqualTo("409");
        request(delete("/api/patients/" + person.patientId()), person.token(), null, 204);
        request(get("/api/patients/me"), person.token(), null, 404);
        request(delete("/api/doctors/" + doctor), admin, null, 204);
        request(get("/api/doctors/" + doctor), null, null, 404);
    }

    @Test void concurrentBookingsHaveOneWinner() throws Exception {
        var person = person(); String admin = signed(UUID.randomUUID(), "ADMIN");
        String slot = slot(admin, doctor(admin));
        var executor = Executors.newFixedThreadPool(8);
        var start = new CountDownLatch(1);
        try {
            var futures = new ArrayList<Future<Integer>>();
            for (int i = 0; i < 8; i++) futures.add(executor.submit(() -> {
                start.await();
                return mvc.perform(post("/api/appointments").header("Authorization", "Bearer " + person.token())
                        .contentType(MediaType.APPLICATION_JSON).content(booking(person, slot))).andReturn().getResponse().getStatus();
            }));
            start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var future : futures) statuses.add(future.get(30, TimeUnit.SECONDS));
            assertThat(statuses.stream().filter(status -> status == 201).count()).isEqualTo(1);
            assertThat(statuses.stream().filter(status -> status == 409).count()).isEqualTo(7);
        } finally { executor.shutdownNow(); }
    }

    @Test void serviceRollbackUsesItsOwnDatabaseTransaction() throws Exception {
        var interceptor = context.getBean("transactionInterceptor", TransactionInterceptor.class);
        assertThat(interceptor.getTransactionAttributeSource().getTransactionAttribute(
                StandaloneTransactionProbe.class.getMethod("insertThenFail", String.class), StandaloneTransactionProbe.class).getQualifier())
                .isEqualTo("authTransactionManager");
        String email = "rollback-" + UUID.randomUUID() + "@example.test";
        assertThatThrownBy(() -> probe.insertThenFail(email)).isInstanceOf(IllegalStateException.class);
        assertThat(accounts.findByEmail(email)).isEmpty();
        for (String unit : List.of("auth", "patient", "doctor", "appointment")) {
            assertThat(DomainTransactions.unitFor("com.mediconnect." + unit + ".application.Service")).isEqualTo(unit);
        }
        assertThat(interceptor.getTransactionAttributeSource()).isNotNull();
        for (Class<?> type : List.of(com.mediconnect.auth.application.AuthService.class,
                com.mediconnect.patient.application.PatientService.class,
                com.mediconnect.doctor.application.DoctorService.class,
                com.mediconnect.appointment.application.BookingTransactions.class)) {
            var method = Arrays.stream(type.getDeclaredMethods())
                    .filter(candidate -> java.lang.reflect.Modifier.isPublic(candidate.getModifiers()))
                    .filter(candidate -> interceptor.getTransactionAttributeSource().getTransactionAttribute(candidate, type) != null)
                    .findFirst().orElseThrow();
            assertThat(interceptor.getTransactionAttributeSource().getTransactionAttribute(method, type).getQualifier())
                    .isEqualTo(DomainTransactions.unitFor(type.getName()) + "TransactionManager");
        }
    }

    @Test void fourDatabaseHistoriesAndTablesRemainSeparate() throws Exception {
        for (var entry : Map.of("auth", "accounts", "patient", "patients", "doctor", "doctors", "appointment", "slots").entrySet()) {
            try (var connection = databases.pools.get(entry.getKey()).getConnection(); var statement = connection.createStatement()) {
                try (var rows = statement.executeQuery("SELECT COUNT(*) FROM flyway_schema_history WHERE success = TRUE AND version IS NOT NULL")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isEqualTo(entry.getKey().equals("patient") ? 2 : 1);
                }
                statement.executeQuery("SELECT COUNT(*) FROM " + entry.getValue()).close();
                String other = entry.getKey().equals("auth") ? "patients" : "accounts";
                assertThatThrownBy(() -> statement.executeQuery("SELECT COUNT(*) FROM " + other)).isInstanceOf(java.sql.SQLException.class);
            }
        }
    }

    @Test void deploymentUrlGuardCannotFallBackToLocalOrDisableTls() {
        PersistenceConfiguration.DatabaseSet.validateUrl("auth", "jdbc:mysql://example.tidbcloud.com:4000/mediconnect_auth", false);
        for (String invalid : List.of("jdbc:mysql://127.0.0.1:3306/mediconnect_auth",
                "jdbc:mysql://localhost:3306/mediconnect_auth", "jdbc:mysql://example.tidbcloud.com/mediconnect_patient",
                "jdbc:mysql://example.tidbcloud.com/mediconnect_auth?sslMode=DISABLED", "jdbc:h2:mem:auth")) {
            assertThatThrownBy(() -> PersistenceConfiguration.DatabaseSet.validateUrl("auth", invalid, false)).isInstanceOf(RuntimeException.class);
        }
        assertThatThrownBy(() -> PersistenceConfiguration.DatabaseSet.validateUrl("auth", "jdbc:mysql://example.com/mediconnect_auth", true))
                .isInstanceOf(IllegalStateException.class);
    }
}
