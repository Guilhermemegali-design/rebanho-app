"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { sincronizarTudoPendente, contarPendentesTotal } from "./sync";

export function useConexao(consultorId) {
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const sincronizandoRef = useRef(false);

  const atualizarContagemPendentes = useCallback(async () => {
    const total = await contarPendentesTotal();
    setPendentes(total);
  }, []);

  const sincronizar = useCallback(async () => {
    if (sincronizandoRef.current || !navigator.onLine) return;
    sincronizandoRef.current = true;
    setSincronizando(true);
    try {
      const resultado = await sincronizarTudoPendente(consultorId);
      setUltimoResultado(resultado);
      await atualizarContagemPendentes();
      return resultado;
    } finally {
      sincronizandoRef.current = false;
      setSincronizando(false);
    }
  }, [atualizarContagemPendentes, consultorId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    atualizarContagemPendentes();

    function handleOnline() {
      setOnline(true);
      sincronizar();
    }
    function handleOffline() {
      setOnline(false);
    }
    function handleMudancaPendentes() {
      atualizarContagemPendentes();
      if (navigator.onLine) sincronizar();
    }
    function handleVisibilidade() {
      if (document.visibilityState === "visible") {
        setOnline(navigator.onLine);
        atualizarContagemPendentes();
        if (navigator.onLine) sincronizar();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("rastro-pendentes-alterados", handleMudancaPendentes);
    document.addEventListener("visibilitychange", handleVisibilidade);
    const intervalo = window.setInterval(() => {
      if (navigator.onLine) sincronizar();
    }, 30000);
    if (navigator.onLine) sincronizar();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("rastro-pendentes-alterados", handleMudancaPendentes);
      document.removeEventListener("visibilitychange", handleVisibilidade);
      window.clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, sincronizando, pendentes, ultimoResultado, sincronizar, atualizarContagemPendentes };
}
