import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { RerunRequest } from "@/services/qa";
import type { RunPreset } from "@/services/data";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = { isAdmin: false, profile: { username: "ana", permissions: ["rodagem", "merge", "regravar"] as string[] } };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const api = {
  requests: [] as RerunRequest[],
  presets: [] as RunPreset[],
  failPresets: false,
  createRerunRequest: vi.fn(),
  createRunPreset: vi.fn(),
  updateRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
};
vi.mock("@/services/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/data")>();
  return {
    ...actual,
    fetchRerunRequests: async () => api.requests,
    fetchRunPresets: async () => {
      if (api.failPresets) throw new Error("API fora");
      return api.presets;
    },
    createRerunRequest: (...args: unknown[]) => api.createRerunRequest(...args),
    createRunPreset: (...args: unknown[]) => api.createRunPreset(...args),
    updateRunPreset: (...args: unknown[]) => api.updateRunPreset(...args),
    deleteRunPreset: (...args: unknown[]) => api.deleteRunPreset(...args),
  };
});

// Conta as renderizacoes do historico: cada render dele chama useRerunRequests.
const historyRenders = { count: 0 };
vi.mock("@/services/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/queries")>();
  return {
    ...actual,
    useRerunRequests: (limit?: number) => {
      historyRenders.count += 1;
      return actual.useRerunRequests(limit);
    },
  };
});

import { queryClient } from "@/lib/queryClient";
import { toast } from "sonner";
import JenkinsHome from "@/pages/JenkinsHome";
import JenkinsRodagemCompleta from "@/pages/JenkinsRodagemCompleta";
import { JenkinsHistory } from "@/components/JenkinsHistory";
import { visibleAfterClear } from "@/lib/historyClear";
import { parseConfigText, sameConfig, validateConfigForSubmit, withDataHora } from "@/lib/jenkinsConfig";

// Componentes Radix usam APIs de ponteiro/rolagem que o jsdom nao tem.
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

const request = (id: string, created_at: string, status: string): RerunRequest =>
  ({ id, created_at, status, execution_status: status, vm_name: "a07", versao: "PROXIMA", casos_teste: "[2]", config_json: {} }) as unknown as RerunRequest;

const preset = (id: string, name: string, mode: "simplificada" | "configurada", config_json: Record<string, unknown>): RunPreset => ({
  id, name, mode, config_json, created_by: "ana", updated_by: "ana",
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
});

