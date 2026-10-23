import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { locations, specialties } from "../../config/catalog";
import { useRepository } from "../../app/RepositoryProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { DoctorCard } from "./DoctorCard";
import { searchDoctors } from "./search";
import type { DoctorSort } from "./model";

export function DiscoveryPage() {
  const repository = useRepository();
  const load = useCallback(() => repository.listDoctors(), [repository]);
  const state = useAsync(load);
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const city = params.get("city") || "";
  const specialty = params.get("specialty") || "";
  const rawSort = params.get("sort");
  const sort: DoctorSort =
    rawSort === "fee" || rawSort === "experience" ? rawSort : "name";
  const fee = Number(params.get("fee"));
  const maxFee =
    params.has("fee") && Number.isFinite(fee) && fee >= 0 ? fee : undefined;
  const results = searchDoctors(state.data || [], {
    query,
    city,
    specialty,
    sort,
    maxFee,
  });
  const change = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">YOUR NEXT STEP TO FEELING BETTER</span>
          <h1>
            Good care.
            <br />A little <em>closer.</em>
          </h1>
          <p>
            Find a doctor who fits your needs.
            <br />
            Choose a time that fits your day.
          </p>
          <a className="text-link" href="#results">
            Explore doctors <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit" />
          <div className="care-cross">✚</div>
          <div className="art-card">
            <span className="tiny-dot" />A simpler way to plan your care.
            <small>DISCOVER · CHOOSE · BOOK</small>
          </div>
          <span className="art-caption">Care starts with a connection.</span>
        </div>
      </section>
      <section className="search-panel" aria-label="Doctor search">
        <label>
          <span>YOUR LOCATION</span>
          <select
            aria-label="City"
            value={city}
            onChange={(e) => change("city", e.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((item) => (
              <option key={item}>{item}</option>
            ))}
            {city && !(locations as readonly string[]).includes(city) && (
              <option value={city}>{city}</option>
            )}
          </select>
        </label>
        <label className="search-input">
          <span>WHO ARE YOU LOOKING FOR?</span>
          <input
            aria-label="Search doctors or clinics"
            placeholder="Doctor, specialty, or clinic"
            value={query}
            onChange={(e) => change("q", e.target.value)}
          />
        </label>
        <a className="button" href="#results">
          Find care <span aria-hidden="true">↗</span>
        </a>
      </section>
      <section className="specialties">
        <div className="section-label">
          <h2>Care for every day</h2>
          <p>Start with a specialty</p>
        </div>
        <div className="specialty-grid">
          {specialties.map((item) => (
            <button
              className={`specialty-tile ${specialty === item.id ? "selected" : ""}`}
              aria-pressed={specialty === item.id}
              key={item.id}
              onClick={() =>
                change("specialty", specialty === item.id ? "" : item.id)
              }
            >
              <span className="specialty-symbol" aria-hidden="true">
                {item.symbol}
              </span>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </section>
      <section id="results" className="discovery">
        <aside className="filters">
          <span className="eyebrow">MAKE IT YOURS</span>
          <h2>Find your fit</h2>
          <label>
            Specialty
            <select
              value={specialty}
              onChange={(e) => change("specialty", e.target.value)}
            >
              <option value="">All specialties</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              {specialty && !specialties.some((s) => s.id === specialty) && (
                <option value={specialty}>{specialty}</option>
              )}
            </select>
          </label>
          <label>
            Consultation fee
            <select
              value={maxFee === undefined ? "" : String(maxFee)}
              onChange={(e) => change("fee", e.target.value)}
            >
              <option value="">Any fee</option>
              <option value="500">Up to ₹500</option>
              <option value="700">Up to ₹700</option>
              <option value="1000">Up to ₹1,000</option>
              {maxFee !== undefined && ![500, 700, 1000].includes(maxFee) && (
                <option value={maxFee}>Up to ₹{maxFee}</option>
              )}
            </select>
          </label>
          <button className="text-link" onClick={() => setParams({})}>
            Reset filters ↺
          </button>
          <div className="aside-note">
            <span aria-hidden="true">✦</span>
            <p>
              Take your time.
              <br />
              The right fit matters.
            </p>
          </div>
        </aside>
        <div className="results">
          <div className="results-heading">
            <div>
              <span className="eyebrow">A CONNECTION AWAY</span>
              <h2>Meet your next doctor</h2>
              <p aria-live="polite">
                {state.loading
                  ? "Loading doctors…"
                  : `${results.length} doctors${city ? ` in ${city}` : " across our demo locations"}`}
              </p>
            </div>
            <label className="sort">
              Sort by
              <select
                aria-label="Sort doctors"
                value={sort}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="name">Name</option>
                <option value="fee">Lowest fee</option>
                <option value="experience">Most experience</option>
              </select>
            </label>
          </div>
          <Status
            loading={state.loading}
            error={state.error}
            retry={state.refresh}
          />
          {!state.loading && !state.error && (
            <div className="doctor-grid">
              {results.map((doctor) => (
                <DoctorCard key={doctor.id} doctor={doctor} />
              ))}
              {!results.length && (
                <div className="empty">
                  <h3>A wider search may help.</h3>
                  <p>
                    Try another specialty, a different city, or a higher fee
                    limit.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setParams({})}
                  >
                    Show all doctors
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
