import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, PlayCircle, RefreshCcw, Upload, ShieldCheck, GitMerge, ListChecks } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { IconeModulo, ImagemMascara } from "@/components/IconeModulo";
import { gruposDeSistema } from "@/lib/permissoes";

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
  const textoApi = health.data === undefined ? "Verificando API..." : health.data ? "Conectado à API" : "API indisponível";


  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-2">
        <NavLink to="/" className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          {/* Recolhido, a faixa tem 48px: a logo diminui para caber em vez de ser cortada. */}
          <ImagemMascara
            src="/marca/sci.png"
            rotulo="SCI Sistemas"
            className="h-9 w-9 text-sky-700 dark:text-sky-300 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
          />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-bold tracking-tight">AgenteTC</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Principal">
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Visão geral" isActive={pathname === "/"}>
                  <NavLink to="/">
                    <LayoutDashboard />
                    <span>Visão geral</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Casos de teste" isActive={pathname.startsWith("/casos-de-teste")}>
                  <NavLink to="/casos-de-teste">
                    <ListChecks />
                    <span>Casos de teste</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Jenkins" isActive={pathname === "/jenkins"}>
                  <NavLink to="/jenkins">
                    {/* Colorido fixo (disco branco, desenho escuro): o mesmo nos temas claro e escuro. */}
                    <img src="/marca/jenkins.png" alt="" aria-hidden className="h-4 w-4 shrink-0" />
                    <span>Jenkins</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {pathname.startsWith("/jenkins") && !collapsed && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Rodagem completa" isActive={pathname === "/jenkins/rodagem-completa"} className="pl-8">
                      <NavLink to="/jenkins/rodagem-completa">
                        <PlayCircle />
                        <span>Rodagem completa</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Reexecutar rodagens" isActive={pathname === "/jenkins/reexecutar"} className="pl-8">
                      <NavLink to="/jenkins/reexecutar">
                        <RefreshCcw />
                        <span>Reexecutar rodagens</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Regravar arquivos" isActive={pathname === "/regravar"}>
                  <NavLink to="/regravar">
                    <Upload />
                    <span>Regravar arquivos</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Merge de branches" isActive={pathname === "/merge"}>
                  <NavLink to="/merge">
                    <GitMerge />
                    <span>Merge de branches</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Admin" isActive={pathname.startsWith("/admin")}>
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

        {gruposDeSistema(visibleModulos).map((grupo) => (
          <SidebarGroup key={grupo.titulo}>
            <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.modulos.map((m) => {
                  const url = `/modulo/${m.slug}`;
                  return (
                    <SidebarMenuItem key={m.id}>
                      <SidebarMenuButton asChild tooltip={m.nome} isActive={pathname.startsWith(url)}>
                        <NavLink to={url}>
                          <IconeModulo slug={m.slug} className="h-4 w-4" />
                          <span>{m.nome}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>


      <SidebarFooter className="border-t border-sidebar-border px-4 py-3 group-data-[collapsible=icon]:px-2">
        {/* Recolhido, fica so o ponto (com o texto para o leitor de tela e ao passar o mouse). */}
        <div
          className="flex items-center gap-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:justify-center"
          title={collapsed ? textoApi : undefined}
        >
          <ApiStatusDot online={health.data} />
          <span className={collapsed ? "sr-only" : undefined}>{textoApi}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
