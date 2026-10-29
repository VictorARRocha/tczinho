import { toast } from "sonner";

/**
 * Copia o texto e avisa com um toast. O dashboard roda em http (sem HTTPS), onde o navegador nao
 * oferece navigator.clipboard: ai copia pelo jeito antigo (textarea + execCommand).
 * `origem`: o botao clicado. Dentro de janela/painel (Dialog, Sheet) o textarea vai junto dele,
 * senao o foco preso da janela desfaz a selecao.
 */
export function copiarTexto(texto: string, mensagem: string, origem?: HTMLElement | null): void {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(
      () => toast.success(mensagem),
      () => toast.error("Não foi possível copiar"),
    );
    return;
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  (origem?.parentElement ?? document.body).appendChild(area);
  area.focus();
  area.select();
  const copiou = typeof document.execCommand === "function" && document.execCommand("copy");
  area.remove();
  if (copiou) toast.success(mensagem);
  else toast.error("Não foi possível copiar");
}
