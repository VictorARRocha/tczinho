import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { PageLoading } from "@/components/PageLoading";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import AccessDenied from "./pages/AccessDenied";

const ModulePage = lazy(() => import("./pages/ModulePage"));
const ReexecutarTestes = lazy(() => import("./pages/ReexecutarTestes"));
const JenkinsHome = lazy(() => import("./pages/JenkinsHome"));
const JenkinsRodagemCompleta = lazy(() => import("./pages/JenkinsRodagemCompleta"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Register />} />
          <Route path="/register" element={<Navigate to="/cadastro" replace />} />
          <Route path="/pendente" element={<Pending />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Index />} />
            <Route path="/acesso-negado" element={<AccessDenied />} />
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
                <ProtectedRoute permission={["manage_users", "manage_permissions", "admin_all"]}>
                  {withSuspense(<AdminUsers />, "Carregando administração...", "skeleton-table")}
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={withSuspense(<NotFound />)} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
