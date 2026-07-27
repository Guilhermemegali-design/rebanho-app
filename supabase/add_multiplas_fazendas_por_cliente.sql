-- Permite separar o rebanho de várias fazendas pertencentes ao mesmo cliente.

create table if not exists public.rebanho_fazendas (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, cliente_id),
  unique (cliente_id, nome)
);

create index if not exists idx_rebanho_fazendas_cliente
  on public.rebanho_fazendas(cliente_id, nome);
create index if not exists idx_rebanho_fazendas_consultor
  on public.rebanho_fazendas(consultor_id);

alter table public.rebanho_fazendas enable row level security;
revoke all on public.rebanho_fazendas from anon;
revoke truncate, references, trigger on public.rebanho_fazendas from authenticated;
grant select, insert, update, delete on public.rebanho_fazendas to authenticated;

create policy consultor_gerencia_fazendas on public.rebanho_fazendas
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_fazendas on public.rebanho_fazendas
for select to authenticated
using (cliente_id in (
  select cu.cliente_id from public.clientes_usuarios cu
  where cu.auth_user_id = (select auth.uid())
));

create policy cliente_cria_fazendas on public.rebanho_fazendas
for insert to authenticated
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_edita_fazendas on public.rebanho_fazendas
for update to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id))
with check (private.rebanho_pode_editar_cliente(cliente_id));

create policy cliente_exclui_fazendas on public.rebanho_fazendas
for delete to authenticated
using (private.rebanho_pode_editar_cliente(cliente_id));

-- Toda base atual passa a pertencer à Fazenda principal do cliente.
insert into public.rebanho_fazendas (consultor_id, cliente_id, nome)
select c.consultor_id, c.id, 'Fazenda principal'
from public.clientes c
where not exists (
  select 1 from public.rebanho_fazendas f where f.cliente_id = c.id
);

alter table public.rebanho_animais add column if not exists fazenda_id uuid;
alter table public.rebanho_locais add column if not exists fazenda_id uuid;
alter table public.rebanho_lotes add column if not exists fazenda_id uuid;
alter table public.rebanho_fornecedores add column if not exists fazenda_id uuid;
alter table public.rebanho_medicamentos add column if not exists fazenda_id uuid;
alter table public.rebanho_cochos add column if not exists fazenda_id uuid;
alter table public.rebanho_abastecimentos_cochos add column if not exists fazenda_id uuid;
alter table public.rebanho_mapas_fazenda add column if not exists fazenda_id uuid;
alter table public.rebanho_movimentacoes add column if not exists fazenda_id uuid;
alter table public.rebanho_pesagens add column if not exists fazenda_id uuid;
alter table public.rebanho_procedimentos_sanitarios add column if not exists fazenda_id uuid;
alter table public.rebanho_lote_participacoes add column if not exists fazenda_id uuid;

update public.rebanho_animais r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_locais r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_lotes r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_fornecedores r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_medicamentos r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_cochos r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_abastecimentos_cochos r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_mapas_fazenda r
set fazenda_id = f.id
from public.rebanho_fazendas f
where r.fazenda_id is null and f.cliente_id = r.cliente_id;

update public.rebanho_movimentacoes r
set fazenda_id = a.fazenda_id
from public.rebanho_animais a
where r.fazenda_id is null and a.id = r.animal_id;

update public.rebanho_pesagens r
set fazenda_id = a.fazenda_id
from public.rebanho_animais a
where r.fazenda_id is null and a.id = r.animal_id;

update public.rebanho_procedimentos_sanitarios r
set fazenda_id = a.fazenda_id
from public.rebanho_animais a
where r.fazenda_id is null and a.id = r.animal_id;

update public.rebanho_lote_participacoes r
set fazenda_id = a.fazenda_id
from public.rebanho_animais a
where r.fazenda_id is null and a.id = r.animal_id;

alter table public.rebanho_animais alter column fazenda_id set not null;
alter table public.rebanho_locais alter column fazenda_id set not null;
alter table public.rebanho_lotes alter column fazenda_id set not null;
alter table public.rebanho_fornecedores alter column fazenda_id set not null;
alter table public.rebanho_medicamentos alter column fazenda_id set not null;
alter table public.rebanho_cochos alter column fazenda_id set not null;
alter table public.rebanho_abastecimentos_cochos alter column fazenda_id set not null;
alter table public.rebanho_mapas_fazenda alter column fazenda_id set not null;
alter table public.rebanho_movimentacoes alter column fazenda_id set not null;
alter table public.rebanho_pesagens alter column fazenda_id set not null;
alter table public.rebanho_procedimentos_sanitarios alter column fazenda_id set not null;

alter table public.rebanho_animais
  add constraint rebanho_animais_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_locais
  add constraint rebanho_locais_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_lotes
  add constraint rebanho_lotes_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_fornecedores
  add constraint rebanho_fornecedores_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_medicamentos
  add constraint rebanho_medicamentos_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_cochos
  add constraint rebanho_cochos_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_abastecimentos_cochos
  add constraint rebanho_abastecimentos_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;
alter table public.rebanho_mapas_fazenda
  add constraint rebanho_mapas_fazenda_fazenda_cliente_fkey
  foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict;

alter table public.rebanho_movimentacoes
  add constraint rebanho_movimentacoes_fazenda_fkey
  foreign key (fazenda_id) references public.rebanho_fazendas(id) on delete restrict;
alter table public.rebanho_pesagens
  add constraint rebanho_pesagens_fazenda_fkey
  foreign key (fazenda_id) references public.rebanho_fazendas(id) on delete restrict;
alter table public.rebanho_procedimentos_sanitarios
  add constraint rebanho_procedimentos_fazenda_fkey
  foreign key (fazenda_id) references public.rebanho_fazendas(id) on delete restrict;
alter table public.rebanho_lote_participacoes
  add constraint rebanho_lote_participacoes_fazenda_fkey
  foreign key (fazenda_id) references public.rebanho_fazendas(id) on delete restrict;

alter table public.rebanho_mapas_fazenda
  drop constraint if exists rebanho_mapas_fazenda_cliente_id_key;
alter table public.rebanho_mapas_fazenda
  add constraint rebanho_mapas_fazenda_fazenda_id_key unique (fazenda_id);

create index if not exists idx_rebanho_animais_fazenda on public.rebanho_animais(fazenda_id, criado_em desc);
create index if not exists idx_rebanho_locais_fazenda on public.rebanho_locais(fazenda_id, nome);
create index if not exists idx_rebanho_lotes_fazenda on public.rebanho_lotes(fazenda_id, criado_em desc);
create index if not exists idx_rebanho_fornecedores_fazenda on public.rebanho_fornecedores(fazenda_id, nome);
create index if not exists idx_rebanho_medicamentos_fazenda on public.rebanho_medicamentos(fazenda_id, nome);
create index if not exists idx_rebanho_cochos_fazenda on public.rebanho_cochos(fazenda_id, nome);
create index if not exists idx_rebanho_abastecimentos_fazenda on public.rebanho_abastecimentos_cochos(fazenda_id, data_abastecimento desc);
create index if not exists idx_rebanho_movimentacoes_fazenda on public.rebanho_movimentacoes(fazenda_id, data desc);
create index if not exists idx_rebanho_pesagens_fazenda on public.rebanho_pesagens(fazenda_id, data desc);
create index if not exists idx_rebanho_procedimentos_fazenda on public.rebanho_procedimentos_sanitarios(fazenda_id, data_aplicacao desc);
