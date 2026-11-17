# Docker build context MUST be backend/. No SERVICE build argument exists here.
FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./
COPY auth-service/pom.xml auth-service/pom.xml
COPY patient-service/pom.xml patient-service/pom.xml
COPY doctor-service/pom.xml doctor-service/pom.xml
COPY appointment-service/pom.xml appointment-service/pom.xml
COPY discovery-server/pom.xml discovery-server/pom.xml
COPY api-gateway/pom.xml api-gateway/pom.xml
COPY standalone-backend/pom.xml standalone-backend/pom.xml
COPY auth-service/src/main auth-service/src/main
COPY patient-service/src/main patient-service/src/main
COPY doctor-service/src/main doctor-service/src/main
COPY appointment-service/src/main appointment-service/src/main
COPY standalone-backend/src/main standalone-backend/src/main
RUN mvn -B -ntp -Pstandalone -pl standalone-backend -am package -Dmaven.test.skip=true \
    && cp standalone-backend/target/standalone-backend-0.1.0-SNAPSHOT.jar /build/app.jar

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN groupadd --system mediconnect && useradd --system --gid mediconnect mediconnect \
    && (getent group 1000 >/dev/null || groupadd --gid 1000 render-secrets) \
    && usermod --append --groups 1000 mediconnect
COPY --from=build --chown=mediconnect:mediconnect /build/app.jar /app/app.jar
USER mediconnect
ENV PORT=10000 SPRING_PROFILES_ACTIVE=render-free
ENV JAVA_TOOL_OPTIONS="-Xms64m -Xmx192m -XX:MaxMetaspaceSize=144m -XX:ReservedCodeCacheSize=48m -XX:MaxDirectMemorySize=16m -XX:+UseSerialGC -Xss512k -XX:+ExitOnOutOfMemoryError"
EXPOSE 10000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
