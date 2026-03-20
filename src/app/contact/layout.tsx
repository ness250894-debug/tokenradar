import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact TokenRadar — Support & feedback",
  description:
    "Have questions or feedback? Contact the TokenRadar team for support, partnership inquiries, or data corrections.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact TokenRadar — Support & feedback",
    description:
      "Have questions or feedback? Contact the TokenRadar team for support, partnership inquiries, or data corrections.",
  },
  twitter: {
    title: "Contact TokenRadar — Support & feedback",
    description:
      "Have questions or feedback? Contact the TokenRadar team for support, partnership inquiries, or data corrections.",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
