import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ImportPedido } from "@/services/data";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["rodagem"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = { imports: [] as ImportPedido[], createImport: vi.fn() };
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchImports: async () => api.imports,
    fetchMergeBranches: async () => ({
      updated_at: null,
      branches: [
        { name: "Unico", url: "svn://svn/ProjetoUnico/Unico", kind: "trunk" },
        { name: "PRE-CLIENTES", url: "svn://svn/ProjetoUnico/branches/PRE-CLIENTES", kind: "branch" },
      ],
    }),
    createImport: (...args: unknown[]) => api.createImport(...args),
  };
});

import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/services/queries";
import { ImportarRodagem } from "@/components/ImportarRodagem";

const PASTA = "S:\\Teste automatico\\Arquivos\\Arquivos De Log\\ArquivosCompactados\\A07\\PROXIMA1.26.10.99 18_10_2026 08_16_16";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function pedido(extra: Partial<ImportPedido>): ImportPedido {
  return {
    id: "imp_1", status: "solicitado", requested_by: "ana", run_folder: PASTA, vm: "A07", exit_code: null, output: null,
    error_message: null, created_at: new Date().toISOString(), updated_at: "", finished_at: null, ...extra,
  };
}

function renderBotao() {
  return render(<QueryClientProvider client={queryClient}><ImportarRodagem /></QueryClientProvider>);
}

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  auth.isAdmin = false;
  auth.profile = { username: "ana", permissions: ["rodagem"] };
  api.imports = [];
  api.createImport.mockImplementation(async (pasta: string) => {
    const novo = pedido({ run_folder: pasta });
    api.imports = [novo];
    return novo;
  });
});

describe("Adicionar rodagem", () => {
  it("sem a permissao de rodagem, o botao nao aparece", () => {
    auth.profile = { username: "ana", permissions: [] };
    renderBotao();
    expect(screen.queryByRole("button", { name: /adicionar rodagem/i })).toBeNull();
  });

  it("envia a pasta informada e mostra que esta importando", async () => {
    renderBotao();
    fireEvent.click(await screen.findByRole("button", { name: /adicionar rodagem/i }));
    const importar = screen.getByRole("button", { name: "Importar" });
    expect(importar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pasta da rodagem"), { target: { value: `  ${PASTA} ` } });
    fireEvent.click(importar);
    await waitFor(() => expect(api.createImport).toHaveBeenCalledWith(PASTA, "svn://svn/ProjetoUnico/Unico"));
    expect(await screen.findByRole("button", { name: /importando/i })).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Importação na fila", expect.anything());
  });

  it("envia a branch do TC escolhida (sem escolha, a principal)", async () => {
    renderBotao();
    fireEvent.click(await screen.findByRole("button", { name: /adicionar rodagem/i }));
    fireEvent.change(screen.getByLabelText("Pasta da rodagem"), { target: { value: PASTA } });
    fireEvent.click(screen.getByRole("combobox", { name: "Branch do TC em que a rodagem rodou" }));
    fireEvent.click(await screen.findByText("PRE-CLIENTES"));
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(api.createImport).toHaveBeenCalledWith(PASTA, "svn://svn/ProjetoUnico/branches/PRE-CLIENTES"));
  });

  it("mostra o erro da API sem fechar a janela", async () => {
    api.createImport.mockRejectedValue(new Error("A pasta precisa estar dentro de S:\\..."));
    renderBotao();
    fireEvent.click(await screen.findByRole("button", { name: /adicionar rodagem/i }));
    fireEvent.change(screen.getByLabelText("Pasta da rodagem"), { target: { value: "C:\\x" } });
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível importar", { description: "A pasta precisa estar dentro de S:\\..." }));
    expect(screen.getByLabelText("Pasta da rodagem")).toBeTruthy();
  });

  it("avisa quando a importacao termina e lista o erro com a saida do .bat", async () => {
    api.imports = [pedido({ status: "processando" })];
    renderBotao();
    await screen.findByRole("button", { name: /importando/i });

    api.imports = [pedido({ status: "erro", error_message: "O run_agent_tc_python.bat terminou com codigo 1.", output: "Pasta nao encontrada" })];
    await queryClient.invalidateQueries({ queryKey: queryKeys.imports });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Importação falhou — PROXIMA1.26.10.99 18_10_2026 08_16_16", { description: "O run_agent_tc_python.bat terminou com codigo 1." },
    ));

    fireEvent.click(screen.getByRole("button", { name: /adicionar rodagem/i }));
    expect(await screen.findByText("O run_agent_tc_python.bat terminou com codigo 1.")).toBeTruthy();
    expect(screen.getByText("Erro")).toBeTruthy();
    expect(screen.getByText("Saída do .bat")).toBeTruthy();
  });

  it("importacao concluida avisa e atualiza os modulos", async () => {
    api.imports = [pedido({ status: "solicitado" })];
    renderBotao();
    await screen.findByRole("button", { name: /importando/i });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    api.imports = [pedido({ status: "concluido", exit_code: 0 })];
    await queryClient.invalidateQueries({ queryKey: queryKeys.imports });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Rodagem importada — PROXIMA1.26.10.99 18_10_2026 08_16_16"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.latestRuns });
    invalidate.mockRestore();
  });
});
