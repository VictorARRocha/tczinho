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
