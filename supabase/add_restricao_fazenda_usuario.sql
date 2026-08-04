-- Permite restringir o acesso de um usuário da fazenda a apenas UM retiro
-- (rebanho_fazendas) do cliente, em vez de todos. `fazenda_id` nulo em
-- clientes_usuarios/rebanho_convites_usuarios continua significando "acesso
-- a todas as fazendas do cliente" (comportamento anterior, preservado).

alter table public.clientes_usuarios
  add column if not exists fazenda_id uuid references public.rebanho_fazendas(id) on delete set null;

alter table public.rebanho_convites_usuarios
  add column if not exists fazenda_id uuid references public.rebanho_fazendas(id) on delete cascade;

-- ------------------------------------------------------------
-- Funções de permissão, agora cientes de fazenda
-- ------------------------------------------------------------

create or replace function private.rebanho_fazenda_permitida(p_fazenda_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rebanho_fazendas f
    join public.clientes c on c.id = f.cliente_id
    where f.id = p_fazenda_id
      and c.consultor_id = (select auth.uid())
  ) or exists (
    select 1
    from public.rebanho_fazendas f
    join public.clientes_usuarios cu on cu.cliente_id = f.cliente_id
    where f.id = p_fazenda_id
      and cu.auth_user_id = (select auth.uid())
      and (cu.fazenda_id is null or cu.fazenda_id = f.id)
  );
$$;

create or replace function private.rebanho_pode_editar_fazenda(p_fazenda_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rebanho_fazendas f
    join public.clientes c on c.id = f.cliente_id
    where f.id = p_fazenda_id
      and c.consultor_id = (select auth.uid())
  ) or exists (
    select 1
    from public.rebanho_fazendas f
    join public.clientes_usuarios cu on cu.cliente_id = f.cliente_id
    where f.id = p_fazenda_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel in ('administrador', 'editor')
      and (cu.fazenda_id is null or cu.fazenda_id = f.id)
  );
$$;

-- Só quem tem acesso a TODAS as fazendas do cliente pode criar um novo
-- retiro (evita que um usuário restrito a uma fazenda crie outra e vaze
-- dados entre retiros por essa porta).
create or replace function private.rebanho_tem_acesso_total(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clientes c
    where c.id = p_cliente_id and c.consultor_id = (select auth.uid())
  ) or exists (
    select 1 from public.clientes_usuarios cu
    where cu.cliente_id = p_cliente_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel in ('administrador', 'editor')
      and cu.fazenda_id is null
  );
$$;

revoke all on function private.rebanho_fazenda_permitida(uuid) from public;
revoke all on function private.rebanho_pode_editar_fazenda(uuid) from public;
revoke all on function private.rebanho_tem_acesso_total(uuid) from public;
grant execute on function private.rebanho_fazenda_permitida(uuid) to authenticated;
grant execute on function private.rebanho_pode_editar_fazenda(uuid) to authenticated;
grant execute on function private.rebanho_tem_acesso_total(uuid) to authenticated;

-- rebanho_pode_editar_animal passa a checar a fazenda do animal, o que já
-- propaga a restrição para pesagens/movimentações/procedimentos/participações
-- (todas as policies de escrita dessas tabelas chamam essa função).
create or replace function private.rebanho_pode_editar_animal(p_animal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rebanho_animais a
    where a.id = p_animal_id
      and private.rebanho_pode_editar_fazenda(a.fazenda_id)
  );
$$;

-- ------------------------------------------------------------
-- rebanho_fazendas — visão/edição por fazenda, criação exige acesso total
-- ------------------------------------------------------------
alter policy cliente_ve_fazendas on public.rebanho_fazendas
  using (private.rebanho_fazenda_permitida(id));
alter policy cliente_cria_fazendas on public.rebanho_fazendas
  with check (private.rebanho_tem_acesso_total(cliente_id));
alter policy cliente_edita_fazendas on public.rebanho_fazendas
  using (private.rebanho_pode_editar_fazenda(id))
  with check (private.rebanho_pode_editar_fazenda(id));
alter policy cliente_exclui_fazendas on public.rebanho_fazendas
  using (private.rebanho_pode_editar_fazenda(id));

