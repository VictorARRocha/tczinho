import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AtrasoRodagem } from "@/types/db";
import type { HistoricoTempo } from "@/services/data";

vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  const names = ["PieChart", "Pie", "Cell", "ResponsiveContainer", "BarChart", "Bar", "XAxis", "YAxis", "Tooltip"];
  return Object.fromEntries(names.map((name) => [name, Stub]));
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["regravar"], modules: ["contabil"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = { historico: null as HistoricoTempo | null, trocar: vi.fn() };
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchHistoricoTempo: async () => api.historico,
    trocarBaseTempo: (...args: unknown[]) => api.trocar(...args),
  };
});

import { queryClient } from "@/lib/queryClient";
import { PerformanceTab } from "@/pages/module/PerformanceTab";

const linha = (codigo: string, base: number, atual: number, status: AtrasoRodagem["status"], tendencia?: number[]): AtrasoRodagem => ({
  id: `tempo_${codigo}`, rodagem_id: "rod_2", codigo_teste: codigo, nome_teste: `Caso ${codigo}`,
  tempo_padrao: null, tempo_atual: null, delay_detectado: null,
  delay_segundos: atual - base, base_segundos: base, atual_segundos: atual,
  variacao_pct: ((atual - base) / base) * 100, status, created_at: "2026-10-13T11:12:01-03:00",
  tendencia, medido_em: "2026-10-13T11:12:01-03:00", limite_segundos: 15,
});

const HISTORICO: HistoricoTempo = {
  codigo_teste: "3.2.14", base_segundos: 130, base_origem: "planilha", base_anterior_segundos: null,
  base_definida_em: "2026-10-01T10:00:00-03:00", base_definida_por: null, limite_segundos: 15,
  medicoes: [
    { medido_em: "2026-10-13T11:12:01-03:00", segundos: 161, run_id: "rod_2", versao: "PROXIMA1.26.10.0", status: "mais_lento" },
    { medido_em: "2026-10-10T09:00:00-03:00", segundos: 135, run_id: null, versao: null, status: "igual" },
  ],
};

function renderAba(ui: ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  queryClient.clear();
  auth.isAdmin = false;
  auth.profile = { username: "ana", permissions: ["regravar"], modules: ["contabil"] };
  api.historico = HISTORICO;
  api.trocar.mockReset();
});

const DADOS = [
  linha("3.2.14", 130, 161, "mais_lento", [130, 128, 133, 135, 161]),
  linha("3.1.2", 17, 16, "igual", [17, 16]),
];

