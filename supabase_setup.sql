-- =====================================================================
-- TC Agente SCI — SCI QA Agent — Migration completa (idempotente)
-- Projeto Supabase: bxbqciqyxvcrlkheszdk (TC Agente SCI)
-- Cole tudo no SQL Editor e execute. Pode rodar várias vezes.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) MODULOS
-- ---------------------------------------------------------------------
create table if not exists public.modulos (
  id_modulo uuid primary key default gen_random_uuid(),
  nome text not null
);

alter table public.modulos add column if not exists slug text;
alter table public.modulos add column if not exists descricao text;
alter table public.modulos add column if not exists icone text;
alter table public.modulos add column if not exists ativo boolean not null default true;
alter table public.modulos add column if not exists ordem int not null default 0;
alter table public.modulos add column if not exists created_at timestamptz not null default now();

-- compat: alguns componentes usam .id
alter table public.modulos add column if not exists id uuid;
update public.modulos set id = id_modulo where id is null;

create unique index if not exists modulos_slug_uidx on public.modulos(slug) where slug is not null;

-- Seed dos 7 módulos
insert into public.modulos (nome, slug, ordem, ativo) values
  ('Folha',       'folha',       1, true),
  ('Fiscal',      'fiscal',      2, true),
  ('Contábil',    'contabil',    3, true),
  ('Geral',       'geral',       4, true),
  ('Obrigações',  'obrigacoes',  5, true),
  ('Cadastros',   'cadastros',   6, true),
  ('Relatórios',  'relatorios',  7, true)
on conflict (slug) do update set nome = excluded.nome, ordem = excluded.ordem, ativo = true;

update public.modulos set id = coalesce(id, id_modulo);

