import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import type { Evidencia, Falha } from "@/types/db";
import { isImageEvidence, type ComparisonPair } from "@/lib/occurrence";
import { diffLines } from "@/lib/diff";
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
    if (buf.byteLength > 2 * 1024 * 1024) return null; // 2MB cap
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
    const rows = [] as { base: string[]; atual: string[]; changed: boolean[] }[];
    for (let i = 0; i < len; i++) {
      const a = A[i] || []; const b = B[i] || [];
      const cols = Math.max(a.length, b.length);
      const changed = new Array(cols).fill(false);
      for (let j = 0; j < cols; j++) changed[j] = (a[j] || "") !== (b[j] || "");
      rows.push({ base: a, atual: b, changed });
    }
    return rows;
  }, [isCsv, baseText, atualText]);

  if (!pair) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Comparador de Arquivos
            <span className="text-xs text-muted-foreground font-normal">
              {falha?.id_caso_teste && <>· #{falha.id_caso_teste}</>} · .{ext || "arquivo"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-border flex flex-wrap gap-2 items-center text-xs">
          <Side label="Base" name={pair.base?.nome_arquivo} url={baseUrl} />
          <span className="text-muted-foreground">vs</span>
          <Side label="Atual" name={pair.atual?.nome_arquivo} url={atualUrl} />
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Carregando arquivos…</div>
          ) : isImg ? (
            <div className="grid grid-cols-2 gap-2 p-4">
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

function DiffView({ diff }: { diff: ReturnType<typeof diffLines> }) {
  return (
    <div className="grid grid-cols-2 font-mono text-xs">
      <div className="border-r border-border">
        <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground">Base</div>
        {diff.map((l, i) => (
          <div key={i} className={`flex ${l.op === "del" ? "bg-destructive/15" : ""}`}>
            <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none">{l.baseLine ?? ""}</span>
            <span className="flex-1 whitespace-pre-wrap break-all px-2">{l.op === "add" ? "" : l.text}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground">Atual</div>
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

function CsvDiffView({ rows }: { rows: { base: string[]; atual: string[]; changed: boolean[] }[] }) {
  return (
    <div className="grid grid-cols-2 text-xs">
      {(["base", "atual"] as const).map((side) => (
        <div key={side} className={side === "base" ? "border-r border-border" : ""}>
          <div className="px-3 py-1.5 bg-secondary/40 sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground">{side === "base" ? "Base" : "Atual"}</div>
          <table className="w-full">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/40">
                  {r[side].map((cell, j) => (
                    <td key={j} className={`px-2 py-1 align-top ${r.changed[j] ? (side === "base" ? "bg-destructive/15" : "bg-success/15") : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
