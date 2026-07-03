import { NavLink, useLocation } from "react-router-dom";
import {
  Activity, LayoutDashboard, History, Sparkles, PlayCircle, Server, RefreshCcw,
  Users, Clock, Receipt, BookOpen, Building2, Calculator, Wallet, CheckSquare,
  PiggyBank, FileText, Bell, Landmark, Timer, BarChart3, Send, Package, Database,
  type LucideIcon,
} from "lucide-react";

function getModuleIcon(nome: string): LucideIcon {
  const n = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("folha")) return Users;
  if (n.includes("ponto")) return Clock;
  if (n.includes("fiscal")) return Receipt;
  if (n.includes("contabil")) return BookOpen;
  if (n.includes("patrimonio")) return Building2;
  if (n.includes("lalur")) return Calculator;
  if (n.includes("financeiro")) return Wallet;
  if (n.includes("tarefa") || n.includes("gestao")) return CheckSquare;
  if (n.includes("orcamento")) return PiggyBank;
  if (n.includes("protocolo")) return FileText;
  if (n.includes("notificac")) return Bell;
  if (n.includes("imposto")) return Landmark;
  if (n.includes("temporizador")) return Timer;
  if (n.includes("bi") || n.includes("geral")) return BarChart3;
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

  useEffect(() => {
    fetchModules().then(setModulos).catch(() => {});
  }, []);

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
                    <Server />
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-glow rounded-full bg-success" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Conectado ao Supabase
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
