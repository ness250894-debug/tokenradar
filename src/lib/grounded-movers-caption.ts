import { formatPercent, formatPrice } from "./formatters";

export interface GroundedMoverFact {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
}

function formatSnapshotTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid market snapshot timestamp is required.");
  return date.toISOString().slice(11, 16);
}

/**
 * Deterministic movers copy that can only describe facts present in its input.
 * It intentionally avoids claims about flows, institutions, order books, or
 * other market data that the movers feed does not provide.
 */
export function buildGroundedMoversCaption(
  movers: GroundedMoverFact[],
  snapshotAt: string | Date,
  source: string,
): string {
  if (movers.length === 0) throw new Error("At least one mover is required.");
  const sourceLabel = source.trim();
  if (!sourceLabel) throw new Error("A market data source is required.");
  const leader = movers[0];
  const shelf = movers
    .map((mover) => `${mover.symbol.toUpperCase()} ${formatPercent(mover.change24h)}`)
    .join(" · ");

  return [
    "<b>Radar Movers Snapshot</b>",
    `Leader: ${leader.name} (${leader.symbol.toUpperCase()}) is ${formatPercent(leader.change24h)} over 24h at ${formatPrice(leader.price)}.`,
    `Displayed shelf: ${shelf}.`,
    "Data limit: this snapshot contains price movement only; it does not establish order-book depth, flows, or investor participation.",
    "<tg-spoiler>Research read: compare the separate liquidity, market-cap, and risk data before interpreting the move.</tg-spoiler>",
    `Source: ${sourceLabel} snapshot, ${formatSnapshotTime(snapshotAt)} UTC.`,
  ].join("\n");
}
