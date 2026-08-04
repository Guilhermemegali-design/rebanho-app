"use client";

// ============================================================
// BALANÇA BLUETOOTH (Coimma / Tru-Test / outras)
//
// Web Bluetooth só existe em Chrome/Edge no Android, Windows e Mac —
// não existe em NENHUM navegador do iPhone/iPad (nem Chrome-iOS, que
// usa o motor da Apple). Por isso o app SEMPRE tem que funcionar com
// peso digitado à mão — a leitura automática aqui é um reforço, não
// uma dependência.
//
// Tenta primeiro o serviço padrão do Bluetooth SIG ("Weight Scale
// Service", 0x181D) — algumas balanças seguem esse padrão. Balanças
// com protocolo proprietário (bem provável em pelo menos uma marca)
// não vão responder a esse serviço; o app detecta isso e mantém o
// campo manual como caminho garantido. Ajuste fino por marca
// (Coimma/Tru-Test) só é possível com o equipamento físico em mãos.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { base64ParaBytes, nativoDisponivel, rebanhoHardware } from "./capacitorNativo";

export const WEIGHT_SCALE_SERVICE = 0x181d;
export const WEIGHT_MEASUREMENT_CHARACTERISTIC = 0x2a9d;

export function bluetoothDisponivel() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export function decodificarPeso(dataView) {
  // Formato "Weight Measurement" do Bluetooth SIG: byte 0 = flags
  // (bit 0 = unidade imperial), bytes seguintes = peso (uint16),
  // resolução 0.005 kg (SI) ou 0.01 lb (imperial).
  const flags = dataView.getUint8(0);
  const imperial = (flags & 0x1) === 1;
  const bruto = dataView.getUint16(1, true);
  const peso = imperial ? bruto * 0.01 : bruto * 0.005;
  return { peso: Number(peso.toFixed(2)), unidade: imperial ? "lb" : "kg" };
}

export function useBluetoothScale() {
  const [conectado, setConectado] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [peso, setPeso] = useState(null);
  const [dispositivo, setDispositivo] = useState(null);
  const [erro, setErro] = useState("");
  const [dispositivosEncontrados, setDispositivosEncontrados] = useState([]);
  const deviceRef = useRef(null);

  const handleNotification = useCallback((event) => {
    try {
      const { peso: valor } = decodificarPeso(event.target.value);
      setPeso(valor);
    } catch {
      // valor em formato inesperado (protocolo proprietário) — ignora
      // e deixa o operador digitar o peso manualmente.
    }
  }, []);

  const conectar = useCallback(async () => {
    if (nativoDisponivel()) {
      setErro("");
      setConectando(true);
      setDispositivosEncontrados([]);
      try {
        await rebanhoHardware()?.buscarBalanca();
      } catch (err) {
        setErro(err?.message || "Não foi possível buscar a balança.");
        setConectando(false);
      }
      return;
    }
    if (!bluetoothDisponivel()) {
      setErro("Este navegador/aparelho não suporta conexão Bluetooth direta. Digite o peso manualmente.");
      return;
    }
    setErro("");
    setConectando(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [WEIGHT_SCALE_SERVICE] }],
        optionalServices: [WEIGHT_SCALE_SERVICE],
      });
      deviceRef.current = device;
      setDispositivo(device.name || "Balança");

      device.addEventListener("gattserverdisconnected", () => {
        setConectado(false);
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(WEIGHT_SCALE_SERVICE);
      const characteristic = await service.getCharacteristic(WEIGHT_MEASUREMENT_CHARACTERISTIC);
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", handleNotification);

      setConectado(true);
    } catch (err) {
      if (err?.name === "NotFoundError") {
        setErro("Nenhuma balança compatível encontrada perto. Confira se ela está ligada e pareada, ou digite o peso manualmente.");
      } else {
        setErro("Não foi possível conectar com essa balança automaticamente. Digite o peso manualmente.");
      }
      setConectado(false);
    } finally {
      setConectando(false);
    }
  }, [handleNotification]);

  const conectarEm = useCallback(async (endereco, nome) => {
    setDispositivo(nome || endereco);
    setConectando(true);
    try {
      await rebanhoHardware()?.conectar({ tipo: "BALANCA", endereco });
    } catch (err) {
      setErro(err?.message || "Não foi possível conectar à balança.");
      setConectando(false);
    }
  }, []);

  const desconectar = useCallback(() => {
    if (nativoDisponivel()) {
      rebanhoHardware()?.desconectar({ tipo: "BALANCA" });
    }
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setConectado(false);
    setPeso(null);
    setDispositivosEncontrados([]);
  }, []);

  useEffect(() => {
    if (nativoDisponivel()) {
      const hw = rebanhoHardware();
      let ativo = true;
      let handles = [];
      Promise.all([
        hw.addListener("bluetoothDevices", (data) => {
          if (!ativo || data.tipo !== "BALANCA") return;
          setDispositivosEncontrados(data.dispositivos || []);
        }),
        hw.addListener("bluetoothStatus", (data) => {
          if (!ativo || data.tipo !== "BALANCA") return;
          if (data.conectado) {
            setConectado(true);
            setConectando(false);
            setErro("");
          } else if (data.mensagem) {
            setErro(data.mensagem);
          }
        }),
        hw.addListener("bluetoothFrame", (data) => {
          if (!ativo || data.tipo !== "BALANCA" || !data.base64) return;
          try {
            const bytes = base64ParaBytes(data.base64);
            const { peso: valor } = decodificarPeso(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
            setPeso(valor);
            setConectado(true);
            setConectando(false);
            setErro("");
          } catch {
            setErro("A balança conectou, mas o formato do peso ainda não foi reconhecido.");
          }
        }),
      ]).then((resultado) => {
        if (ativo) handles = resultado;
        else resultado.forEach((handle) => handle.remove());
      });
      return () => {
        ativo = false;
        handles.forEach((handle) => handle.remove());
      };
    }
    return () => {
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    };
  }, []);

  return {
    suportado: nativoDisponivel() || bluetoothDisponivel(),
    conectado,
    conectando,
    peso,
    dispositivo,
    erro,
    dispositivosEncontrados,
    conectar,
    conectarEm,
    desconectar,
    limparPeso: () => setPeso(null),
  };
}
