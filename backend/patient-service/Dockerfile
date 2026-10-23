FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./
COPY patient-service/pom.xml patient-service/pom.xml
RUN mvn -B -pl patient-service dependency:go-offline
COPY patient-service/src patient-service/src
RUN mvn -B -pl patient-service package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN groupadd --system mediconnect && useradd --system --gid mediconnect mediconnect
COPY --from=build --chown=mediconnect:mediconnect /build/patient-service/target/patient-service-0.1.0-SNAPSHOT.jar app.jar
USER mediconnect
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
