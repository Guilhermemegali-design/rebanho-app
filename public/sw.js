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

const CACHE_NAME = "rastro-cache-v12";

const ARQUIVOS_ESSENCIAIS = [
  "/manifest.json",
  "/rastro-logo.png?v=2",
  "/icon-192.png?v=2",
  "/icon-512.png?v=2",
];

async function prepararInterfaceOffline() {
  const cache = await caches.open(CACHE_NAME);
  // Lê o HTML publicado e inclui no cache todos os arquivos gerados pelo
  // Next (JS e CSS). Assim a primeira abertura online já deixa a interface
  // inteira pronta para o curral, mesmo que o navegador ainda não estivesse
  // sob controle do Service Worker quando os arquivos foram baixados.
  const respostaInicial = await fetch("/", { cache: "no-store" });
  if (!respostaInicial.ok) throw new Error("Não foi possível preparar o RASTRO offline.");
  const html = await respostaInicial.clone().text();
  await cache.put("/", respostaInicial);

  const caminhos = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((resultado) => resultado[1])
    .filter((caminho) => caminho.startsWith("/_next/static/"));

  await cache.addAll([...new Set([...ARQUIVOS_ESSENCIAIS, ...caminhos])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(prepararInterfaceOffline());
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
  const url = new URL(event.request.url);
  // Nunca armazena respostas autenticadas do Supabase ou de outros
  // domínios no Cache Storage do navegador.
  const tileSatelite = url.hostname === "server.arcgisonline.com";
  if (url.origin !== self.location.origin && !tileSatelite) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((resposta) => {
          if (resposta.ok) caches.open(CACHE_NAME).then((cache) => cache.put("/", resposta.clone()));
          return resposta;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match("/"))
    );
    return;
  }

  // Arquivos do app abrem imediatamente do cache; em segundo plano,
  // busca e guarda uma versão mais nova para o próximo acesso.
  event.respondWith(
    caches.match(event.request).then((salva) => {
      const atualizacao = fetch(event.request).then((resposta) => {
        if (resposta.ok || resposta.type === "opaque") caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resposta.clone()));
        return resposta;
      }).catch(() => salva);
      return salva || atualizacao;
    })
  );
});
