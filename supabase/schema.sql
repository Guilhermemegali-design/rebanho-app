-- ============================================================
-- SCHEMA DO BANCO DE DADOS - App Controle de Rebanho
-- Execute este arquivo no SQL Editor do Supabase (painel online).
--
-- Roda no MESMO projeto Supabase do Consultoria-main e do
-- Confinamento-main (tabelas `clientes` e `clientes_usuarios` já
-- existem — não são recriadas aqui). Todas as tabelas novas usam o
-- prefixo `rebanho_` para não colidir com as tabelas de
-- confinamento (`lotes_confinamento`, `pesagens_lote`, etc), que são
-- de outro app e têm granularidade por LOTE, não por animal.
-- ============================================================

-- ------------------------------------------------------------
-- TABELA: rebanho_fornecedores
-- ------------------------------------------------------------
create table rebanho_fornecedores (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  contato text,
  criado_em timestamptz default now()
);

alter table rebanho_fornecedores enable row level security;

create policy "consultor_gerencia_fornecedores" on rebanho_fornecedores
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_seus_fornecedores" on rebanho_fornecedores
  for select using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_cria_fornecedores" on rebanho_fornecedores
  for insert with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_edita_fornecedores" on rebanho_fornecedores
  for update using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create index idx_rebanho_fornecedores_cliente on rebanho_fornecedores(cliente_id);

-- ------------------------------------------------------------
-- TABELA: rebanho_locais (pastos, currais, baias)
-- ------------------------------------------------------------
create table rebanho_locais (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  tipo text not null default 'pasto' check (tipo in ('pasto', 'curral', 'baia', 'outro')),
  capacidade integer,
  criado_em timestamptz default now()
);

alter table rebanho_locais enable row level security;

create policy "consultor_gerencia_locais" on rebanho_locais
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_seus_locais" on rebanho_locais
  for select using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_cria_locais" on rebanho_locais
  for insert with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_edita_locais" on rebanho_locais
  for update using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_exclui_locais" on rebanho_locais
  for delete to authenticated
  using (
    cliente_id in (
      select cliente_id from clientes_usuarios
      where auth_user_id = (select auth.uid())
    )
  );

create index idx_rebanho_locais_cliente on rebanho_locais(cliente_id);

-- ------------------------------------------------------------
-- TABELA: rebanho_lotes (agrupamento de animais na recria — diferente
-- de lotes_confinamento, que é do app irmão e não tem animal individual)
-- ------------------------------------------------------------
create table rebanho_lotes (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  local_id uuid references rebanho_locais(id) on delete set null,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'encerrado')),
  criado_em timestamptz default now()
);

alter table rebanho_lotes enable row level security;

create policy "consultor_gerencia_lotes_rebanho" on rebanho_lotes
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_seus_lotes_rebanho" on rebanho_lotes
  for select using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_cria_lotes_rebanho" on rebanho_lotes
  for insert with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_edita_lotes_rebanho" on rebanho_lotes
  for update using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_exclui_lotes_rebanho" on rebanho_lotes
  for delete to authenticated
  using (cliente_id in (
    select cliente_id from clientes_usuarios
    where auth_user_id = (select auth.uid())
  ));

create index idx_rebanho_lotes_cliente on rebanho_lotes(cliente_id);

-- ------------------------------------------------------------
-- TABELA: rebanho_animais
-- id (uuid) é a chave permanente do histórico — o brinco pode ser
-- trocado (brinco_atual) sem nunca reatribuir o id nem perder
-- pesagens/movimentações/procedimentos já registrados.
-- ------------------------------------------------------------
create table rebanho_animais (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  brinco_atual text not null,
  -- Fazendas que usam brinco visual E bastão RFID têm dois números
  -- diferentes por animal — coluna opcional (nem toda fazenda usa RFID).
  -- Quando a fazenda usa só RFID, brinco_atual recebe o mesmo valor.
  brinco_rfid text,
  sexo text check (sexo in ('macho', 'femea')),
  raca text,
  origem text,
  fornecedor_id uuid references rebanho_fornecedores(id) on delete set null,
  categoria text,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'vendido', 'morto', 'transferido')),
  data_entrada date not null default current_date,
  peso_entrada numeric(8,2),
  valor_entrada numeric(10,2),
  local_atual_id uuid references rebanho_locais(id) on delete set null,
  lote_atual_id uuid references rebanho_lotes(id) on delete set null,
  observacoes text,
  -- Nota fiscal de compra do animal (opcional) — arquivo enviado para o
  -- bucket documentos-rebanho (ver final do arquivo).
  nota_fiscal_url text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table rebanho_animais enable row level security;

