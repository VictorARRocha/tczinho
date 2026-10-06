import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity, LayoutDashboard, History, Sparkles, PlayCircle, Server, RefreshCcw, Upload,
  Users, Clock, Receipt, BookOpen, Building2, Calculator, Wallet, CheckSquare,
  PiggyBank, FileText, Bell, Landmark, Timer, BarChart3, Send, Package, Database, Scale, HandCoins, NotebookText, PersonStanding, ShieldCheck, GitMerge,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function getModuleIcon(nome: string): LucideIcon {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("practice")) return NotebookText;
  if (n.includes("suprema")) return PiggyBank;
  if (n.includes("folha")) return Users;
  if (n.includes("ponto")) return Clock;
  if (n.includes("fiscal")) return HandCoins;
  if (n.includes("contabil")) return Scale;
  if (n.includes("patrimonio")) return Building2;
  if (n.includes("lalur")) return Calculator;
  if (n.includes("financeiro")) return Wallet;
  if (n.includes("tarefa") || n.includes("gestao")) return CheckSquare;
  if (n.includes("orcamento")) return PiggyBank;
  if (n.includes("protocolo")) return FileText;
  if (n.includes("notificac")) return Bell;
  if (n.includes("imposto")) return Landmark;
  if (n.includes("temporizador")) return Timer;
  if (n.includes("geral")) return Database;
  if (n.includes("bi")) return BarChart3;
  if (n.includes("push")) return Send;
  return Package;
}
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useApiHealth, useModules } from "@/services/queries";
import { ApiStatusDot } from "./ApiStatus";

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  // No celular o menu cobre a tela: fecha ao trocar de pagina.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  const { data: modulos = [] } = useModules();
  const health = useApiHealth();
  const { isAdmin } = useAuth();

  const visibleModulos = modulos;


  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary glow-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-bold tracking-tight">TC SCI</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <NavLink to="/">
                    <LayoutDashboard />
                    <span>Visão geral</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/jenkins"}>
                  <NavLink to="/jenkins">
                    <PersonStanding />
                    <span>Jenkins</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {pathname.startsWith("/jenkins") && !collapsed && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/jenkins/rodagem-completa"} className="pl-8">
                      <NavLink to="/jenkins/rodagem-completa">
                        <PlayCircle />
                        <span>Rodagem completa</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/jenkins/reexecutar"} className="pl-8">
                      <NavLink to="/jenkins/reexecutar">
                        <RefreshCcw />
                        <span>Reexecutar rodagens</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/jenkins/regravar"} className="pl-8">
                      <NavLink to="/jenkins/regravar">
                        <Upload />
                        <span>Regravar arquivos</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/merge"}>
                  <NavLink to="/merge">
                    <GitMerge />
                    <span>Merge de branches</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")}>
                    <NavLink to="/admin/usuarios">
                      <ShieldCheck />
                      <span>Admin</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleModulos.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Módulos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleModulos.map((m) => {
                  const url = `/modulo/${m.slug}`;
                  const Icon = getModuleIcon(m.nome);
                  return (
                    <SidebarMenuItem key={m.id}>
                      <SidebarMenuButton asChild isActive={pathname.startsWith(url)}>
                        <NavLink to={url}>
                          <Icon />
                          <span>{m.nome}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>


      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ApiStatusDot online={health.data} />
            {health.data === undefined ? "Verificando API..." : health.data ? "Conectado à API" : "API indisponível"}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
