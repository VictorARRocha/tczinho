// Aba Historico: rodagens anteriores do modulo, com filtro por versao e por VM.
import { useState } from "react";
import { extractVmName } from "@/services/data";
import type { Rodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { formatarVersao, formatarVm, ordenarVersoes } from "@/lib/rodagemTexto";
import { useIsMobile } from "@/hooks/use-mobile";
import { AlertTriangle, GitBranch, Monitor } from "lucide-react";
import { Empty, Paginacao } from "./common";

// O Select nao aceita valor vazio: "todas" e o "sem filtro".
const TODAS = "__todas__";

export function HistoricoTab({ runs, currentId, onPick }: { runs: Rodagem[]; currentId?: string; onPick: (id: string) => void }) {
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [fVersao, setFVersao] = useState(TODAS);
  const [fVm, setFVm] = useState(TODAS);
  const isMobile = useIsMobile();
  if (runs.length === 0) return <Empty text="Sem histórico." />;
  const vmDe = (r: Rodagem) => formatarVm(r.maquina || extractVmName(r.id) || extractVmName(r.pasta_origem)) || "—";
  const versaoDe = (r: Rodagem) => (r.versao_sistema || "").trim();
  const versoes = ordenarVersoes(Array.from(new Set(runs.map(versaoDe).filter(Boolean))));
  const vms = Array.from(new Set(runs.map(vmDe).filter((v) => v !== "—"))).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const filtradas = runs.filter((r) => (fVersao === TODAS || versaoDe(r) === fVersao) && (fVm === TODAS || vmDe(r) === fVm));
  // Trocar o filtro volta para a primeira pagina.
  const filtrar = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRuns = filtradas.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // Selo de rodagem cuja importacao teve problemas (os totais podem estar incompletos).
  const selo = (r: Rodagem) => {
    const n = r.erros_processamento?.length || 0;
    if (!n) return null;
    const texto = n === 1 ? "1 problema na importação" : `${n} problemas na importação`;
    return (
      <span title={texto} className="mx-1.5 inline-flex items-center gap-1 align-middle text-xs text-warning">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">{texto}</span>
      </span>
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={fVersao} onValueChange={filtrar(setFVersao)}>
          <SelectTrigger className="h-11 w-full text-sm sm:w-[200px] md:h-9" aria-label="Filtrar por versão">
            <GitBranch className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as versões</SelectItem>
            {versoes.map((v) => <SelectItem key={v} value={v}>{formatarVersao(v) || v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fVm} onValueChange={filtrar(setFVm)}>
          <SelectTrigger className="h-11 w-full text-sm sm:w-[180px] md:h-9" aria-label="Filtrar por VM">
            <Monitor className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as VMs</SelectItem>
            {vms.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {(fVersao !== TODAS || fVm !== TODAS) && (
          <Button variant="ghost" size="sm" className="h-11 md:h-9" onClick={() => { setFVersao(TODAS); setFVm(TODAS); setPage(1); }}>
            Limpar filtros
          </Button>
        )}
      </div>
      {filtradas.length === 0 ? <Empty text="Nenhuma rodagem com esses filtros." /> : (
      <Card className="overflow-hidden">
        {isMobile ? (
          <ul className="divide-y divide-border/60">
            {pageRuns.map((r) => {
              const active = r.id === currentId;
              return (
                <li key={r.id} className={`flex items-center gap-3 p-3 ${active ? "bg-primary/5" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{formatDateTime(r.data_analise)}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{vmDe(r)}</span>
                      {" · "}<span>{formatarVersao(r.versao_sistema) || "—"}</span>
                      {" · "}{r.total_falhas} {r.total_falhas === 1 ? "falha" : "falhas"}{selo(r)}
                    </div>
                  </div>
                  {active
                    ? <span className="px-3 text-xs text-muted-foreground">Aberta</span>
                    : <Button size="sm" variant="outline" className="h-11" onClick={() => onPick(r.id)}>Abrir</Button>}
                </li>
              );
            })}
          </ul>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Data</TableHead>
              <TableHead>VM</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead className="text-right">Falhas</TableHead>
              <TableHead className="w-24"><span className="sr-only">Ações</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRuns.map((r) => {
              const active = r.id === currentId;
              return (
                <TableRow
                  key={r.id}
                  className={`border-border ${active ? "bg-primary/5" : "cursor-pointer"}`}
                  onClick={() => !active && onPick(r.id)}
                >
                  <TableCell className="py-2 text-sm">{formatDateTime(r.data_analise)}</TableCell>
                  <TableCell className="py-2 font-mono text-xs">{vmDe(r)}</TableCell>
                  <TableCell className="py-2 text-sm">{formatarVersao(r.versao_sistema) || "—"}</TableCell>
                  <TableCell className="py-2 text-right font-mono text-sm">{selo(r)}{r.total_falhas}</TableCell>
                  <TableCell className="py-2 text-right">
                    {active
                      ? <span className="px-3 text-xs text-muted-foreground">Aberta</span>
                      : <Button size="sm" variant="outline" className="h-8" onClick={(e) => { e.stopPropagation(); onPick(r.id); }}>Abrir</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </Card>
      )}
      <Paginacao page={currentPage} pageSize={PAGE_SIZE} total={filtradas.length} onChange={setPage} />
    </div>
  );
}
