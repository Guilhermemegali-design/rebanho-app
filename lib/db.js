// ============================================================
// BANCO LOCAL (IndexedDB) - permite registrar dados no curral/pasto
// sem sinal de internet
//
// Offline-first vale para pesagens, movimentações e procedimentos
// sanitários (o que o operador faz no campo, todo dia, muitas vezes
// sem sinal). O cadastro de animal em si (rebanho_animais) e os
// cadastros de apoio (lotes, locais, fornecedores) exigem conexão —
// são feitos com calma, geralmente com sinal, e evitam o problema de
// sincronizar uma pesagem referenciando um animal que ainda nem
// existe no servidor.
//
// animais/lotes/locais ficam em cache local só para CONSULTA offline
// (ex: escolher o animal certo na tela de pesagem mesmo sem sinal).
// ============================================================

import { openDB } from "idb";

const DB_NAME = "rebanho-offline-db";
const DB_VERSION = 3;

const STORES_CACHE = ["animais", "lotes", "locais", "cochos", "mapas"];
const STORES_PENDENTES = ["pesagens", "movimentacoes", "procedimentos", "abastecimentos"];

let dbPromise;

export function getDB() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
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
      },
    });
  }
  return dbPromise;
}

export function gerarIdLocal() {
  return "loc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

// ---------- Cache de leitura (animais, lotes, locais) ----------
export async function salvarCacheLocal(store, registros) {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  for (const r of registros) {
    await tx.store.put(r);
  }
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
}
