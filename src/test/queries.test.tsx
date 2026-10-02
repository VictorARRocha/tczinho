import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Modulo, Rodagem } from "@/types/db";
import type { RerunRequest } from "@/services/qa";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() } }));

const latestRuns = vi.fn();
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return { ...actual, fetchLatestRunsByModule: () => latestRuns() };
});

import Dashboard from "@/pages/Dashboard";
import { rerunRefetchInterval } from "@/services/queries";
import { ApiQaDataSource } from "@/services/data/apiSource";

const contabil = { id: "mod_contabil", slug: "contabil", nome: "Contábil" } as Modulo;
const run = (id: string) => ({ id, total_falhas: 2, data_analise: "2026-10-02T10:00:00-03:00" }) as Rodagem;

function renderDashboard(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  toastSuccess.mockReset();
  latestRuns.mockReset();
});

describe("Visao geral", () => {
  it("avisa quando a ultima rodagem de um modulo muda, mas nao na primeira carga", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    latestRuns.mockResolvedValueOnce([{ modulo: contabil, rodagem: run("rod_1") }]);
    renderDashboard(client);
    expect(await screen.findByText("Contábil")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();

    latestRuns.mockResolvedValueOnce([{ modulo: contabil, rodagem: run("rod_2") }]);
    await client.refetchQueries();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Nova rodagem recebida — Contábil"));
  });

  it("mostra erro com opcao de tentar de novo quando a API falha", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    latestRuns.mockRejectedValueOnce(new Error("[api 502] /modules/latest-runs"));
    renderDashboard(client);

    expect(await screen.findByText("Não foi possível carregar os módulos")).toBeInTheDocument();
    expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
  });
});

describe("historico do Jenkins", () => {
  const pedido = (execution_status: string) => ({ id: "r1", execution_status }) as RerunRequest;

  it("consulta a cada 10s com pedido ativo e a cada minuto sem", () => {
    expect(rerunRefetchInterval([pedido("rodando")])).toBe(10_000);
    expect(rerunRefetchInterval([pedido("cancel_requested")])).toBe(10_000);
    expect(rerunRefetchInterval([pedido("finalizado_sucesso")])).toBe(60_000);
    expect(rerunRefetchInterval(undefined)).toBe(60_000);
  });
});

describe("resumo por modulo", () => {
  it("usa /modules/latest-runs em uma unica chamada", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ modulo: contabil, rodagem: { id: "rod_1", total_executed: 10 } }]), { status: 200 }),
    );

    const result = await ApiQaDataSource.fetchLatestRunsByModule();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/modules/latest-runs");
    expect(result[0].rodagem?.id).toBe("rod_1");
  });

  it("monta o resumo modulo a modulo se a API ainda nao tem o endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/modules/latest-runs")) return new Response("{}", { status: 404 });
      if (url.endsWith("/modules")) return new Response(JSON.stringify([contabil]), { status: 200 });
      return new Response(JSON.stringify([{ id: "rod_9" }, { id: "rod_8" }]), { status: 200 });
    });

    const result = await ApiQaDataSource.fetchLatestRunsByModule();

    expect(result).toEqual([{ modulo: contabil, rodagem: expect.objectContaining({ id: "rod_9" }) }]);
  });
});