describe("aba Performance com tempos no banco", () => {
  it("coluna Tendencia, filtro 'Sem variacao' e numero de quem estourou", () => {
    renderAba(<PerformanceTab data={DADOS} moduloSlug="contabil" />);
    expect(screen.getByRole("columnheader", { name: "Tendência" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Últimas 5 rodagens: 02:10 → 02:08 → 02:13 → 02:15 → 02:41/ })).toBeInTheDocument();
    expect(screen.getByText("Caso 3.1.2")).toBeInTheDocument(); // lista todos os casos medidos
  });

  it("rodagem antiga (sem tendencia) nao mostra a coluna", () => {
    renderAba(<PerformanceTab data={[linha("3.2.14", 130, 161, "mais_lento")]} moduloSlug="contabil" />);
    expect(screen.queryByRole("columnheader", { name: "Tendência" })).not.toBeInTheDocument();
  });

  it("clicar no caso abre o historico e troca a base com confirmacao", async () => {
    const onBaseTrocada = vi.fn();
    api.trocar.mockResolvedValue({ ...HISTORICO, base_segundos: 161, base_origem: "substituida", base_anterior_segundos: 130, base_definida_por: "ana" });
    renderAba(<PerformanceTab data={DADOS} moduloSlug="contabil" onBaseTrocada={onBaseTrocada} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver histórico do caso 3.2.14" }));

    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByText("CT [3.2.14]")).toBeInTheDocument();
    expect(await within(painel).findByText("da planilha antiga (Tempo Padrão)")).toBeInTheDocument();
    expect(within(painel).getByText("+24%")).toBeInTheDocument();
    expect(within(painel).getByText("+4%")).toBeInTheDocument();
    // Versao de cada rodagem ao lado do dia; sem rodagem registrada, um traco.
    expect(within(painel).getByText("Próxima 10.0")).toBeInTheDocument();
    expect(within(painel).getByTitle("Rodagem não registrada no AgenteTC")).toHaveTextContent("—");
    expect(within(painel).getByText("13/10")).toHaveAttribute("title", "13/10/2026 11:12 (esta rodagem)");

    fireEvent.click(within(painel).getByRole("button", { name: "Usar 02:41 como novo tempo base" }));
    const confirmar = await screen.findByRole("button", { name: "Trocar tempo base" });
    expect(screen.getByText(/De 02:10 para 02:41/)).toBeInTheDocument();
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.trocar).toHaveBeenCalledWith("3.2.14", 161));
    await waitFor(() => expect(onBaseTrocada).toHaveBeenCalled());
  });

  it("sem permissao de regravar, so explica", async () => {
    auth.profile = { username: "ana", permissions: ["rodagem"], modules: ["contabil"] };
    renderAba(<PerformanceTab data={DADOS} moduloSlug="contabil" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver histórico do caso 3.2.14" }));
    expect(await screen.findByText("Só quem pode regravar arquivos troca o tempo base.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /novo tempo base/ })).not.toBeInTheDocument();
  });

  it("regravar varios: todos marcados, atalhos de lentos/rapidos, desmarcar e confirmar", async () => {
    const onBaseTrocada = vi.fn();
    api.trocar.mockResolvedValue(HISTORICO);
    const dados = [...DADOS, linha("3.2.20", 200, 150, "mais_rapido"), linha("3.2.21", 100, 140, "mais_lento")];
    renderAba(<PerformanceTab data={dados} moduloSlug="contabil" onBaseTrocada={onBaseTrocada} />);
    fireEvent.click(screen.getByRole("button", { name: "Regravar vários" }));

    const janela = await screen.findByRole("dialog");
    const caixa = (ct: string) => within(janela).getByRole("checkbox", { name: `CT [${ct}]` });
    // O 3.1.2 (sem variacao) nao entra; os outros comecam marcados, com base e tempo novo.
    expect(within(janela).queryByRole("checkbox", { name: "CT [3.1.2]" })).toBeNull();
    expect(within(janela).getByText("3 de 3 selecionados")).toBeInTheDocument();
    expect(caixa("3.2.20").closest("label")).toHaveTextContent("03:20 → 02:30");

    fireEvent.click(within(janela).getByRole("button", { name: "Somente mais rápidos" }));
    expect(caixa("3.2.20")).toBeChecked();
    expect(caixa("3.2.14")).not.toBeChecked();
    fireEvent.click(within(janela).getByRole("button", { name: "Somente mais lentos" }));
    expect(caixa("3.2.20")).not.toBeChecked();
    expect(caixa("3.2.21")).toBeChecked();
    fireEvent.click(within(janela).getByRole("button", { name: "Selecionar todos" }));
    fireEvent.click(caixa("3.2.21")); // desmarca
    expect(within(janela).getByText("2 de 3 selecionados")).toBeInTheDocument();

    fireEvent.click(within(janela).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Regravar 2 casos de teste?")).toBeInTheDocument();
    expect(api.trocar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Regravar" }));
    await waitFor(() => expect(onBaseTrocada).toHaveBeenCalledTimes(1));
    expect(api.trocar.mock.calls).toEqual([["3.2.14", 161], ["3.2.20", 150]]);
  });

  it("regravar varios: o que falhar continua marcado", async () => {
    api.trocar.mockImplementation(async (ct: string) => {
      if (ct === "3.2.20") throw new Error("sem acesso");
      return HISTORICO;
    });
    renderAba(<PerformanceTab data={[...DADOS, linha("3.2.20", 200, 150, "mais_rapido")]} moduloSlug="contabil" />);
    fireEvent.click(screen.getByRole("button", { name: "Regravar vários" }));
    const janela = await screen.findByRole("dialog");
    fireEvent.click(within(janela).getByRole("button", { name: "Confirmar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Regravar" }));
    await waitFor(() => expect(within(janela).getByText("1 de 2 selecionados")).toBeInTheDocument());
    expect(within(janela).getByRole("checkbox", { name: "CT [3.2.20]" })).toBeChecked();
  });

  it("sem permissao de regravar, nao mostra o regravar varios", () => {
    auth.profile = { username: "ana", permissions: ["rodagem"], modules: ["contabil"] };
    renderAba(<PerformanceTab data={DADOS} moduloSlug="contabil" />);
    expect(screen.queryByRole("button", { name: "Regravar vários" })).toBeNull();
  });

  it("de outro modulo, nao oferece a troca", async () => {
    auth.profile = { username: "ana", permissions: ["regravar"], modules: ["folha"] };
    renderAba(<PerformanceTab data={DADOS} moduloSlug="contabil" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver histórico do caso 3.2.14" }));
    await screen.findByText("CT [3.2.14]");
    expect(screen.queryByRole("button", { name: /novo tempo base/ })).not.toBeInTheDocument();
  });
});
