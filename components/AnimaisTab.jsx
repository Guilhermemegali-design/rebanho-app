"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg, formatBRL, calcularGmd } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { Search, Tag as TagIcon, Radio, Scale, ArrowLeftRight, Syringe, PlusCircle } from "lucide-react";
import { ListHeader, BackHeader, EmptyHint, Field, InputField, SelectField, TextAreaField, PrimaryButton, Tag, SectionTitle } from "@/components/UI";

const SITUACOES = { ativo: "Ativo", vendido: "Vendido", morto: "Morto", transferido: "Transferido" };

export default function AnimaisTab({ dados }) {
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState("lista"); // lista | novo | detalhe
  const [animalSelecionado, setAnimalSelecionado] = useState(null);
  const [avisoScan, setAvisoScan] = useState("");

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados.animais;
    return dados.animais.filter(
      (a) =>
        a.brinco_atual.toLowerCase().includes(termo) ||
        (a.brinco_rfid || "").toLowerCase().includes(termo) ||
        (a.raca || "").toLowerCase().includes(termo)
    );
  }, [dados.animais, busca]);

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
          await dados.criarAnimal(payload);
          setModo("lista");
        }}
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
      />
    );
  }

  return (
    <div>
      <ListHeader title="Animais" actionLabel="Novo" onAction={() => setModo("novo")} />

      <label style={{ ...styles.card, display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 14px" }}>
        <Search size={16} color="#9A9A94" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por brinco (visual ou RFID) ou raça" style={styles.input} />
      </label>

      <div style={styles.hardwareHint}>Pode apontar o bastão RFID aqui pra ir direto na ficha do animal.</div>
      {avisoScan && <div style={{ ...styles.errorBox, marginTop: 10 }}>{avisoScan}</div>}

      {listaFiltrada.length === 0 && <EmptyHint text="Nenhum animal cadastrado ainda." />}

      {listaFiltrada.map((a) => (
        <button key={a.id} style={styles.listItem} onClick={() => { setAnimalSelecionado(a); setModo("detalhe"); }}>
          <div style={styles.avatar}><TagIcon size={17} /></div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={styles.listItemTitle}>{a.brinco_atual}</div>
            <div style={styles.listItemSub}>
              {[a.raca, a.categoria].filter(Boolean).join(" · ") || "—"}
              {a.brinco_rfid ? ` · RFID ${a.brinco_rfid}` : ""}
            </div>
          </div>
          <Tag cor={a.situacao === "ativo" ? "green" : a.situacao === "morto" ? "red" : "orange"}>{SITUACOES[a.situacao] || a.situacao}</Tag>
        </button>
      ))}
    </div>
  );
}

// ---------- Formulário de cadastro (com captura RFID) ----------
function FormAnimal({ dados, onSalvar, onCancelar, inicial }) {
  const [brinco, setBrinco] = useState(inicial?.brinco_atual || "");
  const [brincoRfid, setBrincoRfid] = useState(inicial?.brinco_rfid || "");
  const [sexo, setSexo] = useState(inicial?.sexo || "femea");
  const [raca, setRaca] = useState(inicial?.raca || "");
  const [origem, setOrigem] = useState(inicial?.origem || "");
  const [fornecedorId, setFornecedorId] = useState(inicial?.fornecedor_id || "");
  const [categoria, setCategoria] = useState(inicial?.categoria || "");
  const [dataEntrada, setDataEntrada] = useState(inicial?.data_entrada || new Date().toISOString().slice(0, 10));
  const [pesoEntrada, setPesoEntrada] = useState(inicial?.peso_entrada ?? "");
  const [valorEntrada, setValorEntrada] = useState(inicial?.valor_entrada ?? "");
  const [observacoes, setObservacoes] = useState(inicial?.observacoes || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const aoLerTag = useCallback((tag) => setBrincoRfid(tag), []);
  const { lendo } = useRfidScanner(aoLerTag);

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
      await onSalvar({
        brinco_atual: brincoFinal,
        brinco_rfid: brincoRfid.trim() || null,
        sexo,
        raca: raca || null,
        origem: origem || null,
        fornecedor_id: fornecedorId || null,
        categoria: categoria || null,
        data_entrada: dataEntrada,
        peso_entrada: pesoEntrada === "" ? null : Number(pesoEntrada),
        valor_entrada: valorEntrada === "" ? null : Number(valorEntrada),
        observacoes: observacoes || null,
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
        <InputField label="Raça" value={raca} onChange={setRaca} placeholder="Ex: Nelore" />
        <InputField label="Categoria" value={categoria} onChange={setCategoria} placeholder="Ex: Bezerro, Novilha, Boi" />
        <InputField label="Origem" value={origem} onChange={setOrigem} placeholder="De onde veio o animal" />
        <SelectField
          label="Fornecedor"
          value={fornecedorId}
          onChange={setFornecedorId}
          options={[{ value: "", label: "Sem fornecedor" }, ...dados.fornecedores.map((f) => ({ value: f.id, label: f.nome }))]}
        />
        <InputField label="Data de entrada" type="date" value={dataEntrada} onChange={setDataEntrada} />
        <InputField label="Peso de entrada (kg)" type="number" value={pesoEntrada} onChange={setPesoEntrada} placeholder="0" />
        <InputField label="Valor de entrada (R$)" type="number" value={valorEntrada} onChange={setValorEntrada} placeholder="0,00" />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>

      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar animal"}</PrimaryButton>
    </div>
  );
}

// ---------- Ficha individual ----------
function FichaAnimal({ dados, animal, onVoltar }) {
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
      itens.push({ data: m.data, tipo: "movimentacao", icone: ArrowLeftRight, titulo: rotuloMovimentacao(m), sub: m.observacoes || "" });
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
        <button style={styles.editLinkBtn} onClick={() => setEditando(true)}>Editar</button>
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
