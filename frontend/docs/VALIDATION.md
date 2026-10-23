# Validation

- `npm run build`: passed strict TypeScript checks and generated the production bundle.
- `npm test`: passed **18 tests across 4 files**.
- Tests cover literal search, combined filters, fee boundaries, sorting, no mutation, IST slot generation, year rollover, input validation, forged/mismatched/past slots, duplicate bookings, cancellation/rebooking, same-session simultaneous submissions, reload persistence through an adapter, unknown doctors, storage failures, corrupted persisted data, empty search, unavailable booking links, and a rendered full booking/cancellation journey.
- UI integration tests use jsdom and Testing Library. Real-browser layout/device QA was not performed; no pixel-level or physical-mobile verification is claimed.
- Reference live UI was separately inspected in a browser. Search suggestions did not appear during inspection; Google sign-in was disabled. Reference protected/payment flows were reviewed in source only.
- Informational React Router `use client` directive warnings do not affect this client-only build.
