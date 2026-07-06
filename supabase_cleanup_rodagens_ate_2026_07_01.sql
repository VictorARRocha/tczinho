-- =============================================================
-- Limpeza de rodagens antigas — até 01/07/2026 (inclusive)
-- Cole no SQL Editor: https://supabase.com/dashboard/project/bxbqciqyxvcrlkheszdk/sql/new
-- Rode dentro de uma transação. Cheque a contagem no SELECT inicial
-- antes de dar COMMIT.
-- =============================================================

begin;

-- Corte: tudo com data_inicio_rodagem até 2026-07-01 23:59:59
-- (rodagens sem data também entram no filtro se você quiser — descomente a linha abaixo)
with alvo as (
  select id from public.rodagens
   where data_inicio_rodagem < '2026-07-02'::timestamptz
     -- or data_inicio_rodagem is null
)
select count(*) as rodagens_a_apagar from alvo;

-- Coleta os ids uma vez em tabela temporária (mais rápido do que repetir o WHERE)
create temporary table _tmp_rodagens_del on commit drop as
  select id from public.rodagens
   where data_inicio_rodagem < '2026-07-02'::timestamptz;

-- 1) Filhos primeiro (evita erros de FK caso alguma não tenha ON DELETE CASCADE)
delete from public.evidencias      where rodagem_id in (select id from _tmp_rodagens_del);
delete from public.falhas          where rodagem_id in (select id from _tmp_rodagens_del);
delete from public.agrupamentos    where rodagem_id in (select id from _tmp_rodagens_del);
delete from public.atrasos_rodagem where rodagem_id in (select id from _tmp_rodagens_del);
delete from public.proximos_passos where rodagem_id in (select id from _tmp_rodagens_del);

-- 2) Rodagens
delete from public.rodagens where id in (select id from _tmp_rodagens_del);

-- Confira o resultado
select
  (select count(*) from public.rodagens)   as rodagens_restantes,
  (select count(*) from public.evidencias) as evidencias_restantes,
  (select count(*) from public.falhas)     as falhas_restantes;

-- Se estiver tudo certo:
commit;
-- Se algo pareceu errado:
-- rollback;

-- Recuperar espaço físico (opcional, útil quando o dump ficou muito grande)
vacuum analyze public.evidencias;
vacuum analyze public.falhas;
vacuum analyze public.rodagens;
