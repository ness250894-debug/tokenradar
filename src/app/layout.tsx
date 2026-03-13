import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TokenRadar — Data-Driven Crypto Analysis & Token Research",
    template: "%s | TokenRadar",
  },
  description:
    "Unbiased, data-driven analysis for 150+ crypto tokens. Proprietary Risk Score, Growth Index, and AI-powered research updated daily.",
  keywords: [
    "crypto analysis",
    "token research",
    "price prediction",
    "cryptocurrency",
    "DeFi",
    "crypto risk score",
  ],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "TokenRadar",
    title: "TokenRadar — Data-Driven Crypto Analysis",
    description:
      "Unbiased, data-driven analysis for 150+ crypto tokens with proprietary metrics.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TokenRadar — Data-Driven Crypto Analysis",
    description:
      "Unbiased, data-driven analysis for 150+ crypto tokens with proprietary metrics.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <Navigation />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
