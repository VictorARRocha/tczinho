import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { askChat, type AiGroupError, type ChatMessage } from "@/services/aiGrouping";

const EXEMPLOS = ["Como foi a última rodagem de cada módulo?", "Resuma as falhas do Fiscal na última semana"];

/** Chat com a IA no canto do cabeçalho. A conversa fica só na tela (some ao recarregar). */
export function ChatLateral() {
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens, enviando]);

  async function enviar(pergunta: string) {
    pergunta = pergunta.trim();
    if (!pergunta || enviando) return;
    const historico: ChatMessage[] = [...mensagens, { role: "user", content: pergunta }];
    setMensagens(historico);
    setTexto("");
    setErro("");
    setEnviando(true);
    try {
      const resposta = await askChat(historico);
      setMensagens([...historico, { role: "assistant", content: resposta }]);
    } catch (e) {
      setErro((e as AiGroupError).message || "Não foi possível falar com a IA.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 gap-2 md:h-9" aria-label="Assistente de IA">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-xs max-sm:hidden">Assistente</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assistente</SheetTitle>
          <SheetDescription>Pergunte sobre rodagens, falhas e reexecuções. A IA só consulta; não pede rodagens.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {mensagens.length === 0 && (
            <div className="space-y-2">
              {EXEMPLOS.map((exemplo) => (
                <Button key={exemplo} variant="secondary" size="sm" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => enviar(exemplo)}>
                  {exemplo}
                </Button>
              ))}
            </div>
          )}
          {mensagens.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-4 whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-sm"
              }
            >
              {m.content}
            </div>
          ))}
          {enviando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando...
            </div>
          )}
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div ref={fim} />
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <Textarea
            aria-label="Pergunta"
            rows={2}
            value={texto}
            placeholder="Ex.: falhas do Fiscal de 01/11 a 08/11"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(texto);
              }
            }}
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={enviando || !texto.trim()} aria-label="Enviar">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
