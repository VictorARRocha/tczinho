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
import { PlayCircle, ChevronLeft, Copy, Server, Clock } from "lucide-react";
import {
  createRerunRequest, formatNowMinusOneMinuteBr, formatNowBr, type CreateRerunPayload, type RunPreset,
} from "@/services/data";
import { invalidateRerunRequests } from "@/services/queries";
import { JenkinsHistory } from "@/components/JenkinsHistory";
import { RunPresetBar } from "@/components/RunPresetBar";
import {
  casosTesteValido, configToText, parseConfigText, trimConfigStrings, validateConfigForSubmit, withDataHora,
} from "@/lib/jenkinsConfig";

const VM_OPTIONS = ["a03", "a04", "a05n", "a06", "a07", "a08", "a09", "a10", "testevsup"];

const SIMPLIFIED_LABELS = { vm_name: "VM", modulo: "Módulo", versao: "Versão" };

const MODULOS = [
  { nome: "Folha", codigo: "[1]" },
  { nome: "Fiscal", codigo: "[2]" },
  { nome: "Contábil", codigo: "[3], [4], [7]" },
  { nome: "Financeiro", codigo: "[5]" },
  { nome: "Geral", codigo: "[6]" },
  { nome: "Gestão", codigo: "[9]" },
];

export default function JenkinsRodagemCompleta() {
  // ---- Simplificada ----
  const [sVm, setSVm] = useState("a07");
  const [sModulo, setSModulo] = useState(MODULOS[1].nome); // Fiscal default
  const [sVersao, setSVersao] = useState("");
  const [sAgora, setSAgora] = useState<"agora" | "agendar">("agora");
  const [sData, setSData] = useState<string>(""); // dd/MM/yyyy HH:mm:ss
  const [sNowTick, setSNowTick] = useState(0);
  // Veio de pre-definicao: mantem a versao depois do envio para poder reenviar igual.
  const [sFromPreset, setSFromPreset] = useState(false);

  // recalcula data "agora" continuamente
  useEffect(() => {
    if (sAgora !== "agora") return;
    const t = setInterval(() => setSNowTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [sAgora]);

  const sModuloObj = useMemo(() => MODULOS.find((m) => m.nome === sModulo) || MODULOS[0], [sModulo]);
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
      branch: "",
    }),
    [sVm, sVersao, sModuloObj, sDataHora],
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
    if (!sVm) return toast.error("Selecione a VM");
    if (!sVersao.trim()) return toast.error("Informe a versão");
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
        branch: "",
      });
      toast.success("Solicitação enviada", { description: "O JenkinsBridge local irá disparar o Jenkins." });
      invalidateRerunRequests();
      if (!sFromPreset) setSVersao("");
    } catch (e) {
      toast.error("Falha ao criar solicitação", { description: (e as Error)?.message });
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
      toast.success("Solicitação enviada", { description: "O JenkinsBridge local irá disparar o Jenkins." });
      invalidateRerunRequests();
    } catch (e) {
      toast.error("Falha ao criar solicitação", { description: (e as Error)?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const copyJson = (obj: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success("JSON copiado");
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-4 sm:mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/jenkins" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Jenkins
        </Link>
      </div>

      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary mb-3">
          <Server className="h-3 w-3" /> Rodagem completa
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
          Nova rodagem <span className="gradient-text">Jenkins</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Escolha o modo de configuração e envie uma nova rodagem para o Jenkins.
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
            <Card className="glass-card backdrop-filter-none p-4 sm:p-6 space-y-5">
              <RunPresetBar
                mode="simplificada"
                current={sPresetConfig}
                labels={SIMPLIFIED_LABELS}
                onApply={applySimplifiedPreset}
              />

              <Field label="VM">
                <Select value={sVm} onValueChange={setSVm}>
                  <SelectTrigger>
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

              <Field label="Módulo">
                <Select value={sModulo} onValueChange={setSModulo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULOS.map((m) => (
                      <SelectItem key={m.nome} value={m.nome}>
                        {m.nome} — <span className="font-mono text-xs">{m.codigo}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Versão">
                <Input aria-label="Versão" value={sVersao} onChange={(e) => setSVersao(e.target.value)} />
              </Field>

              <Field label="Agendamento">
                <RadioGroup value={sAgora} onValueChange={(v) => setSAgora(v as "agora" | "agendar")} className="flex gap-6 mt-1">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="agora" /> Agora
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
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
                    className="mt-2"
                    type="datetime-local"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        setSData("");
                        return;
                      }
                      const d = new Date(v);
                      setSData(formatNowBr(d));
                    }}
                  />
                )}
              </Field>

              <Button
                size="lg"
                className="w-full bg-gradient-primary"
                onClick={submitSimplificada}
                disabled={submitting}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {submitting ? "Enviando…" : "Enviar rodagem para Jenkins"}
              </Button>
            </Card>

            <JsonPreview title="Preview do CONFIG_JSON" data={sConfig} onCopy={() => copyJson(sConfig)} />
          </div>
        </TabsContent>

        {/* ============================== CONFIGURADA ============================== */}
        <TabsContent value="configurada">
          <Card className="glass-card backdrop-filter-none p-4 sm:p-6 space-y-4">
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
              />
              {cParsed.error ? (
                <p className="mt-1 text-[11px] text-red-500">{cParsed.error}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Obrigatórios: <code>vm_name</code>, <code>versao</code>, <code>casos_teste</code> (com colchetes, ex.: [2] ou
                  [9.1.4.1.3], [9.1.4.1.4]), <code>ct_desmarcar</code> (padrão [0.3]) e <code>data_hora</code> (dd/MM/yyyy
                  HH:mm:ss; agora − 1 min dispara imediatamente). <code>branch</code> vazio não troca a branch.
                </p>
              )}
            </div>

            <Button
              size="lg"
              className="w-full bg-gradient-primary"
              onClick={submitConfigurada}
              disabled={submitting}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              {submitting ? "Enviando…" : "Enviar rodagem para Jenkins"}
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      <JenkinsHistory />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function JsonPreview({ title, data, onCopy }: { title: string; data: unknown; onCopy: () => void }) {
  return (
    <Card className="glass-card backdrop-filter-none p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
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
