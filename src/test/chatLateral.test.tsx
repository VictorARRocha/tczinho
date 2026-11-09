import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const askChat = vi.fn();
vi.mock("@/services/aiGrouping", () => ({ askChat: (...a: unknown[]) => askChat(...a) }));

import { ChatLateral } from "@/components/ChatLateral";

describe("assistente flutuante", () => {
  it("envia o historico, mostra a resposta com negrito e mantem a conversa ao fechar", async () => {
    askChat.mockResolvedValueOnce("Fiscal teve **4 falhas**.");
    render(<ChatLateral />);
    fireEvent.click(screen.getByRole("button", { name: "Assistente de IA" }));
    fireEvent.change(screen.getByLabelText("Pergunta"), { target: { value: "resuma o fiscal" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
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
});
