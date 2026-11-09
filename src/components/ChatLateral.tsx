import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { askChat, type AiGroupError, type ChatMessage } from "@/services/aiGrouping";

const EXEMPLOS = ["Como foi a última rodagem de cada módulo?", "Resuma as falhas do Fiscal na última semana"];

/** Texto da IA: so **negrito** vira <strong>; o resto fica como texto (quebras de linha mantidas). */
function TextoIa({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*\n]+\*\*)/g).map((parte, i) =>
        parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
          <strong key={i} className="font-semibold">{parte.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

/** Assistente de IA: bolinha no canto inferior direito que abre um chat flutuante.
 *  A conversa fica so na tela: fechar mantem, recarregar a pagina apaga. */
export function ChatLateral() {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens, enviando, aberto]);

  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

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
    <>
      {aberto && (
        <section
          role="dialog"
          aria-label="Assistente"
          className="fixed bottom-24 right-4 z-50 flex h-[min(600px,calc(100svh-8rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:right-6 sm:w-[400px]"
        >
          <header className="flex items-start gap-2 border-b border-border px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Assistente</h2>
              <p className="text-xs text-muted-foreground">Consulta rodagens, falhas e reexecuções. Não pede rodagens.</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setAberto(false)} aria-label="Fechar assistente">
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-3" aria-live="polite">
            {mensagens.length === 0 && (
              <div className="space-y-2">
                {EXEMPLOS.map((exemplo) => (
                  <Button
                    key={exemplo}
                    variant="secondary"
                    size="sm"
                    className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                    onClick={() => enviar(exemplo)}
                  >
                    {exemplo}
                  </Button>
                ))}
              </div>
            )}
            {mensagens.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]",
                  m.role === "user"
                    ? "ml-auto rounded-br-sm bg-primary text-primary-foreground"
                    : "mr-auto rounded-bl-sm bg-secondary",
                )}
              >
                {m.role === "assistant" ? <TextoIa texto={m.content} /> : m.content}
              </div>
            ))}
            {enviando && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Consultando...
              </div>
            )}
            {erro && <p role="alert" className="break-words text-sm text-destructive">{erro}</p>}
            <div ref={fim} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <Textarea
              ref={campo}
              aria-label="Pergunta"
              rows={1}
              className="max-h-32 min-h-[2.75rem] resize-none"
              value={texto}
              placeholder="Pergunte algo..."
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
        </section>
      )}

      <Button
        size="icon"
        className="fixed bottom-6 right-4 z-50 h-14 w-14 rounded-full shadow-lg sm:right-6"
        onClick={() => setAberto((v) => !v)}
        aria-label="Assistente de IA"
        aria-expanded={aberto}
      >
        {aberto ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </Button>
    </>
  );
}
