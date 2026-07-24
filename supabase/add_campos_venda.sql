alter table public.rebanho_movimentacoes
  add column if not exists peso_saida numeric,
  add column if not exists preco_arroba numeric,
  add column if not exists rendimento_carcaca numeric;

alter table public.rebanho_movimentacoes
  drop constraint if exists rebanho_movimentacoes_peso_saida_check,
  add constraint rebanho_movimentacoes_peso_saida_check
    check (peso_saida is null or peso_saida > 0),
  drop constraint if exists rebanho_movimentacoes_preco_arroba_check,
  add constraint rebanho_movimentacoes_preco_arroba_check
    check (preco_arroba is null or preco_arroba >= 0),
  drop constraint if exists rebanho_movimentacoes_rendimento_carcaca_check,
  add constraint rebanho_movimentacoes_rendimento_carcaca_check
    check (rendimento_carcaca is null or rendimento_carcaca between 0 and 100);
