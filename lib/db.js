// ============================================================
// BANCO LOCAL (IndexedDB) - permite registrar dados no curral/pasto
// sem sinal de internet
//
// Todos os dados operacionais ficam disponíveis localmente. As
// alterações são registradas primeiro no aparelho e enviadas ao
// Supabase, em ordem, quando a conexão voltar.
// ============================================================

import { openDB } from "idb";

const DB_NAME = "rebanho-offline-db";
const DB_VERSION = 5;

const STORES_CACHE = [
  "animais", "lotes", "locais", "cochos", "mapas", "fornecedores", "medicamentos",
  "movimentacoes_cache", "pesagens_cache", "procedimentos_cache", "abastecimentos_cache",
];
const STORES_PENDENTES = ["pesagens", "movimentacoes", "procedimentos", "abastecimentos"];
const STORE_OPERACOES = "operacoes";
const CANAL_DB = "rastro-offline-db-controle";

let dbPromise;
let canalDb;

function canalControleDb() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!canalDb) {
    canalDb = new BroadcastChannel(CANAL_DB);
    canalDb.addEventListener("message", async (evento) => {
      if (evento.data !== "fechar-conexao-antiga" || !dbPromise) return;
      try {
        const db = await dbPromise;
        db.close();
      } finally {
        dbPromise = null;
      }
    });
  }
  return canalDb;
}

export function getDB() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    const canal = canalControleDb();
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const nome of STORES_CACHE) {
          if (!db.objectStoreNames.contains(nome)) {
            db.createObjectStore(nome, { keyPath: "id" });
          }
        }
        for (const nome of STORES_PENDENTES) {
          if (!db.objectStoreNames.contains(nome)) {
            db.createObjectStore(nome, { keyPath: "client_uuid" });
          }
        }
        if (!db.objectStoreNames.contains(STORE_OPERACOES)) {
          const store = db.createObjectStore(STORE_OPERACOES, { keyPath: "operacao_id" });
          store.createIndex("criado_em_local", "criado_em_local");
        }
        if (!db.objectStoreNames.contains("documentos")) {
          db.createObjectStore("documentos", { keyPath: "id" });
        }
      },
      blocked() {
        // Outra aba aberta numa versão antiga pode impedir a atualização do
        // IndexedDB e deixar o botão Salvar aguardando para sempre.
        canal?.postMessage("fechar-conexao-antiga");
        window.dispatchEvent(new CustomEvent("rastro-db-bloqueado"));
      },
      blocking() {
        // Libera imediatamente a conexão para a versão nova aberta em outra
        // aba, sem exigir que o usuário apague dados ou feche tudo à força.
        const conexaoAtual = dbPromise;
        conexaoAtual?.then((db) => db.close()).catch(() => {});
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((erro) => {
      dbPromise = null;
      throw erro;
    });
  }
  return dbPromise;
}

export function gerarIdLocal() {
  return "loc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

export function gerarUuidLocal() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (caractere) => {
    const aleatorio = Math.floor(Math.random() * 16);
    const valor = caractere === "x" ? aleatorio : (aleatorio & 0x3) | 0x8;
    return valor.toString(16);
  });
}

function avisarMudancaPendentes() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rastro-pendentes-alterados"));
}

// ---------- Cache de leitura (animais, lotes, locais) ----------
export async function salvarCacheLocal(store, registros) {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  await Promise.all(registros.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function salvarCacheFazendaLocal(store, fazendaId, registros) {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  const atuais = await tx.store.getAll();
  await Promise.all(atuais.filter((item) => item.fazenda_id === fazendaId).map((item) => tx.store.delete(item.id)));
  await Promise.all(registros.filter((item) => item?.id).map((item) => tx.store.put(item)));
  await tx.done;
}

export async function listarCacheLocal(store) {
  const db = await getDB();
  return db.getAll(store);
}

// ---------- Fila de pendentes (pesagens, movimentações, procedimentos) ----------
export async function salvarPendenteLocal(store, registro) {
  const db = await getDB();
  const item = {
    ...registro,
    client_uuid: registro.client_uuid || gerarIdLocal(),
    sincronizado: false,
    criado_em_local: new Date().toISOString(),
  };
  await db.put(store, item);
  avisarMudancaPendentes();
  return item;
}

export async function listarPendentesLocal(store) {
  const db = await getDB();
  const todos = await db.getAll(store);
  return todos.filter((r) => !r.sincronizado);
}

export async function listarTodosLocal(store) {
  const db = await getDB();
  return db.getAll(store);
}

export async function excluirRegistroLocal(store, chave) {
  if (!chave) return;
  const db = await getDB();
  await db.delete(store, chave);
  avisarMudancaPendentes();
}

export async function marcarSincronizadoLocal(store, chaveLocalOriginal, dadosServidor) {
  const db = await getDB();
  const existente = await db.get(store, chaveLocalOriginal);
  if (!existente) return;

  const novaChave = dadosServidor.client_uuid;
  if (novaChave && novaChave !== chaveLocalOriginal) {
    await db.delete(store, chaveLocalOriginal);
  }
  await db.put(store, { ...existente, ...dadosServidor, sincronizado: true });
  avisarMudancaPendentes();
}

export async function salvarOperacaoLocal({ tabela, acao, dados = null, registroId = null }) {
  const db = await getDB();
  const operacao = {
    operacao_id: gerarIdLocal(),
    tabela,
    acao,
    dados,
    registro_id: registroId || dados?.id || null,
    criado_em_local: new Date().toISOString(),
  };
  await db.put(STORE_OPERACOES, operacao);
  avisarMudancaPendentes();
  return operacao;
}

export async function listarOperacoesLocal() {
  const db = await getDB();
  const operacoes = await db.getAll(STORE_OPERACOES);
  return operacoes.sort((a, b) => a.criado_em_local.localeCompare(b.criado_em_local));
}

export async function excluirOperacaoLocal(operacaoId) {
  const db = await getDB();
  await db.delete(STORE_OPERACOES, operacaoId);
  avisarMudancaPendentes();
}

export async function salvarDocumentoPendenteLocal(file, usuarioId) {
  const db = await getDB();
  const id = gerarUuidLocal();
  await db.put("documentos", {
    id,
    usuario_id: usuarioId,
    nome: file.name,
    tipo: file.type || "application/octet-stream",
    blob: file,
    criado_em_local: new Date().toISOString(),
  });
  return id;
}

export async function obterDocumentoPendenteLocal(id) {
  const db = await getDB();
  return db.get("documentos", id);
}

export async function excluirDocumentoPendenteLocal(id) {
  const db = await getDB();
  await db.delete("documentos", id);
}
