import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import "@/lib/monacoSetup";
// Somente tipos (apagado no build): o editor em si vem de /monaco/vs.
import type { editor as MonacoEditor } from "monaco-editor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type { Evidencia, Falha } from "@/types/db";
import { fetchEvidenceBlob } from "@/lib/evidenceUrl";
import { isImageEvidence, type ComparisonPair } from "@/lib/occurrence";
import { toast } from "sonner";

function countReplacementChars(text: string): number {
  return (text.match(/\uFFFD/g) || []).length;
}

/** Tenta UTF-8, windows-1252 e iso-8859-1; escolhe o que tem menos caracteres �. */
function decodeArrayBufferSmart(buffer: ArrayBuffer): string {
  const encodings = ["utf-8", "windows-1252", "iso-8859-1"];
  const candidates: { enc: string; text: string; bad: number }[] = [];
  for (const enc of encodings) {
    try {
      const text = new TextDecoder(enc, { fatal: false }).decode(buffer);
      candidates.push({ enc, text, bad: countReplacementChars(text) });
    } catch { /* encoding não suportado pelo navegador */ }
  }
  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.bad - b.bad);
  return candidates[0].text;
}

async function decodeText(blob: Blob | null): Promise<{ text: string | null; tooLarge: boolean }> {
  if (!blob) return { text: null, tooLarge: false };
  try {
    const buf = await blob.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return { text: null, tooLarge: true }; // 8MB cap
    const sniff = new Uint8Array(buf.slice(0, Math.min(4096, buf.byteLength)));
    let nulls = 0;
    for (let i = 0; i < sniff.length; i++) if (sniff[i] === 0) nulls++;
    if (nulls > 4) return { text: null, tooLarge: false };
    return { text: decodeArrayBufferSmart(buf), tooLarge: false };
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
  const raw = (() => {
    if (!ev) return fallback || "";
    if (ev.extensao) return ev.extensao;
    const name = ev.nome_arquivo || (ev.storage_path || "").split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    if (dot >= 0) return name.slice(dot + 1);
    return fallback || "";
  })();
  return raw.toLowerCase().replace(/^\.+/, "");
}

function monacoLanguageFromExt(ext: string): string {
  switch ((ext || "").toLowerCase()) {
    case "json": return "json";
    case "xml": case "html": case "htm": return "xml";
    case "md": return "markdown";
    case "js": case "jsx": return "javascript";
    case "ts": case "tsx": return "typescript";
    case "css": return "css";
    case "sql": return "sql";
    case "yaml": case "yml": return "yaml";
    case "ini": case "conf": return "ini";
    default: return "plaintext";
  }
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
  const ext = (pair?.extensao || extOf(pair?.base) || extOf(pair?.atual) || "").toLowerCase().replace(/^\.+/, "");
  const isImg = pair && (pair.base ? isImageEvidence(pair.base) : pair.atual ? isImageEvidence(pair.atual) : false);
  const isPdf = ext === "pdf";
  const isCsv = ext === "csv";
  // Texto: extensão conhecida OU (sem extensão e não é imagem/pdf/csv)
  const isText = TEXT_EXTS.has(ext) || (!ext && !isImg && !isPdf && !isCsv);

  useEffect(() => {
    if (!open || !pair) return;
    let cancel = false;
    const objectUrls: string[] = [];
    setLoading(true);
    setLoadingStage("Carregando arquivos de comparação...");
    setBaseText(null); setAtualText(null); setTooLarge(false); setBinary(false);
    setBaseError(null); setAtualError(null);
    (async () => {
      const [baseBlob, atualBlob] = await Promise.all([
        pair.base ? fetchEvidenceBlob(pair.base) : Promise.resolve(null),
        pair.atual ? fetchEvidenceBlob(pair.atual) : Promise.resolve(null),
      ]);
      if (cancel) return;
      const bu = baseBlob ? URL.createObjectURL(baseBlob) : null;
      const au = atualBlob ? URL.createObjectURL(atualBlob) : null;
      if (bu) objectUrls.push(bu);
      if (au) objectUrls.push(au);
      setBaseUrl(bu); setAtualUrl(au);
      if (isText || isCsv) {
        setLoadingStage("Preparando diferenças...");
        const [b, a] = await Promise.all([
          decodeText(baseBlob),
          decodeText(atualBlob),
        ]);
        if (cancel) return;
        if (b.tooLarge || a.tooLarge) setTooLarge(true);
        if (pair.base && !bu) setBaseError("URL do arquivo Baseline indisponível.");
        else if (pair.base && b.text === null && !b.tooLarge) setBaseError("Não foi possível carregar o arquivo Baseline.");
        if (pair.atual && !au) setAtualError("URL do arquivo Checked indisponível.");
        else if (pair.atual && a.text === null && !a.tooLarge) setAtualError("Não foi possível carregar o arquivo Checked.");
        
        setBaseText(b.text); setAtualText(a.text);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [open, pair, ext, isText, isCsv, isImg, isPdf]);

  // Texto e comparado pelo Monaco DiffEditor; CSV usa a navegacao por linhas abaixo.
  const [currentBlock, setCurrentBlock] = useState(0);

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

  useEffect(() => { setCurrentBlock(0); }, [csvRows]);

  // --- Monaco Diff: navegação real entre line changes -------------------------
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
  const [monacoChanges, setMonacoChanges] = useState<MonacoEditor.ILineChange[] | null>(null); // null = calculando
  const [monacoIndex, setMonacoIndex] = useState(0);

  const handleDiffEditorMount = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor;
    const update = () => {
      try {
        const changes = editor.getLineChanges?.() || [];
        setMonacoChanges(changes);
        setMonacoIndex(changes.length > 0 ? 0 : -1);
        
      } catch (e) {
        console.error("[comparator] getLineChanges", e);
        setMonacoChanges([]);
      }
    };
    // Primeiro cálculo pode levar alguns ms após o mount
    setTimeout(update, 300);
    editor.onDidUpdateDiff?.(update);
  }, []);

  // Resetar estado do Monaco a cada novo par
  useEffect(() => {
    setMonacoChanges(null);
    setMonacoIndex(0);
    diffEditorRef.current = null;
  }, [pair, baseText, atualText]);

  const gotoMonacoDiff = useCallback((index: number) => {
    const editor = diffEditorRef.current;
    if (!editor || !monacoChanges || monacoChanges.length === 0) return;
    const n = monacoChanges.length;
    const safe = ((index % n) + n) % n;
    const d = monacoChanges[safe];
    setMonacoIndex(safe);
    const modifiedLine = d.modifiedStartLineNumber || d.modifiedEndLineNumber || 1;
    const originalLine = d.originalStartLineNumber || d.originalEndLineNumber || 1;
    try {
      const mod = editor.getModifiedEditor?.();
      const orig = editor.getOriginalEditor?.();
      mod?.revealLineInCenter(modifiedLine);
      orig?.revealLineInCenter(originalLine);
      mod?.setPosition({ lineNumber: Math.max(1, modifiedLine), column: 1 });
      orig?.setPosition({ lineNumber: Math.max(1, originalLine), column: 1 });
    } catch (e) {
      console.error("[comparator] gotoMonacoDiff", e);
    }
  }, [monacoChanges]);

  // Totais e label do contador (Monaco para texto, CSV para .csv)
  const totalDiffs = isText
    ? (monacoChanges?.length ?? 0)
    : isCsv ? csvDiffRows.length : 0;
  const hasDiffs = totalDiffs > 0;
  const isCalculating = isText && monacoChanges === null && (baseText != null || atualText != null);
  const currentIndex = isText ? monacoIndex : currentBlock;

  if (!pair) return null;

  const baseName = pair.base?.nome_arquivo || "—";
  const atualName = pair.atual?.nome_arquivo || "—";

  const copyNames = () => {
    navigator.clipboard.writeText(`Baseline: ${baseName}\nChecked: ${atualName}`);
    toast.success("Nomes copiados");
  };

  const goPrev = () => {
    if (!hasDiffs) return;
    if (isText) gotoMonacoDiff(monacoIndex - 1);
    else setCurrentBlock((c) => (c - 1 + totalDiffs) % totalDiffs);
  };
  const goNext = () => {
    if (!hasDiffs) return;
    if (isText) gotoMonacoDiff(monacoIndex + 1);
    else setCurrentBlock((c) => (c + 1) % totalDiffs);
  };


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[96vw] w-[1320px] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Comparação de arquivos
          </DialogTitle>
        </DialogHeader>

        {/* Barra de ações estilo TC/Tortoise */}
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 bg-muted/30">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={goPrev}
            disabled={loading || isCalculating || !hasDiffs}
            title="Diferença anterior (Shift+F7)"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={goNext}
            disabled={loading || isCalculating || !hasDiffs}
            title="Próxima diferença (F7)"
          >
            Próxima <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
          <span className="text-xs font-mono px-2 py-1 rounded bg-background border border-border">
            {loading
              ? "Carregando..."
              : !isText && !isCsv
                ? "—"
                : isCalculating
                  ? "Calculando diferenças..."
                  : hasDiffs
                    ? `Diferença ${Math.max(0, currentIndex) + 1} de ${totalDiffs}`
                    : "Arquivos iguais"}
          </span>
          <div className="flex-1" />
          {(baseUrl || atualUrl) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={async () => {
                const trigger = async (url: string, name: string) => {
                  try {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    const objUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = objUrl;
                    a.download = name || "arquivo";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
                  } catch {
                    toast.error(`Não foi possível baixar ${name}`);
                  }
                };
                if (baseUrl) await trigger(baseUrl, baseName);
                if (atualUrl) await trigger(atualUrl, atualName);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Baixar arquivos
            </Button>
          )}

        </div>


        {/* Cabeçalho dos painéis */}
        <div className="grid grid-cols-2 border-b border-border bg-background">
          <PaneHeader name={baseName} side="left" />
          <PaneHeader name={atualName} side="right" />

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
            ) : (baseText != null || atualText != null) ? (
              <div className="h-full flex flex-col">
                {(baseError || atualError) && (
                  <div className="px-4 py-2 text-xs text-destructive border-b border-border bg-destructive/5">
                    {baseError} {atualError}
                  </div>
                )}
                <div className="flex-1 overflow-hidden">
                  <DiffEditor
                    height="100%"
                    width="100%"
                    original={baseText ?? ""}
                    modified={atualText ?? ""}
                    language={monacoLanguageFromExt(ext)}
                    theme="vs-dark"
                    onMount={handleDiffEditorMount}
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      ignoreTrimWhitespace: false,
                      automaticLayout: true,
                      minimap: { enabled: true },
                      scrollBeyondLastLine: false,
                      wordWrap: "off",
                      renderWhitespace: "boundary",
                      fontSize: 12,
                      originalEditable: false,
                      glyphMargin: true,
                      lineNumbers: "on",
                    }}
                    loading={<div className="p-12 text-center text-sm text-muted-foreground">Preparando Monaco Diff...</div>}
                  />
                </div>

              </div>
            ) : (
              <div className="p-12 text-center text-sm text-muted-foreground">Carregando arquivos de comparação...</div>
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

function PaneHeader({ name, side }: { name: string; side: "left" | "right" }) {
  return (
    <div className={`px-4 py-2 flex items-center gap-2 ${side === "left" ? "border-r border-border" : ""}`}>
      <span className="text-xs font-mono truncate flex-1" title={name}>{name}</span>
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
