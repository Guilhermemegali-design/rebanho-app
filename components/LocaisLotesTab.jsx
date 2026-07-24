"use client";

import { useState } from "react";
import { styles } from "@/lib/styles";
import { MapPin, Layers, Trash2 } from "lucide-react";
import { ListHeader, PageHeader, BackHeader, EmptyHint, InputField, SelectField, PrimaryButton } from "@/components/UI";

const TIPOS_LOCAL = { pasto: "Pasto", curral: "Curral", baia: "Baia", outro: "Outro" };

export default function LocaisLotesTab({ dados }) {
  const [sub, setSub] = useState("locais");
  const [modo, setModo] = useState("lista");

  return (
    <div>
      {modo === "lista" && <PageHeader title="Lotes e locais" subtitle="Pastos, currais e agrupamentos de animais na fazenda." />}
      <div style={styles.viewToggle}>
        <button onClick={() => { setSub("locais"); setModo("lista"); }} style={sub === "locais" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Locais</button>
        <button onClick={() => { setSub("lotes"); setModo("lista"); }} style={sub === "lotes" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Lotes</button>
      </div>

      {sub === "locais" ? (
        modo === "novo" ? (
          <FormLocal dados={dados} onSalvar={async (p) => { await dados.criarLocal(p); setModo("lista"); }} onCancelar={() => setModo("lista")} />
        ) : (
          <ListaLocais dados={dados} onNovo={() => setModo("novo")} />
        )
      ) : modo === "novo" ? (
        <FormLote dados={dados} onSalvar={async (p) => { await dados.criarLote(p); setModo("lista"); }} onCancelar={() => setModo("lista")} />
      ) : (
        <ListaLotes dados={dados} onNovo={() => setModo("novo")} />
      )}
    </div>
  );
}

function ListaLocais({ dados, onNovo }) {
  return (
    <div>
      <ListHeader title="Locais" actionLabel="Novo local" onAction={onNovo} />
      {dados.locais.length === 0 && <EmptyHint text="Nenhum pasto, curral ou baia cadastrado ainda." />}
      {dados.locais.map((l) => {
        const qtd = dados.animais.filter((a) => a.local_atual_id === l.id && a.situacao === "ativo").length;
        return (
          <div key={l.id} style={styles.rowCard}>
            <div style={styles.avatar}><MapPin size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{l.nome}</div>
              <div style={styles.listItemSub}>{TIPOS_LOCAL[l.tipo] || l.tipo}{l.capacidade ? ` · capacidade ${l.capacidade}` : ""}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{qtd}</div>
          </div>
        );
      })}
    </div>
  );
}

function FormLocal({ onSalvar, onCancelar }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("pasto");
  const [capacidade, setCapacidade] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!nome.trim()) { setErro("Informe o nome do local."); return; }
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), tipo, capacidade: capacidade === "" ? null : Number(capacidade) });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Novo local" onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome" value={nome} onChange={setNome} placeholder="Ex: Piquete 3" />
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS_LOCAL).map(([value, label]) => ({ value, label }))} />
        <InputField label="Capacidade (opcional)" type="number" value={capacidade} onChange={setCapacidade} placeholder="Nº de cabeças" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar local"}</PrimaryButton>
    </div>
  );
}

function ListaLotes({ dados, onNovo }) {
  const [excluindoId, setExcluindoId] = useState(null);
  const [erro, setErro] = useState("");

  async function handleExcluir(lote, qtd) {
    const detalhe = qtd > 0
      ? ` Os ${qtd} animais deste lote continuarão cadastrados e ficarão sem lote.`
      : "";
    if (!window.confirm(`Excluir o lote "${lote.nome}"?${detalhe}`)) return;
    setExcluindoId(lote.id);
    setErro("");
    try {
      await dados.excluirLote(lote.id);
    } catch (err) {
      setErro(err.message || "Não foi possível excluir o lote.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div>
      <ListHeader title="Lotes" actionLabel="Novo lote" onAction={onNovo} />
      {erro && <div style={{ ...styles.errorBox, marginBottom: 10 }}>{erro}</div>}
      {dados.lotes.length === 0 && <EmptyHint text="Nenhum lote cadastrado ainda." />}
      {dados.lotes.map((l) => {
        const qtd = dados.animais.filter((a) => a.lote_atual_id === l.id && a.situacao === "ativo").length;
        const local = dados.locais.find((loc) => loc.id === l.local_id);
        return (
          <div key={l.id} style={styles.rowCard}>
            <div style={styles.avatar}><Layers size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{l.nome}</div>
              <div style={styles.listItemSub}>{local ? local.nome : "Sem local"} · {l.situacao === "ativo" ? "Ativo" : "Encerrado"}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{qtd}</div>
            <button
              type="button"
              onClick={() => handleExcluir(l, qtd)}
              disabled={excluindoId === l.id}
              aria-label={`Excluir lote ${l.nome}`}
              title="Excluir lote"
              style={{ ...styles.iconDangerBtn, opacity: excluindoId === l.id ? 0.5 : 1 }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormLote({ dados, onSalvar, onCancelar }) {
  const [nome, setNome] = useState("");
  const [localId, setLocalId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!nome.trim()) { setErro("Informe o nome do lote."); return; }
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), local_id: localId || null });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Novo lote" onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome" value={nome} onChange={setNome} placeholder="Ex: Lote Recria 01" />
        <SelectField
          label="Local"
          value={localId}
          onChange={setLocalId}
          options={[{ value: "", label: "Sem local definido" }, ...dados.locais.map((l) => ({ value: l.id, label: l.nome }))]}
        />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar lote"}</PrimaryButton>
    </div>
  );
}
