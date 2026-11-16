#!/bin/sh
set -eu

# Render secret files are text: mount the provider CA PEM, then create the Java
# truststore at runtime. No database password or private key enters an image layer.
if [ -n "${MYSQL_CA_CERT:-}" ]; then
    : "${MYSQL_TRUSTSTORE_PASSWORD:?Set MYSQL_TRUSTSTORE_PASSWORD in the service environment}"
    umask 077
    trust_directory=$(mktemp -d)
    keytool -importcert -noprompt -alias mysql-provider-ca \
        -file "$MYSQL_CA_CERT" -storetype PKCS12 \
        -keystore "$trust_directory/mysql-truststore.p12" \
        -storepass:env MYSQL_TRUSTSTORE_PASSWORD >/dev/null
    export MYSQL_TRUSTSTORE_URL="file:$trust_directory/mysql-truststore.p12"
fi

exec java -jar /app/app.jar