-- ---------------------------------------------------------------------
-- 2) RODAGENS
-- ---------------------------------------------------------------------
create table if not exists public.rodagens (
  id_rodagem uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.rodagens add column if not exists id uuid;
update public.rodagens set id = id_rodagem where id is null;

alter table public.rodagens add column if not exists modulo_id uuid;
alter table public.rodagens add column if not exists modulo_slug text;
alter table public.rodagens add column if not exists sistema text;
alter table public.rodagens add column if not exists ambiente text;
alter table public.rodagens add column if not exists origem text;
alter table public.rodagens add column if not exists ferramenta_analise text;
alter table public.rodagens add column if not exists data_inicio timestamptz;
alter table public.rodagens add column if not exists data_inicio_rodagem timestamptz;
alter table public.rodagens add column if not exists data_fim_rodagem timestamptz;
alter table public.rodagens add column if not exists data_analise timestamptz;
alter table public.rodagens add column if not exists branch text;
alter table public.rodagens add column if not exists versao text;
alter table public.rodagens add column if not exists versao_sistema text;
alter table public.rodagens add column if not exists maquina text;
alter table public.rodagens add column if not exists responsavel text;
alter table public.rodagens add column if not exists pasta_origem text;
alter table public.rodagens add column if not exists status_geral text;
alter table public.rodagens add column if not exists status_label text;
alter table public.rodagens add column if not exists status_cor text;
alter table public.rodagens add column if not exists score_saude int;
alter table public.rodagens add column if not exists diagnostico_curto text;
alter table public.rodagens add column if not exists diagnostico_detalhado text;
alter table public.rodagens add column if not exists conclusao_geral text;
alter table public.rodagens add column if not exists total_compactados int not null default 0;
alter table public.rodagens add column if not exists total_analisados int not null default 0;
alter table public.rodagens add column if not exists total_falhas int not null default 0;
alter table public.rodagens add column if not exists total_automacao int not null default 0;
alter table public.rodagens add column if not exists total_massa_dados int not null default 0;
alter table public.rodagens add column if not exists total_ambiente int not null default 0;
alter table public.rodagens add column if not exists total_possivel_funcional int not null default 0;
alter table public.rodagens add column if not exists total_inconclusivo int not null default 0;
alter table public.rodagens add column if not exists total_alta int not null default 0;
alter table public.rodagens add column if not exists total_media int not null default 0;
alter table public.rodagens add column if not exists total_baixa int not null default 0;
alter table public.rodagens add column if not exists json_original jsonb;

create index if not exists rodagens_modulo_slug_idx on public.rodagens(modulo_slug);
create index if not exists rodagens_data_analise_idx on public.rodagens(data_analise desc);
create index if not exists rodagens_created_at_idx on public.rodagens(created_at desc);

-- ---------------------------------------------------------------------
-- 3) FALHAS
-- ---------------------------------------------------------------------
create table if not exists public.falhas (
  id_falha uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.falhas add column if not exists id uuid;
update public.falhas set id = id_falha where id is null;

alter table public.falhas add column if not exists rodagem_id uuid;
alter table public.falhas add column if not exists modulo_slug text;
alter table public.falhas add column if not exists ordem_prioridade int;
alter table public.falhas add column if not exists arquivo_zip text;
alter table public.falhas add column if not exists arquivo_txt text;
alter table public.falhas add column if not exists arquivo_print text;
alter table public.falhas add column if not exists caso_identificado boolean not null default false;
alter table public.falhas add column if not exists id_caso_teste text;
alter table public.falhas add column if not exists caso_teste_provavel text;
alter table public.falhas add column if not exists grupo text;
alter table public.falhas add column if not exists subgrupo text;
alter table public.falhas add column if not exists rotina_funcional text;
alter table public.falhas add column if not exists descricao text;
alter table public.falhas add column if not exists descricao_caso text;
alter table public.falhas add column if not exists confianca_associacao text;
alter table public.falhas add column if not exists erro_titulo text;
alter table public.falhas add column if not exists erro_principal text;
alter table public.falhas add column if not exists mensagem_principal text;
alter table public.falhas add column if not exists trecho_relevante text;
alter table public.falhas add column if not exists call_stack_resumido text;
alter table public.falhas add column if not exists tipo_tecnico text;
alter table public.falhas add column if not exists formulario_ou_tela text;
alter table public.falhas add column if not exists componente text;
alter table public.falhas add column if not exists classificacao text;
alter table public.falhas add column if not exists classificacao_label text;
alter table public.falhas add column if not exists severidade text;
alter table public.falhas add column if not exists confianca text;
alter table public.falhas add column if not exists status_analise text;
alter table public.falhas add column if not exists cor text;
alter table public.falhas add column if not exists fato_observado text;
alter table public.falhas add column if not exists hipotese_principal text;
alter table public.falhas add column if not exists analise_tecnica text;
alter table public.falhas add column if not exists analise_funcional text;
alter table public.falhas add column if not exists impacto_possivel text;
alter table public.falhas add column if not exists primeira_acao_recomendada text;
alter table public.falhas add column if not exists informacoes_faltantes jsonb;
alter table public.falhas add column if not exists tags jsonb;

create index if not exists falhas_rodagem_id_idx on public.falhas(rodagem_id);
create index if not exists falhas_modulo_slug_idx on public.falhas(modulo_slug);
create index if not exists falhas_ordem_idx on public.falhas(ordem_prioridade);

-- ---------------------------------------------------------------------
-- 4) EVIDENCIAS
-- ---------------------------------------------------------------------
create table if not exists public.evidencias (
  id_evidencia uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.evidencias add column if not exists id uuid;
update public.evidencias set id = id_evidencia where id is null;

alter table public.evidencias add column if not exists falha_id uuid;
alter table public.evidencias add column if not exists rodagem_id uuid;
alter table public.evidencias add column if not exists modulo_slug text;
alter table public.evidencias add column if not exists tipo text;
alter table public.evidencias add column if not exists nome_arquivo text;
alter table public.evidencias add column if not exists storage_path text;
alter table public.evidencias add column if not exists public_url text;
alter table public.evidencias add column if not exists signed_url text;
alter table public.evidencias add column if not exists conteudo_texto text;
alter table public.evidencias add column if not exists mime_type text;
alter table public.evidencias add column if not exists tamanho_bytes bigint;
alter table public.evidencias add column if not exists print_util boolean not null default false;
alter table public.evidencias add column if not exists imagem_descricao text;

create index if not exists evidencias_falha_id_idx on public.evidencias(falha_id);
create index if not exists evidencias_rodagem_id_idx on public.evidencias(rodagem_id);

-- ---------------------------------------------------------------------
-- 5) AGRUPAMENTOS
-- ---------------------------------------------------------------------
create table if not exists public.agrupamentos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.agrupamentos add column if not exists rodagem_id uuid;
alter table public.agrupamentos add column if not exists modulo_slug text;
alter table public.agrupamentos add column if not exists tipo text;
alter table public.agrupamentos add column if not exists titulo text;
alter table public.agrupamentos add column if not exists descricao text;
alter table public.agrupamentos add column if not exists quantidade int not null default 0;
alter table public.agrupamentos add column if not exists classificacao_predominante text;
alter table public.agrupamentos add column if not exists severidade_predominante text;
alter table public.agrupamentos add column if not exists arquivos_relacionados jsonb;
alter table public.agrupamentos add column if not exists acao_recomendada text;
alter table public.agrupamentos add column if not exists status text;

