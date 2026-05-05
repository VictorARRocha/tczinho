import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Falha, Evidencia } from "@/types/db";
import { fetchEvidenceByFailure } from "@/services/qa";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import { ClassificationBadge, SeverityBadge, ConfidenceBadge } from "./Badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Download, ExternalLink, FileText, Image as ImageIcon, FileArchive, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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


interface Props {
  falha: Falha | null;
  open: boolean;
  onClose: () => void;
}

export function FailureDetailSheet({ falha, open, onClose }: Props) {
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);

  useEffect(() => {
    if (!falha) return;
    fetchEvidenceByFailure(falha.id).then(setEvidencias).catch(() => setEvidencias([]));
  }, [falha?.id]);

  if (!falha) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-card border-l border-border">
        <SheetHeader className="space-y-3 pb-6 border-b border-border">
          <div className="flex items-center gap-2">
            <ClassificationBadge value={falha.classificacao} />
            <SeverityBadge value={falha.severidade} />
            <ConfidenceBadge value={falha.confianca} />
          </div>
          <SheetTitle className="text-xl leading-tight">
            {falha.erro_titulo || falha.caso_teste_provavel || falha.arquivo_zip || "Falha"}
          </SheetTitle>
          {falha.erro_principal && (
            <p className="text-sm text-muted-foreground">{falha.erro_principal}</p>
          )}
        </SheetHeader>

        <div className="space-y-6 py-6">
          <Section title="Identificação">
            <Grid>
              <Field label="ID do caso" value={falha.id_caso_teste} />
              <Field label="Caso provável" value={falha.caso_teste_provavel} />
              <Field label="Grupo" value={falha.grupo} />
              <Field label="Subgrupo" value={falha.subgrupo} />
              <Field label="Rotina funcional" value={falha.rotina_funcional} />
              <Field label="Confiança associação" value={falha.confianca_associacao} />
              <Field label="Arquivo ZIP" value={falha.arquivo_zip} mono />
              <Field label="Arquivo TXT" value={falha.arquivo_txt} mono />
              <Field label="Arquivo Print" value={falha.arquivo_print} mono />
            </Grid>
          </Section>

          <Section title="Erro">
            <Grid>
              <Field label="Tipo técnico" value={falha.tipo_tecnico} />
              <Field label="Formulário/Tela" value={falha.formulario_ou_tela} />
              <Field label="Componente" value={falha.componente} />
              <Field label="Mensagem principal" value={falha.mensagem_principal} full />
            </Grid>
            {falha.trecho_relevante && (
              <CodeBlock title="Trecho relevante" content={falha.trecho_relevante} />
            )}
            {falha.call_stack_resumido && (
              <CodeBlock title="Call stack resumido" content={falha.call_stack_resumido} />
            )}
          </Section>

          <Section title="Análise">
            <Grid>
              <Field label="Fato observado" value={falha.fato_observado} full />
              <Field label="Hipótese principal" value={falha.hipotese_principal} full />
              <Field label="Análise técnica" value={falha.analise_tecnica} full />
              <Field label="Análise funcional" value={falha.analise_funcional} full />
              <Field label="Impacto possível" value={falha.impacto_possivel} full />
            </Grid>
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
          </Section>

          <Section title={`Evidências (${evidencias.length})`}>
            {evidencias.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma evidência vinculada a esta falha.</Card>
            ) : (
              <div className="space-y-3">
                {evidencias.map((e) => <EvidenceItem key={e.id} ev={e} />)}
              </div>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: any }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>;
}

function Field({ label, value, mono, full }: { label: string; value: any; mono?: boolean; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm ${mono ? "font-mono break-all" : ""}`}>{value}</div>
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

function EvidenceItem({ ev }: { ev: Evidencia }) {
  const url = ev.public_url || ev.signed_url;
  if (ev.tipo === "print") {
    return (
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">{ev.nome_arquivo || "Print"}</span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="ml-auto">
              <Button variant="ghost" size="sm" className="h-7 text-xs"><ExternalLink className="h-3 w-3 mr-1" />Abrir</Button>
            </a>
          )}
        </div>
        {url ? (
          <img src={url} alt={ev.imagem_descricao || "evidência"} className="w-full max-h-96 object-contain bg-background" />
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">Storage privado — sem URL pública.</div>
        )}
        {ev.imagem_descricao && <p className="px-3 py-2 text-xs text-muted-foreground">{ev.imagem_descricao}</p>}
      </Card>
    );
  }
  if (ev.tipo === "txt") {
    return (
      <Card>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
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
