"use client";

import { useEffect } from "react";

import { getWatchlistIds, subscribeToWatchlist } from "@/lib/watchlist-storage";

function postWatchlistToServiceWorker(tokenIds: string[]) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => {
      const worker = registration.active || navigator.serviceWorker.controller;
      worker?.postMessage({
        type: "TOKENRADAR_CACHE_WATCHLIST",
        tokenIds,
      });
    })
    .catch(() => {
      // Offline sync is an enhancement; failing silently keeps normal browsing unaffected.
    });
}

export function WatchlistOfflineSync() {
  useEffect(() => {
    const sync = () => postWatchlistToServiceWorker(getWatchlistIds());
    sync();
    return subscribeToWatchlist(sync);
  }, []);

  return null;
}
