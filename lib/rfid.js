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

function ultimosOitoDigitos(valor) {
  const numeros = valor.replace(/\D/g, "");
  return numeros.length >= 8 ? numeros.slice(-8) : numeros;
}

// O RS420 envia a identificação pela porta serial/teclado em ASCII.
// Dependendo da configuração do bastão, o número pode vir puro, separado
// em grupos (ex.: código do país + número do animal) ou com dígitos
// extras grudados depois (contador de leitura, sufixo de frame etc. —
// variam e não pertencem ao brinco). Por isso a EID ISO de 15 dígitos
// (país com 3 + identificação nacional com 12) é sempre lida a partir do
// INÍCIO do bloco, nunca do final: um caso real (bastão configurado sem
// separador) mostrou "999000000008651" + sufixo "2012" grudados em um
// único bloco de 19 dígitos — pegar os últimos 8 dígitos do bloco
// inteiro devolvia "86512012" (parte do brinco + parte do sufixo) em vez
// do brinco correto.
export function extrairTagRfid(texto) {
  const limpo = texto.replace(/[\x00-\x1f\x7f]/g, " ").trim();
  if (!limpo) return "";

  const blocos = limpo.match(/\d+/g) || [];

  const blocoComEid = blocos.find((item) => item.length >= 15);
  if (blocoComEid) return ultimosOitoDigitos(blocoComEid.slice(0, 15));

  // Formato ISO Decimal 2 usado pelo RS420: código de país/fabricante
  // com 3 dígitos + identificação nacional com 12 dígitos, em blocos
  // separados por espaço/traço. O frame pode conter outros campos
  // antes/depois (tipo de registro, data e hora), que não pertencem ao
  // brinco.
  for (let i = 0; i < blocos.length - 1; i++) {
    if (blocos[i].length === 3 && blocos[i + 1].length === 12) {
      return ultimosOitoDigitos(blocos[i + 1]);
    }
  }

  const gruposNumericos = limpo.match(/\d(?:[.:-]*\d){3,}/g) || [];
  const numeros = gruposNumericos
    .map((item) => item.replace(/\D/g, ""))
    .filter((item) => item.length >= TAMANHO_MINIMO_TAG)
    .sort((a, b) => b.length - a.length);
  if (numeros[0]) return ultimosOitoDigitos(numeros[0]);

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
        const tag = extrairTagRfid(bufferRef.current);
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

    function entregarTextoNativo(texto) {
      const tag = extrairTagRfid(texto);
      setLendo(false);
      if (tag) onScan(tag);
    }

    function entregarRestoNativo() {
      const restante = bufferNativo;
      bufferNativo = "";
      entregarTextoNativo(restante);
    }

    if (nativoDisponivel()) {
      rebanhoHardware()
        ?.addListener("bluetoothFrame", (data) => {
          if (!ativoNativo || data.tipo !== "BASTAO" || !data.base64) return;
          const texto = new TextDecoder("iso-8859-1").decode(base64ParaBytes(data.base64));
          bufferNativo += texto;
          setLendo(true);

          if (temporizadorNativo) clearTimeout(temporizadorNativo);
          if (/[\r\n\x03]/.test(bufferNativo)) {
            const partes = bufferNativo.split(/[\r\n\x03]+/);
            bufferNativo = partes.pop() || "";
            partes.filter((parte) => parte.trim()).forEach(entregarTextoNativo);
          }
          if (bufferNativo) temporizadorNativo = setTimeout(entregarRestoNativo, 250);
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
  const alvoNormalizado = extrairTagRfid(tag).toLowerCase();
  return animais.find(
    (a) => {
      const rfid = (a.brinco_rfid || "").trim().toLowerCase();
      const rfidNormalizado = rfid ? extrairTagRfid(rfid).toLowerCase() : "";
      return rfid === alvo ||
        (alvoNormalizado && rfidNormalizado === alvoNormalizado) ||
        a.brinco_atual.toLowerCase() === alvo;
    }
  );
}
