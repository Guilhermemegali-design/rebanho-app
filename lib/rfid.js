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

// O RS420, nesse bastão específico, envia tudo grudado num único bloco
// de dígitos sem separador: cabeçalho (tamanho variável) + EID ISO de 15
// dígitos (país com 3 + identificação nacional com 12) + data/hora de 12
// dígitos (AAMMDDHHMMSS, provavelmente um relógio interno sem hora certa
// — não é usada aqui, só precisa ser descartada). Confirmado com uma
// captura real do texto bruto:
//   "1000000" + "999000000008651" + "201228235435"
//    cabeçalho     EID (bate com     data/hora
//    (7 dígitos)    o visor do          (12 dígitos)
//                   bastão)
// Por isso a EID é sempre lida ancorando a partir do FINAL do bloco
// (tamanho total menos os 12 dígitos de data/hora, pegando os 15
// dígitos anteriores a isso) — assim o tamanho do cabeçalho não importa.
// Duas tentativas anteriores erraram por ancorar do início ou por um
// deslocamento fixo a partir do final que não batia com esse formato.
//
// A EID de 15 dígitos é devolvida completa (igual ao visor do bastão),
// não reduzida aos últimos 8 — quem precisa comparar contra brincos já
// cadastrados com o formato antigo (só os últimos 8 dígitos) usa
// `normalizarTagParaComparacao`, não este retorno diretamente.
export function extrairTagRfid(texto) {
  const limpo = texto.replace(/[\x00-\x1f\x7f]/g, " ").trim();
  if (!limpo) return "";

  const blocos = limpo.match(/\d+/g) || [];

  if (blocos.length === 1 && blocos[0].length >= 27) {
    return blocos[0].slice(-27, -12);
  }

  const blocoComEid = blocos.find((item) => item.length === 15);
  if (blocoComEid) return blocoComEid;

  // Formato ISO Decimal 2 usado pelo RS420: código de país/fabricante
  // com 3 dígitos + identificação nacional com 12 dígitos, em blocos
  // separados por espaço/traço. O frame pode conter outros campos
  // antes/depois (tipo de registro, data e hora), que não pertencem ao
  // brinco.
  for (let i = 0; i < blocos.length - 1; i++) {
    if (blocos[i].length === 3 && blocos[i + 1].length === 12) {
      return blocos[i] + blocos[i + 1];
    }
  }

  const gruposNumericos = limpo.match(/\d(?:[.:-]*\d){3,}/g) || [];
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
        const bruto = bufferRef.current;
        const tag = extrairTagRfid(bruto);
        bufferRef.current = "";
        setLendo(false);
        if (tag.length >= TAMANHO_MINIMO_TAG && decorrido <= INTERVALO_MAXIMO_MS) {
          onScan(tag, bruto);
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
      if (tag) onScan(tag, texto);
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

// Reduz uma tag (EID completa de 15 dígitos ou já só os últimos 8) aos
// últimos 8 dígitos, pra comparar leituras novas (EID completa) com
// brincos cadastrados antes desta correção (só os últimos 8 dígitos).
export function normalizarTagParaComparacao(valor) {
  return ultimosOitoDigitos(valor || "");
}

// Fazendas que usam brinco visual E bastão RFID têm dois números
// diferentes por animal — a busca por uma tag lida aceita bater com
// qualquer um dos dois, pra funcionar também em fazendas que só usam um.
export function encontrarAnimalPorTag(animais, tag) {
  const alvo = tag.trim().toLowerCase();
  const alvoNormalizado = normalizarTagParaComparacao(tag).toLowerCase();
  return animais.find(
    (a) => {
      const rfid = (a.brinco_rfid || "").trim().toLowerCase();
      const rfidNormalizado = rfid ? normalizarTagParaComparacao(rfid).toLowerCase() : "";
      return rfid === alvo ||
        (alvoNormalizado && rfidNormalizado === alvoNormalizado) ||
        a.brinco_atual.toLowerCase() === alvo;
    }
  );
}
