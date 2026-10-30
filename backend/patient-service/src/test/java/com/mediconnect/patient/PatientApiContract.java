package com.mediconnect.patient;

import com.jayway.jsonpath.JsonPath;
import com.mediconnect.patient.domain.Patient;
import com.mediconnect.patient.persistence.PatientRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// This contract runs against H2 by default and against real MySQL with -Pmysql-it.
@org.springframework.security.test.context.support.WithMockUser(roles="ADMIN")
abstract class PatientApiContract {
    @Autowired MockMvc mvc;
    @Autowired PatientRepository repository;
    @Autowired org.springframework.web.context.WebApplicationContext context;

    @BeforeEach
    void resetDatabase() {
        repository.deleteAll();
        mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context)
                .apply(org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity()).build();
    }

    static String createJson(String email) {
        return """
                {"fullName":" Demo Patient ","email":"%s","phone":"9876543210",
                 "dateOfBirth":"1995-09-09","address":"Demo Road, Rourkela"}
                """.formatted(email);
    }

    String createPatient(String email) throws Exception {
        return mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content(createJson(email)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    static String id(String json) { return JsonPath.read(json, "$.id"); }

    @Test
    void createsCanonicalProfileWithServerGeneratedMetadata() throws Exception {
        var result = mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON)
                        .content(createJson("  DEMO@EXAMPLE.COM  ")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("Demo Patient"))
                .andExpect(jsonPath("$.email").value("demo@example.com"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.createdAt").isString()).andReturn();
        var json = result.getResponse().getContentAsString();
        assertThat(UUID.fromString(id(json))).isNotNull();
        assertThat(result.getResponse().getHeader("Location")).endsWith("/api/patients/" + id(json));
        assertThat(Instant.parse(JsonPath.read(json, "$.createdAt"))).isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void readsCreatedPatient() throws Exception {
        var json = createPatient("demo@example.com");
        mvc.perform(get("/api/patients/" + id(json))).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("demo@example.com"));
    }

    @Test
    void rejectsDuplicateCanonicalEmail() throws Exception {
        createPatient("demo@example.com");
        mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON)
                        .content(createJson("DEMO@example.com")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void databaseAlsoEnforcesUniqueEmailWithoutThePrecheck() throws Exception {
        createPatient("demo@example.com");
        var duplicate = new Patient("Another Patient", "demo@example.com", "9876543211",
                LocalDate.of(1990, 1, 1), "Demo address", Instant.now());
        assertThatThrownBy(() -> repository.saveAndFlush(duplicate)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsInvalidFieldsWithoutEchoingPatientValues() throws Exception {
        mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":" ","email":"invalid-secret-value","phone":"123",
                 "dateOfBirth":"2999-01-01","address":" "}
                """))
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.fullName").exists())
                .andExpect(jsonPath("$.fieldErrors.dateOfBirth").exists())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("invalid-secret-value"))));
    }

    @Test
    void rejectsImpossibleDate() throws Exception {
        mvc.perform(post("/api/patients").contentType(MediaType.APPLICATION_JSON)
                        .content(createJson("demo@example.com").replace("1995-09-09", "1995-02-30")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
    }

    @Test
    void handlesMissingPatientsAndInvalidIdentifiers() throws Exception {
        mvc.perform(get("/api/patients/" + UUID.randomUUID())).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(get("/api/patients/not-a-uuid")).andExpect(status().isBadRequest());
    }

    @Test
    void updatesProfileThenRejectsAStaleVersion() throws Exception {
        String patientId = id(createPatient("demo@example.com"));
        String update = createJson("changed@example.com").strip().replace("}", ",\"version\":0}");
        mvc.perform(put("/api/patients/" + patientId).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.email").value("changed@example.com"));
        mvc.perform(put("/api/patients/" + patientId).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_VERSION"));
    }

    @Test
    void updatingCannotTakeAnotherPatientsEmail() throws Exception {
        var patientId = id(createPatient("first@example.com"));
        createPatient("second@example.com");
        var update = createJson("second@example.com").strip().replace("}", ",\"version\":0}");
        mvc.perform(put("/api/patients/" + patientId).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isConflict());
    }

    @Test
    void deactivationIsIdempotentAndKeepsTheDatabaseIdentity() throws Exception {
        var patientId = id(createPatient("demo@example.com"));
        mvc.perform(delete("/api/patients/" + patientId)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/patients/" + patientId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/patients/" + patientId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/patients")).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(0));
        assertThat(repository.findById(UUID.fromString(patientId)).orElseThrow().isActive()).isFalse();
    }

    @Test
    void listsBoundedPagesAndRejectsInvalidPageSizes() throws Exception {
        createPatient("first@example.com");
        createPatient("second@example.com");
        mvc.perform(get("/api/patients?page=0&size=1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/patients?size=101")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/patients?page=-1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/patients?size=0")).andExpect(status().isBadRequest());
    }

    @Test
    void exposesHealthAndOpenApi() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("$.paths['/api/patients']").exists());
    }

    @Test
    void timestampsRoundTripWithMicrosecondPrecision() throws Exception {
        var createResponse = createPatient("timestamp@example.com");
        String createdAt = JsonPath.read(createResponse, "$.createdAt");
        String updatedAt = JsonPath.read(createResponse, "$.updatedAt");

        // Re-read and verify timestamps are identical (round-trip consistent after truncation fix)
        var readResponse = mvc.perform(get("/api/patients/" + id(createResponse)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(readResponse, "$.createdAt")).isEqualTo(createdAt);
        assertThat((String) JsonPath.read(readResponse, "$.updatedAt")).isEqualTo(updatedAt);

        // Verify values are truncated to microseconds (no nanosecond residue from Instant.now)
        var parsedCreated = Instant.parse(createdAt);
        assertThat(parsedCreated).isEqualTo(parsedCreated.truncatedTo(ChronoUnit.MICROS));
    }
}

