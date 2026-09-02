"use client";

// ============================================================
// HOOK CENTRAL DE DADOS — mesmo espírito do useDadosConfinamento.js
// (Confinamento-main): carrega tudo do cliente/fazenda atual e
// expõe as mutações usadas pelas telas.
//
// Todos os cadastros e manejos são offline-first: primeiro são salvos
// no IndexedDB e depois sincronizados com o Supabase.
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  salvarPendenteLocal,
  salvarCacheLocal,
  salvarCacheFazendaLocal,
  listarCacheLocal,
  listarTodosLocal,
  gerarIdLocal,
  gerarUuidLocal,
  excluirRegistroLocal,
  salvarOperacaoLocal,
  listarOperacoesLocal,
} from "./db";
import { sincronizarTudoPendente } from "./sync";
import { TIPOS_QUE_ENCERRAM_SITUACAO, situacaoAposMovimento } from "./movimentacoes";

const TAMANHO_PAGINA = 750;

function aplicarOperacoesPendentes(registros, operacoes, tabela, fazendaId) {
  const mapa = new Map(registros.map((item) => [item.id, item]));
  for (const operacao of operacoes.filter((item) => item.tabela === tabela)) {
    if (operacao.dados?.fazenda_id && operacao.dados.fazenda_id !== fazendaId) continue;
    if (operacao.acao === "delete") mapa.delete(operacao.registro_id);
    if ((operacao.acao === "upsert" || operacao.acao === "insert") && operacao.dados?.id) mapa.set(operacao.dados.id, operacao.dados);
  }
  return [...mapa.values()];
}

