import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { fetchRerunRequests, subscribeToTable, type RerunRequest } from "@/services/qa";

const STATUS_META: Record<string, { label: string; className: string }> = {
  solicitado:      { label: "Solicitado",       className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  processando:     { label: "Processando",      className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  enviado_jenkins: { label: "Enviado ao Jenkins", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  erro:            { label: "Erro",             className: "bg-red-500/15 text-red-500 border-red-500/30" },
};

const TIPO_LABEL: Record<string, string> = {
  rodagem_completa: "Rodagem completa",
  reexecucao: "Reexecução",
};
const MODO_LABEL: Record<string, string> = {
  simplificada: "Simplificada",
  configurada: "Configurada",
  casos_quebrados: "Casos quebrados",
};

export function JenkinsHistory({ title = "Histórico Jenkins", limit = 50 }: { title?: string; limit?: number }) {
  const [history, setHistory] = useState<RerunRequest[]>([]);

  const load = async () => setHistory(await fetchRerunRequests(limit));

  useEffect(() => {
    load();
    const off = subscribeToTable("rerun_requests", () => load());
    const t = setInterval(load, 10000);
    return () => { off(); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
        </Button>
      </div>
      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>VM</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Casos</TableHead>
              <TableHead>Agendado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Jenkins</TableHead>
              <TableHead>Erro</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhuma solicitação ainda.</TableCell></TableRow>
            ) : history.map((r) => {
              const meta = STATUS_META[r.status] || { label: r.status, className: "" };
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-xs">{TIPO_LABEL[r.tipo_solicitacao || ""] || r.tipo_solicitacao || "—"}</TableCell>
                  <TableCell className="text-xs">{MODO_LABEL[r.modo_configuracao || ""] || r.modo_configuracao || "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.vm_name}</TableCell>
                  <TableCell className="text-xs">{r.versao}</TableCell>
                  <TableCell className="text-xs">{r.modulo_nome || r.modulo_codigo || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate" title={r.casos_teste}>{r.casos_teste}</TableCell>
                  <TableCell className="text-xs font-mono">{r.data_hora || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {r.jenkins_queue_url ? (
                      <a href={r.jenkins_queue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Queue <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : r.jenkins_build_number ? `#${r.jenkins_build_number}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-red-400 max-w-[180px] truncate" title={r.erro || ""}>{r.erro || "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(r.config_json, null, 2));
                      toast.success("CONFIG_JSON copiado");
                    }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
