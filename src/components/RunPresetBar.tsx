import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  createRunPreset, deleteRunPreset, updateRunPreset, type RunPreset, type RunPresetMode,
} from "@/services/data";
import { ApiError } from "@/services/data/apiSource";
import { invalidateRunPresets, useRunPresets } from "@/services/queries";
import { useAuth } from "@/contexts/AuthContext";
import { diffConfig, type ConfigChange, type JenkinsConfig } from "@/lib/jenkinsConfig";
import { cn } from "@/lib/utils";

const MAX_NAME = 80;
/** Grupo das pre-definicoes antigas, criadas antes de cada uma ter dono. */
const SEM_DONO = "Sem dono (todos)";

function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return "Você já tem uma pré-definição com esse nome.";
  if (e instanceof ApiError && e.status === 404) return "A pré-definição não existe mais (talvez outra pessoa a excluiu).";
  if (e instanceof ApiError && e.status === 403) return e.detail || "Só quem criou pode alterar esta pré-definição.";
  return (e as Error)?.message || "Erro desconhecido";
}

type DialogState =
  | { kind: "create"; name: string }
  | { kind: "copy"; preset: RunPreset; name: string }
  | { kind: "edit"; preset: RunPreset; name: string; replaceConfig: boolean };

type Aba = "minhas" | "outros";

/**
 * Pre-definicoes de rodagem salvas na API. Cada usuario tem as suas (aba "Minhas": usar,
 * editar, excluir); as dos outros ficam na aba "De outros usuários" (usar ou copiar para as
 * minhas). Admin tambem exclui as dos outros. `current` null = configuracao da tela invalida.
 */
