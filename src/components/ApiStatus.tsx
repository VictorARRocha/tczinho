/** Indicador do estado da API: verde (online), vermelho (sem resposta) ou cinza (verificando). */
export function ApiStatusDot({ online }: { online: boolean | undefined }) {
  const color = online === undefined ? "bg-muted-foreground" : online ? "bg-success" : "bg-destructive";
  return (
    <span className="relative flex h-2 w-2">
      {online && <span className={`absolute inline-flex h-full w-full animate-pulse-glow rounded-full ${color}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}
