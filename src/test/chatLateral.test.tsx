import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const askChat = vi.fn();
vi.mock("@/services/aiGrouping", () => ({ askChat: (...a: unknown[]) => askChat(...a) }));

import { ChatLateral } from "@/components/ChatLateral";

describe("chat lateral", () => {
  it("envia o historico e mostra a resposta", async () => {
    askChat.mockResolvedValueOnce("Fiscal: 4 falhas.");
    render(<ChatLateral />);
    fireEvent.click(screen.getByRole("button", { name: "Assistente de IA" }));
    fireEvent.change(screen.getByLabelText("Pergunta"), { target: { value: "resuma o fiscal" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Fiscal: 4 falhas.")).toBeInTheDocument();
    expect(askChat).toHaveBeenCalledWith([{ role: "user", content: "resuma o fiscal" }]);
  });

  it("mostra o erro da API", async () => {
    askChat.mockRejectedValueOnce({ status: 503, message: "GEMINI_API_KEY nao configurada" });
    render(<ChatLateral />);
    fireEvent.click(screen.getByRole("button", { name: "Assistente de IA" }));
    fireEvent.click(screen.getByRole("button", { name: "Como foi a última rodagem de cada módulo?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("GEMINI_API_KEY nao configurada");
  });
});