create index if not exists agrupamentos_rodagem_id_idx on public.agrupamentos(rodagem_id);

-- ---------------------------------------------------------------------
-- 6) PROXIMOS_PASSOS
-- ---------------------------------------------------------------------
create table if not exists public.proximos_passos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.proximos_passos add column if not exists rodagem_id uuid;
alter table public.proximos_passos add column if not exists modulo_slug text;
alter table public.proximos_passos add column if not exists categoria text;
alter table public.proximos_passos add column if not exists prioridade text;
alter table public.proximos_passos add column if not exists descricao text;
alter table public.proximos_passos add column if not exists relacionado_a text;
alter table public.proximos_passos add column if not exists concluido boolean not null default false;

create index if not exists proximos_passos_rodagem_id_idx on public.proximos_passos(rodagem_id);

-- ---------------------------------------------------------------------
-- 7) RLS — leitura pública (dashboard de QA interno)
-- ---------------------------------------------------------------------
alter table public.modulos          enable row level security;
alter table public.rodagens         enable row level security;
alter table public.falhas           enable row level security;
alter table public.evidencias       enable row level security;
alter table public.agrupamentos     enable row level security;
alter table public.proximos_passos  enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['modulos','rodagens','falhas','evidencias','agrupamentos','proximos_passos']) loop
    execute format('drop policy if exists "public read %1$s" on public.%1$s', t);
    execute format('create policy "public read %1$s" on public.%1$s for select using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array['rodagens','falhas','evidencias','agrupamentos','proximos_passos','modulos']) loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9) Storage bucket para evidências
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evidencias-rodagens', 'evidencias-rodagens', true)
on conflict (id) do update set public = true;

drop policy if exists "public read evidencias bucket" on storage.objects;
create policy "public read evidencias bucket"
  on storage.objects for select
  using (bucket_id = 'evidencias-rodagens');

-- ---------------------------------------------------------------------
-- 10) Tabela de vínculo agrupamentos <-> falhas
-- ---------------------------------------------------------------------
create table if not exists public.agrupamentos_falhas (
  id uuid primary key default gen_random_uuid(),
  agrupamento_id text references public.agrupamentos(id_cluster) on delete cascade,
  falha_id text references public.falhas(id_falha) on delete cascade,
  rodagem_id text references public.rodagens(id_rodagem) on delete cascade,
  modulo_slug text,
  created_at timestamptz default now(),
  unique (agrupamento_id, falha_id)
);

create index if not exists idx_agrupamentos_falhas_agrup on public.agrupamentos_falhas(agrupamento_id);
create index if not exists idx_agrupamentos_falhas_falha on public.agrupamentos_falhas(falha_id);
create index if not exists idx_agrupamentos_falhas_rodagem on public.agrupamentos_falhas(rodagem_id);

