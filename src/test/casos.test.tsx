import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { CasoDesativado, TestcaseHierarchyNode } from "@/services/data";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["rodagem"], modules: ["contabil"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = { desativados: [] as CasoDesativado[] };
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchCasosDesativados: async () => api.desativados,
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
  api.desativados = [];
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

const MOTIVO = "Desmarcado em toda rodagem pelo mod_xml.py (exceto na A09)";
const desativado = (node_id: string, disabled_by = "mod_xml"): CasoDesativado => ({
  node_id, module_slug: "contabil", reason: MOTIVO, disabled_by, disabled_at: "2026-10-08T13:00:00+00:00",
});

/** Abre a linha do caso (descricao e Kanboard ficam ali dentro). */
function abrirCaso(id: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + id.replace(/\./g, "\\.") + "(?!\\.)") }));
}

describe("Casos de teste (lista do modulo)", () => {
  it("mostra os grupos de verdade no primeiro nivel, em ordem numerica, com a contagem de casos", () => {
    renderAba(<CasosTab hierarchy={ARVORE} />);
    expect(screen.getByText("4")).toBeInTheDocument(); // 4 casos
    const grupos = screen.getAllByRole("button", { expanded: false }).map((b) => b.textContent);
    // [3] e [3.1] (so repetem o nome do modulo) somem; 3.1.2 antes de 3.1.10.
    expect(grupos[0]).toMatch(/^3\.1\.2Planos/);
    expect(grupos[1]).toMatch(/^3\.1\.10Lançamentos2 casos$/);
    expect(grupos[2]).toMatch(/^4\.2Lalur Mensal/);
  });

  it("sem nada de falhas: e so a lista dos casos atuais", () => {
    renderAba(<CasosTab hierarchy={ARVORE} />);
    expect(screen.queryByText(/falh/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /falharam/ })).toBeNull();
  });

  it("caso em uma linha; clicar abre a descricao com o chamado separado", () => {
    renderAba(<CasosTab hierarchy={ARVORE} />);
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    expect(screen.getByText("Plano de contas")).toBeInTheDocument();
    // O codigo na linha fica na cor do texto (nao parece link).
    expect(screen.getByText("#171353")).toHaveClass("text-foreground");
    expect(screen.queryByText("Cadastra o plano e confere o balancete.")).toBeNull(); // fechado: so a linha
    abrirCaso("3.1.2.1");
    expect(screen.getByText("Cadastra o plano e confere o balancete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^3\.1\.2\.1/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("sem os botoes de desativar, reativar ou copiar", async () => {
    api.desativados = [desativado("3.1.2.1")];
    renderAba(<CasosTab hierarchy={ARVORE} />);
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    await screen.findByText("mod_xml");
    abrirCaso("3.1.2.1");
    expect(screen.queryByRole("button", { name: /Desativar|Reativar|Copiar/ })).toBeNull();
  });

  it("busca por numero, nome ou descricao (sem acento) e mostra o caminho", () => {
    renderAba(<CasosTab hierarchy={ARVORE} />);
    const busca = screen.getByRole("textbox", { name: "Buscar casos de teste" });
    fireEvent.change(busca, { target: { value: "lancamento" } });
    let lista = screen.getByRole("list", { name: "Casos encontrados" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(busca, { target: { value: "[4.2.1]" } });
    lista = screen.getByRole("list", { name: "Casos encontrados" });
    expect(within(lista).getByText("Apuração mensal")).toBeInTheDocument();
    expect(within(lista).getByText("Lalur Mensal")).toBeInTheDocument();
    fireEvent.change(busca, { target: { value: "nada disso" } });
    expect(screen.getByText("Nada encontrado com essa busca e esses filtros.")).toBeInTheDocument();
  });

  it("mod_xml: caso e grupo desmarcados aparecem travados e os de dentro do grupo tambem", async () => {
    api.desativados = [desativado("3.1.2.1"), desativado("3.1.10")];
    renderAba(<CasosTab hierarchy={ARVORE} />);
    expect(await screen.findByText("Desmarcado no mod_xml")).toBeInTheDocument(); // selo no grupo [3.1.10]
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "3 desmarcados no mod_xml")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lançamentos/ }));
    expect(screen.getByText("Plano de contas")).toHaveClass("line-through");
    expect(screen.getByText("Lançamento em lote")).toHaveClass("line-through");
    expect(screen.getByText("mod_xml")).toBeInTheDocument();
    expect(screen.getAllByText("grupo desmarcado")).toHaveLength(2);
    abrirCaso("3.1.2.1");
    expect(screen.getByText(`${MOTIVO}. Para mudar, edite a lista no mod_xml.py.`)).toBeInTheDocument();
    abrirCaso("3.1.10.2");
    expect(screen.getByText(/Fica de fora porque o grupo \[3\.1\.10\] está desmarcado no mod_xml/)).toBeInTheDocument();
    // Filtro dos desmarcados.
    fireEvent.click(screen.getByRole("button", { name: "Só os desmarcados" }));
    expect(within(screen.getByRole("list", { name: "Casos encontrados" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("marcacao antiga feita a mao no dashboard nao conta: so o mod_xml", async () => {
    api.desativados = [desativado("3.1.2.1", "bia"), desativado("4.2.1")];
    renderAba(<CasosTab hierarchy={ARVORE} />);
    expect(await screen.findByText((_, el) => el?.tagName === "SPAN" && el.textContent === "1 desmarcado no mod_xml")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Planos/ }));
    expect(screen.getByText("Plano de contas")).not.toHaveClass("line-through");
  });

  it("codigo do caso na linha e o link do cartao no Kanboard no caso aberto", () => {
    const arvore = [
      no("3", "Contábil", "grupo"),
      no("3.2", "Kanboard", "grupo"),
      no("3.2.1", "Com codigo", "caso", "#252397 - Confere o balancete, ver tambem #175763."),
      { ...no("3.2.2", "So na procedure", "caso"), procedure_name: "pConsultaFeriado_245993" },
      no("3.2.3", "Sem codigo", "caso", "Caso antigo, sem chamado."),
    ];
    renderAba(<CasosTab hierarchy={arvore} />);
    fireEvent.click(screen.getByRole("button", { name: /Kanboard/ }));
    expect(screen.getByText("#252397")).toBeInTheDocument();
    expect(screen.getByText("#245993")).toBeInTheDocument();
    abrirCaso("3.2.1");
    abrirCaso("3.2.2");
    abrirCaso("3.2.3");
    const link = (nome: RegExp) => screen.getByRole("link", { name: nome });
    expect(link(/Abrir #252397 no Kanboard/)).toHaveAttribute("href", "https://kanboard.sci.com.br/sprint/0/solicitacao/252397");
    expect(link(/Abrir #252397 no Kanboard/)).toHaveAttribute("target", "_blank");
    expect(link(/Abrir #245993 no Kanboard/)).toHaveAttribute("href", "https://kanboard.sci.com.br/sprint/0/solicitacao/245993");
    // Chamado citado no meio do texto tambem abre, mas nao vira o codigo do caso.
    expect(link(/^#175763$/)).toHaveAttribute("href", "https://kanboard.sci.com.br/sprint/0/solicitacao/175763");
    expect(screen.getAllByText("Código do caso de teste não informado")).toHaveLength(1);
    // A busca acha pelo codigo, inclusive o que so esta na procedure.
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar casos de teste" }), { target: { value: "245993" } });
    expect(within(screen.getByRole("list", { name: "Casos encontrados" })).getByText("So na procedure")).toBeInTheDocument();
  });

  it("sem a arvore (modulo sem rodagem com o .mds), explica", () => {
    renderAba(<CasosTab hierarchy={[]} />);
    expect(screen.getByText(/aparece depois da próxima rodagem/)).toBeInTheDocument();
  });
});
