import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Sheet, SheetPortal, SheetOverlay, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Falha, Evidencia } from "@/types/db";
import { fetchEvidenceByFailure } from "@/services/qa";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Copy, Download, ExternalLink, FileText, Image as ImageIcon, FileArchive,
  AlertCircle, GitCompare, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { pairBaseAtual, type ComparisonPair } from "@/lib/occurrence";
import { FileComparatorDialog } from "./FileComparator";

/* ---------------- helpers ---------------- */

function formatBytes(b?: number | null) {
  if (!b || b <= 0) return null;
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

async function resolveDownloadUrl(ev: Evidencia): Promise<string | null> {
  if (ev.public_url) return ev.public_url;
  if (ev.signed_url) return ev.signed_url;
  const bucket = ev.bucket || STORAGE_BUCKET;
  const path = ev.storage_path;
  if (!bucket || !path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) { toast.error("Falha ao gerar link"); return null; }
  return data?.signedUrl || null;
}

async function handleDownload(ev: Evidencia) {
  const url = await resolveDownloadUrl(ev);
  if (!url) { toast.error("Sem URL disponível"); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

function isImageEv(ev: Evidencia) {
  return (
    ev.tipo === "print" ||
    (ev.mime_type || "").toLowerCase().startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes((ev.extensao || "").toLowerCase())
  );
}

function isErrorImage(ev: Evidencia) {
  if (!isImageEv(ev)) return false;
  const name = (ev.nome_arquivo || "").toLowerCase();
  return /(imagem[_\s-]*erro|imagemerro|^erro[_\s-]|_erro\.|print[_\s-]*erro)/.test(name);
}

function isNumberedPrint(ev: Evidencia) {
  if (!isImageEv(ev)) return false;
  const name = (ev.nome_arquivo || "").trim();
  return /^\d+[\s._\-)]/.test(name) || /^\d+\./.test(name);
}

/* ---------------- resizable sheet content ---------------- */

const MIN_W = 672; // ~ sm:max-w-2xl
const ABS_MAX = 1400;

interface ResizableSheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  children: React.ReactNode;
}

const ResizableSheetContent = ({ className, children, ...props }: ResizableSheetContentProps) => {
  const [width, setWidth] = useState<number>(MIN_W);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(MIN_W);

  useEffect(() => {
    const clamp = () => {
      const max = Math.min(ABS_MAX, Math.max(MIN_W, window.innerWidth - 40));
      setWidth((w) => Math.min(Math.max(w, MIN_W), max));
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = startXRef.current - e.clientX; // dragging left = wider
    const max = Math.min(ABS_MAX, Math.max(MIN_W, window.innerWidth - 40));
    setWidth(Math.min(max, Math.max(MIN_W, startWRef.current + dx)));
  }, []);

  const stop = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  }, [onPointerMove]);

  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  };

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        {...props}
        style={{ width: `min(100vw, ${width}px)` }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl",
          "transition-none data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          "data-[state=closed]:duration-300 data-[state=open]:duration-400",
          className,
        )}
      >
        {/* Drag handle */}
        <div
          onPointerDown={onHandleDown}
          role="separator"
          aria-orientation="vertical"
          className="group absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          title="Arraste para redimensionar"
        >
          <div className="absolute left-1/2 top-1/2 h-14 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/60 group-hover:bg-primary/70" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>

        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
};

/* ---------------- main component ---------------- */

interface Props {
  falha: Falha | null;
  open: boolean;
  onClose: () => void;
  evidencias?: Evidencia[];
}

