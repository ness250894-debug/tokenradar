import type { MetadataRoute } from "next";
import { buildRobotsPolicy } from "@/lib/robots-policy";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsPolicy();
}
