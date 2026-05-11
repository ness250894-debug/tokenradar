import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact TokenRadar - Support, data corrections & partnerships",
  description:
    "Contact TokenRadar for data corrections, bug reports, product feedback, support, and partnership or advertising inquiries.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact TokenRadar - Support, data corrections & partnerships",
    description:
      "Contact TokenRadar for data corrections, bug reports, product feedback, support, and partnership or advertising inquiries.",
  },
  twitter: {
    title: "Contact TokenRadar - Support, data corrections & partnerships",
    description:
      "Contact TokenRadar for data corrections, bug reports, product feedback, support, and partnership or advertising inquiries.",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
