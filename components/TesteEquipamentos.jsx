"use client";

import { useState } from "react";
import { Bluetooth, Radio, Scale as ScaleIcon, Trash2 } from "lucide-react";
import { styles } from "@/lib/styles";
import { useRfidScanner } from "@/lib/rfid";
import { useBluetoothDiagnostico } from "@/lib/bluetoothDiagnostico";

const HORA_FORMATTER = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Busca Bluetooth genérica (BLE, acceptAllDevices) reaproveitada tanto pra
// balança quanto pro bastão — cada chamador passa sua própria instância de
// useBluetoothDiagnostico(), então os dois têm estado independente.
function BuscaBluetooth({ icone: Icone, rotulo, diag, avisoSemPeso }) {
  if (!diag.suportado) {
    return (
      <div style={styles.emptyHint}>
        Este navegador não suporta Bluetooth direto. No Android use o Chrome; no
        iPhone não existe suporte em nenhum navegador.
      </div>
    );
  }
  return (
    <>
      {diag.status !== "conectado" ? (
        <button
          onClick={diag.buscar}
          disabled={diag.status === "buscando"}
          style={{ ...styles.primaryBtn, marginTop: 4 }}
        >
          <Icone size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {diag.status === "buscando" ? "Buscando..." : rotulo}
        </button>
      ) : (
        <button onClick={diag.desconectar} style={{ ...styles.secondaryBtn, marginTop: 4 }}>
          Desconectar
        </button>
      )}
      {diag.erro && <div style={styles.errorBox}>{diag.erro}</div>}
      {diag.dispositivo && (
        <div style={{ fontSize: 13, marginTop: 4 }}>
          <div>
            <strong>Aparelho:</strong> {diag.dispositivo}
          </div>
          <div>
            <strong>Status:</strong> {diag.status === "conectado" ? "Conectado" : "Desconectado"}
          </div>
          {diag.servicosEncontrados.length > 0 && (
            <div>
              <strong>Serviços identificados:</strong> {diag.servicosEncontrados.join(", ")}
            </div>
          )}
          {diag.status === "conectado" && diag.pesoReconhecido === false && avisoSemPeso && (
            <div style={{ ...styles.errorBox, marginTop: 8 }}>{avisoSemPeso}</div>
          )}
          {diag.peso != null && (
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: "#1F4D45" }}>{diag.peso}</div>
          )}
        </div>
      )}
    </>
  );
}

export default function TesteEquipamentos() {
  const [leituras, setLeituras] = useState([]);
  const { lendo } = useRfidScanner((tag) => {
    setLeituras((atuais) => [{ tag, hora: HORA_FORMATTER.format(new Date()) }, ...atuais].slice(0, 10));
  });

  const bastao = useBluetoothDiagnostico();
  const balanca = useBluetoothDiagnostico();

  return (
    <div style={{ ...styles.card, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <Radio size={19} color="#1F4D45" />
        <strong>Testar leitor RFID e balança</strong>
      </div>
      <div style={{ fontSize: 12, color: "#8A8A86", margin: "4px 0 14px", lineHeight: 1.45 }}>
        Abra esta página no <strong>Chrome do Android</strong> — é o único navegador de
        celular com suporte a Bluetooth direto (no iPhone não existe em nenhum
        navegador, e ali o peso/brinco sempre podem ser digitados à mão).
      </div>

      <div style={{ ...styles.rowCard, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Bastão RFID</div>

        <div style={{ fontSize: 12, color: "#8A8A86", lineHeight: 1.4 }}>
          <strong>Caminho 1 — modo teclado (HID):</strong> pareie o bastão nas
          configurações de Bluetooth do Android (fora deste app) e aproxime um brinco
          do leitor. Só funciona se o bastão tiver essa opção ligada — procure "modo
          teclado" ou "HID" no menu ou manual dele.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: lendo ? "#D98A3D" : "#B9C4BE",
              display: "inline-block",
            }}
          />
          {lendo ? "Lendo..." : "Aguardando leitura"}
        </div>
        {leituras.length === 0 ? (
          <div style={styles.emptyHint}>Nenhuma leitura ainda.</div>
        ) : (
          <div>
            {leituras.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  padding: "6px 0",
                  borderTop: i === 0 ? "none" : "1px solid #EFEDE7",
                }}
              >
                <span style={{ fontWeight: 700 }}>{item.tag}</span>
                <span style={{ color: "#8A8A86" }}>{item.hora}</span>
              </div>
            ))}
          </div>
        )}
        {leituras.length > 0 && (
          <button onClick={() => setLeituras([])} style={{ ...styles.linkBtn, marginTop: 0 }}>
            <Trash2 size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Limpar histórico
          </button>
        )}

        <div style={{ fontSize: 12, color: "#8A8A86", lineHeight: 1.4, marginTop: 10, borderTop: "1px solid #EFEDE7", paddingTop: 10 }}>
          <strong>Caminho 2 — buscar por Bluetooth:</strong> toque em buscar e veja se o
          leitor aparece na lista do Chrome. O <strong>Allflex RS420</strong> usa
          Bluetooth Classic (SPP/iAP), que essa busca (só enxerga BLE) provavelmente
          não vai encontrar — mas vale tentar: se ele também tiver rádio BLE, aparece
          aqui e já ajuda a mapear os serviços dele pra quando o app nativo for feito.
        </div>
        <BuscaBluetooth icone={Bluetooth} rotulo="Buscar bastão por perto" diag={bastao} />
        {bastao.status === "parado" && bastao.dispositivo === null && !bastao.erro && (
          <div style={{ fontSize: 12, color: "#8A8A86" }}>
            Se não aparecer nada na lista ao tocar em buscar, é o esperado: confirma que
            o RS420 só fala Bluetooth Classic, e a leitura automática vai exigir o app
            Android nativo já planejado (ver handoff.md). Por enquanto, digite o brinco
            manualmente.
          </div>
        )}
      </div>

      <div style={{ ...styles.rowCard, flexDirection: "column", alignItems: "stretch", gap: 8, marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>Balança Bluetooth</div>
        <div style={{ fontSize: 12, color: "#8A8A86", lineHeight: 1.4 }}>
          Toque em buscar e escolha a balança na lista que o Chrome mostrar (ela
          precisa estar ligada e por perto). Essa busca aceita qualquer aparelho
          Bluetooth, então dá pra achar a balança mesmo que ela não use o protocolo
          padrão de peso.
        </div>
        <BuscaBluetooth
          icone={ScaleIcon}
          rotulo="Buscar balança por perto"
          diag={balanca}
          avisoSemPeso="Conectou, mas não reconheci o formato do peso — essa balança provavelmente usa um protocolo próprio do fabricante, não o padrão do Bluetooth SIG. Guarde o nome do aparelho e os serviços acima; com isso dá pra ajustar o app depois. Por enquanto, digite o peso manualmente nas pesagens."
        />
      </div>
    </div>
  );
}
