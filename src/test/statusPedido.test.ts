import { describe, expect, it } from "vitest";
import { statusDoPedido } from "@/lib/statusPedido";
import type { RerunRequest } from "@/services/data";

const AGORA = new Date(2026, 10, 10, 12, 0, 0).getTime(); // 10/11/2026 12:00
const pedido = (execution_status: string, data_hora?: string) => ({ id: "p", execution_status, data_hora }) as unknown as RerunRequest;

describe("statusDoPedido: agendamento", () => {
  it("antes da hora agendada: aguardando horario", () => {
    for (const s of ["solicitado", "na_fila", "rodando"]) expect(statusDoPedido(pedido(s, "10/11/2026 22:00:00"), AGORA)).toBe("aguardando_horario");
  });

  it("depois da hora, sem data ou encerrado: o status de sempre", () => {
    expect(statusDoPedido(pedido("rodando", "10/11/2026 11:59:00"), AGORA)).toBe("rodando");
    expect(statusDoPedido(pedido("na_fila"), AGORA)).toBe("na_fila");
    expect(statusDoPedido(pedido("na_fila", "data invalida"), AGORA)).toBe("na_fila");
    expect(statusDoPedido(pedido("cancelado", "10/11/2026 22:00:00"), AGORA)).toBe("cancelado");
    expect(statusDoPedido(pedido("cancel_requested", "10/11/2026 22:00:00"), AGORA)).toBe("cancel_requested");
  });
});
