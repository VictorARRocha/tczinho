import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppUserProfile } from "@/services/authApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { profile: { id: "u_chefe", username: "chefe" }, refreshProfile: vi.fn() };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = { users: [] as AppUserProfile[], updateUser: vi.fn() };
vi.mock("@/services/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/authApi")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      users: async () => ({ users: api.users }),
      updateUser: (...args: unknown[]) => api.updateUser(...args),
    },
  };
});

import AdminUsuarios from "@/pages/AdminUsuarios";
import { temPermissao } from "@/lib/permissoes";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const user = (extra: Partial<AppUserProfile>): AppUserProfile => ({
  id: "u_ana", username: "ana", first_name: "Ana", last_name: null, email: "ana@x", role: "user", status: "approved",
  permissions: [], ...extra,
});

beforeEach(() => {
  api.updateUser.mockReset();
  api.updateUser.mockImplementation(async (id: string, data: { permissions?: string[] }) => {
    api.users = api.users.map((u) => (u.id === id ? { ...u, ...data } : u));
    return { user: api.users.find((u) => u.id === id) };
  });
});

describe("regra de permissao na tela", () => {
  it("admin pode tudo; os outros so o que esta na lista", () => {
    expect(temPermissao({ permissions: [] }, true, "regravar")).toBe(true);
    expect(temPermissao({ permissions: ["merge"] }, false, "merge")).toBe(true);
    expect(temPermissao({ permissions: ["merge"] }, false, "rodagem")).toBe(false);
    expect(temPermissao({}, false, "rodagem")).toBe(false);
    expect(temPermissao(null, false, "rodagem")).toBe(false);
  });
});

describe("tela de usuarios", () => {
  it("admin marca e desmarca as permissoes de cada usuario", async () => {
    api.users = [
      user({}),
      user({ id: "u_chefe", username: "chefe", role: "admin" }),
    ];
    render(<MemoryRouter><AdminUsuarios /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Aprovado/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Aprovado/ }));
    const grupo = await screen.findByRole("group", { name: "Permissões de ana" });
    const rodagem = within(grupo).getByRole("checkbox", { name: "Solicitar rodagem (ana)" });
    expect(rodagem).not.toBeChecked();
    expect(screen.getByText("Administrador: pode tudo.")).toBeInTheDocument();

    fireEvent.click(rodagem);
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u_ana", { permissions: ["rodagem"] }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Permissões de ana" })).getByRole("checkbox", { name: "Solicitar rodagem (ana)" })).toBeChecked());

    fireEvent.click(within(screen.getByRole("group", { name: "Permissões de ana" })).getByRole("checkbox", { name: "Regravar arquivos (ana)" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenLastCalledWith("u_ana", { permissions: ["rodagem", "regravar"] }));

    await waitFor(() => expect(within(screen.getByRole("group", { name: "Permissões de ana" })).getByRole("checkbox", { name: "Solicitar rodagem (ana)" })).not.toBeDisabled());
    fireEvent.click(within(screen.getByRole("group", { name: "Permissões de ana" })).getByRole("checkbox", { name: "Solicitar rodagem (ana)" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenLastCalledWith("u_ana", { permissions: ["regravar"] }));
  });

  it("cadastro pendente ja mostra as permissoes para marcar antes de aprovar", async () => {
    api.users = [user({ status: "pending" })];
    render(<MemoryRouter><AdminUsuarios /></MemoryRouter>);
    expect(await screen.findByRole("group", { name: "Permissões de ana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aprovar/ })).toBeInTheDocument();
  });
});
