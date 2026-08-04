"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, calcularGmd } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { useBluetoothScale } from "@/lib/bluetoothScale";
import { Radio, Bluetooth, BluetoothConnected, Scale, Search, Trash2, Pencil } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, InputField, PrimaryButton } from "@/components/UI";

export default function PesagensTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const [excluindoId, setExcluindoId] = useState(null);
  const [pesagemEditando, setPesagemEditando] = useState(null);

  async function excluirPesagem(pesagem, animal) {
    const identificacao = animal?.brinco_atual || "sem identificação";
    if (!window.confirm(`Excluir a pesagem de ${formatKg(pesagem.peso)} do animal ${identificacao}, em ${formatDataBR(pesagem.data)}?`)) return;
    const chave = pesagem.id || pesagem.client_uuid;
    setExcluindoId(chave);
    try {
      await dados.excluirPesagem(pesagem);
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir a pesagem.");
    } finally {
      setExcluindoId(null);
    }
  }

  const recentes = useMemo(
    () => [...dados.pesagens].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 30),
    [dados.pesagens]
  );

  if (modo === "nova") {
    return <FormPesagem dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;
  }
  if (modo === "editar" && pesagemEditando) {
    return (
      <FormPesagem
        dados={dados}
        inicial={pesagemEditando}
        onSalvo={async (payload) => {
          await dados.atualizarPesagem(pesagemEditando, payload);
          setPesagemEditando(null);
          setModo("lista");
        }}
        onCancelar={() => { setPesagemEditando(null); setModo("lista"); }}
      />
    );
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
            <button
              type="button"
              onClick={() => { setPesagemEditando(p); setModo("editar"); }}
              aria-label={`Editar pesagem do animal ${animal?.brinco_atual || ""}`}
              title="Editar pesagem"
              style={styles.iconEditBtn}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => excluirPesagem(p, animal)}
              disabled={excluindoId === (p.id || p.client_uuid)}
              aria-label={`Excluir pesagem do animal ${animal?.brinco_atual || ""}`}
              title="Excluir pesagem"
              style={{ ...styles.iconDangerBtn, opacity: excluindoId === (p.id || p.client_uuid) ? 0.5 : 1 }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormPesagem({ dados, onSalvo, onCancelar, inicial }) {
  const animalInicial = inicial ? dados.animais.find((animal) => animal.id === inicial.animal_id) : null;
  const [animalId, setAnimalId] = useState(inicial?.animal_id || "");
  const [brincoDigitado, setBrincoDigitado] = useState(animalInicial?.brinco_atual || "");
  const [peso, setPeso] = useState(inicial?.peso ?? "");
  const [origemPeso, setOrigemPeso] = useState(inicial?.origem_peso || "manual");
  const [data, setData] = useState(inicial?.data || new Date().toISOString().slice(0, 10));
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
  const resultadosBusca = useMemo(() => {
    const termo = brincoDigitado.trim().toLowerCase();
    if (!termo || animalEscolhido) return [];
    return dados.animais
      .filter((animal) => (
        animal.brinco_atual.toLowerCase().includes(termo) ||
        (animal.brinco_rfid || "").toLowerCase().includes(termo)
      ))
      .slice(0, 8);
  }, [brincoDigitado, dados.animais, animalEscolhido]);

  function handleBrincoDigitado(valor) {
    setBrincoDigitado(valor);
    const animal = encontrarAnimalPorTag(dados.animais, valor.trim());
    setAnimalId(animal?.id || "");
    setErro("");
  }

  function escolherAnimal(animal) {
    setAnimalId(animal.id);
    setBrincoDigitado(animal.brinco_atual);
    setErro("");
  }
  const ultimaPesagem = useMemo(() => {
    if (!animalEscolhido || !data) return null;

    // Para calcular GMD precisamos de dias decorridos. Uma segunda pesagem
    // feita no mesmo dia não pode ser a referência anterior; nesse caso,
    // busca a última data realmente anterior e também considera o peso de
    // entrada do cadastro.
    const referencias = dados.pesagens
      .filter((p) => p.animal_id === animalEscolhido.id && p.data < data)
      .map((p) => ({ peso: p.peso, data: p.data, origem: "pesagem" }));

    if (
      animalEscolhido.peso_entrada != null &&
      animalEscolhido.data_entrada &&
      animalEscolhido.data_entrada < data
    ) {
      referencias.push({
        peso: animalEscolhido.peso_entrada,
        data: animalEscolhido.data_entrada,
        origem: "entrada",
      });
    }

    referencias.sort((a, b) => a.data.localeCompare(b.data));
    return referencias[referencias.length - 1] || null;
  }, [dados.pesagens, animalEscolhido, data]);

  const gmdPrevisto = ultimaPesagem && peso !== ""
    ? calcularGmd(ultimaPesagem.peso, ultimaPesagem.data, Number(peso), data)
    : null;

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha o animal (ou aponte o bastão RFID)."); return; }
    if (peso === "" || Number(peso) <= 0) { setErro("Informe o peso."); return; }
    setErro("");
    setSalvando(true);
    try {
      const payload = {
        peso: Number(peso),
        data,
        origem_peso: origemPeso,
        dispositivo: origemPeso === "bluetooth" ? escala.dispositivo : null,
      };
      if (inicial) await onSalvo(payload);
      else {
        await dados.registrarPesagem(animalId, payload);
        onSalvo();
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={inicial ? "Editar pesagem" : "Pesar animal"} onBack={onCancelar} />

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para identificar o animal"}
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ ...styles.field, position: "relative" }}>
          <div style={styles.fieldLabel}>Procurar, digitar ou ler com bastão</div>
          <div style={{ ...styles.tableSearchBox, border: animalEscolhido ? "1px solid #8CB8A5" : "1px solid #E8E6DF" }}>
            <Search size={16} color="#6F7772" />
            <input
              value={brincoDigitado}
              onChange={(event) => handleBrincoDigitado(event.target.value)}
              placeholder="Brinco visual ou RFID"
              autoComplete="off"
              style={{ ...styles.input, border: 0, padding: 0, background: "transparent" }}
            />
          </div>
          {resultadosBusca.length > 0 && (
            <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E1DED5", borderRadius: 10, boxShadow: "0 10px 24px rgba(27, 45, 39, 0.12)", overflow: "hidden" }}>
              {resultadosBusca.map((animal) => (
                <button
                  key={animal.id}
                  type="button"
                  onClick={() => escolherAnimal(animal)}
                  style={{ width: "100%", padding: "11px 13px", border: 0, borderBottom: "1px solid #F1EFE8", background: "#fff", textAlign: "left", cursor: "pointer" }}
                >
                  <div style={styles.tableCellTitle}>{animal.brinco_atual}</div>
                  <div style={styles.tableCellSub}>{animal.brinco_rfid ? `RFID ${animal.brinco_rfid}` : "Sem RFID"}{animal.raca ? ` · ${animal.raca}` : ""}</div>
                </button>
              ))}
            </div>
          )}
          {brincoDigitado && !animalEscolhido && resultadosBusca.length === 0 && (
            <div style={{ ...styles.tableCellSub, marginTop: 6 }}>Nenhum animal encontrado.</div>
          )}
          {animalEscolhido && (
            <div style={{ ...styles.tableCellSub, color: "#1F4D45", marginTop: 6 }}>
              Animal selecionado: {animalEscolhido.brinco_atual}{animalEscolhido.brinco_rfid ? ` · RFID ${animalEscolhido.brinco_rfid}` : ""}
            </div>
          )}
        </div>
        <InputField label="Data" type="date" value={data} onChange={setData} />
      </div>

      {animalEscolhido && (
        <div style={{ ...styles.card, marginTop: 14 }}>
          <div style={styles.sectionTitle}>Referência para o GMD — brinco {animalEscolhido.brinco_atual}</div>
          {ultimaPesagem ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <div style={styles.tableCellSub}>{ultimaPesagem.origem === "entrada" ? "Data de entrada" : "Data anterior"}</div>
                <div style={styles.tableCellTitle}>{formatDataBR(ultimaPesagem.data)}</div>
              </div>
              <div>
                <div style={styles.tableCellSub}>{ultimaPesagem.origem === "entrada" ? "Peso de entrada" : "Peso anterior"}</div>
                <div style={styles.tableCellTitle}>{formatKg(ultimaPesagem.peso)}</div>
              </div>
            </div>
          ) : (
            <div style={styles.hardwareHint}>
              Ainda não existe peso registrado em uma data anterior. O GMD aparecerá quando houver pelo menos um dia entre os pesos.
            </div>
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
      {escala.conectando && escala.dispositivosEncontrados?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={styles.hardwareHint}>Toque na balança para conectar:</div>
          {escala.dispositivosEncontrados.map((item) => (
            <button
              key={item.endereco}
              type="button"
              onClick={() => escala.conectarEm(item.endereco, item.nome)}
              style={{ ...styles.rowCard, width: "100%", cursor: "pointer", textAlign: "left" }}
            >
              {item.nome}
            </button>
          ))}
        </div>
      )}

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
      {animalEscolhido && ultimaPesagem && peso === "" && (
        <div style={{ ...styles.hardwareHint, marginTop: 10 }}>Digite o novo peso para calcular o GMD antes de salvar.</div>
      )}

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : inicial ? "Salvar alterações" : "Registrar pesagem"}</PrimaryButton>
    </div>
  );
}
