drop policy if exists "cliente_exclui_movimentacao" on public.rebanho_movimentacoes;
create policy "cliente_exclui_movimentacao"
  on public.rebanho_movimentacoes
  for delete to authenticated
  using (
    animal_id in (
      select a.id from public.rebanho_animais a
      where a.cliente_id in (
        select cliente_id from public.clientes_usuarios
        where auth_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "cliente_exclui_procedimento" on public.rebanho_procedimentos_sanitarios;
create policy "cliente_exclui_procedimento"
  on public.rebanho_procedimentos_sanitarios
  for delete to authenticated
  using (
    animal_id in (
      select a.id from public.rebanho_animais a
      where a.cliente_id in (
        select cliente_id from public.clientes_usuarios
        where auth_user_id = (select auth.uid())
      )
    )
  );