-- ------------------------------------------------------------
-- Tabelas com fazenda_id próprio: trocar checagem de cliente por fazenda
-- ------------------------------------------------------------
alter policy cliente_ve_seus_animais on public.rebanho_animais
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_animais on public.rebanho_animais
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_edita_animais on public.rebanho_animais
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_exclui_animais on public.rebanho_animais
  using (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_seus_locais on public.rebanho_locais
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_locais on public.rebanho_locais
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_edita_locais on public.rebanho_locais
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_exclui_locais on public.rebanho_locais
  using (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_seus_lotes_rebanho on public.rebanho_lotes
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_lotes_rebanho on public.rebanho_lotes
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_edita_lotes_rebanho on public.rebanho_lotes
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_exclui_lotes_rebanho on public.rebanho_lotes
  using (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_seus_fornecedores on public.rebanho_fornecedores
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_fornecedores on public.rebanho_fornecedores
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_edita_fornecedores on public.rebanho_fornecedores
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_medicamentos on public.rebanho_medicamentos
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_medicamentos on public.rebanho_medicamentos
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_cochos on public.rebanho_cochos
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_cochos on public.rebanho_cochos
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_edita_cochos on public.rebanho_cochos
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_exclui_cochos on public.rebanho_cochos
  using (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_abastecimentos on public.rebanho_abastecimentos_cochos
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_abastecimentos on public.rebanho_abastecimentos_cochos
  with check (
    private.rebanho_pode_editar_fazenda(fazenda_id)
    and usuario_id = (select auth.uid())
    and exists (
      select 1 from public.rebanho_cochos c
      where c.id = rebanho_abastecimentos_cochos.cocho_id
        and c.cliente_id = rebanho_abastecimentos_cochos.cliente_id
        and c.local_id = rebanho_abastecimentos_cochos.local_id
    )
  );
alter policy cliente_edita_abastecimentos on public.rebanho_abastecimentos_cochos
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_exclui_abastecimentos on public.rebanho_abastecimentos_cochos
  using (private.rebanho_pode_editar_fazenda(fazenda_id));

alter policy cliente_ve_mapa_fazenda on public.rebanho_mapas_fazenda
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_cria_mapa_fazenda on public.rebanho_mapas_fazenda
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_edita_mapa_fazenda on public.rebanho_mapas_fazenda
  using (private.rebanho_pode_editar_fazenda(fazenda_id))
  with check (private.rebanho_pode_editar_fazenda(fazenda_id));
alter policy cliente_exclui_mapa_fazenda on public.rebanho_mapas_fazenda
  using (private.rebanho_pode_editar_fazenda(fazenda_id));

-- ------------------------------------------------------------
-- Tabelas ligadas ao animal: SELECT passa a olhar fazenda_id direto
-- (mais simples que reconsultar rebanho_animais) — INSERT/UPDATE/DELETE já
-- ficam corretas de graça via rebanho_pode_editar_animal, atualizada acima.
-- ------------------------------------------------------------
alter policy cliente_ve_movimentacoes on public.rebanho_movimentacoes
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_ve_pesagens_animal on public.rebanho_pesagens
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_ve_procedimentos on public.rebanho_procedimentos_sanitarios
  using (private.rebanho_fazenda_permitida(fazenda_id));
alter policy cliente_ve_participacoes on public.rebanho_lote_participacoes
  using (private.rebanho_fazenda_permitida(fazenda_id));

-- ------------------------------------------------------------
-- Convites e vínculos: validar que a fazenda escolhida pertence ao cliente
-- ------------------------------------------------------------
alter policy gestores_criam_convites on public.rebanho_convites_usuarios
  with check (
    private.rebanho_pode_gerenciar_usuarios(cliente_id)
    and consultor_id = (select c.consultor_id from public.clientes c where c.id = rebanho_convites_usuarios.cliente_id)
    and (
      fazenda_id is null
      or exists (select 1 from public.rebanho_fazendas f where f.id = rebanho_convites_usuarios.fazenda_id and f.cliente_id = rebanho_convites_usuarios.cliente_id)
    )
  );

alter policy gestor_atualiza_usuarios_fazenda on public.clientes_usuarios
  with check (
    private.rebanho_pode_gerenciar_usuarios(cliente_id)
    and consultor_id = (select c.consultor_id from public.clientes c where c.id = clientes_usuarios.cliente_id)
    and (
      fazenda_id is null
      or exists (select 1 from public.rebanho_fazendas f where f.id = clientes_usuarios.fazenda_id and f.cliente_id = clientes_usuarios.cliente_id)
    )
  );

-- ------------------------------------------------------------
-- Resgate de convite: propaga a restrição de fazenda para o vínculo
-- ------------------------------------------------------------
create or replace function public.resgatar_convite_rebanho(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_convite public.rebanho_convites_usuarios%rowtype;
  v_cliente public.clientes%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_convite
  from public.rebanho_convites_usuarios
  where upper(codigo) = upper(trim(p_codigo))
    and status = 'pendente'
  for update;

  if found then
    if v_convite.email is not null and lower(trim(v_convite.email)) <> v_email then
      raise exception 'Este convite foi criado para outro e-mail.';
    end if;

    insert into public.clientes_usuarios
      (cliente_id, consultor_id, auth_user_id, email, papel, fazenda_id)
    values
      (v_convite.cliente_id, v_convite.consultor_id, v_uid, v_email, v_convite.papel, v_convite.fazenda_id)
    on conflict (cliente_id, auth_user_id) do update
      set email = excluded.email, papel = excluded.papel, fazenda_id = excluded.fazenda_id;

    update public.rebanho_convites_usuarios
      set status = 'utilizado', utilizado_em = now(), utilizado_por = v_uid
      where id = v_convite.id;
    return v_convite.cliente_id;
  end if;

  -- Compatibilidade com os códigos antigos: entram como operadores com
  -- acesso a todas as fazendas do cliente (comportamento inalterado).
  select * into v_cliente
  from public.clientes
  where upper(codigo_convite) = upper(trim(p_codigo));

  if not found then
    raise exception 'Código inválido. Confira com o responsável pela fazenda.';
  end if;

  insert into public.clientes_usuarios
    (cliente_id, consultor_id, auth_user_id, email, papel)
  values
    (v_cliente.id, v_cliente.consultor_id, v_uid, v_email, 'editor')
  on conflict (cliente_id, auth_user_id) do nothing;
  return v_cliente.id;
end;
$$;

revoke all on function public.resgatar_convite_rebanho(text) from public;
revoke execute on function public.resgatar_convite_rebanho(text) from anon;
grant execute on function public.resgatar_convite_rebanho(text) to authenticated;
