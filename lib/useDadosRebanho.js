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
  const [touros, setTouros] = useState([]);
  const [protocolosIatf, setProtocolosIatf] = useState([]);
  const [protocoloAnimais, setProtocoloAnimais] = useState([]);
  const [diagnosticosGestacao, setDiagnosticosGestacao] = useState([]);
  const [partos, setPartos] = useState([]);
  const [desmames, setDesmames] = useState([]);
  const [periodosRepasse, setPeriodosRepasse] = useState([]);
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
      const [a, { data: l, error: erroLocais }, { data: lt, error: erroLotes }, { data: f, error: erroFornecedores }, { data: m, error: erroMedicamentos }, { data: c, error: erroCochos }, { data: ab, error: erroAbastecimentos }, { data: mapa, error: erroMapa }, { data: tr, error: erroTouros }, { data: pi, error: erroProtocolosIatf }, { data: rp, error: erroRepasse }] = await Promise.all([
        buscarTodosPorFazenda("rebanho_animais", fazendaId, "criado_em"),
        supabase.from("rebanho_locais").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_lotes").select("*").eq("fazenda_id", fazendaId).order("criado_em", { ascending: false }),
        supabase.from("rebanho_fornecedores").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_medicamentos").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_cochos").select("*").eq("fazenda_id", fazendaId).eq("ativo", true).order("nome"),
        supabase.from("rebanho_abastecimentos_cochos").select("*").eq("fazenda_id", fazendaId).order("data_abastecimento", { ascending: false }).limit(300),
        supabase.from("rebanho_mapas_fazenda").select("*").eq("fazenda_id", fazendaId).maybeSingle(),
        supabase.from("rebanho_touros").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_protocolos_iatf").select("*").eq("fazenda_id", fazendaId).order("data_d0", { ascending: false }),
        supabase.from("rebanho_periodos_repasse").select("*").eq("fazenda_id", fazendaId).order("data_inicio", { ascending: false }),
      ]);
      const erroApoio = erroLocais || erroLotes || erroFornecedores || erroMedicamentos || erroCochos || erroAbastecimentos || erroMapa || erroTouros || erroProtocolosIatf || erroRepasse;
      if (erroApoio) throw erroApoio;

      const operacoes = await listarOperacoesLocal();
      const listaAnimais = aplicarOperacoesPendentes(a, operacoes, "rebanho_animais", fazendaId);
      const listaLocais = aplicarOperacoesPendentes(l || [], operacoes, "rebanho_locais", fazendaId);
      const listaLotes = aplicarOperacoesPendentes(lt || [], operacoes, "rebanho_lotes", fazendaId);
      const listaFornecedores = aplicarOperacoesPendentes(f || [], operacoes, "rebanho_fornecedores", fazendaId);
      const listaMedicamentos = aplicarOperacoesPendentes(m || [], operacoes, "rebanho_medicamentos", fazendaId);
      const listaCochos = aplicarOperacoesPendentes(c || [], operacoes, "rebanho_cochos", fazendaId).filter((item) => item.ativo !== false);
      const listaMapa = aplicarOperacoesPendentes(mapa ? [mapa] : [], operacoes, "rebanho_mapas_fazenda", fazendaId)[0] || null;
      const listaTouros = aplicarOperacoesPendentes(tr || [], operacoes, "rebanho_touros", fazendaId);
      const listaProtocolosIatf = aplicarOperacoesPendentes(pi || [], operacoes, "rebanho_protocolos_iatf", fazendaId);
      const listaRepasse = aplicarOperacoesPendentes(rp || [], operacoes, "rebanho_periodos_repasse", fazendaId);
      setAnimais(listaAnimais);
      setLocais(listaLocais);
      setLotes(listaLotes);
      setFornecedores(listaFornecedores);
      setMedicamentos(listaMedicamentos);
      setCochos(listaCochos);
      setTouros(listaTouros);
      setProtocolosIatf(listaProtocolosIatf);
      setPeriodosRepasse(listaRepasse);
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
      let listaProtocoloAnimais = [];
      let listaDiagnosticosGestacao = [];
      let listaPartos = [];
      let listaDesmames = [];
      if (listaAnimais.length > 0) {
        const [mv, p, pr, pa, dg, pt, dm] = await Promise.all([
          buscarTodosPorFazenda("rebanho_movimentacoes", fazendaId, "data"),
          buscarTodosPorFazenda("rebanho_pesagens", fazendaId, "data"),
          buscarTodosPorFazenda("rebanho_procedimentos_sanitarios", fazendaId, "data_aplicacao"),
          buscarTodosPorFazenda("rebanho_protocolo_animais", fazendaId, "data_d0"),
          buscarTodosPorFazenda("rebanho_diagnosticos_gestacao", fazendaId, "data_dg"),
          buscarTodosPorFazenda("rebanho_partos", fazendaId, "data_parto"),
          buscarTodosPorFazenda("rebanho_desmames", fazendaId, "data_desmame"),
        ]);
        const [mvLocais, pLocais, prLocais, paLocais, dgLocais, ptLocais, dmLocais] = await Promise.all([
          listarTodosLocal("movimentacoes"),
          listarTodosLocal("pesagens"),
          listarTodosLocal("procedimentos"),
          listarTodosLocal("protocolo_animais"),
          listarTodosLocal("diagnosticos_gestacao"),
          listarTodosLocal("partos"),
          listarTodosLocal("desmames"),
        ]);
        const somentePendentes = (locais, servidor) => locais.filter((item) => (
          item.fazenda_id === fazendaId && item.sincronizado === false &&
          !servidor.some((online) => online.id === item.id || (online.client_uuid && online.client_uuid === item.client_uuid))
        ));
        listaMovimentacoes = [...somentePendentes(mvLocais, mv), ...mv];
        listaPesagens = [...somentePendentes(pLocais, p), ...p];
        listaProcedimentos = [...somentePendentes(prLocais, pr), ...pr];
        listaProtocoloAnimais = [...somentePendentes(paLocais, pa), ...pa];
        listaDiagnosticosGestacao = [...somentePendentes(dgLocais, dg), ...dg];
        listaPartos = [...somentePendentes(ptLocais, pt), ...pt];
        listaDesmames = [...somentePendentes(dmLocais, dm), ...dm];
      }
      setMovimentacoes(listaMovimentacoes);
      setPesagens(listaPesagens);
      setProcedimentos(listaProcedimentos);
      setProtocoloAnimais(listaProtocoloAnimais);
      setDiagnosticosGestacao(listaDiagnosticosGestacao);
      setPartos(listaPartos);
      setDesmames(listaDesmames);

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
        salvarCacheFazendaLocal("touros", fazendaId, listaTouros),
        salvarCacheFazendaLocal("protocolos_iatf", fazendaId, listaProtocolosIatf),
        salvarCacheFazendaLocal("periodos_repasse", fazendaId, listaRepasse),
        salvarCacheFazendaLocal("protocolo_animais_cache", fazendaId, listaProtocoloAnimais.filter((item) => item.id)),
        salvarCacheFazendaLocal("diagnosticos_gestacao_cache", fazendaId, listaDiagnosticosGestacao.filter((item) => item.id)),
        salvarCacheFazendaLocal("partos_cache", fazendaId, listaPartos.filter((item) => item.id)),
        salvarCacheFazendaLocal("desmames_cache", fazendaId, listaDesmames.filter((item) => item.id)),
      ]).catch((erroCache) => console.warn("Não foi possível atualizar todo o cache offline:", erroCache));
    } catch (err) {
      // Sem sinal: usa o cache local completo. As alterações continuam sendo
      // registradas no aparelho e entram na fila para sincronizar depois.
      const [a, l, lt, f, m, c, mvCache, pCache, prCache, abCache, mvLocais, pLocais, prLocais, abLocais, mapas, tr, pi, rp, paCache, dgCache, ptCache, dmCache, paLocais, dgLocais, ptLocais, dmLocais] = await Promise.all([
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
        listarCacheLocal("touros"),
        listarCacheLocal("protocolos_iatf"),
        listarCacheLocal("periodos_repasse"),
        listarCacheLocal("protocolo_animais_cache"),
        listarCacheLocal("diagnosticos_gestacao_cache"),
        listarCacheLocal("partos_cache"),
        listarCacheLocal("desmames_cache"),
        listarTodosLocal("protocolo_animais"),
        listarTodosLocal("diagnosticos_gestacao"),
        listarTodosLocal("partos"),
        listarTodosLocal("desmames"),
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
      setTouros(tr.filter((item) => item.fazenda_id === fazendaId));
      setProtocolosIatf(pi.filter((item) => item.fazenda_id === fazendaId));
      setPeriodosRepasse(rp.filter((item) => item.fazenda_id === fazendaId));
      setProtocoloAnimais(combinarOffline(paCache, paLocais));
      setDiagnosticosGestacao(combinarOffline(dgCache, dgLocais));
      setPartos(combinarOffline(ptCache, ptLocais));
      setDesmames(combinarOffline(dmCache, dmLocais));
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

  // ---------- Módulo Cria: touros, protocolo IATF, DG, partos, desmames, repasse ----------
  async function criarTouro(dados) {
    const agora = new Date().toISOString();
    const registro = {
      id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId,
      ativo: dados.ativo ?? true, criado_em: agora, atualizado_em: agora,
    };
    await salvarCacheLocal("touros", [registro]);
    setTouros((prev) => [...prev, registro]);
    return enfileirarInsert("rebanho_touros", registro);
  }

  async function atualizarTouro(id, mudancas) {
    const atual = touros.find((item) => item.id === id);
    if (!atual) throw new Error("Touro não encontrado.");
    const registro = { ...atual, ...mudancas, atualizado_em: new Date().toISOString() };
    await salvarCacheLocal("touros", [registro]);
    setTouros((prev) => prev.map((item) => (item.id === id ? registro : item)));
    return enfileirarUpsert("rebanho_touros", registro);
  }

  async function excluirTouro(id) {
    const atual = touros.find((item) => item.id === id);
    if (atual) await enfileirarUpsert("rebanho_touros", { ...atual, ativo: false, atualizado_em: new Date().toISOString() });
    await excluirRegistroLocal("touros", id);
    setTouros((prev) => prev.filter((item) => item.id !== id));
  }

  async function criarProtocoloIatf(dados) {
    const agora = new Date().toISOString();
    const registro = {
      id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId,
      status: dados.status || "em_andamento", criado_em: agora, atualizado_em: agora,
    };
    await salvarCacheLocal("protocolos_iatf", [registro]);
    setProtocolosIatf((prev) => [registro, ...prev]);
    await enfileirarInsert("rebanho_protocolos_iatf", registro);
    return registro;
  }

  async function atualizarProtocoloIatf(id, mudancas) {
    const atual = protocolosIatf.find((item) => item.id === id);
    if (!atual) throw new Error("Protocolo não encontrado.");
    const registro = { ...atual, ...mudancas, atualizado_em: new Date().toISOString() };
    await salvarCacheLocal("protocolos_iatf", [registro]);
    setProtocolosIatf((prev) => prev.map((item) => (item.id === id ? registro : item)));
    return enfileirarUpsert("rebanho_protocolos_iatf", registro);
  }

  async function excluirProtocoloIatf(id) {
    await enfileirarDelete("rebanho_protocolos_iatf", id);
    await excluirRegistroLocal("protocolos_iatf", id);
    const dependentes = protocoloAnimais.filter((item) => item.protocolo_id === id);
    await Promise.all(dependentes.filter((item) => item.id).map((item) => enfileirarDelete("rebanho_protocolo_animais", item.id)));
    await Promise.all(dependentes.map((item) => excluirRegistroLocal("protocolo_animais", item.client_uuid)));
    setProtocolosIatf((prev) => prev.filter((item) => item.id !== id));
    setProtocoloAnimais((prev) => prev.filter((item) => item.protocolo_id !== id));
  }

  async function adicionarAnimalAoProtocolo(protocoloId, animalId, dados = {}) {
    const protocolo = protocolosIatf.find((item) => item.id === protocoloId);
    const registro = await salvarPendenteLocal("protocolo_animais", {
      client_uuid: gerarIdLocal(),
      protocolo_id: protocoloId,
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      data_d0: dados.data_d0 || protocolo?.data_d0,
      status: "aguardando_retirada",
      ...dados,
    });
    setProtocoloAnimais((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function adicionarAnimaisAoProtocoloEmLote(protocoloId, animaisIds, dadosComuns = {}) {
    const protocolo = protocolosIatf.find((item) => item.id === protocoloId);
    const registros = await Promise.all(animaisIds.map((animalId) => (
      salvarPendenteLocal("protocolo_animais", {
        client_uuid: gerarIdLocal(),
        protocolo_id: protocoloId,
        animal_id: animalId,
        consultor_id: consultorId,
        fazenda_id: fazendaId,
        data_d0: dadosComuns.data_d0 || protocolo?.data_d0,
        status: "aguardando_retirada",
        ...dadosComuns,
      })
    )));
    setProtocoloAnimais((prev) => [...registros, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registros;
  }

  async function atualizarEtapaProtocolo(protocoloAnimal, mudancas) {
    const atualizado = await salvarPendenteLocal("protocolo_animais", {
      ...protocoloAnimal, ...mudancas, client_uuid: protocoloAnimal.client_uuid || gerarIdLocal(),
    });
    setProtocoloAnimais((prev) => prev.map((item) => (
      (protocoloAnimal.id && item.id === protocoloAnimal.id) || (!protocoloAnimal.id && item.client_uuid === protocoloAnimal.client_uuid)
        ? atualizado
        : item
    )));
    sincronizarAgora().then(carregarTudo);
    return atualizado;
  }

  async function excluirAnimalDoProtocolo(protocoloAnimal) {
    if (protocoloAnimal.id) await enfileirarDelete("rebanho_protocolo_animais", protocoloAnimal.id);
    await excluirRegistroLocal("protocolo_animais", protocoloAnimal.client_uuid);
    if (protocoloAnimal.id) await excluirRegistroLocal("protocolo_animais_cache", protocoloAnimal.id);
    setProtocoloAnimais((prev) => prev.filter((item) => (
      protocoloAnimal.id ? item.id !== protocoloAnimal.id : item.client_uuid !== protocoloAnimal.client_uuid
    )));
  }

  async function registrarDiagnosticoGestacao(animalId, dados) {
    const registro = await salvarPendenteLocal("diagnosticos_gestacao", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      ...dados,
    });
    setDiagnosticosGestacao((prev) => [registro, ...prev]);
    // DG confirma "inseminada" -> encerra a etapa do protocolo, se vier daí.
    if (dados.protocolo_animal_id) {
      const etapa = protocoloAnimais.find((item) => item.id === dados.protocolo_animal_id);
      if (etapa && etapa.status !== "inseminada") await atualizarEtapaProtocolo(etapa, { status: "inseminada" });
    }
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function atualizarDiagnostico(diagnostico, mudancas) {
    const atualizado = await salvarPendenteLocal("diagnosticos_gestacao", {
      ...diagnostico, ...mudancas, client_uuid: diagnostico.client_uuid || gerarIdLocal(),
    });
    setDiagnosticosGestacao((prev) => prev.map((item) => (
      (diagnostico.id && item.id === diagnostico.id) || (!diagnostico.id && item.client_uuid === diagnostico.client_uuid)
        ? atualizado
        : item
    )));
    return atualizado;
  }

  async function excluirDiagnostico(diagnostico) {
    if (diagnostico.id) await enfileirarDelete("rebanho_diagnosticos_gestacao", diagnostico.id);
    await excluirRegistroLocal("diagnosticos_gestacao", diagnostico.client_uuid);
    if (diagnostico.id) await excluirRegistroLocal("diagnosticos_gestacao_cache", diagnostico.id);
    setDiagnosticosGestacao((prev) => prev.filter((item) => (
      diagnostico.id ? item.id !== diagnostico.id : item.client_uuid !== diagnostico.client_uuid
    )));
  }

  // registrarParto: se `criarCriaAutomaticamente` vier true, cadastra a
  // cria como novo animal (mae_id/touro_id/data_nascimento/peso_entrada) e
  // promove a mãe pra categoria "Vaca" — resultado direto de um evento
  // real, sem precisar de confirmação separada.
  async function registrarParto(animalId, dados) {
    const { criarCriaAutomaticamente, dadosCria, ...dadosParto } = dados;
    let criaAnimalId = dadosParto.cria_animal_id || null;

    if (criarCriaAutomaticamente && dadosCria) {
      const mae = animais.find((item) => item.id === animalId);
      const cria = await criarAnimal({
        brinco_atual: dadosCria.brinco_atual,
        brinco_rfid: dadosCria.brinco_rfid || null,
        sexo: dadosParto.sexo_bezerro || null,
        categoria: "Bezerro",
        raca: dadosCria.raca || mae?.raca || null,
        data_nascimento: dadosParto.data_parto,
        peso_nascimento: dadosParto.peso_nascimento_bezerro || null,
        peso_entrada: dadosParto.peso_nascimento_bezerro || null,
        data_entrada: dadosParto.data_parto,
        mae_id: animalId,
        touro_id: dadosParto.touro_id || null,
        local_atual_id: mae?.local_atual_id || null,
        lote_atual_id: mae?.lote_atual_id || null,
        observacoes: dadosCria.observacoes || null,
      });
      criaAnimalId = cria.id;
    }

    const registro = await salvarPendenteLocal("partos", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      ...dadosParto,
      cria_animal_id: criaAnimalId,
    });
    setPartos((prev) => [registro, ...prev]);

    const mae = animais.find((item) => item.id === animalId);
    if (mae && mae.categoria !== "Vaca") await atualizarAnimal(animalId, { categoria: "Vaca" });

    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function atualizarParto(parto, mudancas) {
    const atualizado = await salvarPendenteLocal("partos", {
      ...parto, ...mudancas, client_uuid: parto.client_uuid || gerarIdLocal(),
    });
    setPartos((prev) => prev.map((item) => (
      (parto.id && item.id === parto.id) || (!parto.id && item.client_uuid === parto.client_uuid)
        ? atualizado
        : item
    )));
    return atualizado;
  }

  async function excluirParto(parto) {
    if (parto.id) await enfileirarDelete("rebanho_partos", parto.id);
    await excluirRegistroLocal("partos", parto.client_uuid);
    if (parto.id) await excluirRegistroLocal("partos_cache", parto.id);
    setPartos((prev) => prev.filter((item) => (
      parto.id ? item.id !== parto.id : item.client_uuid !== parto.client_uuid
    )));
  }

  // registrarDesmame: evento inequívoco, então promove a categoria da
  // cria na hora (bezerro -> novilha/boi por sexo), sem precisar de
  // sugestão/confirmação separada como a promoção por idade.
  async function registrarDesmame(animalId, dados) {
    const registro = await salvarPendenteLocal("desmames", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      fazenda_id: fazendaId,
      ...dados,
    });
    setDesmames((prev) => [registro, ...prev]);

    const cria = animais.find((item) => item.id === animalId);
    if (cria && cria.categoria === "Bezerro") {
      const novaCategoria = cria.sexo === "macho" ? "Boi" : "Novilha";
      await atualizarAnimal(animalId, { categoria: novaCategoria });
    }

    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function atualizarDesmame(desmame, mudancas) {
    const atualizado = await salvarPendenteLocal("desmames", {
      ...desmame, ...mudancas, client_uuid: desmame.client_uuid || gerarIdLocal(),
    });
    setDesmames((prev) => prev.map((item) => (
      (desmame.id && item.id === desmame.id) || (!desmame.id && item.client_uuid === desmame.client_uuid)
        ? atualizado
        : item
    )));
    return atualizado;
  }

  async function excluirDesmame(desmame) {
    if (desmame.id) await enfileirarDelete("rebanho_desmames", desmame.id);
    await excluirRegistroLocal("desmames", desmame.client_uuid);
    if (desmame.id) await excluirRegistroLocal("desmames_cache", desmame.id);
    setDesmames((prev) => prev.filter((item) => (
      desmame.id ? item.id !== desmame.id : item.client_uuid !== desmame.client_uuid
    )));
  }

  async function criarPeriodoRepasse(dados) {
    const registro = { id: gerarUuidLocal(), ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId, criado_em: new Date().toISOString() };
    await salvarCacheLocal("periodos_repasse", [registro]);
    setPeriodosRepasse((prev) => [registro, ...prev]);
    return enfileirarInsert("rebanho_periodos_repasse", registro);
  }

  async function atualizarPeriodoRepasse(id, mudancas) {
    const atual = periodosRepasse.find((item) => item.id === id);
    if (!atual) throw new Error("Período de repasse não encontrado.");
    const registro = { ...atual, ...mudancas };
    await salvarCacheLocal("periodos_repasse", [registro]);
    setPeriodosRepasse((prev) => prev.map((item) => (item.id === id ? registro : item)));
    return enfileirarUpsert("rebanho_periodos_repasse", registro);
  }

  async function excluirPeriodoRepasse(id) {
    await enfileirarDelete("rebanho_periodos_repasse", id);
    await excluirRegistroLocal("periodos_repasse", id);
    setPeriodosRepasse((prev) => prev.filter((item) => item.id !== id));
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
    touros,
    protocolosIatf,
    protocoloAnimais,
    diagnosticosGestacao,
    partos,
    desmames,
    periodosRepasse,
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
    criarTouro,
    atualizarTouro,
    excluirTouro,
    criarProtocoloIatf,
    atualizarProtocoloIatf,
    excluirProtocoloIatf,
    adicionarAnimalAoProtocolo,
    adicionarAnimaisAoProtocoloEmLote,
    atualizarEtapaProtocolo,
    excluirAnimalDoProtocolo,
    registrarDiagnosticoGestacao,
    atualizarDiagnostico,
    excluirDiagnostico,
    registrarParto,
    atualizarParto,
    excluirParto,
    registrarDesmame,
    atualizarDesmame,
    excluirDesmame,
    criarPeriodoRepasse,
    atualizarPeriodoRepasse,
    excluirPeriodoRepasse,
  };
}
