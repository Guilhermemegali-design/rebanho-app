alter table public.rebanho_procedimentos_sanitarios
  add column if not exists grupo_lancamento text,
  add column if not exists lote_lancamento_id uuid
    references public.rebanho_lotes(id) on delete set null;

create index if not exists idx_rebanho_procedimentos_grupo
  on public.rebanho_procedimentos_sanitarios(grupo_lancamento)
  where grupo_lancamento is not null;
