"use client";
import { useEffect } from "react";

/** Registra o Service Worker do Agendou (necessário para push no iOS PWA e demais aparelhos). */
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
