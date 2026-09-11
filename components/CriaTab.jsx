"use client";

import { useState, useMemo, useCallback } from "react";
import { styles } from "@/lib/styles";
import { formatDataBR, formatKg } from "@/lib/format";
import { useRfidScanner, encontrarAnimalPorTag } from "@/lib/rfid";
import { enviarDocumentoRebanho } from "@/lib/storage";
import {
  calcularIndicesReprodutivos,
  calcularAlertasReproducao,
  dataRetiradaPrevista,
  dataIaPrevista,
} from "@/lib/reproducao";
import { Radio, Trash2, Pencil } from "lucide-react";
import {
  PageHeader,
  BackHeader,
  EmptyHint,
  SelectField,
  InputField,
  TextAreaField,
  PrimaryButton,
  SectionTitle,
} from "@/components/UI";

const SUBABAS = [
  { id: "painel", label: "Painel" },
  { id: "protocolos", label: "Protocolos IATF" },
  { id: "touros", label: "Touros" },
  { id: "dg", label: "Diagnósticos" },
  { id: "partos", label: "Partos" },
  { id: "desmames", label: "Desmames" },
  { id: "repasse", label: "Repasse" },
];

export default function CriaTab({ dados, onAbrirAnimal }) {
  const [subaba, setSubaba] = useState("painel");

  return (
    <div>
      <PageHeader title="Cria" subtitle="Reprodução: IATF, diagnósticos de gestação, partos, desmames e repasse." />

      <div style={{ ...styles.viewToggle, flexWrap: "wrap" }}>
        {SUBABAS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubaba(s.id)}
            style={subaba === s.id ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}
          >
            {s.label}
          </button>
        ))}
      </div>

      {subaba === "painel" && <PainelCria dados={dados} onAbrirAnimal={onAbrirAnimal} />}
      {subaba === "protocolos" && <ProtocolosTab dados={dados} />}
      {subaba === "touros" && <TourosTab dados={dados} />}
      {subaba === "dg" && <DiagnosticosTab dados={dados} />}
      {subaba === "partos" && <PartosTab dados={dados} />}
      {subaba === "desmames" && <DesmamesTab dados={dados} />}
      {subaba === "repasse" && <RepasseTab dados={dados} />}
    </div>
  );
}

