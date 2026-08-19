"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { Plus, Radio, Syringe, Trash2, Pencil } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, SelectField, InputField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

const TIPOS = { vacina: "Vacinação", vermifugo: "Vermifugação", diagnostico: "Diagnóstico", tratamento: "Tratamento" };

export default function SanidadeTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const [excluindo, setExcluindo] = useState(null);
  const [procedimentoEditando, setProcedimentoEditando] = useState(null);

  const recentes = useMemo(
    () => [...dados.procedimentos].sort((a, b) => (b.data_aplicacao || "").localeCompare(a.data_aplicacao || "")).slice(0, 30),
    [dados.procedimentos]
  );

  if (modo === "novo") {
    return <FormProcedimento dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;
  }
  if (modo === "editar" && procedimentoEditando) {
    return (
      <FormProcedimento
        dados={dados}
        inicial={procedimentoEditando}
        onSalvo={() => { setProcedimentoEditando(null); setModo("lista"); }}
        onCancelar={() => { setProcedimentoEditando(null); setModo("lista"); }}
      />
    );
  }

  async function handleExcluir(procedimento, animal) {
    const grupo = procedimento.grupo_lancamento;
    const itensDoGrupo = grupo
      ? dados.procedimentos.filter((item) => item.grupo_lancamento === grupo)
      : [];
    const lote = dados.lotes.find((item) => item.id === procedimento.lote_lancamento_id);
    const mensagem = grupo
      ? `Este manejo foi lançado para o lote ${lote?.nome || ""} (${itensDoGrupo.length} animais). Excluir o lançamento do lote inteiro?`
      : `Excluir este manejo sanitário do animal ${animal?.brinco_atual || "selecionado"}?`;
    if (!window.confirm(mensagem)) return;

    const chave = grupo || procedimento.id || procedimento.client_uuid;
    setExcluindo(chave);
    try {
      if (grupo) await dados.excluirProcedimentosEmGrupo(grupo);
      else await dados.excluirProcedimento(procedimento);
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir o manejo sanitário.");
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <div>
      <PageHeader title="Sanidade" subtitle="Vacinação, vermifugação, diagnóstico e tratamento." actionLabel="Registrar" onAction={() => setModo("novo")} />
      {recentes.length === 0 && <EmptyHint text="Nenhum procedimento sanitário registrado ainda." />}
      {recentes.map((p) => {
        const animal = dados.animais.find((a) => a.id === p.animal_id);
        const medicamento = dados.medicamentos.find((m) => m.id === p.medicamento_id);
        const emCarencia = p.proxima_aplicacao == null && p.carencia_dias > 0
          ? diasRestantesCarencia(p) > 0
          : false;
        return (
          <div key={p.client_uuid || p.id} style={styles.rowCard}>
            <div style={styles.avatar}><Syringe size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"} · {TIPOS[p.tipo] || p.tipo}</div>
              <div style={styles.listItemSub}>
                {formatDataBR(p.data_aplicacao)}{medicamento ? ` · ${medicamento.nome}` : ""}
                {emCarencia ? ` · carência ${diasRestantesCarencia(p)}d` : ""}
                {p.grupo_lancamento ? ` · lote ${dados.lotes.find((lote) => lote.id === p.lote_lancamento_id)?.nome || "inteiro"}` : ""}
                {!p.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setProcedimentoEditando(p); setModo("editar"); }}
              aria-label={p.grupo_lancamento ? "Editar manejo do lote inteiro" : "Editar manejo sanitário"}
              title={p.grupo_lancamento ? "Editar lote inteiro" : "Editar manejo"}
              style={styles.iconEditBtn}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleExcluir(p, animal)}
              disabled={excluindo === (p.grupo_lancamento || p.id || p.client_uuid)}
              aria-label={p.grupo_lancamento ? "Excluir manejo do lote inteiro" : "Excluir manejo sanitário"}
              title={p.grupo_lancamento ? "Excluir do lote inteiro" : "Excluir manejo"}
              style={{ ...styles.iconDangerBtn, opacity: excluindo === (p.grupo_lancamento || p.id || p.client_uuid) ? 0.5 : 1 }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function diasRestantesCarencia(p) {
  const fim = new Date(p.data_aplicacao + "T00:00:00");
  fim.setDate(fim.getDate() + (p.carencia_dias || 0));
  return Math.round((fim - new Date()) / 86400000);
}

function FormProcedimento({ dados, onSalvo, onCancelar, inicial }) {
  const [alcance, setAlcance] = useState(inicial?.grupo_lancamento ? "lote" : "animal");
  const [animalId, setAnimalId] = useState(inicial?.animal_id || "");
  const [loteId, setLoteId] = useState(inicial?.lote_lancamento_id || "");
  const criarItemVazio = () => ({
    idLocal: crypto.randomUUID(),
    tipo: "vacina",
    medicamentoId: "",
    dose: "",
    carenciaDias: "0",
    novoMedicamento: false,
    nomeNovoMedicamento: "",
  });
  const [itens, setItens] = useState(() => inicial ? [{
    idLocal: crypto.randomUUID(),
    tipo: inicial.tipo || "vacina",
    medicamentoId: inicial.medicamento_id || "",
    dose: inicial.dose || "",
    carenciaDias: String(inicial.carencia_dias ?? 0),
    novoMedicamento: false,
    nomeNovoMedicamento: "",
  }] : [criarItemVazio()]);
  const [dataAplicacao, setDataAplicacao] = useState(inicial?.data_aplicacao || new Date().toISOString().slice(0, 10));
  const [proximaAplicacao, setProximaAplicacao] = useState(inicial?.proxima_aplicacao || "");
  const [observacoes, setObservacoes] = useState(inicial?.observacoes || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback(
    (tag) => {
      const animal = encontrarAnimalPorTag(dados.animais, tag);
      if (animal) setAnimalId(animal.id);
      else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
    },
    [dados.animais]
  );
  const { lendo } = useRfidScanner(aoLerTag, { ativo: alcance === "animal" });

  function atualizarItem(idLocal, mudancas) {
    setItens((atuais) => atuais.map((item) => item.idLocal === idLocal ? { ...item, ...mudancas } : item));
  }

  function handleEscolherMedicamento(idLocal, id) {
    if (id === "__novo__") {
      atualizarItem(idLocal, { novoMedicamento: true, medicamentoId: "", nomeNovoMedicamento: "" });
      return;
    }
    const mudancas = { medicamentoId: id, novoMedicamento: false, nomeNovoMedicamento: "" };
    const med = dados.medicamentos.find((m) => m.id === id);
    if (med?.carencia_padrao_dias != null) mudancas.carenciaDias = String(med.carencia_padrao_dias);
    atualizarItem(idLocal, mudancas);
  }

  function adicionarItem() {
    setItens((atuais) => [...atuais, criarItemVazio()]);
  }

  function removerItem(idLocal) {
    setItens((atuais) => atuais.length === 1 ? atuais : atuais.filter((item) => item.idLocal !== idLocal));
  }

  async function handleSalvar() {
    if (!inicial && alcance === "animal" && !animalId) { setErro("Escolha o animal (ou aponte o bastão RFID)."); return; }
    const animaisDoLote = dados.animais.filter((animal) => animal.lote_atual_id === loteId && animal.situacao === "ativo");
    if (!inicial && alcance === "lote" && !loteId) { setErro("Escolha o lote."); return; }
    if (!inicial && alcance === "lote" && animaisDoLote.length === 0) { setErro("Este lote não possui animais ativos."); return; }
    if (itens.some((item) => item.novoMedicamento && !item.nomeNovoMedicamento.trim())) {
      setErro("Informe o nome de cada novo medicamento ou vermífugo.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      const procedimentos = [];
      for (const item of itens) {
        let medId = item.medicamentoId;
        if (item.novoMedicamento) {
          const criado = await dados.criarMedicamento({
            nome: item.nomeNovoMedicamento.trim(),
            tipo: item.tipo,
            carencia_padrao_dias: Number(item.carenciaDias) || 0,
          });
          medId = criado.id;
        }
        procedimentos.push({
          tipo: item.tipo,
          medicamento_id: medId || null,
          dose: item.dose || null,
          data_aplicacao: dataAplicacao,
          proxima_aplicacao: proximaAplicacao || null,
          carencia_dias: Number(item.carenciaDias) || 0,
          observacoes: observacoes || null,
        });
      }
      if (inicial?.grupo_lancamento) {
        await dados.atualizarProcedimentosEmGrupo(inicial.grupo_lancamento, procedimentos[0]);
      } else if (inicial) {
        await dados.atualizarProcedimento(inicial, procedimentos[0]);
      } else {
        for (const procedimento of procedimentos) {
          if (alcance === "lote") {
            await dados.registrarProcedimentosEmLote(animaisDoLote.map((animal) => animal.id), procedimento, loteId);
          } else {
            await dados.registrarProcedimento(animalId, procedimento);
          }
        }
      }
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={inicial ? "Editar manejo sanitário" : "Registrar procedimento"} onBack={onCancelar} />

      {!inicial && <div style={styles.viewToggle}>
        <button type="button" onClick={() => setAlcance("animal")} style={alcance === "animal" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Um animal</button>
        <button type="button" onClick={() => setAlcance("lote")} style={alcance === "lote" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Lote inteiro</button>
      </div>}

      {alcance === "animal" && (
        <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
          <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
          <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
            {lendo ? "Lendo..." : "Aponte o bastão RFID para identificar o animal"}
          </div>
        </div>
      )}

      <div style={styles.card}>
        {alcance === "animal" ? (
          <SelectField
            label="Animal"
            value={animalId}
            onChange={setAnimalId}
            options={[{ value: "", label: "Selecione..." }, ...dados.animais.map((a) => ({ value: a.id, label: a.brinco_atual }))]}
          />
        ) : (
          <>
            <SelectField
              label="Lote"
              value={loteId}
              onChange={setLoteId}
              options={[{ value: "", label: "Selecione..." }, ...dados.lotes.map((lote) => ({ value: lote.id, label: lote.nome }))]}
            />
            {loteId && (
              <div style={styles.hardwareHint}>
                O manejo será lançado individualmente para {dados.animais.filter((animal) => animal.lote_atual_id === loteId && animal.situacao === "ativo").length} animal(is) ativo(s).
              </div>
            )}
          </>
        )}
        <SectionTitle>{inicial ? "Produto aplicado" : "Medicamentos e vermífugos"}</SectionTitle>
        {itens.map((item, indice) => (
          <div key={item.idLocal} style={{ ...styles.rowCard, display: "block", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <strong>Item {indice + 1}</strong>
              {!inicial && itens.length > 1 && (
                <button type="button" onClick={() => removerItem(item.idLocal)} style={styles.iconDangerBtn} title="Remover item">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <SelectField
              label="Tipo"
              value={item.tipo}
              onChange={(valor) => atualizarItem(item.idLocal, { tipo: valor })}
              options={Object.entries(TIPOS).map(([value, label]) => ({ value, label }))}
            />
            {!item.novoMedicamento ? (
              <SelectField
                label="Medicamento ou vermífugo"
                value={item.medicamentoId}
                onChange={(valor) => handleEscolherMedicamento(item.idLocal, valor)}
                options={[
                  { value: "", label: "Sem produto" },
                  ...dados.medicamentos.map((m) => ({ value: m.id, label: m.nome })),
                  { value: "__novo__", label: "+ Cadastrar novo produto" },
                ]}
              />
            ) : (
              <>
                <InputField
                  label="Nome do novo medicamento ou vermífugo"
                  value={item.nomeNovoMedicamento}
                  onChange={(valor) => atualizarItem(item.idLocal, { nomeNovoMedicamento: valor })}
                  placeholder="Ex: Ivermectina"
                />
                <button type="button" onClick={() => atualizarItem(item.idLocal, { novoMedicamento: false, nomeNovoMedicamento: "" })} style={styles.secondaryBtn}>
                  Escolher produto cadastrado
                </button>
              </>
            )}
            <InputField label="Dose" value={item.dose} onChange={(valor) => atualizarItem(item.idLocal, { dose: valor })} placeholder="Ex: 10 ml" />
            <InputField label="Carência (dias)" type="number" value={item.carenciaDias} onChange={(valor) => atualizarItem(item.idLocal, { carenciaDias: valor })} placeholder="0" />
          </div>
        ))}
        {!inicial && (
          <button type="button" onClick={adicionarItem} style={{ ...styles.secondaryBtn, marginBottom: 14 }}>
            <Plus size={16} style={{ verticalAlign: "middle", marginRight: 7 }} />
            Adicionar outro medicamento ou vermífugo
          </button>
        )}

        <InputField label="Data de aplicação" type="date" value={dataAplicacao} onChange={setDataAplicacao} />
        <InputField label="Próxima aplicação (opcional)" type="date" value={proximaAplicacao} onChange={setProximaAplicacao} />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>
        {salvando ? "Salvando..." : inicial ? "Salvar alterações" : alcance === "lote" ? "Registrar para o lote inteiro" : "Registrar"}
      </PrimaryButton>
    </div>
  );
}
