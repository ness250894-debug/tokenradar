import type { Metadata } from "next";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";

const PAGE_TITLE = "Contact TokenRadar: Support & Corrections";
const PAGE_DESCRIPTION =
  "Contact TokenRadar for data corrections, bug reports, product feedback, support, and partnership or advertising inquiries.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/contact",
  },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
