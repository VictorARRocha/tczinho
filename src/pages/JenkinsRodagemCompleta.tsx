import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PlayCircle, ChevronLeft, Copy, Server } from "lucide-react";
import {
  createRerunRequest, formatNowMinusOneMinuteBr, formatNowBr,
} from "@/services/qa";
import { JenkinsHistory } from "@/components/JenkinsHistory";

const VM_OPTIONS = ["a03", "a04", "a05n", "a06", "a07", "a08", "a09", "a10", "testevsup"];

const MODULOS = [
  { nome: "Folha",       codigo: "[1]" },
  { nome: "Fiscal",      codigo: "[2]" },
  { nome: "Contábil",    codigo: "[3], [4], [7]" },
  { nome: "Financeiro",  codigo: "[5]" },
  { nome: "Geral",       codigo: "[6]" },
  { nome: "Gestão",      codigo: "[9]" },
];

function casosTesteValido(s: string): boolean {
  if (!s.trim()) return false;
  // precisa ter ao menos um par de colchetes
  return /\[[^\]]+\]/.test(s);
}

export default function JenkinsRodagemCompleta() {
  // ---- Simplificada ----
  const [sVm, setSVm] = useState("a07");
  const [sModulo, setSModulo] = useState(MODULOS[1].nome); // Fiscal default
  const [sVersao, setSVersao] = useState("");
  const [sAgora, setSAgora] = useState<"agora" | "agendar">("agora");
  const [sData, setSData] = useState<string>(""); // dd/MM/yyyy HH:mm:ss
  const [sNowTick, setSNowTick] = useState(0);

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

  const sConfig = useMemo(() => ({
    vm_name: sVm,
    versao: sVersao,
    casos_teste: sModuloObj.codigo,
    paralelo: "",
    ct_desmarcar: "[0.3]",
    data_hora: sDataHora,
    branch: "",
  }), [sVm, sVersao, sModuloObj, sDataHora]);

  // ---- Configurada ----
  const [cVm, setCVm] = useState("a07");
  const [cVersao, setCVersao] = useState("");
  const [cCasos, setCCasos] = useState("");
  const [cCtDesmarcar, setCCtDesmarcar] = useState("[0.3]");
  const [cDataHora, setCDataHora] = useState(() => formatNowMinusOneMinuteBr());
  const [cBranch, setCBranch] = useState("");

  const cConfig = useMemo(() => ({
    vm_name: cVm,
    versao: cVersao,
    casos_teste: cCasos,
    paralelo: "",
    ct_desmarcar: cCtDesmarcar,
    data_hora: cDataHora,
    branch: cBranch,
  }), [cVm, cVersao, cCasos, cCtDesmarcar, cDataHora, cBranch]);

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
        fk_rodagem: null,
        vm_name: sVm,
        versao: sVersao.trim(),
        casos_teste: sModuloObj.codigo,
        paralelo: "",
        ct_desmarcar: "[0.3]",
        data_hora: sDataHora,
        branch: "",
        tipo_solicitacao: "rodagem_completa",
        modo_configuracao: "simplificada",
        modulo_nome: sModuloObj.nome,
        modulo_codigo: sModuloObj.codigo,
      });
      toast.success("Solicitação enviada", { description: "O JenkinsBridge local irá disparar o Jenkins." });
      setSVersao("");
    } catch (e: any) {
      toast.error("Falha ao criar solicitação", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const submitConfigurada = async () => {
    if (!cVm) return toast.error("Selecione a VM");
    if (!cVersao.trim()) return toast.error("Informe a versão");
    if (!cCasos.trim()) return toast.error("Informe os casos_teste");
    if (!casosTesteValido(cCasos)) return toast.error("casos_teste deve conter colchetes, ex.: [2] ou [9.1.4.1.3]");
    if (!cCtDesmarcar.trim()) return toast.error("ct_desmarcar é obrigatório");
    if (!cDataHora.trim()) return toast.error("Informe a data/hora");
    setSubmitting(true);
    try {
      await createRerunRequest({
        fk_rodagem: null,
        vm_name: cVm,
        versao: cVersao.trim(),
        casos_teste: cCasos.trim(),
        paralelo: "",
        ct_desmarcar: cCtDesmarcar.trim(),
        data_hora: cDataHora.trim(),
        branch: cBranch,
        tipo_solicitacao: "rodagem_completa",
        modo_configuracao: "configurada",
        modulo_nome: null,
        modulo_codigo: null,
      });
      toast.success("Solicitação enviada", { description: "O JenkinsBridge local irá disparar o Jenkins." });
    } catch (e: any) {
      toast.error("Falha ao criar solicitação", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const copyJson = (obj: any) => {
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
          <TabsTrigger value="simplificada" className="flex-1 sm:flex-none">Simplificada</TabsTrigger>
          <TabsTrigger value="configurada" className="flex-1 sm:flex-none">Configurada</TabsTrigger>
        </TabsList>

        {/* ============================== SIMPLIFICADA ============================== */}
        <TabsContent value="simplificada">
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">

            <Card className="glass-card p-4 sm:p-6 space-y-5">
              <Field label="VM">
                <Select value={sVm} onValueChange={setSVm}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VM_OPTIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Módulo">
                <Select value={sModulo} onValueChange={setSModulo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULOS.map((m) => (
                      <SelectItem key={m.nome} value={m.nome}>
                        {m.nome} — <span className="font-mono text-xs">{m.codigo}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  casos_teste enviado: <code className="text-xs">{sModuloObj.codigo}</code>
                </p>
              </Field>

              <Field label="Versão">
                <Input value={sVersao} onChange={(e) => setSVersao(e.target.value)} placeholder="ex.: proxima1.26.7.0" />
              </Field>

              <Field label="Agendamento">
                <RadioGroup value={sAgora} onValueChange={(v) => setSAgora(v as any)} className="flex gap-6 mt-1">
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
                      if (!v) { setSData(""); return; }
                      const d = new Date(v);
                      setSData(formatNowBr(d));
                    }}
                  />
                )}
              </Field>

              <Button size="lg" className="w-full bg-gradient-primary" onClick={submitSimplificada} disabled={submitting}>
                <PlayCircle className="h-4 w-4 mr-2" />
                {submitting ? "Enviando…" : "Enviar rodagem para Jenkins"}
              </Button>
            </Card>

            <JsonPreview title="Preview do CONFIG_JSON" data={sConfig} onCopy={() => copyJson(sConfig)} />
          </div>
        </TabsContent>

        {/* ============================== CONFIGURADA ============================== */}
        <TabsContent value="configurada">
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            <Card className="glass-card p-4 sm:p-6 space-y-5">
              <Field label="vm_name">
                <Select value={cVm} onValueChange={setCVm}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VM_OPTIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="versao">
                <Input value={cVersao} onChange={(e) => setCVersao(e.target.value)} placeholder="ex.: proxima1.26.7.0" />
              </Field>

              <Field label="casos_teste" hint="Use o mesmo padrão do Jenkins. Para rodar um módulo inteiro, informe o código do módulo (ex.: [2] para Fiscal). Para casos específicos, informe os IDs com colchetes separados por vírgula.">
                <Input value={cCasos} onChange={(e) => setCCasos(e.target.value)} placeholder="[2]   ou   [9.1.4.1.3], [9.1.4.1.4]" />
              </Field>


              <Field label="ct_desmarcar" hint="Casos que devem ser desmarcados antes da execução. Padrão: [0.3].">
                <Input value={cCtDesmarcar} onChange={(e) => setCCtDesmarcar(e.target.value)} />
              </Field>

              <Field label="data_hora" hint="Formato dd/MM/yyyy HH:mm:ss. Para rodar imediatamente, use a data/hora atual menos 1 minuto.">
                <Input value={cDataHora} onChange={(e) => setCDataHora(e.target.value)} placeholder={formatNowMinusOneMinuteBr()} />
              </Field>

              <Field label="branch" hint="Nome da branch que o TestComplete deve usar. Deixe vazio se não quiser trocar branch.">
                <Input value={cBranch} onChange={(e) => setCBranch(e.target.value)} placeholder="(vazio)" />
              </Field>

              <Button size="lg" className="w-full bg-gradient-primary" onClick={submitConfigurada} disabled={submitting}>
                <PlayCircle className="h-4 w-4 mr-2" />
                {submitting ? "Enviando…" : "Enviar rodagem para Jenkins"}
              </Button>
            </Card>

            <JsonPreview title="Preview do CONFIG_JSON" data={cConfig} onCopy={() => copyJson(cConfig)} />
          </div>
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

function JsonPreview({ title, data, onCopy }: { title: string; data: any; onCopy: () => void }) {
  return (
    <Card className="glass-card p-4 sm:p-6">
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
