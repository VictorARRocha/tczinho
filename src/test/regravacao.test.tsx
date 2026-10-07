import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { RegravacaoCandidatos, RegravacaoPedido } from "@/services/data";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: true, profile: { username: "ana", permissions: [] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = {
  candidatos: null as RegravacaoCandidatos | null,
  pedidos: [] as RegravacaoPedido[],
  createRegravacao: vi.fn(),
  cancelRegravacao: vi.fn(),
};
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchAllRuns: async () => [{ id_rodagem: "rod_1", versao: "PROXIMA", vm_name: "a07", sistema: "Tarefas", data_inicio: null, caminho_logs: null, total_falhas: 3, total_clusters: 0, created_at: null,
                                   repository_url: "https://svn/testcomplete/unico/ProjetoUnico/branches/minha-branch" }],
    fetchRegravacaoCandidatos: async () => api.candidatos,
    fetchRegravacoes: async () => api.pedidos,
    fetchEvidenceByRun: async () => [],
    fetchEvidenceByFailure: async () => [],
    fetchFailuresByRun: async () => [
      { id: "f1", id_caso_teste: "9.1.4.2.5", caso_teste_provavel: "Baixa automática de tarefas", tipo_ocorrencia: "report_difference" },
    ],
    createRegravacao: (...args: unknown[]) => api.createRegravacao(...args),
    cancelRegravacao: (...args: unknown[]) => api.cancelRegravacao(...args),
  };
});

import { queryClient } from "@/lib/queryClient";
import RegravarBases from "@/pages/RegravarBases";
import { branchTc, defaultCommitMessage, destinoLabel } from "@/lib/regravacao";

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

const item = (id: string, ct: string, caminho: string | null, regravavel: boolean, motivo: string | null = null) => ({
  difference_id: id, occurrence_id: "f1", id_caso_teste: ct, arquivo_base: id + "_Antigo.txt", arquivo_atual: id + "_Atual.txt",
  base_evidence_id: "eb_" + id, current_evidence_id: "ea_" + id, caminho_base: caminho, linhas_alteradas: 2,
  regravavel, motivo, motivo_texto: motivo ? "Motivo " + motivo : null,
});

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/regravar?rodagem=rod_1"]}>
        <RegravarBases />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const textarea = () => screen.getByLabelText("Mensagem do commit") as HTMLTextAreaElement;

beforeEach(() => {
  queryClient.clear();
  auth.isAdmin = true;
  auth.profile = { username: "ana", permissions: [] };
  api.pedidos = [];
  api.createRegravacao.mockReset();
  api.cancelRegravacao.mockReset();
  api.candidatos = {
    run_id: "rod_1",
    repository_url: "https://svn/testcomplete/unico/ProjetoUnico/branches/minha-branch",
    repository_revision: "23463",
    itens: [
      item("d1", "9.1.4.2.5", "Files\\Tarefas\\Processos\\Central de tarefas\\RelTarefas_248408 balancete.txt", true),
      item("d2", "9.1.4.2.5", "Files\\Tarefas\\Relatórios\\Relatório de tarefas\\RelatorioTarefa_232498.txt", true),
      item("d3", "9.1.4.2.5", "Files\\Tarefas\\x conferenci.txt", false, "caminho_nao_confirmado"),
    ],
  };
});
afterEach(() => vi.restoreAllMocks());

describe("mensagem padrao", () => {
  it("e identica a do RegravacaoBridge (default_commit_message)", () => {
    expect(defaultCommitMessage("rod_1", "ana", [{ id_caso_teste: "9.1.4.1.3", caminho_base: "Files\\Folha\\Rel\\A.txt" }])).toBe(
      "Regravação de bases pelo dashboard (AgenteTC)\n\nPedido: {pedido}\nRodagem: rod_1\nSolicitado por: ana\n\n" +
        "- CT 9.1.4.1.3: Files/Folha/Rel/A.txt",
    );
  });

  it("mostra o destino pela URL do SVN", () => {
    expect(destinoLabel("https://svn/x/ProjetoUnico/branches/minha%20branch")).toBe("branch minha branch");
    expect(destinoLabel("https://svn/x/ProjetoUnico/Unico")).toBe("principal (Unico)");
  });

  it("nome da branch do TC vem da URL do SVN, nao da versao testada", () => {
    expect(branchTc("https://svn/x/ProjetoUnico/branches/Proxima%2010.0")).toBe("Proxima 10.0");
    expect(branchTc("https://svn/x/ProjetoUnico/Unico/")).toBe("Unico");
    expect(branchTc(null)).toBeNull();
  });
});

