import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl">
            <SidebarTrigger />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">testcomplete</span>
              <span>/</span>
              <span className="font-mono">sistema-unico</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Realtime ativo
              </div>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