export const RunPresetBar = memo(function RunPresetBar({
  mode,
  current,
  invalidReason,
  labels = {},
  onApply,
}: {
  mode: RunPresetMode;
  current: JenkinsConfig | null;
  invalidReason?: string | null;
  /** Nomes amigaveis das chaves no aviso/resumo (ex.: vm_name -> VM). */
  labels?: Record<string, string>;
  onApply: (preset: RunPreset) => void;
}) {
  const { profile, isAdmin } = useAuth();
  const username = profile?.username || "";
  const { data, isError: queryError, isLoading } = useRunPresets();
  const allPresets = useMemo(() => data || [], [data]);
  // Falha num recarregamento mantem a lista ja carregada; so desliga sem nada.
  const isError = queryError && !data;
  const presets = useMemo(() => allPresets.filter((p) => p.mode === mode), [allPresets, mode]);
  const isMine = useCallback((p: RunPreset) => !!username && p.created_by === username, [username]);
  const minhas = useMemo(() => presets.filter(isMine), [presets, isMine]);
  // De outros usuarios, agrupadas por quem criou (as sem dono ficam num grupo proprio, no fim).
  const grupos = useMemo(() => {
    const porDono = new Map<string, RunPreset[]>();
    for (const p of presets) {
      if (isMine(p)) continue;
      const dono = p.created_by || SEM_DONO;
      porDono.set(dono, [...(porDono.get(dono) || []), p]);
    }
    return [...porDono.entries()].sort(([a], [b]) =>
      a === SEM_DONO ? 1 : b === SEM_DONO ? -1 : a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [presets, isMine]);
  const totalOutros = presets.length - minhas.length;

  const [selectedId, setSelectedId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<Aba>("minhas");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = presets.find((p) => p.id === selectedId) || null;
  const selectedMine = !!selected && isMine(selected);
  // Pre-definicao excluida (aqui ou por outra pessoa): volta para "nenhuma".
  useEffect(() => {
    if (selectedId && !isLoading && !selected) setSelectedId("");
  }, [selectedId, selected, isLoading]);

  const changes = useMemo(
    () => (selected && current ? diffConfig(selected.config_json || {}, current) : []),
    [selected, current],
  );
  const label = (key: string) => labels[key] || key;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error("Não foi possível salvar a pré-definição", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const openList = (o: boolean) => {
    // Abre na aba da pre-definicao escolhida (ou em "Minhas").
    if (o) setAba(selected && !selectedMine ? "outros" : minhas.length === 0 && totalOutros > 0 ? "outros" : "minhas");
    setOpen(o);
  };

  const choose = (preset: RunPreset) => {
    setSelectedId(preset.id);
    setOpen(false);
    onApply(preset);
  };

  const saveIntoSelected = () => {
    if (!selected || !current) return;
    void run(async () => {
      await updateRunPreset(selected.id, { config: current });
      await invalidateRunPresets();
      toast.success(`Pré-definição "${selected.name}" atualizada`);
    });
  };

  const remove = (preset: RunPreset) => {
    setOpen(false);
    const pergunta = isMine(preset)
      ? `Excluir a sua pré-definição "${preset.name}"?`
      : `Excluir a pré-definição "${preset.name}" de ${preset.created_by || "todos (sem dono)"}? Ela some para todos os usuários.`;
    if (!window.confirm(pergunta)) return;
    void run(async () => {
      await deleteRunPreset(preset.id);
      if (preset.id === selectedId) setSelectedId("");
      await invalidateRunPresets();
      toast.success("Pré-definição excluída");
    });
  };

  const openCreate = () => {
    setOpen(false);
    if (!current) return toast.error("Corrija a configuração antes de salvar", { description: invalidReason || undefined });
    setDialog({ kind: "create", name: "" });
  };

  const openCopy = (preset: RunPreset) => {
    setOpen(false);
    setDialog({ kind: "copy", preset, name: preset.name });
  };

  const openEdit = (preset: RunPreset) => {
    setOpen(false);
    const hasChanges = !!current && diffConfig(preset.config_json || {}, current).length > 0;
    setDialog({ kind: "edit", preset, name: preset.name, replaceConfig: hasChanges && preset.id === selectedId });
  };

  const confirmDialog = () => {
    if (!dialog) return;
    const name = dialog.name.trim().replace(/\s+/g, " ");
    if (!name) return toast.error("Informe um nome");
    if (name.length > MAX_NAME) return toast.error(`O nome pode ter no máximo ${MAX_NAME} caracteres`);
    void run(async () => {
      if (dialog.kind === "create") {
        if (!current) return;
        const created = await createRunPreset({ nome: name, modo: mode, config: current });
        await invalidateRunPresets();
        setSelectedId(created.id);
        toast.success(`Pré-definição "${created.name}" salva`);
      } else if (dialog.kind === "copy") {
        const created = await createRunPreset({ nome: name, modo: mode, config: dialog.preset.config_json || {} });
        await invalidateRunPresets();
        setSelectedId(created.id);
        onApply(created);
        toast.success(`"${created.name}" copiada para as suas pré-definições`);
      } else {
        const payload = dialog.replaceConfig && current ? { nome: name, config: current } : { nome: name };
        await updateRunPreset(dialog.preset.id, payload);
        await invalidateRunPresets();
        if (dialog.replaceConfig) setSelectedId(dialog.preset.id);
        toast.success("Pré-definição atualizada");
      }
      setDialog(null);
    });
  };

  const dialogChanges: ConfigChange[] =
    dialog?.kind === "edit" && current ? diffConfig(dialog.preset.config_json || {}, current) : [];

  const placeholder = isError
    ? "Pré-definições indisponíveis"
    : presets.length === 0
      ? "Nenhuma pré-definição salva"
      : "Escolher pré-definição…";

  const linha = (p: RunPreset) => {
    const mine = isMine(p);
    return (
      <div key={p.id} className="group flex items-center gap-1 rounded-sm hover:bg-accent/60">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
          onClick={() => choose(p)}
        >
          <Check className={cn("h-3.5 w-3.5 shrink-0", p.id === selectedId ? "opacity-100" : "opacity-0")} />
          <span className="truncate">{p.name}</span>
        </button>
        {mine ? (
          <button
            type="button"
            aria-label={`Editar ${p.name}`}
            title="Editar"
            className="rounded p-1.5 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => openEdit(p)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Copiar ${p.name} para as minhas`}
            title="Copiar para as minhas"
            className="rounded p-1.5 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => openCopy(p)}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        {(mine || isAdmin) && (
          <button
            type="button"
            aria-label={`Excluir ${p.name}`}
            title={mine ? "Excluir" : "Excluir (administrador)"}
            className="mr-1 rounded p-1.5 text-muted-foreground opacity-60 hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => remove(p)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const abaBotao = (valor: Aba, texto: string, total: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={aba === valor}
      onClick={() => setAba(valor)}
      className={cn(
        "flex-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
        aba === valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {texto} ({total})
    </button>
  );

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/[0.06] p-3 space-y-2 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)]">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pré-definição</Label>
      <Popover open={open} onOpenChange={openList}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Pré-definição"
            disabled={isError}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.name : placeholder}
              {selected && !selectedMine && (
                <span className="ml-2 text-[11px] text-muted-foreground">de {selected.created_by || "todos"}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-1">
          <div role="tablist" aria-label="Pré-definições" className="mb-1 flex gap-1 rounded-md bg-muted p-1">
            {abaBotao("minhas", "Minhas", minhas.length)}
            {abaBotao("outros", "De outros usuários", totalOutros)}
          </div>
          <div className="max-h-72 overflow-y-auto" role="tabpanel">
            {aba === "minhas" ? (
              <>
                {minhas.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Você ainda não tem pré-definições. Salve a tela atual ou copie uma de outro usuário.
                  </p>
                )}
                {minhas.map(linha)}
              </>
            ) : (
              <>
                {grupos.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma pré-definição de outros usuários.</p>
                )}
                {grupos.map(([dono, lista]) => (
                  <div key={dono} role="group" aria-label={dono}>
                    <p className="px-2 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{dono}</p>
                    {lista.map(linha)}
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent/60"
            onClick={openCreate}
          >
            <Plus className="h-3.5 w-3.5" /> Nova a partir da tela atual…
          </button>
        </PopoverContent>
      </Popover>

      {selected && changes.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <ul className="space-y-0.5">
            {changes.slice(0, 4).map((c) => (
              <li key={c.key} className="break-all">
                <span className="font-medium">{label(c.key)}</span>: {c.before} → {c.after}
              </li>
            ))}
            {changes.length > 4 && <li>e mais {changes.length - 4} alteração(ões)</li>}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedMine && (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={saveIntoSelected}>
                Salvar em "{selected.name}"
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Salvar como nova
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => onApply(selected)}>
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
            </Button>
          </div>
        </div>
      )}
      {selected && changes.length === 0 && (selectedMine ? !!selected.updated_by : true) && (
        <p className="text-[11px] text-muted-foreground">
          {selectedMine
            ? `Última alteração por ${selected.updated_by} em ${new Date(selected.updated_at).toLocaleString("pt-BR")}`
            : `Pré-definição de ${selected.created_by || "todos (sem dono)"}: só quem criou altera. Para ajustar, copie para as suas.`}
        </p>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && !busy && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "edit" ? "Editar pré-definição" : dialog?.kind === "copy" ? "Copiar para as minhas" : "Nova pré-definição"}
            </DialogTitle>
            <DialogDescription>
              Fica nas suas pré-definições: os outros usuários podem usar e copiar, mas só você altera. A data/hora não é salva:
              é definida no envio.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              confirmDialog();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="preset-name" className="text-xs text-muted-foreground">Nome</Label>
              <Input
                id="preset-name"
                autoFocus
                maxLength={MAX_NAME}
                value={dialog?.name || ""}
                onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                placeholder="ex.: Fiscal a07 PROXIMA"
              />
            </div>

            {dialog?.kind === "create" && current && (
              <ConfigSummary title="Será salvo" config={current} label={label} />
            )}
            {dialog?.kind === "copy" && (
              <ConfigSummary
                title={`Será copiado de ${dialog.preset.created_by || "todos (sem dono)"}`}
                config={(dialog.preset.config_json || {}) as JenkinsConfig}
                label={label}
              />
            )}

            {dialog?.kind === "edit" && (
              <div className="space-y-2">
                <label className={cn("flex items-center gap-2 text-sm", (!current || dialogChanges.length === 0) && "opacity-60")}>
                  <Checkbox
                    checked={dialog.replaceConfig}
                    disabled={!current || dialogChanges.length === 0}
                    onCheckedChange={(v) => setDialog((d) => (d && d.kind === "edit" ? { ...d, replaceConfig: v === true } : d))}
                  />
                  Substituir pela configuração atual da tela
                </label>
                {!current ? (
                  <p className="text-[11px] text-red-500">A configuração da tela é inválida: {invalidReason}</p>
                ) : dialogChanges.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">A tela já está igual a esta pré-definição.</p>
                ) : (
                  <ul className={cn("rounded-md border border-border px-3 py-2 text-xs space-y-0.5", !dialog.replaceConfig && "opacity-50")}>
                    {dialogChanges.map((c) => (
                      <li key={c.key} className="break-all">
                        <span className="font-medium">{label(c.key)}</span>:{" "}
                        <span className="text-muted-foreground line-through">{c.before}</span> → {c.after}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
});

function ConfigSummary({ title, config, label }: { title: string; config: JenkinsConfig; label: (k: string) => string }) {
  const entries = Object.entries(config).filter(([k]) => k !== "data_hora");
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="rounded-md border border-border px-3 py-2 text-xs space-y-0.5">
        {entries.map(([k, v]) => (
          <li key={k} className="break-all">
            <span className="font-medium">{label(k)}</span>: {typeof v === "string" ? v || '""' : JSON.stringify(v)}
          </li>
        ))}
      </ul>
    </div>
  );
}
