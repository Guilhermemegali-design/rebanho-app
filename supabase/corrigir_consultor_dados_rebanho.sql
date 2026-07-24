-- Corrige registros criados por operadores com o auth_user_id do operador
-- no campo consultor_id. A fonte de verdade é o consultor da fazenda.

update public.rebanho_animais r
set consultor_id = c.consultor_id
from public.clientes c
where r.cliente_id = c.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_locais r
set consultor_id = c.consultor_id
from public.clientes c
where r.cliente_id = c.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_lotes r
set consultor_id = c.consultor_id
from public.clientes c
where r.cliente_id = c.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_fornecedores r
set consultor_id = c.consultor_id
from public.clientes c
where r.cliente_id = c.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_medicamentos r
set consultor_id = c.consultor_id
from public.clientes c
where r.cliente_id = c.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_movimentacoes r
set consultor_id = c.consultor_id
from public.rebanho_animais a
join public.clientes c on c.id = a.cliente_id
where r.animal_id = a.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_pesagens r
set consultor_id = c.consultor_id
from public.rebanho_animais a
join public.clientes c on c.id = a.cliente_id
where r.animal_id = a.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_procedimentos_sanitarios r
set consultor_id = c.consultor_id
from public.rebanho_animais a
join public.clientes c on c.id = a.cliente_id
where r.animal_id = a.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_lote_participacoes r
set consultor_id = c.consultor_id
from public.rebanho_animais a
join public.clientes c on c.id = a.cliente_id
where r.animal_id = a.id
  and r.consultor_id is distinct from c.consultor_id;

update public.rebanho_auditoria au
set consultor_id = a.consultor_id
from public.rebanho_animais a
where au.tabela = 'rebanho_animais'
  and au.registro_id = a.id
  and au.consultor_id is distinct from a.consultor_id;

update public.rebanho_auditoria au
set consultor_id = r.consultor_id
from public.rebanho_movimentacoes r
where au.tabela = 'rebanho_movimentacoes'
  and au.registro_id = r.id
  and au.consultor_id is distinct from r.consultor_id;

update public.rebanho_auditoria au
set consultor_id = r.consultor_id
from public.rebanho_pesagens r
where au.tabela = 'rebanho_pesagens'
  and au.registro_id = r.id
  and au.consultor_id is distinct from r.consultor_id;

update public.rebanho_auditoria au
set consultor_id = r.consultor_id
from public.rebanho_procedimentos_sanitarios r
where au.tabela = 'rebanho_procedimentos_sanitarios'
  and au.registro_id = r.id
  and au.consultor_id is distinct from r.consultor_id;
