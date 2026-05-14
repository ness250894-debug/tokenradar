"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Activity,
  ArrowRight,
  BarChart2,
  BookOpen,
  Calculator,
  Lock,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

import {
  type EngagementContext,
  trackNextActionClick,
  trackRecirculationClick,
  trackRecirculationImpression,
} from "@/lib/engagement-analytics";

export type RecirculationItemType =
  | "overview"
  | "prediction"
  | "buy"
  | "wallet"
  | "tax"
  | "learn"
  | "category"
  | "related"
  | "launch";

export interface RecirculationItem {
  href: string;
  label: string;
  description: string;
  type: RecirculationItemType;
}

interface ResearchRecirculationProps extends EngagementContext {
  title: string;
  description?: string;
  items: RecirculationItem[];
  variant?: "default" | "compact" | "strip";
}

function ItemIcon({ type }: { type: RecirculationItemType }) {
  if (type === "prediction") return <TrendingUp size={18} aria-hidden="true" />;
  if (type === "buy") return <ShoppingCart size={18} aria-hidden="true" />;
  if (type === "wallet") return <ShieldCheck size={18} aria-hidden="true" />;
  if (type === "tax") return <Calculator size={18} aria-hidden="true" />;
  if (type === "learn") return <BookOpen size={18} aria-hidden="true" />;
  if (type === "category") return <BarChart2 size={18} aria-hidden="true" />;
  if (type === "launch") return <Rocket size={18} aria-hidden="true" />;
  if (type === "overview") return <Activity size={18} aria-hidden="true" />;
  if (type === "related") return <ArrowRight size={18} aria-hidden="true" />;
  return <Lock size={18} aria-hidden="true" />;
}

function destinationPath(href: string): string {
  try {
    return new URL(href, typeof window === "undefined" ? "https://tokenradar.co" : window.location.href).pathname;
  } catch {
    return href;
  }
}

export function ResearchRecirculation({
  title,
  description,
  items,
  variant = "default",
  ...context
}: ResearchRecirculationProps) {
  const ref = useRef<HTMLElement | null>(null);
  const hasTrackedImpression = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || hasTrackedImpression.current || items.length === 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || hasTrackedImpression.current) return;
        hasTrackedImpression.current = true;
        trackRecirculationImpression(context, items.length);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [context.articleType, context.moduleId, context.modulePosition, context.pageType, context.sourceSection, context.tokenId, items.length]);

  if (items.length === 0) return null;

  const visibleItems = variant === "compact" || variant === "strip" ? items.slice(0, 3) : items.slice(0, 4);

  return (
    <section
      ref={ref}
      className={`research-recirculation research-recirculation-${variant}`}
      aria-labelledby={`${context.moduleId || "research-recirculation"}-title`}
    >
      <div className="research-recirculation-header">
        <div>
          <p className="eyebrow-text">Next best action</p>
          <h2 id={`${context.moduleId || "research-recirculation"}-title`}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>

      <div className="research-recirculation-grid">
        {visibleItems.map((item, index) => {
          const destination = {
            destinationType: item.type,
            destinationPath: destinationPath(item.href),
          };

          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className="research-recirculation-card"
              data-analytics-id={`recirculation-${context.moduleId}-${index + 1}`}
              data-analytics-label={item.label}
              onClick={() => {
                trackRecirculationClick(context, destination);
                if (index === 0) trackNextActionClick(context, destination);
              }}
            >
              <span className="research-recirculation-icon">
                <ItemIcon type={item.type} />
              </span>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <small>
                Open
                <ArrowRight size={14} aria-hidden="true" />
              </small>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
