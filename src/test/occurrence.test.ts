import { describe, expect, it } from "vitest";
import type { Evidencia, Falha, Rodagem } from "@/types/db";
import { classifyOccurrence, classifySide, pairBaseAtual } from "@/lib/occurrence";
import { buildRodagemSlugMap, createRodagemSlug, findRodagemBySlug } from "@/lib/rodagemSlug";

const ev = (id: string, nome: string, extra: Partial<Evidencia> = {}) =>
  ({ id, nome_arquivo: nome, extensao: nome.split(".").pop(), storage_path: `contabil/V/rod/3.1/${nome}`, ...extra }) as Evidencia;

describe("pareamento base/atual do comparador", () => {
  it("pareia pelo nome logico, ignorando os sufixos de lado", () => {
    const pairs = pairBaseAtual([
      ev("1", "RelatorioVerbas_Antigo.txt"),
      ev("2", "RelatorioVerbas_Atual.txt"),
      ev("3", "Outro_Base.csv"),
      ev("4", "Outro_Gerado.csv"),
    ]);
    const byBase = Object.fromEntries(pairs.map((p) => [p.base?.nome_arquivo, p.atual?.nome_arquivo]));
    expect(byBase).toEqual({
      "RelatorioVerbas_Antigo.txt": "RelatorioVerbas_Atual.txt",
      "Outro_Base.csv": "Outro_Gerado.csv",
    });
  });

  it("nao pareia arquivos de extensoes diferentes nem lado sem par", () => {
    expect(pairBaseAtual([ev("1", "Rel_Antigo.txt"), ev("2", "Rel_Atual.csv")])).toEqual([]);
    expect(pairBaseAtual([ev("1", "Rel_Antigo.txt")])).toEqual([]);
  });

  it("usa o tipo informado pela API antes do nome", () => {
    expect(classifySide(ev("1", "qualquer.txt", { tipo: "comparacao_base" }))).toBe("base");
    expect(classifySide(ev("2", "qualquer.txt", { tipo: "comparacao_atual" }))).toBe("atual");
  });

  it("pasta comparacao com dois arquivos sem sufixo vira par automatico", () => {
    const pairs = pairBaseAtual([
      ev("1", "a.txt", { storage_path: "m/v/r/3.1/comparacao/a.txt" }),
      ev("2", "b.txt", { storage_path: "m/v/r/3.1/comparacao/b.txt" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].auto).toBe(true);
  });
});

describe("classificacao da ocorrencia", () => {
  const falha = (extra: Partial<Falha>) => ({ id: "f1", ...extra }) as Falha;
  const par = [ev("1", "Rel_Antigo.txt"), ev("2", "Rel_Atual.txt")];

  it("quebra quando ha erro tecnico e nao ha comparacao", () => {
    expect(classifyOccurrence(falha({ erro_principal: "Object not found: btnSalvar" }), [])).toBe("quebra");
  });

  it("diferenca quando ha par de comparacao sem erro tecnico", () => {
    expect(classifyOccurrence(falha({}), par)).toBe("diferenca");
  });

  it("quebra com diferenca quando ha as duas coisas", () => {
    expect(classifyOccurrence(falha({ erro_principal: "Exception no relatorio" }), par)).toBe("quebra_diferenca");
  });

  it("respeita o tipo vindo da API", () => {
    expect(classifyOccurrence(falha({ tipo_ocorrencia: "test_break" } as Partial<Falha>), [])).toBe("quebra");
    expect(classifyOccurrence(falha({ tipo_ocorrencia: "report_difference" } as Partial<Falha>), [])).toBe("diferenca");
  });
});

describe("links de rodagem", () => {
  const rodagem = (id: string, data: string) =>
    ({ id, versao_sistema: "PROXIMA", data_inicio_rodagem: data }) as Rodagem;

  it("gera o slug com versao, data e hora", () => {
    expect(createRodagemSlug(rodagem("rod_1", "2026-10-02T10:00:00"))).toBe("proxima021020261000");
  });

  it("diferencia rodagens no mesmo minuto pelo final do id", () => {
    const a = rodagem("rod_a08_x_111111", "2026-10-02T10:00:00");
    const b = rodagem("rod_a07_x_222222", "2026-10-02T10:00:00");
    const map = buildRodagemSlugMap([a, b]);
    expect(map.get(a.id)).not.toBe(map.get(b.id));
    expect(findRodagemBySlug([a, b], map.get(b.id))?.id).toBe(b.id);
  });

  it("aceita o id cru e devolve null para slug desconhecido", () => {
    const a = rodagem("rod_1", "2026-10-02T10:00:00");
    expect(findRodagemBySlug([a], "rod_1")?.id).toBe("rod_1");
    expect(findRodagemBySlug([a], "nao-existe")).toBeNull();
  });
});
