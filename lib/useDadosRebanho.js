"use client";

// ============================================================
// HOOK CENTRAL DE DADOS — mesmo espírito do useDadosConfinamento.js
// (Confinamento-main): carrega tudo do cliente/fazenda atual e
// expõe as mutações usadas pelas telas.
//
// Cadastros de apoio (animais, locais, lotes, fornecedores,
// medicamentos) exigem conexão — são feitos com calma, geralmente
// com sinal. Pesagens, movimentações e procedimentos sanitários são
// offline-first (lib/db.js + lib/sync.js): sempre gravados local
// primeiro, sincronizados quando dá.
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { salvarPendenteLocal, salvarCacheLocal, listarCacheLocal, listarTodosLocal, gerarIdLocal, excluirRegistroLocal } from "./db";
import { sincronizarTudoPendente } from "./sync";

export function useDadosRebanho(consultorId, clienteId, fazendaId) {
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

  const carregarTudo = useCallback(async () => {
    if (!clienteId || !fazendaId) return;
    // Só desmonta as telas no primeiro carregamento. Atualizações em
    // segundo plano preservam formulários e o fluxo contínuo no curral.
    if (!carregouUmaVez.current) setCarregando(true);
    try {
      const [{ data: a }, { data: l }, { data: lt }, { data: f }, { data: m }, { data: c }, { data: ab }, { data: mapa }] = await Promise.all([
        supabase.from("rebanho_animais").select("*").eq("fazenda_id", fazendaId).order("criado_em", { ascending: false }),
        supabase.from("rebanho_locais").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_lotes").select("*").eq("fazenda_id", fazendaId).order("criado_em", { ascending: false }),
        supabase.from("rebanho_fornecedores").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_medicamentos").select("*").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("rebanho_cochos").select("*").eq("fazenda_id", fazendaId).eq("ativo", true).order("nome"),
        supabase.from("rebanho_abastecimentos_cochos").select("*").eq("fazenda_id", fazendaId).order("data_abastecimento", { ascending: false }).limit(300),
        supabase.from("rebanho_mapas_fazenda").select("*").eq("fazenda_id", fazendaId).maybeSingle(),
      ]);
      const listaAnimais = a || [];
      setAnimais(listaAnimais);
      setLocais(l || []);
      setLotes(lt || []);
      setFornecedores(f || []);
      setMedicamentos(m || []);
      setCochos(c || []);
      const abastecimentosLocais = await listarTodosLocal("abastecimentos");
      const pendentesAbastecimento = abastecimentosLocais.filter((item) => (
        item.fazenda_id === fazendaId &&
        item.sincronizado === false &&
        !(ab || []).some((servidor) => servidor.client_uuid === item.client_uuid)
      ));
      setAbastecimentos([...pendentesAbastecimento, ...(ab || [])]);
      setMapaFazenda(mapa || null);
      await salvarCacheLocal("animais", listaAnimais);
      await salvarCacheLocal("locais", l || []);
      await salvarCacheLocal("lotes", lt || []);
      await salvarCacheLocal("cochos", c || []);
      if (mapa) await salvarCacheLocal("mapas", [mapa]);

      const idsAnimais = listaAnimais.map((x) => x.id);
      if (idsAnimais.length > 0) {
        const [{ data: mv }, { data: p }, { data: pr }] = await Promise.all([
          supabase.from("rebanho_movimentacoes").select("*").in("animal_id", idsAnimais).order("data", { ascending: false }),
          supabase.from("rebanho_pesagens").select("*").in("animal_id", idsAnimais).order("data", { ascending: false }),
          supabase.from("rebanho_procedimentos_sanitarios").select("*").in("animal_id", idsAnimais).order("data_aplicacao", { ascending: false }),
        ]);
        setMovimentacoes(mv || []);
        setPesagens(p || []);
        setProcedimentos(pr || []);
      } else {
        setMovimentacoes([]);
        setPesagens([]);
        setProcedimentos([]);
      }
    } catch (err) {
      // sem sinal: cai pro cache local (só leitura) salvo na última vez
      // que o app esteve online.
      const [a, l, lt, c, ab, mapas] = await Promise.all([
        listarCacheLocal("animais"),
        listarCacheLocal("locais"),
        listarCacheLocal("lotes"),
        listarCacheLocal("cochos"),
        listarTodosLocal("abastecimentos"),
        listarCacheLocal("mapas"),
      ]);
      setAnimais(a.filter((item) => item.fazenda_id === fazendaId));
      setLocais(l.filter((item) => item.fazenda_id === fazendaId));
      setLotes(lt.filter((item) => item.fazenda_id === fazendaId));
      setCochos(c.filter((item) => item.fazenda_id === fazendaId));
      setAbastecimentos(ab.filter((item) => item.fazenda_id === fazendaId));
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

  // ---------- Cadastros de apoio (exigem conexão) ----------
  async function criarAnimal(dados) {
    const { data, error } = await supabase
      .from("rebanho_animais")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId })
      .select()
      .single();
    if (error) throw error;
    setAnimais((prev) => [data, ...prev]);
    return data;
  }

  async function atualizarAnimal(id, mudancas) {
    const { data, error } = await supabase
      .from("rebanho_animais")
      .update({ ...mudancas, atualizado_em: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    setAnimais((prev) => prev.map((a) => (a.id === id ? data : a)));
    return data;
  }

  async function excluirAnimal(id) {
    const { error } = await supabase.from("rebanho_animais").delete().eq("id", id);
    if (error) throw error;
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
    const payload = listaDados.map((d) => ({ ...d, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId }));
    const { data, error } = await supabase.from("rebanho_animais").insert(payload).select();
    if (error) throw error;
    setAnimais((prev) => [...data, ...prev]);
    return data;
  }

  async function criarLocal(dados) {
    const { data, error } = await supabase
      .from("rebanho_locais")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId })
      .select()
      .single();
    if (error) throw error;
    setLocais((prev) => [...prev, data]);
    return data;
  }

  async function atualizarLocal(id, mudancas) {
    const { data, error } = await supabase.from("rebanho_locais").update(mudancas).eq("id", id).select().single();
    if (error) throw error;
    setLocais((prev) => prev.map((local) => local.id === id ? data : local));
    return data;
  }

  async function excluirLocal(id) {
    const { error } = await supabase.from("rebanho_locais").delete().eq("id", id);
    if (error) throw error;
    setLocais((prev) => prev.filter((local) => local.id !== id));
    setLotes((prev) => prev.map((lote) => lote.local_id === id ? { ...lote, local_id: null } : lote));
    setAnimais((prev) => prev.map((animal) => animal.local_atual_id === id ? { ...animal, local_atual_id: null } : animal));
  }

  async function criarLote(dados) {
    const { data, error } = await supabase
      .from("rebanho_lotes")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId })
      .select()
      .single();
    if (error) throw error;
    setLotes((prev) => [data, ...prev]);
    return data;
  }

  async function atualizarLote(id, mudancas) {
    const { data, error } = await supabase.from("rebanho_lotes").update(mudancas).eq("id", id).select().single();
    if (error) throw error;
    setLotes((prev) => prev.map((lote) => lote.id === id ? data : lote));
    return data;
  }

  async function excluirLote(id) {
    const { error } = await supabase.from("rebanho_lotes").delete().eq("id", id);
    if (error) throw error;
    setLotes((prev) => prev.filter((lote) => lote.id !== id));
    setAnimais((prev) => prev.map((animal) => (
      animal.lote_atual_id === id ? { ...animal, lote_atual_id: null } : animal
    )));
  }

  async function criarFornecedor(dados) {
    const { data, error } = await supabase
      .from("rebanho_fornecedores")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId })
      .select()
      .single();
    if (error) throw error;
    setFornecedores((prev) => [...prev, data]);
    return data;
  }

  async function criarMedicamento(dados) {
    const { data, error } = await supabase
      .from("rebanho_medicamentos")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId })
      .select()
      .single();
    if (error) throw error;
    setMedicamentos((prev) => [...prev, data]);
    return data;
  }

  async function criarCocho(dados) {
    const { data, error } = await supabase
      .from("rebanho_cochos")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId, fazenda_id: fazendaId })
      .select()
      .single();
    if (error) throw error;
    setCochos((prev) => [...prev, data]);
    await salvarCacheLocal("cochos", [...cochos, data]);
    return data;
  }

  async function atualizarCocho(id, dados) {
    const { data, error } = await supabase
      .from("rebanho_cochos")
      .update(dados)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    const atualizados = cochos.map((item) => item.id === id ? data : item);
    setCochos(atualizados);
    await salvarCacheLocal("cochos", atualizados);
    return data;
  }

  async function excluirCocho(id) {
    const { error } = await supabase.from("rebanho_cochos").update({ ativo: false }).eq("id", id);
    if (error) throw error;
    setCochos((prev) => prev.filter((item) => item.id !== id));
  }

  async function registrarAbastecimento(cocho, dados) {
    const { data: sessao } = await supabase.auth.getSession();
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
      usuario_id: sessao.session.user.id,
      observacoes: dados.observacoes || null,
    });
    setAbastecimentos((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function salvarMapaFazenda({ geojson, nomeArquivo, origem, centroLat, centroLng }) {
    const payload = {
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
    const { data, error } = await supabase
      .from("rebanho_mapas_fazenda")
      .upsert(payload, { onConflict: "fazenda_id" })
      .select()
      .single();
    if (error) throw error;
    setMapaFazenda(data);
    await salvarCacheLocal("mapas", [data]);
    return data;
  }

  // ---------- Offline-first: pesagens, movimentações, procedimentos ----------
  async function sincronizarAgora() {
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
    if (pesagem.id) {
      const { error } = await supabase.from("rebanho_pesagens").delete().eq("id", pesagem.id);
      if (error) throw error;
    }
    await excluirRegistroLocal("pesagens", pesagem.client_uuid);
    setPesagens((prev) => prev.filter((item) => (
      pesagem.id ? item.id !== pesagem.id : item.client_uuid !== pesagem.client_uuid
    )));
  }

  async function atualizarPesagem(pesagem, mudancas) {
    let atualizado;
    if (pesagem.id) {
      const { data, error } = await supabase.from("rebanho_pesagens").update(mudancas).eq("id", pesagem.id).select().single();
      if (error) throw error;
      atualizado = data;
    } else {
      atualizado = await salvarPendenteLocal("pesagens", { ...pesagem, ...mudancas });
    }
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
        if (dados.tipo === "saida" || dados.tipo === "morte" || dados.tipo === "venda") {
          patch.situacao = dados.tipo === "venda" ? "vendido" : dados.tipo === "morte" ? "morto" : "transferido";
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
      if (movimento.tipo === "saida" || movimento.tipo === "morte" || movimento.tipo === "venda") {
        patch.situacao = movimento.tipo === "venda" ? "vendido" : movimento.tipo === "morte" ? "morto" : "transferido";
      }
      return { ...animal, ...patch };
    });
    setAnimais(animaisAtualizados);
    await salvarCacheLocal("animais", animaisAtualizados);
    sincronizarAgora().then(carregarTudo);
    return registros;
  }

  async function excluirMovimentacao(movimentacao) {
    if (movimentacao.id) {
      const { error } = await supabase.from("rebanho_movimentacoes").delete().eq("id", movimentacao.id);
      if (error) throw error;
    }
    await excluirRegistroLocal("movimentacoes", movimentacao.client_uuid);
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
    if (reversao && movimentacao.id) {
      await atualizarAnimal(movimentacao.animal_id, reversao);
    } else if (reversao) {
      setAnimais((prev) => prev.map((animal) => (
        animal.id === movimentacao.animal_id ? { ...animal, ...reversao } : animal
      )));
    }
  }

  async function atualizarMovimentacao(movimentacao, mudancas) {
    let atualizado;
    if (movimentacao.id) {
      const { data, error } = await supabase.from("rebanho_movimentacoes").update(mudancas).eq("id", movimentacao.id).select().single();
      if (error) throw error;
      atualizado = data;
    } else {
      atualizado = await salvarPendenteLocal("movimentacoes", { ...movimentacao, ...mudancas });
    }
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
    const possuiSincronizados = registros.some((item) => item.id);
    if (possuiSincronizados) {
      const { error } = await supabase
        .from("rebanho_procedimentos_sanitarios")
        .delete()
        .eq("grupo_lancamento", grupoLancamento);
      if (error) throw error;
    }
    await Promise.all(registros.map((item) => excluirRegistroLocal("procedimentos", item.client_uuid)));
    setProcedimentos((prev) => prev.filter((item) => item.grupo_lancamento !== grupoLancamento));
  }

  async function excluirProcedimento(procedimento) {
    if (procedimento.id) {
      const { error } = await supabase.from("rebanho_procedimentos_sanitarios").delete().eq("id", procedimento.id);
      if (error) throw error;
    }
    await excluirRegistroLocal("procedimentos", procedimento.client_uuid);
    setProcedimentos((prev) => prev.filter((item) => (
      procedimento.id ? item.id !== procedimento.id : item.client_uuid !== procedimento.client_uuid
    )));
  }

  async function atualizarProcedimento(procedimento, mudancas) {
    let atualizado;
    if (procedimento.id) {
      const { data, error } = await supabase.from("rebanho_procedimentos_sanitarios").update(mudancas).eq("id", procedimento.id).select().single();
      if (error) throw error;
      atualizado = data;
    } else {
      atualizado = await salvarPendenteLocal("procedimentos", { ...procedimento, ...mudancas });
    }
    setProcedimentos((prev) => prev.map((item) => (
      (procedimento.id && item.id === procedimento.id) || (!procedimento.id && item.client_uuid === procedimento.client_uuid)
        ? atualizado
        : item
    )));
    return atualizado;
  }

  async function atualizarProcedimentosEmGrupo(grupoLancamento, mudancas) {
    const registros = procedimentos.filter((item) => item.grupo_lancamento === grupoLancamento);
    if (registros.some((item) => item.id)) {
      const { data, error } = await supabase
        .from("rebanho_procedimentos_sanitarios")
        .update(mudancas)
        .eq("grupo_lancamento", grupoLancamento)
        .select();
      if (error) throw error;
      const porId = new Map((data || []).map((item) => [item.id, item]));
      setProcedimentos((prev) => prev.map((item) => porId.get(item.id) || item));
    }
    const pendentes = registros.filter((item) => !item.id);
    const atualizadosLocais = await Promise.all(pendentes.map((item) => salvarPendenteLocal("procedimentos", { ...item, ...mudancas })));
    if (atualizadosLocais.length) {
      const porChave = new Map(atualizadosLocais.map((item) => [item.client_uuid, item]));
      setProcedimentos((prev) => prev.map((item) => porChave.get(item.client_uuid) || item));
    }
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
