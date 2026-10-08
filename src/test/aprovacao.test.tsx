import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { AppUserProfile, LocalAuthError } from "@/services/authApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = { register: vi.fn(), login: vi.fn(), me: vi.fn(), logout: vi.fn() };
vi.mock("@/services/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/authApi")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      register: (...a: unknown[]) => api.register(...a),
      login: (...a: unknown[]) => api.login(...a),
      me: (...a: unknown[]) => api.me(...a),
      logout: (...a: unknown[]) => api.logout(...a),
    },
  };
});

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AguardandoAprovacao from "@/pages/AguardandoAprovacao";

const usuario = (status: AppUserProfile["status"]) => ({
  id: "u_bia", username: "bia", first_name: "Bia", last_name: null, email: null, role: "user", status,
}) as AppUserProfile;

const pendente = () => Object.assign(new Error("Usuario ainda nao aprovado."), { status: 403, code: "user_not_approved" }) as LocalAuthError;

function Cadastrar() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  return (
    <button onClick={async () => {
      await signUp({ username: "bia", first_name: "Bia", last_name: "", password: "senha-forte", modules: ["fiscal"] });
      nav("/aguardando-aprovacao");
    }}>Cadastrar</button>
  );
}

function renderFluxo(inicio = "/cadastro") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[inicio]}>
        <Routes>
          <Route path="/cadastro" element={<Cadastrar />} />
          <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
          <Route path="/" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.register.mockResolvedValue({ ok: true, user: usuario("pending") });
  api.me.mockResolvedValue({ ok: true, user: usuario("approved") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tela de cadastro pendente", () => {
  it("entra sozinha no dashboard quando o admin aprova", async () => {
    api.login.mockRejectedValueOnce(pendente()).mockRejectedValueOnce(pendente())
      .mockResolvedValueOnce({ ok: true, token: "tok", user: usuario("approved"), session: { id: "s", expires_at: "2099-01-01T00:00:00Z" } });
    renderFluxo();
    fireEvent.click(await screen.findByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByText("Cadastro pendente de aprovação")).toBeInTheDocument();
    expect(screen.getByText(/você entra automaticamente/)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(5000)); // ainda pendente
    expect(screen.getByText("Cadastro pendente de aprovação")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000)); // aprovado
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(api.login).toHaveBeenLastCalledWith("bia", "senha-forte");
    expect(localStorage.getItem("agent_tc_auth_token")).toBe("tok");
    // A senha nao foi parar no navegador.
    expect(JSON.stringify(localStorage)).not.toContain("senha-forte");
  });

  it("aberta direto (recarregou a pagina): nao tem como conferir sozinha e mostra o login", async () => {
    renderFluxo("/aguardando-aprovacao");
    expect(await screen.findByText("Cadastro pendente de aprovação")).toBeInTheDocument();
    expect(screen.queryByText(/você entra automaticamente/)).toBeNull();
    expect(screen.getByRole("link", { name: "Ir para login" })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(api.login).not.toHaveBeenCalled();
  });
});
