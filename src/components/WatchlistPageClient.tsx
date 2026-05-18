"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Star, Trash2, Upload } from "lucide-react";

import { TokenGrid } from "@/components/TokenGrid";
import type { TokenCardData } from "@/components/TokenCard";
import { useWatchlist } from "@/components/useWatchlist";
import { createWatchlistExport, parseWatchlistImport } from "@/lib/watchlist-storage";
import { trackEvent } from "@/lib/analytics";

interface WatchlistPageClientProps {
  tokens: TokenCardData[];
}

export function WatchlistPageClient({ tokens }: WatchlistPageClientProps) {
  const { ready, savedIds, replaceSavedIds, clearSavedIds } = useWatchlist();
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tokenById = useMemo(() => new Map(tokens.map((token) => [token.id, token])), [tokens]);
  const savedTokens = useMemo(
    () => savedIds.map((id) => tokenById.get(id)).filter((token): token is TokenCardData => Boolean(token)),
    [savedIds, tokenById],
  );
  const missingCount = Math.max(savedIds.length - savedTokens.length, 0);

  const handleExport = () => {
    const exportData = createWatchlistExport(savedIds);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tokenradar-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${exportData.tokenIds.length} saved tokens.`);
    trackEvent("watchlist_export", {
      token_count: exportData.tokenIds.length,
      page_path: window.location.pathname,
    });
  };

  const handleImportText = (text: string) => {
    const importedIds = parseWatchlistImport(text);
    const validIds = importedIds.filter((id) => tokenById.has(id));
    const mergedIds = Array.from(new Set([...savedIds, ...validIds]));

    if (validIds.length === 0) {
      setStatus("No matching TokenRadar token IDs were found in that file.");
      return;
    }

    replaceSavedIds(mergedIds);
    setStatus(`Imported ${validIds.length} tokens. Watchlist now has ${mergedIds.length}.`);
    trackEvent("watchlist_import", {
      imported_count: validIds.length,
      token_count: mergedIds.length,
      page_path: window.location.pathname,
    });
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    handleImportText(await file.text());
  };

  const handleClear = () => {
    clearSavedIds();
    setStatus("Watchlist cleared on this device.");
    trackEvent("watchlist_clear", {
      token_count: savedIds.length,
      page_path: window.location.pathname,
    });
  };

  if (!ready) {
    return (
      <div className="watchlist-empty card">
        <Star size={28} aria-hidden="true" />
        <h2>Loading saved tokens</h2>
      </div>
    );
  }

  return (
    <div className="watchlist-shell">
      <div className="watchlist-toolbar">
        <div>
          <span className="eyebrow-text">Local app storage</span>
          <h2>{savedTokens.length} saved tokens</h2>
          <p>
            This watchlist is private to this browser or installed PWA. Export it before clearing app data or moving devices.
          </p>
        </div>
        <div className="watchlist-actions">
          <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} aria-hidden="true" /> Import
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={savedIds.length === 0}>
            <Download size={16} aria-hidden="true" /> Export
          </button>
          <button type="button" className="btn btn-secondary watchlist-danger" onClick={handleClear} disabled={savedIds.length === 0}>
            <Trash2 size={16} aria-hidden="true" /> Clear
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.txt,.csv" onChange={handleImportFile} hidden />
        </div>
      </div>

      {status && <p className="watchlist-status" role="status" aria-live="polite">{status}</p>}
      {missingCount > 0 && (
        <p className="watchlist-status" role="status" aria-live="polite">
          {missingCount} saved IDs no longer match tracked tokens.
        </p>
      )}

      {savedTokens.length > 0 ? (
        <TokenGrid
          tokens={savedTokens}
          initialVisibleCount={12}
          searchPlaceholder="Search your saved tokens..."
        />
      ) : (
        <div className="watchlist-empty card">
          <Star size={32} aria-hidden="true" />
          <h2>No saved tokens yet</h2>
          <p>Use the star on token cards or token pages to build a local research list on this device.</p>
          <Link href="/tokens" className="btn btn-primary">
            Browse Tokens
          </Link>
        </div>
      )}
    </div>
  );
}
