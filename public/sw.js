// ============================================================
// SERVICE WORKER
//
// Função: deixar o app abrir mesmo sem internet, guardando
// uma cópia das telas (HTML/CSS/JS) no celular.
//
// Importante: isso NÃO sincroniza dados (isso é feito em
// lib/sync.js usando IndexedDB). O Service Worker só garante
// que o APP em si (a interface) carregue offline.
// ============================================================

const CACHE_NAME = "rebanho-cache-v1";

const ARQUIVOS_ESSENCIAIS = [
  "/",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.filter((nome) => nome !== CACHE_NAME).map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: tenta a rede primeiro; se falhar (sem internet),
// usa o que estiver salvo no cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request))
  );
});
