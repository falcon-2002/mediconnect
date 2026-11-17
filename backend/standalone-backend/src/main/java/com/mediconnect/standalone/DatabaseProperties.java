package com.mediconnect.standalone;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("mediconnect")
public record DatabaseProperties(Map<String, Database> databases, boolean migrationsEnabled) {
    // No generated toString(): never include credentials in diagnostics.
    public static final class Database {
        private String url, username, password;
        public String getUrl() { return url; }
        public void setUrl(String value) { url = value; }
        public String getUsername() { return username; }
        public void setUsername(String value) { username = value; }
        public String getPassword() { return password; }
        public void setPassword(String value) { password = value; }
        @Override public String toString() { return "Database[credentials redacted]"; }
    }
}
