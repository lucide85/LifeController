"use client";

import { useEffect } from "react";

// Registers the minimal service worker (public/sw.js) so the app is installable as a
// PWA — the prerequisite for the Web Share Target ("Share → LifeController"). The SW
// does no caching, so registration is transparent. Best-effort: failures are ignored.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
