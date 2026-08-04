"use client";

// ============================================================
// DIAGNÓSTICO DE BALANÇA BLUETOOTH — usado só na tela de teste em
// Configurações, nunca no fluxo real de pesagem.
//
// O hook de produção (lib/bluetoothScale.js) já filtra a busca pra
// mostrar só aparelhos que anunciam o serviço padrão de peso do
// Bluetooth SIG — bom pro dia a dia, mas ruim pra testar, porque se a
// balança usar um protocolo próprio ela nem aparece na lista. Aqui a
// busca aceita QUALQUER aparelho Bluetooth por perto, pra dar pra achar
// a balança pelo nome e descobrir se ela fala o protocolo padrão ou não.
// ============================================================

import { useCallback, useRef, useState } from "react";
import { bluetoothDisponivel, decodificarPeso, WEIGHT_SCALE_SERVICE, WEIGHT_MEASUREMENT_CHARACTERISTIC } from "./bluetoothScale";

const SERVICOS_CONHECIDOS = [
  { uuid: WEIGHT_SCALE_SERVICE, nome: "Weight Scale (peso padrão)" },
  { uuid: "battery_service", nome: "Battery" },
  { uuid: "device_information", nome: "Device Information" },
  { uuid: "generic_access", nome: "Generic Access" },
];

export function useBluetoothDiagnostico() {
  const [status, setStatus] = useState("parado"); // parado | buscando | conectado
  const [dispositivo, setDispositivo] = useState(null);
  const [servicosEncontrados, setServicosEncontrados] = useState([]);
  const [peso, setPeso] = useState(null);
  const [pesoReconhecido, setPesoReconhecido] = useState(null);
  const [erro, setErro] = useState("");
  const deviceRef = useRef(null);

  const handleNotification = useCallback((event) => {
    try {
      const { peso: valor, unidade } = decodificarPeso(event.target.value);
      setPeso(`${valor} ${unidade}`);
      setPesoReconhecido(true);
    } catch {
      setPesoReconhecido(false);
    }
  }, []);

  const buscar = useCallback(async () => {
    if (!bluetoothDisponivel()) {
      setErro("Este navegador não suporta Bluetooth direto. No Android, abra esta página no Chrome.");
      return;
    }
    setErro("");
    setServicosEncontrados([]);
    setPeso(null);
    setPesoReconhecido(null);
    setStatus("buscando");
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICOS_CONHECIDOS.map((s) => s.uuid),
      });
      deviceRef.current = device;
      setDispositivo(device.name || "(aparelho sem nome)");
      device.addEventListener("gattserverdisconnected", () => setStatus("parado"));

      const server = await device.gatt.connect();

      const encontrados = [];
      for (const servico of SERVICOS_CONHECIDOS) {
        try {
          await server.getPrimaryService(servico.uuid);
          encontrados.push(servico.nome);
        } catch {
          // aparelho não tem esse serviço específico — normal, só listamos os que existem
        }
      }
      setServicosEncontrados(encontrados);

      try {
        const servicoPeso = await server.getPrimaryService(WEIGHT_SCALE_SERVICE);
        const caracteristica = await servicoPeso.getCharacteristic(WEIGHT_MEASUREMENT_CHARACTERISTIC);
        await caracteristica.startNotifications();
        caracteristica.addEventListener("characteristicvaluechanged", handleNotification);
      } catch {
        // sem o serviço padrão de peso — provavelmente protocolo próprio do fabricante
      }

      setStatus("conectado");
    } catch (err) {
      if (err?.name === "NotFoundError") {
        setErro("Nenhum aparelho selecionado (ou a busca foi cancelada).");
      } else {
        setErro(err.message || "Não foi possível conectar com esse aparelho.");
      }
      setStatus("parado");
    }
  }, [handleNotification]);

  const desconectar = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    deviceRef.current = null;
    setStatus("parado");
    setDispositivo(null);
    setServicosEncontrados([]);
    setPeso(null);
    setPesoReconhecido(null);
  }, []);

  return {
    suportado: bluetoothDisponivel(),
    status,
    dispositivo,
    servicosEncontrados,
    peso,
    pesoReconhecido,
    erro,
    buscar,
    desconectar,
  };
}
