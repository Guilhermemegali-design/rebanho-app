create table if not exists public.rebanho_mapas_fazenda (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,
  nome_arquivo text,
  origem text not null default 'kml' check (origem in ('kml', 'kmz', 'manual')),
  geojson jsonb not null,
  centro_lat numeric(10,7),
  centro_lng numeric(10,7),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_rebanho_mapas_consultor on public.rebanho_mapas_fazenda(consultor_id);
alter table public.rebanho_mapas_fazenda enable row level security;

revoke all on public.rebanho_mapas_fazenda from anon;
revoke truncate, references, trigger on public.rebanho_mapas_fazenda from authenticated;
grant select, insert, update, delete on public.rebanho_mapas_fazenda to authenticated;

create policy consultor_gerencia_mapa_fazenda on public.rebanho_mapas_fazenda
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_mapa_fazenda on public.rebanho_mapas_fazenda
for select to authenticated
using (cliente_id in (
  select cu.cliente_id from public.clientes_usuarios cu
  where cu.auth_user_id = (select auth.uid())
));

create policy cliente_cria_mapa_fazenda on public.rebanho_mapas_fazenda
for insert to authenticated
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_edita_mapa_fazenda on public.rebanho_mapas_fazenda
for update to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id))
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_exclui_mapa_fazenda on public.rebanho_mapas_fazenda
for delete to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id));
