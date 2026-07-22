"use client";

import { useState, useEffect, useCallback } from "react";
import { sincronizarTudoPendente, contarPendentesTotal } from "./sync";

export function useConexao(consultorId) {
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [ultimoResultado, setUltimoResultado] = useState(null);

  const atualizarContagemPendentes = useCallback(async () => {
    const total = await contarPendentesTotal();
    setPendentes(total);
  }, []);

  const sincronizar = useCallback(async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const resultado = await sincronizarTudoPendente(consultorId);
      setUltimoResultado(resultado);
      await atualizarContagemPendentes();
      return resultado;
    } finally {
      setSincronizando(false);
    }
  }, [sincronizando, atualizarContagemPendentes, consultorId]);

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

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, sincronizando, pendentes, ultimoResultado, sincronizar, atualizarContagemPendentes };
}
