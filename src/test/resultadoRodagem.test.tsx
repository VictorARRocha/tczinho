import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Rodagem } from "@/types/db";
import { formatarTempoTotal, resultadoRodagem, rodagemAnteriorComTempo, tempoTotalRodagem, variacaoTempo } from "@/lib/format";
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
    expect(screen.queryByText(/ao importar esta rodagem/)).toBeNull();
  });

  it("resumo avisa os problemas da importacao (RAR que nao chegou)", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const rodagem = { id: "r1", total_analisados: 10, total_falhas: 0, total_automacao: 0, total_massa_dados: 0,
      total_inconclusivo: 0, total_possivel_funcional: 0, data_inicio_rodagem: null, data_fim_rodagem: null,
      erros_processamento: [
        { etapa: "compactado_ausente", arquivo: "1.6.20-26_10_2026-23_33_20.RAR", mensagem: "procure na VM" },
        { tipo: "tempos_casos", mensagem: "sem acesso" },
      ] } as unknown as Rodagem;
    render(<ResumoTab rodagem={rodagem} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    const aviso = screen.getByRole("region", { name: "2 problemas ao importar esta rodagem" });
    expect(aviso).toHaveTextContent("Log compactado não chegou à pasta da rodagem1.6.20-26_10_2026-23_33_20.RAR");
    expect(aviso).toHaveTextContent("Tempos dos casos não foram lidos");
  });

  it("variacao do tempo contra a rodagem anterior do modulo com tempo total", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const rod = (id: string, inicio: string, fim: string | null) => ({ id, total_analisados: 585, total_falhas: 21, total_automacao: 0,
      total_massa_dados: 0, total_inconclusivo: 0, total_possivel_funcional: 0, data_inicio_rodagem: inicio, data_fim_rodagem: fim }) as unknown as Rodagem;
    const atual = rod("r3", "2026-10-14T18:55:00-03:00", "2026-10-15T08:23:00-03:00"); // 13h28min
    const historico = [
      atual,
      rod("r2", "2026-10-10T18:00:00-03:00", null), // sem fim: pula
      rod("r1", "2026-10-07T18:00:00-03:00", "2026-10-08T06:27:00-03:00"), // 12h27min
      rod("r0", "2026-10-01T18:00:00-03:00", "2026-10-02T05:00:00-03:00"),
      rod("r4", "2026-10-16T18:00:00-03:00", "2026-10-17T05:00:00-03:00"), // depois da atual: nao conta
    ];
    expect(rodagemAnteriorComTempo(atual, historico)?.id).toBe("r1");
    expect(variacaoTempo(110, 100)).toBeCloseTo(0.1);
    render(<ResumoTab rodagem={atual} historico={historico} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.getByText("13h28min")).toBeInTheDocument();
    const selo = screen.getByLabelText(/aumento de 8,2%/);
    expect(selo).toHaveTextContent("▲ 8,2%");
    expect(selo).toHaveClass("text-destructive");
    expect(screen.getByText(/vs anterior/)).toHaveTextContent("vs anterior (12h27min · 07/10)");
  });

  it("mais rapida: selo verde; sem anterior: explica", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const rod = (id: string, inicio: string, fim: string) => ({ id, total_analisados: 10, total_falhas: 0, total_automacao: 0,
      total_massa_dados: 0, total_inconclusivo: 0, total_possivel_funcional: 0, data_inicio_rodagem: inicio, data_fim_rodagem: fim }) as unknown as Rodagem;
    const atual = rod("b", "2026-10-14T08:00:00-03:00", "2026-10-14T17:00:00-03:00");
    const { unmount } = render(<ResumoTab rodagem={atual} historico={[atual, rod("a", "2026-10-13T08:00:00-03:00", "2026-10-13T18:00:00-03:00")]}
      falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.getByLabelText(/redução de 10,0%/)).toHaveClass("text-success");
    unmount();
    render(<ResumoTab rodagem={atual} historico={[atual]} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.getByText("sem rodagem anterior para comparar")).toBeInTheDocument();
  });

  it("rodagem antiga, sem fim: sem tempo total", () => {
    const rodagem = { id: "r1", total_analisados: 555, total_falhas: 12, total_automacao: 0, total_massa_dados: 0,
      total_inconclusivo: 0, total_possivel_funcional: 0, data_inicio_rodagem: "2026-10-12T07:19:48-03:00", data_fim_rodagem: null } as unknown as Rodagem;
    render(<ResumoTab rodagem={rodagem} falhas={[]} evidencias={[]} performance={[]} onOpenPerformance={vi.fn()} onOpenFalhas={vi.fn()} />);
    expect(screen.queryByText("Tempo total")).toBeNull();
  });
});
