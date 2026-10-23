import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { HealthcareRepository } from "../data/contracts";

const RepositoryContext = createContext<HealthcareRepository | null>(null);
export function RepositoryProvider({
  repository,
  children,
}: {
  repository: HealthcareRepository;
  children: ReactNode;
}) {
  return (
    <RepositoryContext.Provider value={repository}>
      {children}
    </RepositoryContext.Provider>
  );
}
export function useRepository(): HealthcareRepository {
  const value = useContext(RepositoryContext);
  if (!value) throw new Error("RepositoryProvider is required.");
  return value;
}
