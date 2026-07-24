"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, calcularGmd } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { useBluetoothScale } from "@/lib/bluetoothScale";
import { Radio, Bluetooth, BluetoothConnected, Scale } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, SelectField, InputField, PrimaryButton } from "@/components/UI";

export default function PesagensTab({ dados }) {
  const [modo, setModo] = useState("lista");

  const recentes = useMemo(
    () => [...dados.pesagens].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 30),
    [dados.pesagens]
  );

  if (modo === "nova") {
    return <FormPesagem dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;
  }

  return (
    <div>
      <PageHeader title="Pesagens" subtitle="Histórico de peso e ganho médio diário do rebanho." actionLabel="Pesar animal" onAction={() => setModo("nova")} />
      {recentes.length === 0 && <EmptyHint text="Nenhuma pesagem registrada ainda." />}
      {recentes.map((p) => {
        const animal = dados.animais.find((a) => a.id === p.animal_id);
        return (
          <div key={p.client_uuid || p.id} style={styles.rowCard}>
            <div style={styles.avatar}><Scale size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"} · {formatKg(p.peso)}</div>
              <div style={styles.listItemSub}>
                {formatDataBR(p.data)} · {p.origem_peso === "bluetooth" ? "Balança Bluetooth" : "Manual"}
                {!p.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormPesagem({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [brincoDigitado, setBrincoDigitado] = useState("");
  const [peso, setPeso] = useState("");
  const [origemPeso, setOrigemPeso] = useState("manual");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback(
    (tag) => {
      const animal = encontrarAnimalPorTag(dados.animais, tag);
      if (animal) {
        setAnimalId(animal.id);
        setBrincoDigitado(animal.brinco_atual);
        setErro("");
      }
      else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
    },
    [dados.animais]
  );
  const { lendo } = useRfidScanner(aoLerTag);

  const escala = useBluetoothScale();
  useEffect(() => {
    if (escala.peso != null) {
      setPeso(String(escala.peso));
      setOrigemPeso("bluetooth");
    }
  }, [escala.peso]);

  const animalEscolhido = dados.animais.find((a) => a.id === animalId);

  function handleBrincoDigitado(valor) {
    setBrincoDigitado(valor);
    const animal = encontrarAnimalPorTag(dados.animais, valor.trim());
    setAnimalId(animal?.id || "");
    setErro("");
  }
  const ultimaPesagem = useMemo(() => {
    if (!animalId) return null;
    const historico = dados.pesagens.filter((p) => p.animal_id === animalId).sort((a, b) => a.data.localeCompare(b.data));
    return historico[historico.length - 1] || null;
  }, [dados.pesagens, animalId]);

  const gmdPrevisto = ultimaPesagem && peso !== ""
    ? calcularGmd(ultimaPesagem.peso, ultimaPesagem.data, Number(peso), data)
    : null;

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha o animal (ou aponte o bastão RFID)."); return; }
    if (peso === "" || Number(peso) <= 0) { setErro("Informe o peso."); return; }
    setErro("");
    setSalvando(true);
    try {
      await dados.registrarPesagem(animalId, {
        peso: Number(peso),
        data,
        origem_peso: origemPeso,
        dispositivo: origemPeso === "bluetooth" ? escala.dispositivo : null,
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
      <BackHeader title="Pesar animal" onBack={onCancelar} />

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para identificar o animal"}
        </div>
      </div>

      <div style={styles.card}>
        <InputField
          label="Digite o brinco visual ou RFID"
          value={brincoDigitado}
          onChange={handleBrincoDigitado}
          placeholder="Ex: 1024"
        />
        <SelectField
          label="Ou selecione o animal"
          value={animalId}
          onChange={(id) => {
            setAnimalId(id);
            const animal = dados.animais.find((item) => item.id === id);
            setBrincoDigitado(animal?.brinco_atual || "");
            setErro("");
          }}
          options={[{ value: "", label: "Selecione..." }, ...dados.animais.map((a) => ({ value: a.id, label: a.brinco_atual }))]}
        />
        <InputField label="Data" type="date" value={data} onChange={setData} />
      </div>

      {animalEscolhido && (
        <div style={{ ...styles.card, marginTop: 14 }}>
          <div style={styles.sectionTitle}>Referência anterior — brinco {animalEscolhido.brinco_atual}</div>
          {ultimaPesagem ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <div style={styles.tableCellSub}>Data anterior</div>
                <div style={styles.tableCellTitle}>{formatDataBR(ultimaPesagem.data)}</div>
              </div>
              <div>
                <div style={styles.tableCellSub}>Peso anterior</div>
                <div style={styles.tableCellTitle}>{formatKg(ultimaPesagem.peso)}</div>
              </div>
            </div>
          ) : (
            <div style={styles.hardwareHint}>Este animal ainda não possui pesagem anterior.</div>
          )}
        </div>
      )}

      {escala.suportado ? (
        <button
          onClick={escala.conectado ? escala.desconectar : escala.conectar}
          disabled={escala.conectando}
          style={{ ...styles.scaleBtn, ...(escala.conectado ? styles.scaleBtnConnected : {}), marginTop: 14 }}
        >
          {escala.conectado ? <BluetoothConnected size={17} /> : <Bluetooth size={17} />}
          {escala.conectando ? "Conectando..." : escala.conectado ? `Conectado: ${escala.dispositivo}` : "Conectar balança Bluetooth"}
        </button>
      ) : (
        <div style={styles.hardwareHint}>
          Este aparelho/navegador não conecta com balança Bluetooth diretamente (comum no iPhone/iPad).
          Digite o peso mostrado na balança abaixo.
        </div>
      )}
      {escala.erro && <div style={styles.errorBox}>{escala.erro}</div>}

      <div style={{ ...styles.card, marginTop: 14 }}>
        <InputField
          label={`Peso (kg)${origemPeso === "bluetooth" ? " — lido da balança" : ""}`}
          type="number"
          value={peso}
          onChange={(v) => { setPeso(v); setOrigemPeso("manual"); }}
          placeholder="0,0"
        />
      </div>

      {gmdPrevisto != null && (
        <div style={{ ...styles.rowCard, marginTop: 10, borderColor: "#BBD8CC", background: "#F3FAF6" }}>
          <Scale size={18} color="#1F4D45" />
          <div>
            <div style={styles.tableCellSub}>GMD calculado antes de salvar</div>
            <div style={{ ...styles.listItemTitle, color: "#1F4D45" }}>{gmdPrevisto.toFixed(3)} kg/dia</div>
          </div>
        </div>
      )}

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Registrar pesagem"}</PrimaryButton>
    </div>
  );
}
