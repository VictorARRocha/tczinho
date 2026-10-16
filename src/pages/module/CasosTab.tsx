// Casos de teste: a arvore do .mds do modulo (grupos e casos), com busca, e os casos desmarcados
// no mod_xml.py (so visual: o nome fica riscado).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ExternalLink, List, Lock, Network, Search, X } from "lucide-react";
import type { CasoDesativado, TestcaseHierarchyNode } from "@/services/data";
import { useCasosDesativados } from "@/services/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { Empty, SEM_RESULTADO, ToggleChip } from "./common";

const MAX_RESULTADOS = 200;

// Arvore (padrao) ou lista plana, como na aba Falhas; a escolha fica guardada no navegador.
type Visao = "arvore" | "lista";
const VISAO_KEY = "agenttc.casos.view";
function lerVisao(): Visao {
  try {
    return window.localStorage.getItem(VISAO_KEY) === "lista" ? "lista" : "arvore";
  } catch {
    return "arvore";
  }
}
function guardarVisao(v: Visao) {
  try {
    window.localStorage.setItem(VISAO_KEY, v);
  } catch {
    // sem armazenamento: so nao lembra a escolha
  }
}

interface No {
  id: string;
  nome: string;
  descricao: string;
  codigos: string[]; // chamados do caso no Kanboard (o original e os que incrementaram o teste); [] = nao informado
  grupo: boolean;
  caminho: string[]; // nomes dos grupos acima (sem o modulo)
  filhos: No[];
  casos: number; // casos dentro (o proprio, se for caso)
}

const compararIds = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Monta a arvore; o no do proprio modulo ("[2] Fiscal") some e os grupos dele viram o primeiro nivel. */
function montarArvore(nodes: TestcaseHierarchyNode[]): No[] {
  const porId = new Map<string, No>();
  for (const n of nodes) {
    if (!n.node_id || porId.has(n.node_id)) continue;
    porId.set(n.node_id, {
      id: n.node_id, nome: n.node_name || "", descricao: (n.descricao || "").trim(), codigos: codigosDoCaso(n),
      grupo: n.node_type === "grupo", caminho: [], filhos: [], casos: 0,
    });
  }
  const raizes: No[] = [];
  for (const n of nodes) {
    const no = porId.get(n.node_id);
    const pai = n.parent_node_id ? porId.get(n.parent_node_id) : undefined;
    if (!no) continue;
    if (pai && pai !== no) { if (!pai.filhos.includes(no)) pai.filhos.push(no); } else if (!raizes.includes(no)) raizes.push(no);
  }
  const contar = (no: No, caminho: string[]) => {
    no.caminho = caminho;
    no.filhos.sort((a, b) => compararIds(a.id, b.id));
    if (!no.grupo && !no.filhos.length) {
      no.casos = 1;
      return;
    }
    no.grupo = true;
    for (const f of no.filhos) {
      contar(f, [...caminho, no.nome]);
      no.casos += f.casos;
    }
  };
  raizes.sort((a, b) => compararIds(a.id, b.id));
  // O no do codigo do modulo ([2], ou [3]/[4]/[7] no Contabil) e pastas unicas logo abaixo dele
  // (ex.: [3] > [3.1] Contabil) so repetem o nome do modulo: o primeiro nivel ja sao os grupos de dentro.
  const desembrulhar = (r: No): No[] => {
    let atual = r.id.includes(".") ? [r] : r.filhos;
    while (atual.length === 1 && atual[0].filhos.length && semAcento(atual[0].nome) === semAcento(r.nome)) atual = atual[0].filhos;
    return atual;
  };
  const nivel = raizes.flatMap(desembrulhar);
  nivel.forEach((n) => contar(n, []));
  return nivel.sort((a, b) => compararIds(a.id, b.id));
}

/** Cartao do caso no Kanboard. O numero da sprint na URL nao importa (qualquer valor abre o cartao). */
const linkKanboard = (codigo: string) => `https://kanboard.sci.com.br/sprint/0/solicitacao/${codigo}`;

const CODIGO = /#\s?(\d{4,})/g;

