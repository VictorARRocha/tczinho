import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Falha, Modulo, Rodagem } from "@/types/db";
import type { TestcaseHierarchyNode } from "@/services/data";

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["rodagem"], modules: ["contabil", "folha"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const MODULOS = [
  { id: "mod_folha", slug: "folha", nome: "Folha" },
  { id: "mod_contabil", slug: "contabil", nome: "Contábil" },
  { id: "mod_geral", slug: "geral", nome: "Geral" },
] as Modulo[];

const no = (node_id: string, node_name: string, node_type: "grupo" | "caso"): TestcaseHierarchyNode => ({
  node_id, node_name, node_type, descricao: "",
  parent_node_id: node_id.includes(".") ? node_id.split(".").slice(0, -1).join(".") : null,
  full_path_ids: null, full_path_names: null, full_path_label: null, script_name: null, procedure_name: null,
  modulo_codigo: node_id.split(".")[0], modulo_nome: "Contábil", sistema: "Unico",
});

vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchModules: async () => MODULOS,
    fetchTestcaseHierarchy: async () => [no("3", "Contábil", "grupo"), no("3.1", "Cadastros", "grupo"), no("3.1.1", "Sócio", "caso"), no("3.1.2", "Contadores", "caso")],
    fetchLatestRunsByModule: async () => [{ modulo: MODULOS[1], rodagem: { id: "rod_1", data_analise: "2026-10-08T10:00:00-03:00", maquina: "a08" } as Rodagem }],
    fetchFailuresByRun: async () => [{ id: "f1", id_caso_teste: "3.1.1" } as Falha],
    fetchCasosDesativados: async () => [],
  };
});

import { queryClient } from "@/lib/queryClient";
import CasosDeTeste from "@/pages/CasosDeTeste";
import ModulePage from "@/pages/ModulePage";

function Onde() {
  return <span data-testid="onde">{useLocation().pathname}</span>;
}

function renderEm(rota: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/casos-de-teste" element={<CasosDeTeste />} />
          <Route path="/casos-de-teste/:slug" element={<><CasosDeTeste /><Onde /></>} />
          <Route path="/modulo/:slug" element={<ModulePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  auth.profile = { username: "ana", permissions: ["rodagem"], modules: ["contabil", "folha"] };
});

describe("Casos de teste (menu lateral)", () => {
  it("escolhe o modulo pelos cards (os que a API entrega para a pessoa)", async () => {
    renderEm("/casos-de-teste");
    expect(await screen.findByRole("link", { name: /Contábil/ })).toHaveAttribute("href", "/casos-de-teste/contabil");
    expect(screen.getByRole("link", { name: /Folha/ })).toHaveAttribute("href", "/casos-de-teste/folha");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("modulo: arvore com as falhas da ultima rodagem", async () => {
    renderEm("/casos-de-teste/contabil");
    expect(await screen.findByRole("heading", { name: "Contábil" })).toBeInTheDocument();
    expect(await screen.findByText(/com falha na última rodagem/)).toHaveTextContent("1 com falha na última rodagem");
    expect(screen.getByText(/Falhas da última rodagem: 08\/10\/2026 10:00 · VM A08/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cadastros/ })).toBeInTheDocument();
  });

  it("modulo sem acesso: explica e nao mostra a arvore", async () => {
    auth.profile = { username: "ana", permissions: ["rodagem"], modules: ["folha"] };
    renderEm("/casos-de-teste/contabil");
    expect(await screen.findByText("Você não tem acesso a este módulo. Peça a um administrador.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cadastros/ })).toBeNull();
  });

  it("link antigo da aba (?tab=casos) vai para a pagina nova", async () => {
    renderEm("/modulo/contabil?tab=casos");
    await waitFor(() => expect(screen.getByTestId("onde")).toHaveTextContent("/casos-de-teste/contabil"));
  });
});
