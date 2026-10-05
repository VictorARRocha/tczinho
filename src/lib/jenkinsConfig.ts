// CONFIG_JSON das rodagens Jenkins: montagem, leitura do editor e validacao.

export type JenkinsConfig = Record<string, unknown>;

const KEY_ORDER = ["vm_name", "versao", "casos_teste", "paralelo", "ct_desmarcar", "data_hora", "branch"];
const REQUIRED_KEYS = ["vm_name", "versao", "casos_teste", "ct_desmarcar", "data_hora"];
const DATA_HORA_RE = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;

export function casosTesteValido(s: string): boolean {
  if (!s.trim()) return false;
  // precisa ter ao menos um par de colchetes
  return /\[[^\]]+\]/.test(s);
}

/** Configuracao com a data/hora informada, nas chaves na ordem usual do Jenkins. */
export function withDataHora(config: JenkinsConfig, dataHora: string): JenkinsConfig {
  const merged: JenkinsConfig = { ...config, data_hora: dataHora };
  const ordered: JenkinsConfig = {};
  for (const key of KEY_ORDER) if (key in merged) ordered[key] = merged[key];
  for (const key of Object.keys(merged)) if (!(key in ordered)) ordered[key] = merged[key];
  return ordered;
}

export function configToText(config: JenkinsConfig): string {
  return JSON.stringify(config, null, 2);
}

/** Le o texto do editor: devolve o objeto ou a mensagem de erro de sintaxe. */
export function parseConfigText(text: string): { config: JenkinsConfig; error: null } | { config: null; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { config: null, error: `JSON inválido: ${(e as Error).message}` };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { config: null, error: "O CONFIG_JSON deve ser um objeto { ... }." };
  }
  return { config: value as JenkinsConfig, error: null };
}

// Chaves que a API le do corpo do pedido para montar o registro (status, autor,
// vinculos...). No CONFIG_JSON editavel elas mudariam o proprio pedido.
const RESERVED_KEYS = [
  "id", "status", "requested_by", "solicitado_por", "source_run_id", "fk_rodagem", "module_id",
  "request_type", "tipo_solicitacao", "configuration_mode", "modo_configuracao",
  "test_cases", "version", "parallel",
];

/** Regras para enviar: as mesmas da tela antiga de campos, mais as chaves reservadas. */
export function validateConfigForSubmit(config: JenkinsConfig): string | null {
  const reserved = RESERVED_KEYS.find((key) => key in config);
  if (reserved) return `A chave "${reserved}" é reservada pela API e não pode ir no CONFIG_JSON.`;
  for (const key of REQUIRED_KEYS) {
    const value = config[key];
    if (typeof value !== "string" || !value.trim()) return `Informe "${key}" (texto).`;
  }
  for (const key of ["paralelo", "branch"]) {
    if (key in config && config[key] !== null && typeof config[key] !== "string") return `"${key}" deve ser texto.`;
  }
  if (!casosTesteValido(config.casos_teste as string)) {
    return "casos_teste deve conter colchetes, ex.: [2] ou [9.1.4.1.3]";
  }
  if (!DATA_HORA_RE.test((config.data_hora as string).trim())) {
    return "data_hora deve estar no formato dd/MM/yyyy HH:mm:ss.";
  }
  return null;
}

/** Textos sem espacos nas pontas, como a tela antiga enviava. */
export function trimConfigStrings(config: JenkinsConfig): JenkinsConfig {
  const out: JenkinsConfig = {};
  for (const [key, value] of Object.entries(config)) out[key] = typeof value === "string" ? value.trim() : value;
  return out;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, stable((value as JenkinsConfig)[k])]),
    );
  }
  return value;
}

/** Compara configuracoes ignorando a ordem das chaves e a data/hora (que nao e salva). */
export function sameConfig(a: JenkinsConfig, b: JenkinsConfig): boolean {
  const strip = ({ data_hora: _ignored, ...rest }: JenkinsConfig) => rest;
  return JSON.stringify(stable(strip(a))) === JSON.stringify(stable(strip(b)));
}

export interface ConfigChange {
  key: string;
  before: string;
  after: string;
}

function display(value: unknown): string {
  if (value === undefined) return "(ausente)";
  if (typeof value === "string") return value === "" ? '""' : value;
  return JSON.stringify(value);
}

/** O que mudou da pre-definicao salva para a tela (sem data/hora), na ordem da tela. */
export function diffConfig(saved: JenkinsConfig, current: JenkinsConfig): ConfigChange[] {
  const keys = [...Object.keys(current), ...Object.keys(saved).filter((k) => !(k in current))];
  const out: ConfigChange[] = [];
  for (const key of keys) {
    if (key === "data_hora") continue;
    if (JSON.stringify(stable(saved[key])) === JSON.stringify(stable(current[key]))) continue;
    out.push({ key, before: display(saved[key]), after: display(current[key]) });
  }
  return out;
}
