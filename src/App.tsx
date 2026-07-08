import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { PageLoading } from "@/components/PageLoading";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import AguardandoAprovacao from "./pages/AguardandoAprovacao";
import AcessoNegado from "./pages/AcessoNegado";

const ModulePage = lazy(() => import("./pages/ModulePage"));
const ReexecutarTestes = lazy(() => import("./pages/ReexecutarTestes"));
const JenkinsHome = lazy(() => import("./pages/JenkinsHome"));
const JenkinsRodagemCompleta = lazy(() => import("./pages/JenkinsRodagemCompleta"));
const AdminUsuarios = lazy(() => import("./pages/AdminUsuarios"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
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
        <AuthProvider>
          <Routes>
            {/* públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />

            {/* protegidas */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Index />} />
              <Route path="/acesso-negado" element={<AcessoNegado />} />
              <Route
                path="/modulo/:slug"
                element={withSuspense(<ModulePage />, "Carregando módulo...", "skeleton-table")}
              />
              <Route path="/importar" element={<Navigate to="/" replace />} />
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

              <Route
                path="/admin/usuarios"
                element={
                  <ProtectedRoute requireAdmin>
                    {withSuspense(<AdminUsuarios />, "Carregando admin...", "skeleton-cards")}
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={withSuspense(<NotFound />)} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
