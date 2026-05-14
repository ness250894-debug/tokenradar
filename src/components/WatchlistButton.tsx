"use client";

import { Star } from "lucide-react";

import { trackEvent } from "@/lib/analytics";
import { useWatchlist } from "@/components/useWatchlist";

interface WatchlistButtonProps {
  tokenId: string;
  tokenName?: string;
  variant?: "icon" | "button";
  className?: string;
}

export function WatchlistButton({
  tokenId,
  tokenName,
  variant = "icon",
  className = "",
}: WatchlistButtonProps) {
  const { ready, savedIdSet, toggleSavedId } = useWatchlist();
  const isSaved = savedIdSet.has(tokenId);
  const label = `${isSaved ? "Remove" : "Save"} ${tokenName || tokenId} ${isSaved ? "from" : "to"} watchlist`;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const nextSaved = toggleSavedId(tokenId);
    trackEvent(nextSaved ? "watchlist_save" : "watchlist_remove", {
      token_id: tokenId,
      token_name: tokenName,
      page_path: window.location.pathname,
    });
  };

  return (
    <button
      type="button"
      className={`watchlist-toggle watchlist-toggle-${variant} ${isSaved ? "active" : ""} ${className}`}
      aria-label={label}
      aria-pressed={isSaved}
      disabled={!ready}
      onClick={handleClick}
      title={label}
    >
      <Star size={variant === "button" ? 17 : 16} aria-hidden="true" fill="currentColor" />
      {variant === "button" && <span>{isSaved ? "Saved" : "Save"}</span>}
    </button>
  );
}
