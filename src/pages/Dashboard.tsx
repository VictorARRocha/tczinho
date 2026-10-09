import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { Modulo, Rodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Database, RefreshCw } from "lucide-react";
import { formatDateTimeLong, formatRelative, resultadoRodagem } from "@/lib/format";
import { formatarVersao, formatarVm } from "@/lib/rodagemTexto";
import { extractVmName } from "@/services/data";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestRuns } from "@/services/queries";
import { useAuth } from "@/contexts/AuthContext";
import { SEM_NENHUM_MODULO } from "@/lib/permissoes";

export default function Dashboard() {
  // Uma chamada (/modules/latest-runs) traz a ultima rodagem de cada modulo, a cada minuto.
  const { data = [], isLoading, isError, error, refetch, isFetching } = useLatestRuns();
  const { profile, isAdmin } = useAuth();
  // A API so entrega os modulos da pessoa; sem nenhum, a tela explica em vez de parecer vazia.
  const semModulos = !isAdmin && Array.isArray(profile?.modules) && profile.modules.length === 0;
  const lastSeenRef = useRef<Map<string, string | null> | null>(null);

  // Avisa quando a ultima rodagem de um modulo muda entre uma atualizacao e outra.
  useEffect(() => {
    if (isLoading || isError) return;
    const current = new Map(data.map(({ modulo, rodagem }) => [modulo.slug, rodagem?.id ?? null]));
    const previous = lastSeenRef.current;
    if (previous) {
      data.forEach(({ modulo, rodagem }) => {
        if (rodagem && previous.get(modulo.slug) !== rodagem.id) {
          toast.success(`Nova rodagem recebida — ${modulo.nome}`);
        }
      });
    }
    lastSeenRef.current = current;
  }, [data, isLoading, isError]);

  const loading = isLoading;

  const comDados = data.filter((d) => d.rodagem);
  const semDados = data.filter((d) => !d.rodagem);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">AgenteTC</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Resultado da última rodagem de testes automáticos do Único em cada módulo. Abra um módulo para ver o que falhou e por quê.
        </p>
      </div>

      <div className="mb-3">
        <h2 className="text-base font-semibold">Módulos</h2>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : isError && data.length === 0 ? (
        <Card className="glass-card p-12 text-center">
          <h3 className="text-lg font-semibold">Não foi possível carregar os módulos</h3>
          <p className="mt-2 text-sm text-muted-foreground">{(error as Error)?.message || "O sistema não respondeu. Tente de novo em alguns instantes."}</p>
          <Button className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Tentar novamente
          </Button>
        </Card>
      ) : data.length === 0 ? (
        <EmptyState semModulos={semModulos} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {comDados.map(({ modulo, rodagem }) => <ModuleCard key={modulo.id} modulo={modulo} rodagem={rodagem!} />)}
          </div>
          {semDados.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Ainda sem rodagem:</span>
              {semDados.map(({ modulo }) => (
                <Link
                  key={modulo.id}
                  to={`/modulo/${modulo.slug}`}
                  className="rounded-md border border-border px-2.5 py-1 text-foreground/90 transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {modulo.nome}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModuleCard({ modulo, rodagem }: { modulo: Modulo; rodagem: Rodagem }) {
  const resultado = resultadoRodagem(rodagem);
  const vm = formatarVm(rodagem.maquina || extractVmName(rodagem.id) || extractVmName(rodagem.pasta_origem));
  const versao = formatarVersao(rodagem.versao_sistema);
  const extras = [
    { label: "funcional", value: rodagem.total_possivel_funcional, tone: "text-functional" },
    { label: "automação", value: rodagem.total_automacao, tone: "text-automation" },
    { label: "massa/dados", value: rodagem.total_massa_dados, tone: "text-data-mass" },
    { label: "inconclusivo", value: rodagem.total_inconclusivo, tone: "text-inconclusive" },
  ].filter((s) => (s.value ?? 0) > 0);
  const falhas = rodagem.total_falhas ?? 0;
  const semTotal = rodagem.total_falhas == null; // sem o total, nao mostrar "0 falhas" em verde

  return (
    <Link
      to={`/modulo/${modulo.slug}`}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full p-4 sm:p-5 transition-smooth group-hover:border-primary/40 group-hover:bg-card/80">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight">{modulo.nome}</h3>
          <time
            dateTime={rodagem.data_analise ?? undefined}
            title={formatDateTimeLong(rodagem.data_analise)}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatRelative(rodagem.data_analise)}
          </time>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className={`text-3xl font-bold font-mono ${semTotal ? "text-muted-foreground" : falhas > 0 ? "text-destructive" : "text-success"}`}>{semTotal ? "—" : falhas}</span>
          <span className="text-sm text-muted-foreground">
            {falhas === 1 ? "falha" : "falhas"}
            {resultado && <> de {resultado.rodados.toLocaleString("pt-BR")} casos</>}
          </span>
        </div>

        {extras.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {extras.map((e, i) => (
              <span key={e.label}>{i > 0 && " · "}<span className={`font-mono ${e.tone}`}>{e.value}</span> {e.label}</span>
            ))}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{[versao, vm].filter(Boolean).join(" · ") || "—"}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Abrir <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function EmptyState({ semModulos }: { semModulos: boolean }) {
  return (
    <Card className="glass-card p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Database className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{semModulos ? "Nenhum módulo liberado" : "Nenhum resultado de teste ainda"}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        {semModulos ? SEM_NENHUM_MODULO : "Os módulos aparecem aqui assim que a primeira rodagem de testes terminar."}
      </p>
    </Card>
  );
}
