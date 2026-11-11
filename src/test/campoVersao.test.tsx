import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = { versoes: [] as string[], extra: {} as Record<string, unknown>, atualizar: vi.fn() };
vi.mock("@/services/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/data")>()),
  fetchVersoesUnico: async () => ({ versoes: api.versoes, updated_at: "2026-11-11T09:30:00+00:00", ...api.extra }),
  atualizarVersoesUnico: () => api.atualizar(),
}));

import { CampoVersao } from "@/components/CampoVersao";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const valor = { atual: "" };
function Tela({ inicial = "", admin = false }: { inicial?: string; admin?: boolean }) {
  const [v, setV] = useState(inicial);
  valor.atual = v;
  return <CampoVersao ariaLabel="Versão" value={v} onChange={setV} mostrarAtualizar={admin} />;
}

function renderizar(inicial?: string, admin = false, extra: Record<string, unknown> = {}) {
  api.extra = extra;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Tela inicial={inicial} admin={admin} /></QueryClientProvider>);
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

  it("sem ser admin nao mostra o Atualizar lista", async () => {
    api.versoes = ["clientes"];
    renderizar();
    await screen.findByRole("combobox", { name: "Versão" });
    expect(screen.queryByRole("button", { name: "Atualizar lista" })).not.toBeInTheDocument();
  });

  it("admin pede a atualizacao e ve o pedido em andamento", async () => {
    api.versoes = ["clientes"];
    api.atualizar.mockResolvedValue({ versoes: ["clientes"], updated_at: "2026-11-11T09:30:00+00:00", pedido_em: "2026-11-11T18:20:00+00:00", pedido_pendente: true });
    renderizar("", true);
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar lista" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Atualização pedida em");
    expect(api.atualizar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Atualizar lista" })).not.toBeInTheDocument();
  });

  it("pedido que expirou sem lista nova: avisa e deixa pedir de novo", async () => {
    api.versoes = ["clientes"];
    renderizar("", true, { pedido_em: "2026-11-11T18:20:00+00:00", pedido_pendente: false });
    expect(await screen.findByText(/não chegou/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar lista" })).toBeEnabled();
  });

  it("versao fora da lista (pre-definicao antiga) aparece digitada", async () => {
    api.versoes = ["clientes"];
    renderizar("PROXIMA");
    await screen.findByRole("button", { name: "Escolher da lista" });
    expect(screen.getByRole("textbox", { name: "Versão" })).toHaveValue("PROXIMA");
  });
});
