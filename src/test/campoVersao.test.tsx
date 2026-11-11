import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const api = { versoes: [] as string[] };
vi.mock("@/services/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/data")>()),
  fetchVersoesUnico: async () => ({ versoes: api.versoes, updated_at: null }),
}));

import { CampoVersao } from "@/components/CampoVersao";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const valor = { atual: "" };
function Tela({ inicial = "" }: { inicial?: string }) {
  const [v, setV] = useState(inicial);
  valor.atual = v;
  return <CampoVersao ariaLabel="Versão" value={v} onChange={setV} />;
}

function renderizar(inicial?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Tela inicial={inicial} /></QueryClientProvider>);
}

describe("CampoVersao", () => {
  it("sem lista na API: campo de digitar de sempre", async () => {
    api.versoes = [];
    renderizar();
    fireEvent.change(await screen.findByRole("textbox", { name: "Versão" }), { target: { value: "PROXIMA" } });
    expect(valor.atual).toBe("PROXIMA");
  });

  it("com lista: escolhe com busca ou digita outra", async () => {
    api.versoes = ["clientes", "pre-cliente", "proxima1.26.11.0", "fiscal_reforma_2026"];
    renderizar();
    fireEvent.click(await screen.findByRole("combobox", { name: "Versão" }));
    fireEvent.change(screen.getByPlaceholderText("Buscar versão…"), { target: { value: "reforma" } });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("fiscal_reforma_2026"));
    expect(valor.atual).toBe("fiscal_reforma_2026");

    fireEvent.click(screen.getByRole("combobox", { name: "Versão" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Digitar outra versão…"));
    const campo = screen.getByRole("textbox", { name: "Versão" });
    fireEvent.change(campo, { target: { value: "clientes" } });
    expect(screen.getByRole("textbox", { name: "Versão" })).toBe(campo); // nao volta para a lista no meio da digitacao
    fireEvent.click(screen.getByRole("button", { name: "Escolher da lista" }));
    expect(screen.getByRole("combobox", { name: "Versão" })).toBeInTheDocument();
  });

  it("versao fora da lista (pre-definicao antiga) aparece digitada", async () => {
    api.versoes = ["clientes"];
    renderizar("PROXIMA");
    await screen.findByRole("button", { name: "Escolher da lista" });
    expect(screen.getByRole("textbox", { name: "Versão" })).toHaveValue("PROXIMA");
  });
});
