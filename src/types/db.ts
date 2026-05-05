export interface Modulo {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  ativo: boolean;
  ordem?: number;
  created_at: string;
}

export interface Rodagem {
  id: string;
  modulo_id: string | null;
  sistema: string | null;
  modulo_slug: string;
  ambiente: string | null;
  origem: string | null;
  ferramenta_analise: string | null;
  data_inicio_rodagem: string | null;
  data_fim_rodagem: string | null;
  data_analise: string | null;
  branch: string | null;
  versao_sistema: string | null;
  maquina: string | null;
  responsavel: string | null;
  pasta_origem: string | null;
  status_geral: string | null;
  status_label: string | null;
  status_cor: string | null;
  score_saude: number | null;
  diagnostico_curto: string | null;
  diagnostico_detalhado: string | null;
  conclusao_geral: string | null;
  total_compactados: number;
  total_analisados: number;
  total_falhas: number;
  total_automacao: number;
  total_massa_dados: number;
  total_ambiente: number;
  total_possivel_funcional: number;
  total_inconclusivo: number;
  total_alta: number;
  total_media: number;
  total_baixa: number;
  json_original: any;
  created_at: string;
}

export interface Falha {
  id: string;
  rodagem_id: string;
  modulo_slug: string;
  ordem_prioridade: number | null;
  arquivo_zip: string | null;
  arquivo_txt: string | null;
  arquivo_print: string | null;
  caso_identificado: boolean;
  id_caso_teste: string | null;
  caso_teste_provavel: string | null;
  grupo: string | null;
  subgrupo: string | null;
  rotina_funcional: string | null;
  descricao_caso: string | null;
  confianca_associacao: string | null;
  erro_titulo: string | null;
  erro_principal: string | null;
  mensagem_principal: string | null;
  trecho_relevante: string | null;
  call_stack_resumido: string | null;
  tipo_tecnico: string | null;
  formulario_ou_tela: string | null;
  componente: string | null;
  classificacao: string | null;
  classificacao_label: string | null;
  severidade: string | null;
  confianca: string | null;
  status_analise: string | null;
  cor: string | null;
  fato_observado: string | null;
  hipotese_principal: string | null;
  analise_tecnica: string | null;
  analise_funcional: string | null;
  impacto_possivel: string | null;
  primeira_acao_recomendada: string | null;
  informacoes_faltantes: any;
  tags: any;
  created_at: string;
}

export interface Evidencia {
  id: string;
  falha_id: string;
  rodagem_id: string;
  modulo_slug: string;
  tipo: 'zip' | 'rar' | 'txt' | 'log' | 'pdf' | 'print' | 'outro' | string;
  nome_arquivo: string | null;
  bucket?: string | null;
  storage_path: string | null;
  public_url: string | null;
  signed_url: string | null;
  url_expira_em?: string | null;
  conteudo_texto: string | null;
  mime_type: string | null;
  extensao?: string | null;
  tamanho_bytes: number | null;
  print_util: boolean;
  imagem_descricao: string | null;
  created_at: string;
}

export interface Agrupamento {
  id: string;
  rodagem_id: string;
  modulo_slug: string;
  tipo: string | null;
  titulo: string | null;
  descricao: string | null;
  quantidade: number;
  classificacao_predominante: string | null;
  severidade_predominante: string | null;
  arquivos_relacionados: any;
  acao_recomendada: string | null;
  created_at: string;
}

export interface ProximoPasso {
  id: string;
  rodagem_id: string;
  modulo_slug: string;
  categoria: 'qa' | 'automacao' | 'funcional' | 'desenvolvimento' | string;
  prioridade: string | null;
  descricao: string;
  relacionado_a: string | null;
  concluido: boolean;
  created_at: string;
}