export function FailureDetailSheet({ falha, open, onClose, evidencias: evidsProp }: Props) {
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [comparePair, setComparePair] = useState<ComparisonPair | null>(null);

  useEffect(() => {
    if (!falha) return;
    if (evidsProp && evidsProp.length > 0) { setEvidencias(evidsProp); return; }
    if (falha.id?.startsWith("storage:")) { setEvidencias([]); return; }
    fetchEvidenceByFailure(falha.id).then(setEvidencias).catch(() => setEvidencias([]));
  }, [falha?.id, evidsProp]);

  const pairs = useMemo(() => pairBaseAtual(evidencias), [evidencias]);
  const realPairs = pairs.filter((p) => p.base && p.atual);

  // Split evidences into buckets
  const {
    errorImage,
    numberedPrints,
    otherEvidences,
    zipEvidence,
  } = useMemo(() => {
    const pairedIds = new Set<string>();
    realPairs.forEach((p) => {
      if (p.base) pairedIds.add(p.base.id);
      if (p.atual) pairedIds.add(p.atual.id);
    });
    const remaining = evidencias.filter((e) => !pairedIds.has(e.id));
    const errImg = remaining.find(isErrorImage) || null;
    const rest = remaining.filter((e) => e !== errImg);
    const nums = rest.filter(isNumberedPrint).sort((a, b) => {
      const na = parseInt((a.nome_arquivo || "").match(/^\d+/)?.[0] || "0", 10);
      const nb = parseInt((b.nome_arquivo || "").match(/^\d+/)?.[0] || "0", 10);
      return na - nb;
    });
    const zip = evidencias.find((e) => {
      const ext = (e.extensao || "").toLowerCase();
      if (["zip", "rar"].includes(ext)) return true;
      if (e.tipo === "zip" || e.tipo === "rar") return true;
      const name = (e.nome_arquivo || "").toLowerCase();
      return falha?.arquivo_zip && name === falha.arquivo_zip.toLowerCase();
    }) || null;
    const others = rest.filter((e) => !isNumberedPrint(e) && e.id !== zip?.id);

    return { errorImage: errImg, numberedPrints: nums, otherEvidences: others, zipEvidence: zip };
  }, [evidencias, realPairs, falha?.arquivo_zip]);

  if (!falha) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <ResizableSheetContent>
        <div className="px-7 pt-7 pb-5 border-b border-border/60">
          <SheetTitle className="text-[22px] leading-snug font-semibold tracking-tight pr-10 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {falha.id_caso_teste && (
              <span className="text-[13px] font-mono font-medium text-muted-foreground bg-muted/50 border border-border/60 rounded-md px-2 py-0.5 shrink-0">
                {falha.id_caso_teste}
              </span>
            )}
            <span>{falha.caso_teste_provavel || falha.erro_titulo || falha.arquivo_zip || "Falha"}</span>
          </SheetTitle>
          {(falha.erro_principal || falha.mensagem_principal) && (
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {falha.erro_principal || falha.mensagem_principal}
            </p>
          )}
        </div>

        <div className="px-7 py-6 space-y-8">


          {falha.arquivo_zip && (
            <Section title="Arquivo ZIP/RAR">
              <ZipFileRow name={falha.arquivo_zip} evidence={zipEvidence} />
            </Section>
          )}

          {errorImage && (
            <div>
              <EvidenceItem ev={errorImage} priority />
            </div>
          )}

          <section className="space-y-3">
            <Grid>
              <Field label="Tipo técnico" value={falha.tipo_tecnico} />
              <Field label="Formulário/Tela" value={falha.formulario_ou_tela} />
              <Field label="Componente" value={falha.componente} />
              
              <Field label="Fato observado" value={falha.fato_observado} full />
              <Field label="Hipótese principal" value={falha.hipotese_principal} full />
              <Field label="Análise técnica" value={falha.analise_tecnica} full />
              <Field label="Análise funcional" value={falha.analise_funcional} full />
              <Field label="Impacto possível" value={falha.impacto_possivel} full />
            </Grid>
            {falha.trecho_relevante && <CodeBlock title="Trecho relevante" content={falha.trecho_relevante} />}
            {falha.call_stack_resumido && <CodeBlock title="Call stack resumido" content={falha.call_stack_resumido} />}
            {falha.primeira_acao_recomendada && (
              <Card className="p-4 border-primary/40 bg-primary/5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">Primeira ação recomendada</p>
                    <p className="text-sm">{falha.primeira_acao_recomendada}</p>
                  </div>
                </div>
              </Card>
            )}
            {Array.isArray(falha.tags) && falha.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {falha.tags.map((t: string, i: number) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                ))}
              </div>
            )}
          </section>

          {realPairs.length > 0 && (
            <Section title={`Comparações (${realPairs.length})`}>
              <div className="space-y-2">
                {realPairs.map((p) => (
                  <Card key={p.key} className="p-3.5 flex items-center gap-3 flex-wrap bg-card/60">
                    <div className="flex-1 min-w-0 text-xs space-y-1">
                      <div className="font-mono truncate" title={p.base?.nome_arquivo || ""}>
                        <span className="text-muted-foreground font-sans not-italic mr-1">Base:</span>
                        <span className="text-foreground/90">{p.base?.nome_arquivo}</span>
                      </div>
                      <div className="font-mono truncate" title={p.atual?.nome_arquivo || ""}>
                        <span className="text-muted-foreground font-sans not-italic mr-1">Atual:</span>
                        <span className="text-foreground/90">{p.atual?.nome_arquivo}</span>
                      </div>
                      {p.auto && <div className="text-[10px] text-muted-foreground italic">Par identificado automaticamente</div>}
                    </div>
                    <Button size="sm" onClick={() => setComparePair(p)}>
                      <GitCompare className="h-3.5 w-3.5 mr-1" /> Ver diferenças
                    </Button>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {numberedPrints.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-center gap-2 text-left mb-3 hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                    Prints do teste <span className="text-foreground/60 normal-case font-normal">({numberedPrints.length})</span>
                  </h3>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 data-[state=closed]:hidden">
                {numberedPrints.map((e) => <EvidenceItem key={e.id} ev={e} />)}
              </CollapsibleContent>
            </Collapsible>
          )}


          {otherEvidences.length > 0 && (
            <Section title={`Outras evidências (${otherEvidences.length})`}>
              <div className="space-y-3">
                {otherEvidences.map((e) => <EvidenceItem key={e.id} ev={e} />)}
              </div>
            </Section>
          )}

          {evidencias.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma evidência vinculada a esta falha.</Card>
          )}
        </div>
      </ResizableSheetContent>
      <FileComparatorDialog open={!!comparePair} pair={comparePair} falha={falha} onClose={() => setComparePair(null)} />
    </Sheet>
  );
}

/* ---------------- small building blocks ---------------- */

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: any }) {
  return <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">{children}</div>;
}

