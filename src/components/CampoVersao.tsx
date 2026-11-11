import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SelectBusca } from "@/components/SelectBusca";
import { useVersoesUnico } from "@/services/queries";

const OUTRA = "__outra_versao__";

/**
 * Campo Versao dos pedidos de rodagem: lista com busca das versoes do Gerenciador SCI (VersoesUnico)
 * e "Digitar outra versao..." para nao travar ninguem se a lista estiver velha.
 * Sem lista (API sem dados ou fora): o campo de digitar de sempre.
 */
export function CampoVersao({
  id, value, onChange, invalido, descritoPor, ariaLabel, placeholder, className, sugestoes, sugestoesId,
}: {
  id?: string; value: string; onChange: (valor: string) => void; invalido?: boolean; descritoPor?: string;
  ariaLabel?: string; placeholder?: string; className?: string;
  /** Sugestoes do campo de digitar (ex.: versoes que ja rodaram), em um datalist com este id. */
  sugestoes?: string[]; sugestoesId?: string;
}) {
  const { data } = useVersoesUnico();
  const versoes = data?.versoes || [];
  const [digitando, setDigitando] = useState(false);
  const naLista = versoes.includes(value.trim().toLowerCase());

  if (!versoes.length || digitando || (value.trim() !== "" && !naLista)) {
    return (
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
    );
  }

  return (
    <SelectBusca
      id={id} ariaLabel={ariaLabel} className={className}
      value={naLista ? value.trim().toLowerCase() : ""}
      onChange={(v) => { if (v === OUTRA) { setDigitando(true); onChange(""); } else onChange(v); }}
      opcoes={[...versoes.map((v) => ({ valor: v, rotulo: v })), { valor: OUTRA, rotulo: "Digitar outra versão…" }]}
      placeholder="Selecione a versão" buscaPlaceholder="Buscar versão…" vazio="Nenhuma versão encontrada."
    />
  );
}
