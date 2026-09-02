"use client";

import { useEffect } from "react";

export default function RegistroServiceWorker() {
  useEffect(() => {
    // Pede ao navegador para não remover o IndexedDB em limpezas
    // automáticas por falta de espaço. O pedido pode ser recusado, mas
    // quando aceito aumenta a durabilidade dos dados ainda não enviados.
    navigator.storage?.persist?.().catch(() => {});

    if ("serviceWorker" in navigator) {
      let mudouControlador = false;
      const liberarProximaAtualizacao = window.setTimeout(
        () => sessionStorage.removeItem("rastro-sw-recarregado"),
        5000
      );
      const aoMudarControlador = () => {
        if (mudouControlador || sessionStorage.getItem("rastro-sw-recarregado") === "1") return;
        mudouControlador = true;
        sessionStorage.setItem("rastro-sw-recarregado", "1");
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener("controllerchange", aoMudarControlador);
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registro) => registro.update())
        .catch((err) => {
          console.error("Erro ao registrar Service Worker:", err);
        });

      return () => {
        window.clearTimeout(liberarProximaAtualizacao);
        navigator.serviceWorker.removeEventListener("controllerchange", aoMudarControlador);
      };
    }
  }, []);

  return null;
}
