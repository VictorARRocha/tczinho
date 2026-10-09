import { Outlet, Link, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, ShieldCheck } from "lucide-react";
import { useModules } from "@/services/queries";

/** Nome da pagina atual, mostrado no topo (no celular a barra lateral fica escondida). */
function usePageTitle(pathname: string): string {
  const { data: modulos = [] } = useModules();
  if (pathname === "/") return "Visão geral";
  const modulo = pathname.match(/^\/modulo\/([^/]+)/);
  if (modulo) return modulos.find((m) => m.slug === modulo[1])?.nome ?? "Módulo";
  if (pathname === "/jenkins/rodagem-completa") return "Rodagem completa";
  if (pathname === "/jenkins/reexecutar") return "Reexecutar rodagens";
  if (pathname.startsWith("/jenkins")) return "Jenkins";
  if (pathname.startsWith("/regravar")) return "Regravar arquivos";
  if (pathname.startsWith("/merge")) return "Merge de branches";
  if (pathname.startsWith("/admin")) return "Usuários";
  return "";
}

export function AppLayout() {
  const { profile, isAdmin, signOut } = useAuth();
  const { pathname } = useLocation();
  const pageTitle = usePageTitle(pathname);
  return (
    <SidebarProvider>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl">
            <SidebarTrigger className="h-9 w-9" />
            {pageTitle && (
              <span className="min-w-0 truncate text-sm font-semibold md:hidden">{pageTitle}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              {profile && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2" aria-label={`Conta: ${profile.username}`}>
                      <UserIcon className="h-3.5 w-3.5" />
                      <span className="max-w-[9rem] truncate text-xs max-sm:hidden">{profile.username}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="text-xs font-normal text-muted-foreground">Conectado como</div>
                      <div className="text-sm font-medium">{profile.username}</div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin/usuarios"><ShieldCheck className="h-4 w-4 mr-2" />Gerenciar usuários</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => signOut()}>
                      <LogOut className="h-4 w-4 mr-2" /> Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>
          <main id="conteudo" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
            {/* Navegar limpa um erro anterior sem remontar a pagina atual. */}
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
