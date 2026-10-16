import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, ChevronLeft, Copy, Clock, AlertTriangle } from "lucide-react";
import {
  createRerunRequest, formatNowMinusOneMinuteBr, formatNowBr, type CreateRerunPayload, type RunPreset,
} from "@/services/data";
import { invalidateRerunRequests, useMergeBranches } from "@/services/queries";
import { MANTER_BRANCH, VM_OPTIONS, branchDoPedido, opcoesBranch } from "@/lib/branchVm";
import { JenkinsHistory } from "@/components/JenkinsHistory";
import { RunPresetBar } from "@/components/RunPresetBar";
import { SemPermissao } from "@/components/SemPermissao";
import { useModulos, usePermissao } from "@/hooks/use-permissao";
import { MODULOS_ACESSO } from "@/lib/permissoes";
import { mensagemDaApi } from "@/lib/apiErro";
import {
  casosTesteValido, configToText, parseConfigText, trimConfigStrings, validateConfigForSubmit, withDataHora,
} from "@/lib/jenkinsConfig";

const SIMPLIFIED_LABELS = { vm_name: "VM", modulo: "Módulo", versao: "Versão" };

// Modulos que o Jenkins roda, nesta ordem; nome e codigos vem da lista oficial (lib/permissoes).
const MODULOS = ["folha", "fiscal", "contabil", "financeiro", "geral", "gestao"].map((slug) => {
  const m = MODULOS_ACESSO.find((x) => x.slug === slug)!;
  return { nome: m.nome, codigo: m.codigos.map((c) => `[${c}]`).join(", "), slug };
});

/** "yyyy-MM-ddTHH:mm" do horario local, o formato do campo datetime-local. */
function paraCampoData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type ErrosSimplificada = { versao?: string; data?: string };

