export const ALL_PERMISSIONS = [
  "view_dashboard",
  "view_falhas",
  "view_evidencias",
  "view_jenkins",
  "create_jenkins_run",
  "create_rerun",
  "view_diff",
  "download_evidence",
  "manage_users",
  "manage_permissions",
  "admin_all",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_dashboard: "Ver visão geral",
  view_falhas: "Ver falhas",
  view_evidencias: "Ver evidências",
  view_jenkins: "Ver Jenkins",
  create_jenkins_run: "Criar rodagem Jenkins",
  create_rerun: "Reexecutar rodagens",
  view_diff: "Ver Monaco Diff",
  download_evidence: "Baixar evidências",
  manage_users: "Gerenciar usuários",
  manage_permissions: "Gerenciar permissões",
  admin_all: "Admin total",
};
