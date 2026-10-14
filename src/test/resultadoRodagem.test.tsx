import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Rodagem } from "@/types/db";
import { formatarTempoTotal, resultadoRodagem, tempoTotalRodagem } from "@/lib/format";
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

  it("tempo total: do inicio ao fim da rodagem; sem fim ou estranho, nao aparece", () => {
    const r = (inicio: string | null, fim: string | null) => ({ data_inicio_rodagem: inicio, data_fim_rodagem: fim });
    expect(tempoTotalRodagem(r("2026-10-12T07:19:48-03:00", "2026-10-12T17:26:30-03:00"))).toBe(36402);
    expect(tempoTotalRodagem(r("2026-10-12T07:19:48-03:00", null))).toBeNull(); // rodagem antiga
    expect(tempoTotalRodagem(r("2026-10-12T07:19:48-03:00", "2026-10-12T07:00:00-03:00"))).toBeNull();
    expect(tempoTotalRodagem(r("2026-10-01T07:00:00-03:00", "2026-10-12T07:00:00-03:00"))).toBeNull(); // reprocessada dias depois
    expect(formatarTempoTotal(36402)).toBe("10h06min");
    expect(formatarTempoTotal(2820)).toBe("47min");
    expect(formatarTempoTotal(3600)).toBe("1h00min");
    expect(formatarTempoTotal(30)).toBe("menos de 1min");
  });

  it("resumo mostra o tempo total ao lado dos casos rodados", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const rodagem = { id: "r1", total_analisados: 555, total_falhas: 12, total_automacao: 0, total_massa_dados: 0,
      total_inconclusivo: 0, total_possivel_funcional: 0,
      data_inicio_rodagem: "2026-10-12T07:19:48-03:00", data_fim_rodagem: "2026-10-12T17:26:30-03:00" } as unknown as Rodagem;
    render(<ResumoTab rodagem={rodagem} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.getByText("Tempo total")).toBeInTheDocument();
    expect(screen.getByText("10h06min").parentElement).toHaveAttribute("title", "De 12/10/2026 07:19 até 12/10/2026 17:26");
    expect(screen.getByText("555")).toBeInTheDocument();
  });

  it("rodagem antiga, sem fim: sem tempo total", () => {
    const rodagem = { id: "r1", total_analisados: 555, total_falhas: 12, total_automacao: 0, total_massa_dados: 0,
      total_inconclusivo: 0, total_possivel_funcional: 0, data_inicio_rodagem: "2026-10-12T07:19:48-03:00", data_fim_rodagem: null } as unknown as Rodagem;
    render(<ResumoTab rodagem={rodagem} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.queryByText("Tempo total")).toBeNull();
  });
});
