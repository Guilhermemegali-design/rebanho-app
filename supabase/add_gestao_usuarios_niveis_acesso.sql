-- Gestão de usuários da fazenda com convites individuais e níveis de acesso.
-- Níveis: administrador, editor (operações) e leitor (somente consulta).

alter table public.clientes_usuarios
  drop constraint if exists clientes_usuarios_papel_check;

alter table public.clientes_usuarios
  add constraint clientes_usuarios_papel_check
  check (papel in ('administrador', 'editor', 'leitor'));

create schema if not exists private;

create or replace function private.rebanho_pode_gerenciar_usuarios(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.consultor_id = (select auth.uid())
  ) or exists (
    select 1
    from public.clientes_usuarios cu
    where cu.cliente_id = p_cliente_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel = 'administrador'
  );
$$;

create or replace function private.rebanho_pode_editar_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.consultor_id = (select auth.uid())
  ) or exists (
    select 1
    from public.clientes_usuarios cu
    where cu.cliente_id = p_cliente_id
      and cu.auth_user_id = (select auth.uid())
      and cu.papel in ('administrador', 'editor')
  );
$$;

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
      and private.rebanho_pode_editar_cliente(a.cliente_id)
  );
$$;

revoke all on function private.rebanho_pode_gerenciar_usuarios(uuid) from public;
revoke all on function private.rebanho_pode_editar_cliente(uuid) from public;
revoke all on function private.rebanho_pode_editar_animal(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.rebanho_pode_gerenciar_usuarios(uuid) to authenticated;
grant execute on function private.rebanho_pode_editar_cliente(uuid) to authenticated;
grant execute on function private.rebanho_pode_editar_animal(uuid) to authenticated;

create table if not exists public.rebanho_convites_usuarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  email text,
  papel text not null default 'editor'
    check (papel in ('administrador', 'editor', 'leitor')),
  codigo text not null unique,
  status text not null default 'pendente'
    check (status in ('pendente', 'utilizado', 'cancelado')),
  criado_em timestamptz not null default now(),
  utilizado_em timestamptz,
  utilizado_por uuid references auth.users(id) on delete set null
);

alter table public.rebanho_convites_usuarios enable row level security;
grant select, insert, update, delete on public.rebanho_convites_usuarios to authenticated;

drop policy if exists gestores_veem_convites on public.rebanho_convites_usuarios;
create policy gestores_veem_convites on public.rebanho_convites_usuarios
for select to authenticated
using (private.rebanho_pode_gerenciar_usuarios(cliente_id));

drop policy if exists gestores_criam_convites on public.rebanho_convites_usuarios;
create policy gestores_criam_convites on public.rebanho_convites_usuarios
for insert to authenticated
with check (
  private.rebanho_pode_gerenciar_usuarios(cliente_id)
  and consultor_id = (select c.consultor_id from public.clientes c where c.id = cliente_id)
);

drop policy if exists gestores_atualizam_convites on public.rebanho_convites_usuarios;
create policy gestores_atualizam_convites on public.rebanho_convites_usuarios
for update to authenticated
using (private.rebanho_pode_gerenciar_usuarios(cliente_id))
with check (private.rebanho_pode_gerenciar_usuarios(cliente_id));

drop policy if exists gestores_excluem_convites on public.rebanho_convites_usuarios;
create policy gestores_excluem_convites on public.rebanho_convites_usuarios
for delete to authenticated
using (private.rebanho_pode_gerenciar_usuarios(cliente_id));

drop policy if exists gestor_ve_usuarios_fazenda on public.clientes_usuarios;
create policy gestor_ve_usuarios_fazenda on public.clientes_usuarios
for select to authenticated
using (private.rebanho_pode_gerenciar_usuarios(cliente_id));

drop policy if exists gestor_atualiza_usuarios_fazenda on public.clientes_usuarios;
create policy gestor_atualiza_usuarios_fazenda on public.clientes_usuarios
for update to authenticated
using (private.rebanho_pode_gerenciar_usuarios(cliente_id))
with check (
  private.rebanho_pode_gerenciar_usuarios(cliente_id)
  and consultor_id = (select c.consultor_id from public.clientes c where c.id = cliente_id)
);

