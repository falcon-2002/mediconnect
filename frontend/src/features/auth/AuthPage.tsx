import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useRepository } from "../../app/RepositoryProvider";
import { ApiError } from "../../data/httpClient";
import { useAuth } from "./AuthProvider";
import { safeReturnTo } from "./session";
export function AuthPage({ register = false }: { register?: boolean }) {
  const repository = useRepository();
  const { session, store } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeReturnTo(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  if (session)
    return (
      <Navigate
        replace
        to={session.roles.includes("PATIENT") ? next : "/doctors"}
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (new TextEncoder().encode(password).length > 72) {
      setError("Password must be at most 72 UTF-8 bytes.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    let succeeded = false;
    try {
      const credentials = { email: email.trim(), password };
      if (register) {
        await repository.register(credentials);
        setPassword("");
        succeeded = true;
        navigate(`/login?registered=1&next=${encodeURIComponent(next)}`, {
          replace: true,
        });
      } else {
        const token = await repository.login(credentials);
        store.set(token);
        setPassword("");
        succeeded = true;
        navigate(
          store.getSnapshot()?.roles.includes("PATIENT") ? next : "/doctors",
          { replace: true },
        );
      }
    } catch (reason) {
      setPassword("");
      setError(
        reason instanceof ApiError && reason.status === 409
          ? "An account with this email already exists. Sign in instead."
          : reason instanceof Error
            ? reason.message
            : "Unable to sign in.",
      );
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
        <span className="eyebrow">YOUR CARE, CONNECTED</span>
        <h1>{register ? "Create your patient account" : "Welcome back"}</h1>
        <p>Sign in to manage your profile and appointments.</p>
      </div>
      {params.get("registered") === "1" && (
        <p className="success" role="status">
          Account created. Sign in to continue.
        </p>
      )}
      <form className="patient-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 12 : 1}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {register && (
          <small>
            Use 12–72 characters, at most 72 UTF-8 bytes. Registration creates a
            patient account.
          </small>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
        </button>
        <p>
          <Link
            to={`/${register ? "login" : "register"}?next=${encodeURIComponent(next)}`}
          >
            {register
              ? "Already registered? Sign in"
              : "New here? Create an account"}
          </Link>
        </p>
        <p className="muted">
          Use fictional details for this learning project. Reloading the page
          ends your sign-in session; saved records remain in MySQL.
        </p>
      </form>
    </section>
  );
}
