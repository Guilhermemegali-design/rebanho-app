drop policy if exists "cliente_exclui_locais" on public.rebanho_locais;

create policy "cliente_exclui_locais"
  on public.rebanho_locais
  for delete
  to authenticated
  using (
    cliente_id in (
      select cliente_id from public.clientes_usuarios
      where auth_user_id = (select auth.uid())
    )
  );
