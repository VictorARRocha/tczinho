import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Rodagem } from "@/types/db";

// Um pedido de reexecucao na A08 entre 17:00 e 18:00 (selo na troca de rodagem).
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchRerunRequests: async () => [{
      id: "p1", vm_name: "a08", casos_teste: "[3.2.14]", status: "enviado_jenkins", execution_status: "finalizado_falha",
      tipo_solicitacao: "reexecucao", solicitado_por: "ana",
      created_at: "2026-10-07T17:00:00-03:00", updated_at: "2026-10-07T18:00:00-03:00",
    }],
    fetchImports: async () => [],
  };
});

import { queryClient } from "@/lib/queryClient";
import { formatarVersao, formatarVm } from "@/lib/rodagemTexto";
import { ModuleHeader } from "@/pages/module/ModuleHeader";

describe("texto da rodagem", () => {
  it("versao como as pessoas falam (nomes reais das pastas de rodagem)", () => {
    const casos: Record<string, string> = {
      "PROXIMA1.26.10.0": "Próxima 10.0",
      "PROXIMA1.26.9.99": "Próxima 9.99",
      "PROXIMA": "Próxima",
      "CONTABIL_DERE": "Contábil Dere",
      "FOLHA_SUSTENTACAO_2026": "Folha Sustentação 2026",
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

  it("menu de troca de rodagem: data em destaque, VM e versao identificadas", async () => {
    queryClient.clear();
    const rodagem = (id: string, versao: string, falhas: number, inicio: string) => ({
      id, maquina: "a08", versao_sistema: versao, total_falhas: falhas, total_possivel_funcional: 0,
      data_analise: "2026-10-07T17:22:00-03:00", data_inicio_rodagem: inicio,
    }) as Rodagem;
    // r1 com o total rodado (completa x reexecucao) e dentro do pedido de reexecucao; r2 antiga, sem o total.
    const runs = [
      { ...rodagem("r1", "CONTABIL_DERE", 6, "2026-10-07T17:10:00-03:00"), total_analisados: 1558 },
      rodagem("r2", "PROXIMA1.26.10.0", 1, "2026-10-07T08:00:00-03:00"),
    ];
    render(<QueryClientProvider client={queryClient}><ModuleHeader modulo={null} rodagem={runs[0]} runs={runs} onPickRun={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Trocar rodagem/ }));
    expect(await screen.findByText("Reexecução · ana")).toHaveAttribute("title", "Casos: [3.2.14]");
    expect(screen.getAllByText(/Reexecução/)).toHaveLength(1); // so a r1
    const [primeira, segunda] = screen.getAllByRole("button").filter((b) => b.textContent?.includes("VM:"));
    expect(primeira).toHaveTextContent("VM: A08");
    expect(primeira).toHaveTextContent("Versão: Contábil Dere");
    expect(primeira).toHaveTextContent("6 falhas de 1.558 casos");
    expect(within(segunda).getByText("Próxima 10.0")).toBeInTheDocument();
    expect(segunda).toHaveTextContent("1 falha");
    expect(segunda).not.toHaveTextContent("casos");
    expect(segunda).not.toHaveTextContent(" - a08");
  });
});
