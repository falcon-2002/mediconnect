import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { useAsync } from "../../shared/useAsync";
import { Status } from "../../shared/Status";
import { ApiError } from "../../data/httpClient";
import { safeReturnTo } from "../auth/session";
import type { PatientInput } from "../../data/apiModels";
export function ProfileSetupPage() {
  const repository = useRepository();
  const state = useAsync(
    useCallback(() => repository.getMyPatient(), [repository]),
  );
  const [params] = useSearchParams();
  const next = safeReturnTo(params.get("next"));
  const navigate = useNavigate();
  const [form, setForm] = useState<PatientInput>({
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
  });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  function change(field: keyof PatientInput, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setFields({});
    let succeeded = false;
    try {
      await repository.createPatient(form);
      succeeded = true;
      navigate(next === "/profile" ? "/appointments" : next, { replace: true });
    } catch (reason) {
      if (reason instanceof ApiError) {
        setFields(reason.fieldErrors);
        setError(
          reason.status === 409
            ? "A profile or this email already exists. Retry loading your profile. If it is inactive or unassigned, ask the project administrator; it cannot be claimed by email."
            : reason.message,
        );
        if (reason.status === 409) state.refresh();
      } else setError("Could not save your profile.");
    } finally {
      if (!succeeded) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section className="page-section auth-page">
      <div className="page-title">
        <span className="eyebrow">READY FOR YOUR VISIT</span>
        <h1>My patient profile</h1>
        <p>
          Your account owns this profile. Appointments use its ID automatically.
        </p>
      </div>
      <Status
        loading={state.loading}
        error={state.error}
        retry={state.refresh}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!state.loading &&
        !state.error &&
        (state.data ? (
          <article className="visit-summary">
            <h2>{state.data.fullName}</h2>
            <p>{state.data.email}</p>
            <p>{state.data.phone}</p>
            <p>Date of birth: {state.data.dateOfBirth}</p>
            <p>{state.data.address}</p>
            <Link
              className="button"
              to={next === "/profile" ? "/appointments" : next}
            >
              Continue
            </Link>
          </article>
        ) : (
          <form className="patient-form" onSubmit={submit}>
            <h2>Complete your profile</h2>
            <p>Enter fictional details for this learning project.</p>
            <label>
              Full name
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => change("fullName", e.target.value)}
              />
            </label>
            <label>
              Contact email
              <input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={form.email}
                onChange={(e) => change("email", e.target.value)}
              />
            </label>
            <label>
              Mobile number
              <input
                required
                type="tel"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => change("phone", e.target.value)}
              />
            </label>
            <label>
              Date of birth
              <input
                required
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => change("dateOfBirth", e.target.value)}
              />
            </label>
            <label>
              Address
              <textarea
                required
                maxLength={500}
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => change("address", e.target.value)}
              />
            </label>
            {Object.entries(fields).map(([field, message]) => (
              <p className="error" key={field}>
                {field}: {message}
              </p>
            ))}
            <button className="button full" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>
        ))}
    </section>
  );
}
