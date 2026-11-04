# MediConnect frontend — Phase 6

A React + TypeScript patient web application connected to the existing Spring Boot services through the API Gateway. Phase 6 builds on the feature folders, repository boundary, router, CSS, and reusable components introduced by the original frontend. It does not replace the backend architecture.

## Run locally

Requirements: the existing supported Node version (package.json requires >=22.12), npm, and the six Phase 5 services. Keep MySQL on port 3306. No Docker, new schema, new account, or new third-party credentials are required.

From `frontend/`:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. All browser API requests use relative `/api/...` paths. Vite forwards them to http://127.0.0.1:8080, preserving paths and bearer headers. There are no browser calls to individual microservices and no wildcard CORS configuration.

Rebuild/restart Patient Service after applying Phase 6: it now exposes `GET /api/patients/me`. See [the complete Phase 6 guide](../backend/docs/PHASE_6.md) for commands and verification.

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

Preview uses http://127.0.0.1:4173 and the same local API proxy. These servers bind to loopback. For a future production deployment, configure a real HTTPS reverse proxy to serve the frontend, route `/api` to the gateway, and serve index.html for client-side routes. Vite's development proxy is not packaged into the static build.

## What works

- Public doctor search, specialties/locations catalog, filters, sorting and server pagination.
- Public doctor profiles and real available slot UUIDs over the next seven days; times displayed in Asia/Kolkata.
- Patient registration and login, protected patient routes and sign-out.
- Create or retrieve the signed-in patient's profile; resume booking after setup.
- Book, list and cancel your own appointments; show 409 conflicts and uncertain network outcomes honestly.
- Existing appointment history remains visible even when a doctor's public details cannot be loaded.

This is still a local learning project: use fictional patient details. Booking persists in MySQL but does not contact a real clinic or collect payment.

## Structure and reasons

```text
src/
  app/
    App.tsx                    # Existing router, layout and navigation
    RepositoryProvider.tsx     # Dependency injection boundary for UI tests
    CatalogProvider.tsx        # Server-managed locations and specialty labels
  data/
    apiModels.ts               # Typed Spring API payloads and page envelopes
    contracts.ts               # Live HealthcareRepository + historical demo contract
    httpClient.ts              # Same-origin fetch, timeout, errors, bearer handling
    httpRepository.ts          # API operations and bounded appointment-detail joins
    mockRepository.ts          # Historical isolated test fixture; not used by main.tsx
    storage.ts                 # Historical demo storage tests only
  features/
    auth/                      # In-memory session, sign-in/register, route guard
    patients/                  # Own-profile lookup and first-time profile form
    doctors/                   # Existing discovery, profile and card components
    appointments/              # Booking confirmation, history and cancellation
  shared/                      # Existing date/status/avatar hooks + pagination
  test/fixtures.ts             # Fictional HTTP response fixtures, test-only JWTs
  main.tsx                     # Chooses HTTP adapter and providers
```

The stack remains React 19, TypeScript, Vite, React Router, Vitest and Testing Library at the repository's locked versions. Native fetch is sufficient; no Redux, Axios or new runtime library is necessary. Business invariants and authorization remain in Spring services; the UI presents their results.

The original demo used generated slots, local filtering, and sessionStorage bookings. The live adapter uses backend pagination, persistent booking IDs, authenticated ownership and database-backed availability. Old demo modules/tests are retained for learning and are not a fallback mode or part of the live dependency graph. `SOURCE_GUIDE.md` and the original reference review describe that earlier version.

## Authentication behavior

JWTs exist only in memory. Reloading, closing the tab, signing out or expiry ends the browser session. Sign in again to retrieve the same database records. Tokens, passwords, and profiles are not written to localStorage/sessionStorage. There is no refresh-token or server revocation endpoint in this phase.

JWT decoding drives UI navigation only. Signature, issuer, audience, expiry, role and ownership enforcement remain server-side. Logging out clears local state; it does not revoke an already issued JWT. A late response from an old account is rejected, and private pages remount on a session change.

The application never accepts a typed patient UUID for booking, offers a registration role picker, or lists every patient to find your profile. Existing unassigned patient rows are not claimed by matching email. Inactive/legacy profiles need administrator handling using the existing backend workflow.

## Errors and limits

- No automatic retries for writes. A timed-out booking may already have committed; check My appointments before retrying.
- No mock fallback on connection errors.
- Catalog entries come from `/api/doctors/catalog`; local symbols/hints are presentation metadata only.
- Appointment details join at most ten appointment records per page. A failed public detail lookup does not hide the appointment itself.
- This phase adds patient-facing integration only. No admin dashboard, profile editor, calendar rescheduling, payments, notifications, Redis or Kafka changes.

Automated UI tests use HTTP response fixtures. They do not prove a connection to your Windows MySQL instance; perform the local browser checklist in PHASE_6.md.
