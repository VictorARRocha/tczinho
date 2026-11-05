import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = { requestPasswordReset: vi.fn(), checkPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() };
vi.mock("@/services/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/authApi")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      requestPasswordReset: (...a: unknown[]) => api.requestPasswordReset(...a),
      checkPasswordReset: (...a: unknown[]) => api.checkPasswordReset(...a),
      confirmPasswordReset: (...a: unknown[]) => api.confirmPasswordReset(...a),
    },
  };
});

import EsqueciSenha, { MENSAGEM_PEDIDO } from "@/pages/EsqueciSenha";
import RedefinirSenha from "@/pages/RedefinirSenha";

describe("esqueci a senha", () => {
  it("pede a redefinicao e avisa que precisa de aprovacao", async () => {
    api.requestPasswordReset.mockResolvedValue({ ok: true });
    render(<MemoryRouter><EsqueciSenha /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Usuário"), { target: { value: "bia" } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir redefinição" }));
    expect(await screen.findByRole("status")).toHaveTextContent(MENSAGEM_PEDIDO);
    expect(api.requestPasswordReset).toHaveBeenCalledWith("bia");
  });

  it("link: senha digitada duas vezes, iguais", async () => {
    api.checkPasswordReset.mockResolvedValue({ ok: true, username: "bia" });
    api.confirmPasswordReset.mockResolvedValue({ ok: true, username: "bia" });
    render(<MemoryRouter initialEntries={["/redefinir-senha?token=usr_1.abc"]}><RedefinirSenha /></MemoryRouter>);
    expect(await screen.findByText("bia")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha-nova" } });
    fireEvent.change(screen.getByLabelText("Confirme a nova senha"), { target: { value: "senha-outra" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("As senhas não conferem.");
    expect(api.confirmPasswordReset).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirme a nova senha"), { target: { value: "senha-nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Senha alterada");
    expect(api.confirmPasswordReset).toHaveBeenCalledWith("usr_1.abc", "senha-nova");
  });

  it("link invalido ou ja usado", async () => {
    api.checkPasswordReset.mockRejectedValue(new Error("invalid_reset_token"));
    render(<MemoryRouter initialEntries={["/redefinir-senha?token=usado"]}><RedefinirSenha /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Link inválido, expirado ou já usado");
  });
});
