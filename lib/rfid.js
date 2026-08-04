"use client";

// ============================================================
// LEITOR RFID (bastão Animal Tag / Allflex / Tru-Test em modo
// teclado Bluetooth)
//
// Esses bastões, depois de pareados uma vez nas configurações de
// Bluetooth do celular/notebook (fora deste app), funcionam como um
// teclado: ao ler um brinco, "digitam" o número seguido de Enter em
// qualquer lugar da tela — não existe nenhuma API especial pra isso,
// funciona igual em Android, iPhone, Windows e Mac.
//
// Esse hook escuta o teclado da página inteira (não precisa ter um
// campo de texto focado) e diferencia uma leitura do bastão de
// alguém digitando à mão: o bastão "digita" muito mais rápido que
// uma pessoa (menos de ~60ms entre teclas). Se o ritmo for mais
// lento, ou não terminar em Enter, o buffer é descartado — assim
// digitação manual em qualquer campo da tela não é confundida com
// uma leitura.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { base64ParaBytes, nativoDisponivel, rebanhoHardware } from "./capacitorNativo";

const INTERVALO_MAXIMO_MS = 60;
const TAMANHO_MINIMO_TAG = 4;

// O RS420 envia a identificação pela porta serial em ASCII. Dependendo
// da configuração do bastão, o número pode vir puro ou separado em
// grupos (ex.: código do país + número do animal).
export function extrairTagRfid(texto) {
  const limpo = texto.replace(/[\x00-\x1f\x7f]/g, " ").trim();
  if (!limpo) return "";

  const gruposNumericos = limpo.match(/\d(?:[\s.:-]*\d){3,}/g) || [];
  const numeros = gruposNumericos
    .map((item) => item.replace(/\D/g, ""))
    .filter((item) => item.length >= TAMANHO_MINIMO_TAG)
    .sort((a, b) => b.length - a.length);
  if (numeros[0]) return numeros[0];

  const alfanumericos = limpo.match(/[A-Za-z0-9]{4,}/g) || [];
  return alfanumericos.sort((a, b) => b.length - a.length)[0] || "";
}

export function useRfidScanner(onScan, { ativo = true } = {}) {
  const bufferRef = useRef("");
  const ultimoTempoRef = useRef(0);
  const [lendo, setLendo] = useState(false);

  useEffect(() => {
    if (!ativo) return;

    function handleKeyDown(e) {
      const agora = Date.now();
      const decorrido = agora - ultimoTempoRef.current;
      ultimoTempoRef.current = agora;

      // Tecla normal (letra/número) faz parte de uma leitura em
      // andamento, digitada rápido demais pra ser humana.
      if (e.key.length === 1) {
        if (decorrido > INTERVALO_MAXIMO_MS) {
          // Muito lento pra ser o bastão — provavelmente digitação
          // manual em algum campo da tela. Reinicia o buffer aqui,
          // considerando essa tecla como o possível início de uma
          // nova leitura.
          bufferRef.current = e.key;
        } else {
          bufferRef.current += e.key;
        }
        setLendo(bufferRef.current.length > 0);
        return;
      }

      if (e.key === "Enter") {
        const tag = bufferRef.current.trim();
        bufferRef.current = "";
        setLendo(false);
        if (tag.length >= TAMANHO_MINIMO_TAG && decorrido <= INTERVALO_MAXIMO_MS) {
          onScan(tag);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    let ativoNativo = true;
    let listenerNativo = null;
    let bufferNativo = "";
    let temporizadorNativo = null;

    function entregarBufferNativo() {
      const tag = extrairTagRfid(bufferNativo);
      bufferNativo = "";
      setLendo(false);
      if (tag) onScan(tag);
    }

    if (nativoDisponivel()) {
      rebanhoHardware()
        ?.addListener("bluetoothFrame", (data) => {
          if (!ativoNativo || data.tipo !== "BASTAO" || !data.base64) return;
          const texto = new TextDecoder("iso-8859-1").decode(base64ParaBytes(data.base64));
          bufferNativo += texto;
          setLendo(true);

          if (temporizadorNativo) clearTimeout(temporizadorNativo);
          if (/[\r\n\x03]/.test(bufferNativo)) entregarBufferNativo();
          else temporizadorNativo = setTimeout(entregarBufferNativo, 180);
        })
        .then((handle) => {
          if (ativoNativo) listenerNativo = handle;
          else handle.remove();
        });
    }

    return () => {
      ativoNativo = false;
      document.removeEventListener("keydown", handleKeyDown);
      if (temporizadorNativo) clearTimeout(temporizadorNativo);
      listenerNativo?.remove();
    };
  }, [ativo, onScan]);

  return { lendo };
}

// Fazendas que usam brinco visual E bastão RFID têm dois números
// diferentes por animal — a busca por uma tag lida aceita bater com
// qualquer um dos dois, pra funcionar também em fazendas que só usam um.
export function encontrarAnimalPorTag(animais, tag) {
  const alvo = tag.trim().toLowerCase();
  return animais.find(
    (a) => (a.brinco_rfid && a.brinco_rfid.toLowerCase() === alvo) || a.brinco_atual.toLowerCase() === alvo
  );
}
