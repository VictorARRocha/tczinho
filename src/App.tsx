import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { PageLoading } from "@/components/PageLoading";

// Carregamento eager apenas para a Home (a maior parte dos usuários entra por ela)
import Index from "./pages/Index";

// Demais rotas carregadas sob demanda (code-splitting) — bundle inicial menor
const ModulePage = lazy(() => import("./pages/ModulePage"));

const ReexecutarTestes = lazy(() => import("./pages/ReexecutarTestes"));
const JenkinsHome = lazy(() => import("./pages/JenkinsHome"));
const JenkinsRodagemCompleta = lazy(() => import("./pages/JenkinsRodagemCompleta"));
const NotFound = lazy(() => import("./pages/NotFound"));

// React Query com cache seguro: evita refetches agressivos ao trocar de aba/foco
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s sem refetch automático
      gcTime: 5 * 60_000,       // 5min em cache
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const withSuspense = (node: React.ReactNode, message?: string, variant?: "spinner" | "skeleton-cards" | "skeleton-table") => (
  <Suspense fallback={<PageLoading message={message} variant={variant} />}>{node}</Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route
              path="/modulo/:slug"
              element={withSuspense(<ModulePage />, "Carregando módulo...", "skeleton-table")}
            />
            <Route
              path="/importar"
              element={withSuspense(<ImportPage />, "Carregando importação...")}
            />
            <Route
              path="/jenkins"
              element={withSuspense(<JenkinsHome />, "Carregando Jenkins...", "skeleton-cards")}
            />
            <Route
              path="/jenkins/rodagem-completa"
              element={withSuspense(<JenkinsRodagemCompleta />, "Preparando rodagem...")}
            />
            <Route
              path="/jenkins/reexecutar"
              element={withSuspense(<ReexecutarTestes />, "Carregando reexecução...", "skeleton-table")}
            />
            <Route path="/reexecutar" element={<Navigate to="/jenkins/reexecutar" replace />} />
          </Route>
          <Route path="*" element={withSuspense(<NotFound />)} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
