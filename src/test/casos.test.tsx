import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { CasoDesativado, TestcaseHierarchyNode } from "@/services/data";
import type { Falha } from "@/types/db";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["rodagem"], modules: ["contabil"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = { desativados: [] as CasoDesativado[], desativar: vi.fn(), reativar: vi.fn() };
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchCasosDesativados: async () => api.desativados,
    desativarCaso: (...args: unknown[]) => api.desativar(...args),
    reativarCaso: (...args: unknown[]) => api.reativar(...args),
  };
});

import { queryClient } from "@/lib/queryClient";
import { CasosTab as Aba } from "@/pages/module/CasosTab";

function CasosTab(props: Omit<Parameters<typeof Aba>[0], "moduloSlug">) {
  return <Aba moduloSlug="contabil" {...props} />;
}

function renderAba(ui: ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  queryClient.clear();
  auth.isAdmin = false;
  auth.profile = { username: "ana", permissions: ["rodagem"], modules: ["contabil"] };
  api.desativados = [];
  api.desativar.mockReset();
  api.reativar.mockReset();
});

const no = (node_id: string, node_name: string, node_type: "grupo" | "caso", descricao = ""): TestcaseHierarchyNode => ({
  node_id, node_name, node_type, descricao,
  parent_node_id: node_id.includes(".") ? node_id.split(".").slice(0, -1).join(".") : null,
  full_path_ids: null, full_path_names: null, full_path_label: null, script_name: null, procedure_name: null,
  modulo_codigo: node_id.split(".")[0], modulo_nome: "Contábil", sistema: "Unico",
});

// [3] Contabil > [3.1] Contabil (pasta unica) > grupos de verdade
const ARVORE = [
  no("3", "Contábil", "grupo"),
  no("3.1", "Contábil", "grupo"),
  no("3.1.2", "Planos", "grupo"),
  no("3.1.2.1", "Plano de contas", "caso", "#171353 - Cadastra o plano e confere o balancete."),
  no("3.1.10", "Lançamentos", "grupo", "Rotinas de lançamento"),
  no("3.1.10.1", "Lançamento padrão", "caso"),
  no("3.1.10.2", "Lançamento em lote", "caso", "Importa um lote de lançamentos."),
  no("4", "Lalur", "grupo"),
  no("4.2", "Lalur Mensal", "grupo"),
  no("4.2.1", "Apuração mensal", "caso"),
];

const desativado = (node_id: string, reason = ""): CasoDesativado => ({
  node_id, module_slug: "contabil", reason, disabled_by: "bia", disabled_at: "2026-10-08T13:00:00+00:00",
});

const falha = { id: "f1", id_caso_teste: "3.1.10.2" } as Falha;

