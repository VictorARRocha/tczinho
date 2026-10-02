import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AtrasoRodagem } from "@/types/db";

// Os graficos nao sao o alvo destes testes e dependem de medidas de layout que o jsdom nao tem.
vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  const names = ["PieChart", "Pie", "Cell", "ResponsiveContainer", "BarChart", "Bar", "XAxis", "YAxis", "Tooltip"];
  return Object.fromEntries(names.map((name) => [name, Stub]));
});

import { PerformanceTab } from "@/pages/module/PerformanceTab";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SESSION_EXPIRED_EVENT, getAuthToken, setAuthToken } from "@/services/authApi";
import { ApiQaDataSource } from "@/services/data/apiSource";
import { fetchEvidenceBlob } from "@/lib/evidenceUrl";
import { requestAiGrouping } from "@/services/aiGrouping";
import type { Evidencia } from "@/types/db";

const atraso: AtrasoRodagem = {
  id: "delay_1",
  rodagem_id: "rod_1",
  codigo_teste: "3.1.2",
  nome_teste: "Caso lento",
  tempo_padrao: "00:01:00",
  tempo_atual: "00:02:00",
  delay_detectado: "00:01:00",
  delay_segundos: 60,
  base_segundos: 60,
  atual_segundos: 120,
  variacao_pct: 100,
  status: "mais_lento",
  created_at: "2026-10-02T00:00:00Z",
};

describe("PerformanceTab", () => {
  it("troca entre rodagem com e sem performance sem quebrar os hooks", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<PerformanceTab data={[atraso]} />);
    expect(screen.getAllByText("3.1.2").length).toBeGreaterThan(0);

    rerender(<PerformanceTab data={[]} />);
    expect(screen.getByText(/Nenhum dado de performance/)).toBeInTheDocument();

    rerender(<PerformanceTab data={[atraso]} />);
    expect(screen.getAllByText("3.1.2").length).toBeGreaterThan(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("ErrorBoundary", () => {
  function Bomb({ explode }: { explode: boolean }) {
    if (explode) throw new Error("falha de renderizacao");
    return <p>conteudo ok</p>;
  }

  it("mostra a mensagem de erro e limpa ao mudar o resetKey", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Algo deu errado/)).toBeInTheDocument();
    expect(screen.getByText("falha de renderizacao")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="/b">
        <Bomb explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("conteudo ok")).toBeInTheDocument();
  });

  it("tentar novamente renderiza os filhos de novo", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let explode = true;
    function Flaky() {
      if (explode) throw new Error("instavel");
      return <p>recuperado</p>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    explode = false;
    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(screen.getByText("recuperado")).toBeInTheDocument();
  });
});

describe("sessao expirada", () => {
  let events = 0;
  const onExpired = () => { events += 1; };

  beforeEach(() => {
    events = 0;
    setAuthToken("sessao-vencida");
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    vi.restoreAllMocks();
  });

  const unauthorized = () =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    );

  it("uma leitura com 401 limpa o token e avisa o app uma unica vez", async () => {
    unauthorized();

    const [rodagens, falhas] = await Promise.all([
      ApiQaDataSource.fetchRunsByModule("contabil"),
      ApiQaDataSource.fetchFailuresByRun("rod_1"),
    ]);

    expect(rodagens).toEqual([]);
    expect(falhas).toEqual([]);
    expect(getAuthToken()).toBeNull();
    expect(events).toBe(1);
  });

  it("download de evidencia e agrupamento por IA tambem avisam", async () => {
    unauthorized();
    await expect(fetchEvidenceBlob({ storage_path: "run/erro.txt" } as Evidencia)).resolves.toBeNull();
    expect(events).toBe(1);

    setAuthToken("outra-sessao-vencida");
    await expect(requestAiGrouping("rod_1")).rejects.toMatchObject({ status: 401 });
    expect(events).toBe(2);
  });

  it("erro que nao e 401 nao derruba a sessao", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("erro", { status: 500 }));

    // Leituras de detalhe devolvem vazio; modulos propagam o erro (ficam em cache, nao podem guardar vazio).
    await expect(ApiQaDataSource.fetchRunsByModule("contabil")).resolves.toEqual([]);
    await expect(ApiQaDataSource.fetchModules()).rejects.toMatchObject({ status: 500 });

    expect(getAuthToken()).toBe("sessao-vencida");
    expect(events).toBe(0);
  });
});
