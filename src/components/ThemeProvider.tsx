import { createContext, useContext, useEffect, useRef, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "tc-sci-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Sem armazenamento: fica no padrao.
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const primeiraVez = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    // Na troca de tema, cada elemento animava a cor no seu ritmo e a tela "escorria".
    // Desliga as transicoes por um quadro (menos o icone do botao de tema).
    let semTransicao: HTMLStyleElement | null = null;
    if (!primeiraVez.current) {
      semTransicao = document.createElement("style");
      semTransicao.textContent = "*:not([data-icone-tema]){transition:none!important}";
      document.head.appendChild(semTransicao);
    }
    primeiraVez.current = false;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sem armazenamento (janela privada): o tema vale ate recarregar.
    }
    if (semTransicao) {
      const estilo = semTransicao;
      // Le o estilo calculado para o navegador aplicar o tema novo antes de religar as transicoes.
      void window.getComputedStyle(root).opacity;
      requestAnimationFrame(() => estilo.remove());
    }
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
