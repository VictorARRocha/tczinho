import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HistoricoTab } from "@/pages/module/HistoricoTab";
import type { Rodagem } from "@/types/db";

const run = (id: string, maquina: string, versao: string) =>
  ({ id, maquina, versao_sistema: versao, data_analise: "2026-11-09T22:00:00", total_falhas: 1 }) as unknown as Rodagem;

const RUNS = [run("r1", "a08", "PROXIMA1.26.11.0"), run("r2", "a07", "PROXIMA1.26.11.0"), run("r3", "a08", "PRE-CLIENTES")];

function linhas() {
  return screen.getAllByRole("row").slice(1); // tira o cabecalho
}

function escolher(filtro: string, opcao: string) {
  fireEvent.click(screen.getByRole("combobox", { name: filtro }));
  fireEvent.click(within(screen.getByRole("listbox")).getByText(opcao));
}

describe("aba Historico: filtros", () => {
  it("filtra por versao e por VM, juntos, e limpa", () => {
    render(<HistoricoTab runs={RUNS} onPick={vi.fn()} />);
    expect(linhas()).toHaveLength(3);

    escolher("Filtrar por versão", "Próxima 11.0");
    expect(linhas()).toHaveLength(2);

    escolher("Filtrar por VM", "A08");
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0]).toHaveTextContent("A08");

    escolher("Filtrar por versão", "Pre-clientes");
    expect(linhas()).toHaveLength(1);

    escolher("Filtrar por VM", "A07");
    expect(screen.getByText("Nenhuma rodagem com esses filtros.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(linhas()).toHaveLength(3);
  });
});