create policy "consultor_gerencia_animais" on rebanho_animais
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_seus_animais" on rebanho_animais
  for select using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_cria_animais" on rebanho_animais
  for insert with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_edita_animais" on rebanho_animais
  for update using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_exclui_animais" on rebanho_animais
  for delete to authenticated
  using (cliente_id in (
    select cliente_id from clientes_usuarios
    where auth_user_id = (select auth.uid())
  ));

create index idx_rebanho_animais_cliente on rebanho_animais(cliente_id);
create index idx_rebanho_animais_brinco on rebanho_animais(brinco_atual);
create index idx_rebanho_animais_brinco_rfid on rebanho_animais(brinco_rfid);

-- ------------------------------------------------------------
-- TABELA: rebanho_lote_participacoes
-- Histórico de participação do animal em lotes (data_fim null =
-- participação atual). Mesmo espírito de curral_ocupacoes.
-- ------------------------------------------------------------
create table rebanho_lote_participacoes (
  id uuid primary key default uuid_generate_v4(),
  animal_id uuid not null references rebanho_animais(id) on delete cascade,
  lote_id uuid not null references rebanho_lotes(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data_inicio date not null default current_date,
  data_fim date,
  criado_em timestamptz default now()
);

alter table rebanho_lote_participacoes enable row level security;

create policy "consultor_gerencia_participacoes" on rebanho_lote_participacoes
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_participacoes" on rebanho_lote_participacoes
  for select using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_cria_participacoes" on rebanho_lote_participacoes
  for insert with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_fecha_participacoes" on rebanho_lote_participacoes
  for update using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  ) with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create index idx_rebanho_participacoes_animal on rebanho_lote_participacoes(animal_id);
create index idx_rebanho_participacoes_lote on rebanho_lote_participacoes(lote_id);

-- ------------------------------------------------------------
-- TABELA: rebanho_movimentacoes
-- Histórico de entrada, transferência de lote/local, saída, morte
-- e venda de cada animal.
-- ------------------------------------------------------------
create table rebanho_movimentacoes (
  id uuid primary key default uuid_generate_v4(),
  client_uuid text unique, -- gerado no aparelho quando registrado offline
  animal_id uuid not null references rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'transferencia_lote', 'transferencia_local', 'saida', 'morte', 'venda')),
  lote_origem_id uuid references rebanho_lotes(id) on delete set null,
  lote_destino_id uuid references rebanho_lotes(id) on delete set null,
  local_origem_id uuid references rebanho_locais(id) on delete set null,
  local_destino_id uuid references rebanho_locais(id) on delete set null,
  peso_saida numeric,
  preco_arroba numeric,
  rendimento_carcaca numeric,
  data date not null default current_date,
  observacoes text,
  criado_em timestamptz default now()
);

alter table rebanho_movimentacoes enable row level security;

create policy "consultor_gerencia_movimentacoes" on rebanho_movimentacoes
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_movimentacoes" on rebanho_movimentacoes
  for select using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_registra_movimentacao" on rebanho_movimentacoes
  for insert with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_edita_movimentacao" on rebanho_movimentacoes
  for update to authenticated
  using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = (select auth.uid())))
  )
  with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = (select auth.uid())))
  );

create policy "cliente_exclui_movimentacao" on rebanho_movimentacoes
  for delete to authenticated
  using (
    animal_id in (
      select a.id from rebanho_animais a
      where a.cliente_id in (
        select cliente_id from clientes_usuarios
        where auth_user_id = (select auth.uid())
      )
    )
  );

create index idx_rebanho_movimentacoes_animal on rebanho_movimentacoes(animal_id, data);

