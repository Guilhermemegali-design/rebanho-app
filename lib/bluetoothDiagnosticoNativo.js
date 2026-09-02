"use client";

// ============================================================
// Versão nativa (app Android/Capacitor) do diagnóstico de Bluetooth,
// mesma forma externa de useBluetoothDiagnostico (lib/bluetoothDiagnostico.js)
// pra components/TesteEquipamentos.jsx poder trocar de um pro outro sem
// mudar o resto da tela. Usa o plugin RebanhoHardwarePlugin.kt em vez de
// Web Bluetooth — dá pra achar tanto a balança (BLE padrão) quanto o
// bastão (BLE numa janela curta e/ou Bluetooth Classic, ver handoff.md).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { nativoDisponivel, rebanhoHardware, base64ParaBytes } from "./capacitorNativo";
import { decodificarPeso, memorizarEstadoBalancaNativa } from "./bluetoothScale";

export function useBluetoothDiagnosticoNativo(tipo) {
  const [status, setStatus] = useState("parado"); // parado | buscando | conectado
  const [dispositivo, setDispositivo] = useState(null);
  const [dispositivosEncontrados, setDispositivosEncontrados] = useState([]);
  const [servicosEncontrados, setServicosEncontrados] = useState([]);
  const [peso, setPeso] = useState(null);
  const [pesoReconhecido, setPesoReconhecido] = useState(null);
  const [ultimoFrameHex, setUltimoFrameHex] = useState(null);
  const [erro, setErro] = useState("");
  const listenersRef = useRef([]);

  useEffect(() => {
    if (!nativoDisponivel()) return;
    const hw = rebanhoHardware();
    if (!hw) return;

    let ativo = true;
    Promise.all([
      hw.addListener("bluetoothStatus", (data) => {
        if (!ativo || data.tipo !== tipo) return;
        if (data.conectado) setStatus("conectado");
        if (tipo === "BALANCA" && data.conectado) memorizarEstadoBalancaNativa({ conectado: true });
        setErro(data.conectado ? "" : data.mensagem || "");
        if (data.conectado) setDispositivo((atual) => atual || data.mensagem);
      }),
      hw.addListener("bluetoothFrame", (data) => {
        if (!ativo || data.tipo !== tipo) return;
        const bytes = base64ParaBytes(data.base64);
        setUltimoFrameHex(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" "));
        if (tipo === "BALANCA") {
          try {
            const view = new DataView(bytes.buffer);
            const { peso: valor, unidade } = decodificarPeso(view);
            setPeso(`${valor} ${unidade}`);
            setPesoReconhecido(true);
          } catch {
            setPesoReconhecido(false);
          }
        }
      }),
      hw.addListener("bluetoothDevices", (data) => {
        if (!ativo || data.tipo !== tipo) return;
        setDispositivosEncontrados(data.dispositivos || []);
      }),
    ]).then((handles) => {
      if (ativo) listenersRef.current = handles;
      else handles.forEach((h) => h.remove());
    });

    return () => {
      ativo = false;
      listenersRef.current.forEach((h) => h.remove());
      listenersRef.current = [];
    };
  }, [tipo]);

  const buscar = useCallback(async () => {
    const hw = rebanhoHardware();
    if (!hw) {
      setErro("Plugin nativo indisponível.");
      return;
    }
    setErro("");
    setDispositivo(null);
    setDispositivosEncontrados([]);
    setServicosEncontrados([]);
    setPeso(null);
    setPesoReconhecido(null);
    setUltimoFrameHex(null);
    setStatus("buscando");
    try {
      if (tipo === "BALANCA") await hw.buscarBalanca();
      else await hw.buscarBastao();
    } catch (err) {
      setErro(err?.message || "Não foi possível iniciar a busca.");
      setStatus("parado");
    }
  }, [tipo]);

  const conectarEm = useCallback(
    async (endereco, nome) => {
      const hw = rebanhoHardware();
      if (!hw) return;
      setDispositivo(nome || endereco);
      if (tipo === "BALANCA") memorizarEstadoBalancaNativa({ conectado: false, dispositivo: nome || endereco });
      await hw.conectar({ tipo, endereco });
    },
    [tipo],
  );

  const desconectar = useCallback(() => {
    rebanhoHardware()?.desconectar({ tipo });
    setStatus("parado");
    setDispositivo(null);
    setDispositivosEncontrados([]);
    setServicosEncontrados([]);
    setPeso(null);
    setPesoReconhecido(null);
    setUltimoFrameHex(null);
    if (tipo === "BALANCA") memorizarEstadoBalancaNativa({ conectado: false, dispositivo: null });
  }, [tipo]);

  return {
    suportado: nativoDisponivel(),
    status,
    dispositivo,
    dispositivosEncontrados,
    servicosEncontrados,
    peso,
    pesoReconhecido,
    ultimoFrameHex,
    erro,
    buscar,
    conectarEm,
    desconectar,
  };
}
