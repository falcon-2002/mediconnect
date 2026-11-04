import type { SessionStore } from "../features/auth/session";
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function createHttpClient(
  session: SessionStore,
  fetcher: typeof fetch = fetch,
) {
  return async function request<T>(
    path: string,
    options: { method?: string; body?: unknown; authenticated?: boolean } = {},
  ): Promise<T> {
    if (!path.startsWith("/api/") || /[\\\r\n]/.test(path))
      throw new Error("Invalid API path");
    const snapshot = session.getSnapshot();
    const token = options.authenticated ? snapshot?.accessToken : undefined;
    if (
      options.authenticated &&
      (!token || !snapshot || snapshot.expiresAt <= Date.now())
    ) {
      session.clear(token);
      throw new ApiError(401, "Your session has ended. Please sign in again.");
    }
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let payload: unknown;
    try {
      response = await fetcher(path, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      const text = await response.text();
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        payload = undefined;
      }
    } catch {
      throw new ApiError(
        0,
        options.method && options.method !== "GET"
          ? "The server could not confirm this request. Check your appointments or profile before trying again."
          : "Cannot reach MediConnect. Check that the services are running, then try again.",
      );
    } finally {
      clearTimeout(timeout);
    }
    // A late response from a previous session must not populate the new account's UI.
    if (token && session.getSnapshot()?.accessToken !== token)
      throw new ApiError(401, "Your session changed. Please try again.");
    if (response.status === 401 && token) session.clear(token);
    if (!response.ok) {
      const problem =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const messages: Record<number, string> = {
        400: "Check the supplied details.",
        401: token
          ? "Your session has ended. Please sign in again."
          : "Email or password is incorrect.",
        403: "You do not have permission to do this.",
        404: "This record was not found.",
        409: "This request conflicts with the current record. Refresh and try again.",
        429: "Too many requests. Please try again shortly.",
      };
      const fields =
        problem.fieldErrors && typeof problem.fieldErrors === "object"
          ? Object.fromEntries(
              Object.entries(problem.fieldErrors).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            )
          : {};
      throw new ApiError(
        response.status,
        messages[response.status] ||
          "The service is temporarily unavailable. Please try again.",
        fields,
      );
    }
    if (response.status !== 204 && payload === undefined)
      throw new ApiError(502, "The server returned an unexpected response.");
    return payload as T;
  };
}
export type HttpClient = ReturnType<typeof createHttpClient>;
