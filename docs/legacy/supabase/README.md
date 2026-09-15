# Supabase legado

Estes SQLs eram usados quando o dashboard dependia diretamente de Supabase
para tabelas, Auth, Realtime e permissao.

O fluxo atual usa:

- dashboard React/Vite apontando para a API Agent TC;
- Auth local via API;
- dados no PostgreSQL da D01;
- evidencias servidas pela API em `/files/...`.

Manter estes arquivos apenas como historico/rollback. Nao usar no deploy novo.
