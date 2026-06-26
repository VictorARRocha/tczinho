import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
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

async function fetchText(url: string): Promise<{ text: string | null; tooLarge: boolean }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { text: null, tooLarge: false };
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return { text: null, tooLarge: true }; // 8MB cap
    // Detecta binário simples (NUL byte nos primeiros 4KB)
    const sniff = new Uint8Array(buf.slice(0, Math.min(4096, buf.byteLength)));
    let nulls = 0;
    for (let i = 0; i < sniff.length; i++) if (sniff[i] === 0) nulls++;
    if (nulls > 4) return { text: null, tooLarge: false };
    return { text: new TextDecoder("utf-8", { fatal: false }).decode(buf), tooLarge: false };
  } catch (e) {
    console.error("[comparator] fetch", e);
    return { text: null, tooLarge: false };
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  pair: ComparisonPair | null;
  falha?: Falha | null;
}

const TEXT_EXTS = new Set(["txt", "log", "json", "xml", "md", "yaml", "yml", "ini", "conf", "html", "htm", "css", "js", "ts", "tsx", "jsx", "sql"]);

function extOf(ev?: Evidencia, fallback?: string): string {
  if (!ev) return (fallback || "").toLowerCase();
  if (ev.extensao) return ev.extensao.toLowerCase();
  const name = ev.nome_arquivo || (ev.storage_path || "").split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  if (dot >= 0) return name.slice(dot + 1).toLowerCase();
  return (fallback || "").toLowerCase();
}

