import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import ModulePage from "./pages/ModulePage";
import ImportPage from "./pages/ImportPage";
import ReexecutarTestes from "./pages/ReexecutarTestes";
import JenkinsHome from "./pages/JenkinsHome";
import JenkinsRodagemCompleta from "./pages/JenkinsRodagemCompleta";
import NotFound from "./pages/NotFound";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/modulo/:slug" element={<ModulePage />} />
            <Route path="/importar" element={<ImportPage />} />
            <Route path="/jenkins" element={<JenkinsHome />} />
            <Route path="/jenkins/rodagem-completa" element={<JenkinsRodagemCompleta />} />
            <Route path="/jenkins/reexecutar" element={<ReexecutarTestes />} />
            <Route path="/reexecutar" element={<Navigate to="/jenkins/reexecutar" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
