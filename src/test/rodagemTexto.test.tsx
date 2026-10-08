import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Rodagem } from "@/types/db";
import { formatarVersao, formatarVm } from "@/lib/rodagemTexto";
import { ModuleHeader } from "@/pages/module/ModuleHeader";

describe("texto da rodagem", () => {
  it("versao como as pessoas falam (nomes reais das pastas de rodagem)", () => {
    const casos: Record<string, string> = {
      "PROXIMA1.26.10.0": "Próxima 10.0",
      "PROXIMA1.26.9.99": "Próxima 9.99",
      "PROXIMA": "Próxima",
      "CONTABIL_DERE": "Contabil Dere",
      "FOLHA_SUSTENTACAO_2026": "Folha Sustentacao 2026",
      "CLIENTES": "Clientes",
      "PRE-CLIENTES": "Pre-clientes",
      "8.05z": "8.05z",
      "19.4.3": "19.4.3",
      "Practice Base Agrupada 8.33a": "Practice Base Agrupada 8.33a",
      "": "",
    };
    for (const [entrada, saida] of Object.entries(casos)) expect(formatarVersao(entrada), entrada).toBe(saida);
    expect(formatarVersao(null)).toBe("");
    expect(formatarVm("a08")).toBe("A08");
    expect(formatarVm(undefined)).toBe("");
  });

  it("menu de troca de rodagem: data em destaque, VM e versao identificadas", () => {
    const rodagem = (id: string, versao: string, falhas: number) => ({
      id, maquina: "a08", versao_sistema: versao, total_falhas: falhas, total_possivel_funcional: 0,
      data_analise: "2026-10-07T17:22:00-03:00",
    }) as Rodagem;
    const runs = [rodagem("r1", "CONTABIL_DERE", 6), rodagem("r2", "PROXIMA1.26.10.0", 1)];
    render(<ModuleHeader modulo={null} rodagem={runs[0]} runs={runs} onPickRun={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Trocar rodagem/ }));
    const [primeira, segunda] = screen.getAllByRole("button").filter((b) => b.textContent?.includes("VM:"));
    expect(primeira).toHaveTextContent("VM: A08");
    expect(primeira).toHaveTextContent("Versão: Contabil Dere");
    expect(primeira).toHaveTextContent("6 falhas");
    expect(within(segunda).getByText("Próxima 10.0")).toBeInTheDocument();
    expect(segunda).toHaveTextContent("1 falha");
    expect(segunda).not.toHaveTextContent(" - a08");
  });
});
