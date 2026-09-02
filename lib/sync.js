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
import {
  listarPendentesLocal,
  marcarSincronizadoLocal,
  gerarIdLocal,
  listarOperacoesLocal,
  excluirOperacaoLocal,
  obterDocumentoPendenteLocal,
  excluirDocumentoPendenteLocal,
  salvarCacheLocal,
} from "./db";
import { TIPOS_QUE_ENCERRAM_SITUACAO, situacaoAposMovimento } from "./movimentacoes";

const TABELA_POR_STORE = {
  pesagens: "rebanho_pesagens",
  movimentacoes: "rebanho_movimentacoes",
  procedimentos: "rebanho_procedimentos_sanitarios",
  abastecimentos: "rebanho_abastecimentos_cochos",
};

const TABELAS_OPERACIONAIS = new Set([
  "rebanho_fazendas",
  "rebanho_animais",
  "rebanho_locais",
  "rebanho_lotes",
  "rebanho_fornecedores",
  "rebanho_medicamentos",
  "rebanho_cochos",
  "rebanho_mapas_fazenda",
  "rebanho_pesagens",
  "rebanho_movimentacoes",
  "rebanho_procedimentos_sanitarios",
]);

async function sincronizarOperacoes() {
  const operacoes = await listarOperacoesLocal();
  let enviados = 0;
  let falhas = 0;
  const erros = [];

  // A ordem é importante: um lote/animal criado offline precisa chegar
  // antes de uma pesagem ou movimentação que faça referência a ele.
  for (const operacao of operacoes) {
    try {
      if (!TABELAS_OPERACIONAIS.has(operacao.tabela)) throw new Error("Operação offline inválida.");
      let error;
      if (operacao.acao === "upsert" || operacao.acao === "insert") {
        let dados = operacao.dados;
        const marcadorDocumento = dados?.nota_fiscal_url;
        if (typeof marcadorDocumento === "string" && marcadorDocumento.startsWith("rastro-pendente://")) {
          const documentoId = marcadorDocumento.replace("rastro-pendente://", "");
          const documento = await obterDocumentoPendenteLocal(documentoId);
          if (!documento) throw new Error("O documento pendente não foi encontrado no aparelho.");
          const nomeSeguro = documento.nome.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          const caminho = `${documento.usuario_id}/${documento.id}-${nomeSeguro}`;
          const { error: erroUpload } = await supabase.storage
            .from("documentos-rebanho")
            .upload(caminho, documento.blob, { contentType: documento.tipo, upsert: true });
          if (erroUpload) throw erroUpload;
          const { data: url } = supabase.storage.from("documentos-rebanho").getPublicUrl(caminho);
          dados = { ...dados, nota_fiscal_url: url.publicUrl };
        }
        if (operacao.acao === "insert") {
          ({ error } = await supabase.from(operacao.tabela).insert(dados));
          // Se a resposta da primeira tentativa se perdeu, o ID já pode
          // existir online. Confirma antes de retirar a operação da fila.
          if (error?.code === "23505") {
            const { data: existente } = await supabase.from(operacao.tabela).select("id").eq("id", dados.id).maybeSingle();
            if (existente) error = null;
          }
        } else {
          ({ error } = await supabase.from(operacao.tabela).upsert(dados, { onConflict: "id" }));
        }
        if (!error && dados !== operacao.dados) {
          await salvarCacheLocal("animais", [dados]);
          await excluirDocumentoPendenteLocal(marcadorDocumento.replace("rastro-pendente://", ""));
        }
      } else if (operacao.acao === "delete") {
        ({ error } = await supabase.from(operacao.tabela).delete().eq("id", operacao.registro_id));
      } else {
        throw new Error("Tipo de operação offline inválido.");
      }
      if (error) throw error;
      await excluirOperacaoLocal(operacao.operacao_id);
      enviados++;
    } catch (err) {
      const detalhe = [err?.message, err?.details, err?.hint].filter(Boolean).join(" — ");
      erros.push(detalhe || String(err));
      falhas++;
      // Não avança: as próximas operações podem depender desta.
      break;
    }
  }
  return { enviados, falhas, erros };
}

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
        if (TIPOS_QUE_ENCERRAM_SITUACAO.includes(data.tipo)) {
          atualizacao.situacao = situacaoAposMovimento(data.tipo);
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

let sincronizacaoEmCurso = null;

async function executarSincronizacao(consultorIdAtual) {
  const operacoes = await sincronizarOperacoes();
  // Se um cadastro-base falhou, não tenta enviar históricos que podem
  // depender dele; eles permanecem seguros na fila local.
  if (operacoes.falhas > 0) return operacoes;
  const resultados = await Promise.all(
    Object.keys(TABELA_POR_STORE).map((store) => sincronizarStore(store, consultorIdAtual))
  );
  return resultados.reduce(
    (acc, r) => ({
      enviados: acc.enviados + r.enviados,
      falhas: acc.falhas + r.falhas,
      erros: [...acc.erros, ...r.erros],
    }),
    operacoes
  );
}

export async function sincronizarTudoPendente(consultorIdAtual) {
  if (sincronizacaoEmCurso) return sincronizacaoEmCurso;
  sincronizacaoEmCurso = executarSincronizacao(consultorIdAtual).finally(() => {
    sincronizacaoEmCurso = null;
  });
  return sincronizacaoEmCurso;
}

export async function contarPendentesTotal() {
  const [operacoes, ...listas] = await Promise.all([
    listarOperacoesLocal(),
    ...Object.keys(TABELA_POR_STORE).map((store) => listarPendentesLocal(store)),
  ]);
  return operacoes.length + listas.reduce((total, lista) => total + lista.length, 0);
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