async function buscarTodosPorFazenda(tabela, fazendaId, ordenarPor, ascending = false) {
  const registros = [];

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const fim = inicio + TAMANHO_PAGINA - 1;
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order(ordenarPor, { ascending })
      .order("id", { ascending: true })
      .range(inicio, fim);

    if (error) throw error;
    registros.push(...(data || []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }

  return registros;
}

export function useDadosRebanho(consultorId, clienteId, fazendaId, usuarioId) {
  const [animais, setAnimais] = useState([]);
  const [locais, setLocais] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [pesagens, setPesagens] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [cochos, setCochos] = useState([]);
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [mapaFazenda, setMapaFazenda] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const carregouUmaVez = useRef(false);

  function sincronizarQuandoPossivel() {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    sincronizarTudoPendente(consultorId).then((resultado) => {
      if (resultado.falhas === 0) carregarTudo();
    }).catch(() => {});
  }

  async function enfileirarUpsert(tabela, registro) {
    await salvarOperacaoLocal({ tabela, acao: "upsert", dados: registro });
    sincronizarQuandoPossivel();
    return registro;
  }

  async function enfileirarInsert(tabela, registro) {
    await salvarOperacaoLocal({ tabela, acao: "insert", dados: registro });
    sincronizarQuandoPossivel();
    return registro;
  }

  async function enfileirarDelete(tabela, id) {
    await salvarOperacaoLocal({ tabela, acao: "delete", registroId: id });
    sincronizarQuandoPossivel();
  }

  const carregarTudo = useCallback(async () => {
    if (!clienteId || !fazendaId) return;
    // Só desmonta as telas no primeiro carregamento. Atualizações em
    // segundo plano preservam formulários e o fluxo contínuo no curral.
    if (!carregouUmaVez.current) setCarregando(true);
    try {
      // Evita esperar o timeout da rede no curral. Quando o aparelho já
      // informa que está offline, abre imediatamente a cópia do IndexedDB.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("OFFLINE");
      }
      const [a, { data: l, error: erroLocais }, { data: lt, error: erroLotes }, { data: f, error: erroFornecedores }, { data: m, error: erroMedicamentos }, { data: c, error: erroCochos }, { data: ab, error: erroAbastecimentos }, { data: mapa, error: erroMapa }] = await Promise.all([
        buscarTodosPorFazenda("rebanho_animais", fazendaId, "criado_em"),
        supabase.from("rebanho_locais").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_lotes").select("*").eq("fazenda_id", fazendaId).order("criado_em", { ascending: false }),
        supabase.from("rebanho_fornecedores").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_medicamentos").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_cochos").select("*").eq("fazenda_id", fazendaId).eq("ativo", true).order("nome"),
        supabase.from("rebanho_abastecimentos_cochos").select("*").eq("fazenda_id", fazendaId).order("data_abastecimento", { ascending: false }).limit(300),
        supabase.from("rebanho_mapas_fazenda").select("*").eq("fazenda_id", fazendaId).maybeSingle(),
      ]);
      const erroApoio = erroLocais || erroLotes || erroFornecedores || erroMedicamentos || erroCochos || erroAbastecimentos || erroMapa;
      if (erroApoio) throw erroApoio;

      const operacoes = await listarOperacoesLocal();
      const listaAnimais = aplicarOperacoesPendentes(a, operacoes, "rebanho_animais", fazendaId);
      const listaLocais = aplicarOperacoesPendentes(l || [], operacoes, "rebanho_locais", fazendaId);
      const listaLotes = aplicarOperacoesPendentes(lt || [], operacoes, "rebanho_lotes", fazendaId);
      const listaFornecedores = aplicarOperacoesPendentes(f || [], operacoes, "rebanho_fornecedores", fazendaId);
      const listaMedicamentos = aplicarOperacoesPendentes(m || [], operacoes, "rebanho_medicamentos", fazendaId);
      const listaCochos = aplicarOperacoesPendentes(c || [], operacoes, "rebanho_cochos", fazendaId).filter((item) => item.ativo !== false);
      const listaMapa = aplicarOperacoesPendentes(mapa ? [mapa] : [], operacoes, "rebanho_mapas_fazenda", fazendaId)[0] || null;
      setAnimais(listaAnimais);
      setLocais(listaLocais);
      setLotes(listaLotes);
      setFornecedores(listaFornecedores);
      setMedicamentos(listaMedicamentos);
      setCochos(listaCochos);
      const abastecimentosLocais = await listarTodosLocal("abastecimentos");
      const pendentesAbastecimento = abastecimentosLocais.filter((item) => (
        item.fazenda_id === fazendaId &&
        item.sincronizado === false &&
        !(ab || []).some((servidor) => servidor.client_uuid === item.client_uuid)
      ));
      setAbastecimentos([...pendentesAbastecimento, ...(ab || [])]);
      setMapaFazenda(listaMapa);

      let listaMovimentacoes = [];
      let listaPesagens = [];
      let listaProcedimentos = [];
      if (listaAnimais.length > 0) {
        const [mv, p, pr] = await Promise.all([
          buscarTodosPorFazenda("rebanho_movimentacoes", fazendaId, "data"),
          buscarTodosPorFazenda("rebanho_pesagens", fazendaId, "data"),
          buscarTodosPorFazenda("rebanho_procedimentos_sanitarios", fazendaId, "data_aplicacao"),
        ]);
        const [mvLocais, pLocais, prLocais] = await Promise.all([
          listarTodosLocal("movimentacoes"),
          listarTodosLocal("pesagens"),
          listarTodosLocal("procedimentos"),
        ]);
        const somentePendentes = (locais, servidor) => locais.filter((item) => (
          item.fazenda_id === fazendaId && item.sincronizado === false &&
          !servidor.some((online) => online.id === item.id || (online.client_uuid && online.client_uuid === item.client_uuid))
        ));
        listaMovimentacoes = [...somentePendentes(mvLocais, mv), ...mv];
        listaPesagens = [...somentePendentes(pLocais, p), ...p];
        listaProcedimentos = [...somentePendentes(prLocais, pr), ...pr];
      }
      setMovimentacoes(listaMovimentacoes);
      setPesagens(listaPesagens);
      setProcedimentos(listaProcedimentos);

      // O cache offline pode ser volumoso. Ele continua sendo atualizado,
      // mas não segura a abertura da tela quando a fazenda tem muitos animais.
      Promise.all([
        salvarCacheFazendaLocal("animais", fazendaId, listaAnimais),
        salvarCacheFazendaLocal("locais", fazendaId, listaLocais),
        salvarCacheFazendaLocal("lotes", fazendaId, listaLotes),
        salvarCacheFazendaLocal("fornecedores", fazendaId, listaFornecedores),
        salvarCacheFazendaLocal("medicamentos", fazendaId, listaMedicamentos),
        salvarCacheFazendaLocal("cochos", fazendaId, listaCochos),
        salvarCacheFazendaLocal("movimentacoes_cache", fazendaId, listaMovimentacoes.filter((item) => item.id)),
        salvarCacheFazendaLocal("pesagens_cache", fazendaId, listaPesagens.filter((item) => item.id)),
        salvarCacheFazendaLocal("procedimentos_cache", fazendaId, listaProcedimentos.filter((item) => item.id)),
        salvarCacheFazendaLocal("abastecimentos_cache", fazendaId, (ab || []).filter((item) => item.id)),
        listaMapa ? salvarCacheLocal("mapas", [listaMapa]) : Promise.resolve(),
      ]).catch((erroCache) => console.warn("Não foi possível atualizar todo o cache offline:", erroCache));
    } catch (err) {
      // Sem sinal: usa o cache local completo. As alterações continuam sendo
      // registradas no aparelho e entram na fila para sincronizar depois.
      const [a, l, lt, f, m, c, mvCache, pCache, prCache, abCache, mvLocais, pLocais, prLocais, abLocais, mapas] = await Promise.all([
        listarCacheLocal("animais"),
        listarCacheLocal("locais"),
        listarCacheLocal("lotes"),
        listarCacheLocal("fornecedores"),
        listarCacheLocal("medicamentos"),
        listarCacheLocal("cochos"),
        listarCacheLocal("movimentacoes_cache"),
        listarCacheLocal("pesagens_cache"),
        listarCacheLocal("procedimentos_cache"),
        listarCacheLocal("abastecimentos_cache"),
        listarTodosLocal("movimentacoes"),
        listarTodosLocal("pesagens"),
        listarTodosLocal("procedimentos"),
        listarTodosLocal("abastecimentos"),
        listarCacheLocal("mapas"),
      ]);
      setAnimais(a.filter((item) => item.fazenda_id === fazendaId));
      setLocais(l.filter((item) => item.fazenda_id === fazendaId));
      setLotes(lt.filter((item) => item.fazenda_id === fazendaId));
      setFornecedores(f.filter((item) => item.fazenda_id === fazendaId));
      setMedicamentos(m.filter((item) => item.fazenda_id === fazendaId));
      setCochos(c.filter((item) => item.fazenda_id === fazendaId));
      const combinarOffline = (cache, locais) => {
        const base = cache.filter((item) => item.fazenda_id === fazendaId);
        const pendentes = locais.filter((item) => item.fazenda_id === fazendaId && item.sincronizado === false);
        return [...pendentes, ...base.filter((item) => !pendentes.some((p) => p.id === item.id || (p.client_uuid && p.client_uuid === item.client_uuid)))];
      };
      setMovimentacoes(combinarOffline(mvCache, mvLocais));
      setPesagens(combinarOffline(pCache, pLocais));
      setProcedimentos(combinarOffline(prCache, prLocais));
      setAbastecimentos(combinarOffline(abCache, abLocais));
      setMapaFazenda(mapas.find((item) => item.fazenda_id === fazendaId) || null);
    } finally {
      carregouUmaVez.current = true;
      setCarregando(false);
    }
  }, [clienteId, fazendaId]);

  useEffect(() => {
    carregouUmaVez.current = false;
    carregarTudo();
  }, [carregarTudo]);

  // ---------- Cadastros offline-first ----------
  async function criarAnimal(dados) {
    const registro = {
      id: gerarUuidLocal(),
      ...dados,
      consultor_id: consultorId,
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      situacao: dados.situacao || "ativo",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    await salvarCacheLocal("animais", [registro]);
    setAnimais((prev) => [registro, ...prev]);
    return enfileirarInsert("rebanho_animais", registro);
  }

  async function atualizarAnimal(id, mudancas) {
    const atual = animais.find((item) => item.id === id);
    if (!atual) throw new Error("Animal não encontrado.");
    const registro = { ...atual, ...mudancas, atualizado_em: new Date().toISOString() };
    await salvarCacheLocal("animais", [registro]);
    setAnimais((prev) => prev.map((a) => (a.id === id ? registro : a)));
    return enfileirarUpsert("rebanho_animais", registro);
  }

  async function excluirAnimal(id) {
    await enfileirarDelete("rebanho_animais", id);
    await excluirRegistroLocal("animais", id);
    const storesHistorico = [
      ["pesagens", "pesagens_cache"],
      ["movimentacoes", "movimentacoes_cache"],
      ["procedimentos", "procedimentos_cache"],
    ];
    for (const [storePendente, storeCache] of storesHistorico) {
      const locais = await listarTodosLocal(storePendente);
      const cache = await listarCacheLocal(storeCache);
      await Promise.all(locais.filter((item) => item.animal_id === id).map((item) => excluirRegistroLocal(storePendente, item.client_uuid)));
      await Promise.all(cache.filter((item) => item.animal_id === id).map((item) => excluirRegistroLocal(storeCache, item.id)));
    }
    setAnimais((prev) => prev.filter((a) => a.id !== id));
    setPesagens((prev) => prev.filter((p) => p.animal_id !== id));
    setMovimentacoes((prev) => prev.filter((m) => m.animal_id !== id));
    setProcedimentos((prev) => prev.filter((p) => p.animal_id !== id));
  }

  // Importação em lote (planilha) — insere todos de uma vez; se algum já
  // vier com brinco duplicado no cadastro atual, ainda assim insere (o
  // usuário resolve duplicidade depois, editando/excluindo pelo painel do
  // Supabase) — travar a importação inteira por causa de uma linha
  // suspeita atrapalharia mais do que ajudaria no campo.
  async function criarAnimaisEmLote(listaDados) {
    const agora = new Date().toISOString();
    const registros = listaDados.map((dados) => ({
      id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId,
      situacao: dados.situacao || "ativo", criado_em: agora, atualizado_em: agora,
    }));
    await salvarCacheLocal("animais", registros);
    await Promise.all(registros.map((registro) => salvarOperacaoLocal({ tabela: "rebanho_animais", acao: "insert", dados: registro })));
    setAnimais((prev) => [...registros, ...prev]);
    sincronizarQuandoPossivel();
    return registros;
  }

  async function criarLocal(dados) {
    const registro = { id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId, criado_em: new Date().toISOString() };
    await salvarCacheLocal("locais", [registro]);
    setLocais((prev) => [...prev, registro]);
    return enfileirarInsert("rebanho_locais", registro);
  }

  async function atualizarLocal(id, mudancas) {
    const atual = locais.find((item) => item.id === id);
    if (!atual) throw new Error("Local não encontrado.");
    const registro = { ...atual, ...mudancas };
    await salvarCacheLocal("locais", [registro]);
    setLocais((prev) => prev.map((local) => local.id === id ? registro : local));
    return enfileirarUpsert("rebanho_locais", registro);
  }

  async function excluirLocal(id) {
    await enfileirarDelete("rebanho_locais", id);
    await excluirRegistroLocal("locais", id);
    const lotesAtualizados = lotes.filter((lote) => lote.local_id === id).map((lote) => ({ ...lote, local_id: null }));
    const animaisAtualizados = animais.filter((animal) => animal.local_atual_id === id).map((animal) => ({ ...animal, local_atual_id: null }));
    await salvarCacheLocal("lotes", lotesAtualizados);
    await salvarCacheLocal("animais", animaisAtualizados);
    setLocais((prev) => prev.filter((local) => local.id !== id));
    setLotes((prev) => prev.map((lote) => lote.local_id === id ? { ...lote, local_id: null } : lote));
    setAnimais((prev) => prev.map((animal) => animal.local_atual_id === id ? { ...animal, local_atual_id: null } : animal));
  }

  async function criarLote(dados) {
    const registro = { id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId, situacao: dados.situacao || "ativo", criado_em: new Date().toISOString() };
    await salvarCacheLocal("lotes", [registro]);
    setLotes((prev) => [registro, ...prev]);
    return enfileirarInsert("rebanho_lotes", registro);
  }

  async function atualizarLote(id, mudancas) {
    const atual = lotes.find((item) => item.id === id);
    if (!atual) throw new Error("Lote não encontrado.");
    const registro = { ...atual, ...mudancas };
    await salvarCacheLocal("lotes", [registro]);
    setLotes((prev) => prev.map((lote) => lote.id === id ? registro : lote));
    await salvarOperacaoLocal({ tabela: "rebanho_lotes", acao: "upsert", dados: registro });

    // Local do lote mudou: reflete no local atual de todo animal já
    // atribuído a ele. Sem isso, o local só valeria pra quem entrar
    // no lote dali pra frente, e telas que contam animal por local
    // (ex.: Locais) ficariam zeradas pros animais que já estavam lá.
    if ("local_id" in mudancas) {
      const afetados = animais.filter((animal) => animal.lote_atual_id === id).map((animal) => ({
        ...animal, local_atual_id: mudancas.local_id, atualizado_em: new Date().toISOString(),
      }));
      await salvarCacheLocal("animais", afetados);
      await Promise.all(afetados.map((animal) => salvarOperacaoLocal({ tabela: "rebanho_animais", acao: "upsert", dados: animal })));
      const porId = new Map(afetados.map((animal) => [animal.id, animal]));
      setAnimais((prev) => prev.map((animal) => porId.get(animal.id) || animal));
    }
    sincronizarQuandoPossivel();
    return registro;
  }

  async function excluirLote(id) {
    await enfileirarDelete("rebanho_lotes", id);
    await excluirRegistroLocal("lotes", id);
    const animaisAtualizados = animais.filter((animal) => animal.lote_atual_id === id).map((animal) => ({ ...animal, lote_atual_id: null }));
    await salvarCacheLocal("animais", animaisAtualizados);
    setLotes((prev) => prev.filter((lote) => lote.id !== id));
    setAnimais((prev) => prev.map((animal) => (
      animal.lote_atual_id === id ? { ...animal, lote_atual_id: null } : animal
    )));
  }

  async function criarFornecedor(dados) {
    const registro = { id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId, criado_em: new Date().toISOString() };
    await salvarCacheLocal("fornecedores", [registro]);
    setFornecedores((prev) => [...prev, registro]);
    return enfileirarInsert("rebanho_fornecedores", registro);
  }

  async function criarMedicamento(dados) {
    const registro = { id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId, criado_em: new Date().toISOString() };
    await salvarCacheLocal("medicamentos", [registro]);
    setMedicamentos((prev) => [...prev, registro]);
    return enfileirarInsert("rebanho_medicamentos", registro);
  }

  async function criarCocho(dados) {
    const agora = new Date().toISOString();
    const registro = {
      id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId,
      ativo: dados.ativo ?? true, criado_em: agora, atualizado_em: agora,
    };
    await salvarCacheLocal("cochos", [registro]);
    setCochos((prev) => [...prev, registro]);
    return enfileirarInsert("rebanho_cochos", registro);
  }

  async function atualizarCocho(id, dados) {
    const atual = cochos.find((item) => item.id === id);
    if (!atual) throw new Error("Cocho não encontrado.");
    const registro = { ...atual, ...dados, atualizado_em: new Date().toISOString() };
    const atualizados = cochos.map((item) => item.id === id ? registro : item);
    setCochos(atualizados);
    await salvarCacheLocal("cochos", [registro]);
    return enfileirarUpsert("rebanho_cochos", registro);
  }

  async function excluirCocho(id) {
    const atual = cochos.find((item) => item.id === id);
    if (atual) await enfileirarUpsert("rebanho_cochos", { ...atual, ativo: false, atualizado_em: new Date().toISOString() });
    await excluirRegistroLocal("cochos", id);
    setCochos((prev) => prev.filter((item) => item.id !== id));
  }

  async function registrarAbastecimento(cocho, dados) {
    const animaisAtendidos = animais.filter(
      (animal) => animal.situacao === "ativo" && animal.local_atual_id === cocho.local_id
    );
    const lotesNoLocal = [...new Set(animaisAtendidos.map((animal) => animal.lote_atual_id).filter(Boolean))];
    const loteId = dados.lote_id || (lotesNoLocal.length === 1 ? lotesNoLocal[0] : null);
    const animaisDoLote = loteId
      ? animaisAtendidos.filter((animal) => animal.lote_atual_id === loteId)
      : animaisAtendidos;
    const quantidadeAnimais = animaisDoLote.length;
    const registro = await salvarPendenteLocal("abastecimentos", {
      client_uuid: gerarIdLocal(),
      consultor_id: consultorId,
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      cocho_id: cocho.id,
      local_id: cocho.local_id,
      lote_id: loteId,
      animais_ids: animaisDoLote.map((animal) => animal.id),
      produto: dados.produto,
      quantidade: Number(dados.quantidade),
      unidade: dados.unidade,
      quantidade_animais: quantidadeAnimais,
      consumo_estimado_animal: quantidadeAnimais > 0 ? Number(dados.quantidade) / quantidadeAnimais : null,
      data_abastecimento: dados.data_abastecimento,
      usuario_id: usuarioId || consultorId,
      observacoes: dados.observacoes || null,
    });
    setAbastecimentos((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function salvarMapaFazenda({ geojson, nomeArquivo, origem, centroLat, centroLng }) {
    const payload = {
      id: mapaFazenda?.id || gerarUuidLocal(),
      consultor_id: consultorId,
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      nome_arquivo: nomeArquivo,
      origem,
      geojson,
      centro_lat: centroLat,
      centro_lng: centroLng,
      atualizado_em: new Date().toISOString(),
    };
    setMapaFazenda(payload);
    await salvarCacheLocal("mapas", [payload]);
    return enfileirarUpsert("rebanho_mapas_fazenda", payload);
  }

  // ---------- Offline-first: pesagens, movimentações, procedimentos ----------
  async function sincronizarAgora() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { enviados: 0, falhas: 0, erros: [] };
    }
    return sincronizarTudoPendente(consultorId);
  }

  async function registrarPesagem(animalId, dados) {
    const registro = await salvarPendenteLocal("pesagens", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      ...dados,
    });
    setPesagens((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function excluirPesagem(pesagem) {
    if (pesagem.id) await enfileirarDelete("rebanho_pesagens", pesagem.id);
    await excluirRegistroLocal("pesagens", pesagem.client_uuid);
    if (pesagem.id) await excluirRegistroLocal("pesagens_cache", pesagem.id);
    setPesagens((prev) => prev.filter((item) => (
      pesagem.id ? item.id !== pesagem.id : item.client_uuid !== pesagem.client_uuid
    )));
  }

  async function atualizarPesagem(pesagem, mudancas) {
    const atualizado = await salvarPendenteLocal("pesagens", {
      ...pesagem, ...mudancas, client_uuid: pesagem.client_uuid || gerarIdLocal(),
    });
    setPesagens((prev) => prev.map((item) => (
      (pesagem.id && item.id === pesagem.id) || (!pesagem.id && item.client_uuid === pesagem.client_uuid)
        ? atualizado
        : item
    )));
    return atualizado;
  }

  async function registrarMovimentacao(animalId, dados) {
    const registro = await salvarPendenteLocal("movimentacoes", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      ...dados,
    });
    setMovimentacoes((prev) => [registro, ...prev]);
    // Atualização otimista do animal em memória (o ponteiro real em
    // rebanho_animais só é gravado quando a sincronização rodar).
    const animaisAtualizados = animais.map((a) => {
        if (a.id !== animalId) return a;
        const patch = {};
        if (dados.tipo === "entrada" || dados.tipo === "transferencia_lote") patch.lote_atual_id = dados.lote_destino_id ?? null;
        if (dados.tipo === "entrada" || dados.tipo === "transferencia_local") patch.local_atual_id = dados.local_destino_id ?? null;
        if (TIPOS_QUE_ENCERRAM_SITUACAO.includes(dados.tipo)) {
          patch.situacao = situacaoAposMovimento(dados.tipo);
        }
        return { ...a, ...patch };
      });
    setAnimais(animaisAtualizados);
    await salvarCacheLocal("animais", animaisAtualizados);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function registrarMovimentacoesEmLote(lista) {
    const registros = await Promise.all(
      lista.map(({ animalId, dados }) =>
        salvarPendenteLocal("movimentacoes", {
          client_uuid: gerarIdLocal(),
          animal_id: animalId,
          consultor_id: consultorId,
          fazenda_id: fazendaId,
          ...dados,
        })
      )
    );
    setMovimentacoes((prev) => [...registros, ...prev]);
    const porAnimal = new Map(lista.map((item) => [item.animalId, item.dados]));
    const animaisAtualizados = animais.map((animal) => {
      const movimento = porAnimal.get(animal.id);
      if (!movimento) return animal;
      const patch = {};
      if (movimento.tipo === "entrada" || movimento.tipo === "transferencia_lote") {
        patch.lote_atual_id = movimento.lote_destino_id ?? null;
      }
      if (movimento.tipo === "entrada" || movimento.tipo === "transferencia_local") {
        patch.local_atual_id = movimento.local_destino_id ?? null;
      }
      if (TIPOS_QUE_ENCERRAM_SITUACAO.includes(movimento.tipo)) {
        patch.situacao = situacaoAposMovimento(movimento.tipo);
      }
      return { ...animal, ...patch };
    });
    setAnimais(animaisAtualizados);
    await salvarCacheLocal("animais", animaisAtualizados);
    sincronizarAgora().then(carregarTudo);
    return registros;
  }

  async function excluirMovimentacao(movimentacao) {
    if (movimentacao.id) await enfileirarDelete("rebanho_movimentacoes", movimentacao.id);
    await excluirRegistroLocal("movimentacoes", movimentacao.client_uuid);
    if (movimentacao.id) await excluirRegistroLocal("movimentacoes_cache", movimentacao.id);
    const restantes = movimentacoes.filter((item) => (
      movimentacao.id ? item.id !== movimentacao.id : item.client_uuid !== movimentacao.client_uuid
    ));
    setMovimentacoes(restantes);

    const momento = `${movimentacao.data || ""}|${movimentacao.criado_em || movimentacao.criado_em_local || ""}`;
    const existePosterior = restantes.some((item) => (
      item.animal_id === movimentacao.animal_id &&
      `${item.data || ""}|${item.criado_em || item.criado_em_local || ""}` > momento
    ));
    let reversao = null;
    if (!existePosterior && movimentacao.tipo === "transferencia_lote") {
      reversao = { lote_atual_id: movimentacao.lote_origem_id || null };
    }
    if (!existePosterior && movimentacao.tipo === "transferencia_local") {
      reversao = { local_atual_id: movimentacao.local_origem_id || null };
    }
    if (reversao) await atualizarAnimal(movimentacao.animal_id, reversao);
  }

  async function atualizarMovimentacao(movimentacao, mudancas) {
    const atualizado = await salvarPendenteLocal("movimentacoes", {
      ...movimentacao, ...mudancas, client_uuid: movimentacao.client_uuid || gerarIdLocal(),
    });
    setMovimentacoes((prev) => prev.map((item) => (
      (movimentacao.id && item.id === movimentacao.id) || (!movimentacao.id && item.client_uuid === movimentacao.client_uuid)
        ? atualizado
        : item
    )));
    if (mudancas.lote_destino_id !== undefined || mudancas.local_destino_id !== undefined) {
      const patch = {};
      if (mudancas.lote_destino_id !== undefined) patch.lote_atual_id = mudancas.lote_destino_id;
      if (mudancas.local_destino_id !== undefined) patch.local_atual_id = mudancas.local_destino_id;
      if (movimentacao.id) await atualizarAnimal(movimentacao.animal_id, patch);
      else setAnimais((prev) => prev.map((animal) => animal.id === movimentacao.animal_id ? { ...animal, ...patch } : animal));
    }
    return atualizado;
  }

  async function registrarProcedimento(animalId, dados) {
    const registro = await salvarPendenteLocal("procedimentos", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      ...dados,
    });
    setProcedimentos((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function registrarProcedimentosEmLote(animaisIds, dados, loteId) {
    const grupoLancamento = gerarIdLocal().replace("loc_", "grupo_");
    const registros = await Promise.all(animaisIds.map((animalId) => (
      salvarPendenteLocal("procedimentos", {
        client_uuid: gerarIdLocal(),
        animal_id: animalId,
        consultor_id: consultorId,
        fazenda_id: fazendaId,
        grupo_lancamento: grupoLancamento,
        lote_lancamento_id: loteId,
        ...dados,
      })
    )));
    setProcedimentos((prev) => [...registros, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registros;
  }

  async function excluirProcedimentosEmGrupo(grupoLancamento) {
    const registros = procedimentos.filter((item) => item.grupo_lancamento === grupoLancamento);
    await Promise.all(registros.filter((item) => item.id).map((item) => enfileirarDelete("rebanho_procedimentos_sanitarios", item.id)));
    await Promise.all(registros.map((item) => excluirRegistroLocal("procedimentos", item.client_uuid)));
    await Promise.all(registros.filter((item) => item.id).map((item) => excluirRegistroLocal("procedimentos_cache", item.id)));
    setProcedimentos((prev) => prev.filter((item) => item.grupo_lancamento !== grupoLancamento));
  }

  async function excluirProcedimento(procedimento) {
    if (procedimento.id) await enfileirarDelete("rebanho_procedimentos_sanitarios", procedimento.id);
    await excluirRegistroLocal("procedimentos", procedimento.client_uuid);
    if (procedimento.id) await excluirRegistroLocal("procedimentos_cache", procedimento.id);
    setProcedimentos((prev) => prev.filter((item) => (
      procedimento.id ? item.id !== procedimento.id : item.client_uuid !== procedimento.client_uuid
    )));
  }

  async function atualizarProcedimento(procedimento, mudancas) {
    const atualizado = await salvarPendenteLocal("procedimentos", {
      ...procedimento, ...mudancas, client_uuid: procedimento.client_uuid || gerarIdLocal(),
    });
    setProcedimentos((prev) => prev.map((item) => (
      (procedimento.id && item.id === procedimento.id) || (!procedimento.id && item.client_uuid === procedimento.client_uuid)
        ? atualizado
        : item
    )));
    return atualizado;
  }

  async function atualizarProcedimentosEmGrupo(grupoLancamento, mudancas) {
    const registros = procedimentos.filter((item) => item.grupo_lancamento === grupoLancamento);
    const atualizadosLocais = await Promise.all(registros.map((item) => salvarPendenteLocal("procedimentos", {
      ...item, ...mudancas, client_uuid: item.client_uuid || gerarIdLocal(),
    })));
    const porChave = new Map(atualizadosLocais.map((item) => [item.id || item.client_uuid, item]));
    setProcedimentos((prev) => prev.map((item) => porChave.get(item.id || item.client_uuid) || item));
    sincronizarQuandoPossivel();
  }

  return {
    carregando,
    animais,
    locais,
    lotes,
    fornecedores,
    medicamentos,
    movimentacoes,
    pesagens,
    procedimentos,
    cochos,
    abastecimentos,
    mapaFazenda,
    recarregar: carregarTudo,
    criarAnimal,
    criarAnimaisEmLote,
    atualizarAnimal,
    excluirAnimal,
    criarLocal,
    atualizarLocal,
    excluirLocal,
    criarLote,
    atualizarLote,
    excluirLote,
    criarFornecedor,
    criarMedicamento,
    criarCocho,
    atualizarCocho,
    excluirCocho,
    registrarAbastecimento,
    salvarMapaFazenda,
    registrarPesagem,
    atualizarPesagem,
    excluirPesagem,
    registrarMovimentacao,
    registrarMovimentacoesEmLote,
    atualizarMovimentacao,
    excluirMovimentacao,
    registrarProcedimento,
    registrarProcedimentosEmLote,
    atualizarProcedimento,
    atualizarProcedimentosEmGrupo,
    excluirProcedimento,
    excluirProcedimentosEmGrupo,
  };
}
