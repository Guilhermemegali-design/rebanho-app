"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, formatBRL } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { Radio, ArrowLeftRight, Trash2 } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, SelectField, InputField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

const TIPOS = {
  entrada: "Entrada",
  transferencia_lote: "Transferência de lote",
  transferencia_local: "Transferência de local",
  saida: "Saída",
  morte: "Morte",
  venda: "Venda",
};

export default function MovimentacoesTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const [excluindoId, setExcluindoId] = useState(null);

  async function excluirTransferencia(movimentacao, animal) {
    if (!window.confirm(`Excluir a ${TIPOS[movimentacao.tipo].toLowerCase()} do animal ${animal?.brinco_atual || "selecionado"}, em ${formatDataBR(movimentacao.data)}?`)) return;
    const chave = movimentacao.id || movimentacao.client_uuid;
    setExcluindoId(chave);
    try {
      await dados.excluirMovimentacao(movimentacao);
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir a transferência.");
    } finally {
      setExcluindoId(null);
    }
  }

  const recentes = useMemo(
    () => [...dados.movimentacoes].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 30),
    [dados.movimentacoes]
  );

  if (modo === "nova") {
    return <FormMovimentacao dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;
  }

  return (
    <div>
      <PageHeader title="Movimentações" subtitle="Entradas, transferências e saídas do rebanho." actionLabel="Registrar" onAction={() => setModo("nova")} />
      {recentes.length === 0 && <EmptyHint text="Nenhuma movimentação registrada ainda." />}
      {recentes.map((m) => {
        const animal = dados.animais.find((a) => a.id === m.animal_id);
        return (
          <div key={m.client_uuid || m.id} style={styles.rowCard}>
            <div style={styles.avatar}><ArrowLeftRight size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"} · {TIPOS[m.tipo] || m.tipo}</div>
              <div style={styles.listItemSub}>
                {formatDataBR(m.data)}
                {m.tipo === "venda" ? ` · ${formatKg(m.peso_saida)} · ${formatBRL(m.preco_arroba)}/@ · ${m.rendimento_carcaca ?? "—"}% carcaça` : ""}
                {m.observacoes ? ` · ${m.observacoes}` : ""}
                {!m.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
            {(m.tipo === "transferencia_lote" || m.tipo === "transferencia_local") && (
              <button
                type="button"
                onClick={() => excluirTransferencia(m, animal)}
                disabled={excluindoId === (m.id || m.client_uuid)}
                aria-label={`Excluir ${TIPOS[m.tipo].toLowerCase()}`}
                title="Excluir transferência"
                style={{ ...styles.iconDangerBtn, opacity: excluindoId === (m.id || m.client_uuid) ? 0.5 : 1 }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FormMovimentacao({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [animaisVenda, setAnimaisVenda] = useState([]);
  const [pesosSaida, setPesosSaida] = useState({});
  const [tipo, setTipo] = useState("transferencia_lote");
  const [loteDestinoId, setLoteDestinoId] = useState("");
  const [localDestinoId, setLocalDestinoId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState("");
  const [precoArroba, setPrecoArroba] = useState("");
  const [rendimentoCarcaca, setRendimentoCarcaca] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback(
    (tag) => {
      const animal = encontrarAnimalPorTag(dados.animais, tag);
      if (animal && tipo === "venda") {
        setAnimaisVenda((atuais) => (atuais.includes(animal.id) ? atuais : [...atuais, animal.id]));
      } else if (animal) setAnimalId(animal.id);
      else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
    },
    [dados.animais, tipo]
  );
  const { lendo } = useRfidScanner(aoLerTag);

  const animalEscolhido = dados.animais.find((a) => a.id === animalId);

  async function handleSalvar() {
    const idsSelecionados = tipo === "venda" ? animaisVenda : [animalId].filter(Boolean);
    if (idsSelecionados.length === 0) { setErro(tipo === "venda" ? "Selecione ao menos um animal para a venda." : "Escolha o animal (ou aponte o bastão RFID)."); return; }
    if (tipo === "venda") {
      if (!precoArroba || Number(precoArroba) < 0) { setErro("Informe o preço da arroba."); return; }
      if (!rendimentoCarcaca || Number(rendimentoCarcaca) <= 0 || Number(rendimentoCarcaca) > 100) { setErro("Informe um rendimento de carcaça entre 0 e 100%."); return; }
      const semPeso = idsSelecionados.find((id) => !pesosSaida[id] || Number(pesosSaida[id]) <= 0);
      if (semPeso) { setErro("Informe o peso de saída de todos os animais selecionados."); return; }
    }
    setErro("");
    setSalvando(true);
    try {
      const registros = idsSelecionados.map((id) => {
        const animal = dados.animais.find((a) => a.id === id);
        const payload = { tipo, data, observacoes: observacoes || null };
        if (tipo === "transferencia_lote" || tipo === "entrada") {
          payload.lote_destino_id = loteDestinoId || null;
          payload.lote_origem_id = animal?.lote_atual_id || null;
        }
        if (tipo === "transferencia_local" || tipo === "entrada") {
          payload.local_destino_id = localDestinoId || null;
          payload.local_origem_id = animal?.local_atual_id || null;
        }
        if (tipo === "venda") {
          payload.peso_saida = Number(pesosSaida[id]);
          payload.preco_arroba = Number(precoArroba);
          payload.rendimento_carcaca = Number(rendimentoCarcaca);
        }
        return { animalId: id, dados: payload };
      });
      if (tipo === "venda" && dados.registrarMovimentacoesEmLote) {
        await dados.registrarMovimentacoesEmLote(registros);
      } else {
        await Promise.all(registros.map((registro) => dados.registrarMovimentacao(registro.animalId, registro.dados)));
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
      <BackHeader title="Registrar movimentação" onBack={onCancelar} />

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para identificar o animal"}
        </div>
      </div>

      <div style={styles.card}>
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS).map(([value, label]) => ({ value, label }))} />
        {tipo !== "venda" && (
          <SelectField
            label="Animal"
            value={animalId}
            onChange={setAnimalId}
            options={[{ value: "", label: "Selecione..." }, ...dados.animais.filter((a) => a.situacao === "ativo").map((a) => ({ value: a.id, label: a.brinco_atual }))]}
          />
        )}

        {tipo === "venda" && (
          <>
            <SectionTitle>Animais da venda</SectionTitle>
            <div style={styles.hardwareHint}>Marque vários animais ou leia os brincos RFID em sequência. O preço e o rendimento serão aplicados a todos; o peso é informado por animal.</div>
            {dados.animais.filter((a) => a.situacao === "ativo").map((animal) => {
              const selecionado = animaisVenda.includes(animal.id);
              return (
                <div key={animal.id} style={{ ...styles.rowCard, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => setAnimaisVenda((atuais) => selecionado ? atuais.filter((id) => id !== animal.id) : [...atuais, animal.id])}
                    aria-label={`Selecionar ${animal.brinco_atual}`}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={styles.listItemTitle}>{animal.brinco_atual}</div>
                    <div style={styles.listItemSub}>{animal.raca || "Raça não informada"}</div>
                  </div>
                  {selecionado && (
                    <input
                      type="number"
                      min="1"
                      inputMode="decimal"
                      value={pesosSaida[animal.id] || ""}
                      onChange={(e) => setPesosSaida((atuais) => ({ ...atuais, [animal.id]: e.target.value }))}
                      placeholder="Peso kg"
                      aria-label={`Peso de saída de ${animal.brinco_atual}`}
                      style={{ ...styles.input, width: 110 }}
                    />
                  )}
                </div>
              );
            })}
            <InputField label="Preço da arroba (R$)" type="number" value={precoArroba} onChange={setPrecoArroba} placeholder="0,00" />
            <InputField label="Rendimento de carcaça (%)" type="number" value={rendimentoCarcaca} onChange={setRendimentoCarcaca} placeholder="Ex: 54" />
          </>
        )}

        {(tipo === "transferencia_lote" || tipo === "entrada") && (
          <SelectField
            label="Lote de destino"
            value={loteDestinoId}
            onChange={setLoteDestinoId}
            options={[{ value: "", label: "Sem lote" }, ...dados.lotes.map((l) => ({ value: l.id, label: l.nome }))]}
          />
        )}
        {(tipo === "transferencia_local" || tipo === "entrada") && (
          <SelectField
            label="Local de destino"
            value={localDestinoId}
            onChange={setLocalDestinoId}
            options={[{ value: "", label: "Sem local" }, ...dados.locais.map((l) => ({ value: l.id, label: l.nome }))]}
          />
        )}

        <InputField label="Data" type="date" value={data} onChange={setData} />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Registrar"}</PrimaryButton>
    </div>
  );
}
