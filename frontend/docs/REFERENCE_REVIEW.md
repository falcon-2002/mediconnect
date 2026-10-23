# Reference review and MediConnect design decisions

Reviewed the live deployment and repository on 13 October 2026. Source snapshot: [`a35ec9f`](https://github.com/SaravanakumarJN/Practo---Pentagon/tree/a35ec9f587056fa227ded2fcf1da8d600c3abf42).

## Live-site findings: observed versus inferred

| Screen/flow                      | Evidence and observation                                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home `/`                         | Observed navigation for Doctors, Consult, Pharmacy, Diagnostics, Login; promotional image sections; health-concern tiles; in-clinic specialty cards; articles; app download/SMS field; large multi-column footer |
| Doctor discovery `/doctors`      | Observed an illustrated blue hero, a two-field location/search bar, and six specialty shortcuts; typed Dentist but no doctor suggestions appeared during inspection                                              |
| Login `/login`                   | Observed email/password fields and a Sign up button; Google sign-in was disabled during inspection                                                                                                               |
| Specialty results                | Implemented in source with doctor cards, recommendation percentage, consultation fee filters, and sorting; live success not verified                                                                             |
| Doctor detail and slots          | Implemented in source with a doctor card and expandable daily tabs/time groups; live success not verified                                                                                                        |
| Patient details and booking      | Implemented in source after private-route login, followed by a Stripe checkout step; no credentials entered or payment attempted                                                                                 |
| Appointment history/cancellation | Implemented in source; live authenticated flow not verified                                                                                                                                                      |

No geolocation permission was granted and no sign-in, payment, or real booking was performed. The lack of live search results is a session observation, not proof that the entire site is down. Source inspection establishes intended behavior but cannot prove external integrations still work.

The home screen’s pharmacy, articles, lab, and consultation labels do not establish complete working modules. We do not add these to MediConnect’s requested appointment/discovery scope.

## Existing project organization

```text
Practo---Pentagon/
  backend/
    package.json
    node_modules/           # dependencies checked into the source tree
    src/
      config/db.js
      controllers/          # Express routers and inline database logic
      models/               # Mongoose schemas
      index.js
      server.js
  practo_clone/
    package.json
    public/
    src/
      components/           # shared components plus page-scale components
      pages/
      redux/auth/
      redux/doctorSearch/
      routes/
      utilities/axios.js
      utils.js
```

Frontend: React 17 / Create React App (`react-scripts` 4), JavaScript, React Router 5, Redux 4 with a custom thunk middleware, Material UI 4, CSS Modules, Axios, Moment, Google Login, and Stripe Checkout. Backend: Express 4, Mongoose 5, MongoDB, dotenv, CORS, Stripe, UUID.

### How the pieces connect

`index.js` mounts routing and Redux. Routes select pages or page-sized components. Doctor query actions call an Express API and feed the Redux search reducer; specialty results also make their own calls. Axios helpers are split between `utilities/axios.js`, `utils.js`, and actions. Search needs geolocation coordinates before it submits doctor queries. The manual location geocoding path is incomplete in SearchBar.

Doctor profiles contain name, specialization, experience, city/area, clinic, fee, description, image, likes, and a geospatial location. The UI uses both a custom numeric `id` and MongoDB `_id`. The user model stores profile fields and a Google identifier. Bookings link doctor/user MongoDB IDs and store patient name/contact, a string time, and a boolean status.

The booking UI generates time buttons, fetches existing bookings, and filters them locally. Selection places doctor ID and a timestamp in a route. After payment, it submits the booking and navigates to appointment history. Cancellation patches the boolean status. This is one Express application with shared MongoDB models, not a microservice architecture.

### Source routes

| Frontend route                                        | Purpose                   |
| ----------------------------------------------------- | ------------------------- |
| `/`                                                   | Promotional landing page  |
| `/doctors`                                            | Location/query search     |
| `/doctors/:id/id`                                     | Individual doctor result  |
| `/doctors/:speciality/speciality/:lat/lat/:long/long` | Specialty results         |
| `/appointment/:doctors_id/:time`                      | Protected booking details |
| `/appointments`                                       | Protected booking history |
| `/login`                                              | Login screen              |

## What it does well

- The core patient journey is coherent: discover → compare → select time → confirm → review history.
- Doctor cards expose specialty, experience, location, fee, and a booking action.
- React components and CSS Modules give some separation and style scoping.
- The backend has distinct doctor, user, booking, and appointment routers and model files.
- Search actions cancel a previous request, reducing stale-result races.
- Loading/error state exists for Redux search; appointment cancellation asks for confirmation.
- `.http`-style concepts from the earlier Java reference and isolated service patterns remain useful for the future backend, while this clone is most useful for product-flow study.

## Weaknesses we deliberately address

| Area                | Source evidence                                                                                                                                                             | MediConnect decision                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Organization        | Page-sized Bookingdetails and Landingpage live under components; data logic is spread among helpers, actions, and screens                                                   | Feature folders with domain files plus an injected repository boundary                       |
| Types/contracts     | JavaScript and loose Mongoose String/Array fields; mixed numeric/MongoDB doctor IDs                                                                                         | Explicit Doctor, Slot, Appointment types; one ID format per adapter                          |
| State               | Auth reducer writes localStorage; auth flags are persisted as client state                                                                                                  | No pretend authentication; URL search state, local form state, session-scoped mock history   |
| Search              | Requires coordinates; geocoding handler logs results; manual location add action is commented out                                                                           | Configuration-driven city dropdown with no permissions or API keys                           |
| Search safety       | Raw user query becomes RegExp in the backend                                                                                                                                | Literal token search in the mock; server implementation should validate and bound queries    |
| Sorting             | `.sort()` mutates the React state array during render                                                                                                                       | Pure search returns a new sorted array with stable name tie-breaking                         |
| Fee filter          | The 0–200 branch calls the helper without using its returned data                                                                                                           | One consistent filter predicate, verified with boundary tests                                |
| Effects             | DoctorResultPage and BookingCard use a useState initializer for fetching; Appointments effect depends on appointments then updates appointments                             | Explicit useEffect-based loading hook with stale-response cleanup and retry                  |
| Booking correctness | Backend `Bookings.create(req.body)` has no atomic doctor/time conflict check or unique active-slot constraint                                                               | Tested mock recheck; MySQL transaction/constraint belongs in the later Appointment service   |
| Booking navigation  | `bookSlot()` is not awaited before navigating in the payment callback                                                                                                       | Await completed storage operation before displaying confirmation                             |
| Cancellation        | Success snackbar opens before the cancellation promise resolves                                                                                                             | Show success only after the data operation succeeds                                          |
| Time                | String slicing, browser-local date handling, and arithmetic on HHMM-like values                                                                                             | Canonical ISO timestamps, explicit IST schedule, and native Intl display                     |
| Payment             | Route path appears mismatched; schema uses consulting_fee while charge reads price; charge completion/error handling is weak                                                | No payment integration in the requested demo                                                 |
| Authorization       | PrivateRoutes checks a browser flag; backend accepts client-provided Google profile/user IDs without demonstrated token-verification middleware or booking ownership checks | Clearly identified mock session now; verified JWT identity and backend ownership rules later |
| Errors              | Many routes lack validation and centralized error handling; frontend catches often log only                                                                                 | Visible load/error states, typed booking errors, controlled empty/not-found screens          |
| Deployment          | Hard-coded Heroku/API addresses and client configuration; backend node_modules committed                                                                                    | No remote runtime dependency; lockfile; ignored generated directories                        |
| Testing             | Backend test script is a placeholder; frontend scaffold test is not domain coverage                                                                                         | Search/booking/adapter tests plus a rendered visitor journey                                 |
| Responsiveness      | README explicitly limits support to tablets and larger screens                                                                                                              | Mobile and desktop CSS layouts, with physical device QA still to be done                     |

These findings are static observations; we did not execute the reference backend or attempt to exploit its security gaps. No credential-looking source values are reproduced in the new project.

## Original design direction

MediConnect places discovery directly on its main screen rather than beginning with promotional tiles for multiple unrelated products. The layout uses a cream/forest-green palette, an abstract care motif, compact specialty tiles, a filter rail, and a two-column doctor grid. Profiles and slot selection have their own screen; booking has a quiet two-column review/form layout. Mobile screens stack these sections. All wording, doctor fixtures, initials artwork, and CSS were written for this project.

The retained goals are discovery, informed choice, and appointment booking. Medical records, pharmacy, diagnostics, payment, video consultation, live geolocation, and social login are deliberately outside this starter’s scope.

## Relationship to the Java microservices reference

The earlier Java reference demonstrates patient CRUD, auth, gateway routing, a billing gRPC stub, and Kafka analytics. It does not provide Doctor/Appointment services, Eureka, Redis, or role/ownership enforcement. This frontend gives your MediConnect project a usable patient-facing journey while those backend services are built phase by phase. Its repository interface is the seam for that connection; it does not pretend the microservices already exist.

## Primary sources

- Live UI: https://practo.netlify.app/
- Repository snapshot: https://github.com/SaravanakumarJN/Practo---Pentagon/tree/a35ec9f587056fa227ded2fcf1da8d600c3abf42
- Routes: https://github.com/SaravanakumarJN/Practo---Pentagon/blob/a35ec9f587056fa227ded2fcf1da8d600c3abf42/practo_clone/src/routes/Routes.jsx
- Search: https://github.com/SaravanakumarJN/Practo---Pentagon/blob/a35ec9f587056fa227ded2fcf1da8d600c3abf42/practo_clone/src/components/searchBar/SearchBar.jsx
- Booking UI: https://github.com/SaravanakumarJN/Practo---Pentagon/blob/a35ec9f587056fa227ded2fcf1da8d600c3abf42/practo_clone/src/components/Bookingdetails.jsx
- Booking router: https://github.com/SaravanakumarJN/Practo---Pentagon/blob/a35ec9f587056fa227ded2fcf1da8d600c3abf42/backend/src/controllers/booking.controller.js
- React/TypeScript: https://react.dev/learn/typescript
- Vite: https://vite.dev/guide/
- Vitest: https://vitest.dev/guide/
