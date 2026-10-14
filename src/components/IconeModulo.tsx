// Icone de cada modulo (menu lateral e cards): os do Unico recortados da tela de modulos do sistema
// e o do Practice da tela de abertura do Folha Visual Practice.
// A imagem e so o desenho em branco usado como mascara: o icone pega a cor do texto (tema claro e escuro).
import { HandCoins, Package, Server, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const IMAGENS: Record<string, string> = {
  folha: "/modulos/folha.png",
  fiscal: "/modulos/fiscal.png",
  contabil: "/modulos/contabil.png",
  financeiro: "/modulos/financeiro.png",
  gestao: "/modulos/gestao.png", // o Tarefas, principal do Gestao
  practice: "/modulos/practice.png",
};

// Sem imagem: Geral (configuracoes e Gerenciador SCI) e o Suprema (o icone que o Fiscal usava no menu).
const OUTROS: Record<string, LucideIcon> = { geral: Server, suprema: HandCoins };

export function IconeModulo({ slug, className }: { slug: string; className?: string }) {
  const imagem = IMAGENS[slug];
  if (!imagem) {
    const Icone = OUTROS[slug] || Package;
    return <Icone className={className} aria-hidden />;
  }
  return <ImagemMascara src={imagem} className={className} />;
}

/** Desenho monocromatico na cor do texto (mesmo esquema dos icones dos modulos). Com rotulo, vira imagem acessivel. */
export function ImagemMascara({ src, className, rotulo }: { src: string; className?: string; rotulo?: string }) {
  const mascara = `url(${src})`;
  return (
    <span
      {...(rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true })}
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        maskImage: mascara, WebkitMaskImage: mascara,
        maskSize: "contain", WebkitMaskSize: "contain",
        maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
        maskPosition: "center", WebkitMaskPosition: "center",
      }}
    />
  );
}
