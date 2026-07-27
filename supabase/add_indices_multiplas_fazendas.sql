-- Índices dos vínculos compostos usados para isolar cada fazenda.
create index if not exists idx_rebanho_animais_fazenda_cliente
  on public.rebanho_animais(fazenda_id, cliente_id);
create index if not exists idx_rebanho_locais_fazenda_cliente
  on public.rebanho_locais(fazenda_id, cliente_id);
create index if not exists idx_rebanho_lotes_fazenda_cliente
  on public.rebanho_lotes(fazenda_id, cliente_id);
create index if not exists idx_rebanho_fornecedores_fazenda_cliente
  on public.rebanho_fornecedores(fazenda_id, cliente_id);
create index if not exists idx_rebanho_medicamentos_fazenda_cliente
  on public.rebanho_medicamentos(fazenda_id, cliente_id);
create index if not exists idx_rebanho_cochos_fazenda_cliente
  on public.rebanho_cochos(fazenda_id, cliente_id);
create index if not exists idx_rebanho_abastecimentos_fazenda_cliente
  on public.rebanho_abastecimentos_cochos(fazenda_id, cliente_id);
create index if not exists idx_rebanho_mapas_fazenda_cliente
  on public.rebanho_mapas_fazenda(fazenda_id, cliente_id);
create index if not exists idx_rebanho_lote_participacoes_fazenda
  on public.rebanho_lote_participacoes(fazenda_id);
