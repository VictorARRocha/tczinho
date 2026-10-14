import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, PlayCircle, RefreshCcw, Upload, ShieldCheck, GitMerge, ListChecks } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { IconeModulo, ImagemMascara } from "@/components/IconeModulo";

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
          <ImagemMascara src="/marca/sci.png" rotulo="SCI Sistemas" className="h-9 w-9 text-primary" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-bold tracking-tight">AgenteTC</span>
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
                <SidebarMenuButton asChild isActive={pathname.startsWith("/casos-de-teste")}>
                  <NavLink to="/casos-de-teste">
                    <ListChecks />
                    <span>Casos de teste</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/jenkins"}>
                  <NavLink to="/jenkins">
                    <ImagemMascara src="/marca/jenkins.png" className="h-4 w-4" />
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
                </>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/regravar"}>
                  <NavLink to="/regravar">
                    <Upload />
                    <span>Regravar arquivos</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

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
                  return (
                    <SidebarMenuItem key={m.id}>
                      <SidebarMenuButton asChild isActive={pathname.startsWith(url)}>
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
