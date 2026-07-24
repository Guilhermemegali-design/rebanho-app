"use client";

import { useMemo, useState } from "react";
import { styles } from "@/lib/styles";
import { formatKg, formatDataBR, calcularGmd } from "@/lib/format";
import { calcularAlertas } from "@/lib/alerts";
import { Users, TrendingUp, AlertTriangle, Syringe, Scale, ChevronLeft } from "lucide-react";
import { EmptyHint, PageHeader } from "@/components/UI";

export default function PainelTab({ dados }) {
  const { locais, lotes } = dados;
  const [loteSelecionadoId, setLoteSelecionadoId] = useState(null);
  const loteSelecionado = lotes.find((l) => l.id === loteSelecionadoId) || null;

  // Painel geral olha a fazenda inteira; clicar num lote em "Distribuição
  // por lote" filtra os mesmos indicadores só pros animais daquele lote.
  const animais = useMemo(
    () => (loteSelecionadoId ? dados.animais.filter((a) => a.lote_atual_id === loteSelecionadoId) : dados.animais),
    [dados.animais, loteSelecionadoId]
  );
  const idsAnimais = useMemo(() => new Set(animais.map((a) => a.id)), [animais]);
  const pesagens = useMemo(() => dados.pesagens.filter((p) => idsAnimais.has(p.animal_id)), [dados.pesagens, idsAnimais]);
  const procedimentos = useMemo(() => dados.procedimentos.filter((p) => idsAnimais.has(p.animal_id)), [dados.procedimentos, idsAnimais]);

  const ativos = useMemo(() => animais.filter((a) => a.situacao === "ativo"), [animais]);

  const pesoMedio = useMemo(() => {
    // Animal sem pesagem ainda entra na média pelo peso de entrada do
    // cadastro — assim o indicador não fica em branco só porque ninguém
    // pesou esse animal específico ainda.
    const valores = ativos
      .map((a) => {
        const historico = pesagens.filter((p) => p.animal_id === a.id).sort((x, y) => y.data.localeCompare(x.data));
        return historico[0] ? historico[0].peso : a.peso_entrada;
      })
      .filter((v) => v != null);
    if (valores.length === 0) return null;
    return valores.reduce((s, v) => s + v, 0) / valores.length;
  }, [pesagens, ativos]);

  const gmdMedio = useMemo(() => {
    const gmds = [];
    for (const animal of ativos) {
      const historico = pesagens.filter((p) => p.animal_id === animal.id).sort((a, b) => a.data.localeCompare(b.data));
      if (historico.length < 2) continue;
      const anterior = historico[historico.length - 2];
      const atual = historico[historico.length - 1];
      const gmd = calcularGmd(anterior.peso, anterior.data, atual.peso, atual.data);
      if (gmd != null) gmds.push(gmd);
    }
    if (gmds.length === 0) return null;
    return gmds.reduce((s, v) => s + v, 0) / gmds.length;
  }, [pesagens, ativos]);

  // Alertas calculados na hora — nunca ficam desatualizados porque não
  // existe uma tabela separada de alertas pra sincronizar.
  const todosAlertas = useMemo(() => calcularAlertas({ animais, pesagens, procedimentos }), [animais, pesagens, procedimentos]);
  const alertas = todosAlertas.slice(0, 20);

  const lotesAtivos = lotes.filter((l) => l.situacao === "ativo");

  return (
    <div>
      {loteSelecionado ? (
        <>
          <button onClick={() => setLoteSelecionadoId(null)} style={{ ...styles.linkBtn, width: "auto", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={14} /> Ver painel geral da fazenda
          </button>
          <PageHeader title={loteSelecionado.nome} subtitle="Indicadores só deste lote." />
        </>
      ) : (
        <PageHeader title="Painel" subtitle="Indicadores gerais do rebanho." />
      )}

      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Users size={14} /> Ativos</div>
          <div style={styles.kpiValor}>{ativos.length}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Scale size={14} /> Peso médio</div>
          <div style={styles.kpiValor}>{pesoMedio != null ? formatKg(pesoMedio) : "—"}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><TrendingUp size={14} /> GMD médio</div>
          <div style={styles.kpiValor}>{gmdMedio != null ? `${gmdMedio.toFixed(3)} kg/d` : "—"}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Syringe size={14} /> {loteSelecionado ? "Lote" : "Lotes ativos"}</div>
          <div style={styles.kpiValor}>{loteSelecionado ? 1 : lotesAtivos.length}</div>
        </div>
      </div>

      <div style={styles.sectionTitle}>Precisam de atenção</div>
      {alertas.length === 0 && <EmptyHint text="Nenhuma pendência no momento." />}
      {alertas.map((al, i) => (
        <div key={i} style={styles.alertaCard}>
          <AlertTriangle size={16} color="#A85A2A" />
          <div>
            <div style={styles.alertaTitulo}>{al.tipo === "peso" ? "Pesagem atrasada" : "Carência ativa"}</div>
            <div style={styles.alertaSub}>{al.texto}</div>
          </div>
        </div>
      ))}

      {!loteSelecionado && (
        <>
          <div style={styles.sectionTitle}>Distribuição por lote</div>
          {lotesAtivos.length === 0 && <EmptyHint text="Nenhum lote cadastrado ainda." />}
          {lotesAtivos.map((lote) => {
            const qtd = dados.animais.filter((a) => a.lote_atual_id === lote.id && a.situacao === "ativo").length;
            const local = locais.find((l) => l.id === lote.local_id);
            return (
              <button key={lote.id} style={{ ...styles.rowCard, width: "100%", cursor: "pointer", textAlign: "left" }} onClick={() => setLoteSelecionadoId(lote.id)}>
                <div style={{ flex: 1 }}>
                  <div style={styles.listItemTitle}>{lote.nome}</div>
                  <div style={styles.listItemSub}>{local ? local.nome : "Sem local definido"}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{qtd}</div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
