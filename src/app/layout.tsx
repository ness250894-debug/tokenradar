import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { BackToOverviewToast } from "@/components/BackToOverviewToast";
import ProgressBarProvider from "@/components/ProgressBarProvider";
import { JsonLd } from "@/components/JsonLd";
import { ClickAnalytics } from "@/components/ClickAnalytics";
import { CookieConsent } from "@/components/CookieConsent";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaServiceWorker } from "@/components/PwaServiceWorker";
import { WatchlistOfflineSync } from "@/components/WatchlistOfflineSync";
import { getSiteUrl } from "@/lib/seo";
import { CONTACT_EMAIL, SOCIAL } from "@/lib/config";

const siteUrl = getSiteUrl();

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "TokenRadar",
  title: {
    default: "TokenRadar - Data-Driven Crypto Analysis & Token Research",
    template: "%s | TokenRadar",
  },
  description:
    "Unbiased, data-driven analysis for 300+ tracked and upcoming crypto tokens. Proprietary Risk Score, Growth Index, and AI-powered research updated daily.",
  keywords: [
    "crypto analysis",
    "token research",
    "price prediction",
    "cryptocurrency",
    "DeFi",
    "crypto risk score",
  ],
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "128x128", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "TokenRadar",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "TokenRadar",
    title: "TokenRadar - Data-Driven Crypto Analysis",
    description:
      "Unbiased, data-driven analysis for 300+ tracked and upcoming crypto tokens with proprietary metrics.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "TokenRadar - Data-Driven Crypto Analysis & Token Research",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TokenRadar - Data-Driven Crypto Analysis",
    description:
      "Unbiased, data-driven analysis for 300+ tracked and upcoming crypto tokens with proprietary metrics.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaMeasurementId = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "").replace(/[^A-Z0-9-]/gi, "");

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        {/* AdSense & CMP (Publisher: Place your ID below) */}
        {/* <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossOrigin="anonymous"></script> */}

        <JsonLd
          id="website-jsonld"
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "TokenRadar",
            url: siteUrl,
            description: "Unbiased, data-driven crypto analysis for 300+ tracked and upcoming tokens",
          }}
        />
        <JsonLd
          id="organization-jsonld"
          data={{
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "TokenRadar",
            url: siteUrl,
            logo: `${siteUrl}/icon.png`,
            contactPoint: [
              {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: CONTACT_EMAIL,
                url: `${siteUrl}/contact`,
                availableLanguage: "en",
              },
              {
                "@type": "ContactPoint",
                contactType: "data corrections",
                email: CONTACT_EMAIL,
                url: `${siteUrl}/contact`,
                availableLanguage: "en",
              },
              {
                "@type": "ContactPoint",
                contactType: "partnerships",
                email: CONTACT_EMAIL,
                url: `${siteUrl}/contact`,
                availableLanguage: "en",
              },
            ],
            sameAs: [
              SOCIAL.xUrl,
              SOCIAL.telegramUrl,
              SOCIAL.threadsUrl,
              SOCIAL.instagramUrl,
            ],
          }}
        />
        <JsonLd
          id="person-jsonld"
          data={{
            "@context": "https://schema.org",
            "@type": "Person",
            name: "Pavlo Nakonechnyi",
            jobTitle: "Founder & Lead Researcher",
            url: siteUrl,
            sameAs: [
              "https://www.linkedin.com/in/pavlo-nakonechnyi-633966402/",
            ],
          }}
        />
      </head>
      <body className={`${outfit.variable} ${jetbrainsMono.variable}`}>
        <ProgressBarProvider>
          <Navigation />
          <main>{children}</main>
          <Footer />
          <ScrollToTop />
          <BackToOverviewToast />
          <ClickAnalytics />
          <CookieConsent measurementId={gaMeasurementId} />
          <PwaInstallPrompt />
          <PwaServiceWorker />
          <WatchlistOfflineSync />
        </ProgressBarProvider>
      </body>
    </html>
  );
}
