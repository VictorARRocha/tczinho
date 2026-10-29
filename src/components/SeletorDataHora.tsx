import { useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, isToday, startOfDay,
  startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const HORAS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Valor no formato "yyyy-MM-ddTHH:mm" (horario local), o mesmo do antigo campo datetime-local. */
function lerValor(valor: string): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function paraValor(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Data e hora do agendamento: calendario do mes (dias passados bloqueados) e hora/minuto em listas.
 * Sem valor, o primeiro dia escolhido vem com a proxima hora cheia.
 */
export function SeletorDataHora({
  id, value, onChange, invalido, descricaoId, rotulo = "Data e hora do agendamento",
}: {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  invalido?: boolean;
  descricaoId?: string;
  rotulo?: string;
}) {
  const escolhida = lerValor(value);
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(() => startOfMonth(escolhida || new Date()));
  const hoje = startOfDay(new Date());
  const dias = eachDayOfInterval({ start: startOfWeek(mes), end: endOfWeek(endOfMonth(mes)) });

  const base = () => {
    if (escolhida) return escolhida;
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  };
  const escolherDia = (dia: Date) => {
    const b = base();
    const d = new Date(dia);
    d.setHours(b.getHours(), b.getMinutes(), 0, 0);
    onChange(paraValor(d));
  };
  const escolherHora = (parte: "h" | "m", texto: string) => {
    const d = new Date(base());
    if (parte === "h") d.setHours(Number(texto));
    else d.setMinutes(Number(texto));
    onChange(paraValor(d));
  };
  // Minuto fora da lista (ex.: valor antigo 22:33) continua aparecendo.
  const minutoAtual = escolhida ? format(escolhida, "mm") : "";
  const minutos = minutoAtual && !MINUTOS.includes(minutoAtual) ? [...MINUTOS, minutoAtual].sort() : MINUTOS;

  return (
    <Popover
      open={aberto}
      onOpenChange={(o) => {
        if (o) setMes(startOfMonth(escolhida || new Date()));
        setAberto(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={rotulo}
          aria-invalid={invalido}
          aria-describedby={descricaoId}
          className={cn(
            "mt-2 h-10 w-full justify-start gap-2 px-3 font-normal",
            !escolhida && "text-muted-foreground",
            invalido && "border-destructive",
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="block truncate first-letter:uppercase">
            {escolhida ? format(escolhida, "EEE, dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "Escolha a data e a hora"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[296px] p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mês anterior"
            disabled={!isBefore(startOfMonth(hoje), mes)} onClick={() => setMes((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="inline-block text-sm font-medium first-letter:uppercase" aria-live="polite">{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Próximo mês"
            onClick={() => setMes((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Dias do mês">
          {DIAS_SEMANA.map((d, i) => (
            <span key={i} className="py-1 text-[11px] font-medium text-muted-foreground" aria-hidden>{d}</span>
          ))}
          {dias.map((dia) => {
            const passado = isBefore(dia, hoje);
            const selecionado = !!escolhida && isSameDay(dia, escolhida);
            return (
              <button
                key={dia.toISOString()}
                type="button"
                disabled={passado}
                aria-pressed={selecionado}
                aria-label={format(dia, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                onClick={() => escolherDia(dia)}
                className={cn(
                  "h-9 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !isSameMonth(dia, mes) && "text-muted-foreground/50",
                  passado ? "cursor-not-allowed opacity-30" : "hover:bg-accent",
                  isToday(dia) && !selecionado && "font-semibold text-primary",
                  selecionado && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {format(dia, "d")}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Horário</span>
          <Select value={escolhida ? format(escolhida, "HH") : ""} onValueChange={(v) => escolherHora("h", v)}>
            <SelectTrigger className="h-9 w-[72px]" aria-label="Hora"><SelectValue placeholder="hh" /></SelectTrigger>
            <SelectContent className="max-h-60">
              {HORAS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
          <span aria-hidden>:</span>
          <Select value={minutoAtual} onValueChange={(v) => escolherHora("m", v)}>
            <SelectTrigger className="h-9 w-[72px]" aria-label="Minuto"><SelectValue placeholder="mm" /></SelectTrigger>
            <SelectContent className="max-h-60">
              {minutos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" className="ml-auto h-9" disabled={!escolhida} onClick={() => setAberto(false)}>
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