export default function JenkinsRodagemCompleta() {
  const podeSolicitar = usePermissao("rodagem");
  const acessoModulos = useModulos();
  // ---- Simplificada ----
  const [sVm, setSVm] = useState("a07");
  const [sModulo, setSModulo] = useState(MODULOS[1].nome); // Fiscal default
  const [sVersao, setSVersao] = useState("");
  const [sAgora, setSAgora] = useState<"agora" | "agendar">("agora");
  // Valor do campo de data (controlado): trocar Agora/Agendar nao deixa mais uma data escondida no pedido.
  const [sDataCampo, setSDataCampo] = useState("");
  const sData = sDataCampo ? formatNowBr(new Date(sDataCampo)) : ""; // dd/MM/yyyy HH:mm:ss
  const [erros, setErros] = useState<ErrosSimplificada>({});
  const [sNowTick, setSNowTick] = useState(0);
  // Veio de pre-definicao: mantem a versao depois do envio para poder reenviar igual.
  const [sFromPreset, setSFromPreset] = useState(false);
  // Branch do projeto na VM: "manter" nao mexe; outra faz svn revert + svn switch no Jenkins antes de rodar.
  const [sBranch, setSBranch] = useState(MANTER_BRANCH);
  const { data: branchesSvn } = useMergeBranches();
  const opcoes = useMemo(() => opcoesBranch(branchesSvn?.branches), [branchesSvn]);
  const nomeBranch = opcoes.find((o) => o.valor === sBranch)?.rotulo || sBranch;

  // recalcula data "agora" continuamente
  useEffect(() => {
    if (sAgora !== "agora") return;
    const t = setInterval(() => setSNowTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [sAgora]);

  const sModuloObj = useMemo(() => MODULOS.find((m) => m.nome === sModulo) || MODULOS[0], [sModulo]);
  // So os modulos em que a pessoa pode pedir rodagem (a API confere de novo no envio).
  const modulosLiberados = MODULOS.filter((m) => acessoModulos.pode(m.slug));
  const moduloLiberado = modulosLiberados.some((m) => m.nome === sModulo);
  const primeiroLiberado = modulosLiberados[0]?.nome;
  useEffect(() => {
    if (!moduloLiberado && primeiroLiberado) setSModulo(primeiroLiberado);
  }, [moduloLiberado, primeiroLiberado]);
  const sDataHora = useMemo(() => {
    if (sAgora === "agora") return formatNowMinusOneMinuteBr();
    return sData;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sAgora, sData, sNowTick]);

  const sConfig = useMemo(
    () => ({
      vm_name: sVm,
      versao: sVersao,
      casos_teste: sModuloObj.codigo,
      paralelo: "",
      ct_desmarcar: "[0.3]",
      data_hora: sDataHora,
      branch: branchDoPedido(sBranch),
    }),
    [sVm, sVersao, sModuloObj, sDataHora, sBranch],
  );

  const sPresetConfig = useMemo(
    () => ({ vm_name: sVm, modulo: sModulo, versao: sVersao.trim() }),
    [sVm, sModulo, sVersao],
  );

  // useCallback: mantem as props da RunPresetBar (memo) estaveis entre renders.
  const applySimplifiedPreset = useCallback((preset: RunPreset) => {
    const c = preset.config_json || {};
    if (typeof c.vm_name === "string" && c.vm_name) setSVm(c.vm_name);
    if (typeof c.modulo === "string" && MODULOS.some((m) => m.nome === c.modulo)) setSModulo(c.modulo);
    setSVersao(typeof c.versao === "string" ? c.versao : "");
    setSFromPreset(true);
  }, []);

  // ---- Configurada (edicao direta do CONFIG_JSON) ----
  const [cText, setCText] = useState(() =>
    configToText({
      vm_name: "a07",
      versao: "",
      casos_teste: "",
      paralelo: "",
      ct_desmarcar: "[0.3]",
      data_hora: formatNowMinusOneMinuteBr(),
      branch: "",
    }),
  );
  const cParsed = useMemo(() => parseConfigText(cText), [cText]);

  const applyConfiguredPreset = useCallback((preset: RunPreset) => {
    setCText(configToText(withDataHora(preset.config_json || {}, formatNowMinusOneMinuteBr())));
  }, []);

  const setConfiguredNow = () => {
    if (!cParsed.config) return toast.error("Corrija o JSON antes", { description: cParsed.error });
    setCText(configToText(withDataHora(cParsed.config, formatNowMinusOneMinuteBr())));
  };

  const [submitting, setSubmitting] = useState(false);

  const submitSimplificada = async () => {
    // Erros embaixo do campo (antes eram avisos flutuantes que sumiam).
    const novos: ErrosSimplificada = {};
    if (!sVersao.trim()) novos.versao = "Informe a versão.";
    if (sAgora === "agendar") {
      if (!sDataCampo) novos.data = "Escolha a data e a hora.";
      else if (new Date(sDataCampo).getTime() < Date.now()) novos.data = "Esse horário já passou. Escolha um horário futuro.";
    }
    setErros(novos);
    if (novos.versao) return document.getElementById("rc-versao")?.focus();
    if (novos.data) return document.getElementById("rc-data")?.focus();
    if (!sVm) return toast.error("Selecione a VM");
    if (!sModuloObj) return toast.error("Selecione o módulo");
    if (!sDataHora) return toast.error("Informe a data/hora");
    if (!casosTesteValido(sModuloObj.codigo)) return toast.error("casos_teste inválido");
    setSubmitting(true);
    try {
      await createRerunRequest({
        vm_name: sVm,
        versao: sVersao.trim(),
        casos_teste: sModuloObj.codigo,
        paralelo: "",
        ct_desmarcar: "[0.3]",
        data_hora: sDataHora,
        branch: branchDoPedido(sBranch),
      });
      toast.success("Pedido enviado", { description: "O Jenkins começa em instantes." });
      invalidateRerunRequests();
      if (!sFromPreset) setSVersao("");
      setSBranch(MANTER_BRANCH); // a troca vale so para este pedido
    } catch (e) {
      toast.error("Falha ao criar solicitação", { description: mensagemDaApi(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const submitConfigurada = async () => {
    if (!cParsed.config) return toast.error("CONFIG_JSON inválido", { description: cParsed.error });
    const invalid = validateConfigForSubmit(cParsed.config);
    if (invalid) return toast.error(invalid);
    setSubmitting(true);
    try {
      await createRerunRequest(trimConfigStrings(cParsed.config) as unknown as CreateRerunPayload);
      toast.success("Pedido enviado", { description: "O Jenkins começa em instantes." });
      invalidateRerunRequests();
    } catch (e) {
      toast.error("Falha ao criar solicitação", { description: mensagemDaApi(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const copyJson = (obj: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success("Configuração copiada");
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <Link to="/jenkins" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0 md:py-1">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Jenkins
      </Link>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Rodagem completa</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Roda um módulo inteiro na VM escolhida, agora ou no horário agendado.
        </p>
      </div>

      <Tabs defaultValue="simplificada" className="mb-8 sm:mb-10">
        <TabsList className="mb-4 w-full sm:w-auto">
          <TabsTrigger value="simplificada" className="flex-1 sm:flex-none">
            Simplificada
          </TabsTrigger>
          <TabsTrigger value="configurada" className="flex-1 sm:flex-none">
            Configurada
          </TabsTrigger>
        </TabsList>

        {/* ============================== SIMPLIFICADA ============================== */}
        <TabsContent value="simplificada">
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            <Card className="glass-card p-4 sm:p-6 space-y-5">
              <RunPresetBar
                mode="simplificada"
                current={sPresetConfig}
                labels={SIMPLIFIED_LABELS}
                onApply={applySimplifiedPreset}
              />

              <Field label="VM" id="rc-vm">
                <Select value={sVm} onValueChange={setSVm}>
                  <SelectTrigger id="rc-vm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VM_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Módulo" id="rc-modulo">
                <Select value={sModulo} onValueChange={setSModulo}>
                  <SelectTrigger id="rc-modulo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modulosLiberados.map((m) => (
                      <SelectItem key={m.nome} value={m.nome}>
                        {m.nome} — <span className="font-mono text-xs">{m.codigo}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Versão" id="rc-versao" erro={erros.versao}>
                <Input
                  id="rc-versao"
                  value={sVersao}
                  aria-invalid={!!erros.versao}
                  aria-describedby={erros.versao ? "rc-versao-erro" : undefined}
                  onChange={(e) => { setSVersao(e.target.value); if (erros.versao) setErros((x) => ({ ...x, versao: undefined })); }}
                />
              </Field>

              <Field label="Branch" id="rc-branch">
                <Select value={sBranch} onValueChange={setSBranch}>
                  <SelectTrigger id="rc-branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value={MANTER_BRANCH}>Manter a branch atual</SelectItem>
                    {opcoes.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sBranch !== MANTER_BRANCH && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning" role="note">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      Antes de rodar, a {sVm.toUpperCase()} <strong>desfaz as alterações locais</strong> em C:\TC\Unico (svn revert) e depois troca para <strong>{nomeBranch}</strong> (svn switch).
                    </span>
                  </div>
                )}
              </Field>

              <Field label="Agendamento" id="rc-agenda" erro={erros.data} erroId="rc-data-erro">
                <RadioGroup
                  value={sAgora}
                  onValueChange={(v) => { setSAgora(v as "agora" | "agendar"); setErros((x) => ({ ...x, data: undefined })); }}
                  aria-labelledby="rc-agenda-rotulo"
                  className="flex gap-6 mt-1"
                >
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm cursor-pointer md:min-h-0">
                    <RadioGroupItem value="agora" /> Agora
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm cursor-pointer md:min-h-0">
                    <RadioGroupItem value="agendar" /> Agendar
                  </label>
                </RadioGroup>
                {sAgora === "agora" ? (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Será usado: <code className="text-xs">{sDataHora}</code>{" "}
                    <span className="opacity-70">(agora − 1 min, dispara imediatamente)</span>
                  </p>
                ) : (
                  <Input
                    id="rc-data"
                    className="mt-2"
                    type="datetime-local"
                    aria-label="Data e hora do agendamento"
                    value={sDataCampo}
                    min={paraCampoData(new Date())}
                    aria-invalid={!!erros.data}
                    aria-describedby={erros.data ? "rc-data-erro" : undefined}
                    onChange={(e) => { setSDataCampo(e.target.value); if (erros.data) setErros((x) => ({ ...x, data: undefined })); }}
                  />
                )}
              </Field>

              <Button
                size="lg"
                className="w-full"
                onClick={submitSimplificada}
                disabled={submitting || !podeSolicitar || !moduloLiberado}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {submitting ? "Enviando…" : "Enviar rodagem para Jenkins"}
              </Button>
              {!podeSolicitar && <SemPermissao permissao="rodagem" />}
              {podeSolicitar && modulosLiberados.length === 0 && (
                <SemPermissao mensagem="Você não tem acesso a nenhum módulo. Peça a um administrador." />
              )}
            </Card>

            <JsonPreview title="Configuração que será enviada" data={sConfig} onCopy={() => copyJson(sConfig)} />
          </div>
        </TabsContent>

        {/* ============================== CONFIGURADA ============================== */}
        <TabsContent value="configurada">
          <Card className="glass-card p-4 sm:p-6 space-y-4">
            <RunPresetBar
              mode="configurada"
              current={cParsed.config}
              invalidReason={cParsed.error}
              onApply={applyConfiguredPreset}
            />

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="config-json" className="text-xs uppercase tracking-wider text-muted-foreground">
                  CONFIG_JSON
                </Label>
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={setConfiguredNow} title="data_hora = agora − 1 min (dispara imediatamente)">
                    <Clock className="h-3.5 w-3.5 mr-1" /> Data/hora agora
                  </Button>
                </div>
              </div>
              <Textarea
                id="config-json"
                value={cText}
                onChange={(e) => setCText(e.target.value)}
                spellCheck={false}
                className="min-h-[260px] font-mono text-xs leading-relaxed"
                aria-invalid={!!cParsed.error}
                aria-describedby={cParsed.error ? "config-json-erro" : undefined}
              />
              {/* Regiao viva educada: nao interrompe a cada tecla, mas avisa quando o JSON quebra. */}
              <p id="config-json-erro" aria-live="polite" className="mt-1 text-xs text-destructive empty:hidden">{cParsed.error || ""}</p>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={submitConfigurada}
              disabled={submitting || !podeSolicitar}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              {submitting ? "Enviando…" : "Enviar rodagem para Jenkins"}
            </Button>
            {!podeSolicitar && <SemPermissao permissao="rodagem" />}
          </Card>
        </TabsContent>
      </Tabs>

      <JenkinsHistory defaultExpanded />
    </div>
  );
}

/** Rotulo ligado ao campo (htmlFor = id do controle) e erro anunciado embaixo dele. */
function Field({ label, id, erro, erroId, children }: { label: string; id: string; erro?: string; erroId?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} id={`${id}-rotulo`} className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {erro && <p id={erroId || `${id}-erro`} role="alert" className="mt-1 text-xs text-destructive">{erro}</p>}
    </div>
  );
}

function JsonPreview({ title, data, onCopy }: { title: string; data: unknown; onCopy: () => void }) {
  return (
    <Card className="glass-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <Button size="sm" variant="ghost" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
        </Button>
      </div>
      <pre className="text-xs bg-muted/40 border border-border rounded-lg p-3 overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </Card>
  );
}
