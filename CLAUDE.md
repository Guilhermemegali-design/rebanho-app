# CLAUDE.md

Guia para o Claude Code ao trabalhar neste repositório.

## O que é este projeto

App de acompanhamento **individual** do rebanho (brinco/RFID, pesagens,
sanidade, movimentações) para um zootecnista/consultor solo, irmão dos
apps Consultoria-main e Confinamento-main (mesmo Supabase). Ver
[handoff.md](handoff.md) para arquitetura completa, histórico de sessões e
pendências em aberto — leia esse arquivo antes de começar qualquer
trabalho novo aqui.

## Fluxo de deploy — é um repositório git real

Diferente do Consultoria-main (que é zip manual), aqui existe repo git de
verdade: `github.com/Guilhermemegali-design/rebanho-app`, branch `main`,
deploy automático no Vercel a cada push.

**Antes de dar push, sempre rode `git fetch origin` e reconcilie.** Este
repositório recebe commits de mais de uma sessão/ferramenta (não assuma
que o `main` local está atualizado). Se o `origin/main` tiver avançado,
faça merge e resolva os conflitos combinando as duas mudanças — nunca
force push para "resolver" divergência sem antes olhar o que tem do outro
lado.

### Cuidado: repo vive no iCloud Drive

A pasta do projeto é sincronizada pelo iCloud (`~/Library/Mobile
Documents/com~apple~CloudDocs/...`). Isso já causou corrupção real: o
iCloud duplicou um arquivo de ref do git (`.git/refs/heads/main 2`) num
conflito de sincronização, e esse arquivo extra travava `git fetch` com
erro `bad object refs/heads/main 2` / `did not send all necessary
objects`. Se `git fetch`/`git push` falhar com erro estranho de objeto ou
ref, primeiro rode `ls .git/refs/heads/` procurando arquivos com sufixo
` 2`, ` 3` etc. — são duplicatas do iCloud, não branches reais. Confirme
que o commit apontado já é ancestral do `main` real
(`git merge-base --is-ancestor <sha-do-arquivo-extra> main`) antes de
apagar o arquivo extra.

## Comandos

```bash
npm install   # node_modules pode ficar desatualizado (ex: leaflet, fflate,
              # @tmcw/togeojson somem depois de um tempo parado) — rode de
              # novo se o dev server acusar "Module not found"
npm run dev   # servidor de desenvolvimento
npm run build # build de produção
```

Sem suíte de testes configurada.

## Arquitetura

### Multi-fazenda por cliente, com restrição de acesso opcional por usuário

Um cliente (`clientes`) pode ter várias fazendas/retiros
(`rebanho_fazendas`); todas as tabelas operacionais têm `fazenda_id`. Um
usuário vinculado via `clientes_usuarios` (ou convidado via
`rebanho_convites_usuarios`) pode ter `fazenda_id`:
- `null` → acesso a **todas** as fazendas do cliente (padrão histórico).
- definido → acesso restrito a **apenas aquela** fazenda.

A restrição é reforçada no **banco**, não só na interface: as funções
`private.rebanho_fazenda_permitida(fazenda_id)` (leitura),
`private.rebanho_pode_editar_fazenda(fazenda_id)` (escrita, exige papel
administrador/editor) e `private.rebanho_tem_acesso_total(cliente_id)`
(só quem enxerga todas as fazendas pode criar uma nova) substituíram as
policies antigas baseadas só em `cliente_id`. Ao adicionar uma tabela nova
com `fazenda_id`, use essas funções nas policies — não volte a checar só
`cliente_id in (select cliente_id from clientes_usuarios ...)`, senão a
restrição por fazenda vaza silenciosamente para a tabela nova.

Migração de referência: `supabase/add_restricao_fazenda_usuario.sql`.

### `supabase/schema.sql` está desatualizado de propósito

Várias features (multi-fazenda, gestão de usuários/níveis de acesso,
mapa/cochos, restrição por fazenda) foram aplicadas como arquivos de
migração avulsos em `supabase/add_*.sql`, direto via MCP do Supabase, sem
atualizar o `schema.sql` original. Antes de assumir o schema atual a
partir de `schema.sql`, confira também os `add_*.sql` mais recentes (ou
consulte `pg_policies`/`information_schema` direto no projeto
`vvukwhxlsymjsjajzeyl` via MCP) — o arquivo sozinho não reflete o estado
real do banco.

## Idioma

Responder sempre em português brasileiro (PT-BR).
