"use client";

import { useMemo } from "react";
import { styles } from "@/lib/styles";
import { calcularAlertas } from "@/lib/alerts";
import { calcularAlertasReproducao } from "@/lib/reproducao";
import { AlertTriangle, Syringe, HeartPulse } from "lucide-react";
import { PageHeader, EmptyHint } from "@/components/UI";

const TITULOS_REPRODUCAO = {
  iatf_retirada: "Retirada do implante (IATF)",
  iatf_ia: "Inseminação prevista (IATF)",
  dg_pendente: "Diagnóstico de gestação pendente",
  parto_previsto: "Parto previsto",
  desmame_previsto: "Desmame previsto",
  categoria_sugerida: "Categoria sugerida",
  descarte_sugerido: "Descarte sugerido",
};

export default function AlertasTab({ dados }) {
  const alertas = useMemo(() => calcularAlertas(dados), [dados]);
  const alertasReproducao = useMemo(() => calcularAlertasReproducao(dados), [dados]);

  return (
    <div>
      <PageHeader title="Alertas" subtitle="Animais que precisam de atenção agora." />

      {alertas.length === 0 && alertasReproducao.length === 0 && <EmptyHint text="Nenhuma pendência no momento." />}

      {alertas.map((al, i) => {
        const carencia = al.tipo === "carencia";
        return (
          <div key={`base-${i}`} style={styles.alertRow}>
            <div style={{ ...styles.alertIconBox, background: carencia ? "#F6E6DA" : "#FBE2DC" }}>
              {carencia ? <Syringe size={16} color="#A85A2A" /> : <AlertTriangle size={16} color="#C24E3A" />}
            </div>
            <div>
              <div style={styles.alertaTitulo}>{carencia ? "Carência ativa" : "Pesagem atrasada"}</div>
              <div style={styles.alertaSub}>{al.texto}</div>
            </div>
          </div>
        );
      })}

      {alertasReproducao.map((al, i) => (
        <div key={`cria-${i}`} style={styles.alertRow}>
          <div style={{ ...styles.alertIconBox, background: "#E4DCF6" }}>
            <HeartPulse size={16} color="#6B4FA0" />
          </div>
          <div>
            <div style={styles.alertaTitulo}>{TITULOS_REPRODUCAO[al.tipo] || "Cria"}</div>
            <div style={styles.alertaSub}>{al.texto}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
