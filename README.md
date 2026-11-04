# MediConnect

A full-stack healthcare appointment application built with Spring Boot
microservices and a React frontend.

Visitors can discover doctors and view availability. Patients can
register, create their profile, book appointments, review their appointment
history, and cancel upcoming bookings.

> Portfolio and learning project using fictional data.
> Currently runs locally; public deployment is planned.

## Features

- Public doctor discovery with city, specialty, fee, sorting, and pagination.
- Doctor profiles with real appointment slots from the backend.
- Patient registration and login using RS256-signed JWTs.
- Role-based authorization and patient ownership checks.
- Patient profile creation and retrieval.
- Concurrency-safe appointment booking with conflict responses.
- Appointment history and cancellation.
- Centralized API routing and Eureka service discovery.
- Repeatable local seed tools for fictional doctors and future slots.

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router |
| Backend | Java, Spring Boot, Spring Security |
| Microservices | Spring Cloud Gateway Server WebMVC, Eureka |
| Persistence | MySQL, Spring Data JPA, Hibernate, Flyway |
| Authentication | JWT with RSA signing |
| Testing | JUnit, Spring Boot tests, Vitest, React Testing Library |
| API documentation | Springdoc OpenAPI / Swagger |

## Services

| Service | Port | Responsibility |
| --- | --- | --- |
| API Gateway | 8080 | Routes frontend API requests |
| Patient Service | 8081 | Patient profiles and account ownership |
| Auth Service | 8082 | Registration, login, and JWT issuance |
| Doctor Service | 8083 | Doctor discovery and administrator management |
| Appointment Service | 8084 | Availability, booking, and cancellation |
| Discovery Server | 8761 | Eureka service registry |
| Frontend | 5173 | Patient-facing web application |

## Architecture

The frontend makes same-origin `/api` requests. During local development,
Vite proxies these requests to the API Gateway, which discovers backend
services through Eureka.

Each business service owns its database schema and credentials.
Services exchange identifiers rather than sharing JPA entities or
cross-service database relationships.

Authentication issues signed tokens, while protected services enforce
authorization and patient ownership themselves. Frontend route guards
support the user experience; they do not replace backend security.

The frontend separates feature screens, typed models, and HTTP data
access. Availability comes from the backend, and booking correctness is
enforced by the database-backed appointment workflow.

## Repository Structure

```text
mediconnect/
├── frontend/                 # React application and frontend tests
├── backend/
│   ├── auth-service/
│   ├── patient-service/
│   ├── doctor-service/
│   ├── appointment-service/
│   ├── api-gateway/
│   ├── discovery-server/
│   ├── scripts/              # Local data setup and verification
│   ├── docs/                 # Architecture and phase guides
│   └── pom.xml               # Maven multi-module build
├── start-all.ps1
└── stop-all.bat
```

## Running Locally

Prerequisites include a compatible JDK, Node.js/npm, and local MySQL.
The Maven wrapper is included.

Configure the service databases, database users, and external RSA signing
keys before starting. Follow the setup guides linked below; credentials
and runtime private keys must remain outside Git.

Build the backend:

```powershell
cd backend
.\mvnw.cmd clean package
cd ..
```

Start the configured backend services:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\start-all.ps1" -SkipFrontend
```

In another terminal, start the frontend:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173.

For fictional doctors and future booking slots, follow the local data
guide. Seeding is an explicit development action, separate from startup.

## Testing

Backend tests:

```powershell
cd backend
.\mvnw.cmd test
```

Frontend checks:

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

The project includes API/security tests, frontend HTTP and user-flow
tests, and separate MySQL integration/concurrency checks.

See the phase documentation for database test setup, recorded live
verification, and remaining manual checklist items.

## Documentation

- [Authentication and authorization](backend/docs/PHASE_3.md)
- [Doctor discovery](backend/docs/PHASE_4.md)
- [Appointments and concurrency](backend/docs/PHASE_5.md)
- [Frontend integration](backend/docs/PHASE_6.md)
- [Local demo data and verification](backend/docs/LOCAL_DATA.md)

## Current Limitations

- JWTs are held in memory; refreshing the page requires signing in again.
- Refresh tokens and server-side token revocation are not implemented.
- Administrator operations use APIs and local tools; there is no admin dashboard.
- Rescheduling, payments, notifications, Redis, and Kafka are not implemented.
- Public deployment is planned.

## Author

Satya Prakash Mohapatra  
GitHub: [falcon-2002](https://github.com/falcon-2002)

Linked In :[https://www.linkedin.com/in/satya-prakash-mohapatra]

[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/falcon-2002/mediconnect?utm_source=readme&utm_medium=badge)
