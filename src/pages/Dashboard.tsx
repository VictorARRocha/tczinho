import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchModules, fetchLatestRunByModule, subscribeToTable } from "@/services/data";
import type { Modulo, Rodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { ArrowUpRight, AlertTriangle, ShieldAlert, Database, Bot, HelpCircle } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";

interface ModuleData {
  modulo: Modulo;
  rodagem: Rodagem | null;
}

export default function Dashboard() {
  const [data, setData] = useState<ModuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const { canAccessModule } = useAuth();

  const load = async () => {
    try {
      const modulos = await fetchModules();
      const visible = modulos.filter((m) => canAccessModule(m.slug));
      const results = await Promise.all(
        visible.map(async (m) => ({ modulo: m, rodagem: await fetchLatestRunByModule(m.slug).catch(() => null) })),
      );
      setData(results);
    } catch (e: any) {
      toast.error("Erro ao conectar Supabase", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const { modules, permissions } = useAuth();
  useEffect(() => {
    load();
    const off = subscribeToTable("rodagens", (p) => {
      if (p.eventType === "INSERT") {
        const slug = p.new?.modulo_slug;
        toast.success(`Nova rodagem recebida${slug ? ` — ${slug}` : ""}`);
      }
      load();
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, permissions]);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-8 sm:mb-10">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
          <span className="gradient-text">TC SCI</span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
          Monitoramento inteligente de rodagens automatizadas do TestComplete. Acompanhe falhas, evidências e prioridades em tempo real.
        </p>
      </div>

      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base sm:text-lg font-semibold">Módulos</h2>
        <span className="text-[11px] sm:text-xs text-muted-foreground">{data.length} módulos · atualização automática</span>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.map(({ modulo, rodagem }) => <ModuleCard key={modulo.id} modulo={modulo} rodagem={rodagem} />)}
        </div>
      )}
    </div>

  );
}

function ModuleCard({ modulo, rodagem }: { modulo: Modulo; rodagem: Rodagem | null }) {
  const hasData = !!rodagem;

  const stats = hasData ? [
    { icon: AlertTriangle, label: "Falhas", value: rodagem!.total_falhas, tone: "text-foreground", force: true },
    { icon: ShieldAlert, label: "Funcional", value: rodagem!.total_possivel_funcional, tone: "text-functional" },
    { icon: Bot, label: "Automação", value: rodagem!.total_automacao, tone: "text-automation" },
    { icon: Database, label: "Massa/Dados", value: rodagem!.total_massa_dados, tone: "text-data-mass" },
    { icon: HelpCircle, label: "Inconclusivo", value: rodagem!.total_inconclusivo, tone: "text-inconclusive" },
  ].filter((s) => s.force || (s.value ?? 0) > 0) : [];

  return (
    <Link to={`/modulo/${modulo.slug}`} className="group">
      <Card className={`relative overflow-hidden p-5 sm:p-6 glass-card transition-smooth hover:-translate-y-0.5 hover:border-primary/40 ${!hasData ? "opacity-80" : ""}`}>

        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold tracking-tight">{modulo.nome}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasData ? formatRelative(rodagem!.data_analise) : "Sem dados"}
            </p>
          </div>
        </div>

        {hasData ? (
          <>
            {rodagem!.score_saude != null && (
              <div className="mb-5 flex items-baseline gap-2">
                <span className="text-4xl font-bold gradient-text">{rodagem!.score_saude}</span>
                <span className="text-xs text-muted-foreground">score de saúde</span>
              </div>
            )}

            <div className={`grid gap-2.5 mb-4 ${stats.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
              {stats.map((s) => <Stat key={s.label} icon={s.icon} label={s.label} value={s.value} tone={s.tone} />)}
            </div>

            {rodagem!.diagnostico_curto && (
              <p className="text-sm text-muted-foreground line-clamp-2 border-t border-border/60 pt-3">
                {rodagem!.diagnostico_curto}
              </p>
            )}
          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Aguardando primeira rodagem.</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Abrir módulo <ArrowUpRight className="ml-1 h-3 w-3" />
        </div>
      </Card>
    </Link>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-secondary/40 px-2.5 py-2">
      <Icon className={`h-3.5 w-3.5 ${tone}`} />
      <div className="flex flex-col leading-tight">
        <span className={`text-sm font-semibold font-mono ${tone}`}>{value ?? 0}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="glass-card p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Database className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">Sem dados reais ainda</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Nenhum módulo encontrado. Execute as migrations no Supabase do projeto TC Agente SCI para começar.
      </p>
    </Card>
  );
}