describe("tela de regravacao", () => {
  it("lista os arquivos: so os regravaveis podem ser marcados e o motivo aparece nos outros", async () => {
    renderPage();
    expect(await screen.findByText("Caminho errado no script")).toBeInTheDocument();
    expect(screen.getByLabelText("Selecionar d3_Atual.txt")).toBeDisabled();
    expect(screen.getByLabelText("Selecionar d1_Atual.txt")).not.toBeDisabled();
    expect(screen.getByText("branch minha-branch")).toBeInTheDocument();
    // Versao testada (sistema) e branch do TC (SVN) aparecem separadas.
    expect(screen.getByText("Versão testada:")).toBeInTheDocument();
    expect(screen.getByText("PROXIMA")).toBeInTheDocument();
    expect(screen.getByText("Branch do TC (destino):")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rodagem" })).toHaveTextContent("TC: minha-branch");
    expect(screen.getByText(/2 de 3 regravável/)).toBeInTheDocument();
  });

  it("a mensagem vem com o padrao, acompanha a selecao ate ser editada e pode ser restaurada", async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText("Selecionar d1_Atual.txt"));
    expect(textarea().value).toContain("Pedido: {pedido}");
    expect(textarea().value).toContain("- CT 9.1.4.2.5: Files/Tarefas/Processos/Central de tarefas/RelTarefas_248408 balancete.txt");
    expect(textarea().value).not.toContain("RelatorioTarefa_232498");

    fireEvent.click(screen.getByLabelText("Selecionar d2_Atual.txt"));
    expect(textarea().value).toContain("Files/Tarefas/Relatórios/Relatório de tarefas/RelatorioTarefa_232498.txt");

    fireEvent.change(textarea(), { target: { value: "Minha mensagem" } });
    expect(screen.getByText("Editada")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Selecionar d2_Atual.txt")); // desmarca: nao mexe no texto editado
    expect(textarea().value).toBe("Minha mensagem");

    fireEvent.click(screen.getByRole("button", { name: /Restaurar padrão/ }));
    expect(textarea().value).toContain("balancete.txt");
    expect(textarea().value).not.toContain("RelatorioTarefa_232498");
    expect(screen.queryByText("Editada")).toBeNull();
  });

  it("envia os arquivos marcados com a mensagem que esta na tela", async () => {
    api.createRegravacao.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByLabelText("Selecionar d1_Atual.txt"));
    fireEvent.change(textarea(), { target: { value: "Ajuste esperado do relatório (#248408)\nPedido {pedido}" } });
    fireEvent.click(screen.getByRole("button", { name: /Regravar 1 arquivo/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Ajuste esperado do relatório/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar regravação" }));

    await waitFor(() => expect(api.createRegravacao).toHaveBeenCalledTimes(1));
    expect(api.createRegravacao).toHaveBeenCalledWith({
      run_id: "rod_1",
      difference_ids: ["d1"],
      mensagem: "Ajuste esperado do relatório (#248408)\nPedido {pedido}",
    });
  });

  it("quando o Bridge termina o pedido, a situacao dos arquivos e recarregada", async () => {
    const pedido = { id: "p1", run_id: "rod_1", requested_by: "ana", repository_url: "u", commit_message: null,
                     error_message: null, updated_at: "", finished_at: null, result_json: {}, svn_revision: null,
                     created_at: "2026-10-05T12:00:00Z", items_json: [] };
    api.pedidos = [{ ...pedido, status: "processando" }];
    api.candidatos!.itens[0] = { ...api.candidatos!.itens[0], regravavel: false, motivo: "em_andamento" };
    renderPage();
    expect(await screen.findByText("Pedido em andamento")).toBeInTheDocument();

    api.pedidos = [{ ...pedido, status: "concluido", svn_revision: "23501" }];
    api.candidatos!.itens[0] = { ...api.candidatos!.itens[0], motivo: "ja_regravado" };
    await queryClient.invalidateQueries({ queryKey: ["regravacoes", "rod_1"] });

    expect(await screen.findByText("Já regravado")).toBeInTheDocument();
    expect(screen.queryByText("Pedido em andamento")).toBeNull();
  });

  it("clicar no caso abre o painel do caso, como na aba Falhas", async () => {
    renderPage();
    const links = await screen.findAllByRole("button", { name: "9.1.4.2.5" });
    fireEvent.click(links[0]);
    // O painel e carregado sob demanda (lazy); com a suite em paralelo pode passar de 1s.
    expect(await screen.findByRole("dialog", {}, { timeout: 10000 })).toBeInTheDocument();
    expect(await screen.findByText(/Baixa automática de tarefas/, {}, { timeout: 10000 })).toBeInTheDocument();
  });

  it("ordena por caso, arquivo atual e base clicando no cabecalho", async () => {
    api.candidatos!.itens = [
      item("b_lanc", "2.5.1.1.12", "Files\\Fiscal\\c.txt", true),
      item("a_serv", "2.5.1.1.5", "Files\\Fiscal\\a.txt", true),
      item("c_outro", "2.5.2.1.13", null, false, "sem_manifesto"),
    ];
    renderPage();
    await screen.findByLabelText("Selecionar a_serv_Atual.txt");
    const ordem = () =>
      screen.getAllByRole("checkbox", { name: /^Selecionar / }).map((c) => c.getAttribute("aria-label")!.replace("Selecionar ", ""));

    fireEvent.click(screen.getByRole("button", { name: "Caso" }));
    expect(ordem()).toEqual(["a_serv_Atual.txt", "b_lanc_Atual.txt", "c_outro_Atual.txt"]);
    fireEvent.click(screen.getByRole("button", { name: "Caso" }));
    expect(ordem()).toEqual(["c_outro_Atual.txt", "b_lanc_Atual.txt", "a_serv_Atual.txt"]);

    fireEvent.click(screen.getByRole("button", { name: "Arquivo atual" }));
    expect(ordem()).toEqual(["a_serv_Atual.txt", "b_lanc_Atual.txt", "c_outro_Atual.txt"]);

    fireEvent.click(screen.getByRole("button", { name: "Base no repositório" }));
    expect(ordem()).toEqual(["a_serv_Atual.txt", "b_lanc_Atual.txt", "c_outro_Atual.txt"]); // sem base fica no fim
  });

  it("no celular mostra cartoes (sem tabela), ordena pela lista e a barra leva ao botao de regravar", async () => {
    const largura = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    try {
      api.candidatos!.itens = [
        item("b_lanc", "2.5.1.1.12", "Files\\Fiscal\\c.txt", true),
        item("a_serv", "2.5.1.1.5", "Files\\Fiscal\\a.txt", true),
      ];
      renderPage();
      await screen.findByLabelText("Selecionar a_serv_Atual.txt");
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByLabelText("Ordenar por")).toBeInTheDocument();
      expect(screen.queryByText(/Ir para regravar/)).toBeNull();

      fireEvent.click(screen.getByLabelText("Selecionar a_serv_Atual.txt"));
      expect(screen.getByRole("button", { name: /Ir para regravar/ })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: largura });
    }
  });

  it("sem a permissao de regravar: ve tudo, mas o botao fica bloqueado com o aviso", async () => {
    auth.isAdmin = false;
    auth.profile = { username: "ana", permissions: ["rodagem", "merge"] };
    renderPage();
    fireEvent.click(await screen.findByLabelText("Selecionar d1_Atual.txt"));
    expect(screen.getByRole("button", { name: /Regravar 1 arquivo/ })).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("Você não tem permissão para regravar arquivos");
  });

  it("usuario comum com a permissao de regravar consegue (antes era so admin)", async () => {
    auth.isAdmin = false;
    auth.profile = { username: "ana", permissions: ["regravar"] };
    renderPage();
    fireEvent.click(await screen.findByLabelText("Selecionar d1_Atual.txt"));
    expect(screen.getByRole("button", { name: /Regravar 1 arquivo/ })).not.toBeDisabled();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("conflito no SVN: status Conflito, aviso com o passo a passo manual e o arquivo bloqueado", async () => {
    api.pedidos = [{
      id: "p1", run_id: "rod_1", requested_by: "ana", status: "erro", commit_message: null, svn_revision: null,
      repository_url: "https://svn/testcomplete/unico/ProjetoUnico/branches/Proxima%2010.0",
      error_message: "Conflito no SVN: a base mudou depois da rodagem e nada foi gravado.",
      created_at: "2026-10-05T12:00:00Z", updated_at: "", finished_at: null,
      items_json: [{ difference_id: "d1", id_caso_teste: "9.1.4.2.5", arquivo_atual: "d1_Atual.txt", caminho_base: "Files/Tarefas/A.txt" }],
      result_json: { conflito: true, itens: [{ difference_id: "d1", caminho_base: "Files/Tarefas/A.txt", status: "base_mudou" }] },
    }];
    api.candidatos!.itens[0] = { ...api.candidatos!.itens[0], regravavel: false, motivo: "conflito_svn" };
    renderPage();

    const aviso = await screen.findByRole("alert");
    expect(within(aviso).getByText(/faça a regravação manualmente/)).toBeInTheDocument();
    expect(within(aviso).getByText("Files/Tarefas/A.txt")).toBeInTheDocument();
    expect(within(aviso).getByText("branch Proxima 10.0")).toBeInTheDocument();
    expect(within(aviso).getByText("SVN Update")).toBeInTheDocument();
    expect(screen.getAllByText("Conflito").length).toBeGreaterThan(0); // status do pedido
    expect(screen.getByText("Conflito no SVN")).toBeInTheDocument(); // situacao do arquivo
    expect(screen.getByLabelText("Selecionar d1_Atual.txt")).toBeDisabled();

    fireEvent.click(within(aviso).getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("erro que nao e conflito continua aparecendo como Erro, sem o aviso", async () => {
    api.pedidos = [{
      id: "p1", run_id: "rod_1", requested_by: "ana", status: "erro", commit_message: null, svn_revision: null,
      repository_url: "u", error_message: "Nao foi possivel baixar o arquivo atual", created_at: "2026-10-05T12:00:00Z",
      updated_at: "", finished_at: null, items_json: [], result_json: { conflito: false, itens: [] },
    }];
    renderPage();
    expect(await screen.findByText("Erro")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mostra os pedidos da rodagem e cancela o que esta na fila", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.cancelRegravacao.mockResolvedValue(undefined);
    const base = { run_id: "rod_1", requested_by: "ana", repository_url: "u", commit_message: null, error_message: null,
                   updated_at: "", finished_at: null, result_json: {}, svn_revision: null,
                   items_json: [{ difference_id: "d1", id_caso_teste: "9.1", arquivo_atual: "a", caminho_base: "Files/A.txt" }] };
    api.pedidos = [
      { ...base, id: "p1", status: "solicitado", created_at: "2026-10-05T12:00:00Z" },
      { ...base, id: "p2", status: "concluido", svn_revision: "23501", created_at: "2026-10-05T11:00:00Z" },
    ];
    renderPage();
    expect(await screen.findByText("r23501")).toBeInTheDocument();
    expect(screen.getByText("Na fila")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Cancelar/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/ }));
    await waitFor(() => expect(api.cancelRegravacao).toHaveBeenCalledWith("p1"));
  });
});
