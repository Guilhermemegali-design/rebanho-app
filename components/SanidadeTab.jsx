"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { Radio, Syringe, Plus } from "lucide-react";
import { ListHeader, BackHeader, EmptyHint, SelectField, InputField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

const TIPOS = { vacina: "Vacinação", vermifugo: "Vermifugação", diagnostico: "Diagnóstico", tratamento: "Tratamento" };

export default function SanidadeTab({ dados }) {
  const [modo, setModo] = useState("lista");

  const recentes = useMemo(
    () => [...dados.procedimentos].sort((a, b) => (b.data_aplicacao || "").localeCompare(a.data_aplicacao || "")).slice(0, 30),
    [dados.procedimentos]
  );

  if (modo === "novo") {
    return <FormProcedimento dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;
  }

  return (
    <div>
      <ListHeader title="Sanidade" actionLabel="Registrar" onAction={() => setModo("novo")} />
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
                {!p.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
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

function FormProcedimento({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [tipo, setTipo] = useState("vacina");
  const [medicamentoId, setMedicamentoId] = useState("");
  const [dose, setDose] = useState("");
  const [dataAplicacao, setDataAplicacao] = useState(new Date().toISOString().slice(0, 10));
  const [proximaAplicacao, setProximaAplicacao] = useState("");
  const [carenciaDias, setCarenciaDias] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [novoMedicamento, setNovoMedicamento] = useState(false);
  const [nomeNovoMedicamento, setNomeNovoMedicamento] = useState("");
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
  const { lendo } = useRfidScanner(aoLerTag);

  function handleEscolherMedicamento(id) {
    if (id === "__novo__") {
      setNovoMedicamento(true);
      setMedicamentoId("");
      return;
    }
    setMedicamentoId(id);
    const med = dados.medicamentos.find((m) => m.id === id);
    if (med?.carencia_padrao_dias != null) setCarenciaDias(String(med.carencia_padrao_dias));
  }

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha o animal (ou aponte o bastão RFID)."); return; }
    setErro("");
    setSalvando(true);
    try {
      let medId = medicamentoId;
      if (novoMedicamento && nomeNovoMedicamento.trim()) {
        const criado = await dados.criarMedicamento({ nome: nomeNovoMedicamento.trim(), tipo, carencia_padrao_dias: Number(carenciaDias) || 0 });
        medId = criado.id;
      }
      await dados.registrarProcedimento(animalId, {
        tipo,
        medicamento_id: medId || null,
        dose: dose || null,
        data_aplicacao: dataAplicacao,
        proxima_aplicacao: proximaAplicacao || null,
        carencia_dias: Number(carenciaDias) || 0,
        observacoes: observacoes || null,
      });
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Registrar procedimento" onBack={onCancelar} />

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para identificar o animal"}
        </div>
      </div>

      <div style={styles.card}>
        <SelectField
          label="Animal"
          value={animalId}
          onChange={setAnimalId}
          options={[{ value: "", label: "Selecione..." }, ...dados.animais.map((a) => ({ value: a.id, label: a.brinco_atual }))]}
        />
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS).map(([value, label]) => ({ value, label }))} />

        {!novoMedicamento ? (
          <SelectField
            label="Medicamento"
            value={medicamentoId}
            onChange={handleEscolherMedicamento}
            options={[
              { value: "", label: "Sem medicamento" },
              ...dados.medicamentos.map((m) => ({ value: m.id, label: m.nome })),
              { value: "__novo__", label: "+ Cadastrar novo medicamento" },
            ]}
          />
        ) : (
          <InputField label="Nome do novo medicamento" value={nomeNovoMedicamento} onChange={setNomeNovoMedicamento} placeholder="Ex: Ivermectina" />
        )}

        <InputField label="Dose" value={dose} onChange={setDose} placeholder="Ex: 10ml" />
        <InputField label="Data de aplicação" type="date" value={dataAplicacao} onChange={setDataAplicacao} />
        <InputField label="Próxima aplicação (opcional)" type="date" value={proximaAplicacao} onChange={setProximaAplicacao} />
        <InputField label="Carência (dias)" type="number" value={carenciaDias} onChange={setCarenciaDias} placeholder="0" />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Registrar"}</PrimaryButton>
    </div>
  );
}
