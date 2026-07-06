import { NavLink, useLocation } from "react-router-dom";
import {
  Activity, LayoutDashboard, History, Sparkles, PlayCircle, Server, RefreshCcw,
  Users, Clock, Receipt, BookOpen, Building2, Calculator, Wallet, CheckSquare,
  PiggyBank, FileText, Bell, Landmark, Timer, BarChart3, Send, Package, Database, Scale, HandCoins, NotebookText, PersonStanding,
  ShieldCheck, LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

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
import { useEffect, useState } from "react";
import { fetchModules } from "@/services/qa";
import type { Modulo } from "@/types/db";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const { profile, isAdmin, hasPermission, signOut } = useAuth();

  useEffect(() => {
    fetchModules().then(setModulos).catch(() => {});
  }, []);

  const canDashboard = hasPermission("view_dashboard");
  const canJenkins = hasPermission("view_jenkins");
  const canCreateRun = hasPermission("create_jenkins_run");
  const canRerun = hasPermission("create_rerun");
  const canAdmin = isAdmin || hasPermission("manage_users") || hasPermission("manage_permissions") || hasPermission("admin_all");

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
              {canDashboard && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/"}>
                    <NavLink to="/">
                      <LayoutDashboard />
                      <span>Visão geral</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {canJenkins && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/jenkins"}>
                    <NavLink to="/jenkins">
                      <PersonStanding />
                      <span>Jenkins</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {canJenkins && pathname.startsWith("/jenkins") && !collapsed && (
                <>
                  {canCreateRun && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname === "/jenkins/rodagem-completa"} className="pl-8">
                        <NavLink to="/jenkins/rodagem-completa">
                          <PlayCircle />
                          <span>Rodagem completa</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {canRerun && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname === "/jenkins/reexecutar"} className="pl-8">
                        <NavLink to="/jenkins/reexecutar">
                          <RefreshCcw />
                          <span>Reexecutar rodagens</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/admin/usuarios")}>
                    <NavLink to="/admin/usuarios">
                      <ShieldCheck />
                      <span>Usuários</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {modulos.map((m) => {
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3 gap-2">
        {!collapsed && profile && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold shrink-0">
              {profile.full_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-xs font-medium truncate">{profile.full_name}</div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                @{profile.username} · {profile.role}
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={signOut} title="Sair">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {collapsed && profile && (
          <Button size="icon" variant="ghost" onClick={signOut} title="Sair" className="mx-auto">
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
