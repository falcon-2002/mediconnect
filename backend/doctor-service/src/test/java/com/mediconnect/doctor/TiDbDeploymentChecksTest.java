package com.mediconnect.doctor;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.flywaydb.database.mysql.MySQLDatabaseType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.*;

import com.mediconnect.doctor.config.TiDbDeploymentChecks;

class TiDbDeploymentChecksTest {
    final TiDbDeploymentChecks checks = new TiDbDeploymentChecks();
    final Context context = mock(Context.class);
    final Connection connection = mock(Connection.class);
    final Statement statement = mock(Statement.class);
    final ResultSet result = mock(ResultSet.class);

    @BeforeEach void setup() throws Exception {
        when(context.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(anyString())).thenReturn(result);
        when(result.next()).thenReturn(true);
        when(result.getString(1)).thenReturn("8.0.11-TiDB-v8.5.0");
        when(result.getString(2)).thenReturn("1");
        when(result.getString(3)).thenReturn("ON");
        when(result.getString(4)).thenReturn("pessimistic");
    }

    @Test void validCapabilitiesAreReadOnlyAndResourcesClose() throws Exception {
        checks.handle(Event.BEFORE_MIGRATE, context);
        verify(statement).executeQuery(startsWith("SELECT VERSION(),"));
        verify(statement).close();
        verify(result).close();
        verify(statement, never()).executeUpdate(anyString());
        assertThat(checks.supports(Event.BEFORE_VALIDATE, context)).isTrue();
        assertThat(checks.supports(Event.BEFORE_MIGRATE, context)).isTrue();
        assertThat(checks.supports(Event.AFTER_MIGRATE, context)).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"2,0,CHECK", "3,OFF,foreign_key_checks", "4,optimistic,pessimistic"})
    void missingCapabilitiesStopBeforeMigration(int column, String value, String message) throws Exception {
        when(result.getString(column)).thenReturn(value);
        assertThatThrownBy(() -> checks.handle(Event.BEFORE_MIGRATE, context))
                .isInstanceOf(FlywayException.class).hasMessageContaining(message);
    }

    @Test void nonTiDbServerIsRejected() throws Exception {
        when(result.getString(1)).thenReturn("8.4.0-MySQL");
        assertThatThrownBy(() -> checks.handle(Event.BEFORE_VALIDATE, context))
                .hasMessageContaining("confirmed TiDB");
    }

    @Test void noCapabilityRowIsNotSuccess() throws Exception {
        when(result.next()).thenReturn(false);
        assertThatThrownBy(() -> checks.handle(Event.BEFORE_VALIDATE, context))
                .isInstanceOf(FlywayException.class);
    }

    @Test void sqlErrorsCannotExposeServerDetails() throws Exception {
        when(statement.executeQuery(anyString())).thenThrow(new SQLException("synthetic-sensitive-server-detail"));
        assertThatThrownBy(() -> checks.handle(Event.BEFORE_MIGRATE, context))
                .isInstanceOf(FlywayException.class).hasMessageContaining("could not be confirmed")
                .hasMessageNotContaining("synthetic-sensitive").hasNoCause();
    }

    @Test void callbackIsInstalledOnlyForTiDbProfile() {
        for (String profile : new String[]{"render", "tidb"}) {
            try (var spring = new AnnotationConfigApplicationContext()) {
                spring.getEnvironment().setActiveProfiles(profile);
                spring.register(TiDbDeploymentChecks.class);
                spring.refresh();
                assertThat(spring.getBeansOfType(TiDbDeploymentChecks.class))
                        .hasSize(profile.equals("tidb") ? 1 : 0);
            }
        }
    }

    @Test void mergedProductionProfileKeepsTlsAndShortPoolLifetimesWithoutPrivateCaRequirement() {
        var yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application-render.yml"), new ClassPathResource("application-tidb.yml"));
        var environment = new MockEnvironment();
        environment.getPropertySources().addLast(new MapPropertySource("profiles", (Map) yaml.getObject()));
        String root = "spring.datasource.hikari.";
        assertThat(environment.getProperty(root + "max-lifetime")).isEqualTo("300000");
        assertThat(environment.getProperty(root + "keepalive-time")).isEqualTo("120000");
        assertThat(environment.getProperty(root + "maximum-pool-size")).isEqualTo("5");
        assertThat(environment.getProperty(root + "data-source-properties.sslMode")).isEqualTo("VERIFY_IDENTITY");
        assertThat(environment.getProperty(root + "data-source-properties.trustCertificateKeyStoreUrl")).isEmpty();
        assertThat(environment.getProperty(root + "data-source-properties.trustCertificateKeyStorePassword")).isEmpty();
        assertThat(environment.getProperty(root + "data-source-properties.fallbackToSystemTrustStore")).isEqualTo("true");
        assertThat(environment.getProperty(root + "data-source-properties.connectionCollation")).isEqualTo("utf8mb4_0900_bin");
        assertThat(environment.getProperty(root + "data-source-properties.connectionTimeZone")).isEqualTo("UTC");
        assertThat(environment.getProperty("spring.flyway.clean-disabled")).isEqualTo("true");
    }

    @Test void installedFlywayModuleRecognizesMySqlMetadataWithTiDbVersionWithoutConnecting() {
        var type = new MySQLDatabaseType();
        assertThat(type.handlesJDBCUrl("jdbc:mysql://example.invalid:4000/mediconnect_test")).isTrue();
        assertThat(type.handlesDatabaseProductNameAndVersion("MySQL", "8.0.11-TiDB-v8.5.0", null)).isTrue();
    }
}
