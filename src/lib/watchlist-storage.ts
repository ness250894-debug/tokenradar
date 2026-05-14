export const WATCHLIST_STORAGE_KEY = "tokenradar.watchlist.v1";
export const WATCHLIST_UPDATED_EVENT = "tokenradar-watchlist-updated";

export interface WatchlistExport {
  source: "tokenradar";
  version: 1;
  exportedAt: string;
  tokenIds: string[];
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function normalizeWatchlistId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,96}$/.test(normalized)) return null;
  return normalized;
}

export function normalizeWatchlistIds(ids: unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const id of ids) {
    const tokenId = normalizeWatchlistId(id);
    if (!tokenId || seen.has(tokenId)) continue;
    seen.add(tokenId);
    normalized.push(tokenId);
  }

  return normalized;
}

export function parseWatchlistIds(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return normalizeWatchlistIds(parsed);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tokenIds?: unknown }).tokenIds)) {
      return normalizeWatchlistIds((parsed as { tokenIds: unknown[] }).tokenIds);
    }
  } catch {
    return [];
  }

  return [];
}

export function getWatchlistIds(): string[] {
  if (!canUseLocalStorage()) return [];
  return parseWatchlistIds(window.localStorage.getItem(WATCHLIST_STORAGE_KEY));
}

export function setWatchlistIds(ids: string[]): string[] {
  const normalized = normalizeWatchlistIds(ids);

  if (canUseLocalStorage()) {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(WATCHLIST_UPDATED_EVENT, { detail: { tokenIds: normalized } }));
  }

  return normalized;
}

export function toggleWatchlistId(tokenId: string): { ids: string[]; isSaved: boolean } {
  const normalized = normalizeWatchlistId(tokenId);
  if (!normalized) return { ids: getWatchlistIds(), isSaved: false };

  const current = getWatchlistIds();
  const next = current.includes(normalized)
    ? current.filter((id) => id !== normalized)
    : [normalized, ...current];

  return { ids: setWatchlistIds(next), isSaved: !current.includes(normalized) };
}

export function clearWatchlistIds(): string[] {
  return setWatchlistIds([]);
}

export function subscribeToWatchlist(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === WATCHLIST_STORAGE_KEY) callback();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(WATCHLIST_UPDATED_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(WATCHLIST_UPDATED_EVENT, callback);
  };
}

export function createWatchlistExport(tokenIds: string[]): WatchlistExport {
  return {
    source: "tokenradar",
    version: 1,
    exportedAt: new Date().toISOString(),
    tokenIds: normalizeWatchlistIds(tokenIds),
  };
}

export function parseWatchlistImport(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return normalizeWatchlistIds(parsed);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tokenIds?: unknown }).tokenIds)) {
      return normalizeWatchlistIds((parsed as { tokenIds: unknown[] }).tokenIds);
    }
  } catch {
    // Fall through to CSV/newline parsing.
  }

  return normalizeWatchlistIds(trimmed.split(/[\s,;]+/));
}
