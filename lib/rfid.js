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

const INTERVALO_MAXIMO_MS = 60;
const TAMANHO_MINIMO_TAG = 4;

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
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ativo, onScan]);

  return { lendo };
}
