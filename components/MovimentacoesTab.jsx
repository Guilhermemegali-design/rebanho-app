"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR } from "@/lib/format";
import { useRfidScanner } from "@/lib/rfid";
import { Radio, ArrowLeftRight } from "lucide-react";
import { ListHeader, BackHeader, EmptyHint, SelectField, InputField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

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

  const recentes = useMemo(
    () => [...dados.movimentacoes].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 30),
    [dados.movimentacoes]
  );

  if (modo === "nova") {
    return <FormMovimentacao dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;
  }

  return (
    <div>
      <ListHeader title="Movimentações" actionLabel="Registrar" onAction={() => setModo("nova")} />
      {recentes.length === 0 && <EmptyHint text="Nenhuma movimentação registrada ainda." />}
      {recentes.map((m) => {
        const animal = dados.animais.find((a) => a.id === m.animal_id);
        return (
          <div key={m.client_uuid || m.id} style={styles.rowCard}>
            <div style={styles.avatar}><ArrowLeftRight size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"} · {TIPOS[m.tipo] || m.tipo}</div>
              <div style={styles.listItemSub}>{formatDataBR(m.data)}{m.observacoes ? ` · ${m.observacoes}` : ""}{!m.id ? " · aguardando sincronizar" : ""}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormMovimentacao({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [tipo, setTipo] = useState("transferencia_lote");
  const [loteDestinoId, setLoteDestinoId] = useState("");
  const [localDestinoId, setLocalDestinoId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback(
    (tag) => {
      const animal = dados.animais.find((a) => a.brinco_atual.toLowerCase() === tag.toLowerCase());
      if (animal) setAnimalId(animal.id);
      else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
    },
    [dados.animais]
  );
  const { lendo } = useRfidScanner(aoLerTag);

  const animalEscolhido = dados.animais.find((a) => a.id === animalId);

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha o animal (ou aponte o bastão RFID)."); return; }
    setErro("");
    setSalvando(true);
    try {
      const payload = { tipo, data, observacoes: observacoes || null };
      if (tipo === "transferencia_lote" || tipo === "entrada") {
        payload.lote_destino_id = loteDestinoId || null;
        payload.lote_origem_id = animalEscolhido?.lote_atual_id || null;
      }
      if (tipo === "transferencia_local" || tipo === "entrada") {
        payload.local_destino_id = localDestinoId || null;
        payload.local_origem_id = animalEscolhido?.local_atual_id || null;
      }
      await dados.registrarMovimentacao(animalId, payload);
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
        <SelectField
          label="Animal"
          value={animalId}
          onChange={setAnimalId}
          options={[{ value: "", label: "Selecione..." }, ...dados.animais.map((a) => ({ value: a.id, label: a.brinco_atual }))]}
        />
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS).map(([value, label]) => ({ value, label }))} />

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
