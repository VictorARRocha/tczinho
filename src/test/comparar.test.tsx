import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Falha, Rodagem } from "@/types/db";

const failuresByRun: Record<string, Falha[]> = {};
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return { ...actual, fetchFailuresByRun: async (runId: string) => failuresByRun[runId] || [] };
});

import { compareRuns, executedCountsDiffer, occurrenceTypeOf, orderRuns } from "@/lib/runComparison";
import { CompararTab } from "@/pages/module/CompararTab";
import { FalhasTab } from "@/pages/module/FalhasTab";

const falha = (id: string, caso: string, tipo: string, extra: Partial<Falha> = {}) =>
  ({ id, id_caso_teste: caso, caso_teste_provavel: `Caso ${caso}`, tipo_ocorrencia: tipo, ...extra }) as unknown as Falha;

const rodagem = (id: string, data: string, total = 300, falhas = 0) =>
  ({ id, data_inicio_rodagem: data, versao_sistema: "PROXIMA", maquina: "a08", total_analisados: total, total_falhas: falhas }) as Rodagem;

describe("comparacao entre rodagens", () => {
  it("separa novas, persistentes e resolvidas pelo ID do caso", () => {
    const antes = [falha("a1", "3.1.1", "test_break"), falha("a2", "3.1.2", "report_difference")];
    const depois = [falha("d1", "3.1.2", "report_difference"), falha("d2", "3.2.5", "test_break")];

    const { itens, resumo } = compareRuns(antes, depois);

    expect(resumo).toEqual({ novas: 1, persistentes: 1, resolvidas: 1, tipoMudou: 0 });
    expect(itens.map((i) => [i.caseId, i.status])).toEqual([
      ["3.2.5", "nova"],
      ["3.1.2", "persistente"],
      ["3.1.1", "resolvida"],
    ]);
  });

  it("junta varias falhas do mesmo caso e detecta mudanca de tipo", () => {
    const antes = [falha("a1", "3.1.1", "test_break")];
    const depois = [falha("d1", "3.1.1", "report_difference"), falha("d2", "3.1.1", "report_difference")];

    const [item] = compareRuns(antes, depois).itens;

    expect(item.depois).toHaveLength(2);
    expect(item.tipoAntes).toBe("quebra");
    expect(item.tipoDepois).toBe("diferenca");
    expect(item.tipoMudou).toBe(true);
  });

  it("ordena os IDs numericamente (3.2 antes de 3.10)", () => {
    const depois = [falha("x", "3.10", "test_break"), falha("y", "3.2", "test_break")];
    expect(compareRuns([], depois).itens.map((i) => i.caseId)).toEqual(["3.2", "3.10"]);
  });

  it("usa o nome do compactado quando a falha nao tem ID de caso", () => {
    const antes = [falha("a1", "ID invalido", "test_break", { arquivo_zip: "teste.rar" })];
    const depois = [falha("d1", "ID invalido", "test_break", { arquivo_zip: "TESTE.rar" })];
    expect(compareRuns(antes, depois).resumo.persistentes).toBe(1);
  });

  it("interpreta o tipo informado pela API e pelo Python", () => {
    expect(occurrenceTypeOf(falha("1", "1", "test_break_with_difference"))).toBe("quebra_diferenca");
    expect(occurrenceTypeOf(falha("1", "1", "report_difference"))).toBe("diferenca");
    expect(occurrenceTypeOf(falha("1", "1", "", { tipo_detectado_python: "Quebra de testes" } as Partial<Falha>))).toBe("quebra");
    expect(occurrenceTypeOf(falha("1", "1", "", { tipo_detectado_python: "Diferença entre arquivos de comparação" } as Partial<Falha>))).toBe("diferenca");
  });

  it("ordena o par cronologicamente e avisa quando o total executado difere muito", () => {
    const velha = rodagem("r1", "2026-10-01T10:00:00", 300);
    const nova = rodagem("r2", "2026-10-02T10:00:00", 40);
    expect(orderRuns(nova, velha).map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(executedCountsDiffer(velha, nova)).toBe(true);
    expect(executedCountsDiffer(velha, rodagem("r3", "2026-10-03", 290))).toBe(false);
  });
});

describe("aba Comparar", () => {
  beforeEach(() => {
    failuresByRun.r_velha = [falha("a1", "3.1.1", "test_break"), falha("a2", "3.1.2", "test_break")];
    failuresByRun.r_nova = [falha("d1", "3.1.2", "report_difference"), falha("d2", "3.9.9", "test_break")];
  });
  afterEach(() => vi.restoreAllMocks());

  function renderTab(onOpen = vi.fn(), runs = [rodagem("r_nova", "2026-10-02T10:00:00", 300, 2), rodagem("r_velha", "2026-10-01T10:00:00", 300, 2)]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CompararTab runs={runs} currentRunId="r_nova" onOpenFailure={onOpen} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return onOpen;
  }

  it("compara a rodagem aberta com a anterior e mostra o resumo", async () => {
    renderTab();
    expect(await screen.findByText("3 de 3 casos")).toBeInTheDocument();
    const card = (label: string) => screen.getByText(label).closest("button") as HTMLElement;
    expect(within(card("Novas")).getByText("1")).toBeInTheDocument();
    expect(within(card("Persistentes")).getByText("1")).toBeInTheDocument();
    expect(within(card("Não falharam")).getByText("1")).toBeInTheDocument();
    expect(within(card("Mudaram de tipo")).getByText("1")).toBeInTheDocument();
  });

  it("filtra pelo cartao e abre os detalhes da falha mais recente", async () => {
    const onOpen = renderTab();
    await screen.findByText("3 de 3 casos");

    fireEvent.click(screen.getByText("Novas").closest("button") as HTMLElement);
    expect(screen.getByText("1 de 3 casos")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Caso 3.9.9"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "d2" }));
  });

  it("explica quando so existe uma rodagem", () => {
    renderTab(vi.fn(), [rodagem("r_nova", "2026-10-02T10:00:00")]);
    expect(screen.getByText("É preciso pelo menos duas rodagens para comparar.")).toBeInTheDocument();
  });
});

describe("aba Falhas", () => {
  const falhas = [
    falha("f1", "3.1.1", "test_break", { erro_principal: "Object not found: btnSalvar" }),
    falha("f2", "3.1.2", "test_break", { erro_principal: "Timeout na tela de lancamentos" }),
    falha("f3", "3.2.5", "test_break", { erro_principal: "Erro no relatorio" }),
  ];

  function renderFalhas() {
    return render(
      <FalhasTab
        moduloNome="Contábil"
        falhas={falhas}
        evidencias={[]}
        hierarchy={[]}
        subTab="todos"
        setSubTab={vi.fn()}
        onSelect={vi.fn()}
        onCompare={vi.fn()}
      />,
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("busca pela mensagem de erro mesmo sem nome correspondente na hierarquia", async () => {
    renderFalhas();
    // Arvore comeca recolhida (comportamento original).
    expect(screen.queryByText("#3.1.1")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por ID/), { target: { value: "btnSalvar" } });
    await vi.advanceTimersByTimeAsync(300);

    expect(screen.getByText("Mostrando 1 de 3 falhas")).toBeInTheDocument();
    expect(await screen.findByText("#3.1.1")).toBeInTheDocument();
    expect(screen.queryByText("#3.1.2")).toBeNull();
  });

  it("alterna para lista e lembra a escolha", () => {
    const { unmount } = renderFalhas();
    fireEvent.click(screen.getByRole("button", { name: /Lista/ }));
    expect(screen.queryByText("Expandir tudo")).toBeNull();
    expect(screen.getAllByText("Detalhes")).toHaveLength(3);
    unmount();

    renderFalhas();
    expect(screen.getByRole("button", { name: /Lista/ })).toHaveAttribute("aria-pressed", "true");
  });
});
