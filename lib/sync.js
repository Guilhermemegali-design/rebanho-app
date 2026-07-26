// ============================================================
// SINCRONIZAÇÃO
//
// Mesma lógica do app Consultoria-main (lib/sync.js): usa
// "client_uuid" (gerado no aparelho) como chave de conflito do
// upsert, para nunca duplicar um registro mesmo que a sincronização
// rode duas vezes.
//
// Roda para pesagens, movimentações, procedimentos sanitários e
// abastecimentos de cochos.
// ============================================================

import { supabase } from "./supabaseClient";
import { listarPendentesLocal, marcarSincronizadoLocal, gerarIdLocal } from "./db";

const TABELA_POR_STORE = {
  pesagens: "rebanho_pesagens",
  movimentacoes: "rebanho_movimentacoes",
  procedimentos: "rebanho_procedimentos_sanitarios",
  abastecimentos: "rebanho_abastecimentos_cochos",
};

async function sincronizarStore(store, consultorIdAtual) {
  const tabela = TABELA_POR_STORE[store];
  const pendentes = await listarPendentesLocal(store);
  if (pendentes.length === 0) return { enviados: 0, falhas: 0, erros: [] };

  let enviados = 0;
  let falhas = 0;
  const erros = [];

  for (const registro of pendentes) {
    try {
      const { client_uuid: client_uuid_original, sincronizado, criado_em_local, ...dados } = registro;
      const client_uuid = client_uuid_original || gerarIdLocal();

      if (consultorIdAtual && dados.consultor_id !== consultorIdAtual) {
        dados.consultor_id = consultorIdAtual;
      }

      const usaIdServidor = Boolean(dados.id);
      const payload = { ...dados, client_uuid };
      const onConflict = usaIdServidor ? "id" : "client_uuid";

      const { data, error } = await supabase
        .from(tabela)
        .upsert(payload, { onConflict })
        .select()
        .single();

      if (error) throw error;

      await marcarSincronizadoLocal(store, client_uuid_original || client_uuid, data);

      // Movimentação sincronizada com sucesso: atualiza o "ponteiro" de
      // lote/local atual do animal (lote_atual_id/local_atual_id em
      // rebanho_animais). Isso só é possível aqui porque sincronizar já
      // implica estar online — enquanto offline, a tela usa o histórico
      // de movimentações já carregado em memória pra saber o lote/local
      // atual, não esse ponteiro.
      if (store === "movimentacoes") {
        const atualizacao = {};
        if (data.tipo === "entrada" || data.tipo === "transferencia_lote") {
          atualizacao.lote_atual_id = data.lote_destino_id ?? null;
        }
        if (data.tipo === "entrada" || data.tipo === "transferencia_local") {
          atualizacao.local_atual_id = data.local_destino_id ?? null;
        }
        if (data.tipo === "saida" || data.tipo === "morte" || data.tipo === "venda") {
          atualizacao.situacao = data.tipo === "venda" ? "vendido" : data.tipo === "morte" ? "morto" : "transferido";
        }
        if (Object.keys(atualizacao).length > 0) {
          await supabase.from("rebanho_animais").update(atualizacao).eq("id", data.animal_id);
        }
        if (data.tipo === "transferencia_local" && data.lote_destino_id && data.local_destino_id) {
          await supabase.from("rebanho_lotes").update({ local_id: data.local_destino_id }).eq("id", data.lote_destino_id);
        }
      }

      enviados++;
    } catch (err) {
      console.error(`Falha ao sincronizar ${store}:`, err);
      const detalhe = [err?.message, err?.details, err?.hint].filter(Boolean).join(" — ");
      erros.push(detalhe || String(err));
      falhas++;
    }
  }

  return { enviados, falhas, erros };
}

export async function sincronizarTudoPendente(consultorIdAtual) {
  const resultados = await Promise.all(
    Object.keys(TABELA_POR_STORE).map((store) => sincronizarStore(store, consultorIdAtual))
  );
  return resultados.reduce(
    (acc, r) => ({
      enviados: acc.enviados + r.enviados,
      falhas: acc.falhas + r.falhas,
      erros: [...acc.erros, ...r.erros],
    }),
    { enviados: 0, falhas: 0, erros: [] }
  );
}

export async function contarPendentesTotal() {
  const listas = await Promise.all(Object.keys(TABELA_POR_STORE).map((store) => listarPendentesLocal(store)));
  return listas.reduce((total, lista) => total + lista.length, 0);
}

// Verifica conexão real (não só navigator.onLine) tentando um ping
// leve no Supabase.
export async function temConexaoReal() {
  if (!navigator.onLine) return false;
  try {
    const { error } = await supabase.from("clientes").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
