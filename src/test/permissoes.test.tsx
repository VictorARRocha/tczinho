import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppUserProfile } from "@/services/authApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { profile: { id: "u_chefe", username: "chefe" }, refreshProfile: vi.fn(), signUp: vi.fn() };
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
import Cadastro from "@/pages/Cadastro";
import { modulosDosCasos, podeNoModulo, temPermissao, temTodosModulos } from "@/lib/permissoes";

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const user = (extra: Partial<AppUserProfile>): AppUserProfile => ({
  id: "u_ana", username: "ana", first_name: "Ana", last_name: null, email: "ana@x", role: "user", status: "approved",
  permissions: [], modules: ["*"], ...extra,
});

beforeEach(() => {
  api.updateUser.mockReset();
  api.updateUser.mockImplementation(async (id: string, data: Partial<AppUserProfile>) => {
    api.users = api.users.map((u) => (u.id === id ? { ...u, ...data } : u));
    return { user: api.users.find((u) => u.id === id) };
  });
  auth.signUp.mockReset();
});

describe("regras de permissao e modulo na tela", () => {
  it("admin pode tudo; os outros so o que esta na lista", () => {
    expect(temPermissao({ permissions: [] }, true, "regravar")).toBe(true);
    expect(temPermissao({ permissions: ["merge"] }, false, "merge")).toBe(true);
    expect(temPermissao({ permissions: ["merge"] }, false, "rodagem")).toBe(false);
    expect(temPermissao({}, false, "rodagem")).toBe(false);
    expect(temPermissao(null, false, "rodagem")).toBe(false);
  });

  it("modulos: todos, lista e perfil sem a informacao (API antiga = todos)", () => {
    expect(temTodosModulos({ modules: ["*"] }, false)).toBe(true);
    expect(temTodosModulos({}, false)).toBe(true);
    expect(temTodosModulos({ modules: ["folha"] }, true)).toBe(true);
    expect(podeNoModulo({ modules: ["folha"] }, false, "folha")).toBe(true);
    expect(podeNoModulo({ modules: ["folha"] }, false, "fiscal")).toBe(false);
    expect(podeNoModulo({ modules: [] }, false, "folha")).toBe(false);
    expect(podeNoModulo({ modules: ["folha"] }, false, null)).toBe(false);
  });

  it("modulo dos casos de teste igual ao da API ([0.x] nao conta)", () => {
    expect(modulosDosCasos("[2.1.3], [2.1.4]")).toEqual(["fiscal"]);
    expect(modulosDosCasos("[3], [4], [7]")).toEqual(["contabil"]);
    expect(modulosDosCasos("[0.4], [0.5], [9.1.4]")).toEqual(["gestao"]);
    expect(modulosDosCasos("[16.1], [19.2]")).toEqual(["suprema", "practice"]);
    expect(modulosDosCasos("[0.3]")).toEqual([]);
    expect(modulosDosCasos(null)).toEqual([]);
  });
});

async function abrirAprovados() {
  render(<MemoryRouter><AdminUsuarios /></MemoryRouter>);
  const aba = await screen.findByRole("tab", { name: /Aprovado/ });
  fireEvent.mouseDown(aba);
  fireEvent.click(aba);
}

describe("tela de usuarios", () => {
  it("lista compacta: resumo do acesso em etiquetas, sem caixinhas", async () => {
    api.users = [
      user({ permissions: ["rodagem"], modules: ["folha", "fiscal"] }),
      user({ id: "u_bia", username: "bia", modules: ["*"] }),
      user({ id: "u_chefe", username: "chefe", role: "admin" }),
    ];
    await abrirAprovados();
    const ana = await screen.findByLabelText("Acesso de ana");
    expect(within(ana).getByText("Solicitar rodagem")).toBeInTheDocument();
    expect(within(ana).getByText("Folha")).toBeInTheDocument();
    expect(within(ana).getByText("Fiscal")).toBeInTheDocument();
    const bia = screen.getByLabelText("Acesso de bia");
    expect(within(bia).getByText("só visualiza")).toBeInTheDocument();
    expect(within(bia).getByText("Todos os módulos")).toBeInTheDocument();
    expect(screen.getByText("Administrador: pode tudo")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("editar acesso: liga/desliga acoes e modulos e salva tudo junto", async () => {
    api.users = [user({ permissions: ["rodagem"], modules: ["folha", "fiscal"] })];
    await abrirAprovados();
    fireEvent.click(await screen.findByRole("button", { name: /Editar acesso/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Solicitar rodagem/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: /Fazer merge/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Fiscal/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u_ana", { permissions: ["rodagem", "merge"], modules: ["folha"] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("'Todos os modulos' liga a lista inteira; sem nenhum modulo, avisa que so visualiza", async () => {
    api.users = [user({ modules: ["folha"] })];
    await abrirAprovados();
    fireEvent.click(await screen.findByRole("button", { name: /Editar acesso/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Folha/ }));
    expect(within(dialog).getByText("Sem nenhum módulo, a pessoa só visualiza.")).toBeInTheDocument();
    const todos = within(dialog).getByRole("switch", { name: /Todos os módulos/ });
    fireEvent.click(todos);
    expect(todos).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).queryByRole("group", { name: "Módulos" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u_ana", { permissions: [], modules: ["*"] }));
  });

  it("tornar admin fica dentro da janela", async () => {
    api.users = [user({})];
    await abrirAprovados();
    fireEvent.click(await screen.findByRole("button", { name: /Editar acesso/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Tornar admin/ }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u_ana", { role: "admin" }));
  });

  it("cadastro pendente: revisa com os modulos pedidos ja marcados e aprova", async () => {
    api.users = [user({ status: "pending", modules: ["folha"] })];
    render(<MemoryRouter><AdminUsuarios /></MemoryRouter>);
    expect(within(await screen.findByLabelText("Acesso de ana")).getByText("Pediu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revisar e aprovar/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Pedido no cadastro: Folha")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Folha/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: /Solicitar rodagem/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith("u_ana", { permissions: ["rodagem"], modules: ["folha"], status: "approved" }));
  });
});

describe("cadastro", () => {
  function preencher() {
    render(<MemoryRouter><Cadastro /></MemoryRouter>);
    const [usuario, nome, sobrenome] = screen.getAllByRole("textbox");
    fireEvent.change(usuario, { target: { value: "nova.pessoa" } });
    fireEvent.change(nome, { target: { value: "Nova" } });
    fireEvent.change(sobrenome, { target: { value: "Pessoa" } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "senha-forte" } });
  }

  it("escolhe os modulos numa lista de checagem e eles vao no cadastro", async () => {
    auth.signUp.mockResolvedValue({ error: null });
    preencher();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByText("Escolha pelo menos um módulo")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();

    const campo = screen.getByRole("button", { name: "Módulos que você usa" });
    expect(campo).toHaveTextContent("Escolha os módulos");
    fireEvent.click(campo);
    const lista = await screen.findByRole("group", { name: "Módulos" });
    fireEvent.click(within(lista).getByRole("checkbox", { name: "Fiscal" }));
    fireEvent.click(within(lista).getByRole("checkbox", { name: "Folha" }));
    expect(campo).toHaveTextContent("Folha, Fiscal");

    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ username: "nova.pessoa", modules: ["folha", "fiscal"] })));
  });
});
