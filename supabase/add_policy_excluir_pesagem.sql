drop policy if exists "cliente_exclui_pesagem_animal" on public.rebanho_pesagens;

create policy "cliente_exclui_pesagem_animal"
  on public.rebanho_pesagens
  for delete
  to authenticated
  using (
    animal_id in (
      select a.id
      from public.rebanho_animais a
      where a.cliente_id in (
        select cliente_id
        from public.clientes_usuarios
        where auth_user_id = (select auth.uid())
      )
    )
  );
