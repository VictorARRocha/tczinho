// Aba Historico: rodagens anteriores do modulo.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import { useState } from "react";
import { extractVmName } from "@/services/data";
import type { Rodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { formatarVersao, formatarVm } from "@/lib/rodagemTexto";
import { useIsMobile } from "@/hooks/use-mobile";
import { Empty, Paginacao } from "./common";

export function HistoricoTab({ runs, currentId, onPick }: { runs: Rodagem[]; currentId?: string; onPick: (id: string) => void }) {
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();
  if (runs.length === 0) return <Empty text="Sem histórico." />;
  const totalPages = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRuns = runs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const vmDe = (r: Rodagem) => formatarVm(r.maquina || extractVmName(r.id) || extractVmName(r.pasta_origem)) || "—";
  return (
    <div className="space-y-3">
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
                      {" · "}{r.total_falhas} {r.total_falhas === 1 ? "falha" : "falhas"}
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
                  <TableCell className="py-2 text-right font-mono text-sm">{r.total_falhas}</TableCell>
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
      <Paginacao page={currentPage} pageSize={PAGE_SIZE} total={runs.length} onChange={setPage} />
    </div>
  );
}
