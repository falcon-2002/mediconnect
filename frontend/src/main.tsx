import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { RepositoryProvider } from "./app/RepositoryProvider";
import { CatalogProvider } from "./app/CatalogProvider";
import { AuthProvider } from "./features/auth/AuthProvider";
import { createSessionStore } from "./features/auth/session";
import { createHttpClient } from "./data/httpClient";
import { createHttpRepository } from "./data/httpRepository";
import "./styles.css";
// Live HTTP only: a failed backend never falls back to mock records.
const session = createSessionStore();
const repository = createHttpRepository(createHttpClient(session));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider store={session}>
        <RepositoryProvider repository={repository}>
          <CatalogProvider>
            <App />
          </CatalogProvider>
        </RepositoryProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
