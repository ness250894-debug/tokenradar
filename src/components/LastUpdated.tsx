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
  const formatted = format(new Date(date), "MMM d, yyyy 'at' HH:mm 'UTC'");

  return (
    <time className="last-updated" dateTime={new Date(date).toISOString()}>
      <span aria-hidden="true">⟳</span> Last updated: {formatted}
    </time>
  );
}
