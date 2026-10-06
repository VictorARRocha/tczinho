// Aba Historico: rodagens anteriores do modulo.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { useState } from "react";
import { extractVmName } from "@/services/data";
import type { Rodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { Empty } from "./common";

export function HistoricoTab({ runs, currentId, onPick }: { runs: Rodagem[]; currentId?: string; onPick: (id: string) => void }) {
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();
  if (runs.length === 0) return <Empty text="Sem histórico." />;
  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRuns = runs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div className="space-y-3">
      <Card className="glass-card overflow-hidden">
        {isMobile ? (
          <ul className="divide-y divide-border/60">
            {pageRuns.map((r) => {
              const active = r.id === currentId;
              return (
                <li key={r.id} className={`flex items-center gap-3 p-3 ${active ? "bg-primary/5" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{formatDateTime(r.data_analise)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{r.maquina || extractVmName(r.id) || extractVmName(r.pasta_origem) || "—"}</span>
                      {" · "}<span className="font-mono">{r.versao_sistema || "—"}</span>
                      {" · "}{r.total_falhas} falha(s)
                    </div>
                  </div>
                  {active
                    ? <Button size="sm" variant="ghost" disabled>Atual</Button>
                    : <Button size="sm" variant="outline" onClick={() => onPick(r.id)}>Abrir</Button>}
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
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRuns.map((r) => {
              const active = r.id === currentId;
              return (
                <TableRow key={r.id} className={`border-border ${active ? "bg-primary/5" : ""}`}>
                  <TableCell className="text-xs">{formatDateTime(r.data_analise)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.maquina || extractVmName(r.id) || extractVmName(r.pasta_origem) || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.versao_sistema || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.total_falhas}</TableCell>
                  <TableCell>
                    {active
                      ? <Button size="sm" variant="ghost" disabled>Atual</Button>
                      : <Button size="sm" variant="outline" onClick={() => onPick(r.id)}>Abrir</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </Card>
      {totalPages > 1 && (
        <div className="flex items-center justify-between max-sm:flex-wrap max-sm:gap-2">
          <div className="text-xs text-muted-foreground">
            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, runs.length)} de {runs.length}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
            <span className="text-xs font-mono text-muted-foreground">{currentPage} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
