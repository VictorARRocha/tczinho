-- ==================================================
-- TCzinho — SCI QA Agent | Supabase Schema
-- Run this in the Supabase SQL Editor of project "Tczinho" (bxbqciqyxvcrlkheszdk)
-- ==================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============== TABLES ==============

create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  descricao text,
  icone text,
  ativo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.rodagens (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid references public.modulos(id) on delete set null,
  sistema text default 'Sistema ÚNICO',
  modulo_slug text not null,
  ambiente text,
  origem text default 'TestComplete',
  ferramenta_analise text default 'Codex',
  data_inicio_rodagem timestamptz,
  data_fim_rodagem timestamptz,
  data_analise timestamptz default now(),
  branch text,
  versao_sistema text,
  maquina text,
  responsavel text,
  pasta_origem text,
  status_geral text,
  status_label text,
  status_cor text,
  score_saude integer,
  diagnostico_curto text,
  diagnostico_detalhado text,
  conclusao_geral text,
  total_compactados integer default 0,
  total_analisados integer default 0,
  total_falhas integer default 0,
  total_automacao integer default 0,
  total_massa_dados integer default 0,
  total_ambiente integer default 0,
  total_possivel_funcional integer default 0,
  total_inconclusivo integer default 0,
  total_alta integer default 0,
  total_media integer default 0,
  total_baixa integer default 0,
  json_original jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_rodagens_modulo_slug on public.rodagens (modulo_slug, data_analise desc);

create table if not exists public.falhas (
  id uuid primary key default gen_random_uuid(),
  rodagem_id uuid references public.rodagens(id) on delete cascade,
  modulo_slug text not null,
  ordem_prioridade integer,
  arquivo_zip text,
  arquivo_txt text,
  arquivo_print text,
  caso_identificado boolean default false,
  id_caso_teste text,
  caso_teste_provavel text,
  grupo text,
  subgrupo text,
  rotina_funcional text,
  descricao_caso text,
  confianca_associacao text,
  erro_titulo text,
  erro_principal text,
  mensagem_principal text,
  trecho_relevante text,
  call_stack_resumido text,
  tipo_tecnico text,
  formulario_ou_tela text,
  componente text,
  classificacao text,
  classificacao_label text,
  severidade text,
  confianca text,
  status_analise text,
  cor text,
  fato_observado text,
  hipotese_principal text,
  analise_tecnica text,
  analise_funcional text,
  impacto_possivel text,
  primeira_acao_recomendada text,
  informacoes_faltantes jsonb,
  tags jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_falhas_rodagem on public.falhas (rodagem_id);

create table if not exists public.evidencias (
  id uuid primary key default gen_random_uuid(),
  falha_id uuid references public.falhas(id) on delete cascade,
  rodagem_id uuid references public.rodagens(id) on delete cascade,
  modulo_slug text not null,
  tipo text not null,
  nome_arquivo text,
  storage_path text,
  public_url text,
  signed_url text,
  conteudo_texto text,
  mime_type text,
  tamanho_bytes bigint,
  print_util boolean default false,
  imagem_descricao text,
  created_at timestamptz default now()
);
create index if not exists idx_evidencias_falha on public.evidencias (falha_id);
create index if not exists idx_evidencias_rodagem on public.evidencias (rodagem_id);

create table if not exists public.agrupamentos (
  id uuid primary key default gen_random_uuid(),
  rodagem_id uuid references public.rodagens(id) on delete cascade,
  modulo_slug text not null,
  tipo text,
  titulo text,
  descricao text,
  quantidade integer default 0,
  classificacao_predominante text,
  severidade_predominante text,
  arquivos_relacionados jsonb,
  acao_recomendada text,
  created_at timestamptz default now()
);
create index if not exists idx_agrupamentos_rodagem on public.agrupamentos (rodagem_id);

create table if not exists public.proximos_passos (
  id uuid primary key default gen_random_uuid(),
  rodagem_id uuid references public.rodagens(id) on delete cascade,
  modulo_slug text not null,
  categoria text not null,
  prioridade text,
  descricao text not null,
  relacionado_a text,
  concluido boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_passos_rodagem on public.proximos_passos (rodagem_id);

-- ============== SEED MODULES ==============
insert into public.modulos (slug, nome) values
  ('folha', 'Folha'),
  ('fiscal', 'Fiscal'),
  ('contabil', 'Contábil'),
  ('geral', 'Geral'),
  ('obrigacoes', 'Obrigações'),
  ('cadastros', 'Cadastros'),
  ('relatorios', 'Relatórios')
on conflict (slug) do nothing;

-- ============== RLS (read-only public, write via service_role) ==============
alter table public.modulos enable row level security;
alter table public.rodagens enable row level security;
alter table public.falhas enable row level security;
alter table public.evidencias enable row level security;
alter table public.agrupamentos enable row level security;
alter table public.proximos_passos enable row level security;

-- Public read policies (MVP). Tighten later if needed.
do $$ begin
  create policy "public read modulos" on public.modulos for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read rodagens" on public.rodagens for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read falhas" on public.falhas for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read evidencias" on public.evidencias for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read agrupamentos" on public.agrupamentos for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read proximos_passos" on public.proximos_passos for select using (true);
exception when duplicate_object then null; end $$;

-- ============== REALTIME ==============
alter publication supabase_realtime add table public.rodagens;
alter publication supabase_realtime add table public.falhas;
alter publication supabase_realtime add table public.evidencias;
alter publication supabase_realtime add table public.agrupamentos;
alter publication supabase_realtime add table public.proximos_passos;

-- ============== STORAGE BUCKET ==============
insert into storage.buckets (id, name, public)
values ('evidencias-rodagens', 'evidencias-rodagens', true)
on conflict (id) do nothing;

do $$ begin
  create policy "public read evidencias bucket" on storage.objects
  for select using (bucket_id = 'evidencias-rodagens');
exception when duplicate_object then null; end $$;
