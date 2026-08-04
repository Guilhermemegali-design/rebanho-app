"use client";

// ============================================================
// Ponte com o plugin nativo RebanhoHardware (android/app/src/main/java/
// br/com/rastro/rebanho/RebanhoHardwarePlugin.kt), usado só quando o app
// roda dentro do wrapper Android (Capacitor) — no navegador comum,
// nativoDisponivel() retorna false e todo o resto do app continua
// funcionando exatamente como antes (Web Bluetooth / teclado HID).
// ============================================================

import { Capacitor, registerPlugin } from "@capacitor/core";

export function nativoDisponivel() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

let pluginRef = null;

export function rebanhoHardware() {
  if (!nativoDisponivel()) return null;
  if (!pluginRef) {
    pluginRef = registerPlugin("RebanhoHardware");
  }
  return pluginRef;
}

// Decodifica os bytes (base64) recebidos do plugin nativo.
export function base64ParaBytes(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
