package com.mediconnect.standalone;

import java.util.LinkedHashMap;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PersistenceSafetyTest {
    @Test void migrationsDisabledDoesNotCreateApplicationOrHistoryTables() throws Exception {
        var values = new LinkedHashMap<String, DatabaseProperties.Database>();
        for (String unit : new String[]{"auth", "patient", "doctor", "appointment"}) {
            var value = new DatabaseProperties.Database();
            value.setUrl("jdbc:h2:mem:no_migrations_" + unit + UUID.randomUUID().toString().replace("-", "")
                    + ";MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE");
            value.setUsername("sa"); value.setPassword("synthetic-isolated-only"); values.put(unit, value);
        }
        try (var set = new PersistenceConfiguration.DatabaseSet(new DatabaseProperties(values, false), true)) {
            for (var pool : set.pools.values()) {
                try (var connection = pool.getConnection(); var statement = connection.createStatement();
                     var result = statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")) {
                    assertThat(result.next()).isTrue(); assertThat(result.getInt(1)).isZero();
                }
            }
        }
    }
    @Test void credentialValuesAreExcludedFromPropertyDiagnostics() {
        var value = new DatabaseProperties.Database(); value.setPassword("SYNTHETIC-SENTINEL-ONLY");
        var properties = new DatabaseProperties(java.util.Map.of("auth", value), false);
        assertThat(properties.toString()).doesNotContain("SYNTHETIC-SENTINEL-ONLY");
    }
}
