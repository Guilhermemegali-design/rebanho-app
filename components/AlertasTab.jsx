"use client";

import { useMemo } from "react";
import { styles } from "@/lib/styles";
import { calcularAlertas } from "@/lib/alerts";
import { AlertTriangle, Syringe } from "lucide-react";
import { PageHeader, EmptyHint } from "@/components/UI";

export default function AlertasTab({ dados }) {
  const alertas = useMemo(() => calcularAlertas(dados), [dados]);

  return (
    <div>
      <PageHeader title="Alertas" subtitle="Animais que precisam de atenção agora." />

      {alertas.length === 0 && <EmptyHint text="Nenhuma pendência no momento." />}

      {alertas.map((al, i) => {
        const carencia = al.tipo === "carencia";
        return (
          <div key={i} style={styles.alertRow}>
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
    </div>
  );
}
