"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, formatBRL } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { Radio, ArrowLeftRight, Trash2, Pencil, Search } from "lucide-react";
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
                {m.tipo === "venda" ? ` · ${formatKg(m.peso_saida)} · ${formatBRL(m.preco_arroba)}/@ · ${m.rendimento_carcaca ?? "—"}% carcaça` : ""}
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

  const aoLerTag = useCallback(
    (tag) => {
      const animal = encontrarAnimalPorTag(dados.animais, tag);
      if (!animal) { setErro(`Nenhum animal encontrado com o brinco "${tag}".`); return; }
      if (inicial) {
        setAnimalId(animal.id);
      } else {
        setAnimaisSelecionados((atuais) => (atuais.includes(animal.id) ? atuais : [...atuais, animal.id]));
      }
    },
    [dados.animais, inicial]
  );
  const { lendo } = useRfidScanner(aoLerTag);

  const animalEscolhido = dados.animais.find((a) => a.id === animalId);

  function adicionarAnimal(animal) {
    setAnimaisSelecionados((atuais) => (atuais.includes(animal.id) ? atuais : [...atuais, animal.id]));
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
    if (tipo === "venda") {
      if (!precoArroba || Number(precoArroba) < 0) { setErro("Informe o preço da arroba."); return; }
      if (!rendimentoCarcaca || Number(rendimentoCarcaca) <= 0 || Number(rendimentoCarcaca) > 100) { setErro("Informe um rendimento de carcaça entre 0 e 100%."); return; }
      const semPeso = idsSelecionados.find((id) => !pesosSaida[id] || Number(pesosSaida[id]) <= 0);
      if (semPeso) { setErro("Informe o peso de saída de todos os animais selecionados."); return; }
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
        if (tipo === "venda") {
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
              O jeito mais rápido é apontar o bastão RFID pra cada animal — vai adicionando na lista abaixo. Sem o bastão à mão, dá pra digitar o brinco ou adicionar um lote inteiro de uma vez.
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
                    <div style={{ flex: 1 }}>
                      <div style={styles.listItemTitle}>{animal.brinco_atual}</div>
                      <div style={styles.listItemSub}>{animal.raca || "Raça não informada"}</div>
                    </div>
                    {tipo === "venda" && (
                      <input
                        type="number"
                        min="1"
                        inputMode="decimal"
                        value={pesosSaida[id] || ""}
                        onChange={(e) => setPesosSaida((atuais) => ({ ...atuais, [id]: e.target.value }))}
                        placeholder="Peso kg"
                        aria-label={`Peso de saída de ${animal.brinco_atual}`}
                        style={{ ...styles.input, width: 110 }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setAnimaisSelecionados((atuais) => atuais.filter((x) => x !== id))}
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
            {tipo === "venda" && (
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

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : inicial ? "Salvar alterações" : "Registrar"}</PrimaryButton>
    </div>
  );
}
