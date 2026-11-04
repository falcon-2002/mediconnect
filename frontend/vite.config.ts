import { defineConfig } from "vitest/config";
// Same-origin browser requests; preserve /api paths while forwarding to the gateway.
const proxy = {
  "/api": { target: "http://127.0.0.1:8080", changeOrigin: true },
};
export default defineConfig({
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
