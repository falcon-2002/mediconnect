import { createContext, useCallback, useContext } from "react";
import type { ReactNode } from "react";
import { useRepository } from "./RepositoryProvider";
import { useAsync } from "../shared/useAsync";
import type { Catalog } from "../data/apiModels";
interface CatalogState {
  data?: Catalog;
  loading: boolean;
  error: string;
  refresh: () => void;
}
const Context = createContext<CatalogState | null>(null);
export function CatalogProvider({ children }: { children: ReactNode }) {
  const repository = useRepository();
  const state = useAsync(
    useCallback(() => repository.getCatalog(), [repository]),
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useCatalog() {
  const state = useContext(Context);
  if (!state) throw new Error("CatalogProvider is required");
  return { ...state, label: (id: string) => state.data?.specialties[id] ?? id };
}