function Field({ label, value, mono, full }: { label: string; value: any; mono?: boolean; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm text-foreground/90 leading-relaxed ${mono ? "font-mono break-all" : ""}`}>{value}</div>
    </div>
  );
}

function CodeBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { navigator.clipboard.writeText(content); toast.success("Copiado"); }}>
          <Copy className="h-3 w-3 mr-1" /> Copiar
        </Button>
      </div>
      <pre className="font-mono text-xs bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-64 text-foreground/80">{content}</pre>
    </div>
  );
}

function ZipFileRow({ name, evidence }: { name: string; evidence: Evidencia | null }) {
  const canDownload = !!evidence;
  return (
    <div
      className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
    >
      <FileArchive className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      <span className="flex-1 text-sm font-mono truncate text-foreground/90">{name}</span>
      {canDownload ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => evidence && handleDownload(evidence)}
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Baixar
        </Button>
      ) : (
        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">indisponível</span>
      )}
    </div>
  );
}

function EvidenceItem({ ev, priority }: { ev: Evidencia; priority?: boolean }) {
  const isImage = isImageEv(ev);
  const directUrl = ev.public_url || ev.signed_url || null;
  const [imgUrl, setImgUrl] = useState<string | null>(directUrl);
  const [imgError, setImgError] = useState(false);
  const [visible, setVisible] = useState(!!priority);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isImage || directUrl || !containerRef.current || visible) return;
    const el = containerRef.current;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } });
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [isImage, directUrl, visible]);

  useEffect(() => {
    let cancel = false;
    if (isImage && !directUrl && visible && ev.storage_path) {
      const bucket = ev.bucket || STORAGE_BUCKET;
      supabase.storage.from(bucket).createSignedUrl(ev.storage_path, 60 * 60).then(({ data, error }) => {
        if (cancel) return;
        if (error || !data?.signedUrl) setImgError(true);
        else setImgUrl(data.signedUrl);
      });
    }
    return () => { cancel = true; };
  }, [ev.id, visible]);

  const url = imgUrl;

  if (isImage) {
    return (
      <Card className={cn("overflow-hidden", priority && "border-primary/40 ring-1 ring-primary/20")} ref={containerRef as any}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium truncate">{ev.nome_arquivo || "Print"}</span>
          {formatBytes(ev.tamanho_bytes) && (
            <span className="text-[11px] text-muted-foreground">{formatBytes(ev.tamanho_bytes)}</span>
          )}
          <div className="ml-auto flex gap-1">
            {url && (
              <a href={url} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" className="h-7 text-xs"><ExternalLink className="h-3 w-3 mr-1" />Abrir</Button>
              </a>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownload(ev)}>
              <Download className="h-3 w-3 mr-1" />Baixar
            </Button>
          </div>
        </div>
        {url && !imgError ? (
          <img
            src={url}
            alt={ev.imagem_descricao || ev.nome_arquivo || "evidência"}
            loading="lazy"
            decoding="async"
            className={cn("w-full object-contain bg-background", priority ? "max-h-[520px]" : "max-h-96")}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {imgError ? "Não foi possível carregar esta evidência."
              : !visible && ev.storage_path ? "Imagem será carregada quando visível…"
              : ev.storage_path ? "Carregando imagem…" : "Arquivo não encontrado no Storage."}
          </div>
        )}
        {ev.imagem_descricao && <p className="px-3 py-2 text-xs text-muted-foreground">{ev.imagem_descricao}</p>}
      </Card>
    );
  }
  if (ev.tipo === "txt") {
    return (
      <Card>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
          <FileText className="h-4 w-4 text-warning" />
          <span className="text-xs font-medium">{ev.nome_arquivo || "Erro / Call stack"}</span>
          <div className="ml-auto flex gap-1">
            {ev.conteudo_texto && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(ev.conteudo_texto!); toast.success("TXT copiado"); }}>
                <Copy className="h-3 w-3 mr-1" />Copiar
              </Button>
            )}
            {url && (
              <a href={url} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" className="h-7 text-xs"><ExternalLink className="h-3 w-3 mr-1" />Abrir</Button>
              </a>
            )}
          </div>
        </div>
        {ev.conteudo_texto ? (
          <pre className="font-mono text-xs p-3 overflow-x-auto max-h-80 bg-background text-foreground/80 whitespace-pre-wrap">{ev.conteudo_texto}</pre>
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">Sem conteúdo de texto disponível.</div>
        )}
      </Card>
    );
  }
  const isArchive = ev.tipo === "zip" || ev.tipo === "rar";
  if (isArchive || ev.tipo === "pdf" || ev.tipo === "outro") {
    const upper = (ev.tipo || "ARQUIVO").toUpperCase();
    const label = isArchive ? `Baixar .${upper}` : ev.tipo === "pdf" ? "Baixar PDF" : "Baixar arquivo";
    const size = formatBytes(ev.tamanho_bytes);
    return (
      <Card className="p-3 flex items-center gap-3">
        <FileArchive className={`h-5 w-5 ${ev.tipo === "rar" ? "text-warning" : "text-data-mass"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{ev.nome_arquivo || `Arquivo ${upper}`}</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">{upper}</span>
            {size && <span>{size}</span>}
            {ev.mime_type && <span className="truncate">{ev.mime_type}</span>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => handleDownload(ev)}>
          <Download className="h-3 w-3 mr-1" />{label}
        </Button>
      </Card>
    );
  }
  return (
    <Card className="p-3 flex items-center gap-3 text-sm">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 truncate">{ev.nome_arquivo || ev.tipo}</span>
      <Button size="sm" variant="outline" onClick={() => handleDownload(ev)}>
        <Download className="h-3 w-3 mr-1" />Baixar
      </Button>
    </Card>
  );
}
