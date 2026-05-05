import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileJson } from "lucide-react";
import { toast } from "sonner";

export default function ImportPage() {
  const [content, setContent] = useState<any>(null);

  const handleFile = async (file: File) => {
    try {
      const txt = await file.text();
      const json = JSON.parse(txt);
      setContent(json);
      toast.success("JSON carregado", { description: "Pré-visualização disponível abaixo." });
    } catch (e: any) {
      toast.error("JSON inválido", { description: e?.message });
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10 animate-fade-in">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-warning mb-3">Fallback</div>
        <h1 className="text-3xl font-bold">Importar JSON manualmente</h1>
        <p className="text-sm text-muted-foreground mt-2">O fluxo principal é via Supabase. Use esta tela apenas para inspecionar JSONs gerados pelo Codex/Python sem gravar no banco.</p>
      </div>

      <Card className="glass-card p-8 border-dashed">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3"><Upload className="h-5 w-5 text-primary" /></div>
          <p className="text-sm font-medium">Arraste um arquivo .json ou selecione</p>
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" id="json-input" />
          <label htmlFor="json-input"><Button asChild variant="outline" className="mt-4"><span><FileJson className="h-4 w-4 mr-2" />Selecionar JSON</span></Button></label>
        </div>
      </Card>

      {content && (
        <Card className="glass-card mt-6 p-4">
          <pre className="font-mono text-xs overflow-auto max-h-[500px]">{JSON.stringify(content, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}