-- ------------------------------------------------------------
-- TABELA: rebanho_pesagens
-- origem_peso guarda como o peso chegou (digitado à mão ou lido da
-- balança Bluetooth) — útil pra saber a confiabilidade do dado.
-- GMD não é gravado aqui: é sempre calculado em consulta a partir
-- da pesagem anterior do mesmo animal.
-- ------------------------------------------------------------
create table rebanho_pesagens (
  id uuid primary key default uuid_generate_v4(),
  client_uuid text unique, -- gerado no aparelho quando registrado offline
  animal_id uuid not null references rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  data date not null default current_date,
  peso numeric(8,2) not null,
  origem_peso text not null default 'manual' check (origem_peso in ('manual', 'bluetooth')),
  dispositivo text,
  criado_em timestamptz default now()
);

alter table rebanho_pesagens enable row level security;

create policy "consultor_gerencia_pesagens_animal" on rebanho_pesagens
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_pesagens_animal" on rebanho_pesagens
  for select using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_registra_pesagem_animal" on rebanho_pesagens
  for insert with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_edita_pesagem_animal" on rebanho_pesagens
  for update to authenticated
  using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = (select auth.uid())))
  )
  with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = (select auth.uid())))
  );

create policy "cliente_exclui_pesagem_animal" on rebanho_pesagens
  for delete to authenticated
  using (
    animal_id in (
      select a.id from rebanho_animais a
      where a.cliente_id in (
        select cliente_id from clientes_usuarios
        where auth_user_id = (select auth.uid())
      )
    )
  );

create index idx_rebanho_pesagens_animal on rebanho_pesagens(animal_id, data);

-- ------------------------------------------------------------
-- TABELA: rebanho_medicamentos
-- ------------------------------------------------------------
create table rebanho_medicamentos (
  id uuid primary key default uuid_generate_v4(),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  tipo text,
  carencia_padrao_dias integer default 0,
  criado_em timestamptz default now()
);

alter table rebanho_medicamentos enable row level security;

create policy "consultor_gerencia_medicamentos" on rebanho_medicamentos
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_medicamentos" on rebanho_medicamentos
  for select using (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create policy "cliente_cria_medicamentos" on rebanho_medicamentos
  for insert with check (cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()));

create index idx_rebanho_medicamentos_cliente on rebanho_medicamentos(cliente_id);

-- ------------------------------------------------------------
-- TABELA: rebanho_procedimentos_sanitarios
-- ------------------------------------------------------------
create table rebanho_procedimentos_sanitarios (
  id uuid primary key default uuid_generate_v4(),
  client_uuid text unique, -- gerado no aparelho quando registrado offline
  animal_id uuid not null references rebanho_animais(id) on delete cascade,
  consultor_id uuid not null references auth.users(id) on delete cascade,
  grupo_lancamento text,
  lote_lancamento_id uuid references rebanho_lotes(id) on delete set null,
  tipo text not null check (tipo in ('vacina', 'vermifugo', 'diagnostico', 'tratamento')),
  medicamento_id uuid references rebanho_medicamentos(id) on delete set null,
  dose text,
  data_aplicacao date not null default current_date,
  proxima_aplicacao date,
  carencia_dias integer default 0,
  observacoes text,
  criado_em timestamptz default now()
);

alter table rebanho_procedimentos_sanitarios enable row level security;

create policy "consultor_gerencia_procedimentos" on rebanho_procedimentos_sanitarios
  for all using (auth.uid() = consultor_id) with check (auth.uid() = consultor_id);

create policy "cliente_ve_procedimentos" on rebanho_procedimentos_sanitarios
  for select using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_registra_procedimento" on rebanho_procedimentos_sanitarios
  for insert with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = auth.uid()))
  );

create policy "cliente_edita_procedimento" on rebanho_procedimentos_sanitarios
  for update to authenticated
  using (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = (select auth.uid())))
  )
  with check (
    animal_id in (select a.id from rebanho_animais a where a.cliente_id in (select cliente_id from clientes_usuarios where auth_user_id = (select auth.uid())))
  );

create policy "cliente_exclui_procedimento" on rebanho_procedimentos_sanitarios
  for delete to authenticated
  using (
    animal_id in (
      select a.id from rebanho_animais a
      where a.cliente_id in (
        select cliente_id from clientes_usuarios
        where auth_user_id = (select auth.uid())
      )
    )
  );

