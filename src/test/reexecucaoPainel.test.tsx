import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Falha, Modulo, Rodagem } from "@/types/db";
import type { ResultadoReexecucao } from "@/services/data";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, profile: { username: "ana", modules: ["*"] } }) }));

const ORIGEM = "rod_origem";
const REEXEC = "rod_reexec";
const falha = (id: string, caso: string, erro: string) =>
  ({ id, id_caso_teste: caso, caso_teste_provavel: `Caso ${caso}`, erro_principal: erro, mensagem_principal: erro }) as unknown as Falha;
const rodagem = { id: ORIGEM, modulo_slug: "contabil", versao_sistema: "PROXIMA1.26.11.0", data_inicio_rodagem: "2026-11-02T18:00:00-03:00",
  data_analise: "2026-11-03T08:00:00-03:00", total_falhas: 2 } as unknown as Rodagem;
const falhasPorRodagem: Record<string, Falha[]> = {
  [ORIGEM]: [falha("f1", "3.1.1", "Erro na rodagem original"), falha("f2", "3.1.2", "Outro erro original")],
  [REEXEC]: [falha("r1", "3.1.1", "Erro na reexecucao")],
};
const reexecucoes: ResultadoReexecucao[] = [{
  pedido_id: "p1", criado_em: "2026-11-03T09:25:00-03:00", vm_name: "a08", versao: "proxima1.26.11.0", status: "finalizado_ocorrencias",
  rodagem_id: REEXEC, casos: { "3.1.1": { resultado: "quebrou_de_novo", tipo: "quebra" }, "3.1.2": { resultado: "passou" } },
}];

vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchModules: async () => [{ id: "mod_contabil", slug: "contabil", nome: "Contábil" } as Modulo],
    fetchLatestRunsByModule: async () => [],
    fetchRunsByModule: async () => [rodagem],
    fetchRunById: async () => rodagem,
    fetchFailuresByRun: async (runId: string) => falhasPorRodagem[runId] || [],
    fetchEvidenceByRun: async () => [],
    fetchEvidenceByFailure: async () => [],
    fetchGroupsByRun: async () => [],
    fetchNextStepsByRun: async () => [],
    fetchPerformanceByRun: async () => [],
    fetchGroupLinksByRun: async () => [],
    fetchTestcaseHierarchy: async () => [],
    fetchResultadosReexecucao: async () => reexecucoes,
    fetchCasosInstaveis: async () => ({}),
  };
});

import { queryClient } from "@/lib/queryClient";
import ModulePage from "@/pages/ModulePage";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

async function abrirAbaFalhas() {
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /^Falhas/ }), { button: 0 });
}

function renderPagina() {
  window.localStorage.setItem("agenttc.falhas.view", "lista");
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/modulo/contabil"]}>
        <Routes><Route path="/modulo/:slug/:rodagemSlug?" element={<ModulePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("painel do caso nas reexecucoes", () => {
  it("o selo abre o painel na reexecucao; da para voltar para a execucao original e o caso que passou explica", async () => {
    queryClient.clear();
    renderPagina();
    await abrirAbaFalhas();

    // Caso que quebrou de novo: abre ja na reexecucao, com o erro dela.
    fireEvent.click(await screen.findByRole("button", { name: "Reexecutado com falha" }));
    const painel = await screen.findByRole("dialog");
    const abas = within(painel).getByRole("tablist", { name: "Execuções deste caso" });
    expect(within(abas).getAllByRole("tab")).toHaveLength(2);
    expect(within(abas).getByRole("tab", { selected: true })).toHaveTextContent(/^Reexecução · /);
    expect(await within(painel).findByText("Erro na reexecucao")).toBeInTheDocument();

    // Volta para a execucao original e vai de novo para a reexecucao.
    fireEvent.click(within(abas).getByRole("tab", { name: /Execução original/ }));
    expect(await within(painel).findByText("Erro na rodagem original")).toBeInTheDocument();
    fireEvent.click(within(abas).getByRole("tab", { name: /^Reexecução · / }));
    expect(await within(painel).findByText("Erro na reexecucao")).toBeInTheDocument();
  });

  it("aba Falhas leva a rodagem aberta para a Regravacao e para a Reexecucao", async () => {
    queryClient.clear();
    renderPagina();
    await abrirAbaFalhas();
    expect(await screen.findByRole("link", { name: /Regravar arquivos/ })).toHaveAttribute("href", `/regravar?rodagem=${ORIGEM}`);
    expect(screen.getByRole("link", { name: /Reexecutar casos/ })).toHaveAttribute("href", `/jenkins/reexecutar?run=${ORIGEM}`);
  });

  it("caso que passou na reexecucao: o painel diz que passou, sem evidencias", async () => {
    queryClient.clear();
    renderPagina();
    await abrirAbaFalhas();
    fireEvent.click(await screen.findByRole("button", { name: "Reexecutado com sucesso" }));
    const painel = await screen.findByRole("dialog");
    expect(await within(painel).findByText("Passou nesta reexecução")).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("tab", { name: /Execução original/ }));
    expect(await within(painel).findByText("Outro erro original")).toBeInTheDocument();
  });
});
