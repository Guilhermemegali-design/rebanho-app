"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, formatBRL } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { useBluetoothScale } from "@/lib/bluetoothScale";
import { Radio, ArrowLeftRight, Trash2, Pencil, Search, Bluetooth, BluetoothConnected, Scale } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, SelectField, InputField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

const TIPOS = {
  entrada: "Entrada",
  transferencia_lote: "Transferência de lote",
  transferencia_local: "Transferência de local",
  saida: "Saída",
  morte: "Morte",
  venda: "Venda",
  abate: "Abate",
};

// Venda e abate usam os mesmos campos (peso de saída, preço da arroba,
// rendimento de carcaça) — só mudam a situação que o animal assume
// depois (vendido x abatido).
const TIPOS_COM_PESO_SAIDA = ["venda", "abate"];

export default function MovimentacoesTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const [excluindoId, setExcluindoId] = useState(null);
  const [movimentacaoEditando, setMovimentacaoEditando] = useState(null);

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
  if (modo === "editar" && movimentacaoEditando) {
    return (
      <FormMovimentacao
        dados={dados}
        inicial={movimentacaoEditando}
        onSalvo={() => { setMovimentacaoEditando(null); setModo("lista"); }}
        onCancelar={() => { setMovimentacaoEditando(null); setModo("lista"); }}
      />
    );
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
                {TIPOS_COM_PESO_SAIDA.includes(m.tipo) ? ` · ${formatKg(m.peso_saida)} · ${formatBRL(m.preco_arroba)}/@ · ${m.rendimento_carcaca ?? "—"}% carcaça` : ""}
                {m.observacoes ? ` · ${m.observacoes}` : ""}
                {!m.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
            {(m.tipo === "transferencia_lote" || m.tipo === "transferencia_local") && (
              <>
                <button
                  type="button"
                  onClick={() => { setMovimentacaoEditando(m); setModo("editar"); }}
                  aria-label={`Editar ${TIPOS[m.tipo].toLowerCase()}`}
                  title="Editar transferência"
                  style={styles.iconEditBtn}
                >
                  <Pencil size={15} />
                </button>
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
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FormMovimentacao({ dados, onSalvo, onCancelar, inicial }) {
  const [animalId, setAnimalId] = useState(inicial?.animal_id || "");
  const [animaisSelecionados, setAnimaisSelecionados] = useState([]);
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [loteParaAdicionar, setLoteParaAdicionar] = useState("");
  const [pesosSaida, setPesosSaida] = useState({});
  const [origensPesosSaida, setOrigensPesosSaida] = useState({});
  const [animalVendaAtivo, setAnimalVendaAtivo] = useState("");
  const [tipo, setTipo] = useState(inicial?.tipo || "transferencia_lote");
  const [loteDestinoId, setLoteDestinoId] = useState(inicial?.lote_destino_id || "");
  const [novoLote, setNovoLote] = useState(false);
  const [nomeNovoLote, setNomeNovoLote] = useState("");
  const [localDestinoId, setLocalDestinoId] = useState(inicial?.local_destino_id || "");
  const [data, setData] = useState(inicial?.data || new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState(inicial?.observacoes || "");
  const [precoArroba, setPrecoArroba] = useState("");
  const [rendimentoCarcaca, setRendimentoCarcaca] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const animalVendaAtivoRef = useRef("");

  const aoLerTag = useCallback(
    (tag) => {
      const animal = encontrarAnimalPorTag(dados.animais, tag);
      if (!animal) { setErro(`Nenhum animal encontrado com o brinco "${tag}".`); return; }
      if (inicial) {
        setAnimalId(animal.id);
      } else {
        setAnimaisSelecionados((atuais) => (atuais.includes(animal.id) ? atuais : [...atuais, animal.id]));
        setAnimalVendaAtivo(animal.id);
      }
    },
    [dados.animais, inicial]
  );
  const { lendo } = useRfidScanner(aoLerTag);
  const escala = useBluetoothScale();

  useEffect(() => {
    animalVendaAtivoRef.current = animalVendaAtivo;
  }, [animalVendaAtivo]);

  useEffect(() => {
    const animalAlvo = animalVendaAtivoRef.current;
    if (escala.peso == null || !animalAlvo) return;
    setPesosSaida((atuais) => ({ ...atuais, [animalAlvo]: String(escala.peso) }));
    setOrigensPesosSaida((atuais) => ({ ...atuais, [animalAlvo]: "bluetooth" }));
  }, [escala.leituraId, escala.peso]);

  const animalEscolhido = dados.animais.find((a) => a.id === animalId);

  function adicionarAnimal(animal) {
    setAnimaisSelecionados((atuais) => (atuais.includes(animal.id) ? atuais : [...atuais, animal.id]));
    setAnimalVendaAtivo(animal.id);
    setBuscaDigitada("");
    setErro("");
  }

  function handleBuscaDigitada(valor) {
    setBuscaDigitada(valor);
    const animal = encontrarAnimalPorTag(dados.animais, valor.trim());
    if (animal) adicionarAnimal(animal);
  }

  const animaisDoLoteParaAdicionar = useMemo(() => {
    if (!loteParaAdicionar) return [];
    return dados.animais.filter((a) => a.situacao === "ativo" && a.lote_atual_id === loteParaAdicionar);
  }, [dados.animais, loteParaAdicionar]);

  function adicionarLoteInteiro() {
    const ids = animaisDoLoteParaAdicionar.map((a) => a.id);
    setAnimaisSelecionados((atuais) => [...atuais, ...ids.filter((id) => !atuais.includes(id))]);
    setLoteParaAdicionar("");
    setErro("");
  }

  const resultadosBusca = useMemo(() => {
    const termo = buscaDigitada.trim().toLowerCase();
    if (!termo) return [];
    return dados.animais
      .filter((animal) => (
        animal.situacao === "ativo" &&
        !animaisSelecionados.includes(animal.id) &&
        (animal.brinco_atual.toLowerCase().includes(termo) || (animal.brinco_rfid || "").toLowerCase().includes(termo))
      ))
      .slice(0, 8);
  }, [buscaDigitada, dados.animais, animaisSelecionados]);

  async function handleSalvar() {
    const idsSelecionados = inicial ? [animalId].filter(Boolean) : animaisSelecionados;
    if (idsSelecionados.length === 0) { setErro(inicial ? "Escolha o animal." : "Adicione ao menos um animal — aponte o bastão RFID ou selecione manualmente."); return; }
    if (TIPOS_COM_PESO_SAIDA.includes(tipo)) {
      if (!precoArroba || Number(precoArroba) < 0) { setErro("Informe o preço da arroba."); return; }
      if (!rendimentoCarcaca || Number(rendimentoCarcaca) <= 0 || Number(rendimentoCarcaca) > 100) { setErro("Informe um rendimento de carcaça entre 0 e 100%."); return; }
      const semPeso = idsSelecionados.find((id) => !pesosSaida[id] || Number(pesosSaida[id]) <= 0);
      if (semPeso) { setErro("Informe o peso de saída de todos os animais selecionados."); return; }
    } else if (idsSelecionados.some((id) => pesosSaida[id] !== undefined && pesosSaida[id] !== "" && Number(pesosSaida[id]) <= 0)) {
      setErro("Informe pesos válidos ou deixe os campos em branco."); return;
    }
    if (novoLote && !nomeNovoLote.trim()) { setErro("Informe o nome do novo lote."); return; }
    setErro("");
    setSalvando(true);
    try {
      let loteDestinoIdFinal = loteDestinoId;
      if (novoLote) {
        const criado = await dados.criarLote({ nome: nomeNovoLote.trim(), situacao: "ativo" });
        loteDestinoIdFinal = criado.id;
      }

      const registros = idsSelecionados.map((id) => {
        const animal = dados.animais.find((a) => a.id === id);
        const payload = { tipo, data, observacoes: observacoes || null };
        if (tipo === "transferencia_lote" || tipo === "entrada") {
          payload.lote_destino_id = loteDestinoIdFinal || null;
          payload.lote_origem_id = animal?.lote_atual_id || null;
        }
        if (tipo === "transferencia_local" || tipo === "entrada") {
          payload.local_destino_id = localDestinoId || null;
          payload.local_origem_id = animal?.local_atual_id || null;
        }
        if (TIPOS_COM_PESO_SAIDA.includes(tipo)) {
          payload.peso_saida = Number(pesosSaida[id]);
          payload.preco_arroba = Number(precoArroba);
          payload.rendimento_carcaca = Number(rendimentoCarcaca);
        }
        return { animalId: id, dados: payload };
      });
      if (inicial) {
        await dados.atualizarMovimentacao(inicial, registros[0].dados);
      } else if (dados.registrarMovimentacoesEmLote) {
        await dados.registrarMovimentacoesEmLote(registros);
      } else {
        await Promise.all(registros.map((registro) => dados.registrarMovimentacao(registro.animalId, registro.dados)));
      }
      if (!inicial) {
        const pesagensDoManejo = idsSelecionados
          .filter((id) => pesosSaida[id] !== undefined && pesosSaida[id] !== "")
          .map((id) => ({
            animalId: id,
            peso: Number(pesosSaida[id]),
            origem: origensPesosSaida[id] || "manual",
          }));
        await Promise.all(pesagensDoManejo.map((item) => dados.registrarPesagem(item.animalId, {
          peso: item.peso,
          data,
          origem_peso: item.origem,
          dispositivo: item.origem === "bluetooth" ? escala.dispositivo : null,
        })));
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
      <BackHeader title={inicial ? "Editar transferência" : "Registrar movimentação"} onBack={onCancelar} />

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : inicial ? "Aponte o bastão RFID para identificar o animal" : "Aponte o bastão RFID para adicionar animais à movimentação"}
        </div>
      </div>

      <div style={styles.card}>
        {!inicial && <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS).map(([value, label]) => ({ value, label }))} />}
        {inicial ? (
          <SelectField
            label="Animal"
            value={animalId}
            onChange={setAnimalId}
            options={[{ value: "", label: "Selecione..." }, ...dados.animais.filter((a) => a.situacao === "ativo").map((a) => ({ value: a.id, label: a.brinco_atual }))]}
          />
        ) : (
          <>
            <SectionTitle>Animais</SectionTitle>
            <div style={styles.hardwareHint}>
              O jeito mais rápido é apontar o bastão RFID pra cada animal — ele entra na lista e recebe o próximo peso da balança. Também dá para digitar o brinco ou adicionar um lote inteiro; nesse caso, toque no animal antes de pesá-lo.
            </div>
            <SelectField
              label="Adicionar um lote inteiro (ex: vender/abater o lote todo)"
              value={loteParaAdicionar}
              onChange={setLoteParaAdicionar}
              options={[
                { value: "", label: "Selecione um lote..." },
                ...dados.lotes
                  .filter((l) => l.situacao === "ativo")
                  .map((l) => ({ value: l.id, label: `${l.nome} (${dados.animais.filter((a) => a.situacao === "ativo" && a.lote_atual_id === l.id).length} animais)` })),
              ]}
            />
            {loteParaAdicionar && (
              <button type="button" onClick={adicionarLoteInteiro} style={{ ...styles.editLinkBtn, marginBottom: 14 }}>
                Adicionar os {animaisDoLoteParaAdicionar.length} animais deste lote
              </button>
            )}
            <div style={{ ...styles.field, position: "relative" }}>
              <div style={styles.fieldLabel}>Digitar o brinco</div>
              <div style={{ ...styles.tableSearchBox, border: "1px solid #E8E6DF" }}>
                <Search size={16} color="#6F7772" />
                <input
                  value={buscaDigitada}
                  onChange={(event) => handleBuscaDigitada(event.target.value)}
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
                      onClick={() => adicionarAnimal(animal)}
                      style={{ width: "100%", padding: "11px 13px", border: 0, borderBottom: "1px solid #F1EFE8", background: "#fff", textAlign: "left", cursor: "pointer" }}
                    >
                      <div style={styles.tableCellTitle}>{animal.brinco_atual}</div>
                      <div style={styles.tableCellSub}>{animal.brinco_rfid ? `RFID ${animal.brinco_rfid}` : "Sem RFID"}{animal.raca ? ` · ${animal.raca}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}
              {buscaDigitada && resultadosBusca.length === 0 && (
                <div style={{ ...styles.tableCellSub, marginTop: 6 }}>Nenhum animal encontrado.</div>
              )}
            </div>
            {animaisSelecionados.length === 0 ? (
              <EmptyHint text="Nenhum animal selecionado ainda." />
            ) : (
              animaisSelecionados.map((id) => {
                const animal = dados.animais.find((a) => a.id === id);
                if (!animal) return null;
                return (
                  <div key={id} style={{ ...styles.rowCard, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setAnimalVendaAtivo(id)}
                      style={{ flex: 1, border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}
                    >
                      <div style={styles.listItemTitle}>{animal.brinco_atual}</div>
                      <div style={styles.listItemSub}>
                        {animal.raca || "Raça não informada"}{animalVendaAtivo === id ? " · recebendo peso da balança" : ""}
                      </div>
                    </button>
                    <input
                      type="number"
                      min="1"
                      inputMode="decimal"
                      value={pesosSaida[id] || ""}
                      onFocus={() => setAnimalVendaAtivo(id)}
                      onChange={(e) => {
                        setPesosSaida((atuais) => ({ ...atuais, [id]: e.target.value }));
                        setOrigensPesosSaida((atuais) => ({ ...atuais, [id]: "manual" }));
                      }}
                      placeholder={TIPOS_COM_PESO_SAIDA.includes(tipo) ? "Peso kg" : "Peso opcional"}
                      aria-label={`Peso do animal ${animal.brinco_atual}`}
                      style={{ ...styles.input, width: 120 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAnimaisSelecionados((atuais) => atuais.filter((x) => x !== id));
                        if (animalVendaAtivo === id) setAnimalVendaAtivo("");
                      }}
                      aria-label={`Remover ${animal.brinco_atual}`}
                      title="Remover"
                      style={styles.iconDangerBtn}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })
            )}
            {TIPOS_COM_PESO_SAIDA.includes(tipo) && (
              <>
                <InputField label="Preço da arroba (R$)" type="number" value={precoArroba} onChange={setPrecoArroba} placeholder="0,00" />
                <InputField label="Rendimento de carcaça (%)" type="number" value={rendimentoCarcaca} onChange={setRendimentoCarcaca} placeholder="Ex: 54" />
              </>
            )}
          </>
        )}

        {(tipo === "transferencia_lote" || tipo === "entrada") && (
          !novoLote ? (
            <SelectField
              label="Lote de destino"
              value={loteDestinoId}
              onChange={(id) => {
                if (id === "__novo__") {
                  setNovoLote(true);
                  setLoteDestinoId("");
                } else {
                  setLoteDestinoId(id);
                }
              }}
              options={[
                { value: "", label: "Sem lote" },
                ...dados.lotes.map((l) => ({ value: l.id, label: l.nome })),
                { value: "__novo__", label: "+ Criar novo lote" },
              ]}
            />
          ) : (
            <div>
              <InputField label="Nome do novo lote" value={nomeNovoLote} onChange={setNomeNovoLote} placeholder="Ex: Recria Águas 04" />
              <button type="button" onClick={() => { setNovoLote(false); setNomeNovoLote(""); }} style={{ ...styles.linkBtn, textAlign: "left" }}>
                Usar um lote já cadastrado
              </button>
            </div>
          )
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

      {!inicial && (escala.suportado ? (
        <button
          type="button"
          onClick={escala.conectado ? escala.desconectar : escala.conectar}
          disabled={escala.conectando}
          style={{ ...styles.scaleBtn, ...(escala.conectado ? styles.scaleBtnConnected : {}), marginTop: 14 }}
        >
          {escala.conectado ? <BluetoothConnected size={17} /> : <Bluetooth size={17} />}
          {escala.conectando ? "Conectando..." : escala.conectado ? `Conectado: ${escala.dispositivo}` : "Conectar balança Bluetooth"}
        </button>
      ) : (
        <div style={styles.hardwareHint}>Neste aparelho, digite manualmente o peso mostrado na balança.</div>
      ))}
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
              <Scale size={16} /> {item.nome}
            </button>
          ))}
        </div>
      )}

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : inicial ? "Salvar alterações" : "Registrar"}</PrimaryButton>
    </div>
  );
}
