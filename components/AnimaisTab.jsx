"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, formatBRL, calcularGmd, calcularValorPorArroba } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { useBluetoothScale } from "@/lib/bluetoothScale";
import { statusAnimal } from "@/lib/alerts";
import { enviarDocumentoRebanho } from "@/lib/storage";
import { Search, Tag as TagIcon, ChevronRight, Radio, Scale, Bluetooth, BluetoothConnected, ArrowLeftRight, Syringe, Trash2, Pencil } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, Field, InputField, SelectField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

const SITUACOES = { ativo: "Ativo", vendido: "Vendido", abatido: "Abatido", morto: "Morto", transferido: "Transferido" };
const STATUS_BADGE_STYLE = { ativo: styles.statusBadgeAtivo, atencao: styles.statusBadgeAtencao, carencia: styles.statusBadgeCarencia, neutro: styles.tagOrange };
const RACAS = ["Nelore", "Nelorado", "F1 Angus", "Cruzado", "Guzera", "Guzeratado"];

export default function AnimaisTab({ dados, animalInicialId, onAnimalInicialConsumido }) {
  const [busca, setBusca] = useState("");
  const [loteFiltro, setLoteFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modo, setModo] = useState("lista"); // lista | novo | detalhe
  const [animalSelecionado, setAnimalSelecionado] = useState(null);
  const [avisoScan, setAvisoScan] = useState("");
  const [excluindoId, setExcluindoId] = useState(null);

  useEffect(() => {
    if (!animalInicialId) return;
    const animal = dados.animais.find((item) => item.id === animalInicialId);
    if (animal) {
      setAnimalSelecionado(animal);
      setModo("detalhe");
    }
    onAnimalInicialConsumido?.();
  }, [animalInicialId, dados.animais, onAnimalInicialConsumido]);

  async function excluirDireto(animal) {
    if (!window.confirm(`Excluir o animal ${animal.brinco_atual}? Pesagens, movimentações e sanidade também serão removidas.`)) return;
    setExcluindoId(animal.id);
    try {
      await dados.excluirAnimal(animal.id);
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir o animal.");
    } finally {
      setExcluindoId(null);
    }
  }

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dados.animais.filter((a) => {
      if (loteFiltro && a.lote_atual_id !== loteFiltro) return false;
      if (statusFiltro && a.situacao !== statusFiltro) return false;
      if (!termo) return true;
      return (
        a.brinco_atual.toLowerCase().includes(termo) ||
        (a.brinco_rfid || "").toLowerCase().includes(termo) ||
        (a.raca || "").toLowerCase().includes(termo)
      );
    });
  }, [dados.animais, busca, loteFiltro, statusFiltro]);

  // Aponta o bastão em qualquer lugar da lista pra pular direto pra
  // ficha do animal — funciona tanto pelo brinco visual quanto pelo RFID.
  const aoLerTagLista = useCallback(
    (tag) => {
      const animal = encontrarAnimalPorTag(dados.animais, tag);
      if (animal) {
        setAvisoScan("");
        setAnimalSelecionado(animal);
        setModo("detalhe");
      } else {
        setAvisoScan(`Nenhum animal encontrado com "${tag}". Toque em "Novo" para cadastrar.`);
      }
    },
    [dados.animais]
  );
  useRfidScanner(aoLerTagLista, { ativo: modo === "lista" });

  if (modo === "novo") {
    return (
      <FormAnimal
        dados={dados}
        onSalvar={async (payload) => {
          const criado = await dados.criarAnimal(payload);
          // Se já entrou direto num lote, registra a movimentação de
          // entrada — assim a ficha do animal mostra isso na linha do
          // tempo, igual a qualquer outra transferência.
          if (payload.lote_atual_id) {
            await dados.registrarMovimentacao(criado.id, {
              tipo: "entrada",
              lote_destino_id: payload.lote_atual_id,
              local_destino_id: payload.local_atual_id || null,
              data: payload.data_entrada,
              observacoes: "Entrada no cadastro do animal",
            });
          }
          setModo("lista");
        }}
        onVarios={() => setModo("lote")}
        onCancelar={() => setModo("lista")}
      />
    );
  }

  if (modo === "lote") {
    return (
      <FormAnimaisEmLote
        dados={dados}
        onSalvar={async (payload) => {
          const criado = await dados.criarAnimal(payload);
          if (payload.lote_atual_id) {
            await dados.registrarMovimentacao(criado.id, {
              tipo: "entrada",
              lote_destino_id: payload.lote_atual_id,
              local_destino_id: payload.local_atual_id || null,
              data: payload.data_entrada,
              observacoes: "Entrada contínua de animais",
            });
          }
          return criado;
        }}
        onAtualizar={dados.atualizarAnimal}
        onExcluir={dados.excluirAnimal}
        onCancelar={() => setModo("lista")}
      />
    );
  }

  if (modo === "editar" && animalSelecionado) {
    return (
      <FormAnimal
        dados={dados}
        inicial={dados.animais.find((animal) => animal.id === animalSelecionado.id) || animalSelecionado}
        onSalvar={async (payload) => {
          await dados.atualizarAnimal(animalSelecionado.id, payload);
          setAnimalSelecionado(null);
          setModo("lista");
        }}
        onCancelar={() => { setAnimalSelecionado(null); setModo("lista"); }}
      />
    );
  }

  if (modo === "detalhe" && animalSelecionado) {
    return (
      <FichaAnimal
        dados={dados}
        animal={dados.animais.find((a) => a.id === animalSelecionado.id) || animalSelecionado}
        onVoltar={() => setModo("lista")}
        onExcluido={() => {
          setAnimalSelecionado(null);
          setModo("lista");
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Animais"
        subtitle="Cadastro individual e histórico completo do rebanho."
        actionLabel="Novo animal"
        onAction={() => setModo("novo")}
      />

      <button onClick={() => setModo("lote")} style={{ ...styles.linkBtn, width: "auto", marginTop: -10, marginBottom: 14, textAlign: "left" }}>
        Cadastrar vários animais de uma vez (entrada em lote)
      </button>

      <div style={styles.hardwareHint}>Pode apontar o bastão RFID aqui pra ir direto na ficha do animal.</div>
      {avisoScan && <div style={{ ...styles.errorBox, marginTop: 10, marginBottom: 10 }}>{avisoScan}</div>}

      <div style={styles.tableCard}>
        <div style={styles.tableFiltersRow}>
          <div style={styles.tableSearchBox}>
            <Search size={15} color="#9A9A94" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar animal (brinco visual, RFID ou raça)" style={styles.input} />
          </div>
          <select value={loteFiltro} onChange={(e) => setLoteFiltro(e.target.value)} style={styles.tableFilterSelect}>
            <option value="">Todos os lotes</option>
            {dados.lotes.map((l) => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} style={styles.tableFilterSelect}>
            <option value="">Status</option>
            {Object.entries(SITUACOES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div style={styles.tableCount}>{listaFiltrada.length} animal(is) exibidos</div>
        </div>

        {listaFiltrada.length === 0 && <EmptyHint text="Nenhum animal encontrado." />}

        {listaFiltrada.length > 0 && (
          <div className="table-view" style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeadRow}>
                  <th style={styles.tableTh}>Identificação</th>
                  <th style={styles.tableTh}>Lote / Local</th>
                  <th style={styles.tableTh}>Categoria</th>
                  <th style={styles.tableTh}>Último peso</th>
                  <th style={styles.tableTh}>GMD</th>
                  <th style={styles.tableTh}>Status</th>
                  <th style={styles.tableTh}></th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((a) => {
                  const { ultimaPesagem, gmd } = infoPesoAnimal(a, dados.pesagens);
                  const lote = dados.lotes.find((l) => l.id === a.lote_atual_id);
                  const local = dados.locais.find((l) => l.id === a.local_atual_id);
                  const status = statusAnimal(a, dados);
                  return (
                    <tr key={a.id} style={styles.tableRow} onClick={() => { setAnimalSelecionado(a); setModo("detalhe"); }}>
                      <td style={styles.tableTd}>
                        <div style={styles.tableCellTitle}>{a.brinco_atual}</div>
                        <div style={styles.tableCellSub}>{[a.raca, a.sexo === "macho" ? "Macho" : "Fêmea"].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td style={styles.tableTd}>
                        <div style={styles.tableCellTitle}>{lote ? lote.nome : "—"}</div>
                        <div style={styles.tableCellSub}>{local ? local.nome : "Sem local"}</div>
                      </td>
                      <td style={styles.tableTd}>{a.categoria || "—"}</td>
                      <td style={styles.tableTd}>{ultimaPesagem ? formatKg(ultimaPesagem.peso) : "—"}</td>
                      <td style={styles.tableTd}>
                        {gmd != null ? <span style={gmd >= 0.5 ? styles.gmdBom : styles.gmdBaixo}>{gmd.toFixed(2)} kg/d</span> : "—"}
                      </td>
                      <td style={styles.tableTd}>
                        <span style={{ ...styles.statusBadge, ...STATUS_BADGE_STYLE[status.cor] }}>{status.rotulo}</span>
                      </td>
                      <td style={{ ...styles.tableTd, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setAnimalSelecionado(a);
                            setModo("editar");
                          }}
                          aria-label={`Editar animal ${a.brinco_atual}`}
                          title="Editar animal"
                          style={{ ...styles.iconEditBtn, marginRight: 8 }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            excluirDireto(a);
                          }}
                          disabled={excluindoId === a.id}
                          aria-label={`Excluir animal ${a.brinco_atual}`}
                          title="Excluir animal"
                          style={{ ...styles.iconDangerBtn, marginRight: 8, opacity: excluindoId === a.id ? 0.5 : 1 }}
                        >
                          <Trash2 size={15} />
                        </button>
                        <ChevronRight size={16} color="#C9C7BE" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-view" style={{ padding: listaFiltrada.length > 0 ? "10px 14px 14px" : 0 }}>
          {listaFiltrada.map((a) => {
            const status = statusAnimal(a, dados);
            const { ultimaPesagem, gmd } = infoPesoAnimal(a, dados.pesagens);
            return (
              <div key={a.id} style={{ ...styles.listItem, display: "flex" }}>
                <button
                  type="button"
                  style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, border: 0, background: "transparent", padding: 0 }}
                  onClick={() => { setAnimalSelecionado(a); setModo("detalhe"); }}
                >
                  <div style={styles.avatar}><TagIcon size={17} /></div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={styles.listItemTitle}>{a.brinco_atual}</div>
                    <div style={styles.listItemSub}>
                      {[a.raca, a.categoria].filter(Boolean).join(" · ") || "—"}
                      {a.brinco_rfid ? ` · RFID ${a.brinco_rfid}` : ""}
                    </div>
                    <div style={{ ...styles.listItemSub, marginTop: 2 }}>
                      {ultimaPesagem ? `${formatKg(ultimaPesagem.peso)} em ${formatDataBR(ultimaPesagem.data)}` : "Sem pesagem registrada"}
                      {gmd != null && <span style={{ marginLeft: 6, ...(gmd >= 0.5 ? styles.gmdBom : styles.gmdBaixo) }}>{gmd.toFixed(2)} kg/d</span>}
                    </div>
                  </div>
                </button>
                <span style={{ ...styles.statusBadge, ...STATUS_BADGE_STYLE[status.cor] }}>{status.rotulo}</span>
                <button
                  type="button"
                  onClick={() => { setAnimalSelecionado(a); setModo("editar"); }}
                  aria-label={`Editar animal ${a.brinco_atual}`}
                  title="Editar animal"
                  style={{ ...styles.iconEditBtn, marginLeft: 8 }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => excluirDireto(a)}
                  disabled={excluindoId === a.id}
                  aria-label={`Excluir animal ${a.brinco_atual}`}
                  title="Excluir animal"
                  style={{ ...styles.iconDangerBtn, marginLeft: 8, opacity: excluindoId === a.id ? 0.5 : 1 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function infoPesoAnimal(animal, pesagens) {
  const historico = [...pesagens.filter((p) => p.animal_id === animal.id)].sort(
    (a, b) => a.data.localeCompare(b.data) || (a.criado_em || "").localeCompare(b.criado_em || "")
  );
  const ultimaPesagem = historico[historico.length - 1];
  const referenciasAnteriores = historico.filter((p) => ultimaPesagem && p.data < ultimaPesagem.data);
  if (
    ultimaPesagem &&
    animal.peso_entrada != null &&
    animal.data_entrada &&
    animal.data_entrada < ultimaPesagem.data
  ) {
    referenciasAnteriores.push({ peso: animal.peso_entrada, data: animal.data_entrada });
  }
  referenciasAnteriores.sort((a, b) => a.data.localeCompare(b.data));
  const referenciaAnterior = referenciasAnteriores[referenciasAnteriores.length - 1];
  const gmd = referenciaAnterior && ultimaPesagem
    ? calcularGmd(referenciaAnterior.peso, referenciaAnterior.data, ultimaPesagem.peso, ultimaPesagem.data)
    : null;
  return { ultimaPesagem, gmd };
}

// ---------- Formulário de cadastro (com captura RFID) ----------
function FormAnimal({ dados, onSalvar, onCancelar, onVarios, inicial }) {
  const [brinco, setBrinco] = useState(inicial?.brinco_atual || "");
  const [brincoRfid, setBrincoRfid] = useState(inicial?.brinco_rfid || "");
  const [sexo, setSexo] = useState(inicial?.sexo || "femea");
  const [raca, setRaca] = useState(inicial?.raca || "");
  const [origem, setOrigem] = useState(inicial?.origem || "");
  const [fornecedorId, setFornecedorId] = useState(inicial?.fornecedor_id || "");
  const [loteId, setLoteId] = useState(inicial?.lote_atual_id || "");
  const [categoria, setCategoria] = useState(inicial?.categoria || "");
  const [dataEntrada, setDataEntrada] = useState(inicial?.data_entrada || new Date().toISOString().slice(0, 10));
  const [pesoEntrada, setPesoEntrada] = useState(inicial?.peso_entrada ?? "");
  const [pesoDaBalanca, setPesoDaBalanca] = useState(false);
  const [modoValor, setModoValor] = useState("total"); // total | arroba
  const [valorEntrada, setValorEntrada] = useState(inicial?.valor_entrada ?? "");
  const [precoArroba, setPrecoArroba] = useState("");
  const [observacoes, setObservacoes] = useState(inicial?.observacoes || "");
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [nomeNovoFornecedor, setNomeNovoFornecedor] = useState("");
  const [novoLote, setNovoLote] = useState(false);
  const [nomeNovoLote, setNomeNovoLote] = useState("");
  const [notaFiscalFile, setNotaFiscalFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const aoLerTag = useCallback((tag) => setBrincoRfid(tag), []);
  const { lendo } = useRfidScanner(aoLerTag);

  const escala = useBluetoothScale();
  useEffect(() => {
    if (escala.peso != null) {
      setPesoEntrada(String(escala.peso));
      setPesoDaBalanca(true);
    }
  }, [escala.leituraId, escala.peso]);

  function handleEscolherFornecedor(id) {
    if (id === "__novo__") {
      setNovoFornecedor(true);
      setFornecedorId("");
      return;
    }
    setFornecedorId(id);
  }

  async function handleSalvar() {
    // Fazenda que só usa RFID (sem brinco visual): usa o próprio código
    // RFID como identificador principal também, já que brinco_atual é
    // obrigatório no cadastro.
    const brincoFinal = brinco.trim() || brincoRfid.trim();
    if (!brincoFinal) {
      setErro("Informe o brinco visual ou aponte o bastão RFID.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      let fornecedorIdFinal = fornecedorId;
      if (novoFornecedor && nomeNovoFornecedor.trim()) {
        const criado = await dados.criarFornecedor({ nome: nomeNovoFornecedor.trim() });
        fornecedorIdFinal = criado.id;
      }

      let loteIdFinal = loteId;
      if (novoLote) {
        if (!nomeNovoLote.trim()) throw new Error("Informe o nome do novo lote.");
        const criado = await dados.criarLote({ nome: nomeNovoLote.trim(), situacao: "ativo" });
        loteIdFinal = criado.id;
      }

      let notaFiscalUrl = inicial?.nota_fiscal_url || null;
      if (notaFiscalFile) {
        notaFiscalUrl = await enviarDocumentoRebanho(notaFiscalFile);
      }

      const valorPorArroba = calcularValorPorArroba(pesoEntrada, precoArroba);
      const valorFinal = modoValor === "arroba" ? valorPorArroba : (valorEntrada === "" ? null : Number(valorEntrada));
      const loteEscolhido = dados.lotes.find((l) => l.id === loteIdFinal);

      await onSalvar({
        brinco_atual: brincoFinal,
        brinco_rfid: brincoRfid.trim() || null,
        sexo,
        raca: raca || null,
        origem: origem || null,
        fornecedor_id: fornecedorIdFinal || null,
        categoria: categoria || null,
        data_entrada: dataEntrada,
        peso_entrada: pesoEntrada === "" ? null : Number(pesoEntrada),
        valor_entrada: valorFinal,
        observacoes: observacoes || null,
        nota_fiscal_url: notaFiscalUrl,
        lote_atual_id: loteIdFinal || null,
        local_atual_id: loteEscolhido?.local_id || null,
      });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={inicial ? "Editar animal" : "Novo animal"} onBack={onCancelar} />
      {!inicial && onVarios && (
        <button type="button" onClick={onVarios} style={{ ...styles.secondaryBtn, marginTop: 0, marginBottom: 12 }}>
          Cadastrar vários animais
        </button>
      )}

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para preencher o brinco eletrônico automaticamente"}
        </div>
      </div>

      <div style={styles.card}>
        <InputField label="Brinco visual" value={brinco} onChange={setBrinco} placeholder="Número do brinco (se a fazenda usa)" />
        <InputField label="Brinco RFID (eletrônico)" value={brincoRfid} onChange={setBrincoRfid} placeholder="Lido pelo bastão, ou digite" />
        <SelectField label="Sexo" value={sexo} onChange={setSexo} options={[{ value: "femea", label: "Fêmea" }, { value: "macho", label: "Macho" }]} />
        <SelectField
          label="Raça"
          value={raca}
          onChange={setRaca}
          options={[{ value: "", label: "Selecione..." }, ...RACAS.map((nome) => ({ value: nome, label: nome }))]}
        />
        <SelectField
          label="Categoria"
          value={categoria}
          onChange={setCategoria}
          options={[
            { value: "", label: "Selecione..." },
            { value: "Boi", label: "Boi" },
            { value: "Vaca", label: "Vaca" },
            { value: "Novilha", label: "Novilha" },
            { value: "Bezerro", label: "Bezerro" },
          ]}
        />
        <InputField label="Origem" value={origem} onChange={setOrigem} placeholder="De onde veio o animal" />

        {!novoFornecedor ? (
          <SelectField
            label="Fornecedor"
            value={fornecedorId}
            onChange={handleEscolherFornecedor}
            options={[
              { value: "", label: "Sem fornecedor" },
              ...dados.fornecedores.map((f) => ({ value: f.id, label: f.nome })),
              { value: "__novo__", label: "+ Cadastrar novo fornecedor" },
            ]}
          />
        ) : (
          <InputField label="Nome do novo fornecedor" value={nomeNovoFornecedor} onChange={setNomeNovoFornecedor} placeholder="Ex: Fazenda São José" />
        )}

        {!novoLote ? (
          <SelectField
            label="Lote"
            value={loteId}
            onChange={(id) => {
              if (id === "__novo__") {
                setNovoLote(true);
                setLoteId("");
              } else {
                setLoteId(id);
              }
            }}
            options={[
              { value: "", label: "Sem lote definido" },
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
        )}
        <InputField label="Data de entrada" type="date" value={dataEntrada} onChange={setDataEntrada} />

        {escala.suportado ? (
          <button
            type="button"
            onClick={escala.conectado ? escala.desconectar : escala.conectar}
            disabled={escala.conectando}
            style={{ ...styles.scaleBtn, ...(escala.conectado ? styles.scaleBtnConnected : {}), marginBottom: 12 }}
          >
            {escala.conectado ? <BluetoothConnected size={17} /> : <Bluetooth size={17} />}
            {escala.conectando ? "Conectando..." : escala.conectado ? `Conectado: ${escala.dispositivo}` : "Conectar balança Bluetooth"}
          </button>
        ) : (
          <div style={{ ...styles.hardwareHint, marginBottom: 12 }}>
            Este aparelho/navegador não conecta com balança Bluetooth diretamente (comum no iPhone/iPad).
            Digite o peso mostrado na balança abaixo.
          </div>
        )}
        {escala.erro && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{escala.erro}</div>}
        {escala.conectando && escala.dispositivosEncontrados?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
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
        <InputField
          label={`Peso de entrada (kg)${pesoDaBalanca ? " — lido da balança" : ""}`}
          type="number"
          value={pesoEntrada}
          onChange={(v) => { setPesoEntrada(v); setPesoDaBalanca(false); }}
          placeholder="0"
        />

        <div style={styles.viewToggle}>
          <button onClick={() => setModoValor("total")} style={modoValor === "total" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Valor total</button>
          <button onClick={() => setModoValor("arroba")} style={modoValor === "arroba" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Preço da arroba</button>
        </div>

        {modoValor === "total" ? (
          <InputField label="Valor de entrada (R$)" type="number" value={valorEntrada} onChange={setValorEntrada} placeholder="0,00" />
        ) : (
          <>
            <InputField label="Preço da arroba (R$)" type="number" value={precoArroba} onChange={setPrecoArroba} placeholder="0,00" />
            <div style={styles.hardwareHint}>
              {pesoEntrada === "" || precoArroba === ""
                ? "Informe o peso de entrada e o preço da arroba (considerando arroba de 30 kg) para calcular o valor."
                : `Valor calculado: ${formatBRL(calcularValorPorArroba(pesoEntrada, precoArroba))} (${(Number(pesoEntrada) / 30).toFixed(2)} arrobas de 30 kg)`}
            </div>
          </>
        )}

        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />

        <label style={styles.field}>
          <div style={styles.fieldLabel}>Nota fiscal (opcional)</div>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setNotaFiscalFile(e.target.files?.[0] || null)} />
          {!notaFiscalFile && inicial?.nota_fiscal_url && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {inicial.nota_fiscal_url.startsWith("rastro-pendente://") ? (
                <span>Anexo salvo no aparelho · aguardando sincronização</span>
              ) : (
                <a href={inicial.nota_fiscal_url} target="_blank" rel="noopener noreferrer">Ver nota fiscal já anexada</a>
              )}
            </div>
          )}
        </label>
      </div>

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar animal"}</PrimaryButton>
    </div>
  );
}

// ---------- Cadastro contínuo no curral: cada animal mantém brinco e
// peso próprios, enquanto os dados do grupo permanecem preenchidos. ----------
function FormAnimaisEmLote({ dados, onSalvar, onAtualizar, onExcluir, onCancelar }) {
  const [brinco, setBrinco] = useState("");
  const [brincoRfid, setBrincoRfid] = useState("");
  const [peso, setPeso] = useState("");
  const [pesoDaBalanca, setPesoDaBalanca] = useState(false);
  const [sexo, setSexo] = useState("femea");
  const [raca, setRaca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [origem, setOrigem] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [nomeNovoFornecedor, setNomeNovoFornecedor] = useState("");
  const [loteId, setLoteId] = useState("");
  const [novoLote, setNovoLote] = useState(false);
  const [nomeNovoLote, setNomeNovoLote] = useState("");
  const [dataEntrada, setDataEntrada] = useState(new Date().toISOString().slice(0, 10));
  const [modoValor, setModoValor] = useState("total");
  const [valorEntrada, setValorEntrada] = useState("");
  const [precoArroba, setPrecoArroba] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [notaFiscalFile, setNotaFiscalFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [recentes, setRecentes] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const brincoRef = useRef(null);

  const loteEscolhido = dados.lotes.find((l) => l.id === loteId);
  const aoLerTag = useCallback((tag) => setBrincoRfid(tag), []);
  const { lendo } = useRfidScanner(aoLerTag);
  const escala = useBluetoothScale();

  useEffect(() => {
    if (escala.peso == null) return;
    setPeso(String(escala.peso));
    setPesoDaBalanca(true);
  }, [escala.leituraId, escala.peso]);

  function handleEscolherFornecedor(id) {
    if (id === "__novo__") {
      setNovoFornecedor(true);
      setFornecedorId("");
      return;
    }
    setFornecedorId(id);
  }

  async function handleSalvar() {
    const brincoFinal = brinco.trim() || brincoRfid.trim();
    if (!brincoFinal) { setErro("Informe o brinco visual ou leia o RFID."); return; }
    if (!peso || Number(peso) <= 0) { setErro("Informe o peso individual do animal."); return; }
    setErro("");
    setSalvando(true);
    try {
      let fornecedorIdFinal = fornecedorId;
      if (novoFornecedor) {
        if (!nomeNovoFornecedor.trim()) throw new Error("Informe o nome do novo fornecedor.");
        const criado = await dados.criarFornecedor({ nome: nomeNovoFornecedor.trim() });
        fornecedorIdFinal = criado.id;
        setFornecedorId(criado.id);
        setNovoFornecedor(false);
        setNomeNovoFornecedor("");
      }

      let loteIdFinal = loteId;
      let loteFinal = loteEscolhido;
      if (novoLote) {
        if (!nomeNovoLote.trim()) throw new Error("Informe o nome do novo lote.");
        const criado = await dados.criarLote({ nome: nomeNovoLote.trim(), situacao: "ativo" });
        loteIdFinal = criado.id;
        loteFinal = criado;
        setLoteId(criado.id);
        setNovoLote(false);
        setNomeNovoLote("");
      }

      const animalEmEdicao = recentes.find((animal) => animal.id === editandoId);
      let notaFiscalUrl = animalEmEdicao?.nota_fiscal_url || null;
      if (notaFiscalFile) notaFiscalUrl = await enviarDocumentoRebanho(notaFiscalFile);

      const valorFinal = modoValor === "arroba"
        ? calcularValorPorArroba(peso, precoArroba)
        : (valorEntrada === "" ? null : Number(valorEntrada));
      const payload = {
        brinco_atual: brincoFinal,
        brinco_rfid: brincoRfid.trim() || null,
        sexo,
        raca: raca || null,
        categoria: categoria || null,
        origem: origem || null,
        fornecedor_id: fornecedorIdFinal || null,
        peso_entrada: Number(peso),
        valor_entrada: valorFinal,
        data_entrada: dataEntrada,
        lote_atual_id: loteIdFinal || null,
        local_atual_id: loteFinal?.local_id || null,
        observacoes: observacoes || null,
        nota_fiscal_url: notaFiscalUrl,
      };
      if (editandoId) {
        const atualizado = await onAtualizar(editandoId, payload);
        setRecentes((atuais) => atuais.map((animal) => animal.id === editandoId ? atualizado : animal));
        setEditandoId(null);
      } else {
        const criado = await onSalvar(payload);
        setRecentes((atuais) => [criado, ...atuais]);
      }
      setBrinco("");
      setBrincoRfid("");
      setPeso("");
      setPesoDaBalanca(false);
      setValorEntrada("");
      setNotaFiscalFile(null);
      requestAnimationFrame(() => brincoRef.current?.focus());
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Cadastrar vários animais" onBack={onCancelar} />
      <div style={styles.hardwareHint}>
        Mesma ficha do cadastro individual. Após salvar, os dados do grupo permanecem preenchidos; brinco, RFID, peso, valor total e documento ficam prontos para o próximo animal.
      </div>

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para preencher o brinco eletrônico"}
        </div>
      </div>

      <div style={styles.card}>
        <InputField label="Brinco visual" value={brinco} onChange={setBrinco} inputRef={brincoRef} placeholder="Número do brinco" />
        <InputField label="Brinco RFID (eletrônico)" value={brincoRfid} onChange={setBrincoRfid} placeholder="Lido pelo bastão, ou digite" />
        {escala.suportado ? (
          <button
            type="button"
            onClick={escala.conectado ? escala.desconectar : escala.conectar}
            disabled={escala.conectando}
            style={{ ...styles.scaleBtn, ...(escala.conectado ? styles.scaleBtnConnected : {}), marginBottom: 12 }}
          >
            {escala.conectado ? <BluetoothConnected size={17} /> : <Bluetooth size={17} />}
            {escala.conectando ? "Conectando..." : escala.conectado ? `Conectado: ${escala.dispositivo}` : "Conectar balança Bluetooth"}
          </button>
        ) : (
          <div style={{ ...styles.hardwareHint, marginBottom: 12 }}>Neste aparelho, digite manualmente o peso mostrado na balança.</div>
        )}
        {escala.erro && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{escala.erro}</div>}
        {escala.conectando && escala.dispositivosEncontrados?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
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
        <InputField
          label={`Peso individual (kg)${pesoDaBalanca ? " — lido da balança" : ""}`}
          type="number"
          value={peso}
          onChange={(valor) => { setPeso(valor); setPesoDaBalanca(false); }}
          placeholder="0"
        />
        <SelectField label="Sexo" value={sexo} onChange={setSexo} options={[{ value: "femea", label: "Fêmea" }, { value: "macho", label: "Macho" }]} />
        <SelectField
          label="Raça"
          value={raca}
          onChange={setRaca}
          options={[{ value: "", label: "Selecione..." }, ...RACAS.map((nome) => ({ value: nome, label: nome }))]}
        />
        <SelectField
          label="Categoria"
          value={categoria}
          onChange={setCategoria}
          options={[
            { value: "", label: "Selecione..." },
            { value: "Boi", label: "Boi" },
            { value: "Vaca", label: "Vaca" },
            { value: "Novilha", label: "Novilha" },
            { value: "Bezerro", label: "Bezerro" },
          ]}
        />
        <InputField label="Origem" value={origem} onChange={setOrigem} placeholder="De onde vieram os animais" />

        {!novoFornecedor ? (
          <SelectField
            label="Fornecedor"
            value={fornecedorId}
            onChange={handleEscolherFornecedor}
            options={[
              { value: "", label: "Sem fornecedor" },
              ...dados.fornecedores.map((f) => ({ value: f.id, label: f.nome })),
              { value: "__novo__", label: "+ Cadastrar novo fornecedor" },
            ]}
          />
        ) : (
          <InputField label="Nome do novo fornecedor" value={nomeNovoFornecedor} onChange={setNomeNovoFornecedor} placeholder="Ex: Fazenda São José" />
        )}

        {!novoLote ? (
          <SelectField
            label="Lote"
            value={loteId}
            onChange={(id) => {
              if (id === "__novo__") {
                setNovoLote(true);
                setLoteId("");
              } else {
                setLoteId(id);
              }
            }}
            options={[
              { value: "", label: "Sem lote definido" },
              ...dados.lotes.map((l) => ({ value: l.id, label: l.nome })),
              { value: "__novo__", label: "+ Criar novo lote" },
            ]}
          />
        ) : (
          <InputField label="Nome do novo lote" value={nomeNovoLote} onChange={setNomeNovoLote} placeholder="Ex: Recria Águas 04" />
        )}

        <InputField label="Data de entrada" type="date" value={dataEntrada} onChange={setDataEntrada} />

        <div style={styles.viewToggle}>
          <button type="button" onClick={() => setModoValor("total")} style={modoValor === "total" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Valor total</button>
          <button type="button" onClick={() => setModoValor("arroba")} style={modoValor === "arroba" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Preço da arroba</button>
        </div>
        {modoValor === "total" ? (
          <InputField label="Valor de entrada (R$)" type="number" value={valorEntrada} onChange={setValorEntrada} placeholder="0,00" />
        ) : (
          <>
            <InputField label="Preço da arroba (R$)" type="number" value={precoArroba} onChange={setPrecoArroba} placeholder="0,00" />
            <div style={styles.hardwareHint}>
              {peso === "" || precoArroba === ""
                ? "Informe o peso e o preço da arroba para calcular o valor."
                : `Valor calculado: ${formatBRL(calcularValorPorArroba(peso, precoArroba))}`}
            </div>
          </>
        )}

        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
        <label style={styles.field}>
          <div style={styles.fieldLabel}>Nota fiscal (opcional)</div>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setNotaFiscalFile(e.target.files?.[0] || null)} />
        </label>
      </div>

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>
        {salvando ? "Salvando..." : editandoId ? "Salvar correção" : "Salvar e cadastrar próximo"}
      </PrimaryButton>

      {recentes.length > 0 && (
        <>
          <SectionTitle>Cadastrados nesta sequência</SectionTitle>
          {recentes.map((animal) => (
            <div key={animal.id} style={styles.rowCard}>
              <div style={{ flex: 1 }}>
                <div style={styles.listItemTitle}>{animal.brinco_atual}</div>
                <div style={styles.listItemSub}>{formatKg(animal.peso_entrada)} · {animal.raca || "Sem raça"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={styles.editLinkBtn}
                  onClick={() => {
                    setEditandoId(animal.id);
                    setBrinco(animal.brinco_atual || "");
                    setBrincoRfid(animal.brinco_rfid || "");
                    setPeso(animal.peso_entrada ?? "");
                    setPesoDaBalanca(false);
                    setSexo(animal.sexo || "femea");
                    setRaca(animal.raca || "");
                    setCategoria(animal.categoria || "");
                    setOrigem(animal.origem || "");
                    setFornecedorId(animal.fornecedor_id || "");
                    setLoteId(animal.lote_atual_id || "");
                    setDataEntrada(animal.data_entrada || new Date().toISOString().slice(0, 10));
                    setModoValor("total");
                    setValorEntrada(animal.valor_entrada ?? "");
                    setObservacoes(animal.observacoes || "");
                    requestAnimationFrame(() => brincoRef.current?.focus());
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  style={{ ...styles.editLinkBtn, color: "#A13D32" }}
                  onClick={async () => {
                    if (!window.confirm(`Excluir o animal ${animal.brinco_atual}? O histórico individual também será removido.`)) return;
                    try {
                      await onExcluir(animal.id);
                      setRecentes((atuais) => atuais.filter((item) => item.id !== animal.id));
                      if (editandoId === animal.id) {
                        setEditandoId(null);
                        setBrinco("");
                        setPeso("");
                        setPesoDaBalanca(false);
                      }
                    } catch (err) {
                      setErro(err.message);
                    }
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={onCancelar} style={styles.secondaryBtn}>Concluir e voltar para a lista</button>
        </>
      )}
    </div>
  );
}

// ---------- Ficha individual ----------
function FichaAnimal({ dados, animal, onVoltar, onExcluido }) {
  const [editando, setEditando] = useState(false);
  const [excluindoTimeline, setExcluindoTimeline] = useState(null);
  const [itemTimelineEditando, setItemTimelineEditando] = useState(null);

  const lote = dados.lotes.find((l) => l.id === animal.lote_atual_id);
  const local = dados.locais.find((l) => l.id === animal.local_atual_id);
  const fornecedor = dados.fornecedores.find((f) => f.id === animal.fornecedor_id);

  const { ultimaPesagem, gmd } = useMemo(
    () => infoPesoAnimal(animal, dados.pesagens),
    [animal, dados.pesagens]
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const gmdDesdeEntrada = ultimaPesagem
    ? calcularGmd(animal.peso_entrada, animal.data_entrada, ultimaPesagem.peso, hoje)
    : null;

  const timeline = useMemo(() => {
    const itens = [];
    for (const p of dados.pesagens.filter((x) => x.animal_id === animal.id)) {
      itens.push({ id: p.id || p.client_uuid, data: p.data, tipo: "pesagem", registro: p, icone: Scale, titulo: `Pesagem: ${formatKg(p.peso)}`, sub: p.origem_peso === "bluetooth" ? "Via balança Bluetooth" : "Digitado manualmente" });
    }
    for (const m of dados.movimentacoes.filter((x) => x.animal_id === animal.id)) {
      const dadosVenda = (m.tipo === "venda" || m.tipo === "abate")
        ? [`Peso: ${formatKg(m.peso_saida)}`, `Arroba: ${formatBRL(m.preco_arroba)}`, `Rendimento: ${m.rendimento_carcaca ?? "—"}%`].join(" · ")
        : "";
      itens.push({ id: m.id || m.client_uuid, data: m.data, tipo: "movimentacao", registro: m, icone: ArrowLeftRight, titulo: rotuloMovimentacao(m), sub: [dadosVenda, m.observacoes].filter(Boolean).join(" · ") });
    }
    for (const p of dados.procedimentos.filter((x) => x.animal_id === animal.id)) {
      itens.push({ id: p.id || p.client_uuid, data: p.data_aplicacao, tipo: "sanidade", registro: p, icone: Syringe, titulo: rotuloProcedimento(p, dados.medicamentos), sub: p.observacoes || "" });
    }
    return itens.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [dados, animal.id]);

  async function excluirItemTimeline(item) {
    if (!window.confirm(`Excluir "${item.titulo}" de ${formatDataBR(item.data)}?`)) return;
    setExcluindoTimeline(item.id);
    try {
      if (item.tipo === "pesagem") await dados.excluirPesagem(item.registro);
      if (item.tipo === "movimentacao") await dados.excluirMovimentacao(item.registro);
      if (item.tipo === "sanidade") await dados.excluirProcedimento(item.registro);
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir esta informação.");
    } finally {
      setExcluindoTimeline(null);
    }
  }

  if (editando) {
    return (
      <FormAnimal
        dados={dados}
        inicial={animal}
        onSalvar={async (payload) => {
          await dados.atualizarAnimal(animal.id, payload);
          setEditando(false);
        }}
        onCancelar={() => setEditando(false)}
      />
    );
  }

  if (itemTimelineEditando) {
    return (
      <FormEditarTimeline
        dados={dados}
        item={itemTimelineEditando}
        onCancelar={() => setItemTimelineEditando(null)}
        onSalvo={() => setItemTimelineEditando(null)}
      />
    );
  }

  return (
    <div>
      <div style={styles.backHeaderRow}>
        <BackHeader title={animal.brinco_atual} onBack={onVoltar} semMargem />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.editLinkBtn} onClick={() => setEditando(true)}>Editar</button>
          <button
            style={{ ...styles.editLinkBtn, color: "#A13D32" }}
            onClick={async () => {
              if (!window.confirm(`Excluir o animal ${animal.brinco_atual}? Pesagens, movimentações e sanidade também serão removidas.`)) return;
              try {
                await dados.excluirAnimal(animal.id);
                onExcluido();
              } catch (err) {
                window.alert(err.message);
              }
            }}
          >
            Excluir
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <Field label="Situação" value={SITUACOES[animal.situacao] || animal.situacao} highlight />
        {animal.brinco_rfid && <Field label="Brinco RFID (eletrônico)" value={animal.brinco_rfid} />}
        <Field label="Sexo" value={animal.sexo === "macho" ? "Macho" : "Fêmea"} />
        <Field label="Raça" value={animal.raca || "—"} />
        <Field label="Categoria" value={animal.categoria || "—"} />
        <Field label="Lote atual" value={lote ? lote.nome : "—"} />
        <Field label="Local atual" value={local ? local.nome : "—"} />
        <Field label="Último peso" value={ultimaPesagem ? `${formatKg(ultimaPesagem.peso)} em ${formatDataBR(ultimaPesagem.data)}` : "Sem pesagem registrada"} />
        <Field label="GMD (última x penúltima pesagem)" value={gmd != null ? `${gmd.toFixed(3)} kg/dia` : "—"} />
        <Field
          label={`GMD desde a entrada até hoje (${formatDataBR(hoje)})`}
          value={gmdDesdeEntrada != null
            ? `${gmdDesdeEntrada.toFixed(3)} kg/dia · baseado no último peso conhecido`
            : "Aguardando uma pesagem posterior à entrada"}
        />
        <Field label="Fornecedor" value={fornecedor ? fornecedor.nome : "—"} />
        <Field label="Entrada" value={`${formatDataBR(animal.data_entrada)} · ${formatKg(animal.peso_entrada)} · ${formatBRL(animal.valor_entrada)}`} />
        {animal.nota_fiscal_url && (
          <Field
            label="Nota fiscal"
            value={animal.nota_fiscal_url.startsWith("rastro-pendente://")
              ? "Anexo salvo no aparelho · aguardando sincronização"
              : <a href={animal.nota_fiscal_url} target="_blank" rel="noopener noreferrer">Ver arquivo anexado</a>}
          />
        )}
        {animal.observacoes && <Field label="Observações" value={animal.observacoes} multiline />}
      </div>

      <SectionTitle>Linha do tempo</SectionTitle>
      {timeline.length === 0 && <EmptyHint text="Nenhum registro ainda para este animal." />}
      <div style={{ paddingLeft: 2 }}>
        {timeline.map((item, i) => {
          const Icone = item.icone;
          return (
            <div key={`${item.tipo}-${item.id || i}`} style={styles.timelineItem}>
              {i < timeline.length - 1 && <div style={styles.timelineLine} />}
              <div style={styles.timelineDot} />
              <div style={styles.timelineContent}>
                <div style={styles.timelineTitulo}><Icone size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{item.titulo}</div>
                <div style={styles.timelineData}>{formatDataBR(item.data)}{item.sub ? ` · ${item.sub}` : ""}</div>
              </div>
              <button
                type="button"
                onClick={() => setItemTimelineEditando(item)}
                aria-label={`Editar ${item.titulo}`}
                title="Editar informação"
                style={{ ...styles.iconEditBtn, marginLeft: 8 }}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => excluirItemTimeline(item)}
                disabled={excluindoTimeline === item.id}
                aria-label={`Excluir ${item.titulo}`}
                title="Excluir informação"
                style={{ ...styles.iconDangerBtn, marginLeft: 8, opacity: excluindoTimeline === item.id ? 0.5 : 1 }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormEditarTimeline({ dados, item, onCancelar, onSalvo }) {
  const registro = item.registro;
  const [data, setData] = useState(item.data || "");
  const [peso, setPeso] = useState(registro.peso ?? "");
  const [origemPeso, setOrigemPeso] = useState(registro.origem_peso || "manual");
  const [loteDestinoId, setLoteDestinoId] = useState(registro.lote_destino_id || "");
  const [localDestinoId, setLocalDestinoId] = useState(registro.local_destino_id || "");
  const [tipoSanidade, setTipoSanidade] = useState(registro.tipo || "vacina");
  const [medicamentoId, setMedicamentoId] = useState(registro.medicamento_id || "");
  const [dose, setDose] = useState(registro.dose || "");
  const [proximaAplicacao, setProximaAplicacao] = useState(registro.proxima_aplicacao || "");
  const [carenciaDias, setCarenciaDias] = useState(String(registro.carencia_dias ?? 0));
  const [observacoes, setObservacoes] = useState(registro.observacoes || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const escala = useBluetoothScale();

  useEffect(() => {
    if (item.tipo !== "pesagem" || escala.peso == null) return;
    setPeso(String(escala.peso));
    setOrigemPeso("bluetooth");
  }, [item.tipo, escala.leituraId, escala.peso]);

  async function handleSalvar() {
    setSalvando(true);
    setErro("");
    try {
      if (item.tipo === "pesagem") {
        if (!peso || Number(peso) <= 0) throw new Error("Informe um peso válido.");
        await dados.atualizarPesagem(registro, {
          peso: Number(peso),
          data,
          origem_peso: origemPeso,
          dispositivo: origemPeso === "bluetooth" ? escala.dispositivo : null,
        });
      } else if (item.tipo === "movimentacao") {
        const mudancas = { data, observacoes: observacoes || null };
        if (registro.tipo === "transferencia_lote" || registro.tipo === "entrada") mudancas.lote_destino_id = loteDestinoId || null;
        if (registro.tipo === "transferencia_local" || registro.tipo === "entrada") mudancas.local_destino_id = localDestinoId || null;
        await dados.atualizarMovimentacao(registro, mudancas);
      } else {
        const mudancas = {
          tipo: tipoSanidade,
          medicamento_id: medicamentoId || null,
          dose: dose || null,
          data_aplicacao: data,
          proxima_aplicacao: proximaAplicacao || null,
          carencia_dias: Number(carenciaDias) || 0,
          observacoes: observacoes || null,
        };
        if (registro.grupo_lancamento) await dados.atualizarProcedimentosEmGrupo(registro.grupo_lancamento, mudancas);
        else await dados.atualizarProcedimento(registro, mudancas);
      }
      onSalvo();
    } catch (err) {
      setErro(err.message || "Não foi possível salvar as alterações.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={`Editar ${item.titulo}`} onBack={onCancelar} />
      <div style={styles.card}>
        {item.tipo === "pesagem" && (
          <>
            {escala.suportado ? (
              <button
                type="button"
                onClick={escala.conectado ? escala.desconectar : escala.conectar}
                disabled={escala.conectando}
                style={{ ...styles.scaleBtn, ...(escala.conectado ? styles.scaleBtnConnected : {}), marginBottom: 12 }}
              >
                {escala.conectado ? <BluetoothConnected size={17} /> : <Bluetooth size={17} />}
                {escala.conectando ? "Conectando..." : escala.conectado ? `Conectado: ${escala.dispositivo}` : "Conectar balança Bluetooth"}
              </button>
            ) : (
              <div style={{ ...styles.hardwareHint, marginBottom: 12 }}>Neste aparelho, digite manualmente o peso mostrado na balança.</div>
            )}
            {escala.erro && <div style={{ ...styles.errorBox, marginBottom: 12 }}>{escala.erro}</div>}
            {escala.conectando && escala.dispositivosEncontrados?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={styles.hardwareHint}>Toque na balança para conectar:</div>
                {escala.dispositivosEncontrados.map((dispositivo) => (
                  <button
                    key={dispositivo.endereco}
                    type="button"
                    onClick={() => escala.conectarEm(dispositivo.endereco, dispositivo.nome)}
                    style={{ ...styles.rowCard, width: "100%", cursor: "pointer", textAlign: "left" }}
                  >
                    <Scale size={16} /> {dispositivo.nome}
                  </button>
                ))}
              </div>
            )}
            <InputField
              label={`Peso (kg)${origemPeso === "bluetooth" ? " — lido da balança" : ""}`}
              type="number"
              value={peso}
              onChange={(valor) => { setPeso(valor); setOrigemPeso("manual"); }}
            />
          </>
        )}
        {item.tipo === "sanidade" && (
          <>
            <SelectField label="Tipo" value={tipoSanidade} onChange={setTipoSanidade} options={[
              { value: "vacina", label: "Vacinação" },
              { value: "vermifugo", label: "Vermifugação" },
              { value: "diagnostico", label: "Diagnóstico" },
              { value: "tratamento", label: "Tratamento" },
            ]} />
            <SelectField label="Medicamento" value={medicamentoId} onChange={setMedicamentoId} options={[
              { value: "", label: "Sem medicamento" },
              ...dados.medicamentos.map((medicamento) => ({ value: medicamento.id, label: medicamento.nome })),
            ]} />
            <InputField label="Dose" value={dose} onChange={setDose} />
            <InputField label="Próxima aplicação" type="date" value={proximaAplicacao} onChange={setProximaAplicacao} />
            <InputField label="Carência (dias)" type="number" value={carenciaDias} onChange={setCarenciaDias} />
          </>
        )}
        {item.tipo === "movimentacao" && (registro.tipo === "transferencia_lote" || registro.tipo === "entrada") && (
          <SelectField label="Lote de destino" value={loteDestinoId} onChange={setLoteDestinoId} options={[
            { value: "", label: "Sem lote" },
            ...dados.lotes.map((lote) => ({ value: lote.id, label: lote.nome })),
          ]} />
        )}
        {item.tipo === "movimentacao" && (registro.tipo === "transferencia_local" || registro.tipo === "entrada") && (
          <SelectField label="Local de destino" value={localDestinoId} onChange={setLocalDestinoId} options={[
            { value: "", label: "Sem local" },
            ...dados.locais.map((local) => ({ value: local.id, label: local.nome })),
          ]} />
        )}
        <InputField label={item.tipo === "sanidade" ? "Data de aplicação" : "Data"} type="date" value={data} onChange={setData} />
        {item.tipo !== "pesagem" && <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />}
      </div>
      {registro.grupo_lancamento && <div style={styles.offlineNotice}>Esta alteração será aplicada a todo o manejo lançado em lote.</div>}
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</PrimaryButton>
    </div>
  );
}

function rotuloMovimentacao(m) {
  const mapa = {
    entrada: "Entrada no rebanho",
    transferencia_lote: "Transferência de lote",
    transferencia_local: "Transferência de local",
    saida: "Saída",
    morte: "Morte registrada",
    venda: "Venda",
    abate: "Abate",
  };
  return mapa[m.tipo] || m.tipo;
}

function rotuloProcedimento(p, medicamentos) {
  const mapa = { vacina: "Vacinação", vermifugo: "Vermifugação", diagnostico: "Diagnóstico", tratamento: "Tratamento" };
  const med = medicamentos.find((m) => m.id === p.medicamento_id);
  return `${mapa[p.tipo] || p.tipo}${med ? ` — ${med.nome}` : ""}`;
}
