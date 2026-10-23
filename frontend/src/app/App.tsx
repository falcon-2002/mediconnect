import { useEffect } from "react";
import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { DiscoveryPage } from "../features/doctors/DiscoveryPage";
import { ProfilePage } from "../features/doctors/ProfilePage";
import { BookingPage } from "../features/appointments/BookingPage";
import { AppointmentsPage } from "../features/appointments/AppointmentsPage";

function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            ✚
          </span>
          MediConnect<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/doctors">Find a doctor</NavLink>
          <NavLink to="/appointments">My appointments</NavLink>
        </nav>
        <span className="demo-badge">LEARNING DEMO</span>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <Link className="brand" to="/">
          MediConnect<span className="brand-dot">.</span>
        </Link>
        <p>Care starts with a connection.</p>
        <span>Fictional doctors. Demo appointments. Built for learning.</span>
      </footer>
    </>
  );
}
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DiscoveryPage />} />
        <Route path="doctors" element={<DiscoveryPage />} />
        <Route path="doctors/:doctorId" element={<ProfilePage />} />
        <Route path="book/:doctorId" element={<BookingPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route
          path="*"
          element={
            <section className="page-section empty">
              <h1>Page not found</h1>
              <Link className="button" to="/">
                Back to MediConnect
              </Link>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
