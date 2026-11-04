import type { TokenResponse } from "../../data/apiModels";
export interface Session {
  accessToken: string;
  accountId: string;
  roles: string[];
  expiresAt: number;
}
// Decoding is for navigation only. Spring Security validates signatures and permissions.
export function decodeSession(token: TokenResponse, now = Date.now()): Session {
  try {
    if (token.tokenType !== "Bearer" || !(token.expiresIn > 0))
      throw new Error();
    const parts = token.accessToken.split(".");
    if (parts.length !== 3) throw new Error();
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    );
    if (
      typeof claims.sub !== "string" ||
      !Array.isArray(claims.roles) ||
      !claims.roles.every((role: unknown) => typeof role === "string") ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp)
    )
      throw new Error();
    const expiresAt = Math.min(claims.exp * 1000, now + token.expiresIn * 1000);
    if (expiresAt <= now) throw new Error();
    return {
      accessToken: token.accessToken,
      accountId: claims.sub,
      roles: claims.roles,
      expiresAt,
    };
  } catch {
    throw new Error("The sign-in response was invalid. Please sign in again.");
  }
}
export function createSessionStore() {
  let value: Session | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (response: TokenResponse) => {
      value = decodeSession(response);
      emit();
    },
    clear: (expectedToken?: string) => {
      if (expectedToken && value?.accessToken !== expectedToken) return;
      value = null;
      emit();
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
export function safeReturnTo(value: string | null): string {
  return value &&
    /^\/(?:book\/[^/?#]+(?:\?[^#]*)?|appointments(?:\?[^#]*)?|profile(?:\?[^#]*)?)$/.test(
      value,
    ) &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/appointments";
}
