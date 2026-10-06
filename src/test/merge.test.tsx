import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { MergeBranches, MergePedido } from "@/services/data";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: false, profile: { username: "ana" } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const ROOT = "https://svn/testcomplete/unico/ProjetoUnico";
const UNICO = ROOT + "/Unico";
const PROXIMA = ROOT + "/branches/Proxima10_0";
const FOLHA = ROOT + "/branches/Folha_sustenta%C3%A7%C3%A3o";

const api = {
  branches: null as MergeBranches | null,
  merges: [] as MergePedido[],
  createMerge: vi.fn(),
  confirmMerge: vi.fn(),
  cancelMerge: vi.fn(),
};
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchMergeBranches: async () => api.branches,
    fetchMerges: async () => api.merges,
    createMerge: (...args: unknown[]) => api.createMerge(...args),
    confirmMerge: (...args: unknown[]) => api.confirmMerge(...args),
    cancelMerge: (...args: unknown[]) => api.cancelMerge(...args),
  };
});

import { queryClient } from "@/lib/queryClient";
import MergeBranchesPage from "@/pages/MergeBranches";
import { combinaBusca, ordenarBranches } from "@/lib/merge";

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

function pedido(extra: Partial<MergePedido>): MergePedido {
  return {
    id: "m1", status: "previa_solicitada", requested_by: "ana", source_url: UNICO, source_name: "Unico",
    target_url: PROXIMA, target_name: "Proxima10_0", target_kind: "branch", commit_message: null, preview_json: {},
    result_json: {}, svn_revision: null, error_message: null, confirmed_by: null, confirmed_at: null,
    created_at: new Date().toISOString(), updated_at: "", finished_at: null, ...extra,
  };
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><MergeBranchesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function escolher(label: RegExp, busca: string, opcao: RegExp) {
  fireEvent.click(await screen.findByRole("combobox", { name: label }));
  fireEvent.change(await screen.findByLabelText("Buscar branch"), { target: { value: busca } });
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

beforeEach(() => {
  queryClient.clear();
  auth.isAdmin = false;
  api.merges = [];
  api.branches = {
    updated_at: "2026-10-06T12:00:00Z",
    branches: [
      { name: "Proxima10_0", url: PROXIMA, kind: "branch", last_revision: "23500", last_author: "victor" },
      { name: "Folha_sustentação", url: FOLHA, kind: "branch" },
      { name: "Unico", url: UNICO, kind: "trunk", last_revision: "23553" },
    ],
  };
  api.createMerge.mockReset();
  api.confirmMerge.mockReset();
  api.cancelMerge.mockReset();
});

describe("regras", () => {
  it("principal primeiro, depois as que nao comecam com numero e por fim as numericas; busca sem acento", () => {
    const nomes = ["2026_Folha", "Proxima10_0", "10.0_Fiscal", "Unico", "Folha_sustentação", "abc"];
    const lista = nomes.map((name) => ({ name, url: ROOT + "/" + name, kind: name === "Unico" ? ("trunk" as const) : ("branch" as const) }));
    expect(ordenarBranches(lista).map((b) => b.name)).toEqual(["Unico", "abc", "Folha_sustentação", "Proxima10_0", "10.0_Fiscal", "2026_Folha"]);
    expect(combinaBusca("Folha_sustentação", "SUSTENTACAO")).toBe(true);
    expect(combinaBusca("Proxima10_0", "folha")).toBe(false);
  });
});

describe("tela de merge", () => {
  it("origem vem com a Unico; escolhe o destino e um botao so faz o merge direto (sem previa)", async () => {
    api.createMerge.mockResolvedValue(pedido({ status: "solicitado" }));
    renderPage();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /Origem/ })).toHaveTextContent("Unico"));
    await escolher(/Destino/, "proxima", /Proxima10_0/);
    expect((screen.getByLabelText("Mensagem do commit") as HTMLTextAreaElement).value).toBe("Merge de Unico para Proxima10_0 pelo dashboard (AgenteTC)");
    fireEvent.click(screen.getByRole("button", { name: /Fazer merge de Unico → Proxima10_0/ }));
    await waitFor(() => expect(api.createMerge).toHaveBeenCalledWith({
      source_url: UNICO, target_url: PROXIMA, direto: true, mensagem: undefined, confirma_trunk: undefined,
    }));
    expect(screen.queryByText(/Revisões que vão entrar/)).toBeNull();
  });

  it("a mensagem editada vai junto com o pedido e pode voltar para a padrao", async () => {
    api.createMerge.mockResolvedValue(pedido({ status: "solicitado" }));
    renderPage();
    await escolher(/Destino/, "proxima", /Proxima10_0/);
    const mensagem = screen.getByLabelText("Mensagem do commit") as HTMLTextAreaElement;
    fireEvent.change(mensagem, { target: { value: "Atualiza a Proxima" } });
    fireEvent.click(screen.getByRole("button", { name: /Restaurar padrão/ }));
    expect(mensagem.value).toContain("Merge de Unico para Proxima10_0");
    fireEvent.change(mensagem, { target: { value: "Atualiza a Proxima" } });
    fireEvent.click(screen.getByRole("button", { name: /Fazer merge de/ }));
    await waitFor(() => expect(api.createMerge).toHaveBeenCalledWith(expect.objectContaining({ direto: true, mensagem: "Atualiza a Proxima" })));
  });

  it("Enter na busca escolhe a primeira branch encontrada", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("combobox", { name: /Destino/ }));
    const busca = await screen.findByLabelText("Buscar branch");
    fireEvent.change(busca, { target: { value: "sustentacao" } });
    fireEvent.keyDown(busca, { key: "Enter" });
    expect(screen.getByRole("combobox", { name: /Destino/ })).toHaveTextContent("Folha_sustentação");
  });

  it("destino Unico: o botao so libera depois de marcar que entende o risco", async () => {
    api.createMerge.mockResolvedValue(pedido({ status: "solicitado" }));
    renderPage();
    await escolher(/Destino/, "proxima", /Proxima10_0/);
    fireEvent.click(screen.getByRole("button", { name: "Inverter origem e destino" }));
    expect(screen.getByRole("combobox", { name: /Origem/ })).toHaveTextContent("Proxima10_0");
    expect(screen.getByRole("combobox", { name: /Destino/ })).toHaveTextContent("Unico");
    expect(screen.getByText(/o merge altera a base usada por todos/)).toBeInTheDocument();
    const fazer = screen.getByRole("button", { name: /Fazer merge de Proxima10_0 → Unico/ });
    expect(fazer).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo alterar a principal" }));
    expect(fazer).not.toBeDisabled();
    fireEvent.click(fazer);
    await waitFor(() => expect(api.createMerge).toHaveBeenCalledWith(expect.objectContaining({ target_url: UNICO, confirma_trunk: true })));
  });

  it("sem lista de branches explica que o MergeBridge nao enviou", async () => {
    api.branches = { branches: [], updated_at: null };
    renderPage();
    expect(await screen.findByText(/ainda não enviou a lista de branches/)).toBeInTheDocument();
  });

  it("varios merges de uma vez, sem repetir a mesma linha; cada um com a sua mensagem", async () => {
    api.createMerge.mockImplementation(async (body: { target_url: string }) => pedido({ id: "novo-" + body.target_url, target_url: body.target_url, status: "solicitado" }));
    renderPage();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^Origem/ })).toHaveTextContent("Unico"));
    await escolher(/^Destino \(branch/, "proxima", /Proxima10_0/);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar merge/ }));
    expect(screen.getByRole("combobox", { name: "Origem do merge 2" })).toHaveTextContent("Unico");
    await escolher(/^Destino do merge 2/, "proxima", /Proxima10_0/);
    expect(screen.getAllByText("Este merge está repetido na lista.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Fazer os 2 merges" })).toBeDisabled();

    await escolher(/^Destino do merge 2/, "folha", /Folha_sustentação/);
    fireEvent.change(screen.getByLabelText("Mensagem do commit do merge 2"), { target: { value: "Folha com a Unico" } });
    fireEvent.click(screen.getByRole("button", { name: "Fazer os 2 merges" }));
    await waitFor(() => expect(api.createMerge).toHaveBeenCalledTimes(2));
    expect(api.createMerge).toHaveBeenNthCalledWith(1, expect.objectContaining({ source_url: UNICO, target_url: PROXIMA, direto: true, mensagem: undefined }));
    expect(api.createMerge).toHaveBeenNthCalledWith(2, expect.objectContaining({ source_url: UNICO, target_url: FOLHA, direto: true, mensagem: "Folha com a Unico" }));
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Origem do merge 2" })).toBeNull());
  });

  it("um merge recusado fica na lista para tentar de novo; os outros seguem", async () => {
    api.createMerge
      .mockRejectedValueOnce(new Error("Ja existe um merge em andamento"))
      .mockResolvedValueOnce(pedido({ id: "m2", target_url: FOLHA, status: "solicitado" }));
    renderPage();
    await escolher(/^Destino \(branch/, "proxima", /Proxima10_0/);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar merge/ }));
    await escolher(/^Destino do merge 2/, "folha", /Folha_sustentação/);
    fireEvent.click(screen.getByRole("button", { name: "Fazer os 2 merges" }));
    await waitFor(() => expect(api.createMerge).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^Destino \(branch/ })).toHaveTextContent("Proxima10_0"));
    expect(screen.queryByRole("combobox", { name: "Destino do merge 2" })).toBeNull();
  });

  it("acompanhamento: na fila, fazendo e concluido com a revisao", async () => {
    api.merges = [pedido({ status: "solicitado" })];
    renderPage();
    expect(await screen.findByText(/Na fila do MergeBridge/)).toBeInTheDocument();
    api.merges = [pedido({ status: "processando" })];
    await queryClient.invalidateQueries({ queryKey: ["merges"] });
    expect(await screen.findByText(/atualizando a origem, fazendo o merge e o commit/)).toBeInTheDocument();
    api.merges = [pedido({ status: "concluido", svn_revision: "23560" })];
    await queryClient.invalidateQueries({ queryKey: ["merges"] });
    expect(await screen.findByText("r23560", { selector: "span" })).toBeInTheDocument();
  });

  it("conflito barra so aquele merge e pede o merge manual", async () => {
    api.merges = [
      pedido({ id: "m1", status: "processando" }),
      pedido({ id: "m2", status: "solicitado", target_url: FOLHA, target_name: "Folha_sustentação" }),
    ];
    renderPage();
    expect(await screen.findAllByLabelText("Merge aberto")).toHaveLength(2);
    api.merges = [
      pedido({ id: "m1", status: "conflito", result_json: { conflitos: [{ caminho: "Script/Rotinas.sd", tipo: "texto" }] }, error_message: "Conflito no merge" }),
      pedido({ id: "m2", status: "concluido", svn_revision: "23561", target_url: FOLHA, target_name: "Folha_sustentação" }),
    ];
    await queryClient.invalidateQueries({ queryKey: ["merges"] });
    const aviso = await screen.findByRole("alert");
    expect(within(aviso).getByText(/faça o merge manualmente/)).toBeInTheDocument();
    expect(within(aviso).getByText("Script/Rotinas.sd")).toBeInTheDocument();
    expect(within(aviso).queryByText(/Merge a range of revisions/)).toBeNull(); // sem o passo a passo
    expect(aviso.className).toContain("border-red-500");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("r23561", { selector: "span" })).toBeInTheDocument();
  });

  it("merges ja terminados nao abrem sozinhos ao entrar na tela; ficam so no historico", async () => {
    api.merges = [
      pedido({ id: "m1", status: "concluido", svn_revision: "23560" }),
      pedido({ id: "m2", status: "conflito", target_url: FOLHA, target_name: "Folha_sustentação" }),
      pedido({ id: "m3", status: "solicitado", requested_by: "joao" }), // de outra pessoa
    ];
    renderPage();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByLabelText("Merge aberto")).toBeNull();
  });

  it("fechar um merge em andamento nao reabre na proxima atualizacao", async () => {
    api.merges = [pedido({ status: "processando" })];
    renderPage();
    const painel = await screen.findByLabelText("Merge aberto");
    fireEvent.click(within(painel).getByRole("button", { name: "Fechar" }));
    await queryClient.invalidateQueries({ queryKey: ["merges"] });
    await waitFor(() => expect(screen.queryByLabelText("Merge aberto")).toBeNull());
  });

  it("historico com o resultado (merge realizado ou conflito), sem Revisao e Abrir", async () => {
    api.merges = [
      pedido({ id: "m1", status: "concluido", svn_revision: "23560", requested_by: "joao" }),
      pedido({ id: "m2", status: "conflito", target_url: FOLHA, target_name: "Folha_sustentação", requested_by: "joao" }),
    ];
    renderPage();
    const tabela = await screen.findByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Data/hora", "Origem → destino", "Solicitado por", "Resultado"]);
    expect(within(tabela).getAllByText("joao")).toHaveLength(2);
    expect(within(tabela).getByText("Merge realizado")).toBeInTheDocument();
    expect(within(tabela).getByText("Conflito")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("cancelar: quem pediu cancela o que ainda esta na fila", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.cancelMerge.mockResolvedValue(undefined);
    api.merges = [pedido({ status: "solicitado" })];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Cancelar/ }));
    await waitFor(() => expect(api.cancelMerge).toHaveBeenCalledWith("m1"));
  });
});
