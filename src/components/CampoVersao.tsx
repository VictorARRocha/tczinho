import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { SelectBusca } from "@/components/SelectBusca";
import { atualizarVersoesUnico, type VersoesUnico } from "@/services/data";
import { queryKeys, useVersoesUnico } from "@/services/queries";
import { mensagemDaApi } from "@/lib/apiErro";
import { formatDateTime } from "@/lib/format";

const OUTRA = "__outra_versao__";

/**
 * Campo Versao dos pedidos de rodagem: lista com busca das versoes do Gerenciador SCI (VersoesUnico)
 * e "Digitar outra versao..." para nao travar ninguem se a lista estiver velha.
 * Sem lista (API sem dados ou fora): o campo de digitar de sempre.
 */
export function CampoVersao({
  id, value, onChange, invalido, descritoPor, ariaLabel, placeholder, className, sugestoes, sugestoesId, mostrarAtualizar,
}: {
  id?: string; value: string; onChange: (valor: string) => void; invalido?: boolean; descritoPor?: string;
  ariaLabel?: string; placeholder?: string; className?: string;
  /** Sugestoes do campo de digitar (ex.: versoes que ja rodaram), em um datalist com este id. */
  sugestoes?: string[]; sugestoesId?: string;
  /** Linha "Atualizar lista" embaixo do campo (so admin: reinicia o Gerenciador SCI da D01). */
  mostrarAtualizar?: boolean;
}) {
  const { data } = useVersoesUnico();
  const versoes = data?.versoes || [];
  const [digitando, setDigitando] = useState(false);
  const naLista = versoes.includes(value.trim().toLowerCase());

  const campo = !versoes.length || digitando || (value.trim() !== "" && !naLista) ? (
    <div className="space-y-1">
      <Input
        id={id} value={value} aria-label={ariaLabel} placeholder={placeholder} autoFocus={digitando}
        list={sugestoes?.length ? sugestoesId : undefined}
        aria-invalid={invalido || undefined} aria-describedby={descritoPor} className={className}
        // Digitando, fica no campo de texto mesmo se o texto bater com uma versao da lista.
        onChange={(e) => { if (versoes.length) setDigitando(true); onChange(e.target.value); }}
      />
      {sugestoes?.length ? (
        <datalist id={sugestoesId}>{sugestoes.map((v) => <option key={v} value={v} />)}</datalist>
      ) : null}
      {versoes.length > 0 && (
        <button
          type="button" className="text-xs text-primary hover:underline"
          onClick={() => { setDigitando(false); onChange(""); }}
        >
          Escolher da lista
        </button>
      )}
    </div>
  ) : (
    <SelectBusca
      id={id} ariaLabel={ariaLabel} className={className}
      value={naLista ? value.trim().toLowerCase() : ""}
      onChange={(v) => { if (v === OUTRA) { setDigitando(true); onChange(""); } else onChange(v); }}
      opcoes={[...versoes.map((v) => ({ valor: v, rotulo: v })), { valor: OUTRA, rotulo: "Digitar outra versão…" }]}
      placeholder="Selecione a versão" buscaPlaceholder="Buscar versão…" vazio="Nenhuma versão encontrada."
    />
  );

  if (!mostrarAtualizar) return campo;
  return (
    <>
      {campo}
      <AtualizarLista dados={data} />
    </>
  );
}

function AtualizarLista({ dados }: { dados?: VersoesUnico }) {
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();
  const pedidoEm = dados?.pedido_em ? Date.parse(dados.pedido_em) : NaN;
  const listaEm = dados?.updated_at ? Date.parse(dados.updated_at) : NaN;
  // Pedido que expirou (10 min na API) sem a lista nova chegar.
  const naoChegou = !dados?.pedido_pendente && pedidoEm > 0 && !(listaEm >= pedidoEm);

  const pedir = async () => {
    setEnviando(true);
    try {
      queryClient.setQueryData(queryKeys.versoesUnico, await atualizarVersoesUnico());
      toast.success("Atualização pedida", { description: "A D01 vai reiniciar o Gerenciador SCI e ler as versões (uns 2 minutos)." });
    } catch (e) {
      toast.error("Não foi possível pedir a atualização", { description: mensagemDaApi(e) });
    } finally {
      setEnviando(false);
    }
  };

  if (dados?.pedido_pendente) {
    return (
      <p className="mt-1 text-xs text-muted-foreground" role="status">
        Atualização pedida em {formatDateTime(dados.pedido_em)}… a lista chega em uns 2 minutos.
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {naoChegou
        ? <span className="text-warning">A última atualização pedida não chegou (veja o log do VersoesUnico na D01). </span>
        : <>Lista de {dados?.updated_at ? formatDateTime(dados.updated_at) : "—"} · </>}
      <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={enviando} onClick={pedir}>
        Atualizar lista
      </button>
    </p>
  );
}
