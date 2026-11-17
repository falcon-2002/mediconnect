package com.mediconnect.standalone;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Locale;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

@Configuration(proxyBeanMethods = false)
public class PersistenceConfiguration {
    @Bean(destroyMethod = "close") DatabaseSet databaseSet(DatabaseProperties properties, Environment environment) {
        return new DatabaseSet(properties, environment.matchesProfiles("isolated"));
    }
    // Also expose the pools to Actuator so health checks reflect all four databases.
    // DatabaseSet alone owns shutdown; do not close a pool twice.
    @Bean(destroyMethod = "") DataSource authDataSource(DatabaseSet set) { return set.pools.get("auth"); }
    @Bean(destroyMethod = "") DataSource patientDataSource(DatabaseSet set) { return set.pools.get("patient"); }
    @Bean(destroyMethod = "") DataSource doctorDataSource(DatabaseSet set) { return set.pools.get("doctor"); }
    @Bean(destroyMethod = "") @Primary DataSource appointmentDataSource(DatabaseSet set) { return set.pools.get("appointment"); }

    static final class DatabaseSet implements AutoCloseable {
        final Map<String, HikariDataSource> pools = new LinkedHashMap<>();
        final boolean isolated;
        DatabaseSet(DatabaseProperties properties, boolean isolated) {
            this.isolated = isolated;
            try {
                for (String name : new String[]{"auth", "patient", "doctor", "appointment"}) {
                    var database = properties.databases().get(name);
                    if (database == null || database.getUrl() == null || database.getUsername() == null || database.getPassword() == null)
                        throw new IllegalStateException("Missing database environment variables for " + name);
                    validateUrl(name, database.getUrl(), isolated);
                    var config = new HikariConfig();
                    config.setPoolName("mc-" + name);
                    config.setJdbcUrl(database.getUrl());
                    config.setUsername(database.getUsername());
                    config.setPassword(database.getPassword());
                    config.setMaximumPoolSize(2);
                    config.setMinimumIdle(0);
                    config.setConnectionTimeout(10000);
                    config.setIdleTimeout(60000);
                    config.setMaxLifetime(300000);
                    config.setKeepaliveTime(120000);
                    if (!isolated) {
                        config.addDataSourceProperty("sslMode", "VERIFY_IDENTITY");
                        config.addDataSourceProperty("enabledTLSProtocols", "TLSv1.2,TLSv1.3");
                        config.addDataSourceProperty("fallbackToSystemTrustStore", "true");
                        config.addDataSourceProperty("characterEncoding", "UTF-8");
                        config.addDataSourceProperty("connectionCollation", "utf8mb4_0900_bin");
                        config.addDataSourceProperty("connectionTimeZone", "UTC");
                        config.addDataSourceProperty("forceConnectionTimeZoneToSession", "true");
                    }
                    pools.put(name, new HikariDataSource(config));
                }
                // Check ALL connections before ANY explicitly enabled migration.
                if (!isolated) for (var entry : pools.entrySet()) preflight(entry.getKey(), entry.getValue());
                if (properties.migrationsEnabled()) {
                    for (var entry : pools.entrySet()) Flyway.configure().dataSource(entry.getValue())
                            .locations("classpath:db/" + entry.getKey()).cleanDisabled(true)
                            .validateOnMigrate(true).baselineOnMigrate(false).load().migrate();
                }
            } catch (Exception exception) {
                close();
                // Driver exceptions can contain URLs/usernames/SQL. Keep details out of startup logs.
                throw new IllegalStateException("Database startup checks failed. Check required settings, TLS, grants and approved migration state locally; no automatic recovery was attempted.");
            }
        }
        static void validateUrl(String name, String url, boolean isolated) {
            if (isolated) {
                if (!url.startsWith("jdbc:h2:mem:")) throw new IllegalStateException("Isolated profile accepts in-memory H2 only");
            } else {
                var uri = java.net.URI.create(url.substring("jdbc:".length()));
                if (!url.startsWith("jdbc:mysql://") || uri.getHost() == null || uri.getUserInfo() != null
                        || uri.getRawQuery() != null || uri.getFragment() != null
                        || !uri.getPath().equals("/mediconnect_" + name)
                        || uri.getHost().equalsIgnoreCase("localhost") || uri.getHost().matches("[\\d.]+"))
                    throw new IllegalStateException("Use a credential-free TiDB DNS JDBC URL with its exact schema and no query options");
            }
        }
        static void preflight(String name, DataSource pool) throws Exception {
            try (var connection = pool.getConnection(); var statement = connection.createStatement()) {
                try (var result = statement.executeQuery("SELECT VERSION(), @@GLOBAL.tidb_enable_check_constraint, @@SESSION.foreign_key_checks, @@SESSION.tidb_txn_mode")) {
                    if (!result.next() || !result.getString(1).toLowerCase(Locale.ROOT).contains("tidb")
                            || result.getInt(2) != 1 || result.getInt(3) != 1
                            || !result.getString(4).equalsIgnoreCase("pessimistic"))
                        throw new IllegalStateException("TiDB capability check failed for " + name);
                }
                try (var result = statement.executeQuery("SHOW SESSION STATUS LIKE 'Ssl_cipher'")) {
                    if (!result.next() || result.getString(2).isBlank()) throw new IllegalStateException("TLS required");
                }
            }
        }
        @Override public void close() { pools.values().forEach(HikariDataSource::close); }
    }

