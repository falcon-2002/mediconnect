import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { RepositoryProvider } from "./app/RepositoryProvider";
import { createMockRepository } from "./data/mockRepository";
import { createSessionStorage } from "./data/storage";
import "./styles.css";

// Composition root: only this file chooses the concrete data adapter.
const storage = createSessionStorage({
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
  clear: () => window.sessionStorage.clear(),
  key: (index) => window.sessionStorage.key(index),
  get length() {
    return window.sessionStorage.length;
  },
});
const repository = createMockRepository(storage);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <RepositoryProvider repository={repository}>
        <App />
      </RepositoryProvider>
    </BrowserRouter>
  </StrictMode>,
);
