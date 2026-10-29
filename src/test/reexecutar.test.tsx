import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CasoReexecutavel, RodagemListItem } from "@/services/data";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["rodagem"] as string[], modules: ["*"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const run = (id: string, vm: string, versao: string, slug: string, data: string, falhas: number) =>
  ({ id_rodagem: id, vm_name: vm, versao, modulo_slug: slug, sistema: slug, data_inicio: data, caminho_logs: `\\\\${vm}\\logs`, total_falhas: falhas, total_clusters: 1, created_at: data }) as RodagemListItem;

const caso = (id: string, nome: string, tipo: CasoReexecutavel["tipo_ocorrencia"]) =>
  ({ id_falha: `f${id}`, id_caso_teste: id, nome_mds: nome, grupo: "Cadastros", arquivo_origem: null, cluster_id: "c1", cluster_status: null, cluster_titulo: null, cluster_assinatura: null, tipo_ocorrencia: tipo }) as CasoReexecutavel;

const api = {
  createRerunRequest: vi.fn(),
  historico: [] as Record<string, unknown>[],
  casos: null as CasoReexecutavel[] | null,
};
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchAllRuns: async () => [
      run("rod_a08", "a08", "PROXIMA1.26.10.0", "contabil", "2026-10-14T06:10:00-03:00", 2),
      run("rod_a05", "a05n", "FOLHA_SUSTENTACAO_2026", "folha", "2026-10-14T05:52:00-03:00", 1),
      run("rod_a08_pre", "a08", "PRE-CLIENTES", "contabil", "2026-10-13T06:10:00-03:00", 1),
      run("rod_a08_old", "a08", "PROXIMA1.26.9.99", "contabil", "2026-10-12T06:10:00-03:00", 1),
    ],
    fetchCasosReexecutaveis: async (runId: string) =>
      api.casos ?? (runId === "rod_a08"
        ? [caso("3.1.1", "Cadastro de sócio", "quebra"), caso("3.2.4", "Lançamento em lote", "diferenca")]
        : [caso("1.1.1", "Admissão", "quebra")]),
    fetchRerunRequests: async () => api.historico,
    createRerunRequest: (...args: unknown[]) => api.createRerunRequest(...args),
  };
});

import { queryClient } from "@/lib/queryClient";
import { ordenarVersoes } from "@/lib/rodagemTexto";
import ReexecutarTestes from "@/pages/ReexecutarTestes";

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

beforeEach(() => {
  queryClient.clear();
  api.createRerunRequest.mockReset().mockResolvedValue({ id: "req1" });
  api.historico = [];
  api.casos = null;
});

function renderPagina(rota = "/jenkins/reexecutar") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rota]}><ReexecutarTestes /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function abrirSelect(nome: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: nome }), { key: "ArrowDown" });
  return screen.findByRole("listbox");
}

/** Etapa 1 -> 2 -> marca "Cadastro de sócio" -> 3. */
async function irParaConfirmacao() {
  renderPagina();
  await screen.findAllByRole("radio");
  fireEvent.click(screen.getByRole("button", { name: /Escolher casos/ }));
  fireEvent.click(await screen.findByText("Cadastro de sócio"));
  fireEvent.click(screen.getByRole("button", { name: /Revisar/ }));
  await screen.findByRole("heading", { name: "Confirme o pedido" });
}

