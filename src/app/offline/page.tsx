import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  description: "TokenRadar offline fallback.",
  alternates: {
    canonical: "/offline",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="card" style={{ padding: "var(--space-2xl)" }}>
          <p className="eyebrow">Offline Mode</p>
          <h1 style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>
            TokenRadar is offline
          </h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
            Cached token research, your local watchlist shell, and opened launch pages remain available after they have been saved or opened once.
          </p>
          <Link href="/" className="btn btn-primary">
            Back to overview
          </Link>
        </div>
      </div>
    </section>
  );
}