alter table public.agrupamentos_falhas enable row level security;
drop policy if exists "public read agrupamentos_falhas" on public.agrupamentos_falhas;
create policy "public read agrupamentos_falhas" on public.agrupamentos_falhas for select using (true);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.agrupamentos_falhas';
  exception when duplicate_object then null;
  end;
  execute 'alter table public.agrupamentos_falhas replica identity full';
end $$;

-- ---------------------------------------------------------------------
-- RERUN REQUESTS (solicitações de reexecução enviadas pela Lovable;
-- o JenkinsBridge local consome e dispara o Jenkins)
-- ---------------------------------------------------------------------
create table if not exists public.rerun_requests (
  id uuid primary key default gen_random_uuid(),
  fk_rodagem text,
  vm_name text not null,
  versao text not null,
  casos_teste text not null,
  paralelo text default '',
  ct_desmarcar text default '[0.3]',
  data_hora text,
  branch text default '',
  config_json jsonb not null,
  status text not null default 'solicitado',
  jenkins_url text,
  jenkins_queue_url text,
  jenkins_build_number text,
  erro text,
  retorno_jenkins jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rerun_requests_status on public.rerun_requests(status);
create index if not exists idx_rerun_requests_created on public.rerun_requests(created_at desc);

grant select, insert, update on public.rerun_requests to anon, authenticated;
grant all on public.rerun_requests to service_role;

alter table public.rerun_requests enable row level security;
drop policy if exists "public read rerun_requests" on public.rerun_requests;
create policy "public read rerun_requests" on public.rerun_requests for select using (true);
drop policy if exists "public insert rerun_requests" on public.rerun_requests;
create policy "public insert rerun_requests" on public.rerun_requests for insert with check (true);
drop policy if exists "public update rerun_requests" on public.rerun_requests;
create policy "public update rerun_requests" on public.rerun_requests for update using (true) with check (true);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.rerun_requests';
  exception when duplicate_object then null;
  end;
  execute 'alter table public.rerun_requests replica identity full';
end $$;

-- Coluna vm_name em rodagens (opcional; UI faz fallback extraindo do id_rodagem)
alter table public.rodagens add column if not exists vm_name text;

-- ---------------------------------------------------------------------
-- Jenkins UI: classificação de solicitações (rodagem_completa | reexecucao)
-- ---------------------------------------------------------------------
alter table public.rerun_requests add column if not exists tipo_solicitacao text;
alter table public.rerun_requests add column if not exists modo_configuracao text;
alter table public.rerun_requests add column if not exists modulo_nome text;
alter table public.rerun_requests add column if not exists modulo_codigo text;
alter table public.rerun_requests add column if not exists solicitado_por text;

-- fk_rodagem precisa permitir NULL (rodagem completa nova não tem rodagem origem)
alter table public.rerun_requests alter column fk_rodagem drop not null;

-- ---------------------------------------------------------------------
-- Índices de performance (idempotentes, não removem nada existente)
-- ---------------------------------------------------------------------
create index if not exists idx_rodagens_created_at on public.rodagens (created_at desc);
create index if not exists idx_rodagens_data_inicio on public.rodagens (data_inicio desc);
create index if not exists idx_agrupamentos_fk_rodagem on public.agrupamentos (fk_rodagem);
create index if not exists idx_falhas_fk_cluster on public.falhas (fk_cluster);
create index if not exists idx_falhas_fk_modulo on public.falhas (fk_modulo);
create index if not exists idx_evidencias_fk_falha on public.evidencias (fk_falha);
create index if not exists idx_proximos_passos_fk_cluster on public.proximos_passos (fk_cluster);
create index if not exists idx_rerun_requests_created_at on public.rerun_requests (created_at desc);
create index if not exists idx_rerun_requests_status on public.rerun_requests (status);
create index if not exists idx_atrasos_rodagem_fk_rodagem on public.atrasos_rodagem (fk_rodagem);
