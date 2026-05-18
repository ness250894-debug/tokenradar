"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";

import { TokenIcon } from "@/components/TokenIcon";
import {
  selectBinanceLiveMovers,
  type BinanceLiveMover,
  type BinanceMiniTicker,
  type BinanceTokenReference,
} from "@/lib/binance-live-movers";
import { formatCompact, formatPercent, formatPrice } from "@/lib/formatters";

interface BinanceLiveMoversProps {
  tokens: readonly BinanceTokenReference[];
}

type StreamStatus = "connecting" | "live" | "reconnecting" | "error";

const STREAM_URLS = [
  "wss://data-stream.binance.vision/ws/!miniTicker@arr",
  "wss://stream.binance.com:9443/ws/!miniTicker@arr",
];
const RECONNECT_DELAY_MS = 5000;
const MIN_QUOTE_VOLUME_USD = 100_000;

function isMiniTicker(value: unknown): value is BinanceMiniTicker {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BinanceMiniTicker>;
  return (
    typeof candidate.s === "string" &&
    typeof candidate.c === "string" &&
    typeof candidate.o === "string" &&
    typeof candidate.q === "string"
  );
}

function parseMiniTickerPayload(data: string): BinanceMiniTicker[] {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isMiniTicker);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown }).data)) {
      return ((parsed as { data: unknown[] }).data).filter(isMiniTicker);
    }
  } catch {
    return [];
  }

  return [];
}

function MoverRow({ mover, tone }: { mover: BinanceLiveMover; tone: "up" | "down" }) {
  const content = (
    <>
      <span className="binance-mover-rank">{tone === "up" ? "+" : "-"}</span>
      <TokenIcon
        symbol={mover.baseSymbol}
        name={mover.tokenName || mover.baseSymbol}
        id={mover.tokenId}
        imageUrl={mover.tokenImageUrl}
        size={20}
        className="binance-mover-icon"
      />
      <span className="binance-mover-token-copy">
        <strong>{mover.baseSymbol}</strong>
        <small>{mover.tokenName || "Spot market"}</small>
      </span>
      <span className="binance-mover-price">{formatPrice(mover.price)}</span>
      <span className={`binance-mover-change ${tone === "up" ? "price-up" : "price-down"}`}>
        {formatPercent(mover.change24h)}
      </span>
      <span className="binance-mover-volume">{formatCompact(mover.quoteVolume)}</span>
    </>
  );

  if (mover.tokenId) {
    return (
      <Link href={`/${mover.tokenId}`} className="binance-mover-row">
        {content}
      </Link>
    );
  }

  return <div className="binance-mover-row">{content}</div>;
}

function EmptyRows({ label }: { label: string }) {
  return (
    <div className="binance-mover-empty">
      <Activity size={16} />
      <span>{label}</span>
    </div>
  );
}

function StatusDot({ isLive }: { isLive: boolean }) {
  return (
    <span
      className={`binance-live-dot ${isLive ? "is-live" : "is-offline"}`}
      aria-label={isLive ? "Live market stream connected" : "Live market stream disconnected"}
      role="img"
    />
  );
}

export function BinanceLiveMovers({ tokens }: BinanceLiveMoversProps) {
  const [tickerMap, setTickerMap] = useState<Map<string, BinanceMiniTicker>>(() => new Map());
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIndexRef = useRef(0);

  useEffect(() => {
    let stopped = false;

    const clearReconnectTimer = () => {
      if (!reconnectTimerRef.current) return;
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    };

    const connect = () => {
      clearReconnectTimer();
      if (stopped) return;

      const url = STREAM_URLS[streamIndexRef.current % STREAM_URLS.length];
      setStatus((current) => (current === "live" ? "reconnecting" : current));

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!stopped) setStatus("live");
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const nextTickers = parseMiniTickerPayload(event.data);
        if (nextTickers.length === 0) return;

        setTickerMap((current) => {
          const next = new Map(current);
          for (const ticker of nextTickers) {
            next.set(ticker.s.toUpperCase(), ticker);
          }
          return next;
        });
      };

      socket.onerror = () => {
        if (!stopped) setStatus("error");
      };

      socket.onclose = () => {
        if (stopped) return;
        streamIndexRef.current += 1;
        setStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const tickers = useMemo(() => Array.from(tickerMap.values()), [tickerMap]);
  const movers = useMemo(
    () => selectBinanceLiveMovers(tickers, tokens, { minQuoteVolume: MIN_QUOTE_VOLUME_USD }),
    [tickers, tokens],
  );
  const hasRows = movers.gainers.length > 0 || movers.losers.length > 0;
  const isLive = status === "live";

  return (
    <div className="binance-live-rails" id="live-movers" aria-label="Live spot market movers">
      <section className="binance-live-rail binance-live-rail-left" aria-label="Top market gainers">
        <div className="binance-live-rail-heading">
          <StatusDot isLive={isLive} />
          <TrendingUp size={15} aria-hidden="true" />
          <span>Top Gainers</span>
        </div>
        <div className="binance-mover-list">
          {movers.gainers.length > 0 ? (
            movers.gainers.map((mover) => <MoverRow key={mover.pairSymbol} mover={mover} tone="up" />)
          ) : (
            <EmptyRows label={hasRows ? "No gainers in range" : "Waiting for live ticks"} />
          )}
        </div>
      </section>

      <section className="binance-live-rail binance-live-rail-right" aria-label="Top market losers">
        <div className="binance-live-rail-heading">
          <StatusDot isLive={isLive} />
          <TrendingDown size={15} aria-hidden="true" />
          <span>Top Losers</span>
        </div>
        <div className="binance-mover-list">
          {movers.losers.length > 0 ? (
            movers.losers.map((mover) => <MoverRow key={mover.pairSymbol} mover={mover} tone="down" />)
          ) : (
            <EmptyRows label={hasRows ? "No losers in range" : "Waiting for live ticks"} />
          )}
        </div>
      </section>
    </div>
  );
}
