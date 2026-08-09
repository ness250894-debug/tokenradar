import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TikTok Authorization Callback",
  description: "TokenRadar TikTok authorization callback utility.",
  alternates: {
    canonical: "/tiktok/callback",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function TikTokCallbackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
