"use client";

import { useState } from "react";
import { Radio, Scale as ScaleIcon, Trash2 } from "lucide-react";
import { styles } from "@/lib/styles";
import { useRfidScanner } from "@/lib/rfid";
import { useBluetoothDiagnostico } from "@/lib/bluetoothDiagnostico";

const HORA_FORMATTER = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function TesteEquipamentos() {
  const [leituras, setLeituras] = useState([]);
  const { lendo } = useRfidScanner((tag) => {
    setLeituras((atuais) => [{ tag, hora: HORA_FORMATTER.format(new Date()) }, ...atuais].slice(0, 10));
  });

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
          Pareie o bastão uma vez nas configurações de Bluetooth do Android (fora deste
          app, é um passo do sistema operacional). Depois, com esta página aberta,
          aproxime um brinco do leitor e aperte o gatilho — não precisa clicar em nenhum
          campo antes. Isso só funciona se o bastão estiver configurado em <strong>modo
          teclado (HID)</strong>; procure essa opção no menu do próprio aparelho ou no
          manual dele.
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
          <div style={styles.emptyHint}>
            Nenhuma leitura ainda. Se aproximar o brinco e nada aparecer aqui, o bastão
            pode estar em <strong>modo serial (SPP)</strong> em vez de teclado — foi o que
            aconteceu no teste com o Allflex RS420 (ele usa Bluetooth Classic SPP/iAP, que
            nenhum navegador consegue ler, nem no Android). Nesse caso a leitura
            automática só vai funcionar num aplicativo nativo (já é o plano documentado no
            handoff.md); por enquanto, digite o brinco manualmente.
          </div>
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
      </div>

      <div style={{ ...styles.rowCard, flexDirection: "column", alignItems: "stretch", gap: 8, marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>Balança Bluetooth</div>
        {!balanca.suportado ? (
          <div style={styles.emptyHint}>
            Este navegador não suporta Bluetooth direto. No Android use o Chrome; no
            iPhone não existe suporte em nenhum navegador — digite o peso manualmente.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#8A8A86", lineHeight: 1.4 }}>
              Toque em buscar e escolha a balança na lista que o Chrome mostrar (ela
              precisa estar ligada e por perto). Essa busca aceita qualquer aparelho
              Bluetooth, então dá pra achar a balança mesmo que ela não use o protocolo
              padrão de peso.
            </div>
            {balanca.status !== "conectado" ? (
              <button
                onClick={balanca.buscar}
                disabled={balanca.status === "buscando"}
                style={{ ...styles.primaryBtn, marginTop: 4 }}
              >
                <ScaleIcon size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
                {balanca.status === "buscando" ? "Buscando..." : "Buscar balança por perto"}
              </button>
            ) : (
              <button onClick={balanca.desconectar} style={{ ...styles.secondaryBtn, marginTop: 4 }}>
                Desconectar
              </button>
            )}
            {balanca.erro && <div style={styles.errorBox}>{balanca.erro}</div>}
            {balanca.dispositivo && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                <div>
                  <strong>Aparelho:</strong> {balanca.dispositivo}
                </div>
                <div>
                  <strong>Status:</strong> {balanca.status === "conectado" ? "Conectado" : "Desconectado"}
                </div>
                {balanca.servicosEncontrados.length > 0 && (
                  <div>
                    <strong>Serviços identificados:</strong> {balanca.servicosEncontrados.join(", ")}
                  </div>
                )}
                {balanca.status === "conectado" && balanca.pesoReconhecido === false && (
                  <div style={{ ...styles.errorBox, marginTop: 8 }}>
                    Conectou, mas não reconheci o formato do peso — essa balança
                    provavelmente usa um protocolo próprio do fabricante, não o padrão do
                    Bluetooth SIG. Guarde o nome do aparelho e os serviços acima; com isso
                    dá pra ajustar o app depois. Por enquanto, digite o peso manualmente
                    nas pesagens.
                  </div>
                )}
                {balanca.peso != null && (
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: "#1F4D45" }}>{balanca.peso}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