// ---------------------------------------------------------------
// Painel: índices reprodutivos + agenda dos próximos eventos
// ---------------------------------------------------------------
function PainelCria({ dados, onAbrirAnimal }) {
  const indices = useMemo(() => calcularIndicesReprodutivos(dados), [dados]);
  const alertas = useMemo(
    () => calcularAlertasReproducao(dados).sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999)),
    [dados]
  );
  const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);

  return (
    <div>
      <SectionTitle>Índices reprodutivos</SectionTitle>
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>Taxa de serviço</div>
          <div style={styles.kpiValor}>{pct(indices.taxaServico)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>Taxa de concepção</div>
          <div style={styles.kpiValor}>{pct(indices.taxaConcepcao)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>Taxa de prenhez</div>
          <div style={styles.kpiValor}>{pct(indices.taxaPrenhez)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>Intervalo entre partos</div>
          <div style={styles.kpiValor}>{indices.intervaloMedioPartos ? `${indices.intervaloMedioPartos}d` : "—"}</div>
        </div>
      </div>

      <SectionTitle>Próximos eventos</SectionTitle>
      {alertas.length === 0 && <EmptyHint text="Nenhum evento reprodutivo previsto no momento." />}
      {alertas.map((al, i) => (
        <button key={i} type="button" onClick={() => onAbrirAnimal?.(al.animal.id)} style={styles.listItem}>
          <div style={{ flex: 1 }}>
            <div style={styles.listItemTitle}>{al.texto}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Touros
// ---------------------------------------------------------------
const TIPOS_TOURO = { proprio: "Próprio (repasse)", semen: "Sêmen (IATF)", repasse_externo: "Repasse externo" };

function TourosTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const [editando, setEditando] = useState(null);
  const ativos = useMemo(() => dados.touros.filter((t) => t.ativo !== false), [dados.touros]);

  if (modo === "novo" || modo === "editar") {
    return (
      <FormTouro
        dados={dados}
        inicial={editando}
        onSalvo={() => { setEditando(null); setModo("lista"); }}
        onCancelar={() => { setEditando(null); setModo("lista"); }}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Touros" subtitle="Touros próprios ou referência de sêmen usados em IATF/repasse." actionLabel="Novo touro" onAction={() => setModo("novo")} />
      {ativos.length === 0 && <EmptyHint text="Nenhum touro cadastrado ainda." />}
      {ativos.map((t) => {
        const fornecedor = dados.fornecedores.find((f) => f.id === t.fornecedor_id);
        return (
          <div key={t.id} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{t.nome}{t.identificacao ? ` · ${t.identificacao}` : ""}</div>
              <div style={styles.listItemSub}>
                {TIPOS_TOURO[t.tipo] || t.tipo}{t.raca ? ` · ${t.raca}` : ""}{fornecedor ? ` · ${fornecedor.nome}` : ""}
              </div>
            </div>
            <button type="button" onClick={() => { setEditando(t); setModo("editar"); }} style={styles.iconEditBtn} title="Editar"><Pencil size={15} /></button>
            <button
              type="button"
              onClick={async () => { if (window.confirm(`Remover o touro ${t.nome}?`)) await dados.excluirTouro(t.id); }}
              style={styles.iconDangerBtn}
              title="Remover"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormTouro({ dados, inicial, onSalvo, onCancelar }) {
  const [nome, setNome] = useState(inicial?.nome || "");
  const [identificacao, setIdentificacao] = useState(inicial?.identificacao || "");
  const [raca, setRaca] = useState(inicial?.raca || "");
  const [tipo, setTipo] = useState(inicial?.tipo || "semen");
  const [fornecedorId, setFornecedorId] = useState(inicial?.fornecedor_id || "");
  const [observacoes, setObservacoes] = useState(inicial?.observacoes || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!nome.trim()) { setErro("Informe o nome do touro."); return; }
    setErro(""); setSalvando(true);
    try {
      const payload = { nome: nome.trim(), identificacao: identificacao || null, raca: raca || null, tipo, fornecedor_id: fornecedorId || null, observacoes: observacoes || null };
      if (inicial) await dados.atualizarTouro(inicial.id, payload);
      else await dados.criarTouro(payload);
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={inicial ? "Editar touro" : "Novo touro"} onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome" value={nome} onChange={setNome} placeholder="Ex: Touro 123 ou Partida XYZ" />
        <InputField label="Identificação (RGD/RGN ou partida de sêmen)" value={identificacao} onChange={setIdentificacao} placeholder="Opcional" />
        <InputField label="Raça" value={raca} onChange={setRaca} placeholder="Opcional" />
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS_TOURO).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Fornecedor" value={fornecedorId} onChange={setFornecedorId} options={[{ value: "", label: "Nenhum" }, ...dados.fornecedores.map((f) => ({ value: f.id, label: f.nome }))]} />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------
// Protocolos IATF
// ---------------------------------------------------------------
const STATUS_PROTOCOLO = { em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };

function ProtocolosTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const [protocoloId, setProtocoloId] = useState(null);

  if (modo === "novo") {
    return <FormProtocolo dados={dados} onSalvo={(p) => { setProtocoloId(p.id); setModo("detalhe"); }} onCancelar={() => setModo("lista")} />;
  }
  if (modo === "detalhe" && protocoloId) {
    const protocolo = dados.protocolosIatf.find((p) => p.id === protocoloId);
    if (protocolo) {
      return (
        <DetalheProtocolo
          dados={dados}
          protocolo={protocolo}
          onVoltar={() => { setProtocoloId(null); setModo("lista"); }}
        />
      );
    }
  }

  const lista = [...dados.protocolosIatf].sort((a, b) => (b.data_d0 || "").localeCompare(a.data_d0 || ""));
  return (
    <div>
      <PageHeader title="Protocolos IATF" subtitle="D0, D8/retirada e D11/IA por animal, calculados automaticamente." actionLabel="Novo protocolo" onAction={() => setModo("novo")} />
      {lista.length === 0 && <EmptyHint text="Nenhum protocolo IATF criado ainda." />}
      {lista.map((p) => {
        const lote = dados.lotes.find((l) => l.id === p.lote_id);
        const qtd = dados.protocoloAnimais.filter((pa) => pa.protocolo_id === p.id).length;
        return (
          <button key={p.id} type="button" onClick={() => { setProtocoloId(p.id); setModo("detalhe"); }} style={styles.listItem}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{p.nome}</div>
              <div style={styles.listItemSub}>
                D0 {formatDataBR(p.data_d0)}{lote ? ` · Lote ${lote.nome}` : ""} · {qtd} animal(is) · {STATUS_PROTOCOLO[p.status] || p.status}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FormProtocolo({ dados, onSalvo, onCancelar }) {
  const [nome, setNome] = useState("");
  const [dataD0, setDataD0] = useState(new Date().toISOString().slice(0, 10));
  const [diasRetirada, setDiasRetirada] = useState("8");
  const [diasIa, setDiasIa] = useState("11");
  const [loteId, setLoteId] = useState("");
  const [touroPadraoId, setTouroPadraoId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!nome.trim()) { setErro("Dê um nome ao protocolo (ex: IATF Lote Recria - Set/2026)."); return; }
    if (!dataD0) { setErro("Informe a data D0."); return; }
    setErro(""); setSalvando(true);
    try {
      const protocolo = await dados.criarProtocoloIatf({
        nome: nome.trim(),
        data_d0: dataD0,
        dias_ate_retirada: Number(diasRetirada) || 8,
        dias_ate_ia: Number(diasIa) || 11,
        lote_id: loteId || null,
        touro_padrao_id: touroPadraoId || null,
        observacoes: observacoes || null,
      });
      if (loteId) {
        const animaisDoLote = dados.animais.filter((a) => a.lote_atual_id === loteId && a.situacao === "ativo" && a.sexo === "femea");
        if (animaisDoLote.length > 0) {
          await dados.adicionarAnimaisAoProtocoloEmLote(protocolo.id, animaisDoLote.map((a) => a.id), {
            data_d0: dataD0,
            touro_id: touroPadraoId || null,
          });
        }
      }
      onSalvo(protocolo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Novo protocolo IATF" onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome do protocolo" value={nome} onChange={setNome} placeholder="Ex: IATF Lote Recria - Set/2026" />
        <InputField label="Data D0 (implante)" type="date" value={dataD0} onChange={setDataD0} />
        <InputField label="Dias até a retirada (D8)" type="number" value={diasRetirada} onChange={setDiasRetirada} />
        <InputField label="Dias até a IA (D11)" type="number" value={diasIa} onChange={setDiasIa} />
        <SelectField
          label="Lote (opcional — inscreve todas as fêmeas ativas do lote)"
          value={loteId}
          onChange={setLoteId}
          options={[{ value: "", label: "Nenhum — adiciono os animais na tela do protocolo" }, ...dados.lotes.map((l) => ({ value: l.id, label: l.nome }))]}
        />
        <SelectField
          label="Touro/sêmen padrão"
          value={touroPadraoId}
          onChange={setTouroPadraoId}
          options={[{ value: "", label: "Definir por animal" }, ...dados.touros.filter((t) => t.ativo !== false).map((t) => ({ value: t.id, label: t.nome }))]}
        />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Criar protocolo"}</PrimaryButton>
    </div>
  );
}

function DetalheProtocolo({ dados, protocolo, onVoltar }) {
  const [etapaEditando, setEtapaEditando] = useState(null);
  const [dataInput, setDataInput] = useState("");
  const [touroInput, setTouroInput] = useState("");

  const itens = dados.protocoloAnimais.filter((pa) => pa.protocolo_id === protocolo.id);

  const aoLerTag = useCallback((tag) => {
    const animal = encontrarAnimalPorTag(dados.animais, tag);
    if (!animal) { window.alert(`Nenhum animal encontrado com o brinco "${tag}".`); return; }
    if (itens.some((pa) => pa.animal_id === animal.id)) { window.alert("Este animal já está no protocolo."); return; }
    dados.adicionarAnimalAoProtocolo(protocolo.id, animal.id, { data_d0: protocolo.data_d0, touro_id: protocolo.touro_padrao_id || null });
  }, [dados, protocolo, itens]);
  const { lendo } = useRfidScanner(aoLerTag);

  function abrirEdicao(pa, campo) {
    setEtapaEditando({ chave: pa.id || pa.client_uuid, campo });
    setDataInput(new Date().toISOString().slice(0, 10));
    setTouroInput(pa.touro_id || protocolo.touro_padrao_id || "");
  }

  async function confirmarEtapa(pa) {
    if (etapaEditando.campo === "retirada") {
      await dados.atualizarEtapaProtocolo(pa, { data_retirada_realizada: dataInput, status: "aguardando_ia" });
    } else {
      await dados.atualizarEtapaProtocolo(pa, { data_ia: dataInput, touro_id: touroInput || null, status: "inseminada" });
    }
    setEtapaEditando(null);
  }

  const animaisDisponiveis = dados.animais.filter(
    (a) => a.situacao === "ativo" && a.sexo === "femea" && !itens.some((pa) => pa.animal_id === a.id)
  );

  return (
    <div>
      <BackHeader title={protocolo.nome} onBack={onVoltar} />
      <div style={styles.hardwareHint}>
        D0: {formatDataBR(protocolo.data_d0)} · Retirada em D{protocolo.dias_ate_retirada} · IA em D{protocolo.dias_ate_ia}
      </div>

      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}), marginTop: 12 }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para adicionar um animal ao protocolo"}
        </div>
      </div>

      <SelectField
        label="Ou adicionar por seleção"
        value=""
        onChange={(id) => {
          if (!id) return;
          dados.adicionarAnimalAoProtocolo(protocolo.id, id, { data_d0: protocolo.data_d0, touro_id: protocolo.touro_padrao_id || null });
        }}
        options={[{ value: "", label: "Selecione um animal..." }, ...animaisDisponiveis.map((a) => ({ value: a.id, label: a.brinco_atual }))]}
      />

      <SectionTitle>Animais no protocolo ({itens.length})</SectionTitle>
      {itens.length === 0 && <EmptyHint text="Nenhum animal neste protocolo ainda." />}
      {itens.map((pa) => {
        const animal = dados.animais.find((a) => a.id === pa.animal_id);
        const chave = pa.id || pa.client_uuid;
        const emEdicao = etapaEditando?.chave === chave;
        const touro = dados.touros.find((t) => t.id === pa.touro_id);
        return (
          <div key={chave} style={{ ...styles.rowCard, display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"}</div>
                <div style={styles.listItemSub}>
                  {pa.status === "aguardando_retirada" && `Retirada prevista: ${formatDataBR(dataRetiradaPrevista(pa, protocolo))}`}
                  {pa.status === "aguardando_ia" && `IA prevista: ${formatDataBR(dataIaPrevista(pa, protocolo))} (retirada em ${formatDataBR(pa.data_retirada_realizada)})`}
                  {pa.status === "inseminada" && `IA em ${formatDataBR(pa.data_ia)}${touro ? ` · ${touro.nome}` : ""}`}
                  {pa.status === "removida" && "Removida do protocolo"}
                </div>
              </div>
              <button type="button" onClick={() => dados.excluirAnimalDoProtocolo(pa)} style={styles.iconDangerBtn} title="Remover do protocolo">
                <Trash2 size={16} />
              </button>
            </div>
            {!emEdicao && pa.status === "aguardando_retirada" && (
              <button type="button" onClick={() => abrirEdicao(pa, "retirada")} style={{ ...styles.secondaryBtn, marginTop: 8 }}>
                Registrar retirada do implante
              </button>
            )}
            {!emEdicao && pa.status === "aguardando_ia" && (
              <button type="button" onClick={() => abrirEdicao(pa, "ia")} style={{ ...styles.secondaryBtn, marginTop: 8 }}>
                Registrar inseminação (IA)
              </button>
            )}
            {emEdicao && (
              <div style={{ marginTop: 8 }}>
                <InputField label={etapaEditando.campo === "retirada" ? "Data da retirada" : "Data da IA"} type="date" value={dataInput} onChange={setDataInput} />
                {etapaEditando.campo === "ia" && (
                  <SelectField
                    label="Touro/sêmen usado"
                    value={touroInput}
                    onChange={setTouroInput}
                    options={[{ value: "", label: "Não informado" }, ...dados.touros.filter((t) => t.ativo !== false).map((t) => ({ value: t.id, label: t.nome }))]}
                  />
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => confirmarEtapa(pa)} style={{ ...styles.secondaryBtn, marginTop: 0 }}>Confirmar</button>
                  <button type="button" onClick={() => setEtapaEditando(null)} style={{ ...styles.secondaryBtn, marginTop: 0 }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------
// Diagnósticos de gestação (DG)
// ---------------------------------------------------------------
const RESULTADO_DG = { prenha: "Prenha", vazia: "Vazia", inconclusivo: "Inconclusivo" };
const METODO_DG = { palpacao: "Palpação", usg: "Ultrassom (USG)", sangue: "Exame de sangue" };

function DiagnosticosTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const lista = [...dados.diagnosticosGestacao].sort((a, b) => (b.data_dg || "").localeCompare(a.data_dg || ""));

  if (modo === "novo") return <FormDiagnostico dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;

  return (
    <div>
      <PageHeader title="Diagnósticos de gestação" subtitle="DG por palpação, USG ou exame de sangue." actionLabel="Registrar DG" onAction={() => setModo("novo")} />
      {lista.length === 0 && <EmptyHint text="Nenhum diagnóstico registrado ainda." />}
      {lista.map((dg) => {
        const animal = dados.animais.find((a) => a.id === dg.animal_id);
        return (
          <div key={dg.client_uuid || dg.id} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"} · {RESULTADO_DG[dg.resultado] || dg.resultado}</div>
              <div style={styles.listItemSub}>
                {formatDataBR(dg.data_dg)} · {METODO_DG[dg.metodo] || dg.metodo}{!dg.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => { if (window.confirm("Excluir este diagnóstico?")) await dados.excluirDiagnostico(dg); }}
              style={styles.iconDangerBtn}
              title="Excluir"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormDiagnostico({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [protocoloAnimalId, setProtocoloAnimalId] = useState("");
  const [dataDg, setDataDg] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("palpacao");
  const [resultado, setResultado] = useState("prenha");
  const [dataIaReferencia, setDataIaReferencia] = useState("");
  const [touroId, setTouroId] = useState("");
  const [foto, setFoto] = useState(null);
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback((tag) => {
    const animal = encontrarAnimalPorTag(dados.animais, tag);
    if (animal) setAnimalId(animal.id);
    else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
  }, [dados.animais]);
  const { lendo } = useRfidScanner(aoLerTag);

  // Só oferece vincular a uma etapa de protocolo já sincronizada (tem
  // `id` real do servidor) — uma etapa ainda offline só tem client_uuid,
  // que não é uma chave estrangeira válida até sincronizar.
  const etapasInseminadasSemDg = useMemo(() => dados.protocoloAnimais.filter((pa) => (
    pa.id && pa.animal_id === animalId && pa.status === "inseminada" &&
    !dados.diagnosticosGestacao.some((dg) => dg.protocolo_animal_id === pa.id)
  )), [dados.protocoloAnimais, dados.diagnosticosGestacao, animalId]);

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha o animal (ou aponte o bastão RFID)."); return; }
    setErro(""); setSalvando(true);
    try {
      let fotoUrl = null;
      if (foto) fotoUrl = await enviarDocumentoRebanho(foto);
      await dados.registrarDiagnosticoGestacao(animalId, {
        protocolo_animal_id: protocoloAnimalId || null,
        data_dg: dataDg,
        metodo,
        resultado,
        data_ia_referencia: dataIaReferencia || null,
        touro_id: touroId || null,
        foto_url: fotoUrl,
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
      <BackHeader title="Registrar diagnóstico de gestação" onBack={onCancelar} />
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
          onChange={(v) => { setAnimalId(v); setProtocoloAnimalId(""); }}
          options={[{ value: "", label: "Selecione..." }, ...dados.animais.filter((a) => a.sexo === "femea").map((a) => ({ value: a.id, label: a.brinco_atual }))]}
        />
        {etapasInseminadasSemDg.length > 0 && (
          <SelectField
            label="Vincular a uma inseminação (IATF)"
            value={protocoloAnimalId}
            onChange={(id) => {
              setProtocoloAnimalId(id);
              const pa = etapasInseminadasSemDg.find((p) => p.id === id);
              if (pa) { setDataIaReferencia(pa.data_ia); setTouroId(pa.touro_id || ""); }
            }}
            options={[{ value: "", label: "Não vincular (repasse/monta natural)" }, ...etapasInseminadasSemDg.map((pa) => ({ value: pa.id, label: `IA em ${formatDataBR(pa.data_ia)}` }))]}
          />
        )}
        <InputField label="Data do DG" type="date" value={dataDg} onChange={setDataDg} />
        <SelectField label="Método" value={metodo} onChange={setMetodo} options={Object.entries(METODO_DG).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Resultado" value={resultado} onChange={setResultado} options={Object.entries(RESULTADO_DG).map(([value, label]) => ({ value, label }))} />
        {!protocoloAnimalId && (
          <>
            <InputField label="Data da IA/monta (referência p/ previsão de parto)" type="date" value={dataIaReferencia} onChange={setDataIaReferencia} />
            <SelectField
              label="Touro"
              value={touroId}
              onChange={setTouroId}
              options={[{ value: "", label: "Não informado" }, ...dados.touros.filter((t) => t.ativo !== false).map((t) => ({ value: t.id, label: t.nome }))]}
            />
          </>
        )}
        <label style={styles.field}>
          <div style={styles.fieldLabel}>Foto (opcional)</div>
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} />
        </label>
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Registrar"}</PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------
// Partos
// ---------------------------------------------------------------
const TIPO_PARTO = { normal: "Normal", dificil: "Difícil", natimorto: "Natimorto", aborto: "Aborto" };

function PartosTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const lista = [...dados.partos].sort((a, b) => (b.data_parto || "").localeCompare(a.data_parto || ""));

  if (modo === "novo") return <FormParto dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;

  return (
    <div>
      <PageHeader title="Partos" subtitle="Registro de parto, com cadastro automático da cria." actionLabel="Registrar parto" onAction={() => setModo("novo")} />
      {lista.length === 0 && <EmptyHint text="Nenhum parto registrado ainda." />}
      {lista.map((p) => {
        const mae = dados.animais.find((a) => a.id === p.animal_id);
        const cria = dados.animais.find((a) => a.id === p.cria_animal_id);
        return (
          <div key={p.client_uuid || p.id} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{mae ? mae.brinco_atual : "—"} · {TIPO_PARTO[p.tipo_parto] || p.tipo_parto}</div>
              <div style={styles.listItemSub}>
                {formatDataBR(p.data_parto)}{cria ? ` · cria: ${cria.brinco_atual}` : ""}{!p.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => { if (window.confirm("Excluir este registro de parto?")) await dados.excluirParto(p); }}
              style={styles.iconDangerBtn}
              title="Excluir"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormParto({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [diagnosticoId, setDiagnosticoId] = useState("");
  const [dataParto, setDataParto] = useState(new Date().toISOString().slice(0, 10));
  const [tipoParto, setTipoParto] = useState("normal");
  const [sexoBezerro, setSexoBezerro] = useState("femea");
  const [pesoNascimento, setPesoNascimento] = useState("");
  const [touroId, setTouroId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [cadastrarCria, setCadastrarCria] = useState(true);
  const [brincoCria, setBrincoCria] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback((tag) => {
    if (cadastrarCria) { setBrincoCria(tag); return; }
    const animal = encontrarAnimalPorTag(dados.animais, tag);
    if (animal) setAnimalId(animal.id);
    else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
  }, [dados.animais, cadastrarCria]);
  const { lendo } = useRfidScanner(aoLerTag);

  // Só oferece vincular a um DG já sincronizado (tem `id` real).
  const gestacoesConfirmadas = useMemo(() => dados.diagnosticosGestacao.filter((dg) => (
    dg.id && dg.resultado === "prenha" && dg.animal_id === animalId &&
    !dados.partos.some((p) => p.diagnostico_gestacao_id === dg.id)
  )), [dados.diagnosticosGestacao, dados.partos, animalId]);

  const semCria = tipoParto === "natimorto" || tipoParto === "aborto";

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha a mãe (ou aponte o bastão RFID antes de marcar 'cadastrar cria agora')."); return; }
    if (!semCria && cadastrarCria && !brincoCria.trim()) { setErro("Informe o brinco da cria ou aponte o bastão RFID."); return; }
    setErro(""); setSalvando(true);
    try {
      const dg = gestacoesConfirmadas.find((d) => d.id === diagnosticoId);
      await dados.registrarParto(animalId, {
        diagnostico_gestacao_id: diagnosticoId || null,
        data_parto: dataParto,
        tipo_parto: tipoParto,
        sexo_bezerro: semCria ? null : sexoBezerro,
        peso_nascimento_bezerro: pesoNascimento ? Number(pesoNascimento) : null,
        touro_id: touroId || dg?.touro_id || null,
        observacoes: observacoes || null,
        criarCriaAutomaticamente: !semCria && cadastrarCria,
        dadosCria: !semCria && cadastrarCria ? { brinco_atual: brincoCria.trim(), brinco_rfid: brincoCria.trim() } : null,
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
      <BackHeader title="Registrar parto" onBack={onCancelar} />
      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : cadastrarCria ? "Aponte o bastão para o brinco da CRIA" : "Aponte o bastão para identificar a MÃE"}
        </div>
      </div>
      <div style={styles.card}>
        <SelectField
          label="Mãe"
          value={animalId}
          onChange={(v) => { setAnimalId(v); setDiagnosticoId(""); }}
          options={[{ value: "", label: "Selecione..." }, ...dados.animais.filter((a) => a.sexo === "femea").map((a) => ({ value: a.id, label: a.brinco_atual }))]}
        />
        {gestacoesConfirmadas.length > 0 && (
          <SelectField
            label="Vincular a um diagnóstico de gestação"
            value={diagnosticoId}
            onChange={setDiagnosticoId}
            options={[{ value: "", label: "Não vincular" }, ...gestacoesConfirmadas.map((dg) => ({ value: dg.id, label: `DG em ${formatDataBR(dg.data_dg)}` }))]}
          />
        )}
        <InputField label="Data do parto" type="date" value={dataParto} onChange={setDataParto} />
        <SelectField label="Tipo de parto" value={tipoParto} onChange={setTipoParto} options={Object.entries(TIPO_PARTO).map(([value, label]) => ({ value, label }))} />
        {!semCria && (
          <>
            <SelectField label="Sexo do bezerro" value={sexoBezerro} onChange={setSexoBezerro} options={[{ value: "femea", label: "Fêmea" }, { value: "macho", label: "Macho" }]} />
            <InputField label="Peso ao nascer (kg)" type="number" value={pesoNascimento} onChange={setPesoNascimento} placeholder="Opcional" />
            <SelectField
              label="Touro/pai"
              value={touroId}
              onChange={setTouroId}
              options={[{ value: "", label: "Usar do diagnóstico vinculado (se houver)" }, ...dados.touros.filter((t) => t.ativo !== false).map((t) => ({ value: t.id, label: t.nome }))]}
            />
            <label style={{ ...styles.field, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={cadastrarCria} onChange={(e) => setCadastrarCria(e.target.checked)} />
              <span style={styles.fieldLabel}>Cadastrar a cria agora</span>
            </label>
            {cadastrarCria && (
              <InputField label="Brinco da cria" value={brincoCria} onChange={setBrincoCria} placeholder="Digite ou aponte o bastão RFID" />
            )}
          </>
        )}
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Registrar parto"}</PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------
// Desmames
// ---------------------------------------------------------------
function DesmamesTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const lista = [...dados.desmames].sort((a, b) => (b.data_desmame || "").localeCompare(a.data_desmame || ""));

  if (modo === "novo") return <FormDesmame dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;

  return (
    <div>
      <PageHeader title="Desmames" subtitle="Registro de desmame, com promoção automática de categoria." actionLabel="Registrar desmame" onAction={() => setModo("novo")} />
      {lista.length === 0 && <EmptyHint text="Nenhum desmame registrado ainda." />}
      {lista.map((d) => {
        const animal = dados.animais.find((a) => a.id === d.animal_id);
        return (
          <div key={d.client_uuid || d.id} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{animal ? animal.brinco_atual : "—"}</div>
              <div style={styles.listItemSub}>
                {formatDataBR(d.data_desmame)}{d.peso_desmame ? ` · ${formatKg(d.peso_desmame)}` : ""}{!d.id ? " · aguardando sincronizar" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => { if (window.confirm("Excluir este desmame?")) await dados.excluirDesmame(d); }}
              style={styles.iconDangerBtn}
              title="Excluir"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormDesmame({ dados, onSalvo, onCancelar }) {
  const [animalId, setAnimalId] = useState("");
  const [dataDesmame, setDataDesmame] = useState(new Date().toISOString().slice(0, 10));
  const [pesoDesmame, setPesoDesmame] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const aoLerTag = useCallback((tag) => {
    const animal = encontrarAnimalPorTag(dados.animais, tag);
    if (animal) setAnimalId(animal.id);
    else setErro(`Nenhum animal encontrado com o brinco "${tag}".`);
  }, [dados.animais]);
  const { lendo } = useRfidScanner(aoLerTag);

  const crias = useMemo(() => dados.animais.filter((a) => a.situacao === "ativo" && a.categoria === "Bezerro"), [dados.animais]);

  async function handleSalvar() {
    if (!animalId) { setErro("Escolha a cria (ou aponte o bastão RFID)."); return; }
    setErro(""); setSalvando(true);
    try {
      await dados.registrarDesmame(animalId, {
        data_desmame: dataDesmame,
        peso_desmame: pesoDesmame ? Number(pesoDesmame) : null,
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
      <BackHeader title="Registrar desmame" onBack={onCancelar} />
      <div style={{ ...styles.scanBox, ...(lendo ? styles.scanBoxActive : {}) }}>
        <Radio size={18} color={lendo ? "#fff" : "#1F4D45"} />
        <div style={{ ...styles.scanBoxText, color: lendo ? "#fff" : "#1F4D45" }}>
          {lendo ? "Lendo..." : "Aponte o bastão RFID para identificar a cria"}
        </div>
      </div>
      <div style={styles.card}>
        <SelectField label="Cria" value={animalId} onChange={setAnimalId} options={[{ value: "", label: "Selecione..." }, ...crias.map((a) => ({ value: a.id, label: a.brinco_atual }))]} />
        <InputField label="Data do desmame" type="date" value={dataDesmame} onChange={setDataDesmame} />
        <InputField label="Peso ao desmame (kg)" type="number" value={pesoDesmame} onChange={setPesoDesmame} placeholder="Opcional" />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <div style={styles.offlineNotice}>Sem sinal no curral? Sem problema — fica salvo no aparelho e envia sozinho quando a internet voltar.</div>
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Registrar"}</PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------
// Repasse
// ---------------------------------------------------------------
function RepasseTab({ dados }) {
  const [modo, setModo] = useState("lista");
  const lista = [...dados.periodosRepasse].sort((a, b) => (b.data_inicio || "").localeCompare(a.data_inicio || ""));

  if (modo === "novo") return <FormRepasse dados={dados} onSalvo={() => setModo("lista")} onCancelar={() => setModo("lista")} />;

  return (
    <div>
      <PageHeader title="Repasse" subtitle="Touro de repasse por lote e período de exposição." actionLabel="Novo período" onAction={() => setModo("novo")} />
      {lista.length === 0 && <EmptyHint text="Nenhum período de repasse cadastrado ainda." />}
      {lista.map((r) => {
        const lote = dados.lotes.find((l) => l.id === r.lote_id);
        const touro = dados.touros.find((t) => t.id === r.touro_id);
        return (
          <div key={r.id} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{lote ? lote.nome : "—"} · {touro ? touro.nome : "—"}</div>
              <div style={styles.listItemSub}>{formatDataBR(r.data_inicio)} até {r.data_fim ? formatDataBR(r.data_fim) : "em andamento"}</div>
            </div>
            <button
              type="button"
              onClick={async () => { if (window.confirm("Remover este período de repasse?")) await dados.excluirPeriodoRepasse(r.id); }}
              style={styles.iconDangerBtn}
              title="Remover"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormRepasse({ dados, onSalvo, onCancelar }) {
  const [loteId, setLoteId] = useState("");
  const [touroId, setTouroId] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!loteId) { setErro("Escolha o lote."); return; }
    if (!touroId) { setErro("Escolha o touro."); return; }
    setErro(""); setSalvando(true);
    try {
      await dados.criarPeriodoRepasse({ lote_id: loteId, touro_id: touroId, data_inicio: dataInicio, data_fim: dataFim || null, observacoes: observacoes || null });
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Novo período de repasse" onBack={onCancelar} />
      <div style={styles.card}>
        <SelectField label="Lote" value={loteId} onChange={setLoteId} options={[{ value: "", label: "Selecione..." }, ...dados.lotes.map((l) => ({ value: l.id, label: l.nome }))]} />
        <SelectField
          label="Touro de repasse"
          value={touroId}
          onChange={setTouroId}
          options={[{ value: "", label: "Selecione..." }, ...dados.touros.filter((t) => t.ativo !== false).map((t) => ({ value: t.id, label: t.nome }))]}
        />
        <InputField label="Início da exposição" type="date" value={dataInicio} onChange={setDataInicio} />
        <InputField label="Fim da exposição (opcional)" type="date" value={dataFim} onChange={setDataFim} />
        <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</PrimaryButton>
    </div>
  );
}