function renderPage(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openPresetList() {
  const trigger = await screen.findByRole("button", { name: "Pré-definição" });
  await waitFor(() => expect(trigger).not.toBeDisabled());
  fireEvent.click(trigger);
}

async function choosePreset(name: string) {
  await openPresetList();
  fireEvent.click(await screen.findByRole("button", { name }));
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  api.requests = [];
  api.presets = [];
  api.failPresets = false;
  auth.isAdmin = false;
  auth.profile = { username: "ana", permissions: ["rodagem", "merge", "regravar"] as string[] };
  for (const fn of [api.createRerunRequest, api.createRunPreset, api.updateRunPreset, api.deleteRunPreset]) fn.mockReset();
  vi.mocked(toast.error).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("CONFIG_JSON", () => {
  it("le o texto do editor e aponta JSON invalido", () => {
    expect(parseConfigText('{"vm_name": "a07"}').config).toEqual({ vm_name: "a07" });
    expect(parseConfigText("{vm_name: a07}").error).toMatch(/JSON inválido/);
    expect(parseConfigText("[1]").error).toMatch(/objeto/);
  });

  it("valida com as mesmas regras da tela antiga", () => {
    const ok = { vm_name: "a07", versao: "PROXIMA", casos_teste: "[2]", ct_desmarcar: "[0.3]", data_hora: "05/10/2026 10:00:00", branch: "" };
    expect(validateConfigForSubmit(ok)).toBeNull();
    expect(validateConfigForSubmit({ ...ok, versao: " " })).toMatch(/versao/);
    expect(validateConfigForSubmit({ ...ok, casos_teste: "2.1" })).toMatch(/colchetes/);
    expect(validateConfigForSubmit({ ...ok, data_hora: "2026-10-05" })).toMatch(/dd\/MM\/yyyy/);
    expect(validateConfigForSubmit({ ...ok, branch: 1 })).toMatch(/branch/);
    expect(validateConfigForSubmit({ ...ok, status: "finalizado_sucesso" })).toMatch(/"status" é reservada/);
    expect(validateConfigForSubmit({ ...ok, test_cases: "[1]" })).toMatch(/reservada/);
    expect(validateConfigForSubmit({ ...ok, campo_novo_jenkins: "x" })).toBeNull();
  });

  it("insere a data/hora na ordem usual e compara ignorando data/hora e ordem", () => {
    const merged = withDataHora({ branch: "x", vm_name: "a07", extra: 1 }, "01/01/2026 00:00:00");
    expect(Object.keys(merged)).toEqual(["vm_name", "data_hora", "branch", "extra"]);
    expect(sameConfig({ a: 1, b: { c: 2 }, data_hora: "1" }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(sameConfig({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("historico Jenkins", () => {
  const old = (id: string, status = "finalizado_sucesso") => request(id, "2026-10-01T10:00:00Z", status);

  it("oculta por ID: o que rodava na limpeza continua aparecendo ao terminar", () => {
    const list = [old("fin"), old("ativo", "rodando"), request("nova", "2026-10-05T12:00:00Z", "finalizado_falha")];
    const hidden = new Set(["fin"]); // "ativo" nao entra: rodava quando limpou
    expect(visibleAfterClear(list, hidden).map((r) => r.id)).toEqual(["ativo", "nova"]);
    const terminou = [old("fin"), old("ativo", "finalizado_sucesso")];
    expect(visibleAfterClear(terminou, hidden).map((r) => r.id)).toEqual(["ativo"]);
    expect(visibleAfterClear(list, new Set())).toHaveLength(3);
  });

  it("limpa localmente, lembra ao recarregar e permite mostrar tudo de novo", async () => {
    api.requests = [old("r1"), old("r2", "finalizado_falha"), old("r3", "rodando")];
    const view = renderPage(<JenkinsHistory />);
    fireEvent.click(screen.getByRole("button", { name: /Expandir/ }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: /Limpar/ }));
    expect(screen.getAllByRole("row")).toHaveLength(2); // cabecalho + pedido ainda rodando
    expect(screen.getByRole("button", { name: /2 ocultas/ })).toBeInTheDocument();
    view.unmount();

    renderPage(<JenkinsHistory />);
    fireEvent.click(screen.getByRole("button", { name: /Expandir/ }));
    await screen.findByRole("button", { name: /2 ocultas/ });
    expect(screen.getAllByRole("row")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Mostrar todas/ }));
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("nao aparece mais na pagina principal do Jenkins", () => {
    renderPage(<JenkinsHome />);
    expect(screen.getByText("Rodagem completa")).toBeInTheDocument();
    expect(screen.queryByText("Histórico Jenkins")).toBeNull();
  });
});

describe("rodagem completa", () => {
  function openConfigurada() {
    renderPage(<JenkinsRodagemCompleta />);
    const tab = screen.getByRole("tab", { name: "Configurada" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    return screen.getByLabelText("CONFIG_JSON") as HTMLTextAreaElement;
  }

  const nfe = () =>
    preset("p1", "Casos NFe", "configurada", { vm_name: "a09", versao: "PROXIMA", casos_teste: "[2.1.3]", ct_desmarcar: "[0.3]", branch: "" });

  it("configurada: edita o JSON direto, sem os campos antigos, e envia o objeto", async () => {
    api.createRerunRequest.mockResolvedValue({});
    const editor = openConfigurada();
    expect(screen.queryByText("ct_desmarcar", { selector: "label" })).toBeNull();
    expect(JSON.parse(editor.value)).toMatchObject({ vm_name: "a07", ct_desmarcar: "[0.3]" });

    fireEvent.change(editor, { target: { value: "{ quebrado" } });
    expect(screen.getByText(/JSON inválido/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Enviar rodagem/ }));
    expect(api.createRerunRequest).not.toHaveBeenCalled();

    const config = { vm_name: "a08", versao: " PROXIMA ", casos_teste: "[9.1.4.1.3]", paralelo: "", ct_desmarcar: "[0.3]", data_hora: "05/10/2026 10:00:00", branch: "" };
    fireEvent.change(editor, { target: { value: JSON.stringify(config) } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar rodagem/ }));
    await waitFor(() => expect(api.createRerunRequest).toHaveBeenCalledTimes(1));
    expect(api.createRerunRequest).toHaveBeenCalledWith({ ...config, versao: "PROXIMA" });
  });

  it("configurada: aplica pre-definicao, mostra o que mudou, salva nela ou desfaz", async () => {
    api.presets = [nfe(), preset("p2", "Fiscal a07", "simplificada", { vm_name: "a07", modulo: "Fiscal", versao: "PROXIMA" })];
    api.updateRunPreset.mockResolvedValue(api.presets[0]);
    const editor = openConfigurada();

    await openPresetList();
    expect(screen.queryByRole("button", { name: "Fiscal a07" })).toBeNull(); // so as da aba
    fireEvent.click(screen.getByRole("button", { name: "Casos NFe" }));
    const applied = JSON.parse(editor.value);
    expect(applied).toMatchObject({ vm_name: "a09", casos_teste: "[2.1.3]" });
    expect(applied.data_hora).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    expect(screen.queryByRole("button", { name: /Salvar em/ })).toBeNull();

    fireEvent.change(editor, { target: { value: JSON.stringify({ ...applied, casos_teste: "[2.1.4]" }) } });
    expect(screen.getByText(/\[2\.1\.3\] → \[2\.1\.4\]/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    expect(JSON.parse(editor.value).casos_teste).toBe("[2.1.3]");
    expect(screen.queryByRole("button", { name: /Salvar em/ })).toBeNull();

    fireEvent.change(editor, { target: { value: JSON.stringify({ ...applied, casos_teste: "[2.1.4]" }) } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar em .Casos NFe./ }));
    await waitFor(() => expect(api.updateRunPreset).toHaveBeenCalledTimes(1));
    expect(api.updateRunPreset.mock.calls[0][0]).toBe("p1");
    expect(api.updateRunPreset.mock.calls[0][1].config.casos_teste).toBe("[2.1.4]");
  });

  it("lapis: renomeia e, se marcado, troca a configuracao pela da tela", async () => {
    api.presets = [nfe()];
    api.updateRunPreset.mockResolvedValue(api.presets[0]);
    const editor = openConfigurada();
    await choosePreset("Casos NFe");
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...JSON.parse(editor.value), vm_name: "a10" }) } });

    await openPresetList();
    fireEvent.click(screen.getByRole("button", { name: "Editar Casos NFe" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("a09")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox")).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "NFe a10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.updateRunPreset).toHaveBeenCalledTimes(1));
    expect(api.updateRunPreset.mock.calls[0][1]).toMatchObject({ nome: "NFe a10", config: { vm_name: "a10" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // So renomear: desmarcado nao envia configuracao.
    api.updateRunPreset.mockClear();
    await openPresetList();
    fireEvent.click(screen.getByRole("button", { name: "Editar Casos NFe" }));
    const again = await screen.findByRole("dialog");
    const box = within(again).getByRole("checkbox");
    if (box.getAttribute("aria-checked") === "true") fireEvent.click(box);
    fireEvent.click(within(again).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.updateRunPreset).toHaveBeenCalledTimes(1));
    expect(api.updateRunPreset.mock.calls[0][1]).toEqual({ nome: "Casos NFe" });
  });

  it("falha ao recarregar mantem as pre-definicoes ja carregadas", async () => {
    api.presets = [nfe()];
    openConfigurada();
    await choosePreset("Casos NFe");
    api.failPresets = true;
    queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["run-presets"] }).catch(() => {});
    });
    expect(queryClient.getQueryState(["run-presets"])?.status).toBe("error");
    const trigger = screen.getByRole("button", { name: "Pré-definição" });
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveTextContent("Casos NFe");
  });

  it("lixeira na lista exclui a pre-definicao", async () => {
    api.presets = [nfe()];
    api.deleteRunPreset.mockImplementation(async () => {
      api.presets = [];
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    openConfigurada();
    await openPresetList();
    fireEvent.click(screen.getByRole("button", { name: "Excluir Casos NFe" }));
    await waitFor(() => expect(api.deleteRunPreset).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("Nenhuma pré-definição salva")).toBeInTheDocument();
  });

  it("telas sem os textos de apoio antigos: sem casos_teste enviado, sem exemplo na versao, sem Formatar/Copiar no JSON", () => {
    renderPage(<JenkinsRodagemCompleta />);
    expect(screen.queryByText(/casos_teste enviado/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Versão" })).not.toHaveAttribute("placeholder");
    const tab = screen.getByRole("tab", { name: "Configurada" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(screen.getByRole("button", { name: /Data\/hora agora/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Formatar/ })).toBeNull();
    // O unico "Copiar" que sobra e o da previa da simplificada, que nao fica visivel nesta aba.
    expect(screen.queryByRole("button", { name: /^Copiar$/ })).toBeNull();
  });

  it("abas: minhas (editar/excluir) e de outros usuarios agrupadas por quem criou (usar/copiar)", async () => {
    api.presets = [
      nfe(),
      { ...preset("p2", "NFe do Joao", "configurada", { vm_name: "a02" }), created_by: "joao", updated_by: "joao" },
      { ...preset("p3", "Antiga", "configurada", { vm_name: "a03" }), created_by: null, updated_by: null },
    ];
    const editor = openConfigurada();
    await openPresetList();
    expect(screen.getByRole("tab", { name: "Minhas (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Editar Casos NFe" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "NFe do Joao" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "De outros usuários (2)" }));
    const joao = screen.getByRole("group", { name: "joao" });
    expect(within(joao).getByRole("button", { name: "NFe do Joao" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Sem dono (todos)" })).getByRole("button", { name: "Antiga" })).toBeInTheDocument();
    // De outro usuario: sem lapis e sem lixeira (nao e admin); so usar ou copiar.
    expect(screen.queryByRole("button", { name: "Editar NFe do Joao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir NFe do Joao" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copiar NFe do Joao para as minhas" })).toBeInTheDocument();

    fireEvent.click(within(joao).getByRole("button", { name: "NFe do Joao" }));
    expect(JSON.parse(editor.value).vm_name).toBe("a02");
    expect(screen.getByRole("button", { name: "Pré-definição" })).toHaveTextContent("de joao");
    expect(screen.getByText(/só quem criou altera/)).toBeInTheDocument();
    // Alterou a tela: nao oferece salvar na do outro, so como nova.
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...JSON.parse(editor.value), vm_name: "a05" }) } });
    expect(screen.queryByRole("button", { name: /Salvar em/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Salvar como nova/ })).toBeInTheDocument();
  });

  it("copiar para as minhas cria uma copia com a configuracao do outro usuario e aplica", async () => {
    const doJoao = { ...preset("p2", "NFe do Joao", "configurada", { vm_name: "a02", casos_teste: "[2]" }), created_by: "joao" };
    api.presets = [doJoao];
    api.createRunPreset.mockImplementation(async (payload: { nome: string; modo: "configurada"; config: Record<string, unknown> }) => {
      const created = preset("copia", payload.nome, payload.modo, payload.config);
      api.presets = [doJoao, created];
      return created;
    });
    const editor = openConfigurada();
    await openPresetList();
    expect(screen.getByRole("tab", { name: "De outros usuários (1)" })).toHaveAttribute("aria-selected", "true"); // nao tenho nenhuma
    fireEvent.click(screen.getByRole("button", { name: "Copiar NFe do Joao para as minhas" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Será copiado de joao")).toBeInTheDocument();
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("NFe do Joao");
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.createRunPreset).toHaveBeenCalledWith({
      nome: "NFe do Joao", modo: "configurada", config: { vm_name: "a02", casos_teste: "[2]" },
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(editor.value).vm_name).toBe("a02");
  });

  it("admin ve a lixeira nas pre-definicoes dos outros", async () => {
    auth.isAdmin = true;
    api.presets = [{ ...preset("p2", "NFe do Joao", "configurada", { vm_name: "a02" }), created_by: "joao" }];
    api.deleteRunPreset.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    openConfigurada();
    await openPresetList();
    fireEvent.click(screen.getByRole("button", { name: "Excluir NFe do Joao" }));
    expect(confirm.mock.calls[0][0]).toMatch(/de joao/);
    await waitFor(() => expect(api.deleteRunPreset).toHaveBeenCalledWith("p2"));
  });

  it("sem a permissao de solicitar rodagem: ve a tela, mas nao envia nem salva pre-definicao", async () => {
    auth.profile = { username: "ana", permissions: ["merge"] };
    api.presets = [nfe(), { ...preset("p2", "NFe do Joao", "configurada", { vm_name: "a02" }), created_by: "joao" }];
    api.requests = [request("r1", "2026-10-01T10:00:00Z", "solicitado")];
    renderPage(<JenkinsRodagemCompleta />);
    // Simplificada: botao bloqueado com o aviso.
    expect(screen.getByRole("button", { name: /Enviar rodagem para Jenkins/ })).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("Você não tem permissão para solicitar rodagens");
    // Configurada: idem; usar uma pre-definicao continua possivel, salvar/editar/copiar/excluir nao.
    const tab = screen.getByRole("tab", { name: "Configurada" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(screen.getByRole("button", { name: /Enviar rodagem para Jenkins/ })).toBeDisabled();
    await openPresetList();
    expect(screen.queryByRole("button", { name: /Nova a partir da tela atual/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar Casos NFe" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir Casos NFe" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Casos NFe" }));
    const editor = screen.getByLabelText("CONFIG_JSON") as HTMLTextAreaElement;
    expect(JSON.parse(editor.value).vm_name).toBe("a09");
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...JSON.parse(editor.value), vm_name: "a10" }) } });
    expect(screen.queryByRole("button", { name: /Salvar em/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Salvar como nova/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Desfazer/ })).toBeInTheDocument();
    await openPresetList();
    fireEvent.click(screen.getByRole("tab", { name: /De outros usuários/ }));
    expect(screen.queryByRole("button", { name: "Copiar NFe do Joao para as minhas" })).toBeNull();
    // Historico: sem o botao de cancelar.
    fireEvent.click(screen.getByRole("button", { name: /Expandir/ }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: /^Cancelar$/ })).toBeNull();
    expect(api.createRerunRequest).not.toHaveBeenCalled();
  });

  it("com a permissao de solicitar rodagem o historico mostra o cancelar", async () => {
    api.requests = [request("r1", "2026-10-01T10:00:00Z", "solicitado")];
    renderPage(<JenkinsRodagemCompleta />);
    fireEvent.click(screen.getByRole("button", { name: /Expandir/ }));
    expect(await screen.findByRole("button", { name: /^Cancelar$/ })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("admin pode tudo mesmo sem a lista de permissoes", () => {
    auth.isAdmin = true;
    auth.profile = { username: "chefe", permissions: [] };
    renderPage(<JenkinsRodagemCompleta />);
    expect(screen.getByRole("button", { name: /Enviar rodagem para Jenkins/ })).not.toBeDisabled();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("simplificada: cria pela lista com VM, modulo e versao e mostra o que mudou depois", async () => {
    api.createRunPreset.mockImplementation(async (payload: { nome: string; modo: "simplificada"; config: Record<string, unknown> }) => {
      const created = preset("novo", payload.nome, payload.modo, payload.config);
      api.presets = [created];
      return created;
    });
    renderPage(<JenkinsRodagemCompleta />);
    fireEvent.change(screen.getByRole("textbox", { name: "Versão" }), { target: { value: "PROXIMA" } });

    await openPresetList();
    fireEvent.click(screen.getByRole("button", { name: /Nova a partir da tela atual/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Será salvo")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Fiscal a07" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(api.createRunPreset).toHaveBeenCalledTimes(1));
    expect(api.createRunPreset).toHaveBeenCalledWith({
      nome: "Fiscal a07",
      modo: "simplificada",
      config: { vm_name: "a07", modulo: "Fiscal", versao: "PROXIMA" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.change(screen.getByRole("textbox", { name: "Versão" }), { target: { value: "OUTRA" } });
    expect(await screen.findByText(/PROXIMA → OUTRA/)).toBeInTheDocument();

    // Pelo aviso de alteracao tambem da para salvar como uma nova.
    fireEvent.click(screen.getByRole("button", { name: /Salvar como nova/ }));
    const second = await screen.findByRole("dialog");
    expect(within(second).getByText((_, el) => el?.tagName === "LI" && el.textContent === "Versão: OUTRA")).toBeInTheDocument();
    fireEvent.change(within(second).getByLabelText("Nome"), { target: { value: "Fiscal a07 outra" } });
    fireEvent.click(within(second).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.createRunPreset).toHaveBeenCalledTimes(2));
    expect(api.createRunPreset.mock.calls[1][0]).toMatchObject({ nome: "Fiscal a07 outra", config: { versao: "OUTRA" } });
  });

  it("mostra o erro de nome repetido devolvido pela API", async () => {
    const { ApiError } = await import("@/services/data/apiSource");
    api.createRunPreset.mockRejectedValue(new ApiError(409, "/run-presets"));
    openConfigurada();
    await openPresetList();
    fireEvent.click(screen.getByRole("button", { name: /Nova a partir da tela atual/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Repetida" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.any(String), { description: "Você já tem uma pré-definição com esse nome." }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("digitar no formulario nao re-renderiza o historico, que mostra no maximo 50", async () => {
    api.requests = Array.from({ length: 100 }, (_, i) => request(`r${i}`, "2026-10-01T10:00:00Z", "finalizado_sucesso"));
    renderPage(<JenkinsRodagemCompleta />);
    fireEvent.click(screen.getByRole("button", { name: /Expandir/ }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(51));

    historyRenders.count = 0;
    const input = screen.getByRole("textbox", { name: "Versão" });
    for (const v of ["P", "PR", "PRO", "PROX"]) fireEvent.change(input, { target: { value: v } });
    expect((input as HTMLInputElement).value).toBe("PROX");
    expect(historyRenders.count).toBe(0);
  });
});