/** Chamados do caso: todos os "#codigo" da descricao, na ordem e sem repetir (um caso pode ter o
 *  chamado original e outros que incrementaram o teste). Sem nenhum, o final do nome da procedure
 *  (pConsultaFeriado_245993), que bate com a descricao em quase todos os casos. */
function codigosDoCaso(n: TestcaseHierarchyNode): string[] {
  const daDescricao = [...new Set(Array.from((n.descricao || "").matchAll(CODIGO), (m) => m[1]))];
  if (daDescricao.length) return daDescricao;
  const daProcedure = (n.procedure_name || "").match(/(?:^|_)(\d{4,})$/)?.[1];
  return daProcedure ? [daProcedure] : [];
}

/** Descricao com os "#numeros" do meio do texto (outros chamados citados) como links do Kanboard. */
function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(#\s?\d{4,})/g);
  return (
    <>
      {partes.map((parte, i) => {
        const codigo = parte.match(/^#\s?(\d{4,})$/)?.[1];
        return codigo ? (
          <a key={i} href={linkKanboard(codigo)} target="_blank" rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"><Realce texto={`#${codigo}`} /></a>
        ) : <Realce key={i} texto={parte} />;
      })}
    </>
  );
}

/** Desativados vem so da lista fixa do mod_xml.py (a API sincroniza a cada rodagem): nao mudam pelo dashboard. */
const MOD_XML = "mod_xml";

/** Desativacao do caso: a dele ou a de um grupo acima (desmarcar o grupo tira tudo de dentro da rodagem). */
interface Desativacao {
  linha: CasoDesativado;
  viaGrupo: string | null; // id do grupo que desativou (null = o proprio caso)
}

function desativacaoDe(id: string, desativados: Map<string, CasoDesativado>): Desativacao | null {
  const partes = id.split(".");
  for (let n = partes.length; n >= 1; n--) {
    const prefixo = partes.slice(0, n).join(".");
    const linha = desativados.get(prefixo);
    if (linha) return { linha, viaGrupo: prefixo === id ? null : prefixo };
  }
  return null;
}

/** O que as linhas precisam sem passar de mao em mao pela arvore. */
const DesativadoCtx = createContext<(id: string) => Desativacao | null>(() => null);
const useDesativado = () => useContext(DesativadoCtx);
/** Termo buscado (sem acento, minusculo) para o realce. */
const TermoCtx = createContext("");

/** Trecho buscado em amarelo, sem diferenciar acento nem maiusculas. */
function Realce({ texto }: { texto: string }) {
  const termo = useContext(TermoCtx);
  const norm = termo ? semAcento(texto) : "";
  // Letra que muda de tamanho ao tirar o acento desalinharia as posicoes: fica sem realce.
  if (!termo || norm.length !== texto.length || !norm.includes(termo)) return <>{texto}</>;
  const partes: ReactNode[] = [];
  let i = 0;
  for (let k = norm.indexOf(termo); k >= 0; k = norm.indexOf(termo, i)) {
    if (k > i) partes.push(texto.slice(i, k));
    partes.push(<mark key={k} className="bg-transparent font-semibold text-yellow-600 dark:text-yellow-300">{texto.slice(k, k + termo.length)}</mark>);
    i = k + termo.length;
  }
  partes.push(texto.slice(i));
  return <>{partes}</>;
}

export function CasosTab({ moduloSlug, hierarchy }: {
  moduloSlug: string;
  hierarchy: TestcaseHierarchyNode[];
}) {
  const [busca, setBusca] = useState("");
  const [soDesativados, setSoDesativados] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [visao, setVisao] = useState<Visao>(lerVisao);
  const mudarVisao = (v: Visao) => { setVisao(v); guardarVisao(v); };
  // Na busca em arvore os grupos encontrados vem abertos; aqui ficam os que a pessoa fechou.
  const [fechadosBusca, setFechadosBusca] = useState<Set<string>>(new Set());
  const { data: listaDesativados = [] } = useCasosDesativados(moduloSlug);

  // So o mod_xml.py conta como desativado (marcacoes antigas feitas a mao no dashboard ficam de fora).
  const desativados = useMemo(
    () => new Map(listaDesativados.filter((d) => d.disabled_by === MOD_XML).map((d) => [d.node_id, d])),
    [listaDesativados],
  );

  const arvore = useMemo(() => montarArvore(hierarchy), [hierarchy]);
  const casos = useMemo(() => {
    const lista: No[] = [];
    const visitar = (n: No) => (n.grupo ? n.filhos.forEach(visitar) : lista.push(n));
    arvore.forEach(visitar);
    return lista;
  }, [arvore]);
  // Estavel entre renders: o contexto nao redesenha todas as linhas a cada tecla.
  const desativado = useCallback((id: string) => desativacaoDe(id, desativados), [desativados]);
  const totalDesativados = useMemo(() => casos.filter((c) => desativado(c.id)).length, [casos, desativado]);

  // A busca espera uma pausa curta na digitacao antes de percorrer os milhares de casos.
  const buscaAplicada = useDebounce(busca, 150);
  const termo = semAcento(buscaAplicada.trim()).replace(/^\[|\]$/g, "");
  const filtrando = !!termo || soDesativados;
  const resultados = useMemo(() => (!filtrando ? [] : casos.filter((c) =>
    (!soDesativados || desativado(c.id)) && (!termo
      || c.id === termo || c.id.startsWith(termo + ".")
      || semAcento(`${c.nome} ${c.descricao} ${c.codigos.map((k) => `#${k}`).join(" ")}`).includes(termo)))),
  [filtrando, casos, soDesativados, desativado, termo]);
  useEffect(() => setFechadosBusca(new Set()), [termo, soDesativados]);

  // Arvore so com os grupos que tem caso encontrado (contagem = encontrados).
  const arvoreVisivel = useMemo(() => {
    if (!filtrando) return arvore;
    const ok = new Set(resultados.map((c) => c.id));
    const podar = (n: No): No | null => {
      if (!n.grupo) return ok.has(n.id) ? n : null;
      const filhos = n.filhos.map(podar).filter((f): f is No => !!f);
      return filhos.length ? { ...n, filhos, casos: filhos.reduce((soma, f) => soma + f.casos, 0) } : null;
    };
    return arvore.map(podar).filter((n): n is No => !!n);
  }, [filtrando, arvore, resultados]);

  if (!hierarchy.length) return <Empty text="A lista de casos aparece depois da próxima rodagem deste módulo." />;

  const inverter = (atual: Set<string>, id: string) => {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  };
  const alternar = (id: string) => (filtrando ? setFechadosBusca : setAbertos)((atual) => inverter(atual, id));
  const estaAberto = (id: string) => (filtrando ? !fechadosBusca.has(id) : abertos.has(id));
  // Pastas sem nenhum caso dentro nao abrem (nao ha o que mostrar).
  const gruposComCaso = () => {
    const ids = new Set<string>();
    const visitar = (n: No) => { if (n.grupo && n.casos > 0) { ids.add(n.id); n.filhos.forEach(visitar); } };
    arvoreVisivel.forEach(visitar);
    return ids;
  };
  const algumAberto = filtrando ? arvoreVisivel.some((n) => !fechadosBusca.has(n.id)) : abertos.size > 0;
  const expandirOuRecolher = () => {
    if (filtrando) setFechadosBusca(algumAberto ? gruposComCaso() : new Set());
    else setAbertos(algumAberto ? new Set() : gruposComCaso());
  };
  const listaPlana = filtrando ? resultados : casos;

  return (
    <DesativadoCtx.Provider value={desativado}>
    <TermoCtx.Provider value={termo}>
      <div className="space-y-4">
        <Card className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span><strong>{casos.length.toLocaleString("pt-BR")}</strong> <span className="text-muted-foreground">casos cadastrados no módulo</span></span>
            {totalDesativados > 0 && (
              <span className="text-muted-foreground"><strong>{totalDesativados}</strong> {totalDesativados === 1 ? "desmarcado" : "desmarcados"} no mod_xml</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por número, nome ou chamado"
                title="Ex.: 2.1.3, parte do nome, da descrição ou o número do chamado"
                aria-label="Buscar casos de teste"
                className="pl-9 pr-9"
              />
              {busca && (
                <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")}
                  className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground md:right-1 md:h-8 md:w-8">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {totalDesativados > 0 && (
              <Button size="sm" variant={soDesativados ? "default" : "outline"} className="max-md:h-11" aria-pressed={soDesativados} onClick={() => setSoDesativados((v) => !v)}>
                Só os desmarcados
              </Button>
            )}
            <div className="flex flex-wrap gap-1 sm:ml-auto">
              <ToggleChip label="Árvore" icon={<Network className="h-3.5 w-3.5" />} active={visao === "arvore"} onClick={() => mudarVisao("arvore")} />
              <ToggleChip label="Lista" icon={<List className="h-3.5 w-3.5" />} active={visao === "lista"} onClick={() => mudarVisao("lista")} />
              {visao === "arvore" && (
                <Button size="sm" variant="outline" className="max-md:h-11" onClick={expandirOuRecolher}>
                  {algumAberto ? <><ChevronsDownUp className="h-3.5 w-3.5" /> Recolher tudo</> : <><ChevronsUpDown className="h-3.5 w-3.5" /> Expandir tudo</>}
                </Button>
              )}
            </div>
          </div>
          {/* Total da busca lido pelo leitor de tela (antes so aparecia acima de 200). */}
          <p role="status" className={filtrando ? "text-xs text-muted-foreground" : "sr-only"}>
            {filtrando ? `${resultados.length.toLocaleString("pt-BR")} ${resultados.length === 1 ? "caso encontrado" : "casos encontrados"}` : ""}
          </p>
        </Card>

        <Card className="overflow-hidden">
          {filtrando && resultados.length === 0 ? (
            <Empty text={SEM_RESULTADO} onClear={() => { setBusca(""); setSoDesativados(false); }} />
          ) : visao === "lista" ? (
            <>
              <ul className="space-y-0.5 p-1.5" aria-label={filtrando ? "Casos encontrados" : "Casos de teste do módulo"}>
                {listaPlana.slice(0, MAX_RESULTADOS).map((c) => (
                  <li key={c.id}><LinhaCaso no={c} mostrarCaminho /></li>
                ))}
              </ul>
              {listaPlana.length > MAX_RESULTADOS && (
                <p className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground">
                  Mostrando {MAX_RESULTADOS} de {listaPlana.length.toLocaleString("pt-BR")}. {filtrando ? "Refine a busca" : "Use a busca ou a árvore"} para ver o resto.
                </p>
              )}
            </>
          ) : (
            <ul aria-label={filtrando ? "Casos encontrados" : "Casos de teste do módulo"} className="p-1.5">
              {arvoreVisivel.map((n) => <Ramo key={n.id} no={n} aberto={estaAberto} onToggle={alternar} />)}
            </ul>
          )}
        </Card>
      </div>
    </TermoCtx.Provider>
    </DesativadoCtx.Provider>
  );
}

// Grupo: uma linha (seta, numero, nome, contagem); aberto, os filhos ficam numa linha-guia recuada.
function Ramo({ no, aberto: estaAberto, onToggle }: { no: No; aberto: (id: string) => boolean; onToggle: (id: string) => void }) {
  if (!no.grupo) return <li><LinhaCaso no={no} /></li>;
  const vazio = no.casos === 0;
  const aberto = !vazio && estaAberto(no.id);
  const conteudo = (
    <>
      <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-strong", aberto && "rotate-90", vazio && "invisible")} aria-hidden />
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"><Realce texto={no.id} /></span>
      <span className={cn("min-w-0 text-sm font-medium sm:truncate", vazio && "text-muted-foreground")}><Realce texto={no.nome} /></span>
      <SeloGrupoDesativado id={no.id} />
      <span className="ml-auto shrink-0 px-1 text-xs text-muted-foreground tabular-nums">{no.casos} {no.casos === 1 ? "caso" : "casos"}</span>
    </>
  );
  return (
    <li>
      {vazio ? (
        // Pasta sem nenhum caso dentro: sem abrir/fechar, so mostra que esta vazia.
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 max-md:min-h-11" title={no.descricao || "Pasta sem casos de teste"}>{conteudo}</div>
      ) : (
        <button type="button" aria-expanded={aberto} onClick={() => onToggle(no.id)} title={no.descricao || undefined}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60 max-md:min-h-11">
          {conteudo}
        </button>
      )}
      {aberto && (
        <ul className="ml-[15px] border-l border-border pl-2">
          {no.filhos.map((f) => <Ramo key={f.id} no={f} aberto={estaAberto} onToggle={onToggle} />)}
        </ul>
      )}
    </li>
  );
}

/** Grupo desmarcado no mod_xml: tudo dentro fica de fora. */
function SeloGrupoDesativado({ id }: { id: string }) {
  const info = useDesativado()(id);
  if (!info || info.viaGrupo) return null;
  return (
    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning" title={info.linha.reason || undefined}>
      Desmarcado no mod_xml
    </span>
  );
}

/** Caso: uma linha (numero, nome, chamado com link do Kanboard, situacao). Clicar na linha abre a descricao. */
function LinhaCaso({ no, mostrarCaminho }: { no: No; mostrarCaminho?: boolean }) {
  const info = useDesativado()(no.id);
  const [aberto, setAberto] = useState(false);
  const marcado = info?.linha;
  // O codigo do inicio da descricao ja aparece na linha; o resto do texto fica como esta.
  const descricao = no.descricao.replace(/^\s*#\s?\d{4,}\s*[-–:,.]?\s*/, "");
  return (
    <div className={cn("group rounded-md", aberto && "bg-muted/40")}>
      {/* A linha toda abre o caso; o chamado e um link para o Kanboard (nao abre a linha). */}
      <div className="flex items-center gap-2" onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) setAberto((v) => !v); }}>
        <div className="flex min-w-0 flex-1 cursor-pointer items-center rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 max-md:min-h-11">
          <span className="min-w-0 flex-1">
            {mostrarCaminho && no.caminho.length > 0 && (
              <span className="block truncate text-[11px] text-muted-foreground"><Realce texto={no.caminho.join(" › ")} /></span>
            )}
            {/* No celular quebra como texto (numero, nome e chamado ocupam a largura toda); no computador, uma linha. */}
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-nowrap sm:items-center">
              <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
                className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-left sm:flex-nowrap sm:items-center">
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"><Realce texto={no.id} /></span>
                <span className={cn("min-w-0 text-sm sm:truncate", info && "line-through text-muted-foreground")}><Realce texto={no.nome} /></span>
              </button>
              {/* Um link por chamado, lado a lado. */}
              {no.codigos.length > 0 && (
                <span className="inline-flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  {no.codigos.map((codigo) => (
                    <a
                      key={codigo}
                      href={linkKanboard(codigo)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir #${codigo} no Kanboard`}
                      title={`Abrir #${codigo} no Kanboard`}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded font-mono text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Realce texto={`#${codigo}`} />
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ))}
                </span>
              )}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-2">
          {info && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning"
              title={info.viaGrupo ? `Desmarcado pelo grupo [${info.viaGrupo}]` : marcado?.reason || undefined}>
              <Lock className="h-3 w-3" aria-hidden />
              {info.viaGrupo ? "grupo desmarcado" : "mod_xml"}
            </span>
          )}
          {/* Seta no fim da linha (alinhada em todos os casos): aparece ao passar o mouse ou com o caso aberto. */}
          <button type="button" tabIndex={-1} aria-hidden onClick={() => setAberto((v) => !v)}
            className={cn("rounded p-0.5 text-muted-foreground/70 transition-opacity", aberto ? "opacity-100" : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100")}>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out-strong", aberto && "rotate-180")} />
          </button>
        </div>
      </div>

      {aberto && (
        <div className="space-y-2 px-2 pb-3 pl-9 text-xs">
          {descricao ? (
            <p className="leading-relaxed text-muted-foreground"><TextoComLinks texto={descricao} /></p>
          ) : (
            <p className="text-muted-foreground">Sem descrição no .mds.</p>
          )}
          {marcado && (
            <p className="text-warning">
              {info?.viaGrupo
                ? `Fica de fora porque o grupo [${info.viaGrupo}] está desmarcado no mod_xml.`
                : `${marcado.reason || "Desmarcado pelo mod_xml.py"}. Para mudar, edite a lista no mod_xml.py.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
