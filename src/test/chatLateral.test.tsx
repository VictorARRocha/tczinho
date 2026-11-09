import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const askChat = vi.fn();
const createRerunRequest = vi.fn();
const cancelRerunRequest = vi.fn();
vi.mock("@/services/aiGrouping", () => ({ askChat: (...a: unknown[]) => askChat(...a) }));
vi.mock("@/services/data", () => ({
  createRerunRequest: (...a: unknown[]) => createRerunRequest(...a),
  cancelRerunRequest: (...a: unknown[]) => cancelRerunRequest(...a),
  formatNowBr: () => "10/11/2026 10:00:00",
  formatNowMinusOneMinuteBr: () => "10/11/2026 09:59:00",
}));
vi.mock("@/services/queries", () => ({ invalidateRerunRequests: vi.fn() }));

import { ChatLateral } from "@/components/ChatLateral";

const RODAGEM = {
  tipo: "rodagem",
  titulo: "Rodagem completa",
  itens: [["Módulo", "Contábil"], ["VM", "A08"], ["Quando", "Agora"]],
  payload: { vm_name: "a08", versao: "proxima", casos_teste: "[3], [4], [7]", paralelo: "", ct_desmarcar: "[0.3]", data_hora: "", branch: "" },
};

function perguntar(texto: string) {
  render(<ChatLateral />);
  fireEvent.click(screen.getByRole("button", { name: "Assistente de IA" }));
  fireEvent.change(screen.getByLabelText("Pergunta"), { target: { value: texto } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("assistente flutuante", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia o historico, mostra a resposta com negrito e mantem a conversa ao fechar", async () => {
    askChat.mockResolvedValueOnce({ resposta: "Fiscal teve **4 falhas**.", propostas: [] });
    perguntar("resuma o fiscal");
    expect(await screen.findByText("4 falhas")).toHaveProperty("tagName", "STRONG");
    expect(askChat).toHaveBeenCalledWith([{ role: "user", content: "resuma o fiscal" }]);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assistente de IA" }));
    expect(screen.getByText("4 falhas")).toBeInTheDocument();
  });

  it("mostra o erro da API", async () => {
    askChat.mockRejectedValueOnce({ status: 503, message: "GEMINI_API_KEY nao configurada" });
    render(<ChatLateral />);
    fireEvent.click(screen.getByRole("button", { name: "Assistente de IA" }));
    fireEvent.click(screen.getByRole("button", { name: "Como foi a última rodagem de cada módulo?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("GEMINI_API_KEY nao configurada");
  });

  it("proposta so e enviada no Confirmar, com a hora do clique", async () => {
    askChat.mockResolvedValueOnce({ resposta: "Confira o cartão.", propostas: [RODAGEM] });
    createRerunRequest.mockResolvedValueOnce({});
    perguntar("roda o contabil na a08");
    expect(await screen.findByText("Rodagem completa")).toBeInTheDocument();
    expect(createRerunRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pedido enviado");
    expect(createRerunRequest).toHaveBeenCalledWith({ ...RODAGEM.payload, data_hora: "10/11/2026 09:59:00" });
  });

  it("descartar nao envia e erro da API aparece no cartao", async () => {
    const cancelar = { tipo: "cancelamento", titulo: "Cancelar pedido", itens: [["VM", "A08"]], pedido_id: "p1" };
    askChat.mockResolvedValueOnce({ resposta: "Confira.", propostas: [RODAGEM, cancelar] });
    cancelRerunRequest.mockRejectedValueOnce(new Error("Voce nao tem permissao para solicitar rodagens."));
    perguntar("varias");
    fireEvent.click((await screen.findAllByRole("button", { name: "Descartar" }))[0]); // o da rodagem
    expect(screen.getByText("Descartado. Nada foi enviado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permissao");
    expect(cancelRerunRequest).toHaveBeenCalledWith("p1", "Cancelado pelo assistente do dashboard.");
    expect(createRerunRequest).not.toHaveBeenCalled();
  });
});
