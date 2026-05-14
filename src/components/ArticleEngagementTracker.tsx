"use client";

import { useEffect } from "react";

import {
  type EngagementContext,
  trackArticleDepth,
  trackContentComplete,
} from "@/lib/engagement-analytics";

const DEPTH_THRESHOLDS = [25, 50, 75, 90];

interface ArticleEngagementTrackerProps extends EngagementContext {
  selector: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ArticleEngagementTracker({
  selector,
  ...context
}: ArticleEngagementTrackerProps) {
  useEffect(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;

    const firedDepths = new Set<number>();
    let completeFired = false;
    let rafId = 0;

    const getProgress = () => {
      const rect = target.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const height = Math.max(target.scrollHeight, rect.height, 1);
      const viewportBottom = window.scrollY + window.innerHeight;
      return clamp(((viewportBottom - top) / height) * 100, 0, 100);
    };

    const checkProgress = () => {
      rafId = 0;
      const progress = getProgress();

      for (const depth of DEPTH_THRESHOLDS) {
        if (progress >= depth && !firedDepths.has(depth)) {
          firedDepths.add(depth);
          trackArticleDepth(context, depth);
        }
      }

      if (progress >= 95 && !completeFired) {
        completeFired = true;
        trackContentComplete(context);
      }
    };

    const scheduleCheck = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(checkProgress);
    };

    scheduleCheck();
    window.addEventListener("scroll", scheduleCheck, { passive: true });
    window.addEventListener("resize", scheduleCheck, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
    };
  }, [context.articleType, context.moduleId, context.modulePosition, context.pageType, context.sourceSection, context.tokenId, selector]);

  return null;
}