export function FileComparatorDialog({ open, onClose, pair, falha }: Props) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [atualUrl, setAtualUrl] = useState<string | null>(null);
  const [baseText, setBaseText] = useState<string | null>(null);
  const [atualText, setAtualText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [tooLarge, setTooLarge] = useState(false);
  const [binary, setBinary] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [atualError, setAtualError] = useState<string | null>(null);

  // Extensão efetiva (prioriza pair.extensao, depois deriva do nome dos arquivos)
  const ext = (pair?.extensao || extOf(pair?.base) || extOf(pair?.atual) || "").toLowerCase();
  const isImg = pair && (pair.base ? isImageEvidence(pair.base) : pair.atual ? isImageEvidence(pair.atual) : false);
  const isPdf = ext === "pdf";
  const isCsv = ext === "csv";
  // Texto: extensão conhecida OU (sem extensão e não é imagem/pdf/csv)
  const isText = TEXT_EXTS.has(ext) || (!ext && !isImg && !isPdf && !isCsv);

  useEffect(() => {
    if (!open || !pair) return;
    let cancel = false;
    setLoading(true);
    setLoadingStage("Carregando arquivos de comparação...");
    setBaseText(null); setAtualText(null); setTooLarge(false); setBinary(false);
    setBaseError(null); setAtualError(null);
    (async () => {
      const [bu, au] = await Promise.all([resolveUrl(pair.base), resolveUrl(pair.atual)]);
      if (cancel) return;
      setBaseUrl(bu); setAtualUrl(au);
      console.log("[comparator]", {
        baseName: pair.base?.nome_arquivo,
        atualName: pair.atual?.nome_arquivo,
        ext,
        isText, isImg, isPdf, isCsv,
        baseHasUrl: !!bu, atualHasUrl: !!au,
      });
      if (isText || isCsv) {
        setLoadingStage("Preparando diferenças...");
        const [b, a] = await Promise.all([
          bu ? fetchText(bu) : Promise.resolve({ text: null, tooLarge: false }),
          au ? fetchText(au) : Promise.resolve({ text: null, tooLarge: false }),
        ]);
        if (cancel) return;
        if (b.tooLarge || a.tooLarge) setTooLarge(true);
        if (pair.base && !bu) setBaseError("URL do arquivo Baseline indisponível.");
        else if (pair.base && b.text === null && !b.tooLarge) setBaseError("Não foi possível carregar o arquivo Baseline.");
        if (pair.atual && !au) setAtualError("URL do arquivo Checked indisponível.");
        else if (pair.atual && a.text === null && !a.tooLarge) setAtualError("Não foi possível carregar o arquivo Checked.");
        console.log("[comparator] loaded", { baseLen: b.text?.length ?? null, atualLen: a.text?.length ?? null });
        setBaseText(b.text); setAtualText(a.text);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [open, pair, ext, isText, isCsv, isImg, isPdf]);

  const diff = useMemo(() => {
    if (!isText) return null;
    if (baseText == null && atualText == null) return null;
    return diffLines(baseText ?? "", atualText ?? "");
  }, [isText, baseText, atualText]);

  // Calcula blocos contíguos de diferenças (para navegação)
  const diffBlocks = useMemo(() => {
    if (!diff) return [] as { start: number; end: number }[];
    const blocks: { start: number; end: number }[] = [];
    let cur: { start: number; end: number } | null = null;
    diff.forEach((l, i) => {
      if (l.op !== "equal") {
        if (!cur) cur = { start: i, end: i };
        else cur.end = i;
      } else if (cur) {
        blocks.push(cur);
        cur = null;
      }
    });
    if (cur) blocks.push(cur);
    return blocks;
  }, [diff]);

  const [currentBlock, setCurrentBlock] = useState(0);
  useEffect(() => { setCurrentBlock(0); }, [diff]);

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

  const csvDiffRows = useMemo(() => {
    if (!csvRows) return [] as number[];
    return csvRows.map((r, i) => (r.rowChanged ? i : -1)).filter((i) => i >= 0);
  }, [csvRows]);

  const totalDiffs = isCsv ? csvDiffRows.length : diffBlocks.length;
  const hasDiffs = totalDiffs > 0;

  if (!pair) return null;

  const baseName = pair.base?.nome_arquivo || "—";
  const atualName = pair.atual?.nome_arquivo || "—";

  const copyNames = () => {
    navigator.clipboard.writeText(`Baseline: ${baseName}\nChecked: ${atualName}`);
    toast.success("Nomes copiados");
  };

  const goPrev = () => {
    if (!hasDiffs) return;
    setCurrentBlock((c) => (c - 1 + totalDiffs) % totalDiffs);
  };
  const goNext = () => {
    if (!hasDiffs) return;
    setCurrentBlock((c) => (c + 1) % totalDiffs);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[96vw] w-[1320px] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Comparação de arquivos
            <span className="text-xs text-muted-foreground font-normal ml-1">
              {falha?.id_caso_teste && <>· Caso #{falha.id_caso_teste}</>}
              {falha?.caso_teste_provavel && <> · {falha.caso_teste_provavel}</>}
              {falha?.arquivo_zip && <> · {falha.arquivo_zip}</>}
              {ext && <> · .{ext}</>}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Barra de ações estilo TC/Tortoise */}
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 bg-muted/30">
          <Button size="sm" variant="outline" className="h-8" onClick={goPrev} disabled={!hasDiffs}>
            <ArrowUp className="h-3.5 w-3.5 mr-1" /> Diferença anterior
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={goNext} disabled={!hasDiffs}>
            <ArrowDown className="h-3.5 w-3.5 mr-1" /> Próxima diferença
          </Button>
          <span className="text-xs font-mono px-2 py-1 rounded bg-background border border-border">
            {loading
              ? "..."
              : !isText && !isCsv
                ? "—"
                : hasDiffs
                  ? `Diferença ${currentBlock + 1} de ${totalDiffs}`
                  : "Arquivos iguais"}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-8" onClick={copyNames}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar nomes
          </Button>
          {baseUrl && (
            <a href={baseUrl} download={baseName} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" className="h-8"><Download className="h-3.5 w-3.5 mr-1" />Baseline</Button>
            </a>
          )}
          {atualUrl && (
            <a href={atualUrl} download={atualName} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" className="h-8"><Download className="h-3.5 w-3.5 mr-1" />Checked</Button>
            </a>
          )}
        </div>

        {/* Cabeçalho dos painéis */}
        <div className="grid grid-cols-2 border-b border-border bg-background">
          <PaneHeader label="Baseline file" name={baseName} url={baseUrl} side="left" />
          <PaneHeader label="Checked file" name={atualName} url={atualUrl} side="right" />
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{loadingStage || "Carregando..."}</div>
          ) : isImg ? (
            <div className="grid grid-cols-2 gap-2 p-4 h-full overflow-auto">
              <ImagePane label="Baseline" url={baseUrl} />
              <ImagePane label="Checked" url={atualUrl} />
            </div>
          ) : isPdf ? (
            <div className="grid grid-cols-2 gap-2 p-4 h-full">
              <PdfPane label="Baseline" url={baseUrl} />
              <PdfPane label="Checked" url={atualUrl} />
            </div>
          ) : binary ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Este arquivo não pode ser comparado como texto. Use os botões para baixar.
            </div>
          ) : tooLarge ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Arquivo grande demais para preview. Use os botões para abrir ou baixar.
            </div>
          ) : isText ? (
            (baseError || atualError) && baseText == null && atualText == null ? (
              <div className="p-12 text-center text-sm text-destructive space-y-1">
                {baseError && <div>{baseError}</div>}
                {atualError && <div>{atualError}</div>}
              </div>
            ) : diff ? (
              <div className="h-full flex flex-col">
                {(baseError || atualError) && (
                  <div className="px-4 py-2 text-xs text-destructive border-b border-border bg-destructive/5">
                    {baseError} {atualError}
                  </div>
                )}
                <div className="flex-1 overflow-hidden">
                  <DiffView diff={diff} blocks={diffBlocks} currentBlock={currentBlock} />
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-sm text-muted-foreground">Preparando comparação...</div>
            )
          ) : isCsv && csvRows ? (
            <CsvDiffView rows={csvRows} diffRows={csvDiffRows} currentBlock={currentBlock} />
          ) : (!pair.base || !pair.atual) ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {pair.base ? "Arquivo atual/checked não encontrado." : "Arquivo baseline/base não encontrado."}
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Preview indisponível para este tipo de arquivo (.{ext || "?"}). Use os botões para abrir ou baixar.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaneHeader({ label, name, url, side }: { label: string; name: string; url: string | null; side: "left" | "right" }) {
  return (
    <div className={`px-4 py-2 flex items-center gap-2 ${side === "left" ? "border-r border-border" : ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}:</span>
      <span className="text-xs font-mono truncate flex-1" title={name}>{name}</span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2">
            <ExternalLink className="h-3 w-3 mr-1" />Abrir
          </Button>
        </a>
      )}
    </div>
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
        <div className="p-6 text-center text-xs text-muted-foreground">Preview de PDF indisponível.</div>
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

function DiffView({
  diff,
  blocks,
  currentBlock,
}: {
  diff: DiffLine[];
  blocks: { start: number; end: number }[];
  currentBlock: number;
}) {
  const { leftRef, rightRef } = useSyncedScroll();
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // rola a linha de início do bloco atual para o topo (com margem)
  useLayoutEffect(() => {
    const block = blocks[currentBlock];
    if (!block) return;
    const el = rowRefs.current[block.start];
    const container = leftRef.current;
    if (!el || !container) return;
    const top = el.offsetTop - 40;
    container.scrollTo({ top, behavior: "smooth" });
  }, [currentBlock, blocks]);

  const isCurrentBlock = (i: number) => {
    const b = blocks[currentBlock];
    return b ? i >= b.start && i <= b.end : false;
  };

  return (
    <div className="grid grid-cols-2 font-mono text-xs h-full">
      <div ref={leftRef} className="border-r border-border overflow-auto h-full bg-background">
        {diff.map((l, i) => {
          const isDel = l.op === "del";
          const isAdd = l.op === "add";
          const current = (isDel || isAdd) && isCurrentBlock(i);
          return (
            <div
              key={i}
              ref={(el) => { rowRefs.current[i] = el; }}
              className={`flex border-l-2 ${
                isDel
                  ? current
                    ? "bg-destructive/30 border-destructive"
                    : "bg-destructive/10 border-destructive/40"
                  : isAdd
                    ? "bg-muted/40 border-transparent"
                    : "border-transparent"
              }`}
            >
              <span className="w-12 text-right pr-2 text-muted-foreground/60 select-none shrink-0 border-r border-border/40">
                {l.baseLine ?? ""}
              </span>
              <span className="flex-1 whitespace-pre px-2 overflow-hidden">
                {l.op === "add" ? "" : l.text}
              </span>
            </div>
          );
        })}
      </div>
      <div ref={rightRef} className="overflow-auto h-full bg-background">
        {diff.map((l, i) => {
          const isAdd = l.op === "add";
          const isDel = l.op === "del";
          const current = (isAdd || isDel) && isCurrentBlock(i);
          return (
            <div
              key={i}
              className={`flex border-l-2 ${
                isAdd
                  ? current
                    ? "bg-success/30 border-success"
                    : "bg-success/10 border-success/40"
                  : isDel
                    ? "bg-muted/40 border-transparent"
                    : "border-transparent"
              }`}
            >
              <span className="w-12 text-right pr-2 text-muted-foreground/60 select-none shrink-0 border-r border-border/40">
                {l.atualLine ?? ""}
              </span>
              <span className="flex-1 whitespace-pre px-2 overflow-hidden">
                {l.op === "del" ? "" : l.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CsvDiffView({
  rows,
  diffRows,
  currentBlock,
}: {
  rows: { base: string[]; atual: string[]; changed: boolean[]; rowChanged: boolean }[];
  diffRows: number[];
  currentBlock: number;
}) {
  const { leftRef, rightRef } = useSyncedScroll();
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  useLayoutEffect(() => {
    const idx = diffRows[currentBlock];
    if (idx == null) return;
    const el = rowRefs.current[idx];
    const c = leftRef.current;
    if (!el || !c) return;
    c.scrollTo({ top: el.offsetTop - 40, behavior: "smooth" });
  }, [currentBlock, diffRows]);

  const isCurrent = (i: number) => diffRows[currentBlock] === i;

  return (
    <div className="grid grid-cols-2 text-xs h-full">
      <div ref={leftRef} className="border-r border-border overflow-auto h-full">
        <table className="w-full">
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                ref={(el) => { rowRefs.current[i] = el; }}
                className={`border-b border-border/40 ${r.rowChanged ? (isCurrent(i) ? "bg-warning/25" : "bg-warning/5") : ""}`}
              >
                {r.base.map((cell, j) => (
                  <td key={j} className={`px-2 py-1 align-top ${r.changed[j] ? "bg-destructive/20" : ""}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={rightRef} className="overflow-auto h-full">
        <table className="w-full">
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={`border-b border-border/40 ${r.rowChanged ? (isCurrent(i) ? "bg-warning/25" : "bg-warning/5") : ""}`}
              >
                {r.atual.map((cell, j) => (
                  <td key={j} className={`px-2 py-1 align-top ${r.changed[j] ? "bg-success/20" : ""}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
