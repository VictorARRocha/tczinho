import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
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
import { diffConfig, type ConfigChange, type JenkinsConfig } from "@/lib/jenkinsConfig";
import { cn } from "@/lib/utils";

const MAX_NAME = 80;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return "Já existe uma pré-definição com esse nome.";
  if (e instanceof ApiError && e.status === 404) return "A pré-definição não existe mais (talvez outra pessoa a excluiu).";
  return (e as Error)?.message || "Erro desconhecido";
}

type DialogState =
  | { kind: "create"; name: string }
  | { kind: "edit"; preset: RunPreset; name: string; replaceConfig: boolean };

/**
 * Pre-definicoes de rodagem salvas na API. A lista concentra escolher, editar,
 * excluir e criar; o aviso de alteracao so aparece quando ha algo a salvar.
 * `current` null = configuracao da tela invalida (nao pode ser salva).
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
  const { data, isError: queryError, isLoading } = useRunPresets();
  const allPresets = useMemo(() => data || [], [data]);
  // Falha num recarregamento mantem a lista ja carregada; so desliga sem nada.
  const isError = queryError && !data;
  const presets = useMemo(() => allPresets.filter((p) => p.mode === mode), [allPresets, mode]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = presets.find((p) => p.id === selectedId) || null;
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
    if (!window.confirm(`Excluir a pré-definição "${preset.name}"? Ela some para todos os usuários.`)) return;
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

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pré-definição</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Pré-definição"
            disabled={isError}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.name : placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-1">
          <div className="max-h-72 overflow-y-auto">
            {presets.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma pré-definição salva ainda.</p>
            )}
            {presets.map((p) => (
              <div key={p.id} className="group flex items-center gap-1 rounded-sm hover:bg-accent/60">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                  onClick={() => choose(p)}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", p.id === selectedId ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{p.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Editar ${p.name}`}
                  title="Editar"
                  className="rounded p-1.5 text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${p.name}`}
                  title="Excluir"
                  className="mr-1 rounded p-1.5 text-muted-foreground opacity-60 hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => remove(p)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
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
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={saveIntoSelected}>
              Salvar em "{selected.name}"
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Salvar como nova
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => onApply(selected)}>
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
            </Button>
          </div>
        </div>
      )}
      {selected && changes.length === 0 && selected.updated_by && (
        <p className="text-[11px] text-muted-foreground">
          Última alteração por {selected.updated_by} em {new Date(selected.updated_at).toLocaleString("pt-BR")}
        </p>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && !busy && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.kind === "edit" ? "Editar pré-definição" : "Nova pré-definição"}</DialogTitle>
            <DialogDescription>
              Vale para todos os usuários. A data/hora não é salva: é definida no envio.
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
