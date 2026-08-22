import type { Metadata } from "next";

import { LocalAnalyticsInspector } from "@/components/LocalAnalyticsInspector";

export const metadata: Metadata = {
  title: "Local Analytics Buffer",
  description: "Device-local TokenRadar interaction events for QA.",
  alternates: {
    canonical: "/analytics/local",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function LocalAnalyticsPage() {
  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <section className="section">
        <div className="section-header">
          <p className="eyebrow-text">QA</p>
          <h1>
            Local <span className="gradient-text">Analytics</span> Buffer
          </h1>
          <p>Recent click and Research Intent events stored in this browser.</p>
        </div>

        <LocalAnalyticsInspector />
      </section>
    </main>
  );
}
