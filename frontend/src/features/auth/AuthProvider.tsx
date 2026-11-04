import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import type { SessionStore } from "./session";
const AuthContext = createContext<SessionStore | null>(null);
export function AuthProvider({
  store,
  children,
}: {
  store: SessionStore;
  children: ReactNode;
}) {
  const session = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    if (!session) return;
    const expire = () => {
      if (Date.now() >= session.expiresAt) store.clear(session.accessToken);
    };
    const timer = setTimeout(
      expire,
      Math.max(0, session.expiresAt - Date.now()),
    );
    window.addEventListener("focus", expire);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", expire);
    };
  }, [store, session]);
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const store = useContext(AuthContext);
  if (!store) throw new Error("AuthProvider is required");
  const session = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { session, store };
}
export function RequirePatient() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session)
    return (
      <Navigate
        replace
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  if (!session.roles.includes("PATIENT"))
    return (
      <section className="page-section empty">
        <h1>Patient account required</h1>
        <p>
          This area is for patient accounts. Administrator and doctor tools
          remain available through their existing APIs.
        </p>
        <Link to="/doctors">Browse doctors</Link>
      </section>
    );
  return <Outlet key={session.accessToken} />;
}
