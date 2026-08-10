import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TOPIC_CLUSTERS, type TopicClusterId } from "@/lib/topic-clusters";

interface TopicClusterLinksProps {
  current?: TopicClusterId;
  title?: string;
  description?: string;
}

export function TopicClusterLinks({
  current,
  title = "Explore TokenRadar research topics",
  description = "Move between connected guides, data tools, and methodology pages without starting a new search.",
}: TopicClusterLinksProps) {
  const clusters = current
    ? TOPIC_CLUSTERS.toSorted((a, b) => Number(b.id === current) - Number(a.id === current))
    : TOPIC_CLUSTERS;

  return (
    <section className="section topic-cluster-section" aria-labelledby="topic-cluster-title">
      <div className="section-header topic-cluster-header">
        <p className="eyebrow-text">Research topic map</p>
        <h2 id="topic-cluster-title">{title}</h2>
        <p>{description}</p>
      </div>
      <div className="topic-cluster-grid">
        {clusters.map((cluster) => (
          <article
            className={`card topic-cluster-card${cluster.id === current ? " topic-cluster-card-current" : ""}`}
            key={cluster.id}
          >
            <div>
              <span className="topic-cluster-label">
                {cluster.id === current ? "Current topic" : "Research cluster"}
              </span>
              <h3>
                <Link href={cluster.hub.href}>{cluster.title}</Link>
              </h3>
              <p>{cluster.description}</p>
            </div>
            <ul>
              {cluster.supportingLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
            <Link className="topic-cluster-hub-link" href={cluster.hub.href}>
              {cluster.hub.label}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
