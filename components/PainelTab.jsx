"use client";

import { useMemo } from "react";
import { styles } from "@/lib/styles";
import { formatKg, formatDataBR, calcularGmd } from "@/lib/format";
import { Users, TrendingUp, AlertTriangle, Syringe, Scale } from "lucide-react";
import { EmptyHint } from "@/components/UI";

const DIAS_SEM_PESAGEM_ALERTA = 45;

export default function PainelTab({ dados }) {
  const { animais, locais, lotes, pesagens, procedimentos } = dados;

  const ativos = useMemo(() => animais.filter((a) => a.situacao === "ativo"), [animais]);

  const pesoMedio = useMemo(() => {
    const ultimosPorAnimal = ultimaPesagemPorAnimal(pesagens, ativos);
    const valores = Object.values(ultimosPorAnimal).map((p) => p.peso).filter((v) => v != null);
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
  const alertas = useMemo(() => {
    const lista = [];
    const hoje = new Date();

    for (const animal of ativos) {
      const historico = pesagens.filter((p) => p.animal_id === animal.id).sort((a, b) => b.data.localeCompare(a.data));
      const ultima = historico[0];
      const diasSemPesar = ultima
        ? Math.round((hoje - new Date(ultima.data + "T00:00:00")) / 86400000)
        : Math.round((hoje - new Date(animal.data_entrada + "T00:00:00")) / 86400000);
      if (diasSemPesar >= DIAS_SEM_PESAGEM_ALERTA) {
        lista.push({ tipo: "peso", animal, texto: `${animal.brinco_atual} sem pesagem há ${diasSemPesar} dias` });
      }
    }

    for (const p of procedimentos) {
      if (!p.carencia_dias || !p.data_aplicacao) continue;
      const fimCarencia = new Date(p.data_aplicacao + "T00:00:00");
      fimCarencia.setDate(fimCarencia.getDate() + p.carencia_dias);
      if (fimCarencia >= hoje) {
        const animal = ativos.find((a) => a.id === p.animal_id);
        if (animal) {
          const diasRestantes = Math.round((fimCarencia - hoje) / 86400000);
          lista.push({ tipo: "carencia", animal, texto: `${animal.brinco_atual} em carência (${diasRestantes}d restantes)` });
        }
      }
    }

    return lista.slice(0, 20);
  }, [ativos, pesagens, procedimentos]);

  return (
    <div>
      <h1 style={styles.h1}>Painel</h1>

      <div style={{ ...styles.kpiGrid, marginTop: 14 }}>
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
          <div style={styles.kpiHeader}><Syringe size={14} /> Lotes ativos</div>
          <div style={styles.kpiValor}>{lotes.filter((l) => l.situacao === "ativo").length}</div>
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

      <div style={styles.sectionTitle}>Distribuição por lote</div>
      {lotes.filter((l) => l.situacao === "ativo").length === 0 && <EmptyHint text="Nenhum lote cadastrado ainda." />}
      {lotes.filter((l) => l.situacao === "ativo").map((lote) => {
        const qtd = ativos.filter((a) => a.lote_atual_id === lote.id).length;
        const local = locais.find((l) => l.id === lote.local_id);
        return (
          <div key={lote.id} style={styles.rowCard}>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{lote.nome}</div>
              <div style={styles.listItemSub}>{local ? local.nome : "Sem local definido"}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{qtd}</div>
          </div>
        );
      })}
    </div>
  );
}

function ultimaPesagemPorAnimal(pesagens, animais) {
  const resultado = {};
  for (const animal of animais) {
    const historico = pesagens.filter((p) => p.animal_id === animal.id).sort((a, b) => b.data.localeCompare(a.data));
    if (historico[0]) resultado[animal.id] = historico[0];
  }
  return resultado;
}
