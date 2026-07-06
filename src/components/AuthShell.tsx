import { ReactNode } from "react";
import { Sparkles, ShieldCheck, Activity, Zap } from "lucide-react";

interface Props {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ eyebrow, title, subtitle, children, footer }: Props) {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Painel de marca */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border/60 p-12">
          {/* fundo gradiente + halos */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-surface opacity-90" />
          <div className="pointer-events-none absolute -top-40 -left-32 h-[420px] w-[420px] rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-160px] right-[-120px] h-[460px] w-[460px] rounded-full bg-accent/20 blur-3xl" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.6) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse at 30% 40%, black 20%, transparent 70%)",
            }}
          />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary glow-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-tight">TC SCI</div>
              <div className="text-[11px] font-mono text-muted-foreground">testcomplete / sistema-unico</div>
            </div>
          </div>

          <div className="relative max-w-md space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Plataforma de QA · Realtime ativo
            </div>
            <h2 className="font-display text-4xl font-bold leading-[1.05] tracking-tight">
              Rodagens, falhas e evidências,{" "}
              <span className="bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
                num só lugar.
              </span>
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Acompanhe execuções do Jenkins, agrupamentos de falhas e evidências
              analisadas com o Agent TC — direto do seu navegador.
            </p>

            <ul className="grid gap-3 pt-2">
              {[
                { Icon: Activity, t: "Dashboards em tempo real", d: "Métricas de saúde por módulo e rodagem." },
                { Icon: Zap, t: "Reexecução guiada", d: "Refaça rodagens completas ou apenas os casos que falharam." },
                { Icon: ShieldCheck, t: "Acesso controlado", d: "Aprovação de cadastros e permissões por funcionalidade." },
              ].map(({ Icon, t, d }) => (
                <li key={t} className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 px-3.5 py-3 backdrop-blur">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="leading-snug">
                    <div className="text-sm font-medium">{t}</div>
                    <div className="text-xs text-muted-foreground">{d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative text-[11px] text-muted-foreground font-mono">
            © {new Date().getFullYear()} TC SCI · uso interno
          </div>
        </aside>

        {/* Coluna do formulário */}
        <main className="relative flex items-center justify-center px-6 py-12 lg:px-16">
          <div className="pointer-events-none absolute inset-0 lg:hidden">
            <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
          </div>

          <div className="relative w-full max-w-md">
            {/* Logo mobile */}
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary glow-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="font-display text-lg font-bold">TC SCI</div>
            </div>

            <div className="mb-8">
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-primary/80">
                {eyebrow}
              </div>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {children}

            {footer && (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
