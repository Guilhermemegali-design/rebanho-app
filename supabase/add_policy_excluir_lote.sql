drop policy if exists "cliente_exclui_lotes_rebanho" on public.rebanho_lotes;

create policy "cliente_exclui_lotes_rebanho"
  on public.rebanho_lotes
  for delete
  to authenticated
  using (
    cliente_id in (
      select cliente_id
      from public.clientes_usuarios
      where auth_user_id = (select auth.uid())
    )
  );
