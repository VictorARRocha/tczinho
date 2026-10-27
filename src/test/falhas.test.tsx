import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Evidencia, Falha } from "@/types/db";
import { FalhasTab, montarItensFalhas } from "@/pages/module/FalhasTab";

const falha = (id: string, caso: string, extra: Partial<Falha> = {}) =>
  ({ id, id_caso_teste: caso, caso_teste_provavel: `Caso ${caso}`, erro_principal: "Object not found", ...extra }) as Falha;
const ev = (id: string, nome: string, extra: Partial<Evidencia> = {}) =>
  ({ id, nome_arquivo: nome, extensao: nome.split(".").pop(), storage_path: `folha/V/rod/${nome}`, ...extra }) as Evidencia;

const FALHAS = [falha("f1", "1.2.1"), falha("f2", "1.2.2"), falha("f3", "1.3.1")];

function Aba({ falhas = FALHAS, evidencias = [] as Evidencia[], onSelect = vi.fn() }) {
  const [sub, setSub] = useState<"todos" | "quebra" | "diferenca" | "quebra_diferenca">("todos");
  return (
    <FalhasTab moduloNome="Folha" falhas={falhas} evidencias={evidencias} hierarchy={[]} subTab={sub} setSubTab={setSub} onSelect={onSelect} onCompare={vi.fn()} />
  );
}

describe("aba Falhas", () => {
  it("o total conta as pastas de comparacao sem falha (igual ao 'Todos' e ao numero da aba)", () => {
    const orfas = [
      ev("e1", "a.txt", { storage_path: "folha/V/rod/9.9.9/comparacao/a.txt" }),
      ev("e2", "b.txt", { storage_path: "folha/V/rod/9.9.9/comparacao/b.txt" }),
    ];
    expect(montarItensFalhas(FALHAS, orfas, new Map())).toHaveLength(4);
    render(<Aba evidencias={orfas} />);
    expect(screen.getByRole("button", { name: /Todos/ })).toHaveTextContent("(4)");
  });

  it("arvore: grupos sao botoes com aria-expanded e o primeiro nivel ja vem aberto", () => {
    render(<Aba />);
    const modulo = screen.getByRole("button", { name: /\[1\] Folha/ });
    expect(modulo).toHaveAttribute("aria-expanded", "true");
    const grupo = screen.getByRole("button", { name: /\[1\.2\]/ });
    expect(grupo).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(grupo);
    expect(grupo).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: "Detalhes" }).length).toBeGreaterThan(0);
  });

  it("filtro por tipo marca o botao ativo e o foco nao se perde ao trocar", () => {
    render(<Aba />);
    const quebras = screen.getByRole("button", { name: /Quebras/ });
    quebras.focus();
    fireEvent.click(quebras);
    expect(quebras).toHaveAttribute("aria-pressed", "true");
    // Antes o botao era recriado a cada render: o elemento focado saia da pagina.
    expect(document.activeElement).toBe(quebras);
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 3 de 3 falhas");
  });

  it("card da falha nao e botao com botoes dentro: o teclado usa 'Detalhes'", () => {
    const onSelect = vi.fn();
    render(<Aba onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /\[1\.3\]/ }));
    const detalhes = screen.getAllByRole("button", { name: "Detalhes" });
    for (const b of detalhes) expect(b.parentElement?.closest('[role="button"]')).toBeNull();
    fireEvent.click(detalhes[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("busca tem rotulo para o leitor de tela", () => {
    render(<Aba />);
    expect(screen.getByRole("searchbox", { name: "Buscar falhas" })).toBeInTheDocument();
  });
});

describe("aba Falhas: resultado das reexecucoes", () => {
  it("cada caso reexecutado ganha o selo da reexecucao mais recente, com link para a rodagem dela", async () => {
    const { MemoryRouter } = await import("react-router-dom");
    window.localStorage.setItem("agenttc.falhas.view", "lista");
    const reexecucoes = [
      { pedido_id: "p1", criado_em: "2026-10-27T12:00:00Z", vm_name: "a07", status: "finalizado_falha", rodagem_id: null,
        casos: { "1.2.1": { resultado: "nao_rodou" as const } } },
      { pedido_id: "p2", criado_em: "2026-10-27T15:00:00Z", vm_name: "a07", status: "finalizado_ocorrencias", rodagem_id: "rod_reexec",
        casos: { "1.2.1": { resultado: "passou" as const }, "1.2.2": { resultado: "quebrou_de_novo" as const, tipo: "diferenca" } } },
    ];
    render(
      <MemoryRouter>
        <FalhasTab slug="folha" reexecucoes={reexecucoes} acaoReexecutar={<a href="/jenkins/reexecutar?run=r1">Reexecutar casos</a>}
          moduloNome="Folha" falhas={FALHAS} evidencias={[]} hierarchy={[]} subTab="todos" setSubTab={vi.fn()} onSelect={vi.fn()} onCompare={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Reexecutar casos" })).toBeInTheDocument();
    const passou = screen.getAllByRole("link", { name: /Passou na reexecução/ })[0];
    expect(passou).toHaveAttribute("href", "/modulo/folha?run=rod_reexec&tab=falhas");
    expect(screen.getAllByRole("link", { name: /Quebrou de novo/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Não rodou na reexecução/)).toBeNull(); // a reexecucao antiga foi substituida
  });
});