create index idx_rebanho_procedimentos_animal on rebanho_procedimentos_sanitarios(animal_id, data_aplicacao);
create index idx_rebanho_procedimentos_grupo on rebanho_procedimentos_sanitarios(grupo_lancamento)
  where grupo_lancamento is not null;

-- ------------------------------------------------------------
-- TABELA: rebanho_auditoria
-- Preenchida por trigger genérico (abaixo) em animais, pesagens,
-- movimentações e procedimentos — não tem policy de cliente de
-- propósito (só o consultor consulta, via app ou painel Supabase);
-- a trigger roda como security definer, então grava mesmo sem
-- policy de insert.
-- ------------------------------------------------------------
create table rebanho_auditoria (
  id uuid primary key default uuid_generate_v4(),
  tabela text not null,
  registro_id uuid not null,
  acao text not null check (acao in ('insert', 'update', 'delete')),
  consultor_id uuid not null references auth.users(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete set null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  criado_em timestamptz default now()
);

alter table rebanho_auditoria enable row level security;

-- Só o consultor dono dos dados audita (mesmo padrão das demais tabelas:
-- auth.uid() = consultor_id na própria linha). Nenhuma policy de cliente
-- de propósito — auditoria é uso interno do consultor.
create policy "consultor_ve_auditoria" on rebanho_auditoria
  for select using (auth.uid() = consultor_id);

create index idx_rebanho_auditoria_registro on rebanho_auditoria(tabela, registro_id);
create index idx_rebanho_auditoria_consultor on rebanho_auditoria(consultor_id);

-- search_path fixo em '' (com tudo qualificado por schema) e EXECUTE
-- revogado de anon/authenticated: só o mecanismo de trigger pode chamar
-- esta função, ninguém consegue invocá-la direto via /rest/v1/rpc.
create or replace function rebanho_registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.rebanho_auditoria (tabela, registro_id, acao, consultor_id, usuario_id, dados_novos)
    values (tg_table_name, new.id, 'insert', new.consultor_id, auth.uid(), to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.rebanho_auditoria (tabela, registro_id, acao, consultor_id, usuario_id, dados_anteriores, dados_novos)
    values (tg_table_name, new.id, 'update', new.consultor_id, auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.rebanho_auditoria (tabela, registro_id, acao, consultor_id, usuario_id, dados_anteriores)
    values (tg_table_name, old.id, 'delete', old.consultor_id, auth.uid(), to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function rebanho_registrar_auditoria() from public, anon, authenticated;

create trigger trg_auditoria_animais
  after insert or update or delete on rebanho_animais
  for each row execute function rebanho_registrar_auditoria();

create trigger trg_auditoria_pesagens
  after insert or update or delete on rebanho_pesagens
  for each row execute function rebanho_registrar_auditoria();

create trigger trg_auditoria_movimentacoes
  after insert or update or delete on rebanho_movimentacoes
  for each row execute function rebanho_registrar_auditoria();

create trigger trg_auditoria_procedimentos
  after insert or update or delete on rebanho_procedimentos_sanitarios
  for each row execute function rebanho_registrar_auditoria();

-- ------------------------------------------------------------
-- STORAGE: bucket para documentos do rebanho (nota fiscal de compra
-- do animal, por enquanto) — mesmo padrão dos buckets de documentos
-- do Consultoria-main: público para leitura, upload restrito à
-- própria pasta do usuário (auth.uid()).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos-rebanho', 'documentos-rebanho', true)
on conflict (id) do nothing;

create policy "usuario_envia_documento_rebanho" on storage.objects
  for insert with check (bucket_id = 'documentos-rebanho' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "qualquer_um_ve_documentos_rebanho" on storage.objects
  for select using (bucket_id = 'documentos-rebanho');

create policy "usuario_atualiza_documento_rebanho" on storage.objects
  for update using (bucket_id = 'documentos-rebanho' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documentos-rebanho' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuario_apaga_documento_rebanho" on storage.objects
  for delete using (bucket_id = 'documentos-rebanho' and (storage.foldername(name))[1] = auth.uid()::text);
