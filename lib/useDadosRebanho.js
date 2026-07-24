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
import { salvarPendenteLocal, salvarCacheLocal, listarCacheLocal, gerarIdLocal } from "./db";
import { sincronizarTudoPendente } from "./sync";

export function useDadosRebanho(consultorId, clienteId) {
  const [animais, setAnimais] = useState([]);
  const [locais, setLocais] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [pesagens, setPesagens] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const carregouUmaVez = useRef(false);

  const carregarTudo = useCallback(async () => {
    if (!clienteId) return;
    // Só desmonta as telas no primeiro carregamento. Atualizações em
    // segundo plano preservam formulários e o fluxo contínuo no curral.
    if (!carregouUmaVez.current) setCarregando(true);
    try {
      const [{ data: a }, { data: l }, { data: lt }, { data: f }, { data: m }] = await Promise.all([
        supabase.from("rebanho_animais").select("*").eq("cliente_id", clienteId).order("criado_em", { ascending: false }),
        supabase.from("rebanho_locais").select("*").eq("cliente_id", clienteId).order("nome"),
        supabase.from("rebanho_lotes").select("*").eq("cliente_id", clienteId).order("criado_em", { ascending: false }),
        supabase.from("rebanho_fornecedores").select("*").eq("cliente_id", clienteId).order("nome"),
        supabase.from("rebanho_medicamentos").select("*").eq("cliente_id", clienteId).order("nome"),
      ]);
      const listaAnimais = a || [];
      setAnimais(listaAnimais);
      setLocais(l || []);
      setLotes(lt || []);
      setFornecedores(f || []);
      setMedicamentos(m || []);
      await salvarCacheLocal("animais", listaAnimais);
      await salvarCacheLocal("locais", l || []);
      await salvarCacheLocal("lotes", lt || []);

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
      const [a, l, lt] = await Promise.all([
        listarCacheLocal("animais"),
        listarCacheLocal("locais"),
        listarCacheLocal("lotes"),
      ]);
      setAnimais(a);
      setLocais(l);
      setLotes(lt);
    } finally {
      carregouUmaVez.current = true;
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  // ---------- Cadastros de apoio (exigem conexão) ----------
  async function criarAnimal(dados) {
    const { data, error } = await supabase
      .from("rebanho_animais")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId })
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
    const payload = listaDados.map((d) => ({ ...d, consultor_id: consultorId, cliente_id: clienteId }));
    const { data, error } = await supabase.from("rebanho_animais").insert(payload).select();
    if (error) throw error;
    setAnimais((prev) => [...data, ...prev]);
    return data;
  }

  async function criarLocal(dados) {
    const { data, error } = await supabase
      .from("rebanho_locais")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId })
      .select()
      .single();
    if (error) throw error;
    setLocais((prev) => [...prev, data]);
    return data;
  }

  async function criarLote(dados) {
    const { data, error } = await supabase
      .from("rebanho_lotes")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId })
      .select()
      .single();
    if (error) throw error;
    setLotes((prev) => [data, ...prev]);
    return data;
  }

  async function criarFornecedor(dados) {
    const { data, error } = await supabase
      .from("rebanho_fornecedores")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId })
      .select()
      .single();
    if (error) throw error;
    setFornecedores((prev) => [...prev, data]);
    return data;
  }

  async function criarMedicamento(dados) {
    const { data, error } = await supabase
      .from("rebanho_medicamentos")
      .insert({ ...dados, consultor_id: consultorId, cliente_id: clienteId })
      .select()
      .single();
    if (error) throw error;
    setMedicamentos((prev) => [...prev, data]);
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
      ...dados,
    });
    setPesagens((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
  }

  async function registrarMovimentacao(animalId, dados) {
    const registro = await salvarPendenteLocal("movimentacoes", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      ...dados,
    });
    setMovimentacoes((prev) => [registro, ...prev]);
    // Atualização otimista do animal em memória (o ponteiro real em
    // rebanho_animais só é gravado quando a sincronização rodar).
    setAnimais((prev) =>
      prev.map((a) => {
        if (a.id !== animalId) return a;
        const patch = {};
        if (dados.tipo === "entrada" || dados.tipo === "transferencia_lote") patch.lote_atual_id = dados.lote_destino_id ?? null;
        if (dados.tipo === "entrada" || dados.tipo === "transferencia_local") patch.local_atual_id = dados.local_destino_id ?? null;
        if (dados.tipo === "saida" || dados.tipo === "morte" || dados.tipo === "venda") {
          patch.situacao = dados.tipo === "venda" ? "vendido" : dados.tipo === "morte" ? "morto" : "transferido";
        }
        return { ...a, ...patch };
      })
    );
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
          ...dados,
        })
      )
    );
    setMovimentacoes((prev) => [...registros, ...prev]);
    const ids = new Set(lista.map((item) => item.animalId));
    setAnimais((prev) =>
      prev.map((animal) => (ids.has(animal.id) ? { ...animal, situacao: "vendido" } : animal))
    );
    sincronizarAgora().then(carregarTudo);
    return registros;
  }

  async function registrarProcedimento(animalId, dados) {
    const registro = await salvarPendenteLocal("procedimentos", {
      client_uuid: gerarIdLocal(),
      animal_id: animalId,
      consultor_id: consultorId,
      ...dados,
    });
    setProcedimentos((prev) => [registro, ...prev]);
    sincronizarAgora().then(carregarTudo);
    return registro;
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
    recarregar: carregarTudo,
    criarAnimal,
    criarAnimaisEmLote,
    atualizarAnimal,
    excluirAnimal,
    criarLocal,
    criarLote,
    criarFornecedor,
    criarMedicamento,
    registrarPesagem,
    registrarMovimentacao,
    registrarMovimentacoesEmLote,
    registrarProcedimento,
  };
}
