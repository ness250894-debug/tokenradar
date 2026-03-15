import { format } from "date-fns";

interface LastUpdatedProps {
  /** ISO date string or Date object */
  date: string | Date;
}

/**
 * Displays a "Last Updated" timestamp in monospace font.
 * Used on article pages to show data freshness for E-E-A-T signals.
 */
export function LastUpdated({ date }: LastUpdatedProps) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const formatted = format(d, "MMM d, yyyy 'at' HH:mm 'UTC'");

  return (
    <time className="last-updated" dateTime={d.toISOString()}>
      <span aria-hidden="true">⟳</span> Last updated: {formatted}
    </time>
  );
}
