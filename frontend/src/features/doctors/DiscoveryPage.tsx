import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { specialties as presentation } from "../../config/catalog";
import { useCatalog } from "../../app/CatalogProvider";
import { Pagination } from "../../shared/Pagination";
import { useRepository } from "../../app/RepositoryProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { DoctorCard } from "./DoctorCard";

import type { DoctorSort } from "./model";

export function DiscoveryPage() {
  const repository = useRepository();
  const catalog = useCatalog();
  const locations = catalog.data?.cities ?? [];
  const specialties = Object.entries(catalog.data?.specialties ?? {}).map(
    ([id, label]) => ({
      id,
      label,
      symbol: presentation.find((s) => s.id === id)?.symbol ?? "✚",
      hint:
        presentation.find((s) => s.id === id)?.hint ??
        "Explore available doctors",
    }),
  );
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
  const rawPage = Number(params.get("page") ?? 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
  const load = useCallback(
    () =>
      repository.searchDoctors({ query, city, specialty, sort, maxFee }, page),
    [repository, query, city, specialty, sort, maxFee, page],
  );
  const state = useAsync(load);
  const results = state.data?.items ?? [];
  const change = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (key !== "page") next.delete("page");
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
      <Status
        loading={catalog.loading}
        error={catalog.error}
        retry={catalog.refresh}
      />
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
            maxLength={200}
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
                  : `${state.data?.totalItems ?? 0} doctors${city ? ` in ${city}` : " across our locations"}`}
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
            <>
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
              <Pagination
                page={page}
                totalPages={state.data?.totalPages ?? 0}
                onChange={(p) => change("page", String(p))}
              />
            </>
          )}
        </div>
      </section>
    </>
  );
}
