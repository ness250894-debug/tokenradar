import { cleanAnalyticsParams, normalizeAnalyticsText, trackEvent } from "@/lib/analytics";

export type DeviceHint = "mobile" | "tablet" | "desktop";

export interface EngagementContext {
  pageType: string;
  tokenId?: string;
  articleType?: string;
  moduleId?: string;
  modulePosition?: string;
  sourceSection?: string;
}

export interface DestinationContext {
  destinationType?: string;
  destinationPath?: string;
}

export function getDeviceHint(width: number): DeviceHint {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function getCurrentDeviceHint(): DeviceHint | undefined {
  if (typeof window === "undefined") return undefined;
  return getDeviceHint(window.innerWidth);
}

export function buildEngagementParams(
  context: EngagementContext,
  extra: DestinationContext & Record<string, string | number | boolean | undefined> = {},
) {
  const { destinationType, destinationPath, ...rest } = extra;

  return cleanAnalyticsParams({
    page_type: context.pageType,
    token_id: normalizeAnalyticsText(context.tokenId, 80),
    article_type: normalizeAnalyticsText(context.articleType, 80),
    module_id: normalizeAnalyticsText(context.moduleId, 80),
    module_position: normalizeAnalyticsText(context.modulePosition, 80),
    source_section: normalizeAnalyticsText(context.sourceSection, 100),
    destination_type: normalizeAnalyticsText(destinationType, 80),
    destination_path: normalizeAnalyticsText(destinationPath, 160),
    device_hint: getCurrentDeviceHint(),
    ...rest,
  });
}

export function trackRecirculationImpression(context: EngagementContext, itemCount: number): void {
  trackEvent("recirculation_impression", buildEngagementParams(context, { item_count: itemCount }));
}

export function trackRecirculationClick(
  context: EngagementContext,
  destination: Required<DestinationContext>,
): void {
  trackEvent("recirculation_click", buildEngagementParams(context, destination));
}

export function trackNextActionClick(
  context: EngagementContext,
  destination: Required<DestinationContext>,
): void {
  trackEvent("next_action_click", buildEngagementParams(context, destination));
}

export function trackArticleDepth(context: EngagementContext, depthPercent: number): void {
  trackEvent("article_depth", buildEngagementParams(context, { depth_percent: depthPercent }));
}

export function trackContentComplete(context: EngagementContext): void {
  trackEvent("content_complete", buildEngagementParams(context));
}

export function trackDirectoryFilter(
  directory: string,
  filterName: string,
  filterValue: string,
  resultsCount: number,
): void {
  trackEvent("directory_filter", cleanAnalyticsParams({
    directory,
    filter_name: filterName,
    filter_value: normalizeAnalyticsText(filterValue, 120),
    results_count: resultsCount,
    page_path: typeof window === "undefined" ? undefined : window.location.pathname,
    device_hint: getCurrentDeviceHint(),
  }));
}
