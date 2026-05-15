"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Trash2 } from "lucide-react";

import {
  clearLocalAnalyticsEvents,
  getLocalAnalyticsEvents,
  type LocalAnalyticsEvent,
} from "@/lib/analytics";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatParams(params: LocalAnalyticsEvent["params"]): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (!entries.length) return "No params";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}

export function LocalAnalyticsInspector() {
  const [events, setEvents] = useState<LocalAnalyticsEvent[]>([]);

  const refreshEvents = useCallback(() => {
    setEvents(getLocalAnalyticsEvents());
  }, []);

  useEffect(() => {
    const initialRefreshId = window.setTimeout(refreshEvents, 0);
    window.addEventListener("tokenradar:analytics", refreshEvents);
    window.addEventListener("storage", refreshEvents);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.removeEventListener("tokenradar:analytics", refreshEvents);
      window.removeEventListener("storage", refreshEvents);
    };
  }, [refreshEvents]);

  const topEvents = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((event) => counts.set(event.eventName, (counts.get(event.eventName) || 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
  }, [events]);

  const handleClear = () => {
    clearLocalAnalyticsEvents();
    setEvents([]);
  };

  return (
    <div className="local-analytics-layout">
      <section className="card local-analytics-summary">
        <div>
          <p className="eyebrow-text">Device Buffer</p>
          <h2>{events.length} stored events</h2>
        </div>
        <div className="local-analytics-actions">
          <button type="button" className="btn btn-secondary" onClick={refreshEvents} aria-label="Refresh analytics events">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleClear} aria-label="Clear analytics events">
            <Trash2 size={16} />
          </button>
        </div>
      </section>

      <section className="local-analytics-grid" aria-label="Local analytics event counts">
        {topEvents.length ? (
          topEvents.map(([eventName, count]) => (
            <div className="card local-analytics-count" key={eventName}>
              <Activity size={18} />
              <span>{eventName}</span>
              <strong>{count}</strong>
            </div>
          ))
        ) : (
          <div className="card local-analytics-empty">No local events yet.</div>
        )}
      </section>

      <section className="card local-analytics-table-card">
        <div className="local-analytics-table-head">
          <span>Event</span>
          <span>Time</span>
          <span>Page</span>
          <span>Params</span>
        </div>
        <div className="local-analytics-table">
          {events.slice(0, 50).map((event, index) => (
            <div className="local-analytics-row" key={`${event.eventName}-${event.occurredAt}-${index}`}>
              <strong>{event.eventName}</strong>
              <span>{formatTimestamp(event.occurredAt)}</span>
              <span>{event.pagePath || "/"}</span>
              <small>{formatParams(event.params)}</small>
            </div>
          ))}
          {!events.length && (
            <div className="local-analytics-row local-analytics-row-empty">
              <strong>No events captured</strong>
              <span>-</span>
              <span>-</span>
              <small>Interact with the site, then refresh this page.</small>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