describe("Reexecutar rodagens (etapas)", () => {
  it("etapa 1: lista as rodagens com VM e versao; a primeira ja vem escolhida", async () => {
    renderPagina();
    // Primeiro teste do arquivo: com a suite inteira rodando, o primeiro carregamento pode passar de 1s.
    const radios = await screen.findAllByRole("radio", {}, { timeout: 5000 });
    expect(radios).toHaveLength(4);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(within(radios[0]).getByText("A08")).toBeInTheDocument();
    expect(within(radios[0]).getByText("Próxima 10.0")).toHaveAttribute("title", "PROXIMA1.26.10.0");
    expect(within(radios[1]).getByText("Folha Sustentação 2026")).toBeInTheDocument();
    expect(screen.getByText("Selecionada:").parentElement).toHaveTextContent("PROXIMA1.26.10.0");
    // Casos e confirmacao ficam nas proximas etapas.
    expect(screen.queryByText("Cadastro de sócio")).toBeNull();
    expect(screen.queryByRole("button", { name: /Rodar/ })).toBeNull();
  });

  it("ver falhas leva a rodagem marcando que veio da reexecucao", async () => {
    renderPagina();
    await screen.findAllByRole("radio");
    expect(screen.getByRole("link", { name: /Ver falhas desta rodagem/ }))
      .toHaveAttribute("href", "/modulo/contabil?run=rod_a08&tab=falhas&origem=reexecucao");
  });

  it("volta da rodagem com ?run=: a mesma rodagem ja vem escolhida", async () => {
    renderPagina("/jenkins/reexecutar?run=rod_a08_pre");
    const radios = await screen.findAllByRole("radio");
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Selecionada:").parentElement).toHaveTextContent("PRE-CLIENTES");
  });

  it("historico de reexecucoes em paginas de 10, sem o ocultar finalizadas", async () => {
    api.historico = Array.from({ length: 12 }, (_, n) => ({
      id: `p${n}`, created_at: "2026-10-14T10:00:00Z", status: "finalizado_sucesso", vm_name: "a08", versao: "PROXIMA", casos_teste: "[3.1.1]", config_json: {},
    }));
    renderPagina();
    await screen.findAllByRole("radio");
    expect(screen.queryByRole("button", { name: /Ocultar finalizadas/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Histórico de reexecuções" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));
    expect(await screen.findByText("Mostrando 1–10 de 12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.getByText("Mostrando 11–12 de 12")).toBeInTheDocument();
  });

  it("versoes: Proxima (mais nova primeiro), depois Pre-clientes, depois o resto", () => {
    expect(ordenarVersoes(["FOLHA_SUSTENTACAO_2026", "PRE-CLIENTES", "PROXIMA1.26.9.99", "CONTABIL_DERE", "PROXIMA1.26.10.0"]))
      .toEqual(["PROXIMA1.26.10.0", "PROXIMA1.26.9.99", "PRE-CLIENTES", "CONTABIL_DERE", "FOLHA_SUSTENTACAO_2026"]);
  });

  it("filtro so por VM (o de versao saiu)", async () => {
    renderPagina();
    await screen.findAllByRole("radio");
    expect(screen.queryByRole("combobox", { name: "Filtrar por versão" })).toBeNull();
    const lista = await abrirSelect("Filtrar por VM");
    fireEvent.click(within(lista).getByText("A08"));
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
  });

  it("etapa 2: contagens no 'Marcar so', marcar todos e 'Revisar' so com caso marcado", async () => {
    renderPagina();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /Escolher casos/ }));
    await screen.findByText("Cadastro de sócio");
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Quebras \(1\)/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Quebra \+ diferença \(0\)/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
    expect(screen.getByText(/de 2 marcados/)).toHaveTextContent("2 de 2 marcados");
    expect(screen.getByRole("button", { name: /Revisar/ })).toBeEnabled();
  });

  it("etapa 3: mostra o codigo com o nome e envia para a VM da rodagem", async () => {
    await irParaConfirmacao();
    const lista = screen.getByRole("list", { name: "Casos do pedido" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    expect(within(lista).getByRole("listitem")).toHaveTextContent("3.1.1Cadastro de sócio");
    expect(screen.queryByLabelText("Reexecutar casos em uma VM específica")).toBeNull();
    expect(screen.getByText(/Vai rodar na/)).toHaveTextContent("Vai rodar na A08 (a da rodagem)");
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({
      vm_name: "a08", versao: "proxima1.26.10.0", casos_teste: "[3.1.1]", ct_desmarcar: "[0.3]", branch: "", source_run_id: "rod_a08",
    });
    // Depois de enviar volta para a etapa 1.
    expect(await screen.findByRole("heading", { name: "Escolha a rodagem" })).toBeInTheDocument();
  });

  it("manter base atual (desligado por padrao) desmarca [0.4] e [0.5]", async () => {
    await irParaConfirmacao();
    const manter = screen.getByRole("checkbox", { name: /Manter base atual/ });
    expect(manter).not.toBeChecked();
    fireEvent.click(manter);
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({ casos_teste: "[3.1.1]", ct_desmarcar: "[0.3], [0.4], [0.5]" });
  });

  it("VM especifica: so troca o vm_name do pedido", async () => {
    await irParaConfirmacao();
    fireEvent.click(screen.getByRole("button", { name: /Opções avançadas/ }));
    const opcao = screen.getByRole("checkbox", { name: "Reexecutar casos em uma VM específica" });
    expect(opcao).not.toBeChecked();
    fireEvent.click(opcao);
    expect(screen.getByRole("button", { name: /Rodar 1 caso de novo/ })).toBeDisabled();
    const lista = await abrirSelect("VM para reexecutar");
    expect(within(lista).queryByText("A08")).toBeNull(); // a VM da propria rodagem nao aparece
    fireEvent.click(within(lista).getByText("A03"));
    expect(screen.getByText(/Vai rodar na/)).toHaveTextContent("Vai rodar na A03 (escolhida)");
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({
      vm_name: "a03", versao: "proxima1.26.10.0", casos_teste: "[3.1.1]",
    });
  });

  it("outra versao: so troca a versao do pedido (sugere as que ja rodaram)", async () => {
    await irParaConfirmacao();
    fireEvent.click(screen.getByRole("button", { name: /Opções avançadas/ }));
    const opcao = screen.getByRole("checkbox", { name: "Reexecutar casos em outra versão" });
    expect(opcao).not.toBeChecked();
    fireEvent.click(opcao);
    expect(screen.getByRole("button", { name: /Rodar 1 caso de novo/ })).toBeDisabled();
    expect(screen.getByText("Informe a versão nas opções avançadas.")).toBeInTheDocument();
    const sugestoes = Array.from(document.querySelectorAll("#versoes-reexecucao option")).map((o) => o.getAttribute("value"));
    expect(sugestoes).toEqual(["PROXIMA1.26.9.99", "PRE-CLIENTES", "FOLHA_SUSTENTACAO_2026"]); // sem a da rodagem
    fireEvent.change(screen.getByRole("combobox", { name: "Versão para reexecutar" }), { target: { value: " Clientes " } });
    expect(screen.getByText(/Vai rodar na/)).toHaveTextContent("Vai rodar na A08, versão clientes");
    expect(screen.getByText(/Só a versão muda no pedido/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({ vm_name: "a08", versao: "clientes", casos_teste: "[3.1.1]" });
  });

  it("financeiro: inclui o [5.0] Configura base no pedido", async () => {
    api.casos = [caso("5.1.2", "Cadastro de sócio", "quebra")];
    await irParaConfirmacao();
    expect(screen.getByText(/Configura base/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({ casos_teste: "[5.0], [5.1.2]" });
  });

  it("financeiro com base mantida nao manda o [5.0]", async () => {
    api.casos = [caso("5.1.2", "Cadastro de sócio", "quebra")];
    await irParaConfirmacao();
    fireEvent.click(screen.getByRole("checkbox", { name: /Manter base atual/ }));
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({ casos_teste: "[5.1.2]" });
  });

  it("rodagem PRE-CLIENTES vai no pedido como pre-cliente (nome que o Gerenciador conhece)", async () => {
    await irParaConfirmacao();
    fireEvent.click(screen.getByRole("button", { name: /Opções avançadas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Reexecutar casos em outra versão" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Versão para reexecutar" }), { target: { value: "PRE-CLIENTES" } });
    fireEvent.click(screen.getByRole("button", { name: /Rodar 1 caso de novo/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest.mock.calls[0][0]).toMatchObject({ versao: "pre-cliente" });
  });

  it("voltar e trocar de rodagem limpa as marcacoes e desliga a VM especifica", async () => {
    await irParaConfirmacao();
    fireEvent.click(screen.getByRole("button", { name: /Opções avançadas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Reexecutar casos em uma VM específica" }));
    fireEvent.click(screen.getByRole("button", { name: /Rodagem/ }));
    fireEvent.click(screen.getAllByRole("radio")[1]);
    // Sem caso marcado a etapa 3 fica bloqueada.
    expect(screen.getByRole("button", { name: /Confirmar/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Escolher casos/ }));
    fireEvent.click(await screen.findByText("Admissão"));
    fireEvent.click(screen.getByRole("button", { name: /Revisar/ }));
    // As opcoes avancadas continuam abertas, mas a VM especifica voltou a ficar desligada.
    expect(await screen.findByRole("checkbox", { name: "Reexecutar casos em uma VM específica" })).not.toBeChecked();
  });
});

describe("auditoria parte 3: reexecucao", () => {
  it("historico com o status em portugues e sem as rodagens completas", async () => {
    api.historico = [
      { id: "p1", created_at: "2026-10-14T10:00:00Z", status: "na_fila", tipo_solicitacao: "reexecucao", vm_name: "a08", versao: "PROXIMA", casos_teste: "[3.1.1]", config_json: {} },
      { id: "p2", created_at: "2026-10-14T09:00:00Z", status: "finalizado_sucesso", tipo_solicitacao: "rodagem_completa", vm_name: "a08", versao: "PROXIMA", casos_teste: "[3]", config_json: {} },
    ];
    renderPagina();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));
    expect(await screen.findByRole("progressbar", { name: "Progresso: Na fila" })).toBeInTheDocument();
    expect(screen.queryByText("na_fila")).toBeNull();
    expect(screen.queryByText("Finalizado")).toBeNull();
  });

  it("lista de rodagens: uma parada de Tab e setas para trocar", async () => {
    renderPagina();
    const radios = await screen.findAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    await waitFor(() => expect(screen.getAllByRole("radio")[1]).toHaveAttribute("aria-checked", "true"));
  });

  it("trocar de etapa leva o foco ao titulo; cada caso tem nome", async () => {
    renderPagina();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /Escolher casos/ }));
    const titulo = await screen.findByRole("heading", { name: "Marque os casos para rodar de novo" });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(await screen.findByRole("checkbox", { name: /Marcar 3\.1\.1 Cadastro de sócio/ })).toBeInTheDocument();
  });
});
