import { QueryClient } from "@tanstack/react-query";

// Instancia unica: as telas usam pelos hooks de @/services/queries, e o
// carregamento imperativo da ModulePage usa queryClient.fetchQuery com as
// mesmas chaves, entao o cache e compartilhado entre os dois caminhos.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
