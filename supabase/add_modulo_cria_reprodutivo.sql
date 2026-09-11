-- Módulo Cria (núcleo reprodutivo): genealogia, protocolo IATF, touros/sêmen,
-- diagnóstico de gestação, partos, desmames e repasse. Tudo aditivo — nenhuma
-- tabela/coluna existente é alterada de forma incompatível.

-- ------------------------------------------------------------
-- Genealogia em rebanho_animais e ECC em rebanho_pesagens
-- ------------------------------------------------------------
alter table public.rebanho_pesagens
  add column if not exists escore_corporal numeric(3,1);

-- ------------------------------------------------------------
-- rebanho_touros — cadastro de touros próprios ou referência de sêmen
-- externo, usado tanto em IATF (pai da IA) quanto em repasse.
-- ------------------------------------------------------------
create table if not exists public.rebanho_touros (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fazenda_id uuid not null,
  nome text not null,
  identificacao text,
  raca text,
  tipo text not null default 'semen' check (tipo in ('proprio', 'semen', 'repasse_externo')),
  fornecedor_id uuid references public.rebanho_fornecedores(id) on delete set null,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint rebanho_touros_fazenda_cliente_fkey
    foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict
);

create index if not exists idx_rebanho_touros_fazenda on public.rebanho_touros(fazenda_id, nome);
create index if not exists idx_rebanho_touros_consultor on public.rebanho_touros(consultor_id);

alter table public.rebanho_touros enable row level security;
revoke all on public.rebanho_touros from anon;
revoke truncate, references, trigger on public.rebanho_touros from authenticated;
grant select, insert, update, delete on public.rebanho_touros to authenticated;

create policy consultor_gerencia_touros on public.rebanho_touros
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_touros on public.rebanho_touros
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_touros on public.rebanho_touros
for insert to authenticated
with check (private.rebanho_pode_editar_fazenda(fazenda_id));

create policy cliente_edita_touros on public.rebanho_touros
for update to authenticated
using (private.rebanho_pode_editar_fazenda(fazenda_id))
with check (private.rebanho_pode_editar_fazenda(fazenda_id));

create policy cliente_exclui_touros on public.rebanho_touros
for delete to authenticated
using (private.rebanho_pode_editar_fazenda(fazenda_id));

-- Agora que rebanho_touros existe, liga a genealogia em rebanho_animais.
alter table public.rebanho_animais
  add column if not exists data_nascimento date,
  add column if not exists peso_nascimento numeric(8,2),
  add column if not exists mae_id uuid references public.rebanho_animais(id) on delete set null,
  add column if not exists touro_id uuid references public.rebanho_touros(id) on delete set null;

create index if not exists idx_rebanho_animais_mae on public.rebanho_animais(mae_id) where mae_id is not null;

-- ------------------------------------------------------------
-- rebanho_protocolos_iatf — cabeçalho do protocolo (D0, lote, touro padrão)
-- ------------------------------------------------------------
create table if not exists public.rebanho_protocolos_iatf (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fazenda_id uuid not null,
  lote_id uuid references public.rebanho_lotes(id) on delete set null,
  nome text not null,
  data_d0 date not null,
  dias_ate_retirada integer not null default 8,
  dias_ate_ia integer not null default 11,
  touro_padrao_id uuid references public.rebanho_touros(id) on delete set null,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluido', 'cancelado')),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint rebanho_protocolos_iatf_fazenda_cliente_fkey
    foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict
);

create index if not exists idx_rebanho_protocolos_iatf_fazenda on public.rebanho_protocolos_iatf(fazenda_id, data_d0 desc);
create index if not exists idx_rebanho_protocolos_iatf_lote on public.rebanho_protocolos_iatf(lote_id) where lote_id is not null;

