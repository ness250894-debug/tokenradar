"use client";

import { useEffect } from "react";

function canRegisterServiceWorker(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (!("serviceWorker" in navigator)) return false;

  const { hostname, protocol } = window.location;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

export function PwaServiceWorker() {
  useEffect(() => {
    if (!canRegisterServiceWorker()) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The app remains fully usable if service worker registration fails.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
