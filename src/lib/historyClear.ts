import { useCallback, useState } from "react";
import type { RerunRequest } from "@/services/qa";
import { ACTIVE_RERUN_STATUSES, rerunStatusKey } from "@/lib/rerunStatus";

// Limpeza local do historico Jenkins: guarda neste navegador os IDs das
// solicitacoes ja finalizadas no momento da limpeza. Nada e apagado na API;
// "Mostrar todas" desfaz. Por ID (e nao por horario) nao depende do relogio
// do computador, e o que ainda rodava continua visivel quando terminar.

const MAX_HIDDEN = 500;

function readHidden(storageKey: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeHidden(storageKey: string, ids: Set<string>) {
  try {
    if (ids.size === 0) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids).slice(-MAX_HIDDEN)));
  } catch {
    // Sem armazenamento (janela privada etc.): a limpeza vale so ate recarregar.
  }
}

const isActive = (r: RerunRequest) => ACTIVE_RERUN_STATUSES.has(rerunStatusKey(r));

/** Esconde as solicitacoes ocultadas; as em andamento sempre aparecem. */
export function visibleAfterClear(requests: RerunRequest[], hiddenIds: Set<string>): RerunRequest[] {
  if (hiddenIds.size === 0) return requests;
  return requests.filter((r) => isActive(r) || !hiddenIds.has(r.id));
}

/** Ha algo que o "Limpar" esconderia agora? */
export function canClearHistory(visible: RerunRequest[]): boolean {
  return visible.some((r) => !isActive(r));
}

export function useHistoryClear(storageKey: string) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHidden(storageKey));
  const clear = useCallback(
    (requests: RerunRequest[]) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const r of requests) if (!isActive(r)) next.add(r.id);
        writeHidden(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );
  const restore = useCallback(() => {
    writeHidden(storageKey, new Set());
    setHiddenIds(new Set());
  }, [storageKey]);
  return { hiddenIds, clear, restore };
}
