import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className="h-11 w-11 rounded-full border border-border/60 bg-card/60 hover:bg-accent md:h-9 md:w-9"
    >
      {/* Troca com opacidade e escala a partir de 50% (nada surge do zero). */}
      <Sun data-icone-tema className="h-4 w-4 rotate-0 scale-100 opacity-100 transition-[transform,opacity] duration-200 ease-out-strong dark:-rotate-90 dark:scale-50 dark:opacity-0" />
      <Moon data-icone-tema className="absolute h-4 w-4 rotate-90 scale-50 opacity-0 transition-[transform,opacity] duration-200 ease-out-strong dark:rotate-0 dark:scale-100 dark:opacity-100" />
    </Button>
  );
}
