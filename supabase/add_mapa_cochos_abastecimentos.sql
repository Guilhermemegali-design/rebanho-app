-- Mapa operacional, cochos e abastecimentos offline-first.

alter table public.rebanho_locais
  add column if not exists mapa_x numeric(5,2),
  add column if not exists mapa_y numeric(5,2),
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7);

create table if not exists public.rebanho_cochos (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  local_id uuid not null references public.rebanho_locais(id) on delete cascade,
  nome text not null,
  tipo text not null default 'sal' check (tipo in ('sal', 'racao', 'agua', 'outro')),
  capacidade_kg numeric(10,2),
  mapa_x numeric(5,2),
  mapa_y numeric(5,2),
  latitude numeric(10,7),
  longitude numeric(10,7),
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.rebanho_abastecimentos_cochos (
  id uuid primary key default gen_random_uuid(),
  client_uuid text not null unique,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  cocho_id uuid not null references public.rebanho_cochos(id) on delete cascade,
  local_id uuid not null references public.rebanho_locais(id) on delete restrict,
  lote_id uuid references public.rebanho_lotes(id) on delete set null,
  animais_ids uuid[] not null default '{}',
  produto text not null,
  quantidade numeric(10,3) not null check (quantidade > 0),
  unidade text not null default 'kg' check (unidade in ('kg', 'saco', 'litro', 'unidade')),
  quantidade_animais integer not null default 0 check (quantidade_animais >= 0),
  consumo_estimado_animal numeric(12,4),
  data_abastecimento timestamptz not null default now(),
  usuario_id uuid not null references auth.users(id) on delete restrict,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rebanho_cochos_cliente on public.rebanho_cochos(cliente_id);
create index if not exists idx_rebanho_cochos_local on public.rebanho_cochos(local_id);
create index if not exists idx_rebanho_cochos_consultor on public.rebanho_cochos(consultor_id);
create index if not exists idx_rebanho_abastecimentos_cliente on public.rebanho_abastecimentos_cochos(cliente_id);
create index if not exists idx_rebanho_abastecimentos_cocho on public.rebanho_abastecimentos_cochos(cocho_id, data_abastecimento desc);
create index if not exists idx_rebanho_abastecimentos_lote on public.rebanho_abastecimentos_cochos(lote_id, data_abastecimento desc);
create index if not exists idx_rebanho_abastecimentos_consultor on public.rebanho_abastecimentos_cochos(consultor_id);
create index if not exists idx_rebanho_abastecimentos_local on public.rebanho_abastecimentos_cochos(local_id);
create index if not exists idx_rebanho_abastecimentos_usuario on public.rebanho_abastecimentos_cochos(usuario_id);

alter table public.rebanho_cochos enable row level security;
alter table public.rebanho_abastecimentos_cochos enable row level security;

revoke all on public.rebanho_cochos from anon;
revoke all on public.rebanho_abastecimentos_cochos from anon;
revoke truncate, references, trigger on public.rebanho_cochos from authenticated;
revoke truncate, references, trigger on public.rebanho_abastecimentos_cochos from authenticated;
grant select, insert, update, delete on public.rebanho_cochos to authenticated;
grant select, insert, update, delete on public.rebanho_abastecimentos_cochos to authenticated;

create policy consultor_gerencia_cochos on public.rebanho_cochos
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_cochos on public.rebanho_cochos
for select to authenticated
using (cliente_id in (
  select cu.cliente_id from public.clientes_usuarios cu
  where cu.auth_user_id = (select auth.uid())
));

create policy cliente_cria_cochos on public.rebanho_cochos
for insert to authenticated
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_edita_cochos on public.rebanho_cochos
for update to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id))
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_exclui_cochos on public.rebanho_cochos
for delete to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id));

create policy consultor_gerencia_abastecimentos on public.rebanho_abastecimentos_cochos
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_abastecimentos on public.rebanho_abastecimentos_cochos
for select to authenticated
using (cliente_id in (
  select cu.cliente_id from public.clientes_usuarios cu
  where cu.auth_user_id = (select auth.uid())
));

create policy cliente_cria_abastecimentos on public.rebanho_abastecimentos_cochos
for insert to authenticated
with check (
  private.rebanho_pode_editar_cliente(cliente_id)
  and usuario_id = (select auth.uid())
  and exists (
    select 1 from public.rebanho_cochos c
    where c.id = cocho_id
      and c.cliente_id = rebanho_abastecimentos_cochos.cliente_id
      and c.local_id = rebanho_abastecimentos_cochos.local_id
  )
);

create policy cliente_edita_abastecimentos on public.rebanho_abastecimentos_cochos
for update to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id))
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_exclui_abastecimentos on public.rebanho_abastecimentos_cochos
for delete to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id));
