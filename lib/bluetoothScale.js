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
// Suporta o serviço padrão do Bluetooth SIG ("Weight Scale Service",
// 0x181D) e o serviço BLE proprietário FFE0/FFE1 da Coimma KM3-N.
// A Coimma envia cada quadro em duas notificações (20 + 6 bytes), então
// a versão web precisa remontá-las antes de interpretar o peso.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { base64ParaBytes, nativoDisponivel, rebanhoHardware } from "./capacitorNativo";

export const WEIGHT_SCALE_SERVICE = 0x181d;
export const WEIGHT_MEASUREMENT_CHARACTERISTIC = 0x2a9d;
export const COIMMA_BLE_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const COIMMA_BLE_CHARACTERISTIC = "0000ffe1-0000-1000-8000-00805f9b34fb";
const TAMANHO_QUADRO_COIMMA = 26;

// O plugin Android mantém a conexão física viva ao trocar de tela. Guarda
// aqui o último estado conhecido para que o próximo formulário já reconheça
// essa conexão, em vez de obrigar o operador a conectar novamente.
let estadoBalancaNativa = { conectado: false, dispositivo: null };

export function memorizarEstadoBalancaNativa({ conectado, dispositivo } = {}) {
  estadoBalancaNativa = {
    conectado: conectado ?? estadoBalancaNativa.conectado,
    dispositivo: dispositivo === undefined ? estadoBalancaNativa.dispositivo : dispositivo,
  };
}

export function bluetoothDisponivel() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

// Função pura para permitir testar a remontagem sem depender do navegador.
// Retorna todos os quadros completos recebidos e preserva somente o trecho
// incompleto para a próxima notificação BLE.
export function extrairQuadrosCoimma(bufferAtual = [], novosBytes = []) {
  let dados = [...bufferAtual, ...novosBytes];
  const quadros = [];

  while (dados.length > 0) {
    const inicio = dados.indexOf(0x02);
    if (inicio < 0) return { quadros, restante: [] };
    if (inicio > 0) dados = dados.slice(inicio);
    if (dados.length < TAMANHO_QUADRO_COIMMA) break;

    const candidato = dados.slice(0, TAMANHO_QUADRO_COIMMA);
    if (candidato[TAMANHO_QUADRO_COIMMA - 1] === 0x03) {
      quadros.push(Uint8Array.from(candidato));
      dados = dados.slice(TAMANHO_QUADRO_COIMMA);
      continue;
    }

    // Cabeçalho corrompido: descarta o STX atual e procura o próximo.
    dados = dados.slice(1);
  }

  return { quadros, restante: dados.slice(-TAMANHO_QUADRO_COIMMA) };
}

export function decodificarPeso(dataView) {
  if (!(dataView instanceof DataView) || dataView.byteLength < 3) {
    throw new Error("Quadro de peso incompleto.");
  }

  // Protocolo serial BLE da Coimma KM3-N observado no equipamento real:
  // STX + cabeçalho numérico (10) + "P" + estado (2) + peso em kg (9)
  // + NUL + checksum + ETX. Exemplo de 19 kg:
  // \x02 0002600101 P 01 000000019 \x00 o \x03
  // O Android remonta as duas notificações BLE (20 + 6 bytes) antes de
  // chegar aqui. O estado 01 significa leitura estável e 00, em movimento;
  // ambos atualizam o campo, como já acontece com a Tru-Test S3.
  if (dataView.byteLength >= 20 && dataView.getUint8(0) === 0x02) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const texto = String.fromCharCode(...bytes);
    const coimma = texto.match(/^\x02\d{10}P(\d{2})(\d{9})\x00.\x03$/s);
    if (!coimma) throw new Error("Quadro Coimma inválido.");

    const peso = Number.parseInt(coimma[2], 10);
    if (!Number.isFinite(peso) || peso < 0 || peso > 3000) {
      throw new Error("Peso Coimma fora da faixa esperada.");
    }
    return { peso, unidade: "kg", estavel: coimma[1] === "01", protocolo: "coimma-km3" };
  }

  // Formato "Weight Measurement" do Bluetooth SIG: byte 0 = flags
  // (bit 0 = unidade imperial), bytes seguintes = peso (uint16). A
  // resolução real depende do equipamento (campo "Weight Resolution" da
  // característica 0x2A9E, que este app não lê) — a Tru-Test S3 testada
  // em campo usa 0.05 kg (não a resolução mais fina de 0.005 kg que
  // este código assumia antes): um peso real de 92 kg chegava como 9,2 kg
  // no app, sempre 10x menor. Se outra balança um dia mostrar o peso 10x
  // maior ou menor que o real, é esse fator que precisa ajustar de novo.
  const flags = dataView.getUint8(0);
  const imperial = (flags & 0x1) === 1;
  const bruto = dataView.getUint16(1, true);
  const peso = imperial ? bruto * 0.1 : bruto * 0.05;
  return {
    peso: Number(peso.toFixed(2)),
    unidade: imperial ? "lb" : "kg",
    estavel: true,
    protocolo: "bluetooth-sig",
  };
}

