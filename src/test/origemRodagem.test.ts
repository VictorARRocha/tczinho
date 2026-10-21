import { describe, expect, it } from "vitest";
import type { ImportPedido, RerunRequest } from "@/services/data";
import { origemDaRodagem } from "@/lib/origemRodagem";

const pedido = (extra: Partial<RerunRequest>): RerunRequest => ({
  id: "p1", fk_rodagem: null, vm_name: "a08", versao: "PRE-CLIENTES", casos_teste: "[3.2.14]", paralelo: null,
  ct_desmarcar: null, data_hora: null, branch: null, config_json: {}, status: "enviado_jenkins", jenkins_url: null,
  jenkins_queue_url: null, jenkins_build_number: null, erro: null, retorno_jenkins: null,
  created_at: "2026-10-20T10:00:00-03:00", updated_at: "2026-10-20T10:40:00-03:00",
  tipo_solicitacao: "reexecucao", solicitado_por: "ana", execution_status: "finalizado_falha", ...extra,
});
const importacao = (extra: Partial<ImportPedido>): ImportPedido => ({
  id: "imp_1", status: "concluido", requested_by: "joao", run_folder: "S:\\Logs\\A08\\PRE-CLIENTES 20_10_2026 10_25_00",
  vm: "A08", exit_code: 0, output: null, error_message: null, created_at: "", updated_at: "", finished_at: null, ...extra,
});
const rodagem = (inicio: string, pasta = "S:\\Logs\\A08\\X") => ({ data_inicio_rodagem: inicio, pasta_origem: pasta });

describe("origem da rodagem (selo na troca de rodagem)", () => {
  it("rodagem que comecou durante o pedido de reexecucao, na mesma VM", () => {
    expect(origemDaRodagem(rodagem("2026-10-20T10:05:00-03:00"), "A08", [pedido({})], [])).toEqual({
      tipo: "reexecucao", por: "ana", detalhe: "Casos: [3.2.14]",
    });
    // Outra VM, antes do pedido ou depois de ele terminar: nao e dele.
    expect(origemDaRodagem(rodagem("2026-10-20T10:05:00-03:00"), "A07", [pedido({})], [])).toBeNull();
    expect(origemDaRodagem(rodagem("2026-10-20T09:30:00-03:00"), "A08", [pedido({})], [])).toBeNull();
    expect(origemDaRodagem(rodagem("2026-10-20T11:30:00-03:00"), "A08", [pedido({})], [])).toBeNull();
  });

  it("pedido ainda rodando vale ate agora; rodagem completa e pedido que nao rodou nao contam", () => {
    const rodando = pedido({ execution_status: "rodando", updated_at: "2026-10-20T10:01:00-03:00" });
    const agora = Date.parse("2026-10-20T12:00:00-03:00");
    expect(origemDaRodagem(rodagem("2026-10-20T11:00:00-03:00"), "a08", [rodando], [], agora)?.tipo).toBe("reexecucao");
    expect(origemDaRodagem(rodagem("2026-10-20T10:05:00-03:00"), "A08", [pedido({ tipo_solicitacao: "rodagem_completa" })], [])).toBeNull();
    expect(origemDaRodagem(rodagem("2026-10-20T10:05:00-03:00"), "A08", [pedido({ execution_status: null, status: "erro_envio" })], [])).toBeNull();
  });

  it("dois pedidos na janela: fica o mais recente", () => {
    const antigo = pedido({ id: "p0", solicitado_por: "bia", created_at: "2026-10-20T09:00:00-03:00" });
    expect(origemDaRodagem(rodagem("2026-10-20T10:05:00-03:00"), "A08", [antigo, pedido({})], [])?.por).toBe("ana");
  });

  it("importada pelo dashboard: mesma pasta, importacao concluida", () => {
    const pasta = "s:/logs/a08/pre-clientes 20_10_2026 10_25_00/";
    expect(origemDaRodagem(rodagem("2026-10-20T08:00:00-03:00", pasta), "A08", [], [importacao({})])).toEqual({
      tipo: "importada", por: "joao", detalhe: "S:\\Logs\\A08\\PRE-CLIENTES 20_10_2026 10_25_00",
    });
    expect(origemDaRodagem(rodagem("2026-10-20T08:00:00-03:00", pasta), "A08", [], [importacao({ status: "erro" })])).toBeNull();
  });
});
