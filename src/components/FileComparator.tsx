import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import type { Evidencia, Falha } from "@/types/db";
import { isImageEvidence, type ComparisonPair } from "@/lib/occurrence";
import { diffLines, type DiffLine } from "@/lib/diff";
import { toast } from "sonner";

async function resolveUrl(ev?: Evidencia): Promise<string | null> {
  if (!ev) return null;
  if (ev.public_url) return ev.public_url;
  if (ev.signed_url) return ev.signed_url;
  const bucket = ev.bucket || STORAGE_BUCKET;
  if (!ev.storage_path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ev.storage_path, 60 * 60);
  if (error) { console.error("[comparator] signed url", error); return null; }
  return data?.signedUrl || null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) return null; // 4MB cap
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch (e) { console.error("[comparator] fetch", e); return null; }
}

interface Props {
  open: boolean;
  onClose: () => void;
  pair: ComparisonPair | null;
  falha?: Falha | null;
}

export function FileComparatorDialog({ open, onClose, pair, falha }: Props) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [atualUrl, setAtualUrl] = useState<string | null>(null);
  const [baseText, setBaseText] = useState<string | null>(null);
  const [atualText, setAtualText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);

  useEffect(() => {
    if (!open || !pair) return;
    let cancel = false;
    setLoading(true); setBaseText(null); setAtualText(null); setTooLarge(false);
    (async () => {
      const [bu, au] = await Promise.all([resolveUrl(pair.base), resolveUrl(pair.atual)]);
      if (cancel) return;
      setBaseUrl(bu); setAtualUrl(au);
      const ext = (pair.extensao || "").toLowerCase();
      const isText = ["txt", "csv", "log"].includes(ext);
      if (isText) {
        const [bt, at] = await Promise.all([bu ? fetchText(bu) : null, au ? fetchText(au) : null]);
        if (cancel) return;
        if ((bu && bt === null) || (au && at === null)) setTooLarge(true);
        setBaseText(bt); setAtualText(at);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [open, pair]);

  const ext = (pair?.extensao || "").toLowerCase();
  const isImg = pair && (pair.base ? isImageEvidence(pair.base) : pair.atual ? isImageEvidence(pair.atual) : false);
  const isText = ["txt", "log"].includes(ext);
  const isCsv = ext === "csv";
  const isPdf = ext === "pdf";

  const diff = useMemo(() => {
    if (!isText || baseText == null || atualText == null) return null;
    return diffLines(baseText, atualText);
  }, [isText, baseText, atualText]);

  const csvRows = useMemo(() => {
    if (!isCsv || baseText == null || atualText == null) return null;
    const parse = (s: string) => s.split(/\r?\n/).map((l) => l.split(/[;,\t]/));
    const A = parse(baseText); const B = parse(atualText);
    const len = Math.max(A.length, B.length);
    const rows = [] as { base: string[]; atual: string[]; changed: boolean[]; rowChanged: boolean }[];
    for (let i = 0; i < len; i++) {
      const a = A[i] || []; const b = B[i] || [];
      const cols = Math.max(a.length, b.length);
      const changed = new Array(cols).fill(false);
      let rowChanged = false;
      for (let j = 0; j < cols; j++) {
        const c = (a[j] || "") !== (b[j] || "");
        changed[j] = c;
        if (c) rowChanged = true;
      }
      rows.push({ base: a, atual: b, changed, rowChanged });
    }
    return rows;
  }, [isCsv, baseText, atualText]);

  const summary = useMemo(() => {
    if (diff) {
      let equal = 0, add = 0, del = 0;
      diff.forEach((l) => { if (l.op === "equal") equal++; else if (l.op === "add") add++; else del++; });
      return { kind: "txt" as const, equal, add, del, changed: Math.min(add, del) };
    }
    if (csvRows) {
      const total = csvRows.length;
      const changed = csvRows.filter((r) => r.rowChanged).length;
      return { kind: "csv" as const, total, changed };
    }
    return null;
  }, [diff, csvRows]);

  if (!pair) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[96vw] w-[1280px] h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Comparação Base x Atual
            <span className="text-xs text-muted-foreground font-normal">
              {falha?.id_caso_teste && <>· #{falha.id_caso_teste}</>}
              {falha?.caso_teste_provavel && <> · {falha.caso_teste_provavel}</>}
              · .{ext || "arquivo"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-border flex flex-wrap gap-2 items-center text-xs">
          <Side label="Base / Anterior" name={pair.base?.nome_arquivo} url={baseUrl} />
          <span className="text-muted-foreground">vs</span>
          <Side label="Atual / Novo" name={pair.atual?.nome_arquivo} url={atualUrl} />
        </div>

        {summary && (
          <div className="px-6 py-2 border-b border-border flex flex-wrap gap-3 items-center text-[11px]">
            <span className="uppercase tracking-wider text-muted-foreground">Resumo</span>
            {summary.kind === "txt" ? (
              <>
                <Stat label="Iguais" value={summary.equal} className="text-muted-foreground" />
                <Stat label="Removidas" value={summary.del} className="text-destructive" />
                <Stat label="Adicionadas" value={summary.add} className="text-success" />
                <Stat label="Alteradas" value={summary.changed} className="text-warning" />
              </>
            ) : (
              <>
                <Stat label="Linhas" value={summary.total} className="text-muted-foreground" />
                <Stat label="Diferentes" value={summary.changed} className="text-warning" />
              </>
            )}
            {pair.auto && <span className="ml-auto text-[10px] text-muted-foreground italic">Par identificado automaticamente</span>}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Carregando arquivos…</div>
          ) : isImg ? (
            <div className="grid grid-cols-2 gap-2 p-4 h-full overflow-auto">
              <ImagePane label="Base" url={baseUrl} />
              <ImagePane label="Atual" url={atualUrl} />
            </div>
          ) : isPdf ? (
            <div className="grid grid-cols-2 gap-2 p-4 h-full">
              <PdfPane label="Base" url={baseUrl} />
              <PdfPane label="Atual" url={atualUrl} />
            </div>
          ) : isText && diff ? (
            <DiffView diff={diff} />
          ) : isCsv && csvRows ? (
            <CsvDiffView rows={csvRows} />
          ) : tooLarge ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Arquivo grande demais para preview. Use os botões de abrir ou baixar.</div>
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Preview indisponível para este tipo de arquivo. Use os botões para abrir ou baixar.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-mono font-semibold ${className || ""}`}>{value}</span>
    </span>
  );
}

function Side({ label, name, url }: { label: string; name?: string | null; url: string | null }) {
  return (
    <Card className="px-3 py-2 flex items-center gap-2 flex-1 min-w-[280px]">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-xs font-mono truncate flex-1">{name || "—"}</span>
      {url && (
        <>
          <a href={url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" className="h-7 text-xs"><ExternalLink className="h-3 w-3 mr-1" />Abrir</Button>
          </a>
          <a href={url} download={name || ""} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />Baixar</Button>
          </a>
        </>
      )}
    </Card>
  );
}

function ImagePane({ label, url }: { label: string; url: string | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <ImageIcon className="h-3 w-3" /> {label}
      </div>
      {url ? (
        <img src={url} alt={label} className="w-full max-h-[70vh] object-contain bg-background" onError={() => toast.error(`Não foi possível carregar imagem (${label})`)} />
      ) : (
        <div className="p-6 text-center text-xs text-muted-foreground">Arquivo não encontrado.</div>
      )}
    </Card>
  );
}

function PdfPane({ label, url }: { label: string; url: string | null }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {url ? (
        <iframe title={label} src={url} className="flex-1 w-full min-h-[70vh] bg-background" />
      ) : (
        <div className="p-6 text-center text-xs text-muted-foreground">Preview de PDF indisponível. Abra o arquivo em nova aba.</div>
      )}
    </Card>
  );
}

/** Scroll sincronizado entre dois painéis. */
function useSyncedScroll() {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const l = leftRef.current; const r = rightRef.current;
    if (!l || !r) return;
    const sync = (src: HTMLDivElement, dst: HTMLDivElement) => () => {
      if (lock.current) return;
      lock.current = true;
      dst.scrollTop = src.scrollTop;
      dst.scrollLeft = src.scrollLeft;
      requestAnimationFrame(() => { lock.current = false; });
    };
    const a = sync(l, r); const b = sync(r, l);
    l.addEventListener("scroll", a); r.addEventListener("scroll", b);
    return () => { l.removeEventListener("scroll", a); r.removeEventListener("scroll", b); };
  }, []);
  return { leftRef, rightRef };
}

function DiffView({ diff }: { diff: DiffLine[] }) {
  const { leftRef, rightRef } = useSyncedScroll();
  return (
    <div className="grid grid-cols-2 font-mono text-xs h-full">
      <div ref={leftRef} className="border-r border-border overflow-auto h-full">
        <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground z-10">Base / Anterior</div>
        {diff.map((l, i) => (
          <div key={i} className={`flex ${l.op === "del" ? "bg-destructive/15" : ""}`}>
            <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none">{l.baseLine ?? ""}</span>
            <span className="flex-1 whitespace-pre-wrap break-all px-2">{l.op === "add" ? "" : l.text}</span>
          </div>
        ))}
      </div>
      <div ref={rightRef} className="overflow-auto h-full">
        <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground z-10">Atual / Novo</div>
        {diff.map((l, i) => (
          <div key={i} className={`flex ${l.op === "add" ? "bg-success/15" : ""}`}>
            <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none">{l.atualLine ?? ""}</span>
            <span className="flex-1 whitespace-pre-wrap break-all px-2">{l.op === "del" ? "" : l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsvDiffView({ rows }: { rows: { base: string[]; atual: string[]; changed: boolean[]; rowChanged: boolean }[] }) {
  const { leftRef, rightRef } = useSyncedScroll();
  return (
    <div className="grid grid-cols-2 text-xs h-full">
      <div ref={leftRef} className="border-r border-border overflow-auto h-full">
        <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground z-10">Base / Anterior</div>
        <table className="w-full">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-border/40 ${r.rowChanged ? "bg-warning/5" : ""}`}>
                {r.base.map((cell, j) => (
                  <td key={j} className={`px-2 py-1 align-top ${r.changed[j] ? "bg-destructive/15" : ""}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={rightRef} className="overflow-auto h-full">
        <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground z-10">Atual / Novo</div>
        <table className="w-full">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-border/40 ${r.rowChanged ? "bg-warning/5" : ""}`}>
                {r.atual.map((cell, j) => (
                  <td key={j} className={`px-2 py-1 align-top ${r.changed[j] ? "bg-success/15" : ""}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