export function useBluetoothScale() {
  const [conectado, setConectado] = useState(() => nativoDisponivel() && estadoBalancaNativa.conectado);
  const [conectando, setConectando] = useState(false);
  const [peso, setPeso] = useState(null);
  const [leituraId, setLeituraId] = useState(0);
  const [dispositivo, setDispositivo] = useState(() => nativoDisponivel() ? estadoBalancaNativa.dispositivo : null);
  const [erro, setErro] = useState("");
  const [dispositivosEncontrados, setDispositivosEncontrados] = useState([]);
  const deviceRef = useRef(null);
  const characteristicRef = useRef(null);
  const protocoloWebRef = useRef(null);
  const coimmaBufferRef = useRef([]);

  const publicarPeso = useCallback((dataView) => {
    const { peso: valor } = decodificarPeso(dataView);
    setPeso(valor);
    // Incrementa mesmo quando o valor é igual ao anterior. No curral é
    // comum dois animais consecutivos terem o mesmo peso e cada passagem
    // precisa preencher o campo ativo.
    setLeituraId((atual) => atual + 1);
  }, []);

  const handleNotification = useCallback((event) => {
    try {
      const valor = event.target.value;
      if (protocoloWebRef.current === "coimma-km3") {
        const bytes = new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength);
        const { quadros, restante } = extrairQuadrosCoimma(coimmaBufferRef.current, bytes);
        coimmaBufferRef.current = restante;
        quadros.forEach((quadro) => publicarPeso(
          new DataView(quadro.buffer, quadro.byteOffset, quadro.byteLength)
        ));
        return;
      }
      publicarPeso(valor);
    } catch {
      // valor em formato inesperado (protocolo proprietário) — ignora
      // e deixa o operador digitar o peso manualmente.
    }
  }, [publicarPeso]);

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
        filters: [
          { services: [WEIGHT_SCALE_SERVICE] },
          { services: [COIMMA_BLE_SERVICE] },
          { namePrefix: "KM3" },
          { namePrefix: "COIMMA" },
          { namePrefix: "Coimma" },
        ],
        optionalServices: [WEIGHT_SCALE_SERVICE, COIMMA_BLE_SERVICE],
      });
      deviceRef.current = device;
      setDispositivo(device.name || "Balança");

      device.addEventListener("gattserverdisconnected", () => {
        setConectado(false);
      });

      const server = await device.gatt.connect();
      const nome = (device.name || "").toUpperCase();
      const prefereCoimma = nome.includes("KM3") || nome.includes("COIMMA");
      let characteristic;

      async function caracteristicaCoimma() {
        const service = await server.getPrimaryService(COIMMA_BLE_SERVICE);
        protocoloWebRef.current = "coimma-km3";
        return service.getCharacteristic(COIMMA_BLE_CHARACTERISTIC);
      }

      async function caracteristicaPadrao() {
        const service = await server.getPrimaryService(WEIGHT_SCALE_SERVICE);
        protocoloWebRef.current = "bluetooth-sig";
        return service.getCharacteristic(WEIGHT_MEASUREMENT_CHARACTERISTIC);
      }

      try {
        characteristic = prefereCoimma
          ? await caracteristicaCoimma()
          : await caracteristicaPadrao();
      } catch {
        characteristic = prefereCoimma
          ? await caracteristicaPadrao()
          : await caracteristicaCoimma();
      }

      coimmaBufferRef.current = [];
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", handleNotification);
      characteristicRef.current = characteristic;

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
    const identificacao = nome || endereco;
    setDispositivo(identificacao);
    memorizarEstadoBalancaNativa({ dispositivo: identificacao });
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
      memorizarEstadoBalancaNativa({ conectado: false, dispositivo: null });
    }
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    characteristicRef.current?.removeEventListener("characteristicvaluechanged", handleNotification);
    characteristicRef.current = null;
    protocoloWebRef.current = null;
    coimmaBufferRef.current = [];
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
            memorizarEstadoBalancaNativa({
              conectado: true,
              dispositivo: estadoBalancaNativa.dispositivo || data.mensagem || "Balança",
            });
            setDispositivo((atual) => atual || estadoBalancaNativa.dispositivo);
          } else if (data.mensagem?.startsWith("Buscando") || data.mensagem?.startsWith("Conectando")) {
            setErro("");
          } else if (data.mensagem) {
            setConectado(false);
            memorizarEstadoBalancaNativa({ conectado: false });
            setErro(data.mensagem);
          }
        }),
        hw.addListener("bluetoothFrame", (data) => {
          if (!ativo || data.tipo !== "BALANCA" || !data.base64) return;
          try {
            const bytes = base64ParaBytes(data.base64);
            const { peso: valor } = decodificarPeso(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
            setPeso(valor);
            setLeituraId((atual) => atual + 1);
            setConectado(true);
            setConectando(false);
            setErro("");
            memorizarEstadoBalancaNativa({ conectado: true });
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
      characteristicRef.current?.removeEventListener("characteristicvaluechanged", handleNotification);
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    };
  }, [handleNotification]);

  return {
    suportado: nativoDisponivel() || bluetoothDisponivel(),
    conectado,
    conectando,
    peso,
    leituraId,
    dispositivo,
    erro,
    dispositivosEncontrados,
    conectar,
    conectarEm,
    desconectar,
    limparPeso: () => setPeso(null),
  };
}