describe("aba Casos de teste", () => {
  it("mostra os grupos de verdade no primeiro nivel, em ordem numerica, com as contagens", () => {
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[falha]} onSelect={vi.fn()} />);
    expect(screen.getByText("4")).toBeInTheDocument(); // 4 casos
    const grupos = screen.getAllByRole("button", { expanded: false }).map((b) => b.textContent);
    // [3] e [3.1] (so repetem o nome do modulo) somem; 3.1.2 antes de 3.1.10.
    expect(grupos[0]).toMatch(/^\[3\.1\.2\]Planos/);
    expect(grupos[1]).toMatch(/^\[3\.1\.10\]Lançamentos.*1 com falha.*2 casos/);
    expect(grupos[2]).toMatch(/^\[4\.2\]Lalur Mensal/);
  });

  it("abre o grupo e mostra cada caso com o chamado separado da descricao", () => {
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[]} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    expect(screen.getByText("Plano de contas")).toBeInTheDocument();
    expect(screen.getByText("#171353")).toBeInTheDocument();
    expect(screen.getByText("Cadastra o plano e confere o balancete.")).toBeInTheDocument();
  });

  it("busca por numero, nome ou descricao (sem acento) e mostra o caminho", () => {
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[]} onSelect={vi.fn()} />);
    const busca = screen.getByRole("textbox", { name: "Buscar casos de teste" });
    fireEvent.change(busca, { target: { value: "lancamento" } });
    let lista = screen.getByRole("list", { name: "Casos encontrados" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(busca, { target: { value: "[4.2.1]" } });
    lista = screen.getByRole("list", { name: "Casos encontrados" });
    expect(within(lista).getByText("Apuração mensal")).toBeInTheDocument();
    expect(within(lista).getByText("Lalur Mensal")).toBeInTheDocument();
    fireEvent.change(busca, { target: { value: "nada disso" } });
    expect(screen.getByText("Nenhum caso encontrado.")).toBeInTheDocument();
  });

  it("so os que falharam, e o botao abre a falha do caso", () => {
    const onSelect = vi.fn();
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[falha]} onSelect={onSelect} />);
    expect(screen.getByText(/com falha nesta rodagem/)).toHaveTextContent("1 com falha nesta rodagem");
    fireEvent.click(screen.getByRole("button", { name: "Só os que falharam" }));
    const lista = screen.getByRole("list", { name: "Casos encontrados" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(within(lista).getByRole("button", { name: /Falhou/ }));
    expect(onSelect).toHaveBeenCalledWith(falha);
  });

  it("filtro dos desativados e a contagem", async () => {
    api.desativados = [desativado("3.1.10.1"), desativado("4.2.1", "sem massa")];
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[]} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Só os desativados" }));
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "2 desativados")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Casos encontrados" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByText("Apuração mensal")).toHaveClass("line-through");
    // A busca tambem acha pelo motivo.
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar casos de teste" }), { target: { value: "sem massa" } });
    expect(within(screen.getByRole("list", { name: "Casos encontrados" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("marca como desativado com motivo: fica riscado e mostra quem marcou", async () => {
    api.desativar.mockImplementation(async (id: string, motivo: string) => {
      api.desativados = [{ ...desativado(id, motivo), disabled_by: "ana" }];
      return api.desativados[0];
    });
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[]} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    const caixa = screen.getByRole("checkbox", { name: "Desativado [3.1.2.1]" });
    expect(caixa).toHaveAttribute("aria-checked", "false");
    fireEvent.click(caixa);
    fireEvent.change(await screen.findByRole("textbox", { name: "Motivo" }), { target: { value: "Aguardando o chamado #12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(api.desativar).toHaveBeenCalledWith("3.1.2.1", "Aguardando o chamado #12345"));
    expect(await screen.findByText(/Desativado por ana em .*: Aguardando o chamado #12345/)).toBeInTheDocument();
    expect(screen.getByText("Plano de contas")).toHaveClass("line-through");
    expect(screen.getByRole("checkbox", { name: "Desativado [3.1.2.1]" })).toHaveAttribute("aria-checked", "true");
  });

  it("desmarcar reativa na hora", async () => {
    api.desativados = [desativado("3.1.2.1")];
    api.reativar.mockImplementation(async () => { api.desativados = []; });
    renderAba(<CasosTab hierarchy={ARVORE} falhas={[]} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    const caixa = await screen.findByRole("checkbox", { name: "Desativado [3.1.2.1]", checked: true });
    fireEvent.click(caixa);
    await waitFor(() => expect(api.reativar).toHaveBeenCalledWith("3.1.2.1"));
    await waitFor(() => expect(screen.getByText("Plano de contas")).not.toHaveClass("line-through"));
  });

  it("sem a permissao de rodagem ou sem o modulo: nao marca, so ve o selo", async () => {
    api.desativados = [desativado("3.1.2.1", "motivo qualquer")];
    for (const perfil of [{ permissions: [], modules: ["contabil"] }, { permissions: ["rodagem"], modules: ["folha"] }]) {
      auth.profile = { username: "ana", ...perfil };
      const { unmount } = renderAba(<CasosTab hierarchy={ARVORE} falhas={[]} onSelect={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
      expect(await screen.findByText(/Desativado por bia/)).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.getByText("Desativado")).toBeInTheDocument();
      unmount();
    }
  });

  it("codigo do caso vira link do cartao no Kanboard (descricao, procedure ou nao informado)", () => {
    const arvore = [
      no("3", "Contábil", "grupo"),
      no("3.2", "Kanboard", "grupo"),
      no("3.2.1", "Com codigo", "caso", "#252397 - Confere o balancete, ver tambem #175763."),
      { ...no("3.2.2", "So na procedure", "caso"), procedure_name: "pConsultaFeriado_245993" },
      no("3.2.3", "Sem codigo", "caso", "Caso antigo, sem chamado."),
    ];
    renderAba(<CasosTab hierarchy={arvore} falhas={[]} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Kanboard/ }));
    const link = (nome: RegExp) => screen.getByRole("link", { name: nome });
    expect(link(/^#252397$/)).toHaveAttribute("href", "https://kanboard.sci.com.br/sprint/0/solicitacao/252397");
    expect(link(/^#252397$/)).toHaveAttribute("target", "_blank");
    expect(link(/^#245993$/)).toHaveAttribute("href", "https://kanboard.sci.com.br/sprint/0/solicitacao/245993");
    // Chamado citado no meio do texto tambem abre, mas nao vira o codigo do caso.
    expect(link(/^#175763$/)).toHaveAttribute("href", "https://kanboard.sci.com.br/sprint/0/solicitacao/175763");
    expect(screen.getAllByText("Código do caso de teste não informado")).toHaveLength(1);
    // A busca acha pelo codigo, inclusive o que so esta na procedure.
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar casos de teste" }), { target: { value: "245993" } });
    expect(within(screen.getByRole("list", { name: "Casos encontrados" })).getByText("So na procedure")).toBeInTheDocument();
  });

  it("sem a arvore (modulo sem rodagem com o .mds), explica", () => {
    renderAba(<CasosTab hierarchy={[]} falhas={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/aparece depois da próxima rodagem/)).toBeInTheDocument();
  });
});
