"use client";

import { useState } from "react";
import { Bluetooth, Radio, Scale as ScaleIcon, Trash2 } from "lucide-react";
import { styles } from "@/lib/styles";
import { useRfidScanner } from "@/lib/rfid";
import { useBluetoothDiagnostico } from "@/lib/bluetoothDiagnostico";
import { useBluetoothDiagnosticoNativo } from "@/lib/bluetoothDiagnosticoNativo";
import { nativoDisponivel } from "@/lib/capacitorNativo";

const HORA_FORMATTER = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Busca Bluetooth genérica reaproveitada tanto pra balança quanto pro
// bastão. No navegador comum (Web Bluetooth), buscar já abre o seletor
// nativo do Chrome. Dentro do app Android (plugin nativo), buscar só
// inicia o scan — aparece uma lista de aparelhos aqui embaixo pra tocar e
// conectar, e o último frame bruto recebido (em hex) fica visível pra
// ajudar a descobrir o formato de leitores/balanças ainda não mapeados.
function BuscaBluetooth({ icone: Icone, rotulo, diag, avisoSemPeso, mostrarFrame }) {
  if (!diag.suportado) {
    return (
      <div style={styles.emptyHint}>
        Este navegador não suporta Bluetooth direto. No Android use o Chrome (ou o app
        RASTRO instalado); no iPhone não existe suporte em nenhum navegador.
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

      {diag.status === "buscando" && diag.dispositivosEncontrados?.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12, color: "#8A8A86", marginBottom: 4 }}>Toque num aparelho pra conectar:</div>
          {diag.dispositivosEncontrados.map((item) => (
            <button
              key={item.endereco}
              onClick={() => diag.conectarEm(item.endereco, item.nome)}
              style={{ ...styles.rowCard, width: "100%", cursor: "pointer", textAlign: "left", justifyContent: "space-between" }}
            >
              <span>{item.nome}</span>
              <span style={{ color: "#8A8A86", fontSize: 12 }}>{item.sinal} dBm</span>
            </button>
          ))}
        </div>
      )}

      {diag.dispositivo && (
        <div style={{ fontSize: 13, marginTop: 4 }}>
          <div>
            <strong>Aparelho:</strong> {diag.dispositivo}
          </div>
          <div>
            <strong>Status:</strong> {diag.status === "conectado" ? "Conectado" : "Desconectado"}
          </div>
          {diag.servicosEncontrados?.length > 0 && (
            <div>
              <strong>Serviços identificados:</strong> {diag.servicosEncontrados.join(", ")}
            </div>
          )}
          {mostrarFrame && diag.ultimoFrameHex && (
            <div style={{ marginTop: 4, wordBreak: "break-all" }}>
              <strong>Último frame recebido (hex):</strong> {diag.ultimoFrameHex}
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

  // As duas versões (web e nativa) são chamadas sempre — regra dos hooks —
  // e só uma delas realmente faz algo, dependendo de onde a página roda.
  const bastaoWeb = useBluetoothDiagnostico();
  const balancaWeb = useBluetoothDiagnostico();
  const bastaoNativo = useBluetoothDiagnosticoNativo("BASTAO");
  const balancaNativo = useBluetoothDiagnosticoNativo("BALANCA");
  const emApp = nativoDisponivel();
  const bastao = emApp ? bastaoNativo : bastaoWeb;
  const balanca = emApp ? balancaNativo : balancaWeb;

  return (
    <div style={{ ...styles.card, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <Radio size={19} color="#1F4D45" />
        <strong>Testar leitor RFID e balança</strong>
      </div>
      <div style={{ fontSize: 12, color: "#8A8A86", margin: "4px 0 14px", lineHeight: 1.45 }}>
        {emApp
          ? "Rodando dentro do app RASTRO instalado — a busca usa o plugin nativo de Bluetooth."
          : "Abra esta página no Chrome do Android pra testar Bluetooth no navegador, ou instale o app RASTRO pra usar o plugin nativo (mais completo, cobre também Bluetooth clássico)."}
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
          leitor aparece na lista. O <strong>Allflex RS420</strong> fala Bluetooth
          Classic (SPP/iAP) — no navegador (Web Bluetooth) só aparece se ele também
          anunciar BLE, e só numa janela curta; no app instalado, o plugin nativo
          também tenta o modo serial clássico automaticamente se a busca BLE falhar.
        </div>
        <BuscaBluetooth icone={Bluetooth} rotulo="Buscar bastão por perto" diag={bastao} mostrarFrame />
        {bastao.status === "parado" && bastao.dispositivo === null && !bastao.erro && (
          <div style={{ fontSize: 12, color: "#8A8A86" }}>
            Se não aparecer nada ao tocar em buscar, é o esperado enquanto o RS420 só
            estiver em modo Bluetooth Classic — ver handoff.md. Por enquanto, digite o
            brinco manualmente.
          </div>
        )}
      </div>

      <div style={{ ...styles.rowCard, flexDirection: "column", alignItems: "stretch", gap: 8, marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>Balança Bluetooth</div>
        <div style={{ fontSize: 12, color: "#8A8A86", lineHeight: 1.4 }}>
          Toque em buscar e escolha a balança na lista (ela precisa estar ligada e por
          perto). Essa busca aceita qualquer aparelho Bluetooth, então dá pra achar a
          balança mesmo que ela não use o protocolo padrão de peso.
        </div>
        <BuscaBluetooth
          icone={ScaleIcon}
          rotulo="Buscar balança por perto"
          diag={balanca}
          mostrarFrame
          avisoSemPeso="Conectou, mas não reconheci o formato do peso — essa balança provavelmente usa um protocolo próprio do fabricante, não o padrão do Bluetooth SIG. Guarde o nome do aparelho e os serviços/frame acima; com isso dá pra ajustar o app depois. Por enquanto, digite o peso manualmente nas pesagens."
        />
      </div>
    </div>
  );
}
