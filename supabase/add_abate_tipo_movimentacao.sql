-- Separa "abate" de "venda" comum: até aqui o app tratava toda venda
-- como abate (não tinha distinção). Agora "abate" é um tipo de
-- movimentação próprio (mesmos campos de venda: peso_saída, preço da
-- arroba, rendimento de carcaça) e o animal fica com situação "abatido",
-- diferente de "vendido".

alter table rebanho_movimentacoes drop constraint rebanho_movimentacoes_tipo_check;
alter table rebanho_movimentacoes add constraint rebanho_movimentacoes_tipo_check
  check (tipo = any (array['entrada','transferencia_lote','transferencia_local','saida','morte','venda','abate']));

alter table rebanho_animais drop constraint rebanho_animais_situacao_check;
alter table rebanho_animais add constraint rebanho_animais_situacao_check
  check (situacao = any (array['ativo','vendido','morto','transferido','abatido']));