drop policy if exists gestor_remove_usuarios_fazenda on public.clientes_usuarios;
create policy gestor_remove_usuarios_fazenda on public.clientes_usuarios
for delete to authenticated
using (
  private.rebanho_pode_gerenciar_usuarios(cliente_id)
  and auth_user_id <> (select auth.uid())
);

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
      (cliente_id, consultor_id, auth_user_id, email, papel)
    values
      (v_convite.cliente_id, v_convite.consultor_id, v_uid, v_email, v_convite.papel)
    on conflict (cliente_id, auth_user_id) do update
      set email = excluded.email, papel = excluded.papel;

    update public.rebanho_convites_usuarios
      set status = 'utilizado', utilizado_em = now(), utilizado_por = v_uid
      where id = v_convite.id;
    return v_convite.cliente_id;
  end if;

  -- Compatibilidade com os códigos antigos: entram como operadores.
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

-- O leitor continua vendo os dados, mas somente administrador/editor grava.
alter policy cliente_cria_animais on public.rebanho_animais
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_edita_animais on public.rebanho_animais
  using (private.rebanho_pode_editar_cliente(cliente_id))
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_exclui_animais on public.rebanho_animais
  using (private.rebanho_pode_editar_cliente(cliente_id));

alter policy cliente_cria_locais on public.rebanho_locais
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_edita_locais on public.rebanho_locais
  using (private.rebanho_pode_editar_cliente(cliente_id))
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_exclui_locais on public.rebanho_locais
  using (private.rebanho_pode_editar_cliente(cliente_id));

alter policy cliente_cria_lotes_rebanho on public.rebanho_lotes
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_edita_lotes_rebanho on public.rebanho_lotes
  using (private.rebanho_pode_editar_cliente(cliente_id))
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_exclui_lotes_rebanho on public.rebanho_lotes
  using (private.rebanho_pode_editar_cliente(cliente_id));

alter policy cliente_cria_fornecedores on public.rebanho_fornecedores
  with check (private.rebanho_pode_editar_cliente(cliente_id));
alter policy cliente_edita_fornecedores on public.rebanho_fornecedores
  using (private.rebanho_pode_editar_cliente(cliente_id))
  with check (private.rebanho_pode_editar_cliente(cliente_id));

alter policy cliente_cria_medicamentos on public.rebanho_medicamentos
  with check (private.rebanho_pode_editar_cliente(cliente_id));

alter policy cliente_registra_movimentacao on public.rebanho_movimentacoes
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_edita_movimentacao on public.rebanho_movimentacoes
  using (private.rebanho_pode_editar_animal(animal_id))
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_exclui_movimentacao on public.rebanho_movimentacoes
  using (private.rebanho_pode_editar_animal(animal_id));

alter policy cliente_registra_pesagem_animal on public.rebanho_pesagens
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_edita_pesagem_animal on public.rebanho_pesagens
  using (private.rebanho_pode_editar_animal(animal_id))
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_exclui_pesagem_animal on public.rebanho_pesagens
  using (private.rebanho_pode_editar_animal(animal_id));

alter policy cliente_registra_procedimento on public.rebanho_procedimentos_sanitarios
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_edita_procedimento on public.rebanho_procedimentos_sanitarios
  using (private.rebanho_pode_editar_animal(animal_id))
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_exclui_procedimento on public.rebanho_procedimentos_sanitarios
  using (private.rebanho_pode_editar_animal(animal_id));

alter policy cliente_cria_participacoes on public.rebanho_lote_participacoes
  with check (private.rebanho_pode_editar_animal(animal_id));
alter policy cliente_fecha_participacoes on public.rebanho_lote_participacoes
  using (private.rebanho_pode_editar_animal(animal_id))
  with check (private.rebanho_pode_editar_animal(animal_id));
