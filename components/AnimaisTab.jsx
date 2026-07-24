"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, formatBRL, calcularGmd, calcularValorPorArroba } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { statusAnimal } from "@/lib/alerts";
import { enviarDocumentoRebanho } from "@/lib/storage";
import { Search, Tag as TagIcon, ChevronRight, Radio, Scale, ArrowLeftRight, Syringe } from "lucide-react";
import { PageHeader, BackHeader, EmptyHint, Field, InputField, SelectField, TextAreaField, PrimaryButton, SectionTitle } from "@/components/UI";

const SITUACOES = { ativo: "Ativo", vendido: "Vendido", morto: "Morto", transferido: "Transferido" };
const STATUS_BADGE_STYLE = { ativo: styles.statusBadgeAtivo, atencao: styles.statusBadgeAtencao, carencia: styles.statusBadgeCarencia, neutro: styles.tagOrange };
const RACAS = ["Nelore", "Nelorado", "F1 Angus", "Cruzado", "Guzera", "Guzeratado"];

export default function AnimaisTab({ dados }) {
  const [busca, setBusca] = useState("");
  const [loteFiltro, setLoteFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modo, setModo] = useState("lista"); // lista | novo | detalhe
  const [animalSelecionado, setAnimalSelecionado] = useState(null);
  const [avisoScan, setAvisoScan] = useState("");

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
                      <td style={{ ...styles.tableTd, textAlign: "right" }}><ChevronRight size={16} color="#C9C7BE" /></td>
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
            return (
              <button key={a.id} style={styles.listItem} onClick={() => { setAnimalSelecionado(a); setModo("detalhe"); }}>
                <div style={styles.avatar}><TagIcon size={17} /></div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={styles.listItemTitle}>{a.brinco_atual}</div>
                  <div style={styles.listItemSub}>
                    {[a.raca, a.categoria].filter(Boolean).join(" · ") || "—"}
                    {a.brinco_rfid ? ` · RFID ${a.brinco_rfid}` : ""}
                  </div>
                </div>
                <span style={{ ...styles.statusBadge, ...STATUS_BADGE_STYLE[status.cor] }}>{status.rotulo}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function infoPesoAnimal(animal, pesagens) {
  const historico = [...pesagens.filter((p) => p.animal_id === animal.id)].sort((a, b) => a.data.localeCompare(b.data));
  const ultimaPesagem = historico[historico.length - 1];
  const penultimaPesagem = historico[historico.length - 2];
  const gmd = penultimaPesagem && ultimaPesagem
    ? calcularGmd(penultimaPesagem.peso, penultimaPesagem.data, ultimaPesagem.peso, ultimaPesagem.data)
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
        <InputField label="Categoria" value={categoria} onChange={setCategoria} placeholder="Ex: Bezerro, Novilha, Boi" />
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
        <InputField label="Peso de entrada (kg)" type="number" value={pesoEntrada} onChange={setPesoEntrada} placeholder="0" />

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
              <a href={inicial.nota_fiscal_url} target="_blank" rel="noopener noreferrer">Ver nota fiscal já anexada</a>
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
        <InputField label="Peso individual (kg)" type="number" value={peso} onChange={setPeso} placeholder="0" />
        <SelectField label="Sexo" value={sexo} onChange={setSexo} options={[{ value: "femea", label: "Fêmea" }, { value: "macho", label: "Macho" }]} />
        <SelectField
          label="Raça"
          value={raca}
          onChange={setRaca}
          options={[{ value: "", label: "Selecione..." }, ...RACAS.map((nome) => ({ value: nome, label: nome }))]}
        />
        <InputField label="Categoria" value={categoria} onChange={setCategoria} placeholder="Ex: Bezerro, Novilha, Boi" />
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

  const lote = dados.lotes.find((l) => l.id === animal.lote_atual_id);
  const local = dados.locais.find((l) => l.id === animal.local_atual_id);
  const fornecedor = dados.fornecedores.find((f) => f.id === animal.fornecedor_id);

  const ordenadasAsc = useMemo(() => [...dados.pesagens.filter((p) => p.animal_id === animal.id)].sort((a, b) => a.data.localeCompare(b.data)), [dados.pesagens, animal.id]);
  const ultimaPesagem = ordenadasAsc[ordenadasAsc.length - 1];
  const penultimaPesagem = ordenadasAsc[ordenadasAsc.length - 2];
  const gmd = penultimaPesagem && ultimaPesagem
    ? calcularGmd(penultimaPesagem.peso, penultimaPesagem.data, ultimaPesagem.peso, ultimaPesagem.data)
    : null;

  const timeline = useMemo(() => {
    const itens = [];
    for (const p of dados.pesagens.filter((x) => x.animal_id === animal.id)) {
      itens.push({ data: p.data, tipo: "pesagem", icone: Scale, titulo: `Pesagem: ${formatKg(p.peso)}`, sub: p.origem_peso === "bluetooth" ? "Via balança Bluetooth" : "Digitado manualmente" });
    }
    for (const m of dados.movimentacoes.filter((x) => x.animal_id === animal.id)) {
      const dadosVenda = m.tipo === "venda"
        ? [`Peso: ${formatKg(m.peso_saida)}`, `Arroba: ${formatBRL(m.preco_arroba)}`, `Rendimento: ${m.rendimento_carcaca ?? "—"}%`].join(" · ")
        : "";
      itens.push({ data: m.data, tipo: "movimentacao", icone: ArrowLeftRight, titulo: rotuloMovimentacao(m), sub: [dadosVenda, m.observacoes].filter(Boolean).join(" · ") });
    }
    for (const p of dados.procedimentos.filter((x) => x.animal_id === animal.id)) {
      itens.push({ data: p.data_aplicacao, tipo: "sanidade", icone: Syringe, titulo: rotuloProcedimento(p, dados.medicamentos), sub: p.observacoes || "" });
    }
    return itens.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [dados, animal.id]);

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
        <Field label="Fornecedor" value={fornecedor ? fornecedor.nome : "—"} />
        <Field label="Entrada" value={`${formatDataBR(animal.data_entrada)} · ${formatKg(animal.peso_entrada)} · ${formatBRL(animal.valor_entrada)}`} />
        {animal.nota_fiscal_url && (
          <Field label="Nota fiscal" value={<a href={animal.nota_fiscal_url} target="_blank" rel="noopener noreferrer">Ver arquivo anexado</a>} />
        )}
        {animal.observacoes && <Field label="Observações" value={animal.observacoes} multiline />}
      </div>

      <SectionTitle>Linha do tempo</SectionTitle>
      {timeline.length === 0 && <EmptyHint text="Nenhum registro ainda para este animal." />}
      <div style={{ paddingLeft: 2 }}>
        {timeline.map((item, i) => {
          const Icone = item.icone;
          return (
            <div key={i} style={styles.timelineItem}>
              {i < timeline.length - 1 && <div style={styles.timelineLine} />}
              <div style={styles.timelineDot} />
              <div style={styles.timelineContent}>
                <div style={styles.timelineTitulo}><Icone size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{item.titulo}</div>
                <div style={styles.timelineData}>{formatDataBR(item.data)}{item.sub ? ` · ${item.sub}` : ""}</div>
              </div>
            </div>
          );
        })}
      </div>
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
  };
  return mapa[m.tipo] || m.tipo;
}

function rotuloProcedimento(p, medicamentos) {
  const mapa = { vacina: "Vacinação", vermifugo: "Vermifugação", diagnostico: "Diagnóstico", tratamento: "Tratamento" };
  const med = medicamentos.find((m) => m.id === p.medicamento_id);
  return `${mapa[p.tipo] || p.tipo}${med ? ` — ${med.nome}` : ""}`;
}
