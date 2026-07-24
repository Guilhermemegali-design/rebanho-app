drop policy if exists "cliente_edita_pesagem_animal" on public.rebanho_pesagens;
create policy "cliente_edita_pesagem_animal" on public.rebanho_pesagens
  for update to authenticated
  using (animal_id in (
    select a.id from public.rebanho_animais a
    where a.cliente_id in (select cliente_id from public.clientes_usuarios where auth_user_id = (select auth.uid()))
  ))
  with check (animal_id in (
    select a.id from public.rebanho_animais a
    where a.cliente_id in (select cliente_id from public.clientes_usuarios where auth_user_id = (select auth.uid()))
  ));

drop policy if exists "cliente_edita_movimentacao" on public.rebanho_movimentacoes;
create policy "cliente_edita_movimentacao" on public.rebanho_movimentacoes
  for update to authenticated
  using (animal_id in (
    select a.id from public.rebanho_animais a
    where a.cliente_id in (select cliente_id from public.clientes_usuarios where auth_user_id = (select auth.uid()))
  ))
  with check (animal_id in (
    select a.id from public.rebanho_animais a
    where a.cliente_id in (select cliente_id from public.clientes_usuarios where auth_user_id = (select auth.uid()))
  ));

drop policy if exists "cliente_edita_procedimento" on public.rebanho_procedimentos_sanitarios;
create policy "cliente_edita_procedimento" on public.rebanho_procedimentos_sanitarios
  for update to authenticated
  using (animal_id in (
    select a.id from public.rebanho_animais a
    where a.cliente_id in (select cliente_id from public.clientes_usuarios where auth_user_id = (select auth.uid()))
  ))
  with check (animal_id in (
    select a.id from public.rebanho_animais a
    where a.cliente_id in (select cliente_id from public.clientes_usuarios where auth_user_id = (select auth.uid()))
  ));
