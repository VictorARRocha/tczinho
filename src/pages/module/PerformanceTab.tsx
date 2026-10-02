// Aba Performance: tempos dos casos comparados com a planilha de referencia.
// Extraido de pages/ModulePage.tsx sem alteracao de comportamento.
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { AtrasoRodagem } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronsUpDown, Gauge, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { useDebounce } from "@/hooks/useDebounce";

// ============= Performance helpers =============
export function formatDuration(seconds: number): string {
  const neg = seconds < 0;
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const out = h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  return neg ? `-${out}` : out;
}

function PerfBadge({ status }: { status: AtrasoRodagem["status"] }) {
  if (status === "mais_lento") return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 gap-1"><TrendingUp className="h-3 w-3" />Mais lento</Badge>;
  if (status === "mais_rapido") return <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1"><TrendingDown className="h-3 w-3" />Mais rápido</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1"><Minus className="h-3 w-3" />Sem variação</Badge>;
}

export function PerformanceTab({ data }: { data: AtrasoRodagem[] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [caseFilter, setCaseFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  type SortKey = "codigo" | "nome" | "status" | "base" | "atual" | "diff" | "var";
  const [sortKey, setSortKey] = useState<SortKey>("diff");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const debouncedQ = useDebounce(q, 250);

  const groupOf = (codigo?: string | null) => {
    const m = String(codigo || "").match(/^(\d+(?:\.\d+)?)/);
    return m ? m[1] : "";
  };

  const parseTimeToSec = (s?: string | null): number => {
    if (!s) return 0;
    const parts = String(s).trim().split(":").map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "codigo" || k === "nome" ? "asc" : "desc"); }
  };

  const filtered = useMemo(() => {
    let out = [...data];
    if (statusFilter !== "all") out = out.filter((d) => d.status === statusFilter);
    if (groupFilter !== "all") out = out.filter((d) => groupOf(d.codigo_teste) === groupFilter);
    if (caseFilter !== "all") out = out.filter((d) => d.codigo_teste === caseFilter);
    if (debouncedQ) {
      const k = debouncedQ.toLowerCase();
      out = out.filter((d) => `${d.codigo_teste} ${d.nome_teste}`.toLowerCase().includes(k));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const statusRank: Record<string, number> = { mais_lento: 0, igual: 1, mais_rapido: 2 };
    out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "codigo": cmp = (a.codigo_teste || "").localeCompare(b.codigo_teste || "", undefined, { numeric: true }); break;
        case "nome": cmp = (a.nome_teste || "").localeCompare(b.nome_teste || ""); break;
        case "status": cmp = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9); break;
        case "base": cmp = parseTimeToSec(a.tempo_padrao) - parseTimeToSec(b.tempo_padrao); break;
        case "atual": cmp = parseTimeToSec(a.tempo_atual) - parseTimeToSec(b.tempo_atual); break;
        case "diff": cmp = Math.abs(a.delay_segundos) - Math.abs(b.delay_segundos); break;
        case "var": cmp = Math.abs(a.variacao_pct) - Math.abs(b.variacao_pct); break;
      }
      return cmp * dir;
    });
    return out;
  }, [data, debouncedQ, statusFilter, caseFilter, groupFilter, sortKey, sortDir]);

  const stats = useMemo(() => {
    const slow: AtrasoRodagem[] = [];
    const fast: AtrasoRodagem[] = [];
    const equal: AtrasoRodagem[] = [];
    const casesSet = new Set<string>();
    const groupsSet = new Set<string>();
    let totalAdded = 0;
    let totalSaved = 0;
    let maxDelay: AtrasoRodagem | null = null;
    let maxGain: AtrasoRodagem | null = null;
    let hasName = false;
    for (const d of data) {
      if (d.status === "mais_lento") {
        slow.push(d);
        totalAdded += d.delay_segundos;
        if (!maxDelay || d.delay_segundos > maxDelay.delay_segundos) maxDelay = d;
      } else if (d.status === "mais_rapido") {
        fast.push(d);
        totalSaved += Math.abs(d.delay_segundos);
        if (!maxGain || d.delay_segundos < maxGain.delay_segundos) maxGain = d;
      } else if (d.status === "igual") {
        equal.push(d);
      }
      if (d.codigo_teste) casesSet.add(d.codigo_teste);
      const g = groupOf(d.codigo_teste);
      if (g) groupsSet.add(g);
      if (!hasName && d.nome_teste && d.nome_teste.trim()) hasName = true;
    }
    const topSlow = [...slow].sort((a, b) => b.delay_segundos - a.delay_segundos).slice(0, 10);
    const topFast = [...fast].sort((a, b) => a.delay_segundos - b.delay_segundos).slice(0, 10);
    const sortNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    return {
      slow, fast, equal, maxDelay, maxGain, totalAdded, totalSaved,
      topSlow, topFast,
      cases: Array.from(casesSet).sort(sortNum),
      groups: Array.from(groupsSet).sort(sortNum),
      hasName,
    };
  }, [data]);


  const { slow, fast, equal, maxDelay, maxGain, totalAdded, totalSaved, topSlow, topFast, cases, groups, hasName } = stats;

  const cards = useMemo(() => {
    const netDelta = totalAdded - totalSaved; // >0 mais lento no total; <0 mais rápido
    const netTone = netDelta > 0 ? "text-destructive" : netDelta < 0 ? "text-success" : "text-muted-foreground";
    const withSign = (sign: "+" | "-", txt: string) => (
      <><span className="font-sans mr-1">{sign}</span>{txt}</>
    );
    const netValue = netDelta === 0
      ? formatDuration(0)
      : withSign(netDelta > 0 ? "+" : "-", formatDuration(Math.abs(netDelta)));
    return ([
      { label: "Registros", value: data.length, tone: "" },
      { label: "Mais lentos", value: slow.length, tone: "text-destructive" },
      { label: "Mais rápidos", value: fast.length, tone: "text-success" },
      { label: "Maior atraso", value: maxDelay ? withSign("+", formatDuration(maxDelay.delay_segundos)) : "—", tone: "text-destructive" },
      { label: "Maior ganho", value: maxGain ? withSign("-", formatDuration(Math.abs(maxGain.delay_segundos))) : "—", tone: "text-success" },
      { label: "Diferença de tempo total", value: netValue, tone: netTone },


    ] as { label: string; value: ReactNode; tone: string }[]);
  }, [data.length, slow.length, fast.length, maxDelay, maxGain, totalAdded, totalSaved]);


  const distData = useMemo(() => ([
    { name: "Mais lentos", value: slow.length, color: "hsl(var(--destructive))" },
    { name: "Mais rápidos", value: fast.length, color: "hsl(var(--success))" },
    { name: "Sem variação", value: equal.length, color: "hsl(var(--muted-foreground))" },
  ].filter((d) => d.value > 0)), [slow.length, fast.length, equal.length]);

  const topSlowChart = useMemo(
    () => topSlow.map((d) => ({ name: d.codigo_teste || d.id, value: d.delay_segundos, label: formatDuration(d.delay_segundos) })),
    [topSlow],
  );
  const topFastChart = useMemo(
    () => topFast.map((d) => ({ name: d.codigo_teste || d.id, value: Math.abs(d.delay_segundos), label: formatDuration(Math.abs(d.delay_segundos)) })),
    [topFast],
  );

  // O retorno antecipado fica depois de todos os hooks: trocar entre rodagens
  // com e sem performance nao pode mudar a quantidade de hooks chamados.
  if (data.length === 0) {
    return (
      <Card className="glass-card p-12 text-center">
        <Gauge className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-base font-semibold">Nenhum dado de performance encontrado para esta rodagem.</h3>
        <p className="text-sm text-muted-foreground mt-1">Quando o Agent TC enviar dados de performance, eles aparecerão aqui.</p>
      </Card>
    );
  }

  const copyRow = (d: AtrasoRodagem) => {
    const txt = [d.codigo_teste, d.nome_teste, d.tempo_padrao, d.tempo_atual, formatDuration(d.delay_segundos), `${d.variacao_pct.toFixed(1)}%`].filter(Boolean).join(" | ");
    navigator.clipboard.writeText(txt);
    toast.success("Linha copiada");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className={`text-xl font-bold font-mono mt-1 ${c.tone}`}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {topFastChart.length > 0 && (
          <Card className="glass-card p-6 md:col-span-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Top {topFastChart.length} maiores ganhos</h3>
            <ResponsiveContainer width="100%" height={Math.max(220, topFastChart.length * 26)}>
              <BarChart data={topFastChart} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatDuration(Number(v))} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: unknown) => formatDuration(Number(v))} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                <Bar dataKey="value" fill="hsl(var(--success))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>


      {topFast.length > 0 && (
        <Card className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingDown className="h-4 w-4 text-success" />Top ganhos</h3>
          <div className="space-y-2">
            {topFast.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.nome_teste || d.codigo_teste}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{d.codigo_teste} · {d.tempo_padrao} → {d.tempo_atual}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-success">{formatDuration(d.delay_segundos)}</div>
                  <PerfBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}


      <Card className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código ou nome do caso..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: todos</SelectItem>
              <SelectItem value="mais_lento">Mais lento</SelectItem>
              <SelectItem value="mais_rapido">Mais rápido</SelectItem>
              
            </SelectContent>
          </Select>
          {groups.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="h-9 w-[180px] text-xs bg-background"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">Grupo: todos</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>[{g}]</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

      </Card>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <SortableTH label="Código" k="codigo" active={sortKey} dir={sortDir} onClick={toggleSort} />
              {hasName && <SortableTH label="Caso de teste" k="nome" active={sortKey} dir={sortDir} onClick={toggleSort} />}
              <SortableTH label="Status" k="status" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTH label="Tempo base" k="base" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortableTH label="Tempo atual" k="atual" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortableTH label="Diferença" k="diff" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              <SortableTH label="Variação" k="var" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={hasName ? 7 : 6} className="text-center text-sm text-muted-foreground py-12">Nenhum registro corresponde aos filtros.</TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id} className="border-border">
                <TableCell className="font-mono text-xs">{d.codigo_teste || "—"}</TableCell>
                {hasName && <TableCell className="text-sm max-w-[280px] truncate">{d.nome_teste || "—"}</TableCell>}
                <TableCell><PerfBadge status={d.status} /></TableCell>
                <TableCell className="text-right font-mono text-xs">{d.tempo_padrao || "—"}</TableCell>
                <TableCell className="text-right font-mono text-xs">{d.tempo_atual || "—"}</TableCell>
                <TableCell className={`text-right font-mono text-xs ${d.status === "mais_lento" ? "text-destructive" : d.status === "mais_rapido" ? "text-success" : ""}`}>
                  {d.status === "mais_lento" ? "+" : ""}{formatDuration(d.delay_segundos)}
                </TableCell>
                <TableCell className={`text-right font-mono text-xs ${d.status === "mais_lento" ? "text-destructive" : d.status === "mais_rapido" ? "text-success" : ""}`}>
                  {d.variacao_pct > 0 ? "+" : ""}{d.variacao_pct.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

    </div>
  );
}

function SortableTH<K extends string>({
  label, k, active, dir, onClick, align = "left",
}: { label: string; k: K; active: K; dir: "asc" | "desc"; onClick: (k: K) => void; align?: "left" | "right" }) {
  const isActive = active === k;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 select-none transition-colors ${align === "right" ? "flex-row-reverse" : ""} ${isActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
      >
        <span>{label}</span>
        {isActive
          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}