alter table public.rebanho_protocolos_iatf enable row level security;
revoke all on public.rebanho_protocolos_iatf from anon;
revoke truncate, references, trigger on public.rebanho_protocolos_iatf from authenticated;
grant select, insert, update, delete on public.rebanho_protocolos_iatf to authenticated;

create policy consultor_gerencia_protocolos_iatf on public.rebanho_protocolos_iatf
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_protocolos_iatf on public.rebanho_protocolos_iatf
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_protocolos_iatf on public.rebanho_protocolos_iatf
for insert to authenticated
with check (private.rebanho_pode_editar_fazenda(fazenda_id));

create policy cliente_edita_protocolos_iatf on public.rebanho_protocolos_iatf
for update to authenticated
using (private.rebanho_pode_editar_fazenda(fazenda_id))
with check (private.rebanho_pode_editar_fazenda(fazenda_id));

create policy cliente_exclui_protocolos_iatf on public.rebanho_protocolos_iatf
for delete to authenticated
using (private.rebanho_pode_editar_fazenda(fazenda_id));

-- ------------------------------------------------------------
-- rebanho_protocolo_animais — etapas por animal dentro de um protocolo
-- (evento de curral, offline-first via client_uuid, mesmo padrão de
-- rebanho_pesagens/rebanho_procedimentos_sanitarios). Datas previstas
-- (D8/D11) não são armazenadas — calculadas em JS a partir de data_d0.
-- ------------------------------------------------------------
create table if not exists public.rebanho_protocolo_animais (
  id uuid primary key default gen_random_uuid(),
  client_uuid text unique,
  protocolo_id uuid not null references public.rebanho_protocolos_iatf(id) on delete cascade,
  animal_id uuid not null references public.rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  fazenda_id uuid not null references public.rebanho_fazendas(id) on delete restrict,
  data_d0 date not null,
  data_retirada_realizada date,
  data_ia date,
  touro_id uuid references public.rebanho_touros(id) on delete set null,
  status text not null default 'aguardando_retirada'
    check (status in ('aguardando_retirada', 'aguardando_ia', 'inseminada', 'removida')),
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rebanho_protocolo_animais_protocolo on public.rebanho_protocolo_animais(protocolo_id);
create index if not exists idx_rebanho_protocolo_animais_animal on public.rebanho_protocolo_animais(animal_id, data_d0 desc);
create index if not exists idx_rebanho_protocolo_animais_fazenda on public.rebanho_protocolo_animais(fazenda_id);

alter table public.rebanho_protocolo_animais enable row level security;
revoke all on public.rebanho_protocolo_animais from anon;
revoke truncate, references, trigger on public.rebanho_protocolo_animais from authenticated;
grant select, insert, update, delete on public.rebanho_protocolo_animais to authenticated;

create policy consultor_gerencia_protocolo_animais on public.rebanho_protocolo_animais
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_protocolo_animais on public.rebanho_protocolo_animais
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_protocolo_animais on public.rebanho_protocolo_animais
for insert to authenticated
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_edita_protocolo_animais on public.rebanho_protocolo_animais
for update to authenticated
using (private.rebanho_pode_editar_animal(animal_id))
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_exclui_protocolo_animais on public.rebanho_protocolo_animais
for delete to authenticated
using (private.rebanho_pode_editar_animal(animal_id));

-- ------------------------------------------------------------
-- rebanho_diagnosticos_gestacao — DG (evento de curral, offline-first)
-- ------------------------------------------------------------
create table if not exists public.rebanho_diagnosticos_gestacao (
  id uuid primary key default gen_random_uuid(),
  client_uuid text unique,
  animal_id uuid not null references public.rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  fazenda_id uuid not null references public.rebanho_fazendas(id) on delete restrict,
  protocolo_animal_id uuid references public.rebanho_protocolo_animais(id) on delete set null,
  data_dg date not null,
  metodo text not null check (metodo in ('palpacao', 'usg', 'sangue')),
  resultado text not null check (resultado in ('prenha', 'vazia', 'inconclusivo')),
  data_ia_referencia date,
  touro_id uuid references public.rebanho_touros(id) on delete set null,
  foto_url text,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rebanho_dg_animal on public.rebanho_diagnosticos_gestacao(animal_id, data_dg desc);
create index if not exists idx_rebanho_dg_fazenda on public.rebanho_diagnosticos_gestacao(fazenda_id);
create index if not exists idx_rebanho_dg_protocolo_animal on public.rebanho_diagnosticos_gestacao(protocolo_animal_id) where protocolo_animal_id is not null;

alter table public.rebanho_diagnosticos_gestacao enable row level security;
revoke all on public.rebanho_diagnosticos_gestacao from anon;
revoke truncate, references, trigger on public.rebanho_diagnosticos_gestacao from authenticated;
grant select, insert, update, delete on public.rebanho_diagnosticos_gestacao to authenticated;

create policy consultor_gerencia_dg on public.rebanho_diagnosticos_gestacao
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_dg on public.rebanho_diagnosticos_gestacao
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_dg on public.rebanho_diagnosticos_gestacao
for insert to authenticated
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_edita_dg on public.rebanho_diagnosticos_gestacao
for update to authenticated
using (private.rebanho_pode_editar_animal(animal_id))
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_exclui_dg on public.rebanho_diagnosticos_gestacao
for delete to authenticated
using (private.rebanho_pode_editar_animal(animal_id));

-- ------------------------------------------------------------
-- rebanho_partos — evento de curral, offline-first
-- ------------------------------------------------------------
create table if not exists public.rebanho_partos (
  id uuid primary key default gen_random_uuid(),
  client_uuid text unique,
  animal_id uuid not null references public.rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  fazenda_id uuid not null references public.rebanho_fazendas(id) on delete restrict,
  diagnostico_gestacao_id uuid references public.rebanho_diagnosticos_gestacao(id) on delete set null,
  data_parto date not null,
  tipo_parto text not null default 'normal' check (tipo_parto in ('normal', 'dificil', 'natimorto', 'aborto')),
  sexo_bezerro text check (sexo_bezerro in ('macho', 'femea')),
  peso_nascimento_bezerro numeric(8,2),
  cria_animal_id uuid references public.rebanho_animais(id) on delete set null,
  touro_id uuid references public.rebanho_touros(id) on delete set null,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rebanho_partos_animal on public.rebanho_partos(animal_id, data_parto desc);
create index if not exists idx_rebanho_partos_fazenda on public.rebanho_partos(fazenda_id);
create index if not exists idx_rebanho_partos_cria on public.rebanho_partos(cria_animal_id) where cria_animal_id is not null;

alter table public.rebanho_partos enable row level security;
revoke all on public.rebanho_partos from anon;
revoke truncate, references, trigger on public.rebanho_partos from authenticated;
grant select, insert, update, delete on public.rebanho_partos to authenticated;

create policy consultor_gerencia_partos on public.rebanho_partos
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_partos on public.rebanho_partos
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_partos on public.rebanho_partos
for insert to authenticated
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_edita_partos on public.rebanho_partos
for update to authenticated
using (private.rebanho_pode_editar_animal(animal_id))
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_exclui_partos on public.rebanho_partos
for delete to authenticated
using (private.rebanho_pode_editar_animal(animal_id));

-- ------------------------------------------------------------
-- rebanho_desmames — evento de curral, offline-first
-- ------------------------------------------------------------
create table if not exists public.rebanho_desmames (
  id uuid primary key default gen_random_uuid(),
  client_uuid text unique,
  animal_id uuid not null references public.rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  fazenda_id uuid not null references public.rebanho_fazendas(id) on delete restrict,
  data_desmame date not null,
  peso_desmame numeric(8,2),
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rebanho_desmames_animal on public.rebanho_desmames(animal_id, data_desmame desc);
create index if not exists idx_rebanho_desmames_fazenda on public.rebanho_desmames(fazenda_id);

alter table public.rebanho_desmames enable row level security;
revoke all on public.rebanho_desmames from anon;
revoke truncate, references, trigger on public.rebanho_desmames from authenticated;
grant select, insert, update, delete on public.rebanho_desmames to authenticated;

create policy consultor_gerencia_desmames on public.rebanho_desmames
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_desmames on public.rebanho_desmames
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_desmames on public.rebanho_desmames
for insert to authenticated
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_edita_desmames on public.rebanho_desmames
for update to authenticated
using (private.rebanho_pode_editar_animal(animal_id))
with check (private.rebanho_pode_editar_animal(animal_id));

create policy cliente_exclui_desmames on public.rebanho_desmames
for delete to authenticated
using (private.rebanho_pode_editar_animal(animal_id));

-- ------------------------------------------------------------
-- rebanho_periodos_repasse — touro de repasse por lote/período (cadastro-like)
-- ------------------------------------------------------------
create table if not exists public.rebanho_periodos_repasse (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fazenda_id uuid not null,
  lote_id uuid not null references public.rebanho_lotes(id) on delete cascade,
  touro_id uuid not null references public.rebanho_touros(id) on delete cascade,
  data_inicio date not null,
  data_fim date,
  observacoes text,
  criado_em timestamptz not null default now(),
  constraint rebanho_periodos_repasse_fazenda_cliente_fkey
    foreign key (fazenda_id, cliente_id) references public.rebanho_fazendas(id, cliente_id) on delete restrict
);

create index if not exists idx_rebanho_repasse_fazenda on public.rebanho_periodos_repasse(fazenda_id, data_inicio desc);
create index if not exists idx_rebanho_repasse_lote on public.rebanho_periodos_repasse(lote_id);

alter table public.rebanho_periodos_repasse enable row level security;
revoke all on public.rebanho_periodos_repasse from anon;
revoke truncate, references, trigger on public.rebanho_periodos_repasse from authenticated;
grant select, insert, update, delete on public.rebanho_periodos_repasse to authenticated;

create policy consultor_gerencia_repasse on public.rebanho_periodos_repasse
for all to authenticated
using ((select auth.uid()) = consultor_id)
with check ((select auth.uid()) = consultor_id);

create policy cliente_ve_repasse on public.rebanho_periodos_repasse
for select to authenticated
using (private.rebanho_fazenda_permitida(fazenda_id));

create policy cliente_cria_repasse on public.rebanho_periodos_repasse
for insert to authenticated
with check (private.rebanho_pode_editar_fazenda(fazenda_id));

create policy cliente_edita_repasse on public.rebanho_periodos_repasse
for update to authenticated
using (private.rebanho_pode_editar_fazenda(fazenda_id))
with check (private.rebanho_pode_editar_fazenda(fazenda_id));

create policy cliente_exclui_repasse on public.rebanho_periodos_repasse
for delete to authenticated
using (private.rebanho_pode_editar_fazenda(fazenda_id));

-- ------------------------------------------------------------
-- Auditoria — mesma trigger genérica já usada em animais/pesagens/
-- movimentações/procedimentos, agora também nos 4 eventos reprodutivos.
-- ------------------------------------------------------------
create trigger trg_auditoria_protocolo_animais
  after insert or update or delete on public.rebanho_protocolo_animais
  for each row execute function public.rebanho_registrar_auditoria();

create trigger trg_auditoria_diagnosticos_gestacao
  after insert or update or delete on public.rebanho_diagnosticos_gestacao
  for each row execute function public.rebanho_registrar_auditoria();

create trigger trg_auditoria_partos
  after insert or update or delete on public.rebanho_partos
  for each row execute function public.rebanho_registrar_auditoria();

create trigger trg_auditoria_desmames
  after insert or update or delete on public.rebanho_desmames
  for each row execute function public.rebanho_registrar_auditoria();
