"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  clearWatchlistIds,
  getWatchlistIds,
  setWatchlistIds,
  subscribeToWatchlist,
  toggleWatchlistId,
} from "@/lib/watchlist-storage";

export function useWatchlist() {
  const [savedIds, setSavedIdsState] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setSavedIdsState(getWatchlistIds());
      setReady(true);
    };

    refresh();
    return subscribeToWatchlist(refresh);
  }, []);

  const savedIdSet = useMemo(() => new Set(savedIds), [savedIds]);

  const replaceSavedIds = useCallback((ids: string[]) => {
    setSavedIdsState(setWatchlistIds(ids));
  }, []);

  const toggleSavedId = useCallback((tokenId: string) => {
    const result = toggleWatchlistId(tokenId);
    setSavedIdsState(result.ids);
    return result.isSaved;
  }, []);

  const clearSavedIds = useCallback(() => {
    setSavedIdsState(clearWatchlistIds());
  }, []);

  return {
    ready,
    savedIds,
    savedIdSet,
    replaceSavedIds,
    toggleSavedId,
    clearSavedIds,
  };
}
