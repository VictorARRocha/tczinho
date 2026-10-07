import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Evidencia, Falha } from "@/types/db";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FailureDetailSheet } from "@/components/FailureDetailSheet";
import JenkinsHome from "@/pages/JenkinsHome";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const falha = { id: "f1", rodagem_id: "rod_a08 PROXIMA/1", id_caso_teste: "3.1", caso_teste_provavel: "Relatorio" } as Falha;
const ev = (id: string, nome: string) =>
  ({ id, falha_id: "f1", nome_arquivo: nome, extensao: "txt", storage_path: `contabil/V/rod/3.1/${nome}` }) as Evidencia;
const par = [ev("1", "Rel_Antigo.txt"), ev("2", "Rel_Atual.txt")];

function renderSheet(props: { linkRegravar?: boolean; evidencias: Evidencia[] }) {
  return render(
    <MemoryRouter>
      <FailureDetailSheet falha={falha} open onClose={() => {}} {...props} />
    </MemoryRouter>,
  );
}

describe("link da falha para a regravacao", () => {
  it("com comparacao Base/Atual leva para a regravacao filtrada na rodagem da falha", async () => {
    renderSheet({ linkRegravar: true, evidencias: par });
    const link = await screen.findByRole("link", { name: /Regravar arquivos desta rodagem/ });
    expect(link).toHaveAttribute("href", "/regravar?rodagem=" + encodeURIComponent("rod_a08 PROXIMA/1"));
  });

  it("sem comparacao (nada para regravar) nao mostra o link", async () => {
    renderSheet({ linkRegravar: true, evidencias: [ev("3", "erro.png")] });
    expect(await screen.findByText(/Relatorio/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Regravar arquivos/ })).toBeNull();
  });

  it("dentro da propria tela de regravacao (sem linkRegravar) nao mostra o link", async () => {
    renderSheet({ evidencias: par });
    expect(await screen.findByText(/Comparações \(1\)/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Regravar arquivos/ })).toBeNull();
  });
});

describe("Regravar arquivos fora do Jenkins", () => {
  it("a pagina do Jenkins volta a ter so Rodagem completa e Reexecutar rodagens", () => {
    render(<MemoryRouter><JenkinsHome /></MemoryRouter>);
    expect(screen.getByText("Rodagem completa")).toBeInTheDocument();
    expect(screen.getByText("Reexecutar rodagens")).toBeInTheDocument();
    expect(screen.queryByText("Regravar arquivos")).toBeNull();
    // So o titulo e os cards: sem o selo "Jenkins" e sem a descricao.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Disparar execuções no Jenkins");
    expect(screen.queryByText(/JenkinsBridge|Lovable|O pedido entra na fila/)).toBeNull();
  });
});
