import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { BackToOverviewToast } from "@/components/BackToOverviewToast";
import ProgressBarProvider from "@/components/ProgressBarProvider";
import Script from "next/script";

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
  title: {
    default: "TokenRadar — Data-Driven Crypto Analysis & Token Research",
    template: "%s | TokenRadar",
  },
  description:
    "Unbiased, data-driven analysis for 250+ crypto tokens. Proprietary Risk Score, Growth Index, and AI-powered research updated daily.",
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
      "Unbiased, data-driven analysis for 250+ crypto tokens with proprietary metrics.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "TokenRadar — Data-Driven Crypto Analysis & Token Research",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TokenRadar — Data-Driven Crypto Analysis",
    description:
      "Unbiased, data-driven analysis for 250+ crypto tokens with proprietary metrics.",
    images: ["/og-image.png"],
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
      <head>
        {/* AdSense & CMP (Publisher: Place your ID below) */}
        {/* <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script> */}

        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());

                gtag('config', '${(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "").replace(/[^A-Z0-9-]/gi, "")}');
              `}
            </Script>
          </>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "TokenRadar",
              "url": "https://tokenradar.co",
              "description": "Unbiased, data-driven crypto analysis for 2,000+ tokens",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://tokenradar.co/search?q={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "TokenRadar",
              "url": "https://tokenradar.co",
              "logo": "https://tokenradar.co/icon.png",
              "sameAs": [
                "https://x.com/TokenRadarCo"
              ]
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              "name": "Pavlo Nakonechnyi",
              "jobTitle": "Founder & Lead Researcher",
              "url": "https://tokenradar.co",
              "sameAs": [
                "https://www.linkedin.com/in/pavlo-nakonechnyi-633966402/"
              ]
            })
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
        </ProgressBarProvider>
      </body>
    </html>
  );
}
