# Build context: backend/. SERVICE is the only build argument; never pass secrets.
FROM maven:3.9.11-eclipse-temurin-17 AS build
ARG SERVICE=patient-service
WORKDIR /build
COPY pom.xml ./
COPY appointment-service/pom.xml appointment-service/pom.xml
COPY doctor-service/pom.xml doctor-service/pom.xml
COPY auth-service/pom.xml auth-service/pom.xml
COPY patient-service/pom.xml patient-service/pom.xml
COPY discovery-server/pom.xml discovery-server/pom.xml
COPY api-gateway/pom.xml api-gateway/pom.xml
COPY ${SERVICE}/src/main ${SERVICE}/src/main
RUN case "$SERVICE" in appointment-service|doctor-service|auth-service|patient-service|discovery-server|api-gateway) ;; *) exit 1 ;; esac \
    && mvn -B -ntp -pl "$SERVICE" -am package -Dmaven.test.skip=true \
    && cp "$SERVICE/target/$SERVICE-0.1.0-SNAPSHOT.jar" /build/app.jar

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system mediconnect \
    && useradd --system --gid mediconnect mediconnect \
    && (getent group 1000 >/dev/null || groupadd --gid 1000 render-secrets) \
    && usermod --append --groups 1000 mediconnect
COPY --from=build --chown=mediconnect:mediconnect /build/app.jar /app/app.jar
COPY --chown=mediconnect:mediconnect deploy-entrypoint.sh /app/deploy-entrypoint.sh
# Group 1000 permits reading Render secret files as a non-root runtime user.
USER mediconnect
ENV PORT=10000
ENV SERVER_PORT=10000
ENV JAVA_TOOL_OPTIONS="-XX:InitialRAMPercentage=20 -XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError -Xss512k"
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl --fail --silent "http://127.0.0.1:${PORT}/actuator/health" > /dev/null || exit 1
ENTRYPOINT ["sh", "/app/deploy-entrypoint.sh"]
