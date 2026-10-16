import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Ultimo valor nao nulo: o painel continua montado com o conteudo de antes enquanto fecha
 * (a animacao de saida roda inteira e o foco tem para onde voltar).
 */
export function useUltimoValor<T>(valor: T | null): T | null {
  const [ultimo, setUltimo] = useState<T | null>(valor);
  if (valor != null && valor !== ultimo) setUltimo(valor);
  return valor ?? ultimo;
}

/**
 * O Radix so devolve o foco a um Trigger dele; estes paineis abrem por estado (clique num card ou
 * linha), entao guarda o elemento focado ao abrir e devolve o foco a ele ao fechar.
 * O efeito de layout roda antes de o painel puxar o foco para dentro.
 */
export function useFocoDeVolta(aberto: boolean) {
  const anterior = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (aberto) anterior.current = document.activeElement as HTMLElement | null;
  }, [aberto]);
  return useCallback((evento: Event) => {
    const el = anterior.current;
    if (el && el.isConnected && el !== document.body) {
      evento.preventDefault();
      el.focus({ preventScroll: true });
    }
  }, []);
}

/** Ao trocar de etapa o botao apertado some junto: o foco vai para o titulo da etapa nova. */
export function useFocoNaEtapa(etapa: number) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    titulo.current?.focus();
  }, [etapa]);
  return titulo;
}
