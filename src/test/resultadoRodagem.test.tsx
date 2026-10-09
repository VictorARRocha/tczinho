import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Rodagem } from "@/types/db";
import { resultadoRodagem } from "@/lib/format";
import { ResumoTab } from "@/pages/module/ResumoTab";

describe("resultado da rodagem", () => {
  it("so calcula com os dois totais", () => {
    expect(resultadoRodagem({ total_analisados: 100, total_falhas: 5 })).toEqual({ rodados: 100, falhas: 5, passaram: 95, taxa: 0.95 });
    expect(resultadoRodagem({ total_analisados: 100, total_falhas: null })).toBeNull(); // antes: 100% passaram
    expect(resultadoRodagem({ total_analisados: null, total_falhas: 3 })).toBeNull();
    expect(resultadoRodagem({ total_analisados: 0, total_falhas: 0 })).toBeNull();
    expect(resultadoRodagem({ total_analisados: 2, total_falhas: 5 })).toBeNull();
  });

  it("resumo de rodagem sem o total de falhas: nao inventa a taxa e mostra os casos rodados", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const rodagem = { id: "r1", total_analisados: 120, total_falhas: null, total_automacao: 0, total_massa_dados: 0,
      total_inconclusivo: 0, total_possivel_funcional: 0 } as unknown as Rodagem;
    render(<ResumoTab rodagem={rodagem} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.getByText("Falhas nesta rodagem")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.queryByText(/passaram/)).toBeNull();
  });
});
