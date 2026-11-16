package com.mediconnect.appointment.config;

import java.sql.SQLException;
import java.util.Locale;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Deployment-only, read-only checks; never enable settings or rewrite schemas. */
@Component
@Profile("tidb")
public class TiDbDeploymentChecks implements Callback {
    @Override public boolean supports(Event event, Context context) {
        return event == Event.BEFORE_VALIDATE || event == Event.BEFORE_MIGRATE;
    }
    @Override public boolean canHandleInTransaction(Event event, Context context) { return true; }
    @Override public String getCallbackName() { return "verify-tidb-deployment-capabilities"; }

    @Override public void handle(Event event, Context context) {
        try (var statement = context.getConnection().createStatement();
             var result = statement.executeQuery(
                     "SELECT VERSION(), @@GLOBAL.tidb_enable_check_constraint, "
                     + "@@SESSION.foreign_key_checks, @@SESSION.tidb_txn_mode")) {
            if (!result.next() || result.getString(1) == null
                    || !result.getString(1).toLowerCase(Locale.ROOT).contains("tidb"))
                throw new FlywayException("The tidb profile requires a confirmed TiDB server.");
            if (!enabled(result.getString(2)))
                throw new FlywayException("TiDB CHECK enforcement must be enabled before migrations. "
                        + "Stop and follow deployment/TIDB.md; no setting was changed.");
            if (!enabled(result.getString(3)))
                throw new FlywayException("TiDB foreign_key_checks must be enabled before migrations.");
            if (!"pessimistic".equalsIgnoreCase(result.getString(4)))
                throw new FlywayException("TiDB must use pessimistic transactions for the existing booking locks.");
        } catch (SQLException exception) {
            // Never echo raw JDBC errors, server messages, user names or connection strings.
            throw new FlywayException("TiDB deployment checks could not be confirmed. "
                    + "Stop and follow deployment/TIDB.md; no migration was authorized by this check.");
        }
    }

    private static boolean enabled(String value) {
        return "1".equals(value) || "ON".equalsIgnoreCase(value) || "true".equalsIgnoreCase(value);
    }
}