    private LocalContainerEntityManagerFactoryBean factory(DatabaseSet set, String unit) {
        var factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(set.pools.get(unit));
        factory.setPersistenceUnitName(unit);
        factory.setPackagesToScan("com.mediconnect." + unit + ".domain");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "validate",
                "hibernate.dialect", set.isolated ? "org.hibernate.dialect.H2Dialect" : "org.hibernate.dialect.MySQLDialect",
                "hibernate.jdbc.time_zone", "UTC", "hibernate.show_sql", "false"));
        return factory;
    }
    @Bean LocalContainerEntityManagerFactoryBean authEntityManagerFactory(DatabaseSet set) { return factory(set, "auth"); }
    @Bean LocalContainerEntityManagerFactoryBean patientEntityManagerFactory(DatabaseSet set) { return factory(set, "patient"); }
    @Bean LocalContainerEntityManagerFactoryBean doctorEntityManagerFactory(DatabaseSet set) { return factory(set, "doctor"); }
    // The existing BookingTransactions @PersistenceContext belongs to Appointment.
    @Bean @Primary LocalContainerEntityManagerFactoryBean appointmentEntityManagerFactory(DatabaseSet set) { return factory(set, "appointment"); }

    @Bean JpaTransactionManager authTransactionManager(@Qualifier("authEntityManagerFactory") EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
    @Bean JpaTransactionManager patientTransactionManager(@Qualifier("patientEntityManagerFactory") EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
    @Bean JpaTransactionManager doctorTransactionManager(@Qualifier("doctorEntityManagerFactory") EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
    @Bean @Primary JpaTransactionManager appointmentTransactionManager(@Qualifier("appointmentEntityManagerFactory") EntityManagerFactory factory) { return new JpaTransactionManager(factory); }

    @Configuration(proxyBeanMethods = false)
    @EnableJpaRepositories(basePackages = "com.mediconnect.auth.persistence", entityManagerFactoryRef = "authEntityManagerFactory", transactionManagerRef = "authTransactionManager")
    static class AuthRepositories {}
    @Configuration(proxyBeanMethods = false)
    @EnableJpaRepositories(basePackages = "com.mediconnect.patient.persistence", entityManagerFactoryRef = "patientEntityManagerFactory", transactionManagerRef = "patientTransactionManager")
    static class PatientRepositories {}
    @Configuration(proxyBeanMethods = false)
    @EnableJpaRepositories(basePackages = "com.mediconnect.doctor.persistence", entityManagerFactoryRef = "doctorEntityManagerFactory", transactionManagerRef = "doctorTransactionManager")
    static class DoctorRepositories {}
    @Configuration(proxyBeanMethods = false)
    @EnableJpaRepositories(basePackages = "com.mediconnect.appointment.persistence", entityManagerFactoryRef = "appointmentEntityManagerFactory", transactionManagerRef = "appointmentTransactionManager")
    static class AppointmentRepositories {}
}
